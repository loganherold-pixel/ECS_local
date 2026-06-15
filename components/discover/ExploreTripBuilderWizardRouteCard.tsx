import React from 'react';
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { ECS, TACTICAL } from '../../lib/theme';
import type { ExploreWizardRouteCandidate } from '../../lib/explore/exploreTripBuilderWizard';

type ExploreTripBuilderWizardRouteCardProps = {
  candidate: ExploreWizardRouteCandidate;
  sourceLabel: string;
  isSaved: boolean;
  onPreview: () => void;
  onStart: () => void;
  onSave: () => void;
  onBuildTrip: () => void;
};

function confidenceValue(candidate: ExploreWizardRouteCandidate): string {
  return candidate.confidence.score == null ? 'UNK' : `${candidate.confidence.score}`;
}

function routeDistance(candidate: ExploreWizardRouteCandidate): string {
  const distance =
    candidate.navigationPayload.trailLengthMiles ??
    candidate.route.distanceMiles;
  return Number.isFinite(Number(distance)) && Number(distance) > 0
    ? `${Math.round(Number(distance))} MI`
    : 'DISTANCE UNKNOWN';
}

export default function ExploreTripBuilderWizardRouteCard({
  candidate,
  sourceLabel,
  isSaved,
  onPreview,
  onStart,
  onSave,
  onBuildTrip,
}: ExploreTripBuilderWizardRouteCardProps) {
  const thumbnailUri = candidate.thumbnail?.uri ?? null;

  return (
    <View style={styles.card} testID={`explore-tripbuilder-route-card-${candidate.id}`}>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <View style={styles.headerThumbnail}>
            {thumbnailUri ? (
              <Image
                source={{ uri: thumbnailUri }}
                style={styles.thumbnail}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
              />
            ) : (
              <View style={styles.thumbnailFallback}>
                <Ionicons name="trail-sign-outline" size={18} color={TACTICAL.amber} />
              </View>
            )}
          </View>
          <View style={styles.titleCopy}>
            <View style={styles.badgeRow}>
              <View style={styles.sourceBadge}>
                <Text style={styles.sourceBadgeText}>{sourceLabel}</Text>
              </View>
              <View style={styles.readyBadge}>
                <Ionicons name="navigate-outline" size={9} color={TACTICAL.amber} />
                <Text style={styles.readyBadgeText}>READY</Text>
              </View>
            </View>
            <Text style={styles.title} numberOfLines={2}>{candidate.title}</Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {candidate.subtitle ?? candidate.route.region ?? 'Explore route'}
            </Text>
          </View>
          <View style={styles.confidenceMeter}>
            <Text style={styles.confidenceValue}>{confidenceValue(candidate)}</Text>
            <Text style={styles.confidenceLabel}>CONF</Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaPill}>
            <Ionicons name="map-outline" size={9} color={TACTICAL.textMuted} />
            <Text style={styles.metaText}>{routeDistance(candidate)}</Text>
          </View>
          {isSaved ? (
            <View style={[styles.metaPill, styles.savedPill]}>
              <Ionicons name="star" size={9} color={TACTICAL.amber} />
              <Text style={[styles.metaText, styles.savedPillText]}>SAVED</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.secondaryAction}
            activeOpacity={0.82}
            onPress={onPreview}
            accessibilityRole="button"
            accessibilityLabel={`Preview ${candidate.title}`}
          >
            <Ionicons name="scan-outline" size={12} color={TACTICAL.text} />
            <Text style={styles.secondaryActionText}>PREVIEW</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryAction}
            activeOpacity={0.82}
            onPress={onSave}
            accessibilityRole="button"
            accessibilityLabel={`Save ${candidate.title}`}
          >
            <Ionicons name={isSaved ? 'star' : 'star-outline'} size={12} color={TACTICAL.text} />
            <Text style={styles.secondaryActionText}>{isSaved ? 'SAVED' : 'SAVE'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryAction}
            activeOpacity={0.82}
            onPress={onBuildTrip}
            accessibilityRole="button"
            accessibilityLabel={`Build trip for ${candidate.title}`}
          >
            <Ionicons name="git-merge-outline" size={12} color={TACTICAL.text} />
            <Text style={styles.secondaryActionText}>BUILD TRIP</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.primaryAction}
            activeOpacity={0.86}
            onPress={onStart}
            accessibilityRole="button"
            accessibilityLabel={`Start navigation for ${candidate.title}`}
          >
            <Ionicons name="navigate" size={12} color="#081014" />
            <Text style={styles.primaryActionText}>START</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: ECS.radius,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgPanel,
    overflow: 'hidden',
  },
  headerThumbnail: {
    width: 72,
    height: 54,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: `${TACTICAL.amber}24`,
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
    backgroundColor: 'rgba(255,255,255,0.035)',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  sourceBadge: {
    maxWidth: '100%',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: `${TACTICAL.amber}44`,
    backgroundColor: `${TACTICAL.amber}0D`,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  sourceBadgeText: {
    color: TACTICAL.amber,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  readyBadge: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: `${TACTICAL.amber}44`,
    backgroundColor: `${TACTICAL.amber}0D`,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  readyBadgeText: {
    color: TACTICAL.amber,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  body: {
    padding: 11,
    gap: 7,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  titleCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    color: TACTICAL.text,
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '900',
  },
  subtitle: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '700',
  },
  confidenceMeter: {
    minWidth: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: `${TACTICAL.amber}35`,
    backgroundColor: `${TACTICAL.amber}10`,
    paddingHorizontal: 6,
    paddingVertical: 5,
    alignItems: 'center',
  },
  confidenceValue: {
    color: TACTICAL.amber,
    fontSize: 13,
    lineHeight: 15,
    fontWeight: '900',
  },
  confidenceLabel: {
    color: TACTICAL.textMuted,
    fontSize: 6,
    lineHeight: 8,
    fontWeight: '900',
    letterSpacing: 0.9,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: 'rgba(255,255,255,0.025)',
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  metaText: {
    color: TACTICAL.textMuted,
    fontSize: 7,
    lineHeight: 9,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  savedPill: {
    borderColor: `${TACTICAL.amber}35`,
    backgroundColor: `${TACTICAL.amber}0D`,
  },
  savedPillText: {
    color: TACTICAL.amber,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  secondaryAction: {
    minHeight: 34,
    flexGrow: 1,
    flexBasis: 86,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 8,
  },
  secondaryActionText: {
    color: TACTICAL.text,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  primaryAction: {
    minHeight: 34,
    flexGrow: 1,
    flexBasis: 78,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,220,140,0.5)',
    backgroundColor: TACTICAL.amber,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 8,
  },
  primaryActionText: {
    color: '#081014',
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900',
    letterSpacing: 0.9,
  },
});
