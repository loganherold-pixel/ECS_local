/**
 * StorageWarningBanner — Offline Map Cache Warning Banner
 *
 * Displays on the Navigate tab when:
 *   - Storage exceeds the warning threshold
 *   - Stale regions detected
 *   - Broken/incomplete downloads found
 *   - Merge opportunities available
 *
 * Features:
 *   - One-tap cleanup action
 *   - Expandable detail view with breakdown
 *   - Merge suggestion cards
 *   - Protected region indicators
 *   - Dismiss for 24 hours
 *   - Animated entrance/exit
 *   - Tactical ECS styling
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, TYPO, DENSITY } from '../../lib/theme';
import {
  type CleanupReport,
  type CleanupResult,
  quickCleanup,
  dismissWarningBanner,
  analyzeCache,
} from '../../lib/tileAutoCleanup';

interface Props {
  /** The cleanup report from startup analysis */
  report: CleanupReport | null;
  /** Callback after cleanup completes */
  onCleanupComplete?: (result: CleanupResult) => void;
  /** Callback to open the merge panel */
  onOpenMergePanel?: () => void;
  /** Callback to open the offline cache modal */
  onOpenOfflineCache?: () => void;
  /** Toast callback */
  showToast: (msg: string) => void;
}

function formatSize(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.round(mb * 1024)} KB`;
}

export default function StorageWarningBanner({
  report: initialReport,
  onCleanupComplete,
  onOpenMergePanel,
  onOpenOfflineCache,
  showToast,
}: Props) {
  const [report, setReport] = useState<CleanupReport | null>(initialReport);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [lastResult, setLastResult] = useState<CleanupResult | null>(null);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Update report when prop changes
  useEffect(() => {
    if (initialReport) setReport(initialReport);
  }, [initialReport]);

  // Entrance animation
  useEffect(() => {
    if (report?.showWarningBanner && !isDismissed) {
      Animated.spring(slideAnim, {
        toValue: 1,
        tension: 80,
        friction: 12,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [report?.showWarningBanner, isDismissed, slideAnim]);

  // Pulse animation for critical/exceeded
  useEffect(() => {
    if (report?.warningLevel === 'critical' || report?.warningLevel === 'exceeded') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.7, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [report?.warningLevel, pulseAnim]);

  // ── One-tap cleanup handler ───────────────────────────
  const handleQuickCleanup = useCallback(async () => {
    setIsCleaning(true);
    try {
      const result = await quickCleanup();
      setLastResult(result);

      if (result.regionsDeleted > 0 || result.freedMB > 0) {
        showToast(`CLEANUP: ${result.message}`);
      } else {
        showToast('NO CLEANUP NEEDED');
      }

      // Re-analyze after cleanup
      const newReport = analyzeCache();
      setReport(newReport);

      onCleanupComplete?.(result);
    } catch (e: any) {
      showToast(`CLEANUP FAILED: ${e?.message || 'Unknown error'}`);
    } finally {
      setIsCleaning(false);
    }
  }, [showToast, onCleanupComplete]);

  // ── Dismiss handler ───────────────────────────────────
  const handleDismiss = useCallback(() => {
    dismissWarningBanner();
    setIsDismissed(true);
  }, []);

  // Don't render if no report, no warning needed, or dismissed
  if (!report || !report.showWarningBanner || isDismissed) {
    return null;
  }

  const levelColor = report.warningLevel === 'exceeded' ? '#EF5350'
    : report.warningLevel === 'critical' ? '#FF7043'
    : report.warningLevel === 'warning' ? '#FFB300'
    : '#64B5F6';

  const levelIcon = report.warningLevel === 'exceeded' ? 'alert-circle'
    : report.warningLevel === 'critical' ? 'warning'
    : report.warningLevel === 'warning' ? 'alert-circle-outline'
    : 'information-circle-outline';

  const hasStale = report.staleRegions.filter(c => !c.isProtected).length > 0;
  const hasBroken = report.brokenRegions.length > 0;
  const hasMerges = report.mergeSuggestions.length > 0;
  const canClean = report.autoCleanCandidates.length > 0;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: slideAnim,
          transform: [{ translateY: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [-60, 0] }) }],
        },
      ]}
    >
      {/* Top accent line */}
      <Animated.View style={[styles.accentLine, { backgroundColor: levelColor, opacity: pulseAnim }]} />

      {/* Main banner row */}
      <TouchableOpacity
        style={styles.mainRow}
        onPress={() => setIsExpanded(!isExpanded)}
        activeOpacity={0.85}
      >
        <View style={styles.mainLeft}>
          <View style={[styles.iconContainer, { borderColor: levelColor + '40' }]}>
            <Ionicons name={levelIcon} size={14} color={levelColor} />
          </View>
          <View style={styles.mainTextContainer}>
            <Text style={[styles.mainTitle, { color: levelColor }]}>
              {report.warningLevel === 'exceeded' ? 'STORAGE EXCEEDED' :
               report.warningLevel === 'critical' ? 'STORAGE CRITICAL' :
               hasBroken ? 'CACHE MAINTENANCE' :
               hasStale ? 'STALE CACHE DATA' :
               hasMerges ? 'OPTIMIZE STORAGE' :
               'STORAGE WARNING'}
            </Text>
            <Text style={styles.mainSubtitle} numberOfLines={1}>
              {report.summaryMessage}
            </Text>
          </View>
        </View>

        <View style={styles.mainRight}>
          {/* Quick action button */}
          {canClean && (
            <TouchableOpacity
              style={[styles.quickCleanBtn, isCleaning && styles.quickCleanBtnDisabled]}
              onPress={handleQuickCleanup}
              disabled={isCleaning}
              activeOpacity={0.8}
            >
              {isCleaning ? (
                <ActivityIndicator size={10} color="#FFF" />
              ) : (
                <Ionicons name="trash-outline" size={11} color="#FFF" />
              )}
              <Text style={styles.quickCleanBtnText}>
                {isCleaning ? 'CLEANING' : 'CLEAN'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Expand/collapse chevron */}
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={TACTICAL.textMuted}
          />
        </View>
      </TouchableOpacity>

      {/* Expanded detail section */}
      {isExpanded && (
        <View style={styles.expandedSection}>
          {/* Quota gauge */}
          <View style={styles.quotaRow}>
            <View style={styles.quotaBarBg}>
              <View
                style={[
                  styles.quotaBarFill,
                  {
                    width: `${Math.min(report.quotaStatus.usedFraction * 100, 100)}%`,
                    backgroundColor: levelColor,
                  },
                ]}
              />
              {/* Warning threshold marker */}
              <View
                style={[
                  styles.quotaThresholdMarker,
                  { left: `${report.quotaStatus.config.warningThreshold * 100}%` },
                ]}
              />
            </View>
            <Text style={styles.quotaText}>
              {formatSize(report.quotaStatus.usedMB)} / {formatSize(report.quotaStatus.config.quotaLimitMB)}
            </Text>
          </View>

          {/* Breakdown stats */}
          <View style={styles.statsRow}>
            {hasStale && (
              <View style={styles.statItem}>
                <Ionicons name="time-outline" size={10} color="#FFB300" />
                <Text style={styles.statValue}>{report.staleRegions.length}</Text>
                <Text style={styles.statLabel}>STALE</Text>
              </View>
            )}
            {hasBroken && (
              <View style={styles.statItem}>
                <Ionicons name="alert-outline" size={10} color="#EF5350" />
                <Text style={styles.statValue}>{report.brokenRegions.length}</Text>
                <Text style={styles.statLabel}>BROKEN</Text>
              </View>
            )}
            {hasMerges && (
              <View style={styles.statItem}>
                <Ionicons name="git-merge-outline" size={10} color="#CE93D8" />
                <Text style={styles.statValue}>{report.mergeSuggestions.length}</Text>
                <Text style={styles.statLabel}>MERGE</Text>
              </View>
            )}
            <View style={styles.statItem}>
              <Ionicons name="shield-checkmark-outline" size={10} color="#66BB6A" />
              <Text style={styles.statValue}>{report.protectedRegionIds.size}</Text>
              <Text style={styles.statLabel}>PROTECTED</Text>
            </View>
            {report.autoCleanFreeMB > 0 && (
              <View style={styles.statItem}>
                <Ionicons name="arrow-down-outline" size={10} color={levelColor} />
                <Text style={[styles.statValue, { color: levelColor }]}>
                  {formatSize(report.autoCleanFreeMB)}
                </Text>
                <Text style={styles.statLabel}>FREEABLE</Text>
              </View>
            )}
          </View>

          {/* Stale region list */}
          {hasStale && (
            <View style={styles.detailSection}>
              <Text style={styles.detailSectionTitle}>STALE REGIONS</Text>
              {report.staleRegions.slice(0, 4).map(candidate => (
                <View key={candidate.regionId} style={styles.candidateRow}>
                  <View style={[
                    styles.candidateDot,
                    { backgroundColor: candidate.isProtected ? '#66BB6A' : '#FFB300' },
                  ]} />
                  <Text style={styles.candidateName} numberOfLines={1}>
                    {candidate.regionName}
                  </Text>
                  <Text style={styles.candidateAge}>{candidate.ageDays}d</Text>
                  <Text style={styles.candidateSize}>{formatSize(candidate.sizeMB)}</Text>
                  {candidate.isProtected && (
                    <Ionicons name="shield-checkmark" size={10} color="#66BB6A" />
                  )}
                </View>
              ))}
              {report.staleRegions.length > 4 && (
                <Text style={styles.moreText}>+{report.staleRegions.length - 4} more</Text>
              )}
            </View>
          )}

          {/* Merge suggestions */}
          {hasMerges && (
            <View style={styles.detailSection}>
              <Text style={styles.detailSectionTitle}>MERGE OPPORTUNITIES</Text>
              {report.mergeSuggestions.slice(0, 2).map((suggestion, idx) => (
                <View key={idx} style={styles.mergeRow}>
                  <Ionicons name="git-merge-outline" size={11} color="#CE93D8" />
                  <Text style={styles.mergeText} numberOfLines={1}>
                    {suggestion.candidate.regionNames.join(' + ')}
                  </Text>
                  <View style={styles.mergeSavingsBadge}>
                    <Text style={styles.mergeSavingsText}>
                      -{formatSize(suggestion.savingsMB)}
                    </Text>
                  </View>
                </View>
              ))}
              {onOpenMergePanel && (
                <TouchableOpacity
                  style={styles.mergeActionBtn}
                  onPress={onOpenMergePanel}
                  activeOpacity={0.8}
                >
                  <Ionicons name="git-merge-outline" size={11} color="#CE93D8" />
                  <Text style={styles.mergeActionBtnText}>OPEN MERGE PANEL</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Last cleanup result */}
          {lastResult && (
            <View style={[
              styles.resultBanner,
              { borderColor: lastResult.regionsDeleted > 0 ? '#66BB6A30' : TACTICAL.border },
            ]}>
              <Ionicons
                name={lastResult.regionsDeleted > 0 ? 'checkmark-circle' : 'information-circle'}
                size={12}
                color={lastResult.regionsDeleted > 0 ? '#66BB6A' : TACTICAL.textMuted}
              />
              <Text style={[
                styles.resultText,
                { color: lastResult.regionsDeleted > 0 ? '#66BB6A' : TACTICAL.textMuted },
              ]}>
                {lastResult.message}
              </Text>
            </View>
          )}

          {/* Action buttons row */}
          <View style={styles.actionRow}>
            {canClean && (
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnPrimary, isCleaning && styles.actionBtnDisabled]}
                onPress={handleQuickCleanup}
                disabled={isCleaning}
                activeOpacity={0.8}
              >
                {isCleaning ? (
                  <ActivityIndicator size={11} color="#FFF" />
                ) : (
                  <Ionicons name="flash-outline" size={12} color="#FFF" />
                )}
                <Text style={styles.actionBtnPrimaryText}>
                  {isCleaning ? 'CLEANING...' : `QUICK CLEAN (${formatSize(report.autoCleanFreeMB)})`}
                </Text>
              </TouchableOpacity>
            )}

            {onOpenOfflineCache && (
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnSecondary]}
                onPress={onOpenOfflineCache}
                activeOpacity={0.8}
              >
                <Ionicons name="settings-outline" size={12} color={TACTICAL.amber} />
                <Text style={styles.actionBtnSecondaryText}>MANAGE</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnDismiss]}
              onPress={handleDismiss}
              activeOpacity={0.8}
            >
              <Ionicons name="close" size={12} color={TACTICAL.textMuted} />
              <Text style={styles.actionBtnDismissText}>DISMISS</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: TACTICAL.panel,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    overflow: 'hidden',
    marginHorizontal: 8,
    marginTop: 4,
    marginBottom: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  accentLine: {
    height: 2,
    width: '100%',
  },

  // ── Main row ──────────────────────────────────────────
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  mainLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  iconContainer: {
    width: 28,
    height: 28,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  mainTextContainer: {
    flex: 1,
    gap: 2,
  },
  mainTitle: {
    ...TYPO.U2,
    fontSize: 8,
    letterSpacing: 2,
  },
  mainSubtitle: {
    ...TYPO.B2,
    fontSize: 9,
    color: TACTICAL.textMuted,
  },
  mainRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  // ── Quick clean button ────────────────────────────────
  quickCleanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#EF5350',
  },
  quickCleanBtnDisabled: {
    opacity: 0.5,
  },
  quickCleanBtnText: {
    ...TYPO.U2,
    fontSize: 7,
    color: '#FFF',
    letterSpacing: 2,
  },

  // ── Expanded section ──────────────────────────────────
  expandedSection: {
    paddingHorizontal: 10,
    paddingBottom: 10,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: TACTICAL.border,
  },

  // ── Quota gauge ───────────────────────────────────────
  quotaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 8,
  },
  quotaBarBg: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(62,79,60,0.15)',
    borderRadius: 3,
    overflow: 'hidden',
    position: 'relative',
  },
  quotaBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  quotaThresholdMarker: {
    position: 'absolute',
    top: -1,
    width: 1.5,
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  quotaText: {
    ...TYPO.K3,
    fontSize: 9,
    color: TACTICAL.textMuted,
    minWidth: 80,
    textAlign: 'right',
  },

  // ── Stats row ─────────────────────────────────────────
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 4,
  },
  statItem: {
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    ...TYPO.K3,
    fontSize: 12,
    color: TACTICAL.text,
  },
  statLabel: {
    ...TYPO.U2,
    fontSize: 6,
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },

  // ── Detail sections ───────────────────────────────────
  detailSection: {
    gap: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: TACTICAL.border + '40',
  },
  detailSectionTitle: {
    ...TYPO.U2,
    fontSize: 7,
    color: TACTICAL.textMuted,
    letterSpacing: 2,
    marginBottom: 2,
  },

  // ── Candidate rows ────────────────────────────────────
  candidateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 3,
  },
  candidateDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  candidateName: {
    ...TYPO.B2,
    fontSize: 9,
    color: TACTICAL.text,
    flex: 1,
  },
  candidateAge: {
    ...TYPO.K3,
    fontSize: 8,
    color: TACTICAL.textMuted,
    minWidth: 24,
    textAlign: 'right',
  },
  candidateSize: {
    ...TYPO.K3,
    fontSize: 8,
    color: TACTICAL.textMuted,
    minWidth: 40,
    textAlign: 'right',
  },
  moreText: {
    ...TYPO.B2,
    fontSize: 8,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    paddingVertical: 2,
  },

  // ── Merge rows ────────────────────────────────────────
  mergeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 3,
  },
  mergeText: {
    ...TYPO.B2,
    fontSize: 9,
    color: TACTICAL.text,
    flex: 1,
  },
  mergeSavingsBadge: {
    backgroundColor: 'rgba(102,187,106,0.12)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  mergeSavingsText: {
    ...TYPO.K3,
    fontSize: 8,
    color: '#66BB6A',
  },
  mergeActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CE93D8' + '30',
    backgroundColor: 'rgba(206,147,216,0.06)',
    marginTop: 2,
  },
  mergeActionBtnText: {
    ...TYPO.U2,
    fontSize: 7,
    color: '#CE93D8',
    letterSpacing: 2,
  },

  // ── Result banner ─────────────────────────────────────
  resultBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 6,
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: 'rgba(62,79,60,0.04)',
  },
  resultText: {
    ...TYPO.B2,
    fontSize: 9,
    flex: 1,
    lineHeight: 13,
  },

  // ── Action buttons ────────────────────────────────────
  actionRow: {
    flexDirection: 'row',
    gap: 6,
    paddingTop: 4,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
  actionBtnPrimary: {
    flex: 2,
    backgroundColor: TACTICAL.amber,
  },
  actionBtnPrimaryText: {
    ...TYPO.U2,
    fontSize: 7,
    color: '#0B0F12',
    letterSpacing: 2,
  },
  actionBtnSecondary: {
    flex: 1,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '30',
    backgroundColor: 'rgba(196,138,44,0.06)',
  },
  actionBtnSecondaryText: {
    ...TYPO.U2,
    fontSize: 7,
    color: TACTICAL.amber,
    letterSpacing: 2,
  },
  actionBtnDismiss: {
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  actionBtnDismissText: {
    ...TYPO.U2,
    fontSize: 7,
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
});



