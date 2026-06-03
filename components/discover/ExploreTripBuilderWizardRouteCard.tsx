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
  const warning = candidate.warnings[0] ?? null;
  const reason = candidate.confidence.reasons[0] ?? 'Guidance-ready route geometry is available.';
  const thumbnailUri = candidate.thumbnail?.uri ?? null;

  return (
    <View style={styles.card} testID={`explore-tripbuilder-route-card-${candidate.id}`}>
      <View style={styles.thumbnailWrap}>
        {thumbnailUri ? (
          <Image
            source={{ uri: thumbnailUri }}
            style={styles.thumbnail}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View style={styles.thumbnailFallback}>
            <Ionicons name="trail-sign-outline" size={24} color={TACTICAL.amber} />
          </View>
        )}
        <View style={styles.thumbnailOverlay} />
        <View style={styles.thumbnailBadgeRow}>
          <View style={styles.sourceBadge}>
            <Text style={styles.sourceBadgeText}>{sourceLabel}</Text>
          </View>
          <View style={styles.readyBadge}>
            <Ionicons name="navigate-outline" size={9} color={TACTICAL.amber} />
            <Text style={styles.readyBadgeText}>GUIDANCE READY</Text>
          </View>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <View style={styles.titleCopy}>
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
          <View style={styles.metaPill}>
            <Ionicons name="layers-outline" size={9} color={TACTICAL.textMuted} />
            <Text style={styles.metaText}>{candidate.dataUsed.length || 1} SOURCES</Text>
          </View>
          {isSaved ? (
            <View style={[styles.metaPill, styles.savedPill]}>
              <Ionicons name="star" size={9} color={TACTICAL.amber} />
              <Text style={[styles.metaText, styles.savedPillText]}>SAVED</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.reason} numberOfLines={2}>
          {reason}
        </Text>
        {warning ? (
          <View style={styles.warningRow}>
            <Ionicons name="warning-outline" size={10} color={TACTICAL.amber} />
            <Text style={styles.warningText} numberOfLines={2}>{warning}</Text>
          </View>
        ) : null}

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
  thumbnailWrap: {
    height: 138,
    backgroundColor: ECS.bgElev,
    position: 'relative',
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
  thumbnailOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  thumbnailBadgeRow: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  sourceBadge: {
    maxWidth: '58%',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: `${TACTICAL.amber}44`,
    backgroundColor: 'rgba(6,9,11,0.82)',
    paddingHorizontal: 8,
    paddingVertical: 5,
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
    backgroundColor: 'rgba(6,9,11,0.82)',
    paddingHorizontal: 8,
    paddingVertical: 5,
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
    gap: 8,
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
  reason: {
    color: TACTICAL.text,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: `${TACTICAL.amber}28`,
    backgroundColor: `${TACTICAL.amber}0A`,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  warningText: {
    flex: 1,
    color: TACTICAL.amber,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '800',
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
