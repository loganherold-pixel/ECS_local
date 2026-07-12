const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const queue = read('components/dispatch/DispatchQueueSection.tsx');
const legacyDispatch = read('components/dispatch/DispatchCommandCenter.tsx');
const cadDispatch = read('components/dispatch/DispatchCadCommandCenter.tsx');
const timeline = read('components/dispatch/DispatchTimelineSection.tsx');
const navigate = read('app/(tabs)/navigate.tsx');
const card = read('components/navigate/DispatchContextHandoffCard.tsx');
const adapter = read('lib/dispatchNavigateContextHandoff.ts');

assert.match(queue, /label="View Context"/);
assert.ok(!queue.includes('Context placeholder:'), 'Queue View Context placeholder copy should be removed.');
assert.match(queue, /permissions\.canViewMemberLocation/);
assert.match(legacyDispatch, /dispatchNavigateContextAdapter\.open/);
assert.match(legacyDispatch, /dispatchQueueItemId/);
assert.match(legacyDispatch, /dispatchPingId/);
assert.match(timeline, /View Context/);

assert.match(cadDispatch, /dispatchLinkedContextFromLiveEvent/);
assert.match(cadDispatch, /onViewContext/);
assert.match(cadDispatch, />View Context</);
assert.match(cadDispatch, /mapContextIntegration/);
assert.match(cadDispatch, /dispatchEventId=/);

const restoreStart = navigate.indexOf('const payload = await loadNavigationHandoffPayload();');
const contextBranch = navigate.indexOf('isDispatchContextNavigationPayload(payload)', restoreStart);
const routeApply = navigate.indexOf('await applyExploreNavigationPayload(payload);', restoreStart);
assert.ok(restoreStart >= 0 && contextBranch > restoreStart, 'Navigate should inspect the staged payload.');
assert.ok(contextBranch < routeApply, 'Context-only payloads must be consumed before route handoff logic.');
assert.match(navigate, /presentDispatchContextHandoff/);
assert.match(navigate, /DispatchContextHandoffCard/);
assert.match(navigate, /dispatch_context_focus/);

assert.match(card, /RETURN TO DISPATCH/);
assert.match(card, /navigate-return-to-dispatch/);
assert.ok(!card.includes('target.coordinate.lat'), 'The context card must not render precise coordinates.');
assert.ok(!card.includes('target.coordinate.lng'), 'The context card must not render precise coordinates.');

assert.match(adapter, /roadDestinationCoordinate: null/);
assert.match(adapter, /requiresOnlineRouting: false/);
assert.match(adapter, /raw: null/);
assert.ok(!adapter.includes('pinStore.create('), 'Opening context must not create pins.');
assert.ok(!adapter.includes('routeStore.setActive('), 'Opening context must not replace the active route.');
assert.ok(!adapter.includes('navigateRouteSessionStore.clear('), 'Opening context must not clear active guidance.');

console.log('Dispatch context handoff UI contract tests passed.');
