import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import { fsReadFileFromPickerUri } from '../../lib/fsCompat';



// ============================================================
// CONSTANTS
// ============================================================
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

// ============================================================
// HAVERSINE DISTANCE (miles)
// ============================================================
function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ============================================================
// GPX PARSER
// ============================================================
interface ParsedPoint {
  lat: number;
  lon: number;
  ele: number | null;
  name: string | null;
  type: 'trkpt' | 'wpt';
}

function parseGpx(xmlString: string): ParsedPoint[] {
  const points: ParsedPoint[] = [];

  // Validate it looks like GPX XML
  if (!xmlString.includes('<gpx') && !xmlString.includes('<GPX')) {
    throw new Error('INVALID GPX FORMAT — file does not contain GPX data.');
  }

  // Parse <wpt> elements
  const wptRegex = /<wpt\s+[^>]*lat\s*=\s*["']([^"']+)["'][^>]*lon\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/wpt>/gi;
  let match: RegExpExecArray | null;
  while ((match = wptRegex.exec(xmlString)) !== null) {
    const lat = parseFloat(match[1]);
    const lon = parseFloat(match[2]);
    const inner = match[3];
    if (isNaN(lat) || isNaN(lon)) continue;

    const eleMatch = inner.match(/<ele[^>]*>([\s\S]*?)<\/ele>/i);
    const nameMatch = inner.match(/<name[^>]*>([\s\S]*?)<\/name>/i);
    points.push({
      lat,
      lon,
      ele: eleMatch ? parseFloat(eleMatch[1]) || null : null,
      name: nameMatch ? nameMatch[1].trim() : null,
      type: 'wpt',
    });
  }

  // Also try wpt with lon before lat
  const wptRegex2 = /<wpt\s+[^>]*lon\s*=\s*["']([^"']+)["'][^>]*lat\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/wpt>/gi;
  while ((match = wptRegex2.exec(xmlString)) !== null) {
    const lon = parseFloat(match[1]);
    const lat = parseFloat(match[2]);
    const inner = match[3];
    if (isNaN(lat) || isNaN(lon)) continue;
    // Avoid duplicates - check if we already have this exact point
    const exists = points.some(p => p.lat === lat && p.lon === lon && p.type === 'wpt');
    if (exists) continue;

    const eleMatch = inner.match(/<ele[^>]*>([\s\S]*?)<\/ele>/i);
    const nameMatch = inner.match(/<name[^>]*>([\s\S]*?)<\/name>/i);
    points.push({
      lat,
      lon,
      ele: eleMatch ? parseFloat(eleMatch[1]) || null : null,
      name: nameMatch ? nameMatch[1].trim() : null,
      type: 'wpt',
    });
  }

  // Parse <trkpt> elements
  const trkptRegex = /<trkpt\s+[^>]*lat\s*=\s*["']([^"']+)["'][^>]*lon\s*=\s*["']([^"']+)["'][^>]*(?:\/>|>([\s\S]*?)<\/trkpt>)/gi;
  while ((match = trkptRegex.exec(xmlString)) !== null) {
    const lat = parseFloat(match[1]);
    const lon = parseFloat(match[2]);
    const inner = match[3] || '';
    if (isNaN(lat) || isNaN(lon)) continue;

    const eleMatch = inner.match(/<ele[^>]*>([\s\S]*?)<\/ele>/i);
    const nameMatch = inner.match(/<name[^>]*>([\s\S]*?)<\/name>/i);
    points.push({
      lat,
      lon,
      ele: eleMatch ? parseFloat(eleMatch[1]) || null : null,
      name: nameMatch ? nameMatch[1].trim() : null,
      type: 'trkpt',
    });
  }

  // Also try trkpt with lon before lat
  const trkptRegex2 = /<trkpt\s+[^>]*lon\s*=\s*["']([^"']+)["'][^>]*lat\s*=\s*["']([^"']+)["'][^>]*(?:\/>|>([\s\S]*?)<\/trkpt>)/gi;
  while ((match = trkptRegex2.exec(xmlString)) !== null) {
    const lon = parseFloat(match[1]);
    const lat = parseFloat(match[2]);
    const inner = match[3] || '';
    if (isNaN(lat) || isNaN(lon)) continue;
    const exists = points.some(p => p.lat === lat && p.lon === lon && p.type === 'trkpt');
    if (exists) continue;

    const eleMatch = inner.match(/<ele[^>]*>([\s\S]*?)<\/ele>/i);
    const nameMatch = inner.match(/<name[^>]*>([\s\S]*?)<\/name>/i);
    points.push({
      lat,
      lon,
      ele: eleMatch ? parseFloat(eleMatch[1]) || null : null,
      name: nameMatch ? nameMatch[1].trim() : null,
      type: 'trkpt',
    });
  }

  // Parse <rtept> elements (route points)
  const rteptRegex = /<rtept\s+[^>]*lat\s*=\s*["']([^"']+)["'][^>]*lon\s*=\s*["']([^"']+)["'][^>]*(?:\/>|>([\s\S]*?)<\/rtept>)/gi;
  while ((match = rteptRegex.exec(xmlString)) !== null) {
    const lat = parseFloat(match[1]);
    const lon = parseFloat(match[2]);
    const inner = match[3] || '';
    if (isNaN(lat) || isNaN(lon)) continue;

    const eleMatch = inner.match(/<ele[^>]*>([\s\S]*?)<\/ele>/i);
    const nameMatch = inner.match(/<name[^>]*>([\s\S]*?)<\/name>/i);
    points.push({
      lat,
      lon,
      ele: eleMatch ? parseFloat(eleMatch[1]) || null : null,
      name: nameMatch ? nameMatch[1].trim() : null,
      type: 'wpt', // treat route points like waypoints
    });
  }

  return points;
}

// ============================================================
// COMPUTE TOTAL TRACK LENGTH
// ============================================================
function computeTrackLength(points: ParsedPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineMiles(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
  }
  return total;
}

// ============================================================
// CONVERT METERS ELEVATION TO FEET
// ============================================================
function metersToFeet(m: number | null): number | null {
  if (m == null) return null;
  return Math.round(m * 3.28084);
}

// ============================================================
// PROPS
// ============================================================
interface Props {
  expeditionId: string;
  userId: string;
  existingWaypointCount: number;
  onImportComplete: () => void;
}

// ============================================================
// COMPONENT
// ============================================================
export default function GpxImportButton({
  expeditionId,
  userId,
  existingWaypointCount,
  onImportComplete,
}: Props) {
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<{
    fileName: string;
    points: ParsedPoint[];
    trackLength: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ── Clear toast after delay ──────────────────────────────
  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // ── Handle file selection ────────────────────────────────
  const handleFileContent = useCallback(async (fileName: string, content: string) => {
    setError(null);

    // Validate GPX format
    try {
      const points = parseGpx(content);
      if (points.length === 0) {
        setError('NO COORDINATES FOUND — GPX file contains no trackpoints or waypoints.');
        return;
      }

      const trackLength = computeTrackLength(points);

      // Show preview before importing
      setPreviewData({ fileName, points, trackLength });
      setShowPreview(true);
    } catch (err: any) {
      setError(err.message || 'FAILED TO PARSE GPX FILE');
    }
  }, []);

  // ── Perform the actual import ────────────────────────────
  const performImport = useCallback(async () => {
    if (!previewData) return;
    const { fileName, points, trackLength } = previewData;

    setImporting(true);
    setShowPreview(false);
    setError(null);

    try {
      // Build waypoint rows
      const startIndex = existingWaypointCount;
      const waypointRows = points.map((pt, idx) => ({
        expedition_id: expeditionId,
        owner_user_id: userId,
        name: pt.name || `Imported Point ${idx + 1}`,
        latitude: pt.lat,
        longitude: pt.lon,
        elevation_ft: metersToFeet(pt.ele),
        order_index: startIndex + idx,
        waypoint_type: 'stop',
        description: `Imported from ${fileName} (${pt.type})`,
      }));

      // Insert waypoints in batches of 100
      const batchSize = 100;
      let insertedCount = 0;
      for (let i = 0; i < waypointRows.length; i += batchSize) {
        const batch = waypointRows.slice(i, i + batchSize);
        const { error: insertErr } = await supabase
          .from('expedition_waypoints')
          .insert(batch);
        if (insertErr) throw insertErr;
        insertedCount += batch.length;
      }

      // Insert gpx_imports record
      const { error: logErr } = await supabase
        .from('gpx_imports')
        .insert({
          expedition_id: expeditionId,
          owner_user_id: userId,
          file_name: fileName,
          point_count: insertedCount,
          track_length_miles: Math.round(trackLength * 100) / 100,
        });
      if (logErr) {
        console.warn('GPX import log failed:', logErr);
        // Non-critical — waypoints were already inserted
      }

      showToast(`GPX ROUTE IMPORTED — ${insertedCount} POINTS`, 'success');
      onImportComplete();
    } catch (err: any) {
      const msg = err?.message || 'IMPORT FAILED';
      setError(msg);
      showToast('GPX IMPORT FAILED', 'error');
    }

    setImporting(false);
    setPreviewData(null);
  }, [previewData, expeditionId, userId, existingWaypointCount, onImportComplete, showToast]);

  // ── Trigger file picker (Cross-platform) ──────────────
  const triggerFilePicker = useCallback(async () => {
    // Web: Use DOM file input
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.gpx,application/gpx+xml';
      input.style.display = 'none';

      input.onchange = (e: any) => {
        const file = e.target?.files?.[0];
        if (!file) return;

        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
          setError(`FILE TOO LARGE — Maximum size is 5 MB. Selected file: ${(file.size / (1024 * 1024)).toFixed(1)} MB`);
          return;
        }

        // Validate extension
        const ext = file.name.toLowerCase().split('.').pop();
        if (ext !== 'gpx') {
          setError('INVALID FILE TYPE — Only .gpx files are accepted.');
          return;
        }

        const reader = new FileReader();
        reader.onload = (ev) => {
          const text = ev.target?.result as string;
          if (!text) {
            setError('FAILED TO READ FILE');
            return;
          }

          // Validate it's XML
          if (!text.trim().startsWith('<?xml') && !text.trim().startsWith('<gpx')) {
            setError('INVALID GPX FORMAT — File is not valid XML.');
            return;
          }

          handleFileContent(file.name, text);
        };
        reader.onerror = () => {
          setError('FAILED TO READ FILE');
        };
        reader.readAsText(file);
      };

      document.body.appendChild(input);
      input.click();
      // Clean up
      setTimeout(() => {
        try { document.body.removeChild(input); } catch {}
      }, 5000);
      return;
    }

    // Native (iOS/Android): Use expo-document-picker
    try {
      const DocumentPicker = await import('expo-document-picker' as any);
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/gpx+xml', 'text/xml', 'application/xml', '*/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return; // User cancelled
      }

      const asset = result.assets[0];
      const fileName = asset.name || 'imported.gpx';

      // Validate extension
      const ext = fileName.toLowerCase().split('.').pop();
      if (ext !== 'gpx') {
        setError('INVALID FILE TYPE — Only .gpx files are accepted.');
        return;
      }

      // Read file content via centralized fsCompat fallback
      const text = await fsReadFileFromPickerUri(asset.uri);


      if (text && text.length > 0) {
        if (!text.trim().startsWith('<?xml') && !text.trim().startsWith('<gpx')) {
          setError('INVALID GPX FORMAT — File is not valid XML.');
          return;
        }
        handleFileContent(fileName, text);
      } else {
        setError('FAILED TO READ FILE — All file reading methods exhausted.');
      }


    } catch {
      setError('FILE PICKER NOT AVAILABLE — Install expo-document-picker for native GPX import.');
    }
  }, [handleFileContent]);


  // ── RENDER ───────────────────────────────────────────────
  return (
    <View style={s.container}>
      {/* GPX IMPORT BUTTON */}
      <TouchableOpacity
        style={[s.importBtn, importing && s.importBtnDisabled]}
        onPress={triggerFilePicker}
        disabled={importing}
        activeOpacity={0.7}
      >
        {importing ? (
          <>
            <ActivityIndicator size="small" color={TACTICAL.amber} />
            <Text style={s.importBtnText}>IMPORTING GPX...</Text>
          </>
        ) : (
          <>
            <Ionicons name="cloud-upload-outline" size={18} color={TACTICAL.amber} />
            <Text style={s.importBtnText}>GPX IMPORT</Text>
            <View style={s.importBtnBadge}>
              <Text style={s.importBtnBadgeText}>.GPX</Text>
            </View>
          </>
        )}
      </TouchableOpacity>

      {/* File size note */}
      <Text style={s.fileSizeNote}>
        Accepts .gpx files up to 5 MB
      </Text>

      {/* Error display */}
      {error && (
        <View style={s.errorBox}>
          <Ionicons name="alert-circle" size={16} color={TACTICAL.danger} />
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => setError(null)} style={s.errorDismiss}>
            <Ionicons name="close" size={14} color={TACTICAL.danger} />
          </TouchableOpacity>
        </View>
      )}

      {/* Success / Error Toast */}
      {toast && (
        <View style={[
          s.toastBox,
          toast.type === 'success' ? s.toastSuccess : s.toastError,
        ]}>
          <Ionicons
            name={toast.type === 'success' ? 'checkmark-circle' : 'alert-circle'}
            size={16}
            color={toast.type === 'success' ? TACTICAL.successText : TACTICAL.danger}
          />
          <Text style={[
            s.toastText,
            { color: toast.type === 'success' ? TACTICAL.successText : TACTICAL.danger },
          ]}>
            {toast.message}
          </Text>
        </View>
      )}

      {/* Preview Modal */}
      {showPreview && previewData && (
        <Modal
          visible={showPreview}
          transparent
          animationType="fade"
          onRequestClose={() => {
            setShowPreview(false);
            setPreviewData(null);
          }}
        >
          <View style={s.modalOverlay}>
            <View style={s.modalContent}>
              {/* Modal Header */}
              <View style={s.modalHeader}>
                <View style={s.modalHeaderLeft}>
                  <Ionicons name="document-text-outline" size={20} color={TACTICAL.amber} />
                  <Text style={s.modalTitle}>GPX IMPORT PREVIEW</Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setShowPreview(false);
                    setPreviewData(null);
                  }}
                  style={s.modalClose}
                >
                  <Ionicons name="close" size={20} color={TACTICAL.textMuted} />
                </TouchableOpacity>
              </View>

              {/* File Info */}
              <View style={s.previewInfo}>
                <View style={s.previewRow}>
                  <Text style={s.previewLabel}>FILE</Text>
                  <Text style={s.previewValue}>{previewData.fileName}</Text>
                </View>
                <View style={s.previewRow}>
                  <Text style={s.previewLabel}>POINTS FOUND</Text>
                  <Text style={s.previewValueHighlight}>{previewData.points.length}</Text>
                </View>
                <View style={s.previewRow}>
                  <Text style={s.previewLabel}>TRACK LENGTH</Text>
                  <Text style={s.previewValueHighlight}>
                    {previewData.trackLength.toFixed(1)} MI
                  </Text>
                </View>
                <View style={s.previewRow}>
                  <Text style={s.previewLabel}>WAYPOINTS</Text>
                  <Text style={s.previewValue}>
                    {previewData.points.filter(p => p.type === 'wpt').length} wpt
                  </Text>
                </View>
                <View style={s.previewRow}>
                  <Text style={s.previewLabel}>TRACKPOINTS</Text>
                  <Text style={s.previewValue}>
                    {previewData.points.filter(p => p.type === 'trkpt').length} trkpt
                  </Text>
                </View>
              </View>

              {/* Point Preview List */}
              <Text style={s.previewListHeader}>
                FIRST {Math.min(previewData.points.length, 10)} POINTS
              </Text>
              <ScrollView style={s.previewList} nestedScrollEnabled>
                {previewData.points.slice(0, 10).map((pt, idx) => (
                  <View key={idx} style={s.previewPoint}>
                    <View style={s.previewPointIdx}>
                      <Text style={s.previewPointIdxText}>{idx + 1}</Text>
                    </View>
                    <View style={s.previewPointInfo}>
                      <Text style={s.previewPointName} numberOfLines={1}>
                        {pt.name || `Point ${idx + 1}`}
                      </Text>
                      <Text style={s.previewPointCoords}>
                        {pt.lat.toFixed(5)}, {pt.lon.toFixed(5)}
                        {pt.ele != null ? ` · ${metersToFeet(pt.ele)} ft` : ''}
                      </Text>
                    </View>
                    <View style={[
                      s.previewPointType,
                      pt.type === 'wpt' ? s.previewPointTypeWpt : s.previewPointTypeTrk,
                    ]}>
                      <Text style={[
                        s.previewPointTypeText,
                        pt.type === 'wpt' ? s.previewPointTypeTextWpt : s.previewPointTypeTextTrk,
                      ]}>
                        {pt.type === 'wpt' ? 'WPT' : 'TRK'}
                      </Text>
                    </View>
                  </View>
                ))}
                {previewData.points.length > 10 && (
                  <Text style={s.previewMoreText}>
                    + {previewData.points.length - 10} more points
                  </Text>
                )}
              </ScrollView>

              {/* Existing waypoints note */}
              {existingWaypointCount > 0 && (
                <View style={s.previewNote}>
                  <Ionicons name="information-circle-outline" size={14} color={TACTICAL.amber} />
                  <Text style={s.previewNoteText}>
                    {existingWaypointCount} existing waypoints will be preserved.
                    Imported points start at index {existingWaypointCount}.
                  </Text>
                </View>
              )}

              {/* Action Buttons */}
              <View style={s.modalActions}>
                <TouchableOpacity
                  style={s.cancelBtn}
                  onPress={() => {
                    setShowPreview(false);
                    setPreviewData(null);
                  }}
                >
                  <Text style={s.cancelBtnText}>CANCEL</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.confirmBtn}
                  onPress={performImport}
                >
                  <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
                  <Text style={s.confirmBtnText}>
                    IMPORT {previewData.points.length} POINTS
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Importing progress overlay */}
      {importing && (
        <View style={s.progressOverlay}>
          <ActivityIndicator size="small" color={TACTICAL.amber} />
          <Text style={s.progressText}>
            Inserting waypoints into expedition...
          </Text>
        </View>
      )}
    </View>
  );
}

// ============================================================
// STYLES
// ============================================================
const s = StyleSheet.create({
  container: {
    gap: 6,
  },

  // ── Import Button ─────────────────────────────────────────
  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(196,138,44,0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(196,138,44,0.35)',
    borderRadius: 12,
    borderStyle: 'dashed',
  },
  importBtnDisabled: {
    opacity: 0.6,
  },
  importBtnText: {
    fontSize: 13,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },
  importBtnBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(196,138,44,0.15)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.25)',
  },
  importBtnBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1,
  },

  fileSizeNote: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    letterSpacing: 0.5,
  },

  // ── Error Box ─────────────────────────────────────────────
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(192,57,43,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(192,57,43,0.3)',
    borderRadius: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: TACTICAL.danger,
    letterSpacing: 0.5,
    lineHeight: 16,
  },
  errorDismiss: {
    padding: 4,
  },

  // ── Toast ─────────────────────────────────────────────────
  toastBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  toastSuccess: {
    backgroundColor: 'rgba(62,107,62,0.12)',
    borderColor: 'rgba(62,107,62,0.3)',
  },
  toastError: {
    backgroundColor: 'rgba(192,57,43,0.1)',
    borderColor: 'rgba(192,57,43,0.3)',
  },
  toastText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    flex: 1,
  },

  // ── Modal ─────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '85%',
    backgroundColor: TACTICAL.panel,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62,79,60,0.3)',
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },
  modalClose: {
    padding: 4,
  },

  // ── Preview Info ──────────────────────────────────────────
  previewInfo: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62,79,60,0.2)',
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  previewValue: {
    fontSize: 12,
    fontWeight: '700',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },
  previewValueHighlight: {
    fontSize: 14,
    fontWeight: '900',
    color: TACTICAL.amber,
    fontFamily: 'Courier',
  },

  // ── Preview List ──────────────────────────────────────────
  previewListHeader: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  previewList: {
    maxHeight: 200,
    paddingHorizontal: 16,
  },
  previewPoint: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62,79,60,0.12)',
    gap: 10,
  },
  previewPointIdx: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(62,79,60,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewPointIdxText: {
    fontSize: 10,
    fontWeight: '900',
    color: TACTICAL.text,
  },
  previewPointInfo: {
    flex: 1,
  },
  previewPointName: {
    fontSize: 12,
    fontWeight: '700',
    color: TACTICAL.text,
  },
  previewPointCoords: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
    marginTop: 1,
  },
  previewPointType: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  previewPointTypeWpt: {
    backgroundColor: 'rgba(91,141,239,0.1)',
    borderColor: 'rgba(91,141,239,0.3)',
  },
  previewPointTypeTrk: {
    backgroundColor: 'rgba(196,138,44,0.1)',
    borderColor: 'rgba(196,138,44,0.3)',
  },
  previewPointTypeText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
  },
  previewPointTypeTextWpt: {
    color: '#5B8DEF',
  },
  previewPointTypeTextTrk: {
    color: TACTICAL.amber,
  },
  previewMoreText: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    paddingVertical: 10,
    fontStyle: 'italic',
  },

  // ── Preview Note ──────────────────────────────────────────
  previewNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(196,138,44,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.2)',
    borderRadius: 8,
  },
  previewNoteText: {
    flex: 1,
    fontSize: 10,
    color: TACTICAL.amber,
    lineHeight: 15,
  },

  // ── Modal Actions ─────────────────────────────────────────
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(62,79,60,0.2)',
  },
  cancelBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: 'rgba(62,79,60,0.2)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.35)',
  },
  cancelBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  confirmBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    backgroundColor: TACTICAL.amber,
    borderRadius: 10,
  },
  confirmBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 1,
  },

  // ── Progress Overlay ──────────────────────────────────────
  progressOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(196,138,44,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.15)',
    borderRadius: 10,
  },
  progressText: {
    fontSize: 11,
    fontWeight: '700',
    color: TACTICAL.amber,
    letterSpacing: 0.5,
  },
});



