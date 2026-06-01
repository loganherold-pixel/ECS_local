import type {
  AgentRecommendation,
  AgentRecommendationPriority,
  AgentResponse,
  AgentRisk,
  ConfidenceBand,
  EvidenceFreshness,
  EvidenceItem,
  EvidenceSourceType,
  ExpeditionAgentResponse,
  ExpeditionEvidenceField,
  ExpeditionIntelligenceConfidence,
  ExpeditionIntelligenceRiskLevel,
  RiskLevel,
} from './expeditionIntelligenceTypes';

export function confidenceToBand(confidence: ExpeditionIntelligenceConfidence | ConfidenceBand): ConfidenceBand {
  return confidence === 'medium' ? 'moderate' : confidence;
}

export function statusToRiskLevel(
  status: ExpeditionIntelligenceRiskLevel,
  escalationRecommended = false,
): RiskLevel {
  if (escalationRecommended && status === 'critical') return 'severe';
  switch (status) {
    case 'normal':
      return 'low';
    case 'watch':
      return 'moderate';
    case 'caution':
      return 'elevated';
    case 'critical':
      return 'high';
    default:
      return 'moderate';
  }
}

function sourceToEvidenceSourceType(field: ExpeditionEvidenceField): EvidenceSourceType {
  const label = `${field.id} ${field.label}`.toLowerCase();
  if (label.includes('legal') || label.includes('access')) return 'legal_access';
  if (label.includes('driver')) return 'driver_profile';
  if (label.includes('debrief')) return 'debrief';
  switch (field.source) {
    case 'route':
      return 'route';
    case 'weather':
      return 'weather';
    case 'vehicle':
      return 'vehicle_profile';
    case 'community':
      return 'community_report';
    case 'manual':
      return 'manual_user_input';
    default:
      return 'unknown';
  }
}

function freshnessFromEvidence(field: ExpeditionEvidenceField): EvidenceFreshness {
  if (field.missing) return 'unknown';
  if (field.stale) return 'stale';
  if (field.updatedAt) return 'recent';
  return 'unknown';
}

export function evidenceFieldToEvidenceItem(field: ExpeditionEvidenceField): EvidenceItem {
  return {
    sourceType: sourceToEvidenceSourceType(field),
    sourceId: field.id,
    label: field.label,
    observedAt: field.updatedAt ?? undefined,
    freshness: freshnessFromEvidence(field),
    reliability: field.confidence ? confidenceToBand(field.confidence) : undefined,
  };
}

function recommendationPriority(
  response: ExpeditionAgentResponse,
): AgentRecommendationPriority {
  if (response.status === 'critical' || response.escalationRecommended) return 'critical';
  if (response.status === 'caution') return 'high';
  if (response.status === 'watch') return 'medium';
  return 'low';
}

function toRecommendation(
  title: string,
  response: ExpeditionAgentResponse,
  action?: string,
): AgentRecommendation {
  return {
    title,
    priority: recommendationPriority(response),
    rationale: response.why[0] ?? response.summary,
    action,
  };
}

function toRisk(
  title: string,
  response: ExpeditionAgentResponse,
  evidence: EvidenceItem[],
): AgentRisk {
  return {
    title,
    level: statusToRiskLevel(response.status, response.escalationRecommended),
    explanation: response.uncertainty[0] ?? response.summary,
    evidence,
  };
}

export function toAgentResponse(response: ExpeditionAgentResponse): AgentResponse {
  const evidence = response.evidence.map(evidenceFieldToEvidenceItem);
  return {
    agent: response.agentId,
    summary: response.summary,
    confidence: confidenceToBand(response.confidence),
    riskLevel: statusToRiskLevel(response.status, response.escalationRecommended),
    recommendations: response.recommendations.map((item) => toRecommendation(item, response)),
    risks: response.risks.map((item) => toRisk(item, response, evidence)),
    missingData: response.dataLimitations,
    assumptions: response.uncertainty,
    evidence,
    nextActions: response.nextActions.map((item) => toRecommendation(item, response, item)),
    userFacingExplanation: response.recommendedAction,
  };
}

export function isAgentResponse(value: unknown): value is AgentResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<AgentResponse>;
  return (
    typeof candidate.agent === 'string' &&
    typeof candidate.summary === 'string' &&
    typeof candidate.confidence === 'string' &&
    typeof candidate.riskLevel === 'string' &&
    Array.isArray(candidate.recommendations) &&
    Array.isArray(candidate.risks) &&
    Array.isArray(candidate.missingData) &&
    Array.isArray(candidate.assumptions) &&
    Array.isArray(candidate.evidence) &&
    Array.isArray(candidate.nextActions) &&
    typeof candidate.userFacingExplanation === 'string'
  );
}
