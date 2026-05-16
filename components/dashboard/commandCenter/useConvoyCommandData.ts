import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import {
  getExpeditionAssessmentStoreSnapshot,
  subscribeExpeditionAssessmentStore,
} from '../../../stores/expeditionAssessmentStore';
import { normalizeConvoyCommandData, type ConvoyCommandData } from '../../../lib/navigation/convoyCommandData';
import { teamStore } from '../../../lib/teamStore';

export type UseConvoyCommandDataOptions = {
  enabled?: boolean;
};

export function useConvoyCommandData(
  options: UseConvoyCommandDataOptions = {},
): ConvoyCommandData {
  const enabled = options.enabled ?? true;
  const [teamSnapshot, setTeamSnapshot] = useState(() => teamStore.getSnapshot());
  const assessmentSnapshot = useSyncExternalStore(
    subscribeExpeditionAssessmentStore,
    getExpeditionAssessmentStoreSnapshot,
    getExpeditionAssessmentStoreSnapshot,
  );

  useEffect(() => {
    if (!enabled) return undefined;
    return teamStore.subscribe(setTeamSnapshot);
  }, [enabled]);

  return useMemo(() => {
    if (!enabled) {
      return normalizeConvoyCommandData();
    }

    return normalizeConvoyCommandData({
      teamSnapshot,
      convoySnapshot: assessmentSnapshot.contextSnapshot.convoy ?? null,
      activeRouteId: assessmentSnapshot.contextSnapshot.route?.routeId ?? null,
      isOffline: assessmentSnapshot.offline || assessmentSnapshot.contextSnapshot.offlineMode === true,
      liveSharingAvailable: false,
    });
  }, [
    assessmentSnapshot.contextSnapshot.convoy,
    assessmentSnapshot.contextSnapshot.offlineMode,
    assessmentSnapshot.contextSnapshot.route?.routeId,
    assessmentSnapshot.offline,
    enabled,
    teamSnapshot,
  ]);
}

export default useConvoyCommandData;
