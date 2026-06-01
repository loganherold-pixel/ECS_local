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
const brief = require(path.join(root, 'lib', 'brief'));
const packageSource = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
const commandBriefSource = fs.readFileSync(path.join(root, 'components', 'brief', 'CommandBriefScreen.tsx'), 'utf8');

const assessment = readiness.buildExpeditionReadiness(readiness.overnightDispersedCampingFixture);
const packet = brief.buildCommandBriefPacket({
  assessment,
  routeName: 'Canyon Rim Overnight Route',
  routeSummary: '54 mi planning route / staged from Navigate',
  activeVehicle: readiness.overnightDispersedCampingFixture.activeVehicle,
  activeRouteId: 'route-overnight-dispersed',
  activeTripId: 'trip-command-brief-test',
}, { generatedAt: '2026-05-13T19:00:00.000Z' });

assert.strictEqual(packet.format, 'markdown');
assert.strictEqual(packet.mimeType, 'text/markdown');
assert.ok(packet.filename.endsWith('.md'), 'Packet should save as markdown.');
assert.ok(packet.body.includes('# ECS Command Brief Packet'), 'Packet should include a title.');
assert.ok(packet.body.includes('Generated: 2026-05-13T19:00:00.000Z'), 'Packet should include generated timestamp.');
assert.ok(packet.body.includes('## Readiness Decision'), 'Packet should include readiness decision.');
assert.ok(packet.body.includes('## Trip Intent'), 'Packet should include trip intent.');
assert.ok(packet.body.includes('## Active Vehicle'), 'Packet should include active vehicle section.');
assert.ok(packet.body.includes('Vehicle Capacity / Clearance Status'), 'Packet should include vehicle capacity and clearance status.');
assert.ok(packet.body.includes('## Route Summary'), 'Packet should include route summary.');
assert.ok(packet.body.includes('## Top Blockers'), 'Packet should include blockers.');
assert.ok(packet.body.includes('## Top Warnings'), 'Packet should include warnings.');
assert.ok(packet.body.includes('Camp Confidence Summary'), 'Packet should include camp confidence.');
assert.ok(packet.body.includes('Weather / Daylight Summary'), 'Packet should include weather/daylight.');
assert.ok(packet.body.includes('Offline Preparedness'), 'Packet should include offline preparedness.');
assert.ok(packet.body.includes('Fuel / Power / Range Summary'), 'Packet should include fuel/power/range.');
assert.ok(packet.body.includes('Recovery / Bailout Summary'), 'Packet should include recovery/bailout.');
assert.ok(packet.body.includes('Communications / Signal Confidence'), 'Packet should include communications.');
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

assert.ok(commandBriefSource.includes('Share Packet'), 'Command Brief should render share packet controls.');
assert.ok(commandBriefSource.includes('exportCommandBriefPacket'), 'Command Brief should call the export packet helper.');
assert.ok(commandBriefSource.includes('unavailableReason'), 'Command Brief should surface export failure reasons.');
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
