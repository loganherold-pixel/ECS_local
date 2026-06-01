import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafeIcon as Ionicons } from '../SafeIcon';
import TacticalPopupShell from '../TacticalPopupShell';
import MapRenderer, { type CameraCommand } from '../navigate/MapRenderer';
import { ECS, TACTICAL } from '../../lib/theme';
import {
  ECS_TOP_SHELL_COMMAND_PILL_HEIGHT,
  getShellBottomClearance,
  getShellHeaderTopPadding,
} from '../../lib/shellLayout';
import type { ExpeditionOpportunity } from '../../lib/discoverEngine';
import {
  normalizeExploreRoutePreview,
  normalizeNavigationHandoffPreview,
  type ExplorePreviewCoordinate,
} from '../../lib/exploreRoutePreview';
import type { NavigationHandoffPayload } from '../../lib/navigationHandoffStore';
import {
  DEFAULT_MAP_STYLE,
  getMapboxToken,
  getMapboxTokenSync,
} from '../../lib/mapConfig';
import { ECSOverlayFooter } from '../ECSModalShell';
import { ExpeditionReadinessCard, ReadinessEducationCard, TripIntentSelector } from '../readiness';
import { buildExploreRouteReadinessAssessment } from '../../lib/readiness/exploreRouteReadiness';
import {
  expeditionReadinessStore,
  useExpeditionReadinessState,
  type ExpeditionTripIntent,
} from '../../lib/readiness';

type ExploreRoutePreviewModalProps = {
  visible: boolean;
  opportunity?: ExpeditionOpportunity | null;
  payload?: NavigationHandoffPayload | null;
  title?: string | null;
  subtitle?: string | null;
  sourceLabel?: string | null;
  userLocation: ExplorePreviewCoordinate | null;
  gpsStatus?: string | null;
  hasVehicle?: boolean;
  onClose: () => void;
  onStartGuidance?: () => void;
  startGuidanceDisabled?: boolean;
  startGuidanceDisabledReason?: string | null;
  onSaveRoute?: () => void;
  saveRouteDisabled?: boolean;
};

export default function ExploreRoutePreviewModal({
  visible,
  opportunity,
  payload = null,
  title = null,
  subtitle = null,
  sourceLabel = null,
  userLocation,
  gpsStatus = null,
  hasVehicle = false,
  onClose,
  onStartGuidance,
  startGuidanceDisabled = false,
  startGuidanceDisabledReason = null,
  onSaveRoute,
  saveRouteDisabled = false,
}: ExploreRoutePreviewModalProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [mapboxToken, setMapboxToken] = useState(() => getMapboxTokenSync());
  const [tokenLoading, setTokenLoading] = useState(() => !getMapboxTokenSync());
  const [cameraCommandTrigger, setCameraCommandTrigger] = useState(0);
  const readinessState = useExpeditionReadinessState();
  const compactPreview = width < 390 || height < 720;
  const shellTopClearance =
    getShellHeaderTopPadding(insets.top) + ECS_TOP_SHELL_COMMAND_PILL_HEIGHT + (compactPreview ? 14 : 24);
  const shellBottomClearance = getShellBottomClearance(insets.bottom, 2) + 18;
  const previewModel = useMemo(
    () =>
      payload
        ? normalizeNavigationHandoffPreview(payload, userLocation)
        : opportunity
          ? normalizeExploreRoutePreview(opportunity, userLocation)
          : null,
    [opportunity, payload, userLocation],
  );
  const routeTitle = title ?? previewModel?.payload.title ?? opportunity?.name ?? 'Preparing route preview';
  const routeSubtitle =
    subtitle ?? previewModel?.payload.subtitle ?? opportunity?.region ?? 'Route preview';
  const routeDistanceMiles =
    previewModel?.payload.trailLengthMiles ??
    Number(previewModel?.payload.routeMetadata?.distanceMiles ?? opportunity?.distanceMiles ?? NaN);
  const routeTravelHours = Number(
    previewModel?.payload.routeMetadata?.estimatedTravelHours ??
      (opportunity as any)?.estimatedTravelHours ??
      NaN,
  );
  const routeTypeLabel = String(
    previewModel?.payload.tripMode ??
      previewModel?.payload.trailCategory ??
      previewModel?.payload.routeMetadata?.terrainType ??
      'route',
  ).toUpperCase();
  const confidenceLabel = String(
    sourceLabel ??
      previewModel?.payload.routeMetadata?.confidenceLabel ??
      previewModel?.payload.routeMetadata?.routeConfidence ??
      previewModel?.payload.routeSource ??
      'ECS preview',
  );
  const readinessAssessment = useMemo(
    () => opportunity
      ? buildExploreRouteReadinessAssessment(opportunity, {
          hasVehicle,
          tripIntent: readinessState.inputPatch.tripIntent ?? undefined,
          tripIntentSource: readinessState.inputPatch.tripIntentSource ?? undefined,
        })
      : null,
    [hasVehicle, opportunity, readinessState.inputPatch.tripIntent, readinessState.inputPatch.tripIntentSource],
  );
  const handleTripIntentChange = (intent: ExpeditionTripIntent) => {
    expeditionReadinessStore.setTripIntent(intent);
  };
  const hasEstimatedPreviewLine =
    !!previewModel?.hasRouteData && !previewModel.hasFullGeometry;
  const previewSignature = previewModel
    ? [
        previewModel.payload.id,
        previewModel.mapPoints.length,
        previewModel.mapPoints[0]?.lat,
        previewModel.mapPoints[0]?.lng,
        previewModel.mapPoints[previewModel.mapPoints.length - 1]?.lat,
        previewModel.mapPoints[previewModel.mapPoints.length - 1]?.lng,
      ].join(':')
    : 'none';

  useEffect(() => {
    if (!visible || mapboxToken) return;

    let cancelled = false;
    setTokenLoading(true);
    getMapboxToken()
      .then((token) => {
        if (!cancelled) setMapboxToken(token);
      })
      .finally(() => {
        if (!cancelled) setTokenLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mapboxToken, visible]);

  useEffect(() => {
    if (!visible || !previewModel?.cameraCommand) return;
    setCameraCommandTrigger((current) => current + 1);
  }, [previewModel?.cameraCommand, previewSignature, visible]);

  return (
    <TacticalPopupShell
      visible={visible}
      onClose={onClose}
      title="Route Preview"
      subtitle={routeTitle}
      eyebrow={(sourceLabel ?? 'EXPLORE').toUpperCase()}
      icon="map-outline"
      overlayClass="workflow"
      stackBehavior="allow-stack"
      maxWidth={560}
      maxHeightFraction={compactPreview ? 0.68 : 0.64}
      minHeightFraction={compactPreview ? 0.34 : 0.38}
      showHandle={false}
      scrollable={false}
      topClearanceOverride={shellTopClearance}
      bottomClearanceOverride={shellBottomClearance}
      contentContainerStyle={s.contentContainer}
      bodyStyle={s.body}
      footer={(
        <ECSOverlayFooter>
          <TouchablePreviewAction
            label="CLOSE PREVIEW"
            icon="close-outline"
            tone="secondary"
            onPress={onClose}
          />
          {onSaveRoute ? (
            <TouchablePreviewAction
              label="SAVE ROUTE"
              icon="bookmark-outline"
              tone="secondary"
              onPress={onSaveRoute}
              disabled={saveRouteDisabled}
            />
          ) : null}
          {onStartGuidance ? (
            <TouchablePreviewAction
              label="START GUIDANCE"
              icon="play"
              tone="primary"
              onPress={onStartGuidance}
              disabled={startGuidanceDisabled || !previewModel?.hasRouteData}
              accessibilityHint={
                startGuidanceDisabledReason ??
                (!previewModel?.hasRouteData ? 'Route geometry or endpoint is unavailable.' : undefined)
              }
            />
          ) : null}
        </ECSOverlayFooter>
      )}
    >
      {!previewModel ? (
        <View style={[s.loadingPanel, compactPreview && s.loadingPanelCompact]}>
          <ActivityIndicator color={TACTICAL.amber} />
          <Text style={s.loadingText}>Loading GPS/map preview...</Text>
        </View>
      ) : (
        <View style={[s.content, compactPreview && s.contentCompact]}>
          <View style={s.routeSummary}>
            <Text style={s.routeKicker}>READ-ONLY PREVIEW</Text>
            <Text style={s.routeTitle} numberOfLines={2}>{routeTitle}</Text>
            <Text style={s.routeSubtitle} numberOfLines={2}>
              {routeSubtitle}
            </Text>
          </View>

          <View style={s.metadataRow}>
            <View style={s.metadataTile}>
              <Text style={s.metadataLabel}>DIST</Text>
              <Text style={s.metadataValue}>
                {Number.isFinite(routeDistanceMiles) ? `${Number(routeDistanceMiles).toFixed(1)} mi` : '--'}
              </Text>
            </View>
            <View style={s.metadataTile}>
              <Text style={s.metadataLabel}>TIME</Text>
              <Text style={s.metadataValue}>
                {Number.isFinite(routeTravelHours) ? `${Number(routeTravelHours).toFixed(1)} hr` : '--'}
              </Text>
            </View>
            <View style={s.metadataTile}>
              <Text style={s.metadataLabel}>TYPE</Text>
              <Text style={s.metadataValue} numberOfLines={1}>{routeTypeLabel}</Text>
            </View>
            <View style={s.metadataTile}>
              <Text style={s.metadataLabel}>SOURCE</Text>
              <Text style={s.metadataValue} numberOfLines={1}>{confidenceLabel}</Text>
            </View>
          </View>

          {readinessAssessment ? (
            <>
              <ReadinessEducationCard
                surface="exploreFirstReadiness"
                compact
                showStatusLegend={!compactPreview}
              />
              <TripIntentSelector
                value={readinessAssessment.tripIntent}
                source={readinessAssessment.tripIntentSource}
                onChange={handleTripIntentChange}
                compact
              />
              <ExpeditionReadinessCard
                assessment={readinessAssessment}
                title="Overall Readiness"
                categoryLimit={7}
                concernLimit={3}
                compactCategories
              />
            </>
          ) : null}

          <View style={[s.mapFrame, compactPreview && s.mapFrameCompact]}>
            {previewModel.hasRouteData && tokenLoading && !mapboxToken ? (
              <View style={s.mapStatePanel}>
                <ActivityIndicator color={TACTICAL.amber} />
                <Text style={s.mapStateTitle}>Loading map preview</Text>
                <Text style={s.mapStateText}>Preparing Mapbox rendering for this route.</Text>
              </View>
            ) : previewModel.hasRouteData && !mapboxToken ? (
              <View style={s.mapStatePanel}>
                <Ionicons name="map-outline" size={24} color="#E6A23C" />
                <Text style={s.mapStateTitle}>Map rendering unavailable</Text>
                <Text style={s.mapStateText}>
                  Mapbox rendering is not ready in this session. Route metadata is preserved below.
                </Text>
              </View>
            ) : previewModel.hasRouteData ? (
              <MapRenderer
                points={previewModel.mapPoints}
                waypoints={previewModel.waypoints}
                routeColor={TACTICAL.amber}
                mapStyle={DEFAULT_MAP_STYLE}
                mapboxToken={mapboxToken}
                hasToken={!!mapboxToken}
                isLoading={tokenLoading}
                showUserLocation={!!previewModel.origin}
                userLocation={previewModel.origin}
                interactive={false}
                cameraMode="route_overview"
                cameraCommand={previewModel.cameraCommand as CameraCommand | null}
                cameraCommandTrigger={cameraCommandTrigger}
                style={s.mapSurface}
              />
            ) : (
              <View style={s.mapStatePanel}>
                <Ionicons name="map-outline" size={24} color={TACTICAL.textMuted} />
                <Text style={s.mapStateTitle}>Route geometry unavailable</Text>
                <Text style={s.mapStateText}>
                  {previewModel.previewUnavailableReason ??
                    'Endpoint or route geometry metadata is missing.'}
                </Text>
              </View>
            )}
          </View>

          <View style={s.markerLegend}>
            <View style={[s.legendPill, previewModel.origin ? s.legendPillActive : s.legendPillMuted]}>
              <View style={[s.legendDot, previewModel.origin ? s.legendDotGps : s.legendDotMuted]} />
              <Text style={[s.legendText, !previewModel.origin && s.legendTextMuted]} numberOfLines={1}>
                {previewModel.origin ? 'Current GPS' : 'GPS waiting'}
              </Text>
            </View>
            <View style={s.legendPill}>
              <View style={[s.legendDot, s.legendDotStart]} />
              <Text style={s.legendText} numberOfLines={1}>Route start</Text>
            </View>
            <View style={s.legendPill}>
              <View style={[s.legendDot, s.legendDotEnd]} />
              <Text style={s.legendText} numberOfLines={1}>Endpoint</Text>
            </View>
          </View>

          {!previewModel.origin ? (
            <View style={s.notice}>
              <Ionicons name="navigate-circle-outline" size={14} color="#E6A23C" />
              <Text style={s.noticeText}>
                GPS is unavailable{gpsStatus ? ` (${gpsStatus})` : ''}. Showing the route line only until a current-location fix is available.
              </Text>
            </View>
          ) : null}

          {hasEstimatedPreviewLine ? (
            <View style={s.notice}>
              <Ionicons name="git-branch-outline" size={14} color={TACTICAL.textMuted} />
              <Text style={s.noticeText}>
                Estimated preview line. ECS is using the best available start and endpoint until full route geometry is available.
              </Text>
            </View>
          ) : null}

          {!previewModel.hasRouteData ? (
            <View style={s.notice}>
              <Ionicons name="alert-circle-outline" size={14} color="#E6A23C" />
              <Text style={s.noticeText}>
                Close and Build Route remain available. Build Route will use the best existing route handoff data.
              </Text>
            </View>
          ) : null}

          <Text style={s.previewOnlyText}>
            Opening this preview does not start navigation. Use Start Guidance only when you are ready to hand this route to Navigate.
          </Text>
        </View>
      )}
    </TacticalPopupShell>
  );
}

function TouchablePreviewAction({
  label,
  icon,
  tone,
  onPress,
  disabled = false,
  accessibilityHint,
}: {
  label: string;
  icon: string;
  tone: 'primary' | 'secondary';
  onPress: () => void;
  disabled?: boolean;
  accessibilityHint?: string;
}) {
  const actionLabel = String(label ?? '');
  const iconColor = disabled ? TACTICAL.textMuted : tone === 'primary' ? '#071014' : TACTICAL.amber;
  const actionStyle = [
    s.footerAction,
    tone === 'primary' ? s.footerActionPrimary : s.footerActionSecondary,
    disabled && s.footerActionDisabled,
  ];
  const labelStyle = [
    s.footerActionText,
    tone === 'primary' ? s.footerActionTextPrimary : s.footerActionTextSecondary,
    disabled && s.footerActionTextDisabled,
  ];

  return React.createElement(
    TouchableOpacity,
    {
      accessibilityRole: 'button',
      accessibilityLabel: actionLabel,
      accessibilityHint,
      accessibilityState: { disabled },
      onPress: disabled ? undefined : onPress,
      disabled,
      activeOpacity: disabled ? 1 : 0.82,
      style: actionStyle,
    },
    React.createElement(Ionicons, {
      name: icon as any,
      size: 13,
      color: iconColor,
    }),
    React.createElement(Text, { style: labelStyle }, actionLabel),
  );
}

const s = StyleSheet.create({
  contentContainer: {
    flexGrow: 1,
  },
  body: {
    paddingBottom: 10,
  },
  content: {
    gap: 10,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  contentCompact: {
    gap: 8,
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  loadingPanel: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingPanelCompact: {
    minHeight: 170,
  },
  loadingText: {
    color: TACTICAL.textMuted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
    letterSpacing: 0,
  },
  mapFrame: {
    height: 214,
    overflow: 'hidden',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '28',
    backgroundColor: '#0A0D10',
  },
  mapFrameCompact: {
    height: 176,
  },
  mapSurface: {
    flex: 1,
    minHeight: 176,
  },
  mapStatePanel: {
    flex: 1,
    minHeight: 176,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 22,
    backgroundColor: '#0A0D10',
  },
  mapStateTitle: {
    color: TACTICAL.text,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0,
  },
  mapStateText: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0,
  },
  routeSummary: {
    gap: 3,
  },
  routeKicker: {
    color: TACTICAL.amber,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '900',
    letterSpacing: 0,
  },
  routeTitle: {
    color: TACTICAL.text,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '900',
    letterSpacing: 0,
  },
  routeSubtitle: {
    color: TACTICAL.textMuted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    letterSpacing: 0,
  },
  markerLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  metadataRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  metadataTile: {
    flex: 1,
    minWidth: 86,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
    paddingHorizontal: 8,
    paddingVertical: 7,
    gap: 2,
  },
  metadataLabel: {
    color: TACTICAL.textMuted,
    fontSize: 7,
    lineHeight: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  metadataValue: {
    color: TACTICAL.text,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
    letterSpacing: 0,
  },
  legendPill: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
  },
  legendPillActive: {
    borderColor: TACTICAL.amber + '30',
  },
  legendPillMuted: {
    opacity: 0.82,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: TACTICAL.amber,
  },
  legendDotGps: {
    backgroundColor: '#5AC8FA',
  },
  legendDotStart: {
    backgroundColor: '#66BB6A',
  },
  legendDotEnd: {
    backgroundColor: TACTICAL.amber,
  },
  legendDotMuted: {
    backgroundColor: TACTICAL.textMuted,
  },
  legendText: {
    color: TACTICAL.text,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '800',
    letterSpacing: 0,
  },
  legendTextMuted: {
    color: TACTICAL.textMuted,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
  },
  noticeText: {
    flex: 1,
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
    letterSpacing: 0,
  },
  previewOnlyText: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: 0,
  },
  footerAction: {
    flex: 1,
    minWidth: 0,
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 12,
    overflow: 'hidden',
  },
  footerActionPrimary: {
    borderColor: TACTICAL.amber,
    backgroundColor: TACTICAL.amber,
  },
  footerActionSecondary: {
    borderColor: TACTICAL.amber + '28',
    backgroundColor: TACTICAL.amber + '08',
  },
  footerActionDisabled: {
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
    opacity: 0.56,
  },
  footerActionText: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  footerActionTextPrimary: {
    color: '#071014',
  },
  footerActionTextSecondary: {
    color: TACTICAL.amber,
  },
  footerActionTextDisabled: {
    color: TACTICAL.textMuted,
  },
});
