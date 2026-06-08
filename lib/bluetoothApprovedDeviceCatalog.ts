export type ECSApprovedBluetoothDeviceGroupId =
  | 'ecoflow_cloud_api'
  | 'native_ble_power'
  | 'vehicle_telemetry'
  | 'utility_tank_sensors'
  | 'recognized_power_pending'
  | 'planned_power_systems';

export type ECSBluetoothDeviceCatalogSectionId =
  | 'approved'
  | 'recognized_parser_pending'
  | 'planned';

export interface ECSApprovedBluetoothDeviceEntry {
  name: string;
  detail: string;
  providerIds: string[];
}

export interface ECSApprovedBluetoothDeviceGroup {
  id: ECSApprovedBluetoothDeviceGroupId;
  title: string;
  detail: string;
  badge: string;
  devices: ECSApprovedBluetoothDeviceEntry[];
}

export interface ECSBluetoothDeviceCatalogSection {
  id: ECSBluetoothDeviceCatalogSectionId;
  title: string;
  detail: string;
  groups: ECSApprovedBluetoothDeviceGroup[];
}

const APPROVED_POWER_PROVIDER_IDS = new Set([
  'ecoflow',
  'bluetti',
  'anker',
  'anker_solix',
  'jackery',
  'goalzero',
  'goal_zero',
  'renogy',
  'redarc',
  'dakota_lithium',
  'victron',
]);

const APPROVED_TELEMETRY_PROVIDER_IDS = new Set([
  'obd2',
  'generic_obd2',
]);

const APPROVED_FLUID_SENSOR_PROVIDER_IDS = new Set([
  'mopeka',
  'propane_monitor',
  'seelevel',
  'water_monitor',
]);

const APPROVED_FLUID_SENSOR_CATEGORIES = new Set([
  'propane_monitor',
  'water_tank_monitor',
]);

export const ECS_APPROVED_BLUETOOTH_DEVICE_GROUPS: ECSApprovedBluetoothDeviceGroup[] = [
  {
    id: 'ecoflow_cloud_api',
    title: 'EcoFlow cloud/API',
    detail: 'Approved EcoFlow account/device rows remain selectable even when native Bluetooth is unavailable.',
    badge: 'Approved',
    devices: [
      {
        name: 'EcoFlow DELTA, RIVER, GLACIER, WAVE',
        detail: 'Cloud/API telemetry through ECS provider wiring; local BLE advertisements route to EcoFlow only when classified.',
        providerIds: ['ecoflow'],
      },
      {
        name: 'EcoFlow Alternator Charger',
        detail: 'Approved EcoFlow power pipeline with cloud/API or classified local Bluetooth discovery.',
        providerIds: ['ecoflow'],
      },
    ],
  },
  {
    id: 'native_ble_power',
    title: 'Native BLE power systems',
    detail: 'Approved power rows appear only when ECS recognizes a provider with connection and parser wiring.',
    badge: 'Approved',
    devices: [
      {
        name: 'BLUETTI / Blue Eddy',
        detail: 'Native BLE power telemetry path.',
        providerIds: ['bluetti'],
      },
      {
        name: 'BLUETTI AC / EB / EP series',
        detail: 'Recognized BLUETTI family aliases already route to the native BLE power telemetry path.',
        providerIds: ['bluetti'],
      },
      {
        name: 'Anker SOLIX',
        detail: 'Native BLE power telemetry path.',
        providerIds: ['anker_solix', 'anker'],
      },
      {
        name: 'Jackery Explorer',
        detail: 'Native BLE power telemetry path.',
        providerIds: ['jackery'],
      },
      {
        name: 'Goal Zero Yeti',
        detail: 'Native BLE power telemetry path.',
        providerIds: ['goal_zero', 'goalzero'],
      },
      {
        name: 'Renogy, REDARC, Dakota Lithium, Victron',
        detail: 'Approved controller, battery, shunt, and solar monitor pipelines.',
        providerIds: ['renogy', 'redarc', 'dakota_lithium', 'victron'],
      },
      {
        name: 'Victron SmartShunt, BMV, SmartSolar, Blue Smart',
        detail: 'Recognized Victron Smart-series names route through the approved Victron power monitor pipeline.',
        providerIds: ['victron'],
      },
    ],
  },
  {
    id: 'vehicle_telemetry',
    title: 'OBD2 ELM327 telemetry',
    detail: 'Approved OBD2 rows require recognizable adapter naming or OBD2 provider evidence before ECS shows them.',
    badge: 'Approved',
    devices: [
      {
        name: 'Veepeak / V Peak / OBDCheck BLE',
        detail: 'Known BLE ELM327-style telemetry path used by ECS vehicle systems.',
        providerIds: ['obd2', 'generic_obd2'],
      },
      {
        name: 'OBDLink, Vgate, BAFX, Carista, BlueDriver',
        detail: 'Recognized OBD2 scanner families routed to the ECS vehicle telemetry connector.',
        providerIds: ['obd2', 'generic_obd2'],
      },
      {
        name: 'Vgate iCar / vLinker',
        detail: 'Includes iOS V-Link / Android V-Link advertisements routed through the ECS OBD2 telemetry connector.',
        providerIds: ['obd2', 'generic_obd2'],
      },
      {
        name: 'KONNWEI, Viecar, Panlong, Micro Mechanic, ELM327',
        detail: 'Recognized ELM327-compatible names still require the live OBD2 handshake before telemetry is marked live.',
        providerIds: ['obd2', 'generic_obd2'],
      },
      {
        name: 'KONNWEI KW902',
        detail: 'Explicitly recognized ELM327-compatible adapter name routed through the ECS OBD2 telemetry connector.',
        providerIds: ['obd2', 'generic_obd2'],
      },
    ],
  },
  {
    id: 'utility_tank_sensors',
    title: 'Utility tank sensors',
    detail: 'Approved propane, water, and fluid rows appear only for ECS-recognized tank monitor profiles.',
    badge: 'Approved',
    devices: [
      {
        name: 'Mopeka Pro Check / Tank Check propane',
        detail: 'Mopeka BLE service/manufacturer signatures and known names route to the propane tank monitor path.',
        providerIds: ['mopeka', 'propane_monitor'],
      },
      {
        name: 'Mopeka Pro Universal liquid',
        detail: 'Mopeka liquid signatures route to the water/fluid monitor path.',
        providerIds: ['mopeka', 'water_monitor'],
      },
      {
        name: 'Mopeka TD40 / TD200 / Pro200 liquid',
        detail: 'Mopeka TD and Pro200 liquid monitor model names route to the water/fluid monitor path; live percentages require decoded distance plus a calibrated tank profile.',
        providerIds: ['mopeka', 'water_monitor'],
      },
      {
        name: 'SeeLevel / Garnet water monitors',
        detail: 'Recognized water and fluid monitor profiles route to the ECS tank sensor path.',
        providerIds: ['seelevel', 'water_monitor'],
      },
    ],
  },
];

export const ECS_RECOGNIZED_BLUETOOTH_DEVICE_GROUPS: ECSApprovedBluetoothDeviceGroup[] = [
  {
    id: 'recognized_power_pending',
    title: 'Power-looking Bluetooth advertisements',
    detail: 'Recognized as possible power hardware, but hidden from scan results until ECS can identify a supported provider and parser path.',
    badge: 'Parser Pending',
    devices: [
      {
        name: 'Generic power station / battery monitor advertisements',
        detail: 'ECS may detect power-related terms, but these rows are not connectable until a brand-specific provider is approved.',
        providerIds: ['unknown_power'],
      },
    ],
  },
];

export const ECS_PLANNED_BLUETOOTH_DEVICE_GROUPS: ECSApprovedBluetoothDeviceGroup[] = [
  {
    id: 'planned_power_systems',
    title: 'Popular power systems under review',
    detail: 'Listed for roadmap awareness only. These do not appear in scan results until ECS adds recognition and telemetry wiring.',
    badge: 'Planned',
    devices: [
      {
        name: 'DJI Power',
        detail: 'Planned power-system family; scan visibility remains blocked until ECS has approved BLE evidence and parser wiring.',
        providerIds: ['dji_power'],
      },
      {
        name: 'Pecron',
        detail: 'Planned power-system family; scan visibility remains blocked until ECS has approved BLE evidence and parser wiring.',
        providerIds: ['pecron'],
      },
      {
        name: 'UGREEN PowerRoam',
        detail: 'Planned power-system family; scan visibility remains blocked until ECS has approved BLE evidence and parser wiring.',
        providerIds: ['ugreen_powerroam'],
      },
      {
        name: 'BougeRV',
        detail: 'Planned power-system family; scan visibility remains blocked until ECS has approved BLE evidence and parser wiring.',
        providerIds: ['bougerv'],
      },
      {
        name: 'OUPES',
        detail: 'Planned power-system family; scan visibility remains blocked until ECS has approved BLE evidence and parser wiring.',
        providerIds: ['oupes'],
      },
      {
        name: 'Lion Energy',
        detail: 'Planned power-system family; scan visibility remains blocked until ECS has approved BLE evidence and parser wiring.',
        providerIds: ['lion_energy'],
      },
      {
        name: 'Zendure',
        detail: 'Planned power-system family; scan visibility remains blocked until ECS has approved BLE evidence and parser wiring.',
        providerIds: ['zendure'],
      },
      {
        name: 'Mango Power',
        detail: 'Planned power-system family; scan visibility remains blocked until ECS has approved BLE evidence and parser wiring.',
        providerIds: ['mango_power'],
      },
      {
        name: 'ALLPOWERS',
        detail: 'Planned power-system family; scan visibility remains blocked until ECS has approved BLE evidence and parser wiring.',
        providerIds: ['allpowers'],
      },
    ],
  },
];

export const ECS_BLUETOOTH_DEVICE_CATALOG_SECTIONS: ECSBluetoothDeviceCatalogSection[] = [
  {
    id: 'approved',
    title: 'Tested live telemetry',
    detail: 'Connectable rows that can appear in scan results when ECS recognizes the advertisement or provider record.',
    groups: ECS_APPROVED_BLUETOOTH_DEVICE_GROUPS,
  },
  {
    id: 'recognized_parser_pending',
    title: 'Recognized / parser pending',
    detail: 'Known non-connectable categories kept out of scan results until ECS can prove a provider and telemetry path.',
    groups: ECS_RECOGNIZED_BLUETOOTH_DEVICE_GROUPS,
  },
  {
    id: 'planned',
    title: 'Planned power systems',
    detail: 'Frequently used power families ECS can target next without making them scan-visible today.',
    groups: ECS_PLANNED_BLUETOOTH_DEVICE_GROUPS,
  },
];

function normalizeProviderId(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function normalizeCategory(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

export function isGeneratedBluetoothFallbackName(value: unknown): boolean {
  const text = String(value ?? '').trim();
  return /^(?:OBD2 Adapter|Bluetooth Device|BLE Device|Unknown device)(?: [A-Z0-9]{4})?$/i.test(text);
}

export interface ECSApprovedBluetoothRouteInput {
  owner?: string | null;
  providerId?: string | null;
  deviceCategory?: string | null;
  needsUserConfirmation?: boolean | null;
  displayName?: string | null;
}

export function isECSApprovedBluetoothRoute(route: ECSApprovedBluetoothRouteInput): boolean {
  if (route.needsUserConfirmation) return false;

  const owner = normalizeCategory(route.owner);
  const providerId = normalizeProviderId(route.providerId);
  const deviceCategory = normalizeCategory(route.deviceCategory);

  if (owner === 'power') {
    return APPROVED_POWER_PROVIDER_IDS.has(providerId);
  }

  if (owner === 'telemetry') {
    return (
      APPROVED_TELEMETRY_PROVIDER_IDS.has(providerId) &&
      (deviceCategory === 'obd' || deviceCategory === 'obd2') &&
      !isGeneratedBluetoothFallbackName(route.displayName)
    );
  }

  if (owner === 'sensor') {
    return (
      APPROVED_FLUID_SENSOR_PROVIDER_IDS.has(providerId) &&
      APPROVED_FLUID_SENSOR_CATEGORIES.has(deviceCategory)
    );
  }

  return false;
}
