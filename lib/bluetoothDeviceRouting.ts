import { getProviderMeta } from './BluProviderRegistry';
import type { BluProviderId } from './BluTypes';
import { getBluestackProviderReadiness } from './bluestack/bluestackProviderReadiness';
import {
  classifyBluetoothDevice,
  type BluetoothDeviceClassificationInput,
  type BluetoothProviderBadge,
} from './bluetoothDevicePresentation';
import { isLikelyPowerBluetoothAdvertisement } from './bluetoothBrandRegistry';

export type BluetoothOwnerDomain = 'power' | 'telemetry' | 'sensor' | 'generic';

export type BluetoothRoutingSupportLevel =
  | 'verified'
  | 'implemented_unverified'
  | 'partial'
  | 'ui_only'
  | 'telemetry'
  | 'generic';

export type BluetoothRouteKey =
  | 'power/live'
  | 'power/partial'
  | 'telemetry/live'
  | 'sensor/fluid_level'
  | 'sensor/generic'
  | 'bluetooth/generic';

export interface BluetoothRoutingDecision {
  owner: BluetoothOwnerDomain;
  routeKey: BluetoothRouteKey;
  providerId: string;
  providerLabel: string;
  categoryLabel: string;
  supportLevel: BluetoothRoutingSupportLevel;
  supportLabel: string;
  supportNote: string | null;
  needsUserConfirmation: boolean;
  matchedBrandLabels: string[];
  connectionType: string | null;
  deviceCategory: string;
  suggestedPath: string | null;
  shouldNavigate: boolean;
  displayName: string;
  secondaryLabel: string;
}

type BluetoothDiscoveryInput = BluetoothDeviceClassificationInput;

const POWER_BADGE_TO_PROVIDER_ID: Partial<Record<BluetoothProviderBadge, BluProviderId>> = {
  EcoFlow: 'ecoflow',
  Bluetti: 'bluetti',
  'Anker SOLIX': 'anker_solix',
  Jackery: 'jackery',
  'Goal Zero': 'goal_zero',
  Renogy: 'renogy',
  Redarc: 'redarc',
  'Dakota Lithium': 'dakota_lithium',
  'Victron Energy': 'victron',
};

function isFluidLevelSensorCategory(category: string | null | undefined): boolean {
  return category === 'propane_monitor' || category === 'water_tank_monitor';
}

function getFluidSensorProviderId(providerBadge: BluetoothProviderBadge | null): string {
  if (providerBadge === 'Propane') return 'propane_monitor';
  if (providerBadge === 'Water') return 'water_monitor';
  return 'utility_sensor';
}

function getFluidSensorProviderLabel(providerBadge: BluetoothProviderBadge | null): string {
  if (providerBadge === 'Propane') return 'Propane Monitor';
  if (providerBadge === 'Water') return 'Water Monitor';
  return 'Utility Sensor';
}

function getPowerSupport(providerId: BluProviderId): Pick<
  BluetoothRoutingDecision,
  'supportLevel' | 'supportLabel' | 'supportNote'
> {
  const meta = getProviderMeta(providerId);
  const readiness = getBluestackProviderReadiness(providerId);
  if (readiness.stage === 'live_ready') {
    return {
      supportLevel: providerId === 'ecoflow' ? 'verified' : 'implemented_unverified',
      supportLabel: providerId === 'ecoflow' ? 'Cloud/API' : 'Native BLE',
      supportNote: readiness.statusDetail,
    };
  }
  switch (meta?.status) {
    case 'verified':
      return {
        supportLevel: 'verified',
        supportLabel: providerId === 'ecoflow' ? 'Cloud/API' : 'Supported',
        supportNote: readiness.statusDetail,
      };
    case 'implemented':
      return {
        supportLevel: 'implemented_unverified',
        supportLabel: 'Parser Pending',
        supportNote: readiness.statusDetail,
      };
    case 'limited':
      return {
        supportLevel: 'partial',
        supportLabel: readiness.stage === 'native_parser_pending' ? 'Parser Pending' : 'Partial Support',
        supportNote: readiness.statusDetail,
      };
    case 'planned':
    default:
      return {
        supportLevel: 'ui_only',
        supportLabel: readiness.statusLabel,
        supportNote: readiness.statusDetail,
      };
  }
}

export function mapBadgeToPowerProviderId(
  badge: BluetoothProviderBadge | null | undefined,
): BluProviderId | null {
  if (!badge) return null;
  return POWER_BADGE_TO_PROVIDER_ID[badge] ?? null;
}

export function routeBluetoothDevice(
  device: BluetoothDiscoveryInput,
): BluetoothRoutingDecision {
  const presentation = classifyBluetoothDevice(device);

  if (presentation.needsUserConfirmation) {
    return {
      owner: 'generic',
      routeKey: 'bluetooth/generic',
      providerId: 'brand_confirmation',
      providerLabel: 'Bluetooth Device',
      categoryLabel: presentation.categoryHint,
      supportLevel: 'generic',
      supportLabel: 'Confirm Brand',
      supportNote: `This device matches multiple supported profiles: ${presentation.matchedBrandLabels.join(', ')}.`,
      needsUserConfirmation: true,
      matchedBrandLabels: presentation.matchedBrandLabels,
      connectionType: presentation.connectionType,
      deviceCategory: presentation.deviceCategory,
      suggestedPath: null,
      shouldNavigate: false,
      displayName: presentation.displayName,
      secondaryLabel: presentation.secondaryLabel,
    };
  }

  if (presentation.providerBadge === 'OBD') {
    return {
      owner: 'telemetry',
      routeKey: 'telemetry/live',
      providerId: 'obd2',
      providerLabel: 'OBD2 Telemetry',
      categoryLabel: 'Vehicle Adapter',
      supportLevel: 'telemetry',
      supportLabel: 'Telemetry',
      supportNote: 'Vehicle telemetry connections currently support one active OBD2 adapter at a time.',
      needsUserConfirmation: false,
      matchedBrandLabels: presentation.matchedBrandLabels,
      connectionType: presentation.connectionType,
      deviceCategory: presentation.deviceCategory,
      suggestedPath: '/vehicle-telemetry-settings',
      shouldNavigate: true,
      displayName: presentation.displayName,
      secondaryLabel: presentation.secondaryLabel,
    };
  }

  if (presentation.providerBadge === 'EcoFlow') {
    const support = getPowerSupport('ecoflow');
    return {
      owner: 'power',
      routeKey: support.supportLevel === 'verified' ? 'power/live' : 'power/partial',
      providerId: 'ecoflow',
      providerLabel: presentation.brandLabel ?? 'EcoFlow',
      categoryLabel: presentation.categoryHint,
      supportLevel: support.supportLevel,
      supportLabel: support.supportLabel,
      supportNote: support.supportNote,
      needsUserConfirmation: false,
      matchedBrandLabels: presentation.matchedBrandLabels,
      connectionType: presentation.connectionType,
      deviceCategory: presentation.deviceCategory,
      suggestedPath: null,
      shouldNavigate: false,
      displayName: presentation.displayName,
      secondaryLabel: presentation.secondaryLabel,
    };
  }

  const powerProviderId = mapBadgeToPowerProviderId(presentation.providerBadge);
  if (powerProviderId) {
    const support = getPowerSupport(powerProviderId);
    return {
      owner: 'power',
      routeKey: support.supportLevel === 'verified' ? 'power/live' : 'power/partial',
      providerId: powerProviderId,
      providerLabel: presentation.brandLabel ?? presentation.providerBadge ?? 'Power Device',
      categoryLabel: presentation.categoryHint,
      supportLevel: support.supportLevel,
      supportLabel: support.supportLabel,
      supportNote: support.supportNote,
      needsUserConfirmation: false,
      matchedBrandLabels: presentation.matchedBrandLabels,
      connectionType: presentation.connectionType,
      deviceCategory: presentation.deviceCategory,
      suggestedPath: null,
      shouldNavigate: false,
      displayName: presentation.displayName,
      secondaryLabel: presentation.secondaryLabel,
    };
  }

  if (isLikelyPowerBluetoothAdvertisement(device)) {
    return {
      owner: 'power',
      routeKey: 'power/partial',
      providerId: 'unknown_power',
      providerLabel: 'Unknown power device',
      categoryLabel: 'Power Device',
      supportLevel: 'generic',
      supportLabel: 'Needs Identification',
      supportNote: 'This nearby advertisement looks power-related, but ECS could not verify a supported brand from its name, services, or manufacturer data.',
      needsUserConfirmation: false,
      matchedBrandLabels: [],
      connectionType: presentation.connectionType ?? 'ble',
      deviceCategory: 'power_station',
      suggestedPath: null,
      shouldNavigate: false,
      displayName: presentation.displayName,
      secondaryLabel: presentation.secondaryLabel,
    };
  }

  if (
    presentation.providerBadge === 'Propane' ||
    presentation.providerBadge === 'Water' ||
    isFluidLevelSensorCategory(presentation.deviceCategory)
  ) {
    return {
      owner: 'sensor',
      routeKey: 'sensor/fluid_level',
      providerId: getFluidSensorProviderId(presentation.providerBadge),
      providerLabel: presentation.brandLabel ?? getFluidSensorProviderLabel(presentation.providerBadge),
      categoryLabel: presentation.categoryHint,
      supportLevel: 'generic',
      supportLabel: 'Live Sensor',
      supportNote: 'Bluestack can link this monitor over native BLE and will promote live fluid-level telemetry only after a decoded percentage is received.',
      needsUserConfirmation: false,
      matchedBrandLabels: presentation.matchedBrandLabels,
      connectionType: presentation.connectionType,
      deviceCategory: presentation.deviceCategory,
      suggestedPath: null,
      shouldNavigate: false,
      displayName: presentation.displayName,
      secondaryLabel: presentation.secondaryLabel,
    };
  }

  if (presentation.providerBadge === 'Sensor') {
    return {
      owner: 'sensor',
      routeKey: 'sensor/generic',
      providerId: 'sensor',
      providerLabel: 'Sensor Accessory',
      categoryLabel: presentation.categoryHint,
      supportLevel: 'generic',
      supportLabel: 'Accessory',
      supportNote: 'ECS can keep the Bluetooth link available while deeper sensor workflows continue to mature.',
      needsUserConfirmation: false,
      matchedBrandLabels: presentation.matchedBrandLabels,
      connectionType: presentation.connectionType,
      deviceCategory: presentation.deviceCategory,
      suggestedPath: null,
      shouldNavigate: false,
      displayName: presentation.displayName,
      secondaryLabel: presentation.secondaryLabel,
    };
  }

  return {
    owner: 'generic',
    routeKey: 'bluetooth/generic',
    providerId: 'generic',
    providerLabel: 'Bluetooth Device',
    categoryLabel: presentation.categoryHint,
    supportLevel: 'generic',
    supportLabel: 'Generic Bluetooth',
    supportNote: 'ECS will keep this Bluetooth session managed generically until a stronger provider match is available.',
    needsUserConfirmation: false,
    matchedBrandLabels: presentation.matchedBrandLabels,
    connectionType: presentation.connectionType,
    deviceCategory: presentation.deviceCategory,
    suggestedPath: null,
    shouldNavigate: false,
    displayName: presentation.displayName,
    secondaryLabel: presentation.secondaryLabel,
  };
}

export function isReleaseScannerBluetoothRoute(
  routing: Pick<BluetoothRoutingDecision, 'owner' | 'deviceCategory'>,
): boolean {
  return (
    routing.owner === 'power' ||
    routing.owner === 'telemetry' ||
    (routing.owner === 'sensor' && isFluidLevelSensorCategory(routing.deviceCategory))
  );
}
