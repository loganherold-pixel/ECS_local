import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import type { EcsIssueAdminSummary, EcsIssueGroupSummary } from '../../lib/ecsIssueIntelligence';
import { fetchIssueAdminSummary } from '../../lib/ecsIssueIntelligence';
import { useRuntimeSmokeState } from '../../lib/ai/runtimeSmokeSelectors';

function TrendPill({
  trend,
}: {
  trend: EcsIssueGroupSummary['trendDirection'];
}) {
  const color =
    trend === 'up' || trend === 'new'
      ? '#D95C48'
      : trend === 'down' || trend === 'quieted'
        ? '#4CA866'
        : '#9B8A64';
  const icon =
    trend === 'up' || trend === 'new'
      ? 'trending-up-outline'
      : trend === 'down' || trend === 'quieted'
        ? 'trending-down-outline'
        : 'remove-outline';

  return (
    <View style={[styles.trendPill, { borderColor: `${color}55`, backgroundColor: `${color}12` }]}>
      <Ionicons name={icon} size={10} color={color} />
      <Text style={[styles.trendPillText, { color }]}>{trend.toUpperCase()}</Text>
    </View>
  );
}

function IssueSummaryCard({
  issue,
  colors,
}: {
  issue: EcsIssueGroupSummary;
  colors: any;
}) {
  const severityColor =
    issue.severity === 'critical'
      ? colors.danger
      : issue.severity === 'high'
        ? colors.warning
        : issue.severity === 'medium'
          ? colors.gold
          : colors.textMuted;

  return (
    <View style={[styles.issueCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
      <View style={styles.issueHeader}>
        <View style={styles.issueTitleWrap}>
          <Text style={[styles.issueTitle, { color: colors.textPrimary }]}>{issue.title}</Text>
          <Text style={[styles.issueMetaLine, { color: colors.textMuted }]}>
            {issue.ecsArea.toUpperCase()} / {issue.issueType.replace(/_/g, ' ').toUpperCase()}
          </Text>
        </View>
        <View style={[styles.severityBadge, { borderColor: `${severityColor}55`, backgroundColor: `${severityColor}12` }]}>
          <Text style={[styles.severityBadgeText, { color: severityColor }]}>{issue.severity.toUpperCase()}</Text>
        </View>
      </View>

      <View style={styles.issueStatsRow}>
        <Text style={[styles.issueStat, { color: colors.textSecondary }]}>{issue.eventCount} events</Text>
        <Text style={[styles.issueStat, { color: colors.textSecondary }]}>{issue.confidenceLabel.toUpperCase()} confidence</Text>
        <Text style={[styles.issueStat, { color: colors.textSecondary }]}>{issue.usersImpactedCount} users</Text>
        <Text style={[styles.issueStat, { color: colors.textSecondary }]}>{issue.sessionsImpactedCount} sessions</Text>
        <TrendPill trend={issue.trendDirection} />
      </View>

      <Text style={[styles.issueVersionLine, { color: colors.textMuted }]}>
        Versions: {issue.appVersionsAffected.join(', ') || 'Unknown'}
      </Text>
      <Text style={[styles.issueContextLine, { color: colors.textMuted }]}>
        Context: {issue.topContextTags.activeTab || 'Unknown tab'} / {issue.topContextTags.routeState || 'No route'} / {issue.topContextTags.gpsState || 'GPS unknown'}
      </Text>
      <Text style={[styles.issueContextLine, { color: colors.textMuted }]}>
        Family: {issue.issueFamily.replace(/_/g, ' ')} / {issue.issueClass.replace(/_/g, ' ')}
      </Text>
      {issue.affectedSurfaces.length > 0 ? (
        <Text style={[styles.issueContextLine, { color: colors.textMuted }]}>
          Surfaces: {issue.affectedSurfaces.join(', ')}
        </Text>
      ) : null}
      {issue.providerFamilies.length > 0 ? (
        <Text style={[styles.issueContextLine, { color: colors.textMuted }]}>
          Providers: {issue.providerFamilies.join(', ')}
        </Text>
      ) : null}
      <Text style={[styles.issueContextLine, { color: colors.textMuted }]}>
        Offline / degraded correlation: {Math.round(issue.degradedOrOfflineRate * 100)}% ({issue.offlineCorrelation})
      </Text>
      <Text style={[styles.issueTimeLine, { color: colors.textMuted }]}>
        First seen {new Date(issue.firstSeen).toLocaleString()} / Last seen {new Date(issue.lastSeen).toLocaleString()}
      </Text>
      {issue.releaseRegression ? (
        <Text style={[styles.issueRegression, { color: colors.warning }]}>Latest-release regression signal</Text>
      ) : null}
    </View>
  );
}

function SummarySection({
  title,
  items,
  colors,
}: {
  title: string;
  items: EcsIssueGroupSummary[];
  colors: any;
}) {
  return (
    <View style={styles.sectionBlock}>
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{title}</Text>
      {items.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>No grouped issues in this view right now.</Text>
        </View>
      ) : (
        items.map((issue) => (
          <IssueSummaryCard key={`${title}-${issue.signature}`} issue={issue} colors={colors} />
        ))
      )}
    </View>
  );
}

function SmokeStatusPill({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: any;
}) {
  return (
    <View style={[styles.smokePill, { borderColor: colors.border, backgroundColor: colors.bgInput }]}>
      <Text style={[styles.smokePillLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.smokePillValue, { color: colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

function RuntimeSmokeCard({
  colors,
}: {
  colors: any;
}) {
  const smoke = useRuntimeSmokeState();

  return (
    <View style={[styles.heroCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
      <View style={styles.heroTitleWrap}>
        <Text style={[styles.heroEyebrow, { color: colors.warning }]}>RUNTIME SMOKE</Text>
        <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>Current Command + Restore Snapshot</Text>
        <Text style={[styles.heroSubtitle, { color: colors.textMuted }]}>
          Internal-only view of the live shell, access, restore, and command-state picture used for final in-app smoke validation.
        </Text>
      </View>

      {!smoke.enabled ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.bgInput, borderColor: colors.border }]}>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            Smoke instrumentation is idle until an admin or internal tester session is active.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.smokePillRow}>
            <SmokeStatusPill label="Path" value={smoke.shell?.currentPath || '--'} colors={colors} />
            <SmokeStatusPill label="Entry" value={smoke.shell?.entryKind || '--'} colors={colors} />
            <SmokeStatusPill label="Phase" value={smoke.command?.activePhase || 'none'} colors={colors} />
          </View>
          <View style={styles.smokePillRow}>
            <SmokeStatusPill label="Access" value={smoke.shell?.accessState?.badgeLabel || '--'} colors={colors} />
            <SmokeStatusPill label="Shell Restore" value={smoke.shell?.shellRestoreEligible ? 'Eligible' : 'Blocked'} colors={colors} />
            <SmokeStatusPill label="Route Restore" value={smoke.shell?.routeRestoreEligible ? 'Eligible' : 'Blocked'} colors={colors} />
          </View>
          <View style={styles.smokePillRow}>
            <SmokeStatusPill label="Redirect" value={smoke.shell?.redirectTarget || 'None'} colors={colors} />
            <SmokeStatusPill label="Overall" value={smoke.command?.liveStatus.overall?.label || '--'} colors={colors} />
            <SmokeStatusPill label="Readiness" value={smoke.command?.liveStatus.readiness?.label || '--'} colors={colors} />
          </View>
          <Text style={[styles.issueContextLine, { color: colors.textMuted }]}>
            Access posture: {smoke.shell?.accessState?.statusLabel || '--'} / {smoke.shell?.accessState?.sourceLabel || '--'} / {smoke.shell?.accessState?.verificationMode || '--'}
          </Text>

          <View style={styles.smokeSection}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Lead Command State</Text>
            <Text style={[styles.issueTitle, { color: colors.textPrimary }]}>
              {smoke.command?.primaryTitle || 'No active primary command'}
            </Text>
            <Text style={[styles.issueContextLine, { color: colors.textMuted }]}>
              {smoke.command?.primarySummary || 'No command summary is active right now.'}
            </Text>
            <Text style={[styles.issueContextLine, { color: colors.textMuted }]}>
              Dashboard: {smoke.command?.leadByTarget.dashboard || '--'} / Navigate: {smoke.command?.leadByTarget.navigate || '--'} / Alert: {smoke.command?.leadByTarget.alert || '--'}
            </Text>
            <Text style={[styles.issueContextLine, { color: colors.textMuted }]}>
              Supporting: {smoke.command?.secondaryTitles.length ? smoke.command.secondaryTitles.slice(0, 3).join(', ') : 'None'} / Suppressed: {smoke.command?.suppressedTitles.length ? smoke.command.suppressedTitles.slice(0, 3).join(', ') : 'None'}
            </Text>
          </View>

          <View style={styles.smokeSection}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Scenario Markers</Text>
            <Text style={[styles.issueContextLine, { color: colors.textMuted }]}>
              {smoke.markers.length > 0 ? smoke.markers.join(', ') : 'No runtime markers captured yet.'}
            </Text>
          </View>

          <View style={styles.smokeSection}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Contradiction Flags</Text>
            {smoke.contradictions.length === 0 ? (
              <Text style={[styles.issueContextLine, { color: colors.textMuted }]}>
                No active runtime contradiction flags.
              </Text>
            ) : (
              smoke.contradictions.map((contradiction) => (
                <View key={`${contradiction.code}-${contradiction.rootKey || 'global'}`} style={styles.contradictionRow}>
                  <Text style={[styles.issueMetaLine, { color: colors.warning }]}>
                    {contradiction.severity.toUpperCase()} / {contradiction.code.replace(/_/g, ' ')}
                  </Text>
                  <Text style={[styles.issueContextLine, { color: colors.textSecondary }]}>
                    {contradiction.message}
                    {contradiction.detail ? ` (${contradiction.detail})` : ''}
                  </Text>
                </View>
              ))
            )}
          </View>
        </>
      )}
    </View>
  );
}

export default function EcsIssueIntelligencePanel({
  colors,
  onToast,
}: {
  colors: any;
  onToast: (message: string) => void;
}) {
  const [summary, setSummary] = useState<EcsIssueAdminSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = useCallback(
    async (showRefreshToast = false) => {
      try {
        setError(null);
        if (summary) setRefreshing(true);
        else setLoading(true);
        const next = await fetchIssueAdminSummary();
        if (!next) {
          setError('Issue intelligence is unavailable right now.');
          return;
        }
        setSummary(next);
        if (showRefreshToast) {
          onToast('Issue intelligence refreshed');
        }
      } catch (fetchError: any) {
        setError(fetchError?.message || 'Issue intelligence is unavailable right now.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [onToast, summary],
  );

  useEffect(() => {
    void loadSummary(false);
  }, [loadSummary]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.heroCard, { backgroundColor: colors.bgCard, borderColor: colors.goldBorder }]}>
        <View style={styles.heroHeader}>
          <View style={styles.heroTitleWrap}>
            <Text style={[styles.heroEyebrow, { color: colors.gold }]}>ADMIN ONLY</Text>
            <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>ECS Stability Intelligence</Text>
            <Text style={[styles.heroSubtitle, { color: colors.textMuted }]}>
              Grouped runtime failures, degraded field behavior, and release regressions across live ECS sessions.
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.refreshBtn, { borderColor: colors.border, backgroundColor: colors.bgInput }]}
            onPress={() => void loadSummary(true)}
            activeOpacity={0.8}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color={colors.gold} />
            ) : (
              <Ionicons name="refresh-outline" size={16} color={colors.gold} />
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.heroStats}>
          <View style={styles.heroStat}>
            <Text style={[styles.heroStatValue, { color: colors.textPrimary }]}>{summary?.groups.length ?? '--'}</Text>
            <Text style={[styles.heroStatLabel, { color: colors.textMuted }]}>Grouped Issues</Text>
          </View>
          <View style={styles.heroStat}>
            <Text style={[styles.heroStatValue, { color: colors.textPrimary }]}>{summary?.latestVersion ?? '--'}</Text>
            <Text style={[styles.heroStatLabel, { color: colors.textMuted }]}>Latest Version</Text>
          </View>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={colors.gold} />
          <Text style={[styles.loadingText, { color: colors.textMuted }]}>Loading grouped issue intelligence...</Text>
        </View>
      ) : null}

      <RuntimeSmokeCard colors={colors} />

      {error ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>{error}</Text>
        </View>
      ) : null}

      {!loading && summary ? (
        <>
          <SummarySection title="Most Severe Active" items={summary.severeActive} colors={colors} />
          <SummarySection title="Frequent Issues" items={summary.frequentIssues} colors={colors} />
          <SummarySection title="New Since Latest Release" items={summary.newSinceLatestRelease} colors={colors} />
          <SummarySection title="Regressions" items={summary.regressions} colors={colors} />
          <SummarySection title="Trending Up" items={summary.trendingUp} colors={colors} />
          <SummarySection title="Trending Down" items={summary.trendingDown} colors={colors} />
          <SummarySection title="Resolved / Quieted" items={summary.resolvedOrQuieted} colors={colors} />
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 36, gap: 16 },
  heroCard: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 14 },
  heroHeader: { flexDirection: 'row', gap: 12 },
  heroTitleWrap: { flex: 1, gap: 4 },
  heroEyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.6 },
  heroTitle: { fontSize: 18, fontWeight: '800' },
  heroSubtitle: { fontSize: 12, lineHeight: 18 },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroStats: { flexDirection: 'row', gap: 12 },
  heroStat: { flex: 1, gap: 4 },
  heroStatValue: { fontSize: 20, fontWeight: '800' },
  heroStatLabel: { fontSize: 11, fontWeight: '600' },
  loadingWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  loadingText: { fontSize: 12, fontWeight: '600' },
  sectionBlock: { gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginTop: 4 },
  issueCard: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
  issueHeader: { flexDirection: 'row', gap: 10 },
  issueTitleWrap: { flex: 1, gap: 4 },
  issueTitle: { fontSize: 14, fontWeight: '800' },
  issueMetaLine: { fontSize: 10, fontWeight: '700', letterSpacing: 0.9 },
  severityBadge: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 999, borderWidth: 1, alignSelf: 'flex-start' },
  severityBadgeText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.9 },
  issueStatsRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  issueStat: { fontSize: 11, fontWeight: '600' },
  trendPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  trendPillText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  issueVersionLine: { fontSize: 11, fontWeight: '600' },
  issueContextLine: { fontSize: 11, lineHeight: 16 },
  issueTimeLine: { fontSize: 10, lineHeight: 15 },
  issueRegression: { fontSize: 11, fontWeight: '700' },
  emptyCard: { borderWidth: 1, borderRadius: 14, padding: 16 },
  emptyText: { fontSize: 12, lineHeight: 18 },
  smokePillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  smokePill: { minWidth: 96, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, gap: 2 },
  smokePillLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  smokePillValue: { fontSize: 11, fontWeight: '700' },
  smokeSection: { gap: 6 },
  contradictionRow: { gap: 2 },
});
