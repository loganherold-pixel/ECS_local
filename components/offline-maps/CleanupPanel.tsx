/**
 * CleanupPanel — Cache Cleanup Recommendations
 *
 * Integrates with tileAutoCleanup.analyzeCache() to show:
 *   - Cleanup report summary (stale, broken, overlap waste)
 *   - Warning level indicator
 *   - Protected regions list
 *   - One-tap quick cleanup execution
 *   - Detailed candidate list with reasons and priorities
 *   - Cleanup history log
 */
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, TYPO, DENSITY } from '../../lib/theme';
import {
  analyzeCache,
  executeCleanup,
  quickCleanup,
  getCleanupHistoryEntries,
  formatCleanupEntry,
  type CleanupReport,
  type CleanupResult,
  type CleanupCandidate,
  type CleanupHistoryEntry,
} from '../../lib/tileAutoCleanup';

interface Props {
  /** Callback after cleanup completes to refresh parent data */
  onCleanupComplete: () => void;
  /** Toast callback */
  showToast: (msg: string) => void;
  /** Whether to auto-analyze on mount */
  autoAnalyze?: boolean;
}

function formatSize(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.round(mb * 1024)} KB`;
}

const WARNING_CONFIG: Record<string, { color: string; icon: string; label: string }> = {
  ok: { color: '#66BB6A', icon: 'checkmark-circle-outline', label: 'HEALTHY' },
  warning: { color: '#FFB300', icon: 'warning-outline', label: 'WARNING' },
  critical: { color: '#EF5350', icon: 'alert-circle-outline', label: 'CRITICAL' },
  exceeded: { color: '#EF5350', icon: 'alert-circle', label: 'EXCEEDED' },
};

const REASON_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  stale: { label: 'STALE', icon: 'time-outline', color: '#FFB300' },
  expired: { label: 'EXPIRED', icon: 'hourglass-outline', color: '#EF5350' },
  incomplete: { label: 'INCOMPLETE', icon: 'alert-circle-outline', color: '#FFB300' },
  error: { label: 'ERROR', icon: 'close-circle-outline', color: '#EF5350' },
  cancelled: { label: 'CANCELLED', icon: 'pause-circle-outline', color: TACTICAL.textMuted },
  overlap: { label: 'OVERLAP', icon: 'copy-outline', color: '#CE93D8' },
  'quota-exceeded': { label: 'OVER QUOTA', icon: 'server-outline', color: '#EF5350' },
};

export default function CleanupPanel({ onCleanupComplete, showToast, autoAnalyze = true }: Props) {
  const [report, setReport] = useState<CleanupReport | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [lastResult, setLastResult] = useState<CleanupResult | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showCandidates, setShowCandidates] = useState(false);
  const [showProtected, setShowProtected] = useState(false);
  const runAnalysisRef = useRef<() => void>(() => {});

  const history = useMemo(() => getCleanupHistoryEntries(), []);

  // Auto-analyze on mount
  useEffect(() => {
    if (autoAnalyze) {
      runAnalysisRef.current();
    }
  }, [autoAnalyze]);

  const runAnalysis = useCallback(async () => {
    setAnalyzing(true);
    try {
      const r = analyzeCache();
      setReport(r);
    } catch (e) {
      showToast('Cache analysis could not be completed.');
    } finally {
      setAnalyzing(false);
    }
  }, [showToast]);
  runAnalysisRef.current = () => {
    void runAnalysis();
  };

  const handleQuickCleanup = useCallback(async () => {
    const doClean = async () => {
      setCleaning(true);
      try {
        const result = await quickCleanup();
        setLastResult(result);
        showToast(result.message);
        // Re-analyze after cleanup
        const r = analyzeCache();
        setReport(r);
        onCleanupComplete();
      } catch (e: any) {
        showToast(`Cleanup could not finish: ${e?.message || 'unknown error'}`);
      } finally {
        setCleaning(false);
      }
    };

    if (Platform.OS === 'web') {
      if (confirm('Run quick cleanup? This will delete stale and broken cached regions (protected regions are preserved).')) {
        doClean();
      }
    } else {
      Alert.alert(
        'Quick Cleanup',
        'Delete stale and broken cached regions? Protected regions (active expeditions, recent routes) are preserved.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Clean Up', style: 'destructive', onPress: doClean },
        ]
      );
    }
  }, [showToast, onCleanupComplete]);

  const handleSelectiveCleanup = useCallback(async (candidates: CleanupCandidate[]) => {
    if (!report) return;
    setCleaning(true);
    try {
      const result = await executeCleanup(report, {
        deleteStale: true,
        deleteBroken: true,
        performMerges: false,
        trigger: 'manual',
      });
      setLastResult(result);
      showToast(result.message);
      const r = analyzeCache();
      setReport(r);
      onCleanupComplete();
    } catch (e: any) {
      showToast(`Cleanup could not finish: ${e?.message || 'unknown error'}`);
    } finally {
      setCleaning(false);
    }
  }, [report, showToast, onCleanupComplete]);

  if (analyzing && !report) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Ionicons name="analytics-outline" size={16} color={TACTICAL.amber} />
          <Text style={styles.headerTitle}>CACHE ANALYSIS</Text>
        </View>
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={TACTICAL.amber} />
          <Text style={styles.loadingText}>Analyzing cache health...</Text>
        </View>
      </View>
    );
  }

  if (!report) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Ionicons name="analytics-outline" size={16} color={TACTICAL.amber} />
          <Text style={styles.headerTitle}>CACHE ANALYSIS</Text>
        </View>
        <TouchableOpacity style={styles.analyzeBtn} onPress={runAnalysis} activeOpacity={0.8}>
          <Ionicons name="scan-outline" size={14} color={TACTICAL.amber} />
          <Text style={styles.analyzeBtnText}>ANALYZE CACHE</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const warnCfg = WARNING_CONFIG[report.warningLevel] || WARNING_CONFIG.ok;
  const hasIssues = report.needsAttention;
  const canAutoClean = report.autoCleanCandidates.length > 0;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="analytics-outline" size={16} color={TACTICAL.amber} />
          <Text style={styles.headerTitle}>CACHE ANALYSIS</Text>
        </View>
        <TouchableOpacity
          onPress={runAnalysis}
          disabled={analyzing}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {analyzing ? (
            <ActivityIndicator size={12} color={TACTICAL.amber} />
          ) : (
            <Ionicons name="refresh-outline" size={16} color={TACTICAL.textMuted} />
          )}
        </TouchableOpacity>
      </View>

      {/* Status badge */}
      <View style={[styles.statusBanner, { borderColor: warnCfg.color + '25' }]}>
        <View style={[styles.statusBadge, { backgroundColor: warnCfg.color + '15' }]}>
          <Ionicons name={warnCfg.icon as any} size={12} color={warnCfg.color} />
          <Text style={[styles.statusText, { color: warnCfg.color }]}>{warnCfg.label}</Text>
        </View>
        <Text style={styles.summaryMessage} numberOfLines={2}>{report.summaryMessage}</Text>
      </View>

      {/* KPI row */}
      <View style={styles.kpiRow}>
        <View style={styles.kpiItem}>
          <Text style={[styles.kpiValue, report.staleRegions.length > 0 && { color: '#FFB300' }]}>
            {report.staleRegions.length}
          </Text>
          <Text style={styles.kpiLabel}>STALE</Text>
        </View>
        <View style={styles.kpiDivider} />
        <View style={styles.kpiItem}>
          <Text style={[styles.kpiValue, report.brokenRegions.length > 0 && { color: '#EF5350' }]}>
            {report.brokenRegions.length}
          </Text>
          <Text style={styles.kpiLabel}>BROKEN</Text>
        </View>
        <View style={styles.kpiDivider} />
        <View style={styles.kpiItem}>
          <Text style={[styles.kpiValue, report.mergeSuggestions.length > 0 && { color: '#CE93D8' }]}>
            {report.mergeSuggestions.length}
          </Text>
          <Text style={styles.kpiLabel}>MERGES</Text>
        </View>
        <View style={styles.kpiDivider} />
        <View style={styles.kpiItem}>
          <Text style={[styles.kpiValue, { color: '#66BB6A' }]}>
            {report.protectedRegionIds.size}
          </Text>
          <Text style={styles.kpiLabel}>PROTECTED</Text>
        </View>
      </View>

      {/* Freeable storage */}
      {report.autoCleanFreeMB > 0 && (
        <View style={styles.freeableRow}>
          <Ionicons name="trash-outline" size={11} color={TACTICAL.textMuted} />
          <Text style={styles.freeableText}>
            {formatSize(report.autoCleanFreeMB)} can be freed automatically
            {report.totalFreeMB > report.autoCleanFreeMB &&
              ` (${formatSize(report.totalFreeMB)} total including protected)`}
          </Text>
        </View>
      )}

      {/* Overlap waste */}
      {report.overlapWastedMB > 0 && (
        <View style={styles.overlapWasteRow}>
          <Ionicons name="copy-outline" size={11} color="#CE93D8" />
          <Text style={styles.overlapWasteText}>
            ~{formatSize(report.overlapWastedMB)} wasted from {report.overlappingPairs.length} overlapping region pair{report.overlappingPairs.length !== 1 ? 's' : ''}
          </Text>
        </View>
      )}

      {/* Quick cleanup button */}
      {canAutoClean && (
        <TouchableOpacity
          style={[styles.cleanupBtn, cleaning && styles.cleanupBtnDisabled]}
          onPress={handleQuickCleanup}
          disabled={cleaning}
          activeOpacity={0.8}
        >
          {cleaning ? (
            <ActivityIndicator size={12} color="#FFF" />
          ) : (
            <Ionicons name="flash-outline" size={14} color="#FFF" />
          )}
          <Text style={styles.cleanupBtnText}>
            {cleaning ? 'CLEANING...' : `QUICK CLEANUP (${report.autoCleanCandidates.length} REGIONS)`}
          </Text>
        </TouchableOpacity>
      )}

      {/* No issues */}
      {!hasIssues && (
        <View style={styles.healthyRow}>
          <Ionicons name="checkmark-circle" size={14} color="#66BB6A" />
          <Text style={styles.healthyText}>Cache is healthy. No cleanup needed.</Text>
        </View>
      )}

      {/* Last cleanup result */}
      {lastResult && (
        <View style={[styles.resultBanner, { borderColor: lastResult.regionsDeleted > 0 ? '#66BB6A30' : TACTICAL.border }]}>
          <Ionicons
            name={lastResult.regionsDeleted > 0 ? 'checkmark-circle' : 'information-circle-outline'}
            size={12}
            color={lastResult.regionsDeleted > 0 ? '#66BB6A' : TACTICAL.textMuted}
          />
          <Text style={[styles.resultText, lastResult.regionsDeleted > 0 && { color: '#66BB6A' }]}>
            {lastResult.message} ({lastResult.durationMs}ms)
          </Text>
        </View>
      )}

      {/* Expandable: Cleanup candidates */}
      {report.allCandidates.length > 0 && (
        <View style={styles.expandableSection}>
          <TouchableOpacity
            style={styles.expandableHeader}
            onPress={() => setShowCandidates(!showCandidates)}
            activeOpacity={0.8}
          >
            <Ionicons name="list-outline" size={12} color={TACTICAL.textMuted} />
            <Text style={styles.expandableTitle}>
              CLEANUP CANDIDATES ({report.allCandidates.length})
            </Text>
            <Ionicons
              name={showCandidates ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={TACTICAL.textMuted}
            />
          </TouchableOpacity>

          {showCandidates && (
            <View style={styles.candidatesList}>
              {report.allCandidates.map((c) => {
                const reasonCfg = REASON_LABELS[c.reason] || REASON_LABELS.stale;
                return (
                  <View key={c.regionId} style={styles.candidateRow}>
                    <View style={styles.candidateLeft}>
                      <View style={[styles.priorityBadge, { backgroundColor: c.priority >= 60 ? '#EF535015' : '#FFB30015' }]}>
                        <Text style={[styles.priorityText, { color: c.priority >= 60 ? '#EF5350' : '#FFB300' }]}>
                          P{c.priority}
                        </Text>
                      </View>
                      <View style={styles.candidateInfo}>
                        <Text style={styles.candidateName} numberOfLines={1}>{c.regionName}</Text>
                        <View style={styles.candidateMeta}>
                          <View style={[styles.reasonBadge, { backgroundColor: reasonCfg.color + '15' }]}>
                            <Ionicons name={reasonCfg.icon as any} size={8} color={reasonCfg.color} />
                            <Text style={[styles.reasonText, { color: reasonCfg.color }]}>{reasonCfg.label}</Text>
                          </View>
                          <Text style={styles.candidateAge}>{c.ageDays}d old</Text>
                          <Text style={styles.candidateSize}>{formatSize(c.sizeMB)}</Text>
                        </View>
                      </View>
                    </View>
                    {c.isProtected && (
                      <View style={styles.protectedBadge}>
                        <Ionicons name="shield-checkmark-outline" size={9} color="#66BB6A" />
                        <Text style={styles.protectedBadgeText}>KEPT</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}

      {/* Expandable: Protected regions */}
      {report.protectedRegionIds.size > 0 && (
        <View style={styles.expandableSection}>
          <TouchableOpacity
            style={styles.expandableHeader}
            onPress={() => setShowProtected(!showProtected)}
            activeOpacity={0.8}
          >
            <Ionicons name="shield-checkmark-outline" size={12} color="#66BB6A" />
            <Text style={styles.expandableTitle}>
              PROTECTED REGIONS ({report.protectedRegionIds.size})
            </Text>
            <Ionicons
              name={showProtected ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={TACTICAL.textMuted}
            />
          </TouchableOpacity>

          {showProtected && (
            <View style={styles.protectedList}>
              {Array.from(report.protectionReasons.entries()).map(([id, reason]) => (
                <View key={id} style={styles.protectedRow}>
                  <Ionicons name="shield-checkmark" size={10} color="#66BB6A" />
                  <Text style={styles.protectedReason} numberOfLines={1}>{reason}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Expandable: Cleanup history */}
      {history.length > 0 && (
        <View style={styles.expandableSection}>
          <TouchableOpacity
            style={styles.expandableHeader}
            onPress={() => setShowHistory(!showHistory)}
            activeOpacity={0.8}
          >
            <Ionicons name="time-outline" size={12} color={TACTICAL.textMuted} />
            <Text style={styles.expandableTitle}>
              CLEANUP HISTORY ({history.length})
            </Text>
            <Ionicons
              name={showHistory ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={TACTICAL.textMuted}
            />
          </TouchableOpacity>

          {showHistory && (
            <View style={styles.historyList}>
              {history.slice(-5).reverse().map((entry, idx) => (
                <View key={idx} style={styles.historyRow}>
                  <View style={styles.historyDot} />
                  <Text style={styles.historyText}>{formatCleanupEntry(entry)}</Text>
                  <Text style={styles.historyDate}>
                    {new Date(entry.timestamp).toLocaleDateString()}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Analysis timestamp */}
      <View style={styles.timestampRow}>
        <Ionicons name="time-outline" size={9} color={TACTICAL.textMuted} />
        <Text style={styles.timestampText}>
          Analyzed {new Date(report.analyzedAt).toLocaleTimeString()}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: TACTICAL.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    padding: DENSITY.cardPad,
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    ...TYPO.T4,
    color: TACTICAL.amber,
    fontSize: 9,
    letterSpacing: 4,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
    justifyContent: 'center',
  },
  loadingText: {
    ...TYPO.B2,
    fontSize: 11,
    color: TACTICAL.textMuted,
  },
  analyzeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '40',
  },
  analyzeBtnText: {
    ...TYPO.U2,
    fontSize: 9,
    color: TACTICAL.amber,
    letterSpacing: 2,
  },
  statusBanner: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    gap: 6,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  statusText: {
    ...TYPO.U2,
    fontSize: 8,
    letterSpacing: 2,
  },
  summaryMessage: {
    ...TYPO.B2,
    fontSize: 10,
    color: TACTICAL.textMuted,
    lineHeight: 15,
  },
  kpiRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  kpiItem: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  kpiValue: {
    ...TYPO.K2,
    fontSize: 16,
    color: TACTICAL.text,
  },
  kpiLabel: {
    ...TYPO.U2,
    fontSize: 6,
    letterSpacing: 2,
    color: TACTICAL.textMuted,
  },
  kpiDivider: {
    width: 1,
    height: 24,
    backgroundColor: TACTICAL.border,
  },
  freeableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(62,79,60,0.06)',
  },
  freeableText: {
    ...TYPO.B2,
    fontSize: 10,
    color: TACTICAL.textMuted,
    flex: 1,
    lineHeight: 14,
  },
  overlapWasteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(206,147,216,0.06)',
  },
  overlapWasteText: {
    ...TYPO.B2,
    fontSize: 10,
    color: '#CE93D8',
    flex: 1,
    lineHeight: 14,
  },
  cleanupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: TACTICAL.amber,
  },
  cleanupBtnDisabled: {
    opacity: 0.5,
  },
  cleanupBtnText: {
    ...TYPO.U1,
    fontSize: 10,
    color: '#0B0F12',
    letterSpacing: 2,
  },
  healthyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(102,187,106,0.08)',
    borderWidth: 1,
    borderColor: '#66BB6A25',
  },
  healthyText: {
    ...TYPO.B2,
    fontSize: 11,
    color: '#66BB6A',
  },
  resultBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: 'rgba(62,79,60,0.04)',
  },
  resultText: {
    ...TYPO.B2,
    fontSize: 10,
    color: TACTICAL.textMuted,
    flex: 1,
    lineHeight: 14,
  },
  expandableSection: {
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 8,
    overflow: 'hidden',
  },
  expandableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 8,
    backgroundColor: 'rgba(62,79,60,0.04)',
  },
  expandableTitle: {
    ...TYPO.U2,
    fontSize: 8,
    color: TACTICAL.textMuted,
    letterSpacing: 2,
    flex: 1,
  },
  candidatesList: {
    gap: 1,
  },
  candidateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 8,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: TACTICAL.border + '40',
  },
  candidateLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  priorityBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
    minWidth: 28,
    alignItems: 'center',
  },
  priorityText: {
    ...TYPO.K3,
    fontSize: 8,
  },
  candidateInfo: {
    flex: 1,
    gap: 3,
  },
  candidateName: {
    ...TYPO.B1,
    fontSize: 11,
    color: TACTICAL.text,
  },
  candidateMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reasonBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  reasonText: {
    ...TYPO.U2,
    fontSize: 6,
    letterSpacing: 1,
  },
  candidateAge: {
    ...TYPO.B2,
    fontSize: 9,
    color: TACTICAL.textMuted,
  },
  candidateSize: {
    ...TYPO.K3,
    fontSize: 9,
    color: TACTICAL.textMuted,
  },
  protectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(102,187,106,0.1)',
  },
  protectedBadgeText: {
    ...TYPO.U2,
    fontSize: 6,
    letterSpacing: 1,
    color: '#66BB6A',
  },
  protectedList: {
    gap: 1,
  },
  protectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 8,
    borderTopWidth: 1,
    borderTopColor: TACTICAL.border + '40',
  },
  protectedReason: {
    ...TYPO.B2,
    fontSize: 10,
    color: '#66BB6A',
    flex: 1,
  },
  historyList: {
    gap: 1,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 8,
    borderTopWidth: 1,
    borderTopColor: TACTICAL.border + '40',
  },
  historyDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: TACTICAL.textMuted,
  },
  historyText: {
    ...TYPO.B2,
    fontSize: 10,
    color: TACTICAL.text,
    flex: 1,
  },
  historyDate: {
    ...TYPO.B2,
    fontSize: 9,
    color: TACTICAL.textMuted,
  },
  timestampRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    justifyContent: 'flex-end',
  },
  timestampText: {
    ...TYPO.B2,
    fontSize: 8,
    color: TACTICAL.textMuted,
  },
});



