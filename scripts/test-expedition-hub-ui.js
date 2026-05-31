const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const expeditionTab = fs.readFileSync(path.join(root, 'components', 'dashboard', 'ExpeditionTab.tsx'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'app', '(tabs)', 'dashboard.tsx'), 'utf8');

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
  'Unlocked Badges',
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
includes('stats.totalExpeditions === 1', 'Total expedition label should handle singular/plural values.');
includes('formatWholeMiles(stats.totalMiles)', 'Total miles should come from trip summaries.');
includes('formatElevation(stats.highestElevationFt)', 'Highest elevation should come from trip summaries.');
includes('formatHours(stats.totalHours)', 'Hours logged should come from trip durations.');
notIncludes('<IncidentRecoveryPanel', 'Incident & Recovery should move out of Expedition Hub and into Field Utilities.');

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
  'Plan Expedition',
  'clearWizardDraft',
  "router.push('/expedition-wizard' as any)",
  'Export PDF',
  'exportExpeditionDebriefPdf',
  'Lorem',
  'placeholder widget',
  'EXPEDITION_BADGE_DEFINITIONS.map',
  'mystery badge',
  'Locked Badge',
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

console.log('Expedition Hub UI checks passed.');
