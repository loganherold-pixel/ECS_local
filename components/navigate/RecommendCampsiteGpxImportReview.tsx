import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import {
  CAMPSITE_VEHICLE_FIT_OPTIONS,
  type CampsiteRecommendationFormState,
  type CampsiteVehicleFitOption,
} from '../../lib/campsites/campsiteRecommendationForm';
import {
  buildCampsiteReportInputFromGpxCandidate,
  type GpxCampsiteCandidate,
  type GpxCampsiteImportResult,
} from '../../lib/campsites/gpxCampsiteImport';
import {
  campsiteRecommendationService,
  type CampSiteReportResponse,
  type CampsiteServiceResult,
  type CreateCampSiteReportInput,
} from '../../lib/campsites/campsiteRecommendationService';
import {
  CAMP_SITE_ACCESS_DIFFICULTIES,
  CAMP_SITE_TYPES,
  type CampSiteAccessDifficulty,
  type CampSiteType,
  type CampSiteVisibility,
} from '../../lib/campsites/campsiteRecommendationTypes';

type CampsiteReportSubmitter = {
  createCampsiteReport(
    input: CreateCampSiteReportInput,
  ): Promise<CampsiteServiceResult<CampSiteReportResponse>>;
};

interface Props {
  imported: GpxCampsiteImportResult;
  onBack?: () => void;
  onSubmitted?: (result: { visibility: CampSiteVisibility; count: number }) => void;
  onSelectRoutePoint?: (input: {
    candidateType: 'route_selected_point' | 'track_selected_point';
    sourceRouteName?: string | null;
    sourceTrackName?: string | null;
    sourceSegmentIndex?: number | null;
  }) => void;
  service?: CampsiteReportSubmitter;
}

const VERIFICATION_OPTIONS: {
  key: CampsiteRecommendationFormState['verification'];
  label: string;
}[] = [
  { key: 'stayed', label: 'Yes, I stayed here' },
  { key: 'verified', label: 'I verified it in person' },
  { key: 'planning', label: 'I am suggesting it from planning/route data' },
];

function formatCoordinate(value: number): string {
  return value.toFixed(5);
}

function formatOptionLabel(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function RecommendCampsiteGpxImportReview({
  imported,
  onBack,
  onSubmitted,
  onSelectRoutePoint,
  service = campsiteRecommendationService,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>(
    imported.candidates.length === 1 ? [imported.candidates[0].id] : [],
  );
  const [verification, setVerification] = useState<CampsiteRecommendationFormState['verification']>('planning');
  const [visitedAt, setVisitedAt] = useState('');
  const [siteType, setSiteType] = useState<CampSiteType>('unknown');
  const [accessDifficulty, setAccessDifficulty] = useState<CampSiteAccessDifficulty>('high_clearance');
  const [vehicleFit, setVehicleFit] = useState<string[]>([]);
  const [stewardshipAcknowledged, setStewardshipAcknowledged] = useState(false);
  const [sensitiveAreaAcknowledged, setSensitiveAreaAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState<CampSiteVisibility | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [successVisibility, setSuccessVisibility] = useState<CampSiteVisibility | null>(null);

  const selectedCandidates = useMemo(
    () => imported.candidates.filter((candidate) => selectedIds.includes(candidate.id)),
    [imported.candidates, selectedIds],
  );

  const hasRouteOrTrack = imported.routeCount > 0 || imported.trackCount > 0 || imported.routePointCount > 0 || imported.trackPointCount > 0;

  const clearFeedback = useCallback(() => {
    setErrors([]);
    setSuccessMessage(null);
    setSuccessVisibility(null);
  }, []);

  const toggleCandidate = useCallback((candidate: GpxCampsiteCandidate) => {
    setSelectedIds((current) =>
      current.includes(candidate.id)
        ? current.filter((id) => id !== candidate.id)
        : [...current, candidate.id],
    );
    clearFeedback();
  }, [clearFeedback]);

  const toggleVehicleFit = useCallback((value: CampsiteVehicleFitOption) => {
    setVehicleFit((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
    clearFeedback();
  }, [clearFeedback]);

  const submitSelected = useCallback(
    async (visibility: Extract<CampSiteVisibility, 'private' | 'community'>) => {
      if (selectedCandidates.length === 0) {
        setErrors(['Select at least one GPX waypoint candidate.']);
        return;
      }
      if (visibility === 'community' && (!stewardshipAcknowledged || !sensitiveAreaAcknowledged)) {
        setErrors([
          'Community submissions require stewardship and sensitive-area acknowledgements.',
        ]);
        return;
      }

      setSubmitting(visibility);
      setErrors([]);
      setSuccessMessage(null);
      setSuccessVisibility(null);

      const failures: string[] = [];
      let savedCount = 0;
      for (const candidate of selectedCandidates) {
        const payload = buildCampsiteReportInputFromGpxCandidate(candidate, visibility, {
          stewardship_acknowledged: stewardshipAcknowledged,
          sensitive_area_acknowledged: sensitiveAreaAcknowledged,
          user_stayed_here: verification === 'stayed',
          verified_in_person: verification === 'stayed' || verification === 'verified',
          visited_at: visitedAt.trim() || null,
          site_type: siteType,
          access_difficulty: accessDifficulty,
          vehicle_fit: vehicleFit,
        });
        const result = await service.createCampsiteReport(payload);
        if (result.ok) {
          savedCount += 1;
        } else {
          failures.push(result.error);
        }
      }

      setSubmitting(null);

      if (failures.length > 0) {
        setErrors(Array.from(new Set(failures)));
        return;
      }

      const message =
        visibility === 'community'
          ? 'Submitted for ECS review.'
          : 'Campsite saved privately.';
      setSuccessMessage(message);
      setSuccessVisibility(visibility);
      onSubmitted?.({ visibility, count: savedCount });
    },
    [
      accessDifficulty,
      onSubmitted,
      selectedCandidates,
      sensitiveAreaAcknowledged,
      service,
      siteType,
      stewardshipAcknowledged,
      vehicleFit,
      verification,
      visitedAt,
    ],
  );

  return (
    <View style={styles.container}>
      <View style={styles.summaryCard}>
        <View style={styles.summaryIcon}>
          <Ionicons name="cloud-upload-outline" size={18} color={TACTICAL.amber} />
        </View>
        <View style={styles.summaryText}>
          <Text style={styles.eyebrow}>GPX IMPORT</Text>
          <Text style={styles.title}>Import GPX</Text>
          <Text style={styles.helperText}>
            Imported GPX data stays private unless you choose specific campsite candidates to save or submit.
          </Text>
        </View>
      </View>

      <View style={styles.noticeCard}>
        <Ionicons name="lock-closed-outline" size={14} color={TACTICAL.textMuted} />
        <Text style={styles.noticeText}>
          GPX imports may contain complete travel history. ECS keeps the import private unless you choose specific points to share.
        </Text>
      </View>

      <View style={styles.summaryGrid}>
        <SummaryStat label="Waypoints" value={String(imported.waypointCount)} />
        <SummaryStat label="Routes" value={String(imported.routeCount)} />
        <SummaryStat label="Tracks" value={String(imported.trackCount)} />
      </View>

      {hasRouteOrTrack ? (
        <View style={styles.noticeCard}>
          <Ionicons name="trail-sign-outline" size={14} color={TACTICAL.textMuted} />
          <Text style={styles.noticeText}>
            Route and track points are not campsites by default. Select only verified campsite locations.
          </Text>
        </View>
      ) : null}

      {hasRouteOrTrack ? (
        <View style={styles.geometryCard}>
          <Text style={styles.sectionTitle}>Route / track geometry</Text>
          <Text style={styles.helperText}>
            Geometry preview is available for manual selection. This creates a campsite candidate only. It will not be public unless submitted and approved.
          </Text>

          {imported.routes.length > 0 ? (
            <View style={styles.geometryList}>
              {imported.routes.map((route, index) => (
                <GeometryRow
                  key={`route-${index}`}
                  title={route.name || `Route ${index + 1}`}
                  subtitle={`${route.points.length} preview points`}
                  icon="git-branch-outline"
                  actionLabel="ADD CAMPSITE CANDIDATE FROM ROUTE"
                  onPress={
                    onSelectRoutePoint
                      ? () =>
                          onSelectRoutePoint({
                            candidateType: 'route_selected_point',
                            sourceRouteName: route.name,
                          })
                      : undefined
                  }
                />
              ))}
            </View>
          ) : null}

          {imported.tracks.length > 0 ? (
            <View style={styles.geometryList}>
              {imported.tracks.map((track, index) => {
                const segmentCount = track.segments.length;
                const pointCount = track.segments.reduce((total, segment) => total + segment.points.length, 0);
                return (
                  <GeometryRow
                    key={`track-${index}`}
                    title={track.name || `Track ${index + 1}`}
                    subtitle={`${segmentCount} segment${segmentCount === 1 ? '' : 's'} / ${pointCount} preview points`}
                    icon="analytics-outline"
                    actionLabel="ADD CAMPSITE CANDIDATE FROM TRACK"
                    onPress={
                      onSelectRoutePoint
                        ? () =>
                            onSelectRoutePoint({
                              candidateType: 'track_selected_point',
                              sourceTrackName: track.name,
                              sourceSegmentIndex: track.segments[0]?.segmentIndex ?? 0,
                            })
                        : undefined
                    }
                  />
                );
              })}
            </View>
          ) : null}
        </View>
      ) : null}

      {imported.candidates.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No GPX waypoints found</Text>
          <Text style={styles.helperText}>
            Route and track geometry can still guide pin placement, but campsite submissions must
            start from a selected point.
          </Text>
          {onBack ? (
            <TouchableOpacity style={styles.secondaryButton} onPress={onBack} activeOpacity={0.84}>
              <Text style={styles.secondaryButtonText}>CHOOSE ANOTHER SOURCE</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        <View style={styles.candidateList}>
          {imported.candidates.map((candidate, index) => {
            const selected = selectedIds.includes(candidate.id);
            return (
              <TouchableOpacity
                key={candidate.id}
                style={[styles.candidateRow, selected && styles.candidateRowSelected]}
                onPress={() => toggleCandidate(candidate)}
                activeOpacity={0.84}
              >
                <View style={[styles.checkBox, selected && styles.checkBoxSelected]}>
                  {selected ? (
                    <Ionicons name="checkmark" size={14} color={TACTICAL.bg} />
                  ) : null}
                </View>
                <View style={styles.candidateText}>
                  <Text style={styles.candidateName}>
                    {candidate.name || `Waypoint ${index + 1}`}
                  </Text>
                  <Text style={styles.coordinateText}>
                    {formatCoordinate(candidate.latitude)}, {formatCoordinate(candidate.longitude)}
                  </Text>
                  {candidate.description ? (
                    <Text style={styles.descriptionText}>{candidate.description}</Text>
                  ) : null}
                  <Text style={styles.sourceText}>source_type = {candidate.source_type}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {imported.candidates.length > 0 ? (
        <View style={styles.formSection}>
          <Text style={styles.sectionTitle}>Campsite details for selected waypoints</Text>
          <Text style={styles.helperText}>
            Apply the same required campsite fields before saving privately or submitting to ECS Community Review.
          </Text>

          <Text style={styles.fieldLabel}>Verification</Text>
          <View style={styles.chipGrid}>
            {VERIFICATION_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.key}
                style={[styles.chip, verification === option.key && styles.chipSelected]}
                onPress={() => {
                  setVerification(option.key);
                  clearFeedback();
                }}
                activeOpacity={0.84}
              >
                <Text style={[styles.chipText, verification === option.key && styles.chipTextSelected]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Visited date</Text>
          <TextInput
            style={styles.input}
            value={visitedAt}
            onChangeText={(value) => {
              setVisitedAt(value);
              clearFeedback();
            }}
            placeholder="Optional date, e.g. 2026-04-28"
            placeholderTextColor={TACTICAL.textMuted}
          />

          <Text style={styles.fieldLabel}>Site type</Text>
          <ChipGrid
            values={CAMP_SITE_TYPES}
            selected={siteType}
            onSelect={(value) => {
              setSiteType(value as CampSiteType);
              clearFeedback();
            }}
          />

          <Text style={styles.fieldLabel}>Access difficulty</Text>
          <ChipGrid
            values={CAMP_SITE_ACCESS_DIFFICULTIES}
            selected={accessDifficulty}
            onSelect={(value) => {
              setAccessDifficulty(value as CampSiteAccessDifficulty);
              clearFeedback();
            }}
          />

          <Text style={styles.fieldLabel}>Vehicle fit</Text>
          <View style={styles.chipGrid}>
            {CAMPSITE_VEHICLE_FIT_OPTIONS.map((option) => {
              const selected = vehicleFit.includes(option);
              return (
                <TouchableOpacity
                  key={option}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => toggleVehicleFit(option)}
                  activeOpacity={0.84}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {formatOptionLabel(option)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ) : null}

      {imported.candidates.length > 0 ? (
        <View style={styles.communityCard}>
          <Text style={styles.warningText}>
            Only submit established, legal, durable campsites. Do not submit private, closed,
            culturally sensitive, wildlife-sensitive, or fragile locations.
          </Text>
          <CheckRow
            label="I believe this is a legal, established campsite."
            checked={stewardshipAcknowledged}
            onPress={() => {
              setStewardshipAcknowledged((value) => !value);
              clearFeedback();
            }}
          />
          <CheckRow
            label="I am not sharing a private, closed, culturally sensitive, wildlife-sensitive, or fragile location."
            checked={sensitiveAreaAcknowledged}
            onPress={() => {
              setSensitiveAreaAcknowledged((value) => !value);
              clearFeedback();
            }}
          />
        </View>
      ) : null}

      {errors.length > 0 ? (
        <View style={styles.errorCard}>
          {errors.map((error) => (
            <Text key={error} style={styles.errorText}>
              {error}
            </Text>
          ))}
        </View>
      ) : null}

      {successMessage ? (
        <View>
          <Text style={styles.successText}>{successMessage}</Text>
          {successVisibility === 'community' ? (
            <Text style={styles.successText}>
              This campsite is pending review and is not visible to the community yet.
            </Text>
          ) : null}
        </View>
      ) : null}

      {imported.candidates.length > 0 ? (
        <View style={styles.actionGrid}>
          <TouchableOpacity
            style={[styles.submitButton, submitting !== null && styles.disabledButton]}
            onPress={() => submitSelected('private')}
            disabled={submitting !== null}
            activeOpacity={0.84}
          >
            {submitting === 'private' ? (
              <ActivityIndicator size="small" color={TACTICAL.bg} />
            ) : (
              <Ionicons name="lock-closed-outline" size={15} color={TACTICAL.bg} />
            )}
            <Text style={styles.submitButtonText}>SAVE PRIVATELY</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.submitButton, styles.groupButton, styles.disabledButton]}
            disabled
            activeOpacity={0.84}
          >
            <Ionicons name="people-outline" size={15} color={TACTICAL.textMuted} />
            <Text style={[styles.submitButtonText, styles.disabledSubmitText]}>SHARE WITH GROUP</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.submitButton, styles.communityButton, submitting !== null && styles.disabledButton]}
            onPress={() => submitSelected('community')}
            disabled={submitting !== null}
            activeOpacity={0.84}
          >
            {submitting === 'community' ? (
              <ActivityIndicator size="small" color={TACTICAL.bg} />
            ) : (
              <Ionicons name="shield-checkmark-outline" size={15} color={TACTICAL.bg} />
            )}
            <Text style={styles.submitButtonText}>SUBMIT TO ECS COMMUNITY REVIEW</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {onBack ? (
        <TouchableOpacity style={styles.secondaryButton} onPress={onBack} activeOpacity={0.84}>
          <Ionicons name="chevron-back-outline" size={14} color={TACTICAL.textMuted} />
          <Text style={styles.secondaryButtonText}>BACK TO SOURCE OPTIONS</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryStat}>
      <Text style={styles.summaryStatValue}>{value}</Text>
      <Text style={styles.summaryStatLabel}>{label}</Text>
    </View>
  );
}

function GeometryRow({
  title,
  subtitle,
  icon,
  actionLabel,
  onPress,
}: {
  title: string;
  subtitle: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  actionLabel: string;
  onPress?: () => void;
}) {
  return (
    <View style={styles.geometryRow}>
      <View style={styles.geometryRowHeader}>
        <Ionicons name={icon} size={15} color={TACTICAL.amber} />
        <View style={styles.geometryText}>
          <Text style={styles.candidateName}>{title}</Text>
          <Text style={styles.sourceText}>{subtitle}</Text>
        </View>
      </View>
      {onPress ? (
        <TouchableOpacity style={styles.inlineAction} onPress={onPress} activeOpacity={0.84}>
          <Text style={styles.inlineActionText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function ChipGrid({
  values,
  selected,
  onSelect,
}: {
  values: readonly string[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <View style={styles.chipGrid}>
      {values.map((value) => (
        <TouchableOpacity
          key={value}
          style={[styles.chip, selected === value && styles.chipSelected]}
          onPress={() => onSelect(value)}
          activeOpacity={0.84}
        >
          <Text style={[styles.chipText, selected === value && styles.chipTextSelected]}>
            {formatOptionLabel(value)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function CheckRow({
  label,
  checked,
  onPress,
}: {
  label: string;
  checked: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.checkRow} onPress={onPress} activeOpacity={0.84}>
      <View style={[styles.checkBox, checked && styles.checkBoxSelected]}>
        {checked ? <Ionicons name="checkmark" size={14} color={TACTICAL.bg} /> : null}
      </View>
      <Text style={styles.checkLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  summaryCard: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.16)',
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  summaryIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(196, 138, 44, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.24)',
  },
  summaryText: {
    flex: 1,
    gap: 3,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: TACTICAL.textMuted,
  },
  title: {
    fontSize: 13,
    fontWeight: '900',
    color: TACTICAL.text,
  },
  helperText: {
    fontSize: 11,
    lineHeight: 15,
    color: TACTICAL.textMuted,
  },
  noticeCard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  noticeText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 14,
    color: TACTICAL.textMuted,
  },
  inlineAction: {
    width: '100%',
    minHeight: 30,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.36)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  inlineActionText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
    color: TACTICAL.amber,
  },
  geometryCard: {
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.14)',
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  geometryList: {
    gap: 8,
  },
  geometryRow: {
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  geometryRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  geometryText: {
    flex: 1,
    gap: 2,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  summaryStat: {
    flex: 1,
    minHeight: 56,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: 'rgba(255,255,255,0.035)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  summaryStatValue: {
    fontSize: 18,
    fontWeight: '900',
    color: TACTICAL.text,
  },
  summaryStatLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
    color: TACTICAL.textMuted,
    textTransform: 'uppercase',
  },
  emptyCard: {
    gap: 8,
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.14)',
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: TACTICAL.text,
  },
  candidateList: {
    gap: 8,
  },
  candidateRow: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.14)',
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  candidateRowSelected: {
    borderColor: TACTICAL.amber,
    backgroundColor: 'rgba(196, 138, 44, 0.08)',
  },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  checkBoxSelected: {
    backgroundColor: TACTICAL.amber,
    borderColor: TACTICAL.amber,
  },
  candidateText: {
    flex: 1,
    gap: 3,
  },
  candidateName: {
    fontSize: 12,
    fontWeight: '900',
    color: TACTICAL.text,
  },
  coordinateText: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
  },
  descriptionText: {
    fontSize: 10,
    lineHeight: 14,
    color: TACTICAL.text,
  },
  sourceText: {
    fontSize: 9,
    color: TACTICAL.textMuted,
  },
  formSection: {
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.14)',
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: TACTICAL.text,
  },
  fieldLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: TACTICAL.textMuted,
    marginTop: 2,
  },
  input: {
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    color: TACTICAL.text,
    paddingHorizontal: 10,
    fontSize: 12,
    backgroundColor: 'rgba(255,255,255,0.035)',
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    minHeight: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.035)',
  },
  chipSelected: {
    borderColor: TACTICAL.amber,
    backgroundColor: 'rgba(196, 138, 44, 0.16)',
  },
  chipText: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.textMuted,
  },
  chipTextSelected: {
    color: TACTICAL.amber,
  },
  communityCard: {
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(196, 138, 44, 0.07)',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.22)',
  },
  warningText: {
    fontSize: 11,
    lineHeight: 15,
    color: TACTICAL.text,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkLabel: {
    flex: 1,
    fontSize: 11,
    color: TACTICAL.text,
  },
  errorCard: {
    gap: 3,
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.28)',
  },
  errorText: {
    fontSize: 11,
    color: TACTICAL.danger,
  },
  successText: {
    fontSize: 12,
    fontWeight: '800',
    color: TACTICAL.success,
  },
  actionGrid: {
    gap: 8,
  },
  submitButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: TACTICAL.amber,
  },
  communityButton: {
    backgroundColor: TACTICAL.success,
  },
  groupButton: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  disabledButton: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 11,
    fontWeight: '900',
    color: TACTICAL.bg,
    letterSpacing: 0.8,
  },
  disabledSubmitText: {
    color: TACTICAL.textMuted,
  },
  secondaryButton: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: 'rgba(0,0,0,0.10)',
  },
  secondaryButtonText: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 0.8,
  },
});
