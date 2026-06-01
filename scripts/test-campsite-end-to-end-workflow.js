const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

process.env.EXPO_PUBLIC_SUPABASE_URL ||= 'https://example.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||= 'test-anon-key';

const storage = new Map();
global.localStorage = {
  getItem(key) {
    return storage.has(key) ? storage.get(key) : null;
  },
  setItem(key, value) {
    storage.set(key, String(value));
  },
  removeItem(key) {
    storage.delete(key);
  },
};

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
  CampsiteTriageService,
} = require(path.join(root, 'lib', 'campsites', 'campsiteTriageService.ts'));
const {
  CampsiteReviewService,
} = require(path.join(root, 'lib', 'campsites', 'campsiteReviewService.ts'));
const {
  CampSiteGroupSharingService,
} = require(path.join(root, 'lib', 'campsites', 'campsiteGroupSharingService.ts'));
const {
  GpxCampsiteImportService,
  buildCampsiteReportInputFromGpxCandidate,
  gpxUploadResultToCampsiteImportResult,
} = require(path.join(root, 'lib', 'campsites', 'gpxCampsiteImport.ts'));
const {
  buildCampsiteReportInputFromForm,
  createDefaultCampsiteRecommendationFormState,
} = require(path.join(root, 'lib', 'campsites', 'campsiteRecommendationForm.ts'));
const {
  clearOfflineCampsiteSubmissionsForTest,
  getCampsiteOfflineStatusLabel,
  getOfflineCampsiteSubmissions,
  markOfflineCampsiteSubmissionForRetry,
  submitCampsiteReportOfflineSafe,
  syncOfflineCampsiteSubmissions,
} = require(path.join(root, 'lib', 'campsites', 'campsiteOfflineQueue.ts'));

function nowIso() {
  return new Date().toISOString();
}

function ok(data) {
  return { ok: true, data };
}

function notFound(message = 'Not found.') {
  return { ok: false, code: 'not_found', error: message };
}

function deny(message = 'Permission denied.') {
  return { ok: false, code: 'permission_denied', error: message };
}

function activeMembership(membership) {
  return membership && membership.status === 'active';
}

class CampsiteWorkflowBackend {
  constructor() {
    this.currentUser = null;
    this.seq = {
      report: 0,
      site: 0,
      photo: 0,
      flag: 0,
      event: 0,
      lifecycle: 0,
      vote: 0,
      group: 0,
      membership: 0,
      share: 0,
      audit: 0,
      gpxImport: 0,
      gpxCandidate: 0,
      reviewerAudit: 0,
    };
    this.reports = [];
    this.sites = [];
    this.photos = [];
    this.flags = [];
    this.reviewEvents = [];
    this.lifecycleEvents = [];
    this.votes = [];
    this.reviewerProfiles = new Map();
    this.groups = [];
    this.memberships = [];
    this.shares = [];
    this.groupAuditEvents = [];
    this.gpxImports = [];
    this.gpxCandidates = [];
    this.reviewerAuditEvents = [];
  }

  isAvailable() {
    return true;
  }

  async getCurrentUser() {
    return this.currentUser;
  }

  setUser(user) {
    this.currentUser = user;
  }

  async insertReport(row) {
    const time = nowIso();
    const report = {
      id: `report-${++this.seq.report}`,
      created_at: time,
      updated_at: time,
      ...row,
    };
    this.reports.push(report);
    return ok(report);
  }

  async updateReport(reportId, changes) {
    const report = this.reports.find((item) => item.id === reportId);
    if (!report) return notFound('Report not found.');
    Object.assign(report, changes, { updated_at: nowIso() });
    return ok(report);
  }

  async getReportById(reportId) {
    const report = this.reports.find((item) => item.id === reportId);
    return report ? ok(report) : notFound('Report not found.');
  }

  async getReportByClientSubmissionId(clientSubmissionId, userId) {
    return ok(
      this.reports.find(
        (report) =>
          report.client_submission_id === clientSubmissionId &&
          report.submitted_by_user_id === userId,
      ) ?? null,
    );
  }

  async listReportsByUser(userId, options = {}) {
    let reports = this.reports.filter((report) => report.submitted_by_user_id === userId);
    if (options.privateOnly) {
      reports = reports.filter((report) => report.visibility_requested === 'private');
    }
    if (options.visibilityRequested) {
      reports = reports.filter((report) => report.visibility_requested === options.visibilityRequested);
    }
    if (options.moderationStatuses?.length) {
      reports = reports.filter((report) => options.moderationStatuses.includes(report.moderation_status));
    }
    if (options.reviewStates?.length) {
      reports = reports.filter((report) => options.reviewStates.includes(report.review_state));
    }
    if (options.bounds) {
      reports = reports.filter((report) => withinBounds(report, options.bounds));
    }
    return ok(reports.slice(0, options.limit ?? reports.length));
  }

  async listApprovedCommunityCampSitesByBounds(params) {
    return ok(
      this.sites
        .filter((site) => site.status === 'approved' && site.visibility === 'community')
        .filter((site) => withinBounds(site, params))
        .slice(params.offset ?? 0, (params.offset ?? 0) + (params.limit ?? 50)),
    );
  }

  async getApprovedCommunityCampSiteById(campSiteId) {
    const site = this.sites.find(
      (item) =>
        item.id === campSiteId &&
        item.status === 'approved' &&
        item.visibility === 'community',
    );
    return site ? ok(site) : notFound('Public campsite not found.');
  }

  async getCampSiteById(campSiteId) {
    const site = this.sites.find((item) => item.id === campSiteId);
    return site ? ok(site) : notFound('Campsite not found.');
  }

  async insertCampSite(row) {
    const time = nowIso();
    const site = {
      id: `site-${++this.seq.site}`,
      created_at: time,
      updated_at: time,
      ...row,
    };
    this.sites.push(site);
    return ok(site);
  }

  async updateCampSite(campSiteId, changes) {
    const site = this.sites.find((item) => item.id === campSiteId);
    if (!site) return notFound('Campsite not found.');
    Object.assign(site, changes, { updated_at: nowIso() });
    return ok(site);
  }

  async insertPhoto(row) {
    const photo = {
      id: `photo-${++this.seq.photo}`,
      created_at: nowIso(),
      ...row,
    };
    this.photos.push(photo);
    return ok(photo);
  }

  async listPhotosForReport(reportId) {
    return ok(this.photos.filter((photo) => photo.camp_site_report_id === reportId));
  }

  async listApprovedPhotosForCampSite(campSiteId) {
    return ok(
      this.photos.filter(
        (photo) =>
          photo.camp_site_id === campSiteId &&
          photo.moderation_status === 'approved' &&
          photo.exif_stripped === true,
      ),
    );
  }

  async getPhotoById(photoId) {
    const photo = this.photos.find((item) => item.id === photoId);
    return photo ? ok(photo) : notFound('Photo not found.');
  }

  async updatePhoto(photoId, changes) {
    const photo = this.photos.find((item) => item.id === photoId);
    if (!photo) return notFound('Photo not found.');
    Object.assign(photo, changes);
    return ok(photo);
  }

  async updatePhotosForReport(reportId, changes) {
    const updated = [];
    for (const photo of this.photos) {
      if (photo.camp_site_report_id === reportId) {
        Object.assign(photo, changes);
        updated.push(photo);
      }
    }
    return ok(updated);
  }

  async countApprovedPhotosForReport(reportId) {
    return ok(
      this.photos.filter(
        (photo) =>
          photo.camp_site_report_id === reportId &&
          photo.moderation_status === 'approved',
      ).length,
    );
  }

  async insertFlag(row) {
    const flag = {
      id: `flag-${++this.seq.flag}`,
      created_at: nowIso(),
      ...row,
    };
    this.flags.push(flag);
    return ok(flag);
  }

  async getFlagByUserForCampSite(campSiteId, userId) {
    return ok(
      this.flags.find((flag) => flag.camp_site_id === campSiteId && flag.user_id === userId) ?? null,
    );
  }

  async countFlags(campSiteId) {
    return ok(this.flags.filter((flag) => flag.camp_site_id === campSiteId).length);
  }

  async listFlagsForCampSite(campSiteId) {
    return ok(this.flags.filter((flag) => flag.camp_site_id === campSiteId));
  }

  async listFlaggedCampSites(limit) {
    return ok(
      this.sites
        .filter((site) => site.flag_count > 0 || site.status === 'hidden_pending_review')
        .slice(0, limit),
    );
  }

  async insertReviewEvent(row) {
    const event = {
      id: `event-${++this.seq.event}`,
      created_at: nowIso(),
      ...row,
    };
    this.reviewEvents.push(event);
    return ok(event);
  }

  async listReviewEvents(reportId) {
    return ok(this.reviewEvents.filter((event) => event.camp_site_report_id === reportId));
  }

  async insertCampSiteLifecycleEvent(row) {
    const event = {
      id: `lifecycle-${++this.seq.lifecycle}`,
      created_at: nowIso(),
      ...row,
    };
    this.lifecycleEvents.push(event);
    return ok(event);
  }

  async listPendingReports(limit) {
    return ok(this.reports.filter((report) => report.moderation_status === 'pending').slice(0, limit));
  }

  async getReviewerProfile(userId) {
    if (!this.reviewerProfiles.has(userId)) {
      this.reviewerProfiles.set(userId, reviewerProfile(userId, this.currentUser?.isTrustedReviewer ? 'trusted' : 'none'));
    }
    return ok(this.reviewerProfiles.get(userId));
  }

  async upsertReviewerProfile(userId, changes) {
    const current = this.reviewerProfiles.get(userId) ?? reviewerProfile(userId, 'none');
    const updated = { ...current, ...changes, updated_at: nowIso() };
    this.reviewerProfiles.set(userId, updated);
    return ok(updated);
  }

  async updateReviewerProfile(userId, changes) {
    return this.upsertReviewerProfile(userId, changes);
  }

  async listReviewerProfiles(limit) {
    return ok(Array.from(this.reviewerProfiles.values()).slice(0, limit));
  }

  async getVoteForReviewer(reportId, reviewerUserId) {
    return ok(
      this.votes.find(
        (vote) =>
          vote.camp_site_report_id === reportId &&
          vote.reviewer_user_id === reviewerUserId,
      ) ?? null,
    );
  }

  async insertReviewVote(row) {
    const vote = {
      id: `vote-${++this.seq.vote}`,
      created_at: nowIso(),
      updated_at: nowIso(),
      ...row,
    };
    this.votes.push(vote);
    return ok(vote);
  }

  async updateReviewVote(voteId, changes) {
    const vote = this.votes.find((item) => item.id === voteId);
    if (!vote) return notFound('Vote not found.');
    Object.assign(vote, changes, { updated_at: nowIso() });
    return ok(vote);
  }

  async listReviewVotes(reportId) {
    return ok(this.votes.filter((vote) => vote.camp_site_report_id === reportId));
  }

  async listReviewerVotes(reviewerUserId, limit) {
    return ok(this.votes.filter((vote) => vote.reviewer_user_id === reviewerUserId).slice(0, limit));
  }

  async listReviewerVotesSince(reviewerUserId, sinceIso) {
    return ok(
      this.votes.filter(
        (vote) => vote.reviewer_user_id === reviewerUserId && vote.created_at >= sinceIso,
      ),
    );
  }

  async insertReviewerAuditEvent(row) {
    const event = {
      id: `reviewer-audit-${++this.seq.reviewerAudit}`,
      created_at: nowIso(),
      ...row,
    };
    this.reviewerAuditEvents.push(event);
    return ok(event);
  }

  async listCommunityReviewReports(limit) {
    return ok(
      this.reports
        .filter((report) => ['community_review', 'moderator_review'].includes(report.review_state))
        .slice(0, limit),
    );
  }

  async listNearbyApprovedCampSites() {
    return ok(this.sites.filter((site) => site.status === 'approved'));
  }

  async listDuplicateCandidates(report, radiusMeters) {
    const duplicates = [];
    for (const site of this.sites) {
      if (site.status === 'approved' && distanceMeters(report, site) <= radiusMeters) {
        duplicates.push({ id: site.id, source: 'camp_site', distance_meters: Math.round(distanceMeters(report, site)), status: site.status });
      }
    }
    return ok(duplicates);
  }

  async countRecentCommunityReportsByUser(userId, sinceIso) {
    return ok(
      this.reports.filter(
        (report) =>
          report.submitted_by_user_id === userId &&
          report.visibility_requested === 'community' &&
          report.created_at >= sinceIso,
      ).length,
    );
  }

  async countRejectedReportsByUser(userId) {
    return ok(
      this.reports.filter(
        (report) =>
          report.submitted_by_user_id === userId &&
          ['rejected', 'community_rejected'].includes(report.moderation_status),
      ).length,
    );
  }

  async insertGroup(row) {
    const time = nowIso();
    const group = { id: `group-${++this.seq.group}`, created_at: time, updated_at: time, ...row };
    this.groups.push(group);
    return ok(group);
  }

  async getGroupById(groupId) {
    const group = this.groups.find((item) => item.id === groupId);
    return group ? ok(group) : notFound('Group not found.');
  }

  async insertMembership(row) {
    const time = nowIso();
    const membership = {
      id: `membership-${++this.seq.membership}`,
      created_at: time,
      updated_at: time,
      ...row,
    };
    this.memberships.push(membership);
    return ok(membership);
  }

  async upsertMembership(row) {
    const existing = this.memberships.find(
      (item) => item.group_id === row.group_id && item.user_id === row.user_id,
    );
    if (existing) {
      Object.assign(existing, row, { updated_at: nowIso() });
      return ok(existing);
    }
    return this.insertMembership(row);
  }

  async updateMembership(membershipId, changes) {
    const membership = this.memberships.find((item) => item.id === membershipId);
    if (!membership) return notFound('Membership not found.');
    Object.assign(membership, changes, { updated_at: nowIso() });
    return ok(membership);
  }

  async getMembership(groupId, userId) {
    return ok(this.memberships.find((item) => item.group_id === groupId && item.user_id === userId) ?? null);
  }

  async listMembershipsByUser(userId) {
    return ok(this.memberships.filter((item) => item.user_id === userId && item.status !== 'removed'));
  }

  async listMembershipsByGroup(groupId) {
    return ok(this.memberships.filter((item) => item.group_id === groupId));
  }

  async insertShare(row) {
    const share = {
      id: `share-${++this.seq.share}`,
      created_at: nowIso(),
      ...row,
    };
    this.shares.push(share);
    return ok(share);
  }

  async getShareById(shareId) {
    const share = this.shares.find((item) => item.id === shareId);
    return share ? ok(share) : notFound('Share not found.');
  }

  async deleteShare(shareId) {
    this.shares = this.shares.filter((item) => item.id !== shareId);
    return ok(undefined);
  }

  async insertGroupAuditEvent(row) {
    const event = { id: `group-audit-${++this.seq.audit}`, created_at: nowIso(), ...row };
    this.groupAuditEvents.push(event);
    return ok(event);
  }

  async listSharesByGroup(groupId) {
    return ok(this.shares.filter((item) => item.group_id === groupId));
  }

  async insertImport(row) {
    const time = nowIso();
    const importRecord = {
      id: `gpx-${++this.seq.gpxImport}`,
      created_at: time,
      updated_at: time,
      ...row,
    };
    this.gpxImports.push(importRecord);
    return ok(importRecord);
  }

  async getImportByClientImportId(clientImportId, userId) {
    return ok(
      this.gpxImports.find(
        (item) =>
          item.client_import_id === clientImportId &&
          item.user_id === userId &&
          item.status !== 'deleted',
      ) ?? null,
    );
  }

  async insertCandidates(rows) {
    const inserted = rows.map((row) => ({
      id: `gpx-candidate-${++this.seq.gpxCandidate}`,
      created_at: nowIso(),
      updated_at: nowIso(),
      ...row,
    }));
    this.gpxCandidates.push(...inserted);
    return ok(inserted);
  }

  async listImportsByUser(userId) {
    return ok(this.gpxImports.filter((item) => item.user_id === userId && item.status !== 'deleted'));
  }

  async getImportById(importId, userId) {
    const importRecord = this.gpxImports.find(
      (item) => item.id === importId && item.user_id === userId && item.status !== 'deleted',
    );
    return importRecord ? ok(importRecord) : notFound('GPX import not found.');
  }

  async listCandidatesByImport(importId, userId) {
    const importRecord = this.gpxImports.find((item) => item.id === importId && item.user_id === userId);
    if (!importRecord) return notFound('GPX import not found.');
    return ok(this.gpxCandidates.filter((item) => item.gpx_import_id === importId && item.user_id === userId));
  }

  async markImportDeleted(importId, userId) {
    const importRecord = this.gpxImports.find((item) => item.id === importId && item.user_id === userId);
    if (!importRecord) return notFound('GPX import not found.');
    importRecord.status = 'deleted';
    importRecord.updated_at = nowIso();
    return ok(importRecord);
  }
}

function reviewerProfile(userId, status) {
  const time = nowIso();
  return {
    id: `profile-${userId}`,
    user_id: userId,
    reviewer_status: status,
    review_region: null,
    review_count: 0,
    helpful_review_count: 0,
    rejected_review_count: 0,
    reputation_score: 0,
    created_at: time,
    updated_at: time,
  };
}

function withinBounds(item, bounds) {
  return (
    item.latitude >= bounds.minLat &&
    item.latitude <= bounds.maxLat &&
    item.longitude >= bounds.minLng &&
    item.longitude <= bounds.maxLng
  );
}

function distanceMeters(a, b) {
  const earthRadiusMeters = 6371000;
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function campsiteFormInput(location, overrides = {}) {
  const form = {
    ...createDefaultCampsiteRecommendationFormState(),
    verification: 'stayed',
    visited_at: '2026-04-01',
    site_type: 'established_dispersed',
    access_difficulty: 'high_clearance',
    vehicle_fit: ['full_size_truck', 'van'],
    fire_ring: true,
    flatness: 'good',
    notes: 'Established durable campsite.',
    ...overrides,
  };
  return buildCampsiteReportInputFromForm(location, form);
}

async function publicSites(recommendationService) {
  return recommendationService.listApprovedCommunityCampsitesByBounds({
    minLat: 38,
    minLng: -122,
    maxLat: 39,
    maxLng: -120,
    limit: 100,
  });
}

async function runTriage(backend, triageService, reportId) {
  backend.setUser({ id: 'system', isSystem: true });
  const triage = await triageService.runTriage(reportId);
  assert.strictEqual(triage.ok, true, 'Automated triage should run.');
  return triage;
}

async function reviewerApprove(backend, reviewService, reportId, reviewerId, extra = {}) {
  backend.setUser({ id: reviewerId, isTrustedReviewer: true, ...extra });
  backend.reviewerProfiles.set(reviewerId, reviewerProfile(reviewerId, 'trusted'));
  const vote = await reviewService.castReviewVote(reportId, {
    vote: 'approve',
    confidence: 'high',
    reviewer_notes: 'Looks established and specific.',
  });
  assert.strictEqual(vote.ok, true, `Reviewer ${reviewerId} should approve.`);
  return vote;
}

async function approveThroughReviewAndModeration(backend, reviewService, recommendationService, reportId) {
  await reviewerApprove(backend, reviewService, reportId, 'reviewer-1');
  await reviewerApprove(backend, reviewService, reportId, 'reviewer-2');
  await reviewerApprove(backend, reviewService, reportId, 'reviewer-3');
  assert.strictEqual(
    backend.reports.find((report) => report.id === reportId).review_state,
    'moderator_review',
    'Reviewer quorum should move to moderator review when final approval is required.',
  );
  backend.setUser({ id: 'moderator-1', isAdmin: true });
  const approved = await recommendationService.approveReport({ reportId });
  assert.strictEqual(approved.ok, true, 'Moderator approval should publish canonical campsite.');
  return approved.data.camp_site;
}

function assertPublicContains(publicResult, siteId, message) {
  assert.strictEqual(publicResult.ok, true);
  assert.ok(publicResult.data.some((site) => site.id === siteId), message);
}

function assertPublicExcludes(publicResult, siteId, message) {
  assert.strictEqual(publicResult.ok, true);
  assert.strictEqual(publicResult.data.some((site) => site.id === siteId), false, message);
}

async function main() {
  clearOfflineCampsiteSubmissionsForTest();
  const backend = new CampsiteWorkflowBackend();
  const recommendationService = new CampsiteRecommendationService(backend);
  const triageService = new CampsiteTriageService(
    backend,
    {},
    {
      async reviewCampSiteReport() {
        return {
          ok: true,
          data: {
            id: 'land-use-pass',
            camp_site_report_id: 'report',
            status: 'passed',
            matched_layers: {},
            warnings: [],
            blocking_reasons: [],
            provider_version: 'test',
            created_at: nowIso(),
          },
        };
      },
    },
  );
  const reviewService = new CampsiteReviewService(backend);
  const groupService = new CampSiteGroupSharingService(backend);
  const gpxService = new GpxCampsiteImportService(backend);

  const navigateSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'navigate.tsx'), 'utf8');
  assert.ok(
    navigateSource.includes('openRecommendCampsiteChooser') &&
      navigateSource.includes('handleRecommendCampsiteUseCurrentLocation') &&
      navigateSource.includes('handleRecommendCampsiteDropPin') &&
      navigateSource.includes('handleRecommendCampsiteChooseGpxFile'),
    'Map Tools should expose current-location, pin-drop, and GPX campsite recommendation paths.',
  );

  backend.setUser({ id: 'owner-current' });
  const currentPrivate = await recommendationService.createCampsiteReport(
    campsiteFormInput(
      { latitude: 38.7807, longitude: -121.2076, source_type: 'current_location', location_accuracy_m: 12 },
      { visibility_requested: 'private' },
    ),
  );
  assert.strictEqual(currentPrivate.ok, true, 'Current-location private save should succeed.');
  assert.strictEqual(currentPrivate.data.moderation_status, 'private_saved');
  const ownerPrivateMarkers = await recommendationService.listCurrentUserPrivateReportsByBounds({
    minLat: 38,
    minLng: -122,
    maxLat: 39,
    maxLng: -120,
  });
  assert.strictEqual(ownerPrivateMarkers.data.length, 1, 'Owner should see private marker.');
  backend.setUser({ id: 'not-owner' });
  const otherPrivateMarkers = await recommendationService.listCurrentUserPrivateReportsByBounds({
    minLat: 38,
    minLng: -122,
    maxLat: 39,
    maxLng: -120,
  });
  assert.strictEqual(otherPrivateMarkers.data.length, 0, 'Non-owner should not see private marker.');

  backend.setUser({ id: 'pin-submitter' });
  const pinCommunity = await recommendationService.createCampsiteReport(
    campsiteFormInput(
      { latitude: 38.792, longitude: -121.215, source_type: 'pin_drop', location_accuracy_m: null },
      {
        visibility_requested: 'community',
        stewardship_acknowledged: true,
        sensitive_area_acknowledged: true,
      },
    ),
  );
  assert.strictEqual(pinCommunity.ok, true);
  const pinTriage = await runTriage(backend, triageService, pinCommunity.data.id);
  assert.strictEqual(pinTriage.data.triage_status, 'passed');
  assert.strictEqual(backend.reports.find((report) => report.id === pinCommunity.data.id).review_state, 'community_review');
  const pinPublicBefore = await publicSites(recommendationService);
  assert.strictEqual(pinPublicBefore.data.length, 0, 'Community submissions should not appear publicly before approval.');
  const pinSite = await approveThroughReviewAndModeration(
    backend,
    reviewService,
    recommendationService,
    pinCommunity.data.id,
  );
  assertPublicContains(await publicSites(recommendationService), pinSite.id, 'Approved pin-drop site should appear publicly.');

  backend.setUser({ id: 'gpx-owner' });
  const gpxUpload = await gpxService.uploadGpxImport({
    name: 'camp-waypoints.gpx',
    type: 'application/gpx+xml',
    client_import_id: 'gpx-client-1',
    content: `<?xml version="1.0"?>
      <gpx version="1.1" creator="ECS Test">
        <metadata><name>Private GPX Import</name></metadata>
        <wpt lat="38.801" lon="-121.22"><name>Ridge Camp</name><desc>Durable pullout</desc></wpt>
        <trk><name>Track</name><trkseg><trkpt lat="38.7" lon="-121.1" /></trkseg></trk>
      </gpx>`,
  });
  assert.strictEqual(gpxUpload.ok, true, 'GPX upload should parse.');
  const imported = gpxUploadResultToCampsiteImportResult(gpxUpload.data);
  assert.strictEqual(imported.candidates.length, 1, 'Waypoint candidates should appear.');
  assert.strictEqual(imported.trackCount, 1, 'Tracks are counted but not converted to campsite reports.');
  const gpxInput = buildCampsiteReportInputFromGpxCandidate(imported.candidates[0], 'community', {
    stewardship_acknowledged: true,
    sensitive_area_acknowledged: true,
    user_stayed_here: true,
    verified_in_person: true,
    visited_at: '2026-04-03T00:00:00.000Z',
    site_type: 'established_dispersed',
    access_difficulty: 'high_clearance',
    vehicle_fit: ['van'],
  });
  const gpxReport = await recommendationService.createCampsiteReport(gpxInput);
  assert.strictEqual(gpxReport.ok, true);
  await runTriage(backend, triageService, gpxReport.data.id);
  assertPublicExcludes(await publicSites(recommendationService), gpxReport.data.camp_site_id, 'GPX community candidate should not publish before review.');
  const gpxSite = await approveThroughReviewAndModeration(
    backend,
    reviewService,
    recommendationService,
    gpxReport.data.id,
  );
  assertPublicContains(await publicSites(recommendationService), gpxSite.id, 'Approved GPX candidate should appear publicly.');

  backend.setUser({ id: 'photo-submitter' });
  const photoReport = await recommendationService.createCampsiteReport(
    campsiteFormInput(
      { latitude: 38.812, longitude: -121.23, source_type: 'pin_drop', location_accuracy_m: null },
      {
        visibility_requested: 'community',
        stewardship_acknowledged: true,
        sensitive_area_acknowledged: true,
      },
    ),
  );
  assert.strictEqual(photoReport.ok, true);
  await runTriage(backend, triageService, photoReport.data.id);
  backend.setUser({ id: 'photo-submitter' });
  const attachedPhoto = await recommendationService.attachPhotoToReport({
    camp_site_report_id: photoReport.data.id,
    storage_url: 'campsite-reports/photo-submitter/photo.jpg',
    thumbnail_url: 'campsite-reports/photo-submitter/thumb.jpg',
    exif_stripped: true,
  });
  assert.strictEqual(attachedPhoto.ok, true, 'Photo should attach to community submission.');
  backend.setUser({ id: 'reviewer-photo', isTrustedReviewer: true });
  backend.reviewerProfiles.set('reviewer-photo', reviewerProfile('reviewer-photo', 'trusted'));
  const reviewDetails = await reviewService.getCommunityReviewReportDetails(photoReport.data.id);
  assert.strictEqual(reviewDetails.ok, true);
  assert.strictEqual(reviewDetails.data.photos.length, 1, 'Pending photo should be visible to reviewers.');
  const photoSite = await approveThroughReviewAndModeration(
    backend,
    reviewService,
    recommendationService,
    photoReport.data.id,
  );
  const publicPendingPhotos = await recommendationService.listApprovedPhotosForCampSite(photoSite.id);
  assert.strictEqual(publicPendingPhotos.ok, true);
  assert.strictEqual(publicPendingPhotos.data.length, 0, 'Pending photos should not be public after campsite approval alone.');
  backend.setUser({ id: 'moderator-1', isAdmin: true });
  const photoApproval = await recommendationService.moderatePhoto({
    photoId: attachedPhoto.data.id,
    moderation_status: 'approved',
  });
  assert.strictEqual(photoApproval.ok, true);
  const publicApprovedPhotos = await recommendationService.listApprovedPhotosForCampSite(photoSite.id);
  assert.strictEqual(publicApprovedPhotos.data.length, 1, 'Approved photo should appear publicly after photo approval.');

  backend.setUser({ id: 'group-owner' });
  const privateGroupReport = await recommendationService.createCampsiteReport(
    campsiteFormInput(
      { latitude: 38.825, longitude: -121.24, source_type: 'pin_drop', location_accuracy_m: null },
      { visibility_requested: 'private' },
    ),
  );
  assert.strictEqual(privateGroupReport.ok, true);
  const group = await groupService.createCampSiteGroup('Trail Crew');
  assert.strictEqual(group.ok, true);
  const groupId = group.data.group.id;
  const member = await groupService.addGroupMember(groupId, 'group-member');
  assert.strictEqual(member.ok, true);
  const shared = await groupService.shareCampSiteReportToGroup(privateGroupReport.data.id, groupId);
  assert.strictEqual(shared.ok, true);
  backend.setUser({ id: 'group-member' });
  const memberGroupLayer = await groupService.listGroupCampSitesByMapBounds(groupId, {
    minLat: 38,
    minLng: -122,
    maxLat: 39,
    maxLng: -120,
  });
  assert.strictEqual(memberGroupLayer.ok, true);
  assert.strictEqual(memberGroupLayer.data.length, 1, 'Group member should see group campsite layer item.');
  backend.setUser({ id: 'outside-group' });
  const outsiderGroupLayer = await groupService.listGroupCampSites(groupId);
  assert.strictEqual(outsiderGroupLayer.ok, false, 'Non-member cannot see group shares.');
  assert.strictEqual(outsiderGroupLayer.code, 'permission_denied');
  assert.strictEqual(
    (await publicSites(recommendationService)).data.some((site) => site.id === privateGroupReport.data.camp_site_id),
    false,
    'Group-only campsite must not appear publicly.',
  );

  backend.setUser({ id: 'offline-submitter' });
  const offlineSubmit = await submitCampsiteReportOfflineSafe(
    campsiteFormInput(
      { latitude: 38.836, longitude: -121.25, source_type: 'pin_drop', location_accuracy_m: null },
      {
        visibility_requested: 'community',
        stewardship_acknowledged: true,
        sensitive_area_acknowledged: true,
      },
    ),
    { service: recommendationService, online: false },
  );
  assert.strictEqual(offlineSubmit.ok, true);
  assert.strictEqual(offlineSubmit.mode, 'queued');
  markOfflineCampsiteSubmissionForRetry(offlineSubmit.submission.client_submission_id);
  let offlineQueue = getOfflineCampsiteSubmissions();
  assert.strictEqual(getCampsiteOfflineStatusLabel(offlineQueue[0].status), 'Waiting to sync');
  const syncedReportIds = [];
  const synced = await syncOfflineCampsiteSubmissions({
    service: recommendationService,
    async afterSubmit(report) {
      syncedReportIds.push(report.id);
      await runTriage(backend, triageService, report.id);
    },
  });
  assert.deepStrictEqual(synced, { submitted: 1, failed: 0, remaining: 0 });
  offlineQueue = getOfflineCampsiteSubmissions();
  assert.strictEqual(offlineQueue[0].status, 'submitted');
  assert.strictEqual(backend.reports.find((report) => report.id === syncedReportIds[0]).review_state, 'community_review');
  const retrySync = await syncOfflineCampsiteSubmissions({ service: recommendationService });
  assert.deepStrictEqual(retrySync, { submitted: 0, failed: 0, remaining: 0 });
  assert.strictEqual(
    backend.reports.filter((report) => report.client_submission_id === offlineSubmit.submission.client_submission_id).length,
    1,
    'Offline sync retries should not duplicate records.',
  );

  backend.setUser({ id: 'flagger-1' });
  const seriousFlag = await recommendationService.flagCampsite({
    camp_site_id: pinSite.id,
    reason: 'private_land',
    details: 'Landowner sign posted at access.',
  });
  assert.strictEqual(seriousFlag.ok, true);
  assert.strictEqual(
    backend.sites.find((site) => site.id === pinSite.id).status,
    'hidden_pending_review',
  );
  assertPublicExcludes(await publicSites(recommendationService), pinSite.id, 'Hidden-pending-review site should leave public layer.');
  backend.setUser({ id: 'moderator-1', isAdmin: true });
  const flaggedQueue = await recommendationService.listFlaggedCampsiteReviewQueue();
  assert.strictEqual(flaggedQueue.ok, true);
  assert.ok(flaggedQueue.data.some((site) => site.id === pinSite.id), 'Serious flag should enter moderator review queue.');
  const resolvedFlag = await recommendationService.resolveFlaggedCampsiteReview({
    campSiteId: pinSite.id,
    action: 'hide',
    internal_notes: 'Confirmed private access concern.',
  });
  assert.strictEqual(resolvedFlag.ok, true);
  assert.strictEqual(resolvedFlag.data.status, 'hidden');
  assertPublicExcludes(await publicSites(recommendationService), pinSite.id, 'Hidden site should remain off public layer.');

  backend.setUser({ id: 'normal-user' });
  const normalQueue = await reviewService.listCommunityReviewQueue();
  assert.strictEqual(normalQueue.ok, false, 'Normal user cannot access review queue.');
  backend.setUser({ id: 'offline-submitter', isTrustedReviewer: true });
  backend.reviewerProfiles.set('offline-submitter', reviewerProfile('offline-submitter', 'trusted'));
  const ownReview = await reviewService.castReviewVote(syncedReportIds[0], {
    vote: 'approve',
    confidence: 'high',
  });
  assert.strictEqual(ownReview.ok, false, 'Submitter cannot review own report.');
  backend.setUser({ id: 'different-gpx-user' });
  const otherGpxAccess = await gpxService.getMyGpxImport(imported.importId);
  assert.strictEqual(otherGpxAccess.ok, false, 'User cannot access another user GPX import.');
  backend.setUser({ id: 'outside-group' });
  const otherGroupAccess = await groupService.listGroupCampSites(groupId);
  assert.strictEqual(otherGroupAccess.ok, false, 'User cannot access another group share.');

  assert.ok(
    backend.reviewEvents.some((event) => event.event_type === 'published') ||
      backend.reviewEvents.some((event) => event.event_type === 'moderator_approved'),
    'Workflow should write review/moderation audit events.',
  );
  assert.ok(
    backend.lifecycleEvents.some((event) => event.event_type === 'published_review_resolved'),
    'Serious flag resolution should write lifecycle audit events.',
  );

  console.log('Campsite end-to-end workflow checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
