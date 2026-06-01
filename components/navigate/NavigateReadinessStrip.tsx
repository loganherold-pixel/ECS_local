import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { ECS, GOLD_RAIL, TACTICAL } from '../../lib/theme';
import { ECS_TEXT } from '../../lib/ecsTypographyTokens';
import { ECSBadge, ECSIcon } from '../ECSStatus';
import { ReadinessDecisionBadge, ReadinessDetailSheet, ReadinessEducationCard, TripIntentSelector } from '../readiness';
import {
  useReadinessCategory,
  useCurrentExpeditionReadiness,
  useReadinessBriefPayload,
} from '../../lib/readiness';

type NavigateReadinessStripProps = {
  mode: 'preview' | 'active';
  onOpenCommandBrief: () => void;
  onMinimize?: () => void;
  onStartGuidance?: () => void;
  onDownloadRoutePackage?: () => void;
  startGuidanceDisabled?: boolean;
};

function activeChangeLabel(categoryId: string): string {
  switch (categoryId) {
    case 'weather_window':
      return 'Weather window changed';
    case 'daylight_margin':
      return 'Daylight margin dropping';
    case 'offline_preparedness':
      return 'Offline package incomplete';
    case 'recovery_bailout_access':
      return 'Bailout distance increasing';
    case 'camp_legality_confidence':
      return 'Camp confidence limited';
    case 'fuel_range_margin':
    case 'power_runtime':
      return 'Fuel/power margins reduced';
    case 'communications_signal_confidence':
      return 'Signal confidence limited';
    default:
      return 'Readiness review recommended';
  }
}

function getTopConcern(payload: ReturnType<typeof useReadinessBriefPayload>, mode: 'preview' | 'active'): string {
  if (!payload) return 'Limited confidence: readiness data is still loading.';
  const issue = payload.blockers[0] ?? payload.warnings[0] ?? null;
  if (issue) return mode === 'active' ? activeChangeLabel(issue.categoryId) : issue.detail;
  const concern = payload.concerns[0];
  if (concern && (concern.status !== 'ready' || concern.missingInputs.length > 0)) {
    return mode === 'active' ? activeChangeLabel(concern.id) : concern.summary;
  }
  return payload.recommendations[0] ?? 'No blockers. Keep source freshness current before departure.';
}

export default function NavigateReadinessStrip({
  mode,
  onOpenCommandBrief,
  onMinimize,
  onStartGuidance,
  startGuidanceDisabled = false,
  onDownloadRoutePackage,
}: NavigateReadinessStripProps) {
  const [detailVisible, setDetailVisible] = useState(false);
  const assessment = useCurrentExpeditionReadiness();
  const offlineCategory = useReadinessCategory('offline_preparedness');
  const payload = useReadinessBriefPayload(3);
  const status = assessment?.status ?? 'hold';
  const score = assessment?.overallScore ?? 0;
  const topConcern = getTopConcern(payload, mode);
  const isHold = status === 'hold';
  const offlineStatus =
    offlineCategory?.status === 'ready'
      ? 'Ready'
      : offlineCategory?.score != null && offlineCategory.score >= 60
        ? 'Incomplete'
        : 'Missing';
  const showDownloadRoutePackage = mode === 'preview' && offlineStatus !== 'Ready' && Boolean(onDownloadRoutePackage);

  return (
    <>
    <View style={[s.container, mode === 'active' && s.containerActive]}>
      <View style={s.headerRow}>
        <View style={s.titleBlock}>
          <Text style={s.eyebrow} numberOfLines={1}>
            {mode === 'active' ? 'ACTIVE EXPEDITION READINESS' : 'ROUTE PREVIEW READINESS'}
          </Text>
          <View style={s.badgeRow}>
            <ReadinessDecisionBadge status={status} score={score} compact />
            {payload?.isUsingDemoData ? <ECSBadge label="Demo data" tone="warning" compact /> : null}
          </View>
        </View>
        <View style={s.headerActions}>
          <TouchableOpacity
            style={s.commandBriefButton}
            activeOpacity={0.82}
            onPress={onOpenCommandBrief}
            accessibilityRole="button"
            accessibilityLabel="Open Command Brief"
          >
            <ECSIcon name="document-text-outline" tier="compact" tone="warning" />
            <Text style={s.commandBriefText} numberOfLines={1}>Open Brief</Text>
          </TouchableOpacity>
          {mode === 'active' && onMinimize ? (
            <TouchableOpacity
              style={s.minimizeButton}
              activeOpacity={0.82}
              onPress={onMinimize}
              accessibilityRole="button"
              accessibilityLabel="Minimize Active Expedition Readiness"
            >
              <ECSIcon name="remove-outline" tier="compact" tone="warning" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {mode === 'preview' ? (
        <ReadinessEducationCard
          surface="navigateRoutePreview"
          compact
          showStatusLegend={false}
        />
      ) : null}

      <TripIntentSelector
        value={assessment?.tripIntent ?? null}
        source={assessment?.tripIntentSource ?? null}
        compact
        readonly={mode === 'active'}
      />

      <TouchableOpacity
        style={s.concernRow}
        activeOpacity={0.82}
        onPress={() => setDetailVisible(true)}
        disabled={!assessment}
        accessibilityRole={assessment ? 'button' : undefined}
        accessibilityLabel="Open readiness detail"
      >
        <ECSIcon
          name={isHold ? 'hand-left-outline' : status === 'caution' ? 'alert-circle-outline' : 'shield-checkmark-outline'}
          tier="compact"
          tone={isHold ? 'unavailable' : status === 'caution' ? 'warning' : 'ready'}
        />
        <Text style={s.concernText} numberOfLines={mode === 'active' ? 1 : 2}>
          {topConcern}
        </Text>
      </TouchableOpacity>

      <View style={s.offlineRow}>
        <ECSIcon
          name={offlineStatus === 'Ready' ? 'cloud-done-outline' : 'cloud-download-outline'}
          tier="compact"
          tone={offlineStatus === 'Ready' ? 'ready' : 'warning'}
        />
        <Text style={s.offlineText} numberOfLines={1}>
          Offline: {offlineStatus}
        </Text>
        {showDownloadRoutePackage ? (
          <TouchableOpacity
            style={s.downloadButton}
            activeOpacity={0.82}
            onPress={onDownloadRoutePackage}
            accessibilityRole="button"
            accessibilityLabel="Download Route Package"
          >
            <Text style={s.downloadButtonText} numberOfLines={1}>Download Route Package</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {isHold ? (
        <Text style={s.holdText} numberOfLines={2}>
          ECS recommends review before departure.
        </Text>
      ) : null}

      {mode === 'preview' && onStartGuidance ? (
        <View style={s.actionRow}>
          <TouchableOpacity
            style={[s.startButton, startGuidanceDisabled && s.startButtonDisabled]}
            activeOpacity={startGuidanceDisabled ? 1 : 0.84}
            disabled={startGuidanceDisabled}
            onPress={onStartGuidance}
            accessibilityRole="button"
            accessibilityState={{ disabled: startGuidanceDisabled }}
            accessibilityLabel="Start Guidance"
          >
            <ECSIcon name="play" tier="compact" tone={startGuidanceDisabled ? 'info' : 'warning'} />
            <Text style={[s.startButtonText, startGuidanceDisabled && s.startButtonTextDisabled]}>
              Start Guidance
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
    <ReadinessDetailSheet
      visible={detailVisible}
      assessment={assessment}
      onClose={() => setDetailVisible(false)}
    />
    </>
  );
}

const s = StyleSheet.create({
  container: {
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.section,
    backgroundColor: ECS.bgPanel,
  },
  containerActive: {
    borderColor: GOLD_RAIL.internal,
    backgroundColor: ECS.bgElev,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  eyebrow: {
    ...ECS_TEXT.statLabel,
    color: TACTICAL.amber,
    fontSize: 7,
    letterSpacing: 0,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  commandBriefButton: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: ECS.bgElev,
  },
  commandBriefText: {
    ...ECS_TEXT.chip,
    color: TACTICAL.amber,
    fontSize: 7,
    letterSpacing: 0,
  },
  minimizeButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: ECS.bgElev,
  },
  concernRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
  },
  concernText: {
    ...ECS_TEXT.helper,
    flex: 1,
    color: TACTICAL.textMuted,
    lineHeight: 14,
  },
  holdText: {
    ...ECS_TEXT.helper,
    color: TACTICAL.amber,
    lineHeight: 14,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  offlineRow: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  offlineText: {
    ...ECS_TEXT.helper,
    flex: 1,
    color: TACTICAL.textMuted,
    lineHeight: 14,
  },
  downloadButton: {
    maxWidth: 142,
    minHeight: 26,
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.section,
    backgroundColor: ECS.accentSoft,
  },
  downloadButtonText: {
    ...ECS_TEXT.chip,
    color: TACTICAL.amber,
    fontSize: 7,
    letterSpacing: 0,
  },
  startButton: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.section,
    backgroundColor: ECS.accentSoft,
  },
  startButtonDisabled: {
    opacity: 0.5,
    backgroundColor: ECS.bgElev,
    borderColor: ECS.stroke,
  },
  startButtonText: {
    ...ECS_TEXT.chip,
    color: TACTICAL.amber,
    fontSize: 8,
    letterSpacing: 0,
  },
  startButtonTextDisabled: {
    color: TACTICAL.textMuted,
  },
});
