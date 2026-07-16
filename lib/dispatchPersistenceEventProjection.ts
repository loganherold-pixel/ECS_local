import { dispatchEventStore } from './dispatchEventStore';
import type { DispatchEvent } from './dispatchLiveEvents';
import {
  dispatchPersistenceAdapter,
  type DispatchPersistenceDefaults,
} from './dispatchPersistenceAdapter';
import { isRecoveryCriticalDispatchEvent } from './dispatchRecoveryMapModel';

export const LOCAL_DISPATCH_PERSISTENCE_ID = 'local-dispatch-channel';

type DispatchPersistenceProjectionSource = Pick<
  typeof dispatchPersistenceAdapter,
  'getRevision' | 'load' | 'subscribe'
>;

type DispatchPersistenceProjectionTarget = Pick<
  typeof dispatchEventStore,
  'getSnapshot' | 'replaceEvents'
>;

export type DispatchPersistenceProjectionLease = {
  projectNow(): boolean;
  unsubscribe(): void;
};

let activeProjectionLeaseCount = 0;
let publishedProjectionRevision = 0;
let latestProjectionEvent = {
  revision: 0,
  reason: 'none' as 'none' | 'initial' | 'persistence' | 'manual',
  sourceRevision: null as number | null,
  visibleStateChanged: false,
  completedAt: null as string | null,
};

export function getDispatchPersistenceProjectionDiagnostics() {
  return {
    activeLeaseCount: activeProjectionLeaseCount,
    publishedRevision: publishedProjectionRevision,
    latestProducerEvent: { ...latestProjectionEvent },
  };
}

export function isPersistableLocalDispatchEvent(event: DispatchEvent): boolean {
  if (isRecoveryCriticalDispatchEvent(event)) return true;
  return event.source === 'user_report' || event.source === 'team_member';
}

function normalizedIdentity(value: string | null | undefined): string | null {
  const normalized = String(value ?? '').trim();
  return normalized.length > 0 ? normalized : null;
}

export function resolveDispatchLocalPersistenceId(input: {
  currentExpedition?: {
    cloudSessionId?: string | null;
    id?: string | null;
  } | null;
  activeConvoyId?: string | null;
  accountId?: string | null;
}): string {
  const liveExpeditionId = normalizedIdentity(input.currentExpedition?.cloudSessionId)
    ?? normalizedIdentity(input.currentExpedition?.id);
  if (liveExpeditionId) return liveExpeditionId;

  const activeConvoyId = normalizedIdentity(input.activeConvoyId);
  if (activeConvoyId) return activeConvoyId;

  const accountScope = normalizedIdentity(input.accountId) ?? 'signed-out';
  return `${LOCAL_DISPATCH_PERSISTENCE_ID}:account:${encodeURIComponent(accountScope)}`;
}

export function subscribeDispatchPersistenceCadEvents(input: {
  expeditionId: string;
  defaults: DispatchPersistenceDefaults;
  source?: DispatchPersistenceProjectionSource;
  target?: DispatchPersistenceProjectionTarget;
}): DispatchPersistenceProjectionLease {
  const expeditionId = normalizedIdentity(input.expeditionId);
  const source = input.source ?? dispatchPersistenceAdapter;
  const target = input.target ?? dispatchEventStore;
  let closed = false;
  let lastProjectedRevision: number | null = null;
  activeProjectionLeaseCount += 1;

  const project = (reason: 'initial' | 'persistence' | 'manual'): boolean => {
    if (closed || !expeditionId) return false;
    const revision = source.getRevision(expeditionId);
    if (lastProjectedRevision === revision) return false;

    const persisted = source.load(expeditionId, input.defaults);
    const currentEvents = target.getSnapshot();
    const nextEvents = [
      ...currentEvents.filter((event) => !isPersistableLocalDispatchEvent(event)),
      ...persisted.cadEvents.filter(isPersistableLocalDispatchEvent),
    ];
    const beforeProjection = target.getSnapshot();
    target.replaceEvents(nextEvents);
    lastProjectedRevision = revision;
    const visibleStateChanged = target.getSnapshot() !== beforeProjection;
    publishedProjectionRevision += 1;
    latestProjectionEvent = {
      revision: publishedProjectionRevision,
      reason,
      sourceRevision: revision,
      visibleStateChanged,
      completedAt: new Date().toISOString(),
    };
    return visibleStateChanged;
  };

  const releaseSource = expeditionId
    ? source.subscribe((changedExpeditionId) => {
        if (!closed && changedExpeditionId === expeditionId) project('persistence');
      })
    : () => undefined;
  project('initial');

  return {
    projectNow: () => project('manual'),
    unsubscribe() {
      if (closed) return;
      closed = true;
      activeProjectionLeaseCount = Math.max(0, activeProjectionLeaseCount - 1);
      releaseSource();
    },
  };
}
