import type {
  EcsFieldFeedbackEvent,
  EcsFieldFeedbackIssueClass,
  EcsFieldFeedbackIssueFamily,
  EcsIssueArea,
  EcsIssueEventType,
} from './fieldFeedbackTypes';

function cleanText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function includesAny(text: string, patterns: string[]): boolean {
  return patterns.some((pattern) => text.includes(pattern));
}

function asProviderFamily(metadata: Record<string, unknown>): string | null {
  const candidates = [
    metadata.providerFamily,
    metadata.provider,
    metadata.activeProvider,
    metadata.deviceProvider,
  ];

  for (const candidate of candidates) {
    const value = cleanText(candidate);
    if (value) return value.replace(/\s+/g, '_');
  }

  return null;
}

function deriveAffectedSurfaces(event: {
  ecsArea: EcsIssueArea;
  runtimeContext: { activeTab: string | null };
  metadata: Record<string, unknown>;
}): string[] {
  const surfaces = new Set<string>();

  if (event.ecsArea && event.ecsArea !== 'unknown') {
    surfaces.add(event.ecsArea);
  }

  if (event.runtimeContext.activeTab) {
    surfaces.add(cleanText(event.runtimeContext.activeTab));
  }

  const metadataSurfaces = [
    event.metadata.surface,
    event.metadata.tab,
    event.metadata.system,
    event.metadata.activeTab,
  ];

  metadataSurfaces.forEach((value) => {
    const normalized = cleanText(value);
    if (normalized) surfaces.add(normalized);
  });

  return [...surfaces].filter(Boolean);
}

function deriveIssueFamily(args: {
  eventType: EcsIssueEventType;
  ecsArea: EcsIssueArea;
  issueTitle: string;
  message: string | null;
  metadata: Record<string, unknown>;
}): EcsFieldFeedbackIssueFamily {
  const combined = [
    args.issueTitle,
    args.message,
    args.metadata.category,
    args.metadata.error && typeof args.metadata.error === 'object'
      ? JSON.stringify(args.metadata.error)
      : args.metadata.error,
    args.metadata.signature,
  ]
    .map((value) => cleanText(value))
    .filter(Boolean)
    .join(' ');

  if (includesAny(combined, ['route restore', 'restore route', 'cached route', 'restore mismatch'])) {
    return 'route_restore_failure';
  }
  if (includesAny(combined, ['cold launch', 'launch restore', 'shell restore', 'login restore'])) {
    return 'cold_launch_restore_mismatch';
  }
  if (includesAny(combined, ['command-state contradiction', 'command state contradiction', 'lead expression drift', 'severity drift'])) {
    return 'command_state_contradiction';
  }
  if (includesAny(combined, ['stale-state drift', 'stale state drift', 'stale command', 'ghost summary'])) {
    return 'stale_command_state_drift';
  }
  if (includesAny(combined, ['gps', 'guidance', 'tracking', 'location services', 'gps lost', 'gps weak'])) {
    return 'gps_guidance_degradation';
  }
  if (includesAny(combined, ['ble', 'bluetooth', 'telemetry unavailable', 'provider disconnected', 'reconnect'])) {
    return 'provider_connectivity_issue';
  }
  if (includesAny(combined, ['sync', 'reconnect', 'offline', 'network', 'rate limit', 'connectivity'])) {
    return args.ecsArea === 'offline'
      ? 'offline_degraded_fallback'
      : 'sync_connectivity_degradation';
  }
  if (includesAny(combined, ['tile', 'cache', 'region', 'offline map', 'map coverage'])) {
    return 'map_cache_issue';
  }
  if (includesAny(combined, ['widget', 'render failure', 'render error', 'unavailable state'])) {
    return 'widget_render_instability';
  }
  if (includesAny(combined, ['explore', 'hidden gem', 'popular trail', 'route ideas', 'orchestration fallback'])) {
    return 'explore_orchestration_fallback';
  }
  if (includesAny(combined, ['alert surface', 'alert screen', 'severity orchestration'])) {
    return 'alert_surface_failure';
  }
  if (includesAny(combined, ['weather', 'forecast', 'openweather', 'edge function returned'])) {
    return 'weather_support_degradation';
  }
  if (includesAny(combined, ['overflow', 'layout', 'clip', 'container', 'dimension change'])) {
    return 'ui_render_overflow';
  }
  if (includesAny(combined, ['edge function', 'supabase', 'cloud dependency', 'issue-intelligence', 'invoke failed'])) {
    return 'edge_function_failure';
  }
  if (includesAny(combined, ['route state', 'route mismatch', 'reroute', 'navigation state'])) {
    return 'route_state_mismatch';
  }
  if (includesAny(combined, ['access restore', 'auth restore', 'entitlement', 'billing restore', 'access-state contradiction', 'valid access gated'])) {
    return 'shell_access_restore';
  }

  if (args.ecsArea === 'gps') return 'gps_guidance_degradation';
  if (args.ecsArea === 'bluetooth_telemetry') return 'provider_connectivity_issue';
  if (args.ecsArea === 'explore') return 'explore_orchestration_fallback';
  if (args.ecsArea === 'widgets') return 'widget_render_instability';
  if (args.ecsArea === 'weather') return 'weather_support_degradation';
  if (args.ecsArea === 'offline') return 'offline_degraded_fallback';

  return 'general_runtime_failure';
}

function deriveIssueClass(args: {
  eventType: EcsIssueEventType;
  severity: EcsFieldFeedbackEvent['severity'];
  issueFamily: EcsFieldFeedbackIssueFamily;
}): EcsFieldFeedbackIssueClass {
  if (args.severity === 'critical' || args.eventType === 'fatal') {
    return 'critical_operational_failure';
  }
  if (
    args.issueFamily === 'gps_guidance_degradation'
    || args.issueFamily === 'route_restore_failure'
    || args.issueFamily === 'provider_connectivity_issue'
    || args.issueFamily === 'alert_surface_failure'
    || args.issueFamily === 'command_state_contradiction'
  ) {
    return args.severity === 'high'
      ? 'user_impacting_functional_failure'
      : 'feature_reliability_concern';
  }
  if (args.issueFamily === 'stale_command_state_drift') {
    return 'release_polish_regression_candidate';
  }
  if (args.eventType === 'degraded_state') {
    return 'recurring_degraded_pattern';
  }
  if (args.eventType === 'layout_failure' || args.eventType === 'data_integrity_failure') {
    return 'release_polish_regression_candidate';
  }
  return 'informational_diagnostic_event';
}

export function enrichIssueEvent(
  event: Omit<EcsFieldFeedbackEvent, 'issueFamily' | 'rootConditionKey' | 'groupingSignature' | 'issueClass' | 'affectedSurfaces' | 'providerFamily' | 'confidenceHint'>,
): EcsFieldFeedbackEvent {
  const issueFamily = deriveIssueFamily({
    eventType: event.eventType,
    ecsArea: event.ecsArea,
    issueTitle: event.issueTitle,
    message: event.message,
    metadata: event.metadata,
  });

  const providerFamily = asProviderFamily(event.metadata);
  const rootConditionKey = providerFamily
    ? `${issueFamily}:${providerFamily}`
    : issueFamily;
  const groupingSignature = [
    rootConditionKey,
    event.ecsArea === 'unknown' ? null : event.ecsArea,
    event.runtimeContext.routeState === 'active' ? 'active_route' : null,
  ]
    .filter(Boolean)
    .join(':');

  const issueClass = deriveIssueClass({
    eventType: event.eventType,
    severity: event.severity,
    issueFamily,
  });

  const affectedSurfaces = deriveAffectedSurfaces(event);
  const confidenceHint =
    event.sourceKind === 'field_report'
      ? 0.45
      : event.eventType === 'fatal'
        ? 0.75
        : event.eventType === 'degraded_state'
          ? 0.55
          : 0.4;

  return {
    ...event,
    issueFamily,
    rootConditionKey,
    groupingSignature,
    issueClass,
    affectedSurfaces,
    providerFamily,
    confidenceHint,
  };
}
