const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const adapterSource = fs.readFileSync(path.join(root, 'lib', 'routeGuidanceReadinessPresentation.ts'), 'utf8');
const startWrapperSource = fs.readFileSync(path.join(root, 'lib', 'startGuidanceReadinessPresentation.ts'), 'utf8');
const offlineReadinessSource = fs.readFileSync(path.join(root, 'lib', 'offlineReadinessPresentation.ts'), 'utf8');
const overlaySource = fs.readFileSync(path.join(root, 'components', 'navigate', 'RoadNavigationOverlay.tsx'), 'utf8');
const navigateSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'navigate.tsx'), 'utf8');
const startDecisionSheetSource = fs.readFileSync(
  path.join(root, 'components', 'readiness', 'StartExpeditionDecisionSheet.tsx'),
  'utf8',
);
const readinessStoreSource = fs.readFileSync(
  path.join(root, 'lib', 'readiness', 'expeditionReadinessStore.ts'),
  'utf8',
);
const startReadinessSource = fs.readFileSync(
  path.join(root, 'lib', 'readiness', 'startExpeditionReadiness.ts'),
  'utf8',
);

function assertIncludes(source, fragment, message) {
  assert.ok(
    source.replace(/\r\n/g, '\n').includes(fragment.replace(/\r\n/g, '\n')),
    message,
  );
}

function assertNotIncludes(source, fragment, message) {
  assert.ok(
    !source.replace(/\r\n/g, '\n').includes(fragment.replace(/\r\n/g, '\n')),
    message,
  );
}

for (const label of ['Vehicle Fit', 'Route Confidence', 'Offline Readiness', 'Camp Intel']) {
  assertIncludes(adapterSource + overlaySource, label, `Route Guidance readiness view model should include ${label}.`);
}

assertIncludes(
  adapterSource,
  'export interface RouteGuidanceReadinessViewModel',
  'Shared presentation adapter should expose RouteGuidanceReadinessViewModel.',
);
assertIncludes(adapterSource, 'routeId: string | null;', 'Readiness view model should carry routeId.');
assertIncludes(adapterSource, 'routeType: string | null;', 'Readiness view model should carry routeType.');
assertIncludes(
  startWrapperSource,
  "from './routeGuidanceReadinessPresentation'",
  'Start Guidance helper should reuse the shared route guidance adapter instead of duplicating mapping logic.',
);
assertNotIncludes(
  startWrapperSource,
  'function vehicleFitTone',
  'Start Guidance compatibility wrapper should not duplicate tone mapping logic.',
);

assertIncludes(
  adapterSource,
  "formatOfflineReadinessLabel(level: OfflineReadinessResult['level'])",
  'Offline Readiness should use the derived offline readiness model level.',
);
assertIncludes(adapterSource, "case 'ready':\n      return 'Ready';", 'Ready offline state should render Ready.');
assertIncludes(adapterSource, "case 'partial':\n      return 'Partial';", 'Partial offline state should render Partial.');
assertIncludes(adapterSource, "return 'Not Ready';", 'Not ready offline state should render Not Ready.');
assertIncludes(
  offlineReadinessSource,
  'Route, map, guidance, and key intel are cached.',
  'Offline readiness copy should remain owned by the derived offline model.',
);

assertIncludes(
  adapterSource,
  "args.offlineReadiness.level === 'partial' || args.offlineReadiness.level === 'not_ready'",
  'Offline missing assets should take primary concern priority.',
);
assertIncludes(
  adapterSource,
  'args.offlineReadiness.reason',
  'Offline missing assets should produce the specific derived readiness reason as the primary concern.',
);
assertIncludes(
  adapterSource,
  "args.offlineReadiness.recommendedAction === 'prepare_offline'",
  'Prepare Offline should be recommended from existing Offline Readiness action only.',
);
assertIncludes(
  adapterSource,
  "actions.push({ id: 'prepare_offline', label: 'Prepare Offline' });",
  'Partial or Not Ready offline readiness should map to the existing Prepare Offline action.',
);

assertIncludes(
  adapterSource,
  'Custom route with limited ECS field support. ECS can guide the route geometry, but access, surface condition, and recent passability may be unknown.',
  'Custom routes should show the required limited ECS field support warning.',
);
assertIncludes(
  adapterSource,
  "args.routeConfidence.level === 'low'",
  'Low route confidence should be detected by the presentation adapter.',
);
assertNotIncludes(
  adapterSource,
  "actions.push({ id: 'review_route', label: 'Review Route' });",
  'Low route confidence should not add the redundant Review Route readiness action.',
);

assertIncludes(
  adapterSource,
  "if (!sites || sites.length === 0) return null;",
  'Routes without camp candidates should not show a standalone Camp Intel score.',
);
assertIncludes(
  adapterSource,
  'campIntelSummaryDisplay',
  'Camp Intel should remain a summary display field, not a scoring input.',
);
assertIncludes(
  adapterSource,
  'buildRecommendedActions({\n      routeConfidence: args.routeConfidence,\n      offlineReadiness: args.offlineReadiness,',
  'Camp Intel summary should not override route confidence, vehicle fit, or offline action mapping.',
);
assertIncludes(
  adapterSource,
  "counts.get(label)} ${label}",
  'Camp Intel summary should count ECS-Inferred/User-Supported/etc. evidence labels.',
);

assertIncludes(
  adapterSource,
  'const explicit = vehicleFit?.label ?? vehicleFit?.level ?? null;',
  'Vehicle Fit display should pass through existing Vehicle Fit label/level data.',
);
assertNotIncludes(
  adapterSource,
  'vehicleScore',
  'Route Guidance readiness must not recalculate Vehicle Fit.',
);
assertNotIncludes(
  adapterSource,
  'vehicleRisk',
  'Route Guidance readiness must not replace Vehicle Fit with route or vehicle risk.',
);

assertIncludes(
  navigateSource,
  'deriveRouteConfidence(',
  'Navigate Start Guidance should reuse the derived Route Confidence model.',
);
assertIncludes(
  navigateSource,
  'deriveOfflineReadiness({',
  'Navigate Start Guidance should reuse the derived Offline Readiness model.',
);
assertIncludes(
  navigateSource,
  'extractStartGuidanceVehicleFit(exploreNavigationPayload)',
  'Navigate Start Guidance should read existing Vehicle Fit from route payload data.',
);
assertIncludes(navigateSource, 'campIntelSites', 'Navigate Start Guidance should use existing Camp Intel candidate data.');
assertIncludes(
  navigateSource,
  'buildRouteGuidanceReadinessViewModel({',
  'Navigate should compose the shared RouteGuidanceReadinessViewModel.',
);
assertIncludes(
  navigateSource,
  "openTopPopup('offlineCache')",
  'Prepare Offline should link to the existing offline cache flow.',
);
assertIncludes(
  overlaySource,
  'Readiness before Start Guidance',
  'RoadNavigationOverlay should render the concise readiness stack before commitment.',
);
assertIncludes(
  overlaySource,
  'readinessActions.map((action)',
  'RoadNavigationOverlay should render recommended actions from the shared view model.',
);
assertIncludes(
  overlaySource,
  'Route Confidence explanation',
  'RoadNavigationOverlay should expose a short route confidence explanation area.',
);
assertIncludes(
  overlaySource,
  'onPress={onPrimaryPreviewAction ?? onStartNavigation}',
  'Existing Start Guidance button behavior should remain wired to the same action path.',
);
for (const fragment of [
  'ECS Readiness: Ready',
  'ECS Readiness: Caution',
  'ECS Readiness: Hold',
  'Review Command Brief',
  'Start Expedition',
  'Start Anyway',
  'Continue Anyway',
  'ECS recommends review before departure.',
]) {
  assertIncludes(startDecisionSheetSource + startReadinessSource, fragment, `Start Expedition decision flow must include "${fragment}".`);
}
assertIncludes(
  startReadinessSource,
  'getStartExpeditionReviewReasons',
  'Start Expedition readiness helpers should expose review reasons for hold, low-confidence, and warning states.',
);
assertIncludes(
  startReadinessSource,
  'shouldShowStartExpeditionReadinessReview',
  'Start Expedition readiness helpers should decide when the pre-start review is needed.',
);
assertIncludes(
  navigateSource,
  'shouldShowStartExpeditionReadinessReview(assessment)',
  'Navigate should only show the pre-start decision sheet when readiness concerns require review.',
);
assertIncludes(
  navigateSource,
  'getRouteGuidanceStartReviewReasons(navigationStartReadinessStack)',
  'Navigate should include route confidence/offline guidance concerns in the start review gate.',
);
assertIncludes(
  startDecisionSheetSource,
  'reviewReasons?: StartExpeditionReviewReason[]',
  'Start Expedition decision sheet should display supplemental route-start review reasons.',
);
assertIncludes(
  navigateSource,
  '<StartExpeditionDecisionSheet',
  'Navigate must render the Expedition Readiness pre-start decision sheet.',
);
assertIncludes(
  navigateSource,
  "requestStartExpedition('trail')",
  'Trail auto-start and preview starts must route through the readiness decision gate.',
);
assertIncludes(
  navigateSource,
  "requestStartExpedition('road')",
  'Road auto-start and preview starts must route through the readiness decision gate.',
);
assertIncludes(
  navigateSource,
  'recordStartExpeditionReadinessAcknowledgement',
  'Starting anyway from caution or hold must record a local acknowledgement.',
);
assertIncludes(
  readinessStoreSource,
  "readinessMode: 'planning' | 'active'",
  'Readiness store must track planning versus active expedition mode.',
);
assertIncludes(
  readinessStoreSource,
  'beginActiveExpedition(options:',
  'Readiness store must expose an active-expedition handoff method.',
);
assertNotIncludes(
  adapterSource + overlaySource + navigateSource,
  'trip readiness engine',
  'This pass must not introduce a new trip readiness engine.',
);
assertNotIncludes(
  adapterSource,
  'Camp Confidence',
  'Start Guidance must not introduce a standalone Camp Confidence score.',
);

console.log('Route Guidance readiness presentation checks passed.');
