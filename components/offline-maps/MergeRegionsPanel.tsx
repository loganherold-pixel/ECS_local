/**
 * MergeRegionsPanel — Region Overlap Detection & Merge UI
 *
 * Shows:
 *   - Summary of total overlapping region pairs and wasted storage
 *   - Merge candidate cards with region names, overlap %, savings estimate
 *   - Visual union bounds preview with overlap visualization
 *   - Merge confirmation with estimated savings
 *   - Progress indicator during merge operation
 *   - Manual merge mode with region selection checkboxes
 *
 * Integrates with:
 *   - tileCacheStore overlap detection and merge methods
 *   - CachedRegionCard overlap props
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TextInput,
  ScrollView,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL, TYPO, DENSITY } from '../../lib/theme';
import {
  tileCacheStore,
  type MergeCandidate,
  type MergeResult,
  type RegionOverlapPair,
  type DownloadProgress,
} from '../../lib/tileCacheStore';

interface Props {
  /** Callback after merge completes to refresh data */
  onMergeComplete: () => void;
  /** Toast callback */
  showToast: (msg: string) => void;
  /** Close the panel */
  onClose: () => void;
}

function formatSize(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.round(mb * 1024)} KB`;
}

export default function MergeRegionsPanel({ onMergeComplete, showToast, onClose }: Props) {
  const [isMerging, setIsMerging] = useState(false);
  const [mergeProgress, setMergeProgress] = useState<DownloadProgress | null>(null);
  const [customName, setCustomName] = useState('');
  const [expandedCandidate, setExpandedCandidate] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<MergeResult | null>(null);

  // Compute overlap data
  const overlaps = useMemo(() => tileCacheStore.detectAllOverlaps(), []);
  const candidates = useMemo(() => tileCacheStore.getMergeCandidates(), []);
  const wasteInfo = useMemo(() => tileCacheStore.getTotalOverlapWaste(), []);

  const hasOverlaps = overlaps.length > 0;
  const hasCandidates = candidates.length > 0;

  // ── Merge handler ──────────────────────────────────────

  const handleMerge = useCallback(async (candidate: MergeCandidate) => {
    const name = customName.trim() || undefined;

    Alert.alert(
      'Merge Regions',
      `Merge ${candidate.regionNames.length} regions into one?\n\n` +
      `Regions: ${candidate.regionNames.join(', ')}\n\n` +
      `Current: ${formatSize(candidate.currentTotalSizeMB)} (${candidate.currentTotalTiles.toLocaleString()} tiles)\n` +
      `Merged: ~${formatSize(candidate.mergedEstimatedSizeMB)} (${candidate.mergedTileCount.toLocaleString()} tiles)\n` +
      `Savings: ~${formatSize(candidate.savingsMB)} (${candidate.savingsPercent}%)\n` +
      `Shared tiles: ~${candidate.sharedTileEstimate.toLocaleString()}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Merge',
          style: 'destructive',
          onPress: async () => {
            setIsMerging(true);
            setMergeProgress(null);
            setLastResult(null);

            try {
              const result = await tileCacheStore.mergeRegions(
                candidate.regionIds,
                name,
                (progress) => setMergeProgress(progress)
              );

              setLastResult(result);

              if (result.success) {
                showToast(result.message);
              } else {
                showToast(`Merge failed: ${result.message}`);
              }
            } catch (e: any) {
              showToast(`Merge error: ${e?.message || 'Unknown error'}`);
            } finally {
              setIsMerging(false);
              setMergeProgress(null);
              setCustomName('');
              onMergeComplete();
            }
          },
        },
      ]
    );
  }, [customName, showToast, onMergeComplete]);

  // ── No overlaps state ─────────────────────────────────

  if (!hasOverlaps) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons name="git-merge-outline" size={16} color="#CE93D8" />
            <Text style={styles.headerTitle}>REGION MERGING</Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={18} color={TACTICAL.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={styles.emptyState}>
          <Ionicons name="checkmark-circle-outline" size={32} color="#66BB6A" />
          <Text style={styles.emptyTitle}>No Overlapping Regions</Text>
          <Text style={styles.emptyDesc}>
            All cached regions have distinct geographic coverage. No merge opportunities detected.
          </Text>
        </View>
      </View>
    );
  }

  // ── Main panel ────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="git-merge-outline" size={16} color="#CE93D8" />
          <Text style={styles.headerTitle}>REGION MERGING</Text>
        </View>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={18} color={TACTICAL.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Summary banner */}
      <View style={styles.summaryBanner}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Ionicons name="copy-outline" size={12} color="#CE93D8" />
            <Text style={styles.summaryValue}>{wasteInfo.pairs}</Text>
            <Text style={styles.summaryLabel}>overlap{wasteInfo.pairs !== 1 ? 's' : ''}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Ionicons name="warning-outline" size={12} color="#FFB300" />
            <Text style={styles.summaryValue}>{formatSize(wasteInfo.wastedMB)}</Text>
            <Text style={styles.summaryLabel}>wasted</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Ionicons name="grid-outline" size={12} color={TACTICAL.textMuted} />
            <Text style={styles.summaryValue}>{wasteInfo.wastedTiles.toLocaleString()}</Text>
            <Text style={styles.summaryLabel}>dup tiles</Text>
          </View>
        </View>
      </View>

      {/* Merge progress */}
      {isMerging && mergeProgress && (
        <View style={styles.progressSection}>
          <View style={styles.progressHeader}>
            <ActivityIndicator size={12} color="#CE93D8" />
            <Text style={styles.progressTitle}>Merging regions...</Text>
          </View>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${mergeProgress.percent}%` }]} />
          </View>
          <Text style={styles.progressMessage}>{mergeProgress.message}</Text>
        </View>
      )}

      {/* Last merge result */}
      {lastResult && (
        <View style={[styles.resultBanner, { borderColor: lastResult.success ? '#66BB6A30' : '#EF535030' }]}>
          <Ionicons
            name={lastResult.success ? 'checkmark-circle' : 'close-circle'}
            size={14}
            color={lastResult.success ? '#66BB6A' : '#EF5350'}
          />
          <Text style={[styles.resultText, { color: lastResult.success ? '#66BB6A' : '#EF5350' }]}>
            {lastResult.message}
          </Text>
        </View>
      )}

      {/* Merge candidates */}
      {hasCandidates && (
        <View style={styles.candidatesSection}>
          <Text style={styles.sectionTitle}>MERGE CANDIDATES</Text>

          {candidates.map((candidate, idx) => {
            const isExpanded = expandedCandidate === idx;
            return (
              <View key={idx} style={styles.candidateCard}>
                <TouchableOpacity
                  style={styles.candidateHeader}
                  onPress={() => setExpandedCandidate(isExpanded ? null : idx)}
                  activeOpacity={0.8}
                >
                  <View style={styles.candidateHeaderLeft}>
                    <Ionicons name="git-merge-outline" size={14} color="#CE93D8" />
                    <View style={styles.candidateHeaderInfo}>
                      <Text style={styles.candidateTitle} numberOfLines={1}>
                        {candidate.regionNames.join(' + ')}
                      </Text>
                      <Text style={styles.candidateSubtitle}>
                        {candidate.regionIds.length} regions \u2022 {candidate.styleKey.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.candidateHeaderRight}>
                    {candidate.savingsMB > 0 && (
                      <View style={styles.savingsBadge}>
                        <Text style={styles.savingsText}>
                          -{formatSize(candidate.savingsMB)}
                        </Text>
                      </View>
                    )}
                    <Ionicons
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={14}
                      color={TACTICAL.textMuted}
                    />
                  </View>
                </TouchableOpacity>

                {isExpanded && (
                  <View style={styles.candidateDetails}>
                    {/* Stats grid */}
                    <View style={styles.statsGrid}>
                      <View style={styles.statsGridItem}>
                        <Text style={styles.statsGridLabel}>CURRENT</Text>
                        <Text style={styles.statsGridValue}>
                          {formatSize(candidate.currentTotalSizeMB)}
                        </Text>
                        <Text style={styles.statsGridSub}>
                          {candidate.currentTotalTiles.toLocaleString()} tiles
                        </Text>
                      </View>
                      <View style={styles.statsGridArrow}>
                        <Ionicons name="arrow-forward" size={14} color="#CE93D8" />
                      </View>
                      <View style={styles.statsGridItem}>
                        <Text style={styles.statsGridLabel}>MERGED</Text>
                        <Text style={[styles.statsGridValue, { color: '#66BB6A' }]}>
                          {formatSize(candidate.mergedEstimatedSizeMB)}
                        </Text>
                        <Text style={styles.statsGridSub}>
                          {candidate.mergedTileCount.toLocaleString()} tiles
                        </Text>
                      </View>
                      <View style={styles.statsGridItem}>
                        <Text style={styles.statsGridLabel}>SAVINGS</Text>
                        <Text style={[styles.statsGridValue, { color: '#CE93D8' }]}>
                          {candidate.savingsPercent}%
                        </Text>
                        <Text style={styles.statsGridSub}>
                          {candidate.sharedTileEstimate.toLocaleString()} shared
                        </Text>
                      </View>
                    </View>

                    {/* Zoom range */}
                    <View style={styles.detailRow}>
                      <Ionicons name="search-outline" size={10} color={TACTICAL.textMuted} />
                      <Text style={styles.detailText}>
                        Zoom range: Z{candidate.zoomMin}\u2013{candidate.zoomMax}
                      </Text>
                    </View>

                    {/* Region list */}
                    <View style={styles.regionList}>
                      {candidate.regionNames.map((name, i) => (
                        <View key={i} style={styles.regionListItem}>
                          <View style={[styles.regionListDot, { backgroundColor: '#CE93D8' }]} />
                          <Text style={styles.regionListName} numberOfLines={1}>{name}</Text>
                        </View>
                      ))}
                    </View>

                    {/* Custom name input */}
                    <View style={styles.nameInputRow}>
                      <Ionicons name="create-outline" size={12} color={TACTICAL.textMuted} />
                      <TextInput
                        style={styles.nameInput}
                        placeholder="Custom merged name (optional)"
                        placeholderTextColor={TACTICAL.textMuted + '80'}
                        value={customName}
                        onChangeText={setCustomName}
                      />
                    </View>

                    {/* Merge button */}
                    <TouchableOpacity
                      style={[styles.mergeActionBtn, isMerging && styles.mergeActionBtnDisabled]}
                      onPress={() => handleMerge(candidate)}
                      disabled={isMerging}
                      activeOpacity={0.8}
                    >
                      {isMerging ? (
                        <ActivityIndicator size={12} color="#FFF" />
                      ) : (
                        <Ionicons name="git-merge-outline" size={14} color="#FFF" />
                      )}
                      <Text style={styles.mergeActionBtnText}>
                        {isMerging ? 'MERGING...' : 'MERGE THESE REGIONS'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* Overlap pairs list */}
      <View style={styles.pairsSection}>
        <Text style={styles.sectionTitle}>ALL OVERLAPS</Text>
        {overlaps.slice(0, 10).map((pair, idx) => (
          <View key={idx} style={styles.pairRow}>
            <View style={styles.pairNames}>
              <Text style={styles.pairName} numberOfLines={1}>{pair.regionA.name}</Text>
              <Ionicons name="swap-horizontal-outline" size={10} color={TACTICAL.textMuted} />
              <Text style={styles.pairName} numberOfLines={1}>{pair.regionB.name}</Text>
            </View>
            <View style={styles.pairStats}>
              <View style={styles.pairOverlapBar}>
                <View style={[
                  styles.pairOverlapFill,
                  {
                    width: `${Math.min(pair.overlapPercent, 100)}%`,
                    backgroundColor: pair.overlapPercent >= 75 ? '#EF5350'
                      : pair.overlapPercent >= 40 ? '#FFB300'
                      : '#64B5F6',
                  },
                ]} />
              </View>
              <Text style={[styles.pairPercent, {
                color: pair.overlapPercent >= 75 ? '#EF5350'
                  : pair.overlapPercent >= 40 ? '#FFB300'
                  : '#64B5F6',
              }]}>
                {pair.overlapPercent}%
              </Text>
              {pair.wastedMB > 0 && (
                <Text style={styles.pairWasted}>~{formatSize(pair.wastedMB)}</Text>
              )}
            </View>
          </View>
        ))}
        {overlaps.length > 10 && (
          <Text style={styles.overlapMore}>
            +{overlaps.length - 10} more overlap{overlaps.length - 10 > 1 ? 's' : ''}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
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
    ...TYPO.U1,
    fontSize: 11,
    color: '#CE93D8',
    letterSpacing: 2,
  },

  // ── Summary banner ────────────────────────────────────
  summaryBanner: {
    backgroundColor: 'rgba(206,147,216,0.06)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CE93D8' + '20',
    padding: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  summaryItem: {
    alignItems: 'center',
    gap: 3,
  },
  summaryValue: {
    ...TYPO.K2,
    fontSize: 13,
    color: TACTICAL.text,
  },
  summaryLabel: {
    ...TYPO.B2,
    fontSize: 8,
    color: TACTICAL.textMuted,
  },
  summaryDivider: {
    width: 1,
    height: 28,
    backgroundColor: TACTICAL.border,
  },

  // ── Progress ──────────────────────────────────────────
  progressSection: {
    backgroundColor: 'rgba(206,147,216,0.06)',
    borderRadius: 8,
    padding: 10,
    gap: 6,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  progressTitle: {
    ...TYPO.T3,
    fontSize: 11,
    color: '#CE93D8',
  },
  progressBarBg: {
    height: 4,
    backgroundColor: 'rgba(206,147,216,0.15)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#CE93D8',
    borderRadius: 2,
  },
  progressMessage: {
    ...TYPO.B2,
    fontSize: 9,
    color: TACTICAL.textMuted,
  },

  // ── Result banner ─────────────────────────────────────
  resultBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: 'rgba(62,79,60,0.04)',
  },
  resultText: {
    ...TYPO.B2,
    fontSize: 10,
    flex: 1,
    lineHeight: 15,
  },

  // ── Empty state ───────────────────────────────────────
  emptyState: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 24,
  },
  emptyTitle: {
    ...TYPO.T3,
    fontSize: 13,
    color: TACTICAL.text,
  },
  emptyDesc: {
    ...TYPO.B2,
    fontSize: 11,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 16,
  },

  // ── Candidates section ────────────────────────────────
  candidatesSection: {
    gap: 8,
  },
  sectionTitle: {
    ...TYPO.U2,
    fontSize: 9,
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
  candidateCard: {
    backgroundColor: TACTICAL.panel,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CE93D8' + '20',
    overflow: 'hidden',
  },
  candidateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    gap: 8,
  },
  candidateHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  candidateHeaderInfo: {
    flex: 1,
    gap: 2,
  },
  candidateTitle: {
    ...TYPO.T3,
    fontSize: 11,
    color: TACTICAL.text,
  },
  candidateSubtitle: {
    ...TYPO.B2,
    fontSize: 9,
    color: TACTICAL.textMuted,
  },
  candidateHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  savingsBadge: {
    backgroundColor: 'rgba(102,187,106,0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  savingsText: {
    ...TYPO.K3,
    fontSize: 9,
    color: '#66BB6A',
  },
  candidateDetails: {
    padding: 10,
    paddingTop: 0,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: TACTICAL.border,
  },

  // ── Stats grid ────────────────────────────────────────
  statsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 8,
  },
  statsGridItem: {
    alignItems: 'center',
    gap: 2,
  },
  statsGridArrow: {
    paddingHorizontal: 4,
  },
  statsGridLabel: {
    ...TYPO.U2,
    fontSize: 7,
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  statsGridValue: {
    ...TYPO.K2,
    fontSize: 14,
    color: TACTICAL.text,
  },
  statsGridSub: {
    ...TYPO.B2,
    fontSize: 8,
    color: TACTICAL.textMuted,
  },

  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  detailText: {
    ...TYPO.B2,
    fontSize: 9,
    color: TACTICAL.textMuted,
  },

  // ── Region list ───────────────────────────────────────
  regionList: {
    gap: 4,
  },
  regionListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  regionListDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  regionListName: {
    ...TYPO.B2,
    fontSize: 10,
    color: TACTICAL.text,
    flex: 1,
  },

  // ── Name input ────────────────────────────────────────
  nameInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  nameInput: {
    flex: 1,
    ...TYPO.B1,
    fontSize: 11,
    color: TACTICAL.text,
    padding: 0,
  },

  // ── Merge action button ───────────────────────────────
  mergeActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#CE93D8',
  },
  mergeActionBtnDisabled: {
    opacity: 0.5,
  },
  mergeActionBtnText: {
    ...TYPO.U1,
    fontSize: 10,
    color: '#FFF',
    letterSpacing: 2,
  },

  // ── Pairs section ─────────────────────────────────────
  pairsSection: {
    gap: 6,
  },
  pairRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: TACTICAL.border + '40',
  },
  pairNames: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pairName: {
    ...TYPO.B2,
    fontSize: 9,
    color: TACTICAL.text,
    flex: 1,
  },
  pairStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 100,
  },
  pairOverlapBar: {
    width: 40,
    height: 3,
    backgroundColor: 'rgba(62,79,60,0.12)',
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  pairOverlapFill: {
    height: '100%',
    borderRadius: 1.5,
  },
  pairPercent: {
    ...TYPO.K3,
    fontSize: 9,
    minWidth: 28,
    textAlign: 'right',
  },
  pairWasted: {
    ...TYPO.B2,
    fontSize: 8,
    color: TACTICAL.textMuted,
    minWidth: 40,
    textAlign: 'right',
  },
  overlapMore: {
    ...TYPO.B2,
    fontSize: 9,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    paddingVertical: 4,
  },
});



