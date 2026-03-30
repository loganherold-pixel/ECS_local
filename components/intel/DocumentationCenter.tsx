/**
 * DocumentationCenter — Section 4 of Intel Tab
 *
 * Separates System Documents from Operational Documents.
 * Supports:
 *   - Static document viewing (opens DocumentPreviewModal)
 *   - PDF export and share via gold download buttons
 *   - Per-row loading state during export
 *   - Error/success toast feedback
 *   - Version tagging on all documents
 *   - Gold accent for document export actions
 *
 * System Docs: Privacy Policy, Accuracy Disclaimer, Use Instructions, Data Handling Policy
 * Operational Docs: Expedition Manifest, Trip Summary, Gear List, Emergency Plan, Route Overview
 */
import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import {
  ECS_VERSION,
  ECS_PRODUCT,
  ECS_ORG,
  SYSTEM_DOC_CONTENT,
} from './DocumentPreviewModal';
import { buildDocumentPayload, exportDocumentPdf } from '../../lib/documentPdfExport';
import type { BuilderStepState } from '../../lib/expeditionCache';
import type { ImportedRoute } from '../../lib/routeStore';

// ── Document Definitions ─────────────────────────────────────
interface DocItem {
  id: string;
  title: string;
  description: string;
  icon: string;
  exportable: boolean;
}

const SYSTEM_DOCS: DocItem[] = [
  { id: 'privacy', title: 'Privacy Policy', description: 'Data handling and privacy practices', icon: 'lock-closed-outline', exportable: true },
  { id: 'disclaimer', title: 'Accuracy Disclaimer', description: 'Limitations and liability notice', icon: 'alert-circle-outline', exportable: true },
  { id: 'instructions', title: 'Use Instructions', description: 'How to use ECS effectively', icon: 'book-outline', exportable: true },
  { id: 'data-handling', title: 'Data Handling Policy', description: 'How your data is stored and processed', icon: 'server-outline', exportable: true },
];

const OPERATIONAL_DOCS: DocItem[] = [
  { id: 'manifest', title: 'Expedition Manifest', description: 'Complete expedition configuration document', icon: 'document-text-outline', exportable: true },
  { id: 'trip-summary', title: 'Trip Summary', description: 'Route, consumables, and readiness overview', icon: 'analytics-outline', exportable: true },
  { id: 'gear-list', title: 'Gear List Export', description: 'Itemized loadout with zones and weights', icon: 'list-outline', exportable: true },
  { id: 'emergency-plan', title: 'Emergency Plan Summary', description: 'Emergency contacts and protocols', icon: 'medkit-outline', exportable: true },
  { id: 'route-overview', title: 'Route Overview', description: 'Waypoints, distance, and elevation data', icon: 'map-outline', exportable: true },
];

interface Props {
  builderState: BuilderStepState;
  activeRoute: ImportedRoute | null;
  loadoutStats: { totalActive: number; packedActive: number; pct: number };
  onViewDocument: (id: string, title: string, category: 'system' | 'operational', content?: string) => void;
  onExportDocument: (content: string, filename: string) => void;
  onToast: (msg: string) => void;
}

export default function DocumentationCenter({
  builderState,
  activeRoute,
  loadoutStats,
  onViewDocument,
  onExportDocument,
  onToast,
}: Props) {
  const [expandedCategory, setExpandedCategory] = useState<'system' | 'operational' | null>('system');

  // ── Per-row exporting state ─────────────────────────────
  const [exportingDocs, setExportingDocs] = useState<Record<string, boolean>>({});

  // ── Generate Operational Doc Content ─────────────────────
  const generateOperationalContent = useCallback((docId: string): string => {
    const now = new Date();
    const header = [
      `${'═'.repeat(52)}`,
      `  ${ECS_ORG}`,
      `  ${ECS_PRODUCT} ${ECS_VERSION}`,
      `${'═'.repeat(52)}`,
      '',
    ];
    const footer = [
      '',
      `${'─'.repeat(52)}`,
      `Generated: ${now.toISOString()}`,
      `${ECS_PRODUCT} ${ECS_VERSION}`,
      `${ECS_ORG}`,
      '',
      'DISCLAIMER: This document is generated for planning',
      'purposes only. Verify all data independently.',
      `${'─'.repeat(52)}`,
    ];

    switch (docId) {
      case 'manifest':
        return [
          ...header,
          '  EXPEDITION MANIFEST',
          '',
          `  Vehicle:     ${builderState.vehicleName || 'Not configured'}`,
          `  Framework:   ${builderState.frameworkType || 'Not set'}`,
          `  Zones:       ${builderState.zoneCount || 0}`,
          `  Loadout ID:  ${builderState.loadoutId || 'N/A'}`,
          `  Expedition:  ${builderState.expeditionId || 'N/A'}`,
          '',
          `  Items:       ${loadoutStats.totalActive}`,
          `  Packed:      ${loadoutStats.packedActive} (${loadoutStats.pct}%)`,
          '',
          activeRoute ? [
            '  ROUTE:',
            `  Name:        ${activeRoute.name}`,
            `  Distance:    ${activeRoute.total_distance_miles.toFixed(1)} mi`,
            `  Waypoints:   ${activeRoute.waypoint_count}`,
          ].join('\n') : '  ROUTE: Not configured',
          ...footer,
        ].join('\n');

      case 'trip-summary':
        return [
          ...header,
          '  TRIP SUMMARY',
          '',
          `  Vehicle:     ${builderState.vehicleName || 'Not configured'}`,
          `  Items:       ${loadoutStats.totalActive}`,
          `  Packed:      ${loadoutStats.packedActive} (${loadoutStats.pct}%)`,
          '',
          activeRoute ? [
            '  ROUTE:',
            `  Name:        ${activeRoute.name}`,
            `  Distance:    ${activeRoute.total_distance_miles.toFixed(1)} mi`,
            `  Waypoints:   ${activeRoute.waypoint_count}`,
            `  Segments:    ${activeRoute.segment_count}`,
          ].join('\n') : '  ROUTE: Not configured',
          '',
          '  READINESS:',
          `  Pack Rate:   ${loadoutStats.pct}%`,
          `  Status:      ${loadoutStats.pct >= 80 ? 'READY' : 'INCOMPLETE'}`,
          ...footer,
        ].join('\n');

      case 'gear-list':
        return [
          ...header,
          '  GEAR LIST EXPORT',
          '',
          `  Total Active Items: ${loadoutStats.totalActive}`,
          `  Packed:             ${loadoutStats.packedActive}`,
          `  Pack Rate:          ${loadoutStats.pct}%`,
          '',
          '  Note: Full itemized list with zone assignments',
          '  available in Expedition > Loadout Builder.',
          ...footer,
        ].join('\n');

      case 'emergency-plan':
        return [
          ...header,
          '  EMERGENCY PLAN SUMMARY',
          '',
          '  EMERGENCY CONTACTS:',
          '  (Configure in Intel > Operational Access)',
          '',
          '  RADIO FREQUENCIES:',
          '  CB Ch 9        Emergency',
          '  CB Ch 19       Highway',
          '  FRS Ch 1       General',
          '  146.520 MHz    HAM VHF Calling',
          '  462.675 MHz    GMRS Emergency',
          '',
          '  PROTOCOLS:',
          '  - Vehicle breakdown: Secure scene, signal, wait',
          '  - Medical emergency: Assess, stabilize, evacuate',
          '  - Lost/stranded: Stay put, signal, conserve',
          '  - Weather emergency: Shelter, monitor, wait',
          ...footer,
        ].join('\n');

      case 'route-overview':
        if (!activeRoute) {
          return [...header, '  ROUTE OVERVIEW', '', '  No active route configured.', '  Import a route via Navigate tab.', ...footer].join('\n');
        }
        return [
          ...header,
          '  ROUTE OVERVIEW',
          '',
          `  Route:       ${activeRoute.name}`,
          `  Format:      ${activeRoute.source_format.toUpperCase()}`,
          `  Distance:    ${activeRoute.total_distance_miles.toFixed(1)} mi`,
          `  Waypoints:   ${activeRoute.waypoint_count}`,
          `  Segments:    ${activeRoute.segment_count}`,
          activeRoute.elevation_gain_ft ? `  Elev. Gain:  ${activeRoute.elevation_gain_ft} ft` : '',
          '',
          '  WAYPOINTS:',
          ...activeRoute.waypoints.slice(0, 20).map((wp, i) =>
            `  ${String(i + 1).padStart(3, ' ')}. ${wp.name || 'Unnamed'} (${wp.lat.toFixed(5)}, ${wp.lon.toFixed(5)})${wp.ele ? ` ${Math.round(wp.ele * 3.281)}ft` : ''}`
          ),
          activeRoute.waypoints.length > 20 ? `  ... and ${activeRoute.waypoints.length - 20} more` : '',
          ...footer,
        ].join('\n');

      default:
        return [...header, `  ${docId.toUpperCase()}`, '', '  Document content pending.', ...footer].join('\n');
    }
  }, [builderState, activeRoute, loadoutStats]);

  // ── Get content for any document ────────────────────────
  const getDocumentContent = useCallback((docId: string, category: 'system' | 'operational'): string => {
    if (category === 'system') {
      return SYSTEM_DOC_CONTENT[docId] || `Document content for "${docId}" is not available.`;
    }
    return generateOperationalContent(docId);
  }, [generateOperationalContent]);

  // ── View document handler ───────────────────────────────
  const handleDocPress = useCallback((doc: DocItem, category: 'system' | 'operational') => {
    if (category === 'system') {
      onViewDocument(doc.id, doc.title, 'system');
    } else {
      const content = generateOperationalContent(doc.id);
      onViewDocument(doc.id, doc.title, 'operational', content);
    }
  }, [onViewDocument, generateOperationalContent]);

  // ── PDF Export handler (real PDF generation) ────────────
  const handleDocExportPdf = useCallback(async (doc: DocItem, category: 'system' | 'operational') => {
    // Prevent double-tap
    if (exportingDocs[doc.id]) return;

    // Set loading state for this specific row
    setExportingDocs(prev => ({ ...prev, [doc.id]: true }));

    try {
      // 1. Gather source content
      const content = getDocumentContent(doc.id, category);

      // 2. Build payload
      const payload = buildDocumentPayload(doc.id, doc.title, content, category);

      // 3. Generate PDF and trigger share/save
      const result = await exportDocumentPdf(payload);

      // 4. Show feedback
      if (result.success) {
        onToast(`${doc.title} exported`);
      } else {
        onToast(`Unable to export ${doc.title}. ${result.error || 'Please try again.'}`);
        console.error(`[DocumentationCenter] Export failed for ${doc.id}:`, result.error);
      }
    } catch (err: any) {
      onToast(`Unable to export ${doc.title}. Please try again.`);
      console.error(`[DocumentationCenter] Export error for ${doc.id}:`, err);
    } finally {
      // 5. Clear loading state
      setExportingDocs(prev => ({ ...prev, [doc.id]: false }));
    }
  }, [exportingDocs, getDocumentContent, onToast]);

  // ── Render download button (shared for both categories) ─
  const renderDownloadButton = useCallback((doc: DocItem, category: 'system' | 'operational') => {
    const isExporting = exportingDocs[doc.id] || false;

    return (
      <TouchableOpacity
        style={[styles.docExportBtn, isExporting && styles.docExportBtnActive]}
        onPress={() => handleDocExportPdf(doc, category)}
        activeOpacity={0.7}
        disabled={isExporting}
      >
        {isExporting ? (
          <ActivityIndicator size="small" color={TACTICAL.amber} />
        ) : (
          <Ionicons name="download-outline" size={13} color={TACTICAL.amber} />
        )}
      </TouchableOpacity>
    );
  }, [exportingDocs, handleDocExportPdf]);

  return (
    <View style={styles.section}>
      {/* Section Header */}
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderLeft}>
          <View style={styles.sectionDot} />
          <Text style={styles.sectionTitle}>DOCUMENTATION CENTER</Text>
        </View>
      </View>

      <Text style={styles.sectionDesc}>
        Official expedition documents. System documents contain policies and legal text.
        Operational documents are generated from your expedition data.
      </Text>

      {/* System Documents */}
      <View style={styles.categoryCard}>
        <TouchableOpacity
          style={styles.categoryHeader}
          onPress={() => setExpandedCategory(expandedCategory === 'system' ? null : 'system')}
          activeOpacity={0.7}
        >
          <View style={styles.categoryHeaderLeft}>
            <View style={styles.categoryIconWrap}>
              <Ionicons name="lock-closed-outline" size={14} color={TACTICAL.textMuted} />
            </View>
            <View>
              <Text style={styles.categoryLabel}>SYSTEM DOCUMENTS</Text>
              <Text style={styles.categoryCount}>{SYSTEM_DOCS.length} documents</Text>
            </View>
          </View>
          <Ionicons
            name={expandedCategory === 'system' ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={TACTICAL.textMuted}
          />
        </TouchableOpacity>

        {expandedCategory === 'system' && (
          <View style={styles.categoryContent}>
            {SYSTEM_DOCS.map(doc => (
              <View key={doc.id} style={styles.docRowWithExport}>
                <TouchableOpacity
                  style={styles.docRowMain}
                  onPress={() => handleDocPress(doc, 'system')}
                  activeOpacity={0.7}
                >
                  <View style={styles.docRowLeft}>
                    <View style={styles.docIconWrap}>
                      <Ionicons name={doc.icon as any} size={15} color={TACTICAL.textMuted} />
                    </View>
                    <View style={styles.docInfo}>
                      <Text style={styles.docTitle}>{doc.title}</Text>
                      <Text style={styles.docDesc}>{doc.description}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
                {renderDownloadButton(doc, 'system')}
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Operational Documents */}
      <View style={[styles.categoryCard, styles.categoryCardGold]}>
        <TouchableOpacity
          style={styles.categoryHeader}
          onPress={() => setExpandedCategory(expandedCategory === 'operational' ? null : 'operational')}
          activeOpacity={0.7}
        >
          <View style={styles.categoryHeaderLeft}>
            <View style={[styles.categoryIconWrap, styles.categoryIconWrapGold]}>
              <Ionicons name="flag-outline" size={14} color={TACTICAL.amber} />
            </View>
            <View>
              <Text style={[styles.categoryLabel, { color: TACTICAL.amber }]}>OPERATIONAL DOCUMENTS</Text>
              <Text style={styles.categoryCount}>{OPERATIONAL_DOCS.length} documents</Text>
            </View>
          </View>
          <Ionicons
            name={expandedCategory === 'operational' ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={TACTICAL.textMuted}
          />
        </TouchableOpacity>

        {expandedCategory === 'operational' && (
          <View style={styles.categoryContent}>
            {OPERATIONAL_DOCS.map(doc => (
              <View key={doc.id} style={styles.docRowWithExport}>
                <TouchableOpacity
                  style={styles.docRowMain}
                  onPress={() => handleDocPress(doc, 'operational')}
                  activeOpacity={0.7}
                >
                  <View style={styles.docRowLeft}>
                    <View style={[styles.docIconWrap, styles.docIconWrapGold]}>
                      <Ionicons name={doc.icon as any} size={15} color={TACTICAL.amber} />
                    </View>
                    <View style={styles.docInfo}>
                      <Text style={styles.docTitle}>{doc.title}</Text>
                      <Text style={styles.docDesc}>{doc.description}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
                {renderDownloadButton(doc, 'operational')}
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Version Tag */}
      <View style={styles.versionTag}>
        <Text style={styles.versionTagText}>
          All documents tagged: {ECS_PRODUCT} {ECS_VERSION}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10, padding: 16, paddingTop: 16, paddingBottom: 24 },


  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: TACTICAL.amber,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 2,
  },
  sectionDesc: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    lineHeight: 15,
    marginBottom: 2,
  },

  categoryCard: {
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.2)',
    overflow: 'hidden',
  },
  categoryCardGold: {
    borderColor: 'rgba(196, 138, 44, 0.15)',
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
  },
  categoryHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  categoryIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(62, 79, 60, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryIconWrapGold: {
    backgroundColor: 'rgba(196, 138, 44, 0.1)',
  },
  categoryLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 1.5,
  },
  categoryCount: {
    fontSize: 9,
    color: TACTICAL.textMuted,
    marginTop: 1,
  },
  categoryContent: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(62, 79, 60, 0.12)',
  },

  docRowWithExport: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 79, 60, 0.08)',
  },
  docRowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    paddingRight: 4,
  },
  docRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  docIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 7,
    backgroundColor: 'rgba(62, 79, 60, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  docIconWrapGold: {
    backgroundColor: 'rgba(196, 138, 44, 0.08)',
  },
  docInfo: { flex: 1 },
  docTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: TACTICAL.text,
  },
  docDesc: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    marginTop: 1,
  },
  docExportBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.2)',
    backgroundColor: 'rgba(196, 138, 44, 0.06)',
  },
  docExportBtnActive: {
    borderColor: 'rgba(196, 138, 44, 0.4)',
    backgroundColor: 'rgba(196, 138, 44, 0.12)',
  },

  versionTag: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  versionTagText: {
    fontSize: 8,
    fontWeight: '600',
    color: 'rgba(138, 138, 133, 0.35)',
    letterSpacing: 0.5,
  },
});



