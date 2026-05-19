import {
  calculateFleetWeightResult,
  createFleetWeightValue,
  resolveVehicleWeightDefault,
  type FleetWeightValue,
} from './fleetPremiumDomain';

export type FleetVehicleProfileDraft = {
  nickname: string;
  year: string;
  make: string;
  model: string;
  trim: string;
  engine: string;
  drivetrain: string;
  cab: string;
  bed: string;
  vehicleType: string;
  baseNetWeight: string;
  gvwr: string;
  frontBaseWeight: string;
  rearBaseWeight: string;
  frontGawr: string;
  rearGawr: string;
};

export type FleetVehicleProfileSuggestion = {
  baseNetWeight: FleetWeightValue | null;
  gvwr: FleetWeightValue | null;
  confidenceExplanation: string;
};

export const FLEET_PROFILE_PRESETS = [
  {
    id: 'ram-2500-cummins-crew-4x4-short-bed',
    label: 'RAM 2500 Cummins Crew 4x4 Short Bed',
    draft: {
      make: 'RAM',
      model: '2500',
      engine: 'Cummins',
      drivetrain: '4x4',
      cab: 'Crew Cab',
      bed: 'Short Bed',
      vehicleType: 'truck',
    },
  },
  {
    id: 'ram-2500-cummins-crew-4x4-long-bed',
    label: 'RAM 2500 Cummins Crew 4x4 Long Bed',
    draft: {
      make: 'RAM',
      model: '2500',
      engine: 'Cummins',
      drivetrain: '4x4',
      cab: 'Crew Cab',
      bed: 'Long Bed',
      vehicleType: 'truck',
    },
  },
  {
    id: 'ram-2500-gas-crew-4x4',
    label: 'RAM 2500 Gas Crew 4x4',
    draft: {
      make: 'RAM',
      model: '2500',
      engine: 'Gas',
      drivetrain: '4x4',
      cab: 'Crew Cab',
      bed: '',
      vehicleType: 'truck',
    },
  },
] as const;

export function createEmptyFleetVehicleProfileDraft(): FleetVehicleProfileDraft {
  return {
    nickname: '',
    year: '',
    make: '',
    model: '',
    trim: '',
    engine: '',
    drivetrain: '',
    cab: '',
    bed: '',
    vehicleType: 'truck',
    baseNetWeight: '',
    gvwr: '',
    frontBaseWeight: '',
    rearBaseWeight: '',
    frontGawr: '',
    rearGawr: '',
  };
}

export function parseFleetProfileNumber(value: string): number | null {
  const parsed = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function resolveFleetVehicleProfileSuggestion(
  draft: FleetVehicleProfileDraft,
): FleetVehicleProfileSuggestion {
  const defaultMatch = resolveVehicleWeightDefault({
    make: draft.make,
    model: draft.model,
    vehicleType: draft.vehicleType,
    year: parseFleetProfileNumber(draft.year),
    trim: draft.trim,
    engine: draft.engine,
    drivetrain: draft.drivetrain,
    cab: draft.cab,
    bedLength: draft.bed,
  });
  return {
    baseNetWeight: defaultMatch?.netEmptyWeight ?? null,
    gvwr: defaultMatch?.gvwr ?? null,
    confidenceExplanation: defaultMatch
      ? 'ECS estimated this from vehicle configuration. Add verified specs or a scale ticket to improve confidence.'
      : 'Enter year, make, model, trim, engine, and drivetrain so ECS can suggest likely specs.',
  };
}

export function applyFleetProfilePreset(
  draft: FleetVehicleProfileDraft,
  presetId: string,
): FleetVehicleProfileDraft {
  const preset = FLEET_PROFILE_PRESETS.find((item) => item.id === presetId);
  if (!preset) return draft;
  const next = {
    ...draft,
    ...preset.draft,
    nickname: draft.nickname || preset.label,
  };
  const suggestion = resolveFleetVehicleProfileSuggestion(next);
  return {
    ...next,
    baseNetWeight: suggestion.baseNetWeight ? String(Math.round(suggestion.baseNetWeight.lbs)) : next.baseNetWeight,
    gvwr: suggestion.gvwr ? String(Math.round(suggestion.gvwr.lbs)) : next.gvwr,
  };
}

export function validateFleetVehicleProfileDraft(draft: FleetVehicleProfileDraft): string[] {
  const errors: string[] = [];
  const year = parseFleetProfileNumber(draft.year);
  const baseWeight = parseFleetProfileNumber(draft.baseNetWeight);
  const gvwr = parseFleetProfileNumber(draft.gvwr);
  const frontBase = parseFleetProfileNumber(draft.frontBaseWeight);
  const rearBase = parseFleetProfileNumber(draft.rearBaseWeight);
  const frontGawr = parseFleetProfileNumber(draft.frontGawr);
  const rearGawr = parseFleetProfileNumber(draft.rearGawr);

  if (!draft.nickname.trim()) errors.push('Nickname is required.');
  if (!draft.year.trim()) errors.push('Year is required.');
  else if (year == null) errors.push('Year must be numeric.');
  if (!draft.make.trim()) errors.push('Make is required.');
  if (!draft.model.trim()) errors.push('Model is required.');
  if (year != null && (year < 1900 || year > new Date().getFullYear() + 2)) {
    errors.push('Year is outside a possible vehicle range.');
  }
  if (baseWeight != null && (baseWeight < 1000 || baseWeight > 20000)) {
    errors.push('Base net weight is outside a possible vehicle range.');
  }
  if (gvwr != null && (gvwr < 1500 || gvwr > 30000)) {
    errors.push('GVWR is outside a possible vehicle range.');
  }
  if (baseWeight != null && gvwr != null && baseWeight >= gvwr) {
    errors.push('Base net weight must stay below GVWR.');
  }
  if (baseWeight != null && gvwr != null && gvwr - baseWeight > 10000) {
    errors.push('Payload capacity over 10,000 lb requires explicitly confirmed specs.');
  }
  if (frontBase != null && rearBase != null && baseWeight != null && frontBase + rearBase > baseWeight + 500) {
    errors.push('Front/rear base weights exceed the base net weight.');
  }
  if (frontGawr != null && frontBase != null && frontBase > frontGawr) {
    errors.push('Front base weight exceeds front GAWR.');
  }
  if (rearGawr != null && rearBase != null && rearBase > rearGawr) {
    errors.push('Rear base weight exceeds rear GAWR.');
  }
  return errors;
}

export function calculateConfirmedPayloadRemaining(draft: FleetVehicleProfileDraft): number | null {
  const baseNetWeight = parseFleetProfileNumber(draft.baseNetWeight);
  const gvwr = parseFleetProfileNumber(draft.gvwr);
  if (baseNetWeight == null || gvwr == null) return null;
  const result = calculateFleetWeightResult({
    id: 'draft',
    ownerUserId: 'draft',
    nickname: draft.nickname || 'Draft vehicle',
    vehicleType: draft.vehicleType || 'vehicle',
    buildProfile: {
      id: 'draft:build',
      vehicleId: 'draft',
      useCases: ['daily'],
      baseNetWeight: createFleetWeightValue(baseNetWeight, 'user_estimate'),
      gvwr: createFleetWeightValue(gvwr, 'user_estimate'),
      display: {
        iconKey: draft.vehicleType || 'vehicle',
        title: draft.nickname || 'Draft vehicle',
        chips: [draft.vehicleType || 'vehicle'],
      },
      updatedAt: new Date(0).toISOString(),
    },
    display: {
      iconKey: draft.vehicleType || 'vehicle',
      title: draft.nickname || 'Draft vehicle',
      chips: [draft.vehicleType || 'vehicle'],
    },
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  });
  return result.payloadRemaining?.lbs ?? null;
}
