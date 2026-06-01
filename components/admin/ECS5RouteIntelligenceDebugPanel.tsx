import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { SafeIcon as Ionicons } from '../SafeIcon';
import {
  createECS5ProviderRegistry,
  providerHealthSnapshotForAdmin,
  type ProviderDefinition,
} from '../../lib/ecs5ProviderRegistry';
import type {
  AgencyIngestionStoreSnapshot,
  IngestionRun,
  NormalizedAgencyObservation,
} from '../../lib/ecs5AgencyIngestion';
import type {
  RouteIntelligenceEvidence,
  RouteIntelligenceIssue,
  RouteIntelligenceSummary,
} from '../../lib/ecs5RouteIntelligence';

type Colors = {
  bgCard: string;
  bgInput?: string;
  border: string;
  gold: string;
  goldBorder?: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  warning: string;
  success: string;
  danger?: string;
  error?: string;
};

type Props = {
  colors: Colors;
  providerHealth?: ProviderDefinition[];
  ingestionSnapshot?: Pick<AgencyIngestionStoreSnapshot, 'runs' | 'observations' | 'feeds'>;
  routeSummary?: RouteIntelligenceSummary | null;
  conflictsByObservationId?: Record<string, string[]>;
  onRefresh?: () => void;
};

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Never';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

function formatValue(value: unknown): string {
  if (value == null || value === '') return 'Unknown';
  if (typeof value === 'string') return value.replace(/_/g, ' ');
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function statusCopy(value: string | null | undefined): string {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized === 'open' || normalized === 'none') return 'No verified closure found';
  if (normalized.includes('passable')) return 'Likely passable';
  if (normalized.includes('closure') || normalized.includes('closed')) return 'Official closure detected';
  if (normalized.includes('airnow') || normalized.includes('aqi')) return 'Preliminary data';
  if (normalized.includes('firms') || normalized.includes('satellite')) return 'Satellite detection';
  if (normalized.includes('stale') || normalized.includes('offline') || normalized.includes('cached')) return 'Cached / Offline';
  return formatValue(value);
}

function statusColor(status: string | null | undefined, colors: Colors): string {
  const normalized = String(status ?? '').toLowerCase();
  if (normalized === 'configured' || normalized === 'success' || normalized === 'proceed') return colors.success;
  if (normalized === 'intentionally_disabled') return colors.textMuted;
  if (normalized.includes('missing') || normalized.includes('failed') || normalized.includes('closure') || normalized.includes('closed')) {
    return colors.danger ?? colors.error ?? colors.warning;
  }
  if (normalized.includes('stale') || normalized.includes('degraded') || normalized.includes('warning') || normalized.includes('verify')) {
    return colors.warning;
  }
  return colors.gold;
}

function Pill({
  label,
  tone,
  colors,
}: {
  label: string;
  tone?: string | null;
  colors: Colors;
}) {
  const color = statusColor(tone ?? label, colors);
  return (
    <View style={[styles.pill, { borderColor: `${color}66`, backgroundColor: `${color}14` }]}>
      <Text style={[styles.pillText, { color }]}>{label}</Text>
    </View>
  );
}

function Metric({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: Colors;
}) {
  return (
    <View style={[styles.metric, { backgroundColor: colors.bgInput ?? colors.bgCard, borderColor: colors.border }]}>
      <Text style={[styles.metricLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: colors.textPrimary }]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function Section({
  title,
  subtitle,
  children,
  colors,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  colors: Colors;
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{title}</Text>
      {subtitle ? <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

function ProviderHealthSection({
  providers,
  colors,
}: {
  providers: ProviderDefinition[];
  colors: Colors;
}) {
  return (
    <Section
      title="Provider Health"
      subtitle="Required environment variables are shown by name only. Secret values are never rendered."
      colors={colors}
    >
      {providers.map((provider) => {
        const intentionallyDisabled = provider.status === 'intentionally_disabled';
        return (
          <View key={provider.id} style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <View style={styles.rowBetween}>
              <View style={styles.titleBlock}>
                <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{provider.displayName}</Text>
                <Text style={[styles.meta, { color: colors.textMuted }]}>
                  {provider.category.replace(/_/g, ' ').toUpperCase()} / {provider.enabled ? 'ENABLED' : 'DISABLED'}
                </Text>
              </View>
              <Pill label={provider.status} tone={provider.status} colors={colors} />
            </View>
            <View style={styles.metrics}>
              <Metric label="Last checked" value={formatDate(provider.lastCheckedAt)} colors={colors} />
              <Metric label="Last success" value={formatDate(provider.lastSuccessfulFetchAt)} colors={colors} />
              <Metric label="Cache TTL" value={`${provider.cacheTtlSeconds}s`} colors={colors} />
            </View>
            <Text style={[styles.copy, { color: colors.textSecondary }]}>
              Required env vars: {provider.requiredEnvVars.length === 0
                ? 'None'
                : provider.requiredEnvVars.map((key) =>
                    `${key}: ${intentionallyDisabled ? 'not required while intentionally disabled' : provider.status === 'missing_config' ? 'missing or not confirmed' : 'present'}`,
                  ).join(', ')}
            </Text>
            {provider.lastError ? (
              <Text style={[styles.errorText, { color: colors.warning }]}>Last error: {provider.lastError}</Text>
            ) : null}
            {provider.knownLimitations.length > 0 ? (
              <Text style={[styles.copy, { color: colors.textMuted }]}>
                Known limitations: {provider.knownLimitations.join(', ')}
              </Text>
            ) : null}
          </View>
        );
      })}
    </Section>
  );
}

function IngestionRunsSection({
  runs,
  feedsById,
  colors,
}: {
  runs: IngestionRun[];
  feedsById: Map<string, string>;
  colors: Colors;
}) {
  return (
    <Section title="Ingestion Runs" subtitle="Failed and partial runs stay visible for operator review." colors={colors}>
      {runs.length === 0 ? (
        <EmptyCard colors={colors} text="No ingestion runs recorded in this debug snapshot." />
      ) : (
        runs.map((run) => {
          const duplicateCount = Math.max(0, run.recordsFetched - run.recordsNormalized);
          const staleCount = run.recordsRemovedOrExpired;
          const changedRecordCount = run.recordsUpdated;
          return (
            <View key={run.id} style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
              <View style={styles.rowBetween}>
                <View style={styles.titleBlock}>
                  <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{feedsById.get(run.feedId) ?? run.feedId}</Text>
                  <Text style={[styles.meta, { color: colors.textMuted }]}>Run {run.id}</Text>
                </View>
                <Pill label={run.status} tone={run.status} colors={colors} />
              </View>
              <View style={styles.metrics}>
                <Metric label="Started" value={formatDate(run.startedAt)} colors={colors} />
                <Metric label="Completed" value={formatDate(run.completedAt)} colors={colors} />
                <Metric label="Fetched" value={`${run.recordsFetched}`} colors={colors} />
                <Metric label="Normalized" value={`${run.recordsNormalized}`} colors={colors} />
                <Metric label="Created" value={`${run.recordsCreated}`} colors={colors} />
                <Metric label="Updated" value={`${run.recordsUpdated}`} colors={colors} />
                <Metric label="Expired" value={`${run.recordsRemovedOrExpired}`} colors={colors} />
                <Metric label="Duplicates" value={`${duplicateCount}`} colors={colors} />
                <Metric label="Stale count" value={`${staleCount}`} colors={colors} />
                <Metric label="Changed" value={`${changedRecordCount}`} colors={colors} />
              </View>
              <Text style={[styles.copy, { color: colors.textMuted }]}>
                Affected bbox: {run.affectedBbox ? JSON.stringify(run.affectedBbox) : 'Unknown'}
              </Text>
              {run.errorSummary ? (
                <Text style={[styles.errorText, { color: colors.warning }]}>Last error: {run.errorSummary}</Text>
              ) : null}
            </View>
          );
        })
      )}
    </Section>
  );
}

function ObservationInspectorSection({
  observations,
  conflictsByObservationId,
  colors,
}: {
  observations: NormalizedAgencyObservation[];
  conflictsByObservationId: Record<string, string[]>;
  colors: Colors;
}) {
  return (
    <Section
      title="Observation Inspector"
      subtitle="Inspect normalized observations, evidence, confidence, limitations, and conflicts."
      colors={colors}
    >
      {observations.length === 0 ? (
        <EmptyCard colors={colors} text="No normalized observations available in this snapshot." />
      ) : (
        observations.slice(0, 12).map((observation) => (
          <View key={observation.id} style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <View style={styles.rowBetween}>
              <View style={styles.titleBlock}>
                <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                  {formatValue(observation.normalizedPayload.title ?? observation.observationId)}
                </Text>
                <Text style={[styles.meta, { color: colors.textMuted }]}>
                  {observation.providerId} / {observation.recordType.replace(/_/g, ' ')}
                </Text>
              </View>
              <Pill label={`${Math.round(observation.confidenceScore)} confidence`} tone={observation.confidenceScore >= 80 ? 'configured' : 'warning'} colors={colors} />
            </View>
            <Text style={[styles.copy, { color: colors.textSecondary }]}>
              Normalized: {JSON.stringify(observation.normalizedPayload)}
            </Text>
            <Text style={[styles.copy, { color: colors.textMuted }]}>
              Raw payload ref/content hash: {observation.contentHash}
            </Text>
            <Text style={[styles.copy, { color: colors.textMuted }]}>
              Evidence URL: {observation.evidenceUrl ?? 'None'}
            </Text>
            <Text style={[styles.copy, { color: colors.textMuted }]}>
              Confidence breakdown: {JSON.stringify(observation.confidenceBreakdown)}
            </Text>
            <Text style={[styles.copy, { color: colors.textMuted }]}>
              Known limitations: {observation.knownLimitations.length ? observation.knownLimitations.join(', ') : 'None'}
            </Text>
            <Text style={[styles.copy, { color: colors.textMuted }]}>
              Conflicts: {(conflictsByObservationId[observation.id] ?? []).join(', ') || 'None'}
            </Text>
          </View>
        ))
      )}
    </Section>
  );
}

function RouteIntelligenceSection({
  summary,
  colors,
}: {
  summary: RouteIntelligenceSummary | null | undefined;
  colors: Colors;
}) {
  if (!summary) {
    return (
      <Section title="Route Intelligence Debug" subtitle="No route summary has been provided to this admin surface yet." colors={colors}>
        <EmptyCard colors={colors} text="Evaluate a route to inspect legal, closure, passability, weather, fire, smoke, bailout, evidence, and confidence output." />
      </Section>
    );
  }

  return (
    <Section title="Route Intelligence Debug" subtitle="Stable output object for API, UI, offline cache, and future agents." colors={colors}>
      <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <View style={styles.rowBetween}>
          <View style={styles.titleBlock}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Route {summary.routeId}</Text>
            <Text style={[styles.meta, { color: colors.textMuted }]}>
              Evaluated {formatDate(summary.evaluatedAt)} / Valid until {formatDate(summary.validUntil)}
            </Text>
          </View>
          <Pill label={summary.overallRecommendation} tone={summary.overallRecommendation} colors={colors} />
        </View>
        <View style={styles.metrics}>
          <Metric label="Risk" value={`${summary.overallRiskScore} / ${summary.overallRiskLabel}`} colors={colors} />
          <Metric label="Legal" value={summary.legalStatusSummary.status === 'legal_open' ? 'No verified closure found' : statusCopy(summary.legalStatusSummary.status)} colors={colors} />
          <Metric label="Closure" value={summary.closureSummary.activeClosures.length ? 'Official closure detected' : 'No verified closure found'} colors={colors} />
          <Metric label="Passability" value={summary.passabilitySummary.status === 'passable' ? 'Likely passable' : statusCopy(summary.passabilitySummary.status)} colors={colors} />
          <Metric label="Bailout" value={summary.bailoutSummary.recommendation} colors={colors} />
          <Metric label="Confidence" value={`${summary.sourceConfidenceSummary.label} (${Math.round(summary.sourceConfidenceSummary.score)})`} colors={colors} />
        </View>
        {summary.legalStatusSummary.verifyWithAgencyRequired ? (
          <Text style={[styles.warningCopy, { color: colors.warning }]}>Verify with managing agency.</Text>
        ) : null}
        {summary.offlineReadiness.isStale ? (
          <Text style={[styles.warningCopy, { color: colors.warning }]}>Cached / Offline: {summary.offlineReadiness.staleWarning}</Text>
        ) : null}
        <SubSummary title="Weather" value={`${summary.weatherSummary.alerts.length} alerts / ${summary.weatherSummary.segmentRisks.length} segment risks`} colors={colors} />
        <SubSummary title="Fire" value={`${summary.fireSummary.perimeterIntersection ? 'Perimeter intersection' : 'No high-confidence perimeter intersection'} / ${summary.fireSummary.fireWeatherContext}`} colors={colors} />
        <SubSummary title="Smoke/AQI" value={`${summary.smokeAqiSummary.worstCategory ?? 'Unknown'} ${summary.smokeAqiSummary.worstAqi ?? ''}`.trim()} colors={colors} />
        {summary.smokeAqiSummary.limitationNote ? <Text style={[styles.copy, { color: colors.textMuted }]}>Preliminary data: {summary.smokeAqiSummary.limitationNote}</Text> : null}
        {summary.fireSummary.evidence.some((item) => String(item.providerId).includes('nasa_firms')) ? (
          <Text style={[styles.copy, { color: colors.textMuted }]}>Satellite detection: FIRMS active fire detections are evidence, not closure orders.</Text>
        ) : null}
        <IssueList title="Blocking issues" issues={summary.blockingIssues} colors={colors} />
        <IssueList title="Warnings" issues={summary.warnings} colors={colors} />
        <IssueList title="Unknowns" issues={summary.unknowns} colors={colors} />
        <Text style={[styles.copy, { color: colors.textMuted }]}>
          Confidence reasons: {summary.sourceConfidenceSummary.topReasons.join(', ') || 'None'}
        </Text>
        <Text style={[styles.copy, { color: colors.textMuted }]}>
          Evidence: {summary.evidence.map((item) => `${item.id} (${item.label})`).join(', ') || 'None'}
        </Text>
      </View>
    </Section>
  );
}

function SubSummary({ title, value, colors }: { title: string; value: string; colors: Colors }) {
  return (
    <View style={styles.subSummary}>
      <Text style={[styles.subSummaryTitle, { color: colors.textMuted }]}>{title}</Text>
      <Text style={[styles.subSummaryValue, { color: colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

function IssueList({ title, issues, colors }: { title: string; issues: RouteIntelligenceIssue[]; colors: Colors }) {
  return (
    <View style={styles.issueList}>
      <Text style={[styles.subSummaryTitle, { color: colors.textMuted }]}>{title}</Text>
      {issues.length === 0 ? (
        <Text style={[styles.copy, { color: colors.textMuted }]}>No {title.toLowerCase()} in this summary.</Text>
      ) : (
        issues.map((issue) => (
          <View key={issue.id} style={styles.issueRow}>
            <Pill label={issue.severity} tone={issue.severity} colors={colors} />
            <View style={styles.issueText}>
              <Text style={[styles.issueTitle, { color: colors.textPrimary }]}>{issue.title}</Text>
              <Text style={[styles.copy, { color: colors.textMuted }]}>{issue.message}</Text>
              <Text style={[styles.copy, { color: colors.textMuted }]}>Evidence: {issue.evidenceIds.join(', ') || 'None'}</Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

function EmptyCard({ text, colors }: { text: string; colors: Colors }) {
  return (
    <View style={[styles.emptyCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
      <Text style={[styles.copy, { color: colors.textMuted }]}>{text}</Text>
    </View>
  );
}

export default function ECS5RouteIntelligenceDebugPanel({
  colors,
  providerHealth,
  ingestionSnapshot,
  routeSummary,
  conflictsByObservationId = {},
  onRefresh,
}: Props) {
  const providers = providerHealth ?? providerHealthSnapshotForAdmin(createECS5ProviderRegistry());
  const runs = ingestionSnapshot?.runs ?? [];
  const observations = ingestionSnapshot?.observations ?? [];
  const feedsById = new Map((ingestionSnapshot?.feeds ?? []).map((feed) => [feed.id, `${feed.name} / ${feed.providerId}`]));

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.content}>
      <View style={[styles.hero, { backgroundColor: colors.bgCard, borderColor: colors.goldBorder ?? colors.border }]}>
        <View style={styles.heroIcon}>
          <Ionicons name="analytics-outline" size={22} color={colors.gold} />
        </View>
        <View style={styles.heroText}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>ECS 5.0 Intelligence Debug</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Provider readiness, agency ingestion, observation confidence, and route intelligence in one operator view.
          </Text>
        </View>
        {onRefresh ? (
          <TouchableOpacity style={[styles.refreshButton, { borderColor: colors.goldBorder ?? colors.border }]} onPress={onRefresh}>
            <Ionicons name="refresh-outline" size={16} color={colors.gold} />
          </TouchableOpacity>
        ) : null}
      </View>

      <ProviderHealthSection providers={providers} colors={colors} />
      <IngestionRunsSection runs={runs} feedsById={feedsById} colors={colors} />
      <ObservationInspectorSection observations={observations} conflictsByObservationId={conflictsByObservationId} colors={colors} />
      <RouteIntelligenceSection summary={routeSummary} colors={colors} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
  },
  content: {
    gap: 14,
    paddingBottom: 28,
  },
  hero: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
  },
  refreshButton: {
    width: 34,
    height: 34,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0,
  },
  sectionSubtitle: {
    fontSize: 12,
    lineHeight: 17,
  },
  card: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    gap: 10,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  titleBlock: {
    flex: 1,
    gap: 3,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  meta: {
    fontSize: 10,
    fontWeight: '700',
  },
  pill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pillText: {
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metric: {
    minWidth: 92,
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    gap: 3,
  },
  metricLabel: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  metricValue: {
    fontSize: 12,
    fontWeight: '800',
  },
  copy: {
    fontSize: 11,
    lineHeight: 16,
  },
  warningCopy: {
    fontSize: 12,
    fontWeight: '800',
  },
  errorText: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '800',
  },
  emptyCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
  },
  subSummary: {
    gap: 2,
  },
  subSummaryTitle: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  subSummaryValue: {
    fontSize: 12,
    fontWeight: '800',
  },
  issueList: {
    gap: 8,
  },
  issueRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  issueText: {
    flex: 1,
    gap: 2,
  },
  issueTitle: {
    fontSize: 12,
    fontWeight: '800',
  },
});
