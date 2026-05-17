import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { SafeIcon as Ionicons } from '../../SafeIcon';
import { GOLD_RAIL, TACTICAL, TYPO } from '../../../lib/theme';
import type {
  CampScoutCommandCandidate,
  CampScoutCommandData,
  CampScoutDataState,
  CampScoutMetricSeverity,
  CampScoutSelectedMetric,
} from '../../../lib/navigation/campScoutCommandData';
import { campScoutCommandFormatters } from '../../../lib/navigation/campScoutCommandData';
import { CommandCenterFrame } from './CommandCenterFrame';
import type { CommandCenterMode } from './commandCenterTypes';
import { useCampScoutData } from './useCampScoutData';

type CampScoutCommandProps = {
  mode?: CommandCenterMode;
  availableModes?: CommandCenterMode[];
  onModeChange?: (mode: CommandCenterMode) => void;
  testID?: string;
};

const STATE_LABEL: Record<CampScoutDataState, string> = {
  live: 'LIVE',
  estimated: 'ESTIMATED',
  partial: 'PARTIAL',
  offline: 'OFFLINE',
  setupNeeded: 'SETUP NEEDED',
};

const SEVERITY_ACCENT: Record<CampScoutMetricSeverity, string> = {
  good: '#49D17A',
  watch: '#5AC8FA',
  caution: TACTICAL.amber,
  critical: TACTICAL.danger,
  unknown: TACTICAL.textMuted,
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
  return `Updated ${Math.round(minutes / 60)}h ago`;
}

function getScoreAccent(candidate: CampScoutCommandCandidate | null): string {
  if (!candidate) return TACTICAL.textMuted;
  if (candidate.legalAccessConfidence === 'restricted' || candidate.scorePercent < 45) return TACTICAL.danger;
  if (candidate.scorePercent < 68) return TACTICAL.amber;
  if (candidate.scorePercent < 82) return '#5AC8FA';
  return '#49D17A';
}

function getSourceIcon(candidate: CampScoutCommandCandidate): React.ComponentProps<typeof Ionicons>['name'] {
  switch (candidate.source) {
    case 'establishedCampground':
      return 'business-outline';
    case 'dispersedCandidate':
      return 'trail-sign-outline';
    case 'savedPin':
    case 'userSelected':
      return 'bonfire-outline';
    case 'routeCandidate':
      return 'navigate-outline';
    case 'unknown':
    default:
      return 'location-outline';
  }
}

function CandidateField({
  candidates,
  selectedCandidateId,
}: {
  candidates: CampScoutCommandCandidate[];
  selectedCandidateId: string | null;
}) {
  const candidatePositions = useMemo(
    () =>
      candidates.slice(0, 4).map((candidate, index) => {
        const selected = candidate.id === selectedCandidateId;
        return {
          candidate,
          selected,
          left: `${20 + ((index * 23) % 62)}%` as `${number}%`,
          top: `${22 + ((index * 31) % 52)}%` as `${number}%`,
        };
      }),
    [candidates, selectedCandidateId],
  );

  return (
    <View style={styles.fieldPanel}>
      <View style={styles.fieldRouteLine} />
      <View style={styles.fieldVehicle}>
        <Ionicons name="navigate" size={12} color="#5AC8FA" />
      </View>
      {candidatePositions.map(({ candidate, selected, left, top }) => (
        <View
          key={candidate.id}
          style={[
            styles.fieldMarker,
            {
              left,
              top,
              borderColor: selected ? TACTICAL.amber : `${getScoreAccent(candidate)}88`,
              backgroundColor: selected ? 'rgba(212, 160, 23, 0.28)' : 'rgba(7, 12, 17, 0.9)',
            },
          ]}
        >
          <Text style={[styles.fieldMarkerText, { color: selected ? TACTICAL.amber : getScoreAccent(candidate) }]}>
            {candidate.label}
          </Text>
        </View>
      ))}
      <View style={styles.fieldLegend}>
        <Text style={styles.fieldLegendText} numberOfLines={1}>
          Candidate field · route relation estimated
        </Text>
      </View>
    </View>
  );
}

function CandidateRow({
  candidate,
  selected,
  onPress,
}: {
  candidate: CampScoutCommandCandidate;
  selected: boolean;
  onPress: () => void;
}) {
  const accent = getScoreAccent(candidate);
  return (
    <TouchableOpacity
      activeOpacity={0.84}
      onPress={onPress}
      style={[styles.candidateRow, selected && styles.candidateRowSelected, { borderColor: selected ? `${accent}88` : 'rgba(212,160,23,0.14)' }]}
      accessibilityRole="button"
      accessibilityLabel={`Select camp candidate ${candidate.label}`}
    >
      <View style={[styles.candidateBadge, { borderColor: `${accent}66`, backgroundColor: `${accent}15` }]}>
        <Text style={[styles.candidateBadgeText, { color: accent }]}>{candidate.label}</Text>
      </View>
      <View style={styles.candidateCopy}>
        <View style={styles.candidateTitleRow}>
          <Ionicons name={getSourceIcon(candidate)} size={10} color={accent} />
          <Text style={styles.candidateTitle} numberOfLines={1}>
            {candidate.name}
          </Text>
        </View>
        <Text style={styles.candidateMeta} numberOfLines={1}>
          {candidate.distanceFromCurrentLocation == null
            ? 'Distance unknown'
            : `${campScoutCommandFormatters.formatMiles(candidate.distanceFromCurrentLocation)} away`}
          {' · '}
          {candidate.distanceFromRoute == null
            ? 'route unknown'
            : `${campScoutCommandFormatters.formatMiles(candidate.distanceFromRoute)} from route`}
        </Text>
      </View>
      <View style={styles.candidateScore}>
        <Text style={[styles.candidateScoreValue, { color: accent }]} numberOfLines={1}>
          {candidate.scorePercent}
        </Text>
        <Text style={styles.candidateScoreLabel} numberOfLines={1}>
          {candidate.scoreLabel}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function MetricRow({ metric }: { metric: CampScoutSelectedMetric }) {
  const accent = SEVERITY_ACCENT[metric.severity];
  return (
    <View style={styles.metricRow}>
      <View style={[styles.metricDot, { backgroundColor: accent }]} />
      <View style={styles.metricCopy}>
        <Text style={styles.metricLabel} numberOfLines={1}>
          {metric.label}
        </Text>
        <Text style={styles.metricSource} numberOfLines={1}>
          {metric.sourceLabel}
        </Text>
      </View>
      <Text style={[styles.metricValue, { color: metric.severity === 'unknown' ? TACTICAL.textMuted : TACTICAL.text }]} numberOfLines={1}>
        {metric.value}
      </Text>
    </View>
  );
}

function SetupState({ data }: { data: CampScoutCommandData }) {
  const missing = data.missingInputs.length ? data.missingInputs.join(' · ') : 'Camp candidates';
  return (
    <View style={styles.setupState}>
      <View style={styles.setupIcon}>
        <Ionicons name="bonfire-outline" size={24} color={TACTICAL.amber} />
      </View>
      <Text style={styles.setupTitle} numberOfLines={1}>
        Camp scout limited
      </Text>
      <Text style={styles.setupText} numberOfLines={2}>
        Add campsite candidates from the map or save a camp pin to begin ranking.
      </Text>
      <Text style={styles.setupMissing} numberOfLines={1}>
        Missing: {missing}
      </Text>
    </View>
  );
}

export function CampScoutCommand({
  mode = 'campScout',
  availableModes,
  onModeChange,
  testID = 'camp-scout-command',
}: CampScoutCommandProps) {
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const data = useCampScoutData({ selectedCandidateId });
  const selectedCandidate =
    data.candidates.find((candidate) => candidate.id === data.selectedCandidateId) ??
    data.candidates[0] ??
    null;
  const accent = getScoreAccent(selectedCandidate);
  const footerItems = [
    data.routeActive ? 'Route active' : 'Route optional',
    `${data.candidates.length} candidate${data.candidates.length === 1 ? '' : 's'}`,
    data.isUsingCachedData ? 'Cached/estimated' : data.dataState === 'live' ? 'Live sources' : STATE_LABEL[data.dataState],
    formatUpdateAge(data.lastUpdatedAt),
  ];

  return (
    <CommandCenterFrame
      title="CAMP SCOUT COMMAND"
      subtitle="Campsite Viability Intelligence"
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
          <SetupState data={data} />
        ) : (
          <>
            <View style={styles.mainContent}>
              <View style={styles.leftColumn}>
                <CandidateField candidates={data.candidates} selectedCandidateId={data.selectedCandidateId} />
                <View style={[styles.bestPanel, { borderColor: `${accent}55` }]}>
                  <Text style={styles.bestEyebrow} numberOfLines={1}>
                    SELECTED CANDIDATE
                  </Text>
                  <Text style={[styles.bestTitle, { color: accent }]} numberOfLines={1}>
                    {selectedCandidate ? `${selectedCandidate.label} · ${selectedCandidate.name}` : 'No candidate'}
                  </Text>
                  <Text style={styles.bestDetail} numberOfLines={2}>
                    {selectedCandidate
                      ? `${selectedCandidate.scoreLabel} · ${selectedCandidate.confidenceLabel} · Verify access before camping.`
                      : 'No nearby camp candidates found.'}
                  </Text>
                </View>
              </View>

              <View style={styles.rightColumn}>
                <View style={styles.candidateList}>
                  {data.candidates.length ? (
                    data.candidates.map((candidate) => (
                      <CandidateRow
                        key={candidate.id}
                        candidate={candidate}
                        selected={candidate.id === data.selectedCandidateId}
                        onPress={() => setSelectedCandidateId(candidate.id)}
                      />
                    ))
                  ) : (
                    <View style={styles.emptyList}>
                      <Text style={styles.emptyTitle}>No candidates found</Text>
                      <Text style={styles.emptyText}>Save a camp pin or enable campsite layers from Navigate.</Text>
                    </View>
                  )}
                </View>
                <View style={styles.metricGrid}>
                  {data.selectedCandidateMetrics.slice(0, 7).map((metric) => (
                    <MetricRow key={metric.id} metric={metric} />
                  ))}
                </View>
              </View>
            </View>

            <View style={[styles.actionStrip, { borderColor: `${accent}55`, backgroundColor: `${accent}12` }]}>
              <View style={[styles.actionIcon, { borderColor: `${accent}66` }]}>
                <Ionicons name="trail-sign-outline" size={13} color={accent} />
              </View>
              <View style={styles.actionCopy}>
                <Text style={[styles.actionLabel, { color: accent }]} numberOfLines={1}>
                  {data.recommendationLabel}
                </Text>
                <Text style={styles.actionDetail} numberOfLines={1}>
                  {data.confidenceLabel} · {data.recommendationReason}
                </Text>
              </View>
            </View>
          </>
        )}
      </View>
    </CommandCenterFrame>
  );
}

export default CampScoutCommand;

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
    gap: 8,
  },
  leftColumn: {
    width: '42%',
    minWidth: 118,
    minHeight: 0,
    gap: 7,
  },
  rightColumn: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    gap: 6,
  },
  fieldPanel: {
    flex: 1,
    minHeight: 84,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.22)',
    backgroundColor: 'rgba(7, 12, 17, 0.88)',
    overflow: 'hidden',
  },
  fieldRouteLine: {
    position: 'absolute',
    left: '14%',
    right: '12%',
    top: '50%',
    height: 2,
    backgroundColor: 'rgba(90, 200, 250, 0.32)',
    transform: [{ rotate: '-13deg' }],
  },
  fieldVehicle: {
    position: 'absolute',
    left: 10,
    top: 10,
    width: 26,
    height: 26,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(90, 200, 250, 0.55)',
    backgroundColor: 'rgba(90, 200, 250, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldMarker: {
    position: 'absolute',
    width: 26,
    height: 26,
    marginLeft: -13,
    marginTop: -13,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldMarkerText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '900',
    includeFontPadding: false,
  },
  fieldLegend: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 7,
  },
  fieldLegendText: {
    color: 'rgba(230,237,243,0.58)',
    fontSize: 7,
    lineHeight: 9,
    fontWeight: '800',
    includeFontPadding: false,
  },
  bestPanel: {
    minHeight: 54,
    borderRadius: 11,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.035)',
    padding: 7,
    gap: 3,
  },
  bestEyebrow: {
    ...TYPO.U2,
    color: TACTICAL.amber,
    fontSize: 7,
    letterSpacing: 0.65,
  },
  bestTitle: {
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '900',
    includeFontPadding: false,
  },
  bestDetail: {
    color: 'rgba(230,237,243,0.72)',
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '800',
    includeFontPadding: false,
  },
  candidateList: {
    gap: 4,
  },
  candidateRow: {
    minHeight: 31,
    borderRadius: 9,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.035)',
    paddingHorizontal: 6,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  candidateRowSelected: {
    backgroundColor: 'rgba(212,160,23,0.09)',
  },
  candidateBadge: {
    width: 23,
    height: 23,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  candidateBadgeText: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '900',
    includeFontPadding: false,
  },
  candidateCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  candidateTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  candidateTitle: {
    flex: 1,
    color: TACTICAL.text,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900',
    includeFontPadding: false,
  },
  candidateMeta: {
    color: 'rgba(230,237,243,0.62)',
    fontSize: 7,
    lineHeight: 9,
    fontWeight: '800',
    includeFontPadding: false,
  },
  candidateScore: {
    width: 43,
    alignItems: 'flex-end',
    gap: 1,
  },
  candidateScoreValue: {
    fontSize: 12,
    lineHeight: 13,
    fontWeight: '900',
    includeFontPadding: false,
  },
  candidateScoreLabel: {
    color: TACTICAL.textMuted,
    fontSize: 6,
    lineHeight: 8,
    fontWeight: '900',
    includeFontPadding: false,
    textAlign: 'right',
  },
  metricGrid: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'center',
    gap: 4,
  },
  metricRow: {
    minHeight: 24,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.12)',
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metricDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
  },
  metricCopy: {
    flex: 1,
    minWidth: 0,
  },
  metricLabel: {
    color: TACTICAL.amber,
    fontSize: 7,
    lineHeight: 9,
    fontWeight: '900',
    includeFontPadding: false,
    textTransform: 'uppercase',
  },
  metricSource: {
    color: 'rgba(230,237,243,0.55)',
    fontSize: 6,
    lineHeight: 8,
    fontWeight: '800',
    includeFontPadding: false,
  },
  metricValue: {
    maxWidth: '42%',
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900',
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
    color: 'rgba(230,237,243,0.72)',
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
    color: 'rgba(230,237,243,0.74)',
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '800',
    letterSpacing: 0.25,
    includeFontPadding: false,
  },
  emptyList: {
    minHeight: 70,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.13)',
    backgroundColor: 'rgba(255,255,255,0.035)',
    justifyContent: 'center',
    padding: 10,
    gap: 4,
  },
  emptyTitle: {
    color: TACTICAL.amber,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '900',
    includeFontPadding: false,
  },
  emptyText: {
    color: 'rgba(230,237,243,0.68)',
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '800',
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
