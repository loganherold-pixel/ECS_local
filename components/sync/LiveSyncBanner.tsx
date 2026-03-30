/**
 * Live Sync Banner
 *
 * A subtle notification banner that appears at the top of the Sync tab
 * when remote changes arrive via Supabase Realtime subscriptions.
 * Auto-dismisses after a few seconds.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { SPACING, RADIUS } from '../../lib/theme';
import { useTheme } from '../../context/ThemeContext';
import { realtimeSync, type RealtimeEvent } from '../../lib/realtimeSync';

const TABLE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  trips: 'map-outline',
  load_items: 'cube-outline',
  risk_scores: 'shield-outline',
  waypoints: 'navigate-outline',
  load_map_slots: 'grid-outline',
  fuel_water_logs: 'water-outline',
};

const TABLE_LABELS: Record<string, string> = {
  trips: 'Expedition',
  load_items: 'Loadout Item',
  risk_scores: 'Risk Score',
  waypoints: 'Waypoint',
  load_map_slots: 'Load Map Slot',
  fuel_water_logs: 'Fuel/Water Log',
};

const EVENT_LABELS: Record<string, string> = {
  INSERT: 'added',
  UPDATE: 'updated',
  DELETE: 'removed',
};

const AUTO_DISMISS_MS = 5000;

interface BannerItem {
  id: string;
  event: RealtimeEvent;
  visible: boolean;
}

export default function LiveSyncBanner() {
  const { colors } = useTheme();
  const [bannerItems, setBannerItems] = useState<BannerItem[]>([]);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showBanner = useCallback((event: RealtimeEvent) => {
    const item: BannerItem = {
      id: event.id,
      event,
      visible: true,
    };

    setBannerItems(prev => {
      // Keep only last 3 items
      const next = [item, ...prev].slice(0, 3);
      return next;
    });

    // Animate in
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: false,
    }).start();

    // Auto-dismiss
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: false,
      }).start(() => {
        setBannerItems([]);
      });
    }, AUTO_DISMISS_MS);
  }, [fadeAnim]);

  const dismissAll = useCallback(() => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: false,
    }).start(() => {
      setBannerItems([]);
    });
  }, [fadeAnim]);

  useEffect(() => {
    const unsub = realtimeSync.onChange((event) => {
      showBanner(event);
    });

    return () => {
      unsub();
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [showBanner]);

  if (bannerItems.length === 0) return null;

  return (
    <Animated.View
      style={[
        s.container,
        {
          backgroundColor: colors.info + '12',
          borderColor: colors.info + '35',
          opacity: fadeAnim,
          transform: [{
            translateY: fadeAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [-8, 0],
            }),
          }],
        },
      ]}
    >
      <View style={s.headerRow}>
        <View style={[s.liveDot, { backgroundColor: colors.info }]} />
        <Text style={[s.headerText, { color: colors.info }]}>LIVE SYNC</Text>
        <Text style={[s.headerCount, { color: colors.textMuted }]}>
          {bannerItems.length} change{bannerItems.length !== 1 ? 's' : ''}
        </Text>
        <TouchableOpacity onPress={dismissAll} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={14} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {bannerItems.map((item) => {
        const { event } = item;
        const icon = TABLE_ICONS[event.table] || 'document-outline';
        const tableLabel = TABLE_LABELS[event.table] || event.table;
        const eventLabel = EVENT_LABELS[event.type] || event.type.toLowerCase();

        return (
          <View key={item.id} style={[s.eventRow, { borderTopColor: colors.info + '15' }]}>
            <Ionicons name={icon} size={12} color={colors.info} />
            <Text style={[s.eventText, { color: colors.textPrimary }]} numberOfLines={1}>
              <Text style={s.eventBold}>{tableLabel}</Text>
              {' '}
              {eventLabel}
              {event.recordName ? ` — ${event.recordName}` : ''}
            </Text>
            {event.conflictDetected && (
              <View style={[s.conflictPill, { backgroundColor: colors.warning + '20', borderColor: colors.warning + '40' }]}>
                <Ionicons name="git-compare-outline" size={8} color={colors.warning} />
                <Text style={[s.conflictPillText, { color: colors.warning }]}>CONFLICT</Text>
              </View>
            )}
          </View>
        );
      })}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  container: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    padding: SPACING.sm,
    marginBottom: SPACING.md,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  headerText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 2,
    flex: 1,
  },
  headerCount: {
    fontSize: 9,
    fontFamily: 'Courier',
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 4,
    paddingLeft: 2,
    borderTopWidth: 1,
  },
  eventText: {
    fontSize: 11,
    flex: 1,
  },
  eventBold: {
    fontWeight: '700',
  },
  conflictPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 1,
  },
  conflictPillText: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});





