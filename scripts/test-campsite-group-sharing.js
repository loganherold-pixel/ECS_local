const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

process.env.EXPO_PUBLIC_SUPABASE_URL ||= 'https://example.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||= 'test-anon-key';

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') return { Platform: { OS: 'web' } };
  return originalLoad(request, parent, isMain);
};

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

const {
  CampSiteGroupSharingService,
} = require(path.join(root, 'lib', 'campsites', 'campsiteGroupSharingService.ts'));
const {
  getInitialCampSiteReportReviewState,
} = require(path.join(root, 'lib', 'campsites', 'campsiteRecommendationTypes.ts'));
const {
  filterRenderableCommunityCampSites,
} = require(path.join(root, 'lib', 'campsites', 'communityCampsiteMapLayer.ts'));
const {
  filterRenderableGroupCampSites,
  toGroupCampsiteMarkerPayload,
} = require(path.join(root, 'lib', 'campsites', 'groupCampsiteMapLayer.ts'));

class MemoryGroupBackend {
  constructor() {
    this.currentUser = null;
    this.available = true;
    this.groupSeq = 0;
    this.membershipSeq = 0;
    this.shareSeq = 0;
    this.groups = [];
    this.memberships = [];
    this.shares = [];
    this.auditEvents = [];
    this.reports = [];
    this.sites = [];
  }

  isAvailable() {
    return this.available;
  }

  async getCurrentUser() {
    return this.currentUser;
  }

  async insertGroup(row) {
    const now = new Date().toISOString();
    const group = { id: `group-${++this.groupSeq}`, created_at: now, updated_at: now, ...row };
    this.groups.push(group);
    return { ok: true, data: group };
  }

  async getGroupById(groupId) {
    const group = this.groups.find((item) => item.id === groupId);
    return group ? { ok: true, data: group } : { ok: false, code: 'not_found', error: 'Group not found' };
  }

  async insertMembership(row) {
    const existing = this.memberships.find(
      (item) => item.group_id === row.group_id && item.user_id === row.user_id,
    );
    if (existing) return { ok: false, code: 'backend_error', error: 'duplicate membership' };
    const now = new Date().toISOString();
    const membership = {
      id: `membership-${++this.membershipSeq}`,
      created_at: now,
      updated_at: now,
      ...row,
    };
    this.memberships.push(membership);
    return { ok: true, data: membership };
  }

  async upsertMembership(row) {
    const existing = this.memberships.find(
      (item) => item.group_id === row.group_id && item.user_id === row.user_id,
    );
    if (existing) {
      Object.assign(existing, row, { updated_at: new Date().toISOString() });
      return { ok: true, data: existing };
    }
    return this.insertMembership(row);
  }

  async updateMembership(membershipId, changes) {
    const membership = this.memberships.find((item) => item.id === membershipId);
    if (!membership) return { ok: false, code: 'not_found', error: 'Membership not found' };
    Object.assign(membership, changes, { updated_at: new Date().toISOString() });
    return { ok: true, data: membership };
  }

  async getMembership(groupId, userId) {
    return {
      ok: true,
      data: this.memberships.find(
        (item) => item.group_id === groupId && item.user_id === userId,
      ) ?? null,
    };
  }

  async listMembershipsByUser(userId) {
    return {
      ok: true,
      data: this.memberships.filter((item) => item.user_id === userId && item.status !== 'removed'),
    };
  }

  async listMembershipsByGroup(groupId) {
    return {
      ok: true,
      data: this.memberships.filter((item) => item.group_id === groupId),
    };
  }

  async insertShare(row) {
    const share = {
      id: `share-${++this.shareSeq}`,
      created_at: new Date().toISOString(),
      ...row,
    };
    this.shares.push(share);
    return { ok: true, data: share };
  }

  async getShareById(shareId) {
    const share = this.shares.find((item) => item.id === shareId);
    return share ? { ok: true, data: share } : { ok: false, code: 'not_found', error: 'Share not found' };
  }

  async deleteShare(shareId) {
    this.shares = this.shares.filter((item) => item.id !== shareId);
    return { ok: true, data: undefined };
  }

  async insertGroupAuditEvent(row) {
    const event = {
      id: `audit-${this.auditEvents.length + 1}`,
      created_at: new Date().toISOString(),
      ...row,
    };
    this.auditEvents.push(event);
    return { ok: true, data: event };
  }

  async listSharesByGroup(groupId) {
    return { ok: true, data: this.shares.filter((item) => item.group_id === groupId) };
  }

  async getReportById(reportId) {
    const report = this.reports.find((item) => item.id === reportId);
    return report ? { ok: true, data: report } : { ok: false, code: 'not_found', error: 'Report not found' };
  }

  async updateReport(reportId, changes) {
    const report = this.reports.find((item) => item.id === reportId);
    if (!report) return { ok: false, code: 'not_found', error: 'Report not found' };
    Object.assign(report, changes, { updated_at: new Date().toISOString() });
    return { ok: true, data: report };
  }

  async getCampSiteById(campSiteId) {
    const site = this.sites.find((item) => item.id === campSiteId);
    return site ? { ok: true, data: site } : { ok: false, code: 'not_found', error: 'Site not found' };
  }
}

function report(overrides = {}) {
  const now = new Date().toISOString();
  return {
    id: overrides.id ?? 'report-1',
    camp_site_id: null,
    submitted_by_user_id: 'user-owner',
    latitude: 38.78,
    longitude: -121.2,
    source_type: 'pin_drop',
    location_accuracy_m: null,
    user_stayed_here: false,
    verified_in_person: false,
    visited_at: null,
    site_type: 'established_dispersed',
    access_difficulty: 'high_clearance',
    vehicle_fit: ['van'],
    amenities: {},
    conditions: {},
    notes: 'Private group campsite',
    visibility_requested: 'group',
    moderation_status: 'private_saved',
    stewardship_acknowledged: false,
    sensitive_area_acknowledged: false,
    review_state: 'private_saved',
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function site(overrides = {}) {
  const now = new Date().toISOString();
  return {
    id: overrides.id ?? 'site-1',
    canonical_name: 'Approved Ridge Camp',
    latitude: 38.79,
    longitude: -121.21,
    status: 'approved',
    visibility: 'community',
    site_type: 'developed',
    access_difficulty: 'awd',
    vehicle_fit: ['small_vehicle'],
    trailer_friendly: false,
    max_rig_length_ft: null,
    max_group_size: null,
    amenities: {},
    conditions: {},
    trust_score: 80,
    legal_confidence: 'high',
    last_confirmed_at: now,
    confirmation_count: 3,
    flag_count: 0,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

async function main() {
  const backend = new MemoryGroupBackend();
  const service = new CampSiteGroupSharingService(backend);

  backend.currentUser = { id: 'user-owner' };
  const created = await service.createCampSiteGroup('  Sierra Friends  ');
  assert.strictEqual(created.ok, true, 'Authenticated user should create group.');
  assert.strictEqual(created.data.group.name, 'Sierra Friends');
  assert.strictEqual(created.data.membership.role, 'owner');

  const groupId = created.data.group.id;
  const added = await service.addGroupMember(groupId, 'user-member');
  assert.strictEqual(added.ok, true, 'Owner can add member.');
  assert.strictEqual(added.data.status, 'active');

  backend.reports.push(report());
  const shared = await service.shareCampSiteReportToGroup('report-1', groupId);
  assert.strictEqual(shared.ok, true, 'Owner can share owned private/group report.');
  assert.strictEqual(shared.data.report.visibility_requested, 'group');
  assert.strictEqual(shared.data.report.moderation_status, 'private_saved');

  backend.currentUser = { id: 'user-outsider' };
  const outsiderList = await service.listGroupCampSites(groupId);
  assert.strictEqual(outsiderList.ok, false, 'Non-member cannot access group campsites.');
  assert.strictEqual(outsiderList.code, 'permission_denied');

  backend.currentUser = { id: 'user-member' };
  const memberList = await service.listGroupCampSites(groupId);
  assert.strictEqual(memberList.ok, true, 'Member can see group-shared campsite.');
  assert.strictEqual(memberList.data.length, 1);
  assert.strictEqual(filterRenderableGroupCampSites(memberList.data).length, 1);
  const marker = toGroupCampsiteMarkerPayload(memberList.data[0]);
  assert.strictEqual(marker.markerKind, 'group_campsite');
  assert.strictEqual(marker.rankLabel, 'GR');

  const publicVisible = filterRenderableCommunityCampSites([
    site({ id: 'public-site' }),
    site({ id: 'group-site', visibility: 'group' }),
  ]);
  assert.deepStrictEqual(
    publicVisible.map((item) => item.id),
    ['public-site'],
    'Group-shared campsite records must not render in the public community layer.',
  );

  assert.strictEqual(
    getInitialCampSiteReportReviewState('group'),
    'private_saved',
    'Group reports skip community review by default.',
  );
  assert.strictEqual(
    getInitialCampSiteReportReviewState('community'),
    'submitted',
    'A later community submission must enter the community review path.',
  );

  backend.sites.push(site());
  const sharedPublic = await service.shareApprovedCampSiteToGroup('site-1', groupId);
  assert.strictEqual(sharedPublic.ok, true, 'Member can share an approved public campsite into a group.');
  assert.strictEqual(sharedPublic.data.camp_site.visibility, 'community');

  const bounded = await service.listGroupCampSitesByMapBounds(groupId, {
    minLat: 38.75,
    minLng: -121.25,
    maxLat: 38.8,
    maxLng: -121.19,
  });
  assert.strictEqual(bounded.ok, true);
  assert.strictEqual(bounded.data.length, 2, 'Group map bounds should include shared reports and sites.');

  backend.currentUser = { id: 'user-owner' };
  const removedShare = await service.removeGroupShare(shared.data.share.id);
  assert.strictEqual(removedShare.ok, true, 'Group admin/owner can remove shared campsites.');
  assert.strictEqual(backend.shares.some((item) => item.id === shared.data.share.id), false);
  assert.strictEqual(
    backend.auditEvents.some(
      (event) =>
        event.event_type === 'share_removed' &&
        event.group_id === groupId &&
        event.actor_user_id === 'user-owner',
    ),
    true,
    'Removing a group campsite share should write an audit event.',
  );

  const removedMember = await service.removeGroupMember(groupId, 'user-member');
  assert.strictEqual(removedMember.ok, true, 'Owner can remove a group member.');
  backend.currentUser = { id: 'user-member' };
  const afterRemoval = await service.listGroupCampSites(groupId);
  assert.strictEqual(afterRemoval.ok, false, 'Removed member loses group campsite access.');

  backend.currentUser = { id: 'user-member' };
  const cannotShareOtherPrivate = await service.shareCampSiteReportToGroup('report-1', groupId);
  assert.strictEqual(
    cannotShareOtherPrivate.ok,
    false,
    'Users cannot share another user private report without explicit resharing support.',
  );

  backend.currentUser = { id: 'user-owner' };
  const communitySubmit = await service.submitGroupCampSiteReportToCommunityReview('report-1', {
    stewardship_acknowledged: true,
    sensitive_area_acknowledged: true,
  });
  assert.strictEqual(communitySubmit.ok, true, 'Group report owner can submit to community review later.');
  assert.strictEqual(communitySubmit.data.visibility_requested, 'community');
  assert.strictEqual(communitySubmit.data.moderation_status, 'pending');
  assert.strictEqual(communitySubmit.data.review_state, 'submitted');

  console.log('Campsite group sharing checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
