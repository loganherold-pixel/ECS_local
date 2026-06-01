import type { FleetLoadoutItem, FleetVehicle } from './fleetPremiumDomain';
import {
  buildFleetCompartmentLoadoutItem,
  type FleetBuildCompartment,
  type FleetBuildLoadoutState,
  type FleetCompartmentLoadoutItem,
} from './fleetBuildLoadout';

export type FleetChecklistCategory =
  | 'daily_driver'
  | 'work_truck'
  | 'towing'
  | 'offroad_recovery'
  | 'overland_travel'
  | 'winter'
  | 'family_personal'
  | 'emergency_readiness';

export type FleetChecklistItemStatus = 'have_it' | 'need_it' | 'not_needed' | 'not_sure';

export type FleetChecklistItemDefinition = {
  id: string;
  label: string;
  category: FleetChecklistCategory;
  reason: string;
  estimatedWeightLb: number;
  recommendedUseCases?: string[];
  recommendedVehicleTypes?: string[];
  recommendedAccessoryHints?: string[];
  recommendedSeasons?: string[];
  loadoutKeywords: string[];
};

export type FleetChecklistItemState = {
  status: FleetChecklistItemStatus;
  updatedAt: string;
  storageCompartmentId?: string | null;
  linkedLoadoutItemId?: string | null;
};

export type FleetChecklistState = {
  itemStates: Record<string, FleetChecklistItemState>;
  prepList: string[];
  suppressedItemIds: string[];
};

export type FleetChecklistRecommendation = FleetChecklistItemDefinition & {
  status: FleetChecklistItemStatus | 'recommended';
  isSuppressed: boolean;
};

export const FLEET_CHECKLIST_CATEGORIES: readonly { id: FleetChecklistCategory; label: string }[] = [
  { id: 'daily_driver', label: 'Daily driver' },
  { id: 'work_truck', label: 'Work truck' },
  { id: 'towing', label: 'Towing' },
  { id: 'offroad_recovery', label: 'Off-road / recovery' },
  { id: 'overland_travel', label: 'Overland / travel' },
  { id: 'winter', label: 'Winter' },
  { id: 'family_personal', label: 'Family / personal' },
  { id: 'emergency_readiness', label: 'Emergency readiness' },
] as const;

export const FLEET_CHECKLIST_ITEMS: readonly FleetChecklistItemDefinition[] = [
  {
    id: 'daily-first-aid',
    label: 'First aid kit',
    category: 'daily_driver',
    reason: 'A small kit covers daily incidents without turning Fleet setup into a medical inventory.',
    estimatedWeightLb: 5,
    recommendedUseCases: ['daily', 'family', 'work'],
    loadoutKeywords: ['first aid', 'trauma kit'],
  },
  {
    id: 'daily-jump-pack',
    label: 'Jump pack',
    category: 'daily_driver',
    reason: 'Useful for daily and work vehicles, especially when accessories add electrical load.',
    estimatedWeightLb: 4,
    recommendedUseCases: ['daily', 'work', 'emergency'],
    loadoutKeywords: ['jump pack', 'booster'],
  },
  {
    id: 'work-tool-bag',
    label: 'Primary tool bag',
    category: 'work_truck',
    reason: 'Work profiles usually need a known tool weight and storage location.',
    estimatedWeightLb: 45,
    recommendedUseCases: ['work'],
    loadoutKeywords: ['tool bag', 'tools'],
  },
  {
    id: 'towing-hitch-kit',
    label: 'Hitch pin, reducer, and ball mount kit',
    category: 'towing',
    reason: 'Towing profiles should account for hitch hardware before route and payload scoring.',
    estimatedWeightLb: 35,
    recommendedUseCases: ['towing'],
    recommendedVehicleTypes: ['truck', 'suv'],
    loadoutKeywords: ['hitch kit', 'ball mount', 'hitch pin'],
  },
  {
    id: 'towing-trailer-safety',
    label: 'Trailer safety chains and breakaway check',
    category: 'towing',
    reason: 'A low-pressure towing reminder that belongs in prep unless you choose to carry hardware.',
    estimatedWeightLb: 8,
    recommendedUseCases: ['towing'],
    loadoutKeywords: ['safety chain', 'breakaway'],
  },
  {
    id: 'recovery-strap',
    label: 'Recovery strap or kinetic rope',
    category: 'offroad_recovery',
    reason: 'Off-road and recovery use cases should know whether recovery gear is actually on board.',
    estimatedWeightLb: 12,
    recommendedUseCases: ['overland', 'emergency'],
    recommendedAccessoryHints: ['winch', 'recovery', 'rack'],
    loadoutKeywords: ['recovery strap', 'kinetic rope'],
  },
  {
    id: 'overland-water',
    label: 'Emergency water',
    category: 'overland_travel',
    reason: 'Travel and overland profiles benefit from explicit water weight instead of a vague readiness assumption.',
    estimatedWeightLb: 42,
    recommendedUseCases: ['overland', 'emergency', 'family'],
    loadoutKeywords: ['water', 'emergency water'],
  },
  {
    id: 'winter-chains',
    label: 'Snow chains or traction boards',
    category: 'winter',
    reason: 'Winter season or winter use case should prompt traction gear without making it required setup.',
    estimatedWeightLb: 28,
    recommendedUseCases: ['winter'],
    recommendedSeasons: ['winter'],
    loadoutKeywords: ['snow chains', 'traction boards'],
  },
  {
    id: 'family-go-bag',
    label: 'Family go-bag',
    category: 'family_personal',
    reason: 'Personal items matter for readiness but should stay separate from required vehicle setup.',
    estimatedWeightLb: 10,
    recommendedUseCases: ['family', 'daily'],
    loadoutKeywords: ['go-bag', 'family bag'],
  },
  {
    id: 'emergency-extinguisher',
    label: 'Fire extinguisher',
    category: 'emergency_readiness',
    reason: 'Emergency readiness benefits from a known extinguisher location and weight.',
    estimatedWeightLb: 5,
    recommendedUseCases: ['emergency', 'work', 'overland'],
    loadoutKeywords: ['fire extinguisher', 'extinguisher'],
  },
] as const;

export function normalizeFleetChecklistState(value: unknown): FleetChecklistState {
  const raw = value && typeof value === 'object' ? value as any : {};
  const itemStates = raw.itemStates && typeof raw.itemStates === 'object' ? raw.itemStates : {};
  return {
    itemStates: Object.fromEntries(
      Object.entries(itemStates).map(([id, item]) => {
        const state = item && typeof item === 'object' ? item as any : {};
        const status = ['have_it', 'need_it', 'not_needed', 'not_sure'].includes(state.status)
          ? state.status as FleetChecklistItemStatus
          : 'not_sure';
        return [id, {
          status,
          updatedAt: typeof state.updatedAt === 'string' ? state.updatedAt : new Date(0).toISOString(),
          storageCompartmentId: typeof state.storageCompartmentId === 'string' ? state.storageCompartmentId : null,
          linkedLoadoutItemId: typeof state.linkedLoadoutItemId === 'string' ? state.linkedLoadoutItemId : null,
        }];
      }),
    ),
    prepList: Array.isArray(raw.prepList) ? raw.prepList.map(String) : [],
    suppressedItemIds: Array.isArray(raw.suppressedItemIds) ? raw.suppressedItemIds.map(String) : [],
  };
}

export function readFleetChecklistState(vehicle: unknown): FleetChecklistState {
  const rawVehicle = vehicle && typeof vehicle === 'object' ? vehicle as any : {};
  return normalizeFleetChecklistState(rawVehicle.wizard_config?.fleet_checklist);
}

export function buildFleetChecklistRecommendations(input: {
  vehicle: FleetVehicle;
  useCases: readonly string[];
  season?: string | null;
  accessoryLabels?: readonly string[];
  loadoutItems?: readonly FleetLoadoutItem[];
  state?: FleetChecklistState | null;
}): FleetChecklistRecommendation[] {
  const state = normalizeFleetChecklistState(input.state);
  const useCases = new Set(input.useCases.map((item) => item.toLowerCase()));
  const season = (input.season ?? '').toLowerCase();
  const vehicleType = input.vehicle.vehicleType.toLowerCase();
  const accessoryText = (input.accessoryLabels ?? []).join(' ').toLowerCase();
  const loadoutText = (input.loadoutItems ?? []).map((item) => item.name).join(' ').toLowerCase();

  return FLEET_CHECKLIST_ITEMS.filter((item) => {
    const status = state.itemStates[item.id]?.status;
    if (status === 'not_needed' || state.suppressedItemIds.includes(item.id)) return false;
    if (item.loadoutKeywords.some((keyword) => loadoutText.includes(keyword))) return false;
    const useCaseMatch = item.recommendedUseCases?.some((useCase) => useCases.has(useCase)) ?? false;
    const vehicleMatch = item.recommendedVehicleTypes?.some((type) => vehicleType.includes(type)) ?? false;
    const accessoryMatch = item.recommendedAccessoryHints?.some((hint) => accessoryText.includes(hint)) ?? false;
    const seasonMatch = item.recommendedSeasons?.some((value) => value === season) ?? false;
    return useCaseMatch || vehicleMatch || accessoryMatch || seasonMatch;
  }).map((item) => ({
    ...item,
    status: state.itemStates[item.id]?.status ?? 'recommended',
    isSuppressed: false,
  }));
}

export function updateFleetChecklistItemStatus(
  state: FleetChecklistState,
  itemId: string,
  status: FleetChecklistItemStatus,
  options: {
    now?: string;
    storageCompartmentId?: string | null;
    linkedLoadoutItemId?: string | null;
  } = {},
): FleetChecklistState {
  const next = normalizeFleetChecklistState(state);
  const now = options.now ?? new Date().toISOString();
  const prepList = new Set(next.prepList);
  const suppressed = new Set(next.suppressedItemIds);

  if (status === 'need_it') prepList.add(itemId);
  else prepList.delete(itemId);

  if (status === 'not_needed') suppressed.add(itemId);
  else suppressed.delete(itemId);

  return {
    itemStates: {
      ...next.itemStates,
      [itemId]: {
        status,
        updatedAt: now,
        storageCompartmentId: options.storageCompartmentId ?? next.itemStates[itemId]?.storageCompartmentId ?? null,
        linkedLoadoutItemId: options.linkedLoadoutItemId ?? next.itemStates[itemId]?.linkedLoadoutItemId ?? null,
      },
    },
    prepList: Array.from(prepList),
    suppressedItemIds: Array.from(suppressed),
  };
}

export function createChecklistLinkedLoadoutItem(input: {
  vehicleId: string;
  recommendation: FleetChecklistItemDefinition;
  compartment: FleetBuildCompartment;
}): FleetCompartmentLoadoutItem {
  return buildFleetCompartmentLoadoutItem({
    vehicleId: input.vehicleId,
    name: input.recommendation.label,
    category: input.recommendation.category.replace(/_/g, ' '),
    typicalWeightLb: input.recommendation.estimatedWeightLb,
    quantity: 1,
    compartment: input.compartment,
    permanence: 'optional',
    source: 'ecs_default',
    confidence: 66,
    presetId: 'custom',
  });
}

export function addChecklistItemToLoadoutState(
  buildState: FleetBuildLoadoutState,
  item: FleetCompartmentLoadoutItem,
): FleetBuildLoadoutState {
  return {
    ...buildState,
    loadoutItems: [
      ...(buildState.loadoutItems ?? []).filter((existing) => existing.id !== item.id),
      item,
    ],
  };
}
