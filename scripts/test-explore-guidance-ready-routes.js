const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const discoverPath = path.join(root, 'app', '(tabs)', 'discover.tsx');
const catalogPath = path.join(root, 'lib', 'explore', 'routeCatalog.ts');
const readyInventoryPath = path.join(root, 'lib', 'explore', 'exploreGuidanceReadyInventory.ts');

global.__DEV__ = false;

const discover = fs.readFileSync(discoverPath, 'utf8');
const catalog = fs.readFileSync(catalogPath, 'utf8');
const readyInventory = fs.readFileSync(readyInventoryPath, 'utf8');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
  }
  return originalLoad(request, parent, isMain);
};

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(transpiled.outputText, filename);
};

const {
  EXPLORE_GUIDANCE_READY_EXCLUSION_CODES,
  buildExploreGuidanceReadyInventory,
  classifyExploreRouteAvailability,
  defaultExploreReadyRouteEligibility,
  deriveExploreGuidanceProviderAvailability,
} = require(path.join(root, 'lib', 'explore', 'exploreGuidanceReadyInventory.ts'));
const {
  deriveExploreLiveConfidence,
} = require(path.join(root, 'lib', 'explore', 'exploreLiveConfidence.ts'));

function makeRoute(id, overrides = {}) {
  return {
    id,
    name: `Remote Ready ${id}`,
    region: 'Regression Range',
    regionGroup: 'great-basin',
    distanceMiles: 42,
    terrainType: 'remote two-track',
    remotenessScore: 8,
    estimatedDays: 1,
    startLat: 38,
    startLng: -110,
    routeGeometry: {
      type: 'LineString',
      coordinates: [
        [-110, 38],
        [-109.95, 38.05],
        [-109.9, 38.1],
      ],
    },
    routeMetadata: {
      routeTypeStatus: 'suggested_trailhead',
      routeGeometryMode: 'full',
      activeGuidance: { status: 'ready' },
      legalAccessStatus: 'verified',
      confidenceScore: 90,
    },
    ...overrides,
  };
}

assert(
  discover.includes('Available Routes') &&
    discover.includes('canonicalExplorePlanningRoutes') &&
    discover.includes('const mapInventory = buildExploreGuidanceReadyInventory') &&
    readyInventory.includes('MIN_DISCOVERY_ROUTE_MILES'),
  'Explore should expose a Guidance Ready route set while preserving the 5+ mile minimum.',
);
assert(
  readyInventory.includes('hasExploreGuidanceReadyGeometry') &&
    readyInventory.includes('normalizeNavigationGuidanceGeometry') &&
    readyInventory.includes('activeGuidance') &&
    readyInventory.includes('routeGeometryMode'),
  'Explore guidance-ready filtering should require shared usable stitched/full route geometry metadata.',
);
assert(
  discover.includes('source-backed') &&
    discover.includes('confidence') &&
    readyInventory.includes('dataState'),
  'Explore guidance-ready copy should keep source, confidence, and data-state visibility.',
);
assert(
  catalog.includes("activeGuidance?: ECSTrailPackActiveGuidance") &&
    catalog.includes("routeGeometryMode?: 'full' | 'preview_simplified' | 'omitted'"),
  'Route catalog types should expose active guidance and route geometry mode for guidance-ready filtering.',
);

assert(
  discover.includes('buildExploreGuidanceReadyInventory') &&
    discover.includes('defaultExploreReadyRouteEligibility') &&
    discover.includes('mapInventory.candidateSet.candidates') &&
    discover.includes('exploreGuidanceReadyInventory.discoverableCandidateSet') &&
    discover.includes('exploreGuidanceReadyInventory.discoverableRefinementCounts') &&
    discover.includes('exploreGuidanceReadyInventory.totalReadyCount'),
  'Discover should drive cards from explicit discoverability while retaining strict guidance-ready counts.',
);
assert(
  !discover.includes('function hasGuidanceReadyLineGeometry') &&
    !discover.includes('function hasGuidanceReadyGeometry'),
  'Discover should not keep a looser local guidance-ready geometry gate that can admit preview-only split route geometry.',
);
assert(
    discover.includes('showGuidanceReadyBlockedNotice') &&
    discover.includes('exploreGuidanceReadyBlockedReasonText') &&
    discover.includes('Routes Blocked from Discovery') &&
    discover.includes('identity, or supported-format gates'),
  'Explore should reserve the blocked state for genuine discovery exclusions rather than deferred geometry.',
);
assert(
  discover.includes('includePreviewGeometry: false') &&
    !discover.includes('routeCatalogPreviewGeometryRequested') &&
    discover.includes('routeCatalogSearchRefreshKey'),
  'Explore should request summary metadata without list-time route geometry.',
);
assert(
  (discover.match(/requireFullCatalogDetail: true/g) ?? []).length >= 3 &&
    discover.includes('saveExploreRouteForPlanning(hydratedCandidate)') &&
    discover.includes("if (candidate.detailState === 'deferred')") &&
    discover.includes("guardGuidanceReadyRouteHandoff(candidate.route, 'trip_builder_candidate')") &&
    discover.includes("pathname: '/explore-trip-builder'") &&
    discover.includes('Verified route detail could not be loaded. Retry when the route provider is available.'),
  'Deferred summaries should hand off directly while geometry-ready non-summary routes retain canonical hydrate/save normalization.',
);
assert(
  discover.includes('guardHydratedGuidanceReadyHandoff') &&
    discover.includes('guardGuidanceReadyRouteHandoff') &&
    discover.includes("guardHydratedGuidanceReadyHandoff(routeForHandoff, 'navigate')") &&
    discover.includes('explore_hydrated_route_not_ready') &&
    discover.includes('defaultExploreReadyRouteEligibility(routeForPlanning)'),
  'Navigate and guidance actions must continue to recheck readiness after authoritative detail hydration.',
);
assert(
  discover.includes('beginExploreRouteIntentRequest') &&
    discover.includes("controller.abort('superseded')") &&
    discover.includes('isCurrentExploreRouteIntentRequest(request)') &&
    discover.includes('signal: request.controller.signal'),
  'Rapid Explore Start/Build actions should abort or supersede older route-detail work before it can stage a stale handoff.',
);
assert(
  discover.includes('routeCatalogProviderUnavailableWithLocalReady') &&
    discover.includes('explore-guidance-ready-provider-unavailable-local-ready') &&
    discover.includes('exploreGuidanceEvaluatedCount > 0 || routeCatalogValidEmpty'),
  'Provider failure must not suppress guidance-ready saved/imported routes from the mounted inventory.',
);
assert(
  discover.includes("guardHydratedGuidanceReadyHandoff(routeForHandoff, 'favorite_navigate')") &&
    discover.includes('favoriteTrailToExpeditionRoute(favorite)') &&
    discover.includes('{ requireFullCatalogDetail: true }') &&
    discover.includes('buildValidatedExploreNavigationPayload(routeForHandoff)') &&
    discover.includes('!canStageNavigationHandoffRoute(payload)') &&
    !discover.includes('confirmRouteHandoffAgainstActiveGuidance(\n        favorite.navigationPayload'),
  'Saved favorite Navigate must rebuild and revalidate the current authoritative route instead of staging a stale persisted payload directly.',
);
assert(
  discover.includes('exploreGuidanceContextCatalogRoutes') &&
    discover.includes('exploreWizardHiddenGemSourceRoutes') &&
    discover.includes('filteredByUser: true') &&
    discover.includes('withinRadius') &&
    discover.includes('exploreGuidanceReadyEnabled: suggestedRoutesFeatureEnabled'),
  'The mounted inventory should receive diagnostic candidates for outside-radius, upstream-filtered, and feature-disabled exclusions while preserving its ready-route gates.',
);
assert(
  discover.includes('compatResults.get(String(route.id))') &&
    discover.includes('calculateRigCompatibility(vehicleProfile, route)') &&
    discover.includes('vehicleCompatibilityVehicleId: activeVehicleId') &&
    discover.includes('vehicleFitStatus') &&
    discover.includes('vehicleProfile,') &&
    discover.includes('[favoriteTrails, prepareExploreGuidanceRoutes]'),
  'Saved, imported, and favorite guidance candidates should recompute active-vehicle compatibility when the active vehicle context changes.',
);
assert(
  !discover.includes('visibleTrailPacks\n        .map((trailPack) => trailPackToExpeditionOpportunity(trailPack))') &&
    !discover.includes('visibleAIRoutes\n          .filter(routePassesExploreMapLength)'),
  'TripBuilder ready counts must not be built from page-sized visible Trail Pack or AI route windows.',
);

const remoteReadyRoutes = Array.from({ length: 9 }, (_, index) => makeRoute(`remote-ready-${index + 1}`));
const previewOnlyRoute = makeRoute('preview-only', {
  routeGeometry: {
    type: 'MultiLineString',
    coordinates: [
      [
        [-110, 38],
        [-109.98, 38.02],
      ],
      [
        [-109.9, 38.1],
        [-109.86, 38.14],
      ],
    ],
  },
  routeMetadata: {
    routeTypeStatus: 'suggested_trailhead',
    routeGeometryMode: 'preview_simplified',
  },
});
const activeGuidanceReadySearchPreviewRoute = makeRoute('active-ready-search-preview', {
  routeGeometry: {
    type: 'LineString',
    coordinates: [
      [-110, 38],
      [-109.98, 38.02],
      [-109.96, 38.04],
    ],
  },
  routeMetadata: {
    routeTypeStatus: 'suggested_trailhead',
    routeGeometryMode: 'preview_simplified',
    catalogVerification: {
      publicRecommendation: true,
      activeGuidance: {
        status: 'ready',
        topologyResolved: true,
        sourceSegmentCount: 4,
        componentCount: 1,
        branchDetected: false,
        joinedSegmentGapCount: 0,
        disjointSegmentGapCount: 0,
        maxJoinGapMeters: 0,
        maxSegmentGapMeters: 0,
        unavailableReason: null,
      },
    },
  },
});
const shortRoute = makeRoute('too-short', { distanceMiles: 3 });
const privateRoute = makeRoute('private-route', {
  routeMetadata: { routeTypeStatus: 'private', routeGeometryMode: 'full' },
});
const foldedLineRoute = makeRoute('folded-line-route', {
  routeGeometry: {
    type: 'LineString',
    coordinates: [
      [-110, 38],
      [-109.95, 38.05],
      [-109.9, 38.1],
      [-109.95, 38.05],
      [-109.85, 38.15],
    ],
  },
  routeMetadata: {
    routeTypeStatus: 'suggested_trailhead',
    routeGeometryMode: 'full',
    activeGuidance: { status: 'ready' },
  },
});

function makeDeferredCatalogRoute(id, overrides = {}) {
  return makeRoute(`trail-pack:${id}`, {
    routeGeometry: undefined,
    routeMetadata: {
      source: 'trail_pack',
      trailPackId: id,
      routeTypeStatus: 'suggested_trailhead',
      routeGeometryMode: 'omitted',
      reviewStatus: 'approved',
      legalAccessStatus: 'verified',
      catalogVerification: {
        publicRecommendation: true,
        blockers: [],
        warnings: ['Route coordinates omitted from lightweight search.'],
      },
    },
    ...overrides,
  });
}

const deferredCatalogRoutes = [
  makeDeferredCatalogRoute('summary-a'),
  makeDeferredCatalogRoute('summary-b'),
  makeDeferredCatalogRoute('summary-c'),
];
const deferredAvailability = classifyExploreRouteAvailability(deferredCatalogRoutes[0]);
assert.strictEqual(deferredAvailability.detailState, 'deferred');
assert.strictEqual(deferredAvailability.discoverability.eligible, true);
assert.strictEqual(deferredAvailability.tripBuilder.eligible, true);
assert.strictEqual(deferredAvailability.guidance.eligible, false);
assert(
  deferredAvailability.guidance.exclusionCodes.includes('missing_geometry'),
  'Deferred summary geometry must remain a typed active-guidance exclusion.',
);

const genuinelyExcludedSummary = makeDeferredCatalogRoute('moderation-blocked', {
  routeMetadata: {
    source: 'trail_pack',
    trailPackId: 'moderation-blocked',
    routeGeometryMode: 'omitted',
    reviewStatus: 'pending_review',
    legalAccessStatus: 'verified',
    catalogVerification: {
      publicRecommendation: false,
      blockers: ['Route is not approved for public recommendation'],
    },
  },
});
const summaryFirstInventory = buildExploreGuidanceReadyInventory({
  trailPacks: [
    ...deferredCatalogRoutes,
    makeRoute('ready-alongside-summaries'),
    genuinelyExcludedSummary,
  ],
  selectedRefinement: null,
});
assert.strictEqual(
  summaryFirstInventory.discoverableCandidateSet.candidates.length,
  4,
  'Three metadata-only summaries and one geometry-ready route should remain visible.',
);
assert.strictEqual(summaryFirstInventory.totalDiscoverableCount, 4);
assert.strictEqual(summaryFirstInventory.totalReadyCount, 1);
assert.strictEqual(
  summaryFirstInventory.discoverableCandidateSet.candidates.filter(
    (candidate) => candidate.detailState === 'deferred' && !candidate.guidanceReady,
  ).length,
  3,
  'Summary-only cards should be Trip Builder eligible without being mislabeled guidance ready.',
);
assert(
  summaryFirstInventory.exclusions.some((entry) =>
    entry.id === genuinelyExcludedSummary.id && entry.exclusionCodes.includes('moderation_pending')),
  'A genuinely moderated record must remain excluded with its typed reason.',
);

assert.deepStrictEqual(
  EXPLORE_GUIDANCE_READY_EXCLUSION_CODES,
  [
    'missing_geometry',
    'invalid_geometry',
    'too_short',
    'access_unverified',
    'current_condition_blocked',
    'source_restricted',
    'moderation_pending',
    'vehicle_incompatible',
    'date_or_season_blocked',
    'stale_required_source',
    'duplicate',
    'outside_radius',
    'filtered_by_user',
    'feature_disabled',
    'unsupported_route_type',
  ],
  'Explore guidance exclusion codes should remain stable for diagnostics and tests.',
);

const typedExclusionCases = [
  ['missing_geometry', makeRoute('missing-geometry', {
    routeGeometry: undefined,
    routeMetadata: { routeTypeStatus: 'suggested_trailhead', routeGeometryMode: 'omitted' },
  })],
  ['invalid_geometry', makeRoute('invalid-geometry', {
    routeGeometry: { type: 'LineString', coordinates: [[-110, 38]] },
  })],
  ['too_short', shortRoute],
  ['access_unverified', makeRoute('access-unverified', {
    routeMetadata: {
      routeTypeStatus: 'suggested_trailhead',
      routeGeometryMode: 'full',
      activeGuidance: { status: 'ready' },
      legalAccessStatus: 'requires_review',
    },
  })],
  ['current_condition_blocked', makeRoute('condition-blocked', {
    routeMetadata: {
      routeTypeStatus: 'suggested_trailhead',
      routeGeometryMode: 'full',
      activeGuidance: { status: 'ready' },
      catalogVerification: {
        publicRecommendation: true,
        currentCondition: { status: 'blocked', currentlyOpenStatus: 'closed', activeClosureCount: 1 },
      },
    },
  })],
  ['source_restricted', makeRoute('source-restricted', {
    routeMetadata: {
      routeTypeStatus: 'suggested_trailhead',
      routeGeometryMode: 'full',
      activeGuidance: { status: 'ready' },
      catalogVerification: {
        publicRecommendation: false,
        blockers: ['Partner/licensed route requires permission before publishing'],
      },
    },
  })],
  ['moderation_pending', makeRoute('moderation-pending', {
    routeMetadata: {
      routeTypeStatus: 'suggested_trailhead',
      reviewStatus: 'pending_review',
      routeGeometryMode: 'full',
      activeGuidance: { status: 'ready' },
    },
  })],
  ['vehicle_incompatible', makeRoute('vehicle-incompatible', { rigCompatibility: 20 })],
  ['date_or_season_blocked', makeRoute('season-blocked', {
    routeMetadata: {
      routeTypeStatus: 'suggested_trailhead',
      routeGeometryMode: 'full',
      activeGuidance: { status: 'ready' },
      catalogVerification: {
        publicRecommendation: true,
        currentCondition: { status: 'blocked', blockers: ['Seasonal restriction is active'] },
      },
    },
  })],
  ['stale_required_source', makeRoute('stale-required-source', {
    routeMetadata: {
      routeTypeStatus: 'suggested_trailhead',
      routeGeometryMode: 'full',
      activeGuidance: { status: 'ready' },
      catalogVerification: {
        publicRecommendation: false,
        dataUsed: [{ sourceType: 'official', freshness: 'stale' }],
      },
    },
  })],
  ['duplicate', makeRoute('declared-duplicate', {
    routeMetadata: {
      routeTypeStatus: 'suggested_trailhead',
      routeGeometryMode: 'full',
      activeGuidance: { status: 'ready' },
      duplicateOf: 'canonical-route',
    },
  })],
  ['outside_radius', makeRoute('outside-radius', {
    routeMetadata: {
      routeTypeStatus: 'suggested_trailhead',
      routeGeometryMode: 'full',
      activeGuidance: { status: 'ready' },
      outsideRadius: true,
    },
  })],
  ['filtered_by_user', makeRoute('filtered-by-user', {
    routeMetadata: {
      routeTypeStatus: 'suggested_trailhead',
      routeGeometryMode: 'full',
      activeGuidance: { status: 'ready' },
      filteredByUser: true,
    },
  })],
  ['feature_disabled', makeRoute('feature-disabled', {
    routeMetadata: {
      routeTypeStatus: 'suggested_trailhead',
      routeGeometryMode: 'full',
      activeGuidance: { status: 'ready' },
      exploreGuidanceReadyEnabled: false,
    },
  })],
  ['unsupported_route_type', makeRoute('unsupported-route-type', {
    routeMetadata: {
      routeTypeStatus: 'suggested_trailhead',
      routeGeometryMode: 'full',
      activeGuidance: { status: 'ready' },
      guidanceRouteTypeSupported: false,
    },
  })],
];

typedExclusionCases.forEach(([expectedCode, route]) => {
  const eligibility = defaultExploreReadyRouteEligibility(route);
  assert.strictEqual(eligibility.eligible, false, `${expectedCode} should exclude the route.`);
  assert(
    eligibility.exclusionCodes.includes(expectedCode),
    `${expectedCode} should be retained as a typed exclusion reason.`,
  );
  assert.strictEqual(
    eligibility.exclusionReasons.find((entry) => entry.code === expectedCode)?.reason.length > 0,
    true,
    `${expectedCode} should retain safe user-facing compatibility copy.`,
  );
});

const missingAccessEvidence = defaultExploreReadyRouteEligibility(makeRoute('missing-access-evidence', {
  routeMetadata: {
    routeTypeStatus: 'suggested_trailhead',
    routeGeometryMode: 'full',
    activeGuidance: { status: 'ready' },
  },
}));
assert.strictEqual(missingAccessEvidence.eligible, false);
assert(
  missingAccessEvidence.exclusionCodes.includes('access_unverified'),
  'The shared post-hydration eligibility gate must not infer access from valid geometry or guidance metadata.',
);

const mixedRequiredFreshness = defaultExploreReadyRouteEligibility(makeRoute('mixed-required-freshness', {
  routeMetadata: {
    routeTypeStatus: 'suggested_trailhead',
    routeGeometryMode: 'full',
    activeGuidance: { status: 'ready' },
    catalogVerification: {
      publicRecommendation: true,
      dataUsed: [
        { sourceType: 'official', freshness: 'fresh', required: true },
        { sourceType: 'official', freshness: 'stale', required: true },
      ],
    },
  },
}));
assert(
  mixedRequiredFreshness.exclusionCodes.includes('stale_required_source'),
  'Any stale or missing required source must block readiness even when another required source is fresh.',
);

for (const freshness of ['unknown', 'unavailable', undefined]) {
  const requiredSourceUnavailable = defaultExploreReadyRouteEligibility(makeRoute(
    `required-source-${freshness ?? 'missing'}`,
    {
      routeMetadata: {
        routeTypeStatus: 'suggested_trailhead',
        routeGeometryMode: 'full',
        activeGuidance: { status: 'ready' },
        catalogVerification: {
          publicRecommendation: true,
          dataUsed: [{ sourceType: 'official', freshness, required: true }],
        },
      },
    },
  ));
  assert(
    requiredSourceUnavailable.exclusionCodes.includes('stale_required_source'),
    `A ${freshness ?? 'missing'} required-source freshness state must not be treated as current.`,
  );
}

for (const sourceRecord of [
  { sourceType: 'partner_source', usePermission: 'not_granted' },
  { sourceType: 'partner_source' },
]) {
  const partnerRestricted = defaultExploreReadyRouteEligibility(makeRoute(
    `partner-${sourceRecord.usePermission ?? 'missing-permission'}`,
    {
      routeMetadata: {
        routeTypeStatus: 'suggested_trailhead',
        routeGeometryMode: 'full',
        activeGuidance: { status: 'ready' },
        legalAccessStatus: 'verified',
        sourceRecords: [sourceRecord],
      },
    },
  ));
  assert(
    partnerRestricted.exclusionCodes.includes('source_restricted'),
    'Partner geometry without granted use permission must retain a source-restricted exclusion.',
  );
}

const partnerTrailPackSource = defaultExploreReadyRouteEligibility(makeRoute('partner-source-route', {
  routeMetadata: {
    routeTypeStatus: 'suggested_trailhead',
    routeGeometryMode: 'full',
    activeGuidance: { status: 'ready' },
    legalAccessStatus: 'verified',
    trailPackSource: 'partner_source',
  },
}));
assert(
  partnerTrailPackSource.exclusionCodes.includes('source_restricted'),
  'A partner-source Trail Pack must not become public guidance-ready without a catalog-approved source.',
);

const closedStatusOnly = defaultExploreReadyRouteEligibility(makeRoute('closed-status-only', {
  routeMetadata: {
    routeTypeStatus: 'suggested_trailhead',
    routeGeometryMode: 'full',
    activeGuidance: { status: 'ready' },
    catalogVerification: {
      publicRecommendation: true,
      currentCondition: { status: 'closed' },
    },
  },
}));
assert(
  closedStatusOnly.exclusionCodes.includes('current_condition_blocked'),
  'A closed current-condition status must block readiness even without a separate closure count.',
);

const topLevelOmittedGeometry = defaultExploreReadyRouteEligibility(makeRoute('top-level-omitted-geometry', {
  routeMetadata: {
    routeTypeStatus: 'suggested_trailhead',
    legalAccessStatus: 'verified',
  },
  catalogVerification: {
    publicRecommendation: true,
    routeGeometryMode: 'omitted',
    activeGuidance: { status: 'ready' },
  },
}));
assert(
  !topLevelOmittedGeometry.exclusionCodes.includes('missing_geometry') &&
    topLevelOmittedGeometry.exclusionCodes.includes('invalid_geometry'),
  'Supplied geometry that conflicts with omitted-mode metadata must be invalid/degraded, not mislabeled as merely missing.',
);
const topLevelActuallyMissingGeometry = defaultExploreReadyRouteEligibility(makeRoute('top-level-actually-missing-geometry', {
  routeGeometry: undefined,
  routeMetadata: {
    routeTypeStatus: 'suggested_trailhead',
    legalAccessStatus: 'verified',
  },
  catalogVerification: {
    publicRecommendation: true,
    routeGeometryMode: 'omitted',
    activeGuidance: { status: 'unavailable' },
  },
}));
assert(
  topLevelActuallyMissingGeometry.exclusionCodes.includes('missing_geometry'),
  'Top-level catalog verification with no supplied geometry must retain the guidance-readiness exclusion.',
);

const emptyTopLevelCatalogAlias = defaultExploreReadyRouteEligibility(makeRoute('empty-top-level-catalog-alias', {
  routeMetadata: {
    routeTypeStatus: 'suggested_trailhead',
    routeGeometryMode: 'full',
    activeGuidance: { status: 'ready' },
    catalogVerification: {
      publicRecommendation: true,
      currentCondition: { status: 'closed' },
    },
  },
  catalogVerification: {},
}));
assert(
  emptyTopLevelCatalogAlias.exclusionCodes.includes('current_condition_blocked'),
  'An empty top-level catalog alias must not mask nested authoritative current-condition state.',
);

const conflictingCurrentConditionAliases = defaultExploreReadyRouteEligibility(makeRoute('conflicting-condition-aliases', {
  routeMetadata: {
    routeTypeStatus: 'suggested_trailhead',
    routeGeometryMode: 'full',
    activeGuidance: { status: 'ready' },
    catalogVerification: {
      publicRecommendation: true,
      currentCondition: { status: 'closed' },
    },
  },
  currentCondition: { status: 'clear' },
}));
assert(
  conflictingCurrentConditionAliases.exclusionCodes.includes('current_condition_blocked'),
  'An optimistic top-level condition must not override a closed authoritative condition alias.',
);

const conflictingAccessAliases = defaultExploreReadyRouteEligibility(makeRoute('conflicting-access-aliases', {
  routeMetadata: {
    routeTypeStatus: 'suggested_trailhead',
    routeGeometryMode: 'full',
    activeGuidance: { status: 'ready' },
    catalogVerification: { publicRecommendation: false },
  },
  catalogVerification: { publicRecommendation: true },
}));
assert(
  conflictingAccessAliases.exclusionCodes.includes('access_unverified'),
  'An optimistic catalog alias must not override a non-public authoritative access decision.',
);

const conflictingGeometryAliases = defaultExploreReadyRouteEligibility(makeRoute('conflicting-geometry-aliases', {
  routeMetadata: {
    routeTypeStatus: 'suggested_trailhead',
    legalAccessStatus: 'verified',
    catalogVerification: {
      publicRecommendation: true,
      routeGeometryMode: 'omitted',
      activeGuidance: { status: 'unavailable' },
    },
  },
  catalogVerification: {
    publicRecommendation: true,
    routeGeometryMode: 'full',
    activeGuidance: { status: 'ready' },
  },
}));
assert(
  conflictingGeometryAliases.exclusionCodes.includes('invalid_geometry') &&
    !conflictingGeometryAliases.exclusionCodes.includes('missing_geometry'),
  'Conflicting geometry aliases with supplied coordinates must be classified invalid rather than missing.',
);

const topLevelSourceAlias = defaultExploreReadyRouteEligibility(makeRoute('top-level-source-alias', {
  source: 'route_catalog',
  routeMetadata: {
    routeTypeStatus: 'suggested_trailhead',
    routeGeometryMode: 'full',
    activeGuidance: { status: 'ready' },
    legalAccessStatus: 'verified',
    trailPackSource: 'partner_source',
  },
}));
assert(
  topLevelSourceAlias.exclusionCodes.includes('source_restricted'),
  'A generic top-level source alias must not mask a partner-source classification in route metadata.',
);

const grantedPartnerRecord = defaultExploreReadyRouteEligibility(makeRoute('granted-partner-record', {
  routeMetadata: {
    routeTypeStatus: 'suggested_trailhead',
    routeGeometryMode: 'full',
    activeGuidance: { status: 'ready' },
    legalAccessStatus: 'verified',
    sourceRecords: [{ sourceType: 'partner_source', usePermission: 'granted' }],
  },
}));
assert.strictEqual(
  grantedPartnerRecord.exclusionCodes.includes('source_restricted'),
  false,
  'A structured partner source with explicit granted use permission is not source-restricted by that record alone.',
);

const restrictedCurrentCondition = defaultExploreReadyRouteEligibility(makeRoute('restricted-current-condition', {
  routeMetadata: {
    routeTypeStatus: 'suggested_trailhead',
    routeGeometryMode: 'full',
    activeGuidance: { status: 'ready' },
    catalogVerification: {
      publicRecommendation: true,
      currentCondition: { status: 'restricted' },
    },
  },
}));
assert(
  restrictedCurrentCondition.exclusionCodes.includes('current_condition_blocked'),
  'A restricted current-condition state must not pass Guidance Ready.',
);

const topLevelRequiredSource = defaultExploreReadyRouteEligibility(makeRoute('top-level-required-source', {
  dataUsed: [{ sourceType: 'official', freshness: 'unavailable', required: true }],
}));
assert(
  topLevelRequiredSource.exclusionCodes.includes('stale_required_source'),
  'Top-level required-source freshness must participate in readiness.',
);

const unavailableVerification = defaultExploreReadyRouteEligibility(makeRoute('unavailable-verification', {
  verificationStatus: 'unavailable',
}));
assert(
  unavailableVerification.exclusionCodes.includes('stale_required_source'),
  'Unavailable verification state must not be treated as current.',
);

const topLevelLoopDeclaration = defaultExploreReadyRouteEligibility(makeRoute('top-level-loop-declaration', {
  routeGeometry: {
    type: 'LineString',
    coordinates: [
      [-110, 38],
      [-109.99, 38.01],
      [-109.98, 38],
      [-110, 38],
    ],
  },
  routeMetadata: {
    routeTypeStatus: 'suggested_trailhead',
    routeGeometryMode: 'full',
    legalAccessStatus: 'verified',
  },
  catalogVerification: {
    publicRecommendation: true,
    routeType: 'loop',
    activeGuidance: { status: 'ready' },
  },
}));
assert.strictEqual(
  topLevelLoopDeclaration.eligible,
  true,
  'A top-level verified loop declaration must permit only the intentional closing endpoint revisit.',
);

const emptyDuplicateAlias = defaultExploreReadyRouteEligibility(makeRoute('empty-duplicate-alias', {
  routeMetadata: {
    routeTypeStatus: 'suggested_trailhead',
    routeGeometryMode: 'full',
    activeGuidance: { status: 'ready' },
    legalAccessStatus: 'verified',
    duplicateOf: '',
  },
}));
assert.strictEqual(
  emptyDuplicateAlias.eligible,
  true,
  'An empty duplicate alias must not falsely exclude the canonical route.',
);

const canonicalSelf = defaultExploreReadyRouteEligibility(makeRoute('canonical-self', {
  routeMetadata: {
    routeTypeStatus: 'suggested_trailhead',
    routeGeometryMode: 'full',
    activeGuidance: { status: 'ready' },
    legalAccessStatus: 'verified',
    canonicalRouteId: 'canonical-self',
  },
}));
assert.strictEqual(
  canonicalSelf.eligible,
  true,
  'A canonical route carrying its own canonical ID must not be classified as a duplicate.',
);

const canonicalTrailPackIdentity = defaultExploreReadyRouteEligibility(makeRoute('trail-pack:canonical-pack', {
  routeMetadata: {
    routeTypeStatus: 'suggested_trailhead',
    routeGeometryMode: 'full',
    activeGuidance: { status: 'ready' },
    legalAccessStatus: 'verified',
    trailPackId: 'canonical-pack',
    canonicalRouteId: 'canonical-pack',
  },
}));
assert.strictEqual(
  canonicalTrailPackIdentity.eligible,
  true,
  'A prefixed Trail Pack identity must match its unprefixed canonical catalog ID.',
);

const canonicalAlias = defaultExploreReadyRouteEligibility(makeRoute('canonical-alias', {
  routeMetadata: {
    routeTypeStatus: 'suggested_trailhead',
    routeGeometryMode: 'full',
    activeGuidance: { status: 'ready' },
    legalAccessStatus: 'verified',
    canonicalRouteId: 'canonical-owner',
  },
}));
assert(
  canonicalAlias.exclusionCodes.includes('duplicate'),
  'A route pointing to a different canonical identity must retain a duplicate exclusion.',
);

const multipleReasonEligibility = defaultExploreReadyRouteEligibility(makeRoute('multiple-reasons', {
  distanceMiles: 2,
  routeGeometry: undefined,
  rigCompatibility: 20,
  routeMetadata: {
    routeTypeStatus: 'suggested_trailhead',
    routeGeometryMode: 'omitted',
    catalogVerification: {
      publicRecommendation: true,
      currentCondition: { status: 'blocked', currentlyOpenStatus: 'closed', activeClosureCount: 1 },
    },
  },
}));
assert.deepStrictEqual(
  multipleReasonEligibility.exclusionCodes,
  ['too_short', 'missing_geometry', 'current_condition_blocked', 'vehicle_incompatible'],
  'Multiple exclusions should be retained once in stable legacy-compatible priority order.',
);
assert.strictEqual(
  multipleReasonEligibility.reason,
  `Route must be at least ${5} miles for Explorer guidance-ready cards.`,
  'The legacy reason field should remain the first stable compatibility reason.',
);

const inventory = buildExploreGuidanceReadyInventory({
  trailPacks: remoteReadyRoutes.slice(0, 5),
  hiddenGemRoutes: remoteReadyRoutes.slice(5, 7),
  ecsRouteIdeas: remoteReadyRoutes.slice(7),
  favoriteRoutes: [previewOnlyRoute, shortRoute, privateRoute, foldedLineRoute],
  selectedRefinement: 'remoteness',
});

assert.strictEqual(
  inventory.refinementCounts.remoteness,
  9,
  'Remoteness chip count should equal the guidance-ready filtered route count.',
);
assert.strictEqual(
  inventory.candidateSet.candidates.length,
  9,
  'Guidance Ready Routes count should use the same ready inventory as the active refinement count.',
);
assert.strictEqual(inventory.readyCount, 9, 'Ready count should ignore pagination-sized source windows.');
assert.strictEqual(inventory.hiddenTotal, 4, 'Routes hidden for geometry/public/length gates should be tracked separately.');
assert.strictEqual(
  defaultExploreReadyRouteEligibility(previewOnlyRoute).eligible,
  false,
  'Preview-only split geometry must not be treated as active-guidance-ready.',
);
assert.strictEqual(
  defaultExploreReadyRouteEligibility(activeGuidanceReadySearchPreviewRoute).eligible,
  true,
  'Source-backed search-preview geometry should stay eligible when catalog active-guidance metadata says the full route is ready and detail hydration will supply it before navigation.',
);
assert.strictEqual(
  defaultExploreReadyRouteEligibility(foldedLineRoute).eligible,
  false,
  'Folded LineString geometry must not count as guidance-ready even when stale metadata claims full ready geometry.',
);

const unselectedInventory = buildExploreGuidanceReadyInventory({
  trailPacks: remoteReadyRoutes,
  selectedRefinement: null,
});
assert.strictEqual(
  unselectedInventory.totalReadyCount,
  remoteReadyRoutes.length,
  'Range-only inventory should still count guidance-ready routes for refinement badges.',
);
assert.strictEqual(
  unselectedInventory.refinementCounts.remoteness,
  remoteReadyRoutes.length,
  'Range-only refinement counts should be available before a refinement is selected.',
);
assert.strictEqual(
  unselectedInventory.candidateSet.candidates.length,
  remoteReadyRoutes.length,
  'Explorer should render every guidance-ready route in range when no optional refinement is selected.',
);
assert.strictEqual(
  unselectedInventory.readyCount,
  remoteReadyRoutes.length,
  'The ready count should represent all guidance-ready routes when no optional refinement is active.',
);

const allSourceLaneInventory = buildExploreGuidanceReadyInventory({
  trailPacks: [makeRoute('ready-trail-pack')],
  hiddenGemRoutes: [makeRoute('ready-hidden-gem')],
  ecsRouteIdeas: [makeRoute('ready-ecs-idea')],
  favoriteRoutes: [makeRoute('ready-saved-built')],
  savedRouteAssets: [makeRoute('ready-imported-stitched')],
  selectedRefinement: null,
});
assert.deepStrictEqual(
  new Set(allSourceLaneInventory.candidateSet.candidates.map((candidate) => candidate.sourceKind)),
  new Set(['trail_pack', 'hidden_gem', 'ecs_idea', 'saved_built', 'imported_stitched']),
  'Every source lane that independently satisfies geometry, access, source, and safety gates should remain actionable in the canonical READY inventory.',
);
assert(
  allSourceLaneInventory.candidateSet.candidates.every((candidate) =>
    defaultExploreReadyRouteEligibility(candidate.route).eligible),
  'Every rendered source-lane candidate should pass the same runtime handoff eligibility function used by Preview, Start, and Build.',
);

const providerFailureWithLocalReady = deriveExploreGuidanceProviderAvailability({
  providerStatus: 'error',
  providerHasData: false,
  evaluatedCount: 1,
  readyCount: 1,
});
assert.strictEqual(
  providerFailureWithLocalReady.blockCanonicalInventory,
  false,
  'A provider error must not hide an eligible saved/imported route from the canonical inventory.',
);
assert.strictEqual(providerFailureWithLocalReady.providerUnavailableWithLocalReady, true);

const providerFailureWithoutLocalInventory = deriveExploreGuidanceProviderAvailability({
  providerStatus: 'error',
  providerHasData: false,
  evaluatedCount: 0,
  readyCount: 0,
});
assert.strictEqual(
  providerFailureWithoutLocalInventory.blockCanonicalInventory,
  true,
  'A provider error with no provider or local inventory should render the explicit unavailable terminal state.',
);

const canonicalOfficialRoute = makeRoute('canonical-official', {
  name: 'Canonical Shared Route',
  routeMetadata: {
    identityKey: 'catalog:canonical-shared-route',
    routeTypeStatus: 'suggested_trailhead',
    routeGeometryMode: 'full',
    activeGuidance: { status: 'ready' },
    catalogVerification: { publicRecommendation: true },
  },
});
const duplicateAiRoute = makeRoute('duplicate-ai', {
  name: 'Canonical Shared Route',
  routeMetadata: {
    identityKey: 'catalog:canonical-shared-route',
    routeTypeStatus: 'suggested_trailhead',
    routeGeometryMode: 'full',
    activeGuidance: { status: 'ready' },
    catalogVerification: { publicRecommendation: true },
  },
});
const canonicalInventory = buildExploreGuidanceReadyInventory({
  trailPacks: [canonicalOfficialRoute],
  ecsRouteIdeas: [duplicateAiRoute],
  selectedRefinement: null,
});
assert.strictEqual(canonicalInventory.readyCount, 1, 'Canonical candidates should not double-count aliases.');
assert.strictEqual(canonicalInventory.totalReadyCount, 1, 'Range totals should count canonical routes after dedupe.');
assert.strictEqual(
  canonicalInventory.refinementCounts.remoteness,
  1,
  'Refinement counts should count canonical routes after dedupe.',
);
assert(
  canonicalInventory.exclusions.some((entry) =>
    entry.id === duplicateAiRoute.id && entry.exclusionCodes.includes('duplicate')),
  'The non-canonical alias should remain visible in typed exclusion diagnostics.',
);
assert.strictEqual(
  canonicalInventory.exclusionTotal,
  canonicalInventory.exclusions.length,
  'Exclusion totals should include dedupe diagnostics independently of legacy hidden totals.',
);

const sameIdCrossSourceInventory = buildExploreGuidanceReadyInventory({
  trailPacks: [makeRoute('shared-source-id')],
  ecsRouteIdeas: [makeRoute('shared-source-id')],
  selectedRefinement: null,
});
assert.strictEqual(
  sameIdCrossSourceInventory.readyCount,
  1,
  'The same canonical ID from two source lanes must render once.',
);
assert(
  sameIdCrossSourceInventory.exclusions.some((entry) =>
    entry.sourceKind === 'ecs_idea' && entry.exclusionCodes.includes('duplicate')),
  'A same-ID cross-source record removed by dedupe must retain a typed duplicate diagnostic.',
);

for (const authoritativeBlocker of [
  {
    label: 'current condition',
    expectedCode: 'current_condition_blocked',
    metadata: {
      catalogVerification: {
        publicRecommendation: true,
        currentCondition: { status: 'closed' },
      },
    },
  },
  {
    label: 'access verification',
    expectedCode: 'access_unverified',
    metadata: {
      catalogVerification: { publicRecommendation: false },
    },
  },
  {
    label: 'source restriction',
    expectedCode: 'source_restricted',
    metadata: {
      legalAccessStatus: 'verified',
      trailPackSource: 'partner_source',
    },
  },
]) {
  const official = makeRoute(`official-${authoritativeBlocker.expectedCode}`, {
    routeMetadata: {
      identityKey: `catalog:authoritative-${authoritativeBlocker.expectedCode}`,
      routeTypeStatus: 'suggested_trailhead',
      routeGeometryMode: 'full',
      activeGuidance: { status: 'ready' },
      legalAccessStatus: 'verified',
      ...authoritativeBlocker.metadata,
    },
  });
  const lowerAuthorityAlias = makeRoute(`ai-${authoritativeBlocker.expectedCode}`, {
    routeMetadata: {
      identityKey: `catalog:authoritative-${authoritativeBlocker.expectedCode}`,
      routeTypeStatus: 'suggested_trailhead',
      routeGeometryMode: 'full',
      activeGuidance: { status: 'ready' },
      catalogVerification: { publicRecommendation: true },
    },
  });
  const authoritativeInventory = buildExploreGuidanceReadyInventory({
    trailPacks: [official],
    ecsRouteIdeas: [lowerAuthorityAlias],
    selectedRefinement: null,
  });
  assert.strictEqual(
    authoritativeInventory.readyCount,
    0,
    `A lower-authority duplicate must not bypass the official ${authoritativeBlocker.label} blocker.`,
  );
  assert(
    authoritativeInventory.exclusions.some((entry) =>
      entry.id === lowerAuthorityAlias.id && entry.exclusionCodes.includes(authoritativeBlocker.expectedCode)),
    `The lower-authority alias must inherit the canonical ${authoritativeBlocker.expectedCode} diagnostic.`,
  );
}

const customSafetyBypassInventory = buildExploreGuidanceReadyInventory({
  trailPacks: [makeRoute('custom-safety-bypass', {
    routeMetadata: {
      routeTypeStatus: 'suggested_trailhead',
      routeGeometryMode: 'full',
      activeGuidance: { status: 'ready' },
      catalogVerification: {
        publicRecommendation: true,
        currentCondition: { status: 'closed' },
      },
    },
  })],
  selectedRefinement: null,
  isRouteEligible: () => ({
    eligible: true,
    reason: null,
    exclusionCodes: [],
    exclusionReasons: [],
  }),
});
assert.strictEqual(
  customSafetyBypassInventory.readyCount,
  0,
  'An injected eligibility resolver may add constraints but must never bypass the default safety gate.',
);
assert(
  customSafetyBypassInventory.exclusions.some((entry) =>
    entry.exclusionCodes.includes('current_condition_blocked')),
  'Default safety exclusions must remain visible when a custom resolver reports eligible.',
);

const customCodesOnlyInventory = buildExploreGuidanceReadyInventory({
  trailPacks: [makeRoute('custom-codes-only')],
  selectedRefinement: null,
  isRouteEligible: () => ({
    eligible: false,
    reason: 'Current policy excludes this route.',
    exclusionCodes: ['feature_disabled'],
    exclusionReasons: [],
  }),
});
assert.strictEqual(customCodesOnlyInventory.readyCount, 0);
assert(
  customCodesOnlyInventory.exclusions.some((entry) =>
    entry.exclusionCodes.includes('feature_disabled')),
  'A custom resolver with typed codes but no expanded reasons must retain its typed exclusion.',
);

function routeWithoutAccessEvidence(id) {
  return makeRoute(id, {
    routeMetadata: {
      routeTypeStatus: 'suggested_trailhead',
      routeGeometryMode: 'full',
      activeGuidance: { status: 'ready' },
    },
  });
}

const unverifiedSourceInventory = buildExploreGuidanceReadyInventory({
  trailPacks: [routeWithoutAccessEvidence('catalog-without-verification')],
  hiddenGemRoutes: [routeWithoutAccessEvidence('hidden-gem-without-access')],
  ecsRouteIdeas: [routeWithoutAccessEvidence('ai-without-access')],
  favoriteRoutes: [routeWithoutAccessEvidence('saved-without-access')],
  savedRouteAssets: [routeWithoutAccessEvidence('imported-without-access')],
  selectedRefinement: null,
});
assert.strictEqual(
  unverifiedSourceInventory.readyCount,
  0,
  'No Explore source may infer access readiness from continuous geometry alone.',
);
assert.strictEqual(
  unverifiedSourceInventory.exclusionTotal,
  5,
  'Every source lane without explicit access evidence should retain an exclusion diagnostic.',
);
assert(
  unverifiedSourceInventory.exclusions.every((entry) =>
    entry.exclusionCodes.includes('access_unverified')),
  'Catalog, hidden-gem, AI, saved, and imported routes must all prove access readiness.',
);

const blockedRangeInventory = buildExploreGuidanceReadyInventory({
  trailPacks: [previewOnlyRoute, shortRoute, privateRoute],
  selectedRefinement: null,
});
assert.strictEqual(
  blockedRangeInventory.totalReadyCount,
  0,
  'Range-only inventory should report zero ready routes when every loaded route fails a production guidance gate.',
);
assert.strictEqual(
  blockedRangeInventory.rangeHiddenTotal,
  3,
  'Range-only inventory should retain non-ready blocker evidence before a refinement is selected.',
);
assert(
  blockedRangeInventory.rangeExclusions.some((entry) =>
    entry.exclusionReasons.some((reason) =>
      reason.reason === 'Active guidance requires continuous route geometry.')),
  'Range-only blocked evidence should include guidance geometry blockers without exposing raw provider payloads.',
);
assert(
  blockedRangeInventory.rangeHiddenReasons.every((entry) => !String(entry.reason).includes('coordinates')),
  'Range-only blocked evidence should remain safe for handoff copy and avoid raw coordinate/provider payload details.',
);

const performanceRoutes = Array.from({ length: 18 }, (_, index) => makeRoute(`perf-ready-${index + 1}`));
let performanceEligibilityCalls = 0;
const performanceInventory = buildExploreGuidanceReadyInventory({
  trailPacks: performanceRoutes,
  selectedRefinement: 'remoteness',
  isRouteEligible: (route) => {
    performanceEligibilityCalls += 1;
    return defaultExploreReadyRouteEligibility(route);
  },
});
assert.strictEqual(
  performanceInventory.refinementCounts.remoteness,
  performanceRoutes.length,
  'Remoteness refinement badges should still count every ready route in the selected radius.',
);
assert.strictEqual(
  performanceInventory.readyCount,
  performanceRoutes.length,
  'Guidance Ready Routes should stay in parity with the selected refinement after the inventory is optimized.',
);
assert.strictEqual(
  performanceEligibilityCalls,
  performanceRoutes.length,
  'Explore inventory should evaluate ready-route eligibility once per loaded route and reuse it for total/refinement counts.',
);

const sameSourceHighGeometryRoute = makeRoute('same-source-rich-geometry', {
  distanceMiles: 24,
  terrainDifficulty: 4,
  routeGeometry: {
    type: 'LineString',
    coordinates: [
      [-110, 38],
      [-109.99, 38.01],
      [-109.98, 38.02],
      [-109.97, 38.03],
      [-109.96, 38.04],
      [-109.95, 38.05],
      [-109.94, 38.06],
      [-109.93, 38.07],
      [-109.92, 38.08],
      [-109.91, 38.09],
    ],
  },
  routeMetadata: {
    routeGeometryMode: 'full',
    activeGuidance: {
      status: 'ready',
      topologyResolved: true,
      sourceSegmentCount: 10,
      componentCount: 1,
      branchDetected: false,
      joinedSegmentGapCount: 0,
      disjointSegmentGapCount: 0,
    },
    catalogVerification: {
      confidenceScore: 92,
      publicRecommendation: true,
      warnings: [],
      blockers: [],
      dataUsed: [
        { label: 'Official route geometry', freshness: 'fresh' },
        { label: 'Recent completion signal', freshness: 'fresh' },
      ],
      currentCondition: {
        status: 'clear',
        activeClosureCount: 0,
        warnings: [],
        blockers: [],
      },
    },
  },
});

const sameSourceSparseContextRoute = makeRoute('same-source-sparse-context', {
  distanceMiles: 92,
  terrainDifficulty: 8,
  routeGeometry: {
    type: 'LineString',
    coordinates: [
      [-110, 38],
      [-109.4, 38.6],
      [-108.8, 39.2],
    ],
  },
  routeMetadata: {
    routeGeometryMode: 'full',
    activeGuidance: {
      status: 'ready',
      topologyResolved: false,
      sourceSegmentCount: 3,
      componentCount: 1,
      branchDetected: false,
      joinedSegmentGapCount: 1,
      disjointSegmentGapCount: 0,
      maxJoinGapMeters: 42,
    },
    catalogVerification: {
      confidenceScore: 92,
      publicRecommendation: true,
      warnings: ['Sparse route geometry needs field review'],
      blockers: [],
      dataUsed: [
        { label: 'Official route geometry', freshness: 'aging' },
      ],
      currentCondition: {
        status: 'watch',
        activeClosureCount: 0,
        warnings: ['Seasonal condition requires review'],
        blockers: [],
      },
    },
  },
});

const richGeometryConfidence = deriveExploreLiveConfidence(sameSourceHighGeometryRoute);
const sparseContextConfidence = deriveExploreLiveConfidence(sameSourceSparseContextRoute);

assert.notStrictEqual(
  richGeometryConfidence.score,
  sparseContextConfidence.score,
  'Routes with the same source confidence must still render independent live scores from geometry/readiness/support criteria.',
);
assert(
  richGeometryConfidence.score > sparseContextConfidence.score,
  'Richer route geometry and cleaner verification support should score above sparse aging route context.',
);

const flatTerrainConfidence = deriveExploreLiveConfidence(makeRoute('same-source-flat-terrain', {
  distanceMiles: 18,
  terrainDifficulty: 3,
  remotenessScore: 4,
  elevationGainFt: 120,
  routeMetadata: {
    routeGeometryMode: 'full',
    activeGuidance: { status: 'ready', topologyResolved: true },
    elevationGainFt: 120,
    routeTerrainConfidence: {
      elevationGainFt: 120,
      terrainRiskScore: 8,
      terrainRiskEventCount: 0,
    },
    catalogVerification: {
      confidenceScore: 92,
      publicRecommendation: true,
      warnings: [],
      blockers: [],
      dataUsed: [{ label: 'Official route geometry', freshness: 'fresh' }],
      currentCondition: { status: 'clear', activeClosureCount: 0, warnings: [], blockers: [] },
    },
  },
}));
const mountainTerrainConfidence = deriveExploreLiveConfidence(makeRoute('same-source-mountain-terrain', {
  distanceMiles: 18,
  terrainDifficulty: 7,
  remotenessScore: 8,
  elevationGainFt: 3200,
  routeMetadata: {
    routeGeometryMode: 'full',
    activeGuidance: { status: 'ready', topologyResolved: true },
    elevationGainFt: 3200,
    routeTerrainConfidence: {
      elevationGainFt: 3200,
      elevationLossFt: 2800,
      terrainRiskScore: 78,
      terrainRiskEvents: ['shelf road exposure', 'steep grade', 'recovery obstacle'],
    },
    catalogVerification: {
      confidenceScore: 92,
      publicRecommendation: true,
      warnings: [],
      blockers: [],
      dataUsed: [{ label: 'Official route geometry', freshness: 'fresh' }],
      currentCondition: { status: 'clear', activeClosureCount: 0, warnings: [], blockers: [] },
    },
  },
}));

assert(
  flatTerrainConfidence.score > mountainTerrainConfidence.score,
  'Same-source Explore confidence should drop for high elevation gain and terrain-risk events.',
);
assert(
  flatTerrainConfidence.score - mountainTerrainConfidence.score >= 8,
  'Explore preview confidence should not display the same 92 for flat and 3,000 ft riskier route profiles.',
);

console.log('Explore guidance-ready routes checks passed.');
