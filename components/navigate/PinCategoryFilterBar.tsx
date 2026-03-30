/**
 * PinCategoryFilterBar — Horizontal scrollable row of category filter chips
 *
 * Shows one chip per pin type (Camp, Fuel, Water, POI, Hazard, Recovery, Medical, Mechanical)
 * plus an 'ALL' chip to reset filters. Each chip shows:
 *   - Pin type icon
 *   - Label
 *   - Count of pins in that category
 *   - Category color accent when active
 *
 * Tapping a chip toggles that category on/off.
 * Tapping 'ALL' resets all filters (shows all pins).
 */
import React, { useMemo } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, TYPO } from '../../lib/theme';
import {
  type PinType, type ECSPin,
  PIN_TYPE_REGISTRY, type PinTypeMeta,
} from './PinTypes';

interface Props {
  /** All pins (unfiltered) — used to compute counts per type */
  allPins: ECSPin[];
  /** Currently active type filters (empty = all shown) */
  activeFilters: PinType[];
  /** Toggle a single type filter on/off */
  onToggleFilter: (type: PinType) => void;
  /** Reset all filters (show all) */
  onResetFilters: () => void;
}

export default function PinCategoryFilterBar({
  allPins,
  activeFilters,
  onToggleFilter,
  onResetFilters,
}: Props) {
  // Compute counts per pin type
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const pin of allPins) {
      counts[pin.type] = (counts[pin.type] || 0) + 1;
    }
    return counts;
  }, [allPins]);

  // Only show types that have at least 1 pin, or all types if no pins yet
  const visibleTypes = useMemo(() => {
    const withPins = PIN_TYPE_REGISTRY.filter(meta => (typeCounts[meta.type] || 0) > 0);
    // If no pins exist at all, show all types (greyed out)
    return withPins.length > 0 ? withPins : PIN_TYPE_REGISTRY;
  }, [typeCounts]);

  const isAllActive = activeFilters.length === 0;
  const totalPins = allPins.length;

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ALL chip */}
        <TouchableOpacity
          style={[
            styles.chip,
            isAllActive && styles.chipAllActive,
          ]}
          onPress={onResetFilters}
          activeOpacity={0.8}
        >
          <Ionicons
            name="layers-outline"
            size={12}
            color={isAllActive ? TACTICAL.amber : TACTICAL.textMuted}
          />
          <Text style={[
            styles.chipLabel,
            isAllActive && { color: TACTICAL.amber },
          ]}>
            ALL
          </Text>
          <View style={[
            styles.chipCount,
            isAllActive && { backgroundColor: TACTICAL.amber + '20', borderColor: TACTICAL.amber + '40' },
          ]}>
            <Text style={[
              styles.chipCountText,
              isAllActive && { color: TACTICAL.amber },
            ]}>
              {totalPins}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Type chips */}
        {visibleTypes.map((meta: PinTypeMeta) => {
          const isActive = activeFilters.includes(meta.type);
          const count = typeCounts[meta.type] || 0;

          return (
            <TouchableOpacity
              key={meta.type}
              style={[
                styles.chip,
                isActive && {
                  borderColor: meta.color + '60',
                  backgroundColor: meta.bgColor,
                },
              ]}
              onPress={() => onToggleFilter(meta.type)}
              activeOpacity={0.8}
            >
              <Ionicons
                name={meta.icon as any}
                size={12}
                color={isActive ? meta.color : TACTICAL.textMuted}
              />
              <Text style={[
                styles.chipLabel,
                isActive && { color: meta.color },
              ]}>
                {meta.shortLabel}
              </Text>
              <View style={[
                styles.chipCount,
                isActive && {
                  backgroundColor: meta.color + '18',
                  borderColor: meta.color + '35',
                },
              ]}>
                <Text style={[
                  styles.chipCountText,
                  isActive && { color: meta.color },
                ]}>
                  {count}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 8,
    paddingBottom: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: TACTICAL.border + '60',
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    gap: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: 'rgba(62,79,60,0.04)',
  },
  chipAllActive: {
    borderColor: TACTICAL.amber + '50',
    backgroundColor: 'rgba(196,138,44,0.08)',
  },
  chipLabel: {
    ...TYPO.U2,
    fontSize: 8,
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
  chipCount: {
    minWidth: 18,
    height: 16,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    backgroundColor: 'rgba(138,138,133,0.08)',
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  chipCountText: {
    ...TYPO.K3,
    fontSize: 9,
    color: TACTICAL.textMuted,
  },
  divider: {
    width: 1,
    height: 20,
    backgroundColor: TACTICAL.border,
    marginHorizontal: 2,
  },
});



