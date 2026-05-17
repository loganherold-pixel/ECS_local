export function bucketStableScore(score: number | null | undefined, step = 4): number {
  if (score == null || !Number.isFinite(score)) return 0;
  const normalizedStep = Math.max(1, Math.round(step));
  return Math.round(Math.round(score / normalizedStep) * normalizedStep);
}

export function exceedsStableDelta(
  previousScore: number | null | undefined,
  nextScore: number | null | undefined,
  minDelta = 4,
): boolean {
  if (previousScore == null || !Number.isFinite(previousScore)) return true;
  if (nextScore == null || !Number.isFinite(nextScore)) return false;
  return Math.abs(nextScore - previousScore) >= Math.max(1, Math.round(minDelta));
}
