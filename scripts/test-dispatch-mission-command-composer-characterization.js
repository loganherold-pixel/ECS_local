const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();

function read(...segments) {
  return fs.readFileSync(path.join(root, ...segments), 'utf8').replace(/\r\n/g, '\n');
}

const routedDispatch = read('components', 'dispatch', 'DispatchCadCommandCenter.tsx');
const legacyDispatch = read('components', 'dispatch', 'DispatchCommandCenter.tsx');
const tabRoute = read('app', '(tabs)', 'alert.tsx');

assert.match(
  tabRoute,
  /DispatchCadCommandCenter/,
  'The Dispatch tab must remain routed through DispatchCadCommandCenter.',
);
assert.match(
  routedDispatch,
  /type DispatchCommandType\s*=\s*[\s\S]*?'check_in'[\s\S]*?'ping'[\s\S]*?'assist'[\s\S]*?'rally'[\s\S]*?'hazard'[\s\S]*?'resource'/,
  'The routed legacy command surface must retain all existing command entry types during consolidation.',
);
assert.match(
  routedDispatch,
  /const openCommand = useCallback\(\(command: DispatchCommandType\)/,
  'Existing routed command entry points must continue to converge through one openCommand handler.',
);
assert.match(
  routedDispatch,
  /if \(!activeCommand \|\| commandSubmittingRef\.current\)/,
  'The existing repeated-submit guard must remain characterized before composer replacement.',
);
assert.match(
  routedDispatch,
  /activeCommand === 'hazard'[\s\S]*?HazardRecoveryCadEventModal[\s\S]*?DispatchCommandModal/,
  'Hazard and other legacy forms currently branch only at presentation and must be adapted into one workflow.',
);
assert.match(
  routedDispatch,
  /<MoreActionsModal[\s\S]*?openCommand\(command\)/,
  'More Actions must keep routing its legacy entries through the shared command opener.',
);
assert.match(
  legacyDispatch,
  /DispatchTeamPingComposer/,
  'The non-routed compatibility Dispatch surface still owns the older team ping composer.',
);
assert.match(
  legacyDispatch,
  /DispatchAssistRequestComposer/,
  'The non-routed compatibility Dispatch surface still owns the older assist composer.',
);

console.log('Dispatch Mission Command composer characterization checks passed.');
