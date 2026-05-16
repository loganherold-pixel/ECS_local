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

const { incidentRecoveryWorkflowStore } = loadTypeScriptModule('lib/incidentRecoveryWorkflowStore.ts');
const { buildIncidentRecoveryContainerState } = loadTypeScriptModule('lib/incidentRecoveryContainerState.ts');
const { buildIncidentCommunicationPacket } = loadTypeScriptModule('lib/incidentCommunicationPacket.ts');

function safety(overrides = {}) {
  return {
    anyoneInjured: false,
    anyoneMissing: false,
    anyoneTrapped: false,
    activeHazard: false,
    vehicleStable: true,
    groupSafe: true,
    ...overrides,
  };
}

function resources(overrides = {}) {
  return {
    vehicleDisabled: false,
    terrain: 'graded road',
    weather: 'clear',
    daylight: 'daylight',
    fuelConcern: false,
    waterConcern: false,
    foodConcern: false,
    shelterConcern: false,
    warmthConcern: false,
    medicalKitAvailable: true,
    ...overrides,
  };
}

function reportIncident(overrides = {}) {
  return incidentRecoveryWorkflowStore.reportIncident({
    expeditionId: 'expedition-alpha',
    routeLabel: 'Ruby Ridge',
    type: 'vehicle_breakdown',
    location: {
      latitude: 39.123456,
      longitude: -120.654321,
      source: 'gps',
    },
    communicationStatus: 'available',
    safety: safety(),
    resources: resources(),
    notes: 'Truck will not start.',
    ...overrides,
  });
}

incidentRecoveryWorkflowStore.clear();

const completeIncident = reportIncident();
const directPacket = buildIncidentCommunicationPacket(completeIncident, '2026-04-28T18:00:00.000Z');
assert.strictEqual(directPacket.audiencePackets.length, 4);
assert.ok(directPacket.packetText.includes('Emergency services'));
assert.ok(directPacket.packetText.includes('Professional recovery provider'));
assert.ok(directPacket.packetText.includes('GPS coordinates: 39.12346, -120.65432'));
assert.ok(directPacket.packetText.includes('Injury status: none_reported'));
assert.ok(directPacket.packetText.includes('This packet does not replace contacting emergency services'));

const generated = incidentRecoveryWorkflowStore.generateCommunicationPacket({
  incidentId: completeIncident.id,
  expeditionId: 'expedition-alpha',
});
assert.ok(generated.communicationPacket);
assert.strictEqual(generated.communicationPacket.status, 'complete');
assert.ok(generated.timeline.some((event) => event.title === 'communication packet generated'));

const copied = incidentRecoveryWorkflowStore.logCommunicationPacketCopied({
  incidentId: completeIncident.id,
  expeditionId: 'expedition-alpha',
  audience: 'trusted_contact',
});
assert.ok(copied.timeline.some((event) => event.title === 'communication packet copied'));
assert.ok(copied.communicationPacket.lastSentAt);

const containerState = buildIncidentRecoveryContainerState([], {
  expeditionId: 'expedition-alpha',
  incidents: incidentRecoveryWorkflowStore.getSnapshot(),
});
assert.strictEqual(containerState.buttonStates.communicationPacket.status, 'complete');

incidentRecoveryWorkflowStore.clear();
const missingLocationIncident = reportIncident({
  location: null,
  manualLocationDescription: '',
});
const missingLocationPacket = incidentRecoveryWorkflowStore.generateCommunicationPacket({
  incidentId: missingLocationIncident.id,
});
assert.ok(missingLocationPacket.communicationPacket.packetText.includes('Location/route: Ruby Ridge'));
assert.ok(missingLocationPacket.communicationPacket.packetText.includes('GPS coordinates: unknown'));

incidentRecoveryWorkflowStore.clear();
const missingInjuryIncident = reportIncident({
  safety: safety({ anyoneInjured: null }),
});
const missingInjuryPacket = incidentRecoveryWorkflowStore.generateCommunicationPacket({
  incidentId: missingInjuryIncident.id,
});
assert.ok(missingInjuryPacket.communicationPacket.packetText.includes('Injury status: unknown'));

incidentRecoveryWorkflowStore.clear();
const severeIncident = reportIncident({
  type: 'medical',
  communicationStatus: 'degraded',
  safety: safety({ anyoneInjured: true, activeHazard: true, groupSafe: false }),
  resources: resources({ terrain: 'unstable terrain', weather: 'severe weather' }),
  notes: 'Possible serious injury near unstable terrain.',
});
const severePacket = incidentRecoveryWorkflowStore.generateCommunicationPacket({
  incidentId: severeIncident.id,
});
assert.ok(severePacket.communicationPacket.summary.includes('Contact emergency services') || severePacket.communicationPacket.summary.includes('Severe'));
assert.ok(severePacket.communicationPacket.packetText.includes('Recommendation: contact emergency services or activate SOS where possible'));

incidentRecoveryWorkflowStore.clear();
const noIncidentPacket = incidentRecoveryWorkflowStore.generateCommunicationPacket({
  expeditionId: 'expedition-alpha',
});
assert.strictEqual(noIncidentPacket, null);
assert.strictEqual(incidentRecoveryWorkflowStore.getSnapshot().length, 0);

console.log('Communication Packet workflow checks passed.');
