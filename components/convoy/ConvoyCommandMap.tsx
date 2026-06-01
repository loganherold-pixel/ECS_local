import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../context/ThemeContext';
import {
  initializeMapboxAccessToken,
  type MapboxNativeInitReason,
} from '../../lib/mapbox/mapboxConfig';
import { loadRnMapboxModule } from '../../lib/mapbox/rnMapboxModule';
import type {
  ConvoyMapVehicle,
  ConvoyRealtimeConnectionStatus,
} from '../../lib/convoy/convoyRealtimeService';
import {
  buildConvoyMarkerIdentities,
  type ConvoyMarkerIdentity,
} from '../../lib/convoy/convoyMarkerIdentity';
import { ECSIconButton } from '../ECSButton';
import { ConvoyMapFallback } from './ConvoyMapFallback';

interface ConvoyCommandMapProps {
  members: ConvoyMapVehicle[];
  currentUserMemberId?: string | null;
  connectionStatus: ConvoyRealtimeConnectionStatus;
  followUserWhenEmpty?: boolean;
  onRecenter?: () => void;
  onSelectMember?: (member: ConvoyMapVehicle) => void;
  selectedMemberId?: string | null;
  styleURL?: string;
  routeCoordinates?: [number, number][];
  cameraResetKey?: string | number;
  showMapWhenEmpty?: boolean;
  showStatusSummary?: boolean;
  compact?: boolean;
}

type MapboxModule = any;

function formatLastUpdate(members: ConvoyMapVehicle[]): string {
  const latest = members.reduce<number | null>((value, member) => {
    const timestamp = Date.parse(member.updatedAt ?? member.capturedAt);
    if (!Number.isFinite(timestamp)) return value;
    return value == null || timestamp > value ? timestamp : value;
  }, null);
  if (latest == null) return 'No update';
  const ageMs = Math.max(0, Date.now() - latest);
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

function boundsForMembers(members: ConvoyMapVehicle[]) {
  if (members.length === 0) return null;
  return boundsForCoordinates(members.map((member) => [member.longitude, member.latitude] as [number, number]));
}

function boundsForCoordinates(coordinates: [number, number][]) {
  if (coordinates.length === 0) return null;
  const lats = coordinates.map((coordinate) => coordinate[1]);
  const lngs = coordinates.map((coordinate) => coordinate[0]);
  return {
    sw: [Math.min(...lngs), Math.min(...lats)] as [number, number],
    ne: [Math.max(...lngs), Math.max(...lats)] as [number, number],
    center: [
      (Math.min(...lngs) + Math.max(...lngs)) / 2,
      (Math.min(...lats) + Math.max(...lats)) / 2,
    ] as [number, number],
  };
}

function normalizeRouteCoordinates(coordinates: [number, number][] | undefined): [number, number][] {
  if (!Array.isArray(coordinates)) return [];
  return coordinates.filter((coordinate): coordinate is [number, number] => {
    const lng = Number(coordinate?.[0]);
    const lat = Number(coordinate?.[1]);
    return Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  });
}

function roleRank(role: ConvoyMarkerIdentity['role']): number {
  switch (role) {
    case 'lead':
      return 0;
    case 'sweep':
      return 1;
    case 'scout':
      return 2;
    case 'medic':
      return 3;
    case 'recovery':
      return 4;
    case 'support':
      return 5;
    default:
      return 6;
  }
}

function featureCollection(
  members: ConvoyMapVehicle[],
  identities: ConvoyMarkerIdentity[],
  selectedMemberId?: string | null,
) {
  const identityByMember = new Map(identities.map((identity) => [identity.memberId, identity]));
  return {
    type: 'FeatureCollection',
    features: members.map((member) => {
      const identity = identityByMember.get(member.memberId) ?? buildConvoyMarkerIdentities([member])[0];
      return {
        type: 'Feature',
        id: member.memberId,
        properties: {
          memberId: identity.memberId,
          callsign: identity.callsign,
          role: identity.role,
          status: identity.status,
          vehicleBadge: identity.vehicleBadge ?? '',
          isCurrentUser: Boolean(identity.isCurrentUser),
          heading: identity.headingDegrees ?? 0,
          headingVisible: identity.shouldShowHeading,
          iconKey: identity.iconKey,
          label: identity.isCurrentUser ? '' : identity.label,
          shapeGlyph: identity.shapeGlyph,
          statusLabel: identity.statusLabel,
          ageLabel: identity.ageLabel ?? '',
          roleRank: roleRank(identity.role),
          selected: identity.memberId === selectedMemberId,
          emergency: identity.status === 'needs_assistance',
          stale: identity.status === 'stale',
          offline: identity.status === 'offline',
          delayed: identity.status === 'delayed',
        },
        geometry: {
          type: 'Point',
          coordinates: [member.longitude, member.latitude],
        },
      };
    }),
  };
}

function memberSummary(members: ConvoyMapVehicle[]) {
  const activeCount = members.filter((member) => !member.isStale && member.movementStatus !== 'offline').length;
  const staleCount = members.filter((member) => member.isStale || member.movementStatus === 'offline').length;
  const assistanceCount = members.filter((member) => member.movementStatus === 'needs_assistance').length;
  return { activeCount, staleCount, assistanceCount };
}

function routeFeatureCollection(coordinates: [number, number][]) {
  return {
    type: 'FeatureCollection',
    features: coordinates.length >= 2
      ? [{
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates,
          },
        }]
      : [],
  };
}

function routeCoordinateSignature(coordinates: [number, number][]): string {
  if (coordinates.length < 2) return 'no-route';
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  return [
    coordinates.length,
    first[0].toFixed(5),
    first[1].toFixed(5),
    last[0].toFixed(5),
    last[1].toFixed(5),
  ].join(':');
}

function fallbackReason(reason: MapboxNativeInitReason | null): string {
  switch (reason) {
    case 'missing_token':
      return 'Mapbox token is missing.';
    case 'invalid_token':
      return 'Mapbox token is not valid.';
    case 'native_module_unavailable':
      return 'Mapbox native module is unavailable in this runtime.';
    case 'set_access_token_unavailable':
      return 'Mapbox access token setup is unavailable in this runtime.';
    default:
      return 'Mapbox is not ready for this build.';
  }
}

export function ConvoyCommandMap({
  members,
  currentUserMemberId,
  connectionStatus,
  followUserWhenEmpty = false,
  onRecenter,
  onSelectMember,
  selectedMemberId,
  styleURL,
  routeCoordinates,
  cameraResetKey,
  showMapWhenEmpty = false,
  showStatusSummary = false,
  compact = false,
}: ConvoyCommandMapProps) {
  const { palette } = useTheme();
  const [mapbox, setMapbox] = useState<MapboxModule | null>(null);
  const [initReason, setInitReason] = useState<MapboxNativeInitReason | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const cameraRef = useRef<any>(null);
  const hasFitInitialCameraRef = useRef(false);
  const hasMembers = members.length > 0;
  const normalizedRouteCoordinates = useMemo(
    () => normalizeRouteCoordinates(routeCoordinates),
    [routeCoordinates],
  );
  const hasRouteLine = normalizedRouteCoordinates.length >= 2;
  const shouldFollowUser = followUserWhenEmpty && !hasRouteLine;
  const summary = useMemo(() => memberSummary(members), [members]);
  const identities = useMemo(
    () => buildConvoyMarkerIdentities(members, currentUserMemberId),
    [currentUserMemberId, members],
  );
  const geojson = useMemo(
    () => featureCollection(members, identities, selectedMemberId),
    [identities, members, selectedMemberId],
  );
  const bounds = useMemo(() => boundsForMembers(members), [members]);
  const routeBounds = useMemo(() => boundsForCoordinates(normalizedRouteCoordinates), [normalizedRouteCoordinates]);
  const routeGeoJson = useMemo(
    () => routeFeatureCollection(normalizedRouteCoordinates),
    [normalizedRouteCoordinates],
  );
  const routeSignature = useMemo(
    () => routeCoordinateSignature(normalizedRouteCoordinates),
    [normalizedRouteCoordinates],
  );
  const selectedMember = useMemo(
    () => members.find((member) => member.memberId === selectedMemberId) ?? null,
    [members, selectedMemberId],
  );
  const selectedIdentity = useMemo(
    () => identities.find((identity) => identity.memberId === selectedMemberId) ?? null,
    [identities, selectedMemberId],
  );
  const cameraStateRef = useRef({
    bounds,
    followUserWhenEmpty,
    hasRouteLine,
    membersLength: members.length,
    routeBounds,
  });
  const lastCameraResetKeyRef = useRef(cameraResetKey);
  const lastRouteCameraSignatureRef = useRef(routeSignature);

  useEffect(() => {
    cameraStateRef.current = {
      bounds,
      followUserWhenEmpty,
      hasRouteLine,
      membersLength: members.length,
      routeBounds,
    };
  }, [bounds, followUserWhenEmpty, hasRouteLine, members.length, routeBounds]);

  useEffect(() => {
    let mounted = true;
    async function initialize() {
      const result = await initializeMapboxAccessToken();
      if (!mounted) return;
      setInitReason(result.reason);
      if (!result.initialized) return;

      const module = loadRnMapboxModule();
      if (!mounted) return;
      if (module) {
        setMapbox(module);
      } else {
        if (!mounted) return;
        setInitReason('native_module_unavailable');
      }
    }

    void initialize();

    return () => {
      mounted = false;
    };
  }, []);

  const fitDefaultCamera = useCallback(() => {
    const {
      bounds: latestBounds,
      followUserWhenEmpty: latestFollowUserWhenEmpty,
      hasRouteLine: latestHasRouteLine,
      membersLength,
      routeBounds: latestRouteBounds,
    } = cameraStateRef.current;
    if (latestFollowUserWhenEmpty && !latestHasRouteLine) {
      cameraRef.current?.setCamera?.({
        followUserLocation: true,
        followZoomLevel: 13,
        animationDuration: 500,
      });
      return;
    }
    const targetBounds = latestHasRouteLine ? latestRouteBounds : latestBounds;
    if (!cameraRef.current || !targetBounds) return;
    if (!latestHasRouteLine && membersLength === 1) {
      cameraRef.current.setCamera?.({
        centerCoordinate: targetBounds.center,
        zoomLevel: 13,
        animationDuration: 500,
      });
      return;
    }
    cameraRef.current.fitBounds?.(targetBounds.ne, targetBounds.sw, 56, 650);
  }, []);

  useEffect(() => {
    if (!mapReady || (!hasMembers && !hasRouteLine && !shouldFollowUser) || hasFitInitialCameraRef.current) return;
    hasFitInitialCameraRef.current = true;
    fitDefaultCamera();
  }, [fitDefaultCamera, hasMembers, hasRouteLine, mapReady, shouldFollowUser]);

  useEffect(() => {
    if (lastCameraResetKeyRef.current === cameraResetKey) return;
    lastCameraResetKeyRef.current = cameraResetKey;
    if (!mapReady || (!hasMembers && !hasRouteLine && !shouldFollowUser)) return;
    hasFitInitialCameraRef.current = true;
    fitDefaultCamera();
  }, [cameraResetKey, fitDefaultCamera, hasMembers, hasRouteLine, mapReady, shouldFollowUser]);

  useEffect(() => {
    if (lastRouteCameraSignatureRef.current === routeSignature) return;
    lastRouteCameraSignatureRef.current = routeSignature;
    if (!mapReady || !hasRouteLine) return;
    hasFitInitialCameraRef.current = true;
    fitDefaultCamera();
  }, [fitDefaultCamera, hasRouteLine, mapReady, routeSignature]);

  const handleRecenter = useCallback(() => {
    fitDefaultCamera();
    onRecenter?.();
  }, [fitDefaultCamera, onRecenter]);

  const handleShapePress = useCallback(
    (event: any) => {
      const feature = event?.features?.[0];
      const memberId = feature?.properties?.memberId;
      const member = members.find((item) => item.memberId === memberId);
      if (member) onSelectMember?.(member);
    },
    [members, onSelectMember],
  );

  if (!hasMembers && !showMapWhenEmpty) {
    return (
      <ConvoyMapFallback
        members={members}
        connectionStatus={connectionStatus}
        reason="No live convoy locations yet."
        onSelectMember={onSelectMember}
        selectedMemberId={selectedMemberId}
        markerIdentities={identities}
      />
    );
  }

  if (!mapbox || initReason !== 'ready') {
    return (
      <ConvoyMapFallback
        members={members}
        connectionStatus={connectionStatus}
        reason={fallbackReason(initReason)}
        onSelectMember={onSelectMember}
        selectedMemberId={selectedMemberId}
        markerIdentities={identities}
      />
    );
  }

  const Mapbox = mapbox;
  const mapStyleURL = styleURL ?? Mapbox.StyleURL?.Dark;

  return (
    <View
      style={[styles.container, compact ? styles.compactContainer : null, { backgroundColor: palette.panel, borderColor: palette.border }]}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`Convoy Command map. ${summary.activeCount} active, ${summary.staleCount} stale, ${summary.assistanceCount} needing assist.`}
    >
      <Mapbox.MapView
        style={[styles.map, compact ? styles.compactMap : null]}
        styleURL={mapStyleURL}
        logoEnabled={false}
        attributionEnabled={false}
        compassEnabled
        onDidFinishLoadingMap={() => setMapReady(true)}
      >
        <Mapbox.Camera
          ref={cameraRef}
          animationMode="flyTo"
          followUserLocation={shouldFollowUser}
          followZoomLevel={13}
        />
        <Mapbox.UserLocation visible showsUserHeadingIndicator />
        {hasRouteLine ? (
          <Mapbox.ShapeSource id="convoy-active-route-source" shape={routeGeoJson as any}>
            <Mapbox.LineLayer
              id="convoy-active-route-casing"
              style={{
                lineColor: palette.bg,
                lineOpacity: 0.76,
                lineWidth: 7,
                lineJoin: 'round',
                lineCap: 'round',
              }}
            />
            <Mapbox.LineLayer
              id="convoy-active-route-line"
              style={{
                lineColor: palette.amber,
                lineOpacity: 0.9,
                lineWidth: 3.5,
                lineJoin: 'round',
                lineCap: 'round',
              }}
            />
          </Mapbox.ShapeSource>
        ) : null}
        {hasMembers ? (
          <Mapbox.ShapeSource id="convoy-members-source" shape={geojson as any} onPress={handleShapePress}>
            <Mapbox.CircleLayer
              id="convoy-members-halo"
              style={{
                circleRadius: [
                  'case',
                  ['get', 'emergency'],
                  22,
                  ['get', 'selected'],
                  19,
                  ['get', 'isCurrentUser'],
                  17,
                  ['get', 'offline'],
                  13,
                  14,
                ],
                circleColor: palette.bg,
                circleOpacity: ['case', ['get', 'offline'], 0.18, ['get', 'stale'], 0.32, 0.62],
                circleStrokeColor: [
                  'case',
                  ['get', 'emergency'],
                  palette.danger,
                  ['get', 'stale'],
                  palette.amber,
                  ['get', 'delayed'],
                  palette.amber,
                  ['get', 'isCurrentUser'],
                  palette.text,
                  palette.borderFocus,
                ],
                circleStrokeWidth: [
                  'case',
                  ['get', 'emergency'],
                  3.5,
                  ['get', 'selected'],
                  3,
                  ['get', 'isCurrentUser'],
                  2.75,
                  1.4,
                ],
              }}
            />
            <Mapbox.CircleLayer
              id="convoy-members-you-ring"
              filter={['==', ['get', 'isCurrentUser'], true]}
              style={{
                circleRadius: 22,
                circleColor: palette.bg,
                circleOpacity: 0,
                circleStrokeColor: palette.text,
                circleStrokeWidth: 1.3,
              }}
            />
            <Mapbox.CircleLayer
              id="convoy-members-point"
              style={{
              circleRadius: [
                'case',
                ['get', 'emergency'],
                9,
                ['get', 'selected'],
                7.5,
                ['get', 'isCurrentUser'],
                7,
                ['get', 'offline'],
                5.25,
                6,
              ],
              circleColor: [
                'case',
                ['get', 'emergency'],
                palette.danger,
                ['get', 'stale'],
                palette.amber,
                ['get', 'offline'],
                palette.bg,
                ['get', 'delayed'],
                palette.amber,
                ['==', ['get', 'role'], 'lead'],
                palette.amber,
                ['==', ['get', 'role'], 'sweep'],
                palette.text,
                ['==', ['get', 'role'], 'scout'],
                palette.borderFocus,
                ['==', ['get', 'role'], 'medic'],
                palette.danger,
                ['==', ['get', 'role'], 'recovery'],
                palette.amber,
                ['==', ['get', 'role'], 'support'],
                palette.borderFocus,
                palette.accent,
              ],
              circleOpacity: ['case', ['get', 'offline'], 0.58, ['get', 'stale'], 0.8, 0.98],
              circleStrokeColor: ['case', ['get', 'offline'], palette.textMuted, palette.bg],
              circleStrokeWidth: ['case', ['get', 'offline'], 2.25, 2],
            }}
          />
          <Mapbox.SymbolLayer
            id="convoy-members-role-icon"
            style={{
              iconImage: ['get', 'iconKey'],
              iconAllowOverlap: true,
              iconOptional: true,
              textField: ['get', 'shapeGlyph'],
              textSize: ['case', ['get', 'emergency'], 14, 11],
              textColor: ['case', ['get', 'offline'], palette.textMuted, ['get', 'emergency'], palette.text, palette.bg],
              textHaloColor: ['case', ['get', 'emergency'], palette.danger, palette.bg],
              textHaloWidth: 0.6,
            }}
          />
          <Mapbox.SymbolLayer
            id="convoy-members-heading"
            filter={['==', ['get', 'headingVisible'], true]}
            style={{
              textField: '▲',
              textSize: 12,
              textRotate: ['get', 'heading'],
              textOffset: [0, -1.35],
              textColor: palette.text,
              textHaloColor: palette.bg,
              textHaloWidth: 1,
              textAllowOverlap: true,
            }}
          />
          <Mapbox.SymbolLayer
            id="convoy-members-label"
            style={{
              textField: ['get', 'label'],
              textSize: 11,
              textOffset: [0, 1.35],
              textAnchor: 'top',
              textColor: palette.text,
              textHaloColor: palette.bg,
              textHaloWidth: 1.4,
              textAllowOverlap: false,
              textOptional: true,
            }}
          />
          <Mapbox.SymbolLayer
            id="convoy-members-status-label"
            filter={[
              'any',
              ['get', 'emergency'],
              ['get', 'stale'],
              ['get', 'offline'],
              ['get', 'delayed'],
              ['get', 'selected'],
            ]}
            style={{
              textField: ['get', 'statusLabel'],
              textSize: 9,
              textOffset: [0, -2.1],
              textAnchor: 'bottom',
              textColor: ['case', ['get', 'emergency'], palette.danger, ['get', 'offline'], palette.textMuted, palette.amber],
              textHaloColor: palette.bg,
              textHaloWidth: 1.2,
              textAllowOverlap: true,
            }}
          />
        </Mapbox.ShapeSource>
        ) : null}
      </Mapbox.MapView>

      <View style={styles.topControls} pointerEvents="box-none">
        <ECSIconButton
          icon="compass-outline"
          size="compact"
          variant="active"
          onPress={handleRecenter}
          accessibilityLabel={hasRouteLine ? 'Recenter convoy map to full route' : 'Recenter convoy map'}
        />
      </View>

      {selectedMember && selectedIdentity ? (
        <View style={[styles.detailCard, { backgroundColor: palette.panel, borderColor: palette.border }]}>
          <View style={styles.detailHeader}>
            <Text style={[styles.detailTitle, { color: palette.text }]} numberOfLines={1}>
              {selectedIdentity.label}
            </Text>
            <Text style={[styles.detailBadge, { color: palette.amber }]} numberOfLines={1}>
              {selectedIdentity.iconKey}
            </Text>
          </View>
          <Text style={[styles.detailLine, { color: palette.textMuted }]} numberOfLines={1}>
            {selectedIdentity.role} / {selectedIdentity.status} / {selectedIdentity.ageLabel ?? 'No update age'}
          </Text>
          <Text style={[styles.detailLine, { color: palette.textMuted }]} numberOfLines={1}>
            Speed {selectedIdentity.speedMph != null ? `${Math.round(selectedIdentity.speedMph)} mph` : 'unavailable'} / Heading {selectedIdentity.headingDegrees != null ? `${Math.round(selectedIdentity.headingDegrees)}°` : 'unavailable'}
          </Text>
          {selectedIdentity.distanceBehindLeadMiles != null ? (
            <Text style={[styles.detailLine, { color: palette.textMuted }]} numberOfLines={1}>
              {selectedIdentity.distanceBehindLeadMiles.toFixed(1)} mi behind lead
            </Text>
          ) : null}
          {selectedIdentity.statusExplanation ? (
            <Text style={[styles.detailAlert, { color: selectedIdentity.status === 'needs_assistance' ? palette.danger : palette.amber }]} numberOfLines={2}>
              {selectedIdentity.statusExplanation}
            </Text>
          ) : null}
        </View>
      ) : null}

      {showStatusSummary ? (
      <View style={[styles.summaryCard, { backgroundColor: palette.panel, borderColor: palette.border }]}>
        <View style={styles.summaryMetric}>
          <Text style={[styles.metricValue, { color: palette.text }]}>{summary.activeCount}</Text>
          <Text style={[styles.metricLabel, { color: palette.textMuted }]}>ACTIVE</Text>
        </View>
        <View style={styles.summaryMetric}>
          <Text style={[styles.metricValue, { color: palette.textMuted }]}>{summary.staleCount}</Text>
          <Text style={[styles.metricLabel, { color: palette.textMuted }]}>STALE</Text>
        </View>
        <View style={styles.summaryMetric}>
          <Text style={[styles.metricValue, { color: summary.assistanceCount > 0 ? palette.danger : palette.text }]}>
            {summary.assistanceCount}
          </Text>
          <Text style={[styles.metricLabel, { color: palette.textMuted }]}>ASSIST</Text>
        </View>
        <View style={styles.summaryMetricWide}>
          <Text style={[styles.metricValueSmall, { color: palette.text }]}>{formatLastUpdate(members)}</Text>
          <Text style={[styles.metricLabel, { color: palette.textMuted }]}>{connectionStatus}</Text>
        </View>
      </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 320,
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  compactContainer: {
    height: '100%',
    minHeight: 0,
  },
  map: {
    flex: 1,
    minHeight: 320,
  },
  compactMap: {
    minHeight: 0,
  },
  topControls: {
    position: 'absolute',
    top: 10,
    right: 10,
  },
  detailCard: {
    position: 'absolute',
    left: 10,
    top: 10,
    maxWidth: 250,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  detailTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0,
  },
  detailBadge: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  detailLine: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  detailAlert: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: 0,
  },
  summaryCard: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    minHeight: 56,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  summaryMetric: {
    minWidth: 44,
  },
  summaryMetricWide: {
    flex: 1,
    alignItems: 'flex-end',
    minWidth: 0,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0,
  },
  metricValueSmall: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
  },
  metricLabel: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 2,
  },
});

export default ConvoyCommandMap;
