/**
 * SoundPicker
 *
 * Allows users to select different alert tones for warning and critical
 * tilt alerts. Each sound option shows its name, waveform description,
 * and a "Test" button to preview the tone before selecting it.
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { TACTICAL } from '../../lib/theme';
import { hapticCommand } from '../../lib/haptics';
import {
  type AlertSoundId,
  type AlertSoundDef,
  ALERT_SOUNDS,
  previewAlertSound,
  previewCriticalSound,
} from '../../lib/alertSounds';

// ── Colors ─────────────────────────────────────────────────────
const WARN_COLOR = '#E67E22';
const CRIT_COLOR = '#C0392B';
const ACTIVE_BLUE = '#5B8DEF';
const GREEN = '#4CAF50';

interface Props {
  warningSoundId: AlertSoundId;
  criticalSoundId: AlertSoundId;
  onChangeWarning: (id: AlertSoundId) => void;
  onChangeCritical: (id: AlertSoundId) => void;
}

// ── Waveform visualization (tiny bars) ─────────────────────────
function WaveformBars({ soundId, color }: { soundId: AlertSoundId; color: string }) {
  // Generate deterministic bar heights based on sound type
  const barPatterns: Record<AlertSoundId, number[]> = {
    tactical_beep: [0.4, 0.8, 1.0, 0.6, 0.3],
    klaxon: [1.0, 0.2, 1.0, 0.2, 1.0],
    chime: [0.3, 0.6, 1.0, 0.7, 0.4],
    sonar_ping: [0.2, 0.5, 1.0, 0.3, 0.1],
    staccato: [0.8, 0.3, 0.8, 0.3, 0.8],
    siren: [0.2, 0.4, 0.6, 0.8, 1.0],
  };
  const bars = barPatterns[soundId] || [0.5, 0.5, 0.5, 0.5, 0.5];

  return (
    <View style={sty.waveformWrap}>
      {bars.map((h, i) => (
        <View
          key={i}
          style={[
            sty.waveformBar,
            {
              height: 3 + h * 9,
              backgroundColor: color,
              opacity: 0.5 + h * 0.5,
            },
          ]}
        />
      ))}
    </View>
  );
}

// ── Test Button with pulse animation ───────────────────────────
function TestButton({
  onPress,
  color,
  label,
}: {
  onPress: () => void;
  color: string;
  label: string;
}) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [playing, setPlaying] = useState(false);

  const handlePress = useCallback(() => {
    hapticCommand();
    setPlaying(true);
    onPress();

    // Pulse animation
    Animated.sequence([
      Animated.timing(pulseAnim, {
        toValue: 0.6,
        duration: 80,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(pulseAnim, {
        toValue: 1.15,
        duration: 150,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 200,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setPlaying(false);
    });
  }, [onPress, pulseAnim]);

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.6}>
      <Animated.View
        style={[
          sty.testBtn,
          {
            borderColor: `${color}40`,
            backgroundColor: playing ? `${color}15` : 'rgba(255,255,255,0.03)',
            transform: [{ scale: pulseAnim }],
          },
        ]}>
        {/* Speaker glyph */}
        <View style={sty.speakerGlyph}>
          <View style={[sty.speakerBody, { backgroundColor: color }]} />
          <View style={[sty.speakerCone, { borderLeftColor: color }]} />
          <View style={[sty.speakerWave1, { borderColor: color }]} />
          <View style={[sty.speakerWave2, { borderColor: color }]} />
        </View>
        <Text style={[sty.testBtnText, { color }]}>{label}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

// ── Sound Option Row ───────────────────────────────────────────
function SoundOptionRow({
  sound,
  selected,
  onSelect,
  onTest,
  accentColor,
  testLabel,
}: {
  sound: AlertSoundDef;
  selected: boolean;
  onSelect: () => void;
  onTest: () => void;
  accentColor: string;
  testLabel: string;
}) {
  return (
    <View style={[sty.optionRow, selected && { borderColor: `${accentColor}35`, backgroundColor: `${accentColor}06` }]}>
      <TouchableOpacity
        style={sty.optionMain}
        onPress={() => {
          hapticCommand();
          onSelect();
        }}
        activeOpacity={0.7}>
        {/* Radio indicator */}
        <View style={[sty.radio, selected && { borderColor: accentColor }]}>
          {selected && (
            <View style={[sty.radioDot, { backgroundColor: accentColor }]} />
          )}
        </View>

        {/* Sound info */}
        <View style={sty.optionInfo}>
          <View style={sty.optionNameRow}>
            <WaveformBars soundId={sound.id} color={selected ? accentColor : sound.color} />
            <Text style={[sty.optionName, selected && { color: accentColor }]}>
              {sound.name}
            </Text>
          </View>
          <Text style={sty.optionDesc}>{sound.description}</Text>
          <Text style={[sty.optionWaveform, selected && { color: `${accentColor}90` }]}>
            {sound.waveformLabel}
          </Text>
        </View>
      </TouchableOpacity>

      {/* Test button */}
      <TestButton
        onPress={onTest}
        color={selected ? accentColor : sound.color}
        label={testLabel}
      />
    </View>
  );
}

// ── Main Component ─────────────────────────────────────────────
export default function SoundPicker({
  warningSoundId,
  criticalSoundId,
  onChangeWarning,
  onChangeCritical,
}: Props) {
  const [activeTab, setActiveTab] = useState<'warning' | 'critical'>('warning');

  const currentId = activeTab === 'warning' ? warningSoundId : criticalSoundId;
  const onSelect = activeTab === 'warning' ? onChangeWarning : onChangeCritical;
  const accentColor = activeTab === 'warning' ? WARN_COLOR : CRIT_COLOR;

  return (
    <View style={sty.container}>
      {/* Section header */}
      <View style={sty.header}>
        <View style={sty.headerIcon}>
          <View style={[sty.noteBody, { backgroundColor: TACTICAL.amber }]} />
          <View style={[sty.noteStem, { backgroundColor: TACTICAL.amber }]} />
          <View style={[sty.noteFlag, { backgroundColor: TACTICAL.amber }]} />
        </View>
        <Text style={sty.headerTitle}>ALERT TONES</Text>
      </View>

      {/* Tab switcher: Warning / Critical */}
      <View style={sty.tabRow}>
        <TouchableOpacity
          style={[sty.tab, activeTab === 'warning' && sty.tabActiveWarn]}
          onPress={() => {
            hapticCommand();
            setActiveTab('warning');
          }}
          activeOpacity={0.7}>
          <View style={[sty.tabDot, { backgroundColor: WARN_COLOR, opacity: activeTab === 'warning' ? 1 : 0.35 }]} />
          <Text style={[sty.tabText, activeTab === 'warning' && sty.tabTextActiveWarn]}>
            WARNING TONE
          </Text>
          <Text style={[sty.tabSoundName, activeTab === 'warning' && { color: WARN_COLOR }]}>
            {ALERT_SOUNDS.find((s) => s.id === warningSoundId)?.shortName || 'TACTICAL'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[sty.tab, activeTab === 'critical' && sty.tabActiveCrit]}
          onPress={() => {
            hapticCommand();
            setActiveTab('critical');
          }}
          activeOpacity={0.7}>
          <View style={[sty.tabDot, { backgroundColor: CRIT_COLOR, opacity: activeTab === 'critical' ? 1 : 0.35 }]} />
          <Text style={[sty.tabText, activeTab === 'critical' && sty.tabTextActiveCrit]}>
            CRITICAL TONE
          </Text>
          <Text style={[sty.tabSoundName, activeTab === 'critical' && { color: CRIT_COLOR }]}>
            {ALERT_SOUNDS.find((s) => s.id === criticalSoundId)?.shortName || 'KLAXON'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Sound options list */}
      <View style={sty.optionsList}>
        {ALERT_SOUNDS.map((sound) => (
          <SoundOptionRow
            key={sound.id}
            sound={sound}
            selected={currentId === sound.id}
            onSelect={() => onSelect(sound.id)}
            onTest={() => {
              if (activeTab === 'critical') {
                previewCriticalSound(sound.id);
              } else {
                previewAlertSound(sound.id);
              }
            }}
            accentColor={accentColor}
            testLabel={activeTab === 'critical' ? 'TEST' : 'TEST'}
          />
        ))}
      </View>

      {/* Info note */}
      <View style={sty.infoNote}>
        <View style={sty.infoNoteIcon}>
          <View style={[sty.infoBar, { backgroundColor: TACTICAL.amber }]} />
          <View style={[sty.infoDot, { backgroundColor: TACTICAL.amber }]} />
        </View>
        <Text style={sty.infoNoteText}>
          Test buttons play the {activeTab === 'warning' ? 'warning' : 'critical'} variant.
          Tap a different tab to configure the other severity level.
        </Text>
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────
const sty = StyleSheet.create({
  container: {
    marginTop: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  headerIcon: {
    width: 10,
    height: 12,
    position: 'relative',
  },
  noteBody: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 5,
    height: 4,
    borderRadius: 2.5,
  },
  noteStem: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 1.5,
    height: 10,
  },
  noteFlag: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 4,
    height: 2,
    borderRadius: 1,
  },
  headerTitle: {
    fontSize: 8,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },

  // ── Tabs ─────────────────────────────────────────────────
  tabRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  tabActiveWarn: {
    backgroundColor: 'rgba(230, 126, 34, 0.08)',
    borderColor: 'rgba(230, 126, 34, 0.25)',
  },
  tabActiveCrit: {
    backgroundColor: 'rgba(192, 57, 43, 0.08)',
    borderColor: 'rgba(192, 57, 43, 0.25)',
  },
  tabDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  tabText: {
    fontSize: 7,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  tabTextActiveWarn: {
    color: WARN_COLOR,
  },
  tabTextActiveCrit: {
    color: CRIT_COLOR,
  },
  tabSoundName: {
    fontSize: 8,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 0.8,
    fontFamily: 'Courier',
    opacity: 0.6,
  },

  // ── Options List ─────────────────────────────────────────
  optionsList: {
    gap: 4,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    backgroundColor: 'rgba(255,255,255,0.015)',
  },
  optionMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  // ── Radio ────────────────────────────────────────────────
  radio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // ── Option Info ──────────────────────────────────────────
  optionInfo: {
    flex: 1,
    gap: 1,
  },
  optionNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  optionName: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 0.5,
  },
  optionDesc: {
    fontSize: 8,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    letterSpacing: 0.2,
    lineHeight: 11,
    marginTop: 1,
  },
  optionWaveform: {
    fontSize: 7,
    fontWeight: '700',
    color: 'rgba(138, 138, 133, 0.55)',
    letterSpacing: 0.8,
    fontFamily: 'Courier',
    marginTop: 1,
  },

  // ── Waveform Bars ────────────────────────────────────────
  waveformWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 1,
    height: 12,
  },
  waveformBar: {
    width: 2,
    borderRadius: 0.5,
  },

  // ── Test Button ──────────────────────────────────────────
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  testBtnText: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1,
  },

  // ── Speaker Glyph ───────────────────────────────────────
  speakerGlyph: {
    width: 12,
    height: 10,
    position: 'relative',
  },
  speakerBody: {
    position: 'absolute',
    left: 0,
    top: 3,
    width: 3,
    height: 4,
    borderRadius: 0.5,
  },
  speakerCone: {
    position: 'absolute',
    left: 3,
    top: 1,
    width: 0,
    height: 0,
    borderTopWidth: 4,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  speakerWave1: {
    position: 'absolute',
    right: 2,
    top: 2,
    width: 4,
    height: 6,
    borderRadius: 3,
    borderWidth: 1,
    borderLeftColor: 'transparent',
    borderBottomColor: 'transparent',
    borderTopColor: 'transparent',
    transform: [{ rotate: '0deg' }],
  },
  speakerWave2: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: 6,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderLeftColor: 'transparent',
    borderBottomColor: 'transparent',
    borderTopColor: 'transparent',
    opacity: 0.5,
  },

  // ── Info Note ────────────────────────────────────────────
  infoNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: 'rgba(196, 138, 44, 0.04)',
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.10)',
  },
  infoNoteIcon: {
    width: 6,
    height: 10,
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 1,
  },
  infoBar: {
    width: 1.5,
    height: 5,
    borderRadius: 0.5,
  },
  infoDot: {
    width: 1.5,
    height: 1.5,
    borderRadius: 0.75,
    marginTop: 1,
  },
  infoNoteText: {
    flex: 1,
    fontSize: 7,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    lineHeight: 10,
    letterSpacing: 0.2,
    opacity: 0.7,
  },
});



