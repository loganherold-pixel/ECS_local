const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const navigateSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'navigate.tsx'), 'utf8');
const mapRendererSource = fs.readFileSync(path.join(root, 'components', 'navigate', 'MapRenderer.tsx'), 'utf8');
const campDetailSource = fs.readFileSync(path.join(root, 'components', 'navigate', 'CampIntelDetailCard.tsx'), 'utf8');
const campMarkerLayerSource = fs.readFileSync(path.join(root, 'components', 'navigate', 'CampIntelMarkerLayer.tsx'), 'utf8');

function assertIncludes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function assertNotIncludes(source, fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

function styleBlock(source, styleName) {
  const start = source.indexOf(`${styleName}: {`);
  assert.notStrictEqual(start, -1, `Expected style block ${styleName} to exist.`);
  const closeMatch = source.slice(start).match(/\n\s*},/);
  const end = closeMatch ? start + closeMatch.index : -1;
  assert.notStrictEqual(end, -1, `Expected style block ${styleName} to close.`);
  return source.slice(start, end);
}

function blockBetween(source, startFragment, endFragment) {
  const start = source.indexOf(startFragment);
  assert.notStrictEqual(start, -1, `Expected source to include ${startFragment}`);
  const end = source.indexOf(endFragment, start);
  assert.notStrictEqual(end, -1, `Expected source to include ${endFragment}`);
  return source.slice(start, end);
}

// Compact draw control layout.
assertIncludes(
  navigateSource,
  'accessibilityLabel="Draw area to search for campsites"',
  'Pressing Draw should expose the campsite area draw control.',
);
assertNotIncludes(navigateSource, 'DRAW CAMPSITE AREA', 'Draw mode should not render the old toolbox title.');
assertNotIncludes(navigateSource, 'Tap to draw a campsite area.', 'Draw mode should not render the old instruction notification.');

const controlStackStyle = styleBlock(navigateSource, 'campsiteAreaControlStack');
assertIncludes(controlStackStyle, "position: 'absolute'", 'The overall campsite-area control stack may stay absolutely positioned.');
assertIncludes(controlStackStyle, 'gap: 6', 'The campsite-area stack should keep compact spacing around the action bar.');
assertIncludes(navigateSource, '<View style={styles.campsiteAreaActionBar}>', 'Draw mode should render a compact action container.');

// Clear / Finish button polish.
assertNotIncludes(navigateSource, "{'Close\\nPolygon'}", 'Draw mode should no longer render the Close Polygon action.');
assertNotIncludes(navigateSource, 'accessibilityLabel="Close polygon"', 'Draw mode should not expose a Close Polygon accessibility action.');
assertIncludes(navigateSource, 'accessibilityLabel="Clear campsite drawing"', 'Draw mode should expose Clear.');
assertIncludes(navigateSource, 'accessibilityLabel="Finish campsite drawing"', 'Draw mode should expose Finish.');
const floatingToolsBlock = blockBetween(
  navigateSource,
  'const floatingToolsVisible =',
  'const compassOverlayVisible',
);
assertIncludes(
  floatingToolsBlock,
  'mapOverlayStartupReady',
  'The floating Draw/Build Route/Tools rail should stay available whenever the map overlay is ready.',
);
assertNotIncludes(
  floatingToolsBlock,
  '!campsiteDrawMode',
  'Draw mode must not hide the persistent map controls rail.',
);
assertNotIncludes(
  floatingToolsBlock,
  'campsiteDrawingPoints.length === 0',
  'Generated or partially drawn campsite polygons must not hide the persistent map controls rail.',
);
assert.ok(
  (navigateSource.match(/styles\.campsitePolygonActionButton/g) ?? []).length >= 2,
  'Clear and Finish should both use the fixed campsite polygon action size.',
);
assert.ok(
  /style=\{\[styles\.routeBuilderStatusAction,\s*styles\.campsitePolygonActionButton\]\}\s*onPress=\{clearCampsiteDrawing\}/.test(navigateSource),
  'Clear should use the same fixed campsite polygon action size.',
);
assert.ok(
  /style=\{\[styles\.routeBuilderStatusAction,\s*styles\.campsitePolygonActionButton/.test(navigateSource) &&
    navigateSource.includes('onPress={finishCampsiteDrawing}'),
  'Finish should use the same fixed campsite polygon action size.',
);

const polygonButtonStyle = styleBlock(navigateSource, 'campsitePolygonActionButton');
assertIncludes(polygonButtonStyle, 'width: 58', 'Clear and Finish should share the same width.');
assertIncludes(polygonButtonStyle, 'height: 34', 'Clear and Finish should share the same height.');
const polygonActionBarStyle = styleBlock(navigateSource, 'campsiteAreaActionBar');
assertIncludes(polygonActionBarStyle, "alignSelf: 'center'", 'Polygon action controls should shrink to the button group instead of stretching.');
assertIncludes(polygonActionBarStyle, "flexWrap: 'nowrap'", 'Polygon action controls should stay as one tight row.');
assertIncludes(polygonActionBarStyle, 'flexShrink: 0', 'Polygon action controls should not collapse around the fixed-size buttons.');
const polygonTextStyle = styleBlock(navigateSource, 'campsitePolygonActionText');
assertIncludes(polygonTextStyle, "textAlign: 'center'", 'Draw action labels should be centered.');
assertIncludes(polygonTextStyle, 'lineHeight: 9', 'Draw action labels should use stable line height.');
assertNotIncludes(polygonTextStyle, 'wordBreak', 'Draw action labels must not opt into letter-by-letter word breaking.');
assertNotIncludes(polygonTextStyle, 'break-all', 'Draw action labels must not use break-all wrapping.');
assertNotIncludes(polygonTextStyle, 'overflowWrap', 'Draw action labels must not force arbitrary character wrapping.');

// Campsite marker label.
assertIncludes(
  mapRendererSource,
  "return '\\\\u26FA';",
  'Campsite marker display label should use a tent icon escape that survives source encoding.',
);
assertNotIncludes(
  mapRendererSource,
  "return '⛺';",
  'Campsite marker display label should not use a raw Unicode glyph that can mojibake in tooling.',
);
assertIncludes(
  mapRendererSource,
  'badgeEl.textContent = campMarkerDisplayLabel();',
  'Campsite marker badge text should come from the campsite display-label mapping.',
);
assertIncludes(mapRendererSource, 'text-transform: none;', 'Campsite marker badge CSS must preserve the icon glyph.');
assertNotIncludes(
  mapRendererSource,
  "badgeEl.textContent = String(badge.label || '').slice(0, 4);",
  'Campsite marker badge must not truncate Legal uncertainty into LEGA.',
);
assertNotIncludes(mapRendererSource, "'LEGA'", 'Campsite marker label should never hardcode LEGA.');

// Campsite marker popup behavior.
assertIncludes(
  mapRendererSource,
  "send('pinTap', Object.assign({ kind: 'campIntel' }, item));",
  'Clicking a campsite marker should emit a campIntel tap payload.',
);
assertIncludes(
  mapRendererSource,
  'id: rawMarkerId ?? toMarkerId',
  'Campsite marker normalization should preserve the CampIntel site id so marker taps open the exact campsite.',
);
assertIncludes(
  mapRendererSource,
  "if (payload?.kind === 'campIntel')",
  'MapRenderer campIntel marker taps should route to campsite selection handling.',
);
assertIncludes(
  navigateSource,
  'onCampIntelTap={handleCampIntelTap}',
  'Navigate should wire camp marker taps to the campsite popup selection handler.',
);
assertIncludes(
  navigateSource,
  "setSelectedCampIntelId(typeof payload?.id === 'string' ? payload.id : null);",
  'Clicking a campsite marker should select that specific campsite.',
);
assertIncludes(
  navigateSource,
  'visible={campIntelVisible && !!selectedCampIntel}',
  'Selecting a campsite should open the camp intel detail popup.',
);
assertIncludes(
  navigateSource,
  'site={selectedCampIntel}',
  'The popup should receive the selected campsite, so clicking another marker updates the content.',
);
assertIncludes(
  navigateSource,
  'onDismiss={handleCampIntelDismiss}',
  'The camp intel popup should expose a dismissal path.',
);
assertIncludes(
  navigateSource,
  'topOffset={campsiteDetailTopOffset}',
  'Camp Intel detail should use the shared campsite detail top offset.',
);
assertIncludes(
  navigateSource,
  ': 0;',
  'Camp Intel detail should still start at the top of the ECS app body outside active route overlays.',
);
assertIncludes(
  navigateSource,
  'bottomOffset={LOWER_DOCK_EXCLUSION}',
  'Camp Intel detail should stop above the bottom CommandDock.',
);
assertIncludes(
  navigateSource,
  'rightInset={0}',
  'Camp Intel detail should use the full app body width.',
);
assertIncludes(
  campDetailSource,
  'pointerEvents="box-none"',
  'Camp Intel outer layer should avoid stealing gestures from the scrollable card.',
);
assertNotIncludes(
  campDetailSource,
  'onStartShouldSetResponder={() => true}',
  'Camp Intel detail should not force responder ownership ahead of the ScrollView.',
);
assertNotIncludes(
  campDetailSource,
  'onMoveShouldSetResponder',
  'Camp Intel detail should let the ScrollView own vertical drag gestures.',
);
assertIncludes(
  campDetailSource,
  'zIndex: 172',
  'Camp Intel detail should render above the persistent map controls layer.',
);
assertIncludes(
  campDetailSource,
  'elevation: 172',
  'Camp Intel detail should render above the persistent map controls layer on Android.',
);
assertIncludes(
  navigateSource,
  'modal: 160',
  'Navigate should define a modal overlay z-index tier above utility controls.',
);
assertIncludes(
  navigateSource,
  'utility: 110',
  'Navigate should keep Draw/Build Route/Tools on the lower utility overlay tier.',
);
assertIncludes(
  navigateSource,
  'selectedCampIntelId && styles.mapFloatingControlsLayerPersistent',
  'Floating controls should be demoted below popup content whenever Camp Intel is selected.',
);
assertIncludes(
  navigateSource,
  'zIndex: NAV_OVERLAY_Z.modal - 4',
  'Persistent map controls should stay below the modal tier while popups are open.',
);
assertIncludes(
  navigateSource,
  'zIndex: NAV_OVERLAY_Z.modal',
  'Popup/modal layers should remain above persistent map controls.',
);
assertIncludes(
  campDetailSource,
  "overscrollBehavior: 'contain'",
  'Camp Intel web scroll should contain overscroll instead of passing gestures to the map.',
);
assertIncludes(
  campDetailSource,
  "touchAction: 'pan-y'",
  'Camp Intel web scroll should explicitly support vertical panning.',
);
assertIncludes(
  campDetailSource,
  'nestedScrollEnabled',
  'Camp Intel scroll should support nested scrolling on native platforms.',
);
const campScrollBlock = blockBetween(campDetailSource, '<ScrollView', '</ScrollView>');
assertIncludes(
  campScrollBlock,
  'keyboardShouldPersistTaps="handled"',
  'Camp Intel scroll should keep action buttons tappable while the scroll view owns vertical gestures.',
);
assertIncludes(
  campScrollBlock,
  'scrollEventThrottle={16}',
  'Camp Intel scroll should update smoothly on mobile touch devices.',
);
assertIncludes(
  styleBlock(campDetailSource, 'scroll'),
  'minHeight: 0',
  'Camp Intel ScrollView should be allowed to shrink inside the full-height popup shell.',
);
assertIncludes(
  campDetailSource,
  'flexGrow: 1',
  'Camp Intel scroll content should flex inside the full-body card instead of relying on fixed-height hacks.',
);
const dismissBlock = blockBetween(navigateSource, 'const handleCampIntelDismiss = useCallback(() => {', '}, []);');
assertIncludes(dismissBlock, 'setSelectedCampIntelId(null);', 'Dismissing the popup should clear the selected campsite.');
assertIncludes(dismissBlock, 'setCampIntelComparisonVisible(false);', 'Dismissing the popup should close nearby comparison state.');
const clearDrawingBlock = blockBetween(navigateSource, 'const clearCampsiteDrawing = useCallback(() => {', 'const saveCampsiteDrawing = useCallback(() => {');
assertIncludes(clearDrawingBlock, 'setSelectedCampIntelId(null);', 'Clearing a campsite polygon should clear the selected campsite pin.');
assertIncludes(
  campMarkerLayerSource,
  'rankCampIntelSitesForMarkerDisplay(sites)',
  'Camp marker layer should rank displayed sites before applying the marker cap.',
);
assertIncludes(
  campMarkerLayerSource,
  'rank: index + 1',
  'Camp marker layer should attach sequential ranking labels to displayed camps.',
);
assertIncludes(
  campMarkerLayerSource,
  'b.overallScore - a.overallScore',
  'Camp marker ranking should prioritize the highest campsite score.',
);
assertIncludes(
  campMarkerLayerSource,
  '...toCampIntelMarkerPayload(site, selectedCampId === site.id)',
  'Only one camp marker should receive selected pin state at a time.',
);
assertIncludes(mapRendererSource, 'camp-intel-beacon', 'Every displayed camp marker should render a subtle beacon element.');
assertIncludes(mapRendererSource, '@keyframes campIntelBeaconEcho', 'Camp beacon effect should run inside the map, not through React rerenders.');
assertIncludes(
  mapRendererSource,
  'core.textContent = campMarkerRankLabel(item);',
  'Camp marker core should show the ranked campsite label instead of category lettering.',
);
assertIncludes(
  mapRendererSource,
  '.camp-intel-marker.camp-intel-selected .camp-intel-core',
  'Selected camp marker should override the normal green/category fill.',
);
assertIncludes(mapRendererSource, 'background: #D9433F;', 'Selected camp marker interior should turn red.');
assertIncludes(mapRendererSource, 'camp-intel-ripple', 'Selected camp markers should render a refined ripple element.');
assertIncludes(mapRendererSource, '@keyframes campIntelSelectedRipple', 'Selected camp marker ripple should use CSS animation inside the map, not React rerenders.');
assertIncludes(
  mapRendererSource,
  "anchor: 'center'",
  'Camp markers should center-anchor so selected and unselected dots stay fixed on campsite coordinates.',
);
assertIncludes(
  mapRendererSource,
  'offset: [0, 0]',
  'Camp markers should avoid screen-space offsets that can drift across zoom levels.',
);
assertIncludes(
  mapRendererSource,
  "if (item.selected) {\n          var ripple = document.createElement('div');",
  'Only the selected campsite marker should create the animated ripple.',
);
assertIncludes(campDetailSource, 'Rating {ratingLetter}', 'The popup should show the selected campsite rating.');
assertIncludes(campDetailSource, '<Text style={styles.sectionTitle}>Rating factors</Text>', 'The popup should show a rating factors section.');
assertIncludes(campDetailSource, '<Text style={styles.sectionTitle}>Why this camp</Text>', 'The popup should explain why this campsite was chosen.');
assertIncludes(campDetailSource, '<Text style={styles.sectionTitle}>Location / Latest Evidence</Text>', 'The popup should show campsite coordinates/source context.');
assertIncludes(campDetailSource, 'buildLocationRows(site, searchContext)', 'The popup should derive supporting campsite location/source intel from the selected site and search context.');
assertIncludes(
  campDetailSource,
  'const ratingFactors = site.ratingFactors?.length ? site.ratingFactors : buildRatingFactors(site);',
  'The popup should prefer detailed rating factors when available.',
);
assertIncludes(
  campDetailSource,
  'return <Text style={styles.ratingFallbackText}>{RATING_FALLBACK_EXPLANATION}</Text>;',
  'The popup should show a fallback explanation when no factors are available.',
);
assertIncludes(
  blockBetween(campDetailSource, '<ScrollView', '</ScrollView>'),
  '<View style={styles.actionsFooter}>',
  'Camp Intel actions should be reachable at the end of the scroll area.',
);
assertIncludes(
  navigateSource,
  'const savedNow = campIntel.saveCamp(selectedCampIntel.id);',
  'Save Camp should explicitly save instead of toggling the campsite off on double tap.',
);
assertIncludes(
  navigateSource,
  "showToast(savedNow ? 'CAMP SAVED' : 'CAMP ALREADY SAVED');",
  'Save Camp should give idempotent feedback.',
);
assertIncludes(
  navigateSource,
  'const reportedNow = campIntel.reportCampUnusable(selectedCampIntel.id);',
  'Report Unusable should record an idempotent campsite rejection.',
);
assertIncludes(
  navigateSource,
  'setCampIntelComparisonVisible(true);',
  'Compare Nearby should open the comparison view.',
);
assertIncludes(
  navigateSource,
  'comparisonVisible={campIntelComparisonVisible}',
  'Camp Intel popup should receive comparison visibility state.',
);
assertIncludes(
  campDetailSource,
  '<Text style={styles.sectionTitle}>Nearby comparison</Text>',
  'Camp Intel popup should render a nearby comparison experience.',
);
assertIncludes(
  navigateSource,
  "showToast(`ROUTE PREVIEW STARTED: ${selectedCampIntel.label.toUpperCase()}`);",
  'Navigate Here should confirm route preview startup.',
);
assertNotIncludes(
  campDetailSource,
  'Show detailed assessment',
  'Camp Intel should not render the detailed assessment dropdown.',
);
assertNotIncludes(
  campDetailSource,
  'detailsExpanded',
  'Camp Intel should not keep detailed assessment expansion state.',
);
assertNotIncludes(
  campDetailSource,
  'Vehicle-specific assessment',
  'Camp Intel should remove lower detailed-assessment content below the action controls.',
);

// Closed-polygon campsite selection should happen on the map, not through a top-five menu.
assertNotIncludes(
  navigateSource,
  'const polygonCampPanelSites = useMemo',
  'Closed polygon UI should not derive a list-style top-camp panel.',
);
assertNotIncludes(
  navigateSource,
  'function buildPolygonCampReasonLines',
  'Closed polygon UI should not build row explanations for a removed panel.',
);
assertNotIncludes(
  navigateSource,
  'TOP 5 VIABLE CAMPS',
  'Closed polygon UI should not open a top-five campsite list/menu.',
);
assertNotIncludes(
  navigateSource,
  '`Top ${cappedCount} viable camp',
  'Closed polygon status copy should not describe the marker-first flow as a top-five menu.',
);
assertIncludes(
  navigateSource,
  'campsiteDrawControlsVisible',
  'Campsite drawing controls should use the shared bottom overlay visibility.',
);
assertIncludes(
  navigateSource,
  'styles.campsiteAreaControlStack',
  'Campsite drawing controls should render in the compact bottom map overlay stack.',
);
assertNotIncludes(
  navigateSource,
  'Area closed',
  'The non-useful Area Closed campsite container text should not render.',
);
assertNotIncludes(
  navigateSource,
  'onPress={() => handleSelectPolygonCampSite(site.id)}',
  'Campsite selection should come from map markers, not list rows.',
);
assertNotIncludes(
  navigateSource,
  'accessibilityLabel="Build route to selected campsite"',
  'The removed top-five panel should not expose a separate Build Route action.',
);
assertIncludes(
  navigateSource,
  "navigationOverlayMode !== 'active' &&",
  'Campsite area panel should not cover active route guidance after route activation.',
);
assertIncludes(
  navigateSource,
  'campsiteDrawingClosed &&',
  'Closed polygon controls should remain available for Clear/Finish state after polygon completion.',
);
assertNotIncludes(
  navigateSource,
  'accessibilityLabel="Build route over drawing"',
  'Closed polygon action bar should no longer offer a generic build-over-area route action.',
);

console.log('Campsite UI polish checks passed.');
