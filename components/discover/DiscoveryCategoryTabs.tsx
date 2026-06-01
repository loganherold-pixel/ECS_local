// ============================================================
// DISCOVERY CATEGORY TABS — Fixed Explore Filters
// ============================================================
// Compact, non-scrolling filter surface for Day Trips,
// Weekend Trips, Expeditions, and Remote Routes.
//
// Keeps Explore focused on the core trip-type filters only.
// ============================================================

import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { ECS } from '../../lib/theme';
import { hapticMicro } from '../../lib/haptics';
import { ECSChip } from '../ECSChip';
import {
  DISCOVERY_TABS,
  type DiscoveryTabId,
  type ExpandedDiscoverCategories,
} from '../../lib/discoverCategoryEngine';

interface DiscoveryCategoryTabsProps {
  activeTab: DiscoveryTabId;
  onChangeTab: (tab: DiscoveryTabId) => void;
  categories: ExpandedDiscoverCategories;
  /** Optional ECS suggestion counts per category */
  ecsSuggestionCounts?: Record<string, number>;
}

const FILTER_LABELS: Record<DiscoveryTabId, string> = {
  'day-trips': 'Day Trips',
  'weekend-trips': 'Weekend Trips',
  expeditions: 'Expeditions',
  'remote-routes': 'Remote Routes',
};

export default function DiscoveryCategoryTabs({
  activeTab,
  onChangeTab,
  categories,
  ecsSuggestionCounts,
}: DiscoveryCategoryTabsProps) {
  const { width } = useWindowDimensions();
  const compact = width < 380;
  const showBadgeCount = width >= 420;

  const getCount = (tabId: DiscoveryTabId): number => {
    switch (tabId) {
      case 'day-trips': return categories.dayTrips.length;
      case 'weekend-trips': return categories.weekendTrips.length;
      case 'expeditions': return categories.expeditions.length;
      case 'remote-routes': return categories.remoteRoutes.length;
      default: return 0;
    }
  };

  const getECSSuggestionCount = (tabId: DiscoveryTabId): number => {
    return ecsSuggestionCounts?.[tabId] ?? 0;
  };

  return (
    <View style={s.container}>
      <View style={s.tabRow}>
        {DISCOVERY_TABS.map((tab) => {
          const isActive = tab.id === activeTab;
          const count = getCount(tab.id);
          const ecsSuggestionCount = getECSSuggestionCount(tab.id);
          const badgeCount = count + ecsSuggestionCount;

          return (
            <ECSChip
              key={tab.id}
              label={FILTER_LABELS[tab.id]}
              icon={tab.icon as any}
              badge={showBadgeCount && badgeCount > 0 ? badgeCount : null}
              selected={isActive}
              compact={compact}
              style={[s.tab, s.tabHalf]}
              onPress={() => {
                hapticMicro();
                onChangeTab(tab.id);
              }}
              textStyle={isActive ? { color: tab.accentColor } : undefined}
            />
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    backgroundColor: ECS.bgPanel,
    borderRadius: ECS.radius,
    borderWidth: 1,
    borderColor: ECS.stroke,
    marginBottom: 10,
    overflow: 'hidden',
  },
  tabRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 6,
    justifyContent: 'space-between',
  },
  tab: {
    minWidth: 0,
    minHeight: 0,
  },
  tabHalf: {
    width: '48.5%',
  },
});
