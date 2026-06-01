import {
  calculateFleetWeightResult,
  createFleetWeightValue,
  resolveVehicleWeightDefault,
  type FleetWeightValue,
} from './fleetPremiumDomain';
import {
  resolveFleetOemSpecReference,
  type FleetOemSpecMatch,
  type FleetOemVehicleSpecReference,
} from './oemVehicleSpecs';

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
  oemReference: FleetOemVehicleSpecReference | null;
  oemMatchStatus: FleetOemSpecMatch['status'];
  oemMessage: string;
  confidenceExplanation: string;
};

export type FleetVehicleProfilePrefillOption = {
  id: string;
  label: string;
  detail: string;
  draft: Pick<FleetVehicleProfileDraft, 'trim' | 'engine' | 'drivetrain' | 'cab' | 'bed' | 'vehicleType'>;
};

type FleetVehicleProfileVariantTemplate = {
  id: string;
  make: string;
  model: string;
  yearStart: number;
  yearEnd?: number | null;
  label: string;
  detail: string;
  draft: FleetVehicleProfilePrefillOption['draft'];
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
    id: 'honda-passport-trailsport-awd',
    label: 'Honda Passport TrailSport AWD',
    draft: {
      make: 'Honda',
      model: 'Passport',
      engine: 'Gas',
      drivetrain: 'AWD',
      cab: '',
      bed: '',
      vehicleType: 'suv',
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

const FLEET_PROFILE_VARIANT_TEMPLATES: readonly FleetVehicleProfileVariantTemplate[] = [
  {
    id: 'honda-passport-ex-l-awd',
    make: 'honda',
    model: 'passport',
    yearStart: 2019,
    yearEnd: new Date().getFullYear() + 1,
    label: 'EX-L AWD',
    detail: 'Passport SUV with gas V6 and AWD configuration.',
    draft: {
      trim: 'EX-L',
      engine: 'Gas V6',
      drivetrain: 'AWD',
      cab: '',
      bed: '',
      vehicleType: 'suv',
    },
  },
  {
    id: 'honda-passport-trailsport-awd',
    make: 'honda',
    model: 'passport',
    yearStart: 2022,
    yearEnd: new Date().getFullYear() + 1,
    label: 'TrailSport AWD',
    detail: 'Passport trail-oriented trim with gas V6 and AWD.',
    draft: {
      trim: 'TrailSport',
      engine: 'Gas V6',
      drivetrain: 'AWD',
      cab: '',
      bed: '',
      vehicleType: 'suv',
    },
  },
  {
    id: 'honda-passport-elite-awd',
    make: 'honda',
    model: 'passport',
    yearStart: 2019,
    yearEnd: new Date().getFullYear() + 1,
    label: 'Elite AWD',
    detail: 'Passport premium SUV trim with gas V6 and AWD.',
    draft: {
      trim: 'Elite',
      engine: 'Gas V6',
      drivetrain: 'AWD',
      cab: '',
      bed: '',
      vehicleType: 'suv',
    },
  },
  {
    id: 'ram-2500-cummins-crew-4x4-short-bed',
    make: 'ram',
    model: '2500',
    yearStart: 2010,
    yearEnd: new Date().getFullYear() + 1,
    label: 'Cummins Crew 4x4 Short Bed',
    detail: 'HD truck configuration with diesel, crew cab, 4x4, and short bed.',
    draft: {
      trim: '',
      engine: 'Cummins',
      drivetrain: '4x4',
      cab: 'Crew Cab',
      bed: 'Short Bed',
      vehicleType: 'truck',
    },
  },
  {
    id: 'ram-2500-cummins-crew-4x4-long-bed',
    make: 'ram',
    model: '2500',
    yearStart: 2010,
    yearEnd: new Date().getFullYear() + 1,
    label: 'Cummins Crew 4x4 Long Bed',
    detail: 'HD truck configuration with diesel, crew cab, 4x4, and long bed.',
    draft: {
      trim: '',
      engine: 'Cummins',
      drivetrain: '4x4',
      cab: 'Crew Cab',
      bed: 'Long Bed',
      vehicleType: 'truck',
    },
  },
  {
    id: 'ram-2500-gas-crew-4x4',
    make: 'ram',
    model: '2500',
    yearStart: 2010,
    yearEnd: new Date().getFullYear() + 1,
    label: 'Gas Crew 4x4',
    detail: 'HD truck configuration with gas engine, crew cab, and 4x4.',
    draft: {
      trim: '',
      engine: 'Gas',
      drivetrain: '4x4',
      cab: 'Crew Cab',
      bed: '',
      vehicleType: 'truck',
    },
  },
];

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

function normalizeFleetProfileText(value: string | number | null | undefined): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCaseProfileText(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function templateMatchesDraft(template: FleetVehicleProfileVariantTemplate, draft: FleetVehicleProfileDraft, year: number): boolean {
  const make = normalizeFleetProfileText(draft.make);
  const model = normalizeFleetProfileText(draft.model);
  if (make !== normalizeFleetProfileText(template.make)) return false;
  if (model !== normalizeFleetProfileText(template.model)) return false;
  if (year < template.yearStart) return false;
  if (template.yearEnd != null && year > template.yearEnd) return false;
  return true;
}

function buildGenericPrefillOptions(
  draft: FleetVehicleProfileDraft,
  vehicleType: string,
): FleetVehicleProfilePrefillOption[] {
  const make = titleCaseProfileText(draft.make);
  const model = titleCaseProfileText(draft.model);
  const normalizedType = normalizeFleetProfileText(vehicleType);
  const isTruck = normalizedType.includes('truck') || normalizedType.includes('pickup');
  const isVan = normalizedType.includes('van');
  const isCrossover = normalizedType.includes('crossover') || normalizedType.includes('wagon');
  const engine = draft.engine.trim() || 'Gas';
  const drivetrain = draft.drivetrain.trim() || (isTruck ? '4x4' : 'AWD');
  const vehicleTypeDraft = vehicleType || (isTruck ? 'truck' : isVan ? 'van' : isCrossover ? 'crossover' : 'suv');
  const bodyLabel = isTruck ? 'truck' : isVan ? 'van' : isCrossover ? 'crossover' : 'SUV';

  return [
    {
      id: 'oem-standard',
      label: `${make} ${model} Standard ${drivetrain}`,
      detail: `Likely ${bodyLabel} configuration for OEM reference matching.`,
      draft: {
        trim: draft.trim.trim(),
        engine,
        drivetrain,
        cab: isTruck ? draft.cab.trim() || 'Crew Cab' : '',
        bed: isTruck ? draft.bed.trim() : '',
        vehicleType: vehicleTypeDraft,
      },
    },
    {
      id: 'oem-trail',
      label: `${make} ${model} Trail / Off-Road`,
      detail: `Trail-oriented ${bodyLabel} prefill when the exact trim is still unknown.`,
      draft: {
        trim: draft.trim.trim() || (isTruck ? 'Off-Road' : 'Trail'),
        engine,
        drivetrain,
        cab: isTruck ? draft.cab.trim() || 'Crew Cab' : '',
        bed: isTruck ? draft.bed.trim() || 'Short Bed' : '',
        vehicleType: vehicleTypeDraft,
      },
    },
    {
      id: 'oem-premium',
      label: `${make} ${model} Premium / Touring`,
      detail: `Premium trim prefill; confirm exact trim and placard values before final payload decisions.`,
      draft: {
        trim: draft.trim.trim() || (isTruck ? 'Premium' : 'Touring'),
        engine,
        drivetrain,
        cab: isTruck ? draft.cab.trim() || 'Crew Cab' : '',
        bed: isTruck ? draft.bed.trim() || 'Long Bed' : '',
        vehicleType: vehicleTypeDraft,
      },
    },
  ];
}

export function resolveFleetVehicleProfileSuggestion(
  draft: FleetVehicleProfileDraft,
): FleetVehicleProfileSuggestion {
  const year = parseFleetProfileNumber(draft.year);
  const defaultMatch = resolveVehicleWeightDefault({
    make: draft.make,
    model: draft.model,
    vehicleType: draft.vehicleType,
    year,
    trim: draft.trim,
    engine: draft.engine,
    drivetrain: draft.drivetrain,
    cab: draft.cab,
    bedLength: draft.bed,
  });
  const oemMatch = resolveFleetOemSpecReference({
    make: draft.make,
    model: draft.model,
    year,
    trim: draft.trim,
    vehicleType: draft.vehicleType,
  });

  if (defaultMatch?.confidenceTier === 'exact_build_match') {
    return {
      baseNetWeight: defaultMatch.netEmptyWeight,
      gvwr: defaultMatch.gvwr ?? null,
      oemReference: oemMatch.status === 'matched' ? oemMatch.reference : null,
      oemMatchStatus: oemMatch.status,
      oemMessage: oemMatch.message,
      confidenceExplanation: 'ECS estimated this from vehicle configuration. Enter saved base weight and GVWR values to replace generic defaults.',
    };
  }

  if (oemMatch.status === 'matched') {
    const reference = oemMatch.reference;
    const sourceLabel = `${reference.label} (${reference.yearStart}${reference.yearEnd ? `-${reference.yearEnd}` : '+'})`;
    return {
      baseNetWeight: createFleetWeightValue(reference.specs.base_weight_lb, 'manufacturer_spec', {
        confidence: reference.confidence,
        sourceLabel: `${sourceLabel} base weight reference`,
      }),
      gvwr: createFleetWeightValue(reference.specs.gvwr_lb, 'manufacturer_spec', {
        confidence: reference.confidence,
        sourceLabel: `${sourceLabel} GVWR reference`,
      }),
      oemReference: reference,
      oemMatchStatus: oemMatch.status,
      oemMessage: oemMatch.message,
      confidenceExplanation: `${oemMatch.message} Manual entries and saved placard values still override this reference.`,
    };
  }

  return {
    baseNetWeight: defaultMatch?.netEmptyWeight ?? null,
    gvwr: defaultMatch?.gvwr ?? null,
    oemReference: null,
    oemMatchStatus: oemMatch.status,
    oemMessage: oemMatch.message,
    confidenceExplanation: defaultMatch
      ? `ECS estimated this from vehicle configuration. Enter saved base weight and GVWR values to replace generic defaults. ${oemMatch.message}`
      : oemMatch.message,
  };
}

export function resolveFleetVehicleProfilePrefillOptions(
  draft: FleetVehicleProfileDraft,
): FleetVehicleProfilePrefillOption[] {
  const year = parseFleetProfileNumber(draft.year);
  if (year == null || !draft.make.trim() || !draft.model.trim()) return [];

  const templates = FLEET_PROFILE_VARIANT_TEMPLATES
    .filter((template) => templateMatchesDraft(template, draft, year))
    .slice(0, 3)
    .map((template) => ({
      id: template.id,
      label: `${draft.year.trim()} ${titleCaseProfileText(draft.make)} ${titleCaseProfileText(draft.model)} ${template.label}`.trim(),
      detail: template.detail,
      draft: template.draft,
    }));
  if (templates.length >= 3) return templates;

  const oemMatch = resolveFleetOemSpecReference({
    make: draft.make,
    model: draft.model,
    year,
    trim: draft.trim,
    vehicleType: draft.vehicleType,
  });
  if (oemMatch.status !== 'matched') return templates;

  const generic = buildGenericPrefillOptions(draft, oemMatch.reference.vehicleType)
    .filter((option) => {
      const optionTrim = normalizeFleetProfileText(option.draft.trim);
      if (!optionTrim) return true;
      return !templates.some((template) => normalizeFleetProfileText(template.label).includes(optionTrim));
    })
    .slice(0, 3 - templates.length);
  return [...templates, ...generic];
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

export function applyFleetProfilePrefillOption(
  draft: FleetVehicleProfileDraft,
  optionId: string,
): FleetVehicleProfileDraft {
  const option = resolveFleetVehicleProfilePrefillOptions(draft).find((item) => item.id === optionId);
  if (!option) return draft;
  const next = {
    ...draft,
    ...option.draft,
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
