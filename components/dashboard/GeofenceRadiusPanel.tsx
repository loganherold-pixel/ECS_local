/**
 * GeofenceRadiusPanel — Configurable Geofence Radius Settings
 *
 * Accessible from the DashboardHeader dropdown menu.
 * Allows users to adjust the geofence radius between 100m and 2000m.
 *
 * Features:
 *   - Visual map preview with proportional radius circle, home pin,
 *     cardinal direction labels, and coordinate display
 *   - Custom slider (PanResponder-based, no external dependency)
 *   - Current radius display with unit conversion (meters + miles)
 *   - Preset buttons: 200m (Urban), 400m (Default), 800m (Rural), 1500m (Remote)
 *   - Persists via expeditionStateStore.setGeofenceRadius()
 *   - Visual styling consistent with the dark tactical ECS theme
 *   - Real-time radius preview as user drags slider
 *   - Gold accent on active preset, muted for inactive
 *
 * The geofence monitor (useGeofenceMonitor) reads the radius from
 * expeditionStateStore.getGeofenceRadius() on each GPS check (~2s),
 * so changes take effect almost immediately.
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
  PanResponder,
  LayoutChangeEvent,
  Animated,
  ScrollView,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { expeditionStateStore } from '../../lib/expeditionStateStore';
import { hapticMicro } from '../../lib/haptics';
import GeofenceMapPreview from './GeofenceMapPreview';

// ── Constants ──────────────────────────────────────────────
const MIN_RADIUS = 100;
const MAX_RADIUS = 2000;
const METERS_PER_MILE = 1609.344;

// ── Presets ────────────────────────────────────────────────
const PRESETS = [
  { label: 'URBAN', value: 200, icon: 'business-outline' as const, desc: 'City / neighborhood' },
  { label: 'DEFAULT', value: 400, icon: 'home-outline' as const, desc: 'Suburban / standard' },
  { label: 'RURAL', value: 800, icon: 'trail-sign-outline' as const, desc: 'Country / spread out' },
  { label: 'REMOTE', value: 1500, icon: 'compass-outline' as const, desc: 'Backcountry / remote' },
];

// ── Palette (matches DashboardHeader / ECS theme) ──────────
const P = {
  bg: '#12161A',
  surface: '#1A1E22',
  surfaceHover: '#22272C',
  border: '#2A2E34',
  borderActive: 'rgba(212,160,23,0.35)',
  gold: '#D4A017',
  goldSoft: 'rgba(212,160,23,0.12)',
  goldMuted: '#8A7A58',
  text: '#E6EDF3',
  textMuted: '#8B949E',
  textDim: '#5A5F66',
  trackBg: '#1E2328',
  trackFill: 'rgba(212,160,23,0.45)',
  thumbBg: '#D4A017',
  thumbBorder: '#B8890F',
};

interface GeofenceRadiusPanelProps {
  visible: boolean;
  onClose: () => void;
}

// ── Helpers ────────────────────────────────────────────────
function metersToMiles(m: number): string {
  return (m / METERS_PER_MILE).toFixed(2);
}

function radiusToFraction(radius: number): number {
  return Math.max(0, Math.min(1, (radius - MIN_RADIUS) / (MAX_RADIUS - MIN_RADIUS)));
}

function fractionToRadius(fraction: number): number {
  const raw = MIN_RADIUS + fraction * (MAX_RADIUS - MIN_RADIUS);
  // Snap to nearest 25m
  return Math.round(raw / 25) * 25;
}

function getPresetMatch(radius: number): number | null {
  const preset = PRESETS.find(p => p.value === radius);
  return preset ? preset.value : null;
}

// ── Component ──────────────────────────────────────────────
export default function GeofenceRadiusPanel({ visible, onClose }: GeofenceRadiusPanelProps) {
  const [radius, setRadius] = useState(() => expeditionStateStore.getGeofenceRadius());
  const [trackWidth, setTrackWidth] = useState(0);
  const isDragging = useRef(false);
  const radiusRef = useRef(radius);
  const thumbAnim = useRef(new Animated.Value(1)).current;

  // Keep ref in sync for PanResponder release handler
  useEffect(() => {
    radiusRef.current = radius;
  }, [radius]);

  // Refresh radius when panel opens
  useEffect(() => {
    if (visible) {
      const stored = expeditionStateStore.getGeofenceRadius();
      setRadius(stored);
      radiusRef.current = stored;
    }
  }, [visible]);

  // ── Persist radius ───────────────────────────────────────
  const persistRadius = useCallback((newRadius: number) => {
    const clamped = Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, newRadius));
    setRadius(clamped);
    radiusRef.current = clamped;
    expeditionStateStore.setGeofenceRadius(clamped);
  }, []);

  // ── Preset handler ───────────────────────────────────────
  const handlePreset = useCallback((value: number) => {
    persistRadius(value);
    hapticMicro();
  }, [persistRadius]);

  // ── Track layout measurement ─────────────────────────────
  const handleTrackLayout = useCallback((e: LayoutChangeEvent) => {
    const { width } = e.nativeEvent.layout;
    setTrackWidth(width);
  }, []);

  // ── PanResponder for slider thumb ────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        isDragging.current = true;
        Animated.spring(thumbAnim, {
          toValue: 1.15,
          useNativeDriver: true,
          friction: 8,
        }).start();
      },
      onPanResponderMove: (evt) => {
        if (!isDragging.current || trackWidth <= 0) return;
        const touchX = evt.nativeEvent.locationX;
        const fraction = Math.max(0, Math.min(1, touchX / trackWidth));
        const newRadius = fractionToRadius(fraction);
        setRadius(newRadius);
        radiusRef.current = newRadius;
      },
      onPanResponderRelease: () => {
        isDragging.current = false;
        Animated.spring(thumbAnim, {
          toValue: 1,
          useNativeDriver: true,
          friction: 8,
        }).start();
        // Persist using ref to get the latest value
        expeditionStateStore.setGeofenceRadius(radiusRef.current);
        hapticMicro();
      },
      onPanResponderTerminate: () => {
        isDragging.current = false;
        Animated.spring(thumbAnim, {
          toValue: 1,
          useNativeDriver: true,
          friction: 8,
        }).start();
      },
    })
  ).current;

  // ── Track tap handler (tap anywhere on track to set value) ──
  const handleTrackPress = useCallback((evt: any) => {
    if (trackWidth <= 0) return;
    const touchX = evt.nativeEvent.locationX;
    const fraction = Math.max(0, Math.min(1, touchX / trackWidth));
    const newRadius = fractionToRadius(fraction);
    persistRadius(newRadius);
    hapticMicro();
  }, [trackWidth, persistRadius]);

  // ── Computed values ──────────────────────────────────────
  const fraction = radiusToFraction(radius);
  const thumbLeft = fraction * Math.max(0, trackWidth - 24); // 24 = thumb width
  const activePreset = getPresetMatch(radius);
  const milesStr = metersToMiles(radius);

  if (!visible) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.panelContainer} onPress={(e) => e.stopPropagation()}>
          <View style={styles.panel}>
            {/* ── Header ──────────────────────────────────── */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <Ionicons name="locate-outline" size={16} color={P.gold} />
                <Text style={styles.headerTitle}>Geofence Radius</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
                <Ionicons name="close" size={18} color={P.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.scrollBody}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              {/* ── Description ─────────────────────────────── */}
              <Text style={styles.description}>
                Set the distance from your home/start position that triggers automatic expedition activation and closure.
              </Text>

              {/* ── Map Preview ────────────────────────────── */}
              <GeofenceMapPreview radiusM={radius} />

              {/* ── Current Radius Display ──────────────────── */}
              <View style={styles.radiusDisplay}>
                <View style={styles.radiusValueRow}>
                  <Text style={styles.radiusValue}>{radius}</Text>
                  <Text style={styles.radiusUnit}>m</Text>
                </View>
                <Text style={styles.radiusMiles}>{milesStr} mi</Text>
              </View>

              {/* ── Slider ──────────────────────────────────── */}
              <View style={styles.sliderContainer}>
                <Text style={styles.sliderLabel}>{MIN_RADIUS}m</Text>
                <View
                  style={styles.sliderTrackOuter}
                  onLayout={handleTrackLayout}
                  {...panResponder.panHandlers}
                >
                  <Pressable style={styles.sliderTrackTouchArea} onPress={handleTrackPress}>
                    {/* Background track */}
                    <View style={styles.sliderTrack} />

                    {/* Filled portion */}
                    <View
                      style={[
                        styles.sliderFill,
                        { width: trackWidth > 0 ? `${fraction * 100}%` : '0%' },
                      ]}
                    />

                    {/* Tick marks for presets */}
                    {PRESETS.map((preset) => {
                      const tickFrac = radiusToFraction(preset.value);
                      return (
                        <View
                          key={preset.value}
                          style={[
                            styles.sliderTick,
                            {
                              left: `${tickFrac * 100}%`,
                              backgroundColor: radius >= preset.value ? P.gold : P.textDim,
                            },
                          ]}
                        />
                      );
                    })}

                    {/* Thumb */}
                    {trackWidth > 0 && (
                      <Animated.View
                        style={[
                          styles.sliderThumb,
                          {
                            left: thumbLeft,
                            transform: [{ scale: thumbAnim }],
                          },
                        ]}
                      >
                        <View style={styles.sliderThumbInner} />
                      </Animated.View>
                    )}
                  </Pressable>
                </View>
                <Text style={styles.sliderLabel}>{MAX_RADIUS / 1000}km</Text>
              </View>

              {/* ── Preset Buttons ──────────────────────────── */}
              <Text style={styles.presetsTitle}>PRESETS</Text>
              <View style={styles.presetsGrid}>
                {PRESETS.map((preset) => {
                  const isActive = activePreset === preset.value;
                  return (
                    <TouchableOpacity
                      key={preset.value}
                      style={[
                        styles.presetBtn,
                        isActive && styles.presetBtnActive,
                      ]}
                      onPress={() => handlePreset(preset.value)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={preset.icon}
                        size={16}
                        color={isActive ? P.gold : P.textMuted}
                      />
                      <Text style={[styles.presetValue, isActive && styles.presetValueActive]}>
                        {preset.value}m
                      </Text>
                      <Text style={[styles.presetLabel, isActive && styles.presetLabelActive]}>
                        {preset.label}
                      </Text>
                      <Text style={[styles.presetDesc, isActive && styles.presetDescActive]}>
                        {preset.desc}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* ── Info Footer ─────────────────────────────── */}
              <View style={styles.infoFooter}>
                <Ionicons name="information-circle-outline" size={13} color={P.textDim} />
                <Text style={styles.infoText}>
                  Expedition auto-starts when you exit this radius from your start position, and auto-ends when you return within it. Requires 3 consecutive GPS readings for confirmation.
                </Text>
              </View>
            </ScrollView>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Styles ─────────────────────────────────────────────────
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  panelContainer: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '90%',
  },
  panel: {
    backgroundColor: P.bg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: P.border,
    overflow: 'hidden',
    maxHeight: '100%',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.5,
        shadowRadius: 24,
      },
      android: { elevation: 12 },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.5,
        shadowRadius: 24,
      },
    }),
  },

  // ── Scroll Body ───────────────────────────────────────
  scrollBody: {
    flexShrink: 1,
  },
  scrollContent: {
    paddingBottom: 4,
  },

  // ── Header ────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 0.75,
    borderBottomColor: 'rgba(212,160,23,0.12)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: P.text,
    letterSpacing: 1,
  },
  closeBtn: {
    padding: 4,
  },

  // ── Description ───────────────────────────────────────
  description: {
    fontSize: 11,
    color: P.textMuted,
    lineHeight: 16,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },

  // ── Radius Display ────────────────────────────────────
  radiusDisplay: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  radiusValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  radiusValue: {
    fontSize: 36,
    fontWeight: '800',
    color: P.gold,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    letterSpacing: -1,
  },
  radiusUnit: {
    fontSize: 16,
    fontWeight: '700',
    color: P.goldMuted,
    marginBottom: 2,
  },
  radiusMiles: {
    fontSize: 12,
    fontWeight: '600',
    color: P.textMuted,
    marginTop: 2,
    letterSpacing: 0.5,
  },

  // ── Slider ────────────────────────────────────────────
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 16,
  },
  sliderLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: P.textDim,
    letterSpacing: 0.5,
    minWidth: 28,
    textAlign: 'center',
  },
  sliderTrackOuter: {
    flex: 1,
    height: 40,
    justifyContent: 'center',
  },
  sliderTrackTouchArea: {
    height: 40,
    justifyContent: 'center',
    position: 'relative',
  },
  sliderTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: P.trackBg,
    borderRadius: 2,
  },
  sliderFill: {
    position: 'absolute',
    left: 0,
    height: 4,
    backgroundColor: P.trackFill,
    borderRadius: 2,
  },
  sliderTick: {
    position: 'absolute',
    width: 2,
    height: 10,
    borderRadius: 1,
    top: '50%',
    marginTop: -5,
  },
  sliderThumb: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: P.thumbBg,
    borderWidth: 2,
    borderColor: P.thumbBorder,
    top: '50%',
    marginTop: -12,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.4,
        shadowRadius: 4,
      },
      android: { elevation: 4 },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.4,
        shadowRadius: 4,
      },
    }),
  },
  sliderThumbInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#0B0E12',
  },

  // ── Presets ───────────────────────────────────────────
  presetsTitle: {
    fontSize: 9,
    fontWeight: '800',
    color: P.textDim,
    letterSpacing: 4,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  presetsGrid: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    gap: 6,
    marginBottom: 16,
  },
  presetBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: P.border,
    backgroundColor: P.surface,
    gap: 4,
  },
  presetBtnActive: {
    borderColor: P.borderActive,
    backgroundColor: P.goldSoft,
  },
  presetValue: {
    fontSize: 14,
    fontWeight: '800',
    color: P.textMuted,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  presetValueActive: {
    color: P.gold,
  },
  presetLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: P.textDim,
    letterSpacing: 2,
  },
  presetLabelActive: {
    color: P.goldMuted,
  },
  presetDesc: {
    fontSize: 8,
    fontWeight: '500',
    color: P.textDim,
    textAlign: 'center',
    lineHeight: 11,
  },
  presetDescActive: {
    color: P.textMuted,
  },

  // ── Info Footer ───────────────────────────────────────
  infoFooter: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 4,
  },
  infoText: {
    flex: 1,
    fontSize: 10,
    color: P.textDim,
    lineHeight: 14,
  },
});



