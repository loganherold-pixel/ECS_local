import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SafeIcon as Ionicons } from '../../SafeIcon';
import { GOLD_RAIL, TACTICAL, TYPO } from '../../../lib/theme';
import type {
  ExpeditionReadinessCommandData,
  ExpeditionReadinessDataState,
  ExpeditionReadinessOverallStatus,
  ExpeditionReadinessSystemId,
  ExpeditionReadinessSystemStatus,
  ReadinessIssue,
  ReadinessSystem,
} from '../../../lib/navigation/expeditionReadinessCommandData';
import { CommandCenterFrame } from './CommandCenterFrame';
import type { CommandCenterMode } from './commandCenterTypes';
import { useExpeditionReadinessData } from './useExpeditionReadinessData';

type ExpeditionReadinessCommandProps = {
  mode?: CommandCenterMode;
  availableModes?: CommandCenterMode[];
  onModeChange?: (mode: CommandCenterMode) => void;
  testID?: string;
};

type ReadinessTone = 'ready' | 'watch' | 'caution' | 'critical' | 'muted';

const STATE_LABEL: Record<ExpeditionReadinessDataState, string> = {
  live: 'LIVE',
  estimated: 'ESTIMATED',
  partial: 'PARTIAL',
  offline: 'OFFLINE',
  setupNeeded: 'SETUP NEEDED',
};

const STATUS_ACCENT: Record<ExpeditionReadinessSystemStatus, string> = {
  ready: '#49D17A',
  watch: '#5AC8FA',
  caution: TACTICAL.amber,
  critical: TACTICAL.danger,
  unknown: TACTICAL.textMuted,
};

const OVERALL_LABEL: Record<ExpeditionReadinessOverallStatus, string> = {
  ready: 'READY',
  watch: 'WATCH',
  caution: 'CAUTION',
  notReady: 'NOT READY',
  unknown: 'UNKNOWN',
};

const STATUS_SORT_RANK: Record<ExpeditionReadinessSystemStatus, number> = {
  critical: 4,
  caution: 3,
  unknown: 2,
  watch: 1,
  ready: 0,
};

function getTone(status: ExpeditionReadinessOverallStatus): ReadinessTone {
  switch (status) {
    case 'ready':
      return 'ready';
    case 'watch':
      return 'watch';
    case 'caution':
      return 'caution';
    case 'notReady':
      return 'critical';
    case 'unknown':
    default:
      return 'muted';
  }
}

function getToneAccent(tone: ReadinessTone): string {
  switch (tone) {
    case 'ready':
      return '#49D17A';
    case 'watch':
      return '#5AC8FA';
    case 'caution':
      return TACTICAL.amber;
    case 'critical':
      return TACTICAL.danger;
    case 'muted':
    default:
      return TACTICAL.textMuted;
  }
}

function formatUpdateAge(updatedAt: Date | null): string {
  if (!updatedAt) return 'Assessment pending';
  const elapsedMs = Date.now() - updatedAt.getTime();
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return 'Updated just now';
  const seconds = Math.round(elapsedMs / 1000);
  if (seconds < 5) return 'Updated just now';
  if (seconds < 60) return `Updated ${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `Updated ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `Updated ${hours}h ago`;
}

function getSystemIcon(id: ExpeditionReadinessSystemId): React.ComponentProps<typeof Ionicons>['name'] {
  switch (id) {
    case 'vehicle':
      return 'car-sport-outline';
    case 'route':
      return 'navigate-outline';
    case 'weather':
      return 'cloudy-outline';
    case 'daylight':
      return 'sunny-outline';
    case 'power':
      return 'battery-charging-outline';
    case 'communications':
      return 'radio-outline';
    case 'recovery':
      return 'construct-outline';
    case 'camp':
      return 'bonfire-outline';
    case 'incident':
      return 'alert-circle-outline';
    case 'offlineCache':
      return 'cloud-offline-outline';
    default:
      return 'ellipse-outline';
  }
}

function SystemRow({ system }: { system: ReadinessSystem }) {
  const accent = STATUS_ACCENT[system.status];
  return (
    <View style={styles.systemRow}>
      <View style={[styles.systemIcon, { borderColor: `${accent}55`, backgroundColor: `${accent}13` }]}>
        <Ionicons name={getSystemIcon(system.id)} size={12} color={accent} />
      </View>
      <View style={styles.systemCopy}>
        <View style={styles.systemLabelRow}>
          <Text style={styles.systemLabel} numberOfLines={1}>
            {system.label}
          </Text>
          {system.isEstimated ? (
            <Text style={styles.estimatedTag} numberOfLines={1}>
              EST
            </Text>
          ) : null}
        </View>
        <Text style={styles.systemSource} numberOfLines={1}>
          {system.sourceLabel} · {system.confidenceLabel}
        </Text>
      </View>
      <Text
        style={[styles.systemValue, { color: system.status === 'unknown' ? TACTICAL.textMuted : TACTICAL.text }]}
        numberOfLines={1}
      >
        {system.value}
      </Text>
    </View>
  );
}

function SetupNeededState({ data }: { data: ExpeditionReadinessCommandData }) {
  const missing = data.missingInputs.length > 0 ? data.missingInputs.slice(0, 4).join(' · ') : 'Expedition inputs';
  return (
    <View style={styles.setupState}>
      <View style={styles.setupIcon}>
        <Ionicons name="shield-checkmark-outline" size={25} color={TACTICAL.amber} />
      </View>
      <Text style={styles.setupTitle} numberOfLines={1}>
        Readiness assessment limited
      </Text>
      <Text style={styles.setupText} numberOfLines={2}>
        Add vehicle, route, location, and environment inputs for continuation readiness scoring.
      </Text>
      <Text style={styles.setupMissing} numberOfLines={1}>
        Missing: {missing}
      </Text>
    </View>
  );
}

function ReadinessGauge({ data }: { data: ExpeditionReadinessCommandData }) {
  const tone = getTone(data.overallStatus);
  const accent = getToneAccent(tone);
  const pct = Math.max(0, Math.min(100, data.overallScorePercent));
  const fillWidth = `${pct}%` as `${number}%`;
  return (
    <View style={[styles.gaugeShell, { borderColor: `${accent}77` }]}>
      <View style={styles.gaugeHeader}>
        <Text style={[styles.gaugeScore, { color: accent }]} numberOfLines={1}>
          {pct}
        </Text>
        <Text style={styles.gaugeScoreSuffix} numberOfLines={1}>
          /100
        </Text>
      </View>
      <View style={styles.gaugeTrack}>
        <View style={[styles.gaugeFill, { width: fillWidth, backgroundColor: accent }]} />
      </View>
      <Text style={styles.gaugeLabel} numberOfLines={1}>
        CONTINUATION READINESS
      </Text>
    </View>
  );
}

function IssueSummary({ blockers, warnings }: { blockers: ReadinessIssue[]; warnings: ReadinessIssue[] }) {
  const primary = blockers[0] ?? warnings[0] ?? null;
  if (!primary) {
    return (
      <View style={styles.issueBox}>
        <Ionicons name="checkmark-circle-outline" size={13} color="#49D17A" />
        <Text style={styles.issueText} numberOfLines={1}>
          No blockers reported by readiness assessment.
        </Text>
      </View>
    );
  }
  const accent = primary.severity === 'blocker' ? TACTICAL.danger : TACTICAL.amber;
  return (
    <View style={[styles.issueBox, { borderColor: `${accent}40`, backgroundColor: `${accent}12` }]}>
      <Ionicons
        name={primary.severity === 'blocker' ? 'hand-left-outline' : 'alert-circle-outline'}
        size={13}
        color={accent}
      />
      <Text style={styles.issueText} numberOfLines={1}>
        {primary.label}: {primary.detail}
      </Text>
    </View>
  );
}

export function ExpeditionReadinessCommand({
  mode = 'expeditionReadiness',
  availableModes,
  onModeChange,
  testID = 'expedition-readiness-command',
}: ExpeditionReadinessCommandProps) {
  const data = useExpeditionReadinessData();
  const tone = getTone(data.overallStatus);
  const accent = getToneAccent(tone);
  const topSystems = useMemo(
    () =>
      [...data.systems].sort((a, b) => {
        const statusDelta = STATUS_SORT_RANK[b.status] - STATUS_SORT_RANK[a.status];
        return statusDelta || a.label.localeCompare(b.label);
      }),
    [data.systems],
  );
  const footerItems = [
    data.confidenceLabel,
    data.isUsingCachedData ? 'Cached source mix' : 'Current source mix',
    data.blockers.length ? `${data.blockers.length} blockers` : `${data.warnings.length} warnings`,
    formatUpdateAge(data.lastUpdatedAt),
  ];

  return (
    <CommandCenterFrame
      title="EXPEDITION READINESS COMMAND"
      subtitle="Continuation Readiness Assessment"
      state={data.dataState}
      stateLabel={STATE_LABEL[data.dataState]}
      mode={mode}
      availableModes={availableModes}
      onModeChange={onModeChange}
      footer={
        <View style={styles.footerWrap}>
          {footerItems.map((item) => (
            <Text key={item} style={styles.footerText} numberOfLines={1}>
              {item}
            </Text>
          ))}
        </View>
      }
      testID={testID}
    >
      <View style={[styles.body, data.dataState === 'offline' ? styles.bodyOffline : null]}>
        {data.dataState === 'setupNeeded' ? (
          <SetupNeededState data={data} />
        ) : (
          <>
            <View style={styles.mainContent}>
              <View style={styles.readinessColumn}>
                <View style={[styles.readinessPanel, { borderColor: `${accent}55` }]}>
                  <View style={styles.statusTopRow}>
                    <View style={[styles.statusIcon, { borderColor: `${accent}77`, backgroundColor: `${accent}15` }]}>
                      <Ionicons name="shield-checkmark-outline" size={20} color={accent} />
                    </View>
                    <Text style={styles.statusEyebrow} numberOfLines={1}>
                      ECS SYNTHESIS
                    </Text>
                  </View>
                  <Text style={[styles.statusLabel, { color: accent }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                    {OVERALL_LABEL[data.overallStatus]}
                  </Text>
                  <Text style={styles.statusReason} numberOfLines={3}>
                    {data.primaryReason}
                  </Text>
                  <ReadinessGauge data={data} />
                  <IssueSummary blockers={data.blockers} warnings={data.warnings} />
                </View>
              </View>

              <View style={styles.systemColumn}>
                {topSystems.map((system) => (
                  <SystemRow key={system.id} system={system} />
                ))}
              </View>
            </View>

            <View
              style={[
                styles.actionStrip,
                {
                  borderColor: `${accent}55`,
                  backgroundColor:
                    tone === 'critical'
                      ? 'rgba(192, 57, 43, 0.16)'
                      : tone === 'caution'
                        ? 'rgba(212, 160, 23, 0.16)'
                        : 'rgba(255,255,255,0.04)',
                },
              ]}
            >
              <View style={[styles.actionIcon, { borderColor: `${accent}66` }]}>
                <Ionicons name="git-compare-outline" size={13} color={accent} />
              </View>
              <View style={styles.actionCopy}>
                <Text style={[styles.actionLabel, { color: accent }]} numberOfLines={1}>
                  {data.primaryRecommendation}
                </Text>
                <Text style={styles.actionDetail} numberOfLines={1}>
                  Readiness is ECS-Inferred. Verify current field conditions before proceeding.
                </Text>
              </View>
            </View>
          </>
        )}
      </View>
    </CommandCenterFrame>
  );
}

export default ExpeditionReadinessCommand;

const styles = StyleSheet.create({
  body: {
    flex: 1,
    minHeight: 0,
    gap: 7,
    padding: 7,
    backgroundColor: 'rgba(2, 5, 8, 0.48)',
  },
  bodyOffline: {
    opacity: 0.78,
  },
  mainContent: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  readinessColumn: {
    width: '43%',
    minWidth: 120,
    minHeight: 0,
  },
  readinessPanel: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: 'rgba(7, 12, 17, 0.86)',
    padding: 8,
    gap: 6,
  },
  statusTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  statusIcon: {
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusEyebrow: {
    flex: 1,
    color: TACTICAL.textMuted,
    fontSize: 7,
    lineHeight: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
    includeFontPadding: false,
  },
  statusLabel: {
    fontSize: 17,
    lineHeight: 19,
    fontWeight: '900',
    letterSpacing: 1,
    includeFontPadding: false,
  },
  statusReason: {
    color: 'rgba(230, 237, 243, 0.78)',
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '800',
    includeFontPadding: false,
  },
  gaugeShell: {
    borderRadius: 11,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.28)',
    padding: 7,
    gap: 5,
  },
  gaugeHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
  },
  gaugeScore: {
    fontSize: 24,
    lineHeight: 25,
    fontWeight: '900',
    includeFontPadding: false,
  },
  gaugeScoreSuffix: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900',
    includeFontPadding: false,
  },
  gaugeTrack: {
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  gaugeFill: {
    height: '100%',
    borderRadius: 999,
  },
  gaugeLabel: {
    ...TYPO.U2,
    color: TACTICAL.textMuted,
    fontSize: 7,
    letterSpacing: 0.55,
    textAlign: 'center',
  },
  issueBox: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(73, 209, 122, 0.32)',
    backgroundColor: 'rgba(73, 209, 122, 0.08)',
    paddingHorizontal: 7,
  },
  issueText: {
    flex: 1,
    minWidth: 0,
    color: 'rgba(230, 237, 243, 0.76)',
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '800',
    includeFontPadding: false,
  },
  systemColumn: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 4,
  },
  systemRow: {
    minHeight: 28,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(212, 160, 23, 0.13)',
    backgroundColor: 'rgba(255,255,255,0.035)',
    paddingHorizontal: 7,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  systemIcon: {
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  systemCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  systemLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  systemLabel: {
    flexShrink: 1,
    color: TACTICAL.amber,
    fontSize: 7,
    lineHeight: 9,
    fontWeight: '900',
    letterSpacing: 0.65,
    includeFontPadding: false,
    textTransform: 'uppercase',
  },
  estimatedTag: {
    color: '#5AC8FA',
    fontSize: 6,
    lineHeight: 8,
    fontWeight: '900',
    includeFontPadding: false,
  },
  systemSource: {
    color: 'rgba(230, 237, 243, 0.65)',
    fontSize: 7,
    lineHeight: 9,
    fontWeight: '800',
    includeFontPadding: false,
  },
  systemValue: {
    maxWidth: '37%',
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900',
    letterSpacing: 0.1,
    includeFontPadding: false,
    textAlign: 'right',
  },
  actionStrip: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 11,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  actionIcon: {
    width: 25,
    height: 25,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.26)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  actionLabel: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '900',
    letterSpacing: 0.8,
    includeFontPadding: false,
  },
  actionDetail: {
    color: 'rgba(230, 237, 243, 0.72)',
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '800',
    includeFontPadding: false,
  },
  footerWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  footerText: {
    flexShrink: 1,
    color: 'rgba(230, 237, 243, 0.74)',
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '800',
    letterSpacing: 0.25,
    includeFontPadding: false,
  },
  setupState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  setupIcon: {
    width: 42,
    height: 42,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: GOLD_RAIL.instrument,
    backgroundColor: 'rgba(212, 160, 23, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  setupTitle: {
    color: TACTICAL.amber,
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '900',
    letterSpacing: 0.8,
    includeFontPadding: false,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  setupText: {
    color: 'rgba(230, 237, 243, 0.76)',
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800',
    includeFontPadding: false,
    textAlign: 'center',
  },
  setupMissing: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
    includeFontPadding: false,
    textAlign: 'center',
  },
});
