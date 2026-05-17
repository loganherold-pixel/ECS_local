const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '..');

function loadTsModule(relativePath) {
  const filename = path.join(repoRoot, relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(outputText, filename);
  return mod.exports;
}

const {
  normalizeConvoyCommandData,
} = loadTsModule('lib/navigation/convoyCommandData.ts');

const now = '2026-05-14T12:00:00.000Z';
const point = (value) => ({
  value,
  source: 'userManual',
  updatedAt: now,
  confidence: 'medium',
  reliability: 'medium',
});

const empty = normalizeConvoyCommandData();
assert.strictEqual(empty.dataState, 'setupNeeded');
assert.strictEqual(empty.usesLiveTracking, false);
assert.strictEqual(empty.recommendationLabel, 'SET CONVOY PLAN TO BEGIN');

const planned = normalizeConvoyCommandData({
  teamSnapshot: {
    activeTeam: { id: 'team-1', name: 'Mojave Line', ownerId: 'u-1' },
    updatedAt: now,
    members: [
      { id: 'm-1', teamId: 'team-1', userId: 'u-1', role: 'owner' },
      { id: 'm-2', teamId: 'team-1', userId: 'u-2', role: 'member' },
    ],
  },
  convoySnapshot: {
    teamMemberCount: point(2),
    convoySpacingMinutes: point(8),
    recommendedRegroupPoint: point('Ridge gate'),
  },
});
assert.strictEqual(planned.dataState, 'planned');
assert.strictEqual(planned.convoySize, 2);
assert.strictEqual(planned.recommendationLabel, 'CONVOY PLAN READY');
assert.strictEqual(planned.usesLiveTracking, false);

const checkIn = normalizeConvoyCommandData({
  convoySnapshot: {
    members: [
      {
        id: 'lead',
        callsign: 'Lead',
        role: 'lead',
        lastCheckInAt: point(now),
        movementStatus: point('moving'),
      },
      {
        id: 'sweep',
        callsign: 'Sweep',
        role: 'sweep',
        lastCheckInAt: point(now),
        movementStatus: point('delayed'),
      },
    ],
    lastCheckInAt: point(now),
    communicationsStatus: point('degraded'),
  },
});
assert.strictEqual(checkIn.dataState, 'checkIn');
assert.strictEqual(checkIn.mode, 'checkIn');
assert.strictEqual(checkIn.delayedCount, 1);
assert.strictEqual(checkIn.recommendationLabel, 'REGROUP / CHECK SWEEP');
assert.strictEqual(checkIn.usesLiveTracking, false);

const live = normalizeConvoyCommandData({
  liveSharingAvailable: true,
  convoySnapshot: {
    members: [
      {
        id: 'lead-live',
        callsign: 'Lead',
        role: 'lead',
        lastCheckInAt: point(now),
        movementStatus: point('moving'),
      },
      {
        id: 'sweep-live',
        callsign: 'Sweep',
        role: 'sweep',
        lastCheckInAt: point(now),
        movementStatus: point('moving'),
      },
    ],
    lastCheckInAt: point(now),
  },
});
assert.strictEqual(live.dataState, 'live');
assert.strictEqual(live.mode, 'live');
assert.strictEqual(live.usesLiveTracking, true);

const assistance = normalizeConvoyCommandData({
  convoySnapshot: {
    members: [
      {
        id: 'recovery',
        callsign: 'Recovery',
        role: 'support',
        needsAssistance: point(true),
      },
    ],
    assistanceNeededMemberLabels: point(['Recovery']),
  },
});
assert.strictEqual(assistance.emergencyCount, 1);
assert.strictEqual(assistance.recommendationLabel, 'MEMBER NEEDS ASSISTANCE');

const offline = normalizeConvoyCommandData({
  isOffline: true,
  convoySnapshot: {
    teamMemberCount: point(3),
    recommendedRegroupPoint: point('Trailhead'),
  },
});
assert.strictEqual(offline.dataState, 'offline');
assert.strictEqual(offline.usesLiveTracking, false);

const source = fs.readFileSync(path.join(repoRoot, 'components/dashboard/commandCenter/ConvoyCommand.tsx'), 'utf8');
assert(source.includes('CommandCenterFrame'), 'Convoy Command should use CommandCenterFrame');
assert(source.includes('No continuous live tracking in this mode'), 'Convoy Command must label non-live modes honestly');
assert(source.includes('CHECK-IN'), 'Convoy Command should expose check-in status copy');
assert(source.includes('PLANNED'), 'Convoy Command should expose planned status copy');

console.log('[convoy-command] normalization, non-live staging, and UI contract checks passed');
