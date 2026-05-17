const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const ecsBriefTypes = read('lib', 'ai', 'ecsBriefTypes.ts');
const briefStore = read('lib', 'briefCadLogStore.ts');
const advisoryStore = read('lib', 'advisoryStore.ts');
const cadLog = read('components', 'dashboard', 'MissionBriefCadLog.tsx');

for (const snippet of [
  "export type ECSBriefSeverity = 'info' | 'watch' | 'warning' | 'critical'",
  "remote_weather_exposure",
  "remote_signal_loss",
  "remote_fire_smoke",
  "remote_flood_risk",
  "remote_wind_exposure",
  "remote_snow_ice",
  "remote_heat_risk",
  "remote_bailout_gap",
  "offline_readiness_gap",
  "source: 'ecs-remote-weather'",
  "export type RemoteWeatherBriefEvent",
]) {
  assert.ok(ecsBriefTypes.includes(snippet), `ECS Brief remote weather type contract missing ${snippet}`);
}

for (const field of [
  'routeId?: string',
  'segmentId?: string',
  'confidence: number',
  'remotenessScore?: number',
  'routeConfidence?: number',
  'weatherRisk?: number',
  'distanceAheadMi?: number',
  'etaMinutes?: number',
  'recommendedAction?: string',
  'createdAt: number',
  'expiresAt?: number',
]) {
  assert.ok(ecsBriefTypes.includes(field), `RemoteWeatherBriefEvent missing field ${field}`);
}

assert.ok(
  briefStore.includes('recordRemoteWeatherBriefEvent') &&
    briefStore.includes("source: event.source") &&
    briefStore.includes("source?: 'dashboard_advisory' | 'ecs-remote-weather' | string") &&
    briefStore.includes('eventType?: string') &&
    briefStore.includes('severity?: ECSBriefSeverity') &&
    briefStore.includes('routeSegmentId: message.segmentId'),
  'Brief CAD store must accept source-tagged remote/weather events without replacing the feed.',
);
assert.ok(
  briefStore.includes('severityToCadMode') &&
    briefStore.includes('severityToCadPriority') &&
    briefStore.includes('recommendedAction: event.recommendedAction'),
  'Remote/weather brief events must map severity and recommended action into CAD entries.',
);

assert.ok(
  advisoryStore.includes('createRemoteWeatherBriefAdvisory') &&
    advisoryStore.includes('pushRemoteWeatherBriefEvent') &&
    advisoryStore.includes("source: event.source") &&
    advisoryStore.includes("source: message.source ?? 'dashboard_advisory'") &&
    advisoryStore.includes('routeSegmentId: message.segmentId'),
  'Advisory store must expose a remote/weather publisher into the existing ECS Brief pipeline.',
);
assert.ok(
  advisoryStore.includes('remoteWeatherSeverityToMode') &&
    advisoryStore.includes('remoteWeatherSeverityToPriority') &&
    advisoryStore.includes("'cloudy-outline'"),
  'Remote/weather advisories must use existing alert/advisory modes and priorities.',
);

assert.ok(
  cadLog.includes('formatSourceLabel') &&
    cadLog.includes("'ECS REMOTE WEATHER'") &&
    cadLog.includes('formatSeverityLabel') &&
    cadLog.includes('entry.title') &&
    cadLog.includes('entry.recommendedAction') &&
    cadLog.includes('entry.source'),
  'CAD log should retain existing rendering while showing remote/weather source tags.',
);
assert.ok(
  !ecsBriefTypes.includes('AI Brief') &&
    !briefStore.includes('AI Brief') &&
    !advisoryStore.includes('AI Brief') &&
    !cadLog.includes('AI Brief'),
  'ECS Brief remote/weather work must not introduce AI Brief wording.',
);

console.log('ECS Brief remote/weather event type checks passed.');
