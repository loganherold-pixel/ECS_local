import type {
  AssessmentCategory,
  AssessmentStatus,
  ExpeditionAssessment,
  ExpeditionAssessmentDataUsed,
  ExpeditionContextSnapshot,
} from './operationalAssessmentTypes';
import type {
  IncidentCommunicationStatus,
  IncidentCoordinate,
  IncidentRecoveryContextSnapshot,
  IncidentType,
} from '../types/incidentRecovery';
import type {
  ReportIncidentInput,
  ReportIncidentResourceState,
  ReportIncidentSafetyState,
} from '../incidentRecoveryWorkflowStore';

export type ExpeditionAssessmentEscalationMetadata = {
  category: AssessmentCategory;
  status: AssessmentStatus;
  summary: string;
  recommendedAction: string;
  affectedLabel?: string | null;
  lastKnownLocationLabel?: string | null;
  dataUsed: ExpeditionAssessmentDataUsed[];
  staleDataWarnings: string[];
  missingDataWarnings: string[];
};

export type ExpeditionAssessmentEscalationRequest = {
  id: string;
  category: AssessmentCategory;
  status: AssessmentStatus;
  incidentType: IncidentType;
  summary: string;
  recommendedAction: string;
  affectedLabel?: string | null;
  lastKnownLocationLabel?: string | null;
  reportInput: ReportIncidentInput;
};

export function shouldOfferIncidentEscalation(assessment?: ExpeditionAssessment | null): boolean {
  return assessment?.status === 'critical' || assessment?.escalationRecommended === true;
}

function dataValue(assessment: ExpeditionAssessment, id: string): string | null {
  const value = assessment.dataUsed.find((item) => item.id === id)?.value;
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

function topConcernCategory(overview: ExpeditionAssessment): AssessmentCategory | null {
  const concern = overview.why[0] ?? overview.summary;
  const match = concern.match(/Top concern:\s+(Route|Convoy|Camp|Logistics|Vehicles)\s/i);
  if (!match) return null;
  return match[1].toLowerCase() as AssessmentCategory;
}

function incidentTypeForAssessment(assessment: ExpeditionAssessment): IncidentType {
  const category = assessment.category === 'overview'
    ? topConcernCategory(assessment) ?? 'overview'
    : assessment.category;

  switch (category) {
    case 'route':
      return 'route_blocked';
    case 'convoy':
      return 'separated_party';
    case 'camp':
      return 'camp_safety';
    case 'logistics':
      return 'fuel_water_supply';
    case 'vehicles':
      return 'vehicle_breakdown';
    default:
      return 'other';
  }
}

function affectedLabelForAssessment(assessment: ExpeditionAssessment): string | null {
  switch (assessment.category) {
    case 'convoy':
      return dataValue(assessment, 'assistance-needed-members') ??
        dataValue(assessment, 'overdue-members') ??
        dataValue(assessment, 'member-list');
    case 'vehicles':
      return dataValue(assessment, 'limiting-vehicle') ?? dataValue(assessment, 'vehicle-list');
    case 'logistics':
      return dataValue(assessment, 'limiting-resource');
    case 'camp':
      return dataValue(assessment, 'next-camp-name') ?? dataValue(assessment, 'alternate-camp-label');
    case 'route':
      return dataValue(assessment, 'difficult-terrain-label') ??
        dataValue(assessment, 'known-hazards') ??
        dataValue(assessment, 'route-issues');
    case 'overview':
      return assessment.why[0] ?? assessment.summary;
    default:
      return null;
  }
}

function lastKnownLocationLabel(params: {
  assessment: ExpeditionAssessment;
  contextSnapshot?: ExpeditionContextSnapshot | null;
  incidentContextSnapshot?: IncidentRecoveryContextSnapshot | null;
  routeLabel?: string;
}): string | null {
  const routeSegment =
    params.incidentContextSnapshot?.route?.routeSegmentLabel ??
    params.contextSnapshot?.route?.currentSegmentLabel?.value ??
    params.routeLabel ??
    null;
  const routeLocation = params.contextSnapshot?.route?.currentLocation?.value;
  if (routeSegment) return routeSegment;
  if (routeLocation) return `${routeLocation.latitude.toFixed(5)}, ${routeLocation.longitude.toFixed(5)}`;
  return dataValue(params.assessment, 'current-location');
}

function safetyForAssessment(assessment: ExpeditionAssessment): ReportIncidentSafetyState {
  return {
    anyoneInjured: null,
    anyoneMissing: assessment.category === 'convoy' && assessment.status === 'critical' ? null : null,
    anyoneTrapped: null,
    activeHazard: assessment.category === 'route' || assessment.category === 'camp' ? true : null,
    vehicleStable: assessment.category === 'vehicles' && assessment.status === 'critical' ? false : null,
    groupSafe: assessment.category === 'camp' && assessment.status === 'critical' ? false : null,
  };
}

function resourcesForAssessment(assessment: ExpeditionAssessment): ReportIncidentResourceState {
  return {
    vehicleDisabled: assessment.category === 'vehicles' && assessment.status === 'critical' ? true : null,
    terrain: assessment.category === 'route'
      ? dataValue(assessment, 'difficult-terrain-label') ?? ''
      : '',
    weather: assessment.category === 'camp'
      ? dataValue(assessment, 'weather-exposure') ?? ''
      : '',
    daylight: assessment.category === 'camp'
      ? dataValue(assessment, 'daylight-arrival-margin') ?? ''
      : '',
    fuelConcern: assessment.category === 'logistics' && /fuel/i.test(assessment.summary),
    waterConcern: assessment.category === 'logistics' && /water/i.test(assessment.summary),
    foodConcern: assessment.category === 'logistics' && /food/i.test(assessment.summary),
    shelterConcern: null,
    warmthConcern: null,
    medicalKitAvailable: null,
  };
}

function communicationStatusForAssessment(assessment: ExpeditionAssessment): IncidentCommunicationStatus {
  const communications = dataValue(assessment, 'communications') ?? dataValue(assessment, 'communications-quality');
  if (communications === 'offline') return 'offline';
  if (communications === 'degraded') return 'degraded';
  if (communications === 'online') return 'available';
  return 'unknown';
}

function notesForAssessment(metadata: ExpeditionAssessmentEscalationMetadata): string {
  const lines = [
    `Escalated from Expedition ${metadata.category} assessment (${metadata.status}).`,
    metadata.summary,
    `Recommended action: ${metadata.recommendedAction}`,
    metadata.affectedLabel ? `Affected: ${metadata.affectedLabel}` : null,
    metadata.lastKnownLocationLabel ? `Last known location: ${metadata.lastKnownLocationLabel}` : null,
    metadata.missingDataWarnings.length > 0 ? `Missing data: ${metadata.missingDataWarnings.join('; ')}` : null,
    metadata.staleDataWarnings.length > 0 ? `Stale data: ${metadata.staleDataWarnings.join('; ')}` : null,
    `Data used: ${metadata.dataUsed.slice(0, 8).map((item) => `${item.label}=${item.value ?? 'unknown'}`).join('; ')}`,
  ].filter(Boolean);
  return lines.join('\n');
}

export function buildAssessmentEscalationRequest(params: {
  assessment: ExpeditionAssessment;
  contextSnapshot?: ExpeditionContextSnapshot | null;
  incidentContextSnapshot?: IncidentRecoveryContextSnapshot | null;
  expeditionId?: string;
  routeLabel?: string;
  gpsLocation?: IncidentCoordinate | null;
}): ExpeditionAssessmentEscalationRequest {
  const { assessment } = params;
  const incidentType = incidentTypeForAssessment(assessment);
  const affectedLabel = affectedLabelForAssessment(assessment);
  const locationLabel = lastKnownLocationLabel({
    assessment,
    contextSnapshot: params.contextSnapshot,
    incidentContextSnapshot: params.incidentContextSnapshot,
    routeLabel: params.routeLabel,
  });
  const metadata: ExpeditionAssessmentEscalationMetadata = {
    category: assessment.category,
    status: assessment.status,
    summary: assessment.summary,
    recommendedAction: assessment.recommendedAction,
    affectedLabel,
    lastKnownLocationLabel: locationLabel,
    dataUsed: assessment.dataUsed,
    staleDataWarnings: assessment.staleDataWarnings,
    missingDataWarnings: assessment.missingDataWarnings,
  };
  const route = params.incidentContextSnapshot?.route;
  const reportInput: ReportIncidentInput = {
    expeditionId: params.expeditionId ?? params.contextSnapshot?.expeditionId ?? undefined,
    routeId: route?.routeId ?? params.contextSnapshot?.route?.routeId ?? null,
    routeLabel: params.routeLabel ?? route?.routeLabel ?? params.contextSnapshot?.route?.routeName?.value ?? undefined,
    routeSegmentLabel: route?.routeSegmentLabel ?? params.contextSnapshot?.route?.currentSegmentLabel?.value ?? null,
    type: incidentType,
    manualLocationDescription: locationLabel ?? undefined,
    location: params.gpsLocation ?? route?.currentLocation ?? null,
    communicationStatus: communicationStatusForAssessment(assessment),
    safety: safetyForAssessment(assessment),
    resources: resourcesForAssessment(assessment),
    contextSnapshot: params.incidentContextSnapshot ?? null,
    notes: notesForAssessment(metadata),
    assessmentEscalation: metadata,
  };

  return {
    id: `${assessment.id}-${assessment.lastUpdated}-${assessment.status}`,
    category: assessment.category,
    status: assessment.status,
    incidentType,
    summary: assessment.summary,
    recommendedAction: assessment.recommendedAction,
    affectedLabel,
    lastKnownLocationLabel: locationLabel,
    reportInput,
  };
}
