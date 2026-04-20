import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';

import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Platform, ActivityIndicator, TextInput, Modal,
} from 'react-native';

import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';

import { SafeIcon as Ionicons } from '../components/SafeIcon';

import { TACTICAL } from '../lib/theme';
import { useApp } from '../context/AppContext';

import TopoBackground from '../components/TopoBackground';

import { routeCommandStore, waypointCommandStore } from '../lib/expeditionCommandStore';

import type {
  EcsRoute,
  EcsWaypoint,
  EcsWaypointKind,
} from '../lib/expeditionTypes';

import { WAYPOINT_KIND_META } from '../lib/expeditionTypes';

import GpxImportModal from '../components/expedition/GpxImportModal';
import GeoJsonImportModal from '../components/expedition/GeoJsonImportModal';
import KmlImportModal from '../components/expedition/KmlImportModal';

const WAYPOINT_KINDS = Object.entries(WAYPOINT_KIND_META) as [EcsWaypointKind, typeof WAYPOINT_KIND_META['waypoint']][];

const GEOJSON_COLOR = '#10B981';
const KML_COLOR = '#3B82F6';

/** Safely format a numeric-ish value with .toFixed(), returning fallback if not a valid number */
function safeFixed(val: any, digits: number, fallback = '--'): string {
  if (val == null) return fallback;
  const n = Number(val);
  return isNaN(n) ? fallback : n.toFixed(digits);
}

/** Detect import source from route source and waypoint meta */
function detectImportSource(source: string | null | undefined, meta?: Record<string, any>): 'gpx' | 'geojson' | 'kml' | null {
  const s = (source || '').toLowerCase();
  const importedFrom = (meta?.imported_from || '').toLowerCase();

  if (s === 'kml' || s.includes('google earth') || s.includes('google my maps') || importedFrom.endsWith('.kml') || importedFrom.endsWith('.kmz')) return 'kml';
  if (s === 'geojson' || s.includes('mapbox') || s.includes('leaflet') || importedFrom.endsWith('.geojson') || importedFrom.endsWith('.json')) return 'geojson';
  if (s === 'gpx' || s.includes('gaia') || s.includes('garmin') || s.includes('caltopo') || s.includes('alltrails') || importedFrom.endsWith('.gpx')) return 'gpx';

  return null;
}


export default function ExpeditionRouteMgrScreen() {
  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  const router = useRouter();
  const { user, isOnline } = useApp();
  const params = useLocalSearchParams<{ id?: string }>();
  const expeditionId = params.id || '';

  const [routes, setRoutes] = useState<EcsRoute[]>([]);
  const [waypoints, setWaypoints] = useState<EcsWaypoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);

  // Add route modal
  const [addRouteVisible, setAddRouteVisible] = useState(false);
  const [routeName, setRouteName] = useState('');
  const [routeSource, setRouteSource] = useState('manual');
  const [routeDistance, setRouteDistance] = useState('');
  const [routeEta, setRouteEta] = useState('');
  const [routeSaving, setRouteSaving] = useState(false);

  // Add waypoint modal
  const [addWpVisible, setAddWpVisible] = useState(false);
  const [wpTitle, setWpTitle] = useState('');
  const [wpKind, setWpKind] = useState<EcsWaypointKind>('waypoint');
  const [wpLat, setWpLat] = useState('');
  const [wpLng, setWpLng] = useState('');
  const [wpSaving, setWpSaving] = useState(false);

  // File import modals
  const [gpxImportVisible, setGpxImportVisible] = useState(false);
  const [geojsonImportVisible, setGeojsonImportVisible] = useState(false);
  const [kmlImportVisible, setKmlImportVisible] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user || !expeditionId) return;
    if (mountedRef.current) setLoading(true);
    try {
      const [rts, wps] = await Promise.all([
        routeCommandStore.list(expeditionId, user.id),
        waypointCommandStore.list(expeditionId, user.id),
      ]);
      if (!mountedRef.current) return;
      setRoutes(rts);
      setWaypoints(wps);
      if (rts.length > 0 && !selectedRouteId) setSelectedRouteId(rts[0].id);
    } catch (err) {
      console.warn('[ExpeditionRouteMgr] fetchData error:', err);
    }
    if (mountedRef.current) setLoading(false);
  }, [user, expeditionId, selectedRouteId]);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const selectedRoute = useMemo(() => routes.find(r => r.id === selectedRouteId), [routes, selectedRouteId]);
  const routeWaypoints = useMemo(() => {
    if (!selectedRouteId) return waypoints;
    return waypoints.filter(w => w.route_id === selectedRouteId || !w.route_id);
  }, [waypoints, selectedRouteId]);

  const handleAddRoute = async () => {
    if (!user || !expeditionId || routeSaving) return;
    setRouteSaving(true);
    try {
      const route = await routeCommandStore.create(user.id, {
        expedition_id: expeditionId,
        name: routeName.trim() || 'New Route',
        source: routeSource,
        distance_mi: routeDistance ? parseFloat(routeDistance) : undefined,
        eta_hours: routeEta ? parseFloat(routeEta) : undefined,
      });
      if (!mountedRef.current) return;
      if (route) {
        setRoutes(prev => [...prev, route]);
        setSelectedRouteId(route.id);
      }
      setRouteName('');
      setRouteDistance('');
      setRouteEta('');
      setAddRouteVisible(false);
    } catch (err) {
      console.warn('[ExpeditionRouteMgr] handleAddRoute error:', err);
    }
    if (mountedRef.current) setRouteSaving(false);
  };

  const handleAddWaypoint = async () => {
    if (!user || !expeditionId || wpSaving) return;
    setWpSaving(true);
    try {
      const wp = await waypointCommandStore.create(user.id, {
        expedition_id: expeditionId,
        route_id: selectedRouteId,
        title: wpTitle.trim() || undefined,
        kind: wpKind,
        lat: wpLat ? parseFloat(wpLat) : undefined,
        lng: wpLng ? parseFloat(wpLng) : undefined,
      });
      if (!mountedRef.current) return;
      if (wp) setWaypoints(prev => [...prev, wp]);
      setWpTitle('');
      setWpLat('');
      setWpLng('');
      setAddWpVisible(false);
    } catch (err) {
      console.warn('[ExpeditionRouteMgr] handleAddWaypoint error:', err);
    }
    if (mountedRef.current) setWpSaving(false);
  };

  const handleDeleteWaypoint = async (id: string) => {
    if (mountedRef.current) setWaypoints(prev => prev.filter(w => w.id !== id));
    try {
      await waypointCommandStore.remove(id);
    } catch (err) {
      console.warn('[ExpeditionRouteMgr] handleDeleteWaypoint error:', err);
    }
  };

  const handleImportComplete = useCallback(() => {
    fetchData();
  }, [fetchData]);

  if (!user) return null;

  return (
    <TopoBackground>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={20} color={TACTICAL.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerBrand}>ROUTE MANAGEMENT</Text>
            <Text style={styles.headerCount}>
              {routes.length} ROUTE{routes.length !== 1 ? 'S' : ''} / {waypoints.length} WAYPOINTS
            </Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.gpxImportHeaderBtn} onPress={() => setGpxImportVisible(true)} activeOpacity={0.7}>
              <Ionicons name="document-attach-outline" size={14} color={TACTICAL.amber} />
              <Text style={styles.gpxImportHeaderBtnText}>GPX</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.geojsonImportHeaderBtn} onPress={() => setGeojsonImportVisible(true)} activeOpacity={0.7}>
              <Ionicons name="code-slash-outline" size={14} color={GEOJSON_COLOR} />
              <Text style={styles.geojsonImportHeaderBtnText}>GJ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.kmlImportHeaderBtn} onPress={() => setKmlImportVisible(true)} activeOpacity={0.7}>
              <Ionicons name="earth-outline" size={14} color={KML_COLOR} />
              <Text style={styles.kmlImportHeaderBtnText}>KML</Text>
            </TouchableOpacity>
          </View>
        </View>


        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={TACTICAL.accent} />
          </View>
        ) : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

            {/* Import Cards — GPX + GeoJSON + KML */}
            <View style={styles.importCardsRow}>
              <TouchableOpacity
                style={styles.gpxImportCard}
                onPress={() => setGpxImportVisible(true)}
                activeOpacity={0.7}
              >
                <View style={styles.gpxImportCardIcon}>
                  <Ionicons name="document-attach-outline" size={18} color={TACTICAL.amber} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.gpxImportCardTitle}>IMPORT GPX</Text>
                  <Text style={styles.gpxImportCardSub}>Garmin, Gaia, CalTopo, AllTrails</Text>
                </View>
                <View style={styles.gpxImportCardBadge}>
                  <Text style={styles.gpxImportCardBadgeText}>.GPX</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.geojsonImportCard}
                onPress={() => setGeojsonImportVisible(true)}
                activeOpacity={0.7}
              >
                <View style={styles.geojsonImportCardIcon}>
                  <Ionicons name="code-slash-outline" size={18} color={GEOJSON_COLOR} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.geojsonImportCardTitle}>IMPORT GEOJSON</Text>
                  <Text style={styles.geojsonImportCardSub}>Mapbox, Leaflet, QGIS, D3</Text>
                </View>
                <View style={styles.geojsonImportCardBadge}>
                  <Text style={styles.geojsonImportCardBadgeText}>.GEOJSON</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.kmlImportCard}
                onPress={() => setKmlImportVisible(true)}
                activeOpacity={0.7}
              >
                <View style={styles.kmlImportCardIcon}>
                  <Ionicons name="earth-outline" size={18} color={KML_COLOR} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.kmlImportCardTitle}>IMPORT KML</Text>
                  <Text style={styles.kmlImportCardSub}>Google Earth, My Maps, ArcGIS</Text>
                </View>
                <View style={styles.kmlImportCardBadge}>
                  <Text style={styles.kmlImportCardBadgeText}>.KML</Text>
                </View>
              </TouchableOpacity>
            </View>


            {/* Route Selector */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionLabel}>ROUTES</Text>
                <TouchableOpacity style={styles.addSmallBtn} onPress={() => setAddRouteVisible(true)} activeOpacity={0.7}>
                  <Ionicons name="add" size={16} color={TACTICAL.text} />
                </TouchableOpacity>
              </View>

              {routes.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Ionicons name="map-outline" size={28} color={TACTICAL.textMuted} />
                  <Text style={styles.emptyText}>No routes created</Text>
                  <View style={styles.emptyActions}>
                    <TouchableOpacity style={styles.emptyBtn} onPress={() => setAddRouteVisible(true)}>
                      <Ionicons name="add-outline" size={12} color={TACTICAL.text} />
                      <Text style={styles.emptyBtnText}>ADD ROUTE</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.emptyBtn, styles.emptyBtnGpx]} onPress={() => setGpxImportVisible(true)}>
                      <Ionicons name="document-attach-outline" size={12} color={TACTICAL.amber} />
                      <Text style={[styles.emptyBtnText, { color: TACTICAL.amber }]}>GPX</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.emptyBtn, styles.emptyBtnGeojson]} onPress={() => setGeojsonImportVisible(true)}>
                      <Ionicons name="code-slash-outline" size={12} color={GEOJSON_COLOR} />
                      <Text style={[styles.emptyBtnText, { color: GEOJSON_COLOR }]}>GeoJSON</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.emptyBtn, styles.emptyBtnKml]} onPress={() => setKmlImportVisible(true)}>
                      <Ionicons name="earth-outline" size={12} color={KML_COLOR} />
                      <Text style={[styles.emptyBtnText, { color: KML_COLOR }]}>KML</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {routes.map(r => {
                    const isSelected = selectedRouteId === r.id;
                    const importSrc = detectImportSource(r.source);
                    const isGpx = importSrc === 'gpx';
                    const isGeojson = importSrc === 'geojson';
                    const isKml = importSrc === 'kml';
                    return (
                      <TouchableOpacity
                        key={r.id}
                        style={[styles.routeChip, isSelected && styles.routeChipActive]}
                        onPress={() => setSelectedRouteId(r.id)}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name={isKml ? 'earth-outline' : isGeojson ? 'code-slash-outline' : isGpx ? 'document-text-outline' : 'navigate-outline'}
                          size={14}
                          color={isSelected ? TACTICAL.amber : isKml ? KML_COLOR : isGeojson ? GEOJSON_COLOR : TACTICAL.textMuted}
                        />
                        <View>
                          <Text style={[styles.routeChipName, isSelected && { color: TACTICAL.amber }]}>{r.name}</Text>
                          <Text style={styles.routeChipMeta}>
                            {r.source?.toUpperCase() || 'MANUAL'}
                            {r.distance_mi ? ` / ${r.distance_mi}mi` : ''}
                          </Text>
                        </View>
                        {isGpx && (
                          <View style={styles.gpxBadgeSmall}>
                            <Text style={styles.gpxBadgeSmallText}>GPX</Text>
                          </View>
                        )}
                        {isGeojson && (
                          <View style={styles.geojsonBadgeSmall}>
                            <Text style={styles.geojsonBadgeSmallText}>GeoJSON</Text>
                          </View>
                        )}
                        {isKml && (
                          <View style={styles.kmlBadgeSmall}>
                            <Text style={styles.kmlBadgeSmallText}>KML</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}

                </ScrollView>
              )}
            </View>

            {/* Route Details */}
            {selectedRoute && (
              <View style={styles.routeDetail}>
                <View style={styles.routeDetailHeader}>
                  <Text style={styles.routeDetailName}>{selectedRoute.name}</Text>
                  {selectedRoute.source && (
                    <View style={styles.routeSourceBadge}>
                      <Text style={styles.routeSourceBadgeText}>{selectedRoute.source.toUpperCase()}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.routeDetailRow}>
                  <View style={styles.routeDetailStat}>
                    <Text style={styles.routeDetailValue}>{safeFixed(selectedRoute.distance_mi, 1)}</Text>
                    <Text style={styles.routeDetailLabel}>MILES</Text>
                  </View>
                  <View style={styles.routeDetailDivider} />
                  <View style={styles.routeDetailStat}>
                    <Text style={styles.routeDetailValue}>{safeFixed(selectedRoute.eta_hours, 1)}</Text>
                    <Text style={styles.routeDetailLabel}>HOURS</Text>
                  </View>
                  <View style={styles.routeDetailDivider} />
                  <View style={styles.routeDetailStat}>
                    <Text style={styles.routeDetailValue}>{routeWaypoints.length}</Text>
                    <Text style={styles.routeDetailLabel}>WAYPOINTS</Text>
                  </View>
                </View>
                {selectedRoute.geojson && (
                  <View style={styles.geojsonBadge}>
                    <Ionicons name="map-outline" size={12} color="#4FC3F7" />
                    <Text style={styles.geojsonBadgeText}>GeoJSON route geometry loaded</Text>
                  </View>
                )}
              </View>
            )}

            {/* Waypoints */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionLabel}>WAYPOINTS</Text>
                <TouchableOpacity style={styles.addSmallBtn} onPress={() => setAddWpVisible(true)} activeOpacity={0.7}>
                  <Ionicons name="add" size={16} color={TACTICAL.text} />
                </TouchableOpacity>
              </View>

              {routeWaypoints.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Ionicons name="location-outline" size={28} color={TACTICAL.textMuted} />
                  <Text style={styles.emptyText}>No waypoints added</Text>
                  <View style={styles.emptyActions}>
                    <TouchableOpacity style={styles.emptyBtn} onPress={() => setAddWpVisible(true)}>
                      <Ionicons name="add-outline" size={12} color={TACTICAL.text} />
                      <Text style={styles.emptyBtnText}>ADD WPT</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.emptyBtn, styles.emptyBtnGpx]} onPress={() => setGpxImportVisible(true)}>
                      <Ionicons name="document-attach-outline" size={12} color={TACTICAL.amber} />
                      <Text style={[styles.emptyBtnText, { color: TACTICAL.amber }]}>GPX</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.emptyBtn, styles.emptyBtnGeojson]} onPress={() => setGeojsonImportVisible(true)}>
                      <Ionicons name="code-slash-outline" size={12} color={GEOJSON_COLOR} />
                      <Text style={[styles.emptyBtnText, { color: GEOJSON_COLOR }]}>GeoJSON</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.emptyBtn, styles.emptyBtnKml]} onPress={() => setKmlImportVisible(true)}>
                      <Ionicons name="earth-outline" size={12} color={KML_COLOR} />
                      <Text style={[styles.emptyBtnText, { color: KML_COLOR }]}>KML</Text>
                    </TouchableOpacity>
                  </View>
                </View>

              ) : (
                <View style={styles.waypointList}>
                  {routeWaypoints.map((wp, idx) => {
                    const meta = WAYPOINT_KIND_META[wp.kind] || WAYPOINT_KIND_META.waypoint;
                    const isImported = wp.meta?.imported_from || wp.meta?.source_app;
                    const wpImportSrc = detectImportSource(null, wp.meta ?? undefined);
                    return (
                      <TouchableOpacity
                        key={wp.id}
                        style={styles.waypointItem}
                        onLongPress={() => handleDeleteWaypoint(wp.id)}
                        activeOpacity={0.85}
                      >
                        <View style={[styles.wpIcon, { borderColor: `${meta.color}40` }]}>
                          <Ionicons name={meta.icon as any} size={14} color={meta.color} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={styles.wpTitle}>{wp.title || `Waypoint ${idx + 1}`}</Text>
                            {isImported && (
                              <View style={[
                                styles.importedBadge,
                                wpImportSrc === 'geojson' && styles.importedBadgeGeojson,
                                wpImportSrc === 'kml' && styles.importedBadgeKml,
                              ]}>
                                <Text style={[
                                  styles.importedBadgeText,
                                  wpImportSrc === 'geojson' && styles.importedBadgeTextGeojson,
                                  wpImportSrc === 'kml' && styles.importedBadgeTextKml,
                                ]}>
                                  {wpImportSrc === 'kml' ? 'KML' : wpImportSrc === 'geojson' ? 'GeoJSON' : 'GPX'}
                                </Text>
                              </View>
                            )}
                          </View>

                          <View style={styles.wpMeta}>
                            <Text style={[styles.wpKind, { color: meta.color }]}>{meta.label}</Text>
                            {wp.lat != null && wp.lng != null && (
                              <Text style={styles.wpCoords}>{safeFixed(wp.lat, 4)}, {safeFixed(wp.lng, 4)}</Text>
                            )}
                            {wp.meta?.elevation_ft != null && (
                              <Text style={styles.wpElevation}>{wp.meta.elevation_ft.toLocaleString()} ft</Text>
                            )}
                          </View>
                        </View>
                        <Text style={styles.wpIndex}>#{idx + 1}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>

            <View style={{ height: 120 }} />
          </ScrollView>
        )}

        {/* Add Route Modal */}
        <Modal visible={addRouteVisible} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>ADD ROUTE</Text>
                <TouchableOpacity onPress={() => setAddRouteVisible(false)}>
                  <Ionicons name="close" size={22} color={TACTICAL.textMuted} />
                </TouchableOpacity>
              </View>
              <Text style={styles.fieldLabel}>ROUTE NAME</Text>
              <TextInput style={styles.modalInput} value={routeName} onChangeText={setRouteName} placeholder="e.g. Primary Route" placeholderTextColor={TACTICAL.textMuted} autoFocus />
              <Text style={styles.fieldLabel}>SOURCE</Text>
              <View style={styles.sourceRow}>
                {['manual', 'gpx', 'kml', 'onx', 'garmin'].map(s => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.sourceChip, routeSource === s && styles.sourceChipActive]}
                    onPress={() => setRouteSource(s)}
                  >
                    <Text style={[styles.sourceChipText, routeSource === s && { color: TACTICAL.amber }]}>{s.toUpperCase()}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>DISTANCE (MI)</Text>
                  <TextInput style={styles.modalInput} value={routeDistance} onChangeText={setRouteDistance} placeholder="0" placeholderTextColor={TACTICAL.textMuted} keyboardType="numeric" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>ETA (HOURS)</Text>
                  <TextInput style={styles.modalInput} value={routeEta} onChangeText={setRouteEta} placeholder="0" placeholderTextColor={TACTICAL.textMuted} keyboardType="numeric" />
                </View>
              </View>
              <TouchableOpacity style={[styles.modalSaveBtn, routeSaving && { opacity: 0.6 }]} onPress={handleAddRoute} disabled={routeSaving} activeOpacity={0.85}>
                {routeSaving ? <ActivityIndicator size="small" color="#0B0F12" /> : <Ionicons name="add-circle-outline" size={16} color="#0B0F12" />}
                <Text style={styles.modalSaveBtnText}>{routeSaving ? 'SAVING...' : 'ADD ROUTE'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Add Waypoint Modal */}
        <Modal visible={addWpVisible} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>ADD WAYPOINT</Text>
                <TouchableOpacity onPress={() => setAddWpVisible(false)}>
                  <Ionicons name="close" size={22} color={TACTICAL.textMuted} />
                </TouchableOpacity>
              </View>
              <Text style={styles.fieldLabel}>NAME</Text>
              <TextInput style={styles.modalInput} value={wpTitle} onChangeText={setWpTitle} placeholder="Waypoint name" placeholderTextColor={TACTICAL.textMuted} autoFocus />
              <Text style={styles.fieldLabel}>TYPE</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {WAYPOINT_KINDS.map(([kind, meta]) => (
                    <TouchableOpacity
                      key={kind}
                      style={[styles.kindChip, wpKind === kind && { borderColor: meta.color, backgroundColor: `${meta.color}15` }]}
                      onPress={() => setWpKind(kind)}
                    >
                      <Ionicons name={meta.icon as any} size={12} color={wpKind === kind ? meta.color : TACTICAL.textMuted} />
                      <Text style={[styles.kindChipText, wpKind === kind && { color: meta.color }]}>{meta.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>LATITUDE</Text>
                  <TextInput style={styles.modalInput} value={wpLat} onChangeText={setWpLat} placeholder="0.0000" placeholderTextColor={TACTICAL.textMuted} keyboardType="numeric" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>LONGITUDE</Text>
                  <TextInput style={styles.modalInput} value={wpLng} onChangeText={setWpLng} placeholder="0.0000" placeholderTextColor={TACTICAL.textMuted} keyboardType="numeric" />
                </View>
              </View>
              <TouchableOpacity style={[styles.modalSaveBtn, wpSaving && { opacity: 0.6 }]} onPress={handleAddWaypoint} disabled={wpSaving} activeOpacity={0.85}>
                {wpSaving ? <ActivityIndicator size="small" color="#0B0F12" /> : <Ionicons name="location-outline" size={16} color="#0B0F12" />}
                <Text style={styles.modalSaveBtnText}>{wpSaving ? 'SAVING...' : 'ADD WAYPOINT'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* GPX File Import Modal */}
        <GpxImportModal
          visible={gpxImportVisible}
          onClose={() => setGpxImportVisible(false)}
          expeditionId={expeditionId}
          userId={user.id}
          onImportComplete={handleImportComplete}
          existingRouteId={selectedRouteId}
        />

        {/* GeoJSON File Import Modal */}
        <GeoJsonImportModal
          visible={geojsonImportVisible}
          onClose={() => setGeojsonImportVisible(false)}
          expeditionId={expeditionId}
          userId={user.id}
          onImportComplete={handleImportComplete}
          existingRouteId={selectedRouteId}
        />

        {/* KML File Import Modal */}
        <KmlImportModal
          visible={kmlImportVisible}
          onClose={() => setKmlImportVisible(false)}
          expeditionId={expeditionId}
          userId={user.id}
          onImportComplete={handleImportComplete}
          existingRouteId={selectedRouteId}
        />
      </View>
    </TopoBackground>
  );
}

const styles = StyleSheet.create({

  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: Platform.OS === 'web' ? 16 : 54, paddingBottom: 12,
  },
  backBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.18)', borderWidth: 1, borderColor: TACTICAL.border },
  headerBrand: { fontSize: 9, fontWeight: '600', color: TACTICAL.textMuted, letterSpacing: 2 },
  headerCount: { fontSize: 13, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 0.5 },
  headerActions: { flexDirection: 'row', gap: 6 },

  // GPX Import Header Button
  gpxImportHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.amber,
    backgroundColor: 'rgba(196,138,44,0.06)',
  },
  gpxImportHeaderBtnText: { fontSize: 9, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 1 },

  // GeoJSON Import Header Button
  geojsonImportHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#10B981',
    backgroundColor: 'rgba(16,185,129,0.06)',
  },
  geojsonImportHeaderBtnText: { fontSize: 9, fontWeight: '800', color: '#10B981', letterSpacing: 1 },

  // KML Import Header Button
  kmlImportHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3B82F6',
    backgroundColor: 'rgba(59,130,246,0.06)',
  },
  kmlImportHeaderBtnText: { fontSize: 9, fontWeight: '800', color: '#3B82F6', letterSpacing: 1 },


  // GPX Import Card
  gpxImportCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(196,138,44,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.2)',
  },
  gpxImportCardIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(196,138,44,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gpxImportCardTitle: { fontSize: 11, fontWeight: '900', color: TACTICAL.amber, letterSpacing: 1 },
  gpxImportCardSub: { fontSize: 9, color: TACTICAL.textMuted, marginTop: 2, lineHeight: 13 },
  gpxImportCardBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(196,138,44,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.2)',
  },
  gpxImportCardBadgeText: { fontSize: 8, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 0.5 },

  // Import Cards Row
  importCardsRow: {
    flexDirection: 'column' as const,
    gap: 8,
    marginBottom: 16,
  },

  // GeoJSON Import Card
  geojsonImportCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(16,185,129,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.2)',
  },
  geojsonImportCardIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.2)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  geojsonImportCardTitle: { fontSize: 11, fontWeight: '900' as const, color: '#10B981', letterSpacing: 1 },
  geojsonImportCardSub: { fontSize: 9, color: TACTICAL.textMuted, marginTop: 2, lineHeight: 13 },
  geojsonImportCardBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.2)',
  },
  geojsonImportCardBadgeText: { fontSize: 8, fontWeight: '800' as const, color: '#10B981', letterSpacing: 0.5 },

  // KML Import Card
  kmlImportCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(59,130,246,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.2)',
  },
  kmlImportCardIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(59,130,246,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.2)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  kmlImportCardTitle: { fontSize: 11, fontWeight: '900' as const, color: '#3B82F6', letterSpacing: 1 },
  kmlImportCardSub: { fontSize: 9, color: TACTICAL.textMuted, marginTop: 2, lineHeight: 13 },
  kmlImportCardBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(59,130,246,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.2)',
  },
  kmlImportCardBadgeText: { fontSize: 8, fontWeight: '800' as const, color: '#3B82F6', letterSpacing: 0.5 },


  content: { paddingHorizontal: 16 },
  section: { marginBottom: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionLabel: { fontSize: 10, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 2 },
  addSmallBtn: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: TACTICAL.accent },

  emptyCard: { alignItems: 'center', gap: 8, padding: 20, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.1)', borderWidth: 1, borderColor: TACTICAL.border },
  emptyText: { fontSize: 12, color: TACTICAL.textMuted },
  emptyActions: { flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap', justifyContent: 'center' },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: TACTICAL.accent,
  },
  emptyBtnGpx: {
    backgroundColor: 'rgba(196,138,44,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.25)',
  },
  emptyBtnGeojson: {
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.25)',
  },
  emptyBtnKml: {
    backgroundColor: 'rgba(59,130,246,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.25)',
  },

  emptyBtnText: { fontSize: 10, fontWeight: '800', color: TACTICAL.text, letterSpacing: 1 },

  // Route chips
  routeChip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.18)', borderWidth: 1, borderColor: TACTICAL.border },
  routeChipActive: { borderColor: TACTICAL.amber, backgroundColor: 'rgba(196, 138, 44, 0.08)' },
  routeChipName: { fontSize: 12, fontWeight: '800', color: TACTICAL.text },
  routeChipMeta: { fontSize: 9, color: TACTICAL.textMuted, marginTop: 2 },
  gpxBadgeSmall: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    backgroundColor: 'rgba(196,138,44,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.2)',
  },
  gpxBadgeSmallText: { fontSize: 7, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 0.5 },
  geojsonBadgeSmall: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.2)',
  },
  geojsonBadgeSmallText: { fontSize: 7, fontWeight: '800', color: '#10B981', letterSpacing: 0.5 },
  kmlBadgeSmall: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    backgroundColor: 'rgba(59,130,246,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.2)',
  },
  kmlBadgeSmallText: { fontSize: 7, fontWeight: '800', color: '#3B82F6', letterSpacing: 0.5 },


  // Route detail
  routeDetail: { padding: 14, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.18)', borderWidth: 1, borderColor: TACTICAL.border, marginBottom: 16 },
  routeDetailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  routeDetailName: { fontSize: 14, fontWeight: '900', color: TACTICAL.text, letterSpacing: 0.3, flex: 1 },
  routeSourceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(62,79,60,0.2)',
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  routeSourceBadgeText: { fontSize: 8, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 1 },
  routeDetailRow: { flexDirection: 'row', alignItems: 'center' },
  routeDetailStat: { flex: 1, alignItems: 'center' },
  routeDetailValue: { fontSize: 18, fontWeight: '900', color: TACTICAL.text, fontFamily: 'Courier' },
  routeDetailLabel: { fontSize: 9, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1, marginTop: 2 },
  routeDetailDivider: { width: 1, height: 28, backgroundColor: 'rgba(62, 79, 60, 0.3)' },
  geojsonBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(79,195,247,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(79,195,247,0.15)',
  },
  geojsonBadgeText: { fontSize: 9, color: '#4FC3F7', fontWeight: '700', letterSpacing: 0.5 },

  // Waypoints
  waypointList: { gap: 6 },
  waypointItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.1)', borderWidth: 1, borderColor: 'rgba(62, 79, 60, 0.2)',
  },
  wpIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.18)', borderWidth: 1 },
  wpTitle: { fontSize: 12, fontWeight: '800', color: TACTICAL.text },
  wpMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  wpKind: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  wpCoords: { fontSize: 9, color: TACTICAL.textMuted, fontFamily: 'Courier' },
  wpElevation: { fontSize: 9, color: '#4FC3F7', fontFamily: 'Courier' },
  wpIndex: { fontSize: 11, fontWeight: '800', color: TACTICAL.textMuted, fontFamily: 'Courier' },
  importedBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    backgroundColor: 'rgba(196,138,44,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.2)',
  },
  importedBadgeText: { fontSize: 7, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 0.5 },
  importedBadgeGeojson: {
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderColor: 'rgba(16,185,129,0.25)',
  },
  importedBadgeTextGeojson: { color: '#10B981' },
  importedBadgeKml: {
    backgroundColor: 'rgba(59,130,246,0.12)',
    borderColor: 'rgba(59,130,246,0.25)',
  },
  importedBadgeTextKml: { color: '#3B82F6' },


  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: TACTICAL.panel, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: Platform.OS === 'web' ? 20 : 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 14, fontWeight: '900', color: TACTICAL.amber, letterSpacing: 1.5 },
  fieldLabel: { fontSize: 10, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 2, marginBottom: 6, marginTop: 4 },
  modalInput: {
    backgroundColor: 'rgba(0,0,0,0.18)', borderWidth: 1, borderColor: TACTICAL.border,
    borderRadius: 12, padding: 14, color: TACTICAL.text, fontSize: 14, marginBottom: 8,
  },
  sourceRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  sourceChip: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: TACTICAL.border },
  sourceChipActive: { borderColor: TACTICAL.amber, backgroundColor: 'rgba(196, 138, 44, 0.08)' },
  sourceChipText: { fontSize: 9, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 0.8 },
  kindChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: TACTICAL.border },
  kindChipText: { fontSize: 9, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 0.8 },
  modalSaveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 12, backgroundColor: TACTICAL.amber, marginTop: 4,
  },
  modalSaveBtnText: { fontSize: 12, fontWeight: '900', color: '#0B0F12', letterSpacing: 1.2 },
});




