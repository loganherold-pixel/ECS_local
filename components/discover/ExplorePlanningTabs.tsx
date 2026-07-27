import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ECSSegmentedControl } from '../ECSChip';
import { deferShellRouteNavigation, type ShellInteractionTask } from '../../lib/shellInteractionScheduler';
import { useECSNavigation } from '../../lib/navigation/useECSNavigation';

type ExplorePlanningTab = 'suggested_routes' | 'offline_prep_pack';

const EXPLORE_PLANNING_TAB_OPTIONS = [
  { key: 'suggested_routes', label: 'Find Trails', icon: 'map-outline' as const },
  { key: 'offline_prep_pack', label: 'Offline Trails', icon: 'download-outline' as const },
];

const EXPLORE_PLANNING_TAB_ROUTES: Record<ExplorePlanningTab, string> = {
  suggested_routes: '/discover',
  offline_prep_pack: '/explore-offline-prep-pack',
};

function isExplorePlanningTab(key: string): key is ExplorePlanningTab {
  return key in EXPLORE_PLANNING_TAB_ROUTES;
}

export function ExplorePlanningTabs({ activeTab }: { activeTab: ExplorePlanningTab }) {
  const { push: pushSingleFlight } = useECSNavigation();
  const pendingNavigationTaskRef = useRef<ShellInteractionTask | null>(null);
  const [pendingTab, setPendingTab] = useState<ExplorePlanningTab | null>(null);
  const displayTab = pendingTab ?? activeTab;

  useEffect(() => {
    if (pendingTab === activeTab) {
      setPendingTab(null);
    }
  }, [activeTab, pendingTab]);

  useEffect(() => {
    return () => {
      pendingNavigationTaskRef.current?.cancel();
      pendingNavigationTaskRef.current = null;
    };
  }, []);

  const handleChange = useCallback((key: string) => {
    if (!isExplorePlanningTab(key)) return;

    if (key === activeTab) {
      pendingNavigationTaskRef.current?.cancel();
      pendingNavigationTaskRef.current = null;
      setPendingTab(null);
      return;
    }

    if (key === pendingTab) {
      return;
    }

    pendingNavigationTaskRef.current?.cancel();
    setPendingTab(key);
    pendingNavigationTaskRef.current = deferShellRouteNavigation(() => {
      pendingNavigationTaskRef.current = null;
      const attempt = pushSingleFlight(EXPLORE_PLANNING_TAB_ROUTES[key]);
      if (!attempt.accepted) setPendingTab(null);
    });
  }, [activeTab, pendingTab, pushSingleFlight]);

  return (
    <View style={styles.container} testID="explore-planning-tabs">
      <ECSSegmentedControl
        options={EXPLORE_PLANNING_TAB_OPTIONS}
        value={displayTab}
        onChange={handleChange}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 14,
    paddingTop: 10,
  },
});
