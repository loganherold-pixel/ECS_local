// ============================================================
// DISCOVERY CATEGORY TABS — Fixed Explore Filters
// ============================================================
// Compact, non-scrolling filter surface for Day Trips,
// Weekend Trips, Expeditions, and Remote Routes.
//
// Includes explicit Hidden Gems vs Popular Trails emphasis
// control without adding extra vertical bulk.
// ============================================================

import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { GOLD_RAIL, ECS } from '../../lib/theme';
import { hapticMicro } from '../../lib/haptics';
import { ECSChip, ECSSegmentedControl } from '../ECSChip';
import {
  DISCOVERY_TABS,
  type DiscoveryTabId,
  type ExpandedDiscoverCategories,
} from '../../lib/discoverCategoryEngine';

interface DiscoveryCategoryTabsProps {
  activeTab: DiscoveryTabId;
  onChangeTab: (tab: DiscoveryTabId) => void;
  categories: ExpandedDiscoverCategories;
  showLesserKnown: boolean;
  onToggleLesserKnown: (value: boolean) => void;
  /** Optional ECS suggestion counts per category */
  ecsSuggestionCounts?: Record<string, number>;
  /** Optional surfaced Hidden Gems count for the current active filter/radius. */
  hiddenGemBadgeCount?: number | null;
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
  showLesserKnown,
  onToggleLesserKnown,
  ecsSuggestionCounts,
  hiddenGemBadgeCount,
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

  const hiddenGemCount =
    hiddenGemBadgeCount ?? categories.all.filter((route) => route.hiddenGem).length;

  const handleSelectMode = (nextValue: boolean) => {
    if (nextValue !== showLesserKnown) {
      hapticMicro();
      onToggleLesserKnown(nextValue);
    }
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

      <View style={s.goldDivider} />

      <View style={s.modeRow}>
        <ECSSegmentedControl
          options={[
            {
              key: 'hidden',
              label: 'Hidden Gems',
              icon: 'diamond-outline',
              badge: hiddenGemCount > 0 ? hiddenGemCount : null,
            },
            {
              key: 'popular',
              label: 'Popular Trails',
              icon: 'flag-outline',
            },
          ]}
          value={showLesserKnown ? 'hidden' : 'popular'}
          onChange={(next) => handleSelectMode(next === 'hidden')}
        />
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
  goldDivider: {
    height: GOLD_RAIL.subsectionWidth,
    backgroundColor: GOLD_RAIL.subsection,
    marginHorizontal: 10,
  },
  modeRow: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
});
