const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const originalLoad = Module._load;
Module._load = function dispatchProfileSetupModuleLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
  }

  if (request === './fsCompat' || request.endsWith('/fsCompat')) {
    return {
      fsGetInfo: async () => ({ exists: false, isDirectory: false, size: 0 }),
      fsReadString: async () => null,
      fsWriteString: async () => undefined,
      getDocumentDirectory: async () => null,
    };
  }

  if (request === './ecsLogger' || request.endsWith('/ecsLogger')) {
    return {
      ecsLog: {
        debug: () => undefined,
        warnOnce: () => undefined,
      },
    };
  }

  return originalLoad(request, parent, isMain);
};

function loadTypeScriptModule(relPath) {
  const fullPath = path.join(process.cwd(), relPath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: fullPath,
  });
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  mod._compile(output.outputText, fullPath);
  return mod.exports;
}

require.extensions['.ts'] = function compileTypeScript(mod, filename) {
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
};

const { isDispatchProfileComplete } = loadTypeScriptModule('lib/dispatchProfileStore.ts');
const commandCenterSource = fs.readFileSync(
  path.join(process.cwd(), 'components/dispatch/DispatchCadCommandCenter.tsx'),
  'utf8',
);
const profileStoreSource = fs.readFileSync(
  path.join(process.cwd(), 'lib/dispatchProfileStore.ts'),
  'utf8',
);

assert.strictEqual(
  isDispatchProfileComplete({ displayName: null, callsign: null, vehicleLabel: null, vehicleId: null }),
  false,
  'Missing name/callsign should require Dispatch profile setup.',
);
assert.strictEqual(
  isDispatchProfileComplete({ displayName: null, callsign: 'RAVEN', vehicleLabel: null, vehicleId: null }),
  true,
  'Saved callsign alone should satisfy operator identity when no ECS vehicle is available.',
);
assert.strictEqual(
  isDispatchProfileComplete(
    { displayName: 'Logan', callsign: null, vehicleLabel: null, vehicleId: null },
    { hasAvailableVehicle: true },
  ),
  false,
  'Saved name alone should still require vehicle information when ECS vehicle context is available.',
);
assert.strictEqual(
  isDispatchProfileComplete(
    { displayName: null, callsign: null, vehicleLabel: 'Tacoma Trail Build', vehicleId: null },
    { hasAvailableVehicle: true },
  ),
  false,
  'Saved vehicle alone should still require a name or callsign.',
);
assert.strictEqual(
  isDispatchProfileComplete({ displayName: '  ', callsign: '  ', vehicleLabel: '  ', vehicleId: null }),
  false,
  'Whitespace-only profile fields should be treated as incomplete.',
);
assert.strictEqual(
  isDispatchProfileComplete(
    { displayName: 'Logan', callsign: null, vehicleLabel: 'Tacoma Trail Build', vehicleId: null },
    { hasAvailableVehicle: true },
  ),
  true,
  'Saved name and vehicle should satisfy Dispatch profile setup.',
);
assert.strictEqual(
  isDispatchProfileComplete(
    { displayName: null, callsign: null, vehicleLabel: null, vehicleId: null },
    { activeDisplayName: 'Logan', activeVehicleLabel: 'Tacoma Trail Build', hasAvailableVehicle: true },
  ),
  true,
  'Existing ECS operator and selected vehicle should satisfy Dispatch without interrupting existing users.',
);
assert.strictEqual(
  isDispatchProfileComplete(
    { displayName: null, callsign: null, vehicleLabel: null, vehicleId: null },
    { activeDisplayName: 'Logan', hasAvailableVehicle: false },
  ),
  true,
  'Existing ECS operator should satisfy Dispatch when no ECS vehicle is available.',
);

for (const requiredSource of [
  'dispatchProfileStore.waitForHydration()',
  'const forceProfileSetup = dispatchProfileHydrated && !isDispatchProfileComplete(',
  'dispatchProfileCompletenessContext',
  'const profilePanelVisible = profileVisible || forceProfileSetup;',
  'vehicleRequired={hasAvailableVehicle}',
  'requiredSetupMode={forceProfileSetup}',
  'showCloseButton={!requiredSetupMode}',
  'Vehicle / Rig',
  'Name or callsign and vehicle information are required before Dispatch can open.',
  'Name or callsign is required before Dispatch can open.',
  'Vehicle information is required before Dispatch can open.',
]) {
  assert.strictEqual(
    commandCenterSource.includes(requiredSource),
    true,
    `Dispatch profile setup source should include: ${requiredSource}`,
  );
}

assert.strictEqual(
  profileStoreSource.includes('cache.set(PROFILE_KEY, JSON.stringify(next));'),
  true,
  'Dispatch profile saves should persist through the existing ECS key-value cache.',
);

assert.strictEqual(
  commandCenterSource.includes('{!requiredSetupMode ? (') &&
    commandCenterSource.includes('Cancel Dispatch Profile'),
  true,
  'Cancel control should only render outside required setup mode.',
);
assert.strictEqual(
  commandCenterSource.includes('dispatchProfile.vehicleLabel?.trim() || null') &&
    commandCenterSource.includes('const rigLabel = activeRigLabel ?? savedRigLabel'),
  true,
  'Dispatch identity should use saved vehicle information when no active Fleet rig is available.',
);
assert.strictEqual(
  commandCenterSource.includes('vehicleSetupStore.subscribe') &&
    commandCenterSource.includes('vehicleStore.subscribe') &&
    commandCenterSource.includes('vehicleStore.getLocalSnapshot().length'),
  true,
  'Dispatch should reflect Fleet vehicle edits and availability in the profile gate.',
);

console.log('Dispatch profile setup checks passed.');
