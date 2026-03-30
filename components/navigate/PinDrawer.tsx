/**
 * PinDrawer — Collapsible pin list panel with filters
 *
 * Provides search, category/type filters, sort modes, and pin cards.
 * Phase 3.0: Includes PinCategoryFilterBar for horizontal scrollable
 * category filter chips that filter both the pin list AND map markers.
 * Does NOT block bottom menu. Renders inline in ScrollView.
 */
import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet, Platform, Alert,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL, TYPO, DENSITY } from '../../lib/theme';
import { pinStore } from '../../lib/pinStore';
import {
  type ECSPin, type PinType, type PinSortMode,
  PIN_TYPE_REGISTRY, getPinTypeMeta,
  SEVERITY_COLORS, SEVERITY_LABELS,
} from './PinTypes';
import PinCategoryFilterBar from './PinCategoryFilterBar';

interface Props {
  /** Pins already filtered by the parent's category filter (for the list) */
  pins: ECSPin[];
  /** ALL pins (unfiltered) — used for filter bar counts */
  allPins: ECSPin[];
  userLocation: { lat: number; lng: number } | null;
  activeExpeditionId: string | null;
  onSelectPin: (pin: ECSPin) => void;
  onEditPin: (pin: ECSPin) => void;
  onResolvePin: (pin: ECSPin) => void;
  onExport: (pins: ECSPin[]) => void;
  onRefresh: () => void;
  /** Category filter state from parent (controls both drawer + map) */
  activePinTypeFilters: PinType[];
  onPinTypeFilterToggle: (type: PinType) => void;
  onPinTypeFilterReset: () => void;
}

export default function PinDrawer({
  pins, allPins, userLocation, activeExpeditionId,
  onSelectPin, onEditPin, onResolvePin, onExport, onRefresh,
  activePinTypeFilters, onPinTypeFilterToggle, onPinTypeFilterReset,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState('');
  const [showWaypoints, setShowWaypoints] = useState(true);
  const [showIncidents, setShowIncidents] = useState(true);
  const [activeTypeFilters, setActiveTypeFilters] = useState<PinType[]>([]);
  const [expeditionOnly, setExpeditionOnly] = useState(false);
  const [unresolvedOnly, setUnresolvedOnly] = useState(false);
  const [sortMode, setSortMode] = useState<PinSortMode>('recent');
  const [showFilters, setShowFilters] = useState(false);

  // Filter + sort pins (applies internal filters on top of parent's category filter)
  const filteredPins = useMemo(() => {
    let result = pinStore.filter({
      showWaypoints,
      showIncidents,
      types: activeTypeFilters.length > 0 ? activeTypeFilters : undefined,
      expeditionOnly: expeditionOnly && activeExpeditionId ? activeExpeditionId : undefined,
      unresolvedOnly,
      search,
    });
    // Intersect with parent-filtered pins (category filter)
    const parentPinIds = new Set(pins.map(p => p.id));
    result = result.filter(p => parentPinIds.has(p.id));
    return pinStore.sort(result, sortMode, userLocation?.lat, userLocation?.lng);
  }, [pins, search, showWaypoints, showIncidents, activeTypeFilters, expeditionOnly, unresolvedOnly, sortMode, activeExpeditionId, userLocation]);

  const toggleTypeFilter = useCallback((type: PinType) => {
    setActiveTypeFilters(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  }, []);

  const waypointCount = pins.filter(p => p.category === 'waypoint').length;
  const incidentCount = pins.filter(p => p.category === 'incident').length;
  const unresolvedCount = pins.filter(p => p.category === 'incident' && !p.resolved).length;

  // Compute active filter summary for header badge
  const filterCount = activePinTypeFilters.length;

  return (
    <View style={styles.container}>
      {/* Drawer Header */}
      <TouchableOpacity
        style={styles.drawerHeader}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.8}
      >
        <View style={styles.drawerHeaderLeft}>
          <Ionicons name="pin-outline" size={14} color={TACTICAL.amber} />
          <Text style={styles.drawerTitle}>PINS</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{pins.length}</Text>
          </View>
          {filterCount > 0 && (
            <View style={[styles.countBadge, { backgroundColor: 'rgba(196,138,44,0.18)', borderColor: TACTICAL.amber + '40' }]}>
              <Text style={[styles.countText, { color: TACTICAL.amber }]}>
                {filterCount} FILTER{filterCount > 1 ? 'S' : ''}
              </Text>
            </View>
          )}
          {unresolvedCount > 0 && (
            <View style={[styles.countBadge, { backgroundColor: 'rgba(239,83,80,0.15)', borderColor: 'rgba(239,83,80,0.3)' }]}>
              <Text style={[styles.countText, { color: '#EF5350' }]}>{unresolvedCount} OPEN</Text>
            </View>
          )}
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={TACTICAL.textMuted} />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.drawerBody}>
          {/* ═══════════ CATEGORY FILTER BAR ═══════════ */}
          <PinCategoryFilterBar
            allPins={allPins}
            activeFilters={activePinTypeFilters}
            onToggleFilter={onPinTypeFilterToggle}
            onResetFilters={onPinTypeFilterReset}
          />

          {/* Search */}
          <View style={styles.searchRow}>
            <View style={styles.searchInput}>
              <Ionicons name="search-outline" size={13} color={TACTICAL.textMuted} />
              <TextInput
                style={styles.searchText}
                value={search}
                onChangeText={setSearch}
                placeholder="Search pins..."
                placeholderTextColor={TACTICAL.textMuted + '60'}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')}>
                  <Ionicons name="close-circle" size={14} color={TACTICAL.textMuted} />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={[styles.filterToggle, showFilters && styles.filterToggleActive]}
              onPress={() => setShowFilters(!showFilters)}
              activeOpacity={0.8}
            >
              <Ionicons name="options-outline" size={14} color={showFilters ? TACTICAL.amber : TACTICAL.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.filterToggle}
              onPress={() => onExport(filteredPins)}
              activeOpacity={0.8}
            >
              <Ionicons name="share-outline" size={14} color={TACTICAL.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Filters */}
          {showFilters && (
            <View style={styles.filtersSection}>
              {/* Category toggles */}
              <View style={styles.filterRow}>
                <TouchableOpacity
                  style={[styles.catToggle, showWaypoints && styles.catToggleActive]}
                  onPress={() => setShowWaypoints(!showWaypoints)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="flag-outline" size={12} color={showWaypoints ? '#66BB6A' : TACTICAL.textMuted} />
                  <Text style={[styles.catToggleText, showWaypoints && { color: '#66BB6A' }]}>
                    WAYPOINTS ({waypointCount})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.catToggle, showIncidents && styles.catToggleActive]}
                  onPress={() => setShowIncidents(!showIncidents)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="alert-circle-outline" size={12} color={showIncidents ? '#EF5350' : TACTICAL.textMuted} />
                  <Text style={[styles.catToggleText, showIncidents && { color: '#EF5350' }]}>
                    INCIDENTS ({incidentCount})
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Type chips */}
              <View style={styles.typeChipRow}>
                {PIN_TYPE_REGISTRY.map(meta => {
                  const active = activeTypeFilters.includes(meta.type);
                  return (
                    <TouchableOpacity
                      key={meta.type}
                      style={[styles.typeChip, active && { borderColor: meta.color, backgroundColor: meta.bgColor }]}
                      onPress={() => toggleTypeFilter(meta.type)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.typeChipText, active && { color: meta.color }]}>
                        {meta.shortLabel}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Extra filters */}
              <View style={styles.filterRow}>
                {activeExpeditionId && (
                  <TouchableOpacity
                    style={[styles.catToggle, expeditionOnly && styles.catToggleActive]}
                    onPress={() => setExpeditionOnly(!expeditionOnly)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.catToggleText, expeditionOnly && { color: TACTICAL.amber }]}>
                      ACTIVE EXPEDITION ONLY
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.catToggle, unresolvedOnly && styles.catToggleActive]}
                  onPress={() => setUnresolvedOnly(!unresolvedOnly)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.catToggleText, unresolvedOnly && { color: '#FFB300' }]}>
                    UNRESOLVED ONLY
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Sort */}
              <View style={styles.sortRow}>
                <Text style={styles.sortLabel}>SORT</Text>
                {(['recent', 'nearest', 'type'] as PinSortMode[]).map(mode => (
                  <TouchableOpacity
                    key={mode}
                    style={[styles.sortChip, sortMode === mode && styles.sortChipActive]}
                    onPress={() => setSortMode(mode)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.sortChipText, sortMode === mode && { color: TACTICAL.amber }]}>
                      {mode.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Pin List */}
          {filteredPins.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="pin-outline" size={20} color={TACTICAL.textMuted} />
              <Text style={styles.emptyText}>
                {filterCount > 0 ? 'No pins match selected categories' : 'No pins match filters'}
              </Text>
              {filterCount > 0 && (
                <TouchableOpacity
                  style={styles.resetFilterBtn}
                  onPress={onPinTypeFilterReset}
                  activeOpacity={0.8}
                >
                  <Ionicons name="refresh-outline" size={12} color={TACTICAL.amber} />
                  <Text style={styles.resetFilterText}>SHOW ALL PINS</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            filteredPins.map(pin => (
              <PinCard
                key={pin.id}
                pin={pin}
                userLocation={userLocation}
                onSelect={() => onSelectPin(pin)}
                onEdit={() => onEditPin(pin)}
                onResolve={() => onResolvePin(pin)}
              />
            ))
          )}
        </View>
      )}
    </View>
  );
}

// ── Pin Card ─────────────────────────────────────────────────
function PinCard({ pin, userLocation, onSelect, onEdit, onResolve }: {
  pin: ECSPin;
  userLocation: { lat: number; lng: number } | null;
  onSelect: () => void;
  onEdit: () => void;
  onResolve: () => void;
}) {
  const meta = getPinTypeMeta(pin.type);
  const isIncident = pin.category === 'incident';
  const isResolved = pin.resolved;

  const distance = userLocation
    ? pinStore.distanceFromUser(pin, userLocation.lat, userLocation.lng)
    : null;

  return (
    <TouchableOpacity
      style={[styles.pinCard, isResolved && styles.pinCardResolved]}
      onPress={onSelect}
      activeOpacity={0.85}
    >
      <View style={styles.pinCardLeft}>
        <View style={[styles.pinIcon, { backgroundColor: isResolved ? 'rgba(138,138,133,0.1)' : meta.bgColor }]}>
          <Ionicons
            name={meta.icon as any}
            size={15}
            color={isResolved ? TACTICAL.textMuted : meta.color}
          />
        </View>
      </View>

      <View style={styles.pinCardBody}>
        <View style={styles.pinCardTitleRow}>
          <Text style={[styles.pinCardTitle, isResolved && styles.pinCardTitleResolved]} numberOfLines={1}>
            {pin.title}
          </Text>
          {isIncident && pin.severity && !isResolved && (
            <View style={[styles.sevBadge, { backgroundColor: SEVERITY_COLORS[pin.severity] + '20', borderColor: SEVERITY_COLORS[pin.severity] + '40' }]}>
              <Text style={[styles.sevBadgeText, { color: SEVERITY_COLORS[pin.severity] }]}>
                {SEVERITY_LABELS[pin.severity]}
              </Text>
            </View>
          )}
          {isResolved && (
            <View style={styles.resolvedBadge}>
              <Ionicons name="checkmark-circle" size={11} color="#66BB6A" />
              <Text style={styles.resolvedText}>RESOLVED</Text>
            </View>
          )}
        </View>

        <View style={styles.pinCardMeta}>
          <Text style={styles.pinCardType}>{meta.shortLabel}</Text>
          {distance !== null && (
            <Text style={styles.pinCardDist}>
              {distance < 0.1 ? '<0.1' : distance.toFixed(1)} MI
            </Text>
          )}
          <Text style={styles.pinCardTime}>
            {new Date(pin.created_at).toLocaleDateString()}
          </Text>
        </View>

        {pin.notes ? (
          <Text style={styles.pinCardNotes} numberOfLines={1}>{pin.notes}</Text>
        ) : null}
      </View>

      <View style={styles.pinCardActions}>
        <TouchableOpacity style={styles.pinActionBtn} onPress={onEdit} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <Ionicons name="pencil-outline" size={13} color={TACTICAL.textMuted} />
        </TouchableOpacity>
        {isIncident && !isResolved && (
          <TouchableOpacity style={styles.pinActionBtn} onPress={onResolve} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Ionicons name="checkmark-circle-outline" size={13} color="#66BB6A" />
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: DENSITY.screenPad,
    marginTop: DENSITY.cardGap,
  },
  drawerHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: TACTICAL.panel, borderRadius: 10,
    borderWidth: 1, borderColor: TACTICAL.border,
  },
  drawerHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  drawerTitle: { ...TYPO.T4, color: TACTICAL.amber, fontSize: 10, letterSpacing: 4 },
  countBadge: {
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5,
    backgroundColor: 'rgba(196,138,44,0.12)', borderWidth: 1, borderColor: TACTICAL.amber + '30',
  },
  countText: { ...TYPO.U2, fontSize: 7, color: TACTICAL.amber, letterSpacing: 2 },

  drawerBody: {
    backgroundColor: TACTICAL.panel, borderRadius: 10,
    borderWidth: 1, borderColor: TACTICAL.border,
    borderTopWidth: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0,
    paddingBottom: 8,
  },

  searchRow: { flexDirection: 'row', gap: 6, padding: 10, paddingBottom: 6 },
  searchInput: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(62,79,60,0.08)',
    borderWidth: 1, borderColor: TACTICAL.border, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 7,
  },
  searchText: { ...TYPO.B2, color: TACTICAL.text, flex: 1, fontSize: 12 },
  filterToggle: {
    width: 36, height: 36, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: TACTICAL.border,
  },
  filterToggleActive: { borderColor: TACTICAL.amber + '50', backgroundColor: 'rgba(196,138,44,0.08)' },

  filtersSection: { paddingHorizontal: 10, gap: 8, paddingBottom: 8, borderBottomWidth: 0.5, borderBottomColor: TACTICAL.border },
  filterRow: { flexDirection: 'row', gap: 6 },
  catToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 7,
    borderWidth: 1, borderColor: TACTICAL.border,
  },
  catToggleActive: { borderColor: TACTICAL.amber + '40', backgroundColor: 'rgba(196,138,44,0.06)' },
  catToggleText: { ...TYPO.U2, fontSize: 7, color: TACTICAL.textMuted, letterSpacing: 2 },

  typeChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  typeChip: {
    paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6,
    borderWidth: 1, borderColor: TACTICAL.border,
  },
  typeChipText: { ...TYPO.U2, fontSize: 7, color: TACTICAL.textMuted, letterSpacing: 2 },

  sortRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sortLabel: { ...TYPO.T4, fontSize: 7, letterSpacing: 3, marginRight: 2 },
  sortChip: {
    paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6,
    borderWidth: 1, borderColor: TACTICAL.border,
  },
  sortChipActive: { borderColor: TACTICAL.amber + '50', backgroundColor: 'rgba(196,138,44,0.08)' },
  sortChipText: { ...TYPO.U2, fontSize: 7, color: TACTICAL.textMuted, letterSpacing: 2 },

  emptyState: { alignItems: 'center', padding: 20, gap: 6 },
  emptyText: { ...TYPO.B2, color: TACTICAL.textMuted, fontSize: 11 },
  resetFilterBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6,
    borderWidth: 1, borderColor: TACTICAL.amber + '40',
    backgroundColor: 'rgba(196,138,44,0.08)',
    marginTop: 4,
  },
  resetFilterText: { ...TYPO.U2, fontSize: 8, color: TACTICAL.amber, letterSpacing: 2 },

  // Pin Card
  pinCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 10, paddingVertical: 10,
    borderBottomWidth: 0.5, borderBottomColor: TACTICAL.border + '60',
  },
  pinCardResolved: { opacity: 0.55 },
  pinCardLeft: {},
  pinIcon: {
    width: 32, height: 32, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  pinCardBody: { flex: 1, gap: 3 },
  pinCardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pinCardTitle: { ...TYPO.T3, color: TACTICAL.text, fontSize: 12, flex: 1 },
  pinCardTitleResolved: { textDecorationLine: 'line-through', color: TACTICAL.textMuted },
  pinCardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pinCardType: { ...TYPO.U2, fontSize: 7, color: TACTICAL.textMuted, letterSpacing: 2 },
  pinCardDist: { ...TYPO.K3, fontSize: 10, color: TACTICAL.amber },
  pinCardTime: { ...TYPO.B2, fontSize: 9, color: TACTICAL.textMuted },
  pinCardNotes: { ...TYPO.B2, fontSize: 10, color: TACTICAL.textMuted, marginTop: 1 },

  sevBadge: {
    paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, borderWidth: 1,
  },
  sevBadgeText: { ...TYPO.U2, fontSize: 6, letterSpacing: 2 },
  resolvedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4,
    backgroundColor: 'rgba(102,187,106,0.1)',
  },
  resolvedText: { ...TYPO.U2, fontSize: 6, color: '#66BB6A', letterSpacing: 2 },

  pinCardActions: { gap: 6 },
  pinActionBtn: {
    width: 28, height: 28, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: TACTICAL.border,
  },
});



