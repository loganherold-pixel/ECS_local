/**
 * Dashboard Manager Overlay
 * Full-screen overlay opened by long-pressing the dashboard widget area.
 * Contains: Expedition Control, Widget Management, Dashboard Preferences.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView,
  Animated, Alert, Platform,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL, GOLD_RAIL } from '../../lib/theme';

import { useTheme } from '../../context/ThemeContext';

import ExpeditionControlPanel from './ExpeditionControlPanel';

interface Props {
  visible: boolean;
  onClose: () => void;
  onExpeditionStarted?: () => void;
  onExpeditionEnded?: () => void;
  onOpenWidgetLibrary?: () => void;
  onRestoreDefaults?: () => void;
  onOpenPresets?: () => void;
  activeTab: 'expedition' | 'highway';
}

const C = {
  bg: '#0D1117',
  panel: '#161B22',
  border: '#1E232B',
  gold: '#D4A017',
  goldSoft: 'rgba(212,160,23,0.10)',
  goldBorder: 'rgba(212,160,23,0.25)',
  text: '#E6EDF3',
  textMuted: '#8B949E',
  textDim: '#5A6370',
};

export default function DashboardManagerOverlay({
  visible, onClose, onExpeditionStarted, onExpeditionEnded,
  onOpenWidgetLibrary, onRestoreDefaults, onOpenPresets, activeTab,
}: Props) {
  const { palette } = useTheme();
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(slideAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    } else {
      slideAnim.setValue(0);
    }
  }, [visible]);

  if (!visible) return null;

  const translateY = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [60, 0] });
  const opacity = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, { opacity }]}>
        <Animated.View style={[styles.overlay, { transform: [{ translateY }] }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Ionicons name="grid-outline" size={16} color={C.gold} />
              <Text style={styles.headerTitle}>Dashboard Manager</Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
              <Ionicons name="close" size={20} color={C.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.headerRule} />

          <ScrollView style={styles.scrollBody} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

            {/* ── Section A: Expedition Control ── */}
            <View style={styles.sectionHeader}>
              <Ionicons name="navigate-circle-outline" size={14} color={C.gold} />
              <Text style={styles.sectionTitle}>EXPEDITION CONTROL</Text>
            </View>
            <View style={styles.sectionCard}>
              <ExpeditionControlPanel
                onExpeditionStarted={onExpeditionStarted}
                onExpeditionEnded={onExpeditionEnded}
              />
            </View>

            {/* ── Section B: Widget Management ── */}
            <View style={styles.sectionHeader}>
              <Ionicons name="apps-outline" size={14} color={C.gold} />
              <Text style={styles.sectionTitle}>WIDGET MANAGEMENT</Text>
            </View>
            <View style={styles.sectionCard}>
              <TouchableOpacity
                style={styles.actionRow}
                onPress={() => { onClose(); onOpenWidgetLibrary?.(); }}
                activeOpacity={0.7}
              >
                <Ionicons name="add-circle-outline" size={16} color={C.gold} />
                <View style={styles.actionTextWrap}>
                  <Text style={styles.actionLabel}>Widget Library</Text>
                  <Text style={styles.actionHint}>Add or swap widgets on the {activeTab} dashboard</Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={C.textDim} />
              </TouchableOpacity>

              <View style={styles.actionDivider} />

              <TouchableOpacity
                style={styles.actionRow}
                onPress={() => { onClose(); onOpenPresets?.(); }}
                activeOpacity={0.7}
              >
                <Ionicons name="copy-outline" size={16} color={C.gold} />
                <View style={styles.actionTextWrap}>
                  <Text style={styles.actionLabel}>Layout Presets</Text>
                  <Text style={styles.actionHint}>Apply a preset layout configuration</Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={C.textDim} />
              </TouchableOpacity>

              <View style={styles.actionDivider} />

              <TouchableOpacity
                style={styles.actionRow}
                onPress={() => {
                  Alert.alert(
                    'Restore Defaults?',
                    'Reset the dashboard to the default widget layout.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Restore', onPress: () => { onClose(); onRestoreDefaults?.(); } },
                    ]
                  );
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="refresh-outline" size={16} color={C.textMuted} />
                <View style={styles.actionTextWrap}>
                  <Text style={styles.actionLabel}>Restore Default Layout</Text>
                  <Text style={styles.actionHint}>Reset to the default 2-widget stack</Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={C.textDim} />
              </TouchableOpacity>
            </View>

            {/* ── Section C: Dashboard Preferences ── */}
            <View style={styles.sectionHeader}>
              <Ionicons name="settings-outline" size={14} color={C.gold} />
              <Text style={styles.sectionTitle}>DASHBOARD PREFERENCES</Text>
            </View>
            <View style={styles.sectionCard}>
              <View style={styles.actionRow}>
                <Ionicons name="speedometer-outline" size={16} color={C.textMuted} />
                <View style={styles.actionTextWrap}>
                  <Text style={styles.actionLabel}>Mode Settings</Text>
                  <Text style={styles.actionHint}>Auto-switching between Highway and Expedition is managed by the mode engine based on road type, speed, and remoteness.</Text>
                </View>
              </View>

              <View style={styles.actionDivider} />

              <View style={styles.actionRow}>
                <Ionicons name="contract-outline" size={16} color={C.textMuted} />
                <View style={styles.actionTextWrap}>
                  <Text style={styles.actionLabel}>Auto-Collapse</Text>
                  <Text style={styles.actionHint}>Widgets collapse after 20s stationary. Enter Customize Mode to toggle.</Text>
                </View>
              </View>
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  overlay: {
    backgroundColor: C.bg,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: '92%',
    minHeight: '70%',
    borderTopWidth: 1,
    borderColor: C.goldBorder,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: C.text,
    letterSpacing: 1.5,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRule: {
    height: 1,
    backgroundColor: C.goldBorder,
    marginHorizontal: 16,
  },
  scrollBody: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 9,
    fontWeight: '800',
    color: C.gold,
    letterSpacing: 2,
  },
  sectionCard: {
    backgroundColor: C.panel,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
    marginBottom: 8,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  actionTextWrap: {
    flex: 1,
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: C.text,
  },
  actionHint: {
    fontSize: 9,
    color: C.textMuted,
    marginTop: 2,
    lineHeight: 13,
  },
  actionDivider: {
    height: 1,
    backgroundColor: C.border,
    marginLeft: 40,
  },
});




