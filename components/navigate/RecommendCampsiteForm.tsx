import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL, TYPO } from '../../lib/theme';
import {
  buildCampsiteReportInputFromForm,
  CAMPSITE_CELL_SIGNAL_OPTIONS,
  CAMPSITE_FLATNESS_OPTIONS,
  CAMPSITE_PRIVACY_OPTIONS,
  CAMPSITE_TURNAROUND_OPTIONS,
  CAMPSITE_VEHICLE_FIT_OPTIONS,
  createDefaultCampsiteRecommendationFormState,
  type CampsiteRecommendationFormState,
  type CampsiteRecommendationLocationInput,
  type CampsiteVehicleFitOption,
  validateCampsiteRecommendationForm,
} from '../../lib/campsites/campsiteRecommendationForm';
import {
  CAMP_SITE_ACCESS_DIFFICULTIES,
  CAMP_SITE_TYPES,
  type CampSiteAccessDifficulty,
  type CampSiteType,
  type CampSiteVisibility,
} from '../../lib/campsites/campsiteRecommendationTypes';
import {
  campsiteRecommendationService,
  type CampSitePhotoResponse,
  type CampSiteReportResponse,
  type CampsiteServiceResult,
  type CreateCampSiteReportInput,
} from '../../lib/campsites/campsiteRecommendationService';
import {
  campSiteGroupSharingService,
  type CampSiteGroupListItem,
  type CampSiteGroupServiceResult,
  type GroupCampSiteItem,
} from '../../lib/campsites/campsiteGroupSharingService';
import {
  canUseCampsitePhotoPicker,
  uploadCampsitePhotoForReport,
  validateCampsitePhotoFile,
  type CampsitePhotoUploadCandidate,
} from '../../lib/campsites/campsitePhotoUpload';
import {
  getCampsiteOfflineStatusLabel,
  initializeCampsiteOfflineSync,
  subscribeOfflineCampsiteSubmissions,
  submitCampsiteReportOfflineSafe,
} from '../../lib/campsites/campsiteOfflineQueue';
import {
  DEFAULT_COMMUNITY_CAMPSITES_ROLLOUT_CONFIG,
  isCommunityCampsitesFeatureEnabled,
} from '../../lib/communityCampsitesRolloutConfig';

type CampsiteReportSubmitter = {
  createCampsiteReport(
    input: CreateCampSiteReportInput,
  ): Promise<CampsiteServiceResult<CampSiteReportResponse>>;
  attachPhotoToReport?(
    input: {
      camp_site_report_id: string;
      storage_url: string;
      thumbnail_url?: string | null;
      exif_stripped: boolean;
    },
  ): Promise<CampsiteServiceResult<CampSitePhotoResponse>>;
};

type CampsiteGroupSubmitter = {
  listMyCampSiteGroups(): Promise<CampSiteGroupServiceResult<CampSiteGroupListItem[]>>;
  createCampSiteGroup(name: string): Promise<CampSiteGroupServiceResult<CampSiteGroupListItem>>;
  shareCampSiteReportToGroup(
    campSiteReportId: string,
    groupId: string,
  ): Promise<CampSiteGroupServiceResult<GroupCampSiteItem>>;
};

interface Props {
  location: CampsiteRecommendationLocationInput;
  onAdjustPin?: () => void;
  onSubmitted?: (result: { visibility: CampSiteVisibility; report: CampSiteReportResponse }) => void;
  service?: CampsiteReportSubmitter;
  groupService?: CampsiteGroupSubmitter;
}

const VERIFICATION_OPTIONS: {
  key: CampsiteRecommendationFormState['verification'];
  label: string;
}[] = [
  { key: 'stayed', label: 'Yes, I stayed here' },
  { key: 'verified', label: 'I verified it in person' },
  { key: 'planning', label: 'I am suggesting it from planning/route data' },
];

const VISIBILITY_OPTIONS: { key: CampSiteVisibility; label: string; disabled?: boolean }[] = [
  { key: 'private', label: 'Save privately' },
  { key: 'group', label: 'Share with group' },
  { key: 'community', label: 'Submit to ECS Community Review' },
];

function formatOptionLabel(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function RecommendCampsiteForm({
  location,
  onAdjustPin,
  onSubmitted,
  service = campsiteRecommendationService,
  groupService = campSiteGroupSharingService,
}: Props) {
  const [form, setForm] = useState(createDefaultCampsiteRecommendationFormState);
  const [errors, setErrors] = useState<string[]>([]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submittedVisibility, setSubmittedVisibility] = useState<CampSiteVisibility | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [photoCandidates, setPhotoCandidates] = useState<CampsitePhotoUploadCandidate[]>([]);
  const [queuedSubmissionId, setQueuedSubmissionId] = useState<string | null>(null);
  const [groups, setGroups] = useState<CampSiteGroupListItem[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [groupsLoading, setGroupsLoading] = useState(false);
  const campsitePhotosEnabled = isCommunityCampsitesFeatureEnabled(
    DEFAULT_COMMUNITY_CAMPSITES_ROLLOUT_CONFIG,
    'campsitePhotosEnabled',
  );
  const photoPickerAvailable = campsitePhotosEnabled && canUseCampsitePhotoPicker();

  useEffect(() => initializeCampsiteOfflineSync({ service }), [service]);

  useEffect(() => {
    let cancelled = false;
    async function loadGroups() {
      setGroupsLoading(true);
      const result = await groupService.listMyCampSiteGroups();
      if (cancelled) return;
      setGroupsLoading(false);
      if (result.ok) {
        setGroups(result.data);
        setSelectedGroupId((current) => current ?? result.data[0]?.group.id ?? null);
      }
    }
    loadGroups();
    return () => {
      cancelled = true;
    };
  }, [groupService]);

  useEffect(() => {
    if (!queuedSubmissionId) return undefined;
    return subscribeOfflineCampsiteSubmissions((queue) => {
      const submission = queue.find((item) => item.client_submission_id === queuedSubmissionId);
      if (!submission) return;
      const label = getCampsiteOfflineStatusLabel(submission.status);
      if (submission.status === 'sync_failed') {
        setSuccessMessage(`${label}. ${submission.last_error ?? 'Retry when connection improves.'}`);
        return;
      }
      if (submission.status === 'submitted') {
        setSuccessMessage(
          submission.input.visibility_requested === 'community'
            ? 'Submitted for ECS Community Review'
            : label,
        );
        return;
      }
      if (submission.status === 'syncing') {
        setSuccessMessage('Syncing campsite recommendation.');
        return;
      }
      if (submission.status === 'saved_locally') {
        setSuccessMessage(
          submission.photo_count && submission.photo_count > 0
            ? 'Saved locally. Photos will need to be attached after sync.'
            : 'Saved locally.',
        );
        return;
      }
      if (submission.status === 'waiting_to_sync') {
        setSuccessMessage(
          submission.photo_count && submission.photo_count > 0
            ? 'Saved locally. Waiting to sync. Photos will need to be attached after sync.'
            : 'Saved locally. Waiting to sync.',
        );
        return;
      }
      setSuccessMessage(`${label}.`);
    });
  }, [queuedSubmissionId]);

  const updateForm = useCallback((changes: Partial<CampsiteRecommendationFormState>) => {
    setForm((current) => ({ ...current, ...changes }));
    setErrors([]);
    setSuccessMessage(null);
    setSubmittedVisibility(null);
  }, []);

  const toggleVehicleFit = useCallback((value: CampsiteVehicleFitOption) => {
    updateForm({
      vehicle_fit: form.vehicle_fit.includes(value)
        ? form.vehicle_fit.filter((item) => item !== value)
        : [...form.vehicle_fit, value],
    });
  }, [form.vehicle_fit, updateForm]);

  const validation = useMemo(() => validateCampsiteRecommendationForm(form), [form]);

  const addPhotos = useCallback(() => {
    if (!campsitePhotosEnabled) {
      setErrors(['Campsite photo upload is paused for this rollout.']);
      return;
    }

    if (!photoPickerAvailable) {
      setErrors(['Photo upload is available on web builds only in this release.']);
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = (event: any) => {
      const files = Array.from(event.target?.files ?? []) as File[];
      const nextErrors: string[] = [];
      const nextCandidates: CampsitePhotoUploadCandidate[] = [];
      files.forEach((file, index) => {
          const validationError = validateCampsitePhotoFile(file);
          if (validationError) {
            nextErrors.push(`${file.name}: ${validationError}`);
            return;
          }
          nextCandidates.push({
            id: `photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            displayName: `Campsite photo ${photoCandidates.length + index + 1}`,
            file,
            previewUrl: URL.createObjectURL(file),
            size: file.size,
            type: file.type,
          });
        });

      setPhotoCandidates((current) => [...current, ...nextCandidates].slice(0, 6));
      setErrors(nextErrors);
      setSuccessMessage(null);
    };
    input.click();
  }, [campsitePhotosEnabled, photoCandidates.length, photoPickerAvailable]);

  const removePhoto = useCallback((photoId: string) => {
    setPhotoCandidates((current) => {
      const removed = current.find((photo) => photo.id === photoId);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((photo) => photo.id !== photoId);
    });
  }, []);

  const submit = useCallback(async () => {
    const nextValidation = validateCampsiteRecommendationForm(form);
    if (!nextValidation.ok) {
      setErrors(nextValidation.errors);
      return;
    }
    let groupIdForShare = selectedGroupId;
    if (form.visibility_requested === 'group' && !groupIdForShare) {
      if (!newGroupName.trim()) {
        setErrors(['Choose a group or create one before sharing this campsite.']);
        return;
      }
      const groupResult = await groupService.createCampSiteGroup(newGroupName);
      if (!groupResult.ok) {
        setErrors([groupResult.error, ...(groupResult.details ?? [])]);
        return;
      }
      groupIdForShare = groupResult.data.group.id;
      setGroups((current) => [groupResult.data, ...current]);
      setSelectedGroupId(groupIdForShare);
    }

    setSubmitting(true);
    setErrors([]);
    setSuccessMessage(null);
    setSubmittedVisibility(null);
    const payload = buildCampsiteReportInputFromForm(location, form);
    const result = await submitCampsiteReportOfflineSafe(payload, {
      service,
      photoCount: photoCandidates.length,
      photoLocalRefs: photoCandidates
        .map((photo) => photo.previewUrl)
        .filter((ref): ref is string => typeof ref === 'string' && ref.length > 0),
    });

    if (!result.ok) {
      setSubmitting(false);
      setErrors([result.error, ...(result.details ?? [])]);
      return;
    }

    if (result.mode === 'queued') {
      setSubmitting(false);
      setQueuedSubmissionId(result.submission.client_submission_id);
      setSuccessMessage(
        form.visibility_requested === 'group'
          ? 'Saved locally. Waiting to sync. Share with group after sync completes.'
          : photoCandidates.length > 0
            ? 'Saved locally. Waiting to sync. Photos will need to be attached after sync.'
            : 'Saved locally.',
      );
      return;
    }

    const photoErrors: string[] = [];
    if (form.visibility_requested === 'group' && groupIdForShare) {
      const share = await groupService.shareCampSiteReportToGroup(result.report.id, groupIdForShare);
      if (!share.ok) photoErrors.push(share.error);
    }

    if (photoCandidates.length > 0) {
      if (!service.attachPhotoToReport) {
        photoErrors.push('Campsite photo backend is not available.');
      } else {
        for (const photo of photoCandidates) {
          const upload = await uploadCampsitePhotoForReport({
            reportId: result.report.id,
            file: photo.file,
          });
          if (!upload.ok) {
            photoErrors.push(upload.error);
            continue;
          }
          const attach = await service.attachPhotoToReport({
            camp_site_report_id: result.report.id,
            storage_url: upload.storage_url,
            thumbnail_url: upload.thumbnail_url,
            exif_stripped: upload.exif_stripped,
          });
          if (!attach.ok) {
            photoErrors.push(attach.error);
          }
        }
      }
    }

    setSubmitting(false);

    const message =
      form.visibility_requested === 'community'
        ? 'Submitted for ECS Community Review'
        : form.visibility_requested === 'group'
          ? 'Campsite shared with group.'
          : 'Campsite saved privately.';
    setSuccessMessage(message);
    setSubmittedVisibility(form.visibility_requested);
    if (photoErrors.length > 0) {
      setErrors(Array.from(new Set(photoErrors)));
    }
    onSubmitted?.({ visibility: form.visibility_requested, report: result.report });
  }, [
    form,
    groupService,
    location,
    newGroupName,
    onSubmitted,
    photoCandidates,
    selectedGroupId,
    service,
  ]);

  return (
    <View style={styles.container}>
      <View style={styles.coordinateCard}>
        <View>
          <Text style={styles.eyebrow}>SELECTED LOCATION</Text>
          <Text style={styles.coordinateText}>
            {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
          </Text>
          <Text style={styles.helperText}>
            {location.source_type}
            {location.location_accuracy_m != null
              ? ` - ${Math.round(location.location_accuracy_m)}m accuracy`
              : ''}
          </Text>
        </View>
        {onAdjustPin ? (
          <TouchableOpacity style={styles.adjustButton} onPress={onAdjustPin} activeOpacity={0.84}>
            <Ionicons name="pin-outline" size={13} color={TACTICAL.amber} />
            <Text style={styles.adjustButtonText}>ADJUST PIN</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <Section title="Verification">
        {VERIFICATION_OPTIONS.map((option) => (
          <ChoiceRow
            key={option.key}
            label={option.label}
            selected={form.verification === option.key}
            onPress={() => updateForm({ verification: option.key })}
          />
        ))}
      </Section>

      <Section title="Visited At">
        <Text style={styles.helperText}>Optional, but encouraged when you know the date.</Text>
        <TextInput
          style={styles.input}
          value={form.visited_at}
          onChangeText={(visited_at) => updateForm({ visited_at })}
          placeholder="Optional date, e.g. 2026-04-28"
          placeholderTextColor={TACTICAL.textMuted}
        />
      </Section>

      <Section title="Site Type">
        <ChipGrid
          values={CAMP_SITE_TYPES}
          selected={form.site_type}
          onSelect={(site_type) => updateForm({ site_type: site_type as CampSiteType })}
        />
      </Section>

      <Section title="Access Difficulty">
        <ChipGrid
          values={CAMP_SITE_ACCESS_DIFFICULTIES}
          selected={form.access_difficulty}
          onSelect={(access_difficulty) =>
            updateForm({ access_difficulty: access_difficulty as CampSiteAccessDifficulty })
          }
        />
      </Section>

      <Section title="Vehicle Fit">
        <View style={styles.chipGrid}>
          {CAMPSITE_VEHICLE_FIT_OPTIONS.map((option) => {
            const selected = form.vehicle_fit.includes(option);
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
      </Section>

      <Section title="Visibility">
        <View style={styles.chipGrid}>
          {VISIBILITY_OPTIONS.map((option) => {
            const selected = form.visibility_requested === option.key;
            return (
              <TouchableOpacity
                key={option.key}
                style={[
                  styles.chip,
                  selected && styles.chipSelected,
                  option.disabled && styles.disabledChip,
                ]}
                onPress={() => {
                  if (!option.disabled) updateForm({ visibility_requested: option.key });
                }}
                disabled={option.disabled}
                activeOpacity={0.84}
              >
                <Text
                  style={[
                    styles.chipText,
                    selected && styles.chipTextSelected,
                    option.disabled && styles.disabledText,
                  ]}
                >
                  {option.disabled ? `${option.label} - Soon` : option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Section>

      {form.visibility_requested === 'group' ? (
        <Section title="Group">
          <Text style={styles.helperText}>
            Group-shared campsites stay private to selected members and do not enter ECS Community
            Review.
          </Text>
          {groupsLoading ? <Text style={styles.helperText}>Loading groups...</Text> : null}
          {groups.length > 0 ? (
            <View style={styles.chipGrid}>
              {groups.map((item) => {
                const selected = selectedGroupId === item.group.id;
                return (
                  <TouchableOpacity
                    key={item.group.id}
                    style={[styles.chip, selected && styles.chipSelected]}
                    onPress={() => setSelectedGroupId(item.group.id)}
                    activeOpacity={0.84}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                      {item.group.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <Text style={styles.helperText}>No campsite groups yet. Create group to share.</Text>
          )}
          <TextInput
            style={styles.input}
            value={newGroupName}
            onChangeText={setNewGroupName}
            placeholder="Create group"
            placeholderTextColor={TACTICAL.textMuted}
          />
        </Section>
      ) : null}

      {form.visibility_requested === 'community' ? (
        <View style={styles.warningCard}>
          <Text style={styles.warningText}>
            Only submit established, legal, durable campsites. Do not submit private, closed,
            culturally sensitive, wildlife-sensitive, or fragile locations.
          </Text>
          <CheckRow
            label="I believe this is a legal, established campsite."
            checked={form.stewardship_acknowledged}
            onPress={() =>
              updateForm({ stewardship_acknowledged: !form.stewardship_acknowledged })
            }
          />
          <CheckRow
            label="I am not sharing a private, closed, culturally sensitive, wildlife-sensitive, or fragile location."
            checked={form.sensitive_area_acknowledged}
            onPress={() =>
              updateForm({ sensitive_area_acknowledged: !form.sensitive_area_acknowledged })
            }
          />
        </View>
      ) : null}

      <Section title="Optional Details">
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Trailer friendly</Text>
          <Switch
            value={form.trailer_friendly === true}
            onValueChange={(value) => updateForm({ trailer_friendly: value })}
            trackColor={{ false: 'rgba(255,255,255,0.12)', true: 'rgba(196,138,44,0.48)' }}
            thumbColor={form.trailer_friendly ? TACTICAL.amber : TACTICAL.textMuted}
          />
        </View>
        <View style={styles.splitRow}>
          <TextInput
            style={[styles.input, styles.splitInput]}
            value={form.max_rig_length_ft}
            onChangeText={(max_rig_length_ft) => updateForm({ max_rig_length_ft })}
            keyboardType="numeric"
            placeholder="Max rig ft"
            placeholderTextColor={TACTICAL.textMuted}
          />
          <TextInput
            style={[styles.input, styles.splitInput]}
            value={form.max_group_size}
            onChangeText={(max_group_size) => updateForm({ max_group_size })}
            keyboardType="numeric"
            placeholder="Max group"
            placeholderTextColor={TACTICAL.textMuted}
          />
        </View>
        <LabelledChips
          label="Cell Signal"
          values={CAMPSITE_CELL_SIGNAL_OPTIONS}
          selected={form.cell_signal}
          onSelect={(cell_signal) =>
            updateForm({ cell_signal: cell_signal as CampsiteRecommendationFormState['cell_signal'] })
          }
        />
        <AmenityToggles form={form} updateForm={updateForm} />
        <LabelledChips
          label="Flatness"
          values={CAMPSITE_FLATNESS_OPTIONS}
          selected={form.flatness}
          onSelect={(flatness) =>
            updateForm({ flatness: flatness as CampsiteRecommendationFormState['flatness'] })
          }
        />
        <LabelledChips
          label="Privacy"
          values={CAMPSITE_PRIVACY_OPTIONS}
          selected={form.privacy}
          onSelect={(privacy) =>
            updateForm({ privacy: privacy as CampsiteRecommendationFormState['privacy'] })
          }
        />
        <LabelledChips
          label="Turnaround"
          values={CAMPSITE_TURNAROUND_OPTIONS}
          selected={form.turnaround}
          onSelect={(turnaround) =>
            updateForm({ turnaround: turnaround as CampsiteRecommendationFormState['turnaround'] })
          }
        />
        <TextInput
          style={styles.input}
          value={form.seasonal_notes}
          onChangeText={(seasonal_notes) => updateForm({ seasonal_notes })}
          placeholder="Seasonal notes"
          placeholderTextColor={TACTICAL.textMuted}
        />
        <TextInput
          style={[styles.input, styles.multiInput]}
          value={form.notes}
          onChangeText={(notes) => updateForm({ notes })}
          placeholder="Notes"
          placeholderTextColor={TACTICAL.textMuted}
          multiline
        />
      </Section>

      <Section title="Photos">
        <Text style={styles.helperText}>
          Optional. Photos are stripped of metadata before public use. ECS strips photo metadata before upload. Community photos stay pending until review.
        </Text>
        {photoCandidates.length > 0 ? (
          <View style={styles.photoGrid}>
            {photoCandidates.map((photo) => (
              <View key={photo.id} style={styles.photoTile}>
                {photo.previewUrl ? (
                  <Image source={{ uri: photo.previewUrl }} style={styles.photoPreview} />
                ) : (
                  <View style={styles.photoPreviewFallback}>
                    <Ionicons name="image-outline" size={18} color={TACTICAL.textMuted} />
                  </View>
                )}
                <TouchableOpacity
                  style={styles.photoRemoveButton}
                  onPress={() => removePhoto(photo.id)}
                  activeOpacity={0.84}
                >
                  <Ionicons name="close" size={12} color={TACTICAL.text} />
                </TouchableOpacity>
                <Text style={styles.photoName}>{photo.displayName}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <TouchableOpacity
          style={[styles.photoButton, !photoPickerAvailable && styles.photoButtonDisabled]}
          onPress={addPhotos}
          disabled={!photoPickerAvailable}
          activeOpacity={0.84}
        >
          <Ionicons name="images-outline" size={15} color={TACTICAL.amber} />
          <Text style={styles.photoButtonText}>
            {campsitePhotosEnabled
              ? photoPickerAvailable
                ? 'ATTACH PHOTOS'
                : 'PHOTO UPLOAD UNAVAILABLE'
              : 'PHOTO UPLOAD PAUSED'}
          </Text>
        </TouchableOpacity>
      </Section>

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
        <View style={styles.successCard}>
          <Text style={styles.successText}>{successMessage}</Text>
          {submittedVisibility === 'community' ? (
            <Text style={styles.successText}>
              This campsite is pending review and is not visible to the community yet.
            </Text>
          ) : null}
          {submittedVisibility === 'group' ? (
            <Text style={styles.successText}>
              This campsite is visible only to members of the selected group.
            </Text>
          ) : null}
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.submitButton, (!validation.ok || submitting) && styles.submitButtonDisabled]}
        onPress={submit}
        disabled={submitting}
        activeOpacity={0.86}
      >
        {submitting ? (
          <ActivityIndicator size="small" color="#091014" />
        ) : (
          <Text style={styles.submitButtonText}>
            {form.visibility_requested === 'community'
              ? 'SUBMIT FOR ECS REVIEW'
              : form.visibility_requested === 'group'
                ? 'SHARE WITH GROUP'
                : 'SAVE PRIVATE CAMPSITE'}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function ChoiceRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.choiceRow} onPress={onPress} activeOpacity={0.84}>
      <Ionicons
        name={selected ? 'radio-button-on' : 'radio-button-off'}
        size={16}
        color={selected ? TACTICAL.amber : TACTICAL.textMuted}
      />
      <Text style={styles.choiceLabel}>{label}</Text>
    </TouchableOpacity>
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
    <TouchableOpacity style={styles.choiceRow} onPress={onPress} activeOpacity={0.84}>
      <Ionicons
        name={checked ? 'checkbox-outline' : 'square-outline'}
        size={17}
        color={checked ? TACTICAL.amber : TACTICAL.textMuted}
      />
      <Text style={styles.choiceLabel}>{label}</Text>
    </TouchableOpacity>
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
      {values.map((value) => {
        const active = selected === value;
        return (
          <TouchableOpacity
            key={value}
            style={[styles.chip, active && styles.chipSelected]}
            onPress={() => onSelect(value)}
            activeOpacity={0.84}
          >
            <Text style={[styles.chipText, active && styles.chipTextSelected]}>
              {formatOptionLabel(value)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function LabelledChips({
  label,
  values,
  selected,
  onSelect,
}: {
  label: string;
  values: readonly string[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <View style={styles.labelledChips}>
      <Text style={styles.helperText}>{label}</Text>
      <ChipGrid values={values} selected={selected} onSelect={onSelect} />
    </View>
  );
}

function AmenityToggles({
  form,
  updateForm,
}: {
  form: CampsiteRecommendationFormState;
  updateForm: (changes: Partial<CampsiteRecommendationFormState>) => void;
}) {
  const amenities: (keyof Pick<
    CampsiteRecommendationFormState,
    'fire_ring' | 'toilet' | 'water_nearby' | 'trash' | 'shade'
  >)[] = ['fire_ring', 'toilet', 'water_nearby', 'trash', 'shade'];
  return (
    <View style={styles.chipGrid}>
      {amenities.map((key) => {
        const selected = Boolean(form[key]);
        return (
          <TouchableOpacity
            key={key}
            style={[styles.chip, selected && styles.chipSelected]}
            onPress={() => updateForm({ [key]: !selected })}
            activeOpacity={0.84}
          >
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
              {formatOptionLabel(key)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  coordinateCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.18)',
    backgroundColor: 'rgba(18,24,29,0.9)',
    padding: 12,
    gap: 10,
  },
  eyebrow: {
    ...TYPO.U2,
    color: TACTICAL.amber,
    fontSize: 9,
    letterSpacing: 1.2,
  },
  coordinateText: {
    ...TYPO.T3,
    color: TACTICAL.text,
    fontSize: 14,
  },
  helperText: {
    ...TYPO.B2,
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 14,
  },
  adjustButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.22)',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  adjustButtonText: {
    ...TYPO.U2,
    color: TACTICAL.amber,
    fontSize: 8,
    letterSpacing: 1,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    ...TYPO.U2,
    color: TACTICAL.textMuted,
    fontSize: 9,
    letterSpacing: 1.2,
  },
  choiceRow: {
    minHeight: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.14)',
    backgroundColor: 'rgba(255,255,255,0.035)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  choiceLabel: {
    ...TYPO.B2,
    color: TACTICAL.text,
    fontSize: 11,
    lineHeight: 15,
    flex: 1,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.18)',
    backgroundColor: 'rgba(18,24,29,0.9)',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  chipSelected: {
    backgroundColor: 'rgba(196,138,44,0.92)',
    borderColor: 'rgba(255,220,140,0.35)',
  },
  chipText: {
    ...TYPO.U2,
    color: TACTICAL.text,
    fontSize: 8.5,
    letterSpacing: 0.8,
  },
  chipTextSelected: {
    color: '#091014',
  },
  disabledChip: {
    opacity: 0.48,
  },
  disabledText: {
    color: TACTICAL.textMuted,
  },
  warningCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(236,178,84,0.28)',
    backgroundColor: 'rgba(236,178,84,0.08)',
    padding: 12,
    gap: 8,
  },
  warningText: {
    ...TYPO.B2,
    color: TACTICAL.text,
    fontSize: 11,
    lineHeight: 16,
  },
  input: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.16)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    color: TACTICAL.text,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 12,
  },
  multiInput: {
    minHeight: 82,
    textAlignVertical: 'top',
  },
  splitRow: {
    flexDirection: 'row',
    gap: 8,
  },
  splitInput: {
    flex: 1,
  },
  switchRow: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.14)',
    backgroundColor: 'rgba(255,255,255,0.035)',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchLabel: {
    ...TYPO.B2,
    color: TACTICAL.text,
    fontSize: 11,
  },
  labelledChips: {
    gap: 6,
  },
  errorCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,92,92,0.35)',
    backgroundColor: 'rgba(255,92,92,0.08)',
    padding: 10,
    gap: 4,
  },
  errorText: {
    ...TYPO.B2,
    color: '#ffb4a8',
    fontSize: 11,
    lineHeight: 15,
  },
  successCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(101,240,212,0.26)',
    backgroundColor: 'rgba(101,240,212,0.08)',
    padding: 10,
  },
  successText: {
    ...TYPO.B2,
    color: '#65F0D4',
    fontSize: 11,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  photoTile: {
    width: 92,
    gap: 5,
    position: 'relative',
  },
  photoPreview: {
    width: 92,
    height: 68,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  photoPreviewFallback: {
    width: 92,
    height: 68,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  photoRemoveButton: {
    position: 'absolute',
    right: 4,
    top: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  photoName: {
    ...TYPO.B2,
    color: TACTICAL.textMuted,
    fontSize: 9,
    lineHeight: 12,
  },
  photoButton: {
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.24)',
    backgroundColor: 'rgba(196,138,44,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
  },
  photoButtonDisabled: {
    opacity: 0.48,
  },
  photoButtonText: {
    ...TYPO.U2,
    color: TACTICAL.amber,
    fontSize: 8.5,
    letterSpacing: 1,
  },
  submitButton: {
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: 'rgba(196,138,44,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  submitButtonDisabled: {
    opacity: 0.72,
  },
  submitButtonText: {
    ...TYPO.U2,
    color: '#091014',
    fontSize: 9,
    letterSpacing: 1.1,
  },
});
