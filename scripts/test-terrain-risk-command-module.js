const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');

function loadTsModule(relativePath, mocks = {}) {
  const filename = path.join(root, relativePath);
  const source = read(relativePath);
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: filename,
  });
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    mod._compile(outputText, filename);
  } finally {
    Module._load = originalLoad;
  }
  return mod.exports;
}

const commandStoreSource = read('lib/ecsCommandModuleStore.ts');
const widgetRenderersSource = read('components/dashboard/WidgetRenderers.tsx');
const commandModuleSource = read('components/dashboard/TerrainRiskCommandModule.tsx');
const sideProfileSource = read('components/dashboard/TerrainRiskSideProfile.tsx');
const terrainRiskWidgetSource = read('components/dashboard/TerrainRiskWidget.tsx');
const navigateSource = read('app/(tabs)/navigate.tsx');
const navigateRunSource = read('app/navigate-run.tsx');
const packageJson = require(path.join(root, 'package.json'));
const elevationEngine = loadTsModule('lib/terrainElevationRouteEngine.ts');
const profile = loadTsModule('lib/terrainRiskCommandProfile.ts', {
  './terrainElevationRouteEngine': elevationEngine,
});
const sampling = loadTsModule('lib/terrainElevationSampling.ts');

assert.strictEqual(
  packageJson.scripts['test:terrain-risk-command-module'],
  'node ./scripts/test-terrain-risk-command-module.js',
  'package.json should expose the Terrain Risk command module regression script.',
);

assert(
  commandStoreSource.includes("export const ECS_COMMAND_MODULE_ORDER: ECSCommandModuleId[] = [\n  'follow3d',\n  'attitude',\n];"),
  'Selectable ECS command modules should be limited to 3D Nav Command and Attitude Command.',
);
assert(commandStoreSource.includes("const DEFAULT_ECS_COMMAND_MODULE: ECSCommandModuleId = 'follow3d';"), '3D Nav Command must be the default dashboard command module.');
assert(commandStoreSource.includes("label: '3D Nav Command'"), '3D Nav Command registry label is missing.');
assert(!commandStoreSource.includes("id: 'terrainRisk'"), 'Terrain Risk must not remain selectable in the command module registry.');
assert(!commandStoreSource.includes("label: 'Terrain Risk'"), 'Terrain Risk must not remain selectable in the command module registry.');

assert(!widgetRenderersSource.includes("import TerrainRiskCommandModule from './TerrainRiskCommandModule';"));
assert(!widgetRenderersSource.includes("selectedCommandModule === 'terrainRisk' ? ("));
assert(!widgetRenderersSource.includes('routeContext={terrainRiskRouteContext}'));
assert(widgetRenderersSource.includes('routePoints: terrainRiskRoutePoints'), 'Terrain Risk must receive active guidance geometry when saved route segments are unavailable.');
assert(
  widgetRenderersSource.includes('currentElevationFeet: terrainRiskHasGpsAltitude && !terrainRiskSamplingPending ? options.gpsAltitudeFt ?? null : null'),
  'Terrain Risk must only use live GPS altitude after elevation sampling has had a chance to resolve.',
);
assert(commandModuleSource.includes('routePoints: routeContextPoints'), 'Terrain Risk command module must pass active route points into the risk profile builder.');
assert(commandModuleSource.includes('currentElevationFeet: routeContextCurrentElevationFeet'), 'Terrain Risk command module must pass live GPS altitude into the risk profile builder.');
assert(widgetRenderersSource.includes('eyebrow="ROUTE TERRAIN RISK"'), 'Bottom route container must be renamed to Route Terrain Risk.');
assert(widgetRenderersSource.includes('<AttitudeCommandTerrainRiskPreview'), 'Bottom route container must render the compact terrain side-profile graph.');
assert(widgetRenderersSource.includes("ImageBackground") && widgetRenderersSource.includes("require('../../assets/dashboard/terrain-risk-background.png')"), 'Terrain Risk widget must use the dashboard mountain image as a cover background.');
assert(widgetRenderersSource.includes('resizeMode="cover"') && widgetRenderersSource.includes('terrainRiskBackgroundImageInner'), 'Terrain Risk background image must cover the full container without exposed image edges.');
assert(!widgetRenderersSource.includes('ROUTE GUIDANCE TERRAIN RISK'), 'Terrain Risk widget must not duplicate the Route Terrain Risk label inside the chart.');
assert(widgetRenderersSource.includes('terrainRiskPreviewActive'), 'Active Terrain Risk preview must let the graph use the full route panel surface.');
assert(widgetRenderersSource.includes('transparentBackground'), 'Compact Terrain Risk chart must render with a transparent chart background.');
assert(widgetRenderersSource.includes("headerStatusLabel={terrainRiskRoute ? terrainRiskRoute.dataState === 'estimated-route' ? 'GPS ALT ESTIMATE' : 'ELEVATION PROFILE' : null}"), 'Route Terrain Risk should keep the data-source label in the top-right header lane.');
assert(widgetRenderersSource.includes("headerStatusValue={terrainRiskRoute ? `${formatTerrainRiskLabel(terrainRiskRoute.overallRiskLabel).toUpperCase()} ${terrainRiskRoute.overallRiskScore}` : null}"), 'Route Terrain Risk should keep the score in the top-right header lane.');
assert(!widgetRenderersSource.includes('terrainRiskCornerReadoutOverlay'), 'Compact Terrain Risk status readout must not overlay the chart.');
assert(!widgetRenderersSource.includes('terrainRiskBottomReadoutOverlay'), 'Compact Terrain Risk status readout must not sit over the bottom axis lane.');
assert(!/commandPanelHeaderStatus[\s\S]{0,160}ROUTE TERRAIN RISK/.test(widgetRenderersSource), 'Compact Terrain Risk header readout should not cover the route profile chart.');
assert(widgetRenderersSource.includes('sampleRouteElevationFromMapboxTerrainContours'), 'Active guidance terrain risk must sample elevation before falling back to GPS altitude.');
assert(widgetRenderersSource.includes('Mapbox terrain contour estimate'), 'Sampled route terrain must disclose the Mapbox contour estimate source.');
assert(!terrainRiskWidgetSource.includes('setInterval('), 'Terrain Risk default widget must not wake JS on a simulated interval.');
assert(
  widgetRenderersSource.includes('terrainRiskSampleSourcePointsRef') &&
    widgetRenderersSource.includes('terrainRiskSampleSourcePointsRef.current = rawTerrainRiskRoutePoints') &&
    widgetRenderersSource.includes('}, [terrainRiskNeedsElevationSampling, terrainRiskSamplingSignature]);'),
  'Terrain Risk elevation sampling should key requests by stable route signature instead of route point reference churn.',
);
assert(!widgetRenderersSource.includes('NO ACTIVE ROUTE'), 'Terrain Risk widget must not repeat no-active-route copy in the top-right header.');
assert(widgetRenderersSource.includes("title={terrainRiskRoute ? `${formatTerrainRiskLabel(terrainRiskRoute.overallRiskLabel)} | ${terrainRiskRoute.overallRiskScore}` : 'No active route'}"), 'Route Terrain Risk inline panel must summarize risk score or standby state.');
assert(widgetRenderersSource.includes("detail={terrainRiskRoute ? terrainRiskRoute.sourceLabel : 'Start guidance to view terrain risk'}"), 'Route Terrain Risk inline panel must keep data source or guidance-start copy visible.');
assert(
  /<AttitudeCommandTerrainRiskPreview[\s\S]{0,220}terrainRisk=\{terrainRiskVisual\}[\s\S]{0,220}expanded=\{expanded\}/.test(widgetRenderersSource),
  'Route Terrain Risk expansion must render the shared inline chart preview.',
);
assert(widgetRenderersSource.includes("accessibilityLabel={expanded ? 'Route terrain risk expanded' : 'Expand route terrain risk'}"), 'Route Terrain Risk tap target must describe the expanded/detail state.');
assert(widgetRenderersSource.includes('renderCommandPanel(activePanel.panel, true, expandedPanelMode)'), 'Route Terrain Risk must use the shared inline expansion path instead of opening a popup.');
assert(!widgetRenderersSource.includes("const compactRouteFocusPanel = activePanel === 'route'"), 'Route Terrain Risk must not use the old compact bottom-sheet branch.');
assert(!widgetRenderersSource.includes('compactRouteFocusContent'), 'Route Terrain Risk must not use compact bottom-sheet content padding.');
assert(
  !/AttitudeCommandPanel[\s\S]{0,240}eyebrow="ROUTE PROGRESS"/.test(widgetRenderersSource),
  'Route Progress must no longer be the bottom command widget label.',
);
assert(widgetRenderersSource.includes('terrainRiskRoutePointsHaveElevation'), 'Terrain Risk must detect elevation preserved on active guidance route points.');
assert(widgetRenderersSource.includes('ele: point.ele ?? point.ele_m ?? null'), 'Terrain Risk must preserve route point elevation instead of flattening active guidance geometry to lat/lng only.');
assert(navigateSource.includes("...(Number.isFinite(point.ele_m) ? { ele: point.ele_m, ele_m: point.ele_m } : null)"), 'Navigate route handoff must preserve imported run elevation for live dashboard terrain risk.');
assert(navigateRunSource.includes("...(Number.isFinite(point.ele_m) ? { ele: point.ele_m, ele_m: point.ele_m } : null)"), 'Run detail navigation must preserve imported run elevation for live dashboard terrain risk.');
assert(!widgetRenderersSource.includes('attitudeStageTerrainRiskMode'), 'Terrain Risk center-stage mode must be removed.');
assert(!widgetRenderersSource.includes('moduleTransitionShellTerrainRiskMode'), 'Terrain Risk module shell mode must be removed.');
assert(!widgetRenderersSource.includes("selectedCommandModule !== 'attitude' && selectedCommandModule !== 'terrainRisk' ? ("));
assert(!widgetRenderersSource.includes("selectedCommandModule !== 'follow3d' && selectedCommandModule !== 'terrainRisk' && !commandCenterFrameSelected ? ("));

assert(commandModuleSource.includes("useState<DistanceUnit>('mi')"), 'Terrain Risk must default to miles.');
assert(commandModuleSource.includes("(['mi', 'km'] as DistanceUnit[])"), 'Terrain Risk must expose a MI/KM toggle.');
assert(commandModuleSource.includes('accessibilityLabel="Terrain Risk distance unit"'), 'Terrain Risk unit toggle needs an accessible group label.');
assert(commandModuleSource.includes('Show Terrain Risk distances in'), 'Terrain Risk MI/KM buttons need accessible labels.');
assert(commandModuleSource.includes('hitSlop={{ top: 8, right: 4, bottom: 8, left: 4 }}'), 'Terrain Risk MI/KM buttons need expanded touch targets.');
assert(commandModuleSource.includes('Overall terrain risk score'), 'Terrain Risk score needs an explicit accessible label.');
assert(commandModuleSource.includes("accessibilityRole=\"text\""), 'Terrain Risk score should expose text semantics.');
assert(commandModuleSource.includes('formatDistance(route.totalDistanceMiles, distanceUnit)'));
assert(commandModuleSource.includes('formatDistance(route.nextHazard.distanceMiles, distanceUnit)'));
assert(commandModuleSource.includes('Opens the next terrain hazard on the map'), 'Terrain Risk hazard CTA needs an accessibility hint.');
assert(commandModuleSource.includes('accessibilityState={{ disabled: !onViewHazardOnMap }}'), 'Terrain Risk hazard CTA should expose disabled state.');
assert(commandModuleSource.includes('hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}'), 'Terrain Risk hazard CTA needs an expanded touch target.');
assert(commandModuleSource.includes('flexWrap: \'wrap\''), 'Terrain Risk factor cards should wrap on narrow command surfaces.');
assert(commandModuleSource.includes('flexBasis: \'18%\''), 'Terrain Risk factor cards should retain compact proportional sizing.');
assert(commandModuleSource.includes('Risk Legend'));
assert(commandModuleSource.includes('No active guidance'), 'Terrain Risk must show a no-active-guidance state when no live route is active.');
assert(commandModuleSource.includes('Terrain profile unavailable'), 'Terrain Risk must distinguish active guidance without elevation profile data.');
assert(commandModuleSource.includes("route.dataState === 'estimated-route' ? 'GPS altitude estimate' : 'Side-profile route analysis'"), 'Terrain Risk must visibly distinguish estimated GPS-altitude profiles.');

assert(sideProfileSource.includes("from 'react-native-svg'"), 'Terrain Risk chart must use SVG primitives.');
assert(sideProfileSource.includes('<Path'), 'Terrain Risk chart should draw the elevation profile from data.');
assert(sideProfileSource.includes('formatDistance(totalDistanceMiles * ratio, unit)'), 'Chart X-axis labels must convert with the unit toggle.');
assert(sideProfileSource.includes('export function scaleTerrainDistanceToX'), 'Chart must expose a distance-to-X scaling helper.');
assert(sideProfileSource.includes('export function scaleTerrainElevationToY'), 'Chart must expose an elevation-to-Y scaling helper.');
assert(sideProfileSource.includes('scaleTerrainDistanceToX(point.distanceMiles, totalDistanceMiles)'), 'Chart geometry must stay based on miles, not display units.');
assert(sideProfileSource.includes('scaleTerrainElevationToY(point.elevationFeet, bounds)'), 'Elevation scaling must remain separate from route-distance unit conversion.');
assert(sideProfileSource.includes('function buildRiskSegments'), 'Chart must segment neighboring profile points by risk.');
assert(sideProfileSource.includes('function buildSegmentAreaPath'), 'Chart must fill each risk segment under the route line.');
assert(sideProfileSource.includes('CONTOUR_PATHS'), 'Chart should include lightweight contour/topographic texture.');
assert(sideProfileSource.includes('chart.highRiskSegments.map'), 'High-risk sections must receive an extra visual emphasis layer.');
assert(sideProfileSource.includes('strokeWidth={segment.strokeWidth}'), 'Risk segment strokes should vary by risk intensity.');
assert(sideProfileSource.includes('textAnchor={tick.anchor}'), 'Distance labels should avoid edge clipping on small chart widths.');
assert(sideProfileSource.includes('accessibilityRole="image"'), 'Terrain Risk chart should expose image semantics to assistive tech.');
assert(sideProfileSource.includes('High risk route sections are highlighted'), 'Terrain Risk chart should describe high-risk emphasis for assistive tech.');
assert(sideProfileSource.includes('transparentBackground = false'), 'Terrain Risk chart should keep opaque detail rendering by default.');
assert(sideProfileSource.includes('!transparentBackground ?'), 'Terrain Risk chart should be able to suppress the opaque SVG background.');
assert(sideProfileSource.includes('shellTransparent'), 'Terrain Risk chart needs a transparent shell style for compact route panels.');
assert(sideProfileSource.includes('left: 24'), 'Terrain Risk chart should preserve a compact readable left elevation-label lane.');
assert(sideProfileSource.includes('right: 16'), 'Terrain Risk chart should reserve a right-side lane so the final distance/unit labels are not clipped.');
assert(sideProfileSource.includes('top: 8') && sideProfileSource.includes('bottom: 24'), 'Terrain Risk chart should keep top markers and bottom axis labels inside the viewBox.');
assert(sideProfileSource.includes('labelX: ratio === 1 ? x - 10 : ratio === 0 ? x + 2 : x'), 'Terrain Risk chart should keep first/final distance labels clear of the chart edges and unit label.');
assert(sideProfileSource.includes('y={CHART_FRAME.baselineY + 13}'), 'Terrain Risk chart distance ticks and unit label should share a single aligned bottom axis row.');
assert(sideProfileSource.includes('x={CHART_FRAME.left + 2}') && sideProfileSource.includes('y={CHART_FRAME.top + 8}'), 'Terrain Risk FT label should stay inside the slimmer elevation tick label lane.');
assert(
  /x=\{VIEWBOX_WIDTH - 5\}[\s\S]*fill=\{TACTICAL\.amber\}/.test(sideProfileSource) &&
    /x=\{CHART_FRAME\.left \+ 2\}[\s\S]*fill=\{TACTICAL\.amber\}/.test(sideProfileSource),
  'Terrain Risk FT and distance unit labels must use the same ECS gold treatment.',
);
assert(sideProfileSource.includes('isTerrainProfileReferencePoint'), 'Terrain Risk chart should derive tappable reference points from existing terrain risk signals.');
assert(sideProfileSource.includes('formatTerrainReferenceReason'), 'Terrain Risk chart should explain why expanded reference dots were selected.');
assert(
  sideProfileSource.includes('{interactive ? chart.referencePoints.map') &&
    sideProfileSource.includes('testID="terrainRiskReferenceMarkerButton"') &&
    sideProfileSource.includes('onPress={() => handleReferenceMarkerPress(point)}'),
  'Terrain Risk reference dots should only become tappable in expanded mode.',
);
assert(
  widgetRenderersSource.includes('ECS INTELLIGENCE BRIEF') &&
    widgetRenderersSource.includes('selectedReferenceEvent.fieldGuidance.slice(0, 2).join'),
  'Terrain Risk expanded dot callout should explain the selected point.',
);
assert(sideProfileSource.includes('completedDistanceMiles?: number | null'), 'Terrain Risk side profile should accept route progress for the live GPS marker.');
assert(sideProfileSource.includes('buildCurrentRouteMarkerPoint'), 'Terrain Risk side profile should interpolate the current GPS marker on the elevation line.');
assert(
  /const chart = useMemo\([\s\S]*\}, \[profile, totalDistanceMiles, unit\]\);/.test(sideProfileSource),
  'Terrain Risk side profile should keep static SVG chart memoization independent from moving route progress.',
);
assert(sideProfileSource.includes('Current GPS position'), 'Terrain Risk side profile should label the moving GPS marker for assistive tech.');
assert(sideProfileSource.includes('PanResponder'), 'Terrain Risk side profile should expose a drag probe for expanded elevation reads.');
assert(sideProfileSource.includes('function buildElevationProbePoint'), 'Terrain Risk side profile should derive the dragged elevation readout from route data.');
assert(sideProfileSource.includes('selectedProbePoint'), 'Terrain Risk side profile should track the selected elevation probe point while dragging.');
assert(sideProfileSource.includes('testID="terrainRiskElevationProbe"'), 'Terrain Risk side profile should render a testable elevation probe overlay.');
assert(sideProfileSource.includes('Elevation probe'), 'Terrain Risk side profile should label the elevation probe for assistive tech.');
assert(widgetRenderersSource.includes('completedDistanceMiles={terrainRisk.completedDistanceMiles}'), 'Expanded Terrain Risk preview should pass active route progress into the side profile.');
assert(!sideProfileSource.includes('ROUTE SIDE PROFILE'), 'Terrain Risk chart should not spend compact dashboard space on a redundant chart title.');
assert(!commandModuleSource.includes('<Image'), 'Terrain Risk command module must not be a static image.');
assert(!sideProfileSource.includes('<Image'), 'Terrain Risk side profile must not be a static image.');

assert.strictEqual(profile.MILES_TO_KILOMETERS, 1.609344);
assert.strictEqual(profile.milesToKilometers(1), 1.609344);
assert.strictEqual(Number(profile.milesToKilometers(15.3).toFixed(1)), 24.6);
assert.strictEqual(profile.formatDistance(0.8, 'mi'), '0.8 mi');
assert.strictEqual(profile.formatDistance(0.8, 'km'), '1.3 km');
assert.strictEqual(profile.formatDistance(15.3, 'mi'), '15.3 mi');
assert.strictEqual(profile.formatDistance(15.3, 'km'), '24.6 km');
assert.strictEqual(profile.formatDistance(15.34, 'mi', 2), '15.34 mi');
assert.strictEqual(profile.formatTerrainRiskLabel('high'), 'High');

assert.strictEqual(elevationEngine.normalizeTerrainElevationFeet({ elevationFeet: 4120 }), 4120);
assert.strictEqual(Math.round(elevationEngine.normalizeTerrainElevationFeet({ ele: 1400 })), Math.round(1400 * 3.28084));
const elevationAnalysis = elevationEngine.analyzeTerrainElevationRoute({
  totalDistanceMiles: 4,
  routePoints: [
    { lat: 39, lng: -120, ele: 1000 },
    { lat: 39.004, lng: -120.002, ele: 1450 },
    { lat: 39.008, lng: -120.004, ele: 900 },
  ],
});
assert(elevationAnalysis, 'Elevation engine must analyze elevation-backed route geometry.');
assert.strictEqual(elevationAnalysis.dataState, 'elevation-backed');
assert.strictEqual(elevationAnalysis.segments.length, 2);
assert(elevationAnalysis.segments.some((segment) => segment.thermalBand === 'hot'), 'Steep elevation-backed route segments should produce hot spots.');
assert(elevationAnalysis.segments.some((segment) => segment.hazardKinds.includes('tipover_watch') || segment.hazardKinds.includes('washout_watch')), 'Steep route segments should expose deterministic hazard watch flags.');
assert(elevationAnalysis.elevationGainFeet > 0 && elevationAnalysis.elevationLossFeet > 0, 'Elevation analysis must track gain and loss separately.');

const gpsAltitudeEstimate = elevationEngine.analyzeTerrainElevationRoute({
  totalDistanceMiles: 8,
  currentElevationFeet: 5200,
  routePoints: [
    { lat: 39, lng: -120 },
    { lat: 39.04, lng: -120.02 },
    { lat: 39.08, lng: -120.04 },
  ],
});
assert(gpsAltitudeEstimate, 'Elevation engine should build an explicit GPS altitude estimate when route geometry exists.');
assert.strictEqual(gpsAltitudeEstimate.dataState, 'gps-altitude-estimate');
assert(gpsAltitudeEstimate.segments.every((segment) => segment.gradePercent === 0), 'GPS-altitude-only analysis must not invent route grade.');
assert(gpsAltitudeEstimate.segments.every((segment) => segment.hazardKinds.length === 0), 'GPS-altitude-only analysis must not invent terrain hazard flags.');

const zeroPlaceholderElevation = elevationEngine.analyzeTerrainElevationRoute({
  totalDistanceMiles: 8,
  routePoints: [
    { lat: 39, lng: -120, ele_m: 0 },
    { lat: 39.04, lng: -120.02, ele_m: 0 },
    { lat: 39.08, lng: -120.04, ele_m: 0 },
  ],
});
assert.strictEqual(zeroPlaceholderElevation, null, 'All-zero route geometry must not masquerade as live elevation terrain.');

const zeroPlaceholderWithGpsAltitude = elevationEngine.analyzeTerrainElevationRoute({
  totalDistanceMiles: 8,
  currentElevationFeet: 5200,
  sourceLabel: 'Live guidance elevation profile',
  routePoints: [
    { lat: 39, lng: -120, ele_m: 0 },
    { lat: 39.04, lng: -120.02, ele_m: 0 },
    { lat: 39.08, lng: -120.04, ele_m: 0 },
  ],
});
assert(zeroPlaceholderWithGpsAltitude, 'All-zero placeholder geometry should fall back to live GPS altitude when available.');
assert.strictEqual(zeroPlaceholderWithGpsAltitude.dataState, 'gps-altitude-estimate');
assert.strictEqual(zeroPlaceholderWithGpsAltitude.sourceLabel, 'Estimated from active guidance geometry + live GPS altitude');

const inactiveRoute = profile.buildTerrainRiskCommandRoute();
assert.strictEqual(inactiveRoute, null, 'Terrain Risk must not build a visible route from mock/default data.');

const activeRouteWithoutElevation = profile.buildTerrainRiskCommandRoute({
  active: true,
  routeId: 'route-empty',
  routeName: 'No Elevation Route',
  totalDistanceMiles: 15.3,
  routeSegments: [{ points: [{ lat: 39, lon: -120, ele: null }, { lat: 39.1, lon: -120.1, ele: null }] }],
});
assert.strictEqual(activeRouteWithoutElevation, null, 'Terrain Risk must wait for elevation-backed live route data.');

const estimatedActiveRoute = profile.buildTerrainRiskCommandRoute({
  active: true,
  routeId: 'route-estimated',
  routeName: 'Road Guidance Without Elevation',
  totalDistanceMiles: 12,
  completedDistanceMiles: 1.5,
  currentElevationFeet: 4260,
  routePoints: [
    { lat: 39, lng: -120 },
    { lat: 39.04, lng: -120.02 },
    { lat: 39.1, lng: -120.06 },
    { lat: 39.16, lng: -120.1 },
  ],
});
assert(estimatedActiveRoute, 'Active guidance with geometry and live GPS altitude should build an estimated Terrain Risk profile.');
assert.strictEqual(estimatedActiveRoute.dataState, 'estimated-route');
assert.strictEqual(estimatedActiveRoute.sourceLabel, 'Estimated from active guidance geometry + live GPS altitude');
assert.strictEqual(estimatedActiveRoute.profile[0].elevationFeet, 4260);
assert.strictEqual(estimatedActiveRoute.profile[estimatedActiveRoute.profile.length - 1].distanceMiles, 12);
assert(estimatedActiveRoute.factors.some((factor) => factor.label === 'Grade' && factor.value === 'Est.'), 'Estimated Terrain Risk profile should label grade as estimated.');
assert(estimatedActiveRoute.terrainSegments.every((segment) => segment.hazardKinds.length === 0), 'Estimated Terrain Risk route should not invent hot-spot hazard flags.');

const routePointElevationActiveRoute = profile.buildTerrainRiskCommandRoute({
  active: true,
  routeId: 'route-point-elevation',
  routeName: 'Guidance Geometry With Elevation',
  totalDistanceMiles: 9.4,
  sourceLabel: 'Live guidance elevation profile',
  routePoints: [
    { lat: 39, lng: -120, ele: 1280 },
    { lat: 39.03, lng: -120.04, ele: 1450 },
    { lat: 39.08, lng: -120.08, ele: 1740 },
    { lat: 39.12, lng: -120.11, ele: 1580 },
  ],
});
assert(routePointElevationActiveRoute, 'Active guidance route points with elevation must build the live Terrain Risk side profile.');
assert.strictEqual(routePointElevationActiveRoute.dataState, 'live-route');
assert.strictEqual(routePointElevationActiveRoute.sourceLabel, 'Live guidance elevation profile');
assert.strictEqual(routePointElevationActiveRoute.profile[0].elevationFeet, Math.round(1280 * 3.28084));
assert(routePointElevationActiveRoute.factors.some((factor) => factor.label === 'Grade' && factor.value !== 'Est.'), 'Route-point elevation should produce real grade values.');
assert(routePointElevationActiveRoute.terrainSegments.length > 0, 'Route-point elevation should produce deterministic terrain segments.');
assert(routePointElevationActiveRoute.maxGradePercent > 0, 'Route-point elevation should expose maximum grade.');

const activeRoute = profile.buildTerrainRiskCommandRoute({
  active: true,
  routeId: 'route-99',
  routeName: 'Alpine Shelf Road',
  totalDistanceMiles: 24,
  completedDistanceMiles: 2.4,
  sourceLabel: 'Live guidance elevation profile',
  routeSegments: [{
    points: [
      { lat: 39, lon: -120, ele: 1400 },
      { lat: 39.03, lon: -120.02, ele: 1540 },
      { lat: 39.07, lon: -120.04, ele: 1840 },
      { lat: 39.12, lon: -120.05, ele: 2100 },
      { lat: 39.18, lon: -120.08, ele: 1950 },
    ],
  }],
});
assert(activeRoute, 'Active live terrain route should build from elevation-backed route segments.');
assert.strictEqual(activeRoute.id, 'route-99');
assert.strictEqual(activeRoute.name, 'Alpine Shelf Road');
assert.strictEqual(activeRoute.totalDistanceMiles, 24);
assert.strictEqual(activeRoute.profile[activeRoute.profile.length - 1].distanceMiles, 24);
assert.strictEqual(activeRoute.dataState, 'live-route');
assert.strictEqual(activeRoute.sourceLabel, 'Live guidance elevation profile');
assert(activeRoute.overallRiskScore >= 0 && activeRoute.overallRiskScore <= 100);
assert(activeRoute.factors.some((factor) => factor.label === 'Grade'));
assert(activeRoute.factors.some((factor) => factor.label === 'Surface'));
assert(activeRoute.factors.some((factor) => factor.label === 'Traction'));
assert(activeRoute.factors.some((factor) => factor.label === 'Rollover Risk'));
assert(activeRoute.factors.some((factor) => factor.label === 'Weather Effect'));
assert.strictEqual(activeRoute.nextHazard.actionLabel, 'View on Map');
assert(activeRoute.nextHazard.distanceMiles > 0);
assert(activeRoute.terrainSegments.length > 0, 'Live terrain route must expose analyzed terrain segments.');
assert(activeRoute.elevationGainFeet > 0, 'Live terrain route must expose elevation gain.');
assert(activeRoute.maxGradePercent > 0, 'Live terrain route must expose max grade.');
assert(activeRoute.hotSpotCount + activeRoute.warmSpotCount >= 0, 'Live terrain route must count warm/hot risk spots.');

(async () => {
  assert.strictEqual(
    sampling.routeNeedsTerrainElevationSampling(true, [
      { lat: 39, lng: -120 },
      { lat: 39.02, lng: -120.02 },
    ]),
    true,
    'Route terrain sampling should run for active guidance geometry without elevation.',
  );
  assert.strictEqual(
    sampling.routeNeedsTerrainElevationSampling(true, [
      { lat: 39, lng: -120, ele_m: 1500 },
      { lat: 39.02, lng: -120.02, ele_m: 1520 },
    ]),
    false,
    'Route terrain sampling should not replace existing route elevation.',
  );
  assert(
    sampling.terrainElevationRouteSignature('route-a', [
      { lat: 39, lng: -120 },
      { lat: 39.02, lng: -120.02 },
    ]).includes('route-a:2'),
    'Route terrain sampling needs a stable signature keyed to route geometry.',
  );

  const requestedUrls = [];
  const sampledTerrain = await sampling.sampleRouteElevationFromMapboxTerrainContours({
    accessToken: 'pk.test-token',
    maxSamples: 3,
    routePoints: [
      { lat: 39, lng: -120 },
      { lat: 39.02, lng: -120.02 },
      { lat: 39.04, lng: -120.04 },
      { lat: 39.06, lng: -120.06 },
    ],
    fetchImpl: async (url) => {
      requestedUrls.push(url);
      const index = requestedUrls.length - 1;
      return {
        ok: true,
        json: async () => ({
          features: [
            { properties: { ele: 1400 + index * 90, tilequery: { distance: 20 } } },
          ],
        }),
      };
    },
  });
  assert(sampledTerrain, 'Mapbox terrain contour sampling should return sampled elevation route points.');
  assert.strictEqual(sampledTerrain.length, 3);
  assert.strictEqual(sampledTerrain[0].ele_m, 1400);
  assert.strictEqual(sampledTerrain[1].ele_m, 1490);
  assert.strictEqual(Math.round(sampledTerrain[2].elevationFeet), Math.round(1580 * 3.28084));
  assert(requestedUrls.every((url) => url.includes('mapbox.mapbox-terrain-v2') && url.includes('layers=contour')), 'Mapbox terrain sampling should query terrain contour tiles.');

  console.log('[terrain-risk-command-module] registration, live route gating, terrain sampling, unit conversion, and chart checks passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
