import { useEffect, useMemo, useState } from 'react';

import { connectivity } from '../../../lib/connectivity';
import { dispatchEventStore } from '../../../lib/dispatchEventStore';
import type { DispatchEvent } from '../../../lib/dispatchLiveEvents';
import {
  useExpeditionReadinessState,
} from '../../../lib/readiness/expeditionReadinessSelectors';
import {
  normalizeExpeditionReadinessCommandData,
  type ExpeditionReadinessCommandData,
} from '../../../lib/navigation/expeditionReadinessCommandData';

export type UseExpeditionReadinessDataOptions = {
  enabled?: boolean;
};

function useDispatchEventSnapshot(enabled: boolean): DispatchEvent[] {
  const [events, setEvents] = useState<DispatchEvent[]>(() => dispatchEventStore.getSnapshot());

  useEffect(() => {
    if (!enabled) return undefined;
    return dispatchEventStore.subscribe(setEvents);
  }, [enabled]);

  return events;
}

function isActiveDispatchEvent(event: DispatchEvent): boolean {
  const status = String(event.status ?? '').trim().toLowerCase();
  if (status === 'resolved' || status === 'closed' || status === 'cleared' || status === 'dismissed') {
    return false;
  }
  return event.severity === 'critical' ||
    event.severity === 'warning' ||
    event.type === 'recovery' ||
    event.type === 'assistance' ||
    event.category === 'recovery_assist' ||
    event.category === 'hazard_recovery';
}

function highestSeverity(events: DispatchEvent[]): DispatchEvent['severity'] | null {
  const rank: Record<DispatchEvent['severity'], number> = {
    info: 1,
    watch: 2,
    warning: 3,
    critical: 4,
  };
  let highest: DispatchEvent['severity'] | null = null;
  for (const event of events) {
    if (!highest || rank[event.severity] > rank[highest]) {
      highest = event.severity;
    }
  }
  return highest;
}

export function useExpeditionReadinessData(
  options: UseExpeditionReadinessDataOptions = {},
): ExpeditionReadinessCommandData {
  const enabled = options.enabled ?? true;
  const readinessState = useExpeditionReadinessState();
  const dispatchEvents = useDispatchEventSnapshot(enabled);
  const [, setConnectivityRevision] = useState(0);

  useEffect(() => {
    if (!enabled) return undefined;
    return connectivity.onStatusChange(() => setConnectivityRevision((value) => value + 1));
  }, [enabled]);

  const activeDispatchEvents = useMemo(
    () => dispatchEvents.filter(isActiveDispatchEvent),
    [dispatchEvents],
  );
  const isOffline = connectivity.isOffline();

  return useMemo(
    () =>
      normalizeExpeditionReadinessCommandData({
        assessment: readinessState.currentAssessment,
        isOffline,
        isUsingCachedData: readinessState.inputFreshness
          ? Object.values(readinessState.inputFreshness).some((record) => record.source === 'cached' || record.isStale)
          : false,
        activeIncidentCount: activeDispatchEvents.length,
        highestIncidentSeverity: highestSeverity(activeDispatchEvents),
        sourceUpdatedAt: readinessState.lastAssessmentAt,
      }),
    [
      activeDispatchEvents,
      isOffline,
      readinessState.currentAssessment,
      readinessState.inputFreshness,
      readinessState.lastAssessmentAt,
    ],
  );
}

export default useExpeditionReadinessData;
