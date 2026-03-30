/**
 * Cached Region Card — Individual offline map region display
 *
 * Shows:
 *   - Region name and source type
 *   - Bounds coverage info
 *   - Zoom range
 *   - Download status + progress bar
 *   - Tile count and size
 *   - Freshness indicator with last-verified timestamp
 *   - Freshness status badge (FRESH / UPDATE AVAILABLE / CHECKING / UNKNOWN)
 *   - Overlap warnings with percentage and wasted storage
 *   - Actions: resume, cancel, delete, check freshness, update, merge
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL, TYPO, DENSITY } from '../../lib/theme';
import type { TileCacheRegion, DownloadProgress, FreshnessStatus, RegionOverlapInfo } from '../../lib/tileCacheStore';

interface Props {
  region: TileCacheRegion;
  progress?: DownloadProgress | null;
  onResume: (id: string) => void;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
  onRetry: (id: string) => void;
  /** Trigger freshness check for this region */
  onCheckFreshness?: (id: string) => void;
  /** Trigger re-download (refresh) for this region */
  onRefresh?: (id: string) => void;
  /** Whether a freshness check is currently running for this region */
  isCheckingFreshness?: boolean;
  /** Whether a refresh download is currently running for this region */
  isRefreshing?: boolean;
  /** Overlap information for this region */
  overlaps?: RegionOverlapInfo[];
  /** Callback to initiate merge with overlapping regions */
  onMerge?: (regionIds: string[]) => void;
  /** Whether this region is selected for merge */
  isMergeSelected?: boolean;
  /** Toggle merge selection for this region */
  onToggleMergeSelect?: (id: string) => void;
}

const STATUS_CONFIG: Record<string, { color: string; icon: string; label: string }> = {
  pending: { color: TACTICAL.textMuted, icon: 'hourglass-outline', label: 'PENDING' },
  downloading: { color: '#FFB300', icon: 'cloud-download-outline', label: 'DOWNLOADING' },
  complete: { color: '#66BB6A', icon: 'checkmark-circle', label: 'COMPLETE' },
  partial: { color: '#FFB300', icon: 'alert-circle-outline', label: 'PARTIAL' },
  error: { color: '#EF5350', icon: 'close-circle-outline', label: 'ERROR' },
  cancelled: { color: TACTICAL.textMuted, icon: 'pause-circle-outline', label: 'CANCELLED' },
};

const SOURCE_ICONS: Record<string, string> = {
  'route-corridor': 'navigate-outline',
  'bounding-box': 'crop-outline',
  'manual': 'hand-left-outline',
};

// ── Freshness UI Config ─────────────────────────────────

const FRESHNESS_CONFIG: Record<FreshnessStatus, {
  color: string;
  icon: string;
  label: string;
  bgAlpha: string;
}> = {
  'unknown': {
    color: TACTICAL.textMuted,
    icon: 'help-circle-outline',
    label: 'UNVERIFIED',
    bgAlpha: '15',
  },
  'checking': {
    color: '#64B5F6',
    icon: 'sync-outline',
    label: 'CHECKING',
    bgAlpha: '18',
  },
  'fresh': {
    color: '#66BB6A',
    icon: 'shield-checkmark-outline',
    label: 'VERIFIED',
    bgAlpha: '15',
  },
  'update-available': {
    color: '#FFB300',
    icon: 'arrow-up-circle-outline',
    label: 'UPDATE AVAILABLE',
    bgAlpha: '18',
  },
  'error': {
    color: '#EF5350',
    icon: 'alert-circle-outline',
    label: 'CHECK FAILED',
    bgAlpha: '15',
  },
};

// ── Overlap severity colors ─────────────────────────────

function getOverlapColor(percent: number): string {
  if (percent >= 75) return '#EF5350';  // High overlap = red
  if (percent >= 40) return '#FFB300';  // Medium = amber
  return '#64B5F6';                     // Low = blue
}

function getOverlapLabel(percent: number): string {
  if (percent >= 75) return 'HIGH';
  if (percent >= 40) return 'MEDIUM';
  return 'LOW';
}

// ── Helpers ─────────────────────────────────────────────

function formatSize(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.round(mb * 1024)} KB`;
}

function formatBounds(bounds: TileCacheRegion['bounds']): string {
  const latSpan = Math.abs(bounds.maxLat - bounds.minLat).toFixed(2);
  const lngSpan = Math.abs(bounds.maxLng - bounds.minLng).toFixed(2);
  return `${latSpan}\u00B0 \u00D7 ${lngSpan}\u00B0`;
}

function formatETA(seconds: number): string {
  if (seconds <= 0) return '';
  if (seconds < 60) return `~${seconds}s remaining`;
  if (seconds < 3600) return `~${Math.ceil(seconds / 60)}m remaining`;
  return `~${(seconds / 3600).toFixed(1)}h remaining`;
}

function formatAge(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return new Date(iso).toLocaleDateString();
}

function getFreshnessColor(iso: string | null | undefined): string {
  if (!iso) return TACTICAL.textMuted;
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays < 7) return '#66BB6A';
  if (diffDays < 30) return '#FFB300';
  return '#EF5350';
}

export default function CachedRegionCard({
  region,
  progress,
  onResume,
  onCancel,
  onDelete,
  onRetry,
  onCheckFreshness,
  onRefresh,
  isCheckingFreshness = false,
  isRefreshing = false,
  overlaps,
  onMerge,
  isMergeSelected = false,
  onToggleMergeSelect,
}: Props) {
  const statusCfg = STATUS_CONFIG[region.status] || STATUS_CONFIG.pending;
  const isActive = region.status === 'downloading';
  const displayProgress = progress && isActive ? progress : null;
  const percent = displayProgress
    ? displayProgress.percent
    : region.tileCount > 0
      ? Math.round((region.downloadedTiles / region.tileCount) * 100)
      : 0;

  const actualSize = region.actualSizeMB > 0 ? region.actualSizeMB : region.estimatedSizeMB;
  const completedDate = region.completedAt || (region.status === 'complete' ? region.downloadedAt : null);
  const freshnessColor = getFreshnessColor(completedDate);

  // Freshness status
  const freshnessStatus: FreshnessStatus = isCheckingFreshness
    ? 'checking'
    : (region.freshnessStatus || 'unknown');
  const freshCfg = FRESHNESS_CONFIG[freshnessStatus];
  const showFreshnessSection = region.status === 'complete' || region.status === 'partial';
  const hasUpdate = freshnessStatus === 'update-available';

  // Overlap info
  const hasOverlaps = overlaps && overlaps.length > 0;
  const maxOverlapPercent = hasOverlaps
    ? Math.max(...overlaps!.map(o => o.overlapPercent))
    : 0;
  const totalWastedMB = hasOverlaps
    ? overlaps!.reduce((sum, o) => sum + o.wastedMB, 0)
    : 0;

  const cardBorderColor = isMergeSelected
    ? '#CE93D8'
    : hasUpdate
      ? '#FFB300' + '30'
      : hasOverlaps && maxOverlapPercent >= 40
        ? getOverlapColor(maxOverlapPercent) + '30'
        : isActive
          ? '#FFB300' + '40'
          : TACTICAL.border;

  return (
    <View style={[styles.card, { borderColor: cardBorderColor }, isMergeSelected && styles.cardMergeSelected]}>
      {/* Header row */}
      <View style={styles.headerRow}>
        {/* Merge selection checkbox or status dot */}
        {onToggleMergeSelect ? (
          <TouchableOpacity
            style={styles.mergeCheckbox}
            onPress={() => onToggleMergeSelect(region.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <View style={[
              styles.mergeCheckboxInner,
              isMergeSelected && styles.mergeCheckboxChecked,
            ]}>
              {isMergeSelected && (
                <Ionicons name="checkmark" size={10} color="#FFF" />
              )}
            </View>
          </TouchableOpacity>
        ) : (
          <View style={styles.statusBadge}>
            <View style={[styles.statusDot, { backgroundColor: statusCfg.color }]} />
          </View>
        )}
        <View style={styles.headerInfo}>
          <Text style={styles.regionName} numberOfLines={1}>{region.name}</Text>
          <View style={styles.metaRow}>
            <Ionicons
              name={SOURCE_ICONS[region.sourceType] || 'map-outline' as any}
              size={10}
              color={TACTICAL.textMuted}
            />
            <Text style={styles.metaText}>
              {region.sourceType === 'route-corridor'
                ? `${region.corridorMiles || '?'} mi corridor`
                : 'Bounding box'}
              {' \u2014 '}
              {region.styleKey.toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Overlap indicator badge in header */}
        {hasOverlaps && !onToggleMergeSelect && (
          <View style={[styles.overlapBadgeSmall, { backgroundColor: getOverlapColor(maxOverlapPercent) + '18' }]}>
            <Ionicons name="copy-outline" size={9} color={getOverlapColor(maxOverlapPercent)} />
            <Text style={[styles.overlapBadgeSmallText, { color: getOverlapColor(maxOverlapPercent) }]}>
              {maxOverlapPercent}%
            </Text>
          </View>
        )}

        <View style={styles.actions}>
          {(region.status === 'pending' || region.status === 'cancelled') && (
            <TouchableOpacity
              onPress={() => onResume(region.id)}
              style={styles.actionBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="play" size={14} color={TACTICAL.amber} />
            </TouchableOpacity>
          )}
          {region.status === 'downloading' && (
            <TouchableOpacity
              onPress={() => onCancel(region.id)}
              style={styles.actionBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="pause" size={14} color="#FFB300" />
            </TouchableOpacity>
          )}
          {region.status === 'error' && (
            <TouchableOpacity
              onPress={() => onRetry(region.id)}
              style={styles.actionBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="refresh" size={14} color="#EF5350" />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => onDelete(region.id)}
            style={styles.actionBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="trash-outline" size={14} color={TACTICAL.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Progress bar */}
      {(isActive || region.status === 'partial') && (
        <View style={styles.progressSection}>
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${Math.min(percent, 100)}%`,
                  backgroundColor: isActive ? '#FFB300' : '#66BB6A',
                },
              ]}
            />
          </View>
          <View style={styles.progressInfo}>
            <Text style={styles.progressPercent}>{percent}%</Text>
            {displayProgress && displayProgress.speed > 0 && (
              <Text style={styles.progressSpeed}>
                {displayProgress.speed} tiles/s
              </Text>
            )}
            {displayProgress && displayProgress.eta > 0 && (
              <Text style={styles.progressETA}>
                {formatETA(displayProgress.eta)}
              </Text>
            )}
          </View>
          {/* Download size progress */}
          {displayProgress && (
            <View style={styles.downloadSizeRow}>
              <Text style={styles.downloadSizeText}>
                {formatSize(displayProgress.downloadedSizeMB)} / ~{formatSize(displayProgress.estimatedSizeMB)}
              </Text>
              <Text style={styles.downloadSizeText}>
                Z{displayProgress.currentZoom}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Status badge for complete */}
      {region.status === 'complete' && (
        <View style={styles.completeBadge}>
          <View style={styles.completeLeft}>
            <Ionicons name="checkmark-circle" size={11} color="#66BB6A" />
            <Text style={styles.completeText}>READY FOR OFFLINE USE</Text>
          </View>
          {/* Cache age badge */}
          <View style={[styles.freshnessBadge, { borderColor: freshnessColor + '40' }]}>
            <View style={[styles.freshnessDot, { backgroundColor: freshnessColor }]} />
            <Text style={[styles.freshnessText, { color: freshnessColor }]}>
              {formatAge(completedDate)}
            </Text>
          </View>
        </View>
      )}

      {region.status === 'error' && region.errorMessage && (
        <View style={styles.errorBadge}>
          <Ionicons name="alert-circle" size={11} color="#EF5350" />
          <Text style={styles.errorText}>{region.errorMessage}</Text>
        </View>
      )}

      {/* ═══════ OVERLAP WARNING SECTION ═══════ */}
      {hasOverlaps && (
        <View style={[styles.overlapSection, { borderColor: getOverlapColor(maxOverlapPercent) + '25' }]}>
          {/* Overlap header */}
          <View style={styles.overlapHeader}>
            <View style={[styles.overlapSeverityBadge, { backgroundColor: getOverlapColor(maxOverlapPercent) + '18' }]}>
              <Ionicons name="copy-outline" size={10} color={getOverlapColor(maxOverlapPercent)} />
              <Text style={[styles.overlapSeverityText, { color: getOverlapColor(maxOverlapPercent) }]}>
                {getOverlapLabel(maxOverlapPercent)} OVERLAP
              </Text>
            </View>
            {totalWastedMB > 0 && (
              <View style={styles.wastedBadge}>
                <Ionicons name="warning-outline" size={8} color="#FFB300" />
                <Text style={styles.wastedText}>~{formatSize(totalWastedMB)} wasted</Text>
              </View>
            )}
          </View>

          {/* Individual overlap entries */}
          {overlaps!.slice(0, 3).map((overlap) => {
            const color = getOverlapColor(overlap.overlapPercent);
            return (
              <View key={overlap.otherRegionId} style={styles.overlapEntry}>
                <View style={styles.overlapEntryLeft}>
                  <View style={[styles.overlapBarContainer]}>
                    <View style={[styles.overlapBar, { width: `${Math.min(overlap.overlapPercent, 100)}%`, backgroundColor: color }]} />
                  </View>
                  <Text style={styles.overlapEntryName} numberOfLines={1}>
                    {overlap.otherRegionName}
                  </Text>
                </View>
                <View style={styles.overlapEntryRight}>
                  <Text style={[styles.overlapEntryPercent, { color }]}>
                    {overlap.overlapPercent}%
                  </Text>
                  {overlap.sharedTileEstimate > 0 && (
                    <Text style={styles.overlapEntryTiles}>
                      {overlap.sharedTileEstimate.toLocaleString()} tiles
                    </Text>
                  )}
                </View>
              </View>
            );
          })}

          {overlaps!.length > 3 && (
            <Text style={styles.overlapMore}>
              +{overlaps!.length - 3} more overlap{overlaps!.length - 3 > 1 ? 's' : ''}
            </Text>
          )}

          {/* Merge action button */}
          {onMerge && overlaps!.some(o => o.zoomOverlap) && (
            <TouchableOpacity
              style={styles.mergeBtn}
              onPress={() => {
                const ids = [region.id, ...overlaps!.filter(o => o.zoomOverlap).map(o => o.otherRegionId)];
                onMerge(ids);
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="git-merge-outline" size={11} color="#CE93D8" />
              <Text style={styles.mergeBtnText}>MERGE REGIONS</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ═══════ FRESHNESS VERIFICATION SECTION ═══════ */}
      {showFreshnessSection && (
        <View style={[styles.freshnessSection, { borderColor: freshCfg.color + '25' }]}>
          {/* Freshness status row */}
          <View style={styles.freshnessStatusRow}>
            <View style={[styles.freshnessStatusBadge, { backgroundColor: freshCfg.color + freshCfg.bgAlpha }]}>
              {isCheckingFreshness ? (
                <ActivityIndicator size={9} color={freshCfg.color} />
              ) : (
                <Ionicons name={freshCfg.icon as any} size={10} color={freshCfg.color} />
              )}
              <Text style={[styles.freshnessStatusText, { color: freshCfg.color }]}>
                {freshCfg.label}
              </Text>
            </View>

            {/* Last verified timestamp */}
            <View style={styles.lastVerifiedRow}>
              <Ionicons name="time-outline" size={8} color={TACTICAL.textMuted} />
              <Text style={styles.lastVerifiedText}>
                {region.lastVerifiedAt
                  ? `Verified ${formatAge(region.lastVerifiedAt)}`
                  : 'Never verified'}
              </Text>
            </View>
          </View>

          {/* Update details (when update available) */}
          {hasUpdate && region.freshnessChangePercent != null && (
            <View style={styles.updateDetailRow}>
              <Ionicons name="information-circle-outline" size={10} color="#FFB300" />
              <Text style={styles.updateDetailText}>
                ~{region.freshnessChangePercent}% of sampled tiles have upstream changes
                {region.updatedTilesAvailable != null && region.updatedTilesAvailable > 0
                  ? ` (${region.updatedTilesAvailable} changed)`
                  : ''}
              </Text>
            </View>
          )}

          {/* Freshness action buttons */}
          <View style={styles.freshnessActions}>
            {/* Check button */}
            {onCheckFreshness && !isRefreshing && (
              <TouchableOpacity
                style={[
                  styles.freshnessActionBtn,
                  isCheckingFreshness && styles.freshnessActionBtnDisabled,
                ]}
                onPress={() => onCheckFreshness(region.id)}
                disabled={isCheckingFreshness}
                activeOpacity={0.8}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                {isCheckingFreshness ? (
                  <ActivityIndicator size={9} color="#64B5F6" />
                ) : (
                  <Ionicons name="sync-outline" size={10} color="#64B5F6" />
                )}
                <Text style={[styles.freshnessActionText, { color: '#64B5F6' }]}>
                  {isCheckingFreshness ? 'CHECKING' : 'CHECK'}
                </Text>
              </TouchableOpacity>
            )}

            {/* Update/Refresh button (shown when updates available) */}
            {hasUpdate && onRefresh && !isCheckingFreshness && (
              <TouchableOpacity
                style={[
                  styles.freshnessActionBtn,
                  styles.freshnessUpdateBtn,
                  isRefreshing && styles.freshnessActionBtnDisabled,
                ]}
                onPress={() => onRefresh(region.id)}
                disabled={isRefreshing}
                activeOpacity={0.8}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                {isRefreshing ? (
                  <ActivityIndicator size={9} color="#FFB300" />
                ) : (
                  <Ionicons name="cloud-download-outline" size={10} color="#FFB300" />
                )}
                <Text style={[styles.freshnessActionText, { color: '#FFB300' }]}>
                  {isRefreshing ? 'UPDATING' : 'UPDATE'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Ionicons name="grid-outline" size={10} color={TACTICAL.textMuted} />
          <Text style={styles.statText}>
            {region.downloadedTiles.toLocaleString()}/{region.tileCount.toLocaleString()} tiles
          </Text>
        </View>
        <View style={styles.statItem}>
          <Ionicons name="resize-outline" size={10} color={TACTICAL.textMuted} />
          <Text style={styles.statText}>{formatBounds(region.bounds)}</Text>
        </View>
        <View style={styles.statItem}>
          <Ionicons name="search-outline" size={10} color={TACTICAL.textMuted} />
          <Text style={styles.statText}>Z{region.zoomMin}\u2013{region.zoomMax}</Text>
        </View>
        <View style={styles.statItem}>
          <Ionicons name="cloud-download-outline" size={10} color={TACTICAL.textMuted} />
          <Text style={styles.statText}>{formatSize(actualSize)}</Text>
        </View>
      </View>

      {/* Freshness footer for non-complete regions */}
      {region.status !== 'complete' && region.status !== 'downloading' && region.status !== 'partial' && (
        <View style={styles.freshnessFooter}>
          <Ionicons name="time-outline" size={9} color={TACTICAL.textMuted} />
          <Text style={styles.freshnessFooterText}>
            Created {formatAge(region.downloadedAt)}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: TACTICAL.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    padding: DENSITY.cardPad,
    gap: 10,
  },
  cardMergeSelected: {
    backgroundColor: 'rgba(206,147,216,0.06)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusBadge: {
    width: 18,
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  headerInfo: {
    flex: 1,
    gap: 2,
  },
  regionName: {
    ...TYPO.T3,
    color: TACTICAL.text,
    fontSize: 12,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    ...TYPO.B2,
    fontSize: 9,
    color: TACTICAL.textMuted,
  },
  actions: {
    flexDirection: 'row',
    gap: 6,
  },
  actionBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  progressSection: {
    gap: 4,
  },
  progressBarBg: {
    height: 4,
    backgroundColor: 'rgba(62,79,60,0.15)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  progressPercent: {
    ...TYPO.K3,
    fontSize: 10,
    color: '#FFB300',
  },
  progressSpeed: {
    ...TYPO.B2,
    fontSize: 9,
    color: TACTICAL.textMuted,
  },
  progressETA: {
    ...TYPO.B2,
    fontSize: 9,
    color: TACTICAL.textMuted,
    flex: 1,
    textAlign: 'right',
  },
  downloadSizeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  downloadSizeText: {
    ...TYPO.B2,
    fontSize: 8,
    color: TACTICAL.textMuted,
  },
  completeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  completeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  completeText: {
    ...TYPO.U2,
    fontSize: 8,
    color: '#66BB6A',
  },
  freshnessBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  freshnessDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  freshnessText: {
    ...TYPO.U2,
    fontSize: 7,
    letterSpacing: 1,
  },
  errorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  errorText: {
    ...TYPO.B2,
    fontSize: 9,
    color: '#EF5350',
  },

  // ── Overlap warning section ───────────────────────────
  overlapSection: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    gap: 6,
    backgroundColor: 'rgba(206,147,216,0.03)',
  },
  overlapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  overlapSeverityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
  },
  overlapSeverityText: {
    ...TYPO.U2,
    fontSize: 7,
    letterSpacing: 1.5,
  },
  overlapBadgeSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  overlapBadgeSmallText: {
    ...TYPO.U2,
    fontSize: 7,
    letterSpacing: 0.5,
  },
  wastedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  wastedText: {
    ...TYPO.B2,
    fontSize: 8,
    color: '#FFB300',
  },
  overlapEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  overlapEntryLeft: {
    flex: 1,
    gap: 3,
  },
  overlapBarContainer: {
    height: 3,
    backgroundColor: 'rgba(62,79,60,0.12)',
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  overlapBar: {
    height: '100%',
    borderRadius: 1.5,
  },
  overlapEntryName: {
    ...TYPO.B2,
    fontSize: 9,
    color: TACTICAL.textMuted,
  },
  overlapEntryRight: {
    alignItems: 'flex-end',
    gap: 1,
  },
  overlapEntryPercent: {
    ...TYPO.K3,
    fontSize: 10,
  },
  overlapEntryTiles: {
    ...TYPO.B2,
    fontSize: 7,
    color: TACTICAL.textMuted,
  },
  overlapMore: {
    ...TYPO.B2,
    fontSize: 8,
    color: TACTICAL.textMuted,
    textAlign: 'center',
  },
  mergeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CE93D8' + '30',
    backgroundColor: 'rgba(206,147,216,0.06)',
  },
  mergeBtnText: {
    ...TYPO.U2,
    fontSize: 8,
    color: '#CE93D8',
    letterSpacing: 1.5,
  },

  // ── Merge selection checkbox ──────────────────────────
  mergeCheckbox: {
    width: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mergeCheckboxInner: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: TACTICAL.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mergeCheckboxChecked: {
    backgroundColor: '#CE93D8',
    borderColor: '#CE93D8',
  },

  // ── Freshness verification section ────────────────────
  freshnessSection: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    gap: 6,
    backgroundColor: 'rgba(62,79,60,0.04)',
  },
  freshnessStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  freshnessStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
  },
  freshnessStatusText: {
    ...TYPO.U2,
    fontSize: 7,
    letterSpacing: 1.5,
  },
  lastVerifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  lastVerifiedText: {
    ...TYPO.B2,
    fontSize: 8,
    color: TACTICAL.textMuted,
  },
  updateDetailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
    paddingLeft: 2,
  },
  updateDetailText: {
    ...TYPO.B2,
    fontSize: 9,
    color: '#FFB300',
    flex: 1,
    lineHeight: 13,
  },
  freshnessActions: {
    flexDirection: 'row',
    gap: 6,
  },
  freshnessActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  freshnessUpdateBtn: {
    borderColor: '#FFB300' + '30',
    backgroundColor: 'rgba(255,179,0,0.06)',
  },
  freshnessActionBtnDisabled: {
    opacity: 0.5,
  },
  freshnessActionText: {
    ...TYPO.U2,
    fontSize: 7,
    letterSpacing: 1.5,
  },

  // ── Stats ─────────────────────────────────────────────
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    ...TYPO.B2,
    fontSize: 9,
    color: TACTICAL.textMuted,
  },
  freshnessFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingTop: 2,
    borderTopWidth: 1,
    borderTopColor: TACTICAL.border,
  },
  freshnessFooterText: {
    ...TYPO.B2,
    fontSize: 8,
    color: TACTICAL.textMuted,
  },
});



