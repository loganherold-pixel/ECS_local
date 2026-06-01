import React, { useMemo } from 'react';
import {
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
  getTrailPackGeometryCoordinates,
  getTrailPackRouteTypeLabel,
  getTrailPackSourceLabel,
  type ECSTrailPackDiscoveryItem,
} from '../../lib/explore/trailPacks';
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
};

type ProjectedPoint = { x: number; y: number };

const MAP_WIDTH = 320;
const MAP_HEIGHT = 190;
const MAP_PADDING = 28;

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

function projectGeometry(points: ReturnType<typeof getTrailPackGeometryCoordinates>): ProjectedPoint[] {
  if (points.length === 0) return [];
  const lats = points.map((point) => point.latitude);
  const lngs = points.map((point) => point.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latSpan = Math.max(maxLat - minLat, 0.0001);
  const lngSpan = Math.max(maxLng - minLng, 0.0001);
  const drawableWidth = MAP_WIDTH - MAP_PADDING * 2;
  const drawableHeight = MAP_HEIGHT - MAP_PADDING * 2;

  return points.map((point) => ({
    x: MAP_PADDING + ((point.longitude - minLng) / lngSpan) * drawableWidth,
    y: MAP_PADDING + (1 - (point.latitude - minLat) / latSpan) * drawableHeight,
  }));
}

function isLoopRoute(trailPack: ECSTrailPackDiscoveryItem, points: ReturnType<typeof getTrailPackGeometryCoordinates>): boolean {
  if (trailPack.routeType === 'loop') return true;
  if (points.length < 3) return false;
  return distanceMilesBetween(points[0], points[points.length - 1]) <= 0.5;
}

function RouteSegment({ from, to }: { from: ProjectedPoint; to: ProjectedPoint }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.max(1, Math.sqrt(dx * dx + dy * dy));
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return (
    <View
      style={[
        s.routeSegment,
        {
          left: from.x,
          top: from.y,
          width: length,
          transform: [{ rotateZ: `${angle}deg` }],
        },
      ]}
    />
  );
}

function MapPreview({ trailPack }: { trailPack: ECSTrailPackDiscoveryItem }) {
  const geometry = getTrailPackGeometryCoordinates(trailPack);
  const projected = projectGeometry(geometry);
  const loop = isLoopRoute(trailPack, geometry);
  const hasGeometry = projected.length >= 2;
  const start = projected[0];
  const end = projected[projected.length - 1];

  return (
    <View style={s.mapFrame}>
      <View style={s.mapGrid}>
        <View style={[s.gridLineH, { top: '25%' }]} />
        <View style={[s.gridLineH, { top: '50%' }]} />
        <View style={[s.gridLineH, { top: '75%' }]} />
        <View style={[s.gridLineV, { left: '25%' }]} />
        <View style={[s.gridLineV, { left: '50%' }]} />
        <View style={[s.gridLineV, { left: '75%' }]} />

        {hasGeometry ? (
          <>
            {projected.slice(0, -1).map((point, index) => (
              <RouteSegment
                key={`${point.x}-${point.y}-${index}`}
                from={point}
                to={projected[index + 1]}
              />
            ))}
            <View style={[s.marker, s.startMarker, { left: start.x - 8, top: start.y - 8 }]}>
              <Text style={s.markerText}>S</Text>
            </View>
            <View style={[s.marker, s.endMarker, { left: end.x - 8, top: end.y - 8 }]}>
              <Text style={s.markerText}>{loop ? 'L' : 'E'}</Text>
            </View>
          </>
        ) : (
          <View style={s.noGeometryPanel}>
            <Ionicons name="map-outline" size={18} color={TACTICAL.textMuted} />
            <Text style={s.noGeometryText}>Route geometry unavailable. Preview details remain available.</Text>
          </View>
        )}

        <View style={s.mapBadge}>
          <Ionicons name={loop ? 'sync-circle-outline' : 'git-branch-outline'} size={12} color={TACTICAL.amber} />
          <Text style={s.mapBadgeText}>{loop ? 'LOOP ROUTE' : 'POINT ROUTE'}</Text>
        </View>
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
}: TrailPackPreviewModalProps) {
  const insets = useSafeAreaInsets();
  const shellTopClearance =
    getShellHeaderTopPadding(insets.top) + ECS_TOP_SHELL_COMMAND_PILL_HEIGHT + 10;
  const shellBottomClearance = getShellBottomClearance(insets.bottom, 2);

  const canStart = trailPack ? canStartTrailPackGuidance(trailPack) : false;
  const sourceLabel = trailPack ? getTrailPackSourceLabel(trailPack.source) : '';
  const routeTypeLabel = trailPack ? getTrailPackRouteTypeLabel(trailPack.routeType) : '';
  const difficultyLabel = trailPack ? getTrailPackDifficultyLabel(trailPack.difficulty) : '';
  const warnings = useMemo(
    () => trailPack?.evaluatedConfidence.warnings.concat(trailPack.evaluatedConfidence.blockers).slice(0, 4) ?? [],
    [trailPack],
  );

  if (!trailPack) return null;

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
            style={[s.secondaryAction, !offlineCacheAvailable && s.disabledAction]}
            activeOpacity={offlineCacheAvailable ? 0.78 : 1}
            disabled={!offlineCacheAvailable}
            accessibilityState={{ disabled: !offlineCacheAvailable }}
            accessibilityHint={!offlineCacheAvailable ? 'Offline cache unavailable for this Trail Pack.' : undefined}
            onPress={() => {
              if (!offlineCacheAvailable) return;
              hapticMicro();
              onCacheOffline?.();
            }}
          >
            <Ionicons name="cloud-download-outline" size={14} color={offlineCacheAvailable ? TACTICAL.amber : TACTICAL.textMuted} />
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
          <Text style={s.metaText}>{communitySummary}</Text>
        </View>

        {!canStart ? (
          <View style={s.notice}>
            <Ionicons name="alert-circle-outline" size={13} color={TACTICAL.textMuted} />
            <Text style={s.noticeText}>Missing geometry is handled safely: this Trail Pack can be reviewed, but Start Guidance is disabled.</Text>
          </View>
        ) : null}

        {!offlineCacheAvailable ? (
          <View style={s.notice}>
            <Ionicons name="cloud-offline-outline" size={13} color={TACTICAL.textMuted} />
            <Text style={s.noticeText}>Offline cache unavailable for this Trail Pack.</Text>
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
    alignItems: 'center',
    paddingVertical: 4,
  },
  mapGrid: {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    maxWidth: '100%',
    overflow: 'hidden',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '24',
    backgroundColor: '#0A0D10',
  },
  gridLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(230,184,76,0.10)',
  },
  gridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(230,184,76,0.10)',
  },
  routeSegment: {
    position: 'absolute',
    height: 3,
    borderRadius: 2,
    backgroundColor: TACTICAL.amber,
    transformOrigin: '0px 1.5px',
  },
  marker: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  startMarker: {
    backgroundColor: '#66BB6A',
    borderColor: '#A8E6B0',
  },
  endMarker: {
    backgroundColor: '#5AC8FA',
    borderColor: '#B6E7FF',
  },
  markerText: {
    color: '#071014',
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900',
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
