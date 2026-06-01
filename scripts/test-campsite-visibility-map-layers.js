const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function requireTs(relativePath) {
  const fullPath = path.join(root, relativePath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
  }).outputText;
  const module = { exports: {} };
  const localRequire = (request) => {
    if (request.startsWith('./') || request.startsWith('../')) {
      return requireTs(path.join(path.dirname(relativePath), request).replace(/\\/g, '/'));
    }
    return require(request);
  };
  new Function('require', 'module', 'exports', compiled)(localRequire, module, module.exports);
  return module.exports;
}

const communityLayer = requireTs('lib/campsites/communityCampsiteMapLayer.ts');
const groupLayer = requireTs('lib/campsites/groupCampsiteMapLayer.ts');
const visibilityLayer = requireTs('lib/campsites/campsiteVisibilityMapLayers.ts');

const bounds = {
  minLat: 38,
  minLng: -122,
  maxLat: 39,
  maxLng: -120,
};

function report(overrides = {}) {
  return {
    id: 'report-1',
    camp_site_id: null,
    latitude: 38.78,
    longitude: -121.2,
    source_type: 'pin_drop',
    location_accuracy_m: 25,
    user_stayed_here: true,
    verified_in_person: true,
    visited_at: '2026-04-20T12:00:00.000Z',
    site_type: 'established_dispersed',
    access_difficulty: 'high_clearance',
    vehicle_fit: ['full_size_truck'],
    amenities: {},
    conditions: {},
    notes: 'Ridge pullout.',
    visibility_requested: 'private',
    moderation_status: 'private_saved',
    stewardship_acknowledged: false,
    sensitive_area_acknowledged: false,
    review_state: 'private_saved',
    created_at: '2026-04-20T12:00:00.000Z',
    updated_at: '2026-04-20T12:00:00.000Z',
    ...overrides,
  };
}

function site(overrides = {}) {
  return {
    id: 'site-approved',
    canonical_name: 'Ridge Pullout',
    latitude: 38.78,
    longitude: -121.2,
    status: 'approved',
    visibility: 'community',
    site_type: 'established_dispersed',
    access_difficulty: 'high_clearance',
    vehicle_fit: ['full_size_truck'],
    trailer_friendly: true,
    max_rig_length_ft: 22,
    max_group_size: 3,
    amenities: {},
    conditions: {},
    trust_score: 76,
    legal_confidence: 'medium',
    last_confirmed_at: '2026-04-20T12:00:00.000Z',
    confirmation_count: 3,
    flag_count: 0,
    created_at: '2026-04-01T12:00:00.000Z',
    updated_at: '2026-04-20T12:00:00.000Z',
    ...overrides,
  };
}

assert.deepStrictEqual(
  communityLayer.filterRenderableCommunityCampSites([
    site(),
    site({ id: 'pending-site', status: 'hidden' }),
    site({ id: 'private-site', visibility: 'private' }),
  ]).map((item) => item.id),
  ['site-approved'],
  'Community layer must render only approved community camp_sites.',
);

assert.deepStrictEqual(
  visibilityLayer.filterRenderablePrivateCampsiteReports([
    report(),
    report({ id: 'community-report', visibility_requested: 'community', review_state: 'submitted', moderation_status: 'pending' }),
    report({ id: 'approved-private', moderation_status: 'approved', review_state: 'approved' }),
  ]).map((item) => item.id),
  ['report-1'],
  'Private layer must render only current-user private_saved reports supplied by the authorized service.',
);

assert.deepStrictEqual(
  visibilityLayer.filterRenderablePendingCommunityReports([
    report({ id: 'submitted', visibility_requested: 'community', moderation_status: 'pending', review_state: 'submitted' }),
    report({ id: 'community-review', visibility_requested: 'community', moderation_status: 'pending', review_state: 'community_review' }),
    report({ id: 'moderator-review', visibility_requested: 'community', moderation_status: 'pending', review_state: 'moderator_review' }),
    report({ id: 'needs-info', visibility_requested: 'community', moderation_status: 'needs_info', review_state: 'needs_submitter_info' }),
    report({ id: 'approved', visibility_requested: 'community', moderation_status: 'approved', review_state: 'approved' }),
    report({ id: 'private', visibility_requested: 'private', moderation_status: 'private_saved', review_state: 'private_saved' }),
  ]).map((item) => item.id),
  ['submitted', 'community-review', 'moderator-review', 'needs-info'],
  'Pending layer must render only the submitter-visible community review states.',
);

const groupItem = {
  share: {
    id: 'share-1',
    camp_site_report_id: 'report-1',
    camp_site_id: null,
    group_id: 'group-1',
    created_at: '2026-04-20T12:00:00.000Z',
  },
  report: report({ visibility_requested: 'group', moderation_status: 'private_saved', review_state: 'private_saved' }),
  camp_site: null,
};
assert.strictEqual(groupLayer.filterRenderableGroupCampSites([groupItem]).length, 1);
assert.strictEqual(groupLayer.toGroupCampsiteMarkerPayload(groupItem).markerKind, 'group_campsite');

const privateMarker = visibilityLayer.toPrivateCampsiteMarkerPayload(report(), true);
assert.strictEqual(privateMarker.markerKind, 'private_campsite');
assert.strictEqual(privateMarker.visibilityScope, 'private');
assert.strictEqual(privateMarker.selected, true);

const pendingMarker = visibilityLayer.toPendingCampsiteMarkerPayload(
  report({ visibility_requested: 'community', moderation_status: 'pending', review_state: 'community_review' }),
);
assert.strictEqual(pendingMarker.markerKind, 'pending_campsite');
assert.strictEqual(pendingMarker.statusLabel, 'Pending review - not public');

const reviewerMarker = visibilityLayer.toReviewerPendingCampsiteMarkerPayload(
  report({ id: 'reviewer-1', visibility_requested: 'community', moderation_status: 'pending', review_state: 'community_review' }),
);
assert.strictEqual(reviewerMarker.markerKind, 'reviewer_pending_campsite');
assert.strictEqual(reviewerMarker.visibilityScope, 'reviewer_pending');

assert.deepStrictEqual(
  visibilityLayer.getCampsiteLayerActions('community'),
  ['save', 'confirm', 'flag'],
  'Community detail actions should remain public-safe.',
);
assert.deepStrictEqual(
  visibilityLayer.getCampsiteLayerActions('private'),
  ['edit', 'delete', 'share', 'submit_to_community'],
  'Private detail card should expose owner actions.',
);
assert.deepStrictEqual(
  visibilityLayer.getCampsiteLayerActions('pending'),
  ['edit', 'withdraw'],
  'Pending detail card should expose submitter review-status actions.',
);
assert.deepStrictEqual(
  visibilityLayer.getCampsiteLayerActions('reviewer_pending'),
  ['open_review'],
  'Reviewer pending detail should shortcut to review.',
);

let privateFetchCalled = false;
visibilityLayer.fetchPrivateCampsitesForViewport(
  {
    async listCurrentUserPrivateReportsByBounds(receivedBounds) {
      privateFetchCalled = true;
      assert.deepStrictEqual(receivedBounds, bounds);
      return { ok: true, data: [report(), report({ id: 'outside', latitude: 40 })] };
    },
    async listCurrentUserPendingCommunityReportsByBounds() {
      throw new Error('unexpected pending fetch');
    },
  },
  bounds,
).then(async (privateResult) => {
  assert.strictEqual(privateFetchCalled, true);
  assert.strictEqual(privateResult.ok, true);
  assert.deepStrictEqual(privateResult.data.map((item) => item.id), ['report-1']);

  const reviewerBlocked = await visibilityLayer.fetchReviewerPendingCampsitesForViewport(
    {
      async listCommunityReviewQueue() {
        return { ok: false, code: 'admin_required', error: 'Only trusted reviewers can view this layer.' };
      },
    },
    bounds,
  );
  assert.strictEqual(reviewerBlocked.ok, false);
  assert.strictEqual(reviewerBlocked.code, 'admin_required');

  const toggles = visibilityLayer.CAMPSITE_VISIBILITY_LAYER_TOGGLES.map((toggle) => toggle.key);
  assert.deepStrictEqual(
    toggles,
    ['community', 'private', 'group', 'pending', 'reviewer_pending'],
    'Layer toggles should cover every campsite visibility scope.',
  );

  const serviceSource = fs.readFileSync(
    path.join(root, 'lib', 'campsites', 'campsiteRecommendationService.ts'),
    'utf8',
  );
  const navigateSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'navigate.tsx'), 'utf8');
  const detailSource = fs.readFileSync(
    path.join(root, 'components', 'navigate', 'CampsiteVisibilityDetailCard.tsx'),
    'utf8',
  );
  const groupDetailSource = fs.readFileSync(
    path.join(root, 'components', 'navigate', 'GroupCampsiteMarkerDetailCard.tsx'),
    'utf8',
  );

  assert.ok(
    serviceSource.includes('listCurrentUserPrivateReportsByBounds') &&
      serviceSource.includes('listCurrentUserPendingCommunityReportsByBounds') &&
      serviceSource.includes(".eq('submitted_by_user_id', userId)") &&
      serviceSource.includes(".in('review_state', options.reviewStates)"),
    'Service must use current-user scoped, review-state-filtered viewport queries.',
  );
  assert.ok(
    navigateSource.includes('CAMPSITE_VISIBILITY_LAYER_TOGGLES') &&
      navigateSource.includes('fetchPrivateCampsitesForViewport') &&
      navigateSource.includes('fetchPendingCommunitySubmissionsForViewport') &&
      navigateSource.includes('fetchReviewerPendingCampsitesForViewport') &&
      navigateSource.includes("payload?.markerKind === 'private_campsite'") &&
      navigateSource.includes("payload?.markerKind === 'group_campsite'") &&
      navigateSource.includes('<GroupCampsiteMarkerDetailCard'),
    'Navigate should expose scoped layer toggles and route marker taps by marker kind.',
  );
  assert.ok(
    detailSource.includes('PENDING_REVIEW_PUBLIC_LABEL') &&
      detailSource.includes('Submit to community') &&
      detailSource.includes('Open review'),
    'Scoped campsite detail card should label pending records and expose scope-specific actions.',
  );
  assert.ok(
    groupDetailSource.includes('GROUP CAMPSITE') &&
      groupDetailSource.includes('Open group') &&
      groupDetailSource.includes('Remove share'),
    'Group marker detail card should show a group badge and group-specific actions.',
  );

  console.log('Campsite visibility map layer checks passed.');
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
