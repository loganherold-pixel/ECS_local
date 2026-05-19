import type { OperatorInfo } from '../auth';
import { resolveEcsAccessState } from './accessResolver';

function normalizeEmail(email: string | null | undefined): string | null {
  if (!email || typeof email !== 'string') return null;
  const normalized = email.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function resolveCachedOperatorAccessSnapshot(params: {
  snapshot: OperatorInfo | null;
  currentUserEmail: string | null | undefined;
  isOnline: boolean;
}): OperatorInfo | null {
  const { snapshot, currentUserEmail, isOnline } = params;
  if (!snapshot) return null;

  const snapshotEmail = normalizeEmail(snapshot.email);
  const userEmail = normalizeEmail(currentUserEmail);
  if (!snapshotEmail || !userEmail || snapshotEmail !== userEmail) {
    return null;
  }

  const access = resolveEcsAccessState({
    operatorInfo: snapshot,
    authenticated: true,
    isOnline,
  });

  if (hasReusableCachedAccess(snapshot, access)) {
    return snapshot;
  }

  return null;
}

function hasReusableCachedAccess(
  snapshot: OperatorInfo,
  access: ReturnType<typeof resolveEcsAccessState>,
): boolean {
  if (access.suspended || snapshot.status === 'suspended') return false;

  if (access.role === 'admin' || access.role === 'friends_and_family') {
    return access.accessState === 'active';
  }

  if (access.rawEntitlementStatus !== 'pro_active' && access.rawEntitlementStatus !== 'grace') {
    return false;
  }

  if (access.accessState === 'active') {
    return true;
  }

  return access.accessState === 'pending_sync' &&
    typeof snapshot.last_verified_at === 'string' &&
    snapshot.last_verified_at.trim().length > 0;
}

export function canReuseOperatorInfoSnapshot(params: {
  snapshot: OperatorInfo | null;
  currentUserEmail: string | null | undefined;
  isOnline: boolean;
}): boolean {
  return resolveCachedOperatorAccessSnapshot(params) !== null;
}
