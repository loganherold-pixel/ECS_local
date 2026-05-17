import type {
  ExpeditionEvidenceField,
  ExpeditionIntelligenceConfidence,
} from './expeditionIntelligenceTypes';

export type ExpeditionEvidenceConfidenceResult = {
  confidence: ExpeditionIntelligenceConfidence;
  missingCount: number;
  staleCount: number;
  evidenceCount: number;
  limitations: string[];
};

function confidenceRank(value: ExpeditionIntelligenceConfidence | undefined): number {
  switch (value) {
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
      return 1;
    default:
      return 0;
  }
}

function confidenceFromRank(rank: number): ExpeditionIntelligenceConfidence {
  if (rank >= 3) return 'high';
  if (rank >= 2) return 'medium';
  if (rank >= 1) return 'low';
  return 'unknown';
}

export function summarizeExpeditionEvidenceConfidence(
  evidence: ExpeditionEvidenceField[],
): ExpeditionEvidenceConfidenceResult {
  const evidenceCount = evidence.length;
  const missing = evidence.filter((item) => item.missing);
  const stale = evidence.filter((item) => item.stale);
  const explicitRanks = evidence
    .map((item) => confidenceRank(item.confidence))
    .filter((rank) => rank > 0);
  const averageRank =
    explicitRanks.length > 0
      ? Math.round(explicitRanks.reduce((sum, rank) => sum + rank, 0) / explicitRanks.length)
      : evidenceCount > 0
        ? 2
        : 0;

  let confidence = confidenceFromRank(averageRank);
  if (evidenceCount === 0) confidence = 'unknown';
  else if (missing.length > 0) confidence = confidence === 'high' ? 'medium' : confidence === 'medium' ? 'low' : confidence;
  else if (stale.length > 0 && confidence === 'high') confidence = 'medium';

  return {
    confidence,
    missingCount: missing.length,
    staleCount: stale.length,
    evidenceCount,
    limitations: [
      ...missing.map((item) => `${item.label} is missing.`),
      ...stale.map((item) => `${item.label} is stale.`),
    ],
  };
}
