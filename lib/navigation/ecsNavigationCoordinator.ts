import { normalizeECSRoutePath } from '../routeManifest';

export type ECSNavigationMethod = 'push' | 'replace' | 'navigate' | 'back';
export type ECSNavigationAcquireStatus = 'accepted' | 'duplicate' | 'busy' | 'same_route';

export interface ECSNavigationRequest {
  targetPath: string;
  sourcePath?: string | null;
  method: ECSNavigationMethod;
  settleOnAnyPath?: boolean;
}

export interface ECSNavigationAttempt {
  accepted: boolean;
  status: ECSNavigationAcquireStatus;
  token: number | null;
  targetPath: string;
}

type ActiveNavigation = {
  token: number;
  targetPath: string;
  sourcePath: string | null;
  method: ECSNavigationMethod;
  settleOnAnyPath: boolean;
  startedAtMs: number;
};

const NAVIGATION_LOCK_TIMEOUT_MS = 1_500;
let sequence = 0;
let activeNavigation: ActiveNavigation | null = null;

function isExpired(nowMs: number): boolean {
  return Boolean(activeNavigation && nowMs - activeNavigation.startedAtMs >= NAVIGATION_LOCK_TIMEOUT_MS);
}

export function acquireECSNavigation(
  request: ECSNavigationRequest,
  nowMs = Date.now(),
): ECSNavigationAttempt {
  const targetPath = normalizeECSRoutePath(request.targetPath);
  const sourcePath = request.sourcePath ? normalizeECSRoutePath(request.sourcePath) : null;
  if (sourcePath && sourcePath === targetPath && request.method !== 'back') {
    return { accepted: false, status: 'same_route', token: null, targetPath };
  }
  if (isExpired(nowMs)) activeNavigation = null;
  if (activeNavigation) {
    const duplicate = activeNavigation.targetPath === targetPath && activeNavigation.method === request.method;
    return {
      accepted: false,
      status: duplicate ? 'duplicate' : 'busy',
      token: activeNavigation.token,
      targetPath,
    };
  }

  sequence += 1;
  activeNavigation = {
    token: sequence,
    targetPath,
    sourcePath,
    method: request.method,
    settleOnAnyPath: request.settleOnAnyPath === true,
    startedAtMs: nowMs,
  };
  return { accepted: true, status: 'accepted', token: sequence, targetPath };
}

export function settleECSNavigation(path: string | null | undefined): boolean {
  if (!activeNavigation) return false;
  const normalized = normalizeECSRoutePath(path);
  const reachedTarget = normalized === activeNavigation.targetPath;
  const reachedAnyDestination = activeNavigation.settleOnAnyPath && (
    !activeNavigation.sourcePath || normalized !== activeNavigation.sourcePath
  );
  if (!reachedTarget && !reachedAnyDestination) return false;
  activeNavigation = null;
  return true;
}

export function cancelECSNavigation(token?: number | null): boolean {
  if (!activeNavigation) return false;
  if (token != null && activeNavigation.token !== token) return false;
  activeNavigation = null;
  return true;
}

export function getECSNavigationSnapshot(nowMs = Date.now()): ActiveNavigation | null {
  if (isExpired(nowMs)) activeNavigation = null;
  return activeNavigation ? { ...activeNavigation } : null;
}

export function resetECSNavigationCoordinatorForTests(): void {
  activeNavigation = null;
  sequence = 0;
}
