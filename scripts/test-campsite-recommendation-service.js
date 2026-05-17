const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const servicePath = path.join(root, 'lib', 'campsites', 'campsiteRecommendationService.ts');

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

const { CampsiteRecommendationService } = require(servicePath);

class MemoryCampsiteBackend {
  constructor() {
    this.currentUser = null;
    this.available = true;
    this.reportSeq = 0;
    this.siteSeq = 0;
    this.flagSeq = 0;
    this.photoSeq = 0;
    this.reports = [];
    this.sites = [];
    this.flags = [];
    this.photos = [];
    this.reviewEvents = [];
    this.lifecycleEvents = [];
  }

  isAvailable() {
    return this.available;
  }

  async getCurrentUser() {
    return this.currentUser;
  }

  async insertReport(row) {
    const now = new Date().toISOString();
    const report = {
      id: `report-${++this.reportSeq}`,
      created_at: now,
      updated_at: now,
      ...row,
    };
    this.reports.push(report);
    return { ok: true, data: report };
  }

  async updateReport(reportId, changes) {
    const report = this.reports.find((item) => item.id === reportId);
    if (!report) return { ok: false, code: 'not_found', error: 'Report not found' };
    Object.assign(report, changes, { updated_at: new Date().toISOString() });
    return { ok: true, data: report };
  }

  async getReportById(reportId) {
    const report = this.reports.find((item) => item.id === reportId);
    if (!report) return { ok: false, code: 'not_found', error: 'Report not found' };
    return { ok: true, data: report };
  }

  async getReportByClientSubmissionId(clientSubmissionId, userId) {
    const report = this.reports.find(
      (item) =>
        item.client_submission_id === clientSubmissionId &&
        item.submitted_by_user_id === userId,
    );
    return { ok: true, data: report ?? null };
  }

  async listReportsByUser(userId, options) {
    return {
      ok: true,
      data: this.reports.filter(
        (report) =>
          report.submitted_by_user_id === userId &&
          (!options?.privateOnly || report.visibility_requested === 'private'),
      ),
    };
  }

  async listApprovedCommunityCampSitesByBounds(params) {
    return {
      ok: true,
      data: this.sites
        .filter(
          (site) =>
            site.status === 'approved' &&
            site.visibility === 'community' &&
            site.latitude >= params.minLat &&
            site.latitude <= params.maxLat &&
            site.longitude >= params.minLng &&
            site.longitude <= params.maxLng,
        )
        .filter((site) => !params.site_type || site.site_type === params.site_type)
        .filter(
          (site) =>
            !params.access_difficulty || site.access_difficulty === params.access_difficulty,
        )
        .filter(
          (site) =>
            typeof params.trailer_friendly !== 'boolean' ||
            site.trailer_friendly === params.trailer_friendly,
        )
        .sort((a, b) => b.trust_score - a.trust_score)
        .slice(params.offset, params.offset + params.limit),
    };
  }

  async getApprovedCommunityCampSiteById(campSiteId) {
    const site = this.sites.find(
      (item) =>
        item.id === campSiteId &&
        item.status === 'approved' &&
        item.visibility === 'community',
    );
    if (!site) return { ok: false, code: 'not_found', error: 'Campsite not found' };
    return { ok: true, data: site };
  }

  async getCampSiteById(campSiteId) {
    const site = this.sites.find((item) => item.id === campSiteId);
    if (!site) return { ok: false, code: 'not_found', error: 'Campsite not found' };
    return { ok: true, data: site };
  }

  async insertCampSite(row) {
    const now = new Date().toISOString();
    const site = {
      id: `site-${++this.siteSeq}`,
      created_at: now,
      updated_at: now,
      ...row,
    };
    this.sites.push(site);
    return { ok: true, data: site };
  }

  async updateCampSite(campSiteId, changes) {
    const site = this.sites.find((item) => item.id === campSiteId);
    if (!site) return { ok: false, code: 'not_found', error: 'Campsite not found' };
    Object.assign(site, changes, { updated_at: new Date().toISOString() });
    return { ok: true, data: site };
  }

  async insertFlag(row) {
    const flag = {
      id: `flag-${++this.flagSeq}`,
      created_at: new Date().toISOString(),
      ...row,
    };
    this.flags.push(flag);
    return { ok: true, data: flag };
  }

  async getFlagByUserForCampSite(campSiteId, userId) {
    return {
      ok: true,
      data:
        this.flags.find((flag) => flag.camp_site_id === campSiteId && flag.user_id === userId) ??
        null,
    };
  }

  async countFlags(campSiteId) {
    return {
      ok: true,
      data: this.flags.filter((flag) => flag.camp_site_id === campSiteId).length,
    };
  }

  async countApprovedPhotosForReport(reportId) {
    return {
      ok: true,
      data: this.photos.filter(
        (photo) =>
          photo.camp_site_report_id === reportId && photo.moderation_status === 'approved',
      ).length,
    };
  }

  async insertPhoto(row) {
    const photo = {
      id: `photo-${++this.photoSeq}`,
      created_at: new Date().toISOString(),
      ...row,
    };
    this.photos.push(photo);
    return { ok: true, data: photo };
  }

  async listPhotosForReport(reportId) {
    return {
      ok: true,
      data: this.photos.filter((photo) => photo.camp_site_report_id === reportId),
    };
  }

  async listApprovedPhotosForCampSite(campSiteId) {
    return {
      ok: true,
      data: this.photos.filter(
        (photo) =>
          photo.camp_site_id === campSiteId &&
          photo.moderation_status === 'approved' &&
          photo.exif_stripped === true,
      ),
    };
  }

  async getPhotoById(photoId) {
    const photo = this.photos.find((item) => item.id === photoId);
    if (!photo) return { ok: false, code: 'not_found', error: 'Photo not found' };
    return { ok: true, data: photo };
  }

  async updatePhoto(photoId, changes) {
    const photo = this.photos.find((item) => item.id === photoId);
    if (!photo) return { ok: false, code: 'not_found', error: 'Photo not found' };
    Object.assign(photo, changes);
    return { ok: true, data: photo };
  }

  async updatePhotosForReport(reportId, changes) {
    const updated = [];
    for (const photo of this.photos) {
      if (photo.camp_site_report_id === reportId) {
        Object.assign(photo, changes);
        updated.push(photo);
      }
    }
    return { ok: true, data: updated };
  }

  async insertReviewEvent(row) {
    const event = {
      id: `review-event-${this.reviewEvents.length + 1}`,
      created_at: new Date().toISOString(),
      ...row,
    };
    this.reviewEvents.push(event);
    return { ok: true, data: event };
  }

  async insertCampSiteLifecycleEvent(row) {
    const event = {
      id: `lifecycle-event-${this.lifecycleEvents.length + 1}`,
      created_at: new Date().toISOString(),
      ...row,
    };
    this.lifecycleEvents.push(event);
    return { ok: true, data: event };
  }

  async listPendingReports(limit) {
    return {
      ok: true,
      data: this.reports
        .filter((report) => report.moderation_status === 'pending')
        .slice(0, limit),
    };
  }
}

function createReportInput(overrides = {}) {
  return {
    latitude: 38.78,
    longitude: -121.2,
    source_type: 'pin_drop',
    location_accuracy_m: 12,
    user_stayed_here: false,
    verified_in_person: false,
    visited_at: null,
    site_type: 'established_dispersed',
    access_difficulty: 'high_clearance',
    vehicle_fit: ['truck', 'suv'],
    amenities: { fire_ring: false },
    conditions: { cell_signal: 'weak' },
    notes: '  Good pullout.\u0000 Pack out trash.  ',
    visibility_requested: 'private',
    stewardship_acknowledged: false,
    sensitive_area_acknowledged: false,
    ...overrides,
  };
}

async function main() {
  const backend = new MemoryCampsiteBackend();
  const service = new CampsiteRecommendationService(backend);

  backend.currentUser = { id: 'user-1' };
  const privateSave = await service.createCampsiteReport(createReportInput());
  assert.strictEqual(privateSave.ok, true, 'Private save should succeed for authenticated users.');
  assert.strictEqual(privateSave.data.moderation_status, 'private_saved');
  assert.strictEqual(privateSave.data.notes, 'Good pullout. Pack out trash.');
  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(privateSave.data, 'submitted_by_user_id'),
    false,
    'Report API responses must not expose submitting user IDs.',
  );

  const currentUserPrivate = await service.listCurrentUserPrivateReports();
  assert.strictEqual(currentUserPrivate.ok, true);
  assert.strictEqual(currentUserPrivate.data.length, 1, 'Current user private saves should be listed.');

  const idempotentFirst = await service.createCampsiteReport(
    createReportInput({ client_submission_id: 'client-submit-1' }),
  );
  const idempotentSecond = await service.createCampsiteReport(
    createReportInput({ client_submission_id: 'client-submit-1' }),
  );
  assert.strictEqual(idempotentFirst.ok, true);
  assert.strictEqual(idempotentSecond.ok, true);
  assert.strictEqual(
    idempotentSecond.data.id,
    idempotentFirst.data.id,
    'Matching client_submission_id retries should return the existing report.',
  );
  assert.strictEqual(
    backend.reports.filter((report) => report.client_submission_id === 'client-submit-1').length,
    1,
    'Idempotent retries must not create duplicate campsite reports.',
  );

  const missingAcknowledgements = await service.createCampsiteReport(
    createReportInput({ visibility_requested: 'community' }),
  );
  assert.strictEqual(missingAcknowledgements.ok, false);
  assert.strictEqual(missingAcknowledgements.code, 'validation_error');
  assert.ok(
    missingAcknowledgements.details.some((detail) => detail.includes('stewardship')) &&
      missingAcknowledgements.details.some((detail) => detail.includes('sensitive area')),
    'Community submissions must require stewardship and sensitive-area acknowledgements.',
  );

  const pendingSubmission = await service.createCampsiteReport(
    createReportInput({
      visibility_requested: 'community',
      stewardship_acknowledged: true,
      sensitive_area_acknowledged: true,
      verified_in_person: true,
      user_stayed_here: true,
    }),
  );
  assert.strictEqual(pendingSubmission.ok, true);
  assert.strictEqual(pendingSubmission.data.moderation_status, 'pending');
  assert.strictEqual(
    backend.sites.length,
    0,
    'Community submissions must not create public canonical camp_sites automatically.',
  );

  const attachedPhoto = await service.attachPhotoToReport({
    camp_site_report_id: pendingSubmission.data.id,
    storage_url: 'campsite-reports/user-1/report-2/photo.jpg',
    thumbnail_url: 'https://example.test/thumb.jpg',
    exif_stripped: true,
  });
  assert.strictEqual(attachedPhoto.ok, true, 'Photo upload should attach to the campsite report.');
  assert.strictEqual(attachedPhoto.data.moderation_status, 'pending');
  assert.strictEqual(attachedPhoto.data.exif_stripped, true);
  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(attachedPhoto.data, 'user_id'),
    false,
    'Photo API responses must not expose user IDs.',
  );
  backend.currentUser = { id: 'user-2' };
  const otherUserPhoto = await service.attachPhotoToReport({
    camp_site_report_id: pendingSubmission.data.id,
    storage_url: 'campsite-reports/user-2/report-2/photo.jpg',
    thumbnail_url: null,
    exif_stripped: true,
  });
  assert.strictEqual(otherUserPhoto.ok, false, 'Users cannot attach photos to another user private/pending report.');
  backend.currentUser = { id: 'user-1' };
  const unstrippedPhoto = await service.attachPhotoToReport({
    camp_site_report_id: pendingSubmission.data.id,
    storage_url: 'campsite-reports/user-1/report-2/raw-photo.jpg',
    thumbnail_url: null,
    exif_stripped: false,
  });
  assert.strictEqual(unstrippedPhoto.ok, false, 'Unstripped EXIF photos must be rejected.');

  const publicPhotosBeforeApproval = await service.listApprovedPhotosForCampSite('site-not-created');
  assert.strictEqual(publicPhotosBeforeApproval.ok, false);
  assert.strictEqual(
    publicPhotosBeforeApproval.code,
    'not_found',
    'Public photo listing must first prove the campsite is approved and public.',
  );

  const publicBeforeApproval = await service.listApprovedCommunityCampsitesByBounds({
    minLat: 38,
    minLng: -122,
    maxLat: 39,
    maxLng: -120,
  });
  assert.strictEqual(publicBeforeApproval.ok, true);
  assert.strictEqual(
    publicBeforeApproval.data.length,
    0,
    'Pending submissions must not appear on the public map.',
  );

  backend.currentUser = null;
  const unauthCreate = await service.createCampsiteReport(createReportInput());
  assert.strictEqual(unauthCreate.ok, false, 'Unauthenticated users cannot create reports.');
  assert.strictEqual(unauthCreate.code, 'auth_required');
  const unauthFlag = await service.flagCampsite({ camp_site_id: 'site-1', reason: 'unsafe' });
  assert.strictEqual(unauthFlag.ok, false, 'Unauthenticated users cannot flag campsites.');
  assert.strictEqual(unauthFlag.code, 'auth_required');
  const unauthConfirm = await service.confirmCampsite({ camp_site_id: 'site-1' });
  assert.strictEqual(unauthConfirm.ok, false, 'Unauthenticated users cannot confirm campsites.');
  assert.strictEqual(unauthConfirm.code, 'auth_required');

  backend.currentUser = { id: 'user-2' };
  const nonAdminPending = await service.listPendingReports();
  assert.strictEqual(nonAdminPending.ok, false, 'Normal users cannot access the review queue.');
  assert.strictEqual(nonAdminPending.code, 'admin_required');

  backend.currentUser = { id: 'admin-1', isAdmin: true };
  const pendingReports = await service.listPendingReports();
  assert.strictEqual(pendingReports.ok, true);
  assert.strictEqual(pendingReports.data.length, 1, 'Admin should list pending reports.');

  const approval = await service.approveReport({ reportId: pendingSubmission.data.id });
  assert.strictEqual(approval.ok, true, 'Admin approval should succeed.');
  assert.strictEqual(approval.data.report.moderation_status, 'approved');
  assert.strictEqual(approval.data.camp_site.status, 'approved');
  assert.strictEqual(approval.data.camp_site.visibility, 'community');
  assert.strictEqual(
    approval.data.camp_site.trust_score,
    55,
    'Approval should initialize trust score without counting pending community photos.',
  );
  assert.strictEqual(backend.sites.length, 1, 'Approval should create one canonical camp_site.');

  const publicPhotosAfterApproval = await service.listApprovedPhotosForCampSite(
    approval.data.camp_site.id,
  );
  assert.strictEqual(publicPhotosAfterApproval.ok, true);
  assert.strictEqual(
    publicPhotosAfterApproval.data.length,
    0,
    'Pending campsite photos should not become public merely because the report is approved.',
  );
  const approvedPhoto = await service.moderatePhoto({
    photoId: attachedPhoto.data.id,
    moderation_status: 'approved',
  });
  assert.strictEqual(approvedPhoto.ok, true, 'Admin should be able to approve a stripped campsite photo.');
  assert.strictEqual(approvedPhoto.data.moderation_status, 'approved');
  const publicPhotosAfterPhotoApproval = await service.listApprovedPhotosForCampSite(
    approval.data.camp_site.id,
  );
  assert.strictEqual(
    publicPhotosAfterPhotoApproval.data.length,
    1,
    'Approved photos should be public only after explicit photo approval.',
  );

  const publicAfterApproval = await service.listApprovedCommunityCampsitesByBounds({
    minLat: 38,
    minLng: -122,
    maxLat: 39,
    maxLng: -120,
  });
  assert.strictEqual(publicAfterApproval.ok, true);
  assert.strictEqual(
    publicAfterApproval.data.length,
    1,
    'Approved community camp_sites should appear in bbox queries.',
  );
  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(publicAfterApproval.data[0], 'owner_user_id'),
    false,
    'Public campsite responses must not expose owner user IDs.',
  );

  const details = await service.getCampsiteDetails(approval.data.camp_site.id);
  assert.strictEqual(details.ok, true);
  assert.strictEqual(details.data.confirmation_count, 1);
  assert.strictEqual(details.data.flag_count, 0);

  backend.currentUser = { id: 'user-2' };
  const flag = await service.flagCampsite({
    camp_site_id: approval.data.camp_site.id,
    reason: 'bad_coordinates',
    details: 'Marker appears one switchback off.',
  });
  assert.strictEqual(flag.ok, true);
  assert.strictEqual(flag.data.flag_count, 1, 'Flagging should update flag_count.');
  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(flag.data.flag, 'user_id'),
    false,
    'Flag responses must not expose user IDs.',
  );
  const detailsAfterFlag = await service.getCampsiteDetails(approval.data.camp_site.id);
  assert.strictEqual(detailsAfterFlag.ok, true);
  assert.strictEqual(detailsAfterFlag.data.trust_score, 45, 'Flags should reduce trust score.');

  const duplicateFlag = await service.flagCampsite({
    camp_site_id: approval.data.camp_site.id,
    reason: 'bad_coordinates',
    details: 'Repeat flag should not create a second record.',
  });
  assert.strictEqual(duplicateFlag.ok, true);
  assert.strictEqual(duplicateFlag.data.flag_count, 1, 'Duplicate flags from the same user should be ignored.');
  assert.strictEqual(
    backend.flags.filter((item) => item.camp_site_id === approval.data.camp_site.id && item.user_id === 'user-2').length,
    1,
    'Duplicate campsite flag attempts should not duplicate flag records.',
  );

  const confirm = await service.confirmCampsite({
    camp_site_id: approval.data.camp_site.id,
    source_type: 'current_location',
    notes: 'Stayed here last night.',
  });
  assert.strictEqual(confirm.ok, true);
  assert.strictEqual(confirm.data.report.camp_site_id, approval.data.camp_site.id);
  assert.strictEqual(
    confirm.data.camp_site.confirmation_count,
    2,
    'Confirming a campsite should increment confirmation_count.',
  );
  assert.strictEqual(confirm.data.camp_site.trust_score, 50, 'Confirmation should recalculate trust score.');

  const duplicateConfirm = await service.confirmCampsite({
    camp_site_id: approval.data.camp_site.id,
    source_type: 'current_location',
    notes: 'Second confirmation in the same short window.',
  });
  assert.strictEqual(duplicateConfirm.ok, true);
  assert.strictEqual(
    duplicateConfirm.data.camp_site.confirmation_count,
    2,
    'Duplicate rapid confirmations from the same user should be ignored.',
  );

  backend.currentUser = { id: 'user-3' };
  const pendingForReject = await service.createCampsiteReport(
    createReportInput({
      latitude: 38.81,
      longitude: -121.23,
      visibility_requested: 'community',
      stewardship_acknowledged: true,
      sensitive_area_acknowledged: true,
    }),
  );
  assert.strictEqual(pendingForReject.ok, true);

  backend.currentUser = { id: 'admin-1', isAdmin: true };
  const rejected = await service.rejectReport(pendingForReject.data.id, 'duplicate or unsuitable');
  assert.strictEqual(rejected.ok, true);
  assert.strictEqual(rejected.data.moderation_status, 'rejected');
  assert.strictEqual(
    backend.sites.length,
    1,
    'Rejecting a pending report must not publish a canonical campsite.',
  );

  backend.currentUser = { id: 'user-needs-info' };
  const pendingForNeedsInfo = await service.createCampsiteReport(
    createReportInput({
      latitude: 38.82,
      longitude: -121.24,
      visibility_requested: 'community',
      stewardship_acknowledged: true,
      sensitive_area_acknowledged: true,
    }),
  );
  assert.strictEqual(pendingForNeedsInfo.ok, true);
  backend.currentUser = { id: 'admin-1', isAdmin: true };
  const needsInfo = await service.markReportNeedsInfo(pendingForNeedsInfo.data.id);
  assert.strictEqual(needsInfo.ok, true);
  assert.strictEqual(needsInfo.data.moderation_status, 'needs_info');

  backend.currentUser = { id: 'user-5' };
  const privateForPhoto = await service.createCampsiteReport(createReportInput());
  assert.strictEqual(privateForPhoto.ok, true);
  const privatePhoto = await service.attachPhotoToReport({
    camp_site_report_id: privateForPhoto.data.id,
    storage_url: 'campsite-reports/user-5/report-private/photo.jpg',
    thumbnail_url: null,
    exif_stripped: true,
  });
  assert.strictEqual(privatePhoto.ok, true, 'Private report photos should attach.');
  assert.strictEqual(privatePhoto.data.moderation_status, 'private');
  backend.currentUser = { id: 'admin-1', isAdmin: true };
  const rejectedPhoto = await service.moderatePhoto({
    photoId: privatePhoto.data.id,
    moderation_status: 'rejected',
  });
  assert.strictEqual(rejectedPhoto.ok, true);
  assert.strictEqual(rejectedPhoto.data.moderation_status, 'rejected');

  backend.currentUser = { id: 'user-4' };
  const pendingForMerge = await service.createCampsiteReport(
    createReportInput({
      latitude: 38.7804,
      longitude: -121.2005,
      visibility_requested: 'community',
      stewardship_acknowledged: true,
      sensitive_area_acknowledged: true,
      verified_in_person: true,
      user_stayed_here: true,
      vehicle_fit: ['van', 'trailer'],
    }),
  );
  assert.strictEqual(pendingForMerge.ok, true);

  backend.currentUser = { id: 'admin-1', isAdmin: true };
  const merged = await service.mergeReportIntoCampSite(
    pendingForMerge.data.id,
    approval.data.camp_site.id,
  );
  assert.strictEqual(merged.ok, true);
  assert.strictEqual(merged.data.report.moderation_status, 'merged');
  assert.ok(
    merged.data.camp_site.vehicle_fit.includes('trailer'),
    'Merging should update aggregate vehicle fit fields.',
  );

  backend.currentUser = { id: 'admin-1', isAdmin: true };
  const hidden = await service.hideCampSite(approval.data.camp_site.id);
  assert.strictEqual(hidden.ok, true);
  assert.strictEqual(hidden.data.status, 'hidden', 'Admin should be able to hide a campsite.');

  const photosAfterHide = await service.listApprovedPhotosForCampSite(approval.data.camp_site.id);
  assert.strictEqual(photosAfterHide.ok, false, 'Hidden campsites should not expose approved photos publicly.');
  assert.strictEqual(
    backend.reviewEvents.some((event) => event.event_type === 'moderator_approved'),
    true,
    'Approving a report should write a moderation audit event.',
  );
  assert.strictEqual(
    backend.reviewEvents.some((event) => event.event_type === 'moderator_rejected'),
    true,
    'Rejecting a report should write a moderation audit event.',
  );
  assert.strictEqual(
    backend.reviewEvents.some((event) => event.event_type === 'needs_info_requested'),
    true,
    'Needs-info moderation should write an audit event.',
  );
  assert.strictEqual(
    backend.reviewEvents.some((event) => event.event_type === 'merged'),
    true,
    'Merging a report should write a moderation audit event.',
  );
  assert.strictEqual(
    backend.lifecycleEvents.some(
      (event) =>
        event.event_type === 'published_review_resolved' &&
        event.metadata?.action === 'hide',
    ),
    true,
    'Hiding a published campsite should write a lifecycle audit event.',
  );

  console.log('Campsite recommendation service checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
