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
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  Platform,
  Dimensions,
  Modal,
  Animated,
  Easing,
  ScrollView,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import PermitsAccessPanel from './PermitsAccessPanel';
import DocumentationCenter from './DocumentationCenter';
import TripSummaries from './TripSummaries';
import type { BuilderStepState } from '../../lib/expeditionCache';
import type { ImportedRoute } from '../../lib/routeStore';
import type { EcsExpedition } from '../../lib/expeditionTypes';

type InsertTab = 'permits' | 'docs' | 'summaries' | null;

const { height: SCREEN_H } = Dimensions.get('window');
const SHEET_HEIGHT = Math.round(SCREEN_H * 0.75);
const SAFE_BOTTOM = Platform.OS === 'ios' ? 34 : 0;

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
  const [modalVisible, setModalVisible] = useState(false);

  // Animation refs
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(SHEET_HEIGHT)).current;

  const openInsert = useCallback((tab: InsertTab) => {
    setActiveInsert(tab);
    setModalVisible(true);
  }, []);

  // Animate in when modal becomes visible
  useEffect(() => {
    if (modalVisible && activeInsert) {
      backdropAnim.setValue(0);
      slideAnim.setValue(SHEET_HEIGHT);
      Animated.parallel([
        Animated.timing(backdropAnim, {
          toValue: 0.4,
          duration: 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [modalVisible, activeInsert]);

  const closeInsert = useCallback(() => {
    Animated.parallel([
      Animated.timing(backdropAnim, {
        toValue: 0,
        duration: 160,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: SHEET_HEIGHT,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setModalVisible(false);
      setActiveInsert(null);
    });
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

      {/* ── Bottom Sheet Modal ────────────────────────────── */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="none"
        onRequestClose={closeInsert}
        statusBarTranslucent
      >
        {/* Backdrop — tapping closes the sheet */}
        <View style={styles.modalRoot} pointerEvents="box-none">
          <TouchableWithoutFeedback onPress={closeInsert}>
            <Animated.View style={[styles.backdrop, { opacity: backdropAnim }]} />
          </TouchableWithoutFeedback>

          {/* Bottom Sheet Panel */}
          <Animated.View
            style={[
              styles.sheetContainer,
              { transform: [{ translateY: slideAnim }] },
            ]}
          >
            {/* Drag Handle */}
            <View style={styles.dragHandleWrap}>
              <View style={styles.dragHandle} />
            </View>

            {/* Sheet Header */}
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderLeft}>
                <View style={styles.sheetIconWrap}>
                  <Ionicons name={getSheetIcon() as any} size={14} color={TACTICAL.amber} />
                </View>
                <Text style={styles.sheetTitle}>{getSheetTitle()}</Text>
              </View>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={closeInsert}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={18} color={TACTICAL.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={styles.sheetDivider} />

            {/* Sheet Content — scrollable internally only */}
            <ScrollView
              style={styles.sheetScroll}
              contentContainerStyle={styles.sheetScrollContent}
              showsVerticalScrollIndicator={true}
              bounces={false}
              overScrollMode="never"
              nestedScrollEnabled={true}
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
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
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

  // ── Modal Root ────────────────────────────────────────────
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },

  // ── Backdrop ──────────────────────────────────────────────
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },

  // ── Sheet Container ───────────────────────────────────────
  sheetContainer: {
    height: SHEET_HEIGHT,
    backgroundColor: '#0F1612',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(62, 79, 60, 0.35)',
    paddingBottom: SAFE_BOTTOM,
    // Subtle shadow for depth
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 -4px 24px rgba(0,0,0,0.5)',
    } as any : {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 20,
    }),
  },

  // ── Drag Handle ───────────────────────────────────────────
  dragHandleWrap: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(138, 138, 133, 0.25)',
  },

  // ── Sheet Header ──────────────────────────────────────────
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 10,
  },
  sheetHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sheetIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(196, 138, 44, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Sheet Divider ─────────────────────────────────────────
  sheetDivider: {
    height: 1,
    backgroundColor: 'rgba(62, 79, 60, 0.2)',
    marginHorizontal: 16,
  },

  // ── Sheet Scroll ──────────────────────────────────────────
  sheetScroll: {
    flex: 1,
  },
  sheetScrollContent: {
    paddingBottom: 24,
  },
});



