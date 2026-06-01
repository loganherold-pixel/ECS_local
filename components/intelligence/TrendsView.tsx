/**
 * TrendsView — Cross-Expedition Analytics Dashboard
 *
 * Phase 3: Expedition Intelligence
 * Analyzes patterns across all completed expeditions:
 *   1. Recurring event types
 *   2. Resource consumption trends (fuel/water/power)
 *   3. Most common risk categories
 *   4. Expedition grade history
 *   5. Improvement tracking (lessons learned)
 *
 * No vertical scroll — capped sections with "View Details" modals.
 * ECS black/gold/amber styling with purple AI accents.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Platform, ActivityIndicator, Modal, ScrollView,
} from 'react-native';
import { SafeIcon as Ionicons } from '../../components/SafeIcon';
import { TACTICAL } from '../../lib/theme';
import {
  trendsStore,
  type CrossExpeditionTrends,
  type CrossExpeditionAIInsights,
} from '../../lib/debriefStore';
import { EVENT_TYPE_META } from '../../lib/expeditionEventStore';

// ── Props ────────────────────────────────────────────────────

interface TrendsViewProps {
  showToast: (msg: string) => void;
}

// ── Helpers ──────────────────────────────────────────────────

function shortDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  } catch { return '--'; }
}

function gradeColor(grade: string): string {
  switch (grade) {
    case 'A': return '#66BB6A';
    case 'B': return '#81C784';
    case 'C': return '#FFB74D';
    case 'D': return '#FF9500';
    case 'F': return '#EF5350';
    default: return TACTICAL.textMuted;
  }
}

function severityColor(sev: string): string {
  switch (sev) {
    case 'CRITICAL': return '#EF5350';
    case 'HIGH': return '#FF9500';
    case 'MED': return '#FFB74D';
    case 'LOW': return '#66BB6A';
    default: return TACTICAL.textMuted;
  }
}

function directionColor(dir: string): string {
  switch (dir) {
    case 'IMPROVING': return '#66BB6A';
    case 'DECLINING': return '#EF5350';
    default: return '#FFB74D';
  }
}

function statusColor(status: string): string {
  switch (status) {
    case 'APPLIED': return '#66BB6A';
    case 'PARTIAL': return '#FFB74D';
    case 'NOT_APPLIED': return '#EF5350';
    default: return TACTICAL.textMuted;
  }
}

function outcomeColor(outcome: string): string {
  switch (outcome) {
    case 'SUCCESS': return '#66BB6A';
    case 'MODIFIED': return '#FFB74D';
    case 'ABORTED': return '#EF5350';
    default: return TACTICAL.textMuted;
  }
}

// ── Component ────────────────────────────────────────────────

export default function TrendsView({ showToast }: TrendsViewProps) {
  const [trends, setTrends] = useState<CrossExpeditionTrends | null>(null);
  const [aiInsights, setAIInsights] = useState<CrossExpeditionAIInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAILoading] = useState(false);
  const [detailModal, setDetailModal] = useState<
    'events' | 'resources' | 'risk' | 'grades' | 'lessons' | 'ai' | null
  >(null);

  // ── Load trends ────────────────────────────────────────────
  useEffect(() => {
    // Check cache first
    const cached = trendsStore.getTrends();
    if (cached) setTrends(cached);
    const cachedAI = trendsStore.getAIInsights();
    if (cachedAI) setAIInsights(cachedAI);

    // Load from server
    trendsStore.loadTrends(false, (msg) => showToast(msg)).then(({ trends: t, ai_insights: ai }) => {
      if (t) setTrends(t);
      if (ai) setAIInsights(ai);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [showToast]);

  // ── Store subscription ─────────────────────────────────────
  useEffect(() => {
    const unsub = trendsStore.subscribe(() => {
      const t = trendsStore.getTrends();
      if (t) setTrends(t);
      const ai = trendsStore.getAIInsights();
      if (ai) setAIInsights(ai);
    });
    return unsub;
  }, []);

  // ── Refresh ────────────────────────────────────────────────
  const handleRefresh = useCallback(async () => {
    setLoading(true);
    const { trends: t } = await trendsStore.loadTrends(false, (msg) => showToast(msg));
    if (t) setTrends(t);
    setLoading(false);
    showToast('Trends refreshed');
  }, [showToast]);

  // ── Generate AI Insights ───────────────────────────────────
  const handleGenerateAI = useCallback(async () => {
    setAILoading(true);
    showToast('Analyzing cross-expedition patterns...');
    const result = await trendsStore.generateAIInsights((msg) => showToast(msg));
    if (result) {
      setAIInsights(result);
      // Also refresh trends data
      const t = trendsStore.getTrends();
      if (t) setTrends(t);
      showToast('AI cross-expedition analysis complete');
    }
    setAILoading(false);
  }, [showToast]);

  // ── Loading ────────────────────────────────────────────────
  if (loading && !trends) {
    return (
      <View style={s.empty}>
        <ActivityIndicator size="small" color={TACTICAL.amber} />
        <Text style={s.emptyText}>Loading cross-expedition trends...</Text>
      </View>
    );
  }

  // ── No data ────────────────────────────────────────────────
  if (!trends || trends.expedition_count === 0) {
    return (
      <View style={s.empty}>
        <View style={s.noDataIcon}>
          <Ionicons name="trending-up-outline" size={32} color="rgba(196,138,44,0.3)" />
        </View>
        <Text style={s.noDataTitle}>NO TREND DATA</Text>
        <Text style={s.noDataDesc}>
          Complete expeditions with debriefs to see cross-expedition analytics and patterns.
        </Text>
        <TouchableOpacity style={s.refreshBtn} onPress={handleRefresh} activeOpacity={0.7}>
          <Ionicons name="refresh-outline" size={14} color="#0B0F12" />
          <Text style={s.refreshBtnText}>REFRESH</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Derived data ───────────────────────────────────────────
  const eventTypes = Object.entries(trends.event_type_totals)
    .sort((a, b) => b[1] - a[1]);
  const maxEventCount = eventTypes.length > 0 ? eventTypes[0][1] : 1;

  const sevEntries = Object.entries(trends.severity_totals)
    .sort((a, b) => {
      const order = ['CRITICAL', 'HIGH', 'MED', 'LOW'];
      return order.indexOf(a[0]) - order.indexOf(b[0]);
    });

  return (
    <View style={s.container}>
      {/* ── Fleet Health Header ────────────────────────────── */}
      <View style={s.headerRow}>
        <View style={s.headerLeft}>
          <Text style={s.headerLabel}>CROSS-EXPEDITION TRENDS</Text>
          <Text style={s.headerSub}>
            {trends.expedition_count} expedition{trends.expedition_count !== 1 ? 's' : ''} analyzed
          </Text>
        </View>
        <TouchableOpacity style={s.headerRefresh} onPress={handleRefresh} activeOpacity={0.7}>
          <Ionicons name="refresh-outline" size={12} color={TACTICAL.amber} />
        </TouchableOpacity>
      </View>

      {/* ── KPI Strip ─────────────────────────────────────── */}
      <View style={s.kpiStrip}>
        <KPIChip label="EXPEDITIONS" value={String(trends.expedition_count)} color={TACTICAL.amber} />
        <KPIChip label="EVENTS" value={String(trends.event_count)} color="#4FC3F7" />
        <KPIChip label="DEBRIEFS" value={String(trends.debrief_count)} color="#66BB6A" />
        {aiInsights && (
          <KPIChip
            label="FLEET"
            value={aiInsights.readiness_grade}
            color={gradeColor(aiInsights.readiness_grade)}
          />
        )}
      </View>

      {/* ── 2x2 Analytics Grid ────────────────────────────── */}
      <View style={s.gridRow}>
        {/* Card 1: Event Types */}
        <TouchableOpacity
          style={s.gridCard}
          onPress={() => setDetailModal('events')}
          activeOpacity={0.8}
        >
          <View style={s.gridCardHeader}>
            <Ionicons name="bar-chart-outline" size={11} color={TACTICAL.amber} />
            <Text style={s.gridCardTitle}>EVENT TYPES</Text>
          </View>
          {eventTypes.slice(0, 3).map(([type, count]) => {
            const meta = EVENT_TYPE_META[type as keyof typeof EVENT_TYPE_META];
            const pct = maxEventCount > 0 ? (count / maxEventCount) * 100 : 0;
            return (
              <View key={type} style={s.barRow}>
                <Text style={[s.barLabel, { color: meta?.color || TACTICAL.textMuted }]}>
                  {(meta?.label || type).substring(0, 4)}
                </Text>
                <View style={s.barTrack}>
                  <View style={[s.barFill, { width: `${pct}%`, backgroundColor: meta?.color || TACTICAL.amber }]} />
                </View>
                <Text style={s.barValue}>{count}</Text>
              </View>
            );
          })}
          {eventTypes.length > 3 && (
            <Text style={s.gridMore}>+{eventTypes.length - 3} more</Text>
          )}
        </TouchableOpacity>

        {/* Card 2: Resource Trends */}
        <TouchableOpacity
          style={s.gridCard}
          onPress={() => setDetailModal('resources')}
          activeOpacity={0.8}
        >
          <View style={s.gridCardHeader}>
            <Ionicons name="trending-up-outline" size={11} color="#4FC3F7" />
            <Text style={s.gridCardTitle}>RESOURCES</Text>
          </View>
          <View style={s.avgRow}>
            <DeltaChip label="FUEL" value={trends.avg_resource_deltas.fuel} color="#FF9500" />
            <DeltaChip label="H2O" value={trends.avg_resource_deltas.water} color="#4FC3F7" />
            <DeltaChip label="PWR" value={trends.avg_resource_deltas.power} color="#66BB6A" />
          </View>
          {/* Mini sparkline */}
          {trends.resource_trends.length > 0 && (
            <View style={s.sparkRow}>
              {trends.resource_trends.slice(-6).map((pt, i) => {
                const avgDelta = (pt.fuel_delta + pt.water_delta + pt.power_delta) / 3;
                const h = Math.max(3, Math.min(16, 8 + avgDelta * 0.5));
                const color = avgDelta >= 0 ? '#66BB6A' : '#EF5350';
                return (
                  <View key={i} style={s.sparkBarWrap}>
                    <View style={[s.sparkBar, { height: h, backgroundColor: color }]} />
                  </View>
                );
              })}
            </View>
          )}
        </TouchableOpacity>
      </View>

      <View style={s.gridRow}>
        {/* Card 3: Risk Categories */}
        <TouchableOpacity
          style={s.gridCard}
          onPress={() => setDetailModal('risk')}
          activeOpacity={0.8}
        >
          <View style={s.gridCardHeader}>
            <Ionicons name="warning-outline" size={11} color="#EF5350" />
            <Text style={s.gridCardTitle}>RISK</Text>
          </View>
          <View style={s.sevGrid}>
            {sevEntries.slice(0, 4).map(([sev, count]) => (
              <View key={sev} style={s.sevItem}>
                <Text style={[s.sevNum, { color: severityColor(sev) }]}>{count}</Text>
                <Text style={s.sevLabel}>{sev.substring(0, 4)}</Text>
              </View>
            ))}
          </View>
          {/* Outcome pills */}
          <View style={s.outcomeRow}>
            {Object.entries(trends.outcome_distribution).map(([out, cnt]) => (
              <View key={out} style={[s.outcomePill, { backgroundColor: `${outcomeColor(out)}12` }]}>
                <Text style={[s.outcomeText, { color: outcomeColor(out) }]}>
                  {cnt} {out.substring(0, 3)}
                </Text>
              </View>
            ))}
          </View>
        </TouchableOpacity>

        {/* Card 4: Grade History */}
        <TouchableOpacity
          style={s.gridCard}
          onPress={() => setDetailModal('grades')}
          activeOpacity={0.8}
        >
          <View style={s.gridCardHeader}>
            <Ionicons name="ribbon-outline" size={11} color="#B388FF" />
            <Text style={s.gridCardTitle}>GRADES</Text>
          </View>
          {trends.grade_history.length > 0 ? (
            <View style={s.gradeTimeline}>
              {trends.grade_history.slice(-5).map((g, i) => (
                <View key={i} style={s.gradeItem}>
                  <View style={[s.gradeDot, { backgroundColor: gradeColor(g.grade) }]}>
                    <Text style={s.gradeLetter}>{g.grade}</Text>
                  </View>
                  <Text style={s.gradeDate}>{shortDate(g.date)}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={s.noGrades}>No grades yet</Text>
          )}
          {/* System check rates */}
          <View style={s.checkRatesRow}>
            <CheckRate label="CON" pct={trends.system_check_rates.consumables} />
            <CheckRate label="VEH" pct={trends.system_check_rates.vehicle} />
            <CheckRate label="RTE" pct={trends.system_check_rates.route} />
          </View>
        </TouchableOpacity>
      </View>

      {/* ── Lessons Learned Row ────────────────────────────── */}
      <TouchableOpacity
        style={s.lessonsCard}
        onPress={() => setDetailModal('lessons')}
        activeOpacity={0.8}
      >
        <View style={s.lessonsHeader}>
          <Ionicons name="school-outline" size={11} color={TACTICAL.amber} />
          <Text style={s.lessonsTitle}>LESSONS LEARNED</Text>
          <Text style={s.lessonsCount}>{trends.lessons_learned.length} entries</Text>
        </View>
        {trends.lessons_learned.length > 0 ? (
          <View style={s.lessonPreview}>
            <View style={s.lessonBullet} />
            <Text style={s.lessonText} numberOfLines={1}>
              {trends.lessons_learned[0].change_next_time || trends.lessons_learned[0].went_wrong || 'View details'}
            </Text>
          </View>
        ) : (
          <Text style={s.noLessons}>No lessons recorded yet</Text>
        )}
      </TouchableOpacity>

      {/* ── AI Cross-Expedition Analysis ───────────────────── */}
      {!aiInsights ? (
        <TouchableOpacity
          style={s.aiBtn}
          onPress={handleGenerateAI}
          activeOpacity={0.7}
          disabled={aiLoading}
        >
          {aiLoading ? (
            <>
              <ActivityIndicator size="small" color="#B388FF" />
              <Text style={s.aiBtnText}>ANALYZING FLEET PATTERNS...</Text>
            </>
          ) : (
            <>
              <View style={s.aiIconWrap}>
                <Ionicons name="sparkles" size={12} color="#B388FF" />
              </View>
              <Text style={s.aiBtnText}>ECS CROSS-EXPEDITION ANALYSIS</Text>
              <Ionicons name="chevron-forward" size={11} color="rgba(179,136,255,0.4)" />
            </>
          )}
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={s.aiCard}
          onPress={() => setDetailModal('ai')}
          activeOpacity={0.8}
        >
          <View style={s.aiCardHeader}>
            <View style={s.aiIconWrap}>
              <Ionicons name="sparkles" size={10} color="#B388FF" />
            </View>
            <Text style={s.aiCardTitle}>ECS FLEET ANALYSIS</Text>
            <View style={s.aiScoreBadge}>
              <Text style={s.aiScoreText}>{aiInsights.fleet_health_score}/10</Text>
            </View>
            <View style={[s.aiGradePill, { backgroundColor: `${gradeColor(aiInsights.readiness_grade)}15` }]}>
              <Text style={[s.aiGradeText, { color: gradeColor(aiInsights.readiness_grade) }]}>
                {aiInsights.readiness_grade}
              </Text>
            </View>
            <TouchableOpacity
              style={s.aiRefreshBtn}
              onPress={handleGenerateAI}
              disabled={aiLoading}
              activeOpacity={0.7}
            >
              {aiLoading ? (
                <ActivityIndicator size={9} color="#B388FF" />
              ) : (
                <Ionicons name="refresh-outline" size={9} color="#B388FF" />
              )}
            </TouchableOpacity>
          </View>
          <Text style={s.aiSummaryText} numberOfLines={2}>{aiInsights.summary}</Text>
        </TouchableOpacity>
      )}

      {/* ══════════════════════════════════════════════════════ */}
      {/* DETAIL MODALS                                         */}
      {/* ══════════════════════════════════════════════════════ */}
      <Modal visible={detailModal !== null} transparent animationType="slide" onRequestClose={() => setDetailModal(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>
                {detailModal === 'events' ? 'EVENT TYPE BREAKDOWN' :
                 detailModal === 'resources' ? 'RESOURCE CONSUMPTION TRENDS' :
                 detailModal === 'risk' ? 'RISK ANALYSIS' :
                 detailModal === 'grades' ? 'EXPEDITION GRADE HISTORY' :
                 detailModal === 'lessons' ? 'LESSONS LEARNED' :
                 'ECS FLEET ANALYSIS'}
              </Text>
              <TouchableOpacity onPress={() => setDetailModal(null)} style={s.modalClose}>
                <Ionicons name="close" size={18} color={TACTICAL.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={s.modalBody}>
              {/* ── Events Detail ──────────────────────────── */}
              {detailModal === 'events' && (
                <>
                  <Text style={s.sectionLabel}>ALL EVENT TYPES ACROSS {trends.expedition_count} EXPEDITIONS</Text>
                  {eventTypes.map(([type, count]) => {
                    const meta = EVENT_TYPE_META[type as keyof typeof EVENT_TYPE_META];
                    const pct = maxEventCount > 0 ? (count / maxEventCount) * 100 : 0;
                    return (
                      <View key={type} style={s.detailBarRow}>
                        <View style={s.detailBarIcon}>
                          <Ionicons name={(meta?.icon || 'ellipse-outline') as any} size={13} color={meta?.color || TACTICAL.textMuted} />
                        </View>
                        <Text style={[s.detailBarLabel, { color: meta?.color || TACTICAL.textMuted }]}>
                          {meta?.label || type}
                        </Text>
                        <View style={s.detailBarTrack}>
                          <View style={[s.detailBarFill, { width: `${pct}%`, backgroundColor: meta?.color || TACTICAL.amber }]} />
                        </View>
                        <Text style={s.detailBarValue}>{count}</Text>
                      </View>
                    );
                  })}
                  {eventTypes.length === 0 && (
                    <Text style={s.noDataText}>No events recorded across expeditions.</Text>
                  )}

                  {/* Per-expedition event counts */}
                  <View style={s.divider} />
                  <Text style={s.sectionLabel}>EVENTS PER EXPEDITION</Text>
                  {trends.expedition_timeline.map((exp) => (
                    <View key={exp.id} style={s.expEventRow}>
                      <Text style={s.expEventTitle} numberOfLines={1}>{exp.title}</Text>
                      <Text style={s.expEventDate}>{shortDate(exp.date)}</Text>
                      <Text style={s.expEventCount}>{exp.event_count}</Text>
                    </View>
                  ))}
                </>
              )}

              {/* ── Resources Detail ──────────────────────── */}
              {detailModal === 'resources' && (
                <>
                  <Text style={s.sectionLabel}>AVERAGE RESOURCE DELTAS</Text>
                  <View style={s.avgDetailRow}>
                    <ResourceCard label="FUEL" value={trends.avg_resource_deltas.fuel} color="#FF9500" icon="flame-outline" />
                    <ResourceCard label="WATER" value={trends.avg_resource_deltas.water} color="#4FC3F7" icon="water-outline" />
                    <ResourceCard label="POWER" value={trends.avg_resource_deltas.power} color="#66BB6A" icon="battery-half-outline" />
                  </View>

                  <View style={s.divider} />
                  <Text style={s.sectionLabel}>PER-EXPEDITION RESOURCE TRENDS</Text>
                  {trends.resource_trends.map((pt, i) => (
                    <View key={i} style={s.resTrendRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.resTrendTitle} numberOfLines={1}>{pt.title}</Text>
                        <Text style={s.resTrendDate}>{shortDate(pt.date)}</Text>
                      </View>
                      <View style={[s.outcomeDot, { backgroundColor: outcomeColor(pt.outcome) }]} />
                      <DeltaChip label="F" value={pt.fuel_delta} color="#FF9500" />
                      <DeltaChip label="W" value={pt.water_delta} color="#4FC3F7" />
                      <DeltaChip label="P" value={pt.power_delta} color="#66BB6A" />
                    </View>
                  ))}
                  {trends.resource_trends.length === 0 && (
                    <Text style={s.noDataText}>No resource data available.</Text>
                  )}

                  <View style={s.divider} />
                  <Text style={s.sectionLabel}>SYSTEM CHECK PASS RATES</Text>
                  <View style={s.checkDetailRow}>
                    <CheckRateDetail label="Consumables Matched" pct={trends.system_check_rates.consumables} />
                    <CheckRateDetail label="Vehicle Performed" pct={trends.system_check_rates.vehicle} />
                    <CheckRateDetail label="Route Matched" pct={trends.system_check_rates.route} />
                  </View>
                </>
              )}

              {/* ── Risk Detail ───────────────────────────── */}
              {detailModal === 'risk' && (
                <>
                  <Text style={s.sectionLabel}>SEVERITY DISTRIBUTION</Text>
                  <View style={s.sevDetailGrid}>
                    {sevEntries.map(([sev, count]) => (
                      <View key={sev} style={s.sevDetailItem}>
                        <Text style={[s.sevDetailNum, { color: severityColor(sev) }]}>{count}</Text>
                        <Text style={s.sevDetailLabel}>{sev}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={s.divider} />
                  <Text style={s.sectionLabel}>TOP RISK CATEGORIES</Text>
                  {trends.top_risk_categories.map((cat, i) => {
                    const meta = EVENT_TYPE_META[cat.type as keyof typeof EVENT_TYPE_META];
                    return (
                      <View key={i} style={s.riskCatRow}>
                        <View style={[s.riskCatIcon, { backgroundColor: `${meta?.color || TACTICAL.textMuted}15` }]}>
                          <Ionicons name={(meta?.icon || 'ellipse-outline') as any} size={12} color={meta?.color || TACTICAL.textMuted} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.riskCatTitle}>{meta?.label || cat.type}</Text>
                          <Text style={s.riskCatDetail}>
                            {cat.count} total · {cat.critical} critical · {cat.high} high
                          </Text>
                        </View>
                        <View style={s.riskWeightBadge}>
                          <Text style={s.riskWeightText}>{cat.risk_weight}</Text>
                        </View>
                      </View>
                    );
                  })}

                  <View style={s.divider} />
                  <Text style={s.sectionLabel}>OUTCOME DISTRIBUTION</Text>
                  {Object.entries(trends.outcome_distribution).map(([out, cnt]) => (
                    <View key={out} style={s.outcomeDetailRow}>
                      <View style={[s.outcomeDetailDot, { backgroundColor: outcomeColor(out) }]} />
                      <Text style={s.outcomeDetailLabel}>{out}</Text>
                      <Text style={[s.outcomeDetailCount, { color: outcomeColor(out) }]}>{cnt}</Text>
                    </View>
                  ))}
                </>
              )}

              {/* ── Grades Detail ─────────────────────────── */}
              {detailModal === 'grades' && (
                <>
                  <Text style={s.sectionLabel}>EXPEDITION GRADE TIMELINE</Text>
                  {trends.grade_history.length > 0 ? (
                    trends.grade_history.map((g, i) => (
                      <View key={i} style={s.gradeDetailRow}>
                        <View style={[s.gradeDetailDot, { backgroundColor: gradeColor(g.grade) }]}>
                          <Text style={s.gradeDetailLetter}>{g.grade}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.gradeDetailTitle} numberOfLines={1}>{g.title}</Text>
                          <Text style={s.gradeDetailDate}>{new Date(g.date).toLocaleDateString()}</Text>
                        </View>
                        <View style={s.riskScoreBox}>
                          <Text style={s.riskScoreLabel}>RISK</Text>
                          <Text style={[s.riskScoreValue, {
                            color: g.risk_score <= 3 ? '#66BB6A' :
                              g.risk_score <= 6 ? '#FFB74D' : '#EF5350',
                          }]}>{g.risk_score}/10</Text>
                        </View>
                      </View>
                    ))
                  ) : (
                    <Text style={s.noDataText}>
                      No grades available. Generate AI analysis on individual expeditions to see grade history.
                    </Text>
                  )}

                  <View style={s.divider} />
                  <Text style={s.sectionLabel}>ALL EXPEDITIONS</Text>
                  {trends.expedition_timeline.map((exp) => (
                    <View key={exp.id} style={s.expTimelineRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.expTimelineTitle} numberOfLines={1}>{exp.title}</Text>
                        <Text style={s.expTimelineDate}>{new Date(exp.date).toLocaleDateString()}</Text>
                      </View>
                      <View style={s.expTimelineBadges}>
                        {exp.outcome && (
                          <View style={[s.miniPill, { backgroundColor: `${outcomeColor(exp.outcome)}15` }]}>
                            <Text style={[s.miniPillText, { color: outcomeColor(exp.outcome) }]}>{exp.outcome}</Text>
                          </View>
                        )}
                        {exp.grade && (
                          <View style={[s.miniPill, { backgroundColor: `${gradeColor(exp.grade)}15` }]}>
                            <Text style={[s.miniPillText, { color: gradeColor(exp.grade) }]}>{exp.grade}</Text>
                          </View>
                        )}
                        <Text style={s.expEventCountSmall}>{exp.event_count} ev</Text>
                      </View>
                    </View>
                  ))}
                </>
              )}

              {/* ── Lessons Detail ─────────────────────────── */}
              {detailModal === 'lessons' && (
                <>
                  <Text style={s.sectionLabel}>IMPROVEMENT TRACKING</Text>
                  {trends.lessons_learned.length > 0 ? (
                    trends.lessons_learned.map((lesson, i) => (
                      <View key={i} style={s.lessonDetailCard}>
                        <View style={s.lessonDetailHeader}>
                          <Text style={s.lessonDetailTitle} numberOfLines={1}>{lesson.title}</Text>
                          <Text style={s.lessonDetailDate}>{new Date(lesson.date).toLocaleDateString()}</Text>
                        </View>
                        {lesson.went_well ? (
                          <View style={s.lessonRow}>
                            <Ionicons name="checkmark-circle-outline" size={11} color="#66BB6A" />
                            <Text style={[s.lessonRowText, { color: '#66BB6A' }]}>{lesson.went_well}</Text>
                          </View>
                        ) : null}
                        {lesson.went_wrong ? (
                          <View style={s.lessonRow}>
                            <Ionicons name="close-circle-outline" size={11} color="#EF5350" />
                            <Text style={[s.lessonRowText, { color: '#EF5350' }]}>{lesson.went_wrong}</Text>
                          </View>
                        ) : null}
                        {lesson.change_next_time ? (
                          <View style={s.lessonRow}>
                            <Ionicons name="arrow-forward-circle-outline" size={11} color={TACTICAL.amber} />
                            <Text style={[s.lessonRowText, { color: TACTICAL.amber }]}>{lesson.change_next_time}</Text>
                          </View>
                        ) : null}
                      </View>
                    ))
                  ) : (
                    <Text style={s.noDataText}>No lessons learned recorded. Complete debriefs to track improvements.</Text>
                  )}

                  {/* AI Improvement Tracking */}
                  {aiInsights?.improvement_tracking && aiInsights.improvement_tracking.length > 0 && (
                    <>
                      <View style={s.divider} />
                      <View style={s.aiSectionHeader}>
                        <Ionicons name="sparkles" size={10} color="#B388FF" />
                  <Text style={[s.sectionLabel, { color: '#B388FF', marginTop: 0 }]}>ECS IMPROVEMENT ASSESSMENT</Text>
                      </View>
                      {aiInsights.improvement_tracking.map((track, i) => (
                        <View key={i} style={s.aiTrackCard}>
                          <View style={s.aiTrackHeader}>
                            <View style={s.aiBadge}>
                      <Text style={s.aiBadgeText}>ECS</Text>
                            </View>
                            <Text style={s.aiTrackTitle}>{track.title}</Text>
                            <View style={[s.statusPill, { backgroundColor: `${statusColor(track.status)}15` }]}>
                              <Text style={[s.statusPillText, { color: statusColor(track.status) }]}>{track.status}</Text>
                            </View>
                          </View>
                          <Text style={s.aiTrackDetail}>{track.detail}</Text>
                        </View>
                      ))}
                    </>
                  )}
                </>
              )}

              {/* ── AI Detail ──────────────────────────────── */}
              {detailModal === 'ai' && aiInsights && (
                <>
                  {/* Summary + Scores */}
                  <View style={s.aiTopRow}>
                    <View style={s.aiGradeCard}>
                      <Text style={s.aiGradeLabel}>FLEET</Text>
                      <Text style={[s.aiGradeValue, { color: gradeColor(aiInsights.readiness_grade) }]}>
                        {aiInsights.readiness_grade}
                      </Text>
                    </View>
                    <View style={s.aiHealthCard}>
                      <Text style={s.aiHealthLabel}>HEALTH SCORE</Text>
                      <View style={s.aiHealthBar}>
                        <View style={[s.aiHealthFill, {
                          width: `${aiInsights.fleet_health_score * 10}%`,
                          backgroundColor: aiInsights.fleet_health_score >= 7 ? '#66BB6A' :
                            aiInsights.fleet_health_score >= 4 ? '#FFB74D' : '#EF5350',
                        }]} />
                      </View>
                      <Text style={s.aiHealthValue}>{aiInsights.fleet_health_score}/10</Text>
                    </View>
                  </View>

                  <View style={s.aiSummaryBox}>
                    <Text style={s.aiSummaryFullText}>{aiInsights.summary}</Text>
                    <Text style={s.aiMeta}>
                      {aiInsights.expeditions_analyzed} expeditions · {aiInsights.model} · {new Date(aiInsights.generated_at).toLocaleString()}
                    </Text>
                  </View>

                  {/* Cross Patterns */}
                  {aiInsights.cross_patterns.length > 0 && (
                    <>
                      <View style={s.aiSectionHeader}>
                        <Ionicons name="analytics-outline" size={11} color="#B388FF" />
                        <Text style={[s.sectionLabel, { color: '#B388FF', marginTop: 0 }]}>CROSS-EXPEDITION PATTERNS</Text>
                      </View>
                      {aiInsights.cross_patterns.map((p, i) => (
                        <View key={i} style={s.aiInsightCard}>
                          <View style={s.aiInsightHeader}>
              <View style={s.aiBadge}><Text style={s.aiBadgeText}>ECS</Text></View>
                            <Text style={s.aiInsightTitle}>{p.title}</Text>
                            <View style={[s.sevPill, { backgroundColor: `${severityColor(p.severity)}15` }]}>
                              <Text style={[s.sevPillText, { color: severityColor(p.severity) }]}>{p.severity}</Text>
                            </View>
                          </View>
                          <Text style={s.aiInsightDetail}>{p.detail}</Text>
                          <Text style={s.aiInsightMeta}>{p.expeditions_affected} expedition(s) affected</Text>
                        </View>
                      ))}
                    </>
                  )}

                  {/* Trend Analysis */}
                  {aiInsights.trend_analysis.length > 0 && (
                    <>
                      <View style={s.aiSectionHeader}>
                        <Ionicons name="trending-up-outline" size={11} color="#FF9500" />
                        <Text style={[s.sectionLabel, { color: '#FF9500', marginTop: 0 }]}>TREND ANALYSIS</Text>
                      </View>
                      {aiInsights.trend_analysis.map((t, i) => (
                        <View key={i} style={s.aiInsightCard}>
                          <View style={s.aiInsightHeader}>
                            <View style={[s.dirIndicator, { backgroundColor: `${directionColor(t.direction)}15` }]}>
                              <Ionicons
                                name={t.direction === 'IMPROVING' ? 'trending-up-outline' :
                                  t.direction === 'DECLINING' ? 'trending-down-outline' : 'remove-outline'}
                                size={10}
                                color={directionColor(t.direction)}
                              />
                            </View>
                            <Text style={s.aiInsightTitle}>{t.title}</Text>
                            <View style={[s.dirPill, { backgroundColor: `${directionColor(t.direction)}15` }]}>
                              <Text style={[s.dirPillText, { color: directionColor(t.direction) }]}>{t.direction}</Text>
                            </View>
                          </View>
                          <Text style={s.aiInsightDetail}>{t.detail}</Text>
                          {t.metric ? <Text style={s.aiInsightMeta}>Metric: {t.metric}</Text> : null}
                        </View>
                      ))}
                    </>
                  )}

                  {/* Operational Recommendations */}
                  {aiInsights.operational_recommendations.length > 0 && (
                    <>
                      <View style={s.aiSectionHeader}>
                        <Ionicons name="bulb-outline" size={11} color="#66BB6A" />
                        <Text style={[s.sectionLabel, { color: '#66BB6A', marginTop: 0 }]}>OPERATIONAL RECOMMENDATIONS</Text>
                      </View>
                      {aiInsights.operational_recommendations.map((r, i) => (
                        <View key={i} style={s.aiInsightCard}>
                          <View style={s.aiInsightHeader}>
              <View style={s.aiBadge}><Text style={s.aiBadgeText}>ECS</Text></View>
                            <Text style={s.aiInsightTitle}>{r.title}</Text>
                            <View style={[s.sevPill, { backgroundColor: `${severityColor(r.priority)}15` }]}>
                              <Text style={[s.sevPillText, { color: severityColor(r.priority) }]}>{r.priority}</Text>
                            </View>
                          </View>
                          <Text style={s.aiInsightDetail}>{r.detail}</Text>
                        </View>
                      ))}
                    </>
                  )}

                  {/* Resource Insights */}
                  {aiInsights.resource_insights.length > 0 && (
                    <>
                      <View style={s.aiSectionHeader}>
                        <Ionicons name="flash-outline" size={11} color="#4FC3F7" />
                        <Text style={[s.sectionLabel, { color: '#4FC3F7', marginTop: 0 }]}>RESOURCE INSIGHTS</Text>
                      </View>
                      {aiInsights.resource_insights.map((r, i) => (
                        <View key={i} style={s.aiInsightCard}>
                          <View style={s.aiInsightHeader}>
              <View style={s.aiBadge}><Text style={s.aiBadgeText}>ECS</Text></View>
                            <Text style={s.aiInsightTitle}>{r.title}</Text>
                          </View>
                          <Text style={s.aiInsightDetail}>{r.detail}</Text>
                        </View>
                      ))}
                    </>
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════
// INLINE SUB-COMPONENTS
// ══════════════════════════════════════════════════════════════

function KPIChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={s.kpiChip}>
      <Text style={[s.kpiValue, { color }]}>{value}</Text>
      <Text style={s.kpiLabel}>{label}</Text>
    </View>
  );
}

function DeltaChip({ label, value, color }: { label: string; value: number; color: string }) {
  const isNeg = value < 0;
  const displayColor = isNeg ? '#EF5350' : value > 0 ? '#66BB6A' : TACTICAL.textMuted;
  return (
    <View style={s.deltaChip}>
      <Text style={[s.deltaLabel, { color }]}>{label}</Text>
      <Text style={[s.deltaValue, { color: displayColor }]}>
        {value > 0 ? '+' : ''}{value}%
      </Text>
    </View>
  );
}

function CheckRate({ label, pct }: { label: string; pct: number }) {
  const color = pct >= 80 ? '#66BB6A' : pct >= 50 ? '#FFB74D' : '#EF5350';
  return (
    <View style={s.checkRateItem}>
      <Text style={s.checkRateLabel}>{label}</Text>
      <View style={s.checkRateBar}>
        <View style={[s.checkRateFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function ResourceCard({ label, value, color, icon }: { label: string; value: number; color: string; icon: string }) {
  const isNeg = value < 0;
  const displayColor = isNeg ? '#EF5350' : value > 0 ? '#66BB6A' : TACTICAL.textMuted;
  return (
    <View style={s.resCard}>
      <Ionicons name={icon as any} size={14} color={color} />
      <Text style={s.resCardLabel}>{label}</Text>
      <Text style={[s.resCardValue, { color: displayColor }]}>
        {value > 0 ? '+' : ''}{value}%
      </Text>
    </View>
  );
}

function CheckRateDetail({ label, pct }: { label: string; pct: number }) {
  const color = pct >= 80 ? '#66BB6A' : pct >= 50 ? '#FFB74D' : '#EF5350';
  return (
    <View style={s.checkDetailItem}>
      <Text style={s.checkDetailLabel}>{label}</Text>
      <View style={s.checkDetailBar}>
        <View style={[s.checkDetailFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <Text style={[s.checkDetailPct, { color }]}>{pct}%</Text>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════
// STYLES
// ══════════════════════════════════════════════════════════════

const s = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 14, gap: 5 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyText: { fontSize: 12, color: TACTICAL.textMuted },

  // No data
  noDataIcon: {
    width: 64, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(196,138,44,0.05)', borderWidth: 1, borderColor: 'rgba(196,138,44,0.12)',
    marginBottom: 8,
  },
  noDataTitle: { fontSize: 13, fontWeight: '800', color: TACTICAL.text, letterSpacing: 2 },
  noDataDesc: { fontSize: 11, color: TACTICAL.textMuted, textAlign: 'center', maxWidth: 260, lineHeight: 16 },
  refreshBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12,
    backgroundColor: TACTICAL.amber, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8,
  },
  refreshBtnText: { fontSize: 10, fontWeight: '800', color: '#0B0F12', letterSpacing: 1.5 },

  // Header
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 4,
  },
  headerLeft: { flex: 1 },
  headerLabel: { fontSize: 9, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 2 },
  headerSub: { fontSize: 9, color: TACTICAL.textMuted, fontFamily: 'Courier', marginTop: 1 },
  headerRefresh: {
    width: 28, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(196,138,44,0.08)', borderWidth: 1, borderColor: 'rgba(196,138,44,0.2)',
  },

  // KPI Strip
  kpiStrip: { flexDirection: 'row', gap: 6 },
  kpiChip: {
    flex: 1, alignItems: 'center', gap: 1,
    backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 7, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(62,79,60,0.15)',
  },
  kpiValue: { fontSize: 14, fontWeight: '800', fontFamily: 'Courier' },
  kpiLabel: { fontSize: 6, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1.5 },

  // Grid
  gridRow: { flexDirection: 'row', gap: 6 },
  gridCard: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 9, padding: 8,
    borderWidth: 1, borderColor: 'rgba(62,79,60,0.2)',
  },
  gridCardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 5,
  },
  gridCardTitle: { fontSize: 7, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 1.5 },
  gridMore: { fontSize: 8, color: TACTICAL.amber, textAlign: 'center', marginTop: 2 },

  // Bar chart
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3 },
  barLabel: { fontSize: 7, fontWeight: '700', width: 28, letterSpacing: 0.5 },
  barTrack: {
    flex: 1, height: 5, borderRadius: 2.5, backgroundColor: 'rgba(0,0,0,0.3)', overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 2.5 },
  barValue: { fontSize: 8, fontWeight: '700', color: TACTICAL.text, fontFamily: 'Courier', width: 18, textAlign: 'right' },

  // Avg row
  avgRow: { flexDirection: 'row', gap: 3, marginBottom: 4 },
  deltaChip: {
    flex: 1, alignItems: 'center', gap: 1,
    backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 4, paddingVertical: 2,
  },
  deltaLabel: { fontSize: 6, fontWeight: '700', letterSpacing: 0.5 },
  deltaValue: { fontSize: 9, fontWeight: '800', fontFamily: 'Courier' },

  // Sparkline
  sparkRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 18, justifyContent: 'center' },
  sparkBarWrap: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  sparkBar: { width: 6, borderRadius: 2, minHeight: 3 },

  // Severity grid
  sevGrid: { flexDirection: 'row', gap: 3, marginBottom: 4 },
  sevItem: { flex: 1, alignItems: 'center', gap: 1 },
  sevNum: { fontSize: 12, fontWeight: '800', fontFamily: 'Courier' },
  sevLabel: { fontSize: 6, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 0.5 },

  // Outcome pills
  outcomeRow: { flexDirection: 'row', gap: 3 },
  outcomePill: { flex: 1, alignItems: 'center', borderRadius: 4, paddingVertical: 2 },
  outcomeText: { fontSize: 7, fontWeight: '700', letterSpacing: 0.5 },

  // Grade timeline
  gradeTimeline: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', marginBottom: 4 },
  gradeItem: { alignItems: 'center', gap: 2 },
  gradeDot: {
    width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
  },
  gradeLetter: { fontSize: 10, fontWeight: '900', color: '#0B0F12' },
  gradeDate: { fontSize: 7, color: TACTICAL.textMuted, fontFamily: 'Courier' },
  noGrades: { fontSize: 9, color: TACTICAL.textMuted, textAlign: 'center', marginBottom: 4 },

  // Check rates
  checkRatesRow: { flexDirection: 'row', gap: 4 },
  checkRateItem: { flex: 1, gap: 2 },
  checkRateLabel: { fontSize: 6, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 0.5, textAlign: 'center' },
  checkRateBar: { height: 3, borderRadius: 1.5, backgroundColor: 'rgba(0,0,0,0.3)', overflow: 'hidden' },
  checkRateFill: { height: '100%', borderRadius: 1.5 },

  // Lessons card
  lessonsCard: {
    backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 9, padding: 8,
    borderWidth: 1, borderColor: 'rgba(62,79,60,0.2)',
  },
  lessonsHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4,
  },
  lessonsTitle: { fontSize: 7, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 1.5, flex: 1 },
  lessonsCount: { fontSize: 8, color: TACTICAL.textMuted, fontFamily: 'Courier' },
  lessonPreview: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lessonBullet: { width: 4, height: 4, borderRadius: 2, backgroundColor: TACTICAL.amber },
  lessonText: { fontSize: 10, color: TACTICAL.text, flex: 1 },
  noLessons: { fontSize: 9, color: TACTICAL.textMuted },

  // AI button
  aiBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: 'rgba(179,136,255,0.06)', borderRadius: 9, paddingVertical: 9,
    borderWidth: 1, borderColor: 'rgba(179,136,255,0.2)', borderStyle: 'dashed',
  },
  aiIconWrap: {
    width: 20, height: 20, borderRadius: 5, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(179,136,255,0.1)',
  },
  aiBtnText: { fontSize: 8, fontWeight: '800', color: '#B388FF', letterSpacing: 2 },

  // AI card
  aiCard: {
    backgroundColor: 'rgba(179,136,255,0.04)', borderRadius: 9, padding: 8,
    borderWidth: 1, borderColor: 'rgba(179,136,255,0.18)',
  },
  aiCardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4,
  },
  aiCardTitle: { fontSize: 7, fontWeight: '800', color: '#B388FF', letterSpacing: 2, flex: 1 },
  aiScoreBadge: {
    paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3,
    backgroundColor: 'rgba(179,136,255,0.1)', borderWidth: 1, borderColor: 'rgba(179,136,255,0.25)',
  },
  aiScoreText: { fontSize: 7, fontWeight: '800', color: '#B388FF', fontFamily: 'Courier' },
  aiGradePill: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3 },
  aiGradeText: { fontSize: 7, fontWeight: '800', letterSpacing: 0.5 },
  aiRefreshBtn: {
    width: 18, height: 18, borderRadius: 5, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(179,136,255,0.08)', borderWidth: 1, borderColor: 'rgba(179,136,255,0.2)',
  },
  aiSummaryText: { fontSize: 9, color: TACTICAL.text, lineHeight: 13, opacity: 0.85 },

  // ── Modal ───────────────────────────────────────────────
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalSheet: {
    height: '82%', backgroundColor: '#0F1612', borderTopLeftRadius: 18, borderTopRightRadius: 18,
    borderWidth: 1, borderBottomWidth: 0, borderColor: 'rgba(62,79,60,0.35)',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(62,79,60,0.2)',
  },
  modalTitle: { fontSize: 11, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 2 },
  modalClose: {
    width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)', borderWidth: 1, borderColor: 'rgba(62,79,60,0.25)',
  },
  modalBody: { padding: 16, paddingBottom: 40 },

  // Section labels
  sectionLabel: { fontSize: 8, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 2, marginTop: 4, marginBottom: 8 },
  divider: { height: 1, backgroundColor: 'rgba(62,79,60,0.15)', marginVertical: 12 },
  noDataText: { fontSize: 11, color: TACTICAL.textMuted, lineHeight: 16 },

  // Detail bar rows
  detailBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  detailBarIcon: {
    width: 24, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  detailBarLabel: { fontSize: 10, fontWeight: '700', width: 60 },
  detailBarTrack: {
    flex: 1, height: 8, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.3)', overflow: 'hidden',
  },
  detailBarFill: { height: '100%', borderRadius: 4 },
  detailBarValue: { fontSize: 11, fontWeight: '800', color: TACTICAL.text, fontFamily: 'Courier', width: 28, textAlign: 'right' },

  // Expedition event rows
  expEventRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: 'rgba(62,79,60,0.08)',
  },
  expEventTitle: { fontSize: 11, fontWeight: '600', color: TACTICAL.text, flex: 1 },
  expEventDate: { fontSize: 9, color: TACTICAL.textMuted, fontFamily: 'Courier' },
  expEventCount: { fontSize: 12, fontWeight: '800', color: TACTICAL.amber, fontFamily: 'Courier', width: 28, textAlign: 'right' },

  // Resource detail
  avgDetailRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  resCard: {
    flex: 1, alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 8, paddingVertical: 10,
    borderWidth: 1, borderColor: 'rgba(62,79,60,0.15)',
  },
  resCardLabel: { fontSize: 8, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1 },
  resCardValue: { fontSize: 16, fontWeight: '800', fontFamily: 'Courier' },

  // Resource trend rows
  resTrendRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: 'rgba(62,79,60,0.08)',
  },
  resTrendTitle: { fontSize: 11, fontWeight: '600', color: TACTICAL.text },
  resTrendDate: { fontSize: 8, color: TACTICAL.textMuted, fontFamily: 'Courier' },
  outcomeDot: { width: 6, height: 6, borderRadius: 3 },

  // Check detail
  checkDetailRow: { gap: 10 },
  checkDetailItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkDetailLabel: { fontSize: 11, color: TACTICAL.textMuted, width: 140 },
  checkDetailBar: {
    flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.3)', overflow: 'hidden',
  },
  checkDetailFill: { height: '100%', borderRadius: 3 },
  checkDetailPct: { fontSize: 11, fontWeight: '800', fontFamily: 'Courier', width: 36, textAlign: 'right' },

  // Severity detail
  sevDetailGrid: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  sevDetailItem: {
    flex: 1, alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 8, paddingVertical: 10,
    borderWidth: 1, borderColor: 'rgba(62,79,60,0.15)',
  },
  sevDetailNum: { fontSize: 20, fontWeight: '800', fontFamily: 'Courier' },
  sevDetailLabel: { fontSize: 8, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1 },

  // Risk categories
  riskCatRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: 'rgba(62,79,60,0.08)',
  },
  riskCatIcon: {
    width: 28, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center',
  },
  riskCatTitle: { fontSize: 12, fontWeight: '700', color: TACTICAL.text },
  riskCatDetail: { fontSize: 9, color: TACTICAL.textMuted, marginTop: 1 },
  riskWeightBadge: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
    backgroundColor: 'rgba(196,138,44,0.1)', borderWidth: 1, borderColor: 'rgba(196,138,44,0.2)',
  },
  riskWeightText: { fontSize: 9, fontWeight: '800', color: TACTICAL.amber, fontFamily: 'Courier' },

  // Outcome detail
  outcomeDetailRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6,
  },
  outcomeDetailDot: { width: 8, height: 8, borderRadius: 4 },
  outcomeDetailLabel: { fontSize: 12, fontWeight: '600', color: TACTICAL.text, flex: 1 },
  outcomeDetailCount: { fontSize: 14, fontWeight: '800', fontFamily: 'Courier' },

  // Grade detail
  gradeDetailRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: 'rgba(62,79,60,0.08)',
  },
  gradeDetailDot: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
  },
  gradeDetailLetter: { fontSize: 14, fontWeight: '900', color: '#0B0F12' },
  gradeDetailTitle: { fontSize: 12, fontWeight: '700', color: TACTICAL.text },
  gradeDetailDate: { fontSize: 9, color: TACTICAL.textMuted, fontFamily: 'Courier', marginTop: 2 },
  riskScoreBox: { alignItems: 'center', gap: 2 },
  riskScoreLabel: { fontSize: 7, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1 },
  riskScoreValue: { fontSize: 12, fontWeight: '800', fontFamily: 'Courier' },

  // Expedition timeline
  expTimelineRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: 'rgba(62,79,60,0.08)',
  },
  expTimelineTitle: { fontSize: 11, fontWeight: '600', color: TACTICAL.text },
  expTimelineDate: { fontSize: 8, color: TACTICAL.textMuted, fontFamily: 'Courier', marginTop: 1 },
  expTimelineBadges: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  miniPill: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3 },
  miniPillText: { fontSize: 7, fontWeight: '800', letterSpacing: 0.5 },
  expEventCountSmall: { fontSize: 8, color: TACTICAL.textMuted, fontFamily: 'Courier' },

  // Lessons detail
  lessonDetailCard: {
    backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: 10,
    borderWidth: 1, borderColor: 'rgba(62,79,60,0.15)', marginBottom: 8,
  },
  lessonDetailHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6,
  },
  lessonDetailTitle: { fontSize: 12, fontWeight: '700', color: TACTICAL.text, flex: 1 },
  lessonDetailDate: { fontSize: 8, color: TACTICAL.textMuted, fontFamily: 'Courier' },
  lessonRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 4 },
  lessonRowText: { fontSize: 11, flex: 1, lineHeight: 15 },

  // AI section header
  aiSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, marginBottom: 6 },

  // AI badge
  aiBadge: {
    paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3,
    backgroundColor: 'rgba(179,136,255,0.15)', borderWidth: 1, borderColor: 'rgba(179,136,255,0.3)',
  },
  aiBadgeText: { fontSize: 6, fontWeight: '900', color: '#B388FF', letterSpacing: 1 },

  // AI track card
  aiTrackCard: {
    backgroundColor: 'rgba(179,136,255,0.03)', borderRadius: 8, padding: 10,
    borderWidth: 1, borderColor: 'rgba(179,136,255,0.1)', marginBottom: 6,
  },
  aiTrackHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  aiTrackTitle: { fontSize: 11, fontWeight: '700', color: TACTICAL.text, flex: 1 },
  aiTrackDetail: { fontSize: 10, color: TACTICAL.textMuted, lineHeight: 14, paddingLeft: 2 },

  // Status pill
  statusPill: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3 },
  statusPillText: { fontSize: 7, fontWeight: '800', letterSpacing: 0.5 },

  // AI top row
  aiTopRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  aiGradeCard: {
    width: 64, alignItems: 'center', justifyContent: 'center', gap: 4,
    backgroundColor: 'rgba(179,136,255,0.06)', borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: 'rgba(179,136,255,0.15)',
  },
  aiGradeLabel: { fontSize: 7, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 2 },
  aiGradeValue: { fontSize: 28, fontWeight: '900' },
  aiHealthCard: {
    flex: 1, justifyContent: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: 'rgba(62,79,60,0.2)',
  },
  aiHealthLabel: { fontSize: 7, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 2 },
  aiHealthBar: { height: 6, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.3)', overflow: 'hidden' },
  aiHealthFill: { height: '100%', borderRadius: 3 },
  aiHealthValue: { fontSize: 14, fontWeight: '800', color: TACTICAL.text, fontFamily: 'Courier' },

  // AI summary box
  aiSummaryBox: {
    backgroundColor: 'rgba(179,136,255,0.04)', borderRadius: 8, padding: 10,
    borderWidth: 1, borderColor: 'rgba(179,136,255,0.1)', marginBottom: 8,
  },
  aiSummaryFullText: { fontSize: 11, color: TACTICAL.text, lineHeight: 16, marginBottom: 6 },
  aiMeta: { fontSize: 8, color: TACTICAL.textMuted, fontFamily: 'Courier', opacity: 0.6 },

  // AI insight cards
  aiInsightCard: {
    backgroundColor: 'rgba(179,136,255,0.03)', borderRadius: 8, padding: 10,
    borderWidth: 1, borderColor: 'rgba(179,136,255,0.1)', marginBottom: 6,
  },
  aiInsightHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  aiInsightTitle: { fontSize: 11, fontWeight: '700', color: TACTICAL.text, flex: 1 },
  aiInsightDetail: { fontSize: 10, color: TACTICAL.textMuted, lineHeight: 14, paddingLeft: 2 },
  aiInsightMeta: { fontSize: 8, color: 'rgba(179,136,255,0.5)', fontFamily: 'Courier', marginTop: 4 },

  // Severity pill
  sevPill: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3 },
  sevPillText: { fontSize: 7, fontWeight: '800', letterSpacing: 0.5 },

  // Direction indicator
  dirIndicator: {
    width: 20, height: 20, borderRadius: 5, alignItems: 'center', justifyContent: 'center',
  },
  dirPill: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3 },
  dirPillText: { fontSize: 7, fontWeight: '800', letterSpacing: 0.5 },
});



