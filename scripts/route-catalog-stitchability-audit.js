#!/usr/bin/env node
const { loadRouteCatalogEnv } = require('./route-catalog-env.js');

const EARTH_RADIUS_M = 6371000;
const DEFAULT_TOUCHING_GAP_METERS = 30;
const DEFAULT_STITCH_GAP_METERS = 250;
const DEFAULT_LOOP_GAP_METERS = 90;

const ROUTE_CATALOG_STITCHABILITY_CLUSTERS = [
  {
    key: 'nm_taos',
    label: 'New Mexico BLM Taos / Rio Grande del Norte stitchability cluster',
    sourceAdapter: 'blm_gtlf',
    latitude: 36.86,
    longitude: -105.83,
    radiusMiles: 35,
    limit: 50,
  },
  {
    key: 'nm_quebradas',
    label: 'New Mexico BLM Quebradas Road stitchability cluster',
    sourceAdapter: 'blm_gtlf',
    latitude: 34.03131,
    longitude: -106.77213,
    radiusMiles: 25,
    limit: 50,
  },
  {
    key: 'nm_angel_peak',
    label: 'New Mexico BLM Angel Peak stitchability cluster',
    sourceAdapter: 'blm_gtlf',
    latitude: 36.57705,
    longitude: -107.88704,
    radiusMiles: 25,
    limit: 50,
  },
];

function routeCatalogSearchUrl(baseUrl) {
  return `${String(baseUrl).replace(/\/+$/, '')}/functions/v1/route-catalog-search`;
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function distanceMeters(a, b) {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function readNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function readRecord(value) {
  return value && typeof value === 'object' ? value : null;
}

function coordinatePoint(value) {
  if (!Array.isArray(value) || value.length < 2) return null;
  const longitude = readNumber(value[0]);
  const latitude = readNumber(value[1]);
  if (
    latitude == null ||
    longitude == null ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return null;
  }
  return { latitude, longitude };
}

function lineEndpoints(line) {
  if (!Array.isArray(line) || line.length < 2) return [];
  const first = coordinatePoint(line[0]);
  const last = coordinatePoint(line[line.length - 1]);
  return [first, last].filter(Boolean);
}

function routeLineStrings(record) {
  const geometry = readRecord(record.route_geometry ?? record.routeGeometry);
  if (!geometry) return [];
  if (geometry.type === 'LineString' && Array.isArray(geometry.coordinates)) {
    return [geometry.coordinates];
  }
  if (geometry.type === 'MultiLineString' && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates.filter(Array.isArray);
  }
  return [];
}

function routeEndpoints(record) {
  return routeLineStrings(record).flatMap(lineEndpoints);
}

function routeSelfClosingDistanceMeters(record) {
  const lines = routeLineStrings(record);
  const distances = lines
    .map((line) => {
      if (!Array.isArray(line) || line.length < 3) return null;
      const endpoints = lineEndpoints(line);
      return endpoints.length === 2 ? distanceMeters(endpoints[0], endpoints[1]) : null;
    })
    .filter((distance) => Number.isFinite(distance));
  if (distances.length === 0) return null;
  return Math.min(...distances);
}

function publicIdForRecord(record) {
  return String(record.public_id ?? record.publicId ?? record.id ?? '').trim();
}

function nameForRecord(record) {
  return String(record.name ?? record.title ?? publicIdForRecord(record)).trim();
}

function sourceRecords(record) {
  const sources = record.source_records ?? record.sourceRecords;
  return Array.isArray(sources) ? sources : [];
}

function providerIdsForRecord(record) {
  return sourceRecords(record)
    .map((source) => String(source?.provider_id ?? source?.providerId ?? '').trim())
    .filter(Boolean);
}

function bestEndpointGap(fromRecord, toRecord) {
  const fromEndpoints = routeEndpoints(fromRecord);
  const toEndpoints = routeEndpoints(toRecord);
  let best = null;
  for (const fromEndpoint of fromEndpoints) {
    for (const toEndpoint of toEndpoints) {
      const distance = distanceMeters(fromEndpoint, toEndpoint);
      if (!best || distance < best.distanceMeters) {
        best = {
          distanceMeters: Number(distance.toFixed(1)),
          fromEndpoint,
          toEndpoint,
        };
      }
    }
  }
  return best;
}

function routeRole(degree, loopCandidate) {
  if (loopCandidate) return 'loop_candidate';
  if (degree >= 2) return 'connector_candidate';
  if (degree === 1) return 'spur';
  return 'isolated';
}

function analyzeRouteStitchability(cluster, body = {}) {
  const records = Array.isArray(body.records) ? body.records : [];
  const touchingGapMeters = readNumber(cluster.touchingGapMeters) ?? DEFAULT_TOUCHING_GAP_METERS;
  const maxStitchGapMeters = readNumber(cluster.maxStitchGapMeters) ?? DEFAULT_STITCH_GAP_METERS;
  const loopGapMeters = readNumber(cluster.loopGapMeters) ?? DEFAULT_LOOP_GAP_METERS;

  const usableRecords = records.filter((record) => publicIdForRecord(record) && routeEndpoints(record).length >= 2);
  const candidateEdges = [];
  const degreeByPublicId = new Map(usableRecords.map((record) => [publicIdForRecord(record), 0]));

  for (let fromIndex = 0; fromIndex < usableRecords.length; fromIndex += 1) {
    for (let toIndex = fromIndex + 1; toIndex < usableRecords.length; toIndex += 1) {
      const fromRecord = usableRecords[fromIndex];
      const toRecord = usableRecords[toIndex];
      const gap = bestEndpointGap(fromRecord, toRecord);
      if (!gap || gap.distanceMeters > maxStitchGapMeters) continue;
      const fromPublicId = publicIdForRecord(fromRecord);
      const toPublicId = publicIdForRecord(toRecord);
      degreeByPublicId.set(fromPublicId, (degreeByPublicId.get(fromPublicId) ?? 0) + 1);
      degreeByPublicId.set(toPublicId, (degreeByPublicId.get(toPublicId) ?? 0) + 1);
      candidateEdges.push({
        fromPublicId,
        fromName: nameForRecord(fromRecord),
        toPublicId,
        toName: nameForRecord(toRecord),
        distanceMeters: gap.distanceMeters,
        classification: gap.distanceMeters <= touchingGapMeters ? 'touching' : 'stitch_candidate',
        fromEndpoint: gap.fromEndpoint,
        toEndpoint: gap.toEndpoint,
      });
    }
  }

  candidateEdges.sort((a, b) => a.distanceMeters - b.distanceMeters);

  const routeRoles = usableRecords.map((record) => {
    const publicId = publicIdForRecord(record);
    const selfClosingDistanceMeters = routeSelfClosingDistanceMeters(record);
    const loopCandidate =
      selfClosingDistanceMeters != null && selfClosingDistanceMeters <= loopGapMeters;
    const degree = degreeByPublicId.get(publicId) ?? 0;
    return {
      publicId,
      name: nameForRecord(record),
      role: routeRole(degree, loopCandidate),
      graphDegree: degree,
      selfClosingDistanceMeters:
        selfClosingDistanceMeters == null ? null : Number(selfClosingDistanceMeters.toFixed(1)),
      providerIds: providerIdsForRecord(record),
    };
  });

  const routeRolesByPublicId = Object.fromEntries(routeRoles.map((role) => [role.publicId, role]));
  const countRole = (role) => routeRoles.filter((route) => route.role === role).length;

  return {
    key: cluster.key,
    label: cluster.label,
    sourceAdapter: cluster.sourceAdapter,
    routeCount: usableRecords.length,
    omittedGeometryCount: records.length - usableRecords.length,
    candidateEdgeCount: candidateEdges.length,
    touchingEdgeCount: candidateEdges.filter((edge) => edge.classification === 'touching').length,
    stitchCandidateEdgeCount: candidateEdges.filter((edge) => edge.classification === 'stitch_candidate').length,
    connectorCount: countRole('connector_candidate'),
    spurCount: countRole('spur'),
    loopCandidateCount: countRole('loop_candidate'),
    isolatedCount: countRole('isolated'),
    maxStitchGapMeters,
    touchingGapMeters,
    loopGapMeters,
    routeRoles,
    routeRolesByPublicId,
    candidateEdges: candidateEdges.slice(0, 50),
    caveats: [
      'Stitchability audit measures source geometry endpoint proximity; it does not invent connector geometry or legal access.',
      'Bridgeable gaps still require deterministic routing, current conditions, and land-use review before user-facing route stitching.',
    ],
  };
}

function queueStatusForEdge(edge) {
  return edge.classification === 'stitch_candidate' ? 'needs_bridge_review' : 'chain_ready';
}

function queueActionForStatus(status) {
  return status === 'needs_bridge_review'
    ? 'review_verified_bridge_before_stitch'
    : 'chain_touching_source_routes';
}

function routeRoleFromResult(result, publicId) {
  return readRecord(result.routeRolesByPublicId)?.[publicId] ?? null;
}

function sourceAdapterForQueueItem(result, fromRole, toRole) {
  const resultSource = String(result.sourceAdapter || '').trim();
  if (resultSource) return resultSource;
  return String(fromRole?.providerIds?.[0] || toRole?.providerIds?.[0] || 'unknown').trim();
}

function reviewGatesForStatus(status) {
  const gates = [
    'Confirm both source routes remain public and recommendable in the route catalog.',
    'Review current conditions and local closure orders before exposing this stitch to users.',
    'Confirm land-use authority, vehicle suitability, and route direction before field use.',
  ];
  if (status === 'needs_bridge_review') {
    gates.unshift('Obtain deterministic routing or reviewed connector geometry for the gap.');
  }
  return gates;
}

function queueEndpoint(point) {
  return {
    latitude: point.latitude,
    longitude: point.longitude,
  };
}

function buildRouteCatalogStitchReviewQueue(results = []) {
  const queue = [];
  for (const result of Array.isArray(results) ? results : []) {
    const candidateEdges = Array.isArray(result?.candidateEdges) ? result.candidateEdges : [];
    for (const edge of candidateEdges) {
      const status = queueStatusForEdge(edge);
      const fromRole = routeRoleFromResult(result, edge.fromPublicId);
      const toRole = routeRoleFromResult(result, edge.toPublicId);
      const sourceAdapter = sourceAdapterForQueueItem(result, fromRole, toRole);
      queue.push({
        id: [
          result.key || 'unknown_cluster',
          status,
          edge.fromPublicId,
          edge.toPublicId,
        ].join(':'),
        clusterKey: result.key || '',
        clusterLabel: result.label || '',
        sourceAdapter,
        status,
        classification: edge.classification,
        gapMeters: edge.distanceMeters,
        from: {
          publicId: edge.fromPublicId,
          name: edge.fromName,
          role: fromRole?.role || 'unknown',
          endpoint: queueEndpoint(edge.fromEndpoint),
        },
        to: {
          publicId: edge.toPublicId,
          name: edge.toName,
          role: toRole?.role || 'unknown',
          endpoint: queueEndpoint(edge.toEndpoint),
        },
        tripBuilder: {
          source: 'route_catalog_stitchability_audit',
          suggestedAction: queueActionForStatus(status),
          selectedRoutePublicIds: [edge.fromPublicId, edge.toPublicId],
          requiresVerifiedBridge: status === 'needs_bridge_review',
          canAutoPublish: false,
        },
        requiredReview: reviewGatesForStatus(status),
        caveat:
          'This queue item does not create connector geometry, legal access, or a user-facing stitched route.',
      });
    }
  }

  return queue.sort((a, b) => {
    const statusRank = (item) => (item.status === 'needs_bridge_review' ? 0 : 1);
    return statusRank(a) - statusRank(b) || a.gapMeters - b.gapMeters;
  });
}

function buildRouteCatalogStitchGroupDrafts(reviewQueue = []) {
  const chainItems = (Array.isArray(reviewQueue) ? reviewQueue : [])
    .filter((item) => item.status === 'chain_ready')
    .filter((item) => item.from?.publicId && item.to?.publicId);
  const groupsByCluster = new Map();

  for (const item of chainItems) {
    const clusterKey = item.clusterKey || 'unknown';
    if (!groupsByCluster.has(clusterKey)) {
      groupsByCluster.set(clusterKey, {
        clusterKey,
        clusterLabel: item.clusterLabel || '',
        sourceAdapter: item.sourceAdapter || 'unknown',
        routeIds: new Set(),
        edges: [],
      });
    }
    const cluster = groupsByCluster.get(clusterKey);
    cluster.routeIds.add(item.from.publicId);
    cluster.routeIds.add(item.to.publicId);
    cluster.edges.push(item);
  }

  const drafts = [];
  for (const cluster of groupsByCluster.values()) {
    const adjacency = new Map();
    for (const routeId of cluster.routeIds) adjacency.set(routeId, new Set());
    for (const edge of cluster.edges) {
      adjacency.get(edge.from.publicId).add(edge.to.publicId);
      adjacency.get(edge.to.publicId).add(edge.from.publicId);
    }

    const seen = new Set();
    for (const routeId of [...cluster.routeIds].sort()) {
      if (seen.has(routeId)) continue;
      const stack = [routeId];
      const componentRouteIds = [];
      seen.add(routeId);

      while (stack.length > 0) {
        const current = stack.pop();
        componentRouteIds.push(current);
        for (const next of adjacency.get(current) || []) {
          if (seen.has(next)) continue;
          seen.add(next);
          stack.push(next);
        }
      }

      const routeIdSet = new Set(componentRouteIds);
      const componentEdges = cluster.edges.filter(
        (edge) => routeIdSet.has(edge.from.publicId) && routeIdSet.has(edge.to.publicId),
      );
      drafts.push({
        id: `${cluster.clusterKey}:draft:${componentRouteIds.sort().join(':')}`,
        clusterKey: cluster.clusterKey,
        clusterLabel: cluster.clusterLabel,
        sourceAdapter: cluster.sourceAdapter,
        routePublicIds: componentRouteIds.sort(),
        chainReadyEdgeCount: componentEdges.length,
        bridgeReviewEdgeCount: 0,
        reviewStatus: 'draft_review_required',
        tripBuilder: {
          source: 'route_catalog_stitchability_review_queue',
          suggestedAction: 'review_chain_ready_stitch_group',
          selectedRoutePublicIds: componentRouteIds.sort(),
          canAutoPublish: false,
          requiresFieldReview: true,
        },
        requiredReview: [
          'Confirm all source routes remain public and recommendable in the route catalog.',
          'Review current conditions and local closure orders before exposing this stitch group to users.',
          'Confirm land-use authority, vehicle suitability, and route direction before field use.',
        ],
        caveat:
          'This draft stitch group does not create connector geometry, legal access, or a user-facing stitched route.',
      });
    }
  }

  return drafts.sort((a, b) =>
    a.clusterKey.localeCompare(b.clusterKey) ||
    b.routePublicIds.length - a.routePublicIds.length ||
    a.id.localeCompare(b.id)
  );
}

function buildRouteCatalogStitchGroupPersistencePlan(output = {}) {
  const reviewQueue = Array.isArray(output.reviewQueue) ? output.reviewQueue : [];
  const stitchGroupDrafts = Array.isArray(output.stitchGroupDrafts)
    ? output.stitchGroupDrafts
    : buildRouteCatalogStitchGroupDrafts(reviewQueue);
  const routes = [];
  const edges = [];

  for (const draft of stitchGroupDrafts) {
    const routePublicIds = Array.isArray(draft.routePublicIds) ? draft.routePublicIds : [];
    routePublicIds.forEach((routePublicId, index) => {
      routes.push({
        stitchGroupPublicId: draft.id,
        routePublicId,
        routeOrder: index,
        direction: 'unknown',
        verifiedRouteIdResolution: 'resolve_by_route_public_id',
      });
    });

    const routeSet = new Set(routePublicIds);
    reviewQueue
      .filter((item) => item.status === 'chain_ready')
      .filter((item) => item.clusterKey === draft.clusterKey)
      .filter((item) => routeSet.has(item.from?.publicId) && routeSet.has(item.to?.publicId))
      .forEach((item) => {
        edges.push({
          stitchGroupPublicId: draft.id,
          fromRoutePublicId: item.from.publicId,
          toRoutePublicId: item.to.publicId,
          edgeStatus: 'chain_ready',
          gapMeters: item.gapMeters,
          fromEndpoint: item.from.endpoint,
          toEndpoint: item.to.endpoint,
          requiresVerifiedBridge: false,
          reviewStatus: 'draft_review_required',
        });
      });
  }

  return {
    mode: 'stitch-group-persistence-dry-run',
    writeEnabled: false,
    requiredWriterRole: 'service_role',
    tables: [
      'route_catalog_stitch_groups',
      'route_catalog_stitch_group_routes',
      'route_catalog_stitch_group_edges',
    ],
    groups: stitchGroupDrafts.map((draft) => ({
      publicId: draft.id,
      name: `${draft.clusterLabel || draft.clusterKey} stitch group (${draft.routePublicIds.length} routes)`,
      clusterKey: draft.clusterKey,
      clusterLabel: draft.clusterLabel,
      sourceAdapter: draft.sourceAdapter,
      routePublicIds: draft.routePublicIds,
      chainReadyEdgeCount: draft.chainReadyEdgeCount,
      bridgeReviewEdgeCount: draft.bridgeReviewEdgeCount,
      reviewStatus: draft.reviewStatus,
      publicationStatus: 'review_only',
      canAutoPublish: false,
      requiresFieldReview: true,
      metadata: {
        source: 'route_catalog_stitchability_review_queue',
        requiredReview: draft.requiredReview,
      },
    })),
    routes,
    edges,
    caveats: [
      'Dry-run output does not write to Supabase.',
      'Draft stitch groups are not public route catalog records and do not create connector geometry or legal access.',
      'A service-role writer must resolve route_public_id values to verified_routes.id before insert.',
    ],
  };
}

function summarizeRouteCatalogStitchReviewQueue(reviewQueue, stitchGroupDrafts = []) {
  const clusterCounts = {};
  for (const item of reviewQueue) {
    const clusterKey = item.clusterKey || 'unknown';
    clusterCounts[clusterKey] = (clusterCounts[clusterKey] || 0) + 1;
  }
  return {
    totalQueueItems: reviewQueue.length,
    needsBridgeReviewCount: reviewQueue.filter((item) => item.status === 'needs_bridge_review').length,
    chainReadyCount: reviewQueue.filter((item) => item.status === 'chain_ready').length,
    draftStitchGroupCount: stitchGroupDrafts.length,
    clusterCounts,
  };
}

function formatRouteCatalogStitchabilityOutput(results = [], options = {}) {
  if (!options.queue) {
    return { mode: 'live-audit', results };
  }
  const reviewQueue = buildRouteCatalogStitchReviewQueue(results);
  const stitchGroupDrafts = buildRouteCatalogStitchGroupDrafts(reviewQueue);
  return {
    mode: 'live-review-queue',
    summary: summarizeRouteCatalogStitchReviewQueue(reviewQueue, stitchGroupDrafts),
    reviewQueue,
    stitchGroupDrafts,
  };
}

function formatQueueCount(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString('en-US') : '0';
}

function formatQueueText(value, fallback = 'unknown') {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function formatQueueEndpoint(endpoint) {
  const latitude = Number(endpoint?.latitude);
  const longitude = Number(endpoint?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return 'unknown';
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}

function formatQueueRows(items) {
  if (!items.length) return ['| none | none | 0 | none | none | no |',].join('\n');
  return items.map((item) => [
    item.clusterKey || 'unknown',
    `${formatQueueText(item.from?.name)} -> ${formatQueueText(item.to?.name)}`,
    Number(item.gapMeters || 0).toFixed(1),
    `${formatQueueText(item.from?.role)} -> ${formatQueueText(item.to?.role)}`,
    `${formatQueueEndpoint(item.from?.endpoint)} -> ${formatQueueEndpoint(item.to?.endpoint)}`,
    item.tripBuilder?.canAutoPublish ? 'yes' : 'no',
  ].map((cell) => String(cell).replace(/\|/g, '/')).join(' | ')).map((row) => `| ${row} |`).join('\n');
}

function formatDraftGroupRows(drafts) {
  if (!drafts.length) return '| none | none | 0 | none | no |';
  return drafts.map((draft) => [
    draft.clusterKey || 'unknown',
    draft.reviewStatus || 'unknown',
    draft.routePublicIds?.length || 0,
    Array.isArray(draft.routePublicIds) ? draft.routePublicIds.join(', ') : 'none',
    draft.tripBuilder?.canAutoPublish ? 'yes' : 'no',
  ].map((cell) => String(cell).replace(/\|/g, '/')).join(' | ')).map((row) => `| ${row} |`).join('\n');
}

function formatRouteCatalogStitchReviewQueueMarkdown(output) {
  const summary = readRecord(output?.summary) || {};
  const reviewQueue = Array.isArray(output?.reviewQueue) ? output.reviewQueue : [];
  const stitchGroupDrafts = Array.isArray(output?.stitchGroupDrafts) ? output.stitchGroupDrafts : [];
  const bridgeItems = reviewQueue.filter((item) => item.status === 'needs_bridge_review');
  const chainItems = reviewQueue.filter((item) => item.status === 'chain_ready');
  const clusterCounts = readRecord(summary.clusterCounts) || {};
  const clusterRows = Object.entries(clusterCounts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([clusterKey, count]) => `| ${clusterKey} | ${formatQueueCount(count)} |`);

  return [
    '## Route Catalog Stitchability Review Queue',
    '',
    `Total queue items: ${formatQueueCount(summary.totalQueueItems)}`,
    `Needs bridge review: ${formatQueueCount(summary.needsBridgeReviewCount)}`,
    `Chain-ready joins: ${formatQueueCount(summary.chainReadyCount)}`,
    `Draft stitch groups: ${formatQueueCount(summary.draftStitchGroupCount)}`,
    '',
    'This report is source-backed operator review output. It does not create connector geometry, legal access, or a user-facing stitched route.',
    'Auto-publish: no',
    '',
    '### Queue Items By Cluster',
    '',
    '| Cluster | Items |',
    '| --- | ---: |',
    ...(clusterRows.length ? clusterRows : ['| none | 0 |']),
    '',
    '### Needs Bridge Review',
    '',
    '| Cluster | Routes | Gap m | Roles | Endpoints | Auto-publish |',
    '| --- | --- | ---: | --- | --- | --- |',
    formatQueueRows(bridgeItems),
    '',
    'Required review: deterministic bridge geometry, current conditions, local closure orders, land-use authority, vehicle suitability, and route direction.',
    '',
    '### Draft Stitch Groups',
    '',
    '| Cluster | Review status | Routes | Route public IDs | Auto-publish |',
    '| --- | --- | ---: | --- | --- |',
    formatDraftGroupRows(stitchGroupDrafts),
    '',
    'Draft groups remain review-only until source status, current conditions, local closures, authority, vehicle suitability, and direction are confirmed.',
    '',
    '### Chain-Ready Source Joins',
    '',
    '| Cluster | Routes | Gap m | Roles | Endpoints | Auto-publish |',
    '| --- | --- | ---: | --- | --- | --- |',
    formatQueueRows(chainItems),
    '',
    'Required review: source routes remain public and recommendable, current conditions are checked, and authority/vehicle suitability is confirmed before any curated stitch group is exposed.',
  ].join('\n');
}

function parseList(value) {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseArgs(argv) {
  const options = {
    allNm: false,
    clusterKeys: [],
    dryRun: false,
    json: false,
    queue: false,
    markdown: false,
    groupsDryRun: false,
    limit: null,
    radiusMiles: null,
    maxStitchGapMeters: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--all-nm') {
      options.allNm = true;
    } else if (arg === '--cluster') {
      const value = argv[index + 1];
      if (!value) throw new Error('--cluster requires a stitchability cluster key');
      options.clusterKeys.push(...parseList(value));
      index += 1;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--queue') {
      options.queue = true;
    } else if (arg === '--markdown') {
      options.markdown = true;
    } else if (arg === '--groups-dry-run') {
      options.groupsDryRun = true;
    } else if (arg === '--limit') {
      const value = Number(argv[index + 1]);
      if (!Number.isFinite(value)) throw new Error('--limit requires a numeric value');
      options.limit = Math.max(1, Math.min(500, Math.round(value)));
      index += 1;
    } else if (arg === '--radius-miles') {
      const value = Number(argv[index + 1]);
      if (!Number.isFinite(value)) throw new Error('--radius-miles requires a numeric value');
      options.radiusMiles = Math.max(1, Number(value));
      index += 1;
    } else if (arg === '--max-gap-meters') {
      const value = Number(argv[index + 1]);
      if (!Number.isFinite(value)) throw new Error('--max-gap-meters requires a numeric value');
      options.maxStitchGapMeters = Math.max(1, Math.round(value));
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/route-catalog-stitchability-audit.js --dry-run --all-nm',
    '  node scripts/route-catalog-stitchability-audit.js --cluster nm_taos --json',
    '  node scripts/route-catalog-stitchability-audit.js --all-nm --json --max-gap-meters 250',
    '  node scripts/route-catalog-stitchability-audit.js --all-nm --json --queue',
    '  node scripts/route-catalog-stitchability-audit.js --all-nm --queue --markdown',
    '  node scripts/route-catalog-stitchability-audit.js --all-nm --json --groups-dry-run',
    '',
    'Required for live audit:',
    '  ECS_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL',
    '  EXPO_PUBLIC_SUPABASE_ANON_KEY is optional for route-catalog-search, but sent when present.',
  ].join('\n');
}

function buildRouteCatalogStitchabilityPlan({ clusterKeys = [], limit = null, radiusMiles = null, maxStitchGapMeters = null } = {}) {
  const requested = new Set(clusterKeys);
  const clusters = clusterKeys.length > 0
    ? ROUTE_CATALOG_STITCHABILITY_CLUSTERS.filter((cluster) => requested.has(cluster.key))
    : [...ROUTE_CATALOG_STITCHABILITY_CLUSTERS];

  if (clusterKeys.length > 0) {
    const found = new Set(clusters.map((cluster) => cluster.key));
    const missing = clusterKeys.filter((key) => !found.has(key));
    if (missing.length > 0) throw new Error(`Unknown route catalog stitchability cluster(s): ${missing.join(', ')}`);
  }

  return clusters.map((cluster) => ({
    ...cluster,
    ...(maxStitchGapMeters ? { maxStitchGapMeters } : {}),
    requestBody: {
      latitude: cluster.latitude,
      longitude: cluster.longitude,
      radiusMiles: radiusMiles ?? cluster.radiusMiles,
      limit: limit ?? cluster.limit,
      sourceAdapter: cluster.sourceAdapter,
      includeGeometry: true,
      includePreviewGeometry: false,
    },
  }));
}

function resolveSupabaseUrl(env) {
  return env.ECS_SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL || '';
}

function resolveAnonKey(env) {
  return env.EXPO_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '';
}

function headersForAudit(anonKey) {
  const headers = { 'Content-Type': 'application/json' };
  if (anonKey) {
    headers.apikey = anonKey;
    headers.authorization = `Bearer ${anonKey}`;
  }
  return headers;
}

async function fetchClusterRoutes(cluster, env) {
  const supabaseUrl = resolveSupabaseUrl(env);
  if (!supabaseUrl) throw new Error('Missing ECS_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL');
  const response = await fetch(routeCatalogSearchUrl(supabaseUrl), {
    method: 'POST',
    headers: headersForAudit(resolveAnonKey(env)),
    body: JSON.stringify(cluster.requestBody),
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`route-catalog-search returned non-JSON response: ${text.slice(0, 300)}`);
  }
  if (!response.ok || body.ok === false) {
    throw new Error(`route-catalog-search failed for ${cluster.key}: ${body.error || response.statusText}`);
  }
  return body;
}

async function main() {
  loadRouteCatalogEnv();
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  if (!options.allNm && options.clusterKeys.length === 0) {
    throw new Error(`${usage()}\n\nSelect --all-nm or at least one --cluster.`);
  }

  const clusterKeys = options.allNm ? [] : options.clusterKeys;
  const plan = buildRouteCatalogStitchabilityPlan({
    clusterKeys,
    limit: options.limit,
    radiusMiles: options.radiusMiles,
    maxStitchGapMeters: options.maxStitchGapMeters,
  });

  if (options.dryRun) {
    const body = {
      mode: 'dry-run',
      supabaseUrl: resolveSupabaseUrl(process.env) ? '(present)' : '(missing)',
      anonKey: resolveAnonKey(process.env) ? '(present)' : '(missing)',
      queueOutput: options.queue,
      markdownOutput: options.markdown,
      groupsDryRunOutput: options.groupsDryRun,
      clusters: plan,
    };
    console.log(options.json ? JSON.stringify(body, null, 2) : require('util').inspect(body, { depth: null, colors: false }));
    return;
  }

  const results = [];
  for (const cluster of plan) {
    const body = await fetchClusterRoutes(cluster, process.env);
    results.push(analyzeRouteStitchability(cluster, body));
  }

  const output = formatRouteCatalogStitchabilityOutput(results, { queue: options.queue || options.groupsDryRun });
  const finalOutput = options.groupsDryRun ? buildRouteCatalogStitchGroupPersistencePlan(output) : output;
  if (options.markdown) {
    console.log(formatRouteCatalogStitchReviewQueueMarkdown(finalOutput));
  } else {
    console.log(options.json ? JSON.stringify(finalOutput, null, 2) : require('util').inspect(finalOutput, { depth: null, colors: false }));
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  ROUTE_CATALOG_STITCHABILITY_CLUSTERS,
  analyzeRouteStitchability,
  buildRouteCatalogStitchGroupPersistencePlan,
  buildRouteCatalogStitchGroupDrafts,
  buildRouteCatalogStitchReviewQueue,
  buildRouteCatalogStitchabilityPlan,
  distanceMeters,
  formatRouteCatalogStitchReviewQueueMarkdown,
  formatRouteCatalogStitchabilityOutput,
  routeCatalogSearchUrl,
};
