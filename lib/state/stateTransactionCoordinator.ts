export const ECS_STATE_TRANSACTION_DIAGNOSTICS_VERSION = 1 as const;

export type ECSStateTransactionAction =
  | 'active_vehicle_switch'
  | 'expedition_start'
  | 'route_activation'
  | 'expedition_completion'
  | 'logout'
  | 'offline_replay';

export type ECSStateTransactionRecord = {
  action: ECSStateTransactionAction;
  key: string;
  status: 'committed' | 'rolled_back' | 'failed';
  startedAt: string;
  completedAt: string;
  durationMs: number;
  rollbackAttempted: boolean;
  error: string | null;
};

export type ECSStateTransactionDiagnostics = {
  schemaVersion: typeof ECS_STATE_TRANSACTION_DIAGNOSTICS_VERSION;
  activeCount: number;
  joinedCount: number;
  history: ECSStateTransactionRecord[];
};

type TransactionInput<T, S> = {
  action: ECSStateTransactionAction;
  idempotencyKey: string;
  captureSnapshot?: () => S | Promise<S>;
  execute: () => T | Promise<T>;
  rollback?: (snapshot: S) => void | Promise<void>;
};

function safeKey(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `tx_${(hash >>> 0).toString(36)}`;
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error ?? 'State transaction failed'))
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 160);
}

export class ECSStateTransactionCoordinator {
  private readonly flights = new Map<string, Promise<unknown>>();
  private readonly history: ECSStateTransactionRecord[] = [];
  private joinedCount = 0;

  run<T, S = undefined>(input: TransactionInput<T, S>): Promise<T> {
    const internalKey = `${input.action}:${safeKey(input.idempotencyKey)}`;
    const existing = this.flights.get(internalKey) as Promise<T> | undefined;
    if (existing) {
      this.joinedCount += 1;
      return existing;
    }

    const startedAtMs = Date.now();
    const startedAt = new Date().toISOString();
    const flight = (async () => {
      let snapshot: S | undefined;
      let rollbackAttempted = false;
      try {
        snapshot = input.captureSnapshot ? await input.captureSnapshot() : undefined;
        const value = await input.execute();
        this.record({
          action: input.action,
          key: safeKey(input.idempotencyKey),
          status: 'committed',
          startedAt,
          completedAt: new Date().toISOString(),
          durationMs: Math.max(0, Date.now() - startedAtMs),
          rollbackAttempted: false,
          error: null,
        });
        return value;
      } catch (error) {
        let rolledBack = false;
        if (input.rollback && snapshot !== undefined) {
          rollbackAttempted = true;
          try {
            await input.rollback(snapshot);
            rolledBack = true;
          } catch {
            rolledBack = false;
          }
        }
        this.record({
          action: input.action,
          key: safeKey(input.idempotencyKey),
          status: rolledBack ? 'rolled_back' : 'failed',
          startedAt,
          completedAt: new Date().toISOString(),
          durationMs: Math.max(0, Date.now() - startedAtMs),
          rollbackAttempted,
          error: safeError(error),
        });
        throw error;
      }
    })().finally(() => {
      this.flights.delete(internalKey);
    });

    this.flights.set(internalKey, flight);
    return flight;
  }

  getDiagnostics(): ECSStateTransactionDiagnostics {
    return {
      schemaVersion: ECS_STATE_TRANSACTION_DIAGNOSTICS_VERSION,
      activeCount: this.flights.size,
      joinedCount: this.joinedCount,
      history: this.history.map((entry) => ({ ...entry })),
    };
  }

  resetForTests(): void {
    this.flights.clear();
    this.history.length = 0;
    this.joinedCount = 0;
  }

  private record(entry: ECSStateTransactionRecord): void {
    this.history.push(entry);
    if (this.history.length > 64) this.history.splice(0, this.history.length - 64);
  }
}

export const ecsStateTransactionCoordinator = new ECSStateTransactionCoordinator();
