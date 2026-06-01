// ============================================================
// COMPLETION SUMMARY CARD
// ============================================================
// Displays a rich, tactical-styled summary card for a completed
// expedition. Shows duration, checklist %, field logs by type,
// routes, waypoints, and final readiness score.
// ============================================================

import React, { useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Platform,
} from 'react-native';
import { SafeIcon as Ionicons } from './SafeIcon';
import { TACTICAL } from '../lib/theme';
import type { CompletionSummary } from '../lib/completionSummary';
import { FIELD_LOG_TYPE_META, WAYPOINT_KIND_META } from '../lib/expeditionTypes';
import type { EcsFieldLogType, EcsWaypointKind } from '../lib/expeditionTypes';

interface Props {
  summary: CompletionSummary;
  /** If true, renders a more compact version for list cards */
  compact?: boolean;
}

// ── Helpers ─────────────────────────────────────────────────
function fmtDate(dateStr: string | null): string {
  if (!dateStr) return '--';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
  } catch { return '--'; }
}

function fmtTime(dateStr: string | null): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

function readinessColor(score: number): string {
  if (score >= 80) return '#4CAF50';
  if (score >= 50) return TACTICAL.amber;
  return '#E53935';
}

// ── Stat Row ────────────────────────────────────────────────
function StatRow({ icon, iconColor, label, value, valueColor }: {
  icon: string;
  iconColor: string;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.statRow}>
      <View style={[styles.statIconWrap, { borderColor: `${iconColor}30` }]}>
        <Ionicons name={icon as any} size={13} color={iconColor} />
      </View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, valueColor ? { color: valueColor } : undefined]}>{value}</Text>
    </View>
  );
}

// ── Field Log Type Chip ─────────────────────────────────────
function LogTypeChip({ type, count }: { type: string; count: number }) {
  const meta = FIELD_LOG_TYPE_META[type as EcsFieldLogType] || { label: type.toUpperCase(), icon: 'document-outline', color: TACTICAL.textMuted };
  return (
    <View style={[styles.typeChip, { borderColor: `${meta.color}30` }]}>
      <Ionicons name={meta.icon as any} size={10} color={meta.color} />
      <Text style={[styles.typeChipCount, { color: meta.color }]}>{count}</Text>
      <Text style={[styles.typeChipLabel, { color: `${meta.color}CC` }]}>{meta.label}</Text>
    </View>
  );
}

// ── Waypoint Kind Chip ──────────────────────────────────────
function WaypointKindChip({ kind, count }: { kind: string; count: number }) {
  const meta = WAYPOINT_KIND_META[kind as EcsWaypointKind] || { label: kind.toUpperCase(), icon: 'location-outline', color: TACTICAL.textMuted };
  return (
    <View style={[styles.typeChip, { borderColor: `${meta.color}30` }]}>
      <Ionicons name={meta.icon as any} size={10} color={meta.color} />
      <Text style={[styles.typeChipCount, { color: meta.color }]}>{count}</Text>
      <Text style={[styles.typeChipLabel, { color: `${meta.color}CC` }]}>{meta.label}</Text>
    </View>
  );
}

// ── Progress Bar ────────────────────────────────────────────
function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${Math.min(100, Math.max(0, pct))}%`, backgroundColor: color }]} />
    </View>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function CompletionSummaryCard({ summary, compact = false }: Props) {
  const [expanded, setExpanded] = useState(!compact);

  const rColor = readinessColor(summary.readiness.final_score);
  const checkPct = summary.checklist.completion_pct;
  const checkColor = checkPct >= 80 ? '#4CAF50' : checkPct >= 50 ? TACTICAL.amber : '#E53935';

  const logTypeEntries = useMemo(() => {
    return Object.entries(summary.field_logs.by_type).sort((a, b) => b[1] - a[1]);
  }, [summary.field_logs.by_type]);

  const waypointKindEntries = useMemo(() => {
    return Object.entries(summary.waypoints.by_kind).sort((a, b) => b[1] - a[1]);
  }, [summary.waypoints.by_kind]);

  const routeDistDisplay = summary.routes.total_distance_mi != null
    ? `${summary.routes.total_distance_mi.toFixed(1)} MI`
    : '--';

  // ── Compact mode: just a small summary strip ──────────────
  if (compact && !expanded) {
    return (
      <TouchableOpacity
        style={styles.compactCard}
        onPress={() => setExpanded(true)}
        activeOpacity={0.85}
      >
        <View style={styles.compactLeft}>
          <View style={[styles.compactScoreBadge, { borderColor: `${rColor}50` }]}>
            <Text style={[styles.compactScoreText, { color: rColor }]}>{summary.readiness.final_score}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.compactTitle}>COMPLETION SUMMARY</Text>
            <Text style={styles.compactSub}>
              {summary.duration.display} duration  /  {summary.checklist.completion_pct}% checklist  /  {summary.field_logs.total_entries} logs
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-down-outline" size={16} color={TACTICAL.textMuted} />
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.card}>
      {/* ── Header ──────────────────────────────────────────── */}
      <TouchableOpacity
        style={styles.cardHeader}
        onPress={compact ? () => setExpanded(false) : undefined}
        activeOpacity={compact ? 0.85 : 1}
        disabled={!compact}
      >
        <View style={styles.headerLeft}>
          <View style={styles.headerIconWrap}>
            <Ionicons name="ribbon-outline" size={16} color={TACTICAL.amber} />
          </View>
          <View>
            <Text style={styles.headerTitle}>COMPLETION SUMMARY</Text>
            <Text style={styles.headerSub}>
              Generated {fmtDate(summary.generated_at)} {fmtTime(summary.generated_at)}
            </Text>
          </View>
        </View>
        {compact && (
          <Ionicons name="chevron-up-outline" size={16} color={TACTICAL.textMuted} />
        )}
      </TouchableOpacity>

      {/* ── Readiness Score + Duration Hero ──────────────────── */}
      <View style={styles.heroRow}>
        {/* Readiness */}
        <View style={styles.heroBlock}>
          <View style={[styles.heroRing, { borderColor: `${rColor}40` }]}>
            <View style={[styles.heroRingInner, { borderColor: rColor }]}>
              <Text style={[styles.heroScore, { color: rColor }]}>{summary.readiness.final_score}</Text>
            </View>
          </View>
          <Text style={styles.heroLabel}>READINESS</Text>
        </View>

        <View style={styles.heroDivider} />

        {/* Duration */}
        <View style={styles.heroBlock}>
          <Text style={styles.heroBigValue}>{summary.duration.display}</Text>
          <Text style={styles.heroLabel}>DURATION</Text>
          <Text style={styles.heroMeta}>
            {fmtDate(summary.duration.start_at)} — {fmtDate(summary.duration.end_at)}
          </Text>
        </View>
      </View>

      {/* ── Checklist Section ────────────────────────────────── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="checkbox-outline" size={13} color={checkColor} />
          <Text style={styles.sectionTitle}>CHECKLIST</Text>
          <Text style={[styles.sectionBadge, { color: checkColor }]}>{checkPct}%</Text>
        </View>
        <ProgressBar pct={checkPct} color={checkColor} />
        <View style={styles.sectionStats}>
          <StatRow icon="checkmark-done-outline" iconColor="#4CAF50" label="COMPLETED" value={`${summary.checklist.completed_items}`} valueColor="#4CAF50" />
          <StatRow icon="list-outline" iconColor={TACTICAL.textMuted} label="TOTAL ITEMS" value={`${summary.checklist.total_items}`} />
        </View>

        {/* Priority breakdown */}
        {Object.keys(summary.checklist.by_priority).length > 0 && (
          <View style={styles.breakdownRow}>
            {Object.entries(summary.checklist.by_priority).map(([pri, data]) => {
              const priColors: Record<string, string> = { critical: '#E53935', high: '#FF7043', normal: TACTICAL.textMuted, low: '#78909C' };
              const c = priColors[pri] || TACTICAL.textMuted;
              return (
                <View key={pri} style={[styles.breakdownChip, { borderColor: `${c}30` }]}>
                  <Text style={[styles.breakdownLabel, { color: c }]}>{pri.toUpperCase()}</Text>
                  <Text style={[styles.breakdownValue, { color: c }]}>{data.done}/{data.total}</Text>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* ── Field Logs Section ───────────────────────────────── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="journal-outline" size={13} color={TACTICAL.amber} />
          <Text style={styles.sectionTitle}>FIELD LOGS</Text>
          <Text style={styles.sectionBadge}>{summary.field_logs.total_entries}</Text>
        </View>
        {logTypeEntries.length > 0 ? (
          <View style={styles.chipGrid}>
            {logTypeEntries.map(([type, count]) => (
              <LogTypeChip key={type} type={type} count={count} />
            ))}
          </View>
        ) : (
          <Text style={styles.emptyText}>No field log entries</Text>
        )}
      </View>

      {/* ── Routes Section ───────────────────────────────────── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="map-outline" size={13} color="#4FC3F7" />
          <Text style={styles.sectionTitle}>ROUTES</Text>
          <Text style={styles.sectionBadge}>{summary.routes.total_routes}</Text>
        </View>
        <View style={styles.sectionStats}>
          <StatRow icon="navigate-outline" iconColor="#4FC3F7" label="DISTANCE" value={routeDistDisplay} valueColor="#4FC3F7" />
          <StatRow icon="time-outline" iconColor={TACTICAL.textMuted} label="EST. TIME" value={summary.routes.total_eta_hours != null ? `${summary.routes.total_eta_hours.toFixed(1)}H` : '--'} />
        </View>
        {summary.routes.route_names.length > 0 && (
          <View style={styles.routeNamesList}>
            {summary.routes.route_names.map((name, i) => (
              <View key={i} style={styles.routeNameRow}>
                <View style={styles.routeNameDot} />
                <Text style={styles.routeNameText}>{name}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* ── Waypoints Section ────────────────────────────────── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="location-outline" size={13} color="#CE93D8" />
          <Text style={styles.sectionTitle}>WAYPOINTS</Text>
          <Text style={styles.sectionBadge}>{summary.waypoints.total_waypoints}</Text>
        </View>
        <View style={styles.sectionStats}>
          <StatRow icon="flag-outline" iconColor="#CE93D8" label="TOTAL" value={`${summary.waypoints.total_waypoints}`} valueColor="#CE93D8" />
          <StatRow icon="checkmark-circle-outline" iconColor="#4CAF50" label="VISITED" value={`${summary.waypoints.visited_count}`} valueColor="#4CAF50" />
        </View>
        {waypointKindEntries.length > 0 && (
          <View style={styles.chipGrid}>
            {waypointKindEntries.map(([kind, count]) => (
              <WaypointKindChip key={kind} kind={kind} count={count} />
            ))}
          </View>
        )}
      </View>

      {/* ── Footer ───────────────────────────────────────────── */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {`SUMMARY v${summary.version} | ${summary.expedition.terrain ? summary.expedition.terrain.toUpperCase() : 'MIXED'} TERRAIN${summary.expedition.planned_duration_days ? ` | ${summary.expedition.planned_duration_days}D PLANNED` : ''}`}
        </Text>
      </View>
    </View>
  );
}

// ============================================================
// STYLES
// ============================================================
const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.25)',
    overflow: 'hidden',
    marginBottom: 14,
  },

  // ── Compact ───────────────────────────────────────────────
  compactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.25)',
    marginBottom: 10,
  },
  compactLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  compactScoreBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1.5,
  },
  compactScoreText: {
    fontSize: 14,
    fontWeight: '900',
    fontFamily: 'Courier',
  },
  compactTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },
  compactSub: {
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    marginTop: 2,
  },

  // ── Header ────────────────────────────────────────────────
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(196, 138, 44, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.25)',
  },
  headerTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },
  headerSub: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    marginTop: 2,
    letterSpacing: 0.5,
  },

  // ── Hero Row ──────────────────────────────────────────────
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 14,
  },
  heroBlock: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  heroRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroRingInner: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroScore: {
    fontSize: 20,
    fontWeight: '900',
    fontFamily: 'Courier',
  },
  heroBigValue: {
    fontSize: 22,
    fontWeight: '900',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },
  heroLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
  heroMeta: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  heroDivider: {
    width: 1,
    height: 60,
    backgroundColor: 'rgba(62, 79, 60, 0.25)',
  },

  // ── Section ───────────────────────────────────────────────
  section: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(62, 79, 60, 0.15)',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 1.5,
    flex: 1,
  },
  sectionBadge: {
    fontSize: 12,
    fontWeight: '900',
    color: TACTICAL.amber,
    fontFamily: 'Courier',
  },

  // ── Stat Row ──────────────────────────────────────────────
  sectionStats: {
    gap: 4,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  statIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderWidth: 1,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
    flex: 1,
  },
  statValue: {
    fontSize: 13,
    fontWeight: '900',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },

  // ── Progress Bar ──────────────────────────────────────────
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(62, 79, 60, 0.15)',
    marginBottom: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
  },

  // ── Chip Grid ─────────────────────────────────────────────
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  typeChipCount: {
    fontSize: 11,
    fontWeight: '900',
    fontFamily: 'Courier',
  },
  typeChipLabel: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // ── Breakdown Row ─────────────────────────────────────────
  breakdownRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  breakdownChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  breakdownLabel: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
  },
  breakdownValue: {
    fontSize: 11,
    fontWeight: '900',
    fontFamily: 'Courier',
  },

  // ── Route Names ───────────────────────────────────────────
  routeNamesList: {
    marginTop: 6,
    gap: 4,
  },
  routeNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  routeNameDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#4FC3F7',
  },
  routeNameText: {
    fontSize: 11,
    fontWeight: '700',
    color: TACTICAL.text,
    letterSpacing: 0.3,
  },

  // ── Empty ─────────────────────────────────────────────────
  emptyText: {
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    fontStyle: 'italic',
  },

  // ── Footer ────────────────────────────────────────────────
  footer: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(62, 79, 60, 0.15)',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 8,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
    textAlign: 'center',
  },
});



