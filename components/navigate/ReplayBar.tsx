/**
 * ReplayBar — Expedition Replay Timeline (Phase 2.8.2)
 *
 * Bottom-docked replay controls with:
 *   - Play/Pause button
 *   - Scrubbable timeline slider
 *   - Time label (HH:MM:SS)
 *   - Speed selector (1x, 2x, 5x, 10x)
 *   - Speed heatmap toggle (green/yellow/red trail coloring)
 *   - Safe area padding, never covers bottom menu
 *
 * ECS dark glass styling with amber accents.
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Platform, Animated,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL, TYPO, DENSITY } from '../../lib/theme';
import type { TrailReplayPoint } from '../../lib/trailStore';
import { hapticMicro } from '../../lib/haptics';

export type ReplaySpeed = 1 | 2 | 5 | 10;

/** Speed heatmap color thresholds */
export const SPEED_HEATMAP_COLORS = {
  slow: '#66BB6A',    // green  — < 15 mph
  medium: '#FFB300',  // yellow — 15–35 mph
  fast: '#EF5350',    // red    — > 35 mph
} as const;

interface Props {
  visible: boolean;
  /** Total elapsed seconds of the trail */
  totalSeconds: number;
  /** Total point count */
  totalPoints: number;
  /** Current elapsed seconds position */
  currentSeconds: number;
  /** Current replay point data */
  currentPoint: TrailReplayPoint | null;
  /** Is replay playing */
  isPlaying: boolean;
  /** Current playback speed */
  speed: ReplaySpeed;
  /** Whether speed heatmap is active */
  showHeatmap?: boolean;
  /** Callbacks */
  onPlay: () => void;
  onPause: () => void;
  onSeek: (seconds: number) => void;
  onSpeedChange: (speed: ReplaySpeed) => void;
  onExit: () => void;
  /** Toggle speed heatmap visualization */
  onToggleHeatmap?: () => void;
}

const SPEEDS: ReplaySpeed[] = [1, 2, 5, 10];

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function ReplayBar({
  visible, totalSeconds, totalPoints, currentSeconds, currentPoint,
  isPlaying, speed, showHeatmap = false, onPlay, onPause, onSeek,
  onSpeedChange, onExit, onToggleHeatmap,
}: Props) {
  const slideAnim = useRef(new Animated.Value(visible ? 0 : 100)).current;
  const [sliderWidth, setSliderWidth] = useState(200);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: visible ? 0 : 100,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [visible, slideAnim]);

  const progress = totalSeconds > 0 ? Math.min(currentSeconds / totalSeconds, 1) : 0;
  const progressWidth = progress * sliderWidth;

  // ── Slider touch handling (web) ────────────────────────────
  const handleSliderPress = useCallback((e: any) => {
    if (Platform.OS !== 'web') return;
    const rect = e.target.getBoundingClientRect?.();
    if (!rect) return;
    const x = (e.nativeEvent?.pageX ?? e.pageX) - rect.left;
    const ratio = Math.max(0, Math.min(x / rect.width, 1));
    onSeek(Math.round(ratio * totalSeconds));
  }, [totalSeconds, onSeek]);

  const handleSliderLayout = useCallback((e: any) => {
    setSliderWidth(e.nativeEvent.layout.width);
  }, []);

  const cycleSpeed = useCallback(() => {
    hapticMicro();
    const idx = SPEEDS.indexOf(speed);
    const next = SPEEDS[(idx + 1) % SPEEDS.length];
    onSpeedChange(next);
  }, [speed, onSpeedChange]);

  const handleToggleHeatmap = useCallback(() => {
    hapticMicro();
    onToggleHeatmap?.();
  }, [onToggleHeatmap]);

  if (!visible) return null;

  // Determine speed color for current point's speed indicator
  const currentSpeedColor = currentPoint?.speed_mph != null
    ? (currentPoint.speed_mph < 15 ? SPEED_HEATMAP_COLORS.slow
      : currentPoint.speed_mph <= 35 ? SPEED_HEATMAP_COLORS.medium
      : SPEED_HEATMAP_COLORS.fast)
    : TACTICAL.textMuted;

  return (
    <Animated.View style={[
      styles.container,
      { transform: [{ translateY: slideAnim }] },
    ]}>
      {/* ── Top row: REPLAY MODE badge + Heatmap toggle + Exit ── */}
      <View style={styles.topRow}>
        <View style={styles.replayBadge}>
          <Ionicons name="play-circle-outline" size={12} color="#4A90D9" />
          <Text style={styles.replayBadgeText}>REPLAY MODE</Text>
        </View>

        {/* Speed Heatmap Toggle */}
        {onToggleHeatmap && (
          <TouchableOpacity
            style={[
              styles.heatmapToggle,
              showHeatmap && styles.heatmapToggleActive,
            ]}
            onPress={handleToggleHeatmap}
            activeOpacity={0.8}
          >
            <Ionicons
              name="speedometer-outline"
              size={12}
              color={showHeatmap ? '#fff' : TACTICAL.textMuted}
            />
            <Text style={[
              styles.heatmapToggleText,
              showHeatmap && styles.heatmapToggleTextActive,
            ]}>
              SPEED
            </Text>
          </TouchableOpacity>
        )}

        {currentPoint && (
          <Text style={styles.distanceLabel}>
            {currentPoint.cumulative_distance_mi.toFixed(2)} MI
          </Text>
        )}
        <TouchableOpacity style={styles.exitBtn} onPress={onExit} activeOpacity={0.8}>
          <Ionicons name="close" size={14} color={TACTICAL.textMuted} />
          <Text style={styles.exitText}>EXIT</Text>
        </TouchableOpacity>
      </View>

      {/* ── Speed heatmap legend (when active) ─────────────── */}
      {showHeatmap && (
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: SPEED_HEATMAP_COLORS.slow }]} />
            <Text style={styles.legendLabel}>{'<'}15 MPH</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: SPEED_HEATMAP_COLORS.medium }]} />
            <Text style={styles.legendLabel}>15–35 MPH</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: SPEED_HEATMAP_COLORS.fast }]} />
            <Text style={styles.legendLabel}>{'>'}35 MPH</Text>
          </View>
        </View>
      )}

      {/* ── Slider row ─────────────────────────────────────── */}
      <View style={styles.sliderRow}>
        {/* Play/Pause */}
        <TouchableOpacity
          style={styles.playBtn}
          onPress={() => {
            hapticMicro();
            if (isPlaying) {
              onPause();
            } else {
              onPlay();
            }
          }}
          activeOpacity={0.8}
        >
          <Ionicons
            name={isPlaying ? 'pause' : 'play'}
            size={18}
            color={TACTICAL.amber}
          />
        </TouchableOpacity>

        {/* Time label */}
        <Text style={styles.timeLabel}>{formatTime(currentSeconds)}</Text>

        {/* Slider track */}
        <TouchableOpacity
          style={styles.sliderTrack}
          onLayout={handleSliderLayout}
          onPress={handleSliderPress}
          activeOpacity={1}
        >
          {/* Background track */}
          <View style={styles.sliderBg} />
          
          {/* Ghost trail (full) */}
          <View style={[styles.sliderGhost, { width: '100%' }]} />
          
          {/* Progress fill */}
          <View style={[styles.sliderFill, { width: progressWidth }]} />
          
          {/* Thumb */}
          <View style={[styles.sliderThumb, { left: Math.max(0, progressWidth - 6) }]} />
        </TouchableOpacity>

        {/* Total time */}
        <Text style={styles.timeLabel}>{formatTime(totalSeconds)}</Text>

        {/* Speed selector */}
        <TouchableOpacity style={styles.speedBtn} onPress={cycleSpeed} activeOpacity={0.8}>
          <Text style={styles.speedText}>{speed}x</Text>
        </TouchableOpacity>
      </View>

      {/* ── Info row ───────────────────────────────────────── */}
      {currentPoint && (
        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <Text style={[
              styles.infoValue,
              showHeatmap && { color: currentSpeedColor },
            ]}>
              {currentPoint.speed_mph != null ? Math.round(currentPoint.speed_mph) : '—'}
            </Text>
            <Text style={styles.infoUnit}>MPH</Text>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoItem}>
            <Text style={styles.infoValue}>
              {currentPoint.heading != null ? `${Math.round(currentPoint.heading)}°` : '—'}
            </Text>
            <Text style={styles.infoUnit}>HDG</Text>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoItem}>
            <Text style={styles.infoValue}>
              {currentPoint.elevation_ft != null ? currentPoint.elevation_ft.toLocaleString() : '—'}
            </Text>
            <Text style={styles.infoUnit}>FT</Text>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoItem}>
            <Text style={styles.infoValue}>
              {new Date(currentPoint.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
            <Text style={styles.infoUnit}>TIME</Text>
          </View>
        </View>
      )}
    </Animated.View>
  );
}


const styles = StyleSheet.create({
  container: {
    marginHorizontal: DENSITY.screenPad,
    marginBottom: DENSITY.cardGap,
    backgroundColor: 'rgba(12,18,24,0.95)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(74,144,217,0.3)',
    padding: 12,
    gap: 8,
    // Subtle blue glow for replay mode
    shadowColor: '#4A90D9',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  replayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(74,144,217,0.3)',
    backgroundColor: 'rgba(74,144,217,0.08)',
  },
  replayBadgeText: {
    ...TYPO.U2,
    fontSize: 7,
    color: '#4A90D9',
    letterSpacing: 3,
  },
  distanceLabel: {
    fontFamily: 'Courier',
    fontSize: 11,
    fontWeight: '700',
    color: TACTICAL.text,
    letterSpacing: 0.5,
  },
  exitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  exitText: {
    ...TYPO.U2,
    fontSize: 7,
    color: TACTICAL.textMuted,
    letterSpacing: 3,
  },

  // ── Slider row ─────────────────────────────────────────────
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: TACTICAL.amber + '50',
    backgroundColor: 'rgba(196,138,44,0.1)',
  },
  timeLabel: {
    fontFamily: 'Courier',
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
    minWidth: 40,
    textAlign: 'center',
  },
  sliderTrack: {
    flex: 1,
    height: 28,
    justifyContent: 'center',
    position: 'relative',
  },
  sliderBg: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(62,79,60,0.3)',
  },
  sliderGhost: {
    position: 'absolute',
    left: 0,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(196,138,44,0.12)',
  },
  sliderFill: {
    position: 'absolute',
    left: 0,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#4A90D9',
  },
  sliderThumb: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4A90D9',
    borderWidth: 2,
    borderColor: '#fff',
    top: 8,
    shadowColor: '#4A90D9',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 4,
  },
  speedBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '40',
    backgroundColor: 'rgba(196,138,44,0.08)',
    minWidth: 36,
    alignItems: 'center',
  },
  speedText: {
    fontFamily: 'Courier',
    fontSize: 11,
    fontWeight: '700',
    color: TACTICAL.amber,
    letterSpacing: 0.5,
  },

  // ── Info row ───────────────────────────────────────────────
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(62,79,60,0.2)',
  },
  infoItem: {
    flex: 1,
    alignItems: 'center',
    gap: 1,
  },
  infoValue: {
    fontFamily: 'Courier',
    fontSize: 12,
    fontWeight: '700',
    color: TACTICAL.text,
    letterSpacing: 0.5,
  },
  infoUnit: {
    ...TYPO.U2,
    fontSize: 6,
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
  infoDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(62,79,60,0.2)',
  },


  // ── Heatmap toggle ─────────────────────────────────────────
  heatmapToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: 'rgba(62,79,60,0.06)',
  },
  heatmapToggleActive: {
    borderColor: 'rgba(102,187,106,0.5)',
    backgroundColor: 'rgba(102,187,106,0.15)',
  },
  heatmapToggleText: {
    ...TYPO.U2,
    fontSize: 7,
    color: TACTICAL.textMuted,
    letterSpacing: 3,
  },
  heatmapToggleTextActive: {
    color: '#66BB6A',
  },

  // ── Speed legend ───────────────────────────────────────────
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(62,79,60,0.08)',
    borderRadius: 6,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 4,
    borderRadius: 2,
  },
  legendLabel: {
    fontFamily: 'Courier',
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },
});



