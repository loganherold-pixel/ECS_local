import { sanitizeVerificationArtifactText } from './verification-artifact-policy.mjs';

export const RELEASE_EVIDENCE_REGISTRY_CONTRACT = 'ecs-release-evidence-registry-v1';
export const RELEASE_EVIDENCE_REPORT_CONTRACT = 'ecs-release-evidence-report-v1';

export const RELEASE_EVIDENCE_CLASSES = Object.freeze([
  'behavioral',
  'build_provenance',
  'hardware_or_device',
  'manual_field',
  'multi_client',
  'owner_approval',
  'privacy_approval',
  'provider',
  'security_rls',
]);
const EVIDENCE_CLASS_SET = new Set(RELEASE_EVIDENCE_CLASSES);

const REQUIREMENT_STATUSES = new Set(['missing', 'planned']);
const SUBMISSION_STATUSES = new Set(['collected', 'accepted', 'rejected', 'expired']);
const APPROVAL_DECISIONS = new Set(['pending', 'accepted', 'rejected']);
const PRODUCTION_APPROVAL_STATUSES = new Set(['pending', 'accepted', 'rejected', 'expired']);
const PRODUCTION_APPROVAL_DECISIONS = new Set(['not_granted', 'accepted', 'rejected']);
const BINDING_POLICIES = new Set(['required', 'not_applicable']);
const REVALIDATION_MODES = new Set([
  'duration',
  'manual',
  'on_migration_change',
  'on_provider_change',
  'per_build',
  'per_release',
]);
const ARTIFACT_KINDS = new Set([
  'automated_test',
  'build_provenance',
  'database_evidence',
  'device_capture',
  'field_report',
  'owner_decision',
  'privacy_review',
  'provider_shadow',
  'static_declaration',
]);
const IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9_.:-]{0,127}$/;
const SHA_PATTERN = /^[a-f0-9]{40}$/i;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/i;

const REGISTRY_FIELDS = new Set([
  'schemaVersion',
  'resultContract',
  'registryVersion',
  'productionApproval',
  'requirements',
  'submissions',
]);
const REQUIREMENT_FIELDS = new Set([
  'evidenceId',
  'capability',
  'feature',
  'evidenceClass',
  'requiredEnvironment',
  'requiredDeviceOrProvider',
  'requiredScenario',
  'targetPlatform',
  'bindingRequirements',
  'initialStatus',
  'revalidationPolicy',
  'ownerRole',
  'reviewerRole',
  'notes',
]);
const SUBMISSION_FIELDS = new Set([
  'evidenceId',
  'status',
  'evidenceClass',
  'environment',
  'deviceOrProvider',
  'scenario',
  'targetPlatform',
  'buildSha',
  'buildArtifactDigest',
  'migrationDigest',
  'providerEnvironment',
  'deviceModel',
  'collectionDate',
  'expiresAt',
  'artifactDigest',
  'artifactReference',
  'artifactKind',
  'reviewerRole',
  'approvalDecision',
  'notes',
]);
const BINDING_FIELDS = new Set([
  'buildSha',
  'buildArtifactDigest',
  'migrationDigest',
  'providerEnvironment',
  'deviceModel',
]);
const REVALIDATION_FIELDS = new Set(['mode', 'maxAgeDays']);
const NOTES_FIELDS = new Set(['summary', 'limitations', 'ticketId']);
const PRODUCTION_APPROVAL_FIELDS = new Set([
  'status',
  'decision',
  'ownerRole',
  'reviewerRole',
  'reviewedAt',
  'artifactDigest',
  'artifactReference',
  'notes',
]);
const TARGET_FIELDS = new Set([
  'buildSha',
  'buildArtifactDigest',
  'migrationDigest',
  'providerEnvironment',
]);

function fail(message) {
  throw new Error(`Invalid ECS release evidence registry: ${message}`);
}

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function exactFields(value, allowed, field) {
  if (!isRecord(value)) fail(`${field} must be an object.`);
  const unsupported = Object.keys(value).filter((key) => !allowed.has(key));
  if (unsupported.length > 0) {
    fail(`${field} contains unsupported field${unsupported.length === 1 ? '' : 's'}: ${unsupported.join(', ')}.`);
  }
}

function requiredIdentifier(value, field) {
  if (typeof value !== 'string' || !IDENTIFIER_PATTERN.test(value)) {
    fail(`${field} must be a lowercase safe identifier.`);
  }
  return value;
}

function nullableIdentifier(value, field) {
  return value == null ? null : requiredIdentifier(value, field);
}

function requiredEnum(value, values, field) {
  if (!values.has(value)) fail(`${field} has an unsupported value.`);
  return value;
}

function requiredArray(value, field) {
  if (!Array.isArray(value) || value.length === 0) fail(`${field} must be a non-empty array.`);
  const normalized = value.map((entry, index) => requiredIdentifier(entry, `${field}[${index}]`));
  if (new Set(normalized).size !== normalized.length) fail(`${field} must not contain duplicates.`);
  return [...normalized].sort();
}

function timestamp(value, field, nullable = false) {
  if (nullable && value == null) return null;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    fail(`${field} must be an ISO timestamp${nullable ? ' or null' : ''}.`);
  }
  return new Date(value).toISOString();
}

function sha(value, field, nullable = false) {
  if (nullable && value == null) return null;
  if (typeof value !== 'string' || !SHA_PATTERN.test(value)) {
    fail(`${field} must be an exact 40-character commit SHA${nullable ? ' or null' : ''}.`);
  }
  return value.toLowerCase();
}

function digest(value, field, nullable = false) {
  if (nullable && value == null) return null;
  if (typeof value !== 'string' || !DIGEST_PATTERN.test(value)) {
    fail(`${field} must be a SHA-256 digest${nullable ? ' or null' : ''}.`);
  }
  return value.toLowerCase();
}

function safeNotes(value, field) {
  exactFields(value, NOTES_FIELDS, field);
  if (typeof value.summary !== 'string' || !value.summary.trim()) {
    fail(`${field}.summary must be a non-empty string.`);
  }
  const result = {
    summary: sanitizeVerificationArtifactText(value.summary, 300),
  };
  if (value.limitations != null) {
    if (typeof value.limitations !== 'string' || !value.limitations.trim()) {
      fail(`${field}.limitations must be a non-empty string when present.`);
    }
    result.limitations = sanitizeVerificationArtifactText(value.limitations, 300);
  }
  if (value.ticketId != null) result.ticketId = requiredIdentifier(value.ticketId, `${field}.ticketId`);
  return result;
}

function bindingRequirements(value, field) {
  exactFields(value, BINDING_FIELDS, field);
  const result = {};
  for (const key of BINDING_FIELDS) {
    result[key] = requiredEnum(value[key], BINDING_POLICIES, `${field}.${key}`);
  }
  return result;
}

function revalidationPolicy(value, field) {
  exactFields(value, REVALIDATION_FIELDS, field);
  const mode = requiredEnum(value.mode, REVALIDATION_MODES, `${field}.mode`);
  if (!Number.isInteger(value.maxAgeDays) || value.maxAgeDays < 1 || value.maxAgeDays > 3650) {
    fail(`${field}.maxAgeDays must be an integer from 1 through 3650.`);
  }
  return { mode, maxAgeDays: value.maxAgeDays };
}

function requirement(value, index) {
  const field = `requirements[${index}]`;
  exactFields(value, REQUIREMENT_FIELDS, field);
  return {
    evidenceId: requiredIdentifier(value.evidenceId, `${field}.evidenceId`),
    capability: requiredIdentifier(value.capability, `${field}.capability`),
    feature: requiredIdentifier(value.feature, `${field}.feature`),
    evidenceClass: requiredEnum(value.evidenceClass, EVIDENCE_CLASS_SET, `${field}.evidenceClass`),
    requiredEnvironment: requiredArray(value.requiredEnvironment, `${field}.requiredEnvironment`),
    requiredDeviceOrProvider: requiredArray(
      value.requiredDeviceOrProvider,
      `${field}.requiredDeviceOrProvider`,
    ),
    requiredScenario: requiredIdentifier(value.requiredScenario, `${field}.requiredScenario`),
    targetPlatform: requiredArray(value.targetPlatform, `${field}.targetPlatform`),
    bindingRequirements: bindingRequirements(value.bindingRequirements, `${field}.bindingRequirements`),
    initialStatus: requiredEnum(value.initialStatus, REQUIREMENT_STATUSES, `${field}.initialStatus`),
    revalidationPolicy: revalidationPolicy(value.revalidationPolicy, `${field}.revalidationPolicy`),
    ownerRole: requiredIdentifier(value.ownerRole, `${field}.ownerRole`),
    reviewerRole: requiredIdentifier(value.reviewerRole, `${field}.reviewerRole`),
    notes: safeNotes(value.notes, `${field}.notes`),
  };
}

function submission(value, index) {
  const field = `submissions[${index}]`;
  exactFields(value, SUBMISSION_FIELDS, field);
  const status = requiredEnum(value.status, SUBMISSION_STATUSES, `${field}.status`);
  const approvalDecision = requiredEnum(
    value.approvalDecision,
    APPROVAL_DECISIONS,
    `${field}.approvalDecision`,
  );
  if (status === 'accepted' && approvalDecision !== 'accepted') {
    fail(`${field} accepted status requires an accepted approvalDecision.`);
  }
  if (status === 'rejected' && approvalDecision !== 'rejected') {
    fail(`${field} rejected status requires a rejected approvalDecision.`);
  }
  return {
    evidenceId: requiredIdentifier(value.evidenceId, `${field}.evidenceId`),
    status,
    evidenceClass: requiredEnum(value.evidenceClass, EVIDENCE_CLASS_SET, `${field}.evidenceClass`),
    environment: requiredArray(value.environment, `${field}.environment`),
    deviceOrProvider: requiredArray(value.deviceOrProvider, `${field}.deviceOrProvider`),
    scenario: requiredIdentifier(value.scenario, `${field}.scenario`),
    targetPlatform: requiredArray(value.targetPlatform, `${field}.targetPlatform`),
    buildSha: sha(value.buildSha, `${field}.buildSha`, true),
    buildArtifactDigest: digest(value.buildArtifactDigest, `${field}.buildArtifactDigest`, true),
    migrationDigest: digest(value.migrationDigest, `${field}.migrationDigest`, true),
    providerEnvironment: nullableIdentifier(value.providerEnvironment, `${field}.providerEnvironment`),
    deviceModel: nullableIdentifier(value.deviceModel, `${field}.deviceModel`),
    collectionDate: timestamp(value.collectionDate, `${field}.collectionDate`),
    expiresAt: timestamp(value.expiresAt, `${field}.expiresAt`, true),
    artifactDigest: digest(value.artifactDigest, `${field}.artifactDigest`),
    artifactReference: requiredIdentifier(value.artifactReference, `${field}.artifactReference`),
    artifactKind: requiredEnum(value.artifactKind, ARTIFACT_KINDS, `${field}.artifactKind`),
    reviewerRole: requiredIdentifier(value.reviewerRole, `${field}.reviewerRole`),
    approvalDecision,
    notes: safeNotes(value.notes, `${field}.notes`),
  };
}

function productionApproval(value) {
  exactFields(value, PRODUCTION_APPROVAL_FIELDS, 'productionApproval');
  const status = requiredEnum(value.status, PRODUCTION_APPROVAL_STATUSES, 'productionApproval.status');
  const decision = requiredEnum(
    value.decision,
    PRODUCTION_APPROVAL_DECISIONS,
    'productionApproval.decision',
  );
  if (status === 'accepted' && decision !== 'accepted') {
    fail('accepted productionApproval status requires an accepted decision.');
  }
  if (decision === 'accepted' && status !== 'accepted') {
    fail('accepted productionApproval decision requires accepted status.');
  }
  if (status === 'accepted' && (
    value.reviewedAt == null || value.artifactDigest == null || value.artifactReference == null
  )) {
    fail('accepted productionApproval requires reviewedAt and artifact binding.');
  }
  return {
    status,
    decision,
    ownerRole: requiredIdentifier(value.ownerRole, 'productionApproval.ownerRole'),
    reviewerRole: requiredIdentifier(value.reviewerRole, 'productionApproval.reviewerRole'),
    reviewedAt: timestamp(value.reviewedAt, 'productionApproval.reviewedAt', true),
    artifactDigest: digest(value.artifactDigest, 'productionApproval.artifactDigest', true),
    artifactReference: nullableIdentifier(value.artifactReference, 'productionApproval.artifactReference'),
    notes: safeNotes(value.notes, 'productionApproval.notes'),
  };
}

export function validateReleaseEvidenceRegistry(value) {
  exactFields(value, REGISTRY_FIELDS, 'registry');
  if (value.schemaVersion !== 1) fail('schemaVersion must be 1.');
  if (value.resultContract !== RELEASE_EVIDENCE_REGISTRY_CONTRACT) {
    fail(`resultContract must be ${RELEASE_EVIDENCE_REGISTRY_CONTRACT}.`);
  }
  if (!Array.isArray(value.requirements) || value.requirements.length === 0) {
    fail('requirements must be a non-empty array.');
  }
  if (!Array.isArray(value.submissions)) fail('submissions must be an array.');

  const requirements = value.requirements.map(requirement);
  const requirementIds = requirements.map((entry) => entry.evidenceId);
  if (new Set(requirementIds).size !== requirementIds.length) fail('requirements contain duplicate evidence IDs.');

  const submissions = value.submissions.map(submission);
  const submissionIds = submissions.map((entry) => entry.evidenceId);
  if (new Set(submissionIds).size !== submissionIds.length) {
    fail('submissions contain duplicate evidence IDs; v1 accepts one canonical submission per requirement.');
  }
  for (const evidence of submissions) {
    if (!requirementIds.includes(evidence.evidenceId)) {
      fail(`submission ${evidence.evidenceId} does not match a declared requirement.`);
    }
  }

  return Object.freeze({
    schemaVersion: 1,
    resultContract: RELEASE_EVIDENCE_REGISTRY_CONTRACT,
    registryVersion: requiredIdentifier(value.registryVersion, 'registryVersion'),
    productionApproval: productionApproval(value.productionApproval),
    requirements: Object.freeze(requirements),
    submissions: Object.freeze(submissions),
  });
}

function validateTarget(value) {
  exactFields(value, TARGET_FIELDS, 'target');
  return {
    buildSha: sha(value.buildSha, 'target.buildSha', true),
    buildArtifactDigest: digest(value.buildArtifactDigest, 'target.buildArtifactDigest', true),
    migrationDigest: digest(value.migrationDigest, 'target.migrationDigest', true),
    providerEnvironment: nullableIdentifier(value.providerEnvironment, 'target.providerEnvironment'),
  };
}

function includesAll(actual, expected) {
  return expected.every((entry) => actual.includes(entry));
}

function expiryFor(requirementEntry, evidence) {
  const collectedAt = Date.parse(evidence.collectionDate);
  const policyExpiry = collectedAt + requirementEntry.revalidationPolicy.maxAgeDays * 86_400_000;
  const explicitExpiry = evidence.expiresAt == null ? Number.POSITIVE_INFINITY : Date.parse(evidence.expiresAt);
  return Math.min(policyExpiry, explicitExpiry);
}

function unresolvedResult(requirementEntry, evidence, status, reasonCode) {
  return {
    evidenceId: requirementEntry.evidenceId,
    capability: requirementEntry.capability,
    feature: requirementEntry.feature,
    evidenceClass: requirementEntry.evidenceClass,
    status,
    resolved: false,
    reasonCode,
    requiredScenario: requirementEntry.requiredScenario,
    targetPlatform: requirementEntry.targetPlatform,
    ownerRole: requirementEntry.ownerRole,
    reviewerRole: requirementEntry.reviewerRole,
    collectionDate: evidence?.collectionDate ?? null,
    expiresAt: evidence?.expiresAt ?? null,
    artifactDigest: evidence?.artifactDigest ?? null,
    artifactReference: evidence?.artifactReference ?? null,
    observedBuildSha: evidence?.buildSha ?? null,
    notes: requirementEntry.notes,
  };
}

function evaluateRequirement(requirementEntry, evidence, targetValue, now) {
  if (!evidence) {
    return unresolvedResult(
      requirementEntry,
      null,
      requirementEntry.initialStatus,
      requirementEntry.initialStatus === 'planned' ? 'evidence_planned' : 'evidence_missing',
    );
  }
  if (evidence.artifactKind === 'static_declaration') {
    return unresolvedResult(requirementEntry, evidence, evidence.status, 'static_declaration_only');
  }
  if (evidence.evidenceClass !== requirementEntry.evidenceClass) {
    return unresolvedResult(requirementEntry, evidence, evidence.status, 'evidence_class_mismatch');
  }
  if (evidence.scenario !== requirementEntry.requiredScenario) {
    return unresolvedResult(requirementEntry, evidence, evidence.status, 'evidence_scenario_mismatch');
  }
  if (!includesAll(evidence.environment, requirementEntry.requiredEnvironment)) {
    return unresolvedResult(requirementEntry, evidence, evidence.status, 'evidence_environment_mismatch');
  }
  if (!includesAll(evidence.deviceOrProvider, requirementEntry.requiredDeviceOrProvider)) {
    return unresolvedResult(requirementEntry, evidence, evidence.status, 'evidence_device_provider_mismatch');
  }
  if (!includesAll(evidence.targetPlatform, requirementEntry.targetPlatform)) {
    return unresolvedResult(requirementEntry, evidence, evidence.status, 'evidence_platform_mismatch');
  }
  if (evidence.reviewerRole !== requirementEntry.reviewerRole) {
    return unresolvedResult(requirementEntry, evidence, evidence.status, 'evidence_reviewer_mismatch');
  }
  if (evidence.status === 'rejected' || evidence.approvalDecision === 'rejected') {
    return unresolvedResult(requirementEntry, evidence, 'rejected', 'evidence_rejected');
  }
  if (evidence.status === 'expired' || expiryFor(requirementEntry, evidence) <= now.getTime()) {
    return unresolvedResult(requirementEntry, evidence, 'expired', 'evidence_expired');
  }
  if (evidence.status !== 'accepted' || evidence.approvalDecision !== 'accepted') {
    return unresolvedResult(requirementEntry, evidence, evidence.status, 'evidence_not_accepted');
  }

  for (const field of ['buildSha', 'buildArtifactDigest', 'migrationDigest', 'providerEnvironment']) {
    if (requirementEntry.bindingRequirements[field] !== 'required') continue;
    if (targetValue[field] == null) {
      return unresolvedResult(requirementEntry, evidence, evidence.status, `target_${field}_missing`);
    }
    if (evidence[field] !== targetValue[field]) {
      const reasonByField = {
        buildSha: 'evidence_build_mismatch',
        buildArtifactDigest: 'evidence_build_artifact_mismatch',
        migrationDigest: 'evidence_migration_mismatch',
        providerEnvironment: 'evidence_provider_environment_mismatch',
      };
      return unresolvedResult(requirementEntry, evidence, evidence.status, reasonByField[field]);
    }
  }
  if (requirementEntry.bindingRequirements.deviceModel === 'required' && evidence.deviceModel == null) {
    return unresolvedResult(requirementEntry, evidence, evidence.status, 'evidence_device_model_missing');
  }

  return {
    ...unresolvedResult(requirementEntry, evidence, 'accepted', 'evidence_accepted'),
    resolved: true,
  };
}

function sortedIds(entries, predicate) {
  return entries.filter(predicate).map((entry) => entry.evidenceId).sort();
}

export function evaluateReleaseEvidenceRegistry({ registry, target, now = new Date() }) {
  const validated = validateReleaseEvidenceRegistry(registry);
  const targetValue = validateTarget(target);
  const nowValue = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(nowValue.getTime())) fail('now must be a valid date.');
  const byId = new Map(validated.submissions.map((entry) => [entry.evidenceId, entry]));
  const requirements = validated.requirements
    .map((entry) => evaluateRequirement(entry, byId.get(entry.evidenceId), targetValue, nowValue))
    .sort((left, right) => left.evidenceId.localeCompare(right.evidenceId));
  const unresolvedEvidenceIds = sortedIds(requirements, (entry) => !entry.resolved);
  const acceptedEvidenceIds = sortedIds(requirements, (entry) => entry.resolved);
  const missingEvidenceIds = sortedIds(requirements, (entry) => entry.status === 'missing');
  const plannedEvidenceIds = sortedIds(requirements, (entry) => entry.status === 'planned');
  const collectedEvidenceIds = sortedIds(requirements, (entry) => entry.status === 'collected');
  const expiredEvidenceIds = sortedIds(requirements, (entry) => entry.status === 'expired');
  const rejectedEvidenceIds = sortedIds(requirements, (entry) => entry.status === 'rejected');
  const wrongBuildEvidenceIds = sortedIds(requirements, (entry) => [
    'evidence_build_mismatch',
    'evidence_build_artifact_mismatch',
  ].includes(entry.reasonCode));
  const ownerApprovalsPendingIds = sortedIds(requirements, (entry) => (
    entry.evidenceClass === 'owner_approval' && !entry.resolved
  ));

  return Object.freeze({
    schemaVersion: 1,
    resultContract: RELEASE_EVIDENCE_REPORT_CONTRACT,
    registryVersion: validated.registryVersion,
    generatedAt: nowValue.toISOString(),
    target: targetValue,
    productionApproval: validated.productionApproval,
    status: unresolvedEvidenceIds.length === 0 ? 'passed' : 'blocked_external',
    safeCode: unresolvedEvidenceIds.length === 0
      ? 'release_evidence_complete'
      : 'release_evidence_missing',
    summary: {
      requirementCount: requirements.length,
      acceptedCount: acceptedEvidenceIds.length,
      unresolvedCount: unresolvedEvidenceIds.length,
      missingCount: missingEvidenceIds.length,
      expiredCount: expiredEvidenceIds.length,
      rejectedCount: rejectedEvidenceIds.length,
      wrongBuildCount: wrongBuildEvidenceIds.length,
      ownerApprovalPendingCount: ownerApprovalsPendingIds.length,
    },
    unresolvedEvidenceIds,
    missingEvidenceIds,
    plannedEvidenceIds,
    collectedEvidenceIds,
    expiredEvidenceIds,
    wrongBuildEvidenceIds,
    acceptedEvidenceIds,
    rejectedEvidenceIds,
    ownerApprovalsPendingIds,
    requirements: Object.freeze(requirements),
  });
}
