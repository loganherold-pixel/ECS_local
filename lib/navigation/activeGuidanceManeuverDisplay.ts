import type { EcsActiveGuidanceProgress } from './ecsActiveGuidanceController';
import type { EcsGuidanceMode, EcsGuidanceRoute, EcsGuidanceStep } from './ecsGuidanceModel';

export type ActiveGuidanceManeuverDisplayMode =
  | 'turn_by_turn'
  | 'summary_only'
  | 'unavailable'
  | 'calculating'
  | 'rerouting'
  | 'updated';

export interface ActiveGuidanceManeuverDisplayInput {
  guidanceMode: EcsGuidanceMode;
  route: EcsGuidanceRoute | null | undefined;
  progress: EcsActiveGuidanceProgress | null | undefined;
  status?: string | null;
  previewLoading?: boolean;
  routeStatusLabel?: string | null;
}

export interface ActiveGuidanceManeuverDisplay {
  mode: ActiveGuidanceManeuverDisplayMode;
  iconName: string;
  eyebrow: string;
  distanceLabel: string | null;
  primaryText: string;
  detailText: string | null;
  roadName: string;
  followingText: string | null;
  guidanceAvailable: boolean;
}

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower === 'null' || lower === 'undefined') return null;
  return trimmed;
}

export function formatManeuverDistance(meters: number | null | undefined): string {
  if (meters == null || !Number.isFinite(meters)) return '--';
  const value = Math.max(0, meters);
  if (value < 160) {
    const feet = value * 3.28084;
    return `${Math.max(Math.round(feet / 5) * 5, 5)} ft`;
  }
  if (value < 304.8) {
    const feet = value * 3.28084;
    return `${Math.max(Math.round(feet / 50) * 50, 50)} ft`;
  }
  const miles = value / 1609.344;
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

function normalizedModifier(modifier: string | null | undefined): string {
  return cleanString(modifier)?.toLowerCase().replace(/_/g, ' ') ?? '';
}

export function getManeuverIconName(
  maneuverType: string | null | undefined,
  maneuverModifier: string | null | undefined,
): string {
  const type = cleanString(maneuverType)?.toLowerCase() ?? '';
  const modifier = normalizedModifier(maneuverModifier);
  if (type === 'arrive' || type === 'arrival') return 'flag';
  if (modifier.includes('uturn') || modifier.includes('u-turn')) return 'refresh';
  if (type.includes('roundabout') || type === 'rotary') return 'sync';
  if (modifier.includes('left')) return 'arrow-back';
  if (modifier.includes('right')) return 'arrow-forward';
  if (type === 'merge') return 'git-merge';
  return 'arrow-up';
}

function roadNameForStep(step: EcsGuidanceStep | null | undefined, fallback?: string | null): string {
  return (
    cleanString(step?.displayRoadName) ??
    cleanString(step?.roadName) ??
    cleanString(fallback) ??
    'Unnamed road'
  );
}

function isArrivalStep(step: EcsGuidanceStep | null | undefined): boolean {
  const type = cleanString(step?.maneuverType)?.toLowerCase() ?? '';
  const instruction = cleanString(step?.instruction)?.toLowerCase() ?? '';
  return type === 'arrive' || type === 'arrival' || instruction.includes('arrived');
}

function isUTurnStep(step: EcsGuidanceStep | null | undefined): boolean {
  const modifier = normalizedModifier(step?.maneuverModifier);
  const instruction = cleanString(step?.instruction)?.toLowerCase() ?? '';
  return modifier.includes('uturn') || modifier.includes('u-turn') || instruction.includes('u-turn');
}

function lowerLead(value: string): string {
  if (!value) return value;
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function turnVerb(step: EcsGuidanceStep): string | null {
  const modifier = normalizedModifier(step.maneuverModifier);
  const type = cleanString(step.maneuverType)?.toLowerCase() ?? '';
  if (modifier.includes('slight left')) return 'bear left';
  if (modifier.includes('slight right')) return 'bear right';
  if (modifier === 'left') return 'turn left';
  if (modifier === 'right') return 'turn right';
  if (modifier.includes('sharp left')) return 'turn sharp left';
  if (modifier.includes('sharp right')) return 'turn sharp right';
  if (type.includes('roundabout') || type === 'rotary') return 'enter the roundabout';
  if (type === 'merge') return 'merge';
  return null;
}

function maneuverActionText(step: EcsGuidanceStep): string {
  if (isArrivalStep(step)) return 'you have arrived at your destination';
  if (isUTurnStep(step)) return 'make a U-turn when safe';
  const roadName = roadNameForStep(step);
  const verb = turnVerb(step);
  if (verb) return `${verb} onto ${roadName}`;
  const instruction = cleanString(step.instruction);
  return instruction ? lowerLead(instruction) : `continue on ${roadName}`;
}

function followingTextForStep(step: EcsGuidanceStep | null | undefined): string | null {
  if (!step || isArrivalStep(step)) return null;
  const action = maneuverActionText(step);
  return action ? `Then ${action}` : null;
}

function buildTurnByTurnDisplay(input: ActiveGuidanceManeuverDisplayInput): ActiveGuidanceManeuverDisplay {
  const progress = input.progress;
  const currentStep = progress?.currentStep ?? null;
  const nextStep = progress?.nextStep ?? null;
  const activeStep = nextStep ?? currentStep;
  const distanceMeters = progress?.distanceToNextManeuverMeters ?? null;
  const distanceLabel = formatManeuverDistance(distanceMeters);

  if (currentStep && isArrivalStep(currentStep)) {
    return {
      mode: 'turn_by_turn',
      iconName: 'flag',
      eyebrow: 'ARRIVED',
      distanceLabel: '0 ft',
      primaryText: 'You have arrived at your destination',
      detailText: roadNameForStep(currentStep, input.route?.id),
      roadName: roadNameForStep(currentStep, input.route?.id),
      followingText: null,
      guidanceAvailable: true,
    };
  }

  if (nextStep && isUTurnStep(nextStep)) {
    return {
      mode: 'turn_by_turn',
      iconName: 'refresh',
      eyebrow: 'NEXT TURN',
      distanceLabel,
      primaryText: 'Make a U-turn when safe',
      detailText: roadNameForStep(nextStep),
      roadName: roadNameForStep(nextStep),
      followingText: null,
      guidanceAvailable: true,
    };
  }

  if (nextStep) {
    const action = maneuverActionText(nextStep);
    const followingSoon =
      progress?.followingStep &&
      (!Number.isFinite(nextStep.distanceMeters) || nextStep.distanceMeters <= 300)
        ? followingTextForStep(progress.followingStep)
        : null;
    return {
      mode: 'turn_by_turn',
      iconName: getManeuverIconName(nextStep.maneuverType, nextStep.maneuverModifier),
      eyebrow: 'NEXT TURN',
      distanceLabel,
      primaryText: `In ${distanceLabel}, ${action}`,
      detailText: roadNameForStep(nextStep),
      roadName: roadNameForStep(nextStep),
      followingText: followingSoon,
      guidanceAvailable: true,
    };
  }

  const currentRoadName = roadNameForStep(currentStep, progress?.currentRoadName);
  return {
    mode: 'turn_by_turn',
    iconName: getManeuverIconName(currentStep?.maneuverType, currentStep?.maneuverModifier),
    eyebrow: 'CONTINUE',
    distanceLabel,
    primaryText: `Continue ${distanceLabel} on ${currentRoadName}`,
    detailText: currentRoadName,
    roadName: currentRoadName,
    followingText: null,
    guidanceAvailable: true,
  };
}

export function buildActiveGuidanceManeuverDisplay(
  input: ActiveGuidanceManeuverDisplayInput,
): ActiveGuidanceManeuverDisplay {
  if (input.status === 'rerouting') {
    return {
      mode: 'rerouting',
      iconName: 'sync',
      eyebrow: 'REROUTING',
      distanceLabel: null,
      primaryText: 'Recalculating route...',
      detailText: 'Keeping route summary visible.',
      roadName: 'Route update',
      followingText: null,
      guidanceAvailable: false,
    };
  }

  if (input.previewLoading || input.status === 'destination_selected') {
    return {
      mode: 'calculating',
      iconName: 'navigate',
      eyebrow: 'CALCULATING',
      distanceLabel: null,
      primaryText: 'Calculating route...',
      detailText: 'Preparing guidance.',
      roadName: 'Route',
      followingText: null,
      guidanceAvailable: false,
    };
  }

  const routeStatus = cleanString(input.routeStatusLabel)?.toLowerCase() ?? '';
  if (routeStatus.includes('unable to recalculate')) {
    return {
      mode: 'unavailable',
      iconName: 'alert-circle-outline',
      eyebrow: 'REROUTE FAILED',
      distanceLabel: null,
      primaryText: 'Return to the highlighted route when safe',
      detailText: 'Unable to recalculate route',
      roadName: 'Highlighted route',
      followingText: null,
      guidanceAvailable: false,
    };
  }
  if (!input.progress && (routeStatus.includes('rejoined') || routeStatus.includes('updated'))) {
    return {
      mode: 'updated',
      iconName: 'checkmark-circle-outline',
      eyebrow: 'ROUTE UPDATED',
      distanceLabel: null,
      primaryText: 'Route updated',
      detailText: 'Turn guidance refreshed.',
      roadName: 'Route',
      followingText: null,
      guidanceAvailable: true,
    };
  }

  const mode = input.route?.guidanceMode ?? input.guidanceMode;
  if (mode === 'summary_only') {
    const limitation = cleanString(input.route?.guidanceLimitationLabel);
    return {
      mode: 'summary_only',
      iconName: 'map-outline',
      eyebrow: 'ROUTE SUMMARY',
      distanceLabel: null,
      primaryText: 'Turn-by-turn unavailable for this route',
      detailText: limitation ?? 'Showing route summary.',
      roadName: 'Route summary',
      followingText: null,
      guidanceAvailable: false,
    };
  }

  if (mode === 'unavailable' || !input.route) {
    return {
      mode: 'unavailable',
      iconName: 'alert-circle-outline',
      eyebrow: 'GUIDANCE',
      distanceLabel: null,
      primaryText: 'Guidance unavailable',
      detailText: 'Use the highlighted route when visible.',
      roadName: 'Route',
      followingText: null,
      guidanceAvailable: false,
    };
  }

  if (!input.progress) {
    return {
      mode: 'turn_by_turn',
      iconName: 'navigate',
      eyebrow: 'ACTIVE GUIDANCE',
      distanceLabel: null,
      primaryText: 'Route updated',
      detailText: 'Waiting for GPS progress.',
      roadName: 'Route',
      followingText: null,
      guidanceAvailable: true,
    };
  }

  return buildTurnByTurnDisplay(input);
}
