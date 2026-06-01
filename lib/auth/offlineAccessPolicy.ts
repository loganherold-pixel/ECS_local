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

  if (
    access.hasFullAccess ||
    access.accessState === 'pending_sync' ||
    access.role !== 'standard'
  ) {
    return snapshot;
  }

  return snapshot;
}

export function canReuseOperatorInfoSnapshot(params: {
  snapshot: OperatorInfo | null;
  currentUserEmail: string | null | undefined;
  isOnline: boolean;
}): boolean {
  return resolveCachedOperatorAccessSnapshot(params) !== null;
}
