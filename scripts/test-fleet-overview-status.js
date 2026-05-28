const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

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

const originalModuleLoad = Module._load;
Module._load = function patchedModuleLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
  }
  return originalModuleLoad.call(this, request, parent, isMain);
};

const fleet = require(path.join(root, 'lib', 'fleet', 'fleetPremiumDomain.ts'));
const overview = require(path.join(root, 'lib', 'fleet', 'fleetOverviewStatus.ts'));

function weight(value, source, confidence, sourceLabel) {
  return fleet.createFleetWeightValue(value, source, { confidence, sourceLabel });
}

function result(overrides = {}) {
  const baseNetWeight = overrides.baseNetWeight ?? weight(5200, 'user_estimate', 62, 'User-entered base weight');
  const gvwr = Object.prototype.hasOwnProperty.call(overrides, 'gvwr')
    ? overrides.gvwr
    : weight(7100, 'user_estimate', 62, 'User-entered GVWR');
  return {
    vehicleId: 'vehicle-1',
    baseNetWeight,
    installedAccessoryWeight: overrides.installedAccessoryWeight ?? weight(450, 'user_estimate', 72, 'Installed accessory weight'),
    passengerWeight: weight(0, 'unknown', 0, 'Passenger weight not modeled'),
    activeLoadoutWeight: overrides.activeLoadoutWeight ?? weight(620, 'user_estimate', 72, 'Active loadout weight'),
    consumablesWeight: weight(180, 'calculated', 80, 'Fuel plus water consumables'),
    operatingWeight: weight(6450, 'calculated', 70, 'Base vehicle plus installed accessories plus active loadout'),
    gvwr,
    payloadRemaining: weight(650, 'calculated', 62, 'GVWR minus operating weight'),
    payloadCapacity: weight(1900, 'calculated', 62, 'GVWR minus base/curb weight'),
    gvwrUsagePct: 90.8,
    zoneWeights: {},
    topHeavyRisk: 'clear',
    frontAxleRisk: 'clear',
    rearAxleRisk: 'watch',
    gvwrOverageRisk: 'watch',
    confidence: overrides.confidence ?? 70,
    confidenceMetadata: {
      level: 'ecs_estimate',
      label: 'ECS estimate',
      copy: 'Weight profile uses saved vehicle values. Complete user-entered core weights count as usable Fleet scoring inputs.',
      score: overrides.confidence ?? 70,
      reasons: [],
    },
    validationFlags: overrides.validationFlags ?? [],
    warnings: [],
  };
}

const completeUserEntered = result();
assert.deepStrictEqual(
  overview.resolveFleetVerificationTargets(completeUserEntered),
  [],
  'User-entered base weight and GVWR should not be treated as missing verification targets.',
);
assert.strictEqual(
  overview.resolveFleetVerificationStatus(completeUserEntered),
  'Estimated',
  'Complete user-entered weights should be estimated rather than needs-verification.',
);

const genericBase = result({
  baseNetWeight: weight(5000, 'ecs_default', 66, 'Generic midsize SUV ECS default'),
});
assert.deepStrictEqual(
  overview.resolveFleetVerificationTargets(genericBase),
  ['base estimate'],
  'Generic ECS base defaults should ask for a better source without claiming base weight is absent.',
);

const missingBase = result({
  baseNetWeight: weight(0, 'unknown', 0, 'Missing base vehicle weight'),
});
assert.deepStrictEqual(
  overview.resolveFleetVerificationTargets(missingBase),
  ['base weight'],
  'Missing base weight should remain a hard verification target.',
);

const verified = result({
  baseNetWeight: weight(5200, 'scale_ticket', 98, 'Scale ticket'),
  gvwr: weight(7100, 'manufacturer_spec', 91, 'Door placard GVWR'),
  installedAccessoryWeight: weight(450, 'manufacturer_spec', 88, 'Accessory manufacturer weights'),
  activeLoadoutWeight: weight(620, 'scale_ticket', 98, 'Loaded bin scale weights'),
  confidence: 91,
});
assert.strictEqual(
  overview.resolveFleetVerificationStatus(verified),
  'Verified',
  'High-confidence measured/catalog sources should resolve as verified.',
);

const notice = overview.buildFleetConfidenceNotice([
  { id: 'vehicle-1', name: 'Trail Rig', weightResult: completeUserEntered },
], {
  confidenceLabel: 'Moderate confidence',
  summary: 'Key concern: vehicle guidance is based on saved profile data.',
  detail: 'Recommendation: verify scale weight for stronger recommendations.',
  limitations: ['loadout readiness is still incomplete'],
  missingCritical: [],
  vehicleSuggestions: ['Confirm payload after accessories and recovery gear.'],
});
assert.strictEqual(notice.scoreLabel, '70%');
assert.strictEqual(
  notice.intelligenceSummary,
  'Vehicle guidance is based on saved profile data.',
  'Confidence notice should include Fleet command intelligence summary without the banner prefix.',
);
assert.strictEqual(
  notice.intelligenceDetail,
  'Verify scale weight for stronger recommendations.',
  'Confidence notice should include Fleet command intelligence recommendation without the banner prefix.',
);
assert.ok(
  notice.summary.includes('incomplete accessory, loadout, consumable, or validation inputs'),
  'Confidence notice should explain that complete core weights are not waiting on source upgrades.',
);
assert.ok(
  notice.reasons.some((reason) => reason.includes('Trail Rig') && reason.includes('base/curb weight')),
  'Confidence notice should include the specific base/curb source evidence.',
);
assert.ok(
  !notice.improvements.some((action) => /Upgrade the user-entered|manufacturer spec|VIN\/OEM match|scale ticket/i.test(action)),
  'Complete user-entered base weight and GVWR should not be pushed toward manufacturer, VIN/OEM, or scale-ticket upgrades.',
);
assert.ok(
  notice.improvements.some((action) => action.includes('Confirm payload after accessories')),
  'Confidence notice should still include actionable non-source improvement guidance.',
);
assert.ok(
  !notice.reasons.some((reason) => reason.includes('Base vehicle weight is missing')),
  'Complete user-entered weights should not produce missing-base copy.',
);

console.log('Fleet overview status checks passed.');
