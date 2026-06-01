import { getActiveVehicleContext } from './activeVehicleContext';
import { connectivity } from './connectivity';
import { connectivityIntelStore } from './connectivityIntelStore';
import { navigateRouteSessionStore } from './navigateRouteSessionStore';
import { routeStore } from './routeStore';
import { teamStore } from './teamStore';
import { consumablesStore } from './consumablesStore';
import { loadoutItemStore, loadoutStore } from './loadoutStore';
import { vehicleSetupStore } from './vehicleSetupStore';
import { vehicleStore } from './vehicleStore';
import type {
  IncidentCommunicationStatus,
  IncidentCoordinate,
  IncidentRecoveryContextSnapshot,
  IncidentRecoveryLogisticsContext,
} from './types/incidentRecovery';

type Listener = () => void;
let contextVersion = 0;

function bumpContextVersion(listener: Listener): void {
  contextVersion += 1;
  listener();
}

function cleanText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function safeRead<T>(read: () => T, fallback: T): T {
  try {
    return read();
  } catch {
    return fallback;
  }
}

function formatRouteDistance(distanceMiles: number | null | undefined): string | null {
  if (distanceMiles == null || !Number.isFinite(distanceMiles)) return null;
  return `${Math.round(distanceMiles * 10) / 10} mi`;
}

function buildRouteContext(gpsLocation?: IncidentCoordinate | null): IncidentRecoveryContextSnapshot['route'] {
  const navigation = safeRead(() => navigateRouteSessionStore.getSnapshot(), null);
  const activeRoute = safeRead(() => routeStore.getActive(), null);
  const hasActiveNavigation = navigation?.lifecycle === 'active' || navigation?.lifecycle === 'arrived';
  const routeId = navigation?.routeId ?? activeRoute?.id ?? null;
  const routeLabel = cleanText(navigation?.routeTitle) ?? cleanText(activeRoute?.name);
  const routeSegmentLabel =
    cleanText(navigation?.instruction) ??
    cleanText(navigation?.statusLabel) ??
    null;
  const currentLocation = gpsLocation ?? (navigation?.currentLocation
    ? {
        latitude: navigation.currentLocation.latitude,
        longitude: navigation.currentLocation.longitude,
        source: 'route' as const,
        capturedAt: navigation.updatedAt ?? undefined,
      }
    : null);

  return {
    routeId,
    routeLabel,
    routeSegmentLabel,
    routeSource: navigation?.source ?? activeRoute?.source_format ?? null,
    hasActiveRoute: Boolean(hasActiveNavigation || activeRoute),
    currentLocation,
    statusLabel: cleanText(navigation?.statusLabel) ?? (activeRoute ? 'Route selected' : null),
  };
}

function buildConvoyContext(): IncidentRecoveryContextSnapshot['convoy'] {
  const snapshot = safeRead(() => teamStore.getSnapshot(), { activeTeam: null, members: [], updatedAt: null });
  return {
    teamId: snapshot.activeTeam?.id ?? null,
    teamName: snapshot.activeTeam?.name ?? null,
    memberCount: snapshot.members.length,
    memberLabels: snapshot.members.map((member) => member.userId),
    hasConvoy: snapshot.members.length >= 2,
    communicationTargetAvailable: Boolean(snapshot.activeTeam && snapshot.members.length > 0),
  };
}

function getRecoveryEquipmentFromContext(context: ReturnType<typeof getActiveVehicleContext>): string[] {
  const labels = [
    ...context.accessorySummary.map((entry) => entry.label),
    ...context.loadoutItems.map((item) => item.name),
  ];
  return Array.from(new Set(labels.filter((label) => /recovery|strap|winch|shackle|jack|traction|radio|satellite/i.test(label)))).slice(0, 8);
}

function buildVehicleContext(): IncidentRecoveryContextSnapshot['vehicle'] {
  const context = safeRead(() => getActiveVehicleContext(), null);
  if (!context) {
    return {
      vehicleId: null,
      label: null,
      makeModel: null,
      drivetrain: null,
      recoveryEquipment: [],
      fuelPercent: null,
      waterGallons: null,
      hasVehicleContext: false,
    };
  }

  const vehicle = context.vehicle;
  const makeModel = [
    vehicle?.year,
    vehicle?.make,
    vehicle?.model,
  ].filter(Boolean).join(' ') || null;
  const drivetrain =
    cleanText((context.spec as any)?.drivetrain) ??
    cleanText((context.wizardConfig as any)?.drivetrain) ??
    null;

  return {
    vehicleId: context.activeVehicleId,
    label: cleanText(vehicle?.name) ?? makeModel,
    makeModel,
    drivetrain,
    recoveryEquipment: getRecoveryEquipmentFromContext(context),
    fuelPercent: context.consumables?.fuel_percent_current ?? vehicle?.current_fuel_percent ?? null,
    waterGallons: context.consumables?.water_gal_current ?? vehicle?.current_water_gal ?? null,
    hasVehicleContext: context.hasVehicleContext,
  };
}

function buildLogisticsContext(vehicle: IncidentRecoveryContextSnapshot['vehicle']): IncidentRecoveryLogisticsContext {
  const activeVehicle = safeRead(() => getActiveVehicleContext(), null);
  const loadoutItems = activeVehicle?.loadoutItems ?? [];
  const itemText = loadoutItems.map((item) => item.name).join(' ');
  const hasMedicalKit = /medical|first aid|trauma|med kit/i.test(itemText);
  const hasFood = /food|meal|ration|snack/i.test(itemText);
  const hasShelter = /shelter|tent|tarp|sleeping|blanket/i.test(itemText);
  const hasWarmth = /warm|jacket|blanket|sleeping|heater/i.test(itemText);

  return {
    fuelPercent: vehicle?.fuelPercent ?? null,
    waterGallons: vehicle?.waterGallons ?? null,
    foodStatus: loadoutItems.length ? (hasFood ? 'available' : 'not indexed') : null,
    shelterStatus: loadoutItems.length ? (hasShelter ? 'available' : 'not indexed') : null,
    warmthStatus: loadoutItems.length ? (hasWarmth ? 'available' : 'not indexed') : null,
    medicalKitAvailable: loadoutItems.length ? hasMedicalKit : null,
    suppliesSummary: loadoutItems.length
      ? `${loadoutItems.length} loadout item${loadoutItems.length === 1 ? '' : 's'} indexed`
      : null,
  };
}

function buildConnectivityContext(): IncidentRecoveryContextSnapshot['connectivity'] {
  const detail = safeRead(() => connectivity.getDetailedState(), null);
  const summary = safeRead(() => connectivityIntelStore.getSummary(), null);
  const status = detail?.status ?? summary?.connectivity_state ?? null;
  const level = detail?.level ?? summary?.connectivity_state ?? null;
  const online = detail?.isOnline ?? (summary ? summary.connectivity_state !== 'offline' : null);
  return {
    online,
    status,
    level,
    networkType: detail?.networkType ?? summary?.network_type ?? null,
    internetReachable: detail?.isInternetReachable ?? summary?.internet_reachable ?? null,
    summaryLabel: status ? `${status}${level ? ` / ${level}` : ''}` : null,
  };
}

function summarize(snapshot: Omit<IncidentRecoveryContextSnapshot, 'summary' | 'updatedAt' | 'missingContext' | 'debrief'>): IncidentRecoveryContextSnapshot['summary'] {
  const routeDistance = formatRouteDistance(safeRead(() => routeStore.getActive()?.total_distance_miles, null));
  const vehicleParts = [
    snapshot.vehicle?.label,
    snapshot.vehicle?.makeModel,
    snapshot.vehicle?.drivetrain,
  ].filter(Boolean);
  const logisticsParts = [
    snapshot.logistics?.fuelPercent != null ? `fuel ${snapshot.logistics.fuelPercent}%` : null,
    snapshot.logistics?.waterGallons != null ? `water ${snapshot.logistics.waterGallons} gal` : null,
    snapshot.logistics?.suppliesSummary,
  ].filter(Boolean);

  return {
    routeLabel: snapshot.route?.routeLabel ?? snapshot.route?.statusLabel ?? null,
    convoySummary: snapshot.convoy?.teamName
      ? `${snapshot.convoy.teamName} / ${snapshot.convoy.memberCount} member${snapshot.convoy.memberCount === 1 ? '' : 's'}`
      : null,
    vehicleSummary: vehicleParts.length ? vehicleParts.join(' / ') : null,
    logisticsSummary: logisticsParts.length ? logisticsParts.join(' / ') : null,
    connectivitySummary: snapshot.connectivity?.summaryLabel ?? null,
  };
}

function getMissingContext(snapshot: Omit<IncidentRecoveryContextSnapshot, 'summary' | 'updatedAt' | 'missingContext' | 'debrief'>): string[] {
  const missing: string[] = [];
  if (!snapshot.route?.hasActiveRoute) missing.push('route');
  if (!snapshot.convoy?.hasConvoy) missing.push('convoy');
  if (!snapshot.vehicle?.hasVehicleContext) missing.push('vehicle');
  if (!snapshot.logistics?.suppliesSummary && snapshot.logistics?.fuelPercent == null && snapshot.logistics?.waterGallons == null) {
    missing.push('logistics');
  }
  if (!snapshot.connectivity?.status) missing.push('connectivity');
  return missing;
}

export function getIncidentRecoveryContextSnapshot(args: {
  gpsLocation?: IncidentCoordinate | null;
} = {}): IncidentRecoveryContextSnapshot {
  const route = buildRouteContext(args.gpsLocation);
  const convoy = buildConvoyContext();
  const vehicle = buildVehicleContext();
  const logistics = buildLogisticsContext(vehicle);
  const connectivityContext = buildConnectivityContext();
  const base = {
    route,
    convoy,
    vehicle,
    logistics,
    connectivity: connectivityContext,
  };
  return {
    ...base,
    debrief: {
      routeConfidenceAdjustmentAvailable: Boolean(route?.routeId || route?.routeLabel),
      communityHazardReportRequiresUserAction: true,
    },
    summary: summarize(base),
    missingContext: getMissingContext(base),
    updatedAt: new Date().toISOString(),
  };
}

export function deriveIncidentCommunicationStatusFromContext(
  snapshot?: IncidentRecoveryContextSnapshot | null,
): IncidentCommunicationStatus {
  const connectivityState = snapshot?.connectivity?.status;
  const connectivityLevel = snapshot?.connectivity?.level;
  if (connectivityState === 'offline' || connectivityLevel === 'no_service') return 'offline';
  if (connectivityState === 'reconnecting' || connectivityLevel === 'limited') return 'degraded';
  if (snapshot?.connectivity?.online === true) return 'available';
  if (snapshot?.convoy?.communicationTargetAvailable) return 'available';
  return 'unknown';
}

export function getIncidentRecoveryContextDefaultResources(snapshot?: IncidentRecoveryContextSnapshot | null): {
  fuelConcern: boolean | null;
  waterConcern: boolean | null;
  foodConcern: boolean | null;
  shelterConcern: boolean | null;
  warmthConcern: boolean | null;
  medicalKitAvailable: boolean | null;
} {
  return {
    fuelConcern: snapshot?.logistics?.fuelPercent == null ? null : snapshot.logistics.fuelPercent < 20,
    waterConcern: snapshot?.logistics?.waterGallons == null ? null : snapshot.logistics.waterGallons <= 1,
    foodConcern: snapshot?.logistics?.foodStatus == null ? null : snapshot.logistics.foodStatus !== 'available',
    shelterConcern: snapshot?.logistics?.shelterStatus == null ? null : snapshot.logistics.shelterStatus !== 'available',
    warmthConcern: snapshot?.logistics?.warmthStatus == null ? null : snapshot.logistics.warmthStatus !== 'available',
    medicalKitAvailable: snapshot?.logistics?.medicalKitAvailable ?? null,
  };
}

export function subscribeIncidentRecoveryContext(listener: Listener): () => void {
  const unsubscribers: Array<() => void> = [];
  const add = (subscribe: ((listener: any) => () => void) | undefined, mapListener: any = listener) => {
    if (!subscribe) return;
    try {
      unsubscribers.push(subscribe(mapListener));
    } catch {
      // Optional integrations should never block Incident & Recovery.
    }
  };

  const notify = () => bumpContextVersion(listener);
  add(routeStore.subscribe, notify);
  add(navigateRouteSessionStore.subscribe, notify);
  add(teamStore.subscribe, notify);
  add(vehicleSetupStore.subscribe, notify);
  add(vehicleStore.subscribe, notify);
  add(consumablesStore.subscribe, notify);
  add(loadoutStore.subscribe, notify);
  add(loadoutItemStore.subscribe, notify);
  add(connectivityIntelStore.subscribe, notify);
  try {
    unsubscribers.push(connectivity.onStatusChange(() => notify()));
  } catch {
    // Connectivity monitor may be unavailable in test/runtime shells.
  }

  return () => {
    unsubscribers.forEach((unsubscribe) => {
      try {
        unsubscribe();
      } catch {}
    });
  };
}

export function getIncidentRecoveryContextVersion(): number {
  return contextVersion;
}
