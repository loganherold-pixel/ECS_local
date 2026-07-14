import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AdaptiveBackground from '../components/login/AdaptiveBackground';
import { ECSButton } from '../components/ECSButton';
import { ECSBadge, ECSIcon } from '../components/ECSStatus';
import { ECSPanel } from '../components/ECSSurface';
import { ECSText } from '../components/ECSText';
import { ECS, TACTICAL } from '../lib/theme';
import { ECS_SURFACE } from '../lib/ecsSurfaceTokens';
import {
  ECS_FEATURE_IDS,
  getECSFeatureDefinition,
  type ECSFeatureDecisionReason,
  type ECSFeatureId,
} from '../lib/features/featureVisibilityRegistry';
import { normalizeECSReturnRoute } from '../lib/routeManifest';
import { useECSNavigation } from '../lib/navigation/useECSNavigation';

const REASON_COPY: Record<ECSFeatureDecisionReason, string> = {
  enabled: 'This feature is enabled.',
  rollout_disabled: 'This feature is not included in the current rollout.',
  configuration_missing: 'Required feature configuration is missing.',
  configuration_malformed: 'Feature configuration is invalid and ECS failed closed.',
  environment_blocked: 'This feature is not available in this build environment.',
  debug_build_only: 'Development controls are inaccessible in production builds.',
  authentication_required: 'Sign in with an ECS account to use this feature.',
  subscription_required: 'Active ECS access is required for this feature.',
  admin_required: 'An ECS administrator account is required for this feature.',
  backend_unavailable: 'The required ECS backend is unavailable.',
  provider_unavailable: 'The required data provider is unavailable.',
  hardware_unavailable: 'Required native hardware is unavailable on this device.',
  permission_required: 'A required device permission is unavailable.',
  privacy_approval_required: 'Privacy approval has not been recorded for this rollout.',
  production_evidence_required: 'Required production evidence has not been accepted.',
  feature_dependency_unavailable: 'A required ECS feature dependency is unavailable.',
  offline_unavailable: 'This feature is unavailable without a network connection.',
  kill_switch: 'This feature has been disabled by an ECS kill switch.',
};

function firstParam(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export default function FeatureUnavailableScreen() {
  const { replace } = useECSNavigation();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    feature?: string | string[];
    reason?: string | string[];
    returnTo?: string | string[];
  }>();
  const featureId = firstParam(params.feature);
  const reason = firstParam(params.reason) as ECSFeatureDecisionReason | null;
  const validFeatureId = ECS_FEATURE_IDS.includes(featureId as ECSFeatureId)
    ? featureId as ECSFeatureId
    : null;
  const feature = validFeatureId ? getECSFeatureDefinition(validFeatureId) : null;
  const safeReturnRoute = normalizeECSReturnRoute(
    firstParam(params.returnTo),
    feature?.routePolicy?.safeReturnRoute ?? '/dashboard',
  );
  const explanation = reason && REASON_COPY[reason]
    ? REASON_COPY[reason]
    : 'ECS could not verify that this feature is available in the current rollout.';
  const maturityLabel = useMemo(
    () => (feature?.maturity ?? 'development').replace(/_/g, ' ').toUpperCase(),
    [feature?.maturity],
  );

  return (
    <AdaptiveBackground>
      <View
        style={[
          styles.screen,
          {
            paddingTop: Math.max(insets.top, ECS.spacing.lg),
            paddingBottom: Math.max(insets.bottom, ECS.spacing.lg),
          },
        ]}
      >
        <ECSPanel variant="secondary" style={styles.panel}>
          <View style={styles.iconWrap}>
            <ECSIcon name="lock-closed-outline" tier="navigation" tone="warning" />
          </View>
          <View style={styles.copy}>
            <ECSText variant="chip" style={styles.eyebrow}>ECS CAPABILITY CONTROL</ECSText>
            <ECSText variant="screenTitle" style={styles.title} accessibilityRole="header">
              {feature?.userFacingLabel ?? 'Feature Unavailable'}
            </ECSText>
            <ECSText variant="body" style={styles.body}>{explanation}</ECSText>
            <ECSText variant="body" style={styles.detail}>
              {feature?.unavailableCopy ?? 'This feature remains unavailable until its rollout requirements are satisfied.'}
            </ECSText>
          </View>
          <View style={styles.badges}>
            <ECSBadge label={maturityLabel} tone="category" compact />
            {feature?.relatedReadinessGate ? (
              <ECSBadge label="READINESS GATED" tone="warning" compact />
            ) : null}
          </View>
          <ECSButton
            label="Return To ECS"
            icon="arrow-back-outline"
            variant="primary"
            size="medium"
            onPress={() => replace(safeReturnRoute)}
          />
        </ECSPanel>
      </View>
    </AdaptiveBackground>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: ECS.spacing.lg,
  },
  panel: {
    width: '100%',
    maxWidth: 560,
    gap: ECS_SURFACE.gap.section,
  },
  iconWrap: {
    alignSelf: 'flex-start',
  },
  copy: {
    gap: ECS_SURFACE.gap.group,
  },
  eyebrow: {
    color: ECS.accent,
  },
  title: {
    color: ECS.text,
  },
  body: {
    color: ECS.text,
    lineHeight: 20,
  },
  detail: {
    color: TACTICAL.textMuted,
    lineHeight: 18,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: ECS_SURFACE.gap.group,
  },
});
