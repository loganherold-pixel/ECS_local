import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import { supabase } from '../../lib/supabase';

// ============================================================
// TYPES
// ============================================================
interface WaterWaypoint {
  id: string;
  name: string;
  eta: string;
  water_resupply_gal: number | null;
  is_primary_resupply: boolean;
}

interface NextWaterResupplyCardProps {
  expeditionId: string;
  expeditionStatus: string;
  currentWaterGal: number | null;
  waterCapacityGal: number | null;
  waterDailyUseGal: number | null;
}

// ============================================================
// HELPERS
// ============================================================
function formatEta(etaStr: string): string {
  try {
    const d = new Date(etaStr);
    if (isNaN(d.getTime())) return etaStr;
    const month = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
    const day = d.getDate();
    const hours = d.getHours().toString().padStart(2, '0');
    const mins = d.getMinutes().toString().padStart(2, '0');
    return `${day} ${month} ${hours}:${mins}`;
  } catch {
    return etaStr;
  }
}

function formatHoursToReadable(hours: number): string {
  if (hours < 1) {
    const mins = Math.round(hours * 60);
    return `${mins}m`;
  }
  if (hours < 24) {
    return `${Math.round(hours * 10) / 10}h`;
  }
  const days = Math.floor(hours / 24);
  const remainHrs = Math.round(hours % 24);
  if (remainHrs === 0) return `${days}d`;
  return `${days}d ${remainHrs}h`;
}

function getProjectionColor(gal: number, capacity: number): string {
  if (gal <= 0) return TACTICAL.danger;
  const pct = (gal / capacity) * 100;
  if (pct < 20) return TACTICAL.danger;
  if (pct < 50) return TACTICAL.amber;
  return '#4CAF50';
}

// ============================================================
// COMPONENT
// ============================================================
export default function NextWaterResupplyCard({
  expeditionId,
  expeditionStatus,
  currentWaterGal,
  waterCapacityGal,
  waterDailyUseGal,
}: NextWaterResupplyCardProps) {
  const [nextWater, setNextWater] = useState<WaterWaypoint | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const dailyUse = waterDailyUseGal ?? 2.0;
  const currentGal = currentWaterGal ?? 0;
  const capacity = waterCapacityGal ?? 0;
  const hasCapacity = capacity > 0;

  // ── Fetch next primary water waypoint ────────────────────
  const fetchNextWater = useCallback(async () => {
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('expedition_waypoints')
        .select('id, name, eta, water_resupply_gal, is_primary_resupply')
        .eq('expedition_id', expeditionId)
        .eq('waypoint_type', 'water')
        .eq('is_primary_resupply', true)
        .gte('eta', new Date().toISOString())
        .order('eta', { ascending: true })
        .limit(1);

      if (err) throw err;
      setNextWater(data && data.length > 0 ? data[0] : null);
    } catch {
      setError('FAILED TO LOAD WATER RESUPPLY POINTS');
    }
    setLoading(false);
  }, [expeditionId]);

  useEffect(() => {
    fetchNextWater();
  }, [fetchNextWater]);

  // Auto-refresh every 60s when active
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (expeditionStatus === 'active') {
      intervalRef.current = setInterval(() => {
        setNow(Date.now());
        fetchNextWater();
      }, 60_000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [expeditionStatus, fetchNextWater]);

  // ── Compute projections ──────────────────────────────────
  const projections = useMemo(() => {
    if (!nextWater?.eta || !hasCapacity) return null;

    const etaTime = new Date(nextWater.eta).getTime();
    if (isNaN(etaTime)) return null;

    const hoursToNext = Math.max(0, (etaTime - now) / (1000 * 60 * 60));
    const waterUsedToNext = dailyUse * (hoursToNext / 24);
    const projectedOnArrival = currentGal - waterUsedToNext;
    const projectedOnArrivalPct = Math.round((projectedOnArrival / capacity) * 100);

    let projectedAfterResupply: number | null = null;
    let projectedAfterResupplyPct: number | null = null;

    if (nextWater.water_resupply_gal != null && nextWater.water_resupply_gal > 0) {
      projectedAfterResupply = Math.min(capacity, projectedOnArrival + nextWater.water_resupply_gal);
      projectedAfterResupplyPct = Math.round((projectedAfterResupply / capacity) * 100);
    }

    // Alert levels
    let alertLevel: 'critical' | 'warning' | 'ok' = 'ok';
    if (projectedOnArrival < 0) alertLevel = 'critical';
    else if (projectedOnArrival < 1.0) alertLevel = 'warning';

    return {
      hoursToNext,
      waterUsedToNext: Math.round(waterUsedToNext * 10) / 10,
      projectedOnArrival: Math.round(projectedOnArrival * 10) / 10,
      projectedOnArrivalPct,
      projectedAfterResupply: projectedAfterResupply !== null
        ? Math.round(projectedAfterResupply * 10) / 10 : null,
      projectedAfterResupplyPct,
      alertLevel,
    };
  }, [nextWater, now, currentGal, capacity, dailyUse, hasCapacity]);

  // ── No capacity configured ───────────────────────────────
  if (!hasCapacity) {
    return null; // Don't render if no water capacity
  }

  // ── Loading ──────────────────────────────────────────────
  if (loading) {
    return (
      <View style={s.card}>
        <View style={s.cardHeader}>
          <Ionicons name="navigate-outline" size={16} color="#29B6F6" />
          <Text style={s.cardTitle}>ECS WATER RESUPPLY</Text>
        </View>
        <View style={s.loadingBox}>
          <ActivityIndicator size="small" color={TACTICAL.accent} />
          <Text style={s.loadingText}>SCANNING ROUTE POINTS...</Text>
        </View>
      </View>
    );
  }

  // ── Error ────────────────────────────────────────────────
  if (error) {
    return (
      <View style={s.card}>
        <View style={s.cardHeader}>
          <Ionicons name="navigate-outline" size={16} color={TACTICAL.danger} />
          <Text style={s.cardTitle}>ECS WATER RESUPPLY</Text>
        </View>
        <View style={s.errorBox}>
          <Ionicons name="alert-circle" size={16} color={TACTICAL.danger} />
          <Text style={s.errorText}>{error}</Text>
        </View>
      </View>
    );
  }

  // ── No upcoming water waypoint ───────────────────────────
  if (!nextWater) {
    return (
      <View style={s.card}>
        <View style={s.cardHeader}>
          <Ionicons name="navigate-outline" size={16} color={TACTICAL.textMuted} />
          <Text style={s.cardTitle}>ECS WATER RESUPPLY</Text>
        </View>
        <View style={s.emptyBox}>
          <Ionicons name="water-outline" size={28} color={TACTICAL.textMuted} />
          <Text style={s.emptyTitle}>NO UPCOMING WATER RESUPPLY</Text>
          <Text style={s.emptySub}>
            Add a water route point with ETA to enable projection
          </Text>
        </View>
      </View>
    );
  }

  // ── Full projection card ─────────────────────────────────
  const p = projections;
  const arrivalColor = p ? getProjectionColor(p.projectedOnArrival, capacity) : TACTICAL.textMuted;
  const afterColor = p?.projectedAfterResupply != null
    ? getProjectionColor(p.projectedAfterResupply, capacity) : TACTICAL.textMuted;
  const isCritical = p?.alertLevel === 'critical';
  const isWarning = p?.alertLevel === 'warning';

  return (
    <View style={[s.card, isCritical && s.cardCritical, isWarning && s.cardWarning]}>
      {/* Critical / Warning Banner */}
      {isCritical && (
        <View style={s.alertBanner}>
          <Ionicons name="warning" size={14} color={TACTICAL.danger} />
          <Text style={s.alertBannerText}>WATER DEFICIT BEFORE NEXT RESUPPLY</Text>
          <Ionicons name="warning" size={14} color={TACTICAL.danger} />
        </View>
      )}
      {isWarning && !isCritical && (
        <View style={s.warnBanner}>
          <Ionicons name="alert-circle" size={14} color={TACTICAL.amber} />
          <Text style={s.warnBannerText}>LOW WATER RESERVE BEFORE NEXT RESUPPLY</Text>
        </View>
      )}

      {/* Header */}
      <View style={s.cardHeader}>
        <Ionicons name="navigate-outline" size={16} color="#29B6F6" />
        <Text style={s.cardTitle}>ECS WATER RESUPPLY</Text>
        {expeditionStatus === 'active' && (
          <View style={s.liveBadge}>
            <View style={s.liveDot} />
            <Text style={s.liveText}>LIVE</Text>
          </View>
        )}
      </View>

      {/* Waypoint Name + ETA */}
      <View style={s.waypointRow}>
        <View style={s.waypointNameCol}>
          <View style={s.waypointNameRow}>
            <Ionicons name="water" size={14} color="#29B6F6" />
            <Text style={s.waypointName} numberOfLines={1}>{nextWater.name}</Text>
          </View>
          {nextWater.eta && (
            <View style={s.etaRow}>
              <Ionicons name="time-outline" size={12} color={TACTICAL.textMuted} />
              <Text style={s.etaText}>ETA: {formatEta(nextWater.eta)}</Text>
            </View>
          )}
        </View>
        {p && (
          <View style={s.countdownCol}>
            <Text style={s.countdownValue}>{formatHoursToReadable(p.hoursToNext)}</Text>
            <Text style={s.countdownLabel}>TO ARRIVAL</Text>
          </View>
        )}
      </View>

      {/* Consumption en route */}
      {p && (
        <View style={s.consumptionRow}>
          <Ionicons name="trending-down-outline" size={13} color={TACTICAL.textMuted} />
          <Text style={s.consumptionText}>
            EST. CONSUMPTION EN ROUTE: {p.waterUsedToNext} GAL
          </Text>
          <Text style={s.consumptionMeta}>@ {dailyUse} gal/day</Text>
        </View>
      )}

      {/* Projected on arrival */}
      {p && (
        <View style={[s.projectionBlock, { borderLeftColor: arrivalColor }]}>
          <View style={s.projectionHeader}>
            <Ionicons name="analytics-outline" size={14} color={arrivalColor} />
            <Text style={s.projectionTitle}>PROJECTED ON ARRIVAL</Text>
          </View>
          <View style={s.projectionValueRow}>
            <Text style={[s.projectionGal, { color: arrivalColor }]}>
              {p.projectedOnArrival < 0 ? '0.0' : p.projectedOnArrival} GAL
            </Text>
            <View style={[s.projectionPctBadge, { borderColor: arrivalColor }]}>
              <Text style={[s.projectionPctText, { color: arrivalColor }]}>
                {p.projectedOnArrivalPct < 0 ? 'DEFICIT' : `${p.projectedOnArrivalPct}%`}
              </Text>
            </View>
          </View>
          {/* Arrival bar */}
          <View style={s.arrivalBarTrack}>
            <View
              style={[
                s.arrivalBarFill,
                {
                  width: `${Math.max(0, Math.min(100, p.projectedOnArrivalPct))}%`,
                  backgroundColor: arrivalColor,
                },
              ]}
            />
          </View>
          {p.projectedOnArrival < 0 && (
            <View style={s.deficitRow}>
              <Ionicons name="alert-circle" size={12} color={TACTICAL.danger} />
              <Text style={s.deficitText}>
                DEFICIT: {Math.abs(p.projectedOnArrival)} GAL SHORT
              </Text>
            </View>
          )}
        </View>
      )}

      {/* After resupply projection */}
      {p && p.projectedAfterResupply !== null && p.projectedAfterResupplyPct !== null && (
        <View style={[s.projectionBlock, { borderLeftColor: afterColor }]}>
          <View style={s.projectionHeader}>
            <Ionicons name="arrow-up-circle-outline" size={14} color={afterColor} />
            <Text style={s.projectionTitle}>POST-RESUPPLY</Text>
            {nextWater.water_resupply_gal != null && (
              <Text style={s.resupplyAmtText}>+{nextWater.water_resupply_gal} GAL</Text>
            )}
          </View>
          <View style={s.projectionValueRow}>
            <Text style={[s.projectionGal, { color: afterColor }]}>
              {p.projectedAfterResupply} GAL
            </Text>
            <View style={[s.projectionPctBadge, { borderColor: afterColor }]}>
              <Text style={[s.projectionPctText, { color: afterColor }]}>
                {p.projectedAfterResupplyPct}%
              </Text>
            </View>
          </View>
          {/* After resupply bar */}
          <View style={s.arrivalBarTrack}>
            <View
              style={[
                s.arrivalBarFill,
                {
                  width: `${Math.max(0, Math.min(100, p.projectedAfterResupplyPct))}%`,
                  backgroundColor: afterColor,
                },
              ]}
            />
          </View>
        </View>
      )}

      {/* Current water snapshot */}
      <View style={s.currentSnapshotRow}>
        <View style={s.snapshotItem}>
          <Text style={s.snapshotLabel}>CURRENT</Text>
          <Text style={s.snapshotValue}>{currentGal} GAL</Text>
        </View>
        <View style={s.snapshotDivider} />
        <View style={s.snapshotItem}>
          <Text style={s.snapshotLabel}>CAPACITY</Text>
          <Text style={s.snapshotValue}>{capacity} GAL</Text>
        </View>
        <View style={s.snapshotDivider} />
        <View style={s.snapshotItem}>
          <Text style={s.snapshotLabel}>DAILY USE</Text>
          <Text style={s.snapshotValue}>{dailyUse} GAL</Text>
        </View>
      </View>
    </View>
  );
}

// ============================================================
// STYLES
// ============================================================
const s = StyleSheet.create({
  card: {
    backgroundColor: TACTICAL.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    overflow: 'hidden',
    marginBottom: 16,
  },
  cardCritical: {
    borderColor: 'rgba(192,57,43,0.5)',
  },
  cardWarning: {
    borderColor: 'rgba(196,138,44,0.5)',
  },

  // Alert banners
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    backgroundColor: 'rgba(192,57,43,0.18)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(192,57,43,0.35)',
  },
  alertBannerText: {
    fontSize: 10,
    fontWeight: '900',
    color: TACTICAL.danger,
    letterSpacing: 1.5,
  },
  warnBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    backgroundColor: 'rgba(196,138,44,0.12)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(196,138,44,0.3)',
  },
  warnBannerText: {
    fontSize: 10,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.2,
  },

  // Header
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  cardTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 2,
    flex: 1,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(76,175,80,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.3)',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4CAF50',
  },
  liveText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#4CAF50',
    letterSpacing: 1.5,
  },

  // Waypoint name + ETA
  waypointRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  waypointNameCol: {
    flex: 1,
    gap: 4,
  },
  waypointNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  waypointName: {
    fontSize: 16,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 0.3,
    flex: 1,
  },
  etaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 22,
  },
  etaText: {
    fontSize: 11,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
    fontFamily: 'Courier',
  },
  countdownCol: {
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(41,182,246,0.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(41,182,246,0.2)',
    minWidth: 72,
  },
  countdownValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#29B6F6',
    fontFamily: 'Courier',
    letterSpacing: -0.5,
  },
  countdownLabel: {
    fontSize: 7,
    fontWeight: '800',
    color: '#29B6F6',
    letterSpacing: 1.5,
    marginTop: 2,
  },

  // Consumption row
  consumptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 8,
    marginBottom: 12,
  },
  consumptionText: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
    flex: 1,
  },
  consumptionMeta: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.textMuted,
  },

  // Projection blocks
  projectionBlock: {
    marginHorizontal: 16,
    marginBottom: 10,
    paddingLeft: 14,
    paddingRight: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 8,
    borderLeftWidth: 3,
  },
  projectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  projectionTitle: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
    flex: 1,
  },
  resupplyAmtText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#29B6F6',
    letterSpacing: 0.5,
    fontFamily: 'Courier',
  },
  projectionValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  projectionGal: {
    fontSize: 22,
    fontWeight: '900',
    fontFamily: 'Courier',
    letterSpacing: -0.5,
  },
  projectionPctBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  projectionPctText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // Arrival bar
  arrivalBarTrack: {
    height: 6,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  arrivalBarFill: {
    height: '100%',
    borderRadius: 3,
  },

  // Deficit
  deficitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(192,57,43,0.12)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(192,57,43,0.25)',
  },
  deficitText: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.danger,
    letterSpacing: 1,
  },

  // Current snapshot
  currentSnapshotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 8,
  },
  snapshotItem: {
    flex: 1,
    alignItems: 'center',
  },
  snapshotLabel: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
    marginBottom: 3,
  },
  snapshotValue: {
    fontSize: 12,
    fontWeight: '900',
    color: TACTICAL.text,
    fontFamily: 'Courier',
    letterSpacing: 0.5,
  },
  snapshotDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(62,79,60,0.3)',
  },

  // Loading / Error / Empty
  loadingBox: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  loadingText: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 16,
  },
  errorText: {
    fontSize: 11,
    fontWeight: '700',
    color: TACTICAL.danger,
    letterSpacing: 0.5,
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  emptySub: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },
});



