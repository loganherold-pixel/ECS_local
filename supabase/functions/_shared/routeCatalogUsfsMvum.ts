export type UsfsMvumForest = {
  slug: string;
  forestName: string;
  sourceProviderId: string;
  sourceName: string;
  sourceUri: string;
};

export type UsfsMvumLayer = {
  kind: 'road' | 'trail';
  sourceLayer: string;
  url: string;
  statusField: 'ROUTESTATU' | 'TRAILSTATU';
  namePrefix: 'FR' | 'Trail';
};

export type UsfsMvumArcGisFeature = {
  attributes?: Record<string, unknown>;
  geometry?: {
    paths?: unknown;
  };
};

export type UsfsMvumRouteContext = {
  forest: UsfsMvumForest;
  layer: UsfsMvumLayer;
  sourceId: string;
  sourceLastVerifiedAt: string;
  ingestRunId?: string | null;
  minMiles?: number;
  publicRecommendation?: boolean;
};

export type UsfsMvumRouteUpsert = NonNullable<ReturnType<typeof arcGisFeatureToVerifiedRouteUpsert>>;

export type UsfsMvumAggregateRouteUpsert = {
  verifiedRoute: Record<string, unknown>;
  verifiedRouteSource: Record<string, unknown>;
  segmentPublicIds: string[];
  segmentProviderFeatureIds: string[];
};

export type UsfsMvumActiveGuidanceStatus = 'ready' | 'preview_only' | 'unavailable';

export type UsfsMvumTopologyAssessment = {
  status: UsfsMvumActiveGuidanceStatus;
  topologyResolved: boolean;
  sourceSegmentCount: number;
  componentCount: number;
  branchDetected: boolean;
  joinedSegmentGapCount: number;
  disjointSegmentGapCount: number;
  maxJoinGapMeters: number | null;
  maxSegmentGapMeters: number | null;
  unavailableReason: string | null;
};

export const USFS_MVUM_PILOT_FORESTS: UsfsMvumForest[] = [
  {
    slug: 'tahoe-national-forest',
    forestName: 'Tahoe National Forest',
    sourceProviderId: 'usfs_mvum_tahoe_nf',
    sourceName: 'USFS MVUM - Tahoe National Forest',
    sourceUri: 'https://www.fs.usda.gov/detail/tahoe/maps-pubs/?cid=fseprd638275',
  },
  {
    slug: 'mendocino-national-forest',
    forestName: 'Mendocino National Forest',
    sourceProviderId: 'usfs_mvum_mendocino_nf',
    sourceName: 'USFS MVUM - Mendocino National Forest',
    sourceUri: 'https://www.fs.usda.gov/detail/mendocino/maps-pubs/?cid=stelprdb5142646',
  },
];

export const USFS_MVUM_LAYERS: UsfsMvumLayer[] = [
  {
    kind: 'road',
    sourceLayer: 'Motor Vehicle Use Map: Roads',
    url: 'https://services.arcgis.com/xOi1kZaI0eWDREZv/ArcGIS/rest/services/Motor_Vehicle_Use_Map_Roads/FeatureServer/0',
    statusField: 'ROUTESTATU',
    namePrefix: 'FR',
  },
  {
    kind: 'trail',
    sourceLayer: 'Motor Vehicle Use Map: Trails',
    url: 'https://services.arcgis.com/xOi1kZaI0eWDREZv/ArcGIS/rest/services/Motor_Vehicle_Use_Maps_Trails/FeatureServer/0',
    statusField: 'TRAILSTATU',
    namePrefix: 'Trail',
  },
];

const ROUTE_CATALOG_MVUM_WARNING =
  'USFS MVUM is a legal baseline only; current closures, fire restrictions, weather, gates, and passability still require current checks.';
const ACTIVE_GUIDANCE_JOIN_GAP_MAX_METERS = 120;

function cleanString(value: unknown): string {
  return String(value ?? '').trim();
}

function cleanNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140);
}

function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function normalizeOpenFlag(value: unknown): boolean {
  return /^open$/i.test(cleanString(value));
}

function addDaysIso(isoDate: string, days: number): string {
  const date = new Date(isoDate);
  if (!Number.isFinite(date.getTime())) return isoDate;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function stablePayloadHash(value: unknown): string {
  const json = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < json.length; index += 1) {
    hash ^= json.charCodeAt(index);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function normalizePath(value: unknown): number[][] {
  if (!Array.isArray(value)) return [];
  return value
    .map((point) => {
      if (!Array.isArray(point) || point.length < 2) return null;
      const longitude = Number(point[0]);
      const latitude = Number(point[1]);
      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        Math.abs(latitude) > 90 ||
        Math.abs(longitude) > 180
      ) {
        return null;
      }
      return [Number(longitude.toFixed(6)), Number(latitude.toFixed(6))];
    })
    .filter((point): point is number[] => !!point);
}

function normalizePaths(feature: UsfsMvumArcGisFeature): number[][][] {
  const rawPaths = feature.geometry?.paths;
  if (!Array.isArray(rawPaths)) return [];
  return rawPaths.map(normalizePath).filter((path) => path.length >= 2);
}

function centerFromPaths(paths: number[][][]): { latitude: number; longitude: number } | null {
  const points = paths.flat();
  if (points.length === 0) return null;
  const totals = points.reduce(
    (acc, point) => ({
      longitude: acc.longitude + point[0],
      latitude: acc.latitude + point[1],
    }),
    { latitude: 0, longitude: 0 },
  );
  return {
    latitude: Number((totals.latitude / points.length).toFixed(6)),
    longitude: Number((totals.longitude / points.length).toFixed(6)),
  };
}

function routeGeometryFromPaths(paths: number[][][]): { type: 'LineString' | 'MultiLineString'; coordinates: number[][] | number[][][] } | null {
  if (paths.length === 0) return null;
  if (paths.length === 1) return { type: 'LineString', coordinates: paths[0] };
  return { type: 'MultiLineString', coordinates: paths };
}

function vehicleFitFromAttributes(attributes: Record<string, unknown>): string[] {
  const fit = new Set<string>();
  if (normalizeOpenFlag(attributes.PASSENGERV)) fit.add('highway_legal_4x4');
  if (normalizeOpenFlag(attributes.HIGHCLEARA) || normalizeOpenFlag(attributes.FOURWD_GT5)) {
    fit.add('full_size_4x4');
  }
  if (normalizeOpenFlag(attributes.ATV)) fit.add('atv');
  if (normalizeOpenFlag(attributes.OTHER_OHV_) || normalizeOpenFlag(attributes.OTHER_OHV1)) fit.add('utv');
  if (normalizeOpenFlag(attributes.MOTORCYCLE)) fit.add('motorcycle');
  return Array.from(fit);
}

function orderedVehicleFit(values: string[]): string[] {
  const order = ['highway_legal_4x4', 'full_size_4x4', 'atv', 'utv', 'motorcycle'];
  const unique = new Set(values);
  return order.filter((value) => unique.has(value));
}

function routeName(layer: UsfsMvumLayer, attributes: Record<string, unknown>): string {
  const id = cleanString(attributes.ID || attributes.FIELD_ID || attributes.RTE_CN);
  const rawName = cleanString(attributes.NAME);
  const titleName = rawName ? toTitleCase(rawName) : '';
  if (id && titleName) return `${layer.namePrefix} ${id} ${titleName}`;
  if (id) return `${layer.namePrefix} ${id}`;
  if (titleName) return `${layer.namePrefix} ${titleName}`;
  return `${layer.namePrefix} MVUM Route`;
}

function providerFeatureId(layer: UsfsMvumLayer, attributes: Record<string, unknown>): string {
  const id = cleanString(attributes.ID || attributes.FIELD_ID || attributes.RTE_CN || attributes.GLOBALID || 'unknown');
  const fid = cleanString(attributes.FID || attributes.OBJECTID || attributes.GLOBALID || '0');
  return `${layer.kind}:${id || 'unknown'}:${fid || '0'}`;
}

function sourceFeatureKey(attributes: Record<string, unknown>): string {
  return cleanString(attributes.FID || attributes.OBJECTID || attributes.GLOBALID || '0') || '0';
}

function aggregationIdentity(layer: UsfsMvumLayer, attributes: Record<string, unknown>) {
  const id = cleanString(attributes.ID || attributes.FIELD_ID || attributes.RTE_CN);
  const rawName = cleanString(attributes.NAME);
  const name = rawName ? toTitleCase(rawName) : '';
  const keyParts = [layer.kind, id, name].filter(Boolean);
  if (keyParts.length === 1) return null;
  return {
    key: slugify(keyParts.join(' ')),
    publicIdParts: ['usfs-mvum', layer.kind, id, name].filter(Boolean),
    id,
    name,
  };
}

function lineStringsFromRouteGeometry(routeGeometry: Record<string, unknown>): number[][][] {
  if (routeGeometry.type === 'LineString' && Array.isArray(routeGeometry.coordinates)) {
    const path = normalizePath(routeGeometry.coordinates);
    return path.length >= 2 ? [path] : [];
  }
  if (routeGeometry.type === 'MultiLineString' && Array.isArray(routeGeometry.coordinates)) {
    return routeGeometry.coordinates
      .map(normalizePath)
      .filter((path) => path.length >= 2);
  }
  return [];
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function distanceMeters(left: number[], right: number[]): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const [leftLng, leftLat] = left;
  const [rightLng, rightLat] = right;
  const dLat = toRadians(rightLat - leftLat);
  const dLng = toRadians(rightLng - leftLng);
  const lat1 = toRadians(leftLat);
  const lat2 = toRadians(rightLat);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6_371_008.8 * c;
}

function roundedMeters(value: number): number {
  return Number(value.toFixed(1));
}

class TopologyDisjointSet {
  private parents: number[];

  constructor(size: number) {
    this.parents = Array.from({ length: size }, (_, index) => index);
  }

  find(index: number): number {
    const parent = this.parents[index];
    if (parent === index) return index;
    const root = this.find(parent);
    this.parents[index] = root;
    return root;
  }

  union(left: number, right: number) {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot !== rightRoot) this.parents[rightRoot] = leftRoot;
  }
}

function componentGapMeters(
  endpoints: Array<{ point: number[]; component: number }>,
  components: number[],
): number | null {
  if (components.length <= 1) return 0;

  let maxNearestComponentGap = 0;
  for (const component of components) {
    const componentEndpoints = endpoints.filter((endpoint) => endpoint.component === component);
    const otherEndpoints = endpoints.filter((endpoint) => endpoint.component !== component);
    let nearestGap = Number.POSITIVE_INFINITY;
    for (const left of componentEndpoints) {
      for (const right of otherEndpoints) {
        nearestGap = Math.min(nearestGap, distanceMeters(left.point, right.point));
      }
    }
    if (Number.isFinite(nearestGap)) {
      maxNearestComponentGap = Math.max(maxNearestComponentGap, nearestGap);
    }
  }

  return roundedMeters(maxNearestComponentGap);
}

export function assessUsfsMvumAggregateTopology(lines: number[][][]): UsfsMvumTopologyAssessment {
  const sourceSegmentCount = lines.length;
  if (sourceSegmentCount === 0) {
    return {
      status: 'unavailable',
      topologyResolved: false,
      sourceSegmentCount,
      componentCount: 0,
      branchDetected: false,
      joinedSegmentGapCount: 0,
      disjointSegmentGapCount: 0,
      maxJoinGapMeters: null,
      maxSegmentGapMeters: null,
      unavailableReason: 'Active guidance is unavailable because this aggregate has no usable route geometry.',
    };
  }

  const endpoints = lines.flatMap((line, segmentIndex) => [
    { segmentIndex, point: line[0] },
    { segmentIndex, point: line[line.length - 1] },
  ]);
  const endpointSets = new TopologyDisjointSet(endpoints.length);

  for (let leftIndex = 0; leftIndex < endpoints.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < endpoints.length; rightIndex += 1) {
      if (distanceMeters(endpoints[leftIndex].point, endpoints[rightIndex].point) <= ACTIVE_GUIDANCE_JOIN_GAP_MAX_METERS) {
        endpointSets.union(leftIndex, rightIndex);
      }
    }
  }

  const endpointClusterByIndex = endpoints.map((_, index) => endpointSets.find(index));
  const clusterMembers = new Map<number, number[]>();
  endpointClusterByIndex.forEach((clusterId, endpointIndex) => {
    const existing = clusterMembers.get(clusterId) ?? [];
    existing.push(endpointIndex);
    clusterMembers.set(clusterId, existing);
  });

  const clusterIds = Array.from(clusterMembers.keys());
  const clusterIndexById = new Map(clusterIds.map((clusterId, index) => [clusterId, index]));
  const nodeSets = new TopologyDisjointSet(clusterIds.length);
  const clusterDegree = new Map<number, number>();

  for (let segmentIndex = 0; segmentIndex < sourceSegmentCount; segmentIndex += 1) {
    const startCluster = endpointClusterByIndex[segmentIndex * 2];
    const endCluster = endpointClusterByIndex[segmentIndex * 2 + 1];
    clusterDegree.set(startCluster, (clusterDegree.get(startCluster) ?? 0) + 1);
    clusterDegree.set(endCluster, (clusterDegree.get(endCluster) ?? 0) + 1);
    const startNode = clusterIndexById.get(startCluster);
    const endNode = clusterIndexById.get(endCluster);
    if (startNode != null && endNode != null && startNode !== endNode) {
      nodeSets.union(startNode, endNode);
    }
  }

  const componentIds = Array.from(new Set(clusterIds.map((clusterId) => {
    const nodeIndex = clusterIndexById.get(clusterId) ?? 0;
    return nodeSets.find(nodeIndex);
  })));
  const componentByClusterId = new Map(clusterIds.map((clusterId) => {
    const nodeIndex = clusterIndexById.get(clusterId) ?? 0;
    return [clusterId, nodeSets.find(nodeIndex)];
  }));

  let maxJoinGapMeters = 0;
  let joinedSegmentGapCount = 0;
  clusterMembers.forEach((memberIndexes) => {
    if (memberIndexes.length < 2) return;
    joinedSegmentGapCount += memberIndexes.length - 1;
    for (let left = 0; left < memberIndexes.length; left += 1) {
      for (let right = left + 1; right < memberIndexes.length; right += 1) {
        maxJoinGapMeters = Math.max(
          maxJoinGapMeters,
          distanceMeters(endpoints[memberIndexes[left]].point, endpoints[memberIndexes[right]].point),
        );
      }
    }
  });

  const componentCount = componentIds.length;
  const branchDetected = Array.from(clusterDegree.values()).some((degree) => degree > 2);
  const disjointSegmentGapCount = Math.max(0, componentCount - 1);
  const maxSegmentGapMeters = componentGapMeters(
    endpoints.map((endpoint, index) => ({
      point: endpoint.point,
      component: componentByClusterId.get(endpointClusterByIndex[index]) ?? 0,
    })),
    componentIds,
  );

  if (branchDetected) {
    return {
      status: 'preview_only',
      topologyResolved: false,
      sourceSegmentCount,
      componentCount,
      branchDetected,
      joinedSegmentGapCount,
      disjointSegmentGapCount,
      maxJoinGapMeters: roundedMeters(maxJoinGapMeters),
      maxSegmentGapMeters,
      unavailableReason: 'Active guidance is preview-only because this aggregate contains a branching source network. Select or curate one route path before active guidance.',
    };
  }

  if (componentCount > 1) {
    return {
      status: 'preview_only',
      topologyResolved: false,
      sourceSegmentCount,
      componentCount,
      branchDetected,
      joinedSegmentGapCount,
      disjointSegmentGapCount,
      maxJoinGapMeters: joinedSegmentGapCount > 0 ? roundedMeters(maxJoinGapMeters) : null,
      maxSegmentGapMeters,
      unavailableReason: 'Active guidance is preview-only because this aggregate contains disconnected source segments. ECS will show source geometry without inventing connectors.',
    };
  }

  return {
    status: 'ready',
    topologyResolved: true,
    sourceSegmentCount,
    componentCount,
    branchDetected,
    joinedSegmentGapCount,
    disjointSegmentGapCount,
    maxJoinGapMeters: roundedMeters(maxJoinGapMeters),
    maxSegmentGapMeters,
    unavailableReason: null,
  };
}

export function buildUsfsMvumWhereClause(
  forests: UsfsMvumForest[],
  options: { minMiles?: number } = {},
): string {
  const minMiles = Math.max(0, Number(options.minMiles ?? 1));
  const forestNames = forests.map((forest) => sqlString(forest.forestName)).join(',');
  return [
    `FORESTNAME in (${forestNames})`,
    `GIS_MILES >= ${Number(minMiles.toFixed(3))}`,
    "(HIGHCLEARA = 'open' OR FOURWD_GT5 = 'open' OR PASSENGERV = 'open' OR ATV = 'open' OR MOTORCYCLE = 'open')",
  ].join(' AND ');
}

export function normalizeUsfsMvumFeatureCollection(payload: unknown): UsfsMvumArcGisFeature[] {
  if (!payload || typeof payload !== 'object') return [];
  const features = (payload as { features?: unknown }).features;
  if (!Array.isArray(features)) return [];
  return features
    .filter((feature): feature is UsfsMvumArcGisFeature => !!feature && typeof feature === 'object')
    .map((feature) => ({
      attributes: feature.attributes && typeof feature.attributes === 'object'
        ? feature.attributes as Record<string, unknown>
        : {},
      geometry: feature.geometry && typeof feature.geometry === 'object'
        ? feature.geometry as UsfsMvumArcGisFeature['geometry']
        : undefined,
    }));
}

export function routeSourceUpsertForForest(forest: UsfsMvumForest) {
  return {
    provider_id: forest.sourceProviderId,
    name: forest.sourceName,
    source_type: 'federal_agency',
    authority: 'official_access',
    source_uri: forest.sourceUri,
    attribution: 'USDA Forest Service Motor Vehicle Use Maps',
    license: 'agency published terms',
    refresh_frequency: 'agency published schedule',
    status: 'active',
    last_checked_at: new Date().toISOString(),
  };
}

export function arcGisFeatureToVerifiedRouteUpsert(
  feature: UsfsMvumArcGisFeature,
  context: UsfsMvumRouteContext,
) {
  const attributes = feature.attributes ?? {};
  const distanceMiles = cleanNumber(attributes.GIS_MILES ?? attributes.SEG_LENGTH);
  const minMiles = Math.max(0, Number(context.minMiles ?? 1));
  if (distanceMiles == null || distanceMiles < minMiles) return null;

  const paths = normalizePaths(feature);
  const routeGeometry = routeGeometryFromPaths(paths);
  const center = centerFromPaths(paths);
  if (!routeGeometry || !center) return null;

  const vehicleFit = orderedVehicleFit(vehicleFitFromAttributes(attributes));
  if (vehicleFit.length === 0) return null;

  const id = cleanString(attributes.ID || attributes.FIELD_ID || attributes.RTE_CN);
  const providerId = providerFeatureId(context.layer, attributes);
  const featureKey = sourceFeatureKey(attributes);
  const name = routeName(context.layer, attributes);
  const publicRecommendation = context.publicRecommendation !== false;
  const publicId = slugify([
    'usfs-mvum',
    context.forest.slug,
    context.layer.kind,
    id,
    cleanString(attributes.NAME),
    `feature ${featureKey}`,
  ].filter(Boolean).join(' '));
  const forestTag = context.forest.forestName;
  const district = cleanString(attributes.DISTRICTNA);

  const verifiedRoute = {
    public_id: publicId,
    name,
    description: `${context.forest.forestName} ${context.layer.sourceLayer} record from USFS MVUM. ECS treats this as official motorized-access geometry, not current passability.`,
    route_type: 'point_to_point',
    center_latitude: center.latitude,
    center_longitude: center.longitude,
    route_geometry: routeGeometry,
    distance_miles: Number(distanceMiles.toFixed(3)),
    estimated_duration_minutes: Math.max(20, Math.round(distanceMiles * 18)),
    difficulty: 'unknown',
    vehicle_fit: vehicleFit,
    official_access_coverage_pct: 100,
    unknown_access_coverage_pct: 0,
    restricted_access_coverage_pct: 0,
    active_closure_count: 0,
    seasonal_restriction_count: cleanString(attributes.SEASONAL) ? 1 : 0,
    vehicle_mismatch: false,
    geometry_quality: 'good',
    verification_status: 'official_verified',
    recommendation_status: publicRecommendation ? 'recommendable' : 'not_recommended',
    review_status: 'approved',
    confidence_score: 92,
    confidence_reasons: [
      `USFS MVUM designates this ${context.layer.kind} for listed motorized vehicle classes.`,
      `Official MVUM source: ${context.forest.forestName}.`,
    ],
    warning_reasons: [
      ROUTE_CATALOG_MVUM_WARNING,
      ...(!publicRecommendation ? ['Source segment retained for traceability; ECS recommends the named aggregate route record when available.'] : []),
      ...(cleanString(attributes.SEASONAL) ? ['Seasonal designation requires trip-date review against the current MVUM.'] : []),
    ],
    blocker_reasons: [],
    closure_summaries: [],
    community_signal: {},
    tags: [forestTag, 'USFS MVUM', context.layer.kind, district, ...(!publicRecommendation ? ['source segment'] : [])].filter(Boolean),
    last_verified_at: context.sourceLastVerifiedAt,
    stale_at: addDaysIso(context.sourceLastVerifiedAt, 180),
  };

  const rawSourceFeature = {
    route_source_id: context.sourceId,
    ingest_run_id: context.ingestRunId ?? null,
    provider_feature_id: providerId,
    source_layer: context.layer.sourceLayer,
    source_uri: context.layer.url,
    payload_hash: stablePayloadHash(feature),
    geometry: null,
    properties: {
      attributes,
      geometry: routeGeometry,
      forest: context.forest.forestName,
      routeCatalogPublicId: publicId,
    },
    last_seen_at: context.sourceLastVerifiedAt,
  };

  const verifiedRouteSource = {
    route_source_id: context.sourceId,
    source_role: 'primary',
    coverage_pct: 100,
    last_verified_at: context.sourceLastVerifiedAt,
    metadata: {
      providerFeatureId: providerId,
      sourceLayer: context.layer.sourceLayer,
      forest: context.forest.forestName,
      mvumStatus: cleanString(attributes[context.layer.statusField]),
      caveat: ROUTE_CATALOG_MVUM_WARNING,
    },
  };

  return {
    verifiedRoute,
    verifiedRouteSource,
    rawSourceFeature,
  };
}

export function aggregateUsfsMvumRouteFeatures(
  features: UsfsMvumArcGisFeature[],
  context: UsfsMvumRouteContext,
): UsfsMvumAggregateRouteUpsert[] {
  const groups = new Map<string, {
    identity: NonNullable<ReturnType<typeof aggregationIdentity>>;
    segments: UsfsMvumRouteUpsert[];
  }>();

  for (const feature of features) {
    const attributes = feature.attributes ?? {};
    const identity = aggregationIdentity(context.layer, attributes);
    if (!identity) continue;

    const segment = arcGisFeatureToVerifiedRouteUpsert(feature, {
      ...context,
      publicRecommendation: false,
    });
    if (!segment) continue;

    const key = `${context.forest.slug}:${identity.key}`;
    const existing = groups.get(key);
    if (existing) {
      existing.segments.push(segment);
    } else {
      groups.set(key, { identity, segments: [segment] });
    }
  }

  return Array.from(groups.values()).map(({ identity, segments }) => {
    const segmentPublicIds = segments.map((segment) => String(segment.verifiedRoute.public_id));
    const segmentProviderFeatureIds = segments.map((segment) => String(segment.rawSourceFeature.provider_feature_id));
    const lines = segments.flatMap((segment) =>
      lineStringsFromRouteGeometry(segment.verifiedRoute.route_geometry as Record<string, unknown>),
    );
    const activeGuidance = assessUsfsMvumAggregateTopology(lines);
    const center = centerFromPaths(lines);
    const distanceMiles = Number(segments.reduce((total, segment) => total + Number(segment.verifiedRoute.distance_miles ?? 0), 0).toFixed(3));
    const districtTags = uniqueStrings(segments.flatMap((segment) =>
      Array.isArray(segment.verifiedRoute.tags) ? segment.verifiedRoute.tags.map(String) : [],
    ).filter((tag) => tag !== context.forest.forestName && tag !== 'USFS MVUM' && tag !== context.layer.kind && tag !== 'source segment'));
    const seasonalRestrictionCount = segments.reduce(
      (count, segment) => count + Number(segment.verifiedRoute.seasonal_restriction_count ?? 0),
      0,
    );
    const vehicleFit = orderedVehicleFit(segments.flatMap((segment) =>
      Array.isArray(segment.verifiedRoute.vehicle_fit) ? segment.verifiedRoute.vehicle_fit.map(String) : [],
    ));
    const warningReasons = [
      ROUTE_CATALOG_MVUM_WARNING,
      'Source-segment aggregate: ECS combines MVUM features with the same route identity without inventing connector geometry.',
      ...(activeGuidance.unavailableReason ? [activeGuidance.unavailableReason] : []),
      ...(seasonalRestrictionCount > 0 ? ['One or more source segments has a seasonal designation that requires trip-date review against the current MVUM.'] : []),
    ];
    const publicId = slugify([
      'usfs-mvum',
      context.forest.slug,
      ...identity.publicIdParts.slice(1),
    ].filter(Boolean).join(' '));
    const sourceFeatureCount = segments.length;

    return {
      verifiedRoute: {
        public_id: publicId,
        name: routeName(context.layer, segments[0].rawSourceFeature.properties.attributes as Record<string, unknown>),
        description: `${context.forest.forestName} ${context.layer.sourceLayer} aggregate built from ${sourceFeatureCount} USFS MVUM source segment${sourceFeatureCount === 1 ? '' : 's'}. ECS treats this as official motorized-access geometry, not current passability.`,
        route_type: 'point_to_point',
        center_latitude: center?.latitude ?? Number(segments[0].verifiedRoute.center_latitude),
        center_longitude: center?.longitude ?? Number(segments[0].verifiedRoute.center_longitude),
        route_geometry: lines.length === 1
          ? { type: 'LineString', coordinates: lines[0] }
          : { type: 'MultiLineString', coordinates: lines },
        distance_miles: distanceMiles,
        estimated_duration_minutes: Math.max(20, Math.round(distanceMiles * 18)),
        difficulty: 'unknown',
        vehicle_fit: vehicleFit,
        official_access_coverage_pct: 100,
        unknown_access_coverage_pct: 0,
        restricted_access_coverage_pct: 0,
        active_closure_count: 0,
        seasonal_restriction_count: seasonalRestrictionCount,
        vehicle_mismatch: false,
        geometry_quality: sourceFeatureCount > 1 ? 'partial' : 'good',
        verification_status: 'official_verified',
        recommendation_status: 'recommendable',
        review_status: 'approved',
        confidence_score: sourceFeatureCount > 1 ? 90 : 92,
        confidence_reasons: [
          `USFS MVUM designates this ${context.layer.kind} identity for listed motorized vehicle classes.`,
          `Combined ${sourceFeatureCount} MVUM source segment${sourceFeatureCount === 1 ? '' : 's'} with matching route identity.`,
          ...(activeGuidance.status === 'ready' ? ['Active guidance topology resolved from official source segment endpoints.'] : []),
          `Official MVUM source: ${context.forest.forestName}.`,
        ],
        warning_reasons: warningReasons,
        blocker_reasons: [],
        closure_summaries: [],
        community_signal: {
          aggregation: 'usfs_mvum_route_identity',
          activeGuidance,
          sourceFeatureCount,
          segmentPublicIds,
          providerFeatureIds: segmentProviderFeatureIds,
        },
        tags: uniqueStrings([
          context.forest.forestName,
          'USFS MVUM',
          context.layer.kind,
          'source-segment aggregate',
          ...districtTags,
        ]),
        last_verified_at: context.sourceLastVerifiedAt,
        stale_at: addDaysIso(context.sourceLastVerifiedAt, 180),
      },
      verifiedRouteSource: {
        route_source_id: context.sourceId,
        source_role: 'primary',
        coverage_pct: 100,
        last_verified_at: context.sourceLastVerifiedAt,
        metadata: {
          providerFeatureIds: segmentProviderFeatureIds,
          segmentPublicIds,
          sourceFeatureCount,
          sourceLayer: context.layer.sourceLayer,
          forest: context.forest.forestName,
          aggregation: 'usfs_mvum_route_identity',
          activeGuidance,
          caveat: ROUTE_CATALOG_MVUM_WARNING,
        },
      },
      segmentPublicIds,
      segmentProviderFeatureIds,
    };
  });
}
