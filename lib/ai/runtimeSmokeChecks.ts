import type {
  ECSDispersedCampingRuntimeCandidatePin,
  ECSDispersedCampingRuntimeSmokeSnapshot,
  ECSRuntimeContradiction,
  ECSRuntimeSmokeCommandSnapshot,
  ECSRuntimeSmokeShellSnapshot,
} from './runtimeContradictionTypes';
import {
  EXPEDITION_READINESS_CATEGORY_IDS,
  type ExpeditionReadinessAssessment,
} from '../readiness/expeditionReadinessTypes';
import {
  buildReadinessExplanationPayload,
  validateReadinessExplanationOutput,
  type ECSReadinessExplanationValidationIssue,
} from './readinessExplanationGuardrails';

function addMarker(markers: Set<string>, value: string | null | undefined): void {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized) {
    markers.add(normalized.replace(/\s+/g, '_'));
  }
}

function pushContradiction(
  contradictions: ECSRuntimeContradiction[],
  next: ECSRuntimeContradiction,
): void {
  const duplicate = contradictions.some((current) => {
    return current.code === next.code
      && (current.rootKey ?? null) === (next.rootKey ?? null)
      && current.message === next.message;
  });

  if (!duplicate) {
    contradictions.push(next);
  }
}

function isRestrictedDispersedCampingCandidate(
  candidate: ECSDispersedCampingRuntimeCandidatePin,
): boolean {
  const landManager = String(candidate.landManager ?? '').toUpperCase();
  const confidence = String(candidate.confidence ?? '').toLowerCase();
  return (
    candidate.isRestricted === true ||
    confidence === 'restricted' ||
    landManager === 'PRIVATE' ||
    landManager === 'TRIBAL' ||
    landManager === 'MILITARY'
  );
}

function hasVerificationWarning(candidate: ECSDispersedCampingRuntimeCandidatePin): boolean {
  const warning = String(candidate.verificationWarning ?? '').toLowerCase();
  return (
    warning.includes('verify') &&
    (warning.includes('closures') || warning.includes('fire restrictions') || warning.includes('permits'))
  );
}

function isFreshnessLabelHonest(snapshot: ECSDispersedCampingRuntimeSmokeSnapshot): boolean {
  const state = snapshot.dataFreshnessState ?? null;
  if (state !== 'stale' && state !== 'cached' && state !== 'unavailable') return true;
  const label = String(snapshot.dataFreshnessLabel ?? '').toLowerCase();
  return label.includes('stale') || label.includes('cached') || label.includes('unavailable') || label.includes('limited');
}

export function detectDispersedCampingRuntimeContradictions(
  snapshot: ECSDispersedCampingRuntimeSmokeSnapshot | null | undefined,
): ECSRuntimeContradiction[] {
  const contradictions: ECSRuntimeContradiction[] = [];
  if (!snapshot) return contradictions;

  if ((snapshot.layerEnabled || snapshot.toggleVisible) && !snapshot.betaFlagEnabled) {
    pushContradiction(contradictions, {
      code: 'dispersed_camping_beta_flag_bypass',
      severity: 'error',
      message: 'Dispersed Camping Eligibility is visible or enabled without the internal/beta feature flag.',
    });
  }

  if (snapshot.layerEnabled && !snapshot.sourceLoaded && !snapshot.unavailableStateVisible) {
    pushContradiction(contradictions, {
      code: 'dispersed_camping_layer_missing_source',
      severity: 'error',
      message: 'Dispersed Camping Eligibility layer is enabled but no source is loaded and no unavailable state is visible.',
    });
  }

  if (snapshot.layerEnabled && snapshot.sourceLoaded && (!snapshot.fillLayerPresent || !snapshot.outlineLayerPresent)) {
    pushContradiction(contradictions, {
      code: 'dispersed_camping_layer_partial',
      severity: 'error',
      message: 'Dispersed Camping Eligibility source is loaded without both fill and outline layers.',
    });
  }

  if (snapshot.selectedRegionSheetVisible && !snapshot.selectedRegionId) {
    pushContradiction(contradictions, {
      code: 'dispersed_camping_selected_region_stale',
      severity: 'warning',
      message: 'Dispersed Camping Eligibility region sheet is open without a selected region.',
    });
  }

  if (snapshot.routeAwareSummaryVisible && !snapshot.routeExists) {
    pushContradiction(contradictions, {
      code: 'dispersed_camping_route_summary_without_route',
      severity: 'warning',
      message: 'Dispersed Camping route-aware summary is visible without a previewed or active route.',
    });
  }

  if (
    snapshot.candidatePinCount > 0 &&
    snapshot.candidateGenerationTrigger &&
    snapshot.candidateGenerationTrigger !== 'explicit_user_action'
  ) {
    pushContradiction(contradictions, {
      code: 'dispersed_camping_candidate_auto_generated',
      severity: 'error',
      message: 'ECS-inferred camp candidate pins were generated without explicit user action.',
      detail: snapshot.candidateGenerationTrigger,
    });
  }

  if (snapshot.candidatePinCount > 5 || snapshot.candidatePins.length > 5) {
    pushContradiction(contradictions, {
      code: 'dispersed_camping_candidate_limit_exceeded',
      severity: 'warning',
      message: 'Dispersed Camping candidate pins exceed the compact release limit.',
      detail: String(Math.max(snapshot.candidatePinCount, snapshot.candidatePins.length)),
    });
  }

  const restrictedCandidate = snapshot.candidatePins.find(isRestrictedDispersedCampingCandidate);
  if (restrictedCandidate) {
    pushContradiction(contradictions, {
      code: 'dispersed_camping_candidate_restricted_land',
      severity: 'error',
      message: 'ECS-inferred camp candidate pin is on restricted/private/tribal/military land.',
      detail: restrictedCandidate.id ?? restrictedCandidate.regionId ?? null,
    });
  }

  const missingWarningCandidate = snapshot.candidatePins.find((candidate) => !hasVerificationWarning(candidate));
  if (missingWarningCandidate) {
    pushContradiction(contradictions, {
      code: 'dispersed_camping_candidate_missing_warning',
      severity: 'error',
      message: 'ECS-inferred camp candidate is missing the required verification warning.',
      detail: missingWarningCandidate.id ?? missingWarningCandidate.regionId ?? null,
    });
  }

  if (!isFreshnessLabelHonest(snapshot)) {
    pushContradiction(contradictions, {
      code: 'dispersed_camping_stale_data_unlabeled',
      severity: 'error',
      message: 'Dispersed Camping Eligibility stale/cached/unavailable data is not labeled clearly.',
      detail: snapshot.dataFreshnessState ?? null,
    });
  }

  if (snapshot.offlineMode && snapshot.createdEligibilityClaimsWithoutData) {
    pushContradiction(contradictions, {
      code: 'dispersed_camping_offline_claim_without_data',
      severity: 'error',
      message: 'Dispersed Camping Eligibility created new eligibility claims offline without source data.',
    });
  }

  return contradictions;
}

function mapReadinessAIValidationCode(issue: ECSReadinessExplanationValidationIssue): ECSRuntimeContradiction['code'] {
  switch (issue.code) {
    case 'ai_summary_safe_while_not_ready':
      return 'readiness_ai_summary_safe_while_not_ready';
    case 'ai_summary_legal_campsite_claim':
      return 'readiness_ai_legal_campsite_claim';
    case 'ai_summary_references_missing_source':
      return 'readiness_ai_references_missing_source';
    case 'ai_summary_offline_complete_contradiction':
      return 'readiness_ai_offline_complete_contradiction';
    case 'ai_summary_vehicle_fit_without_vehicle':
      return 'readiness_ai_vehicle_fit_without_vehicle';
    case 'ai_summary_status_contradiction':
      return 'readiness_ai_status_contradiction';
  }
}

function collectReadinessText(readiness: ExpeditionReadinessAssessment): string {
  return [
    readiness.explanation,
    ...readiness.recommendations,
    ...readiness.blockers.flatMap((issue) => [issue.label, issue.detail]),
    ...readiness.warnings.flatMap((issue) => [issue.label, issue.detail]),
    ...readiness.categories.flatMap((category) => [
      category.label,
      category.summary,
      ...category.missingInputs,
      ...category.factors.flatMap((factor) => [factor.label, factor.detail]),
    ]),
    ...readiness.departureAudit.flatMap((item) => [item.label, item.summary, item.actionLabel ?? '']),
    readiness.recoveryBrief.nearestBailoutSummary,
    readiness.recoveryBrief.communicationsSummary,
    readiness.recoveryBrief.emergencyCoordinatePacketSummary,
    readiness.powerBrief.statusLabel,
    readiness.powerBrief.runtimeSummary,
    readiness.powerBrief.recommendation,
  ].filter(Boolean).join(' ').toLowerCase();
}

function hasOfflinePackageEvidence(readiness: ExpeditionReadinessAssessment): boolean {
  if (readiness.sourceFreshness.offline.isMissing) return false;
  const offlineCategory = readiness.categories.find((category) => category.id === 'offline_preparedness');
  const auditEvidence = readiness.departureAudit.some((item) => {
    return item.status === 'complete'
      && /(offline|map package|route geometry|weather snapshot|bailout)/i.test(`${item.itemId} ${item.label}`);
  });
  const factorEvidence = offlineCategory?.factors.some((factor) => {
    return factor.impact === 'positive'
      && factor.source !== 'missing'
      && /(package|cache|cached|download|tile|snapshot|geometry)/i.test(`${factor.label} ${factor.detail}`);
  }) ?? false;
  return auditEvidence || factorEvidence;
}

export function buildRuntimeSmokeMarkers(args: {
  shell: ECSRuntimeSmokeShellSnapshot | null;
  command: ECSRuntimeSmokeCommandSnapshot | null;
}): string[] {
  const { shell, command } = args;
  const markers = new Set<string>();

  if (!shell && !command) {
    return [];
  }

  addMarker(markers, command?.activePhase ?? 'no_active_expedition');

  if ((command?.liveStatus.readiness?.status ?? command?.liveStatus.overall?.status) === 'offline_capable') {
    markers.add('offline_capable');
  }

  if (command?.liveStatus.route?.status === 'degraded') {
    markers.add('degraded_gps');
  }

  if (
    command?.liveStatus.telemetry?.status === 'waiting'
    || command?.liveStatus.telemetry?.status === 'degraded'
    || command?.liveStatus.telemetry?.status === 'unavailable'
  ) {
    markers.add('missing_provider');
  }

  if (
    command?.liveStatus.weather?.freshness === 'stale'
    || command?.liveStatus.weather?.status === 'degraded'
    || command?.expeditionReadiness?.sourceFreshness.weather.isStale
  ) {
    markers.add('stale_weather');
  }

  if (command?.expeditionReadiness?.status) {
    markers.add(`readiness_${command.expeditionReadiness.status}`);
  }

  if (command?.activeReadinessAlert) {
    markers.add(`readiness_alert_${command.activeReadinessAlert.severity}`);
  }

  if (shell?.accessState?.isPrivilegedGrant) {
    markers.add('access_granted');
  }

  if (shell?.accessState?.canAccessAdminSurfaces) {
    markers.add('admin_access');
  }

  if (
    shell?.accessState?.accessState === 'pending_sync'
    || shell?.accessState?.verificationMode === 'unknown'
    || shell?.accessState?.verificationMode === 'stale_cached'
  ) {
    markers.add('pending_verification');
  }

  if (shell?.offlineMode) {
    markers.add('offline_entry');
  }

  return [...markers];
}

export function detectRuntimeContradictions(args: {
  shell: ECSRuntimeSmokeShellSnapshot | null;
  command: ECSRuntimeSmokeCommandSnapshot | null;
}): ECSRuntimeContradiction[] {
  const { shell, command } = args;
  const contradictions: ECSRuntimeContradiction[] = [];

  if (shell) {
    const validAccess =
      shell.accessState?.hasFullAccess === true
      && shell.accessState?.suspended !== true
      && (shell.authenticated || shell.offlineMode);

    if (validAccess && !shell.shellAccessReady) {
      pushContradiction(contradictions, {
        code: 'valid_access_gated',
        severity: 'error',
        message: 'Runtime shell is still gated even though valid access is available.',
        detail: `${shell.accessState?.accountLabel} / ${shell.accessState?.statusLabel}`,
      });
    }

    if (shell.shellRestoreEligible && shell.redirectTarget === '/login') {
      pushContradiction(contradictions, {
        code: 'shell_restore_mismatch',
        severity: 'error',
        message: 'Shell restore is eligible, but runtime routing is still pointing back to login.',
        detail: shell.restorableShellRoute,
      });
    }

    if (shell.routeRestoreEligible && !shell.shellRestoreEligible) {
      pushContradiction(contradictions, {
        code: 'route_restore_mismatch',
        severity: 'error',
        message: 'Route restore is marked eligible without shell restore being available first.',
        detail: shell.restorableShellRoute,
      });
    }

    if (shell.shellAccessReady && shell.setupComplete && shell.entryKind === 'setup_required') {
      pushContradiction(contradictions, {
        code: 'setup_gate_mismatch',
        severity: 'warning',
        message: 'Runtime entry state is still requesting setup even though setup is marked complete.',
      });
    }
  }

  if (command) {
    const violationCodes = new Set(command.invariantViolations.map((violation) => violation.code));
    const releaseIssueCodes = new Set(command.releaseDiagnostics?.issues.map((issue) => issue.code) ?? []);
    const readiness = command.expeditionReadiness;
    const activeReadinessAlert = command.activeReadinessAlert;

    for (const contradiction of detectDispersedCampingRuntimeContradictions(command.dispersedCamping)) {
      pushContradiction(contradictions, contradiction);
    }

    if (violationCodes.has('offline_capable_status_conflict') || releaseIssueCodes.has('offline_capable_conflict')) {
      pushContradiction(contradictions, {
        code: 'offline_capable_mislabeled',
        severity: 'warning',
        message: 'Offline-capable support is still being described too much like total offline failure.',
      });
    }

    if (violationCodes.has('route_issue_missing_from_navigate') || releaseIssueCodes.has('route_lead_gap')) {
      pushContradiction(contradictions, {
        code: 'navigate_route_lead_gap',
        severity: 'error',
        message: 'A route-critical condition exists without Navigate clearly owning the lead expression.',
      });
    }

    if (violationCodes.has('dashboard_alert_priority_drift')) {
      pushContradiction(contradictions, {
        code: 'severity_drift',
        severity: 'warning',
        message: 'Dashboard and Alert are drifting on the same command severity or ownership.',
      });
    }

    if (violationCodes.has('telemetry_status_conflict')) {
      pushContradiction(contradictions, {
        code: 'provider_state_mismatch',
        severity: 'warning',
        message: 'Provider/resource trust semantics are conflicting across runtime command surfaces.',
      });
    }

    if (violationCodes.has('explore_route_noise')) {
      pushContradiction(contradictions, {
        code: 'explore_noise_leak',
        severity: 'warning',
        message: 'Explore is surfacing route-critical noise during a context where it should stay quieter.',
      });
    }

    if (violationCodes.has('fleet_route_urgency_lead')) {
      pushContradiction(contradictions, {
        code: 'fleet_urgency_leak',
        severity: 'warning',
        message: 'Fleet is owning route-expedition urgency instead of staying focused on readiness.',
      });
    }

    if (command.staleSignals.length > 0) {
      pushContradiction(contradictions, {
        code: 'stale_command_lingering',
        severity: command.staleSignals.length >= 2 ? 'warning' : 'info',
        message: 'Stale command-state drift is still being suppressed at runtime.',
        detail: command.staleSignals[0] ?? null,
      });
    }

    if (readiness) {
      const readinessExplanation = command.readinessExplanation ?? buildReadinessExplanationPayload(readiness);
      const aiSummary = command.aiSummary ?? command.primarySummary ?? null;
      const aiValidationIssues = validateReadinessExplanationOutput(readinessExplanation, aiSummary);
      for (const issue of aiValidationIssues) {
        pushContradiction(contradictions, {
          code: mapReadinessAIValidationCode(issue),
          severity: issue.severity,
          message: issue.message,
          detail: issue.detail ?? null,
        });
      }

      if (!Number.isFinite(readiness.overallScore) || readiness.overallScore < 0 || readiness.overallScore > 100) {
        pushContradiction(contradictions, {
          code: 'readiness_score_out_of_range',
          severity: 'error',
          message: 'Expedition readiness overall score is outside 0-100.',
          detail: String(readiness.overallScore),
        });
      }

      const thresholds = readiness.calibration?.thresholds ?? { ready: 82, caution: 60 };
      if (
        (readiness.blockers.length > 0 && readiness.status !== 'hold')
        || (readiness.status === 'ready' && readiness.overallScore < thresholds.ready)
        || (readiness.overallScore < thresholds.caution && readiness.status !== 'hold')
      ) {
        pushContradiction(contradictions, {
          code: 'readiness_status_score_mismatch',
          severity: 'error',
          message: 'Expedition readiness status does not match score thresholds or blockers.',
          detail: `${readiness.status} / ${readiness.overallScore}`,
        });
      }

      if (readiness.status === 'ready' && readiness.warnings.length > 0) {
        pushContradiction(contradictions, {
          code: 'readiness_status_score_mismatch',
          severity: 'warning',
          message: 'Expedition readiness is Ready while warning-level concerns remain active.',
        });
      }

      const readinessText = collectReadinessText(readiness);
      if (/\blegal campsite\b/i.test(readinessText) || /\bguaranteed safe\b/i.test(readinessText)) {
        pushContradiction(contradictions, {
          code: 'readiness_unsafe_wording',
          severity: 'error',
          message: 'Expedition readiness copy contains a legal or safety certainty claim.',
        });
      }

      if (readiness.status === 'ready' && readiness.sourceFreshness.route.isMissing) {
        pushContradiction(contradictions, {
          code: 'readiness_ready_without_route',
          severity: 'error',
          message: 'Expedition readiness is Ready with no route input.',
        });
      }

      if (readiness.status === 'ready' && readiness.sourceFreshness.fleet.isMissing) {
        pushContradiction(contradictions, {
          code: 'readiness_ready_without_vehicle',
          severity: 'error',
          message: 'Expedition readiness is Ready with no active vehicle profile.',
        });
      }

      if (readiness.status === 'ready' && readiness.sourceFreshness.weather.isStale) {
        pushContradiction(contradictions, {
          code: 'readiness_ready_with_stale_weather',
          severity: 'warning',
          message: 'Expedition readiness is Ready while weather data is stale.',
        });
      }

      if (readiness.status === 'ready' && readiness.sourceFreshness.offline.isMissing) {
        pushContradiction(contradictions, {
          code: 'readiness_ready_without_offline_package',
          severity: 'error',
          message: 'Expedition readiness is Ready while the offline package state is missing.',
        });
      }

      const campLegality = readiness.categories.find((category) => category.id === 'camp_legality_confidence');
      if (readiness.status === 'ready' && campLegality?.confidence === 'low') {
        pushContradiction(contradictions, {
          code: 'readiness_ready_low_camp_legality_confidence',
          severity: 'error',
          message: 'Expedition readiness is Ready with low Camp Legality Confidence.',
        });
      }

      const vehicleFit = readiness.categories.find((category) => category.id === 'vehicle_fit');
      const vehicleFitClaimsStrong =
        vehicleFit?.status === 'ready'
        || (vehicleFit?.score ?? 0) >= 82
        || /strong/i.test(vehicleFit?.summary ?? '');
      if (readiness.sourceFreshness.fleet.isMissing && vehicleFitClaimsStrong) {
        pushContradiction(contradictions, {
          code: 'readiness_vehicle_fit_without_vehicle',
          severity: 'error',
          message: 'Vehicle Fit claims a strong or Ready state without an active vehicle profile.',
        });
      }

      const offlinePreparedness = readiness.categories.find((category) => category.id === 'offline_preparedness');
      const offlineClaimsReady =
        offlinePreparedness?.status === 'ready'
        || (offlinePreparedness?.score ?? 0) >= 82
        || /offline ready|package complete|downloaded/i.test(offlinePreparedness?.summary ?? '');
      if (offlineClaimsReady && !hasOfflinePackageEvidence(readiness)) {
        pushContradiction(contradictions, {
          code: 'readiness_offline_ready_without_evidence',
          severity: 'error',
          message: 'Offline Preparedness claims Ready without route package, cache, or audit evidence.',
        });
      }

      if (readiness.status === 'ready' && readiness.sourceFreshness.recovery.isMissing) {
        pushContradiction(contradictions, {
          code: 'readiness_ready_without_recovery_context',
          severity: 'error',
          message: 'Expedition readiness is Ready without recovery or bailout context.',
        });
      }

      if (
        readiness.status === 'ready'
        && (
          readiness.recoveryBrief.emergencyCoordinatePacketStatus === 'missing'
          || readiness.recoveryBrief.emergencyCoordinatePacketStatus === 'unavailable'
        )
      ) {
        pushContradiction(contradictions, {
          code: 'readiness_ready_without_emergency_coordinate_packet',
          severity: 'warning',
          message: 'Expedition readiness is Ready while the emergency coordinate packet is missing or unavailable.',
        });
      }

      if (readiness.status === 'hold' && readiness.explanation.trim().length === 0) {
        pushContradiction(contradictions, {
          code: 'readiness_hold_missing_explanation',
          severity: 'error',
          message: 'Expedition readiness is Hold without an explanation.',
        });
      }

      if (readiness.dataIntegrity.unmarkedSyntheticData.length > 0) {
        pushContradiction(contradictions, {
          code: 'readiness_unmarked_synthetic_data',
          severity: 'warning',
          message: 'Expedition readiness appears to use mock or demo data without explicit demo/inferred marking.',
          detail: readiness.dataIntegrity.unmarkedSyntheticData[0] ?? null,
        });
      }

      const freshnessRecords = Object.values(readiness.sourceFreshness);
      const hasMockFreshness = freshnessRecords.some((record) => record.source === 'mock' || record.state === 'mock');
      const hasDemoFreshness = freshnessRecords.some((record) => record.source === 'demo' || record.state === 'demo');
      const unmarkedSyntheticFactor = readiness.categories
        .flatMap((category) => category.factors)
        .find((item) => {
          const syntheticSource = item.source === 'mock' || item.source === 'demo';
          return syntheticSource && !(item.isMock || item.isDemo || item.isInferred);
        });
      if (
        (hasMockFreshness && !readiness.dataIntegrity.usesMockData)
        || (hasDemoFreshness && !readiness.dataIntegrity.usesDemoData)
        || unmarkedSyntheticFactor
      ) {
        pushContradiction(contradictions, {
          code: 'readiness_unmarked_synthetic_data',
          severity: 'warning',
          message: 'Expedition readiness is using mock/demo data without matching demo or inferred marking.',
          detail: unmarkedSyntheticFactor?.id ?? null,
        });
      }

      for (const category of readiness.categories) {
        if (category.score < 0 || category.score > 100 || !Number.isFinite(category.score)) {
          pushContradiction(contradictions, {
            code: 'readiness_category_score_out_of_range',
            severity: 'error',
            message: 'Expedition readiness category score is outside 0-100.',
            detail: `${category.id}: ${category.score}`,
          });
        }
      }

      const categoryIds = new Set(readiness.categories.map((category) => category.id));
      for (const requiredId of EXPEDITION_READINESS_CATEGORY_IDS) {
        if (!categoryIds.has(requiredId)) {
          pushContradiction(contradictions, {
            code: 'readiness_missing_category',
            severity: 'error',
            message: 'Expedition readiness assessment is missing a required category.',
            detail: requiredId,
          });
        }
      }

      if (activeReadinessAlert) {
        const alertText = `${activeReadinessAlert.title} ${activeReadinessAlert.message}`;
        if (/\blegal campsite\b/i.test(alertText) || /\bguaranteed safe\b/i.test(alertText) || /\bai says\b/i.test(alertText)) {
          pushContradiction(contradictions, {
            code: 'readiness_alert_copy_unsafe',
            severity: 'warning',
            message: 'Active readiness alert copy contains unsafe legal/safety or generic AI wording.',
            detail: activeReadinessAlert.title,
          });
        }

        if (
          readiness.status === 'ready'
          && (activeReadinessAlert.severity === 'hold' || activeReadinessAlert.severity === 'caution')
        ) {
          pushContradiction(contradictions, {
            code: 'readiness_alert_status_contradiction',
            severity: 'warning',
            message: 'Active readiness alert severity contradicts a currently Ready assessment.',
            detail: `${activeReadinessAlert.severity} / ${activeReadinessAlert.title}`,
          });
        }
      }
    }
  }

  return contradictions;
}
