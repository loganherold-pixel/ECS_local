const assert = require('assert');
const fs = require('fs');
const path = require('path');

const dispatchPath = path.join(process.cwd(), 'components/dispatch/DispatchCadCommandCenter.tsx');
const navigatePath = path.join(process.cwd(), 'app/(tabs)/navigate.tsx');
const handoffPath = path.join(process.cwd(), 'lib/navigationHandoffStore.ts');
const roadPath = path.join(process.cwd(), 'lib/mapboxRoadNavigation.ts');

const dispatchSource = fs.readFileSync(dispatchPath, 'utf8');
const navigateSource = fs.readFileSync(navigatePath, 'utf8');
const handoffSource = fs.readFileSync(handoffPath, 'utf8');
const roadSource = fs.readFileSync(roadPath, 'utf8');

assert.match(
  handoffSource,
  /NavigationHandoffSource = 'search' \| 'explore' \| 'saved' \| 'import' \| 'dispatch'/,
  'Navigation handoff should support Dispatch as a source.',
);
assert.match(
  handoffSource,
  /\| 'dispatch_recovery'/,
  'Navigation handoff route sources should support dispatch_recovery.',
);
assert.match(
  roadSource,
  /\| 'dispatch_recovery'/,
  'Road navigation destination source should support dispatch_recovery.',
);
assert.match(
  handoffSource,
  /sourceType: payload\.routeSource === 'dispatch_recovery' \? 'dispatch_recovery' : 'explore_handoff'/,
  'Road destinations created from dispatch recovery handoffs should preserve dispatch_recovery source metadata.',
);

assert.match(
  dispatchSource,
  /function buildRecoveryAssistNavigationPayload\(event: DispatchEvent\): NavigationHandoffPayload/,
  'Dispatch should build a typed recovery assist navigation payload.',
);
assert.match(
  dispatchSource,
  /source: 'dispatch'[\s\S]*routeSource: 'dispatch_recovery'[\s\S]*navigationMode: 'recovery_assist'/,
  'Recovery assist payload should carry dispatch source, dispatch_recovery route source, and recovery_assist mode.',
);
assert.match(
  dispatchSource,
  /recoveryAssistEventId: event\.id[\s\S]*dispatchEventId: event\.id/,
  'Recovery assist payload should include the CAD event id in metadata.',
);
assert.match(
  dispatchSource,
  /if \(!isValidCoordinate\(event\.location\)\) \{[\s\S]*Recovery request location unavailable/,
  'Navigate Assist should fail clearly when CAD event coordinates are missing.',
);
assert.match(
  dispatchSource,
  /Navigate to Recovery Request/,
  'Recovery drilldown should expose the recovery request navigation action.',
);
assert.match(
  dispatchSource,
  /await saveNavigationHandoffPayload\(payload\);[\s\S]*await stageNavigationFlow\(\{[\s\S]*autoStartNavigation: true[\s\S]*navigationMode: 'recovery_assist'/,
  'Navigate Assist should stage a recovery-assist auto-start handoff only after the button handler runs.',
);
assert.match(
  dispatchSource,
  /setTimeout\(\(\) => \{[\s\S]*router\.push\('\/navigate' as any\);[\s\S]*\}, 0\)/,
  'Navigate Assist should transition to the Navigate tab after staging the handoff.',
);

assert.match(
  navigateSource,
  /const isRecoveryAssistNavigationPayload = useCallback/,
  'Navigate should recognize recovery-assist handoff payloads.',
);
assert.match(
  navigateSource,
  /const shouldAutoStartNavigationPayload = useCallback/,
  'Navigate should gate auto-start behavior through an explicit helper.',
);
assert.match(
  navigateSource,
  /isRecoveryAssistNavigationPayload\(payload\)[\s\S]*autoStartNavigation === true/,
  'Auto-start should be limited to recovery-assist handoffs with explicit autoStartNavigation.',
);
assert.match(
  navigateSource,
  /pendingAutoStartRouteIdRef\.current = payload\.id;[\s\S]*RECOVERY ASSIST ROUTE STARTING/,
  'Navigate should mark recovery-assist payloads for active guidance startup.',
);
assert.match(
  navigateSource,
  /if \(explorePreviewMode !== 'road'\) return;[\s\S]*roadNavigation\.session\.status !== 'route_preview'[\s\S]*requestStartExpedition\('road'\);/,
  'Navigate should request road guidance only after the recovery assist route preview exists.',
);
assert.match(
  navigateSource,
  /RECOVERY ASSIST ROUTE UNAVAILABLE/,
  'Navigate should expose route calculation failure for recovery assist handoffs.',
);

console.log('Dispatch Navigate Assist action checks passed.');
