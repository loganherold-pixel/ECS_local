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
  CampsiteReviewNotificationService,
} = require(path.join(root, 'lib', 'campsites', 'campsiteReviewNotificationService.ts'));

function nowIso() {
  return new Date().toISOString();
}

function createReport(overrides = {}) {
  const now = nowIso();
  return {
    id: overrides.id ?? 'report-1',
    camp_site_id: overrides.camp_site_id ?? null,
    submitted_by_user_id: overrides.submitted_by_user_id ?? 'submitter-1',
    latitude: overrides.latitude ?? 38.7807,
    longitude: overrides.longitude ?? -121.2076,
    source_type: 'pin_drop',
    location_accuracy_m: 25,
    user_stayed_here: true,
    verified_in_person: true,
    visited_at: now,
    site_type: 'established_dispersed',
    access_difficulty: 'high_clearance',
    vehicle_fit: ['full_size_truck'],
    amenities: {},
    conditions: {},
    notes: 'Established durable campsite.',
    visibility_requested: 'community',
    moderation_status: 'pending',
    stewardship_acknowledged: true,
    sensitive_area_acknowledged: true,
    client_submission_id: null,
    review_state: 'community_review',
    triage_score: 90,
    triage_summary: {},
    community_review_started_at: now,
    community_review_completed_at: null,
    moderator_review_started_at: null,
    moderator_review_completed_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

class MemoryNotificationBackend {
  constructor() {
    this.notifications = [];
    this.trustedReviewerIds = ['reviewer-1', 'reviewer-2'];
    this.moderatorIds = ['moderator-1'];
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

  async listTrustedReviewerUserIds() {
    return { ok: true, data: this.trustedReviewerIds };
  }

  async listModeratorUserIds() {
    return { ok: true, data: this.moderatorIds };
  }

  async listNotificationsForUser(userId, limit) {
    return {
      ok: true,
      data: this.notifications
        .filter((notification) => notification.recipient_user_id === userId)
        .slice(0, limit),
    };
  }
}

function assertNoSensitiveCoordinates(notification) {
  const serialized = JSON.stringify(notification);
  assert(!serialized.includes('38.7807'), 'notification should not include exact latitude');
  assert(!serialized.includes('-121.2076'), 'notification should not include exact longitude');
  assert(!serialized.includes('submitted_by_user_id'), 'notification should not expose submitter field names');
}

async function run() {
  const backend = new MemoryNotificationBackend();
  const service = new CampsiteReviewNotificationService(backend);
  const report = createReport();

  let result = await service.notifyCommunitySubmissionReceived(report);
  assert(result.ok, 'pending notification should be created');
  assert.strictEqual(result.data.length, 1);
  assert.strictEqual(result.data[0].recipient_user_id, 'submitter-1');
  assert.strictEqual(result.data[0].type, 'community_submission_received');
  assert.strictEqual(result.data[0].link_target, 'my_campsite_submission');
  assert.deepStrictEqual(result.data[0].link_params, { reportId: 'report-1' });
  assertNoSensitiveCoordinates(result.data[0]);

  result = await service.notifyNeedsInfo(report, 'Confirm whether this is established and legal.');
  assert(result.ok, 'needs-info notification should be created');
  assert.strictEqual(result.data[0].type, 'needs_info_requested');
  assert.strictEqual(result.data[0].recipient_user_id, 'submitter-1');
  assertNoSensitiveCoordinates(result.data[0]);

  result = await service.notifyApprovedPublished({ ...report, camp_site_id: 'site-1' }, 'site-1');
  assert(result.ok, 'approval notification should be created');
  assert.strictEqual(result.data[0].type, 'approved_published');
  assert.strictEqual(result.data[0].link_target, 'community_campsite_detail');
  assert.deepStrictEqual(result.data[0].link_params, { campSiteId: 'site-1' });

  result = await service.notifyRejected(report, 'Closed to camping.');
  assert(result.ok, 'rejection notification should be created');
  assert.strictEqual(result.data[0].type, 'rejected');
  assert.strictEqual(result.data[0].link_target, 'my_campsite_submission');
  assertNoSensitiveCoordinates(result.data[0]);

  result = await service.notifyCommunityReviewStarted(report);
  assert(result.ok, 'community review notifications should be created');
  const reviewerNotifications = result.data.filter((item) => item.audience === 'trusted_reviewer');
  assert.strictEqual(reviewerNotifications.length, 2);
  assert(reviewerNotifications.every((item) => item.link_target === 'community_campsite_review'));
  assert(!reviewerNotifications.some((item) => item.recipient_user_id === report.submitted_by_user_id));

  result = await service.notifySensitiveVoteEscalation(report, 'private_land', 'high');
  assert(result.ok, 'moderators should be notified on escalation');
  assert.strictEqual(result.data.length, 1);
  assert.strictEqual(result.data[0].recipient_user_id, 'moderator-1');
  assert.strictEqual(result.data[0].type, 'sensitive_vote_escalation');
  assert.strictEqual(result.data[0].link_target, 'community_campsite_review');
  assertNoSensitiveCoordinates(result.data[0]);

  result = await service.notifyModeratorReviewRequired(report, 'High-confidence sensitive vote.');
  assert(result.ok, 'moderator-review notification should be created');
  assert.strictEqual(result.data[0].recipient_user_id, 'moderator-1');
  assert.strictEqual(result.data[0].link_target, 'community_campsite_review');

  result = await service.notifyWithdrawn(report);
  assert(result.ok, 'withdrawn confirmation should be created');
  assert.strictEqual(result.data[0].type, 'withdrawn');
  assert.strictEqual(result.data[0].recipient_user_id, 'submitter-1');

  const submitterNotifications = await service.listNotificationsForUser('submitter-1');
  assert(submitterNotifications.ok);
  assert(submitterNotifications.data.length >= 5, 'submitter should have submitter-facing notifications');

  console.log('campsite review notification tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
