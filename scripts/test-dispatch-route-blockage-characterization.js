const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const frameworkTypes = read('lib/dispatchOperationalPlaybookTypes.ts');
const frameworkDomain = read('lib/dispatchOperationalPlaybookDomain.ts');
const commandTypes = read('lib/dispatchMissionCommandTypes.ts');
const linkedContext = read('lib/dispatchMissionCommandContext.ts');
const routeImpact = read('lib/routeImpact/routeChangeImpact.ts');
const routeGeometry = read('lib/routeContext/routeContextGeometry.ts');
const guidanceGuard = read('lib/navigationActiveGuidanceGuard.ts');
const routeSession = read('lib/navigateRouteSessionStore.ts');
const bailoutStore = read('lib/bailoutStore.ts');
const offlineReadiness = read('lib/offlinePrepPack/offlineReadinessCoordinator.ts');
const campOps = read('lib/campops/campOpsSafeEndpoint.ts');
const incidentStore = read('lib/incidentRecoveryWorkflowStore.ts');
const commandCenter = read('components/dispatch/DispatchCadCommandCenter.tsx');

assert.match(frameworkTypes, /create_command_proposal/);
assert.match(frameworkTypes, /request_acknowledgment/);
assert.match(frameworkTypes, /open_context/);
assert.match(frameworkTypes, /record_decision/);
assert.match(frameworkDomain, /executeOperationalPlaybookStep/);
assert.match(commandTypes, /MissionCommandType = DispatchPingType \| 'recovery'/);

assert.match(linkedContext, /openNavigate/);
assert.match(routeImpact, /export function compareRoutePlans/);
assert.match(routeImpact, /mutationAllowed: false/);
assert.match(routeGeometry, /export function nearestPointOnRoute/);
assert.match(guidanceGuard, /shouldProtectActiveGuidanceFromHandoff/);
assert.match(routeSession, /export const navigateRouteSessionStore/);
assert.match(bailoutStore, /export const bailoutStore/);
assert.match(offlineReadiness, /getLatestForRoute/);
assert.match(campOps, /export function findCampOpsSafeEndPoint/);
assert.match(incidentStore, /export type ReportIncidentInput/);

assert.match(commandCenter, /missionCommandContextAdapter/);
assert.match(commandCenter, /navigateRouteSessionStore/);
assert.match(commandCenter, /activeTripModeStore/);

assert.doesNotMatch(
  frameworkDomain,
  /contactEmergencyServices|sendSms|placePhoneCall|publishHazardPublicly/,
  'Operational Playbooks must remain ECS team coordination only.',
);

console.log('Dispatch Route Blockage characterization checks passed.');
