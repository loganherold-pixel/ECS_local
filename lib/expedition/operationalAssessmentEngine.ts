import type {
  AssessmentCategory,
  AssessmentConfidence,
  AssessmentStatus,
  ExpeditionAssessment,
  ExpeditionAssessmentDataUsed,
  ExpeditionContextSnapshot,
  ExpeditionDataPoint,
  ExpeditionDataSource,
} from './operationalAssessmentTypes';

type DraftAssessment = Omit<
  ExpeditionAssessment,
  'id' | 'confidence' | 'dataUsed' | 'staleDataWarnings' | 'missingDataWarnings' | 'lastUpdated'
> & {
  evidence: ExpeditionAssessmentDataUsed[];
  criticalEvidenceIds?: string[];
};

const STATUS_WEIGHT: Record<AssessmentStatus, number> = {
  normal: 0,
  watch: 1,
  unknown: 2,
  caution: 3,
  critical: 4,
};

const STATUS_TITLES: Record<AssessmentStatus, string> = {
  normal: 'Normal',
  watch: 'Watch',
  caution: 'Caution',
  critical: 'Critical',
  unknown: 'Unknown',
};

function isStale<T>(point: ExpeditionDataPoint<T> | undefined, capturedAt: string): boolean {
  if (!point) return false;
  if (point.isStale) return true;
  if (!point.updatedAt || !point.staleAfterMinutes) return false;

  const updatedAtMs = Date.parse(point.updatedAt);
  const capturedAtMs = Date.parse(capturedAt);
  if (Number.isNaN(updatedAtMs) || Number.isNaN(capturedAtMs)) return false;

  return capturedAtMs - updatedAtMs > point.staleAfterMinutes * 60 * 1000;
}

function stringifyEvidenceValue(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : 'none';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function evidence<T>(
  id: string,
  label: string,
  point: ExpeditionDataPoint<T> | undefined,
  capturedAt: string,
  options: {
    required?: boolean;
    source?: ExpeditionDataSource;
    value?: T | null;
    notes?: string;
  } = {},
): ExpeditionAssessmentDataUsed {
  const value = point ? point.value : options.value ?? null;
  const missing = options.required === true && (value === null || value === undefined || value === '');
  return {
    id,
    label,
    value: stringifyEvidenceValue(value),
    source: point?.source ?? options.source ?? 'unknown',
    updatedAt: point?.updatedAt ?? null,
    confidence: point?.confidence,
    reliability: point?.reliability,
    isStale: isStale(point, capturedAt),
    isMissing: missing,
    notes: point?.notes ?? options.notes ?? null,
  };
}

function warningLabel(item: ExpeditionAssessmentDataUsed): string {
  return item.label;
}

function confidenceFor(
  status: AssessmentStatus,
  evidenceItems: ExpeditionAssessmentDataUsed[],
  criticalEvidenceIds: string[] = [],
): AssessmentConfidence {
  const criticalProblem = evidenceItems.some(
    (item) => criticalEvidenceIds.includes(item.id) && (item.isMissing || item.isStale),
  );
  if (status === 'unknown' || criticalProblem) return 'low';
  if (evidenceItems.some((item) => item.isMissing || item.isStale)) return 'medium';
  return 'high';
}

function finalizeAssessment(draft: DraftAssessment, context: ExpeditionContextSnapshot): ExpeditionAssessment {
  const staleDataWarnings = draft.evidence
    .filter((item) => item.isStale)
    .map((item) => `${warningLabel(item)} is stale.`);
  const missingDataWarnings = draft.evidence
    .filter((item) => item.isMissing)
    .map((item) => `${warningLabel(item)} is missing.`);

  return {
    id: `expedition-assessment-${draft.category}`,
    category: draft.category,
    status: draft.status,
    title: draft.title,
    summary: draft.summary,
    why: draft.why,
    whatToWatch: draft.whatToWatch,
    recommendedAction: draft.recommendedAction,
    toImproveStatus: draft.toImproveStatus,
    confidence: confidenceFor(draft.status, draft.evidence, draft.criticalEvidenceIds),
    dataUsed: draft.evidence,
    staleDataWarnings,
    missingDataWarnings,
    lastUpdated: context.capturedAt,
    escalationRecommended: draft.escalationRecommended,
    escalationReason: draft.escalationReason,
    relatedActions: draft.relatedActions,
  };
}

function worseStatus(current: AssessmentStatus, next: AssessmentStatus): AssessmentStatus {
  return STATUS_WEIGHT[next] > STATUS_WEIGHT[current] ? next : current;
}

function addStatusReason(
  status: AssessmentStatus,
  reason: string,
  current: { status: AssessmentStatus; why: string[] },
): void {
  current.status = worseStatus(current.status, status);
  current.why.push(reason);
}

function minutesLate(etaIso?: string | null, plannedEndIso?: string | null): number | null {
  if (!etaIso || !plannedEndIso) return null;
  const eta = Date.parse(etaIso);
  const plannedEnd = Date.parse(plannedEndIso);
  if (Number.isNaN(eta) || Number.isNaN(plannedEnd)) return null;
  return Math.round((eta - plannedEnd) / 60000);
}

function routeAssessment(context: ExpeditionContextSnapshot): ExpeditionAssessment {
  const route = context.route;
  const evidenceItems = [
    evidence('current-location', 'Current location', route?.currentLocation, context.capturedAt, { required: true }),
    evidence('off-route', 'On route status', route?.offRoute, context.capturedAt, { required: true }),
    evidence('eta', 'Estimated arrival', route?.estimatedArrivalIso, context.capturedAt, { required: true }),
    evidence('planned-window-end', 'Planned route window end', route?.plannedArrivalEndIso, context.capturedAt),
    evidence('daylight-margin', 'Daylight margin at ETA', route?.daylightRemainingAtEtaMinutes, context.capturedAt),
    evidence('known-hazards', 'Known route hazards', route?.knownHazards, context.capturedAt),
    evidence('route-issues', 'User-reported route issues', route?.userReportedRouteIssues, context.capturedAt),
    evidence('difficult-terrain', 'Upcoming difficult terrain', route?.upcomingDifficultTerrain, context.capturedAt),
    evidence('difficult-terrain-label', 'Difficult terrain detail', route?.upcomingDifficultTerrainLabel, context.capturedAt),
    evidence('alternate-route', 'Alternate route available', route?.alternateRouteAvailable, context.capturedAt),
    evidence('alternate-route-label', 'Alternate route option', route?.alternateRouteLabel, context.capturedAt),
    evidence('last-safe-turnaround', 'Last safe turnaround', route?.lastSafeTurnaroundLabel, context.capturedAt),
    evidence('exit-route', 'Exit route', route?.exitRouteLabel, context.capturedAt),
    evidence('deviation-time', 'Deviation time impact', route?.deviationTimeMinutes, context.capturedAt),
    evidence('deviation-fuel', 'Deviation fuel impact', route?.deviationFuelPercent, context.capturedAt),
    evidence('camp-eta', 'Camp ETA', context.camp?.estimatedArrivalIso, context.capturedAt),
  ];
  const result = { status: 'normal' as AssessmentStatus, why: [] as string[] };

  const offRoute = route?.offRoute?.value === true;
  const alternateAvailable = route?.alternateRouteAvailable?.value === true;
  const hazards = route?.knownHazards?.value ?? [];
  const routeIssues = route?.userReportedRouteIssues?.value ?? [];
  const daylightMargin = route?.daylightRemainingAtEtaMinutes?.value;
  const lateMinutes = minutesLate(route?.estimatedArrivalIso?.value, route?.plannedArrivalEndIso?.value);
  const deviationTime = route?.deviationTimeMinutes?.value ?? 0;
  const deviationFuel = route?.deviationFuelPercent?.value ?? 0;

  if (evidenceItems.some((item) => ['current-location', 'off-route', 'eta'].includes(item.id) && item.isMissing)) {
    addStatusReason('unknown', 'Route assessment is missing current position, ETA, or on-route state.', result);
  }
  if (offRoute && !alternateAvailable) {
    addStatusReason('critical', 'The expedition is off route and no alternate route is confirmed.', result);
  } else if (offRoute) {
    addStatusReason('caution', 'The expedition is off route.', result);
  }
  if (typeof daylightMargin === 'number') {
    if (daylightMargin < 0) addStatusReason('critical', 'ETA is after usable daylight.', result);
    else if (daylightMargin < 45) addStatusReason('caution', 'Daylight margin at ETA is under 45 minutes.', result);
    else if (daylightMargin < 90) addStatusReason('watch', 'Daylight margin at ETA is narrowing.', result);
  }
  if (typeof lateMinutes === 'number' && lateMinutes > 0) {
    if (lateMinutes > 120) addStatusReason('caution', 'ETA is more than two hours beyond the planned route window.', result);
    else if (lateMinutes > 30) addStatusReason('watch', 'ETA is running beyond the planned route window.', result);
  }
  if (hazards.length > 0) addStatusReason(hazards.length > 1 ? 'caution' : 'watch', 'Known route hazards are present.', result);
  if (routeIssues.length > 0) addStatusReason(routeIssues.length > 1 ? 'caution' : 'watch', 'User-reported route issues are present.', result);
  if (route?.upcomingDifficultTerrain?.value === true) addStatusReason('watch', 'Difficult terrain is upcoming.', result);
  if (deviationTime > 60 || deviationFuel > 15) addStatusReason('watch', 'Deviation impact on time or fuel is meaningful.', result);
  if (result.why.length === 0) result.why.push('Route inputs show the expedition on course with no immediate route concern.');

  return finalizeAssessment(
    {
      category: 'route',
      status: result.status,
      title: `Route ${STATUS_TITLES[result.status]}`,
      summary:
        result.status === 'normal'
          ? 'Route progress is viable and no route issue needs action.'
          : result.why[0],
      why: result.why,
      whatToWatch: ['Route drift, daylight margin, terrain difficulty, and confirmed alternates.'],
      recommendedAction:
        result.status === 'critical'
          ? 'Stop route escalation and confirm safe position, alternate route, and daylight plan.'
          : result.status === 'caution'
            ? 'Review route options soon and confirm time/fuel impact.'
            : result.status === 'watch'
              ? 'Monitor route timing and terrain changes.'
              : result.status === 'unknown'
                ? 'Refresh GPS, ETA, and route state.'
                : 'Continue monitoring route progress.',
      toImproveStatus: ['Refresh current location.', 'Confirm ETA and daylight margin.', 'Identify usable alternates.'],
      evidence: evidenceItems,
      criticalEvidenceIds: ['current-location', 'off-route', 'eta'],
      escalationRecommended: result.status === 'critical',
      escalationReason: result.status === 'critical' ? result.why[0] : null,
      relatedActions: [
        { id: 'report-route-issue', label: 'Report route issue', targetCategory: 'route' },
        { id: 'mark-obstacle', label: 'Mark obstacle', targetCategory: 'route' },
        { id: 'update-checkpoint-status', label: 'Update checkpoint status', targetCategory: 'route' },
        { id: 'evaluate-alternate-route', label: 'Evaluate alternate route', targetCategory: 'route' },
        { id: 'set-regroup-checkpoint', label: 'Set regroup checkpoint', targetCategory: 'route' },
      ],
    },
    context,
  );
}

function convoyAssessment(context: ExpeditionContextSnapshot): ExpeditionAssessment {
  const convoy = context.convoy;
  const members = convoy?.members ?? [];
  const memberCalls = members.map((member) => member.callsign);
  const memberEvidence = members.flatMap((member, index) => {
    const prefix = `member-${member.id || index + 1}`;
    const label = member.callsign || `Member ${index + 1}`;
    return [
      evidence(`${prefix}-callsign`, `${label} callsign`, undefined, context.capturedAt, {
        value: label,
        source: 'unknown',
      }),
      evidence(`${prefix}-role`, `${label} role`, undefined, context.capturedAt, {
        value: member.role ?? 'member',
        source: 'unknown',
      }),
      evidence(`${prefix}-last-check-in`, `${label} last check-in`, member.lastCheckInAt, context.capturedAt),
      evidence(`${prefix}-last-location`, `${label} last known location`, member.lastKnownLocationLabel, context.capturedAt),
      evidence(`${prefix}-movement-status`, `${label} movement status`, member.movementStatus, context.capturedAt),
      evidence(`${prefix}-distance-behind-lead`, `${label} distance behind lead`, member.distanceBehindLeadMiles, context.capturedAt),
      evidence(`${prefix}-missed-checkpoint`, `${label} missed checkpoint`, member.missedCheckpoint, context.capturedAt),
      evidence(`${prefix}-needs-assistance`, `${label} needs assistance`, member.needsAssistance, context.capturedAt),
    ];
  });
  const evidenceItems = [
    evidence('member-list', 'Member/callsign list', undefined, context.capturedAt, {
      value: memberCalls,
      source: members.length > 0 ? 'unknown' : 'unknown',
    }),
    evidence('team-member-count', 'Team member count', convoy?.teamMemberCount, context.capturedAt, { required: true }),
    evidence('active-member-count', 'Active member count', convoy?.activeMemberCount, context.capturedAt),
    evidence('missing-member-count', 'Missing member count', convoy?.missingMemberCount, context.capturedAt),
    evidence('overdue-members', 'Overdue members', convoy?.overdueMemberLabels, context.capturedAt),
    evidence('stopped-members', 'Stopped unexpectedly', convoy?.stoppedUnexpectedlyLabels, context.capturedAt),
    evidence('missed-checkpoint-members', 'Missed checkpoint members', convoy?.missedCheckpointMemberLabels, context.capturedAt),
    evidence('assistance-needed-members', 'Assistance needed members', convoy?.assistanceNeededMemberLabels, context.capturedAt),
    evidence('last-check-in', 'Last check-in', convoy?.lastCheckInAt, context.capturedAt),
    evidence('convoy-spacing', 'Convoy spacing minutes', convoy?.convoySpacingMinutes, context.capturedAt),
    evidence('lead-sweep-separation', 'Lead/sweep separation', convoy?.leadSweepSeparationMiles, context.capturedAt),
    evidence('communications', 'Convoy communications', convoy?.communicationsStatus, context.capturedAt),
    evidence('recommended-regroup-point', 'Recommended regroup/check-in point', convoy?.recommendedRegroupPoint, context.capturedAt),
    ...memberEvidence,
  ];
  const result = { status: 'normal' as AssessmentStatus, why: [] as string[] };
  const teamCount = convoy?.teamMemberCount?.value;
  const activeCount = convoy?.activeMemberCount?.value;
  const missingCount = convoy?.missingMemberCount?.value ?? 0;
  const overdueMembers = convoy?.overdueMemberLabels?.value ?? [];
  const stoppedMembers = convoy?.stoppedUnexpectedlyLabels?.value ?? [];
  const missedCheckpointMembers = convoy?.missedCheckpointMemberLabels?.value ?? [];
  const assistanceNeededLabels = convoy?.assistanceNeededMemberLabels?.value ?? [];
  const spacingMinutes = convoy?.convoySpacingMinutes?.value ?? 0;
  const separationMiles = convoy?.leadSweepSeparationMiles?.value ?? 0;
  const comms = convoy?.communicationsStatus?.value;
  const offlineMembers = members
    .filter((member) => member.movementStatus?.value === 'offline')
    .map((member) => member.callsign);
  const delayedMembers = members
    .filter((member) => member.movementStatus?.value === 'delayed')
    .map((member) => member.callsign);
  const stoppedStatusMembers = members
    .filter((member) => member.movementStatus?.value === 'stopped')
    .map((member) => member.callsign);
  const memberAssistanceNeeded = members
    .filter((member) => member.needsAssistance?.value === true || member.movementStatus?.value === 'needs_assistance')
    .map((member) => member.callsign);
  const memberMissedCheckpoints = members
    .filter((member) => member.missedCheckpoint?.value === true)
    .map((member) => member.callsign);
  const assistanceNeeded = [...new Set([...assistanceNeededLabels, ...memberAssistanceNeeded])];
  const missedCheckpoints = [...new Set([...missedCheckpointMembers, ...memberMissedCheckpoints])];

  if (teamCount === null || teamCount === undefined) {
    addStatusReason('unknown', 'Convoy assessment is missing team member count.', result);
  } else if (teamCount < 2) {
    result.why.push('No multi-member convoy is active.');
  }
  if (typeof teamCount === 'number' && typeof activeCount === 'number' && activeCount < teamCount) {
    addStatusReason(activeCount <= 0 ? 'critical' : 'caution', 'Not all convoy members are currently accounted for as active.', result);
  }
  if (assistanceNeeded.length > 0) addStatusReason('critical', 'A convoy member is marked as needing assistance.', result);
  if (missingCount > 0) addStatusReason('critical', 'One or more convoy members are missing.', result);
  if (overdueMembers.length > 0) addStatusReason(overdueMembers.length > 1 ? 'caution' : 'watch', 'One or more convoy members are overdue for check-in.', result);
  if (missedCheckpoints.length > 0) addStatusReason('caution', 'A convoy member missed a checkpoint.', result);
  if (stoppedMembers.length > 0 || stoppedStatusMembers.length > 0) addStatusReason('caution', 'A convoy member appears stopped unexpectedly.', result);
  if (offlineMembers.length > 0) addStatusReason('caution', 'A convoy member is offline or has stale position awareness.', result);
  if (delayedMembers.length > 0) addStatusReason('watch', 'A convoy member is delayed.', result);
  if (comms === 'offline') addStatusReason('caution', 'Convoy communications are offline.', result);
  else if (comms === 'degraded') addStatusReason('watch', 'Convoy communications are degraded.', result);
  if (spacingMinutes > 45) addStatusReason('caution', 'Convoy spacing is outside preferred range for group movement.', result);
  else if (spacingMinutes > 20) addStatusReason('watch', 'Convoy spacing is widening.', result);
  if (separationMiles > 10) addStatusReason('caution', 'Lead/sweep separation is outside preferred range.', result);
  else if (separationMiles > 5) addStatusReason('watch', 'Lead/sweep separation is widening.', result);
  if (result.why.length === 0) result.why.push('Convoy members are accounted for with acceptable spacing and communications.');

  return finalizeAssessment(
    {
      category: 'convoy',
      status: result.status,
      title: `Convoy ${STATUS_TITLES[result.status]}`,
      summary: result.status === 'normal' ? 'Convoy state is stable.' : result.why[0],
      why: result.why,
      whatToWatch: ['Overdue members, unexpected stops, spacing, and communication quality.'],
      recommendedAction:
        result.status === 'critical'
          ? 'Open Incident & Recovery and start assistance workflow before continuing movement.'
          : result.status === 'caution'
            ? 'Hold at the next safe regroup point and send check-in requests.'
            : result.status === 'watch'
              ? 'Monitor spacing and request check-ins at the next safe stop.'
            : result.status === 'unknown'
              ? 'Confirm team size and latest check-in.'
              : 'Keep normal convoy check-ins active.',
      toImproveStatus: [
        'Refresh member check-ins.',
        'Confirm lead and sweep positions.',
        'Set or confirm a safe regroup point.',
        'Verify communication channel.',
      ],
      evidence: evidenceItems,
      criticalEvidenceIds: ['team-member-count'],
      escalationRecommended: result.status === 'critical',
      escalationReason: result.status === 'critical' ? result.why[0] : null,
      relatedActions: [
        { id: 'send-check-in-request', label: 'Send check-in request', targetCategory: 'convoy' },
        { id: 'mark-member-ok', label: 'Mark member OK', targetCategory: 'convoy' },
        { id: 'mark-member-delayed', label: 'Mark member delayed', targetCategory: 'convoy' },
        { id: 'mark-member-offline', label: 'Mark member offline', targetCategory: 'convoy' },
        { id: 'mark-member-needs-assistance', label: 'Mark member needs assistance', targetCategory: 'convoy' },
        { id: 'set-regroup-point', label: 'Set regroup point', targetCategory: 'convoy' },
        { id: 'start-assistance-workflow', label: 'Start assistance workflow', targetCategory: 'convoy' },
        { id: 'open-incident-recovery', label: 'Open Incident & Recovery', targetCategory: 'convoy' },
        { id: 'generate-communication-packet', label: 'Generate communication packet', targetCategory: 'convoy' },
      ],
    },
    context,
  );
}

function campAssessment(context: ExpeditionContextSnapshot): ExpeditionAssessment {
  const camp = context.camp;
  const evidenceItems = [
    evidence('has-route-camps', 'Route camps available', camp?.hasRouteCamps, context.capturedAt, { required: true }),
    evidence('planned-camp-status', 'Planned camp status', camp?.plannedCampStatus, context.capturedAt),
    evidence('next-camp-name', 'Planned camp', camp?.nextCampName, context.capturedAt),
    evidence('camp-eta', 'Camp ETA', camp?.estimatedArrivalIso, context.capturedAt, { required: true }),
    evidence('distance-to-camp', 'Distance to camp', camp?.distanceToNextCampMiles, context.capturedAt),
    evidence('camp-readiness-status', 'Camp readiness status', camp?.campReadinessStatus, context.capturedAt),
    evidence('camp-safety-status', 'Camp safety status', camp?.campSafetyStatus, context.capturedAt),
    evidence('camp-confirmed', 'Camp confirmed', camp?.campConfirmed, context.capturedAt, { required: true }),
    evidence('arrival-before-dark', 'Arrival before dark', camp?.arrivalBeforeDark, context.capturedAt),
    evidence('daylight-arrival-margin', 'Daylight remaining at camp arrival', camp?.daylightRemainingAtArrivalMinutes, context.capturedAt),
    evidence('sunset', 'Sunset', camp?.sunsetIso, context.capturedAt),
    evidence('weather-exposure', 'Camp weather exposure', camp?.weatherExposure, context.capturedAt, { required: true }),
    evidence('wind', 'Wind speed', camp?.windMph, context.capturedAt),
    evidence('temperature', 'Temperature', camp?.temperatureF, context.capturedAt),
    evidence('precipitation', 'Precipitation chance', camp?.precipitationChancePercent, context.capturedAt),
    evidence('route-difficulty-remaining', 'Route difficulty remaining before camp', camp?.routeDifficultyRemaining, context.capturedAt),
    evidence('convoy-arrival-confidence', 'Convoy arrival confidence', camp?.convoyArrivalConfidence, context.capturedAt),
    evidence('alternate-camp', 'Alternate camp available', camp?.alternateCampAvailable, context.capturedAt),
    evidence('alternate-camp-label', 'Alternate camp option', camp?.alternateCampLabel, context.capturedAt),
    evidence('alternate-camp-improves-daylight', 'Alternate camp improves daylight margin', camp?.alternateCampImprovesDaylightMargin, context.capturedAt),
    evidence('alternate-camp-fuel-risk', 'Alternate camp fuel risk', camp?.alternateCampFuelRisk, context.capturedAt),
    evidence('safe-setup-before-dark', 'Safe setup before dark', camp?.safeSetupBeforeDark, context.capturedAt),
    evidence('overnight-fuel-ready', 'Fuel readiness for overnight', camp?.overnightFuelReady, context.capturedAt),
    evidence('overnight-water-ready', 'Water readiness for overnight', camp?.overnightWaterReady, context.capturedAt),
    evidence('overnight-power-ready', 'Power readiness for overnight', camp?.overnightPowerReady, context.capturedAt),
    evidence('camp-hazards', 'Known camp hazards', camp?.knownCampHazards, context.capturedAt),
  ];
  const result = { status: 'normal' as AssessmentStatus, why: [] as string[] };
  const daylight = camp?.daylightRemainingAtArrivalMinutes?.value;
  const hazards = camp?.knownCampHazards?.value ?? [];
  const alternateImprovesDaylight = camp?.alternateCampImprovesDaylightMargin?.value === true;
  const wind = camp?.windMph?.value;
  const temperature = camp?.temperatureF?.value;
  const precipitation = camp?.precipitationChancePercent?.value;
  const routeDifficulty = camp?.routeDifficultyRemaining?.value;
  const convoyArrivalConfidence = camp?.convoyArrivalConfidence?.value;

  if (evidenceItems.some((item) => ['has-route-camps', 'camp-eta'].includes(item.id) && item.isMissing)) {
    addStatusReason('unknown', 'Camp assessment is missing camp availability or ETA.', result);
  }
  if (camp?.hasRouteCamps?.value === false) addStatusReason('caution', 'No route camp is confirmed.', result);
  if (camp?.campSafetyStatus?.value === 'unsafe' || camp?.plannedCampStatus?.value === 'unsafe') {
    addStatusReason('critical', 'Planned camp is marked unsafe.', result);
  }
  if (camp?.campReadinessStatus?.value && camp.campReadinessStatus.value !== 'normal') {
    addStatusReason(camp.campReadinessStatus.value, `Camp readiness source reported ${camp.campReadinessStatus.value}.`, result);
  }
  if (camp?.arrivalBeforeDark?.value === false) {
    addStatusReason('caution', 'Camp ETA is after sunset or usable daylight.', result);
  }
  if (camp?.safeSetupBeforeDark?.value === false) {
    addStatusReason('critical', 'Camp cannot be safely established before dark with current data.', result);
  }
  if (typeof daylight === 'number') {
    if (daylight < 0) addStatusReason('caution', 'Camp ETA is after usable daylight.', result);
    else if (daylight < 45) {
      addStatusReason(
        alternateImprovesDaylight ? 'watch' : 'caution',
        alternateImprovesDaylight
          ? 'Camp arrival daylight margin is tight, but an alternate camp improves the margin.'
          : 'Camp arrival has less than 45 minutes of daylight margin.',
        result,
      );
    }
    else if (daylight < 90) addStatusReason('watch', 'Camp arrival daylight margin is narrowing.', result);
  }
  if (camp?.weatherExposure?.value === 'high') addStatusReason('caution', 'Camp has high weather exposure.', result);
  else if (camp?.weatherExposure?.value === 'moderate') addStatusReason('watch', 'Camp has moderate weather exposure.', result);
  if (typeof wind === 'number') {
    if (wind >= 45) addStatusReason('critical', 'Camp wind risk is severe for setup or overnight operations.', result);
    else if (wind >= 30) addStatusReason('caution', 'Camp wind risk may make setup or overnight operations harder.', result);
    else if (wind >= 20) addStatusReason('watch', 'Camp wind deserves monitoring.', result);
  }
  if (typeof temperature === 'number' && (temperature <= 25 || temperature >= 100)) {
    addStatusReason('caution', 'Camp temperature risk is outside comfortable overnight operating range.', result);
  } else if (typeof temperature === 'number' && (temperature <= 35 || temperature >= 90)) {
    addStatusReason('watch', 'Camp temperature deserves monitoring.', result);
  }
  if (typeof precipitation === 'number') {
    if (precipitation >= 70) addStatusReason('caution', 'Precipitation risk may affect camp setup and overnight comfort.', result);
    else if (precipitation >= 40) addStatusReason('watch', 'Precipitation risk deserves monitoring.', result);
  }
  if (routeDifficulty === 'technical') addStatusReason('caution', 'Technical terrain remains before camp.', result);
  else if (routeDifficulty === 'hard') addStatusReason('watch', 'Hard terrain remains before camp.', result);
  if (convoyArrivalConfidence === 'low') addStatusReason('caution', 'Convoy arrival confidence is low.', result);
  else if (convoyArrivalConfidence === 'medium') addStatusReason('watch', 'Convoy arrival confidence is not high.', result);
  if (camp?.campConfirmed?.value === false && camp?.alternateCampAvailable?.value !== true) {
    addStatusReason('caution', 'Camp is unconfirmed and no alternate is confirmed.', result);
  } else if (camp?.campConfirmed?.value === false) {
    addStatusReason('watch', 'Camp is not yet confirmed.', result);
  }
  if (camp?.alternateCampFuelRisk?.value === 'high') addStatusReason('watch', 'Alternate camp carries fuel risk.', result);
  if (
    camp?.overnightFuelReady?.value === false ||
    camp?.overnightWaterReady?.value === false ||
    camp?.overnightPowerReady?.value === false
  ) {
    addStatusReason('caution', 'Fuel, water, or power readiness for overnight is incomplete.', result);
  }
  if (hazards.length > 0) addStatusReason('watch', 'Known camp hazards are present.', result);
  if (result.why.length === 0) result.why.push('Camp timing, confirmation, weather, convoy arrival, and overnight readiness are acceptable.');

  return finalizeAssessment(
    {
      category: 'camp',
      status: result.status,
      title: `Camp ${STATUS_TITLES[result.status]}`,
      summary: result.status === 'normal' ? 'Camp plan is operationally sound for tonight.' : result.why[0],
      why: result.why,
      whatToWatch: [
        'Arrival daylight, weather, remaining route difficulty, convoy arrival, camp confirmation, and overnight readiness.',
      ],
      recommendedAction:
        result.status === 'critical'
          ? 'Open Incident & Recovery or select a safer camp option before committing to camp.'
          : result.status === 'caution'
            ? 'Evaluate alternate camp and confirm overnight fuel, water, power, and setup margin.'
            : result.status === 'watch'
              ? 'Monitor camp ETA, daylight margin, weather, and convoy arrival confidence.'
            : result.status === 'unknown'
              ? 'Confirm camp ETA, camp status, and weather before relying on this camp plan.'
              : 'Keep monitoring arrival timing.',
      toImproveStatus: [
        'Confirm camp safe.',
        'Evaluate alternate camp.',
        'Refresh ETA, sunset, and daylight margin.',
        'Confirm overnight fuel, water, and power readiness.',
      ],
      evidence: evidenceItems,
      criticalEvidenceIds: ['has-route-camps', 'camp-eta', 'camp-confirmed'],
      escalationRecommended: result.status === 'critical',
      escalationReason: result.status === 'critical' ? result.why[0] : null,
      relatedActions: [
        { id: 'confirm-camp-safe', label: 'Confirm camp safe', targetCategory: 'camp' },
        { id: 'select-alternate-camp', label: 'Select alternate camp', targetCategory: 'camp' },
        { id: 'evaluate-alternate-camp', label: 'Evaluate alternate camp', targetCategory: 'camp' },
        { id: 'mark-camp-unsafe', label: 'Mark camp unsafe', targetCategory: 'camp' },
        { id: 'start-camp-setup-checklist', label: 'Start camp setup checklist', targetCategory: 'camp' },
        { id: 'notify-convoy', label: 'Notify convoy', targetCategory: 'camp' },
        { id: 'open-incident-recovery', label: 'Open Incident & Recovery', targetCategory: 'camp' },
      ],
    },
    context,
  );
}

function logisticsAssessment(context: ExpeditionContextSnapshot): ExpeditionAssessment {
  const logistics = context.logistics;
  const vehicles = context.vehicles ?? [];
  const vehicleFuelRows = vehicles.map((vehicle, index) => {
    const label = vehicle.label?.value ?? `Vehicle ${index + 1}`;
    const fuel = vehicle.fuelLevelPercent?.value;
    const range = vehicle.rangeRemainingMiles?.value;
    return `${label}: ${fuel ?? 'unknown'}% / ${range ?? 'unknown'} mi`;
  });
  const vehiclesWithRange = vehicles
    .map((vehicle, index) => ({
      label: vehicle.label?.value ?? `Vehicle ${index + 1}`,
      range: vehicle.rangeRemainingMiles?.value,
      fuel: vehicle.fuelLevelPercent?.value,
    }))
    .filter((vehicle): vehicle is { label: string; range: number; fuel: number | null | undefined } =>
      typeof vehicle.range === 'number',
    );
  const lowestRangeVehicle = vehiclesWithRange.reduce<typeof vehiclesWithRange[number] | null>(
    (lowest, vehicle) => (!lowest || vehicle.range < lowest.range ? vehicle : lowest),
    null,
  );
  const groupSize = Math.max(logistics?.groupSize?.value ?? 1, 1);
  const water = logistics?.waterRemainingLiters?.value;
  const waterPerPerson = typeof water === 'number' ? water / groupSize : null;
  const computedWaterEnduranceDays = typeof waterPerPerson === 'number' ? waterPerPerson / 3.8 : null;
  const evidenceItems = [
    evidence('fuel-range', 'Fuel range miles', logistics?.fuelRangeMiles, context.capturedAt, { required: true }),
    evidence('distance-remaining', 'Distance remaining miles', logistics?.distanceRemainingMiles, context.capturedAt),
    evidence('fuel-status-by-vehicle', 'Fuel status by vehicle', undefined, context.capturedAt, {
      value: vehicleFuelRows,
      source: vehicles.length > 0 ? 'vehicleObd' : 'unknown',
    }),
    evidence('lowest-fuel-range-vehicle', 'Lowest fuel/range vehicle', undefined, context.capturedAt, {
      value: lowestRangeVehicle
        ? `${lowestRangeVehicle.label}: ${lowestRangeVehicle.fuel ?? 'unknown'}% / ${lowestRangeVehicle.range} mi`
        : null,
      source: lowestRangeVehicle ? 'vehicleObd' : 'unknown',
    }),
    evidence('next-checkpoint-label', 'Next checkpoint', logistics?.nextCheckpointLabel, context.capturedAt),
    evidence('distance-to-next-checkpoint', 'Distance to next checkpoint', logistics?.distanceToNextCheckpointMiles, context.capturedAt),
    evidence('fuel-reserve-next-checkpoint', 'Fuel reserve to next checkpoint', logistics?.fuelReserveToNextCheckpointMiles, context.capturedAt),
    evidence('fuel-reserve-camp', 'Fuel reserve to camp', logistics?.fuelReserveToCampMiles, context.capturedAt),
    evidence('fuel-reserve-resupply', 'Fuel reserve to resupply', logistics?.fuelReserveToResupplyMiles, context.capturedAt),
    evidence('water-remaining', 'Water remaining liters', logistics?.waterRemainingLiters, context.capturedAt, { required: true }),
    evidence('water-per-person', 'Water per person', undefined, context.capturedAt, {
      value: waterPerPerson === null ? null : Number(waterPerPerson.toFixed(1)),
      source: waterPerPerson === null ? 'unknown' : logistics?.waterRemainingLiters?.source ?? 'unknown',
    }),
    evidence('water-endurance-days', 'Water endurance', logistics?.waterEnduranceDays, context.capturedAt, {
      value: logistics?.waterEnduranceDays?.value ?? (computedWaterEnduranceDays === null ? null : Number(computedWaterEnduranceDays.toFixed(1))),
      source: logistics?.waterEnduranceDays?.source ?? (computedWaterEnduranceDays === null ? 'unknown' : logistics?.waterRemainingLiters?.source ?? 'unknown'),
    }),
    evidence('food-days', 'Food days remaining', logistics?.foodDaysRemaining, context.capturedAt, { required: true }),
    evidence('group-size', 'Group size', logistics?.groupSize, context.capturedAt),
    evidence('power-hours', 'Power hours remaining', logistics?.powerHoursRemaining, context.capturedAt),
    evidence('battery-power-status', 'Battery/power status', logistics?.batteryPowerStatus, context.capturedAt),
    evidence('time-to-resupply', 'Time to resupply hours', logistics?.timeToResupplyHours, context.capturedAt),
    evidence('distance-to-resupply', 'Distance to resupply miles', logistics?.distanceToResupplyMiles, context.capturedAt),
    evidence('shelter-ready', 'Shelter ready', logistics?.shelterReady, context.capturedAt),
    evidence('warmth-ready', 'Warmth ready', logistics?.warmthReady, context.capturedAt),
    evidence('medical-kit-ready', 'Medical kit ready', logistics?.medicalKitReady, context.capturedAt),
    evidence('critical-equipment-ready', 'Critical equipment status', logistics?.criticalEquipmentReady, context.capturedAt),
    evidence('critical-equipment-issues', 'Critical equipment issues', logistics?.criticalEquipmentIssues, context.capturedAt),
    evidence('last-resupply-completed', 'Last resupply completed', logistics?.lastResupplyCompletedAt, context.capturedAt),
    evidence('supply-status', 'Supply status', logistics?.supplyStatus, context.capturedAt),
    evidence('limiting-resource', 'Limiting resource', logistics?.limitingResource, context.capturedAt),
    evidence('critical-supply-warnings', 'Critical supply warnings', logistics?.criticalSupplyWarnings, context.capturedAt),
  ];
  const result = { status: 'normal' as AssessmentStatus, why: [] as string[] };
  const fuelRange = logistics?.fuelRangeMiles?.value;
  const distanceRemaining = logistics?.distanceRemainingMiles?.value;
  const fuelReserveToCheckpoint = logistics?.fuelReserveToNextCheckpointMiles?.value;
  const fuelReserveToCamp = logistics?.fuelReserveToCampMiles?.value;
  const fuelReserveToResupply = logistics?.fuelReserveToResupplyMiles?.value;
  const waterEnduranceDays = logistics?.waterEnduranceDays?.value ?? computedWaterEnduranceDays;
  const foodDays = logistics?.foodDaysRemaining?.value;
  const powerHours = logistics?.powerHoursRemaining?.value;
  const equipmentIssues = logistics?.criticalEquipmentIssues?.value ?? [];
  const warnings = logistics?.criticalSupplyWarnings?.value ?? [];

  if (evidenceItems.some((item) => ['fuel-range', 'water-remaining', 'food-days'].includes(item.id) && item.isMissing)) {
    addStatusReason('unknown', 'Logistics assessment is missing fuel, water, or food data.', result);
  }
  if (typeof fuelRange === 'number' && typeof distanceRemaining === 'number') {
    if (fuelRange < distanceRemaining) addStatusReason('critical', 'Fuel range is below distance remaining.', result);
    else if (fuelRange < distanceRemaining * 1.2) addStatusReason('caution', 'Fuel reserve is below the 20% margin.', result);
    else if (fuelRange < distanceRemaining * 1.5) addStatusReason('watch', 'Fuel reserve is narrowing.', result);
  }
  for (const [label, reserve] of [
    ['next checkpoint', fuelReserveToCheckpoint],
    ['camp', fuelReserveToCamp],
    ['resupply', fuelReserveToResupply],
  ] as const) {
    if (typeof reserve === 'number') {
      if (reserve < 0) addStatusReason('critical', `Fuel reserve to ${label} is negative.`, result);
      else if (reserve < 15) addStatusReason('caution', `Fuel reserve to ${label} is below 15 miles.`, result);
      else if (reserve < 30) addStatusReason('watch', `Fuel reserve to ${label} is narrowing.`, result);
    }
  }
  if (lowestRangeVehicle && typeof distanceRemaining === 'number') {
    if (lowestRangeVehicle.range < distanceRemaining) addStatusReason('critical', `${lowestRangeVehicle.label} range is below remaining route distance.`, result);
    else if (lowestRangeVehicle.range < distanceRemaining * 1.2) addStatusReason('caution', `${lowestRangeVehicle.label} has the lowest route fuel margin.`, result);
  }
  if (typeof waterPerPerson === 'number') {
    if (waterPerPerson < 2) addStatusReason('critical', 'Water remaining is below one field-day per person.', result);
    else if (waterPerPerson < 4) addStatusReason('caution', 'Water is the limiting resource.', result);
    else if (waterPerPerson < 6) addStatusReason('watch', 'Water is the limiting resource and deserves monitoring.', result);
  }
  if (typeof waterEnduranceDays === 'number') {
    if (waterEnduranceDays < 0.5) addStatusReason('critical', 'Water endurance is below half a day.', result);
    else if (waterEnduranceDays < 1) addStatusReason('caution', 'Water endurance is below one day.', result);
    else if (waterEnduranceDays < 2) addStatusReason('watch', 'Water endurance is narrowing.', result);
  }
  if (typeof foodDays === 'number') {
    if (foodDays < 0.5) addStatusReason('critical', 'Food remaining is below half a day.', result);
    else if (foodDays < 1) addStatusReason('caution', 'Food remaining is below one day.', result);
    else if (foodDays < 2) addStatusReason('watch', 'Food reserve is narrowing.', result);
  }
  if (typeof powerHours === 'number') {
    if (powerHours < 2) addStatusReason('critical', 'Power endurance is below two hours.', result);
    else if (powerHours < 4) addStatusReason('caution', 'Power endurance is below four hours.', result);
    else if (powerHours < 8) addStatusReason('watch', 'Power endurance is narrowing.', result);
  }
  if (logistics?.batteryPowerStatus?.value && logistics.batteryPowerStatus.value !== 'normal') {
    addStatusReason(logistics.batteryPowerStatus.value, 'Battery/power source reported a status concern.', result);
  }
  if (logistics?.shelterReady?.value === false || logistics?.warmthReady?.value === false || logistics?.medicalKitReady?.value === false) {
    addStatusReason('caution', 'Shelter, warmth, or medical readiness is incomplete.', result);
  }
  if (logistics?.criticalEquipmentReady?.value === false || equipmentIssues.length > 0) {
    addStatusReason('caution', 'Critical equipment readiness is incomplete.', result);
  }
  if (warnings.length > 0) addStatusReason('caution', 'Critical supply warnings are active.', result);
  if (logistics?.supplyStatus?.value && logistics.supplyStatus.value !== 'normal') {
    addStatusReason(logistics.supplyStatus.value, 'Logistics source reported a supply status concern.', result);
  }
  if (result.why.length === 0) result.why.push('Fuel, water, food, power, and readiness inputs are within operating margin.');

  return finalizeAssessment(
    {
      category: 'logistics',
      status: result.status,
      title: `Logistics ${STATUS_TITLES[result.status]}`,
      summary: result.status === 'normal' ? 'Logistics reserves are within margin.' : result.why[0],
      why: result.why,
      whatToWatch: ['Fuel by vehicle, water per person, food endurance, power endurance, resupply distance, and critical supplies.'],
      recommendedAction:
        result.status === 'critical'
          ? 'Stop and resolve the limiting resource before continuing.'
          : result.status === 'caution'
            ? 'Plan resupply or reduce demand soon.'
            : result.status === 'watch'
              ? 'Monitor the limiting resource and plan resupply before the next commitment point.'
            : result.status === 'unknown'
              ? 'Refresh fuel, water, and food data.'
              : 'Continue monitoring resource endurance.',
      toImproveStatus: [
        'Update fuel by vehicle.',
        'Confirm water and food by group size.',
        'Update battery and power endurance.',
        'Mark resupply complete when fuel, water, and food are replenished.',
      ],
      evidence: evidenceItems,
      criticalEvidenceIds: ['fuel-range', 'water-remaining', 'food-days'],
      escalationRecommended: result.status === 'critical',
      escalationReason: result.status === 'critical' ? result.why[0] : null,
      relatedActions: [
        { id: 'update-fuel', label: 'Update fuel', targetCategory: 'logistics' },
        { id: 'update-water', label: 'Update water', targetCategory: 'logistics' },
        { id: 'update-food', label: 'Update food', targetCategory: 'logistics' },
        { id: 'update-battery-power', label: 'Update battery/power', targetCategory: 'logistics' },
        { id: 'rebalance-supplies', label: 'Rebalance supplies between vehicles', targetCategory: 'logistics' },
        { id: 'mark-resupply-complete', label: 'Mark resupply complete', targetCategory: 'logistics' },
        { id: 'generate-resupply-plan', label: 'Generate resupply plan', targetCategory: 'logistics' },
        { id: 'open-incident-recovery', label: 'Open Incident & Recovery', targetCategory: 'logistics' },
      ],
    },
    context,
  );
}

function vehiclesAssessment(context: ExpeditionContextSnapshot): ExpeditionAssessment {
  const vehicles = context.vehicles ?? [];
  const vehicleLabels = vehicles.map((vehicle, index) => vehicle.callsign?.value ?? vehicle.label?.value ?? `Vehicle ${index + 1}`);
  const limitingVehicle = vehicles.reduce<{
    label: string;
    status: AssessmentStatus;
    reason: string;
    weight: number;
  } | null>((current, vehicle, index) => {
    const label = vehicle.callsign?.value ?? vehicle.label?.value ?? `Vehicle ${index + 1}`;
    let status: AssessmentStatus = 'normal';
    let reason = 'ready';
    if (vehicle.disabled?.value === true) {
      status = 'critical';
      reason = 'disabled';
    } else if (vehicle.readinessStatus?.value && vehicle.readinessStatus.value !== 'normal') {
      status = vehicle.readinessStatus.value;
      reason = `readiness ${vehicle.readinessStatus.value}`;
    } else if (vehicle.engineStatus?.value === 'fault') {
      status = 'caution';
      reason = 'engine fault';
    } else if (vehicle.tirePressureStatus?.value === 'low') {
      status = 'caution';
      reason = 'low tire pressure';
    } else if (vehicle.activeMechanicalIssue?.value || (vehicle.manualIssueReports?.value?.length ?? 0) > 0) {
      status = 'caution';
      reason = 'reported mechanical issue';
    } else if (vehicle.engineStatus?.value === 'warning') {
      status = 'watch';
      reason = 'engine warning';
    } else if (vehicle.tirePressureStatus?.value === 'watch') {
      status = 'watch';
      reason = 'tire watch';
    } else if (typeof vehicle.fuelLevelPercent?.value === 'number' && vehicle.fuelLevelPercent.value < 20) {
      status = 'watch';
      reason = 'low fuel';
    } else if (typeof vehicle.batteryVoltage?.value === 'number' && vehicle.batteryVoltage.value < 11.8) {
      status = 'watch';
      reason = 'low battery voltage';
    } else if (vehicle.recoveryEquipmentReady?.value === false || vehicle.spareTireReady?.value === false) {
      status = 'watch';
      reason = 'recovery gear or spare tire not confirmed';
    }
    const weight = STATUS_WEIGHT[status];
    return !current || weight > current.weight ? { label, status, reason, weight } : current;
  }, null);
  const evidenceItems = vehicles.flatMap((vehicle, index) => {
    const prefix = vehicle.vehicleId ?? `vehicle-${index + 1}`;
    const label = vehicle.callsign?.value ?? vehicle.label?.value ?? `Vehicle ${index + 1}`;
    return [
      evidence(`${prefix}-callsign`, `${label} callsign`, vehicle.callsign, context.capturedAt),
      evidence(`${prefix}-label`, `${label} label`, vehicle.label, context.capturedAt),
      evidence(`${prefix}-driver`, `${label} driver`, vehicle.driverName, context.capturedAt),
      evidence(`${prefix}-readiness`, `${label} readiness`, vehicle.readinessStatus, context.capturedAt, { required: true }),
      evidence(`${prefix}-disabled`, `${label} disabled`, vehicle.disabled, context.capturedAt, { required: true }),
      evidence(`${prefix}-engine-status`, `${label} engine status`, vehicle.engineStatus, context.capturedAt),
      evidence(`${prefix}-engine-temperature`, `${label} engine temperature`, vehicle.engineTemperatureF, context.capturedAt),
      evidence(`${prefix}-engine-fault-codes`, `${label} engine fault data`, vehicle.engineFaultCodes, context.capturedAt),
      evidence(`${prefix}-mechanical-issue`, `${label} mechanical issue`, vehicle.activeMechanicalIssue, context.capturedAt),
      evidence(`${prefix}-manual-issue-reports`, `${label} manual issue reports`, vehicle.manualIssueReports, context.capturedAt),
      evidence(`${prefix}-range`, `${label} range remaining`, vehicle.rangeRemainingMiles, context.capturedAt),
      evidence(`${prefix}-fuel`, `${label} fuel level`, vehicle.fuelLevelPercent, context.capturedAt),
      evidence(`${prefix}-battery`, `${label} battery voltage`, vehicle.batteryVoltage, context.capturedAt),
      evidence(`${prefix}-tires`, `${label} tire pressure status`, vehicle.tirePressureStatus, context.capturedAt),
      evidence(`${prefix}-recovery-ready`, `${label} recovery equipment ready`, vehicle.recoveryEquipmentReady, context.capturedAt),
      evidence(`${prefix}-spare-tire-ready`, `${label} spare tire status`, vehicle.spareTireReady, context.capturedAt),
      evidence(`${prefix}-payload-risk`, `${label} payload risk`, vehicle.payloadRiskStatus, context.capturedAt),
    ];
  });
  evidenceItems.unshift(
    evidence('vehicle-list', 'Vehicle list', undefined, context.capturedAt, {
      value: vehicles.length > 0 ? vehicleLabels : null,
      source: vehicles.length > 0 ? 'vehicleObd' : 'unknown',
      required: vehicles.length === 0,
    }),
    evidence('limiting-vehicle', 'Limiting vehicle', undefined, context.capturedAt, {
      value: limitingVehicle ? `${limitingVehicle.label}: ${limitingVehicle.reason}` : null,
      source: limitingVehicle ? 'vehicleObd' : 'unknown',
    }),
  );
  const result = { status: 'normal' as AssessmentStatus, why: [] as string[] };

  if (vehicles.length === 0) {
    addStatusReason('unknown', 'Vehicle assessment is missing vehicle data.', result);
  }

  for (const [index, vehicle] of vehicles.entries()) {
    const label = vehicle.callsign?.value ?? vehicle.label?.value ?? `Vehicle ${index + 1}`;
    if (vehicle.disabled?.value === true) addStatusReason('critical', `${label} is disabled.`, result);
    if (vehicle.activeMechanicalIssue?.value) addStatusReason('caution', `${label} has an active mechanical issue.`, result);
    if ((vehicle.manualIssueReports?.value?.length ?? 0) > 0) addStatusReason('caution', `${label} has manual issue reports.`, result);
    if (vehicle.readinessStatus?.value && vehicle.readinessStatus.value !== 'normal') {
      addStatusReason(vehicle.readinessStatus.value, `${label} readiness source reported ${vehicle.readinessStatus.value}.`, result);
    }
    if ((vehicle.engineFaultCodes?.value?.length ?? 0) > 0) addStatusReason('caution', `${label} engine fault data is present.`, result);
    if (vehicle.engineStatus?.value === 'fault') addStatusReason('caution', `${label} engine status reports a fault.`, result);
    else if (vehicle.engineStatus?.value === 'warning') addStatusReason('watch', `${label} engine status reports a warning.`, result);
    if (typeof vehicle.engineTemperatureF?.value === 'number') {
      if (vehicle.engineTemperatureF.value >= 240) addStatusReason('caution', `${label} engine temperature is high.`, result);
      else if (vehicle.engineTemperatureF.value >= 220) addStatusReason('watch', `${label} engine temperature deserves monitoring.`, result);
    }
    if (typeof vehicle.fuelLevelPercent?.value === 'number') {
      if (vehicle.fuelLevelPercent.value < 10) addStatusReason('caution', `${label} fuel level is below 10%.`, result);
      else if (vehicle.fuelLevelPercent.value < 20) addStatusReason('watch', `${label} fuel level is below 20%.`, result);
    }
    if (typeof vehicle.batteryVoltage?.value === 'number' && vehicle.batteryVoltage.value < 11.8) {
      addStatusReason('watch', `${label} battery voltage is low.`, result);
    }
    if (vehicle.tirePressureStatus?.value === 'low') {
      addStatusReason(
        context.route?.upcomingDifficultTerrain?.value === true ? 'critical' : 'caution',
        context.route?.upcomingDifficultTerrain?.value === true
          ? `${label} tire pressure is low before difficult terrain.`
          : `${label} tire pressure is low.`,
        result,
      );
    }
    else if (vehicle.tirePressureStatus?.value === 'watch') addStatusReason('watch', `${label} tire pressure deserves monitoring.`, result);
    if (vehicle.recoveryEquipmentReady?.value === false) addStatusReason('watch', `${label} recovery equipment is not confirmed ready.`, result);
    if (vehicle.spareTireReady?.value === false) addStatusReason('watch', `${label} spare tire is not confirmed ready.`, result);
    if (vehicle.payloadRiskStatus?.value && vehicle.payloadRiskStatus.value !== 'normal') {
      addStatusReason(vehicle.payloadRiskStatus.value, `${label} payload risk is ${vehicle.payloadRiskStatus.value}.`, result);
    }
  }

  if (result.why.length === 0) result.why.push('Vehicle readiness inputs show no active mechanical or readiness concern.');

  return finalizeAssessment(
    {
      category: 'vehicles',
      status: result.status,
      title: `Vehicles ${STATUS_TITLES[result.status]}`,
      summary: result.status === 'normal' ? 'Vehicle readiness is acceptable.' : result.why[0],
      why: result.why,
      whatToWatch: ['Disabled vehicles, mechanical issues, fuel/range, tires, battery, and recovery readiness.'],
      recommendedAction:
        result.status === 'critical'
          ? 'Stop movement and stabilize the disabled or unsafe vehicle.'
          : result.status === 'caution'
            ? 'Address vehicle readiness before committing to harder terrain.'
            : result.status === 'watch'
              ? 'Inspect the limiting vehicle at the next safe turnout.'
            : result.status === 'unknown'
              ? 'Refresh vehicle readiness and telemetry.'
              : 'Continue monitoring vehicle readiness.',
      toImproveStatus: [
        'Refresh telemetry.',
        'Confirm tire, battery, and engine status.',
        'Confirm recovery gear and spare tire.',
        'Resolve active mechanical issues.',
      ],
      evidence: evidenceItems,
      criticalEvidenceIds: vehicles.flatMap((vehicle, index) => [
        `${vehicle.vehicleId ?? `vehicle-${index + 1}`}-readiness`,
        `${vehicle.vehicleId ?? `vehicle-${index + 1}`}-disabled`,
      ]).concat('vehicle-list'),
      escalationRecommended: result.status === 'critical',
      escalationReason: result.status === 'critical' ? result.why[0] : null,
      relatedActions: [
        { id: 'mark-vehicle-ok', label: 'Mark vehicle OK', targetCategory: 'vehicles' },
        { id: 'report-mechanical-issue', label: 'Report mechanical issue', targetCategory: 'vehicles' },
        { id: 'mark-disabled', label: 'Mark disabled', targetCategory: 'vehicles' },
        { id: 'update-fuel', label: 'Update fuel', targetCategory: 'vehicles' },
        { id: 'update-tire-status', label: 'Update tire status', targetCategory: 'vehicles' },
        { id: 'inspect-vehicle', label: 'Inspect vehicle', targetCategory: 'vehicles' },
        { id: 'start-recovery-workflow', label: 'Start recovery workflow', targetCategory: 'vehicles' },
        { id: 'open-incident-recovery', label: 'Open Incident & Recovery', targetCategory: 'vehicles' },
      ],
    },
    context,
  );
}

function overviewAssessment(context: ExpeditionContextSnapshot, assessments: ExpeditionAssessment[]): ExpeditionAssessment {
  const operational = assessments.filter((item) => item.category !== 'overview');
  const topConcern = operational.reduce((worst, item) =>
    STATUS_WEIGHT[item.status] > STATUS_WEIGHT[worst.status] ? item : worst,
  operational[0]);
  const subsystemEvidence = operational.map((item) => ({
    id: `${item.category}-status`,
    label: `${item.title} status`,
    value: item.status,
    source: 'unknown' as const,
    updatedAt: item.lastUpdated,
    confidence: item.confidence,
    reliability: item.confidence,
    isStale: item.staleDataWarnings.length > 0,
    isMissing: item.missingDataWarnings.length > 0,
    notes: item.summary,
  }));
  const evidenceItems = [
    ...subsystemEvidence,
    evidence('route-phase', 'Current route phase', context.route?.lifecycleState, context.capturedAt),
    evidence('route-progress', 'Progress against plan', context.route?.progressPercent, context.capturedAt),
    evidence('current-eta', 'Current ETA', context.route?.estimatedArrivalIso, context.capturedAt),
    evidence('next-checkpoint', 'Next checkpoint', context.route?.currentSegmentLabel, context.capturedAt),
    evidence('convoy-accountability', 'Convoy accountability', context.convoy?.activeMemberCount, context.capturedAt),
    evidence('convoy-team-size', 'Convoy team size', context.convoy?.teamMemberCount, context.capturedAt),
    evidence('communications-quality', 'Communications/data quality', context.convoy?.communicationsStatus, context.capturedAt),
    evidence('camp-readiness', 'Camp readiness', context.camp?.campReadinessStatus, context.capturedAt),
    evidence('logistics-endurance', 'Limiting resource', context.logistics?.limitingResource, context.capturedAt),
    evidence('vehicle-readiness', 'Vehicle readiness', context.vehicles?.[0]?.readinessStatus, context.capturedAt),
  ];
  const concernCounts = operational.reduce(
    (counts, item) => ({ ...counts, [item.status]: (counts[item.status] ?? 0) + 1 }),
    {} as Partial<Record<AssessmentStatus, number>>,
  );
  const status =
    operational.some((item) => item.status === 'critical')
      ? 'critical'
      : operational.some((item) => item.status === 'caution')
        ? 'caution'
        : operational.some((item) => item.status === 'unknown')
          ? 'unknown'
          : operational.some((item) => item.status === 'watch')
            ? 'watch'
            : 'normal';
  const why =
    status === 'normal'
      ? ['Route, convoy, camp, logistics, and vehicle assessments are inside operating margin.']
      : [`Top concern: ${topConcern.title}. ${topConcern.summary}`];

  return finalizeAssessment(
    {
      category: 'overview',
      status,
      title: `Overview ${STATUS_TITLES[status]}`,
      summary:
        status === 'normal'
          ? 'Expedition stable. Route, convoy, camp, logistics, and vehicle assessments are inside operating margin.'
          : `${topConcern.title} is the leading operational concern.`,
      why,
      whatToWatch: [
        `${concernCounts.critical ?? 0} critical, ${concernCounts.caution ?? 0} caution, ${concernCounts.watch ?? 0} watch, ${concernCounts.unknown ?? 0} unknown.`,
      ],
      recommendedAction:
        status === 'normal'
          ? 'Continue expedition monitoring.'
          : topConcern.recommendedAction,
      toImproveStatus:
        status === 'normal'
          ? ['Keep route, convoy, camp, logistics, and vehicle data fresh.']
          : topConcern.toImproveStatus,
      evidence: evidenceItems,
      criticalEvidenceIds: evidenceItems.map((item) => item.id),
      escalationRecommended: operational.some((item) => item.escalationRecommended),
      escalationReason: operational.find((item) => item.escalationRecommended)?.escalationReason ?? null,
      relatedActions: operational.map((item) => ({
        id: `review-${item.category}`,
        label: overviewActionLabel(item.category),
        targetCategory: item.category as AssessmentCategory,
      })).concat({
        id: 'open-top-concern',
        label: 'Open top concern',
        targetCategory: topConcern.category as AssessmentCategory,
      }),
    },
    context,
  );
}

function overviewActionLabel(category: AssessmentCategory): string {
  switch (category) {
    case 'route':
      return 'Report route issue';
    case 'convoy':
      return 'Send check-in request';
    case 'camp':
      return 'Evaluate alternate camp';
    case 'logistics':
      return 'Update fuel/water';
    case 'vehicles':
      return 'Inspect vehicle';
    default:
      return `Review ${category}`;
  }
}

export function buildExpeditionOperationalAssessments(
  context: ExpeditionContextSnapshot,
): ExpeditionAssessment[] {
  const route = routeAssessment(context);
  const convoy = convoyAssessment(context);
  const camp = campAssessment(context);
  const logistics = logisticsAssessment(context);
  const vehicles = vehiclesAssessment(context);
  const overview = overviewAssessment(context, [route, convoy, camp, logistics, vehicles]);
  return [overview, route, convoy, camp, logistics, vehicles];
}

export function buildExpeditionOperationalAssessmentMap(
  context: ExpeditionContextSnapshot,
): Record<AssessmentCategory, ExpeditionAssessment> {
  return buildExpeditionOperationalAssessments(context).reduce(
    (map, assessment) => ({
      ...map,
      [assessment.category]: assessment,
    }),
    {} as Record<AssessmentCategory, ExpeditionAssessment>,
  );
}
