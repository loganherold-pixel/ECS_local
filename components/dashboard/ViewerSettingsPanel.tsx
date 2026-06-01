/**
 * ViewerSettingsPanel — Dashboard Viewer Configuration
 *
 * Allows users to configure:
 * - Viewer Mode: Standard / Adaptive
 * - Theme Mode: Day / Night
 * - Grid Density: Comfortable / Compact
 *
 * Shows a confirmation indicator when settings are applied.
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
  Platform,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import ECSModal from '../ECSModal';
import { useTheme } from '../../context/ThemeContext';
import { useViewerSettings } from '../../context/ViewerSettingsContext';
import type { ViewerMode, ViewerThemeMode, ViewerGridDensity } from '../../lib/viewerSettingsStore';
import { useStableAnimatedValue } from '../../lib/ecsAnimations';

interface ViewerSettingsPanelProps {
  visible: boolean;
  onClose: () => void;
  onSettingsApplied?: () => void;
}

// ── Option Card ───────────────────────────────────────────
function OptionCard({
  label,
  description,
  icon,
  isActive,
  color,
  onPress,
}: {
  label: string;
  description: string;
  icon: string;
  isActive: boolean;
  color: string;
  onPress: () => void;
}) {
  const { palette } = useTheme();

  return (
    <TouchableOpacity
      style={[
        styles.optionCard,
        {
          backgroundColor: isActive ? color + '14' : palette.bg,
          borderColor: isActive ? color + '60' : palette.border,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.optionIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon as any} size={18} color={color} />
      </View>
      <View style={styles.optionText}>
        <Text style={[styles.optionLabel, { color: isActive ? color : palette.text }]}>
          {label}
        </Text>
        <Text style={[styles.optionDesc, { color: palette.textMuted }]}>{description}</Text>
      </View>
      {isActive && (
        <View style={[styles.activeCheck, { backgroundColor: color }]}>
          <Ionicons name="checkmark" size={12} color="#fff" />
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── Applied Indicator ─────────────────────────────────────
function AppliedIndicator({ visible }: { visible: boolean }) {
  const fadeAnim = useStableAnimatedValue(0);

  useEffect(() => {
    fadeAnim.stopAnimation();
    if (!visible) {
      fadeAnim.setValue(0);
      return;
    }

    const animation = Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(fadeAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]);
    animation.start();

    return () => {
      animation.stop();
      fadeAnim.stopAnimation();
    };
  }, [visible, fadeAnim]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.appliedBadge, { opacity: fadeAnim }]}>
      <Ionicons name="checkmark-circle" size={14} color="#4CAF50" />
      <Text style={styles.appliedText}>Viewer settings applied</Text>
    </Animated.View>
  );
}

export default function ViewerSettingsPanel({ visible, onClose, onSettingsApplied }: ViewerSettingsPanelProps) {
  const { palette } = useTheme();
  const { settings, setViewerMode, setThemeMode, setGridDensity, resetSettings } = useViewerSettings();
  const [showApplied, setShowApplied] = useState(false);
  const [appliedKey, setAppliedKey] = useState(0);

  const handleChange = (fn: () => void) => {
    fn();
    setShowApplied(false);
    // Trigger new applied indicator
    setTimeout(() => {
      setAppliedKey(k => k + 1);
      setShowApplied(true);
      onSettingsApplied?.();
    }, 50);
  };

  // ── Current state summary ──────────────────────────────
  const summaryParts: string[] = [];
  if (settings.viewerMode === 'adaptive') summaryParts.push('Adaptive');
  else summaryParts.push('Standard');
  if (settings.themeMode === 'day') summaryParts.push('Day');
  else summaryParts.push('Night');
  if (settings.gridDensity === 'compact') summaryParts.push('Compact');

  return (
    <ECSModal visible={visible} onClose={onClose} tier="global" stackBehavior="replace">
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: palette.panel, borderColor: palette.border }]}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <Ionicons name="eye-outline" size={18} color={palette.amber} />
                <Text style={[styles.headerTitle, { color: palette.amber }]}>VIEWER SETTINGS</Text>
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color={palette.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Current Config Summary */}
            <View style={[styles.summaryBar, { backgroundColor: palette.bg, borderColor: palette.border }]}>
              <Text style={[styles.summaryLabel, { color: palette.textMuted }]}>ACTIVE CONFIG</Text>
              <Text style={[styles.summaryValue, { color: palette.text }]}>
                {summaryParts.join(' \u2022 ')}
              </Text>
            </View>

            {/* Applied Indicator */}
            <AppliedIndicator key={appliedKey} visible={showApplied} />

            {/* ── VIEWER MODE ────────────────────────────── */}
            <Text style={[styles.sectionLabel, { color: palette.amber, borderBottomColor: palette.amber + '30' }]}>
              VIEWER MODE
            </Text>
            <Text style={[styles.sectionHint, { color: palette.textMuted }]}>
              Controls widget layout scaling and typography
            </Text>

            <OptionCard
              label="Standard"
              description="Default rendering. Optimized for detail and data density."
              icon="analytics-outline"
              isActive={settings.viewerMode === 'standard'}
              color="#4FC3F7"
              onPress={() => handleChange(() => setViewerMode('standard'))}
            />
            <OptionCard
              label="Adaptive"
              description="Scaled typography, increased spacing, high-visibility layout for glanceability."
              icon="resize-outline"
              isActive={settings.viewerMode === 'adaptive'}
              color="#AB47BC"
              onPress={() => handleChange(() => setViewerMode('adaptive'))}
            />

            {/* ── THEME MODE ─────────────────────────────── */}
            <Text style={[styles.sectionLabel, { color: palette.amber, borderBottomColor: palette.amber + '30' }]}>
              WIDGET THEME
            </Text>
            <Text style={[styles.sectionHint, { color: palette.textMuted }]}>
              Controls widget brightness, contrast, and color scheme
            </Text>

            <OptionCard
              label="Night"
              description="Dark backgrounds, amber accents. Optimized for low-light and night driving."
              icon="moon-outline"
              isActive={settings.themeMode === 'night'}
              color="#7986CB"
              onPress={() => handleChange(() => setThemeMode('night'))}
            />
            <OptionCard
              label="Daytime"
              description="Bright backgrounds, high contrast text. Maximum readability in sunlight."
              icon="sunny-outline"
              isActive={settings.themeMode === 'day'}
              color="#FFB300"
              onPress={() => handleChange(() => setThemeMode('day'))}
            />

            {/* ── GRID DENSITY ───────────────────────────── */}
            <Text style={[styles.sectionLabel, { color: palette.amber, borderBottomColor: palette.amber + '30' }]}>
              GRID DENSITY
            </Text>
            <Text style={[styles.sectionHint, { color: palette.textMuted }]}>
              Controls widget padding and content spacing
            </Text>

            <OptionCard
              label="Comfortable"
              description="Default spacing. Balanced readability and content."
              icon="expand-outline"
              isActive={settings.gridDensity === 'comfortable'}
              color="#66BB6A"
              onPress={() => handleChange(() => setGridDensity('comfortable'))}
            />
            <OptionCard
              label="Compact"
              description="Tighter spacing. More data visible per widget."
              icon="contract-outline"
              isActive={settings.gridDensity === 'compact'}
              color="#FF7043"
              onPress={() => handleChange(() => setGridDensity('compact'))}
            />

            {/* ── RESET ──────────────────────────────────── */}
            <View style={styles.resetSection}>
              <TouchableOpacity
                style={[styles.resetBtn, { borderColor: palette.border }]}
                onPress={() => handleChange(() => resetSettings())}
                activeOpacity={0.7}
              >
                <Ionicons name="refresh-outline" size={14} color={palette.textMuted} />
                <Text style={[styles.resetText, { color: palette.textMuted }]}>RESET TO DEFAULTS</Text>
              </TouchableOpacity>
            </View>

            {/* ── INFO ───────────────────────────────────── */}
            <View style={[styles.infoCard, { backgroundColor: palette.bg, borderColor: palette.border }]}>
              <View style={styles.infoRow}>
                <Ionicons name="information-circle-outline" size={14} color={palette.amber} />
                <Text style={[styles.infoText, { color: palette.textMuted }]}>
                  Settings apply instantly to all dashboard widgets. No restart required.
                </Text>
              </View>
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </View>
    </ECSModal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },
  container: {
    maxHeight: '92%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 2,
    paddingBottom: Platform.OS === 'web' ? 20 : 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 4,
  },

  // ── Summary Bar ─────────────────────────────────────
  summaryBar: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 3,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 2,
  },

  // ── Applied Indicator ───────────────────────────────
  appliedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(76,175,80,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.2)',
  },
  appliedText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4CAF50',
    letterSpacing: 0.5,
  },

  // ── Section ─────────────────────────────────────────
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 3,
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 4,
    paddingBottom: 6,
    borderBottomWidth: 1,
  },
  sectionHint: {
    fontSize: 10,
    marginHorizontal: 16,
    marginBottom: 10,
    lineHeight: 14,
  },

  // ── Option Card ─────────────────────────────────────
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    gap: 12,
  },
  optionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  optionDesc: {
    fontSize: 10,
    marginTop: 2,
    lineHeight: 14,
  },
  activeCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Reset ───────────────────────────────────────────
  resetSection: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 8,
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  resetText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
  },

  // ── Info Card ───────────────────────────────────────
  infoCard: {
    marginHorizontal: 16,
    marginTop: 4,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  infoText: {
    fontSize: 10,
    lineHeight: 15,
    flex: 1,
  },
});






