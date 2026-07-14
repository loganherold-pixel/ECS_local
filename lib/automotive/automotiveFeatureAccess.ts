import {
  createRuntimeFeatureVisibilityContext,
  resolveECSFeatureVisibility,
  type ECSFeatureVisibilityContext,
  type ECSFeatureVisibilityDecision,
} from '../features/featureVisibilityRegistry';

export type ECSAutomotiveFeatureId =
  | 'automotive_vehicle_display'
  | 'android_auto_bridge'
  | 'carplay_bridge';

export interface ECSAutomotiveCapabilityInput {
  platform: 'android' | 'ios' | 'web' | string;
  androidAutoNativeAvailable: boolean;
  carPlayNativeAvailable: boolean;
  baseContext?: Partial<ECSFeatureVisibilityContext>;
}

function isExplicitApproval(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on', 'approved'].includes(String(value ?? '').trim().toLowerCase());
}

function addApprovedEvidence(
  evidence: Set<string>,
  env: Record<string, string | undefined>,
): void {
  const approvals: Array<[string, string]> = [
    ['EXPO_PUBLIC_ECS_AUTOMOTIVE_REDUCED_UI_EVIDENCE_APPROVED', 'automotive_reduced_ui_evidence'],
    ['EXPO_PUBLIC_ECS_AUTOMOTIVE_DISTRACTION_REVIEW_APPROVED', 'automotive_driver_distraction_review'],
    ['EXPO_PUBLIC_ECS_AUTOMOTIVE_OWNER_APPROVED', 'automotive_owner_acceptance'],
    ['EXPO_PUBLIC_ECS_ANDROID_AUTO_HEAD_UNIT_EVIDENCE_APPROVED', 'android_auto_head_unit_evidence'],
    ['EXPO_PUBLIC_ECS_CARPLAY_HEAD_UNIT_EVIDENCE_APPROVED', 'carplay_head_unit_evidence'],
  ];
  for (const [flag, requirement] of approvals) {
    if (isExplicitApproval(env[flag])) evidence.add(requirement);
  }
}

export function createAutomotiveFeatureVisibilityContext(
  input: ECSAutomotiveCapabilityInput,
): ECSFeatureVisibilityContext {
  const base = createRuntimeFeatureVisibilityContext(input.baseContext);
  const evidence = new Set(base.productionEvidence);
  addApprovedEvidence(evidence, base.env ?? {});
  const androidAvailable = input.platform === 'android' && input.androidAutoNativeAvailable;
  const carPlayAvailable = input.platform === 'ios' && input.carPlayNativeAvailable;

  return {
    ...base,
    hardware: {
      ...base.hardware,
      automotive_surface: androidAvailable || carPlayAvailable ? 'available' : 'unavailable',
      android_auto: androidAvailable ? 'available' : 'unavailable',
      carplay: carPlayAvailable ? 'available' : 'unavailable',
    },
    productionEvidence: evidence,
  };
}

export function resolveAutomotiveFeatureAccess(
  featureId: ECSAutomotiveFeatureId,
  input: ECSAutomotiveCapabilityInput,
): ECSFeatureVisibilityDecision {
  return resolveECSFeatureVisibility(
    featureId,
    createAutomotiveFeatureVisibilityContext(input),
  );
}

export function shouldStartAutomotiveFeature(
  featureId: ECSAutomotiveFeatureId,
  input: ECSAutomotiveCapabilityInput,
): boolean {
  return resolveAutomotiveFeatureAccess(featureId, input).availability === 'available';
}

