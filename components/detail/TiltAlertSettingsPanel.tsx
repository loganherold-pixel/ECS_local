/**
 * TiltAlertSettingsPanel
 *
 * Configurable tilt alert thresholds for the Attitude Monitor.
 * Users can set custom warning and critical angle limits for roll and pitch,
 * toggle audio alerts and visual flash warnings, and select alert tones.
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { TACTICAL } from '../../lib/theme';
import { hapticCommand } from '../../lib/haptics';
import {
  type TiltAlertPreferences,
  type TiltThresholds,
  type AlertSoundId,
  DEFAULT_THRESHOLDS,
} from '../../lib/tiltAlertStore';
import { getSoundDef } from '../../lib/alertSounds';
import SoundPicker from './SoundPicker';

// ── Colors ─────────────────────────────────────────────────────
const WARN_COLOR = '#E67E22';
const CRIT_COLOR = '#C0392B';
const ACTIVE_BLUE = '#5B8DEF';
const ACTIVE_BLUE_DIM = 'rgba(91, 141, 239, 0.12)';
const ACTIVE_BLUE_BORDER = 'rgba(91, 141, 239, 0.30)';
const GREEN = '#4CAF50';

interface Props {
  preferences: TiltAlertPreferences;
  onUpdate: (prefs: TiltAlertPreferences) => void;
  onClose: () => void;
  computedRollWarning?: number;
  computedRollCritical?: number;
  computedPitchWarning?: number;
  computedPitchCritical?: number;
}

// ── Slider-like stepper component ──────────────────────────────
function AngleControl({
  label,
  value,
  onChange,
  min,
  max,
  step,
  color,
  unit,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  color: string;
  unit?: string;
}) {
  const handleDecrement = () => {
    const next = Math.max(min, value - step);
    hapticCommand();
    onChange(parseFloat(next.toFixed(1)));
  };
  const handleIncrement = () => {
    const next = Math.min(max, value + step);
    hapticCommand();
    onChange(parseFloat(next.toFixed(1)));
  };
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <View style={sty.angleControl}>
      <View style={sty.angleHeader}>
        <Text style={[sty.angleLabel, { color }]}>{label}</Text>
        <Text style={[sty.angleValue, { color }]}>
          {value.toFixed(1)}{unit || '°'}
        </Text>
      </View>
      <View style={sty.sliderRow}>
        <TouchableOpacity
          style={sty.stepBtn}
          onPress={handleDecrement}
          activeOpacity={0.6}>
          <View style={sty.minusGlyph} />
        </TouchableOpacity>
        <View style={sty.sliderTrack}>
          <View
            style={[
              sty.sliderFill,
              { width: `${pct}%`, backgroundColor: color },
            ]}
          />
          <View
            style={[
              sty.sliderThumb,
              { left: `${pct}%`, borderColor: color },
            ]}
          />
        </View>
        <TouchableOpacity
          style={sty.stepBtn}
          onPress={handleIncrement}
          activeOpacity={0.6}>
          <View style={sty.plusH} />
          <View style={sty.plusV} />
        </TouchableOpacity>
      </View>
      <View style={sty.rangeLabels}>
        <Text style={sty.rangeText}>{min}°</Text>
        <Text style={sty.rangeText}>{max}°</Text>
      </View>
    </View>
  );
}

// ── Toggle Row ─────────────────────────────────────────────────
function ToggleRow({
  label,
  description,
  value,
  onToggle,
  accentColor,
}: {
  label: string;
  description: string;
  value: boolean;
  onToggle: (v: boolean) => void;
  accentColor?: string;
}) {
  const accent = accentColor || TACTICAL.amber;
  return (
    <TouchableOpacity
      style={sty.toggleRow}
      onPress={() => {
        hapticCommand();
        onToggle(!value);
      }}
      activeOpacity={0.7}>
      <View style={sty.toggleInfo}>
        <Text style={sty.toggleLabel}>{label}</Text>
        <Text style={sty.toggleDesc}>{description}</Text>
      </View>
      <View
        style={[
          sty.toggleTrack,
          value && { backgroundColor: `${accent}40`, borderColor: accent },
        ]}>
        <View
          style={[
            sty.toggleThumb,
            value && { backgroundColor: accent, alignSelf: 'flex-end' as const },
          ]}
        />
      </View>
    </TouchableOpacity>
  );
}

// ── Main Component ─────────────────────────────────────────────
export default function TiltAlertSettingsPanel({
  preferences,
  onUpdate,
  onClose,
  computedRollWarning,
  computedRollCritical,
  computedPitchWarning,
  computedPitchCritical,
}: Props) {
  const [localPrefs, setLocalPrefs] = useState<TiltAlertPreferences>({
    ...preferences,
    thresholds: { ...preferences.thresholds },
  });

  const updateThreshold = useCallback(
    (key: keyof TiltThresholds, value: number) => {
      setLocalPrefs((prev) => {
        const next = {
          ...prev,
          thresholds: { ...prev.thresholds, [key]: value },
        };
        // Enforce warning < critical
        if (key === 'rollWarningDeg' && value >= next.thresholds.rollCriticalDeg) {
          next.thresholds.rollCriticalDeg = Math.min(60, value + 5);
        }
        if (key === 'rollCriticalDeg' && value <= next.thresholds.rollWarningDeg) {
          next.thresholds.rollWarningDeg = Math.max(1, value - 5);
        }
        if (key === 'pitchWarningDeg' && value >= next.thresholds.pitchCriticalDeg) {
          next.thresholds.pitchCriticalDeg = Math.min(60, value + 5);
        }
        if (key === 'pitchCriticalDeg' && value <= next.thresholds.pitchWarningDeg) {
          next.thresholds.pitchWarningDeg = Math.max(1, value - 5);
        }
        onUpdate(next);
        return next;
      });
    },
    [onUpdate],
  );

  const updatePref = useCallback(
    (key: 'useCustomThresholds' | 'audioAlertsEnabled' | 'flashAlertsEnabled', value: boolean) => {
      setLocalPrefs((prev) => {
        const next = { ...prev, thresholds: { ...prev.thresholds }, [key]: value };
        onUpdate(next);
        return next;
      });
    },
    [onUpdate],
  );

  const updateSoundPref = useCallback(
    (key: 'warningSoundId' | 'criticalSoundId', value: AlertSoundId) => {
      setLocalPrefs((prev) => {
        const next = { ...prev, thresholds: { ...prev.thresholds }, [key]: value };
        onUpdate(next);
        return next;
      });
    },
    [onUpdate],
  );

  const handleResetDefaults = useCallback(() => {
    hapticCommand();
    const reset: TiltAlertPreferences = {
      ...localPrefs,
      thresholds: { ...DEFAULT_THRESHOLDS },
    };
    setLocalPrefs(reset);
    onUpdate(reset);
  }, [localPrefs, onUpdate]);

  // Current sound names for display
  const warnSoundDef = getSoundDef(localPrefs.warningSoundId);
  const critSoundDef = getSoundDef(localPrefs.criticalSoundId);

  return (
    <View style={sty.container}>
      {/* Header */}
      <View style={sty.header}>
        <View style={sty.headerLeft}>
          <View style={sty.alertIconWrap}>
            <View style={sty.alertBell} />
            <View style={sty.alertBellClapper} />
            <View style={sty.alertBellTop} />
          </View>
          <Text style={sty.headerTitle}>ECS ATTITUDE ALERTS</Text>
        </View>
        <TouchableOpacity
          style={sty.closeBtn}
          onPress={onClose}
          activeOpacity={0.7}>
          <View style={sty.closeX1} />
          <View style={sty.closeX2} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={sty.scrollBody}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled>
        {/* ── Custom Thresholds Toggle ── */}
        <ToggleRow
          label="Use Custom Thresholds"
          description={
            localPrefs.useCustomThresholds
              ? 'Custom ECS thresholds active'
              : 'Using the computed ECS stability model'
          }
          value={localPrefs.useCustomThresholds}
          onToggle={(v) => updatePref('useCustomThresholds', v)}
          accentColor={ACTIVE_BLUE}
        />

        {/* ── Computed defaults reference ── */}
        {!localPrefs.useCustomThresholds && (
          <View style={sty.computedRef}>
            <Text style={sty.computedTitle}>COMPUTED ECS MODEL</Text>
            <View style={sty.computedGrid}>
              <View style={sty.computedItem}>
                <Text style={sty.computedLabel}>Roll Warn</Text>
                <Text style={[sty.computedValue, { color: WARN_COLOR }]}>
                  {(computedRollWarning ?? DEFAULT_THRESHOLDS.rollWarningDeg).toFixed(1)}°
                </Text>
              </View>
              <View style={sty.computedItem}>
                <Text style={sty.computedLabel}>Roll Crit</Text>
                <Text style={[sty.computedValue, { color: CRIT_COLOR }]}>
                  {(computedRollCritical ?? DEFAULT_THRESHOLDS.rollCriticalDeg).toFixed(1)}°
                </Text>
              </View>
              <View style={sty.computedItem}>
                <Text style={sty.computedLabel}>Pitch Warn</Text>
                <Text style={[sty.computedValue, { color: WARN_COLOR }]}>
                  {(computedPitchWarning ?? DEFAULT_THRESHOLDS.pitchWarningDeg).toFixed(1)}°
                </Text>
              </View>
              <View style={sty.computedItem}>
                <Text style={sty.computedLabel}>Pitch Crit</Text>
                <Text style={[sty.computedValue, { color: CRIT_COLOR }]}>
                  {(computedPitchCritical ?? DEFAULT_THRESHOLDS.pitchCriticalDeg).toFixed(1)}°
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* ── Custom Threshold Controls ── */}
        {localPrefs.useCustomThresholds && (
          <View style={sty.thresholdsSection}>
            {/* Roll section */}
            <View style={sty.axisSection}>
              <View style={sty.axisTitleRow}>
                <View style={[sty.axisDot, { backgroundColor: WARN_COLOR }]} />
                <Text style={sty.axisTitle}>ROLL AXIS</Text>
              </View>
              <AngleControl
                label="WARNING"
                value={localPrefs.thresholds.rollWarningDeg}
                onChange={(v) => updateThreshold('rollWarningDeg', v)}
                min={5}
                max={50}
                step={1}
                color={WARN_COLOR}
              />
              <AngleControl
                label="CRITICAL"
                value={localPrefs.thresholds.rollCriticalDeg}
                onChange={(v) => updateThreshold('rollCriticalDeg', v)}
                min={10}
                max={60}
                step={1}
                color={CRIT_COLOR}
              />
            </View>

            {/* Pitch section */}
            <View style={sty.axisSection}>
              <View style={sty.axisTitleRow}>
                <View style={[sty.axisDot, { backgroundColor: ACTIVE_BLUE }]} />
                <Text style={sty.axisTitle}>PITCH AXIS</Text>
              </View>
              <AngleControl
                label="WARNING"
                value={localPrefs.thresholds.pitchWarningDeg}
                onChange={(v) => updateThreshold('pitchWarningDeg', v)}
                min={5}
                max={50}
                step={1}
                color={WARN_COLOR}
              />
              <AngleControl
                label="CRITICAL"
                value={localPrefs.thresholds.pitchCriticalDeg}
                onChange={(v) => updateThreshold('pitchCriticalDeg', v)}
                min={10}
                max={60}
                step={1}
                color={CRIT_COLOR}
              />
            </View>

            {/* Reset button */}
            <TouchableOpacity
              style={sty.resetBtn}
              onPress={handleResetDefaults}
              activeOpacity={0.7}>
              <View style={sty.resetGlyph}>
                <View style={sty.resetArrowL} />
                <View style={sty.resetBar} />
                <View style={sty.resetArrowR} />
              </View>
              <Text style={sty.resetBtnText}>RESET TO DEFAULTS</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Divider ── */}
        <View style={sty.divider} />

        {/* ── Alert Options ── */}
        <Text style={sty.sectionLabel}>ALERT OPTIONS</Text>

        <ToggleRow
          label="Audio Alerts"
          description={
            localPrefs.audioAlertsEnabled
              ? `Warning: ${warnSoundDef.name} · Critical: ${critSoundDef.name}`
              : 'Play warning tone when thresholds are crossed'
          }
          value={localPrefs.audioAlertsEnabled}
          onToggle={(v) => updatePref('audioAlertsEnabled', v)}
          accentColor={GREEN}
        />

        {/* ── Sound Picker (visible when audio is enabled) ── */}
        {localPrefs.audioAlertsEnabled && (
          <View style={sty.soundPickerWrap}>
            <SoundPicker
              warningSoundId={localPrefs.warningSoundId}
              criticalSoundId={localPrefs.criticalSoundId}
              onChangeWarning={(id) => updateSoundPref('warningSoundId', id)}
              onChangeCritical={(id) => updateSoundPref('criticalSoundId', id)}
            />
          </View>
        )}

        {/* ── Active Sound Summary (when audio enabled but picker collapsed) ── */}
        {localPrefs.audioAlertsEnabled && (
          <View style={sty.soundSummary}>
            <View style={sty.soundSummaryItem}>
              <View style={[sty.soundSummaryDot, { backgroundColor: WARN_COLOR }]} />
              <Text style={sty.soundSummaryLabel}>WARN:</Text>
              <Text style={[sty.soundSummaryValue, { color: WARN_COLOR }]}>
                {warnSoundDef.shortName}
              </Text>
            </View>
            <View style={sty.soundSummaryDivider} />
            <View style={sty.soundSummaryItem}>
              <View style={[sty.soundSummaryDot, { backgroundColor: CRIT_COLOR }]} />
              <Text style={sty.soundSummaryLabel}>CRIT:</Text>
              <Text style={[sty.soundSummaryValue, { color: CRIT_COLOR }]}>
                {critSoundDef.shortName}
              </Text>
            </View>
          </View>
        )}

        <ToggleRow
          label="Screen Flash Warnings"
          description="Flash screen border when limits are exceeded"
          value={localPrefs.flashAlertsEnabled}
          onToggle={(v) => updatePref('flashAlertsEnabled', v)}
          accentColor={CRIT_COLOR}
        />

        {/* ── Info footer ── */}
        <View style={sty.infoFooter}>
          <View style={sty.infoIcon}>
            <View style={sty.infoBarIcon} />
            <View style={sty.infoDotIcon} />
          </View>
          <Text style={sty.infoText}>
            Custom thresholds override the stability model's computed limits.
            Alert history is recorded automatically when thresholds are crossed.
            {localPrefs.audioAlertsEnabled
              ? ' Tap "TEST" to preview each tone before selecting.'
              : ''}
          </Text>
        </View>

        <View style={{ height: 12 }} />
      </ScrollView>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────
const sty = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(91, 141, 239, 0.25)',
    marginTop: 4,
    marginBottom: 6,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 79, 60, 0.18)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  alertIconWrap: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  alertBell: {
    width: 10,
    height: 8,
    borderBottomLeftRadius: 5,
    borderBottomRightRadius: 5,
    backgroundColor: TACTICAL.amber,
  },
  alertBellClapper: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: TACTICAL.amber,
    marginTop: 1,
  },
  alertBellTop: {
    position: 'absolute',
    top: 0,
    width: 4,
    height: 2,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    backgroundColor: TACTICAL.amber,
  },
  headerTitle: {
    fontSize: 9,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },
  closeBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeX1: {
    position: 'absolute',
    width: 10,
    height: 1.5,
    backgroundColor: TACTICAL.textMuted,
    transform: [{ rotate: '45deg' }],
  },
  closeX2: {
    position: 'absolute',
    width: 10,
    height: 1.5,
    backgroundColor: TACTICAL.textMuted,
    transform: [{ rotate: '-45deg' }],
  },
  scrollBody: {
    maxHeight: 600,
    paddingHorizontal: 12,
    paddingTop: 10,
  },

  // ── Toggle Row ───────────────────────────────────────────
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 8,
    marginBottom: 4,
  },
  toggleInfo: { flex: 1 },
  toggleLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: TACTICAL.text,
    letterSpacing: 0.3,
  },
  toggleDesc: {
    fontSize: 9,
    color: TACTICAL.textMuted,
    marginTop: 2,
    lineHeight: 13,
  },
  toggleTrack: {
    width: 38,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 2,
    justifyContent: 'center',
  },
  toggleThumb: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },

  // ── Computed defaults ────────────────────────────────────
  computedRef: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 10,
    marginTop: 4,
    marginBottom: 8,
  },
  computedTitle: {
    fontSize: 7,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  computedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  computedItem: {
    width: '47%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  computedLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },
  computedValue: {
    fontSize: 11,
    fontWeight: '900',
    fontFamily: 'Courier',
  },

  // ── Thresholds section ───────────────────────────────────
  thresholdsSection: {
    marginTop: 6,
  },
  axisSection: {
    marginBottom: 12,
  },
  axisTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  axisDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  axisTitle: {
    fontSize: 8,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 1.5,
  },

  // ── Angle Control ────────────────────────────────────────
  angleControl: {
    marginBottom: 10,
    paddingLeft: 12,
  },
  angleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  angleLabel: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  angleValue: {
    fontSize: 14,
    fontWeight: '900',
    fontFamily: 'Courier',
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepBtn: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  minusGlyph: {
    width: 10,
    height: 2,
    backgroundColor: TACTICAL.textMuted,
    borderRadius: 1,
  },
  plusH: {
    position: 'absolute',
    width: 10,
    height: 2,
    backgroundColor: TACTICAL.textMuted,
    borderRadius: 1,
  },
  plusV: {
    position: 'absolute',
    width: 2,
    height: 10,
    backgroundColor: TACTICAL.textMuted,
    borderRadius: 1,
  },
  sliderTrack: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 2,
    position: 'relative',
    overflow: 'visible',
  },
  sliderFill: {
    height: '100%',
    borderRadius: 2,
    opacity: 0.4,
  },
  sliderThumb: {
    position: 'absolute',
    top: -5,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 2,
    marginLeft: -7,
  },
  rangeLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 3,
    paddingHorizontal: 34,
  },
  rangeText: {
    fontSize: 7,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    opacity: 0.5,
  },

  // ── Reset button ─────────────────────────────────────────
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginTop: 4,
  },
  resetBtnText: {
    fontSize: 8,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  resetGlyph: {
    width: 10,
    height: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetArrowL: {
    width: 0,
    height: 0,
    borderTopWidth: 2.5,
    borderBottomWidth: 2.5,
    borderRightWidth: 3.5,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderRightColor: TACTICAL.textMuted,
  },
  resetBar: {
    width: 3,
    height: 1.5,
    backgroundColor: TACTICAL.textMuted,
  },
  resetArrowR: {
    width: 0,
    height: 0,
    borderTopWidth: 2.5,
    borderBottomWidth: 2.5,
    borderLeftWidth: 3.5,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: TACTICAL.textMuted,
  },

  // ── Divider ──────────────────────────────────────────────
  divider: {
    height: 1,
    backgroundColor: 'rgba(62, 79, 60, 0.18)',
    marginVertical: 10,
  },

  // ── Section label ────────────────────────────────────────
  sectionLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
    marginBottom: 8,
  },

  // ── Sound Picker Wrapper ─────────────────────────────────
  soundPickerWrap: {
    marginBottom: 6,
    paddingLeft: 4,
    paddingTop: 2,
    paddingBottom: 6,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(76, 175, 80, 0.20)',
  },

  // ── Sound Summary ────────────────────────────────────────
  soundSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginBottom: 6,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  soundSummaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  soundSummaryDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  soundSummaryLabel: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },
  soundSummaryValue: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
    fontFamily: 'Courier',
  },
  soundSummaryDivider: {
    width: 1,
    height: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },

  // ── Info footer ──────────────────────────────────────────
  infoFooter: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: 'rgba(196, 138, 44, 0.06)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.15)',
  },
  infoIcon: {
    width: 8,
    height: 12,
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 1,
  },
  infoBarIcon: {
    width: 2,
    height: 6,
    backgroundColor: TACTICAL.amber,
    borderRadius: 1,
  },
  infoDotIcon: {
    width: 2,
    height: 2,
    borderRadius: 1,
    backgroundColor: TACTICAL.amber,
    marginTop: 1,
  },
  infoText: {
    flex: 1,
    fontSize: 8,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    lineHeight: 12,
    letterSpacing: 0.2,
  },
});



