// /lib/ai/signalProcessor.ts

export type SignalType =
  | 'WEATHER_CHANGE'
  | 'WEATHER_ESCALATION'
  | 'VEHICLE_STRESS'
  | 'VEHICLE_CRITICAL'
  | 'ROUTE_DEVIATION'
  | 'ROUTE_DELAY'
  | 'REMOTENESS_SPIKE'
  | 'RESOURCE_WARNING'
  | 'RESOURCE_CRITICAL'
  | 'MISSION_STATE_CHANGE'
  | 'CHECKPOINT_REACHED'
  | 'GENERAL_WARNING';

export type SignalSeverity = 1 | 2 | 3;

export type SignalSource =
  | 'weather'
  | 'vehicle'
  | 'route'
  | 'resources'
  | 'mission'
  | 'system';

export type SignalStatus = 'active' | 'suppressed';

export type Signal = {
  id: string;
  type: SignalType;
  source: SignalSource;
  severity: SignalSeverity;
  priority: number;
  title: string;
  message: string;
  status: SignalStatus;
  createdAt: number;
  cooldownMs: number;
  fingerprint: string;
  meta?: Record<string, unknown>;
};

export type MissionStatus = 'idle' | 'active' | 'paused' | 'complete';

export type AIContext = {
  timestamp?: number;

  mission?: {
    status?: MissionStatus;
    progress?: number; // 0..1
    checkpointName?: string | null;
  };

  vehicle?: {
    healthScore?: number | null; // 0..100
    payloadMargin?: number | null; // lbs remaining
    fuelPercent?: number | null; // 0..100
    batteryPercent?: number | null; // 0..100
    coolantTempF?: number | null;
    oilTempF?: number | null;
    tirePressureLow?: boolean | null;
    checkEngine?: boolean | null;
  };

  environment?: {
    weatherSeverity?: number | null; // 0..3
    windMph?: number | null;
    visibilityMiles?: number | null;
    precipitationIntensity?: number | null; // 0..1+
    temperatureF?: number | null;
    remotenessScore?: number | null; // 0..100
    alertsCount?: number | null;
  };

  route?: {
    distanceRemainingMiles?: number | null;
    etaMinutes?: number | null;
    offRouteMiles?: number | null;
    bailoutOptions?: number | null;
    hazardAhead?: boolean | null;
    nextHazardDistanceMiles?: number | null;
  };

  resources?: {
    fuelRangeMiles?: number | null;
    waterPercent?: number | null;
    foodPercent?: number | null;
    powerPercent?: number | null;
  };
};

export type ProcessorMemory = {
  lastRunAt: number | null;
  previousContext: AIContext | null;
  lastMissionStatus: MissionStatus | null;
  lastCheckpointName: string | null;
  lastFingerprints: Record<string, number>;
};

export type SignalProcessorOptions = {
  minRunIntervalMs: number;
  dedupeWindowMs: number;
  defaultCooldownMs: number;

  weatherEscalationDelta: number;
  routeDeviationMiles: number;
  routeDelayMinutes: number;
  remotenessSpikeDelta: number;

  weatherSeverityHigh: number;
  healthScoreWarning: number;
  healthScoreCritical: number;
  payloadMarginLow: number;
  payloadMarginCritical: number;

  fuelRangeWarningMiles: number;
  fuelRangeCriticalMiles: number;
  powerWarningPercent: number;
  powerCriticalPercent: number;
  waterWarningPercent: number;
  waterCriticalPercent: number;
};

export type ProcessSignalResult = {
  signals: Signal[];
  suppressed: Signal[];
  memory: ProcessorMemory;
};

export const DEFAULT_SIGNAL_PROCESSOR_OPTIONS: SignalProcessorOptions = {
  minRunIntervalMs: 4_000,
  dedupeWindowMs: 90_000,
  defaultCooldownMs: 180_000,

  weatherEscalationDelta: 1,
  routeDeviationMiles: 0.35,
  routeDelayMinutes: 20,
  remotenessSpikeDelta: 20,

  weatherSeverityHigh: 2,
  healthScoreWarning: 65,
  healthScoreCritical: 40,
  payloadMarginLow: 250,
  payloadMarginCritical: 0,

  fuelRangeWarningMiles: 60,
  fuelRangeCriticalMiles: 25,
  powerWarningPercent: 30,
  powerCriticalPercent: 15,
  waterWarningPercent: 35,
  waterCriticalPercent: 15,
};

export function createInitialProcessorMemory(): ProcessorMemory {
  return {
    lastRunAt: null,
    previousContext: null,
    lastMissionStatus: null,
    lastCheckpointName: null,
    lastFingerprints: {},
  };
}

export function processSignals(
  context: AIContext,
  memory: ProcessorMemory = createInitialProcessorMemory(),
  options: Partial<SignalProcessorOptions> = {},
): ProcessSignalResult {
  const config: SignalProcessorOptions = {
    ...DEFAULT_SIGNAL_PROCESSOR_OPTIONS,
    ...options,
  };

  const now = normalizeTimestamp(context.timestamp);

  if (
    memory.lastRunAt &&
    now - memory.lastRunAt < config.minRunIntervalMs
  ) {
    return {
      signals: [],
      suppressed: [],
      memory: {
        ...memory,
        lastRunAt: now,
        previousContext: context,
      },
    };
  }

  const previous = memory.previousContext;
  const candidateSignals: Signal[] = [];

  collectMissionSignals(candidateSignals, context, previous, now, config, memory);
  collectWeatherSignals(candidateSignals, context, previous, now, config);
  collectVehicleSignals(candidateSignals, context, previous, now, config);
  collectRouteSignals(candidateSignals, context, previous, now, config);
  collectResourceSignals(candidateSignals, context, previous, now, config);

  const { active, suppressed, lastFingerprints } = applySuppression(
    candidateSignals,
    memory.lastFingerprints,
    now,
    config,
  );

  const nextMemory: ProcessorMemory = {
    lastRunAt: now,
    previousContext: context,
    lastMissionStatus: context.mission?.status ?? memory.lastMissionStatus ?? null,
    lastCheckpointName: context.mission?.checkpointName ?? memory.lastCheckpointName ?? null,
    lastFingerprints,
  };

  return {
    signals: sortSignals(active),
    suppressed: sortSignals(suppressed),
    memory: nextMemory,
  };
}

// ─────────────────────────────────────────────────────────────
// Signal collectors
// ─────────────────────────────────────────────────────────────

function collectMissionSignals(
  out: Signal[],
  context: AIContext,
  previous: AIContext | null,
  now: number,
  config: SignalProcessorOptions,
  memory: ProcessorMemory,
) {
  const currentStatus = context.mission?.status;
  const previousStatus =
    previous?.mission?.status ?? memory.lastMissionStatus ?? null;

  if (currentStatus && previousStatus && currentStatus !== previousStatus) {
    out.push(
      makeSignal({
        type: 'MISSION_STATE_CHANGE',
        source: 'mission',
        severity:
          currentStatus === 'active'
            ? 1
            : currentStatus === 'paused'
            ? 2
            : 1,
        priority: currentStatus === 'paused' ? 82 : 52,
        title: `MISSION ${currentStatus.toUpperCase()}`,
        message: buildMissionStateMessage(previousStatus, currentStatus),
        now,
        cooldownMs: config.defaultCooldownMs,
        meta: {
          previousStatus,
          currentStatus,
        },
      }),
    );
  }

  const checkpoint = safeString(context.mission?.checkpointName);
  const previousCheckpoint =
    safeString(previous?.mission?.checkpointName) ||
    safeString(memory.lastCheckpointName);

  if (checkpoint && checkpoint !== previousCheckpoint) {
    out.push(
      makeSignal({
        type: 'CHECKPOINT_REACHED',
        source: 'mission',
        severity: 1,
        priority: 40,
        title: 'CHECKPOINT REACHED',
        message: `${checkpoint} reached. Continue mission progression.`,
        now,
        cooldownMs: 120_000,
        meta: { checkpoint },
      }),
    );
  }
}

function collectWeatherSignals(
  out: Signal[],
  context: AIContext,
  previous: AIContext | null,
  now: number,
  config: SignalProcessorOptions,
) {
  const weatherSeverity = toNumber(context.environment?.weatherSeverity);
  const prevWeatherSeverity = toNumber(previous?.environment?.weatherSeverity);

  const wind = toNumber(context.environment?.windMph);
  const visibility = toNumber(context.environment?.visibilityMiles);
  const alertsCount = toNumber(context.environment?.alertsCount);

  if (
    weatherSeverity != null &&
    prevWeatherSeverity != null &&
    weatherSeverity - prevWeatherSeverity >= config.weatherEscalationDelta &&
    weatherSeverity >= config.weatherSeverityHigh
  ) {
    out.push(
      makeSignal({
        type: 'WEATHER_ESCALATION',
        source: 'weather',
        severity: clampSeverity(weatherSeverity),
        priority: 95,
        title: 'WEATHER ESCALATION',
        message: buildWeatherEscalationMessage(weatherSeverity, wind, visibility),
        now,
        cooldownMs: 300_000,
        meta: {
          previousSeverity: prevWeatherSeverity,
          currentSeverity: weatherSeverity,
          wind,
          visibility,
        },
      }),
    );
  } else if (
    weatherSeverity != null &&
    prevWeatherSeverity != null &&
    weatherSeverity !== prevWeatherSeverity
  ) {
    out.push(
      makeSignal({
        type: 'WEATHER_CHANGE',
        source: 'weather',
        severity: clampSeverity(Math.max(weatherSeverity, 1)),
        priority: 60,
        title: 'WEATHER CHANGE',
        message: buildWeatherChangeMessage(weatherSeverity, wind, visibility, alertsCount),
        now,
        cooldownMs: 180_000,
        meta: {
          previousSeverity: prevWeatherSeverity,
          currentSeverity: weatherSeverity,
        },
      }),
    );
  }

  if (
    visibility != null &&
    visibility <= 1
  ) {
    out.push(
      makeSignal({
        type: 'WEATHER_ESCALATION',
        source: 'weather',
        severity: 3,
        priority: 96,
        title: 'LOW VISIBILITY',
        message: `Visibility reduced to ${formatNumber(visibility, 1)} mile${visibility === 1 ? '' : 's'}. Slow movement advised.`,
        now,
        cooldownMs: 240_000,
        meta: { visibility },
      }),
    );
  }

  if (wind != null && wind >= 35) {
    out.push(
      makeSignal({
        type: 'WEATHER_CHANGE',
        source: 'weather',
        severity: wind >= 50 ? 3 : 2,
        priority: wind >= 50 ? 92 : 72,
        title: 'HIGH WIND CONDITIONS',
        message: `Sustained wind at ${Math.round(wind)} MPH may impact vehicle stability and route comfort.`,
        now,
        cooldownMs: 240_000,
        meta: { wind },
      }),
    );
  }
}

function collectVehicleSignals(
  out: Signal[],
  context: AIContext,
  previous: AIContext | null,
  now: number,
  config: SignalProcessorOptions,
) {
  const healthScore = toNumber(context.vehicle?.healthScore);
  const payloadMargin = toNumber(context.vehicle?.payloadMargin);
  const checkEngine = !!context.vehicle?.checkEngine;
  const tirePressureLow = !!context.vehicle?.tirePressureLow;
  const coolantTempF = toNumber(context.vehicle?.coolantTempF);
  const oilTempF = toNumber(context.vehicle?.oilTempF);

  const prevHealthScore = toNumber(previous?.vehicle?.healthScore);

  if (healthScore != null) {
    if (healthScore <= config.healthScoreCritical) {
      out.push(
        makeSignal({
          type: 'VEHICLE_CRITICAL',
          source: 'vehicle',
          severity: 3,
          priority: 97,
          title: 'VEHICLE STATUS CRITICAL',
          message: `Vehicle health score dropped to ${Math.round(healthScore)}. Immediate mechanical review recommended.`,
          now,
          cooldownMs: 300_000,
          meta: { healthScore },
        }),
      );
    } else if (healthScore <= config.healthScoreWarning) {
      const meaningfulDrop =
        prevHealthScore == null || prevHealthScore - healthScore >= 5;

      if (meaningfulDrop) {
        out.push(
          makeSignal({
            type: 'VEHICLE_STRESS',
            source: 'vehicle',
            severity: 2,
            priority: 78,
            title: 'VEHICLE STRESS DETECTED',
            message: `Vehicle health score is ${Math.round(healthScore)}. Monitor systems and reduce strain if terrain worsens.`,
            now,
            cooldownMs: 240_000,
            meta: {
              healthScore,
              previousHealthScore: prevHealthScore,
            },
          }),
        );
      }
    }
  }

  if (payloadMargin != null) {
    if (payloadMargin <= config.payloadMarginCritical) {
      out.push(
        makeSignal({
          type: 'VEHICLE_CRITICAL',
          source: 'vehicle',
          severity: 3,
          priority: 94,
          title: 'PAYLOAD LIMIT EXCEEDED',
          message: `Payload margin is ${Math.round(payloadMargin)} lb. Vehicle load is at or beyond safe threshold.`,
          now,
          cooldownMs: 300_000,
          meta: { payloadMargin },
        }),
      );
    } else if (payloadMargin <= config.payloadMarginLow) {
      out.push(
        makeSignal({
          type: 'VEHICLE_STRESS',
          source: 'vehicle',
          severity: 2,
          priority: 70,
          title: 'LOW PAYLOAD MARGIN',
          message: `Only ${Math.round(payloadMargin)} lb of payload margin remains.`,
          now,
          cooldownMs: 240_000,
          meta: { payloadMargin },
        }),
      );
    }
  }

  if (checkEngine) {
    out.push(
      makeSignal({
        type: 'VEHICLE_CRITICAL',
        source: 'vehicle',
        severity: 3,
        priority: 98,
        title: 'CHECK ENGINE INDICATOR',
        message: 'Engine management warning detected. Verify telemetry and assess whether to continue.',
        now,
        cooldownMs: 300_000,
        meta: { checkEngine: true },
      }),
    );
  }

  if (tirePressureLow) {
    out.push(
      makeSignal({
        type: 'VEHICLE_STRESS',
        source: 'vehicle',
        severity: 2,
        priority: 76,
        title: 'LOW TIRE PRESSURE',
        message: 'One or more tires report low pressure. Reassess terrain speed and inspect when safe.',
        now,
        cooldownMs: 180_000,
        meta: { tirePressureLow: true },
      }),
    );
  }

  if (coolantTempF != null && coolantTempF >= 245) {
    out.push(
      makeSignal({
        type: 'VEHICLE_CRITICAL',
        source: 'vehicle',
        severity: 3,
        priority: 96,
        title: 'COOLANT TEMPERATURE HIGH',
        message: `Coolant temperature at ${Math.round(coolantTempF)}°F. Immediate cooling action advised.`,
        now,
        cooldownMs: 300_000,
        meta: { coolantTempF },
      }),
    );
  }

  if (oilTempF != null && oilTempF >= 285) {
    out.push(
      makeSignal({
        type: 'VEHICLE_STRESS',
        source: 'vehicle',
        severity: 2,
        priority: 79,
        title: 'OIL TEMPERATURE ELEVATED',
        message: `Oil temperature at ${Math.round(oilTempF)}°F. Sustained load may be too high.`,
        now,
        cooldownMs: 240_000,
        meta: { oilTempF },
      }),
    );
  }
}

function collectRouteSignals(
  out: Signal[],
  context: AIContext,
  previous: AIContext | null,
  now: number,
  config: SignalProcessorOptions,
) {
  const offRouteMiles = toNumber(context.route?.offRouteMiles);
  const etaMinutes = toNumber(context.route?.etaMinutes);
  const prevEtaMinutes = toNumber(previous?.route?.etaMinutes);

  const remotenessScore = toNumber(context.environment?.remotenessScore);
  const prevRemotenessScore = toNumber(previous?.environment?.remotenessScore);

  const bailoutOptions = toNumber(context.route?.bailoutOptions);
  const hazardAhead = !!context.route?.hazardAhead;
  const nextHazardDistanceMiles = toNumber(context.route?.nextHazardDistanceMiles);

  if (offRouteMiles != null && offRouteMiles >= config.routeDeviationMiles) {
    out.push(
      makeSignal({
        type: 'ROUTE_DEVIATION',
        source: 'route',
        severity: offRouteMiles >= 1 ? 3 : 2,
        priority: offRouteMiles >= 1 ? 90 : 74,
        title: 'OFF ROUTE',
        message: `Route deviation detected at ${formatNumber(offRouteMiles, 2)} miles from course.`,
        now,
        cooldownMs: 180_000,
        meta: { offRouteMiles },
      }),
    );
  }

  if (
    etaMinutes != null &&
    prevEtaMinutes != null &&
    etaMinutes - prevEtaMinutes >= config.routeDelayMinutes
  ) {
    out.push(
      makeSignal({
        type: 'ROUTE_DELAY',
        source: 'route',
        severity: etaMinutes - prevEtaMinutes >= 45 ? 3 : 2,
        priority: 68,
        title: 'ROUTE DELAY INCREASING',
        message: `Estimated delay increased by ${Math.round(etaMinutes - prevEtaMinutes)} minutes.`,
        now,
        cooldownMs: 180_000,
        meta: {
          previousEtaMinutes: prevEtaMinutes,
          currentEtaMinutes: etaMinutes,
        },
      }),
    );
  }

  if (
    remotenessScore != null &&
    prevRemotenessScore != null &&
    remotenessScore - prevRemotenessScore >= config.remotenessSpikeDelta
  ) {
    out.push(
      makeSignal({
        type: 'REMOTENESS_SPIKE',
        source: 'route',
        severity: remotenessScore >= 80 ? 3 : 2,
        priority: remotenessScore >= 80 ? 88 : 66,
        title: 'REMOTENESS INCREASING',
        message: buildRemotenessMessage(remotenessScore, bailoutOptions),
        now,
        cooldownMs: 240_000,
        meta: {
          previousRemotenessScore: prevRemotenessScore,
          currentRemotenessScore: remotenessScore,
          bailoutOptions,
        },
      }),
    );
  }

  if (hazardAhead) {
    out.push(
      makeSignal({
        type: 'GENERAL_WARNING',
        source: 'route',
        severity: nextHazardDistanceMiles != null && nextHazardDistanceMiles <= 2 ? 3 : 2,
        priority: 75,
        title: 'HAZARD AHEAD',
        message:
          nextHazardDistanceMiles != null
            ? `Hazard identified ${formatNumber(nextHazardDistanceMiles, 1)} miles ahead on route corridor.`
            : 'Hazard identified ahead on current route corridor.',
        now,
        cooldownMs: 180_000,
        meta: { nextHazardDistanceMiles },
      }),
    );
  }
}

function collectResourceSignals(
  out: Signal[],
  context: AIContext,
  _previous: AIContext | null,
  now: number,
  config: SignalProcessorOptions,
) {
  const fuelRangeMiles =
    toNumber(context.resources?.fuelRangeMiles) ??
    estimateFuelRangeFromContext(context);

  const powerPercent =
    toNumber(context.resources?.powerPercent) ??
    toNumber(context.vehicle?.batteryPercent);

  const waterPercent = toNumber(context.resources?.waterPercent);

  if (fuelRangeMiles != null) {
    if (fuelRangeMiles <= config.fuelRangeCriticalMiles) {
      out.push(
        makeSignal({
          type: 'RESOURCE_CRITICAL',
          source: 'resources',
          severity: 3,
          priority: 93,
          title: 'FUEL RANGE CRITICAL',
          message: `Estimated fuel range is ${Math.round(fuelRangeMiles)} miles. Resupply action recommended immediately.`,
          now,
          cooldownMs: 300_000,
          meta: { fuelRangeMiles },
        }),
      );
    } else if (fuelRangeMiles <= config.fuelRangeWarningMiles) {
      out.push(
        makeSignal({
          type: 'RESOURCE_WARNING',
          source: 'resources',
          severity: 2,
          priority: 71,
          title: 'FUEL RANGE LOW',
          message: `Estimated fuel range is ${Math.round(fuelRangeMiles)} miles.`,
          now,
          cooldownMs: 240_000,
          meta: { fuelRangeMiles },
        }),
      );
    }
  }

  if (powerPercent != null) {
    if (powerPercent <= config.powerCriticalPercent) {
      out.push(
        makeSignal({
          type: 'RESOURCE_CRITICAL',
          source: 'resources',
          severity: 3,
          priority: 84,
          title: 'POWER RESERVE CRITICAL',
          message: `Power reserve is at ${Math.round(powerPercent)}%.`,
          now,
          cooldownMs: 240_000,
          meta: { powerPercent },
        }),
      );
    } else if (powerPercent <= config.powerWarningPercent) {
      out.push(
        makeSignal({
          type: 'RESOURCE_WARNING',
          source: 'resources',
          severity: 2,
          priority: 62,
          title: 'POWER RESERVE LOW',
          message: `Power reserve is at ${Math.round(powerPercent)}%.`,
          now,
          cooldownMs: 180_000,
          meta: { powerPercent },
        }),
      );
    }
  }

  if (waterPercent != null) {
    if (waterPercent <= config.waterCriticalPercent) {
      out.push(
        makeSignal({
          type: 'RESOURCE_CRITICAL',
          source: 'resources',
          severity: 3,
          priority: 86,
          title: 'WATER RESERVE CRITICAL',
          message: `Water reserve is at ${Math.round(waterPercent)}%.`,
          now,
          cooldownMs: 300_000,
          meta: { waterPercent },
        }),
      );
    } else if (waterPercent <= config.waterWarningPercent) {
      out.push(
        makeSignal({
          type: 'RESOURCE_WARNING',
          source: 'resources',
          severity: 2,
          priority: 64,
          title: 'WATER RESERVE LOW',
          message: `Water reserve is at ${Math.round(waterPercent)}%.`,
          now,
          cooldownMs: 180_000,
          meta: { waterPercent },
        }),
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Suppression / dedupe
// ─────────────────────────────────────────────────────────────

function applySuppression(
  candidates: Signal[],
  lastFingerprints: Record<string, number>,
  now: number,
  config: SignalProcessorOptions,
) {
  const active: Signal[] = [];
  const suppressed: Signal[] = [];
  const nextFingerprints = { ...lastFingerprints };

  for (const signal of candidates) {
    const lastSeen = nextFingerprints[signal.fingerprint];
    const windowMs = Math.max(signal.cooldownMs, config.dedupeWindowMs);

    if (lastSeen && now - lastSeen < windowMs) {
      suppressed.push({
        ...signal,
        status: 'suppressed',
      });
      continue;
    }

    active.push(signal);
    nextFingerprints[signal.fingerprint] = now;
  }

  purgeOldFingerprints(nextFingerprints, now, 24 * 60 * 60 * 1000);

  return {
    active,
    suppressed,
    lastFingerprints: nextFingerprints,
  };
}

function purgeOldFingerprints(store: Record<string, number>, now: number, maxAgeMs: number) {
  for (const key of Object.keys(store)) {
    if (now - store[key] > maxAgeMs) {
      delete store[key];
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Builders
// ─────────────────────────────────────────────────────────────

type MakeSignalInput = {
  type: SignalType;
  source: SignalSource;
  severity: SignalSeverity;
  priority: number;
  title: string;
  message: string;
  now: number;
  cooldownMs: number;
  meta?: Record<string, unknown>;
};

function makeSignal(input: MakeSignalInput): Signal {
  const fingerprint = buildFingerprint(
    input.type,
    input.source,
    input.title,
    input.message,
    input.meta,
  );

  return {
    id: `${input.type}_${input.now}_${hashString(fingerprint)}`,
    type: input.type,
    source: input.source,
    severity: input.severity,
    priority: input.priority,
    title: input.title,
    message: input.message,
    status: 'active',
    createdAt: input.now,
    cooldownMs: input.cooldownMs,
    fingerprint,
    meta: input.meta,
  };
}

function buildFingerprint(
  type: SignalType,
  source: SignalSource,
  title: string,
  message: string,
  meta?: Record<string, unknown>,
) {
  const metaKey = meta ? stableStringify(meta) : '';
  return `${type}|${source}|${title}|${message}|${metaKey}`;
}

// ─────────────────────────────────────────────────────────────
// Message helpers
// ─────────────────────────────────────────────────────────────

function buildMissionStateMessage(previousStatus: MissionStatus, currentStatus: MissionStatus) {
  return `Mission state changed from ${previousStatus.toUpperCase()} to ${currentStatus.toUpperCase()}.`;
}

function buildWeatherEscalationMessage(
  weatherSeverity: number,
  wind: number | null,
  visibility: number | null,
) {
  const parts: string[] = [
    `Conditions escalated to severity ${Math.round(weatherSeverity)}.`,
  ];

  if (wind != null) parts.push(`Wind ${Math.round(wind)} MPH.`);
  if (visibility != null) parts.push(`Visibility ${formatNumber(visibility, 1)} mi.`);

  return parts.join(' ');
}

function buildWeatherChangeMessage(
  weatherSeverity: number,
  wind: number | null,
  visibility: number | null,
  alertsCount: number | null,
) {
  const parts: string[] = [
    `Weather profile changed. Current severity ${Math.round(weatherSeverity)}.`,
  ];

  if (alertsCount != null && alertsCount > 0) {
    parts.push(`${Math.round(alertsCount)} active alert${alertsCount === 1 ? '' : 's'}.`);
  }
  if (wind != null) parts.push(`Wind ${Math.round(wind)} MPH.`);
  if (visibility != null) parts.push(`Visibility ${formatNumber(visibility, 1)} mi.`);

  return parts.join(' ');
}

function buildRemotenessMessage(remotenessScore: number, bailoutOptions: number | null) {
  if (bailoutOptions != null) {
    return `Remoteness score increased to ${Math.round(remotenessScore)}. ${Math.round(
      bailoutOptions,
    )} bailout option${bailoutOptions === 1 ? '' : 's'} currently available.`;
  }

  return `Remoteness score increased to ${Math.round(remotenessScore)}.`;
}

// ─────────────────────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────────────────────

function sortSignals(signals: Signal[]) {
  return [...signals].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (b.severity !== a.severity) return b.severity - a.severity;
    return b.createdAt - a.createdAt;
  });
}

function clampSeverity(value: number): SignalSeverity {
  if (value >= 3) return 3;
  if (value <= 1) return 1;
  return 2;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function safeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function formatNumber(value: number, decimals = 0) {
  return value.toFixed(decimals);
}

function normalizeTimestamp(timestamp?: number) {
  return typeof timestamp === 'number' && Number.isFinite(timestamp)
    ? timestamp
    : Date.now();
}

function estimateFuelRangeFromContext(context: AIContext): number | null {
  const fuelPercent = toNumber(context.vehicle?.fuelPercent);
  const distanceRemaining = toNumber(context.route?.distanceRemainingMiles);

  if (fuelPercent == null || distanceRemaining == null) return null;
  if (fuelPercent <= 0) return 0;

  // Conservative placeholder estimate:
  // enough to let the signal layer still function until a real fuel model is wired.
  return (fuelPercent / 100) * Math.max(distanceRemaining * 1.5, 150);
}

function stableStringify(value: unknown): string {
  if (value == null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

function hashString(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}