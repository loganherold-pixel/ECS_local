/**
 * Navigate Tab — Offline-First Route Support
 *
 * Capabilities:
 *   - Display imported routes
 *   - Select active route
 *   - Show distance remaining, ETA, waypoint count, elevation gain
 *   - Import GPX, KML, and GeoJSON files (cross-platform: web, iOS, Android)
 *   - Export GPX, GeoJSON, KML, and KMZ files (with waypoint type extensions)
 *   - Export format picker (GPX 1.1, RFC 7946 GeoJSON, KML 2.2, or KMZ archive)
 *   - KMZ export uses a pure-JS ZIP builder (no external dependencies)
 *   - Browse saved routes
 *   - Interactive waypoint editor with map selection sync
 *   - Add waypoint: manual coordinate entry or tap-on-map
 *
 * All functionality works offline.
 */




import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
  Modal,
  Share,
  ActivityIndicator,
} from 'react-native';
import { SafeIcon as Ionicons } from '../../components/SafeIcon';
import TabErrorBoundary from '../../components/TabErrorBoundary';



import { useFocusEffect } from '@react-navigation/native';
import { TACTICAL, TYPO, DENSITY, ICON_GRID } from '../../lib/theme';
import { useApp } from '../../context/AppContext';
import { waypointStore, generateUUID } from '../../lib/storage';
import { calculateRouteStats, calculateSegmentDistance, formatCoord, formatDuration } from '../../lib/calculations';
import { routeStore, type ImportedRoute } from '../../lib/routeStore';
import { generateGPX, generateGPXFilename, getExportSummary } from '../../lib/gpxExport';
import { generateGeoJSON, generateGeoJSONFilename } from '../../lib/geojsonExport';
import { generateKML, generateKMLFilename } from '../../lib/kmlExport';
import { generateKMZ, generateKMZFilename, uint8ArrayToBase64 } from '../../lib/kmlExport';
import { getDocumentDirectory, fsWriteString } from '../../lib/fsCompat';


import Header from '../../components/Header';
import AuthModal from '../../components/AuthModal';
import Toast from '../../components/Toast';
import KPICard from '../../components/KPICard';
import RouteMapPreview from '../../components/route/RouteMapPreview';
import FuelRangeCalculator from '../../components/route/FuelRangeCalculator';
import WaypointEditor from '../../components/route/WaypointEditor';
import { fsReadFileFromPickerUri } from '../../lib/fsCompat';


// ── Export format type ──────────────────────────────────
type ExportFormat = 'gpx' | 'geojson' | 'kml' | 'kmz';







// ── Route card icon using Ionicons ──────────────────────
function RouteGlyph({ size = 24, color = TACTICAL.amber }: { size?: number; color?: string }) {
  return <Ionicons name="trail-sign-outline" size={size} color={color} />;
}

function UploadGlyph({ size = 24, color = TACTICAL.textMuted }: { size?: number; color?: string }) {
  return <Ionicons name="cloud-upload-outline" size={size} color={color} />;
}



function RouteScreenInner() {
  const { activeTrip, waypoints, refreshActiveTrip, showToast, user } = useApp();
  const [authVisible, setAuthVisible] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [routes, setRoutes] = useState<ImportedRoute[]>([]);
  const [activeRoute, setActiveRoute] = useState<ImportedRoute | null>(null);
  const [browseVisible, setBrowseVisible] = useState(false);
  const [tipDismissed, setTipDismissed] = useState(false);
  const [selectedWaypointIndex, setSelectedWaypointIndex] = useState<number | null>(null);

  // ── Export state ───────────────────────────────────────
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('gpx');



  // ── Add waypoint state ────────────────────────────────
  const [isAddMode, setIsAddMode] = useState(false);
  const [addFromMapCoords, setAddFromMapCoords] = useState<{ lat: number; lon: number } | null>(null);

  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [currentPosition, setCurrentPosition] = useState<{ lat: number; lng: number; alt: number | null; speed: number | null; accuracy: number | null } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const sessionWpCountRef = useRef(0);

  // ── Load routes ───────────────────────────────────────
  const loadRoutes = useCallback(() => {
    const all = routeStore.getAll();
    setRoutes(all);
    setActiveRoute(routeStore.getActive());
  }, []);

  // ── Handle waypoint changes from editor ───────────────
  const handleRouteChanged = useCallback(() => {
    // Reload the active route from store to pick up waypoint changes
    const updated = routeStore.getActive();
    setActiveRoute(updated);
    const all = routeStore.getAll();
    setRoutes(all);
    showToast('ROUTE MODIFIED');
  }, [showToast]);

  // ── Handle waypoint selection from map ────────────────
  const handleMapWaypointPress = useCallback((index: number) => {
    setSelectedWaypointIndex(prev => prev === index ? null : index);
  }, []);

  // ── Handle map tap for adding waypoint ────────────────
  const handleMapTap = useCallback((lat: number, lon: number) => {
    setAddFromMapCoords({ lat, lon });
  }, []);

  // ── Toggle add mode ───────────────────────────────────
  const handleToggleAddMode = useCallback(() => {
    setIsAddMode(prev => {
      if (prev) {
        // Exiting add mode — clear pending coords
        setAddFromMapCoords(null);
      }
      return !prev;
    });
  }, []);

  // ── Clear map coords ──────────────────────────────────
  const handleClearMapCoords = useCallback(() => {
    setAddFromMapCoords(null);
  }, []);

  // ── GPX Export summary (memoized) ─────────────────────
  const exportSummary = useMemo(() => {
    if (!activeRoute) return null;
    return getExportSummary(activeRoute);
  }, [activeRoute]);

  // ── GPX Export handler ────────────────────────────────
  const handleExportGPX = useCallback(async () => {
    if (!activeRoute) return;
    setIsExporting(true);

    try {
      const gpxXml = generateGPX(activeRoute);
      const filename = generateGPXFilename(activeRoute);

      if (Platform.OS === 'web') {
        // Web: trigger file download via Blob + anchor
        const blob = new Blob([gpxXml], { type: 'application/gpx+xml' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        setTimeout(() => {
          document.body.removeChild(anchor);
          URL.revokeObjectURL(url);
        }, 100);
        showToast(`EXPORTED: ${filename}`);
      } else {
        // Native: use Share API to share GPX content as text
        try {
          await Share.share({
            message: gpxXml,
            title: filename,
          }, {
            subject: `GPX Export: ${activeRoute.name}`,
            dialogTitle: `Export ${activeRoute.name}`,
          });
          showToast('GPX SHARED SUCCESSFULLY');
        } catch (shareErr: any) {
          if (shareErr?.message !== 'User did not share') {
            showToast('SHARE CANCELLED OR FAILED');
          }
        }
      }
    } catch (err: any) {
      console.error('[Route] GPX export error:', err);
      showToast('EXPORT FAILED');
    } finally {
      setIsExporting(false);
      setExportModalVisible(false);
    }
  }, [activeRoute, showToast]);

  // ── GeoJSON Export handler ────────────────────────────
  const handleExportGeoJSON = useCallback(async () => {
    if (!activeRoute) return;
    setIsExporting(true);

    try {
      const geojsonStr = generateGeoJSON(activeRoute);
      const filename = generateGeoJSONFilename(activeRoute);

      if (Platform.OS === 'web') {
        // Web: trigger file download via Blob + anchor
        const blob = new Blob([geojsonStr], { type: 'application/geo+json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        setTimeout(() => {
          document.body.removeChild(anchor);
          URL.revokeObjectURL(url);
        }, 100);
        showToast(`EXPORTED: ${filename}`);
      } else {
        // Native: use Share API to share GeoJSON content as text
        try {
          await Share.share({
            message: geojsonStr,
            title: filename,
          }, {
            subject: `GeoJSON Export: ${activeRoute.name}`,
            dialogTitle: `Export ${activeRoute.name}`,
          });
          showToast('GEOJSON SHARED SUCCESSFULLY');
        } catch (shareErr: any) {
          if (shareErr?.message !== 'User did not share') {
            showToast('SHARE CANCELLED OR FAILED');
          }
        }
      }
    } catch (err: any) {
      console.error('[Route] GeoJSON export error:', err);
      showToast('EXPORT FAILED');
    } finally {
      setIsExporting(false);
      setExportModalVisible(false);
    }
  }, [activeRoute, showToast]);

  // ── KML Export handler ────────────────────────────────
  const handleExportKML = useCallback(async () => {
    if (!activeRoute) return;
    setIsExporting(true);

    try {
      const kmlXml = generateKML(activeRoute);
      const filename = generateKMLFilename(activeRoute);

      if (Platform.OS === 'web') {
        // Web: trigger file download via Blob + anchor
        const blob = new Blob([kmlXml], { type: 'application/vnd.google-earth.kml+xml' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        setTimeout(() => {
          document.body.removeChild(anchor);
          URL.revokeObjectURL(url);
        }, 100);
        showToast(`EXPORTED: ${filename}`);
      } else {
        // Native: use Share API to share KML content as text
        try {
          await Share.share({
            message: kmlXml,
            title: filename,
          }, {
            subject: `KML Export: ${activeRoute.name}`,
            dialogTitle: `Export ${activeRoute.name}`,
          });
          showToast('KML SHARED SUCCESSFULLY');
        } catch (shareErr: any) {
          if (shareErr?.message !== 'User did not share') {
            showToast('SHARE CANCELLED OR FAILED');
          }
        }
      }
    } catch (err: any) {
      console.error('[Route] KML export error:', err);
      showToast('EXPORT FAILED');
    } finally {
      setIsExporting(false);
      setExportModalVisible(false);
    }
  }, [activeRoute, showToast]);

  // ── KMZ Export handler (binary ZIP archive) ────────────
  const handleExportKMZ = useCallback(async () => {
    if (!activeRoute) return;
    setIsExporting(true);

    try {
      const kmzBytes = generateKMZ(activeRoute);
      const filename = generateKMZFilename(activeRoute);

      if (Platform.OS === 'web') {
        // Web: trigger binary file download via Blob + anchor
        const blob = new Blob([kmzBytes], { type: 'application/vnd.google-earth.kmz' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        setTimeout(() => {
          document.body.removeChild(anchor);
          URL.revokeObjectURL(url);
        }, 100);
        showToast(`EXPORTED: ${filename}`);
      } else {
        // Native: write binary to temp file, then share via expo-sharing
        try {
          const docDir = await getDocumentDirectory();
          const fileUri = `${docDir}${filename}`;
          const base64Data = uint8ArrayToBase64(kmzBytes);

          // Write binary data as base64
          await fsWriteString(fileUri, base64Data, 'base64');

          // Share the file via expo-sharing
          try {
            const Sharing = await import('expo-sharing' as any);
            if (Sharing && typeof Sharing.shareAsync === 'function') {
              await Sharing.shareAsync(fileUri, {
                mimeType: 'application/vnd.google-earth.kmz',
                dialogTitle: `Export ${activeRoute.name}`,
                UTI: 'com.google.earth.kmz',
              });
              showToast('KMZ SHARED SUCCESSFULLY');
            } else {
              // Fallback: share the base64 string (less ideal)
              await Share.share({
                message: `KMZ export: ${filename} (${(kmzBytes.length / 1024).toFixed(1)} KB) — Open in Google Earth`,
                title: filename,
              });
              showToast('KMZ FILE SAVED');
            }
          } catch (shareErr: any) {
            if (shareErr?.message !== 'User did not share') {
              showToast('SHARE CANCELLED OR FAILED');
            }
          }
        } catch (writeErr: any) {
          console.error('[Route] KMZ file write error:', writeErr);
          // Fallback: share as text notification
          showToast('KMZ EXPORT FAILED — Could not write file');
        }
      }
    } catch (err: any) {
      console.error('[Route] KMZ export error:', err);
      showToast('EXPORT FAILED');
    } finally {
      setIsExporting(false);
      setExportModalVisible(false);
    }
  }, [activeRoute, showToast]);

  // ── Unified export dispatcher ─────────────────────────
  const handleExport = useCallback(async () => {
    if (exportFormat === 'geojson') {
      await handleExportGeoJSON();
    } else if (exportFormat === 'kml') {
      await handleExportKML();
    } else if (exportFormat === 'kmz') {
      await handleExportKMZ();
    } else {
      await handleExportGPX();
    }
  }, [exportFormat, handleExportGeoJSON, handleExportKML, handleExportKMZ, handleExportGPX]);





  useFocusEffect(useCallback(() => {
    refreshActiveTrip();
    loadRoutes();
  }, [refreshActiveTrip, loadRoutes]));

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  // ── GPX/KML/GeoJSON Import — Cross-platform with expo-document-picker ──
  const handleUploadRoute = async () => {
    // ── Web: Use DOM file input ──
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.gpx,.xml,.kml,.geojson,.json';
      input.onchange = async (e: any) => {
        const file = e.target?.files?.[0];
        if (!file) return;

        const fileName = file.name || '';
        const ext = fileName.split('.').pop()?.toLowerCase() || '';

        if (!['gpx', 'xml', 'kml', 'geojson', 'json'].includes(ext)) {
          showToast(`UNSUPPORTED FORMAT: .${ext} — Use .gpx, .kml, .geojson, .json, or .xml`);
          return;
        }

        try {
          const text = await file.text();

          // Branch: GeoJSON files → routeStore.importGeoJSON (uses geojsonParser)
          if (ext === 'geojson' || ext === 'json') {
            const route = routeStore.importGeoJSON(text);
            showToast(`IMPORTED GEOJSON: ${route.name} (${route.total_distance_miles} mi)`);
          // Branch: KML files → routeStore.importKML (uses kmlParser)
          } else if (ext === 'kml') {
            const route = routeStore.importKML(text);
            showToast(`IMPORTED KML: ${route.name} (${route.total_distance_miles} mi)`);
          } else {
            // GPX / XML → routeStore.importGPX
            const route = routeStore.importGPX(text);
            showToast(`IMPORTED: ${route.name} (${route.total_distance_miles} mi)`);
          }
          loadRoutes();
        } catch (err: any) {
          console.error('[Route] File parse error:', err);
          const formatLabel = ext === 'kml' ? 'KML' : (ext === 'geojson' || ext === 'json') ? 'GEOJSON' : 'GPX';
          showToast(`FAILED TO PARSE ${formatLabel} FILE`);
        }
      };
      input.click();
      return;
    }

    // ── Native (Android/iOS): Use expo-document-picker + fsReadFileFromPickerUri ──
    try {
      console.log('[Route] Attempting expo-document-picker import...');
      const DocumentPicker = await import('expo-document-picker' as any);

      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/gpx+xml',
          'application/vnd.google-earth.kml+xml',
          'application/geo+json',
          'application/json',
          'text/xml',
          'application/xml',
          'text/plain',
          '*/*',
        ],
        copyToCacheDirectory: true,
      });

      console.log('[Route] Document picker result:', JSON.stringify(result, null, 2));

      // Handle cancellation
      if (result.canceled || !result.assets || result.assets.length === 0) {
        showToast('IMPORT CANCELED');
        return;
      }

      const asset = result.assets[0];
      const fileName = asset.name || 'imported.gpx';
      const ext = fileName.split('.').pop()?.toLowerCase() || '';

      // Validate file type
      if (!['gpx', 'xml', 'kml', 'geojson', 'json'].includes(ext)) {
        showToast(`UNSUPPORTED FORMAT: .${ext} — Use .gpx, .kml, .geojson, .json, or .xml`);
        return;
      }

      showToast(`FILE SELECTED: ${fileName}`);

      // Read file content via centralized fsCompat wrapper
      // (fetch-first with fsReadString fallback — consistent with all import modals)
      try {
        const fileUri = asset.uri;
        console.log('[Route] Reading file from:', fileUri);

        const text = await fsReadFileFromPickerUri(fileUri);

        if (!text || text.length === 0) {
          console.warn('[Route] File read returned empty content');
          showToast('IMPORT FAILED — File appears to be empty');
          return;
        }

        console.log('[Route] File read successfully, length:', text.length);

        // Branch: GeoJSON files → routeStore.importGeoJSON (uses geojsonParser)
        if (ext === 'geojson' || ext === 'json') {
          const route = routeStore.importGeoJSON(text);
          showToast(`IMPORTED GEOJSON: ${route.name} (${route.total_distance_miles} mi)`);
        // Branch: KML files → routeStore.importKML (uses kmlParser)
        } else if (ext === 'kml') {
          const route = routeStore.importKML(text);
          showToast(`IMPORTED KML: ${route.name} (${route.total_distance_miles} mi)`);
        } else {
          // GPX / XML → routeStore.importGPX
          const route = routeStore.importGPX(text);
          showToast(`IMPORTED: ${route.name} (${route.total_distance_miles} mi)`);
        }
        loadRoutes();
      } catch (readErr: any) {
        console.error('[Route] Failed to read/parse file:', readErr);
        const formatLabel = ext === 'kml' ? 'KML' : (ext === 'geojson' || ext === 'json') ? 'GEOJSON' : 'GPX';
        showToast(`FAILED TO PARSE ${formatLabel} FILE`);
      }
    } catch (pickerErr) {
      console.error('[Route] Document picker failed:', pickerErr);
      if (Platform.OS === 'android') {
        showToast('FILE IMPORT UNAVAILABLE — expo-document-picker may need to be installed');
      } else {
        showToast('FILE IMPORT UNAVAILABLE — Check build configuration');
      }
    }
  };





  const handleSetActive = (routeId: string) => {
    routeStore.setActive(routeId);
    setSelectedWaypointIndex(null);
    setIsAddMode(false);
    setAddFromMapCoords(null);
    loadRoutes();
    setBrowseVisible(false);
    showToast('ACTIVE ROUTE SET');
  };


  const handleDeleteRoute = (routeId: string) => {
    const doDelete = () => {
      routeStore.delete(routeId);
      loadRoutes();
      showToast('ROUTE DELETED');
    };

    if (Platform.OS === 'web') {
      if (confirm('Delete this route?')) doDelete();
    } else {
      Alert.alert('Delete Route', 'Remove this imported route?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  // ── Tracking ──────────────────────────────────────────
  const startTracking = () => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
      if (!activeTrip) { showToast('Select a trip to track'); return; }
      setGeoError(null);
      const sessionId = generateUUID();
      setCurrentSessionId(sessionId);
      sessionWpCountRef.current = 0;
      const watchId = navigator.geolocation.watchPosition(
        async (position) => {
          const { latitude, longitude, altitude, speed, accuracy, heading } = position.coords;
          setCurrentPosition({ lat: latitude, lng: longitude, alt: altitude, speed, accuracy });
          await waypointStore.create({
            trip_id: activeTrip!.id, latitude, longitude,
            altitude: altitude ?? null, speed: speed ?? null,
            heading: heading ?? null, accuracy: accuracy ?? null,
            recorded_at: new Date().toISOString(), session_id: sessionId,
          });
          sessionWpCountRef.current += 1;
          if (sessionWpCountRef.current % 5 === 0 || sessionWpCountRef.current <= 2) refreshActiveTrip();
        },
        (error) => { setGeoError(error.message); showToast(`GPS Error: ${error.message}`); },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
      );
      watchIdRef.current = watchId;
      setTracking(true);
      showToast('Route tracking started');
    } else {
      setGeoError('Geolocation not available');
    }
  };

  const stopTracking = () => {
    if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setTracking(false);
    setCurrentSessionId(null);
    refreshActiveTrip();
    showToast(`Tracking stopped — ${sessionWpCountRef.current} waypoints recorded`);
  };

  // ── Route stats ───────────────────────────────────────
  const routeStats = activeTrip ? calculateRouteStats(waypoints, activeTrip.route_distance_miles) : null;

  // ── No active route and no active trip ────────────────
  const hasActiveRoute = !!activeRoute;
  const hasRoutes = routes.length > 0;

  return (
    <View style={styles.container}>
      <Header onAuthPress={() => setAuthVisible(true)} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Title */}
        <View style={styles.titleRow}>
          <RouteGlyph size={22} color={TACTICAL.amber} />
          <Text style={styles.titleText}>NAVIGATE</Text>
        </View>

        {/* Active Route Card */}
        {hasActiveRoute && activeRoute && (
          <View style={styles.activeRouteCard}>
            <View style={styles.activeRouteHeader}>
              <View style={styles.activeRouteBadge}>
                <View style={styles.activeDot} />
                <Text style={styles.activeBadgeText}>ACTIVE ROUTE</Text>
              </View>
              <TouchableOpacity onPress={() => {
                setSelectedWaypointIndex(null);
                setIsAddMode(false);
                setAddFromMapCoords(null);
                routeStore.deactivateAll();
                loadRoutes();
              }}>
                <Ionicons name="close-circle-outline" size={18} color={TACTICAL.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.activeRouteName}>{activeRoute.name}</Text>
            <View style={styles.activeRouteStats}>
              <View style={styles.routeStat}>
                <Text style={styles.routeStatValue}>{activeRoute.total_distance_miles.toFixed(1)}</Text>
                <Text style={styles.routeStatLabel}>MILES</Text>
              </View>
              <View style={styles.routeStatDivider} />
              <View style={styles.routeStat}>
                <Text style={styles.routeStatValue}>{activeRoute.waypoint_count}</Text>
                <Text style={styles.routeStatLabel}>WAYPOINTS</Text>
              </View>
              <View style={styles.routeStatDivider} />
              <View style={styles.routeStat}>
                <Text style={styles.routeStatValue}>{activeRoute.elevation_gain_ft ? `${activeRoute.elevation_gain_ft}` : '--'}</Text>
                <Text style={styles.routeStatLabel}>ELEV GAIN FT</Text>
              </View>
              <View style={styles.routeStatDivider} />
              <View style={styles.routeStat}>
                <Text style={styles.routeStatValue}>
                  {activeRoute.total_distance_miles > 0
                    ? `${Math.round(activeRoute.total_distance_miles / 25)}h`
                    : '--'}
                </Text>
                <Text style={styles.routeStatLabel}>EST TIME</Text>
              </View>
            </View>
            <View style={styles.activeRouteMeta}>
              <Text style={styles.routeMetaText}>
                {activeRoute.source_format.toUpperCase()} — {activeRoute.segment_count} segment{activeRoute.segment_count !== 1 ? 's' : ''}
              </Text>
              <Text style={styles.routeMetaText}>
                Imported {new Date(activeRoute.created_at).toLocaleDateString()}
              </Text>
            </View>

            {/* Export Route Button */}
            <TouchableOpacity
              style={styles.exportGpxBtn}
              onPress={() => setExportModalVisible(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="download-outline" size={16} color={TACTICAL.amber} />
              <Text style={styles.exportGpxBtnText}>EXPORT ROUTE</Text>
              {exportSummary && exportSummary.typedWaypointCount > 0 && (
                <View style={styles.exportTypeBadge}>
                  <Text style={styles.exportTypeBadgeText}>
                    {exportSummary.typedWaypointCount} TYPED
                  </Text>
                </View>
              )}
            </TouchableOpacity>

          </View>

        )}

        {/* Route Map Preview — renders when active route has track segments */}
        {hasActiveRoute && activeRoute && activeRoute.segments.length > 0 && (
          <RouteMapPreview
            route={activeRoute}
            selectedWaypointIndex={selectedWaypointIndex}
            onWaypointPress={handleMapWaypointPress}
            isAddMode={isAddMode}
            onMapTap={handleMapTap}
            pendingWaypoint={addFromMapCoords}
          />
        )}

        {/* Waypoint Editor — renders when active route exists (even with 0 waypoints for add) */}
        {hasActiveRoute && activeRoute && (
          <WaypointEditor
            route={activeRoute}
            selectedIndex={selectedWaypointIndex}
            onSelectWaypoint={setSelectedWaypointIndex}
            onRouteChanged={handleRouteChanged}
            isAddMode={isAddMode}
            onToggleAddMode={handleToggleAddMode}
            addFromMapCoords={addFromMapCoords}
            onClearMapCoords={handleClearMapCoords}
          />
        )}

        {/* Fuel Range Calculator — renders when active route exists */}
        {hasActiveRoute && activeRoute && (
          <FuelRangeCalculator
            route={activeRoute}
            initialFuelCapacity={activeTrip?.capac_fuel_gal || undefined}
            initialMpg={activeTrip?.capac_mpg || undefined}
          />
        )}


        {/* No active route */}
        {!hasActiveRoute && (
          <View style={styles.noRouteCard}>
            <View style={styles.noRouteIcon}>
              <RouteGlyph size={36} color={TACTICAL.textMuted} />
            </View>
            <Text style={styles.noRouteTitle}>NO ACTIVE ROUTE</Text>
            <Text style={styles.noRouteBody}>
              Import a route (GPX/KML/GeoJSON) from OnX, Garmin, Gaia, Google Earth, Mapbox, QGIS, or similar tools to enable expedition tracking.
            </Text>


            <TouchableOpacity style={styles.uploadBtn} onPress={handleUploadRoute} activeOpacity={0.8}>
              <UploadGlyph size={18} color="#0B0F12" />
              <Text style={styles.uploadBtnText}>UPLOAD ROUTE</Text>
            </TouchableOpacity>
            {hasRoutes && (
              <TouchableOpacity style={styles.browseBtn} onPress={() => setBrowseVisible(true)} activeOpacity={0.8}>
                <Ionicons name="folder-outline" size={14} color={TACTICAL.textMuted} />
                <Text style={styles.browseBtnText}>BROWSE SAVED ROUTES</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Pro Tip */}
        {!tipDismissed && !hasActiveRoute && (
          <View style={styles.tipCard}>
            <View style={styles.tipHeader}>
              <Ionicons name="bulb-outline" size={14} color={TACTICAL.amber} />
              <Text style={styles.tipTitle}>PRO TIP</Text>
              <TouchableOpacity onPress={() => setTipDismissed(true)} style={styles.tipDismiss}>
                <Ionicons name="close" size={14} color={TACTICAL.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.tipText}>
              Build routes in OnX/Garmin/Gaia and import here for vehicle-aware expedition analytics.
            </Text>
          </View>
        )}

        {/* Tracking Controls (when trip active) */}
        {activeTrip && (
          <>
            <View style={styles.sectionHeader}>
              <Ionicons name="navigate-outline" size={14} color={TACTICAL.amber} />
              <Text style={styles.sectionTitle}>LIVE TRACKING</Text>
            </View>
            <View style={styles.controlsCard}>
              {tracking ? (
                <View style={styles.trackingActive}>
                  <View style={styles.pulseRow}>
                    <View style={styles.pulseDot} />
                    <Text style={styles.trackingText}>TRACKING ACTIVE</Text>
                  </View>
                  {currentPosition && (
                    <Text style={styles.posText}>
                      {formatCoord(currentPosition.lat, true)} {formatCoord(currentPosition.lng, false)}
                      {currentPosition.accuracy ? ` (±${currentPosition.accuracy.toFixed(0)}m)` : ''}
                    </Text>
                  )}
                  <TouchableOpacity style={styles.stopBtn} onPress={stopTracking}>
                    <Ionicons name="stop-circle" size={18} color="#fff" />
                    <Text style={styles.stopBtnText}>STOP TRACKING</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.controlRow}>
                  <TouchableOpacity style={styles.startBtn} onPress={startTracking}>
                    <Ionicons name="play-circle" size={18} color="#0B0F12" />
                    <Text style={styles.startBtnText}>START TRACKING</Text>
                  </TouchableOpacity>
                </View>
              )}
              {geoError && (
                <View style={styles.geoErrorRow}>
                  <Ionicons name="alert-circle" size={14} color={TACTICAL.danger} />
                  <Text style={styles.geoErrorText}>{geoError}</Text>
                </View>
              )}
            </View>

            {/* Route Progress */}
            {routeStats && routeStats.waypointCount > 0 && (
              <View style={styles.progressCard}>
                <View style={styles.progressHeader}>
                  <Text style={styles.progressLabel}>ROUTE PROGRESS</Text>
                  {routeStats.completionPct != null && (
                    <Text style={[styles.progressPct, {
                      color: routeStats.completionPct >= 100 ? '#66BB6A' : routeStats.completionPct >= 50 ? TACTICAL.amber : TACTICAL.textMuted,
                    }]}>{routeStats.completionPct}%</Text>
                  )}
                </View>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, {
                    width: `${Math.min(routeStats.completionPct || 0, 100)}%`,
                    backgroundColor: (routeStats.completionPct || 0) >= 100 ? '#66BB6A' : TACTICAL.amber,
                  }]} />
                </View>
                <View style={styles.progressStats}>
                  <Text style={styles.progressStatText}>{routeStats.totalDistanceMiles.toFixed(2)} mi traveled</Text>
                  <Text style={styles.progressStatText}>{routeStats.waypointCount} waypoints</Text>
                  <Text style={styles.progressStatText}>{routeStats.sessionCount} sessions</Text>
                </View>
              </View>
            )}
          </>
        )}

        {/* Saved Routes Section */}
        {hasRoutes && (
          <>
            <View style={styles.sectionHeader}>
              <Ionicons name="folder-outline" size={14} color={TACTICAL.amber} />
              <Text style={styles.sectionTitle}>SAVED ROUTES ({routes.length})</Text>
              <TouchableOpacity style={styles.uploadSmallBtn} onPress={handleUploadRoute}>
                <Ionicons name="add" size={14} color={TACTICAL.amber} />
              </TouchableOpacity>
            </View>
            {routes.slice(0, 5).map(route => (
              <TouchableOpacity
                key={route.id}
                style={[styles.routeCard, route.is_active && styles.routeCardActive]}
                onPress={() => handleSetActive(route.id)}
                activeOpacity={0.7}
              >
                <View style={styles.routeCardLeft}>
                  <RouteGlyph size={20} color={route.is_active ? TACTICAL.amber : TACTICAL.textMuted} />
                  <View style={styles.routeCardInfo}>
                    <Text style={[styles.routeCardName, route.is_active && { color: TACTICAL.amber }]}>{route.name}</Text>
                    <Text style={styles.routeCardMeta}>
                      {route.total_distance_miles.toFixed(1)} mi — {route.waypoint_count} wpts — {route.source_format.toUpperCase()}
                    </Text>
                  </View>
                </View>
                <View style={styles.routeCardRight}>
                  {route.is_active && (
                    <View style={styles.activeIndicator}>
                      <View style={styles.activeDotSmall} />
                    </View>
                  )}
                  <TouchableOpacity onPress={() => handleDeleteRoute(route.id)} style={styles.deleteBtn}>
                    <Ionicons name="trash-outline" size={14} color={TACTICAL.textMuted} />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}

        {/* Backup note */}
        {!user && routes.length > 0 && (
          <View style={styles.backupNote}>
            <Ionicons name="information-circle-outline" size={12} color={TACTICAL.textMuted} />
            <Text style={styles.backupNoteText}>Sign in to back up expedition data</Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Browse Routes Modal */}
      <Modal visible={browseVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>SAVED ROUTES</Text>
              <TouchableOpacity onPress={() => setBrowseVisible(false)}>
                <Ionicons name="close" size={22} color={TACTICAL.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll}>
              {routes.map(route => (
                <TouchableOpacity
                  key={route.id}
                  style={[styles.modalRouteItem, route.is_active && styles.modalRouteActive]}
                  onPress={() => handleSetActive(route.id)}
                >
                  <RouteGlyph size={20} color={route.is_active ? TACTICAL.amber : TACTICAL.textMuted} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalRouteName}>{route.name}</Text>
                    <Text style={styles.modalRouteMeta}>
                      {route.total_distance_miles.toFixed(1)} mi — {route.waypoint_count} waypoints
                    </Text>
                  </View>
                  {route.is_active && <View style={styles.activeDotSmall} />}
                </TouchableOpacity>
              ))}
              {routes.length === 0 && (
                <View style={styles.modalEmpty}>
                  <Text style={styles.modalEmptyText}>No saved routes</Text>
                </View>
              )}
            </ScrollView>
            <TouchableOpacity style={styles.modalUploadBtn} onPress={() => { setBrowseVisible(false); handleUploadRoute(); }}>
              <UploadGlyph size={16} color="#0B0F12" />
              <Text style={styles.modalUploadText}>IMPORT GPX / KML / GEOJSON</Text>


            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Export Route Modal (GPX / GeoJSON / KML format picker) */}

      <Modal visible={exportModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.exportModalContainer}>
            {/* Header */}
            <View style={styles.exportModalHeader}>
              <View style={styles.exportModalTitleRow}>
                <Ionicons name="download-outline" size={18} color={TACTICAL.amber} />
                <Text style={styles.exportModalTitle}>EXPORT ROUTE</Text>
              </View>
              <TouchableOpacity
                onPress={() => setExportModalVisible(false)}
                disabled={isExporting}
              >
                <Ionicons name="close" size={22} color={TACTICAL.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Route Name */}
            {activeRoute && (
              <View style={styles.exportRouteNameRow}>
                <Ionicons name="trail-sign-outline" size={14} color={TACTICAL.amber} />
                <Text style={styles.exportRouteName} numberOfLines={2}>

                  {activeRoute.name}
                </Text>
              </View>
            )}

            <ScrollView style={{ maxHeight: '70%' }}>
              {/* ── Format Picker ──────────────────────────── */}
              <View style={styles.formatPickerContainer}>
                <Text style={styles.formatPickerLabel}>EXPORT FORMAT</Text>
                <View style={styles.formatPickerRow}>
                  {/* GPX Option */}
                  <TouchableOpacity
                    style={[
                      styles.formatOption,
                      exportFormat === 'gpx' && styles.formatOptionActive,
                    ]}
                    onPress={() => setExportFormat('gpx')}
                    activeOpacity={0.7}
                    disabled={isExporting}
                  >
                    <View style={styles.formatOptionHeader}>
                      <View style={[
                        styles.formatRadio,
                        exportFormat === 'gpx' && styles.formatRadioActive,
                      ]}>
                        {exportFormat === 'gpx' && <View style={styles.formatRadioDot} />}
                      </View>
                      <Text style={[
                        styles.formatOptionTitle,
                        exportFormat === 'gpx' && styles.formatOptionTitleActive,
                      ]}>GPX 1.1</Text>
                    </View>
                    <Text style={styles.formatOptionDesc}>
                      Standard XML format for Garmin, OnX, Gaia GPS, CalTopo
                    </Text>
                    <Text style={styles.formatOptionMime}>application/gpx+xml</Text>
                  </TouchableOpacity>

                  {/* GeoJSON Option */}
                  <TouchableOpacity
                    style={[
                      styles.formatOption,
                      exportFormat === 'geojson' && styles.formatOptionActive,
                    ]}
                    onPress={() => setExportFormat('geojson')}
                    activeOpacity={0.7}
                    disabled={isExporting}
                  >
                    <View style={styles.formatOptionHeader}>
                      <View style={[
                        styles.formatRadio,
                        exportFormat === 'geojson' && styles.formatRadioActive,
                      ]}>
                        {exportFormat === 'geojson' && <View style={styles.formatRadioDot} />}
                      </View>
                      <Text style={[
                        styles.formatOptionTitle,
                        exportFormat === 'geojson' && styles.formatOptionTitleActive,
                      ]}>GeoJSON</Text>
                    </View>
                    <Text style={styles.formatOptionDesc}>
                      RFC 7946 JSON format for Mapbox, QGIS, Leaflet, geojson.io
                    </Text>
                    <Text style={styles.formatOptionMime}>application/geo+json</Text>
                  </TouchableOpacity>

                  {/* KML Option */}
                  <TouchableOpacity
                    style={[
                      styles.formatOption,
                      exportFormat === 'kml' && styles.formatOptionActive,
                    ]}
                    onPress={() => setExportFormat('kml')}
                    activeOpacity={0.7}
                    disabled={isExporting}
                  >
                    <View style={styles.formatOptionHeader}>
                      <View style={[
                        styles.formatRadio,
                        exportFormat === 'kml' && styles.formatRadioActive,
                      ]}>
                        {exportFormat === 'kml' && <View style={styles.formatRadioDot} />}
                      </View>
                      <Text style={[
                        styles.formatOptionTitle,
                        exportFormat === 'kml' && styles.formatOptionTitleActive,
                      ]}>KML 2.2</Text>
                    </View>
                    <Text style={styles.formatOptionDesc}>
                      Google Earth XML format for Google Earth, Google Maps, ArcGIS
                    </Text>
                    <Text style={styles.formatOptionMime}>application/vnd.google-earth.kml+xml</Text>
                  </TouchableOpacity>

                  {/* KMZ Option */}
                  <TouchableOpacity
                    style={[
                      styles.formatOption,
                      exportFormat === 'kmz' && styles.formatOptionActive,
                    ]}
                    onPress={() => setExportFormat('kmz')}
                    activeOpacity={0.7}
                    disabled={isExporting}
                  >
                    <View style={styles.formatOptionHeader}>
                      <View style={[
                        styles.formatRadio,
                        exportFormat === 'kmz' && styles.formatRadioActive,
                      ]}>
                        {exportFormat === 'kmz' && <View style={styles.formatRadioDot} />}
                      </View>
                      <Text style={[
                        styles.formatOptionTitle,
                        exportFormat === 'kmz' && styles.formatOptionTitleActive,
                      ]}>KMZ</Text>
                    </View>
                    <Text style={styles.formatOptionDesc}>
                      Zipped KML archive for Google Earth sharing, smaller file size
                    </Text>
                    <Text style={styles.formatOptionMime}>application/vnd.google-earth.kmz</Text>
                  </TouchableOpacity>
                </View>
              </View>


              {/* Export Summary */}
              {exportSummary && (
                <View style={styles.exportSummaryCard}>
                  <Text style={styles.exportSummaryTitle}>EXPORT CONTENTS</Text>

                  {/* Stats Grid */}
                  <View style={styles.exportStatsGrid}>
                    <View style={styles.exportStatItem}>
                      <Ionicons name="location-outline" size={14} color={TACTICAL.amber} />
                      <Text style={styles.exportStatValue}>{exportSummary.waypointCount}</Text>
                      <Text style={styles.exportStatLabel}>
                        {exportFormat === 'geojson' ? 'POINTS' : (exportFormat === 'kml' || exportFormat === 'kmz') ? 'PLACEMARKS' : 'WAYPOINTS'}
                      </Text>
                    </View>
                    <View style={styles.exportStatDivider} />
                    <View style={styles.exportStatItem}>
                      <Ionicons name="git-branch-outline" size={14} color={TACTICAL.amber} />
                      <Text style={styles.exportStatValue}>{exportSummary.segmentCount}</Text>
                      <Text style={styles.exportStatLabel}>
                        {exportFormat === 'geojson' ? 'LINES' : (exportFormat === 'kml' || exportFormat === 'kmz') ? 'LINESTRINGS' : 'SEGMENTS'}
                      </Text>
                    </View>
                    <View style={styles.exportStatDivider} />
                    <View style={styles.exportStatItem}>
                      <Ionicons name="navigate-outline" size={14} color={TACTICAL.amber} />
                      <Text style={styles.exportStatValue}>{exportSummary.totalTrackPoints.toLocaleString()}</Text>
                      <Text style={styles.exportStatLabel}>
                        {exportFormat === 'geojson' ? 'COORDS' : 'TRACK PTS'}
                      </Text>
                    </View>

                  </View>

                  {/* Distance & Elevation */}
                  <View style={styles.exportMetaRow}>
                    <View style={styles.exportMetaItem}>
                      <Text style={styles.exportMetaLabel}>DISTANCE</Text>
                      <Text style={styles.exportMetaValue}>
                        {exportSummary.totalDistanceMiles.toFixed(1)} mi
                      </Text>
                    </View>
                    <View style={styles.exportMetaItem}>
                      <Text style={styles.exportMetaLabel}>ELEVATION</Text>
                      <Text style={styles.exportMetaValue}>
                        {exportSummary.hasElevation ? 'Included' : 'Not available'}
                      </Text>
                    </View>
                  </View>

                  {/* Waypoint Types Breakdown */}
                  {exportSummary.typedWaypointCount > 0 && (
                    <View style={styles.exportTypesSection}>
                      <View style={styles.exportTypesSectionHeader}>
                        <Ionicons name="pricetag-outline" size={12} color={TACTICAL.amber} />
                        <Text style={styles.exportTypesSectionTitle}>
                          WAYPOINT TYPES ({exportSummary.typedWaypointCount})
                        </Text>
                      </View>
                      <View style={styles.exportTypesGrid}>
                        {Object.entries(exportSummary.waypointTypeCounts).map(([label, count]) => (
                          <View key={label} style={styles.exportTypeChip}>
                            <Text style={styles.exportTypeChipText}>
                              {label.toUpperCase()}
                            </Text>
                            <View style={styles.exportTypeChipCount}>
                              <Text style={styles.exportTypeChipCountText}>{count}</Text>
                            </View>
                          </View>
                        ))}
                      </View>
                      <Text style={styles.exportTypesNote}>
                        {exportFormat === 'geojson'
                          ? 'Type classifications will be included as feature properties'
                          : (exportFormat === 'kml' || exportFormat === 'kmz')
                            ? 'Type classifications will be included as styled Placemarks with ExtendedData'
                            : 'Type classifications will be included as GPX extensions'}

                      </Text>
                    </View>
                  )}

                  {/* Format Info — dynamic based on selected format */}
                  <View style={styles.exportFormatInfo}>
                    <Ionicons name="code-outline" size={12} color={TACTICAL.textMuted} />
                    <Text style={styles.exportFormatText}>
                      {exportFormat === 'geojson'
                        ? 'RFC 7946 GeoJSON — FeatureCollection with Point + LineString features, simplestyle-spec properties, and ECS metadata'
                        : exportFormat === 'kml'
                          ? 'KML 2.2 — Placemarks with styled icons, LineString tracks, LookAt viewpoint, and ECS ExtendedData'
                          : 'GPX 1.1 — Standard format compatible with Garmin, OnX, Gaia GPS, CalTopo'}
                    </Text>
                  </View>
                </View>
              )}
            </ScrollView>

            {/* Export Actions */}
            <View style={styles.exportActions}>
              <TouchableOpacity
                style={styles.exportCancelBtn}
                onPress={() => setExportModalVisible(false)}
                disabled={isExporting}
                activeOpacity={0.8}
              >
                <Text style={styles.exportCancelBtnText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.exportConfirmBtn, isExporting && styles.exportConfirmBtnDisabled]}
                onPress={handleExport}
                disabled={isExporting}
                activeOpacity={0.8}
              >
                {isExporting ? (
                  <ActivityIndicator size="small" color="#0B0F12" />
                ) : (
                  <Ionicons name="download-outline" size={16} color="#0B0F12" />
                )}
                <Text style={styles.exportConfirmBtnText}>
                  {isExporting
                    ? 'EXPORTING...'
                    : Platform.OS === 'web'
                      ? `DOWNLOAD ${exportFormat === 'geojson' ? 'GEOJSON' : exportFormat === 'kml' ? 'KML' : 'GPX'}`
                      : `SHARE ${exportFormat === 'geojson' ? 'GEOJSON' : exportFormat === 'kml' ? 'KML' : 'GPX'}`}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Platform hint */}
            <View style={styles.exportPlatformHint}>
              <Ionicons
                name={Platform.OS === 'web' ? 'desktop-outline' : 'phone-portrait-outline'}
                size={10}
                color={TACTICAL.textMuted}
              />
              <Text style={styles.exportPlatformHintText}>
                {Platform.OS === 'web'
                  ? `${exportFormat === 'geojson' ? '.geojson' : exportFormat === 'kml' ? '.kml' : '.gpx'} file will download to your browser`
                  : 'Opens share sheet to save or send'}
              </Text>
            </View>
          </View>
        </View>
      </Modal>





      <AuthModal visible={authVisible} onClose={() => setAuthVisible(false)} />
      <Toast />
    </View>
  );
}


export default function RouteScreen() {
  return (
    <TabErrorBoundary tabName="ROUTE">
      <RouteScreenInner />
    </TabErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: TACTICAL.bg },
  scroll: { flex: 1 },
  scrollContent: { padding: DENSITY.screenPad, paddingBottom: 100 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: DENSITY.iconTextGap, marginBottom: DENSITY.sectionGap },
  titleText: { ...TYPO.T1, color: TACTICAL.amber },

  // Active Route
  activeRouteCard: { backgroundColor: TACTICAL.panel, borderRadius: 12, borderWidth: DENSITY.borderDefault, borderColor: TACTICAL.amber + '40', padding: DENSITY.cardPad, marginBottom: DENSITY.sectionGap },
  activeRouteHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: DENSITY.titleBodyGap },
  activeRouteBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#66BB6A' },
  activeBadgeText: { ...TYPO.U2, color: '#66BB6A' },
  activeRouteName: { ...TYPO.T2, color: TACTICAL.text, marginBottom: DENSITY.titleBodyGap },
  activeRouteStats: { flexDirection: 'row', alignItems: 'center', marginBottom: DENSITY.internalRowGap },
  routeStat: { flex: 1, alignItems: 'center' },
  routeStatValue: { ...TYPO.K2, color: TACTICAL.text },
  routeStatLabel: { ...TYPO.T4, fontSize: 7, marginTop: 2 },
  routeStatDivider: { width: 1, height: 24, backgroundColor: TACTICAL.border },
  activeRouteMeta: { flexDirection: 'row', justifyContent: 'space-between' },
  routeMetaText: { ...TYPO.B2, fontSize: 10 },

  // Export GPX Button (in active route card)
  exportGpxBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '40',
    backgroundColor: 'rgba(196,138,44,0.08)',
  },
  exportGpxBtnText: {
    ...TYPO.U2,
    color: TACTICAL.amber,
    letterSpacing: 4,
  },
  exportTypeBadge: {
    backgroundColor: 'rgba(196,138,44,0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 4,
  },
  exportTypeBadgeText: {
    ...TYPO.U2,
    fontSize: 7,
    color: TACTICAL.amber,
    letterSpacing: 2,
  },

  // No Route
  noRouteCard: { alignItems: 'center', padding: 32, backgroundColor: TACTICAL.panel, borderRadius: 12, borderWidth: DENSITY.borderDefault, borderColor: TACTICAL.border, gap: DENSITY.cardGap, marginBottom: DENSITY.sectionGap },
  noRouteIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(62,79,60,0.2)', alignItems: 'center', justifyContent: 'center' },
  noRouteTitle: { ...TYPO.T1, color: TACTICAL.text },
  noRouteBody: { ...TYPO.B2, textAlign: 'center', lineHeight: 18 },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: TACTICAL.amber, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  uploadBtnText: { ...TYPO.U1, color: '#0B0F12' },
  browseBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderWidth: DENSITY.borderDefault, borderColor: TACTICAL.border, borderRadius: 10 },
  browseBtnText: { ...TYPO.U2, color: TACTICAL.textMuted },

  // Tip
  tipCard: { backgroundColor: TACTICAL.panel, borderRadius: 10, borderWidth: DENSITY.borderDefault, borderColor: 'rgba(196,138,44,0.2)', padding: DENSITY.cardPad, marginBottom: DENSITY.sectionGap },
  tipHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  tipTitle: { ...TYPO.T4, color: TACTICAL.amber, flex: 1 },
  tipDismiss: { padding: 4 },
  tipText: { ...TYPO.B2, lineHeight: 18 },

  // Section
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: DENSITY.titleBodyGap, marginTop: DENSITY.sectionGap },
  sectionTitle: { ...TYPO.T4, color: TACTICAL.amber, flex: 1 },
  uploadSmallBtn: { width: 28, height: 28, borderRadius: 6, borderWidth: DENSITY.borderDefault, borderColor: TACTICAL.border, alignItems: 'center', justifyContent: 'center' },

  // Controls
  controlsCard: { backgroundColor: TACTICAL.panel, borderRadius: 12, borderWidth: DENSITY.borderDefault, borderColor: TACTICAL.border, padding: DENSITY.cardPad, marginBottom: DENSITY.sectionGap },
  controlRow: { flexDirection: 'row', gap: 8 },
  startBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: TACTICAL.amber, borderRadius: 10, paddingVertical: 12 },
  startBtnText: { ...TYPO.U1, color: '#0B0F12' },
  trackingActive: { gap: 8 },
  pulseRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pulseDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#66BB6A' },
  trackingText: { ...TYPO.U2, color: '#66BB6A' },
  posText: { ...TYPO.K3, color: TACTICAL.textMuted },
  stopBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: TACTICAL.danger, borderRadius: 10, paddingVertical: 12, marginTop: 4 },
  stopBtnText: { ...TYPO.U1, color: '#fff' },
  geoErrorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, backgroundColor: 'rgba(192,57,43,0.1)', padding: 8, borderRadius: 6 },
  geoErrorText: { ...TYPO.B2, color: TACTICAL.danger, flex: 1 },

  // Progress
  progressCard: { backgroundColor: TACTICAL.panel, borderRadius: 12, borderWidth: DENSITY.borderDefault, borderColor: TACTICAL.border, padding: DENSITY.cardPad, marginBottom: DENSITY.sectionGap },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  progressLabel: { ...TYPO.T4 },
  progressPct: { ...TYPO.K1, fontSize: 20 },
  progressBar: { height: 6, backgroundColor: 'rgba(62,79,60,0.2)', borderRadius: 3, overflow: 'hidden', marginBottom: 8 },
  progressFill: { height: '100%', borderRadius: 3 },
  progressStats: { flexDirection: 'row', gap: 16 },
  progressStatText: { ...TYPO.B2, fontSize: 10 },

  // Route Cards
  routeCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: TACTICAL.panel, borderRadius: 10, borderWidth: DENSITY.borderDefault, borderColor: TACTICAL.border, padding: DENSITY.cardPad, marginBottom: 8 },
  routeCardActive: { borderColor: TACTICAL.amber + '40' },
  routeCardLeft: { flexDirection: 'row', alignItems: 'center', gap: DENSITY.iconTextGap, flex: 1 },
  routeCardInfo: { flex: 1 },
  routeCardName: { ...TYPO.T3, color: TACTICAL.text },
  routeCardMeta: { ...TYPO.B2, fontSize: 10, marginTop: 2 },
  routeCardRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  activeIndicator: { padding: 2 },
  activeDotSmall: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#66BB6A' },
  deleteBtn: { padding: 6 },

  // Backup note
  backupNote: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  backupNoteText: { ...TYPO.B2, fontSize: 10 },

  // Modal (shared)
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalContainer: { backgroundColor: TACTICAL.panel, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%', borderTopWidth: 2, borderColor: TACTICAL.border },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: DENSITY.modalPad, borderBottomWidth: DENSITY.borderDefault, borderBottomColor: TACTICAL.border },
  modalTitle: { ...TYPO.T2, color: TACTICAL.amber },
  modalScroll: { padding: DENSITY.modalPad, maxHeight: 400 },
  modalRouteItem: { flexDirection: 'row', alignItems: 'center', gap: DENSITY.iconTextGap, padding: DENSITY.cardPad, borderWidth: DENSITY.borderDefault, borderColor: TACTICAL.border, borderRadius: 10, marginBottom: 8 },
  modalRouteActive: { borderColor: TACTICAL.amber + '40' },
  modalRouteName: { ...TYPO.T3, color: TACTICAL.text },
  modalRouteMeta: { ...TYPO.B2, fontSize: 10, marginTop: 2 },
  modalEmpty: { alignItems: 'center', paddingVertical: 40 },
  modalEmptyText: { ...TYPO.B2 },
  modalUploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: TACTICAL.amber, margin: DENSITY.modalPad, paddingVertical: 14, borderRadius: 10 },
  modalUploadText: { ...TYPO.U1, color: '#0B0F12' },

  // ── Export Modal ──────────────────────────────────────
  exportModalContainer: {
    backgroundColor: TACTICAL.panel,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    borderTopWidth: 2,
    borderColor: TACTICAL.amber + '40',
  },
  exportModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: DENSITY.modalPad,
    borderBottomWidth: DENSITY.borderDefault,
    borderBottomColor: TACTICAL.border,
  },
  exportModalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  exportModalTitle: {
    ...TYPO.T2,
    color: TACTICAL.amber,
  },
  exportRouteNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: DENSITY.modalPad,
    paddingTop: 14,
    paddingBottom: 4,
  },
  exportRouteName: {
    ...TYPO.T3,
    color: TACTICAL.text,
    flex: 1,
  },

  // Export Summary Card
  exportSummaryCard: {
    margin: DENSITY.modalPad,
    marginTop: 8,
    padding: DENSITY.cardPad,
    backgroundColor: 'rgba(62,79,60,0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  exportSummaryTitle: {
    ...TYPO.T4,
    color: TACTICAL.amber,
    marginBottom: 12,
  },
  exportStatsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  exportStatItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  exportStatValue: {
    ...TYPO.K2,
    color: TACTICAL.text,
  },
  exportStatLabel: {
    ...TYPO.T4,
    fontSize: 7,
    letterSpacing: 3,
  },
  exportStatDivider: {
    width: 1,
    height: 32,
    backgroundColor: TACTICAL.border,
  },
  exportMetaRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(62,79,60,0.15)',
  },
  exportMetaItem: {
    flex: 1,
  },
  exportMetaLabel: {
    ...TYPO.T4,
    fontSize: 8,
    letterSpacing: 3,
    marginBottom: 3,
  },
  exportMetaValue: {
    ...TYPO.K3,
    color: TACTICAL.text,
  },

  // Waypoint Types Section
  exportTypesSection: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(62,79,60,0.15)',
    marginBottom: 10,
  },
  exportTypesSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  exportTypesSectionTitle: {
    ...TYPO.T4,
    fontSize: 9,
    color: TACTICAL.amber,
    letterSpacing: 3,
  },
  exportTypesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  exportTypeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(62,79,60,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  exportTypeChipText: {
    ...TYPO.U2,
    fontSize: 8,
    color: TACTICAL.text,
    letterSpacing: 2,
  },
  exportTypeChipCount: {
    backgroundColor: TACTICAL.amber + '30',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  exportTypeChipCountText: {
    ...TYPO.K3,
    fontSize: 9,
    color: TACTICAL.amber,
  },
  exportTypesNote: {
    ...TYPO.B2,
    fontSize: 10,
    color: TACTICAL.textMuted,
    fontStyle: 'italic',
  },

  // Format Info
  exportFormatInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(62,79,60,0.15)',
  },
  exportFormatText: {
    ...TYPO.B2,
    fontSize: 10,
    color: TACTICAL.textMuted,
    flex: 1,
  },

  // Export Actions
  exportActions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: DENSITY.modalPad,
    paddingBottom: 10,
  },
  exportCancelBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  exportCancelBtnText: {
    ...TYPO.U1,
    color: TACTICAL.textMuted,
    letterSpacing: 4,
  },
  exportConfirmBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: TACTICAL.amber,
  },
  exportConfirmBtnDisabled: {
    opacity: 0.6,
  },

  exportConfirmBtnText: {
    ...TYPO.U1,
    color: '#0B0F12',
    letterSpacing: 3,
  },

  // ── Format Picker Styles ──────────────────────────────
  formatPickerContainer: {
    marginBottom: 16,
    paddingHorizontal: DENSITY.modalPad,
    paddingTop: 10,
  },
  formatPickerLabel: {
    fontSize: 10,
    fontWeight: '700' as const,
    letterSpacing: 1.2,
    color: TACTICAL.textMuted,
    marginBottom: 8,
  },
  formatPickerRow: {
    gap: 8,
  },
  formatOption: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  formatOptionActive: {
    borderColor: TACTICAL.amber,
    backgroundColor: 'rgba(196,138,44,0.08)',
  },
  formatOptionHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginBottom: 4,
  },
  formatRadio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  formatRadioActive: {
    borderColor: TACTICAL.amber,
  },
  formatRadioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: TACTICAL.amber,
  },
  formatOptionTitle: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: TACTICAL.textSecondary,
  },
  formatOptionTitleActive: {
    color: TACTICAL.amber,
  },
  formatOptionDesc: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    marginLeft: 24,
    lineHeight: 15,
  },
  formatOptionMime: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.2)',
    marginLeft: 24,
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  // Platform hint
  exportPlatformHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: DENSITY.modalPad,
    paddingBottom: DENSITY.modalPad,
    paddingTop: 4,
  },
  exportPlatformHintText: {
    ...TYPO.B2,
    fontSize: 10,
    color: TACTICAL.textMuted,
  },
});




