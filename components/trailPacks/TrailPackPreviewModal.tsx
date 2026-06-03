import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafeIcon as Ionicons } from '../SafeIcon';
import TacticalPopupShell from '../TacticalPopupShell';
import { ECSOverlayFooter } from '../ECSModalShell';
import { ECS, TACTICAL } from '../../lib/theme';
import { hapticMicro } from '../../lib/haptics';
import {
  ECS_TOP_SHELL_COMMAND_PILL_HEIGHT,
  getShellBottomClearance,
  getShellHeaderTopPadding,
} from '../../lib/shellLayout';
import {
  canStartTrailPackGuidance,
  distanceMilesBetween,
  getTrailPackDifficultyLabel,
  getTrailPackGeometryCoordinateSegments,
  getTrailPackGeometryCoordinates,
  getTrailPackGuidanceReadiness,
  getTrailPackRouteTypeLabel,
  getTrailPackSourceLabel,
  type ECSTrailPackDiscoveryItem,
} from '../../lib/explore/trailPacks';
import {
  buildExploreRoutePreviewCameraCommand,
  type ExplorePreviewCoordinate,
} from '../../lib/exploreRoutePreview';
import {
  DEFAULT_MAP_STYLE,
  getMapboxToken,
  getMapboxTokenSync,
} from '../../lib/mapConfig';
import MapRenderer, { type CameraCommand } from '../navigate/MapRenderer';
import TrailPackFeedbackPanel from './TrailPackFeedbackPanel';
import type {
  ECSTrailPackFeedbackResult,
  ECSTrailPackFeedbackType,
} from '../../lib/explore/trailPackFeedback';

type TrailPackPreviewModalProps = {
  visible: boolean;
  trailPack: ECSTrailPackDiscoveryItem | null;
  isSaved?: boolean;
  onClose: () => void;
  onRoutePreview?: () => void;
  routePreviewDisabled?: boolean;
  routePreviewDisabledReason?: string | null;
  onStartGuidance: () => void;
  onSave: () => void;
  onFeedback: (type: ECSTrailPackFeedbackType, note?: string) => ECSTrailPackFeedbackResult;
  offlineCacheAvailable?: boolean;
  onCacheOffline?: () => void;
  detailLoading?: boolean;
  detailError?: string | null;
};

function formatDate(isoDate: string | undefined): string {
  if (!isoDate) return 'Last verified unavailable';
  const timestamp = Date.parse(isoDate);
  if (!Number.isFinite(timestamp)) return 'Last verified unavailable';
  return `Last verified ${new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`;
}

function formatStaleDate(isoDate: string | null | undefined): string {
  if (!isoDate) return 'Stale after unavailable';
  const timestamp = Date.parse(isoDate);
  if (!Number.isFinite(timestamp)) return 'Stale after unavailable';
  return `Stale after ${new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`;
}

function formatCatalogTimestamp(isoDate: string | null | undefined): string {
  if (!isoDate) return 'unavailable';
  const timestamp = Date.parse(isoDate);
  if (!Number.isFinite(timestamp)) return isoDate;
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function isLoopRoute(trailPack: ECSTrailPackDiscoveryItem, points: ReturnType<typeof getTrailPackGeometryCoordinates>): boolean {
  if (trailPack.routeType === 'loop') return true;
  if (points.length < 3) return false;
  return distanceMilesBetween(points[0], points[points.length - 1]) <= 0.5;
}

function MapPreview({ trailPack }: { trailPack: ECSTrailPackDiscoveryItem }) {
  const [mapboxToken, setMapboxToken] = useState(() => getMapboxTokenSync());
  const [tokenLoading, setTokenLoading] = useState(() => !getMapboxTokenSync());
  const geometrySegments = useMemo(() => getTrailPackGeometryCoordinateSegments(trailPack), [trailPack]);
  const geometry = useMemo(() => geometrySegments.flat(), [geometrySegments]);
  const routePoints = useMemo<ExplorePreviewCoordinate[]>(
    () => geometry.map((point) => ({ lat: point.latitude, lng: point.longitude })),
    [geometry],
  );
  const mapRoutePoints = geometrySegments.length === 1 ? routePoints : [];
  const sourceTrailSegments = useMemo(
    () =>
      geometrySegments.map((segment, index) => ({
        id: `${trailPack.id}-source-segment-${index}`,
        coordinates: segment.map((point) => [point.longitude, point.latitude] as [number, number]),
        color: TACTICAL.amber,
      })),
    [geometrySegments, trailPack.id],
  );
  const loop = isLoopRoute(trailPack, geometry);
  const hasGeometry = routePoints.length >= 2;
  const routeSignature = routePoints
    .map((point) => `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`)
    .join('|');
  const cameraCommand = useMemo(
    () => buildExploreRoutePreviewCameraCommand(routePoints, 46).command,
    [routePoints],
  );
  const cameraCommandTrigger = useMemo(
    () => routeSignature.split('').reduce((hash, char) => ((hash * 31) + char.charCodeAt(0)) >>> 0, routePoints.length),
    [routeSignature, routePoints.length],
  );
  const waypoints = useMemo(
    () => {
      if (!hasGeometry) return [];
      const start = geometry[0];
      const end = geometry[geometry.length - 1];
      return [
        {
          id: `${trailPack.id}-start`,
          latitude: start.latitude,
          longitude: start.longitude,
          title: 'Route start',
        },
        {
          id: `${trailPack.id}-end`,
          latitude: end.latitude,
          longitude: end.longitude,
          title: loop ? 'Loop return' : 'Route end',
        },
      ];
    },
    [geometry, hasGeometry, loop, trailPack.id],
  );

  useEffect(() => {
    if (mapboxToken) return;

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
  }, [mapboxToken]);

  return (
    <View style={s.mapFrame}>
      <View style={s.mapSurfaceFrame}>
        {hasGeometry && tokenLoading && !mapboxToken ? (
          <>
            <View style={s.mapStatePanel}>
              <ActivityIndicator color={TACTICAL.amber} />
              <Text style={s.mapStateTitle}>Loading route map snapshot</Text>
              <Text style={s.mapStateText}>Preparing Mapbox rendering for this Trail Pack.</Text>
            </View>
          </>
        ) : hasGeometry ? (
          <MapRenderer
            points={mapRoutePoints}
            trailSegments={sourceTrailSegments}
            waypoints={waypoints}
            routeColor={TACTICAL.amber}
            mapStyle={DEFAULT_MAP_STYLE}
            mapboxToken={mapboxToken}
            hasToken={!!mapboxToken}
            isLoading={tokenLoading}
            motionPriority="warm"
            interactive={false}
            cameraMode="route_overview"
            cameraCommand={cameraCommand as CameraCommand | null}
            cameraCommandTrigger={cameraCommandTrigger}
            surfaceMode="compact"
            style={s.mapSurface}
          />
        ) : (
          <View style={s.noGeometryPanel}>
            <Ionicons name="map-outline" size={18} color={TACTICAL.textMuted} />
            <Text style={s.noGeometryText}>Route geometry unavailable. Preview details remain available.</Text>
          </View>
        )}

      </View>

      <View style={s.mapBadge}>
        <Ionicons name={loop ? 'sync-circle-outline' : 'git-branch-outline'} size={12} color={TACTICAL.amber} />
        <Text style={s.mapBadgeText}>{loop ? 'LOOP ROUTE' : 'POINT ROUTE'}</Text>
      </View>
    </View>
  );
}

export default function TrailPackPreviewModal({
  visible,
  trailPack,
  isSaved = false,
  onClose,
  onRoutePreview,
  routePreviewDisabled = false,
  routePreviewDisabledReason = null,
  onStartGuidance,
  onSave,
  onFeedback,
  offlineCacheAvailable = false,
  onCacheOffline,
  detailLoading = false,
  detailError = null,
}: TrailPackPreviewModalProps) {
  const insets = useSafeAreaInsets();
  const shellTopClearance =
    getShellHeaderTopPadding(insets.top) + ECS_TOP_SHELL_COMMAND_PILL_HEIGHT + 10;
  const shellBottomClearance = getShellBottomClearance(insets.bottom, 2);

  const guidanceReadiness = useMemo(
    () => (trailPack ? getTrailPackGuidanceReadiness(trailPack) : null),
    [trailPack],
  );
  const canStart = trailPack ? canStartTrailPackGuidance(trailPack) : false;
  const sourceLabel = trailPack ? trailPack.catalogVerification?.sourceLabel ?? getTrailPackSourceLabel(trailPack.source) : '';
  const detailAssessment = trailPack?.catalogVerification?.detailAssessment;
  const offlineCache = trailPack?.catalogVerification?.offlineCache;
  const currentCondition =
    detailAssessment?.currentCondition ??
    offlineCache?.currentCondition ??
    trailPack?.catalogVerification?.currentCondition;
  const effectiveOfflineCacheAvailable = offlineCacheAvailable || Boolean(offlineCache?.cacheable);
  const detailDataUsed = detailAssessment?.dataUsed?.length
    ? detailAssessment.dataUsed
    : trailPack?.catalogVerification?.dataUsed ?? [];
  const offlineSourceTimestamps = offlineCache?.sourceTimestamps ?? [];
  const offlineSourceAttribution = offlineCache?.sourceAttribution ?? [];
  const offlineFreshnessWarnings = offlineCache?.freshnessWarnings ?? [];
  const routeTypeLabel = trailPack ? getTrailPackRouteTypeLabel(trailPack.routeType) : '';
  const difficultyLabel = trailPack ? getTrailPackDifficultyLabel(trailPack.difficulty) : '';
  const warnings = useMemo(
    () => trailPack?.evaluatedConfidence.warnings.concat(trailPack.evaluatedConfidence.blockers).slice(0, 4) ?? [],
    [trailPack],
  );

  if (!trailPack || !guidanceReadiness) return null;

  const feedbackCount = trailPack.positiveFeedbackCount ?? 0;
  const completionCount = trailPack.completionCount ?? 0;
  const communitySummary = [
    `${feedbackCount} positive report${feedbackCount === 1 ? '' : 's'}`,
    `${completionCount} completion${completionCount === 1 ? '' : 's'}`,
  ].join(' | ');

  return (
    <TacticalPopupShell
      visible={visible}
      onClose={onClose}
      title="Trail Pack Preview"
      subtitle={trailPack.name}
      eyebrow={sourceLabel.toUpperCase()}
      icon="trail-sign-outline"
      overlayClass="workflow"
      maxWidth={980}
      maxHeightFraction={1}
      minHeightFraction={1}
      showHandle={false}
      scrollable
      topClearanceOverride={shellTopClearance}
      bottomClearanceOverride={shellBottomClearance}
      contentContainerStyle={s.fullHeightContent}
      footer={(
        <ECSOverlayFooter style={s.footer}>
          {onRoutePreview ? (
            <TouchableOpacity
              style={[s.secondaryAction, s.routePreviewAction, routePreviewDisabled && s.disabledAction]}
              activeOpacity={routePreviewDisabled ? 1 : 0.78}
              disabled={routePreviewDisabled}
              accessibilityRole="button"
              accessibilityLabel="Route Preview"
              accessibilityHint={routePreviewDisabledReason ?? 'Preview this Trail Pack on the map without starting guidance.'}
              accessibilityState={{ disabled: routePreviewDisabled }}
              onPress={() => {
                if (routePreviewDisabled) return;
                hapticMicro();
                onRoutePreview();
              }}
            >
              <Ionicons
                name="map-outline"
                size={14}
                color={routePreviewDisabled ? TACTICAL.textMuted : TACTICAL.amber}
              />
              <Text
                style={[
                  s.secondaryActionText,
                  s.routePreviewActionText,
                  routePreviewDisabled && s.secondaryActionTextDisabled,
                ]}
                numberOfLines={2}
              >
                ROUTE{'\n'}PREVIEW
              </Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[s.primaryAction, !canStart && s.primaryActionDisabled]}
            disabled={!canStart}
            accessibilityState={{ disabled: !canStart }}
              accessibilityHint={!canStart ? 'Route geometry is unavailable for this Trail Pack.' : undefined}
            activeOpacity={canStart ? 0.84 : 1}
            onPress={() => {
              if (!canStart) return;
              hapticMicro();
              onStartGuidance();
            }}
          >
            <Ionicons name="navigate-outline" size={14} color={canStart ? ECS.bgPrimary : TACTICAL.textMuted} />
            <Text style={[s.primaryActionText, !canStart && s.primaryActionTextDisabled]}>START</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.secondaryAction} activeOpacity={0.78} onPress={onSave}>
            <Ionicons name={isSaved ? 'star' : 'star-outline'} size={14} color={isSaved ? TACTICAL.amber : TACTICAL.textMuted} />
            <Text style={[s.secondaryActionText, isSaved && s.savedText]}>{isSaved ? 'SAVED' : 'SAVE'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.secondaryAction, !effectiveOfflineCacheAvailable && s.disabledAction]}
            activeOpacity={effectiveOfflineCacheAvailable ? 0.78 : 1}
            disabled={!effectiveOfflineCacheAvailable}
            accessibilityState={{ disabled: !effectiveOfflineCacheAvailable }}
            accessibilityHint={!effectiveOfflineCacheAvailable ? 'Offline cache unavailable for this Trail Pack.' : undefined}
            onPress={() => {
              if (!effectiveOfflineCacheAvailable) return;
              hapticMicro();
              onCacheOffline?.();
            }}
          >
            <Ionicons name="cloud-download-outline" size={14} color={effectiveOfflineCacheAvailable ? TACTICAL.amber : TACTICAL.textMuted} />
            <Text style={s.secondaryActionText}>CACHE</Text>
          </TouchableOpacity>
        </ECSOverlayFooter>
      )}
    >
      <View style={s.content}>
        <MapPreview trailPack={trailPack} />

        <View style={s.headerBlock}>
          <Text style={s.title}>{trailPack.name}</Text>
          <Text style={s.subtitle}>
            {routeTypeLabel} | {difficultyLabel} | ECS confidence {Math.round(trailPack.confidenceScore)}%
          </Text>
          <Text style={s.metaText}>{sourceLabel} | {formatDate(trailPack.lastVerifiedAt)}</Text>
          <Text style={s.metaText}>{guidanceReadiness.label} | {guidanceReadiness.description}</Text>
          <Text style={s.metaText}>{communitySummary}</Text>
        </View>

        {detailLoading ? (
          <View style={s.notice}>
            <ActivityIndicator color={TACTICAL.amber} size="small" />
            <Text style={s.noticeText}>Loading verified route detail, assessment, and cache metadata.</Text>
          </View>
        ) : null}

        {detailError ? (
          <View style={s.notice}>
            <Ionicons name="alert-circle-outline" size={13} color={TACTICAL.textMuted} />
            <Text style={s.noticeText}>{detailError}</Text>
          </View>
        ) : null}

        {!canStart ? (
          <View style={s.notice}>
            <Ionicons name="alert-circle-outline" size={13} color={TACTICAL.textMuted} />
            <Text style={s.noticeText}>{guidanceReadiness.description}</Text>
          </View>
        ) : null}

        {!effectiveOfflineCacheAvailable ? (
          <View style={s.notice}>
            <Ionicons name="cloud-offline-outline" size={13} color={TACTICAL.textMuted} />
            <Text style={s.noticeText}>Offline cache unavailable for this Trail Pack.</Text>
          </View>
        ) : null}

        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Ionicons
              name={guidanceReadiness.status === 'ready' ? 'navigate-circle-outline' : 'map-outline'}
              size={12}
              color={guidanceReadiness.status === 'ready' ? TACTICAL.amber : TACTICAL.textMuted}
            />
            <Text style={s.sectionTitle}>GUIDANCE STATUS</Text>
          </View>
          <View style={s.reasonRow}>
            <View style={[
              s.reasonDot,
              guidanceReadiness.status !== 'ready' && { backgroundColor: TACTICAL.textMuted },
            ]} />
            <Text style={s.reasonText}>
              {guidanceReadiness.label} | {guidanceReadiness.description}
              {guidanceReadiness.sourceSegmentCount ? ` | ${guidanceReadiness.sourceSegmentCount} source segment${guidanceReadiness.sourceSegmentCount === 1 ? '' : 's'}` : ''}
            </Text>
          </View>
        </View>

        {detailAssessment ? (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="shield-checkmark-outline" size={12} color={TACTICAL.amber} />
              <Text style={s.sectionTitle}>ROUTE ASSESSMENT</Text>
            </View>
            <View style={s.reasonRow}>
              <View style={s.reasonDot} />
              <Text style={s.reasonText}>
                STATUS | {detailAssessment.status.toUpperCase()} | Confidence {Math.round(detailAssessment.confidence)}%
              </Text>
            </View>
            {currentCondition ? (
              <>
                <View style={s.reasonRow}>
                  <View style={[
                    s.reasonDot,
                    currentCondition.status === 'blocked' || currentCondition.status === 'watch'
                      ? { backgroundColor: '#E6A23C' }
                      : null,
                  ]} />
                  <Text style={s.reasonText}>
                    CURRENT CONDITION | {currentCondition.label} | Open {currentCondition.currentlyOpenStatus.replace(/_/g, ' ')} | Passability {currentCondition.passabilityStatus.replace(/_/g, ' ')}
                  </Text>
                </View>
                {[...(currentCondition.blockers ?? []), ...(currentCondition.warnings ?? [])].slice(0, 3).map((warning) => (
                  <View key={`current-condition-${warning}`} style={s.reasonRow}>
                    <View style={[s.reasonDot, { backgroundColor: '#E6A23C' }]} />
                    <Text style={s.reasonText}>CURRENT CONDITION | {warning}</Text>
                  </View>
                ))}
              </>
            ) : null}
            {detailAssessment.why.slice(0, 3).map((reason) => (
              <View key={`why-${reason}`} style={s.reasonRow}>
                <View style={s.reasonDot} />
                <Text style={s.reasonText}>WHY | {reason}</Text>
              </View>
            ))}
            {detailAssessment.whatToWatch.slice(0, 3).map((watchItem) => (
              <View key={`watch-${watchItem}`} style={s.reasonRow}>
                <View style={s.reasonDot} />
                <Text style={s.reasonText}>WHAT TO WATCH | {watchItem}</Text>
              </View>
            ))}
            <View style={s.reasonRow}>
              <View style={s.reasonDot} />
              <Text style={s.reasonText}>RECOMMENDED ACTION | {detailAssessment.recommendedAction}</Text>
            </View>
            {detailAssessment.toImproveStatus.slice(0, 3).map((improvement) => (
              <View key={`improve-${improvement}`} style={s.reasonRow}>
                <View style={s.reasonDot} />
                <Text style={s.reasonText}>TO IMPROVE STATUS | {improvement}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {offlineCache ? (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="cloud-download-outline" size={12} color={TACTICAL.amber} />
              <Text style={s.sectionTitle}>OFFLINE CACHE</Text>
            </View>
            <View style={s.reasonRow}>
              <View style={s.reasonDot} />
              <Text style={s.reasonText}>
                CACHE STATUS | {offlineCache.cacheable ? 'Cacheable' : 'Unavailable'} | {formatDate(offlineCache.lastVerifiedAt ?? undefined)}
              </Text>
            </View>
            <View style={s.reasonRow}>
              <View style={s.reasonDot} />
              <Text style={s.reasonText}>{formatStaleDate(offlineCache.staleAt)}</Text>
            </View>
            {offlineSourceTimestamps.length > 0 ? (
              offlineSourceTimestamps.slice(0, 4).map((timestamp) => (
                <View key={`source-timestamp-${timestamp}`} style={s.reasonRow}>
                  <View style={s.reasonDot} />
                  <Text style={s.reasonText}>SOURCE TIMESTAMP | {formatCatalogTimestamp(timestamp)}</Text>
                </View>
              ))
            ) : (
              <View style={s.reasonRow}>
                <View style={s.reasonDot} />
                <Text style={s.reasonText}>SOURCE TIMESTAMP | unavailable</Text>
              </View>
            )}
            {offlineSourceAttribution.length > 0 ? (
              offlineSourceAttribution.slice(0, 4).map((source) => (
                <View key={`source-attribution-${source.providerId}-${source.label}`} style={s.reasonRow}>
                  <View style={s.reasonDot} />
                  <Text style={s.reasonText}>
                    ATTRIBUTION | {source.label}
                    {source.attribution ? ` | ${source.attribution}` : ''}
                    {source.license ? ` | ${source.license}` : ''}
                  </Text>
                </View>
              ))
            ) : (
              <View style={s.reasonRow}>
                <View style={s.reasonDot} />
                <Text style={s.reasonText}>ATTRIBUTION | unavailable</Text>
              </View>
            )}
            {offlineFreshnessWarnings.length > 0 ? (
              offlineFreshnessWarnings.slice(0, 4).map((warning) => (
                <View key={`freshness-warning-${warning}`} style={s.reasonRow}>
                  <View style={[s.reasonDot, { backgroundColor: '#E6A23C' }]} />
                  <Text style={s.reasonText}>FRESHNESS WARNING | {warning}</Text>
                </View>
              ))
            ) : (
              <View style={s.reasonRow}>
                <View style={s.reasonDot} />
                <Text style={s.reasonText}>FRESHNESS WARNING | none reported by catalog detail</Text>
              </View>
            )}
          </View>
        ) : null}

        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Ionicons name="analytics-outline" size={12} color={TACTICAL.amber} />
            <Text style={s.sectionTitle}>CONFIDENCE SIGNALS</Text>
          </View>
          {trailPack.confidenceReasons.slice(0, 4).map((reason) => (
            <View key={reason} style={s.reasonRow}>
              <View style={s.reasonDot} />
              <Text style={s.reasonText}>{reason}</Text>
            </View>
          ))}
        </View>

        {warnings.length > 0 ? (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="warning-outline" size={12} color="#E6A23C" />
              <Text style={[s.sectionTitle, { color: '#E6A23C' }]}>WARNINGS</Text>
            </View>
            {warnings.map((warning) => (
              <View key={warning} style={s.reasonRow}>
                <View style={[s.reasonDot, { backgroundColor: '#E6A23C' }]} />
                <Text style={s.reasonText}>{warning}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {detailDataUsed.length ? (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="server-outline" size={12} color={TACTICAL.amber} />
              <Text style={s.sectionTitle}>DATA USED</Text>
            </View>
            {detailDataUsed.slice(0, 4).map((source) => (
              <View key={`${source.providerId}-${source.label}`} style={s.reasonRow}>
                <View style={s.reasonDot} />
                <Text style={s.reasonText}>
                  {source.label} | {source.freshness.toUpperCase()} | {source.authority}
                  {source.lastVerifiedAt ? ` | Last checked ${formatCatalogTimestamp(source.lastVerifiedAt)}` : ' | Last checked unavailable'}
                  {source.attribution ? ` | ${source.attribution}` : ''}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Ionicons name="pulse-outline" size={12} color={TACTICAL.amber} />
            <Text style={s.sectionTitle}>TRAIL PACK FEEDBACK</Text>
          </View>
          <TrailPackFeedbackPanel onSubmit={onFeedback} />
        </View>
      </View>
    </TacticalPopupShell>
  );
}

const s = StyleSheet.create({
  fullHeightContent: {
    flexGrow: 1,
    minHeight: '100%',
    justifyContent: 'flex-start',
  },
  content: {
    padding: 14,
    gap: 12,
  },
  mapFrame: {
    height: 220,
    overflow: 'hidden',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '24',
    backgroundColor: '#0A0D10',
  },
  mapSurfaceFrame: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#0A0D10',
  },
  mapSurface: {
    flex: 1,
    minHeight: 218,
  },
  mapStatePanel: {
    flex: 1,
    minHeight: 218,
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
  mapBadge: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '28',
    backgroundColor: 'rgba(10,13,16,0.86)',
  },
  mapBadgeText: {
    color: TACTICAL.amber,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900',
    letterSpacing: 0,
  },
  noGeometryPanel: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 24,
  },
  noGeometryText: {
    color: TACTICAL.textMuted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0,
  },
  headerBlock: {
    gap: 4,
  },
  title: {
    color: TACTICAL.text,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '900',
    letterSpacing: 0,
  },
  subtitle: {
    color: TACTICAL.amber,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    letterSpacing: 0,
  },
  metaText: {
    color: TACTICAL.textMuted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    letterSpacing: 0,
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
  section: {
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgPanel,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    color: TACTICAL.amber,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '900',
    letterSpacing: 0,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
  },
  reasonDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: TACTICAL.amber,
    marginTop: 6,
  },
  reasonText: {
    flex: 1,
    color: TACTICAL.textMuted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    letterSpacing: 0,
  },
  footer: {
    flexWrap: 'wrap',
  },
  primaryAction: {
    minHeight: 40,
    minWidth: 106,
    borderRadius: 10,
    backgroundColor: TACTICAL.amber,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
  },
  primaryActionDisabled: {
    backgroundColor: ECS.bgElev,
    borderWidth: 1,
    borderColor: ECS.stroke,
    opacity: 0.62,
  },
  primaryActionText: {
    color: ECS.bgPrimary,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '900',
    letterSpacing: 0,
  },
  primaryActionTextDisabled: {
    color: TACTICAL.textMuted,
  },
  secondaryAction: {
    minHeight: 40,
    minWidth: 88,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
  },
  routePreviewAction: {
    borderColor: TACTICAL.amber + '38',
    backgroundColor: TACTICAL.amber + '10',
  },
  disabledAction: {
    opacity: 0.56,
  },
  secondaryActionText: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '900',
    letterSpacing: 0,
  },
  routePreviewActionText: {
    color: TACTICAL.amber,
  },
  secondaryActionTextDisabled: {
    color: TACTICAL.textMuted,
  },
  savedText: {
    color: TACTICAL.amber,
  },
});
