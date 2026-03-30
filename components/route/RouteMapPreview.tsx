/**
 * RouteMapPreview — Visual route map on a coordinate grid
 *
 * Renders imported GPX track segments and waypoints on a simple
 * coordinate grid (no external map tiles). Shows:
 *   - Route path as a polyline (line segments)
 *   - Waypoint markers with labels (tappable for selection)
 *   - Type-specific colored markers (camp, water, fuel, hazard, etc.)
 *   - Distance labels between key segments
 *   - Coordinate grid with lat/lon axis labels
 *   - Elevation profile chart below
 *   - Add-mode: tap grid to place new waypoint (crosshair + pending marker)
 *
 * Supports interactive waypoint selection synced with WaypointEditor.
 *
 * Pure React Native — no SVG library required.
 * Uses TACTICAL theme + TYPO tokens.
 */
import React, { useMemo, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  LayoutChangeEvent,
  TouchableOpacity,
  Pressable,
  GestureResponderEvent,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL, TYPO, DENSITY } from '../../lib/theme';
import type { ImportedRoute, RouteSegment, RouteWaypoint } from '../../lib/routeStore';
import {
  getWaypointTypeConfig,
  DEFAULT_WAYPOINT_COLOR,
  DEFAULT_WAYPOINT_BG,
  type RouteWaypointType,
} from '../../lib/waypointTypes';
import ElevationProfile from './ElevationProfile';

// ── Helpers ──────────────────────────────────────────────

interface Point2D {
  x: number;
  y: number;
  lat: number;
  lon: number;
  ele: number | null;
  distFromStart: number;
}

/** Haversine distance in miles */
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Downsample an array to at most `max` items, preserving first and last */
function downsample<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const result: T[] = [arr[0]];
  const step = (arr.length - 1) / (max - 1);
  for (let i = 1; i < max - 1; i++) {
    result.push(arr[Math.round(i * step)]);
  }
  result.push(arr[arr.length - 1]);
  return result;
}

/** Format short coordinate */
function fmtShort(val: number, isLat: boolean): string {
  const dir = isLat ? (val >= 0 ? 'N' : 'S') : (val >= 0 ? 'E' : 'W');
  return `${Math.abs(val).toFixed(2)}°${dir}`;
}

// ── Component ────────────────────────────────────────────

interface Props {
  route: ImportedRoute;
  selectedWaypointIndex?: number | null;
  onWaypointPress?: (index: number) => void;
  /** Add-mode: when true, tapping the grid reports lat/lon via onMapTap */
  isAddMode?: boolean;
  onMapTap?: (lat: number, lon: number) => void;
  /** Pending waypoint to show as a ghost marker on the map */
  pendingWaypoint?: { lat: number; lon: number } | null;
}

export default function RouteMapPreview({
  route,
  selectedWaypointIndex = null,
  onWaypointPress,
  isAddMode = false,
  onMapTap,
  pendingWaypoint = null,
}: Props) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [expanded, setExpanded] = useState(true);
  const gridRef = useRef<View>(null);

  const onLayout = (e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  };

  // ── Process route data ──────────────────────────────────
  const processed = useMemo(() => {
    if (containerWidth < 50) return null;

    // Collect all track points from all segments
    const allTrackPts: { lat: number; lon: number; ele: number | null }[] = [];
    for (const seg of route.segments) {
      for (const pt of seg.points) {
        allTrackPts.push(pt);
      }
    }

    if (allTrackPts.length < 2) return null;

    // Compute bounding box
    let minLat = Infinity, maxLat = -Infinity;
    let minLon = Infinity, maxLon = -Infinity;
    for (const pt of allTrackPts) {
      if (pt.lat < minLat) minLat = pt.lat;
      if (pt.lat > maxLat) maxLat = pt.lat;
      if (pt.lon < minLon) minLon = pt.lon;
      if (pt.lon > maxLon) maxLon = pt.lon;
    }
    // Include waypoints in bounds
    for (const wp of route.waypoints) {
      if (wp.lat < minLat) minLat = wp.lat;
      if (wp.lat > maxLat) maxLat = wp.lat;
      if (wp.lon < minLon) minLon = wp.lon;
      if (wp.lon > maxLon) maxLon = wp.lon;
    }
    // Include pending waypoint in bounds
    if (pendingWaypoint) {
      if (pendingWaypoint.lat < minLat) minLat = pendingWaypoint.lat;
      if (pendingWaypoint.lat > maxLat) maxLat = pendingWaypoint.lat;
      if (pendingWaypoint.lon < minLon) minLon = pendingWaypoint.lon;
      if (pendingWaypoint.lon > maxLon) maxLon = pendingWaypoint.lon;
    }

    // Add padding to bounds (12%)
    const latRange = maxLat - minLat || 0.01;
    const lonRange = maxLon - minLon || 0.01;
    const latPad = latRange * 0.12;
    const lonPad = lonRange * 0.12;
    minLat -= latPad;
    maxLat += latPad;
    minLon -= lonPad;
    maxLon += lonPad;

    // Chart dimensions
    const GRID_PAD_LEFT = 48;
    const GRID_PAD_RIGHT = 12;
    const GRID_PAD_TOP = 12;
    const GRID_PAD_BOTTOM = 24;
    const mapW = containerWidth - GRID_PAD_LEFT - GRID_PAD_RIGHT;
    const aspectRatio = (maxLat - minLat) / ((maxLon - minLon) * Math.cos(((minLat + maxLat) / 2) * Math.PI / 180));
    const mapH = Math.max(140, Math.min(280, mapW * Math.min(aspectRatio, 1.2)));
    const totalH = mapH + GRID_PAD_TOP + GRID_PAD_BOTTOM;

    // Projection: lon → x, lat → y (lat is inverted: higher lat = lower y)
    const toX = (lon: number) => GRID_PAD_LEFT + ((lon - minLon) / (maxLon - minLon)) * mapW;
    const toY = (lat: number) => GRID_PAD_TOP + (1 - (lat - minLat) / (maxLat - minLat)) * mapH;

    // Inverse projection: x → lon, y → lat
    const toLon = (x: number) => minLon + ((x - GRID_PAD_LEFT) / mapW) * (maxLon - minLon);
    const toLat = (y: number) => minLat + (1 - (y - GRID_PAD_TOP) / mapH) * (maxLat - minLat);

    // Downsample track points for rendering
    const maxPts = Math.min(allTrackPts.length, 300);
    const sampled = downsample(allTrackPts, maxPts);

    // Build projected points with cumulative distance
    let cumDist = 0;
    const projectedPts: Point2D[] = sampled.map((pt, i) => {
      if (i > 0) {
        cumDist += haversine(sampled[i - 1].lat, sampled[i - 1].lon, pt.lat, pt.lon);
      }
      return {
        x: toX(pt.lon),
        y: toY(pt.lat),
        lat: pt.lat,
        lon: pt.lon,
        ele: pt.ele,
        distFromStart: cumDist,
      };
    });

    // Build line segments for the polyline
    const lineSegs: { x1: number; y1: number; x2: number; y2: number; dist: number }[] = [];
    for (let i = 1; i < projectedPts.length; i++) {
      const p1 = projectedPts[i - 1];
      const p2 = projectedPts[i];
      lineSegs.push({
        x1: p1.x, y1: p1.y,
        x2: p2.x, y2: p2.y,
        dist: p2.distFromStart - p1.distFromStart,
      });
    }

    // Distance labels at intervals
    const totalDist = route.total_distance_miles;
    const labelInterval = Math.max(0.5, totalDist / 5);
    let nextLabelDist = labelInterval;
    const distLabels: { x: number; y: number; text: string }[] = [];

    if (projectedPts.length > 0) {
      distLabels.push({
        x: projectedPts[0].x,
        y: projectedPts[0].y,
        text: 'START',
      });
    }

    for (const pt of projectedPts) {
      if (pt.distFromStart >= nextLabelDist) {
        distLabels.push({
          x: pt.x,
          y: pt.y,
          text: `${pt.distFromStart.toFixed(1)} mi`,
        });
        nextLabelDist += labelInterval;
      }
    }

    if (projectedPts.length > 1) {
      const last = projectedPts[projectedPts.length - 1];
      distLabels.push({
        x: last.x,
        y: last.y,
        text: `${totalDist.toFixed(1)} mi`,
      });
    }

    // Project waypoints
    const projWaypoints = route.waypoints.map((wp, idx) => ({
      x: toX(wp.lon),
      y: toY(wp.lat),
      name: wp.name,
      lat: wp.lat,
      lon: wp.lon,
      index: idx,
    }));

    // Grid lines
    const latTicks: number[] = [];
    const lonTicks: number[] = [];
    const latStep = (maxLat - minLat) / 4;
    const lonStep = (maxLon - minLon) / 4;
    for (let i = 0; i <= 4; i++) {
      latTicks.push(minLat + i * latStep);
      lonTicks.push(minLon + i * lonStep);
    }

    // Elevation profile data
    const elePoints: { distanceMiles: number; elevationFt: number }[] = [];
    const hasElevation = allTrackPts.some(p => p.ele != null);
    if (hasElevation) {
      let cd = 0;
      for (let i = 0; i < allTrackPts.length; i++) {
        if (i > 0) {
          cd += haversine(allTrackPts[i - 1].lat, allTrackPts[i - 1].lon, allTrackPts[i].lat, allTrackPts[i].lon);
        }
        if (allTrackPts[i].ele != null) {
          elePoints.push({
            distanceMiles: cd,
            elevationFt: allTrackPts[i].ele! * 3.281,
          });
        }
      }
    }

    // Project pending waypoint
    const projPending = pendingWaypoint
      ? { x: toX(pendingWaypoint.lon), y: toY(pendingWaypoint.lat) }
      : null;

    return {
      projectedPts,
      lineSegs,
      distLabels,
      projWaypoints,
      latTicks,
      lonTicks,
      mapW,
      mapH,
      totalH,
      GRID_PAD_LEFT,
      GRID_PAD_TOP,
      GRID_PAD_BOTTOM,
      GRID_PAD_RIGHT,
      toX,
      toY,
      toLon,
      toLat,
      elePoints,
      hasElevation,
      totalDist,
      minLat,
      maxLat,
      minLon,
      maxLon,
      projPending,
    };
  }, [route, containerWidth, pendingWaypoint]);

  // ── Handle map grid tap (add mode) ─────────────────────
  const handleGridPress = useCallback((e: GestureResponderEvent) => {
    if (!isAddMode || !onMapTap || !processed || !gridRef.current) return;

    // Get tap position relative to the grid container
    const { locationX, locationY } = e.nativeEvent;

    // Clamp to grid area
    const x = Math.max(processed.GRID_PAD_LEFT, Math.min(locationX, processed.GRID_PAD_LEFT + processed.mapW));
    const y = Math.max(processed.GRID_PAD_TOP, Math.min(locationY, processed.GRID_PAD_TOP + processed.mapH));

    const lat = processed.toLat(y);
    const lon = processed.toLon(x);

    onMapTap(
      Math.round(lat * 1000000) / 1000000,
      Math.round(lon * 1000000) / 1000000
    );
  }, [isAddMode, onMapTap, processed]);

  return (
    <View style={styles.outerContainer} onLayout={onLayout}>
      {/* Section header */}
      <TouchableOpacity
        style={styles.sectionHeader}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <Ionicons name="map-outline" size={14} color={TACTICAL.amber} />
        <Text style={styles.sectionTitle}>ROUTE MAP</Text>
        {isAddMode && (
          <View style={styles.addModeBadge}>
            <Ionicons name="add-circle" size={10} color={TACTICAL.amber} />
            <Text style={styles.addModeBadgeText}>ADD MODE</Text>
          </View>
        )}
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={TACTICAL.textMuted}
        />
      </TouchableOpacity>

      {expanded && containerWidth > 0 && processed && (
        <>
          {/* Map Card */}
          <View style={[styles.mapCard, isAddMode && styles.mapCardAddMode]}>
            {/* Route name badge */}
            <View style={styles.routeBadge}>
              <View style={styles.routeBadgeDot} />
              <Text style={styles.routeBadgeText} numberOfLines={1}>
                {route.name}
              </Text>
              <Text style={styles.routeBadgeMeta}>
                {route.total_distance_miles.toFixed(1)} MI
              </Text>
            </View>

            {/* Add-mode instruction banner */}
            {isAddMode && (
              <View style={styles.addModeInstructionBanner}>
                <Ionicons name="locate-outline" size={14} color={TACTICAL.amber} />
                <Text style={styles.addModeInstructionText}>
                  TAP THE GRID TO PLACE A NEW WAYPOINT
                </Text>
              </View>
            )}

            {/* Coordinate Grid — wrapped in Pressable for add mode */}
            <Pressable
              ref={gridRef}
              onPress={isAddMode ? handleGridPress : undefined}
              style={[
                styles.gridContainer,
                { height: processed.totalH },
                isAddMode && styles.gridContainerAddMode,
              ]}
            >
              {/* Lat grid lines (horizontal) + labels */}
              {processed.latTicks.map((lat, i) => {
                const y = processed.toY(lat);
                return (
                  <React.Fragment key={`lat-${i}`}>
                    <View
                      style={[
                        styles.gridLine,
                        {
                          top: y,
                          left: processed.GRID_PAD_LEFT,
                          width: processed.mapW,
                          height: 1,
                        },
                      ]}
                    />
                    <Text
                      style={[
                        styles.axisLabel,
                        {
                          top: y - 6,
                          left: 0,
                          width: processed.GRID_PAD_LEFT - 4,
                          textAlign: 'right',
                        },
                      ]}
                    >
                      {fmtShort(lat, true)}
                    </Text>
                  </React.Fragment>
                );
              })}

              {/* Lon grid lines (vertical) + labels */}
              {processed.lonTicks.map((lon, i) => {
                const x = processed.toX(lon);
                return (
                  <React.Fragment key={`lon-${i}`}>
                    <View
                      style={[
                        styles.gridLine,
                        {
                          left: x,
                          top: processed.GRID_PAD_TOP,
                          width: 1,
                          height: processed.mapH,
                        },
                      ]}
                    />
                    {i % 2 === 0 && (
                      <Text
                        style={[
                          styles.axisLabel,
                          {
                            top: processed.GRID_PAD_TOP + processed.mapH + 4,
                            left: x - 24,
                            width: 48,
                            textAlign: 'center',
                          },
                        ]}
                      >
                        {fmtShort(lon, false)}
                      </Text>
                    )}
                  </React.Fragment>
                );
              })}

              {/* Route glow */}
              {processed.lineSegs.map((seg, i) => {
                const dx = seg.x2 - seg.x1;
                const dy = seg.y2 - seg.y1;
                const len = Math.sqrt(dx * dx + dy * dy);
                if (len < 0.5) return null;
                const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                const midX = (seg.x1 + seg.x2) / 2;
                const midY = (seg.y1 + seg.y2) / 2;

                return (
                  <View
                    key={`glow-${i}`}
                    style={[
                      styles.routeGlow,
                      {
                        left: midX - len / 2,
                        top: midY - 3,
                        width: len,
                        transform: [{ rotate: `${angle}deg` }],
                      },
                    ]}
                  />
                );
              })}

              {/* Route polyline segments */}
              {processed.lineSegs.map((seg, i) => {
                const dx = seg.x2 - seg.x1;
                const dy = seg.y2 - seg.y1;
                const len = Math.sqrt(dx * dx + dy * dy);
                if (len < 0.5) return null;
                const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                const midX = (seg.x1 + seg.x2) / 2;
                const midY = (seg.y1 + seg.y2) / 2;

                return (
                  <View
                    key={`seg-${i}`}
                    style={[
                      styles.routeLine,
                      {
                        left: midX - len / 2,
                        top: midY - 1,
                        width: len,
                        transform: [{ rotate: `${angle}deg` }],
                      },
                    ]}
                  />
                );
              })}

              {/* Track point dots (sparse) */}
              {downsample(processed.projectedPts, 40).map((pt, i) => (
                <View
                  key={`dot-${i}`}
                  style={[
                    styles.trackDot,
                    {
                      left: pt.x - 1.5,
                      top: pt.y - 1.5,
                    },
                  ]}
                />
              ))}

              {/* Start marker */}
              {processed.projectedPts.length > 0 && (
                <View
                  style={[
                    styles.startMarker,
                    {
                      left: processed.projectedPts[0].x - 6,
                      top: processed.projectedPts[0].y - 6,
                    },
                  ]}
                >
                  <View style={styles.startMarkerInner} />
                </View>
              )}

              {/* End marker */}
              {processed.projectedPts.length > 1 && (
                <View
                  style={[
                    styles.endMarker,
                    {
                      left: processed.projectedPts[processed.projectedPts.length - 1].x - 5,
                      top: processed.projectedPts[processed.projectedPts.length - 1].y - 5,
                    },
                  ]}
                >
                  <View style={styles.endMarkerInner} />
                </View>
              )}

              {/* Waypoint markers — tappable with type-specific colors */}
              {processed.projWaypoints.map((wp, i) => {
                const isSelected = selectedWaypointIndex === wp.index;
                const wpData = route.waypoints[wp.index];
                const typeConfig = wpData?.waypointType
                  ? getWaypointTypeConfig(wpData.waypointType)
                  : null;
                const markerColor = typeConfig?.color || DEFAULT_WAYPOINT_COLOR;
                const markerBg = typeConfig?.bgColor || DEFAULT_WAYPOINT_BG;

                return (
                  <React.Fragment key={`wp-${i}`}>
                    {/* Selection ring */}
                    {isSelected && (
                      <View
                        style={[
                          styles.wpSelectionRing,
                          {
                            left: wp.x - 12,
                            top: wp.y - 12,
                            borderColor: markerColor + '50',
                            backgroundColor: markerColor + '10',
                          },
                        ]}
                      />
                    )}

                    {/* Tappable waypoint marker */}
                    <TouchableOpacity
                      style={[
                        styles.wpTouchTarget,
                        {
                          left: wp.x - 16,
                          top: wp.y - 16,
                        },
                      ]}
                      onPress={() => onWaypointPress?.(wp.index)}
                      activeOpacity={0.7}
                      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    >
                      {isSelected ? (
                        <View
                          style={[
                            styles.waypointMarkerSelected,
                            {
                              backgroundColor: markerColor,
                              borderColor: markerColor,
                            },
                          ]}
                        >
                          {typeConfig ? (
                            <View style={{ transform: [{ rotate: '-45deg' }] }}>
                              <Ionicons
                                name={typeConfig.icon as any}
                                size={7}
                                color="#0B0F12"
                              />
                            </View>
                          ) : (
                            <View style={styles.waypointDotSelected} />
                          )}
                        </View>
                      ) : (
                        <View
                          style={[
                            styles.waypointMarker,
                            {
                              backgroundColor: markerBg,
                              borderColor: markerColor,
                            },
                          ]}
                        >
                          {typeConfig ? (
                            <View style={{ transform: [{ rotate: '-45deg' }] }}>
                              <Ionicons
                                name={typeConfig.icon as any}
                                size={5}
                                color={markerColor}
                              />
                            </View>
                          ) : (
                            <View
                              style={[
                                styles.waypointDot,
                                { backgroundColor: markerColor },
                              ]}
                            />
                          )}
                        </View>
                      )}
                    </TouchableOpacity>

                    {/* Waypoint label */}
                    {wp.name && (
                      <Text
                        style={[
                          styles.waypointLabel,
                          { color: markerColor },
                          isSelected && [
                            styles.waypointLabelSelected,
                            { color: markerColor },
                          ],
                          {
                            left: wp.x + (isSelected ? 10 : 6),
                            top: wp.y - 5,
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {wp.name}
                      </Text>
                    )}

                    {/* Type badge for typed waypoints (non-selected) */}
                    {!isSelected && typeConfig && !wp.name && (
                      <Text
                        style={[
                          styles.waypointLabel,
                          { color: markerColor },
                          {
                            left: wp.x + 6,
                            top: wp.y - 5,
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {typeConfig.shortLabel}
                      </Text>
                    )}

                    {/* Index number for selected waypoint */}
                    {isSelected && (
                      <View
                        style={[
                          styles.wpIndexBubble,
                          {
                            left: wp.x - 20,
                            top: wp.y - 22,
                            backgroundColor: markerColor,
                          },
                        ]}
                      >
                        <Text style={styles.wpIndexBubbleText}>{wp.index + 1}</Text>
                      </View>
                    )}
                  </React.Fragment>
                );
              })}


              {/* Pending waypoint marker (ghost/crosshair for add mode) */}
              {processed.projPending && isAddMode && (
                <>
                  {/* Crosshair horizontal line */}
                  <View
                    style={[
                      styles.crosshairH,
                      {
                        left: processed.projPending.x - 12,
                        top: processed.projPending.y,
                        width: 24,
                      },
                    ]}
                  />
                  {/* Crosshair vertical line */}
                  <View
                    style={[
                      styles.crosshairV,
                      {
                        left: processed.projPending.x,
                        top: processed.projPending.y - 12,
                        height: 24,
                      },
                    ]}
                  />
                  {/* Pending marker outer ring */}
                  <View
                    style={[
                      styles.pendingMarkerOuter,
                      {
                        left: processed.projPending.x - 10,
                        top: processed.projPending.y - 10,
                      },
                    ]}
                  />
                  {/* Pending marker inner diamond */}
                  <View
                    style={[
                      styles.pendingMarkerInner,
                      {
                        left: processed.projPending.x - 5,
                        top: processed.projPending.y - 5,
                      },
                    ]}
                  >
                    <View style={styles.pendingMarkerDot} />
                  </View>
                  {/* Coordinate label */}
                  <View
                    style={[
                      styles.pendingCoordLabel,
                      {
                        left: processed.projPending.x + 14,
                        top: processed.projPending.y - 12,
                      },
                    ]}
                  >
                    <Text style={styles.pendingCoordText}>
                      {pendingWaypoint!.lat.toFixed(4)}°, {pendingWaypoint!.lon.toFixed(4)}°
                    </Text>
                  </View>
                </>
              )}

              {/* Distance labels along route */}
              {processed.distLabels.map((label, i) => {
                const isStart = i === 0;
                const isEnd = i === processed.distLabels.length - 1;
                return (
                  <View
                    key={`dlabel-${i}`}
                    style={[
                      styles.distLabelContainer,
                      {
                        left: label.x - (isStart ? 0 : isEnd ? 36 : 18),
                        top: label.y + (isStart || isEnd ? 10 : -16),
                      },
                    ]}
                  >
                    <Text style={[
                      styles.distLabelText,
                      isStart && styles.distLabelStart,
                      isEnd && styles.distLabelEnd,
                    ]}>
                      {label.text}
                    </Text>
                  </View>
                );
              })}

              {/* Compass indicator */}
              <View style={styles.compass}>
                <Text style={styles.compassN}>N</Text>
                <Ionicons name="navigate" size={10} color={TACTICAL.textMuted} />
              </View>
            </Pressable>

            {/* Legend */}
            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendSwatch, { backgroundColor: TACTICAL.amber }]} />
                <Text style={styles.legendText}>TRACK</Text>
              </View>
              {route.waypoints.length > 0 && (
                <View style={styles.legendItem}>
                  <View style={[styles.legendDiamond, { borderColor: '#66BB6A' }]} />
                  <Text style={styles.legendText}>WAYPOINT</Text>
                </View>
              )}
              <View style={styles.legendItem}>
                <View style={[styles.legendCircle, { backgroundColor: '#66BB6A' }]} />
                <Text style={styles.legendText}>START</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendSquare, { backgroundColor: TACTICAL.danger }]} />
                <Text style={styles.legendText}>END</Text>
              </View>
              {isAddMode && (
                <Text style={styles.legendHintAdd}>TAP GRID TO PLACE</Text>
              )}
              {!isAddMode && onWaypointPress && route.waypoints.length > 0 && (
                <Text style={styles.legendHint}>TAP WAYPOINT TO SELECT</Text>
              )}
            </View>
          </View>

          {/* Elevation Profile */}
          {processed.hasElevation && processed.elePoints.length > 2 && (
            <View style={styles.elevationContainer}>
              <ElevationProfile
                points={processed.elePoints}
                width={containerWidth}
                height={130}
                totalDistanceMiles={processed.totalDist}
              />
            </View>
          )}

          {/* Segment breakdown */}
          {route.segment_count > 0 && (
            <View style={styles.segmentBreakdown}>
              <Text style={styles.segBreakdownTitle}>SEGMENT BREAKDOWN</Text>
              {route.segments.map((seg, i) => {
                let segDist = 0;
                for (let j = 1; j < seg.points.length; j++) {
                  segDist += haversine(
                    seg.points[j - 1].lat, seg.points[j - 1].lon,
                    seg.points[j].lat, seg.points[j].lon
                  );
                }
                const hasEle = seg.points.some(p => p.ele != null);
                let segGain = 0;
                if (hasEle) {
                  for (let j = 1; j < seg.points.length; j++) {
                    if (seg.points[j].ele != null && seg.points[j - 1].ele != null) {
                      const diff = seg.points[j].ele! - seg.points[j - 1].ele!;
                      if (diff > 0) segGain += diff;
                    }
                  }
                }
                return (
                  <View key={`segrow-${i}`} style={styles.segRow}>
                    <View style={styles.segRowLeft}>
                      <View style={styles.segDot} />
                      <Text style={styles.segName}>SEGMENT {i + 1}</Text>
                    </View>
                    <View style={styles.segRowRight}>
                      <Text style={styles.segStat}>{segDist.toFixed(1)} mi</Text>
                      <Text style={styles.segStatDivider}>|</Text>
                      <Text style={styles.segStat}>{seg.points.length} pts</Text>
                      {hasEle && (
                        <>
                          <Text style={styles.segStatDivider}>|</Text>
                          <Text style={styles.segStat}>+{Math.round(segGain * 3.281)} ft</Text>
                        </>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </>
      )}

      {expanded && containerWidth > 0 && !processed && (
        <View style={styles.noDataCard}>
          <Ionicons name="map-outline" size={24} color={TACTICAL.textMuted} />
          <Text style={styles.noDataText}>
            Route has insufficient track data to render a map preview.
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────

const styles = StyleSheet.create({
  outerContainer: {
    marginBottom: DENSITY.sectionGap,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: DENSITY.titleBodyGap,
    paddingVertical: 4,
  },
  sectionTitle: {
    ...TYPO.T4,
    color: TACTICAL.amber,
    flex: 1,
  },

  // Add mode badge in header
  addModeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(196,138,44,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '40',
  },
  addModeBadgeText: {
    ...TYPO.U2,
    fontSize: 7,
    color: TACTICAL.amber,
    letterSpacing: 3,
  },

  // Map card
  mapCard: {
    backgroundColor: TACTICAL.panel,
    borderRadius: 12,
    borderWidth: DENSITY.borderDefault,
    borderColor: TACTICAL.border,
    overflow: 'hidden',
  },
  mapCardAddMode: {
    borderColor: TACTICAL.amber + '50',
    borderWidth: 1.5,
  },
  routeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: DENSITY.cardPad,
    paddingTop: DENSITY.cardPad,
    paddingBottom: 6,
  },
  routeBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: TACTICAL.amber,
  },
  routeBadgeText: {
    ...TYPO.T3,
    color: TACTICAL.text,
    flex: 1,
  },
  routeBadgeMeta: {
    ...TYPO.K3,
    color: TACTICAL.amber,
  },

  // Add mode instruction banner
  addModeInstructionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: DENSITY.cardPad,
    marginBottom: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(196,138,44,0.08)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '25',
  },
  addModeInstructionText: {
    ...TYPO.U2,
    fontSize: 8,
    color: TACTICAL.amber,
    letterSpacing: 3,
    flex: 1,
  },

  // Grid
  gridContainer: {
    position: 'relative',
    marginHorizontal: 4,
  },
  gridContainerAddMode: {
    // Subtle cursor hint styling
  },
  gridLine: {
    position: 'absolute',
    backgroundColor: 'rgba(62,79,60,0.18)',
  },
  axisLabel: {
    position: 'absolute',
    ...TYPO.U2,
    fontSize: 7,
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },

  // Route line
  routeLine: {
    position: 'absolute',
    height: 2,
    backgroundColor: TACTICAL.amber,
    zIndex: 5,
  },
  routeGlow: {
    position: 'absolute',
    height: 6,
    backgroundColor: 'rgba(196,138,44,0.12)',
    borderRadius: 3,
    zIndex: 3,
  },

  // Track dots
  trackDot: {
    position: 'absolute',
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(196,138,44,0.5)',
    zIndex: 6,
  },

  // Start marker
  startMarker: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(102,187,106,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  startMarkerInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#66BB6A',
  },

  // End marker
  endMarker: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: 'rgba(192,57,43,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  endMarkerInner: {
    width: 5,
    height: 5,
    borderRadius: 1,
    backgroundColor: TACTICAL.danger,
  },

  // Waypoint markers — default state
  waypointMarker: {
    width: 8,
    height: 8,
    borderRadius: 1,
    transform: [{ rotate: '45deg' }],
    backgroundColor: 'rgba(102,187,106,0.2)',
    borderWidth: 1,
    borderColor: '#66BB6A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waypointDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#66BB6A',
    transform: [{ rotate: '-45deg' }],
  },

  // Waypoint markers — selected state
  waypointMarkerSelected: {
    width: 12,
    height: 12,
    borderRadius: 2,
    transform: [{ rotate: '45deg' }],
    backgroundColor: TACTICAL.amber,
    borderWidth: 1.5,
    borderColor: TACTICAL.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waypointDotSelected: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#0B0F12',
    transform: [{ rotate: '-45deg' }],
  },

  // Selection ring
  wpSelectionRing: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: TACTICAL.amber + '50',
    backgroundColor: 'rgba(196,138,44,0.08)',
    zIndex: 7,
  },

  // Tappable touch target
  wpTouchTarget: {
    position: 'absolute',
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },

  // Index bubble
  wpIndexBubble: {
    position: 'absolute',
    backgroundColor: TACTICAL.amber,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    zIndex: 21,
  },
  wpIndexBubbleText: {
    ...TYPO.K3,
    fontSize: 8,
    color: '#0B0F12',
    fontWeight: '700',
  },

  waypointLabel: {
    position: 'absolute',
    ...TYPO.U2,
    fontSize: 7,
    color: '#66BB6A',
    letterSpacing: 1,
    maxWidth: 80,
    zIndex: 9,
  },
  waypointLabelSelected: {
    color: TACTICAL.amber,
    fontWeight: '700',
    fontSize: 8,
    letterSpacing: 2,
  },

  // Pending waypoint (add mode) — crosshair + ghost marker
  crosshairH: {
    position: 'absolute',
    height: 1,
    backgroundColor: TACTICAL.amber + '80',
    zIndex: 25,
  },
  crosshairV: {
    position: 'absolute',
    width: 1,
    backgroundColor: TACTICAL.amber + '80',
    zIndex: 25,
  },
  pendingMarkerOuter: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: TACTICAL.amber + '60',
    borderStyle: 'dashed',
    zIndex: 26,
  },
  pendingMarkerInner: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 1,
    transform: [{ rotate: '45deg' }],
    backgroundColor: TACTICAL.amber + '40',
    borderWidth: 1.5,
    borderColor: TACTICAL.amber,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 27,
  },
  pendingMarkerDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: TACTICAL.amber,
    transform: [{ rotate: '-45deg' }],
  },
  pendingCoordLabel: {
    position: 'absolute',
    backgroundColor: 'rgba(18,24,29,0.9)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '40',
    zIndex: 28,
  },
  pendingCoordText: {
    ...TYPO.K3,
    fontSize: 8,
    color: TACTICAL.amber,
    letterSpacing: 0.5,
  },

  // Distance labels
  distLabelContainer: {
    position: 'absolute',
    zIndex: 12,
    backgroundColor: 'rgba(18,24,29,0.85)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  distLabelText: {
    ...TYPO.U2,
    fontSize: 7,
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  distLabelStart: {
    color: '#66BB6A',
  },
  distLabelEnd: {
    color: TACTICAL.amber,
  },

  // Compass
  compass: {
    position: 'absolute',
    top: 4,
    right: 8,
    alignItems: 'center',
    zIndex: 15,
  },
  compassN: {
    ...TYPO.U2,
    fontSize: 7,
    color: TACTICAL.textMuted,
    letterSpacing: 1,
    marginBottom: 1,
  },

  // Legend
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: DENSITY.cardPad,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(62,79,60,0.15)',
    flexWrap: 'wrap',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendSwatch: {
    width: 12,
    height: 2,
    borderRadius: 1,
  },
  legendDiamond: {
    width: 6,
    height: 6,
    borderRadius: 1,
    borderWidth: 1,
    transform: [{ rotate: '45deg' }],
  },
  legendCircle: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendSquare: {
    width: 5,
    height: 5,
    borderRadius: 1,
  },
  legendText: {
    ...TYPO.U2,
    fontSize: 7,
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
  legendHint: {
    ...TYPO.U2,
    fontSize: 7,
    color: TACTICAL.amber + '80',
    letterSpacing: 2,
    marginLeft: 'auto',
  },
  legendHintAdd: {
    ...TYPO.U2,
    fontSize: 7,
    color: TACTICAL.amber,
    letterSpacing: 2,
    marginLeft: 'auto',
    fontWeight: '700',
  },

  // Elevation container
  elevationContainer: {
    marginTop: DENSITY.cardGap,
  },

  // Segment breakdown
  segmentBreakdown: {
    backgroundColor: TACTICAL.panel,
    borderRadius: 12,
    borderWidth: DENSITY.borderDefault,
    borderColor: TACTICAL.border,
    padding: DENSITY.cardPad,
    marginTop: DENSITY.cardGap,
  },
  segBreakdownTitle: {
    ...TYPO.T4,
    color: TACTICAL.amber,
    marginBottom: DENSITY.titleBodyGap,
  },
  segRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62,79,60,0.12)',
  },
  segRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  segDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: TACTICAL.amber,
  },
  segName: {
    ...TYPO.U2,
    fontSize: 9,
    color: TACTICAL.text,
    letterSpacing: 3,
  },
  segRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  segStat: {
    ...TYPO.K3,
    fontSize: 10,
    color: TACTICAL.textMuted,
  },
  segStatDivider: {
    ...TYPO.B2,
    fontSize: 8,
    color: 'rgba(62,79,60,0.4)',
  },

  // No data
  noDataCard: {
    backgroundColor: TACTICAL.panel,
    borderRadius: 12,
    borderWidth: DENSITY.borderDefault,
    borderColor: TACTICAL.border,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  noDataText: {
    ...TYPO.B2,
    textAlign: 'center',
  },
});



