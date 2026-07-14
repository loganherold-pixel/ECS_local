import {
  BLU_SCAN_COOLDOWN_MS,
  BLU_SCAN_WINDOW_MS,
} from './bluPerformanceConfig';

export type UnifiedScannerSessionState = 'preflighting' | 'scanning' | 'cancelling' | 'completed';
export type UnifiedScannerCancelReason = 'manual' | 'timeout' | 'background' | 'unmount' | 'superseded';

export type UnifiedScannerPermissionPreflight = {
  allowed: boolean;
  reason?: string | null;
};

export type UnifiedScannerSession = {
  id: number;
  startedAt: number;
  deadlineAt: number;
  durationMs: number;
  signal: AbortSignal;
  state: UnifiedScannerSessionState;
};

export type UnifiedScannerRequestResult =
  | { started: true; session: UnifiedScannerSession }
  | { started: false; reason: 'already_scanning' | 'cooldown' | 'app_not_active' | 'permission_denied'; detail: string | null };

export type UnifiedScannerCoordinatorOptions = {
  minDurationMs?: number;
  maxDurationMs?: number;
  cooldownMs?: number;
  cleanupGraceMs?: number;
  now?: () => number;
  onCancel?: (reason: UnifiedScannerCancelReason) => void | Promise<void>;
};

type MutableSession = UnifiedScannerSession & {
  controller: AbortController;
  timeout: ReturnType<typeof setTimeout> | null;
};

const DEFAULT_MIN_DURATION_MS = 5_000;
const DEFAULT_MAX_DURATION_MS = 30_000;
const DEFAULT_CLEANUP_GRACE_MS = 2_500;

export class UnifiedScannerCoordinator {
  private readonly minDurationMs: number;
  private readonly maxDurationMs: number;
  private readonly cooldownMs: number;
  private readonly cleanupGraceMs: number;
  private readonly now: () => number;
  private readonly onCancel?: UnifiedScannerCoordinatorOptions['onCancel'];
  private active: MutableSession | null = null;
  private lastFinishedAt: number | null = null;
  private sequence = 0;

  constructor(options: UnifiedScannerCoordinatorOptions = {}) {
    this.minDurationMs = options.minDurationMs ?? DEFAULT_MIN_DURATION_MS;
    this.maxDurationMs = options.maxDurationMs ?? DEFAULT_MAX_DURATION_MS;
    this.cooldownMs = options.cooldownMs ?? BLU_SCAN_COOLDOWN_MS;
    this.cleanupGraceMs = options.cleanupGraceMs ?? DEFAULT_CLEANUP_GRACE_MS;
    this.now = options.now ?? Date.now;
    this.onCancel = options.onCancel;
  }

  async requestSession(input: {
    appState?: string | null;
    durationMs?: number;
    permissionPreflight?: () => Promise<UnifiedScannerPermissionPreflight>;
  } = {}): Promise<UnifiedScannerRequestResult> {
    if (this.active) {
      return { started: false, reason: 'already_scanning', detail: null };
    }
    if (input.appState && input.appState !== 'active') {
      return { started: false, reason: 'app_not_active', detail: input.appState };
    }

    const now = this.now();
    if (this.lastFinishedAt != null && now - this.lastFinishedAt < this.cooldownMs) {
      return {
        started: false,
        reason: 'cooldown',
        detail: String(this.cooldownMs - (now - this.lastFinishedAt)),
      };
    }

    const durationMs = Math.max(
      this.minDurationMs,
      Math.min(input.durationMs ?? BLU_SCAN_WINDOW_MS, this.maxDurationMs),
    );
    const controller = new AbortController();
    const session: MutableSession = {
      id: ++this.sequence,
      startedAt: now,
      deadlineAt: now + durationMs + this.cleanupGraceMs,
      durationMs,
      signal: controller.signal,
      state: input.permissionPreflight ? 'preflighting' : 'scanning',
      controller,
      timeout: null,
    };
    this.active = session;

    if (input.permissionPreflight) {
      let preflight: UnifiedScannerPermissionPreflight;
      try {
        preflight = await input.permissionPreflight();
      } catch (error) {
        preflight = {
          allowed: false,
          reason: error instanceof Error ? error.message : String(error ?? 'Permission preflight failed.'),
        };
      }
      if (!this.isCurrent(session.id)) {
        return { started: false, reason: 'already_scanning', detail: 'preflight_cancelled' };
      }
      if (!preflight.allowed) {
        this.finish(session.id);
        return { started: false, reason: 'permission_denied', detail: preflight.reason ?? null };
      }
      session.state = 'scanning';
    }

    session.timeout = setTimeout(() => {
      void this.cancel('timeout', session.id);
    }, durationMs + this.cleanupGraceMs);
    const unref = session.timeout as unknown as { unref?: () => void };
    unref.unref?.();
    return { started: true, session: this.snapshot(session) };
  }

  isCurrent(sessionId: number): boolean {
    return this.active?.id === sessionId && !this.active.signal.aborted;
  }

  isScanning(): boolean {
    return this.active?.state === 'scanning';
  }

  getActiveSession(): UnifiedScannerSession | null {
    return this.active ? this.snapshot(this.active) : null;
  }

  complete(sessionId: number): boolean {
    if (!this.active || this.active.id !== sessionId) return false;
    this.active.state = 'completed';
    this.finish(sessionId);
    return true;
  }

  async cancel(reason: UnifiedScannerCancelReason, sessionId?: number): Promise<boolean> {
    if (!this.active || (sessionId != null && this.active.id !== sessionId)) return false;
    const active = this.active;
    active.state = 'cancelling';
    active.controller.abort(reason);
    try {
      await this.onCancel?.(reason);
    } finally {
      this.finish(active.id);
    }
    return true;
  }

  resetForTests(): void {
    if (this.active?.timeout) clearTimeout(this.active.timeout);
    this.active?.controller.abort('reset');
    this.active = null;
    this.lastFinishedAt = null;
    this.sequence = 0;
  }

  private finish(sessionId: number): void {
    if (!this.active || this.active.id !== sessionId) return;
    if (this.active.timeout) clearTimeout(this.active.timeout);
    this.active.timeout = null;
    this.active = null;
    this.lastFinishedAt = this.now();
  }

  private snapshot(session: MutableSession): UnifiedScannerSession {
    return {
      id: session.id,
      startedAt: session.startedAt,
      deadlineAt: session.deadlineAt,
      durationMs: session.durationMs,
      signal: session.signal,
      state: session.state,
    };
  }
}
