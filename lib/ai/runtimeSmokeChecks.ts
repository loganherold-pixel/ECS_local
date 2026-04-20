import type {
  ECSRuntimeContradiction,
  ECSRuntimeSmokeCommandSnapshot,
  ECSRuntimeSmokeShellSnapshot,
} from './runtimeContradictionTypes';

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
  ) {
    markers.add('stale_weather');
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
  }

  return contradictions;
}
