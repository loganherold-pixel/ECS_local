const assert = require('assert');
const fs = require('fs');
const path = require('path');

const sourcePath = path.join(process.cwd(), 'components/dispatch/DispatchCadCommandCenter.tsx');
const source = fs.readFileSync(sourcePath, 'utf8');

assert.match(
  source,
  /function RecoveryAssistPinDetail\(/,
  'Recovery CAD event detail should define a pin detail component.',
);
assert.match(
  source,
  /<ThreatMapSurface event=\{event\} geometry=\{geometry\} \/>/,
  'Recovery pin detail should reuse the existing threat/map-intelligence map surface.',
);
assert.match(
  source,
  /Pin location unavailable/,
  'Recovery pin detail should show a clear missing-location fallback.',
);
assert.match(
  source,
  /getRecoveryLocationSourceLabel/,
  'Recovery pin detail should expose current/last-known GPS source text.',
);

const detailStart = source.indexOf('function EventDetailModal');
const detailEnd = source.indexOf('function ModalMetaItem', detailStart);
assert.ok(detailStart >= 0 && detailEnd > detailStart, 'EventDetailModal should exist.');
const detailModal = source.slice(detailStart, detailEnd);

assert.match(
  detailModal,
  /if \(event && meta && detail && isRecoveryCritical\) \{[\s\S]*<RecoveryAssistPinDetail event=\{event\} detail=\{detail\} large \/>/,
  'Recovery critical event detail should render the full-body pin detail immediately.',
);
assert.match(
  detailModal,
  /showDrilldown = event \? isThreatDrilldownEvent\(event\) && !isRecoveryCritical : false/,
  'Recovery critical detail should not route the user into the old threat-drilldown tab artifact.',
);
assert.match(
  detailModal,
  /overlayClass="workflow"[\s\S]*maxHeightFraction=\{1\}[\s\S]*minHeightFraction=\{1\}/,
  'Recovery critical detail should use a full-body workflow overlay.',
);
assert.doesNotMatch(
  detailModal,
  /topClearanceOverride=\{0\}|bottomClearanceOverride=\{0\}/,
  'Recovery critical detail should respect ECS body bounds instead of covering global banners.',
);
assert.match(
  detailModal,
  /accessibilityLabel="Proceed to active ping"[\s\S]*onPress=\{\(\) => onNavigateAssist\(event\)\}/,
  'Recovery detail should expose Proceed to Active Ping as an explicit user action.',
);
assert.doesNotMatch(
  detailModal,
  /onThreatAction\(event, actionId\)|accessibilityLabel=\{THREAT_ACTION_LABELS\[actionId\]\}/,
  'Recovery event detail should no longer expose Ping Threat, Mark Hazard, or Request Assist actions.',
);
assert.doesNotMatch(
  detailModal,
  /startNavigation|previewDestination|navigationHandoffStore\.setPayload/,
  'Recovery detail should not auto-start or stage navigation when merely opened.',
);
assert.match(
  detailModal,
  /title="Active GPS Ping"[\s\S]*Proceed to Active Ping/,
  'Recovery detail should frame the GPS pin as an active ping route target.',
);

assert.match(
  source,
  /navigateAssistButton: \{[\s\S]*TACTICAL\.danger/,
  'Navigate Assist should use the ECS danger/recovery semantic token.',
);

const threatActionStart = source.indexOf('function createEventFromThreatAction');
const threatActionEnd = source.indexOf('function createRecoveryAssistEvent', threatActionStart);
assert.ok(threatActionStart >= 0 && threatActionEnd > threatActionStart, 'Threat action event factory should exist.');
const threatActionFactory = source.slice(threatActionStart, threatActionEnd);

assert.match(
  threatActionFactory,
  /location: event\.location/,
  'Secondary recovery detail actions should preserve the current event GPS coordinates.',
);
assert.match(
  threatActionFactory,
  /targetEventId: event\.id/,
  'Secondary recovery detail actions should target the current CAD event.',
);
assert.match(
  threatActionFactory,
  /teamId: event\.teamId[\s\S]*sessionId: event\.sessionId[\s\S]*channelId: event\.channelId/,
  'Secondary recovery detail actions should preserve team/session/channel context.',
);
assert.match(
  threatActionFactory,
  /dedupeKey: createTargetActionDedupeKey\(actionId, event, identity\)/,
  'Secondary recovery detail actions should use event-scoped dedupe keys.',
);
assert.match(
  threatActionFactory,
  /actionId === 'ping_threat'[\s\S]*type: 'team_ping'/,
  'Ping Threat should create a team ping, not a duplicate recovery event.',
);
assert.match(
  threatActionFactory,
  /actionId === 'mark_hazard'[\s\S]*type: event\.type === 'weather' \? 'weather' : 'terrain'/,
  'Mark Hazard should create a hazard event, not a duplicate recovery event.',
);
assert.match(
  threatActionFactory,
  /type: 'assistance'/,
  'Request Assist should create an assistance event, not a duplicate recovery event.',
);
assert.doesNotMatch(
  threatActionFactory,
  /category: 'recovery_assist'|status: 'recovery_critical'/,
  'Secondary recovery detail actions should not create duplicate Recovery Critical CAD events.',
);

const threatHandlerStart = source.indexOf('const handleThreatAction = useCallback');
const threatHandlerEnd = source.indexOf('const handleNavigateAssist = useCallback', threatHandlerStart);
assert.ok(threatHandlerStart >= 0 && threatHandlerEnd > threatHandlerStart, 'Threat action handler should exist.');
const threatHandler = source.slice(threatHandlerStart, threatHandlerEnd);

assert.match(
  threatHandler,
  /const nextEvent = createEventFromThreatAction\(event, actionId, commandIdentity\)/,
  'Threat action handler should create follow-up events from the current event context.',
);
assert.match(
  threatHandler,
  /setSubmittingThreatActionKey\(null\)/,
  'Threat action handler should clear only the secondary-action submitting state.',
);
assert.doesNotMatch(
  threatHandler,
  /setNavigatingAssistEventId|saveNavigationHandoffPayload|stageNavigationFlow|router\.push/,
  'Secondary action completion should not close or override Navigate Assist state.',
);

console.log('Dispatch recovery CAD event detail checks passed.');
