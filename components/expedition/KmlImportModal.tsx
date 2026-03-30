/**
 * KML Import Modal — Expedition Command System
 *
 * Full-featured KML/KMZ file import with:
 *   - Cross-platform file picker (expo-document-picker native, DOM web)
 *   - OGC KML 2.2 parsing with source app detection
 *   - Folder hierarchy display
 *   - Feature preview with selective import (per-feature checkboxes)
 *   - Waypoint kind mapping with override UI
 *   - Route geometry → GeoJSON conversion
 *   - KML ExtendedData → ECS metadata extraction
 *   - KMZ (ZIP) detection with user guidance
 *   - Error handling with detailed messages
 */
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView,
  ActivityIndicator, Platform, Dimensions,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import { fsReadFileFromPickerUri } from '../../lib/fsCompat';

import {
  parseKML, validateKmlFile, isKmzContent, kmlRouteToGeoJson,
} from '../../lib/kmlParser';
import type {
  KmlParseResult, KmlWaypoint, KmlRoute, KmlFolder,
} from '../../lib/kmlParser';
import { routeCommandStore, waypointCommandStore } from '../../lib/expeditionCommandStore';
import type { EcsWaypointKind } from '../../lib/expeditionTypes';
import { WAYPOINT_KIND_META } from '../../lib/expeditionTypes';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB (KML can be large)
const { width: SCREEN_WIDTH } = Dimensions.get('window');

const KML_COLOR = '#3B82F6'; // blue for KML branding
const KML_COLOR_LIGHT = 'rgba(59,130,246,';

// ── Props ───────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
  expeditionId: string;
  userId: string;
  onImportComplete: () => void;
  existingRouteId?: string | null;
}

// ── Component ───────────────────────────────────────────────

export default function KmlImportModal({
  visible,
  onClose,
  expeditionId,
  userId,
  onImportComplete,
  existingRouteId,
}: Props) {
  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  // States
  const [stage, setStage] = useState<'pick' | 'preview' | 'importing' | 'success' | 'error'>('pick');
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [parseResult, setParseResult] = useState<KmlParseResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [importStats, setImportStats] = useState<{
    routeName: string;
    waypointCount: number;
    routeCount: number;
    totalCoords: number;
  } | null>(null);

  // Import options
  const [importWaypoints, setImportWaypoints] = useState(true);
  const [importRoutes, setImportRoutes] = useState(true);
  const [selectedWaypoints, setSelectedWaypoints] = useState<Set<number>>(new Set());
  const [selectedRoutes, setSelectedRoutes] = useState<Set<number>>(new Set());
  const [waypointKindOverrides, setWaypointKindOverrides] = useState<Record<number, EcsWaypointKind>>({});
  const [createNewRoute, setCreateNewRoute] = useState(true);
  const [showFolders, setShowFolders] = useState(false);

  // Reset on open
  useEffect(() => {
    if (visible) {
      setStage('pick');
      setFileName('');
      setFileSize(0);
      setParseResult(null);
      setErrorMessage('');
      setImportStats(null);
      setImportWaypoints(true);
      setImportRoutes(true);
      setSelectedWaypoints(new Set());
      setSelectedRoutes(new Set());
      setWaypointKindOverrides({});
      setCreateNewRoute(!existingRouteId);
      setShowFolders(false);
    }
  }, [visible, existingRouteId]);

  // Auto-select all features when parse result changes
  useEffect(() => {
    if (parseResult) {
      setSelectedWaypoints(new Set(parseResult.waypoints.map((_, i) => i)));
      setSelectedRoutes(new Set(parseResult.routes.map((_, i) => i)));
    }
  }, [parseResult]);

  // ── File Content Handler ──────────────────────────────────

  const handleFileContent = useCallback((name: string, content: string, size: number) => {
    if (!mountedRef.current) return;
    setFileName(name);
    setFileSize(size);

    // Check for KMZ (ZIP binary)
    if (isKmzContent(content)) {
      setErrorMessage(
        'This appears to be a KMZ (compressed) file. KMZ support requires decompression. ' +
        'Please extract the .kml file from the KMZ archive using a file manager or unzip tool, then import the .kml file directly.'
      );
      setStage('error');
      return;
    }

    // Validate
    const validation = validateKmlFile(content);
    if (!validation.valid) {
      setErrorMessage(validation.error || 'Invalid KML file.');
      setStage('error');
      return;
    }

    // Parse
    try {
      const result = parseKML(content);
      if (!mountedRef.current) return;

      setParseResult(result);
      setStage('preview');
    } catch (err: any) {
      if (!mountedRef.current) return;
      setErrorMessage(err.message || 'Failed to parse KML file.');
      setStage('error');
    }
  }, []);

  // ── File Picker ───────────────────────────────────────────

  const pickFile = useCallback(async () => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.kml,.kmz,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz';
      input.style.display = 'none';

      input.onchange = (e: any) => {
        const file = e.target?.files?.[0];
        if (!file) return;

        if (file.size > MAX_FILE_SIZE) {
          setErrorMessage(`File too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum is 25 MB.`);
          setStage('error');
          return;
        }

        const reader = new FileReader();
        reader.onload = (ev) => {
          const text = ev.target?.result as string;
          if (!text) {
            setErrorMessage('Failed to read file contents.');
            setStage('error');
            return;
          }
          handleFileContent(file.name, text, file.size);
        };
        reader.onerror = () => {
          setErrorMessage('Failed to read file.');
          setStage('error');
        };
        reader.readAsText(file);
      };

      document.body.appendChild(input);
      input.click();
      setTimeout(() => { try { document.body.removeChild(input); } catch {} }, 5000);
      return;
    }

    // Native: expo-document-picker
    try {
      const DocumentPicker = await import('expo-document-picker' as any);
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/vnd.google-earth.kml+xml', 'application/xml', 'text/xml', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const asset = result.assets[0];
      const name = asset.name || 'imported.kml';
      const size = asset.size || 0;

      if (size > MAX_FILE_SIZE) {
        setErrorMessage(`File too large (${(size / (1024 * 1024)).toFixed(1)} MB). Maximum is 25 MB.`);
        setStage('error');
        return;
      }

      // Read file content via centralized fsCompat fallback
      const text = await fsReadFileFromPickerUri(asset.uri);


      if (text && text.length > 0) {
        handleFileContent(name, text, size);
      } else {
        setErrorMessage('Failed to read file from device. All file reading methods exhausted.');
        setStage('error');
      }

    } catch {
      setErrorMessage('File picker not available. Install expo-document-picker for native file import.');
      setStage('error');
    }
  }, [handleFileContent]);

  // ── Toggle Feature Selection ──────────────────────────────

  const toggleWaypoint = useCallback((idx: number) => {
    setSelectedWaypoints(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const toggleRoute = useCallback((idx: number) => {
    setSelectedRoutes(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const toggleAllWaypoints = useCallback(() => {
    if (!parseResult) return;
    setSelectedWaypoints(prev => {
      if (prev.size === parseResult.waypoints.length) return new Set();
      return new Set(parseResult.waypoints.map((_, i) => i));
    });
  }, [parseResult]);

  const toggleAllRoutes = useCallback(() => {
    if (!parseResult) return;
    setSelectedRoutes(prev => {
      if (prev.size === parseResult.routes.length) return new Set();
      return new Set(parseResult.routes.map((_, i) => i));
    });
  }, [parseResult]);

  // ── Kind Override ─────────────────────────────────────────

  const setKindOverride = useCallback((wpIdx: number, kind: EcsWaypointKind) => {
    setWaypointKindOverrides(prev => ({ ...prev, [wpIdx]: kind }));
  }, []);

  // ── Perform Import ────────────────────────────────────────

  const performImport = useCallback(async () => {
    if (!parseResult || !mountedRef.current) return;
    setStage('importing');

    try {
      let importedRouteCount = 0;
      let importedWpCount = 0;
      let totalCoords = 0;

      // Import routes
      if (importRoutes) {
        for (const routeIdx of selectedRoutes) {
          const route = parseResult.routes[routeIdx];
          if (!route) continue;
          if (!mountedRef.current) return;

          const geojsonData = kmlRouteToGeoJson(route);

          await routeCommandStore.create(userId, {
            expedition_id: expeditionId,
            name: route.name || `Route ${routeIdx + 1}`,
            source: route.source || 'kml',
            geojson: geojsonData,
            distance_mi: route.distanceMi || undefined,
            eta_hours: route.etaHours || undefined,
          });

          importedRouteCount++;
          totalCoords += route.pointCount;
        }
      }

      // If no routes were imported but we have waypoints, create a container route
      let waypointRouteId = existingRouteId || null;
      if (importWaypoints && selectedWaypoints.size > 0 && importedRouteCount === 0 && createNewRoute) {
        const containerRoute = await routeCommandStore.create(userId, {
          expedition_id: expeditionId,
          name: parseResult.name,
          source: parseResult.source.detectedApp || 'kml',
        });
        if (containerRoute) waypointRouteId = containerRoute.id;
      }

      // Import waypoints
      if (importWaypoints) {
        for (const wpIdx of selectedWaypoints) {
          const wp = parseResult.waypoints[wpIdx];
          if (!wp) continue;
          if (!mountedRef.current) return;

          const kind = waypointKindOverrides[wpIdx] || wp.kind;

          await waypointCommandStore.create(userId, {
            expedition_id: expeditionId,
            route_id: waypointRouteId,
            title: wp.name || `Waypoint ${importedWpCount + 1}`,
            kind,
            lat: wp.lat,
            lng: wp.lon,
            meta: {
              elevation_ft: wp.eleFt,
              elevation_m: wp.ele,
              imported_from: fileName,
              source_app: parseResult.source.detectedApp,
              kml_folder: wp.folder,
              kml_icon: wp.iconHref,
              kml_color: wp.color,
              ...(wp.description ? { description: wp.description } : {}),
              ...wp.extendedData,
            },
          });

          importedWpCount++;
        }
      }

      if (!mountedRef.current) return;
      setImportStats({
        routeName: parseResult.name,
        waypointCount: importedWpCount,
        routeCount: importedRouteCount,
        totalCoords,
      });
      setStage('success');
    } catch (err: any) {
      if (!mountedRef.current) return;
      setErrorMessage(err.message || 'Import failed. Please try again.');
      setStage('error');
    }
  }, [parseResult, userId, expeditionId, existingRouteId, createNewRoute,
    importWaypoints, importRoutes, selectedWaypoints, selectedRoutes,
    waypointKindOverrides, fileName]);

  // ── Handle Success Close ──────────────────────────────────

  const handleSuccessClose = useCallback(() => {
    onImportComplete();
    onClose();
  }, [onImportComplete, onClose]);

  // ── Computed values ───────────────────────────────────────

  const canImport = useMemo(() => {
    if (!parseResult) return false;
    return (importWaypoints && selectedWaypoints.size > 0) ||
           (importRoutes && selectedRoutes.size > 0);
  }, [parseResult, importWaypoints, importRoutes, selectedWaypoints, selectedRoutes]);

  const importSummary = useMemo(() => {
    const parts: string[] = [];
    if (importRoutes && selectedRoutes.size > 0) {
      parts.push(`${selectedRoutes.size} ROUTE${selectedRoutes.size !== 1 ? 'S' : ''}`);
    }
    if (importWaypoints && selectedWaypoints.size > 0) {
      parts.push(`${selectedWaypoints.size} WPT`);
    }
    return parts.join(' + ') || 'DATA';
  }, [importWaypoints, importRoutes, selectedWaypoints, selectedRoutes]);

  // ── Render ────────────────────────────────────────────────

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.container}>
          {/* Header */}
          <View style={s.header}>
            <View style={s.headerLeft}>
              <View style={s.headerIcon}>
                <Ionicons name="earth-outline" size={18} color={KML_COLOR} />
              </View>
              <View>
                <Text style={s.headerTitle}>KML IMPORT</Text>
                <Text style={s.headerSub}>
                  {stage === 'pick' ? 'SELECT FILE' :
                   stage === 'preview' ? 'REVIEW PLACEMARKS' :
                   stage === 'importing' ? 'IMPORTING...' :
                   stage === 'success' ? 'COMPLETE' : 'ERROR'}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={stage === 'success' ? handleSuccessClose : onClose} style={s.closeBtn}>
              <Ionicons name="close" size={20} color={TACTICAL.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
            {/* ── PICK STAGE ─────────────────────────────── */}
            {stage === 'pick' && (
              <View style={s.pickContainer}>
                {/* Compatible apps */}
                <View style={s.appsRow}>
                  {[
                    { name: 'Google Earth', icon: 'earth-outline', color: '#4285F4' },
                    { name: 'My Maps', icon: 'map-outline', color: '#34A853' },
                    { name: 'ArcGIS', icon: 'globe-outline', color: '#2C7AC3' },
                    { name: 'QGIS', icon: 'layers-outline', color: '#589632' },
                    { name: 'Garmin', icon: 'navigate-outline', color: '#007DC3' },
                    { name: 'CalTopo', icon: 'layers-outline', color: '#2E7D32' },
                    { name: 'Gaia GPS', icon: 'compass-outline', color: '#FF6B35' },
                    { name: 'onX Maps', icon: 'map-outline', color: '#E85D04' },
                    { name: 'Avenza', icon: 'map-outline', color: '#E53935' },
                    { name: 'ECS', icon: 'shield-outline', color: '#C48A2C' },
                  ].map(app => (
                    <View key={app.name} style={s.appChip}>
                      <Ionicons name={app.icon as any} size={12} color={app.color} />
                      <Text style={[s.appChipText, { color: app.color }]}>{app.name}</Text>
                    </View>
                  ))}
                </View>

                {/* Pick button */}
                <TouchableOpacity style={s.pickBtn} onPress={pickFile} activeOpacity={0.7}>
                  <View style={s.pickBtnIconWrap}>
                    <Ionicons name="earth-outline" size={28} color={KML_COLOR} />
                  </View>
                  <Text style={s.pickBtnTitle}>SELECT KML FILE</Text>
                  <Text style={s.pickBtnSub}>Browse your device for .kml or .kmz files</Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <View style={s.pickBtnBadge}>
                      <Text style={s.pickBtnBadgeText}>.KML</Text>
                    </View>
                    <View style={[s.pickBtnBadge, { backgroundColor: `${KML_COLOR_LIGHT}0.08)` }]}>
                      <Text style={s.pickBtnBadgeText}>.KMZ</Text>
                    </View>
                  </View>
                </TouchableOpacity>

                <Text style={s.pickNote}>
                  Accepts OGC KML 2.2 files up to 25 MB from Google Earth, ArcGIS, QGIS, and other GIS tools
                </Text>

                {/* What gets imported */}
                <View style={s.infoCard}>
                  <Text style={s.infoCardTitle}>WHAT GETS IMPORTED</Text>
                  <View style={s.infoRow}>
                    <Ionicons name="location-outline" size={14} color={KML_COLOR} />
                    <Text style={s.infoRowText}>Point Placemarks as waypoints with kind auto-detection</Text>
                  </View>
                  <View style={s.infoRow}>
                    <Ionicons name="analytics-outline" size={14} color="#42A5F5" />
                    <Text style={s.infoRowText}>LineString / LinearRing as route geometry (converted to GeoJSON)</Text>
                  </View>
                  <View style={s.infoRow}>
                    <Ionicons name="shapes-outline" size={14} color="#CE93D8" />
                    <Text style={s.infoRowText}>Polygon outer boundaries as route paths</Text>
                  </View>
                  <View style={s.infoRow}>
                    <Ionicons name="folder-outline" size={14} color="#FFB74D" />
                    <Text style={s.infoRowText}>Folder hierarchy preserved as metadata</Text>
                  </View>
                  <View style={s.infoRow}>
                    <Ionicons name="list-outline" size={14} color="#4DB6AC" />
                    <Text style={s.infoRowText}>ExtendedData / SimpleData → ECS metadata properties</Text>
                  </View>
                  <View style={s.infoRow}>
                    <Ionicons name="color-palette-outline" size={14} color="#FF7043" />
                    <Text style={s.infoRowText}>KML styles (icon, line color, width) extraction</Text>
                  </View>
                </View>

                {/* KMZ note */}
                <View style={[s.infoCard, { borderColor: `${KML_COLOR_LIGHT}0.15)`, backgroundColor: `${KML_COLOR_LIGHT}0.04)` }]}>
                  <View style={s.infoRow}>
                    <Ionicons name="information-circle-outline" size={14} color={KML_COLOR} />
                    <Text style={[s.infoRowText, { color: TACTICAL.textMuted, fontSize: 10 }]}>
                      KMZ files are ZIP archives containing KML. If importing a KMZ, extract the .kml file first using your device's file manager.
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* ── PREVIEW STAGE ──────────────────────────── */}
            {stage === 'preview' && parseResult && (
              <View style={s.previewContainer}>
                {/* Source badge */}
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  <View style={[s.sourceBadge, { flex: 0, paddingHorizontal: 8, paddingVertical: 4 }]}>
                    <Ionicons name="earth-outline" size={12} color={KML_COLOR} />
                    <Text style={[s.sourceBadgeText, { color: KML_COLOR, fontSize: 9 }]}>KML</Text>
                  </View>
                  <View style={[s.sourceBadge, { flex: 1 }]}>
                    <Ionicons name={parseResult.source.appIcon as any} size={16} color={parseResult.source.appColor} />
                    <Text style={[s.sourceBadgeText, { color: parseResult.source.appColor }]}>
                      {parseResult.source.detectedApp || 'Unknown Source'}
                    </Text>
                    <View style={s.sourceBadgeDot} />
                    <Text style={s.sourceFileName}>{fileName}</Text>
                    <Text style={s.sourceFileSize}>
                      {fileSize > 1024 * 1024
                        ? `${(fileSize / (1024 * 1024)).toFixed(1)} MB`
                        : `${Math.round(fileSize / 1024)} KB`}
                    </Text>
                  </View>
                </View>

                {/* ECS round-trip badge */}
                {parseResult.source.isEcsExport && (
                  <View style={s.ecsRoundTripBadge}>
                    <Ionicons name="shield-outline" size={14} color="#C48A2C" />
                    <Text style={s.ecsRoundTripText}>
                      ECS EXPORT DETECTED — Waypoint kinds and metadata will be restored automatically
                    </Text>
                  </View>
                )}

                {/* Collection name */}
                <Text style={s.previewName}>{parseResult.name}</Text>
                {parseResult.description && (
                  <Text style={s.previewDesc} numberOfLines={2}>{parseResult.description}</Text>
                )}

                {/* Stats grid */}
                <View style={s.statsGrid}>
                  <StatBox
                    label="PLACEMARKS"
                    value={`${parseResult.totalPlacemarks}`}
                    unit="TOTAL"
                    icon="pin-outline"
                    color={KML_COLOR}
                  />
                  <StatBox
                    label="POINTS"
                    value={`${parseResult.totalPointFeatures}`}
                    unit="WPT"
                    icon="location-outline"
                    color="#66BB6A"
                  />
                  <StatBox
                    label="LINES"
                    value={`${parseResult.totalLineFeatures}`}
                    unit="RTE"
                    icon="analytics-outline"
                    color="#42A5F5"
                  />
                  <StatBox
                    label="COORDS"
                    value={parseResult.totalCoordinates > 999
                      ? `${(parseResult.totalCoordinates / 1000).toFixed(1)}k`
                      : `${parseResult.totalCoordinates}`}
                    unit="PTS"
                    icon="grid-outline"
                    color="#CE93D8"
                  />
                </View>

                {/* Bounds */}
                {parseResult.bounds && (
                  <View style={s.boundsCard}>
                    <Ionicons name="scan-outline" size={14} color={TACTICAL.textMuted} />
                    <Text style={s.boundsText}>
                      BOUNDS: {parseResult.bounds.minLat.toFixed(4)}, {parseResult.bounds.minLon.toFixed(4)} {'\u2192'}{' '}
                      {parseResult.bounds.maxLat.toFixed(4)}, {parseResult.bounds.maxLon.toFixed(4)}
                    </Text>
                  </View>
                )}

                {/* Folder hierarchy */}
                {parseResult.folders.length > 0 && (
                  <TouchableOpacity
                    style={s.foldersToggle}
                    onPress={() => setShowFolders(p => !p)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="folder-outline" size={14} color="#FFB74D" />
                    <Text style={s.foldersToggleText}>
                      {parseResult.folders.length} FOLDER{parseResult.folders.length !== 1 ? 'S' : ''}
                    </Text>
                    <Ionicons
                      name={showFolders ? 'chevron-up' : 'chevron-down'}
                      size={14}
                      color={TACTICAL.textMuted}
                    />
                  </TouchableOpacity>
                )}

                {showFolders && parseResult.folders.length > 0 && (
                  <View style={s.foldersContainer}>
                    {parseResult.folders.map((folder, idx) => (
                      <View
                        key={idx}
                        style={[s.folderRow, { paddingLeft: 12 + folder.depth * 16 }]}
                      >
                        <Ionicons
                          name={folder.depth > 0 ? 'folder-open-outline' : 'folder-outline'}
                          size={12}
                          color="#FFB74D"
                        />
                        <Text style={s.folderName} numberOfLines={1}>{folder.name}</Text>
                        <View style={s.folderStats}>
                          {folder.waypointCount > 0 && (
                            <Text style={s.folderStatText}>{folder.waypointCount} wpt</Text>
                          )}
                          {folder.routeCount > 0 && (
                            <Text style={s.folderStatText}>{folder.routeCount} rte</Text>
                          )}
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {/* ── Route Features ─────────────────────── */}
                {parseResult.routes.length > 0 && (
                  <View style={s.featureSection}>
                    <View style={s.featureSectionHeader}>
                      <TouchableOpacity
                        style={[s.sectionCheck, importRoutes && selectedRoutes.size === parseResult.routes.length && s.sectionCheckActive]}
                        onPress={toggleAllRoutes}
                        activeOpacity={0.7}
                      >
                        {importRoutes && selectedRoutes.size === parseResult.routes.length && (
                          <Ionicons name="checkmark" size={10} color="#0B0F12" />
                        )}
                      </TouchableOpacity>
                      <Ionicons name="analytics-outline" size={14} color="#42A5F5" />
                      <Text style={s.featureSectionTitle}>ROUTES ({parseResult.routes.length})</Text>
                      <TouchableOpacity
                        style={[s.toggleBtn, !importRoutes && s.toggleBtnOff]}
                        onPress={() => setImportRoutes(p => !p)}
                      >
                        <Text style={[s.toggleBtnText, !importRoutes && s.toggleBtnTextOff]}>
                          {importRoutes ? 'ON' : 'OFF'}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {importRoutes && parseResult.routes.map((route, idx) => (
                      <RoutePreviewRow
                        key={idx}
                        route={route}
                        index={idx}
                        selected={selectedRoutes.has(idx)}
                        onToggle={() => toggleRoute(idx)}
                      />
                    ))}
                  </View>
                )}

                {/* ── Waypoint Features ──────────────────── */}
                {parseResult.waypoints.length > 0 && (
                  <View style={s.featureSection}>
                    <View style={s.featureSectionHeader}>
                      <TouchableOpacity
                        style={[s.sectionCheck, importWaypoints && selectedWaypoints.size === parseResult.waypoints.length && s.sectionCheckActive]}
                        onPress={toggleAllWaypoints}
                        activeOpacity={0.7}
                      >
                        {importWaypoints && selectedWaypoints.size === parseResult.waypoints.length && (
                          <Ionicons name="checkmark" size={10} color="#0B0F12" />
                        )}
                      </TouchableOpacity>
                      <Ionicons name="location-outline" size={14} color="#66BB6A" />
                      <Text style={s.featureSectionTitle}>WAYPOINTS ({parseResult.waypoints.length})</Text>
                      <TouchableOpacity
                        style={[s.toggleBtn, !importWaypoints && s.toggleBtnOff]}
                        onPress={() => setImportWaypoints(p => !p)}
                      >
                        <Text style={[s.toggleBtnText, !importWaypoints && s.toggleBtnTextOff]}>
                          {importWaypoints ? 'ON' : 'OFF'}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {importWaypoints && parseResult.waypoints.slice(0, 12).map((wp, idx) => (
                      <WaypointPreviewRow
                        key={idx}
                        waypoint={wp}
                        index={idx}
                        selected={selectedWaypoints.has(idx)}
                        onToggle={() => toggleWaypoint(idx)}
                        kindOverride={waypointKindOverrides[idx]}
                        onKindChange={(kind) => setKindOverride(idx, kind)}
                      />
                    ))}

                    {importWaypoints && parseResult.waypoints.length > 12 && (
                      <Text style={s.moreText}>
                        + {parseResult.waypoints.length - 12} more waypoints (all selected)
                      </Text>
                    )}
                  </View>
                )}

                {/* Import options */}
                {existingRouteId && (
                  <View style={s.optionsCard}>
                    <Text style={s.optionsTitle}>IMPORT OPTIONS</Text>
                    <TouchableOpacity
                      style={s.optionRow}
                      onPress={() => setCreateNewRoute(p => !p)}
                      activeOpacity={0.7}
                    >
                      <View style={[s.optionCheck, createNewRoute && s.optionCheckActive]}>
                        {createNewRoute && <Ionicons name="checkmark" size={12} color="#0B0F12" />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.optionLabel}>Create new route</Text>
                        <Text style={s.optionSub}>Uncheck to attach waypoints to current route</Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {/* ── IMPORTING STAGE ────────────────────────── */}
            {stage === 'importing' && (
              <View style={s.importingContainer}>
                <ActivityIndicator size="large" color={KML_COLOR} />
                <Text style={s.importingTitle}>IMPORTING KML DATA</Text>
                <Text style={s.importingSub}>Converting Placemarks to routes and waypoints...</Text>
                <View style={s.importingProgress}>
                  <View style={s.importingProgressBar} />
                </View>
              </View>
            )}

            {/* ── SUCCESS STAGE ───────────────────────────── */}
            {stage === 'success' && importStats && (
              <View style={s.successContainer}>
                <View style={s.successIcon}>
                  <Ionicons name="checkmark-circle" size={48} color="#66BB6A" />
                </View>
                <Text style={s.successTitle}>KML IMPORTED SUCCESSFULLY</Text>
                <Text style={s.successSub}>{importStats.routeName}</Text>

                <View style={s.successStats}>
                  {importStats.routeCount > 0 && (
                    <View style={s.successStatRow}>
                      <Ionicons name="analytics-outline" size={14} color="#42A5F5" />
                      <Text style={s.successStatText}>
                        {importStats.routeCount} route{importStats.routeCount !== 1 ? 's' : ''} with {importStats.totalCoords.toLocaleString()} coordinate points
                      </Text>
                    </View>
                  )}
                  {importStats.waypointCount > 0 && (
                    <View style={s.successStatRow}>
                      <Ionicons name="location-outline" size={14} color="#66BB6A" />
                      <Text style={s.successStatText}>
                        {importStats.waypointCount} waypoint{importStats.waypointCount !== 1 ? 's' : ''} created with kind classification
                      </Text>
                    </View>
                  )}
                  <View style={s.successStatRow}>
                    <Ionicons name="document-outline" size={14} color={KML_COLOR} />
                    <Text style={s.successStatText}>Source: {fileName}</Text>
                  </View>
                </View>

                <View style={s.successApps}>
                  <Text style={s.successAppsLabel}>KML TO GEOJSON CONVERSION</Text>
                  <Text style={s.successAppsText}>
                    Route geometry converted from KML to GeoJSON for native ECS storage. ExtendedData preserved as metadata.
                  </Text>
                </View>
              </View>
            )}

            {/* ── ERROR STAGE ─────────────────────────────── */}
            {stage === 'error' && (
              <View style={s.errorContainer}>
                <View style={s.errorIcon}>
                  <Ionicons name="alert-circle" size={48} color={TACTICAL.danger} />
                </View>
                <Text style={s.errorTitle}>IMPORT FAILED</Text>
                <Text style={s.errorMessage}>{errorMessage}</Text>

                <TouchableOpacity
                  style={s.retryBtn}
                  onPress={() => setStage('pick')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="refresh-outline" size={16} color={TACTICAL.text} />
                  <Text style={s.retryBtnText}>TRY AGAIN</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>

          {/* Footer actions */}
          {stage === 'preview' && (
            <View style={s.footer}>
              <TouchableOpacity style={s.cancelBtn} onPress={onClose} activeOpacity={0.7}>
                <Text style={s.cancelBtnText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.importBtn, !canImport && { opacity: 0.4 }]}
                onPress={performImport}
                disabled={!canImport}
                activeOpacity={0.7}
              >
                <Ionicons name="download-outline" size={16} color="#0B0F12" />
                <Text style={s.importBtnText}>IMPORT {importSummary}</Text>
              </TouchableOpacity>
            </View>
          )}

          {stage === 'success' && (
            <View style={s.footer}>
              <TouchableOpacity style={s.doneBtn} onPress={handleSuccessClose} activeOpacity={0.7}>
                <Ionicons name="checkmark-outline" size={16} color="#0B0F12" />
                <Text style={s.doneBtnText}>DONE</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ── Sub-components ──────────────────────────────────────────

function StatBox({ label, value, unit, icon, color }: {
  label: string; value: string; unit: string; icon: string; color: string;
}) {
  return (
    <View style={s.statBox}>
      <Ionicons name={icon as any} size={14} color={color} />
      <Text style={[s.statValue, { color }]}>{value}</Text>
      <Text style={s.statUnit}>{unit}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function RoutePreviewRow({ route, index, selected, onToggle }: {
  route: KmlRoute; index: number; selected: boolean; onToggle: () => void;
}) {
  const color = route.color || '#42A5F5';
  const geomLabel = route.geometryType === 'Polygon' ? 'POLY'
    : route.geometryType === 'LinearRing' ? 'RING'
    : route.geometryType === 'MultiGeometry' ? 'MULTI'
    : 'LINE';

  return (
    <TouchableOpacity style={s.featureRow} onPress={onToggle} activeOpacity={0.7}>
      <View style={[s.featureCheck, selected && s.featureCheckActive]}>
        {selected && <Ionicons name="checkmark" size={12} color="#0B0F12" />}
      </View>
      <View style={[s.featureIcon, { borderColor: `${color}40` }]}>
        <Ionicons
          name={route.geometryType === 'Polygon' ? 'shapes-outline' : 'analytics-outline'}
          size={12}
          color={color}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.featureName} numberOfLines={1}>
          {route.name || `Route ${index + 1}`}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={s.featureDetail}>
            {route.pointCount} pts
            {route.distanceMi ? ` / ${route.distanceMi} mi` : ''}
          </Text>
          {route.folder && (
            <Text style={s.featureFolder} numberOfLines={1}>
              {route.folder}
            </Text>
          )}
        </View>
      </View>
      <View style={[s.geomBadge, { borderColor: `${color}40`, backgroundColor: `${color}10` }]}>
        <Text style={[s.geomBadgeText, { color }]}>{geomLabel}</Text>
      </View>
    </TouchableOpacity>
  );
}

function WaypointPreviewRow({ waypoint, index, selected, onToggle, kindOverride, onKindChange }: {
  waypoint: KmlWaypoint;
  index: number;
  selected: boolean;
  onToggle: () => void;
  kindOverride?: EcsWaypointKind;
  onKindChange: (kind: EcsWaypointKind) => void;
}) {
  const [showKindPicker, setShowKindPicker] = useState(false);
  const kind = kindOverride || waypoint.kind;
  const kindMeta = WAYPOINT_KIND_META[kind];
  const color = kindMeta?.color || '#8A8A85';

  return (
    <View>
      <TouchableOpacity style={s.featureRow} onPress={onToggle} activeOpacity={0.7}>
        <View style={[s.featureCheck, selected && s.featureCheckActive]}>
          {selected && <Ionicons name="checkmark" size={12} color="#0B0F12" />}
        </View>
        <View style={[s.featureIcon, { borderColor: `${color}40` }]}>
          <Ionicons name={(kindMeta?.icon || 'location-outline') as any} size={12} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.featureName} numberOfLines={1}>
            {waypoint.name || `Waypoint ${index + 1}`}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={s.featureDetail}>
              {waypoint.lat.toFixed(5)}, {waypoint.lon.toFixed(5)}
              {waypoint.eleFt != null ? ` / ${waypoint.eleFt.toLocaleString()} ft` : ''}
            </Text>
            {waypoint.folder && (
              <Text style={s.featureFolder} numberOfLines={1}>
                {waypoint.folder}
              </Text>
            )}
          </View>
        </View>
        <TouchableOpacity
          style={[s.kindBadge, { borderColor: `${color}40`, backgroundColor: `${color}10` }]}
          onPress={() => setShowKindPicker(!showKindPicker)}
          activeOpacity={0.7}
        >
          <Text style={[s.kindBadgeText, { color }]}>{kindMeta?.label || kind.toUpperCase()}</Text>
          <Ionicons name="chevron-down" size={8} color={color} />
        </TouchableOpacity>
      </TouchableOpacity>

      {/* Kind picker dropdown */}
      {showKindPicker && selected && (
        <View style={s.kindPickerRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 36 }}>
              {(Object.entries(WAYPOINT_KIND_META) as [EcsWaypointKind, typeof WAYPOINT_KIND_META['waypoint']][]).map(([k, meta]) => {
                const isActive = kind === k;
                return (
                  <TouchableOpacity
                    key={k}
                    style={[s.kindPickerChip, isActive && { borderColor: meta.color, backgroundColor: `${meta.color}15` }]}
                    onPress={() => {
                      onKindChange(k);
                      setShowKindPicker(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name={meta.icon as any} size={10} color={isActive ? meta.color : TACTICAL.textMuted} />
                    <Text style={[s.kindPickerChipText, isActive && { color: meta.color }]}>{meta.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </View>
      )}
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  container: {
    backgroundColor: TACTICAL.panel,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '92%',
    minHeight: '50%',
  },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(62,79,60,0.3)',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: `${KML_COLOR_LIGHT}0.1)`, borderWidth: 1, borderColor: `${KML_COLOR_LIGHT}0.25)`,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 14, fontWeight: '900', color: KML_COLOR, letterSpacing: 1.5 },
  headerSub: { fontSize: 9, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1.5, marginTop: 1 },
  closeBtn: { padding: 6 },

  body: { paddingHorizontal: 16, paddingBottom: 20 },

  // Pick Stage
  pickContainer: { paddingTop: 16, gap: 14 },
  appsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  appChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.18)', borderWidth: 1, borderColor: 'rgba(62,79,60,0.2)',
  },
  appChipText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },

  pickBtn: {
    alignItems: 'center', paddingVertical: 24, borderRadius: 14,
    backgroundColor: `${KML_COLOR_LIGHT}0.06)`, borderWidth: 1.5,
    borderColor: `${KML_COLOR_LIGHT}0.3)`, borderStyle: 'dashed', gap: 8,
  },
  pickBtnIconWrap: {
    width: 56, height: 56, borderRadius: 16,
    backgroundColor: `${KML_COLOR_LIGHT}0.1)`, alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  pickBtnTitle: { fontSize: 14, fontWeight: '900', color: KML_COLOR, letterSpacing: 1.5 },
  pickBtnSub: { fontSize: 11, color: TACTICAL.textMuted },
  pickBtnBadge: {
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6,
    backgroundColor: `${KML_COLOR_LIGHT}0.12)`, borderWidth: 1, borderColor: `${KML_COLOR_LIGHT}0.2)`,
  },
  pickBtnBadgeText: { fontSize: 9, fontWeight: '800', color: KML_COLOR, letterSpacing: 1 },

  pickNote: { fontSize: 10, color: TACTICAL.textMuted, textAlign: 'center', letterSpacing: 0.5 },

  infoCard: {
    padding: 14, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.12)',
    borderWidth: 1, borderColor: 'rgba(62,79,60,0.2)', gap: 8,
  },
  infoCardTitle: { fontSize: 10, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 2, marginBottom: 2 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoRowText: { fontSize: 11, color: TACTICAL.text, flex: 1 },

  // Preview Stage
  previewContainer: { paddingTop: 12, gap: 12 },

  sourceBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.18)', borderWidth: 1, borderColor: 'rgba(62,79,60,0.2)',
    flexWrap: 'wrap',
  },
  sourceBadgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  sourceBadgeDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: TACTICAL.textMuted },
  sourceFileName: { fontSize: 10, color: TACTICAL.text, fontFamily: 'Courier' },
  sourceFileSize: { fontSize: 9, color: TACTICAL.textMuted },

  ecsRoundTripBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10,
    backgroundColor: 'rgba(196,138,44,0.06)', borderWidth: 1, borderColor: 'rgba(196,138,44,0.2)',
  },
  ecsRoundTripText: { fontSize: 10, fontWeight: '700', color: '#C48A2C', flex: 1, letterSpacing: 0.3 },

  previewName: { fontSize: 16, fontWeight: '900', color: TACTICAL.text, letterSpacing: 0.3 },
  previewDesc: { fontSize: 11, color: TACTICAL.textMuted, lineHeight: 16 },

  statsGrid: { flexDirection: 'row', gap: 8 },
  statBox: {
    flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.18)', borderWidth: 1, borderColor: 'rgba(62,79,60,0.2)', gap: 2,
  },
  statValue: { fontSize: 16, fontWeight: '900', fontFamily: 'Courier' },
  statUnit: { fontSize: 8, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1 },
  statLabel: { fontSize: 7, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1, marginTop: 2 },

  boundsCard: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.08)',
  },
  boundsText: { fontSize: 9, color: TACTICAL.textMuted, fontFamily: 'Courier', flex: 1 },

  // Folder hierarchy
  foldersToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10,
    backgroundColor: 'rgba(255,183,77,0.06)', borderWidth: 1, borderColor: 'rgba(255,183,77,0.15)',
  },
  foldersToggleText: { fontSize: 10, fontWeight: '800', color: '#FFB74D', letterSpacing: 1.5, flex: 1 },
  foldersContainer: {
    borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.1)',
    borderWidth: 1, borderColor: 'rgba(62,79,60,0.15)', overflow: 'hidden',
  },
  folderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, paddingRight: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(62,79,60,0.1)',
  },
  folderName: { fontSize: 11, fontWeight: '700', color: TACTICAL.text, flex: 1 },
  folderStats: { flexDirection: 'row', gap: 8 },
  folderStatText: { fontSize: 9, color: TACTICAL.textMuted, fontFamily: 'Courier' },

  // Feature sections
  featureSection: { gap: 4 },
  featureSectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, paddingHorizontal: 4,
  },
  sectionCheck: {
    width: 18, height: 18, borderRadius: 5, borderWidth: 1.5,
    borderColor: TACTICAL.border, alignItems: 'center', justifyContent: 'center',
  },
  sectionCheckActive: { backgroundColor: KML_COLOR, borderColor: KML_COLOR },
  featureSectionTitle: { fontSize: 10, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 2, flex: 1 },
  toggleBtn: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6,
    backgroundColor: `${KML_COLOR_LIGHT}0.12)`, borderWidth: 1, borderColor: `${KML_COLOR_LIGHT}0.25)`,
  },
  toggleBtnOff: { backgroundColor: 'rgba(62,79,60,0.1)', borderColor: TACTICAL.border },
  toggleBtnText: { fontSize: 8, fontWeight: '800', color: KML_COLOR, letterSpacing: 1 },
  toggleBtnTextOff: { color: TACTICAL.textMuted },

  // Feature rows
  featureRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, paddingHorizontal: 8, borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.06)', borderWidth: 1, borderColor: 'rgba(62,79,60,0.12)',
  },
  featureCheck: {
    width: 20, height: 20, borderRadius: 5, borderWidth: 1.5,
    borderColor: TACTICAL.border, alignItems: 'center', justifyContent: 'center',
  },
  featureCheckActive: { backgroundColor: KML_COLOR, borderColor: KML_COLOR },
  featureIcon: {
    width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)', borderWidth: 1,
  },
  featureName: { fontSize: 11, fontWeight: '700', color: TACTICAL.text },
  featureDetail: { fontSize: 9, color: TACTICAL.textMuted, fontFamily: 'Courier', marginTop: 1 },
  featureFolder: {
    fontSize: 8, color: '#FFB74D', fontWeight: '600', letterSpacing: 0.3,
    maxWidth: 80,
  },

  geomBadge: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1,
  },
  geomBadgeText: { fontSize: 7, fontWeight: '900', letterSpacing: 0.8 },

  kindBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, borderWidth: 1,
  },
  kindBadgeText: { fontSize: 7, fontWeight: '900', letterSpacing: 0.8 },

  kindPickerRow: { paddingVertical: 6 },
  kindPickerChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6,
    borderWidth: 1, borderColor: TACTICAL.border,
  },
  kindPickerChipText: { fontSize: 8, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 0.8 },

  moreText: { fontSize: 10, color: TACTICAL.textMuted, textAlign: 'center', paddingVertical: 6, fontStyle: 'italic' },

  // Options
  optionsCard: {
    padding: 14, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.12)',
    borderWidth: 1, borderColor: 'rgba(62,79,60,0.2)', gap: 10,
  },
  optionsTitle: { fontSize: 10, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 2 },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  optionCheck: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5,
    borderColor: TACTICAL.border, alignItems: 'center', justifyContent: 'center',
  },
  optionCheckActive: { backgroundColor: KML_COLOR, borderColor: KML_COLOR },
  optionLabel: { fontSize: 12, fontWeight: '700', color: TACTICAL.text },
  optionSub: { fontSize: 9, color: TACTICAL.textMuted, marginTop: 1 },

  // Importing
  importingContainer: { alignItems: 'center', paddingVertical: 40, gap: 16 },
  importingTitle: { fontSize: 14, fontWeight: '900', color: KML_COLOR, letterSpacing: 1.5 },
  importingSub: { fontSize: 11, color: TACTICAL.textMuted },
  importingProgress: {
    width: 200, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(62,79,60,0.3)', overflow: 'hidden',
  },
  importingProgressBar: {
    width: '60%', height: '100%', backgroundColor: KML_COLOR, borderRadius: 2,
  },

  // Success
  successContainer: { alignItems: 'center', paddingVertical: 20, gap: 12 },
  successIcon: { marginBottom: 4 },
  successTitle: { fontSize: 14, fontWeight: '900', color: '#66BB6A', letterSpacing: 1.5 },
  successSub: { fontSize: 12, color: TACTICAL.text, fontWeight: '700' },
  successStats: {
    width: '100%', padding: 14, borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.12)', borderWidth: 1, borderColor: 'rgba(62,79,60,0.2)', gap: 8,
  },
  successStatRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  successStatText: { fontSize: 11, color: TACTICAL.text, flex: 1 },
  successApps: {
    alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10,
    backgroundColor: `${KML_COLOR_LIGHT}0.06)`, borderWidth: 1, borderColor: `${KML_COLOR_LIGHT}0.15)`, width: '100%',
  },
  successAppsLabel: { fontSize: 8, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 2, marginBottom: 4 },
  successAppsText: { fontSize: 10, color: KML_COLOR, textAlign: 'center' },

  // Error
  errorContainer: { alignItems: 'center', paddingVertical: 30, gap: 12 },
  errorIcon: { marginBottom: 4 },
  errorTitle: { fontSize: 14, fontWeight: '900', color: TACTICAL.danger, letterSpacing: 1.5 },
  errorMessage: { fontSize: 12, color: TACTICAL.text, textAlign: 'center', lineHeight: 18, paddingHorizontal: 10 },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10,
    backgroundColor: 'rgba(62,79,60,0.2)', borderWidth: 1, borderColor: TACTICAL.border, marginTop: 8,
  },
  retryBtnText: { fontSize: 12, fontWeight: '800', color: TACTICAL.text, letterSpacing: 1 },

  // Footer
  footer: {
    flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 14,
    paddingBottom: Platform.OS === 'web' ? 14 : 34,
    borderTopWidth: 1, borderTopColor: 'rgba(62,79,60,0.3)',
  },
  cancelBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 12,
    backgroundColor: 'rgba(62,79,60,0.2)', borderWidth: 1, borderColor: TACTICAL.border,
  },
  cancelBtnText: { fontSize: 12, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 1 },
  importBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 12, backgroundColor: KML_COLOR,
  },
  importBtnText: { fontSize: 12, fontWeight: '900', color: '#0B0F12', letterSpacing: 1.2 },
  doneBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 12, backgroundColor: '#66BB6A',
  },
  doneBtnText: { fontSize: 12, fontWeight: '900', color: '#0B0F12', letterSpacing: 1.2 },
});



