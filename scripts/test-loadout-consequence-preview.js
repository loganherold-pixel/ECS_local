const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const domainPath = path.join(root, 'lib', 'fleet', 'fleetPremiumDomain.ts');
const previewPath = path.join(root, 'lib', 'fleet', 'loadoutConsequencePreview.ts');
const modalPath = path.join(root, 'components', 'fleet', 'FleetBuildLoadoutModal.tsx');
const panelPath = path.join(root, 'components', 'fleet', 'LoadoutConsequencePreviewPanel.tsx');
const commandBriefPath = path.join(root, 'components', 'brief', 'CommandBriefScreen.tsx');
const productionGatePath = path.join(root, 'scripts', 'check-loadout-consequence-preview-production-readiness.mjs');

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

const fleet = require(domainPath);
const preview = require(previewPath);

function display(title) {
  return {
    iconKey: 'pickup',
    title,
    subtitle: null,
    classLabel: null,
    chips: [],
    statusText: null,
    accentTone: 'info',
  };
}

function weight(lbs, source = 'user_estimate', confidence = 70, sourceLabel = source) {
  return fleet.createFleetWeightValue(lbs, source, { confidence, sourceLabel });
}

function evidence(value, sourceKind = 'user_confirmed', confidence = 85, sourceLabel = sourceKind) {
  return {
    value,
    sourceKind,
    confidence,
    sourceLabel,
    observedAt: '2026-06-12T12:00:00.000Z',
  };
}

function makeVehicle(overrides = {}) {
  const id = overrides.id ?? 'vehicle-1';
  const buildProfile = {
    id: `${id}:build`,
    vehicleId: id,
    useCases: ['overland'],
    baseNetWeight: weight(5200, 'scale_ticket', 98, 'Scale ticket base'),
    curbWeight: null,
    emptyWeight: null,
    gvwr: weight(7000, 'manufacturer_spec', 92, 'OEM GVWR'),
    wheelbaseIn: 132,
    tireSizeInches: 33,
    suspensionLiftInches: 2,
    isLeveled: false,
    resourceProfile: undefined,
    drivetrain: '4WD',
    display: display('Build profile'),
    updatedAt: '2026-06-12T12:00:00.000Z',
    ...(overrides.buildProfile ?? {}),
  };
  return {
    id,
    ownerUserId: 'user-1',
    nickname: 'Trail Rig',
    vehicleType: 'pickup',
    year: 2024,
    make: 'Toyota',
    model: 'Tacoma',
    trim: 'TRD Off-Road',
    buildProfile,
    display: display('Trail Rig'),
    activeLoadoutId: 'loadout-1',
    createdAt: '2026-06-12T12:00:00.000Z',
    updatedAt: '2026-06-12T12:00:00.000Z',
  };
}

function accessory(id, lbs, loadZone, name = id, source = 'user_estimate') {
  return {
    id,
    vehicleId: 'vehicle-1',
    catalogItemId: id,
    name,
    installedWeight: weight(lbs, source, source === 'scale_ticket' ? 98 : 70, `${name} weight`),
    affectsPayload: true,
    loadZone,
    compartmentId: `${id}:compartment`,
    placement: null,
    installedAt: null,
    notes: null,
    display: display(name),
  };
}

function loadoutItem(id, lbs, loadZone, name = id, options = {}) {
  return {
    id,
    vehicleId: 'vehicle-1',
    loadoutId: 'loadout-1',
    name,
    category: options.category ?? 'gear',
    quantity: options.quantity ?? 1,
    weight: weight(lbs, options.source ?? 'user_estimate', options.confidence ?? 66, `${name} estimate`),
    loadZone,
    compartmentId: options.compartmentId ?? `${loadZone}:bin`,
    placement: null,
    isCritical: options.isCritical ?? false,
    isPacked: true,
    notes: null,
    display: display(name),
  };
}

function riskAtLeast(level, expected) {
  const order = { unknown: -1, clear: 0, watch: 1, caution: 2, critical: 3 };
  return order[level] >= order[expected];
}

{
  const resolved = preview.resolveEvidenceValue([
    evidence(5200, 'estimated', 45, 'class default'),
    evidence(5150, 'default', 65, 'ECS default'),
    evidence(5080, 'oem', 92, 'OEM spec'),
    evidence(5250, 'user_confirmed', 98, 'scale ticket'),
  ]);
  assert.strictEqual(resolved.sourceKind, 'user_confirmed');
  assert.strictEqual(resolved.value, 5250);
}

{
  const vehicle = makeVehicle();
  const currentAccessories = [accessory('bed-drawers', 120, 'bedLow', 'Bed drawers', 'scale_ticket')];
  const currentLoadoutItems = [loadoutItem('tool-bag', 80, 'cab', 'Tool bag')];
  const proposedLoadoutItems = [
    ...currentLoadoutItems,
    loadoutItem('water-cans', 200, 'bedLow', 'Water cans', { source: 'user_estimate' }),
  ];
  const result = preview.buildLoadoutConsequencePreview({
    vehicleId: vehicle.id,
    vehicle,
    currentAccessories,
    currentLoadoutItems,
    proposedAccessories: currentAccessories,
    proposedLoadoutItems,
    trailerState: {
      attached: true,
      tongueWeightLb: evidence(250, 'user_confirmed', 96, 'measured trailer tongue'),
    },
    routeContext: { difficulty: 'easy', remoteness: 'low', recoveryPosture: 'nearby' },
    calculationMode: 'preview',
  });

  assert.strictEqual(result.readiness, 'current_user_facing_extension');
  assert.strictEqual(result.payloadRemainingBefore, 1600);
  assert.strictEqual(result.payloadRemainingAfter, 1150);
  assert.strictEqual(result.gvwrPercentBefore, 77.1);
  assert.strictEqual(result.gvwrPercentAfter, 83.6);
  assert.ok(result.sourceWarnings.some((warning) => warning.id === 'source-estimated-loadout'));
  assert.ok(result.evidenceEvents.includes('preview_generated'));
  assert.ok(result.evidenceEvents.includes('loadout_committed'));
}

{
  const vehicle = makeVehicle({
    buildProfile: {
      baseNetWeight: null,
      curbWeight: null,
      emptyWeight: null,
      gvwr: weight(7200, 'manufacturer_spec', 91, 'OEM GVWR'),
    },
  });
  const result = preview.buildLoadoutConsequencePreview({
    vehicleId: vehicle.id,
    vehicle,
    vehicleSpecEvidence: {
      netPayload: evidence(1800, 'oem', 88, 'OEM net payload'),
    },
    currentAccessories: [],
    currentLoadoutItems: [],
    proposedAccessories: [],
    proposedLoadoutItems: [loadoutItem('camp-box', 160, 'bedLow', 'Camp box')],
    calculationMode: 'preview',
  });

  assert.strictEqual(result.payloadRemainingBefore, 1800);
  assert.strictEqual(result.payloadRemainingAfter, 1640);
  assert.ok(result.sourceWarnings.some((warning) => warning.id === 'inferred-base-from-net-payload'));
  assert.ok(result.sourceWarnings.some((warning) => warning.message.includes('estimated')));
}

{
  const vehicle = makeVehicle();
  const result = preview.buildLoadoutConsequencePreview({
    vehicleId: vehicle.id,
    vehicle,
    currentAccessories: [],
    currentLoadoutItems: [],
    proposedAccessories: [accessory('roof-platform', 100, 'roof', 'Roof platform')],
    proposedLoadoutItems: [
      loadoutItem('roof-tent', 185, 'roof', 'Roof tent'),
      loadoutItem('water-cans', 150, 'bedHigh', 'Water cans'),
    ],
    routeContext: {
      difficulty: 'hard',
      terrainRisk: 'caution',
      remoteness: 'high',
      recoveryPosture: 'limited',
    },
    tireLiftState: { tireSizeInches: 35, suspensionLiftInches: 3 },
    calculationMode: 'preview',
  });

  assert.ok(riskAtLeast(result.topHeavyRisk.level, 'caution'), `expected top-heavy caution, got ${result.topHeavyRisk.level}`);
  assert.ok(riskAtLeast(result.recoveryDifficultyImpact.level, 'caution'), `expected recovery caution, got ${result.recoveryDifficultyImpact.level}`);
  assert.ok(riskAtLeast(result.routeSuitabilityImpact.level, 'caution'), `expected route caution, got ${result.routeSuitabilityImpact.level}`);
  assert.ok(result.suggestions.some((item) => item.action === 'relocate' && item.targetZone === 'bedLow'));
  assert.ok(result.suggestions.some((item) => /Roof tent|Water cans/.test(item.itemName)));
}

{
  const vehicle = makeVehicle({
    buildProfile: {
      baseNetWeight: weight(5900, 'scale_ticket', 98, 'scale ticket base'),
      gvwr: weight(7200, 'manufacturer_spec', 92, 'OEM GVWR'),
    },
  });
  const result = preview.buildLoadoutConsequencePreview({
    vehicleId: vehicle.id,
    vehicle,
    currentAccessories: [],
    currentLoadoutItems: [],
    proposedAccessories: [accessory('rear-bumper', 160, 'hitch', 'Rear bumper')],
    proposedLoadoutItems: [loadoutItem('rear-tools', 500, 'rearLow', 'Rear recovery tools')],
    trailerState: {
      attached: true,
      tongueWeightLb: evidence(600, 'estimated', 55, 'estimated loaded trailer tongue'),
    },
    routeContext: {
      difficulty: 'moderate',
      remoteness: 'high',
      recoveryPosture: 'remote',
    },
    calculationMode: 'preview',
  });

  assert.ok(riskAtLeast(result.recoveryDifficultyImpact.level, 'critical'));
  assert.ok(riskAtLeast(result.routeSuitabilityImpact.level, 'caution'));
  assert.ok(result.suggestions.some((item) => item.action === 'relocate' && item.reason.includes('rear')));
  assert.ok(result.sourceWarnings.some((warning) => warning.id === 'source-estimated-trailer-tongue'));
}

{
  const vehicle = makeVehicle({
    buildProfile: {
      gvwr: null,
    },
  });
  const result = preview.buildLoadoutConsequencePreview({
    vehicleId: vehicle.id,
    vehicle,
    currentAccessories: [],
    currentLoadoutItems: [],
    proposedAccessories: [],
    proposedLoadoutItems: [loadoutItem('spares', 140, 'bedLow', 'Spares')],
    calculationMode: 'preview',
  });

  assert.strictEqual(result.payloadRemainingAfter, null);
  assert.strictEqual(result.gvwrPercentAfter, null);
  assert.strictEqual(result.availability, 'partial');
  assert.ok(result.sourceWarnings.some((warning) => warning.id === 'missing-gvwr'));
  assert.ok(result.mainRisk.toLowerCase().includes('missing gvwr'));
}

{
  const uiSource = fs.readFileSync(modalPath, 'utf8');
  const panelSource = fs.readFileSync(panelPath, 'utf8');
  const commandBriefSource = fs.readFileSync(commandBriefPath, 'utf8');
  assert.ok(uiSource.includes('LoadoutConsequencePreviewPanel'), 'Fleet loadout editor must render the consequence preview panel.');
  assert.ok(uiSource.includes('publishLoadoutConsequencePreview'), 'Fleet loadout editor must publish latest preview for Command Brief mirroring.');
  assert.ok(panelSource.includes('sourceWarnings'), 'Preview panel must render source/confidence warnings.');
  assert.ok(panelSource.includes('suggestion_viewed'), 'Suggestion view evidence event must be wired.');
  assert.ok(panelSource.includes('suggestion_accepted'), 'Suggestion accept evidence event must be wired.');
  assert.ok(commandBriefSource.includes('LoadoutConsequenceCommandBriefPanel'), 'Command Brief must mirror aggregate loadout consequence impact.');
  assert.ok(commandBriefSource.includes('useLoadoutConsequencePreviewSnapshot'), 'Command Brief must subscribe to latest preview snapshot.');
}

{
  const productionGateSource = fs.readFileSync(productionGatePath, 'utf8');
  assert.ok(productionGateSource.includes('android_no_network_device_evidence'), 'Production gate must require Android no-network evidence.');
  assert.ok(productionGateSource.includes('profile_variance_evidence'), 'Production gate must require profile variance evidence.');
  assert.ok(productionGateSource.includes('multi_vehicle_evidence'), 'Production gate must require multi-vehicle evidence.');
  assert.ok(productionGateSource.includes('scale_ticket_evidence'), 'Production gate must require scale ticket evidence.');
  assert.ok(productionGateSource.includes('offline_cache_evidence'), 'Production gate must require offline/cache evidence.');
}

console.log('Loadout consequence preview checks passed.');
