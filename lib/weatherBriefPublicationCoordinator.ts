import {
  getSharedOperationalWeatherState,
  subscribeSharedOperationalWeather,
} from './useOperationalWeather';
import { publishSharedWeatherBriefAdvisories } from './weatherBriefPublisher';

let leaseCount = 0;
let unsubscribeSharedWeather: (() => void) | null = null;
let publishedRevision = 0;
let lastPublishedAt: string | null = null;

function publishCurrentSharedWeather(): void {
  publishSharedWeatherBriefAdvisories(getSharedOperationalWeatherState().snapshot);
  publishedRevision += 1;
  lastPublishedAt = new Date().toISOString();
}

/**
 * Owns weather-to-Brief publication independently of Dashboard or Dispatch
 * component mounting. Ledger dedupe remains authoritative for emitted entries.
 */
export function startSharedWeatherBriefPublication(): () => void {
  leaseCount += 1;
  if (!unsubscribeSharedWeather) {
    publishCurrentSharedWeather();
    unsubscribeSharedWeather = subscribeSharedOperationalWeather(publishCurrentSharedWeather);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    leaseCount = Math.max(0, leaseCount - 1);
    if (leaseCount === 0) {
      unsubscribeSharedWeather?.();
      unsubscribeSharedWeather = null;
    }
  };
}

export function getSharedWeatherBriefPublicationDiagnostics() {
  return {
    active: unsubscribeSharedWeather != null,
    leaseCount,
    publishedRevision,
    lastPublishedAt,
  };
}
