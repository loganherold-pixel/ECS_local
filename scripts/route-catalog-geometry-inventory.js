#!/usr/bin/env node
const { loadRouteCatalogEnv } = require('./route-catalog-env.js');

const DEFAULT_LIMIT = 500;
const DEFAULT_RADIUS_MILES = 75;
const DEFAULT_MAX_GAP_METERS = 250;
const EARTH_RADIUS_M = 6371000;

function readNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanString(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    dryRun: false,
    json: false,
    geojson: false,
    markdown: false,
    latitude: null,
    longitude: null,
    radiusMiles: DEFAULT_RADIUS_MILES,
    limit: DEFAULT_LIMIT,
    maxGapMeters: DEFAULT_MAX_GAP_METERS,
    sourceAdapter: null,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`${arg} requires a value`);
      return argv[index];
    };

    switch (arg) {
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--json':
        options.json = true;
        break;
      case '--geojson':
        options.geojson = true;
        break;
      case '--markdown':
        options.markdown = true;
        break;
      case '--latitude':
      case '--lat':
        options.latitude = readNumber(next());
        break;
      case '--longitude':
      case '--lng':
      case '--lon':
        options.longitude = readNumber(next());
        break;
      case '--radius':
      case '--radius-miles':
        options.radiusMiles = readNumber(next(), DEFAULT_RADIUS_MILES);
        break;
      case '--limit':
        options.limit = Math.max(1, Math.round(readNumber(next(), DEFAULT_LIMIT)));
        break;
      case '--max-gap-meters':
        options.maxGapMeters = Math.max(0, readNumber(next(), DEFAULT_MAX_GAP_METERS));
        break;
      case '--source-adapter':
        options.sourceAdapter = cleanString(next());
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function buildRouteCatalogSearchBody(criteria) {
  return {
    limit: criteria.limit ?? DEFAULT_LIMIT,
    includeGeometry: false,
    includePreviewGeometry: true,
    includeAssessment: true,
    recommendationOnly: true,
    ...(Number.isFinite(criteria.latitude) &&
    Number.isFinite(criteria.longitude) &&
    Number.isFinite(criteria.radiusMiles)
      ? {
          latitude: criteria.latitude,
          longitude: criteria.longitude,
          radiusMiles: criteria.radiusMiles,
        }
      : {}),
    ...(criteria.sourceAdapter ? { sourceAdapter: criteria.sourceAdapter } : {}),
  };
}

function routeCatalogSearchUrl(baseUrl) {
  return `${String(baseUrl).replace(/\/+$/, '')}/functions/v1/route-catalog-search`;
}

async function fetchRouteCatalogSearch(criteria, env = process.env) {
  if (!Number.isFinite(criteria.latitude) || !Number.isFinite(criteria.longitude)) {
    throw new Error('Live geometry inventory requires --latitude and --longitude. Use --dry-run for fixture mode.');
  }

  loadRouteCatalogEnv({ env });
  const supabaseUrl = env.ECS_SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY || env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    throw new Error('Live geometry inventory requires ECS_SUPABASE_URL/EXPO_PUBLIC_SUPABASE_URL and SUPABASE_ANON_KEY/EXPO_PUBLIC_SUPABASE_ANON_KEY.');
  }

  const response = await fetch(routeCatalogSearchUrl(supabaseUrl), {
    method: 'POST',
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${anonKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(buildRouteCatalogSearchBody(criteria)),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`route-catalog-search HTTP ${response.status}: ${typeof data?.error === 'string' ? data.error : text}`);
  }
  return data;
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function distanceMeters(left, right) {
  const dLat = toRadians(right.latitude - left.latitude);
  const dLon = toRadians(right.longitude - left.longitude);
  const lat1 = toRadians(left.latitude);
  const lat2 = toRadians(right.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function bearingDegrees(left, right) {
  const lat1 = toRadians(left.latitude);
  const lat2 = toRadians(right.latitude);
  const dLon = toRadians(right.longitude - left.longitude);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
}

function coordinatePoint(value) {
  if (Array.isArray(value) && value.length >= 2) {
    const longitude = readNumber(value[0]);
    const latitude = readNumber(value[1]);
    if (
      latitude != null &&
      longitude != null &&
      Math.abs(latitude) <= 90 &&
      Math.abs(longitude) <= 180
    ) {
      return { latitude, longitude };
    }
  }
  if (value && typeof value === 'object') {
    const latitude = readNumber(value.latitude ?? value.lat ?? value.y);
    const longitude = readNumber(value.longitude ?? value.lng ?? value.lon ?? value.x);
    if (
      latitude != null &&
      longitude != null &&
      Math.abs(latitude) <= 90 &&
      Math.abs(longitude) <= 180
    ) {
      return { latitude, longitude };
    }
  }
  return null;
}

function normalizeLineString(value) {
  if (!Array.isArray(value)) return [];
  return value.map(coordinatePoint).filter(Boolean);
}

function flattenRouteGeometryToLegs(routeGeometry) {
  if (!routeGeometry || typeof routeGeometry !== 'object') return [];
  const type = String(routeGeometry.type ?? '').toLowerCase();
  const coordinates = routeGeometry.coordinates;
  const lines =
    type === 'linestring'
      ? [normalizeLineString(coordinates)]
      : type === 'multilinestring' && Array.isArray(coordinates)
        ? coordinates.map(normalizeLineString)
        : [];

  return lines
    .filter((points) => points.length >= 2)
    .map((points, index) => {
      const distance = points.reduce((total, point, pointIndex) => {
        if (pointIndex === 0) return total;
        return total + distanceMeters(points[pointIndex - 1], point);
      }, 0);
      return {
        legIndex: index,
        pointCount: points.length,
        distanceMeters: Math.round(distance),
        distanceMiles: Math.round((distance / 1609.344) * 1000) / 1000,
        start: points[0],
        end: points[points.length - 1],
        points,
      };
    });
}

function routeId(record, index = 0) {
  return String(
    record?.publicId ??
    record?.public_id ??
    record?.id ??
    record?.route_id ??
    `route-${index + 1}`,
  );
}

function routeName(record, id) {
  return String(record?.name ?? record?.title ?? id);
}

function routeGeometry(record) {
  return record?.routeGeometry ?? record?.route_geometry ?? record?.geometry ?? null;
}

function sourceAdapter(record) {
  const sourceRecords = record?.sourceRecords ?? record?.source_records;
  if (Array.isArray(sourceRecords) && sourceRecords.length > 0) {
    const provider = sourceRecords[0]?.providerId ?? sourceRecords[0]?.provider_id;
    if (provider) return String(provider);
  }
  return cleanString(record?.sourceAdapter ?? record?.source_adapter) ?? null;
}

function rawRecordsFromResponse(response) {
  if (Array.isArray(response)) return response;
  if (!response || typeof response !== 'object') return [];
  if (Array.isArray(response.records)) return response.records;
  if (Array.isArray(response.routes)) return response.routes;
  if (Array.isArray(response.data)) return response.data;
  return [];
}

function buildRouteLegSegments(route, leg) {
  const segments = [];
  for (let index = 1; index < leg.points.length; index += 1) {
    const start = leg.points[index - 1];
    const end = leg.points[index];
    const segmentDistanceMeters = distanceMeters(start, end);
    segments.push({
      routeId: route.routeId,
      routeName: route.name,
      legId: leg.legId,
      segmentId: `${leg.legId}:segment-${index}`,
      legIndex: leg.legIndex,
      segmentIndex: index - 1,
      start,
      end,
      distanceMeters: Math.round(segmentDistanceMeters),
      distanceMiles: Math.round((segmentDistanceMeters / 1609.344) * 1000) / 1000,
      bearingDegrees: bearingDegrees(start, end),
    });
  }
  return segments;
}

function buildEndpointList(routes) {
  return routes.flatMap((route) =>
    route.legs.flatMap((leg) => [
      {
        routeId: route.routeId,
        routeName: route.name,
        legId: leg.legId,
        endpoint: 'start',
        coordinate: leg.start,
      },
      {
        routeId: route.routeId,
        routeName: route.name,
        legId: leg.legId,
        endpoint: 'end',
        coordinate: leg.end,
      },
    ]),
  );
}

function buildStitchCandidates(routes, maxGapMeters) {
  const endpoints = buildEndpointList(routes);
  const candidates = [];
  for (let leftIndex = 0; leftIndex < endpoints.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < endpoints.length; rightIndex += 1) {
      const left = endpoints[leftIndex];
      const right = endpoints[rightIndex];
      if (left.routeId === right.routeId) continue;
      const gap = distanceMeters(left.coordinate, right.coordinate);
      if (gap > maxGapMeters) continue;
      candidates.push({
        distanceMeters: Math.round(gap),
        distanceMiles: Math.round((gap / 1609.344) * 1000) / 1000,
        from: left,
        to: right,
      });
    }
  }
  return candidates
    .sort((left, right) => left.distanceMeters - right.distanceMeters)
    .slice(0, 100);
}

function buildInterLegGaps(legs) {
  const gaps = [];
  for (let index = 1; index < legs.length; index += 1) {
    const previous = legs[index - 1];
    const current = legs[index];
    const gap = distanceMeters(previous.end, current.start);
    gaps.push({
      fromLegId: previous.legId,
      toLegId: current.legId,
      distanceMeters: Math.round(gap),
      distanceMiles: Math.round((gap / 1609.344) * 1000) / 1000,
    });
  }
  return gaps;
}

function buildGeometryInventoryFromRouteCatalogResponse(response, options = {}) {
  const maxGapMeters = Number.isFinite(Number(options.maxGapMeters))
    ? Number(options.maxGapMeters)
    : DEFAULT_MAX_GAP_METERS;
  const records = rawRecordsFromResponse(response);
  const routes = records.map((record, index) => {
    const id = routeId(record, index);
    const baseRoute = {
      routeId: id,
      name: routeName(record, id),
      sourceAdapter: sourceAdapter(record),
      distanceMiles: readNumber(record?.distanceMiles ?? record?.distance_miles),
      geometryType: String(routeGeometry(record)?.type ?? 'missing'),
    };
    const legs = flattenRouteGeometryToLegs(routeGeometry(record)).map((leg) => ({
      ...leg,
      routeId: id,
      routeName: baseRoute.name,
      legId: `${id}:leg-${leg.legIndex + 1}`,
    }));
    const route = {
      ...baseRoute,
      geometryStatus: legs.length > 0 ? 'geometry_available' : 'missing_geometry',
      legCount: legs.length,
      segmentCount: legs.reduce((total, leg) => total + Math.max(0, leg.pointCount - 1), 0),
      interLegGaps: buildInterLegGaps(legs),
      legs: legs.map((leg) => ({
        ...leg,
        segments: [],
      })),
    };
    route.legs = route.legs.map((leg) => ({
      ...leg,
      segments: buildRouteLegSegments(route, leg),
      points: undefined,
    }));
    return route;
  });

  const segments = routes.flatMap((route) => route.legs.flatMap((leg) => leg.segments));
  const routesWithGeometry = routes.filter((route) => route.geometryStatus === 'geometry_available').length;
  const stitchCandidates = buildStitchCandidates(routes, maxGapMeters);

  return {
    generatedAt: new Date().toISOString(),
    maxGapMeters,
    summary: {
      routeCount: routes.length,
      routesWithGeometry,
      missingGeometryRoutes: routes.length - routesWithGeometry,
      legCount: routes.reduce((total, route) => total + route.legCount, 0),
      segmentCount: segments.length,
      stitchCandidateCount: stitchCandidates.length,
    },
    routes,
    segments,
    stitchCandidates,
  };
}

function pointToGeoJsonCoordinate(point) {
  return [point.longitude, point.latitude];
}

function legGeoJsonCoordinates(leg) {
  if (Array.isArray(leg.points) && leg.points.length >= 2) {
    return leg.points.map(pointToGeoJsonCoordinate);
  }
  if (!Array.isArray(leg.segments) || leg.segments.length === 0) return [];
  return [
    pointToGeoJsonCoordinate(leg.segments[0].start),
    ...leg.segments.map((segment) => pointToGeoJsonCoordinate(segment.end)),
  ];
}

function buildGeometryInventoryGeoJson(inventory) {
  const features = [];

  inventory.routes.forEach((route) => {
    const routeCoordinates = route.legs
      .map(legGeoJsonCoordinates)
      .filter((coordinates) => coordinates.length >= 2);

    if (routeCoordinates.length === 0) {
      features.push({
        type: 'Feature',
        geometry: null,
        properties: {
          kind: 'missing_geometry',
          routeId: route.routeId,
          routeName: route.name,
          sourceAdapter: route.sourceAdapter,
          geometryStatus: route.geometryStatus,
        },
      });
      return;
    }

    features.push({
      type: 'Feature',
      geometry:
        routeCoordinates.length === 1
          ? { type: 'LineString', coordinates: routeCoordinates[0] }
          : { type: 'MultiLineString', coordinates: routeCoordinates },
      properties: {
        kind: 'route',
        routeId: route.routeId,
        routeName: route.name,
        sourceAdapter: route.sourceAdapter,
        geometryStatus: route.geometryStatus,
        legCount: route.legCount,
        segmentCount: route.segmentCount,
        distanceMiles: route.distanceMiles,
      },
    });

    route.legs.forEach((leg) => {
      const coordinates = legGeoJsonCoordinates(leg);
      if (coordinates.length < 2) return;
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates },
        properties: {
          kind: 'leg',
          routeId: route.routeId,
          routeName: route.name,
          legId: leg.legId,
          legIndex: leg.legIndex,
          pointCount: leg.pointCount,
          segmentCount: leg.segments.length,
          distanceMeters: leg.distanceMeters,
          distanceMiles: leg.distanceMiles,
        },
      });
    });
  });

  inventory.segments.forEach((segment) => {
    features.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          pointToGeoJsonCoordinate(segment.start),
          pointToGeoJsonCoordinate(segment.end),
        ],
      },
      properties: {
        kind: 'segment',
        routeId: segment.routeId,
        routeName: segment.routeName,
        legId: segment.legId,
        segmentId: segment.segmentId,
        legIndex: segment.legIndex,
        segmentIndex: segment.segmentIndex,
        distanceMeters: segment.distanceMeters,
        distanceMiles: segment.distanceMiles,
        bearingDegrees: segment.bearingDegrees,
      },
    });
  });

  inventory.stitchCandidates.forEach((candidate, index) => {
    features.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          pointToGeoJsonCoordinate(candidate.from.coordinate),
          pointToGeoJsonCoordinate(candidate.to.coordinate),
        ],
      },
      properties: {
        kind: 'stitch_candidate',
        stitchCandidateId: `stitch-candidate-${index + 1}`,
        distanceMeters: candidate.distanceMeters,
        distanceMiles: candidate.distanceMiles,
        fromRouteId: candidate.from.routeId,
        fromRouteName: candidate.from.routeName,
        fromLegId: candidate.from.legId,
        fromEndpoint: candidate.from.endpoint,
        toRouteId: candidate.to.routeId,
        toRouteName: candidate.to.routeName,
        toLegId: candidate.to.legId,
        toEndpoint: candidate.to.endpoint,
      },
    });
  });

  return {
    type: 'FeatureCollection',
    properties: {
      generatedAt: inventory.generatedAt,
      maxGapMeters: inventory.maxGapMeters,
      summary: inventory.summary,
    },
    features,
  };
}

function fixtureRecord(id, geometry, overrides = {}) {
  return {
    id,
    public_id: id,
    name: overrides.name ?? id,
    source_records: [{ provider_id: overrides.sourceAdapter ?? 'fixture_trails' }],
    distance_miles: overrides.distanceMiles ?? 12,
    route_geometry: geometry,
  };
}

function buildDryRunRouteCatalogGeometryResponse() {
  return {
    records: [
      fixtureRecord('fixture-route-a', {
        type: 'LineString',
        coordinates: [
          [-109.5, 38.5],
          [-109.501, 38.501],
          [-109.502, 38.502],
        ],
      }, { name: 'Fixture Route A' }),
      fixtureRecord('fixture-route-b', {
        type: 'MultiLineString',
        coordinates: [
          [
            [-109.5024, 38.5024],
            [-109.503, 38.503],
          ],
          [
            [-109.5032, 38.5032],
            [-109.504, 38.504],
          ],
        ],
      }, { name: 'Fixture Route B' }),
      fixtureRecord('fixture-route-missing', null, { name: 'Fixture Missing Geometry' }),
    ],
  };
}

function formatGeometryInventoryMarkdown(inventory) {
  const lines = [
    '# Route Catalog Geometry Inventory',
    '',
    `Generated: ${inventory.generatedAt}`,
    `Max stitch gap: ${inventory.maxGapMeters} m`,
    '',
    '| Metric | Count |',
    '| --- | ---: |',
    `| Routes | ${inventory.summary.routeCount} |`,
    `| Routes With Geometry | ${inventory.summary.routesWithGeometry} |`,
    `| Missing Geometry | ${inventory.summary.missingGeometryRoutes} |`,
    `| Legs | ${inventory.summary.legCount} |`,
    `| Segments | ${inventory.summary.segmentCount} |`,
    `| Stitch Candidates | ${inventory.summary.stitchCandidateCount} |`,
    '',
    '## Routes',
  ];

  inventory.routes.slice(0, 25).forEach((route) => {
    lines.push(`- ${route.name} (${route.routeId}): ${route.legCount} leg(s), ${route.segmentCount} segment(s), ${route.geometryStatus}`);
  });

  lines.push('', '## Legs');
  const legs = inventory.routes.flatMap((route) => route.legs);
  if (legs.length === 0) {
    lines.push('- None');
  } else {
    legs.slice(0, 25).forEach((leg) => {
      lines.push(
        `- ${leg.routeName} / ${leg.legId}: ${leg.pointCount} points, ${leg.distanceMiles} mi, ${leg.segments.length} segment(s)`,
      );
    });
  }

  lines.push('', '## Segments');
  if (inventory.segments.length === 0) {
    lines.push('- None');
  } else {
    inventory.segments.slice(0, 25).forEach((segment) => {
      lines.push(
        `- ${segment.routeName} / ${segment.segmentId}: ${segment.distanceMeters} m, bearing ${segment.bearingDegrees} deg`,
      );
    });
  }

  lines.push('', '## Stitch Candidates');
  if (inventory.stitchCandidates.length === 0) {
    lines.push('- None');
  } else {
    inventory.stitchCandidates.slice(0, 25).forEach((candidate) => {
      lines.push(
        `- ${candidate.from.routeName} ${candidate.from.endpoint} -> ${candidate.to.routeName} ${candidate.to.endpoint}: ${candidate.distanceMeters} m`,
      );
    });
  }

  lines.push('', '## Missing Geometry');
  const missingRoutes = inventory.routes.filter((route) => route.geometryStatus === 'missing_geometry');
  if (missingRoutes.length === 0) {
    lines.push('- None');
  } else {
    missingRoutes.slice(0, 25).forEach((route) => {
      lines.push(`- ${route.name} (${route.routeId})`);
    });
  }

  return `${lines.join('\n')}\n`;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/route-catalog-geometry-inventory.js --dry-run --json',
    '  node scripts/route-catalog-geometry-inventory.js --latitude 38.5 --longitude -109.5 --radius 75 --json',
    '',
    'Options:',
    '  --dry-run                 Use deterministic fixture records.',
    '  --json                    Print JSON output.',
    '  --geojson                 Print route/leg/segment/stitch features as GeoJSON.',
    '  --markdown                Print markdown output.',
    '  --latitude, --longitude   Live route-catalog search center.',
    '  --radius                  Search radius in miles. Default: 75.',
    '  --limit                   Route catalog search limit. Default: 500.',
    '  --source-adapter          Optional source adapter filter.',
    '  --max-gap-meters          Endpoint gap threshold for stitch candidates. Default: 250.',
  ].join('\n');
}

async function main() {
  const criteria = parseArgs(process.argv.slice(2));
  if (criteria.help) {
    console.log(usage());
    return;
  }

  const routeCatalogResponse = criteria.dryRun
    ? buildDryRunRouteCatalogGeometryResponse()
    : await fetchRouteCatalogSearch(criteria);
  const inventory = buildGeometryInventoryFromRouteCatalogResponse(routeCatalogResponse, {
    maxGapMeters: criteria.maxGapMeters,
  });
  const output = {
    mode: criteria.dryRun ? 'dry-run' : 'live',
    routeCatalogRequest: buildRouteCatalogSearchBody(criteria),
    inventory,
  };

  if (criteria.geojson) {
    console.log(JSON.stringify(buildGeometryInventoryGeoJson(inventory), null, 2));
    return;
  }

  if (criteria.json) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  console.log(formatGeometryInventoryMarkdown(inventory));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Route catalog geometry inventory failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

module.exports = {
  buildDryRunRouteCatalogGeometryResponse,
  buildGeometryInventoryGeoJson,
  buildGeometryInventoryFromRouteCatalogResponse,
  buildRouteCatalogSearchBody,
  buildRouteLegSegments,
  fetchRouteCatalogSearch,
  flattenRouteGeometryToLegs,
  formatGeometryInventoryMarkdown,
  parseArgs,
};
