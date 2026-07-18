const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

global.__DEV__ = false;

const originalLoad = Module._load;
Module._load = function loadWithReactNativeStub(request, parent, isMain) {
  if (request === 'react-native') return { Platform: { OS: 'web' } };
  return originalLoad.call(this, request, parent, isMain);
};

require.extensions['.ts'] = function compileTypeScript(mod, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  mod._compile(outputText, filename);
};

const root = path.join(__dirname, '..');
const proposal = require(path.join(root, 'lib', 'dispatchMissionCommandProposal.ts'));
const adapters = require(path.join(root, 'lib', 'dispatchMissionCommandSourceAdapters.ts'));
const resolution = require(path.join(root, 'lib', 'dispatchMissionCommandResolutionHandoff.ts'));
const composer = require(path.join(root, 'lib', 'dispatchMissionCommandComposer.ts'));

const NOW = '2026-07-14T18:00:00.000Z';
const STALE = '2026-07-14T08:00:00.000Z';

function sourceTruth(overrides = {}) {
  return {
    id: overrides.id ?? 'source-1',
    origin: overrides.origin ?? 'live',
    role: overrides.role ?? 'primary',
    policyKey: overrides.policyKey ?? 'condition_closure_advisory',
    authority: overrides.authority ?? 'ECS validated source',
    authorityKind: overrides.authorityKind ?? 'ecs',
    provider: overrides.provider ?? null,
    observedAt: overrides.observedAt ?? NOW,
    fetchedAt: overrides.fetchedAt ?? NOW,
    expiresAt: overrides.expiresAt ?? null,
    confidence: overrides.confidence ?? 'high',
    coverage: overrides.coverage ?? 'complete',
    availability: overrides.availability ?? 'usable',
    conflictState: overrides.conflictState ?? 'none',
    warningCodes: overrides.warningCodes ?? [],
  };
}

function linkedContext(type = 'route', overrides = {}) {
  return {
    id: overrides.id ?? `${type}-1`,
    type,
    title: overrides.title ?? `${type} context`,
    subtitle: overrides.subtitle ?? 'Validated ECS context',
    coordinates: overrides.coordinates,
    routeSegmentId: overrides.routeSegmentId,
    sourceTruth: overrides.sourceTruth ?? sourceTruth(),
    sourceTruthPolicyKey: overrides.sourceTruthPolicyKey ?? 'condition_closure_advisory',
    observedAt: overrides.observedAt ?? NOW,
    stale: overrides.stale ?? false,
    restricted: overrides.restricted ?? false,
    metadata: overrides.metadata ?? { source: 'test', routeId: 'route-1' },
  };
}

function command(overrides = {}) {
  return {
    type: overrides.type ?? 'general',
    priority: overrides.priority ?? 'high',
    title: overrides.title ?? 'Review validated ECS condition',
    instructions: overrides.instructions ?? 'Review the validated source context and record an explicit team decision.',
    target: overrides.target ?? { kind: 'expedition' },
    acknowledgmentMode: overrides.acknowledgmentMode ?? 'all',
    deadlineAt: overrides.deadlineAt ?? null,
  };
}

function common(overrides = {}) {
  return {
    sourceEntityId: overrides.sourceEntityId ?? 'entity-1',
    expeditionId: overrides.expeditionId ?? 'expedition-1',
    title: overrides.title ?? 'Validated operational condition',
    summary: overrides.summary ?? 'ECS source-domain logic produced a condition that can be coordinated in Dispatch.',
    sourceTruth: overrides.sourceTruth ?? [sourceTruth()],
    linkedContext: Object.prototype.hasOwnProperty.call(overrides, 'linkedContext')
      ? overrides.linkedContext
      : linkedContext(),
    command: overrides.command ?? command(),
    action: overrides.action ?? 'create_command',
    operatorRequested: overrides.operatorRequested ?? true,
    offline: overrides.offline ?? false,
    returnRoute: overrides.returnRoute ?? '/dashboard',
    createdAt: overrides.createdAt ?? NOW,
    now: overrides.now ?? NOW,
  };
}

function withoutMutation(factory, input) {
  const before = JSON.stringify(input);
  const result = factory(input);
  assert.equal(JSON.stringify(input), before, 'A Mission Command source adapter mutated source-domain input.');
  return result;
}

async function main() {
  const dispatchSource = fs.readFileSync(
    path.join(root, 'components', 'dispatch', 'DispatchCadCommandCenter.tsx'),
    'utf8',
  );
  const boardSource = fs.readFileSync(
    path.join(root, 'components', 'dispatch', 'DispatchMissionCommandBoard.tsx'),
    'utf8',
  );
  const proposalActionSource = fs.readFileSync(
    path.join(root, 'components', 'mission-command', 'MissionCommandProposalAction.tsx'),
    'utf8',
  );
  const producerSources = [
    ['ECS Brief', path.join(root, 'components', 'brief', 'CommandBriefScreen.tsx'), 'createDashboardMissionCommandProposal'],
    ['Navigate', path.join(root, 'app', '(tabs)', 'navigate.tsx'), 'createNavigateMissionCommandProposal'],
    ['Explore', path.join(root, 'app', '(tabs)', 'discover.tsx'), 'createExploreMissionCommandProposal'],
    ['Trip Builder', path.join(root, 'app', 'explore-trip-builder.tsx'), 'createExploreMissionCommandProposal'],
    ['CampOps', path.join(root, 'components', 'navigate', 'SafeEndpointDecisionSheet.tsx'), 'createCampOpsMissionCommandProposal'],
    ['Weather', path.join(root, 'components', 'dashboard', 'WidgetRenderers.tsx'), 'createWeatherMissionCommandProposal'],
    ['Incident & Recovery', path.join(root, 'components', 'dashboard', 'IncidentRecoveryPanel.tsx'), 'createIncidentRecoveryMissionCommandProposal'],
  ];
  assert.match(dispatchSource, /missionCommandProposalHandoffAdapter\.consume\(\)/);
  assert.match(dispatchSource, /confirmMissionCommandProposal\(proposal/);
  assert.match(dispatchSource, /Reviewing opens a draft\. No command is created or sent/);
  assert.match(dispatchSource, /returnSingleFlight\(proposal\.returnRoute\)/);
  assert.match(boardSource, /onCommandMutation\?\.\(result\)/);
  assert.match(proposalActionSource, /missionCommandProposalHandoffAdapter\.stage\(proposalResult\.proposal\)/);
  assert.match(proposalActionSource, /router\.push\('\/alert'/);
  assert.doesNotMatch(proposalActionSource, /buildMissionCommandFromComposer|persistMissionCommandMutation/);
  producerSources.forEach(([label, filename, adapterName]) => {
    const source = fs.readFileSync(filename, 'utf8');
    assert.match(source, new RegExp(adapterName), `${label} must use its typed Mission Command source adapter.`);
    assert.doesNotMatch(
      source,
      /missionCommandProposalHandoffAdapter\.consume\(\)/,
      `${label} must not consume or confirm its own proposal.`,
    );
  });

  const sourceInputs = [];

  const dashboardInput = {
    ...common({ sourceEntityId: 'brief-warning-1' }),
    situation: 'vehicle_warning',
  };
  sourceInputs.push(dashboardInput);
  const dashboard = withoutMutation(adapters.createDashboardMissionCommandProposal, dashboardInput);
  assert.equal(dashboard.ok, true);
  assert.equal(dashboard.proposal.origin.domain, 'dashboard');

  const ecsBrief = withoutMutation(adapters.createDashboardMissionCommandProposal, {
    ...dashboardInput,
    sourceEntityId: 'ecs-brief-warning-1',
    sourceSurface: 'ecs_brief',
  });
  assert.equal(ecsBrief.ok, true);
  assert.equal(ecsBrief.proposal.origin.domain, 'ecs_brief');

  const dashboardCheckIn = adapters.createDashboardMissionCommandProposal({
    ...dashboardInput,
    sourceEntityId: 'brief-check-in-1',
    action: 'request_check_in',
    command: command({ type: 'check_in' }),
  });
  assert.equal(dashboardCheckIn.ok, true);
  assert.equal(dashboardCheckIn.proposal.intent, 'request_check_in');
  assert.equal(proposal.confirmMissionCommandProposal(dashboardCheckIn.proposal, {
    actorId: 'lead-1',
    soloMode: false,
    members: [{ id: 'lead-1', label: 'Trail Lead' }, { id: 'member-2', label: 'Sweep' }],
    now: NOW,
  }).action.kind, 'open_composer');

  const dashboardBoard = adapters.createDashboardMissionCommandProposal({
    ...dashboardInput,
    sourceEntityId: 'brief-open-board-1',
    action: 'open_mission_command',
    command: null,
  });
  assert.equal(dashboardBoard.ok, true);
  assert.equal(proposal.confirmMissionCommandProposal(dashboardBoard.proposal, {
    actorId: 'lead-1',
    soloMode: false,
    members: [],
    now: NOW,
  }).action.kind, 'open_board');

  const dashboardPlaybook = adapters.createDashboardMissionCommandProposal({
    ...dashboardInput,
    sourceEntityId: 'brief-playbook-1',
    action: 'start_playbook',
    command: null,
    playbookId: 'route_blockage',
  });
  assert.equal(dashboardPlaybook.ok, true);
  assert.equal(proposal.confirmMissionCommandProposal(dashboardPlaybook.proposal, {
    actorId: 'lead-1',
    soloMode: false,
    members: [],
    now: NOW,
  }).action.kind, 'open_playbook');

  const fleetInput = {
    ...common({ sourceEntityId: 'vehicle-1', linkedContext: null, returnRoute: '/fleet' }),
    snapshot: {
      vehicleId: 'vehicle-1',
      label: 'Trail Rig',
      readiness: 'watch',
      payload: '84% GVWR usage',
      recoveryEquipment: 'partial',
      confidence: 'medium',
    },
  };
  sourceInputs.push(fleetInput);
  const fleet = withoutMutation(adapters.createFleetMissionCommandProposal, fleetInput);
  assert.equal(fleet.ok, true);
  assert.equal(fleet.proposal.origin.domain, 'fleet');
  assert.equal(fleet.proposal.linkedContext.type, 'vehicle');
  assert.equal(fleet.proposal.facts.some((fact) => fact.key === 'payload'), true);

  const navigateInput = {
    ...common({ sourceEntityId: 'blockage-1', returnRoute: '/navigate' }),
    operation: 'route_blockage_report',
    command: command({ type: 'route' }),
  };
  sourceInputs.push(navigateInput);
  const navigate = withoutMutation(adapters.createNavigateMissionCommandProposal, navigateInput);
  assert.equal(navigate.ok, true);
  assert.equal(navigate.proposal.origin.domain, 'navigate');

  const exploreInput = {
    ...common({ sourceEntityId: 'trip-plan-1', returnRoute: '/explore-trip-builder' }),
    planningAction: 'planned_check_in',
    command: command({ type: 'check_in' }),
  };
  sourceInputs.push(exploreInput);
  const explore = withoutMutation(adapters.createExploreMissionCommandProposal, exploreInput);
  assert.equal(explore.ok, true);
  assert.equal(explore.proposal.origin.domain, 'trip_builder');

  const exploreSurface = withoutMutation(adapters.createExploreMissionCommandProposal, {
    ...exploreInput,
    sourceEntityId: 'explore-route-1',
    sourceSurface: 'explore',
  });
  assert.equal(exploreSurface.ok, true);
  assert.equal(exploreSurface.proposal.origin.domain, 'explore');

  const campInput = {
    ...common({ sourceEntityId: 'camp-decision-1', returnRoute: '/dashboard' }),
    decision: 'camp_diversion_deadline',
    authority: 'campops',
  };
  sourceInputs.push(campInput);
  const camp = withoutMutation(adapters.createCampOpsMissionCommandProposal, campInput);
  assert.equal(camp.ok, true);
  assert.equal(camp.proposal.origin.domain, 'campops');
  assert.equal(camp.proposal.facts.some((fact) => fact.value.includes('CampOps')), true);

  const weatherInput = {
    ...common({
      sourceEntityId: 'weather-hazard-1',
      linkedContext: null,
      command: command({ type: 'route' }),
    }),
    hazardKind: 'wind',
    material: true,
  };
  sourceInputs.push(weatherInput);
  const weather = withoutMutation(adapters.createWeatherMissionCommandProposal, weatherInput);
  assert.equal(weather.ok, true);
  assert.equal(weather.proposal.origin.domain, 'weather');

  const incidentInput = {
    ...common({
      sourceEntityId: 'incident-1',
      linkedContext: linkedContext('incident', {
        id: 'incident-1',
        metadata: { source: 'incidentRecoveryWorkflowStore', incidentId: 'incident-1' },
      }),
      action: 'open_incident_room',
      command: null,
      returnRoute: '/safety',
    }),
    incidentId: 'incident-1',
    explicitEscalation: true,
  };
  sourceInputs.push(incidentInput);
  const incident = withoutMutation(adapters.createIncidentRecoveryMissionCommandProposal, incidentInput);
  assert.equal(incident.ok, true);
  assert.equal(incident.proposal.origin.domain, 'incident_recovery');
  assert.equal(incident.proposal.intent, 'open_incident_room');

  sourceInputs.forEach((input) => {
    assert.equal(JSON.stringify(input).includes('status\":\"confirmed'), false);
  });

  const viewedOnly = adapters.createExploreMissionCommandProposal({
    ...exploreInput,
    operatorRequested: false,
  });
  assert.equal(viewedOnly.ok, false);
  assert.equal(viewedOnly.safeCode, 'mission_command_proposal_explicit_action_required');

  const missingContext = adapters.createNavigateMissionCommandProposal({
    ...navigateInput,
    linkedContext: null,
  });
  assert.equal(missingContext.ok, false);
  assert.equal(missingContext.safeCode, 'mission_command_proposal_context_missing');

  const stale = adapters.createDashboardMissionCommandProposal({
    ...dashboardInput,
    sourceTruth: [sourceTruth({ observedAt: STALE, fetchedAt: STALE })],
  });
  assert.equal(stale.ok, true);
  assert.equal(stale.proposal.sourceState.freshness, 'stale');
  assert.equal(stale.proposal.sourceTruth[0].origin, 'live');

  const unsafeReturnRoute = adapters.createDashboardMissionCommandProposal({
    ...dashboardInput,
    sourceEntityId: 'brief-warning-unsafe-return',
    returnRoute: '/dashboard?token=must-not-survive',
  });
  assert.equal(unsafeReturnRoute.ok, true);
  assert.equal(unsafeReturnRoute.proposal.returnRoute, '/dashboard');
  assert.equal(JSON.stringify(unsafeReturnRoute.proposal).includes('must-not-survive'), false);

  const restricted = adapters.createNavigateMissionCommandProposal({
    ...navigateInput,
    summary: 'Restricted member last reported near 39.1234, -120.5678. Coordinate access is not permitted.',
    linkedContext: linkedContext('member', {
      id: 'member-restricted',
      restricted: true,
      coordinates: { latitude: 39.1234, longitude: -120.5678 },
      metadata: {
        locationOwnerMemberId: 'member-2',
        rawProviderBody: { geometry: [[39.1234, -120.5678]] },
      },
    }),
  });
  assert.equal(restricted.ok, true);
  assert.equal(restricted.proposal.linkedContext.restricted, true);
  assert.equal(restricted.proposal.linkedContext.coordinates, undefined);
  assert.equal(JSON.stringify(restricted.proposal).includes('39.1234'), false);
  assert.equal(JSON.stringify(restricted.proposal).includes('rawProviderBody'), false);
  assert.equal(restricted.proposal.summary.includes('[redacted precise coordinates]'), true);

  const sourceSnapshot = JSON.stringify(dashboardInput);
  const confirmed = proposal.confirmMissionCommandProposal(dashboard.proposal, {
    actorId: 'lead-1',
    soloMode: false,
    members: [{ id: 'lead-1', label: 'Trail Lead' }, { id: 'member-2', label: 'Sweep' }],
  });
  assert.equal(confirmed.ok, true);
  assert.equal(confirmed.proposal.status, 'confirmed');
  assert.equal(confirmed.action.kind, 'open_composer');
  assert.equal(confirmed.action.request.form.draftId, `mission-command-proposal:${dashboard.proposal.fingerprint}`);
  assert.equal(JSON.stringify(dashboardInput), sourceSnapshot, 'Confirming a proposal must not mutate source-domain state.');

  const cancelled = proposal.cancelMissionCommandProposal(dashboard.proposal, 'lead-1', NOW);
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.proposal.status, 'cancelled');
  assert.equal(proposal.confirmMissionCommandProposal(cancelled.proposal, {
    actorId: 'lead-1',
    soloMode: false,
    members: [],
  }).ok, false);

  const weatherDuplicate = adapters.createWeatherMissionCommandProposal({
    ...weatherInput,
    createdAt: '2026-07-14T18:05:00.000Z',
  });
  assert.equal(weatherDuplicate.ok, true);
  assert.equal(weatherDuplicate.proposal.fingerprint, weather.proposal.fingerprint);
  const weatherConfirmation = proposal.confirmMissionCommandProposal(weather.proposal, {
    actorId: 'lead-1',
    soloMode: false,
    members: [{ id: 'lead-1', label: 'Trail Lead' }, { id: 'member-2', label: 'Sweep' }],
    now: NOW,
  });
  const weatherDuplicateConfirmation = proposal.confirmMissionCommandProposal(weatherDuplicate.proposal, {
    actorId: 'lead-1',
    soloMode: false,
    members: [{ id: 'lead-1', label: 'Trail Lead' }, { id: 'member-2', label: 'Sweep' }],
    now: NOW,
  });
  assert.equal(weatherConfirmation.ok, true);
  assert.equal(weatherDuplicateConfirmation.ok, true);
  assert.equal(weatherConfirmation.action.kind, 'open_composer');
  assert.equal(weatherDuplicateConfirmation.action.kind, 'open_composer');
  const buildInput = {
    expeditionId: 'expedition-1',
    actor: { id: 'lead-1', label: 'Trail Lead', role: 'owner' },
    soloMode: false,
    catalog: {
      members: [{ id: 'lead-1', label: 'Trail Lead' }, { id: 'member-2', label: 'Sweep' }],
      roles: [],
      vehicles: [],
      teamUnits: [],
      linkedContexts: [],
      milestones: [],
    },
    permissions: {
      roleLabel: 'Owner',
      disabledReason: 'Denied.',
      can: () => ({ allowed: true }),
    },
    queueDelivery: false,
    sourceTruth: weather.proposal.sourceTruth,
    now: NOW,
  };
  const weatherCommand = composer.buildMissionCommandFromComposer({
    ...buildInput,
    form: weatherConfirmation.action.request.form,
  });
  const duplicateWeatherCommand = composer.buildMissionCommandFromComposer({
    ...buildInput,
    form: weatherDuplicateConfirmation.action.request.form,
  });
  assert.equal(weatherCommand.ok, true);
  assert.equal(duplicateWeatherCommand.ok, true);
  assert.equal(weatherCommand.command.id, duplicateWeatherCommand.command.id);
  assert.equal(weatherCommand.command.idempotencyKey, duplicateWeatherCommand.command.idempotencyKey);

  const flowState = { flow: null, stages: 0, clears: 0 };
  const handoff = proposal.createMissionCommandProposalHandoffAdapter({
    loadFlow: async () => flowState.flow,
    stageFlow: async (flow) => {
      flowState.stages += 1;
      flowState.flow = { ...flow, id: `flow-${flowState.stages}`, createdAt: NOW };
      return flowState.flow;
    },
    clearFlow: async () => {
      flowState.clears += 1;
      flowState.flow = null;
    },
    now: () => NOW,
  });

  const offline = adapters.createDashboardMissionCommandProposal({
    ...dashboardInput,
    offline: true,
  });
  assert.equal(offline.ok, true);
  const firstStage = await handoff.stage(offline.proposal);
  const secondStage = await handoff.stage(offline.proposal);
  assert.equal(firstStage.status, 'staged');
  assert.equal(secondStage.status, 'deduplicated');
  assert.equal(flowState.stages, 1);
  assert.equal(flowState.flow.intent, 'mission_command_proposal');
  assert.equal(flowState.flow.context.missionCommandProposal.offline, true);
  assert.equal(flowState.flow.context.missionCommandProposal.returnRoute, '/dashboard');

  const consumed = await handoff.consume();
  assert.equal(consumed.status, 'consumed');
  assert.equal(consumed.proposal.fingerprint, offline.proposal.fingerprint);
  assert.equal(flowState.clears, 1);

  flowState.flow = {
    id: 'unrelated-flow',
    source: 'navigate',
    target: 'alert',
    intent: 'quick_action',
    label: 'Unrelated',
    createdAt: NOW,
  };
  const unrelated = await handoff.consume();
  assert.equal(unrelated.status, 'none');
  assert.equal(flowState.flow.id, 'unrelated-flow', 'Proposal intake must not consume unrelated navigation flows.');
  const blockedByUnrelated = await handoff.stage(offline.proposal);
  assert.equal(blockedByUnrelated.status, 'invalid');
  assert.equal(blockedByUnrelated.safeCode, 'mission_command_proposal_handoff_busy');
  assert.equal(flowState.flow.id, 'unrelated-flow', 'Proposal staging must not overwrite an unrelated navigation flow.');
  const storageUnavailable = proposal.createMissionCommandProposalHandoffAdapter({
    loadFlow: async () => { throw new Error('storage unavailable'); },
    stageFlow: async () => { throw new Error('must not stage'); },
    clearFlow: async () => undefined,
    now: () => NOW,
  });
  const unavailableStage = await storageUnavailable.stage(offline.proposal);
  const unavailableConsume = await storageUnavailable.consume();
  assert.equal(unavailableStage.status, 'invalid');
  assert.equal(unavailableStage.safeCode, 'mission_command_proposal_handoff_unavailable');
  assert.equal(unavailableConsume.status, 'invalid');
  assert.equal(unavailableConsume.safeCode, 'mission_command_proposal_handoff_unavailable');

  const currentExpedition = { id: 'expedition-1' };
  const timeline = [];
  const resolvedCommand = {
    id: 'command-1',
    expeditionId: 'expedition-1',
    type: 'route',
    title: 'Route review',
    operationalState: 'resolved',
    resolution: {
      kind: 'resolved',
      summary: 'Operator confirmed the route decision.',
      occurredAt: NOW,
      actorId: 'lead-1',
    },
  };
  const timelineWriter = {
    getCurrentExpedition: () => currentExpedition,
    getTimeline: () => timeline,
    logTimelineEvent: (eventType, eventData) => {
      const event = { id: `timeline-${timeline.length + 1}`, sessionId: 'expedition-1', eventType, eventData, occurredAt: NOW };
      timeline.push(event);
      return event;
    },
  };
  const appendFirst = resolution.appendMissionCommandResolutionToExpedition(resolvedCommand, timelineWriter);
  const appendDuplicate = resolution.appendMissionCommandResolutionToExpedition(resolvedCommand, timelineWriter);
  assert.equal(appendFirst.status, 'appended');
  assert.equal(appendDuplicate.status, 'duplicate');
  assert.equal(timeline.length, 1);
  assert.deepEqual(Object.keys(timeline[0].eventData).sort(), [
    'missionCommandEventKey',
    'missionCommandId',
    'missionCommandType',
    'occurredAt',
    'resolutionKind',
    'resolutionSummary',
    'source',
  ].sort());
  assert.equal(JSON.stringify(timeline[0]).includes('coordinates'), false);

  const wrongExpedition = resolution.appendMissionCommandResolutionToExpedition(
    { ...resolvedCommand, id: 'command-2', expeditionId: 'expedition-other' },
    timelineWriter,
  );
  assert.equal(wrongExpedition.status, 'expedition_mismatch');
  const unavailableWriter = resolution.appendMissionCommandResolutionToExpedition(resolvedCommand, {
    getCurrentExpedition: () => { throw new Error('storage unavailable'); },
    getTimeline: () => [],
    logTimelineEvent: () => null,
  });
  assert.equal(unavailableWriter.status, 'invalid');

  console.log('Mission Command source proposal integration tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
