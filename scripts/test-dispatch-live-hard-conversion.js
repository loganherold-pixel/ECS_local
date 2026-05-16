const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

function loadTypeScriptModule(relPath) {
  const fullPath = path.join(process.cwd(), relPath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: fullPath,
  });
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  mod._compile(output.outputText, fullPath);
  return mod.exports;
}

require.extensions['.ts'] = function compileTypeScript(mod, filename) {
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
};

const liveEventsSource = fs.readFileSync(path.join(process.cwd(), 'lib/dispatchLiveEvents.ts'), 'utf8');
const commandCenterSource = fs.readFileSync(path.join(process.cwd(), 'components/dispatch/DispatchCadCommandCenter.tsx'), 'utf8');
const legacyCommandCenterSource = fs.readFileSync(path.join(process.cwd(), 'components/dispatch/DispatchCommandCenter.tsx'), 'utf8');
const alertTabSource = fs.readFileSync(path.join(process.cwd(), 'app/(tabs)/alert.tsx'), 'utf8');
const serviceAdaptersSource = fs.readFileSync(path.join(process.cwd(), 'lib/dispatchServiceAdapters.ts'), 'utf8');
const dispatchTypesSource = fs.readFileSync(path.join(process.cwd(), 'lib/dispatchTypes.ts'), 'utf8');
const eventStoreSource = fs.readFileSync(path.join(process.cwd(), 'lib/dispatchEventStore.ts'), 'utf8');
const channelStateSource = fs.readFileSync(path.join(process.cwd(), 'lib/dispatchChannelState.ts'), 'utf8');
const teamStoreSource = fs.readFileSync(path.join(process.cwd(), 'lib/teamStore.ts'), 'utf8');
const liveAggregatorSource = fs.readFileSync(path.join(process.cwd(), 'lib/dispatchLiveAggregator.ts'), 'utf8');

const {
  getDispatchEventTypeLabel,
  getDispatchSeverityLabel,
  getDispatchSourceLabel,
  getTopDispatchAdvisory,
  normalizeDispatchEvent,
  normalizeDispatchEvents,
  sortDispatchEvents,
  validateDispatchEvent,
} = loadTypeScriptModule('lib/dispatchLiveEvents.ts');
const {
  dispatchEventStore,
} = loadTypeScriptModule('lib/dispatchEventStore.ts');
const {
  buildLiveDispatchEvents,
} = loadTypeScriptModule('lib/dispatchLiveAggregator.ts');
const {
  getTeamStatusLabel,
  teamStore,
} = loadTypeScriptModule('lib/teamStore.ts');

for (const requiredType of [
  "'weather'",
  "'route'",
  "'terrain'",
  "'vehicle'",
  "'resources'",
  "'sync'",
  "'team_ping'",
  "'assistance'",
  "'recovery'",
]) {
  assert.ok(liveEventsSource.includes(requiredType), `DispatchEvent type contract should include ${requiredType}.`);
}

for (const requiredSeverity of ["'info'", "'watch'", "'warning'", "'critical'"]) {
  assert.ok(liveEventsSource.includes(requiredSeverity), `Dispatch severity contract should include ${requiredSeverity}.`);
}

for (const requiredSource of [
  "'weather_engine'",
  "'route_engine'",
  "'terrain_engine'",
  "'vehicle_telemetry'",
  "'resource_store'",
  "'sync_state'",
  "'user_report'",
  "'team_member'",
  "'cache'",
]) {
  assert.ok(liveEventsSource.includes(requiredSource), `Dispatch source contract should include ${requiredSource}.`);
}

const validEvent = normalizeDispatchEvent({
  id: 'weather-1',
  timestamp: '2026-04-25T12:00:00Z',
  type: 'weather',
  severity: 'warning',
  title: 'Wind increasing',
  message: 'Sustained winds are rising on the route.',
  source: 'weather_engine',
});

assert.ok(validEvent, 'Valid source event should normalize.');
assert.strictEqual(validEvent.createdAt, '2026-04-25T12:00:00.000Z');
assert.strictEqual(validateDispatchEvent({ ...validEvent, id: '' }).ok, false, 'Validation should drop missing id.');
assert.strictEqual(validateDispatchEvent({ ...validEvent, type: 'generated' }).ok, false, 'Validation should drop invalid type.');
assert.strictEqual(validateDispatchEvent({ ...validEvent, severity: 'guessed' }).ok, false, 'Validation should drop invalid severity.');
assert.strictEqual(validateDispatchEvent({ ...validEvent, timestamp: '' }).ok, false, 'Validation should drop missing timestamp.');
const originalWarnForNormalization = console.warn;
console.warn = () => {};
assert.strictEqual(normalizeDispatchEvents([validEvent, { id: 'bad' }]).length, 1, 'Normalization should keep only valid events.');
console.warn = originalWarnForNormalization;

const sorted = sortDispatchEvents([
  { ...validEvent, id: 'info', severity: 'info', createdAt: '2026-04-25T13:00:00Z' },
  { ...validEvent, id: 'critical', severity: 'critical', createdAt: '2026-04-25T11:00:00Z' },
]);
assert.strictEqual(sorted[0].id, 'critical', 'CAD feed should sort higher severity ahead of newer low-severity events.');

assert.strictEqual(getDispatchEventTypeLabel('team_ping'), 'Team Ping');
assert.strictEqual(getDispatchSeverityLabel('critical'), 'Critical');
assert.strictEqual(getDispatchSourceLabel('cache'), 'Last Known');
assert.strictEqual(getDispatchSourceLabel('user_report'), 'User Report');
assert.strictEqual(getTopDispatchAdvisory([validEvent])?.id, 'weather-1', 'ECS advisory should use an existing warning/critical event.');
assert.strictEqual(getTopDispatchAdvisory([{ ...validEvent, severity: 'info' }]), null, 'Info-only data should not invent an advisory.');

const originalLogForAggregator = console.log;
console.log = () => {};
assert.deepStrictEqual(
  buildLiveDispatchEvents({}),
  [],
  'Live Dispatch aggregator should not invent events when source stores have no data.',
);
const weatherWarningEvents = buildLiveDispatchEvents({
  weatherState: {
    locationName: 'Route',
    fetchedAt: '2026-04-25T12:00:00Z',
    status: { source: 'live' },
    alerts: [
      {
        title: 'High Wind Warning',
        severity: 'warning',
        effective: '2026-04-25T12:10:00Z',
        description: 'High winds threaten the active route.',
      },
      {
        title: 'Minor Notice',
        severity: 'advisory',
        description: 'Not dispatch-worthy.',
      },
    ],
  },
});
assert.strictEqual(weatherWarningEvents.length, 2, 'Weather warning/advisory alerts should create dispatch events.');
assert(weatherWarningEvents.every(event => event.source === 'weather_engine'), 'Live weather should use weather_engine source.');
assert(weatherWarningEvents.every(event => event.type === 'weather'), 'Weather mapper should emit weather events.');
assert(weatherWarningEvents.some(event => event.severity === 'warning'), 'Warning weather alerts should remain warning severity.');
assert(weatherWarningEvents.some(event => event.severity === 'watch'), 'Advisory weather alerts should become watch events.');
const cachedWeatherEvents = buildLiveDispatchEvents({
  weatherState: {
    locationName: 'Route',
    fetchedAt: '2026-04-25T11:00:00Z',
    status: { source: 'cache_stale' },
    alerts: [
      {
        title: 'Extreme Storm Warning',
        severity: 'extreme',
        effective: '2026-04-25T10:30:00Z',
        description: 'Cached severe weather warning.',
      },
    ],
  },
});
assert.strictEqual(cachedWeatherEvents[0].source, 'cache', 'Cached weather should be labeled as cache.');
assert.strictEqual(cachedWeatherEvents[0].createdAt, '2026-04-25T10:30:00.000Z', 'Cached weather should preserve original timestamp.');
const routeEvents = buildLiveDispatchEvents({
  activeRouteState: {
    id: 'analysis-1',
    sourceId: 'route-1',
    routeName: 'Test Route',
    overallDifficulty: 'difficult',
    totalDistanceMiles: 42,
    segmentCount: 2,
    analyzedAt: '2026-04-25T12:00:00Z',
    segments: [
      { segmentIndex: 0, difficulty: 'easy', coordinates: [38, -120] },
      { segmentIndex: 1, difficulty: 'difficult', coordinates: [38.1, -120.1] },
    ],
  },
});
assert.strictEqual(routeEvents[0].source, 'route_engine');
assert.strictEqual(routeEvents[0].routeSegmentId, 'route-1:1', 'Route events should preserve live route segment context.');
const terrainEvents = buildLiveDispatchEvents({
  terrainRiskState: {
    id: 'terrain-1',
    routeIntelligenceId: 'route-1',
    routeName: 'Test Route',
    overallRisk: 'SEVERE',
    analyzedAt: '2026-04-25T12:00:00Z',
    terrainWarnings: [
      { segmentIndex: 1, warningType: 'STEEP_GRADE', message: 'Steep terrain detected.', segmentRange: '10-20 mi' },
    ],
  },
});
assert.strictEqual(terrainEvents[0].severity, 'critical');
assert.strictEqual(terrainEvents[0].routeSegmentId, 'route-1:1');
const vehicleEvents = buildLiveDispatchEvents({
  vehicleTelemetryState: {
    isFresh: false,
    isStale: true,
    isShowingLastKnown: true,
    hasData: true,
    lastUpdated: '2026-04-25T12:00:00Z',
    summary: { coolant_temp: 232, fuel_level: 9, battery_voltage: 12.4, device_name: 'Rig' },
  },
});
assert.strictEqual(vehicleEvents[0].source, 'cache', 'Stale vehicle telemetry should be labeled as cache.');
assert.ok(vehicleEvents.some((event) => event.type === 'vehicle'), 'Warning telemetry should create vehicle events.');
const resourceEvents = buildLiveDispatchEvents({
  resourceState: {
    hasRealData: true,
    computedAt: '2026-04-25T12:00:00Z',
    sufficiencyLevel: 'Resources Limited',
    drivers: ['Fuel margin tight'],
    routeIntelligenceId: 'route-1',
  },
});
assert.strictEqual(resourceEvents[0].source, 'resource_store');
assert.strictEqual(resourceEvents[0].type, 'resources');
const syncEvents = buildLiveDispatchEvents({
  syncState: {
    isOnline: false,
    offlineMode: false,
    queuedCount: 2,
    connectivity: { status: 'offline', isOnline: false, lastOfflineAt: '2026-04-25T12:00:00Z', initialized: true },
  },
});
assert.strictEqual(syncEvents[0].source, 'sync_state');
assert.strictEqual(syncEvents[0].type, 'sync');
const dedupedEvents = buildLiveDispatchEvents({
  weatherState: {
    locationName: 'Route',
    status: { source: 'live' },
    alerts: [
      { title: 'High Wind Warning', severity: 'warning', description: 'Duplicate one.' },
      { title: 'High Wind Warning', severity: 'warning', description: 'Duplicate two.' },
    ],
  },
});
assert.strictEqual(dedupedEvents.length, 1, 'Aggregator should dedupe equivalent live conditions.');

const repeatedWireLogs = [];
console.log = (...args) => {
  repeatedWireLogs.push(args.map(String).join(' '));
};
const firstEmptyLiveBuild = buildLiveDispatchEvents({});
const firstRepeatedLogCount = repeatedWireLogs.length;
const secondEmptyLiveBuild = buildLiveDispatchEvents({});
assert.strictEqual(firstEmptyLiveBuild, secondEmptyLiveBuild, 'Unchanged live Dispatch input should reuse the previous event array.');
assert.strictEqual(
  repeatedWireLogs.length,
  firstRepeatedLogCount,
  'Unchanged live Dispatch input should not log another empty wire generation cycle.',
);
const firstNoTeamSyncBuild = buildLiveDispatchEvents({
  syncState: {
    isOnline: true,
    offlineMode: false,
    syncStatus: 'synced',
    queuedCount: 0,
    dirtyCount: 0,
    connectivity: {
      status: 'online',
      level: 'normal',
      latencyMs: 45,
      initialized: true,
    },
  },
  teamState: { activeTeam: null, members: [], updatedAt: '2026-04-25T12:00:00.000Z' },
});
const noTeamSyncLogCount = repeatedWireLogs.length;
const secondNoTeamSyncBuild = buildLiveDispatchEvents({
  syncState: {
    isOnline: true,
    offlineMode: false,
    syncStatus: 'synced',
    queuedCount: 0,
    dirtyCount: 0,
    connectivity: {
      status: 'online',
      level: 'excellent',
      latencyMs: 125,
      initialized: true,
    },
  },
  teamState: { activeTeam: null, members: [], updatedAt: '2026-04-25T12:00:45.000Z' },
});
assert.strictEqual(
  firstNoTeamSyncBuild,
  secondNoTeamSyncBuild,
  'No-team Dispatch input should ignore connectivity fields that cannot affect generated events.',
);
assert.strictEqual(
  repeatedWireLogs.length,
  noTeamSyncLogCount,
  'No-team connectivity churn should not log another empty live event generation cycle.',
);
console.log = originalLogForAggregator;

dispatchEventStore.clear();
const storedEvent = dispatchEventStore.appendEvent(validEvent);
assert.ok(storedEvent, 'DispatchEvent store should accept a valid event.');
assert.strictEqual(dispatchEventStore.getSnapshot().length, 1, 'DispatchEvent store should retain accepted events.');
const originalWarn = console.warn;
console.warn = () => {};
dispatchEventStore.appendEvent({ id: 'bad' });
assert.strictEqual(dispatchEventStore.getSnapshot().length, 1, 'DispatchEvent store should drop invalid events.');
dispatchEventStore.replaceEvents([
  { ...validEvent, id: 'route-1', type: 'route', severity: 'info', source: 'route_engine' },
  { id: 'bad' },
]);
console.warn = originalWarn;
assert.strictEqual(dispatchEventStore.getSnapshot().length, 1, 'DispatchEvent store should normalize replace payloads.');
dispatchEventStore.clear();
const manualEvent = normalizeDispatchEvent({
  id: 'dispatch-manual-1',
  timestamp: '2026-04-25T12:00:00Z',
  type: 'team_ping',
  severity: 'watch',
  title: 'Manual Ping',
  message: 'User-created event.',
  source: 'team_member',
});
assert.ok(manualEvent);
dispatchEventStore.appendEvent(manualEvent);
dispatchEventStore.replaceLiveDispatchEvents([
  {
    id: 'live-sync-test',
    timestamp: '2026-04-25T12:01:00Z',
    type: 'sync',
    severity: 'warning',
    title: 'Offline',
    message: 'Offline event.',
    source: 'sync_state',
  },
]);
assert.strictEqual(dispatchEventStore.getSnapshot().length, 2, 'Replacing live Dispatch events should preserve manual user-created events.');
const liveValidationLogs = [];
const originalLogForLiveStore = console.log;
console.log = (...args) => {
  liveValidationLogs.push(args.map(String).join(' '));
};
dispatchEventStore.replaceLiveDispatchEvents([
  {
    id: 'live-sync-test',
    timestamp: '2026-04-25T12:01:00Z',
    type: 'sync',
    severity: 'warning',
    title: 'Offline',
    message: 'Offline event.',
    source: 'sync_state',
  },
]);
const validationLogsAfterFirstRepeat = liveValidationLogs.length;
dispatchEventStore.replaceLiveDispatchEvents([
  {
    id: 'live-sync-test',
    timestamp: '2026-04-25T12:01:00Z',
    type: 'sync',
    severity: 'warning',
    title: 'Offline',
    message: 'Offline event.',
    source: 'sync_state',
  },
]);
console.log = originalLogForLiveStore;
assert.strictEqual(
  liveValidationLogs.length,
  validationLogsAfterFirstRepeat,
  'Semantic-identical live event arrays should skip repeated validation and dedupe work.',
);
dispatchEventStore.replaceLiveDispatchEvents([
  {
    id: 'live-sync-test-2',
    timestamp: '2026-04-25T12:02:00Z',
    type: 'sync',
    severity: 'warning',
    title: 'Offline Updated',
    message: 'Updated offline event.',
    source: 'sync_state',
  },
]);
assert.strictEqual(dispatchEventStore.getSnapshot().length, 2, 'Replacing live Dispatch events should not duplicate previous live events.');
assert.ok(dispatchEventStore.getSnapshot().some((event) => event.id === 'dispatch-manual-1'));
dispatchEventStore.clear();

teamStore.clear();
let teamSnapshot = teamStore.getSnapshot();
assert.strictEqual(teamSnapshot.activeTeam, null, 'Team store should start with no active team.');
assert.deepStrictEqual(teamSnapshot.members, [], 'Team store should not seed team members.');
assert.strictEqual(
  getTeamStatusLabel({ isOnline: true, offlineMode: false, snapshot: teamSnapshot }),
  'No active team',
  'No team state should be explicit.',
);
assert.strictEqual(
  getTeamStatusLabel({ isOnline: false, offlineMode: false, snapshot: teamSnapshot }),
  'Team sync unavailable',
  'Offline team state should be explicit.',
);
teamSnapshot = teamStore.replaceTeam(
  { id: 'team-1', name: 'Trail Crew', ownerId: 'user-1' },
  [
    { id: 'member-1', teamId: 'team-1', userId: 'user-1', role: 'owner' },
    { id: 'member-2', teamId: 'wrong-team', userId: 'user-2', role: 'member' },
  ],
);
assert.strictEqual(teamSnapshot.members.length, 1, 'Team store should keep only members for the active team.');
teamStore.clear();

assert.ok(alertTabSource.includes('DispatchCadCommandCenter'), 'Dispatch tab should render the compact CAD command center.');
assert.ok(commandCenterSource.includes('dispatchEventStore.getSnapshot'), 'Dispatch feed should hydrate from the live DispatchEvent store.');
assert.ok(commandCenterSource.includes('dispatchEventStore.subscribe'), 'Dispatch feed should subscribe to the live DispatchEvent store.');
assert.ok(commandCenterSource.includes('dispatchEventStore.appendEvent'), 'Dispatch event creation should write through the live DispatchEvent store.');
assert.ok(commandCenterSource.includes('buildLiveDispatchEvents'), 'Dispatch command center should build CAD feed events from live ECS store snapshots.');
assert.ok(commandCenterSource.includes('getLiveDispatchEventInput'), 'Dispatch command center should collect existing ECS store snapshots for live CAD wiring.');
assert.ok(commandCenterSource.includes('replaceLiveDispatchEvents'), 'Dispatch command center should replace live-generated events without duplicating manual events.');
assert.ok(commandCenterSource.includes('No live dispatch events'), 'Empty Dispatch feed should be truthful.');
assert.ok(commandCenterSource.includes('FlatList'), 'Dispatch feed should use an internal list.');
assert.ok(!commandCenterSource.includes('<ScrollView'), 'Dispatch page should not use page-level scrolling.');
assert.ok(commandCenterSource.includes('feedPanel:') && commandCenterSource.includes('flex: 1'), 'CAD feed panel should flex to available height.');
assert.ok(commandCenterSource.includes("sourceState = getLiveSourceState"), 'Dispatch UI should expose live/cache/unavailable source state.');
assert.ok(!commandCenterSource.includes('MOCK_DISPATCH_CAD_EVENTS'), 'Dispatch tab must not import seeded CAD events.');
assert.ok(!commandCenterSource.includes('dispatchMockData'), 'Dispatch tab must not import dispatch seed data.');
assert.ok(commandCenterSource.includes('function isThreatDrilldownEvent(event: DispatchEvent)'), 'Dispatch should centralize threat drilldown trigger logic.');
assert.ok(
  commandCenterSource.includes('!!event.location') &&
    commandCenterSource.includes('!!event.routeSegmentId'),
  'Threat drilldown should only expose map drilldown for precise location or route segment context.',
);
assert.ok(
  commandCenterSource.includes('<ECSModalShell') &&
    commandCenterSource.includes('title={event?.title ?? \'Threat Drilldown\'}') &&
    commandCenterSource.includes('overlayClass="workflow"') &&
    commandCenterSource.includes('minHeightFraction={0.84}'),
  'Threat drilldown should use the shared tactical modal shell with a full-height operational layout.',
);
assert.ok(commandCenterSource.includes('ThreatMapSurface'), 'Threat drilldown should include a map surface.');
assert.ok(commandCenterSource.includes('routeStore.getAll()'), 'Threat drilldown should resolve route segment geometry from live route storage.');
assert.ok(commandCenterSource.includes('L.marker') && commandCenterSource.includes('L.polyline'), 'Threat map should render a precise marker and route segment line when data exists.');
assert.ok(commandCenterSource.includes('Ping Threat') && commandCenterSource.includes('Mark Hazard') && commandCenterSource.includes('Request Assist'), 'Threat drilldown should expose operational action buttons.');
assert.ok(commandCenterSource.includes('Precise location unavailable from source'), 'Threat drilldown should refuse to invent coordinates when precision is missing.');
assert.ok(commandCenterSource.includes('function canOpenThreatDrilldown(event: DispatchEvent)'), 'Dispatch should block drilldown when map geometry cannot be resolved.');
assert.ok(commandCenterSource.includes('Threat map unavailable: exact location or route segment required.'), 'Dispatch should notify instead of opening failed map drilldown.');
assert.ok(!/latitude:\s*3[0-9]\.|longitude:\s*-\d+\./.test(commandCenterSource), 'Threat drilldown should not hardcode fake coordinates.');
assert.ok(commandCenterSource.includes('Recovery'), 'Dispatch action row should expose Recovery.');
assert.ok(!/>\s*More\s*<\/Text>/.test(commandCenterSource), 'Dispatch action row should not expose a vague More button.');
assert.ok(commandCenterSource.includes("onPress={() => openCommand('hazard')}"), 'Recovery action should open the hazard/recovery report panel directly.');
assert.ok(commandCenterSource.includes('async function getCurrentPosition'), 'Recovery reports should attempt current GPS before event creation.');
assert.ok(commandCenterSource.includes('Location.getCurrentPositionAsync'), 'Recovery reports should use native current-position GPS acquisition.');
assert.ok(commandCenterSource.includes('navigator.geolocation.getCurrentPosition'), 'Recovery reports should use web current-position GPS acquisition.');
assert.ok(commandCenterSource.includes('validateRecoveryGpsFix'), 'Recovery reports should validate GPS before attaching coordinates.');
assert.ok(commandCenterSource.includes('fix.latitude === 0 && fix.longitude === 0'), 'Recovery reports should reject 0,0 coordinates.');
assert.ok(commandCenterSource.includes('RECOVERY_GPS_MAX_AGE_MS'), 'Recovery reports should enforce GPS timestamp freshness.');
assert.ok(commandCenterSource.includes("source === 'user_report'"), 'User-submitted Recovery reports should remain local/internal.');
assert.ok(commandCenterSource.includes('Location unavailable'), 'Recovery reports should support GPS unavailable submission.');
assert.ok(commandCenterSource.includes('requiresMapDrilldown: !!recoveryFix'), 'Recovery reports should only expose map drilldown when GPS is captured.');
assert.ok(commandCenterSource.includes('DispatchChannelButton'), 'Dispatch live strip should render actionable channel buttons.');
assert.ok(commandCenterSource.includes('getDispatchChannelSnapshots'), 'Dispatch live strip should read channel snapshots.');
assert.ok(commandCenterSource.includes('createDispatchEventFromChannelAction'), 'Dispatch channel buttons should create validated dispatch events.');
assert.ok(commandCenterSource.includes('teamStore.getSnapshot'), 'Dispatch should read real team state from the team store.');
assert.ok(commandCenterSource.includes('getTeamSyncState'), 'Dispatch should show explicit reasoned team sync/no-team state.');
assert.ok(commandCenterSource.includes('reason: teamSyncState.reason'), 'Dispatch should log the reason for team sync state.');
assert.ok(commandCenterSource.includes('No active team') || teamStoreSource.includes('No active team'), 'Dispatch team foundation should expose no-team state.');
assert.ok(commandCenterSource.includes('Team sync unavailable') || teamStoreSource.includes('Team sync unavailable'), 'Dispatch team foundation should expose offline team sync state.');

for (const liveImport of [
  'getSharedOperationalWeatherState',
  'routeAnalysisEngine',
  'terrainAnalysisEngine',
  'vehicleTelemetryStore',
  'resourceForecastEngine',
  'connectivity',
]) {
  assert.ok(channelStateSource.includes(liveImport), `Dispatch channel state should read ${liveImport}.`);
}

for (const actionLabel of [
  'Ping Weather Threat',
  'Report Route Issue',
  'Mark Hazard',
  'Request Check',
  'Request Supply',
  'Report Comms Issue',
]) {
  assert.ok(channelStateSource.includes(actionLabel), `Dispatch channel action should include ${actionLabel}.`);
}

assert.ok(eventStoreSource.includes('validateDispatchEvent'), 'DispatchEvent store should validate writes.');
assert.ok(eventStoreSource.includes('sortDispatchEvents'), 'DispatchEvent store should keep feed ordering deterministic.');
assert.ok(eventStoreSource.includes('replaceLiveDispatchEvents'), 'DispatchEvent store should support replacing live ECS events while preserving user-created events.');
assert.ok(liveAggregatorSource.includes('export function buildLiveDispatchEvents'), 'Dispatch live aggregation layer should export buildLiveDispatchEvents.');
assert.ok(liveAggregatorSource.includes('weatherState') && liveAggregatorSource.includes('activeRouteState') && liveAggregatorSource.includes('terrainRiskState'), 'Dispatch live aggregation input should include weather, route, and terrain state.');
assert.ok(liveAggregatorSource.includes('vehicleTelemetryState') && liveAggregatorSource.includes('resourceState') && liveAggregatorSource.includes('syncState'), 'Dispatch live aggregation input should include vehicle, resource, and sync state.');
assert.ok(liveAggregatorSource.includes('dedupeKey'), 'Dispatch live aggregation should dedupe repeated active conditions.');
assert.ok(channelStateSource.includes('getLiveDispatchEventInput'), 'Dispatch live event input should be collected from existing ECS stores.');
for (const requiredLog of [
  '[DISPATCH] event_received',
  '[DISPATCH] event_validated',
  '[DISPATCH] event_rejected reason=',
  '[DISPATCH] event_rendered count=',
  '[DISPATCH] drilldown_open',
  '[DISPATCH] ping_created',
  '[DISPATCH] recovery_created',
  '[DISPATCH] team_sync_state',
]) {
  assert.ok(
    commandCenterSource.includes(requiredLog) ||
      eventStoreSource.includes(requiredLog),
    `Dispatch lifecycle logging should include ${requiredLog}.`,
  );
}

for (const requiredLog of [
  '[DISPATCH_WIRE] weather_events count=',
  '[DISPATCH_WIRE] route_events count=',
  '[DISPATCH_WIRE] terrain_events count=',
  '[DISPATCH_WIRE] vehicle_events count=',
  '[DISPATCH_WIRE] resource_events count=',
  '[DISPATCH_WIRE] sync_events count=',
  '[DISPATCH_WIRE] team_events count=',
  '[DISPATCH_WIRE] final_events count=',
  '[DISPATCH_WIRE] deduped count=',
]) {
  assert.ok(liveAggregatorSource.includes(requiredLog), `Dispatch live wiring logging should include ${requiredLog}.`);
}

for (const oldTerm of ['AI Advisory', 'AI Alert', 'AI Dispatch']) {
  assert.ok(!commandCenterSource.includes(oldTerm), `Dispatch UI should not expose ${oldTerm}.`);
  assert.ok(!dispatchTypesSource.includes(`return '${oldTerm}'`), `Shared labels should not return ${oldTerm}.`);
}
assert.ok(commandCenterSource.includes('ECS Advisory'), 'Dispatch advisory copy should use ECS terminology.');
assert.ok(!commandCenterSource.includes('Coming soon'), 'Dispatch UI should not expose non-functional channel copy.');
assert.ok(!channelStateSource.includes('Coming soon'), 'Dispatch channels should not expose non-functional copy.');

assert.ok(!serviceAdaptersSource.includes('dispatchMockData'), 'Legacy adapter seed data must not be imported by runtime services.');
assert.ok(!serviceAdaptersSource.includes('MOCK_DISPATCH'), 'Legacy adapter seed data must not be referenced by runtime services.');
assert.ok(legacyCommandCenterSource.includes('allowMockFallback: false'), 'Legacy Dispatch command center should not request seeded roster data.');
assert.ok(!serviceAdaptersSource.includes('createSoloDispatchMember'), 'Dispatch services should not synthesize a solo team member.');
assert.ok(teamStoreSource.includes("role: 'owner' | 'admin' | 'member'"), 'Team model should use the required role contract.');
assert.ok(teamStoreSource.includes('lastKnownLocation'), 'Team member model should include timestamped last-known location support.');
assert.ok(
  /return\s*{[\s\S]*pings: \[\],[\s\S]*queueItems: \[\],[\s\S]*assignments: \[\],[\s\S]*timelineEvents: \[\],[\s\S]*};/.test(serviceAdaptersSource),
  'Production Dispatch persistence defaults should be empty.',
);

console.log('Dispatch live hard-conversion checks passed.');
