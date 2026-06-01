import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import type { ExpeditionWaypoint, RouteSegment, RouteSummary, WaypointType } from '../../lib/types';
import RouteMapView from './RouteMapView';
import RouteMetadataCard from './RouteMetadataCard';
import CurrentPositionCard from './CurrentPositionCard';
import GpxImportButton from './GpxImportButton';

// ============================================================
// TYPE BADGE CONFIG
// ============================================================
const TYPE_CFG: Record<WaypointType, { label: string; icon: string; color: string }> = {
  stop: { label: 'STOP', icon: 'location-outline', color: '#5B8DEF' },
  camp: { label: 'CAMP', icon: 'bonfire-outline', color: '#4CAF50' },
  resupply: { label: 'RESUPPLY', icon: 'cart-outline', color: TACTICAL.amber },
  water: { label: 'WATER', icon: 'water-outline', color: '#29B6F6' },
  fuel: { label: 'FUEL', icon: 'flask-outline', color: '#FF9800' },
  poi: { label: 'POI', icon: 'star-outline', color: '#9B59B6' },
  hazard: { label: 'HAZARD', icon: 'warning-outline', color: TACTICAL.danger },
};

// ============================================================
// HAVERSINE DISTANCE (miles)
// ============================================================
function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ============================================================
// PROPS
interface Props {
  expeditionId: string;
  userId: string;
  fuelTankCapGal: number | null;
  avgMpg: number | null;
  currentFuelPct: number | null;
  // Route & position fields
  routeName: string | null;
  routeNotes: string | null;
  startWaypointId: string | null;
  currentLat: number | null;
  currentLon: number | null;
  positionUpdatedAt: string | null;
  onRefresh: () => void;
}

// ============================================================
// COMPONENT
// ============================================================
export default function RouteIntelligenceTab({
  expeditionId,
  userId,
  fuelTankCapGal,
  avgMpg,
  currentFuelPct,
  routeName,
  routeNotes,
  startWaypointId,
  currentLat,
  currentLon,
  positionUpdatedAt,
  onRefresh,
}: Props) {

  const [waypoints, setWaypoints] = useState<ExpeditionWaypoint[]>([]);
  const [segments, setSegments] = useState<RouteSegment[]>([]);
  const [summary, setSummary] = useState<RouteSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settingStart, setSettingStart] = useState<string | null>(null); // wp id being set
  const [startToast, setStartToast] = useState<'success' | 'error' | null>(null);

  // ── Fetch all data ─────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [wpRes, segRes, sumRes] = await Promise.all([
        supabase
          .from('expedition_waypoints')
          .select('*')
          .eq('expedition_id', expeditionId)
          .order('order_index', { ascending: true }),
        supabase
          .from('expedition_route_segments')
          .select('*')
          .eq('expedition_id', expeditionId)
          .order('order_index', { ascending: true }),
        supabase
          .from('expedition_route_summary')
          .select('*')
          .eq('expedition_id', expeditionId)
          .maybeSingle(),
      ]);

      if (wpRes.error) throw wpRes.error;
      if (segRes.error) throw segRes.error;

      setWaypoints(wpRes.data || []);
      setSegments(segRes.data || []);
      setSummary(sumRes.data || null);
    } catch {
      setError('FAILED TO LOAD ROUTE DATA');
    }
    setLoading(false);
  }, [expeditionId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Set Start Waypoint ─────────────────────────────────────
  const handleSetStart = useCallback(async (waypointId: string) => {
    setSettingStart(waypointId);
    setStartToast(null);
    try {
      const { error: err } = await supabase
        .from('expeditions')
        .update({ start_waypoint_id: waypointId })
        .eq('id', expeditionId);
      if (err) throw err;
      setStartToast('success');
      onRefresh();
    } catch {
      setStartToast('error');
    }
    setSettingStart(null);
    setTimeout(() => setStartToast(null), 2500);
  }, [expeditionId, onRefresh]);

  // ── Compute segment distances from waypoints ───────────────
  const segmentByFromWp = new Map<string, RouteSegment>();
  for (const seg of segments) {
    if (seg.from_waypoint_id) {
      segmentByFromWp.set(seg.from_waypoint_id, seg);
    }
  }

  const computedSegments: { fromWp: ExpeditionWaypoint; toWp: ExpeditionWaypoint; dbMiles: number | null; calcMiles: number | null }[] = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const from = waypoints[i];
    const to = waypoints[i + 1];
    const dbSeg = segmentByFromWp.get(from.id);
    let calcMiles: number | null = null;
    if (from.latitude != null && from.longitude != null && to.latitude != null && to.longitude != null) {
      calcMiles = haversineMiles(from.latitude, from.longitude, to.latitude, to.longitude);
    }
    computedSegments.push({
      fromWp: from,
      toWp: to,
      dbMiles: dbSeg?.distance_miles ?? null,
      calcMiles,
    });
  }

  // ── Totals ─────────────────────────────────────────────────
  let totalPlannedMiles: number | null = summary?.total_planned_miles ?? null;
  if (totalPlannedMiles == null || totalPlannedMiles === 0) {
    let sum = 0;
    let hasAny = false;
    for (const seg of computedSegments) {
      const miles = seg.dbMiles ?? seg.calcMiles;
      if (miles != null) {
        sum += miles;
        hasAny = true;
      }
    }
    if (hasAny) totalPlannedMiles = sum;
  }

  // ── Fuel range ─────────────────────────────────────────────
  let fuelRange: number | null = null;
  if (fuelTankCapGal && avgMpg && currentFuelPct != null && currentFuelPct >= 0) {
    fuelRange = Math.round(fuelTankCapGal * avgMpg * (currentFuelPct / 100));
  }

  const margin = (fuelRange != null && totalPlannedMiles != null)
    ? fuelRange - totalPlannedMiles
    : null;

  let fuelAlert: 'critical' | 'warning' | 'ok' | null = null;
  if (fuelRange != null && totalPlannedMiles != null && totalPlannedMiles > 0) {
    if (fuelRange < totalPlannedMiles) {
      fuelAlert = 'critical';
    } else if (fuelRange < totalPlannedMiles * 1.15) {
      fuelAlert = 'warning';
    } else {
      fuelAlert = 'ok';
    }
  }

  const missingCoords = waypoints.some(wp => wp.latitude == null || wp.longitude == null);

  // ── RENDER ─────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={TACTICAL.accent} />
        <Text style={s.loadingText}>LOADING ROUTE INTELLIGENCE...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={s.center}>
        <Ionicons name="alert-circle-outline" size={36} color={TACTICAL.danger} />
        <Text style={s.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      {/* ══════════════════════════════════════════════════════
          SECTION HEADER
         ══════════════════════════════════════════════════════ */}
      <View style={s.sectionHeader}>
        <Ionicons name="map-outline" size={16} color={TACTICAL.amber} />
        <Text style={s.sectionTitle}>ECS ROUTE INTELLIGENCE</Text>
      </View>

      {/* ══════════════════════════════════════════════════════
          A) ROUTE METADATA PANEL
         ══════════════════════════════════════════════════════ */}
      <RouteMetadataCard
        expeditionId={expeditionId}
        routeName={routeName}
        routeNotes={routeNotes}
        onUpdated={onRefresh}
      />


      {/* ══════════════════════════════════════════════════════
          GPX IMPORT
         ══════════════════════════════════════════════════════ */}
      <GpxImportButton
        expeditionId={expeditionId}
        userId={userId}
        existingWaypointCount={waypoints.length}
        onImportComplete={() => { fetchData(); onRefresh(); }}
      />

      {/* ══════════════════════════════════════════════════════

          C) CURRENT POSITION CARD
         ══════════════════════════════════════════════════════ */}
      <CurrentPositionCard
        expeditionId={expeditionId}
        currentLat={currentLat}
        currentLon={currentLon}
        positionUpdatedAt={positionUpdatedAt}
        startWaypointId={startWaypointId}
        waypoints={waypoints}
        onUpdated={() => { onRefresh(); fetchData(); }}
      />

      {/* ══════════════════════════════════════════════════════
          MAP PANEL (with current position + start highlight)
         ══════════════════════════════════════════════════════ */}
      <RouteMapView
        waypoints={waypoints}
        height={280}
        currentLat={currentLat}
        currentLon={currentLon}
        startWaypointId={startWaypointId}
      />

      {/* Missing coordinates warning */}
      {missingCoords && (
        <View style={s.amberNote}>
          <Ionicons name="alert-circle-outline" size={14} color={TACTICAL.amber} />
          <Text style={s.amberNoteText}>
            Some route points are missing coordinates — route totals may be incomplete.
          </Text>
        </View>
      )}

      {/* ══════════════════════════════════════════════════════
          ROUTE COMMAND TOTALS BAR
         ══════════════════════════════════════════════════════ */}
      <View style={s.totalsBar}>
        <View style={s.totalsHeader}>
          <Ionicons name="analytics-outline" size={14} color={TACTICAL.amber} />
          <Text style={s.totalsHeaderText}>ROUTE COMMAND TOTALS</Text>
        </View>

        <View style={s.totalsGrid}>
          <View style={s.totalCard}>
            <Text style={s.totalLabel}>TOTAL PLANNED</Text>
            <View style={s.totalValueRow}>
              <Text style={s.totalValueLarge}>
                {totalPlannedMiles != null ? totalPlannedMiles.toFixed(1) : '--'}
              </Text>
              <Text style={s.totalUnit}>MI</Text>
            </View>
          </View>

          <View style={s.totalCard}>
            <Text style={s.totalLabel}>FUEL RANGE</Text>
            <View style={s.totalValueRow}>
              <Text style={[
                s.totalValueLarge,
                fuelRange != null && fuelAlert === 'critical' && { color: TACTICAL.danger },
                fuelRange != null && fuelAlert === 'warning' && { color: TACTICAL.amber },
                fuelRange != null && fuelAlert === 'ok' && { color: '#4CAF50' },
              ]}>
                {fuelRange != null ? fuelRange : '--'}
              </Text>
              <Text style={s.totalUnit}>MI</Text>
            </View>
          </View>

          <View style={s.totalCard}>
            <Text style={s.totalLabel}>MARGIN</Text>
            <View style={s.totalValueRow}>
              <Text style={[
                s.totalValueLarge,
                margin != null && margin < 0 && { color: TACTICAL.danger },
                margin != null && margin >= 0 && margin < (totalPlannedMiles ?? 0) * 0.15 && { color: TACTICAL.amber },
                margin != null && margin >= (totalPlannedMiles ?? 0) * 0.15 && { color: '#4CAF50' },
              ]}>
                {margin != null ? (margin >= 0 ? `+${margin.toFixed(0)}` : margin.toFixed(0)) : '--'}
              </Text>
              <Text style={s.totalUnit}>MI</Text>
            </View>
          </View>
        </View>

        {fuelAlert === 'critical' && (
          <View style={s.alertCritical}>
            <Ionicons name="warning" size={16} color={TACTICAL.danger} />
            <Text style={s.alertCriticalText}>
              INSUFFICIENT RANGE FOR PLANNED ROUTE
            </Text>
          </View>
        )}
        {fuelAlert === 'warning' && (
          <View style={s.alertWarning}>
            <Ionicons name="alert-circle-outline" size={16} color={TACTICAL.amber} />
            <Text style={s.alertWarningText}>
              LOW RANGE MARGIN ({'<'}15% RESERVE)
            </Text>
          </View>
        )}
        {fuelAlert === 'ok' && (
          <View style={s.alertOk}>
            <Ionicons name="checkmark-circle-outline" size={14} color="#4CAF50" />
            <Text style={s.alertOkText}>RANGE POSTURE NOMINAL</Text>
          </View>
        )}
      </View>

      {/* ══════════════════════════════════════════════════════
          B) WAYPOINT SEGMENT LIST (with MARK START)
         ══════════════════════════════════════════════════════ */}
      <View style={s.segmentSection}>
        <View style={s.segmentHeader}>
          <Ionicons name="git-merge-outline" size={14} color={TACTICAL.amber} />
          <Text style={s.segmentHeaderText}>WAYPOINT EXECUTION</Text>
          <Text style={s.segmentCount}>{waypoints.length} WP</Text>
        </View>

        {/* Start toast */}
        {startToast === 'success' && (
          <View style={s.startToastRow}>
            <Ionicons name="checkmark-circle" size={12} color={TACTICAL.successText} />
            <Text style={s.startToastText}>START WAYPOINT UPDATED</Text>
          </View>
        )}
        {startToast === 'error' && (
          <View style={[s.startToastRow, { backgroundColor: 'rgba(192,57,43,0.1)' }]}>
            <Ionicons name="alert-circle" size={12} color={TACTICAL.danger} />
            <Text style={[s.startToastText, { color: TACTICAL.danger }]}>UNABLE TO SAVE. TRY AGAIN.</Text>
          </View>
        )}

        {waypoints.length === 0 ? (
          <View style={s.emptySegments}>
            <Ionicons name="navigate-outline" size={28} color={TACTICAL.textMuted} />
            <Text style={s.emptySegText}>No route points defined</Text>
          </View>
        ) : (
          waypoints.map((wp, idx) => {
            const cfg = TYPE_CFG[wp.waypoint_type] || TYPE_CFG.stop;
            const seg = idx < computedSegments.length ? computedSegments[idx] : null;
            const segMiles = seg ? (seg.dbMiles ?? seg.calcMiles) : null;
            const isLast = idx === waypoints.length - 1;
            const hasCoords = wp.latitude != null && wp.longitude != null;
            const isStart = startWaypointId === wp.id;
            const isSettingThis = settingStart === wp.id;

            return (
              <View key={wp.id}>
                {/* Waypoint row */}
                <View style={s.wpRow}>
                  {/* Timeline dot + line */}
                  <View style={s.timelineCol}>
                    <View style={[
                      s.timelineDot,
                      { backgroundColor: cfg.color },
                      isStart && s.timelineDotStart,
                    ]}>
                      <Text style={s.timelineDotText}>{idx + 1}</Text>
                    </View>
                    {!isLast && <View style={s.timelineLine} />}
                  </View>

                  {/* Waypoint info */}
                  <View style={s.wpInfo}>
                    <View style={s.wpTopRow}>
                      <Text style={s.wpName} numberOfLines={1}>{wp.name}</Text>
                      <View style={[s.wpTypeBadge, { borderColor: cfg.color }]}>
                        <Ionicons name={cfg.icon as any} size={10} color={cfg.color} />
                        <Text style={[s.wpTypeText, { color: cfg.color }]}>{cfg.label}</Text>
                      </View>
                    </View>

                    {/* START badge */}
                    {isStart && (
                      <View style={s.startBadge}>
                        <Ionicons name="flag" size={10} color="#4CAF50" />
                        <Text style={s.startBadgeText}>START</Text>
                      </View>
                    )}

                    {/* Coordinates */}
                    {hasCoords ? (
                      <Text style={s.wpCoords}>
                        {wp.latitude!.toFixed(5)}, {wp.longitude!.toFixed(5)}
                        {wp.elevation_ft ? ` · ${wp.elevation_ft} ft` : ''}
                      </Text>
                    ) : (
                      <Text style={s.wpNoCoords}>No coordinates</Text>
                    )}

                    {/* ETA */}
                    {wp.eta && (
                      <View style={s.wpEtaRow}>
                        <Ionicons name="time-outline" size={10} color={TACTICAL.textMuted} />
                        <Text style={s.wpEtaText}>ETA: {wp.eta}</Text>
                      </View>
                    )}

                    {/* MARK START button */}
                    {!isStart && (
                      <TouchableOpacity
                        style={s.setStartBtn}
                        onPress={() => handleSetStart(wp.id)}
                        disabled={isSettingThis}
                        activeOpacity={0.7}
                      >
                        {isSettingThis ? (
                          <ActivityIndicator size="small" color={TACTICAL.accent} />
                        ) : (
                          <>
                            <Ionicons name="flag-outline" size={11} color={TACTICAL.textMuted} />
                            <Text style={s.setStartBtnText}>MARK START</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {/* Segment distance */}
                {!isLast && (
                  <View style={s.segDistRow}>
                    <View style={s.segDistLine} />
                    <View style={s.segDistBadge}>
                      <Ionicons name="resize-outline" size={10} color={TACTICAL.textMuted} />
                      <Text style={s.segDistText}>
                        {segMiles != null ? `${segMiles.toFixed(1)} mi` : '-- mi'}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            );
          })
        )}
      </View>

      {/* ══════════════════════════════════════════════════════
          ROUTE SUMMARY FOOTER
         ══════════════════════════════════════════════════════ */}
      {totalPlannedMiles != null && (
        <View style={s.summaryFooter}>
          <View style={s.summaryRow}>
            <Ionicons name="flag-outline" size={14} color={TACTICAL.amber} />
            <Text style={s.summaryLabel}>TOTAL PLANNED:</Text>
            <Text style={s.summaryValue}>{totalPlannedMiles.toFixed(1)} MI</Text>
          </View>
          {summary?.total_estimated_hours != null && (
            <View style={s.summaryRow}>
              <Ionicons name="time-outline" size={14} color={TACTICAL.textMuted} />
              <Text style={s.summaryLabel}>EST. TIME:</Text>
              <Text style={s.summaryValue}>{summary.total_estimated_hours.toFixed(1)} HRS</Text>
            </View>
          )}
          {summary?.last_computed_at && (
            <Text style={s.summaryTimestamp}>
              Last computed: {new Date(summary.last_computed_at).toLocaleString()}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

// ============================================================
// STYLES
// ============================================================
const s = StyleSheet.create({
  container: {
    gap: 12,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  loadingText: {
    fontSize: 12,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '700',
    color: TACTICAL.danger,
    letterSpacing: 1,
  },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(196,138,44,0.25)',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 2,
  },

  // Amber note
  amberNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(196,138,44,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.2)',
    borderRadius: 8,
  },
  amberNoteText: {
    fontSize: 11,
    color: TACTICAL.amber,
    flex: 1,
    lineHeight: 16,
  },

  // ── Totals Bar ──────────────────────────────────────────
  totalsBar: {
    backgroundColor: TACTICAL.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    overflow: 'hidden',
  },
  totalsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },
  totalsHeaderText: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 2,
  },
  totalsGrid: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingBottom: 10,
    gap: 6,
  },
  totalCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.2)',
  },
  totalLabel: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  totalValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  totalValueLarge: {
    fontSize: 22,
    fontWeight: '900',
    color: TACTICAL.text,
    fontFamily: 'Courier',
    letterSpacing: -0.5,
  },
  totalUnit: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },

  // Alerts
  alertCritical: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 10,
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(192,57,43,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(192,57,43,0.35)',
    borderRadius: 8,
  },
  alertCriticalText: {
    fontSize: 11,
    fontWeight: '900',
    color: TACTICAL.danger,
    letterSpacing: 1,
    flex: 1,
  },
  alertWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 10,
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(196,138,44,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.3)',
    borderRadius: 8,
  },
  alertWarningText: {
    fontSize: 11,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1,
    flex: 1,
  },
  alertOk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 10,
    marginBottom: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(62,107,62,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(62,107,62,0.25)',
    borderRadius: 8,
  },
  alertOkText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#4CAF50',
    letterSpacing: 1,
  },

  // ── Segment List ────────────────────────────────────────
  segmentSection: {
    backgroundColor: TACTICAL.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    overflow: 'hidden',
  },
  segmentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62,79,60,0.2)',
  },
  segmentHeaderText: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 2,
    flex: 1,
  },
  segmentCount: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
    fontFamily: 'Courier',
  },
  emptySegments: {
    alignItems: 'center',
    paddingVertical: 30,
    gap: 8,
  },
  emptySegText: {
    fontSize: 12,
    color: TACTICAL.textMuted,
  },

  // Start toast
  startToastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(62,107,62,0.1)',
  },
  startToastText: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.successText,
    letterSpacing: 1,
  },

  // Waypoint row
  wpRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  timelineCol: {
    width: 32,
    alignItems: 'center',
  },
  timelineDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineDotStart: {
    borderWidth: 2,
    borderColor: '#4CAF50',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 4,
  },
  timelineDotText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#fff',
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: 'rgba(62,79,60,0.35)',
    marginTop: 2,
    minHeight: 10,
  },
  wpInfo: {
    flex: 1,
    paddingLeft: 10,
    paddingBottom: 4,
  },
  wpTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 3,
  },
  wpName: {
    fontSize: 14,
    fontWeight: '700',
    color: TACTICAL.text,
    flex: 1,
  },
  wpTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
  },
  wpTypeText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.8,
  },

  // START badge
  startBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(76,175,80,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.35)',
    borderRadius: 5,
    marginBottom: 4,
  },
  startBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#4CAF50',
    letterSpacing: 1.5,
  },

  // MARK START button
  setStartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(62,79,60,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.35)',
    borderRadius: 6,
    marginTop: 6,
  },
  setStartBtnText: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },

  wpCoords: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
    marginBottom: 2,
  },
  wpNoCoords: {
    fontSize: 10,
    color: TACTICAL.amber,
    fontStyle: 'italic',
    marginBottom: 2,
  },
  wpEtaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  wpEtaText: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
  },

  // Segment distance row
  segDistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 14,
    paddingRight: 14,
    paddingVertical: 2,
  },
  segDistLine: {
    width: 32,
    alignItems: 'center',
  },
  segDistBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 10,
    paddingVertical: 3,
  },
  segDistText: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
    letterSpacing: 0.5,
  },

  // ── Summary Footer ──────────────────────────────────────
  summaryFooter: {
    backgroundColor: TACTICAL.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    padding: 14,
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '900',
    color: TACTICAL.text,
    fontFamily: 'Courier',
    letterSpacing: 0.5,
  },
  summaryTimestamp: {
    fontSize: 9,
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
    marginTop: 4,
  },
});



