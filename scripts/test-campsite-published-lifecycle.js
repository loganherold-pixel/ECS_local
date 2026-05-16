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
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
  }
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
  CampsiteRecommendationService,
} = require(path.join(root, 'lib', 'campsites', 'campsiteRecommendationService.ts'));
const {
  CampsiteReviewNotificationService,
} = require(path.join(root, 'lib', 'campsites', 'campsiteReviewNotificationService.ts'));

function nowIso(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString();
}

function createSite(overrides = {}) {
  const now = nowIso();
  return {
    id: overrides.id ?? 'site-1',
    canonical_name: 'Test Camp',
    latitude: 38.7807,
    longitude: -121.2076,
    status: 'approved',
    visibility: 'community',
    site_type: 'established_dispersed',
    access_difficulty: 'high_clearance',
    vehicle_fit: ['full_size_truck'],
    trailer_friendly: null,
    max_rig_length_ft: null,
    max_group_size: null,
    amenities: {},
    conditions: {},
    trust_score: 60,
    legal_confidence: 'medium',
    last_confirmed_at: now,
    confirmation_count: 1,
    flag_count: 0,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

class MemoryBackend {
  constructor() {
    this.currentUser = { id: 'admin-1', isAdmin: true };
    this.reports = [];
    this.sites = [createSite()];
    this.flags = [];
    this.events = [];
    this.reportSeq = 0;
    this.flagSeq = 0;
  }

  isAvailable() {
    return true;
  }

  async getCurrentUser() {
    return this.currentUser;
  }

  async insertReport(row) {
    const now = nowIso();
    const report = { id: `report-${++this.reportSeq}`, created_at: now, updated_at: now, ...row };
    this.reports.push(report);
    return { ok: true, data: report };
  }

  async updateReport(reportId, changes) {
    const report = this.reports.find((item) => item.id === reportId);
    if (!report) return { ok: false, code: 'not_found', error: 'Report not found.' };
    Object.assign(report, changes, { updated_at: nowIso() });
    return { ok: true, data: report };
  }

  async getReportById(reportId) {
    const report = this.reports.find((item) => item.id === reportId);
    return report ? { ok: true, data: report } : { ok: false, code: 'not_found', error: 'Report not found.' };
  }

  async listReportsByUser(userId) {
    return { ok: true, data: this.reports.filter((report) => report.submitted_by_user_id === userId) };
  }

  async listApprovedCommunityCampSitesByBounds(params) {
    return {
      ok: true,
      data: this.sites.filter(
        (site) =>
          site.status === 'approved' &&
          site.visibility === 'community' &&
          site.latitude >= params.minLat &&
          site.latitude <= params.maxLat &&
          site.longitude >= params.minLng &&
          site.longitude <= params.maxLng,
      ),
    };
  }

  async getApprovedCommunityCampSiteById(campSiteId) {
    const site = this.sites.find(
      (item) => item.id === campSiteId && item.status === 'approved' && item.visibility === 'community',
    );
    return site ? { ok: true, data: site } : { ok: false, code: 'not_found', error: 'Campsite not found.' };
  }

  async getCampSiteById(campSiteId) {
    const site = this.sites.find((item) => item.id === campSiteId);
    return site ? { ok: true, data: site } : { ok: false, code: 'not_found', error: 'Campsite not found.' };
  }

  async insertCampSite(row) {
    const site = { id: `site-${this.sites.length + 1}`, created_at: nowIso(), updated_at: nowIso(), ...row };
    this.sites.push(site);
    return { ok: true, data: site };
  }

  async updateCampSite(campSiteId, changes) {
    const site = this.sites.find((item) => item.id === campSiteId);
    if (!site) return { ok: false, code: 'not_found', error: 'Campsite not found.' };
    Object.assign(site, changes, { updated_at: nowIso() });
    return { ok: true, data: site };
  }

  async insertFlag(row) {
    const flag = { id: `flag-${++this.flagSeq}`, created_at: nowIso(), ...row };
    this.flags.push(flag);
    return { ok: true, data: flag };
  }

  async countFlags(campSiteId) {
    return { ok: true, data: this.flags.filter((flag) => flag.camp_site_id === campSiteId).length };
  }

  async listFlagsForCampSite(campSiteId) {
    return { ok: true, data: this.flags.filter((flag) => flag.camp_site_id === campSiteId) };
  }

  async listFlaggedCampSites(limit) {
    return {
      ok: true,
      data: this.sites
        .filter((site) => site.status === 'hidden_pending_review' || site.flag_count >= 3)
        .slice(0, limit),
    };
  }

  async insertCampSiteLifecycleEvent(row) {
    const event = { id: `event-${this.events.length + 1}`, created_at: nowIso(), ...row };
    this.events.push(event);
    return { ok: true, data: event };
  }

  async countApprovedPhotosForReport() {
    return { ok: true, data: 0 };
  }

  async listPendingReports() {
    return { ok: true, data: [] };
  }
}

class MemoryNotificationBackend {
  constructor() {
    this.notifications = [];
  }

  isAvailable() {
    return true;
  }

  async insertNotification(row) {
    const notification = {
      ...row,
      id: `notification-${this.notifications.length + 1}`,
      read_at: null,
      created_at: nowIso(),
    };
    this.notifications.push(notification);
    return { ok: true, data: notification };
  }

  async listModeratorUserIds() {
    return { ok: true, data: ['moderator-1'] };
  }

  async listTrustedReviewerUserIds() {
    return { ok: true, data: [] };
  }
}

async function run() {
  const backend = new MemoryBackend();
  const notificationBackend = new MemoryNotificationBackend();
  const notifications = new CampsiteReviewNotificationService(notificationBackend);
  const service = new CampsiteRecommendationService(backend, notifications);

  backend.currentUser = { id: 'user-2' };
  const confirm = await service.confirmCampsite({ camp_site_id: 'site-1', source_type: 'current_location' });
  assert.strictEqual(confirm.ok, true, 'approved campsite confirmation should succeed');
  assert.strictEqual(confirm.data.camp_site.confirmation_count, 2);
  assert(confirm.data.camp_site.last_confirmed_at, 'confirmation should update last_confirmed_at');

  const duplicate = await service.confirmCampsite({ camp_site_id: 'site-1', source_type: 'current_location' });
  assert.strictEqual(duplicate.ok, true, 'rapid duplicate confirmation returns existing confirmation');
  assert.strictEqual(duplicate.data.camp_site.confirmation_count, 2, 'rapid duplicate confirmation should not increment');

  const softFlag = await service.flagCampsite({
    camp_site_id: 'site-1',
    reason: 'bad_coordinates',
    details: 'Marker may be offset.',
  });
  assert.strictEqual(softFlag.ok, true, 'flag should be recorded');
  assert.strictEqual(softFlag.data.flag_count, 1);
  assert.strictEqual(backend.sites[0].status, 'approved', 'non-serious first flag should not hide site');

  backend.currentUser = { id: 'user-3' };
  const seriousFlag = await service.flagCampsite({
    camp_site_id: 'site-1',
    reason: 'private_land',
    details: 'Gate and posted signage observed.',
  });
  assert.strictEqual(seriousFlag.ok, true, 'serious flag should be recorded');
  assert.strictEqual(backend.sites[0].status, 'hidden_pending_review');
  assert.strictEqual(
    backend.events.some((event) => event.event_type === 'serious_flag_review_started'),
    true,
    'serious flag should create a moderator lifecycle event',
  );
  assert.strictEqual(
    notificationBackend.notifications.some((notification) => notification.recipient_user_id === 'moderator-1'),
    true,
    'serious flag should notify moderators',
  );

  const publicAfterSeriousFlag = await service.listApprovedCommunityCampsitesByBounds({
    minLat: 38,
    minLng: -122,
    maxLat: 39,
    maxLng: -120,
  });
  assert.strictEqual(publicAfterSeriousFlag.ok, true);
  assert.strictEqual(publicAfterSeriousFlag.data.length, 0, 'hidden_pending_review site should leave public layer');

  backend.currentUser = { id: 'admin-1', isAdmin: true };
  const queue = await service.listFlaggedCampsiteReviewQueue();
  assert.strictEqual(queue.ok, true, 'moderator can list flagged campsite queue');
  assert.strictEqual(queue.data.length, 1);
  assert.strictEqual(queue.data[0].flags.length, 2);

  const kept = await service.resolveFlaggedCampsiteReview({
    campSiteId: 'site-1',
    action: 'keep_published',
    internal_notes: 'Reviewed signage report and verified legal access.',
  });
  assert.strictEqual(kept.ok, true);
  assert.strictEqual(kept.data.status, 'approved', 'moderator can keep a flagged site published');

  backend.currentUser = { id: 'user-4' };
  await service.flagCampsite({ camp_site_id: 'site-1', reason: 'unsafe', details: 'Unstable slope.' });
  assert.strictEqual(backend.sites[0].status, 'hidden_pending_review');

  backend.currentUser = { id: 'admin-1', isAdmin: true };
  const updated = await service.resolveFlaggedCampsiteReview({
    campSiteId: 'site-1',
    action: 'update_details',
    updates: { canonical_name: 'Reviewed Test Camp', legal_confidence: 'high' },
  });
  assert.strictEqual(updated.ok, true);
  assert.strictEqual(updated.data.status, 'approved');
  assert.strictEqual(updated.data.canonical_name, 'Reviewed Test Camp');

  await service.flagCampsite({ camp_site_id: 'site-1', reason: 'closed_to_camping', details: 'Closure order posted.' });
  const closed = await service.resolveFlaggedCampsiteReview({
    campSiteId: 'site-1',
    action: 'mark_closed',
  });
  assert.strictEqual(closed.ok, true);
  assert.strictEqual(closed.data.status, 'closed', 'moderator can mark a flagged site closed');

  const hiddenPublic = await service.listApprovedCommunityCampsitesByBounds({
    minLat: 38,
    minLng: -122,
    maxLat: 39,
    maxLng: -120,
  });
  assert.strictEqual(hiddenPublic.data.length, 0, 'closed campsite should not render publicly');

  const target = await backend.insertCampSite(createSite({ id: 'site-merge-target', canonical_name: 'Target Camp' }));
  backend.sites[0].status = 'hidden_pending_review';
  const merged = await service.resolveFlaggedCampsiteReview({
    campSiteId: 'site-1',
    action: 'merge',
    mergeTargetCampSiteId: target.data.id,
  });
  assert.strictEqual(merged.ok, true);
  assert.strictEqual(merged.data.status, 'hidden', 'merged source site should be hidden');

  backend.sites.push(createSite({ id: 'site-threshold', canonical_name: 'Threshold Camp' }));
  for (const userId of ['user-8', 'user-9', 'user-10']) {
    backend.currentUser = { id: userId };
    const flag = await service.flagCampsite({
      camp_site_id: 'site-threshold',
      reason: 'trash_or_damage',
      details: 'Repeated unresolved field concern.',
    });
    assert.strictEqual(flag.ok, true);
  }
  const thresholdSite = backend.sites.find((site) => site.id === 'site-threshold');
  assert.strictEqual(
    thresholdSite.status,
    'hidden_pending_review',
    'flag threshold should move a published campsite back into review',
  );
  assert.strictEqual(
    backend.events.some((event) => event.event_type === 'flag_threshold_review_started'),
    true,
    'flag threshold should create a lifecycle event',
  );

  console.log('Campsite published lifecycle checks passed.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
