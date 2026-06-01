const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function compileTypeScriptModule(mod, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  mod._compile(output.outputText, filename);
}

function loadTypeScriptModule(relativePath) {
  const fullPath = path.join(root, relativePath);
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  compileTypeScriptModule(mod, fullPath);
  return mod.exports;
}

const {
  buildRemoteMapOverlay,
} = loadTypeScriptModule('lib/remote/mapOverlay.ts');

const curvedSegment = [
  [-121.2000, 38.7800],
  [-121.1900, 38.7800],
  [-121.1900, 38.7900],
];

const overlay = buildRemoteMapOverlay({
  enabled: true,
  segmentFeatures: [
    {
      coordinates: curvedSegment,
      remoteness_level: 'green',
      risk_score: 12,
    },
    {
      coordinates: [
        [-121.1900, 38.7900],
        [-121.1840, 38.7950],
      ],
      remoteness_level: 'remote',
      risk_score: 64,
    },
  ],
});

assert.strictEqual(overlay.enabled, true, 'Remote overlay should be enabled.');
assert.strictEqual(overlay.heatmapAreas.length, 2, 'Segment-backed overlay should keep one heatmap area per route segment.');
assert.strictEqual(overlay.forecastSegments.length, 2, 'Segment-backed overlay should keep one forecast band per route segment.');
assert.deepStrictEqual(
  overlay.forecastSegments[0].coordinates,
  curvedSegment,
  'Forecast band should use the exact route segment geometry instead of rechunking a separate route line.',
);
assert.strictEqual(
  overlay.heatmapAreas[0].coordinates.length,
  7,
  'Curved segment corridor should follow all route vertices instead of drawing a straight first-to-last rectangle.',
);
assert.strictEqual(overlay.forecastSegments[0].signal, 'good', 'Green/low remoteness segment should map to good signal.');
assert.strictEqual(overlay.forecastSegments[1].signal, 'weak', 'Remote/backcountry segment should map to weak signal.');

const disabled = buildRemoteMapOverlay({
  enabled: false,
  routePoints: [{ lat: 38.78, lng: -121.2 }, { lat: 38.79, lng: -121.19 }],
});
assert.deepStrictEqual(
  disabled,
  { enabled: false, heatmapAreas: [], forecastSegments: [] },
  'Disabled remote overlay should not emit stale map features.',
);

console.log('Remote map overlay geometry checks passed.');
