export type BadgeUnlockSafetyReason =
  | 'app_inactive'
  | 'active_navigation'
  | 'active_expedition'
  | 'active_incident_or_recovery'
  | 'critical_interaction'
  | 'critical_route'
  | 'unavailable_surface';

export type BadgeUnlockSafetyInput = {
  appIsActive: boolean;
  navigationIsActive: boolean;
  expeditionIsActive: boolean;
  incidentOrRecoveryIsActive: boolean;
  criticalInteractionIsActive: boolean;
  pathname?: string | null;
};

export type BadgeUnlockSafetyState = {
  blockingPresentationAllowed: boolean;
  reason: BadgeUnlockSafetyReason | null;
};

const CRITICAL_ROUTE_PREFIXES = [
  '/active-trip',
  '/navigate-run',
  '/offline-incident-packet',
  '/vehicle-display',
] as const;

const NON_OPERATIONAL_EXACT_ROUTES = new Set([
  '/',
  '/auth-info',
  '/create-access-key',
  '/initialize',
  '/join-expedition',
  '/login',
  '/pro',
  '/setup',
]);

export function resolveBadgeUnlockSafety(input: BadgeUnlockSafetyInput): BadgeUnlockSafetyState {
  if (!input.appIsActive) return { blockingPresentationAllowed: false, reason: 'app_inactive' };
  if (input.incidentOrRecoveryIsActive) {
    return { blockingPresentationAllowed: false, reason: 'active_incident_or_recovery' };
  }
  if (input.criticalInteractionIsActive) {
    return { blockingPresentationAllowed: false, reason: 'critical_interaction' };
  }
  if (input.navigationIsActive) {
    return { blockingPresentationAllowed: false, reason: 'active_navigation' };
  }
  if (input.expeditionIsActive) {
    return { blockingPresentationAllowed: false, reason: 'active_expedition' };
  }
  const pathname = String(input.pathname ?? '').toLowerCase();
  if (NON_OPERATIONAL_EXACT_ROUTES.has(pathname) || pathname.startsWith('/expedition-channel/join/')) {
    return { blockingPresentationAllowed: false, reason: 'unavailable_surface' };
  }
  if (CRITICAL_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return { blockingPresentationAllowed: false, reason: 'critical_route' };
  }
  return { blockingPresentationAllowed: true, reason: null };
}

const criticalInteractionIds = new Set<string>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export const badgeUnlockCriticalInteractionStore = {
  getSnapshot(): string {
    return Array.from(criticalInteractionIds).sort().join('|');
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  setActive(id: string, active: boolean): void {
    const normalizedId = id.trim();
    if (!normalizedId) return;
    const changed = active
      ? !criticalInteractionIds.has(normalizedId)
      : criticalInteractionIds.has(normalizedId);
    if (!changed) return;
    if (active) criticalInteractionIds.add(normalizedId);
    else criticalInteractionIds.delete(normalizedId);
    emit();
  },

  clearForTests(): void {
    if (criticalInteractionIds.size === 0) return;
    criticalInteractionIds.clear();
    emit();
  },
};
