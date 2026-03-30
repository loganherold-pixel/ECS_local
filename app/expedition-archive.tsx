// ============================================================
// EXPEDITION ARCHIVE — Past Expeditions
// ============================================================
// Dedicated archive screen for completed and archived expeditions.
// Replaces the previous redirect to the intelligence tab.
//
// Features:
//   - Summary stats: total expeditions, total days, most common terrain
//   - Search bar filtering by title
//   - Filters: status (completed/archived), terrain type, date range
//   - FlatList of expedition cards
//   - Each card: title, terrain badge, duration, readiness score, completion date
//   - Tap navigates to expedition-detail
// ============================================================

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  FlatList, TextInput, ActivityIndicator, Platform,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SafeIcon as Ionicons } from '../components/SafeIcon';

import { TACTICAL } from '../lib/theme';
import { useApp } from '../context/AppContext';

import TopoBackground from '../components/TopoBackground';

import { expeditionStore } from '../lib/expeditionCommandStore';
import type { EcsExpedition, EcsTerrain } from '../lib/expeditionTypes';
import { TERRAIN_OPTIONS } from '../lib/expeditionTypes';

const TAG = '[ARCHIVE]';
const { width: SCREEN_W } = Dimensions.get('window');

// ── Date range presets ──────────────────────────────────────
type DateRange = 'all' | '30d' | '90d' | '6m' | '1y';

const DATE_RANGES: { key: DateRange; label: string; days: number | null }[] = [
  { key: 'all', label: 'ALL TIME', days: null },
  { key: '30d', label: '30 DAYS', days: 30 },
  { key: '90d', label: '90 DAYS', days: 90 },
  { key: '6m', label: '6 MONTHS', days: 180 },
  { key: '1y', label: '1 YEAR', days: 365 },
];

// ── Status filter options ───────────────────────────────────
type StatusFilter = 'all' | 'completed' | 'archived';

const STATUS_FILTERS: { key: StatusFilter; label: string; icon: string }[] = [
  { key: 'all', label: 'ALL', icon: 'list-outline' },
  { key: 'completed', label: 'COMPLETED', icon: 'checkmark-circle-outline' },
  { key: 'archived', label: 'ARCHIVED', icon: 'archive-outline' },
];

// ── Terrain icon/color lookup ───────────────────────────────
function getTerrainMeta(terrain: string | null): { label: string; icon: string; color: string } {
  if (!terrain) return { label: 'UNKNOWN', icon: 'help-circle-outline', color: TACTICAL.textMuted };
  const found = TERRAIN_OPTIONS.find(t => t.value === terrain.toLowerCase());
  return found
    ? { label: found.label, icon: found.icon, color: found.color }
    : { label: terrain.toUpperCase(), icon: 'layers-outline', color: TACTICAL.textMuted };
}

// ── Format date ─────────────────────────────────────────────
function formatDate(dateStr: string | null): string {
  if (!dateStr) return '--';
  try {
    const d = new Date(dateStr);
    const mo = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
    const day = d.getDate();
    const yr = d.getFullYear();
    return `${mo} ${day}, ${yr}`;
  } catch {
    return '--';
  }
}

function formatDuration(days: number | null): string {
  if (days == null || days <= 0) return '--';
  if (days === 1) return '1 DAY';
  return `${days} DAYS`;
}

// ============================================================
// SUMMARY STATS CARD
// ============================================================
function SummaryStats({
  totalExpeditions,
  totalDays,
  mostCommonTerrain,
}: {
  totalExpeditions: number;
  totalDays: number;
  mostCommonTerrain: string | null;
}) {
  const terrainMeta = getTerrainMeta(mostCommonTerrain);

  return (
    <View style={styles.summaryCard}>
      <View style={styles.summaryRow}>
        {/* Total Expeditions */}
        <View style={styles.statBlock}>
          <View style={styles.statIconWrap}>
            <Ionicons name="flag-outline" size={14} color={TACTICAL.amber} />
          </View>
          <Text style={styles.statValue}>{totalExpeditions}</Text>
          <Text style={styles.statLabel}>EXPEDITIONS</Text>
        </View>

        {/* Divider */}
        <View style={styles.statDivider} />

        {/* Total Days */}
        <View style={styles.statBlock}>
          <View style={styles.statIconWrap}>
            <Ionicons name="calendar-outline" size={14} color={TACTICAL.amber} />
          </View>
          <Text style={styles.statValue}>{totalDays}</Text>
          <Text style={styles.statLabel}>DAYS IN FIELD</Text>
        </View>

        {/* Divider */}
        <View style={styles.statDivider} />

        {/* Most Common Terrain */}
        <View style={styles.statBlock}>
          <View style={styles.statIconWrap}>
            <Ionicons name={terrainMeta.icon as any} size={14} color={terrainMeta.color} />
          </View>
          <Text style={[styles.statValue, { color: terrainMeta.color, fontSize: 11 }]}>
            {mostCommonTerrain ? terrainMeta.label : 'N/A'}
          </Text>
          <Text style={styles.statLabel}>TOP TERRAIN</Text>
        </View>
      </View>
    </View>
  );
}

// ============================================================
// EXPEDITION CARD
// ============================================================
function ExpeditionCard({
  expedition,
  onPress,
}: {
  expedition: EcsExpedition;
  onPress: () => void;
}) {
  const terrainMeta = getTerrainMeta(expedition.terrain);
  const readiness = expedition.readiness_score;
  const readinessColor = readiness != null
    ? (readiness >= 80 ? '#4CAF50' : readiness >= 50 ? TACTICAL.amber : '#E53935')
    : TACTICAL.textMuted;

  const isArchived = expedition.status === 'archived';
  const completionDate = expedition.end_at || expedition.updated_at;

  return (
    <TouchableOpacity
      style={styles.expCard}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {/* Left accent bar */}
      <View style={[styles.expCardAccent, { backgroundColor: terrainMeta.color }]} />

      <View style={styles.expCardBody}>
        {/* Top row: Title + Status */}
        <View style={styles.expCardTopRow}>
          <Text style={styles.expCardTitle} numberOfLines={1}>
            {expedition.title || 'Untitled Expedition'}
          </Text>
          <View style={[
            styles.expStatusBadge,
            { borderColor: isArchived ? 'rgba(138,138,133,0.3)' : 'rgba(76,175,80,0.3)' },
          ]}>
            <Ionicons
              name={isArchived ? 'archive-outline' : 'checkmark-circle-outline'}
              size={10}
              color={isArchived ? TACTICAL.textMuted : '#4CAF50'}
            />
            <Text style={[
              styles.expStatusText,
              { color: isArchived ? TACTICAL.textMuted : '#4CAF50' },
            ]}>
              {isArchived ? 'ARCHIVED' : 'COMPLETED'}
            </Text>
          </View>
        </View>

        {/* Info row: Terrain badge + Duration + Readiness */}
        <View style={styles.expCardInfoRow}>
          {/* Terrain badge */}
          <View style={[styles.terrainBadge, { borderColor: `${terrainMeta.color}40` }]}>
            <Ionicons name={terrainMeta.icon as any} size={11} color={terrainMeta.color} />
            <Text style={[styles.terrainBadgeText, { color: terrainMeta.color }]}>
              {terrainMeta.label}
            </Text>
          </View>

          {/* Duration */}
          {expedition.duration_days != null && expedition.duration_days > 0 && (
            <View style={styles.infoChip}>
              <Ionicons name="time-outline" size={11} color={TACTICAL.textMuted} />
              <Text style={styles.infoChipText}>
                {formatDuration(expedition.duration_days)}
              </Text>
            </View>
          )}

          {/* Readiness score */}
          {readiness != null && (
            <View style={[styles.infoChip, { borderColor: `${readinessColor}30` }]}>
              <Ionicons name="shield-checkmark-outline" size={11} color={readinessColor} />
              <Text style={[styles.infoChipText, { color: readinessColor }]}>
                {readiness}%
              </Text>
            </View>
          )}
        </View>

        {/* Bottom row: Completion date + chevron */}
        <View style={styles.expCardBottomRow}>
          <View style={styles.dateRow}>
            <Ionicons name="calendar-outline" size={11} color={TACTICAL.textMuted} />
            <Text style={styles.dateText}>
              {formatDate(completionDate)}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={TACTICAL.textMuted} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ============================================================
// MAIN ARCHIVE SCREEN
// ============================================================
export default function ExpeditionArchiveScreen() {
  const router = useRouter();
  const { user, isOnline, showToast } = useApp();

  // ── State ──────────────────────────────────────────────────
  const [allExpeditions, setAllExpeditions] = useState<EcsExpedition[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [terrainFilter, setTerrainFilter] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>('all');
  const [showFilters, setShowFilters] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  // ── Fetch expeditions ──────────────────────────────────────
  const fetchExpeditions = useCallback(async () => {
    if (!user) {
      if (mountedRef.current) setLoading(false);
      return;
    }
    if (mountedRef.current) setLoading(true);

    try {
      const data = await expeditionStore.list(user.id);
      const list = Array.isArray(data) ? data : [];
      if (mountedRef.current) {
        setAllExpeditions(list);
      }
    } catch (e: any) {
      console.warn(TAG, 'fetch error:', e);
      if (mountedRef.current) {
        setAllExpeditions([]);
      }
    }

    if (mountedRef.current) setLoading(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      fetchExpeditions();
    }, [fetchExpeditions])
  );

  // ── Filter to completed/archived only ──────────────────────
  const pastExpeditions = useMemo(() => {
    return allExpeditions.filter(
      e => e.status === 'completed' || e.status === 'archived'
    );
  }, [allExpeditions]);

  // ── Apply all filters ──────────────────────────────────────
  const filteredExpeditions = useMemo(() => {
    let result = [...pastExpeditions];

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(e => e.status === statusFilter);
    }

    // Terrain filter
    if (terrainFilter) {
      result = result.filter(e =>
        e.terrain && e.terrain.toLowerCase() === terrainFilter.toLowerCase()
      );
    }

    // Date range filter
    if (dateRange !== 'all') {
      const preset = DATE_RANGES.find(d => d.key === dateRange);
      if (preset?.days) {
        const cutoff = Date.now() - (preset.days * 24 * 60 * 60 * 1000);
        result = result.filter(e => {
          const dateStr = e.end_at || e.updated_at;
          if (!dateStr) return false;
          try {
            return new Date(dateStr).getTime() >= cutoff;
          } catch { return false; }
        });
      }
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(e =>
        (e.title || '').toLowerCase().includes(q)
      );
    }

    // Sort by completion date descending
    result.sort((a, b) => {
      const dateA = a.end_at || a.updated_at || a.created_at;
      const dateB = b.end_at || b.updated_at || b.created_at;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });

    return result;
  }, [pastExpeditions, statusFilter, terrainFilter, dateRange, searchQuery]);

  // ── Summary stats ──────────────────────────────────────────
  const summaryStats = useMemo(() => {
    const total = pastExpeditions.length;
    const totalDays = pastExpeditions.reduce((sum, e) => sum + (e.duration_days || 0), 0);

    // Most common terrain
    const terrainCounts: Record<string, number> = {};
    for (const e of pastExpeditions) {
      if (e.terrain) {
        const t = e.terrain.toLowerCase();
        terrainCounts[t] = (terrainCounts[t] || 0) + 1;
      }
    }
    let mostCommon: string | null = null;
    let maxCount = 0;
    for (const [terrain, count] of Object.entries(terrainCounts)) {
      if (count > maxCount) {
        mostCommon = terrain;
        maxCount = count;
      }
    }

    return { totalExpeditions: total, totalDays, mostCommonTerrain: mostCommon };
  }, [pastExpeditions]);

  // ── Active filter count (for badge) ────────────────────────
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (statusFilter !== 'all') count++;
    if (terrainFilter) count++;
    if (dateRange !== 'all') count++;
    return count;
  }, [statusFilter, terrainFilter, dateRange]);

  // ── Handlers ───────────────────────────────────────────────
  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleExpeditionPress = useCallback((expedition: EcsExpedition) => {
    router.push({ pathname: '/expedition-detail', params: { id: expedition.id } } as any);
  }, [router]);

  const handleClearFilters = useCallback(() => {
    setStatusFilter('all');
    setTerrainFilter(null);
    setDateRange('all');
    setSearchQuery('');
  }, []);

  // ── No user ────────────────────────────────────────────────
  if (!user) {
    return (
      <TopoBackground>
        <View style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backBtn} onPress={handleBack} activeOpacity={0.85}>
              <Ionicons name="arrow-back" size={20} color={TACTICAL.text} />
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <Text style={styles.headerBrand}>EXPEDITION COMMAND SYSTEM</Text>
              <Text style={styles.headerTitle}>PAST EXPEDITIONS</Text>
            </View>
            <View style={{ width: 40 }} />
          </View>
          <View style={styles.center}>
            <Ionicons name="lock-closed-outline" size={40} color={TACTICAL.textMuted} />
            <Text style={styles.emptyTitle}>SIGN IN REQUIRED</Text>
            <Text style={styles.emptyDesc}>Sign in to view your past expeditions.</Text>
          </View>
        </View>
      </TopoBackground>
    );
  }

  // ── Render ─────────────────────────────────────────────────
  return (
    <TopoBackground>
      <View style={styles.container}>
        {/* ── Header ──────────────────────────────────────── */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={handleBack} activeOpacity={0.85}>
            <Ionicons name="arrow-back" size={20} color={TACTICAL.text} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerBrand}>EXPEDITION COMMAND SYSTEM</Text>
            <Text style={styles.headerTitle}>PAST EXPEDITIONS</Text>
          </View>
          <View style={styles.headerRight}>
            <View style={[styles.onlineDot, { backgroundColor: isOnline ? '#4CAF50' : '#E53935' }]} />
          </View>
        </View>

        {/* ── Summary Stats ───────────────────────────────── */}
        {!loading && pastExpeditions.length > 0 && (
          <SummaryStats
            totalExpeditions={summaryStats.totalExpeditions}
            totalDays={summaryStats.totalDays}
            mostCommonTerrain={summaryStats.mostCommonTerrain}
          />
        )}

        {/* ── Search Bar ──────────────────────────────────── */}
        <View style={styles.searchRow}>
          <View style={styles.searchInputWrap}>
            <Ionicons name="search-outline" size={16} color={TACTICAL.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by title..."
              placeholderTextColor={TACTICAL.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} activeOpacity={0.7}>
                <Ionicons name="close-circle" size={16} color={TACTICAL.textMuted} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={[styles.filterToggleBtn, showFilters && styles.filterToggleBtnActive]}
            onPress={() => setShowFilters(!showFilters)}
            activeOpacity={0.85}
          >
            <Ionicons
              name="options-outline"
              size={18}
              color={showFilters ? TACTICAL.amber : TACTICAL.textMuted}
            />
            {activeFilterCount > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Filter Panel (collapsible) ──────────────────── */}
        {showFilters && (
          <View style={styles.filterPanel}>
            {/* Status filters */}
            <View style={styles.filterSection}>
              <Text style={styles.filterSectionLabel}>STATUS</Text>
              <View style={styles.chipRow}>
                {STATUS_FILTERS.map(sf => {
                  const isActive = statusFilter === sf.key;
                  return (
                    <TouchableOpacity
                      key={sf.key}
                      style={[styles.chip, isActive && styles.chipActive]}
                      onPress={() => setStatusFilter(sf.key)}
                      activeOpacity={0.85}
                    >
                      <Ionicons
                        name={sf.icon as any}
                        size={12}
                        color={isActive ? TACTICAL.amber : TACTICAL.textMuted}
                      />
                      <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                        {sf.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Terrain filters */}
            <View style={styles.filterSection}>
              <Text style={styles.filterSectionLabel}>TERRAIN</Text>
              <View style={styles.chipRow}>
                <TouchableOpacity
                  style={[styles.chip, !terrainFilter && styles.chipActive]}
                  onPress={() => setTerrainFilter(null)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.chipText, !terrainFilter && styles.chipTextActive]}>
                    ALL
                  </Text>
                </TouchableOpacity>
                {TERRAIN_OPTIONS.map(t => {
                  const isActive = terrainFilter === t.value;
                  return (
                    <TouchableOpacity
                      key={t.value}
                      style={[styles.chip, isActive && { borderColor: `${t.color}60`, backgroundColor: `${t.color}12` }]}
                      onPress={() => setTerrainFilter(isActive ? null : t.value)}
                      activeOpacity={0.85}
                    >
                      <Ionicons name={t.icon as any} size={12} color={isActive ? t.color : TACTICAL.textMuted} />
                      <Text style={[styles.chipText, isActive && { color: t.color }]}>
                        {t.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Date range filters */}
            <View style={styles.filterSection}>
              <Text style={styles.filterSectionLabel}>DATE RANGE</Text>
              <View style={styles.chipRow}>
                {DATE_RANGES.map(dr => {
                  const isActive = dateRange === dr.key;
                  return (
                    <TouchableOpacity
                      key={dr.key}
                      style={[styles.chip, isActive && styles.chipActive]}
                      onPress={() => setDateRange(dr.key)}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                        {dr.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Clear all filters */}
            {activeFilterCount > 0 && (
              <TouchableOpacity
                style={styles.clearFiltersBtn}
                onPress={handleClearFilters}
                activeOpacity={0.85}
              >
                <Ionicons name="close-outline" size={14} color={TACTICAL.amber} />
                <Text style={styles.clearFiltersText}>CLEAR ALL FILTERS</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── Results count ───────────────────────────────── */}
        {!loading && pastExpeditions.length > 0 && (
          <View style={styles.resultsRow}>
            <Text style={styles.resultsText}>
              {filteredExpeditions.length} of {pastExpeditions.length} expedition{pastExpeditions.length !== 1 ? 's' : ''}
            </Text>
          </View>
        )}

        {/* ── Content ─────────────────────────────────────── */}
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={TACTICAL.accent} />
            <Text style={styles.loadingText}>LOADING ARCHIVE...</Text>
          </View>
        ) : pastExpeditions.length === 0 ? (
          <View style={styles.center}>
            <View style={styles.emptyIconRing}>
              <Ionicons name="file-tray-outline" size={32} color={TACTICAL.textMuted} style={{ opacity: 0.5 }} />
            </View>
            <Text style={styles.emptyTitle}>NO PAST EXPEDITIONS</Text>
            <Text style={styles.emptyDesc}>
              Completed and archived expeditions{'\n'}will appear here.
            </Text>
            <TouchableOpacity
              style={styles.emptyBackBtn}
              onPress={handleBack}
              activeOpacity={0.85}
            >
              <Ionicons name="arrow-back-outline" size={16} color="#0B0F12" />
              <Text style={styles.emptyBackBtnText}>BACK TO COMMAND</Text>
            </TouchableOpacity>
          </View>
        ) : filteredExpeditions.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="search-outline" size={32} color={TACTICAL.textMuted} style={{ opacity: 0.5 }} />
            <Text style={styles.emptyTitle}>NO MATCHES</Text>
            <Text style={styles.emptyDesc}>
              No expeditions match your current filters.{'\n'}Try adjusting your search or filters.
            </Text>
            <TouchableOpacity
              style={styles.clearFiltersCTA}
              onPress={handleClearFilters}
              activeOpacity={0.85}
            >
              <Ionicons name="refresh-outline" size={14} color={TACTICAL.amber} />
              <Text style={styles.clearFiltersCTAText}>CLEAR FILTERS</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={filteredExpeditions}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <ExpeditionCard
                expedition={item}
                onPress={() => handleExpeditionPress(item)}
              />
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            ListFooterComponent={
              <View style={styles.listFooter}>
                <Text style={styles.footerText}>
                  {filteredExpeditions.length} EXPEDITION{filteredExpeditions.length !== 1 ? 'S' : ''}  //  ECS ARCHIVE
                </Text>
              </View>
            }
          />
        )}
      </View>
    </TopoBackground>
  );
}

// ============================================================
// STYLES
// ============================================================
const TOP_PAD = Platform.OS === 'web' ? 16 : 54;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },

  // ── Header ─────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: TOP_PAD,
    paddingBottom: 12,
    gap: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.35)',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerBrand: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },
  headerRight: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // ── Summary Stats ──────────────────────────────────────────
  summaryCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.35)',
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
  },
  statBlock: {
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  statIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(196, 138, 44, 0.08)',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '900',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },
  statLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.2,
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: 'rgba(62, 79, 60, 0.25)',
  },

  // ── Search Bar ─────────────────────────────────────────────
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 10,
    gap: 10,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.35)',
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: TACTICAL.text,
    letterSpacing: 0.3,
  },
  filterToggleBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.35)',
  },
  filterToggleBtnActive: {
    borderColor: 'rgba(196, 138, 44, 0.5)',
    backgroundColor: 'rgba(196, 138, 44, 0.08)',
  },
  filterBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: TACTICAL.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#0B0F12',
  },

  // ── Filter Panel ───────────────────────────────────────────
  filterPanel: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.35)',
    padding: 14,
    gap: 14,
  },
  filterSection: {
    gap: 8,
  },
  filterSectionLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.3)',
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  chipActive: {
    borderColor: 'rgba(196, 138, 44, 0.5)',
    backgroundColor: 'rgba(196, 138, 44, 0.10)',
  },
  chipText: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 0.8,
  },
  chipTextActive: {
    color: TACTICAL.amber,
  },
  clearFiltersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.25)',
    backgroundColor: 'rgba(196, 138, 44, 0.05)',
  },
  clearFiltersText: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1,
  },

  // ── Results Row ────────────────────────────────────────────
  resultsRow: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  resultsText: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.8,
  },

  // ── Expedition Card ────────────────────────────────────────
  expCard: {
    flexDirection: 'row',
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.35)',
    overflow: 'hidden',
  },
  expCardAccent: {
    width: 4,
  },
  expCardBody: {
    flex: 1,
    padding: 14,
    gap: 10,
  },
  expCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  expCardTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 0.3,
  },
  expStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  expStatusText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
  },
  expCardInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  terrainBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  terrainBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
  infoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.25)',
  },
  infoChipText: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },
  expCardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateText: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },

  // ── List ───────────────────────────────────────────────────
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  listFooter: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingTop: 16,
  },
  footerText: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
    textAlign: 'center',
  },

  // ── Empty States ───────────────────────────────────────────
  emptyIconRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(138, 138, 133, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(138, 138, 133, 0.12)',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
  emptyDesc: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    lineHeight: 17,
    opacity: 0.8,
  },
  emptyBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: TACTICAL.amber,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 8,
  },
  emptyBackBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0B0F12',
    letterSpacing: 1,
  },
  clearFiltersCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.35)',
    backgroundColor: 'rgba(196, 138, 44, 0.08)',
    marginTop: 4,
  },
  clearFiltersCTAText: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1,
  },

  // ── Loading ────────────────────────────────────────────────
  loadingText: {
    fontSize: 12,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
});




