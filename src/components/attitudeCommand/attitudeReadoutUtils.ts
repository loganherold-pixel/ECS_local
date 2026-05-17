function toFiniteNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export function formatSignedDegrees(value: number, precision: number = 1): string {
  const safePrecision = Math.max(0, Math.min(4, Math.trunc(toFiniteNumber(precision))));
  const safeValue = toFiniteNumber(value);
  const sign = safeValue >= 0 ? '+' : '';

  return `${sign}${safeValue.toFixed(safePrecision)}°`;
}
