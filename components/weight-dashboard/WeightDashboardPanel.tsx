/**
 * WeightDashboardPanel — Real-Time Weight Tracking Dashboard
 *
 * Main container that aggregates:
 *   - Total vehicle weight gauge
 *   - CG visualization
 *   - Per-zone weight distribution
 *   - Tilt risk warnings
 *   - Before/after comparison
 *
 * PHASE 6: ContainerZone-aware weight distribution
 *   - Accepts containerZones prop from loadout system
 *   - Loads container zones from vehicle if not provided
 *   - Uses spatial bias metadata for accurate CG and zone matching
 *
 * Integrates with weightEngine, stabilityEngine, and weightStore.
 */
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  RefreshControl,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import { useApp } from '../../context/AppContext';
import { getBuilderState, getCachedVehicleZones } from '../../lib/expeditionCache';
import { loadoutItemStore } from '../../lib/loadoutStore';
import {
  computeWeightDashboard,
  computeWeightComparison,
  type WeightDashboardData,
  type WeightComparison,
} from '../../lib/weightDashboardStore';
import { lbsToKg } from '../../lib/weightStore';
import { loadContainerZonesForVehicle } from '../../lib/containerZoneLoader';
import type { ContainerZone } from '../../lib/accessoryFramework';
import { resolveZoneBias } from '../../lib/accessoryFramework';

import CGVisualization from './CGVisualization';
import ZoneWeightBars from './ZoneWeightBars';
import TiltRiskPanel from './TiltRiskPanel';
import WeightComparisonCard from './WeightComparisonCard';

interface Props {
  loadoutId?: string | null;
  wizardSelections?: Record<string, string>;
  vehicleZones?: { id: string; name: string; zone_type?: string }[];
  /** ContainerZone[] from the accessory framework for spatial-bias-aware computation */
  containerZones?: ContainerZone[];
  /** Vehicle ID to auto-load container zones from (if containerZones not provided) */
  vehicleId?: string | null;
  /** If provided, shows before/after comparison */
  pendingItem?: {
    name: string;
    weight_lbs: number;
    quantity: number;
    storage_location: string | null;
  } | null;
  /** Compact mode for embedding in other screens */
  compact?: boolean;
}

export default function WeightDashboardPanel({
  loadoutId: propLoadoutId,
  wizardSelections: propSelections,
  vehicleZones: propZones,
  containerZones: propContainerZones,
  vehicleId: propVehicleId,
  pendingItem,
  compact,
}: Props) {
  const { user } = useApp();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashData, setDashData] = useState<WeightDashboardData | null>(null);
  const [comparison, setComparison] = useState<WeightComparison | null>(null);
  const [showMetric, setShowMetric] = useState(false);
  const [activeSection, setActiveSection] = useState<'overview' | 'zones' | 'stability'>('overview');
  const [resolvedContainerZones, setResolvedContainerZones] = useState<ContainerZone[]>([]);

  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  // Resolve container zones: prop > vehicle load > empty
  useEffect(() => {
    if (propContainerZones && propContainerZones.length > 0) {
      setResolvedContainerZones(propContainerZones);
      return;
    }

    // Try to load from vehicle
    const vid = propVehicleId || getBuilderState()?.vehicleId;
    if (vid) {
      const zones = loadContainerZonesForVehicle(vid);
      if (zones.length > 0) {
        setResolvedContainerZones(zones);
        return;
      }
    }

    setResolvedContainerZones([]);
  }, [propContainerZones, propVehicleId]);

  // Load data
  const loadData = useCallback(async () => {
    try {
      // Get builder state for wizard selections and vehicle info
      const bs = getBuilderState();
      const selections = propSelections || (bs.vehicleId ? getStoredSelections() : {});
      const loadoutId = propLoadoutId || bs.loadoutId;

      // Get vehicle zones
      let zones = propZones;
      if (!zones && bs.vehicleId) {
        const cached = getCachedVehicleZones(bs.vehicleId);
        if (cached.length > 0) {
          zones = cached.map(z => ({
            id: z.id,
            name: z.name,
            zone_type: z.zone_type,
          }));
        }
      }

      // Get loadout items
      let items: { storage_location: string | null; weight_lbs: number | null; quantity: number }[] = [];
      if (loadoutId) {
        try {
          const loadoutItems = await loadoutItemStore.getByLoadoutId(loadoutId, user?.id);
          items = loadoutItems.map(i => ({
            storage_location: i.storage_location,
            weight_lbs: i.weight_lbs,
            quantity: i.quantity,
          }));
        } catch (e) {
          console.warn('[WeightDash] Failed to load items:', e);
        }
      }

      // Compute dashboard data — PHASE 6: pass containerZones for spatial-bias-aware computation
      const data = computeWeightDashboard(
        selections,
        items,
        zones,
        undefined,
        resolvedContainerZones.length > 0 ? resolvedContainerZones : undefined,
      );
      if (mountedRef.current) {
        setDashData(data);
      }

      // Compute comparison if pending item
      if (pendingItem && pendingItem.weight_lbs > 0) {
        const itemsAfter = [
          ...items,
          {
            storage_location: pendingItem.storage_location,
            weight_lbs: pendingItem.weight_lbs,
            quantity: pendingItem.quantity,
          },
        ];
        const comp = computeWeightComparison(
          selections,
          items,
          itemsAfter,
          zones,
          resolvedContainerZones.length > 0 ? resolvedContainerZones : undefined,
        );
        if (mountedRef.current) {
          setComparison(comp);
        }
      } else {
        if (mountedRef.current) setComparison(null);
      }

    } catch (e) {
      console.error('[WeightDash] Error computing dashboard:', e);
    }

    if (mountedRef.current) {
      setLoading(false);
      setRefreshing(false);
    }
  }, [propLoadoutId, propSelections, propZones, pendingItem, user?.id, resolvedContainerZones]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // Bias legend for container zones
  const biasLegend = useMemo(() => {
    if (resolvedContainerZones.length === 0) return null;
    const highCount = resolvedContainerZones.filter(z => resolveZoneBias(z).verticalBias === 'high').length;
    const midCount = resolvedContainerZones.filter(z => resolveZoneBias(z).verticalBias === 'mid').length;
    const lowCount = resolvedContainerZones.filter(z => resolveZoneBias(z).verticalBias === 'low').length;
    return { highCount, midCount, lowCount };
  }, [resolvedContainerZones]);

  // Loading state
  if (loading) {
    return (
      <View style={[styles.container, compact && styles.containerCompact]}>
        <View style={styles.loadingState}>
          <ActivityIndicator size="small" color={TACTICAL.amber} />
          <Text style={styles.loadingText}>COMPUTING WEIGHT DATA...</Text>
        </View>
      </View>
    );
  }

  if (!dashData) {
    return (
      <View style={[styles.container, compact && styles.containerCompact]}>
        <View style={styles.emptyState}>
          <Ionicons name="scale-outline" size={32} color={TACTICAL.textMuted} />
          <Text style={styles.emptyTitle}>NO WEIGHT DATA</Text>
          <Text style={styles.emptySub}>Configure a vehicle and add loadout items to see weight tracking</Text>
        </View>
      </View>
    );
  }

  const totalColor = dashData.loadoutWeight > 0 ? TACTICAL.amber : TACTICAL.textMuted;

  return (
    <ScrollView
      style={[styles.container, compact && styles.containerCompact]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={TACTICAL.amber} />
      }
    >
      {/* Dashboard Header */}
      <View style={styles.dashHeader}>
        <View style={styles.dashHeaderLeft}>
          <Ionicons name="analytics-outline" size={18} color={TACTICAL.amber} />
          <View>
            <Text style={styles.dashBrand}>WEIGHT TRACKING</Text>
            <Text style={styles.dashTitle}>REAL-TIME DASHBOARD</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.unitToggle}
          onPress={() => setShowMetric(!showMetric)}
          activeOpacity={0.7}
        >
          <Text style={styles.unitToggleText}>{showMetric ? 'KG' : 'LBS'}</Text>
        </TouchableOpacity>
      </View>

      {/* Container Zone Bias Banner (Phase 6) */}
      {resolvedContainerZones.length > 0 && biasLegend && (
        <View style={styles.biasBanner}>
          <Ionicons name="git-network-outline" size={12} color={TACTICAL.amber} />
          <Text style={styles.biasBannerText}>
            SPATIAL BIAS ACTIVE — {resolvedContainerZones.length} ZONES
          </Text>
          <View style={styles.biasChips}>
            {biasLegend.highCount > 0 && (
              <View style={[styles.biasChip, { borderColor: 'rgba(239, 83, 80, 0.4)' }]}>
                <View style={[styles.biasDot, { backgroundColor: '#EF5350' }]} />
                <Text style={[styles.biasChipText, { color: '#EF5350' }]}>HIGH {biasLegend.highCount}</Text>
              </View>
            )}
            {biasLegend.midCount > 0 && (
              <View style={[styles.biasChip, { borderColor: 'rgba(196, 138, 44, 0.4)' }]}>
                <View style={[styles.biasDot, { backgroundColor: TACTICAL.amber }]} />
                <Text style={[styles.biasChipText, { color: TACTICAL.amber }]}>MID {biasLegend.midCount}</Text>
              </View>
            )}
            {biasLegend.lowCount > 0 && (
              <View style={[styles.biasChip, { borderColor: 'rgba(102, 187, 106, 0.4)' }]}>
                <View style={[styles.biasDot, { backgroundColor: '#66BB6A' }]} />
                <Text style={[styles.biasChipText, { color: '#66BB6A' }]}>LOW {biasLegend.lowCount}</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Total Weight Hero */}
      <View style={styles.heroCard}>
        <View style={styles.heroRow}>
          <View style={styles.heroMain}>
            <Text style={[styles.heroValue, { color: totalColor }]}>
              {showMetric
                ? lbsToKg(dashData.totalVehicleWeight).toLocaleString()
                : dashData.totalVehicleWeight.toLocaleString()
              }
            </Text>
            <Text style={styles.heroUnit}>{showMetric ? 'KG' : 'LBS'}</Text>
          </View>
          <Text style={styles.heroLabel}>TOTAL VEHICLE WEIGHT</Text>
        </View>

        {/* Weight breakdown */}
        <View style={styles.breakdownRow}>
          <View style={styles.breakdownItem}>
            <View style={[styles.breakdownDot, { backgroundColor: '#66BB6A' }]} />
            <Text style={styles.breakdownLabel}>BASE</Text>
            <Text style={styles.breakdownValue}>
              {showMetric
                ? lbsToKg(dashData.baseVehicleWeight)
                : dashData.baseVehicleWeight
              }
            </Text>
          </View>
          <View style={styles.breakdownDivider} />
          <View style={styles.breakdownItem}>
            <View style={[styles.breakdownDot, { backgroundColor: '#42A5F5' }]} />
            <Text style={styles.breakdownLabel}>HARDWARE</Text>
            <Text style={styles.breakdownValue}>
              {showMetric
                ? lbsToKg(dashData.hardwareWeight)
                : dashData.hardwareWeight
              }
            </Text>
          </View>
          <View style={styles.breakdownDivider} />
          <View style={styles.breakdownItem}>
            <View style={[styles.breakdownDot, { backgroundColor: TACTICAL.amber }]} />
            <Text style={styles.breakdownLabel}>LOADOUT</Text>
            <Text style={[styles.breakdownValue, { color: TACTICAL.amber }]}>
              {showMetric
                ? lbsToKg(dashData.loadoutWeight)
                : dashData.loadoutWeight
              }
            </Text>
          </View>
        </View>

        {/* Weight composition bar */}
        <View style={styles.compositionBar}>
          <View
            style={[
              styles.compositionSegment,
              {
                flex: dashData.baseVehicleWeight,
                backgroundColor: 'rgba(102, 187, 106, 0.5)',
                borderTopLeftRadius: 3,
                borderBottomLeftRadius: 3,
              },
            ]}
          />
          <View
            style={[
              styles.compositionSegment,
              {
                flex: Math.max(dashData.hardwareWeight, 1),
                backgroundColor: 'rgba(66, 165, 245, 0.5)',
              },
            ]}
          />
          <View
            style={[
              styles.compositionSegment,
              {
                flex: Math.max(dashData.loadoutWeight, 1),
                backgroundColor: 'rgba(196, 138, 44, 0.6)',
                borderTopRightRadius: 3,
                borderBottomRightRadius: 3,
              },
            ]}
          />
        </View>
      </View>

      {/* Section Tabs */}
      {!compact && (
        <View style={styles.sectionTabs}>
          {(['overview', 'zones', 'stability'] as const).map(tab => {
            const isActive = activeSection === tab;
            const icons: Record<string, string> = {
              overview: 'grid-outline',
              zones: 'layers-outline',
              stability: 'speedometer-outline',
            };
            return (
              <TouchableOpacity
                key={tab}
                style={[styles.sectionTab, isActive && styles.sectionTabActive]}
                onPress={() => setActiveSection(tab)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={icons[tab] as any}
                  size={14}
                  color={isActive ? TACTICAL.amber : TACTICAL.textMuted}
                />
                <Text style={[styles.sectionTabText, isActive && styles.sectionTabTextActive]}>
                  {tab.toUpperCase()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Before/After Comparison (if pending item) */}
      {comparison && (
        <View style={styles.section}>
          <WeightComparisonCard
            comparison={comparison}
            itemName={pendingItem?.name}
          />
        </View>
      )}

      {/* Overview / CG Section */}
      {(activeSection === 'overview' || compact) && (
        <View style={styles.section}>
          <CGVisualization
            cgResult={dashData.cgResult}
            stability={dashData.stability}
            frontAxlePercent={dashData.frontAxlePercent}
            rearAxlePercent={dashData.rearAxlePercent}
            totalWeight={dashData.totalVehicleWeight}
          />
        </View>
      )}

      {/* Zones Section */}
      {(activeSection === 'zones' || activeSection === 'overview' || compact) && (
        <View style={styles.section}>
          <ZoneWeightBars
            zones={dashData.zoneSummary.zones}
            warnings={dashData.zoneWarnings}
            totalLoadoutWeight={dashData.loadoutWeight}
            containerZones={resolvedContainerZones.length > 0 ? resolvedContainerZones : undefined}
          />
        </View>
      )}

      {/* Stability Section */}
      {(activeSection === 'stability' || activeSection === 'overview' || compact) && (
        <View style={styles.section}>
          <TiltRiskPanel
            tiltRisk={dashData.tiltRisk}
            stability={dashData.stability}
          />
        </View>
      )}

      {/* Zone Limit Warnings (if any overweight) */}
      {dashData.zoneWarnings.filter(w => w.severity === 'overweight').length > 0 && (
        <View style={styles.alertBanner}>
          <Ionicons name="warning" size={16} color="#EF5350" />
          <View style={{ flex: 1 }}>
            <Text style={styles.alertTitle}>ZONE CAPACITY EXCEEDED</Text>
            {dashData.zoneWarnings
              .filter(w => w.severity === 'overweight')
              .map(w => (
                <Text key={w.zoneId} style={styles.alertText}>
                  {w.zoneName}: {w.currentWeight} / {w.capacityLbs} lbs ({w.utilizationPct}%)
                </Text>
              ))
            }
          </View>
        </View>
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {`ECS WEIGHT TRACKING | MODULES: ${dashData.cgResult.modules.length} |${dashData.stability.isAdvanced ? ' ADVANCED MODEL' : ' BASELINE MODEL'}${resolvedContainerZones.length > 0 ? ` | SPATIAL BIAS: ${resolvedContainerZones.length} ZONES` : ''}`}
        </Text>
      </View>
    </ScrollView>
  );
}

// Helper to get stored wizard selections
function getStoredSelections(): Record<string, string> {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('ecs_wizard_selections');
      if (raw) return JSON.parse(raw);
    }
  } catch {}
  return {};
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TACTICAL.bg,
  },
  containerCompact: {
    flex: 0,
  },
  scrollContent: {
    paddingBottom: 100,
  },

  // Loading
  loadingState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 40,
  },
  loadingText: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },

  // Empty
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 40,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 1.5,
  },
  emptySub: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },

  // Dashboard Header
  dashHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'web' ? 16 : 54,
    paddingBottom: 12,
  },
  dashHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dashBrand: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
  dashTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },
  unitToggle: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: TACTICAL.panel,
  },
  unitToggleText: {
    fontSize: 10,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1,
  },

  // Bias banner (Phase 6)
  biasBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(196, 138, 44, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.15)',
    flexWrap: 'wrap',
  },
  biasBannerText: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
    flex: 1,
  },
  biasChips: {
    flexDirection: 'row',
    gap: 6,
  },
  biasChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  biasDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  biasChipText: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  // Hero card
  heroCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: TACTICAL.panel,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    padding: 16,
    gap: 12,
  },
  heroRow: {
    alignItems: 'center',
  },
  heroMain: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  heroValue: {
    fontSize: 42,
    fontWeight: '900',
    fontFamily: 'Courier',
  },
  heroUnit: {
    fontSize: 14,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
  heroLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 3,
    marginTop: 2,
  },

  // Breakdown
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
  },
  breakdownItem: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  breakdownDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  breakdownLabel: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  breakdownValue: {
    fontSize: 13,
    fontWeight: '900',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },
  breakdownDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(62, 79, 60, 0.2)',
  },

  // Composition bar
  compositionBar: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: 'rgba(62, 79, 60, 0.1)',
  },
  compositionSegment: {
    height: '100%',
  },

  // Section tabs
  sectionTabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: TACTICAL.panel,
    overflow: 'hidden',
  },
  sectionTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  sectionTabActive: {
    backgroundColor: 'rgba(196, 138, 44, 0.1)',
    borderBottomWidth: 2,
    borderBottomColor: TACTICAL.amber,
  },
  sectionTabText: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  sectionTabTextActive: {
    color: TACTICAL.amber,
  },

  // Sections
  section: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },

  // Alert banner
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    backgroundColor: 'rgba(239, 83, 80, 0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239, 83, 80, 0.25)',
  },
  alertTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#EF5350',
    letterSpacing: 1,
    marginBottom: 4,
  },
  alertText: {
    fontSize: 10,
    color: TACTICAL.text,
    lineHeight: 16,
    fontFamily: 'Courier',
  },

  // Footer
  footer: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  footerText: {
    fontSize: 8,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
    textAlign: 'center',
  },
});






