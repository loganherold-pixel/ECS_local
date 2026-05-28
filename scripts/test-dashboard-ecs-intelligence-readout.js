const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const dashboard = read('app', '(tabs)', 'dashboard.tsx');
const readout = read('components', 'dashboard', 'ECSIntelligenceReadout.tsx');
const intelligenceBar = read('components', 'dashboard', 'ExpeditionIntelligenceBar.tsx');
const widgetGrid = read('components', 'dashboard', 'WidgetGrid.tsx');
const commandDock = read('components', 'CommandDock.tsx');
const dashboardChromeStore = read('lib', 'dashboardChromeStore.ts');

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
  dashboard.includes('showDockRevealControl={isLandscape}') &&
    dashboard.includes('accessibilityLabel="Reveal ECS navigation dock"') &&
    dashboard.includes('revealDashboardDock(5000)') &&
    !dashboard.includes("accessibilityLabel={isDashboardExpanded ? 'Contract Dashboard widgets' : 'Expand Dashboard widgets'}"),
  'Dashboard portrait should remove the expand/contract control while landscape keeps a timed lower dock reveal action.',
);
assert.ok(
  dashboard.includes('const isLandscape = windowWidth > windowHeight;') &&
    dashboard.includes('current === isLandscape ? current : isLandscape') &&
    dashboard.includes('if (!isLandscape) {') &&
    dashboard.includes('hideDashboardDockReveal();'),
  'Dashboard expanded chrome should be driven by landscape orientation and reset back to contracted portrait mode.',
);
assert.ok(
  dashboardChromeStore.includes('dockRevealed: boolean') &&
    dashboardChromeStore.includes('export function revealDashboardDock(durationMs = 5000)') &&
    dashboardChromeStore.includes('export function hideDashboardDockReveal()'),
  'Dashboard chrome store should expose a timed lower dock reveal state for landscape dashboard navigation.',
);
assert.ok(
  commandDock.includes('dashboardChrome.expanded &&') &&
    commandDock.includes('!dashboardChrome.dockRevealed') &&
    commandDock.includes('hideDashboardDockReveal();') &&
    commandDock.includes("Temporarily shows the lower ECS tab bar for five seconds.") === false,
  'CommandDock should stay hidden in expanded landscape mode except while the timed reveal state is active.',
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
  'Dashboard should keep the existing ECS Brief tab route available outside the intelligence banner.',
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
  'No active expedition is selected for dashboard intelligence.',
  'Planning readiness is',
  'Active readiness is',
  'Readiness confidence is limited',
  'Key concern',
  'Recommendation',
  'commandCopyPanel',
  'commandSummary',
  'commandDetail',
].forEach((copy) => {
  assert.ok(readout.includes(copy), `Readout should include required copy: ${copy}`);
});
assert.ok(
  !readout.includes('Open Command Brief') &&
    !readout.includes('onOpenCommandBrief') &&
    !readout.includes('accessibilityRole={onOpenCommandBrief') &&
    !readout.includes('styles.cta'),
  'Dashboard intelligence banner should not expose an Open Command Brief CTA.',
);
assert.ok(
  dashboard.includes('commandTitle={dashboardTopLaneAdvisory.override.title}') &&
    dashboard.includes('commandDetail={dashboardTopLaneAdvisory.override.detail}') &&
    dashboard.includes('commandBadge={dashboardTopLaneAdvisory.override.badge}') &&
    dashboard.includes('commandLive={dashboardTopLaneAdvisory.override.live}') &&
    !dashboard.includes('onOpenCommandBrief={handleOpenCommandBrief}\n        />'),
  'Dashboard should feed the top lane advisory into the ECS Intelligence readout.',
);
assert.ok(
  readout.includes('Animated.timing(contentTranslateX') &&
    readout.includes('contentTranslateX') &&
    readout.includes('toValue: 0') &&
    readout.includes('contentTranslateX.setValue(-10)') &&
    readout.includes('ECS Intelligence standing by'),
  'Readout should keep text crisp while animating new copy into place and supporting an empty standby state.',
);
assert.ok(
  readout.includes('autoClearTokenRef') &&
    readout.includes('contentOpacity.setValue(1)') &&
    readout.includes('contentTranslateX.setValue(0)') &&
    readout.includes('const settleTimer = setTimeout') &&
    readout.includes('displayedModel.message.length === 0'),
  'Readout should avoid stale fade callbacks and pin active text back to full opacity after transitions.',
);
assert.ok(
  !readout.includes('toValue: 0,\n          duration: 150') &&
    !readout.includes('toValue: 0,\n          duration: 260'),
  'Readout should not fade active concern/recommendation text to a semi-readable state.',
);
assert.ok(
  readout.includes("position: 'relative'") &&
    readout.includes("overflow: 'hidden'") &&
    readout.includes('zIndex: 4') &&
    readout.includes('elevation: 4') &&
    readout.includes('zIndex: 5'),
  'Readout text layers should be explicitly stacked above the intelligence banner surface.',
);
assert.ok(
  intelligenceBar.includes('const visible = !!override || (!!state.current && !!state.isVisible);') &&
    intelligenceBar.includes('const transitionToken = ++transitionTokenRef.current;') &&
    intelligenceBar.includes('fadeAnim.setValue(visible ? 1 : 0);') &&
    intelligenceBar.includes('overrideMessageKey ?? state.current?.id ?? null'),
  'Expedition intelligence bar should treat override copy as visible and force completed fade transitions to a readable opacity.',
);
assert.ok(
  !intelligenceBar.includes('accentStrip') &&
    !intelligenceBar.includes('emptyAccent'),
  'Expedition intelligence bar should not render a vertical left accent strip over dashboard copy.',
);
assert.ok(
  readout.includes('surfaceCompact:') &&
    readout.includes('minHeight: 56') &&
    readout.includes('surfaceExpanded:') &&
    readout.includes('minHeight: 92') &&
    readout.includes('surfaceCritical:') &&
    readout.includes('detailsExpanded') &&
    readout.includes('isCriticalIntelligenceState') &&
    readout.includes('accessibilityState={{ expanded: expandedState }}') &&
    readout.includes('marginTop: 2') &&
    !readout.includes('footerRow:') &&
    !readout.includes('confidenceLine:') &&
    !readout.includes('Live update /') &&
    !readout.includes('commandCopyBlock') &&
    !readout.includes('commandDivider') &&
    readout.includes('<Text style={[styles.commandSummary, { color: palette.text }]} numberOfLines={2}>') &&
    readout.includes('<Text style={[styles.commandDetail, { color: colors.textSecondary }]} numberOfLines={2}>') &&
    readout.includes("backgroundColor: isLight ? 'rgba(255, 251, 245, 0.94)'"),
  'Dashboard ECS Intelligence banner should default compact, keep expanded/critical treatments, inherit light theme surfaces, and allow concern/recommendation text to wrap.',
);
assert.ok(
  readout.includes('buildIssueRecommendation') &&
    readout.includes('sentenceCaseReadoutCopy(buildReadoutCopy') &&
    readout.includes('capitalizeReadoutSentenceStart') &&
    readout.includes('refresh route weather') &&
    readout.includes('prepare an Offline Pack') &&
    readout.includes('verify fuel level') &&
    readout.includes('review the active vehicle profile'),
  'Readout should pair dashboard concerns with practical user-facing recommendations and sentence-case them before display.',
);
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
