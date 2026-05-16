import type {
  ExpeditionAgentDefinition,
  ExpeditionIntelligenceAgentId,
} from './expeditionIntelligenceTypes';
import { getExpeditionAgentPrompt, listExpeditionAgentPrompts } from './expeditionPromptRegistry';

export const EXPEDITION_AGENT_REGISTRY: Record<ExpeditionIntelligenceAgentId, ExpeditionAgentDefinition> = {
  expedition_planner: {
    id: 'expedition_planner',
    label: 'Expedition Planner',
    lifecyclePhase: 'plan',
    description: 'Plans route fit, preparation gaps, offline readiness, and pre-trip operating margin.',
    defaultEnabled: true,
    requiredEvidenceIds: ['route-confidence-legal-status', 'route-confidence-vehicle-fit'],
  },
  route_risk: {
    id: 'route_risk',
    label: 'Route Risk',
    lifecyclePhase: 'navigate',
    description: 'Explains route risk, confidence, terrain, weather, remoteness, access, and reports.',
    defaultEnabled: true,
    requiredEvidenceIds: ['route-confidence-legal-status', 'route-confidence-weather'],
  },
  camp_logistics: {
    id: 'camp_logistics',
    label: 'Camp & Logistics',
    lifecyclePhase: 'prepare',
    description: 'Evaluates camp reachability, daylight, weather, and resource margin.',
    defaultEnabled: true,
    requiredEvidenceIds: ['operational-route-state'],
  },
  convoy_command: {
    id: 'convoy_command',
    label: 'Convoy Command',
    lifecyclePhase: 'adapt',
    description: 'Evaluates convoy accountability, check-ins, spacing, and regroup decisions.',
    defaultEnabled: true,
    requiredEvidenceIds: ['operational-convoy-count'],
  },
  recovery_incident: {
    id: 'recovery_incident',
    label: 'Recovery & Incident',
    lifecyclePhase: 'recover',
    description: 'Keeps incident intelligence focused on safety, location, communication, hazards, and escalation.',
    defaultEnabled: true,
    requiredEvidenceIds: ['incident-status', 'incident-severity'],
  },
  debrief_intelligence: {
    id: 'debrief_intelligence',
    label: 'Debrief Intelligence',
    lifecyclePhase: 'debrief',
    description: 'Summarizes lessons, missing data, planning gaps, and debrief handoff fields.',
    defaultEnabled: true,
    requiredEvidenceIds: ['incident-status'],
  },
  community_qa: {
    id: 'community_qa',
    label: 'Community QA',
    lifecyclePhase: 'learn',
    description: 'Reviews community report confidence, conflicts, staleness, and moderation quality.',
    defaultEnabled: true,
    requiredEvidenceIds: ['route-confidence-legal-status'],
  },
};

export function getExpeditionAgentDefinition(
  id: ExpeditionIntelligenceAgentId,
): ExpeditionAgentDefinition {
  return EXPEDITION_AGENT_REGISTRY[id];
}

export function listExpeditionAgentDefinitions(): ExpeditionAgentDefinition[] {
  return listExpeditionAgentPrompts().map((prompt) => EXPEDITION_AGENT_REGISTRY[prompt.id]);
}

export function buildExpeditionAgentRuntimePrompt(
  id: ExpeditionIntelligenceAgentId,
  contextJson: string,
): string {
  const definition = getExpeditionAgentPrompt(id);
  return [
    `Agent: ${definition.label}`,
    definition.prompt,
    'Structured expedition context:',
    contextJson,
  ].join('\n\n');
}
