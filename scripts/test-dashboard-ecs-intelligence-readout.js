const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const dashboard = read('app', '(tabs)', 'dashboard.tsx');
const readout = read('components', 'dashboard', 'ECSIntelligenceReadout.tsx');
const widgetGrid = read('components', 'dashboard', 'WidgetGrid.tsx');

assert.ok(
  dashboard.includes("import ECSIntelligenceReadout from '../../components/dashboard/ECSIntelligenceReadout';"),
  'Dashboard should import the readiness-aware ECS Intelligence readout.',
);
assert.ok(
  dashboard.includes('<ECSIntelligenceReadout'),
  'Dashboard should render ECSIntelligenceReadout in the top cluster.',
);
assert.ok(
  dashboard.includes('const dashboardChromeVisible = !isDashboardExpanded;'),
  'Dashboard should derive top chrome visibility from the existing expanded widget state.',
);
assert.ok(
  dashboard.includes('{dashboardChromeVisible ? (') &&
    dashboard.includes('<DashboardHeader') &&
    dashboard.includes(') : null}'),
  'Dashboard expanded mode should unmount the top banner instead of leaving hidden layout space.',
);
assert.ok(
  dashboard.includes('{!startupHydrating && dashboardChromeVisible ? (') &&
    dashboard.includes('<ECSIntelligenceReadout'),
  'Dashboard expanded mode should hide the ECS Intelligence readout with the same chrome visibility gate.',
);
assert.ok(
  dashboard.includes('DASHBOARD_EXPANDED_TOP_SAFE_GAP = 8') &&
    dashboard.includes('const dashboardFrameTopPadding = isDashboardExpanded') &&
    dashboard.includes('paddingTop: dashboardFrameTopPadding'),
  'Dashboard expanded mode should reclaim banner height while preserving top safe-area clearance.',
);
assert.ok(
  dashboard.includes("accessibilityLabel={isDashboardExpanded ? 'Contract Dashboard widgets' : 'Expand Dashboard widgets'}"),
  'Dashboard expand/contract control should remain explicit and accessible in both states.',
);
assert.ok(
  dashboard.includes('const dashboardLayoutSignature = useMemo(') &&
    dashboard.includes('widgetContainerLayout.signature === dashboardLayoutSignature') &&
    dashboard.includes('key={`widget-grid:${layoutSignature}`}'),
  'Dashboard widget measurements should be keyed to live window, safe-area, tab, and expanded-state changes.',
);
assert.ok(
  dashboard.includes('effectiveWidgetContainerWidth') &&
    dashboard.includes('effectiveWidgetContainerHeight') &&
    dashboard.includes('estimatedExpandedWidgetHeight'),
  'Dashboard should use live orientation-aware fallback dimensions while waiting for fresh onLayout measurements.',
);
assert.ok(
  dashboard.includes('function resolveDashboardBodyArea') &&
    dashboard.includes('topBannerHeight: dashboardTopBannerVisibleHeight') &&
    dashboard.includes('bottomBannerHeight: dockPadding') &&
    dashboard.includes('dashboardAvailableBodyArea.width') &&
    dashboard.includes('estimatedContractedWidgetHeight'),
  'Dashboard should resolve a live available body rectangle for expanded and contracted widget fallback sizing.',
);
assert.ok(
  dashboard.includes('Math.max(liveWidgetContainerHeight, estimatedExpandedWidgetHeight)') &&
    dashboard.includes('dashboardControlStackEstimatedHeight') &&
    dashboard.includes('DASHBOARD_CUSTOMIZE_STACK_ESTIMATED_HEIGHT'),
  'Dashboard expanded mode should not accept a stale contracted measurement when full body height is available.',
);
assert.ok(
  dashboard.includes('dashboardGridZoneFrame') &&
    dashboard.includes('flexBasis: 0') &&
    dashboard.includes("overflow: 'visible'"),
  'Dashboard parent containers should avoid stale flex constraints that trap the expanded widget surface.',
);
assert.ok(
  widgetGrid.includes('useTightWidgetFit') &&
    widgetGrid.includes('isLandscapeConstrained') &&
    widgetGrid.includes('isSmallSurfaceConstrained') &&
    widgetGrid.includes('widgetFitScale') &&
    widgetGrid.includes('Math.max(4, Math.round(basePlacementGridPad * widgetFitScale))') &&
    widgetGrid.includes('Math.max(5, Math.round(baseGridGap * widgetFitScale))'),
  'WidgetGrid should apply a conservative tight-fit spacing fallback on small or landscape-constrained surfaces.',
);
assert.ok(
  dashboard.includes("handleTabSwitchWithModeSync('brief')"),
  'Open Command Brief should route to the existing dashboard Brief tab.',
);
assert.ok(
  readout.includes("title: 'ECS Intelligence'"),
  'Readout title should be ECS Intelligence.',
);
[
  'useCurrentExpeditionReadiness',
  'useExpeditionReadinessState',
  'useReadinessDecision',
  'useReadinessConcerns',
  'useReadinessBriefPayload',
].forEach((selector) => {
  assert.ok(readout.includes(selector), `Readout should consume ${selector}.`);
});
[
  'No active expedition. Select a route in Explore or Navigate to generate a Command Brief.',
  'Planning Readiness is',
  'Active Readiness is',
  'Readiness confidence is limited.',
  'Open Command Brief',
].forEach((copy) => {
  assert.ok(readout.includes(copy), `Readout should include required copy: ${copy}`);
});
assert.ok(
  !/title:\s*['"]AI['"]/.test(readout) && !/>\s*AI\s*</.test(readout),
  'Readout should not use AI as the user-facing title.',
);
assert.ok(
  !/legal campsite/i.test(readout.replace(/replace\([^)]*legal campsite[^)]*\)/gi, '')),
  'Readout should not present legal campsite certainty in display copy.',
);
assert.ok(
  !/safe route/i.test(readout.replace(/replace\([^)]*safe route[^)]*\)/gi, '')),
  'Readout should not present safe route certainty in display copy.',
);

console.log('Dashboard ECS Intelligence readout checks passed.');
