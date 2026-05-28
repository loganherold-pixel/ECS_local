import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { SafeIcon as Ionicons } from '../SafeIcon';
import { ReadinessDecisionBadge } from '../readiness';
import { readinessToneColor } from '../readiness/readinessUi';
import {
  useCurrentExpeditionReadiness,
  useExpeditionReadinessState,
  useReadinessBriefPayload,
  useReadinessConcerns,
  useReadinessDecision,
} from '../../lib/readiness';
import type { ExpeditionReadinessAssessment } from '../../lib/readiness/expeditionReadinessTypes';
import { TACTICAL, GOLD_RAIL } from '../../lib/theme';
import { useTheme } from '../../context/ThemeContext';

type ECSIntelligenceReadoutProps = {
  hasRouteContext: boolean;
  isActiveExpedition: boolean;
  commandTitle?: string | null;
  commandDetail?: string | null;
  commandBadge?: string | null;
  commandLive?: boolean;
};

type ReadoutModel = {
  statusLabel: string;
  score: number | null;
  title: string;
  concern: string;
  recommendation: string;
  message: string;
  toneColor: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  shouldAutoClear: boolean;
};

type ReadoutCopy = {
  concern: string;
  recommendation: string;
};

function cleanReadinessCopy(value: string | null | undefined, maxLength = 138): string {
  const normalized = String(value ?? '')
    .replace(/\blegal campsite\b/gi, 'Camp Legality Confidence')
    .replace(/\bsafe route\b/gi, 'route confidence')
    .replace(/\bsafe\b/gi, 'confidence-supported')
    .replace(/\bAI\b/g, 'ECS Intelligence')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(36, maxLength - 1)).trimEnd()}…`;
}

function capitalizeReadoutSentenceStart(value: string | null | undefined): string {
  const normalized = cleanReadinessCopy(value);
  if (!normalized) return '';
  return normalized.replace(/^([a-z])/, (letter) => letter.toUpperCase());
}

function sentenceCaseReadoutCopy(copy: ReadoutCopy): ReadoutCopy {
  return {
    concern: capitalizeReadoutSentenceStart(copy.concern),
    recommendation: capitalizeReadoutSentenceStart(copy.recommendation),
  };
}

function isCriticalIntelligenceState(args: {
  assessmentStatus?: ExpeditionReadinessAssessment['status'] | null;
  commandBadge?: string | null;
  commandTitle?: string | null;
  commandDetail?: string | null;
}): boolean {
  if (args.assessmentStatus === 'hold') return true;
  const sourceText = [
    args.commandBadge,
    args.commandTitle,
    args.commandDetail,
  ].filter(Boolean).join(' ').toLowerCase();

  return /\b(critical|emergency|recovery|severe|hold|gps failure|telemetry loss|lost signal)\b/.test(sourceText);
}

function firstFreshnessConcern(assessment: ExpeditionReadinessAssessment): string | null {
  const records = Object.values(assessment.sourceFreshness);
  const stale = records.find((record) => record.isStale);
  if (stale) return `${stale.label} is stale`;
  const missing = records.find((record) => record.isMissing);
  if (missing) return `${missing.label} is missing`;
  const inferred = records.find((record) => record.isInferred);
  if (inferred) return `${inferred.label} is ECS-inferred`;
  return null;
}

function buildIssueRecommendation(issue: string | null | undefined): string {
  const normalized = cleanReadinessCopy(issue, 180).toLowerCase();
  if (!normalized) {
    return 'Review the current ECS inputs, confirm missing data, and keep the next move grounded in visible route, vehicle, and weather context.';
  }
  if (normalized.includes('weather') || normalized.includes('wind') || normalized.includes('storm') || normalized.includes('precip') || normalized.includes('snow') || normalized.includes('heat')) {
    return 'refresh route weather, compare the next segment before committing, and adjust departure timing if conditions are trending worse.';
  }
  if (normalized.includes('location') || normalized.includes('gps') || normalized.includes('position')) {
    return 'restore location access or wait for a fresh GPS fix so route-aware guidance can update.';
  }
  if (normalized.includes('offline') || normalized.includes('cache') || normalized.includes('service')) {
    return 'prepare an Offline Pack before leaving coverage and verify saved maps for the route corridor.';
  }
  if (normalized.includes('fuel')) {
    return 'verify fuel level, range margin, and the last reliable fuel point before continuing.';
  }
  if (normalized.includes('water')) {
    return 'confirm carried water and refill options before committing to camp or a longer route segment.';
  }
  if (normalized.includes('vehicle') || normalized.includes('payload') || normalized.includes('load') || normalized.includes('readiness')) {
    return 'review the active vehicle profile, payload, and loadout values, then update the missing or estimated inputs.';
  }
  if (normalized.includes('camp')) {
    return 'review camp candidates and keep a backup endpoint available before the final approach.';
  }
  if (normalized.includes('route') || normalized.includes('guidance')) {
    return 'check bailout and offline coverage, then confirm the next leg before starting guidance.';
  }
  return 'review the source data, confirm stale or missing inputs, and choose the next route action from visible ECS context.';
}

function buildReadoutCopy(args: {
  assessment: ExpeditionReadinessAssessment | null;
  hasRouteContext: boolean;
  isActiveExpedition: boolean;
  readinessStateHasRoute: boolean;
  decisionLabel: string | null;
  topReason: string | null;
  freshnessConcern: string | null;
  commandTitle: string | null;
  commandDetail: string | null;
}): ReadoutCopy {
  const {
    assessment,
    hasRouteContext,
    isActiveExpedition,
    readinessStateHasRoute,
    decisionLabel,
    topReason,
    freshnessConcern,
    commandTitle,
    commandDetail,
  } = args;
  const hasAnyRoute = hasRouteContext || readinessStateHasRoute || (assessment ? !assessment.sourceFreshness.route.isMissing : false);
  const commandIssue = cleanReadinessCopy(commandDetail || commandTitle, 144);

  if (!hasAnyRoute) {
    return {
      concern: 'No active expedition is selected for dashboard intelligence.',
      recommendation: 'Pick a route in Explore or Navigate so ECS can build a route-aware readiness brief.',
    };
  }

  if (!assessment || !decisionLabel) {
    const issue = commandIssue || 'readiness assessment is not available yet';
    return {
      concern: `Readiness confidence is limited because ${issue}.`,
      recommendation: 'Review missing inputs, then update route, vehicle, weather, and offline data before relying on this readout.',
    };
  }

  if (assessment.confidence === 'low' || freshnessConcern) {
    const reason = cleanReadinessCopy(freshnessConcern ?? topReason ?? 'One or more readiness inputs need review.');
    return {
      concern: `Readiness confidence is limited because ${reason}.`,
      recommendation: buildIssueRecommendation(reason),
    };
  }

  const reason = cleanReadinessCopy(topReason ?? commandIssue ?? assessment.explanation ?? 'No hard blockers are present.');
  const recommendation = buildIssueRecommendation(reason);
  if (assessment.status === 'hold') {
    return {
      concern: reason,
      recommendation,
    };
  }
  if (assessment.status === 'caution') {
    return {
      concern: reason,
      recommendation,
    };
  }
  if (isActiveExpedition) {
    return {
      concern: `Active readiness is ${decisionLabel}.`,
      recommendation,
    };
  }
  return {
    concern: `Planning readiness is ${decisionLabel}.`,
    recommendation,
  };
}

export default function ECSIntelligenceReadout({
  commandBadge,
  commandDetail,
  commandLive,
  commandTitle,
  hasRouteContext,
  isActiveExpedition,
}: ECSIntelligenceReadoutProps) {
  const { palette, colors, isLight } = useTheme();
  const assessment = useCurrentExpeditionReadiness();
  const readinessState = useExpeditionReadinessState();
  const decision = useReadinessDecision();
  const concerns = useReadinessConcerns(3);
  const briefPayload = useReadinessBriefPayload(3);

  const model = useMemo<ReadoutModel>(() => {
    const topIssue =
      briefPayload?.blockers[0]?.detail ??
      briefPayload?.warnings[0]?.detail ??
      concerns[0]?.summary ??
      briefPayload?.recommendations[0] ??
      assessment?.explanation ??
      null;
    const freshnessConcern = assessment ? firstFreshnessConcern(assessment) : null;
    const statusLabel = commandBadge ?? decision?.label ?? 'Awaiting';
    const toneColor = assessment ? readinessToneColor(assessment.status) : TACTICAL.textMuted;
    const readoutCopy = sentenceCaseReadoutCopy(buildReadoutCopy({
      assessment,
      hasRouteContext,
      isActiveExpedition: isActiveExpedition || readinessState.readinessMode === 'active',
      readinessStateHasRoute: Boolean(readinessState.activeRouteId || readinessState.activeTripId),
      decisionLabel: decision?.label ?? null,
      topReason: topIssue,
      freshnessConcern,
      commandTitle: commandTitle ?? null,
      commandDetail: commandDetail ?? null,
    }));
    const noHardConcern =
      Boolean(assessment) &&
      assessment?.status === 'ready' &&
      !topIssue &&
      !freshnessConcern &&
      !commandTitle &&
      !commandDetail;

    return {
      statusLabel,
      score: decision?.score ?? null,
      title: 'ECS Intelligence',
      concern: readoutCopy.concern,
      recommendation: readoutCopy.recommendation,
      message: `Key concern: ${readoutCopy.concern} Recommendation: ${readoutCopy.recommendation}`,
      toneColor: commandLive ? TACTICAL.amber : toneColor,
      icon: assessment?.status === 'hold'
        ? 'hand-left-outline'
        : assessment?.status === 'caution'
          ? 'alert-circle-outline'
          : 'sparkles-outline',
      shouldAutoClear: noHardConcern,
    };
  }, [
    assessment,
    briefPayload?.blockers,
    briefPayload?.recommendations,
    briefPayload?.warnings,
    concerns,
    decision?.label,
    decision?.score,
    hasRouteContext,
    isActiveExpedition,
    commandBadge,
    commandDetail,
    commandLive,
    commandTitle,
    readinessState.activeRouteId,
    readinessState.activeTripId,
    readinessState.readinessMode,
  ]);
  const [displayedModel, setDisplayedModel] = useState<ReadoutModel>(model);
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const contentTranslateX = useRef(new Animated.Value(0)).current;
  const pulseOpacity = useRef(new Animated.Value(0.42)).current;
  const modelKeyRef = useRef<string | null>(null);
  const autoClearTokenRef = useRef(0);
  const modelKey = `${model.statusLabel}|${model.message}|${model.toneColor}`;
  const standbyCopy = 'ECS Intelligence standing by';
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const criticalState = isCriticalIntelligenceState({
    assessmentStatus: assessment?.status ?? null,
    commandBadge,
    commandTitle,
    commandDetail,
  });
  const expandedState = criticalState || detailsExpanded;
  const compactCopy = displayedModel.message
    ? cleanReadinessCopy(`${displayedModel.concern} ${displayedModel.recommendation}`, 188)
    : standbyCopy;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseOpacity, {
          toValue: commandLive ? 1 : 0.64,
          duration: 720,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulseOpacity, {
          toValue: commandLive ? 0.38 : 0.42,
          duration: 720,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [commandLive, pulseOpacity]);

  useEffect(() => {
    autoClearTokenRef.current += 1;
    if (modelKeyRef.current == null) {
      modelKeyRef.current = modelKey;
      setDisplayedModel(model);
      setDetailsExpanded(false);
      contentOpacity.setValue(1);
      contentTranslateX.setValue(0);
      return undefined;
    }
    if (modelKeyRef.current === modelKey) return undefined;

    modelKeyRef.current = modelKey;
    setDetailsExpanded(false);
    contentOpacity.stopAnimation();
    contentTranslateX.stopAnimation();
    contentOpacity.setValue(1);
    contentTranslateX.setValue(-10);
    setDisplayedModel(model);
    Animated.timing(contentTranslateX, {
      toValue: 0,
      duration: 150,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        contentOpacity.setValue(1);
        contentTranslateX.setValue(0);
      }
    });

    return () => {
      contentOpacity.stopAnimation();
      contentTranslateX.stopAnimation();
      contentOpacity.setValue(1);
      contentTranslateX.setValue(0);
    };
  }, [contentOpacity, contentTranslateX, model, modelKey]);

  useEffect(() => {
    if (displayedModel.message.length === 0) return undefined;

    const settleTimer = setTimeout(() => {
      contentOpacity.stopAnimation();
      contentTranslateX.stopAnimation();
      contentOpacity.setValue(1);
      contentTranslateX.setValue(0);
    }, 460);

    return () => clearTimeout(settleTimer);
  }, [contentOpacity, contentTranslateX, displayedModel.message]);

  useEffect(() => {
    if (!displayedModel.shouldAutoClear || displayedModel.message.length === 0) {
      autoClearTokenRef.current += 1;
      return undefined;
    }

    const autoClearToken = ++autoClearTokenRef.current;
    const timer = setTimeout(() => {
      if (autoClearTokenRef.current !== autoClearToken) return;
      contentOpacity.stopAnimation();
      contentTranslateX.stopAnimation();
      contentOpacity.setValue(1);
      contentTranslateX.setValue(0);
      setDisplayedModel((current) => ({
        ...current,
        concern: '',
        recommendation: '',
        message: '',
      }));
    }, 16000);

    return () => {
      autoClearTokenRef.current += 1;
      clearTimeout(timer);
      contentOpacity.stopAnimation();
      contentTranslateX.stopAnimation();
      if (displayedModel.message.length > 0) {
        contentOpacity.setValue(1);
        contentTranslateX.setValue(0);
      }
    };
  }, [contentOpacity, contentTranslateX, displayedModel]);

  return (
    <Pressable
      style={[
        styles.surface,
        expandedState ? styles.surfaceExpanded : styles.surfaceCompact,
        criticalState ? styles.surfaceCritical : null,
        {
          backgroundColor: isLight ? 'rgba(255, 251, 245, 0.94)' : 'rgba(12, 15, 18, 0.94)',
          borderColor: criticalState ? displayedModel.toneColor : isLight ? palette.border : GOLD_RAIL.section,
        },
      ]}
      accessibilityLabel={`${displayedModel.title}. ${displayedModel.message || standbyCopy}.`}
      accessibilityRole="button"
      accessibilityState={{ expanded: expandedState }}
      accessibilityHint={criticalState ? undefined : expandedState ? 'Collapses ECS Intelligence details.' : 'Expands ECS Intelligence details.'}
      onPress={() => {
        if (!criticalState && displayedModel.message) {
          setDetailsExpanded((value) => !value);
        }
      }}
    >
      <View style={styles.copyStack}>
        <View style={styles.headerRow}>
          <View style={styles.titleRow}>
            <Animated.View style={[styles.liveDot, { backgroundColor: displayedModel.toneColor, opacity: pulseOpacity }]} />
            <Ionicons name={displayedModel.icon} size={14} color={displayedModel.toneColor} />
            <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>
              {displayedModel.title}
            </Text>
          </View>
          {assessment ? (
            <ReadinessDecisionBadge status={assessment.status} score={displayedModel.score} compact />
          ) : (
            <View style={styles.awaitingBadge}>
              <Text style={styles.awaitingBadgeText}>{displayedModel.statusLabel.toUpperCase()}</Text>
            </View>
          )}
        </View>

        <Animated.View
          style={[
            styles.animatedCopy,
            {
              opacity: contentOpacity,
              transform: [{ translateX: contentTranslateX }],
            },
          ]}
        >
          {displayedModel.message ? (
            expandedState ? (
              <View style={styles.commandCopyPanel}>
                <Text style={[styles.commandCopyLabel, { color: palette.amber }]} numberOfLines={1}>
                  Key concern:
                </Text>
                <Text style={[styles.commandSummary, { color: palette.text }]} numberOfLines={2}>
                  {displayedModel.concern}
                </Text>
                <Text style={[styles.commandCopyLabel, styles.commandRecommendationLabel, { color: palette.amber }]} numberOfLines={1}>
                  Recommendation:
                </Text>
                <Text style={[styles.commandDetail, { color: colors.textSecondary }]} numberOfLines={2}>
                  {displayedModel.recommendation}
                </Text>
              </View>
            ) : (
              <View style={styles.compactCopyPanel}>
                <Text style={[styles.compactSummary, { color: palette.text }]} numberOfLines={2} ellipsizeMode="tail">
                  {compactCopy}
                </Text>
              </View>
            )
          ) : (
            <View style={styles.emptyUpdateSlot} accessibilityElementsHidden importantForAccessibility="no" />
          )}
        </Animated.View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  surface: {
    width: '100%',
    marginTop: 2,
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.section,
    borderRadius: 10,
    backgroundColor: 'rgba(12, 15, 18, 0.94)',
    overflow: 'hidden',
  },
  surfaceCompact: {
    minHeight: 56,
    paddingLeft: 16,
    paddingRight: 10,
    paddingVertical: 6,
  },
  surfaceExpanded: {
    minHeight: 92,
    paddingLeft: 21,
    paddingRight: 10,
    paddingVertical: 7,
  },
  surfaceCritical: {
    borderWidth: 1.1,
  },
  copyStack: {
    flex: 1,
    minWidth: 0,
    gap: 5,
    position: 'relative',
    zIndex: 2,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    flex: 1,
    gap: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  title: {
    flex: 1,
    minWidth: 0,
    color: TACTICAL.text,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  commandCopyPanel: {
    position: 'relative',
    gap: 2,
    paddingTop: 1,
    zIndex: 4,
    elevation: 4,
  },
  compactCopyPanel: {
    minHeight: 18,
    justifyContent: 'center',
    paddingTop: 1,
  },
  compactSummary: {
    color: TACTICAL.text,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    position: 'relative',
    zIndex: 5,
  },
  commandCopyLabel: {
    color: TACTICAL.amber,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '900',
    letterSpacing: 0.72,
    textTransform: 'uppercase',
  },
  commandRecommendationLabel: {
    marginTop: 4,
  },
  commandSummary: {
    color: TACTICAL.text,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    position: 'relative',
    zIndex: 5,
  },
  commandDetail: {
    color: TACTICAL.textMuted,
    fontSize: 11.5,
    lineHeight: 15.5,
    fontWeight: '700',
    position: 'relative',
    zIndex: 5,
  },
  animatedCopy: {
    justifyContent: 'center',
    position: 'relative',
    zIndex: 3,
    elevation: 3,
  },
  emptyUpdateSlot: {
    minHeight: 18,
  },
  awaitingBadge: {
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  awaitingBadgeText: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
});
