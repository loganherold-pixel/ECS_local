const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const overlayPath = path.join(root, 'components', 'navigate', 'RoadNavigationOverlay.tsx');
const source = fs.readFileSync(overlayPath, 'utf8').replace(/\r\n/g, '\n');
const navigatePath = path.join(root, 'app', '(tabs)', 'navigate.tsx');
const navigateSource = fs.readFileSync(navigatePath, 'utf8').replace(/\r\n/g, '\n');
const routePreviewModalSource = fs.readFileSync(
  path.join(root, 'components', 'discover', 'ExploreRoutePreviewModal.tsx'),
  'utf8',
).replace(/\r\n/g, '\n');
const dispersedSummarySource = fs.readFileSync(
  path.join(root, 'components', 'navigate', 'DispersedCampingRouteSummary.tsx'),
  'utf8',
).replace(/\r\n/g, '\n');
const establishedSummarySource = fs.readFileSync(
  path.join(root, 'components', 'navigate', 'EstablishedCampsitesRouteSummary.tsx'),
  'utf8',
).replace(/\r\n/g, '\n');

function assertIncludes(fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function assertNotIncludes(fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

function assertNavigateIncludes(fragment, message) {
  assert.ok(navigateSource.includes(fragment), message);
}

function assertNavigateNotIncludes(fragment, message) {
  assert.ok(!navigateSource.includes(fragment), message);
}

function extractStyleBlock(styleName) {
  const marker = `${styleName}: {`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `${styleName} style should exist.`);
  const bodyStart = start + marker.length;
  const end = source.indexOf('\n  },', bodyStart);
  assert.ok(end >= 0, `${styleName} style should be a simple StyleSheet block.`);
  return source.slice(bodyStart, end);
}

assertIncludes(
  'styles.previewBottomWrap',
  'Road Preview should use a preview-specific wrapper style.',
);
assertIncludes(
  'styles.previewStickyActionRow',
  'Road Preview actions should use a sticky action row outside the scroller so Start Guidance is visible on mobile.',
);
assertIncludes(
  'styles.previewCardScrollGuard',
  'Road Preview scroll body should reserve vertical space above sticky actions so readiness rows are not clipped on mobile.',
);
{
  const cardStart = source.indexOf('<ECSCard variant="primary" style={[styles.bottomCard, styles.previewBottomCard]}>');
  const cardEnd = source.indexOf('</ECSCard>', cardStart);
  assert.ok(cardStart >= 0 && cardEnd > cardStart, 'Road Preview card markup should be present.');
  const cardBlock = source.slice(cardStart, cardEnd);
  assert.ok(
    cardBlock.indexOf('</ScrollView>') >= 0 &&
      cardBlock.indexOf('styles.previewStickyActionRow') > cardBlock.indexOf('</ScrollView>'),
    'Road Preview Start Guidance actions should render after the scroll body, not at the bottom of hidden scroll content.',
  );
  assert.ok(
    cardBlock.includes('contentContainerStyle={styles.previewCardScrollContent}') &&
      cardBlock.includes('<View style={styles.previewCardScrollGuard} />') &&
      cardBlock.indexOf('<View style={styles.previewCardScrollGuard} />') < cardBlock.indexOf('</ScrollView>'),
    'Road Preview scroll content should include an explicit bottom guard before the sticky action row.',
  );
}
assertIncludes(
  'style={[StyleSheet.absoluteFill, styles.overlayRoot]}',
  'Road Preview overlay should have a high-priority root stacking context.',
);
assertIncludes(
  'styles.activeGuidanceWrap',
  'Active Guidance should keep its own wrapper style separate from Road Preview.',
);
assertIncludes(
  'const showSteps = false;',
  'Road Preview should hide the broken route-step action until it can open in a proper ECS sheet.',
);
assertIncludes(
  'const routeStepOverlayEnabled = false;',
  'Road Preview should disconnect the hidden route-step overlay container.',
);
assertIncludes(
  'routeStepOverlayEnabled && props.stepListExpanded && hasSteps',
  'Route-step overlay mounting should be guarded by the explicit disabled flag.',
);
assertNotIncludes(
  'false && props.stepListExpanded && hasSteps',
  'Route-step overlay disabling should be explicit rather than an opaque JSX false guard.',
);

const previewBottomWrap = extractStyleBlock('previewBottomWrap');
assert.ok(
  /alignItems:\s*'flex-start'/.test(previewBottomWrap),
  'Road Preview should anchor to the bottom-left instead of centering on wide layouts.',
);
assert.ok(
  /zIndex:\s*92/.test(previewBottomWrap) && /elevation:\s*92/.test(previewBottomWrap),
  'Road Preview wrapper should stack above camping route summary overlays on iOS/web and Android.',
);
assert.ok(
  !/alignItems:\s*'center'/.test(previewBottomWrap),
  'Road Preview must not use centered tablet/wide alignment.',
);

const overlayRoot = extractStyleBlock('overlayRoot');
assert.ok(
  /zIndex:\s*90/.test(overlayRoot) && /elevation:\s*90/.test(overlayRoot),
  'Road Navigation overlay root should remain above lower-priority map overlays rendered later.',
);

const previewBottomCard = extractStyleBlock('previewBottomCard');
assert.ok(
  /zIndex:\s*93/.test(previewBottomCard) && /elevation:\s*93/.test(previewBottomCard),
  'Road Preview card should keep controls above camping overlays and clickable.',
);
assert.ok(
  /maxHeight:\s*'100%'/.test(previewBottomCard) &&
    /overflow:\s*'hidden'/.test(previewBottomCard),
  'Road Preview card should clip internally only after the scroll body has a bottom guard.',
);
const previewCardScroll = extractStyleBlock('previewCardScroll');
assert.ok(
  /flexGrow:\s*0/.test(previewCardScroll) &&
    /minHeight:\s*0/.test(previewCardScroll),
  'Road Preview scroll body should shrink inside constrained mobile cards instead of sliding under sticky actions.',
);
const previewCardScrollContent = extractStyleBlock('previewCardScrollContent');
assert.ok(
  /paddingBottom:\s*16/.test(previewCardScrollContent),
  'Road Preview scroll content should preserve readable spacing before the sticky action guard.',
);
const previewCardScrollGuard = extractStyleBlock('previewCardScrollGuard');
assert.ok(
  /height:\s*76/.test(previewCardScrollGuard),
  'Road Preview scroll guard should reserve enough room for wrapped sticky actions on phone screens.',
);

const activeGuidanceWrap = extractStyleBlock('activeGuidanceWrap');
assert.ok(
  /alignItems:\s*'center'/.test(activeGuidanceWrap),
  'Active Guidance alignment should be unchanged by the Road Preview fix.',
);

const activeGuidanceMetricsRow = extractStyleBlock('activeGuidanceMetricsRow');
assert.ok(
  /flexWrap:\s*'wrap'/.test(activeGuidanceMetricsRow),
  'Active Guidance metrics should wrap so turn sits above remaining and ETA in the compact card.',
);
const activeGuidancePrimaryMetricChip = extractStyleBlock('activeGuidancePrimaryMetricChip');
assert.ok(
  /flexBasis:\s*'100%'/.test(activeGuidancePrimaryMetricChip),
  'Active Guidance turn metric should occupy the first compact row.',
);
assertIncludes(
  "label: metric.label.toUpperCase() === 'REMAIN' ? 'REMAINING' : metric.label",
  'Active Guidance should present Remaining instead of the shortened Remain label.',
);
assertNavigateIncludes(
  'const ACTIVE_GUIDANCE_TOP = effectiveMapExpanded',
  'Active Guidance should account for device safe-area/status chrome in fullscreen map mode.',
);
assertNavigateIncludes(
  '{ top: roadNavigationSurfaceTopOffset }',
  'Landscape dock reveal control should align vertically with Active Guidance.',
);
assertNavigateIncludes(
  'const DESTINATION_SEARCH_HORIZONTAL_INSET = Math.max(6, Math.floor(OVERLAY_EDGE * 0.5));',
  'Idle destination search should use a narrower horizontal inset so the top search bar fits more of the screen.',
);
assertNavigateIncludes(
  'left: DESTINATION_SEARCH_HORIZONTAL_INSET',
  'Idle destination search should apply the wider-screen inset on the left edge.',
);
assertNavigateIncludes(
  'right: DESTINATION_SEARCH_HORIZONTAL_INSET',
  'Idle destination search should apply the wider-screen inset on the right edge.',
);
assertNavigateIncludes(
  'maxWidth: 720',
  'Idle destination search shell should support wider map layouts without changing height or position.',
);

assert.ok(
  dispersedSummarySource.includes('zIndex: 24') && dispersedSummarySource.includes('elevation: 24'),
  'Dispersed Camping Near Route summary should stay below the Road Preview panel.',
);
assert.ok(
  establishedSummarySource.includes('zIndex: 25') && establishedSummarySource.includes('elevation: 25'),
  'Established Campsites route summary should stay below the Road Preview panel.',
);
assert.ok(
  dispersedSummarySource.includes("pointerEvents={hasResults ? 'box-none' : 'none'}") &&
    establishedSummarySource.includes("pointerEvents={hasResults ? 'box-none' : 'none'}"),
  'Empty camping route summaries should not intercept map or navigation controls.',
);
assert.ok(
  dispersedSummarySource.includes('<View pointerEvents="none" style={styles.resultStack}>') &&
    establishedSummarySource.includes('<View pointerEvents="none" style={styles.header}>'),
  'Only actionable camping summary controls should receive touches.',
);
assertNavigateIncludes(
  'zIndex: 23,\n  elevation: 23,',
  'Dispersed Camping Eligibility legend should stay below the Road Preview panel.',
);

assertNavigateIncludes(
  'CAMPOPS_MANUAL_AREA_REVIEW_ENABLED',
  'Manual CampOps area review should remain behind an explicit feature flag.',
);
assertNavigateIncludes(
  'accessibilityLabel="Draw Camp Endpoints area"',
  'Manual area review popup should keep a clear Camp Endpoints draw action label.',
);
assertNavigateIncludes(
  'INTERNAL AREA REVIEW',
  'Manual area review popup should use clear visible internal review copy.',
);
assertNavigateNotIncludes(
  "accessibilityLabel=\"Draw camp potential area\"",
  'Public Navigate tools should no longer expose the old Draw Camp Potential Area control.',
);
assertNavigateNotIncludes(
  'DRAW CAMP POTENTIAL AREA',
  'Public Navigate tools should no longer expose old Draw Camp Potential Area copy.',
);
assertNavigateIncludes(
  'accessibilityLabel="Draw route from map point"',
  'Long-press Draw Route action should have a clear accessibility label.',
);
assertNavigateIncludes(
  '<Text style={styles.longPressActionText}>DRAW ROUTE</Text>',
  'Long-press route builder entry should use a clear visible text label.',
);
assertNavigateIncludes(
  'longPressActionButton: {\n    minHeight: 34',
  'Long-press map actions should keep compact tappable rows.',
);
assertNavigateIncludes(
  'flexBasis: 126',
  'Long-press map actions should wrap into stable compact buttons on phone and tablet.',
);
assertNavigateIncludes(
  'accessibilityLabel="Navigate here"',
  'Long-press action menu should keep Navigate Here available with a clear label.',
);
assertNavigateIncludes(
  "topStatusOverlaysVisible && navigationOverlayMode !== 'preview' && !idleDestinationSearchVisible;",
  'Road Preview and the destination search should suppress the top-left Route/Preview indicator artifact.',
);
assertNavigateIncludes(
  'if (!roadStepListExpanded || navigationOverlayMode !== \'preview\') return;',
  'Road Preview should close any stale route-step expanded state.',
);
assertNavigateIncludes(
  'showSteps: false,',
  'Road Preview contexts should keep route steps hidden for this bug pass.',
);
assertNavigateNotIncludes(
  "import ExploreRoutePreviewModal from '../../components/discover/ExploreRoutePreviewModal';",
  'Navigate Route Preview should no longer open the shared preview modal from the map controls.',
);
assertNavigateNotIncludes(
  'routePreviewModalVisible',
  'Navigate Route Preview should not keep modal visibility state.',
);
assertNavigateNotIncludes(
  'setRoutePreviewModalVisible',
  'Navigate Route Preview should not open or close a popup/modal.',
);
assertNavigateIncludes(
  'buildNavigationPayloadFromRoadRoute(roadNavigation.session.route)',
  'Navigate generated road routes should normalize into the shared route-preview payload contract.',
);
assertNavigateIncludes(
  "import {\n  buildExploreRoutePreviewCameraCommand,\n  getExploreRoutePreviewRoutePoints,\n} from '../../lib/exploreRoutePreview';",
  'Navigate should use shared route-preview helpers to calculate a full-route camera command.',
);
assertNavigateIncludes(
  'const fitMapToNavigateRoutePreview = useCallback((',
  'Navigate should centralize the Route Preview camera fit behavior.',
);
assertNavigateIncludes(
  'const routePoints = getExploreRoutePreviewRoutePoints(payload);',
  'Route Preview should fit the actual route geometry and endpoints, not a popup.',
);
assertNavigateIncludes(
  'const { command } = buildExploreRoutePreviewCameraCommand(routePoints, 84);',
  'Route Preview should build a padded map camera command for the full route.',
);
assertNavigateIncludes(
  "reason: 'navigate_route_preview_overview'",
  'Route Preview should queue a map camera command with a clear reason.',
);
assertNavigateIncludes(
  "if (navigationOverlayMode === 'preview')",
  'The Road Preview overview action should use the camera behavior while a route is staged for preview.',
);
assertNavigateNotIncludes(
  '<ExploreRoutePreviewModal',
  'Navigate should not render a Route Preview popup/modal.',
);
assertNavigateNotIncludes(
  "stepListLabel: 'View route steps'",
  'Road Preview should not provide the broken View Route Steps action label.',
);
assertNavigateNotIncludes(
  "stepListLabel: 'View road steps'",
  'Road Preview should not provide the broken View Road Steps action label.',
);
assert.ok(
  !routePreviewModalSource.includes("{' '}"),
  'Route Preview modal actions must not render raw whitespace text nodes inside TouchableOpacity.',
);

console.log('Navigate Road Preview layout checks passed.');
