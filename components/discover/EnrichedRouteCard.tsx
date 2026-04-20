// ============================================================
// ENRICHED ROUTE CARD — Known Route with Discovery Intelligence
// ============================================================
// Displays a known route card enriched with:
//   - Route label (Known Route, Hidden Gem, Remote Option, etc.)
//   - Risk preview indicator
//   - Vehicle match indicator
//   - Hidden gem badge
//   - All standard route information
// ============================================================

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, GOLD_RAIL, ECS } from '../../lib/theme';
import { hapticMicro } from '../../lib/haptics';
import { ECSButton } from '../ECSButton';
import ECSActionRow from '../ECSActionRow';
import { ECSChip } from '../ECSChip';
import { ECSCard, ECSCardFooter } from '../ECSSurface';
import { ECSBadge } from '../ECSStatus';
import { ECS_TEXT, ECS_TEXT_SPACING } from '../../lib/ecsTypographyTokens';
import {
  getTerrainColor,
  getRemotenessLabel,
  getRemotenessColor,
} from '../../lib/discoverEngine';
import {
  type EnrichedDiscoveryRoute,
  getRouteLabelConfig,
} from '../../lib/discoveryIntelligenceEngine';
import { getExploreTrailThumbnail } from '../../lib/exploreTrailThumbnails';
import { formatConfidenceCompactLine } from '../../lib/ai/confidenceEngine';
import { formatTrustCompactLine } from '../../lib/ai/trustContract';
import { useAdaptiveLayout } from '../../lib/useAdaptiveLayout';

type ExploreCardPresentationVariant = 'default' | 'hidden-gem' | 'popular-trail';

interface EnrichedRouteCardProps {
  route: EnrichedDiscoveryRoute;
  hasVehicle: boolean;
  isCompleted?: boolean;
  isFavorited?: boolean;
  onSelect: () => void;
  onNavigate?: () => void;
  onToggleFavorite?: () => void;
  presentationVariant?: ExploreCardPresentationVariant;
  collectionLabel?: string;
}

export default function EnrichedRouteCard({
  route,
  hasVehicle: _hasVehicle,
  isCompleted = false,
  isFavorited = false,
  onSelect,
  onNavigate,
  onToggleFavorite,
  presentationVariant = 'default',
  collectionLabel,
}: EnrichedRouteCardProps) {
  const adaptive = useAdaptiveLayout();
  const terrainColor = getTerrainColor(route.terrainType);
  const remotenessColor = getRemotenessColor(route.remotenessScore);
  const remotenessLabel = getRemotenessLabel(route.remotenessScore);
  const labelConfig = getRouteLabelConfig(route.routeLabel);
  const thumbnail = getExploreTrailThumbnail(route);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const riskPreview = route.riskPreview;
  const vehicleMatch = route.vehicleMatch;
  const summaryText = route.routeLabel === 'Hidden Gem'
    ? (vehicleMatch?.score ?? 0) > 0 && !(vehicleMatch?.note?.startsWith('Loadout not ready'))
      ? vehicleMatch.note
      : 'Curated lower-traffic route for local Explore planning'
    : route.routeLabel === 'Known Route' || route.routeLabel === 'Local Favorite'
    ? 'Established destination route with proven trail identity'
    : route.description;
  const confidenceLine =
    formatTrustCompactLine(route.trust ?? null) ||
    formatConfidenceCompactLine(route.recommendationConfidence);
  const explanationLine = route.explanation?.text ?? null;

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
  const readinessWarning = vehicleMatch?.note?.startsWith('Loadout not ready')
    ? vehicleMatch.note
    : null;
  const readinessReason = readinessWarning
    ? vehicleMatch.concerns[0] ?? readinessWarning.replace(/^Loadout not ready\s*[—-]\s*/i, '').trim()
    : null;
  const compactMeta = [
    route.distanceFromUserMiles != null ? `${route.distanceFromUserMiles} mi away` : null,
    route.estimatedDays != null ? `${route.estimatedDays} ${route.estimatedDays === 1 ? 'day' : 'days'}` : null,
    route.terrainType ? route.terrainType : null,
  ].filter(Boolean);
  const primaryActionLabel = onNavigate ? 'PREVIEW ROUTE' : 'VIEW DETAILS';
  const riskTone = riskPreview?.level?.toLowerCase().includes('high') ? 'unavailable' : 'warning';
  const showThumbnail = !!thumbnail?.uri && thumbnail.state !== 'suppressed_mismatch' && !thumbnailFailed;
  const thumbnailBorderColor =
    thumbnail?.trust === 'trusted'
      ? TACTICAL.amber + '32'
      : ECS.stroke;
  const presentation = presentationVariant === 'hidden-gem'
    ? {
        accentColor: '#E6B84C',
        borderColor: 'rgba(230,184,76,0.18)',
        backgroundColor: 'rgba(22,18,12,0.96)',
        badgeBackground: 'rgba(230,184,76,0.10)',
        badgeBorder: 'rgba(230,184,76,0.22)',
      }
    : presentationVariant === 'popular-trail'
      ? {
          accentColor: '#66BB6A',
          borderColor: 'rgba(102,187,106,0.18)',
          backgroundColor: 'rgba(13,20,15,0.96)',
          badgeBackground: 'rgba(102,187,106,0.10)',
          badgeBorder: 'rgba(102,187,106,0.22)',
        }
      : {
          accentColor: TACTICAL.amber,
          borderColor: ECS.stroke,
          backgroundColor: ECS.bgPanel,
          badgeBackground: ECS.bgElev,
          badgeBorder: ECS.stroke,
        };
  const activeCollectionLabel = collectionLabel
    ?? (presentationVariant === 'hidden-gem'
      ? 'Hidden Gems'
      : presentationVariant === 'popular-trail'
        ? 'Popular Trails'
        : null);
  const isTabletCard = adaptive.explore.routeColumns > 1 || adaptive.isTablet;
  const thumbnailSize = isTabletCard ? { width: 96, height: 68 } : { width: 76, height: 58 };

  return (
    <TouchableOpacity
      style={isCompleted && s.cardCompleted}
      activeOpacity={0.82}
      onPress={() => { hapticMicro(); onSelect(); }}
    >
      <ECSCard
        variant="primary"
        style={[
          s.card,
          isTabletCard && s.cardTablet,
          {
            borderColor: presentation.borderColor,
            backgroundColor: presentation.backgroundColor,
          },
        ]}
      >
        {/* Left accent bar */}
        <View style={s.accentBar}>
          <View style={[s.accentTop, { backgroundColor: presentation.accentColor }]} />
          <View style={[s.accentBot, { backgroundColor: riskPreview?.color ?? '#4CAF50' }]} />
        </View>

        <View style={[s.cardBody, isTabletCard && s.cardBodyTablet]}>
        {/* Badge Row */}
        <View style={s.badgeRowWrap}>
          <View style={s.badgeRow}>
            {activeCollectionLabel ? (
              <View
                style={[
                  s.collectionBadge,
                  {
                    borderColor: presentation.badgeBorder,
                    backgroundColor: presentation.badgeBackground,
                  },
                ]}
              >
                <Text style={[s.collectionBadgeText, { color: presentation.accentColor }]}>
                  {activeCollectionLabel.toUpperCase()}
                </Text>
              </View>
            ) : null}
            <ECSBadge
              label={route.routeLabel}
              icon={labelConfig.icon as any}
              tone="category"
              compact
              colorOverride={labelConfig.color}
            />
            {riskPreview && (
              <ECSBadge
                label={riskPreview.level}
                icon="shield-outline"
                tone={riskTone}
                compact
                colorOverride={riskPreview.color}
              />
            )}
            {isCompleted && (
              <ECSBadge
                label="Explored"
                icon="checkmark-circle"
                tone="live"
                compact
                colorOverride="#4CAF50"
              />
            )}
          </View>

          {onToggleFavorite ? (
            <TouchableOpacity
              style={[s.favoriteToggle, isFavorited && s.favoriteToggleActive]}
              activeOpacity={0.8}
              onPress={(event: any) => {
                event.stopPropagation?.();
                hapticMicro();
                onToggleFavorite();
              }}
              accessibilityLabel={isFavorited ? 'Remove favorite' : 'Save favorite'}
            >
              <Ionicons
                name={isFavorited ? 'star' : 'star-outline'}
                size={12}
                color={isFavorited ? TACTICAL.amber : TACTICAL.textMuted}
              />
              <Text
                style={[
                  s.favoriteToggleText,
                  isFavorited && s.favoriteToggleTextActive,
                ]}
              >
                {isFavorited ? 'SAVED' : 'SAVE'}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={s.heroRow}>
          <View style={s.heroCopy}>
            {/* Name + Region */}
            <View style={s.nameBlock}>
              <Text style={s.cardName} numberOfLines={2}>{route.name}</Text>
              <Text style={s.cardRegion} numberOfLines={1}>{route.region}</Text>
            </View>

            {/* Supporting metadata */}
            <View style={s.metadataRow}>
              {compactMeta.map((item) => (
                <View key={`${route.id}-${item}`} style={s.metadataBadge}>
                  <Text style={s.metadataBadgeText}>{item}</Text>
                </View>
              ))}
            </View>
          </View>

          {showThumbnail ? (
            <View style={[s.thumbnailFrame, thumbnailSize, { borderColor: thumbnailBorderColor }]}>
              <Image
                source={{ uri: thumbnail?.uri ?? '' }}
                style={s.thumbnailImage}
                resizeMode="cover"
                onError={() => setThumbnailFailed(true)}
              />
            </View>
          ) : null}
        </View>

        {/* Stats Row */}
        <View style={s.statsRow}>
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
          {vehicleMatch && vehicleMatch.score > 0 && (
            <View style={s.statItem}>
              <Ionicons name="car-outline" size={10} color={vehicleMatch.color} />
              <Text style={[s.statValue, { color: vehicleMatch.color, fontSize: 10 }]}>{vehicleMatch.score}</Text>
              <Text style={s.statUnit}>MATCH</Text>
            </View>
          )}
        </View>

        <Text style={[s.cardSummary, isTabletCard && s.cardSummaryTablet]} numberOfLines={isTabletCard ? 3 : 2}>{summaryText}</Text>
        {confidenceLine ? (
          <Text style={s.confidenceLine} numberOfLines={1}>
            {confidenceLine}
          </Text>
        ) : null}
        {explanationLine ? (
          <Text style={s.explanationLine} numberOfLines={2}>
            {explanationLine}
          </Text>
        ) : null}

        {readinessWarning ? (
          <View style={s.warningStrip}>
            <View style={s.warningHeader}>
              <Ionicons name="warning-outline" size={11} color={TACTICAL.amber} />
              <Text style={s.warningTitle}>Loadout not ready</Text>
            </View>
            {readinessReason ? (
              <Text style={s.warningReason} numberOfLines={1}>
                {readinessReason}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Chip Row */}
        <View style={s.chipRow}>
          <ECSChip
            label={route.terrainType.toUpperCase()}
            icon="trail-sign-outline"
            compact
            style={[s.chipTone, { borderColor: terrainColor + '40', backgroundColor: terrainColor + '0C' }]}
            textStyle={{ color: terrainColor }}
          />
          <ECSChip
            label={diffLabel}
            icon="speedometer-outline"
            compact
            style={[s.chipTone, { borderColor: diffColor + '40', backgroundColor: diffColor + '0C' }]}
            textStyle={{ color: diffColor }}
          />
          <ECSChip
            label={remotenessLabel}
            icon="radio-outline"
            compact
            style={[s.chipTone, { borderColor: remotenessColor + '40', backgroundColor: remotenessColor + '0C' }]}
            textStyle={{ color: remotenessColor }}
          />
        </View>

        {/* Action Row */}
        <ECSCardFooter style={s.actionRow}>
        <ECSActionRow compact>
          <ECSButton
            label={primaryActionLabel === 'PREVIEW ROUTE' ? 'Preview Route' : 'View Details'}
            icon="chevron-forward"
            variant="secondary"
            size="compact"
            onPress={(event: any) => {
              event?.stopPropagation?.();
              hapticMicro();
              onSelect();
            }}
            grow
          />

          {onNavigate ? (
            <ECSButton
              label="Open in Navigate"
              icon="navigate-outline"
              variant="tertiary"
              size="compact"
              onPress={(event: any) => {
                event.stopPropagation?.();
                hapticMicro();
                onNavigate();
              }}
            />
          ) : null}
        </ECSActionRow>
        </ECSCardFooter>
      </View>
      </ECSCard>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    marginBottom: 10,
    padding: 0,
  },
  cardTablet: {
    marginBottom: 12,
  },
  cardCompleted: { opacity: 0.7 },
  accentBar: { width: 4, flexDirection: 'column' },
  accentTop: { flex: 1 },
  accentBot: { flex: 1 },
  cardBody: { flex: 1, padding: 12, gap: 7 },
  cardBodyTablet: { padding: 14, gap: 8 },

  badgeRowWrap: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  badgeRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  collectionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  collectionBadgeText: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  routeLabelBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1,
  },
  routeLabelText: { fontSize: 7, fontWeight: '900', letterSpacing: 1.5 },
  riskBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, borderWidth: 1,
  },
  riskBadgeText: { fontSize: 6, fontWeight: '800', letterSpacing: 1 },
  completedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, borderWidth: 1,
    borderColor: '#4CAF5040', backgroundColor: '#4CAF500C',
  },
  completedText: { fontSize: 6, fontWeight: '800', color: '#4CAF50', letterSpacing: 1 },
  nameBlock: { gap: 3 },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  heroCopy: {
    flex: 1,
    gap: 7,
    minWidth: 0,
  },
  cardName: { ...ECS_TEXT.cardTitle, fontSize: 14 },
  cardRegion: { ...ECS_TEXT.cardSubtitle, marginTop: ECS_TEXT_SPACING.titleToSubtitle - 3 },
  thumbnailFrame: {
    width: 76,
    height: 58,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
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
    borderColor: TACTICAL.amber + '35',
    backgroundColor: TACTICAL.amber + '0C',
  },
  favoriteToggleText: {
    ...ECS_TEXT.chip,
    fontSize: 7,
    color: TACTICAL.textMuted,
  },
  favoriteToggleTextActive: {
    color: TACTICAL.amber,
  },
  metadataRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  metadataBadge: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
  },
  metadataBadgeText: {
    ...ECS_TEXT.chip,
    fontSize: 7,
    color: TACTICAL.textMuted,
  },
  cardSummary: {
    ...ECS_TEXT.helper,
    lineHeight: 14,
  },
  cardSummaryTablet: {
    lineHeight: 16,
  },
  confidenceLine: {
    ...ECS_TEXT.helper,
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  explanationLine: {
    ...ECS_TEXT.helper,
    color: TACTICAL.textMuted,
    lineHeight: 14,
  },

  statsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 3, paddingHorizontal: 1,
    borderTopWidth: GOLD_RAIL.subsectionWidth, borderTopColor: GOLD_RAIL.internal,
  },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statValue: { ...ECS_TEXT.statValue, fontSize: 12, color: TACTICAL.amber, letterSpacing: -0.1 },
  statUnit: { ...ECS_TEXT.statLabel, fontSize: 7 },
  warningStrip: {
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '30',
    backgroundColor: TACTICAL.amber + '0C',
  },
  warningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  warningTitle: {
    ...ECS_TEXT.sectionTitle,
    color: TACTICAL.amber,
  },
  warningReason: {
    ...ECS_TEXT.helper,
    lineHeight: 13,
  },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5 },
  chipTone: {
    minHeight: 0,
  },

  actionRow: {
    paddingTop: 4,
  },
});



