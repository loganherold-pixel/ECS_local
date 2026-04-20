/**
 * AAR View — After Action Review Display (No Scroll)
 *
 * Three enterprise cards + AI Analysis section:
 *   1. Performance Summary (planned vs actual deltas)
 *   2. Risk & Incidents (counts, critical highlights)
 *   3. Recommendations (rule-based + AI-powered)
 *
 * AI Analysis features:
 *   - Generate AI Analysis button
 *   - Pattern analysis, risk trends, resource optimization, route improvements
 *   - AI SUGGESTED badges on AI-generated recommendations
 *   - Overall risk score and expedition grade
 *
 * PDF Export:
 *   - Generates a professional PDF from all AAR data
 *   - Uses expo-print (native) or browser print (web)
 *   - Share via expo-sharing on native platforms
 *
 * Data from aar_reports table via debriefStore.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Platform, ActivityIndicator, Modal, FlatList, ScrollView,
} from 'react-native';
import { SafeIcon as Ionicons } from '../../components/SafeIcon';
import { TACTICAL } from '../../lib/theme';
import {
  debriefStore,
  type AARReport,
  type AARPerformanceSummary,
  type AARRiskSummary,
  type AIAnalysis,
} from '../../lib/debriefStore';
import { EVENT_TYPE_META, SEVERITY_META } from '../../lib/expeditionEventStore';
import { exportAARToPdf } from '../../lib/aarPdfExport';

// ── Props ────────────────────────────────────────────────────

interface AARViewProps {
  expedition: any;
  showToast: (msg: string) => void;
}

// ── Component ────────────────────────────────────────────────

export default function AARView({ expedition, showToast }: AARViewProps) {
  const [aar, setAAR] = useState<AARReport | null>(null);
  const [aiAnalysis, setAIAnalysis] = useState<AIAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAILoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [detailModal, setDetailModal] = useState<'perf' | 'risk' | 'recs' | 'ai' | null>(null);

  // ── Load AAR ───────────────────────────────────────────────
  useEffect(() => {
    if (!expedition?.id) { setLoading(false); return; }

    // Check cache first
    const cached = debriefStore.getAAR(expedition.id);
    if (cached) {
      setAAR(cached);
      if (cached.ai_analysis) setAIAnalysis(cached.ai_analysis);
    }

    // Check AI analysis cache
    const cachedAI = debriefStore.getAIAnalysis(expedition.id);
    if (cachedAI) setAIAnalysis(cachedAI);

    // Then try server
    debriefStore.loadAAR(expedition.id).then(a => {
      if (a) {
        setAAR(a);
        if (a.ai_analysis) setAIAnalysis(a.ai_analysis);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [expedition?.id]);

  // ── Store subscription ─────────────────────────────────────
  useEffect(() => {
    const unsub = debriefStore.subscribe(() => {
      if (expedition?.id) {
        const a = debriefStore.getAAR(expedition.id);
        if (a) {
          setAAR(a);
          if (a.ai_analysis) setAIAnalysis(a.ai_analysis);
        }
        const ai = debriefStore.getAIAnalysis(expedition.id);
        if (ai) setAIAnalysis(ai);
      }
    });
    return unsub;
  }, [expedition?.id]);

  // ── Regenerate AAR ─────────────────────────────────────────
  const handleRegenerate = useCallback(async () => {
    if (!expedition?.id) return;
    setLoading(true);
    const result = await debriefStore.generateAAR(expedition.id, (msg) => showToast(msg));
    if (result) {
      setAAR(result);
      showToast('AAR regenerated');
    }
    setLoading(false);
  }, [expedition?.id, showToast]);

  // ── Generate AI Analysis ───────────────────────────────────
  const handleGenerateAI = useCallback(async () => {
    if (!expedition?.id) return;
    setAILoading(true);
    showToast('Analyzing expedition data with AI...');

    const result = await debriefStore.generateAIAnalysis(
      expedition.id,
      (msg) => showToast(msg),
      (msg) => showToast(msg),
    );

    if (result) {
      setAIAnalysis(result);
      showToast('AI analysis complete');
    }
    setAILoading(false);
  }, [expedition?.id, showToast]);

  // ── Export PDF ─────────────────────────────────────────────
  const handleExportPDF = useCallback(async () => {
    if (!expedition?.id || !aar) return;
    setExporting(true);
    showToast('Generating PDF...');

    try {
      const result = await exportAARToPdf({
        expedition: {
          id: expedition.id,
          title: expedition.title,
          start_at: expedition.start_at,
          end_at: expedition.end_at,
          status: expedition.status,
        },
        aar,
        aiAnalysis: aiAnalysis || undefined,
      });

      if (result.success) {
        showToast('PDF exported successfully');
      } else {
        showToast(result.error || 'PDF export failed');
      }
    } catch (err: any) {
      console.error('[AARView] PDF export error:', err);
      showToast('PDF export failed: ' + (err.message || 'Unknown error'));
    } finally {
      setExporting(false);
    }
  }, [expedition, aar, aiAnalysis, showToast]);


  // ── No expedition ──────────────────────────────────────────
  if (!expedition) {
    return (
      <View style={s.empty}>
        <Ionicons name="git-compare-outline" size={28} color="rgba(138,138,133,0.3)" />
        <Text style={s.emptyText}>Select an expedition to view AAR</Text>
      </View>
    );
  }

  // ── Loading ────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={s.empty}>
        <ActivityIndicator size="small" color={TACTICAL.amber} />
        <Text style={s.emptyText}>Loading AAR...</Text>
      </View>
    );
  }

  // ── No AAR yet ─────────────────────────────────────────────
  if (!aar) {
    return (
      <View style={s.empty}>
        <View style={s.noAarIcon}>
          <Ionicons name="git-compare-outline" size={32} color="rgba(196,138,44,0.3)" />
        </View>
        <Text style={s.noAarTitle}>NO AAR GENERATED</Text>
        <Text style={s.noAarDesc}>Complete the Debrief wizard to generate an After Action Review.</Text>
        {debriefStore.hasDebrief(expedition.id) && (
          <TouchableOpacity style={s.genBtn} onPress={handleRegenerate} activeOpacity={0.7}>
            <Ionicons name="refresh-outline" size={14} color="#0B0F12" />
            <Text style={s.genBtnText}>GENERATE AAR</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // ── AAR Data ───────────────────────────────────────────────
  const perf = aar.performance_summary as AARPerformanceSummary;
  const risk = aar.risk_summary as AARRiskSummary;
  const recs = aar.recommendations || [];

  const outcomeColor = perf.outcome === 'SUCCESS' ? '#66BB6A'
    : perf.outcome === 'MODIFIED' ? '#FFB74D' : '#EF5350';

  // Count AI recommendations for display
  const aiRecCount = aiAnalysis
    ? (aiAnalysis.pattern_analysis?.length || 0)
      + (aiAnalysis.risk_trends?.length || 0)
      + (aiAnalysis.resource_optimization?.length || 0)
      + (aiAnalysis.route_improvements?.length || 0)
    : 0;

  return (
    <View style={s.aarContainer}>
      {/* ── AAR Header ────────────────────────────────────── */}
      <View style={s.aarHeader}>
        <View style={s.aarHeaderLeft}>
          <Text style={s.aarTitle} numberOfLines={1}>{expedition.title || 'Expedition'}</Text>
          <Text style={s.aarDate}>
            {expedition.start_at ? new Date(expedition.start_at).toLocaleDateString() : '--'}
            {expedition.end_at ? ` — ${new Date(expedition.end_at).toLocaleDateString()}` : ''}
          </Text>
        </View>
        <View style={s.aarActions}>
          <TouchableOpacity style={s.regenBtn} onPress={handleRegenerate} activeOpacity={0.7}>
            <Ionicons name="refresh-outline" size={12} color={TACTICAL.amber} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.exportBtn, exporting && s.exportBtnActive]}
            onPress={handleExportPDF}
            activeOpacity={0.7}
            disabled={exporting}
          >
            {exporting ? (
              <ActivityIndicator size={10} color={TACTICAL.amber} />
            ) : (
              <Ionicons name="document-outline" size={12} color={TACTICAL.textMuted} />
            )}
            <Text style={[s.exportBtnText, exporting && { color: TACTICAL.amber }]}>
              {exporting ? 'GENERATING...' : 'PDF'}
            </Text>
          </TouchableOpacity>

        </View>
      </View>

      {/* ── Card 1: Performance Summary ───────────────────── */}
      <TouchableOpacity
        style={s.card}
        onPress={() => setDetailModal('perf')}
        activeOpacity={0.8}
      >
        <View style={s.cardHeader}>
          <View style={s.cardIcon}>
            <Ionicons name="speedometer-outline" size={14} color={TACTICAL.amber} />
          </View>
          <Text style={s.cardTitle}>PERFORMANCE SUMMARY</Text>
          <View style={[s.outcomeBadge, { backgroundColor: `${outcomeColor}15` }]}>
            <Text style={[s.outcomeBadgeText, { color: outcomeColor }]}>{perf.outcome}</Text>
          </View>
        </View>
        <View style={s.perfGrid}>
          <PerfDelta label="FUEL" value={perf.fuel_delta_pct} color="#FF9500" />
          <PerfDelta label="WATER" value={perf.water_delta_pct} color="#4FC3F7" />
          <PerfDelta label="POWER" value={perf.power_delta_pct} color="#66BB6A" />
        </View>
        <View style={s.checkRow}>
          <CheckBadge label="Consumables" ok={perf.consumables_matched_plan} />
          <CheckBadge label="Vehicle" ok={perf.vehicle_performed_expected} />
          <CheckBadge label="Route" ok={perf.route_matched_expected} />
        </View>
      </TouchableOpacity>

      {/* ── Card 2: Risk & Incidents ──────────────────────── */}
      <TouchableOpacity
        style={s.card}
        onPress={() => setDetailModal('risk')}
        activeOpacity={0.8}
      >
        <View style={s.cardHeader}>
          <View style={[s.cardIcon, { backgroundColor: 'rgba(239,83,80,0.08)' }]}>
            <Ionicons name="warning-outline" size={14} color="#EF5350" />
          </View>
          <Text style={s.cardTitle}>RISK & INCIDENTS</Text>
          {aiAnalysis && (
            <View style={s.aiGradeBadge}>
              <Text style={s.aiGradeText}>{aiAnalysis.expedition_grade}</Text>
            </View>
          )}
          <Text style={s.cardCount}>{risk.total_events} events</Text>
        </View>
        <View style={s.riskGrid}>
          <View style={s.riskStat}>
            <Text style={[s.riskNum, { color: '#EF5350' }]}>{risk.critical_count}</Text>
            <Text style={s.riskLabel}>CRITICAL</Text>
          </View>
          <View style={s.riskStat}>
            <Text style={[s.riskNum, { color: '#FF9500' }]}>{risk.high_count}</Text>
            <Text style={s.riskLabel}>HIGH</Text>
          </View>
          <View style={s.riskStat}>
            <Text style={[s.riskNum, { color: '#FFB74D' }]}>{risk.severity_counts?.MED || 0}</Text>
            <Text style={s.riskLabel}>MED</Text>
          </View>
          <View style={s.riskStat}>
            <Text style={[s.riskNum, { color: '#66BB6A' }]}>{risk.severity_counts?.LOW || 0}</Text>
            <Text style={s.riskLabel}>LOW</Text>
          </View>
        </View>
        {risk.critical_highlights && risk.critical_highlights.length > 0 && (
          <View style={s.highlightRow}>
            <Ionicons name="alert-circle" size={10} color="#EF5350" />
            <Text style={s.highlightText} numberOfLines={1}>
              {risk.critical_highlights[0].details}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {/* ── Card 3: Recommendations + AI ──────────────────── */}
      <TouchableOpacity
        style={s.card}
        onPress={() => setDetailModal('recs')}
        activeOpacity={0.8}
      >
        <View style={s.cardHeader}>
          <View style={[s.cardIcon, { backgroundColor: 'rgba(102,187,106,0.08)' }]}>
            <Ionicons name="bulb-outline" size={14} color="#66BB6A" />
          </View>
          <Text style={s.cardTitle}>RECOMMENDATIONS</Text>
        <Text style={s.cardCount}>{recs.length}{aiRecCount > 0 ? ` + ${aiRecCount} ECS` : ''}</Text>
        </View>
        {recs.slice(0, 2).map((rec, idx) => (
          <View key={`rule-${idx}`} style={s.recRow}>
            <View style={s.recBullet} />
            <Text style={s.recText} numberOfLines={1}>{rec}</Text>
          </View>
        ))}
        {aiAnalysis && aiAnalysis.critical_insights && aiAnalysis.critical_insights.length > 0 && (
          <View style={s.recRow}>
            <View style={s.aiBadgeInline}>
              <Text style={s.aiBadgeInlineText}>ECS</Text>
            </View>
            <Text style={[s.recText, { color: '#B388FF' }]} numberOfLines={1}>
              {aiAnalysis.critical_insights[0]}
            </Text>
          </View>
        )}
        {(recs.length > 2 || aiRecCount > 0) && (
          <Text style={s.recMore}>
            {recs.length > 2 ? `+${recs.length - 2} more` : ''}
            {recs.length > 2 && aiRecCount > 0 ? ' · ' : ''}
            {aiRecCount > 0 ? `${aiRecCount} ECS insights` : ''}
          </Text>
        )}
      </TouchableOpacity>

      {/* ── AI Analysis Section ────────────────────────────── */}
      {!aiAnalysis ? (
        <TouchableOpacity
          style={s.aiGenerateBtn}
          onPress={handleGenerateAI}
          activeOpacity={0.7}
          disabled={aiLoading}
        >
          {aiLoading ? (
            <>
              <ActivityIndicator size="small" color="#B388FF" />
              <Text style={s.aiGenerateBtnText}>ANALYZING...</Text>
              <View style={s.aiPulse} />
            </>
          ) : (
            <>
              <View style={s.aiIconWrap}>
                <Ionicons name="sparkles" size={14} color="#B388FF" />
              </View>
              <Text style={s.aiGenerateBtnText}>GENERATE ECS ANALYSIS</Text>
              <Ionicons name="chevron-forward" size={12} color="rgba(179,136,255,0.4)" />
            </>
          )}
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={s.aiSummaryCard}
          onPress={() => setDetailModal('ai')}
          activeOpacity={0.8}
        >
          <View style={s.aiSummaryHeader}>
            <View style={s.aiIconWrap}>
              <Ionicons name="sparkles" size={12} color="#B388FF" />
            </View>
            <Text style={s.aiSummaryTitle}>ECS ANALYSIS</Text>
            <View style={s.aiScoreBadge}>
              <Text style={s.aiScoreText}>
                {aiAnalysis.overall_risk_score}/10
              </Text>
            </View>
            <View style={[s.aiGradePill, {
              backgroundColor: aiAnalysis.expedition_grade === 'A' ? 'rgba(102,187,106,0.12)' :
                aiAnalysis.expedition_grade === 'B' ? 'rgba(102,187,106,0.08)' :
                aiAnalysis.expedition_grade === 'C' ? 'rgba(255,183,77,0.1)' :
                'rgba(239,83,80,0.1)',
            }]}>
              <Text style={[s.aiGradePillText, {
                color: aiAnalysis.expedition_grade === 'A' ? '#66BB6A' :
                  aiAnalysis.expedition_grade === 'B' ? '#81C784' :
                  aiAnalysis.expedition_grade === 'C' ? '#FFB74D' :
                  '#EF5350',
              }]}>
                GRADE {aiAnalysis.expedition_grade}
              </Text>
            </View>
            <TouchableOpacity
              style={s.aiRefreshBtn}
              onPress={handleGenerateAI}
              activeOpacity={0.7}
              disabled={aiLoading}
            >
              {aiLoading ? (
                <ActivityIndicator size={10} color="#B388FF" />
              ) : (
                <Ionicons name="refresh-outline" size={10} color="#B388FF" />
              )}
            </TouchableOpacity>
          </View>
          <Text style={s.aiSummaryText} numberOfLines={2}>{aiAnalysis.summary}</Text>
          <View style={s.aiChipsRow}>
            <View style={s.aiChip}>
              <Ionicons name="analytics-outline" size={9} color="#B388FF" />
              <Text style={s.aiChipText}>{aiAnalysis.pattern_analysis?.length || 0} Patterns</Text>
            </View>
            <View style={s.aiChip}>
              <Ionicons name="trending-up-outline" size={9} color="#FF9500" />
              <Text style={s.aiChipText}>{aiAnalysis.risk_trends?.length || 0} Trends</Text>
            </View>
            <View style={s.aiChip}>
              <Ionicons name="flash-outline" size={9} color="#4FC3F7" />
              <Text style={s.aiChipText}>{aiAnalysis.resource_optimization?.length || 0} Optimizations</Text>
            </View>
            <View style={s.aiChip}>
              <Ionicons name="navigate-outline" size={9} color="#66BB6A" />
              <Text style={s.aiChipText}>{aiAnalysis.route_improvements?.length || 0} Route</Text>
            </View>
          </View>
        </TouchableOpacity>
      )}

      {/* ── Detail Modals ─────────────────────────────────── */}
      <Modal visible={detailModal !== null} transparent animationType="slide" onRequestClose={() => setDetailModal(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>
                {detailModal === 'perf' ? 'PERFORMANCE DETAILS' :
                 detailModal === 'risk' ? 'RISK & INCIDENT DETAILS' :
                 detailModal === 'ai' ? 'ECS EXPEDITION ANALYSIS' :
                 'ALL RECOMMENDATIONS'}
              </Text>
              <TouchableOpacity onPress={() => setDetailModal(null)} style={s.modalClose}>
                <Ionicons name="close" size={18} color={TACTICAL.textMuted} />
              </TouchableOpacity>
            </View>

            {detailModal === 'perf' && (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={s.modalBody}>
                <View style={s.modalRow}>
                  <Text style={s.modalLabel}>Outcome</Text>
                  <Text style={[s.modalValue, { color: outcomeColor }]}>{perf.outcome}</Text>
                </View>
                {perf.outcome_reason && (
                  <View style={s.modalRow}>
                    <Text style={s.modalLabel}>Reason</Text>
                    <Text style={s.modalValue}>{perf.outcome_reason}</Text>
                  </View>
                )}
                <View style={s.modalDivider} />
                <View style={s.modalRow}>
                  <Text style={s.modalLabel}>Fuel Delta</Text>
                  <Text style={[s.modalValue, { color: perf.fuel_delta_pct < 0 ? '#EF5350' : '#66BB6A' }]}>
                    {perf.fuel_delta_pct > 0 ? '+' : ''}{perf.fuel_delta_pct}%
                  </Text>
                </View>
                <View style={s.modalRow}>
                  <Text style={s.modalLabel}>Water Delta</Text>
                  <Text style={[s.modalValue, { color: perf.water_delta_pct < 0 ? '#EF5350' : '#66BB6A' }]}>
                    {perf.water_delta_pct > 0 ? '+' : ''}{perf.water_delta_pct}%
                  </Text>
                </View>
                <View style={s.modalRow}>
                  <Text style={s.modalLabel}>Power Delta</Text>
                  <Text style={[s.modalValue, { color: perf.power_delta_pct < 0 ? '#EF5350' : '#66BB6A' }]}>
                    {perf.power_delta_pct > 0 ? '+' : ''}{perf.power_delta_pct}%
                  </Text>
                </View>
                <View style={s.modalDivider} />
                <View style={s.modalRow}>
                  <Text style={s.modalLabel}>Consumables Matched</Text>
                  <Ionicons name={perf.consumables_matched_plan ? 'checkmark-circle' : 'close-circle'} size={16}
                    color={perf.consumables_matched_plan ? '#66BB6A' : '#EF5350'} />
                </View>
                <View style={s.modalRow}>
                  <Text style={s.modalLabel}>Vehicle Performed</Text>
                  <Ionicons name={perf.vehicle_performed_expected ? 'checkmark-circle' : 'close-circle'} size={16}
                    color={perf.vehicle_performed_expected ? '#66BB6A' : '#EF5350'} />
                </View>
                <View style={s.modalRow}>
                  <Text style={s.modalLabel}>Route Matched</Text>
                  <Ionicons name={perf.route_matched_expected ? 'checkmark-circle' : 'close-circle'} size={16}
                    color={perf.route_matched_expected ? '#66BB6A' : '#EF5350'} />
                </View>
              </ScrollView>
            )}

            {detailModal === 'risk' && (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={s.modalBody}>
                <Text style={s.modalSectionTitle}>EVENT TYPE BREAKDOWN</Text>
                {Object.entries(risk.type_counts || {}).map(([type, count]) => {
                  const meta = EVENT_TYPE_META[type as keyof typeof EVENT_TYPE_META];
                  return (
                    <View key={type} style={s.modalRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name={(meta?.icon || 'ellipse-outline') as any} size={13} color={meta?.color || TACTICAL.textMuted} />
                        <Text style={s.modalLabel}>{meta?.label || type}</Text>
                      </View>
                      <Text style={s.modalValue}>{count}</Text>
                    </View>
                  );
                })}
                {risk.critical_highlights && risk.critical_highlights.length > 0 && (
                  <>
                    <View style={s.modalDivider} />
                    <Text style={s.modalSectionTitle}>CRITICAL / HIGH INCIDENTS</Text>
                    {risk.critical_highlights.map((h, i) => (
                      <View key={i} style={s.incidentRow}>
                        <View style={[s.incidentBadge, { backgroundColor: h.severity === 'CRITICAL' ? 'rgba(239,83,80,0.12)' : 'rgba(255,149,0,0.12)' }]}>
                          <Text style={[s.incidentBadgeText, { color: h.severity === 'CRITICAL' ? '#EF5350' : '#FF9500' }]}>{h.severity}</Text>
                        </View>
                        <Text style={s.incidentText} numberOfLines={2}>{h.details}</Text>
                      </View>
                    ))}
                  </>
                )}

                {/* AI Risk Trends in Risk Modal */}
                {aiAnalysis && aiAnalysis.risk_trends && aiAnalysis.risk_trends.length > 0 && (
                  <>
                    <View style={s.modalDivider} />
                    <View style={s.aiModalSectionHeader}>
                      <Ionicons name="sparkles" size={10} color="#B388FF" />
                  <Text style={[s.modalSectionTitle, { color: '#B388FF', marginTop: 0 }]}>ECS RISK TRENDS</Text>
                    </View>
                    {aiAnalysis.risk_trends.map((trend, i) => (
                      <View key={`trend-${i}`} style={s.aiTrendRow}>
                        <View style={[s.trendIndicator, {
                          backgroundColor: trend.trend === 'IMPROVING' ? 'rgba(102,187,106,0.12)' :
                            trend.trend === 'WORSENING' ? 'rgba(239,83,80,0.12)' : 'rgba(255,183,77,0.08)',
                        }]}>
                          <Ionicons
                            name={trend.trend === 'IMPROVING' ? 'trending-down-outline' :
                              trend.trend === 'WORSENING' ? 'trending-up-outline' : 'remove-outline'}
                            size={10}
                            color={trend.trend === 'IMPROVING' ? '#66BB6A' :
                              trend.trend === 'WORSENING' ? '#EF5350' : '#FFB74D'}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.aiItemTitle}>{trend.title}</Text>
                          <Text style={s.aiItemDetail}>{trend.detail}</Text>
                        </View>
                      </View>
                    ))}
                  </>
                )}
              </ScrollView>
            )}

            {detailModal === 'recs' && (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
                {/* Rule-based recommendations */}
                <Text style={s.modalSectionTitle}>RULE-BASED RECOMMENDATIONS</Text>
                {recs.map((rec, idx) => (
                  <View key={`rule-${idx}`} style={s.recModalRow}>
                    <View style={s.recModalNum}>
                      <Text style={s.recModalNumText}>{idx + 1}</Text>
                    </View>
                    <Text style={s.recModalText}>{rec}</Text>
                  </View>
                ))}

                {/* AI recommendations */}
                {aiAnalysis && (
                  <>
                    <View style={[s.modalDivider, { marginVertical: 12 }]} />
                    <View style={s.aiModalSectionHeader}>
                      <Ionicons name="sparkles" size={10} color="#B388FF" />
                  <Text style={[s.modalSectionTitle, { color: '#B388FF', marginTop: 0 }]}>ECS-POWERED INSIGHTS</Text>
                    </View>

                    {/* Critical Insights */}
                    {aiAnalysis.critical_insights && aiAnalysis.critical_insights.length > 0 && (
                      <>
                        <Text style={s.aiSubSection}>CRITICAL INSIGHTS</Text>
                        {aiAnalysis.critical_insights.map((insight, i) => (
                          <View key={`ci-${i}`} style={s.aiRecRow}>
                            <View style={s.aiBadgeMini}>
                      <Text style={s.aiBadgeMiniText}>ECS</Text>
                            </View>
                            <Text style={s.aiRecText}>{insight}</Text>
                          </View>
                        ))}
                      </>
                    )}

                    {/* Pattern Analysis */}
                    {aiAnalysis.pattern_analysis && aiAnalysis.pattern_analysis.length > 0 && (
                      <>
                        <Text style={s.aiSubSection}>PATTERN ANALYSIS</Text>
                        {aiAnalysis.pattern_analysis.map((p, i) => (
                          <View key={`pa-${i}`} style={s.aiDetailCard}>
                            <View style={s.aiDetailHeader}>
                              <View style={s.aiBadgeMini}>
                      <Text style={s.aiBadgeMiniText}>ECS</Text>
                              </View>
                              <Text style={s.aiDetailTitle}>{p.title}</Text>
                              <View style={[s.severityDot, {
                                backgroundColor: p.severity === 'CRITICAL' ? '#EF5350' :
                                  p.severity === 'HIGH' ? '#FF9500' :
                                  p.severity === 'MED' ? '#FFB74D' : '#66BB6A',
                              }]} />
                            </View>
                            <Text style={s.aiDetailText}>{p.detail}</Text>
                          </View>
                        ))}
                      </>
                    )}

                    {/* Resource Optimization */}
                    {aiAnalysis.resource_optimization && aiAnalysis.resource_optimization.length > 0 && (
                      <>
                        <Text style={s.aiSubSection}>RESOURCE OPTIMIZATION</Text>
                        {aiAnalysis.resource_optimization.map((r, i) => (
                          <View key={`ro-${i}`} style={s.aiDetailCard}>
                            <View style={s.aiDetailHeader}>
                              <View style={s.aiBadgeMini}>
                      <Text style={s.aiBadgeMiniText}>ECS</Text>
                              </View>
                              <Text style={s.aiDetailTitle}>{r.title}</Text>
                            </View>
                            <Text style={s.aiDetailText}>{r.detail}</Text>
                          </View>
                        ))}
                      </>
                    )}

                    {/* Route Improvements */}
                    {aiAnalysis.route_improvements && aiAnalysis.route_improvements.length > 0 && (
                      <>
                        <Text style={s.aiSubSection}>ROUTE IMPROVEMENTS</Text>
                        {aiAnalysis.route_improvements.map((r, i) => (
                          <View key={`ri-${i}`} style={s.aiDetailCard}>
                            <View style={s.aiDetailHeader}>
                              <View style={s.aiBadgeMini}>
                      <Text style={s.aiBadgeMiniText}>ECS</Text>
                              </View>
                              <Text style={s.aiDetailTitle}>{r.title}</Text>
                            </View>
                            <Text style={s.aiDetailText}>{r.detail}</Text>
                          </View>
                        ))}
                      </>
                    )}
                  </>
                )}
              </ScrollView>
            )}

            {/* ── AI Analysis Detail Modal ────────────────────── */}
            {detailModal === 'ai' && aiAnalysis && (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
                {/* Summary + Grade */}
                <View style={s.aiModalTopRow}>
                  <View style={s.aiModalGradeCard}>
                    <Text style={s.aiModalGradeLabel}>GRADE</Text>
                    <Text style={[s.aiModalGradeValue, {
                      color: aiAnalysis.expedition_grade === 'A' ? '#66BB6A' :
                        aiAnalysis.expedition_grade === 'B' ? '#81C784' :
                        aiAnalysis.expedition_grade === 'C' ? '#FFB74D' :
                        aiAnalysis.expedition_grade === 'D' ? '#FF9500' : '#EF5350',
                    }]}>{aiAnalysis.expedition_grade}</Text>
                  </View>
                  <View style={s.aiModalRiskCard}>
                    <Text style={s.aiModalRiskLabel}>RISK SCORE</Text>
                    <View style={s.aiModalRiskBar}>
                      <View style={[s.aiModalRiskFill, {
                        width: `${aiAnalysis.overall_risk_score * 10}%`,
                        backgroundColor: aiAnalysis.overall_risk_score <= 3 ? '#66BB6A' :
                          aiAnalysis.overall_risk_score <= 5 ? '#FFB74D' :
                          aiAnalysis.overall_risk_score <= 7 ? '#FF9500' : '#EF5350',
                      }]} />
                    </View>
                    <Text style={s.aiModalRiskValue}>{aiAnalysis.overall_risk_score}/10</Text>
                  </View>
                </View>

                <View style={s.aiModalSummaryBox}>
                  <Text style={s.aiModalSummaryText}>{aiAnalysis.summary}</Text>
                  <Text style={s.aiModalMeta}>
                    Model: {aiAnalysis.model} · {aiAnalysis.event_count} events analyzed · {new Date(aiAnalysis.generated_at).toLocaleString()}
                  </Text>
                </View>

                {/* Pattern Analysis */}
                {aiAnalysis.pattern_analysis && aiAnalysis.pattern_analysis.length > 0 && (
                  <>
                    <View style={s.aiModalSectionHeader}>
                      <Ionicons name="analytics-outline" size={12} color="#B388FF" />
                      <Text style={[s.modalSectionTitle, { color: '#B388FF', marginTop: 0 }]}>PATTERN ANALYSIS</Text>
                    </View>
                    {aiAnalysis.pattern_analysis.map((p, i) => (
                      <View key={`pa-${i}`} style={s.aiDetailCard}>
                        <View style={s.aiDetailHeader}>
                          <View style={s.aiBadgeMini}>
                    <Text style={s.aiBadgeMiniText}>ECS</Text>
                          </View>
                          <Text style={s.aiDetailTitle}>{p.title}</Text>
                          <View style={[s.severityPill, {
                            backgroundColor: p.severity === 'CRITICAL' ? 'rgba(239,83,80,0.12)' :
                              p.severity === 'HIGH' ? 'rgba(255,149,0,0.12)' :
                              p.severity === 'MED' ? 'rgba(255,183,77,0.08)' : 'rgba(102,187,106,0.08)',
                          }]}>
                            <Text style={[s.severityPillText, {
                              color: p.severity === 'CRITICAL' ? '#EF5350' :
                                p.severity === 'HIGH' ? '#FF9500' :
                                p.severity === 'MED' ? '#FFB74D' : '#66BB6A',
                            }]}>{p.severity}</Text>
                          </View>
                        </View>
                        <Text style={s.aiDetailText}>{p.detail}</Text>
                      </View>
                    ))}
                  </>
                )}

                {/* Risk Trends */}
                {aiAnalysis.risk_trends && aiAnalysis.risk_trends.length > 0 && (
                  <>
                    <View style={s.aiModalSectionHeader}>
                      <Ionicons name="trending-up-outline" size={12} color="#FF9500" />
                      <Text style={[s.modalSectionTitle, { color: '#FF9500', marginTop: 0 }]}>RISK TRENDS</Text>
                    </View>
                    {aiAnalysis.risk_trends.map((trend, i) => (
                      <View key={`rt-${i}`} style={s.aiDetailCard}>
                        <View style={s.aiDetailHeader}>
                          <View style={[s.trendIndicator, {
                            backgroundColor: trend.trend === 'IMPROVING' ? 'rgba(102,187,106,0.12)' :
                              trend.trend === 'WORSENING' ? 'rgba(239,83,80,0.12)' : 'rgba(255,183,77,0.08)',
                          }]}>
                            <Ionicons
                              name={trend.trend === 'IMPROVING' ? 'trending-down-outline' :
                                trend.trend === 'WORSENING' ? 'trending-up-outline' : 'remove-outline'}
                              size={10}
                              color={trend.trend === 'IMPROVING' ? '#66BB6A' :
                                trend.trend === 'WORSENING' ? '#EF5350' : '#FFB74D'}
                            />
                          </View>
                          <Text style={s.aiDetailTitle}>{trend.title}</Text>
                          <View style={[s.trendPill, {
                            backgroundColor: trend.trend === 'IMPROVING' ? 'rgba(102,187,106,0.1)' :
                              trend.trend === 'WORSENING' ? 'rgba(239,83,80,0.1)' : 'rgba(255,183,77,0.08)',
                          }]}>
                            <Text style={[s.trendPillText, {
                              color: trend.trend === 'IMPROVING' ? '#66BB6A' :
                                trend.trend === 'WORSENING' ? '#EF5350' : '#FFB74D',
                            }]}>{trend.trend}</Text>
                          </View>
                        </View>
                        <Text style={s.aiDetailText}>{trend.detail}</Text>
                      </View>
                    ))}
                  </>
                )}

                {/* Resource Optimization */}
                {aiAnalysis.resource_optimization && aiAnalysis.resource_optimization.length > 0 && (
                  <>
                    <View style={s.aiModalSectionHeader}>
                      <Ionicons name="flash-outline" size={12} color="#4FC3F7" />
                      <Text style={[s.modalSectionTitle, { color: '#4FC3F7', marginTop: 0 }]}>RESOURCE OPTIMIZATION</Text>
                    </View>
                    {aiAnalysis.resource_optimization.map((r, i) => (
                      <View key={`ro-${i}`} style={s.aiDetailCard}>
                        <View style={s.aiDetailHeader}>
                          <View style={s.aiBadgeMini}>
                    <Text style={s.aiBadgeMiniText}>ECS</Text>
                          </View>
                          <Text style={s.aiDetailTitle}>{r.title}</Text>
                        </View>
                        <Text style={s.aiDetailText}>{r.detail}</Text>
                      </View>
                    ))}
                  </>
                )}

                {/* Route Improvements */}
                {aiAnalysis.route_improvements && aiAnalysis.route_improvements.length > 0 && (
                  <>
                    <View style={s.aiModalSectionHeader}>
                      <Ionicons name="navigate-outline" size={12} color="#66BB6A" />
                      <Text style={[s.modalSectionTitle, { color: '#66BB6A', marginTop: 0 }]}>ROUTE IMPROVEMENTS</Text>
                    </View>
                    {aiAnalysis.route_improvements.map((r, i) => (
                      <View key={`ri-${i}`} style={s.aiDetailCard}>
                        <View style={s.aiDetailHeader}>
                          <View style={s.aiBadgeMini}>
                    <Text style={s.aiBadgeMiniText}>ECS</Text>
                          </View>
                          <Text style={s.aiDetailTitle}>{r.title}</Text>
                        </View>
                        <Text style={s.aiDetailText}>{r.detail}</Text>
                      </View>
                    ))}
                  </>
                )}

                {/* Critical Insights */}
                {aiAnalysis.critical_insights && aiAnalysis.critical_insights.length > 0 && (
                  <>
                    <View style={s.aiModalSectionHeader}>
                      <Ionicons name="alert-circle-outline" size={12} color="#EF5350" />
                      <Text style={[s.modalSectionTitle, { color: '#EF5350', marginTop: 0 }]}>CRITICAL INSIGHTS</Text>
                    </View>
                    {aiAnalysis.critical_insights.map((insight, i) => (
                      <View key={`ci-${i}`} style={s.aiInsightRow}>
                        <View style={s.aiBadgeMini}>
                    <Text style={s.aiBadgeMiniText}>ECS</Text>
                        </View>
                        <Text style={s.aiInsightText}>{insight}</Text>
                      </View>
                    ))}
                  </>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════
// INLINE COMPONENTS
// ══════════════════════════════════════════════════════════════

function PerfDelta({ label, value, color }: { label: string; value: number; color: string }) {
  const isNeg = value < 0;
  const displayColor = isNeg ? '#EF5350' : value > 0 ? '#66BB6A' : TACTICAL.textMuted;
  return (
    <View style={s.perfItem}>
      <Text style={[s.perfLabel, { color }]}>{label}</Text>
      <Text style={[s.perfValue, { color: displayColor }]}>
        {value > 0 ? '+' : ''}{value}%
      </Text>
    </View>
  );
}

function CheckBadge({ label, ok }: { label: string; ok: boolean }) {
  return (
    <View style={[s.checkBadge, { backgroundColor: ok ? 'rgba(102,187,106,0.08)' : 'rgba(239,83,80,0.08)' }]}>
      <Ionicons name={ok ? 'checkmark' : 'close'} size={10} color={ok ? '#66BB6A' : '#EF5350'} />
      <Text style={[s.checkLabel, { color: ok ? '#66BB6A' : '#EF5350' }]}>{label}</Text>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════
// STYLES
// ══════════════════════════════════════════════════════════════

const s = StyleSheet.create({
  aarContainer: { flex: 1, paddingHorizontal: 14, gap: 6 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyText: { fontSize: 12, color: TACTICAL.textMuted },

  // No AAR
  noAarIcon: {
    width: 64, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(196,138,44,0.05)', borderWidth: 1, borderColor: 'rgba(196,138,44,0.12)',
    marginBottom: 8,
  },
  noAarTitle: { fontSize: 13, fontWeight: '800', color: TACTICAL.text, letterSpacing: 2 },
  noAarDesc: { fontSize: 11, color: TACTICAL.textMuted, textAlign: 'center', maxWidth: 260, lineHeight: 16 },
  genBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12,
    backgroundColor: TACTICAL.amber, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8,
  },
  genBtnText: { fontSize: 10, fontWeight: '800', color: '#0B0F12', letterSpacing: 1.5 },

  // AAR Header
  aarHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 4,
  },
  aarHeaderLeft: { flex: 1 },
  aarTitle: { fontSize: 13, fontWeight: '800', color: TACTICAL.text, letterSpacing: 0.5 },
  aarDate: { fontSize: 9, color: TACTICAL.textMuted, fontFamily: 'Courier', marginTop: 2 },
  aarActions: { flexDirection: 'row', gap: 6 },
  regenBtn: {
    width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(196,138,44,0.08)', borderWidth: 1, borderColor: 'rgba(196,138,44,0.2)',
  },
  exportBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.2)', borderWidth: 1, borderColor: 'rgba(62,79,60,0.25)',
  },
  exportBtnActive: {
    borderColor: 'rgba(196,138,44,0.4)',
    backgroundColor: 'rgba(196,138,44,0.06)',
  },
  exportBtnText: { fontSize: 8, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1 },


  // Cards
  card: {
    backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: 'rgba(62,79,60,0.2)',
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6,
  },
  cardIcon: {
    width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(196,138,44,0.08)',
  },
  cardTitle: { fontSize: 9, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 1.5, flex: 1 },
  cardCount: { fontSize: 9, color: TACTICAL.textMuted, fontFamily: 'Courier' },

  // Outcome badge
  outcomeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5 },
  outcomeBadgeText: { fontSize: 8, fontWeight: '800', letterSpacing: 1 },

  // AI Grade badge (inline in risk card)
  aiGradeBadge: {
    width: 20, height: 20, borderRadius: 5, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(179,136,255,0.12)', borderWidth: 1, borderColor: 'rgba(179,136,255,0.25)',
  },
  aiGradeText: { fontSize: 9, fontWeight: '900', color: '#B388FF' },

  // Performance grid
  perfGrid: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  perfItem: {
    flex: 1, alignItems: 'center', gap: 2,
    backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 6, paddingVertical: 5,
  },
  perfLabel: { fontSize: 7, fontWeight: '700', letterSpacing: 1 },
  perfValue: { fontSize: 14, fontWeight: '800', fontFamily: 'Courier' },

  // Check row
  checkRow: { flexDirection: 'row', gap: 6 },
  checkBadge: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 4, borderRadius: 5,
  },
  checkLabel: { fontSize: 8, fontWeight: '700', letterSpacing: 0.5 },

  // Risk grid
  riskGrid: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  riskStat: {
    flex: 1, alignItems: 'center', gap: 2,
    backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 6, paddingVertical: 5,
  },
  riskNum: { fontSize: 16, fontWeight: '800', fontFamily: 'Courier' },
  riskLabel: { fontSize: 7, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1 },

  // Highlight
  highlightRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(239,83,80,0.05)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5,
  },
  highlightText: { fontSize: 10, color: TACTICAL.text, flex: 1 },

  // Recommendations
  recRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  recBullet: {
    width: 4, height: 4, borderRadius: 2, backgroundColor: TACTICAL.amber,
  },
  recText: { fontSize: 10, color: TACTICAL.text, flex: 1, lineHeight: 14 },
  recMore: { fontSize: 9, color: TACTICAL.amber, textAlign: 'center', marginTop: 2 },

  // AI inline badge
  aiBadgeInline: {
    paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3,
    backgroundColor: 'rgba(179,136,255,0.15)', borderWidth: 1, borderColor: 'rgba(179,136,255,0.3)',
  },
  aiBadgeInlineText: { fontSize: 6, fontWeight: '900', color: '#B388FF', letterSpacing: 1 },

  // ── AI Generate Button ──────────────────────────────────
  aiGenerateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: 'rgba(179,136,255,0.06)', borderRadius: 10, paddingVertical: 10,
    borderWidth: 1, borderColor: 'rgba(179,136,255,0.2)',
    borderStyle: 'dashed',
  },
  aiIconWrap: {
    width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(179,136,255,0.1)',
  },
  aiGenerateBtnText: {
    fontSize: 9, fontWeight: '800', color: '#B388FF', letterSpacing: 2,
  },
  aiPulse: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: '#B388FF',
    opacity: 0.6,
  },

  // ── AI Summary Card ─────────────────────────────────────
  aiSummaryCard: {
    backgroundColor: 'rgba(179,136,255,0.04)', borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: 'rgba(179,136,255,0.18)',
  },
  aiSummaryHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6,
  },
  aiSummaryTitle: {
    fontSize: 8, fontWeight: '800', color: '#B388FF', letterSpacing: 2, flex: 1,
  },
  aiScoreBadge: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
    backgroundColor: 'rgba(179,136,255,0.1)', borderWidth: 1, borderColor: 'rgba(179,136,255,0.25)',
  },
  aiScoreText: { fontSize: 8, fontWeight: '800', color: '#B388FF', fontFamily: 'Courier' },
  aiGradePill: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  aiGradePillText: { fontSize: 7, fontWeight: '800', letterSpacing: 1 },
  aiRefreshBtn: {
    width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(179,136,255,0.08)', borderWidth: 1, borderColor: 'rgba(179,136,255,0.2)',
  },
  aiSummaryText: {
    fontSize: 10, color: TACTICAL.text, lineHeight: 14, marginBottom: 6, opacity: 0.85,
  },
  aiChipsRow: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  aiChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  aiChipText: { fontSize: 8, color: TACTICAL.textMuted, fontWeight: '600' },

  // ── Modal ───────────────────────────────────────────────
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalSheet: {
    height: '80%', backgroundColor: '#0F1612', borderTopLeftRadius: 18, borderTopRightRadius: 18,
    borderWidth: 1, borderBottomWidth: 0, borderColor: 'rgba(62,79,60,0.35)',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(62,79,60,0.2)',
  },
  modalTitle: { fontSize: 12, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 2 },
  modalClose: {
    width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)', borderWidth: 1, borderColor: 'rgba(62,79,60,0.25)',
  },
  modalBody: { padding: 16, gap: 8 },
  modalRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 6,
  },
  modalLabel: { fontSize: 12, color: TACTICAL.textMuted },
  modalValue: { fontSize: 13, fontWeight: '700', color: TACTICAL.text, fontFamily: 'Courier' },
  modalDivider: { height: 1, backgroundColor: 'rgba(62,79,60,0.15)', marginVertical: 4 },
  modalSectionTitle: { fontSize: 9, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 2, marginTop: 4, marginBottom: 4 },

  // AI Modal Section Header
  aiModalSectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, marginBottom: 6,
  },

  // Incident rows
  incidentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 4 },
  incidentBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  incidentBadgeText: { fontSize: 7, fontWeight: '800', letterSpacing: 0.5 },
  incidentText: { fontSize: 11, color: TACTICAL.text, flex: 1, lineHeight: 15 },

  // Rec modal
  recModalRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  recModalNum: {
    width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(196,138,44,0.1)', borderWidth: 1, borderColor: 'rgba(196,138,44,0.2)',
  },
  recModalNumText: { fontSize: 10, fontWeight: '800', color: TACTICAL.amber },
  recModalText: { fontSize: 12, color: TACTICAL.text, flex: 1, lineHeight: 17 },

  // ── AI Detail Styles ────────────────────────────────────
  aiBadgeMini: {
    paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3,
    backgroundColor: 'rgba(179,136,255,0.15)', borderWidth: 1, borderColor: 'rgba(179,136,255,0.3)',
  },
  aiBadgeMiniText: { fontSize: 6, fontWeight: '900', color: '#B388FF', letterSpacing: 1 },

  aiSubSection: {
    fontSize: 8, fontWeight: '700', color: 'rgba(179,136,255,0.6)', letterSpacing: 2,
    marginTop: 10, marginBottom: 4,
  },

  aiRecRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8,
  },
  aiRecText: { fontSize: 11, color: '#B388FF', flex: 1, lineHeight: 16, opacity: 0.9 },

  aiDetailCard: {
    backgroundColor: 'rgba(179,136,255,0.03)', borderRadius: 8, padding: 10,
    borderWidth: 1, borderColor: 'rgba(179,136,255,0.1)', marginBottom: 6,
  },
  aiDetailHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4,
  },
  aiDetailTitle: { fontSize: 11, fontWeight: '700', color: TACTICAL.text, flex: 1 },
  aiDetailText: { fontSize: 11, color: TACTICAL.textMuted, lineHeight: 15, paddingLeft: 2 },

  severityDot: { width: 6, height: 6, borderRadius: 3 },
  severityPill: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3 },
  severityPillText: { fontSize: 7, fontWeight: '800', letterSpacing: 0.5 },

  trendIndicator: {
    width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
  },
  trendPill: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3 },
  trendPillText: { fontSize: 7, fontWeight: '800', letterSpacing: 0.5 },

  aiTrendRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8,
  },
  aiItemTitle: { fontSize: 11, fontWeight: '700', color: TACTICAL.text },
  aiItemDetail: { fontSize: 10, color: TACTICAL.textMuted, lineHeight: 14, marginTop: 2 },

  aiInsightRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8,
    backgroundColor: 'rgba(239,83,80,0.04)', borderRadius: 6, padding: 8,
    borderWidth: 1, borderColor: 'rgba(239,83,80,0.1)',
  },
  aiInsightText: { fontSize: 11, color: '#EF5350', flex: 1, lineHeight: 15, opacity: 0.9 },

  // AI Modal Top Row (Grade + Risk Score)
  aiModalTopRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  aiModalGradeCard: {
    width: 64, alignItems: 'center', justifyContent: 'center', gap: 4,
    backgroundColor: 'rgba(179,136,255,0.06)', borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: 'rgba(179,136,255,0.15)',
  },
  aiModalGradeLabel: { fontSize: 7, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 2 },
  aiModalGradeValue: { fontSize: 28, fontWeight: '900' },
  aiModalRiskCard: {
    flex: 1, justifyContent: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: 'rgba(62,79,60,0.2)',
  },
  aiModalRiskLabel: { fontSize: 7, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 2 },
  aiModalRiskBar: {
    height: 6, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.3)', overflow: 'hidden',
  },
  aiModalRiskFill: { height: '100%', borderRadius: 3 },
  aiModalRiskValue: { fontSize: 14, fontWeight: '800', color: TACTICAL.text, fontFamily: 'Courier' },
  aiModalSummaryBox: {
    backgroundColor: 'rgba(179,136,255,0.04)', borderRadius: 8, padding: 10,
    borderWidth: 1, borderColor: 'rgba(179,136,255,0.1)', marginBottom: 8,
  },
  aiModalSummaryText: { fontSize: 11, color: TACTICAL.text, lineHeight: 16, marginBottom: 6 },
  aiModalMeta: { fontSize: 8, color: TACTICAL.textMuted, fontFamily: 'Courier', opacity: 0.6 },
});



