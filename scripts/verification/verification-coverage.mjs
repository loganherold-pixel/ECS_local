export const VERIFICATION_COVERAGE_STATES = Object.freeze([
  'declared',
  'scheduled',
  'executed',
  'passed',
  'behavioral_verified',
  'contract_verified',
  'evidence_verified',
  'provisional',
  'unsupported',
  'mismatch',
]);

export const VERIFICATION_EVIDENCE_CLASSES = Object.freeze([
  'behavioral',
  'source_contract',
  'workflow_contract',
  'schema_or_static',
  'evidence_only',
  'provider_shadow',
  'hardware_or_device',
  'manual_field',
  'unknown',
]);

export const VERIFICATION_EXECUTION_ENVIRONMENTS = Object.freeze([
  'deterministic_ci',
  'mock_only',
  'uncontrolled_network',
  'provider_shadow',
  'real_provider',
  'real_device',
  'multi_client',
  'manual_field',
  'static',
  'unknown',
]);

const RESULT_STATUSES = new Set(['passed', 'blocked_external', 'failed']);
const CONTRACT_CLASSES = new Set(['source_contract', 'workflow_contract', 'schema_or_static']);
const EVIDENCE_CLASSES = new Set(VERIFICATION_EVIDENCE_CLASSES);

function sortedUnique(values) {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function resultValidation(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return 'result_not_object';
  if (typeof result.checkId !== 'string' || !result.checkId.trim()) return 'result_check_id_invalid';
  if (!RESULT_STATUSES.has(result.status)) return 'result_status_invalid';
  if (result.durationMs !== undefined && (!Number.isFinite(result.durationMs) || result.durationMs < 0)) {
    return 'result_duration_invalid';
  }
  return null;
}

function observedEvidenceClass(check, script) {
  if (check.workflow) return check.evidenceClass ?? 'workflow_contract';
  if (!script) return 'unknown';
  if (script.executionModel === 'evidence_only') return 'evidence_only';
  if (script.executionModel === 'source_contract') return 'source_contract';
  if (script.executionModel === 'tool_execution') return 'schema_or_static';
  if (['runtime_behavior', 'hybrid'].includes(script.executionModel)) {
    if (check.evidenceClass === 'provider_shadow') return 'provider_shadow';
    if (check.evidenceClass === 'hardware_or_device') return 'hardware_or_device';
    if (check.evidenceClass === 'manual_field') return 'manual_field';
    return 'behavioral';
  }
  return 'unknown';
}

function checkReference(check) {
  return {
    checkId: check.id,
    qualifiedIdentity: check.scriptIdentity ?? check.workflow ?? `check:${check.id}`,
    evidenceClass: check.evidenceClass ?? 'unknown',
    evidenceQuality: check.evidenceQuality ?? 'provisional',
    executionEnvironment: check.executionEnvironment ?? 'unknown',
  };
}

function evidenceRegistrationIssues({ capability, requirement, check, script }) {
  const issues = [];
  const warnings = [];
  if (!check) return { issues: [{ code: 'missing_registered_check', reason: 'registered_check_missing' }], warnings };
  if (check.capabilityWildcard) {
    issues.push({ code: 'wildcard_only_registration', reason: 'wildcard_only_registration' });
  }
  if (!check.capabilities?.includes(capability.id)) {
    issues.push({ code: 'capability_registration_mismatch', reason: `check_capability_mismatch:${check.id}` });
  }
  if (!check.scenarios?.includes(requirement.id)) {
    issues.push({ code: 'scenario_registration_mismatch', reason: `check_scenario_mismatch:${check.id}` });
  }
  if (check.evidenceQuality !== 'authoritative') {
    issues.push({ code: 'provisional_check', reason: `authoritative_registration_required:${check.id}` });
  }
  if (!EVIDENCE_CLASSES.has(check.evidenceClass) || check.evidenceClass === 'unknown') {
    issues.push({ code: 'unknown_evidence_class', reason: `evidence_class_unknown:${check.id}` });
  }
  if (check.scriptIdentity && !/^[^:]+::.+/.test(check.scriptIdentity)) {
    issues.push({ code: 'unqualified_check_identity', reason: `qualified_check_identity_required:${check.id}` });
  }

  const observedClass = observedEvidenceClass(check, script);
  if (check.evidenceClass === 'behavioral' && ['source_contract', 'evidence_only', 'schema_or_static', 'unknown'].includes(observedClass)) {
    issues.push({ code: 'execution_class_conflict', reason: `behavioral_execution_not_observed:${check.id}` });
  }
  if (check.evidenceClass === 'source_contract' && !['source_contract', 'behavioral'].includes(observedClass)) {
    issues.push({ code: 'execution_class_conflict', reason: `source_contract_execution_not_observed:${check.id}` });
  }
  if (check.evidenceClass === 'workflow_contract' && !check.workflow) {
    issues.push({ code: 'execution_class_conflict', reason: `workflow_contract_target_missing:${check.id}` });
  }
  if (check.evidenceClass === 'evidence_only' && check.resultContract !== 'ecs-evidence-v1') {
    issues.push({ code: 'execution_class_conflict', reason: `evidence_result_contract_missing:${check.id}` });
  }
  if (check.evidenceClass === 'behavioral' && script) {
    if (script.executesAssertions !== true) {
      issues.push({ code: 'assertions_not_observed', reason: `runtime_assertions_not_observed:${check.id}` });
    }
    if (script.importsRuntimeCode !== true) {
      issues.push({ code: 'runtime_target_not_observed', reason: `runtime_target_execution_not_observed:${check.id}` });
    }
  }
  if (script?.executionModel === 'source_contract') warnings.push(`source_string_only:${check.id}`);
  if (script?.usesFixturesOrMocks) warnings.push(`mock_or_fixture_signal:${check.id}`);
  if (script?.networkDependency === 'real_or_uncontrolled'
    && check.executionEnvironment !== 'uncontrolled_network') {
    warnings.push(`uncontrolled_network_signal_review:${check.id}`);
  }
  if (script?.executesAssertions === false) warnings.push(`assertions_not_detected:${check.id}`);
  if (script?.importsRuntimeCode === false) warnings.push(`target_runtime_import_not_detected:${check.id}`);

  if (requirement.deterministicCi && check.executionEnvironment === 'uncontrolled_network') {
    issues.push({ code: 'uncontrolled_network', reason: 'deterministic_execution_required' });
  }
  if (requirement.requiresLiveProvider && check.executionEnvironment !== 'real_provider') {
    issues.push({
      code: check.executionEnvironment === 'mock_only' ? 'mock_only_live_requirement' : 'live_provider_required',
      reason: 'live_provider_evidence_required',
    });
  }
  if (requirement.requiresRealDevice && check.executionEnvironment !== 'real_device') {
    issues.push({ code: 'real_device_required', reason: 'real_device_evidence_required' });
  }
  if (requirement.requiresMultiClient && check.executionEnvironment !== 'multi_client') {
    issues.push({
      code: check.executionEnvironment === 'mock_only' ? 'mock_only_multi_client_requirement' : 'multi_client_required',
      reason: 'real_multi_client_evidence_required',
    });
  }
  if (requirement.requiresManualField && check.executionEnvironment !== 'manual_field') {
    issues.push({ code: 'manual_field_required', reason: 'manual_field_evidence_required' });
  }
  return { issues, warnings };
}

function verificationState(requiredClasses) {
  if (requiredClasses.length === 1 && requiredClasses[0] === 'behavioral') return 'behavioral_verified';
  if (requiredClasses.every((entry) => CONTRACT_CLASSES.has(entry))) return 'contract_verified';
  return 'evidence_verified';
}

function confidenceForState(state) {
  if (state.endsWith('_verified')) return 'verified';
  if (state === 'passed') return 'partial';
  if (['declared', 'scheduled', 'executed', 'provisional'].includes(state)) return 'provisional';
  return 'none';
}

function evaluateScenario({
  capability,
  requirement,
  checksById,
  scriptsByCheckId,
  selectedSet,
  validResults,
  invalidResults,
  phase,
  laneId,
}) {
  const requiredClasses = sortedUnique(requirement.requiredEvidenceClasses ?? []);
  const declared = (requirement.checkIds ?? []).map((checkId) => checksById.get(checkId)).filter(Boolean);
  const selected = declared.filter((entry) => selectedSet.has(entry.id));
  const executed = selected.filter((entry) => validResults.has(entry.id));
  const passing = executed.filter((entry) => validResults.get(entry.id)?.status === 'passed');
  const coverageStates = [];
  const remainingEvidence = [];
  const strictFailures = [];
  const warnings = [];

  if ((requirement.checkIds ?? []).length > 0) coverageStates.push('declared');
  if (selected.length > 0) coverageStates.push('scheduled');
  if (executed.length > 0) coverageStates.push('executed');
  if (passing.length > 0) coverageStates.push('passed');

  const eligiblePassing = [];
  for (const checkId of requirement.checkIds ?? []) {
    const registeredCheck = checksById.get(checkId);
    const registration = evidenceRegistrationIssues({
      capability,
      requirement,
      check: registeredCheck,
      script: scriptsByCheckId.get(checkId),
    });
    warnings.push(...registration.warnings);
    for (const issue of registration.issues) {
      remainingEvidence.push(issue.reason);
      strictFailures.push({
        code: issue.code,
        capabilityId: capability.id,
        scenarioId: requirement.id,
        checkId,
        reason: issue.reason,
        phase: 'registration',
      });
    }
    if (registeredCheck && registration.issues.length === 0 && passing.some((entry) => entry.id === checkId)) {
      eligiblePassing.push(registeredCheck);
    }
  }

  if ((requirement.checkIds ?? []).length === 0) {
    remainingEvidence.push('explicit_qualified_check_required');
    strictFailures.push({
      code: 'unsupported_scenario',
      capabilityId: capability.id,
      scenarioId: requirement.id,
      checkId: null,
      reason: 'explicit_qualified_check_required',
      phase: 'registration',
    });
  }

  if (phase === 'planned') remainingEvidence.push('execution_result_required');
  if (phase === 'executed') {
    for (const check of selected) {
      if (invalidResults.has(check.id)) {
        const reason = `malformed_check_result:${check.id}`;
        remainingEvidence.push(reason);
        strictFailures.push({
          code: 'malformed_execution_result',
          capabilityId: capability.id,
          scenarioId: requirement.id,
          checkId: check.id,
          reason,
          phase: 'execution',
        });
      } else if (!validResults.has(check.id)) {
        const reason = `selected_check_result_missing:${check.id}`;
        remainingEvidence.push(reason);
        strictFailures.push({
          code: 'missing_execution_result',
          capabilityId: capability.id,
          scenarioId: requirement.id,
          checkId: check.id,
          reason,
          phase: 'execution',
        });
      } else if (validResults.get(check.id).status === 'failed') {
        const reason = `required_check_failed:${check.id}`;
        remainingEvidence.push(reason);
        strictFailures.push({
          code: 'required_check_failed',
          capabilityId: capability.id,
          scenarioId: requirement.id,
          checkId: check.id,
          reason,
          phase: 'execution',
        });
      } else if (validResults.get(check.id).status === 'blocked_external') {
        remainingEvidence.push(`required_check_blocked_external:${check.id}`);
      }
    }
    if (selected.length === 0) {
      remainingEvidence.push('required_check_not_selected');
      strictFailures.push({
        code: 'required_check_not_selected',
        capabilityId: capability.id,
        scenarioId: requirement.id,
        checkId: null,
        reason: 'required_check_not_selected',
        phase: 'execution',
      });
    }
  }

  const verifiedEvidenceClasses = sortedUnique(eligiblePassing.map((entry) => entry.evidenceClass));
  for (const requiredClass of requiredClasses) {
    if (!verifiedEvidenceClasses.includes(requiredClass)) {
      const reason = `required_evidence_class_missing:${requiredClass}`;
      remainingEvidence.push(reason);
      if (phase === 'executed') {
        strictFailures.push({
          code: 'required_evidence_missing',
          capabilityId: capability.id,
          scenarioId: requirement.id,
          checkId: null,
          reason,
          phase: 'execution',
        });
      }
    }
  }

  const coverageSatisfied = requiredClasses.length > 0
    && requiredClasses.every((entry) => verifiedEvidenceClasses.includes(entry));
  let state;
  if (coverageSatisfied) {
    state = verificationState(requiredClasses);
    coverageStates.push(state);
  } else if ((requirement.checkIds ?? []).length === 0 || declared.length === 0) {
    state = 'unsupported';
    coverageStates.push(state);
  } else if (strictFailures.some((entry) => entry.code === 'provisional_check')) {
    state = 'provisional';
    coverageStates.push(state);
  } else if (strictFailures.some((entry) => [
    'wildcard_only_registration',
    'capability_registration_mismatch',
    'scenario_registration_mismatch',
    'unknown_evidence_class',
    'unqualified_check_identity',
    'execution_class_conflict',
    'assertions_not_observed',
    'runtime_target_not_observed',
    'missing_execution_result',
    'malformed_execution_result',
  ].includes(entry.code))) {
    state = 'mismatch';
    coverageStates.push(state);
  } else if (passing.length > 0) {
    state = 'passed';
  } else if (executed.length > 0) {
    state = 'executed';
  } else if (selected.length > 0) {
    state = 'scheduled';
  } else {
    state = 'declared';
  }

  const enforced = laneId == null
    || (requirement.enforcedLanes ?? []).length === 0
    || requirement.enforcedLanes.includes(laneId);
  return {
    scenarioId: requirement.id,
    requiredEvidenceClasses: requiredClasses,
    declaredChecks: declared.map(checkReference),
    selectedChecks: selected.map((entry) => entry.id).sort(),
    executedChecks: executed.map((entry) => entry.id).sort(),
    passingChecks: passing.map((entry) => entry.id).sort(),
    verifiedEvidenceClasses,
    coverageStates: sortedUnique(coverageStates).sort((left, right) =>
      VERIFICATION_COVERAGE_STATES.indexOf(left) - VERIFICATION_COVERAGE_STATES.indexOf(right)),
    state,
    coverageSatisfied,
    confidenceLevel: confidenceForState(state),
    remainingEvidence: sortedUnique(remainingEvidence),
    warnings: sortedUnique(warnings),
    reason: coverageSatisfied
      ? `All required evidence classes passed with authoritative executed checks.`
      : sortedUnique(remainingEvidence).join('; ') || 'Coverage is not verified.',
    enforced,
    strictFailures,
  };
}

export function buildVerificationCoverageMatrix(options) {
  const policy = options?.policy;
  if (!policy || !Array.isArray(policy.capabilities) || !Array.isArray(policy.checks)) {
    throw new Error('Verification coverage requires a validated policy.');
  }
  const phase = options.phase === 'executed' ? 'executed' : 'planned';
  const selectedSet = new Set(Array.isArray(options.selectedCheckIds) ? options.selectedCheckIds : []);
  const checksById = new Map(policy.checks.map((entry) => [entry.id, entry]));
  const scriptsByCheckId = new Map((options.scripts ?? [])
    .filter((entry) => entry?.policyCheckId)
    .map((entry) => [entry.policyCheckId, entry]));
  const validResults = new Map();
  const invalidResults = new Map();
  for (const result of options.results ?? []) {
    const reason = resultValidation(result);
    const checkId = typeof result?.checkId === 'string' && result.checkId.trim()
      ? result.checkId.trim()
      : '__malformed_result__';
    if (reason || validResults.has(checkId) || invalidResults.has(checkId)) {
      invalidResults.set(checkId, reason ?? 'duplicate_result');
      validResults.delete(checkId);
    } else {
      validResults.set(checkId, result);
    }
  }

  const capabilities = policy.capabilities.map((capability) => {
    const scenarios = (capability.scenarioRequirements ?? []).map((scenarioRequirement) => evaluateScenario({
      capability,
      requirement: scenarioRequirement,
      checksById,
      scriptsByCheckId,
      selectedSet,
      validResults,
      invalidResults,
      phase,
      laneId: options.laneId ?? null,
    }));
    const satisfiedScenarioCount = scenarios.filter((entry) => entry.coverageSatisfied).length;
    const enforcedScenarios = scenarios.filter((entry) => entry.enforced);
    const strictFailureCount = enforcedScenarios.reduce((sum, entry) => sum + entry.strictFailures.length, 0);
    return {
      capabilityId: capability.id,
      label: capability.label,
      phase,
      scenarios,
      scenarioCount: scenarios.length,
      satisfiedScenarioCount,
      coverageSatisfied: scenarios.length > 0 && satisfiedScenarioCount === scenarios.length,
      confidenceLevel: scenarios.length > 0 && satisfiedScenarioCount === scenarios.length
        ? 'verified'
        : satisfiedScenarioCount > 0
          ? 'partial'
          : scenarios.some((entry) => ['declared', 'scheduled', 'executed', 'provisional'].includes(entry.state))
            ? 'provisional'
            : 'none',
      remainingEvidence: sortedUnique(scenarios.flatMap((entry) => entry.remainingEvidence)),
      strictFailureCount,
      possibleExternalBlockerIds: sortedUnique(capability.evidenceBlockers ?? []),
      productionApproval: 'not_granted_by_coverage_matrix',
    };
  });
  const strictFailures = capabilities.flatMap((capability) => capability.scenarios
    .filter((scenario) => scenario.enforced)
    .flatMap((scenario) => scenario.strictFailures));
  return {
    schemaVersion: 1,
    phase,
    laneId: options.laneId ?? null,
    capabilities,
    summary: {
      capabilityCount: capabilities.length,
      scenarioCount: capabilities.reduce((sum, entry) => sum + entry.scenarioCount, 0),
      satisfiedScenarioCount: capabilities.reduce((sum, entry) => sum + entry.satisfiedScenarioCount, 0),
      strictFailureCount: strictFailures.length,
      provisionalScenarioCount: capabilities.reduce((sum, entry) =>
        sum + entry.scenarios.filter((scenario) => scenario.state === 'provisional').length, 0),
      mismatchScenarioCount: capabilities.reduce((sum, entry) =>
        sum + entry.scenarios.filter((scenario) => scenario.state === 'mismatch').length, 0),
    },
    productionApproval: 'not_granted_by_coverage_matrix',
  };
}

export function collectCoverageStrictFailures(matrix, options = {}) {
  if (!matrix || !Array.isArray(matrix.capabilities)) {
    return [{
      code: 'coverage_matrix_missing',
      capabilityId: null,
      scenarioId: null,
      checkId: null,
      reason: 'coverage_matrix_missing_or_malformed',
      phase: 'schema',
    }];
  }
  const requireExecution = options.requireExecution ?? matrix.phase === 'executed';
  return matrix.capabilities.flatMap((capability) => capability.scenarios
    .filter((scenario) => scenario.enforced)
    .flatMap((scenario) => scenario.strictFailures)
    .filter((failure) => requireExecution || failure.phase !== 'execution'));
}
