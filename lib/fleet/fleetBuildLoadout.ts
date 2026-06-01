import {
  FLEET_LOAD_ZONES,
  calculateFleetWeightResult,
  createFleetWeightValue,
  toFleetLoadZone,
  type FleetAccessoryInstall,
  type FleetCompartment,
  type FleetDisplayMetadata,
  type FleetLoadZone,
  type FleetScoringResult,
  type FleetVehicle,
  type FleetWeightResult,
  type FleetWeightSource,
} from './fleetPremiumDomain';

export type FleetAccessoryId =
  | 'roof_rack_platform'
  | 'cab_rack'
  | 'bed_rack'
  | 'truck_cap_smartcap'
  | 'bed_drawers_storage'
  | 'toolbox'
  | 'front_bumper'
  | 'rear_bumper'
  | 'winch'
  | 'aux_fuel_water_tank'
  | 'ladder_rack'
  | 'service_body_work_body'
  | 'recovery_gear_mounts'
  | 'custom_accessory';

export type FleetAccessoryKnowledgeMode =
  | 'known_brand_model'
  | 'estimate'
  | 'manual_weight'
  | 'unsure';

export type FleetAccessoryPermanence = 'temporary' | 'seasonal' | 'permanent';

export type FleetAccessoryScoringEffect =
  | 'payload'
  | 'front_axle'
  | 'rear_axle'
  | 'top_heavy'
  | 'aero'
  | 'maintenance'
  | 'recovery';

export type FleetCompartmentStatus = 'active' | 'removed';
export type FleetPlacementStatus = 'assigned' | 'unassigned' | 'fallback';

export type FleetPlacementMetadata = {
  x: number;
  y: number;
  z: number;
  source: 'fleet_load_zone' | 'compartment_name' | 'default_unassigned';
  status: FleetPlacementStatus;
};

export type FleetBuildCompartment = FleetCompartment & {
  accessoryId: FleetAccessoryId;
  status: FleetCompartmentStatus;
  placement: FleetPlacementMetadata;
};

export type FleetBuildAccessoryInstall = {
  id: string;
  accessoryId: FleetAccessoryId;
  name: string;
  brandModel?: string | null;
  installedWeightLb: number;
  affectsPayload?: boolean;
  mountZone: FleetLoadZone;
  permanence: FleetAccessoryPermanence;
  source: FleetWeightSource;
  confidence: number;
  knowledgeMode: FleetAccessoryKnowledgeMode;
  scoringEffects: FleetAccessoryScoringEffect[];
};

export type FleetBuildLoadoutState = {
  accessories: FleetBuildAccessoryInstall[];
  compartments: FleetBuildCompartment[];
  loadoutItems?: FleetCompartmentLoadoutItem[];
  activePreset?: FleetLoadoutPresetId;
  acknowledgedRiskIds?: string[];
};

export type FleetCompartmentGroupId =
  | 'cab'
  | 'bed_floor'
  | 'bed_high_cap'
  | 'drawers'
  | 'roof'
  | 'hitch_trailer'
  | 'custom';

export type FleetLoadoutPermanence =
  | 'always'
  | 'daily'
  | 'work_day'
  | 'trip'
  | 'seasonal'
  | 'optional';

export type FleetLoadoutPresetId =
  | 'empty'
  | 'daily'
  | 'work'
  | 'towing'
  | 'overland'
  | 'emergency'
  | 'winter'
  | 'custom';

export type FleetCompartmentLoadoutItem = {
  id: string;
  name: string;
  category: string;
  typicalWeightLb: number;
  quantity: number;
  compartmentId: string;
  loadZone: FleetLoadZone;
  permanence: FleetLoadoutPermanence;
  source: FleetWeightSource;
  confidence: number;
  presetId?: FleetLoadoutPresetId | null;
  placement: FleetPlacementMetadata;
};

export type FleetLoadoutZoneWeightInput = {
  zoneId: string;
  zoneName: string;
  weightLbs: number;
  posX?: number;
  posY?: number;
  posZ?: number;
};

export type FleetCompartmentLoadoutDraftValidationInput = {
  name: unknown;
  typicalWeightLb: unknown;
  quantity?: unknown;
  compartmentId: unknown;
  loadZone?: unknown;
  activeCompartments?: readonly FleetBuildCompartment[];
};

export type FleetCompartmentGroup = {
  id: FleetCompartmentGroupId;
  label: string;
  zones: FleetLoadZone[];
  compartments: FleetBuildCompartment[];
};

export type FleetAccessoryCatalogItem = {
  id: FleetAccessoryId;
  label: string;
  icon: string;
  defaultWeightLb: number;
  affectsPayload?: boolean;
  mountZone: FleetLoadZone;
  permanence: FleetAccessoryPermanence;
  scoringEffects: FleetAccessoryScoringEffect[];
  defaultCompartments: Array<{
    id: string;
    name: string;
    loadZone: FleetLoadZone;
  }>;
};

export const FLEET_ACCESSORY_KNOWLEDGE_OPTIONS: Array<{
  id: FleetAccessoryKnowledgeMode;
  label: string;
}> = [
  { id: 'known_brand_model', label: 'I know brand/model' },
  { id: 'estimate', label: 'Estimate it for me' },
  { id: 'manual_weight', label: 'Enter weight manually' },
  { id: 'unsure', label: "I'm not sure" },
];

export const FLEET_BUILD_LOADOUT_HIGH_MOUNTED_RISK_ACK_ID = 'high-mounted-load-risk';

export const FLEET_ACCESSORY_CATALOG: readonly FleetAccessoryCatalogItem[] = [
  { id: 'roof_rack_platform', label: 'Roof Rack / Platform', icon: 'grid-outline', defaultWeightLb: 85, mountZone: 'roof', permanence: 'permanent', scoringEffects: ['payload', 'top_heavy', 'aero', 'maintenance'], defaultCompartments: [{ id: 'roof_platform', name: 'Roof Platform', loadZone: 'roof' }] },
  { id: 'cab_rack', label: 'Cab Rack', icon: 'car-sport-outline', defaultWeightLb: 85, affectsPayload: false, mountZone: 'cab', permanence: 'permanent', scoringEffects: ['front_axle', 'top_heavy', 'aero'], defaultCompartments: [{ id: 'cab_rack_zone', name: 'Cab Rack Zone', loadZone: 'cab' }] },
  { id: 'bed_rack', label: 'Bed Rack', icon: 'layers-outline', defaultWeightLb: 125, mountZone: 'bedHigh', permanence: 'permanent', scoringEffects: ['payload', 'rear_axle', 'top_heavy', 'aero'], defaultCompartments: [{ id: 'bed_rack_deck', name: 'Bed Rack Deck', loadZone: 'bedHigh' }] },
  { id: 'truck_cap_smartcap', label: 'Truck Cap / SmartCap', icon: 'archive-outline', defaultWeightLb: 213, mountZone: 'bedHigh', permanence: 'permanent', scoringEffects: ['payload', 'rear_axle', 'top_heavy', 'aero', 'maintenance'], defaultCompartments: [
    { id: 'side_bin_driver', name: 'Driver Side Bin', loadZone: 'bedLow' },
    { id: 'side_bin_passenger', name: 'Passenger Side Bin', loadZone: 'bedLow' },
    { id: 'cap_roof', name: 'Cap Roof Zone', loadZone: 'bedHigh' },
    { id: 'enclosed_bed', name: 'Enclosed Bed', loadZone: 'bedLow' },
  ] },
  { id: 'bed_drawers_storage', label: 'Bed Drawers / Storage System', icon: 'file-tray-full-outline', defaultWeightLb: 180, mountZone: 'bedLow', permanence: 'permanent', scoringEffects: ['payload', 'rear_axle', 'maintenance'], defaultCompartments: [
    { id: 'driver_drawer', name: 'Driver Drawer', loadZone: 'bedLow' },
    { id: 'passenger_drawer', name: 'Passenger Drawer', loadZone: 'bedLow' },
    { id: 'deck_surface', name: 'Deck Surface', loadZone: 'bedHigh' },
  ] },
  { id: 'toolbox', label: 'Toolbox', icon: 'hammer-outline', defaultWeightLb: 95, mountZone: 'bedLow', permanence: 'permanent', scoringEffects: ['payload', 'rear_axle', 'maintenance'], defaultCompartments: [{ id: 'toolbox_main', name: 'Toolbox', loadZone: 'bedLow' }] },
  { id: 'front_bumper', label: 'Front Bumper', icon: 'shield-checkmark-outline', defaultWeightLb: 155, mountZone: 'frontLow', permanence: 'permanent', scoringEffects: ['payload', 'front_axle', 'maintenance'], defaultCompartments: [] },
  { id: 'rear_bumper', label: 'Rear Bumper', icon: 'shield-checkmark-outline', defaultWeightLb: 145, mountZone: 'rearLow', permanence: 'permanent', scoringEffects: ['payload', 'rear_axle', 'maintenance', 'recovery'], defaultCompartments: [] },
  { id: 'winch', label: 'Winch', icon: 'link-outline', defaultWeightLb: 85, mountZone: 'frontLow', permanence: 'permanent', scoringEffects: ['payload', 'front_axle', 'maintenance', 'recovery'], defaultCompartments: [] },
  { id: 'aux_fuel_water_tank', label: 'Auxiliary Fuel / Water Tank', icon: 'water-outline', defaultWeightLb: 120, mountZone: 'bedLow', permanence: 'seasonal', scoringEffects: ['payload', 'rear_axle', 'maintenance'], defaultCompartments: [{ id: 'aux_tank_zone', name: 'Aux Tank Zone', loadZone: 'bedLow' }] },
  { id: 'ladder_rack', label: 'Ladder Rack', icon: 'albums-outline', defaultWeightLb: 110, mountZone: 'bedHigh', permanence: 'permanent', scoringEffects: ['payload', 'rear_axle', 'top_heavy', 'aero'], defaultCompartments: [{ id: 'ladder_rack_zone', name: 'Ladder Rack Zone', loadZone: 'bedHigh' }] },
  { id: 'service_body_work_body', label: 'Service Body / Work Body', icon: 'business-outline', defaultWeightLb: 850, mountZone: 'rearLow', permanence: 'permanent', scoringEffects: ['payload', 'rear_axle', 'maintenance'], defaultCompartments: [{ id: 'service_body_bins', name: 'Service Body Bins', loadZone: 'rearLow' }, { id: 'work_body_deck', name: 'Work Body Deck', loadZone: 'bedHigh' }] },
  { id: 'recovery_gear_mounts', label: 'Recovery Gear Mounts', icon: 'construct-outline', defaultWeightLb: 65, mountZone: 'hitch', permanence: 'permanent', scoringEffects: ['payload', 'rear_axle', 'recovery'], defaultCompartments: [{ id: 'recovery_mount_zone', name: 'Recovery Mount Zone', loadZone: 'hitch' }] },
  { id: 'custom_accessory', label: 'Custom Accessory', icon: 'cube-outline', defaultWeightLb: 50, mountZone: 'rearLow', permanence: 'seasonal', scoringEffects: ['payload'], defaultCompartments: [{ id: 'custom_compartment', name: 'Custom Compartment', loadZone: 'rearLow' }] },
] as const;

export const FLEET_LOADOUT_PRESETS: readonly { id: FleetLoadoutPresetId; label: string }[] = [
  { id: 'empty', label: 'Empty' },
  { id: 'daily', label: 'Daily' },
  { id: 'work', label: 'Work' },
  { id: 'towing', label: 'Towing' },
  { id: 'overland', label: 'Overland' },
  { id: 'emergency', label: 'Emergency' },
  { id: 'winter', label: 'Winter' },
  { id: 'custom', label: 'Custom' },
];

function parseDraftNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const parsed = Number(value.replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export function validateFleetCompartmentLoadoutDraft(
  input: FleetCompartmentLoadoutDraftValidationInput,
): string[] {
  const errors: string[] = [];
  if (typeof input.name !== 'string' || input.name.trim().length === 0) {
    errors.push('Item name is required');
  }
  const weight = parseDraftNumber(input.typicalWeightLb);
  if (weight == null || weight < 0) {
    errors.push('Item weight must be numeric and non-negative');
  }
  const quantity = input.quantity == null || input.quantity === '' ? 1 : parseDraftNumber(input.quantity);
  if (quantity == null || quantity <= 0) {
    errors.push('Quantity must be positive');
  }
  const compartmentId = typeof input.compartmentId === 'string' ? input.compartmentId : '';
  const activeCompartments = input.activeCompartments ?? [];
  if (!compartmentId || (activeCompartments.length > 0 && !activeCompartments.some((item) => item.id === compartmentId && item.status !== 'removed'))) {
    errors.push('Choose a valid compartment');
  }
  if (
    input.loadZone != null &&
    input.loadZone !== '' &&
    !(FLEET_LOAD_ZONES as readonly string[]).includes(String(input.loadZone))
  ) {
    errors.push('Choose a valid vehicle location');
  }
  return errors;
}

const FLEET_LOAD_ZONE_PLACEMENT: Record<FleetLoadZone, Omit<FleetPlacementMetadata, 'source' | 'status'>> = {
  frontLow: { x: 0.26, y: 0.50, z: 0.20 },
  rearLow: { x: 0.78, y: 0.50, z: 0.22 },
  bedLow: { x: 0.70, y: 0.50, z: 0.25 },
  bedHigh: { x: 0.70, y: 0.50, z: 0.62 },
  roof: { x: 0.48, y: 0.50, z: 0.86 },
  cab: { x: 0.36, y: 0.50, z: 0.42 },
  underbody: { x: 0.50, y: 0.50, z: 0.16 },
  hitch: { x: 0.94, y: 0.50, z: 0.22 },
  trailer: { x: 0.98, y: 0.50, z: 0.32 },
};

function placementFromDescriptor(loadZone: FleetLoadZone, descriptor: string, status: FleetPlacementStatus): FleetPlacementMetadata {
  const base = FLEET_LOAD_ZONE_PLACEMENT[loadZone] ?? FLEET_LOAD_ZONE_PLACEMENT.rearLow;
  const normalized = descriptor.toLowerCase();
  const y =
    /\b(driver|left|lhs)\b/.test(normalized)
      ? 0.28
      : /\b(passenger|right|rhs)\b/.test(normalized)
        ? 0.72
        : base.y;
  return {
    ...base,
    y,
    source: status === 'unassigned' ? 'default_unassigned' : y !== base.y ? 'compartment_name' : 'fleet_load_zone',
    status,
  };
}

function normalizePlacement(value: unknown, loadZone: FleetLoadZone, descriptor: string, status: FleetPlacementStatus): FleetPlacementMetadata {
  if (!value || typeof value !== 'object') {
    return placementFromDescriptor(loadZone, descriptor, status);
  }
  const placement = value as Partial<FleetPlacementMetadata>;
  const fallback = placementFromDescriptor(loadZone, descriptor, status);
  return {
    x: Number.isFinite(placement.x) ? Math.max(0, Math.min(1, Number(placement.x))) : fallback.x,
    y: Number.isFinite(placement.y) ? Math.max(0, Math.min(1, Number(placement.y))) : fallback.y,
    z: Number.isFinite(placement.z) ? Math.max(0, Math.min(1, Number(placement.z))) : fallback.z,
    source: placement.source ?? fallback.source,
    status: placement.status ?? fallback.status,
  };
}

function normalizeWeightSource(value: unknown, fallback: FleetWeightSource = 'user_estimate'): FleetWeightSource {
  return [
    'scale_ticket',
    'vin_oem_match',
    'manufacturer_spec',
    'exact_build_match',
    'ecs_default',
    'user_estimate',
    'calculated',
    'unknown',
  ].includes(String(value))
    ? value as FleetWeightSource
    : fallback;
}

function normalizeAccessoryPermanence(value: unknown, fallback: FleetAccessoryPermanence): FleetAccessoryPermanence {
  return value === 'temporary' || value === 'seasonal' || value === 'permanent' ? value : fallback;
}

function normalizeLoadoutPermanence(value: unknown): FleetLoadoutPermanence {
  return ['always', 'daily', 'work_day', 'trip', 'seasonal', 'optional'].includes(String(value))
    ? value as FleetLoadoutPermanence
    : 'trip';
}

function normalizeLoadoutPreset(value: unknown): FleetLoadoutPresetId {
  return FLEET_LOADOUT_PRESETS.some((preset) => preset.id === value) ? value as FleetLoadoutPresetId : 'empty';
}

export function createEmptyFleetBuildLoadoutState(): FleetBuildLoadoutState {
  return { accessories: [], compartments: [], loadoutItems: [], activePreset: 'empty', acknowledgedRiskIds: [] };
}

export function normalizeFleetBuildLoadoutState(raw: unknown): FleetBuildLoadoutState {
  if (!raw || typeof raw !== 'object') return createEmptyFleetBuildLoadoutState();
  const value = raw as Partial<FleetBuildLoadoutState>;
  const compartments: FleetBuildCompartment[] = Array.isArray(value.compartments)
    ? value.compartments
        .filter((item): item is FleetBuildCompartment => Boolean(item && typeof item.id === 'string'))
        .map((item) => {
          const loadZone = toFleetLoadZone(item.loadZone, 'rearLow');
          const status = item.status === 'removed' ? 'removed' : 'active';
          return {
            ...item,
            loadZone,
            status,
            placement: normalizePlacement(item.placement, loadZone, `${item.name} ${item.id}`, status === 'active' ? 'assigned' : 'fallback'),
          };
        })
    : [];
  const accessories = Array.isArray(value.accessories)
    ? value.accessories
        .filter((item): item is FleetBuildAccessoryInstall => Boolean(item && typeof item.id === 'string'))
        .map((item) => {
          const catalog = getFleetAccessoryCatalogItem(item.accessoryId);
          const knowledgeMode: FleetAccessoryKnowledgeMode =
            item.knowledgeMode === 'known_brand_model' ||
            item.knowledgeMode === 'manual_weight' ||
            item.knowledgeMode === 'unsure' ||
            item.knowledgeMode === 'estimate'
              ? item.knowledgeMode
              : 'estimate';
          const installedWeight = Number(item.installedWeightLb);
          return {
            ...item,
            accessoryId: catalog.id,
            name: typeof item.name === 'string' && item.name.trim() ? item.name : catalog.label,
            brandModel: item.brandModel ?? null,
            affectsPayload: item.affectsPayload ?? (catalog.affectsPayload !== false),
            mountZone: toFleetLoadZone(item.mountZone, catalog.mountZone),
            permanence: normalizeAccessoryPermanence(item.permanence, catalog.permanence),
            installedWeightLb: Number.isFinite(installedWeight) ? Math.max(0, installedWeight) : catalog.defaultWeightLb,
            confidence: Math.max(0, Math.min(100, Number(item.confidence) || confidenceForMode(knowledgeMode))),
            knowledgeMode,
            source: normalizeWeightSource(item.source, sourceForMode(knowledgeMode)),
            scoringEffects: Array.isArray(item.scoringEffects) && item.scoringEffects.length > 0
              ? item.scoringEffects.filter((effect): effect is FleetAccessoryScoringEffect =>
                  ['payload', 'front_axle', 'rear_axle', 'top_heavy', 'aero', 'maintenance', 'recovery'].includes(effect),
                )
              : [...catalog.scoringEffects],
          };
        })
    : [];
  const accessoryById = new Map(accessories.map((item) => [item.id, item]));
  const compartmentsWithAccessoryLocations = compartments.map((item) => {
    const accessory = accessoryById.get(item.accessoryInstallId ?? '');
    if (item.accessoryId !== 'custom_accessory' || !accessory) return item;
    return {
      ...item,
      loadZone: accessory.mountZone,
      display: {
        ...item.display,
        classLabel: 'custom placement',
        chips: [],
      },
      placement: placementFromDescriptor(accessory.mountZone, `${item.name} ${item.id}`, 'assigned'),
    };
  });
  const knownCompartmentIds = new Set(compartmentsWithAccessoryLocations.map((item) => item.id));
  const backfilledCompartments = accessories.flatMap((accessory) =>
    generateFleetAccessoryCompartments(accessory).filter((item) => !knownCompartmentIds.has(item.id)),
  );
  const normalizedCompartments = [...compartmentsWithAccessoryLocations, ...backfilledCompartments];
  const activeCompartmentById = new Map(normalizedCompartments.filter((item) => item.status !== 'removed').map((item) => [item.id, item]));
  return {
    accessories,
    compartments: normalizedCompartments,
    loadoutItems: Array.isArray(value.loadoutItems)
      ? value.loadoutItems
          .filter((item): item is FleetCompartmentLoadoutItem => Boolean(item && typeof item.id === 'string'))
          .map((item) => {
            const compartment = activeCompartmentById.get(item.compartmentId);
            const placementStatus: FleetPlacementStatus = compartment ? 'assigned' : item.compartmentId ? 'fallback' : 'unassigned';
            const loadZone = toFleetLoadZone(item.loadZone, compartment?.loadZone ?? 'rearLow');
            const itemName = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : 'Custom item';
            return {
              ...item,
              name: itemName,
              category: typeof item.category === 'string' && item.category.trim() ? item.category : 'custom',
              typicalWeightLb: Math.max(0, Number(item.typicalWeightLb) || 0),
              quantity: Math.max(1, Number(item.quantity) || 1),
              compartmentId: compartment?.id ?? item.compartmentId ?? 'unassigned',
              loadZone,
              confidence: Math.max(0, Math.min(100, Number(item.confidence) || 0)),
              source: normalizeWeightSource(item.source),
              permanence: normalizeLoadoutPermanence(item.permanence),
              presetId: normalizeLoadoutPreset(item.presetId) === 'empty' ? 'custom' : normalizeLoadoutPreset(item.presetId),
              placement: normalizePlacement(item.placement, loadZone, `${itemName} ${compartment?.name ?? item.compartmentId ?? ''}`, placementStatus),
            };
          })
      : [],
    activePreset: normalizeLoadoutPreset(value.activePreset),
    acknowledgedRiskIds: Array.isArray(value.acknowledgedRiskIds)
      ? Array.from(new Set(value.acknowledgedRiskIds.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)))
      : [],
  };
}

export function readFleetBuildLoadoutState(vehicleLike: any): FleetBuildLoadoutState {
  return normalizeFleetBuildLoadoutState(vehicleLike?.wizard_config?.fleet_build_loadout);
}

export function getFleetAccessoryCatalogItem(accessoryId: FleetAccessoryId): FleetAccessoryCatalogItem {
  return FLEET_ACCESSORY_CATALOG.find((item) => item.id === accessoryId) ?? FLEET_ACCESSORY_CATALOG[FLEET_ACCESSORY_CATALOG.length - 1];
}

function confidenceForMode(mode: FleetAccessoryKnowledgeMode): number {
  switch (mode) {
    case 'known_brand_model': return 88;
    case 'manual_weight': return 70;
    case 'estimate': return 66;
    case 'unsure':
    default: return 60;
  }
}

function sourceForMode(mode: FleetAccessoryKnowledgeMode): FleetWeightSource {
  switch (mode) {
    case 'known_brand_model': return 'manufacturer_spec';
    case 'manual_weight': return 'user_estimate';
    case 'estimate':
    case 'unsure':
    default: return 'ecs_default';
  }
}

export function buildFleetAccessoryInstall(input: {
  accessoryId: FleetAccessoryId;
  vehicleId: string;
  knowledgeMode: FleetAccessoryKnowledgeMode;
  brandModel?: string | null;
  manualWeightLb?: number | null;
  mountZone?: FleetLoadZone | null;
  permanence?: FleetAccessoryPermanence | null;
}): FleetBuildAccessoryInstall {
  const catalog = getFleetAccessoryCatalogItem(input.accessoryId);
  const weight = input.knowledgeMode === 'manual_weight' && input.manualWeightLb != null
    ? input.manualWeightLb
    : catalog.defaultWeightLb;
  return {
    id: `${input.vehicleId}:${input.accessoryId}`,
    accessoryId: input.accessoryId,
    name: catalog.label,
    brandModel: input.brandModel ?? null,
    installedWeightLb: Math.max(0, Math.round(weight * 10) / 10),
    mountZone: input.mountZone ?? catalog.mountZone,
    permanence: input.permanence ?? catalog.permanence,
    source: sourceForMode(input.knowledgeMode),
    confidence: confidenceForMode(input.knowledgeMode),
    knowledgeMode: input.knowledgeMode,
    affectsPayload: catalog.affectsPayload !== false,
    scoringEffects: [...catalog.scoringEffects],
  };
}

export function generateFleetAccessoryCompartments(
  install: FleetBuildAccessoryInstall,
): FleetBuildCompartment[] {
  const catalog = getFleetAccessoryCatalogItem(install.accessoryId);
  return catalog.defaultCompartments.map((compartment, index) => {
    const loadZone = install.accessoryId === 'custom_accessory' ? install.mountZone : compartment.loadZone;
    return {
      id: `${install.id}:${compartment.id}`,
      vehicleId: install.id.split(':')[0] ?? install.id,
      name: compartment.name,
      loadZone,
      accessoryInstallId: install.id,
      accessoryId: install.accessoryId,
      sortOrder: index,
      status: 'active',
      display: {
        iconKey: catalog.icon,
        title: compartment.name,
        subtitle: catalog.label,
        classLabel: catalog.label,
        chips: [],
        accentTone: 'category',
      },
      placement: placementFromDescriptor(loadZone, `${compartment.name} ${compartment.id}`, 'assigned'),
    };
  });
}

export function upsertFleetAccessoryInstall(
  state: FleetBuildLoadoutState,
  install: FleetBuildAccessoryInstall,
): FleetBuildLoadoutState {
  const accessories = [
    ...state.accessories.filter((item) => item.id !== install.id),
    install,
  ];
  const generated = generateFleetAccessoryCompartments(install);
  const compartments = [
    ...state.compartments.filter((item) => item.accessoryInstallId !== install.id),
    ...generated,
  ];
  return {
    ...state,
    accessories,
    compartments,
  };
}

export function removeFleetAccessoryInstall(
  state: FleetBuildLoadoutState,
  installId: string,
): FleetBuildLoadoutState {
  const removedCompartmentIds = new Set(
    state.compartments
      .filter((item) => item.accessoryInstallId === installId)
      .map((item) => item.id),
  );
  return {
    ...state,
    accessories: state.accessories.filter((item) => item.id !== installId),
    compartments: state.compartments
      .filter((item) => item.accessoryInstallId !== installId || item.status !== 'active')
      .map((item) => item.accessoryInstallId === installId ? { ...item, status: 'removed' as const } : item),
    loadoutItems: (state.loadoutItems ?? []).filter((item) => !removedCompartmentIds.has(item.compartmentId)),
    activePreset: state.activePreset,
  };
}

export function groupFleetCompartmentsByZone(
  compartments: readonly FleetBuildCompartment[],
): FleetCompartmentGroup[] {
  const active = compartments.filter((item) => item.status !== 'removed');
  const groups: Array<{ id: FleetCompartmentGroupId; label: string; zones: FleetLoadZone[]; match: (item: FleetBuildCompartment) => boolean }> = [
    { id: 'cab', label: 'Cab', zones: ['cab', 'frontLow'], match: (item) => item.loadZone === 'cab' || item.loadZone === 'frontLow' },
    { id: 'bed_floor', label: 'Bed floor', zones: ['bedLow', 'rearLow'], match: (item) => (item.loadZone === 'bedLow' || item.loadZone === 'rearLow') && !item.name.toLowerCase().includes('drawer') },
    { id: 'bed_high_cap', label: 'Bed high/cap', zones: ['bedHigh'], match: (item) => item.loadZone === 'bedHigh' && !item.name.toLowerCase().includes('roof') },
    { id: 'drawers', label: 'Drawers', zones: ['bedLow'], match: (item) => item.name.toLowerCase().includes('drawer') },
    { id: 'roof', label: 'Roof', zones: ['roof', 'bedHigh'], match: (item) => item.loadZone === 'roof' || item.name.toLowerCase().includes('roof') },
    { id: 'hitch_trailer', label: 'Hitch/trailer', zones: ['hitch', 'trailer'], match: (item) => item.loadZone === 'hitch' || item.loadZone === 'trailer' },
  ];
  const matched = new Set<string>();
  const result = groups.map((group) => {
    const groupCompartments = active.filter((item) => {
      if (matched.has(item.id)) return false;
      if (item.accessoryId === 'custom_accessory') return false;
      const doesMatch = group.match(item);
      if (doesMatch) matched.add(item.id);
      return doesMatch;
    });
    return {
      id: group.id,
      label: group.label,
      zones: group.zones,
      compartments: groupCompartments,
    };
  });
  result.push({
    id: 'custom',
    label: 'Custom',
    zones: ['rearLow'],
    compartments: active.filter((item) => !matched.has(item.id)),
  });
  return result;
}

export function buildFleetCompartmentLoadoutItem(input: {
  vehicleId: string;
  name: string;
  category: string;
  typicalWeightLb: number;
  quantity?: number | null;
  compartment: FleetBuildCompartment;
  loadZone?: FleetLoadZone | null;
  permanence?: FleetLoadoutPermanence | null;
  source?: FleetWeightSource | null;
  confidence?: number | null;
  presetId?: FleetLoadoutPresetId | null;
}): FleetCompartmentLoadoutItem {
  const loadZone = input.loadZone ?? input.compartment.loadZone;
  return {
    id: `${input.vehicleId}:loadout:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 7)}`,
    name: input.name.trim() || 'Loadout item',
    category: input.category.trim() || 'general',
    typicalWeightLb: Math.max(0, Math.round(input.typicalWeightLb * 10) / 10),
    quantity: Math.max(1, Number(input.quantity) || 1),
    compartmentId: input.compartment.id,
    loadZone,
    permanence: input.permanence ?? 'trip',
    source: input.source ?? 'user_estimate',
    confidence: Math.max(0, Math.min(100, Math.round(input.confidence ?? 62))),
    presetId: input.presetId ?? null,
    placement: placementFromDescriptor(loadZone, `${input.compartment.name} ${input.compartment.id}`, 'assigned'),
  };
}

export function upsertFleetCompartmentLoadoutItem(
  state: FleetBuildLoadoutState,
  item: FleetCompartmentLoadoutItem,
): FleetBuildLoadoutState {
  return {
    ...state,
    loadoutItems: [
      ...(state.loadoutItems ?? []).filter((existing) => existing.id !== item.id),
      item,
    ],
  };
}

export function removeFleetCompartmentLoadoutItem(
  state: FleetBuildLoadoutState,
  itemId: string,
): FleetBuildLoadoutState {
  return {
    ...state,
    loadoutItems: (state.loadoutItems ?? []).filter((item) => item.id !== itemId),
  };
}

function findPresetCompartment(
  state: FleetBuildLoadoutState,
  preferred: FleetLoadZone[],
): FleetBuildCompartment | null {
  const active = state.compartments.filter((item) => item.status !== 'removed');
  return active.find((item) => preferred.includes(item.loadZone)) ?? active[0] ?? null;
}

export function applyFleetLoadoutPreset(
  state: FleetBuildLoadoutState,
  vehicleId: string,
  presetId: FleetLoadoutPresetId,
): FleetBuildLoadoutState {
  if (presetId === 'empty') {
    return { ...state, loadoutItems: [], activePreset: presetId };
  }
  const templates: Partial<Record<FleetLoadoutPresetId, Array<{ name: string; category: string; weight: number; qty?: number; zones: FleetLoadZone[]; permanence: FleetLoadoutPermanence }>>> = {
    daily: [
      { name: 'First aid kit', category: 'safety', weight: 5, zones: ['cab', 'bedLow'], permanence: 'always' },
      { name: 'Recovery strap', category: 'recovery', weight: 8, zones: ['bedLow', 'rearLow'], permanence: 'always' },
    ],
    work: [
      { name: 'Tool bag', category: 'tools', weight: 45, zones: ['bedLow', 'rearLow'], permanence: 'work_day' },
      { name: 'Parts bin', category: 'work', weight: 35, zones: ['bedLow', 'rearLow'], permanence: 'work_day' },
    ],
    towing: [
      { name: 'Hitch kit', category: 'towing', weight: 35, zones: ['hitch', 'rearLow'], permanence: 'trip' },
    ],
    overland: [
      { name: 'Camp kitchen', category: 'camp', weight: 32, zones: ['bedLow', 'rearLow'], permanence: 'trip' },
      { name: 'Recovery boards', category: 'recovery', weight: 18, zones: ['roof', 'bedHigh'], permanence: 'trip' },
    ],
    emergency: [
      { name: 'Emergency water', category: 'water', weight: 42, zones: ['bedLow', 'rearLow'], permanence: 'always' },
    ],
    winter: [
      { name: 'Snow chains', category: 'winter', weight: 28, zones: ['bedLow', 'rearLow'], permanence: 'seasonal' },
    ],
    custom: [],
  };
  const additions = (templates[presetId] ?? [])
    .map((template) => {
      const compartment = findPresetCompartment(state, template.zones);
      if (!compartment) return null;
      return buildFleetCompartmentLoadoutItem({
        vehicleId,
        name: template.name,
        category: template.category,
        typicalWeightLb: template.weight,
        quantity: template.qty ?? 1,
        compartment,
        permanence: template.permanence,
        source: 'ecs_default',
        confidence: 66,
        presetId,
      });
    })
    .filter((item): item is FleetCompartmentLoadoutItem => Boolean(item));
  return {
    ...state,
    loadoutItems: [
      ...(state.loadoutItems ?? []),
      ...additions,
    ],
    activePreset: presetId,
  };
}

export function toFleetCompartmentLoadoutItems(
  state: FleetBuildLoadoutState,
  vehicleId: string,
) {
  return (state.loadoutItems ?? []).map((item) => ({
    id: item.id,
    vehicleId,
    loadoutId: 'fleet-build-loadout',
    name: item.name,
    category: item.category,
    quantity: item.quantity,
    weight: createFleetWeightValue(item.typicalWeightLb, item.source, {
      confidence: item.confidence,
      sourceLabel: item.source === 'ecs_default'
        ? `ECS estimated this at ${Math.round(item.typicalWeightLb)} lb`
        : item.name,
    }),
    loadZone: item.loadZone,
    compartmentId: item.compartmentId,
    placement: item.placement,
    isCritical: item.permanence === 'always',
    isPacked: true,
    display: {
      iconKey: 'cube-outline',
      title: item.name,
      subtitle: item.category,
      classLabel: item.permanence,
      chips: [item.permanence],
      accentTone: (item.confidence >= 80 ? 'ready' : 'category') as FleetDisplayMetadata['accentTone'],
    },
  }));
}

export function toFleetLoadoutZoneWeights(state: FleetBuildLoadoutState): FleetLoadoutZoneWeightInput[] {
  return (state.loadoutItems ?? [])
    .filter((item) => item.typicalWeightLb > 0 && item.quantity > 0)
    .map((item) => ({
      zoneId: item.id,
      zoneName: item.name,
      weightLbs: Math.max(0, item.typicalWeightLb) * Math.max(1, item.quantity),
      posX: item.placement.x,
      posY: item.placement.y,
      posZ: item.placement.z,
    }));
}

export function toFleetAccessoryInstalls(state: FleetBuildLoadoutState, vehicleId: string): FleetAccessoryInstall[] {
  return state.accessories.map((install) => ({
    id: install.id,
    vehicleId,
    catalogItemId: install.accessoryId,
    name: install.brandModel ? `${install.name} (${install.brandModel})` : install.name,
    installedWeight: createFleetWeightValue(install.installedWeightLb, install.source, {
      confidence: install.confidence,
      sourceLabel: install.source === 'ecs_default'
        ? `ECS estimated this at ${Math.round(install.installedWeightLb)} lb`
        : install.name,
    }),
    affectsPayload: install.affectsPayload !== false,
    loadZone: install.mountZone,
    placement: placementFromDescriptor(install.mountZone, install.name, 'assigned'),
    display: {
      iconKey: getFleetAccessoryCatalogItem(install.accessoryId).icon,
      title: install.name,
      subtitle: install.brandModel ?? (install.affectsPayload === false ? 'fit reference' : install.source),
      classLabel: install.affectsPayload === false ? 'fit reference' : 'payload tracked',
      chips: [install.affectsPayload === false ? 'fit reference' : 'payload tracked', install.permanence],
      accentTone: install.confidence >= 80 ? 'ready' : 'warning',
    },
  }));
}

export function calculateFleetBuildLoadoutSummary(
  vehicle: FleetVehicle,
  state: FleetBuildLoadoutState,
): {
  accessoryWeightLb: number;
  loadoutWeightLb: number;
  activeCompartmentCount: number;
  weightResult: FleetWeightResult;
  scoringEffects: Record<FleetAccessoryScoringEffect, number>;
  scoringResult: FleetScoringResult;
} {
  const accessories = toFleetAccessoryInstalls(state, vehicle.id);
  const loadoutItems = toFleetCompartmentLoadoutItems(state, vehicle.id);
  const weightResult = calculateFleetWeightResult(vehicle, accessories, loadoutItems);
  const scoringEffects = state.accessories.reduce((acc, accessory) => {
    for (const effect of accessory.scoringEffects) {
      acc[effect] = (acc[effect] ?? 0) + 1;
    }
    return acc;
  }, {
    payload: 0,
    front_axle: 0,
    rear_axle: 0,
    top_heavy: 0,
    aero: 0,
    maintenance: 0,
    recovery: 0,
  } as Record<FleetAccessoryScoringEffect, number>);

  return {
    accessoryWeightLb: accessories.reduce((sum, accessory) => sum + accessory.installedWeight.lbs, 0),
    loadoutWeightLb: loadoutItems.reduce((sum, item) => sum + item.weight.lbs * item.quantity, 0),
    activeCompartmentCount: state.compartments.filter((item) => item.status === 'active').length,
    weightResult,
    scoringEffects,
    scoringResult: {
      vehicleId: vehicle.id,
      readinessScore: Math.max(0, 100 - Math.max(0, (weightResult.gvwrUsagePct ?? 0) - 75)),
      payloadScore: weightResult.payloadRemaining && weightResult.payloadRemaining.lbs < 0 ? 20 : 90,
      confidenceScore: weightResult.confidence,
      overallScore: weightResult.confidence,
      riskLevel: weightResult.topHeavyRisk === 'critical' || weightResult.rearAxleRisk === 'critical' || weightResult.frontAxleRisk === 'critical'
        ? 'critical'
        : weightResult.topHeavyRisk === 'caution' || weightResult.rearAxleRisk === 'caution' || weightResult.frontAxleRisk === 'caution'
          ? 'caution'
          : 'clear',
      blockingIssues: weightResult.warnings,
      recommendations: [],
      confidence: weightResult.confidence,
    },
  };
}
