import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const RESULT_RELATIVE_PATH = path.join('.smoke', 'explore-trail-packs-production-readiness-result.json');
const EVIDENCE_RELATIVE_PATH = path.join('.smoke', 'explore-trail-packs-production-evidence.json');

function relPath(root, filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/');
}

function readIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

function readJsonIfExists(filePath) {
  try {
    return JSON.parse(readIfExists(filePath));
  } catch {
    return null;
  }
}

function normalize(source) {
  return source.replace(/\r\n/g, '\n');
}

function check(id, label, passed, evidence = [], remediation = []) {
  return { id, label, passed: Boolean(passed), evidence, remediation };
}

function evidenceTrue(evidence, key) {
  return evidence?.[key] === true;
}

function accepted(value) {
  return String(value ?? '').trim().toLowerCase() === 'accepted';
}

export function buildExploreTrailPacksProductionReadinessResult(options = {}) {
  const root = options.rootDir ?? process.cwd();
  const paths = {
    result: path.join(root, RESULT_RELATIVE_PATH),
    evidence: path.join(root, EVIDENCE_RELATIVE_PATH),
    discover: path.join(root, 'app', '(tabs)', 'discover.tsx'),
    navigate: path.join(root, 'app', '(tabs)', 'navigate.tsx'),
    navigationHandoff: path.join(root, 'lib', 'navigationHandoffStore.ts'),
    trailPacks: path.join(root, 'lib', 'explore', 'trailPacks.ts'),
    trailPackConfidence: path.join(root, 'lib', 'explore', 'trailPackConfidence.ts'),
    trailPackFeedback: path.join(root, 'lib', 'explore', 'trailPackFeedback.ts'),
    trailPackReviewQueue: path.join(root, 'lib', 'explore', 'trailPackReviewQueue.ts'),
    trailPackSubmissions: path.join(root, 'lib', 'explore', 'trailPackSubmissions.ts'),
    trailPackCard: path.join(root, 'components', 'discover', 'TrailPackCard.tsx'),
    trailPackPreview: path.join(root, 'components', 'trailPacks', 'TrailPackPreviewModal.tsx'),
    trailPackFeedbackPanel: path.join(root, 'components', 'trailPacks', 'TrailPackFeedbackPanel.tsx'),
    trailPackSubmissionModal: path.join(root, 'components', 'trailPacks', 'TrailPackSubmissionModal.tsx'),
  };

  const evidence = readJsonIfExists(paths.evidence);
  const discover = normalize(readIfExists(paths.discover));
  const navigate = normalize(readIfExists(paths.navigate));
  const navigationHandoff = normalize(readIfExists(paths.navigationHandoff));
  const trailPacks = normalize(readIfExists(paths.trailPacks));
  const trailPackConfidence = normalize(readIfExists(paths.trailPackConfidence));
  const trailPackFeedback = normalize(readIfExists(paths.trailPackFeedback));
  const trailPackReviewQueue = normalize(readIfExists(paths.trailPackReviewQueue));
  const trailPackSubmissions = normalize(readIfExists(paths.trailPackSubmissions));
  const trailPackCard = normalize(readIfExists(paths.trailPackCard));
  const trailPackPreview = normalize(readIfExists(paths.trailPackPreview));
  const trailPackFeedbackPanel = normalize(readIfExists(paths.trailPackFeedbackPanel));
  const trailPackSubmissionModal = normalize(readIfExists(paths.trailPackSubmissionModal));

  const checks = [
    check(
      'approved_only_discovery_with_radius_and_review_state',
      'Explore Trail Pack discovery is approved-only by default, radius scoped, confidence filtered, and review-state aware.',
      trailPacks.includes('getDiscoverableTrailPacks') &&
        trailPacks.includes('isTrailPackPubliclyDiscoverable(pack, reviewState)') &&
        trailPacks.includes('includeOwnDrafts') &&
        trailPacks.includes('includeBroaderResults') &&
        trailPacks.includes('shouldPromoteTrailPackByDefault(pack.evaluatedConfidence)') &&
        trailPacks.includes('pack.distanceFromUserMiles <= radiusMiles') &&
        trailPacks.includes('evaluatedConfidence') &&
        trailPackReviewQueue.includes('isTrailPackPubliclyDiscoverable') &&
        trailPackReviewQueue.includes("return status === 'approved' && reviewState?.publicSuppressed !== true;") &&
        discover.includes('getDiscoverableTrailPacks(') &&
        discover.includes('activeDistanceRadius') &&
        discover.includes('reviewStatesByTrailPackId: trailPackFeedbackReviewStates') &&
        discover.includes('includeOwnDrafts: ownerTrailPackIds.length > 0'),
      [relPath(root, paths.trailPacks), relPath(root, paths.trailPackReviewQueue), relPath(root, paths.discover)],
      ['Validate Explore Trail Pack discovery on Android with approved, pending, rejected, own-draft, low-confidence, and out-of-radius records.'],
    ),
    check(
      'confidence_engine_blocks_bad_geometry_closures_stale_and_low_evidence',
      'Trail Pack confidence blocks unsafe/invalid records and labels stale, missing, closure, weather, fire/smoke, vehicle-fit, and offline-cache uncertainty.',
      trailPackConfidence.includes('Route geometry is incomplete') &&
        trailPackConfidence.includes('Route geometry contains impossible jumps') &&
        trailPackConfidence.includes('Route crosses restricted area') &&
        trailPackConfidence.includes('Trail Pack verification is stale') &&
        trailPackConfidence.includes('Closure validation unavailable') &&
        trailPackConfidence.includes('Weather context unavailable') &&
        trailPackConfidence.includes('Fire/smoke validation unavailable') &&
        trailPackConfidence.includes('Vehicle fit unavailable') &&
        trailPackConfidence.includes('Offline cache readiness not evaluated') &&
        trailPackConfidence.includes('Community confirmations limited') &&
        trailPackConfidence.includes('finalScore = blockers.length > 0 ? Math.min(clampScore(score), 39)') &&
        trailPackConfidence.includes("confidence.band === 'high' || confidence.band === 'verified'"),
      [relPath(root, paths.trailPackConfidence)],
      ['Run real route/provider shadow evidence before allowing Trail Packs to influence public Explore recommendations beyond reviewed seed data.'],
    ),
    check(
      'moderation_and_feedback_suppress_public_visibility',
      'Trail Pack feedback and review actions suppress public visibility for private-land, closure, sensitive-location, duplicate, rejected, or needs-more-data states.',
      trailPackFeedback.includes('private_land_concern') &&
        trailPackFeedback.includes('closure_concern') &&
        trailPackReviewQueue.includes("flag_private_land") &&
        trailPackReviewQueue.includes("flag_sensitive_area") &&
        trailPackReviewQueue.includes("restricted_private_land: 'Restricted/private land'") &&
        trailPackReviewQueue.includes("sensitive_campsite_location: 'Sensitive campsite/location'") &&
        trailPackReviewQueue.includes("return 'needs_more_data';") &&
        trailPackReviewQueue.includes("return 'rejected';") &&
        trailPackReviewQueue.includes('publicSuppressed: shouldSuppressTrailPackForReview') &&
        trailPackReviewQueue.includes('publicSuppressed: true') &&
        trailPackFeedbackPanel.includes('REPORT ISSUE') &&
        trailPackFeedbackPanel.includes('Private land') &&
        trailPackFeedbackPanel.includes('Blocked route') &&
        !trailPackFeedbackPanel.includes('public comments'),
      [
        relPath(root, paths.trailPackFeedback),
        relPath(root, paths.trailPackReviewQueue),
        relPath(root, paths.trailPackFeedbackPanel),
      ],
      ['Capture moderation-review evidence showing issue reports remove/suppress public suggestions until reviewed.'],
    ),
    check(
      'submissions_require_permission_certification_and_pending_review',
      'Trail Pack submissions require permission certification, warn/sanitize near-current-location geometry, and remain pending review rather than public.',
      trailPackSubmissions.includes('TRAIL_PACK_SUBMISSION_CERTIFICATION_COPY') &&
        trailPackSubmissions.includes('I confirm I have the right to share this route') &&
        trailPackSubmissions.includes('certifiesPermissionToShare') &&
        trailPackSubmissions.includes('Certification is required before submission.') &&
        trailPackSubmissions.includes('detectTrailPackPrivacyWarnings') &&
        trailPackSubmissions.includes('sanitizeTrailPackSubmissionGeometry') &&
        trailPackSubmissions.includes("reviewStatus: 'pending_review'") &&
        trailPackSubmissions.includes('localStorage') &&
        !/CampOps|campops/.test(trailPackSubmissions) &&
        trailPackSubmissionModal.includes('TRAIL_PACK_SUBMISSION_CERTIFICATION_COPY') &&
        navigate.includes('SUBMIT AS TRAIL PACK') &&
        navigate.includes('CREATE TRAIL PACK FROM IMPORT') &&
        discover.includes('Submit to ECS Trail Packs'),
      [
        relPath(root, paths.trailPackSubmissions),
        relPath(root, paths.trailPackSubmissionModal),
        relPath(root, paths.navigate),
        relPath(root, paths.discover),
      ],
      ['Run privacy/product review for public or shared Trail Pack publishing before enabling broad production submission workflows.'],
    ),
    check(
      'preview_and_navigate_handoff_are_guarded_and_source_labeled',
      'Trail Pack preview and Navigate handoff preserve source metadata, disable missing-geometry guidance, and label confidence/offline-cache state.',
      trailPackPreview.includes('RouteSegment') &&
        trailPackPreview.includes('LOOP ROUTE') &&
        trailPackPreview.includes('POINT ROUTE') &&
        trailPackPreview.includes('Offline cache unavailable for this Trail Pack.') &&
        trailPackPreview.includes('disabled={!offlineCacheAvailable}') &&
        trailPackPreview.includes('ECS confidence') &&
        trailPackPreview.includes('WARNINGS') &&
        trailPackPreview.includes('sourceLabel') &&
        trailPackPreview.includes('communitySummary') &&
        trailPackPreview.includes('disabled={!canStart}') &&
        trailPackPreview.includes('Route geometry is unavailable for this Trail Pack.') &&
        trailPacks.includes('trailPackRouteType: pack.routeType') &&
        trailPacks.includes('reviewStatus: pack.reviewStatus') &&
        navigationHandoff.includes('routeMetadata') &&
        discover.includes('Trail Pack staged. Navigate to the route start before beginning guidance.') &&
        discover.includes('routeStartDistanceMiles'),
      [relPath(root, paths.trailPackPreview), relPath(root, paths.trailPacks), relPath(root, paths.navigationHandoff), relPath(root, paths.discover)],
      ['Capture Android Explore-to-Navigate handoff evidence for loop, point-to-point, missing-geometry, far-from-start, and offline-cache-unavailable states.'],
    ),
    check(
      'explore_ui_keeps_truthful_empty_review_and_owner_states',
      'Explore Trail Pack UI shows truthful loading, no-location, low-confidence, empty, owner-pending, confidence, preview/start/save, and issue-feedback states.',
      discover.includes('Scanning approved ECS Trail Packs within selected radius') &&
        discover.includes('Trail Packs need your location or a selected search area to filter nearby routes.') &&
        discover.includes('Only lower-confidence Trail Packs were found nearby. Expand your radius or enable broader results.') &&
        discover.includes('No approved Trail Packs found within this radius. Try expanding your radius or checking Hidden Gems.') &&
        discover.includes('This Trail Pack is under ECS review and is not visible to other users.') &&
        trailPackCard.includes('ECS confidence') &&
        trailPackCard.includes('PREVIEW') &&
        trailPackCard.includes('START') &&
        trailPackCard.includes('star-outline') &&
        trailPackCard.includes('disabled={!canStartGuidance}') &&
        trailPackCard.includes('Route geometry is unavailable for this Trail Pack.') &&
        trailPackFeedbackPanel.includes('COMPLETED') &&
        trailPackFeedbackPanel.includes('RECOMMEND') &&
        trailPackFeedbackPanel.includes('REPORT ISSUE'),
      [
        relPath(root, paths.discover),
        relPath(root, paths.trailPackCard),
        relPath(root, paths.trailPackFeedbackPanel),
      ],
      ['Run Android phone/tablet visual QA for Trail Pack cards, category panel, preview modal, feedback panel, and submission modal.'],
    ),
    check(
      'android_explore_trail_packs_visual_evidence_present',
      'Android Explore Trail Packs visual evidence is recorded.',
      evidenceTrue(evidence, 'androidExploreTrailPacksVisualQaPassed'),
      [relPath(root, paths.evidence)],
      ['Capture Android phone/tablet screenshots for Explore Trail Pack category, cards, preview, feedback, submission, empty, low-confidence, and owner-pending states.'],
    ),
    check(
      'content_review_and_moderation_evidence_present',
      'Trail Pack content review/moderation evidence is recorded.',
      evidenceTrue(evidence, 'contentReviewModerationEvidencePassed'),
      [relPath(root, paths.evidence)],
      ['Record review-queue evidence for approve, reject, request more data, private-land, closure, sensitive-location, duplicate, and suppression paths.'],
    ),
    check(
      'explore_to_navigate_device_handoff_evidence_present',
      'Explore-to-Navigate Trail Pack handoff device evidence is recorded.',
      evidenceTrue(evidence, 'exploreToNavigateDeviceHandoffEvidencePassed'),
      [relPath(root, paths.evidence)],
      ['Exercise Preview, Start Guidance, far-from-start staging, missing geometry guard, and Navigate route metadata on Android.'],
    ),
    check(
      'privacy_submission_evidence_present',
      'Trail Pack submission privacy/certification evidence is recorded.',
      evidenceTrue(evidence, 'privacySubmissionEvidencePassed'),
      [relPath(root, paths.evidence)],
      ['Capture certification, privacy warning, geometry sanitization, pending-review storage, and non-public visibility evidence.'],
    ),
    check(
      'production_owner_decision_accepted',
      'Production owner decision is accepted for Explore Trail Packs.',
      accepted(evidence?.productionDecision),
      [relPath(root, paths.evidence)],
      ['Record product, engineering, content/moderation, privacy/security, QA, and support acceptance after Android and review evidence is complete.'],
    ),
  ];

  const failed = checks.filter((item) => !item.passed);
  return {
    passed: failed.length === 0,
    status: failed.length === 0 ? 'production_ready' : 'blocked',
    statusLabel: failed.length === 0 ? 'Production ready' : 'Blocked for production',
    checkedAt: new Date().toISOString(),
    system: 'explore_trail_packs_route_discovery',
    checks,
    blockers: failed.map((item) => item.id),
    remediation: failed.flatMap((item) => item.remediation),
    notes: [
      'This gate separates Explore Trail Pack implementation readiness from Android, content-review, privacy, and production-owner evidence.',
      'Trail Packs must not publish pending, rejected, sensitive, private-land, closure-conflicted, low-confidence, or malformed routes as public recommendations.',
      'Explore-to-Navigate handoff must preserve source/confidence/review metadata and never imply route legality, safety, weather, or access certainty without evidence.',
    ],
  };
}

export function writeExploreTrailPacksProductionReadinessResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const resultPath = path.join(root, RESULT_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(resultPath), { recursive: true });
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return resultPath;
}

export function formatExploreTrailPacksProductionReadinessResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const lines = [
    `Explore Trail Packs production readiness: ${result.statusLabel}`,
    `Result file: ${relPath(root, path.join(root, RESULT_RELATIVE_PATH))}`,
    `Checked at: ${result.checkedAt}`,
    `Production ready: ${result.passed ? 'yes' : 'no'}`,
    '',
    'Checks:',
  ];
  for (const item of result.checks) lines.push(`- ${item.label}: ${item.passed ? 'pass' : 'blocked'}`);
  if (result.blockers.length > 0) {
    lines.push('', 'Active blockers:');
    for (const blocker of result.blockers) lines.push(`- ${blocker}`);
  }
  if (result.remediation.length > 0) {
    lines.push('', 'Next actions:');
    for (const item of Array.from(new Set(result.remediation))) lines.push(`- ${item}`);
  }
  lines.push('', 'Notes:');
  for (const note of result.notes) lines.push(`- ${note}`);
  return `${lines.join('\n')}\n`;
}

async function main() {
  const jsonOnly = process.argv.includes('--json');
  const result = buildExploreTrailPacksProductionReadinessResult();
  writeExploreTrailPacksProductionReadinessResult(result);
  if (jsonOnly) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else process.stdout.write(formatExploreTrailPacksProductionReadinessResult(result));
  return result.passed ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code)).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
