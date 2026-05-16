import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import type { AlertCommandGroup } from '../../lib/alert/alertCommandSelectors';
import type { ECSPriorityLevel } from '../../lib/ai/priorityTypes';
import { TACTICAL } from '../../lib/theme';

function priorityToneColor(level: ECSPriorityLevel): string {
  switch (level) {
    case 'critical':
      return '#D96C50';
    case 'warning':
      return '#FFB300';
    case 'caution':
      return '#F3D28A';
    case 'advisory':
      return '#6FA8DC';
    default:
      return TACTICAL.textMuted;
  }
}

function priorityLabel(level: ECSPriorityLevel): string {
  switch (level) {
    case 'critical':
      return 'CRITICAL';
    case 'warning':
      return 'WARNING';
    case 'caution':
      return 'CAUTION';
    case 'advisory':
      return 'ADVISORY';
    default:
      return 'INFORMATIONAL';
  }
}

type AdvisoryModel = {
  key: string;
  leadLevel: ECSPriorityLevel;
  title: string;
  summary: string;
  eyebrow: string | null;
  metaLine: string | null;
};

type DispatchAdvisorySurfaceProps = {
  lead: AlertCommandGroup | null;
  secondary: AlertCommandGroup[];
  phaseLabel: string | null;
  operationalLabel: string | null;
};

function buildAdvisoryModel(
  lead: AlertCommandGroup | null,
  secondary: AlertCommandGroup[],
  phaseLabel: string | null,
  operationalLabel: string | null,
): AdvisoryModel {
  const metaLine =
    secondary.length > 0
      ? secondary
          .slice(0, 2)
          .map((item) => `${item.title}${item.count > 1 ? ` +${item.count - 1}` : ''}`)
          .join(' • ')
      : lead?.confidenceLabel ?? null;

  return {
    key: [
      lead?.id ?? 'steady',
      lead?.title ?? 'Dispatch posture steady',
      lead?.summary ?? 'Dispatch protocols, comms, and field references remain ready.',
      phaseLabel ?? '',
      operationalLabel ?? '',
      metaLine ?? '',
    ].join('::'),
    leadLevel: lead?.level ?? 'informational',
    title: lead?.title ?? 'Dispatch posture steady',
    summary: lead?.summary ?? 'Dispatch protocols, comms, and field references remain ready.',
    eyebrow:
      [phaseLabel, operationalLabel]
        .filter(Boolean)
        .join(' • ')
        .toUpperCase() || null,
    metaLine,
  };
}

export default function DispatchAdvisorySurface({
  lead,
  secondary,
  phaseLabel,
  operationalLabel,
}: DispatchAdvisorySurfaceProps) {
  const incomingModel = useMemo(
    () => buildAdvisoryModel(lead, secondary, phaseLabel, operationalLabel),
    [lead, operationalLabel, phaseLabel, secondary],
  );
  const [displayedModel, setDisplayedModel] = useState<AdvisoryModel>(incomingModel);
  const opacity = useRef(new Animated.Value(1)).current;
  const lastSwapAtRef = useRef(Date.now());
  const pendingSwapRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (incomingModel.key === displayedModel.key) {
      return;
    }

    const fadeDurationMs = 160;
    const minimumDwellMs = 3200;
    const elapsedSinceLastSwap = Date.now() - lastSwapAtRef.current;
    const delayMs = Math.max(0, minimumDwellMs - elapsedSinceLastSwap);

    if (pendingSwapRef.current) {
      clearTimeout(pendingSwapRef.current);
    }

    pendingSwapRef.current = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: fadeDurationMs,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) return;

        setDisplayedModel(incomingModel);
        lastSwapAtRef.current = Date.now();
        opacity.setValue(0);

        Animated.timing(opacity, {
          toValue: 1,
          duration: fadeDurationMs + 50,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start();
      });
    }, delayMs);

    return () => {
      if (pendingSwapRef.current) {
        clearTimeout(pendingSwapRef.current);
        pendingSwapRef.current = null;
      }
    };
  }, [displayedModel.key, incomingModel, opacity]);

  useEffect(() => {
    return () => {
      if (pendingSwapRef.current) {
        clearTimeout(pendingSwapRef.current);
      }
    };
  }, []);

  const toneColor = priorityToneColor(displayedModel.leadLevel);
  const shouldRender = !!lead || secondary.length > 0 || !!operationalLabel;

  if (!shouldRender) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.surface, { opacity }]}>
        <View style={[styles.accentRail, { backgroundColor: toneColor }]} />
        <View style={styles.copyStack}>
          <View style={styles.topRow}>
            <Text style={[styles.priority, { color: toneColor }]} numberOfLines={1}>
              {priorityLabel(displayedModel.leadLevel)}
            </Text>
            {displayedModel.eyebrow ? (
              <Text style={styles.eyebrow} numberOfLines={1}>
                {displayedModel.eyebrow}
              </Text>
            ) : null}
          </View>

          <Text style={styles.title} numberOfLines={1}>
            {displayedModel.title}
          </Text>
          <Text style={styles.summary} numberOfLines={2}>
            {displayedModel.summary}
          </Text>

          {displayedModel.metaLine ? (
            <Text style={styles.metaLine} numberOfLines={1}>
              {displayedModel.metaLine}
            </Text>
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    marginBottom: 10,
  },
  surface: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  accentRail: {
    width: 3,
    alignSelf: 'stretch',
    borderRadius: 999,
  },
  copyStack: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  priority: {
    flexShrink: 0,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  eyebrow: {
    flex: 1,
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    textAlign: 'right',
    letterSpacing: 0.7,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 0.2,
  },
  summary: {
    fontSize: 12,
    lineHeight: 17,
    color: TACTICAL.textMuted,
  },
  metaLine: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.45,
    textTransform: 'uppercase',
  },
});
