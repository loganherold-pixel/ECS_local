/* global __dirname */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');

function compileTypeScriptModule(mod, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: filename,
  });
  mod._compile(output.outputText, filename);
}

function loadTypeScriptModule(relPath) {
  const fullPath = path.join(root, relPath);
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  compileTypeScriptModule(mod, fullPath);
  return mod.exports;
}

require.extensions['.ts'] = compileTypeScriptModule;
require.extensions['.tsx'] = compileTypeScriptModule;
require.extensions['.png'] = (mod, filename) => {
  mod.exports = filename;
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return {
      Platform: {
        OS: 'web',
        select(options) {
          return options.web ?? options.default;
        },
      },
    };
  }

  return originalLoad.call(this, request, parent, isMain);
};

const {
  getVehicleAttitudeBackdropSrc,
  resolveVehicleAttitudeBackdrop,
} = loadTypeScriptModule('lib/attitudeMonitorVehicleVisual.ts');

function createContext(vehicle) {
  return {
    vehicle,
    wizardConfig: vehicle?.wizard_config ?? null,
  };
}

const jeepVehicle = {
  id: 'jeep-a',
  name: 'Jeep Trail Rig',
  type: 'suv',
  make: 'Jeep',
  model: 'Wrangler',
  year: 2024,
};
const ramVehicle = {
  id: 'ram-b',
  name: 'Tow Rig',
  type: 'truck',
  make: 'Ram',
  model: '3500',
  year: 2024,
};
const unknownVehicle = {
  id: 'unknown-c',
  name: 'Shop Build',
  type: 'truck',
  make: 'Unknown',
  model: 'Trail Rig',
};

const jeepBackdrop = resolveVehicleAttitudeBackdrop(createContext(jeepVehicle));
assert.strictEqual(jeepBackdrop.attitudeVehicleId, 'jeep_wrangler');
assert.strictEqual(jeepBackdrop.backdropSrc, 'assets/vehicles/attitude/clean/Jeep_Wrangler.png');
assert.ok(String(jeepBackdrop.backdropSource).endsWith(path.join('assets', 'vehicles', 'attitude', 'clean', 'Jeep_Wrangler.png')));
assert.strictEqual(jeepBackdrop.isFallback, false);

const ramBackdrop = resolveVehicleAttitudeBackdrop(createContext(ramVehicle));
assert.strictEqual(ramBackdrop.attitudeVehicleId, 'ram_2500_3500');
assert.strictEqual(ramBackdrop.backdropSrc, 'assets/vehicles/attitude/clean/Ram_2500_3500.png');
assert.ok(String(ramBackdrop.backdropSource).endsWith(path.join('assets', 'vehicles', 'attitude', 'clean', 'Ram_2500_3500.png')));
assert.strictEqual(ramBackdrop.isFallback, false);

assert.notStrictEqual(
  jeepBackdrop.backdropSrc,
  ramBackdrop.backdropSrc,
  'Changing active vehicle context should change the resolved attitude backdrop.',
);

const missingBackdrop = resolveVehicleAttitudeBackdrop(createContext(unknownVehicle));
assert.strictEqual(missingBackdrop.attitudeVehicleId, 'generic_pickup');
assert.strictEqual(missingBackdrop.backdropSrc, 'assets/vehicles/attitude/clean/Generic_Pickup.png');
assert.strictEqual(missingBackdrop.isFallback, true);

assert.strictEqual(
  getVehicleAttitudeBackdropSrc(jeepVehicle),
  'assets/vehicles/attitude/clean/Jeep_Wrangler.png',
  'Backdrop src helper should resolve Jeep context to the Jeep attitude backdrop.',
);
assert.strictEqual(
  getVehicleAttitudeBackdropSrc(ramVehicle),
  'assets/vehicles/attitude/clean/Ram_2500_3500.png',
  'Backdrop src helper should resolve Ram context to the Ram attitude backdrop.',
);

const resolverSource = fs.readFileSync(path.join(root, 'lib', 'attitudeMonitorVehicleVisual.ts'), 'utf8');
assert.ok(resolverSource.includes('resolveVehicleAttitudeBackdrop'), 'Resolver API should exist.');
assert.ok(!resolverSource.includes("backdropSrc: 'assets/vehicles/attitude/clean/Ram_2500_3500.png'"));
assert.ok(!resolverSource.includes('FALLBACK_ATTITUDE_BACKDROP_SRC'));

console.log('Attitude Command active vehicle backdrop resolver checks passed.');
