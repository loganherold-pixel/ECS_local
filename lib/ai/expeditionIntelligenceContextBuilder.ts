import type { ExpeditionContextSnapshot } from '../expedition/operationalAssessmentTypes';
import type { IncidentContext } from '../types/incidentRecovery';
import type {
  ExpeditionContext,
  ExpeditionContextField,
  ExpeditionContextCommunityReport,
  ExpeditionContextDebrief,
  ExpeditionEvidenceField,
  ExpeditionLifecyclePhase,
} from './expeditionIntelligenceTypes';
import type { ExpeditionRouteConfidenceInput } from './expeditionRouteConfidenceEngine';

type ActiveVehicleSnapshotForEcs = ReturnType<
  typeof import('../vehicleEcsIntegration').getActiveVehicleSnapshotForEcs
>;

export type ExpeditionIntelligenceContext = ExpeditionContext & {
  builtAt: string;
  lifecyclePhase: ExpeditionLifecyclePhase;
  expeditionId?: string | null;
  route?: ExpeditionRouteConfidenceInput | null;
  operationalSnapshot?: ExpeditionContextSnapshot | null;
  incident?: IncidentContext | null;
  staleData: string[];
};

type ContextSource = ExpeditionEvidenceField['source'];

type GenericRecord = Record<string, unknown>;

type ExpeditionContextBuilderParams = {
  lifecyclePhase: ExpeditionLifecyclePhase;
  expeditionId?: string | null;
  route?: ExpeditionRouteConfidenceInput | null;
  operationalSnapshot?: ExpeditionContextSnapshot | null;
  incident?: IncidentContext | null;
  userProfile?: unknown;
  driverProfile?: unknown;
  vehicleProfile?: unknown;
  vehicleProfiles?: unknown[];
  trip?: unknown;
  weather?: unknown;
  legalAccess?: unknown;
  campsiteLogistics?: unknown;
  convoy?: unknown;
  communityReports?: unknown[];
  priorDebriefs?: unknown[];
  learnedPreferences?: unknown;
  now?: string;
};

function pushUnique(target: string[], value: string | null | undefined): void {
  const clean = String(value ?? '').trim();
  if (!clean || target.includes(clean)) return;
  target.push(clean);
}

function addEvidence(
  target: ExpeditionEvidenceField[],
  field: ExpeditionEvidenceField,
): void {
  if (target.some((item) => item.id === field.id)) return;
  target.push(field);
}

function asRecord(value: unknown): GenericRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as GenericRecord : null;
}

function pickValue(source: unknown, keys: string[]): unknown {
  const record = asRecord(source);
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function pickString(source: unknown, keys: string[]): string | null {
  const value = pickValue(source, keys);
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

function pickNumber(source: unknown, keys: string[]): number | null {
  const value = pickValue(source, keys);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function pickStringArray(source: unknown, keys: string[]): string[] {
  const value = pickValue(source, keys);
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? '').trim()).filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function readDataPointValue<T>(candidate: unknown): T | null {
  const record = asRecord(candidate);
  if (record && 'value' in record) return (record.value ?? null) as T | null;
  return (candidate ?? null) as T | null;
}

function dataPointUpdatedAt(candidate: unknown): string | null {
  const record = asRecord(candidate);
  const updatedAt = record?.updatedAt;
  return typeof updatedAt === 'string' ? updatedAt : null;
}

function dataPointIsStale(candidate: unknown): boolean {
  const record = asRecord(candidate);
  return record?.isStale === true || record?.stale === true;
}

function field<T>(
  value: T | null | undefined,
  source: ContextSource,
  options: {
    sourceRef?: string | null;
    updatedAt?: string | null;
    stale?: boolean;
    confidence?: ExpeditionEvidenceField['confidence'];
  } = {},
): ExpeditionContextField<T> {
  const cleanValue = value ?? null;
  return {
    value: cleanValue,
    available: cleanValue !== null && cleanValue !== undefined,
    source,
    ...options,
  };
}

function addContextEvidence(
  target: ExpeditionEvidenceField[],
  missingData: string[],
  staleData: string[],
  item: ExpeditionEvidenceField,
): void {
  addEvidence(target, item);
  if (item.missing) pushUnique(missingData, item.label);
  if (item.stale) pushUnique(staleData, item.label);
}

function normalizeCommunityReports(reports: unknown[] | undefined, routeReports: ExpeditionRouteConfidenceInput['communityReports']): ExpeditionContextCommunityReport[] {
  const raw = reports?.length ? reports : routeReports ?? [];
  return raw.map((report, index) => {
    const record = asRecord(report);
    return {
      id: pickString(record, ['id', 'reportId']) ?? `community-report-${index + 1}`,
      summary: pickString(record, ['summary', 'description', 'title', 'body']) ?? 'Community report summary unavailable',
      sentiment: pickString(record, ['sentiment', 'status', 'tone']),
      sourceRef: pickString(record, ['sourceRef', 'source', 'author', 'provider']),
      updatedAt: pickString(record, ['updatedAt', 'createdAt', 'reportedAt']),
      freshness: pickString(record, ['freshness', 'freshnessLabel']),
    };
  });
}

function normalizeDebriefs(debriefs: unknown[] | undefined): ExpeditionContextDebrief[] {
  return (debriefs ?? []).map((debrief, index) => {
    const record = asRecord(debrief);
    return {
      id: pickString(record, ['id', 'debriefId']) ?? `debrief-${index + 1}`,
      summary: pickString(record, ['summary', 'outcome', 'notes']),
      lessons: pickStringArray(record, ['lessons', 'recommendations', 'planningGaps']),
      routeId: pickString(record, ['routeId', 'trailId']),
      updatedAt: pickString(record, ['updatedAt', 'createdAt', 'completedAt']),
    };
  });
}

function normalizeVehicle(value: unknown, index: number) {
  const record = asRecord(value);
  const make = pickString(record, ['make']);
  const model = pickString(record, ['model']);
  const trim = pickString(record, ['trim']);
  return {
    id: pickString(record, ['id', 'vehicleId']) ?? `vehicle-${index + 1}`,
    label: pickString(record, ['name', 'label', 'callsign', 'nickname']),
    makeModel: [make, model, trim].filter(Boolean).join(' ') || null,
    modifications: pickStringArray(record, ['modifications', 'mods', 'accessories']),
    tires: pickString(record, ['tires', 'tireSize', 'tireStatus']),
    clearance: pickString(record, ['clearance', 'groundClearance']) ?? pickNumber(record, ['clearanceInches', 'groundClearanceInches']),
    drivetrain: pickString(record, ['drivetrain', 'driveType']),
    recoveryGear: pickStringArray(record, ['recoveryGear', 'recoveryEquipment']),
    capability: pickString(record, ['capability', 'vehicleCapability', 'readinessStatus']),
  };
}

function getOptionalActiveVehicleSnapshotForEcs(): ActiveVehicleSnapshotForEcs | null {
  try {
    const vehicleIntegration = require('../vehicleEcsIntegration') as typeof import('../vehicleEcsIntegration');
    return vehicleIntegration.getActiveVehicleSnapshotForEcs();
  } catch {
    return null;
  }
}

export function buildExpeditionIntelligenceContext(params: ExpeditionContextBuilderParams): ExpeditionIntelligenceContext {
  const evidence: ExpeditionEvidenceField[] = [];
  const missingData: string[] = [];
  const staleData: string[] = [];
  const route = params.route ?? null;
  const operational = params.operationalSnapshot ?? null;
  const incident = params.incident ?? null;
  const generatedAt = params.now ?? new Date().toISOString();
  const expeditionId = params.expeditionId ?? operational?.expeditionId ?? incident?.expeditionId ?? null;
  const trip = asRecord(params.trip);
  const userProfile = asRecord(params.userProfile);
  const driverProfile = asRecord(params.driverProfile) ?? userProfile;
  const weather = asRecord(params.weather);
  const legalAccess = asRecord(params.legalAccess);
  const logistics = asRecord(params.campsiteLogistics);
  const convoy = asRecord(params.convoy);
  const activeVehicleState = getOptionalActiveVehicleSnapshotForEcs();
  const activeVehicleProfile =
    activeVehicleState && (activeVehicleState.status === 'ready' || activeVehicleState.status === 'incomplete')
      ? {
          id: activeVehicleState.identity.vehicleId ?? activeVehicleState.identity.activeVehicleId,
          label: activeVehicleState.identity.displayName,
          make: activeVehicleState.identity.make,
          model: activeVehicleState.identity.model,
          trim: activeVehicleState.identity.trim,
          vehicleClass: activeVehicleState.intelligence.classification.label,
          vehicleType: activeVehicleState.identity.vehicleType,
          clearanceInches: activeVehicleState.specs?.ground_clearance_inches ?? null,
          tireSize: activeVehicleState.modifications.tireSizeInches != null ? `${activeVehicleState.modifications.tireSizeInches}"` : null,
          drivetrain: activeVehicleState.specs?.drivetrain ?? null,
          capability: activeVehicleState.intelligence.suggestions[0] ?? activeVehicleState.weight.confidenceCopy,
        }
      : null;
  const vehicleValues = params.vehicleProfiles?.length
    ? params.vehicleProfiles
    : params.vehicleProfile
      ? [params.vehicleProfile]
      : activeVehicleProfile
        ? [activeVehicleProfile]
        : operational?.vehicles ?? [];
  const vehicles = vehicleValues.map(normalizeVehicle);
  const primaryVehicle = vehicles[0] ?? null;
  const communityReports = normalizeCommunityReports(params.communityReports, route?.communityReports);
  const priorDebriefs = normalizeDebriefs(params.priorDebriefs);
  const learnedPreferenceList = pickStringArray(params.learnedPreferences, ['preferences', 'learnedPreferences', 'items']);
  if (Array.isArray(params.learnedPreferences)) {
    learnedPreferenceList.push(...params.learnedPreferences.map((item) => String(item ?? '').trim()).filter(Boolean));
  }

  const operationalRoute = operational?.route;
  const operationalCamp = operational?.camp;
  const operationalLogistics = operational?.logistics;
  const operationalConvoy = operational?.convoy;

  if (route) {
    addContextEvidence(evidence, missingData, staleData, {
      id: 'route-confidence-legal-status',
      label: 'Route legal/access status',
      value: route.legalStatus ?? 'unknown',
      source: 'route',
      stale: route.legalStatusFreshness === 'stale',
      missing: !route.legalStatus || route.legalStatus === 'unknown',
    });
    addContextEvidence(evidence, missingData, staleData, {
      id: 'route-confidence-weather',
      label: 'Route weather risk',
      value: route.weatherRisk ?? 'unknown',
      source: 'weather',
      missing: !route.weatherRisk || route.weatherRisk === 'unknown',
    });
    addContextEvidence(evidence, missingData, staleData, {
      id: 'route-confidence-vehicle-fit',
      label: 'Vehicle fit',
      value: route.vehicleCapability ?? 'unknown',
      source: 'vehicle',
      missing: !route.vehicleCapability || route.vehicleCapability === 'unknown',
    });
    (route.staleData ?? []).forEach((item) => pushUnique(staleData, item));
    (route.missingData ?? []).forEach((item) => pushUnique(missingData, item));
  }

  if (operational) {
    addContextEvidence(evidence, missingData, staleData, {
      id: 'operational-route-state',
      label: 'Operational route state',
      value: operational.route?.lifecycleState?.value ?? 'unknown',
      source: operational.route?.lifecycleState?.source === 'userManual' ? 'manual' : 'route',
      updatedAt: operational.route?.lifecycleState?.updatedAt ?? null,
      missing: !operational.route?.lifecycleState?.value,
    });
    addContextEvidence(evidence, missingData, staleData, {
      id: 'operational-convoy-count',
      label: 'Convoy team member count',
      value: operational.convoy?.teamMemberCount?.value ?? null,
      source: operational.convoy?.teamMemberCount?.source === 'userManual' ? 'manual' : 'inferred',
      updatedAt: operational.convoy?.teamMemberCount?.updatedAt ?? null,
      missing: operational.convoy?.teamMemberCount?.value == null,
    });
  }

  if (incident) {
    addContextEvidence(evidence, missingData, staleData, {
      id: 'incident-status',
      label: 'Incident status',
      value: incident.status,
      source: 'incident',
      updatedAt: incident.updatedAt,
    });
    addContextEvidence(evidence, missingData, staleData, {
      id: 'incident-severity',
      label: 'Incident severity',
      value: incident.severity,
      source: 'incident',
      updatedAt: incident.updatedAt,
      missing: incident.severity === 'unknown',
    });
    (incident.missingCriticalData ?? []).forEach((item) => pushUnique(missingData, item));
  }

  const routeNameValue = route?.routeName ?? readDataPointValue<string>(operationalRoute?.routeName) ?? pickString(trip, ['routeName', 'trailName']);
  const routeDifficultyValue = route?.routeDifficulty ?? route?.trailDifficulty ?? pickString(trip, ['routeDifficulty', 'trailDifficulty', 'difficulty']);
  const currentSegmentValue = readDataPointValue<string>(operationalRoute?.currentSegmentLabel) ?? pickString(trip, ['currentSegment', 'currentSegmentLabel']);
  const knownHazardsValue = readDataPointValue<string[]>(operationalRoute?.knownHazards) ?? pickStringArray(trip, ['knownHazards', 'hazards']);
  const startDateValue = pickString(trip, ['startDate', 'startDateIso', 'startsAt']);
  const endDateValue = pickString(trip, ['endDate', 'endDateIso', 'endsAt']);
  const tripDatesValue = [startDateValue, endDateValue].filter(Boolean).join(' to ') || null;
  const weatherRiskValue = route?.weatherRisk ?? pickString(weather, ['risk', 'weatherRisk', 'severity']);
  const weatherSummaryValue = pickString(weather, ['summary', 'forecastSummary', 'conditions']);
  const seasonalityRiskValue = route?.seasonalityRisk ?? pickString(weather, ['seasonalityRisk', 'seasonalRisk']);
  const remotenessValue = route?.remoteness ?? pickString(trip, ['remoteness', 'remotenessLevel']);
  const legalStatusValue = route?.legalStatus ?? pickString(legalAccess, ['status', 'legalStatus', 'accessStatus']);
  const legalFreshnessValue = route?.legalStatusFreshness ?? pickString(legalAccess, ['freshness', 'freshnessLabel']);
  const participantCount = pickNumber(convoy, ['participantCount', 'teamMemberCount', 'memberCount'])
    ?? readDataPointValue<number>(operationalConvoy?.teamMemberCount);
  const waterValue = readDataPointValue<number>(operationalLogistics?.waterRemainingLiters) ?? pickNumber(logistics, ['waterRemainingLiters', 'water']);
  const foodValue = readDataPointValue<number>(operationalLogistics?.foodDaysRemaining) ?? pickNumber(logistics, ['foodDaysRemaining', 'food']);
  const fuelValue =
    readDataPointValue<number>(operationalLogistics?.fuelRangeMiles) ??
    readDataPointValue<number>(operationalLogistics?.fuelRemainingGallons) ??
    readDataPointValue<number>(operationalLogistics?.fuelLevelPercent) ??
    pickNumber(logistics, ['fuelRangeMiles', 'fuelGallons', 'fuelPercent', 'fuel']);
  const powerValue = readDataPointValue<number>(operationalLogistics?.powerHoursRemaining) ?? pickNumber(logistics, ['powerHoursRemaining', 'power']);
  const campsiteAvailabilityValue = route?.campsiteAvailability
    ?? pickString(logistics, ['campsiteAvailability'])
    ?? (readDataPointValue<boolean>(operationalCamp?.alternateCampAvailable) === true ? 'available' : null);
  const resupplyAvailabilityValue = route?.resupplyAvailability ?? pickString(logistics, ['resupplyAvailability']);
  const conflictingReports = communityReports
    .filter((report) => String(report.sentiment ?? '').toLowerCase().includes('conflict'))
    .map((report) => report.summary);

  const requiredContextEvidence: ExpeditionEvidenceField[] = [
    { id: 'trip-intent-purpose', label: 'Trip intent', value: pickString(trip, ['purpose', 'intent', 'tripIntent']) ?? null, source: 'manual', missing: !pickString(trip, ['purpose', 'intent', 'tripIntent']) },
    { id: 'driver-skill', label: 'Driver skill', value: pickString(driverProfile, ['driverSkill', 'skill', 'experienceLevel']) ?? route?.driverSkill ?? route?.driverExperience ?? null, source: 'manual', missing: !(pickString(driverProfile, ['driverSkill', 'skill', 'experienceLevel']) ?? route?.driverSkill ?? route?.driverExperience) },
    { id: 'vehicle-primary', label: 'Primary vehicle', value: primaryVehicle?.label ?? primaryVehicle?.makeModel ?? null, source: 'vehicle', missing: !primaryVehicle },
    { id: 'route-name-context', label: 'Route context', value: routeNameValue ?? null, source: 'route', missing: !routeNameValue },
    { id: 'trip-dates', label: 'Trip dates', value: tripDatesValue, source: 'manual', missing: !tripDatesValue },
    { id: 'weather-context', label: 'Weather context', value: weatherRiskValue ?? weatherSummaryValue ?? null, source: 'weather', missing: !weatherRiskValue && !weatherSummaryValue },
    { id: 'legal-access-context', label: 'Legal access context', value: legalStatusValue ?? null, source: 'route', missing: !legalStatusValue || legalStatusValue === 'unknown', stale: legalFreshnessValue === 'stale' },
    { id: 'logistics-context', label: 'Logistics context', value: waterValue ?? fuelValue ?? foodValue ?? powerValue ?? null, source: 'manual', missing: waterValue == null && fuelValue == null && foodValue == null && powerValue == null },
    { id: 'community-report-context', label: 'Community reports', value: communityReports.length, source: 'community', missing: communityReports.length === 0, stale: communityReports.some((report) => report.freshness === 'stale') },
  ];
  requiredContextEvidence.forEach((item) => addContextEvidence(evidence, missingData, staleData, item));

  const context: ExpeditionContext = {
    tripIntent: {
      expeditionId,
      purpose: field(pickString(trip, ['purpose', 'intent', 'tripIntent']), 'manual'),
      startDate: field(startDateValue, 'manual'),
      endDate: field(endDateValue, 'manual'),
      lifecyclePhase: params.lifecyclePhase,
      learnedPreferences: field(Array.from(new Set(learnedPreferenceList)), learnedPreferenceList.length ? 'manual' : 'unknown'),
    },
    routeContext: {
      routeId: route?.routeId ?? pickString(trip, ['routeId', 'trailId']),
      routeName: field(routeNameValue, 'route', { updatedAt: dataPointUpdatedAt(operationalRoute?.routeName), stale: dataPointIsStale(operationalRoute?.routeName) }),
      routeDifficulty: field(routeDifficultyValue ?? null, 'route'),
      currentSegment: field(currentSegmentValue ?? null, 'route', { updatedAt: dataPointUpdatedAt(operationalRoute?.currentSegmentLabel), stale: dataPointIsStale(operationalRoute?.currentSegmentLabel) }),
      knownHazards: field(knownHazardsValue, knownHazardsValue.length ? 'route' : 'unknown'),
      tripDates: field(tripDatesValue, 'manual'),
    },
    vehicleContext: {
      primaryVehicle: field(primaryVehicle?.label ?? primaryVehicle?.makeModel ?? null, primaryVehicle ? 'vehicle' : 'unknown'),
      vehicles,
      modifications: field(Array.from(new Set(vehicles.flatMap((vehicle) => vehicle.modifications ?? []))), vehicles.length ? 'vehicle' : 'unknown'),
      tires: field(primaryVehicle?.tires ?? null, primaryVehicle?.tires ? 'vehicle' : 'unknown'),
      clearance: field(primaryVehicle?.clearance ?? null, primaryVehicle?.clearance != null ? 'vehicle' : 'unknown'),
      drivetrain: field(primaryVehicle?.drivetrain ?? null, primaryVehicle?.drivetrain ? 'vehicle' : 'unknown'),
      recoveryGear: field(Array.from(new Set(vehicles.flatMap((vehicle) => vehicle.recoveryGear ?? []))), vehicles.length ? 'vehicle' : 'unknown'),
      capability: field(route?.vehicleCapability ?? primaryVehicle?.capability ?? null, route?.vehicleCapability || primaryVehicle?.capability ? 'vehicle' : 'unknown'),
    },
    driverContext: {
      userId: pickString(userProfile, ['id', 'userId']),
      displayName: field(pickString(userProfile, ['displayName', 'name', 'fullName']), 'manual'),
      driverSkill: field(pickString(driverProfile, ['driverSkill', 'skill', 'experienceLevel']) ?? route?.driverSkill ?? route?.driverExperience ?? null, 'manual'),
      experience: field(pickString(driverProfile, ['experience', 'experienceSummary', 'yearsExperience']) ?? null, 'manual'),
    },
    environmentalContext: {
      weatherRisk: field(weatherRiskValue ?? null, weatherRiskValue ? 'weather' : 'unknown'),
      weatherSummary: field(weatherSummaryValue, weatherSummaryValue ? 'weather' : 'unknown'),
      seasonalityRisk: field(seasonalityRiskValue ?? null, seasonalityRiskValue ? 'weather' : 'unknown'),
      remoteness: field(remotenessValue ?? null, remotenessValue ? 'route' : 'unknown'),
    },
    legalAccessContext: {
      status: field(legalStatusValue ?? null, legalStatusValue ? 'route' : 'unknown', { stale: legalFreshnessValue === 'stale' }),
      freshness: field(legalFreshnessValue ?? null, legalFreshnessValue ? 'route' : 'unknown'),
      notes: field(pickString(legalAccess, ['notes', 'summary']), 'route'),
    },
    logisticsContext: {
      campsiteAvailability: field(campsiteAvailabilityValue ?? null, campsiteAvailabilityValue ? 'route' : 'unknown'),
      resupplyAvailability: field(resupplyAvailabilityValue ?? null, resupplyAvailabilityValue ? 'route' : 'unknown'),
      fuel: field(fuelValue, fuelValue != null ? 'manual' : 'unknown'),
      water: field(waterValue, waterValue != null ? 'manual' : 'unknown'),
      food: field(foodValue, foodValue != null ? 'manual' : 'unknown'),
      power: field(powerValue, powerValue != null ? 'manual' : 'unknown'),
      convoyParticipants: field(participantCount ?? null, participantCount != null ? 'manual' : 'unknown'),
    },
    communityReportContext: {
      reports: communityReports,
      freshnessSummary: field(communityReports.some((report) => report.freshness === 'stale') ? 'stale reports present' : communityReports.length ? 'reports available' : null, communityReports.length ? 'community' : 'unknown'),
      conflictingReports: field(conflictingReports, conflictingReports.length ? 'community' : 'unknown'),
    },
    priorDebriefs,
    evidence,
    missingData,
    generatedAt,
  };

  evidence.forEach((item) => {
    if (item.missing) pushUnique(missingData, item.label);
    if (item.stale) pushUnique(staleData, item.label);
  });

  return {
    ...context,
    builtAt: generatedAt,
    lifecyclePhase: params.lifecyclePhase,
    expeditionId,
    route,
    operationalSnapshot: operational,
    incident,
    staleData,
  };
}
