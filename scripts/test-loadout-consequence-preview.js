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
const panelSource = fs.readFileSync(panelPath, 'utf8');

{
  const firstSnapshot = preview.getLoadoutConsequencePreviewSnapshot();
  const secondSnapshot = preview.getLoadoutConsequencePreviewSnapshot();
  assert.strictEqual(
    secondSnapshot,
    firstSnapshot,
    'Command Brief external-store snapshot reads must be referentially stable between publishes.',
  );
}

assert.ok(
  panelSource.includes('selectedImpactId') &&
    panelSource.includes('selectedImpact') &&
    panelSource.includes('impactExplanation'),
  'Loadout consequence preview should keep selected top-heavy/recovery/route-fit explanation state.',
);
assert.ok(
  panelSource.includes('preview.topHeavyRisk.reasons') &&
    panelSource.includes('preview.recoveryDifficultyImpact.reasons') &&
    panelSource.includes('preview.routeSuitabilityImpact.reasons'),
  'Clickable consequence statuses should explain themselves from the deterministic preview impact reasons.',
);
assert.ok(
  panelSource.includes('accessibilityRole="button"') &&
    panelSource.includes('setSelectedImpactId'),
  'Top-heavy, recovery, and route-fit status tiles should be pressable buttons.',
);
assert.ok(
  !panelSource.includes('Main risk: {preview.mainRisk}'),
  'The old blunt main-risk line should be replaced by the selected status explanation panel.',
);

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

function stateItem(id, lbs, loadZone, compartmentId, name = id, options = {}) {
  return {
    id,
    name,
    category: options.category ?? 'gear',
    typicalWeightLb: lbs,
    quantity: options.quantity ?? 1,
    compartmentId,
    loadZone,
    permanence: options.permanence ?? 'trip',
    source: options.source ?? 'user_estimate',
    confidence: options.confidence ?? 66,
    presetId: options.presetId ?? 'custom',
    placement: { x: 0, y: 0, z: 0, source: 'fleet_load_zone', status: 'assigned' },
  };
}

function compartment(id, loadZone, name = id) {
  return {
    id,
    name,
    accessoryInstallId: `${id}:install`,
    accessoryId: 'custom_accessory',
    loadZone,
    maxWeightLbs: null,
    volumeLiters: null,
    status: 'active',
    display: display(name),
    placement: { x: 0, y: 0, z: 0, source: 'fleet_load_zone', status: 'assigned' },
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
  assert.strictEqual(result.calculationTrace.vehicleId, vehicle.id);
  assert.strictEqual(result.calculationTrace.calculationMode, 'preview');
  assert.ok(result.calculationTrace.weightContributionsBefore.some((item) => item.kind === 'base_or_curb_weight'));
  assert.ok(result.calculationTrace.weightContributionsAfter.some((item) => item.kind === 'accessory_weight' && item.itemIds.includes('bed-drawers')));
  assert.ok(result.calculationTrace.weightContributionsAfter.some((item) => item.kind === 'water_weight' && item.itemIds.includes('water-cans')));
  assert.ok(result.calculationTrace.weightContributionsAfter.some((item) => item.kind === 'trailer_tongue_weight'));
  assert.strictEqual(result.calculationTrace.loadedWeightAfter, result.loadedVehicleWeightAfter);
  assert.strictEqual(result.calculationTrace.payloadRemainingAfter, result.payloadRemainingAfter);
  assert.ok(result.calculationTrace.sourcePrecedenceApplied.some((item) => item.fieldPath === 'vehicle.buildProfile.gvwr'));
  assert.ok(result.sourceWarnings.some((warning) => warning.id === 'source-estimated-loadout'));
  assert.ok(result.evidenceEvents.includes('preview_generated'));
  assert.ok(result.evidenceEvents.includes('loadout_committed'));
  assert.ok(result.evidenceEvents.includes('suggestion_acknowledged'));
  assert.ok(result.evidenceEvents.includes('suggestion_applied'));
  assert.ok(result.evidenceEvents.includes('suggestion_apply_failed'));
  assert.ok(result.evidenceEvents.includes('command_brief_mirror_invalidated'));
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
  assert.strictEqual(result.calculationTrace.inferredCurbWeight.sourceKind, 'estimated');
  assert.ok(result.calculationTrace.sourcePrecedenceApplied.some((item) =>
    item.fieldPath === 'vehicle.buildProfile.baseNetWeight' &&
    item.reason.includes('inferred from GVWR minus net payload')));
  assert.ok(result.sourceWarnings.some((warning) => warning.id === 'inferred-base-from-net-payload'));
  assert.ok(result.sourceWarnings.some((warning) => warning.message.includes('estimated')));
}

{
  const vehicle = makeVehicle({
    buildProfile: {
      baseNetWeight: weight(5200, 'user_estimate', 55, 'old estimate'),
      gvwr: weight(7000, 'ecs_default', 60, 'class default GVWR'),
    },
  });
  const result = preview.buildLoadoutConsequencePreview({
    vehicleId: vehicle.id,
    vehicle,
    vehicleSpecEvidence: {
      baseWeight: evidence(5150, 'oem', 90, 'OEM base'),
      gvwr: evidence(7200, 'user_confirmed', 98, 'door placard'),
    },
    currentAccessories: [],
    currentLoadoutItems: [],
    proposedAccessories: [],
    proposedLoadoutItems: [],
    calculationMode: 'preview',
  });

  const gvwrTrace = result.calculationTrace.sourcePrecedenceApplied.find((item) => item.fieldPath === 'vehicle.buildProfile.gvwr');
  const baseTrace = result.calculationTrace.sourcePrecedenceApplied.find((item) => item.fieldPath === 'vehicle.buildProfile.baseNetWeight');
  assert.strictEqual(gvwrTrace.chosenSourceKind, 'user_confirmed');
  assert.deepStrictEqual(gvwrTrace.availableSourceKinds, ['default', 'user_confirmed']);
  assert.strictEqual(baseTrace.chosenSourceKind, 'oem');
  assert.deepStrictEqual(baseTrace.availableSourceKinds, ['estimated', 'oem']);
  assert.strictEqual(result.calculationTrace.gvwr.value, 7200);
  assert.strictEqual(result.calculationTrace.baseWeight.value, 5150);
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
  const topTrace = result.riskTraces.find((item) => item.signalId === 'top_heavy');
  const recoveryTrace = result.riskTraces.find((item) => item.signalId === 'recovery_difficulty');
  assert.ok(topTrace.factors.some((factor) => factor.factorId === 'roof_weight' && factor.impact !== 'none'));
  assert.ok(topTrace.factors.some((factor) => factor.factorId === 'load_zone_height'));
  assert.ok(topTrace.factors.some((factor) => factor.factorId === 'route_difficulty'));
  assert.ok(recoveryTrace.factors.some((factor) => factor.factorId === 'tire_lift_state'));
  assert.ok(result.suggestions.some((item) => item.action === 'relocate' && item.targetZone === 'bedLow'));
  assert.ok(result.suggestions.some((item) => /Roof tent|Water cans/.test(item.itemName)));
  assert.ok(result.suggestions.every((item) => item.actions.length > 0));
  assert.ok(result.suggestions.some((item) => item.actions.some((action) => action.label !== 'Accept')));
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
  assert.ok(result.riskTraces.find((item) => item.signalId === 'recovery_difficulty').factors.some((factor) => factor.factorId === 'trailer_state'));
  assert.ok(result.calculationTrace.weightContributionsAfter.some((item) => item.kind === 'trailer_tongue_weight'));
  assert.ok(result.suggestions.some((item) => item.action === 'relocate' && item.reason.includes('rear')));
  assert.ok(result.sourceWarnings.some((warning) => warning.id === 'source-estimated-trailer-tongue'));
}

{
  const vehicle = makeVehicle();
  const result = preview.buildLoadoutConsequencePreview({
    vehicleId: vehicle.id,
    vehicle,
    currentAccessories: [],
    currentLoadoutItems: [],
    proposedAccessories: [],
    proposedLoadoutItems: [
      loadoutItem('vehicle-awning', 48, 'roof', 'Vehicle awning', { category: 'camp' }),
      loadoutItem('heated-blanket', 12, 'roof', 'Heated blanket', { category: 'winter' }),
    ],
    calculationMode: 'preview',
    profileId: 'profile-1',
    loadoutId: 'loadout-1',
  });

  const awningSuggestion = result.suggestions.find((item) => item.itemId === 'vehicle-awning');
  assert.ok(awningSuggestion, 'Fixed roof-mounted awning should still be visible as a reviewable high-mounted load risk.');
  assert.strictEqual(awningSuggestion.applicationState, 'review_only');
  assert.ok(!awningSuggestion.actions.some((action) => action.actionKind === 'relocate_item'));
  assert.ok(awningSuggestion.actions.some((action) => action.actionKind === 'open_editor'));
  assert.ok(awningSuggestion.actions.some((action) => action.actionKind === 'dismiss'));
  assert.ok(
    awningSuggestion.reason.includes('mounted on the roof') &&
      !awningSuggestion.reason.toLowerCase().includes('move high-mounted'),
    'Awning copy should not imply the awning can be relocated into bed/cab storage.',
  );

  const blanketSuggestion = result.suggestions.find((item) => item.itemId === 'heated-blanket');
  assert.ok(blanketSuggestion, 'Portable roof-stowed heated blanket should get concrete relocation choices.');
  assert.ok(
    blanketSuggestion.reason.includes('bed space') &&
      blanketSuggestion.reason.includes('cab interior'),
    'Portable relocation copy should name the possible target locations.',
  );
  const relocationActions = blanketSuggestion.actions.filter((action) => action.actionKind === 'relocate_item');
  assert.deepStrictEqual(
    relocationActions.map((action) => action.targetZoneId).sort(),
    ['bedLow', 'cab'],
    'Portable high-mounted gear should offer bed and cab relocation actions.',
  );
  assert.ok(relocationActions.some((action) => action.label === 'Relocate to bed space'));
  assert.ok(relocationActions.some((action) => action.label === 'Relocate to cab interior'));
  assert.ok(blanketSuggestion.actions.some((action) => action.actionKind === 'dismiss'));

  const initialState = {
    accessories: [],
    compartments: [
      compartment('roof-bin', 'roof', 'Roof bin'),
      compartment('bed-bin', 'bedLow', 'Bed space'),
      compartment('cab-bin', 'cab', 'Cab interior'),
    ],
    loadoutItems: [
      stateItem('vehicle-awning', 48, 'roof', 'roof-bin', 'Vehicle awning', { category: 'camp' }),
      stateItem('heated-blanket', 12, 'roof', 'roof-bin', 'Heated blanket', { category: 'winter' }),
    ],
  };

  const bedAction = relocationActions.find((action) => action.targetZoneId === 'bedLow');
  const bedApplied = preview.applyLoadoutSuggestionAction({
    preview: result,
    actionId: bedAction.actionId,
    state: initialState,
    currentVehicleId: vehicle.id,
    currentProfileId: 'profile-1',
    currentLoadoutId: 'loadout-1',
  });
  assert.strictEqual(bedApplied.applicationState, 'applied');
  assert.strictEqual(bedApplied.nextState.loadoutItems.find((item) => item.id === 'heated-blanket').loadZone, 'bedLow');
  assert.strictEqual(bedApplied.nextState.loadoutItems.find((item) => item.id === 'heated-blanket').compartmentId, 'bed-bin');

  const cabAction = relocationActions.find((action) => action.targetZoneId === 'cab');
  const cabApplied = preview.applyLoadoutSuggestionAction({
    preview: result,
    actionId: cabAction.actionId,
    state: initialState,
    currentVehicleId: vehicle.id,
    currentProfileId: 'profile-1',
    currentLoadoutId: 'loadout-1',
  });
  assert.strictEqual(cabApplied.applicationState, 'applied');
  assert.strictEqual(cabApplied.nextState.loadoutItems.find((item) => item.id === 'heated-blanket').loadZone, 'cab');
  assert.strictEqual(cabApplied.nextState.loadoutItems.find((item) => item.id === 'heated-blanket').compartmentId, 'cab-bin');

  const dismissAction = blanketSuggestion.actions.find((action) => action.actionKind === 'dismiss');
  const dismissed = preview.applyLoadoutSuggestionAction({
    preview: result,
    actionId: dismissAction.actionId,
    state: initialState,
    currentVehicleId: vehicle.id,
    currentProfileId: 'profile-1',
    currentLoadoutId: 'loadout-1',
  });
  assert.strictEqual(dismissed.applicationState, 'review_only');
  assert.strictEqual(dismissed.telemetryEvent, 'suggestion_dismissed');
  assert.strictEqual(dismissed.nextState, initialState);
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
  assert.strictEqual(result.calculationTrace.gvwrPercentAfter, null);
  assert.ok(result.calculationTrace.warnings.some((warning) => warning.id === 'missing-gvwr'));
}

{
  const vehicle = makeVehicle();
  const missingRoute = preview.buildLoadoutConsequencePreview({
    vehicleId: vehicle.id,
    vehicle,
    currentAccessories: [],
    currentLoadoutItems: [],
    proposedAccessories: [],
    proposedLoadoutItems: [loadoutItem('camp-box', 120, 'bedLow', 'Camp box', { source: 'ecs_default', confidence: 70 })],
    routeContext: null,
    calculationMode: 'preview',
  });
  assert.strictEqual(missingRoute.routeSuitabilityImpact.level, 'unknown');
  assert.ok(missingRoute.sourceWarnings.some((warning) => warning.id === 'missing-route-context'));
  assert.ok(missingRoute.riskTraces.find((item) => item.signalId === 'route_suitability').factors.some((factor) => factor.factorId === 'missing_source'));

  const staleRoute = preview.buildLoadoutConsequencePreview({
    vehicleId: vehicle.id,
    vehicle,
    currentAccessories: [],
    currentLoadoutItems: [],
    proposedAccessories: [],
    proposedLoadoutItems: [loadoutItem('camp-box', 120, 'bedLow', 'Camp box', { source: 'ecs_default', confidence: 70 })],
    routeContext: { difficulty: 'hard', terrainRisk: 'caution', freshness: 'stale', sourceKind: 'oem', observedAt: '2026-06-01T00:00:00.000Z' },
    calculationMode: 'preview',
  });
  assert.ok(staleRoute.sourceWarnings.some((warning) => warning.id === 'stale-route-context'));
  assert.ok(staleRoute.calculationTrace.sourcePrecedenceApplied.some((item) => item.fieldPath === 'routeContext'));
}

{
  const vehicleA = makeVehicle({ id: 'vehicle-A' });
  const vehicleB = makeVehicle({
    id: 'vehicle-B',
    buildProfile: {
      baseNetWeight: weight(6100, 'ecs_default', 60, 'Vehicle B default'),
      gvwr: weight(7600, 'manufacturer_spec', 91, 'Vehicle B OEM GVWR'),
    },
  });
  const vehicleAResult = preview.buildLoadoutConsequencePreview({
    vehicleId: vehicleA.id,
    vehicle: vehicleA,
    vehicleSpecEvidence: {
      baseWeight: evidence(5000, 'user_confirmed', 98, 'Vehicle A scale'),
      gvwr: evidence(7000, 'user_confirmed', 98, 'Vehicle A placard'),
    },
    currentAccessories: [],
    currentLoadoutItems: [],
    proposedAccessories: [],
    proposedLoadoutItems: [],
    profileId: 'profile-A',
    calculationMode: 'preview',
  });
  const vehicleBResult = preview.buildLoadoutConsequencePreview({
    vehicleId: vehicleB.id,
    vehicle: vehicleB,
    currentAccessories: [],
    currentLoadoutItems: [],
    proposedAccessories: [],
    proposedLoadoutItems: [],
    profileId: 'profile-B',
    trailerState: { attached: false, tongueWeightLb: evidence(0) },
    calculationMode: 'preview',
  });
  assert.strictEqual(vehicleAResult.calculationTrace.baseWeight.value, 5000);
  assert.strictEqual(vehicleBResult.calculationTrace.baseWeight.value, 6100);
  assert.strictEqual(vehicleBResult.calculationTrace.profileId, 'profile-B');
  assert.ok(!vehicleBResult.calculationTrace.weightContributionsAfter.some((item) => item.kind === 'trailer_tongue_weight'));
}

{
  const vehicle = makeVehicle();
  const previewResult = preview.buildLoadoutConsequencePreview({
    vehicleId: vehicle.id,
    vehicle,
    currentAccessories: [],
    currentLoadoutItems: [],
    proposedAccessories: [],
    proposedLoadoutItems: [
      loadoutItem('roof-tent', 185, 'roof', 'Roof tent', { category: 'camp', isCritical: false }),
      loadoutItem('recovery-board', 40, 'roof', 'Recovery board', { category: 'recovery', isCritical: true }),
    ],
    calculationMode: 'preview',
    profileId: 'profile-1',
    loadoutId: 'loadout-1',
  });
  const roofSuggestion = previewResult.suggestions.find((item) => item.itemId === 'roof-tent');
  const relocateAction = roofSuggestion.actions.find((action) => action.actionKind === 'relocate_item');
  assert.ok(relocateAction.canApplyAutomatically);
  const initialState = {
    accessories: [],
    compartments: [
      compartment('roof-bin', 'roof', 'Roof bin'),
      compartment('bed-bin', 'bedLow', 'Bed bin'),
    ],
    loadoutItems: [
      stateItem('roof-tent', 185, 'roof', 'roof-bin', 'Roof tent', { category: 'camp', permanence: 'optional' }),
      stateItem('recovery-board', 40, 'roof', 'roof-bin', 'Recovery board', { category: 'recovery', permanence: 'always' }),
    ],
  };
  const applied = preview.applyLoadoutSuggestionAction({
    preview: previewResult,
    actionId: relocateAction.actionId,
    state: initialState,
    currentVehicleId: vehicle.id,
    currentProfileId: 'profile-1',
    currentLoadoutId: 'loadout-1',
  });
  assert.strictEqual(applied.applicationState, 'applied');
  assert.strictEqual(applied.telemetryEvent, 'suggestion_applied');
  assert.strictEqual(applied.nextState.loadoutItems.find((item) => item.id === 'roof-tent').loadZone, 'bedLow');

  const wrongVehicle = preview.applyLoadoutSuggestionAction({
    preview: previewResult,
    actionId: relocateAction.actionId,
    state: initialState,
    currentVehicleId: 'vehicle-B',
    currentProfileId: 'profile-1',
    currentLoadoutId: 'loadout-1',
  });
  assert.strictEqual(wrongVehicle.applicationState, 'failed');
  assert.strictEqual(wrongVehicle.telemetryEvent, 'suggestion_apply_failed');
  assert.strictEqual(wrongVehicle.nextState, initialState);

  const removeCriticalSuggestion = {
    ...roofSuggestion,
    actions: [{
      actionId: 'remove-critical',
      suggestionId: roofSuggestion.id,
      actionKind: 'remove_item',
      label: 'Remove optional item',
      canApplyAutomatically: true,
      targetItemIds: ['recovery-board'],
    }],
  };
  const criticalPreview = { ...previewResult, suggestions: [removeCriticalSuggestion] };
  const failedRemove = preview.applyLoadoutSuggestionAction({
    preview: criticalPreview,
    actionId: 'remove-critical',
    state: initialState,
    currentVehicleId: vehicle.id,
    currentProfileId: 'profile-1',
    currentLoadoutId: 'loadout-1',
  });
  assert.strictEqual(failedRemove.applicationState, 'failed');
  assert.strictEqual(failedRemove.telemetryEvent, 'suggestion_apply_failed');
  assert.ok(failedRemove.reason.includes('required recovery or safety'));

  const acknowledgePreview = {
    ...previewResult,
    suggestions: [{
      ...roofSuggestion,
      actions: [{
        actionId: 'ack-roof-tent',
        suggestionId: roofSuggestion.id,
        actionKind: 'acknowledge',
        label: 'Acknowledge',
        canApplyAutomatically: false,
        targetItemIds: ['roof-tent'],
      }],
    }],
  };
  const acknowledged = preview.applyLoadoutSuggestionAction({
    preview: acknowledgePreview,
    actionId: 'ack-roof-tent',
    state: initialState,
    currentVehicleId: vehicle.id,
    currentProfileId: 'profile-1',
    currentLoadoutId: 'loadout-1',
  });
  assert.strictEqual(acknowledged.applicationState, 'review_only');
  assert.strictEqual(acknowledged.telemetryEvent, 'suggestion_acknowledged');
  assert.ok(acknowledged.reason.includes('acknowledged'));
}

{
  const vehicle = makeVehicle();
  const result = preview.buildLoadoutConsequencePreview({
    vehicleId: vehicle.id,
    vehicle,
    currentAccessories: [],
    currentLoadoutItems: [],
    proposedAccessories: [],
    proposedLoadoutItems: [],
    routeId: 'route-1',
    routeGeometryVersion: 'geom-1',
    profileId: 'profile-1',
    loadoutId: 'loadout-1',
    calculationMode: 'preview',
  });
  const published = preview.publishLoadoutConsequencePreview(result, { source: 'proposed_preview' });
  assert.strictEqual(published.mirror.source, 'proposed_preview');
  assert.strictEqual(published.summary.stale, false);
  const invalid = preview.invalidateLoadoutConsequenceMirror('preview_cancelled', {
    vehicleId: vehicle.id,
    profileId: 'profile-1',
    loadoutId: 'loadout-1',
  });
  assert.strictEqual(invalid.mirror.stale, true);
  assert.strictEqual(invalid.mirror.invalidationReason, 'preview_cancelled');
  assert.strictEqual(invalid.summary.stale, true);

  const vehicleSwitch = preview.isLoadoutConsequenceMirrorValid(published.mirror, { vehicleId: 'vehicle-2' });
  assert.strictEqual(vehicleSwitch.valid, false);
  assert.strictEqual(vehicleSwitch.invalidationReason, 'vehicle_changed');
}

{
  const scale = preview.validateLoadoutScaleValidationEvidence({
    evidenceId: 'scale-1',
    vehicleId: 'vehicle-1',
    measuredAt: '2026-06-13T00:00:00.000Z',
    sourceKind: 'scale_ticket',
    predictedLoadedWeight: 6500,
    measuredLoadedWeight: 6565,
    unit: 'lb',
    delta: 65,
    deltaPercent: 1,
    artifactPath: '.smoke/scale-ticket.json',
    confidence: 'high',
    acceptedBy: 'QA',
    acceptedAt: '2026-06-13T01:00:00.000Z',
    notes: ['accepted'],
  });
  assert.strictEqual(scale.valid, true);
  assert.strictEqual(scale.blocked, false);

  const highDelta = preview.validateLoadoutScaleValidationEvidence({
    evidenceId: 'scale-2',
    vehicleId: 'vehicle-1',
    measuredAt: '2026-06-13T00:00:00.000Z',
    sourceKind: 'loaded_scale',
    predictedLoadedWeight: 6500,
    measuredLoadedWeight: 7200,
    unit: 'lb',
    delta: 700,
    deltaPercent: 10.8,
    confidence: 'medium',
    acceptedBy: 'QA',
    acceptedAt: '2026-06-13T01:00:00.000Z',
    notes: [],
  });
  assert.strictEqual(highDelta.valid, false);
  assert.ok(highDelta.blockers.includes('loaded_scale_delta_exceeds_policy'));
}

{
  const vehicle = makeVehicle();
  const largeItems = Array.from({ length: 260 }, (_, index) =>
    loadoutItem(`large-${index}`, 8 + (index % 5), index % 3 === 0 ? 'roof' : index % 3 === 1 ? 'bedLow' : 'rearLow', `Large item ${index}`, {
      source: index % 2 === 0 ? 'ecs_default' : 'user_estimate',
      confidence: 64,
    }));
  const started = Date.now();
  const result = preview.buildLoadoutConsequencePreview({
    vehicleId: vehicle.id,
    vehicle,
    currentAccessories: [],
    currentLoadoutItems: [],
    proposedAccessories: [accessory('roof-platform', 100, 'roof', 'Roof platform')],
    proposedLoadoutItems: largeItems,
    routeContext: { difficulty: 'moderate', remoteness: 'medium', recoveryPosture: 'limited' },
    trailerState: { attached: true, tongueWeightLb: evidence(300, 'estimated', 60) },
    calculationMode: 'preview',
  });
  const durationMs = Date.now() - started;
  assert.strictEqual(result.calculationTrace.weightContributionsAfter.filter((item) => item.kind === 'gear_weight').length >= 250, true);
  assert.ok(durationMs < 1500, `large loadout preview should remain responsive in local unit run, took ${durationMs}ms`);
}

{
  const uiSource = fs.readFileSync(modalPath, 'utf8');
  const panelSource = fs.readFileSync(panelPath, 'utf8');
  const commandBriefSource = fs.readFileSync(commandBriefPath, 'utf8');
  assert.ok(uiSource.includes('LoadoutConsequencePreviewPanel'), 'Fleet loadout editor must render the consequence preview panel.');
  assert.ok(uiSource.includes('publishLoadoutConsequencePreview'), 'Fleet loadout editor must publish latest preview for Command Brief mirroring.');
  assert.ok(uiSource.includes('applyLoadoutSuggestionAction'), 'Fleet loadout editor must use safe suggestion application helper.');
  assert.ok(uiSource.includes('getFleetAccessoryCatalogItem'), 'Suggestion Open editor should resolve accessory catalog entries.');
  assert.ok(uiSource.includes('targetAccessory'), 'Suggestion Open editor should open accessory editors when a target item is an accessory.');
  assert.ok(uiSource.includes('defaultLoadRating') && uiSource.includes('dynamicLoadLb') && uiSource.includes('staticLoadLb'), 'SmartCap accessory editor should expose default dynamic/static load ratings.');
  assert.ok(uiSource.includes("catalog.id === 'truck_cap_smartcap'") && uiSource.includes('setEditingCatalog(catalog)'), 'Selecting SmartCap should immediately open the rating editor with defaults.');
  assert.ok(uiSource.includes('suggestion_applied'), 'Fleet loadout editor must emit applied telemetry only after mutation.');
  assert.ok(uiSource.includes('suggestion_apply_failed'), 'Fleet loadout editor must emit failure telemetry when mutation is rejected.');
  assert.ok(uiSource.includes('command_brief_mirror_invalidated'), 'Fleet loadout editor must emit mirror invalidation telemetry.');
  assert.ok(panelSource.includes('sourceWarnings'), 'Preview panel must render source/confidence warnings.');
  assert.ok(panelSource.includes('acknowledgedWarningSignature'), 'Warning acknowledgement should update visible panel state instead of telemetry only.');
  assert.ok(panelSource.includes('selectedSuggestionId'), 'Suggestion View should select a visible detail state instead of telemetry only.');
  assert.ok(panelSource.includes('handleViewSuggestion'), 'Suggestion View button must route through a visible view handler.');
  assert.ok(panelSource.includes('suggestion_viewed'), 'Suggestion view evidence event must be wired.');
  assert.ok(panelSource.includes('suggestion_acknowledged'), 'Review-only suggestions should acknowledge instead of accept.');
  assert.ok(panelSource.includes('dismissedSuggestionIds'), 'Dismissed suggestions should disappear locally so the next suggestion can populate the panel.');
  assert.ok(panelSource.includes("action.actionKind === 'dismiss'"), 'Dismiss action should be handled as an explicit visible suggestion action.');
  assert.ok(!panelSource.includes('suggestion.actions.slice(0, 1)'), 'Suggestion rows should render all concrete destination actions, not only the first generic action.');
  assert.ok(!panelSource.includes('label="Accept"'), 'Review-only suggestions must not render Accept.');
  ['unsafe', 'do not drive', 'route blocked', 'vehicle unfit'].forEach((claim) => {
    assert.ok(!panelSource.toLowerCase().includes(claim), `Panel copy must avoid unsupported hard claim: ${claim}`);
  });
  assert.ok(commandBriefSource.includes('LoadoutConsequenceCommandBriefPanel'), 'Command Brief must mirror aggregate loadout consequence impact.');
  assert.ok(commandBriefSource.includes('useLoadoutConsequencePreviewSnapshot'), 'Command Brief must subscribe to latest preview snapshot.');
  assert.ok(commandBriefSource.includes('invalidationReason'), 'Command Brief mirror should expose validity/staleness metadata.');
  assert.ok(commandBriefSource.includes('summary.stale'), 'Command Brief should avoid active proposed preview when stale.');
}

{
  const productionGateSource = fs.readFileSync(productionGatePath, 'utf8');
  assert.ok(productionGateSource.includes('android_no_network_device_evidence'), 'Production gate must require Android no-network evidence.');
  assert.ok(productionGateSource.includes('profile_variance_evidence'), 'Production gate must require profile variance evidence.');
  assert.ok(productionGateSource.includes('multi_vehicle_evidence'), 'Production gate must require multi-vehicle evidence.');
  assert.ok(productionGateSource.includes('scale_ticket_evidence'), 'Production gate must require scale ticket evidence.');
  assert.ok(productionGateSource.includes('loaded_scale_delta_evidence'), 'Production gate must require loaded-scale delta evidence.');
  assert.ok(productionGateSource.includes('offline_cache_evidence'), 'Production gate must require offline/cache evidence.');
  assert.ok(productionGateSource.includes('large_loadout_performance_evidence'), 'Production gate must require large-loadout performance evidence.');
  assert.ok(productionGateSource.includes('validateLoadoutConsequencePreviewProductionEvidenceManifest'), 'Production gate must validate a manifest contract.');
}

console.log('Loadout consequence preview checks passed.');
