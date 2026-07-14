import {
  buildMissionCommandProposal,
  type MissionCommandProposalBuildResult,
  type MissionCommandProposalDraft,
  type MissionCommandProposalFact,
  type MissionCommandProposalIntent,
  type MissionCommandProposalOriginDomain,
} from './dispatchMissionCommandProposal';
import type { DispatchLinkedContext } from './dispatchTypes';
import type { SourceTruthConfidence, SourceTruthRef } from './sourceTruth';

interface MissionCommandSourceAdapterBase {
  sourceEntityId: string;
  expeditionId?: string | null;
  title: string;
  summary: string;
  sourceTruth: SourceTruthRef[];
  linkedContext?: DispatchLinkedContext | null;
  command?: MissionCommandProposalDraft | null;
  action: MissionCommandProposalIntent;
  playbookId?: string | null;
  incidentId?: string | null;
  facts?: MissionCommandProposalFact[];
  operatorRequested: boolean;
  offline?: boolean;
  returnRoute: string;
  createdAt?: string;
  now?: string | number | Date;
}

export interface DashboardMissionCommandProposalInput extends MissionCommandSourceAdapterBase {
  situation:
    | 'vehicle_warning'
    | 'resource_warning'
    | 'weather_warning'
    | 'convoy_stale_member'
    | 'camp_deadline'
    | 'offline_readiness_blocker'
    | 'validated_advisory';
  sourceSurface?: 'dashboard' | 'ecs_brief';
}

export interface FleetMissionCommandVehicleSnapshot {
  vehicleId: string;
  label: string;
  readiness: string;
  payload: string;
  recoveryEquipment: string;
  confidence: SourceTruthConfidence;
}

export interface FleetMissionCommandProposalInput extends MissionCommandSourceAdapterBase {
  snapshot: FleetMissionCommandVehicleSnapshot;
}

export interface NavigateMissionCommandProposalInput extends MissionCommandSourceAdapterBase {
  operation: 'route_blockage_report' | 'rally' | 'route_command' | 'bailout_decision';
}

export interface ExploreMissionCommandProposalInput extends MissionCommandSourceAdapterBase {
  planningAction: 'planned_check_in' | 'rally_point' | 'route_review' | 'preparation_task';
  sourceSurface?: 'explore' | 'trip_builder';
}

export interface CampOpsMissionCommandProposalInput extends MissionCommandSourceAdapterBase {
  decision: 'safe_endpoint_review' | 'camp_diversion_deadline' | 'camp_decision' | 'backup_endpoint_review';
  authority: 'campops';
}

export interface WeatherMissionCommandProposalInput extends MissionCommandSourceAdapterBase {
  hazardKind: string;
  material: boolean;
}

export interface IncidentRecoveryMissionCommandProposalInput extends MissionCommandSourceAdapterBase {
  incidentId: string;
  explicitEscalation: boolean;
}

export function createDashboardMissionCommandProposal(
  input: DashboardMissionCommandProposalInput,
): MissionCommandProposalBuildResult {
  return adaptSourceProposal(input, {
    domain: input.sourceSurface ?? 'dashboard',
    sourceEntityType: input.sourceSurface === 'ecs_brief' ? 'ecs_brief_assessment' : 'dashboard_assessment',
    label: input.sourceSurface === 'ecs_brief' ? 'ECS Brief' : 'Dashboard',
    facts: [
      { key: 'situation', label: 'Validated situation', value: humanize(input.situation) },
    ],
  });
}

export function createFleetMissionCommandProposal(
  input: FleetMissionCommandProposalInput,
): MissionCommandProposalBuildResult {
  const vehicleId = cleanToken(input.snapshot?.vehicleId);
  const vehicleLabel = cleanText(input.snapshot?.label);
  if (!vehicleId || !vehicleLabel) {
    return invalid('mission_command_proposal_fleet_snapshot_invalid', 'Fleet proposal requires an active vehicle reference.');
  }
  const linkedContext = input.linkedContext ?? {
    id: vehicleId,
    type: 'vehicle' as const,
    title: vehicleLabel,
    subtitle: 'Fleet readiness snapshot',
    sourceTruth: input.sourceTruth[0],
    sourceTruthPolicyKey: input.sourceTruth[0]?.policyKey ?? 'vehicle_profile',
    observedAt: input.sourceTruth[0]?.observedAt ?? input.createdAt,
    metadata: { source: 'vehicleStore', vehicleId },
  };
  return adaptSourceProposal({ ...input, linkedContext }, {
    domain: 'fleet',
    sourceEntityType: 'active_vehicle_snapshot',
    label: 'Fleet',
    requireLinkedContext: true,
    facts: [
      { key: 'vehicle', label: 'Active vehicle', value: vehicleLabel },
      { key: 'readiness', label: 'Readiness', value: input.snapshot.readiness },
      { key: 'payload', label: 'Payload state', value: input.snapshot.payload },
      { key: 'recovery', label: 'Recovery equipment', value: input.snapshot.recoveryEquipment },
      { key: 'confidence', label: 'Fleet confidence', value: humanize(input.snapshot.confidence) },
    ],
  });
}

export function createNavigateMissionCommandProposal(
  input: NavigateMissionCommandProposalInput,
): MissionCommandProposalBuildResult {
  return adaptSourceProposal(input, {
    domain: 'navigate',
    sourceEntityType: 'navigate_route_operation',
    label: 'Navigate',
    requireLinkedContext: true,
    facts: [{ key: 'operation', label: 'Route operation', value: humanize(input.operation) }],
  });
}

export function createExploreMissionCommandProposal(
  input: ExploreMissionCommandProposalInput,
): MissionCommandProposalBuildResult {
  const domain = input.sourceSurface ?? 'trip_builder';
  return adaptSourceProposal(input, {
    domain,
    sourceEntityType: domain === 'explore' ? 'explore_route_plan' : 'trip_builder_plan',
    label: domain === 'explore' ? 'Explore' : 'Trip Builder',
    requireLinkedContext: input.planningAction === 'rally_point' || input.planningAction === 'route_review',
    facts: [{ key: 'planning_action', label: 'Planning action', value: humanize(input.planningAction) }],
  });
}

export function createCampOpsMissionCommandProposal(
  input: CampOpsMissionCommandProposalInput,
): MissionCommandProposalBuildResult {
  if (input.authority !== 'campops') {
    return invalid('mission_command_proposal_campops_authority_invalid', 'Camp decisions must originate from deterministic CampOps output.');
  }
  return adaptSourceProposal(input, {
    domain: 'campops',
    sourceEntityType: 'campops_decision',
    label: 'CampOps',
    requireLinkedContext: true,
    facts: [
      { key: 'decision', label: 'CampOps decision', value: humanize(input.decision) },
      { key: 'authority', label: 'Decision authority', value: 'CampOps deterministic engine' },
    ],
  });
}

export function createWeatherMissionCommandProposal(
  input: WeatherMissionCommandProposalInput,
): MissionCommandProposalBuildResult {
  if (!input.material) {
    return invalid('mission_command_proposal_weather_not_material', 'Only a material validated weather hazard can propose Mission Command coordination.');
  }
  return adaptSourceProposal(input, {
    domain: 'weather',
    sourceEntityType: 'material_weather_hazard',
    label: 'Operational Weather',
    facts: [{ key: 'hazard', label: 'Weather hazard', value: humanize(input.hazardKind) }],
  });
}

export function createIncidentRecoveryMissionCommandProposal(
  input: IncidentRecoveryMissionCommandProposalInput,
): MissionCommandProposalBuildResult {
  if (!input.explicitEscalation) {
    return invalid('mission_command_proposal_incident_confirmation_required', 'Incident Room escalation requires explicit operator action.');
  }
  return adaptSourceProposal({ ...input, incidentId: input.incidentId }, {
    domain: 'incident_recovery',
    sourceEntityType: 'incident_recovery_record',
    label: 'Incident & Recovery',
    requireLinkedContext: true,
    facts: [{ key: 'incident', label: 'Incident reference', value: input.incidentId }],
  });
}

function adaptSourceProposal(
  input: MissionCommandSourceAdapterBase,
  options: {
    domain: MissionCommandProposalOriginDomain;
    sourceEntityType: string;
    label: string;
    requireLinkedContext?: boolean;
    facts?: MissionCommandProposalFact[];
  },
): MissionCommandProposalBuildResult {
  if (!input.operatorRequested) {
    return invalid(
      'mission_command_proposal_explicit_action_required',
      'Viewing source-domain information does not create or stage a Mission Command proposal.',
    );
  }
  return buildMissionCommandProposal({
    origin: {
      domain: options.domain,
      sourceEntityType: options.sourceEntityType,
      sourceEntityId: input.sourceEntityId,
      label: options.label,
    },
    expeditionId: input.expeditionId,
    intent: input.action,
    title: input.title,
    summary: input.summary,
    command: input.command,
    playbookId: input.playbookId,
    incidentId: input.incidentId,
    linkedContext: input.linkedContext,
    requireLinkedContext: options.requireLinkedContext,
    facts: [...(options.facts ?? []), ...(input.facts ?? [])],
    sourceTruth: input.sourceTruth,
    returnRoute: input.returnRoute,
    offline: input.offline,
    createdAt: input.createdAt,
    now: input.now,
  });
}

function humanize(value: string): string {
  return cleanText(value.replace(/_/g, ' ')) ?? 'Unavailable';
}

function cleanToken(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= 180 ? trimmed : null;
}

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed ? trimmed.slice(0, 240) : null;
}

function invalid(safeCode: string, reason: string): MissionCommandProposalBuildResult {
  return { ok: false, safeCode, reason };
}
