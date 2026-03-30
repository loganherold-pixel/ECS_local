/**
 * WaypointEditor — Interactive waypoint list + detail panel + add waypoint + type classification + bulk select
 *
 * Features:
 *   - Scrollable waypoint list with selection synced to map preview
 *   - Detail panel showing coordinates, elevation, name
 *   - Waypoint type classification via tappable chip selector
 *   - Type filter to show/hide waypoints by type
 *   - Inline rename with TextInput
 *   - Reorder (move up/down)
 *   - Delete with confirmation
 *   - ADD WAYPOINT: manual coordinate entry or tap-on-map with type selection
 *   - BULK SELECT: multi-select waypoints, assign type to all at once
 *   - Sync status badge (modified indicator)
 *
 * Uses TACTICAL theme + TYPO tokens.
 */
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL, TYPO, DENSITY } from '../../lib/theme';
import { routeStore, type ImportedRoute, type RouteWaypoint } from '../../lib/routeStore';
import {
  WAYPOINT_TYPES,
  WAYPOINT_TYPE_CONFIG,
  getWaypointTypeConfig,
  type RouteWaypointType,
} from '../../lib/waypointTypes';

// ── Helpers ──────────────────────────────────────────────

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatCoordDMS(val: number, isLat: boolean): string {
  const dir = isLat ? (val >= 0 ? 'N' : 'S') : (val >= 0 ? 'E' : 'W');
  const abs = Math.abs(val);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = ((minFloat - min) * 60).toFixed(1);
  return `${deg}° ${min}' ${sec}" ${dir}`;
}

function formatCoordDecimal(val: number, isLat: boolean): string {
  const dir = isLat ? (val >= 0 ? 'N' : 'S') : (val >= 0 ? 'E' : 'W');
  return `${Math.abs(val).toFixed(6)}° ${dir}`;
}

function isValidLat(v: string): boolean {
  const n = parseFloat(v);
  return !isNaN(n) && n >= -90 && n <= 90;
}

function isValidLon(v: string): boolean {
  const n = parseFloat(v);
  return !isNaN(n) && n >= -180 && n <= 180;
}

// ── Component ────────────────────────────────────────────

interface Props {
  route: ImportedRoute;
  selectedIndex: number | null;
  onSelectWaypoint: (index: number | null) => void;
  onRouteChanged: () => void;
  isAddMode: boolean;
  onToggleAddMode: () => void;
  addFromMapCoords: { lat: number; lon: number } | null;
  onClearMapCoords: () => void;
}

export default function WaypointEditor({
  route,
  selectedIndex,
  onSelectWaypoint,
  onRouteChanged,
  isAddMode,
  onToggleAddMode,
  addFromMapCoords,
  onClearMapCoords,
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [confirmDeleteIdx, setConfirmDeleteIdx] = useState<number | null>(null);
  const listRef = useRef<ScrollView>(null);

  // ── Add Waypoint Form State ────────────────────────────
  const [showAddForm, setShowAddForm] = useState(false);
  const [addLat, setAddLat] = useState('');
  const [addLon, setAddLon] = useState('');
  const [addName, setAddName] = useState('');
  const [addEle, setAddEle] = useState('');
  const [addInsertMode, setAddInsertMode] = useState<'after' | 'end'>('end');
  const [addError, setAddError] = useState<string | null>(null);
  const [addType, setAddType] = useState<RouteWaypointType | null>(null);

  // ── Type Filter State ─────────────────────────────────
  const [typeFilter, setTypeFilter] = useState<RouteWaypointType | 'all' | 'untyped'>('all');
  const [showTypeFilter, setShowTypeFilter] = useState(false);

  // ── Bulk Select State ─────────────────────────────────
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<number>>(new Set());
  const [bulkAssignType, setBulkAssignType] = useState<RouteWaypointType | null>(null);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [bulkClearType, setBulkClearType] = useState(false);

  const waypoints = route.waypoints;
  const selectedWp = selectedIndex !== null && selectedIndex >= 0 && selectedIndex < waypoints.length
    ? waypoints[selectedIndex]
    : null;

  // ── Filtered waypoint indices ─────────────────────────
  const filteredIndices = useMemo(() => {
    if (typeFilter === 'all') {
      return waypoints.map((_, i) => i);
    }
    if (typeFilter === 'untyped') {
      return waypoints
        .map((wp, i) => ({ wp, i }))
        .filter(({ wp }) => !wp.waypointType)
        .map(({ i }) => i);
    }
    return waypoints
      .map((wp, i) => ({ wp, i }))
      .filter(({ wp }) => wp.waypointType === typeFilter)
      .map(({ i }) => i);
  }, [waypoints, typeFilter]);

  // ── Type counts for filter badges ─────────────────────
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: waypoints.length, untyped: 0 };
    for (const t of WAYPOINT_TYPES) counts[t] = 0;
    for (const wp of waypoints) {
      if (wp.waypointType && counts[wp.waypointType] !== undefined) {
        counts[wp.waypointType]++;
      } else {
        counts.untyped++;
      }
    }
    return counts;
  }, [waypoints]);

  // Auto-scroll list to selected waypoint
  useEffect(() => {
    if (selectedIndex !== null && listRef.current) {
      const rowH = 52;
      listRef.current.scrollTo({ y: Math.max(0, selectedIndex * rowH - 60), animated: true });
    }
  }, [selectedIndex]);

  // Populate form from map tap
  useEffect(() => {
    if (addFromMapCoords) {
      setAddLat(addFromMapCoords.lat.toString());
      setAddLon(addFromMapCoords.lon.toString());
      setShowAddForm(true);
      setAddError(null);
    }
  }, [addFromMapCoords]);

  // Exit bulk mode when route changes
  useEffect(() => {
    setBulkSelectMode(false);
    setBulkSelected(new Set());
    setBulkAssignType(null);
    setShowBulkConfirm(false);
    setBulkClearType(false);
  }, [route.id]);

  // ── Actions ────────────────────────────────────────────

  const handleRename = () => {
    if (selectedIndex === null) return;
    setNameInput(selectedWp?.name || '');
    setEditingName(true);
  };

  const handleSaveRename = () => {
    if (selectedIndex === null) return;
    routeStore.renameWaypoint(route.id, selectedIndex, nameInput.trim());
    setEditingName(false);
    onRouteChanged();
  };

  const handleCancelRename = () => setEditingName(false);

  const handleMoveUp = () => {
    if (selectedIndex === null || selectedIndex <= 0) return;
    routeStore.reorderWaypoint(route.id, selectedIndex, selectedIndex - 1);
    onSelectWaypoint(selectedIndex - 1);
    onRouteChanged();
  };

  const handleMoveDown = () => {
    if (selectedIndex === null || selectedIndex >= waypoints.length - 1) return;
    routeStore.reorderWaypoint(route.id, selectedIndex, selectedIndex + 1);
    onSelectWaypoint(selectedIndex + 1);
    onRouteChanged();
  };

  // ── Set Waypoint Type ─────────────────────────────────
  const handleSetType = useCallback((type: RouteWaypointType | null) => {
    if (selectedIndex === null) return;
    routeStore.setWaypointType(route.id, selectedIndex, type);
    onRouteChanged();
  }, [selectedIndex, route.id, onRouteChanged]);

  const handleDelete = (idx: number) => {
    const doDelete = () => {
      const wasSelected = selectedIndex === idx;
      routeStore.deleteWaypoint(route.id, idx);
      if (wasSelected) {
        const newLen = waypoints.length - 1;
        if (newLen <= 0) onSelectWaypoint(null);
        else if (idx >= newLen) onSelectWaypoint(newLen - 1);
        else onSelectWaypoint(idx);
      } else if (selectedIndex !== null && idx < selectedIndex) {
        onSelectWaypoint(selectedIndex - 1);
      }
      setConfirmDeleteIdx(null);
      // Also remove from bulk selection
      if (bulkSelected.has(idx)) {
        const next = new Set(bulkSelected);
        next.delete(idx);
        // Adjust indices above the deleted one
        const adjusted = new Set<number>();
        for (const i of next) {
          adjusted.add(i > idx ? i - 1 : i);
        }
        setBulkSelected(adjusted);
      }
      onRouteChanged();
    };

    if (Platform.OS === 'web') {
      setConfirmDeleteIdx(idx);
    } else {
      const wpName = waypoints[idx].name || `Waypoint ${idx + 1}`;
      Alert.alert('Delete Waypoint', `Remove "${wpName}" from this route?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const confirmDelete = () => {
    if (confirmDeleteIdx === null) return;
    const idx = confirmDeleteIdx;
    const wasSelected = selectedIndex === idx;
    routeStore.deleteWaypoint(route.id, idx);
    if (wasSelected) {
      const newLen = waypoints.length - 1;
      if (newLen <= 0) onSelectWaypoint(null);
      else if (idx >= newLen) onSelectWaypoint(newLen - 1);
      else onSelectWaypoint(idx);
    } else if (selectedIndex !== null && idx < selectedIndex) {
      onSelectWaypoint(selectedIndex - 1);
    }
    setConfirmDeleteIdx(null);
    onRouteChanged();
  };

  // ── Add Waypoint ───────────────────────────────────────

  const handleOpenAddForm = useCallback(() => {
    setShowAddForm(true);
    setAddLat('');
    setAddLon('');
    setAddName('');
    setAddEle('');
    setAddError(null);
    setAddType(null);
    setAddInsertMode(selectedIndex !== null ? 'after' : 'end');
    if (!isAddMode) onToggleAddMode();
  }, [selectedIndex, isAddMode, onToggleAddMode]);

  const handleCancelAdd = useCallback(() => {
    setShowAddForm(false);
    setAddLat('');
    setAddLon('');
    setAddName('');
    setAddEle('');
    setAddError(null);
    setAddType(null);
    onClearMapCoords();
    if (isAddMode) onToggleAddMode();
  }, [isAddMode, onToggleAddMode, onClearMapCoords]);

  const handleSaveAdd = useCallback(() => {
    if (!addLat.trim() || !addLon.trim()) { setAddError('Latitude and longitude are required.'); return; }
    if (!isValidLat(addLat.trim())) { setAddError('Invalid latitude. Must be between -90 and 90.'); return; }
    if (!isValidLon(addLon.trim())) { setAddError('Invalid longitude. Must be between -180 and 180.'); return; }

    const lat = parseFloat(addLat.trim());
    const lon = parseFloat(addLon.trim());
    const ele = addEle.trim() ? parseFloat(addEle.trim()) : null;
    const name = addName.trim() || null;

    if (addEle.trim() && (isNaN(ele as number))) { setAddError('Invalid elevation value.'); return; }

    const newWaypoint: RouteWaypoint = {
      lat, lon,
      ele: ele !== null && !isNaN(ele) ? ele : null,
      name,
      time: new Date().toISOString(),
      waypointType: addType,
    };

    let insertAt: number | undefined;
    if (addInsertMode === 'after' && selectedIndex !== null) insertAt = selectedIndex + 1;
    else insertAt = undefined;

    const result = routeStore.addWaypoint(route.id, newWaypoint, insertAt);
    if (result) {
      const newIdx = insertAt !== undefined ? insertAt : result.waypoints.length - 1;
      onSelectWaypoint(newIdx);
      onRouteChanged();
      setShowAddForm(false);
      setAddLat(''); setAddLon(''); setAddName(''); setAddEle(''); setAddError(null); setAddType(null);
      onClearMapCoords();
      if (isAddMode) onToggleAddMode();
    } else {
      setAddError('Failed to add waypoint. Please try again.');
    }
  }, [addLat, addLon, addName, addEle, addInsertMode, addType, selectedIndex, route.id, onSelectWaypoint, onRouteChanged, onClearMapCoords, isAddMode, onToggleAddMode]);

  // ── Bulk Select Actions ────────────────────────────────

  const handleEnterBulkMode = useCallback(() => {
    setBulkSelectMode(true);
    setBulkSelected(new Set());
    setBulkAssignType(null);
    setShowBulkConfirm(false);
    setBulkClearType(false);
    onSelectWaypoint(null); // Deselect individual
  }, [onSelectWaypoint]);

  const handleExitBulkMode = useCallback(() => {
    setBulkSelectMode(false);
    setBulkSelected(new Set());
    setBulkAssignType(null);
    setShowBulkConfirm(false);
    setBulkClearType(false);
  }, []);

  const handleToggleBulkItem = useCallback((idx: number) => {
    setBulkSelected(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
    // Reset confirm if user changes selection
    setShowBulkConfirm(false);
  }, []);

  const handleSelectAll = useCallback(() => {
    const allVisible = new Set(filteredIndices);
    setBulkSelected(allVisible);
    setShowBulkConfirm(false);
  }, [filteredIndices]);

  const handleDeselectAll = useCallback(() => {
    setBulkSelected(new Set());
    setShowBulkConfirm(false);
  }, []);

  const allVisibleSelected = useMemo(() => {
    if (filteredIndices.length === 0) return false;
    return filteredIndices.every(i => bulkSelected.has(i));
  }, [filteredIndices, bulkSelected]);

  const bulkSelectedCount = bulkSelected.size;

  const handleBulkTypeSelect = useCallback((type: RouteWaypointType | null) => {
    if (type === null) {
      setBulkClearType(true);
      setBulkAssignType(null);
    } else {
      setBulkClearType(false);
      setBulkAssignType(prev => prev === type ? null : type);
    }
    setShowBulkConfirm(false);
  }, []);

  const handleBulkApplyRequest = useCallback(() => {
    if (bulkSelectedCount === 0) return;
    if (!bulkAssignType && !bulkClearType) return;
    setShowBulkConfirm(true);
  }, [bulkSelectedCount, bulkAssignType, bulkClearType]);

  const handleBulkConfirm = useCallback(() => {
    const indices = Array.from(bulkSelected);
    const typeToSet = bulkClearType ? null : bulkAssignType;
    routeStore.bulkSetWaypointType(route.id, indices, typeToSet);
    onRouteChanged();
    // Reset
    setShowBulkConfirm(false);
    setBulkAssignType(null);
    setBulkClearType(false);
    setBulkSelected(new Set());
    setBulkSelectMode(false);
  }, [bulkSelected, bulkAssignType, bulkClearType, route.id, onRouteChanged]);

  const handleBulkCancelConfirm = useCallback(() => {
    setShowBulkConfirm(false);
  }, []);

  // ── Distance from previous waypoint ────────────────────
  const getDistFromPrev = (idx: number): string | null => {
    if (idx <= 0) return null;
    const prev = waypoints[idx - 1];
    const curr = waypoints[idx];
    const dist = haversine(prev.lat, prev.lon, curr.lat, curr.lon);
    if (dist < 0.1) return `${(dist * 5280).toFixed(0)} ft`;
    return `${dist.toFixed(2)} mi`;
  };

  const isModified = route.sync_status === 'pending' || route.sync_status === 'local';

  // ── Bulk type label for confirmation ───────────────────
  const bulkTypeLabel = bulkClearType
    ? 'NONE (CLEAR TYPE)'
    : bulkAssignType
      ? WAYPOINT_TYPE_CONFIG[bulkAssignType].label.toUpperCase()
      : '';

  const bulkTypeColor = bulkClearType
    ? TACTICAL.textMuted
    : bulkAssignType
      ? WAYPOINT_TYPE_CONFIG[bulkAssignType].color
      : TACTICAL.textMuted;

  return (
    <View style={styles.container}>
      {/* Section Header */}
      <TouchableOpacity
        style={styles.sectionHeader}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <Ionicons name="flag-outline" size={14} color={TACTICAL.amber} />
        <Text style={styles.sectionTitle}>WAYPOINT EDITOR</Text>
        <View style={styles.headerRight}>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{waypoints.length}</Text>
          </View>
          {isModified && (
            <View style={styles.modifiedBadge}>
              <View style={styles.modifiedDot} />
              <Text style={styles.modifiedText}>MODIFIED</Text>
            </View>
          )}
          {bulkSelectMode && (
            <View style={styles.bulkModeBadge}>
              <Ionicons name="checkbox-outline" size={10} color={TACTICAL.amber} />
              <Text style={styles.bulkModeBadgeText}>BULK</Text>
            </View>
          )}
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={TACTICAL.textMuted}
          />
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.editorCard}>
          {/* ADD WAYPOINT Button — hidden in bulk mode */}
          {!bulkSelectMode && (
            <View style={styles.addBtnRow}>
              <TouchableOpacity
                style={[styles.addWaypointBtn, isAddMode && styles.addWaypointBtnActive]}
                onPress={showAddForm ? handleCancelAdd : handleOpenAddForm}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={showAddForm ? 'close' : 'add-circle-outline'}
                  size={16}
                  color={showAddForm ? TACTICAL.textMuted : TACTICAL.amber}
                />
                <Text style={[styles.addWaypointBtnText, showAddForm && styles.addWaypointBtnTextCancel]}>
                  {showAddForm ? 'CANCEL' : 'ADD WAYPOINT'}
                </Text>
              </TouchableOpacity>
              {!showAddForm && isAddMode && (
                <TouchableOpacity style={styles.exitAddModeBtn} onPress={onToggleAddMode} activeOpacity={0.7}>
                  <Ionicons name="close-circle" size={14} color={TACTICAL.textMuted} />
                  <Text style={styles.exitAddModeText}>EXIT MAP MODE</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* ADD WAYPOINT FORM */}
          {showAddForm && !bulkSelectMode && (
            <View style={styles.addFormPanel}>
              <View style={styles.addFormHeader}>
                <Ionicons name="location-outline" size={14} color={TACTICAL.amber} />
                <Text style={styles.addFormTitle}>NEW WAYPOINT</Text>
                {addFromMapCoords && (
                  <View style={styles.fromMapBadge}>
                    <Ionicons name="map-outline" size={8} color={TACTICAL.amber} />
                    <Text style={styles.fromMapBadgeText}>FROM MAP</Text>
                  </View>
                )}
              </View>

              {/* Insert position selector */}
              <View style={styles.insertModeRow}>
                <Text style={styles.insertModeLabel}>INSERT AT:</Text>
                <TouchableOpacity
                  style={[styles.insertModeOption, addInsertMode === 'after' && selectedIndex !== null && styles.insertModeOptionActive]}
                  onPress={() => setAddInsertMode('after')}
                  disabled={selectedIndex === null}
                >
                  <Text style={[styles.insertModeOptionText, addInsertMode === 'after' && selectedIndex !== null && styles.insertModeOptionTextActive, selectedIndex === null && styles.insertModeOptionTextDisabled]}>
                    AFTER #{selectedIndex !== null ? selectedIndex + 1 : '--'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.insertModeOption, addInsertMode === 'end' && styles.insertModeOptionActive]}
                  onPress={() => setAddInsertMode('end')}
                >
                  <Text style={[styles.insertModeOptionText, addInsertMode === 'end' && styles.insertModeOptionTextActive]}>
                    END OF LIST
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Coordinate inputs */}
              <View style={styles.addFormRow}>
                <View style={styles.addFormField}>
                  <Text style={styles.addFormFieldLabel}>LATITUDE</Text>
                  <TextInput
                    style={[styles.addFormInput, addLat.trim() && !isValidLat(addLat.trim()) && styles.addFormInputError]}
                    value={addLat}
                    onChangeText={(v) => { setAddLat(v); setAddError(null); }}
                    placeholder="e.g. 37.7749"
                    placeholderTextColor={TACTICAL.textMuted + '60'}
                    keyboardType="numeric"
                    autoCorrect={false}
                  />
                  {addLat.trim() && isValidLat(addLat.trim()) && (
                    <Text style={styles.addFormDMS}>{formatCoordDMS(parseFloat(addLat.trim()), true)}</Text>
                  )}
                </View>
                <View style={styles.addFormField}>
                  <Text style={styles.addFormFieldLabel}>LONGITUDE</Text>
                  <TextInput
                    style={[styles.addFormInput, addLon.trim() && !isValidLon(addLon.trim()) && styles.addFormInputError]}
                    value={addLon}
                    onChangeText={(v) => { setAddLon(v); setAddError(null); }}
                    placeholder="e.g. -122.4194"
                    placeholderTextColor={TACTICAL.textMuted + '60'}
                    keyboardType="numeric"
                    autoCorrect={false}
                  />
                  {addLon.trim() && isValidLon(addLon.trim()) && (
                    <Text style={styles.addFormDMS}>{formatCoordDMS(parseFloat(addLon.trim()), false)}</Text>
                  )}
                </View>
              </View>

              <View style={styles.addFormRow}>
                <View style={styles.addFormField}>
                  <Text style={styles.addFormFieldLabel}>NAME (OPTIONAL)</Text>
                  <TextInput
                    style={styles.addFormInput}
                    value={addName}
                    onChangeText={setAddName}
                    placeholder="Waypoint name"
                    placeholderTextColor={TACTICAL.textMuted + '60'}
                    autoCorrect={false}
                  />
                </View>
                <View style={[styles.addFormField, { flex: 0.6 }]}>
                  <Text style={styles.addFormFieldLabel}>ELEVATION (M)</Text>
                  <TextInput
                    style={styles.addFormInput}
                    value={addEle}
                    onChangeText={setAddEle}
                    placeholder="meters"
                    placeholderTextColor={TACTICAL.textMuted + '60'}
                    keyboardType="numeric"
                    autoCorrect={false}
                  />
                </View>
              </View>

              {/* Waypoint Type Selector in Add Form */}
              <View style={styles.typeSection}>
                <Text style={styles.addFormFieldLabel}>WAYPOINT TYPE (OPTIONAL)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeChipScroll}>
                  <View style={styles.typeChipRow}>
                    {WAYPOINT_TYPES.map((t) => {
                      const cfg = WAYPOINT_TYPE_CONFIG[t];
                      const isActive = addType === t;
                      return (
                        <TouchableOpacity
                          key={t}
                          style={[
                            styles.typeChip,
                            isActive && { backgroundColor: cfg.bgColor, borderColor: cfg.borderColor },
                          ]}
                          onPress={() => setAddType(isActive ? null : t)}
                          activeOpacity={0.7}
                        >
                          <Ionicons name={cfg.icon as any} size={12} color={isActive ? cfg.color : TACTICAL.textMuted} />
                          <Text style={[styles.typeChipText, isActive && { color: cfg.color }]}>
                            {cfg.shortLabel}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>

              {/* Map tap hint */}
              {!addFromMapCoords && (
                <View style={styles.mapTapHint}>
                  <Ionicons name="hand-left-outline" size={12} color={TACTICAL.textMuted} />
                  <Text style={styles.mapTapHintText}>Or tap the route map grid above to set coordinates</Text>
                </View>
              )}

              {addError && (
                <View style={styles.addErrorRow}>
                  <Ionicons name="alert-circle" size={12} color={TACTICAL.danger} />
                  <Text style={styles.addErrorText}>{addError}</Text>
                </View>
              )}

              <View style={styles.addFormActions}>
                <TouchableOpacity style={styles.addSaveBtn} onPress={handleSaveAdd} activeOpacity={0.8}>
                  <Ionicons name="checkmark-circle" size={16} color="#0B0F12" />
                  <Text style={styles.addSaveBtnText}>SAVE WAYPOINT</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.addCancelBtn} onPress={handleCancelAdd} activeOpacity={0.7}>
                  <Text style={styles.addCancelBtnText}>CANCEL</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Detail Panel — shown when a waypoint is selected (not in bulk mode) */}
          {selectedWp && selectedIndex !== null && !showAddForm && !bulkSelectMode && (
            <View style={styles.detailPanel}>
              <View style={styles.detailHeader}>
                <View style={styles.detailHeaderLeft}>
                  <View style={[
                    styles.detailIndexBadge,
                    selectedWp.waypointType && getWaypointTypeConfig(selectedWp.waypointType)
                      ? { backgroundColor: getWaypointTypeConfig(selectedWp.waypointType)!.color }
                      : {},
                  ]}>
                    <Text style={styles.detailIndexText}>{selectedIndex + 1}</Text>
                  </View>
                  {editingName ? (
                    <View style={styles.renameRow}>
                      <TextInput
                        style={styles.renameInput}
                        value={nameInput}
                        onChangeText={setNameInput}
                        placeholder="Waypoint name..."
                        placeholderTextColor={TACTICAL.textMuted}
                        autoFocus
                        onSubmitEditing={handleSaveRename}
                        selectTextOnFocus
                      />
                      <TouchableOpacity style={styles.renameSaveBtn} onPress={handleSaveRename}>
                        <Ionicons name="checkmark" size={16} color="#66BB6A" />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.renameCancelBtn} onPress={handleCancelRename}>
                        <Ionicons name="close" size={16} color={TACTICAL.textMuted} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity onPress={handleRename} style={styles.nameRow}>
                      <Text style={styles.detailName} numberOfLines={1}>
                        {selectedWp.name || `WAYPOINT ${selectedIndex + 1}`}
                      </Text>
                      <Ionicons name="pencil-outline" size={12} color={TACTICAL.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>
                <TouchableOpacity style={styles.detailCloseBtn} onPress={() => onSelectWaypoint(null)}>
                  <Ionicons name="close" size={16} color={TACTICAL.textMuted} />
                </TouchableOpacity>
              </View>

              {/* Coordinate Grid */}
              <View style={styles.coordGrid}>
                <View style={styles.coordRow}>
                  <View style={styles.coordCell}>
                    <Text style={styles.coordLabel}>LATITUDE</Text>
                    <Text style={styles.coordValue}>{formatCoordDecimal(selectedWp.lat, true)}</Text>
                    <Text style={styles.coordDMS}>{formatCoordDMS(selectedWp.lat, true)}</Text>
                  </View>
                  <View style={styles.coordDivider} />
                  <View style={styles.coordCell}>
                    <Text style={styles.coordLabel}>LONGITUDE</Text>
                    <Text style={styles.coordValue}>{formatCoordDecimal(selectedWp.lon, false)}</Text>
                    <Text style={styles.coordDMS}>{formatCoordDMS(selectedWp.lon, false)}</Text>
                  </View>
                </View>
                <View style={styles.coordRow}>
                  <View style={styles.coordCell}>
                    <Text style={styles.coordLabel}>ELEVATION</Text>
                    <Text style={styles.coordValue}>
                      {selectedWp.ele != null ? `${Math.round(selectedWp.ele * 3.281).toLocaleString()} ft` : '-- ft'}
                    </Text>
                    {selectedWp.ele != null && (
                      <Text style={styles.coordDMS}>{selectedWp.ele.toFixed(1)} m</Text>
                    )}
                  </View>
                  <View style={styles.coordDivider} />
                  <View style={styles.coordCell}>
                    <Text style={styles.coordLabel}>TIMESTAMP</Text>
                    <Text style={styles.coordValue}>
                      {selectedWp.time ? new Date(selectedWp.time).toLocaleDateString() : '--'}
                    </Text>
                    {selectedWp.time && (
                      <Text style={styles.coordDMS}>{new Date(selectedWp.time).toLocaleTimeString()}</Text>
                    )}
                  </View>
                </View>
              </View>

              {/* ── Waypoint Type Chip Selector ─────────────── */}
              <View style={styles.typeDetailSection}>
                <Text style={styles.typeDetailLabel}>WAYPOINT TYPE</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeChipScroll}>
                  <View style={styles.typeChipRow}>
                    {/* Clear type option */}
                    <TouchableOpacity
                      style={[
                        styles.typeChip,
                        !selectedWp.waypointType && styles.typeChipActiveNone,
                      ]}
                      onPress={() => handleSetType(null)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="remove-circle-outline"
                        size={12}
                        color={!selectedWp.waypointType ? TACTICAL.text : TACTICAL.textMuted}
                      />
                      <Text style={[
                        styles.typeChipText,
                        !selectedWp.waypointType && { color: TACTICAL.text },
                      ]}>
                        NONE
                      </Text>
                    </TouchableOpacity>

                    {WAYPOINT_TYPES.map((t) => {
                      const cfg = WAYPOINT_TYPE_CONFIG[t];
                      const isActive = selectedWp.waypointType === t;
                      return (
                        <TouchableOpacity
                          key={t}
                          style={[
                            styles.typeChip,
                            isActive && { backgroundColor: cfg.bgColor, borderColor: cfg.borderColor },
                          ]}
                          onPress={() => handleSetType(isActive ? null : t)}
                          activeOpacity={0.7}
                        >
                          <Ionicons name={cfg.icon as any} size={12} color={isActive ? cfg.color : TACTICAL.textMuted} />
                          <Text style={[styles.typeChipText, isActive && { color: cfg.color }]}>
                            {cfg.shortLabel}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
                {selectedWp.waypointType && getWaypointTypeConfig(selectedWp.waypointType) && (
                  <Text style={[
                    styles.typeDetailDesc,
                    { color: getWaypointTypeConfig(selectedWp.waypointType)!.color },
                  ]}>
                    {getWaypointTypeConfig(selectedWp.waypointType)!.description}
                  </Text>
                )}
              </View>

              {/* Action Buttons */}
              <View style={styles.detailActions}>
                <TouchableOpacity
                  style={[styles.actionBtn, selectedIndex <= 0 && styles.actionBtnDisabled]}
                  onPress={handleMoveUp}
                  disabled={selectedIndex <= 0}
                >
                  <Ionicons name="arrow-up" size={14} color={selectedIndex <= 0 ? TACTICAL.textMuted + '40' : TACTICAL.text} />
                  <Text style={[styles.actionBtnText, selectedIndex <= 0 && styles.actionBtnTextDisabled]}>UP</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, selectedIndex >= waypoints.length - 1 && styles.actionBtnDisabled]}
                  onPress={handleMoveDown}
                  disabled={selectedIndex >= waypoints.length - 1}
                >
                  <Ionicons name="arrow-down" size={14} color={selectedIndex >= waypoints.length - 1 ? TACTICAL.textMuted + '40' : TACTICAL.text} />
                  <Text style={[styles.actionBtnText, selectedIndex >= waypoints.length - 1 && styles.actionBtnTextDisabled]}>DOWN</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.actionBtn} onPress={handleRename}>
                  <Ionicons name="pencil" size={14} color={TACTICAL.amber} />
                  <Text style={[styles.actionBtnText, { color: TACTICAL.amber }]}>RENAME</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDanger]} onPress={() => handleDelete(selectedIndex)}>
                  <Ionicons name="trash-outline" size={14} color={TACTICAL.danger} />
                  <Text style={[styles.actionBtnText, { color: TACTICAL.danger }]}>DELETE</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ══════════════════════════════════════════════════
              BULK SELECT MODE — Action Bar + Type Selector
              ══════════════════════════════════════════════════ */}
          {bulkSelectMode && (
            <View style={styles.bulkPanel}>
              {/* Bulk Header */}
              <View style={styles.bulkHeader}>
                <View style={styles.bulkHeaderLeft}>
                  <Ionicons name="checkbox-outline" size={16} color={TACTICAL.amber} />
                  <Text style={styles.bulkTitle}>BULK SELECT</Text>
                </View>
                <TouchableOpacity style={styles.bulkExitBtn} onPress={handleExitBulkMode} activeOpacity={0.7}>
                  <Ionicons name="close" size={14} color={TACTICAL.textMuted} />
                  <Text style={styles.bulkExitText}>EXIT</Text>
                </TouchableOpacity>
              </View>

              {/* Selection Controls */}
              <View style={styles.bulkControlsRow}>
                <View style={styles.bulkCountBadge}>
                  <Text style={[
                    styles.bulkCountNumber,
                    bulkSelectedCount > 0 && { color: TACTICAL.amber },
                  ]}>
                    {bulkSelectedCount}
                  </Text>
                  <Text style={styles.bulkCountLabel}>
                    {bulkSelectedCount === 1 ? 'SELECTED' : 'SELECTED'}
                  </Text>
                </View>

                <View style={styles.bulkToggleRow}>
                  <TouchableOpacity
                    style={[styles.bulkToggleBtn, allVisibleSelected && styles.bulkToggleBtnActive]}
                    onPress={allVisibleSelected ? handleDeselectAll : handleSelectAll}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={allVisibleSelected ? 'checkbox' : 'square-outline'}
                      size={14}
                      color={allVisibleSelected ? TACTICAL.amber : TACTICAL.textMuted}
                    />
                    <Text style={[
                      styles.bulkToggleText,
                      allVisibleSelected && { color: TACTICAL.amber },
                    ]}>
                      {allVisibleSelected ? 'DESELECT ALL' : 'SELECT ALL'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Bulk Type Assignment Selector */}
              {bulkSelectedCount > 0 && (
                <View style={styles.bulkTypeSection}>
                  <Text style={styles.bulkTypeSectionLabel}>ASSIGN TYPE TO {bulkSelectedCount} WAYPOINT{bulkSelectedCount !== 1 ? 'S' : ''}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeChipScroll}>
                    <View style={styles.typeChipRow}>
                      {/* Clear type option */}
                      <TouchableOpacity
                        style={[
                          styles.typeChip,
                          bulkClearType && styles.typeChipActiveNone,
                        ]}
                        onPress={() => handleBulkTypeSelect(null)}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name="remove-circle-outline"
                          size={12}
                          color={bulkClearType ? TACTICAL.text : TACTICAL.textMuted}
                        />
                        <Text style={[
                          styles.typeChipText,
                          bulkClearType && { color: TACTICAL.text },
                        ]}>
                          NONE
                        </Text>
                      </TouchableOpacity>

                      {WAYPOINT_TYPES.map((t) => {
                        const cfg = WAYPOINT_TYPE_CONFIG[t];
                        const isActive = bulkAssignType === t && !bulkClearType;
                        return (
                          <TouchableOpacity
                            key={t}
                            style={[
                              styles.typeChip,
                              isActive && { backgroundColor: cfg.bgColor, borderColor: cfg.borderColor },
                            ]}
                            onPress={() => handleBulkTypeSelect(t)}
                            activeOpacity={0.7}
                          >
                            <Ionicons name={cfg.icon as any} size={12} color={isActive ? cfg.color : TACTICAL.textMuted} />
                            <Text style={[styles.typeChipText, isActive && { color: cfg.color }]}>
                              {cfg.shortLabel}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>

                  {/* Apply Button */}
                  {(bulkAssignType || bulkClearType) && !showBulkConfirm && (
                    <TouchableOpacity
                      style={[styles.bulkApplyBtn, { borderColor: bulkTypeColor + '60' }]}
                      onPress={handleBulkApplyRequest}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="color-wand-outline" size={14} color={bulkTypeColor} />
                      <Text style={[styles.bulkApplyBtnText, { color: bulkTypeColor }]}>
                        APPLY {bulkTypeLabel} TO {bulkSelectedCount} WAYPOINT{bulkSelectedCount !== 1 ? 'S' : ''}
                      </Text>
                    </TouchableOpacity>
                  )}

                  {/* ── Confirmation Step ─────────────────── */}
                  {showBulkConfirm && (
                    <View style={styles.bulkConfirmBanner}>
                      <View style={styles.bulkConfirmHeader}>
                        <Ionicons name="alert-circle" size={16} color={TACTICAL.amber} />
                        <Text style={styles.bulkConfirmTitle}>CONFIRM BULK ASSIGNMENT</Text>
                      </View>
                      <Text style={styles.bulkConfirmText}>
                        Set <Text style={[styles.bulkConfirmHighlight, { color: bulkTypeColor }]}>{bulkTypeLabel}</Text> on{' '}
                        <Text style={styles.bulkConfirmHighlight}>{bulkSelectedCount}</Text> waypoint{bulkSelectedCount !== 1 ? 's' : ''}?
                        {bulkClearType ? ' This will remove the type classification.' : ''}
                      </Text>
                      <View style={styles.bulkConfirmActions}>
                        <TouchableOpacity
                          style={[styles.bulkConfirmYes, { backgroundColor: bulkClearType ? TACTICAL.textMuted : bulkTypeColor }]}
                          onPress={handleBulkConfirm}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="checkmark-circle" size={16} color="#0B0F12" />
                          <Text style={styles.bulkConfirmYesText}>CONFIRM</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.bulkConfirmNo} onPress={handleBulkCancelConfirm} activeOpacity={0.7}>
                          <Text style={styles.bulkConfirmNoText}>CANCEL</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              )}

              {bulkSelectedCount === 0 && (
                <View style={styles.bulkHint}>
                  <Ionicons name="hand-left-outline" size={12} color={TACTICAL.textMuted} />
                  <Text style={styles.bulkHintText}>Tap waypoints below to select them, or use SELECT ALL</Text>
                </View>
              )}
            </View>
          )}

          {/* Confirm Delete Banner (web) */}
          {confirmDeleteIdx !== null && (
            <View style={styles.confirmBanner}>
              <Ionicons name="alert-circle" size={16} color={TACTICAL.danger} />
              <Text style={styles.confirmText}>
                Delete "{waypoints[confirmDeleteIdx]?.name || `Waypoint ${confirmDeleteIdx + 1}`}"?
              </Text>
              <TouchableOpacity style={styles.confirmYes} onPress={confirmDelete}>
                <Text style={styles.confirmYesText}>DELETE</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmNo} onPress={() => setConfirmDeleteIdx(null)}>
                <Text style={styles.confirmNoText}>CANCEL</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* List Header with Type Filter Toggle + Bulk Select Toggle */}
          <View style={styles.listHeader}>
            <Text style={styles.listHeaderText}>WAYPOINTS</Text>
            <View style={styles.listHeaderRight}>
              {typeFilter !== 'all' && (
                <View style={styles.filterActiveBadge}>
                  <Text style={styles.filterActiveText}>
                    {typeFilter === 'untyped' ? 'UNTYPED' : WAYPOINT_TYPE_CONFIG[typeFilter as RouteWaypointType]?.shortLabel || ''}
                  </Text>
                  <Text style={styles.filterActiveCount}>{filteredIndices.length}</Text>
                </View>
              )}
              <TouchableOpacity
                style={[styles.filterToggleBtn, showTypeFilter && styles.filterToggleBtnActive]}
                onPress={() => setShowTypeFilter(!showTypeFilter)}
                activeOpacity={0.7}
              >
                <Ionicons name="funnel-outline" size={12} color={showTypeFilter || typeFilter !== 'all' ? TACTICAL.amber : TACTICAL.textMuted} />
              </TouchableOpacity>

              {/* Bulk Select Toggle */}
              {waypoints.length >= 2 && (
                <TouchableOpacity
                  style={[styles.bulkSelectToggle, bulkSelectMode && styles.bulkSelectToggleActive]}
                  onPress={bulkSelectMode ? handleExitBulkMode : handleEnterBulkMode}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={bulkSelectMode ? 'close-circle-outline' : 'checkbox-outline'}
                    size={12}
                    color={bulkSelectMode ? TACTICAL.amber : TACTICAL.textMuted}
                  />
                </TouchableOpacity>
              )}

              <Text style={styles.listHeaderCount}>{filteredIndices.length}/{waypoints.length}</Text>
            </View>
          </View>

          {/* Type Filter Row */}
          {showTypeFilter && (
            <View style={styles.typeFilterRow}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.typeFilterChips}>
                  <TouchableOpacity
                    style={[styles.typeFilterChip, typeFilter === 'all' && styles.typeFilterChipActive]}
                    onPress={() => setTypeFilter('all')}
                  >
                    <Text style={[styles.typeFilterChipText, typeFilter === 'all' && styles.typeFilterChipTextActive]}>
                      ALL
                    </Text>
                    <Text style={styles.typeFilterChipCount}>{typeCounts.all}</Text>
                  </TouchableOpacity>

                  {WAYPOINT_TYPES.map((t) => {
                    const cfg = WAYPOINT_TYPE_CONFIG[t];
                    const count = typeCounts[t] || 0;
                    if (count === 0) return null;
                    const isActive = typeFilter === t;
                    return (
                      <TouchableOpacity
                        key={t}
                        style={[
                          styles.typeFilterChip,
                          isActive && { backgroundColor: cfg.bgColor, borderColor: cfg.borderColor },
                        ]}
                        onPress={() => setTypeFilter(isActive ? 'all' : t)}
                      >
                        <Ionicons name={cfg.icon as any} size={10} color={isActive ? cfg.color : TACTICAL.textMuted} />
                        <Text style={[styles.typeFilterChipText, isActive && { color: cfg.color }]}>
                          {cfg.shortLabel}
                        </Text>
                        <Text style={[styles.typeFilterChipCount, isActive && { color: cfg.color }]}>{count}</Text>
                      </TouchableOpacity>
                    );
                  })}

                  {typeCounts.untyped > 0 && (
                    <TouchableOpacity
                      style={[styles.typeFilterChip, typeFilter === 'untyped' && styles.typeFilterChipActive]}
                      onPress={() => setTypeFilter(typeFilter === 'untyped' ? 'all' : 'untyped')}
                    >
                      <Text style={[styles.typeFilterChipText, typeFilter === 'untyped' && styles.typeFilterChipTextActive]}>
                        UNTYPED
                      </Text>
                      <Text style={styles.typeFilterChipCount}>{typeCounts.untyped}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </ScrollView>
            </View>
          )}

          {/* Waypoint List */}
          <ScrollView
            ref={listRef}
            style={styles.listScroll}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
          >
            {filteredIndices.map((origIdx, listPos) => {
              const wp = waypoints[origIdx];
              const isSelected = selectedIndex === origIdx;
              const isBulkChecked = bulkSelected.has(origIdx);
              const distLabel = getDistFromPrev(origIdx);
              const typeConfig = wp.waypointType ? getWaypointTypeConfig(wp.waypointType) : null;

              return (
                <React.Fragment key={`wp-row-${origIdx}`}>
                  {/* Distance connector between waypoints */}
                  {listPos > 0 && distLabel && typeFilter === 'all' && !bulkSelectMode && (
                    <View style={styles.connectorRow}>
                      <View style={styles.connectorLine} />
                      <Text style={styles.connectorDist}>{distLabel}</Text>
                      <View style={styles.connectorLine} />
                    </View>
                  )}

                  <TouchableOpacity
                    style={[
                      styles.wpRow,
                      !bulkSelectMode && isSelected && styles.wpRowSelected,
                      bulkSelectMode && isBulkChecked && styles.wpRowBulkSelected,
                    ]}
                    onPress={() => {
                      if (bulkSelectMode) {
                        handleToggleBulkItem(origIdx);
                      } else {
                        onSelectWaypoint(isSelected ? null : origIdx);
                      }
                    }}
                    onLongPress={() => {
                      if (!bulkSelectMode) {
                        handleEnterBulkMode();
                        // Select this item after entering bulk mode
                        setTimeout(() => {
                          setBulkSelected(new Set([origIdx]));
                        }, 0);
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    {/* Bulk Checkbox OR Index Badge */}
                    {bulkSelectMode ? (
                      <View style={[
                        styles.bulkCheckbox,
                        isBulkChecked && styles.bulkCheckboxChecked,
                        isBulkChecked && typeConfig && { backgroundColor: typeConfig.color, borderColor: typeConfig.color },
                      ]}>
                        {isBulkChecked ? (
                          <Ionicons name="checkmark" size={14} color="#0B0F12" />
                        ) : (
                          <Text style={styles.bulkCheckboxIndex}>{origIdx + 1}</Text>
                        )}
                      </View>
                    ) : (
                      <View style={[
                        styles.wpIndex,
                        isSelected && styles.wpIndexSelected,
                        typeConfig && !isSelected && { backgroundColor: typeConfig.bgColor, borderWidth: 1, borderColor: typeConfig.borderColor },
                        typeConfig && isSelected && { backgroundColor: typeConfig.color },
                      ]}>
                        {typeConfig && !isSelected ? (
                          <Ionicons name={typeConfig.icon as any} size={11} color={typeConfig.color} />
                        ) : (
                          <Text style={[styles.wpIndexText, isSelected && styles.wpIndexTextSelected]}>
                            {origIdx + 1}
                          </Text>
                        )}
                      </View>
                    )}

                    {/* Info */}
                    <View style={styles.wpInfo}>
                      <View style={styles.wpNameRow}>
                        <Text
                          style={[
                            styles.wpName,
                            !bulkSelectMode && isSelected && styles.wpNameSelected,
                            bulkSelectMode && isBulkChecked && styles.wpNameBulkSelected,
                          ]}
                          numberOfLines={1}
                        >
                          {wp.name || `Waypoint ${origIdx + 1}`}
                        </Text>
                        {/* Type badge inline */}
                        {typeConfig && (
                          <View style={[styles.wpTypeBadge, { backgroundColor: typeConfig.bgColor, borderColor: typeConfig.borderColor }]}>
                            <Text style={[styles.wpTypeBadgeText, { color: typeConfig.color }]}>
                              {typeConfig.shortLabel}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.wpCoords}>
                        {Math.abs(wp.lat).toFixed(4)}°{wp.lat >= 0 ? 'N' : 'S'}{' '}
                        {Math.abs(wp.lon).toFixed(4)}°{wp.lon >= 0 ? 'E' : 'W'}
                        {wp.ele != null ? ` · ${Math.round(wp.ele * 3.281)} ft` : ''}
                      </Text>
                    </View>

                    {/* Quick actions */}
                    <View style={styles.wpActions}>
                      {!bulkSelectMode && isSelected && (
                        <View style={styles.selectedIndicator}>
                          <View style={[
                            styles.selectedDot,
                            typeConfig && { backgroundColor: typeConfig.color },
                          ]} />
                        </View>
                      )}
                      {!bulkSelectMode && (
                        <TouchableOpacity
                          style={styles.wpDeleteBtn}
                          onPress={(e) => { e.stopPropagation?.(); handleDelete(origIdx); }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="close-circle-outline" size={16} color={TACTICAL.textMuted} />
                        </TouchableOpacity>
                      )}
                      {bulkSelectMode && isBulkChecked && (
                        <View style={styles.bulkCheckedIndicator}>
                          <View style={[styles.bulkCheckedDot, typeConfig && { backgroundColor: typeConfig.color }]} />
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                </React.Fragment>
              );
            })}

            {/* Empty state */}
            {filteredIndices.length === 0 && waypoints.length > 0 && (
              <View style={styles.emptyWpState}>
                <Ionicons name="funnel-outline" size={20} color={TACTICAL.textMuted} />
                <Text style={styles.emptyWpText}>No waypoints match the selected filter.</Text>
                <TouchableOpacity onPress={() => setTypeFilter('all')}>
                  <Text style={styles.clearFilterText}>SHOW ALL</Text>
                </TouchableOpacity>
              </View>
            )}

            {waypoints.length === 0 && (
              <View style={styles.emptyWpState}>
                <Ionicons name="flag-outline" size={20} color={TACTICAL.textMuted} />
                <Text style={styles.emptyWpText}>No waypoints yet. Tap ADD WAYPOINT above.</Text>
              </View>
            )}

            <View style={{ height: 8 }} />
          </ScrollView>
        </View>
      )}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { marginBottom: DENSITY.sectionGap },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: DENSITY.titleBodyGap, paddingVertical: 4 },
  sectionTitle: { ...TYPO.T4, color: TACTICAL.amber, flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  countBadge: { backgroundColor: 'rgba(62,79,60,0.3)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  countText: { ...TYPO.K3, fontSize: 10, color: TACTICAL.text },
  modifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(196,138,44,0.12)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  modifiedDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: TACTICAL.amber },
  modifiedText: { ...TYPO.U2, fontSize: 7, color: TACTICAL.amber, letterSpacing: 3 },

  // Bulk mode badge in header
  bulkModeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(196,138,44,0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '40',
  },
  bulkModeBadgeText: {
    ...TYPO.U2,
    fontSize: 7,
    color: TACTICAL.amber,
    letterSpacing: 3,
  },

  editorCard: { backgroundColor: TACTICAL.panel, borderRadius: 12, borderWidth: DENSITY.borderDefault, borderColor: TACTICAL.border, overflow: 'hidden' },

  // ADD WAYPOINT Button
  addBtnRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: DENSITY.cardPad, paddingTop: DENSITY.cardPad, paddingBottom: 8 },
  addWaypointBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, borderWidth: 1.5, borderColor: TACTICAL.amber + '50', backgroundColor: 'rgba(196,138,44,0.06)' },
  addWaypointBtnActive: { borderColor: TACTICAL.amber + '80', backgroundColor: 'rgba(196,138,44,0.12)' },
  addWaypointBtnText: { ...TYPO.U2, fontSize: 9, color: TACTICAL.amber, letterSpacing: 3 },
  addWaypointBtnTextCancel: { color: TACTICAL.textMuted },
  exitAddModeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: TACTICAL.border },
  exitAddModeText: { ...TYPO.U2, fontSize: 7, color: TACTICAL.textMuted, letterSpacing: 2 },

  // ADD FORM
  addFormPanel: { borderBottomWidth: 1, borderBottomColor: TACTICAL.amber + '30', backgroundColor: 'rgba(196,138,44,0.04)', paddingHorizontal: DENSITY.cardPad, paddingBottom: DENSITY.cardPad },
  addFormHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  addFormTitle: { ...TYPO.T3, color: TACTICAL.amber, flex: 1 },
  fromMapBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(196,138,44,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  fromMapBadgeText: { ...TYPO.U2, fontSize: 7, color: TACTICAL.amber, letterSpacing: 2 },
  insertModeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  insertModeLabel: { ...TYPO.U2, fontSize: 7, color: TACTICAL.textMuted, letterSpacing: 3 },
  insertModeOption: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: TACTICAL.border, backgroundColor: 'rgba(62,79,60,0.08)' },
  insertModeOptionActive: { borderColor: TACTICAL.amber + '60', backgroundColor: 'rgba(196,138,44,0.1)' },
  insertModeOptionText: { ...TYPO.U2, fontSize: 8, color: TACTICAL.textMuted, letterSpacing: 2 },
  insertModeOptionTextActive: { color: TACTICAL.amber },
  insertModeOptionTextDisabled: { color: TACTICAL.textMuted + '40' },
  addFormRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  addFormField: { flex: 1 },
  addFormFieldLabel: { ...TYPO.U2, fontSize: 7, color: TACTICAL.textMuted, letterSpacing: 3, marginBottom: 4 },
  addFormInput: { height: 36, backgroundColor: 'rgba(62,79,60,0.12)', borderWidth: 1, borderColor: TACTICAL.border, borderRadius: 6, paddingHorizontal: 10, color: TACTICAL.text, ...TYPO.K3, fontSize: 12 },
  addFormInputError: { borderColor: TACTICAL.danger + '80', backgroundColor: 'rgba(192,57,43,0.06)' },
  addFormDMS: { ...TYPO.B2, fontSize: 8, color: TACTICAL.textMuted, marginTop: 2 },
  mapTapHint: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 8, backgroundColor: 'rgba(62,79,60,0.08)', borderRadius: 6, marginBottom: 8 },
  mapTapHintText: { ...TYPO.B2, fontSize: 10, color: TACTICAL.textMuted, flex: 1 },
  addErrorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 8, backgroundColor: 'rgba(192,57,43,0.08)', borderRadius: 6, marginBottom: 8 },
  addErrorText: { ...TYPO.B2, fontSize: 10, color: TACTICAL.danger, flex: 1 },
  addFormActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  addSaveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 8, backgroundColor: TACTICAL.amber },
  addSaveBtnText: { ...TYPO.U1, fontSize: 11, color: '#0B0F12', letterSpacing: 3 },
  addCancelBtn: { paddingHorizontal: 16, paddingVertical: 11, borderRadius: 8, borderWidth: 1, borderColor: TACTICAL.border, alignItems: 'center', justifyContent: 'center' },
  addCancelBtnText: { ...TYPO.U2, fontSize: 9, color: TACTICAL.textMuted, letterSpacing: 3 },

  // Type chip section (shared by add form and detail panel)
  typeSection: { marginBottom: 10 },
  typeChipScroll: { marginTop: 4 },
  typeChipRow: { flexDirection: 'row', gap: 6, paddingRight: 8 },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: 'rgba(62,79,60,0.08)',
  },
  typeChipActiveNone: {
    borderColor: TACTICAL.text + '40',
    backgroundColor: 'rgba(230,230,225,0.08)',
  },
  typeChipText: {
    ...TYPO.U2,
    fontSize: 8,
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },

  // Detail Panel
  detailPanel: { borderBottomWidth: 1, borderBottomColor: TACTICAL.border, backgroundColor: 'rgba(62,79,60,0.06)' },
  detailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: DENSITY.cardPad, paddingTop: DENSITY.cardPad, paddingBottom: 8 },
  detailHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  detailIndexBadge: { width: 28, height: 28, borderRadius: 6, backgroundColor: TACTICAL.amber, alignItems: 'center', justifyContent: 'center' },
  detailIndexText: { ...TYPO.K3, fontSize: 12, color: '#0B0F12', fontWeight: '700' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  detailName: { ...TYPO.T3, color: TACTICAL.text, flex: 1 },
  detailCloseBtn: { width: 28, height: 28, borderRadius: 6, borderWidth: 1, borderColor: TACTICAL.border, alignItems: 'center', justifyContent: 'center' },
  renameRow: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 6 },
  renameInput: { flex: 1, height: 32, backgroundColor: 'rgba(62,79,60,0.15)', borderWidth: 1, borderColor: TACTICAL.amber + '60', borderRadius: 6, paddingHorizontal: 10, color: TACTICAL.text, ...TYPO.B1, fontSize: 13 },
  renameSaveBtn: { width: 28, height: 28, borderRadius: 6, backgroundColor: 'rgba(102,187,106,0.15)', borderWidth: 1, borderColor: 'rgba(102,187,106,0.3)', alignItems: 'center', justifyContent: 'center' },
  renameCancelBtn: { width: 28, height: 28, borderRadius: 6, borderWidth: 1, borderColor: TACTICAL.border, alignItems: 'center', justifyContent: 'center' },

  // Coordinate Grid
  coordGrid: { paddingHorizontal: DENSITY.cardPad, paddingBottom: 10, gap: 8 },
  coordRow: { flexDirection: 'row', gap: 0 },
  coordCell: { flex: 1, paddingVertical: 6 },
  coordDivider: { width: 1, backgroundColor: 'rgba(62,79,60,0.2)', marginHorizontal: 12 },
  coordLabel: { ...TYPO.U2, fontSize: 7, color: TACTICAL.textMuted, letterSpacing: 4, marginBottom: 3 },
  coordValue: { ...TYPO.K3, fontSize: 11, color: TACTICAL.text },
  coordDMS: { ...TYPO.B2, fontSize: 9, color: TACTICAL.textMuted, marginTop: 1 },

  // Type Detail Section (in detail panel)
  typeDetailSection: {
    paddingHorizontal: DENSITY.cardPad,
    paddingBottom: 10,
  },
  typeDetailLabel: {
    ...TYPO.U2,
    fontSize: 7,
    color: TACTICAL.textMuted,
    letterSpacing: 4,
    marginBottom: 6,
  },
  typeDetailDesc: {
    ...TYPO.B2,
    fontSize: 10,
    marginTop: 6,
    fontStyle: 'italic',
  },

  // Detail Actions
  detailActions: { flexDirection: 'row', paddingHorizontal: DENSITY.cardPad, paddingBottom: DENSITY.cardPad, gap: 6 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: TACTICAL.border, backgroundColor: 'rgba(62,79,60,0.08)' },
  actionBtnDisabled: { opacity: 0.35 },
  actionBtnDanger: { borderColor: 'rgba(192,57,43,0.2)', backgroundColor: 'rgba(192,57,43,0.06)' },
  actionBtnText: { ...TYPO.U2, fontSize: 7, color: TACTICAL.text, letterSpacing: 2 },
  actionBtnTextDisabled: { color: TACTICAL.textMuted + '40' },

  // ══════════════════════════════════════════════════════════
  // BULK SELECT MODE STYLES
  // ══════════════════════════════════════════════════════════

  bulkPanel: {
    borderBottomWidth: 1,
    borderBottomColor: TACTICAL.amber + '30',
    backgroundColor: 'rgba(196,138,44,0.04)',
    paddingHorizontal: DENSITY.cardPad,
    paddingVertical: DENSITY.cardPad,
  },
  bulkHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  bulkHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bulkTitle: {
    ...TYPO.T3,
    color: TACTICAL.amber,
  },
  bulkExitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  bulkExitText: {
    ...TYPO.U2,
    fontSize: 8,
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
  bulkControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  bulkCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(62,79,60,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  bulkCountNumber: {
    ...TYPO.K2,
    fontSize: 16,
    color: TACTICAL.textMuted,
  },
  bulkCountLabel: {
    ...TYPO.U2,
    fontSize: 7,
    color: TACTICAL.textMuted,
    letterSpacing: 3,
  },
  bulkToggleRow: {
    flexDirection: 'row',
    gap: 6,
  },
  bulkToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: 'rgba(62,79,60,0.08)',
  },
  bulkToggleBtnActive: {
    borderColor: TACTICAL.amber + '60',
    backgroundColor: 'rgba(196,138,44,0.1)',
  },
  bulkToggleText: {
    ...TYPO.U2,
    fontSize: 8,
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },

  // Bulk Type Section
  bulkTypeSection: {
    marginTop: 2,
  },
  bulkTypeSectionLabel: {
    ...TYPO.U2,
    fontSize: 7,
    color: TACTICAL.textMuted,
    letterSpacing: 3,
    marginBottom: 6,
  },
  bulkApplyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: TACTICAL.amber + '60',
    backgroundColor: 'rgba(196,138,44,0.06)',
    marginTop: 10,
  },
  bulkApplyBtnText: {
    ...TYPO.U2,
    fontSize: 8,
    color: TACTICAL.amber,
    letterSpacing: 2,
  },

  // Bulk Confirm Banner
  bulkConfirmBanner: {
    marginTop: 10,
    backgroundColor: 'rgba(196,138,44,0.08)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '40',
    padding: 12,
  },
  bulkConfirmHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  bulkConfirmTitle: {
    ...TYPO.T3,
    fontSize: 11,
    color: TACTICAL.amber,
    letterSpacing: 3,
  },
  bulkConfirmText: {
    ...TYPO.B2,
    fontSize: 11,
    color: TACTICAL.text,
    lineHeight: 18,
    marginBottom: 10,
  },
  bulkConfirmHighlight: {
    fontWeight: '700',
    color: TACTICAL.amber,
  },
  bulkConfirmActions: {
    flexDirection: 'row',
    gap: 8,
  },
  bulkConfirmYes: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: TACTICAL.amber,
  },
  bulkConfirmYesText: {
    ...TYPO.U1,
    fontSize: 10,
    color: '#0B0F12',
    letterSpacing: 3,
  },
  bulkConfirmNo: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulkConfirmNoText: {
    ...TYPO.U2,
    fontSize: 9,
    color: TACTICAL.textMuted,
    letterSpacing: 3,
  },

  // Bulk Hint
  bulkHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(62,79,60,0.08)',
    borderRadius: 6,
  },
  bulkHintText: {
    ...TYPO.B2,
    fontSize: 10,
    color: TACTICAL.textMuted,
    flex: 1,
  },

  // Bulk Checkbox (replaces index badge in bulk mode)
  bulkCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: TACTICAL.border,
    backgroundColor: 'rgba(62,79,60,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulkCheckboxChecked: {
    borderColor: TACTICAL.amber,
    backgroundColor: TACTICAL.amber,
  },
  bulkCheckboxIndex: {
    ...TYPO.K3,
    fontSize: 9,
    color: TACTICAL.textMuted,
  },

  // Bulk row selected state
  wpRowBulkSelected: {
    backgroundColor: 'rgba(196,138,44,0.06)',
    borderWidth: 1,
    borderColor: TACTICAL.amber + '25',
  },
  wpNameBulkSelected: {
    color: TACTICAL.amber,
  },

  // Bulk checked indicator
  bulkCheckedIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(196,138,44,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulkCheckedDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: TACTICAL.amber,
  },

  // Bulk Select Toggle in list header
  bulkSelectToggle: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulkSelectToggleActive: {
    borderColor: TACTICAL.amber + '60',
    backgroundColor: 'rgba(196,138,44,0.12)',
  },

  // Confirm Delete Banner
  confirmBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: DENSITY.cardPad, paddingVertical: 10, backgroundColor: 'rgba(192,57,43,0.08)', borderBottomWidth: 1, borderBottomColor: 'rgba(192,57,43,0.15)' },
  confirmText: { ...TYPO.B2, color: TACTICAL.danger, flex: 1, fontSize: 11 },
  confirmYes: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: TACTICAL.danger },
  confirmYesText: { ...TYPO.U2, fontSize: 8, color: '#fff', letterSpacing: 3 },
  confirmNo: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: TACTICAL.border },
  confirmNoText: { ...TYPO.U2, fontSize: 8, color: TACTICAL.textMuted, letterSpacing: 3 },

  // List Header
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: DENSITY.cardPad, paddingTop: 10, paddingBottom: 6 },
  listHeaderText: { ...TYPO.T4, fontSize: 9, color: TACTICAL.textMuted, letterSpacing: 4 },
  listHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  listHeaderCount: { ...TYPO.U2, fontSize: 8, color: TACTICAL.textMuted, letterSpacing: 2 },
  filterToggleBtn: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterToggleBtnActive: {
    borderColor: TACTICAL.amber + '60',
    backgroundColor: 'rgba(196,138,44,0.08)',
  },
  filterActiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(196,138,44,0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  filterActiveText: {
    ...TYPO.U2,
    fontSize: 7,
    color: TACTICAL.amber,
    letterSpacing: 2,
  },
  filterActiveCount: {
    ...TYPO.K3,
    fontSize: 8,
    color: TACTICAL.amber,
  },

  // Type Filter Row
  typeFilterRow: {
    paddingHorizontal: DENSITY.cardPad,
    paddingBottom: 8,
  },
  typeFilterChips: {
    flexDirection: 'row',
    gap: 6,
    paddingRight: 8,
  },
  typeFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: 'rgba(62,79,60,0.06)',
  },
  typeFilterChipActive: {
    borderColor: TACTICAL.amber + '60',
    backgroundColor: 'rgba(196,138,44,0.1)',
  },
  typeFilterChipText: {
    ...TYPO.U2,
    fontSize: 7,
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
  typeFilterChipTextActive: {
    color: TACTICAL.amber,
  },
  typeFilterChipCount: {
    ...TYPO.K3,
    fontSize: 8,
    color: TACTICAL.textMuted,
  },

  // List
  listScroll: { maxHeight: 320, paddingHorizontal: DENSITY.cardPad - 4 },

  // Connector
  connectorRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 2, gap: 8 },
  connectorLine: { flex: 1, height: 1, backgroundColor: 'rgba(62,79,60,0.15)' },
  connectorDist: { ...TYPO.K3, fontSize: 8, color: TACTICAL.textMuted, letterSpacing: 1 },

  // Waypoint Row
  wpRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 8, borderRadius: 8, marginHorizontal: 2, marginVertical: 1, gap: 10 },
  wpRowSelected: { backgroundColor: 'rgba(196,138,44,0.08)', borderWidth: 1, borderColor: TACTICAL.amber + '30' },
  wpIndex: { width: 24, height: 24, borderRadius: 5, backgroundColor: 'rgba(62,79,60,0.2)', alignItems: 'center', justifyContent: 'center' },
  wpIndexSelected: { backgroundColor: TACTICAL.amber },
  wpIndexText: { ...TYPO.K3, fontSize: 10, color: TACTICAL.textMuted },
  wpIndexTextSelected: { color: '#0B0F12', fontWeight: '700' },
  wpInfo: { flex: 1 },
  wpNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  wpName: { ...TYPO.T3, fontSize: 11, color: TACTICAL.text, letterSpacing: 2, flexShrink: 1 },
  wpNameSelected: { color: TACTICAL.amber },
  wpCoords: { ...TYPO.B2, fontSize: 9, color: TACTICAL.textMuted, marginTop: 1, letterSpacing: 0.5 },

  // Type badge on waypoint row
  wpTypeBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 1,
  },
  wpTypeBadgeText: {
    ...TYPO.U2,
    fontSize: 6,
    letterSpacing: 2,
  },

  wpActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  selectedIndicator: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(196,138,44,0.3)', alignItems: 'center', justifyContent: 'center' },
  selectedDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: TACTICAL.amber },
  wpDeleteBtn: { padding: 4 },

  // Empty state
  emptyWpState: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  emptyWpText: { ...TYPO.B2, fontSize: 11, textAlign: 'center' },
  clearFilterText: { ...TYPO.U2, fontSize: 9, color: TACTICAL.amber, letterSpacing: 3, marginTop: 4 },
});



