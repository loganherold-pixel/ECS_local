import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { SafeIcon as Ionicons } from '../SafeIcon';
import { formatCommunityCampsiteValue } from '../../lib/campsites/communityCampsiteMapLayer';
import {
  campsiteReviewService,
  type CampSiteReviewerManagementItem,
  type CampsiteReviewService,
} from '../../lib/campsites/campsiteReviewService';

type Colors = {
  bgCard: string;
  border: string;
  gold: string;
  goldBorder: string;
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
  onToast?: (message: string) => void;
  service?: Pick<
    CampsiteReviewService,
    'listReviewerProfiles' | 'getReviewerDetails' | 'promoteReviewer' | 'suspendReviewer'
  >;
};

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Unknown';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

export default function CampsiteReviewerManagement({
  colors,
  onToast,
  service = campsiteReviewService,
}: Props) {
  const [reviewers, setReviewers] = useState<CampSiteReviewerManagementItem[]>([]);
  const [detailsByUserId, setDetailsByUserId] = useState<Record<string, CampSiteReviewerManagementItem>>({});
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [suspendReasonByUserId, setSuspendReasonByUserId] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadReviewers = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await service.listReviewerProfiles(75);
    setLoading(false);
    if (!result.ok) {
      setReviewers([]);
      setError(result.error);
      return;
    }
    setReviewers(result.data);
  }, [service]);

  useEffect(() => {
    void loadReviewers();
  }, [loadReviewers]);

  const toggleDetails = useCallback(
    async (userId: string) => {
      if (selectedUserId === userId) {
        setSelectedUserId(null);
        return;
      }
      setSelectedUserId(userId);
      if (detailsByUserId[userId]) return;
      setBusyUserId(userId);
      const result = await service.getReviewerDetails(userId);
      setBusyUserId(null);
      if (!result.ok) {
        onToast?.(result.error);
        return;
      }
      setDetailsByUserId((prev) => ({ ...prev, [userId]: result.data }));
    },
    [detailsByUserId, onToast, selectedUserId, service],
  );

  const runStatusAction = useCallback(
    async (userId: string, action: 'promote' | 'suspend') => {
      setBusyUserId(userId);
      const result =
        action === 'promote'
          ? await service.promoteReviewer(userId)
          : await service.suspendReviewer(userId, suspendReasonByUserId[userId] ?? null);
      setBusyUserId(null);
      if (!result.ok) {
        onToast?.(result.error);
        return;
      }
      onToast?.(action === 'promote' ? 'Reviewer promoted to trusted.' : 'Reviewer suspended.');
      setDetailsByUserId((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
      await loadReviewers();
    },
    [loadReviewers, onToast, service, suspendReasonByUserId],
  );

  return (
    <View style={styles.wrap}>
      <View style={[styles.hero, { backgroundColor: colors.bgCard, borderColor: colors.goldBorder }]}>
        <View style={styles.heroIcon}>
          <Ionicons name="people-circle-outline" size={21} color={colors.gold} />
        </View>
        <View style={styles.heroText}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Campsite Reviewer Management</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Promote trusted reviewers, suspend bad actors, and inspect review quality signals.
          </Text>
        </View>
        <TouchableOpacity style={[styles.refreshButton, { borderColor: colors.goldBorder }]} onPress={loadReviewers}>
          <Ionicons name="refresh-outline" size={16} color={colors.gold} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={[styles.emptyCard, { borderColor: colors.border, backgroundColor: colors.bgCard }]}>
          <ActivityIndicator color={colors.gold} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>Loading reviewer profiles...</Text>
        </View>
      ) : error ? (
        <View style={[styles.emptyCard, { borderColor: colors.border, backgroundColor: colors.bgCard }]}>
          <Ionicons name="lock-closed-outline" size={22} color={colors.warning} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{error}</Text>
        </View>
      ) : reviewers.length === 0 ? (
        <View style={[styles.emptyCard, { borderColor: colors.border, backgroundColor: colors.bgCard }]}>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>No reviewer profiles found.</Text>
        </View>
      ) : (
        reviewers.map((reviewer) => {
          const selected = selectedUserId === reviewer.user_id;
          const detail = detailsByUserId[reviewer.user_id] ?? reviewer;
          const dangerColor = colors.danger ?? colors.error ?? colors.warning;
          return (
            <View key={reviewer.user_id} style={[styles.card, { borderColor: colors.border, backgroundColor: colors.bgCard }]}>
              <TouchableOpacity style={styles.cardHeader} onPress={() => toggleDetails(reviewer.user_id)} activeOpacity={0.8}>
                <View style={styles.cardTitleGroup}>
                  <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Reviewer {reviewer.user_id.slice(0, 8)}</Text>
                  <Text style={[styles.cardMeta, { color: colors.textMuted }]}>
                    {formatCommunityCampsiteValue(reviewer.reviewer_status)} | score {Math.round(reviewer.reputation_score)}
                  </Text>
                </View>
                <View style={[styles.statusPill, { borderColor: colors.goldBorder }]}>
                  <Text style={[styles.statusPillText, { color: colors.gold }]}>{reviewer.reviewer_status.toUpperCase()}</Text>
                </View>
              </TouchableOpacity>

              <View style={styles.metrics}>
                <Metric label="Reviews" value={`${reviewer.review_count}`} colors={colors} />
                <Metric label="Helpful" value={`${reviewer.helpful_review_count}`} colors={colors} />
                <Metric label="Conflicts" value={`${reviewer.rejected_review_count}`} colors={colors} />
                <Metric label="Reputation" value={`${Math.round(reviewer.reputation_score)}`} colors={colors} />
              </View>

              {reviewer.approve_only_recent ? (
                <View style={[styles.notice, { borderColor: colors.warning }]}>
                  <Ionicons name="warning-outline" size={14} color={colors.warning} />
                  <Text style={[styles.noticeText, { color: colors.textSecondary }]}>
                    Approve-only pattern detected in recent votes. Review before promotion.
                  </Text>
                </View>
              ) : null}

              {selected ? (
                <View style={[styles.detailPanel, { borderColor: colors.border }]}>
                  {busyUserId === reviewer.user_id && !detailsByUserId[reviewer.user_id] ? (
                    <ActivityIndicator color={colors.gold} />
                  ) : (
                    <>
                      <Text style={[styles.detailTitle, { color: colors.textPrimary }]}>Review history</Text>
                      {(detail.recent_votes ?? []).length === 0 ? (
                        <Text style={[styles.emptyText, { color: colors.textMuted }]}>No recent votes.</Text>
                      ) : (
                        (detail.recent_votes ?? []).slice(0, 8).map((vote) => (
                          <Text key={vote.id} style={[styles.historyText, { color: colors.textSecondary }]}>
                            {formatDate(vote.updated_at)} | {formatCommunityCampsiteValue(vote.vote)} | {vote.confidence}
                          </Text>
                        ))
                      )}

                      <Text style={[styles.detailTitle, { color: colors.textPrimary }]}>Audit events</Text>
                      {(detail.audit_events ?? []).length === 0 ? (
                        <Text style={[styles.emptyText, { color: colors.textMuted }]}>No reviewer audit events.</Text>
                      ) : (
                        (detail.audit_events ?? []).slice(0, 8).map((event) => (
                          <Text key={event.id} style={[styles.historyText, { color: colors.textSecondary }]}>
                            {formatDate(event.created_at)} | {formatCommunityCampsiteValue(event.event_type)}
                          </Text>
                        ))
                      )}

                      <TextInput
                        style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
                        value={suspendReasonByUserId[reviewer.user_id] ?? ''}
                        onChangeText={(value) => setSuspendReasonByUserId((prev) => ({ ...prev, [reviewer.user_id]: value }))}
                        placeholder="Suspension reason"
                        placeholderTextColor={colors.textMuted}
                      />
                    </>
                  )}
                </View>
              ) : null}

              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.action, { borderColor: colors.goldBorder, opacity: busyUserId === reviewer.user_id ? 0.5 : 1 }]}
                  disabled={busyUserId === reviewer.user_id}
                  onPress={() => runStatusAction(reviewer.user_id, 'promote')}
                  activeOpacity={0.75}
                >
                  <Ionicons name="shield-checkmark-outline" size={14} color={colors.gold} />
                  <Text style={[styles.actionText, { color: colors.gold }]}>Promote</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.action, { borderColor: `${dangerColor}66`, opacity: busyUserId === reviewer.user_id ? 0.5 : 1 }]}
                  disabled={busyUserId === reviewer.user_id}
                  onPress={() => runStatusAction(reviewer.user_id, 'suspend')}
                  activeOpacity={0.75}
                >
                  <Ionicons name="ban-outline" size={14} color={dangerColor} />
                  <Text style={[styles.actionText, { color: dangerColor }]}>Suspend</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

function Metric({ label, value, colors }: { label: string; value: string; colors: Colors }) {
  return (
    <View style={[styles.metric, { borderColor: colors.border }]}>
      <Text style={[styles.metricLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  hero: { borderRadius: 16, borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(196,138,44,0.10)' },
  heroText: { flex: 1, gap: 3 },
  title: { fontSize: 18, fontWeight: '900' },
  subtitle: { fontSize: 12, lineHeight: 17, fontWeight: '600' },
  refreshButton: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  emptyCard: { borderRadius: 14, borderWidth: 1, padding: 18, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 12, lineHeight: 17, fontWeight: '600', textAlign: 'center' },
  card: { borderRadius: 16, borderWidth: 1, padding: 12, gap: 10 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  cardTitleGroup: { flex: 1, gap: 3 },
  cardTitle: { fontSize: 15, fontWeight: '900' },
  cardMeta: { fontSize: 11, fontWeight: '700' },
  statusPill: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 5 },
  statusPillText: { fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { flexBasis: '22%', flexGrow: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 7, backgroundColor: 'rgba(255,255,255,0.035)' },
  metricLabel: { fontSize: 8, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  metricValue: { fontSize: 14, fontWeight: '900', marginTop: 2 },
  notice: { minHeight: 36, borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.035)' },
  noticeText: { flex: 1, fontSize: 11, lineHeight: 15, fontWeight: '700' },
  detailPanel: { borderRadius: 14, borderWidth: 1, padding: 10, gap: 8, backgroundColor: 'rgba(255,255,255,0.025)' },
  detailTitle: { fontSize: 12, fontWeight: '900', marginTop: 2 },
  historyText: { fontSize: 11, lineHeight: 16, fontWeight: '600' },
  input: { minHeight: 38, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, fontSize: 12, backgroundColor: 'rgba(255,255,255,0.035)' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  action: { minHeight: 34, borderRadius: 999, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 11, flexGrow: 1 },
  actionText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
});
