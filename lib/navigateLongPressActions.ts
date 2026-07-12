export type NavigateLongPressCoordinate = {
  latitude: number;
  longitude: number;
};

export type NavigateLongPressRouteableFeature = {
  id?: string | number | null;
  kind?: string | null;
  name?: string | null;
  sourceLabel?: string | null;
  confidence?: string | null;
  dataState?: string | null;
  coordinates?: NavigateLongPressCoordinate[] | null;
  connectedSegments?: NavigateLongPressRouteableFeature[] | null;
  warnings?: string[] | null;
  accessLabel?: string | null;
  ownershipLabel?: string | null;
  landUseLabel?: string | null;
};

export type NavigateLongPressActionAvailability = {
  enabled: boolean;
  disabledReason: string | null;
};

export type NavigateLongPressContext = {
  coordinate: NavigateLongPressCoordinate;
  routeableFeature: NavigateLongPressRouteableFeature | null;
  actions: {
    draw_route: NavigateLongPressActionAvailability;
    add_waypoint: NavigateLongPressActionAvailability;
    info: NavigateLongPressActionAvailability;
    navigate_here: NavigateLongPressActionAvailability;
  };
  infoRows: { label: string; value: string }[];
};

export type BuildNavigateLongPressContextInput = {
  coordinate: Partial<NavigateLongPressCoordinate> | null | undefined;
  routeableFeature?: NavigateLongPressRouteableFeature | null;
  hasGpsFix?: boolean;
  canBuildRoute?: boolean;
};

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeCoordinate(
  coordinate: Partial<NavigateLongPressCoordinate> | null | undefined,
): NavigateLongPressCoordinate | null {
  const latitude = Number(coordinate?.latitude);
  const longitude = Number(coordinate?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

function isRouteableFeature(feature: NavigateLongPressRouteableFeature | null | undefined): boolean {
  const kind = String(feature?.kind ?? '').toLowerCase();
  return (
    kind === 'route_geometry_segment' ||
    kind === 'explore_route' ||
    kind === 'rendered_routeable_feature' ||
    kind === 'trail' ||
    kind === 'road' ||
    kind === 'track' ||
    kind === 'path' ||
    kind === 'street' ||
    kind.includes('route')
  );
}

function unavailable(reason: string): NavigateLongPressActionAvailability {
  return { enabled: false, disabledReason: reason };
}

function available(): NavigateLongPressActionAvailability {
  return { enabled: true, disabledReason: null };
}

export function buildNavigateLongPressContext(
  input: BuildNavigateLongPressContextInput,
): NavigateLongPressContext {
  const coordinate = normalizeCoordinate(input.coordinate) ?? { latitude: 0, longitude: 0 };
  const feature = input.routeableFeature ?? null;
  const routeable = isRouteableFeature(feature);
  const canBuildRoute = input.canBuildRoute !== false;
  const hasGpsFix = input.hasGpsFix !== false;

  const infoRows = [
    {
      label: 'Point',
      value: `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`,
    },
    {
      label: 'Source',
      value: cleanText(feature?.sourceLabel) ?? cleanText(feature?.name) ?? 'Unknown source',
    },
    {
      label: 'Confidence',
      value: cleanText(feature?.confidence) ?? 'Unknown',
    },
    {
      label: 'State',
      value: cleanText(feature?.dataState) ?? 'Unknown',
    },
    {
      label: 'Access',
      value: cleanText(feature?.accessLabel) ?? 'Unknown - verify posted rules and closures locally.',
    },
    {
      label: 'Ownership',
      value: cleanText(feature?.ownershipLabel) ?? cleanText(feature?.landUseLabel) ?? 'Unknown',
    },
  ];

  for (const warning of feature?.warnings ?? []) {
    const value = cleanText(warning);
    if (value) infoRows.push({ label: 'Warning', value });
  }

  return {
    coordinate,
    routeableFeature: feature,
    actions: {
      draw_route: canBuildRoute ? available() : unavailable('End active navigation before drawing a route.'),
      add_waypoint: available(),
      info: available(),
      navigate_here: routeable
        ? hasGpsFix
          ? available()
          : unavailable('GPS fix required before ECS can route from your location.')
        : unavailable('No routeable trail or road geometry is loaded for this point.'),
    },
    infoRows,
  };
}
