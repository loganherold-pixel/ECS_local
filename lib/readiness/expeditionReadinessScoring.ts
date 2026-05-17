import type {
  ExpeditionReadinessAssessment,
  ExpeditionReadinessCampCandidateInput,
  ExpeditionReadinessCategory,
  ExpeditionReadinessCategoryId,
  ExpeditionReadinessConfidence,
  ExpeditionReadinessDataIntegrity,
  ExpeditionPowerBrief,
  ExpeditionRecoveryBrief,
  ExpeditionReadinessFactor,
  ExpeditionReadinessFreshnessRecord,
  ExpeditionReadinessInput,
  ExpeditionReadinessIssue,
  ExpeditionReadinessSourceFreshness,
  ExpeditionReadinessSourceKind,
  ExpeditionReadinessStatus,
  ExpeditionReadinessThresholds,
} from './expeditionReadinessTypes';
import { EXPEDITION_READINESS_CATEGORY_IDS } from './expeditionReadinessTypes';
import { buildDepartureAudit } from './departureAudit';
import {
  DEFAULT_EXPEDITION_READINESS_WEIGHTS,
  resolveExpeditionReadinessCalibration,
  resolveExpeditionTripIntent,
} from './expeditionReadinessCalibration';
import {
  applyReadinessPreferenceCalibration,
  buildReadinessPreferenceGuardrails,
  DEFAULT_EXPEDITION_READINESS_PREFERENCES,
  normalizeExpeditionReadinessPreferences,
} from './expeditionReadinessPreferences';

type CategoryDraft = Omit<ExpeditionReadinessCategory, 'status'> & {
  blockerIssues?: ExpeditionReadinessIssue[];
  warningIssues?: ExpeditionReadinessIssue[];
};

export const EXPEDITION_READINESS_WEIGHTS: Record<ExpeditionReadinessCategoryId, number> = {
  ...DEFAULT_EXPEDITION_READINESS_WEIGHTS,
};

const CATEGORY_LABELS: Record<ExpeditionReadinessCategoryId, string> = {
  vehicle_fit: 'Vehicle Fit',
  route_risk: 'Route Risk',
  camp_legality_confidence: 'Camp Legality Confidence',
  weather_window: 'Weather Window',
  daylight_margin: 'Daylight Margin',
  offline_preparedness: 'Offline Preparedness',
  fuel_range_margin: 'Fuel / Range Margin',
  power_runtime: 'Power Runtime',
  recovery_bailout_access: 'Recovery / Bailout Access',
  communications_signal_confidence: 'Communications / Signal Confidence',
};

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function issue(
  categoryId: ExpeditionReadinessCategoryId,
  severity: ExpeditionReadinessIssue['severity'],
  id: string,
  label: string,
  detail: string,
): ExpeditionReadinessIssue {
  return { id, categoryId, severity, label, detail };
}

function confidenceRank(confidence: ExpeditionReadinessConfidence): number {
  if (confidence === 'high') return 3;
  if (confidence === 'medium') return 2;
  return 1;
}

function minConfidence(values: ExpeditionReadinessConfidence[]): ExpeditionReadinessConfidence {
  if (values.some((value) => value === 'low')) return 'low';
  if (values.some((value) => value === 'medium')) return 'medium';
  return 'high';
}

function sourceFrom(input: { source?: ExpeditionReadinessSourceKind; isMock?: boolean; isDemo?: boolean; isInferred?: boolean } | null | undefined): ExpeditionReadinessSourceKind {
  if (!input) return 'missing';
  if (input.isDemo) return 'demo';
  if (input.isMock) return 'mock';
  if (input.isInferred) return 'inferred';
  return input.source ?? 'unknown';
}

function isStaleInput(input: { updatedAt?: string | null; staleAfterMinutes?: number | null; isStale?: boolean } | null | undefined, nowIso: string, fallbackMinutes = 360): boolean {
  if (!input) return false;
  if (input.isStale) return true;
  if (!input.updatedAt) return false;
  const updatedAtMs = Date.parse(input.updatedAt);
  const nowMs = Date.parse(nowIso);
  if (Number.isNaN(updatedAtMs) || Number.isNaN(nowMs)) return false;
  return nowMs - updatedAtMs > fallbackMinutes * 60 * 1000;
}

function freshness(
  label: string,
  input: { source?: ExpeditionReadinessSourceKind; updatedAt?: string | null; isStale?: boolean; isMock?: boolean; isDemo?: boolean; isInferred?: boolean } | null | undefined,
  nowIso: string,
): ExpeditionReadinessFreshnessRecord {
  const source = sourceFrom(input);
  const missing = !input || source === 'missing';
  const stale = isStaleInput(input, nowIso);
  const isMock = input?.isMock === true || source === 'mock';
  const isDemo = input?.isDemo === true || source === 'demo';
  const isInferred = input?.isInferred === true || source === 'inferred';
  const state = missing
    ? 'missing'
    : isDemo
      ? 'demo'
      : isMock
        ? 'mock'
        : isInferred
          ? 'inferred'
          : stale
            ? 'stale'
            : source === 'manual'
              ? 'manual'
              : source === 'unknown'
                ? 'unknown'
                : 'fresh';

  return {
    state,
    source,
    updatedAt: input?.updatedAt ?? null,
    label,
    isStale: stale,
    isMissing: missing,
    isMock,
    isDemo,
    isInferred,
  };
}

function factor(
  id: string,
  label: string,
  detail: string,
  impact: ExpeditionReadinessFactor['impact'],
  source: ExpeditionReadinessSourceKind,
  confidence: ExpeditionReadinessConfidence = 'medium',
  flags: Partial<Pick<ExpeditionReadinessFactor, 'updatedAt' | 'isStale' | 'isMock' | 'isDemo' | 'isInferred'>> = {},
): ExpeditionReadinessFactor {
  return { id, label, detail, impact, source, confidence, ...flags };
}

export function getReadinessStatusFromScore(
  score: number,
  blockers: ExpeditionReadinessIssue[] | string[] = [],
  thresholds: ExpeditionReadinessThresholds = { ready: 82, caution: 60 },
): ExpeditionReadinessStatus {
  if (blockers.length > 0 || score < thresholds.caution) return 'hold';
  if (score >= thresholds.ready) return 'ready';
  return 'caution';
}

export function getReadinessCategoryStatus(
  score: number,
  missingInputs: string[] = [],
  blockers: ExpeditionReadinessIssue[] | string[] = [],
  thresholds: ExpeditionReadinessThresholds = { ready: 82, caution: 60 },
): ExpeditionReadinessStatus {
  if (blockers.length > 0 || score < thresholds.caution) return 'hold';
  if (score >= thresholds.ready && missingInputs.length === 0) return 'ready';
  return 'caution';
}

function finalizeCategory(
  draft: CategoryDraft,
  thresholds: ExpeditionReadinessThresholds = { ready: 82, caution: 60 },
): ExpeditionReadinessCategory {
  return {
    ...draft,
    score: clampScore(draft.score),
    status: getReadinessCategoryStatus(draft.score, draft.missingInputs, draft.blockerIssues ?? [], thresholds),
  };
}

function retuneCategory(
  category: ExpeditionReadinessCategory,
  patch: Partial<Pick<ExpeditionReadinessCategory, 'score' | 'confidence' | 'summary' | 'missingInputs' | 'factors'>>,
  thresholds: ExpeditionReadinessThresholds,
): ExpeditionReadinessCategory {
  const next = {
    ...category,
    ...patch,
    score: clampScore(patch.score ?? category.score),
    missingInputs: patch.missingInputs ?? category.missingInputs,
    factors: patch.factors ?? category.factors,
  };
  return {
    ...next,
    status: getReadinessCategoryStatus(next.score, next.missingInputs, [], thresholds),
  };
}

function sourceFlags(input: { source?: ExpeditionReadinessSourceKind; updatedAt?: string | null; isStale?: boolean; isMock?: boolean; isDemo?: boolean; isInferred?: boolean } | null | undefined, nowIso: string) {
  const source = sourceFrom(input);
  return {
    source,
    updatedAt: input?.updatedAt ?? null,
    isStale: isStaleInput(input, nowIso),
    isMock: input?.isMock === true || source === 'mock',
    isDemo: input?.isDemo === true || source === 'demo',
    isInferred: input?.isInferred === true || source === 'inferred',
  };
}

function hasFourWheelDrive(drivetrain: string | null | undefined): boolean | null {
  if (!drivetrain) return null;
  const normalized = drivetrain.toLowerCase();
  if (/4x4|4wd|awd|all wheel/.test(normalized)) return true;
  if (/2wd|fwd|rwd|front wheel|rear wheel/.test(normalized)) return false;
  return null;
}

function routeDifficultyRank(route: ExpeditionReadinessInput['route']): number {
  switch (route?.difficulty) {
    case 'technical':
      return 4;
    case 'hard':
      return 3;
    case 'moderate':
      return 2;
    case 'easy':
      return 1;
    default:
      return route?.riskLevel === 'critical' || route?.riskLevel === 'high' ? 3 : 0;
  }
}

function routeIsRemote(input: ExpeditionReadinessInput): boolean {
  const route = input.route;
  const offline = input.offline;
  if (offline?.isRemoteRoute === true) return true;
  if (route?.riskLevel === 'critical' || route?.riskLevel === 'high') return true;
  if (route?.difficulty === 'technical' || route?.difficulty === 'hard') return true;
  if (typeof route?.distanceMiles === 'number' && route.distanceMiles >= 40) return true;
  if (input.communications?.signalConfidence === 'low' || input.communications?.cellularExpected === false) return true;
  return false;
}

function vehicleClassConcern(vehicleClass: string | null | undefined, difficultyRank: number): string | null {
  if (!vehicleClass || difficultyRank <= 1) return null;
  if (vehicleClass === 'compact_suv_crossover' && difficultyRank >= 3) {
    return 'Compact SUV / crossover profile needs extra review for hard or technical routes.';
  }
  if (vehicleClass === 'full_size_hd_truck' && difficultyRank >= 3) {
    return 'HD truck profile needs trail width, weight, and turnaround review.';
  }
  if (vehicleClass === 'van_overland_van' && difficultyRank >= 2) {
    return 'Van profile needs height, departure angle, wheelbase, and narrow access review.';
  }
  if (vehicleClass === 'full_size_suv' && difficultyRank >= 4) {
    return 'Full-size SUV profile needs tight switchback, shelf road, and departure-angle review.';
  }
  return null;
}

function vehicleFit(input: ExpeditionReadinessInput, nowIso: string): CategoryDraft {
  const vehicle = input.activeVehicle;
  const flags = sourceFlags(vehicle, nowIso);
  const difficultyRank = routeDifficultyRank(input.route);
  const missingInputs: string[] = [];
  const blockers: ExpeditionReadinessIssue[] = [];
  const warnings: ExpeditionReadinessIssue[] = [];
  const factors: ExpeditionReadinessFactor[] = [];
  let score = 82;

  if (!vehicle?.vehicleId && !vehicle?.label) {
    missingInputs.push('Vehicle profile');
    score -= 38;
    factors.push(factor('vehicle-missing', 'Vehicle profile', 'No active vehicle profile is available. Select a Fleet vehicle for personalized readiness.', 'missing', 'missing', 'low'));
  } else {
    const vehicleLabel = [
      vehicle.label,
      vehicle.classificationLabel ? `(${vehicle.classificationLabel})` : null,
    ].filter(Boolean).join(' ');
    factors.push(factor('vehicle-profile', 'Active vehicle', vehicleLabel || 'Active vehicle selected.', 'positive', flags.source, vehicle.vehicleFitConfidence ?? 'medium', flags));
  }

  if (vehicle?.disabled) {
    score = 20;
    blockers.push(issue('vehicle_fit', 'blocker', 'vehicle-disabled', 'Vehicle disabled', 'Active vehicle is marked disabled.'));
  }

  if (typeof vehicle?.gvwrUsagePct === 'number') {
    if (vehicle.gvwrUsagePct > 100) {
      score -= 32;
      warnings.push(issue('vehicle_fit', 'warning', 'gvwr-exceeded', 'GVWR exceeded', `Operating weight is ${Math.round(vehicle.gvwrUsagePct)}% of GVWR. Treat this as a clear over-capacity warning and rebalance or reduce load before departure.`));
    } else if (vehicle.gvwrUsagePct >= 92) {
      score -= 22;
      warnings.push(issue('vehicle_fit', 'warning', 'gvwr-tight', 'Payload margin tight', `Operating weight is ${Math.round(vehicle.gvwrUsagePct)}% of GVWR.`));
    } else if (vehicle.gvwrUsagePct >= 85) {
      score -= 10;
      warnings.push(issue('vehicle_fit', 'warning', 'gvwr-watch', 'Payload margin narrowing', `Operating weight is ${Math.round(vehicle.gvwrUsagePct)}% of GVWR.`));
    }
    factors.push(factor('gvwr-usage', 'GVWR usage', `${Math.round(vehicle.gvwrUsagePct)}% of GVWR.`, vehicle.gvwrUsagePct >= 92 ? 'warning' : 'positive', flags.source, vehicle.vehicleFitConfidence ?? 'medium', flags));
  } else if (vehicle) {
    missingInputs.push('GVWR usage');
    score -= 12;
  }

  if (vehicle) {
    (vehicle.missingSpecs ?? []).forEach((item) => {
      if (!missingInputs.includes(item)) missingInputs.push(item);
    });
    const missingPenalty = Math.min(18, (vehicle.missingSpecs?.length ?? 0) * 3);
    score -= missingPenalty;

    if (vehicle.classificationLabel) {
      factors.push(factor(
        'vehicle-class',
        'Vehicle type',
        vehicle.classificationLabel,
        'neutral',
        flags.source,
        vehicle.vehicleFitConfidence ?? 'medium',
        flags,
      ));
    }

    const drivetrainReady = hasFourWheelDrive(vehicle.drivetrain);
    if (difficultyRank >= 3) {
      if (drivetrainReady === false) {
        score -= 22;
        warnings.push(issue('vehicle_fit', 'warning', 'drivetrain-limited', 'Drivetrain limited', 'Hard or technical route fit is limited without 4WD/AWD drivetrain confidence.'));
      } else if (drivetrainReady == null) {
        score -= 8;
        missingInputs.push('drivetrain');
      } else {
        factors.push(factor('drivetrain', 'Drivetrain', `${vehicle.drivetrain} included in route fit.`, 'positive', flags.source, vehicle.vehicleFitConfidence ?? 'medium', flags));
      }
    }

    const tire = vehicle.tireSizeInches;
    const lift = vehicle.suspensionLiftInches;
    const clearance = vehicle.groundClearanceInches;
    if (difficultyRank >= 4) {
      if (tire == null && clearance == null) {
        score -= 14;
        missingInputs.push('tire size');
        missingInputs.push('clearance estimate');
      } else if ((tire ?? 0) < 33 && (clearance ?? 0) < 10 && (lift ?? 0) < 2) {
        score -= 22;
        warnings.push(issue('vehicle_fit', 'warning', 'technical-clearance-limited', 'Technical route fit limited', 'Tire, lift, or clearance profile appears limited for technical terrain.'));
      }
    } else if (difficultyRank >= 3) {
      if (tire == null && clearance == null) {
        score -= 8;
        missingInputs.push('tire size');
        missingInputs.push('clearance estimate');
      } else if ((tire ?? 0) < 30 && (clearance ?? 0) < 8) {
        score -= 14;
        warnings.push(issue('vehicle_fit', 'warning', 'hard-route-clearance-limited', 'Clearance margin limited', 'Hard route fit may be limited by tire or clearance profile.'));
      }
    }
    if (tire != null || lift != null || clearance != null) {
      factors.push(factor(
        'tire-lift-clearance',
        'Tire / Lift / Clearance',
        [
          tire != null ? `${tire} in tires` : null,
          lift != null ? `${lift} in lift` : null,
          clearance != null ? `${clearance} in clearance` : null,
        ].filter(Boolean).join(', ') || 'Tire, lift, and clearance details available.',
        'neutral',
        flags.source,
        vehicle.vehicleFitConfidence ?? 'medium',
        flags,
      ));
    }

    const classConcern = vehicleClassConcern(vehicle.vehicleClass, difficultyRank);
    if (classConcern) {
      const penalty = vehicle.vehicleClass === 'compact_suv_crossover'
        ? 18
        : vehicle.vehicleClass === 'van_overland_van'
          ? 16
          : 12;
      score -= penalty;
      warnings.push(issue('vehicle_fit', 'warning', 'vehicle-class-route-fit', 'Vehicle class needs route review', classConcern));
    }

    if (vehicle.fuelRangeMiles != null && input.route?.distanceMiles != null) {
      const margin = vehicle.fuelRangeMiles - input.route.distanceMiles;
      factors.push(factor(
        'vehicle-fuel-range',
        'Fuel / Range Margin',
        `${Math.round(vehicle.fuelRangeMiles)} mi estimated range for ${Math.round(input.route.distanceMiles)} mi route.`,
        margin < 25 ? 'warning' : 'positive',
        flags.source,
        vehicle.vehicleFitConfidence ?? 'medium',
        flags,
      ));
      if (margin < 0) {
        score -= 25;
        warnings.push(issue('vehicle_fit', 'warning', 'vehicle-range-short', 'Vehicle range short', 'Estimated vehicle fuel range is below route distance.'));
      } else if (margin < 25) {
        score -= 12;
        warnings.push(issue('vehicle_fit', 'warning', 'vehicle-range-tight', 'Vehicle range tight', 'Estimated vehicle fuel range margin is tight for this route.'));
      }
    } else if (vehicle && input.route?.distanceMiles != null) {
      missingInputs.push('fuel range');
      score -= 7;
    }

    if (difficultyRank >= 3 || input.route?.riskLevel === 'high' || input.route?.riskLevel === 'critical') {
      if (vehicle.recoveryGearReady === true) {
        factors.push(factor('recovery-gear', 'Recovery gear', vehicle.recoveryGearSummary ?? 'Recovery gear visible in Fleet.', 'positive', flags.source, vehicle.vehicleFitConfidence ?? 'medium', flags));
      } else {
        missingInputs.push('recovery gear');
        score -= 10;
        warnings.push(issue('vehicle_fit', 'warning', 'recovery-gear-missing', 'Recovery gear not confirmed', 'Recovery gear is not confirmed in Fleet for this route risk.'));
      }
    }

    (vehicle.keyConcerns ?? []).slice(0, 3).forEach((concern, index) => {
      factors.push(factor(`vehicle-concern-${index + 1}`, 'Vehicle concern', concern, 'warning', flags.source, vehicle.vehicleFitConfidence ?? 'medium', flags));
    });
    (vehicle.keyStrengths ?? []).slice(0, 2).forEach((strength, index) => {
      factors.push(factor(`vehicle-strength-${index + 1}`, 'Vehicle strength', strength, 'positive', flags.source, vehicle.vehicleFitConfidence ?? 'medium', flags));
    });
  }

  if (vehicle?.clearanceConcern) {
    score -= 18;
    warnings.push(issue('vehicle_fit', 'warning', 'clearance-concern', 'Vehicle clearance concern', 'Vehicle fit has a clearance or geometry concern for this route.'));
  }

  const confidence = vehicle?.vehicleFitConfidence ?? (missingInputs.length > 0 ? 'low' : 'medium');
  return {
    id: 'vehicle_fit',
    label: CATEGORY_LABELS.vehicle_fit,
    score,
    confidence,
    summary: blockers.length ? blockers[0].detail : warnings[0]?.detail ?? (vehicle?.label ? `${vehicle.label} appears usable for the planned trip.` : 'Select an active Fleet vehicle for personalized readiness.'),
    factors,
    missingInputs,
    lastUpdatedAt: vehicle?.updatedAt ?? nowIso,
    blockerIssues: blockers,
    warningIssues: warnings,
  };
}

function routeRisk(input: ExpeditionReadinessInput, nowIso: string): CategoryDraft {
  const route = input.route;
  const flags = sourceFlags(route, nowIso);
  const missingInputs: string[] = [];
  const blockers: ExpeditionReadinessIssue[] = [];
  const warnings: ExpeditionReadinessIssue[] = [];
  const factors: ExpeditionReadinessFactor[] = [];
  let score = 84;

  if (!route?.routeId && !route?.name) {
    missingInputs.push('Route plan');
    score -= 36;
    factors.push(factor('route-missing', 'Route plan', 'No route has been selected or built.', 'missing', 'missing', 'low'));
  } else {
    factors.push(factor('route-selected', 'Route plan', route.name ?? 'Route selected.', 'positive', flags.source, route.routeConfidence ?? 'medium', flags));
  }

  if (route?.closureKnown) {
    score = 30;
    blockers.push(issue('route_risk', 'blocker', 'route-closure', 'Known route closure', 'A known route closure or hard restriction is present.'));
  }

  if (route?.riskLevel === 'critical') {
    score -= 40;
    blockers.push(issue('route_risk', 'blocker', 'critical-route-risk', 'Critical route risk', 'Route risk is marked critical.'));
  } else if (route?.riskLevel === 'high') {
    score -= 24;
    warnings.push(issue('route_risk', 'warning', 'high-route-risk', 'High route risk', 'Route has high ECS-inferred or reported risk.'));
  } else if (route?.riskLevel === 'moderate') {
    score -= 10;
  }

  if (route?.difficulty === 'technical') {
    score -= 16;
    warnings.push(issue('route_risk', 'warning', 'technical-route', 'Technical route', 'Route is marked technical and should be treated as elevated risk.'));
  }

  const hazardCount = route?.knownHazards?.length ?? 0;
  if (hazardCount > 0) {
    score -= Math.min(20, hazardCount * 8);
    warnings.push(issue('route_risk', 'warning', 'known-hazards', 'Known route hazards', `${hazardCount} route hazard${hazardCount === 1 ? '' : 's'} present.`));
  }

  if (flags.isStale) {
    score -= 10;
    warnings.push(issue('route_risk', 'warning', 'stale-route', 'Stale route data', 'Route data is stale; verify before departure.'));
  }

  const confidence = route?.routeConfidence ?? (missingInputs.length > 0 ? 'low' : 'medium');
  return {
    id: 'route_risk',
    label: CATEGORY_LABELS.route_risk,
    score,
    confidence,
    summary: blockers[0]?.detail ?? warnings[0]?.detail ?? 'Route risk inputs do not show a hard issue.',
    factors,
    missingInputs,
    lastUpdatedAt: route?.updatedAt ?? nowIso,
    blockerIssues: blockers,
    warningIssues: warnings,
  };
}

function bestCamp(camps: ExpeditionReadinessCampCandidateInput[] | null | undefined): ExpeditionReadinessCampCandidateInput | null {
  if (!camps?.length) return null;
  return [...camps].sort((a, b) => (
    (b.overallCampScore ?? b.suitabilityScore ?? 0) -
    (a.overallCampScore ?? a.suitabilityScore ?? 0)
  ))[0] ?? null;
}

function campLegality(input: ExpeditionReadinessInput, nowIso: string): CategoryDraft {
  const camp = bestCamp(input.campCandidates);
  const flags = sourceFlags(camp, nowIso);
  const missingInputs: string[] = [];
  const blockers: ExpeditionReadinessIssue[] = [];
  const warnings: ExpeditionReadinessIssue[] = [];
  const factors: ExpeditionReadinessFactor[] = [];
  let score = 78;

  if (!camp) {
    missingInputs.push('Camp candidate');
    missingInputs.push('Legal Access Confidence');
    score = 46;
    factors.push(factor('camp-missing', 'Camp candidate', 'No camp candidate is available for legality-confidence review.', 'missing', 'missing', 'low'));
  } else {
    const confidence = camp.legalAccessConfidence ?? 'unknown';
    const campName = camp.name ?? camp.label ?? 'Best available camp candidate.';
    factors.push(factor('camp-candidate', 'Camp candidate', campName, 'neutral', flags.source, confidence === 'unknown' ? 'low' : confidence, flags));
    if (camp.overallCampScore != null || camp.suitabilityScore != null) {
      factors.push(factor(
        'camp-suitability',
        'Camp Suitability',
        `Camp suitability is ${Math.round(camp.overallCampScore ?? camp.suitabilityScore ?? 0)}/100 from available CampOps signals.`,
        'neutral',
        flags.source,
        camp.sourceConfidence === 'unknown' ? 'low' : camp.sourceConfidence ?? (confidence === 'unknown' ? 'low' : confidence),
        flags,
      ));
    }
    if (camp.vehicleAccessConfidence) {
      factors.push(factor(
        'camp-vehicle-access',
        'Vehicle Access Confidence',
        camp.accessSummary ?? `Vehicle access confidence is ${camp.vehicleAccessConfidence}.`,
        camp.vehicleAccessConfidence === 'low' || camp.vehicleAccessConfidence === 'unknown' ? 'warning' : 'neutral',
        flags.source,
        camp.vehicleAccessConfidence === 'unknown' ? 'low' : camp.vehicleAccessConfidence,
        flags,
      ));
    }
    if (camp.terrainSuitabilityScore != null) {
      factors.push(factor(
        'camp-terrain',
        'Terrain Suitability',
        `Terrain suitability is ${Math.round(camp.terrainSuitabilityScore)}/100.`,
        camp.terrainSuitabilityScore < 55 ? 'warning' : 'neutral',
        flags.source,
        camp.sourceConfidence === 'unknown' ? 'low' : camp.sourceConfidence ?? 'medium',
        flags,
      ));
    }
    if (camp.weatherExposureSummary) {
      factors.push(factor(
        'camp-weather-exposure',
        'Weather Exposure',
        camp.weatherExposureSummary,
        /high|critical|storm|seasonal/i.test(camp.weatherExposureSummary) ? 'warning' : 'neutral',
        flags.source,
        camp.sourceConfidence === 'unknown' ? 'low' : camp.sourceConfidence ?? 'medium',
        flags,
      ));
    }
    if (camp.bailoutProximitySummary) {
      factors.push(factor(
        'camp-bailout-proximity',
        'Bailout Proximity',
        camp.bailoutProximitySummary,
        'neutral',
        flags.source,
        camp.sourceConfidence === 'unknown' ? 'low' : camp.sourceConfidence ?? 'medium',
        flags,
      ));
    }

    if (camp.accessStatus === 'closed') {
      score = 20;
      blockers.push(issue('camp_legality_confidence', 'blocker', 'camp-access-closed', 'Camp access closed', 'Best camp candidate access is marked closed.'));
    } else if (camp.accessStatus === 'restricted') {
      score -= 28;
      warnings.push(issue('camp_legality_confidence', 'warning', 'camp-access-restricted', 'Camp access restricted', 'Best camp candidate has restricted access; verify official requirements.'));
    } else if (camp.accessStatus === 'permit_required' || camp.accessStatus === 'seasonal') {
      score -= 14;
      warnings.push(issue('camp_legality_confidence', 'warning', 'camp-access-review', 'Camp access needs review', 'Best camp candidate may require permit or seasonal verification.'));
    }

    if (confidence === 'high') {
      score += camp.officialConfirmation ? 10 : 2;
    } else if (confidence === 'medium') {
      score -= 8;
      warnings.push(issue('camp_legality_confidence', 'warning', 'medium-legal-access-confidence', 'Medium Legal Access Confidence', 'Camp legality confidence is medium; verify if consequences are high.'));
    } else {
      score -= 30;
      warnings.push(issue('camp_legality_confidence', 'warning', 'low-legal-access-confidence', 'Low Legal Access Confidence', 'Camp Legality Confidence is low or unknown; ECS cannot claim official access legality.'));
    }

    if (camp.overallCampScore != null && camp.overallCampScore < 55) {
      score -= 12;
      warnings.push(issue('camp_legality_confidence', 'warning', 'low-camp-suitability', 'Low camp suitability', 'Top camp candidate has weak Camp Suitability from available ECS signals.'));
    }
    if (camp.vehicleAccessConfidence === 'low' || camp.vehicleAccessConfidence === 'unknown') {
      score -= 8;
      warnings.push(issue('camp_legality_confidence', 'warning', 'limited-vehicle-access-confidence', 'Limited Vehicle Access Confidence', 'Vehicle access confidence is limited for the top camp candidate.'));
    }
    if (camp.terrainSuitabilityScore != null && camp.terrainSuitabilityScore < 45) {
      score -= 8;
      warnings.push(issue('camp_legality_confidence', 'warning', 'terrain-suitability-limited', 'Terrain Suitability limited', 'Top camp candidate terrain suitability needs review.'));
    }
    if (camp.accessStatus === 'unknown' && confidence !== 'high') {
      score -= 8;
      warnings.push(issue('camp_legality_confidence', 'warning', 'unknown-camp-access-status', 'Access status unknown', 'Camp access status is unknown; check official agency rules and posted restrictions.'));
    }

    if (!camp.officialConfirmation) {
      score -= 8;
      warnings.push(issue('camp_legality_confidence', 'warning', 'no-official-confirmation', 'No official confirmation', 'No official confirmation is attached to the camp candidate.'));
    }
    (camp.cautionNotes ?? []).slice(0, 2).forEach((note, index) => {
      warnings.push(issue('camp_legality_confidence', 'warning', `camp-caution-${index + 1}`, 'Camp confidence note', note));
    });
  }

  return {
    id: 'camp_legality_confidence',
    label: CATEGORY_LABELS.camp_legality_confidence,
    score,
    confidence: camp?.legalAccessConfidence === 'high' || camp?.legalAccessConfidence === 'medium' || camp?.legalAccessConfidence === 'low' ? camp.legalAccessConfidence : 'low',
    summary: blockers[0]?.detail ?? warnings[0]?.detail ?? 'Camp Legality Confidence is usable, not guaranteed.',
    factors,
    missingInputs,
    lastUpdatedAt: camp?.updatedAt ?? nowIso,
    blockerIssues: blockers,
    warningIssues: warnings,
  };
}

function weatherWindow(input: ExpeditionReadinessInput, nowIso: string): CategoryDraft {
  const weather = input.weather;
  const flags = sourceFlags(weather, nowIso);
  const missingInputs: string[] = [];
  const blockers: ExpeditionReadinessIssue[] = [];
  const warnings: ExpeditionReadinessIssue[] = [];
  const factors: ExpeditionReadinessFactor[] = [];
  let score = 82;

  if (!weather) {
    missingInputs.push('Weather window');
    score = 55;
    factors.push(factor('weather-missing', 'Weather window', 'No weather input is available.', 'missing', 'missing', 'low'));
  }
  if (weather?.severeAlertActive || weather?.riskLevel === 'critical') {
    score = 35;
    blockers.push(issue('weather_window', 'blocker', 'severe-weather', 'Severe weather risk', 'Weather window has a severe alert or critical risk.'));
  } else if (weather?.riskLevel === 'high') {
    score -= 28;
    warnings.push(issue('weather_window', 'warning', 'high-weather-risk', 'High weather risk', 'Weather risk is high for the planned window.'));
  } else if (weather?.riskLevel === 'moderate') {
    score -= 12;
  }
  if (typeof weather?.windMph === 'number' && weather.windMph >= 35) {
    score -= 12;
    warnings.push(issue('weather_window', 'warning', 'high-wind', 'High wind', `Winds are ${Math.round(weather.windMph)} mph.`));
  }
  if (flags.isStale) {
    score -= 18;
    warnings.push(issue('weather_window', 'warning', 'stale-weather', 'Stale weather', 'Weather is stale; confidence is limited.'));
  }
  if (weather) {
    factors.push(factor('weather-risk', 'Weather risk', weather.riskLevel ?? 'Weather input present.', weather.riskLevel === 'high' ? 'warning' : 'neutral', flags.source, weather.confidence ?? 'medium', flags));
  }
  return {
    id: 'weather_window',
    label: CATEGORY_LABELS.weather_window,
    score,
    confidence: flags.isStale ? 'low' : weather?.confidence ?? (weather ? 'medium' : 'low'),
    summary: blockers[0]?.detail ?? warnings[0]?.detail ?? 'Weather window does not show a major blocker.',
    factors,
    missingInputs,
    lastUpdatedAt: weather?.updatedAt ?? nowIso,
    blockerIssues: blockers,
    warningIssues: warnings,
  };
}

function daylightMargin(input: ExpeditionReadinessInput, nowIso: string): CategoryDraft {
  const daylight = input.daylight;
  const flags = sourceFlags(daylight, nowIso);
  const missingInputs: string[] = [];
  const blockers: ExpeditionReadinessIssue[] = [];
  const warnings: ExpeditionReadinessIssue[] = [];
  let score = 80;

  if (!daylight || typeof daylight.minutesRemainingAtArrival !== 'number') {
    missingInputs.push('Daylight margin at arrival');
    score = 58;
  } else if (daylight.nextSunEvent === 'sunrise') {
    score = daylight.sunlightStatus === 'before_sunrise' ? 64 : 60;
    warnings.push(issue(
      'daylight_margin',
      'warning',
      'nighttime-window',
      daylight.sunlightStatus === 'before_sunrise' ? 'Before sunrise' : 'After sunset',
      daylight.sunlightSummary ?? 'Current sunlight window is nighttime; time until sunrise is shown instead of daylight remaining.',
    ));
  } else if (daylight.arrivalAfterDark || daylight.minutesRemainingAtArrival < 0) {
    score = 35;
    blockers.push(issue('daylight_margin', 'blocker', 'arrival-after-dark', 'Arrival after dark', 'Planned arrival is after usable daylight.'));
  } else if (daylight.minutesRemainingAtArrival < 45) {
    score = 58;
    warnings.push(issue('daylight_margin', 'warning', 'tight-daylight', 'Tight daylight margin', 'Arrival daylight margin is under 45 minutes.'));
  } else if (daylight.minutesRemainingAtArrival < 90) {
    score = 72;
    warnings.push(issue('daylight_margin', 'warning', 'narrowing-daylight', 'Narrowing daylight margin', 'Arrival daylight margin is under 90 minutes.'));
  } else {
    score = 92;
  }

  return {
    id: 'daylight_margin',
    label: CATEGORY_LABELS.daylight_margin,
    score,
    confidence: daylight?.confidence ?? (missingInputs.length ? 'low' : 'medium'),
    summary: blockers[0]?.detail ?? warnings[0]?.detail ?? 'Daylight margin is workable for the plan.',
    factors: daylight
      ? [factor(
          'arrival-daylight',
          daylight.sunlightLabel ?? 'Arrival daylight',
          daylight.sunlightSummary ?? `${daylight.minutesRemainingAtArrival ?? 'Unknown'} minutes remaining at arrival.`,
          score < 82 ? 'warning' : 'positive',
          flags.source,
          daylight.confidence ?? 'medium',
          flags,
        )]
      : [factor('daylight-missing', 'Arrival daylight', 'No arrival daylight estimate is available.', 'missing', 'missing', 'low')],
    missingInputs,
    lastUpdatedAt: daylight?.updatedAt ?? nowIso,
    blockerIssues: blockers,
    warningIssues: warnings,
  };
}

function offlinePreparedness(input: ExpeditionReadinessInput, nowIso: string): CategoryDraft {
  const offline = input.offline;
  const flags = sourceFlags(offline, nowIso);
  const isRemote = routeIsRemote(input);
  const missingInputs: string[] = [];
  const blockers: ExpeditionReadinessIssue[] = [];
  const warnings: ExpeditionReadinessIssue[] = [];
  const factors: ExpeditionReadinessFactor[] = [];
  let score = offline ? 82 : 48;

  const addOfflineFactor = (
    id: string,
    label: string,
    ready: boolean | null | undefined,
    readyCopy: string,
    missingCopy: string,
    unknownCopy: string,
    weight: number,
    critical = false,
  ) => {
    if (ready === true) {
      factors.push(factor(id, label, readyCopy, 'positive', flags.source, 'high', flags));
      score += Math.min(5, Math.round(weight / 3));
      return;
    }
    if (ready === false) {
      score -= weight;
      factors.push(factor(id, label, missingCopy, critical ? 'blocker' : 'warning', flags.source, 'medium', flags));
      const nextIssue = issue(
        'offline_preparedness',
        critical ? 'blocker' : 'warning',
        `missing-${id}`,
        label,
        missingCopy,
      );
      if (critical) blockers.push(nextIssue);
      else warnings.push(nextIssue);
      return;
    }
    score -= Math.max(4, Math.round(weight / 2));
    missingInputs.push(label);
    factors.push(factor(id, label, unknownCopy, 'missing', flags.source, 'low', flags));
  };

  if (!offline) {
    missingInputs.push('Offline package state');
    warnings.push(issue('offline_preparedness', 'warning', 'offline-state-unavailable', 'Offline state unavailable', 'Offline package state is unavailable; confidence is limited.'));
  } else {
    if (offline.packageStatus === 'missing') {
      score -= isRemote ? 32 : 22;
      const missingPackage = issue(
        'offline_preparedness',
        isRemote ? 'blocker' : 'warning',
        'offline-package-missing',
        'Offline package missing',
        isRemote
          ? 'Remote route offline package is missing; ECS recommends preparing it before departure.'
          : 'Offline route package is missing; review before leaving service.',
      );
      if (isRemote) blockers.push(missingPackage);
      else warnings.push(missingPackage);
    } else if (offline.packageStatus === 'partial' || offline.packageStatus === 'unknown') {
      score -= isRemote ? 18 : 10;
      warnings.push(issue('offline_preparedness', 'warning', 'offline-package-partial', 'Offline package partial', 'Offline package is partial or unknown.'));
    } else if (offline.packageStatus === 'ready') {
      score += 6;
    }

    if (offline.currentRoutePackageFresh === false || offline.isStale) {
      score -= 12;
      warnings.push(issue('offline_preparedness', 'warning', 'offline-package-stale', 'Offline package stale', 'Current route package freshness is stale or unknown.'));
    } else if (offline.currentRoutePackageFresh == null) {
      missingInputs.push('Current route package freshness');
      score -= 4;
    }
  }

  addOfflineFactor(
    'route-geometry',
    'Route geometry',
    offline?.routeGeometryCached ?? offline?.routeDownloaded,
    'Route geometry is cached for offline review.',
    'Route geometry is not cached.',
    'Route geometry cache state is unavailable.',
    isRemote ? 18 : 12,
    isRemote,
  );
  addOfflineFactor(
    'route-corridor-tiles',
    'Route corridor map tiles',
    offline?.mapTilesCachedForRoute ?? offline?.mapsDownloaded,
    'Route corridor map tiles are cached.',
    isRemote ? 'Remote route corridor tiles are missing.' : 'Route corridor map tiles are not confirmed.',
    'Route corridor tile cache state is unavailable.',
    isRemote ? 24 : 14,
    isRemote,
  );
  addOfflineFactor(
    'camp-candidates',
    'Camp candidates',
    offline?.campCandidatesCached ?? offline?.campIntelDownloaded,
    'Camp candidate context is cached.',
    'Camp candidate cache is not confirmed.',
    'Camp candidate cache state is unavailable.',
    7,
  );
  addOfflineFactor(
    'bailout-points',
    'Bailout points',
    offline?.bailoutPointsCached,
    'Bailout points are cached.',
    'Bailout points are not cached.',
    'Bailout point cache state is unavailable.',
    isRemote ? 12 : 7,
  );
  addOfflineFactor(
    'weather-snapshot',
    'Weather snapshot',
    offline?.weatherSnapshotAvailable,
    'Weather snapshot is available offline.',
    'Weather snapshot is not cached.',
    'Weather snapshot cache is unavailable.',
    7,
  );
  addOfflineFactor(
    'fuel-town-road-refs',
    'Fuel/town/road references',
    offline?.fuelTownRoadReferencesCached,
    'Fuel, town, or road reference data is cached.',
    'Fuel, town, or road reference cache is not confirmed.',
    'Fuel, town, or road reference cache state is unavailable.',
    5,
  );
  addOfflineFactor(
    'emergency-packet',
    'Emergency/communications packet',
    offline?.emergencyPacketAvailable ?? offline?.emergencyDocsAvailable,
    'Emergency or communications packet is available.',
    'Emergency or communications packet is not available.',
    'Emergency packet availability is not connected yet.',
    6,
  );

  return {
    id: 'offline_preparedness',
    label: CATEGORY_LABELS.offline_preparedness,
    score,
    confidence: missingInputs.length || !offline ? 'low' : blockers.length || warnings.length ? 'medium' : 'high',
    summary: blockers[0]?.detail ?? warnings[0]?.detail ?? 'Offline route package and departure cache signals appear prepared.',
    factors: [
      factor(
        'offline-package',
        'Offline package',
        offline?.packageStatus
          ? `Package status: ${offline.packageStatus}${offline.cachedTileCount != null ? `, ${offline.cachedTileCount} cached tiles` : ''}.`
          : 'Offline package state is missing.',
        !offline ? 'missing' : score < 82 ? 'warning' : 'positive',
        flags.source,
        offline ? 'medium' : 'low',
        flags,
      ),
      ...factors,
    ],
    missingInputs,
    lastUpdatedAt: offline?.updatedAt ?? nowIso,
    blockerIssues: blockers,
    warningIssues: warnings,
  };
}

function fuelRange(input: ExpeditionReadinessInput, nowIso: string): CategoryDraft {
  const fuel = input.fuel;
  const flags = sourceFlags(fuel, nowIso);
  const missingInputs: string[] = [];
  const blockers: ExpeditionReadinessIssue[] = [];
  const warnings: ExpeditionReadinessIssue[] = [];
  let score = 78;

  const range = fuel?.rangeRemainingMiles ?? null;
  const remaining = fuel?.routeDistanceRemainingMiles ?? input.route?.distanceMiles ?? null;
  const reserve = fuel?.reserveMiles ?? (range != null && remaining != null ? range - remaining : null);

  if (!fuel || range == null) {
    missingInputs.push('Fuel range remaining');
    score = 56;
  } else if (reserve != null) {
    if (reserve < 0) {
      score = 35;
      blockers.push(issue('fuel_range_margin', 'blocker', 'fuel-range-deficit', 'Fuel range deficit', 'Fuel range is below route distance remaining.'));
    } else if (reserve < 30) {
      score = 62;
      warnings.push(issue('fuel_range_margin', 'warning', 'fuel-reserve-tight', 'Fuel reserve tight', `Fuel reserve is ${Math.round(reserve)} miles.`));
    } else if (reserve < 60) {
      score = 76;
      warnings.push(issue('fuel_range_margin', 'warning', 'fuel-reserve-watch', 'Fuel reserve narrowing', `Fuel reserve is ${Math.round(reserve)} miles.`));
    } else {
      score = 92;
    }
  }

  return {
    id: 'fuel_range_margin',
    label: CATEGORY_LABELS.fuel_range_margin,
    score,
    confidence: missingInputs.length ? 'low' : flags.source === 'manual' ? 'medium' : 'high',
    summary: blockers[0]?.detail ?? warnings[0]?.detail ?? 'Fuel range margin is usable.',
    factors: fuel
      ? [factor('fuel-range', 'Fuel range', `${range ?? 'Unknown'} miles remaining${reserve == null ? '' : `, ${Math.round(reserve)} miles reserve`}.`, score < 82 ? 'warning' : 'positive', flags.source, 'medium', flags)]
      : [factor('fuel-missing', 'Fuel range', 'Fuel range input is missing.', 'missing', 'missing', 'low')],
    missingInputs,
    lastUpdatedAt: fuel?.updatedAt ?? nowIso,
    blockerIssues: blockers,
    warningIssues: warnings,
  };
}

function powerRuntime(input: ExpeditionReadinessInput, nowIso: string): CategoryDraft {
  const power = input.power;
  const flags = sourceFlags(power, nowIso);
  const missingInputs: string[] = [];
  const warnings: ExpeditionReadinessIssue[] = [];
  const factors: ExpeditionReadinessFactor[] = [];
  const powerRelevant = power?.powerRelevantForTrip === true || routeIsRemote(input);
  let score = powerRelevant ? 74 : 82;
  const runtime = power?.runtimeHoursRemaining ?? null;
  const required = power?.requiredRuntimeHours ?? null;

  if (!power) {
    if (powerRelevant) {
      missingInputs.push('Power system');
      score = 64;
      warnings.push(issue('power_runtime', 'warning', 'power-state-unavailable', 'Power state unavailable', 'Power system state is unavailable; confidence is limited for remote or overnight context.'));
    } else {
      score = 78;
    }
  } else {
    const connected = power.connectedSourceAvailable === true || power.connectionState === 'connected';
    const stale = power.isStale || power.dataFreshness === 'stale' || power.dataFreshness === 'offline';
    if (connected) {
      score += 8;
      factors.push(factor('power-source', 'Power source', `${power.deviceLabel ?? power.providerLabel ?? 'Power source'} connected.`, 'positive', flags.source, power.runtimeSource === 'provider' ? 'high' : 'medium', flags));
    } else if (power.powerRelevantForTrip) {
      score -= 12;
      warnings.push(issue('power_runtime', 'warning', 'power-not-connected', 'Power not connected', 'No connected power source is available for a trip where power may matter.'));
      factors.push(factor('power-source', 'Power source', 'Not connected. ECS will use manual or last-known values only if available.', 'warning', flags.source, 'low', flags));
    } else {
      factors.push(factor('power-source', 'Power source', 'Not connected. Power telemetry is optional for this trip context.', 'neutral', flags.source, 'medium', flags));
    }

    if (stale) {
      score -= power.powerRelevantForTrip ? 16 : 8;
      warnings.push(issue('power_runtime', 'warning', 'power-data-stale', 'Power data stale', 'Power telemetry is stale or offline; runtime confidence is limited.'));
    }

    if (typeof power.batteryPercent === 'number') {
      factors.push(factor('power-soc', 'State of charge', `${Math.round(power.batteryPercent)}% battery state of charge.`, power.batteryPercent < 25 ? 'warning' : 'positive', flags.source, stale ? 'low' : 'medium', flags));
      if (power.batteryPercent <= 12) {
        score -= 28;
        warnings.push(issue('power_runtime', 'warning', 'power-reserve-critical', 'Power reserve critical', `Power reserve is ${Math.round(power.batteryPercent)}%.`));
      } else if (power.batteryPercent < 25) {
        score -= 16;
        warnings.push(issue('power_runtime', 'warning', 'power-reserve-low', 'Power reserve low', `Power reserve is ${Math.round(power.batteryPercent)}%.`));
      }
    } else if (power.powerRelevantForTrip) {
      missingInputs.push('Power state of charge');
      score -= 8;
    }

    if (power.inputWatts != null || power.outputWatts != null || power.solarInputWatts != null) {
      const net = (power.inputWatts ?? 0) - (power.outputWatts ?? 0);
      factors.push(factor(
        'power-flow',
        'Power flow',
        `Input ${Math.round(power.inputWatts ?? 0)}W / Output ${Math.round(power.outputWatts ?? 0)}W${power.solarInputWatts != null ? ` / Solar ${Math.round(power.solarInputWatts)}W` : ''}.`,
        net < -250 ? 'warning' : 'neutral',
        flags.source,
        stale ? 'low' : 'medium',
        flags,
      ));
      if (net < -350 && power.powerRelevantForTrip) {
        score -= 10;
        warnings.push(issue('power_runtime', 'warning', 'power-heavy-draw', 'Power draw elevated', 'Output load is materially outpacing input recovery.'));
      }
    }

    if (runtime == null) {
      if (power.powerRelevantForTrip) {
        missingInputs.push('Power runtime remaining');
        score -= power.hasManualFallback ? 8 : 16;
        warnings.push(issue('power_runtime', 'warning', 'power-runtime-missing', 'Runtime not estimated', 'Power runtime is not estimated for a trip where power may matter.'));
      }
    } else if (required != null && runtime < required) {
      score = Math.min(score, 56);
      warnings.push(issue('power_runtime', 'warning', 'power-runtime-short', 'Power runtime short', `Power runtime is ${Math.round(runtime)}h against an estimated ${Math.round(required)}h need.`));
    } else if (runtime < 4 && power.powerRelevantForTrip) {
      score = Math.min(score, 62);
      warnings.push(issue('power_runtime', 'warning', 'power-runtime-tight', 'Power runtime tight', `${Math.round(runtime)} hours of runtime remaining.`));
    } else if (runtime >= 8 || !power.powerRelevantForTrip) {
      score += 8;
    }

    if (power.powerNeedReason) {
      factors.push(factor('power-trip-relevance', 'Trip power relevance', power.powerNeedReason, power.powerRelevantForTrip ? 'neutral' : 'positive', flags.source, 'medium', flags));
    }
  }

  if (runtime != null) {
    factors.unshift(factor('power-runtime', 'Power runtime', `${runtime} hours remaining${required == null ? '' : ` / ${required} hours estimated need`}.`, score < 82 ? 'warning' : 'positive', flags.source, power?.runtimeSource === 'provider' ? 'high' : 'medium', flags));
  } else if (!power || power.powerRelevantForTrip) {
    factors.unshift(factor('power-runtime', 'Power runtime', 'Runtime estimate is unknown.', powerRelevant ? 'missing' : 'neutral', power ? flags.source : 'missing', powerRelevant ? 'low' : 'medium', flags));
  }

  if (
    powerRelevant
    && power
    && power.connectedSourceAvailable !== true
    && runtime == null
    && power.batteryPercent == null
  ) {
    score = Math.max(score, 62);
  }

  const confidence: ExpeditionReadinessConfidence =
    !power
      ? powerRelevant ? 'low' : 'medium'
      : power.dataFreshness === 'live' && (runtime != null || power.batteryPercent != null)
        ? power.runtimeSource === 'provider' ? 'high' : 'medium'
        : missingInputs.length > 0 || power.isStale
          ? 'low'
          : power.source === 'manual'
            ? 'medium'
            : 'medium';

  return {
    id: 'power_runtime',
    label: CATEGORY_LABELS.power_runtime,
    score,
    confidence,
    summary: warnings[0]?.detail ?? (
      power
        ? power.powerRecommendation ?? 'Power runtime is workable from available inputs.'
        : powerRelevant
          ? 'Power state is unknown for a trip where powered loads may matter.'
          : 'Power telemetry is optional for this trip context.'
    ),
    factors,
    missingInputs,
    lastUpdatedAt: power?.updatedAt ?? nowIso,
    warningIssues: warnings,
  };
}

function buildPowerBrief(input: ExpeditionReadinessInput, categories: ExpeditionReadinessCategory[]): ExpeditionPowerBrief {
  const power = input.power;
  const category = categories.find((item) => item.id === 'power_runtime');
  const runtime = power?.runtimeHoursRemaining;
  const required = power?.requiredRuntimeHours;
  const connected = power?.connectedSourceAvailable === true || power?.connectionState === 'connected';
  const runtimeSummary = runtime != null
    ? `${runtime} h runtime${required != null ? ` / ${required} h estimated need` : ''}`
    : power?.powerRelevantForTrip
      ? 'Runtime unknown for power-relevant trip context.'
      : 'Runtime unknown; connected power is optional for this trip context.';
  const sourceSummary = power
    ? `${power.deviceLabel ?? power.providerLabel ?? 'Power system'} / ${connected ? 'connected' : power.connectionState ?? 'not connected'}`
    : 'No power system connected.';
  const freshness = power?.dataFreshness ?? 'unknown';
  const status: ExpeditionPowerBrief['status'] =
    !connected && power?.powerRelevantForTrip !== true
      ? 'unknown'
      : category?.status === 'ready'
      ? 'ready'
      : power?.powerRelevantForTrip || category?.status === 'hold' || category?.status === 'caution'
        ? 'caution'
        : 'unknown';
  return {
    status,
    statusLabel: status === 'ready' ? 'Ready' : status === 'caution' ? 'Caution' : 'Unknown',
    runtimeSummary,
    sourceSummary,
    freshnessSummary: `Power data freshness: ${freshness}.`,
    recommendation: power?.powerRecommendation
      ?? (power?.powerRelevantForTrip ? 'Add a runtime estimate or connect a power source before departure.' : 'Connect or update power only if powered loads matter.'),
    connectedSourceAvailable: connected,
    powerRelevantForTrip: power?.powerRelevantForTrip === true,
    isStale: power?.isStale === true || power?.dataFreshness === 'stale' || power?.dataFreshness === 'offline',
  };
}

function formatMiles(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return `${value < 10 ? Math.round(value * 10) / 10 : Math.round(value)} mi`;
}

function recoveryAccess(input: ExpeditionReadinessInput, nowIso: string): CategoryDraft {
  const recovery = input.recovery;
  const flags = sourceFlags(recovery, nowIso);
  const missingInputs: string[] = [];
  const blockers: ExpeditionReadinessIssue[] = [];
  const warnings: ExpeditionReadinessIssue[] = [];
  const factors: ExpeditionReadinessFactor[] = [];
  const isRemote = routeIsRemote(input) || recovery?.routeRemoteness === 'high';
  let score = 80;

  if (!recovery) {
    missingInputs.push('Recovery and bailout plan');
    score = isRemote ? 42 : 52;
    warnings.push(issue('recovery_bailout_access', 'warning', 'recovery-state-unavailable', 'Recovery state unavailable', 'Recovery and bailout access are unavailable; confidence is limited.'));
  } else {
    if (recovery.bailoutRoutesAvailable === false) {
      score -= isRemote ? 38 : 28;
      const noBailout = issue(
        'recovery_bailout_access',
        isRemote ? 'blocker' : 'warning',
        'no-bailout-route',
        'No bailout route confirmed',
        isRemote
          ? 'No bailout or exit route is confirmed for a remote route.'
          : 'No bailout or exit route is confirmed.',
      );
      if (isRemote) blockers.push(noBailout);
      else warnings.push(noBailout);
    } else if (recovery.bailoutRoutesAvailable == null) {
      missingInputs.push('Bailout route availability');
      score -= 16;
    }

    const optionCount = recovery.routeBailoutOptionCount;
    if (typeof optionCount === 'number') {
      if (optionCount <= 0) {
        score -= isRemote ? 26 : 14;
        const noOptions = issue(
          'recovery_bailout_access',
          isRemote ? 'blocker' : 'warning',
          'no-route-bailout-options',
          'No route bailout options',
          'No route bailout options are indexed for this route.',
        );
        if (isRemote) blockers.push(noOptions);
        else warnings.push(noOptions);
      } else {
        score += Math.min(8, optionCount * 2);
        factors.push(factor('route-bailout-options', 'Route bailout options', `${optionCount} bailout option${optionCount === 1 ? '' : 's'} indexed.`, 'positive', flags.source, recovery.recoveryAccessConfidence ?? 'medium', flags));
      }
    } else {
      missingInputs.push('Route bailout options');
      score -= isRemote ? 10 : 6;
    }

    const nearestExit = recovery.nearestExitMiles ?? recovery.nearestKnownRoadMiles ?? recovery.nearestPavedRoadMiles ?? null;
    if (typeof nearestExit === 'number') {
      if (nearestExit > 50) {
        score -= 28;
        warnings.push(issue('recovery_bailout_access', 'warning', 'bailout-very-distant', 'Bailout distance high', `Nearest known bailout is ${formatMiles(nearestExit)} away.`));
      } else if (nearestExit > 20) {
        score -= 16;
        warnings.push(issue('recovery_bailout_access', 'warning', 'bailout-distance-watch', 'Bailout distance elevated', `Nearest known bailout is ${formatMiles(nearestExit)} away.`));
      } else if (nearestExit <= 5) {
        score += 8;
      }
      factors.push(factor(
        'nearest-bailout-distance',
        'Nearest bailout',
        recovery.nearestBailoutSummary ?? `${formatMiles(nearestExit)} to nearest known bailout.`,
        nearestExit > 20 ? 'warning' : 'positive',
        flags.source,
        recovery.recoveryAccessConfidence ?? 'medium',
        flags,
      ));
    } else {
      missingInputs.push('Nearest bailout distance');
      score -= isRemote ? 14 : 8;
    }

    if (recovery.nearestFuelMiles != null) {
      factors.push(factor('nearest-fuel', 'Nearest fuel', `${formatMiles(recovery.nearestFuelMiles)} to nearest indexed fuel point.`, recovery.nearestFuelMiles > 50 ? 'warning' : 'neutral', flags.source, 'medium', flags));
    } else if (isRemote) {
      missingInputs.push('Nearest fuel');
      score -= 5;
    }

    if (recovery.nearestTownMiles != null) {
      factors.push(factor('nearest-town', 'Nearest town', `${formatMiles(recovery.nearestTownMiles)} to nearest indexed town.`, recovery.nearestTownMiles > 50 ? 'warning' : 'neutral', flags.source, 'medium', flags));
    }

    if (recovery.nearestSignalAreaMiles != null) {
      factors.push(factor('nearest-signal-area', 'Possible signal area', `${formatMiles(recovery.nearestSignalAreaMiles)} to nearest indexed possible signal area.`, recovery.nearestSignalAreaMiles > 15 ? 'warning' : 'neutral', flags.source, 'low', { ...flags, isInferred: true }));
    }

    if (recovery.currentCoordinatesAvailable === false) {
      missingInputs.push('Current coordinates');
      score -= 18;
      warnings.push(issue('recovery_bailout_access', 'warning', 'current-coordinates-missing', 'Current coordinates unavailable', 'Current coordinates are unavailable for the recovery packet.'));
    } else if (recovery.currentCoordinatesAvailable === true) {
      factors.push(factor('current-coordinates', 'Current coordinates', 'Current coordinates are available for recovery context.', 'positive', flags.source, 'medium', flags));
    } else {
      missingInputs.push('Current coordinates');
      score -= 8;
    }

    if (recovery.emergencyCoordinatePacketReady === false) {
      score -= 12;
      warnings.push(issue('recovery_bailout_access', 'warning', 'emergency-coordinate-packet-missing', 'Emergency coordinate packet incomplete', 'Emergency coordinate packet is incomplete or unavailable.'));
    } else if (recovery.emergencyCoordinatePacketReady === true) {
      factors.push(factor('emergency-coordinate-packet', 'Emergency coordinate packet', recovery.emergencyCoordinatePacketSummary ?? 'Coordinate packet can be generated from current context.', 'positive', flags.source, 'medium', flags));
    } else {
      missingInputs.push('Emergency coordinate packet');
      score -= 6;
    }

    if (recovery.officialContactPointAvailable === true) {
      factors.push(factor('official-contact-point', 'Official contact point', recovery.officialContactPointSummary ?? 'Official contact point is available from indexed data.', 'neutral', flags.source, 'medium', flags));
    } else {
      missingInputs.push('Official contact point');
      factors.push(factor('official-contact-point', 'Official contact point', recovery.officialContactPointSummary ?? 'Official contact point is not confirmed. ECS will not invent official emergency contacts.', 'missing', flags.source, 'low', flags));
    }

    if (recovery.recoveryDifficulty === 'high') {
      score -= 18;
      warnings.push(issue('recovery_bailout_access', 'warning', 'high-recovery-difficulty', 'Recovery difficulty high', 'ECS-inferred recovery difficulty is high; review bailout, communications, and recovery gear.'));
    } else if (recovery.recoveryDifficulty === 'moderate') {
      score -= 8;
    }

    if (recovery.routeRemoteness === 'high') {
      score -= 14;
      warnings.push(issue('recovery_bailout_access', 'warning', 'route-remoteness-high', 'Route remoteness high', 'Route remoteness increases recovery and bailout uncertainty.'));
    } else if (recovery.routeRemoteness === 'moderate') {
      score -= 6;
    }

    if (recovery.recoveryGearReady === false) {
      score -= 18;
      warnings.push(issue('recovery_bailout_access', 'warning', 'recovery-gear-not-ready', 'Recovery gear not ready', 'Recovery gear readiness is not confirmed.'));
    } else if (recovery.recoveryGearReady === true) {
      factors.push(factor('recovery-gear', 'Recovery gear', 'Recovery gear readiness is confirmed from available vehicle context.', 'positive', flags.source, 'medium', flags));
    } else {
      missingInputs.push('Recovery gear');
      score -= isRemote ? 10 : 6;
    }

    if (recovery.recoveryAccessConfidence === 'low') {
      score -= 16;
      warnings.push(issue('recovery_bailout_access', 'warning', 'low-recovery-confidence', 'Low recovery access confidence', 'Recovery access confidence is limited.'));
    } else if (recovery.recoveryAccessConfidence === 'high') {
      score += 4;
    }

    if (
      recovery.bailoutRoutesAvailable === true
      && recovery.recoveryGearReady === true
      && recovery.recoveryAccessConfidence === 'high'
    ) {
      score += 10;
    }
  }

  return {
    id: 'recovery_bailout_access',
    label: CATEGORY_LABELS.recovery_bailout_access,
    score,
    confidence: recovery?.recoveryAccessConfidence ?? (missingInputs.length ? 'low' : 'medium'),
    summary: blockers[0]?.detail ?? warnings[0]?.detail ?? 'Recovery and bailout access are workable.',
    factors: recovery
      ? [
          factor('bailout-access', 'Bailout access', recovery.bailoutRoutesAvailable ? 'Bailout route available from indexed context.' : 'Bailout route not confirmed.', score < 82 ? 'warning' : 'positive', flags.source, recovery.recoveryAccessConfidence ?? 'medium', flags),
          ...factors,
        ]
      : [factor('recovery-missing', 'Recovery access', 'Recovery and bailout plan is missing.', 'missing', 'missing', 'low')],
    missingInputs,
    lastUpdatedAt: recovery?.updatedAt ?? nowIso,
    blockerIssues: blockers,
    warningIssues: warnings,
  };
}

function communications(input: ExpeditionReadinessInput, nowIso: string): CategoryDraft {
  const comms = input.communications;
  const flags = sourceFlags(comms, nowIso);
  const missingInputs: string[] = [];
  const warnings: ExpeditionReadinessIssue[] = [];
  let score = 76;

  if (!comms) {
    missingInputs.push('Communications plan');
    score = 54;
  } else {
    if (comms.signalConfidence === 'low' && !comms.satelliteCommsReady) {
      score = 55;
      warnings.push(issue('communications_signal_confidence', 'warning', 'low-signal-no-satellite', 'Low signal confidence', 'Signal confidence is low and satellite communications are not confirmed.'));
    } else if (comms.signalConfidence === 'medium') {
      score = 74;
    } else if (comms.signalConfidence === 'high' || comms.satelliteCommsReady) {
      score = 90;
    }
    if (comms.teamCheckInPlanReady === false) {
      score -= 10;
      warnings.push(issue('communications_signal_confidence', 'warning', 'checkin-plan-missing', 'Check-in plan missing', 'Team check-in plan is not confirmed.'));
    }
  }

  return {
    id: 'communications_signal_confidence',
    label: CATEGORY_LABELS.communications_signal_confidence,
    score,
    confidence: comms?.signalConfidence ?? (missingInputs.length ? 'low' : 'medium'),
    summary: warnings[0]?.detail ?? 'Communications confidence is workable.',
    factors: comms
      ? [factor('signal-confidence', 'Signal confidence', `${comms.signalConfidence ?? 'Unknown'} signal confidence.`, score < 82 ? 'warning' : 'positive', flags.source, comms.signalConfidence ?? 'medium', flags)]
      : [factor('communications-missing', 'Communications plan', 'Communications plan input is missing.', 'missing', 'missing', 'low')],
    missingInputs,
    lastUpdatedAt: comms?.updatedAt ?? nowIso,
    warningIssues: warnings,
  };
}

function buildRecoveryBrief(input: ExpeditionReadinessInput, categories: ExpeditionReadinessCategory[]): ExpeditionRecoveryBrief {
  const recovery = input.recovery;
  const recoveryCategory = categories.find((category) => category.id === 'recovery_bailout_access');
  const communicationsCategory = categories.find((category) => category.id === 'communications_signal_confidence');
  const emergencyPacket = buildDepartureAudit(input, categories)
    .find((item) => item.itemId === 'emergency-communications-packet');
  const currentCoordinates = recovery?.currentCoordinatesAvailable && typeof recovery.currentLatitude === 'number' && typeof recovery.currentLongitude === 'number'
    ? {
        latitude: recovery.currentLatitude,
        longitude: recovery.currentLongitude,
        accuracyMeters: recovery.currentAccuracyMeters ?? null,
      }
    : null;
  const recommendedPrep = recovery?.recommendedPrep?.length
    ? recovery.recommendedPrep
    : [
        recoveryCategory?.missingInputs.includes('Route bailout options') ? 'Review bailout options before departure.' : null,
        recoveryCategory?.missingInputs.includes('Recovery gear') ? 'Confirm recovery gear in Fleet.' : null,
        communicationsCategory?.status !== 'ready' ? 'Confirm communications and check-in plan.' : null,
      ].filter((item): item is string => Boolean(item));

  return {
    nearestBailoutSummary: recovery?.nearestBailoutSummary
      ?? (recovery?.nearestExitMiles != null ? `${formatMiles(recovery.nearestExitMiles)} to nearest known bailout.` : 'Nearest bailout is not confirmed; confidence is limited.'),
    recoveryDifficulty: recovery?.recoveryDifficulty ?? 'unknown',
    communicationsSummary: communicationsCategory?.summary ?? 'Communications confidence is limited.',
    emergencyCoordinatePacketStatus: emergencyPacket?.status ?? (currentCoordinates ? 'caution' : 'missing'),
    emergencyCoordinatePacketSummary: recovery?.emergencyCoordinatePacketSummary
      ?? emergencyPacket?.summary
      ?? 'Emergency coordinate packet is unavailable until location and communications context are available.',
    recommendedPrep: recommendedPrep.length
      ? recommendedPrep.slice(0, 5)
      : ['Keep bailout, communications, and recovery inputs refreshed before departure.'],
    currentCoordinates,
    activeRouteLabel: input.route?.name ?? input.route?.routeId ?? null,
    officialContactSummary: recovery?.officialContactPointSummary ?? 'Official emergency or ranger contact point is not confirmed. ECS does not invent official contacts.',
    isECSInferred: recovery?.isInferred === true || recovery?.source === 'inferred',
    confidence: recoveryCategory?.confidence ?? recovery?.recoveryAccessConfidence ?? 'low',
  };
}

function buildFreshness(input: ExpeditionReadinessInput, nowIso: string): ExpeditionReadinessSourceFreshness {
  return {
    route: freshness('Route', input.route, nowIso),
    weather: freshness('Weather', input.weather, nowIso),
    fleet: freshness('Fleet', input.activeVehicle, nowIso),
    offline: freshness('Offline package', input.offline, nowIso),
    camp: freshness('Camp', bestCamp(input.campCandidates), nowIso),
    power: freshness('Power', input.power, nowIso),
    fuel: freshness('Fuel', input.fuel, nowIso),
    recovery: freshness('Recovery', input.recovery, nowIso),
    communications: freshness('Communications', input.communications, nowIso),
    daylight: freshness('Daylight', input.daylight, nowIso),
    telemetry: freshness('Telemetry', input.telemetry, nowIso),
    currentLocation: freshness('Current location', input.currentLocation, nowIso),
  };
}

function computeDataIntegrity(categories: ExpeditionReadinessCategory[], freshnessMap: ExpeditionReadinessSourceFreshness): ExpeditionReadinessDataIntegrity {
  const records = Object.values(freshnessMap);
  const factors = categories.flatMap((category) => category.factors);
  const usesMockData = records.some((record) => record.isMock) || factors.some((item) => item.isMock || item.source === 'mock');
  const usesDemoData = records.some((record) => record.isDemo) || factors.some((item) => item.isDemo || item.source === 'demo');
  const usesInferredData = records.some((record) => record.isInferred) || factors.some((item) => item.isInferred || item.source === 'inferred');
  const unmarkedSyntheticData = factors
    .filter((item) => /mock|demo|sample|fixture/i.test(`${item.label} ${item.detail}`) && !(item.isMock || item.isDemo || item.isInferred || item.source === 'mock' || item.source === 'demo' || item.source === 'inferred'))
    .map((item) => item.id);

  return { usesMockData, usesDemoData, usesInferredData, unmarkedSyntheticData };
}

function recommendationsFor(
  categories: ExpeditionReadinessCategory[],
  blockers: ExpeditionReadinessIssue[],
  warnings: ExpeditionReadinessIssue[],
  input: ExpeditionReadinessInput,
): string[] {
  const recs: string[] = [];
  const resolvedIntent = resolveExpeditionTripIntent(input);
  if (resolvedIntent.tripIntent === 'unknown') {
    recs.push('Select trip intent so ECS can tune readiness weighting for this route.');
  }
  if (resolvedIntent.tripIntent === 'overnightCamp' || resolvedIntent.tripIntent === 'weekendExpedition') {
    if (!input.campCandidates?.length) recs.push('Add or review CampOps candidates for overnight Camp Legality Confidence.');
    if (!input.power?.powerRelevantForTrip) recs.push('Confirm whether fridge, comms, navigation, or device power is needed overnight.');
  }
  if (resolvedIntent.tripIntent === 'remoteExpedition') {
    recs.push('Confirm offline route package, bailout options, communications plan, and fuel range before departure.');
  }
  if (resolvedIntent.tripIntent === 'recoveryUtilityRoute') {
    recs.push('Confirm recovery gear, bailout access, current coordinates, and communications before using this route.');
  }
  if (blockers.length > 0) recs.push(`Resolve blocker: ${blockers[0].detail}`);
  categories
    .filter((category) => category.missingInputs.length > 0)
    .slice(0, 3)
    .forEach((category) => recs.push(`Confirm ${category.missingInputs[0]} for ${category.label}.`));
  warnings.slice(0, 3).forEach((warning) => recs.push(warning.detail));
  if (recs.length === 0) recs.push('Keep route, weather, offline, camp, fleet, recovery, and communications data refreshed before departure.');
  return [...new Set(recs)];
}

function confidenceForCalibratedAssessment(
  categories: ExpeditionReadinessCategory[],
  warnings: ExpeditionReadinessIssue[],
  freshnessMap: ExpeditionReadinessSourceFreshness,
  criticalSources: (keyof ExpeditionReadinessSourceFreshness)[],
): ExpeditionReadinessConfidence {
  const criticalFreshnessValues = criticalSources.map((source) => freshnessMap[source]).filter(Boolean);
  if (
    categories.some((category) => category.confidence === 'low')
    || criticalFreshnessValues.some((item) => item.isMissing || item.isStale)
  ) {
    return 'low';
  }
  if (warnings.length > 0 || categories.some((category) => category.confidence === 'medium')) return 'medium';
  return 'high';
}

function applyStatusCaps(
  status: ExpeditionReadinessStatus,
  confidence: ExpeditionReadinessConfidence,
  warnings: ExpeditionReadinessIssue[],
): ExpeditionReadinessStatus {
  if (status === 'hold') return status;
  if (confidence !== 'high' || warnings.length > 0) return 'caution';
  return status;
}

function categoryBuilders(input: ExpeditionReadinessInput, nowIso: string): CategoryDraft[] {
  return [
    vehicleFit(input, nowIso),
    routeRisk(input, nowIso),
    campLegality(input, nowIso),
    weatherWindow(input, nowIso),
    daylightMargin(input, nowIso),
    offlinePreparedness(input, nowIso),
    fuelRange(input, nowIso),
    powerRuntime(input, nowIso),
    recoveryAccess(input, nowIso),
    communications(input, nowIso),
  ];
}

function applyProfileCategoryTuning(
  categories: ExpeditionReadinessCategory[],
  input: ExpeditionReadinessInput,
  thresholds: ExpeditionReadinessThresholds,
): ExpeditionReadinessCategory[] {
  const calibration = resolveExpeditionReadinessCalibration(input);
  const hasCampPlan = (input.campCandidates?.length ?? 0) > 0;
  const powerRelevant = input.power?.powerRelevantForTrip === true || routeIsRemote(input);

  if (calibration.profile !== 'dayTrip') {
    return categories;
  }

  return categories.map((category) => {
    if (category.id === 'camp_legality_confidence' && !hasCampPlan) {
      return retuneCategory(category, {
        score: 86,
        confidence: 'medium',
        summary: 'No camp plan is selected for this day trip; Camp Legality Confidence is not a primary scoring factor.',
        missingInputs: [],
        factors: [
          factor(
            'camp-not-planned-day-trip',
            'Camp plan',
            'No camp endpoint is selected. ECS is treating camp confidence as not applicable for this day trip profile.',
            'neutral',
            'inferred',
            'medium',
            { isInferred: true },
          ),
        ],
      }, thresholds);
    }

    if (category.id === 'power_runtime' && !powerRelevant && !input.power) {
      return retuneCategory(category, {
        score: 84,
        confidence: 'medium',
        summary: 'Connected power telemetry is optional for this day trip context.',
        missingInputs: [],
        factors: [
          factor(
            'power-optional-day-trip',
            'Power runtime',
            'No connected power system is required by the current day trip profile.',
            'neutral',
            'inferred',
            'medium',
            { isInferred: true },
          ),
        ],
      }, thresholds);
    }

    return category;
  });
}

export function buildExpeditionReadiness(input: ExpeditionReadinessInput = {}): ExpeditionReadinessAssessment {
  const nowIso = input.capturedAt ?? new Date().toISOString();
  const readinessPreferences = normalizeExpeditionReadinessPreferences(
    input.readinessPreferences ?? DEFAULT_EXPEDITION_READINESS_PREFERENCES,
  );
  const baseCalibration = resolveExpeditionReadinessCalibration(input);
  const preferenceCalibration = applyReadinessPreferenceCalibration(baseCalibration, readinessPreferences);
  const calibration = preferenceCalibration.calibration;
  const resolvedTripIntent = resolveExpeditionTripIntent(input);
  const drafts = categoryBuilders(input, nowIso);
  const untunedCategories = drafts.map((draft) => finalizeCategory(draft, calibration.thresholds));
  const categories = applyProfileCategoryTuning(untunedCategories, input, calibration.thresholds);
  const preferenceGuardrails = buildReadinessPreferenceGuardrails(categories, input, calibration, readinessPreferences);
  const blockers = [
    ...drafts.flatMap((draft) => draft.blockerIssues ?? []),
    ...preferenceGuardrails.blockers,
  ];
  const warnings = [
    ...drafts.flatMap((draft) => draft.warningIssues ?? []),
    ...preferenceGuardrails.warnings,
  ];
  const weightedTotal = categories.reduce((sum, category) => sum + category.score * calibration.weights[category.id], 0);
  const weightTotal = EXPEDITION_READINESS_CATEGORY_IDS.reduce((sum, id) => sum + calibration.weights[id], 0);
  const overallScore = clampScore(weightTotal > 0 ? weightedTotal / weightTotal : 0);
  const sourceFreshness = buildFreshness(input, nowIso);
  const confidence = confidenceForCalibratedAssessment(categories, warnings, sourceFreshness, calibration.criticalFreshnessSources);
  const status = applyStatusCaps(getReadinessStatusFromScore(overallScore, blockers, calibration.thresholds), confidence, warnings);
  const recommendations = [
    ...recommendationsFor(categories, blockers, warnings, input),
    ...preferenceGuardrails.recommendations,
  ].filter((item, index, all) => all.indexOf(item) === index);
  const departureAudit = buildDepartureAudit(input, categories);
  const recoveryBrief = buildRecoveryBrief(input, categories);
  const powerBrief = buildPowerBrief(input, categories);
  const assessment: ExpeditionReadinessAssessment = {
    tripIntent: resolvedTripIntent.tripIntent,
    tripIntentSource: resolvedTripIntent.tripIntentSource,
    readinessProfile: calibration.profile,
    calibration,
    readinessPreferences,
    preferenceEffects: [
      ...preferenceCalibration.effects,
      ...preferenceGuardrails.effects,
    ],
    overallScore,
    status,
    confidence,
    updatedAt: nowIso,
    sourceFreshness,
    categories,
    blockers,
    warnings,
    recommendations,
    departureAudit,
    recoveryBrief,
    powerBrief,
    explanation: '',
    dataIntegrity: computeDataIntegrity(categories, sourceFreshness),
  };

  assessment.explanation = summarizeReadiness(assessment);
  return assessment;
}

export function summarizeReadiness(assessment: ExpeditionReadinessAssessment): string {
  if (assessment.status === 'hold') {
    const reason = assessment.blockers[0]?.detail ?? assessment.categories.find((category) => category.status === 'hold')?.summary;
    return `Hold. ${reason ?? 'One or more readiness systems require review.'}`;
  }
  if (assessment.status === 'caution') {
    const concern = getTopReadinessConcerns(assessment, 1)[0];
    return `Caution. ECS Intelligence sees ${assessment.overallScore}/100 readiness; ${concern?.summary ?? 'confidence is limited or warnings remain.'}`;
  }
  return `Ready. ECS Intelligence sees ${assessment.overallScore}/100 readiness with no blockers; continue monitoring source freshness before departure.`;
}

export function getTopReadinessConcerns(
  assessment: ExpeditionReadinessAssessment,
  limit = 3,
): ExpeditionReadinessCategory[] {
  return [...assessment.categories]
    .sort((a, b) => {
      const statusDelta = (a.status === 'hold' ? 0 : a.status === 'caution' ? 1 : 2) - (b.status === 'hold' ? 0 : b.status === 'caution' ? 1 : 2);
      if (statusDelta !== 0) return statusDelta;
      return a.score - b.score;
    })
    .slice(0, Math.max(0, limit));
}
