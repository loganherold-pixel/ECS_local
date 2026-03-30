/**
 * RoutePolyline — Phase 1 Polyline Renderer (no SVG dependency)
 *
 * Renders run points as a canvas-style polyline using absolute-positioned Views.
 * No external dependencies required.
 *
 * Phase 2 will swap this for Mapbox tile rendering.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TACTICAL, TYPO, DENSITY } from '../../lib/theme';
import type { RunPoint } from '../../lib/runStore';

interface Props {
  points: RunPoint[];
  width?: number;
  height?: number;
  padding?: number;
}

const DEFAULT_WIDTH = 340;
const DEFAULT_HEIGHT = 220;
const DEFAULT_PADDING = 24;

export default function RoutePolyline({
  points,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  padding = DEFAULT_PADDING,
}: Props) {
  const normalized = useMemo(() => {
    if (points.length < 2) return [];
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    for (const p of points) {
      minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
      minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng);
    }
    const latR = maxLat - minLat || 0.001;
    const lngR = maxLng - minLng || 0.001;
    minLat -= latR * 0.1; maxLat += latR * 0.1;
    minLng -= lngR * 0.1; maxLng += lngR * 0.1;
    const dW = width - padding * 2;
    const dH = height - padding * 2;
    return points.map(p => ({
      x: padding + ((p.lng - minLng) / (maxLng - minLng)) * dW,
      y: padding + ((maxLat - p.lat) / (maxLat - minLat)) * dH,
    }));
  }, [points, width, height, padding]);

  if (points.length < 2) {
    return (
      <View style={[styles.container, { width, height }]}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>NO ROUTE DATA</Text>
        </View>
      </View>
    );
  }

  // Draw line segments as thin absolute-positioned views
  const segments: React.ReactNode[] = [];
  for (let i = 1; i < normalized.length; i++) {
    const p1 = normalized[i - 1];
    const p2 = normalized[i];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.5) continue;
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    segments.push(
      <View
        key={i}
        style={{
          position: 'absolute',
          left: p1.x,
          top: p1.y - 1,
          width: len,
          height: 2.5,
          backgroundColor: TACTICAL.amber,
          transform: [{ rotate: `${angle}deg` }],
          transformOrigin: '0 50%',
          opacity: 0.9,
        }}
      />
    );
  }

  const startPt = normalized[0];
  const endPt = normalized[normalized.length - 1];

  return (
    <View style={[styles.container, { width, height }]}>
      {/* Grid lines */}
      {Array.from({ length: Math.floor((width - padding * 2) / 30) + 1 }).map((_, i) => (
        <View key={`v${i}`} style={{ position: 'absolute', left: padding + i * 30, top: padding, width: 0.5, height: height - padding * 2, backgroundColor: 'rgba(62,79,60,0.15)' }} />
      ))}
      {Array.from({ length: Math.floor((height - padding * 2) / 30) + 1 }).map((_, i) => (
        <View key={`h${i}`} style={{ position: 'absolute', left: padding, top: padding + i * 30, width: width - padding * 2, height: 0.5, backgroundColor: 'rgba(62,79,60,0.15)' }} />
      ))}

      {/* Route segments */}
      {segments}

      {/* Start marker */}
      <View style={[styles.marker, { left: startPt.x - 6, top: startPt.y - 6, backgroundColor: 'rgba(102,187,106,0.25)' }]}>
        <View style={[styles.markerInner, { backgroundColor: '#66BB6A' }]} />
      </View>
      <Text style={[styles.markerLabel, { left: startPt.x - 14, top: startPt.y - 18, color: '#66BB6A' }]}>START</Text>

      {/* End marker */}
      <View style={[styles.marker, { left: endPt.x - 6, top: endPt.y - 6, backgroundColor: 'rgba(239,83,80,0.25)' }]}>
        <View style={[styles.markerInner, { backgroundColor: '#EF5350' }]} />
      </View>
      <Text style={[styles.markerLabel, { left: endPt.x - 10, top: endPt.y + 10, color: '#EF5350' }]}>END</Text>

      {/* Point count */}
      <Text style={styles.ptCount}>{points.length} PTS</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: DENSITY.borderDefault,
    borderColor: TACTICAL.border,
    backgroundColor: TACTICAL.panel,
    position: 'relative',
  },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { ...TYPO.T4, color: TACTICAL.textMuted, fontSize: 9 },
  marker: { position: 'absolute', width: 12, height: 12, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  markerInner: { width: 6, height: 6, borderRadius: 3 },
  markerLabel: { position: 'absolute', fontSize: 7, fontWeight: '700', letterSpacing: 2 },
  ptCount: { position: 'absolute', bottom: 4, right: 8, fontSize: 7, color: 'rgba(138,138,133,0.5)', letterSpacing: 1 },
});



