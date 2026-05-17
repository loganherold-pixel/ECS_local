import React, { useMemo, useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { ECSCard } from '../ECSSurface';
import { ECSBadge } from '../ECSStatus';
import { TACTICAL, ECS } from '../../lib/theme';
import { hapticMicro } from '../../lib/haptics';
import {
  canStartTrailPackGuidance,
  getTrailPackDifficultyLabel,
  getTrailPackRouteTypeLabel,
  getTrailPackSourceLabel,
  trailPackToExpeditionOpportunity,
  type ECSTrailPackDiscoveryItem,
} from '../../lib/explore/trailPacks';
import type { ExploreTrailThumbnailAssignment } from '../../lib/exploreTrailThumbnails';
import ExploreReadinessSummary from './ExploreReadinessSummary';
import {
  buildExploreRouteReadinessAssessment,
  getExploreRouteReadinessSummary,
} from '../../lib/readiness/exploreRouteReadiness';

interface TrailPackCardProps {
  trailPack: ECSTrailPackDiscoveryItem;
  hasVehicle?: boolean;
  isFavorited?: boolean;
  onPreview: () => void;
  onStartGuidance: () => void;
  onSave: () => void;
  compactPreview?: boolean;
  thumbnailOverride?: ExploreTrailThumbnailAssignment | null;
}

function formatMiles(value: number | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return `${Math.round(value * 10) / 10} mi`;
}

function formatDuration(minutes: number | undefined): string | null {
  if (minutes == null || !Number.isFinite(minutes)) return null;
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  return `${Math.round(hours * 10) / 10} hr`;
}

function formatLastVerified(isoDate: string | undefined): string | null {
  if (!isoDate) return null;
  const timestamp = Date.parse(isoDate);
  if (!Number.isFinite(timestamp)) return null;
  const daysAgo = Math.max(0, Math.round((Date.now() - timestamp) / 86400000));
  if (daysAgo === 0) return 'Last verified today';
  if (daysAgo === 1) return 'Last verified 1 day ago';
  return `Last verified ${daysAgo} days ago`;
}

function getSourceTone(sourceLabel: string): 'live' | 'category' | 'warning' {
  if (/validated/i.test(sourceLabel)) return 'live';
  if (/needs review/i.test(sourceLabel)) return 'warning';
  return 'category';
}

export default function TrailPackCard({
  trailPack,
  hasVehicle = false,
  isFavorited = false,
  onPreview,
  onStartGuidance,
  onSave,
  compactPreview = false,
  thumbnailOverride,
}: TrailPackCardProps) {
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const sourceLabel = getTrailPackSourceLabel(trailPack.source);
  const routeTypeLabel = getTrailPackRouteTypeLabel(trailPack.routeType);
  const difficultyLabel = getTrailPackDifficultyLabel(trailPack.difficulty);
  const canStartGuidance = canStartTrailPackGuidance(trailPack);
  const routeMiles = formatMiles(trailPack.distanceMiles);
  const distanceAway = formatMiles(trailPack.distanceFromUserMiles);
  const duration = formatDuration(trailPack.estimatedDurationMinutes);
  const feedbackCount = trailPack.positiveFeedbackCount ?? 0;
  const feedbackText = feedbackCount === 1 ? '1 positive report' : `${feedbackCount} positive reports`;
  const vehicleFit = trailPack.vehicleFit?.[0] ?? null;
  const metaLine = [routeMiles, difficultyLabel !== 'Unknown' ? difficultyLabel : null, vehicleFit]
    .filter(Boolean)
    .join(' | ');
  const statLine = [
    distanceAway ? `${distanceAway} away` : null,
    duration,
    routeTypeLabel !== 'Unknown' ? routeTypeLabel : null,
  ].filter(Boolean).join(' | ');
  const lastVerified = formatLastVerified(trailPack.lastVerifiedAt);
  const showThumbnail =
    !!thumbnailOverride?.uri &&
    thumbnailOverride.state !== 'suppressed_mismatch' &&
    !thumbnailFailed;
  const readinessRoute = useMemo(() => trailPackToExpeditionOpportunity(trailPack), [trailPack]);
  const readinessAssessment = useMemo(
    () => buildExploreRouteReadinessAssessment(readinessRoute, { hasVehicle }),
    [hasVehicle, readinessRoute],
  );
  const readinessSummary = useMemo(
    () => getExploreRouteReadinessSummary(readinessAssessment, readinessRoute, { hasVehicle }),
    [hasVehicle, readinessAssessment, readinessRoute],
  );

  return (
    <ECSCard variant="primary" style={[s.card, compactPreview && s.cardCompact]}>
      <View style={s.accentBar} />
      <View style={s.body}>
        <View style={s.headerRow}>
          <View style={s.titleBlock}>
            <Text style={s.eyebrow}>TRAIL PACK</Text>
            <Text style={s.title} numberOfLines={2}>{trailPack.name}</Text>
          </View>
          <ECSBadge
            label={sourceLabel}
            tone={getSourceTone(sourceLabel)}
            icon="trail-sign-outline"
            compact
          />
        </View>

        {metaLine ? <Text style={s.metaText}>{metaLine}</Text> : null}
        {showThumbnail ? (
          <View style={[s.thumbnailFrame, compactPreview && s.thumbnailFrameCompact]}>
            <Image
              source={{ uri: thumbnailOverride.uri as string }}
              style={s.thumbnailImage}
              resizeMode="cover"
              accessibilityLabel={`${trailPack.name} trail thumbnail`}
              onError={() => setThumbnailFailed(true)}
            />
            <View style={s.thumbnailScrim} />
            <View style={s.thumbnailBadge}>
              <Ionicons name="image-outline" size={9} color={TACTICAL.amber} />
              <Text style={s.thumbnailBadgeText}>TRAIL VISUAL</Text>
            </View>
          </View>
        ) : null}
        <Text style={s.confidenceText}>
          ECS confidence {Math.round(trailPack.confidenceScore)}% | {feedbackText}
        </Text>
        <ExploreReadinessSummary
          assessment={readinessAssessment}
          summary={readinessSummary}
          compact={compactPreview}
        />
        {statLine ? <Text style={s.subtleText}>{statLine}</Text> : null}
        {lastVerified ? <Text style={s.subtleText}>{lastVerified}</Text> : null}

        <View style={s.reasonList}>
          {trailPack.confidenceReasons.slice(0, 2).map((reason) => (
            <View key={reason} style={s.reasonRow}>
              <View style={s.reasonDot} />
              <Text style={s.reasonText} numberOfLines={2}>{reason}</Text>
            </View>
          ))}
        </View>

        {!canStartGuidance ? (
          <View style={s.guardNotice}>
            <Ionicons name="alert-circle-outline" size={12} color={TACTICAL.textMuted} />
            <Text style={s.guardText}>Guidance needs route geometry. Preview remains available.</Text>
          </View>
        ) : null}

        <View style={s.actionRow}>
          <TouchableOpacity
            style={s.secondaryButton}
            activeOpacity={0.78}
            onPress={() => {
              hapticMicro();
              onPreview();
            }}
          >
            <Ionicons name="eye-outline" size={13} color={TACTICAL.amber} />
            <Text style={s.secondaryButtonText}>PREVIEW</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.primaryButton, !canStartGuidance && s.buttonDisabled]}
            activeOpacity={canStartGuidance ? 0.84 : 1}
            disabled={!canStartGuidance}
            accessibilityState={{ disabled: !canStartGuidance }}
            accessibilityHint={!canStartGuidance ? 'Route geometry is unavailable for this Trail Pack.' : undefined}
            onPress={() => {
              if (!canStartGuidance) return;
              hapticMicro();
              onStartGuidance();
            }}
          >
            <Ionicons
              name="navigate-outline"
              size={13}
              color={canStartGuidance ? '#0B0E12' : TACTICAL.textMuted}
            />
            <Text style={[s.primaryButtonText, !canStartGuidance && s.primaryButtonTextDisabled]}>
              START
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.iconButton}
            activeOpacity={0.78}
            accessibilityLabel={isFavorited ? 'Remove Trail Pack from saved routes' : 'Save Trail Pack'}
            onPress={() => {
              hapticMicro();
              onSave();
            }}
          >
            <Ionicons
              name={isFavorited ? 'star' : 'star-outline'}
              size={15}
              color={isFavorited ? TACTICAL.amber : TACTICAL.textMuted}
            />
          </TouchableOpacity>
        </View>
      </View>
    </ECSCard>
  );
}

const s = StyleSheet.create({
  card: {
    borderColor: 'rgba(230,184,76,0.22)',
    backgroundColor: 'rgba(18,19,20,0.96)',
    overflow: 'hidden',
    flexDirection: 'row',
  },
  cardCompact: {
    minHeight: 0,
  },
  accentBar: {
    width: 4,
    backgroundColor: TACTICAL.amber,
  },
  body: {
    flex: 1,
    padding: 12,
    gap: 7,
  },
  headerRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    color: TACTICAL.amber,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  title: {
    color: TACTICAL.text,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0,
    marginTop: 2,
  },
  metaText: {
    color: TACTICAL.text,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
  },
  thumbnailFrame: {
    height: 74,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: TACTICAL.amber + '24',
    backgroundColor: ECS.bgElev,
  },
  thumbnailFrameCompact: {
    height: 56,
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
    borderColor: TACTICAL.amber + '30',
    backgroundColor: 'rgba(10,12,14,0.72)',
  },
  thumbnailBadgeText: {
    color: TACTICAL.amber,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0,
  },
  confidenceText: {
    color: TACTICAL.amber,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
  },
  subtleText: {
    color: TACTICAL.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0,
  },
  reasonList: {
    gap: 5,
    marginTop: 2,
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
  guardNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
  },
  guardText: {
    flex: 1,
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800',
    letterSpacing: 0,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 3,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 34,
    borderWidth: 1,
    borderColor: 'rgba(230,184,76,0.24)',
    backgroundColor: 'rgba(230,184,76,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  secondaryButtonText: {
    color: TACTICAL.amber,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0,
  },
  primaryButton: {
    flex: 1,
    minHeight: 34,
    backgroundColor: TACTICAL.amber,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  primaryButtonText: {
    color: '#0B0E12',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0,
  },
  buttonDisabled: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: ECS.stroke,
  },
  primaryButtonTextDisabled: {
    color: TACTICAL.textMuted,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
