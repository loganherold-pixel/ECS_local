const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const timelineSource = fs.readFileSync(path.join(root, 'components', 'dashboard', 'ExpeditionNotableMomentsTimeline.tsx'), 'utf8');
const tabSource = fs.readFileSync(path.join(root, 'components', 'dashboard', 'ExpeditionTab.tsx'), 'utf8');
const packageSource = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
const timelineModelPath = path.join(root, 'lib', 'expedition', 'expeditionNotableMomentTimelineModel.ts');

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

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
  }
  return originalLoad(request, parent, isMain);
};

const {
  formatNotableMomentLocalTime,
  normalizeExpeditionNotableMoments,
} = require(timelineModelPath);

function includes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function notIncludes(source, fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

includes(tabSource, "import ExpeditionNotableMomentsTimeline from './ExpeditionNotableMomentsTimeline'", 'Expedition detail should import the notable moments timeline.');
includes(tabSource, '<ExpeditionNotableMomentsTimeline', 'Expedition detail should render notable moments below the recap map.');
assert.ok(
  tabSource.indexOf('<ExpeditionRecapMap') < tabSource.indexOf('<ExpeditionNotableMomentsTimeline'),
  'Notable Moments timeline should appear below the Recap Map.',
);
includes(tabSource, 'recap={trip.recap}', 'Timeline should read stored completed-trip recap data.');
includes(tabSource, 'tripStartedAt={trip.startedAt}', 'Timeline should receive trip start time for elapsed-time labels.');

for (const snippet of [
  'Notable Moments',
  'No notable moments captured.',
  'Future expeditions will record key route, terrain, and condition events.',
  'normalizeExpeditionNotableMoments(recap, tripStartedAt)',
  '.sort((left, right) =>',
  'elapsedSeconds',
  'formatNotableMomentLocalTime',
  'timestamp',
  'description',
  'categoryForMoment',
  'highest_elevation',
  'weather_change',
  'route_deviation',
  'reroute_accepted',
  'terrain_risk_warning',
  'recovery_tools_opened',
  'campsite',
  'resupply',
  'source: \'expedition_recap\'',
]) {
  const sourceToCheck = snippet === '.sort((left, right) =>' ||
    snippet === 'elapsedSeconds' ||
    snippet === 'timestamp' ||
    snippet === 'description' ||
    snippet === 'categoryForMoment' ||
    snippet === 'highest_elevation' ||
    snippet === 'weather_change' ||
    snippet === 'route_deviation' ||
    snippet === 'reroute_accepted' ||
    snippet === 'terrain_risk_warning' ||
    snippet === 'recovery_tools_opened' ||
    snippet === 'campsite' ||
    snippet === 'resupply' ||
    snippet === 'source: \'expedition_recap\''
      ? fs.readFileSync(timelineModelPath, 'utf8')
      : timelineSource;
  includes(sourceToCheck, snippet, `Timeline should include required notable moment behavior: ${snippet}`);
}

for (const todo of [
  'TODO Expedition Timeline: support exploded route annotations',
  'TODO Expedition Timeline: expose badge triggers',
  'TODO Expedition Timeline: add PDF timeline export',
  'TODO Expedition Timeline: coordinate weather/terrain overlays',
]) {
  includes(timelineSource, todo, `Timeline future hook should remain TODO-only: ${todo}`);
}

for (const forbidden of [
  'SafetyChecklist',
  'RecoveryPanel',
  'exportExpeditionDebriefPdf',
  'Export PDF',
  'badge UI',
  'fake notable',
  'mock moment',
  'useExpeditionAssessmentStore',
  'followUser',
  'formatElapsed',
]) {
  notIncludes(timelineSource, forbidden, `Timeline should not include forbidden behavior: ${forbidden}`);
}

for (const behavior of [
  'selectedMomentId',
  'onSelectMoment',
  'accessibilityState={{ selected }}',
  'onPress={onSelectMoment ? () => onSelectMoment(moment.id) : undefined}',
]) {
  includes(timelineSource, behavior, `Timeline should expose interactive map-selection behavior: ${behavior}`);
}

includes(packageSource, 'test:expedition-notable-moments-timeline', 'package.json should expose the timeline test.');

const noisyRouteDeviationRecap = {
  tripId: 'timeline-noisy-deviation',
  generatedAt: '2026-05-01T18:00:00.000Z',
  journeySummary: {},
  routeSummary: {},
  expeditionEvents: {
    notableMoments: Array.from({ length: 40 }, (_, index) => ({
      id: `deviation-${index}`,
      capturedAt: new Date(Date.parse('2026-05-01T16:11:00.000Z') + index * 3000).toISOString(),
      type: 'route_deviation',
      title: 'Route deviation detected',
      detail: `${120 + index} m from route`,
      coordinate: { lat: 39.2 + index * 0.0001, lng: -120.2 - index * 0.0001 },
    })),
  },
};
const normalizedNoisyMoments = normalizeExpeditionNotableMoments(
  noisyRouteDeviationRecap,
  '2026-05-01T12:00:00.000Z',
);
assert.strictEqual(
  normalizedNoisyMoments.filter((moment) => moment.type === 'route_deviation').length,
  1,
  'Timeline normalization should collapse noisy route deviation samples inside one short window.',
);
const localTimeLabel = formatNotableMomentLocalTime('2026-05-01T16:11:00.000Z', 'en-US');
assert.ok(localTimeLabel.includes('2026'), 'Timeline time label should include the event date.');
assert.ok(/:\d{2}/.test(localTimeLabel), 'Timeline time label should include a local clock time.');
assert.ok(!localTimeLabel.includes('T+'), 'Timeline should not display elapsed T+ labels for saved notable moments.');

console.log('Expedition notable moments timeline checks passed.');
