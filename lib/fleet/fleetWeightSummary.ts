import {
  createFleetWeightValue,
  type FleetRiskLevel,
  type FleetScoringResult,
  type FleetVehicle,
  type FleetWeightResult,
  type WeightVerification,
} from './fleetPremiumDomain';

export type FleetWeightRiskFlag = {
  id: string;
  label: string;
  detail: string;
  level: FleetRiskLevel;
};

export type FleetWeightSummary = {
  baseNetWeightLb: number;
  permanentAccessoryWeightLb: number;
  currentLoadoutWeightLb: number;
  consumablesWeightLb: number;
  operatingWeightLb: number;
  gvwrLb: number | null;
  payloadRemainingLb: number | null;
  gvwrUsagePct: number | null;
  estimatedFrontAxleWeightLb: number | null;
  estimatedRearAxleWeightLb: number | null;
  highMountedAddedWeightLb: number;
  rearHitchAddedWeightLb: number;
  confidenceScore: number;
  confidenceLevel: FleetWeightResult['confidenceMetadata']['level'];
  confidenceLabel: string;
  confidenceCopy: string;
  readinessScore: number | null;
  riskFlags: FleetWeightRiskFlag[];
};

const RISK_RANK: Record<FleetRiskLevel, number> = {
  clear: 0,
  watch: 1,
  caution: 2,
  critical: 3,
};

function highestRisk(...levels: FleetRiskLevel[]): FleetRiskLevel {
  return levels.reduce((highest, level) => (RISK_RANK[level] > RISK_RANK[highest] ? level : highest), 'clear' as FleetRiskLevel);
}

function payloadRiskLevel(payloadRemainingLb: number | null, gvwrLb: number | null): FleetRiskLevel {
  if (payloadRemainingLb == null || gvwrLb == null || gvwrLb <= 0) return 'watch';
  if (payloadRemainingLb < 0) return 'critical';
  const marginPct = payloadRemainingLb / gvwrLb;
  if (marginPct <= 0.05) return 'critical';
  if (marginPct <= 0.1) return 'caution';
  if (marginPct <= 0.15) return 'watch';
  return 'clear';
}

function addedHighMountedRisk(weightLb: number, existingRisk: FleetRiskLevel): FleetRiskLevel {
  if (RISK_RANK[existingRisk] >= RISK_RANK.caution) return existingRisk;
  if (weightLb >= 300) return 'critical';
  if (weightLb >= 180) return 'caution';
  if (weightLb >= 90) return 'watch';
  return existingRisk;
}

function addedRearHitchRisk(weightLb: number, existingRisk: FleetRiskLevel): FleetRiskLevel {
  if (RISK_RANK[existingRisk] >= RISK_RANK.caution) return existingRisk;
  if (weightLb >= 600) return 'critical';
  if (weightLb >= 350) return 'caution';
  if (weightLb >= 175) return 'watch';
  return existingRisk;
}

export function buildFleetWeightSummary(
  vehicle: FleetVehicle,
  weightResult: FleetWeightResult,
  scoringResult?: FleetScoringResult | null,
): FleetWeightSummary {
  const highMountedAddedWeightLb =
    weightResult.zoneWeights.roof.totalWeight.lbs +
    weightResult.zoneWeights.bedHigh.totalWeight.lbs;
  const rearHitchAddedWeightLb =
    weightResult.zoneWeights.rearLow.totalWeight.lbs +
    weightResult.zoneWeights.bedLow.totalWeight.lbs +
    weightResult.zoneWeights.bedHigh.totalWeight.lbs +
    weightResult.zoneWeights.hitch.totalWeight.lbs +
    weightResult.zoneWeights.trailer.totalWeight.lbs;

  const frontBase = vehicle.buildProfile.frontBaseWeight?.lbs ?? Math.round(weightResult.baseNetWeight.lbs * 0.52);
  const rearBase = vehicle.buildProfile.rearBaseWeight?.lbs ?? Math.max(0, weightResult.baseNetWeight.lbs - frontBase);
  const estimatedFrontAxleWeightLb = Math.round(
    frontBase +
      weightResult.zoneWeights.frontLow.totalWeight.lbs +
      weightResult.zoneWeights.cab.totalWeight.lbs * 0.55 +
      weightResult.zoneWeights.underbody.totalWeight.lbs * 0.5,
  );
  const estimatedRearAxleWeightLb = Math.round(
    rearBase +
      weightResult.zoneWeights.rearLow.totalWeight.lbs +
      weightResult.zoneWeights.bedLow.totalWeight.lbs +
      weightResult.zoneWeights.bedHigh.totalWeight.lbs +
      weightResult.zoneWeights.hitch.totalWeight.lbs +
      weightResult.zoneWeights.trailer.totalWeight.lbs +
      weightResult.zoneWeights.roof.totalWeight.lbs * 0.5 +
      weightResult.zoneWeights.cab.totalWeight.lbs * 0.45 +
      weightResult.zoneWeights.underbody.totalWeight.lbs * 0.5,
  );

  const payloadRisk = payloadRiskLevel(weightResult.payloadRemaining?.lbs ?? null, weightResult.gvwr?.lbs ?? null);
  const highMountedRisk = addedHighMountedRisk(highMountedAddedWeightLb, weightResult.topHeavyRisk);
  const rearHitchRisk = addedRearHitchRisk(rearHitchAddedWeightLb, weightResult.rearAxleRisk);
  const frontAxleRisk = weightResult.frontAxleRisk;

  const riskFlagCandidates: Array<FleetWeightRiskFlag | null> = [
    payloadRisk !== 'clear'
      ? {
          id: 'payload',
          label: payloadRisk === 'critical' ? 'Payload limit risk' : 'Payload margin getting tight',
          detail: weightResult.payloadRemaining && weightResult.payloadRemaining.lbs < 0
            ? 'Operating weight is above GVWR. Reduce load before staging.'
            : 'Payload remaining is low. GVWR is the max loaded rating, not the actual vehicle weight.',
          level: payloadRisk,
        }
      : null,
    highMountedRisk !== 'clear'
      ? {
          id: 'high-mounted',
          label: 'High-mounted load risk',
          detail: 'Roof and bed-high weight can raise top-heavy risk. Move weight lower when possible.',
          level: highMountedRisk,
        }
      : null,
    rearHitchRisk !== 'clear'
      ? {
          id: 'rear-hitch',
          label: 'Rear and hitch load bias',
          detail: 'Rear-low, bed, hitch, and trailer weight can increase rear axle bias.',
          level: rearHitchRisk,
        }
      : null,
    frontAxleRisk !== 'clear'
      ? {
          id: 'front-axle',
          label: 'Front axle load watch',
          detail: 'Front-low installed weight may affect front axle behavior.',
          level: frontAxleRisk,
        }
      : null,
  ];
  const riskFlags = riskFlagCandidates.filter((item): item is FleetWeightRiskFlag => Boolean(item));

  return {
    baseNetWeightLb: weightResult.baseNetWeight.lbs,
    permanentAccessoryWeightLb: weightResult.installedAccessoryWeight.lbs,
    currentLoadoutWeightLb: weightResult.activeLoadoutWeight.lbs,
    consumablesWeightLb: weightResult.consumablesWeight.lbs,
    operatingWeightLb: weightResult.operatingWeight.lbs,
    gvwrLb: weightResult.gvwr?.lbs ?? null,
    payloadRemainingLb: weightResult.payloadRemaining?.lbs ?? null,
    gvwrUsagePct: weightResult.gvwrUsagePct,
    estimatedFrontAxleWeightLb,
    estimatedRearAxleWeightLb,
    highMountedAddedWeightLb,
    rearHitchAddedWeightLb,
    confidenceScore: weightResult.confidence,
    confidenceLevel: weightResult.confidenceMetadata.level,
    confidenceLabel: weightResult.confidenceMetadata.label,
    confidenceCopy: weightResult.confidenceMetadata.copy,
    readinessScore: scoringResult?.readinessScore ?? null,
    riskFlags,
  };
}

export function applyFleetWeightVerification(
  vehicle: FleetVehicle,
  verification: WeightVerification,
): FleetVehicle {
  const verifiedWeight = createFleetWeightValue(verification.weight.lbs, verification.method, {
    confidence: verification.weight.confidence,
    sourceLabel: verification.sourceLabel,
    verifiedAt: verification.recordedAt,
    verificationId: verification.id,
    allowNegative: verification.target === 'payloadRemaining',
  });
  const buildProfile = { ...vehicle.buildProfile };
  if (verification.target === 'baseNetWeight') buildProfile.baseNetWeight = verifiedWeight;
  if (verification.target === 'curbWeight') buildProfile.curbWeight = verifiedWeight;
  if (verification.target === 'emptyWeight') buildProfile.emptyWeight = verifiedWeight;
  if (verification.target === 'gvwr') buildProfile.gvwr = verifiedWeight;
  if (verification.target === 'frontBaseWeight') buildProfile.frontBaseWeight = verifiedWeight;
  if (verification.target === 'rearBaseWeight') buildProfile.rearBaseWeight = verifiedWeight;

  return {
    ...vehicle,
    buildProfile: {
      ...buildProfile,
      updatedAt: verification.recordedAt,
    },
    updatedAt: verification.recordedAt,
  };
}

export function fleetRiskTone(level: FleetRiskLevel): 'ready' | 'info' | 'warning' | 'unavailable' {
  if (level === 'critical') return 'unavailable';
  if (level === 'caution') return 'warning';
  if (level === 'watch') return 'info';
  return 'ready';
}
