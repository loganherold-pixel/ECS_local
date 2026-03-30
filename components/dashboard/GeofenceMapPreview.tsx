/**
 * GeofenceMapPreview — Visual radius preview for GeofenceRadiusPanel
 *
 * Pure React Native View-based visualization (no react-native-svg).
 * Shows:
 *   - Center home pin marker
 *   - Proportional geofence radius circle (scales with slider)
 *   - Cardinal direction labels (N, S, E, W)
 *   - Home coordinates (lat/lng) when available
 *   - Distance reference rings at 25%, 50%, 75% of max radius
 *   - Radius label on the circle edge
 *
 * Updates in real-time as the user adjusts the slider.
 */
import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
} from 'react-native';
import { expeditionStateStore } from '../../lib/expeditionStateStore';

// ── Palette ────────────────────────────────────────────────
const C = {
  bg: '#0D1014',
  gridLine: 'rgba(212,160,23,0.06)',
  ringStroke: 'rgba(212,160,23,0.12)',
  radiusCircleBorder: 'rgba(212,160,23,0.55)',
  radiusCircleFill: 'rgba(212,160,23,0.06)',
  radiusCircleGlow: 'rgba(212,160,23,0.10)',
  pinOuter: '#D4A017',
  pinInner: '#0D1014',
  pinGlow: 'rgba(212,160,23,0.25)',
  cardinal: 'rgba(212,160,23,0.35)',
  cardinalActive: 'rgba(212,160,23,0.6)',
  coordText: 'rgba(139,148,158,0.6)',
  coordLabel: 'rgba(139,148,158,0.35)',
  ringLabel: 'rgba(139,148,158,0.3)',
  radiusLabel: '#D4A017',
  radiusLabelBg: 'rgba(13,16,20,0.85)',
  crosshair: 'rgba(212,160,23,0.08)',
};

// ── Constants ──────────────────────────────────────────────
const CONTAINER_SIZE = 200;
const CENTER = CONTAINER_SIZE / 2;
const MAX_VISUAL_RADIUS = (CONTAINER_SIZE / 2) - 24; // Leave room for labels
const MIN_VISUAL_RADIUS = 18;
const MIN_RADIUS = 100;
const MAX_RADIUS = 2000;

interface GeofenceMapPreviewProps {
  /** Current geofence radius in meters */
  radiusM: number;
}

// ── Helpers ────────────────────────────────────────────────
function formatCoord(val: number, isLat: boolean): string {
  const dir = isLat ? (val >= 0 ? 'N' : 'S') : (val >= 0 ? 'E' : 'W');
  return `${Math.abs(val).toFixed(5)}${dir}`;
}

function radiusToVisual(radiusM: number): number {
  // Map 100m–2000m to MIN_VISUAL_RADIUS–MAX_VISUAL_RADIUS
  const fraction = (radiusM - MIN_RADIUS) / (MAX_RADIUS - MIN_RADIUS);
  const clamped = Math.max(0, Math.min(1, fraction));
  return MIN_VISUAL_RADIUS + clamped * (MAX_VISUAL_RADIUS - MIN_VISUAL_RADIUS);
}

export default function GeofenceMapPreview({ radiusM }: GeofenceMapPreviewProps) {
  // ── Home position from store ──────────────────────────────
  const homePos = useMemo(() => {
    return expeditionStateStore.getHomeGeofence();
  }, []);

  const visualRadius = radiusToVisual(radiusM);

  // Reference rings at 25%, 50%, 75% of container
  const ringFractions = [0.25, 0.5, 0.75];
  const ringRadii = ringFractions.map(f => f * MAX_VISUAL_RADIUS);

  // Ring labels (approximate meter values at each ring)
  const ringLabels = ringFractions.map(f => {
    const meters = Math.round(MIN_RADIUS + f * (MAX_RADIUS - MIN_RADIUS));
    return meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${meters}m`;
  });

  return (
    <View style={styles.wrapper}>
      {/* ── Map Container ──────────────────────────────────── */}
      <View style={styles.container}>
        {/* Background grid lines (crosshair) */}
        <View style={[styles.crosshairH, { top: CENTER }]} />
        <View style={[styles.crosshairV, { left: CENTER }]} />

        {/* Diagonal crosshairs for extra tactical feel */}
        <View style={[styles.diagLine, {
          top: CENTER,
          left: CENTER,
          width: CONTAINER_SIZE * 0.7,
          transform: [
            { translateX: -(CONTAINER_SIZE * 0.35) },
            { rotate: '45deg' },
          ],
        }]} />
        <View style={[styles.diagLine, {
          top: CENTER,
          left: CENTER,
          width: CONTAINER_SIZE * 0.7,
          transform: [
            { translateX: -(CONTAINER_SIZE * 0.35) },
            { rotate: '-45deg' },
          ],
        }]} />

        {/* Reference distance rings */}
        {ringRadii.map((r, i) => (
          <View
            key={`ring-${i}`}
            style={[
              styles.referenceRing,
              {
                width: r * 2,
                height: r * 2,
                borderRadius: r,
                top: CENTER - r,
                left: CENTER - r,
              },
            ]}
          />
        ))}

        {/* Ring labels (right side of each ring) */}
        {ringRadii.map((r, i) => (
          <View
            key={`ring-label-${i}`}
            style={[
              styles.ringLabelContainer,
              {
                top: CENTER - 6,
                left: CENTER + r + 2,
              },
            ]}
          >
            <Text style={styles.ringLabelText}>{ringLabels[i]}</Text>
          </View>
        ))}

        {/* ── Geofence Radius Circle (main) ──────────────── */}
        {/* Outer glow */}
        <View
          style={[
            styles.radiusGlow,
            {
              width: (visualRadius + 4) * 2,
              height: (visualRadius + 4) * 2,
              borderRadius: visualRadius + 4,
              top: CENTER - visualRadius - 4,
              left: CENTER - visualRadius - 4,
            },
          ]}
        />

        {/* Main radius circle */}
        <View
          style={[
            styles.radiusCircle,
            {
              width: visualRadius * 2,
              height: visualRadius * 2,
              borderRadius: visualRadius,
              top: CENTER - visualRadius,
              left: CENTER - visualRadius,
            },
          ]}
        />

        {/* ── Radius Label (on circle edge, top) ─────────── */}
        <View
          style={[
            styles.radiusLabelContainer,
            {
              top: CENTER - visualRadius - 10,
              left: CENTER - 24,
            },
          ]}
        >
          <View style={styles.radiusLabelBg}>
            <Text style={styles.radiusLabelText}>
              {radiusM >= 1000 ? `${(radiusM / 1000).toFixed(1)}km` : `${radiusM}m`}
            </Text>
          </View>
        </View>

        {/* ── Center Pin (home position) ─────────────────── */}
        {/* Pin glow */}
        <View
          style={[
            styles.pinGlow,
            {
              top: CENTER - 10,
              left: CENTER - 10,
            },
          ]}
        />
        {/* Pin outer ring */}
        <View
          style={[
            styles.pinOuter,
            {
              top: CENTER - 6,
              left: CENTER - 6,
            },
          ]}
        />
        {/* Pin inner dot */}
        <View
          style={[
            styles.pinInner,
            {
              top: CENTER - 3,
              left: CENTER - 3,
            },
          ]}
        />

        {/* ── Cardinal Direction Labels ──────────────────── */}
        <Text style={[styles.cardinal, styles.cardinalN]}>N</Text>
        <Text style={[styles.cardinal, styles.cardinalS]}>S</Text>
        <Text style={[styles.cardinal, styles.cardinalE]}>E</Text>
        <Text style={[styles.cardinal, styles.cardinalW]}>W</Text>

        {/* ── Intercardinal tick marks ────────────────────── */}
        <View style={[styles.tickMark, { top: 14, left: CENTER + 28, transform: [{ rotate: '45deg' }] }]} />
        <View style={[styles.tickMark, { top: 14, left: CENTER - 30, transform: [{ rotate: '-45deg' }] }]} />
        <View style={[styles.tickMark, { bottom: 14, left: CENTER + 28, transform: [{ rotate: '-45deg' }] }]} />
        <View style={[styles.tickMark, { bottom: 14, left: CENTER - 30, transform: [{ rotate: '45deg' }] }]} />
      </View>

      {/* ── Coordinates Display ─────────────────────────────── */}
      <View style={styles.coordRow}>
        {homePos ? (
          <>
            <View style={styles.coordItem}>
              <Text style={styles.coordLabel}>LAT</Text>
              <Text style={styles.coordValue}>{formatCoord(homePos.lat, true)}</Text>
            </View>
            <View style={styles.coordDivider} />
            <View style={styles.coordItem}>
              <Text style={styles.coordLabel}>LNG</Text>
              <Text style={styles.coordValue}>{formatCoord(homePos.lng, false)}</Text>
            </View>
          </>
        ) : (
          <View style={styles.coordItem}>
            <Text style={styles.coordLabel}>HOME POSITION</Text>
            <Text style={styles.coordValueDim}>Awaiting GPS fix</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────
const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    paddingVertical: 8,
  },

  container: {
    width: CONTAINER_SIZE,
    height: CONTAINER_SIZE,
    borderRadius: 12,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: 'rgba(42,46,52,0.6)',
    overflow: 'hidden',
    position: 'relative',
  },

  // ── Crosshair lines ───────────────────────────────────
  crosshairH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 0.5,
    backgroundColor: C.crosshair,
  },
  crosshairV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 0.5,
    backgroundColor: C.crosshair,
  },
  diagLine: {
    position: 'absolute',
    height: 0.5,
    backgroundColor: C.crosshair,
  },

  // ── Reference rings ───────────────────────────────────
  referenceRing: {
    position: 'absolute',
    borderWidth: 0.5,
    borderColor: C.ringStroke,
    borderStyle: 'dashed',
  },

  ringLabelContainer: {
    position: 'absolute',
  },
  ringLabelText: {
    fontSize: 6,
    fontWeight: '600',
    color: C.ringLabel,
    letterSpacing: 0.3,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },

  // ── Geofence radius circle ────────────────────────────
  radiusGlow: {
    position: 'absolute',
    backgroundColor: C.radiusCircleGlow,
  },
  radiusCircle: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: C.radiusCircleBorder,
    backgroundColor: C.radiusCircleFill,
  },

  // ── Radius label ──────────────────────────────────────
  radiusLabelContainer: {
    position: 'absolute',
    width: 48,
    alignItems: 'center',
    zIndex: 10,
  },
  radiusLabelBg: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 3,
    backgroundColor: C.radiusLabelBg,
    borderWidth: 0.5,
    borderColor: 'rgba(212,160,23,0.3)',
  },
  radiusLabelText: {
    fontSize: 8,
    fontWeight: '800',
    color: C.radiusLabel,
    letterSpacing: 0.5,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    textAlign: 'center',
  },

  // ── Center pin ────────────────────────────────────────
  pinGlow: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: C.pinGlow,
    zIndex: 5,
  },
  pinOuter: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: C.pinOuter,
    zIndex: 6,
    ...Platform.select({
      ios: {
        shadowColor: C.pinOuter,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 4,
      },
      android: { elevation: 3 },
      default: {
        shadowColor: C.pinOuter,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 4,
      },
    }),
  },
  pinInner: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.pinInner,
    zIndex: 7,
  },

  // ── Cardinal labels ───────────────────────────────────
  cardinal: {
    position: 'absolute',
    fontSize: 9,
    fontWeight: '800',
    color: C.cardinal,
    letterSpacing: 2,
    zIndex: 8,
  },
  cardinalN: {
    top: 4,
    left: CENTER - 5,
    color: C.cardinalActive,
  },
  cardinalS: {
    bottom: 4,
    left: CENTER - 4,
  },
  cardinalE: {
    right: 6,
    top: CENTER - 6,
  },
  cardinalW: {
    left: 5,
    top: CENTER - 6,
  },

  // ── Intercardinal tick marks ──────────────────────────
  tickMark: {
    position: 'absolute',
    width: 4,
    height: 0.5,
    backgroundColor: C.cardinal,
  },

  // ── Coordinates row ───────────────────────────────────
  coordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    gap: 12,
  },
  coordItem: {
    alignItems: 'center',
    gap: 1,
  },
  coordLabel: {
    fontSize: 7,
    fontWeight: '800',
    color: C.coordLabel,
    letterSpacing: 2,
  },
  coordValue: {
    fontSize: 9,
    fontWeight: '600',
    color: C.coordText,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    letterSpacing: 0.3,
  },
  coordValueDim: {
    fontSize: 9,
    fontWeight: '500',
    color: 'rgba(139,148,158,0.35)',
    fontStyle: 'italic',
  },
  coordDivider: {
    width: 1,
    height: 16,
    backgroundColor: 'rgba(42,46,52,0.5)',
  },
});



