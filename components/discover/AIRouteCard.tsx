// ============================================================
// AI ROUTE CARD — Enhanced Discovery Route Card
// ============================================================
// Visually distinct card for ECS-inferred and enriched routes.
// Features:
//   - Route label badge (ECS-Inferred, Hidden Gem, Remote Option, etc.)
//   - Route confidence indicator
//   - Risk preview indicator
//   - Vehicle fit indicator
//   - Terrain, remoteness, difficulty chips
//   - Action buttons: Preview, Save, Build Route
// ============================================================

import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, GOLD_RAIL, ECS } from '../../lib/theme';
import { hapticMicro } from '../../lib/haptics';
import {
  getTerrainColor,
  getRemotenessLabel,
  getRemotenessColor,
} from '../../lib/discoverEngine';
import {
  type AIGeneratedRoute,
} from '../../lib/aiRouteTypes';
import {
  type EnrichedDiscoveryRoute,
  type RouteLabel,
  getRouteLabelConfig,
  getRouteLabelDisplay,
} from '../../lib/discoveryIntelligenceEngine';
import {
  deriveExploreRouteConfidence,
  getRouteConfidenceColor,
} from '../../lib/routeConfidencePresentation';
import {
  getExploreRemotenessRating,
  getExploreRouteConfidencePercent,
} from '../../lib/explore/exploreRemotenessPresentation';
import RouteConfidenceSummaryRow from './RouteConfidenceSummaryRow';
import {
  getExploreTrailThumbnail,
  type ExploreTrailThumbnailAssignment,
} from '../../lib/exploreTrailThumbnails';
import ExploreReadinessSummary from './ExploreReadinessSummary';
import {
  buildExploreRouteReadinessAssessment,
  getExploreRouteReadinessSummary,
} from '../../lib/readiness/exploreRouteReadiness';

interface AIRouteCardProps {
  route: AIGeneratedRoute;
  enrichedRoute?: EnrichedDiscoveryRoute | null;
  hasVehicle?: boolean;
  isFavorited?: boolean;
  onPreview: () => void;
  onNavigate?: () => void;
  onToggleFavorite?: () => void;
  onBuildRoute?: () => void;
  buildRouteDisabled?: boolean;
  buildRouteDisabledReason?: string | null;
  compactPreview?: boolean;
  thumbnailOverride?: ExploreTrailThumbnailAssignment | null;
}

export default function AIRouteCard({
  route,
  enrichedRoute,
  hasVehicle = false,
  isFavorited = false,
  onPreview,
  onNavigate,
  onToggleFavorite,
  onBuildRoute,
  buildRouteDisabled = false,
  buildRouteDisabledReason = null,
  compactPreview = false,
  thumbnailOverride,
}: AIRouteCardProps) {
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const terrainColor = getTerrainColor(route.terrainType);
  const remotenessColor = getRemotenessColor(route.remotenessScore);
  const remotenessLabel = getRemotenessLabel(route.remotenessScore);

  // Use enriched route label or fallback to AI label
  const routeLabel: RouteLabel = enrichedRoute?.routeLabel ?? 'ECS Suggested';
  const labelConfig = getRouteLabelConfig(routeLabel);
  const routeLabelDisplay = getRouteLabelDisplay(routeLabel);
  const routeConfidence = deriveExploreRouteConfidence(enrichedRoute ?? {
    routeLabel,
    isAIGenerated: true,
    aiConfidence: route.confidence,
    startLat: route.startLat,
    startLng: route.startLng,
    distanceMiles: route.distanceMiles,
  });
  const confidenceColor = getRouteConfidenceColor(routeConfidence.level);
  const remotenessRating = getExploreRemotenessRating(enrichedRoute ?? route);
  const routeConfidencePercent = getExploreRouteConfidencePercent(enrichedRoute ?? route, routeConfidence);
  const thumbnail = thumbnailOverride ?? getExploreTrailThumbnail(enrichedRoute ?? route);
  const showThumbnail = !!thumbnail?.uri && thumbnail.state !== 'suppressed_mismatch' && !thumbnailFailed;

  // Risk preview from enriched route
  const riskPreview = enrichedRoute?.riskPreview;
  const vehicleMatch = enrichedRoute?.vehicleMatch;
  const isGem = enrichedRoute?.gemScore?.isGem ?? false;
  const matchScore = vehicleMatch?.score ?? route.matchScore ?? route.rigCompatibility ?? null;
  const matchColor = vehicleMatch?.color ?? TACTICAL.amber;
  const explanationLine = enrichedRoute?.explanation?.text ?? null;

  const getDiffLabel = (d: number): string => {
    if (d <= 2) return 'EASY';
    if (d <= 4) return 'MODERATE';
    if (d <= 6) return 'CHALLENGING';
    if (d <= 8) return 'HARD';
    return 'EXTREME';
  };
  const getDiffColor = (d: number): string => {
    if (d <= 2) return '#66BB6A';
    if (d <= 4) return '#5AC8FA';
    if (d <= 6) return '#D4A017';
    if (d <= 8) return '#E67E22';
    return '#E04030';
  };

  const diffLabel = getDiffLabel(route.terrainDifficulty ?? 5);
  const diffColor = getDiffColor(route.terrainDifficulty ?? 5);
  const readinessRoute = enrichedRoute ?? route;
  const readinessAssessment = useMemo(
    () => buildExploreRouteReadinessAssessment(readinessRoute, { hasVehicle }),
    [readinessRoute, hasVehicle],
  );
  const readinessSummary = useMemo(
    () => getExploreRouteReadinessSummary(readinessAssessment, readinessRoute, { hasVehicle }),
    [readinessAssessment, readinessRoute, hasVehicle],
  );

  return (
    <TouchableOpacity
      style={[s.card, compactPreview && s.cardCompact]}
      activeOpacity={0.82}
      onPress={() => { hapticMicro(); onPreview(); }}
    >
      {/* Left accent bar */}
      <View style={s.accentBar}>
        <View style={[s.accentTop, { backgroundColor: labelConfig.color }]} />
        <View style={[s.accentBot, { backgroundColor: riskPreview?.color ?? confidenceColor }]} />
      </View>

      <View style={[s.cardBody, compactPreview && s.cardBodyCompact]}>
        {/* Badge Row */}
        <View style={s.badgeRowWrap}>
          <View style={s.badgeRow}>
            <View style={[s.routeLabelBadge, { borderColor: labelConfig.color + '50', backgroundColor: labelConfig.color + '14' }]}>
              <Ionicons name={labelConfig.icon as any} size={9} color={labelConfig.color} />
              <Text style={[s.routeLabelText, { color: labelConfig.color }]}>{routeLabelDisplay.toUpperCase()}</Text>
            </View>
            {isGem && (
              <View style={s.gemBadge}>
                <Ionicons name="diamond-outline" size={8} color="#E67E22" />
              </View>
            )}
          </View>

          {onToggleFavorite ? (
            <TouchableOpacity
              style={[s.favoriteToggle, isFavorited && s.favoriteToggleActive]}
              activeOpacity={0.72}
              onPress={(event) => {
                event.stopPropagation?.();
                hapticMicro();
                onToggleFavorite();
              }}
            >
              <Ionicons
                name={isFavorited ? 'star' : 'star-outline'}
                size={12}
                color={isFavorited ? TACTICAL.amber : TACTICAL.textMuted}
              />
              <Text style={[s.favoriteToggleText, isFavorited && s.favoriteToggleTextActive]}>
                {isFavorited ? 'SAVED' : 'SAVE'}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Name + Region */}
        <View style={s.nameBlock}>
          <Text style={s.cardName} numberOfLines={2}>{route.name}</Text>
          <Text style={s.cardRegion}>{route.region}</Text>
        </View>

        {showThumbnail ? (
          <View style={[s.thumbnailFrame, compactPreview && s.thumbnailFrameCompact]}>
            <Image
              source={{ uri: thumbnail.uri as string }}
              style={s.thumbnailImage}
              resizeMode="cover"
              accessibilityLabel={`${route.name} route thumbnail`}
              onError={() => setThumbnailFailed(true)}
            />
            <View style={s.thumbnailScrim} />
            <View style={s.thumbnailBadge}>
              <Ionicons name="image-outline" size={9} color={TACTICAL.amber} />
              <Text style={s.thumbnailBadgeText}>ROUTE VISUAL</Text>
            </View>
          </View>
        ) : null}

        {/* Key Stats Row */}
        <View style={[s.statsRow, compactPreview && s.statsRowCompact]}>
          {route.distanceFromUserMiles != null && (
            <View style={s.statItem}>
              <Ionicons name="navigate-outline" size={11} color={TACTICAL.amber} />
              <Text style={s.statValue}>{route.distanceFromUserMiles}</Text>
              <Text style={s.statUnit}>MI AWAY</Text>
            </View>
          )}
          <View style={s.statItem}>
            <Ionicons name="calendar-outline" size={10} color={TACTICAL.textMuted} />
            <Text style={s.statValue}>{route.estimatedDays}</Text>
            <Text style={s.statUnit}>{route.estimatedDays === 1 ? 'DAY' : 'DAYS'}</Text>
          </View>
          {compactPreview && matchScore != null && matchScore > 0 ? (
            <View style={s.statItem}>
              <Ionicons name="car-outline" size={10} color={matchColor} />
              <Text style={[s.statValue, { color: matchColor }]}>{Math.round(matchScore)}%</Text>
              <Text style={s.statUnit}>FIT</Text>
            </View>
          ) : null}
          {!compactPreview ? (
            <View style={s.statItem}>
              <Ionicons name="resize-outline" size={10} color={TACTICAL.textMuted} />
              <Text style={s.statValue}>{route.distanceMiles}</Text>
              <Text style={s.statUnit}>MI</Text>
            </View>
          ) : null}
          {!compactPreview && riskPreview && (
            <View style={s.statItem}>
              <Ionicons name="shield-outline" size={10} color={riskPreview.color} />
              <Text style={[s.statValue, { color: riskPreview.color }]}>{riskPreview.level.toUpperCase().slice(0, 3)}</Text>
              <Text style={s.statUnit}>RISK</Text>
            </View>
          )}
        </View>

        <View style={s.remoteDecisionRow}>
          <View style={[s.remoteDecisionBadge, { borderColor: remotenessColor + '40', backgroundColor: remotenessColor + '0C' }]}>
            <Ionicons name="radio-outline" size={9} color={remotenessColor} />
            <Text style={[s.remoteDecisionText, { color: remotenessColor }]}>
              Remote: {remotenessRating}
            </Text>
          </View>
          <View style={[s.remoteDecisionBadge, { borderColor: confidenceColor + '40', backgroundColor: confidenceColor + '0C' }]}>
            <Ionicons name="pulse-outline" size={9} color={confidenceColor} />
            <Text style={[s.remoteDecisionText, { color: confidenceColor }]}>
              Confidence: {routeConfidencePercent}%
            </Text>
          </View>
        </View>

        <ExploreReadinessSummary
          assessment={readinessAssessment}
          summary={readinessSummary}
          compact={compactPreview}
        />

        {!compactPreview ? (
          <>
            {/* Description */}
            <Text style={s.description} numberOfLines={2}>{route.description}</Text>
            <RouteConfidenceSummaryRow result={routeConfidence} />
            {explanationLine ? (
              <Text style={s.explanationLine} numberOfLines={2}>
                {explanationLine}
              </Text>
            ) : null}

            {/* Chip Row */}
            <View style={s.chipRow}>
              <View style={[s.chip, { borderColor: terrainColor + '40', backgroundColor: terrainColor + '0C' }]}>
                <Ionicons name="trail-sign-outline" size={8} color={terrainColor} />
                <Text style={[s.chipText, { color: terrainColor }]}>{route.terrainType.toUpperCase()}</Text>
              </View>
              <View style={[s.chip, { borderColor: remotenessColor + '40', backgroundColor: remotenessColor + '0C' }]}>
                <Ionicons name="radio-outline" size={8} color={remotenessColor} />
                <Text style={[s.chipText, { color: remotenessColor }]}>{remotenessLabel}</Text>
              </View>
              <View style={[s.chip, { borderColor: diffColor + '40', backgroundColor: diffColor + '0C' }]}>
                <Ionicons name="speedometer-outline" size={8} color={diffColor} />
                <Text style={[s.chipText, { color: diffColor }]}>{diffLabel}</Text>
              </View>
              {vehicleMatch && vehicleMatch.score > 0 && (
                <View style={[s.chip, { borderColor: vehicleMatch.color + '40', backgroundColor: vehicleMatch.color + '0C' }]}>
                  <Ionicons name="car-outline" size={8} color={vehicleMatch.color} />
                  <Text style={[s.chipText, { color: vehicleMatch.color }]}>{vehicleMatch.level.toUpperCase()}</Text>
                </View>
              )}
            </View>

            {/* Action Row */}
            <View style={s.actionRow}>
              {onNavigate ? (
                <TouchableOpacity
                  style={s.actionBtn}
                  activeOpacity={0.7}
                  onPress={(event) => {
                    event.stopPropagation?.();
                    onNavigate();
                  }}
                >
                  <Ionicons name="navigate-outline" size={11} color={TACTICAL.amber} />
                  <Text style={[s.actionBtnText, { color: TACTICAL.amber }]}>NAVIGATE</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[s.actionBtn, buildRouteDisabled && s.actionBtnDisabled]}
                activeOpacity={buildRouteDisabled ? 1 : 0.7}
                disabled={buildRouteDisabled}
                accessibilityRole="button"
                accessibilityLabel="Build Route"
                accessibilityHint={buildRouteDisabledReason ?? undefined}
                accessibilityState={{ disabled: buildRouteDisabled }}
                onPress={(event) => {
                  event.stopPropagation?.();
                  if (buildRouteDisabled) return;
                  hapticMicro();
                  onBuildRoute?.();
                }}
              >
                <Ionicons
                  name="compass-outline"
                  size={11}
                  color={buildRouteDisabled ? TACTICAL.textMuted : TACTICAL.textMuted}
                />
                <Text
                  style={[s.actionBtnText, buildRouteDisabled && s.actionBtnTextDisabled]}
                  numberOfLines={2}
                >
                  BUILD{'\n'}ROUTE
                </Text>
              </TouchableOpacity>
              <View style={{ flex: 1 }} />
              <Ionicons name="chevron-forward" size={12} color={TACTICAL.textMuted} />
            </View>
          </>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: ECS.bgPanel,
    borderRadius: ECS.radius,
    borderWidth: 1,
    borderColor: '#5AC8FA18',
    marginBottom: 10,
    overflow: 'hidden',
  },
  cardCompact: {
    marginBottom: 4,
  },
  accentBar: { width: 4, flexDirection: 'column' },
  accentTop: { flex: 1 },
  accentBot: { flex: 1 },
  cardBody: { flex: 1, padding: 14, gap: 8 },
  cardBodyCompact: { padding: 10, gap: 6 },

  badgeRowWrap: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  badgeRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  routeLabelBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1,
  },
  routeLabelText: { fontSize: 7, fontWeight: '900', letterSpacing: 1.5 },
  gemBadge: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: '#E67E220C', borderWidth: 1, borderColor: '#E67E2240',
    alignItems: 'center', justifyContent: 'center',
  },
  favoriteToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
  },
  favoriteToggleActive: {
    borderColor: TACTICAL.amber + '40',
    backgroundColor: TACTICAL.amber + '0C',
  },
  favoriteToggleText: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: TACTICAL.textMuted,
  },
  favoriteToggleTextActive: {
    color: TACTICAL.amber,
  },

  nameBlock: { gap: 2 },
  cardName: { fontSize: 15, fontWeight: '700', color: ECS.text, letterSpacing: 1 },
  cardRegion: { fontSize: 11, fontWeight: '500', color: TACTICAL.textMuted, letterSpacing: 0.5 },
  thumbnailFrame: {
    height: 76,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: ECS.strokeMuted,
    backgroundColor: ECS.bgElev,
  },
  thumbnailFrameCompact: {
    height: 58,
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  thumbnailScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  thumbnailBadge: {
    position: 'absolute',
    left: 8,
    bottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: TACTICAL.goldSoft,
    backgroundColor: 'rgba(10,12,14,0.72)',
  },
  thumbnailBadgeText: {
    color: TACTICAL.goldMedium,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0,
  },

  statsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 4, paddingHorizontal: 2,
    borderTopWidth: GOLD_RAIL.subsectionWidth, borderTopColor: GOLD_RAIL.internal,
  },
  statsRowCompact: {
    gap: 10,
    paddingVertical: 3,
  },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statValue: { fontSize: 13, fontWeight: '800', fontFamily: 'Courier', color: TACTICAL.amber, letterSpacing: -0.5 },
  statUnit: { fontSize: 7, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1 },
  remoteDecisionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  remoteDecisionBadge: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
  },
  remoteDecisionText: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1.1,
    color: TACTICAL.amber,
  },

  description: { fontSize: 11, fontWeight: '500', color: TACTICAL.textMuted, lineHeight: 16, letterSpacing: 0.2 },
  explanationLine: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
    color: TACTICAL.textMuted,
  },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 3, borderRadius: 5, borderWidth: 1,
    borderColor: ECS.stroke, backgroundColor: ECS.bgElev,
  },
  chipText: { fontSize: 7, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 0.5 },

  actionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingTop: 4, borderTopWidth: GOLD_RAIL.subsectionWidth, borderTopColor: GOLD_RAIL.internal,
  },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    minWidth: 88,
    paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, borderWidth: 1,
    borderColor: ECS.stroke, backgroundColor: ECS.bgElev,
  },
  actionBtnDisabled: {
    opacity: 0.48,
  },
  actionBtnActive: { borderColor: TACTICAL.amber + '40', backgroundColor: TACTICAL.amber + '0C' },
  actionBtnText: {
    fontSize: 7,
    lineHeight: 8.5,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.2,
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
    flexShrink: 1,
  },
  actionBtnTextDisabled: {
    color: TACTICAL.textMuted,
  },
});



