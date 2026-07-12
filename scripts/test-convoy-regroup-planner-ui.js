/* eslint-disable no-undef */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const panelSource = read('components/dispatch/DispatchConvoyCommandPanel.tsx');
const sheetSource = read('components/dispatch/ConvoyRegroupPlannerSheet.tsx');
const commandSource = read('components/dispatch/DispatchCadCommandCenter.tsx');
const rolloutSource = read('lib/dispatchRolloutConfig.ts');
const permissionSource = read('lib/dispatchPermissionAdapter.ts');
const liveEventSource = read('lib/dispatchLiveEvents.ts');
const handoffSource = read('lib/dispatchNavigateContextHandoff.ts');

assert.match(rolloutSource, /convoyRegroupPlanner:\s*false/);
assert.match(rolloutSource, /position-sharing privacy and multi-device QA gates pass/);
assert.match(permissionSource, /'plan_convoy_regroup'/);
assert.match(permissionSource, /requires expedition lead or Dispatch admin access/);

for (const required of [
  'dispatch-convoy-regroup-action',
  'selectConvoyRegroupPlannerResult',
  'members: liveMapMembers',
  '!regroupPlannerPermissionAllowed',
  'readConvoyRegroupLocalContext',
  'ConvoyRegroupPlannerSheet',
]) {
  assert.ok(panelSource.includes(required), `Convoy panel should include ${required}`);
}

assert.ok(
  panelSource.indexOf('!regroupPlannerPermissionAllowed') < panelSource.indexOf('readConvoyRegroupLocalContext({'),
  'permission/rollout guards should appear before local candidate-store reads',
);
assert.ok(!panelSource.includes('members: mapMembers'), 'fallback/demo map members must not drive regroup planning');

for (const required of [
  'convoy-regroup-planner-sheet',
  'Only fresh, accurate, permission-visible live positions are projected',
  'No eligible member positions are available for projection.',
  'Create Rally Ping',
  'Preview only.',
  'will not message the convoy',
  'claim this point is safe or legal',
  'SourceTruthInspectorTrigger',
]) {
  assert.ok(sheetSource.includes(required), `Regroup sheet should include ${required}`);
}
assert.ok(!/\.latitude\.toFixed|\.longitude\.toFixed|coordinate\.lat/.test(sheetSource), 'sheet must not render precise coordinates');

for (const required of [
  'handlePreviewConvoyRegroupProposal',
  'createConvoyRegroupDispatchContext(proposal)',
  'dispatchNavigateContextAdapter.open',
  "returnRoute: '/alert'",
  'handleCreateConvoyRegroupRallyDraft',
  "setActiveCommand('rally')",
  'Rally draft opened. Nothing has been sent.',
  'convoy-regroup-rally-draft-context',
  'Require Acknowledgment',
  "coordinationType: regroupDraft ? 'rally' : undefined",
  'requiresAcknowledgment: form.requireAcknowledgment',
]) {
  assert.ok(commandSource.includes(required), `CAD command center should include ${required}`);
}

const rallyDraftStart = commandSource.indexOf('const handleCreateConvoyRegroupRallyDraft');
const rallyDraftEnd = commandSource.indexOf('const forceProfileSetup', rallyDraftStart);
const rallyDraftHandler = commandSource.slice(rallyDraftStart, rallyDraftEnd);
assert.ok(rallyDraftHandler.includes('setCommandForm'));
assert.ok(!rallyDraftHandler.includes('appendEvent('), 'opening the Rally draft must not append an event');
assert.ok(!rallyDraftHandler.includes('publish'), 'opening the Rally draft must not publish');
assert.ok(
  rallyDraftHandler.indexOf("dispatchPermissionSnapshot.can('plan_convoy_regroup')") < rallyDraftHandler.indexOf('setCommandForm'),
  'planner and location permissions must be checked before staging a Rally draft',
);

const previewStart = commandSource.indexOf('const handlePreviewConvoyRegroupProposal');
const previewEnd = commandSource.indexOf('const handleCreateConvoyRegroupRallyDraft', previewStart);
const previewHandler = commandSource.slice(previewStart, previewEnd);
assert.ok(
  previewHandler.indexOf("dispatchPermissionSnapshot.can('view_member_location')") < previewHandler.indexOf('dispatchNavigateContextAdapter.open'),
  'member-location permission must be checked before staging a map preview',
);
assert.ok(previewHandler.includes("getDispatchRolloutDisabledCopy('mapContextIntegration')"));

const submitStart = commandSource.indexOf('const submitCommand = useCallback');
const submitEnd = commandSource.indexOf('const handleEventAction', submitStart);
const submitHandler = commandSource.slice(submitStart, submitEnd);
assert.ok(submitHandler.includes('appendEvent(event, queued)'), 'only explicit composer submission should create the Rally event');
assert.ok(submitHandler.includes("dispatchPermissionSnapshot.can('send_team_wide_ping')"));

for (const required of [
  'coordinationType?: DispatchCoordinationType',
  'requiresAcknowledgment?: boolean',
  'proposalFingerprint?: string',
  'proposalCandidateId?: string',
]) {
  assert.ok(liveEventSource.includes(required), `Dispatch event contract should preserve ${required}`);
}
assert.ok(handoffSource.includes("if (event.coordinationType === 'rally') return 'rally';"));
assert.ok(handoffSource.includes("if (event.coordinationType === 'rally') return 'manual';"));
assert.ok(commandSource.includes("return form.regroupDraft ? 'team_ping' : 'route';"), 'legacy Rally events should retain their route event type');

console.log('Convoy Regroup Planner UI and no-auto-action contract tests passed.');
