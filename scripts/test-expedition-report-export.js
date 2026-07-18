const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const htmlOutputFlagIndex = process.argv.indexOf('--html-output');
const htmlOutputPath = htmlOutputFlagIndex >= 0 && process.argv[htmlOutputFlagIndex + 1]
  ? path.resolve(root, process.argv[htmlOutputFlagIndex + 1])
  : null;

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const typesSource = read('lib/expedition/expeditionTripRecordTypes.ts');
const reportStoreSource = read('lib/expedition/expeditionReportStore.ts');
const hubSource = read('components/dashboard/ExpeditionTab.tsx');
const indexSource = read('lib/expedition/index.ts');

[
  'export interface ExpeditionReport',
  'tripId',
  'sourceFingerprint',
  'privacyMode',
  'generatedAt',
  'title',
  'completedAt',
  'totalDistanceMiles',
  'totalDurationSeconds',
  'maxElevationFt',
  'elevationGainFt',
  'recapHeadline',
  'recapSummary',
  'notableMoments',
  'badgesEarned',
  'routeBounds',
  'routeGeometryReference',
  'mapSnapshotUri',
  'exportFormat',
  'localUri',
  'createdAt',
  "export type ExpeditionReportExportStatus = 'idle' | 'generating' | 'ready' | 'failed'",
].forEach((snippet) => {
  assert(typesSource.includes(snippet), `Expedition report model should include ${snippet}.`);
});

[
  'generateExpeditionReport',
  'getAllExpeditionReports',
  'getReportForTrip',
  'getReportsForTrip',
  'getMostRecentReports',
  'regenerateExpeditionReport',
  'deleteExpeditionReport',
  'downloadExpeditionReport',
  'shareExpeditionReport',
].forEach((helper) => {
  assert(reportStoreSource.includes(`export async function ${helper}`), `${helper} should be exported by report store.`);
  assert(indexSource.includes(helper), `${helper} should be exported by the expedition barrel.`);
});

[
  "createMigratingNonSecureStorage('ecs_expedition_reports'",
  "await import('expo-print')",
  "await import('expo-sharing')",
  'fsEnsureDir',
  'fsWriteString',
  'fsReadString',
  'Expedition report download started.',
  'getReportMimeType',
  'base64,',
  'ECS Expedition Report',
  'Journey Story',
  'Route Story',
  'Expedition Timeline',
  'Badges Earned',
  'report.exportFormat === \'pdf\'',
].forEach((snippet) => {
  assert(reportStoreSource.includes(snippet), `Report store should include ${snippet}.`);
});

for (const todo of [
  'printable high-resolution map tiles',
  'badge stamp artwork',
  'QR code route reference',
  'cloud backup of reports',
  'user-selected report themes',
]) {
  assert(reportStoreSource.includes(todo), `Report store should keep future hook: ${todo}.`);
}

[
  'Export Expedition Report',
  'generateExpeditionReport',
  'downloadExpeditionReport',
  'shareExpeditionReport',
  'ExpeditionReportExportStatus',
  "useState<ExpeditionReportExportStatus>('idle')",
  "setReportStatus('generating')",
  "setReportStatus('ready')",
  "setReportStatus('failed')",
  'document-text-outline',
].forEach((snippet) => {
  assert(hubSource.includes(snippet), `Expedition Detail should include report export UI support: ${snippet}.`);
});

for (const forbidden of [
  'SafetyChecklist',
  'fake report',
  'placeholder report',
  'EXPEDITION_BADGE_DEFINITIONS.map',
  'Locked Badge',
  'mystery badge',
  'You should',
  'ECS recommends',
]) {
  assert(!reportStoreSource.includes(forbidden), `Report export should avoid forbidden report behavior: ${forbidden}.`);
  assert(!hubSource.includes(forbidden), `Report UI should avoid forbidden report behavior: ${forbidden}.`);
}

const memoryStorage = new Map();
const writtenFiles = new Map();
let sharedUri = null;
let sharingAvailable = true;
let downloadedHref = null;
let downloadedName = null;
let printCallCount = 0;

const trackedEventFixtures = {
  liveLog: [
    {
      id: 'live-mechanical-1',
      expedition_id: 'expedition-report-1',
      created_at: '2026-05-01T10:00:00.000Z',
      created_by: 'private-user-id',
      event_type: 'MECH',
      severity: 'HIGH',
      details: 'Engine temperature rose; contact driver@example.com was redacted.',
      title: 'Cooling-system check',
      lat: 35.3,
      lon: -111.3,
      attachments: [{ secret: 'must-not-export' }],
      _optimistic: false,
      _failed: true,
    },
    {
      id: 'live-other-expedition',
      expedition_id: 'other-expedition',
      created_at: '2026-05-01T10:15:00.000Z',
      event_type: 'COMMS',
      severity: 'LOW',
      details: 'Must not leak',
      title: 'Other expedition',
      lat: null,
      lon: null,
      attachments: [],
    },
  ],
  fieldLogs: [
    {
      id: 'field-comms-1',
      user_id: 'user-1',
      expedition_id: 'expedition-report-1',
      type: 'comms',
      title: 'Convoy check-in',
      body: 'Sweep confirmed the group was together at the checkpoint.',
      lat: 35.45,
      lng: -111.45,
      occurred_at: '2026-05-01T13:20:00.000Z',
      meta: null,
      created_at: '2026-05-01T13:20:00.000Z',
      updated_at: '2026-05-01T13:20:00.000Z',
      deleted_at: null,
      version: 1,
    },
  ],
  dispatchSnapshot: {
    version: 7,
    expeditionId: 'expedition-report-1',
    pings: [],
    queueItems: [],
    assignments: [],
    assistRequests: [],
    acknowledgments: [],
    timelineEvents: [
      {
        id: 'dispatch-timeline-1',
        type: 'ping_acknowledged',
        title: 'Lead check-in acknowledged',
        detail: 'Acknowledgment received before the ridge section.',
        occurredAt: '2026-05-01T13:30:00.000Z',
        priority: 'normal',
        memberIds: ['private-member-id'],
        actor: 'private-actor',
        deliveryState: 'acknowledged',
      },
    ],
    offlineActions: [],
    cadEvents: [],
    missionCommands: [],
    missionCommandEvents: [],
    guardianCheckIns: [],
    operationalPlaybooks: [],
    updatedAt: '2026-05-01T13:30:00.000Z',
  },
};

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

global.document = {
  body: {
    appendChild() {},
  },
  createElement() {
    return {
      href: '',
      download: '',
      rel: '',
      click() {
        downloadedHref = this.href;
        downloadedName = this.download;
      },
      remove() {},
    };
  },
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '../expeditionEventStore') {
    return {
      expeditionEventStore: {
        loadEvents: async () => trackedEventFixtures.liveLog,
      },
    };
  }
  if (request === '../expeditionCommandStore') {
    return {
      fieldLogStore: {
        list: async () => trackedEventFixtures.fieldLogs,
      },
    };
  }
  if (request === '../dispatchPersistenceAdapter') {
    return {
      dispatchPersistenceAdapter: {
        hydrateResult: async () => ({
          snapshot: trackedEventFixtures.dispatchSnapshot,
          status: 'ready',
          safeCode: 'dispatch_persistence_ready',
        }),
      },
    };
  }
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
  }
  if (request === 'expo-print') {
    return {
      printToFileAsync: async () => {
        printCallCount += 1;
        return { uri: 'file:///tmp/generated-expedition-report.pdf' };
      },
    };
  }
  if (request === 'expo-sharing') {
    return {
      isAvailableAsync: async () => sharingAvailable,
      shareAsync: async (uri) => {
        sharedUri = uri;
      },
    };
  }
  if (request === 'expo-file-system/legacy') {
    return {
      documentDirectory: 'file:///documents/',
      EncodingType: { UTF8: 'utf8', Base64: 'base64' },
      getInfoAsync: async (uri) => ({
        exists: uri.endsWith('/') || writtenFiles.has(uri),
        isDirectory: uri.endsWith('/'),
        size: writtenFiles.get(uri)?.length ?? 1024,
      }),
      makeDirectoryAsync: async (uri) => {
        writtenFiles.set(uri, '');
      },
      writeAsStringAsync: async (uri, body) => {
        writtenFiles.set(uri, body);
      },
      readAsStringAsync: async (uri) => {
        if (writtenFiles.has(uri)) return writtenFiles.get(uri);
        if (uri.endsWith('.pdf')) return 'cGRm';
        return '';
      },
      deleteAsync: async (uri) => {
        writtenFiles.delete(uri);
      },
    };
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
const reportStorePath = path.join(root, 'lib', 'expedition', 'expeditionReportStore.ts');
const reportStoryPath = path.join(root, 'lib', 'expedition', 'expeditionReportStory.ts');

const {
  createNewActiveTripRecord,
  expeditionTripRecordStore,
  finalizeCompletedTrip,
} = require(tripStorePath);
const {
  clearAllBadgesForTests,
  evaluateBadgesForCompletedTrip,
} = require(badgeStorePath);
const {
  clearAllExpeditionReportsForTests,
  deleteExpeditionReport,
  downloadExpeditionReport,
  generateExpeditionReport,
  getAllExpeditionReports,
  getMostRecentReports,
  getReportForTrip,
  getReportsForTrip,
  regenerateExpeditionReport,
  shareExpeditionReport,
} = require(reportStorePath);
const { buildExpeditionReportStory } = require(reportStoryPath);

async function main() {
  await expeditionTripRecordStore.clearAllForTests();
  await clearAllBadgesForTests();
  await clearAllExpeditionReportsForTests();

  const active = createNewActiveTripRecord({
    id: 'report-trip-1',
    expeditionId: 'expedition-report-1',
    userId: 'user-1',
    title: 'Black Mesa Loop',
    startedAt: '2026-05-01T07:00:00.000Z',
    routeGeometry: [
      { lat: 35.1, lng: -111.1, elevationFt: 5200 },
      { lat: 35.4, lng: -111.4, elevationFt: 6800 },
      { lat: 35.8, lng: -111.8, elevationFt: 6100 },
    ],
  });
  const source = (name, quality = 'live', capturedAt = '2026-05-01T08:00:00.000Z') => ({
    source: name,
    quality,
    capturedAt,
    staleAt: null,
    note: null,
  });
  const storyActive = {
    ...active,
    weatherSnapshots: [
      {
        id: 'weather-clear',
        capturedAt: '2026-05-01T08:00:00.000Z',
        coordinate: { lat: 35.1, lng: -111.1 },
        summary: 'Clear at departure',
        temperatureF: 51,
        windMph: 4,
        precipitation: 'none',
        source: source('weather_broker'),
      },
      {
        id: 'weather-wind',
        capturedAt: '2026-05-01T12:30:00.000Z',
        coordinate: { lat: 35.4, lng: -111.4 },
        summary: 'Wind increased on the ridge',
        temperatureF: 63,
        windMph: 24,
        precipitation: 'none',
        source: source('weather_broker', 'cached', '2026-05-01T12:25:00.000Z'),
      },
    ],
    terrainRiskSnapshots: [
      {
        id: 'terrain-ridge',
        capturedAt: '2026-05-01T13:00:00.000Z',
        coordinate: { lat: 35.4, lng: -111.4 },
        riskLevel: 'caution',
        summary: 'Exposed ridge and steep grade',
        source: source('route_analysis_engine'),
      },
    ],
    notableMoments: [
      ...active.notableMoments,
      ...Array.from({ length: 8 }, (_, index) => ({
        id: `highlight-${index + 1}`,
        capturedAt: `2026-05-01T${String(8 + index).padStart(2, '0')}:15:00.000Z`,
        type: 'manual_note',
        title: index === 0 ? 'Sunrise overlook <script>alert(1)</script>' : `Trail highlight ${index + 1}`,
        detail: index === 0 ? 'A memorable start & a privacy-safe export.' : `Recorded highlight ${index + 1}`,
        coordinate: index < 4 ? { lat: 35.1 + index * 0.1, lng: -111.1 - index * 0.1 } : null,
        source: source('expedition_live_log', 'manual'),
      })),
    ],
    deviations: [
      {
        id: 'deviation-1',
        capturedAt: '2026-05-01T14:10:00.000Z',
        distanceMeters: 180,
        coordinate: { lat: 35.55, lng: -111.55 },
        statusLabel: 'Returned to route',
        source: source('navigate_guidance'),
      },
    ],
    recoveryPanelUsed: [
      {
        usedAt: '2026-05-01T14:30:00.000Z',
        context: 'Tire pressure check after rough section',
        source: source('incident_recovery', 'manual'),
      },
    ],
    campCandidatesViewed: [
      {
        id: 'camp-view-1',
        viewedAt: '2026-05-01T15:00:00.000Z',
        title: 'North Rim backup camp',
        coordinate: { lat: 35.7, lng: -111.7 },
        source: source('campops', 'cached'),
      },
    ],
    resupplyStopsViewed: [
      {
        id: 'resupply-view-1',
        viewedAt: '2026-05-01T09:00:00.000Z',
        title: 'Last fuel stop',
        coordinate: { lat: 35.2, lng: -111.2 },
        source: source('trip_builder', 'manual'),
      },
    ],
  };
  const completed = finalizeCompletedTrip(storyActive, {
    completedAt: '2026-05-01T17:30:00.000Z',
    totalDistanceMiles: 62.4,
    totalDurationSeconds: 10.5 * 3600,
    endCoordinate: { lat: 35.8, lng: -111.8, elevationFt: 6100 },
  });
  await expeditionTripRecordStore.save(completed);
  await evaluateBadgesForCompletedTrip('report-trip-1');

  const [report, concurrentReport] = await Promise.all([
    generateExpeditionReport('report-trip-1'),
    generateExpeditionReport('report-trip-1'),
  ]);
  assert(report, 'A completed trip should generate a report.');
  assert(concurrentReport && concurrentReport.id === report.id, 'Equivalent concurrent report requests should share one result.');
  assert.strictEqual(printCallCount, 1, 'Equivalent concurrent report requests should invoke the print pipeline once.');
  assert.strictEqual(report.tripId, 'report-trip-1');
  assert.strictEqual(report.title, 'Black Mesa Loop');
  assert.strictEqual(report.privacyMode, 'redacted', 'Shareable reports should redact exact route context by default.');
  assert.strictEqual(report.routeBounds, null, 'Shareable report metadata should omit exact route bounds.');
  assert(
    report.notableMoments.every((moment) => moment.coordinate == null),
    'Shareable report moments should omit exact coordinates.',
  );
  assert.strictEqual(report.totalDistanceMiles, 62.4);
  assert.strictEqual(report.exportFormat, 'pdf');
  assert(report.localUri && report.localUri.endsWith('.pdf'), 'Report should use persisted PDF URI when print/file APIs work.');
  assert(report.recapSummary && report.recapSummary.length > 0, 'Report should include the deterministic recap summary.');
  assert(report.badgesEarned.some((badge) => badge.id === 'first-expedition'), 'Report should include badges earned on this trip only.');
  assert(report.story, 'Report should persist a deterministic journey-story presentation.');
  assert.strictEqual(report.story.route.source, 'recorded', 'Recorded GPS geometry should remain distinct from planned fallback.');
  assert(report.story.route.points.length >= 2, 'Route story should include a drawable normalized route.');
  assert(
    report.story.route.points.every((point) => !('lat' in point) && !('lng' in point)),
    'Redacted report route points must not retain exact coordinates.',
  );
  assert(report.story.timeline.length > 6, 'The report must not silently truncate the expedition story to six moments.');
  for (const category of ['achievement', 'weather', 'terrain', 'convoy', 'mechanical', 'recovery', 'camp', 'supply']) {
    assert(
      report.story.timeline.some((event) => event.category === category),
      `The journey story should include recorded ${category} evidence.`,
    );
  }
  assert(
    report.story.sections.some((section) => section.id === 'weather' && section.status !== 'unavailable'),
    'Recorded weather should produce a grounded story section.',
  );
  assert(
    report.story.sections.some((section) => section.id === 'convoy' && section.status !== 'unavailable'),
    'Expedition-linked convoy history should produce a grounded story section.',
  );

  const htmlUri = Array.from(writtenFiles.keys()).find((uri) => uri.endsWith('.html'));
  assert(htmlUri, 'HTML fallback report should be persisted before PDF generation.');
  const html = writtenFiles.get(htmlUri);
  assert(html.includes('Route Story'), 'Report HTML should render the privacy-safe route story.');
  assert(html.includes('<svg'), 'Report HTML should embed a deterministic offline route graphic.');
  assert(html.includes('Wind increased on the ridge'), 'Weather evidence should appear in the exported story.');
  assert(html.includes('Exposed ridge and steep grade'), 'Terrain risk evidence should appear in the exported story.');
  assert(html.includes('Tire pressure check after rough section'), 'Recovery/breakdown context should appear in the exported story.');
  assert(html.includes('Cooling-system check'), 'Expedition-linked mechanical history should appear in the exported story.');
  assert(html.includes('Convoy check-in'), 'Expedition-linked convoy history should appear in the exported story.');
  assert(html.includes('[redacted email]'), 'Tracked-event text should redact email identities before report presentation.');
  assert(!html.includes('private-member-id') && !html.includes('private-actor'), 'Dispatch identities must not leak into the report.');
  assert(!html.includes('Other expedition') && !html.includes('Must not leak'), 'Cross-expedition history must be excluded.');
  assert(html.includes('Sunrise overlook &lt;script&gt;alert(1)&lt;/script&gt;'), 'User-authored story text must be HTML escaped.');
  assert(!html.includes('Sunrise overlook <script>'), 'Unescaped user-authored markup must never enter the report.');
  assert(!html.includes('35.4') && !html.includes('-111.4'), 'Redacted export HTML must not expose exact fixture coordinates.');
  if (htmlOutputPath) {
    fs.mkdirSync(path.dirname(htmlOutputPath), { recursive: true });
    fs.writeFileSync(htmlOutputPath, html, 'utf8');
  }

  const stored = await getReportForTrip('report-trip-1');
  assert(stored && stored.id === report.id, 'Generated report metadata should persist locally.');
  assert(
    stored.story && stored.story.timeline.some((event) => event.title === 'Convoy check-in'),
    'Persisted report hydration should retain the normalized journey story.',
  );
  assert.strictEqual((await getAllExpeditionReports()).length, 1, 'All report retrieval should list generated reports.');
  assert.strictEqual((await getReportsForTrip('report-trip-1'))[0].id, report.id, 'Trip report list should include generated report.');
  assert.strictEqual((await getMostRecentReports(1))[0].id, report.id, 'Most recent report retrieval should be newest-first and limited.');

  const shareResult = await shareExpeditionReport(report.id);
  assert.strictEqual(shareResult.ok, true, 'Share should succeed when platform sharing is available.');
  assert.strictEqual(sharedUri, report.localUri, 'Share should use the generated local report URI.');

  sharingAvailable = false;
  sharedUri = null;
  const downloadResult = await downloadExpeditionReport(report.id);
  assert.strictEqual(downloadResult.ok, true, 'Download should succeed from the local report even when platform sharing is unavailable.');
  assert.strictEqual(sharedUri, null, 'Download should not require the unavailable native share sheet.');
  assert(downloadedHref && downloadedHref.startsWith('data:application/pdf;base64,'), 'PDF report download should use a browser-safe data URL.');
  assert(downloadedName && downloadedName.endsWith('.pdf'), 'PDF report download should preserve the report file extension.');

  const regenerated = await regenerateExpeditionReport('report-trip-1');
  assert(regenerated && regenerated.id === report.id, 'Regeneration should keep one deterministic report identity per trip.');
  assert.strictEqual(
    regenerated.sourceFingerprint,
    report.sourceFingerprint,
    'Unchanged trip inputs should regenerate the same source fingerprint.',
  );
  assert.strictEqual((await getReportForTrip('report-trip-1')).id, regenerated.id);

  const sourceLimitedStory = buildExpeditionReportStory({
    trip: {
      ...completed,
      id: 'planned-only-report-trip',
      expeditionId: null,
      userId: null,
      routeGeometry: [],
      plannedRouteGeometry: [
        { lat: 36.1, lng: -112.1 },
        { lat: 36.2, lng: -112.2 },
      ],
      weatherSnapshots: [],
      terrainRiskSnapshots: [],
      notableMoments: [],
      deviations: [],
      bailoutPointsUsed: [],
      campCandidatesViewed: [],
      resupplyStopsViewed: [],
      recoveryPanelUsed: [],
      recap: null,
    },
    badgesEarned: [],
    trackedEvents: [],
  });
  assert.strictEqual(sourceLimitedStory.route.source, 'planned', 'Planned geometry must remain an explicitly unconfirmed fallback.');
  assert(
    sourceLimitedStory.route.sourceDetail.includes('does not represent confirmed travel'),
    'Planned fallback wording must not claim recorded travel.',
  );
  for (const sectionId of ['weather', 'terrain', 'convoy', 'field_log', 'achievements']) {
    assert(
      sourceLimitedStory.sections.some((section) => section.id === sectionId && section.status === 'unavailable'),
      `Missing ${sectionId} history should remain explicitly unavailable.`,
    );
  }

  assert.strictEqual(await deleteExpeditionReport(regenerated.id), true, 'Deleting a report should remove persisted metadata.');
  assert.strictEqual(await getReportForTrip('report-trip-1'), null, 'Deleted report should no longer be returned.');
  assert.strictEqual(await generateExpeditionReport('missing-trip'), null, 'Missing trips should fail gracefully.');

  const persistedKeys = Array.from(memoryStorage.keys()).join('\n');
  assert(persistedKeys.includes('ecs_expedition_reports'), 'Reports should use offline local persisted storage.');

  console.log('Expedition report export checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
