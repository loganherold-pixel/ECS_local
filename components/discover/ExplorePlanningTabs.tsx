import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ECSSegmentedControl } from '../ECSChip';

type ExplorePlanningTab = 'suggested_routes' | 'trip_builder' | 'offline_prep_pack';

const EXPLORE_PLANNING_TAB_OPTIONS = [
  { key: 'suggested_routes', label: 'Suggested Routes', icon: 'map-outline' as const },
  { key: 'trip_builder', label: 'Trip Builder', icon: 'git-merge-outline' as const },
  { key: 'offline_prep_pack', label: 'Offline Prep', icon: 'download-outline' as const },
];

export function ExplorePlanningTabs({ activeTab }: { activeTab: ExplorePlanningTab }) {
  const router = useRouter();

  const handleChange = (key: string) => {
    if (key === activeTab) return;
    if (key === 'suggested_routes') {
      router.push('/discover');
      return;
    }
    if (key === 'trip_builder') {
      router.push('/explore-trip-builder');
      return;
    }
    if (key === 'offline_prep_pack') {
      router.push('/explore-offline-prep-pack');
    }
  };

  return (
    <View style={styles.container} testID="explore-planning-tabs">
      <ECSSegmentedControl
        options={EXPLORE_PLANNING_TAB_OPTIONS}
        value={activeTab}
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
