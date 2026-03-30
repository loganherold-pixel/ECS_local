/**
 * Geo Import Modal — Expedition Command System
 *
 * Full-featured GPX + KML file import with:
 *   - Cross-platform file picker (expo-document-picker native, DOM web)
 *   - GPX 1.1 and KML 2.2 parsing with source app detection
 *   - Preview with route stats, elevation profile, waypoint list
 *   - Import confirmation → creates EcsRoute + EcsWaypoints
 *   - Error handling with detailed messages
 *   - KMZ detection with helpful extraction guidance
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
  parseGeoFile, validateGeoFile, detectFileType,
  mapToWaypointKind, mapKmlToWaypointKind,
} from '../../lib/gpxParser';
import type { GpxParseResult, GpxWaypoint, ElevationProfilePoint, GeoFileType } from '../../lib/gpxParser';
import { routeCommandStore, waypointCommandStore } from '../../lib/expeditionCommandStore';
import type { EcsWaypointKind } from '../../lib/expeditionTypes';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const { width: SCREEN_WIDTH } = Dimensions.get('window');

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

export default function GpxImportModal({
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
  const [parseResult, setParseResult] = useState<GpxParseResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [importStats, setImportStats] = useState<{ routeName: string; waypointCount: number; trackPoints: number } | null>(null);
  const [detectedFormat, setDetectedFormat] = useState<GeoFileType>('gpx');

  // Import options
  const [importWaypoints, setImportWaypoints] = useState(true);
  const [importTracks, setImportTracks] = useState(true);
  const [createNewRoute, setCreateNewRoute] = useState(true);

  // Derived: is this a KML file?
  const isKml = detectedFormat === 'kml';
  const formatLabel = isKml ? 'KML' : 'GPX';
  const formatColor = isKml ? '#4285F4' : TACTICAL.amber;

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
      setImportTracks(true);
      setCreateNewRoute(!existingRouteId);
      setDetectedFormat('gpx');
    }
  }, [visible, existingRouteId]);

  // ── File Content Handler ──────────────────────────────────

  const handleFileContent = useCallback((name: string, content: string, size: number) => {
    if (!mountedRef.current) return;
    setFileName(name);
    setFileSize(size);

    // Detect file type
    const fileType = detectFileType(name, content);
    setDetectedFormat(fileType === 'kml' ? 'kml' : 'gpx');

    // Validate using unified validator
    const validation = validateGeoFile(name, content);
    if (!validation.valid) {
      setErrorMessage(validation.error || 'Invalid file.');
      setStage('error');
      return;
    }

    // Parse using unified parser
    try {
      const result = parseGeoFile(name, content);
      if (!mountedRef.current) return;

      if (result.waypoints.length === 0 && result.totalTrackPoints === 0) {
        setErrorMessage(`${fileType === 'kml' ? 'KML' : 'GPX'} file contains no geographic data (no waypoints or track points found).`);
        setStage('error');
        return;
      }

      setParseResult(result);
      setStage('preview');
    } catch (err: any) {
      if (!mountedRef.current) return;
      setErrorMessage(err.message || `Failed to parse ${fileType === 'kml' ? 'KML' : 'GPX'} file.`);
      setStage('error');
    }
  }, []);


  // ── File Picker ───────────────────────────────────────────

  const pickFile = useCallback(async () => {
    // Web: DOM file input
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.gpx,.kml,.kmz,application/gpx+xml,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz,text/xml,application/xml';
      input.style.display = 'none';

      input.onchange = (e: any) => {
        const file = e.target?.files?.[0];
        if (!file) return;

        if (file.size > MAX_FILE_SIZE) {
          setErrorMessage(`File too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum is 10 MB.`);
          setStage('error');
          return;
        }

        const ext = file.name.toLowerCase().split('.').pop();
        if (!['gpx', 'kml', 'kmz'].includes(ext || '')) {
          setErrorMessage('Invalid file type. Accepted formats: .gpx, .kml, .kmz');
          setStage('error');
          return;
        }

        if (ext === 'kmz') {
          setErrorMessage(
            'KMZ files are compressed archives. Please extract the .kml file from the KMZ first:\n\n' +
            '1. Rename .kmz to .zip\n' +
            '2. Unzip to find doc.kml\n' +
            '3. Import the .kml file\n\n' +
            'Or export as .kml directly from Google Earth.'
          );
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
        type: [
          'application/gpx+xml',
          'application/vnd.google-earth.kml+xml',
          'application/vnd.google-earth.kmz',
          'text/xml',
          'application/xml',
          '*/*',
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const asset = result.assets[0];
      const name = asset.name || 'imported.gpx';
      const size = asset.size || 0;

      if (size > MAX_FILE_SIZE) {
        setErrorMessage(`File too large (${(size / (1024 * 1024)).toFixed(1)} MB). Maximum is 10 MB.`);
        setStage('error');
        return;
      }

      const ext = name.toLowerCase().split('.').pop();
      if (!['gpx', 'kml', 'kmz'].includes(ext || '')) {
        setErrorMessage('Invalid file type. Accepted formats: .gpx, .kml, .kmz');
        setStage('error');
        return;
      }

      if (ext === 'kmz') {
        setErrorMessage(
          'KMZ files are compressed archives. Please extract the .kml file from the KMZ first, ' +
          'or export as .kml directly from Google Earth.'
        );
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


  // ── Perform Import ────────────────────────────────────────

  const performImport = useCallback(async () => {
    if (!parseResult || !mountedRef.current) return;
    setStage('importing');

    try {
      let routeId = existingRouteId || null;
      let routeName = parseResult.name;

      // Create route if needed
      if (createNewRoute || !routeId) {
        const route = await routeCommandStore.create(userId, {
          expedition_id: expeditionId,
          name: routeName,
          source: parseResult.source.detectedApp || 'gpx',
          geojson: importTracks ? parseResult.geojson : undefined,
          distance_mi: parseResult.totalDistanceMi || undefined,
          eta_hours: parseResult.estimatedEtaHours || undefined,
        });
        if (!mountedRef.current) return;
        if (route) routeId = route.id;
      } else if (importTracks && routeId) {
        // Update existing route with GeoJSON
        await routeCommandStore.update(routeId, {
          geojson: parseResult.geojson,
          distance_mi: parseResult.totalDistanceMi || undefined,
          source: parseResult.source.detectedApp || 'gpx',
        } as any);
      }

      // Import waypoints
      let wpCount = 0;
      if (importWaypoints && parseResult.waypoints.length > 0) {
        for (const gpxWp of parseResult.waypoints) {
          if (!mountedRef.current) return;
          const kind = mapToWaypointKind(gpxWp) as EcsWaypointKind;
          await waypointCommandStore.create(userId, {
            expedition_id: expeditionId,
            route_id: routeId,
            title: gpxWp.name || `Waypoint ${wpCount + 1}`,
            kind,
            lat: gpxWp.lat,
            lng: gpxWp.lon,
            meta: {
              elevation_ft: gpxWp.eleFt,
              elevation_m: gpxWp.ele,
              gpx_symbol: gpxWp.symbol,
              gpx_type: gpxWp.type,
              imported_from: fileName,
              source_app: parseResult.source.detectedApp,
            },
          });
          wpCount++;
        }
      }

      if (!mountedRef.current) return;
      setImportStats({
        routeName,
        waypointCount: wpCount,
        trackPoints: parseResult.totalTrackPoints,
      });
      setStage('success');
    } catch (err: any) {
      if (!mountedRef.current) return;
      setErrorMessage(err.message || 'Import failed. Please try again.');
      setStage('error');
    }
  }, [parseResult, userId, expeditionId, existingRouteId, createNewRoute, importWaypoints, importTracks, fileName]);

  // ── Handle Success Close ──────────────────────────────────

  const handleSuccessClose = useCallback(() => {
    onImportComplete();
    onClose();
  }, [onImportComplete, onClose]);

  // ── Render ────────────────────────────────────────────────

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.container}>
          {/* Header */}
          <View style={s.header}>
            <View style={s.headerLeft}>
              <View style={[s.headerIcon, stage !== 'pick' && isKml && { backgroundColor: 'rgba(66,133,244,0.1)', borderColor: 'rgba(66,133,244,0.25)' }]}>
                <Ionicons name={isKml ? 'earth-outline' : 'document-attach-outline'} size={18} color={stage !== 'pick' ? formatColor : TACTICAL.amber} />
              </View>
              <View>
                <Text style={[s.headerTitle, stage !== 'pick' && isKml && { color: '#4285F4' }]}>
                  {stage === 'pick' ? 'GPX / KML IMPORT' : `${formatLabel} IMPORT`}
                </Text>
                <Text style={s.headerSub}>
                  {stage === 'pick' ? 'SELECT FILE' :
                   stage === 'preview' ? 'REVIEW DATA' :
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
                {/* Supported apps */}
                <View style={s.appsRow}>
                  {[
                    { name: 'Garmin', icon: 'watch-outline', color: '#007DC3' },
                    { name: 'Gaia GPS', icon: 'compass-outline', color: '#FF6B35' },
                    { name: 'Google Earth', icon: 'earth-outline', color: '#4285F4' },
                    { name: 'Google Maps', icon: 'map-outline', color: '#34A853' },
                    { name: 'CalTopo', icon: 'layers-outline', color: '#2E7D32' },
                    { name: 'AllTrails', icon: 'trail-sign-outline', color: '#428813' },
                    { name: 'onX', icon: 'car-sport-outline', color: '#E85D04' },
                    { name: 'Strava', icon: 'fitness-outline', color: '#FC4C02' },
                    { name: 'ArcGIS', icon: 'globe-outline', color: '#2C7AC3' },
                    { name: 'QGIS', icon: 'layers-outline', color: '#589632' },
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
                    <Ionicons name="folder-open-outline" size={28} color={TACTICAL.amber} />
                  </View>
                  <Text style={s.pickBtnTitle}>SELECT GPX / KML FILE</Text>
                  <Text style={s.pickBtnSub}>Browse your device for .gpx or .kml files</Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <View style={s.pickBtnBadge}>
                      <Text style={s.pickBtnBadgeText}>.GPX</Text>
                    </View>
                    <View style={[s.pickBtnBadge, { backgroundColor: 'rgba(66,133,244,0.12)', borderColor: 'rgba(66,133,244,0.2)' }]}>
                      <Text style={[s.pickBtnBadgeText, { color: '#4285F4' }]}>.KML</Text>
                    </View>
                  </View>
                </TouchableOpacity>

                <Text style={s.pickNote}>
                  Accepts GPX 1.1 and KML 2.2 files up to 10 MB from any GPS app, GIS tool, or mapping device
                </Text>

                {/* What gets imported */}
                <View style={s.infoCard}>
                  <Text style={s.infoCardTitle}>WHAT GETS IMPORTED</Text>
                  <View style={s.infoRow}>
                    <Ionicons name="navigate-outline" size={14} color="#4FC3F7" />
                    <Text style={s.infoRowText}>Track segments and LineStrings as route geometry</Text>
                  </View>
                  <View style={s.infoRow}>
                    <Ionicons name="location-outline" size={14} color="#66BB6A" />
                    <Text style={s.infoRowText}>Waypoints and Placemarks with coordinates</Text>
                  </View>
                  <View style={s.infoRow}>
                    <Ionicons name="analytics-outline" size={14} color={TACTICAL.amber} />
                    <Text style={s.infoRowText}>Distance, elevation gain/loss, and ETA</Text>
                  </View>
                  <View style={s.infoRow}>
                    <Ionicons name="git-branch-outline" size={14} color="#CE93D8" />
                    <Text style={s.infoRowText}>Multi-segment tracks and Polygon boundaries</Text>
                  </View>
                  <View style={s.infoRow}>
                    <Ionicons name="earth-outline" size={14} color="#4285F4" />
                    <Text style={s.infoRowText}>KML Folders, nested Documents, and style mapping</Text>
                  </View>
                </View>

                {/* KMZ note */}
                <View style={[s.infoCard, { borderColor: 'rgba(66,133,244,0.15)', backgroundColor: 'rgba(66,133,244,0.04)' }]}>
                  <View style={s.infoRow}>
                    <Ionicons name="information-circle-outline" size={14} color="#4285F4" />
                    <Text style={[s.infoRowText, { color: TACTICAL.textMuted, fontSize: 10 }]}>
                      KMZ files must be unzipped first. Rename .kmz to .zip, extract, then import the .kml file inside.
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* ── PREVIEW STAGE ──────────────────────────── */}
            {stage === 'preview' && parseResult && (
              <View style={s.previewContainer}>
                {/* Format + Source app badge */}
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  <View style={[s.sourceBadge, { flex: 0, paddingHorizontal: 8, paddingVertical: 4 }]}>
                    <Ionicons name={isKml ? 'earth-outline' : 'document-text-outline'} size={12} color={formatColor} />
                    <Text style={[s.sourceBadgeText, { color: formatColor, fontSize: 9 }]}>{formatLabel}</Text>
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

                {/* Route name */}
                <Text style={s.previewName}>{parseResult.name}</Text>
                {parseResult.description && (
                  <Text style={s.previewDesc} numberOfLines={2}>{parseResult.description}</Text>
                )}

                {/* Stats grid */}
                <View style={s.statsGrid}>
                  <StatBox
                    label="DISTANCE"
                    value={parseResult.totalDistanceMi > 0 ? `${parseResult.totalDistanceMi}` : '--'}
                    unit="MI"
                    icon="speedometer-outline"
                    color="#4FC3F7"
                  />
                  <StatBox
                    label={isKml ? 'PLACEMARKS' : 'WAYPOINTS'}
                    value={`${parseResult.waypoints.length}`}
                    unit="WPT"
                    icon="location-outline"
                    color="#66BB6A"
                  />
                  <StatBox
                    label="TRACK PTS"
                    value={`${parseResult.totalTrackPoints}`}
                    unit="PTS"
                    icon="analytics-outline"
                    color={TACTICAL.amber}
                  />
                  <StatBox
                    label="SEGMENTS"
                    value={`${parseResult.totalSegments}`}
                    unit="SEG"
                    icon="git-branch-outline"
                    color="#CE93D8"
                  />
                </View>

                {/* Elevation stats */}
                {parseResult.elevationGainFt != null && (
                  <View style={s.elevationCard}>
                    <View style={s.elevationHeader}>
                      <Ionicons name="trending-up" size={14} color={TACTICAL.amber} />
                      <Text style={s.elevationTitle}>ELEVATION PROFILE</Text>
                    </View>
                    <View style={s.elevationStats}>
                      <View style={s.elevStat}>
                        <Ionicons name="arrow-up" size={12} color="#66BB6A" />
                        <Text style={s.elevStatValue}>{parseResult.elevationGainFt?.toLocaleString()}</Text>
                        <Text style={s.elevStatUnit}>FT GAIN</Text>
                      </View>
                      <View style={s.elevStatDivider} />
                      <View style={s.elevStat}>
                        <Ionicons name="arrow-down" size={12} color="#EF5350" />
                        <Text style={s.elevStatValue}>{parseResult.elevationLossFt?.toLocaleString()}</Text>
                        <Text style={s.elevStatUnit}>FT LOSS</Text>
                      </View>
                      <View style={s.elevStatDivider} />
                      <View style={s.elevStat}>
                        <Ionicons name="resize-outline" size={12} color="#4FC3F7" />
                        <Text style={s.elevStatValue}>
                          {parseResult.minElevationFt?.toLocaleString()} — {parseResult.maxElevationFt?.toLocaleString()}
                        </Text>
                        <Text style={s.elevStatUnit}>FT RANGE</Text>
                      </View>
                    </View>

                    {/* Mini elevation chart */}
                    {parseResult.elevationProfile.length > 2 && (
                      <ElevationChart profile={parseResult.elevationProfile} />
                    )}
                  </View>
                )}

                {/* ETA estimate */}
                {parseResult.estimatedEtaHours != null && (
                  <View style={s.etaCard}>
                    <Ionicons name="time-outline" size={14} color={TACTICAL.amber} />
                    <Text style={s.etaText}>
                      ESTIMATED TRAVEL TIME: <Text style={s.etaValue}>{parseResult.estimatedEtaHours} HOURS</Text>
                    </Text>
                  </View>
                )}

                {/* Waypoint preview */}
                {parseResult.waypoints.length > 0 && (
                  <View style={s.wpPreview}>
                    <Text style={s.wpPreviewTitle}>
                      {isKml ? 'PLACEMARKS' : 'WAYPOINTS'} ({parseResult.waypoints.length})
                    </Text>
                    {parseResult.waypoints.slice(0, 8).map((wp, idx) => (
                      <WaypointPreviewRow key={idx} waypoint={wp} index={idx} isKml={isKml} />
                    ))}
                    {parseResult.waypoints.length > 8 && (
                      <Text style={s.wpMoreText}>
                        + {parseResult.waypoints.length - 8} more {isKml ? 'placemarks' : 'waypoints'}
                      </Text>
                    )}
                  </View>
                )}

                {/* Bounds */}
                {parseResult.bounds && (
                  <View style={s.boundsCard}>
                    <Ionicons name="scan-outline" size={14} color={TACTICAL.textMuted} />
                    <Text style={s.boundsText}>
                      BOUNDS: {parseResult.bounds.minLat.toFixed(4)}, {parseResult.bounds.minLon.toFixed(4)} →{' '}
                      {parseResult.bounds.maxLat.toFixed(4)}, {parseResult.bounds.maxLon.toFixed(4)}
                    </Text>
                  </View>
                )}

                {/* Import options */}
                <View style={s.optionsCard}>
                  <Text style={s.optionsTitle}>IMPORT OPTIONS</Text>

                  <TouchableOpacity
                    style={s.optionRow}
                    onPress={() => setImportTracks(p => !p)}
                    activeOpacity={0.7}
                  >
                    <View style={[s.optionCheck, importTracks && s.optionCheckActive]}>
                      {importTracks && <Ionicons name="checkmark" size={12} color="#0B0F12" />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.optionLabel}>Import {isKml ? 'LineStrings' : 'track segments'}</Text>
                      <Text style={s.optionSub}>
                        {parseResult.totalTrackPoints} points across {parseResult.totalSegments} {isKml ? 'paths' : 'segments'}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={s.optionRow}
                    onPress={() => setImportWaypoints(p => !p)}
                    activeOpacity={0.7}
                  >
                    <View style={[s.optionCheck, importWaypoints && s.optionCheckActive]}>
                      {importWaypoints && <Ionicons name="checkmark" size={12} color="#0B0F12" />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.optionLabel}>Import {isKml ? 'placemarks' : 'waypoints'}</Text>
                      <Text style={s.optionSub}>
                        {parseResult.waypoints.length} {isKml ? 'point placemarks' : 'waypoints'} with coordinates
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {existingRouteId && (
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
                        <Text style={s.optionSub}>
                          Uncheck to merge into current route
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}

            {/* ── IMPORTING STAGE ────────────────────────── */}
            {stage === 'importing' && (
              <View style={s.importingContainer}>
                <ActivityIndicator size="large" color={formatColor} />
                <Text style={[s.importingTitle, isKml && { color: '#4285F4' }]}>IMPORTING {formatLabel} DATA</Text>
                <Text style={s.importingSub}>
                  Creating route and {isKml ? 'placemarks' : 'waypoints'}...
                </Text>
                <View style={s.importingProgress}>
                  <View style={[s.importingProgressBar, isKml && { backgroundColor: '#4285F4' }]} />
                </View>
              </View>
            )}

            {/* ── SUCCESS STAGE ───────────────────────────── */}
            {stage === 'success' && importStats && (
              <View style={s.successContainer}>
                <View style={s.successIcon}>
                  <Ionicons name="checkmark-circle" size={48} color="#66BB6A" />
                </View>
                <Text style={s.successTitle}>{formatLabel} IMPORTED SUCCESSFULLY</Text>
                <Text style={s.successSub}>{importStats.routeName}</Text>

                <View style={s.successStats}>
                  {importStats.trackPoints > 0 && (
                    <View style={s.successStatRow}>
                      <Ionicons name="analytics-outline" size={14} color={TACTICAL.amber} />
                      <Text style={s.successStatText}>
                        {importStats.trackPoints.toLocaleString()} {isKml ? 'path points' : 'track points'} imported as route geometry
                      </Text>
                    </View>
                  )}
                  {importStats.waypointCount > 0 && (
                    <View style={s.successStatRow}>
                      <Ionicons name="location-outline" size={14} color="#66BB6A" />
                      <Text style={s.successStatText}>
                        {importStats.waypointCount} {isKml ? 'placemarks' : 'waypoints'} created
                      </Text>
                    </View>
                  )}
                  <View style={s.successStatRow}>
                    <Ionicons name="document-outline" size={14} color="#4FC3F7" />
                    <Text style={s.successStatText}>Source: {fileName}</Text>
                  </View>
                </View>

                <View style={s.successApps}>
                  <Text style={s.successAppsLabel}>COMPATIBLE WITH</Text>
                  <Text style={s.successAppsText}>
                    Garmin, Gaia GPS, CalTopo, AllTrails, Google Earth, Google My Maps, ArcGIS, OsmAnd
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
                style={[s.importBtn, isKml && { backgroundColor: '#4285F4' }, (!importTracks && !importWaypoints) && { opacity: 0.4 }]}
                onPress={performImport}
                disabled={!importTracks && !importWaypoints}
                activeOpacity={0.7}
              >
                <Ionicons name="download-outline" size={16} color="#0B0F12" />
                <Text style={s.importBtnText}>
                  IMPORT {[
                    importTracks && parseResult ? `${parseResult.totalTrackPoints} PTS` : '',
                    importWaypoints && parseResult ? `${parseResult.waypoints.length} WPT` : '',
                  ].filter(Boolean).join(' + ') || 'DATA'}
                </Text>
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



// ── Stat Box Sub-component ──────────────────────────────────

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

// ── Waypoint Preview Row ────────────────────────────────────

function WaypointPreviewRow({ waypoint, index, isKml }: { waypoint: GpxWaypoint; index: number; isKml?: boolean }) {
  const kind = isKml ? mapKmlToWaypointKind(waypoint) : mapToWaypointKind(waypoint);

  const kindColors: Record<string, string> = {
    camp: '#FFB74D',
    fuel: '#EF5350',
    water: '#4FC3F7',
    hazard: '#FF7043',
    waypoint: '#8A8A85',
    note: '#CE93D8',
  };
  const color = kindColors[kind] || '#8A8A85';

  return (
    <View style={s.wpRow}>
      <View style={[s.wpRowIdx, { borderColor: `${color}40` }]}>
        <Text style={[s.wpRowIdxText, { color }]}>{index + 1}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.wpRowName} numberOfLines={1}>
          {waypoint.name || `Waypoint ${index + 1}`}
        </Text>
        <Text style={s.wpRowCoords}>
          {waypoint.lat.toFixed(5)}, {waypoint.lon.toFixed(5)}
          {waypoint.eleFt != null ? ` · ${waypoint.eleFt.toLocaleString()} ft` : ''}
        </Text>
      </View>
      <View style={[s.wpRowKind, { borderColor: `${color}40`, backgroundColor: `${color}10` }]}>
        <Text style={[s.wpRowKindText, { color }]}>{kind.toUpperCase()}</Text>
      </View>
    </View>
  );
}

// ── Elevation Chart Sub-component ───────────────────────────

function ElevationChart({ profile }: { profile: ElevationProfilePoint[] }) {
  const chartWidth = Math.min(SCREEN_WIDTH - 80, 400);
  const chartHeight = 60;

  const validPoints = profile.filter(p => p.elevationFt != null);
  if (validPoints.length < 2) return null;

  const minEle = Math.min(...validPoints.map(p => p.elevationFt!));
  const maxEle = Math.max(...validPoints.map(p => p.elevationFt!));
  const eleRange = maxEle - minEle || 1;
  const maxDist = validPoints[validPoints.length - 1].distanceMi || 1;

  // Generate SVG-like path using View positioning
  const barWidth = Math.max(1, chartWidth / validPoints.length);

  return (
    <View style={[s.chartContainer, { width: chartWidth, height: chartHeight }]}>
      <View style={s.chartBars}>
        {validPoints.map((pt, idx) => {
          const height = Math.max(2, ((pt.elevationFt! - minEle) / eleRange) * (chartHeight - 4));
          return (
            <View
              key={idx}
              style={[
                s.chartBar,
                {
                  width: barWidth,
                  height,
                  backgroundColor: `rgba(196, 138, 44, ${0.3 + (height / chartHeight) * 0.5})`,
                },
              ]}
            />
          );
        })}
      </View>
      <View style={s.chartLabels}>
        <Text style={s.chartLabel}>{minEle.toLocaleString()} ft</Text>
        <Text style={s.chartLabel}>{maxDist.toFixed(1)} mi</Text>
        <Text style={s.chartLabel}>{maxEle.toLocaleString()} ft</Text>
      </View>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: TACTICAL.panel,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '92%',
    minHeight: '50%',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62,79,60,0.3)',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(196,138,44,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 14, fontWeight: '900', color: TACTICAL.amber, letterSpacing: 1.5 },
  headerSub: { fontSize: 9, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1.5, marginTop: 1 },
  closeBtn: { padding: 6 },

  body: { paddingHorizontal: 16, paddingBottom: 20 },

  // ── Pick Stage ────────────────────────────────────────────
  pickContainer: { paddingTop: 16, gap: 14 },
  appsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  appChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.2)',
  },
  appChipText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },

  pickBtn: {
    alignItems: 'center',
    paddingVertical: 24,
    borderRadius: 14,
    backgroundColor: 'rgba(196,138,44,0.06)',
    borderWidth: 1.5,
    borderColor: 'rgba(196,138,44,0.3)',
    borderStyle: 'dashed',
    gap: 8,
  },
  pickBtnIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(196,138,44,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  pickBtnTitle: { fontSize: 14, fontWeight: '900', color: TACTICAL.amber, letterSpacing: 1.5 },
  pickBtnSub: { fontSize: 11, color: TACTICAL.textMuted },
  pickBtnBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(196,138,44,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.2)',
  },
  pickBtnBadgeText: { fontSize: 9, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 1 },

  pickNote: { fontSize: 10, color: TACTICAL.textMuted, textAlign: 'center', letterSpacing: 0.5 },

  infoCard: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.2)',
    gap: 8,
  },
  infoCardTitle: { fontSize: 10, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 2, marginBottom: 2 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoRowText: { fontSize: 11, color: TACTICAL.text, flex: 1 },

  // ── Preview Stage ─────────────────────────────────────────
  previewContainer: { paddingTop: 12, gap: 12 },

  sourceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.2)',
    flexWrap: 'wrap',
  },
  sourceBadgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  sourceBadgeDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: TACTICAL.textMuted },
  sourceFileName: { fontSize: 10, color: TACTICAL.text, fontFamily: 'Courier' },
  sourceFileSize: { fontSize: 9, color: TACTICAL.textMuted },

  previewName: { fontSize: 16, fontWeight: '900', color: TACTICAL.text, letterSpacing: 0.3 },
  previewDesc: { fontSize: 11, color: TACTICAL.textMuted, lineHeight: 16 },

  // Stats grid
  statsGrid: { flexDirection: 'row', gap: 8 },
  statBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.2)',
    gap: 2,
  },
  statValue: { fontSize: 16, fontWeight: '900', fontFamily: 'Courier' },
  statUnit: { fontSize: 8, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1 },
  statLabel: { fontSize: 7, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1, marginTop: 2 },

  // Elevation
  elevationCard: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.2)',
    gap: 10,
  },
  elevationHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  elevationTitle: { fontSize: 10, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 2 },
  elevationStats: { flexDirection: 'row', alignItems: 'center' },
  elevStat: { flex: 1, alignItems: 'center', gap: 2 },
  elevStatValue: { fontSize: 13, fontWeight: '900', color: TACTICAL.text, fontFamily: 'Courier' },
  elevStatUnit: { fontSize: 7, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1 },
  elevStatDivider: { width: 1, height: 24, backgroundColor: 'rgba(62,79,60,0.3)' },

  // Chart
  chartContainer: {
    alignSelf: 'center',
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.15)',
    overflow: 'hidden',
    padding: 2,
  },
  chartBars: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  chartBar: {
    borderTopLeftRadius: 1,
    borderTopRightRadius: 1,
  },
  chartLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    paddingTop: 2,
  },
  chartLabel: { fontSize: 7, color: TACTICAL.textMuted, fontFamily: 'Courier' },

  // ETA
  etaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(196,138,44,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.2)',
  },
  etaText: { fontSize: 10, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 0.8 },
  etaValue: { color: TACTICAL.amber, fontWeight: '900' },

  // Waypoint preview
  wpPreview: { gap: 6 },
  wpPreviewTitle: { fontSize: 10, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 2 },
  wpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.12)',
  },
  wpRowIdx: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderWidth: 1,
  },
  wpRowIdxText: { fontSize: 9, fontWeight: '900' },
  wpRowName: { fontSize: 11, fontWeight: '700', color: TACTICAL.text },
  wpRowCoords: { fontSize: 9, color: TACTICAL.textMuted, fontFamily: 'Courier', marginTop: 1 },
  wpRowKind: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  wpRowKindText: { fontSize: 7, fontWeight: '900', letterSpacing: 0.8 },
  wpMoreText: { fontSize: 10, color: TACTICAL.textMuted, textAlign: 'center', paddingVertical: 6, fontStyle: 'italic' },

  // Bounds
  boundsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  boundsText: { fontSize: 9, color: TACTICAL.textMuted, fontFamily: 'Courier', flex: 1 },

  // Options
  optionsCard: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.2)',
    gap: 10,
  },
  optionsTitle: { fontSize: 10, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 2 },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  optionCheck: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: TACTICAL.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionCheckActive: { backgroundColor: TACTICAL.amber, borderColor: TACTICAL.amber },
  optionLabel: { fontSize: 12, fontWeight: '700', color: TACTICAL.text },
  optionSub: { fontSize: 9, color: TACTICAL.textMuted, marginTop: 1 },

  // ── Importing Stage ───────────────────────────────────────
  importingContainer: { alignItems: 'center', paddingVertical: 40, gap: 16 },
  importingTitle: { fontSize: 14, fontWeight: '900', color: TACTICAL.amber, letterSpacing: 1.5 },
  importingSub: { fontSize: 11, color: TACTICAL.textMuted },
  importingProgress: {
    width: 200,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(62,79,60,0.3)',
    overflow: 'hidden',
  },
  importingProgressBar: {
    width: '60%',
    height: '100%',
    backgroundColor: TACTICAL.amber,
    borderRadius: 2,
  },

  // ── Success Stage ─────────────────────────────────────────
  successContainer: { alignItems: 'center', paddingVertical: 20, gap: 12 },
  successIcon: { marginBottom: 4 },
  successTitle: { fontSize: 14, fontWeight: '900', color: '#66BB6A', letterSpacing: 1.5 },
  successSub: { fontSize: 12, color: TACTICAL.text, fontWeight: '700' },
  successStats: {
    width: '100%',
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.2)',
    gap: 8,
  },
  successStatRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  successStatText: { fontSize: 11, color: TACTICAL.text, flex: 1 },
  successApps: {
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(196,138,44,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.15)',
    width: '100%',
  },
  successAppsLabel: { fontSize: 8, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 2, marginBottom: 4 },
  successAppsText: { fontSize: 10, color: TACTICAL.amber, textAlign: 'center' },

  // ── Error Stage ───────────────────────────────────────────
  errorContainer: { alignItems: 'center', paddingVertical: 30, gap: 12 },
  errorIcon: { marginBottom: 4 },
  errorTitle: { fontSize: 14, fontWeight: '900', color: TACTICAL.danger, letterSpacing: 1.5 },
  errorMessage: { fontSize: 12, color: TACTICAL.text, textAlign: 'center', lineHeight: 18, paddingHorizontal: 10 },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(62,79,60,0.2)',
    borderWidth: 1,
    borderColor: TACTICAL.border,
    marginTop: 8,
  },
  retryBtnText: { fontSize: 12, fontWeight: '800', color: TACTICAL.text, letterSpacing: 1 },

  // ── Footer ────────────────────────────────────────────────
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingBottom: Platform.OS === 'web' ? 14 : 34,
    borderTopWidth: 1,
    borderTopColor: 'rgba(62,79,60,0.3)',
  },
  cancelBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(62,79,60,0.2)',
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  cancelBtnText: { fontSize: 12, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 1 },
  importBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: TACTICAL.amber,
  },
  importBtnText: { fontSize: 12, fontWeight: '900', color: '#0B0F12', letterSpacing: 1.2 },
  doneBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#66BB6A',
  },
  doneBtnText: { fontSize: 12, fontWeight: '900', color: '#0B0F12', letterSpacing: 1.2 },
});



