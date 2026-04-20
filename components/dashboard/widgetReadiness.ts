import { consumablesStore } from '../../lib/consumablesStore';
import { getActiveVehicleContext } from '../../lib/activeVehicleContext';
import type { ECSWeatherStatusKind } from '../../lib/ecsWeather';
import { missionExpeditionStore } from '../../lib/missionStore';
import { remotenessStore } from '../../lib/remotenessStore';
import { routeStore } from '../../lib/routeStore';
import type { WidgetRenderOptions } from './WidgetRenderers';

export type DashboardWidgetReadinessStatus =
  | 'live'
  | 'waiting'
  | 'disconnected'
  | 'unavailable'
  | 'error'
  | 'fallback';

export type DashboardWidgetActionKey =
  | 'open_power_connections'
  | 'open_telemetry_setup'
  | 'open_navigate'
  | 'open_fleet';

export interface DashboardWidgetReadinessDescriptor {
  status: DashboardWidgetReadinessStatus;
  badgeLabel: string;
  title: string;
  message: string;
  actionLabel?: string;
  actionKey?: DashboardWidgetActionKey;
  stale?: boolean;
}

interface DashboardWidgetReadinessContext {
  widgetData: any;
  renderOptions?: WidgetRenderOptions;
}

function createReadiness(params: DashboardWidgetReadinessDescriptor): DashboardWidgetReadinessDescriptor {
  return params;
}

function createDependencyReadiness(params: {
  status: DashboardWidgetReadinessStatus;
  badgeLabel: string;
  title: string;
  message: string;
  actionLabel?: string;
  actionKey?: DashboardWidgetActionKey;
  stale?: boolean;
}): DashboardWidgetReadinessDescriptor {
  return createReadiness(params);
}

function isTelemetryLive(telemetry: any): boolean {
  return Boolean(
    telemetry?.hasData &&
      (telemetry?.freshnessLabel === 'live' || telemetry?.freshnessLabel === 'reconnecting'),
  );
}

function isTelemetryStale(telemetry: any): boolean {
  return Boolean(
    telemetry?.hasData &&
      (telemetry?.isWithinGraceWindow ||
        telemetry?.freshnessLabel === 'stale' ||
        telemetry?.freshnessLabel === 'last_known'),
  );
}

function getVehicleResourceContext() {
  const activeVehicle = getActiveVehicleContext();
  const vehicleId = activeVehicle.activeVehicleId || '';
  const spec = activeVehicle.spec ?? null;
  const consumables = vehicleId ? consumablesStore.get(vehicleId) : null;

  const hasFuelContext = Boolean(
    (spec?.fuel_tank_capacity_gal ?? 0) > 0 ||
      activeVehicle.vehicle?.current_fuel_percent != null,
  );
  const hasWaterContext = Boolean(
    activeVehicle.resourceProfile.waterCapacityGal != null ||
      activeVehicle.vehicle?.current_water_gal != null,
  );
  const hasPowerProfile = Boolean(
    activeVehicle.resourceProfile.batteryUsableWh != null &&
      activeVehicle.resourceProfile.batteryUsableWh > 0,
  );
  const hasMechanicalContext = Boolean(
    activeVehicle.tiresLift?.tireSizeInches ||
      activeVehicle.tiresLift?.suspensionLiftInches ||
      activeVehicle.tiresLift?.isLeveled,
  );
  const hasLoadoutContext = Boolean(activeVehicle.loadout || activeVehicle.loadoutItemCount > 0);
  const hasAccessoryContext = Boolean(
    activeVehicle.accessoryInstalledCount > 0 ||
      activeVehicle.accessoryPlannedCount > 0,
  );

  return {
    activeVehicleId: activeVehicle.activeVehicleId,
    hasActiveVehicle: Boolean(activeVehicle.activeVehicleId),
    spec,
    consumables,
    hasFuelContext,
    hasWaterContext,
    hasPowerProfile,
    hasMechanicalContext,
    hasLoadoutContext,
    hasAccessoryContext,
    hasAnyContext:
      hasFuelContext ||
      hasWaterContext ||
      hasPowerProfile ||
      hasMechanicalContext ||
      hasLoadoutContext ||
      hasAccessoryContext,
  };
}

function readinessFromWeather(kind: ECSWeatherStatusKind | null | undefined): DashboardWidgetReadinessDescriptor {
  switch (kind) {
    case 'ready':
      return createDependencyReadiness({
        status: 'live',
        badgeLabel: 'LIVE WEATHER',
        title: 'Live weather active',
        message: 'Current weather is updating from the active ECS location context.',
      });
    case 'waiting_for_gps':
      return createDependencyReadiness({
        status: 'waiting',
        badgeLabel: 'WAITING FOR GPS',
        title: 'Waiting for live location',
        message: 'ECS needs a usable GPS fix before this widget can refresh current weather.',
      });
    case 'loading':
      return createDependencyReadiness({
        status: 'waiting',
        badgeLabel: 'LOADING WEATHER',
        title: 'Loading weather',
        message: 'Refreshing current weather conditions for this dashboard context.',
      });
    case 'stale':
      return createDependencyReadiness({
        status: 'fallback',
        badgeLabel: 'STALE WEATHER',
        title: 'Using cached weather',
        message: 'Showing the latest saved weather context until a fresh source responds.',
        stale: true,
      });
    case 'offline':
      return createDependencyReadiness({
        status: 'fallback',
        badgeLabel: 'OFFLINE CACHE',
        title: 'Offline weather support',
        message: 'Live weather is unavailable, so ECS is holding on the latest cached weather context.',
        stale: true,
      });
    case 'error':
      return createDependencyReadiness({
        status: 'error',
        badgeLabel: 'WEATHER ERROR',
        title: 'Weather temporarily unavailable',
        message: 'The weather source did not return a usable update. ECS will retry automatically.',
      });
    default:
      return createDependencyReadiness({
        status: 'unavailable',
        badgeLabel: 'UNAVAILABLE',
        title: 'Weather unavailable',
        message: 'No weather source is currently available for this widget.',
      });
  }
}

export function getDashboardWidgetReadiness(
  widgetType: string | null | undefined,
  { widgetData, renderOptions }: DashboardWidgetReadinessContext,
): DashboardWidgetReadinessDescriptor | null {
  if (!widgetType) return null;

  const telemetry = widgetData?.telemetry ?? null;
  const scanner = widgetData?.telemetryScanner ?? null;
  const powerAuthority = widgetData?.powerAuthority ?? null;
  const weatherSnapshot = widgetData?.weatherSnapshot ?? null;
  const hasGpsFix = renderOptions?.gpsHasFix ?? widgetData?.gps?.hasFix ?? false;
  const activeRoute = routeStore.getActive();
  const hasActiveRoute = Boolean(activeRoute);
  const remoteness = remotenessStore.get();
  const activeExpedition = missionExpeditionStore.getActive();
  const vehicleResources = getVehicleResourceContext();
  const hasActiveVehicle = vehicleResources.hasActiveVehicle;

  switch (widgetType) {
    case 'attitude-monitor':
      return createDependencyReadiness(
        renderOptions?.sensorStatus === 'LIVE' || renderOptions?.sensorStatus === 'CALIBRATED'
          ? {
              status: 'live',
              badgeLabel: 'LIVE SENSOR',
              title: 'Attitude monitor live',
              message: 'Pitch and roll are updating from the current device motion sensor.',
            }
          : renderOptions?.sensorStatus === 'AWAITING'
            ? {
                status: 'waiting',
                badgeLabel: 'WAITING FOR SENSOR',
                title: 'Waiting for motion sensor',
                message: 'Hold the device steady while ECS prepares live pitch and roll readings.',
              }
            : {
                status: 'unavailable',
                badgeLabel: 'SENSOR UNAVAILABLE',
                title: 'Motion sensor unavailable',
                message: 'Attitude monitoring is paused until device motion access is available again.',
              },
      );

    case 'vehicle-telemetry':
      if (!hasActiveVehicle) {
        return createDependencyReadiness({
          status: 'waiting',
          badgeLabel: 'NO ACTIVE VEHICLE',
          title: 'Select an active vehicle',
          message: 'Choose the current rig in Fleet before binding telemetry to vehicle context.',
          actionLabel: 'Open Fleet',
          actionKey: 'open_fleet',
        });
      }

      if (isTelemetryLive(telemetry)) {
        return createDependencyReadiness({
          status: 'live',
          badgeLabel: 'OBD LIVE',
          title: 'Telemetry connected',
          message: 'Live vehicle telemetry is currently feeding this widget.',
        });
      }

      if (scanner?.isConnecting || scanner?.isReconnecting) {
        return createDependencyReadiness({
          status: 'waiting',
          badgeLabel: 'CONNECTING',
          title: 'Connecting telemetry',
          message: 'ECS is trying to reconnect to the selected OBD-II adapter.',
          actionLabel: 'Connect Telemetry',
          actionKey: 'open_telemetry_setup',
        });
      }

      if (isTelemetryStale(telemetry)) {
        return createDependencyReadiness({
          status: 'fallback',
          badgeLabel: 'STALE TELEMETRY',
          title: 'Using last known telemetry',
          message: 'Showing the latest saved telemetry until the selected source reconnects.',
          actionLabel: 'Connect Telemetry',
          actionKey: 'open_telemetry_setup',
          stale: true,
        });
      }

      if (scanner?.error) {
        return createDependencyReadiness({
          status: 'error',
          badgeLabel: 'TELEMETRY ERROR',
          title: 'Telemetry connection failed',
          message: 'The current OBD-II source is unavailable. Reconnect telemetry to resume live updates.',
          actionLabel: 'Connect Telemetry',
          actionKey: 'open_telemetry_setup',
        });
      }

      return createDependencyReadiness({
        status: 'disconnected',
        badgeLabel: 'NO TELEMETRY',
        title: 'No telemetry source connected',
        message: 'Connect an OBD-II adapter to populate live vehicle telemetry.',
        actionLabel: 'Connect Telemetry',
        actionKey: 'open_telemetry_setup',
      });

    case 'vehicle-systems': {
      if (!hasActiveVehicle) {
        return createDependencyReadiness({
          status: 'waiting',
          badgeLabel: 'NO ACTIVE VEHICLE',
          title: 'Select an active vehicle',
          message: 'Choose the current rig in Fleet before ECS can resolve live vehicle system context.',
          actionLabel: 'Open Fleet',
          actionKey: 'open_fleet',
        });
      }

      const hasPowerContext = Boolean(
        powerAuthority?.isConnected ||
          powerAuthority?.hasPowerData ||
          powerAuthority?.deviceLabel ||
          powerAuthority?.providerLabel,
      );

      if (isTelemetryLive(telemetry)) {
        return createDependencyReadiness({
          status: 'live',
          badgeLabel: 'LIVE VEHICLE',
          title: 'Vehicle systems live',
          message: 'Vehicle systems are updating from the current telemetry feed.',
        });
      }

      if (isTelemetryStale(telemetry)) {
        return createDependencyReadiness({
          status: 'fallback',
          badgeLabel: 'STALE SYSTEMS',
          title: 'Using saved vehicle system state',
          message: 'Showing the latest saved system state until telemetry refreshes.',
          actionLabel: 'Connect Telemetry',
          actionKey: 'open_telemetry_setup',
          stale: true,
        });
      }

      if (vehicleResources.hasAnyContext || hasPowerContext) {
        return createDependencyReadiness({
          status: 'fallback',
          badgeLabel: hasPowerContext ? 'PROFILE + POWER' : 'PROFILE MODE',
          title: 'Using saved vehicle context',
          message: hasPowerContext
            ? 'Using saved vehicle and power context until live telemetry returns.'
            : 'Using the configured vehicle profile until live telemetry returns.',
          actionLabel: 'Connect Telemetry',
          actionKey: 'open_telemetry_setup',
        });
      }

      return createDependencyReadiness({
        status: 'disconnected',
        badgeLabel: 'SETUP REQUIRED',
        title: 'Vehicle systems not configured',
        message: 'Add a vehicle profile or connect telemetry before this widget can report system readiness.',
        actionLabel: 'Open Fleet',
        actionKey: 'open_fleet',
      });
    }

    case 'remoteness':
      if (!activeExpedition && !hasGpsFix) {
        return createDependencyReadiness({
          status: 'waiting',
          badgeLabel: 'LOCATION REQUIRED',
          title: 'Requires live location',
          message: 'Remoteness becomes available once ECS has live location context.',
        });
      }

      if (!hasGpsFix) {
        return createDependencyReadiness({
          status: 'waiting',
          badgeLabel: 'WAITING FOR GPS',
          title: 'Waiting for GPS',
          message: 'A location fix is required before ECS can assess current remoteness.',
        });
      }

      if (remoteness.signals.freshness === 'offline') {
        return createDependencyReadiness({
          status: 'fallback',
          badgeLabel: 'STALE CONTEXT',
          title: 'Using saved remoteness context',
          message: 'Location context is offline, so remoteness is running on the latest saved inputs.',
          stale: true,
        });
      }

      return createDependencyReadiness({
        status: 'live',
        badgeLabel: remoteness.signals.freshness === 'stale' ? 'STALE INDEX' : 'LIVE INDEX',
        title: remoteness.signals.freshness === 'stale' ? 'Using saved remoteness context' : 'Remoteness live',
        message: remoteness.reason || 'Current remoteness context is available.',
        stale: remoteness.signals.freshness === 'stale',
      });

    case 'progress':
    case 'navigate-surface':
      if (!hasActiveRoute) {
        return createDependencyReadiness({
          status: 'waiting',
          badgeLabel: 'NO ROUTE STAGED',
          title: 'No route staged',
          message: widgetType === 'navigate-surface'
            ? 'Open Navigate to stage a destination, preview a route, or activate a trail.'
            : 'Open Navigate to stage a route before progress tracking can begin.',
          actionLabel: 'Open Navigate',
          actionKey: 'open_navigate',
        });
      }

      if (!hasGpsFix) {
        return createDependencyReadiness({
          status: 'waiting',
          badgeLabel: 'WAITING FOR GPS',
          title: 'Waiting for live GPS',
          message: widgetType === 'navigate-surface'
            ? 'Navigate is showing staged route context until ECS regains a usable GPS fix.'
            : 'A location fix is required before route progress can track live movement.',
          actionLabel: 'Open Navigate',
          actionKey: 'open_navigate',
        });
      }

      return createDependencyReadiness({
        status: 'live',
        badgeLabel: widgetType === 'navigate-surface' ? 'NAVIGATE READY' : 'LIVE ROUTE',
        title: widgetType === 'navigate-surface' ? 'Navigate route ready' : 'Route progress live',
        message: widgetType === 'navigate-surface'
          ? 'Navigate has an active route and current location context.'
          : 'ECS is tracking progress against the active route.',
      });

    case 'hwy-forward-weather':
    case 'weather':
      return readinessFromWeather(weatherSnapshot?.status?.kind ?? null);

    case 'ecs-power':
    case 'power-systems':
      if (powerAuthority?.isReconnecting) {
        return createDependencyReadiness({
          status: 'waiting',
          badgeLabel: 'RECONNECTING',
          title: 'Reconnecting power source',
          message: 'ECS is attempting to reconnect to the selected power system.',
          actionLabel: 'Connect',
          actionKey: 'open_power_connections',
        });
      }

      if (powerAuthority?.isConnected || powerAuthority?.hasPowerData) {
        if (powerAuthority?.freshness === 'stale' || powerAuthority?.freshness === 'last_known') {
          return createDependencyReadiness({
            status: 'fallback',
            badgeLabel: 'STALE POWER',
            title: 'Using last known power state',
            message: 'Showing the latest saved power state until the device reconnects.',
            actionLabel: 'Manage Connection',
            actionKey: 'open_power_connections',
            stale: true,
          });
        }

        return createDependencyReadiness({
          status: 'live',
          badgeLabel: 'POWER CONNECTED',
          title: 'Power system connected',
          message: 'Shared ECS power telemetry is available for this widget.',
        });
      }

      if (vehicleResources.hasPowerProfile) {
        return createDependencyReadiness({
          status: 'fallback',
          badgeLabel: 'POWER PROFILE',
          title: 'Using saved power profile',
          message: 'ECS can use the saved vehicle power capacity until a live power device is connected.',
          actionLabel: 'Connect',
          actionKey: 'open_power_connections',
        });
      }

      return createDependencyReadiness({
        status: 'disconnected',
        badgeLabel: 'NO POWER DEVICE',
        title: 'No power device connected',
        message: 'Connect a supported power source to monitor reserve, flow, and runtime.',
        actionLabel: 'Connect',
        actionKey: 'open_power_connections',
      });

    case 'sustainability':
    case 'resource-forecast':
      if (!hasActiveVehicle) {
        return createDependencyReadiness({
          status: 'waiting',
          badgeLabel: 'NO ACTIVE VEHICLE',
          title: 'Select an active vehicle',
          message: 'Choose the current rig in Fleet before ECS can project vehicle resources.',
          actionLabel: 'Open Fleet',
          actionKey: 'open_fleet',
        });
      }

      if (vehicleResources.hasAnyContext || powerAuthority?.hasPowerData || powerAuthority?.isConnected) {
        return createDependencyReadiness({
          status: 'fallback',
          badgeLabel: 'RESOURCE PROFILE',
          title: 'Using configured resource context',
          message: 'ECS has enough saved vehicle resource context to estimate reserves and endurance.',
        });
      }

      return createDependencyReadiness({
        status: 'disconnected',
        badgeLabel: 'SETUP REQUIRED',
        title: 'Complete vehicle resources in Fleet',
        message: 'Fuel, water, or power resource setup is incomplete for this dashboard.',
        actionLabel: 'Open Fleet',
        actionKey: 'open_fleet',
      });

    case 'hwy-elevation-profile':
    case 'elevation':
    case 'terrain-risk':
      if (activeRoute?.elevation_gain_ft != null) {
        return createDependencyReadiness({
          status: 'live',
          badgeLabel: 'ROUTE TERRAIN',
          title: 'Route terrain loaded',
          message: 'Terrain and elevation context are available for the active route.',
        });
      }

      if (renderOptions?.gpsAltitudeFt != null || hasGpsFix) {
        return createDependencyReadiness({
          status: 'waiting',
          badgeLabel: 'LIVE ELEVATION',
          title: 'No route terrain profile loaded',
          message: 'ECS can show current elevation, but a route is required for terrain profile guidance.',
          actionLabel: 'Open Navigate',
          actionKey: 'open_navigate',
        });
      }

      return createDependencyReadiness({
        status: 'unavailable',
        badgeLabel: 'UNAVAILABLE',
        title: 'Elevation unavailable',
        message: 'A route terrain profile or live GPS altitude is required for this widget.',
        actionLabel: 'Open Navigate',
        actionKey: 'open_navigate',
      });

    case 'hwy-cell-coverage':
    case 'comms':
      if (remoteness.signals.connectivityState === 'online' && remoteness.signals.freshness === 'live') {
        return createDependencyReadiness({
          status: 'live',
          badgeLabel: 'CONNECTED',
          title: 'Signal context live',
          message: 'High-level connectivity status is currently available.',
        });
      }

      if (remoteness.signals.freshness === 'stale') {
        return createDependencyReadiness({
          status: 'fallback',
          badgeLabel: 'STALE SIGNAL',
          title: 'Using saved signal context',
          message: 'Showing the latest saved connectivity context until ECS refreshes signal state.',
          stale: true,
        });
      }

      if (remoteness.signals.connectivityState === 'degraded') {
        return createDependencyReadiness({
          status: 'waiting',
          badgeLabel: 'WEAK SIGNAL',
          title: 'Weak signal',
          message: 'Connectivity is limited and ECS only has partial signal context right now.',
        });
      }

      return createDependencyReadiness({
        status: 'unavailable',
        badgeLabel: 'NO SIGNAL DATA',
        title: 'Signal data unavailable',
        message: 'No radio or network source is currently available for this widget.',
      });

    default:
      return createDependencyReadiness({
        status: 'unavailable',
        badgeLabel: 'UNAVAILABLE',
        title: 'Widget data unavailable',
        message: 'This widget does not currently have a live ECS source connected.',
      });
  }
}
