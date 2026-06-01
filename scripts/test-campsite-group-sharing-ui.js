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

const {
  fetchGroupCampsitesForViewport,
  filterRenderableGroupCampSites,
  toGroupCampsiteMarkerPayload,
} = requireTs('lib/campsites/groupCampsiteMapLayer.ts');

function item(overrides = {}) {
  const now = '2026-04-28T12:00:00.000Z';
  return {
    share: {
      id: 'share-1',
      camp_site_report_id: 'report-1',
      camp_site_id: null,
      group_id: 'group-1',
      created_at: now,
    },
    report: {
      id: 'report-1',
      camp_site_id: null,
      latitude: 38.78,
      longitude: -121.2,
      source_type: 'pin_drop',
      location_accuracy_m: null,
      user_stayed_here: true,
      verified_in_person: true,
      visited_at: now,
      site_type: 'established_dispersed',
      access_difficulty: 'high_clearance',
      vehicle_fit: ['van'],
      amenities: {},
      conditions: {},
      notes: 'Quiet pullout.',
      visibility_requested: 'group',
      moderation_status: 'private_saved',
      stewardship_acknowledged: false,
      sensitive_area_acknowledged: false,
      created_at: now,
      updated_at: now,
    },
    camp_site: null,
    ...overrides,
  };
}

const formSource = fs.readFileSync(
  path.join(root, 'components', 'navigate', 'RecommendCampsiteForm.tsx'),
  'utf8',
);
const detailSource = fs.readFileSync(
  path.join(root, 'components', 'navigate', 'GroupCampsiteDetailCard.tsx'),
  'utf8',
);
const migrationSource = fs.readFileSync(
  path.join(root, 'supabase', 'migrations', '011_campsite_group_sharing.sql'),
  'utf8',
);

assert.ok(
  formSource.includes('Share with group') &&
    formSource.includes('Create group') &&
    formSource.includes('listMyCampSiteGroups') &&
    formSource.includes('shareCampSiteReportToGroup') &&
    formSource.includes('Campsite shared with group.'),
  'Campsite form should expose group visibility, group selection/creation, and group share submission.',
);

assert.ok(
  detailSource.includes('MY GROUP CAMPSITES') &&
    detailSource.includes('Members') &&
    detailSource.includes('Shared Campsites') &&
    detailSource.includes('REMOVE'),
  'Group detail card should show members, shared campsites, and admin remove action.',
);

assert.ok(
  migrationSource.includes('camp_site_groups') &&
    migrationSource.includes('camp_site_group_memberships') &&
    migrationSource.includes('camp_site_group_shares') &&
    migrationSource.includes('camp_site_reports_select_group_shared') &&
    migrationSource.includes('camp_site_photos_select_group_shared'),
  'Migration should add group tables and RLS for shared reports/photos.',
);

const renderable = filterRenderableGroupCampSites([item(), item({ report: { ...item().report, latitude: NaN } })]);
assert.strictEqual(renderable.length, 1, 'Group layer should defensively filter invalid markers.');
const marker = toGroupCampsiteMarkerPayload(renderable[0], true);
assert.strictEqual(marker.markerKind, 'group_campsite');
assert.strictEqual(marker.selected, true);
assert.strictEqual(marker.groupId, 'group-1');

let requestedGroup = null;
fetchGroupCampsitesForViewport(
  {
    async listGroupCampSitesByMapBounds(groupId, bounds) {
      requestedGroup = { groupId, bounds };
      return { ok: true, data: [item()] };
    },
  },
  'group-1',
  { minLat: 38, minLng: -122, maxLat: 39, maxLng: -120 },
).then((result) => {
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.data.length, 1);
  assert.strictEqual(requestedGroup.groupId, 'group-1');
  assert.strictEqual(requestedGroup.bounds.maxLng, -120);
  console.log('Campsite group sharing UI checks passed.');
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
