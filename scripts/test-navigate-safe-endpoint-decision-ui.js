const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const sheetSource = fs.readFileSync(
  path.join(root, 'components', 'navigate', 'SafeEndpointDecisionSheet.tsx'),
  'utf8',
);
const modelSource = fs.readFileSync(
  path.join(root, 'lib', 'campops', 'campOpsSafeEndpointDecisionMode.ts'),
  'utf8',
);
const navigateSource = fs.readFileSync(
  path.join(root, 'app', '(tabs)', 'navigate.tsx'),
  'utf8',
);

assert(
  sheetSource.includes('ECSModalShell') &&
    sheetSource.includes('ECSPanel') &&
    sheetSource.includes('ECSBadge') &&
    sheetSource.includes('SourceTruthInspectorTrigger'),
  'Safe Endpoint Decision Mode should reuse the ECS modal, panel, badge, and Source Truth Inspector primitives.',
);
assert(
  sheetSource.includes('ECSSegmentedControl') &&
    sheetSource.includes("{ key: 'no_delay', label: '0' }") &&
    sheetSource.includes("{ key: 'delay_30m', label: '30m' }") &&
    sheetSource.includes("{ key: 'delay_1h', label: '1h' }") &&
    sheetSource.includes("{ key: 'delay_2h', label: '2h' }") &&
    sheetSource.includes("{ key: 'custom', label: 'Custom' }") &&
    sheetSource.includes('Arrive Before Sunset'),
  'The sheet should expose every requested delay scenario and the daylight control.',
);
assert(
  modelSource.includes("'Recommended Endpoint'") &&
    modelSource.includes("'Backup Endpoint'") &&
    modelSource.includes("'Emergency Endpoint'") &&
    sheetSource.includes('Continue Or Divert') &&
    sheetSource.includes('Latest Turnoff') &&
    sheetSource.includes('KEY HARD-GATE RESULT'),
  'The UI contract should present endpoint roles, the decision point, latest turnoff, and hard-gate posture.',
);
assert(
  sheetSource.includes('Preview On Map') &&
    sheetSource.includes('Stage Route') &&
    sheetSource.includes('Return To Plan') &&
    sheetSource.includes('accessibilityLabel') &&
    sheetSource.includes('accessibilityState={{ selected }}'),
  'The sheet should provide accessible map preview, route staging, and return actions.',
);
assert(
  navigateSource.includes('CAMPOPS_SAFE_ENDPOINT_ENABLED ? (') &&
    navigateSource.includes('title="END DAY SAFELY"') &&
    navigateSource.includes("openToolsChildPopup('safeEndpoint')") &&
    navigateSource.includes('visible={safeEndpointDecisionVisible}'),
  'Navigate Tools should expose the user-facing action only through the existing rollout gate.',
);
assert(
  navigateSource.includes('handleSafeEndpointMapPreview') &&
    navigateSource.includes('buildCampOpsSafeEndpointMapPreviewIntent(endpoint)') &&
    navigateSource.includes("'campops_safe_endpoint_preview'") &&
    !modelSource.includes('runStore.setActive') &&
    !modelSource.includes('routeStore.setActive'),
  'Map preview should remain a bounded presentation intent and must not mutate route or plan stores.',
);
assert(
  navigateSource.includes('handleSafeEndpointStageRoute') &&
    navigateSource.includes('confirmLocalRoutePreviewCanReplaceActiveGuidance') &&
    navigateSource.includes('activeGuidanceReplacementConfirmed: true') &&
    navigateSource.includes('await endRoadNavigation()') &&
    navigateSource.includes('await endTrailNavigation()'),
  'Staging a Safe Endpoint route must pass the existing active-guidance replacement confirmation.',
);
assert(
  modelSource.includes("explanationSource: 'deterministic_campops'") &&
    sheetSource.includes('does not use AI to select or override an endpoint') &&
    !modelSource.includes('campOpsAiAssist') &&
    !sheetSource.includes('useECSAI'),
  'AI must not select, alter, or override the deterministic Safe Endpoint result.',
);
assert(
  !sheetSource.includes('apiKey') &&
    !sheetSource.includes('service_role') &&
    !sheetSource.includes('rawProviderStatus') &&
    !modelSource.includes('rawProviderStatus'),
  'The Safe Endpoint presentation must not expose provider secrets or raw provider payloads.',
);

console.log('Navigate Safe Endpoint Decision Mode UI checks passed.');
