import type {
  AssessmentCategory,
  AssessmentConfidence,
  AssessmentStatus,
  ExpeditionContextSnapshot,
  ExpeditionDataPoint,
  ExpeditionDataSource,
} from './operationalAssessmentTypes';

const NOW = '2026-04-28T18:00:00.000Z';

type DataPointOptions = {
  source?: ExpeditionDataSource;
  confidence?: AssessmentConfidence;
  isStale?: boolean;
  staleAfterMinutes?: number;
  updatedAt?: string;
};

function dp<T>(value: T, options: DataPointOptions = {}): ExpeditionDataPoint<T> {
  return {
    value,
    source: options.source ?? 'mock',
    updatedAt: options.updatedAt ?? NOW,
    confidence: options.confidence ?? 'high',
    reliability: options.confidence ?? 'high',
    isStale: options.isStale,
    staleAfterMinutes: options.staleAfterMinutes,
  };
}

function missingDp<T>(options: DataPointOptions = {}): ExpeditionDataPoint<T> {
  return {
    value: null,
    source: options.source ?? 'unknown',
    updatedAt: options.updatedAt ?? NOW,
    confidence: options.confidence ?? 'low',
    reliability: options.confidence ?? 'low',
    isStale: options.isStale,
    staleAfterMinutes: options.staleAfterMinutes,
  };
}

function status(value: AssessmentStatus): ExpeditionDataPoint<AssessmentStatus> {
  return dp(value);
}

export const allSystemsNormalFixture: ExpeditionContextSnapshot = {
  expeditionId: 'fixture-normal',
  capturedAt: NOW,
  offlineMode: false,
  manualInputAvailable: true,
  route: {
    routeId: 'route-normal',
    routeName: dp('Cedar Ridge Loop'),
    lifecycleState: dp('active'),
    currentLocation: dp({ latitude: 38.1, longitude: -109.4, accuracyMeters: 8 }),
    currentSegmentLabel: dp('Ridge approach'),
    progressPercent: dp(62),
    distanceRemainingMiles: dp(42),
    estimatedArrivalIso: dp('2026-04-28T20:00:00.000Z'),
    plannedArrivalStartIso: dp('2026-04-28T19:30:00.000Z'),
    plannedArrivalEndIso: dp('2026-04-28T21:00:00.000Z'),
    daylightRemainingAtEtaMinutes: dp(150),
    routeConfidence: dp('high'),
    knownHazards: dp([]),
    offRoute: dp(false),
    upcomingDifficultTerrain: dp(false),
    alternateRouteAvailable: dp(true),
    deviationTimeMinutes: dp(0),
    deviationFuelPercent: dp(0),
  },
  convoy: {
    teamId: 'team-normal',
    members: [
      {
        id: 'lead',
        callsign: 'Lead Tacoma',
        role: 'lead',
        lastCheckInAt: dp('2026-04-28T17:55:00.000Z'),
        lastKnownLocation: dp({ latitude: 38.10242, longitude: -109.40218, accuracyMeters: 9 }, { source: 'liveGps' }),
        lastKnownLocationLabel: dp('Ridge approach'),
        headingDegrees: dp(42, { source: 'liveGps' }),
        speedMph: dp(12, { source: 'liveGps' }),
        batteryPercent: dp(91, { source: 'liveGps' }),
        locationStale: dp(false, { source: 'liveGps' }),
        movementStatus: dp('moving'),
        distanceBehindLeadMiles: dp(0),
        missedCheckpoint: dp(false),
        needsAssistance: dp(false),
      },
      {
        id: 'vehicle-2',
        callsign: 'Vehicle 2',
        role: 'member',
        lastCheckInAt: dp('2026-04-28T17:54:00.000Z'),
        lastKnownLocation: dp({ latitude: 38.09866, longitude: -109.40751, accuracyMeters: 11 }, { source: 'liveGps' }),
        lastKnownLocationLabel: dp('Ridge approach, mid-pack'),
        headingDegrees: dp(40, { source: 'liveGps' }),
        speedMph: dp(10, { source: 'liveGps' }),
        batteryPercent: dp(84, { source: 'liveGps' }),
        locationStale: dp(false, { source: 'liveGps' }),
        movementStatus: dp('moving'),
        distanceBehindLeadMiles: dp(0.6),
        missedCheckpoint: dp(false),
        needsAssistance: dp(false),
      },
      {
        id: 'sweep',
        callsign: 'Sweep vehicle',
        role: 'sweep',
        lastCheckInAt: dp('2026-04-28T17:53:00.000Z'),
        lastKnownLocation: dp({ latitude: 38.09471, longitude: -109.41322, accuracyMeters: 13 }, { source: 'liveGps' }),
        lastKnownLocationLabel: dp('Ridge approach, sweep'),
        headingDegrees: dp(39, { source: 'liveGps' }),
        speedMph: dp(9, { source: 'liveGps' }),
        batteryPercent: dp(77, { source: 'liveGps' }),
        locationStale: dp(false, { source: 'liveGps' }),
        movementStatus: dp('moving'),
        distanceBehindLeadMiles: dp(1.2),
        missedCheckpoint: dp(false),
        needsAssistance: dp(false),
      },
    ],
    teamMemberCount: dp(3),
    activeMemberCount: dp(3),
    missingMemberCount: dp(0),
    overdueMemberLabels: dp([]),
    stoppedUnexpectedlyLabels: dp([]),
    missedCheckpointMemberLabels: dp([]),
    assistanceNeededMemberLabels: dp([]),
    lastCheckInAt: dp('2026-04-28T17:55:00.000Z'),
    trackingEnabled: dp(true, { source: 'liveGps' }),
    liveLocationMemberCount: dp(3, { source: 'liveGps' }),
    staleLocationMemberLabels: dp([], { source: 'liveGps' }),
    convoySpacingMinutes: dp(6),
    leadSweepSeparationMiles: dp(1.2),
    communicationsStatus: dp('online'),
    recommendedRegroupPoint: dp('Next safe turnout'),
  },
  camp: {
    hasRouteCamps: dp(true),
    plannedCampStatus: dp('confirmed'),
    nextCampName: dp('Juniper Wash'),
    estimatedArrivalIso: dp('2026-04-28T20:00:00.000Z'),
    distanceToNextCampMiles: dp(42),
    campReadinessStatus: status('normal'),
    campSafetyStatus: dp('safe'),
    campConfirmed: dp(true),
    weatherExposure: dp('low'),
    sunsetIso: dp('2026-04-28T22:30:00.000Z'),
    windMph: dp(8),
    temperatureF: dp(62),
    precipitationChancePercent: dp(10),
    routeDifficultyRemaining: dp('easy'),
    convoyArrivalConfidence: dp('high'),
    arrivalBeforeDark: dp(true),
    daylightRemainingAtArrivalMinutes: dp(150),
    alternateCampAvailable: dp(true),
    alternateCampLabel: dp('Alternate Camp 1'),
    alternateCampImprovesDaylightMargin: dp(false),
    alternateCampFuelRisk: dp('low'),
    safeSetupBeforeDark: dp(true),
    overnightFuelReady: dp(true),
    overnightWaterReady: dp(true),
    overnightPowerReady: dp(true),
    knownCampHazards: dp([]),
  },
  logistics: {
    fuelRangeMiles: dp(260),
    distanceRemainingMiles: dp(42),
    nextCheckpointLabel: dp('Checkpoint 3'),
    distanceToNextCheckpointMiles: dp(18),
    fuelReserveToNextCheckpointMiles: dp(242),
    fuelReserveToCampMiles: dp(218),
    fuelReserveToResupplyMiles: dp(225),
    waterRemainingLiters: dp(36),
    waterEnduranceDays: dp(3.1),
    foodDaysRemaining: dp(4),
    groupSize: dp(3),
    powerHoursRemaining: dp(36),
    batteryPowerStatus: status('normal'),
    timeToResupplyHours: dp(2),
    distanceToResupplyMiles: dp(35),
    shelterReady: dp(true),
    warmthReady: dp(true),
    medicalKitReady: dp(true),
    criticalEquipmentReady: dp(true),
    criticalEquipmentIssues: dp([]),
    lastResupplyCompletedAt: dp('2026-04-28T15:00:00.000Z'),
    supplyStatus: status('normal'),
    limitingResource: dp('none'),
    criticalSupplyWarnings: dp([]),
  },
  vehicles: [
    {
      vehicleId: 'vehicle-1',
      callsign: dp('Lead Tacoma'),
      label: dp('Lead Tacoma'),
      driverName: dp('Logan'),
      readinessStatus: status('normal'),
      engineStatus: dp('nominal'),
      engineTemperatureF: dp(195),
      engineFaultCodes: dp([]),
      disabled: dp(false),
      activeMechanicalIssue: dp(''),
      manualIssueReports: dp([]),
      rangeRemainingMiles: dp(260),
      fuelLevelPercent: dp(68),
      batteryVoltage: dp(12.5),
      tirePressureStatus: dp('normal'),
      recoveryEquipmentReady: dp(true),
      spareTireReady: dp(true),
      payloadRiskStatus: status('normal'),
      lastTelemetryAt: dp('2026-04-28T17:58:00.000Z'),
    },
    {
      vehicleId: 'vehicle-2',
      callsign: dp('Sweep 4Runner'),
      label: dp('Sweep 4Runner'),
      driverName: dp('Sweep'),
      readinessStatus: status('normal'),
      engineStatus: dp('nominal'),
      engineTemperatureF: dp(190),
      engineFaultCodes: dp([]),
      disabled: dp(false),
      activeMechanicalIssue: dp(''),
      manualIssueReports: dp([]),
      rangeRemainingMiles: dp(240),
      fuelLevelPercent: dp(64),
      batteryVoltage: dp(12.6),
      tirePressureStatus: dp('normal'),
      recoveryEquipmentReady: dp(true),
      spareTireReady: dp(true),
      payloadRiskStatus: status('normal'),
      lastTelemetryAt: dp('2026-04-28T17:57:00.000Z'),
    },
  ],
};

export const campCloseToSunsetFixture: ExpeditionContextSnapshot = {
  ...allSystemsNormalFixture,
  expeditionId: 'fixture-camp-close-sunset',
  camp: {
    ...allSystemsNormalFixture.camp,
    daylightRemainingAtArrivalMinutes: dp(30),
    safeSetupBeforeDark: dp(true),
  },
};

export const convoyMemberOverdueFixture: ExpeditionContextSnapshot = {
  ...allSystemsNormalFixture,
  expeditionId: 'fixture-convoy-overdue',
  convoy: {
    ...allSystemsNormalFixture.convoy,
    overdueMemberLabels: dp(['Sweep vehicle']),
    assistanceNeededMemberLabels: dp(['Sweep vehicle']),
    lastCheckInAt: dp('2026-04-28T16:45:00.000Z'),
    communicationsStatus: dp('degraded'),
  },
};

export const logisticsWaterLimitedFixture: ExpeditionContextSnapshot = {
  ...allSystemsNormalFixture,
  expeditionId: 'fixture-water-limited',
  logistics: {
    ...allSystemsNormalFixture.logistics,
    waterRemainingLiters: dp(8),
    groupSize: dp(3),
    limitingResource: dp('water'),
  },
};

export const vehicleDisabledFixture: ExpeditionContextSnapshot = {
  ...allSystemsNormalFixture,
  expeditionId: 'fixture-vehicle-disabled',
  vehicles: [
    {
      ...allSystemsNormalFixture.vehicles?.[0],
      disabled: dp(true),
      readinessStatus: status('critical'),
      activeMechanicalIssue: dp('Drivetrain fault'),
    },
  ],
};

export const multipleDegradedSystemsFixture: ExpeditionContextSnapshot = {
  ...allSystemsNormalFixture,
  expeditionId: 'fixture-multiple-degraded',
  route: {
    ...allSystemsNormalFixture.route,
    offRoute: dp(true),
    alternateRouteAvailable: dp(true),
    daylightRemainingAtEtaMinutes: dp(35),
    knownHazards: dp(['washout']),
  },
  convoy: {
    ...allSystemsNormalFixture.convoy,
    communicationsStatus: dp('offline'),
    convoySpacingMinutes: dp(28),
  },
  logistics: {
    ...allSystemsNormalFixture.logistics,
    fuelRangeMiles: dp(40),
    distanceRemainingMiles: dp(48),
    waterRemainingLiters: dp(5),
    groupSize: dp(3),
    limitingResource: dp('fuel and water'),
  },
};

export const missingDataFixture: ExpeditionContextSnapshot = {
  expeditionId: 'fixture-missing-data',
  capturedAt: NOW,
  offlineMode: true,
  manualInputAvailable: true,
  route: {
    currentLocation: missingDp({ source: 'unknown', confidence: 'low' }),
    offRoute: missingDp({ source: 'unknown', confidence: 'low', isStale: true }),
    estimatedArrivalIso: missingDp({ source: 'unknown', confidence: 'low' }),
  },
  convoy: {
    teamMemberCount: missingDp({ source: 'unknown', confidence: 'low' }),
  },
  camp: {
    hasRouteCamps: missingDp({ source: 'unknown', confidence: 'low' }),
    estimatedArrivalIso: missingDp({ source: 'unknown', confidence: 'low', isStale: true }),
  },
  logistics: {
    fuelRangeMiles: missingDp({ source: 'unknown', confidence: 'low' }),
    waterRemainingLiters: missingDp({ source: 'unknown', confidence: 'low' }),
    foodDaysRemaining: missingDp({ source: 'unknown', confidence: 'low' }),
  },
  vehicles: [],
};

export type ExpeditionOperationalScenarioId =
  | 'normal-expedition'
  | 'route-watch'
  | 'convoy-watch'
  | 'camp-caution'
  | 'logistics-watch'
  | 'vehicle-caution'
  | 'critical-incident'
  | 'unknown-low-confidence';

export type ExpeditionOperationalAssessmentScenario = {
  id: ExpeditionOperationalScenarioId;
  label: string;
  description: string;
  snapshot: ExpeditionContextSnapshot;
  expectedStatusByCategory: Record<AssessmentCategory, AssessmentStatus>;
  expectedOverviewStatus: AssessmentStatus;
  expectedTopConcern: Exclude<AssessmentCategory, 'overview'> | 'none';
};

const normalExpectedStatuses: Record<AssessmentCategory, AssessmentStatus> = {
  overview: 'normal',
  route: 'normal',
  convoy: 'normal',
  camp: 'normal',
  logistics: 'normal',
  vehicles: 'normal',
};

const OLD_MANUAL_UPDATE = '2026-04-28T14:00:00.000Z';

export const routeWatchScenarioFixture: ExpeditionContextSnapshot = {
  ...allSystemsNormalFixture,
  expeditionId: 'scenario-route-watch',
  route: {
    ...allSystemsNormalFixture.route,
    upcomingDifficultTerrain: dp(true),
    upcomingDifficultTerrainLabel: dp('Rock shelf in 4.8 mi'),
    daylightRemainingAtEtaMinutes: dp(80),
  },
  camp: {
    ...allSystemsNormalFixture.camp,
    daylightRemainingAtArrivalMinutes: dp(80),
    routeDifficultyRemaining: dp('hard'),
  },
};

export const convoyWatchScenarioFixture: ExpeditionContextSnapshot = {
  ...allSystemsNormalFixture,
  expeditionId: 'scenario-convoy-watch',
  convoy: {
    ...allSystemsNormalFixture.convoy,
    members: allSystemsNormalFixture.convoy?.members?.map((member) =>
      member.id === 'sweep'
        ? {
            ...member,
            lastCheckInAt: dp('2026-04-28T17:36:00.000Z'),
            lastKnownLocationLabel: dp('1.4 mi behind group'),
            distanceBehindLeadMiles: dp(1.4),
          }
        : member,
    ),
    overdueMemberLabels: dp(['Sweep vehicle']),
    assistanceNeededMemberLabels: dp([]),
    lastCheckInAt: dp('2026-04-28T17:36:00.000Z'),
    communicationsStatus: dp('degraded'),
  },
};

export const campCautionScenarioFixture: ExpeditionContextSnapshot = {
  ...allSystemsNormalFixture,
  expeditionId: 'scenario-camp-caution',
  camp: {
    ...allSystemsNormalFixture.camp,
    plannedCampStatus: dp('planned'),
    estimatedArrivalIso: dp('2026-04-28T22:45:00.000Z'),
    daylightRemainingAtArrivalMinutes: dp(30),
    arrivalBeforeDark: dp(false),
    alternateCampAvailable: dp(true),
    alternateCampLabel: dp('Alternate Camp 1'),
    alternateCampImprovesDaylightMargin: dp(true),
  },
};

export const logisticsWatchScenarioFixture: ExpeditionContextSnapshot = {
  ...allSystemsNormalFixture,
  expeditionId: 'scenario-logistics-watch',
  logistics: {
    ...allSystemsNormalFixture.logistics,
    waterRemainingLiters: dp(15),
    waterEnduranceDays: dp(1.5),
    groupSize: dp(3),
    limitingResource: dp('water'),
  },
};

export const vehicleCautionScenarioFixture: ExpeditionContextSnapshot = {
  ...allSystemsNormalFixture,
  expeditionId: 'scenario-vehicle-caution',
  route: {
    ...allSystemsNormalFixture.route,
    upcomingDifficultTerrain: dp(true),
    upcomingDifficultTerrainLabel: dp('Rock garden before camp'),
  },
  vehicles: allSystemsNormalFixture.vehicles?.map((vehicle, index) =>
    index === 1
      ? {
          ...vehicle,
          readinessStatus: status('caution'),
          batteryVoltage: dp(11.6),
          activeMechanicalIssue: dp('Battery voltage low before rocky terrain'),
        }
      : vehicle,
  ),
};

export const criticalIncidentScenarioFixture: ExpeditionContextSnapshot = {
  ...vehicleDisabledFixture,
  expeditionId: 'scenario-critical-incident',
};

export const unknownLowConfidenceScenarioFixture: ExpeditionContextSnapshot = {
  ...allSystemsNormalFixture,
  expeditionId: 'scenario-unknown-low-confidence',
  offlineMode: true,
  route: {
    ...allSystemsNormalFixture.route,
    currentLocation: dp(
      { latitude: 38.1, longitude: -109.4, accuracyMeters: 80 },
      { source: 'liveGps', confidence: 'low', updatedAt: OLD_MANUAL_UPDATE, staleAfterMinutes: 30 },
    ),
    offRoute: dp(false, { source: 'cached', confidence: 'medium', updatedAt: OLD_MANUAL_UPDATE, staleAfterMinutes: 30 }),
    estimatedArrivalIso: dp('2026-04-28T20:00:00.000Z', {
      source: 'cached',
      confidence: 'medium',
      updatedAt: OLD_MANUAL_UPDATE,
      staleAfterMinutes: 30,
    }),
  },
  convoy: {
    ...allSystemsNormalFixture.convoy,
    teamMemberCount: missingDp({ source: 'unknown', confidence: 'low' }),
    activeMemberCount: missingDp({ source: 'unknown', confidence: 'low' }),
    members: [],
  },
  logistics: {
    ...allSystemsNormalFixture.logistics,
    fuelRangeMiles: dp(260, {
      source: 'userManual',
      confidence: 'medium',
      updatedAt: OLD_MANUAL_UPDATE,
      staleAfterMinutes: 30,
    }),
    waterRemainingLiters: dp(36, {
      source: 'userManual',
      confidence: 'medium',
      updatedAt: OLD_MANUAL_UPDATE,
      staleAfterMinutes: 30,
    }),
    foodDaysRemaining: dp(4, {
      source: 'userManual',
      confidence: 'medium',
      updatedAt: OLD_MANUAL_UPDATE,
      staleAfterMinutes: 30,
    }),
  },
};

export const expeditionOperationalAssessmentScenarios: ExpeditionOperationalAssessmentScenario[] = [
  {
    id: 'normal-expedition',
    label: 'Normal Expedition',
    description: 'On route, convoy accounted, camp before sunset, resources healthy, and all vehicles ready.',
    snapshot: allSystemsNormalFixture,
    expectedStatusByCategory: normalExpectedStatuses,
    expectedOverviewStatus: 'normal',
    expectedTopConcern: 'none',
  },
  {
    id: 'route-watch',
    label: 'Route Watch',
    description: 'Route remains viable with slow terrain ahead and narrowing daylight margin.',
    snapshot: routeWatchScenarioFixture,
    expectedStatusByCategory: {
      ...normalExpectedStatuses,
      overview: 'watch',
      route: 'watch',
      camp: 'watch',
    },
    expectedOverviewStatus: 'watch',
    expectedTopConcern: 'route',
  },
  {
    id: 'convoy-watch',
    label: 'Convoy Watch',
    description: 'One member is overdue with last known location behind the group, but no assistance request is active.',
    snapshot: convoyWatchScenarioFixture,
    expectedStatusByCategory: {
      ...normalExpectedStatuses,
      overview: 'watch',
      convoy: 'watch',
    },
    expectedOverviewStatus: 'watch',
    expectedTopConcern: 'convoy',
  },
  {
    id: 'camp-caution',
    label: 'Camp Caution',
    description: 'Camp arrival is too close to darkness and an alternate camp is available.',
    snapshot: campCautionScenarioFixture,
    expectedStatusByCategory: {
      ...normalExpectedStatuses,
      overview: 'caution',
      camp: 'caution',
    },
    expectedOverviewStatus: 'caution',
    expectedTopConcern: 'camp',
  },
  {
    id: 'logistics-watch',
    label: 'Logistics Watch',
    description: 'Water is the limiting resource while fuel remains inside margin.',
    snapshot: logisticsWatchScenarioFixture,
    expectedStatusByCategory: {
      ...normalExpectedStatuses,
      overview: 'watch',
      logistics: 'watch',
    },
    expectedOverviewStatus: 'watch',
    expectedTopConcern: 'logistics',
  },
  {
    id: 'vehicle-caution',
    label: 'Vehicle Caution',
    description: 'One vehicle has a battery/readiness concern before difficult terrain.',
    snapshot: vehicleCautionScenarioFixture,
    expectedStatusByCategory: {
      ...normalExpectedStatuses,
      overview: 'caution',
      route: 'watch',
      vehicles: 'caution',
    },
    expectedOverviewStatus: 'caution',
    expectedTopConcern: 'vehicles',
  },
  {
    id: 'critical-incident',
    label: 'Critical Incident',
    description: 'A disabled vehicle makes escalation recommended.',
    snapshot: criticalIncidentScenarioFixture,
    expectedStatusByCategory: {
      ...normalExpectedStatuses,
      overview: 'critical',
      vehicles: 'critical',
    },
    expectedOverviewStatus: 'critical',
    expectedTopConcern: 'vehicles',
  },
  {
    id: 'unknown-low-confidence',
    label: 'Unknown / Low Confidence',
    description: 'GPS is stale, convoy data is missing, and logistics values are old manual entries.',
    snapshot: unknownLowConfidenceScenarioFixture,
    expectedStatusByCategory: {
      ...normalExpectedStatuses,
      overview: 'unknown',
      convoy: 'unknown',
    },
    expectedOverviewStatus: 'unknown',
    expectedTopConcern: 'convoy',
  },
];

export const expeditionOperationalAssessmentFixtures = {
  allSystemsNormalFixture,
  campCloseToSunsetFixture,
  convoyMemberOverdueFixture,
  logisticsWaterLimitedFixture,
  vehicleDisabledFixture,
  multipleDegradedSystemsFixture,
  missingDataFixture,
  routeWatchScenarioFixture,
  convoyWatchScenarioFixture,
  campCautionScenarioFixture,
  logisticsWatchScenarioFixture,
  vehicleCautionScenarioFixture,
  criticalIncidentScenarioFixture,
  unknownLowConfidenceScenarioFixture,
  expeditionOperationalAssessmentScenarios,
};
