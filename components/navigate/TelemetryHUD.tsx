/**
 * TelemetryHUD — Compact vehicle telemetry overlay (Phase 2.8.3)
 *
 * Displays speed, heading, elevation, fix quality, and stability status.
 * Supports stationary vs moving states with smart detection.
 * Phase 2.8.1: Trail recording badge, distance, elapsed time, avg speed.
 * Phase 2.8.2: Replay mode — shows replay values instead of live GPS.
 * Phase 2.8.3: GPS Position prop — accepts gpsPosition from useGPSLocation
 *   hook for real-time speed (MPH), altitude (ft), heading (deg), and
 *   fix quality indicator (HIGH/MEDIUM/LOW) with colored dot.
 * ECS dark glass styling with gold/amber accents.
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Platform, Animated } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL, TYPO } from '../../lib/theme';
import type { TrailRecordingStatus, TrailStats, TrailReplayPoint } from '../../lib/trailStore';
import type { GPSPosition } from '../../lib/useGPSLocation';

// ── Fix quality type (mirrors GPSLocationOutput) ─────────
type FixQuality = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

interface Props {
  userLocation: { lat: number; lng: number } | null;
  followUser: boolean;
  activeExpeditionName?: string | null;
  visible?: boolean;
  // Phase 2.8.1: Trail recording state
  trailStatus?: TrailRecordingStatus;
  trailStats?: TrailStats | null;
  // Phase 2.8.2: Replay mode
  replayMode?: boolean;
  replayPoint?: TrailReplayPoint | null;
  // Phase 2.8.3: GPS Position from useGPSLocation hook
  gpsPosition?: GPSPosition | null;
  fixQuality?: FixQuality;
}

// ── Heading helpers ──────────────────────────────────────────
const CARDINAL_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
function getCardinal(degrees: number): string {
  const idx = Math.round(degrees / 45) % 8;
  return CARDINAL_DIRECTIONS[idx];
}

// ── Movement detection ───────────────────────────────────────
const MOVEMENT_SPEED_THRESHOLD = 3; // mph
const MOVEMENT_SUSTAIN_MS = 5000;   // 5 seconds sustained

// ── Fix quality colors ───────────────────────────────────────
function getFixQualityColor(quality: FixQuality): string {
  switch (quality) {
    case 'HIGH':   return '#66BB6A'; // green
    case 'MEDIUM': return '#FFB300'; // amber
    case 'LOW':    return '#EF5350'; // red
    case 'NONE':   return '#555';    // dim
    default:       return '#555';
  }
}

function getFixQualityLabel(quality: FixQuality): string {
  switch (quality) {
    case 'HIGH':   return 'HIGH';
    case 'MEDIUM': return 'MED';
    case 'LOW':    return 'LOW';
    case 'NONE':   return 'NO FIX';
    default:       return '—';
  }
}

export default function TelemetryHUD({
  userLocation, followUser, activeExpeditionName, visible = true,
  trailStatus, trailStats, replayMode = false, replayPoint,
  gpsPosition, fixQuality = 'NONE',
}: Props) {
  // Internal fallback state (used when gpsPosition is NOT provided)
  const [internalSpeed, setInternalSpeed] = useState<number | null>(null);
  const [internalHeading, setInternalHeading] = useState<number | null>(null);
  const [internalElevation, setInternalElevation] = useState<number | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [showMovingLabel, setShowMovingLabel] = useState(false);

  // Track position history for speed calculation (internal fallback)
  const lastPos = useRef<{ lat: number; lng: number; time: number } | null>(null);
  const movingStartRef = useRef<number | null>(null);
  const hudOpacity = useRef(new Animated.Value(0)).current;
  const movingLabelOpacity = useRef(new Animated.Value(0)).current;
  const recordPulse = useRef(new Animated.Value(0.4)).current;
  const fixDotPulse = useRef(new Animated.Value(1)).current;

  // Whether we're using the external gpsPosition prop
  const useExternalGPS = gpsPosition != null && !replayMode;

  // ── Derive displayed values from gpsPosition or internal state ──
  const gpsSpeed = useExternalGPS ? (gpsPosition.speedMph != null ? Math.round(gpsPosition.speedMph) : null) : internalSpeed;
  const gpsHeading = useExternalGPS ? (gpsPosition.headingDeg != null ? Math.round(gpsPosition.headingDeg) : null) : internalHeading;
  const gpsElevation = useExternalGPS ? (gpsPosition.altitudeFt != null ? Math.round(gpsPosition.altitudeFt) : null) : internalElevation;

  // Movement detection from GPS speed
  useEffect(() => {
    if (!useExternalGPS || gpsPosition?.speedMph == null) return;
    const currentSpeed = gpsPosition.speedMph;
    const now = Date.now();

    if (currentSpeed > MOVEMENT_SPEED_THRESHOLD) {
      if (!movingStartRef.current) {
        movingStartRef.current = now;
      } else if (now - movingStartRef.current >= MOVEMENT_SUSTAIN_MS && !isMoving) {
        setIsMoving(true);
        setShowMovingLabel(true);
      }
    } else {
      movingStartRef.current = null;
      if (isMoving) setIsMoving(false);
    }
  }, [gpsPosition?.speedMph, useExternalGPS, isMoving]);

  // Fade in/out
  useEffect(() => {
    Animated.timing(hudOpacity, {
      toValue: visible ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [visible, hudOpacity]);

  // Movement label animation
  useEffect(() => {
    if (showMovingLabel) {
      Animated.sequence([
        Animated.timing(movingLabelOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.delay(2500),
        Animated.timing(movingLabelOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start(() => setShowMovingLabel(false));
    }
  }, [showMovingLabel, movingLabelOpacity]);

  // Recording pulse animation
  useEffect(() => {
    if (trailStatus === 'recording' && !replayMode) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(recordPulse, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(recordPulse, { toValue: 0.4, duration: 800, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      recordPulse.setValue(1);
    }
  }, [trailStatus, replayMode, recordPulse]);

  // Fix quality dot pulse (pulses when acquiring/low quality)
  useEffect(() => {
    if (fixQuality === 'NONE' || fixQuality === 'LOW') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(fixDotPulse, { toValue: 0.3, duration: 600, useNativeDriver: true }),
          Animated.timing(fixDotPulse, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      fixDotPulse.setValue(1);
    }
  }, [fixQuality, fixDotPulse]);

  // GPS-based telemetry (internal fallback — only used when gpsPosition is NOT provided)
  useEffect(() => {
    if (useExternalGPS) return; // Skip internal GPS when external is provided
    if (replayMode || !followUser || Platform.OS !== 'web') return;
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, altitude, heading: gpsH, speed: gpsS } = pos.coords;
        const now = Date.now();

        // Elevation (convert meters to feet)
        if (altitude != null) {
          setInternalElevation(Math.round(altitude * 3.28084));
        }

        // Heading from GPS
        if (gpsH != null && gpsH >= 0) {
          setInternalHeading(Math.round(gpsH));
        }

        // Speed from GPS (m/s → mph)
        let currentSpeed = 0;
        if (gpsS != null && gpsS >= 0) {
          currentSpeed = gpsS * 2.237; // m/s to mph
          setInternalSpeed(Math.round(currentSpeed));
        } else if (lastPos.current) {
          // Calculate speed from position delta
          const dt = (now - lastPos.current.time) / 1000; // seconds
          if (dt > 0.5) {
            const dist = haversineMeters(lastPos.current.lat, lastPos.current.lng, latitude, longitude);
            currentSpeed = (dist / dt) * 2.237; // m/s to mph
            setInternalSpeed(Math.round(currentSpeed));

            // Calculate heading from bearing
            if (dist > 2 && internalHeading === null) {
              const brng = bearing(lastPos.current.lat, lastPos.current.lng, latitude, longitude);
              setInternalHeading(Math.round(brng));
            }
          }
        }

        // Movement detection (internal)
        if (!useExternalGPS) {
          if (currentSpeed > MOVEMENT_SPEED_THRESHOLD) {
            if (!movingStartRef.current) {
              movingStartRef.current = now;
            } else if (now - movingStartRef.current >= MOVEMENT_SUSTAIN_MS && !isMoving) {
              setIsMoving(true);
              setShowMovingLabel(true);
            }
          } else {
            movingStartRef.current = null;
            if (isMoving) setIsMoving(false);
          }
        }

        lastPos.current = { lat: latitude, lng: longitude, time: now };
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 2000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [followUser, internalHeading, isMoving, replayMode, useExternalGPS]);

  if (!visible) return null;

  const isTrailActive = (trailStatus === 'recording' || trailStatus === 'paused') && !replayMode;

  // ── Determine displayed values ─────────────────────────────
  const displaySpeed = replayMode && replayPoint
    ? (replayPoint.speed_mph != null ? Math.round(replayPoint.speed_mph) : null)
    : gpsSpeed;
  const displayHeading = replayMode && replayPoint
    ? (replayPoint.heading != null ? Math.round(replayPoint.heading) : null)
    : gpsHeading;
  const displayElevation = replayMode && replayPoint
    ? replayPoint.elevation_ft
    : gpsElevation;

  // Fix quality color
  const fqColor = getFixQualityColor(fixQuality);
  const fqLabel = getFixQualityLabel(fixQuality);

  return (
    <Animated.View style={[styles.container, { opacity: hudOpacity }]} pointerEvents="none">
      {/* Replay mode badge */}
      {replayMode && (
        <View style={styles.replayBadge}>
          <Ionicons name="play-circle-outline" size={10} color="#4A90D9" />
          <Text style={styles.replayBadgeText}>REPLAY MODE</Text>
          {replayPoint && (
            <>
              <View style={styles.trailBadgeSep} />
              <Text style={styles.replayTimeText}>
                {new Date(replayPoint.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </Text>
            </>
          )}
        </View>
      )}

      {/* Movement detected label */}
      {showMovingLabel && !replayMode && (
        <Animated.View style={[styles.movingLabel, { opacity: movingLabelOpacity }]}>
          <View style={styles.movingDot} />
          <Text style={styles.movingText}>MOVEMENT DETECTED</Text>
        </Animated.View>
      )}

      {/* Trail recording badge */}
      {isTrailActive && (
        <Animated.View style={[
          styles.trailBadge,
          trailStatus === 'paused' && styles.trailBadgePaused,
          { opacity: trailStatus === 'recording' ? recordPulse : 1 },
        ]}>
          <View style={[
            styles.trailRecDot,
            { backgroundColor: trailStatus === 'recording' ? '#EF5350' : TACTICAL.amber },
          ]} />
          <Text style={[
            styles.trailBadgeText,
            { color: trailStatus === 'recording' ? '#EF5350' : TACTICAL.amber },
          ]}>
            {trailStatus === 'recording' ? 'REC' : 'PAUSED'}
          </Text>
          {trailStats && (
            <>
              <View style={styles.trailBadgeSep} />
              <Text style={styles.trailStatText}>
                {trailStats.distance_miles.toFixed(1)} MI
              </Text>
              <View style={styles.trailBadgeSep} />
              <Text style={styles.trailStatText}>
                {trailStats.elapsed_formatted}
              </Text>
              {trailStats.avg_speed_mph > 0 && (
                <>
                  <View style={styles.trailBadgeSep} />
                  <Text style={styles.trailStatText}>
                    {trailStats.avg_speed_mph.toFixed(1)} AVG
                  </Text>
                </>
              )}
            </>
          )}
        </Animated.View>
      )}

      {/* ═══════════ HUD METRICS — REDESIGNED LAYOUT ═══════════ */}
      <View style={[
        styles.hudRow,
        isMoving && !replayMode && styles.hudRowMoving,
        replayMode && styles.hudRowReplay,
      ]}>
        {/* ── PRIMARY: Speed (large) ── */}
        <View style={styles.speedPrimary}>
          <Text style={[
            styles.speedValue,
            replayMode && styles.metricValueReplay,
            (displaySpeed != null && displaySpeed > 0) && styles.speedValueActive,
          ]}>
            {displaySpeed != null ? displaySpeed : '—'}
          </Text>
          <Text style={styles.speedUnit}>MPH</Text>
        </View>

        <View style={styles.metricDividerTall} />

        {/* ── SECONDARY: Heading ── */}
        <View style={styles.metricSecondary}>
          <View style={styles.metricSecondaryRow}>
            <Ionicons name="compass-outline" size={9} color={TACTICAL.textMuted} />
            <Text style={[styles.metricSecondaryValue, replayMode && styles.metricValueReplay]}>
              {displayHeading != null ? `${displayHeading}°` : '—'}
            </Text>
          </View>
          <Text style={styles.metricSecondaryLabel}>
            {displayHeading != null ? getCardinal(displayHeading) : 'HDG'}
          </Text>
        </View>

        <View style={styles.metricDivider} />

        {/* ── SECONDARY: Altitude ── */}
        <View style={styles.metricSecondary}>
          <View style={styles.metricSecondaryRow}>
            <Ionicons name="trending-up-outline" size={9} color={TACTICAL.textMuted} />
            <Text style={[styles.metricSecondaryValue, replayMode && styles.metricValueReplay]}>
              {displayElevation != null ? displayElevation.toLocaleString() : '—'}
            </Text>
          </View>
          <Text style={styles.metricSecondaryLabel}>FT ALT</Text>
        </View>

        <View style={styles.metricDivider} />

        {/* ── FIX QUALITY INDICATOR ── */}
        <View style={styles.fixQualityCell}>
          {replayMode ? (
            <>
              <View style={[styles.fixDot, { backgroundColor: '#4A90D9' }]} />
              <Text style={[styles.fixLabel, { color: '#4A90D9' }]}>REPLAY</Text>
            </>
          ) : (
            <>
              <Animated.View style={[
                styles.fixDot,
                { backgroundColor: fqColor, opacity: fixDotPulse },
              ]} />
              <Text style={[styles.fixLabel, { color: fqColor }]}>{fqLabel}</Text>
              {gpsPosition?.accuracyM != null && fixQuality !== 'NONE' && (
                <Text style={styles.fixAccuracy}>
                  {Math.round(gpsPosition.accuracyM)}m
                </Text>
              )}
            </>
          )}
        </View>
      </View>

      {/* Active expedition badge */}
      {activeExpeditionName && !replayMode && (
        <View style={styles.expBadge}>
          <View style={styles.expBadgeDot} />
          <Text style={styles.expBadgeText} numberOfLines={1}>{activeExpeditionName}</Text>
        </View>
      )}
    </Animated.View>
  );
}

// ── Geo helpers ──────────────────────────────────────────────
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
    Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    zIndex: 25,
    alignItems: 'flex-start',
    gap: 4,
  },

  // ── Replay badge ───────────────────────────────────────────
  replayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(11,15,18,0.92)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(74,144,217,0.4)',
    marginBottom: 2,
  },
  replayBadgeText: {
    ...TYPO.U2,
    fontSize: 7,
    color: '#4A90D9',
    letterSpacing: 3,
  },
  replayTimeText: {
    fontFamily: 'Courier',
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.text,
    letterSpacing: 0.5,
  },

  movingLabel: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(11,15,18,0.92)',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 6, borderWidth: 1, borderColor: 'rgba(196,138,44,0.4)',
    marginBottom: 2,
  },
  movingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: TACTICAL.amber },
  movingText: { ...TYPO.U2, fontSize: 7, color: TACTICAL.amber, letterSpacing: 3 },

  // ── Trail recording badge ──────────────────────────────────
  trailBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(11,15,18,0.92)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(239,83,80,0.4)',
    marginBottom: 2,
  },
  trailBadgePaused: {
    borderColor: 'rgba(196,138,44,0.4)',
  },
  trailRecDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  trailBadgeText: {
    ...TYPO.U2,
    fontSize: 7,
    letterSpacing: 3,
  },
  trailBadgeSep: {
    width: 1,
    height: 10,
    backgroundColor: 'rgba(62,79,60,0.3)',
    marginHorizontal: 1,
  },
  trailStatText: {
    fontFamily: 'Courier',
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.text,
    letterSpacing: 0.5,
  },

  // ── HUD Row ────────────────────────────────────────────────
  hudRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
    backgroundColor: 'rgba(11,15,18,0.90)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.35)',
    paddingHorizontal: 2,
    paddingVertical: 4,
  },
  hudRowMoving: {
    borderColor: 'rgba(196,138,44,0.4)',
    backgroundColor: 'rgba(11,15,18,0.94)',
  },
  hudRowReplay: {
    borderColor: 'rgba(74,144,217,0.35)',
    backgroundColor: 'rgba(11,15,18,0.92)',
  },

  // ── PRIMARY: Speed (large) ─────────────────────────────────
  speedPrimary: {
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 2,
    gap: 0,
    minWidth: 52,
  },
  speedValue: {
    fontFamily: 'Courier',
    fontSize: 22,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 1,
    lineHeight: 24,
  },
  speedValueActive: {
    color: TACTICAL.amber,
  },
  speedUnit: {
    ...TYPO.U2,
    fontSize: 7,
    color: TACTICAL.textMuted,
    letterSpacing: 3,
    marginTop: -1,
  },

  // ── SECONDARY: Heading / Altitude ──────────────────────────
  metricSecondary: {
    alignItems: 'center',
    paddingHorizontal: 7,
    gap: 1,
    minWidth: 42,
  },
  metricSecondaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metricSecondaryValue: {
    fontFamily: 'Courier',
    fontSize: 12,
    fontWeight: '700',
    color: TACTICAL.text,
    letterSpacing: 0.5,
  },
  metricSecondaryLabel: {
    ...TYPO.U2,
    fontSize: 6,
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },

  metricValueReplay: {
    color: '#B8D4F0',
  },

  // ── Dividers ───────────────────────────────────────────────
  metricDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(62,79,60,0.3)',
  },
  metricDividerTall: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(62,79,60,0.4)',
  },

  // ── Fix Quality Cell ───────────────────────────────────────
  fixQualityCell: {
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 2,
    minWidth: 38,
  },
  fixDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginBottom: 1,
  },
  fixLabel: {
    ...TYPO.U2,
    fontSize: 6,
    letterSpacing: 2,
  },
  fixAccuracy: {
    fontFamily: 'Courier',
    fontSize: 7,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 0.3,
    marginTop: -1,
  },

  // ── Expedition badge ───────────────────────────────────────
  expBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(11,15,18,0.85)',
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 5, borderWidth: 1, borderColor: 'rgba(102,187,106,0.25)',
  },
  expBadgeDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#66BB6A' },
  expBadgeText: { ...TYPO.U2, fontSize: 6, color: '#66BB6A', letterSpacing: 2, maxWidth: 120 },
});



