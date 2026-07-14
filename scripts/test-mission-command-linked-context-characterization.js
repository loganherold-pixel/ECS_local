const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const dispatchTypes = read('lib/dispatchTypes.ts');
const contextHandoff = read('lib/dispatchNavigateContextHandoff.ts');
const commandCenter = read('components/dispatch/DispatchCadCommandCenter.tsx');
const commandBoard = read('components/dispatch/DispatchMissionCommandBoard.tsx');
const fleet = read('app/(tabs)/fleet.tsx');
const navigateCard = read('components/navigate/DispatchContextHandoffCard.tsx');

for (const contextType of [
  'pin',
  'waypoint',
  'route_segment',
  'route',
  'camp',
  'rally',
  'bailout',
  'incident',
  'resource',
  'vehicle',
  'member',
  'manual',
]) {
  assert.match(
    dispatchTypes,
    new RegExp(`\\| '${contextType}'`),
    `DispatchLinkedContext should preserve ${contextType}.`,
  );
}

assert.match(commandBoard, /onViewLinkedContext\?\.\(command\)/);
assert.match(commandCenter, /const openMissionCommandContext = useCallback/);
assert.match(commandCenter, /dispatchNavigateContextAdapter\.open\(\{/);

const openContextStart = commandCenter.indexOf('const openMissionCommandContext = useCallback');
const openContextEnd = commandCenter.indexOf('\n\n  useEffect(', openContextStart);
const openContextBlock = commandCenter.slice(openContextStart, openContextEnd);
assert.doesNotMatch(openContextBlock, /applyMissionCommandMutation|transitionMissionCommand|setMissionCommand/);

assert.match(contextHandoff, /dispatchContextOnly: true/);
assert.match(contextHandoff, /requiresOnlineRouting: false/);
assert.match(contextHandoff, /trailGeometry: \[\]/);
assert.doesNotMatch(contextHandoff, /pinStore\.create|routeStore\.setActive/);

assert.match(fleet, /consumeNavigationFlow\('fleet'\)/);
assert.match(fleet, /flow\.intent === 'fleet_edit_vehicle'/);
assert.match(navigateCard, /RETURN TO DISPATCH/);

console.log('Mission Command linked-context characterization tests passed.');
