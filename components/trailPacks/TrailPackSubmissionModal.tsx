import React, { useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import TacticalPopupShell from '../TacticalPopupShell';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { ECS, TACTICAL } from '../../lib/theme';
import { hapticCommand, hapticMicro } from '../../lib/haptics';
import {
  TRAIL_PACK_SUBMISSION_CERTIFICATION_COPY,
  TRAIL_PACK_SUBMISSION_TAG_OPTIONS,
  detectTrailPackPrivacyWarnings,
  trailPackSubmissionStore,
  validateTrailPackSubmission,
  type ECSTrailPackSubmission,
  type ECSTrailPackSubmissionFormValues,
  type ECSTrailPackSubmissionRouteInput,
  type ECSTrailPackSubmissionTag,
} from '../../lib/explore/trailPackSubmissions';
import type {
  ECSTrailPackCoordinate,
  ECSTrailPackDifficulty,
  ECSTrailPackRouteType,
} from '../../lib/explore/trailPacks';

type Props = {
  visible: boolean;
  routeInput: ECSTrailPackSubmissionRouteInput | null;
  currentLocation?: ECSTrailPackCoordinate | null;
  onClose: () => void;
  onSubmitted?: (submission: ECSTrailPackSubmission) => void;
};

const DIFFICULTY_OPTIONS: { key: ECSTrailPackDifficulty; label: string }[] = [
  { key: 'easy', label: 'Easy' },
  { key: 'moderate', label: 'Moderate' },
  { key: 'technical', label: 'Technical' },
  { key: 'extreme', label: 'Extreme' },
];

const ROUTE_TYPE_OPTIONS: { key: ECSTrailPackRouteType; label: string }[] = [
  { key: 'loop', label: 'Loop' },
  { key: 'out_and_back', label: 'Out-and-back' },
  { key: 'point_to_point', label: 'Point-to-point' },
  { key: 'area_pack', label: 'Area pack' },
];

function buildInitialValues(routeInput: ECSTrailPackSubmissionRouteInput | null): ECSTrailPackSubmissionFormValues {
  return {
    name: routeInput?.title ?? '',
    description: routeInput?.subtitle ?? '',
    difficulty: routeInput?.difficulty && routeInput.difficulty !== 'unknown'
      ? routeInput.difficulty
      : 'moderate',
    vehicleUsed: '',
    recommendedVehicleType: '',
    routeType: routeInput?.routeType && routeInput.routeType !== 'unknown'
      ? routeInput.routeType
      : 'point_to_point',
    seasonNotes: '',
    hazardNotes: '',
    acknowledgesPrivateLandOrClosures: false,
    certifiesPermissionToShare: false,
    tags: [],
  };
}

function formatRouteMeta(routeInput: ECSTrailPackSubmissionRouteInput | null): string {
  if (!routeInput) return 'Route unavailable';
  const parts = [
    routeInput.distanceMiles != null ? `${Math.round(routeInput.distanceMiles * 10) / 10} mi` : null,
    routeInput.routeGeometry.length > 0 ? `${routeInput.routeGeometry.length} pts` : 'No geometry',
    routeInput.sourceFormat ? routeInput.sourceFormat.toUpperCase() : null,
  ];
  return parts.filter(Boolean).join(' | ');
}

export default function TrailPackSubmissionModal({
  visible,
  routeInput,
  currentLocation,
  onClose,
  onSubmitted,
}: Props) {
  const [values, setValues] = useState<ECSTrailPackSubmissionFormValues>(() => buildInitialValues(routeInput));
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (visible) {
      setValues(buildInitialValues(routeInput));
      setErrors([]);
    }
  }, [routeInput, visible]);

  const privacyWarnings = useMemo(
    () => detectTrailPackPrivacyWarnings(routeInput, currentLocation),
    [currentLocation, routeInput],
  );
  const routeHasGeometry = !!routeInput && routeInput.routeGeometry.length >= 2;

  const update = <K extends keyof ECSTrailPackSubmissionFormValues>(
    key: K,
    value: ECSTrailPackSubmissionFormValues[K],
  ) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const toggleTag = (tag: ECSTrailPackSubmissionTag) => {
    hapticMicro();
    setValues((prev) => ({
      ...prev,
      tags: prev.tags.includes(tag)
        ? prev.tags.filter((item) => item !== tag)
        : [...prev.tags, tag],
    }));
  };

  const handleSubmit = () => {
    hapticCommand();
    const validationErrors = validateTrailPackSubmission(routeInput, values);
    if (!routeInput || validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    try {
      const result = trailPackSubmissionStore.submit(routeInput, values, { currentLocation });
      onSubmitted?.(result.submission);
      onClose();
    } catch (error) {
      setErrors([error instanceof Error ? error.message : 'Trail Pack submission failed.']);
    }
  };

  return (
    <TacticalPopupShell
      visible={visible}
      onClose={onClose}
      title="SUBMIT TRAIL PACK"
      icon="trail-sign-outline"
      eyebrow="ECS TRAIL PACKS"
      subtitle="Submit a route for ECS review. Approved Trail Packs can become discoverable later."
      maxWidth={720}
      maxHeightFraction={0.84}
      overlayClass="editor"
      keyboardAware
      footer={(
        <View style={styles.footer}>
          <TouchableOpacity style={styles.secondaryButton} activeOpacity={0.82} onPress={onClose}>
            <Text style={styles.secondaryButtonText}>CANCEL</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryButton, !routeHasGeometry && styles.buttonDisabled]}
            activeOpacity={routeHasGeometry ? 0.86 : 1}
            disabled={!routeHasGeometry}
            onPress={handleSubmit}
          >
            <Text style={[styles.primaryButtonText, !routeHasGeometry && styles.primaryButtonTextDisabled]}>
              SUBMIT FOR REVIEW
            </Text>
          </TouchableOpacity>
        </View>
      )}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.routeSummary}>
          <View style={styles.routeIcon}>
            <Ionicons name="git-branch-outline" size={16} color={TACTICAL.amber} />
          </View>
          <View style={styles.routeCopy}>
            <Text style={styles.routeTitle} numberOfLines={1}>
              {routeInput?.title ?? 'Route unavailable'}
            </Text>
            <Text style={styles.routeMeta}>{formatRouteMeta(routeInput)}</Text>
          </View>
        </View>

        {privacyWarnings.length > 0 ? (
          <View style={styles.notice}>
            <Ionicons name="shield-checkmark-outline" size={14} color={TACTICAL.amber} />
            <View style={styles.noticeCopy}>
              {privacyWarnings.map((warning) => (
                <Text key={warning} style={styles.noticeText}>{warning}</Text>
              ))}
            </View>
          </View>
        ) : null}

        {errors.length > 0 ? (
          <View style={styles.errorBox}>
            {errors.map((error) => (
              <Text key={error} style={styles.errorText}>{error}</Text>
            ))}
          </View>
        ) : null}

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>TRAIL PACK NAME</Text>
          <TextInput
            value={values.name}
            onChangeText={(text) => update('name', text)}
            placeholder="Route name"
            placeholderTextColor={TACTICAL.textMuted}
            style={styles.input}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>SHORT DESCRIPTION</Text>
          <TextInput
            value={values.description}
            onChangeText={(text) => update('description', text)}
            placeholder="What makes this route useful?"
            placeholderTextColor={TACTICAL.textMuted}
            style={[styles.input, styles.textArea]}
            multiline
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>DIFFICULTY</Text>
          <View style={styles.optionRow}>
            {DIFFICULTY_OPTIONS.map((option) => (
              <Pill
                key={option.key}
                label={option.label}
                active={values.difficulty === option.key}
                onPress={() => update('difficulty', option.key)}
              />
            ))}
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>ROUTE TYPE</Text>
          <View style={styles.optionRow}>
            {ROUTE_TYPE_OPTIONS.map((option) => (
              <Pill
                key={option.key}
                label={option.label}
                active={values.routeType === option.key}
                onPress={() => update('routeType', option.key)}
              />
            ))}
          </View>
        </View>

        <View style={styles.twoColumn}>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>VEHICLE USED</Text>
            <TextInput
              value={values.vehicleUsed}
              onChangeText={(text) => update('vehicleUsed', text)}
              placeholder="Your vehicle"
              placeholderTextColor={TACTICAL.textMuted}
              style={styles.input}
            />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>RECOMMENDED VEHICLE</Text>
            <TextInput
              value={values.recommendedVehicleType}
              onChangeText={(text) => update('recommendedVehicleType', text)}
              placeholder="High clearance, 4x4, etc."
              placeholderTextColor={TACTICAL.textMuted}
              style={styles.input}
            />
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>SEASON NOTES</Text>
          <TextInput
            value={values.seasonNotes}
            onChangeText={(text) => update('seasonNotes', text)}
            placeholder="Seasonal access, snow, heat, water, closures"
            placeholderTextColor={TACTICAL.textMuted}
            style={styles.input}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>HAZARD NOTES</Text>
          <TextInput
            value={values.hazardNotes}
            onChangeText={(text) => update('hazardNotes', text)}
            placeholder="Washouts, exposure, recovery risk, gates"
            placeholderTextColor={TACTICAL.textMuted}
            style={styles.input}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>OPTIONAL TAGS</Text>
          <View style={styles.optionRow}>
            {TRAIL_PACK_SUBMISSION_TAG_OPTIONS.map((option) => (
              <Pill
                key={option.key}
                label={option.label}
                active={values.tags.includes(option.key)}
                onPress={() => toggleTag(option.key)}
              />
            ))}
          </View>
        </View>

        <CheckRow
          checked={values.acknowledgesPrivateLandOrClosures}
          label="I checked for private land, closure, and posted restriction concerns."
          onPress={() => update('acknowledgesPrivateLandOrClosures', !values.acknowledgesPrivateLandOrClosures)}
        />
        <CheckRow
          checked={values.certifiesPermissionToShare}
          label={TRAIL_PACK_SUBMISSION_CERTIFICATION_COPY}
          onPress={() => update('certifiesPermissionToShare', !values.certifiesPermissionToShare)}
        />
      </ScrollView>
    </TacticalPopupShell>
  );
}

function Pill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.pill, active && styles.pillActive]}
      activeOpacity={0.78}
      onPress={() => {
        hapticMicro();
        onPress();
      }}
    >
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function CheckRow({
  checked,
  label,
  onPress,
}: {
  checked: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.checkRow} activeOpacity={0.78} onPress={onPress}>
      <Ionicons
        name={checked ? 'checkbox-outline' : 'square-outline'}
        size={18}
        color={checked ? TACTICAL.amber : TACTICAL.textMuted}
      />
      <Text style={styles.checkText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
  },
  content: {
    gap: 12,
    paddingBottom: 4,
  },
  routeSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(230,184,76,0.18)',
    backgroundColor: ECS.bgPanel,
  },
  routeIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(230,184,76,0.24)',
    backgroundColor: 'rgba(230,184,76,0.08)',
  },
  routeCopy: {
    flex: 1,
    minWidth: 0,
  },
  routeTitle: {
    color: TACTICAL.text,
    fontSize: 15,
    fontWeight: '900',
  },
  routeMeta: {
    color: TACTICAL.textMuted,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  notice: {
    flexDirection: 'row',
    gap: 9,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(230,184,76,0.2)',
    backgroundColor: 'rgba(230,184,76,0.07)',
  },
  noticeCopy: {
    flex: 1,
    gap: 3,
  },
  noticeText: {
    color: TACTICAL.text,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  errorBox: {
    gap: 4,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(239,83,80,0.3)',
    backgroundColor: 'rgba(239,83,80,0.08)',
  },
  errorText: {
    color: '#FF8A80',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
  },
  fieldGroup: {
    gap: 6,
    flex: 1,
  },
  fieldLabel: {
    color: TACTICAL.amber,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0,
  },
  input: {
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(0,0,0,0.18)',
    color: TACTICAL.text,
    paddingHorizontal: 11,
    paddingVertical: 9,
    fontSize: 13,
    fontWeight: '700',
  },
  textArea: {
    minHeight: 76,
    textAlignVertical: 'top',
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    minHeight: 32,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  pillActive: {
    borderColor: 'rgba(230,184,76,0.45)',
    backgroundColor: 'rgba(230,184,76,0.12)',
  },
  pillText: {
    color: TACTICAL.textMuted,
    fontSize: 11,
    fontWeight: '800',
  },
  pillTextActive: {
    color: TACTICAL.amber,
  },
  twoColumn: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  checkRow: {
    flexDirection: 'row',
    gap: 9,
    alignItems: 'flex-start',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  checkText: {
    flex: 1,
    color: TACTICAL.text,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  secondaryButton: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: TACTICAL.textMuted,
    fontSize: 11,
    fontWeight: '900',
  },
  primaryButton: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: TACTICAL.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#0B0E12',
    fontSize: 11,
    fontWeight: '900',
  },
  buttonDisabled: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  primaryButtonTextDisabled: {
    color: TACTICAL.textMuted,
  },
});
