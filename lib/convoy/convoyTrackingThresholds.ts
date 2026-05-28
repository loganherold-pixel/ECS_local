export const CONVOY_LOCATION_FRESH_UNDER_MS = 5 * 60 * 1000;
export const CONVOY_LOCATION_WATCH_AFTER_MS = 10 * 60 * 1000;
export const CONVOY_LOCATION_STALE_AFTER_MS = 15 * 60 * 1000;

export type ConvoyLocationStaleness = 'fresh' | 'aging' | 'watch' | 'stale';

function minutesLabel(ageMs: number): string {
  const minutes = Math.max(0, Math.round(ageMs / 60_000));
  return `${minutes} min`;
}

export function classifyConvoyLocationStaleness(
  capturedAt: string | null | undefined,
  nowMs = Date.now(),
): { staleness: ConvoyLocationStaleness; isStale: boolean; staleReason: string | null } {
  const capturedMs = Date.parse(String(capturedAt ?? ''));
  if (!Number.isFinite(capturedMs)) {
    return {
      staleness: 'stale',
      isStale: true,
      staleReason: 'Location timestamp unavailable.',
    };
  }

  const ageMs = Math.max(0, nowMs - capturedMs);
  if (ageMs >= CONVOY_LOCATION_STALE_AFTER_MS) {
    return {
      staleness: 'stale',
      isStale: true,
      staleReason: `Location update is stale (${minutesLabel(ageMs)} old).`,
    };
  }
  if (ageMs >= CONVOY_LOCATION_WATCH_AFTER_MS) {
    return {
      staleness: 'watch',
      isStale: false,
      staleReason: `Location update needs a check (${minutesLabel(ageMs)} old).`,
    };
  }
  if (ageMs >= CONVOY_LOCATION_FRESH_UNDER_MS) {
    return {
      staleness: 'aging',
      isStale: false,
      staleReason: null,
    };
  }
  return {
    staleness: 'fresh',
    isStale: false,
    staleReason: null,
  };
}
