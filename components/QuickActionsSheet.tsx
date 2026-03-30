/**
 * QuickActionsSheet — Agency-ready bottom sheet for ECS long-press
 *
 * ────────────────────────────────────────────────────────────────
 * UI SPEC:
 *   • Slides up from bottom with dim backdrop — 85-90% screen height
 *   • Dismiss: tap outside, swipe down, or tap close button
 *   • Header: "QUICK ACTIONS" left, status pill right, close button
 *   • Drag handle at top for clarity
 *   • 2-column grid, scrollable when content exceeds visible area
 *   • Each tile: icon (top), label (bottom), flat, subtle border
 *   • ECS black/gold color scheme, no shadows
 *   • Sheet sits above bottom CommandDock navigation bar
 *   • All action tiles fully visible — no clipping at bottom
 *
 * TILE ORDER (EXACT):
 *   Row 1: [Pause/Resume Expedition] [End Expedition]
 *   Row 2: [Add Waypoint] [Quick Note]
 *   Row 3: [Incident Marker] [Emergency Comms]
 *   Row 4: [Navigate Map] [Mission Dashboard]
 *
 * FUNCTIONAL:
 *   All 8 tiles perform real actions with success feedback.
 *   Expedition-aware: tiles 1–2 disabled when no expedition.
 *   Pause/Resume toggles based on expedition state.
 *   End Expedition requires confirmation.
 * ────────────────────────────────────────────────────────────────
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  TextInput,
  PanResponder,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeIcon } from './SafeIcon';

import { useApp } from '../context/AppContext';
import { hapticMicro, hapticCommand } from '../lib/haptics';
import { MOTION, EASING } from '../lib/motion';
import { DENSITY, TYPO, SPACING, ECS } from '../lib/theme';
import { CLOSE_BTN, STATUS_PILL, ICON_BOX } from '../lib/uiConstants';
import {
  expeditionStateStore,
  type ExpeditionState,
  type ExpeditionRecord,
} from '../lib/expeditionStateStore';
import {
  missionExpeditionStore,
  missionNoteStore,
  missionEventStore,
  missionCheckpointStore,
} from '../lib/missionStore';
import { pinStore } from '../lib/pinStore';
import type { MissionExpedition } from '../lib/missionTypes';
import type { PinType } from './navigate/PinTypes';

// ── Standardized sizing constants (from uiConstants) ─────────
const CLOSE_BTN_SIZE = CLOSE_BTN.size; // 32
const STATUS_PILL_GAP = STATUS_PILL.gap; // 5
const STATUS_PILL_PAD_H = STATUS_PILL.paddingH; // 10
const STATUS_PILL_PAD_V = STATUS_PILL.paddingV; // 4
const ICON_BOX_MD = ICON_BOX.md.size; // 40


// ── Constants ────────────────────────────────────────────────
// NOTE: Use Dimensions dynamically inside the component for rotation support.
// Module-level values are used only for initial animation offsets.
const INITIAL_SCREEN_H = Dimensions.get('window').height;

// CommandDock bar height (must match CommandDock.tsx BAR_HEIGHT)
const DOCK_BAR_HEIGHT = 68;

// Bottom safe area inset (approximation — used for padding inside sheet)
const BOTTOM_SAFE_INSET = Platform.OS === 'ios' ? 34 : 24;

// Initial sheet max height (recalculated dynamically in component)
const INITIAL_AVAILABLE_H = INITIAL_SCREEN_H - DOCK_BAR_HEIGHT;
const INITIAL_SHEET_MAX_H = Math.min(INITIAL_AVAILABLE_H * 0.92, INITIAL_SCREEN_H * 0.88);

// ECS palette
const GOLD = '#D4AF37';
const GOLD_DIM = 'rgba(212,175,55,0.10)';
const GOLD_BORDER = 'rgba(212,175,55,0.25)';
const AMBER = '#C48A2C';
const BG_DARK = '#0E1216';
const TILE_BG = '#151A1F';
const TILE_BORDER = 'rgba(212,175,55,0.14)';
const TILE_BORDER_DISABLED = 'rgba(138,138,133,0.12)';
const RED = '#C0392B';
const RED_DIM = 'rgba(192,57,43,0.10)';
const RED_BORDER = 'rgba(192,57,43,0.25)';
const GREEN = '#4CAF50';
const GREEN_DIM = 'rgba(76,175,80,0.10)';
const GREEN_BORDER = 'rgba(76,175,80,0.25)';
const AMBER_DIM = 'rgba(196,138,44,0.10)';
const AMBER_BORDER = 'rgba(196,138,44,0.25)';
const MUTED = '#5A6068';
const TEXT_PRIMARY = '#E6E6E1';
const TEXT_MUTED = '#8A8A85';

// ── Incident type options ────────────────────────────────────
const INCIDENT_TYPES: { key: PinType; label: string; icon: string; color: string }[] = [
  { key: 'hazard', label: 'Hazard', icon: 'warning-outline', color: '#EF5350' },
  { key: 'medical', label: 'Medical', icon: 'medkit-outline', color: '#E53935' },
  { key: 'mechanical', label: 'Mechanical', icon: 'cog-outline', color: '#FFA726' },
  { key: 'recovery', label: 'Comms', icon: 'radio-outline', color: '#42A5F5' },
  { key: 'poi', label: 'Other', icon: 'ellipsis-horizontal-circle-outline', color: '#AB47BC' },
];

// ── GPS helper (non-hook, one-shot) ──────────────────────────
async function getGPSPosition(): Promise<{ lat: number; lng: number } | null> {
  try {
    if (Platform.OS !== 'web') {
      const Location = await import('expo-location' as any);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return null;
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy?.Balanced || 3,
      });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    }
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => resolve(null),
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 10000 },
        );
      });
    }
    return null;
  } catch {
    return null;
  }
}

// ── Helper: get operational mission (for notes/events) ───────
function getOperationalMission(): MissionExpedition | null {
  const active = missionExpeditionStore.getActive();
  if (active) return active;
  const all = missionExpeditionStore.getAll();
  const staged = all.find((e) => e.status === 'staged');
  return staged || null;
}

// ── Sub-views ────────────────────────────────────────────────
type SubView = 'main' | 'quickNote' | 'incidentPicker' | 'endConfirm';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function QuickActionsSheet({ visible, onClose }: Props) {
  const router = useRouter();
  const { showToast, user } = useApp();

  // ── State declarations ─────────────────────────────────────
  const [subView, setSubView] = useState<SubView>('main');
  const [noteText, setNoteText] = useState('');
  const [busy, setBusy] = useState(false);
  const [expState, setExpState] = useState<ExpeditionState>('idle');
  const [expRecord, setExpRecord] = useState<ExpeditionRecord | null>(null);
  const [mission, setMission] = useState<MissionExpedition | null>(null);

  // ── Dynamic dimensions (updates on rotation) ───────────────
  const [screenDims, setScreenDims] = useState(() => Dimensions.get('window'));
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setScreenDims(window));
    return () => sub.remove();
  }, []);
  const SCREEN_H = screenDims.height;
  const AVAILABLE_H = SCREEN_H - DOCK_BAR_HEIGHT;
  const SHEET_MAX_H = Math.min(AVAILABLE_H * 0.92, SCREEN_H * 0.88);

  // ── Animation ──────────────────────────────────────────────
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(INITIAL_SHEET_MAX_H)).current;
  const [rendered, setRendered] = useState(false);


  // ── Pan responder for swipe-to-dismiss ─────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 12,
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) slideAnim.setValue(gs.dy);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 100 || gs.vy > 0.5) {
          dismiss();
        } else {
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 150,
            useNativeDriver: true,
          }).start();
        }
      },
    }),
  ).current;

  // ── Load expedition + mission state on open ────────────────
  useEffect(() => {
    if (visible) {
      setRendered(true);
      setSubView('main');
      setNoteText('');
      setBusy(false);

      // Read real expedition state
      setExpState(expeditionStateStore.getState());
      setExpRecord(expeditionStateStore.getCurrentExpedition());

      // Also load mission store for notes/events context
      setMission(getOperationalMission());

      hapticCommand();

      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: MOTION.quickActionsIn,
          easing: EASING.decelerate,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: MOTION.quickActionsIn + 40,
          easing: EASING.decelerate,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  // ── Subscribe to expedition state changes while open ───────
  useEffect(() => {
    if (!visible) return;
    const unsub = expeditionStateStore.subscribe((state, record) => {
      setExpState(state);
      setExpRecord(record);
    });
    return unsub;
  }, [visible]);

  const dismiss = useCallback(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: MOTION.quickActionsOut,
        easing: EASING.accelerate,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: SHEET_MAX_H,
        duration: MOTION.quickActionsOut + 30,
        easing: EASING.accelerate,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setRendered(false);
      onClose();
    });
  }, [fadeAnim, slideAnim, onClose]);


  if (!rendered) return null;

  // ── Expedition helpers ─────────────────────────────────────
  const hasExpedition = expState === 'active' || expState === 'paused';
  const isExpeditionActive = expState === 'active';
  const isExpeditionPaused = expState === 'paused';

  // ── Actions ────────────────────────────────────────────────

  const handlePauseResume = () => {
    if (!hasExpedition) return;
    hapticMicro();

    if (isExpeditionActive) {
      // Pause the expedition
      const result = expeditionStateStore.pauseExpedition({ userId: user?.id });
      if (result) {
        showToast('Expedition paused');
      } else {
        showToast('Unable to pause expedition');
      }
    } else if (isExpeditionPaused) {
      // Resume the expedition
      const result = expeditionStateStore.resumeExpedition({ userId: user?.id });
      if (result) {
        showToast('Expedition resumed');
      } else {
        showToast('Unable to resume expedition');
      }
    }
  };

  const handleEndExpedition = () => {
    if (!hasExpedition) return;
    hapticMicro();

    // End the real expedition state
    const result = expeditionStateStore.endExpedition({ userId: user?.id });
    if (result) {
      // Also end any linked mission store expedition
      if (mission && (mission.status === 'active' || mission.status === 'staged')) {
        missionExpeditionStore.updateStatus(mission.id, 'completed');
        missionEventStore.append(mission.id, 'MISSION_COMPLETED', {
          endedAt: new Date().toISOString(),
        });
      }
      showToast('Expedition ended');
    } else {
      showToast('Unable to end expedition');
    }
    dismiss();
  };

  const handleAddWaypoint = async () => {
    setBusy(true);
    try {
      const gps = await getGPSPosition();
      if (!gps) {
        showToast('Location unavailable');
        setBusy(false);
        return;
      }
      pinStore.create({
        type: 'poi',
        lat: gps.lat,
        lng: gps.lng,
        title: `Waypoint ${new Date().toLocaleTimeString()}`,
        notes: mission ? `Mission: ${mission.name}` : 'General waypoint',
        expedition_id: mission?.id || null,
      });
      if (mission) {
        missionCheckpointStore.create(
          mission.id,
          `Waypoint ${new Date().toLocaleTimeString()}`,
          gps.lat,
          gps.lng,
        );
      }
      showToast('Waypoint saved');
      dismiss();
    } catch {
      showToast('Failed to save waypoint');
    }
    setBusy(false);
  };

  const handleSaveNote = async () => {
    if (!noteText.trim()) return;
    setBusy(true);
    try {
      const gps = await getGPSPosition();
      const timestamp = new Date().toISOString();
      if (mission) {
        missionNoteStore.create(mission.id, noteText.trim(), 'quick_note');
        missionEventStore.append(mission.id, 'NOTE_ADDED', {
          text: noteText.trim(),
          lat: gps?.lat || null,
          lng: gps?.lng || null,
          timestamp,
        });
      } else {
        if (gps) {
          pinStore.create({
            type: 'poi',
            lat: gps.lat,
            lng: gps.lng,
            title: `Note ${new Date().toLocaleTimeString()}`,
            notes: noteText.trim(),
          });
        }
        missionNoteStore.create('general', noteText.trim(), 'quick_note');
      }
      showToast('Note saved');
      setNoteText('');
      dismiss();
    } catch {
      showToast('Failed to save note');
    }
    setBusy(false);
  };

  const handleIncidentMarker = async (type: PinType, label: string) => {
    setBusy(true);
    try {
      const gps = await getGPSPosition();
      if (!gps) {
        showToast('Location unavailable');
        setBusy(false);
        return;
      }
      pinStore.create({
        type,
        lat: gps.lat,
        lng: gps.lng,
        title: `${label} Incident`,
        notes: mission ? `Mission: ${mission.name}` : 'General incident',
        expedition_id: mission?.id || null,
        severity: 'med',
      });
      if (mission) {
        missionEventStore.append(mission.id, 'INCIDENT', {
          type: label,
          lat: gps.lat,
          lng: gps.lng,
          timestamp: new Date().toISOString(),
        });
      }
      showToast('Incident logged');
      dismiss();
    } catch {
      showToast('Failed to save incident');
    }
    setBusy(false);
  };

  const handleEmergencyComms = () => {
    dismiss();
    setTimeout(() => {
      router.push('/(tabs)/alert');
    }, 100);
  };

  // ── Tile component ─────────────────────────────────────────
  const Tile = ({
    icon,
    label,
    onPress,
    disabled = false,
    color = GOLD,
  }: {
    icon: string;
    label: string;
    onPress: () => void;
    disabled?: boolean;
    color?: string;
  }) => (
    <TouchableOpacity
      style={[
        styles.tile,
        disabled && styles.tileDisabled,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={disabled || busy}
    >
      <View style={[styles.tileIconWrap, { backgroundColor: disabled ? 'rgba(138,138,133,0.06)' : `${color}10` }]}>
        {busy && !disabled ? (
          <ActivityIndicator size={22} color={disabled ? MUTED : color} />
        ) : (
          <SafeIcon name={icon} size={22} color={disabled ? MUTED : color} />
        )}
      </View>
      <Text
        style={[styles.tileLabel, { color: disabled ? MUTED : TEXT_PRIMARY }]}
        numberOfLines={2}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  // ── Sub-view: Quick Note ───────────────────────────────────
  const renderQuickNote = () => (
    <View style={styles.subViewContainer}>
      <TouchableOpacity style={styles.backBtn} onPress={() => setSubView('main')}>
        <SafeIcon name="arrow-back" size={16} color={TEXT_MUTED} />
        <Text style={styles.backText}>BACK</Text>
      </TouchableOpacity>

      <Text style={styles.subViewTitle}>QUICK NOTE</Text>
      <Text style={styles.subViewDesc}>
        {mission ? `Attached to: ${mission.name}` : 'General note (no active mission)'}
      </Text>

      <TextInput
        style={styles.noteInput}
        placeholder="Type your note..."
        placeholderTextColor={TEXT_MUTED}
        value={noteText}
        onChangeText={setNoteText}
        multiline
        autoFocus
        maxLength={500}
      />

      <View style={styles.noteFooter}>
        <Text style={styles.noteCharCount}>{noteText.length}/500</Text>
        <TouchableOpacity
          style={[styles.saveNoteBtn, !noteText.trim() && { opacity: 0.4 }]}
          onPress={handleSaveNote}
          disabled={!noteText.trim() || busy}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <>
              <SafeIcon name="checkmark" size={14} color="#000" />
              <Text style={styles.saveNoteBtnText}>SAVE</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  // ── Sub-view: Incident Picker ──────────────────────────────
  const renderIncidentPicker = () => (
    <View style={styles.subViewContainer}>
      <TouchableOpacity style={styles.backBtn} onPress={() => setSubView('main')}>
        <SafeIcon name="arrow-back" size={16} color={TEXT_MUTED} />
        <Text style={styles.backText}>BACK</Text>
      </TouchableOpacity>

      <Text style={styles.subViewTitle}>INCIDENT TYPE</Text>
      <Text style={styles.subViewDesc}>Select category. GPS captured automatically.</Text>

      <View style={styles.incidentGrid}>
        {INCIDENT_TYPES.map((inc) => (
          <TouchableOpacity
            key={inc.key + inc.label}
            style={[styles.incidentCard, { borderColor: `${inc.color}30` }]}
            onPress={() => handleIncidentMarker(inc.key, inc.label)}
            activeOpacity={0.6}
            disabled={busy}
          >
            <View style={[styles.incidentIconWrap, { backgroundColor: `${inc.color}12` }]}>
              {busy ? (
                <ActivityIndicator size="small" color={inc.color} />
              ) : (
                <SafeIcon name={inc.icon} size={22} color={inc.color} />
              )}
            </View>
            <Text style={[styles.incidentLabel, { color: inc.color }]}>{inc.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  // ── Sub-view: End Confirm ──────────────────────────────────
  const renderEndConfirm = () => (
    <View style={styles.subViewContainer}>
      <TouchableOpacity style={styles.backBtn} onPress={() => setSubView('main')}>
        <SafeIcon name="arrow-back" size={16} color={TEXT_MUTED} />
        <Text style={styles.backText}>BACK</Text>
      </TouchableOpacity>

      <View style={styles.endConfirmContent}>
        <View style={styles.endConfirmIcon}>
          <SafeIcon name="alert-circle" size={36} color={RED} />
        </View>
        <Text style={styles.endConfirmTitle}>End Expedition?</Text>
        <Text style={styles.endConfirmDesc}>
          This will close the current expedition session.{'\n'}All logged data will be preserved.
        </Text>

        <View style={styles.endConfirmActions}>
          <TouchableOpacity style={styles.endCancelBtn} onPress={() => setSubView('main')}>
            <Text style={styles.endCancelBtnText}>CANCEL</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.endConfirmBtn} onPress={handleEndExpedition}>
            <SafeIcon name="stop-circle-outline" size={16} color="#fff" />
            <Text style={styles.endConfirmBtnText}>END EXPEDITION</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  // ── Main grid view ─────────────────────────────────────────
  const renderMainGrid = () => {
    // Pause/Resume button adapts to expedition state
    const pauseResumeLabel = isExpeditionPaused ? 'Resume\nExpedition' : 'Pause\nExpedition';
    const pauseResumeIcon = isExpeditionPaused ? 'play-outline' : 'pause-outline';
    const pauseResumeColor = isExpeditionPaused ? GREEN : AMBER;

    return (
      <View style={styles.gridContainer}>
        {/* Row 1 — Expedition Controls */}
        <View style={styles.gridRow}>
          <Tile
            icon={pauseResumeIcon}
            label={pauseResumeLabel}
            onPress={handlePauseResume}
            disabled={!hasExpedition}
            color={pauseResumeColor}
          />
          <Tile
            icon="stop-outline"
            label={'End\nExpedition'}
            onPress={() => setSubView('endConfirm')}
            disabled={!hasExpedition}
            color={RED}
          />
        </View>

        {/* Row 2 */}
        <View style={styles.gridRow}>
          <Tile
            icon="flag-outline"
            label={'Add\nWaypoint'}
            onPress={handleAddWaypoint}
            color="#42A5F5"
          />
          <Tile
            icon="create-outline"
            label={'Quick\nNote'}
            onPress={() => setSubView('quickNote')}
            color={GOLD}
          />
        </View>

        {/* Row 3 */}
        <View style={styles.gridRow}>
          <Tile
            icon="warning-outline"
            label={'Incident\nMarker'}
            onPress={() => setSubView('incidentPicker')}
            color="#EF5350"
          />
          <Tile
            icon="radio-outline"
            label={'Emergency\nComms'}
            onPress={handleEmergencyComms}
            color="#FF7043"
          />
        </View>

        {/* Row 4 — Navigation shortcuts */}
        <View style={styles.gridRow}>
          <Tile
            icon="compass-outline"
            label={'Navigate\nMap'}
            onPress={() => {
              dismiss();
              setTimeout(() => router.push('/(tabs)/navigate'), 100);
            }}
            color="#66BB6A"
          />
          <Tile
            icon="analytics-outline"
            label={'Expedition\nDashboard'}
            onPress={() => {
              dismiss();
              setTimeout(() => router.push('/(tabs)/dashboard'), 100);
            }}
            color="#AB47BC"
          />
        </View>
      </View>
    );
  };


  // ── Render ─────────────────────────────────────────────────
  return (
    <View style={styles.fullScreenContainer} pointerEvents="box-none">
      {/* Backdrop — covers entire screen including dock area */}
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          onPress={dismiss}
          activeOpacity={1}
        />
      </Animated.View>

      {/* Sheet — positioned above the CommandDock, dynamic maxHeight */}
      <Animated.View
        style={[
          styles.sheet,
          {
            maxHeight: SHEET_MAX_H,
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >

        {/* Drag handle area — swipeable, pinned at top */}
        <View {...panResponder.panHandlers}>
          <View style={styles.handleBar}>
            <View style={styles.handle} />
          </View>

          {/* Header row */}

          <View style={styles.header}>
            <Text style={styles.headerTitle}>QUICK ACTIONS</Text>
            <View style={[
              styles.statusPill,
              hasExpedition
                ? (isExpeditionPaused ? styles.statusPillPaused : styles.statusPillActive)
                : styles.statusPillInactive,
            ]}>
              <View style={[styles.statusDot, {
                backgroundColor: hasExpedition
                  ? (isExpeditionPaused ? AMBER : GREEN)
                  : MUTED,
              }]} />
              <Text style={[styles.statusPillText, {
                color: hasExpedition
                  ? (isExpeditionPaused ? AMBER : GREEN)
                  : MUTED,
              }]}>
                {hasExpedition
                  ? (isExpeditionPaused ? 'PAUSED' : 'ACTIVE')
                  : 'NO EXPEDITION'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={dismiss}
              activeOpacity={0.6}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <SafeIcon name="close" size={18} color={TEXT_MUTED} />
            </TouchableOpacity>
          </View>

        </View>

        {/* Scrollable content area — fills remaining sheet height */}
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={true}
          indicatorStyle="white"
          bounces={true}
          keyboardShouldPersistTaps="handled"
          overScrollMode="always"
        >
          {subView === 'main' && renderMainGrid()}
          {subView === 'quickNote' && renderQuickNote()}
          {subView === 'incidentPicker' && renderIncidentPicker()}
          {subView === 'endConfirm' && renderEndConfirm()}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────
const TILE_GAP = DENSITY.internalRowGap; // 10 — consistent with rest of ECS
const GRID_PAD = DENSITY.screenPad; // 18 — matches screen edge padding

const styles = StyleSheet.create({
  // Full-screen overlay container — ABOVE the CommandDock (zIndex > 9999)
  fullScreenContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10001,
    elevation: 10001,
  },

  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  // Sheet panel — sits above the CommandDock bar
  // maxHeight is applied dynamically via inline style for rotation support
  sheet: {
    position: 'absolute',
    bottom: DOCK_BAR_HEIGHT,
    left: 0,
    right: 0,
    backgroundColor: BG_DARK,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: GOLD_BORDER,
    flexDirection: 'column',
  },


  handleBar: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },

  // ── Header ─────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: GRID_PAD,
    paddingBottom: DENSITY.titleBodyGap + 4, // 12
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(212,175,55,0.12)',
  },
  headerTitle: {
    ...TYPO.T4,
    fontSize: 11,
    letterSpacing: 3,
    fontWeight: '900',
    color: GOLD,
  },

  // ── Close Button — standardized ────────────────────────────
  closeBtn: {
    width: CLOSE_BTN_SIZE,
    height: CLOSE_BTN_SIZE,
    borderRadius: CLOSE_BTN_SIZE / 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Status Pill — standardized ─────────────────────────────
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: STATUS_PILL_GAP,
    paddingHorizontal: STATUS_PILL_PAD_H,
    paddingVertical: STATUS_PILL_PAD_V,
    borderRadius: 10,
    borderWidth: 1,
  },
  statusPillActive: {
    backgroundColor: GREEN_DIM,
    borderColor: GREEN_BORDER,
  },
  statusPillPaused: {
    backgroundColor: AMBER_DIM,
    borderColor: AMBER_BORDER,
  },
  statusPillInactive: {
    backgroundColor: 'rgba(138,138,133,0.06)',
    borderColor: 'rgba(138,138,133,0.15)',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusPillText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
  },


  // ── Scrollable Content ─────────────────────────────────────
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: DENSITY.cardGap, // 14
    paddingBottom: 32,
    flexGrow: 1,
  },

  // ── Grid ───────────────────────────────────────────────────
  gridContainer: {
    paddingHorizontal: GRID_PAD,
    gap: TILE_GAP,
  },
  gridRow: {
    flexDirection: 'row',
    gap: TILE_GAP,
  },

  // ── Tile — standardized ────────────────────────────────────
  tile: {
    flex: 1,
    backgroundColor: TILE_BG,
    borderRadius: ECS.radius, // 14 — consistent
    borderWidth: 1,
    borderColor: TILE_BORDER,
    paddingVertical: DENSITY.cardPad + 2, // 18
    paddingHorizontal: DENSITY.internalRowGap, // 10
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 96,
  },
  tileDisabled: {
    borderColor: TILE_BORDER_DISABLED,
    opacity: 0.38,
  },
  tileIconWrap: {
    width: ICON_BOX_MD,
    height: ICON_BOX_MD,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: DENSITY.internalRowGap, // 10
  },
  tileLabel: {
    ...TYPO.U2,
    fontSize: 11,
    letterSpacing: 0.8,
    textAlign: 'center',
    lineHeight: 15,
    textTransform: 'none',
  },

  // ── Sub-view Container ─────────────────────────────────────
  subViewContainer: {
    flex: 1,
    paddingHorizontal: GRID_PAD,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs + 1, // 5
    marginBottom: DENSITY.titleBodyGap + 4, // 12
    paddingVertical: 2,
    minHeight: 44, // Tap target
  },
  backText: {
    ...TYPO.U2,
    fontSize: 9,
    letterSpacing: 1.5,
    color: TEXT_MUTED,
    textTransform: 'uppercase',
  },
  subViewTitle: {
    ...TYPO.T4,
    fontSize: 13,
    fontWeight: '900',
    color: TEXT_PRIMARY,
    letterSpacing: 2,
    marginBottom: SPACING.xs,
  },
  subViewDesc: {
    ...TYPO.B2,
    fontSize: 11,
    color: TEXT_MUTED,
    marginBottom: DENSITY.cardGap, // 14
    lineHeight: 16,
  },

  // ── Quick Note ─────────────────────────────────────────────
  noteInput: {
    backgroundColor: TILE_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TILE_BORDER,
    color: TEXT_PRIMARY,
    fontSize: 14,
    padding: DENSITY.cardPad, // 16 — consistent
    minHeight: 120,
    textAlignVertical: 'top',
  },
  noteFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: DENSITY.titleBodyGap + 4, // 12
  },
  noteCharCount: {
    fontSize: 10,
    color: TEXT_MUTED,
    letterSpacing: 0.5,
  },
  saveNoteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs + 1, // 5
    backgroundColor: GOLD,
    borderRadius: 10,
    paddingHorizontal: DENSITY.cardPad, // 16
    paddingVertical: DENSITY.internalRowGap, // 10
    minHeight: 44, // Tap target
  },
  saveNoteBtnText: {
    ...TYPO.U2,
    fontSize: 10,
    fontWeight: '900',
    color: '#000',
    letterSpacing: 1.5,
  },

  // ── Incident Picker ────────────────────────────────────────
  incidentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: TILE_GAP,
  },
  incidentCard: {
    width: '47%' as any,
    flexGrow: 1,
    backgroundColor: TILE_BG,
    borderRadius: 12,
    borderWidth: 1,
    padding: DENSITY.cardPad, // 16 — consistent
    alignItems: 'center',
    minHeight: 80, // Ensure comfortable tap
  },
  incidentIconWrap: {
    width: ICON_BOX_MD,
    height: ICON_BOX_MD,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm, // 8
  },
  incidentLabel: {
    ...TYPO.U2,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  // ── End Confirm ────────────────────────────────────────────
  endConfirmContent: {
    alignItems: 'center',
    paddingTop: DENSITY.cardPad, // 16
  },
  endConfirmIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: RED_DIM,
    borderWidth: 1,
    borderColor: RED_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: DENSITY.cardGap, // 14
  },
  endConfirmTitle: {
    ...TYPO.T3,
    color: RED,
    letterSpacing: 1,
    marginBottom: SPACING.sm, // 8
  },
  endConfirmDesc: {
    ...TYPO.B2,
    fontSize: 12,
    color: TEXT_MUTED,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: DENSITY.screenPad + 4, // 22
    paddingHorizontal: DENSITY.cardPad, // 16
  },
  endConfirmActions: {
    flexDirection: 'row',
    gap: DENSITY.titleBodyGap + 4, // 12
    alignItems: 'center',
  },
  endConfirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm, // 8
    backgroundColor: RED,
    borderRadius: 10,
    paddingHorizontal: 22,
    paddingVertical: DENSITY.titleBodyGap + 4, // 12
    minHeight: 44, // Tap target
  },
  endConfirmBtnText: {
    ...TYPO.U2,
    fontSize: 11,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 1.5,
  },
  endCancelBtn: {
    paddingVertical: DENSITY.titleBodyGap + 4, // 12
    paddingHorizontal: DENSITY.screenPad, // 18
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    minHeight: 44, // Tap target
  },
  endCancelBtnText: {
    ...TYPO.U2,
    fontSize: 11,
    fontWeight: '700',
    color: TEXT_MUTED,
    letterSpacing: 1,
  },
});





