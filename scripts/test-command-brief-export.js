const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
  }
  if (request === 'expo-file-system' || request === 'expo-file-system/legacy') {
    return {};
  }
  if (request === 'expo-sharing') {
    return {
      isAvailableAsync: async () => false,
      shareAsync: async () => undefined,
    };
  }
  if (request === 'expo-modules-core') {
    return {};
  }
  if (request === 'expo-clipboard') {
    return {
      setStringAsync: async () => undefined,
    };
  }
  return originalLoad.call(this, request, parent, isMain);
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

const readiness = {
  ...require(path.join(root, 'lib', 'readiness', 'expeditionReadinessScoring.ts')),
  ...require(path.join(root, 'lib', 'readiness', 'expeditionReadinessFixtures.ts')),
};
const weakPoint = require(path.join(root, 'lib', 'readiness', 'expeditionWeakPointAnalyzer.ts'));
const brief = require(path.join(root, 'lib', 'brief'));
const packageSource = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
const commandBriefSource = fs.readFileSync(path.join(root, 'components', 'brief', 'CommandBriefScreen.tsx'), 'utf8');

function sectionBetween(source, startHeading, endHeading) {
  const start = source.indexOf(startHeading);
  assert.notStrictEqual(start, -1, `Packet should include ${startHeading}.`);
  const end = source.indexOf(endHeading, start + startHeading.length);
  assert.notStrictEqual(end, -1, `Packet should include ${endHeading} after ${startHeading}.`);
  return source.slice(start, end);
}

const assessment = readiness.buildExpeditionReadiness(readiness.overnightDispersedCampingFixture);
const weakPointAssessment = weakPoint.scoreExpeditionWeakPoints({
  snapshotId: 'command-brief-export-weak-point',
  capturedAt: '2026-05-13T19:00:00.000Z',
  routeConfidence: { confidence: 'high', sourceFactIds: ['route-confidence'], updatedAt: '2026-05-13T18:45:00.000Z' },
  fuelMargin: { reserveMiles: 80, sourceFactIds: ['fuel-margin'], updatedAt: '2026-05-13T18:45:00.000Z' },
  waterMargin: { daysRemaining: 2, requiredDays: 1, sourceFactIds: ['water-margin'], updatedAt: '2026-05-13T18:45:00.000Z' },
  powerMargin: { runtimeHoursRemaining: 18, requiredRuntimeHours: 8, sourceFactIds: ['power-margin'], updatedAt: '2026-05-13T18:45:00.000Z' },
  payloadGvwr: { gvwrUsagePct: 74, sourceFactIds: ['payload-margin'], updatedAt: '2026-05-13T18:45:00.000Z' },
  campEndpointConfidence: {
    endpointId: 'camp-a',
    legalAccessConfidence: 'low',
    accessConfidence: 'low',
    etaCreatesLateArrivalRisk: true,
    sourceFactIds: ['camp-access'],
    updatedAt: '2026-05-13T18:45:00.000Z',
  },
  offlineReadiness: { packageStatus: 'ready', routeMatched: true, coverage: 'complete', freshness: 'fresh', sourceFactIds: ['offline-package'], updatedAt: '2026-05-13T18:45:00.000Z' },
  weatherFreshness: { riskLevel: 'low', freshness: 'fresh', sourceFactIds: ['weather'], updatedAt: '2026-05-13T18:45:00.000Z' },
  daylight: { minutesRemainingAtArrival: 45, sourceFactIds: ['daylight'], updatedAt: '2026-05-13T18:45:00.000Z' },
  recoveryBailoutAccess: { bailoutRoutesAvailable: true, routeBailoutOptionCount: 2, sourceFactIds: ['recovery'], updatedAt: '2026-05-13T18:45:00.000Z' },
  convoyState: { rosterReady: true, communicationsReady: true, membersAccountedFor: true, sourceFactIds: ['convoy'], updatedAt: '2026-05-13T18:45:00.000Z' },
  sourceFacts: [
    { id: 'camp-access', label: 'Camp endpoint confidence', value: 'low legal/access confidence', updatedAt: '2026-05-13T18:45:00.000Z' },
  ],
});
const packet = brief.buildCommandBriefPacket({
  assessment,
  routeName: 'Canyon Rim Overnight Route',
  routeSummary: '54 mi planning route / staged from Navigate',
  activeVehicle: readiness.overnightDispersedCampingFixture.activeVehicle,
  activeRouteId: 'route-overnight-dispersed',
  activeTripId: 'trip-command-brief-test',
  weakPointAssessment,
}, { generatedAt: '2026-05-13T19:00:00.000Z' });

assert.strictEqual(packet.format, 'markdown');
assert.strictEqual(packet.mimeType, 'text/markdown');
assert.ok(packet.filename.endsWith('.md'), 'Packet should save as markdown.');
assert.ok(packet.body.includes('# ECS Command Brief Packet'), 'Packet should include a title.');
assert.ok(packet.body.includes('Generated: 2026-05-13T19:00:00.000Z'), 'Packet should include generated timestamp.');
assert.ok(packet.body.includes('## Readiness Decision'), 'Packet should include readiness decision.');
const readinessSection = sectionBetween(packet.body, '## Readiness Decision', '## Trip Intent');
assert.ok(
  readinessSection.includes('The score is a readiness posture, not a confidence grade.'),
  'Readiness decision should explain the difference between readiness score and confidence.',
);
assert.ok(
  /Confidence is (strong|moderate|limited) because/i.test(readinessSection),
  'Readiness decision should explain why confidence is strong, moderate, or limited.',
);
assert.ok(
  !/confidence low/i.test(readinessSection),
  'Readiness decision should not present low confidence as an unexplained failure label.',
);
assert.ok(packet.body.includes('## Trip Intent'), 'Packet should include trip intent.');
assert.ok(packet.body.includes('## Active Vehicle'), 'Packet should include active vehicle section.');
assert.ok(packet.body.includes('Vehicle Capacity / Clearance Status'), 'Packet should include vehicle capacity and clearance status.');
assert.ok(packet.body.includes('## Route Summary'), 'Packet should include route summary.');
const routeSection = sectionBetween(packet.body, '## Route Summary', '## What Breaks First?');
assert.ok(!/Route ID:/i.test(routeSection), 'Route summary should not expose raw route IDs in the operator packet.');
assert.ok(!/Trip ID:/i.test(routeSection), 'Route summary should not expose raw trip IDs in the operator packet.');
assert.ok(!routeSection.includes('route-overnight-dispersed'), 'Route summary should hide serial-style route identifiers.');
assert.ok(!routeSection.includes('trip-command-brief-test'), 'Route summary should hide serial-style trip identifiers.');
assert.ok(packet.body.includes('## What Breaks First?'), 'Packet should include the Weak Point Analyzer section.');
const weakPointSection = sectionBetween(packet.body, '## What Breaks First?', '## Top Blockers');
assert.ok(weakPointSection.includes('Top likely failure points'), 'Weak Point export should lead with top likely failure points.');
const weakPointRankLines = weakPointSection.split('\n').filter((line) => /^- \d\./.test(line));
assert.ok(weakPointRankLines.length > 0, 'Weak Point export should include ranked failure points.');
assert.ok(weakPointRankLines.length <= 3, 'Weak Point export should cap the operator packet at the top three failure points.');
assert.ok(!/feature-flagged|feature flagged|not enabled/i.test(weakPointSection), 'Weak Point export should not be feature-flagged in Command Brief packets.');
assert.ok(!weakPointSection.includes('Snapshot coverage:'), 'Weak Point export should not dump raw coverage tables into the operator packet.');
assert.ok(!weakPointSection.includes('Source facts:'), 'Weak Point export should not dump raw source facts into the operator packet.');
assert.ok(!weakPointSection.includes('Scoring trace:'), 'Weak Point export should not dump raw scoring trace into the operator packet.');
assert.ok(packet.body.includes('## Top Blockers'), 'Packet should include blockers.');
assert.ok(packet.body.includes('## Top Warnings'), 'Packet should include warnings.');
assert.ok(packet.body.includes('Camp Confidence Summary'), 'Packet should include camp confidence.');
assert.ok(packet.body.includes('Weather / Daylight Summary'), 'Packet should include weather/daylight.');
const weatherSection = sectionBetween(packet.body, '### Weather / Daylight Summary', '### Offline Preparedness');
assert.ok(
  /Weather looks|Weather needs|Weather data is/i.test(weatherSection),
  'Weather summary should use field-readable narrative instead of raw score language.',
);
assert.ok(
  !/Weather Window: .*\/100, confidence/i.test(weatherSection),
  'Weather summary should not lead with raw score and confidence text.',
);
assert.ok(
  !weatherSection.includes('Weather window does not show a major blocker.'),
  'Weather summary should not use the old robotic no-major-blocker copy.',
);
assert.ok(packet.body.includes('Offline Preparedness'), 'Packet should include offline preparedness.');
assert.ok(packet.body.includes('Fuel / Power / Range Summary'), 'Packet should include fuel/power/range.');
assert.ok(packet.body.includes('Recovery / Bailout Summary'), 'Packet should include recovery/bailout.');
assert.ok(packet.body.includes('Communications / Signal Confidence'), 'Packet should include communications.');
const communicationsSection = sectionBetween(packet.body, '### Communications / Signal Confidence', '## Emergency Coordinate Packet');
assert.ok(
  /Signal|communications|check-in|offline maps/i.test(communicationsSection),
  'Communications summary should describe the practical signal/check-in implication.',
);
assert.ok(
  !communicationsSection.includes('Communications confidence is workable.'),
  'Communications summary should not use the old workable filler copy.',
);
assert.ok(packet.body.includes('## Emergency Coordinate Packet'), 'Packet should include emergency coordinate packet.');
assert.ok(packet.body.includes('## Recommended Actions'), 'Packet should include recommended actions.');
assert.ok(packet.body.includes('confidence-based'), 'Packet should include confidence disclaimer.');
assert.ok(packet.body.includes('Verify official closures'), 'Packet should tell users to verify official sources.');
assert.ok(!/legal campsite/i.test(packet.body), 'Packet must not claim legal campsite certainty.');
assert.ok(!/guaranteed safe/i.test(packet.body), 'Packet must not claim guaranteed safety.');
assert.ok(!/AI says/i.test(packet.body), 'Packet must not use generic AI wording.');

const unavailablePacket = brief.buildCommandBriefPacket({
  assessment: null,
  routeName: null,
  activeVehicle: null,
}, { generatedAt: '2026-05-13T20:00:00.000Z' });
assert.ok(
  /Unavailable \/ limited confidence/.test(unavailablePacket.body),
  'Packet should mark missing sections unavailable / limited confidence.',
);
assert.ok(
  !/feature-flagged|feature flagged|not enabled/i.test(unavailablePacket.body),
  'Unavailable packet should not describe Weak Point Analyzer as feature-gated.',
);

assert.ok(commandBriefSource.includes('Share Packet'), 'Command Brief should render share packet controls.');
assert.ok(commandBriefSource.includes('exportCommandBriefPacket'), 'Command Brief should call the export packet helper.');
assert.ok(commandBriefSource.includes('unavailableReason'), 'Command Brief should surface export failure reasons.');
assert.ok(
  commandBriefSource.includes('<WeakPointAnalyzerPanel assessment={weakPointAssessment} />'),
  'Command Brief should render Weak Point Analyzer for every packet-ready brief.',
);
assert.ok(
  !commandBriefSource.includes('weakPointAnalyzerEnabled ? <WeakPointAnalyzerPanel assessment={weakPointAssessment} /> : null'),
  'Command Brief should not hide Weak Point Analyzer behind a feature flag.',
);
assert.ok(
  packageSource.includes('"test:command-brief-export": "node ./scripts/test-command-brief-export.js"'),
  'package.json should expose the Command Brief export regression test.',
);

async function runSaveChecks() {
  let downloadedFilename = null;
  let clicked = false;
  let revokedUrl = null;
  global.document = {
    body: {
      appendChild: () => undefined,
    },
    createElement: () => ({
      style: {},
      set href(value) {
        this._href = value;
      },
      get href() {
        return this._href;
      },
      set download(value) {
        downloadedFilename = value;
      },
      get download() {
        return downloadedFilename;
      },
      click: () => {
        clicked = true;
      },
      remove: () => undefined,
    }),
  };
  global.Blob = function Blob(parts, options) {
    this.parts = parts;
    this.options = options;
  };
  global.URL = {
    createObjectURL: () => 'blob:command-brief-test',
    revokeObjectURL: (url) => {
      revokedUrl = url;
    },
  };

  const saveResult = await brief.saveCommandBriefPacket(packet);
  assert.strictEqual(saveResult.ok, true, 'Save should succeed only after triggering a real web download.');
  assert.strictEqual(downloadedFilename, packet.filename, 'Save should use the packet filename for download.');
  assert.strictEqual(clicked, true, 'Save should click the generated download anchor.');
  assert.ok(saveResult.message.includes(packet.filename), 'Save message should include the saved filename.');
  assert.ok(saveResult.savedLocation.includes('Browser downloads folder'), 'Save result should show the browser downloads location.');
  await new Promise((resolve) => setTimeout(resolve, 1050));
  assert.strictEqual(revokedUrl, 'blob:command-brief-test', 'Save should revoke the generated blob URL.');
}

runSaveChecks()
  .then(() => {
    console.log('Command Brief export packet checks passed.');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
