/**
 * WeightDashboardPanel — Real-Time Weight Tracking Dashboard
 *
 * Main container that aggregates:
 *   - Total vehicle weight gauge
 *   - CG visualization
 *   - Compact supporting values for operating weight and center of gravity
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
  RefreshControl,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import { NON_OBSTRUCTIVE_REFRESH_CONTROL_PROPS } from '../../lib/nonObstructiveRefreshControl';
import { getBuilderState } from '../../lib/expeditionCache';
import { loadoutItemStore, loadoutStore } from '../../lib/loadoutStore';
import { type WeightDashboardData } from '../../lib/weightDashboardStore';
import { lbsToKg } from '../../lib/weightStore';
import type { ContainerZone } from '../../lib/accessoryFramework';
import { vehicleStore } from '../../lib/vehicleStore';
import { vehicleSpecStore } from '../../lib/vehicleSpecStore';
import { consumablesStore } from '../../lib/consumablesStore';
import { tiresLiftStore } from '../../lib/tiresLiftStore';
import { selectFleetVehicleState } from '../../lib/fleet/fleetVehicleStateSelectors';

import CGVisualization from './CGVisualization';

interface Props {
  loadoutId?: string | null;
  wizardSelections?: Record<string, string>;
  vehicleZones?: { id: string; name: string; zone_type?: string }[];
  /** ContainerZone[] from the accessory framework for spatial-bias-aware computation */
  containerZones?: ContainerZone[];
  /** Vehicle ID to auto-load container zones from (if containerZones not provided) */
  vehicleId?: string | null;
  /** Reserved for embedded add-item previews; ignored by the fixed Fleet summary dashboard. */
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
  vehicleId: propVehicleId,
  compact,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashData, setDashData] = useState<WeightDashboardData | null>(null);
  const [showMetric, setShowMetric] = useState(false);
  const [dataRevision, setDataRevision] = useState(0);

  const mountedRef = useRef(true);
  const builderState = getBuilderState();
  const effectiveVehicleId = propVehicleId || builderState?.vehicleId || null;
  const canonicalVehicleState = useMemo(() => {
    void dataRevision;
    return selectFleetVehicleState(effectiveVehicleId);
  }, [dataRevision, effectiveVehicleId]);
  const effectiveLoadoutId = propLoadoutId || canonicalVehicleState?.activeLoadout?.id || builderState?.loadoutId || null;

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  // Load data
  const loadData = useCallback(async () => {
    void dataRevision;
    try {
      const fleetState = selectFleetVehicleState(effectiveVehicleId);
      if (!fleetState) {
        if (mountedRef.current) {
          setDashData(null);
          setLoading(false);
          setRefreshing(false);
        }
        return;
      }
      if (mountedRef.current) {
        setDashData(fleetState.operatingWeight.dashboardData);
      }

    } catch (e) {
      console.error('[WeightDash] Error computing dashboard:', e);
    }

    if (mountedRef.current) {
      setLoading(false);
      setRefreshing(false);
    }
  }, [
    effectiveVehicleId,
    dataRevision,
  ]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const offItems = loadoutItemStore.subscribe((updatedLoadoutId) => {
      if (effectiveLoadoutId && updatedLoadoutId === effectiveLoadoutId) {
        setDataRevision((revision) => revision + 1);
      }
    });
    const offLoadouts = loadoutStore.subscribe((updatedLoadoutId, updatedVehicleId) => {
      if (
        (effectiveLoadoutId && updatedLoadoutId === effectiveLoadoutId) ||
        (effectiveVehicleId && updatedVehicleId === effectiveVehicleId)
      ) {
        setDataRevision((revision) => revision + 1);
      }
    });
    const offVehicles = vehicleStore.subscribe((event) => {
      if (!effectiveVehicleId || event.vehicleId === effectiveVehicleId) {
        setDataRevision((revision) => revision + 1);
      }
    });
    const offSpecs = vehicleSpecStore.subscribe(() => {
      if (effectiveVehicleId) {
        setDataRevision((revision) => revision + 1);
      }
    });
    const offConsumables = consumablesStore.subscribe(() => {
      if (effectiveVehicleId) {
        setDataRevision((revision) => revision + 1);
      }
    });
    const offTiresLift = tiresLiftStore.subscribe((vehicleId) => {
      if (!effectiveVehicleId || vehicleId === effectiveVehicleId) {
        setDataRevision((revision) => revision + 1);
      }
    });
    return () => {
      offItems();
      offLoadouts();
      offVehicles();
      offSpecs();
      offConsumables();
      offTiresLift();
    };
  }, [effectiveLoadoutId, effectiveVehicleId]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

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
  const meta = dashData.operatingWeightMeta;
  const payloadMarginLabel =
    meta?.payloadRemainingLb == null
      ? 'UNKNOWN'
      : `${meta.payloadRemainingLb < 0 ? '-' : ''}${showMetric
          ? lbsToKg(Math.abs(meta.payloadRemainingLb)).toLocaleString()
          : Math.round(Math.abs(meta.payloadRemainingLb)).toLocaleString()
        } ${showMetric ? 'kg' : 'lb'}`;
  const payloadTone =
    meta?.payloadRemainingLb == null
      ? TACTICAL.textMuted
      : meta.payloadRemainingLb < 0
        ? '#EF5350'
        : TACTICAL.amber;
  const activeLoadZoneCount = dashData.zoneSummary.zones.filter((zone) => zone.totalWeightLbs > 0).length;

  return (
    <ScrollView
      style={[styles.container, compact && styles.containerCompact]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          {...NON_OBSTRUCTIVE_REFRESH_CONTROL_PROPS}
          refreshing={refreshing}
          onRefresh={handleRefresh}
        />
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
          <Text style={styles.heroLabel}>TOTAL OPERATING WEIGHT</Text>
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

      <View style={styles.supportGrid}>
        <View style={styles.supportCard}>
          <Text style={styles.supportLabel}>FRONT AXLE</Text>
          <Text style={styles.supportValue}>{dashData.frontAxlePercent}%</Text>
          <Text style={styles.supportMeta}>{dashData.frontAxleLoad.toLocaleString()} lb</Text>
        </View>
        <View style={styles.supportCard}>
          <Text style={styles.supportLabel}>REAR AXLE</Text>
          <Text style={styles.supportValue}>{dashData.rearAxlePercent}%</Text>
          <Text style={styles.supportMeta}>{dashData.rearAxleLoad.toLocaleString()} lb</Text>
        </View>
        <View style={styles.supportCard}>
          <Text style={styles.supportLabel}>CG MODEL</Text>
          <Text style={styles.supportValue}>{dashData.cgResult.modules.length}</Text>
          <Text style={styles.supportMeta}>tracked modules</Text>
        </View>
        <View style={styles.supportCard}>
          <Text style={styles.supportLabel}>LOAD ZONES</Text>
          <Text style={styles.supportValue}>{activeLoadZoneCount}</Text>
          <Text style={styles.supportMeta}>active weighted zones</Text>
        </View>
        <View style={styles.supportCard}>
          <Text style={styles.supportLabel}>PAYLOAD MARGIN</Text>
          <Text style={[styles.supportValue, { color: payloadTone }]}>{payloadMarginLabel}</Text>
          <Text style={styles.supportMeta}>
            {meta?.gvwrLb ? `GVWR ${Math.round(meta.gvwrLb).toLocaleString()} lb` : 'GVWR unavailable'}
          </Text>
        </View>
        <View style={styles.supportCard}>
          <Text style={styles.supportLabel}>CONFIDENCE</Text>
          <Text style={styles.supportValue}>{meta ? `${Math.round(meta.confidenceScore)}%` : '--'}</Text>
          <Text style={styles.supportMeta}>
            {meta?.gvwrUsagePct != null ? `${meta.gvwrUsagePct}% GVWR used` : 'partial data'}
          </Text>
        </View>
      </View>

      {meta?.payloadRemainingLb != null && meta.payloadRemainingLb < 0 ? (
        <View style={styles.statusBanner}>
          <Ionicons name="warning" size={16} color="#EF5350" />
          <Text style={[styles.statusBannerText, { color: '#EF5350' }]}>
            Operating weight exceeds known GVWR. Reduce load before staging.
          </Text>
        </View>
      ) : null}

      {meta?.partialDataReasons.length ? (
        <View style={styles.statusBanner}>
          <Ionicons name="information-circle-outline" size={16} color={TACTICAL.amber} />
          <Text style={styles.statusBannerText} numberOfLines={3}>
            {meta.partialDataReasons[0]}
          </Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <CGVisualization
          cgResult={dashData.cgResult}
          stability={dashData.stability}
          frontAxlePercent={dashData.frontAxlePercent}
          rearAxlePercent={dashData.rearAxlePercent}
          totalWeight={dashData.totalVehicleWeight}
          vehicleType={dashData.vehicleType}
        />
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {`ECS WEIGHT TRACKING | REAL VEHICLE + BUILD + LOADOUT | MODULES: ${dashData.cgResult.modules.length} |${dashData.stability.isAdvanced ? ' ADVANCED MODEL' : ' BASELINE MODEL'}`}
        </Text>
      </View>
    </ScrollView>
  );
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
    paddingTop: 16,
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

  supportGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  supportCard: {
    flexGrow: 1,
    flexBasis: '46%',
    minWidth: 132,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: TACTICAL.panel,
  },
  supportLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.4,
    marginBottom: 5,
  },
  supportValue: {
    fontSize: 18,
    fontWeight: '900',
    color: TACTICAL.amber,
    fontFamily: 'Courier',
  },
  supportMeta: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    marginTop: 3,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.22)',
    backgroundColor: 'rgba(196, 138, 44, 0.07)',
  },
  statusBannerText: {
    flex: 1,
    minWidth: 0,
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 0.4,
    lineHeight: 15,
  },

  // Sections
  section: {
    paddingHorizontal: 16,
    marginBottom: 12,
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






