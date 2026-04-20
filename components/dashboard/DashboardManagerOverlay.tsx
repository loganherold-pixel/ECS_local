/**
 * Dashboard Manager Overlay
 * Full-screen overlay opened by long-pressing the dashboard widget area.
 * Contains: Expedition Control, Widget Management, Dashboard Preferences.
 */
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { useTheme } from '../../context/ThemeContext';
import ExpeditionControlPanel from './ExpeditionControlPanel';
import TacticalPopupShell from '../TacticalPopupShell';

interface Props {
  visible: boolean;
  onClose: () => void;
  onExpeditionStarted?: () => void;
  onExpeditionEnded?: () => void;
  onOpenWidgetLibrary?: () => void;
  onRestoreDefaults?: () => void;
  onOpenPresets?: () => void;
  onOpenPowerConnections?: () => void;
  activeTab: 'expedition' | 'highway' | 'brief';
}

const C = {
  bg: '#0D1117',
  panel: '#161B22',
  border: '#1E232B',
  gold: '#D4A017',
  goldBorder: 'rgba(212,160,23,0.25)',
  text: '#E6EDF3',
  textMuted: '#8B949E',
  textDim: '#5A6370',
};

export default function DashboardManagerOverlay({
  visible,
  onClose,
  onExpeditionStarted,
  onExpeditionEnded,
  onOpenWidgetLibrary,
  onRestoreDefaults,
  onOpenPresets,
  onOpenPowerConnections,
  activeTab,
}: Props) {
  useTheme();

  if (!visible) return null;

  return (
    <TacticalPopupShell
      visible={visible}
      onClose={onClose}
      title="Dashboard Manager"
      subtitle={`Controls for the ${activeTab} dashboard surface.`}
      eyebrow="ECS DASHBOARD"
      icon="grid-outline"
      overlayClass="workflow"
      maxWidth={880}
      maxHeightFraction={0.9}
      minHeightFraction={0.68}
      scrollable
    >
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

      <View style={styles.sectionHeader}>
        <Ionicons name="apps-outline" size={14} color={C.gold} />
        <Text style={styles.sectionTitle}>WIDGET MANAGEMENT</Text>
      </View>
      <View style={styles.sectionCard}>
        <TouchableOpacity
          style={styles.actionRow}
          onPress={() => {
            onClose();
            onOpenWidgetLibrary?.();
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="add-circle-outline" size={16} color={C.gold} />
          <View style={styles.actionTextWrap}>
            <Text style={styles.actionLabel}>Widget Library</Text>
            <Text style={styles.actionHint}>
              Add or swap widgets on the {activeTab} dashboard
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={14} color={C.textDim} />
        </TouchableOpacity>

        <View style={styles.actionDivider} />

        <TouchableOpacity
          style={styles.actionRow}
          onPress={() => {
            onClose();
            onOpenPresets?.();
          }}
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
            onClose();
            onOpenPowerConnections?.();
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="battery-charging-outline" size={16} color={C.gold} />
          <View style={styles.actionTextWrap}>
            <Text style={styles.actionLabel}>Power</Text>
            <Text style={styles.actionHint}>
              Open BLU and EcoFlow connection management for testing and live power status
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={14} color={C.textDim} />
        </TouchableOpacity>
      </View>

      <View style={styles.sectionHeader}>
        <Ionicons name="settings-outline" size={14} color={C.gold} />
        <Text style={styles.sectionTitle}>DASHBOARD PREFERENCES</Text>
      </View>
      <View style={styles.sectionCard}>
        <View style={styles.actionRow}>
          <Ionicons name="speedometer-outline" size={16} color={C.textMuted} />
          <View style={styles.actionTextWrap}>
            <Text style={styles.actionLabel}>Mode Settings</Text>
            <Text style={styles.actionHint}>
              Auto-switching between Highway and Expedition is managed by the mode engine
              based on road type, speed, and remoteness.
            </Text>
          </View>
        </View>

        <View style={styles.actionDivider} />

        <View style={styles.actionRow}>
          <Ionicons name="contract-outline" size={16} color={C.textMuted} />
          <View style={styles.actionTextWrap}>
            <Text style={styles.actionLabel}>Auto-Collapse</Text>
            <Text style={styles.actionHint}>
              Widgets collapse after 20s stationary. Enter Customize Mode to toggle.
            </Text>
          </View>
        </View>

        <View style={styles.actionDivider} />

        <TouchableOpacity
          style={styles.actionRow}
          onPress={() => {
            Alert.alert(
              'Restore Defaults?',
              'Reset the dashboard to the default widget layout.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Restore',
                  onPress: () => {
                    onClose();
                    onRestoreDefaults?.();
                  },
                },
              ]
            );
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="refresh-outline" size={16} color={C.textMuted} />
          <View style={styles.actionTextWrap}>
            <Text style={styles.actionLabel}>Restore Default Layout</Text>
            <Text style={styles.actionHint}>Reset to the curated Expedition or Highway default layout</Text>
          </View>
          <Ionicons name="chevron-forward" size={14} color={C.textDim} />
        </TouchableOpacity>
      </View>
    </TacticalPopupShell>
  );
}

const styles = StyleSheet.create({
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
