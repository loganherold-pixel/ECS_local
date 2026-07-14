import type { RemoteWeatherBriefEvent, RemoteWeatherHazardType } from '../ai/ecsBriefTypes';
import { recordRemoteWeatherBriefEvent } from '../briefCadLogStore';
import { operationalWeatherAdvisoryLedger } from '../weatherAdvisoryPublicationLedger';
import type { RemoteWeatherHazardOutput } from './remoteWeatherHazardEngine';

export const REMOTE_WEATHER_BRIEF_DEDUPE_WINDOW_MS = 15 * 60 * 1000;

export type RemoteWeatherBriefPublisherInput = {
  hazard: RemoteWeatherHazardOutput;
  routeId?: string;
  segmentId?: string;
  remotenessScore?: number;
  routeConfidence?: number;
  weatherRisk?: number;
  distanceAheadMi?: number;
  etaMinutes?: number;
  createdAt?: number;
  expiresAt?: number;
  userGenerated?: boolean;
};

export type RemoteWeatherBriefPublishResult = {
  emitted: boolean;
  reason:
    | 'emitted'
    | 'not_applicable'
    | 'duplicate_suppressed'
    | 'severity_escalation'
    | 'meaningful_change';
  event?: RemoteWeatherBriefEvent;
};

const TITLE_BY_TYPE: Record<RemoteWeatherHazardType, string> = {
  remote_weather_exposure: 'REMOTE WEATHER EXPOSURE',
  remote_signal_loss: 'SIGNAL LOSS AHEAD',
  remote_fire_smoke: 'FIRE/SMOKE RISK AHEAD',
  remote_flood_risk: 'FLOOD RISK AHEAD',
  remote_wind_exposure: 'REMOTE WIND EXPOSURE',
  remote_snow_ice: 'SNOW/ICE RISK AHEAD',
  remote_heat_risk: 'REMOTE HEAT RISK',
  remote_bailout_gap: 'REMOTE BAILOUT GAP',
  offline_readiness_gap: 'OFFLINE READINESS GAP',
};

function cleanKey(value: string | undefined, fallback: string): string {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function normalizeText(value: string | undefined): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s.%/-]/g, '')
    .trim();
}

function routeScopeKey(input: Pick<RemoteWeatherBriefPublisherInput, 'hazard' | 'routeId' | 'segmentId'>): string {
  return [
    input.hazard.type,
    cleanKey(input.routeId, 'no_route'),
    cleanKey(input.segmentId, 'no_segment'),
  ].join('|');
}

function messageFingerprint(input: RemoteWeatherBriefPublisherInput): string {
  return [
    normalizeText(input.hazard.message),
    normalizeText(input.hazard.recommendedAction),
    Number.isFinite(input.routeConfidence) ? `route:${Math.round(Number(input.routeConfidence))}` : '',
    Number.isFinite(input.weatherRisk) ? `weather:${Number(input.weatherRisk).toFixed(2)}` : '',
    Number.isFinite(input.distanceAheadMi) ? `distance:${Number(input.distanceAheadMi).toFixed(1)}` : '',
  ].filter(Boolean).join('|');
}

function shouldEmitRemoteWeatherBriefEvent(
  input: RemoteWeatherBriefPublisherInput,
  now: number,
): RemoteWeatherBriefPublishResult['reason'] {
  if (!input.hazard.shouldEmit) return 'not_applicable';
  return operationalWeatherAdvisoryLedger.evaluate({
    namespace: 'remote-weather-brief',
    scopeKey: routeScopeKey(input),
    severity: input.hazard.severity,
    fingerprint: messageFingerprint(input),
    publishedAt: now,
    dedupeWindowMs: REMOTE_WEATHER_BRIEF_DEDUPE_WINDOW_MS,
    bypassDedupe: input.userGenerated,
  });
}

function formatDistance(value: number | undefined): string | null {
  if (!Number.isFinite(value)) return null;
  const miles = Math.max(0, Number(value));
  if (miles < 1) return '<1 mi ahead';
  if (miles < 10) return `${miles.toFixed(1)} mi ahead`;
  return `${Math.round(miles)} mi ahead`;
}

function formatMessage(input: RemoteWeatherBriefPublisherInput): string {
  const parts = [input.hazard.message];
  const distance = formatDistance(input.distanceAheadMi);
  if (distance && !input.hazard.message.toLowerCase().includes('ahead')) {
    parts.push(distance);
  }
  if (Number.isFinite(input.routeConfidence)) {
    parts.push(`Route confidence reduced to ${Math.round(Number(input.routeConfidence))}%.`);
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function buildEvent(input: RemoteWeatherBriefPublisherInput, now: number): RemoteWeatherBriefEvent {
  const title = TITLE_BY_TYPE[input.hazard.type] ?? input.hazard.title.toUpperCase();
  return {
    id: [
      'remote-weather',
      input.hazard.type,
      cleanKey(input.routeId, 'route'),
      cleanKey(input.segmentId, 'segment'),
      input.hazard.severity,
      Math.floor(now / REMOTE_WEATHER_BRIEF_DEDUPE_WINDOW_MS),
    ].join(':'),
    type: input.hazard.type,
    severity: input.hazard.severity,
    title,
    message: formatMessage(input),
    routeId: input.routeId,
    segmentId: input.segmentId,
    confidence: input.hazard.confidence,
    remotenessScore: input.remotenessScore,
    routeConfidence: input.routeConfidence,
    weatherRisk: input.weatherRisk,
    distanceAheadMi: input.distanceAheadMi,
    etaMinutes: input.etaMinutes,
    recommendedAction: input.hazard.recommendedAction,
    createdAt: now,
    expiresAt: input.expiresAt,
    source: 'ecs-remote-weather',
  };
}

export function publishRemoteWeatherBriefEvent(
  input: RemoteWeatherBriefPublisherInput,
): RemoteWeatherBriefPublishResult {
  const now = Number.isFinite(input.createdAt) ? Number(input.createdAt) : Date.now();
  const reason = shouldEmitRemoteWeatherBriefEvent(input, now);
  if (reason === 'not_applicable' || reason === 'duplicate_suppressed') {
    return { emitted: false, reason };
  }

  const event = buildEvent(input, now);
  recordRemoteWeatherBriefEvent(event);

  return { emitted: true, reason, event };
}

export function resetRemoteWeatherBriefPublisherForTests(): void {
  operationalWeatherAdvisoryLedger.clear('remote-weather-brief');
}
