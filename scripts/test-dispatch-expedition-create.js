const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

function compileTypeScript(mod, filename) {
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

require.extensions['.ts'] = compileTypeScript;
require.extensions['.tsx'] = compileTypeScript;

const originalLoad = Module._load;
Module._load = function loadWithReactNativeStub(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'test' } };
  }
  return originalLoad.call(this, request, parent, isMain);
};

function loadTypeScriptModule(relPath) {
  const fullPath = path.join(process.cwd(), relPath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.React,
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

const { expeditionStateStore } = loadTypeScriptModule('lib/expeditionStateStore.ts');
const { teamStore, getTeamStatusLabel } = loadTypeScriptModule('lib/teamStore.ts');

const originalLog = console.log;
const originalWarn = console.warn;
console.log = () => {};
console.warn = () => {};

try {
  expeditionStateStore.reset();
  teamStore.clear();

  const validationSource = fs.readFileSync(path.join(process.cwd(), 'components/dispatch/DispatchCadCommandCenter.tsx'), 'utf8');
  assert.ok(validationSource.includes('function validateCreateExpeditionForm'), 'Dispatch Connect should validate create-expedition form input.');
  assert.ok(validationSource.includes('Expedition name is required.'), 'Empty expedition names should be rejected.');
  assert.ok(validationSource.includes('accessibilityLabel="Open convoy setup"'), 'Dispatch should expose Convoy setup from the top-right action bar.');
  assert.ok(validationSource.includes('Start Convoy'), 'Dispatch Convoy setup should expose a start-convoy form.');
  assert.ok(validationSource.includes('Date / Time'), 'Start Convoy form should expose date/time input.');
  assert.ok(validationSource.includes('Radio / Comms Notes'), 'Start Convoy form should expose comms notes input.');
  assert.ok(validationSource.includes('Invite Mode'), 'Start Convoy form should expose join/privacy mode input.');
  assert.ok(validationSource.includes('teamStore.createLocalTeam'), 'Creating an expedition should create a local team context for existing invite flow.');
  assert.ok(validationSource.includes('Share.share'), 'Convoy invites should use the native share sheet for text/email/nearby sharing.');
  assert.ok(validationSource.includes("router.push('/join-expedition' as any)"), 'Convoy setup should link to the join-by-code screen.');

  const record = expeditionStateStore.beginExpedition({
    activeVehicleId: 'dispatch-local',
    vehicleName: 'Ruby Ridge Expedition',
    expeditionName: 'Ruby Ridge Recovery Run',
    description: 'Move two rigs through Ruby Ridge and stage recovery support.',
    teamLeaderName: 'Logan',
    teamLeaderCallsign: 'Lead',
    startLocationLabel: 'Trailhead A',
    destination: 'Ruby Ridge',
    areaOfOperation: 'North basin',
    commsNotes: 'GMRS 16, privacy 4',
    privacyMode: 'invite_only',
    joinMode: 'approval_required',
    latitude: 39.12345,
    longitude: -120.54321,
    userId: 'operator-1',
  });

  assert.strictEqual(record.state, 'active');
  assert.strictEqual(record.expeditionName, 'Ruby Ridge Recovery Run');
  assert.strictEqual(record.description, 'Move two rigs through Ruby Ridge and stage recovery support.');
  assert.strictEqual(record.teamLeaderName, 'Logan');
  assert.strictEqual(record.teamLeaderCallsign, 'Lead');
  assert.strictEqual(record.destination, 'Ruby Ridge');
  assert.strictEqual(record.areaOfOperation, 'North basin');
  assert.strictEqual(record.commsNotes, 'GMRS 16, privacy 4');
  assert.strictEqual(record.joinMode, 'approval_required');
  assert.deepStrictEqual(expeditionStateStore.getCurrentExpedition()?.id, record.id);

  const teamSnapshot = teamStore.createLocalTeam({
    name: 'Ruby Ridge Recovery Run Team',
    ownerId: 'operator-1',
    ownerDisplayName: 'Logan',
  });

  assert.ok(teamSnapshot.activeTeam, 'Create Expedition should make a team context available.');
  assert.strictEqual(teamSnapshot.activeTeam.name, 'Ruby Ridge Recovery Run Team');
  assert.strictEqual(teamSnapshot.members.length, 1);
  assert.strictEqual(teamSnapshot.members[0].role, 'owner');
  assert.strictEqual(
    getTeamStatusLabel({ isOnline: true, offlineMode: false, snapshot: teamSnapshot }),
    'Ruby Ridge Recovery Run Team / 1 member',
  );

  console.log = originalLog;
  console.warn = originalWarn;
  console.log('Dispatch expedition creation checks passed.');
} finally {
  console.log = originalLog;
  console.warn = originalWarn;
  expeditionStateStore.reset();
  teamStore.clear();
  Module._load = originalLoad;
}
