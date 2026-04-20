/**
 * AppearanceSettingsModal — Full Display settings panel
 *
 * Sections:
 * - Theme: Dynamic / Dark / Light / Driving (Hi-Vis)
 * - Toggle: Auto-enable Driving Mode when moving
 * - Toggle: Professional ECS Animations (smooth value transitions, widget glow, compass smoothing)
 * - Preview: shows current palette colors
 * - Driving mode info card
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Switch,
  StyleSheet,
} from 'react-native';
import { SafeIcon as Ionicons } from './SafeIcon';

import { useTheme } from '../context/ThemeContext';
import type { AppearanceMode } from '../lib/appearanceStore';
import { ecsAnimationSettings, type AnimationSettings } from '../lib/ecsAnimations';
import TacticalPopupShell from './TacticalPopupShell';


interface AppearanceSettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

const MODES: { key: AppearanceMode; label: string; desc: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { key: 'auto', label: 'Dynamic', desc: 'Adaptive app surfaces', icon: 'contrast-outline', color: '#80C0FF' },
  { key: 'dark', label: 'Dark', desc: 'Night / low-light', icon: 'moon-outline', color: '#8A8AFF' },
  { key: 'light', label: 'Light', desc: 'Daylight readability', icon: 'sunny-outline', color: '#FFB800' },
  { key: 'driving', label: 'Driving (Hi-Vis)', desc: 'Max contrast, solid surfaces', icon: 'car-sport-outline', color: '#E0A030' },
];

// ── Animation feature toggles ────────────────────────────────
const ANIM_FEATURES: { key: keyof AnimationSettings; label: string; desc: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'smoothValues', label: 'Smooth Value Transitions', desc: 'Numbers count smoothly between values', icon: 'trending-up-outline' },
  { key: 'widgetGlow', label: 'Widget Activation Glow', desc: 'Brief pulse when widget data updates', icon: 'flash-outline' },
  { key: 'compassSmoothing', label: 'Compass Rotation Smoothing', desc: 'Eased heading transitions', icon: 'compass-outline' },
  { key: 'widgetFocus', label: 'Widget Tap Highlight', desc: 'Subtle scale on widget interaction', icon: 'scan-outline' },
];

export default function AppearanceSettingsModal({ visible, onClose }: AppearanceSettingsModalProps) {
  const {
    appearanceMode, effectiveTheme, palette, colors,
    autoDrivingEnabled, isAutoDrivingActive,
    setAppearanceMode, setAutoDrivingEnabled,
    isDriving, drivingOverrides,
  } = useTheme();

  // ── Animation Settings state ──────────────────────────────
  const [animSettings, setAnimSettings] = useState<AnimationSettings>(ecsAnimationSettings.settings);

  useEffect(() => {
    const unsub = ecsAnimationSettings.onChange(setAnimSettings);
    return unsub;
  }, []);

  const handleAnimMasterToggle = (value: boolean) => {
    ecsAnimationSettings.setEnabled(value);
  };

  const handleAnimFeatureToggle = (key: keyof AnimationSettings, value: boolean) => {
    ecsAnimationSettings.update({ [key]: value });
  };

  return (
    <TacticalPopupShell
      visible={visible}
      onClose={onClose}
      title="Display"
      subtitle="Theme, tactical motion, and visibility preferences."
      eyebrow="ECS APPEARANCE"
      icon="color-palette-outline"
      overlayClass="workflow"
      maxWidth={860}
      maxHeightFraction={0.84}
      minHeightFraction={0.7}
    >
      <View style={[styles.container, { backgroundColor: palette.panel, borderColor: palette.border }]}>
            {/* Current Theme Indicator */}
            <View style={[styles.currentTheme, { backgroundColor: palette.bg, borderColor: palette.border }]}>
              <Text style={[styles.currentLabel, { color: palette.textMuted }]}>ACTIVE THEME</Text>
              <Text style={[styles.currentValue, { color: palette.text }]}>
                {effectiveTheme.toUpperCase()}
                {isAutoDrivingActive ? ' (AUTO)' : ''}
              </Text>
            </View>

            {/* Theme Selector */}
            <Text style={[styles.sectionLabel, { color: palette.amber, borderBottomColor: palette.amber + '30' }]}>
              THEME MODE
            </Text>

            {MODES.map(mode => {
              const isActive = appearanceMode === mode.key;
              return (
                <TouchableOpacity
                  key={mode.key}
                  style={[
                    styles.modeCard,
                    {
                      backgroundColor: isActive ? mode.color + '12' : palette.bg,
                      borderColor: isActive ? mode.color + '50' : palette.border,
                    },
                  ]}
                  onPress={() => setAppearanceMode(mode.key)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.modeIcon, { backgroundColor: mode.color + '18' }]}>
                    <Ionicons name={mode.icon} size={18} color={mode.color} />
                  </View>
                  <View style={styles.modeText}>
                    <Text style={[styles.modeLabel, { color: isActive ? mode.color : palette.text }]}>
                      {mode.label}
                    </Text>
                    <Text style={[styles.modeDesc, { color: palette.textMuted }]}>{mode.desc}</Text>
                  </View>
                  {isActive && (
                    <View style={[styles.activeIndicator, { backgroundColor: mode.color }]}>
                      <Ionicons name="checkmark" size={12} color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}

            {/* Auto-Driving Toggle */}
            <Text style={[styles.sectionLabel, { color: palette.amber, borderBottomColor: palette.amber + '30' }]}>
              AUTO-DRIVING DETECTION
            </Text>

            <View style={[styles.toggleCard, { backgroundColor: palette.bg, borderColor: palette.border }]}>
              <View style={styles.toggleRow}>
                <Ionicons name="speedometer-outline" size={16} color={palette.amber} />
                <View style={styles.toggleText}>
                  <Text style={[styles.toggleLabel, { color: palette.text }]}>
                    Auto-enable Driving Mode when moving
                  </Text>
                  <Text style={[styles.toggleDesc, { color: palette.textMuted }]}>
                    Activates Hi-Vis when speed {'\u2265'} 8 mph for 10s.{'\n'}
                    Deactivates when stopped for 3 min.
                  </Text>
                </View>
                <Switch
                  value={autoDrivingEnabled}
                  onValueChange={setAutoDrivingEnabled}
                  trackColor={{ false: 'rgba(255,255,255,0.08)', true: palette.amber + '40' }}
                  thumbColor={autoDrivingEnabled ? palette.amber : palette.textMuted}
                  style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                />
              </View>

              {isAutoDrivingActive && (
                <View style={[styles.autoActiveBar, { backgroundColor: '#50A050' + '15', borderColor: '#50A050' + '40' }]}>
                  <View style={styles.autoActiveDot} />
                  <Text style={styles.autoActiveText}>Driving Mode active (auto-detected)</Text>
                </View>
              )}
            </View>

            {/* ── Professional Animations ──────────────────────────── */}
            <Text style={[styles.sectionLabel, { color: palette.amber, borderBottomColor: palette.amber + '30' }]}>
              MOTION
            </Text>

            <View style={[styles.toggleCard, { backgroundColor: palette.bg, borderColor: palette.border }]}>
              {/* Master toggle */}
              <View style={styles.toggleRow}>
                <Ionicons name="pulse-outline" size={16} color={palette.amber} />
                <View style={styles.toggleText}>
                  <Text style={[styles.toggleLabel, { color: palette.text }]}>
                    Professional Animations
                  </Text>
                  <Text style={[styles.toggleDesc, { color: palette.textMuted }]}>
                    Instrument-grade motion cues for a premium feel.{'\n'}
                    Auto-disabled in Driving Mode and reduced motion.
                  </Text>
                </View>
                <Switch
                  value={animSettings.enabled}
                  onValueChange={handleAnimMasterToggle}
                  trackColor={{ false: 'rgba(255,255,255,0.08)', true: palette.amber + '40' }}
                  thumbColor={animSettings.enabled ? palette.amber : palette.textMuted}
                  style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                />
              </View>

              {/* Individual feature toggles */}
              {animSettings.enabled && (
                <View style={[styles.animFeaturesContainer, { borderColor: palette.border }]}>
                  {ANIM_FEATURES.map((feature) => (
                    <View key={feature.key} style={styles.animFeatureRow}>
                      <Ionicons name={feature.icon} size={13} color={palette.amber + '80'} />
                      <View style={styles.animFeatureText}>
                        <Text style={[styles.animFeatureLabel, { color: palette.text }]}>
                          {feature.label}
                        </Text>
                        <Text style={[styles.animFeatureDesc, { color: palette.textMuted }]}>
                          {feature.desc}
                        </Text>
                      </View>
                      <Switch
                        value={animSettings[feature.key] as boolean}
                        onValueChange={(val) => handleAnimFeatureToggle(feature.key, val)}
                        trackColor={{ false: 'rgba(255,255,255,0.06)', true: palette.amber + '30' }}
                        thumbColor={animSettings[feature.key] ? palette.amber + 'CC' : palette.textMuted}
                        style={{ transform: [{ scaleX: 0.7 }, { scaleY: 0.7 }] }}
                      />
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Driving Mode Info */}
            <Text style={[styles.sectionLabel, { color: palette.amber, borderBottomColor: palette.amber + '30' }]}>
              DRIVING MODE DETAILS
            </Text>


            <View style={[styles.infoCard, { backgroundColor: palette.bg, borderColor: palette.border }]}>
              <View style={styles.infoRow}>
                <Ionicons name="contrast-outline" size={14} color={palette.amber} />
                <Text style={[styles.infoText, { color: palette.text }]}>Increased contrast for sunlight readability</Text>
              </View>
              <View style={styles.infoRow}>
                <Ionicons name="layers-outline" size={14} color={palette.amber} />
                <Text style={[styles.infoText, { color: palette.text }]}>Solid surfaces (no glass/transparency)</Text>
              </View>
              <View style={styles.infoRow}>
                <Ionicons name="text-outline" size={14} color={palette.amber} />
                <Text style={[styles.infoText, { color: palette.text }]}>Bolder text and thicker borders</Text>
              </View>
              <View style={styles.infoRow}>
                <Ionicons name="pause-circle-outline" size={14} color={palette.amber} />
                <Text style={[styles.infoText, { color: palette.text }]}>Non-essential animations disabled</Text>
              </View>
              <View style={styles.infoRow}>
                <Ionicons name="battery-half-outline" size={14} color={palette.amber} />
                <Text style={[styles.infoText, { color: palette.text }]}>Battery-safe sensor throttling</Text>
              </View>
            </View>

            {/* Color Preview */}
            <Text style={[styles.sectionLabel, { color: palette.amber, borderBottomColor: palette.amber + '30' }]}>
              PALETTE PREVIEW
            </Text>

            <View style={[styles.previewCard, { backgroundColor: palette.bg, borderColor: palette.border }]}>
              <View style={styles.previewRow}>
                <View style={[styles.swatch, { backgroundColor: palette.bg }]}>
                  <Text style={[styles.swatchLabel, { color: palette.text }]}>BG</Text>
                </View>
                <View style={[styles.swatch, { backgroundColor: palette.panel }]}>
                  <Text style={[styles.swatchLabel, { color: palette.text }]}>PANEL</Text>
                </View>
                <View style={[styles.swatch, { backgroundColor: palette.amber }]}>
                  <Text style={[styles.swatchLabel, { color: '#000' }]}>AMBER</Text>
                </View>
                <View style={[styles.swatch, { backgroundColor: palette.accent }]}>
                  <Text style={[styles.swatchLabel, { color: '#fff' }]}>ACCENT</Text>
                </View>
              </View>
              <View style={styles.previewRow}>
                <View style={[styles.swatch, { backgroundColor: palette.danger }]}>
                  <Text style={[styles.swatchLabel, { color: '#fff' }]}>DANGER</Text>
                </View>
                <View style={[styles.swatch, { backgroundColor: palette.success }]}>
                  <Text style={[styles.swatchLabel, { color: '#fff' }]}>SUCCESS</Text>
                </View>
                <View style={[styles.swatch, { backgroundColor: palette.border, borderWidth: 1, borderColor: palette.text + '30' }]}>
                  <Text style={[styles.swatchLabel, { color: palette.text }]}>BORDER</Text>
                </View>
                <View style={[styles.swatch, { backgroundColor: palette.inputBg || palette.bg, borderWidth: 1, borderColor: palette.border }]}>
                  <Text style={[styles.swatchLabel, { color: palette.text }]}>INPUT</Text>
                </View>
              </View>
              <View style={styles.textPreview}>
                <Text style={[styles.previewText, { color: palette.text }]}>Primary Text</Text>
                <Text style={[styles.previewText, { color: palette.textMuted }]}>Muted Text</Text>
                <Text style={[styles.previewText, { color: palette.amber }]}>Amber Accent</Text>
              </View>
            </View>

            <View style={{ height: 40 }} />
      </View>
    </TacticalPopupShell>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 8,
  },
  currentTheme: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  currentLabel: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 3,
    marginBottom: 4,
  },
  currentValue: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 3,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 3,
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
  },
  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    gap: 12,
  },
  modeIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeText: {
    flex: 1,
  },
  modeLabel: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  modeDesc: {
    fontSize: 11,
    marginTop: 2,
  },
  activeIndicator: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleCard: {
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  toggleText: {
    flex: 1,
  },
  toggleLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  toggleDesc: {
    fontSize: 10,
    marginTop: 4,
    lineHeight: 15,
  },
  autoActiveBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  autoActiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#50A050',
  },
  autoActiveText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#50A050',
    letterSpacing: 0.5,
  },
  // ── Animation feature toggles ──────────────────────────────
  animFeaturesContainer: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    gap: 8,
  },
  animFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
  },
  animFeatureText: {
    flex: 1,
  },
  animFeatureLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  animFeatureDesc: {
    fontSize: 9,
    marginTop: 1,
    lineHeight: 12,
  },
  infoCard: {
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  infoText: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  previewCard: {
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  previewRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
  },
  swatch: {
    flex: 1,
    height: 36,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchLabel: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 1,
  },
  textPreview: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 6,
  },
  previewText: {
    fontSize: 11,
    fontWeight: '600',
  },
});




