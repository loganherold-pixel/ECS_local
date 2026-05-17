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
  appendGarminInreachPreflightChecklist,
  applyGarminInreachBriefSection,
  buildGarminInreachBriefSection,
  buildGarminInreachPlanningArtifacts,
  buildGarminInreachPreflightChecklist,
} = loadTypeScriptModule('lib/garmin/garminInreachPlanningBriefing.ts');
const { resolveGarminInreachConfigFromEnv } = loadTypeScriptModule('lib/garmin/garminInreachConfig.ts');

function config(mode = 'mapshare') {
  return resolveGarminInreachConfigFromEnv({
    GARMIN_INREACH_ENABLED: mode === 'off' ? 'false' : 'true',
    GARMIN_INREACH_MODE: mode,
    GARMIN_INREACH_KML_FEEDS: 'https://share.example.test/feed.kml',
    GARMIN_INREACH_IPC_BASE_URL: 'https://ipc.example.test',
    GARMIN_INREACH_IPC_API_KEY: 'secret',
  });
}

const route = {
  id: 'route-1',
  user_id: null,
  device_id: 'device-local',
  name: 'Rubicon Test Route',
  description: 'Planning route',
  source_format: 'custom',
  source_app: 'ecs_route_builder',
  route_category: 'custom',
  linked_run_id: null,
  total_distance_miles: 12.4,
  elevation_gain_ft: 1200,
  waypoint_count: 2,
  segment_count: 1,
  waypoints: [
    { lat: 38.7807, lon: -121.2076, ele: 130, name: 'Trailhead', time: null, waypointType: 'trailhead' },
    { lat: 38.7901, lon: -121.2301, ele: 420, name: 'Camp Option', time: null, waypointType: 'camp' },
  ],
  segments: [{
    points: [
      { lat: 38.7807, lon: -121.2076, ele: 130 },
      { lat: 38.7850, lon: -121.2200, ele: 280 },
      { lat: 38.7901, lon: -121.2301, ele: 420 },
    ],
  }],
  is_active: false,
  sync_status: 'local',
  created_at: '2026-04-28T18:00:00Z',
  updated_at: '2026-04-28T18:00:00Z',
};

const disabledArtifacts = buildGarminInreachPlanningArtifacts({
  config: config('off'),
  route,
});
assert.strictEqual(disabledArtifacts, null, 'Garmin planning artifacts should be hidden when disabled.');
assert.deepStrictEqual(buildGarminInreachPreflightChecklist(config('off')), []);
assert.strictEqual(buildGarminInreachBriefSection({ config: config('off') }), null);

const artifacts = buildGarminInreachPlanningArtifacts({
  config: config('mapshare'),
  route,
  deviceOwner: 'Logan / Lead Vehicle',
  checkInCadenceMinutes: 120,
  expeditionStartAt: '2026-04-28T18:00:00Z',
  expeditionEndAt: '2026-04-29T02:00:00Z',
  mapShareLink: 'https://share.example.test/feed.kml',
  backupCommsPlan: 'HAM simplex, convoy relay, and trusted contact phone tree.',
  emergencyContacts: [{ name: 'Base Contact', role: 'Trusted contact', contactMethod: 'SMS' }],
}, new Date('2026-04-28T17:00:00Z'));

assert.ok(artifacts);
assert.strictEqual(artifacts.enabled, true);
assert.strictEqual(artifacts.deviceSyncClaim, 'not_claimed');
assert.strictEqual(artifacts.sourceMode, 'MapShare');
assert.ok(artifacts.notes.some((note) => note.includes('Generated without Garmin credentials')));
assert.ok(artifacts.notes.some((note) => note.includes('does not claim automatic device sync')));
assert.strictEqual(artifacts.artifacts.every((artifact) => artifact.credentialRequired === false), true);
assert.ok(artifacts.artifacts.find((artifact) => artifact.id === 'garmin-gpx-route').content.includes('<gpx'));
assert.ok(artifacts.artifacts.find((artifact) => artifact.id === 'garmin-kml-route').content.includes('<kml'));
assert.ok(artifacts.artifacts.find((artifact) => artifact.id === 'garmin-waypoint-list').content.includes('Trailhead'));
assert.ok(artifacts.artifacts.find((artifact) => artifact.id === 'garmin-check-in-schedule').content.includes('Check-in 1'));
assert.ok(artifacts.artifacts.find((artifact) => artifact.id === 'garmin-comms-card').content.includes('No automatic Garmin commands'));
assert.ok(artifacts.artifacts.find((artifact) => artifact.id === 'garmin-message-templates').content.includes('Check-in OK'));
assert.strictEqual(artifacts.waypointList.length, 2);
assert.ok(artifacts.checkInSchedule.length >= 3);

const checklist = buildGarminInreachPreflightChecklist(config('ipc_command'));
const checklistLabels = checklist.map((item) => item.label);
assert.ok(checklistLabels.includes('inReach subscription active'));
assert.ok(checklistLabels.includes('device charged'));
assert.ok(checklistLabels.includes('IMEI/device registered in ECS if available'));
assert.ok(checklistLabels.includes('Garmin Explore synced'));
assert.ok(checklistLabels.includes('contacts/messages configured'));
assert.ok(checklistLabels.includes('test message sent'));
assert.ok(checklistLabels.includes('MapShare/Portal Connect configured if used'));
assert.ok(checklistLabels.includes('tracking interval selected'));
assert.ok(checklistLabels.includes('command authority confirmed'));
assert.ok(checklistLabels.includes('Emergency/SOS policy reviewed'));
assert.strictEqual(appendGarminInreachPreflightChecklist([{ id: 'existing' }], config('ipc_command'))[0].id, 'existing');
assert.ok(appendGarminInreachPreflightChecklist([{ id: 'existing' }], config('ipc_command')).length > checklist.length);

const mapshareBrief = buildGarminInreachBriefSection({
  config: config('mapshare'),
  deviceOwner: 'Logan / Lead Vehicle',
  checkInCadenceMinutes: 120,
  mapShareLink: 'https://share.example.test/feed.kml',
  backupCommsPlan: 'HAM simplex.',
});
assert.ok(mapshareBrief);
assert.strictEqual(mapshareBrief.title, 'Garmin Comms Plan');
assert.ok(mapshareBrief.lines.some((line) => line.text.includes('Device owner/member: Logan / Lead Vehicle')));
assert.ok(mapshareBrief.lines.some((line) => line.text.includes('Check-in cadence: 120 min')));
assert.ok(mapshareBrief.lines.some((line) => line.text.includes('MapShare/KML status: Configured')));
assert.ok(mapshareBrief.lines.some((line) => line.text.includes('not real-time')));
assert.ok(mapshareBrief.lines.some((line) => line.text.includes('Command controls unavailable')));

const commandBrief = buildGarminInreachBriefSection({
  config: config('ipc_command'),
  deviceOwner: 'Sweep Vehicle',
  checkInCadenceMinutes: 60,
});
assert.ok(commandBrief.lines.some((line) => line.text.includes('explicit operator confirmation')));
assert.ok(commandBrief.lines.some((line) => line.text.includes('queued/requested')));
assert.ok(!commandBrief.lines.some((line) => line.text.includes('automatic device sync')));

const baseBrief = {
  generatedAt: '2026-04-28T17:00:00Z',
  status: 'green',
  confidence: { level: 'high' },
  priority: null,
  headline: 'Brief',
  summary: 'Summary',
  commandIntent: 'Intent',
  operatorNote: null,
  keyRisks: [],
  recommendations: [],
  advisories: [],
  missionSection: { title: 'Mission', summary: '', status: 'green', lines: [] },
  routeSection: { title: 'Route', summary: '', status: 'green', lines: [] },
  environmentSection: { title: 'Environment', summary: '', status: 'green', lines: [] },
  resourcesSection: { title: 'Resources', summary: '', status: 'green', lines: [] },
  systemsSection: { title: 'Systems', summary: '', status: 'green', lines: [] },
  dashboardBarMessages: [],
  compactLabel: 'Brief',
  operatorTasks: [],
  operatorTaskLanes: [],
  autonomousAssist: {
    enabled: false,
    summary: null,
    mode: 'suggest_only',
    primaryRule: null,
    rules: [],
    suggestedSurface: 'none',
    requiresConfirmation: false,
    eventKey: null,
  },
};
const augmented = applyGarminInreachBriefSection(baseBrief, {
  config: config('mapshare'),
  deviceOwner: 'Lead',
  checkInCadenceMinutes: 90,
});
assert.ok(augmented.garminCommsSection);
assert.strictEqual(augmented.garminCommsPlan.deviceOwner, 'Lead');

const source = fs.readFileSync(path.join(process.cwd(), 'lib/garmin/garminInreachPlanningBriefing.ts'), 'utf8');
assert.ok(source.includes('generateGPX'), 'Garmin planning artifacts should reuse existing GPX exporter.');
assert.ok(source.includes('generateKML'), 'Garmin planning artifacts should reuse existing KML exporter.');
assert.ok(source.includes('ECS does not claim automatic device sync'), 'Planning copy should avoid false sync claims.');
assert.ok(source.includes('No automatic Garmin commands from ECS AI'), 'Comms card should forbid automatic Garmin commands.');

console.log('Garmin/inReach planning and briefing tests passed.');
