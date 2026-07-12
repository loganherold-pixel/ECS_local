/* eslint-disable no-undef */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const component = fs.readFileSync(
  path.join(root, 'components', 'navigate', 'RouteChangeImpactPreview.tsx'),
  'utf8',
);
const navigate = fs.readFileSync(path.join(root, 'app', '(tabs)', 'navigate.tsx'), 'utf8');
const guard = fs.readFileSync(path.join(root, 'lib', 'navigationActiveGuidanceGuard.ts'), 'utf8');

assert.ok(component.includes('<ECSModalShell'));
assert.ok(component.includes('<ECSPanel'));
assert.ok(component.includes('<ECSBadge'));
assert.ok(component.includes('<SourceTruthInspectorTrigger'));
assert.ok(component.includes('BASELINE') && component.includes('CANDIDATE'));
assert.ok(component.includes('IMPROVES') && component.includes('MIXED'));
assert.ok(component.includes('WORSENS') && component.includes('UNKNOWN'));
assert.ok(component.includes('Preview only. No route, camp, expedition, convoy, or guidance state has changed.'));
assert.ok(component.includes('Active Guidance Protected'));
assert.ok(component.includes('Continue To Save'));
assert.ok(component.includes('accessibilityLabel'));

for (const forbidden of [
  'routeStore.',
  'runStore.',
  'navigateRouteSessionStore.',
  'saveNavigationHandoffPayload',
  'applyExploreNavigationPayload',
  'Accept Route',
]) {
  assert.ok(!component.includes(forbidden), `Preview UI must not mutate or accept routes: ${forbidden}`);
}

assert.ok(navigate.includes("import { RouteChangeImpactPreview } from '../../components/navigate/RouteChangeImpactPreview';"));
assert.ok(navigate.includes('buildRouteBuilderImpactPreview({'));
assert.ok(navigate.includes('ROUTE_CHANGE_IMPACT_PREVIEW_ENABLED'));
assert.ok(navigate.includes('setRouteBuilderImpactModel(model)'));
assert.ok(navigate.includes('setRouteBuilderImpactVisible(true)'));
assert.ok(navigate.includes('handleContinueRouteBuilderImpact'));
assert.ok(navigate.includes('<RouteChangeImpactPreview'));
assert.ok(navigate.includes('onContinueToSave={handleContinueRouteBuilderImpact}'));

const finishStart = navigate.indexOf('const finishRouteBuilder = useCallback');
const finishEnd = navigate.indexOf('const handleCommitRouteBuilderSave', finishStart);
const finishSource = navigate.slice(finishStart, finishEnd);
assert.ok(finishSource.includes('buildRouteBuilderImpactPreview'));
assert.ok(!finishSource.includes('saveVerifiedRouteBuilderDraft'));
assert.ok(!finishSource.includes('routeStore.setActive'));
assert.ok(!finishSource.includes('runStore.setActive'));

assert.ok(
  guard.includes('shouldProtectActiveGuidanceFromHandoff') &&
    guard.includes('ACTIVE_GUIDANCE_REPLACEMENT_CONFIRMED_AT'),
  'The established active-guidance replacement confirmation must remain intact.',
);
assert.ok(
  navigate.includes('shouldProtectActiveGuidanceFromHandoff(payload, activeRouteSnapshot)') &&
    navigate.includes('ACTIVE GUIDANCE PROTECTED - END NAVIGATION BEFORE PREVIEWING A NEW ROUTE'),
  'Navigate must continue rejecting unconfirmed active-guidance replacement handoffs.',
);

console.log('Route Change Impact UI and no-mutation contract checks passed.');
