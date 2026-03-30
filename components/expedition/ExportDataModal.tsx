// ============================================================
// EXPORT DATA MODAL — Expedition Data Export UI
// ============================================================
// Provides format selection (JSON/CSV/GPX/KML/GeoJSON), section
// toggles, data preview counts, and triggers the export engine.
// ============================================================


import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
  ActivityIndicator, Platform, ScrollView,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import {
  exportExpeditionData,
  previewExportCounts,
  type ExportFormat,
  type ExportSections,
  type ExportResult,
} from '../../lib/exportEngine';

// ── Section config ──────────────────────────────────────────
interface SectionConfig {
  key: keyof ExportSections;
  label: string;
  icon: string;
  color: string;
  countKey: 'checklistItems' | 'fieldLogs' | 'routes' | 'waypoints' | null;
  /** If true, this section is especially relevant for GPX export */
  gpxRelevant?: boolean;
}

const EXPORT_SECTIONS: SectionConfig[] = [
  {
    key: 'expeditionDetails',
    label: 'EXPEDITION DETAILS',
    icon: 'compass-outline',
    color: TACTICAL.amber,
    countKey: null,
  },
  {
    key: 'checklists',
    label: 'CHECKLISTS',
    icon: 'checkbox-outline',
    color: '#4CAF50',
    countKey: 'checklistItems',
  },
  {
    key: 'fieldLogs',
    label: 'FIELD LOGS',
    icon: 'journal-outline',
    color: '#42A5F5',
    countKey: 'fieldLogs',
    gpxRelevant: true,
  },
  {
    key: 'routes',
    label: 'ROUTES',
    icon: 'map-outline',
    color: '#CE93D8',
    countKey: 'routes',
    gpxRelevant: true,
  },
  {
    key: 'waypoints',
    label: 'WAYPOINTS',
    icon: 'location-outline',
    color: '#FFB74D',
    countKey: 'waypoints',
    gpxRelevant: true,
  },
];

// ── Format config ───────────────────────────────────────────
interface FormatOption {
  value: ExportFormat;
  label: string;
  description: string;
  icon: string;
  color: string;
  badgeColor: string;
}

const FORMAT_OPTIONS: FormatOption[] = [
  {
    value: 'json',
    label: 'JSON',
    description: 'Structured data for backups & integrations',
    icon: 'code-slash-outline',
    color: '#42A5F5',
    badgeColor: '#42A5F5',
  },
  {
    value: 'csv',
    label: 'CSV',
    description: 'Spreadsheet-compatible, Excel & Sheets',
    icon: 'grid-outline',
    color: '#4CAF50',
    badgeColor: '#4CAF50',
  },
  {
    value: 'gpx',
    label: 'GPX',
    description: 'GPS exchange for Garmin, Gaia & mapping apps',
    icon: 'navigate-outline',
    color: '#FF7043',
    badgeColor: '#FF7043',
  },
  {
    value: 'kml',
    label: 'KML',
    description: 'Google Earth, My Maps & GIS tools',
    icon: 'earth-outline',
    color: '#3B82F6',
    badgeColor: '#3B82F6',
  },

  {
    value: 'geojson',
    label: 'GeoJSON',
    description: 'Mapbox, Leaflet, D3 & web mapping',
    icon: 'logo-github',
    color: '#26A69A',
    badgeColor: '#26A69A',
  },
];



// ── Compatible apps for GPX/KML/GeoJSON info banners ────────
const GPX_COMPATIBLE_APPS = [
  'Garmin BaseCamp', 'Gaia GPS', 'CalTopo', 'AllTrails', 'Google Earth', 'OsmAnd',
];

const KML_COMPATIBLE_APPS = [
  'Google Earth', 'Google My Maps', 'ArcGIS', 'QGIS', 'CalTopo', 'Avenza Maps', 'GPS Visualizer', 'Mapbox',
];

const GEOJSON_COMPATIBLE_APPS = [
  'Mapbox GL JS', 'Leaflet', 'D3.js', 'Turf.js', 'OpenLayers', 'Kepler.gl',
  'deck.gl', 'QGIS', 'ArcGIS', 'geojson.io', 'GitHub',
];

/** Whether the selected format is a geographic format */
const isGeoFormat = (f: ExportFormat) => f === 'gpx' || f === 'kml' || f === 'geojson';




// ── Props ───────────────────────────────────────────────────
interface Props {
  visible: boolean;
  onClose: () => void;
  expeditionId: string;
  expeditionTitle: string;
  userId: string;
}

export default function ExportDataModal({
  visible,
  onClose,
  expeditionId,
  expeditionTitle,
  userId,
}: Props) {
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const [format, setFormat] = useState<ExportFormat>('json');
  const [sections, setSections] = useState<ExportSections>({
    expeditionDetails: true,
    checklists: true,
    fieldLogs: true,
    routes: true,
    waypoints: true,
  });
  const [counts, setCounts] = useState<{
    checklistItems: number;
    fieldLogs: number;
    routes: number;
    waypoints: number;
  } | null>(null);
  const [loadingCounts, setLoadingCounts] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);

  // ── Load preview counts when modal opens ──────────────
  useEffect(() => {
    if (!visible || !expeditionId || !userId) return;

    let cancelled = false;
    const loadCounts = async () => {
      if (mountedRef.current) setLoadingCounts(true);
      try {
        const result = await previewExportCounts(expeditionId, userId);
        if (!cancelled && mountedRef.current) {
          setCounts(result);
        }
      } catch (err) {
        console.warn('[ExportDataModal] loadCounts error:', err);
      }
      if (!cancelled && mountedRef.current) setLoadingCounts(false);
    };

    loadCounts();
    return () => { cancelled = true; };
  }, [visible, expeditionId, userId]);

  // ── Reset state when modal closes ─────────────────────
  useEffect(() => {
    if (!visible) {
      // Delay reset to avoid flicker during close animation
      const timer = setTimeout(() => {
        if (mountedRef.current) {
          setExportResult(null);
          setExporting(false);
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  const toggleSection = useCallback((key: keyof ExportSections) => {
    setSections(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const selectAllSections = useCallback(() => {
    setSections({
      expeditionDetails: true,
      checklists: true,
      fieldLogs: true,
      routes: true,
      waypoints: true,
    });
  }, []);

  const hasAnySectionSelected = Object.values(sections).some(v => v);

  // For GPX, check if any geographic sections are selected
  const hasGeoSections = sections.routes || sections.waypoints || sections.fieldLogs;

  // ── Compute total record count ────────────────────────
  const totalRecords = counts
    ? (sections.expeditionDetails ? 1 : 0)
      + (sections.checklists ? counts.checklistItems : 0)
      + (sections.fieldLogs ? counts.fieldLogs : 0)
      + (sections.routes ? counts.routes : 0)
      + (sections.waypoints ? counts.waypoints : 0)
    : 0;

  // ── Get current format config ─────────────────────────
  const currentFormatConfig = FORMAT_OPTIONS.find(f => f.value === format) || FORMAT_OPTIONS[0];

  // ── Handle export ─────────────────────────────────────
  const handleExport = async () => {
    if (exporting || !hasAnySectionSelected) return;
    if (mountedRef.current) {
      setExporting(true);
      setExportResult(null);
    }

    try {
      const result = await exportExpeditionData(
        expeditionId,
        userId,
        format,
        sections,
      );
      if (mountedRef.current) {
        setExportResult(result);
      }
    } catch (err) {
      console.warn('[ExportDataModal] handleExport error:', err);
      if (mountedRef.current) {
        setExportResult({
          success: false,
          error: 'An unexpected error occurred',
          recordCounts: { checklistItems: 0, fieldLogs: 0, routes: 0, waypoints: 0 },
        });
      }
    }
    if (mountedRef.current) setExporting(false);
  };

  const handleClose = () => {
    if (!exporting) onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIcon}>
                <Ionicons name="download-outline" size={18} color={TACTICAL.amber} />
              </View>
              <View>
                <Text style={styles.headerTitle}>EXPORT DATA</Text>
                <Text style={styles.headerSub} numberOfLines={1}>
                  {expeditionTitle}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={handleClose}
              style={styles.closeBtn}
              disabled={exporting}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={22} color={TACTICAL.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollBody}
            contentContainerStyle={styles.body}
            showsVerticalScrollIndicator={false}
          >
            {/* Success State */}
            {exportResult?.success && (
              <View style={styles.successCard}>
                <View style={styles.successIconContainer}>
                  <Ionicons name="checkmark-circle" size={36} color="#4CAF50" />
                </View>
                <Text style={styles.successTitle}>EXPORT COMPLETE</Text>
                <Text style={styles.successSub}>
                  {format === 'gpx'
                    ? 'GPX file ready for GPS devices & mapping apps'
                    : format === 'kml'
                      ? 'KML file ready for Google Earth & GIS tools'
                      : format === 'geojson'
                        ? 'GeoJSON FeatureCollection ready for web mapping'
                        : Platform.OS === 'web'
                          ? 'File downloaded to your browser'
                          : 'File saved and ready to share'}
                </Text>

                <View style={styles.successStats}>
                  {exportResult.recordCounts.checklistItems > 0 && (
                    <View style={styles.successStatRow}>
                      <Ionicons name="checkbox-outline" size={12} color="#4CAF50" />
                      <Text style={styles.successStatText}>
                        {exportResult.recordCounts.checklistItems} checklist items
                        {format === 'geojson' ? ' (in ecs:checklists metadata)' : ''}
                      </Text>
                    </View>
                  )}
                  {exportResult.recordCounts.fieldLogs > 0 && (
                    <View style={styles.successStatRow}>
                      <Ionicons name="journal-outline" size={12} color="#42A5F5" />
                      <Text style={styles.successStatText}>
                        {exportResult.recordCounts.fieldLogs} field log entries
                        {format === 'gpx' ? ' (geotagged as waypoints)' : ''}
                        {format === 'kml' ? ' (as Placemarks)' : ''}
                        {format === 'geojson' ? ' (as Point Features)' : ''}
                      </Text>
                    </View>
                  )}
                  {exportResult.recordCounts.routes > 0 && (
                    <View style={styles.successStatRow}>
                      <Ionicons name="map-outline" size={12} color="#CE93D8" />
                      <Text style={styles.successStatText}>
                        {exportResult.recordCounts.routes} route{exportResult.recordCounts.routes !== 1 ? 's' : ''}
                        {format === 'gpx' ? ' (as track segments)' : ''}
                        {format === 'kml' ? ' (as LineString Placemarks)' : ''}
                        {format === 'geojson' ? ' (native geometry passthrough)' : ''}
                      </Text>
                    </View>
                  )}
                  {exportResult.recordCounts.waypoints > 0 && (
                    <View style={styles.successStatRow}>
                      <Ionicons name="location-outline" size={12} color="#FFB74D" />
                      <Text style={styles.successStatText}>
                        {exportResult.recordCounts.waypoints} waypoints
                        {format === 'kml' ? ' (as Point Placemarks)' : ''}
                        {format === 'geojson' ? ' (as Point Features)' : ''}
                      </Text>
                    </View>
                  )}
                </View>


                {/* GPX compatibility note */}
                {format === 'gpx' && (
                  <View style={styles.gpxSuccessNote}>
                    <Ionicons name="navigate-outline" size={12} color="#FF7043" />
                    <Text style={styles.gpxSuccessNoteText}>
                      Import into Garmin, Gaia GPS, CalTopo, or any GPX-compatible app
                    </Text>
                  </View>
                )}

                {/* KML compatibility note */}
                {format === 'kml' && (
                  <View style={[styles.gpxSuccessNote, { backgroundColor: 'rgba(59, 130, 246, 0.08)', borderColor: 'rgba(59, 130, 246, 0.2)' }]}>
                    <Ionicons name="earth-outline" size={12} color="#3B82F6" />
                    <Text style={[styles.gpxSuccessNoteText, { color: '#3B82F6' }]}>
                      Open in Google Earth, import to Google My Maps, ArcGIS, or QGIS
                    </Text>
                  </View>

                )}

                {/* GeoJSON compatibility note */}
                {format === 'geojson' && (
                  <View style={[styles.gpxSuccessNote, { backgroundColor: 'rgba(38, 166, 154, 0.08)', borderColor: 'rgba(38, 166, 154, 0.2)' }]}>
                    <Ionicons name="logo-github" size={12} color="#26A69A" />
                    <Text style={[styles.gpxSuccessNoteText, { color: '#26A69A' }]}>
                      Load in Mapbox GL JS, Leaflet, D3.js, geojson.io, or drop into a GitHub repo
                    </Text>
                  </View>
                )}

                {exportResult.fileName && (
                  <View style={styles.fileNameBadge}>
                    <Ionicons name="document-outline" size={12} color={TACTICAL.textMuted} />
                    <Text style={styles.fileNameText} numberOfLines={1}>
                      {exportResult.fileName}
                    </Text>
                  </View>
                )}


                <TouchableOpacity
                  style={styles.doneBtn}
                  onPress={handleClose}
                  activeOpacity={0.85}
                >
                  <Text style={styles.doneBtnText}>DONE</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Error State */}
            {exportResult && !exportResult.success && (
              <View style={styles.errorCard}>
                <Ionicons name="alert-circle-outline" size={28} color="#E53935" />
                <Text style={styles.errorTitle}>EXPORT FAILED</Text>
                <Text style={styles.errorSub}>{exportResult.error || 'Unknown error'}</Text>
                <TouchableOpacity
                  style={styles.retryBtn}
                  onPress={() => {
                    if (mountedRef.current) setExportResult(null);
                  }}
                  activeOpacity={0.85}
                >
                  <Ionicons name="refresh-outline" size={14} color={TACTICAL.amber} />
                  <Text style={styles.retryBtnText}>TRY AGAIN</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Configuration (hidden after export result) */}
            {!exportResult && (
              <>
                {/* Format Selection */}
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>FORMAT</Text>
                  <View style={styles.formatRow}>
                    {FORMAT_OPTIONS.map(opt => {
                      const isSelected = format === opt.value;
                      return (
                        <TouchableOpacity
                          key={opt.value}
                          style={[
                            styles.formatCard,
                            isSelected && [styles.formatCardSelected, { borderColor: opt.color }],
                          ]}
                          onPress={() => setFormat(opt.value)}
                          activeOpacity={0.8}
                        >
                          <View style={[
                            styles.formatIconContainer,
                            isSelected && {
                              borderColor: `${opt.color}60`,
                              backgroundColor: `${opt.color}18`,
                            },
                          ]}>
                            <Ionicons
                              name={opt.icon as any}
                              size={18}
                              color={isSelected ? opt.color : TACTICAL.textMuted}
                            />
                          </View>
                          <Text style={[
                            styles.formatLabel,
                            isSelected && { color: opt.color },
                          ]}>
                            {opt.label}
                          </Text>
                          <Text style={styles.formatDesc} numberOfLines={2}>
                            {opt.description}
                          </Text>
                          {isSelected && (
                            <View style={styles.formatCheckmark}>
                              <Ionicons name="checkmark-circle" size={16} color={opt.color} />
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* GPX Info Banner */}
                {format === 'gpx' && (
                  <View style={styles.gpxInfoBanner}>
                    <View style={styles.gpxInfoHeader}>
                      <Ionicons name="navigate-outline" size={14} color="#FF7043" />
                      <Text style={styles.gpxInfoTitle}>GPX EXPORT</Text>
                    </View>
                    <Text style={styles.gpxInfoText}>
                      GPX (GPS Exchange Format) converts your route GeoJSON data, waypoints,
                      and geotagged field logs into standard GPS format. Non-geographic data
                      (checklists, readiness scores) is included as metadata extensions.
                    </Text>
                    <View style={styles.gpxCompatRow}>
                      <Text style={styles.gpxCompatLabel}>COMPATIBLE WITH:</Text>
                      <View style={styles.gpxCompatChips}>
                        {GPX_COMPATIBLE_APPS.map(app => (
                          <View key={app} style={styles.gpxCompatChip}>
                            <Text style={styles.gpxCompatChipText}>{app}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  </View>
                )}

                {/* KML Info Banner */}
                {format === 'kml' && (
                  <View style={[styles.gpxInfoBanner, { backgroundColor: 'rgba(59, 130, 246, 0.06)', borderColor: 'rgba(59, 130, 246, 0.25)' }]}>
                    <View style={styles.gpxInfoHeader}>
                      <Ionicons name="earth-outline" size={14} color="#3B82F6" />
                      <Text style={[styles.gpxInfoTitle, { color: '#3B82F6' }]}>KML EXPORT</Text>
                    </View>
                    <Text style={styles.gpxInfoText}>
                      KML (Keyhole Markup Language) converts your routes to styled LineString
                      Placemarks and waypoints to Point Placemarks with colored pins. Organized
                      in Folders with full metadata in a KML 2.2 Document.
                    </Text>
                    <View style={styles.gpxCompatRow}>
                      <Text style={styles.gpxCompatLabel}>COMPATIBLE WITH:</Text>
                      <View style={styles.gpxCompatChips}>
                        {KML_COMPATIBLE_APPS.map(app => (
                          <View key={app} style={[styles.gpxCompatChip, { backgroundColor: 'rgba(59, 130, 246, 0.1)', borderColor: 'rgba(59, 130, 246, 0.2)' }]}>
                            <Text style={[styles.gpxCompatChipText, { color: '#3B82F6' }]}>{app}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  </View>
                )}


                {/* Data Sections */}
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionLabel}>DATA SECTIONS</Text>
                    <TouchableOpacity onPress={selectAllSections} activeOpacity={0.7}>
                      <Text style={styles.selectAllText}>SELECT ALL</Text>
                    </TouchableOpacity>
                  </View>

                  {loadingCounts ? (
                    <View style={styles.loadingRow}>
                      <ActivityIndicator size="small" color={TACTICAL.amber} />
                      <Text style={styles.loadingText}>Scanning expedition data...</Text>
                    </View>
                  ) : (
                    <View style={styles.sectionsList}>
                      {EXPORT_SECTIONS.map(sec => {
                        const isEnabled = sections[sec.key];
                        const count = sec.countKey && counts ? counts[sec.countKey] : null;
                        const isEmpty = count !== null && count === 0;
                        const isGeoRelevant = isGeoFormat(format) && sec.gpxRelevant;
                        const geoColor = format === 'kml' ? '#3B82F6' : '#FF7043';

                        const geoIcon = format === 'kml' ? 'earth-outline' : 'navigate-outline';

                        return (
                          <TouchableOpacity
                            key={sec.key}
                            style={[
                              styles.sectionToggle,
                              isEnabled && styles.sectionToggleActive,
                              isEmpty && styles.sectionToggleEmpty,
                            ]}
                            onPress={() => toggleSection(sec.key)}
                            activeOpacity={0.8}
                          >
                            <View style={[
                              styles.sectionToggleCheck,
                              isEnabled && { borderColor: sec.color, backgroundColor: `${sec.color}20` },
                            ]}>
                              {isEnabled && (
                                <Ionicons name="checkmark" size={12} color={sec.color} />
                              )}
                            </View>
                            <View style={[
                              styles.sectionToggleIcon,
                              { borderColor: `${sec.color}40` },
                            ]}>
                              <Ionicons
                                name={sec.icon as any}
                                size={16}
                                color={isEnabled ? sec.color : TACTICAL.textMuted}
                              />
                            </View>
                            <View style={styles.sectionToggleContent}>
                              <View style={styles.sectionToggleLabelRow}>
                                <Text style={[
                                  styles.sectionToggleLabel,
                                  !isEnabled && styles.sectionToggleLabelMuted,
                                ]}>
                                  {sec.label}
                                </Text>
                                {isGeoRelevant && (
                                  <View style={[styles.gpxBadge, { backgroundColor: `${geoColor}18`, borderColor: `${geoColor}40` }]}>
                                    <Ionicons name={geoIcon as any} size={8} color={geoColor} />
                                    <Text style={[styles.gpxBadgeText, { color: geoColor }]}>GEO</Text>
                                  </View>
                                )}
                              </View>
                              {count !== null && (
                                <Text style={[
                                  styles.sectionToggleCount,
                                  isEmpty && { color: TACTICAL.textMuted },
                                ]}>
                                  {count} {count === 1 ? 'record' : 'records'}
                                  {isEmpty ? ' (empty)' : ''}
                                </Text>
                              )}
                              {sec.countKey === null && (
                                <Text style={styles.sectionToggleCount}>
                                  Mission metadata
                                  {format === 'gpx' ? ' (GPX extensions)' : ''}
                                  {format === 'kml' ? ' (KML Document description)' : ''}
                                </Text>
                              )}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>

                {/* Geographic data warning for GPX/KML */}
                {isGeoFormat(format) && !hasGeoSections && hasAnySectionSelected && (
                  <View style={styles.gpxWarning}>
                    <Ionicons name="warning-outline" size={14} color="#FFB74D" />
                    <Text style={styles.gpxWarningText}>
                      No geographic sections selected. Enable Routes, Waypoints, or Field Logs
                      to include {format === 'kml' ? 'Placemark' : 'track and waypoint'} data in the {format.toUpperCase()} file.
                    </Text>
                  </View>
                )}


                {/* Export Summary */}
                <View style={styles.summaryBar}>
                  <View style={styles.summaryLeft}>
                    <Ionicons name="analytics-outline" size={14} color={TACTICAL.textMuted} />
                    <Text style={styles.summaryText}>
                      {totalRecords} total records
                    </Text>
                  </View>
                  <View style={styles.summaryRight}>
                    <View style={[
                      styles.formatBadge,
                      { borderColor: `${currentFormatConfig.badgeColor}40` },
                    ]}>
                      <Text style={[
                        styles.formatBadgeText,
                        { color: currentFormatConfig.badgeColor },
                      ]}>
                        .{format.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Export Button */}
                <TouchableOpacity
                  style={[
                    styles.exportBtn,
                    (!hasAnySectionSelected || exporting) && styles.exportBtnDisabled,
                  ]}
                  onPress={handleExport}
                  disabled={!hasAnySectionSelected || exporting}
                  activeOpacity={0.85}
                >
                  {exporting ? (
                    <>
                      <ActivityIndicator size="small" color="#0B0F12" />
                      <Text style={styles.exportBtnText}>
                        {format === 'gpx' ? 'GENERATING GPX...' : 'GENERATING EXPORT...'}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Ionicons
                        name={format === 'gpx' ? 'navigate-outline' : 'download-outline'}
                        size={16}
                        color="#0B0F12"
                      />
                      <Text style={styles.exportBtnText}>
                        {Platform.OS === 'web' ? 'DOWNLOAD' : 'EXPORT'} {format.toUpperCase()} FILE
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                {!hasAnySectionSelected && (
                  <Text style={styles.helperText}>
                    Select at least one data section to export.
                  </Text>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── Styles ──────────────────────────────────────────────────
const styles = StyleSheet.create({
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
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: TACTICAL.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(196, 138, 44, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },
  headerSub: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    marginTop: 1,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  scrollBody: {
    flexGrow: 0,
  },
  body: {
    padding: 16,
    paddingBottom: Platform.OS === 'web' ? 24 : 44,
  },

  // ── Sections ──────────────────────────────────────────
  section: {
    marginBottom: 18,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
    marginBottom: 10,
  },
  selectAllText: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1,
    marginBottom: 10,
  },

  // ── Format Selection ──────────────────────────────────
  formatRow: {
    flexDirection: 'row',
    gap: 8,
  },
  formatCard: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: TACTICAL.border,
    alignItems: 'center',
    gap: 6,
    position: 'relative',
  },
  formatCardSelected: {
    backgroundColor: 'rgba(196, 138, 44, 0.04)',
  },
  formatIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: TACTICAL.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formatLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  formatDesc: {
    fontSize: 8,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    lineHeight: 12,
  },
  formatCheckmark: {
    position: 'absolute',
    top: 6,
    right: 6,
  },

  // ── GPX Info Banner ───────────────────────────────────
  gpxInfoBanner: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 112, 67, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 112, 67, 0.25)',
    marginBottom: 18,
    gap: 10,
  },
  gpxInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gpxInfoTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FF7043',
    letterSpacing: 1.5,
  },
  gpxInfoText: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    lineHeight: 16,
  },
  gpxCompatRow: {
    gap: 6,
  },
  gpxCompatLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  gpxCompatChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  gpxCompatChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 112, 67, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 112, 67, 0.2)',
  },
  gpxCompatChipText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FF7043',
    letterSpacing: 0.5,
  },

  // ── GPX Warning ───────────────────────────────────────
  gpxWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 183, 77, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 183, 77, 0.25)',
    marginBottom: 14,
  },
  gpxWarningText: {
    flex: 1,
    fontSize: 10,
    color: '#FFB74D',
    lineHeight: 15,
  },

  // ── GPX Badge (on section rows) ───────────────────────
  gpxBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 112, 67, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 112, 67, 0.25)',
  },
  gpxBadgeText: {
    fontSize: 7,
    fontWeight: '900',
    color: '#FF7043',
    letterSpacing: 0.8,
  },

  // ── Section Toggles ───────────────────────────────────
  sectionsList: {
    gap: 6,
  },
  sectionToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.2)',
  },
  sectionToggleActive: {
    borderColor: 'rgba(62, 79, 60, 0.4)',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  sectionToggleEmpty: {
    opacity: 0.6,
  },
  sectionToggleCheck: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: TACTICAL.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  sectionToggleIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionToggleContent: {
    flex: 1,
  },
  sectionToggleLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionToggleLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 1,
  },
  sectionToggleLabelMuted: {
    color: TACTICAL.textMuted,
  },
  sectionToggleCount: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    marginTop: 1,
  },

  // ── Loading ───────────────────────────────────────────
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 20,
  },
  loadingText: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },

  // ── Summary Bar ───────────────────────────────────────
  summaryBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderWidth: 1,
    borderColor: TACTICAL.border,
    marginBottom: 14,
  },
  summaryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  summaryText: {
    fontSize: 11,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },
  summaryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  formatBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  formatBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    fontFamily: 'Courier',
  },

  // ── Export Button ─────────────────────────────────────
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: TACTICAL.amber,
  },
  exportBtnDisabled: {
    opacity: 0.5,
  },
  exportBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0B0F12',
    letterSpacing: 1.2,
  },
  helperText: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },

  // ── Success State ─────────────────────────────────────
  successCard: {
    alignItems: 'center',
    gap: 10,
    padding: 20,
    borderRadius: 14,
    backgroundColor: 'rgba(76, 175, 80, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.3)',
  },
  successIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(76, 175, 80, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  successTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#4CAF50',
    letterSpacing: 1.5,
  },
  successSub: {
    fontSize: 12,
    color: TACTICAL.textMuted,
    textAlign: 'center',
  },
  successStats: {
    gap: 6,
    marginTop: 8,
    width: '100%',
  },
  successStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  successStatText: {
    fontSize: 11,
    color: TACTICAL.text,
    fontWeight: '600',
  },
  gpxSuccessNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 112, 67, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 112, 67, 0.2)',
    marginTop: 4,
    width: '100%',
  },
  gpxSuccessNoteText: {
    flex: 1,
    fontSize: 10,
    color: '#FF7043',
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  fileNameBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: TACTICAL.border,
    marginTop: 6,
    maxWidth: '100%',
  },
  fileNameText: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
    letterSpacing: 0.3,
    flexShrink: 1,
  },
  doneBtn: {
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: TACTICAL.amber,
    marginTop: 10,
  },
  doneBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0B0F12',
    letterSpacing: 1.2,
  },

  // ── Error State ───────────────────────────────────────
  errorCard: {
    alignItems: 'center',
    gap: 8,
    padding: 20,
    borderRadius: 14,
    backgroundColor: 'rgba(229, 57, 53, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(229, 57, 53, 0.3)',
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#E53935',
    letterSpacing: 1.5,
  },
  errorSub: {
    fontSize: 12,
    color: TACTICAL.textMuted,
    textAlign: 'center',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.amber,
    marginTop: 8,
  },
  retryBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1,
  },
});



