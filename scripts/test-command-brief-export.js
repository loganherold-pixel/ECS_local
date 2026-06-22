const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

const printCalls = [];
let clipboardText = null;
const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
  }
  if (request === 'expo-print') {
    return {
      printToFileAsync: async (options) => {
        printCalls.push(options);
        return {
          uri: 'file:///tmp/ecs-command-brief-test.pdf',
          base64: Buffer.from('%PDF-1.4 command brief test').toString('base64'),
        };
      },
    };
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
      setStringAsync: async (value) => {
        clipboardText = value;
      },
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
const briefExportSource = fs.readFileSync(path.join(root, 'lib', 'brief', 'commandBriefExport.ts'), 'utf8');

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

assert.strictEqual(packet.format, 'pdf');
assert.strictEqual(packet.mimeType, 'application/pdf');
assert.ok(packet.filename.endsWith('.pdf'), 'Packet should save/share as PDF.');
assert.strictEqual(
  packet.filename,
  'ECS_Command_Brief_Canyon_Rim_Overnight_Route_2026-05-13_1900.pdf',
  'PDF filename should use the ECS command brief filename convention.',
);
assert.ok(packet.data, 'Packet should expose the normalized ECSCommandBriefPacket data object.');
assert.strictEqual(packet.data.packetMetadata.source, 'active_guidance');
assert.strictEqual(packet.data.packetMetadata.packetStatus, 'active');
assert.strictEqual(packet.data.routeGuidanceSummary.routeId, 'route-overnight-dispersed');
assert.strictEqual(packet.data.routeGuidanceSummary.routeName, 'Canyon Rim Overnight Route');
assert.strictEqual(packet.data.routeGuidanceSummary.guidanceReady, null);
assert.strictEqual(packet.data.packetMetadata.packetLabel, 'Active Guidance Packet');
assert.ok(packet.html.includes('ECS Command Brief Packet'), 'Packet should include a PDF HTML title.');
assert.ok(packet.html.includes('Active Guidance Packet'), 'PDF should label active guidance packets.');
assert.ok(packet.html.includes('ecs-watermark'), 'PDF layout should include a subtle ECS watermark.');
assert.ok(packet.html.includes('Page '), 'PDF layout should include page number CSS.');
assert.ok(packet.html.includes('Readiness'), 'PDF layout should include section headers.');
assert.ok(packet.html.includes('Weather / Environment'), 'PDF layout should include weather/environment.');
assert.ok(packet.html.includes('Emergency Contacts / Check-ins'), 'PDF layout should include emergency contacts/check-ins.');
assert.ok(packet.html.includes('For Emergency Contacts'), 'PDF should include a plain-language emergency contact section.');
assert.ok(packet.body.includes('# ECS Command Brief Packet'), 'Packet should include a title.');
assert.ok(packet.body.includes('Generated: 2026-05-13T19:00:00.000Z'), 'Packet should include generated timestamp.');
assert.ok(packet.body.includes('PDF file:'), 'Copy packet should identify the PDF artifact name.');
assert.ok(packet.body.includes('## Trip / Route'), 'Copy packet should include trip/route section.');
assert.ok(packet.body.includes('## Readiness'), 'Copy packet should include readiness section.');
assert.ok(packet.body.includes('## Planned Times'), 'Copy packet should include planned times section.');
assert.ok(packet.body.includes('## Coordinates'), 'Copy packet should include coordinates section.');
assert.ok(packet.body.includes('## Vehicle'), 'Copy packet should include vehicle section.');
assert.ok(packet.body.includes('## Check-ins'), 'Copy packet should include check-in section.');
assert.ok(packet.body.includes('## Top Blockers / Warnings'), 'Copy packet should include blocker/warning section.');
assert.ok(packet.body.includes('## Emergency Note'), 'Copy packet should include emergency note section.');
assert.ok(!packet.body.includes('"packetMetadata"'), 'Copy packet should not include raw JSON keys.');
assert.ok(!packet.body.includes('## What Breaks First?'), 'Copy packet should not include the full brochure weak-point section.');
assert.ok(!packet.body.includes('## Readiness Sections'), 'Copy packet should not include full readiness detail sections.');
assert.ok(!packet.body.includes('Scoring trace:'), 'Copy packet should not dump scoring traces.');
const readinessSection = sectionBetween(packet.body, '## Readiness', '## Planned Times');
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
const routeSection = sectionBetween(packet.body, '## Trip / Route', '## Readiness');
assert.ok(/Route ID:/i.test(routeSection), 'Emergency packet should include route ID when available.');
assert.ok(routeSection.includes('route-overnight-dispersed'), 'Route summary should include the active route ID for emergency reference.');
assert.ok(packet.body.includes('confidence-based'), 'Packet should include confidence disclaimer.');
assert.ok(packet.body.includes('Verify official closures'), 'Packet should tell users to verify official sources.');
assert.ok(packet.body.includes('not a distress signal'), 'Packet should state it is not a distress signal.');
assert.ok(packet.body.includes('not automatically sent to emergency services'), 'Packet should state it is not sent to emergency services.');
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
  unavailablePacket.html.includes('Not available') || unavailablePacket.html.includes('Not provided'),
  'PDF layout should degrade missing values as not available / not provided.',
);
assert.ok(
  !/feature-flagged|feature flagged|not enabled/i.test(unavailablePacket.body),
  'Unavailable packet should not describe Weak Point Analyzer as feature-gated.',
);

assert.ok(commandBriefSource.includes('Share Packet'), 'Command Brief should render share packet controls.');
assert.ok(commandBriefSource.includes('exportCommandBriefPacket'), 'Command Brief should call the export packet helper.');
assert.ok(commandBriefSource.includes('unavailableReason'), 'Command Brief should surface export failure reasons.');
assert.ok(commandBriefSource.includes('PDF Command Brief packet'), 'Share Packet UI should describe PDF output.');
assert.ok(briefExportSource.includes('ECS/CommandBriefPackets/'), 'Save locally should target a durable ECS packet directory.');
assert.ok(briefExportSource.includes('generateCommandBriefPdf(packet)'), 'Share/save should use the shared PDF generator.');
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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function withInputPatch(base, patch) {
  return {
    ...clone(base),
    ...patch,
    route: Object.prototype.hasOwnProperty.call(patch, 'route')
      ? patch.route
      : patch.routePatch
        ? { ...(clone(base).route ?? {}), ...patch.routePatch }
        : clone(base).route,
    weather: Object.prototype.hasOwnProperty.call(patch, 'weather')
      ? patch.weather
      : patch.weatherPatch
        ? { ...(clone(base).weather ?? {}), ...patch.weatherPatch }
        : clone(base).weather,
    offline: Object.prototype.hasOwnProperty.call(patch, 'offline')
      ? patch.offline
      : patch.offlinePatch
        ? { ...(clone(base).offline ?? {}), ...patch.offlinePatch }
        : clone(base).offline,
    activeVehicle: Object.prototype.hasOwnProperty.call(patch, 'activeVehicle')
      ? patch.activeVehicle
      : patch.vehiclePatch
        ? { ...(clone(base).activeVehicle ?? {}), ...patch.vehiclePatch }
        : clone(base).activeVehicle,
    recovery: Object.prototype.hasOwnProperty.call(patch, 'recovery')
      ? patch.recovery
      : patch.recoveryPatch
        ? { ...(clone(base).recovery ?? {}), ...patch.recoveryPatch }
        : clone(base).recovery,
  };
}

function buildPacketForFixture(input, context = {}, generatedAt = '2026-05-14T16:30:00.000Z') {
  const assessmentForFixture = readiness.buildExpeditionReadiness(input);
  return brief.buildCommandBriefPacket({
    assessment: assessmentForFixture,
    activeVehicle: input.activeVehicle ?? null,
    weakPointAssessment: null,
    ...context,
  }, { generatedAt });
}

const mendocinoActivePacket = buildPacketForFixture(
  withInputPatch(readiness.holdReadinessFixture, {
    routePatch: {
      routeId: 'route-mendocino-usfs-7n42',
      name: 'Mendocino NF Hull Mountain Connector',
      distanceMiles: 31.4,
      endpointCoordinate: { latitude: 39.4581, longitude: -122.9482, label: 'Hull Mountain endpoint' },
      waypointCoordinates: [{ latitude: 39.3922, longitude: -123.0682, label: 'Trailhead staging' }],
      knownHazards: ['Non-repairable flat tire scenario note: no full-size spare confirmed.'],
    },
    recoveryPatch: {
      currentCoordinatesAvailable: true,
      currentLatitude: 39.4021,
      currentLongitude: -123.0114,
      currentAccuracyMeters: 11,
    },
    vehiclePatch: {
      label: 'Tacoma Trail Build',
      recoveryGearSummary: 'Plug kit present; full-size spare not confirmed.',
    },
  }),
  {
    packetSource: 'active_guidance',
    routeName: 'Mendocino NF Hull Mountain Connector',
    activeRouteId: 'route-mendocino-usfs-7n42',
    routeGeometryStatus: 'full_geometry',
    guidanceReady: true,
    startPoint: { label: 'Trailhead staging', latitude: 39.3922, longitude: -123.0682, source: 'active_guidance' },
    destinationPoint: { label: 'Hull Mountain endpoint', latitude: 39.4581, longitude: -122.9482, source: 'active_guidance' },
    routeOverviewImageUri: 'file:///tmp/mendocino-route-overview.png',
    routePolylineSnapshot: '39.39220,-123.06820 -> 39.45810,-122.94820',
    currentProgressPercent: 42,
    remainingDistance: '18.2 mi remaining',
    remainingDuration: '1 hr 35 min remaining',
    etaIso: '2026-05-14T19:05:00.000Z',
    routeDataRefreshedAt: '2026-05-14T16:12:00.000Z',
    offlinePacketRefreshedAt: '2026-05-14T15:55:00.000Z',
    vehicleTelemetryRefreshedAt: '2026-05-14T16:18:00.000Z',
    checkInExpectations: 'Text trusted contact at trail entry and every 90 minutes.',
    overdueInstructions: 'If overdue by 2 hours, call the driver first, then contact the county sheriff with this packet.',
    familyNotes: 'Non-repairable flat tire scenario note: vehicle may need recovery tow from the trail.',
  },
);
assert.strictEqual(mendocinoActivePacket.data.packetMetadata.packetLabel, 'Active Guidance Packet');
assert.strictEqual(mendocinoActivePacket.data.routeGuidanceSummary.routeId, 'route-mendocino-usfs-7n42');
assert.strictEqual(mendocinoActivePacket.data.routeGuidanceSummary.currentProgressPercent, 42);
assert.strictEqual(mendocinoActivePacket.data.routeGuidanceSummary.remainingDistance, '18.2 mi remaining');
assert.strictEqual(mendocinoActivePacket.data.routeGuidanceSummary.etaIso, '2026-05-14T19:05:00.000Z');
assert.strictEqual(mendocinoActivePacket.data.routeGuidanceSummary.geometryStatus, 'full_geometry');
assert.strictEqual(mendocinoActivePacket.data.coordinatesSection.currentGps.accuracyMeters, 11);
assert.ok(mendocinoActivePacket.html.includes('HOLD'), 'HOLD decision should be prominent in the PDF.');
assert.ok(mendocinoActivePacket.html.includes('Hold reason'), 'HOLD reason should appear near the top of the PDF.');
assert.ok(mendocinoActivePacket.html.includes('Non-repairable flat tire scenario note'), 'Scenario risk note should carry into the packet.');
assert.ok(mendocinoActivePacket.html.includes('file:///tmp/mendocino-route-overview.png'), 'Route map snapshot should be included when available.');
assert.ok(mendocinoActivePacket.html.includes('Route data refreshed'), 'Route freshness should be rendered.');
assert.ok(mendocinoActivePacket.html.includes('Vehicle telemetry refreshed'), 'Vehicle telemetry freshness should be rendered.');
assert.ok(mendocinoActivePacket.html.includes('For Emergency Contacts'), 'Emergency contact section should be rendered.');

const plannedTripPacket = buildPacketForFixture(
  readiness.completeReadyReadinessFixture,
  {
    packetSource: 'planned_trip',
    routeName: 'White Rim Loop Segment Plan',
    activeRouteId: 'route-white-rim-loop',
    routeGeometryStatus: 'planned_geometry',
    guidanceReady: false,
  },
);
assert.strictEqual(plannedTripPacket.data.packetMetadata.packetLabel, 'Planned Trip Packet');
assert.ok(plannedTripPacket.html.includes('Planned Trip Packet'), 'PDF should label planned-trip fallback packets.');
assert.ok(!plannedTripPacket.html.includes('Active Guidance Packet'), 'Planned trip packet should not be mislabeled as active guidance.');

const convoyPacket = buildPacketForFixture(
  readiness.completeReadyReadinessFixture,
  {
    packetSource: 'convoy',
    routeName: 'Sierra Convoy Traverse',
    activeRouteId: 'route-sierra-convoy',
    convoyName: 'Sierra Saturday Convoy',
    convoyMemberCount: 4,
    plannedRegroupPoints: ['Fuel stop in Willits', 'Trailhead staging lot', 'South ridge pullout'],
    checkInSchedule: 'Regroup every 60 minutes or at named pullouts.',
    checkInStatus: 'One member stale; last accepted check-in 42m ago.',
  },
);
assert.strictEqual(convoyPacket.data.convoySection.memberCount, 4);
assert.ok(convoyPacket.html.includes('Sierra Saturday Convoy'), 'Convoy name should render.');
assert.ok(convoyPacket.html.includes('Trailhead staging lot'), 'Convoy regroup points should render.');
assert.ok(!convoyPacket.html.includes('memberUserId'), 'Convoy packet should not expose member personal identifiers.');

const trailheadOnlyPacket = buildPacketForFixture(
  readiness.completeReadyReadinessFixture,
  {
    packetSource: 'planned_trip',
    routeName: 'Trailhead Only Route',
    activeRouteId: 'route-trailhead-only',
    routeGeometryStatus: 'trailhead_only',
    guidanceReady: false,
    startPoint: { label: 'Known trailhead', latitude: 39.1, longitude: -123.1 },
    destinationPoint: null,
  },
);
assert.ok(trailheadOnlyPacket.html.includes('trailhead_only'), 'Trailhead-only geometry status should be honest.');
assert.ok(trailheadOnlyPacket.html.includes('Map snapshot not available'), 'Missing map snapshot should not fail PDF fallback.');

const missingWeatherPacket = buildPacketForFixture(
  withInputPatch(readiness.completeReadyReadinessFixture, { weather: null }),
  { routeName: 'Missing Weather Route', activeRouteId: 'route-missing-weather' },
);
assert.ok(missingWeatherPacket.html.includes('Weather data is unavailable'), 'Missing weather should be labeled in PDF.');

const staleWeatherPacket = buildPacketForFixture(
  readiness.staleWeatherReadinessFixture,
  { routeName: 'Stale Weather Route', activeRouteId: 'route-stale-weather' },
);
assert.ok(/stale/i.test(staleWeatherPacket.html), 'Stale weather should be labeled in PDF.');

const missingVehiclePacket = buildPacketForFixture(
  readiness.noActiveVehicleReadinessFixture,
  { routeName: 'Missing Vehicle Route', activeRouteId: 'route-missing-vehicle', activeVehicle: null },
);
assert.ok(missingVehiclePacket.html.includes('Not available'), 'Missing vehicle profile should degrade gracefully.');

const cautionPacket = buildPacketForFixture(
  readiness.partialReadinessFixture,
  { routeName: 'Caution Route', activeRouteId: 'route-caution' },
);
assert.ok(['CAUTION', 'HOLD', 'UNKNOWN'].includes(cautionPacket.data.readinessSummary.decision), 'Partial fixture should produce a non-GO readiness posture.');
assert.ok(cautionPacket.html.includes('Caution factors') || cautionPacket.html.includes('Top warnings'), 'Caution/warning factors should be visible near the top.');

const goPacket = buildPacketForFixture(
  readiness.completeReadyReadinessFixture,
  { routeName: 'GO Route', activeRouteId: 'route-go' },
);
assert.strictEqual(goPacket.data.readinessSummary.decision, 'GO');
assert.ok(goPacket.html.includes('Data Freshness'), 'GO packet should still include freshness and limitations.');

async function runSaveChecks() {
  const copyResult = await brief.copyCommandBriefPacketToClipboard(packet);
  assert.strictEqual(copyResult.ok, true, 'Copy should succeed with clipboard available.');
  assert.strictEqual(copyResult.message, 'Command Brief packet summary copied.', 'Copy should confirm summary copy.');
  assert.strictEqual(clipboardText, packet.copyBody, 'Copy should place the clean markdown summary on the clipboard.');

  const artifact = await brief.generateCommandBriefPdf(packet);
  assert.strictEqual(artifact.fileUri, 'file:///tmp/ecs-command-brief-test.pdf', 'PDF generator should return the rendered file URI.');
  assert.strictEqual(artifact.filename, packet.filename, 'PDF generator should return the packet filename.');
  assert.strictEqual(artifact.createdAt, packet.generatedAt, 'PDF generator should return packet creation time.');
  assert.strictEqual(artifact.packetId, packet.data.packetMetadata.packetId, 'PDF generator should return packet ID.');
  assert.ok(artifact.byteSize > 0, 'PDF generator should return byte size when base64 bytes are available.');
  assert.strictEqual(artifact.mimeType, 'application/pdf', 'PDF generator should return PDF MIME type.');

  printCalls.length = 0;
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
    assert.strictEqual(options.type, 'application/pdf', 'Save should download a PDF blob.');
  };
  global.URL = {
    createObjectURL: () => 'blob:command-brief-test',
    revokeObjectURL: (url) => {
      revokedUrl = url;
    },
  };

  const saveResult = await brief.saveCommandBriefPacket(packet);
  assert.strictEqual(printCalls.length, 1, 'Save should render a PDF through expo-print.');
  assert.strictEqual(printCalls[0].base64, true, 'PDF render should request base64 bytes for reliable save/download.');
  assert.ok(printCalls[0].html.includes('ECS Command Brief Packet'), 'PDF render should use the packet HTML layout.');
  assert.strictEqual(saveResult.ok, true, 'Save should succeed only after triggering a real web download.');
  assert.strictEqual(downloadedFilename, packet.filename, 'Save should use the packet filename for download.');
  assert.strictEqual(clicked, true, 'Save should click the generated download anchor.');
  assert.ok(saveResult.message.includes(packet.filename), 'Save message should include the saved filename.');
  assert.strictEqual(saveResult.savedLocation, packet.filename, 'Save result should not invent a local file path on web.');
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
