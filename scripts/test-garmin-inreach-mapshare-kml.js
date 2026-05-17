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
  GARMIN_MAPSHARE_SOURCE,
  getConfiguredGarminMapShareFeeds,
  mapGarminMapShareEventsToDomainEvents,
  parseGarminMapShareKml,
  parseGarminMapShareKmlToLocationEvents,
  pollGarminMapShareKmlFeeds,
  resetGarminMapShareKmlDedupeForTests,
  shouldPollGarminMapShare,
} = loadTypeScriptModule('lib/garmin/garminInreachMapShareKmlAdapter.ts');
const {
  GARMIN_INREACH_MIN_MAPSHARE_POLL_INTERVAL_MS,
  resolveGarminInreachConfigFromEnv,
  supportsGarminMapShareKmlIngestion,
  supportsGarminOutboundCommands,
} = loadTypeScriptModule('lib/garmin/garminInreachConfig.ts');
const {
  buildGarminInreachVisibilityModel,
} = loadTypeScriptModule('lib/garmin/garminInreachVisibilityModel.ts');
const {
  buildGarminInreachDebriefSection,
} = loadTypeScriptModule('lib/garmin/garminInreachDebriefIntelligence.ts');

const NOW = '2026-04-29T18:45:00.000Z';
const FEED_URL = 'https://share.example.test/mapshare.kml';
const FIXTURE_DIR = path.join(process.cwd(), 'fixtures', 'garmin-mapshare-kml');

function fixture(name) {
  return fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8');
}

function config(overrides = {}) {
  return resolveGarminInreachConfigFromEnv({
    GARMIN_INREACH_ENABLED: 'true',
    GARMIN_INREACH_MODE: 'mapshare',
    GARMIN_INREACH_KML_FEEDS: FEED_URL,
    GARMIN_INREACH_MAPSHARE_POLL_INTERVAL_SECONDS: '300',
    GARMIN_INREACH_MAPSHARE_STALE_AFTER_MINUTES: '30',
    ...overrides,
  });
}

function fetchText(body, status = 200, headers = {}) {
  return async () => new Response(body, {
    status,
    headers: { 'content-type': 'application/vnd.google-earth.kml+xml', ...headers },
  });
}

(async () => {
  resetGarminMapShareKmlDedupeForTests();

  const defaultConfig = resolveGarminInreachConfigFromEnv();
  assert.strictEqual(defaultConfig.flags.garminInreachEnabled, false);
  assert.strictEqual(defaultConfig.mode, 'off');
  assert.strictEqual(defaultConfig.demoKmlEnabled, false, 'Demo KML must be disabled by default.');
  assert.strictEqual(shouldPollGarminMapShare(defaultConfig), false);

  const mapshareConfig = config();
  assert.strictEqual(supportsGarminMapShareKmlIngestion(mapshareConfig), true);
  assert.strictEqual(supportsGarminOutboundCommands(mapshareConfig), false, 'MapShare mode must be read-only.');
  assert.strictEqual(shouldPollGarminMapShare(mapshareConfig), true);
  assert.strictEqual(
    mapshareConfig.mapSharePollIntervalMs,
    GARMIN_INREACH_MIN_MAPSHARE_POLL_INTERVAL_MS,
    'MapShare polling should use the conservative 300 second default/minimum interval.',
  );
  assert.strictEqual(mapshareConfig.mapShareStaleAfterMs, 30 * 60 * 1000);

  const feeds = getConfiguredGarminMapShareFeeds(mapshareConfig, {
    id: 'lead-feed',
    expeditionId: 'expedition-1',
    teamMemberId: 'member-1',
    vehicleId: 'vehicle-1',
    deviceId: 'device-1',
    label: 'Lead inReach',
  });
  assert.strictEqual(feeds.length, 1);
  assert.strictEqual(feeds[0].label, 'Lead inReach');

  const single = parseGarminMapShareKml({ kml: fixture('single-point.kml') });
  assert.strictEqual(single.placemarks.length, 1, 'Valid single-point KML should parse.');
  assert.strictEqual(single.placemarks[0].label, 'inReach Position');
  assert.strictEqual(single.placemarks[0].message, 'Checking in from camp.');
  assert.strictEqual(single.placemarks[0].sourceTimestamp, '2026-04-29T18:30:00.000Z');
  assert.strictEqual(single.placemarks[0].latitude, 37.8651);
  assert.strictEqual(single.placemarks[0].longitude, -119.5383);
  assert.strictEqual(single.placemarks[0].altitude, 1220);

  const multi = parseGarminMapShareKml({ kml: fixture('multi-point.kml') });
  assert.strictEqual(multi.placemarks.length, 2, 'Valid multi-point KML should parse all points.');

  const missingTimestamp = parseGarminMapShareKml({ kml: fixture('missing-timestamp.kml') });
  assert.strictEqual(missingTimestamp.placemarks.length, 1);
  assert.ok(missingTimestamp.warnings.includes('missing_timestamp'));
  assert.ok(missingTimestamp.placemarks[0].warnings.includes('missing_timestamp'));

  const namespaced = parseGarminMapShareKml({ kml: fixture('namespaces.kml') });
  assert.strictEqual(namespaced.placemarks.length, 1, 'Parser should handle XML namespaces.');
  assert.strictEqual(namespaced.placemarks[0].message, 'Namespaced message.');

  const invalid = parseGarminMapShareKml({ kml: fixture('invalid.kml') });
  assert.deepStrictEqual(invalid.warnings, ['malformed_xml']);

  const empty = parseGarminMapShareKml({ kml: fixture('empty.kml') });
  assert.deepStrictEqual(empty.warnings, ['empty_feed']);

  const parsed = parseGarminMapShareKmlToLocationEvents({
    kml: fixture('description-message.kml'),
    feed: feeds[0],
    polledAt: NOW,
    staleAfterMs: mapshareConfig.mapShareStaleAfterMs,
  });
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.status, 'parsed');
  assert.strictEqual(parsed.events.length, 1);
  assert.strictEqual(parsed.events[0].source, GARMIN_MAPSHARE_SOURCE);
  assert.strictEqual(parsed.events[0].kind, 'location_update');
  assert.strictEqual(parsed.events[0].latitude, 37.8651);
  assert.strictEqual(parsed.events[0].longitude, -119.5383);
  assert.strictEqual(parsed.events[0].elevationMeters, 1220);
  assert.strictEqual(parsed.events[0].sourceTimestamp, '2026-04-29T18:30:00.000Z');
  assert.strictEqual(parsed.events[0].occurredAt, '2026-04-29T18:30:00.000Z');
  assert.strictEqual(parsed.events[0].association.expeditionId, 'expedition-1');
  assert.strictEqual(parsed.events[0].association.teamMemberId, 'member-1');
  assert.strictEqual(parsed.events[0].expeditionEvent.event_type, 'CHECKPOINT');
  assert.strictEqual(parsed.events[0].expeditionEvent.severity, 'LOW');
  assert.strictEqual(parsed.fieldMessages.length, 1, 'Description/message should map to a field message event.');
  assert.strictEqual(parsed.fieldMessages[0].messageText, 'Checking in from camp. All good.');

  resetGarminMapShareKmlDedupeForTests();
  const pollResult = await pollGarminMapShareKmlFeeds({
    config: mapshareConfig,
    feeds,
    fetchImpl: fetchText(fixture('single-point.kml'), 200, {
      etag: 'fixture-etag',
      'last-modified': 'Wed, 29 Apr 2026 18:30:00 GMT',
    }),
    now: () => new Date(NOW),
  });
  assert.strictEqual(pollResult.enabled, true);
  assert.strictEqual(pollResult.events.length, 1);
  assert.strictEqual(pollResult.feedResults[0].status, 'parsed');
  assert.strictEqual(pollResult.feedResults[0].etag, 'fixture-etag');
  assert.strictEqual(pollResult.feedResults[0].lastSuccessfulFetchAt, NOW);
  assert.strictEqual(pollResult.warnings.length, 0);

  const duplicate = await pollGarminMapShareKmlFeeds({
    config: mapshareConfig,
    feeds,
    fetchImpl: fetchText(fixture('single-point.kml')),
    now: () => new Date(NOW),
  });
  assert.strictEqual(duplicate.events.length, 0, 'Duplicate KML polling should not create duplicate events.');
  assert.strictEqual(duplicate.feedResults[0].duplicateCount, 1);

  let fetchCalled = false;
  const disabled = await pollGarminMapShareKmlFeeds({
    config: config({
      GARMIN_INREACH_ENABLED: 'false',
      GARMIN_INREACH_MODE: 'mapshare',
      GARMIN_INREACH_KML_FEEDS: FEED_URL,
    }),
    fetchImpl: async () => {
      fetchCalled = true;
      return new Response(fixture('single-point.kml'), { status: 200 });
    },
    now: () => new Date(NOW),
  });
  assert.strictEqual(disabled.enabled, false);
  assert.strictEqual(disabled.events.length, 0);
  assert.strictEqual(disabled.feedResults[0].status, 'disabled');
  assert.strictEqual(fetchCalled, false, 'Disabled MapShare ingestion must not fetch feeds.');

  const readonlyOffMode = await pollGarminMapShareKmlFeeds({
    config: config({ GARMIN_INREACH_MODE: 'ipc_readonly' }),
    feeds,
    fetchImpl: fetchText(fixture('single-point.kml')),
    now: () => new Date(NOW),
  });
  assert.strictEqual(readonlyOffMode.enabled, false, 'Poller must only run in mapshare mode.');

  const demoDisabled = getConfiguredGarminMapShareFeeds(mapshareConfig);
  assert.strictEqual(demoDisabled.some((feed) => feed.demo), false, 'Demo feed should not appear unless explicitly enabled.');
  const demoConfig = config({ GARMIN_INREACH_DEMO_KML_ENABLED: 'true', GARMIN_INREACH_KML_FEEDS: '' });
  const demoFeeds = getConfiguredGarminMapShareFeeds(demoConfig);
  assert.strictEqual(demoFeeds.length, 1);
  assert.strictEqual(demoFeeds[0].demo, true);
  const demoPoll = await pollGarminMapShareKmlFeeds({
    config: demoConfig,
    feeds: demoFeeds,
    now: () => new Date(NOW),
  });
  assert.strictEqual(demoPoll.events.length, 1);
  assert.strictEqual(demoPoll.events[0].demo, true);

  const invalidUrl = await pollGarminMapShareKmlFeeds({
    config: mapshareConfig,
    feeds: [{ url: 'ftp://example.test/feed.kml', label: 'Bad feed' }],
    fetchImpl: fetchText(fixture('single-point.kml')),
    now: () => new Date(NOW),
  });
  assert.strictEqual(invalidUrl.enabled, true);
  assert.strictEqual(invalidUrl.feedResults[0].status, 'invalid_url');
  assert.strictEqual(invalidUrl.events.length, 0);
  assert.ok(invalidUrl.warnings[0].includes('http(s) KML URL'));

  const loginUrl = await pollGarminMapShareKmlFeeds({
    config: mapshareConfig,
    feeds: [{ url: 'https://explore.garmin.com/Account/Login', label: 'Login page' }],
    fetchImpl: fetchText(fixture('single-point.kml')),
    now: () => new Date(NOW),
  });
  assert.strictEqual(loginUrl.feedResults[0].status, 'invalid_url');

  const badFetch = await pollGarminMapShareKmlFeeds({
    config: mapshareConfig,
    feeds,
    fetchImpl: async () => {
      throw new Error('network unavailable');
    },
    now: () => new Date(NOW),
  });
  assert.strictEqual(badFetch.feedResults[0].status, 'fetch_failed');
  assert.strictEqual(badFetch.feedResults[0].failureCount, 1);
  assert.ok(badFetch.feedResults[0].lastError.includes('network unavailable'));
  assert.ok(badFetch.feedResults[0].warning.includes('network unavailable'));
  assert.strictEqual(badFetch.events.length, 0);

  const stale = parseGarminMapShareKmlToLocationEvents({
    kml: fixture('single-point.kml'),
    feed: feeds[0],
    polledAt: '2026-04-29T20:00:00.000Z',
    staleAfterMs: mapshareConfig.mapShareStaleAfterMs,
  });
  assert.strictEqual(stale.status, 'parsed');
  assert.strictEqual(stale.stale, true);
  assert.ok(stale.warning.includes('recent location update'));
  assert.strictEqual(stale.staleWarnings.length, 1);
  assert.strictEqual(stale.events[0].metadata.stale, true);
  assert.strictEqual(stale.events[0].expeditionEvent.event_type, 'COMMS');
  assert.strictEqual(stale.events[0].expeditionEvent.severity, 'MED');

  const visibility = buildGarminInreachVisibilityModel({
    config: mapshareConfig,
    snapshot: {
      deviceLabel: 'Lead MapShare',
      memberLabel: 'Lead Vehicle',
      lastPosition: {
        latitude: pollResult.events[0].latitude,
        longitude: pollResult.events[0].longitude,
        sourceTimestamp: pollResult.events[0].sourceTimestamp,
      },
      lastInboundMessage: { text: pollResult.events[0].metadata.waypointDescription, occurredAt: pollResult.events[0].occurredAt },
    },
    now: new Date(NOW),
  });
  assert.ok(visibility);
  assert.strictEqual(visibility.canShowCommandControls, false, 'MapShare UI must hide command controls.');
  assert.deepStrictEqual(visibility.commandControls, []);
  assert.ok(visibility.sourceMode.includes('MapShare'));

  const domainEvents = mapGarminMapShareEventsToDomainEvents(pollResult.events);
  const debrief = buildGarminInreachDebriefSection({
    config: mapshareConfig,
    events: domainEvents,
    staleKml: false,
  }, new Date(NOW));
  assert.ok(debrief, 'Debrief should include Garmin section when MapShare events exist.');
  assert.strictEqual(debrief.sourceMode, 'mapshare');
  assert.strictEqual(debrief.trackReplay.length, 1);
  assert.strictEqual(debrief.messageTimeline.length, 1);
  assert.strictEqual(debrief.trackReplay[0].source, GARMIN_MAPSHARE_SOURCE);

  const emptyDebrief = buildGarminInreachDebriefSection({
    config: mapshareConfig,
    events: [],
  }, new Date(NOW));
  assert.strictEqual(emptyDebrief, null, 'Debrief should omit Garmin section when no Garmin events exist.');

  console.log('Garmin/inReach MapShare KML adapter tests passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
