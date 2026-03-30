/**
 * ═══════════════════════════════════════════════════════════
 * ECS OFFLINE EXPEDITION DATA PANEL — Phase 6B/6D
 * ═══════════════════════════════════════════════════════════
 *
 * Settings panel for managing offline expedition data.
 * Allows users to:
 *   - Browse available expedition regions
 *   - Download regions for offline use
 *   - Track download progress
 *   - View storage usage per region
 *   - Remove downloaded regions
 *   - Update regions when new data is available
 *   - Resume interrupted downloads
 *
 * Phase 6D additions:
 *   - Integrity status badges on region cards
 *   - Stale data warnings with days-since-update
 *   - Validate button for manual integrity checks
 *   - Integrity issue count in storage summary
 *   - Stale region count in storage summary
 *   - Enhanced error messages for integrity failures
 *
 * Integrates with:
 *   - offlineExpeditionDbEngine: Download management
 *   - offlineExpeditionDbStore: State and storage
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { useTheme } from '../../context/ThemeContext';
import { SPACING, RADIUS } from '../../lib/theme';
import { offlineExpeditionDbEngine } from '../../lib/offlineExpeditionDbEngine';
import { offlineExpeditionDbStore } from '../../lib/offlineExpeditionDbStore';
import type {
  OfflineExpeditionRegion,
  OfflineDownloadProgress,
  DatasetCategory,
  DatasetIntegrityStatus,
} from '../../lib/offlineExpeditionDbTypes';
import {
  DOWNLOAD_STATUS_DISPLAY,
  DATASET_CATEGORY_DISPLAY,
  DATASET_CATEGORIES,
  INTEGRITY_STATUS_DISPLAY,
} from '../../lib/offlineExpeditionDbTypes';


interface Props {
  onToast?: (msg: string) => void;
}

export default function OfflineExpeditionDataPanel({ onToast }: Props) {
  const { colors } = useTheme();

  const [regions, setRegions] = useState<OfflineExpeditionRegion[]>([]);
  const [activeDownload, setActiveDownload] = useState<OfflineDownloadProgress | null>(null);
  const [expandedRegion, setExpandedRegion] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Initialize engine and load regions
  useEffect(() => {
    try {
      if (!offlineExpeditionDbEngine.isInitialized()) {
        offlineExpeditionDbEngine.initialize();
      }
    } catch {}
    _refreshRegions();
  }, []);

  // Subscribe to store changes
  useEffect(() => {
    const unsub = offlineExpeditionDbStore.subscribe(() => {
      _refreshRegions();
    });
    return unsub;
  }, []);

  const _refreshRegions = useCallback(() => {
    try {
      setRegions(offlineExpeditionDbEngine.getAvailableRegions());
      setActiveDownload(offlineExpeditionDbStore.getActiveDownload());
    } catch {}
  }, []);

  // ── Download handlers ──────────────────────────────────

  const handleDownload = useCallback(async (regionId: string) => {
    const region = offlineExpeditionDbStore.getRegion(regionId);
    if (!region) return;

    onToast?.(`Downloading ${region.region_name}\u2026`);

    const success = await offlineExpeditionDbEngine.downloadRegion(
      regionId,
      (progress) => {
        setActiveDownload({ ...progress });
      },
    );

    if (success) {
      onToast?.(`${region.region_name} downloaded successfully`);
    } else if (offlineExpeditionDbStore.getDownloadQueue().some(q => q.region_id === regionId)) {
      onToast?.(`${region.region_name} added to download queue`);
    }

    _refreshRegions();
  }, [onToast, _refreshRegions]);

  const handleUpdate = useCallback(async (regionId: string) => {
    const region = offlineExpeditionDbStore.getRegion(regionId);
    if (!region) return;

    onToast?.(`Updating ${region.region_name}\u2026`);

    const success = await offlineExpeditionDbEngine.updateRegion(
      regionId,
      (progress) => {
        setActiveDownload({ ...progress });
      },
    );

    if (success) {
      onToast?.(`${region.region_name} updated successfully`);
    }

    _refreshRegions();
  }, [onToast, _refreshRegions]);

  const handleResume = useCallback(async (regionId: string) => {
    const region = offlineExpeditionDbStore.getRegion(regionId);
    if (!region) return;

    onToast?.(`Resuming ${region.region_name}\u2026`);

    const success = await offlineExpeditionDbEngine.resumeDownload(
      regionId,
      (progress) => {
        setActiveDownload({ ...progress });
      },
    );

    if (success) {
      onToast?.(`${region.region_name} download resumed`);
    }

    _refreshRegions();
  }, [onToast, _refreshRegions]);

  const handleRemove = useCallback((regionId: string) => {
    const region = offlineExpeditionDbStore.getRegion(regionId);
    if (!region) return;

    Alert.alert(
      'Remove Region Data',
      `Remove all offline data for "${region.region_name}"?\n\nThis will free ${region.actual_size_mb || region.estimated_size_mb} MB of storage.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            offlineExpeditionDbEngine.removeRegion(regionId);
            onToast?.(`${region.region_name} data removed`);
            _refreshRegions();
          },
        },
      ],
    );
  }, [onToast, _refreshRegions]);

  // Phase 6D: Validate integrity
  const handleValidate = useCallback((regionId: string) => {
    const region = offlineExpeditionDbStore.getRegion(regionId);
    if (!region) return;

    const result = offlineExpeditionDbEngine.validateRegion(regionId);
    if (result.integrity_status === 'valid') {
      onToast?.(`${region.region_name}: All datasets validated`);
    } else if (result.integrity_status === 'stale') {
      onToast?.(`${region.region_name}: Data is stale \u2014 consider updating`);
    } else {
      onToast?.(`${region.region_name}: ${result.summary}`);
    }
    _refreshRegions();
  }, [onToast, _refreshRegions]);

  // ── Storage summary ────────────────────────────────────

  const stats = offlineExpeditionDbEngine.getStorageStats();
  const downloadedRegions = regions.filter(
    r => r.download_status === 'downloaded' || r.download_status === 'update_available'
  );
  const availableRegions = regions.filter(
    r => r.download_status === 'not_downloaded'
  );
  const errorRegions = regions.filter(
    r => r.download_status === 'error'
  );

  // ── Render helpers ─────────────────────────────────────

  const renderStatusBadge = (status: OfflineExpeditionRegion['download_status']) => {
    const display = DOWNLOAD_STATUS_DISPLAY[status];
    return (
      <View style={[s.statusBadge, { backgroundColor: display.color + '18', borderColor: display.color + '40' }]}>
        <Ionicons name={display.icon as any} size={11} color={display.color} />
        <Text style={[s.statusBadgeText, { color: display.color }]}>{display.shortLabel}</Text>
      </View>
    );
  };

  // Phase 6D: Integrity badge
  const renderIntegrityBadge = (integrityStatus?: DatasetIntegrityStatus) => {
    if (!integrityStatus || integrityStatus === 'unchecked') return null;
    const display = INTEGRITY_STATUS_DISPLAY[integrityStatus];
    return (
      <View style={[s.statusBadge, { backgroundColor: display.color + '18', borderColor: display.color + '40' }]}>
        <Ionicons name={display.icon as any} size={11} color={display.color} />
        <Text style={[s.statusBadgeText, { color: display.color }]}>{display.shortLabel}</Text>
      </View>
    );
  };

  const renderCategoryCounts = (region: OfflineExpeditionRegion) => {
    return (
      <View style={s.categoryGrid}>
        {DATASET_CATEGORIES.map(cat => {
          const count = region.category_counts[cat] || 0;
          if (count === 0) return null;
          const display = DATASET_CATEGORY_DISPLAY[cat];
          return (
            <View key={cat} style={[s.categoryChip, { backgroundColor: display.color + '12', borderColor: display.color + '30' }]}>
              <Ionicons name={display.icon as any} size={10} color={display.color} />
              <Text style={[s.categoryChipText, { color: display.color }]}>{count}</Text>
            </View>
          );
        })}
      </View>
    );
  };

  const renderProgressBar = (progress: OfflineDownloadProgress) => {
    return (
      <View style={s.progressContainer}>
        <View style={[s.progressTrack, { backgroundColor: colors.border }]}>
          <View
            style={[
              s.progressFill,
              {
                backgroundColor: progress.status === 'error' ? '#EF5350'
                  : progress.status === 'validating' ? '#4CAF50'
                  : '#2196F3',
                width: `${Math.max(2, progress.percent)}%`,
              },
            ]}
          />
        </View>
        <View style={s.progressInfo}>
          <Text style={[s.progressMessage, { color: colors.textSecondary }]}>
            {progress.message}
          </Text>
          <Text style={[s.progressPercent, { color: '#2196F3' }]}>
            {progress.percent}%
          </Text>
        </View>
      </View>
    );
  };

  // Phase 6D: Compute days since update
  const getDaysSinceUpdate = (region: OfflineExpeditionRegion): number | null => {
    if (!region.last_updated) return null;
    const age = Date.now() - new Date(region.last_updated).getTime();
    return Math.floor(age / (24 * 60 * 60 * 1000));
  };

  const renderRegionCard = (region: OfflineExpeditionRegion) => {
    const isExpanded = expandedRegion === region.region_id;
    const isActiveDownload = activeDownload?.region_id === region.region_id;
    const isDownloaded = region.download_status === 'downloaded' || region.download_status === 'update_available';
    const isError = region.download_status === 'error';
    const isDownloading = region.download_status === 'downloading' || region.download_status === 'updating';
    const canResume = isError && (region.completed_categories || []).length > 0;
    const sizeMb = region.actual_size_mb || region.estimated_size_mb;
    const daysSince = getDaysSinceUpdate(region);
    const isStale = region.integrity_status === 'stale';
    const isInvalid = region.integrity_status === 'invalid';

    return (
      <View
        key={region.region_id}
        style={[s.regionCard, { backgroundColor: colors.bgCard, borderColor: isInvalid ? '#EF535040' : isStale ? '#FFB30040' : colors.border }]}
      >
        {/* Header */}
        <TouchableOpacity
          style={s.regionHeader}
          onPress={() => setExpandedRegion(isExpanded ? null : region.region_id)}
          activeOpacity={0.7}
        >
          <View style={s.regionHeaderLeft}>
            <Text style={[s.regionName, { color: colors.textPrimary }]}>
              {region.region_name}
            </Text>
            <View style={s.regionMeta}>
              {renderStatusBadge(region.download_status)}
              {isDownloaded && renderIntegrityBadge(region.integrity_status)}
              <Text style={[s.regionSize, { color: colors.textMuted }]}>
                {sizeMb > 0 ? `${sizeMb} MB` : `~${region.estimated_size_mb} MB`}
              </Text>
              <Text style={[s.regionEntries, { color: colors.textMuted }]}>
                {region.total_entries} entries
              </Text>
            </View>
          </View>
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.textMuted}
          />
        </TouchableOpacity>

        {/* Phase 6D: Stale data warning */}
        {isStale && daysSince != null && (
          <View style={[s.staleBanner, { backgroundColor: '#FFB30010', borderColor: '#FFB30030' }]}>
            <Ionicons name="time-outline" size={13} color="#FFB300" />
            <Text style={[s.staleText, { color: '#FFB300' }]}>
              Data is {daysSince} days old \u2014 consider updating
            </Text>
          </View>
        )}

        {/* Active download progress */}
        {isActiveDownload && activeDownload && (
          renderProgressBar(activeDownload)
        )}

        {/* Downloading indicator (from queue) */}
        {isDownloading && !isActiveDownload && (
          <View style={s.downloadingIndicator}>
            <ActivityIndicator size="small" color="#2196F3" />
            <Text style={[s.downloadingText, { color: '#2196F3' }]}>
              Downloading\u2026
            </Text>
          </View>
        )}

        {/* Expanded details */}
        {isExpanded && (
          <View style={[s.regionDetails, { borderTopColor: colors.border }]}>
            {/* Description */}
            {region.description && (
              <Text style={[s.regionDesc, { color: colors.textSecondary }]}>
                {region.description}
              </Text>
            )}

            {/* Category breakdown */}
            {renderCategoryCounts(region)}

            {/* Version info */}
            {isDownloaded && (
              <View style={s.versionRow}>
                <Text style={[s.versionLabel, { color: colors.textMuted }]}>
                  Dataset v{region.dataset_version}
                </Text>
                {region.last_updated && (
                  <Text style={[s.versionLabel, { color: colors.textMuted }]}>
                    Updated: {new Date(region.last_updated).toLocaleDateString()}
                  </Text>
                )}
              </View>
            )}

            {/* Phase 6D: Integrity info */}
            {isDownloaded && region.integrity_checked_at && (
              <View style={s.versionRow}>
                <Text style={[s.versionLabel, { color: colors.textMuted }]}>
                  Integrity: {INTEGRITY_STATUS_DISPLAY[region.integrity_status || 'unchecked'].label}
                </Text>
                <Text style={[s.versionLabel, { color: colors.textMuted }]}>
                  Checked: {new Date(region.integrity_checked_at).toLocaleDateString()}
                </Text>
              </View>
            )}

            {/* Error message */}
            {isError && region.error_message && (
              <View style={[s.errorBanner, { backgroundColor: '#EF535010', borderColor: '#EF535030' }]}>
                <Ionicons name="alert-circle-outline" size={14} color="#EF5350" />
                <Text style={[s.errorText, { color: '#EF5350' }]}>
                  {region.error_message}
                </Text>
              </View>
            )}

            {/* Action buttons */}
            <View style={s.actionRow}>
              {region.download_status === 'not_downloaded' && (
                <TouchableOpacity
                  style={[s.actionBtn, { backgroundColor: '#2196F3' }]}
                  onPress={() => handleDownload(region.region_id)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="cloud-download-outline" size={14} color="#fff" />
                  <Text style={s.actionBtnText}>Download</Text>
                </TouchableOpacity>
              )}

              {region.download_status === 'update_available' && (
                <TouchableOpacity
                  style={[s.actionBtn, { backgroundColor: '#42A5F5' }]}
                  onPress={() => handleUpdate(region.region_id)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="arrow-up-circle-outline" size={14} color="#fff" />
                  <Text style={s.actionBtnText}>Update</Text>
                </TouchableOpacity>
              )}

              {canResume && (
                <TouchableOpacity
                  style={[s.actionBtn, { backgroundColor: '#FFB300' }]}
                  onPress={() => handleResume(region.region_id)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="play-circle-outline" size={14} color="#000" />
                  <Text style={[s.actionBtnText, { color: '#000' }]}>Resume</Text>
                </TouchableOpacity>
              )}

              {isError && !canResume && (
                <TouchableOpacity
                  style={[s.actionBtn, { backgroundColor: '#EF5350' }]}
                  onPress={() => handleDownload(region.region_id)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="refresh-outline" size={14} color="#fff" />
                  <Text style={s.actionBtnText}>Retry</Text>
                </TouchableOpacity>
              )}

              {isDownloaded && (
                <>
                  {/* Phase 6D: Validate button */}
                  <TouchableOpacity
                    style={[s.actionBtnOutline, { borderColor: '#4CAF5050' }]}
                    onPress={() => handleValidate(region.region_id)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="shield-checkmark-outline" size={14} color="#4CAF50" />
                    <Text style={[s.actionBtnOutlineText, { color: '#4CAF50' }]}>Validate</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.actionBtn, { backgroundColor: '#4CAF50' }]}
                    onPress={() => handleUpdate(region.region_id)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="sync-outline" size={14} color="#fff" />
                    <Text style={s.actionBtnText}>Refresh</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.actionBtnOutline, { borderColor: '#EF535050' }]}
                    onPress={() => handleRemove(region.region_id)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="trash-outline" size={14} color="#EF5350" />
                    <Text style={[s.actionBtnOutlineText, { color: '#EF5350' }]}>Remove</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <View>
      {/* Storage Summary */}
      <View style={[s.summaryCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <View style={s.summaryRow}>
          <View style={s.summaryItem}>
            <Text style={[s.summaryValue, { color: colors.gold }]}>{stats.downloaded_regions}</Text>
            <Text style={[s.summaryLabel, { color: colors.textMuted }]}>REGIONS</Text>
          </View>
          <View style={[s.summaryDivider, { backgroundColor: colors.border }]} />
          <View style={s.summaryItem}>
            <Text style={[s.summaryValue, { color: colors.gold }]}>{stats.total_entries}</Text>
            <Text style={[s.summaryLabel, { color: colors.textMuted }]}>ENTRIES</Text>
          </View>
          <View style={[s.summaryDivider, { backgroundColor: colors.border }]} />
          <View style={s.summaryItem}>
            <Text style={[s.summaryValue, { color: colors.gold }]}>{stats.storage_mb}</Text>
            <Text style={[s.summaryLabel, { color: colors.textMuted }]}>MB USED</Text>
          </View>
          {stats.updates_available > 0 && (
            <>
              <View style={[s.summaryDivider, { backgroundColor: colors.border }]} />
              <View style={s.summaryItem}>
                <Text style={[s.summaryValue, { color: '#42A5F5' }]}>{stats.updates_available}</Text>
                <Text style={[s.summaryLabel, { color: colors.textMuted }]}>UPDATES</Text>
              </View>
            </>
          )}
        </View>

        {/* Phase 6D: Integrity/stale indicators */}
        {(stats.integrity_issues > 0 || stats.stale_regions > 0) && (
          <View style={s.summaryWarnings}>
            {stats.integrity_issues > 0 && (
              <View style={[s.warningChip, { backgroundColor: '#EF535012', borderColor: '#EF535030' }]}>
                <Ionicons name="alert-circle-outline" size={11} color="#EF5350" />
                <Text style={[s.warningChipText, { color: '#EF5350' }]}>
                  {stats.integrity_issues} integrity issue{stats.integrity_issues > 1 ? 's' : ''}
                </Text>
              </View>
            )}
            {stats.stale_regions > 0 && (
              <View style={[s.warningChip, { backgroundColor: '#FFB30012', borderColor: '#FFB30030' }]}>
                <Ionicons name="time-outline" size={11} color="#FFB300" />
                <Text style={[s.warningChipText, { color: '#FFB300' }]}>
                  {stats.stale_regions} stale region{stats.stale_regions > 1 ? 's' : ''}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Downloaded Regions */}
      {downloadedRegions.length > 0 && (
        <>
          <Text style={[s.sectionLabel, { color: colors.gold, borderBottomColor: colors.goldBorder }]}>
            DOWNLOADED REGIONS
          </Text>
          {downloadedRegions.map(r => renderRegionCard(r))}
        </>
      )}

      {/* Error Regions */}
      {errorRegions.length > 0 && (
        <>
          <Text style={[s.sectionLabel, { color: '#EF5350', borderBottomColor: '#EF535030' }]}>
            INTERRUPTED DOWNLOADS
          </Text>
          {errorRegions.map(r => renderRegionCard(r))}
        </>
      )}

      {/* Available Regions */}
      {availableRegions.length > 0 && (
        <>
          <Text style={[s.sectionLabel, { color: colors.gold, borderBottomColor: colors.goldBorder }]}>
            AVAILABLE REGIONS
          </Text>
          {availableRegions.map(r => renderRegionCard(r))}
        </>
      )}

      {/* Queue info */}
      {stats.queue_length > 0 && (
        <View style={[s.queueBanner, { backgroundColor: '#2196F310', borderColor: '#2196F330' }]}>
          <Ionicons name="time-outline" size={14} color="#2196F3" />
          <Text style={[s.queueText, { color: '#2196F3' }]}>
            {stats.queue_length} download{stats.queue_length > 1 ? 's' : ''} queued
          </Text>
        </View>
      )}

      {/* Empty state */}
      {regions.length === 0 && (
        <View style={s.emptyState}>
          <Ionicons name="cloud-download-outline" size={40} color={colors.textMuted} />
          <Text style={[s.emptyText, { color: colors.textSecondary }]}>
            No expedition regions available
          </Text>
          <Text style={[s.emptySubtext, { color: colors.textMuted }]}>
            Regions will appear when the Discovery engine loads trail data.
          </Text>
        </View>
      )}
    </View>
  );
}


// ── Styles ───────────────────────────────────────────────

const s = StyleSheet.create({
  summaryCard: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '800',
    fontFamily: 'Courier',
  },
  summaryLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: 2,
  },
  summaryDivider: {
    width: 1,
    height: 28,
  },
  summaryWarnings: {
    flexDirection: 'row',
    gap: 6,
    marginTop: SPACING.sm,
    justifyContent: 'center',
  },
  warningChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
  },
  warningChipText: {
    fontSize: 10,
    fontWeight: '600',
  },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
    borderBottomWidth: 1,
    paddingBottom: 6,
  },

  regionCard: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginBottom: SPACING.sm,
    overflow: 'hidden',
  },
  regionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.md,
  },
  regionHeaderLeft: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  regionName: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  regionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  regionSize: {
    fontSize: 11,
    fontFamily: 'Courier',
  },
  regionEntries: {
    fontSize: 11,
    fontFamily: 'Courier',
  },

  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },

  staleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  staleText: {
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },

  progressContainer: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  progressMessage: {
    fontSize: 10,
    flex: 1,
  },
  progressPercent: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'Courier',
  },

  downloadingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  downloadingText: {
    fontSize: 11,
    fontWeight: '600',
  },

  regionDetails: {
    borderTopWidth: 1,
    padding: SPACING.md,
  },
  regionDesc: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: SPACING.sm,
  },

  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: SPACING.sm,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  categoryChipText: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'Courier',
  },

  versionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  versionLabel: {
    fontSize: 10,
    fontFamily: 'Courier',
  },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: SPACING.sm,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    marginBottom: SPACING.sm,
  },
  errorText: {
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },

  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: SPACING.xs,
    flexWrap: 'wrap',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  actionBtnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  actionBtnOutlineText: {
    fontSize: 12,
    fontWeight: '700',
  },

  queueBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: SPACING.md,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    marginTop: SPACING.sm,
  },
  queueText: {
    fontSize: 12,
    fontWeight: '600',
  },

  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
});




