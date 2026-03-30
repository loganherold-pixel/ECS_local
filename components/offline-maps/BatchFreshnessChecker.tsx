/**
 * BatchFreshnessChecker — Batch freshness verification across all regions
 *
 * Shows:
 *   - Start batch check button
 *   - Progress bar with region-by-region progress
 *   - Current region being checked
 *   - Results summary (fresh / update-available / error counts)
 *   - Per-region result badges
 *   - Update count badge
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, TYPO, DENSITY } from '../../lib/theme';
import {
  tileCacheStore,
  type FreshnessCheckProgress,
  type FreshnessCheckResult,
} from '../../lib/tileCacheStore';

interface Props {
  /** Number of checkable regions */
  checkableCount: number;
  /** Whether online */
  isOnline: boolean;
  /** Callback after batch check completes */
  onComplete: () => void;
  /** Toast callback */
  showToast: (msg: string) => void;
}

const STATUS_CONFIG: Record<string, { color: string; icon: string; label: string }> = {
  fresh: { color: '#66BB6A', icon: 'shield-checkmark-outline', label: 'FRESH' },
  'update-available': { color: '#FFB300', icon: 'arrow-up-circle-outline', label: 'UPDATE' },
  error: { color: '#EF5350', icon: 'alert-circle-outline', label: 'ERROR' },
  unknown: { color: TACTICAL.textMuted, icon: 'help-circle-outline', label: 'UNKNOWN' },
};

export default function BatchFreshnessChecker({
  checkableCount,
  isOnline,
  onComplete,
  showToast,
}: Props) {
  const [isChecking, setIsChecking] = useState(false);
  const [progress, setProgress] = useState<FreshnessCheckProgress | null>(null);
  const [results, setResults] = useState<FreshnessCheckResult[] | null>(null);
  const [showResults, setShowResults] = useState(false);

  const handleStartBatchCheck = useCallback(async () => {
    if (!isOnline) {
      showToast('CANNOT CHECK FRESHNESS — NO NETWORK CONNECTION');
      return;
    }

    setIsChecking(true);
    setResults(null);
    setShowResults(false);

    try {
      const checkResults = await tileCacheStore.checkAllRegionsFreshness((p) => {
        setProgress(p);
      });

      setResults(checkResults);
      setIsChecking(false);
      setProgress(null);

      const freshCount = checkResults.filter(r => r.status === 'fresh').length;
      const updateCount = checkResults.filter(r => r.status === 'update-available').length;
      const errorCount = checkResults.filter(r => r.status === 'error').length;

      if (updateCount > 0) {
        showToast(`${updateCount} REGION${updateCount > 1 ? 'S' : ''} HAVE UPDATES AVAILABLE`);
      } else if (freshCount === checkResults.length) {
        showToast('ALL REGIONS ARE FRESH');
      } else {
        showToast(`FRESHNESS CHECK COMPLETE: ${freshCount} FRESH, ${errorCount} ERRORS`);
      }

      onComplete();
    } catch (e: any) {
      setIsChecking(false);
      setProgress(null);
      showToast(`FRESHNESS CHECK FAILED: ${e?.message || 'Unknown error'}`);
    }
  }, [isOnline, showToast, onComplete]);

  if (checkableCount === 0) {
    return null;
  }

  const freshCount = results?.filter(r => r.status === 'fresh').length || 0;
  const updateCount = results?.filter(r => r.status === 'update-available').length || 0;
  const errorCount = results?.filter(r => r.status === 'error').length || 0;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="sync-outline" size={14} color="#64B5F6" />
          <Text style={styles.headerTitle}>FRESHNESS VERIFICATION</Text>
        </View>
        {results && updateCount > 0 && (
          <View style={styles.updateCountBadge}>
            <Ionicons name="arrow-up-circle-outline" size={9} color="#FFB300" />
            <Text style={styles.updateCountText}>{updateCount} UPDATE{updateCount > 1 ? 'S' : ''}</Text>
          </View>
        )}
      </View>

      {/* Progress indicator */}
      {isChecking && progress && (
        <View style={styles.progressSection}>
          <View style={styles.progressHeader}>
            <ActivityIndicator size={12} color="#64B5F6" />
            <Text style={styles.progressTitle}>
              Checking region {progress.checkedRegions + 1} of {progress.totalRegions}...
            </Text>
          </View>
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${progress.totalRegions > 0
                    ? Math.round((progress.checkedRegions / progress.totalRegions) * 100)
                    : 0}%`,
                },
              ]}
            />
          </View>
          <Text style={styles.progressRegionName} numberOfLines={1}>
            {progress.currentRegionName}
          </Text>
        </View>
      )}

      {/* Results summary */}
      {results && !isChecking && (
        <View style={styles.resultsSummary}>
          <View style={styles.resultsKPIRow}>
            <View style={styles.resultsKPI}>
              <Ionicons name="shield-checkmark-outline" size={12} color="#66BB6A" />
              <Text style={[styles.resultsKPIValue, { color: '#66BB6A' }]}>{freshCount}</Text>
              <Text style={styles.resultsKPILabel}>FRESH</Text>
            </View>
            <View style={styles.resultsKPIDivider} />
            <View style={styles.resultsKPI}>
              <Ionicons name="arrow-up-circle-outline" size={12} color="#FFB300" />
              <Text style={[styles.resultsKPIValue, { color: updateCount > 0 ? '#FFB300' : TACTICAL.text }]}>
                {updateCount}
              </Text>
              <Text style={styles.resultsKPILabel}>UPDATES</Text>
            </View>
            <View style={styles.resultsKPIDivider} />
            <View style={styles.resultsKPI}>
              <Ionicons name="alert-circle-outline" size={12} color={errorCount > 0 ? '#EF5350' : TACTICAL.textMuted} />
              <Text style={[styles.resultsKPIValue, errorCount > 0 && { color: '#EF5350' }]}>
                {errorCount}
              </Text>
              <Text style={styles.resultsKPILabel}>ERRORS</Text>
            </View>
          </View>

          {/* Expandable detail */}
          <TouchableOpacity
            style={styles.detailToggle}
            onPress={() => setShowResults(!showResults)}
            activeOpacity={0.8}
          >
            <Text style={styles.detailToggleText}>
              {showResults ? 'HIDE' : 'SHOW'} DETAILS
            </Text>
            <Ionicons
              name={showResults ? 'chevron-up' : 'chevron-down'}
              size={12}
              color={TACTICAL.textMuted}
            />
          </TouchableOpacity>

          {showResults && (
            <View style={styles.detailList}>
              {results.map((result) => {
                const cfg = STATUS_CONFIG[result.status] || STATUS_CONFIG.unknown;
                return (
                  <View key={result.regionId} style={styles.detailRow}>
                    <Ionicons name={cfg.icon as any} size={10} color={cfg.color} />
                    <View style={styles.detailInfo}>
                      <Text style={styles.detailMessage} numberOfLines={1}>
                        {result.message}
                      </Text>
                      <Text style={styles.detailMeta}>
                        {result.sampledTiles} sampled
                        {result.changePercent > 0 ? ` — ~${result.changePercent}% changed` : ''}
                      </Text>
                    </View>
                    <View style={[styles.detailBadge, { backgroundColor: cfg.color + '15' }]}>
                      <Text style={[styles.detailBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}

      {/* Start button */}
      {!isChecking && (
        <TouchableOpacity
          style={[styles.checkBtn, !isOnline && styles.checkBtnDisabled]}
          onPress={handleStartBatchCheck}
          disabled={!isOnline}
          activeOpacity={0.8}
        >
          <Ionicons name="sync-outline" size={14} color={isOnline ? '#64B5F6' : TACTICAL.textMuted} />
          <Text style={[styles.checkBtnText, !isOnline && { color: TACTICAL.textMuted }]}>
            {results
              ? 'RE-CHECK ALL REGIONS'
              : `CHECK ALL REGIONS (${checkableCount})`}
          </Text>
        </TouchableOpacity>
      )}

      {!isOnline && (
        <View style={styles.offlineNote}>
          <Ionicons name="cloud-offline-outline" size={10} color="#EF5350" />
          <Text style={styles.offlineNoteText}>
            Freshness checking requires a network connection
          </Text>
        </View>
      )}
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
    color: '#64B5F6',
    fontSize: 9,
    letterSpacing: 4,
  },
  updateCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(255,179,0,0.1)',
    borderWidth: 1,
    borderColor: '#FFB300' + '30',
  },
  updateCountText: {
    ...TYPO.U2,
    fontSize: 7,
    letterSpacing: 1,
    color: '#FFB300',
  },
  progressSection: {
    gap: 6,
    padding: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(100,181,246,0.06)',
    borderWidth: 1,
    borderColor: '#64B5F6' + '20',
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  progressTitle: {
    ...TYPO.B2,
    fontSize: 11,
    color: '#64B5F6',
  },
  progressBarBg: {
    height: 4,
    backgroundColor: 'rgba(100,181,246,0.15)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#64B5F6',
    borderRadius: 2,
  },
  progressRegionName: {
    ...TYPO.B2,
    fontSize: 10,
    color: TACTICAL.textMuted,
  },
  resultsSummary: {
    gap: 8,
  },
  resultsKPIRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  resultsKPI: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  resultsKPIValue: {
    ...TYPO.K2,
    fontSize: 16,
    color: TACTICAL.text,
  },
  resultsKPILabel: {
    ...TYPO.U2,
    fontSize: 6,
    letterSpacing: 2,
    color: TACTICAL.textMuted,
  },
  resultsKPIDivider: {
    width: 1,
    height: 24,
    backgroundColor: TACTICAL.border,
  },
  detailToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  detailToggleText: {
    ...TYPO.U2,
    fontSize: 7,
    letterSpacing: 2,
    color: TACTICAL.textMuted,
  },
  detailList: {
    gap: 4,
    borderTopWidth: 1,
    borderTopColor: TACTICAL.border,
    paddingTop: 6,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  detailInfo: {
    flex: 1,
    gap: 1,
  },
  detailMessage: {
    ...TYPO.B2,
    fontSize: 10,
    color: TACTICAL.text,
  },
  detailMeta: {
    ...TYPO.B2,
    fontSize: 8,
    color: TACTICAL.textMuted,
  },
  detailBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
  },
  detailBadgeText: {
    ...TYPO.U2,
    fontSize: 6,
    letterSpacing: 1,
  },
  checkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#64B5F6' + '40',
    backgroundColor: 'rgba(100,181,246,0.06)',
  },
  checkBtnDisabled: {
    opacity: 0.4,
    borderColor: TACTICAL.border,
    backgroundColor: 'transparent',
  },
  checkBtnText: {
    ...TYPO.U2,
    fontSize: 9,
    color: '#64B5F6',
    letterSpacing: 2,
  },
  offlineNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    justifyContent: 'center',
  },
  offlineNoteText: {
    ...TYPO.B2,
    fontSize: 9,
    color: '#EF5350',
  },
});



