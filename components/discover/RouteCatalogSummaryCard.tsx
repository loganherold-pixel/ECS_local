import React, { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { ECSCard } from '../ECSSurface';
import { SourceTruthInspectorTrigger } from '../source-truth';
import { ECS, TACTICAL } from '../../lib/theme';
import type { RouteCatalogSummary } from '../../lib/routeDataContracts';
import { buildRouteCatalogSourceTruthBinding } from '../../lib/sourceTruthAdapters';
import {
  ECS_ROUTE_IMAGE_NEUTRAL_FALLBACK_URI,
  resolveRouteCardImage,
  routeCardImageCache,
} from '../../lib/explore/routeImageResolver';

type RouteCatalogSummaryCardProps = {
  summary: RouteCatalogSummary;
  onOpenTripBuilder: (routeId: string) => void;
  tripBuilderDisabledReason?: string | null;
  compactPreview?: boolean;
};

function formatMeters(meters: number | null): string | null {
  if (meters == null || !Number.isFinite(meters)) return null;
  return `${Math.round((meters / 1609.344) * 10) / 10} mi`;
}

function formatDuration(seconds: number | null): string | null {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.round(minutes)} min`;
  return `${Math.round((minutes / 60) * 10) / 10} hr`;
}

function formatSource(sourceType: RouteCatalogSummary['sourceType']): string {
  switch (sourceType) {
    case 'official':
      return 'Official';
    case 'community':
      return 'Community';
    case 'imported':
      return 'Imported';
    case 'preview':
      return 'Preview';
    default:
      return 'Catalog';
  }
}

function formatUpdatedAt(updatedAt: string | null): string | null {
  if (!updatedAt) return null;
  const timestamp = Date.parse(updatedAt);
  if (!Number.isFinite(timestamp)) return null;
  return `Updated ${new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })}`;
}

export default function RouteCatalogSummaryCard({
  summary,
  onOpenTripBuilder,
  tripBuilderDisabledReason = null,
  compactPreview = false,
}: RouteCatalogSummaryCardProps) {
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const distance = formatMeters(summary.distanceMeters);
  const duration = formatDuration(summary.estimatedDurationSeconds);
  const updatedAt = formatUpdatedAt(summary.updatedAt);
  const metaLine = [
    distance,
    duration,
    summary.difficulty,
    summary.forestName ?? summary.region,
  ].filter(Boolean).join(' | ');
  const statusLine = [
    summary.communityRating != null ? `${Math.round(summary.communityRating * 100)}% community` : null,
    summary.popularityScore != null ? `${Math.round(summary.popularityScore)} activity` : null,
    updatedAt,
  ].filter(Boolean).join(' | ');
  const sourceTruthBinding = buildRouteCatalogSourceTruthBinding(summary);
  const resolvedThumbnail = useMemo(
    () => resolveRouteCardImage({
      routeId: summary.routeId,
      title: summary.title,
      remoteThumbnailUri: thumbnailFailed ? null : summary.thumbnailUrl,
      route: {
        id: summary.routeId,
        name: summary.title,
        region: summary.forestName ?? summary.region ?? undefined,
        imageTag: summary.thumbnailAssetKey ?? undefined,
        terrainType: summary.difficulty ?? undefined,
        category: summary.tags.join(' '),
        startLat: summary.trailheadCoordinate?.latitude,
        startLng: summary.trailheadCoordinate?.longitude,
      },
      imageCache: routeCardImageCache,
    }),
    [summary, thumbnailFailed],
  );
  const thumbnailUri = resolvedThumbnail.uri === ECS_ROUTE_IMAGE_NEUTRAL_FALLBACK_URI
    ? null
    : resolvedThumbnail.uri;

  useEffect(() => {
    setThumbnailFailed(false);
  }, [summary.routeId]);

  return (
    <ECSCard variant="primary" style={[s.card, compactPreview && s.cardCompact]}>
      <View style={s.accentBar} />
      <View style={s.body}>
        <View style={s.headerRow}>
          <View style={s.thumbnailFrame}>
            {thumbnailUri ? (
              <Image
                source={{ uri: thumbnailUri }}
                style={s.thumbnail}
                resizeMode="cover"
                accessibilityLabel={`${summary.title} route thumbnail`}
                accessibilityIgnoresInvertColors
                onLoad={() => routeCardImageCache.markLoaded(summary.routeId, thumbnailUri)}
                onError={() => {
                  routeCardImageCache.markFailed(thumbnailUri);
                  setThumbnailFailed(true);
                }}
              />
            ) : (
              <View style={s.thumbnailFallback}>
                <Ionicons name="trail-sign-outline" size={18} color={TACTICAL.amber} />
              </View>
            )}
          </View>
          <View style={s.titleBlock}>
            <Text style={s.eyebrow}>ROUTE SUMMARY</Text>
            <Text style={s.title} numberOfLines={2}>{summary.title}</Text>
          </View>
          <SourceTruthInspectorTrigger
            source={sourceTruthBinding.ref}
            sources={sourceTruthBinding.sources}
            policyKey={sourceTruthBinding.policyKey}
            dependencies={sourceTruthBinding.dependencies}
            label={formatSource(summary.sourceType)}
            badgeTone={summary.sourceType === 'preview' ? 'warning' : 'category'}
            badgeIcon="trail-sign-outline"
            testID={`route-source-truth-${summary.routeId}`}
          />
        </View>
        {metaLine ? <Text style={s.metaText}>{metaLine}</Text> : null}
        {statusLine ? <Text style={s.subtleText}>{statusLine}</Text> : null}
        {summary.tags.length > 0 ? (
          <View style={s.tagRow}>
            {summary.tags.slice(0, 3).map((tag) => (
              <Text key={tag} style={s.tag}>{tag}</Text>
            ))}
          </View>
        ) : null}
        <View style={s.actionRow}>
          <TouchableOpacity
            style={[s.primaryAction, tripBuilderDisabledReason && s.primaryActionDisabled]}
            onPress={() => onOpenTripBuilder(summary.routeId)}
            disabled={!!tripBuilderDisabledReason}
            activeOpacity={0.75}
            accessibilityLabel={`Open ${summary.title} in Trip Builder`}
            accessibilityHint={tripBuilderDisabledReason ?? undefined}
            accessibilityState={{ disabled: !!tripBuilderDisabledReason }}
            testID={`route-catalog-open-trip-builder-${summary.routeId}`}
          >
            <Ionicons name="git-merge-outline" size={13} color={TACTICAL.bg} />
            <Text style={s.primaryActionText}>OPEN TRIP BUILDER</Text>
          </TouchableOpacity>
        </View>
        {tripBuilderDisabledReason ? (
          <Text style={s.disabledReason}>{tripBuilderDisabledReason}</Text>
        ) : null}
      </View>
    </ECSCard>
  );
}

const s = StyleSheet.create({
  card: {
    overflow: 'hidden',
  },
  cardCompact: {
    minHeight: 0,
  },
  accentBar: {
    height: 3,
    backgroundColor: TACTICAL.amber,
  },
  body: {
    padding: 12,
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  thumbnailFrame: {
    width: 76,
    height: 58,
    flexShrink: 0,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
    overflow: 'hidden',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbnailFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0,
  },
  title: {
    color: TACTICAL.text,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0,
    marginTop: 2,
  },
  metaText: {
    color: TACTICAL.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0,
  },
  subtleText: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    color: TACTICAL.textMuted,
    backgroundColor: ECS.bgElev,
    borderColor: ECS.stroke,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 3,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  primaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: TACTICAL.amber,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  primaryActionDisabled: {
    opacity: 0.48,
  },
  primaryActionText: {
    color: TACTICAL.bg,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0,
  },
  secondaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderColor: ECS.stroke,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  secondaryActionText: {
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0,
  },
  iconAction: {
    width: 34,
    height: 34,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: ECS.stroke,
    borderWidth: StyleSheet.hairlineWidth,
  },
  disabledReason: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
});
