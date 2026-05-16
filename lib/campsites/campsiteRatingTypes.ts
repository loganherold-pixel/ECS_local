export type CampsiteRating = 'A' | 'B' | 'C' | 'D';

export type CampsiteRatingFactor = {
  label: string;
  value?: string | number;
  impact?: 'positive' | 'neutral' | 'negative';
  description?: string;
};

export function campsiteRatingFromScore(score: number | null | undefined): CampsiteRating {
  if (typeof score !== 'number' || !Number.isFinite(score)) return 'D';
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  return 'D';
}

export function campsiteRatingImpactFromScore(
  score: number | null | undefined,
): CampsiteRatingFactor['impact'] {
  if (typeof score !== 'number' || !Number.isFinite(score)) return 'neutral';
  if (score >= 72) return 'positive';
  if (score >= 50) return 'neutral';
  return 'negative';
}
