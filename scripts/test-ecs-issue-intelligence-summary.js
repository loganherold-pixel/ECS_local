const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const stabilityPanelSource = fs.readFileSync(
  path.join(root, 'components', 'admin', 'EcsIssueIntelligencePanel.tsx'),
  'utf8',
);

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
  buildIssueGroupSummary,
  normalizeIssueEventForInsert,
} = require(path.join(root, 'supabase', 'functions', '_shared', 'issueIntelligenceSummary.ts'));

function row(overrides) {
  return {
    received_at: overrides.received_at,
    event_type: overrides.event_type ?? 'recoverable_failure',
    severity: overrides.severity ?? 'medium',
    issue_title: overrides.issue_title,
    issue_signature: overrides.issue_signature ?? overrides.normalized_signature,
    normalized_signature: overrides.normalized_signature,
    ecs_area: overrides.ecs_area ?? 'unknown',
    message: overrides.message ?? '',
    source_kind: overrides.source_kind ?? 'runtime',
    hashed_user_id: overrides.hashed_user_id ?? 'user-a',
    hashed_session_id: overrides.hashed_session_id ?? `session-${overrides.normalized_signature}`,
    app_version: overrides.app_version ?? '1.0.0',
    platform: overrides.platform ?? 'android',
    environment: overrides.environment ?? 'production',
    runtime_context: {
      activeTab: overrides.activeTab ?? null,
      routeState: overrides.routeState ?? 'none',
      gpsState: overrides.gpsState ?? 'unavailable',
      connectivityState: overrides.connectivityState ?? 'online',
    },
    metadata: overrides.metadata ?? {},
  };
}

const rows = [
  row({
    received_at: '2026-06-14T10:00:00.000Z',
    issue_title: 'Expedition readiness contradiction',
    severity: 'high',
    normalized_signature: 'runtime_smoke:readiness_ready_without_route:route missing',
    ecs_area: 'dashboard',
    activeTab: 'dashboard',
    message: 'Expedition readiness is Ready with no route input.',
    metadata: { smokeMode: true, contradictionCode: 'readiness_ready_without_route' },
  }),
  row({
    received_at: '2026-06-14T10:05:00.000Z',
    issue_title: 'Expedition readiness contradiction',
    severity: 'high',
    normalized_signature: 'runtime_smoke:readiness_ready_without_vehicle:vehicle missing',
    ecs_area: 'dashboard',
    activeTab: 'dashboard',
    message: 'Expedition readiness is Ready with no active vehicle profile.',
    metadata: { smokeMode: true, contradictionCode: 'readiness_ready_without_vehicle' },
  }),
  row({
    received_at: '2026-06-14T10:10:00.000Z',
    issue_title: 'Widget render failure: routeGauge',
    normalized_signature: 'widget_boundary:routegauge:0:typeerror:bad prop',
    ecs_area: 'widgets',
    activeTab: 'dashboard',
    message: 'Cannot read property routeGauge',
    metadata: { widgetType: 'routeGauge', slotIndex: 0 },
  }),
  row({
    received_at: '2026-06-14T10:15:00.000Z',
    issue_title: 'Widget render failure: readiness',
    normalized_signature: 'widget_boundary:readiness:4:typeerror:bad prop',
    ecs_area: 'widgets',
    activeTab: 'dashboard',
    message: 'Cannot read property readiness',
    metadata: { widgetType: 'readiness', slotIndex: 4 },
  }),
  row({
    received_at: '2026-06-14T10:20:00.000Z',
    issue_title: 'Hidden Gems ECS intelligence unavailable',
    normalized_signature: 'hidden_gems_ai_unavailable:timeout',
    ecs_area: 'explore',
    activeTab: 'explore',
    message: 'Hidden Gems fell back to validated baseline.',
    metadata: { status: 'ai_unavailable_fallback_used', finalSource: 'validated_baseline' },
  }),
  row({
    received_at: '2026-06-14T10:25:00.000Z',
    issue_title: 'Hidden Gems ECS intelligence returned no refinement',
    normalized_signature: 'hidden_gems_ai_noop',
    ecs_area: 'explore',
    activeTab: 'explore',
    message: 'ECS intelligence orchestration completed without refining the validated baseline list.',
    metadata: { status: 'ai_noop_baseline_retained', finalSource: 'validated_baseline' },
  }),
  row({
    received_at: '2026-06-14T10:30:00.000Z',
    issue_title: 'GPS guidance degraded',
    normalized_signature: 'gps_guidance:route-active',
    ecs_area: 'gps',
    activeTab: 'navigate',
    routeState: 'active',
    message: 'GPS weak while active guidance is expected.',
  }),
  row({
    received_at: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString(),
    issue_title: 'Dashboard state hydration failed',
    normalized_signature: 'dashboard_hydration:legacy-storage-shape',
    ecs_area: 'dashboard',
    activeTab: 'dashboard',
    message: 'Legacy dashboard storage shape could not hydrate.',
    metadata: { source: 'legacy_storage' },
  }),
];

const summary = buildIssueGroupSummary(rows);
assert.strictEqual(summary.latestVersion, '1.0.0');
assert.strictEqual(summary.groups.length, 5, 'Repeated root-condition variants should collapse while retaining historical groups.');
assert.strictEqual(summary.activeGroups.length, 4, 'Active group count should exclude quieted historical groups.');

const readiness = summary.groups.find((group) => group.signature === 'command_state_contradiction:dashboard');
assert.ok(readiness, 'Readiness smoke variants should share the command-state dashboard group.');
assert.strictEqual(readiness.eventCount, 2);
assert.strictEqual(readiness.issueFamily, 'command_state_contradiction');
assert.strictEqual(readiness.issueClass, 'user_impacting_functional_failure');
assert.ok(readiness.affectedSurfaces.includes('dashboard'));

const widgets = summary.groups.find((group) => group.signature === 'widget_render_instability:widgets');
assert.ok(widgets, 'Widget render failures should group by widget-render instability, not per slot/message.');
assert.strictEqual(widgets.eventCount, 2);
assert.ok(widgets.affectedSurfaces.includes('widgets'));

const explore = summary.groups.find((group) => group.signature === 'explore_orchestration_fallback:explore');
assert.ok(explore, 'Hidden Gems AI fallback/no-op variants should share the explore orchestration group.');
assert.strictEqual(explore.eventCount, 2);

assert.ok(
  summary.severeActive.some((group) => group.signature === 'command_state_contradiction:dashboard'),
  'Remote summary should include severeActive for admin panel parity.',
);

const normalized = normalizeIssueEventForInsert({
  occurredAt: '2026-06-14T11:00:00.000Z',
  eventType: 'recoverable_failure',
  severity: 'medium',
  issueTitle: 'Expedition readiness contradiction',
  issueSignature: 'runtime_smoke:readiness_ready_without_route',
  normalizedSignature: 'runtime_smoke:readiness_ready_without_route',
  ecsArea: 'dashboard',
  message: 'Expedition readiness is Ready with no route input.',
  sourceKind: 'runtime',
  hashedSessionId: 'session-b',
  runtimeContext: { appVersion: '1.0.0', activeTab: 'dashboard', routeState: 'none' },
  metadata: { smokeMode: true },
  issueFamily: 'command_state_contradiction',
  rootConditionKey: 'command_state_contradiction',
  groupingSignature: 'command_state_contradiction:dashboard',
  issueClass: 'user_impacting_functional_failure',
  affectedSurfaces: ['dashboard'],
  providerFamily: null,
  confidenceHint: 0.55,
});

assert.strictEqual(normalized.metadata.groupingSignature, 'command_state_contradiction:dashboard');
assert.strictEqual(normalized.metadata.issueFamily, 'command_state_contradiction');
assert.deepStrictEqual(normalized.metadata.affectedSurfaces, ['dashboard']);

assert.ok(stabilityPanelSource.includes('Active Groups'), 'Admin stability panel should label the hero count as active groups.');
assert.ok(
  stabilityPanelSource.includes('summary?.activeGroups.length'),
  'Admin stability panel should count active issue groups instead of all historical groups.',
);

console.log('ECS issue intelligence summary checks passed.');
