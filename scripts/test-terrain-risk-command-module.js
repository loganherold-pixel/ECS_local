const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

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
const navigateSource = read('app/(tabs)/navigate.tsx');
const navigateRunSource = read('app/navigate-run.tsx');
const elevationEngine = loadTsModule('lib/terrainElevationRouteEngine.ts');
const profile = loadTsModule('lib/terrainRiskCommandProfile.ts', {
  './terrainElevationRouteEngine': elevationEngine,
});

assert(
  commandStoreSource.includes("export const ECS_COMMAND_MODULE_ORDER: ECSCommandModuleId[] = [\n  'follow3d',\n];"),
  '3D Nav Command must be the only selectable ECS command module.',
);
assert(commandStoreSource.includes("const DEFAULT_ECS_COMMAND_MODULE: ECSCommandModuleId = 'follow3d';"), '3D Nav Command must be the default dashboard command module.');
assert(commandStoreSource.includes("label: '3D Nav Command'"), '3D Nav Command registry label is missing.');
assert(!commandStoreSource.includes("id: 'terrainRisk'"), 'Terrain Risk must not remain selectable in the command module registry.');
assert(!commandStoreSource.includes("label: 'Attitude Command'"), 'Attitude Command must not remain selectable in the command module registry.');
assert(!commandStoreSource.includes("label: 'Terrain Risk'"), 'Terrain Risk must not remain selectable in the command module registry.');

assert(!widgetRenderersSource.includes("import TerrainRiskCommandModule from './TerrainRiskCommandModule';"));
assert(!widgetRenderersSource.includes("selectedCommandModule === 'terrainRisk' ? ("));
assert(!widgetRenderersSource.includes('routeContext={terrainRiskRouteContext}'));
assert(widgetRenderersSource.includes('routePoints: terrainRiskRoutePoints'), 'Terrain Risk must receive active guidance geometry when saved route segments are unavailable.');
assert(widgetRenderersSource.includes('currentElevationFeet: terrainRiskHasGpsAltitude ? options.gpsAltitudeFt ?? null : null'), 'Terrain Risk must receive live GPS altitude for estimated active guidance profiles.');
assert(commandModuleSource.includes('routePoints: routeContextPoints'), 'Terrain Risk command module must pass active route points into the risk profile builder.');
assert(commandModuleSource.includes('currentElevationFeet: routeContextCurrentElevationFeet'), 'Terrain Risk command module must pass live GPS altitude into the risk profile builder.');
assert(widgetRenderersSource.includes('eyebrow="ROUTE TERRAIN RISK"'), 'Bottom route container must be renamed to Route Terrain Risk.');
assert(widgetRenderersSource.includes('<AttitudeCommandTerrainRiskPreview'), 'Bottom route container must render the compact terrain side-profile graph.');
assert(widgetRenderersSource.includes("ImageBackground") && widgetRenderersSource.includes("require('../../assets/dashboard/terrain-risk-background.png')"), 'Terrain Risk widget must use the dashboard mountain image as a cover background.');
assert(widgetRenderersSource.includes('resizeMode="cover"') && widgetRenderersSource.includes('terrainRiskBackgroundImageInner'), 'Terrain Risk background image must cover the full container without exposed image edges.');
assert(widgetRenderersSource.includes('ROUTE GUIDANCE TERRAIN RISK'), 'Terrain Risk widget must label the route guidance terrain risk surface.');
assert(widgetRenderersSource.includes('NO ACTIVE ROUTE'), 'Terrain Risk widget must show no active route in the top-right text when route guidance is unavailable.');
assert(widgetRenderersSource.includes('label="Elevation segments"'), 'Terrain Risk detail view must show the segment reader count and max grade.');
assert(widgetRenderersSource.includes('label="Warm / hot spots"'), 'Terrain Risk detail view must show warm and hot terrain spots.');
assert(widgetRenderersSource.includes('label="Elevation gain / loss"'), 'Terrain Risk detail view must show route elevation gain and loss.');
assert(widgetRenderersSource.includes('overlayClass="editor"'), 'Route Terrain Risk focus popup must use the centered editor shell, not a bottom action sheet.');
assert(widgetRenderersSource.includes('maxHeightFraction={1}'), 'Route Terrain Risk focus popup must use the same full-height bounds as other command detail panels.');
assert(widgetRenderersSource.includes('minHeightFraction={1}'), 'Route Terrain Risk focus popup must reserve full detail height instead of shrinking to the bottom of the screen.');
assert(widgetRenderersSource.includes('scrollable'), 'Route Terrain Risk focus popup must scroll within the body when text exceeds the visible area.');
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
assert(sideProfileSource.includes('left: 47'), 'Terrain Risk chart needs a wider left label lane so FT cannot overlap elevation ticks.');
assert(sideProfileSource.includes('right: 28'), 'Terrain Risk chart needs a wider right label lane so MI/KM cannot overlap the last distance tick.');
assert(sideProfileSource.includes('y={VIEWBOX_HEIGHT - 17}'), 'Terrain Risk chart distance ticks should sit above the unit label.');
assert(sideProfileSource.includes('y={VIEWBOX_HEIGHT - 6}'), 'Terrain Risk chart unit label should sit below the tick values.');
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

console.log('[terrain-risk-command-module] registration, live route gating, unit conversion, and chart checks passed');
