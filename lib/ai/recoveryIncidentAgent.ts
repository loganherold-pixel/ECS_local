import type {
  IncidentContext,
  IncidentCriticalDataKey,
  IncidentSeverity,
  RecoveryIncidentAgentOutput,
} from '../types/incidentRecovery';

export type RecoveryIncidentAgentContext = {
  incident: IncidentContext;
  expeditionId?: string;
  routeLabel?: string;
  currentLocationLabel?: string;
  convoySummary?: string;
  vehicleSummary?: string;
  logisticsSummary?: string;
  weatherDaylightSummary?: string;
  now?: string;
};

export const RECOVERY_INCIDENT_AGENT_ID = 'recovery_incident_agent';

export const RECOVERY_INCIDENT_AGENT_PROMPT = [
  'You are the ECS Recovery & Incident Agent.',
  'Role: provide expedition-specific incident intelligence inside ECS Incident & Recovery; do not behave like a generic chatbot.',
  'Your job: provide calm, conservative, structured decision support for off-road incidents.',
  'Lifecycle alignment: Recover -> Debrief -> Learn.',
  'Use only the provided IncidentContext and available ECS route, convoy, vehicle, logistics, weather, and timeline context.',
  'You may help the user assess the situation, identify immediate hazards, decide whether to stop, stabilize, communicate, or escalate, prepare information for emergency services or recovery assistance, and think through general recovery considerations.',
  'Prioritize human safety, location, communication, and hazard stabilization before recovery planning.',
  'Identify missing critical data, stale data, assumptions, confidence limits, evidence, and escalation triggers.',
  'Do not claim a recovery action, route, location, person, or condition is guaranteed safe.',
  'Avoid overconfident recovery guidance when vehicle position, terrain, equipment, weather, communication, location, or injuries are unknown.',
  'Refuse unsafe tactical detail for floodwater, fire, unstable terrain, serious injury, trapped people, dangerous rigging, or hazardous recovery attempts.',
  'Recommend verification or escalation when injury status, location, communication, hazards, legal access, weather, or emergency status is uncertain.',
  'Prioritize environmental stewardship and avoid recommendations that increase unnecessary trail damage or hazard exposure.',
  'You must not guarantee safety, encourage risky recovery attempts, replace emergency services, provide overconfident instructions when vehicle position, terrain, equipment, weather, or injuries are unknown, or minimize injury, fire, flood, rollover, hypothermia, heat illness, or exposure risk.',
  'Escalate when anyone is injured, vehicle is unstable, fire, flood, lightning, severe weather, or exposure is present, recovery requires specialized equipment, the user is stranded without communication or supplies, or the user is unsure and conditions are worsening.',
  'Keep recommendations concise, actionable, and compatible with existing ECS incident workflow buttons.',
  'Do not replace emergency services, medical professionals, recovery operators, or local authorities.',
  'Output must include immediate safety assessment, critical questions / missing data, risk level, recommended next actions, what to verify before attempting recovery, and when to call emergency services or professional recovery.',
  'Return structured output only with summary, recommendations, risks, confidence, evidence, missingData, assumptions, nextActions, escalationTriggers, communicationPacket, doNotDo, verificationSteps, and debriefHooks.',
].join('\n');

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function includesAny(value: string, needles: string[]): boolean {
  const normalized = value.toLowerCase();
  return needles.some((needle) => normalized.includes(needle));
}

function pushMissing(missing: IncidentCriticalDataKey[], key: IncidentCriticalDataKey, condition: boolean): void {
  if (condition) missing.push(key);
}

function getIncidentText(incident: IncidentContext): string {
  return [
    incident.type,
    incident.title,
    incident.summary,
    incident.recoveryAssessment?.notes,
    ...(incident.recoveryAssessment?.immediateHazards ?? []),
    ...((incident.timeline ?? []).map((event) => `${event.title} ${event.detail ?? ''}`)),
  ].filter(Boolean).join(' ');
}

function deriveMissingData(context: RecoveryIncidentAgentContext): IncidentCriticalDataKey[] {
  const { incident } = context;
  const missing = [...(incident.missingCriticalData ?? [])];
  pushMissing(missing, 'location', !incident.location && !incident.locationLabel && !context.currentLocationLabel);
  pushMissing(missing, 'communication', !incident.communicationStatus || incident.communicationStatus === 'unknown');
  pushMissing(missing, 'injury_status', !incident.injuryStatus || incident.injuryStatus === 'unknown');
  pushMissing(missing, 'hazard', !(incident.recoveryAssessment?.immediateHazards?.length));
  if (!incident.stabilizationChecklist || incident.stabilizationChecklist.status !== 'complete') {
    pushMissing(missing, 'party_status', true);
  }
  return unique(missing);
}

function deriveRiskLevel(
  context: RecoveryIncidentAgentContext,
  missingData: IncidentCriticalDataKey[],
): IncidentSeverity {
  const { incident } = context;
  const text = getIncidentText(incident);
  const existing = incident.severity;
  const severeTrigger = (
    incident.injuryStatus === 'critical' ||
    includesAny(text, ['trapped', 'serious injury', 'flood', 'floodwater', 'fire', 'unstable terrain', 'washed out']) ||
    incident.type === 'medical' ||
    incident.type === 'separated_party'
  );
  if (severeTrigger) return 'critical';
  if (
    incident.injuryStatus === 'possible' ||
    missingData.includes('injury_status') ||
    incident.communicationStatus === 'offline' ||
    incident.communicationStatus === 'unknown' ||
    includesAny(text, ['overdue', 'not responding', 'severe weather', 'drive through'])
  ) {
    return existing === 'critical' ? existing : 'high';
  }
  if (missingData.length > 0 || existing === 'moderate' || existing === 'high') {
    return existing === 'high' || existing === 'critical' ? existing : 'moderate';
  }
  return existing === 'unknown' ? 'low' : existing;
}

function deriveConfidence(incident: IncidentContext, missingData: IncidentCriticalDataKey[]): RecoveryIncidentAgentOutput['confidence'] {
  if (incident.injuryStatus === 'unknown' || missingData.includes('injury_status')) return 'low';
  if (missingData.includes('location') || missingData.includes('communication')) return 'low';
  if (missingData.length > 2) return 'low';
  if (missingData.length > 0) return 'medium';
  return 'medium';
}

function buildEscalationTriggers(context: RecoveryIncidentAgentContext, missingData: IncidentCriticalDataKey[]): string[] {
  const text = getIncidentText(context.incident);
  const triggers: string[] = [];
  if (context.incident.injuryStatus === 'possible' || context.incident.injuryStatus === 'confirmed' || context.incident.injuryStatus === 'critical') {
    triggers.push('Possible injury or unresolved medical status');
  }
  if (missingData.includes('injury_status')) triggers.push('Injury status unknown');
  if (missingData.includes('location')) triggers.push('Location not confirmed');
  if (missingData.includes('communication')) triggers.push('Communication status unknown or unavailable');
  if (includesAny(text, ['trapped'])) triggers.push('Trapped person reported');
  if (includesAny(text, ['flood', 'floodwater'])) triggers.push('Floodwater or water crossing risk');
  if (includesAny(text, ['fire'])) triggers.push('Fire risk');
  if (includesAny(text, ['unstable terrain', 'wash', 'slide'])) triggers.push('Unstable terrain');
  if (includesAny(text, ['overdue', 'not responding'])) triggers.push('Overdue or unresponsive party member');
  if (includesAny(text, ['worsening', 'severe weather', 'daylight fading', 'dusk'])) triggers.push('Worsening conditions or daylight loss');
  return unique(triggers);
}

function buildImmediateSafetyAssessment(
  riskLevel: IncidentSeverity,
  escalationTriggers: string[],
  missingData: IncidentCriticalDataKey[],
): string {
  if (riskLevel === 'critical') {
    return 'Critical or uncertain life-safety risk. Stabilize people, confirm location and communications, and escalate to emergency support where possible.';
  }
  if (riskLevel === 'high') {
    return 'Elevated safety risk. Do not move into recovery planning until people, hazards, location, and communication are confirmed.';
  }
  if (missingData.length > 0 || escalationTriggers.length > 0) {
    return 'Safety picture is incomplete. Resolve missing critical data before tactical recovery decisions.';
  }
  return 'No immediate severe trigger is evident from the current incident record, but continue stabilization checks before recovery planning.';
}

export function runRecoveryIncidentAgent(context: RecoveryIncidentAgentContext): RecoveryIncidentAgentOutput {
  const { incident } = context;
  const missingData = deriveMissingData(context);
  const riskLevel = deriveRiskLevel(context, missingData);
  const confidence = deriveConfidence(incident, missingData);
  const escalationTriggers = buildEscalationTriggers(context, missingData);
  const locationLabel = incident.locationLabel ?? context.currentLocationLabel ?? context.routeLabel ?? 'location unknown';
  const communicationKnown = incident.communicationStatus && incident.communicationStatus !== 'unknown';
  const stabilized = incident.stabilizationChecklist?.status === 'complete';
  const recommendations = unique([
    missingData.includes('location') ? 'Capture a precise location or landmark before further workflow steps.' : 'Keep the confirmed location attached to the incident record.',
    missingData.includes('communication') ? 'Establish the best available communication path before recovery planning.' : 'Keep the current communication path available for updates.',
    !stabilized ? 'Complete or update the Safety Checklist before recovery planning.' : 'Use the completed Safety Checklist as the baseline for the next workflow step.',
    escalationTriggers.length > 0 ? 'Escalate to emergency services, dispatch, recovery operators, or trusted contacts where possible.' : 'Prepare a communication packet if outside help may be needed.',
  ]);

  const risks = unique([
    ...escalationTriggers,
    missingData.length > 0 ? 'Assessment confidence is limited by missing critical data.' : '',
    incident.type === 'route_blocked' ? 'Route obstruction may introduce secondary traffic, terrain, or exposure risk.' : '',
    incident.type === 'vehicle_breakdown' ? 'Vehicle immobility can become a weather, daylight, or resource risk.' : '',
  ]);

  const nextActions = unique([
    missingData.includes('location') ? 'Confirm incident location.' : '',
    missingData.includes('communication') ? 'Confirm communication plan.' : '',
    !stabilized ? 'Finish Safety Checklist.' : '',
    'Prepare Communication Packet.',
    riskLevel === 'critical' || riskLevel === 'high' ? 'Escalate if emergency support is reachable.' : '',
  ]);

  return {
    summary: `${incident.title || 'Incident'} assessed at ${locationLabel}. Risk is ${riskLevel}; confidence is ${confidence}.`,
    riskLevel,
    confidence,
    recommendations,
    risks,
    missingData,
    assumptions: unique([
      'Assessment is based only on current ECS incident context and available live app context.',
      context.convoySummary ? `Convoy context: ${context.convoySummary}` : 'Convoy context unavailable.',
      context.vehicleSummary ? `Vehicle context: ${context.vehicleSummary}` : 'Vehicle context unavailable.',
      context.logisticsSummary ? `Logistics context: ${context.logisticsSummary}` : 'Logistics context unavailable.',
      context.weatherDaylightSummary ? `Weather/daylight context: ${context.weatherDaylightSummary}` : 'Weather/daylight context unavailable.',
    ]),
    evidence: unique([
      `Incident type: ${incident.type}`,
      `Incident status: ${incident.status}`,
      `Location: ${locationLabel}`,
      `Communication: ${incident.communicationStatus ?? 'unknown'}`,
      `Safety checklist: ${incident.stabilizationChecklist?.status ?? 'not_started'}`,
      `${incident.timeline?.length ?? 0} timeline event(s) available`,
    ]),
    nextActions,
    userFacingExplanation: 'ECS is keeping this assessment focused on stabilization: people, hazards, location, communications, and escalation. Detailed recovery tactics remain out of scope until the safety picture is clear.',
    immediateSafetyAssessment: buildImmediateSafetyAssessment(riskLevel, escalationTriggers, missingData),
    stabilizationChecklist: [
      'Confirm everyone is accounted for.',
      'Confirm injury status.',
      'Identify active hazards.',
      'Capture location.',
      'Confirm communications.',
      'Review weather, daylight, and escalation threshold.',
    ],
    escalationTriggers,
    communicationPacket: {
      summary: `${incident.title || 'Incident'} / ${riskLevel} risk / ${locationLabel}`,
      recipients: ['emergency services if life safety is at risk', 'dispatch or recovery provider', 'convoy or trusted contact'],
      channels: communicationKnown ? ['dispatch', 'radio', 'satellite', 'sms'] : ['satellite', 'radio', 'other'],
      missingData,
    },
    doNotDo: [
      'Do not enter floodwater or unstable terrain.',
      'Do not provide or follow detailed rigging instructions from this assessment.',
      'Do not delay emergency escalation for serious injury, trapped people, fire, floodwater, or worsening conditions.',
      'Do not treat ECS as a replacement for emergency services, medical professionals, recovery operators, or local authorities.',
    ],
    verificationSteps: [
      'Verify location and route segment.',
      'Verify injury and party status.',
      'Verify active hazards and weather/daylight.',
      'Verify communications and who has been notified.',
    ],
    debriefHooks: [
      'What triggered the incident?',
      'What safety checks changed the plan?',
      'Which data was missing or late?',
      'What equipment, route, or communication changes should be made before the next expedition?',
    ],
  };
}
