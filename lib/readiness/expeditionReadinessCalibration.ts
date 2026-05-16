import type {
  ExpeditionReadinessCalibration,
  ExpeditionReadinessCategoryId,
  ExpeditionReadinessInput,
  ExpeditionReadinessProfile,
  ExpeditionReadinessSourceFreshness,
  ExpeditionReadinessThresholds,
  ExpeditionTripIntent,
  ExpeditionTripIntentSource,
} from './expeditionReadinessTypes';

export const DEFAULT_EXPEDITION_READINESS_WEIGHTS: Record<ExpeditionReadinessCategoryId, number> = {
  vehicle_fit: 12,
  route_risk: 14,
  camp_legality_confidence: 14,
  weather_window: 10,
  daylight_margin: 8,
  offline_preparedness: 12,
  fuel_range_margin: 8,
  power_runtime: 6,
  recovery_bailout_access: 10,
  communications_signal_confidence: 6,
};

export const DEFAULT_EXPEDITION_READINESS_THRESHOLDS: ExpeditionReadinessThresholds = {
  ready: 82,
  caution: 60,
};

const CORE_FRESHNESS_SOURCES: (keyof ExpeditionReadinessSourceFreshness)[] = [
  'route',
  'weather',
  'fleet',
  'offline',
  'fuel',
  'recovery',
  'communications',
  'daylight',
  'currentLocation',
];

export const EXPEDITION_READINESS_CALIBRATIONS: Record<ExpeditionReadinessProfile, ExpeditionReadinessCalibration> = {
  // Local day trips should still care about route, vehicle, weather, recovery, fuel, and comms,
  // but camp planning and connected power are often intentionally absent.
  dayTrip: {
    profile: 'dayTrip',
    label: 'Day Trip',
    weights: {
      vehicle_fit: 14,
      route_risk: 16,
      camp_legality_confidence: 2,
      weather_window: 12,
      daylight_margin: 10,
      offline_preparedness: 8,
      fuel_range_margin: 10,
      power_runtime: 2,
      recovery_bailout_access: 16,
      communications_signal_confidence: 10,
    },
    thresholds: DEFAULT_EXPEDITION_READINESS_THRESHOLDS,
    criticalFreshnessSources: CORE_FRESHNESS_SOURCES.filter((source) => source !== 'power' && source !== 'camp'),
    notes: [
      'Camp confidence and connected power are lightly weighted unless the user adds camping or power-critical context.',
      'Recovery, communications, and route risk remain high-impact because short trips can still lose margin quickly.',
    ],
  },

  // Overnight routes introduce end-of-day risk: camp confidence, weather, daylight, power,
  // and offline preparedness become more important than on a local scouting loop.
  overnight: {
    profile: 'overnight',
    label: 'Overnight',
    weights: {
      vehicle_fit: 10,
      route_risk: 12,
      camp_legality_confidence: 18,
      weather_window: 12,
      daylight_margin: 10,
      offline_preparedness: 14,
      fuel_range_margin: 8,
      power_runtime: 10,
      recovery_bailout_access: 10,
      communications_signal_confidence: 6,
    },
    thresholds: {
      ready: 84,
      caution: 62,
    },
    criticalFreshnessSources: [...CORE_FRESHNESS_SOURCES, 'camp', 'power'],
    notes: [
      'Camp legality confidence carries more weight because the route plan depends on a plausible overnight endpoint.',
      'Power, weather, daylight, and offline prep are elevated because late arrival and overnight loads increase consequence.',
    ],
  },

  // Weekend trips are usually more than one night or more complex than a simple camp,
  // so offline, fuel/range, power, and recovery rise without becoming as strict as remote travel.
  weekendExpedition: {
    profile: 'weekendExpedition',
    label: 'Weekend Expedition',
    weights: {
      vehicle_fit: 11,
      route_risk: 12,
      camp_legality_confidence: 16,
      weather_window: 11,
      daylight_margin: 8,
      offline_preparedness: 15,
      fuel_range_margin: 10,
      power_runtime: 10,
      recovery_bailout_access: 11,
      communications_signal_confidence: 6,
    },
    thresholds: {
      ready: 85,
      caution: 63,
    },
    criticalFreshnessSources: [...CORE_FRESHNESS_SOURCES, 'camp', 'power'],
    notes: [
      'Weekend Expedition keeps camp and power high-impact while adding more offline and fuel/range pressure.',
      'It is stricter than a single overnight because delays can stack across multiple days.',
    ],
  },

  // Remote multi-day routes raise the cost of being wrong. Offline prep, recovery,
  // communications, fuel/range, and camp confidence should dominate the final posture.
  remoteExpedition: {
    profile: 'remoteExpedition',
    label: 'Remote Expedition',
    weights: {
      vehicle_fit: 10,
      route_risk: 12,
      camp_legality_confidence: 14,
      weather_window: 9,
      daylight_margin: 6,
      offline_preparedness: 18,
      fuel_range_margin: 12,
      power_runtime: 7,
      recovery_bailout_access: 16,
      communications_signal_confidence: 12,
    },
    thresholds: {
      ready: 86,
      caution: 65,
    },
    criticalFreshnessSources: [...CORE_FRESHNESS_SOURCES, 'camp', 'power', 'telemetry'],
    notes: [
      'Offline, recovery, communications, and fuel/range are high-impact because service and help may be distant.',
      'Ready requires a higher score than the default model because remote trips need stronger margin.',
    ],
  },

  // Recovery and utility routes are task-focused. Camp is usually secondary,
  // while route risk, vehicle fit, bailout access, comms, and offline context need sharper weighting.
  recoveryUtilityRoute: {
    profile: 'recoveryUtilityRoute',
    label: 'Recovery / Utility Route',
    weights: {
      vehicle_fit: 16,
      route_risk: 16,
      camp_legality_confidence: 2,
      weather_window: 10,
      daylight_margin: 8,
      offline_preparedness: 12,
      fuel_range_margin: 10,
      power_runtime: 4,
      recovery_bailout_access: 16,
      communications_signal_confidence: 6,
    },
    thresholds: {
      ready: 84,
      caution: 64,
    },
    criticalFreshnessSources: CORE_FRESHNESS_SOURCES.filter((source) => source !== 'camp'),
    notes: [
      'Recovery / Utility Route emphasizes vehicle capability, route risk, and bailout access over camp planning.',
      'Camp confidence is lightly weighted unless the user also attaches camp candidates.',
    ],
  },

  // Unknown preserves the original ECS baseline so partial integrations remain stable
  // until a screen or adapter can identify the intended trip type.
  unknown: {
    profile: 'unknown',
    label: 'Unknown Trip',
    weights: DEFAULT_EXPEDITION_READINESS_WEIGHTS,
    thresholds: DEFAULT_EXPEDITION_READINESS_THRESHOLDS,
    criticalFreshnessSources: [...CORE_FRESHNESS_SOURCES, 'camp', 'power'],
    notes: [
      'Unknown trip type keeps the original balanced model as the safe default.',
      'Missing camp or power context lowers confidence until ECS can infer or receive a more specific trip profile.',
    ],
  },
};

export const EXPEDITION_TRIP_INTENT_LABELS: Record<ExpeditionTripIntent, string> = {
  unknown: 'Unknown',
  dayTrip: 'Day Trip',
  overnightCamp: 'Overnight Camp',
  weekendExpedition: 'Weekend Expedition',
  remoteExpedition: 'Remote Expedition',
  recoveryUtilityRoute: 'Recovery / Utility Route',
};

export function readinessProfileFromTripIntent(intent: ExpeditionTripIntent): ExpeditionReadinessProfile {
  switch (intent) {
    case 'dayTrip':
      return 'dayTrip';
    case 'overnightCamp':
      return 'overnight';
    case 'weekendExpedition':
      return 'weekendExpedition';
    case 'remoteExpedition':
      return 'remoteExpedition';
    case 'recoveryUtilityRoute':
      return 'recoveryUtilityRoute';
    case 'unknown':
    default:
      return 'unknown';
  }
}

export function getTripIntentLabel(intent: ExpeditionTripIntent): string {
  return EXPEDITION_TRIP_INTENT_LABELS[intent] ?? EXPEDITION_TRIP_INTENT_LABELS.unknown;
}

export function inferExpeditionTripIntent(input: ExpeditionReadinessInput = {}): ExpeditionTripIntent {
  if (input.tripIntent && input.tripIntent !== 'unknown') return input.tripIntent;

  const distanceMiles = input.route?.distanceMiles ?? 0;
  const estimatedDays = Math.max(
    0,
    Number((input.route as any)?.estimatedDays ?? 0),
  );
  const hasCampPlan = (input.campCandidates?.length ?? 0) > 0;
  const recoveryTask =
    input.recovery?.recoveryDifficulty === 'high'
    || input.recovery?.recoveryGearReady === false
    || input.recovery?.bailoutRoutesAvailable === false;
  const remoteSignals =
    input.offline?.isRemoteRoute === true
    || input.recovery?.routeRemoteness === 'high'
    || input.route?.riskLevel === 'high'
    || input.route?.riskLevel === 'critical'
    || input.route?.difficulty === 'hard'
    || input.route?.difficulty === 'technical'
    || input.communications?.signalConfidence === 'low'
    || (input.communications?.cellularExpected === false && input.communications?.satelliteCommsReady !== true)
    || distanceMiles >= 80;

  if (input.readinessProfile === 'recoveryUtilityRoute' || recoveryTask) return 'recoveryUtilityRoute';
  if (input.readinessProfile === 'remoteExpedition' || remoteSignals) return 'remoteExpedition';
  if (input.readinessProfile === 'weekendExpedition' || estimatedDays >= 3 || distanceMiles >= 90) return 'weekendExpedition';
  if (input.readinessProfile === 'overnight' || hasCampPlan || input.power?.powerRelevantForTrip === true || estimatedDays >= 2) return 'overnightCamp';
  if (input.readinessProfile === 'dayTrip' || (input.route && distanceMiles > 0 && distanceMiles <= 35)) return 'dayTrip';
  return 'unknown';
}

export function resolveExpeditionTripIntent(input: ExpeditionReadinessInput = {}): {
  tripIntent: ExpeditionTripIntent;
  tripIntentSource: ExpeditionTripIntentSource;
} {
  if (input.tripIntent && input.tripIntent !== 'unknown') {
    return {
      tripIntent: input.tripIntent,
      tripIntentSource: input.tripIntentSource ?? 'selected',
    };
  }

  const inferred = inferExpeditionTripIntent(input);
  return {
    tripIntent: inferred,
    tripIntentSource: inferred === 'unknown' ? 'unknown' : 'ecs_inferred',
  };
}

export function inferExpeditionReadinessProfile(input: ExpeditionReadinessInput = {}): ExpeditionReadinessProfile {
  const resolvedIntent = resolveExpeditionTripIntent(input);
  if (resolvedIntent.tripIntent !== 'unknown') {
    return readinessProfileFromTripIntent(resolvedIntent.tripIntent);
  }

  if (input.readinessProfile && input.readinessProfile !== 'unknown') return input.readinessProfile;

  const distanceMiles = input.route?.distanceMiles ?? 0;
  const hasCampPlan = (input.campCandidates?.length ?? 0) > 0;
  const remoteSignals =
    input.offline?.isRemoteRoute === true
    || input.recovery?.routeRemoteness === 'high'
    || input.route?.riskLevel === 'high'
    || input.route?.riskLevel === 'critical'
    || input.route?.difficulty === 'hard'
    || input.route?.difficulty === 'technical'
    || input.communications?.signalConfidence === 'low'
    || (input.communications?.cellularExpected === false && input.communications?.satelliteCommsReady !== true)
    || distanceMiles >= 80;

  if (remoteSignals) return 'remoteExpedition';
  if (hasCampPlan || input.power?.powerRelevantForTrip === true) return 'overnight';
  if (input.route && distanceMiles > 0 && distanceMiles <= 35) return 'dayTrip';
  return 'unknown';
}

export function resolveExpeditionReadinessCalibration(
  input: ExpeditionReadinessInput = {},
): ExpeditionReadinessCalibration {
  return EXPEDITION_READINESS_CALIBRATIONS[inferExpeditionReadinessProfile(input)];
}
