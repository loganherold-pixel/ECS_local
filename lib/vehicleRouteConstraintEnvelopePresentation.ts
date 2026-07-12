import type {
  VehicleRouteConstraintEnvelopeResult,
  VehicleRouteConstraintFactorResult,
  VehicleRouteConstraintPosture,
  VehicleRouteConstraintSegmentResult,
} from './vehicleRouteConstraintEnvelope';

export type VehicleRouteConstraintPresentationTone = 'ready' | 'warning' | 'unavailable' | 'info';

export interface VehicleRouteConstraintPosturePresentation {
  label: string;
  shortLabel: string;
  tone: VehicleRouteConstraintPresentationTone;
  icon: 'shield-checkmark-outline' | 'warning-outline' | 'close-circle-outline' | 'help-circle-outline';
}

export interface VehicleRouteConstraintSegmentPresentation {
  id: string;
  index: number;
  label: string;
  rangeLabel: string;
  posture: VehicleRouteConstraintPosture;
  posturePresentation: VehicleRouteConstraintPosturePresentation;
  limitingFactorLabel: string;
  confidenceLabel: string;
  accessibilityLabel: string;
}

export interface VehicleRouteConstraintEnvelopePresentation {
  headline: string;
  summary: string;
  earliestWorseningLabel: string;
  posturePresentation: VehicleRouteConstraintPosturePresentation;
  confidenceLabel: string;
  segments: VehicleRouteConstraintSegmentPresentation[];
}

export const VEHICLE_ROUTE_CONSTRAINT_POSTURE_PRESENTATION: Record<
  VehicleRouteConstraintPosture,
  VehicleRouteConstraintPosturePresentation
> = {
  within_envelope: {
    label: 'WITHIN KNOWN ENVELOPE',
    shortLabel: 'WITHIN',
    tone: 'ready',
    icon: 'shield-checkmark-outline',
  },
  watch: {
    label: 'APPROACHING CONSTRAINT',
    shortLabel: 'WATCH',
    tone: 'warning',
    icon: 'warning-outline',
  },
  exceeds_known_envelope: {
    label: 'KNOWN CONSTRAINT EXCEEDED',
    shortLabel: 'EXCEEDS',
    tone: 'unavailable',
    icon: 'close-circle-outline',
  },
  unknown: {
    label: 'CANNOT ASSESS',
    shortLabel: 'UNKNOWN',
    tone: 'warning',
    icon: 'help-circle-outline',
  },
};

export function formatVehicleRouteMileageRange(startMiles: number, endMiles: number): string {
  return `${Math.max(0, startMiles).toFixed(1)}-${Math.max(startMiles, endMiles).toFixed(1)} mi`;
}

export function buildVehicleRouteConstraintSegmentPresentation(
  segment: VehicleRouteConstraintSegmentResult,
): VehicleRouteConstraintSegmentPresentation {
  const posturePresentation = VEHICLE_ROUTE_CONSTRAINT_POSTURE_PRESENTATION[segment.posture];
  const rangeLabel = formatVehicleRouteMileageRange(segment.distanceStartMiles, segment.distanceEndMiles);
  const limitingFactorLabel = segment.limitingFactor?.label ?? 'Required inputs unavailable';
  return {
    id: segment.id,
    index: segment.index,
    label: segment.label,
    rangeLabel,
    posture: segment.posture,
    posturePresentation,
    limitingFactorLabel,
    confidenceLabel: `${segment.confidence.level} confidence`,
    accessibilityLabel: `${segment.label}, ${rangeLabel}. ${posturePresentation.label}. Limiting factor: ${limitingFactorLabel}. ${segment.confidence.level} confidence.`,
  };
}

export function buildVehicleRouteConstraintEnvelopePresentation(
  result: VehicleRouteConstraintEnvelopeResult,
): VehicleRouteConstraintEnvelopePresentation {
  const posturePresentation = VEHICLE_ROUTE_CONSTRAINT_POSTURE_PRESENTATION[result.posture];
  const earliest = result.earliestWorseningSegment;
  const earliestWorseningLabel = earliest
    ? `First change: ${earliest.label}, ${formatVehicleRouteMileageRange(earliest.distanceStartMiles, earliest.distanceEndMiles)}`
    : 'No segment leaves the known envelope.';
  const headline = result.posture === 'within_envelope'
    ? 'Known segment checks remain within the saved rig envelope.'
    : result.posture === 'watch'
      ? 'At least one segment approaches a known constraint.'
      : result.posture === 'exceeds_known_envelope'
        ? 'At least one segment exceeds a known constraint.'
        : 'At least one required segment check cannot be assessed.';
  return {
    headline,
    summary: `${earliestWorseningLabel} ${result.safetyBoundary}`,
    earliestWorseningLabel,
    posturePresentation,
    confidenceLabel: `${result.confidence.level} confidence, ${result.confidence.coverage} coverage`,
    segments: result.segments.map(buildVehicleRouteConstraintSegmentPresentation),
  };
}

export function sortVehicleRouteConstraintFactors(
  factors: readonly VehicleRouteConstraintFactorResult[],
): VehicleRouteConstraintFactorResult[] {
  const rank: Record<VehicleRouteConstraintPosture, number> = {
    exceeds_known_envelope: 0,
    unknown: 1,
    watch: 2,
    within_envelope: 3,
  };
  return [...factors].sort((left, right) => {
    const postureDelta = rank[left.posture] - rank[right.posture];
    if (postureDelta !== 0) return postureDelta;
    return left.label.localeCompare(right.label);
  });
}
