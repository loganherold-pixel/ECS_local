const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' }, StyleSheet: { create: (styles) => styles } };
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

function read(...parts) {
  return fs.readFileSync(path.join(root, ...parts), 'utf8');
}

const {
  buildReadinessVehicleInputFromFleetState,
} = require(path.join(root, 'lib', 'readiness', 'fleetReadinessAdapter.ts'));
const {
  buildExpeditionReadiness,
} = require(path.join(root, 'lib', 'readiness', 'expeditionReadinessScoring.ts'));

function vehicleState(overrides) {
  const classification = overrides.classification;
  return {
    identity: {
      hasVehicle: true,
      vehicleId: overrides.id,
      displayName: overrides.name,
      year: overrides.year ?? 2024,
      make: overrides.make,
      model: overrides.model,
      trim: overrides.trim ?? null,
      vehicleType: overrides.vehicleType,
    },
    status: overrides.status ?? 'ready',
    vehicle: {
      avg_mpg: overrides.avgMpg ?? 16,
    },
    specs: {
      drivetrain: overrides.drivetrain,
      ground_clearance_inches: overrides.groundClearanceInches,
      wheelbase_in: overrides.wheelbaseInches,
    },
    canonicalFleetState: {
      fleetVehicle: {
        buildProfile: {
          trim: overrides.trim ?? null,
          drivetrain: overrides.drivetrain,
          groundClearanceInches: overrides.groundClearanceInches,
          wheelbaseIn: overrides.wheelbaseInches,
        },
      },
      accessories: (overrides.accessories ?? []).map((name) => ({ name })),
      loadoutItems: (overrides.loadoutItems ?? []).map((name) => ({ name })),
    },
    capability: {
      currentFuelGallons: overrides.currentFuelGallons ?? 12,
      fuelTankCapacityGal: overrides.fuelTankCapacityGal ?? 18,
      waterCapacityGal: overrides.waterCapacityGal ?? null,
      batteryUsableWh: overrides.batteryUsableWh ?? null,
      tireSizeInches: overrides.tireSizeInches ?? null,
      suspensionLiftInches: overrides.suspensionLiftInches ?? null,
    },
    weight: {
      estimatedOperatingWeightLbs: overrides.operatingWeightLbs ?? null,
      gvwrLbs: overrides.gvwrLbs ?? null,
      payloadUsedPct: overrides.payloadUsedPct ?? null,
      remainingPayloadLbs: overrides.remainingPayloadLbs ?? null,
      payloadCapacityLbs: overrides.payloadCapacityLbs ?? null,
      accessoryWeightLbs: overrides.accessoryWeightLbs ?? 0,
      cargoLoadoutWeightLbs: overrides.cargoLoadoutWeightLbs ?? 0,
      warnings: overrides.weightWarnings ?? [],
    },
    centerOfGravity: {
      topHeavyRisk: overrides.topHeavyRisk ?? 'clear',
    },
    modifications: {
      accessoryCount: (overrides.accessories ?? []).length,
    },
    loadout: {
      itemCount: (overrides.loadoutItems ?? []).length,
    },
    intelligence: {
      classification,
      suggestions: overrides.suggestions ?? [],
    },
    confidence: {
      label: overrides.confidenceLabel ?? 'high',
    },
    updatedAt: '2026-05-14T12:00:00.000Z',
  };
}

function classification(classId, label, traits) {
  return {
    classId,
    label,
    confidence: 'high',
    reasons: [],
    traits,
  };
}

const technicalRoute = {
  routeId: 'technical-route',
  name: 'Technical shelf trail',
  distanceMiles: 62,
  difficulty: 'technical',
  riskLevel: 'high',
  routeConfidence: 'medium',
  source: 'cached',
  updatedAt: '2026-05-14T12:00:00.000Z',
};

const baseInput = {
  route: technicalRoute,
  weather: { riskLevel: 'low', confidence: 'high', source: 'live', updatedAt: '2026-05-14T12:00:00.000Z' },
  daylight: { minutesRemainingAtArrival: 180, arrivalAfterDark: false, confidence: 'high', source: 'live', updatedAt: '2026-05-14T12:00:00.000Z' },
  offline: { routeDownloaded: true, mapsDownloaded: true, packageStatus: 'ready', source: 'cached', updatedAt: '2026-05-14T12:00:00.000Z' },
  campCandidates: [{ id: 'camp-a', name: 'Camp A', legalAccessConfidence: 'medium', officialConfirmation: false, accessStatus: 'unknown', suitabilityScore: 82, source: 'inferred', updatedAt: '2026-05-14T12:00:00.000Z', isInferred: true }],
  fuel: { rangeRemainingMiles: 190, routeDistanceRemainingMiles: 62, reserveMiles: 30, source: 'manual', updatedAt: '2026-05-14T12:00:00.000Z' },
  power: { runtimeHoursRemaining: 16, requiredRuntimeHours: 8, source: 'manual', updatedAt: '2026-05-14T12:00:00.000Z' },
  recovery: { bailoutRoutesAvailable: true, nearestExitMiles: 9, recoveryGearReady: true, recoveryAccessConfidence: 'high', source: 'manual', updatedAt: '2026-05-14T12:00:00.000Z' },
  communications: { signalConfidence: 'medium', satelliteCommsReady: true, teamCheckInPlanReady: true, source: 'manual', updatedAt: '2026-05-14T12:00:00.000Z' },
};

const outbackVehicle = buildReadinessVehicleInputFromFleetState(vehicleState({
  id: 'outback',
  name: 'Stock Subaru Outback',
  make: 'Subaru',
  model: 'Outback',
  vehicleType: 'wagon',
  drivetrain: 'AWD',
  tireSizeInches: 29,
  suspensionLiftInches: 0,
  groundClearanceInches: 8.7,
  wheelbaseInches: 108,
  operatingWeightLbs: 4300,
  gvwrLbs: 5000,
  remainingPayloadLbs: 450,
  classification: classification('compact_suv_crossover', 'Compact SUV / crossover', {
    wheelbase: 'medium',
    payloadProfile: 'light',
    trailManeuverability: 'balanced',
    clearanceBias: 'low',
  }),
}));

const wranglerVehicle = buildReadinessVehicleInputFromFleetState(vehicleState({
  id: 'wrangler',
  name: 'Jeep Wrangler Rubicon',
  make: 'Jeep',
  model: 'Wrangler',
  trim: 'Rubicon',
  vehicleType: 'suv',
  drivetrain: '4x4',
  tireSizeInches: 35,
  suspensionLiftInches: 2.5,
  groundClearanceInches: 11,
  wheelbaseInches: 96,
  operatingWeightLbs: 4700,
  gvwrLbs: 5800,
  remainingPayloadLbs: 900,
  accessories: ['winch'],
  loadoutItems: ['recovery boards'],
  classification: classification('short_wheelbase_4x4', 'Short-wheelbase 4x4', {
    wheelbase: 'short',
    payloadProfile: 'light',
    trailManeuverability: 'high',
    clearanceBias: 'high',
  }),
}));

const ramVehicle = buildReadinessVehicleInputFromFleetState(vehicleState({
  id: 'ram',
  name: 'Ram 3500',
  make: 'Ram',
  model: '3500',
  vehicleType: 'truck',
  drivetrain: '4x4',
  tireSizeInches: 33,
  suspensionLiftInches: 1,
  groundClearanceInches: 9,
  wheelbaseInches: 149,
  operatingWeightLbs: 9800,
  gvwrLbs: 11400,
  remainingPayloadLbs: 1600,
  accessories: ['winch'],
  classification: classification('full_size_hd_truck', 'Full-size HD truck', {
    wheelbase: 'long',
    payloadProfile: 'heavy',
    trailManeuverability: 'wide_or_long',
    clearanceBias: 'moderate',
  }),
}));

assert(outbackVehicle, 'Outback readiness vehicle should build.');
assert(wranglerVehicle, 'Wrangler readiness vehicle should build.');
assert(ramVehicle, 'Ram readiness vehicle should build.');
assert(outbackVehicle.keyConcerns.some((item) => /Compact crossover/i.test(item)), 'Outback should carry compact crossover concern.');
assert(wranglerVehicle.keyStrengths.some((item) => /Short wheelbase/i.test(item)), 'Wrangler should carry short wheelbase strength.');
assert(ramVehicle.keyConcerns.some((item) => /HD truck/i.test(item)), 'Ram HD truck should carry width/weight/turnaround concern.');

const outbackAssessment = buildExpeditionReadiness({ ...baseInput, activeVehicle: outbackVehicle });
const wranglerAssessment = buildExpeditionReadiness({ ...baseInput, activeVehicle: wranglerVehicle });
const ramAssessment = buildExpeditionReadiness({ ...baseInput, activeVehicle: ramVehicle });
const noVehicleAssessment = buildExpeditionReadiness({ ...baseInput, activeVehicle: null });

const outbackFit = outbackAssessment.categories.find((category) => category.id === 'vehicle_fit');
const wranglerFit = wranglerAssessment.categories.find((category) => category.id === 'vehicle_fit');
const ramFit = ramAssessment.categories.find((category) => category.id === 'vehicle_fit');
const noVehicleFit = noVehicleAssessment.categories.find((category) => category.id === 'vehicle_fit');

assert(outbackFit.score < wranglerFit.score, 'Stock Outback should score lower than built Wrangler on technical route.');
assert(ramAssessment.warnings.some((warning) => /width|weight|turnaround|class/i.test(warning.detail)), 'Ram should warn about size/weight/turnaround fit.');
assert(noVehicleFit.missingInputs.includes('Vehicle profile'), 'No active vehicle should degrade confidence with missing vehicle profile.');
assert(outbackFit.missingInputs.includes('recovery gear'), 'Hard route without visible recovery gear should ask for recovery gear.');
assert(wranglerFit.factors.some((factor) => factor.label === 'Recovery gear'), 'Visible recovery gear should be included as a factor.');

const exploreSource = read('lib', 'readiness', 'exploreRouteReadiness.ts');
assert.ok(exploreSource.includes('activeVehicle?: ExpeditionReadinessVehicleInput | null'), 'Explore route readiness should accept active Fleet vehicle input.');
assert.ok(exploreSource.includes('buildReadinessVehicleInputFromFleetState(getActiveVehicleState())'), 'Explore route readiness should derive vehicle input from active Fleet state.');
assert.ok(exploreSource.includes("if (score >= 60) return 'Caution';"), 'Explore vehicle fit label should use Strong/Caution/Limited language.');

const briefSource = read('components', 'brief', 'CommandBriefScreen.tsx');
assert.ok(briefSource.includes('VehicleFitBriefSection'), 'Command Brief should render a dedicated Vehicle Fit section.');
assert.ok(briefSource.includes('activeVehicleReadiness'), 'Command Brief should subscribe to active Fleet readiness input.');
assert.ok(briefSource.includes('Select vehicle for personalized readiness'), 'Command Brief should show no-vehicle personalized readiness copy.');

const storeSource = read('lib', 'readiness', 'expeditionReadinessStore.ts');
assert.ok(storeSource.includes('subscribeActiveVehicleState'), 'Readiness store should subscribe to active vehicle changes.');
assert.ok(storeSource.includes('buildReadinessVehicleInputFromFleetState'), 'Readiness store should build vehicle input from Fleet state.');

console.log('Fleet readiness personalization checks passed.');
