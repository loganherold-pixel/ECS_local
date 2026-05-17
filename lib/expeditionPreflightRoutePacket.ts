import type { ActiveVehicleContext } from './activeVehicleContext';
import type { ECSWeatherSnapshot } from './ecsWeather';
import type { MissionBrief } from './missionBriefEngine';
import type { NavigationHandoffPayload } from './navigationHandoffStore';
import type { ECSRun } from './runStore';
import type { SavedRouteAsset } from './savedRouteAssets';

export interface PreflightWaypointSummary {
  id: string;
  label: string;
  detail: string | null;
}

export interface ExpeditionPreflightRoutePacket {
  id: string;
  generatedAt: string;
  title: string;
  statusLabel: string;
  route: {
    title: string;
    sourceLabel: string;
    distanceLabel: string;
    sequenceLabel: string;
    primaryDetail: string;
  };
  waypoints: {
    trailhead: PreflightWaypointSummary | null;
    checkpoints: PreflightWaypointSummary[];
    destination: PreflightWaypointSummary | null;
  };
  weather: {
    status: string;
    headline: string;
    detail: string;
    caution: string | null;
  };
  readiness: {
    status: 'ready' | 'watch' | 'incomplete';
    vehicleLabel: string;
    detailLines: string[];
  };
  advisory: {
    headline: string;
    summary: string;
    lines: string[];
  };
}

export interface ExpeditionPreflightRoutePacketInput {
  asset: SavedRouteAsset | null;
  run?: ECSRun | null;
  payload?: NavigationHandoffPayload | null;
  weatherSnapshot?: ECSWeatherSnapshot | null;
  missionBrief?: MissionBrief | null;
  vehicleContext?: ActiveVehicleContext | null;
  routeHazard?: {
    headline?: string | null;
    summaryLine?: string | null;
    approachingLine?: string | null;
    detailLines?: string[] | null;
  } | null;
}

function formatMiles(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'Distance pending';
  return `${value.toFixed(1)} mi`;
}

function formatCoordinate(value: { lat: number; lng: number } | null | undefined): string | null {
  if (!value || !Number.isFinite(value.lat) || !Number.isFinite(value.lng)) return null;
  return `${value.lat.toFixed(4)}, ${value.lng.toFixed(4)}`;
}

function buildPoint(
  id: string,
  label: string,
  coordinate: { lat: number; lng: number } | null | undefined,
): PreflightWaypointSummary | null {
  const detail = formatCoordinate(coordinate);
  if (!detail) return null;
  return { id, label, detail };
}

function buildCheckpointSummary(payload: NavigationHandoffPayload | null | undefined): PreflightWaypointSummary[] {
  const waypoints = payload?.trailWaypoints ?? [];
  if (waypoints.length === 0) return [];

  const selected =
    waypoints.length <= 4
      ? waypoints
      : [
          waypoints[0],
          waypoints[Math.floor(waypoints.length / 2)],
          waypoints[waypoints.length - 1],
        ];

  return selected.slice(0, 4).map((waypoint, index) => ({
    id: waypoint.id || `checkpoint-${index}`,
    label: waypoint.name || waypoint.type || `Checkpoint ${index + 1}`,
    detail: formatCoordinate(waypoint.coordinate),
  }));
}

function buildRouteSequenceLabel(asset: SavedRouteAsset, run?: ECSRun | null): string {
  if (asset.kind === 'stitched') {
    return run?.points?.length
      ? `Stitched route sequence - ${run.points.length} route points`
      : 'Stitched route sequence';
  }
  if (asset.segmentCount && asset.segmentCount > 1) {
    return `${asset.segmentCount} route segments`;
  }
  return 'Single route plan';
}

function buildWeatherSummary(
  snapshot?: ECSWeatherSnapshot | null,
  routeHazard?: ExpeditionPreflightRoutePacketInput['routeHazard'],
): ExpeditionPreflightRoutePacket['weather'] {
  const current = snapshot?.current ?? null;
  const condition = current?.condition ?? current?.description ?? snapshot?.status.label ?? 'Weather snapshot pending';
  const temp = current?.temp != null ? `${Math.round(current.temp)}F` : null;
  const wind = current?.windSpeed != null ? `${Math.round(current.windSpeed)} mph wind` : null;
  const detail = [temp, wind, snapshot?.locationName].filter(Boolean).join(' - ') || 'Refresh weather before departure.';
  const caution =
    routeHazard?.summaryLine ??
    snapshot?.alerts?.[0]?.title ??
    (snapshot?.status.stale ? 'Weather data may be stale. Refresh before departure.' : null);

  return {
    status: snapshot?.status.label ?? (snapshot?.status.source === 'live' ? 'Live weather' : 'Weather snapshot'),
    headline: condition,
    detail,
    caution,
  };
}

function buildVehicleReadiness(
  vehicleContext?: ActiveVehicleContext | null,
): ExpeditionPreflightRoutePacket['readiness'] {
  if (!vehicleContext?.hasVehicleContext) {
    return {
      status: 'incomplete',
      vehicleLabel: 'Vehicle not selected',
      detailLines: ['Select or verify a vehicle profile before departure.'],
    };
  }

  const vehicleName =
    vehicleContext.vehicle?.name ||
    [vehicleContext.vehicle?.make, vehicleContext.vehicle?.model].filter(Boolean).join(' ') ||
    'Active vehicle';
  const resources = vehicleContext.resourceProfile;
  const fuelWaterLine =
    resources.currentFuelGallons > 0 || resources.currentWaterGallons > 0
      ? `Fuel ${resources.currentFuelGallons.toFixed(1)} gal / water ${resources.currentWaterGallons.toFixed(1)} gal staged`
      : vehicleContext.consumables
        ? 'Fuel/water baseline available'
        : 'Fuel/water baseline not set';
  const tireLiftParts = [
    resources.tireSizeInches != null ? `${resources.tireSizeInches}" tires` : null,
    resources.suspensionLiftInches > 0 ? `${resources.suspensionLiftInches}" suspension` : 'Stock suspension',
    resources.isLeveled
      ? `leveled${resources.frontLevelInches != null ? ` +${resources.frontLevelInches}" front` : ''}`
      : null,
  ].filter((line): line is string => !!line);
  const lines = [
    vehicleContext.spec ? 'Vehicle specs available' : 'Vehicle specs incomplete',
    fuelWaterLine,
    tireLiftParts.length > 0 ? tireLiftParts.join(' / ') : null,
    vehicleContext.loadoutItemCount > 0
      ? `${vehicleContext.loadoutItemCount} loadout items - ${Math.round(vehicleContext.loadoutTotalWeightLbs)} lb tracked`
      : 'Loadout not staged',
    vehicleContext.zoneSummary || null,
  ].filter((line): line is string => !!line);

  const missingCount = lines.filter((line) => line.includes('incomplete') || line.includes('not ')).length;
  return {
    status: missingCount > 1 ? 'watch' : 'ready',
    vehicleLabel: vehicleName,
    detailLines: lines.slice(0, 5),
  };
}

function buildAdvisorySummary(
  asset: SavedRouteAsset,
  missionBrief?: MissionBrief | null,
  routeHazard?: ExpeditionPreflightRoutePacketInput['routeHazard'],
): ExpeditionPreflightRoutePacket['advisory'] {
  const lines = [
    routeHazard?.approachingLine ?? null,
    ...(routeHazard?.detailLines ?? []),
    ...(missionBrief?.priorityMessage ? [missionBrief.priorityMessage] : []),
    ...(missionBrief?.operatorTasks ?? []).slice(0, 2).map((task) => task.title),
  ].filter((line): line is string => !!line);

  return {
    headline: missionBrief?.headline ?? `Preflight ready for ${asset.title}`,
    summary:
      missionBrief?.summary ??
      routeHazard?.summaryLine ??
      'Confirm route, weather, vehicle readiness, and key stops before departure.',
    lines: lines.slice(0, 4),
  };
}

export function buildExpeditionPreflightRoutePacket(
  input: ExpeditionPreflightRoutePacketInput,
): ExpeditionPreflightRoutePacket | null {
  const asset = input.asset;
  if (!asset) return null;

  const payload = input.payload ?? null;
  const distanceMiles = asset.distanceMiles ?? payload?.trailLengthMiles ?? input.run?.stats.distance_miles ?? null;
  const trailhead =
    buildPoint('trailhead', 'Trailhead / Start', payload?.trailheadCoordinate ?? payload?.roadDestinationCoordinate) ??
    buildPoint('route-start', 'Route Start', payload?.trailGeometry?.[0]);
  const destination =
    buildPoint('destination', 'Destination / Route End', payload?.coordinate) ??
    buildPoint('route-end', 'Route End', payload?.trailGeometry?.[payload.trailGeometry.length - 1]);
  const checkpoints = buildCheckpointSummary(payload);
  const readiness = buildVehicleReadiness(input.vehicleContext);
  const weather = buildWeatherSummary(input.weatherSnapshot, input.routeHazard);
  const advisory = buildAdvisorySummary(asset, input.missionBrief, input.routeHazard);
  const statusLabel =
    readiness.status === 'incomplete'
      ? 'Preflight incomplete'
      : weather.caution
        ? 'Preflight watch'
        : 'Preflight ready';

  return {
    id: `preflight:${asset.id}`,
    generatedAt: new Date().toISOString(),
    title: `${asset.title} Preflight`,
    statusLabel,
    route: {
      title: asset.title,
      sourceLabel: asset.sourceLabel,
      distanceLabel: formatMiles(distanceMiles),
      sequenceLabel: buildRouteSequenceLabel(asset, input.run),
      primaryDetail: asset.subtitle ?? payload?.subtitle ?? 'Saved route asset ready for launch review.',
    },
    waypoints: {
      trailhead,
      checkpoints,
      destination,
    },
    weather,
    readiness,
    advisory,
  };
}
