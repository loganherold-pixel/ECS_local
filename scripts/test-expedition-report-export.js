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
const reportStoreSource = read('lib/expedition/expeditionReportStore.ts');
const hubSource = read('components/dashboard/ExpeditionTab.tsx');
const indexSource = read('lib/expedition/index.ts');

[
  'export interface ExpeditionReport',
  'tripId',
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
  'Map snapshot unavailable for this report.',
  'ECS Expedition Report',
  'Top Notable Moments',
  'Badges Earned',
  'report.exportFormat === \'pdf\'',
].forEach((snippet) => {
  assert(reportStoreSource.includes(snippet), `Report store should include ${snippet}.`);
});

for (const todo of [
  'export-ready exploded map layout',
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
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
  }
  if (request === 'expo-print') {
    return {
      printToFileAsync: async () => ({ uri: 'file:///tmp/generated-expedition-report.pdf' }),
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

async function main() {
  await expeditionTripRecordStore.clearAllForTests();
  await clearAllBadgesForTests();
  await clearAllExpeditionReportsForTests();

  const active = createNewActiveTripRecord({
    id: 'report-trip-1',
    title: 'Black Mesa Loop',
    startedAt: '2026-05-01T07:00:00.000Z',
    routeGeometry: [
      { lat: 35.1, lng: -111.1, elevationFt: 5200 },
      { lat: 35.4, lng: -111.4, elevationFt: 6800 },
      { lat: 35.8, lng: -111.8, elevationFt: 6100 },
    ],
  });
  const completed = finalizeCompletedTrip(active, {
    completedAt: '2026-05-01T17:30:00.000Z',
    totalDistanceMiles: 62.4,
    totalDurationSeconds: 10.5 * 3600,
    endCoordinate: { lat: 35.8, lng: -111.8, elevationFt: 6100 },
  });
  await expeditionTripRecordStore.save(completed);
  await evaluateBadgesForCompletedTrip('report-trip-1');

  const report = await generateExpeditionReport('report-trip-1');
  assert(report, 'A completed trip should generate a report.');
  assert.strictEqual(report.tripId, 'report-trip-1');
  assert.strictEqual(report.title, 'Black Mesa Loop');
  assert.strictEqual(report.totalDistanceMiles, 62.4);
  assert.strictEqual(report.exportFormat, 'pdf');
  assert(report.localUri && report.localUri.endsWith('.pdf'), 'Report should use persisted PDF URI when print/file APIs work.');
  assert(report.recapSummary && report.recapSummary.length > 0, 'Report should include the deterministic recap summary.');
  assert(report.badgesEarned.some((badge) => badge.id === 'first-expedition'), 'Report should include badges earned on this trip only.');

  const htmlUri = Array.from(writtenFiles.keys()).find((uri) => uri.endsWith('.html'));
  assert(htmlUri, 'HTML fallback report should be persisted before PDF generation.');
  assert(
    writtenFiles.get(htmlUri).includes('Map snapshot unavailable for this report.'),
    'Missing map snapshot should render a graceful report fallback.',
  );

  const stored = await getReportForTrip('report-trip-1');
  assert(stored && stored.id === report.id, 'Generated report metadata should persist locally.');
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
  assert(regenerated && regenerated.id !== report.id, 'Regeneration should replace the prior report metadata.');
  assert.strictEqual((await getReportForTrip('report-trip-1')).id, regenerated.id);

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
