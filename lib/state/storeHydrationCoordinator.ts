import { startECSPerformanceSpan } from '../performance/ecsPerformanceDiagnostics';

export const ECS_STORE_HYDRATION_DIAGNOSTICS_VERSION = 1 as const;

export type ECSStoreHydrationStatus = 'idle' | 'running' | 'ready' | 'timed_out' | 'failed';

export type ECSStoreHydrationTask = {
  id: string;
  hydrate: () => Promise<unknown> | unknown;
  dependencies?: readonly string[];
  timeoutMs?: number;
  required?: boolean;
};

export type ECSStoreHydrationTaskResult = {
  id: string;
  status: Exclude<ECSStoreHydrationStatus, 'idle' | 'running'>;
  required: boolean;
  durationMs: number;
  error: string | null;
  completedAfterTimeout: boolean;
};

export type ECSStoreHydrationPlanResult = {
  planId: string;
  status: 'ready' | 'degraded';
  startedAt: string;
  completedAt: string;
  durationMs: number;
  tasks: ECSStoreHydrationTaskResult[];
  timedOutTaskIds: string[];
  failedTaskIds: string[];
};

export type ECSStoreHydrationTaskDiagnostic = {
  id: string;
  status: ECSStoreHydrationStatus;
  attempts: number;
  joinedCalls: number;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  error: string | null;
  completedAfterTimeout: boolean;
};

export type ECSStoreHydrationDiagnostics = {
  schemaVersion: typeof ECS_STORE_HYDRATION_DIAGNOSTICS_VERSION;
  activePlans: number;
  activeTasks: number;
  cyclePreventionCount: number;
  tasks: ECSStoreHydrationTaskDiagnostic[];
};

type HydrationListener = (diagnostics: ECSStoreHydrationDiagnostics) => void;

type CoordinatorOptions = {
  now?: () => number;
  defaultTimeoutMs?: number;
};

type HydrationTaskFlight = {
  generation: number;
  result: Promise<ECSStoreHydrationTaskResult>;
};

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? 'Unknown hydration error');
  return message.replace(/[\r\n\t]+/g, ' ').slice(0, 180);
}

function safeTaskId(value: string): string {
  return value.trim().replace(/[^a-z0-9_.:-]/gi, '_').slice(0, 80) || 'unknown_store';
}

export class ECSStoreHydrationCoordinator {
  private readonly now: () => number;
  private readonly defaultTimeoutMs: number;
  private readonly taskFlights = new Map<string, HydrationTaskFlight>();
  private readonly completedTasks = new Map<string, ECSStoreHydrationTaskResult>();
  private readonly planFlights = new Map<string, Promise<ECSStoreHydrationPlanResult>>();
  private readonly diagnostics = new Map<string, ECSStoreHydrationTaskDiagnostic>();
  private readonly listeners = new Set<HydrationListener>();
  private cyclePreventionCount = 0;
  private nextTaskGeneration = 1;

  constructor(options: CoordinatorOptions = {}) {
    this.now = options.now ?? Date.now;
    this.defaultTimeoutMs = Math.max(50, options.defaultTimeoutMs ?? 3_000);
  }

  runPlan(input: {
    id: string;
    tasks: readonly ECSStoreHydrationTask[];
  }): Promise<ECSStoreHydrationPlanResult> {
    const planId = safeTaskId(input.id);
    const existing = this.planFlights.get(planId);
    if (existing) return existing;

    const flight = this.executePlan(planId, input.tasks).finally(() => {
      if (this.planFlights.get(planId) === flight) {
        this.planFlights.delete(planId);
      }
      this.notify();
    });
    this.planFlights.set(planId, flight);
    this.notify();
    return flight;
  }

  private async executePlan(
    planId: string,
    tasks: readonly ECSStoreHydrationTask[],
  ): Promise<ECSStoreHydrationPlanResult> {
    const startedAtMs = this.now();
    const startedAt = new Date().toISOString();
    const taskMap = new Map<string, ECSStoreHydrationTask>();
    const invalidResults: ECSStoreHydrationTaskResult[] = [];

    tasks.forEach((task) => {
      const id = safeTaskId(task.id);
      if (taskMap.has(id)) {
        invalidResults.push({
          id,
          status: 'failed',
          required: task.required !== false,
          durationMs: 0,
          error: `Duplicate hydration task: ${id}`,
          completedAfterTimeout: false,
        });
        return;
      }
      taskMap.set(id, { ...task, id });
    });

    const visiting = new Set<string>();
    const visited = new Set<string>();
    const cycleTaskIds = new Set<string>();
    const visit = (id: string, path: string[]) => {
      if (visited.has(id)) return;
      if (visiting.has(id)) {
        const cycleStart = path.indexOf(id);
        path.slice(cycleStart < 0 ? 0 : cycleStart).forEach((taskId) => cycleTaskIds.add(taskId));
        cycleTaskIds.add(id);
        return;
      }
      visiting.add(id);
      const task = taskMap.get(id);
      (task?.dependencies ?? []).forEach((dependencyId) => {
        const normalized = safeTaskId(dependencyId);
        if (taskMap.has(normalized)) visit(normalized, [...path, id]);
      });
      visiting.delete(id);
      visited.add(id);
    };
    Array.from(taskMap.keys()).forEach((id) => visit(id, []));
    if (cycleTaskIds.size > 0) {
      this.cyclePreventionCount += 1;
      cycleTaskIds.forEach((id) => {
        invalidResults.push(this.completeTask(id, {
          id,
          status: 'failed',
          required: taskMap.get(id)?.required !== false,
          durationMs: 0,
          error: 'Hydration dependency cycle prevented.',
          completedAfterTimeout: false,
        }));
      });
    }

    const taskResults = await Promise.all(
      Array.from(taskMap.values())
        .filter((task) => !cycleTaskIds.has(task.id))
        .map((task) => this.runTask(task, taskMap, [])),
    );
    const results = [...taskResults, ...invalidResults];
    const completedAtMs = this.now();
    const failedTaskIds = results.filter((result) => result.status === 'failed').map((result) => result.id);
    const timedOutTaskIds = results.filter((result) => result.status === 'timed_out').map((result) => result.id);
    const requiredDegraded = results.some((result) => (
      result.required && (result.status === 'failed' || result.status === 'timed_out')
    ));

    return {
      planId,
      status: requiredDegraded ? 'degraded' : 'ready',
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Math.max(0, Math.round((completedAtMs - startedAtMs) * 10) / 10),
      tasks: results,
      timedOutTaskIds,
      failedTaskIds,
    };
  }

  private runTask(
    task: ECSStoreHydrationTask,
    taskMap: ReadonlyMap<string, ECSStoreHydrationTask>,
    ancestry: readonly string[],
  ): Promise<ECSStoreHydrationTaskResult> {
    const id = safeTaskId(task.id);
    const completed = this.completedTasks.get(id);
    if (completed?.status === 'ready') return Promise.resolve(completed);

    if (ancestry.includes(id)) {
      this.cyclePreventionCount += 1;
      const cycle = [...ancestry, id].join(' -> ');
      const failed = this.finishDiagnostic(id, {
        id,
        status: 'failed',
        required: task.required !== false,
        durationMs: 0,
        error: `Hydration dependency cycle prevented: ${cycle}`,
        completedAfterTimeout: false,
      });
      this.completedTasks.set(id, failed);
      return Promise.resolve(failed);
    }

    const existing = this.taskFlights.get(id);
    if (existing) {
      const diagnostic = this.ensureDiagnostic(id);
      diagnostic.joinedCalls += 1;
      this.notify();
      return existing.result;
    }

    const generation = this.nextTaskGeneration++;
    let underlyingSettled = false;
    let resultSettled = false;
    const releaseFlightIfSettled = () => {
      if (!underlyingSettled || !resultSettled) return;
      const current = this.taskFlights.get(id);
      if (current?.generation !== generation) return;
      this.taskFlights.delete(id);
      this.notify();
    };
    const markUnderlyingSettled = () => {
      underlyingSettled = true;
      releaseFlightIfSettled();
    };
    const result = this.executeTask(
      task,
      taskMap,
      ancestry,
      generation,
      markUnderlyingSettled,
    );
    this.taskFlights.set(id, { generation, result });
    void result.then(
      () => {
        resultSettled = true;
        releaseFlightIfSettled();
      },
      () => {
        resultSettled = true;
        markUnderlyingSettled();
      },
    );
    return result;
  }

  private async executeTask(
    task: ECSStoreHydrationTask,
    taskMap: ReadonlyMap<string, ECSStoreHydrationTask>,
    ancestry: readonly string[],
    generation: number,
    markUnderlyingSettled: () => void,
  ): Promise<ECSStoreHydrationTaskResult> {
    const id = safeTaskId(task.id);
    const required = task.required !== false;
    const startedAtMs = this.now();
    const diagnostic = this.ensureDiagnostic(id);
    diagnostic.status = 'running';
    diagnostic.attempts += 1;
    diagnostic.startedAt = new Date().toISOString();
    diagnostic.completedAt = null;
    diagnostic.durationMs = null;
    diagnostic.error = null;
    diagnostic.completedAfterTimeout = false;
    this.notify();

    const dependencies = task.dependencies ?? [];
    for (const dependencyIdInput of dependencies) {
      const dependencyId = safeTaskId(dependencyIdInput);
      const dependency = taskMap.get(dependencyId);
      if (!dependency) {
        markUnderlyingSettled();
        return this.completeTask(id, {
          id,
          status: 'failed',
          required,
          durationMs: Math.max(0, this.now() - startedAtMs),
          error: `Missing hydration dependency: ${dependencyId}`,
          completedAfterTimeout: false,
        });
      }
      const dependencyResult = await this.runTask(dependency, taskMap, [...ancestry, id]);
      if (!this.isCurrentTaskGeneration(id, generation)) {
        markUnderlyingSettled();
        return {
          id,
          status: 'failed',
          required,
          durationMs: Math.max(0, this.now() - startedAtMs),
          error: 'Hydration task generation superseded.',
          completedAfterTimeout: false,
        };
      }
      if (dependencyResult.status !== 'ready' && dependencyResult.required) {
        markUnderlyingSettled();
        return this.completeTask(id, {
          id,
          status: 'failed',
          required,
          durationMs: Math.max(0, this.now() - startedAtMs),
          error: `Required hydration dependency ${dependencyId} is ${dependencyResult.status}.`,
          completedAfterTimeout: false,
        }, generation);
      }
    }

    const span = startECSPerformanceSpan('cold_startup_shell', `hydrate_${id}`, {
      trackOutstanding: true,
      metadata: { required },
    });
    const timeoutMs = Math.max(50, task.timeoutMs ?? this.defaultTimeoutMs);
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let timedOut = false;

    const underlying = Promise.resolve().then(task.hydrate);
    underlying.then(() => {
      if (!timedOut || !this.isCurrentTaskGeneration(id, generation)) return;
      const lateResult: ECSStoreHydrationTaskResult = {
        id,
        status: 'ready',
        required,
        durationMs: Math.max(0, Math.round((this.now() - startedAtMs) * 10) / 10),
        error: null,
        completedAfterTimeout: true,
      };
      this.completeTask(id, lateResult, generation);
    }).catch(() => {
      // The raced result records the failure; this handler prevents an unhandled late rejection.
    });
    void underlying.then(markUnderlyingSettled, markUnderlyingSettled);

    const timeoutResult = new Promise<ECSStoreHydrationTaskResult>((resolve) => {
      timeout = setTimeout(() => {
        timedOut = true;
        span.end('cancelled', { timeoutMs });
        resolve({
          id,
          status: 'timed_out',
          required,
          durationMs: Math.max(0, Math.round((this.now() - startedAtMs) * 10) / 10),
          error: `Hydration timed out after ${timeoutMs}ms.`,
          completedAfterTimeout: false,
        });
      }, timeoutMs);
    });

    const result = await Promise.race([
      underlying.then<ECSStoreHydrationTaskResult>(() => {
        if (!timedOut) span.end('completed');
        return {
          id,
          status: 'ready',
          required,
          durationMs: Math.max(0, Math.round((this.now() - startedAtMs) * 10) / 10),
          error: null,
          completedAfterTimeout: false,
        };
      }).catch<ECSStoreHydrationTaskResult>((error) => {
        if (!timedOut) span.end('failed');
        return {
          id,
          status: 'failed',
          required,
          durationMs: Math.max(0, Math.round((this.now() - startedAtMs) * 10) / 10),
          error: sanitizeError(error),
          completedAfterTimeout: false,
        };
      }),
      timeoutResult,
    ]);

    if (timeout) clearTimeout(timeout);
    return this.completeTask(id, result, generation);
  }

  private isCurrentTaskGeneration(id: string, generation: number): boolean {
    return this.taskFlights.get(id)?.generation === generation;
  }

  private ensureDiagnostic(id: string): ECSStoreHydrationTaskDiagnostic {
    const existing = this.diagnostics.get(id);
    if (existing) return existing;
    const diagnostic: ECSStoreHydrationTaskDiagnostic = {
      id,
      status: 'idle',
      attempts: 0,
      joinedCalls: 0,
      startedAt: null,
      completedAt: null,
      durationMs: null,
      error: null,
      completedAfterTimeout: false,
    };
    this.diagnostics.set(id, diagnostic);
    return diagnostic;
  }

  private finishDiagnostic(
    id: string,
    result: ECSStoreHydrationTaskResult,
  ): ECSStoreHydrationTaskResult {
    const diagnostic = this.ensureDiagnostic(id);
    diagnostic.status = result.status;
    diagnostic.completedAt = new Date().toISOString();
    diagnostic.durationMs = result.durationMs;
    diagnostic.error = result.error;
    diagnostic.completedAfterTimeout = result.completedAfterTimeout;
    this.notify();
    return result;
  }

  private completeTask(
    id: string,
    result: ECSStoreHydrationTaskResult,
    generation?: number,
  ): ECSStoreHydrationTaskResult {
    if (generation != null && !this.isCurrentTaskGeneration(id, generation)) {
      return result;
    }
    const completed = this.finishDiagnostic(id, result);
    this.completedTasks.set(id, completed);
    return completed;
  }

  subscribe(listener: HydrationListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getDiagnostics(): ECSStoreHydrationDiagnostics {
    return {
      schemaVersion: ECS_STORE_HYDRATION_DIAGNOSTICS_VERSION,
      activePlans: this.planFlights.size,
      activeTasks: Array.from(this.diagnostics.values()).filter((item) => item.status === 'running').length,
      cyclePreventionCount: this.cyclePreventionCount,
      tasks: Array.from(this.diagnostics.values()).map((item) => ({ ...item })),
    };
  }

  resetForTests(): void {
    this.taskFlights.clear();
    this.completedTasks.clear();
    this.planFlights.clear();
    this.diagnostics.clear();
    this.cyclePreventionCount = 0;
    this.notify();
  }

  private notify(): void {
    if (this.listeners.size === 0) return;
    const snapshot = this.getDiagnostics();
    this.listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch {}
    });
  }
}

export const ecsStoreHydrationCoordinator = new ECSStoreHydrationCoordinator();
