import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SafeIcon as Ionicons } from '../../SafeIcon';
import { GOLD_RAIL, TACTICAL, TYPO } from '../../../lib/theme';
import type {
  TrailDecisionCommandData,
  TrailDecisionDataState,
  TrailDecisionFactor,
  TrailDecisionRecommendation,
  TrailDecisionSeverity,
} from '../../../lib/navigation/trailDecisionCommandData';
import { CommandCenterFrame } from './CommandCenterFrame';
import type { CommandCenterMode } from './commandCenterTypes';
import { useTrailDecisionData } from './useTrailDecisionData';

type TrailDecisionCommandProps = {
  mode?: CommandCenterMode;
  availableModes?: CommandCenterMode[];
  onModeChange?: (mode: CommandCenterMode) => void;
  testID?: string;
};

type DecisionTone = 'live' | 'estimated' | 'warning' | 'hazard' | 'muted';

const STATE_LABEL: Record<TrailDecisionDataState, string> = {
  live: 'LIVE',
  estimated: 'ESTIMATED',
  partial: 'PARTIAL',
  offline: 'OFFLINE',
  setupNeeded: 'SETUP NEEDED',
};

const SEVERITY_ACCENT: Record<TrailDecisionSeverity, string> = {
  good: '#49D17A',
  watch: '#5AC8FA',
  caution: TACTICAL.amber,
  critical: TACTICAL.danger,
  unknown: TACTICAL.textMuted,
};

const SEVERITY_SORT_RANK: Record<TrailDecisionSeverity, number> = {
  critical: 4,
  caution: 3,
  watch: 2,
  unknown: 1,
  good: 0,
};

const DECISION_ICON: Record<TrailDecisionRecommendation, React.ComponentProps<typeof Ionicons>['name']> = {
  proceed: 'checkmark-circle-outline',
  proceedWithCaution: 'alert-circle-outline',
  scoutOnFoot: 'footsteps-outline',
  rerouteRecommended: 'git-branch-outline',
  turnBackRecommended: 'return-up-back-outline',
  holdPosition: 'hand-left-outline',
  unknown: 'help-circle-outline',
};

function formatUpdateAge(updatedAt: Date | null): string {
  if (!updatedAt) return 'Update pending';
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

function formatHeading(value: number | null): string {
  if (value == null) return 'Heading unavailable';
  return `${Math.round(value).toString().padStart(3, '0')}° heading`;
}

function formatConfidence(data: TrailDecisionCommandData): string {
  if (data.dataState === 'setupNeeded') return 'Setup needed';
  if (data.dataState === 'offline') return 'Offline confidence';
  return `${data.confidencePercent}% confidence`;
}

function getDecisionTone(data: TrailDecisionCommandData): DecisionTone {
  switch (data.recommendedDecision) {
    case 'proceed':
      return 'live';
    case 'proceedWithCaution':
    case 'scoutOnFoot':
    case 'rerouteRecommended':
      return 'warning';
    case 'turnBackRecommended':
    case 'holdPosition':
      return data.dataState === 'offline' ? 'muted' : 'hazard';
    case 'unknown':
    default:
      return data.dataState === 'estimated' ? 'estimated' : 'muted';
  }
}

function getToneAccent(tone: DecisionTone): string {
  switch (tone) {
    case 'live':
      return '#49D17A';
    case 'estimated':
      return '#5AC8FA';
    case 'warning':
      return TACTICAL.amber;
    case 'hazard':
      return TACTICAL.danger;
    case 'muted':
    default:
      return TACTICAL.textMuted;
  }
}

function FactorRow({ factor }: { factor: TrailDecisionFactor }) {
  const accent = SEVERITY_ACCENT[factor.severity];
  return (
    <View style={styles.factorRow}>
      <View style={[styles.factorIcon, { borderColor: `${accent}55`, backgroundColor: `${accent}14` }]}>
        <Ionicons name={getFactorIcon(factor.id)} size={12} color={accent} />
      </View>
      <View style={styles.factorCopy}>
        <View style={styles.factorLabelRow}>
          <Text style={styles.factorLabel} numberOfLines={1}>
            {factor.label}
          </Text>
          {factor.isEstimated ? (
            <Text style={styles.estimatedTag} numberOfLines={1}>
              EST
            </Text>
          ) : null}
        </View>
        <Text style={styles.factorSource} numberOfLines={1}>
          {factor.sourceLabel}
        </Text>
      </View>
      <Text
        style={[styles.factorValue, { color: factor.severity === 'unknown' ? TACTICAL.textMuted : TACTICAL.text }]}
        numberOfLines={1}
      >
        {factor.value}
      </Text>
    </View>
  );
}

function getFactorIcon(id: TrailDecisionFactor['id']): React.ComponentProps<typeof Ionicons>['name'] {
  switch (id) {
    case 'daylightMargin':
      return 'sunny-outline';
    case 'weatherImpact':
      return 'cloudy-night-outline';
    case 'vehicleFit':
      return 'car-sport-outline';
    case 'terrainConfidence':
      return 'trail-sign-outline';
    case 'recoveryMargin':
      return 'construct-outline';
    case 'remoteness':
      return 'radio-outline';
    case 'routeConfidence':
      return 'navigate-outline';
    case 'offlineRisk':
      return 'cloud-offline-outline';
    default:
      return 'ellipse-outline';
  }
}

function SetupNeededState({ data }: { data: TrailDecisionCommandData }) {
  const missing = data.missingInputs.length > 0 ? data.missingInputs.join(' · ') : 'Location · Route';
  return (
    <View style={styles.setupState}>
      <View style={styles.setupIcon}>
        <Ionicons name="trail-sign-outline" size={24} color={TACTICAL.amber} />
      </View>
      <Text style={styles.setupTitle} numberOfLines={1}>
        Trail decision limited
      </Text>
      <Text style={styles.setupText} numberOfLines={2}>
        Select an active route or waypoint and enable location to assess continuation risk.
      </Text>
      <Text style={styles.setupMissing} numberOfLines={1}>
        Missing: {missing}
      </Text>
    </View>
  );
}

function DecisionGauge({ data }: { data: TrailDecisionCommandData }) {
  const tone = getDecisionTone(data);
  const accent = getToneAccent(tone);
  const pct = Math.max(0, Math.min(100, data.confidencePercent));
  const fillHeight = Math.round((pct / 100) * 34);
  return (
    <View style={[styles.gaugeShell, { borderColor: `${accent}77` }]}>
      <View style={styles.gaugeTrack}>
        <View style={[styles.gaugeFill, { height: fillHeight, backgroundColor: accent }]} />
      </View>
      <View style={styles.gaugeCopy}>
        <Text style={[styles.gaugeValue, { color: accent }]} numberOfLines={1}>
          {pct}
        </Text>
        <Text style={styles.gaugeLabel} numberOfLines={1}>
          CONF
        </Text>
      </View>
    </View>
  );
}

export function TrailDecisionCommand({
  mode = 'trailDecision',
  availableModes,
  onModeChange,
  testID = 'trail-decision-command',
}: TrailDecisionCommandProps) {
  const data = useTrailDecisionData();
  const tone = getDecisionTone(data);
  const accent = getToneAccent(tone);
  const footerItems = [
    data.routeActive ? 'Route active' : data.routeLabel ? 'Route staged' : 'Route unavailable',
    data.distanceRemainingLabel,
    data.eta ? `ETA ${data.eta}` : 'ETA unavailable',
    formatUpdateAge(data.lastUpdatedAt),
  ];
  const riskLabel = data.dataState === 'live' ? 'Live ECS factors' : data.dataState === 'estimated' ? 'ECS-Inferred' : STATE_LABEL[data.dataState];
  const topFactors = useMemo(
    () =>
      [...data.factors].sort((a, b) => {
        const severityDelta = SEVERITY_SORT_RANK[b.severity] - SEVERITY_SORT_RANK[a.severity];
        return severityDelta || a.label.localeCompare(b.label);
      }),
    [data.factors],
  );

  return (
    <CommandCenterFrame
      title="TRAIL DECISION COMMAND"
      subtitle="Go / No-Go Terrain Assessment"
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
              <View style={styles.decisionColumn}>
                <View style={[styles.decisionPanel, { borderColor: `${accent}55` }]}>
                  <View style={[styles.decisionIcon, { borderColor: `${accent}77`, backgroundColor: `${accent}16` }]}>
                    <Ionicons name={DECISION_ICON[data.recommendedDecision]} size={20} color={accent} />
                  </View>
                  <Text style={[styles.decisionLabel, { color: accent }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.72}>
                    {data.decisionLabel}
                  </Text>
                  <Text style={styles.decisionReason} numberOfLines={3}>
                    {data.decisionReason}
                  </Text>
                  <View style={styles.contextRow}>
                    <View style={styles.contextChip}>
                      <Text style={styles.contextChipLabel} numberOfLines={1}>
                        {riskLabel}
                      </Text>
                    </View>
                    <View style={styles.contextChip}>
                      <Text style={styles.contextChipLabel} numberOfLines={1}>
                        {formatHeading(data.currentHeadingDegrees)}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.gaugeRow}>
                    <DecisionGauge data={data} />
                    <View style={styles.routeContext}>
                      <Text style={styles.routeContextLabel} numberOfLines={1}>
                        ROUTE CONTEXT
                      </Text>
                      <Text style={styles.routeContextValue} numberOfLines={1}>
                        {data.routeLabel ?? 'No active route'}
                      </Text>
                      <Text style={styles.routeContextDetail} numberOfLines={1}>
                        {data.distanceRemainingLabel} · {data.eta ? `ETA ${data.eta}` : 'ETA unavailable'}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              <View style={styles.factorColumn}>
                {topFactors.map((factor) => (
                  <FactorRow key={factor.id} factor={factor} />
                ))}
              </View>
            </View>

            <View
              style={[
                styles.actionStrip,
                {
                  borderColor: `${accent}55`,
                  backgroundColor:
                    tone === 'hazard'
                      ? 'rgba(192, 57, 43, 0.16)'
                      : tone === 'warning'
                        ? 'rgba(212, 160, 23, 0.16)'
                        : 'rgba(255,255,255,0.04)',
                },
              ]}
            >
              <View style={[styles.actionIcon, { borderColor: `${accent}66` }]}>
                <Ionicons name="analytics-outline" size={13} color={accent} />
              </View>
              <View style={styles.actionCopy}>
                <Text style={[styles.actionLabel, { color: accent }]} numberOfLines={1}>
                  {data.actionLabel}
                </Text>
                <Text style={styles.actionDetail} numberOfLines={1}>
                  {formatConfidence(data)} · Verify conditions before committing
                </Text>
              </View>
            </View>
          </>
        )}
      </View>
    </CommandCenterFrame>
  );
}

export default TrailDecisionCommand;

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
  decisionColumn: {
    width: '43%',
    minWidth: 118,
    minHeight: 0,
  },
  decisionPanel: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: 'rgba(7, 12, 17, 0.86)',
    padding: 8,
    gap: 6,
  },
  decisionIcon: {
    alignSelf: 'flex-start',
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  decisionLabel: {
    fontSize: 16,
    lineHeight: 18,
    fontWeight: '900',
    letterSpacing: 0.8,
    includeFontPadding: false,
  },
  decisionReason: {
    color: 'rgba(230, 237, 243, 0.78)',
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '800',
    includeFontPadding: false,
  },
  contextRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  contextChip: {
    minHeight: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(212, 160, 23, 0.16)',
    backgroundColor: 'rgba(255,255,255,0.035)',
    paddingHorizontal: 6,
    justifyContent: 'center',
  },
  contextChipLabel: {
    color: 'rgba(230, 237, 243, 0.75)',
    fontSize: 7,
    lineHeight: 9,
    fontWeight: '900',
    letterSpacing: 0.4,
    includeFontPadding: false,
    textTransform: 'uppercase',
  },
  gaugeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 48,
  },
  gaugeShell: {
    width: 48,
    height: 48,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.36)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gaugeTrack: {
    position: 'absolute',
    left: 5,
    width: 5,
    height: 34,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  gaugeFill: {
    width: '100%',
    borderRadius: 999,
  },
  gaugeCopy: {
    alignItems: 'center',
    gap: 1,
  },
  gaugeValue: {
    fontSize: 15,
    lineHeight: 16,
    fontWeight: '900',
    includeFontPadding: false,
  },
  gaugeLabel: {
    ...TYPO.U2,
    color: TACTICAL.textMuted,
    fontSize: 7,
    letterSpacing: 0.6,
  },
  routeContext: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  routeContextLabel: {
    color: TACTICAL.amber,
    fontSize: 7,
    lineHeight: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
    includeFontPadding: false,
  },
  routeContextValue: {
    color: TACTICAL.text,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '900',
    includeFontPadding: false,
  },
  routeContextDetail: {
    color: 'rgba(230, 237, 243, 0.68)',
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '800',
    includeFontPadding: false,
  },
  factorColumn: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 4,
  },
  factorRow: {
    minHeight: 29,
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
  factorIcon: {
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  factorCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  factorLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  factorLabel: {
    flexShrink: 1,
    color: TACTICAL.amber,
    fontSize: 7,
    lineHeight: 9,
    fontWeight: '900',
    letterSpacing: 0.7,
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
  factorSource: {
    color: 'rgba(230, 237, 243, 0.68)',
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '800',
    includeFontPadding: false,
  },
  factorValue: {
    maxWidth: '38%',
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '900',
    letterSpacing: 0.15,
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
