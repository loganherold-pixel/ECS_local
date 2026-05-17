import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import {
  getExpeditionAssessmentStoreSnapshot,
  subscribeExpeditionAssessmentStore,
} from '../../../stores/expeditionAssessmentStore';
import { connectivity } from '../../../lib/connectivity';
import { navigateRouteSessionStore, type NavigateRouteSessionSnapshot } from '../../../lib/navigateRouteSessionStore';
import { normalizeConvoyCommandData, type ConvoyCommandData } from '../../../lib/navigation/convoyCommandData';
import { routeStore, type ImportedRoute } from '../../../lib/routeStore';
import { teamStore } from '../../../lib/teamStore';

export type UseConvoyCommandDataOptions = {
  enabled?: boolean;
};

function useActiveRouteSnapshot(enabled: boolean): {
  activeRoute: ImportedRoute | null;
  navigateSession: NavigateRouteSessionSnapshot;
} {
  const [activeRoute, setActiveRoute] = useState<ImportedRoute | null>(() => routeStore.getActive());
  const [navigateSession, setNavigateSession] = useState<NavigateRouteSessionSnapshot>(() =>
    navigateRouteSessionStore.getSnapshot(),
  );

  useEffect(() => {
    if (!enabled) return undefined;
    const sync = () => setActiveRoute(routeStore.getActive());
    sync();
    return routeStore.subscribe(sync);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    let mounted = true;
    const unsubscribe = navigateRouteSessionStore.subscribe((snapshot) => {
      if (mounted) setNavigateSession(snapshot);
    });
    void navigateRouteSessionStore.hydrateFromPersistence().then((snapshot) => {
      if (mounted) setNavigateSession(snapshot);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [enabled]);

  return { activeRoute, navigateSession };
}

export function useConvoyCommandData(
  options: UseConvoyCommandDataOptions = {},
): ConvoyCommandData {
  const enabled = options.enabled ?? true;
  const [teamSnapshot, setTeamSnapshot] = useState(() => teamStore.getSnapshot());
  const [connectivityRevision, setConnectivityRevision] = useState(0);
  const { activeRoute, navigateSession } = useActiveRouteSnapshot(enabled);
  const assessmentSnapshot = useSyncExternalStore(
    subscribeExpeditionAssessmentStore,
    getExpeditionAssessmentStoreSnapshot,
    getExpeditionAssessmentStoreSnapshot,
  );

  useEffect(() => {
    if (!enabled) return undefined;
    return teamStore.subscribe(setTeamSnapshot);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    return connectivity.onStatusChange(() => setConnectivityRevision((value) => value + 1));
  }, [enabled]);

  return useMemo(() => {
    if (!enabled) {
      return normalizeConvoyCommandData();
    }

    void connectivityRevision;
    const connectivityState = connectivity.getDetailedState();
    const routeId =
      assessmentSnapshot.contextSnapshot.route?.routeId ??
      navigateSession.routeId ??
      activeRoute?.id ??
      null;
    const routeLabel =
      assessmentSnapshot.contextSnapshot.route?.routeName?.value ??
      navigateSession.routeTitle ??
      activeRoute?.name ??
      null;

    return normalizeConvoyCommandData({
      teamSnapshot,
      convoySnapshot: assessmentSnapshot.contextSnapshot.convoy ?? null,
      activeRouteId: routeId,
      activeRouteLabel: routeLabel,
      activeExpeditionId: assessmentSnapshot.contextSnapshot.expeditionId ?? null,
      isOffline: assessmentSnapshot.offline || assessmentSnapshot.contextSnapshot.offlineMode === true,
      connectivityStatus: connectivityState.initialized ? connectivityState.status : null,
      connectivityLevel: connectivityState.initialized ? connectivityState.level : null,
      liveSharingAvailable: false,
    });
  }, [
    activeRoute?.id,
    activeRoute?.name,
    assessmentSnapshot.contextSnapshot.convoy,
    assessmentSnapshot.contextSnapshot.expeditionId,
    assessmentSnapshot.contextSnapshot.offlineMode,
    assessmentSnapshot.contextSnapshot.route?.routeId,
    assessmentSnapshot.contextSnapshot.route?.routeName?.value,
    assessmentSnapshot.offline,
    connectivityRevision,
    enabled,
    navigateSession.routeId,
    navigateSession.routeTitle,
    teamSnapshot,
  ]);
}

export default useConvoyCommandData;
