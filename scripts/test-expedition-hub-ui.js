const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const expeditionTab = fs.readFileSync(path.join(root, 'components', 'dashboard', 'ExpeditionTab.tsx'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'app', '(tabs)', 'dashboard.tsx'), 'utf8');
const widgetGrid = fs.readFileSync(path.join(root, 'components', 'dashboard', 'WidgetGrid.tsx'), 'utf8');

function includes(fragment, message) {
  assert.ok(expeditionTab.includes(fragment), message);
}

function notIncludes(fragment, message) {
  assert.ok(!expeditionTab.includes(fragment), message);
}

includes('getCompletedTrips', 'Expedition Hub should retrieve completed trip summaries.');
includes('getTripById', 'Expedition Hub should load a full trip only for the detail view.');
includes('getUnlockedBadges', 'Expedition Hub should load unlocked badges only.');
includes('getBadgesForTrip', 'Expedition detail should retrieve badges earned on the selected trip.');
includes('getCurrentInsights', 'Expedition Hub should retrieve persisted expedition insights.');
includes('refreshExpeditionInsights', 'Expedition Hub should refresh grounded insights from completed trips when needed.');
includes('dismissInsight', 'Expedition Hub should support persisted insight dismissal.');
includes('getCurrentPersonalRecords', 'Expedition Hub should retrieve current personal records.');
includes('getRecordsForTrip', 'Expedition detail should retrieve records set by the selected trip.');
includes('getMostRecentReports', 'Expedition Hub should retrieve recent exported reports.');
includes('generateExpeditionReport', 'Expedition Detail should generate expedition reports from completed trips.');
includes('shareExpeditionReport', 'Expedition Detail should share generated expedition reports when available.');
includes('ExpeditionBadge', 'Expedition Hub should use the badge model for earned badge display.');
includes('ExpeditionInsight', 'Expedition Hub should use the insight model for compact insight cards.');
includes('ExpeditionReportExportStatus', 'Expedition Detail should track report export status.');
includes('ExpeditionTripSummary', 'Expedition Hub list should use the lightweight summary shape.');
includes('ExpeditionTripRecord', 'Expedition detail should use the full trip record.');

for (const text of [
  'Expedition Hub',
  'Your completed expeditions, milestones, and field history.',
  'Total Expeditions',
  'Total Miles',
  'Highest Elevation',
  'Hours Logged',
  'Recent Expeditions',
  'No completed expeditions yet.',
  'Your completed journeys will appear here.',
  'Distance',
  'Duration',
  'Max Elevation',
  'Elevation Gain',
  'Elevation Stats',
  'Badge Catalog',
  'Badges Earned',
  'No badges earned on this expedition.',
  'Expedition Insights',
  'Personal Records',
  'Export Expedition Report',
  'Expedition Reports',
  'Expedition Archive',
]) {
  includes(text, `Expedition Hub should render requested copy: ${text}`);
}

includes('recentTrips.map((trip)', 'Expedition Hub should render recent saved completed trips.');
includes('completedTrips.slice(0, 3)', 'Expedition Hub should keep the main recent expedition list compact.');
includes('onPress={() => openTripDetail(trip.id)}', 'Trip cards should open the Expedition detail view.');
includes('onLongPress={() => handleLongPressTrip(trip.id)}', 'Trip cards should keep the future long-press hook.');
includes('getTripById(tripId)', 'Detail open should fetch by trip id.');
includes('buildHubStats(completedTrips)', 'Quick stats should be derived from stored trip data.');
includes('buildLiveHubStats', 'Expedition Hub should derive live/just-completed route stats from dashboard route props.');
includes('liveHubStats', 'Expedition Hub should merge live/just-completed guidance stats into the top hub readouts.');
includes('completedExpeditionRecord', 'Expedition Hub should consume the completed expedition record after active guidance ends.');
includes('routeCompleted', 'Expedition Hub should keep arrival/completed route state visible after guidance ends.');
includes('gpsLocation', 'Expedition Hub should use live GPS elevation for the feet readout when available.');
includes("['totalDistanceMiles', 'distanceMiles', 'completedMiles', 'totalDistance']", 'Expedition Hub should accept route-progress mile totals when no archived trip exists yet.');
includes("['totalDurationSeconds', 'durationSeconds', 'duration', 'durationSec', 'duration_seconds']", 'Expedition Hub should accept completed Expedition log duration fields for hours logged.');
notIncludes('void _props', 'Expedition Hub must not discard live dashboard route/expedition props.');
notIncludes('function ExpeditionTab(_props', 'Expedition Hub must destructure live dashboard route/expedition props.');
includes('liveHubStats.totalExpeditions === 1', 'Total expedition label should handle singular/plural values.');
includes('formatWholeMiles(liveHubStats.totalMiles)', 'Total miles should include live/just-completed guidance before falling back to trip summaries.');
includes('formatElevation(liveHubStats.highestElevationFt)', 'Highest elevation should include live GPS elevation before falling back to trip summaries.');
includes('formatHours(liveHubStats.totalHours)', 'Hours logged should include just-completed guidance before falling back to trip durations.');
notIncludes('<IncidentRecoveryPanel', 'Incident & Recovery should move out of Expedition Hub and into Field Utilities.');
includes('backgroundColor: ECS_SURFACE.background.selected', 'Expedition Hub parent surface should use the gold transparent ECS Brief surface background.');
includes('borderColor: ECS_SURFACE.border.selected', 'Expedition Hub parent surface should use the gold ECS Brief surface border.');
notIncludes("backgroundColor: 'rgba(17, 22, 26, 0.88)'", 'Expedition Hub parent surface should not use the old dark translucent shell.');

for (const todo of [
  'TODO Expedition Hub: add recap map region',
  'TODO Expedition Hub: add expanded expedition achievements',
  'TODO Expedition Hub: add lessons learned',
  'TODO Expedition Hub: add expedition exports',
  'TODO Expedition Archive: add regional map',
  'TODO Expedition Detail: link badge unlocks',
  'TODO Expedition Detail: connect export-ready map snapshots',
  'TODO Expedition Insights: add insight detail view',
]) {
  includes(todo, `Future feature should remain a TODO hook only: ${todo}`);
}

for (const forbidden of [
  '<ExpeditionSummaryCard',
  '<ExpeditionDebriefModal',
  'ExpeditionPlaceholderModal',
  'IncidentRecoveryPanel',
  'SafetyChecklist',
  'GarminInreachVisibilityPanel',
  'RemoteWeatherRiskPanel',
  'useExpeditionAssessmentStore',
  'applyManualAssessmentAction',
  'buildAssessmentEscalationRequest',
  'Operational Assessments',
  'EXPEDITION_OPERATIONAL_ACTIONS',
  'activeOperationalPanel',
  'operationalPanel',
  'operationalGrid',
  'operationalButton',
  'Open ${action.title} assessment',
  'Plan Expedition',
  'clearWizardDraft',
  "router.push('/expedition-wizard' as any)",
  'Export PDF',
  'exportExpeditionDebriefPdf',
  'Lorem',
  'placeholder widget',
  'EXPEDITION_BADGE_DEFINITIONS.map',
  'mystery badge',
  'No insights',
  'placeholder insight',
  'Insight Dashboard',
]) {
  notIncludes(forbidden, `Expedition Hub should not include forbidden old or placeholder UI behavior: ${forbidden}`);
}

includes('if (insights.length === 0) return null;', 'Expedition Insights should not render an empty placeholder section.');

includes('ExpeditionRecapMap', 'Expedition detail should include the completed-trip recap map foundation.');
includes('routeGeometry={trip.routeGeometry}', 'Full route geometry should only be passed after opening a specific trip detail.');
includes('ExpeditionNotableMomentsTimeline', 'Expedition detail should include the notable moments timeline foundation.');
includes('tripStartedAt={trip.startedAt}', 'Timeline should receive the trip start time for elapsed labels.');

assert.ok(dashboard.includes("label: 'EXPEDITION HUB'"), 'Dashboard tab label should be Expedition Hub.');
assert.ok(!dashboard.includes("label: 'ECS OVERVIEW'"), 'Dashboard should no longer label the tab ECS Overview.');
assert.ok(
  dashboard.includes('dashboardRouteProgressCompleted') &&
    dashboard.includes('dashboardRouteProgress?.isComplete') &&
    dashboard.includes("dashboardRouteProgress?.status === 'completed'"),
  'Dashboard should route active guidance arrival/completion into Expedition Hub completion state.',
);
assert.ok(
  dashboard.includes('completedGuidanceRouteSummary') &&
    dashboard.includes('selectDashboardExpeditionPresentation({') &&
    dashboard.includes('latestCompletedLog: latestCompletedExpeditionLog') &&
    dashboard.includes('completedExpeditionRecord={completedExpeditionSummaryRecord}'),
  'Dashboard should select a scoped just-completed Expedition or guidance summary without contaminating active state.',
);
assert.ok(
  widgetGrid.includes('renderOptions?.expeditionRouteCompleted') &&
    widgetGrid.includes('renderOptions?.completedExpeditionRecord') &&
    widgetGrid.includes('renderOptions?.expeditionRouteLifecycleState'),
  'WidgetGrid compact render keys should include Expedition Hub guidance completion fields so arrival updates re-render the hub.',
);

console.log('Expedition Hub UI checks passed.');
