export type WeakPointScoreVersion = 'weak-point-beta-v1' | string;

export type WeakPointMaturityLabel = 'Internal beta / restricted field-test';

export type WeakPointCategory =
  | 'route_confidence'
  | 'fuel_margin'
  | 'water_margin'
  | 'power_margin'
  | 'payload_gvwr'
  | 'camp_endpoint_confidence'
  | 'offline_readiness'
  | 'weather_freshness'
  | 'daylight'
  | 'recovery_bailout_access'
  | 'convoy_state';

export type WeakPointConfidence = 'high' | 'medium' | 'low' | 'unknown' | string;
export type WeakPointFreshness = 'fresh' | 'stale' | 'missing' | 'unknown' | string;
export type WeakPointConditionState = 'normal' | 'known_risky' | 'unknown' | string;

export type WeakPointSourceFact = {
  id: string;
  label: string;
  value?: string | number | boolean | null;
  source?: string | null;
  updatedAt?: string | null;
  freshness?: WeakPointFreshness | null;
};

type WeakPointSnapshotSection = {
  sourceFactIds?: readonly string[] | null;
  updatedAt?: string | null;
};

export type ExpeditionReadinessSnapshot = {
  readonly snapshotId: string;
  readonly capturedAt: string;
  readonly routeConfidence?: (WeakPointSnapshotSection & {
    confidence?: WeakPointConfidence | number | null;
    conditionState?: WeakPointConditionState | null;
    knownClosure?: boolean | null;
    passabilityConfidence?: WeakPointConfidence | null;
  }) | null;
  readonly fuelMargin?: (WeakPointSnapshotSection & {
    reserveMiles?: number | null;
    rangeRemainingMiles?: number | null;
    routeDistanceRemainingMiles?: number | null;
    fuelPercent?: number | null;
  }) | null;
  readonly waterMargin?: (WeakPointSnapshotSection & {
    daysRemaining?: number | null;
    requiredDays?: number | null;
    gallonsRemaining?: number | null;
    requiredGallons?: number | null;
  }) | null;
  readonly powerMargin?: (WeakPointSnapshotSection & {
    runtimeHoursRemaining?: number | null;
    requiredRuntimeHours?: number | null;
    batteryPercent?: number | null;
    dataFreshness?: WeakPointFreshness | null;
  }) | null;
  readonly payloadGvwr?: (WeakPointSnapshotSection & {
    gvwrUsagePct?: number | null;
    payloadRemainingLbs?: number | null;
    confidence?: WeakPointConfidence | null;
  }) | null;
  readonly campEndpointConfidence?: (WeakPointSnapshotSection & {
    endpointId?: string | null;
    legalAccessConfidence?: WeakPointConfidence | 'unavailable' | null;
    accessConfidence?: WeakPointConfidence | 'unavailable' | null;
    etaCreatesLateArrivalRisk?: boolean | null;
    confidence?: WeakPointConfidence | null;
  }) | null;
  readonly offlineReadiness?: (WeakPointSnapshotSection & {
    packageStatus?: 'ready' | 'partial' | 'missing' | 'unknown' | string | null;
    routeMatched?: boolean | null;
    coverage?: 'complete' | 'partial' | 'missing' | 'unknown' | string | null;
    freshness?: WeakPointFreshness | null;
  }) | null;
  readonly weatherFreshness?: (WeakPointSnapshotSection & {
    riskLevel?: 'low' | 'moderate' | 'high' | 'critical' | 'unknown' | string | null;
    freshness?: WeakPointFreshness | null;
    severeAlertActive?: boolean | null;
  }) | null;
  readonly daylight?: (WeakPointSnapshotSection & {
    minutesRemainingAtArrival?: number | null;
    arrivalAfterDark?: boolean | null;
  }) | null;
  readonly recoveryBailoutAccess?: (WeakPointSnapshotSection & {
    bailoutRoutesAvailable?: boolean | null;
    routeBailoutOptionCount?: number | null;
    nearestExitMiles?: number | null;
    recoveryAccessConfidence?: WeakPointConfidence | null;
  }) | null;
  readonly convoyState?: (WeakPointSnapshotSection & {
    rosterReady?: boolean | null;
    communicationsReady?: boolean | null;
    membersAccountedFor?: boolean | null;
  }) | null;
  readonly sourceFacts?: readonly WeakPointSourceFact[] | null;
};

export type WeakPointScoreComponents = {
  likelihood: number;
  consequence: number;
  uncertainty: number;
  dataGap: number;
};

export type WeakPointCandidate = {
  category: WeakPointCategory;
  label: string;
  rank: number;
  riskScore: number;
  scoreComponents: WeakPointScoreComponents;
  consequenceStatement: string;
  easiestPreDepartureFix: string;
  travelMonitorSignal: string;
  sourceFactIds: string[];
  missingFacts: string[];
};

export type WeakPointCandidateInput = {
  category: WeakPointCategory;
  label: string;
  scoreComponents: WeakPointScoreComponents;
  consequenceStatement?: string | null;
  easiestPreDepartureFix?: string | null;
  travelMonitorSignal?: string | null;
  sourceFactIds?: readonly string[] | null;
  missingFacts?: readonly string[] | null;
};

export type WeakPointExplanation = {
  source: 'deterministic_template' | 'validated_ai';
  text: string;
  usedSourceFactIds: string[];
  validationWarnings: string[];
};

export type WeakPointAiDraft = {
  text?: string | null;
  rankedCategoryOrder?: readonly (WeakPointCategory | string)[] | null;
  sourceFactIds?: readonly string[] | null;
  recommendations?: readonly string[] | null;
  referencedCategories?: readonly (WeakPointCategory | string)[] | null;
};

export type WeakPointAssessment = {
  maturityLabel: WeakPointMaturityLabel;
  rankedWeakPoints: WeakPointCandidate[];
  mostFragileAssumption: WeakPointCandidate | null;
  mostSevereConsequence: WeakPointCandidate | null;
  easiestFixBeforeDeparture: WeakPointCandidate | null;
  monitorDuringTravel: WeakPointCandidate | null;
  missingData: string[];
  scoreVersion: WeakPointScoreVersion;
  sourceSnapshotId: string;
  explanation: WeakPointExplanation;
};

export type WeakPointFeatureFlags = {
  weakPointAnalyzer?: boolean | null;
  expeditionWeakPointAnalyzer?: boolean | null;
};

const DEFAULT_SCORE_VERSION = 'weak-point-beta-v1';
const MATURITY_LABEL: WeakPointMaturityLabel = 'Internal beta / restricted field-test';

const CATEGORY_ORDER: WeakPointCategory[] = [
  'route_confidence',
  'fuel_margin',
  'water_margin',
  'power_margin',
  'payload_gvwr',
  'camp_endpoint_confidence',
  'offline_readiness',
  'weather_freshness',
  'daylight',
  'recovery_bailout_access',
  'convoy_state',
];

const CATEGORY_LABELS: Record<WeakPointCategory, string> = {
  route_confidence: 'route confidence',
  fuel_margin: 'fuel margin',
  water_margin: 'water margin',
  power_margin: 'power margin',
  payload_gvwr: 'payload/GVWR',
  camp_endpoint_confidence: 'camp endpoint confidence',
  offline_readiness: 'offline readiness',
  weather_freshness: 'weather freshness',
  daylight: 'daylight',
  recovery_bailout_access: 'recovery/bailout access',
  convoy_state: 'convoy state',
};

const DEFAULT_FIXES: Record<WeakPointCategory, string> = {
  route_confidence: 'Review the route source, closure layer, and passability notes before committing.',
  fuel_margin: 'Add fuel or reduce route distance until reserve margin is comfortable.',
  water_margin: 'Add water or shorten the plan until onboard water covers the expected duration.',
  power_margin: 'Charge the power system, reduce load, or confirm a charging source before departure.',
  payload_gvwr: 'Remove load or redistribute cargo until payload and GVWR margin improve.',
  camp_endpoint_confidence: 'Confirm camp access confidence or select a validated backup endpoint before departure.',
  offline_readiness: 'Download or refresh the route offline package before leaving coverage.',
  weather_freshness: 'Refresh weather and verify any alert source before departure.',
  daylight: 'Move departure earlier, shorten the route, or pick a closer endpoint with setup daylight.',
  recovery_bailout_access: 'Confirm bailout options and recovery access before entering the exposed section.',
  convoy_state: 'Confirm roster, communications, and check-in accountability before departure.',
};

const DEFAULT_MONITORS: Record<WeakPointCategory, string> = {
  route_confidence: 'Watch route confidence, closure/current-condition updates, and passability changes.',
  fuel_margin: 'Watch fuel percentage, remaining range, and miles to the next reliable fuel point.',
  water_margin: 'Watch water remaining versus party size and expected time out.',
  power_margin: 'Watch battery percentage, runtime estimate, and load changes.',
  payload_gvwr: 'Watch handling, suspension behavior, and any load-shift indicators.',
  camp_endpoint_confidence: 'Watch ETA, daylight, camp access confidence, and backup endpoint viability.',
  offline_readiness: 'Watch offline coverage, route package freshness, and cache availability.',
  weather_freshness: 'Watch weather timestamp, alert status, wind, precipitation, and exposure.',
  daylight: 'Watch ETA versus usable light remaining.',
  recovery_bailout_access: 'Watch distance to bailout points, turnaround options, and recovery access confidence.',
  convoy_state: 'Watch roster accountability, radio checks, and separation intervals.',
};

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(5, Math.round(value)));
}

function riskScore(components: WeakPointScoreComponents): number {
  const score =
    clampScore(components.likelihood) * 0.40 +
    clampScore(components.consequence) * 0.35 +
    clampScore(components.uncertainty) * 0.15 +
    clampScore(components.dataGap) * 0.10;
  return Number(score.toFixed(2));
}

function uniqueStrings(values: readonly (string | null | undefined)[] | null | undefined): string[] {
  const output: string[] = [];
  values?.forEach((value) => {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (trimmed && !output.includes(trimmed)) output.push(trimmed);
  });
  return output;
}

function scoreFromConfidence(value: WeakPointConfidence | number | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value >= 80) return 1;
    if (value >= 60) return 2;
    if (value >= 40) return 3;
    if (value > 0) return 4;
    return 5;
  }
  const normalized = String(value ?? 'unknown').toLowerCase();
  if (normalized === 'high') return 1;
  if (normalized === 'medium' || normalized === 'moderate') return 2;
  if (normalized === 'low') return 4;
  return 3;
}

function dataGapForSource(section: WeakPointSnapshotSection | null | undefined, expectedFields: readonly string[]): number {
  if (!section) return 5;
  let missing = 0;
  expectedFields.forEach((field) => {
    if (!(field in section) || (section as Record<string, unknown>)[field] == null) missing += 1;
  });
  if (!section.sourceFactIds || section.sourceFactIds.length === 0) missing += 1;
  if (!section.updatedAt) missing += 1;
  if (missing === 0) return 0;
  if (missing === 1) return 1;
  if (missing === 2) return 3;
  return 4;
}

function missingCandidate(category: WeakPointCategory, missingFacts: string[], consequence = 3): WeakPointCandidateInput {
  const label = CATEGORY_LABELS[category];
  return {
    category,
    label,
    scoreComponents: {
      likelihood: 2,
      consequence,
      uncertainty: 5,
      dataGap: 5,
    },
    consequenceStatement: `${label} is unknown because required readiness inputs are missing; ECS is not inferring that this hazard exists.`,
    easiestPreDepartureFix: `Provide ${label} inputs before relying on this weak-point ranking.`,
    travelMonitorSignal: `Monitor ${label} manually until ECS has comparable source data.`,
    sourceFactIds: [],
    missingFacts,
  };
}

function sectionFactIds(section: WeakPointSnapshotSection | null | undefined): string[] {
  return uniqueStrings(section?.sourceFactIds ?? []);
}

function routeCandidate(snapshot: ExpeditionReadinessSnapshot): WeakPointCandidateInput {
  const route = snapshot.routeConfidence;
  if (!route) return missingCandidate('route_confidence', ['route confidence input', 'route source timestamp'], 4);
  const confidenceRisk = Math.max(
    scoreFromConfidence(route.confidence),
    scoreFromConfidence(route.passabilityConfidence),
  );
  const knownRisk = route.knownClosure === true || route.conditionState === 'known_risky';
  return {
    category: 'route_confidence',
    label: CATEGORY_LABELS.route_confidence,
    scoreComponents: {
      likelihood: knownRisk ? 5 : confidenceRisk,
      consequence: knownRisk ? 5 : confidenceRisk >= 4 ? 4 : 3,
      uncertainty: knownRisk ? 1 : Math.max(1, confidenceRisk),
      dataGap: dataGapForSource(route, ['confidence']),
    },
    consequenceStatement: knownRisk
      ? 'A source-backed route risk can force a reroute or stop travel on the planned line.'
      : 'Route confidence weakness can turn planned travel time, passability, or access assumptions into unknowns.',
    easiestPreDepartureFix: DEFAULT_FIXES.route_confidence,
    travelMonitorSignal: DEFAULT_MONITORS.route_confidence,
    sourceFactIds: sectionFactIds(route),
    missingFacts: dataGapForSource(route, ['confidence']) >= 3 ? ['route source fact or timestamp'] : [],
  };
}

function numeric(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function fuelCandidate(snapshot: ExpeditionReadinessSnapshot): WeakPointCandidateInput {
  const fuel = snapshot.fuelMargin;
  if (!fuel) return missingCandidate('fuel_margin', ['fuel margin input', 'remaining route distance'], 5);
  const explicitReserve = numeric(fuel.reserveMiles);
  const derivedReserve = numeric(fuel.rangeRemainingMiles) != null && numeric(fuel.routeDistanceRemainingMiles) != null
    ? Number(fuel.rangeRemainingMiles) - Number(fuel.routeDistanceRemainingMiles)
    : null;
  const reserve = explicitReserve ?? derivedReserve;
  const fuelPercent = numeric(fuel.fuelPercent);
  let likelihood = 1;
  if (reserve == null && fuelPercent == null) likelihood = 3;
  else if ((reserve != null && reserve < 10) || (fuelPercent != null && fuelPercent < 15)) likelihood = 5;
  else if ((reserve != null && reserve < 25) || (fuelPercent != null && fuelPercent < 30)) likelihood = 4;
  else if ((reserve != null && reserve < 50) || (fuelPercent != null && fuelPercent < 45)) likelihood = 3;
  return {
    category: 'fuel_margin',
    label: CATEGORY_LABELS.fuel_margin,
    scoreComponents: {
      likelihood,
      consequence: likelihood >= 5 ? 5 : likelihood >= 4 ? 4 : 3,
      uncertainty: reserve == null ? 4 : 1,
      dataGap: dataGapForSource(fuel, ['reserveMiles']),
    },
    consequenceStatement: 'Fuel margin weakness can make the planned route dependent on reaching the next reliable fuel point.',
    easiestPreDepartureFix: DEFAULT_FIXES.fuel_margin,
    travelMonitorSignal: DEFAULT_MONITORS.fuel_margin,
    sourceFactIds: sectionFactIds(fuel),
    missingFacts: reserve == null ? ['fuel reserve miles'] : [],
  };
}

function waterCandidate(snapshot: ExpeditionReadinessSnapshot): WeakPointCandidateInput {
  const water = snapshot.waterMargin;
  if (!water) return missingCandidate('water_margin', ['water margin input', 'party duration requirement'], 5);
  const daysRemaining = numeric(water.daysRemaining);
  const requiredDays = numeric(water.requiredDays) ?? 1;
  const gallonsRemaining = numeric(water.gallonsRemaining);
  const requiredGallons = numeric(water.requiredGallons);
  const ratio = daysRemaining != null
    ? daysRemaining / Math.max(requiredDays, 0.25)
    : gallonsRemaining != null && requiredGallons != null
      ? gallonsRemaining / Math.max(requiredGallons, 0.25)
      : null;
  let likelihood = 1;
  if (ratio == null) likelihood = 3;
  else if (ratio < 0.75) likelihood = 5;
  else if (ratio < 1) likelihood = 4;
  else if (ratio < 1.5) likelihood = 3;
  return {
    category: 'water_margin',
    label: CATEGORY_LABELS.water_margin,
    scoreComponents: {
      likelihood,
      consequence: likelihood >= 5 ? 5 : likelihood >= 4 ? 4 : 3,
      uncertainty: ratio == null ? 4 : 1,
      dataGap: dataGapForSource(water, ['daysRemaining']),
    },
    consequenceStatement: 'Water margin weakness can make delay, heat, or a longer recovery stop harder to absorb.',
    easiestPreDepartureFix: DEFAULT_FIXES.water_margin,
    travelMonitorSignal: DEFAULT_MONITORS.water_margin,
    sourceFactIds: sectionFactIds(water),
    missingFacts: ratio == null ? ['water remaining versus required water'] : [],
  };
}

function powerCandidate(snapshot: ExpeditionReadinessSnapshot): WeakPointCandidateInput {
  const power = snapshot.powerMargin;
  if (!power) return missingCandidate('power_margin', ['power margin input', 'required runtime'], 4);
  const runtime = numeric(power.runtimeHoursRemaining);
  const required = numeric(power.requiredRuntimeHours) ?? 1;
  const battery = numeric(power.batteryPercent);
  const ratio = runtime != null ? runtime / Math.max(required, 0.25) : null;
  let likelihood = 1;
  if (ratio == null && battery == null) likelihood = 3;
  else if ((ratio != null && ratio < 0.75) || (battery != null && battery < 20)) likelihood = 5;
  else if ((ratio != null && ratio < 1) || (battery != null && battery < 35)) likelihood = 4;
  else if ((ratio != null && ratio < 1.5) || (battery != null && battery < 50)) likelihood = 3;
  const stale = power.dataFreshness === 'stale' || power.dataFreshness === 'missing';
  return {
    category: 'power_margin',
    label: CATEGORY_LABELS.power_margin,
    scoreComponents: {
      likelihood,
      consequence: likelihood >= 5 ? 4 : 3,
      uncertainty: ratio == null || stale ? 4 : 1,
      dataGap: Math.max(dataGapForSource(power, ['runtimeHoursRemaining']), stale ? 2 : 0),
    },
    consequenceStatement: 'Power margin weakness can degrade navigation, communications, refrigeration, or device charging assumptions.',
    easiestPreDepartureFix: DEFAULT_FIXES.power_margin,
    travelMonitorSignal: DEFAULT_MONITORS.power_margin,
    sourceFactIds: sectionFactIds(power),
    missingFacts: ratio == null ? ['runtime hours remaining'] : [],
  };
}

function payloadCandidate(snapshot: ExpeditionReadinessSnapshot): WeakPointCandidateInput {
  const payload = snapshot.payloadGvwr;
  if (!payload) return missingCandidate('payload_gvwr', ['payload/GVWR input', 'active loadout weight'], 4);
  const usage = numeric(payload.gvwrUsagePct);
  const remaining = numeric(payload.payloadRemainingLbs);
  let likelihood = 1;
  if (usage == null && remaining == null) likelihood = 3;
  else if ((usage != null && usage >= 98) || (remaining != null && remaining < 50)) likelihood = 5;
  else if ((usage != null && usage >= 90) || (remaining != null && remaining < 200)) likelihood = 4;
  else if ((usage != null && usage >= 85) || (remaining != null && remaining < 400)) likelihood = 3;
  return {
    category: 'payload_gvwr',
    label: CATEGORY_LABELS.payload_gvwr,
    scoreComponents: {
      likelihood,
      consequence: likelihood >= 5 ? 5 : likelihood >= 4 ? 4 : 3,
      uncertainty: Math.max(1, scoreFromConfidence(payload.confidence) - 1),
      dataGap: dataGapForSource(payload, ['gvwrUsagePct']),
    },
    consequenceStatement: 'Payload/GVWR weakness can reduce handling margin and increase load-related vehicle risk.',
    easiestPreDepartureFix: DEFAULT_FIXES.payload_gvwr,
    travelMonitorSignal: DEFAULT_MONITORS.payload_gvwr,
    sourceFactIds: sectionFactIds(payload),
    missingFacts: usage == null && remaining == null ? ['GVWR usage or payload remaining'] : [],
  };
}

function campCandidate(snapshot: ExpeditionReadinessSnapshot): WeakPointCandidateInput {
  const camp = snapshot.campEndpointConfidence;
  if (!camp) return missingCandidate('camp_endpoint_confidence', ['camp endpoint confidence input', 'camp access source'], 5);
  const legalRisk = scoreFromConfidence(camp.legalAccessConfidence);
  const accessRisk = scoreFromConfidence(camp.accessConfidence ?? camp.confidence);
  const confidenceRisk = Math.max(legalRisk, accessRisk);
  const lateRisk = camp.etaCreatesLateArrivalRisk === true;
  const likelihood = lateRisk && confidenceRisk >= 4 ? 4 : confidenceRisk;
  return {
    category: 'camp_endpoint_confidence',
    label: CATEGORY_LABELS.camp_endpoint_confidence,
    scoreComponents: {
      likelihood,
      consequence: lateRisk ? 4 : confidenceRisk >= 4 ? 3 : 2,
      uncertainty: confidenceRisk >= 4 ? 4 : confidenceRisk,
      dataGap: Math.max(1, dataGapForSource(camp, ['legalAccessConfidence'])),
    },
    consequenceStatement: lateRisk
      ? 'Camp endpoint confidence weakness can create late arrival pressure if the planned endpoint cannot be used.'
      : 'Camp endpoint confidence weakness can make the end-of-day plan depend on unvalidated access assumptions.',
    easiestPreDepartureFix: DEFAULT_FIXES.camp_endpoint_confidence,
    travelMonitorSignal: DEFAULT_MONITORS.camp_endpoint_confidence,
    sourceFactIds: sectionFactIds(camp),
    missingFacts: confidenceRisk >= 3 && camp.legalAccessConfidence == null ? ['camp legal/access confidence'] : [],
  };
}

function offlineCandidate(snapshot: ExpeditionReadinessSnapshot): WeakPointCandidateInput {
  const offline = snapshot.offlineReadiness;
  if (!offline) return missingCandidate('offline_readiness', ['offline package status', 'route cache coverage'], 4);
  const packageStatus = String(offline.packageStatus ?? 'unknown').toLowerCase();
  const coverage = String(offline.coverage ?? 'unknown').toLowerCase();
  const freshness = String(offline.freshness ?? 'unknown').toLowerCase();
  let likelihood = 1;
  if (packageStatus === 'missing' || coverage === 'missing') likelihood = 5;
  else if (packageStatus === 'partial' || coverage === 'partial' || offline.routeMatched === false) likelihood = 4;
  else if (packageStatus === 'unknown' || coverage === 'unknown') likelihood = 3;
  const dataGap = Math.max(
    dataGapForSource(offline, ['packageStatus', 'coverage']),
    offline.routeMatched === false ? 3 : 0,
    freshness === 'stale' ? 2 : 0,
    freshness === 'missing' || freshness === 'unknown' ? 3 : 0,
  );
  return {
    category: 'offline_readiness',
    label: CATEGORY_LABELS.offline_readiness,
    scoreComponents: {
      likelihood,
      consequence: likelihood >= 5 ? 5 : likelihood >= 4 ? 4 : 3,
      uncertainty: dataGap >= 3 ? 4 : 1,
      dataGap,
    },
    consequenceStatement: 'Offline readiness weakness can leave route, camp, bailout, or weather context unavailable outside coverage.',
    easiestPreDepartureFix: DEFAULT_FIXES.offline_readiness,
    travelMonitorSignal: DEFAULT_MONITORS.offline_readiness,
    sourceFactIds: sectionFactIds(offline),
    missingFacts: dataGap >= 3 ? ['complete route-matched offline package metadata'] : [],
  };
}

function weatherCandidate(snapshot: ExpeditionReadinessSnapshot): WeakPointCandidateInput {
  const weather = snapshot.weatherFreshness;
  if (!weather) return missingCandidate('weather_freshness', ['weather freshness input', 'weather source timestamp'], 4);
  const risk = String(weather.riskLevel ?? 'unknown').toLowerCase();
  const freshness = String(weather.freshness ?? 'unknown').toLowerCase();
  let likelihood = 1;
  if (weather.severeAlertActive || risk === 'critical') likelihood = 5;
  else if (risk === 'high') likelihood = 4;
  else if (risk === 'moderate') likelihood = 3;
  else if (risk === 'unknown') likelihood = 2;
  return {
    category: 'weather_freshness',
    label: CATEGORY_LABELS.weather_freshness,
    scoreComponents: {
      likelihood,
      consequence: weather.severeAlertActive || risk === 'critical' ? 5 : likelihood >= 4 ? 4 : 3,
      uncertainty: freshness === 'fresh' ? 1 : freshness === 'stale' ? 4 : 5,
      dataGap: Math.max(dataGapForSource(weather, ['riskLevel', 'freshness']), freshness === 'fresh' ? 0 : 3),
    },
    consequenceStatement: 'Weather freshness weakness can make exposure, wind, precipitation, or alert assumptions unreliable.',
    easiestPreDepartureFix: DEFAULT_FIXES.weather_freshness,
    travelMonitorSignal: DEFAULT_MONITORS.weather_freshness,
    sourceFactIds: sectionFactIds(weather),
    missingFacts: freshness !== 'fresh' ? ['fresh weather source'] : [],
  };
}

function daylightCandidate(snapshot: ExpeditionReadinessSnapshot): WeakPointCandidateInput {
  const daylight = snapshot.daylight;
  if (!daylight) return missingCandidate('daylight', ['daylight arrival margin', 'usable light window'], 4);
  const minutes = numeric(daylight.minutesRemainingAtArrival);
  let likelihood = 1;
  if (daylight.arrivalAfterDark === true || (minutes != null && minutes < 0)) likelihood = 5;
  else if (minutes != null && minutes < 30) likelihood = 4;
  else if (minutes != null && minutes < 60) likelihood = 3;
  else if (minutes == null) likelihood = 2;
  return {
    category: 'daylight',
    label: CATEGORY_LABELS.daylight,
    scoreComponents: {
      likelihood,
      consequence: likelihood >= 5 ? 5 : likelihood >= 4 ? 4 : 3,
      uncertainty: minutes == null ? 4 : 1,
      dataGap: dataGapForSource(daylight, ['minutesRemainingAtArrival']),
    },
    consequenceStatement: 'Daylight weakness can turn setup, camp validation, or recovery actions into low-light work.',
    easiestPreDepartureFix: DEFAULT_FIXES.daylight,
    travelMonitorSignal: DEFAULT_MONITORS.daylight,
    sourceFactIds: sectionFactIds(daylight),
    missingFacts: minutes == null ? ['arrival daylight margin'] : [],
  };
}

function recoveryCandidate(snapshot: ExpeditionReadinessSnapshot): WeakPointCandidateInput {
  const recovery = snapshot.recoveryBailoutAccess;
  if (!recovery) return missingCandidate('recovery_bailout_access', ['bailout access input', 'recovery confidence'], 5);
  const options = numeric(recovery.routeBailoutOptionCount);
  const nearestExit = numeric(recovery.nearestExitMiles);
  let likelihood = 1;
  if (recovery.bailoutRoutesAvailable === false || options === 0 || (nearestExit != null && nearestExit > 20)) likelihood = 5;
  else if ((options != null && options < 2) || (nearestExit != null && nearestExit > 12)) likelihood = 4;
  else if ((options != null && options < 3) || (nearestExit != null && nearestExit > 8)) likelihood = 3;
  return {
    category: 'recovery_bailout_access',
    label: CATEGORY_LABELS.recovery_bailout_access,
    scoreComponents: {
      likelihood,
      consequence: likelihood >= 5 ? 5 : likelihood >= 4 ? 4 : 3,
      uncertainty: Math.max(1, scoreFromConfidence(recovery.recoveryAccessConfidence) - 1),
      dataGap: dataGapForSource(recovery, ['bailoutRoutesAvailable', 'routeBailoutOptionCount']),
    },
    consequenceStatement: 'Recovery/bailout weakness can make a disabled vehicle or route interruption harder to exit cleanly.',
    easiestPreDepartureFix: DEFAULT_FIXES.recovery_bailout_access,
    travelMonitorSignal: DEFAULT_MONITORS.recovery_bailout_access,
    sourceFactIds: sectionFactIds(recovery),
    missingFacts: recovery.bailoutRoutesAvailable == null ? ['bailout route availability'] : [],
  };
}

function convoyCandidate(snapshot: ExpeditionReadinessSnapshot): WeakPointCandidateInput {
  const convoy = snapshot.convoyState;
  if (!convoy) return missingCandidate('convoy_state', ['convoy roster state', 'convoy communications state'], 3);
  const notReady = [convoy.rosterReady, convoy.communicationsReady, convoy.membersAccountedFor]
    .filter((value) => value === false).length;
  const unknown = [convoy.rosterReady, convoy.communicationsReady, convoy.membersAccountedFor]
    .filter((value) => value == null).length;
  return {
    category: 'convoy_state',
    label: CATEGORY_LABELS.convoy_state,
    scoreComponents: {
      likelihood: notReady >= 2 ? 4 : notReady === 1 ? 3 : 1,
      consequence: notReady > 0 ? 4 : 2,
      uncertainty: notReady >= 2 || unknown > 0 ? 4 : 1,
      dataGap: Math.max(dataGapForSource(convoy, ['rosterReady', 'communicationsReady']), unknown >= 2 ? 4 : unknown > 0 ? 2 : 0),
    },
    consequenceStatement: 'Convoy-state weakness can turn separation, check-ins, or accountability into the first operational failure.',
    easiestPreDepartureFix: DEFAULT_FIXES.convoy_state,
    travelMonitorSignal: DEFAULT_MONITORS.convoy_state,
    sourceFactIds: sectionFactIds(convoy),
    missingFacts: unknown > 0 ? ['complete convoy roster and communications state'] : [],
  };
}

function normalizeCandidate(input: WeakPointCandidateInput): WeakPointCandidate {
  const components = {
    likelihood: clampScore(input.scoreComponents.likelihood),
    consequence: clampScore(input.scoreComponents.consequence),
    uncertainty: clampScore(input.scoreComponents.uncertainty),
    dataGap: clampScore(input.scoreComponents.dataGap),
  };
  return {
    category: input.category,
    label: input.label || CATEGORY_LABELS[input.category],
    rank: 0,
    riskScore: riskScore(components),
    scoreComponents: components,
    consequenceStatement: input.consequenceStatement || `${CATEGORY_LABELS[input.category]} is the weak-point candidate.`,
    easiestPreDepartureFix: input.easiestPreDepartureFix || DEFAULT_FIXES[input.category],
    travelMonitorSignal: input.travelMonitorSignal || DEFAULT_MONITORS[input.category],
    sourceFactIds: uniqueStrings(input.sourceFactIds ?? []),
    missingFacts: uniqueStrings(input.missingFacts ?? []),
  };
}

export function rankWeakPointCandidates(candidates: readonly WeakPointCandidateInput[]): WeakPointCandidate[] {
  return candidates
    .map(normalizeCandidate)
    .sort((left, right) => (
      right.riskScore - left.riskScore ||
      right.scoreComponents.likelihood - left.scoreComponents.likelihood ||
      right.scoreComponents.consequence - left.scoreComponents.consequence ||
      right.scoreComponents.dataGap - left.scoreComponents.dataGap ||
      CATEGORY_ORDER.indexOf(left.category) - CATEGORY_ORDER.indexOf(right.category) ||
      left.label.localeCompare(right.label)
    ))
    .map((candidate, index) => ({
      ...candidate,
      rank: index + 1,
    }));
}

function easiestFix(candidates: readonly WeakPointCandidate[]): WeakPointCandidate | null {
  const actionable = candidates.filter((candidate) => candidate.scoreComponents.dataGap < 5);
  return actionable[0] ?? candidates[0] ?? null;
}

function severeConsequence(candidates: readonly WeakPointCandidate[]): WeakPointCandidate | null {
  return candidates
    .slice()
    .sort((left, right) => (
      right.scoreComponents.consequence - left.scoreComponents.consequence ||
      right.riskScore - left.riskScore ||
      CATEGORY_ORDER.indexOf(left.category) - CATEGORY_ORDER.indexOf(right.category)
    ))[0] ?? null;
}

function deterministicExplanation(assessment: Pick<WeakPointAssessment, 'rankedWeakPoints' | 'missingData'>): WeakPointExplanation {
  const primary = assessment.rankedWeakPoints[0];
  if (!primary) {
    return {
      source: 'deterministic_template',
      text: 'Primary weak point: unavailable. ECS does not have enough snapshot data to rank assumptions.',
      usedSourceFactIds: [],
      validationWarnings: [],
    };
  }
  const missing = assessment.missingData.length
    ? ` Missing data: ${assessment.missingData.slice(0, 3).join(', ')}.`
    : '';
  return {
    source: 'deterministic_template',
    text: `Primary weak point: ${primary.label}. ${primary.consequenceStatement} Easiest fix before departure: ${primary.easiestPreDepartureFix}${missing}`,
    usedSourceFactIds: primary.sourceFactIds,
    validationWarnings: [],
  };
}

function sameOrder(left: readonly (string | null | undefined)[] | null | undefined, right: readonly string[]): boolean {
  if (!left || left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

export function buildWeakPointAiExplanationPayload(assessment: Pick<WeakPointAssessment, 'rankedWeakPoints'>) {
  return {
    rankedCandidates: assessment.rankedWeakPoints.map((candidate) => ({
      rank: candidate.rank,
      category: candidate.category,
      label: candidate.label,
      riskScore: candidate.riskScore,
      scoreComponents: candidate.scoreComponents,
      consequenceStatement: candidate.consequenceStatement,
      missingFacts: candidate.missingFacts,
      sourceFactIds: candidate.sourceFactIds,
    })),
    allowedActions: uniqueStrings(assessment.rankedWeakPoints.map((candidate) => candidate.easiestPreDepartureFix)),
    sourceFactIds: uniqueStrings(assessment.rankedWeakPoints.flatMap((candidate) => candidate.sourceFactIds)),
  };
}

export function buildWeakPointExplanation(
  assessment: Pick<WeakPointAssessment, 'rankedWeakPoints' | 'missingData'>,
  aiDraft?: WeakPointAiDraft | null,
): WeakPointExplanation {
  if (!aiDraft) return deterministicExplanation(assessment);
  const payload = buildWeakPointAiExplanationPayload(assessment);
  const expectedOrder = assessment.rankedWeakPoints.map((candidate) => candidate.category);
  const allowedCategories = new Set(expectedOrder);
  const allowedSources = new Set(payload.sourceFactIds);
  const allowedActions = new Set(payload.allowedActions);
  const warnings: string[] = [];
  const draftText = aiDraft.text?.trim() ?? '';

  if (!draftText) warnings.push('AI explanation text is empty.');
  if (!sameOrder(aiDraft.rankedCategoryOrder, expectedOrder)) warnings.push('AI explanation attempted to change the deterministic ranking order.');
  uniqueStrings(aiDraft.sourceFactIds ?? []).forEach((sourceFactId) => {
    if (!allowedSources.has(sourceFactId)) warnings.push(`AI explanation referenced unsupported source fact ${sourceFactId}.`);
  });
  uniqueStrings(aiDraft.recommendations ?? []).forEach((recommendation) => {
    if (!allowedActions.has(recommendation)) warnings.push(`AI explanation recommended unsupported action: ${recommendation}`);
  });
  uniqueStrings((aiDraft.referencedCategories ?? []) as readonly string[]).forEach((category) => {
    if (!allowedCategories.has(category as WeakPointCategory)) warnings.push(`AI explanation referenced unsupported category ${category}.`);
  });

  if (warnings.length > 0) {
    const fallback = deterministicExplanation(assessment);
    return {
      ...fallback,
      validationWarnings: warnings,
    };
  }

  return {
    source: 'validated_ai',
    text: draftText,
    usedSourceFactIds: uniqueStrings(aiDraft.sourceFactIds ?? []),
    validationWarnings: [],
  };
}

export function scoreExpeditionWeakPoints(
  snapshot: ExpeditionReadinessSnapshot,
  scoringPolicyVersion: WeakPointScoreVersion = DEFAULT_SCORE_VERSION,
): WeakPointAssessment {
  const rankedWeakPoints = rankWeakPointCandidates([
    routeCandidate(snapshot),
    fuelCandidate(snapshot),
    waterCandidate(snapshot),
    powerCandidate(snapshot),
    payloadCandidate(snapshot),
    campCandidate(snapshot),
    offlineCandidate(snapshot),
    weatherCandidate(snapshot),
    daylightCandidate(snapshot),
    recoveryCandidate(snapshot),
    convoyCandidate(snapshot),
  ]);
  const missingData = uniqueStrings(rankedWeakPoints.flatMap((candidate) => candidate.missingFacts));
  const partialAssessment: Omit<WeakPointAssessment, 'explanation'> = {
    maturityLabel: MATURITY_LABEL,
    rankedWeakPoints,
    mostFragileAssumption: rankedWeakPoints[0] ?? null,
    mostSevereConsequence: severeConsequence(rankedWeakPoints),
    easiestFixBeforeDeparture: easiestFix(rankedWeakPoints),
    monitorDuringTravel: rankedWeakPoints[0] ?? null,
    missingData,
    scoreVersion: scoringPolicyVersion,
    sourceSnapshotId: snapshot.snapshotId,
  };
  return {
    ...partialAssessment,
    explanation: buildWeakPointExplanation(partialAssessment),
  };
}

function envFlagEnabled(key: string): boolean {
  const value = typeof process !== 'undefined' ? process.env?.[key] : undefined;
  return value === '1' || value === 'true' || value === 'TRUE';
}

export function isWeakPointAnalyzerFeatureEnabled(flags?: WeakPointFeatureFlags | null): boolean {
  if (typeof flags?.weakPointAnalyzer === 'boolean') return flags.weakPointAnalyzer;
  if (typeof flags?.expeditionWeakPointAnalyzer === 'boolean') return flags.expeditionWeakPointAnalyzer;
  const globalFlag = (globalThis as { __ECS_WEAK_POINT_ANALYZER__?: unknown }).__ECS_WEAK_POINT_ANALYZER__;
  if (globalFlag != null) return globalFlag === true || globalFlag === '1' || globalFlag === 'true';
  return envFlagEnabled('EXPO_PUBLIC_ECS_WEAK_POINT_ANALYZER') || envFlagEnabled('ECS_WEAK_POINT_ANALYZER');
}
