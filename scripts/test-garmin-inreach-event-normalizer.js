const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

function compileTypeScriptModule(mod, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  mod._compile(output.outputText, filename);
}

function loadTypeScriptModule(relPath) {
  const fullPath = path.join(process.cwd(), relPath);
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  compileTypeScriptModule(mod, fullPath);
  return mod.exports;
}

require.extensions['.ts'] = compileTypeScriptModule;

const {
  GARMIN_INREACH_EVENT_NORMALIZER_TODO,
  normalizeGarminInreachDomainEvent,
  publishGarminInreachDomainEvents,
} = loadTypeScriptModule('lib/garmin/garminInreachEventNormalizer.ts');
const { parseGarminIpcOutboundPayload } = loadTypeScriptModule('lib/garmin/garminInreachOutboundWebhook.ts');

function normalizedEvent(rawEvent, version = '4.0') {
  const parsed = parseGarminIpcOutboundPayload({
    Version: version,
    Events: [rawEvent],
  }, new Date('2026-04-28T20:30:00Z'));
  assert.strictEqual(parsed.ok, true);
  return parsed.events[0];
}

assert.ok(
  GARMIN_INREACH_EVENT_NORMALIZER_TODO.some((item) => item.includes('Do not mutate')),
  'Normalizer should document no direct expedition/incident mutation.',
);

let result = normalizeGarminInreachDomainEvent(normalizedEvent({
  EventId: 'position-1',
  IMEI: '300434123456789',
  MessageCode: 0,
  Latitude: 38.7807,
  Longitude: -121.2076,
  Timestamp: '2026-04-28T20:00:00Z',
}, '2.0'));
assert.strictEqual(result.primaryEvent.kind, 'location_update');
assert.strictEqual(result.primaryEvent.source, 'garmin_inreach');
assert.strictEqual(result.primaryEvent.sourceSchemaVersion, '2.0');
assert.strictEqual(result.primaryEvent.rawMessageCode, 0);
assert.strictEqual(result.primaryEvent.garminTimestamp, '2026-04-28T20:00:00.000Z');
assert.strictEqual(result.primaryEvent.ingestedAt, '2026-04-28T20:30:00.000Z');
assert.strictEqual(result.primaryEvent.coordinates.latitude, 38.7807);
assert.strictEqual(result.primaryEvent.locationSource, 'garmin_inreach');
assert.ok(!JSON.stringify(result).includes('300434123456789'), 'Location output must not expose full IMEI.');
assert.strictEqual(result.debriefTimelineEvent.kind, 'debrief_timeline_event');
assert.strictEqual(result.debriefTimelineEvent.expeditionEvent.event_type, 'CHECKPOINT');

result = normalizeGarminInreachDomainEvent(normalizedEvent({
  ID: 'message-1',
  imei: '300434987654321',
  messageCode: 3,
  text: 'Reached camp. All OK.',
  timestamp: '2026-04-28T20:05:00Z',
}));
assert.strictEqual(result.primaryEvent.kind, 'field_message');
assert.strictEqual(result.primaryEvent.messageSource, 'garmin_inreach');
assert.strictEqual(result.primaryEvent.messageText, 'Reached camp. All OK.');
assert.strictEqual(result.debriefTimelineEvent.expeditionEvent.event_type, 'COMMS');
assert.ok(!JSON.stringify(result).includes('300434987654321'), 'Message output must not expose full IMEI.');

result = normalizeGarminInreachDomainEvent(normalizedEvent({
  ID: 'sos-declare-1',
  imei: '300434987654321',
  messageCode: 4,
  latitude: 39.2,
  longitude: -120.8,
  timestamp: '2026-04-28T20:10:00Z',
}));
assert.strictEqual(result.primaryEvent.kind, 'incident_signal');
assert.strictEqual(result.primaryEvent.incidentSeverity, 'critical');
assert.strictEqual(result.primaryEvent.reviewRequired, true);
assert.strictEqual(result.primaryEvent.shouldOpenIncidentAutomatically, false);
assert.strictEqual(result.primaryEvent.shouldCloseIncidentAutomatically, false);
assert.strictEqual(result.primaryEvent.incidentSignal.status, 'review_required');
assert.strictEqual(result.primaryEvent.incidentTimelineEvent.type, 'reported');
assert.strictEqual(result.debriefTimelineEvent.expeditionEvent.severity, 'CRITICAL');

result = normalizeGarminInreachDomainEvent(normalizedEvent({
  ID: 'sos-cancel-1',
  imei: '300434987654321',
  messageCode: 7,
  timestamp: '2026-04-28T20:12:00Z',
}));
assert.strictEqual(result.primaryEvent.kind, 'incident_signal');
assert.strictEqual(result.primaryEvent.shouldCloseIncidentAutomatically, false);
assert.ok(
  result.primaryEvent.incidentSignal.summary.includes('did not close an incident automatically'),
  'Cancel SOS should be review-only and must not close an incident.',
);
assert.strictEqual(result.primaryEvent.incidentTimelineEvent.type, 'note');

result = normalizeGarminInreachDomainEvent(normalizedEvent({
  ID: 'unknown-1',
  imei: '300434987654321',
  messageCode: 999,
  timestamp: '2026-04-28T20:15:00Z',
}));
assert.strictEqual(result.primaryEvent.kind, 'garmin_unknown_event');
assert.strictEqual(result.primaryEvent.garminMessageType, 'garmin_unknown_event');
assert.strictEqual(result.primaryEvent.rawMessageCode, 999);

result = normalizeGarminInreachDomainEvent(normalizedEvent({
  ID: 'pingback-1',
  imei: '300434987654321',
  messageCode: 65,
  timestamp: '2026-04-28T20:20:00Z',
}));
assert.strictEqual(result.primaryEvent.kind, 'command_response');
assert.strictEqual(result.primaryEvent.commandResponseType, 'pingback_response');

const published = [];
(async () => {
  await publishGarminInreachDomainEvents(result.allEvents, {
    publish(event) {
      published.push(event.kind);
    },
  });
  assert.deepStrictEqual(published, ['command_response', 'debrief_timeline_event']);

  console.log('Garmin/inReach event normalizer tests passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
