/**
 * IntelInsertTabs — Top Insert Tab Chips + Bottom Sheet Panels
 *
 * Renders a horizontal row of chips below the Intel header.
 * Tapping a chip opens a bottom sheet anchored to the bottom of the screen
 * at ~75% height with rounded top corners, internal scrolling only,
 * and a dimmed backdrop that locks the underlying Intel screen.
 *
 * Insert Tabs:
 *   1. Permits & Access — permits, restrictions, closures
 *   2. Documentation Center — system + operational documents
 *   3. Trip Summaries — expedition reports and history
 *
 * Behavioral template: Safety tab "Tap for Protocols" model.
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import TacticalPopupShell from '../TacticalPopupShell';
import PermitsAccessPanel from './PermitsAccessPanel';
import DocumentationCenter from './DocumentationCenter';
import TripSummaries from './TripSummaries';
import type { BuilderStepState } from '../../lib/expeditionCache';
import type { ImportedRoute } from '../../lib/routeStore';
import type { EcsExpedition } from '../../lib/expeditionTypes';

type InsertTab = 'permits' | 'docs' | 'summaries' | null;

interface Props {
  // For DocumentationCenter
  builderState: BuilderStepState;
  activeRoute: ImportedRoute | null;
  loadoutStats: { totalActive: number; packedActive: number; pct: number };
  onViewDocument: (id: string, title: string, category: 'system' | 'operational', content?: string) => void;
  onExportDocument: (content: string, filename: string) => void;
  onToast: (msg: string) => void;
  // For TripSummaries
  riskScore: number | null;
  riskLevel: string;
  riskColor: string;
  expeditions: EcsExpedition[];
}

export default function IntelInsertTabs({
  builderState,
  activeRoute,
  loadoutStats,
  onViewDocument,
  onExportDocument,
  onToast,
  riskScore,
  riskLevel,
  riskColor,
  expeditions,
}: Props) {
  const [activeInsert, setActiveInsert] = useState<InsertTab>(null);

  const openInsert = useCallback((tab: InsertTab) => {
    setActiveInsert(tab);
  }, []);

  const closeInsert = useCallback(() => {
    setActiveInsert(null);
  }, []);

  // Adapter: TripSummaries expects (id, title, content) → route to onViewDocument(id, title, 'operational', content)
  const handleTripSummaryViewDoc = useCallback((id: string, title: string, content: string) => {
    onViewDocument(id, title, 'operational', content);
  }, [onViewDocument]);

  // Adapter: TripSummaries expects (content) → route to onExportDocument(content, filename)
  const handleTripSummaryExport = useCallback((content: string) => {
    onExportDocument(content, 'ecs-trip-summary');
  }, [onExportDocument]);

  const tabs: { key: InsertTab; label: string; icon: string }[] = [
    { key: 'permits', label: 'Permits & Access', icon: 'key-outline' },
    { key: 'docs', label: 'Documentation', icon: 'folder-open-outline' },
    { key: 'summaries', label: 'Trip Summaries', icon: 'analytics-outline' },
  ];

  const getSheetTitle = () => {
    switch (activeInsert) {
      case 'permits': return 'PERMITS & ACCESS';
      case 'docs': return 'DOCUMENTATION';
      case 'summaries': return 'TRIP SUMMARIES';
      default: return '';
    }
  };

  const getSheetIcon = () => {
    switch (activeInsert) {
      case 'permits': return 'key-outline';
      case 'docs': return 'folder-open-outline';
      case 'summaries': return 'analytics-outline';
      default: return 'document-outline';
    }
  };

  return (
    <>
      {/* ── Chip Row ──────────────────────────────────────── */}
      <View style={styles.chipRow}>
        {tabs.map(tab => {
          const isActive = activeInsert === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.chip, isActive && styles.chipActive]}
              onPress={() => openInsert(tab.key)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={tab.icon as any}
                size={13}
                color={isActive ? TACTICAL.amber : TACTICAL.textMuted}
              />
              <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TacticalPopupShell
        visible={!!activeInsert}
        onClose={closeInsert}
        title={getSheetTitle()}
        icon={getSheetIcon() as any}
        eyebrow="DISPATCH INSERT PANEL"
        overlayClass="workflow"
        maxWidth={980}
        maxHeightFraction={0.92}
        minHeightFraction={0.86}
        scrollable
        dismissOnBackdrop
        allowSwipeDismiss
        showHandle={false}
        bodyStyle={styles.insertPanelBody}
        contentContainerStyle={styles.insertPanelContent}
      >
        {activeInsert === 'permits' && (
          <PermitsAccessPanel onToast={onToast} />
        )}
        {activeInsert === 'docs' && (
          <DocumentationCenter
            builderState={builderState}
            activeRoute={activeRoute}
            loadoutStats={loadoutStats}
            onViewDocument={onViewDocument}
            onExportDocument={onExportDocument}
            onToast={onToast}
          />
        )}
        {activeInsert === 'summaries' && (
          <TripSummaries
            builderState={builderState}
            activeRoute={activeRoute}
            riskScore={riskScore}
            riskLevel={riskLevel}
            riskColor={riskColor}
            loadoutStats={loadoutStats}
            expeditions={expeditions}
            onExport={handleTripSummaryExport}
            onViewDocument={handleTripSummaryViewDoc}
            onToast={onToast}
          />
        )}
      </TacticalPopupShell>
    </>
  );
}

const styles = StyleSheet.create({
  // ── Chip Row ──────────────────────────────────────────────
  chipRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.25)',
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  chipActive: {
    borderColor: 'rgba(196, 138, 44, 0.4)',
    backgroundColor: 'rgba(196, 138, 44, 0.08)',
  },
  chipText: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },
  chipTextActive: {
    color: TACTICAL.amber,
  },
  insertPanelBody: {
    flex: 1,
    minHeight: 0,
  },
  insertPanelContent: {
    flexGrow: 1,
    minHeight: 0,
  },
});



