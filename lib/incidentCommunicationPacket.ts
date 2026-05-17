import type {
  IncidentCommunicationPacket,
  IncidentContext,
  IncidentRecoveryContextSnapshot,
  IncidentSeverity,
} from './types/incidentRecovery';

export type IncidentCommunicationPacketAudience =
  | 'emergency_services'
  | 'recovery_provider'
  | 'convoy_members'
  | 'trusted_contact';

type PacketMetadataSafety = {
  anyoneInjured?: boolean | null;
  anyoneMissing?: boolean | null;
  anyoneTrapped?: boolean | null;
  activeHazard?: boolean | null;
  vehicleStable?: boolean | null;
  groupSafe?: boolean | null;
};

type PacketMetadataResources = {
  vehicleDisabled?: boolean | null;
  terrain?: string;
  weather?: string;
  daylight?: string;
  fuelConcern?: boolean | null;
  waterConcern?: boolean | null;
  foodConcern?: boolean | null;
  shelterConcern?: boolean | null;
  warmthConcern?: boolean | null;
  medicalKitAvailable?: boolean | null;
};

const AUDIENCE_LABELS: Record<IncidentCommunicationPacketAudience, string> = {
  emergency_services: 'Emergency services',
  recovery_provider: 'Professional recovery provider',
  convoy_members: 'Convoy members',
  trusted_contact: 'Trusted contact',
};

function cleanText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function display(value: unknown): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return 'unknown';
}

function yesNoUnknown(value: boolean | null | undefined, yes = 'yes', no = 'no reported'): string {
  if (value == null) return 'unknown';
  return value ? yes : no;
}

function getSafety(incident: IncidentContext): PacketMetadataSafety {
  const metadata = incident.metadata as Record<string, unknown> | undefined;
  return (metadata?.safety ?? {}) as PacketMetadataSafety;
}

function getResources(incident: IncidentContext): PacketMetadataResources {
  const metadata = incident.metadata as Record<string, unknown> | undefined;
  return (metadata?.resources ?? {}) as PacketMetadataResources;
}

function getExternalContext(incident: IncidentContext): IncidentRecoveryContextSnapshot | null {
  const metadata = incident.metadata as Record<string, unknown> | undefined;
  return (metadata?.incidentRecoveryContext ?? null) as IncidentRecoveryContextSnapshot | null;
}

function getCoordinates(incident: IncidentContext): string {
  if (!incident.location) return 'unknown';
  return `${incident.location.latitude.toFixed(5)}, ${incident.location.longitude.toFixed(5)}`;
}

function getLocationLabel(incident: IncidentContext): string {
  return display(incident.locationLabel ?? incident.routeLabel);
}

function getHazards(incident: IncidentContext, safety: PacketMetadataSafety, resources: PacketMetadataResources): string {
  const hazards = [
    ...(incident.recoveryAssessment?.immediateHazards ?? []),
    safety.activeHazard === true ? 'active hazard reported' : '',
    cleanText(resources.terrain) ? `terrain: ${resources.terrain}` : '',
    cleanText(resources.weather) ? `weather: ${resources.weather}` : '',
    cleanText(resources.daylight) ? `daylight: ${resources.daylight}` : '',
  ].filter(Boolean);
  if (hazards.length > 0) return hazards.join('; ');
  if (safety.activeHazard === false) return 'no active hazard reported';
  return 'unknown';
}

function getSupplies(resources: PacketMetadataResources): string {
  return [
    `fuel: ${yesNoUnknown(resources.fuelConcern, 'concern', 'no concern reported')}`,
    `water: ${yesNoUnknown(resources.waterConcern, 'concern', 'no concern reported')}`,
    `food: ${yesNoUnknown(resources.foodConcern, 'concern', 'no concern reported')}`,
    `shelter: ${yesNoUnknown(resources.shelterConcern, 'concern', 'no concern reported')}`,
    `warmth: ${yesNoUnknown(resources.warmthConcern, 'concern', 'no concern reported')}`,
    `medical kit: ${yesNoUnknown(resources.medicalKitAvailable, 'available', 'not available/reported')}`,
  ].join('; ');
}

function isSevere(incident: IncidentContext): boolean {
  const risk = incident.recoveryAssessment?.riskLevel ?? incident.severity;
  return (
    risk === 'critical' ||
    risk === 'high' ||
    incident.injuryStatus === 'possible' ||
    incident.injuryStatus === 'confirmed' ||
    incident.injuryStatus === 'critical'
  );
}

function requestedHelpFor(audience: IncidentCommunicationPacketAudience, severe: boolean): string {
  switch (audience) {
    case 'emergency_services':
      return severe
        ? 'Emergency assistance requested if reachable.'
        : 'Situation report; advise if emergency response is needed.';
    case 'recovery_provider':
      return 'Assess professional recovery availability after safety stabilization is confirmed.';
    case 'convoy_members':
      return 'Share status, confirm location, and coordinate check-ins without attempting unsafe recovery.';
    case 'trusted_contact':
      return 'Monitor status and be ready to relay information or escalate if updates stop.';
    default:
      return 'Assistance requested.';
  }
}

function buildAudiencePacket(
  incident: IncidentContext,
  audience: IncidentCommunicationPacketAudience,
  generatedAt: string,
): { audience: IncidentCommunicationPacketAudience; label: string; text: string } {
  const safety = getSafety(incident);
  const resources = getResources(incident);
  const context = getExternalContext(incident);
  const severe = isSevere(incident);
  const lines = [
    `ECS Incident Packet - ${AUDIENCE_LABELS[audience]}`,
    severe ? 'Recommendation: contact emergency services or activate SOS where possible if life safety is at risk.' : null,
    'This packet does not replace contacting emergency services, recovery professionals, or local authorities.',
    `Incident status: ${display(incident.status)}`,
    `Severity: ${display(incident.recoveryAssessment?.riskLevel ?? incident.severity)}`,
    `Location/route: ${getLocationLabel(incident)}`,
    context?.route?.routeSegmentLabel ? `Route segment: ${context.route.routeSegmentLabel}` : null,
    `GPS coordinates: ${getCoordinates(incident)}`,
    `Number of people: ${context?.convoy?.memberCount || 'unknown'}`,
    `Injury status: ${display(incident.injuryStatus)}`,
    `Missing/trapped status: missing ${yesNoUnknown(safety.anyoneMissing)}; trapped ${yesNoUnknown(safety.anyoneTrapped)}`,
    `Vehicle status: disabled ${yesNoUnknown(resources.vehicleDisabled)}; stable ${yesNoUnknown(safety.vehicleStable)}${context?.vehicle?.label ? `; vehicle ${context.vehicle.label}` : ''}`,
    `Environmental hazards: ${getHazards(incident, safety, resources)}`,
    `Communication status: ${display(incident.communicationStatus)}${context?.connectivity?.summaryLabel ? `; link ${context.connectivity.summaryLabel}` : ''}`,
    `Supplies/shelter/medical kit: ${getSupplies(resources)}${context?.summary?.logisticsSummary ? `; ${context.summary.logisticsSummary}` : ''}`,
    context?.vehicle?.recoveryEquipment?.length ? `Recovery equipment indexed: ${context.vehicle.recoveryEquipment.join(', ')}` : null,
    `Requested help: ${requestedHelpFor(audience, severe)}`,
    `Last updated: ${display(incident.updatedAt ?? incident.reportedAt ?? generatedAt)}`,
  ].filter(Boolean);
  return {
    audience,
    label: AUDIENCE_LABELS[audience],
    text: lines.join('\n'),
  };
}

export function buildIncidentCommunicationPacket(
  incident: IncidentContext,
  generatedAt: string = new Date().toISOString(),
): IncidentCommunicationPacket {
  const audiencePackets = (Object.keys(AUDIENCE_LABELS) as IncidentCommunicationPacketAudience[])
    .map((audience) => buildAudiencePacket(incident, audience, generatedAt));
  const severe = isSevere(incident);
  return {
    id: `${incident.id}-communication-packet`,
    incidentId: incident.id,
    status: 'complete',
    summary: severe
      ? 'Severe or uncertain incident packet generated. Contact emergency services or activate SOS where possible if life safety is at risk.'
      : 'Incident communication packet generated.',
    packetText: audiencePackets.map((packet) => packet.text).join('\n\n---\n\n'),
    audiencePackets,
    locationLabel: getLocationLabel(incident),
    routeLabel: incident.routeLabel,
    severity: incident.recoveryAssessment?.riskLevel ?? incident.severity,
    incidentStatus: incident.status,
    recommendedAction: severe
      ? 'Contact emergency services or activate SOS where possible if life safety is at risk.'
      : 'Send or copy the appropriate packet to the right contact.',
    recipients: audiencePackets.map((packet) => packet.label),
    channels: ['clipboard'],
    lastSentAt: null,
    missingCriticalData: incident.missingCriticalData ?? [],
  };
}
