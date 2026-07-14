/**
 * Navigate Bailouts
 *
 * Route-scoped bailout review for Departure Audit and active guidance.
 * Operators can drop, edit, remove, and complete bailout pins against the
 * active route/GPX so they remain available when the same route is reused.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeIcon as Ionicons } from '../components/SafeIcon';

import { TACTICAL, TYPO, DENSITY } from '../lib/theme';
import { useApp } from '../context/AppContext';
import {
  bailoutStore,
  BAILOUT_TYPES,
  getBailoutTypeMeta,
  type BailoutPoint,
  type BailoutType,
} from '../lib/bailoutStore';
import { runStore } from '../lib/runStore';
import { getMapboxToken, getMapboxTokenSync } from '../lib/mapConfig';
import { routeStore, type ImportedRoute } from '../lib/routeStore';
import {
  navigateRouteSessionStore,
  type NavigateRouteMapPoint,
} from '../lib/navigateRouteSessionStore';
import { expeditionReadinessStore } from '../lib/readiness/expeditionReadinessStore';
import { useECSNavigation } from '../lib/navigation/useECSNavigation';
import MapRenderer from '../components/navigate/MapRenderer';
import Toast from '../components/Toast';

type RoutePoint = {
  lat: number;
  lng: number;
};

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function validRoutePoint(lat: unknown, lng: unknown): RoutePoint | null {
  const nextLat = Number(lat);
  const nextLng = Number(lng);
  if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng)) return null;
  if (Math.abs(nextLat) > 90 || Math.abs(nextLng) > 180) return null;
  return { lat: nextLat, lng: nextLng };
}

function dedupeRoutePoints(points: RoutePoint[]): RoutePoint[] {
  const output: RoutePoint[] = [];
  for (const point of points) {
    const previous = output[output.length - 1];
    if (previous && Math.abs(previous.lat - point.lat) < 0.00001 && Math.abs(previous.lng - point.lng) < 0.00001) {
      continue;
    }
    output.push(point);
  }
  return output;
}

function routePointsFromSession(points: NavigateRouteMapPoint[]): RoutePoint[] {
  return dedupeRoutePoints(
    points
      .map((point) => validRoutePoint(point.lat, point.lng))
      .filter((point): point is RoutePoint => Boolean(point)),
  );
}

function routePointsFromImportedRoute(route: ImportedRoute | null | undefined): RoutePoint[] {
  const points: RoutePoint[] = [];
  for (const segment of route?.segments ?? []) {
    for (const point of segment.points ?? []) {
      const routePoint = validRoutePoint(point.lat, point.lon);
      if (routePoint) points.push(routePoint);
    }
  }
  return dedupeRoutePoints(points);
}

function resolveImportedRouteForReview(
  requestedRouteId: string,
  sessionRouteId: string | null | undefined,
  _routeStoreRevision: number,
): ImportedRoute | null {
  const requested = requestedRouteId ? routeStore.getById(requestedRouteId) : null;
  if (requested) return requested;
  const sessionRoute = sessionRouteId ? routeStore.getById(sessionRouteId) : null;
  return sessionRoute ?? routeStore.getActive();
}

function routePointsFromRun(run: ReturnType<typeof runStore.getById>): RoutePoint[] {
  return dedupeRoutePoints(
    (run?.points ?? [])
      .map((point) => validRoutePoint(point.lat, point.lng))
      .filter((point): point is RoutePoint => Boolean(point)),
  );
}

function computeRoutePointBounds(points: RoutePoint[]) {
  if (points.length === 0) return null;
  return points.reduce(
    (bounds, point) => ({
      minLat: Math.min(bounds.minLat, point.lat),
      maxLat: Math.max(bounds.maxLat, point.lat),
      minLng: Math.min(bounds.minLng, point.lng),
      maxLng: Math.max(bounds.maxLng, point.lng),
    }),
    {
      minLat: points[0].lat,
      maxLat: points[0].lat,
      minLng: points[0].lng,
      maxLng: points[0].lng,
    },
  );
}

function recomputeReadinessAfterBailoutChange() {
  try {
    expeditionReadinessStore.recomputeReadiness({
      immediate: true,
      reason: 'route_bailouts_changed',
    });
  } catch {}
}

export default function NavigateBailouts() {
  const { back: goBack } = useECSNavigation();
  const { showToast } = useApp();
  const params = useLocalSearchParams<{
    runId?: string | string[];
    routeId?: string | string[];
    bailoutId?: string | string[];
  }>();

  const requestedRunId = firstParam(params.runId);
  const requestedRouteId = firstParam(params.routeId);
  const requestedBailoutId = firstParam(params.bailoutId);
  const openedParamBailoutRef = useRef<string | null>(null);

  const [routeSession, setRouteSession] = useState(() => navigateRouteSessionStore.getSnapshot());
  const [routeStoreRevision, setRouteStoreRevision] = useState(0);
  const [mapboxToken, setMapboxToken] = useState(() => getMapboxTokenSync());
  const [allBailouts, setAllBailouts] = useState<BailoutPoint[]>(() => bailoutStore.getAll());
  const [routeBailouts, setRouteBailouts] = useState<BailoutPoint[]>([]);
  const [runBailoutIds, setRunBailoutIds] = useState<Set<string>>(new Set());
  const [filterType, setFilterType] = useState<BailoutType | 'all'>('all');
  const [selectedDropType, setSelectedDropType] = useState<BailoutType>('bailout');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingBailout, setEditingBailout] = useState<BailoutPoint | null>(null);

  const [formTitle, setFormTitle] = useState('');
  const [formType, setFormType] = useState<BailoutType>('bailout');
  const [formLat, setFormLat] = useState('');
  const [formLng, setFormLng] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formPriority, setFormPriority] = useState('0');

  useEffect(() => navigateRouteSessionStore.subscribe(setRouteSession), []);
  useEffect(() => routeStore.subscribe(() => setRouteStoreRevision((value) => value + 1)), []);

  useEffect(() => {
    if (mapboxToken) return;
    let mounted = true;
    getMapboxToken()
      .then((token) => {
        if (mounted) setMapboxToken(token);
      })
      .catch(() => {
        if (mounted) setMapboxToken('');
      });
    return () => {
      mounted = false;
    };
  }, [mapboxToken]);

  const run = useMemo(
    () => (requestedRunId ? runStore.getById(requestedRunId) : null),
    [requestedRunId],
  );

  const activeImportedRoute = resolveImportedRouteForReview(
    requestedRouteId,
    routeSession.routeId,
    routeStoreRevision,
  );

  const activeRouteId = useMemo(() => {
    return (
      requestedRouteId ||
      requestedRunId ||
      routeSession.routeId ||
      activeImportedRoute?.id ||
      run?.id ||
      routeSession.sessionId ||
      ''
    );
  }, [activeImportedRoute?.id, requestedRouteId, requestedRunId, routeSession.routeId, routeSession.sessionId, run?.id]);

  const routeLabel = useMemo(() => {
    return routeSession.routeTitle || activeImportedRoute?.name || run?.title || 'Active guidance route';
  }, [activeImportedRoute?.name, routeSession.routeTitle, run?.title]);

  const routeMapPoints = useMemo(() => {
    const sessionPoints = routePointsFromSession(routeSession.routePoints);
    if (sessionPoints.length > 1) return sessionPoints;
    const importedRoutePoints = routePointsFromImportedRoute(activeImportedRoute);
    if (importedRoutePoints.length > 1) return importedRoutePoints;
    return routePointsFromRun(run);
  }, [activeImportedRoute, routeSession.routePoints, run]);

  const refreshBailouts = useCallback(() => {
    const nextAll = bailoutStore.getAll();
    const nextRouteBailouts = activeRouteId ? bailoutStore.getRunBailouts(activeRouteId) : [];
    setAllBailouts(nextAll);
    setRouteBailouts(nextRouteBailouts);
    setRunBailoutIds(new Set(nextRouteBailouts.map((bailout) => bailout.id)));
  }, [activeRouteId]);

  useEffect(() => {
    refreshBailouts();
  }, [refreshBailouts]);

  const visibleBailouts = activeRouteId ? routeBailouts : allBailouts;
  const filteredBailouts = useMemo(() => {
    if (filterType === 'all') return visibleBailouts;
    return visibleBailouts.filter((bailout) => bailout.type === filterType);
  }, [filterType, visibleBailouts]);

  const routeBailoutMarkers = useMemo(() => {
    return routeBailouts.map((bp) => {
      const meta = getBailoutTypeMeta(bp.type);
      return {
        id: bp.id,
        lat: bp.lat,
        lng: bp.lng,
        title: bp.title,
        subtitle: meta.label,
        type: bp.type,
        color: meta.color,
      };
    });
  }, [routeBailouts]);

  const resetForm = useCallback((dropType: BailoutType = selectedDropType) => {
    setEditingBailout(null);
    setFormTitle('');
    setFormType(dropType);
    setFormLat('');
    setFormLng('');
    setFormNotes('');
    setFormPriority('60');
  }, [selectedDropType]);

  const handleAdd = useCallback(() => {
    resetForm();
    setShowAddModal(true);
  }, [resetForm]);

  const handleEdit = useCallback((bp: BailoutPoint) => {
    setEditingBailout(bp);
    setFormTitle(bp.title);
    setFormType(bp.type);
    setFormLat(bp.lat.toString());
    setFormLng(bp.lng.toString());
    setFormNotes(bp.notes || '');
    setFormPriority(bp.priority.toString());
    setShowAddModal(true);
  }, []);

  useEffect(() => {
    if (!requestedBailoutId || openedParamBailoutRef.current === requestedBailoutId) return;
    const bailout = bailoutStore.getById(requestedBailoutId);
    if (!bailout) return;
    openedParamBailoutRef.current = requestedBailoutId;
    handleEdit(bailout);
  }, [handleEdit, requestedBailoutId]);

  const handleBailoutMarkerTap = useCallback((payload: any) => {
    const bailoutId = typeof payload?.id === 'string' ? payload.id : null;
    const bailout = bailoutId ? bailoutStore.getById(bailoutId) : null;
    if (!bailout) return;
    handleEdit(bailout);
  }, [handleEdit]);

  const handleSave = useCallback(() => {
    const lat = parseFloat(formLat);
    const lng = parseFloat(formLng);
    if (!formTitle.trim()) {
      showToast('Title is required');
      return;
    }
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      showToast('Valid coordinates required');
      return;
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      showToast('Coordinates out of range');
      return;
    }

    if (editingBailout) {
      bailoutStore.update(editingBailout.id, {
        title: formTitle.trim(),
        type: formType,
        lat,
        lng,
        notes: formNotes.trim() || null,
        priority: parseInt(formPriority, 10) || 0,
      });
      if (activeRouteId) bailoutStore.addBailoutToRun(activeRouteId, editingBailout.id);
      showToast('BAILOUT UPDATED');
    } else {
      const created = bailoutStore.create({
        title: formTitle.trim(),
        type: formType,
        lat,
        lng,
        notes: formNotes.trim() || undefined,
        priority: parseInt(formPriority, 10) || 0,
      });
      if (activeRouteId) bailoutStore.addBailoutToRun(activeRouteId, created.id);
      showToast(activeRouteId ? 'ROUTE BAILOUT CREATED' : 'BAILOUT CREATED');
    }

    recomputeReadinessAfterBailoutChange();
    setShowAddModal(false);
    refreshBailouts();
  }, [activeRouteId, editingBailout, formLat, formLng, formNotes, formPriority, formTitle, formType, refreshBailouts, showToast]);

  const handleDelete = useCallback((bp: BailoutPoint) => {
    const doDelete = () => {
      bailoutStore.delete(bp.id);
      recomputeReadinessAfterBailoutChange();
      if (editingBailout?.id === bp.id) {
        setShowAddModal(false);
        setEditingBailout(null);
      }
      showToast('BAILOUT DELETED');
      refreshBailouts();
    };
    if (Platform.OS === 'web') {
      if (confirm(`Delete "${bp.title}"?`)) doDelete();
    } else {
      Alert.alert('Delete Bailout', `Remove "${bp.title}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  }, [editingBailout?.id, refreshBailouts, showToast]);

  const handleToggleRunBailout = useCallback((bailoutId: string) => {
    if (!activeRouteId) return;
    if (runBailoutIds.has(bailoutId)) {
      bailoutStore.removeBailoutFromRun(activeRouteId, bailoutId);
    } else {
      bailoutStore.addBailoutToRun(activeRouteId, bailoutId);
    }
    recomputeReadinessAfterBailoutChange();
    refreshBailouts();
  }, [activeRouteId, refreshBailouts, runBailoutIds]);

  const handleDropRouteBailoutPoint = useCallback((coord: { latitude: number; longitude: number }) => {
    if (!activeRouteId) {
      showToast('No active route is available for bailout review');
      return;
    }
    const lat = Number(coord.latitude);
    const lng = Number(coord.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const meta = getBailoutTypeMeta(selectedDropType);
    const routeCount = bailoutStore.getRunBailouts(activeRouteId).length;
    const created = bailoutStore.create({
      title: `${meta.label} ${String(routeCount + 1).padStart(2, '0')}`,
      type: selectedDropType,
      lat,
      lng,
      notes: `Operator dropped during active route bailout review for ${routeLabel}.`,
      priority: selectedDropType === 'bailout' || selectedDropType === 'alternate_route' ? 80 : 60,
    });
    bailoutStore.addBailoutToRun(activeRouteId, created.id);
    recomputeReadinessAfterBailoutChange();
    refreshBailouts();
    showToast(`${meta.label.toUpperCase()} PIN DROPPED`);
  }, [activeRouteId, refreshBailouts, routeLabel, selectedDropType, showToast]);

  const handleAutoSuggest = useCallback(() => {
    if (!activeRouteId) {
      showToast('No active route selected for auto-suggest');
      return;
    }
    if (routeMapPoints.length < 2) {
      showToast('Route geometry is not available for auto-suggest');
      return;
    }
    const bounds = computeRoutePointBounds(routeMapPoints);
    if (!bounds) {
      showToast('Route bounds are unavailable');
      return;
    }
    const suggested = bailoutStore.autoSuggest(bounds, 25);
    if (suggested.length === 0) {
      showToast('No saved bailouts found near this route');
      return;
    }
    const existingIds = bailoutStore.getRunBailouts(activeRouteId).map((point) => point.id);
    const mergedIds = Array.from(new Set([...existingIds, ...suggested.map((point) => point.id)]));
    bailoutStore.setRunBailouts(activeRouteId, mergedIds);
    recomputeReadinessAfterBailoutChange();
    refreshBailouts();
    showToast(`${suggested.length} BAILOUTS REVIEWED FOR ROUTE`);
  }, [activeRouteId, refreshBailouts, routeMapPoints, showToast]);

  const handleCompleteReview = useCallback(() => {
    const routeCount = activeRouteId ? bailoutStore.getRunBailouts(activeRouteId).length : 0;
    if (!activeRouteId || routeCount === 0) {
      showToast('Drop or attach at least one bailout point before completing review');
      return;
    }
    recomputeReadinessAfterBailoutChange();
    showToast('BAILOUT REVIEW COMPLETE');
    goBack();
  }, [activeRouteId, goBack, showToast]);

  const selectedDropMeta = getBailoutTypeMeta(selectedDropType);
  const hasRouteGeometry = routeMapPoints.length > 1;
  const hasMapboxToken = Boolean(mapboxToken);

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={TACTICAL.text} />
        </TouchableOpacity>
        <View style={styles.topTitleBlock}>
          <Text style={styles.topTitle}>BAILOUT REVIEW</Text>
          <Text style={styles.topSubtitle} numberOfLines={1}>{routeLabel}</Text>
        </View>
        <Text style={styles.countBadge}>{routeBailouts.length}</Text>
      </View>

      <View style={styles.routeBanner}>
        <Ionicons name="navigate-outline" size={14} color={TACTICAL.amber} />
        <Text style={styles.routeBannerText} numberOfLines={1}>
          {activeRouteId ? 'Pins attach to this route for active guidance and future GPX reuse.' : 'Open an active route to attach bailout pins.'}
        </Text>
      </View>

      <View style={styles.mapPanel}>
        <MapRenderer
          points={routeMapPoints}
          routeRenderMode="active"
          routeColor={TACTICAL.amber}
          mapStyle="tactical"
          mapboxToken={mapboxToken || ''}
          hasToken={hasMapboxToken}
          interactive
          bailoutMarkers={routeBailoutMarkers}
          onMapTap={handleDropRouteBailoutPoint}
          onBailoutTap={handleBailoutMarkerTap}
          cameraMode="route_overview"
          showUserLocation
          style={styles.routeMap}
        />

        <View style={styles.mapTopOverlay}>
          <View style={[styles.dropModeBadge, { borderColor: selectedDropMeta.color + '80' }]}>
            <Ionicons name={selectedDropMeta.icon as any} size={13} color={selectedDropMeta.color} />
            <Text style={[styles.dropModeText, { color: selectedDropMeta.color }]}>
              {selectedDropMeta.label.toUpperCase()}
            </Text>
          </View>
          <TouchableOpacity onPress={handleCompleteReview} style={styles.completeBtn} activeOpacity={0.85}>
            <Ionicons name="checkmark" size={14} color="#0B0F12" />
            <Text style={styles.completeBtnText}>COMPLETE</Text>
          </TouchableOpacity>
        </View>

        {!hasRouteGeometry && (
          <View style={styles.mapEmptyOverlay}>
            <Ionicons name="map-outline" size={22} color={TACTICAL.textMuted} />
            <Text style={styles.mapEmptyTitle}>ROUTE GEOMETRY UNAVAILABLE</Text>
            <Text style={styles.mapEmptyBody}>Use manual coordinates below until the active route reloads.</Text>
          </View>
        )}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.dropTypeRail}
          contentContainerStyle={styles.dropTypeRailContent}
        >
          {BAILOUT_TYPES.map((typeOption) => (
            <TouchableOpacity
              key={typeOption.key}
              style={[
                styles.dropTypeChip,
                selectedDropType === typeOption.key && {
                  borderColor: typeOption.color,
                  backgroundColor: typeOption.color + '18',
                },
              ]}
              onPress={() => setSelectedDropType(typeOption.key)}
            >
              <Ionicons
                name={typeOption.icon as any}
                size={12}
                color={selectedDropType === typeOption.key ? typeOption.color : TACTICAL.textMuted}
              />
              <Text
                style={[
                  styles.dropTypeChipText,
                  selectedDropType === typeOption.key && { color: typeOption.color },
                ]}
              >
                {typeOption.label.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity onPress={handleAdd} style={styles.secondaryActionBtn}>
          <Ionicons name="add-circle-outline" size={14} color={TACTICAL.text} />
          <Text style={styles.secondaryActionText}>MANUAL PIN</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleAutoSuggest} style={styles.secondaryActionBtn}>
          <Ionicons name="sparkles-outline" size={14} color={TACTICAL.amber} />
          <Text style={styles.secondaryActionText}>AUTO REVIEW</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={styles.filterBarContent}>
        <TouchableOpacity
          style={[styles.filterChip, filterType === 'all' && styles.filterChipActive]}
          onPress={() => setFilterType('all')}
        >
          <Text style={[styles.filterChipText, filterType === 'all' && styles.filterChipTextActive]}>ALL</Text>
        </TouchableOpacity>
        {BAILOUT_TYPES.map((bt) => (
          <TouchableOpacity
            key={bt.key}
            style={[styles.filterChip, filterType === bt.key && styles.filterChipActive]}
            onPress={() => setFilterType(bt.key)}
          >
            <Ionicons name={bt.icon as any} size={11} color={filterType === bt.key ? '#0B0F12' : bt.color} />
            <Text style={[styles.filterChipText, filterType === bt.key && styles.filterChipTextActive]}>
              {bt.label.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {filteredBailouts.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="flag-outline" size={36} color={TACTICAL.textMuted} />
            <Text style={styles.emptyTitle}>NO ROUTE BAILOUT POINTS</Text>
            <Text style={styles.emptyBody}>
              Choose a pin type, tap along the active route, then complete the review to update Departure Audit.
            </Text>
          </View>
        )}

        {filteredBailouts.map((bp) => {
          const meta = getBailoutTypeMeta(bp.type);
          const isSelected = runBailoutIds.has(bp.id);

          return (
            <TouchableOpacity
              key={bp.id}
              style={[styles.bailoutCard, isSelected && styles.bailoutCardSelected]}
              onPress={() => handleEdit(bp)}
              activeOpacity={0.85}
            >
              <View style={styles.bailoutRow}>
                {activeRouteId && (
                  <TouchableOpacity
                    style={styles.selectBtn}
                    onPress={() => handleToggleRunBailout(bp.id)}
                  >
                    <Ionicons
                      name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                      size={20}
                      color={isSelected ? '#66BB6A' : TACTICAL.textMuted}
                    />
                  </TouchableOpacity>
                )}

                <View style={[styles.typeIcon, { backgroundColor: meta.color + '18' }]}>
                  <Ionicons name={meta.icon as any} size={16} color={meta.color} />
                </View>

                <View style={styles.bailoutInfo}>
                  <Text style={styles.bailoutTitle} numberOfLines={1}>{bp.title}</Text>
                  <View style={styles.bailoutMeta}>
                    <Text style={[styles.bailoutType, { color: meta.color }]}>{meta.label}</Text>
                    <Text style={styles.bailoutCoords}>
                      {bp.lat.toFixed(5)}, {bp.lng.toFixed(5)}
                    </Text>
                  </View>
                  {bp.notes && (
                    <Text style={styles.bailoutNotes} numberOfLines={1}>{bp.notes}</Text>
                  )}
                </View>

                <View style={styles.bailoutActions}>
                  {bp.priority > 0 && (
                    <View style={styles.priorityBadge}>
                      <Text style={styles.priorityText}>P{bp.priority}</Text>
                    </View>
                  )}
                  <TouchableOpacity onPress={() => handleEdit(bp)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="pencil-outline" size={14} color={TACTICAL.textMuted} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(bp)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="trash-outline" size={14} color={TACTICAL.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}

        <View style={{ height: 120 }} />
      </ScrollView>

      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <ScrollView>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {editingBailout ? 'EDIT BAILOUT' : 'ADD ROUTE BAILOUT'}
                </Text>
                <TouchableOpacity onPress={() => setShowAddModal(false)}>
                  <Ionicons name="close" size={22} color={TACTICAL.textMuted} />
                </TouchableOpacity>
              </View>

              <View style={styles.formSection}>
                <FormField label="TITLE" value={formTitle} onChangeText={setFormTitle} placeholder="e.g. South exit pavement" />

                <Text style={styles.formLabel}>TYPE</Text>
                <View style={styles.typeGrid}>
                  {BAILOUT_TYPES.map((bt) => (
                    <TouchableOpacity
                      key={bt.key}
                      style={[styles.typeOption, formType === bt.key && { borderColor: bt.color, backgroundColor: bt.color + '10' }]}
                      onPress={() => setFormType(bt.key)}
                    >
                      <Ionicons name={bt.icon as any} size={14} color={formType === bt.key ? bt.color : TACTICAL.textMuted} />
                      <Text style={[styles.typeOptionText, formType === bt.key && { color: bt.color }]}>
                        {bt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.coordRow}>
                  <View style={styles.coordField}>
                    <FormField label="LATITUDE" value={formLat} onChangeText={setFormLat} placeholder="35.12345" keyboardType="numeric" />
                  </View>
                  <View style={styles.coordField}>
                    <FormField label="LONGITUDE" value={formLng} onChangeText={setFormLng} placeholder="-111.67890" keyboardType="numeric" />
                  </View>
                </View>

                <FormField label="NOTES (OPTIONAL)" value={formNotes} onChangeText={setFormNotes} placeholder="Access, hours, gate, or field notes..." multiline />
                <FormField label="PRIORITY (0-100)" value={formPriority} onChangeText={setFormPriority} placeholder="60" keyboardType="numeric" />
              </View>

              {editingBailout && (
                <TouchableOpacity style={styles.removeModalBtn} onPress={() => handleDelete(editingBailout)}>
                  <Ionicons name="trash-outline" size={14} color="#EF5350" />
                  <Text style={styles.removeModalText}>REMOVE PIN</Text>
                </TouchableOpacity>
              )}

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAddModal(false)}>
                  <Text style={styles.cancelBtnText}>CANCEL</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.8}>
                  <Ionicons name="checkmark" size={16} color="#0B0F12" />
                  <Text style={styles.saveBtnText}>{editingBailout ? 'UPDATE' : 'CREATE'}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Toast />
    </View>
  );
}

function FormField({ label, value, onChangeText, placeholder, keyboardType, multiline }: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: 'numeric' | 'default';
  multiline?: boolean;
}) {
  return (
    <View style={styles.formField}>
      <Text style={styles.formLabel}>{label}</Text>
      <TextInput
        style={[styles.formInput, multiline && { height: 60, textAlignVertical: 'top' }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={TACTICAL.textMuted + '60'}
        keyboardType={keyboardType}
        multiline={multiline}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: TACTICAL.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'web' ? 16 : 54,
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: TACTICAL.border,
    gap: 8,
  },
  backBtn: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  topTitleBlock: { flex: 1, gap: 2 },
  topTitle: { ...TYPO.T2, color: TACTICAL.amber },
  topSubtitle: { ...TYPO.K3, color: TACTICAL.textMuted, fontSize: 10 },
  countBadge: {
    ...TYPO.K3,
    color: TACTICAL.textMuted,
    fontSize: 11,
    backgroundColor: 'rgba(62,79,60,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  routeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: DENSITY.screenPad,
    paddingVertical: 8,
    backgroundColor: 'rgba(196,138,44,0.06)',
    borderBottomWidth: 1,
    borderBottomColor: TACTICAL.amber + '20',
  },
  routeBannerText: { ...TYPO.B2, fontSize: 11, color: TACTICAL.text, flex: 1 },
  mapPanel: {
    height: 300,
    borderBottomWidth: 1,
    borderBottomColor: TACTICAL.border,
    backgroundColor: '#060909',
  },
  routeMap: { flex: 1 },
  mapTopOverlay: {
    position: 'absolute',
    left: 10,
    right: 10,
    top: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  dropModeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: 'rgba(6,9,9,0.78)',
  },
  dropModeText: { ...TYPO.U2, fontSize: 8 },
  completeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: TACTICAL.amber,
  },
  completeBtnText: { ...TYPO.U1, color: '#0B0F12', fontSize: 9 },
  mapEmptyOverlay: {
    position: 'absolute',
    left: 20,
    right: 20,
    top: 90,
    alignItems: 'center',
    gap: 6,
    padding: 14,
    borderRadius: 8,
    backgroundColor: 'rgba(6,9,9,0.84)',
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  mapEmptyTitle: { ...TYPO.T3, color: TACTICAL.text, fontSize: 11 },
  mapEmptyBody: { ...TYPO.B2, color: TACTICAL.textMuted, textAlign: 'center', fontSize: 10, lineHeight: 15 },
  dropTypeRail: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 8,
    maxHeight: 42,
  },
  dropTypeRailContent: {
    gap: 6,
    paddingHorizontal: 10,
  },
  dropTypeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(6,9,9,0.78)',
  },
  dropTypeChipText: { ...TYPO.U2, fontSize: 8, color: TACTICAL.textMuted },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: DENSITY.screenPad,
    paddingTop: 10,
  },
  secondaryActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: 'rgba(62,79,60,0.07)',
  },
  secondaryActionText: { ...TYPO.U2, color: TACTICAL.text, fontSize: 9 },
  filterBar: { maxHeight: 44 },
  filterBarContent: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: DENSITY.screenPad,
    paddingVertical: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: 'rgba(62,79,60,0.05)',
  },
  filterChipActive: {
    backgroundColor: TACTICAL.amber,
    borderColor: TACTICAL.amber,
  },
  filterChipText: { ...TYPO.U2, fontSize: 8, color: TACTICAL.textMuted },
  filterChipTextActive: { color: '#0B0F12' },
  list: { flex: 1 },
  listContent: { padding: DENSITY.screenPad, gap: 8 },
  emptyState: { alignItems: 'center', padding: 32, gap: 8 },
  emptyTitle: { ...TYPO.T2, color: TACTICAL.text },
  emptyBody: { ...TYPO.B2, textAlign: 'center', lineHeight: 18, fontSize: 11 },
  bailoutCard: {
    backgroundColor: TACTICAL.panel,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    padding: 12,
  },
  bailoutCardSelected: {
    borderColor: '#66BB6A40',
    backgroundColor: 'rgba(102,187,106,0.04)',
  },
  bailoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  selectBtn: { width: 28, alignItems: 'center' },
  typeIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bailoutInfo: { flex: 1, gap: 2 },
  bailoutTitle: { ...TYPO.T3, color: TACTICAL.text, fontSize: 12 },
  bailoutMeta: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  bailoutType: { ...TYPO.U2, fontSize: 8 },
  bailoutCoords: { ...TYPO.K3, fontSize: 9, color: TACTICAL.textMuted },
  bailoutNotes: { ...TYPO.B2, fontSize: 10, color: TACTICAL.textMuted },
  bailoutActions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  priorityBadge: {
    backgroundColor: 'rgba(196,138,44,0.15)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  priorityText: { ...TYPO.U2, fontSize: 7, color: TACTICAL.amber },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalContainer: {
    backgroundColor: TACTICAL.panel,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '90%',
    borderTopWidth: 2,
    borderColor: TACTICAL.amber + '40',
    paddingBottom: Platform.OS === 'web' ? 20 : 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: DENSITY.modalPad,
    borderBottomWidth: 1,
    borderBottomColor: TACTICAL.border,
  },
  modalTitle: { ...TYPO.T2, color: TACTICAL.amber },
  formSection: { padding: DENSITY.modalPad, gap: 12 },
  formField: { gap: 4 },
  formLabel: { ...TYPO.T4, fontSize: 8, letterSpacing: 3 },
  formInput: {
    ...TYPO.B1,
    color: TACTICAL.text,
    backgroundColor: 'rgba(62,79,60,0.08)',
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  typeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  typeOptionText: { ...TYPO.U2, fontSize: 8, color: TACTICAL.textMuted },
  coordRow: { flexDirection: 'row', gap: 10 },
  coordField: { flex: 1 },
  removeModalBtn: {
    marginHorizontal: DENSITY.modalPad,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EF535050',
    backgroundColor: 'rgba(239,83,80,0.06)',
  },
  removeModalText: { ...TYPO.U2, color: '#EF5350', fontSize: 9 },
  modalActions: { flexDirection: 'row', gap: 10, padding: DENSITY.modalPad, paddingTop: 8 },
  cancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  cancelBtnText: { ...TYPO.U2, color: TACTICAL.textMuted, fontSize: 9 },
  saveBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: TACTICAL.amber,
  },
  saveBtnText: { ...TYPO.U1, color: '#0B0F12' },
});
