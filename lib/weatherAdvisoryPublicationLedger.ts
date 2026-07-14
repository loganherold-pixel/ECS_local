export type WeatherAdvisorySeverity = 'info' | 'watch' | 'warning' | 'critical';

export type WeatherAdvisoryPublicationDecision =
  | 'emitted'
  | 'duplicate_suppressed'
  | 'severity_escalation'
  | 'meaningful_change';

export interface WeatherAdvisoryPublicationInput {
  namespace: string;
  scopeKey: string;
  severity: WeatherAdvisorySeverity;
  fingerprint: string;
  publishedAt: number;
  dedupeWindowMs: number;
  bypassDedupe?: boolean;
}

interface WeatherAdvisoryPublicationRecord {
  key: string;
  namespace: string;
  severity: WeatherAdvisorySeverity;
  fingerprint: string;
  publishedAt: number;
  expiresAt: number;
}

const SEVERITY_RANK: Record<WeatherAdvisorySeverity, number> = {
  info: 0,
  watch: 1,
  warning: 2,
  critical: 3,
};

export function createWeatherAdvisoryPublicationLedger(maxEntries = 256) {
  const records = new Map<string, WeatherAdvisoryPublicationRecord>();
  const capacity = Math.max(16, Math.round(maxEntries));
  let suppressed = 0;
  let evicted = 0;

  function prune(now: number): void {
    for (const [key, record] of records) {
      if (record.expiresAt < now) records.delete(key);
    }
    while (records.size > capacity) {
      const oldestKey = records.keys().next().value;
      if (typeof oldestKey !== 'string') break;
      records.delete(oldestKey);
      evicted += 1;
    }
  }

  function evaluate(input: WeatherAdvisoryPublicationInput): WeatherAdvisoryPublicationDecision {
    const now = Number.isFinite(input.publishedAt) ? input.publishedAt : Date.now();
    const windowMs = Math.max(60_000, Number(input.dedupeWindowMs) || 60_000);
    const key = `${clean(input.namespace, 'weather')}|${clean(input.scopeKey, 'global')}`;
    prune(now);

    const previous = records.get(key);
    let decision: WeatherAdvisoryPublicationDecision = 'emitted';
    if (!input.bypassDedupe && previous && previous.expiresAt >= now) {
      if (SEVERITY_RANK[input.severity] > SEVERITY_RANK[previous.severity]) {
        decision = 'severity_escalation';
      } else if (input.fingerprint === previous.fingerprint) {
        suppressed += 1;
        return 'duplicate_suppressed';
      } else {
        decision = 'meaningful_change';
      }
    }

    records.delete(key);
    records.set(key, {
      key,
      namespace: clean(input.namespace, 'weather'),
      severity: input.severity,
      fingerprint: input.fingerprint,
      publishedAt: now,
      expiresAt: now + windowMs,
    });
    prune(now);
    return decision;
  }

  return {
    evaluate,
    clear(namespace?: string): void {
      if (!namespace) {
        records.clear();
        return;
      }
      const normalized = clean(namespace, 'weather');
      for (const [key, record] of records) {
        if (record.namespace === normalized) records.delete(key);
      }
    },
    getDiagnostics() {
      return {
        devOnly: true as const,
        size: records.size,
        capacity,
        suppressed,
        evicted,
      };
    },
  };
}

export const operationalWeatherAdvisoryLedger = createWeatherAdvisoryPublicationLedger();

function clean(value: string, fallback: string): string {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized || fallback;
}
