/**
 * ZoneWeightBars — Per-Zone Weight Distribution
 *
 * Shows each vehicle zone with:
 *   - Weight bar (proportional fill)
 *   - Capacity limit indicator
 *   - Overweight / warning badges
 *   - Item count per zone
 *
 * PHASE 6: ContainerZone-aware display
 *   - Shows spatial bias badges (vertical + longitudinal) when containerZones provided
 *   - Uses container zone colors for zone indicators
 *   - Displays zone icon from accessory framework
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import type { ZoneWarning } from '../../lib/weightDashboardStore';
import type { ZoneWeightSummary } from '../../lib/weightStore';
import type { ContainerZone } from '../../lib/accessoryFramework';
import { resolveZoneBias } from '../../lib/accessoryFramework';

interface Props {
  zones: ZoneWeightSummary[];
  warnings: ZoneWarning[];
  totalLoadoutWeight: number;
  /** Optional ContainerZone[] for spatial bias display */
  containerZones?: ContainerZone[];
}

/** Map vertical bias to display color */
function biasVerticalColor(bias: string): string {
  switch (bias) {
    case 'high': return '#EF5350';
    case 'mid':  return TACTICAL.amber;
    case 'low':  return '#66BB6A';
    default:     return TACTICAL.textMuted;
  }
}

/** Map longitudinal bias to display label */
function biasLongLabel(bias: string): string {
  switch (bias) {
    case 'front': return 'FWD';
    case 'mid':   return 'CTR';
    case 'rear':  return 'AFT';
    default:      return '—';
  }
}

function ZoneBar({ zone, warning, maxWeight, containerZone }: {
  zone: ZoneWeightSummary;
  warning: ZoneWarning | undefined;
  maxWeight: number;
  containerZone?: ContainerZone;
}) {
  const hasWeight = zone.totalWeightLbs > 0;
  const fillPct = maxWeight > 0 ? Math.min(100, (zone.totalWeightLbs / maxWeight) * 100) : 0;
  const capacityPct = maxWeight > 0 ? Math.min(100, (zone.capacityLbs / maxWeight) * 100) : 100;
  const statusColor = warning?.color || '#66BB6A';
  const severity = warning?.severity || 'ok';

  // Phase 6: Resolve spatial bias if containerZone available
  const bias = containerZone ? resolveZoneBias(containerZone) : null;
  const zoneColor = containerZone?.color || statusColor;

  return (
    <View style={styles.zoneRow}>
      {/* Zone info row */}
      <View style={styles.zoneHeader}>
        <View style={styles.zoneNameRow}>
          {/* Zone color indicator — use container zone color when available */}
          <View style={[styles.zoneIndicator, { backgroundColor: containerZone ? zoneColor : statusColor }]} />

          {/* Zone icon (Phase 6) */}
          {containerZone && (
            <Ionicons
              name={(containerZone.icon || 'cube-outline') as any}
              size={12}
              color={zoneColor}
              style={{ marginRight: 2 }}
            />
          )}

          <Text style={styles.zoneName} numberOfLines={1}>{zone.zoneName}</Text>

          {/* Spatial bias badges (Phase 6) */}
          {bias && (
            <View style={styles.biasBadgeRow}>
              <View style={[styles.biasMicroBadge, { borderColor: biasVerticalColor(bias.verticalBias) + '60' }]}>
                <Text style={[styles.biasMicroText, { color: biasVerticalColor(bias.verticalBias) }]}>
                  {bias.verticalBias.toUpperCase()}
                </Text>
              </View>
              <View style={[styles.biasMicroBadge, { borderColor: 'rgba(138, 138, 133, 0.3)' }]}>
                <Text style={[styles.biasMicroText, { color: TACTICAL.textMuted }]}>
                  {biasLongLabel(bias.longitudinalBias)}
                </Text>
              </View>
            </View>
          )}

          {severity === 'overweight' && (
            <View style={styles.overBadge}>
              <Ionicons name="warning" size={9} color="#EF5350" />
              <Text style={styles.overBadgeText}>OVER</Text>
            </View>
          )}
          {severity === 'critical' && (
            <View style={styles.critBadge}>
              <Ionicons name="alert-circle" size={9} color="#FF9800" />
              <Text style={styles.critBadgeText}>NEAR LIMIT</Text>
            </View>
          )}
          {severity === 'warning' && (
            <View style={styles.warnBadge}>
              <Ionicons name="alert" size={9} color="#FFB74D" />
              <Text style={styles.warnBadgeText}>CAUTION</Text>
            </View>
          )}
        </View>
        <View style={styles.zoneStats}>
          <Text style={[styles.zoneWeight, { color: hasWeight ? statusColor : TACTICAL.textMuted }]}>
            {hasWeight ? `${zone.totalWeightLbs}` : '0'}
          </Text>
          <Text style={styles.zoneWeightUnit}>lbs</Text>
        </View>
      </View>

      {/* Weight bar */}
      <View style={styles.barContainer}>
        <View style={styles.barTrack}>
          {/* Capacity marker */}
          <View style={[styles.capacityMarker, { left: `${capacityPct}%` }]} />
          {/* Fill — use container zone color when available */}
          <View
            style={[
              styles.barFill,
              {
                width: `${fillPct}%`,
                backgroundColor: containerZone ? zoneColor : statusColor,
              },
            ]}
          />
        </View>
        <View style={styles.barMeta}>
          <Text style={styles.barCapacity}>
            {zone.capacityLbs} lbs max
          </Text>
          <Text style={[styles.barPct, { color: statusColor }]}>
            {zone.utilizationPct}%
          </Text>
        </View>
      </View>

      {/* Items count */}
      {zone.itemCount > 0 && (
        <Text style={styles.itemCount}>
          {zone.itemCount} item{zone.itemCount !== 1 ? 's' : ''}
        </Text>
      )}
    </View>
  );
}

export default function ZoneWeightBars({ zones, warnings, totalLoadoutWeight, containerZones }: Props) {
  // Find max weight for proportional bars
  const maxWeight = Math.max(
    ...zones.map(z => Math.max(z.totalWeightLbs, z.capacityLbs)),
    1
  );

  const warningMap = new Map(warnings.map(w => [w.zoneId, w]));
  const activeZones = zones.filter(z => z.totalWeightLbs > 0 || z.capacityLbs > 0);
  const overweightCount = warnings.filter(w => w.severity === 'overweight').length;
  const warningCount = warnings.filter(w => w.severity === 'warning' || w.severity === 'critical').length;

  // Build containerZone lookup map
  const containerZoneMap = new Map<string, ContainerZone>();
  if (containerZones) {
    for (const cz of containerZones) {
      containerZoneMap.set(cz.id, cz);
      // Also map by label for matching
      containerZoneMap.set(cz.label, cz);
    }
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="layers-outline" size={14} color={TACTICAL.amber} />
          <Text style={styles.headerTitle}>ZONE DISTRIBUTION</Text>
          {containerZones && containerZones.length > 0 && (
            <View style={styles.biasActiveBadge}>
              <Ionicons name="git-network-outline" size={8} color={TACTICAL.amber} />
              <Text style={styles.biasActiveText}>BIAS</Text>
            </View>
          )}
        </View>
        <View style={styles.headerRight}>
          {overweightCount > 0 && (
            <View style={styles.alertChip}>
              <Ionicons name="warning" size={10} color="#EF5350" />
              <Text style={styles.alertChipText}>{overweightCount} OVER</Text>
            </View>
          )}
          {warningCount > 0 && (
            <View style={styles.warnChip}>
              <Ionicons name="alert-circle" size={10} color="#FFB74D" />
              <Text style={styles.warnChipText}>{warningCount}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Zone bars */}
      <View style={styles.zonesContainer}>
        {activeZones.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="cube-outline" size={24} color={TACTICAL.textMuted} />
            <Text style={styles.emptyText}>No zone weight data</Text>
            <Text style={styles.emptySub}>Add items with weight to see distribution</Text>
          </View>
        ) : (
          activeZones.map(zone => (
            <ZoneBar
              key={zone.zoneId}
              zone={zone}
              warning={warningMap.get(zone.zoneId)}
              maxWeight={maxWeight}
              containerZone={containerZoneMap.get(zone.zoneId) || containerZoneMap.get(zone.zoneName)}
            />
          ))
        )}
      </View>

      {/* Summary footer */}
      {activeZones.length > 0 && (
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {activeZones.length} ZONE{activeZones.length !== 1 ? 'S' : ''} LOADED
          </Text>
          <Text style={styles.footerWeight}>
            TOTAL: {totalLoadoutWeight.toFixed(1)} LBS
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: TACTICAL.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 79, 60, 0.2)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  alertChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(239, 83, 80, 0.12)',
  },
  alertChipText: {
    fontSize: 7,
    fontWeight: '900',
    color: '#EF5350',
    letterSpacing: 0.5,
  },
  warnChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 183, 77, 0.12)',
  },
  warnChipText: {
    fontSize: 7,
    fontWeight: '900',
    color: '#FFB74D',
    letterSpacing: 0.5,
  },

  // Bias active badge
  biasActiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(196, 138, 44, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.2)',
  },
  biasActiveText: {
    fontSize: 6,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 0.5,
  },

  // Zones
  zonesContainer: {
    padding: 14,
    gap: 14,
  },
  zoneRow: {
    gap: 4,
  },
  zoneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  zoneNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  zoneIndicator: {
    width: 3,
    height: 16,
    borderRadius: 1.5,
  },
  zoneName: {
    fontSize: 11,
    fontWeight: '700',
    color: TACTICAL.text,
    flex: 1,
  },
  zoneStats: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  zoneWeight: {
    fontSize: 13,
    fontWeight: '900',
    fontFamily: 'Courier',
  },
  zoneWeightUnit: {
    fontSize: 8,
    fontWeight: '600',
    color: TACTICAL.textMuted,
  },

  // Bias micro badges (Phase 6)
  biasBadgeRow: {
    flexDirection: 'row',
    gap: 3,
  },
  biasMicroBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 1,
  },
  biasMicroText: {
    fontSize: 6,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  // Badges
  overBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    backgroundColor: 'rgba(239, 83, 80, 0.12)',
    borderRadius: 4,
  },
  overBadgeText: {
    fontSize: 7,
    fontWeight: '900',
    color: '#EF5350',
    letterSpacing: 0.5,
  },
  critBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    backgroundColor: 'rgba(255, 152, 0, 0.12)',
    borderRadius: 4,
  },
  critBadgeText: {
    fontSize: 7,
    fontWeight: '900',
    color: '#FF9800',
    letterSpacing: 0.5,
  },
  warnBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    backgroundColor: 'rgba(255, 183, 77, 0.12)',
    borderRadius: 4,
  },
  warnBadgeText: {
    fontSize: 7,
    fontWeight: '900',
    color: '#FFB74D',
    letterSpacing: 0.5,
  },

  // Bar
  barContainer: {
    gap: 3,
  },
  barTrack: {
    height: 6,
    backgroundColor: 'rgba(62, 79, 60, 0.15)',
    borderRadius: 3,
    overflow: 'hidden',
    position: 'relative',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  capacityMarker: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: 'rgba(138, 138, 133, 0.4)',
    zIndex: 1,
  },
  barMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  barCapacity: {
    fontSize: 8,
    fontWeight: '600',
    color: TACTICAL.textMuted,
  },
  barPct: {
    fontSize: 9,
    fontWeight: '800',
    fontFamily: 'Courier',
  },
  itemCount: {
    fontSize: 8,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    marginLeft: 9,
  },

  // Empty
  emptyState: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 20,
  },
  emptyText: {
    fontSize: 11,
    fontWeight: '700',
    color: TACTICAL.textMuted,
  },
  emptySub: {
    fontSize: 9,
    color: TACTICAL.textMuted,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(62, 79, 60, 0.15)',
  },
  footerText: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  footerWeight: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1,
    fontFamily: 'Courier',
  },
});



