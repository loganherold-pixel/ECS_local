const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const promptsPath = path.join(root, 'lib', 'ai', 'expeditionPromptRegistry.ts');
const registryPath = path.join(root, 'lib', 'ai', 'expeditionAgentRegistry.ts');
const schemasPath = path.join(root, 'lib', 'ai', 'expeditionAgentSchemas.ts');
const safetyPath = path.join(root, 'lib', 'ai', 'expeditionSafetyPolicy.ts');
const routeConfidencePath = path.join(root, 'lib', 'ai', 'expeditionRouteConfidenceEngine.ts');
const contextBuilderPath = path.join(root, 'lib', 'ai', 'expeditionIntelligenceContextBuilder.ts');
const evidenceConfidencePath = path.join(root, 'lib', 'ai', 'expeditionEvidenceConfidence.ts');
const orchestratorPath = path.join(root, 'lib', 'ai', 'expeditionIntelligenceOrchestrator.ts');
const recoveryIncidentAgentPath = path.join(root, 'lib', 'ai', 'recoveryIncidentAgent.ts');
const uiModelsPath = path.join(root, 'lib', 'ai', 'expeditionIntelligenceUiModels.ts');
const uiComponentsPath = path.join(root, 'components', 'ai', 'ExpeditionIntelligenceCards.tsx');
const agentResponseContractPath = path.join(root, 'lib', 'ai', 'expeditionAgentResponseContract.ts');

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
  BASE_ECS_AI_SYSTEM_PROMPT,
  getExpeditionAgentPrompt,
  listExpeditionAgentPrompts,
} = require(promptsPath);
const {
  buildExpeditionAgentRuntimePrompt,
  getExpeditionAgentDefinition,
  listExpeditionAgentDefinitions,
} = require(registryPath);
const { validateExpeditionAgentResponse } = require(schemasPath);
const { evaluateExpeditionAgentSafety } = require(safetyPath);
const { scoreExpeditionRouteConfidence } = require(routeConfidencePath);
const { buildExpeditionIntelligenceContext } = require(contextBuilderPath);
const { summarizeExpeditionEvidenceConfidence } = require(evidenceConfidencePath);
const { runExpeditionIntelligenceAgents } = require(orchestratorPath);
const { RECOVERY_INCIDENT_AGENT_PROMPT } = require(recoveryIncidentAgentPath);
const {
  buildExpeditionIntelligenceCardModel,
  summarizeAiSurfaceOpportunities,
  toneForIntelligenceStatus,
} = require(uiModelsPath);
const {
  confidenceToBand,
  evidenceFieldToEvidenceItem,
  isAgentResponse,
  statusToRiskLevel,
  toAgentResponse,
} = require(agentResponseContractPath);

const expectedAgents = [
  'expedition_planner',
  'route_risk',
  'camp_logistics',
  'convoy_command',
  'recovery_incident',
  'debrief_intelligence',
  'community_qa',
];

const prompts = listExpeditionAgentPrompts();
assert.deepStrictEqual(prompts.map((prompt) => prompt.id), expectedAgents);
assert.deepStrictEqual(
  listExpeditionAgentDefinitions().map((agent) => agent.id),
  expectedAgents,
  'Agent registry should align with prompt registry.',
);
for (const agentId of expectedAgents) {
  const definition = getExpeditionAgentPrompt(agentId);
  const agent = getExpeditionAgentDefinition(agentId);
  assert.ok(definition.prompt.includes(BASE_ECS_AI_SYSTEM_PROMPT), `${agentId} should include the shared ECS AI system prompt.`);
  assert.ok(definition.prompt.includes('You are ECS Expedition Intelligence, an AI layer inside the ECS app.'), `${agentId} should use ECS Expedition Intelligence identity.`);
  assert.ok(definition.prompt.includes('expedition planning, preparation, route assessment, logistics, convoy coordination, field adaptation, recovery decision support, debriefing, and learning'), `${agentId} should include lifecycle product scope.`);
  assert.ok(definition.prompt.includes('Be practical, concise, and expedition-specific.'), `${agentId} should require concise expedition-specific guidance.`);
  assert.ok(definition.prompt.includes('Use the structured context provided by ECS.'), `${agentId} should require structured ECS context.`);
  assert.ok(definition.prompt.includes('Distinguish facts, assumptions, and missing data.'), `${agentId} should distinguish facts/assumptions/missing data.`);
  assert.ok(definition.prompt.includes('Never invent route, legal, weather, vehicle, or safety information.'), `${agentId} should forbid invention in core data domains.`);
  assert.ok(definition.prompt.includes('Never guarantee that a route, campsite, recovery method, or condition is safe.'), `${agentId} should forbid guaranteed safety claims.`);
  assert.ok(definition.prompt.includes('Always express uncertainty when data is incomplete, stale, conflicting, or unavailable.'), `${agentId} should require uncertainty expression.`);
  assert.ok(definition.prompt.includes('Prefer verifiable recommendations.'), `${agentId} should prefer verifiable recommendations.`);
  assert.ok(definition.prompt.includes('Prioritize human safety, legal access, land stewardship, and responsible travel.'), `${agentId} should include stewardship and legal access.`);
  assert.ok(definition.prompt.includes('local emergency services or appropriate authorities'), `${agentId} should include emergency escalation guidance.`);
  assert.ok(definition.prompt.includes('Provide structured output matching the requested schema.'), `${agentId} should require schema output.`);
  assert.ok(definition.prompt.includes('Keep recommendations actionable and ranked by priority.'), `${agentId} should rank actionable recommendations.`);
  assert.ok(definition.prompt.includes('Plan -> Prepare -> Brief -> Navigate -> Adapt -> Recover -> Debrief -> Learn'), `${agentId} should align with the expedition lifecycle.`);
  assert.ok(definition.prompt.includes('Role:'), `${agentId} should have role clarity.`);
  assert.ok(definition.prompt.includes('not behave like a generic chatbot') || definition.prompt.includes('not a generic chatbot'), `${agentId} should avoid generic chatbot behavior.`);
  assert.ok(definition.prompt.includes('Do not invent facts'), `${agentId} should forbid invention.`);
  assert.ok(definition.prompt.includes('Return valid JSON'), `${agentId} should require structured JSON.`);
  assert.ok(definition.prompt.includes('Required JSON fields'), `${agentId} should name required structured output fields.`);
  assert.ok(definition.prompt.includes('confidence'), `${agentId} should require confidence handling.`);
  assert.ok(definition.prompt.includes('evidence'), `${agentId} should require evidence use.`);
  assert.ok(definition.prompt.includes('uncertainty'), `${agentId} should require uncertainty handling.`);
  assert.ok(definition.prompt.includes('nextActions'), `${agentId} should require next actions.`);
  assert.ok(definition.prompt.includes('Distinguish facts from assumptions'), `${agentId} should distinguish facts from assumptions.`);
  assert.ok(definition.prompt.includes('missing or stale data'), `${agentId} should surface missing/stale data.`);
  assert.ok(definition.prompt.includes('Recommend verification'), `${agentId} should recommend verification under uncertainty.`);
  assert.ok(definition.prompt.includes('guaranteed safe'), `${agentId} should forbid guaranteed safety claims.`);
  assert.ok(definition.prompt.includes('environmental stewardship'), `${agentId} should include stewardship boundaries.`);
  assert.ok(definition.prompt.includes('refuse unsafe tactical detail') || definition.prompt.includes('Refuse unsafe tactical detail'), `${agentId} should refuse unsafe dangerous detail.`);
  assert.ok(agent.defaultEnabled, `${agentId} should be enabled in the additive registry.`);
  assert.strictEqual(agent.lifecyclePhase, definition.lifecyclePhase, `${agentId} phase should match prompt definition.`);
  assert.ok(definition.outputContract.includes('recommendations'), `${agentId} should require recommendations output.`);
  assert.ok(definition.outputContract.includes('risks'), `${agentId} should require risks output.`);
  assert.ok(definition.outputContract.includes('evidence'), `${agentId} should require evidence output.`);
  assert.ok(definition.outputContract.includes('dataLimitations'), `${agentId} should require data limitations.`);
}

const routeRiskPrompt = getExpeditionAgentPrompt('route_risk').prompt;
[
  'You are the ECS Route Risk Agent.',
  'evaluate a proposed route using available ECS context',
  'legal access',
  'route difficulty',
  'terrain',
  'weather',
  'seasonality',
  'vehicle capability',
  'driver skill',
  'recovery gear',
  'remoteness',
  'fuel/water range',
  'trail report freshness',
  'conflicting reports',
  'known hazards',
  'data completeness',
  'Unknown legal access reduces confidence.',
  'Severe weather increases risk.',
  'Stale reports reduce confidence.',
  'Conflicting reports must be called out.',
  'Vehicle or driver mismatch must be clearly explained.',
  'Recommend verification when key data is missing.',
  'Return structured output only.',
  'summary, riskLevel, confidence, top risk factors, missing data, assumptions, evidence, route confidence explanation, and recommended next actions',
].forEach((needle) => {
  assert.ok(routeRiskPrompt.includes(needle), `Route Risk prompt should include: ${needle}`);
});

const recoveryPrompt = getExpeditionAgentPrompt('recovery_incident').prompt;
[
  'You are the ECS Recovery & Incident Agent.',
  'calm, conservative, structured decision support for off-road incidents',
  'assess the situation',
  'identify immediate hazards',
  'stop, stabilize, communicate, or escalate',
  'prepare information for emergency services or recovery assistance',
  'general recovery considerations',
  'must not guarantee safety',
  'encourage risky recovery attempts',
  'replace emergency services',
  'provide overconfident instructions when vehicle position, terrain, equipment, weather, or injuries are unknown',
  'minimize injury, fire, flood, rollover, hypothermia, heat illness, or exposure risk',
  'Escalate when anyone is injured',
  'vehicle is unstable',
  'fire, flood, lightning, severe weather, or exposure is present',
  'recovery requires specialized equipment',
  'stranded without communication or supplies',
  'conditions are worsening',
  'immediate safety assessment',
  'critical questions / missing data',
  'risk level',
  'recommended next actions',
  'what to verify before attempting recovery',
  'when to call emergency services or professional recovery',
].forEach((needle) => {
  assert.ok(recoveryPrompt.includes(needle), `Recovery prompt should include: ${needle}`);
});

const debriefPrompt = getExpeditionAgentPrompt('debrief_intelligence').prompt;
[
  'You are the ECS Debrief Intelligence Agent.',
  'convert post-trip information into structured expedition learning',
  'user notes',
  'route data',
  'timestamps',
  'photos or media metadata if available',
  'vehicle issues',
  'fuel/water usage',
  'campsite experience',
  'trail condition changes',
  'convoy issues',
  'recovery events',
  'user reflections',
  'trip summary',
  'what went well',
  'what went wrong',
  'route condition updates',
  'gear lessons',
  'vehicle lessons',
  'planning lessons',
  'community-report candidates',
  'future recommendations',
  'confidence',
  'evidence',
  'Do not overgeneralize from one trip.',
  'Mark subjective reflections separately from observed facts.',
  'Flag information that may be useful to the ECS community layer.',
].forEach((needle) => {
  assert.ok(debriefPrompt.includes(needle), `Debrief prompt should include: ${needle}`);
});

const communityQaPrompt = getExpeditionAgentPrompt('community_qa').prompt;
[
  'You are the ECS Community QA Agent.',
  'normalize and assess user-submitted trail, campsite, route, and condition reports',
  'freshness',
  'specificity',
  'consistency',
  'contradiction with other reports',
  'safety relevance',
  'legal/access relevance',
  'weather or season dependence',
  'vehicle and driver context',
  'confidence level',
  'Do not discard user reports simply because they conflict.',
  'Identify the conflict',
  'lower confidence if needed',
  'preserve useful details',
  'recommend verification if the report affects safety or access',
  'normalized report',
  'safety flags',
  'access flags',
  'contradiction flags',
  'suggested tags',
  'influence Route Confidence',
].forEach((needle) => {
  assert.ok(communityQaPrompt.includes(needle), `Community QA prompt should include: ${needle}`);
});

assert.ok(RECOVERY_INCIDENT_AGENT_PROMPT.includes('Recovery & Incident Agent'), 'Dedicated recovery prompt should retain agent identity.');
assert.ok(RECOVERY_INCIDENT_AGENT_PROMPT.includes('Recover -> Debrief -> Learn'), 'Dedicated recovery prompt should align with lifecycle.');
assert.ok(RECOVERY_INCIDENT_AGENT_PROMPT.includes('confidence'), 'Dedicated recovery prompt should require confidence handling.');
assert.ok(RECOVERY_INCIDENT_AGENT_PROMPT.includes('evidence'), 'Dedicated recovery prompt should require evidence use.');
assert.ok(RECOVERY_INCIDENT_AGENT_PROMPT.includes('assumptions'), 'Dedicated recovery prompt should distinguish assumptions.');
assert.ok(RECOVERY_INCIDENT_AGENT_PROMPT.includes('nextActions'), 'Dedicated recovery prompt should require next actions.');
assert.ok(RECOVERY_INCIDENT_AGENT_PROMPT.includes('Refuse unsafe tactical detail'), 'Dedicated recovery prompt should refuse unsafe dangerous detail.');
assert.ok(RECOVERY_INCIDENT_AGENT_PROMPT.includes('guaranteed safe'), 'Dedicated recovery prompt should forbid guaranteed safety claims.');
assert.ok(RECOVERY_INCIDENT_AGENT_PROMPT.includes('calm, conservative, structured decision support for off-road incidents'), 'Dedicated recovery prompt should define conservative incident role.');
assert.ok(RECOVERY_INCIDENT_AGENT_PROMPT.includes('vehicle position, terrain, equipment, weather, or injuries are unknown'), 'Dedicated recovery prompt should block overconfident unknown-state recovery instructions.');
assert.ok(RECOVERY_INCIDENT_AGENT_PROMPT.includes('Output must include immediate safety assessment'), 'Dedicated recovery prompt should include required incident output sections.');

const aiSurfaceOpportunities = summarizeAiSurfaceOpportunities();
assert.ok(aiSurfaceOpportunities.some((item) => item.includes('Dashboard Mission Brief')), 'AI output should map to existing dashboard brief surfaces.');
assert.ok(aiSurfaceOpportunities.some((item) => item.includes('Route Confidence')), 'AI output should map to existing route confidence surfaces.');
assert.ok(aiSurfaceOpportunities.some((item) => item.includes('Assistant guidance')), 'AI output should map to existing assistant guidance surfaces.');
assert.ok(aiSurfaceOpportunities.some((item) => item.includes('debrief')), 'AI output should map to existing debrief surfaces.');
assert.ok(aiSurfaceOpportunities.some((item) => item.includes('Community report')), 'AI output should map to existing community report surfaces.');

const uiComponentSource = fs.readFileSync(uiComponentsPath, 'utf8');
[
  'ExpeditionBriefCard',
  'RouteConfidenceCard',
  'RiskFactorsList',
  'MissingDataList',
  'RecommendedNextActions',
  'CampLogisticsSuggestionsCard',
  'DebriefSummaryCard',
  'CommunityReportQAIndicators',
  'ECSBadge',
  'ECSChip',
].forEach((needle) => {
  assert.ok(uiComponentSource.includes(needle), `AI UI component module should include ${needle}.`);
});

const runtimePrompt = buildExpeditionAgentRuntimePrompt('route_risk', '{"evidence":[]}');
assert.ok(runtimePrompt.includes('Structured expedition context'), 'Runtime prompt should include structured context.');
assert.ok(runtimePrompt.includes('"evidence":[]'), 'Runtime prompt should include context JSON.');

function validResponse(overrides = {}) {
  return {
    agentId: 'route_risk',
    lifecyclePhase: 'navigate',
    status: 'watch',
    confidence: 'medium',
    summary: 'Route confidence is watch because recent evidence is mixed.',
    recommendations: ['Refresh route evidence before committing.'],
    risks: ['Community report evidence is mixed.'],
    why: ['ECS used legal status, route geometry, and report evidence.'],
    evidence: [
      { id: 'legal', label: 'Legal status', value: 'open', source: 'route' },
      { id: 'report', label: 'Community report', value: 'mixed', source: 'community' },
    ],
    uncertainty: ['Community report evidence is mixed.'],
    recommendedAction: 'Review legal/access and recent report details before committing.',
    nextActions: ['Refresh route evidence.'],
    escalationRecommended: false,
    escalationReason: null,
    dataLimitations: ['Community report evidence may be incomplete.'],
    safetyNotes: ['Use human judgment and local authority guidance.'],
    doNotDo: ['Do not treat ECS as proof that the route is safe.'],
    ...overrides,
  };
}

let validation = validateExpeditionAgentResponse(validResponse());
assert.strictEqual(validation.valid, true, 'Valid agent response should pass schema validation.');

assert.strictEqual(confidenceToBand('medium'), 'moderate', 'Contract adapter should map existing medium confidence to moderate band.');
assert.strictEqual(confidenceToBand('high'), 'high');
assert.strictEqual(statusToRiskLevel('normal'), 'low');
assert.strictEqual(statusToRiskLevel('watch'), 'moderate');
assert.strictEqual(statusToRiskLevel('caution'), 'elevated');
assert.strictEqual(statusToRiskLevel('critical'), 'high');
assert.strictEqual(statusToRiskLevel('critical', true), 'severe');

const legalEvidenceItem = evidenceFieldToEvidenceItem({
  id: 'legal-access',
  label: 'Legal access',
  value: 'unknown',
  source: 'route',
  missing: true,
  confidence: 'low',
});
assert.strictEqual(legalEvidenceItem.sourceType, 'legal_access');
assert.strictEqual(legalEvidenceItem.freshness, 'unknown');
assert.strictEqual(legalEvidenceItem.reliability, 'low');

const structuredAgentResponse = toAgentResponse(validResponse({
  status: 'critical',
  confidence: 'low',
  escalationRecommended: true,
  escalationReason: 'Severe weather and missing legal access.',
  recommendations: ['Stop and verify access.'],
  risks: ['Severe weather exposure.'],
  dataLimitations: ['Legal access is unknown.'],
  uncertainty: ['Weather timing is uncertain.'],
  nextActions: ['Verify legal access.', 'Reassess weather.'],
  evidence: [
    { id: 'weather', label: 'Weather', value: 'severe', source: 'weather', confidence: 'low' },
    { id: 'legal-access', label: 'Legal access', value: 'unknown', source: 'route', missing: true },
  ],
}));
assert.strictEqual(isAgentResponse(structuredAgentResponse), true, 'Structured AgentResponse should pass lightweight guard.');
assert.strictEqual(structuredAgentResponse.agent, 'route_risk');
assert.strictEqual(structuredAgentResponse.confidence, 'low');
assert.strictEqual(structuredAgentResponse.riskLevel, 'severe');
assert.strictEqual(structuredAgentResponse.recommendations[0].priority, 'critical');
assert.strictEqual(structuredAgentResponse.nextActions[0].action, 'Verify legal access.');
assert.strictEqual(structuredAgentResponse.risks[0].level, 'severe');
assert.ok(structuredAgentResponse.missingData.includes('Legal access is unknown.'));
assert.ok(structuredAgentResponse.assumptions.includes('Weather timing is uncertain.'));
assert.ok(structuredAgentResponse.evidence.some((item) => item.sourceType === 'legal_access'));
assert.strictEqual(isAgentResponse({ summary: 'not enough' }), false, 'Malformed AgentResponse should fail lightweight guard.');

const readyUiModel = buildExpeditionIntelligenceCardModel({
  response: validResponse({
    status: 'caution',
    confidence: 'low',
    risks: ['Legal status has conflicting evidence.'],
    uncertainty: ['Legal access evidence is stale.'],
    dataLimitations: ['Weather is missing.'],
    recommendations: ['Verify legal access before committing.'],
    nextActions: ['Refresh weather and legal status.'],
  }),
  title: 'Route Confidence',
});
assert.strictEqual(readyUiModel.state, 'ready', 'AI card model should be ready when response data exists.');
assert.strictEqual(readyUiModel.title, 'Route Confidence');
assert.strictEqual(readyUiModel.tone, 'warning', 'Caution response should use warning tone.');
assert.ok(readyUiModel.risks.length > 0, 'AI card model should expose risk factors.');
assert.ok(readyUiModel.missingData.length > 0, 'AI card model should expose missing data.');
assert.ok(readyUiModel.nextActions.length > 0, 'AI card model should expose next actions.');
assert.ok(readyUiModel.confidenceLabel.toLowerCase().includes('confidence'), 'AI card model should show confidence.');

const loadingUiModel = buildExpeditionIntelligenceCardModel({ loading: true });
assert.strictEqual(loadingUiModel.state, 'loading', 'AI card model should support loading state.');
assert.ok(loadingUiModel.uncertainty.length > 0, 'Loading state should communicate pending context.');

const emptyUiModel = buildExpeditionIntelligenceCardModel({});
assert.strictEqual(emptyUiModel.state, 'empty', 'AI card model should support empty state.');
assert.ok(emptyUiModel.summary.includes('workflows can continue'), 'Empty state should not block existing workflows.');

const errorUiModel = buildExpeditionIntelligenceCardModel({ error: 'provider offline' });
assert.strictEqual(errorUiModel.state, 'error', 'AI card model should support error state.');
assert.ok(errorUiModel.nextActions.length > 0, 'Error state should provide a safe fallback action.');

assert.strictEqual(toneForIntelligenceStatus('normal'), 'ready');
assert.strictEqual(toneForIntelligenceStatus('watch'), 'active');
assert.strictEqual(toneForIntelligenceStatus('caution'), 'warning');
assert.strictEqual(toneForIntelligenceStatus('critical'), 'unavailable');

validation = validateExpeditionAgentResponse({
  summary: 'Missing most required fields.',
});
assert.strictEqual(validation.valid, false, 'Malformed response should fail schema validation.');
assert.ok(validation.issues.some((issue) => issue.code === 'invalid_agent'));
assert.ok(validation.issues.some((issue) => issue.code === 'missing_evidence'));

let safety = evaluateExpeditionAgentSafety(validResponse());
assert.strictEqual(safety.valid, true, 'Grounded cautious response should pass safety policy.');

safety = evaluateExpeditionAgentSafety(validResponse({
  status: 'critical',
  confidence: 'low',
  summary: 'The route is completely safe and has no hazards.',
  recommendedAction: 'Drive through the floodwater.',
  evidence: [
    { id: 'weather', label: 'Weather', value: 'unknown', source: 'weather', missing: true },
  ],
}));
assert.strictEqual(safety.valid, false, 'Unsafe overconfident recovery response should fail safety policy.');
assert.ok(safety.issues.some((issue) => issue.code === 'unsafe_recovery_instruction'));
assert.ok(safety.issues.some((issue) => issue.code === 'unsafe_certainty'));

safety = evaluateExpeditionAgentSafety(validResponse({
  status: 'critical',
  confidence: 'low',
  summary: 'One person may have a serious injury and the vehicle is stranded.',
  recommendations: ['Stabilize people and contact local emergency services or dispatch where possible.'],
  risks: ['Serious injury status is unresolved.', 'Stranded vehicle exposure can worsen.'],
  uncertainty: ['Location and injury status require confirmation.'],
  recommendedAction: 'Stop, confirm location and injury status, and contact emergency services or appropriate authorities where possible.',
  nextActions: ['Confirm location.', 'Contact emergency services or local authorities.', 'Prepare communication packet.'],
  escalationRecommended: true,
  escalationReason: 'Possible serious injury and stranded vehicle.',
  evidence: [
    { id: 'injury', label: 'Injury status', value: 'possible serious injury', source: 'incident', missing: false },
    { id: 'location', label: 'Location', value: 'unknown', source: 'incident', missing: true },
  ],
}));
assert.strictEqual(safety.valid, true, 'Emergency escalation response should pass when it escalates conservatively.');

safety = evaluateExpeditionAgentSafety(validResponse({
  status: 'critical',
  confidence: 'low',
  summary: 'One person may have a serious injury and the vehicle is stranded.',
  recommendations: ['Continue the plan.'],
  risks: ['Serious injury status is unresolved.'],
  recommendedAction: 'Continue driving to the destination.',
  nextActions: ['Continue route.'],
  escalationRecommended: false,
  escalationReason: null,
  evidence: [
    { id: 'injury', label: 'Injury status', value: 'possible serious injury', source: 'incident', missing: false },
  ],
}));
assert.strictEqual(safety.valid, false, 'Life-threatening scenarios should fail without emergency escalation.');
assert.ok(safety.issues.some((issue) => issue.code === 'missing_emergency_escalation'));

safety = evaluateExpeditionAgentSafety(validResponse({
  status: 'caution',
  confidence: 'low',
  summary: 'Trail access is unknown and recent legal status is unclear.',
  recommendations: ['Verify legal access before proceeding.'],
  risks: ['Unknown legal access could make the route inappropriate.'],
  uncertainty: ['Legal access evidence is unknown.'],
  recommendedAction: 'Verify legal access with current official sources before proceeding.',
  nextActions: ['Verify legal access.', 'Choose alternate route if access remains unclear.'],
  evidence: [
    { id: 'legal', label: 'Legal access', value: 'unknown', source: 'route', missing: true },
  ],
}));
assert.strictEqual(safety.valid, true, 'Unknown legal access should pass when verification is recommended.');

safety = evaluateExpeditionAgentSafety(validResponse({
  status: 'caution',
  confidence: 'medium',
  summary: 'Trail access is unknown and recent legal status is unclear.',
  recommendations: ['Proceed with the planned route.'],
  risks: ['Unknown legal access.'],
  recommendedAction: 'Continue route.',
  nextActions: ['Continue.'],
  evidence: [
    { id: 'legal', label: 'Legal access', value: 'unknown', source: 'route', missing: true },
  ],
}));
assert.strictEqual(safety.valid, false, 'Unknown legal access should fail without verification guidance.');
assert.ok(safety.issues.some((issue) => issue.code === 'missing_verification_action'));

safety = evaluateExpeditionAgentSafety(validResponse({
  status: 'critical',
  confidence: 'low',
  summary: 'Severe weather is active on a remote route.',
  recommendations: ['Stop and reassess route exposure before continuing.'],
  risks: ['Severe weather can reduce visibility, traction, and recovery options.'],
  uncertainty: ['Weather timing and route exposure need verification.'],
  recommendedAction: 'Stop, reassess conditions, and reroute or delay if severe weather remains active.',
  nextActions: ['Verify weather.', 'Reassess route exposure.', 'Reroute if needed.'],
  escalationRecommended: true,
  escalationReason: 'Severe weather on remote route.',
  evidence: [
    { id: 'weather', label: 'Weather', value: 'severe weather', source: 'weather' },
  ],
}));
assert.strictEqual(safety.valid, true, 'Severe weather should pass when stop/reassess/escalation guidance is present.');

safety = evaluateExpeditionAgentSafety(validResponse({
  status: 'critical',
  confidence: 'low',
  summary: 'Vehicle recovery incident on unstable terrain.',
  recommendations: ['Use general decision support: stabilize people, confirm hazards, and contact a recovery operator if needed.'],
  risks: ['Unstable terrain and vehicle recovery increase exposure.'],
  uncertainty: ['Recovery anchor, slope, and vehicle state are not verified.'],
  recommendedAction: 'Stop, reassess hazards, and avoid step-by-step recovery actions until a qualified recovery operator or safer plan is available.',
  nextActions: ['Stabilize people.', 'Confirm hazards.', 'Contact recovery operator if needed.'],
  escalationRecommended: true,
  escalationReason: 'Vehicle recovery incident with unstable terrain.',
  evidence: [
    { id: 'incident', label: 'Incident', value: 'vehicle recovery on unstable terrain', source: 'incident' },
  ],
}));
assert.strictEqual(safety.valid, true, 'Recovery incident should pass when guidance stays general and escalates.');

safety = evaluateExpeditionAgentSafety(validResponse({
  status: 'caution',
  confidence: 'high',
  summary: 'Data is missing, but the route can continue.',
  recommendations: ['Proceed.'],
  risks: ['Weather is unknown.'],
  uncertainty: ['Weather, legal access, and communication status are missing.'],
  recommendedAction: 'Proceed with route.',
  nextActions: ['Proceed.'],
  evidence: [
    { id: 'weather', label: 'Weather', value: 'unknown', source: 'weather', missing: true },
    { id: 'legal', label: 'Legal access', value: 'unknown', source: 'route', missing: true },
  ],
}));
assert.strictEqual(safety.valid, false, 'Insufficient data should fail when response stays high confidence.');
assert.ok(safety.issues.some((issue) => issue.code === 'insufficient_data_overconfidence'));

const normal = scoreExpeditionRouteConfidence({
  routeId: 'easy-legal',
  routeName: 'Cedar Flats',
  legalStatus: 'open',
  legalStatusFreshness: 'fresh',
  trailDifficulty: 'easy',
  weatherRisk: 'none',
  remoteness: 'low',
  vehicleCapability: 'capable',
  driverExperience: 'experienced',
  routeGeometryComplete: true,
  hasBailoutOptions: true,
  communityReports: [
    { id: 'report-1', summary: 'Recent easy passability report', sentiment: 'positive', freshness: 'fresh', source: 'community' },
  ],
});
assert.strictEqual(normal.status, 'normal', 'Easy legal trail should be normal.');
assert.ok(['high', 'medium'].includes(normal.level), 'Easy legal trail should have usable confidence.');
assert.strictEqual(normal.escalationRecommended, false);

const unknownLegalBadReport = scoreExpeditionRouteConfidence({
  routeId: 'unknown-bad-report',
  legalStatus: 'unknown',
  legalStatusFreshness: 'unknown',
  trailDifficulty: 'moderate',
  weatherRisk: 'watch',
  remoteness: 'moderate',
  vehicleCapability: 'capable',
  driverExperience: 'moderate',
  routeGeometryComplete: true,
  communityReports: [
    { id: 'report-2', summary: 'Recent washout report', sentiment: 'bad', freshness: 'fresh', source: 'community' },
  ],
  missingData: ['legal status'],
});
assert.notStrictEqual(unknownLegalBadReport.status, 'normal', 'Unknown legal status with bad report should not be normal.');
assert.notStrictEqual(unknownLegalBadReport.level, 'high', 'Unknown legal status should not produce high confidence.');
assert.ok(unknownLegalBadReport.dataLimitations.some((item) => item.toLowerCase().includes('legal')));
assert.ok(['low', 'moderate', 'elevated', 'high', 'severe'].includes(unknownLegalBadReport.riskLevel), 'Route engine should expose a display risk level.');
assert.ok(Array.isArray(unknownLegalBadReport.scoreComponents) && unknownLegalBadReport.scoreComponents.length > 0, 'Route engine should explain score components.');
assert.ok(Array.isArray(unknownLegalBadReport.components) && unknownLegalBadReport.components.length > 0, 'Route engine should expose structured components.');
assert.ok(unknownLegalBadReport.components.some((component) => component.key === 'legal_access'), 'Route components should include legal access.');
assert.ok(unknownLegalBadReport.components.every((component) => typeof component.score === 'number' && component.score >= 0 && component.score <= 100), 'Route component scores should be bounded.');
assert.ok(unknownLegalBadReport.components.every((component) => ['low', 'moderate', 'elevated', 'high', 'severe'].includes(component.riskLevel)), 'Route components should expose risk levels.');
assert.ok(unknownLegalBadReport.explanation.length > 0, 'Route engine should include a display explanation.');
assert.ok(unknownLegalBadReport.recommendedNextActions.length > 0, 'Route engine should recommend next actions.');
assert.ok(unknownLegalBadReport.recommendedNextActions.every((action) => action.title && action.rationale), 'Route next actions should be structured recommendations.');
assert.ok(unknownLegalBadReport.recommendedNextActionLabels.length > 0, 'Route engine should preserve legacy next action labels.');
assert.ok(unknownLegalBadReport.evidence.some((item) => item.sourceType === 'legal_access'), 'Route evidence should use structured evidence items.');
assert.ok(unknownLegalBadReport.legacyEvidence.some((item) => item.id === 'legal-status'), 'Route engine should preserve legacy evidence fields.');
assert.ok(unknownLegalBadReport.assumptions.length > 0, 'Route engine should surface assumptions.');

const severeWeatherRemote = scoreExpeditionRouteConfidence({
  routeId: 'remote-weather',
  legalStatus: 'open',
  legalStatusFreshness: 'fresh',
  trailDifficulty: 'hard',
  weatherRisk: 'severe',
  remoteness: 'remote',
  vehicleCapability: 'capable',
  driverExperience: 'experienced',
  routeGeometryComplete: true,
  hasBailoutOptions: false,
});
assert.ok(['caution', 'critical'].includes(severeWeatherRemote.status), 'Severe weather on remote trail should elevate risk.');
assert.strictEqual(severeWeatherRemote.escalationRecommended, true, 'Severe remote weather should offer escalation path.');
assert.ok(severeWeatherRemote.concerns.some((item) => item.toLowerCase().includes('weather')));

const recoveryIncident = scoreExpeditionRouteConfidence({
  routeId: 'recovery-route',
  legalStatus: 'open',
  legalStatusFreshness: 'fresh',
  trailDifficulty: 'hard',
  weatherRisk: 'watch',
  remoteness: 'remote',
  vehicleCapability: 'marginal',
  driverExperience: 'moderate',
  routeGeometryComplete: true,
  recoveryIncidentActive: true,
  incidentEscalationRecommended: true,
});
assert.strictEqual(recoveryIncident.status, 'critical', 'Recovery incident should force critical route confidence state.');
assert.strictEqual(recoveryIncident.escalationRecommended, true);
assert.ok(recoveryIncident.escalationReason);

const staleConflictingCommunityInput = {
  routeId: 'conflicting-community',
  legalStatus: 'conflicting',
  legalStatusFreshness: 'aging',
  trailDifficulty: 'moderate',
  weatherRisk: 'unknown',
  remoteness: 'unknown',
  vehicleCapability: 'unknown',
  driverExperience: 'moderate',
  routeGeometryComplete: true,
  communityReports: [
    { id: 'report-3', summary: 'Older report says open', sentiment: 'positive', freshness: 'stale', source: 'community' },
    { id: 'report-4', summary: 'Another report says blocked', sentiment: 'conflicting', freshness: 'stale', source: 'community' },
  ],
  staleData: ['community report'],
};
const staleConflictingCommunity = scoreExpeditionRouteConfidence(staleConflictingCommunityInput);
assert.notStrictEqual(staleConflictingCommunity.status, 'normal', 'Conflicting stale community reports should not be normal.');
assert.notStrictEqual(staleConflictingCommunity.level, 'high', 'Conflicting stale reports should not be high confidence.');
assert.ok(staleConflictingCommunity.dataLimitations.some((item) => item.toLowerCase().includes('community')));

const routeConfidenceFixtures = [
  {
    name: 'Legal easy trail + capable vehicle + experienced driver',
    input: {
      routeId: 'fixture-easy-legal',
      routeName: 'Legal Easy Trail',
      legalStatus: 'open',
      legalStatusFreshness: 'fresh',
      trailDifficulty: 'easy',
      weatherRisk: 'none',
      seasonalityRisk: 'low',
      remoteness: 'low',
      vehicleCapability: 'capable',
      driverSkill: 'experienced',
      recoveryDifficulty: 'easy',
      campsiteAvailability: 'available',
      resupplyAvailability: 'available',
      routeGeometryComplete: true,
      hasBailoutOptions: true,
      dataCompleteness: 'complete',
      communityReports: [
        { id: 'fixture-report-1', summary: 'Recent open/passable report', sentiment: 'positive', freshness: 'fresh', source: 'community' },
      ],
    },
    verify(result) {
      assert.strictEqual(result.status, 'normal');
      assert.strictEqual(result.riskLevel, 'low');
      assert.ok(result.score >= 80);
      assert.ok(['high', 'moderate'].includes(result.confidenceBand));
    },
  },
  {
    name: 'Unknown legal status + stale reports',
    input: {
      routeId: 'fixture-unknown-legal-stale',
      legalStatus: 'unknown',
      legalStatusFreshness: 'unknown',
      trailDifficulty: 'moderate',
      weatherRisk: 'none',
      seasonalityRisk: 'unknown',
      remoteness: 'moderate',
      vehicleCapability: 'capable',
      driverSkill: 'moderate',
      recoveryDifficulty: 'moderate',
      routeGeometryComplete: true,
      dataCompleteness: 'partial',
      communityReports: [
        { id: 'fixture-report-2', summary: 'Old passability report', sentiment: 'positive', freshness: 'stale', source: 'community' },
      ],
      missingData: ['legal status'],
      staleData: ['community report'],
    },
    verify(result) {
      assert.notStrictEqual(result.status, 'normal');
      assert.notStrictEqual(result.confidenceBand, 'high');
      assert.ok(result.dataLimitations.some((item) => item.toLowerCase().includes('legal')));
      assert.ok(result.dataLimitations.some((item) => item.toLowerCase().includes('community')));
    },
  },
  {
    name: 'Severe weather + remote route',
    input: {
      routeId: 'fixture-severe-weather-remote',
      legalStatus: 'open',
      legalStatusFreshness: 'fresh',
      trailDifficulty: 'moderate',
      weatherRisk: 'severe',
      seasonalityRisk: 'moderate',
      remoteness: 'remote',
      vehicleCapability: 'capable',
      driverSkill: 'experienced',
      recoveryDifficulty: 'hard',
      routeGeometryComplete: true,
      hasBailoutOptions: false,
      dataCompleteness: 'complete',
    },
    verify(result) {
      assert.ok(['high', 'severe'].includes(result.riskLevel));
      assert.strictEqual(result.escalationRecommended, true);
      assert.ok(result.concerns.some((item) => item.toLowerCase().includes('weather')));
    },
  },
  {
    name: 'Hard route + novice driver',
    input: {
      routeId: 'fixture-hard-novice',
      legalStatus: 'open',
      legalStatusFreshness: 'fresh',
      trailDifficulty: 'technical',
      weatherRisk: 'none',
      seasonalityRisk: 'low',
      remoteness: 'moderate',
      vehicleCapability: 'capable',
      driverSkill: 'novice',
      recoveryDifficulty: 'hard',
      campsiteAvailability: 'available',
      resupplyAvailability: 'available',
      routeGeometryComplete: true,
      dataCompleteness: 'complete',
    },
    verify(result) {
      assert.notStrictEqual(result.status, 'normal');
      assert.ok(['elevated', 'high', 'severe'].includes(result.riskLevel));
      assert.ok(result.concerns.some((item) => item.toLowerCase().includes('driver')));
      assert.ok(result.recommendedNextActionLabels.some((item) => item.toLowerCase().includes('driver')));
    },
  },
  {
    name: 'Conflicting community reports',
    input: {
      routeId: 'fixture-conflicting-reports',
      legalStatus: 'open',
      legalStatusFreshness: 'fresh',
      trailDifficulty: 'easy',
      weatherRisk: 'none',
      seasonalityRisk: 'low',
      remoteness: 'low',
      vehicleCapability: 'capable',
      driverSkill: 'experienced',
      recoveryDifficulty: 'easy',
      routeGeometryComplete: true,
      dataCompleteness: 'partial',
      communityReports: [
        { id: 'fixture-report-3', summary: 'Report says recently passable', sentiment: 'positive', freshness: 'fresh', source: 'community' },
        { id: 'fixture-report-4', summary: 'Report says route is blocked', sentiment: 'conflicting', freshness: 'fresh', source: 'community' },
      ],
    },
    verify(result) {
      assert.notStrictEqual(result.confidenceBand, 'high');
      assert.notStrictEqual(result.status, 'normal');
      assert.ok(result.concerns.some((item) => item.toLowerCase().includes('conflicting')));
      assert.ok(result.recommendedNextActionLabels.some((item) => item.toLowerCase().includes('conflicting')));
    },
  },
];

for (const fixture of routeConfidenceFixtures) {
  const result = scoreExpeditionRouteConfidence(fixture.input);
  assert.ok(result.score >= 0 && result.score <= 100, `${fixture.name} should produce a 0-100 score.`);
  assert.ok(result.scoreComponents.length > 0, `${fixture.name} should include score components.`);
  assert.ok(result.components.length > 0, `${fixture.name} should include structured route confidence components.`);
  assert.ok(result.evidenceReferences.length > 0, `${fixture.name} should include evidence references.`);
  assert.ok(result.evidence.length > 0, `${fixture.name} should include structured evidence.`);
  assert.ok(result.explanation.length > 0, `${fixture.name} should include a plain-language explanation.`);
  assert.ok(result.recommendedNextActions.length > 0, `${fixture.name} should include recommended next actions.`);
  assert.ok(result.recommendedNextActions.every((action) => action.title && action.priority && action.rationale), `${fixture.name} should include structured next actions.`);
  fixture.verify(result);
}

const intelligenceContext = buildExpeditionIntelligenceContext({
  lifecyclePhase: 'navigate',
  expeditionId: 'expedition-qa',
  route: staleConflictingCommunityInput,
});
assert.strictEqual(intelligenceContext.lifecyclePhase, 'navigate');
assert.ok(intelligenceContext.evidence.length > 0, 'Context builder should expose evidence fields.');
assert.ok(intelligenceContext.missingData.length > 0 || intelligenceContext.staleData.length > 0);
assert.ok(intelligenceContext.generatedAt, 'Context builder should expose generatedAt.');

const richExpeditionContext = buildExpeditionIntelligenceContext({
  lifecyclePhase: 'plan',
  expeditionId: 'expedition-rich',
  route: {
    routeId: 'route-rich',
    routeName: 'Pine Ridge Loop',
    legalStatus: 'open',
    legalStatusFreshness: 'fresh',
    routeDifficulty: 'moderate',
    weatherRisk: 'watch',
    seasonalityRisk: 'moderate',
    remoteness: 'remote',
    vehicleCapability: 'capable',
    driverSkill: 'experienced',
    campsiteAvailability: 'available',
    resupplyAvailability: 'limited',
    communityReports: [
      { id: 'route-report-rich', summary: 'Recent muddy passability report', sentiment: 'neutral', freshness: 'fresh', source: 'community' },
    ],
  },
  userProfile: {
    id: 'user-1',
    displayName: 'Logan',
  },
  driverProfile: {
    driverSkill: 'experienced',
    experience: 'multi-day overland travel',
  },
  vehicleProfile: {
    id: 'vehicle-1',
    name: 'Trail Rig',
    make: 'Toyota',
    model: 'Tacoma',
    trim: 'TRD Off Road',
    modifications: ['skid plates', 'lift'],
    tires: '33 inch all terrain',
    clearanceInches: 10.5,
    drivetrain: '4x4',
    recoveryGear: ['traction boards', 'compressor'],
    capability: 'capable',
  },
  trip: {
    purpose: 'weekend scouting trip',
    startDate: '2026-05-10',
    endDate: '2026-05-12',
    currentSegment: 'north ridge climb',
    knownHazards: ['mud ruts'],
  },
  weather: {
    risk: 'watch',
    summary: 'Rain possible by evening',
    seasonalityRisk: 'moderate',
  },
  legalAccess: {
    status: 'open',
    freshness: 'fresh',
    notes: 'Access checked against current ranger notice.',
  },
  campsiteLogistics: {
    waterRemainingLiters: 24,
    foodDaysRemaining: 3,
    fuelRangeMiles: 180,
    powerHoursRemaining: 36,
    campsiteAvailability: 'available',
    resupplyAvailability: 'limited',
  },
  convoy: {
    memberCount: 3,
  },
  communityReports: [
    { id: 'community-rich-1', summary: 'Mud on north climb', sentiment: 'neutral', freshness: 'fresh', source: 'community', updatedAt: '2026-05-01' },
  ],
  priorDebriefs: [
    { id: 'debrief-1', summary: 'Bring extra water for ridge route.', lessons: ['carry extra water'], routeId: 'route-rich' },
  ],
  learnedPreferences: ['avoid late camp arrivals'],
  now: '2026-05-02T12:00:00.000Z',
});
assert.strictEqual(richExpeditionContext.generatedAt, '2026-05-02T12:00:00.000Z');
assert.strictEqual(richExpeditionContext.tripIntent.purpose.value, 'weekend scouting trip');
assert.strictEqual(richExpeditionContext.routeContext.routeName.value, 'Pine Ridge Loop');
assert.strictEqual(richExpeditionContext.vehicleContext.primaryVehicle.value, 'Trail Rig');
assert.deepStrictEqual(richExpeditionContext.vehicleContext.modifications.value, ['skid plates', 'lift']);
assert.strictEqual(richExpeditionContext.vehicleContext.drivetrain.value, '4x4');
assert.strictEqual(richExpeditionContext.driverContext.driverSkill.value, 'experienced');
assert.strictEqual(richExpeditionContext.environmentalContext.weatherRisk.value, 'watch');
assert.strictEqual(richExpeditionContext.legalAccessContext.status.value, 'open');
assert.strictEqual(richExpeditionContext.logisticsContext.water.value, 24);
assert.strictEqual(richExpeditionContext.logisticsContext.convoyParticipants.value, 3);
assert.strictEqual(richExpeditionContext.communityReportContext.reports.length, 1);
assert.strictEqual(richExpeditionContext.priorDebriefs.length, 1);
assert.ok(richExpeditionContext.evidence.some((item) => item.id === 'vehicle-primary'));
assert.ok(richExpeditionContext.evidence.some((item) => item.id === 'driver-skill'));

const sparseExpeditionContext = buildExpeditionIntelligenceContext({
  lifecyclePhase: 'plan',
  expeditionId: 'expedition-sparse',
  now: '2026-05-02T13:00:00.000Z',
});
assert.strictEqual(sparseExpeditionContext.tripIntent.purpose.value, null);
assert.strictEqual(sparseExpeditionContext.tripIntent.purpose.available, false);
assert.strictEqual(sparseExpeditionContext.routeContext.routeName.available, false);
assert.strictEqual(sparseExpeditionContext.vehicleContext.primaryVehicle.available, false);
assert.strictEqual(sparseExpeditionContext.driverContext.driverSkill.available, false);
assert.strictEqual(sparseExpeditionContext.environmentalContext.weatherRisk.available, false);
assert.strictEqual(sparseExpeditionContext.legalAccessContext.status.available, false);
assert.strictEqual(sparseExpeditionContext.logisticsContext.water.available, false);
assert.strictEqual(sparseExpeditionContext.communityReportContext.reports.length, 0);
assert.ok(sparseExpeditionContext.missingData.includes('Trip intent'));
assert.ok(sparseExpeditionContext.missingData.includes('Primary vehicle'));
assert.ok(sparseExpeditionContext.missingData.includes('Legal access context'));

const evidenceConfidence = summarizeExpeditionEvidenceConfidence(intelligenceContext.evidence);
assert.ok(['medium', 'low', 'unknown'].includes(evidenceConfidence.confidence), 'Missing/stale evidence should soften confidence.');
assert.ok(evidenceConfidence.limitations.length > 0, 'Evidence confidence should surface limitations.');

(async () => {
  const fallbackRun = await runExpeditionIntelligenceAgents({
    context: intelligenceContext,
    agentIds: ['route_risk', 'community_qa'],
  });
  assert.strictEqual(fallbackRun.results.length, 2, 'Orchestrator should run selected agents.');
  assert.ok(fallbackRun.results.every((result) => result.source === 'fallback'), 'No provider should use fallback responses.');
  assert.ok(fallbackRun.results.every((result) => result.validation.valid), 'Fallback responses should validate.');
  assert.ok(fallbackRun.results.every((result) => result.response.recommendations.length > 0));
  assert.ok(fallbackRun.results.every((result) => result.response.risks.length > 0));

  const providerRun = await runExpeditionIntelligenceAgents({
    context: intelligenceContext,
    agentIds: ['route_risk'],
    provider: {
      async generateAgentResponse(input) {
        assert.ok(input.prompt.includes('Route Risk Agent'));
        assert.ok(input.contextJson.includes('route-confidence-legal-status'));
        return validResponse({
          agentId: input.agent.id,
          lifecyclePhase: input.agent.lifecyclePhase,
          status: 'caution',
          confidence: 'medium',
          summary: 'Provider response remains grounded in route evidence.',
          recommendations: ['Refresh legal/access and community report evidence.'],
          risks: ['Legal/access signals conflict.'],
          recommendedAction: 'Refresh legal/access and community report evidence.',
          nextActions: ['Refresh route evidence.'],
          escalationRecommended: false,
          escalationReason: null,
        });
      },
    },
  });
  assert.strictEqual(providerRun.results[0].source, 'provider', 'Valid safe provider response should be accepted.');
  assert.strictEqual(providerRun.results[0].response.status, 'caution');

  const unsafeProviderRun = await runExpeditionIntelligenceAgents({
    context: intelligenceContext,
    agentIds: ['route_risk'],
    provider: {
      async generateAgentResponse(input) {
        return validResponse({
          agentId: input.agent.id,
          lifecyclePhase: input.agent.lifecyclePhase,
          summary: 'The route is completely safe and has no hazards.',
          recommendations: ['Drive through the floodwater.'],
          risks: ['No risk.'],
          recommendedAction: 'Drive through the floodwater.',
          evidence: [
            { id: 'weather', label: 'Weather', value: 'unknown', source: 'weather', missing: true },
          ],
        });
      },
    },
  });
  assert.strictEqual(unsafeProviderRun.results[0].source, 'fallback', 'Unsafe provider response should fall back.');
  assert.ok(unsafeProviderRun.results[0].validation.valid, 'Fallback after unsafe provider response should validate.');

  console.log('Expedition intelligence layer checks passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
