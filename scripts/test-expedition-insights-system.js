const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const typesSource = read('lib/expedition/expeditionTripRecordTypes.ts');
const insightSource = read('lib/expedition/expeditionInsightStore.ts');
const tripStoreSource = read('lib/expedition/expeditionTripRecordStore.ts');
const hubSource = read('components/dashboard/ExpeditionTab.tsx');
const indexSource = read('lib/expedition/index.ts');

[
  'export interface ExpeditionInsight',
  'id: string',
  'type: ExpeditionInsightType',
  'title: string',
  'description: string',
  'confidence: number',
  'sourceTripIds: string[]',
  'generatedAt: string',
  'updatedAt: string',
  'isDismissed: boolean',
  'priority: number',
].forEach((snippet) => {
  assert(typesSource.includes(snippet), `ExpeditionInsight type should include ${snippet}.`);
});

[
  "'distance_pattern'",
  "'elevation_pattern'",
  "'weather_pattern'",
  "'time_of_day_pattern'",
  "'route_deviation_pattern'",
  "'recovery_usage'",
  "'milestone_progress'",
  "'expedition_frequency'",
  "'personal_record'",
  "'badge_progress'",
].forEach((type) => {
  assert(typesSource.includes(type), `ExpeditionInsightType should include ${type}.`);
});

[
  'generateInsightsFromTripHistory',
  'generateInsightsForCompletedTrip',
  'getCurrentInsights',
  'dismissInsight',
  'refreshExpeditionInsights',
].forEach((helper) => {
  assert(insightSource.includes(`export async function ${helper}`), `${helper} should be exported from insight store.`);
  assert(indexSource.includes(helper), `${helper} should be exported from expedition barrel.`);
});

assert(
  insightSource.includes("createMigratingNonSecureStorage('ecs_expedition_insights'"),
  'Expedition insights should persist through ECS local storage.',
);
assert(
  insightSource.includes('expeditionTripRecordStore.getCompleted()') &&
    insightSource.includes('getUnlockedBadges') &&
    insightSource.includes('getBadgeProgress') &&
    insightSource.includes('weatherSnapshots') &&
    insightSource.includes('terrainRiskSnapshots') &&
    insightSource.includes('notableMoments') &&
    insightSource.includes('recoveryPanelUsed'),
  'Insight generation should be grounded in completed trip, recap, badge, weather, terrain, notable moment, and recovery data.',
);
assert(
  tripStoreSource.includes('queueCompletedTripPostProcessing') &&
    tripStoreSource.includes("import('./expeditionInsightStore')") &&
    tripStoreSource.includes('generateInsightsForCompletedTrip(record.id)'),
  'Completed trip persistence should queue non-blocking insight generation.',
);
assert(
  hubSource.includes('getCurrentInsights') &&
    hubSource.includes('refreshExpeditionInsights') &&
    hubSource.includes('dismissInsight') &&
    hubSource.includes('Expedition Insights') &&
    hubSource.includes('if (insights.length === 0) return null;'),
  'Expedition Hub should render compact insights only when grounded insights exist.',
);
assert(
  !hubSource.includes('No insights') &&
    !hubSource.includes('placeholder insight') &&
    !hubSource.includes('Insight Dashboard'),
  'Expedition Hub should not render placeholder insight UI or a large dashboard.',
);

for (const forbidden of [
  'You should',
  'you should',
  'Next time',
  'next time',
  'you need',
  'ECS recommends',
  'recommend',
]) {
  assert(!insightSource.includes(forbidden), `Insights must avoid speculative or coaching copy: ${forbidden}`);
}

for (const todo of [
  'insight detail view',
  'badge progress explanations',
  'future recap export flows',
  'personal record cards',
  'seasonal expedition trends',
  'terrain preference analysis',
]) {
  assert(insightSource.includes(todo), `Insight future hook should mention ${todo}.`);
}

const memoryStorage = new Map();
global.localStorage = {
  getItem(key) {
    return memoryStorage.has(key) ? memoryStorage.get(key) : null;
  },
  setItem(key, value) {
    memoryStorage.set(key, String(value));
  },
  removeItem(key) {
    memoryStorage.delete(key);
  },
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
  }
  return originalLoad(request, parent, isMain);
};

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

const tripStorePath = path.join(root, 'lib', 'expedition', 'expeditionTripRecordStore.ts');
const badgeStorePath = path.join(root, 'lib', 'expedition', 'expeditionBadgeStore.ts');
const insightStorePath = path.join(root, 'lib', 'expedition', 'expeditionInsightStore.ts');

const {
  createNewActiveTripRecord,
  expeditionTripRecordStore,
  finalizeCompletedTrip,
  safelyStoreNotableMoment,
} = require(tripStorePath);
const {
  clearAllBadgesForTests,
  evaluateBadgesForCompletedTrip,
} = require(badgeStorePath);
const {
  clearAllInsightsForTests,
  dismissInsight,
  generateInsightsForCompletedTrip,
  generateInsightsFromTripHistory,
  getCurrentInsights,
  refreshExpeditionInsights,
} = require(insightStorePath);

async function saveCompletedTrip(input) {
  const active = createNewActiveTripRecord({
    id: input.id,
    title: input.title,
    startedAt: input.startedAt,
    routeGeometry: input.routeGeometry,
  });
  const withMoment = safelyStoreNotableMoment(active, {
    id: `${input.id}:manual-note`,
    capturedAt: input.startedAt,
    type: 'manual_note',
    title: 'Route note',
    detail: 'Observed field condition.',
    coordinate: input.routeGeometry[0],
    source: {
      source: 'test',
      quality: 'mock',
      capturedAt: input.startedAt,
    },
  });
  const completed = finalizeCompletedTrip(withMoment, {
    completedAt: input.completedAt,
    totalDistanceMiles: input.totalDistanceMiles,
    totalDurationSeconds: input.totalDurationSeconds,
    endCoordinate: input.routeGeometry[input.routeGeometry.length - 1],
  });
  await expeditionTripRecordStore.save({
    ...completed,
    weatherSnapshots: input.weatherSnapshots ?? [],
    terrainRiskSnapshots: input.terrainRiskSnapshots ?? [],
    recoveryPanelUsed: input.recoveryPanelUsed ?? [],
  });
  await evaluateBadgesForCompletedTrip(input.id);
}

async function main() {
  await expeditionTripRecordStore.clearAllForTests();
  await clearAllBadgesForTests();
  await clearAllInsightsForTests();

  assert.deepStrictEqual(await generateInsightsFromTripHistory(), [], 'No completed trips should produce no insight cards.');

  await saveCompletedTrip({
    id: 'insight-trip-1',
    title: 'Foothill Route',
    startedAt: '2026-05-01T13:00:00.000Z',
    completedAt: '2026-05-01T19:15:00.000',
    totalDistanceMiles: 42,
    totalDurationSeconds: 6 * 3600,
    routeGeometry: [
      { lat: 39, lng: -104, elevationFt: 5200 },
      { lat: 39.4, lng: -104.3, elevationFt: 6900 },
    ],
    weatherSnapshots: [
      {
        id: 'weather-1a',
        capturedAt: '2026-05-01T15:00:00.000Z',
        summary: 'Clear',
        precipitation: null,
        source: { source: 'test_weather', quality: 'mock', capturedAt: '2026-05-01T15:00:00.000Z' },
      },
      {
        id: 'weather-1b',
        capturedAt: '2026-05-01T18:00:00.000Z',
        summary: 'Rain',
        precipitation: 'Rain',
        source: { source: 'test_weather', quality: 'mock', capturedAt: '2026-05-01T18:00:00.000Z' },
      },
    ],
    terrainRiskSnapshots: [
      {
        id: 'terrain-1',
        capturedAt: '2026-05-01T17:00:00.000Z',
        riskLevel: 'watch',
        summary: 'Loose grade',
        source: { source: 'test_terrain', quality: 'mock', capturedAt: '2026-05-01T17:00:00.000Z' },
      },
    ],
  });

  await saveCompletedTrip({
    id: 'insight-trip-2',
    title: 'High Ridge Route',
    startedAt: '2026-05-04T12:00:00.000Z',
    completedAt: '2026-05-04T18:30:00.000',
    totalDistanceMiles: 184,
    totalDurationSeconds: 7 * 3600,
    routeGeometry: [
      { lat: 40, lng: -105, elevationFt: 6100 },
      { lat: 40.8, lng: -105.6, elevationFt: 7420 },
    ],
    weatherSnapshots: [
      {
        id: 'weather-2a',
        capturedAt: '2026-05-04T14:00:00.000Z',
        summary: 'Wind',
        precipitation: null,
        source: { source: 'test_weather', quality: 'mock', capturedAt: '2026-05-04T14:00:00.000Z' },
      },
      {
        id: 'weather-2b',
        capturedAt: '2026-05-04T18:00:00.000Z',
        summary: 'Snow',
        precipitation: 'Snow',
        source: { source: 'test_weather', quality: 'mock', capturedAt: '2026-05-04T18:00:00.000Z' },
      },
    ],
    terrainRiskSnapshots: [
      {
        id: 'terrain-2',
        capturedAt: '2026-05-04T16:00:00.000Z',
        riskLevel: 'caution',
        summary: 'Steep grade',
        source: { source: 'test_terrain', quality: 'mock', capturedAt: '2026-05-04T16:00:00.000Z' },
      },
    ],
    recoveryPanelUsed: [
      {
        usedAt: '2026-05-04T17:00:00.000Z',
        context: 'Winch reference opened',
        source: { source: 'test_recovery', quality: 'mock', capturedAt: '2026-05-04T17:00:00.000Z' },
      },
    ],
  });

  await saveCompletedTrip({
    id: 'insight-trip-3',
    title: 'Evening Mesa Route',
    startedAt: '2026-05-08T11:00:00.000Z',
    completedAt: '2026-05-08T19:45:00.000',
    totalDistanceMiles: 66,
    totalDurationSeconds: 8 * 3600,
    routeGeometry: [
      { lat: 41, lng: -106, elevationFt: 5800 },
      { lat: 41.5, lng: -106.3, elevationFt: 7100 },
    ],
  });

  const insights = await generateInsightsFromTripHistory();
  assert(insights.length >= 3, 'Multiple completed trips should produce grounded insights.');
  assert(insights.length > 3, 'The store can generate more than the Hub preview limit.');
  assert(insights.some((insight) => insight.id === 'personal-record-longest-distance'));
  assert(insights.some((insight) => insight.description.includes('184 miles')));
  assert(insights.some((insight) => insight.description.includes('7,420 ft')));
  assert(insights.some((insight) => insight.id === 'finish-time-sunset-pattern'));
  assert(insights.some((insight) => insight.id === 'weather-change-count'));
  assert(insights.every((insight) => insight.sourceTripIds.length > 0), 'Every generated insight should cite real trip IDs.');

  const currentPreview = await getCurrentInsights();
  assert.strictEqual(currentPreview.length, 3, 'Current insights should return the 1-3 card Hub preview.');
  assert(currentPreview[0].priority >= currentPreview[1].priority, 'Insights should be priority sorted.');

  const dismissed = await dismissInsight(currentPreview[0].id);
  assert.strictEqual(dismissed.isDismissed, true);
  const afterDismiss = await getCurrentInsights();
  assert(!afterDismiss.some((insight) => insight.id === currentPreview[0].id), 'Dismissed insights should stay hidden.');

  await refreshExpeditionInsights();
  const afterRefresh = await getCurrentInsights(10);
  assert(!afterRefresh.some((insight) => insight.id === currentPreview[0].id), 'Refreshing should not resurrect dismissed insights.');

  const tripScoped = await generateInsightsForCompletedTrip('insight-trip-3');
  assert(tripScoped.length > 0, 'Completed trip scoped generation should refresh history insights.');
  assert.deepStrictEqual(await generateInsightsForCompletedTrip('missing-trip'), [], 'Missing trip insight generation should be safe.');

  const persistedKeys = Array.from(memoryStorage.keys()).join('\n');
  assert(persistedKeys.includes('ecs_expedition_insights'), 'Insights should survive relaunch through local storage.');

  console.log('Expedition insights system checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
