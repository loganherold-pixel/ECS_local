import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

import { ECSButton } from '../ECSButton';
import ECSModalShell, { ECSOverlayFooter } from '../ECSModalShell';
import { ECSBadge, ECSIcon, ECSStatusDot } from '../ECSStatus';
import { ECSPanel, ECSSectionHeader } from '../ECSSurface';
import { ECSHelperText, ECSText } from '../ECSText';
import { SourceTruthInspectorTrigger } from '../source-truth';
import { ECS_STATUS } from '../../lib/ecsStatusTokens';
import { ECS_SURFACE } from '../../lib/ecsSurfaceTokens';
import { ECS } from '../../lib/theme';
import type { SourceTruthPolicyKey } from '../../lib/sourceTruth';
import type {
  VehicleRouteConstraintEnvelopeResult,
  VehicleRouteConstraintFactorId,
  VehicleRouteConstraintFactorResult,
  VehicleRouteConstraintSegmentResult,
} from '../../lib/vehicleRouteConstraintEnvelope';
import {
  buildVehicleRouteConstraintEnvelopePresentation,
  sortVehicleRouteConstraintFactors,
  VEHICLE_ROUTE_CONSTRAINT_POSTURE_PRESENTATION,
} from '../../lib/vehicleRouteConstraintEnvelopePresentation';

export interface VehicleRouteConstraintEnvelopeProps {
  envelope: VehicleRouteConstraintEnvelopeResult;
}

const FACTOR_POLICY: Record<VehicleRouteConstraintFactorId, SourceTruthPolicyKey> = {
  payload_weight: 'vehicle_profile',
  load_distribution: 'vehicle_profile',
  tire_suitability: 'vehicle_profile',
  suspension_lift: 'vehicle_profile',
  trailer_constraints: 'manual_user_state',
  grade_elevation: 'offline_map_route_package',
  terrain_exposure: 'offline_map_route_package',
  fuel_range: 'manual_user_state',
  remoteness_bailout: 'offline_map_route_package',
  recovery_readiness: 'manual_user_state',
  route_advisories: 'condition_closure_advisory',
};

function FactorRow({
  factor,
  segmentLabel,
}: {
  factor: VehicleRouteConstraintFactorResult;
  segmentLabel: string;
}) {
  const posture = VEHICLE_ROUTE_CONSTRAINT_POSTURE_PRESENTATION[factor.posture];
  return (
    <View style={styles.factorRow}>
      <View style={styles.factorHeader}>
        <ECSText variant="cardTitle" style={styles.factorTitle}>{factor.label}</ECSText>
        <ECSBadge label={posture.shortLabel} tone={posture.tone} compact />
      </View>
      <ECSHelperText style={styles.factorReason}>{factor.reason}</ECSHelperText>
      {factor.missingInputs.length > 0 ? (
        <View style={styles.noticeRow}>
          <ECSIcon name="help-circle-outline" tier="compact" tone="warning" />
          <ECSHelperText style={styles.noticeText}>
            Missing: {factor.missingInputs.join('; ')}
          </ECSHelperText>
        </View>
      ) : null}
      {factor.verificationOrMitigation.length > 0 ? (
        <View style={styles.noticeRow}>
          <ECSIcon name="checkmark-circle-outline" tier="compact" tone="info" />
          <ECSHelperText style={styles.noticeText}>
            Verify or mitigate: {factor.verificationOrMitigation.join('; ')}
          </ECSHelperText>
        </View>
      ) : null}
      {factor.warningCodes.length > 0 ? (
        <View style={styles.noticeRow}>
          <ECSIcon name="alert-circle-outline" tier="compact" tone="warning" />
          <ECSHelperText style={styles.noticeText}>
            Warning codes: {factor.warningCodes.join('; ')}
          </ECSHelperText>
        </View>
      ) : null}
      <View style={styles.sourceRow}>
        <ECSBadge label={`${factor.confidence.toUpperCase()} CONFIDENCE`} tone="info" compact />
        {factor.sourceTruth.map((source, index) => (
          <SourceTruthInspectorTrigger
            key={`${source.id}:${index}`}
            source={source}
            policyKey={FACTOR_POLICY[factor.id]}
            dependencies={[`${segmentLabel}: ${factor.label}. ${factor.reason}`]}
            label={index === 0 ? 'SOURCE' : `SOURCE ${index + 1}`}
            compact
          />
        ))}
      </View>
    </View>
  );
}

function ConstraintDetailSheet({
  segment,
  visible,
  onClose,
  safetyBoundary,
}: {
  segment: VehicleRouteConstraintSegmentResult | null;
  visible: boolean;
  onClose: () => void;
  safetyBoundary: string;
}) {
  const factors = useMemo(() => sortVehicleRouteConstraintFactors(segment?.factors ?? []), [segment?.factors]);
  const posture = VEHICLE_ROUTE_CONSTRAINT_POSTURE_PRESENTATION[segment?.posture ?? 'unknown'];
  return (
    <ECSModalShell
      visible={visible}
      onClose={onClose}
      title={segment?.label ?? 'Segment Constraint Detail'}
      subtitle={segment
        ? `${segment.distanceStartMiles.toFixed(1)}-${segment.distanceEndMiles.toFixed(1)} mi`
        : 'Segment unavailable'}
      eyebrow="VEHICLE CONSTRAINT ENVELOPE"
      icon="options-outline"
      overlayClass="editor"
      stackBehavior="allow-stack"
      maxWidth={760}
      maxHeightFraction={0.9}
      minHeightFraction={0.7}
      scrollable
      dismissOnBackdrop
      allowSwipeDismiss
      showHandle
      contentContainerStyle={styles.modalContent}
      footer={(
        <ECSOverlayFooter>
          <ECSButton
            label="Close"
            icon="close-outline"
            variant="tertiary"
            size="medium"
            onPress={onClose}
            grow
          />
        </ECSOverlayFooter>
      )}
    >
      <View style={styles.modalRoot} accessibilityViewIsModal>
        <ECSPanel variant={segment?.posture === 'within_envelope' ? 'secondary' : 'warning'} style={styles.summaryPanel}>
          <ECSSectionHeader
            title="Segment Posture"
            icon={posture.icon}
            subtitle={segment?.limitingFactor?.reason ?? 'Required inputs are unavailable.'}
            badge={<ECSBadge label={posture.shortLabel} tone={posture.tone} compact />}
          />
          <View style={styles.confidenceRow}>
            <ECSBadge
              label={`${(segment?.confidence.level ?? 'unknown').toUpperCase()} CONFIDENCE`}
              tone="info"
              compact
            />
            <ECSHelperText>
              {segment?.confidence.assessedFactorCount ?? 0} of {segment?.confidence.contributingFactorCount ?? 0} contributing checks assessed
            </ECSHelperText>
          </View>
        </ECSPanel>

        <ECSPanel variant="warning" style={styles.boundaryPanel}>
          <ECSSectionHeader title="Assessment Boundary" icon="shield-outline" />
          <ECSHelperText>{safetyBoundary}</ECSHelperText>
          <ECSHelperText>Preview only. No route, guidance, vehicle, loadout, or trailer state has changed.</ECSHelperText>
        </ECSPanel>

        <ECSPanel variant="quiet" style={styles.factorPanel}>
          <ECSSectionHeader
            title="Factor Detail"
            icon="list-outline"
            subtitle="Known checks and explicit unknowns"
          />
          {factors.map((factor, index) => (
            <View key={factor.id}>
              <FactorRow factor={factor} segmentLabel={segment?.label ?? 'Segment'} />
              {index < factors.length - 1 ? <View style={styles.divider} /> : null}
            </View>
          ))}
        </ECSPanel>
      </View>
    </ECSModalShell>
  );
}

export function VehicleRouteConstraintEnvelope({ envelope }: VehicleRouteConstraintEnvelopeProps) {
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const presentation = useMemo(
    () => buildVehicleRouteConstraintEnvelopePresentation(envelope),
    [envelope],
  );
  const selectedSegment = useMemo(
    () => envelope.segments.find((segment) => segment.id === selectedSegmentId) ?? null,
    [envelope.segments, selectedSegmentId],
  );
  const overallTone = ECS_STATUS.tone[presentation.posturePresentation.tone];

  return (
    <>
      <View style={styles.ribbonPanel}>
        <View
          style={styles.ribbonHeader}
          accessible
          accessibilityLabel={`Vehicle constraint envelope. ${presentation.headline} ${presentation.earliestWorseningLabel}`}
        >
          <View style={styles.ribbonTitleRow}>
            <ECSIcon
              name={presentation.posturePresentation.icon}
              tier="compact"
              tone={presentation.posturePresentation.tone}
            />
            <View style={styles.ribbonCopy}>
              <ECSText variant="statLabel" style={styles.ribbonTitle}>VEHICLE ENVELOPE</ECSText>
              <ECSHelperText style={styles.ribbonSubtitle} numberOfLines={2}>
                {presentation.earliestWorseningLabel}
              </ECSHelperText>
            </View>
          </View>
          <ECSBadge
            label={presentation.posturePresentation.shortLabel}
            tone={presentation.posturePresentation.tone}
            compact
          />
        </View>
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.segmentRibbon}
        >
          {presentation.segments.map((segment) => {
            const colors = ECS_STATUS.tone[segment.posturePresentation.tone];
            return (
              <TouchableOpacity
                key={segment.id}
                style={[
                  styles.segmentButton,
                  { borderColor: colors.border, backgroundColor: colors.background },
                ]}
                onPress={() => setSelectedSegmentId(segment.id)}
                activeOpacity={0.78}
                accessibilityRole="button"
                accessibilityLabel={`${segment.accessibilityLabel} Open factor detail.`}
                accessibilityHint="Shows the deterministic factors and source evidence for this route segment."
              >
                <View style={styles.segmentButtonHeader}>
                  <ECSStatusDot tone={segment.posturePresentation.tone} compact />
                  <ECSText variant="chip" style={[styles.segmentIndex, { color: colors.text }]}>
                    S{segment.index + 1}
                  </ECSText>
                </View>
                <ECSHelperText style={styles.segmentRange} numberOfLines={1}>
                  {segment.rangeLabel}
                </ECSHelperText>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <View style={[styles.ribbonRule, { backgroundColor: overallTone.border }]} />
        <ECSHelperText style={styles.ribbonBoundary} numberOfLines={2}>
          Known constraints only. {presentation.confidenceLabel}. Tap a segment for factors and sources.
        </ECSHelperText>
      </View>

      <ConstraintDetailSheet
        segment={selectedSegment}
        visible={selectedSegment != null}
        onClose={() => setSelectedSegmentId(null)}
        safetyBoundary={envelope.safetyBoundary}
      />
    </>
  );
}

const styles = StyleSheet.create({
  ribbonPanel: {
    marginHorizontal: 8,
    marginVertical: 5,
    padding: 8,
    borderWidth: 1,
    borderColor: ECS.strokeMuted,
    borderRadius: 6,
    backgroundColor: ECS.bgPanel,
    gap: 7,
  },
  ribbonHeader: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  ribbonTitleRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  ribbonCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  ribbonTitle: {
    color: ECS.text,
  },
  ribbonSubtitle: {
    color: ECS.muted,
    lineHeight: 14,
  },
  segmentRibbon: {
    minHeight: 50,
    gap: 6,
    paddingRight: 4,
  },
  segmentButton: {
    width: 78,
    minHeight: 48,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 5,
    justifyContent: 'space-between',
  },
  segmentButtonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  segmentIndex: {
    flex: 1,
  },
  segmentRange: {
    color: ECS.muted,
  },
  ribbonRule: {
    height: StyleSheet.hairlineWidth,
  },
  ribbonBoundary: {
    color: ECS.muted,
  },
  modalContent: {
    paddingBottom: 18,
  },
  modalRoot: {
    gap: ECS_SURFACE.gap.section,
  },
  summaryPanel: {
    gap: ECS_SURFACE.gap.group,
  },
  confidenceRow: {
    minHeight: 32,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: ECS_SURFACE.gap.group,
  },
  boundaryPanel: {
    gap: ECS_SURFACE.gap.group,
  },
  factorPanel: {
    gap: ECS_SURFACE.gap.group,
  },
  factorRow: {
    paddingVertical: ECS_SURFACE.gap.group,
    gap: ECS_SURFACE.gap.group,
  },
  factorHeader: {
    minHeight: 30,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: ECS_SURFACE.gap.group,
  },
  factorTitle: {
    flex: 1,
    minWidth: 150,
    color: ECS.text,
  },
  factorReason: {
    color: ECS.muted,
    lineHeight: 16,
  },
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: ECS_SURFACE.gap.group,
  },
  noticeText: {
    flex: 1,
    color: ECS.muted,
    lineHeight: 16,
  },
  sourceRow: {
    minHeight: 32,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: ECS_SURFACE.gap.group,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: ECS.strokeMuted,
  },
});
