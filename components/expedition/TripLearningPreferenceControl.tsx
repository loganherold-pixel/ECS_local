import React, { useEffect, useSyncExternalStore } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { ECSBadge } from '../ECSStatus';
import { ECSText } from '../ECSText';
import { ECS_SURFACE } from '../../lib/ecsSurfaceTokens';
import { TACTICAL } from '../../lib/theme';
import {
  isTripLearningLocalFeatureEnabled,
  type TripLearningFeatureFlags,
} from '../../lib/tripLearning/tripLearningConfig';
import { tripLearningStore } from '../../lib/tripLearning/tripLearningStore';

export type TripLearningPreferenceControlProps = {
  featureFlags?: TripLearningFeatureFlags | null;
};

export function TripLearningPreferenceControl({
  featureFlags,
}: TripLearningPreferenceControlProps) {
  const state = useSyncExternalStore(
    tripLearningStore.subscribe,
    tripLearningStore.getSnapshot,
    tripLearningStore.getSnapshot,
  );
  const rolloutEnabled = isTripLearningLocalFeatureEnabled(featureFlags);

  useEffect(() => {
    void tripLearningStore.hydrate();
  }, []);

  return (
    <View style={styles.section} testID="trip-learning-preference-control">
      <View style={styles.headerRow}>
        <View style={styles.copy}>
          <ECSText variant="statLabel" style={styles.label}>TRIP LEARNING</ECSText>
          <ECSText variant="helper" style={styles.detail}>
            Local-only calibration proposals and post-trip inspection prompts.
          </ECSText>
        </View>
        <Switch
          accessibilityLabel="Opt in to local Trip Learning"
          accessibilityHint={rolloutEnabled
            ? 'Stores qualified aggregate trip outcomes on this device.'
            : 'Unavailable because the restricted rollout is disabled.'}
          accessibilityState={{ disabled: !rolloutEnabled, checked: state.preferences.enabled }}
          value={rolloutEnabled && state.preferences.enabled}
          disabled={!rolloutEnabled}
          onValueChange={(enabled) => {
            void tripLearningStore.updatePreferences({ enabled });
          }}
          trackColor={{ false: ECS_SURFACE.border.quiet, true: TACTICAL.goldSoft }}
          thumbColor={rolloutEnabled && state.preferences.enabled ? TACTICAL.amber : TACTICAL.textMuted}
        />
      </View>
      <View style={styles.badgeRow}>
        <ECSBadge label="Local only" tone="category" icon="phone-portrait-outline" compact />
        <ECSBadge
          label={rolloutEnabled ? (state.preferences.enabled ? 'Opted in' : 'Opt-in off') : 'Rollout off'}
          tone={rolloutEnabled && state.preferences.enabled ? 'active' : 'unavailable'}
          compact
        />
        <ECSBadge label="Cloud sync off" tone="category" icon="cloud-offline-outline" compact />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 7,
    paddingHorizontal: 2,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: ECS_SURFACE.border.quiet,
  },
  headerRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  label: {
    color: TACTICAL.textMuted,
  },
  detail: {
    color: TACTICAL.textMuted,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
});

export default TripLearningPreferenceControl;
