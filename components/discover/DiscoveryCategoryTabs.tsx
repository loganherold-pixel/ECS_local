// ============================================================
// DISCOVERY CATEGORY TABS — Horizontal Tab Bar
// ============================================================
// Phase 16: Scrollable horizontal tab bar for filtering
// Discovery routes by category (Day Trips, Weekend Trips,
// Expeditions, Remote Routes).
//
// Includes route count badges, "Show Lesser Known Routes"
// toggle, and active tab indicator.
// ============================================================

import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Switch } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, GOLD_RAIL, ECS } from '../../lib/theme';
import { hapticMicro } from '../../lib/haptics';
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
  /** Optional AI route counts per category */
  aiRouteCounts?: Record<string, number>;
}

export default function DiscoveryCategoryTabs({
  activeTab,
  onChangeTab,
  categories,
  showLesserKnown,
  onToggleLesserKnown,
  aiRouteCounts,
}: DiscoveryCategoryTabsProps) {
  const getCount = (tabId: DiscoveryTabId): number => {
    switch (tabId) {
      case 'day-trips': return categories.dayTrips.length;
      case 'weekend-trips': return categories.weekendTrips.length;
      case 'expeditions': return categories.expeditions.length;
      case 'remote-routes': return categories.remoteRoutes.length;
      default: return 0;
    }
  };

  const getAICount = (tabId: DiscoveryTabId): number => {
    return aiRouteCounts?.[tabId] ?? 0;
  };

  const hiddenGemCount = categories.all.filter(r => r.hiddenGem).length;


  return (
    <View style={s.container}>
      {/* Tab Bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.tabRow}
      >
        {DISCOVERY_TABS.map((tab) => {
          const isActive = tab.id === activeTab;
          const count = getCount(tab.id);
          const aiCount = getAICount(tab.id);

          return (
            <TouchableOpacity
              key={tab.id}
              style={[
                s.tab,
                isActive && { borderColor: tab.accentColor + '60', backgroundColor: tab.accentColor + '14' },
              ]}
              activeOpacity={0.75}
              onPress={() => {
                hapticMicro();
                onChangeTab(tab.id);
              }}
            >
              <View style={s.tabIconRow}>
                <Ionicons
                  name={tab.icon as any}
                  size={14}
                  color={isActive ? tab.accentColor : TACTICAL.textMuted}
                />
                <View style={s.tabCountRow}>
                  <View style={[
                    s.tabCountBadge,
                    { backgroundColor: isActive ? tab.accentColor + '25' : ECS.bgElev },
                  ]}>
                    <Text style={[
                      s.tabCountText,
                      { color: isActive ? tab.accentColor : TACTICAL.textMuted },
                    ]}>
                      {count}
                    </Text>
                  </View>
                  {aiCount > 0 && (
                    <View style={[s.tabCountBadge, { backgroundColor: '#5AC8FA18' }]}>
                      <Text style={[s.tabCountText, { color: '#5AC8FA', fontSize: 7 }]}>
                        +{aiCount}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
              <Text
                style={[
                  s.tabLabel,
                  { color: isActive ? tab.accentColor : TACTICAL.textMuted },
                ]}
                numberOfLines={1}
              >
                {tab.label}
              </Text>
              {isActive && (
                <View style={[s.activeIndicator, { backgroundColor: tab.accentColor }]} />
              )}
            </TouchableOpacity>
          );
        })}

      </ScrollView>

      {/* Gold divider */}
      <View style={s.goldDivider} />

      {/* Lesser Known Routes Toggle + Hidden Gem Count */}
      <View style={s.toggleRow}>
        <View style={s.toggleLeft}>
          <Ionicons name="eye-off-outline" size={11} color={showLesserKnown ? TACTICAL.amber : TACTICAL.textMuted} />
          <Text style={[s.toggleLabel, showLesserKnown && { color: TACTICAL.amber }]}>
            SHOW LESSER KNOWN ROUTES
          </Text>
        </View>
        <View style={s.toggleRight}>
          {hiddenGemCount > 0 && (
            <View style={s.gemBadge}>
              <Ionicons name="diamond-outline" size={8} color="#E67E22" />
              <Text style={s.gemBadgeText}>{hiddenGemCount} HIDDEN GEM{hiddenGemCount !== 1 ? 'S' : ''}</Text>
            </View>
          )}
          <Switch
            value={showLesserKnown}
            onValueChange={(val) => {
              hapticMicro();
              onToggleLesserKnown(val);
            }}
            trackColor={{ false: ECS.stroke, true: TACTICAL.amber + '50' }}
            thumbColor={showLesserKnown ? TACTICAL.amber : TACTICAL.textMuted}
            ios_backgroundColor={ECS.stroke}
            style={{ transform: [{ scaleX: 0.7 }, { scaleY: 0.7 }] }}
          />
        </View>
      </View>
    </View>
  );
}

// ============================================================
// STYLES
// ============================================================
const s = StyleSheet.create({
  container: {
    backgroundColor: ECS.bgPanel,
    borderRadius: ECS.radius,
    borderWidth: 1,
    borderColor: ECS.stroke,
    marginBottom: 14,
    overflow: 'hidden',
  },

  // ── Tab Row ───────────────────────────────────────────
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 6,
  },
  tab: {
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
    minWidth: 90,
    position: 'relative',
    gap: 4,
  },
  tabIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tabCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },

  tabCountBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    minWidth: 18,
    alignItems: 'center',
  },
  tabCountText: {
    fontSize: 9,
    fontWeight: '800',
    fontFamily: 'Courier',
  },
  tabLabel: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  activeIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 12,
    right: 12,
    height: 2,
    borderRadius: 1,
  },

  // ── Gold Divider ──────────────────────────────────────
  goldDivider: {
    height: GOLD_RAIL.subsectionWidth,
    backgroundColor: GOLD_RAIL.subsection,
    marginHorizontal: 10,
  },

  // ── Toggle Row ────────────────────────────────────────
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  toggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  toggleLabel: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  toggleRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  gemBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E67E2230',
    backgroundColor: '#E67E220A',
  },
  gemBadgeText: {
    fontSize: 6,
    fontWeight: '800',
    color: '#E67E22',
    letterSpacing: 1,
  },
});



