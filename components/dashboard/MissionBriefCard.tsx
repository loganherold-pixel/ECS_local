import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import { useTheme } from '../../context/ThemeContext';
import { WidgetCompactRow } from './WidgetChrome';
import { formatConfidenceCompactLine } from '../../lib/ai/confidenceEngine';
import { formatTrustCompactLine } from '../../lib/ai/trustContract';
import type { BriefCommandState } from '../../lib/ai/briefSelectors';
import type { ECSTrustMetadata } from '../../lib/ai/trustTypes';

type BriefStatus = 'green' | 'yellow' | 'red' | 'watch' | 'critical' | 'stable';
type BriefUrgency = 'now' | 'next' | 'monitor';

type BriefTask = {
  id?: string;
  title?: string | null;
  detail?: string | null;
  urgency?: BriefUrgency | null;
};

type BriefPowerMeta = {
  deviceLabel?: string | null;
  provider?: string | null;
  providerLabel?: string | null;
  freshness?: string | null;
  freshnessText?: string | null;
  batteryPercent?: number | null;
  reservePercent?: number | null;
  inputWatts?: number | null;
  outputWatts?: number | null;
  solarInputWatts?: number | null;
  solarWatts?: number | null;
};

type BriefWeatherMeta = {
  source?: 'live' | 'cache' | 'none' | string | null;
  staleness?: 'fresh' | 'aging' | 'stale' | 'very_stale' | 'unknown' | string | null;
  severity?: 'none' | 'advisory' | 'warning' | 'extreme' | string | null;
  ageLabel?: string | null;
  hasPayload?: boolean | null;
  label?: string | null;
};

type BriefRouteGuidanceMeta = {
  requested?: boolean | null;
  available?: boolean | null;
  unavailable?: boolean | null;
  reason?: string | null;
  label?: string | null;
};

type BriefPhaseMeta = {
  phase?: string | null;
  label?: string | null;
};

type MissionBriefLike = {
  headline?: string | null;
  summary?: string | null;
  confidence?: {
    label?: string | null;
    shortReason?: string | null;
  } | null;
  commandIntent?: string | null;
  operatorNote?: string | null;
  status?: BriefStatus | number | null;
  compactTone?: 'stable' | 'watch' | 'critical' | null;
  compactLabel?: string | null;
  priorityMessage?: string | null;
  recommendations?: string[] | null;
  keyRisks?: string[] | null;
  operatorTasks?: BriefTask[] | null;
  primaryTask?: BriefTask | null;
  powerMeta?: BriefPowerMeta | null;
  weatherMeta?: BriefWeatherMeta | null;
  routeGuidanceMeta?: BriefRouteGuidanceMeta | null;
  phase?: BriefPhaseMeta | null;
  trust?: ECSTrustMetadata | null;
};

type Props = {
  brief: MissionBriefLike | null;
  commandState?: BriefCommandState | null;
  compact?: boolean;
  onSurfaceActionPress?: (action: unknown) => void;
  onAssistActionPress?: (surface: unknown, rule?: unknown | null) => void;
};

type NormalizedBrief = {
  title: string;
  postureLine: string | null;
  headline: string;
  summary: string;
  confidenceLine: string | null;
  commandIntent: string;
  nextAction: string;
  statusLabel: string;
  statusTone: 'green' | 'yellow' | 'red';
  recommendations: string[];
  risks: string[];
  supportLine: string | null;
  limitationLine: string | null;
  topSignal: string | null;
  powerLine: string | null;
};

function clampLine(text?: string | null, fallback = ''): string {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim();
  return value || fallback;
}

function resolveTone(status: MissionBriefLike['status'], compactTone?: MissionBriefLike['compactTone']): 'green' | 'yellow' | 'red' {
  if (typeof status === 'number') {
    if (status >= 3) return 'red';
    if (status >= 2) return 'yellow';
    return 'green';
  }

  if (status === 'red' || compactTone === 'critical') return 'red';
  if (status === 'yellow' || status === 'watch' || compactTone === 'watch') return 'yellow';
  return 'green';
}

function resolveStatusLabel(tone: 'green' | 'yellow' | 'red', explicit?: string | null): string {
  const normalized = clampLine(explicit);
  if (normalized) return normalized.toUpperCase();
  if (tone === 'red') return 'RED';
  if (tone === 'yellow') return 'YELLOW';
  return 'GREEN';
}

function formatPowerLine(meta?: BriefPowerMeta | null): string | null {
  if (!meta) return null;

  const source = clampLine(meta.deviceLabel || meta.providerLabel || meta.provider, '');
  const battery = typeof meta.batteryPercent === 'number'
    ? `${Math.round(meta.batteryPercent)}%`
    : typeof meta.reservePercent === 'number'
      ? `${Math.round(meta.reservePercent)}%`
      : null;
  const output = typeof meta.outputWatts === 'number' ? `${Math.round(meta.outputWatts)}W out` : null;
  const input = typeof meta.inputWatts === 'number' ? `${Math.round(meta.inputWatts)}W in` : null;
  const solar = typeof meta.solarInputWatts === 'number'
    ? `${Math.round(meta.solarInputWatts)}W solar`
    : typeof meta.solarWatts === 'number'
      ? `${Math.round(meta.solarWatts)}W solar`
      : null;
  const freshness = clampLine(meta.freshnessText || meta.freshness, '');

  const parts = [source, battery, input, output, solar, freshness].filter(Boolean);
  return parts.length ? parts.join(' • ') : null;
}

function weatherActivityLine(meta?: BriefWeatherMeta | null): string | null {
  if (!meta) return null;
  const explicit = clampLine(meta.label, '');
  if (explicit) return explicit;

  const severity = clampLine(meta.severity, '').toLowerCase();
  const staleness = clampLine(meta.staleness, '').toLowerCase();
  const source = clampLine(meta.source, '').toLowerCase();
  const hasPayload = meta.hasPayload === true;

  if (severity === 'extreme' || severity === 'warning') return 'Weather alert active';
  if (source === 'none' && !hasPayload) return 'Weather provider unavailable';
  if (staleness === 'stale' || staleness === 'very_stale') return 'Weather data is stale';
  if (staleness === 'fresh' || staleness === 'aging') return 'Weather updated recently';
  return null;
}

function routeGuidanceActivityLine(meta?: BriefRouteGuidanceMeta | null): string | null {
  if (!meta) return null;
  const explicit = clampLine(meta.label, '');
  if (explicit && explicit !== 'Route guidance not active') return explicit;
  if (meta.available === true) return 'Route guidance available';
  if (meta.unavailable === true) return 'Route guidance unavailable';
  return null;
}

function phaseActivityLine(
  brief?: MissionBriefLike | null,
  commandState?: BriefCommandState | null,
): string | null {
  const phase = clampLine(brief?.phase?.phase, '').toLowerCase();
  const label = clampLine(brief?.phase?.label || commandState?.phaseLabel, '');
  if (phase === 'staging') return 'Staging/pre-departure active';
  if (phase === 'vehicle_setup') return 'Vehicle setup active';
  if (label.toLowerCase().includes('staging')) return 'Staging/pre-departure active';
  return null;
}

function sourceDrivenActivityLine(
  brief: MissionBriefLike | null,
  commandState: BriefCommandState | null | undefined,
): string | null {
  const parts = [
    weatherActivityLine(brief?.weatherMeta),
    routeGuidanceActivityLine(brief?.routeGuidanceMeta),
    phaseActivityLine(brief, commandState ?? null),
  ].filter(Boolean) as string[];

  return parts.length ? parts.join('. ') : null;
}

function normalizeBrief(
  brief: MissionBriefLike | null,
  commandState: BriefCommandState | null | undefined,
): NormalizedBrief | null {
  if (!brief && !commandState) return null;

  const tone = commandState?.statusTone ?? resolveTone(brief?.status, brief?.compactTone);
  const recommendations = Array.isArray(brief?.recommendations)
    ? brief.recommendations.map((item) => clampLine(item)).filter(Boolean)
    : [];
  const risks = Array.isArray(brief?.keyRisks)
    ? brief.keyRisks.map((item) => clampLine(item)).filter(Boolean)
    : [];

  const primaryTask = clampLine(
    brief?.primaryTask?.title || brief?.priorityMessage || brief?.operatorTasks?.[0]?.title,
    '',
  );

  return {
    title: 'ECS MISSION BRIEF',
    postureLine: clampLine(commandState?.postureLine, ''),
    headline: clampLine(
      commandState?.headline || brief?.headline,
      'STANDBY - ECS BRIEF UNAVAILABLE',
    ),
    summary: clampLine(
      commandState?.summary || brief?.summary,
      'ECS brief synthesis is not available yet. Mission context will populate as route, vehicle, power, and expedition signals come online.',
    ),
    confidenceLine:
      clampLine(commandState?.confidenceLine, '') ||
      formatTrustCompactLine(brief?.trust ?? null) ||
      formatConfidenceCompactLine((brief as any)?.confidence ?? null),
    commandIntent: clampLine(
      commandState?.commandIntent || brief?.commandIntent,
      recommendations[0] || 'Complete expedition setup, verify vehicle state, and load a route before mission activation.',
    ),
    nextAction:
      clampLine(commandState?.nextAction, '') ||
      primaryTask ||
      recommendations[0] ||
      'Complete setup and establish route posture.',
    statusLabel:
      clampLine(commandState?.statusLabel, '') ||
      resolveStatusLabel(tone, brief?.compactLabel || null),
    statusTone: tone,
    recommendations,
    risks,
    supportLine: clampLine(commandState?.supportLine, ''),
    limitationLine: clampLine(commandState?.limitationLine, ''),
    topSignal: clampLine(commandState?.topSignal, ''),
    powerLine: formatPowerLine(brief?.powerMeta),
  };
}

export function summarizeMissionBriefLogEntry(
  brief: MissionBriefLike | null,
  commandState: BriefCommandState | null | undefined,
): { id: string; message: string } | null {
  const normalized = normalizeBrief(brief, commandState);
  if (!normalized) return null;

  const message = clampLine(
    [
      normalized.headline,
      sourceDrivenActivityLine(brief, commandState) ||
        normalized.limitationLine ||
        normalized.supportLine ||
        normalized.topSignal ||
        normalized.nextAction,
    ]
      .filter(Boolean)
      .join(' — '),
    '',
  );

  if (!message) return null;

  return {
    id: [
      normalized.statusLabel,
      normalized.headline,
      normalized.summary,
      normalized.nextAction,
      normalized.limitationLine,
      normalized.supportLine,
      brief?.weatherMeta?.label,
      brief?.weatherMeta?.staleness,
      brief?.routeGuidanceMeta?.label,
      brief?.phase?.phase,
    ]
      .filter(Boolean)
      .join('|')
      .toLowerCase(),
    message,
  };
}

function toneColor(tone: 'green' | 'yellow' | 'red'): string {
  if (tone === 'red') return '#E06363';
  if (tone === 'yellow') return TACTICAL.amber;
  return '#46C777';
}

function toneBorder(tone: 'green' | 'yellow' | 'red'): string {
  if (tone === 'red') return 'rgba(224,99,99,0.35)';
  if (tone === 'yellow') return 'rgba(196,138,44,0.40)';
  return 'rgba(70,199,119,0.35)';
}

function Badge({ tone, label }: { tone: 'green' | 'yellow' | 'red'; label: string }) {
  return (
    <View style={[styles.statusPill, { borderColor: toneBorder(tone), backgroundColor: `${toneColor(tone)}18` }]}>
      <Text style={[styles.statusPillText, { color: toneColor(tone) }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function Section({
  icon,
  label,
  body,
  tone,
  labelColor,
  bodyColor,
  borderColor,
  backgroundColor,
}: {
  icon: string;
  label: string;
  body: string;
  tone?: 'green' | 'yellow' | 'red';
  labelColor?: string;
  bodyColor?: string;
  borderColor?: string;
  backgroundColor?: string;
}) {
  return (
    <View
      style={[
        styles.sectionCard,
        borderColor ? { borderColor } : null,
        backgroundColor ? { backgroundColor } : null,
      ]}
    >
      <View style={styles.sectionLabelRow}>
        <Ionicons name={icon as never} size={13} color={tone ? toneColor(tone) : TACTICAL.amber} />
        <Text style={[styles.sectionLabel, labelColor ? { color: labelColor } : null]}>{label}</Text>
      </View>
      <Text style={[styles.sectionBody, bodyColor ? { color: bodyColor } : null]}>{body}</Text>
    </View>
  );
}

export default function MissionBriefCard({
  brief,
  commandState = null,
  compact = false,
  onSurfaceActionPress,
  onAssistActionPress,
}: Props) {
  void onSurfaceActionPress;
  void onAssistActionPress;

  const { palette, colors, isLight } = useTheme();
  const normalized = useMemo(() => normalizeBrief(brief, commandState), [brief, commandState]);

  if (!normalized) {
    return (
      <View
        style={[
          styles.card,
          styles.emptyCard,
          {
            backgroundColor: isLight ? palette.panel : 'rgba(7,11,18,0.96)',
            borderColor: isLight ? palette.border : undefined,
            shadowColor: isLight ? '#00000012' : '#000',
          },
        ]}
      >
        <View style={styles.headerRow}>
          <View style={styles.titleRow}>
            <Ionicons name="sparkles-outline" size={16} color={TACTICAL.amber} />
            <Text style={[styles.title, { color: palette.amber }]}>ECS MISSION BRIEF</Text>
          </View>
          <Badge tone="green" label="STANDBY" />
        </View>

        <Text style={[styles.headline, { color: palette.text }]}>STANDBY — NO ECS BRIEF</Text>
        <Text style={[styles.summary, { color: isLight ? colors.textSecondary : 'rgba(233,237,244,0.78)' }]}>
          ECS is standing by. Configure the platform, verify readiness, and load a route to activate mission context.
        </Text>
      </View>
    );
  }

  const accentColor = toneColor(normalized.statusTone);
  const topSignal =
    normalized.limitationLine ||
    normalized.supportLine ||
    normalized.topSignal ||
    normalized.risks[0] ||
    normalized.recommendations[0] ||
    normalized.summary;
  const compactSupportLine = normalized.powerLine || normalized.commandIntent;

  if (compact) {
    const compactSummarySource = clampLine(
      normalized.risks[0] || normalized.nextAction || normalized.headline,
      normalized.headline,
    );
    const compactSummary = compactSummarySource.toUpperCase().startsWith('ECS:')
      ? compactSummarySource
      : `ECS: ${compactSummarySource}`;
    const compactSummaryWithConfidence = normalized.confidenceLine
      ? `${compactSummary} • ${normalized.confidenceLine.split(' - ')[0]}`
      : compactSummary;
    return (
      <WidgetCompactRow
        title="Brief"
        summary={compactSummaryWithConfidence}
        tone={
          normalized.statusTone === 'red'
            ? 'critical'
            : normalized.statusTone === 'yellow'
              ? 'attention'
              : 'good'
        }
        status={normalized.statusLabel}
        statusTone={
          normalized.statusTone === 'red'
            ? 'critical'
            : normalized.statusTone === 'yellow'
              ? 'attention'
              : 'good'
        }
      />
    );
  }

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: isLight ? palette.panel : 'rgba(7,11,18,0.96)',
          borderColor: isLight ? palette.border : toneBorder(normalized.statusTone),
          shadowColor: isLight ? '#00000012' : accentColor,
        },
      ]}
    >
      <View style={styles.headerRow}>
        <View style={styles.titleRow}>
          <Ionicons name="sparkles-outline" size={16} color={TACTICAL.amber} />
          <Text style={[styles.title, { color: palette.amber }]}>{normalized.title}</Text>
        </View>
        <Badge tone={normalized.statusTone} label={normalized.statusLabel} />
      </View>

      {normalized.postureLine ? (
        <Text
          style={[styles.postureLine, { color: isLight ? colors.textSecondary : 'rgba(233,237,244,0.62)' }]}
          numberOfLines={1}
        >
          {normalized.postureLine}
        </Text>
      ) : null}

      <Text style={[styles.headline, { color: palette.text }]}>
        {normalized.headline}
      </Text>
      <Text
        style={[styles.summary, { color: isLight ? colors.textSecondary : 'rgba(233,237,244,0.78)' }]}
      >
        {normalized.summary}
      </Text>
      {normalized.confidenceLine ? (
        <Text
          style={[styles.confidenceLine, { color: isLight ? colors.textSecondary : 'rgba(233,237,244,0.62)' }]}
        >
          {normalized.confidenceLine}
        </Text>
      ) : null}

      <View style={styles.sectionStack}>
        <Section
          icon="compass-outline"
          label="COMMAND INTENT"
          body={normalized.commandIntent}
          tone={normalized.statusTone}
          labelColor={palette.amber}
          bodyColor={palette.text}
          borderColor={isLight ? palette.border : 'rgba(196,138,44,0.18)'}
          backgroundColor={isLight ? colors.bgInput : 'rgba(255,255,255,0.03)'}
        />
        <Section
          icon="play-forward-outline"
          label="ECS TASKING"
          body={normalized.nextAction}
          labelColor={palette.amber}
          bodyColor={palette.text}
          borderColor={isLight ? palette.border : 'rgba(196,138,44,0.18)'}
          backgroundColor={isLight ? colors.bgInput : 'rgba(255,255,255,0.03)'}
        />
      </View>

      {!compact && normalized.powerLine ? (
        <View style={[styles.footerRow, { borderTopColor: isLight ? palette.border : 'rgba(196,138,44,0.16)' }]}>
          <Ionicons name="flash-outline" size={13} color={TACTICAL.amber} />
          <Text
            style={[styles.footerText, { color: isLight ? colors.textSecondary : 'rgba(233,237,244,0.72)' }]}
          >
            {normalized.powerLine}
          </Text>
        </View>
      ) : null}

      {compact ? null : (
        <View style={styles.signalRow}>
          <View style={[styles.signalDot, { backgroundColor: accentColor }]} />
          <Text
            style={[styles.signalText, { color: isLight ? colors.textSecondary : 'rgba(233,237,244,0.74)' }]}
          >
            {topSignal}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(7,11,18,0.96)',
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    overflow: 'hidden',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  compactCard: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
  },
  emptyCard: {
    minHeight: 148,
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: TACTICAL.amber,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 2.2,
    flexShrink: 1,
  },
  titleCompact: {
    fontSize: 12,
    letterSpacing: 1.6,
  },
  statusPill: {
    minWidth: 92,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  headline: {
    marginTop: 14,
    color: '#F5F7FA',
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '800',
  },
  headlineCompact: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 20,
  },
  postureLine: {
    marginTop: 12,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  summary: {
    marginTop: 8,
    color: 'rgba(233,237,244,0.78)',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '500',
  },
  confidenceLine: {
    marginTop: 6,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  sectionStack: {
    marginTop: 14,
    gap: 10,
  },
  sectionCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.18)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  sectionLabel: {
    color: TACTICAL.amber,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
  },
  sectionBody: {
    color: '#F0F3F8',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '700',
  },
  footerRow: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(196,138,44,0.16)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  footerText: {
    flex: 1,
    color: 'rgba(233,237,244,0.72)',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  signalRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  compactActionBand: {
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  compactBandLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  compactBandValue: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  compactMetaRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  compactMetaText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '600',
  },
  compactMetaTextRight: {
    textAlign: 'right',
  },
  signalDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  signalText: {
    flex: 1,
    color: 'rgba(233,237,244,0.74)',
    fontSize: 12,
    fontWeight: '600',
  },
});

