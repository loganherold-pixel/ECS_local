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

const root = process.cwd();
const panelSource = fs.readFileSync(path.join(root, 'components', 'dashboard', 'IncidentRecoveryPanel.tsx'), 'utf8');
const checklistSource = fs.readFileSync(path.join(root, 'components', 'dashboard', 'SafetyChecklistModal.tsx'), 'utf8');
const packetModalSource = fs.readFileSync(path.join(root, 'components', 'dashboard', 'CommunicationPacketModal.tsx'), 'utf8');
const pdfSource = fs.readFileSync(path.join(root, 'lib', 'incidentCommunicationPacketPdfExport.ts'), 'utf8');

assert.ok(panelSource.includes('Clear Incident & Recovery'), 'Incident panel should confirm before clearing an incident.');
assert.ok(panelSource.includes('clearIncident({ incidentId, expeditionId })'), 'Incident panel should reset active incident workflow state.');
assert.ok(panelSource.includes('dispatchEventStore.clearEvent(dispatchEventId)'), 'Incident panel should clear a dispatch-sourced active incident event.');
assert.ok(panelSource.includes('completeCheck'), 'Incident action cards should show a completed green check indicator.');
assert.ok(checklistSource.includes('Attention needed') && checklistSource.includes('Complete'), 'Safety checklist should display complete vs attention-needed state.');
assert.ok(packetModalSource.includes('exportIncidentCommunicationPacketPdf'), 'Communication Packet modal should wire PDF export.');
assert.ok(packetModalSource.includes('document-text-outline') && packetModalSource.includes('PDF'), 'Communication Packet modal should show a PDF action button.');
assert.ok(pdfSource.includes("await import('expo-print')") && pdfSource.includes("await import('expo-sharing')"), 'Incident packet PDF export should use Expo Print and Sharing.');

const { incidentRecoveryWorkflowStore } = loadTypeScriptModule('lib/incidentRecoveryWorkflowStore.ts');
const { dispatchEventStore } = loadTypeScriptModule('lib/dispatchEventStore.ts');
const { buildIncidentRecoveryContainerState } = loadTypeScriptModule('lib/incidentRecoveryContainerState.ts');
const { buildIncidentCommunicationPacket } = loadTypeScriptModule('lib/incidentCommunicationPacket.ts');
const { buildIncidentPacketPdfHtml } = loadTypeScriptModule('lib/incidentCommunicationPacketPdfExport.ts');

incidentRecoveryWorkflowStore.clear();
dispatchEventStore.clear();
const incident = incidentRecoveryWorkflowStore.reportIncident({
  expeditionId: 'expedition-alpha',
  routeLabel: 'Ruby Ridge',
  type: 'vehicle_stuck',
  location: {
    latitude: 39.1,
    longitude: -120.2,
    source: 'gps',
  },
  communicationStatus: 'available',
  safety: {
    anyoneInjured: false,
    anyoneMissing: false,
    anyoneTrapped: false,
    activeHazard: false,
    vehicleStable: true,
    groupSafe: true,
  },
  resources: {
    vehicleDisabled: true,
    terrain: 'sand wash',
    weather: 'clear',
    daylight: 'daylight',
    fuelConcern: false,
    waterConcern: false,
    foodConcern: false,
    shelterConcern: false,
    warmthConcern: false,
    medicalKitAvailable: true,
  },
  notes: 'Recovery assist packet test.',
});

const incidentWithPacket = {
  ...incident,
  communicationPacket: buildIncidentCommunicationPacket(incident, '2026-04-28T18:00:00.000Z'),
};
const html = buildIncidentPacketPdfHtml(incidentWithPacket, 'all');
assert.ok(html.includes('ECS Incident & Recovery'), 'PDF HTML should include ECS Incident & Recovery branding.');
assert.ok(html.includes('Communication Packet'), 'PDF HTML should title the communication packet.');
assert.ok(html.includes('Vehicle Stuck') || html.includes('vehicle_stuck'), 'PDF HTML should include packet incident content.');
assert.ok(html.includes('does not replace contacting emergency services'), 'PDF HTML should include the emergency-services disclaimer.');

assert.strictEqual(incidentRecoveryWorkflowStore.getSnapshot().length, 1);
assert.strictEqual(incidentRecoveryWorkflowStore.clearIncident({ incidentId: incident.id }), true);
assert.strictEqual(incidentRecoveryWorkflowStore.getSnapshot().length, 0);
assert.strictEqual(incidentRecoveryWorkflowStore.clearIncident({ incidentId: incident.id }), false);

const dispatchIncident = {
  id: 'dispatch-recovery-clear-1',
  type: 'recovery',
  severity: 'critical',
  title: 'Recovery Assist',
  message: 'Vehicle immobilized near the wash crossing.',
  source: 'team_member',
  createdAt: '2026-04-28T17:45:00.000Z',
  updatedAt: '2026-04-28T17:50:00.000Z',
  status: 'recovery_critical',
  category: 'recovery_assist',
  hazardType: 'recovery',
  location: {
    latitude: 39.123456,
    longitude: -120.654321,
    timestamp: '2026-04-28T17:49:00.000Z',
    source: 'current_gps',
  },
  sessionId: 'expedition-alpha',
};

assert.ok(dispatchEventStore.appendEvent(dispatchIncident), 'Dispatch recovery event should enter the live event store.');
let dispatchState = buildIncidentRecoveryContainerState(dispatchEventStore.getSnapshot(), {
  expeditionId: 'expedition-alpha',
  routeLabel: 'Ruby Ridge',
  now: Date.parse('2026-04-28T18:00:00.000Z'),
});
assert.strictEqual(dispatchState.displayMode, 'active_incident');
assert.strictEqual(dispatchState.activeIncident.dispatchEventId, dispatchIncident.id);
assert.strictEqual(dispatchEventStore.clearEvent(dispatchIncident.id), true);
dispatchState = buildIncidentRecoveryContainerState(dispatchEventStore.getSnapshot(), {
  expeditionId: 'expedition-alpha',
  routeLabel: 'Ruby Ridge',
  now: Date.parse('2026-04-28T18:00:00.000Z'),
});
assert.strictEqual(dispatchState.displayMode, 'no_incident');
assert.strictEqual(dispatchState.activeIncident, null);
dispatchEventStore.replaceLiveDispatchEvents([dispatchIncident]);
dispatchState = buildIncidentRecoveryContainerState(dispatchEventStore.getSnapshot(), {
  expeditionId: 'expedition-alpha',
  routeLabel: 'Ruby Ridge',
  now: Date.parse('2026-04-28T18:00:00.000Z'),
});
assert.strictEqual(dispatchState.displayMode, 'no_incident');

console.log('Incident Recovery polish checks passed.');
