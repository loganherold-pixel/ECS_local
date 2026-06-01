import { evaluateECSConfidence } from './confidenceEngine';
import type { ECSConfidenceFreshness, ECSConfidenceResult } from './confidenceTypes';
import type {
  AgentRecommendation,
  ConfidenceBand,
  EvidenceItem,
  ExpeditionEvidenceField,
  ExpeditionIntelligenceConfidence,
  ExpeditionIntelligenceRiskLevel,
  RiskLevel,
} from './expeditionIntelligenceTypes';
import { confidenceToBand, evidenceFieldToEvidenceItem } from './expeditionAgentResponseContract';

export type ExpeditionRouteLegalStatus =
  | 'open'
  | 'restricted'
  | 'closed'
  | 'unknown'
  | 'conflicting';

export type ExpeditionRouteReport = {
  id: string;
  summary: string;
  sentiment: 'positive' | 'neutral' | 'bad' | 'severe' | 'conflicting';
  source?: 'community' | 'partner' | 'user' | 'unknown';
  updatedAt?: string | null;
  freshness?: ECSConfidenceFreshness;
  confidence?: ExpeditionIntelligenceConfidence;
};

export type ExpeditionRouteKnownHazard = {
  id: string;
  label: string;
  severity: 'watch' | 'caution' | 'critical' | 'unknown';
  source?: 'community' | 'weather' | 'route' | 'user' | 'unknown';
  updatedAt?: string | null;
  freshness?: ECSConfidenceFreshness;
};

export type ExpeditionRouteConfidenceBand = 'high' | 'moderate' | 'low' | 'unknown';

export type ExpeditionRouteRiskLevel =
  | 'low'
  | 'moderate'
  | 'elevated'
  | 'high'
  | 'severe';

export type RouteConfidenceComponentKey =
  | 'legal_access'
  | 'trail_difficulty'
  | 'vehicle_fit'
  | 'driver_fit'
  | 'weather'
  | 'seasonality'
  | 'remoteness'
  | 'community_reports'
  | 'recovery_complexity'
  | 'data_completeness';

export interface RouteConfidenceComponent {
  key: RouteConfidenceComponentKey;
  label: string;
  score: number;
  weight: number;
  riskLevel: RiskLevel;
  explanation: string;
  evidence: EvidenceItem[];
}

export type ExpeditionRouteScoreComponent = {
  id: string;
  label: string;
  value?: string | number | boolean | null;
  scoreDelta: number;
  impact: 'positive' | 'neutral' | 'negative';
  explanation: string;
  evidenceIds: string[];
};

export type ExpeditionRouteConfidenceInput = {
  routeId?: string | null;
  routeName?: string | null;
  legalStatus?: ExpeditionRouteLegalStatus | null;
  legalStatusFreshness?: ECSConfidenceFreshness;
  trailDifficulty?: 'easy' | 'moderate' | 'hard' | 'technical' | 'unknown' | null;
  routeDifficulty?: 'easy' | 'moderate' | 'hard' | 'technical' | 'unknown' | null;
  weatherRisk?: 'none' | 'watch' | 'severe' | 'unknown' | null;
  seasonalityRisk?: 'low' | 'moderate' | 'high' | 'unknown' | null;
  remoteness?: 'low' | 'moderate' | 'remote' | 'extreme' | 'unknown' | null;
  vehicleCapability?: 'capable' | 'marginal' | 'unfit' | 'unknown' | null;
  driverExperience?: 'experienced' | 'moderate' | 'novice' | 'unknown' | null;
  driverSkill?: 'experienced' | 'moderate' | 'novice' | 'unknown' | null;
  recoveryDifficulty?: 'easy' | 'moderate' | 'hard' | 'severe' | 'unknown' | null;
  campsiteAvailability?: 'available' | 'limited' | 'unavailable' | 'unknown' | null;
  resupplyAvailability?: 'available' | 'limited' | 'unavailable' | 'unknown' | null;
  knownHazards?: ExpeditionRouteKnownHazard[];
  dataCompleteness?: number | 'complete' | 'partial' | 'limited' | 'unknown' | null;
  routeGeometryComplete?: boolean | null;
  hasBailoutOptions?: boolean | null;
  recoveryIncidentActive?: boolean | null;
  incidentEscalationRecommended?: boolean | null;
  communityReports?: ExpeditionRouteReport[];
  staleData?: string[];
  missingData?: string[];
};

export type ExpeditionRouteConfidenceResult = {
  score: number;
  level: ExpeditionIntelligenceConfidence;
  confidenceBand: ConfidenceBand;
  status: ExpeditionIntelligenceRiskLevel;
  riskLevel: RiskLevel;
  components: RouteConfidenceComponent[];
  scoreComponents: ExpeditionRouteScoreComponent[];
  missingData: string[];
  assumptions: string[];
  evidenceReferences: string[];
  confidence: ECSConfidenceResult;
  summary: string;
  explanation: string;
  recommendedNextActions: AgentRecommendation[];
  recommendedNextActionLabels: string[];
  concerns: string[];
  evidence: EvidenceItem[];
  legacyEvidence: ExpeditionEvidenceField[];
  dataLimitations: string[];
  escalationRecommended: boolean;
  escalationReason?: string | null;
};

function confidenceLevel(result: ECSConfidenceResult): ExpeditionIntelligenceConfidence {
  switch (result.level) {
    case 'high':
      return 'high';
    case 'moderate':
      return 'medium';
    case 'limited':
    case 'low':
      return 'low';
    default:
      return 'unknown';
  }
}

function statusFromScore(score: number, confidence: ExpeditionIntelligenceConfidence): ExpeditionIntelligenceRiskLevel {
  if (confidence === 'unknown' && score > 68) return 'unknown';
  if (score <= 25) return 'critical';
  if (score <= 45) return 'caution';
  if (score <= 68) return 'watch';
  return 'normal';
}

function routeRiskLevelFromScore(score: number, escalationRecommended: boolean): RiskLevel {
  if (escalationRecommended || score <= 20) return 'severe';
  if (score <= 35) return 'high';
  if (score <= 55) return 'elevated';
  if (score <= 75) return 'moderate';
  return 'low';
}

function sourceFreshness(freshness?: ECSConfidenceFreshness): ECSConfidenceFreshness {
  return freshness ?? 'unknown';
}

function freshnessIsStale(freshness?: ECSConfidenceFreshness): boolean {
  return freshness === 'stale' || freshness === 'unknown';
}

function pushConcern(target: string[], value: string): void {
  if (!target.includes(value)) target.push(value);
}

function pushLimitation(target: string[], value: string): void {
  if (!target.includes(value)) target.push(value);
}

function evidence(
  id: string,
  label: string,
  value: ExpeditionEvidenceField['value'],
  source: ExpeditionEvidenceField['source'],
  options: Partial<ExpeditionEvidenceField> = {},
): ExpeditionEvidenceField {
  return {
    id,
    label,
    value,
    source,
    ...options,
  };
}

function normalizeDifficulty(input: ExpeditionRouteConfidenceInput): NonNullable<ExpeditionRouteConfidenceInput['trailDifficulty']> {
  return input.routeDifficulty ?? input.trailDifficulty ?? 'unknown';
}

function normalizeDriverExperience(input: ExpeditionRouteConfidenceInput): NonNullable<ExpeditionRouteConfidenceInput['driverExperience']> {
  return input.driverSkill ?? input.driverExperience ?? 'unknown';
}

function componentImpact(scoreDelta: number): ExpeditionRouteScoreComponent['impact'] {
  if (scoreDelta > 0) return 'positive';
  if (scoreDelta < 0) return 'negative';
  return 'neutral';
}

function componentKeyFromId(id: string): RouteConfidenceComponentKey {
  if (id.includes('legal')) return 'legal_access';
  if (id.includes('difficulty')) return 'trail_difficulty';
  if (id.includes('vehicle')) return 'vehicle_fit';
  if (id.includes('driver')) return 'driver_fit';
  if (id.includes('weather')) return 'weather';
  if (id.includes('seasonality')) return 'seasonality';
  if (id.includes('remoteness')) return 'remoteness';
  if (id.includes('report')) return 'community_reports';
  if (id.includes('recovery') || id.includes('bailout') || id.includes('incident')) return 'recovery_complexity';
  return 'data_completeness';
}

function riskLevelFromComponentScore(score: number): RiskLevel {
  if (score <= 20) return 'severe';
  if (score <= 40) return 'high';
  if (score <= 60) return 'elevated';
  if (score <= 80) return 'moderate';
  return 'low';
}

function componentWeight(delta: number): number {
  return Math.max(1, Math.min(5, Math.ceil(Math.abs(delta) / 10)));
}

function dataCompletenessPenalty(
  value: ExpeditionRouteConfidenceInput['dataCompleteness'],
): number {
  if (typeof value === 'number') {
    if (value >= 0.85) return 0;
    if (value >= 0.65) return -6;
    if (value >= 0.4) return -12;
    return -18;
  }
  switch (value) {
    case 'complete':
      return 0;
    case 'partial':
      return -6;
    case 'limited':
      return -12;
    case 'unknown':
      return -14;
    default:
      return 0;
  }
}

function buildRecommendedNextActions(params: {
  input: ExpeditionRouteConfidenceInput;
  concerns: string[];
  dataLimitations: string[];
  status: ExpeditionIntelligenceRiskLevel;
  riskLevel: RiskLevel;
}): string[] {
  const actions: string[] = [];
  const legalStatus = params.input.legalStatus ?? 'unknown';
  const driverExperience = normalizeDriverExperience(params.input);
  const trailDifficulty = normalizeDifficulty(params.input);

  if (legalStatus === 'unknown' || legalStatus === 'conflicting') {
    actions.push('Verify legal access and current closure status before committing to the route.');
  }
  if ((params.input.communityReports ?? []).some((report) => freshnessIsStale(report.freshness) || report.sentiment === 'conflicting')) {
    actions.push('Refresh recent trail condition reports and resolve conflicting community signals.');
  }
  if (params.input.weatherRisk === 'severe') {
    actions.push('Delay, reroute, or choose a lower-exposure option until severe weather risk clears.');
  }
  if (
    params.input.vehicleCapability === 'marginal' ||
    params.input.vehicleCapability === 'unfit' ||
    driverExperience === 'novice' ||
    ((trailDifficulty === 'hard' || trailDifficulty === 'technical') && driverExperience !== 'experienced')
  ) {
    actions.push('Match the route to vehicle capability and driver skill, or choose a lower-difficulty alternate.');
  }
  if (params.input.recoveryDifficulty === 'hard' || params.input.recoveryDifficulty === 'severe' || params.input.hasBailoutOptions === false) {
    actions.push('Confirm bailout, recovery, and communication options before continuing.');
  }
  if (params.input.campsiteAvailability === 'unavailable' || params.input.resupplyAvailability === 'unavailable') {
    actions.push('Confirm camp and resupply options or stage supplies before entering the route.');
  }
  if (params.riskLevel === 'severe' || params.status === 'critical') {
    actions.push('Open Incident & Recovery if this route risk is already affecting the active expedition.');
  }
  if (!actions.length) {
    actions.push('Continue monitoring weather, access, reports, vehicle fit, and driver readiness before departure.');
  }
  return actions.slice(0, 4);
}

function actionPriority(riskLevel: RiskLevel): AgentRecommendation['priority'] {
  switch (riskLevel) {
    case 'severe':
      return 'critical';
    case 'high':
      return 'high';
    case 'elevated':
      return 'medium';
    default:
      return 'low';
  }
}

function toRouteRecommendation(
  title: string,
  riskLevel: RiskLevel,
  rationale: string,
): AgentRecommendation {
  return {
    title,
    priority: actionPriority(riskLevel),
    rationale,
    action: title,
  };
}

function buildRouteAssumptions(
  input: ExpeditionRouteConfidenceInput,
  dataLimitations: string[],
): string[] {
  const assumptions: string[] = [];
  if (input.routeGeometryComplete !== false) {
    assumptions.push('Route geometry is treated as usable unless ECS has an explicit incomplete-geometry signal.');
  }
  if (!input.communityReports?.length) {
    assumptions.push('No recent community report context is available for this scoring pass.');
  }
  if (dataLimitations.length > 0) {
    assumptions.push('Confidence is limited by missing, stale, unknown, or conflicting route evidence.');
  }
  return Array.from(new Set(assumptions));
}

export function scoreExpeditionRouteConfidence(
  input: ExpeditionRouteConfidenceInput,
): ExpeditionRouteConfidenceResult {
  let score = 82;
  const concerns: string[] = [];
  const dataLimitations: string[] = [];
  const scoreComponents: ExpeditionRouteScoreComponent[] = [];
  const reports = input.communityReports ?? [];
  const hazards = input.knownHazards ?? [];
  const staleData = input.staleData ?? [];
  const missingData = input.missingData ?? [];
  const legalStatus = input.legalStatus ?? 'unknown';
  const legalFreshness = sourceFreshness(input.legalStatusFreshness);
  const trailDifficulty = normalizeDifficulty(input);
  const driverExperience = normalizeDriverExperience(input);

  const adjustScore = (
    id: string,
    label: string,
    value: ExpeditionRouteScoreComponent['value'],
    delta: number,
    explanation: string,
    evidenceIds: string[],
  ) => {
    score += delta;
    scoreComponents.push({
      id,
      label,
      value,
      scoreDelta: delta,
      impact: componentImpact(delta),
      explanation,
      evidenceIds,
    });
  };

  if (legalStatus === 'closed') {
    adjustScore('legal-access', 'Legal access', legalStatus, -50, 'Closed access is a route-stopper until verified otherwise.', ['legal-status']);
    pushConcern(concerns, 'Route access is reported closed.');
  } else if (legalStatus === 'restricted') {
    adjustScore('legal-access', 'Legal access', legalStatus, -34, 'Restricted access requires confirmation before relying on the route.', ['legal-status']);
    pushConcern(concerns, 'Route access is reported restricted.');
  } else if (legalStatus === 'conflicting') {
    adjustScore('legal-access', 'Legal access', legalStatus, -28, 'Conflicting legal/access evidence reduces route confidence.', ['legal-status']);
    pushConcern(concerns, 'Legal/access signals conflict.');
  } else if (legalStatus === 'unknown') {
    adjustScore('legal-access', 'Legal access', legalStatus, -16, 'Unknown legal/access status prevents high confidence.', ['legal-status']);
    pushConcern(concerns, 'Legal/access status is unknown.');
  } else {
    adjustScore('legal-access', 'Legal access', legalStatus, 4, 'Open access supports route confidence when current.', ['legal-status']);
  }

  if (freshnessIsStale(legalFreshness)) {
    adjustScore(
      'legal-freshness',
      'Legal access freshness',
      legalFreshness,
      legalFreshness === 'stale' ? -10 : -4,
      'Stale or unknown legal/access evidence reduces confidence.',
      ['legal-status'],
    );
    pushLimitation(dataLimitations, 'Legal/access status is stale or unknown.');
  }

  switch (input.weatherRisk ?? 'unknown') {
    case 'severe':
      adjustScore(
        'weather',
        'Weather',
        'severe',
        input.remoteness === 'remote' || input.remoteness === 'extreme' ? -34 : -26,
        'Severe weather reduces confidence even when the route is otherwise easy.',
        ['weather-risk'],
      );
      pushConcern(concerns, 'Severe weather risk is active for the route.');
      break;
    case 'watch':
      adjustScore('weather', 'Weather', 'watch', -10, 'Weather deserves monitoring before committing.', ['weather-risk']);
      pushConcern(concerns, 'Weather deserves monitoring.');
      break;
    case 'unknown':
      adjustScore('weather', 'Weather', 'unknown', -8, 'Unknown weather keeps route confidence limited.', ['weather-risk']);
      pushLimitation(dataLimitations, 'Weather risk is unknown.');
      break;
  }

  switch (input.seasonalityRisk ?? 'unknown') {
    case 'high':
      adjustScore('seasonality', 'Seasonality', 'high', -14, 'Seasonal conditions may materially change passability.', ['seasonality']);
      pushConcern(concerns, 'Seasonality may materially affect passability.');
      break;
    case 'moderate':
      adjustScore('seasonality', 'Seasonality', 'moderate', -7, 'Seasonal conditions deserve monitoring.', ['seasonality']);
      break;
    case 'unknown':
      adjustScore('seasonality', 'Seasonality', 'unknown', -4, 'Seasonal route context is unknown.', ['seasonality']);
      pushLimitation(dataLimitations, 'Seasonality context is unknown.');
      break;
  }

  switch (input.remoteness ?? 'unknown') {
    case 'extreme':
      adjustScore('remoteness', 'Remoteness', 'extreme', -18, 'Extreme remoteness increases the consequence of problems.', ['remoteness']);
      pushConcern(concerns, 'Route is extremely remote.');
      break;
    case 'remote':
      adjustScore('remoteness', 'Remoteness', 'remote', -12, 'Remote terrain increases consequence and recovery complexity.', ['remoteness']);
      pushConcern(concerns, 'Route remoteness increases consequence of problems.');
      break;
    case 'unknown':
      adjustScore('remoteness', 'Remoteness', 'unknown', -5, 'Unknown remoteness limits operational confidence.', ['remoteness']);
      pushLimitation(dataLimitations, 'Remoteness context is unknown.');
      break;
  }

  switch (input.vehicleCapability ?? 'unknown') {
    case 'unfit':
      adjustScore('vehicle-capability', 'Vehicle capability', 'unfit', -40, 'Vehicle capability is below route demand.', ['vehicle-capability']);
      pushConcern(concerns, 'Vehicle fit is not adequate for the route.');
      break;
    case 'marginal':
      adjustScore('vehicle-capability', 'Vehicle capability', 'marginal', -20, 'Marginal vehicle fit reduces operating margin.', ['vehicle-capability']);
      pushConcern(concerns, 'Vehicle fit is marginal for the route.');
      break;
    case 'unknown':
      adjustScore('vehicle-capability', 'Vehicle capability', 'unknown', -10, 'Unknown vehicle fit prevents high confidence.', ['vehicle-capability']);
      pushLimitation(dataLimitations, 'Vehicle fit is unknown.');
      break;
    case 'capable':
      adjustScore('vehicle-capability', 'Vehicle capability', 'capable', 5, 'Vehicle capability supports this route.', ['vehicle-capability']);
      break;
  }

  switch (driverExperience) {
    case 'novice':
      adjustScore('driver-skill', 'Driver skill', 'novice', -18, 'Novice driver skill lowers route confidence, especially as difficulty rises.', ['driver-experience']);
      pushConcern(concerns, 'Driver experience is limited for this route.');
      break;
    case 'moderate':
      adjustScore(
        'driver-skill',
        'Driver skill',
        'moderate',
        trailDifficulty === 'hard' || trailDifficulty === 'technical' ? -10 : -4,
        'Moderate driver experience is acceptable on easier routes but limits confidence on harder routes.',
        ['driver-experience', 'trail-difficulty'],
      );
      break;
    case 'unknown':
      adjustScore('driver-skill', 'Driver skill', 'unknown', -8, 'Unknown driver skill limits confidence.', ['driver-experience']);
      pushLimitation(dataLimitations, 'Driver experience is unknown.');
      break;
  }

  if (trailDifficulty === 'technical') {
    adjustScore('route-difficulty', 'Route difficulty', 'technical', -16, 'Technical terrain increases route consequence.', ['trail-difficulty']);
    pushConcern(concerns, 'Technical terrain increases route consequence.');
  } else if (trailDifficulty === 'hard') {
    adjustScore('route-difficulty', 'Route difficulty', 'hard', -10, 'Hard terrain reduces route confidence unless other margins are strong.', ['trail-difficulty']);
  } else if (trailDifficulty === 'unknown') {
    adjustScore('route-difficulty', 'Route difficulty', 'unknown', -7, 'Unknown route difficulty limits confidence.', ['trail-difficulty']);
    pushLimitation(dataLimitations, 'Trail difficulty is unknown.');
  } else if (trailDifficulty === 'easy') {
    adjustScore('route-difficulty', 'Route difficulty', 'easy', 3, 'Easy route difficulty supports confidence when other evidence agrees.', ['trail-difficulty']);
  }

  if (input.routeGeometryComplete === false) {
    adjustScore('route-geometry', 'Route geometry', false, -18, 'Incomplete route geometry limits routing and consequence analysis.', ['route-geometry']);
    pushLimitation(dataLimitations, 'Route geometry is incomplete.');
  }
  if (input.hasBailoutOptions === false) {
    adjustScore('bailout-options', 'Bailout options', false, -12, 'Unconfirmed bailout or exit options increase consequence.', ['bailout-options']);
    pushConcern(concerns, 'Bailout or exit options are not confirmed.');
  }

  switch (input.recoveryDifficulty ?? 'unknown') {
    case 'severe':
      adjustScore('recovery-difficulty', 'Recovery difficulty', 'severe', -18, 'Recovery would likely be difficult if something goes wrong.', ['recovery-difficulty']);
      pushConcern(concerns, 'Recovery difficulty is severe.');
      break;
    case 'hard':
      adjustScore('recovery-difficulty', 'Recovery difficulty', 'hard', -10, 'Recovery difficulty reduces operating margin.', ['recovery-difficulty']);
      pushConcern(concerns, 'Recovery difficulty is high.');
      break;
    case 'unknown':
      adjustScore('recovery-difficulty', 'Recovery difficulty', 'unknown', -5, 'Recovery difficulty is unknown.', ['recovery-difficulty']);
      pushLimitation(dataLimitations, 'Recovery difficulty is unknown.');
      break;
  }

  switch (input.campsiteAvailability ?? 'unknown') {
    case 'unavailable':
      adjustScore('campsite-availability', 'Campsite availability', 'unavailable', -10, 'No confirmed campsite reduces route margin.', ['campsite-availability']);
      pushConcern(concerns, 'Campsite availability is not confirmed.');
      break;
    case 'limited':
      adjustScore('campsite-availability', 'Campsite availability', 'limited', -5, 'Limited campsite options reduce flexibility.', ['campsite-availability']);
      break;
    case 'unknown':
      adjustScore('campsite-availability', 'Campsite availability', 'unknown', -3, 'Campsite availability is unknown.', ['campsite-availability']);
      pushLimitation(dataLimitations, 'Campsite availability is unknown.');
      break;
  }

  switch (input.resupplyAvailability ?? 'unknown') {
    case 'unavailable':
      adjustScore('resupply-availability', 'Resupply availability', 'unavailable', -10, 'No confirmed resupply reduces route margin.', ['resupply-availability']);
      pushConcern(concerns, 'Resupply availability is not confirmed.');
      break;
    case 'limited':
      adjustScore('resupply-availability', 'Resupply availability', 'limited', -5, 'Limited resupply options reduce flexibility.', ['resupply-availability']);
      break;
    case 'unknown':
      adjustScore('resupply-availability', 'Resupply availability', 'unknown', -3, 'Resupply availability is unknown.', ['resupply-availability']);
      pushLimitation(dataLimitations, 'Resupply availability is unknown.');
      break;
  }

  hazards.forEach((hazard) => {
    const delta = hazard.severity === 'critical' ? -22 : hazard.severity === 'caution' ? -12 : hazard.severity === 'watch' ? -6 : -4;
    adjustScore(
      `hazard-${hazard.id}`,
      'Known hazard',
      hazard.label,
      delta,
      `Known hazard affects route confidence: ${hazard.label}`,
      [`hazard-${hazard.id}`],
    );
    pushConcern(concerns, `Known hazard: ${hazard.label}`);
    if (freshnessIsStale(hazard.freshness)) {
      pushLimitation(dataLimitations, `Known hazard evidence is ${hazard.freshness ?? 'unknown'}: ${hazard.label}`);
    }
  });

  reports.forEach((report) => {
    if (report.sentiment === 'severe') {
      adjustScore(
        `report-${report.id}`,
        'Trail condition report',
        report.summary,
        report.freshness === 'fresh' ? -28 : -18,
        `Severe trail condition report reduces route confidence: ${report.summary}`,
        [`community-report-${report.id}`],
      );
      pushConcern(concerns, `Severe report: ${report.summary}`);
    } else if (report.sentiment === 'bad') {
      adjustScore(
        `report-${report.id}`,
        'Trail condition report',
        report.summary,
        report.freshness === 'fresh' || report.freshness === 'aging' ? -14 : -8,
        `Negative trail condition report reduces route confidence: ${report.summary}`,
        [`community-report-${report.id}`],
      );
      pushConcern(concerns, `Negative report: ${report.summary}`);
    } else if (report.sentiment === 'conflicting') {
      adjustScore(
        `report-${report.id}`,
        'Trail condition report',
        report.summary,
        -24,
        `Conflicting community report reduces confidence: ${report.summary}`,
        [`community-report-${report.id}`],
      );
      pushConcern(concerns, `Conflicting report: ${report.summary}`);
    } else if (report.sentiment === 'positive' && report.freshness === 'fresh') {
      adjustScore(
        `report-${report.id}`,
        'Trail condition report',
        report.summary,
        3,
        `Fresh positive trail condition report supports route confidence: ${report.summary}`,
        [`community-report-${report.id}`],
      );
    }
    if (freshnessIsStale(report.freshness)) {
      pushLimitation(dataLimitations, `Community report is ${report.freshness ?? 'unknown'}: ${report.summary}`);
    }
  });

  const completenessPenalty = dataCompletenessPenalty(input.dataCompleteness);
  if (completenessPenalty < 0) {
    adjustScore(
      'data-completeness',
      'Data completeness',
      typeof input.dataCompleteness === 'number' ? Math.round(input.dataCompleteness * 100) : input.dataCompleteness ?? 'unknown',
      completenessPenalty,
      'Incomplete data reduces confidence and prevents certainty.',
      ['data-completeness'],
    );
    pushLimitation(dataLimitations, 'Route confidence data is incomplete.');
  }

  if (input.recoveryIncidentActive) {
    score = Math.min(score, 24);
    adjustScore('active-incident-cap', 'Active incident cap', true, 0, 'Active incident context caps route confidence at critical range.', ['incident']);
    pushConcern(concerns, 'An active recovery or incident context is attached to this route.');
  }
  if (input.incidentEscalationRecommended) {
    score = Math.min(score, 18);
    adjustScore('incident-escalation-cap', 'Incident escalation cap', true, 0, 'Incident escalation recommendation caps route confidence at severe range.', ['incident']);
    pushConcern(concerns, 'Incident context recommends escalation.');
  }

  staleData.forEach((item) => pushLimitation(dataLimitations, `${item} is stale.`));
  missingData.forEach((item) => pushLimitation(dataLimitations, `${item} is missing.`));
  const explicitDataPenalty = Math.min(20, staleData.length * 5 + missingData.length * 5);
  if (explicitDataPenalty > 0) {
    adjustScore(
      'explicit-data-gaps',
      'Explicit data gaps',
      explicitDataPenalty,
      -explicitDataPenalty,
      'Missing or stale route data lowers confidence.',
      ['data-completeness'],
    );
  }
  score = Math.max(0, Math.min(100, Math.round(score)));

  const confidence = evaluateECSConfidence({
    domain: 'route_viability',
    cloudDependent: true,
    capLevel:
      legalStatus === 'unknown' ||
      legalStatus === 'conflicting' ||
      missingData.length > 0 ||
      staleData.length > 0
        ? 'moderate'
        : undefined,
    sources: [
      {
        id: 'legal_access',
        origin: 'inferred',
        available: legalStatus !== 'unknown',
        required: true,
        freshness: legalFreshness,
        priority: 'critical',
        agrees: legalStatus !== 'conflicting',
      },
      {
        id: 'route_geometry',
        origin: 'inferred',
        available: input.routeGeometryComplete !== false,
        required: true,
        freshness: 'fresh',
        priority: 'high',
      },
      {
        id: 'weather',
        origin: 'live',
        available: input.weatherRisk !== 'unknown' && input.weatherRisk != null,
        required: false,
        freshness: input.weatherRisk === 'unknown' ? 'unknown' : 'fresh',
        priority: input.weatherRisk === 'severe' ? 'critical' : 'high',
      },
      {
        id: 'vehicle_fit',
        origin: 'manual',
        available: input.vehicleCapability !== 'unknown' && input.vehicleCapability != null,
        required: true,
        freshness: 'fresh',
        priority: 'high',
      },
      {
        id: 'driver_skill',
        origin: 'manual',
        available: driverExperience !== 'unknown',
        required: true,
        freshness: 'fresh',
        priority: 'high',
      },
      {
        id: 'community_reports',
        origin: 'manual',
        available: reports.length > 0,
        required: false,
        freshness: reports.some((report) => report.freshness === 'fresh') ? 'fresh' : reports.length ? 'stale' : 'unknown',
        priority: 'normal',
        agrees: !reports.some((report) => report.sentiment === 'conflicting'),
      },
      {
        id: 'known_hazards',
        origin: 'inferred',
        available: hazards.length > 0,
        required: false,
        freshness: hazards.some((hazard) => hazard.freshness === 'fresh') ? 'fresh' : hazards.length ? 'stale' : 'unknown',
        priority: hazards.some((hazard) => hazard.severity === 'critical') ? 'critical' : 'normal',
      },
    ],
  });
  const level = confidenceLevel(confidence);
  const confidenceBand = confidenceToBand(level);
  const status = statusFromScore(score, level);
  const escalationRecommended =
    status === 'critical' ||
    input.incidentEscalationRecommended === true ||
    (input.weatherRisk === 'severe' && (input.remoteness === 'remote' || input.remoteness === 'extreme'));
  const riskLevel = routeRiskLevelFromScore(score, escalationRecommended);
  const legacyEvidence = [
    evidence('route-name', 'Route name', input.routeName ?? input.routeId ?? null, 'route'),
    evidence('legal-status', 'Legal/access status', legalStatus, 'route', {
      stale: freshnessIsStale(legalFreshness),
      confidence: legalStatus === 'open' ? 'high' : legalStatus === 'unknown' ? 'low' : 'medium',
    }),
    evidence('trail-difficulty', 'Route difficulty', trailDifficulty, 'route'),
    evidence('weather-risk', 'Weather risk', input.weatherRisk ?? 'unknown', 'weather'),
    evidence('seasonality', 'Seasonality risk', input.seasonalityRisk ?? 'unknown', 'route', {
      missing: !input.seasonalityRisk || input.seasonalityRisk === 'unknown',
    }),
    evidence('remoteness', 'Remoteness', input.remoteness ?? 'unknown', 'route'),
    evidence('vehicle-capability', 'Vehicle capability', input.vehicleCapability ?? 'unknown', 'vehicle'),
    evidence('driver-experience', 'Driver skill', driverExperience, 'manual'),
    evidence('recovery-difficulty', 'Recovery difficulty', input.recoveryDifficulty ?? 'unknown', 'route', {
      missing: !input.recoveryDifficulty || input.recoveryDifficulty === 'unknown',
    }),
    evidence('campsite-availability', 'Campsite availability', input.campsiteAvailability ?? 'unknown', 'route', {
      missing: !input.campsiteAvailability || input.campsiteAvailability === 'unknown',
    }),
    evidence('resupply-availability', 'Resupply availability', input.resupplyAvailability ?? 'unknown', 'route', {
      missing: !input.resupplyAvailability || input.resupplyAvailability === 'unknown',
    }),
    evidence('community-report-count', 'Community report count', reports.length, 'community', {
      stale: reports.some((report) => freshnessIsStale(report.freshness)),
    }),
    evidence('known-hazard-count', 'Known hazard count', hazards.length, 'route', {
      stale: hazards.some((hazard) => freshnessIsStale(hazard.freshness)),
    }),
    evidence('data-completeness', 'Data completeness', input.dataCompleteness ?? 'unknown', 'inferred', {
      missing: input.dataCompleteness === 'unknown',
    }),
  ];
  const evidenceList = legacyEvidence.map(evidenceFieldToEvidenceItem);
  const evidenceById = new Map(legacyEvidence.map((item, index) => [item.id, evidenceList[index]]));
  const limitedData = Array.from(new Set(dataLimitations)).slice(0, 8);
  const explanation =
    status === 'normal'
      ? 'Route confidence is strong, but ECS is still using the available evidence rather than certainty.'
      : `${concerns[0] ?? limitedData[0] ?? 'Route confidence is limited by incomplete evidence.'} ECS reduced confidence where data is missing, stale, conflicting, or operational consequence is high.`;
  const recommendedNextActionLabels = buildRecommendedNextActions({
    input,
    concerns,
    dataLimitations: limitedData,
    status,
    riskLevel,
  });
  const recommendedNextActions = recommendedNextActionLabels.map((item) => toRouteRecommendation(
    item,
    riskLevel,
    concerns[0] ?? limitedData[0] ?? explanation,
  ));
  const assumptions = buildRouteAssumptions(input, limitedData);
  const components = scoreComponents.map((component) => {
    const componentScore = Math.max(0, Math.min(100, 82 + component.scoreDelta));
    const componentEvidence = component.evidenceIds
      .map((id) => evidenceById.get(id))
      .filter((item): item is EvidenceItem => Boolean(item));
    return {
      key: componentKeyFromId(component.id),
      label: component.label,
      score: componentScore,
      weight: componentWeight(component.scoreDelta),
      riskLevel: riskLevelFromComponentScore(componentScore),
      explanation: component.explanation,
      evidence: componentEvidence,
    };
  });

  return {
    score,
    level,
    confidenceBand,
    status,
    riskLevel,
    components,
    scoreComponents,
    missingData: Array.from(new Set(missingData)),
    assumptions,
    evidenceReferences: legacyEvidence.map((item) => item.id),
    confidence,
    summary:
      status === 'normal'
        ? 'Route confidence is strong enough for continued ECS planning, based on available evidence.'
        : concerns[0] ?? dataLimitations[0] ?? 'Route confidence is limited by incomplete evidence.',
    explanation,
    recommendedNextActions,
    recommendedNextActionLabels,
    concerns: concerns.slice(0, 5),
    evidence: evidenceList,
    legacyEvidence,
    dataLimitations: limitedData,
    escalationRecommended,
    escalationReason: escalationRecommended
      ? concerns[0] ?? 'Route confidence reached critical or escalation-relevant state.'
      : null,
  };
}
