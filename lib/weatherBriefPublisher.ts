import type { ECSWeatherSnapshot } from './ecsWeather';
import { recordBriefCadEntry, type BriefCadSourceMessage } from './briefCadLogStore';
import {
  buildSharedWeatherBriefAdvisories,
  type SharedWeatherBriefAdvisory,
} from './weatherBriefAdvisoryEngine';
import { operationalWeatherAdvisoryLedger } from './weatherAdvisoryPublicationLedger';

export const SHARED_WEATHER_BRIEF_COOLDOWN_MS = 30 * 60 * 1000;

export type SharedWeatherBriefPublishResult = {
  emitted: number;
  suppressed: number;
  advisories: SharedWeatherBriefAdvisory[];
};

function priorityForSeverity(severity: SharedWeatherBriefAdvisory['severity']): number {
  switch (severity) {
    case 'critical':
      return 1;
    case 'warning':
      return 2;
    case 'watch':
      return 3;
    case 'info':
    default:
      return 4;
  }
}

function modeForSeverity(severity: SharedWeatherBriefAdvisory['severity']): BriefCadSourceMessage['mode'] {
  return severity === 'critical' || severity === 'warning' ? 'alert' : 'advisory';
}

function toBriefMessage(
  advisory: SharedWeatherBriefAdvisory,
  now: number,
  cooldownMs: number,
): BriefCadSourceMessage {
  return {
    id: [
      'shared-weather',
      advisory.kind,
      advisory.locationKey,
      advisory.severity,
      Math.floor(now / cooldownMs),
    ].join(':'),
    text: advisory.message,
    mode: modeForSeverity(advisory.severity),
    priority: priorityForSeverity(advisory.severity),
    queuedAt: now,
    title: advisory.title,
    recommendedAction: advisory.recommendedAction,
    source: 'ecs-shared-weather',
    severity: advisory.severity,
    eventType: `shared_weather_${advisory.kind}`,
    confidence: advisory.confidence,
    expiresAt: advisory.expiresAt,
  };
}

export function publishSharedWeatherBriefAdvisories(
  snapshot: ECSWeatherSnapshot | null | undefined,
  options?: {
    now?: number;
    cooldownMs?: number;
  },
): SharedWeatherBriefPublishResult {
  const now = Number.isFinite(options?.now) ? Number(options?.now) : Date.now();
  const cooldownMs = Number.isFinite(options?.cooldownMs)
    ? Math.max(60_000, Number(options?.cooldownMs))
    : SHARED_WEATHER_BRIEF_COOLDOWN_MS;
  const advisories = buildSharedWeatherBriefAdvisories(snapshot);
  let emitted = 0;
  let suppressed = 0;

  for (const advisory of advisories) {
    const decision = operationalWeatherAdvisoryLedger.evaluate({
      namespace: 'shared-weather-brief',
      scopeKey: advisory.advisoryKey,
      severity: advisory.severity,
      fingerprint: advisory.message,
      publishedAt: now,
      dedupeWindowMs: cooldownMs,
    });
    if (decision === 'duplicate_suppressed') {
      suppressed += 1;
      continue;
    }

    recordBriefCadEntry(toBriefMessage(advisory, now, cooldownMs));
    emitted += 1;
  }

  return { emitted, suppressed, advisories };
}

export function resetSharedWeatherBriefPublisherForTests(): void {
  operationalWeatherAdvisoryLedger.clear('shared-weather-brief');
}
