const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const recordPath = path.join(root, 'lib', 'debrief', 'expeditionDebriefRecord.ts');
const panelPath = path.join(root, 'components', 'dashboard', 'ExpeditionReplayDebriefPanel.tsx');
const tabPath = path.join(root, 'components', 'dashboard', 'ExpeditionTab.tsx');
const packagePath = path.join(root, 'package.json');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return {
      ActivityIndicator: 'ActivityIndicator',
      Platform: { OS: 'web' },
      ScrollView: 'ScrollView',
      StyleSheet: { create: (styles) => styles, absoluteFillObject: {} },
      Text: 'Text',
      TouchableOpacity: 'TouchableOpacity',
      useWindowDimensions: () => ({ width: 980, height: 720 }),
      View: 'View',
    };
  }
  return originalLoad(request, parent, isMain);
};

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

const {
  DEBRIEF_CHAPTER_ORDER,
  buildExpeditionDebriefRecord,
  createDebriefPrepTaskPayload,
  filterDebriefMapOverlaysForRecord,
  getInitialDebriefSelectionState,
  isExpeditionReplayDebriefFeatureEnabled,
  selectDebriefEvent,
  selectDebriefMapOverlay,
  selectDebriefRecommendation,
} = require(recordPath);

const panelSource = fs.readFileSync(panelPath, 'utf8');
const tabSource = fs.readFileSync(tabPath, 'utf8');
const packageSource = fs.readFileSync(packagePath, 'utf8');

const baseTime = '2026-06-01T14:00:00.000Z';

function evidence(evidenceId, sourceSystem, label, value, overrides = {}) {
  return {
    evidenceId,
    sourceSystem,
    eventTime: overrides.eventTime || baseTime,
    knownAt: overrides.knownAt || baseTime,
    generatedAt: overrides.generatedAt || baseTime,
    valueState: overrides.valueState || 'observed',
    confidence: overrides.confidence || 'high',
    freshness: overrides.freshness || 'current',
    label,
    value,
    detail: overrides.detail || `${label} known at the time.`,
    restricted: overrides.restricted,
  };
}

function event(eventId, chapterId, title, evidenceIds, overrides = {}) {
  return {
    eventId,
    chapterId,
    title,
    summary: overrides.summary || `${title} summary known at the time.`,
    eventTime: overrides.eventTime || baseTime,
    knownAt: overrides.knownAt || baseTime,
    location: overrides.location,
    evidenceIds,
    relatedSystemIds: overrides.relatedSystemIds || [chapterId],
    severity: overrides.severity || 'notice',
  };
}

function buildCompleteFixture(extra = {}) {
  return buildExpeditionDebriefRecord({
    debriefId: 'debrief-trip-1',
    tripId: 'trip-1',
    routeId: 'route-1',
    routeGeometryVersion: 'geom-v1',
    generatedAt: '2026-06-01T22:30:00.000Z',
    tripSummary: {
      completionStatus: 'completed',
      readinessDelta: 'go to caution',
      incidentCount: 1,
      offlineGapCount: 2,
      topRecommendationIds: ['rec-loadout-fix'],
    },
    evidence: [
      evidence('ev-ready', 'readiness', 'Departure readiness', 'go'),
      evidence('ev-route-confidence', 'route_confidence', 'Unverified trail section', 'medium confidence', { confidence: 'medium' }),
      evidence('ev-offline-gap', 'offline_honesty', 'Offline package gap', 'coverage gap', { valueState: 'stale', confidence: 'low', freshness: 'stale' }),
      evidence('ev-weather', 'weather', 'Weather snapshot', 'Wind 18 mph at 10:30', { confidence: 'medium', laterCorrectedValue: 'Clear skies corrected later' }),
      evidence('ev-incident', 'cad', 'Check-in incident', 'assist requested by check-in', { confidence: 'medium' }),
      evidence('ev-camp', 'campops', 'Camp decision deadline', 'backup endpoint selected', { confidence: 'low', freshness: 'stale' }),
      evidence('ev-loadout', 'loadout', 'Loadout issue', 'rear load high', { confidence: 'medium' }),
      evidence('ev-recovery', 'incident_recovery', 'Recovery action', 'recovery packet reviewed', { confidence: 'high' }),
      evidence('ev-next', 'task_system', 'Next prep recommendation', 'redistribute rear load'),
      evidence('ev-private-checkin', 'convoy_checkin', 'Private check-in coordinate', '37.123,-112.456', { restricted: true }),
    ],
    events: [
      event('event-ready', 'departure_readiness_baseline', 'Departure readiness baseline', ['ev-ready']),
      event('event-route-confidence', 'route_confidence_changes', 'Route confidence changed', ['ev-route-confidence']),
      event('event-offline-gap', 'offline_stale_data_gaps', 'Offline coverage gap', ['ev-offline-gap']),
      event('event-weather', 'weather_snapshots', 'Weather known at decision time', ['ev-weather']),
      event('event-incident', 'cad_checkin_incident_moments', 'CAD check-in incident', ['ev-incident', 'ev-private-checkin'], {
        location: { latitude: 37.123, longitude: -112.456, routeId: 'route-1', routeGeometryVersion: 'geom-v1', label: 'Member check-in' },
      }),
      event('event-camp', 'camp_endpoint_decisions', 'Camp endpoint decision', ['ev-camp']),
      event('event-loadout', 'loadout_vehicle_issues', 'Loadout issue noted', ['ev-loadout']),
      event('event-recovery', 'recovery_actions', 'Recovery action reviewed', ['ev-recovery', 'ev-incident']),
      event('event-next', 'next_expedition_recommendations', 'Next expedition recommendation', ['ev-next', 'ev-loadout']),
    ],
    mapOverlays: [
      {
        overlayId: 'overlay-confidence',
        type: 'confidence_segment',
        routeId: 'route-1',
        routeGeometryVersion: 'geom-v1',
        startMeasure: 4.5,
        endMeasure: 7.2,
        label: 'Unverified trail section',
        confidence: 'medium',
        valueState: 'inferred',
        freshness: 'current',
        eventIds: ['event-route-confidence'],
        evidenceIds: ['ev-route-confidence'],
      },
      {
        overlayId: 'overlay-offline-gap',
        type: 'offline_gap',
        routeId: 'route-1',
        routeGeometryVersion: 'geom-v1',
        startMeasure: 7.2,
        endMeasure: 9.1,
        label: 'Offline map gap',
        confidence: 'low',
        valueState: 'stale',
        freshness: 'stale',
        eventIds: ['event-offline-gap'],
        evidenceIds: ['ev-offline-gap'],
      },
      {
        overlayId: 'overlay-stale-span',
        type: 'stale_span',
        routeId: 'route-1',
        routeGeometryVersion: 'geom-v1',
        startMeasure: 9.1,
        endMeasure: 10.4,
        label: 'Stale weather span',
        confidence: 'unknown',
        valueState: 'stale',
        freshness: 'expired',
        eventIds: ['event-weather'],
        evidenceIds: ['ev-weather'],
      },
      {
        overlayId: 'overlay-camp',
        type: 'camp_endpoint',
        latitude: 37.5,
        longitude: -112.6,
        label: 'Backup endpoint',
        confidence: 'low',
        valueState: 'stale',
        freshness: 'stale',
        eventIds: ['event-camp'],
        evidenceIds: ['ev-camp'],
      },
      {
        overlayId: 'overlay-private',
        type: 'event_marker',
        latitude: 37.123,
        longitude: -112.456,
        label: 'Private check-in coordinate',
        confidence: 'medium',
        valueState: 'observed',
        freshness: 'current',
        eventIds: ['event-incident'],
        evidenceIds: ['ev-private-checkin'],
      },
      {
        overlayId: 'overlay-mismatch',
        type: 'confidence_segment',
        routeId: 'route-1',
        routeGeometryVersion: 'geom-old',
        startMeasure: 12,
        endMeasure: 13,
        label: 'Wrong geometry confidence segment',
        confidence: 'high',
        valueState: 'observed',
        freshness: 'current',
        eventIds: ['event-route-confidence'],
        evidenceIds: ['ev-route-confidence'],
      },
    ],
    recommendations: [
      {
        recommendationId: 'rec-loadout-fix',
        title: 'Redistribute rear load before the next route',
        rationale: 'Rear load issue linked to the debrief loadout evidence.',
        targetArea: 'loadout',
        linkedEvidenceIds: ['ev-loadout'],
        linkedEventIds: ['event-loadout'],
        state: 'open',
      },
    ],
    sourceCoverage: [
      { sourceSystem: 'readiness', status: 'complete', availableEvidenceIds: ['ev-ready'] },
      { sourceSystem: 'offline_honesty', status: 'partial', availableEvidenceIds: ['ev-offline-gap'] },
      { sourceSystem: 'weather', status: 'complete', availableEvidenceIds: ['ev-weather'] },
    ],
    ...extra,
  });
}

assert.strictEqual(isExpeditionReplayDebriefFeatureEnabled(), false, 'Replay debrief must fail closed by default.');
assert.strictEqual(isExpeditionReplayDebriefFeatureEnabled({ expeditionReplayDebrief: true }), true);
assert.strictEqual(isExpeditionReplayDebriefFeatureEnabled({ expeditionReplayDebriefMapEnabled: false }), false);

const record = buildCompleteFixture();
assert.deepStrictEqual(
  record.chapters.map((chapter) => chapter.type),
  DEBRIEF_CHAPTER_ORDER,
  'Debrief chapters must render in the required order.',
);
assert.deepStrictEqual(record.tripSummary, {
  completionStatus: 'completed',
  readinessDelta: 'go to caution',
  incidentCount: 1,
  offlineGapCount: 2,
  topRecommendationIds: ['rec-loadout-fix'],
});
assert.strictEqual(record.status, 'source_limited', 'Private restricted evidence should keep the read model source-limited.');

record.events.forEach((item) => {
  assert.ok(item.eventTime, `${item.eventId} must have eventTime.`);
  assert.ok(item.knownAt, `${item.eventId} must have knownAt.`);
  assert.ok(item.evidenceIds.length > 0, `${item.eventId} must link source evidence.`);
  item.evidenceIds.forEach((evidenceId) => {
    const source = record.evidence.find((entry) => entry.evidenceId === evidenceId);
    assert.ok(source, `${item.eventId} evidence ${evidenceId} must exist.`);
    assert.ok(source.sourceSystem, `${evidenceId} must include source system.`);
    assert.ok(source.confidence, `${evidenceId} must include confidence.`);
    assert.ok(source.valueState, `${evidenceId} must include value state.`);
  });
});

const offlineOverlay = record.mapOverlays.find((overlay) => overlay.overlayId === 'overlay-offline-gap');
assert.ok(offlineOverlay, 'Offline periods should produce offline_gap overlays.');
assert.strictEqual(offlineOverlay.type, 'offline_gap');
assert.notStrictEqual(offlineOverlay.confidence, 'high', 'Offline gaps must not look like confident route knowledge.');
assert.strictEqual(record.mapOverlays.some((overlay) => overlay.overlayId === 'overlay-stale-span'), true, 'Stale periods should produce stale spans.');
assert.strictEqual(record.mapOverlays.some((overlay) => overlay.overlayId === 'overlay-mismatch'), false, 'Mismatched route geometry overlays must be suppressed.');

const weatherEvidence = record.evidence.find((entry) => entry.evidenceId === 'ev-weather');
assert.ok(weatherEvidence);
assert.strictEqual(weatherEvidence.value, 'Wind 18 mph at 10:30');
assert.ok(!JSON.stringify(record).includes('Clear skies corrected later'), 'Later-corrected weather must not overwrite known-at-time evidence.');

assert.ok(record.events.find((item) => item.eventId === 'event-incident')?.evidenceIds.includes('ev-incident'), 'Incident chapter should link incident evidence.');
assert.ok(record.events.find((item) => item.eventId === 'event-recovery')?.evidenceIds.includes('ev-recovery'), 'Recovery chapter should link recovery action evidence.');
assert.ok(record.chapters.find((chapter) => chapter.type === 'camp_endpoint_decisions')?.evidenceIds.includes('ev-camp'), 'Camp decisions should include CampOps evidence.');
assert.ok(record.chapters.find((chapter) => chapter.type === 'loadout_vehicle_issues')?.eventIds.includes('event-loadout'), 'Loadout issues should appear in the timeline chapter.');
assert.deepStrictEqual(record.recommendations[0].linkedEvidenceIds, ['ev-loadout']);

const taskPayload = createDebriefPrepTaskPayload(record, 'rec-loadout-fix');
assert.deepStrictEqual(taskPayload, {
  title: 'Redistribute rear load before the next route',
  description: 'Rear load issue linked to the debrief loadout evidence.',
  targetArea: 'loadout',
  sourceDebriefId: 'debrief-trip-1',
  sourceRecommendationId: 'rec-loadout-fix',
  linkedEvidenceIds: ['ev-loadout'],
  linkedEventIds: ['event-loadout'],
});

const convertedRecord = buildCompleteFixture({
  recommendations: [
    {
      recommendationId: 'rec-loadout-fix',
      title: 'Redistribute rear load before the next route',
      rationale: 'Rear load issue linked to the debrief loadout evidence.',
      targetArea: 'loadout',
      linkedEvidenceIds: ['ev-loadout'],
      linkedEventIds: ['event-loadout'],
      state: 'converted_to_task',
      createdTaskId: 'task-1',
    },
  ],
});
assert.strictEqual(createDebriefPrepTaskPayload(convertedRecord, 'rec-loadout-fix'), null, 'Converted recommendations should not create duplicate tasks.');

const missingRecord = buildExpeditionDebriefRecord({
  debriefId: 'debrief-missing',
  tripId: 'trip-missing',
  generatedAt: '2026-06-01T22:30:00.000Z',
  missingSources: [
    { sourceSystem: 'weather', reason: 'Weather history is unavailable.' },
    { sourceSystem: 'offline_honesty', reason: 'Offline replay metadata is unavailable.' },
    { sourceSystem: 'readiness', reason: 'Readiness baseline is unavailable.' },
  ],
});
assert.strictEqual(missingRecord.status, 'source_limited');
assert.ok(missingRecord.warnings.some((warning) => warning.includes('Weather history is unavailable.')));
assert.ok(missingRecord.sourceCoverage.some((coverage) => coverage.sourceSystem === 'weather' && coverage.status === 'missing'));
assert.ok(!missingRecord.warnings.some((warning) => /no offline gaps/i.test(warning)), 'Missing offline data must not imply no offline gaps.');

const renderedOverlays = filterDebriefMapOverlaysForRecord({
  ...record,
  mapOverlays: [
    ...record.mapOverlays,
    {
      overlayId: 'overlay-route-mismatch',
      type: 'route_segment',
      routeId: 'route-2',
      routeGeometryVersion: 'geom-v1',
      startMeasure: 1,
      endMeasure: 2,
      label: 'Wrong route',
      eventIds: [],
      evidenceIds: [],
    },
  ],
});
assert.strictEqual(renderedOverlays.some((overlay) => overlay.overlayId === 'overlay-route-mismatch'), false);

const redactedEvidence = record.evidence.find((entry) => entry.evidenceId === 'ev-private-checkin');
assert.ok(redactedEvidence);
assert.strictEqual(redactedEvidence.valueState, 'unavailable');
assert.strictEqual(redactedEvidence.freshness, 'unavailable');
assert.strictEqual(redactedEvidence.value, null);
assert.ok(!JSON.stringify(record).includes('37.123,-112.456'), 'Restricted raw coordinates should not leak to unauthorized viewers.');
const redactedOverlay = record.mapOverlays.find((overlay) => overlay.overlayId === 'overlay-private');
assert.strictEqual(redactedOverlay.latitude, undefined);
assert.strictEqual(redactedOverlay.longitude, undefined);

let selection = getInitialDebriefSelectionState(record);
assert.strictEqual(selection.selectedChapterId, 'departure_readiness_baseline');
selection = selectDebriefEvent(record, selection, 'event-offline-gap');
assert.strictEqual(selection.selectedChapterId, 'offline_stale_data_gaps');
assert.strictEqual(selection.selectedMapOverlayId, 'overlay-offline-gap');
selection = selectDebriefMapOverlay(record, selection, 'overlay-camp');
assert.strictEqual(selection.selectedEventId, 'event-camp');
assert.strictEqual(selection.selectedChapterId, 'camp_endpoint_decisions');
selection = selectDebriefRecommendation(record, selection, 'rec-loadout-fix');
assert.strictEqual(selection.selectedEventId, 'event-loadout');
assert.strictEqual(selection.selectedRecommendationId, 'rec-loadout-fix');

for (const snippet of [
  'Expedition Replay & Debrief',
  'Internal beta',
  'known at the time',
  'source-limited',
  'stale',
  'unavailable',
  'DebriefSourceChip',
  'filterDebriefMapOverlaysForRecord',
  'createDebriefPrepTaskPayload',
  'onSelectTimelineEvent',
  'onSelectMapOverlay',
  'desktopReplayLayout',
  'mobileReplayLayout',
  'testID="expedition-replay-map-workspace"',
  'testID="expedition-replay-timeline"',
  'testID="expedition-replay-detail-panel"',
  'testID="expedition-replay-mobile-chapter-selector"',
]) {
  assert.ok(panelSource.includes(snippet), `Replay panel should include ${snippet}.`);
}

for (const forbidden of ['bad decision', 'ignored warning']) {
  assert.ok(!panelSource.toLowerCase().includes(forbidden), `Replay panel should avoid blame copy: ${forbidden}.`);
}

for (const snippet of [
  "import ExpeditionReplayDebriefPanel from './ExpeditionReplayDebriefPanel'",
  'buildExpeditionDebriefRecord',
  'isExpeditionReplayDebriefFeatureEnabled',
  'const expeditionReplayDebriefEnabled = isExpeditionReplayDebriefFeatureEnabled()',
  'expeditionReplayDebriefEnabled ?',
  '<ExpeditionReplayDebriefPanel',
  'enabled={expeditionReplayDebriefEnabled}',
]) {
  assert.ok(tabSource.includes(snippet), `Expedition detail should include beta replay wiring: ${snippet}.`);
}

assert.ok(packageSource.includes('test:expedition-replay-debrief'), 'package.json should expose the replay debrief test.');

console.log('Expedition replay debrief checks passed.');
