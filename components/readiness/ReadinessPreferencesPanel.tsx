import React, { useCallback, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, TextStyle, View } from 'react-native';

import { ECSText } from '../ECSText';
import { ECSBadge, ECSIcon } from '../ECSStatus';
import {
  CAMP_CONFIDENCE_REQUIREMENT_LABELS,
  OFFLINE_REQUIREMENT_LABELS,
  READINESS_ALERT_SENSITIVITY_LABELS,
  READINESS_SENSITIVITY_LABELS,
  RECOVERY_MARGIN_LABELS,
  expeditionReadinessPreferencesStore,
  expeditionReadinessStore,
  type ExpeditionCampConfidenceRequirement,
  type ExpeditionOfflineRequirement,
  type ExpeditionReadinessAlertSensitivity,
  type ExpeditionReadinessPreferences,
  type ExpeditionReadinessSensitivity,
  type ExpeditionRecoveryMarginPreference,
} from '../../lib/readiness';
import { ECS, GOLD_RAIL } from '../../lib/theme';
import { readinessInnerSurfaceStyle, readinessSurfaceStyle } from './readinessUi';

type ReadinessPreferencesPanelProps = {
  onChange?: (message: string) => void;
};

type Option<T extends string> = {
  value: T;
  label: string;
  detail: string;
};

const READINESS_OPTIONS: Option<ExpeditionReadinessSensitivity>[] = [
  { value: 'standard', label: READINESS_SENSITIVITY_LABELS.standard, detail: 'Balanced defaults for everyday trip planning.' },
  { value: 'conservative', label: READINESS_SENSITIVITY_LABELS.conservative, detail: 'Tightens Ready and Caution thresholds.' },
  { value: 'fieldConservative', label: READINESS_SENSITIVITY_LABELS.fieldConservative, detail: 'Strongest pre-trip threshold posture.' },
];

const ALERT_OPTIONS: Option<ExpeditionReadinessAlertSensitivity>[] = [
  { value: 'low', label: READINESS_ALERT_SENSITIVITY_LABELS.low, detail: 'Fewer active-expedition alerts.' },
  { value: 'standard', label: READINESS_ALERT_SENSITIVITY_LABELS.standard, detail: 'Balanced active-expedition alerts.' },
  { value: 'high', label: READINESS_ALERT_SENSITIVITY_LABELS.high, detail: 'Earlier alerts for meaningful readiness changes.' },
];

const CAMP_OPTIONS: Option<ExpeditionCampConfidenceRequirement>[] = [
  { value: 'standard', label: CAMP_CONFIDENCE_REQUIREMENT_LABELS.standard, detail: 'Camp confidence warnings remain visible when relevant.' },
  { value: 'highConfidencePreferred', label: CAMP_CONFIDENCE_REQUIREMENT_LABELS.highConfidencePreferred, detail: 'Keeps camp-confidence review elevated until confidence is high.' },
];

const OFFLINE_OPTIONS: Option<ExpeditionOfflineRequirement>[] = [
  { value: 'standard', label: OFFLINE_REQUIREMENT_LABELS.standard, detail: 'Offline preparedness follows trip profile defaults.' },
  { value: 'strictForRemoteTrips', label: OFFLINE_REQUIREMENT_LABELS.strictForRemoteTrips, detail: 'Remote routes can move to Hold when offline package confidence is incomplete.' },
];

const RECOVERY_OPTIONS: Option<ExpeditionRecoveryMarginPreference>[] = [
  { value: 'standard', label: RECOVERY_MARGIN_LABELS.standard, detail: 'Recovery margin follows trip profile defaults.' },
  { value: 'conservative', label: RECOVERY_MARGIN_LABELS.conservative, detail: 'Keeps bailout and recovery margin concerns elevated.' },
];

function useReadinessPreferences(): ExpeditionReadinessPreferences {
  return useSyncExternalStore(
    expeditionReadinessPreferencesStore.subscribe,
    expeditionReadinessPreferencesStore.getSnapshot,
    expeditionReadinessPreferencesStore.getSnapshot,
  );
}

function PreferenceGroup<T extends string>({
  title,
  detail,
  value,
  options,
  onSelect,
}: {
  title: string;
  detail: string;
  value: T;
  options: Option<T>[];
  onSelect: (value: T) => void;
}) {
  return (
    <View style={[styles.group, readinessInnerSurfaceStyle]}>
      <View style={styles.groupHeader}>
        <ECSText variant="body" style={styles.groupTitle}>
          {title}
        </ECSText>
        <ECSText variant="helper" style={styles.groupDetail} numberOfLines={2}>
          {detail}
        </ECSText>
      </View>
      <View style={styles.optionList}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onSelect(option.value)}
              style={({ pressed }) => [
                styles.option,
                selected && styles.optionSelected,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.optionTopRow}>
                <ECSText variant="chip" style={[styles.optionLabel, selected && styles.optionLabelSelected]} numberOfLines={1}>
                  {option.label}
                </ECSText>
                {selected ? <ECSIcon name="checkmark-circle-outline" tier="compact" tone="ready" /> : null}
              </View>
              <ECSText variant="helper" style={styles.optionDetail} numberOfLines={2}>
                {option.detail}
              </ECSText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function ReadinessPreferencesPanel({ onChange }: ReadinessPreferencesPanelProps) {
  const preferences = useReadinessPreferences();

  const updatePreferences = useCallback(
    (patch: Partial<Omit<ExpeditionReadinessPreferences, 'updatedAt'>>) => {
      expeditionReadinessStore.setReadinessPreferencePatch(patch);
      onChange?.('Readiness preferences updated');
    },
    [onChange],
  );

  return (
    <View style={[styles.card, readinessSurfaceStyle]}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <ECSText variant="cardTitle" style={styles.title}>
            Expedition Readiness Preferences
          </ECSText>
          <ECSText variant="helper" style={styles.copy} numberOfLines={3}>
            Preferences tighten thresholds and alert timing only. They do not remove safety, legal-confidence, camp, offline, or recovery warnings.
          </ECSText>
        </View>
        <ECSBadge label="Deterministic" tone="info" compact />
      </View>

      <PreferenceGroup
        title="Readiness sensitivity"
        detail="Controls how hard ECS is to satisfy before returning Ready."
        value={preferences.readinessSensitivity}
        options={READINESS_OPTIONS}
        onSelect={(readinessSensitivity) => updatePreferences({ readinessSensitivity })}
      />
      <PreferenceGroup
        title="Alert sensitivity"
        detail="Controls active expedition alert timing and category drop thresholds."
        value={preferences.alertSensitivity}
        options={ALERT_OPTIONS}
        onSelect={(alertSensitivity) => updatePreferences({ alertSensitivity })}
      />
      <PreferenceGroup
        title="Camp confidence requirement"
        detail="Camp confidence remains confidence-based and never becomes a legal guarantee."
        value={preferences.campConfidenceRequirement}
        options={CAMP_OPTIONS}
        onSelect={(campConfidenceRequirement) => updatePreferences({ campConfidenceRequirement })}
      />
      <PreferenceGroup
        title="Offline requirement"
        detail="Controls how strict ECS is about route packages for remote travel."
        value={preferences.offlineRequirement}
        options={OFFLINE_OPTIONS}
        onSelect={(offlineRequirement) => updatePreferences({ offlineRequirement })}
      />
      <PreferenceGroup
        title="Recovery margin"
        detail="Controls how much bailout margin ECS wants before clearing the decision layer."
        value={preferences.recoveryMargin}
        options={RECOVERY_OPTIONS}
        onSelect={(recoveryMargin) => updatePreferences({ recoveryMargin })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
    gap: 10,
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  title: {
    color: ECS.text,
  } as TextStyle,
  copy: {
    color: ECS.muted,
    lineHeight: 16,
  } as TextStyle,
  group: {
    padding: 10,
    gap: 9,
  },
  groupHeader: {
    gap: 3,
  },
  groupTitle: {
    color: ECS.text,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '800',
  } as TextStyle,
  groupDetail: {
    color: ECS.muted,
    lineHeight: 15,
  } as TextStyle,
  optionList: {
    gap: 7,
  },
  option: {
    minHeight: 48,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: ECS.bgElev,
    gap: 4,
  },
  optionSelected: {
    borderColor: GOLD_RAIL.section,
    backgroundColor: ECS.accentSoft,
  },
  optionTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  optionLabel: {
    flex: 1,
    color: ECS.text,
  } as TextStyle,
  optionLabelSelected: {
    color: ECS.accent,
  } as TextStyle,
  optionDetail: {
    color: ECS.muted,
    lineHeight: 15,
  } as TextStyle,
  pressed: {
    opacity: 0.78,
  },
});
