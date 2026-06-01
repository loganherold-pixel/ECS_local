import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  campsiteSubmissionService,
  type CampsiteSubmissionService,
  type MyCampsiteSubmission,
} from '../../lib/campsites/campsiteSubmissionService';

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
    CampsiteSubmissionService,
    | 'listMyCampsiteSubmissions'
    | 'getMyCampsiteSubmission'
    | 'updateMyCampsiteSubmission'
    | 'withdrawMyCampsiteSubmission'
    | 'respondToNeedsInfo'
    | 'submitPrivateSaveToCommunity'
  >;
};

type BucketKey =
  | 'private'
  | 'group'
  | 'pending'
  | 'needs_info'
  | 'approved'
  | 'rejected'
  | 'withdrawn';

const BUCKETS: { key: BucketKey; label: string }[] = [
  { key: 'private', label: 'Private saves' },
  { key: 'group', label: 'Group shares' },
  { key: 'pending', label: 'Pending community review' },
  { key: 'needs_info', label: 'Needs info' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'withdrawn', label: 'Withdrawn' },
];

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Unknown';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

function formatCoordinates(report: MyCampsiteSubmission): string {
  return `${report.latitude.toFixed(4)}, ${report.longitude.toFixed(4)}`;
}

function vehicleFitText(values: string[]): string {
  return values.length > 0 ? values.map(formatCommunityCampsiteValue).join(', ') : 'Unknown';
}

function bucketForSubmission(report: MyCampsiteSubmission): BucketKey {
  if (report.review_state === 'withdrawn') return 'withdrawn';
  if (report.review_state === 'needs_submitter_info' || report.moderation_status === 'needs_info') {
    return 'needs_info';
  }
  if (report.review_state === 'approved' || report.moderation_status === 'approved') return 'approved';
  if (report.review_state === 'rejected' || report.review_state === 'community_rejected' || report.moderation_status === 'rejected') {
    return 'rejected';
  }
  if (report.visibility_requested === 'group') return 'group';
  if (report.review_state === 'private_saved' || report.moderation_status === 'private_saved') return 'private';
  return 'pending';
}

export default function MyCampsiteSubmissions({
  colors,
  onToast,
  service = campsiteSubmissionService,
}: Props) {
  const [submissions, setSubmissions] = useState<MyCampsiteSubmission[]>([]);
  const [selectedBucket, setSelectedBucket] = useState<BucketKey>('pending');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailsById, setDetailsById] = useState<Record<string, MyCampsiteSubmission>>({});
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [ackById, setAckById] = useState<Record<string, { stewardship: boolean; sensitive: boolean }>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSubmissions = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await service.listMyCampsiteSubmissions();
    setLoading(false);
    if (!result.ok) {
      setSubmissions([]);
      setError(result.error);
      return;
    }
    setSubmissions(result.data);
    setDetailsById((prev) => {
      const next = { ...prev };
      result.data.forEach((submission) => {
        next[submission.id] = submission;
      });
      return next;
    });
    if (!selectedId && result.data.length > 0) setSelectedId(result.data[0].id);
  }, [selectedId, service]);

  useEffect(() => {
    void loadSubmissions();
  }, [loadSubmissions]);

  const buckets = useMemo(() => {
    const initial: Record<BucketKey, MyCampsiteSubmission[]> = {
      private: [],
      group: [],
      pending: [],
      needs_info: [],
      approved: [],
      rejected: [],
      withdrawn: [],
    };
    submissions.forEach((submission) => {
      initial[bucketForSubmission(submission)].push(submission);
    });
    return initial;
  }, [submissions]);

  const visibleSubmissions = buckets[selectedBucket];
  const selected = selectedId ? detailsById[selectedId] ?? submissions.find((item) => item.id === selectedId) ?? null : null;

  const selectSubmission = useCallback(
    async (submissionId: string) => {
      setSelectedId(submissionId);
      if (detailsById[submissionId]) return;
      setBusyId(submissionId);
      const result = await service.getMyCampsiteSubmission(submissionId);
      setBusyId(null);
      if (!result.ok) {
        onToast?.(result.error);
        return;
      }
      setDetailsById((prev) => ({ ...prev, [submissionId]: result.data }));
      setNotesById((prev) => ({ ...prev, [submissionId]: result.data.notes ?? '' }));
    },
    [detailsById, onToast, service],
  );

  const refreshOne = useCallback(
    async (submissionId: string) => {
      const detail = await service.getMyCampsiteSubmission(submissionId);
      if (detail.ok) {
        setDetailsById((prev) => ({ ...prev, [submissionId]: detail.data }));
        setSubmissions((prev) => prev.map((item) => (item.id === submissionId ? detail.data : item)));
      }
    },
    [service],
  );

  const saveNotes = useCallback(
    async (submissionId: string) => {
      setBusyId(submissionId);
      const result = await service.updateMyCampsiteSubmission(submissionId, {
        notes: notesById[submissionId] ?? '',
      });
      setBusyId(null);
      if (!result.ok) {
        onToast?.(result.error);
        return;
      }
      onToast?.('Campsite submission updated.');
      await refreshOne(submissionId);
    },
    [notesById, onToast, refreshOne, service],
  );

  const respondNeedsInfo = useCallback(
    async (submissionId: string) => {
      setBusyId(submissionId);
      const result = await service.respondToNeedsInfo(submissionId, {
        notes: notesById[submissionId] ?? '',
      });
      setBusyId(null);
      if (!result.ok) {
        onToast?.(result.error);
        return;
      }
      onToast?.('Response sent back to campsite review.');
      await loadSubmissions();
      await refreshOne(submissionId);
    },
    [loadSubmissions, notesById, onToast, refreshOne, service],
  );

  const withdraw = useCallback(
    async (submissionId: string) => {
      setBusyId(submissionId);
      const result = await service.withdrawMyCampsiteSubmission(submissionId);
      setBusyId(null);
      if (!result.ok) {
        onToast?.(result.error);
        return;
      }
      onToast?.('Campsite submission withdrawn.');
      await loadSubmissions();
      await refreshOne(submissionId);
    },
    [loadSubmissions, onToast, refreshOne, service],
  );

  const submitPrivate = useCallback(
    async (submissionId: string) => {
      const acknowledgements = ackById[submissionId];
      setBusyId(submissionId);
      const result = await service.submitPrivateSaveToCommunity(submissionId, {
        stewardship_acknowledged: acknowledgements?.stewardship === true,
        sensitive_area_acknowledged: acknowledgements?.sensitive === true,
      });
      setBusyId(null);
      if (!result.ok) {
        onToast?.(result.error);
        return;
      }
      onToast?.('Submitted for ECS Community Review.');
      await loadSubmissions();
      await refreshOne(submissionId);
    },
    [ackById, loadSubmissions, onToast, refreshOne, service],
  );

  const toggleAck = useCallback(
    (submissionId: string, key: 'stewardship' | 'sensitive') => {
      setAckById((prev) => {
        const current = prev[submissionId] ?? { stewardship: false, sensitive: false };
        return {
          ...prev,
          [submissionId]: {
            ...current,
            [key]: !current[key],
          },
        };
      });
    },
    [],
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.eyebrow, { color: colors.gold }]}>CAMPSITES</Text>
          <Text style={[styles.title, { color: colors.textPrimary }]}>My Campsite Submissions</Text>
        </View>
        <TouchableOpacity
          style={[styles.iconButton, { borderColor: colors.border, backgroundColor: colors.bgCard }]}
          onPress={loadSubmissions}
          activeOpacity={0.7}
        >
          <Ionicons name="refresh-outline" size={16} color={colors.gold} />
        </TouchableOpacity>
      </View>

      <Text style={[styles.intro, { color: colors.textMuted }]}>
        Track private saves, community review, correction requests, and published campsite submissions.
      </Text>

      <View style={styles.bucketRow}>
        {BUCKETS.map((bucket) => {
          const active = selectedBucket === bucket.key;
          return (
            <TouchableOpacity
              key={bucket.key}
              style={[
                styles.bucketPill,
                {
                  borderColor: active ? colors.goldBorder : colors.border,
                  backgroundColor: active ? `${colors.gold}18` : colors.bgCard,
                },
              ]}
              onPress={() => setSelectedBucket(bucket.key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.bucketText, { color: active ? colors.gold : colors.textSecondary }]}>
                {bucket.label} ({buckets[bucket.key].length})
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.gold} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>Loading campsite submissions...</Text>
        </View>
      ) : error ? (
        <View style={[styles.emptyCard, { borderColor: colors.border, backgroundColor: colors.bgCard }]}>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>{error}</Text>
        </View>
      ) : (
        <>
          <View style={styles.list}>
            {visibleSubmissions.length === 0 ? (
              <View style={[styles.emptyCard, { borderColor: colors.border, backgroundColor: colors.bgCard }]}>
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>No campsite submissions in this status.</Text>
              </View>
            ) : (
              visibleSubmissions.map((submission) => {
                const active = selectedId === submission.id;
                return (
                  <TouchableOpacity
                    key={submission.id}
                    style={[
                      styles.submissionCard,
                      {
                        borderColor: active ? colors.goldBorder : colors.border,
                        backgroundColor: colors.bgCard,
                      },
                    ]}
                    onPress={() => selectSubmission(submission.id)}
                    activeOpacity={0.75}
                  >
                    <View style={styles.cardTopRow}>
                      <View style={styles.cardTitleGroup}>
                        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                          {formatCommunityCampsiteValue(submission.site_type)}
                        </Text>
                        <Text style={[styles.cardMeta, { color: colors.textMuted }]}>
                          {formatCoordinates(submission)} | {formatDate(submission.updated_at)}
                        </Text>
                      </View>
                      <View style={[styles.statusPill, { borderColor: colors.goldBorder }]}>
                        <Text style={[styles.statusPillText, { color: colors.gold }]}>{submission.statusLabel}</Text>
                      </View>
                    </View>
                    <Text style={[styles.statusCopy, { color: colors.textSecondary }]}>{submission.statusCopy}</Text>
                  </TouchableOpacity>
                );
              })
            )}
          </View>

          {selected ? (
            <View style={[styles.detailCard, { borderColor: colors.border, backgroundColor: colors.bgCard }]}>
              <View style={styles.detailHeader}>
                <View style={styles.detailTitleGroup}>
                  <Text style={[styles.detailTitle, { color: colors.textPrimary }]}>Submission detail</Text>
                  <Text style={[styles.detailSubtitle, { color: colors.textMuted }]}>
                    {selected.source_type.replace(/_/g, ' ')} | {formatCoordinates(selected)}
                  </Text>
                </View>
                {busyId === selected.id ? <ActivityIndicator color={colors.gold} /> : null}
              </View>

              <View style={styles.factGrid}>
                <Fact label="Status" value={selected.statusCopy} colors={colors} />
                <Fact label="Access" value={formatCommunityCampsiteValue(selected.access_difficulty)} colors={colors} />
                <Fact label="Vehicle fit" value={vehicleFitText(selected.vehicle_fit)} colors={colors} />
                <Fact label="Visited" value={formatDate(selected.visited_at)} colors={colors} />
              </View>

              {selected.correctionRequest ? (
                <View style={[styles.notice, { borderColor: colors.warning, backgroundColor: `${colors.warning}14` }]}>
                  <Ionicons name="help-circle-outline" size={16} color={colors.warning} />
                  <Text style={[styles.noticeText, { color: colors.textPrimary }]}>
                    {selected.correctionRequest}
                  </Text>
                </View>
              ) : null}

              {selected.canEdit ? (
                <View style={styles.editGroup}>
                  <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Notes</Text>
                  <TextInput
                    style={[
                      styles.notesInput,
                      { borderColor: colors.border, color: colors.textPrimary, backgroundColor: 'rgba(0,0,0,0.18)' },
                    ]}
                    value={notesById[selected.id] ?? selected.notes ?? ''}
                    onChangeText={(value) => setNotesById((prev) => ({ ...prev, [selected.id]: value }))}
                    placeholder="Add context for reviewers"
                    placeholderTextColor={colors.textMuted}
                    multiline
                  />
                  <TouchableOpacity
                    style={[styles.secondaryAction, { borderColor: colors.goldBorder }]}
                    onPress={() => saveNotes(selected.id)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="save-outline" size={15} color={colors.gold} />
                    <Text style={[styles.secondaryActionText, { color: colors.gold }]}>Save allowed edits</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              <View style={styles.actionRow}>
                {selected.canSubmitToCommunity ? (
                  <View style={[styles.communityWarning, { borderColor: colors.warning, backgroundColor: `${colors.warning}10` }]}>
                    <Text style={[styles.communityWarningText, { color: colors.textPrimary }]}>
                      Only submit established, legal, durable campsites. Do not submit private, closed, culturally sensitive, wildlife-sensitive, or fragile locations.
                    </Text>
                    <AckRow
                      label="I believe this is a legal, established campsite."
                      checked={ackById[selected.id]?.stewardship === true}
                      colors={colors}
                      onPress={() => toggleAck(selected.id, 'stewardship')}
                    />
                    <AckRow
                      label="I am not sharing a private, closed, culturally sensitive, wildlife-sensitive, or fragile location."
                      checked={ackById[selected.id]?.sensitive === true}
                      colors={colors}
                      onPress={() => toggleAck(selected.id, 'sensitive')}
                    />
                  </View>
                ) : null}
                {selected.canRespondToNeedsInfo ? (
                  <TouchableOpacity
                    style={[styles.primaryAction, { backgroundColor: colors.gold }]}
                    onPress={() => respondNeedsInfo(selected.id)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="send-outline" size={15} color="#000" />
                    <Text style={styles.primaryActionText}>Send response</Text>
                  </TouchableOpacity>
                ) : null}
                {selected.canSubmitToCommunity ? (
                  <TouchableOpacity
                    style={[styles.primaryAction, { backgroundColor: colors.gold }]}
                    onPress={() => submitPrivate(selected.id)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="cloud-upload-outline" size={15} color="#000" />
                    <Text style={styles.primaryActionText}>Submit to community</Text>
                  </TouchableOpacity>
                ) : null}
                {selected.canWithdraw ? (
                  <TouchableOpacity
                    style={[styles.dangerAction, { borderColor: colors.danger ?? colors.error ?? colors.warning }]}
                    onPress={() => withdraw(selected.id)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="close-circle-outline" size={15} color={colors.danger ?? colors.error ?? colors.warning} />
                    <Text style={[styles.dangerActionText, { color: colors.danger ?? colors.error ?? colors.warning }]}>
                      Withdraw submission
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              <View style={styles.timeline}>
                <Text style={[styles.timelineTitle, { color: colors.textPrimary }]}>Status timeline</Text>
                {selected.events.length === 0 ? (
                  <Text style={[styles.emptyText, { color: colors.textMuted }]}>No review events yet.</Text>
                ) : (
                  selected.events.map((event) => (
                    <View key={event.id} style={[styles.timelineRow, { borderLeftColor: colors.goldBorder }]}>
                      <Text style={[styles.timelineEvent, { color: colors.textPrimary }]}>
                        {formatCommunityCampsiteValue(event.event_type)}
                      </Text>
                      <Text style={[styles.timelineDate, { color: colors.textMuted }]}>{formatDate(event.created_at)}</Text>
                    </View>
                  ))
                )}
              </View>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

function Fact({ label, value, colors }: { label: string; value: string; colors: Colors }) {
  return (
    <View style={[styles.fact, { borderColor: colors.border, backgroundColor: 'rgba(0,0,0,0.12)' }]}>
      <Text style={[styles.factLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.factValue, { color: colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

function AckRow({
  label,
  checked,
  colors,
  onPress,
}: {
  label: string;
  checked: boolean;
  colors: Colors;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.ackRow} onPress={onPress} activeOpacity={0.75}>
      <Ionicons
        name={checked ? 'checkbox-outline' : 'square-outline'}
        size={17}
        color={checked ? colors.gold : colors.textMuted}
      />
      <Text style={[styles.ackText, { color: colors.textSecondary }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { gap: 14 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.6 },
  title: { fontSize: 21, fontWeight: '900' },
  intro: { fontSize: 12, lineHeight: 18 },
  iconButton: { width: 36, height: 36, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  bucketRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bucketPill: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  bucketText: { fontSize: 11, fontWeight: '800' },
  centerState: { paddingVertical: 30, alignItems: 'center', gap: 10 },
  emptyCard: { borderWidth: 1, borderRadius: 10, padding: 14 },
  emptyText: { fontSize: 12, lineHeight: 18 },
  list: { gap: 10 },
  submissionCard: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 8 },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' },
  cardTitleGroup: { flex: 1, gap: 3 },
  cardTitle: { fontSize: 14, fontWeight: '900' },
  cardMeta: { fontSize: 11, lineHeight: 15 },
  statusPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  statusPillText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase' },
  statusCopy: { fontSize: 12, lineHeight: 17 },
  detailCard: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 14 },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  detailTitleGroup: { flex: 1, gap: 3 },
  detailTitle: { fontSize: 17, fontWeight: '900' },
  detailSubtitle: { fontSize: 11, lineHeight: 16 },
  factGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fact: { flexGrow: 1, flexBasis: '46%', borderWidth: 1, borderRadius: 8, padding: 10, gap: 4 },
  factLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  factValue: { fontSize: 12, fontWeight: '700', lineHeight: 16 },
  notice: { borderWidth: 1, borderRadius: 8, padding: 10, flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  editGroup: { gap: 8 },
  fieldLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  notesInput: { minHeight: 88, borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 13, textAlignVertical: 'top' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  communityWarning: { width: '100%', borderWidth: 1, borderRadius: 8, padding: 10, gap: 8 },
  communityWarningText: { fontSize: 12, lineHeight: 18, fontWeight: '700' },
  ackRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  ackText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  primaryAction: { minHeight: 40, borderRadius: 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  primaryActionText: { color: '#000', fontSize: 11, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  secondaryAction: { minHeight: 38, borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, alignSelf: 'flex-start' },
  secondaryActionText: { fontSize: 11, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  dangerAction: { minHeight: 40, borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  dangerActionText: { fontSize: 11, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  timeline: { gap: 9 },
  timelineTitle: { fontSize: 14, fontWeight: '900' },
  timelineRow: { borderLeftWidth: 2, paddingLeft: 10, gap: 2 },
  timelineEvent: { fontSize: 12, fontWeight: '800' },
  timelineDate: { fontSize: 11 },
});
