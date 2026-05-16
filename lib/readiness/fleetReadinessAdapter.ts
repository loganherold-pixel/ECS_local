import type { ECSVehicularState } from '../fleet/activeVehicleState';
import type {
  ExpeditionReadinessConfidence,
  ExpeditionReadinessVehicleInput,
} from './expeditionReadinessTypes';

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function roundTenths(value: number): number {
  return Math.round(value * 10) / 10;
}

function deriveGroundClearance(vehicleState: ECSVehicularState): {
  oemGroundClearanceInches: number | null;
  adjustmentInches: number;
  computedGroundClearanceInches: number | null;
} {
  const buildProfile = vehicleState.canonicalFleetState?.fleetVehicle.buildProfile;
  const oemGroundClearanceInches =
    finiteNumber(vehicleState.specs?.ground_clearance_inches)
    ?? finiteNumber((vehicleState.specs as any)?.groundClearanceInches)
    ?? finiteNumber(buildProfile?.groundClearanceInches);
  const lift = finiteNumber(vehicleState.capability.suspensionLiftInches);
  const frontLevel = vehicleState.modifications.isLeveled
    ? finiteNumber(vehicleState.modifications.frontLevelInches)
    : null;
  const adjustmentInches = Math.max(0, lift ?? 0, frontLevel ?? 0);

  return {
    oemGroundClearanceInches,
    adjustmentInches,
    computedGroundClearanceInches:
      oemGroundClearanceInches == null
        ? null
        : roundTenths(oemGroundClearanceInches + adjustmentInches),
  };
}

function confidenceFromFleet(label: string | null | undefined): ExpeditionReadinessConfidence {
  if (label === 'verified' || label === 'high') return 'high';
  if (label === 'medium') return 'medium';
  return 'low';
}

function compactVehicleName(vehicleState: ECSVehicularState): string {
  const parts = [
    vehicleState.identity.year,
    vehicleState.identity.make,
    vehicleState.identity.model,
    vehicleState.identity.trim,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : vehicleState.identity.displayName;
}

function textIncludesRecoveryGear(value: unknown): boolean {
  return /winch|recovery|traction|maxtrax|tow strap|tree saver|snatch|kinetic|shackle|soft shackle|hilift|hi-lift|jack|compressor|shovel/i
    .test(String(value ?? ''));
}

function detectRecoveryGear(vehicleState: ECSVehicularState): {
  ready: boolean | null;
  summary: string | null;
} {
  const names = [
    ...(vehicleState.canonicalFleetState?.accessories ?? []).map((item: any) => item.name ?? item.label ?? item.type ?? item.category),
    ...(vehicleState.canonicalFleetState?.loadoutItems ?? []).map((item: any) => item.name ?? item.label ?? item.category),
  ].filter(Boolean);
  if (names.length === 0) return { ready: null, summary: null };
  const recoveryItems = names.filter(textIncludesRecoveryGear).slice(0, 4);
  if (recoveryItems.length === 0) {
    return {
      ready: null,
      summary: 'Recovery gear is not visible in Fleet loadout or accessories.',
    };
  }
  return {
    ready: true,
    summary: `Recovery gear visible: ${recoveryItems.join(', ')}.`,
  };
}

function buildMissingSpecs(vehicleState: ECSVehicularState): string[] {
  const buildProfile = vehicleState.canonicalFleetState?.fleetVehicle.buildProfile;
  const clearance = deriveGroundClearance(vehicleState);
  return [
    !vehicleState.identity.vehicleType ? 'vehicle type' : null,
    !vehicleState.identity.make || !vehicleState.identity.model ? 'make/model' : null,
    !buildProfile?.drivetrain ? 'drivetrain' : null,
    vehicleState.capability.tireSizeInches == null ? 'tire size' : null,
    vehicleState.capability.suspensionLiftInches == null ? 'lift/suspension height' : null,
    clearance.computedGroundClearanceInches == null ? 'OEM ground clearance' : null,
    vehicleState.weight.gvwrLbs == null || vehicleState.weight.estimatedOperatingWeightLbs == null ? 'operating weight / payload' : null,
    vehicleState.capability.fuelTankCapacityGal == null ? 'fuel capacity' : null,
    vehicleState.capability.waterCapacityGal == null ? 'water storage' : null,
    vehicleState.capability.batteryUsableWh == null ? 'power system' : null,
    vehicleState.loadout.itemCount === 0 && vehicleState.modifications.accessoryCount === 0 ? 'accessory/loadout details' : null,
  ].filter((item): item is string => Boolean(item));
}

function buildStrengths(vehicleState: ECSVehicularState): string[] {
  const strengths: string[] = [];
  const classification = vehicleState.intelligence.classification;
  const tire = vehicleState.capability.tireSizeInches;
  const lift = vehicleState.capability.suspensionLiftInches;
  const clearance = deriveGroundClearance(vehicleState);
  if (classification.traits.trailManeuverability === 'high') strengths.push('Short wheelbase improves maneuvering on tight routes.');
  if (classification.traits.payloadProfile === 'heavy') strengths.push('Heavy payload platform can support larger expedition loads when width and turnarounds fit.');
  if (classification.traits.clearanceBias === 'high') strengths.push('Clearance/tire profile appears strong for rougher surfaces.');
  if ((tire ?? 0) >= 33) strengths.push(`${tire} in tires improve obstacle and sidewall margin.`);
  if ((lift ?? 0) >= 2) strengths.push(`${lift} in lift is included in vehicle fit.`);
  if ((clearance.computedGroundClearanceInches ?? 0) >= 10) {
    const adjustmentCopy = clearance.adjustmentInches > 0 ? ` after ${clearance.adjustmentInches} in lift/level adjustment` : '';
    strengths.push(`${clearance.computedGroundClearanceInches} in computed clearance${adjustmentCopy} is included in route fit.`);
  }
  if (vehicleState.weight.remainingPayloadLbs != null && vehicleState.weight.remainingPayloadLbs > 500) {
    strengths.push(`${Math.round(vehicleState.weight.remainingPayloadLbs)} lb payload margin remains.`);
  }
  return Array.from(new Set(strengths)).slice(0, 4);
}

function buildConcerns(vehicleState: ECSVehicularState, recoverySummary: string | null): string[] {
  const concerns: string[] = [];
  const classification = vehicleState.intelligence.classification;
  if (classification.classId === 'compact_suv_crossover') {
    concerns.push('Compact crossover profile: clearance, tires, and approach angle can become limiting on rough routes.');
  }
  if (classification.classId === 'full_size_hd_truck') {
    concerns.push('HD truck profile: width, weight, turnarounds, and trail shelf roads need review.');
  }
  if (classification.classId === 'van_overland_van') {
    concerns.push('Van profile: height, departure angle, wheelbase, and narrow-track access need review.');
  }
  if (classification.classId === 'short_wheelbase_4x4') {
    concerns.push('Short wheelbase helps trail fit, but roof and rear cargo weight still need control.');
  }
  if (vehicleState.centerOfGravity.topHeavyRisk === 'critical' || vehicleState.centerOfGravity.topHeavyRisk === 'caution') {
    concerns.push('Top-heavy load risk is elevated from Fleet weight distribution.');
  }
  if (vehicleState.weight.payloadUsedPct != null && vehicleState.weight.payloadUsedPct >= 85) {
    concerns.push(`Payload usage is ${Math.round(vehicleState.weight.payloadUsedPct)}% of GVWR.`);
  }
  if (recoverySummary) concerns.push(recoverySummary);
  vehicleState.weight.warnings.slice(0, 2).forEach((warning) => concerns.push(warning));
  return Array.from(new Set(concerns)).slice(0, 5);
}

export function buildReadinessVehicleInputFromFleetState(
  vehicleState: ECSVehicularState,
): ExpeditionReadinessVehicleInput | null {
  if (!vehicleState.identity.hasVehicle) return null;
  const buildProfile = vehicleState.canonicalFleetState?.fleetVehicle.buildProfile;
  const avgMpg = finiteNumber(vehicleState.vehicle?.avg_mpg);
  const rangeMiles =
    avgMpg != null && vehicleState.capability.currentFuelGallons > 0
      ? Math.round(avgMpg * vehicleState.capability.currentFuelGallons)
      : null;
  const gvwrUsagePct =
    vehicleState.weight.estimatedOperatingWeightLbs != null &&
    vehicleState.weight.gvwrLbs != null &&
    vehicleState.weight.gvwrLbs > 0
      ? (vehicleState.weight.estimatedOperatingWeightLbs / vehicleState.weight.gvwrLbs) * 100
      : vehicleState.weight.payloadUsedPct;
  const recovery = detectRecoveryGear(vehicleState);
  const clearance = deriveGroundClearance(vehicleState);
  const missingSpecs = buildMissingSpecs(vehicleState);
  const keyStrengths = buildStrengths(vehicleState);
  const keyConcerns = buildConcerns(vehicleState, recovery.summary);

  return {
    vehicleId: vehicleState.identity.vehicleId,
    label: compactVehicleName(vehicleState),
    vehicleType: vehicleState.identity.vehicleType,
    make: vehicleState.identity.make,
    model: vehicleState.identity.model,
    submodel: vehicleState.identity.trim ?? buildProfile?.trim ?? null,
    classificationLabel: vehicleState.intelligence.classification.label,
    vehicleClass: vehicleState.intelligence.classification.classId,
    drivetrain: buildProfile?.drivetrain ?? vehicleState.specs?.drivetrain ?? null,
    tireSizeInches: vehicleState.capability.tireSizeInches,
    suspensionLiftInches: vehicleState.capability.suspensionLiftInches,
    groundClearanceInches: clearance.computedGroundClearanceInches,
    wheelbaseInches: buildProfile?.wheelbaseIn ?? vehicleState.specs?.wheelbase_in ?? null,
    operatingWeightLbs: vehicleState.weight.estimatedOperatingWeightLbs,
    payloadCapacityLbs: vehicleState.weight.payloadCapacityLbs,
    profileComplete: vehicleState.status === 'ready',
    disabled: false,
    gvwrUsagePct,
    payloadRemainingLbs: vehicleState.weight.remainingPayloadLbs,
    clearanceConcern:
      vehicleState.intelligence.classification.traits.clearanceBias === 'low' ||
      vehicleState.centerOfGravity.topHeavyRisk === 'critical',
    recoveryGearReady: recovery.ready,
    recoveryGearSummary: recovery.summary,
    fuelCapacityGal: vehicleState.capability.fuelTankCapacityGal,
    fuelRangeMiles: rangeMiles,
    waterCapacityGal: vehicleState.capability.waterCapacityGal,
    powerSystemWh: vehicleState.capability.batteryUsableWh,
    accessoryLoadoutWeightLbs: vehicleState.weight.accessoryWeightLbs,
    activeLoadoutWeightLbs: vehicleState.weight.cargoLoadoutWeightLbs,
    keyStrengths,
    keyConcerns,
    missingSpecs,
    recommendations: vehicleState.intelligence.suggestions,
    vehicleFitConfidence: confidenceFromFleet(vehicleState.confidence.label),
    source: 'manual',
    updatedAt: vehicleState.updatedAt,
    isStale: false,
  };
}
