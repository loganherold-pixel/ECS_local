import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
  type CampSiteReviewQueueItem,
  type CampSiteReviewReportDetails,
  type CampsiteReviewService,
  type CampSiteReviewVoteInput,
  type CampSiteReviewVoteSummary,
} from '../../lib/campsites/campsiteReviewService';
import type {
  CampSiteJsonObject,
  CampSiteReviewConfidence,
  CampSiteReviewVoteValue,
} from '../../lib/campsites/campsiteRecommendationTypes';

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
  error?: string;
};

type Props = {
  colors: Colors;
  onToast?: (message: string) => void;
  service?: Pick<
    CampsiteReviewService,
    'listCommunityReviewQueue' | 'getCommunityReviewReportDetails' | 'castReviewVote'
  >;
};

type TriageSummary = CampSiteJsonObject & {
  checks?: Record<string, unknown>[];
  warnings?: string[];
  blocking_reasons?: string[];
  duplicate_candidates?: { id?: string; source?: string; distance_meters?: number }[];
  recommended_next_state?: string;
  land_use_status?: string;
  land_use_review?: CampSiteJsonObject;
};

type LandUseMatchDisplay = {
  label?: string;
  provider?: string;
  effect?: string;
  publicReason?: string;
  details?: string;
};

const CONFIDENCE_OPTIONS: CampSiteReviewConfidence[] = ['low', 'medium', 'high'];

const REVIEW_ACTIONS: {
  vote: CampSiteReviewVoteValue;
  label: string;
  icon: string;
  danger?: boolean;
}[] = [
  { vote: 'approve', label: 'Approve', icon: 'checkmark-circle-outline' },
  { vote: 'reject', label: 'Reject', icon: 'close-circle-outline', danger: true },
  { vote: 'needs_info', label: 'Needs more info', icon: 'help-circle-outline' },
  { vote: 'duplicate', label: 'Duplicate', icon: 'git-merge-outline' },
  { vote: 'sensitive', label: 'Sensitive location', icon: 'eye-off-outline', danger: true },
  { vote: 'private_land', label: 'Private land', icon: 'lock-closed-outline', danger: true },
  { vote: 'closed_to_camping', label: 'Closed to camping', icon: 'trail-sign-outline', danger: true },
  { vote: 'bad_coordinates', label: 'Bad coordinates', icon: 'locate-outline', danger: true },
];

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Unknown';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

function formatBool(value: boolean): string {
  return value ? 'Yes' : 'No';
}

function formatVehicleFit(values: string[]): string {
  return values.length > 0 ? values.map(formatCommunityCampsiteValue).join(', ') : 'Unknown';
}

function formatCoordinate(value: number): string {
  return value.toFixed(4);
}

function asTriageSummary(value: CampSiteJsonObject | null | undefined): TriageSummary {
  return (value ?? {}) as TriageSummary;
}

function triageStatus(summary: TriageSummary): string {
  if ((summary.blocking_reasons ?? []).length > 0) return 'BLOCKED';
  if ((summary.warnings ?? []).length > 0 || (summary.duplicate_candidates ?? []).length > 0) return 'WARNING';
  return 'PASSED';
}

function duplicateWarning(summary: TriageSummary): string | null {
  const duplicates = summary.duplicate_candidates ?? [];
  if (duplicates.length === 0) return null;
  return `${duplicates.length} possible duplicate${duplicates.length === 1 ? '' : 's'} nearby`;
}

function nearbyPendingDuplicates(summary: TriageSummary) {
  return (summary.duplicate_candidates ?? []).filter((candidate) => candidate.source === 'camp_site_report');
}

function landUseMatches(value: CampSiteJsonObject | null | undefined): LandUseMatchDisplay[] {
  const matches = value?.matches;
  return Array.isArray(matches) ? matches.filter((match): match is LandUseMatchDisplay => match != null) : [];
}

function voteSummaryText(summary?: CampSiteReviewVoteSummary): string {
  if (!summary) return 'No votes yet';
  return [
    `Approve ${summary.approve}`,
    `Reject ${summary.reject}`,
    `Info ${summary.needs_info}`,
    `Duplicate ${summary.duplicate}`,
    `Sensitive ${summary.sensitive + summary.private_land + summary.closed_to_camping}`,
    `Bad coords ${summary.bad_coordinates}`,
  ].join(' | ');
}

export default function CommunityCampsiteReview({
  colors,
  onToast,
  service = campsiteReviewService,
}: Props) {
  const [queue, setQueue] = useState<CampSiteReviewQueueItem[]>([]);
  const [detailsById, setDetailsById] = useState<Record<string, CampSiteReviewReportDetails>>({});
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyReportId, setBusyReportId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notesByReportId, setNotesByReportId] = useState<Record<string, string>>({});
  const [confidenceByReportId, setConfidenceByReportId] = useState<Record<string, CampSiteReviewConfidence>>({});

  const queueCount = queue.length;
  const title = useMemo(
    () => `Community Campsite Review${queueCount > 0 ? ` (${queueCount})` : ''}`,
    [queueCount],
  );

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await service.listCommunityReviewQueue(50);
    setLoading(false);
    if (!result.ok) {
      setQueue([]);
      setError(result.error);
      return;
    }
    setQueue(result.data);
  }, [service]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const toggleDetails = useCallback(
    async (reportId: string) => {
      if (selectedReportId === reportId) {
        setSelectedReportId(null);
        return;
      }
      setSelectedReportId(reportId);
      if (detailsById[reportId]) return;

      setBusyReportId(reportId);
      const result = await service.getCommunityReviewReportDetails(reportId);
      setBusyReportId(null);
      if (!result.ok) {
        onToast?.(result.error);
        return;
      }
      setDetailsById((prev) => ({ ...prev, [reportId]: result.data }));
    },
    [detailsById, onToast, selectedReportId, service],
  );

  const castVote = useCallback(
    async (reportId: string, vote: CampSiteReviewVoteValue) => {
      const input: CampSiteReviewVoteInput = {
        vote,
        confidence: confidenceByReportId[reportId] ?? 'medium',
        reviewer_notes: notesByReportId[reportId] ?? null,
      };
      setBusyReportId(reportId);
      const result = await service.castReviewVote(reportId, input);
      setBusyReportId(null);
      if (!result.ok) {
        onToast?.(result.error);
        return;
      }
      onToast?.(`Review vote recorded: ${formatCommunityCampsiteValue(vote)}.`);
      const detail = await service.getCommunityReviewReportDetails(reportId);
      if (detail.ok) {
        setDetailsById((prev) => ({ ...prev, [reportId]: detail.data }));
      }
      await loadQueue();
    },
    [confidenceByReportId, loadQueue, notesByReportId, onToast, service],
  );

  return (
    <View style={styles.wrap}>
      <View style={[styles.hero, { backgroundColor: colors.bgCard, borderColor: colors.goldBorder }]}>
        <View style={styles.heroIcon}>
          <Ionicons name="shield-checkmark-outline" size={20} color={colors.gold} />
        </View>
        <View style={styles.heroText}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Trusted reviewers check community campsite submissions before anything becomes public.
          </Text>
        </View>
        <TouchableOpacity style={[styles.refreshButton, { borderColor: colors.goldBorder }]} onPress={loadQueue}>
          <Ionicons name="refresh-outline" size={16} color={colors.gold} />
        </TouchableOpacity>
      </View>

      <View style={[styles.warningCard, { backgroundColor: colors.bgCard, borderColor: colors.goldBorder }]}>
        <Ionicons name="alert-circle-outline" size={16} color={colors.gold} />
        <View style={styles.warningTextWrap}>
          <Text style={[styles.warningText, { color: colors.textSecondary }]}>
            One sensitive/private/closed vote may escalate this to moderator review.
          </Text>
          <Text style={[styles.warningText, { color: colors.textSecondary }]}>
            Community approval does not publish until quorum is met.
          </Text>
        </View>
      </View>

      {loading ? (
        <EmptyCard colors={colors} icon="hourglass-outline" title="Loading review queue">
          <ActivityIndicator size="small" color={colors.gold} />
        </EmptyCard>
      ) : error ? (
        <EmptyCard colors={colors} icon="lock-closed-outline" title="Trusted reviewer access required">
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{error}</Text>
        </EmptyCard>
      ) : queue.length === 0 ? (
        <EmptyCard colors={colors} icon="checkmark-circle-outline" title="No campsite reviews waiting">
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Community review and moderator review submissions will appear here when you are eligible to see them.
          </Text>
        </EmptyCard>
      ) : (
        queue.map((report) => {
          const triage = asTriageSummary(report.triage_summary);
          const selected = selectedReportId === report.id;
          const details = detailsById[report.id];
          const photos = details?.photos ?? report.photos ?? [];
          const canVote = report.can_vote === true;
          return (
            <View key={report.id} style={[styles.reportCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
              <TouchableOpacity activeOpacity={0.86} onPress={() => toggleDetails(report.id)}>
                <View style={styles.reportHeader}>
                  <View style={styles.reportTitleWrap}>
                    <Text style={[styles.reportTitle, { color: colors.textPrimary }]}>
                      {formatCommunityCampsiteValue(report.site_type)}
                    </Text>
                    <Text style={[styles.reportMeta, { color: colors.textMuted }]}>
                      Submitted {formatDate(report.created_at)}
                    </Text>
                  </View>
                  <View style={[styles.statusPill, { borderColor: colors.goldBorder }]}>
                    <Text style={[styles.statusText, { color: colors.gold }]}>
                      {formatCommunityCampsiteValue(report.review_state ?? 'community_review').toUpperCase()}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>

              <View style={styles.detailGrid}>
                <Detail label="Region" value={`${formatCoordinate(report.latitude)}, ${formatCoordinate(report.longitude)}`} colors={colors} />
                <Detail label="Source" value={formatCommunityCampsiteValue(report.source_type)} colors={colors} />
                <Detail label="Visited" value={formatDate(report.visited_at)} colors={colors} />
                <Detail label="Stayed Here" value={formatBool(report.user_stayed_here)} colors={colors} />
                <Detail label="Verified In Person" value={formatBool(report.verified_in_person)} colors={colors} />
                <Detail label="Access" value={formatCommunityCampsiteValue(report.access_difficulty)} colors={colors} />
                <Detail label="Vehicle Fit" value={formatVehicleFit(report.vehicle_fit)} colors={colors} wide />
                <Detail label="Triage" value={`${triageStatus(triage)}${report.triage_score != null ? ` / ${Math.round(report.triage_score)}` : ''}`} colors={colors} />
                <Detail label="Photos" value={`${photos.length}`} colors={colors} />
                <Detail label="Vote Summary" value={voteSummaryText(details?.vote_summary ?? report.vote_summary)} colors={colors} wide />
              </View>

              {duplicateWarning(triage) ? (
                <View style={[styles.notice, { borderColor: colors.warning }]}>
                  <Ionicons name="git-merge-outline" size={14} color={colors.warning} />
                  <Text style={[styles.noticeText, { color: colors.textSecondary }]}>{duplicateWarning(triage)}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[styles.detailsButton, { borderColor: colors.goldBorder }]}
                activeOpacity={0.86}
                onPress={() => toggleDetails(report.id)}
              >
                <Text style={[styles.detailsButtonText, { color: colors.gold }]}>
                  {selected ? 'Hide details' : 'Review details'}
                </Text>
                {busyReportId === report.id && !details ? (
                  <ActivityIndicator size="small" color={colors.gold} />
                ) : (
                  <Ionicons name={selected ? 'chevron-up-outline' : 'chevron-down-outline'} size={14} color={colors.gold} />
                )}
              </TouchableOpacity>

              {selected ? (
                <ReportDetails
                  colors={colors}
                  report={details ?? report}
                  loading={busyReportId === report.id && !details}
                  notes={notesByReportId[report.id] ?? ''}
                  confidence={confidenceByReportId[report.id] ?? 'medium'}
                  canVote={canVote}
                  disabledReason={report.ineligible_reason ?? null}
                  onNotesChange={(text) => setNotesByReportId((prev) => ({ ...prev, [report.id]: text }))}
                  onConfidenceChange={(confidence) =>
                    setConfidenceByReportId((prev) => ({ ...prev, [report.id]: confidence }))
                  }
                  onVote={(vote) => castVote(report.id, vote)}
                  busy={busyReportId === report.id}
                />
              ) : null}
            </View>
          );
        })
      )}
    </View>
  );
}

function ReportDetails({
  colors,
  report,
  loading,
  notes,
  confidence,
  canVote,
  disabledReason,
  onNotesChange,
  onConfidenceChange,
  onVote,
  busy,
}: {
  colors: Colors;
  report: CampSiteReviewQueueItem | CampSiteReviewReportDetails;
  loading: boolean;
  notes: string;
  confidence: CampSiteReviewConfidence;
  canVote: boolean;
  disabledReason: string | null;
  onNotesChange: (text: string) => void;
  onConfidenceChange: (confidence: CampSiteReviewConfidence) => void;
  onVote: (vote: CampSiteReviewVoteValue) => void;
  busy: boolean;
}) {
  const triage = asTriageSummary(report.triage_summary);
  const details = report as Partial<CampSiteReviewReportDetails>;
  const photos = report.photos ?? [];
  const pendingDuplicates = nearbyPendingDuplicates(triage);
  const landUseWarning = triage.land_use_status && triage.land_use_status !== 'clear';
  const landUseReview = report.land_use_review;
  const visibleLandUseMatches = landUseMatches(landUseReview?.matched_layers);
  const hasGpxSource = report.source_type === 'gpx_waypoint' || report.source_type === 'gpx_route';

  if (loading) {
    return (
      <View style={[styles.detailsPanel, { borderColor: colors.border }]}>
        <ActivityIndicator size="small" color={colors.gold} />
      </View>
    );
  }

  return (
    <View style={[styles.detailsPanel, { borderColor: colors.border }]}>
      <View style={[styles.mapPreview, { borderColor: colors.goldBorder }]}>
        <Ionicons name="map-outline" size={16} color={colors.gold} />
        <Text style={[styles.mapPreviewText, { color: colors.textSecondary }]}>
          Map preview: submitted point near {formatCoordinate(report.latitude)}, {formatCoordinate(report.longitude)}
        </Text>
      </View>

      <View style={styles.badgeRow}>
        {hasGpxSource ? <Badge colors={colors} label="GPX source" icon="document-attach-outline" /> : null}
        {landUseWarning ? <Badge colors={colors} label="Land-use warning" icon="warning-outline" danger /> : null}
        <Badge colors={colors} label={`Triage ${triageStatus(triage)}`} icon="analytics-outline" />
      </View>

      <View style={styles.detailGrid}>
        <Detail label="Source Type" value={formatCommunityCampsiteValue(report.source_type)} colors={colors} />
        <Detail label="Location Accuracy" value={report.location_accuracy_m != null ? `${Math.round(report.location_accuracy_m)} m` : 'Unknown'} colors={colors} />
        <Detail label="Site Type" value={formatCommunityCampsiteValue(report.site_type)} colors={colors} />
        <Detail label="Access Difficulty" value={formatCommunityCampsiteValue(report.access_difficulty)} colors={colors} />
        <Detail label="Visibility Requested" value={formatCommunityCampsiteValue(report.visibility_requested)} colors={colors} />
        <Detail label="Review State" value={formatCommunityCampsiteValue(report.review_state ?? 'community_review')} colors={colors} />
      </View>

      {report.notes ? (
        <Section colors={colors} title="Submitted notes">
          <Text style={[styles.sectionText, { color: colors.textPrimary }]}>{report.notes}</Text>
        </Section>
      ) : null}

      <Section colors={colors} title="Triage summary">
        {(triage.warnings ?? []).length > 0 ? (
          (triage.warnings ?? []).map((warning, index) => (
            <Text key={`warning-${index}`} style={[styles.sectionText, { color: colors.textSecondary }]}>
              Warning: {warning}
            </Text>
          ))
        ) : (
          <Text style={[styles.sectionText, { color: colors.textSecondary }]}>No triage warnings recorded.</Text>
        )}
        {(triage.blocking_reasons ?? []).map((reason, index) => (
          <Text key={`block-${index}`} style={[styles.sectionText, { color: colors.warning }]}>
            Blocked: {reason}
          </Text>
        ))}
        {landUseWarning ? (
          <Text style={[styles.sectionText, { color: colors.warning }]}>
            Land-use review returned a non-clear result. Exact sensitive-layer details are not shown here.
          </Text>
        ) : null}
        {landUseReview?.public_reason ? (
          <Text style={[styles.sectionText, { color: colors.warning }]}>
            Land-use: {landUseReview.public_reason}
          </Text>
        ) : null}
        {visibleLandUseMatches.length > 0 ? (
          <>
            {visibleLandUseMatches.some((match) => match.label || match.details || match.provider) ? (
              <Text style={[styles.sectionText, { color: colors.textMuted }]}>Moderator land-use details</Text>
            ) : null}
            {visibleLandUseMatches.map((match, index) => (
              <Text key={`land-use-${index}`} style={[styles.sectionText, { color: colors.textSecondary }]}>
                {match.label ?? match.publicReason ?? 'Potential sensitive or restricted area'}
                {match.effect ? ` - ${formatCommunityCampsiteValue(match.effect)}` : ''}
                {match.provider ? ` / ${match.provider}` : ''}
                {match.details ? `: ${match.details}` : ''}
              </Text>
            ))}
          </>
        ) : null}
      </Section>

      <Section colors={colors} title="Nearby reviewed campsites">
        {(report.nearby_camp_sites ?? []).length === 0 ? (
          <Text style={[styles.sectionText, { color: colors.textSecondary }]}>No reviewed campsite candidates listed nearby.</Text>
        ) : (
          (report.nearby_camp_sites ?? []).map((site) => (
            <Text key={site.id} style={[styles.sectionText, { color: colors.textPrimary }]}>
              {site.canonical_name ?? 'Reviewed campsite'} - {formatCoordinate(site.latitude)}, {formatCoordinate(site.longitude)}
            </Text>
          ))
        )}
      </Section>

      <Section colors={colors} title="Nearby pending reports">
        {pendingDuplicates.length === 0 ? (
          <Text style={[styles.sectionText, { color: colors.textSecondary }]}>No nearby pending duplicate reports listed by triage.</Text>
        ) : (
          pendingDuplicates.map((candidate, index) => (
            <Text key={`${candidate.id ?? 'pending'}-${index}`} style={[styles.sectionText, { color: colors.textPrimary }]}>
              Pending report candidate {candidate.id ?? index + 1}
              {typeof candidate.distance_meters === 'number' ? ` - ${Math.round(candidate.distance_meters)} m away` : ''}
            </Text>
          ))
        )}
      </Section>

      {photos.length > 0 ? (
        <Section colors={colors} title="Photos pending review">
          <View style={styles.photoPreviewRow}>
            {photos.map((photo) => (
              <View key={photo.id} style={[styles.photoPreviewTile, { borderColor: colors.border }]}>
                <Image
                  source={{ uri: photo.thumbnail_url ?? photo.storage_url }}
                  style={styles.photoPreviewImage}
                  resizeMode="cover"
                />
                <Text style={[styles.photoPreviewText, { color: colors.textSecondary }]}>
                  {photo.moderation_status.toUpperCase()}
                </Text>
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      <Section colors={colors} title="Vote summary">
        <Text style={[styles.sectionText, { color: colors.textSecondary }]}>
          {voteSummaryText(details.vote_summary ?? report.vote_summary)}
        </Text>
      </Section>

      {details.events ? (
        <Section colors={colors} title="Review history">
          {details.events.length === 0 ? (
            <Text style={[styles.sectionText, { color: colors.textSecondary }]}>No review events recorded yet.</Text>
          ) : (
            details.events.map((event) => (
              <Text key={event.id} style={[styles.sectionText, { color: colors.textPrimary }]}>
                {formatDate(event.created_at)} - {formatCommunityCampsiteValue(event.event_type)}
              </Text>
            ))
          )}
        </Section>
      ) : null}

      <TextInput
        style={[styles.notesInput, { borderColor: colors.border, color: colors.textPrimary }]}
        value={notes}
        onChangeText={onNotesChange}
        placeholder="Reviewer notes"
        placeholderTextColor={colors.textMuted}
        multiline
      />

      <View style={styles.confidenceRow}>
        {CONFIDENCE_OPTIONS.map((option) => (
          <TouchableOpacity
            key={option}
            style={[
              styles.confidenceButton,
              {
                borderColor: confidence === option ? colors.gold : colors.border,
                backgroundColor: confidence === option ? `${colors.gold}18` : 'rgba(255,255,255,0.03)',
              },
            ]}
            onPress={() => onConfidenceChange(option)}
            activeOpacity={0.86}
          >
            <Text style={[styles.confidenceText, { color: confidence === option ? colors.gold : colors.textSecondary }]}>
              {option.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {!canVote ? (
        <View style={[styles.notice, { borderColor: colors.warning }]}>
          <Ionicons name="lock-closed-outline" size={14} color={colors.warning} />
          <Text style={[styles.noticeText, { color: colors.textSecondary }]}>
            {disabledReason ?? 'You are not eligible to vote on this campsite report.'}
          </Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        {REVIEW_ACTIONS.map((action) => (
          <Action
            key={action.vote}
            label={action.label}
            icon={action.icon}
            colors={colors}
            danger={action.danger}
            disabled={!canVote || busy}
            busy={busy}
            onPress={() => onVote(action.vote)}
          />
        ))}
      </View>
    </View>
  );
}

function EmptyCard({
  colors,
  icon,
  title,
  children,
}: {
  colors: Colors;
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.emptyCard, { borderColor: colors.border, backgroundColor: colors.bgCard }]}>
      <Ionicons name={icon as any} size={24} color={colors.gold} />
      <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{title}</Text>
      {children}
    </View>
  );
}

function Detail({
  label,
  value,
  colors,
  wide = false,
}: {
  label: string;
  value: string;
  colors: Colors;
  wide?: boolean;
}) {
  return (
    <View style={[styles.detailTile, wide && styles.detailTileWide, { borderColor: colors.border }]}>
      <Text style={[styles.detailLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

function Section({
  colors,
  title,
  children,
}: {
  colors: Colors;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.section, { borderColor: colors.border }]}>
      <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{title}</Text>
      {children}
    </View>
  );
}

function Badge({
  colors,
  label,
  icon,
  danger = false,
}: {
  colors: Colors;
  label: string;
  icon: string;
  danger?: boolean;
}) {
  const color = danger ? colors.warning : colors.gold;
  return (
    <View style={[styles.badge, { borderColor: `${color}55`, backgroundColor: `${color}12` }]}>
      <Ionicons name={icon as any} size={12} color={color} />
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

function Action({
  label,
  icon,
  colors,
  onPress,
  busy = false,
  danger = false,
  disabled = false,
}: {
  label: string;
  icon: string;
  colors: Colors;
  onPress: () => void;
  busy?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  const dangerColor = colors.error ?? colors.warning;
  const color = danger ? dangerColor : colors.gold;
  return (
    <TouchableOpacity
      style={[
        styles.actionButton,
        {
          borderColor: danger ? `${dangerColor}55` : colors.goldBorder,
          backgroundColor: danger ? `${dangerColor}12` : `${colors.gold}14`,
          opacity: disabled ? 0.46 : 1,
        },
      ]}
      disabled={disabled}
      onPress={onPress}
      activeOpacity={0.86}
    >
      {busy ? <ActivityIndicator size="small" color={color} /> : <Ionicons name={icon as any} size={14} color={color} />}
      <Text style={[styles.actionText, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
  },
  hero: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(196,138,44,0.10)',
  },
  heroText: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  refreshButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  warningCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    gap: 10,
  },
  warningTextWrap: {
    flex: 1,
    gap: 3,
  },
  warningText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  emptyCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 18,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '900',
  },
  emptyText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  reportCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },
  reportHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  reportTitleWrap: {
    flex: 1,
    gap: 3,
  },
  reportTitle: {
    fontSize: 15,
    fontWeight: '900',
  },
  reportMeta: {
    fontSize: 10.5,
    lineHeight: 15,
    fontWeight: '700',
  },
  statusPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 5,
    maxWidth: 150,
  },
  statusText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  detailTile: {
    flexBasis: '48%',
    flexGrow: 1,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 7,
    backgroundColor: 'rgba(255,255,255,0.035)',
    gap: 3,
  },
  detailTileWide: {
    flexBasis: '100%',
  },
  detailLabel: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  detailValue: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  notice: {
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.035)',
  },
  noticeText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  detailsButton: {
    minHeight: 36,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  detailsButtonText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  detailsPanel: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 10,
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.025)',
  },
  mapPreview: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: 'rgba(196,138,44,0.07)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    gap: 8,
  },
  mapPreviewText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  badge: {
    minHeight: 28,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  badgeText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  section: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    gap: 4,
  },
  sectionTitle: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  sectionText: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
  },
  photoPreviewRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  photoPreviewTile: {
    width: 118,
    minHeight: 92,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  photoPreviewImage: {
    width: 96,
    height: 58,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  photoPreviewText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  notesInput: {
    minHeight: 64,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    lineHeight: 16,
    backgroundColor: 'rgba(255,255,255,0.035)',
    textAlignVertical: 'top',
  },
  confidenceRow: {
    flexDirection: 'row',
    gap: 8,
  },
  confidenceButton: {
    minHeight: 32,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  confidenceText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionButton: {
    minHeight: 34,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
    flexGrow: 1,
  },
  actionText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
});
