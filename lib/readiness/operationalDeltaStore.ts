import { createPersistedKeyValueCache } from '../keyValuePersistence';
import {
  sanitizeSourceTruthDisplayText,
  sanitizeSourceTruthRef,
} from '../sourceTruth';
import {
  OPERATIONAL_DELTA_SCHEMA_VERSION,
  type OperationalDeltaBaselineKind,
  type OperationalDeltaResult,
  type OperationalSnapshot,
  type OperationalSnapshotFact,
  type OperationalSnapshotValue,
} from './operationalDeltaBrief';

export const OPERATIONAL_DELTA_STORE_VERSION = 1;
export const OPERATIONAL_DELTA_STORE_FILE_KEY = 'ecs_operational_delta_brief';
export const OPERATIONAL_DELTA_STORE_STATE_KEY = 'state_v1';

const MAX_CONTEXTS = 24;
const MAX_FACTS_PER_SNAPSHOT = 160;
const MAX_SUPPRESSED_FINGERPRINTS = 120;

export type OperationalDeltaContextRecord = {
  key: string;
  expeditionId: string | null;
  routeId: string | null;
  selectedBaseline: OperationalDeltaBaselineKind;
  baselines: Partial<Record<OperationalDeltaBaselineKind, OperationalSnapshot>>;
  dismissedFingerprints: Record<string, string>;
  acknowledgedFingerprints: Record<string, string>;
  updatedAt: string;
};

export type OperationalDeltaStoreState = {
  version: typeof OPERATIONAL_DELTA_STORE_VERSION;
  hydrated: boolean;
  contexts: Record<string, OperationalDeltaContextRecord>;
};

export type OperationalDeltaStorage = {
  get: (key: string) => string | null;
  set: (key: string, value: string) => void;
  delete?: (key: string) => void;
  waitForHydration?: () => Promise<void>;
  flush?: () => Promise<void>;
};

export type CaptureOperationalDeltaBaselineOptions = {
  overwrite?: boolean;
  select?: boolean;
};

type Listener = () => void;

function validIso(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));
}

function safeNow(candidate?: string | null): string {
  return validIso(candidate) ? candidate : new Date().toISOString();
}

function safeIdentity(value: unknown): string | null {
  const sanitized = sanitizeSourceTruthDisplayText(value, 120);
  if (!sanitized || sanitized === '[redacted]') return null;
  return sanitized.replace(/[^a-zA-Z0-9:_\-.]/g, '_');
}

export function operationalDeltaContextKey(input: {
  expeditionId?: string | null;
  routeId?: string | null;
}): string {
  const expeditionId = safeIdentity(input.expeditionId);
  if (expeditionId) return `expedition:${expeditionId}`;
  const routeId = safeIdentity(input.routeId);
  if (routeId) return `route:${routeId}`;
  return 'planning:unassigned';
}

function safeText(value: unknown, maxLength = 180): string | null {
  const sanitized = sanitizeSourceTruthDisplayText(value, maxLength);
  return sanitized && sanitized !== '[redacted]' ? sanitized : sanitized === '[redacted]' ? '[redacted]' : null;
}

function safeValue(value: OperationalSnapshotValue): OperationalSnapshotValue {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean' || value == null) return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => safeText(item, 120))
      .filter((item): item is string => Boolean(item))
      .slice(0, 40);
  }
  return safeText(value, 180);
}

function isRestrictedLocationFact(fact: OperationalSnapshotFact): boolean {
  const text = `${fact.id} ${fact.label}`.toLowerCase();
  return /(^|[:_\s])(latitude|longitude|coordinate|coordinates|precise[_\s-]?location)([:_\s]|$)/.test(text);
}

function sanitizeFact(fact: OperationalSnapshotFact): OperationalSnapshotFact | null {
  if (!fact?.id || isRestrictedLocationFact(fact)) return null;
  const id = safeIdentity(fact.id);
  const label = safeText(fact.label, 120);
  if (!id || !label) return null;
  return {
    ...fact,
    id,
    label,
    value: safeValue(fact.value),
    displayValue: safeText(fact.displayValue, 120),
    unit: safeText(fact.unit, 24),
    recommendedAction: safeText(fact.recommendedAction, 220),
    sourceTruth: sanitizeSourceTruthRef(fact.sourceTruth),
    dependencies: (fact.dependencies ?? [])
      .map((item) => safeText(item, 180))
      .filter((item): item is string => Boolean(item))
      .slice(0, 12),
  };
}

export function sanitizeOperationalSnapshot(snapshot: OperationalSnapshot): OperationalSnapshot | null {
  if (
    snapshot?.schemaVersion !== OPERATIONAL_DELTA_SCHEMA_VERSION ||
    !validIso(snapshot.capturedAt) ||
    !Array.isArray(snapshot.facts)
  ) {
    return null;
  }
  const facts = snapshot.facts
    .map(sanitizeFact)
    .filter((item): item is OperationalSnapshotFact => Boolean(item))
    .slice(0, MAX_FACTS_PER_SNAPSHOT);
  return {
    id: safeIdentity(snapshot.id) ?? `operational-snapshot:${snapshot.capturedAt}`,
    schemaVersion: OPERATIONAL_DELTA_SCHEMA_VERSION,
    expeditionId: safeIdentity(snapshot.expeditionId),
    routeId: safeIdentity(snapshot.routeId),
    capturedAt: snapshot.capturedAt,
    baselineKind: snapshot.baselineKind ?? null,
    label: safeText(snapshot.label, 120),
    facts,
  };
}

function emptyState(hydrated: boolean): OperationalDeltaStoreState {
  return {
    version: OPERATIONAL_DELTA_STORE_VERSION,
    hydrated,
    contexts: {},
  };
}

function safeFingerprintMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.entries(value as Record<string, unknown>)
    .filter(([fingerprint, timestamp]) =>
      /^opdelta:[a-z0-9]+$/i.test(fingerprint) && validIso(timestamp)
    )
    .sort((left, right) => String(right[1]).localeCompare(String(left[1])))
    .slice(0, MAX_SUPPRESSED_FINGERPRINTS)
    .reduce<Record<string, string>>((output, [fingerprint, timestamp]) => {
      output[fingerprint] = String(timestamp);
      return output;
    }, {});
}

function parseContext(value: unknown): OperationalDeltaContextRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Partial<OperationalDeltaContextRecord>;
  const key = safeIdentity(input.key);
  if (!key || !validIso(input.updatedAt)) return null;
  const baselines: Partial<Record<OperationalDeltaBaselineKind, OperationalSnapshot>> = {};
  (['departure', 'last_stop', 'last_acknowledgment'] as OperationalDeltaBaselineKind[]).forEach((kind) => {
    const candidate = sanitizeOperationalSnapshot(input.baselines?.[kind] as OperationalSnapshot);
    if (candidate) baselines[kind] = { ...candidate, baselineKind: kind };
  });
  const selectedBaseline = input.selectedBaseline === 'last_stop' || input.selectedBaseline === 'last_acknowledgment'
    ? input.selectedBaseline
    : 'departure';
  return {
    key,
    expeditionId: safeIdentity(input.expeditionId),
    routeId: safeIdentity(input.routeId),
    selectedBaseline,
    baselines,
    dismissedFingerprints: safeFingerprintMap(input.dismissedFingerprints),
    acknowledgedFingerprints: safeFingerprintMap(input.acknowledgedFingerprints),
    updatedAt: input.updatedAt,
  };
}

function parseState(raw: string | null): OperationalDeltaStoreState {
  if (!raw) return emptyState(true);
  try {
    const parsed = JSON.parse(raw) as Partial<OperationalDeltaStoreState>;
    if (parsed?.version !== OPERATIONAL_DELTA_STORE_VERSION || !parsed.contexts) {
      return emptyState(true);
    }
    const contexts = Object.values(parsed.contexts)
      .map(parseContext)
      .filter((item): item is OperationalDeltaContextRecord => Boolean(item))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, MAX_CONTEXTS)
      .reduce<Record<string, OperationalDeltaContextRecord>>((output, context) => {
        output[context.key] = context;
        return output;
      }, {});
    return {
      version: OPERATIONAL_DELTA_STORE_VERSION,
      hydrated: true,
      contexts,
    };
  } catch {
    return emptyState(true);
  }
}

function trimContexts(
  contexts: Record<string, OperationalDeltaContextRecord>,
): Record<string, OperationalDeltaContextRecord> {
  return Object.values(contexts)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, MAX_CONTEXTS)
    .reduce<Record<string, OperationalDeltaContextRecord>>((output, context) => {
      output[context.key] = context;
      return output;
    }, {});
}

function trimFingerprintMap(value: Record<string, string>): Record<string, string> {
  return Object.entries(value)
    .sort((left, right) => right[1].localeCompare(left[1]))
    .slice(0, MAX_SUPPRESSED_FINGERPRINTS)
    .reduce<Record<string, string>>((output, [fingerprint, timestamp]) => {
      output[fingerprint] = timestamp;
      return output;
    }, {});
}

export function createOperationalDeltaBriefStore(storage: OperationalDeltaStorage) {
  let state = emptyState(false);
  let hydratePromise: Promise<OperationalDeltaStoreState> | null = null;
  const listeners = new Set<Listener>();

  function notify() {
    listeners.forEach((listener) => {
      try {
        listener();
      } catch {
        // Listener failures must not interrupt local baseline persistence.
      }
    });
  }

  function persist() {
    storage.set(OPERATIONAL_DELTA_STORE_STATE_KEY, JSON.stringify({
      ...state,
      hydrated: undefined,
    }));
  }

  function updateContext(
    snapshot: OperationalSnapshot,
    updater: (context: OperationalDeltaContextRecord) => OperationalDeltaContextRecord,
  ): OperationalDeltaContextRecord {
    const key = operationalDeltaContextKey(snapshot);
    const existing = state.contexts[key] ?? {
      key,
      expeditionId: snapshot.expeditionId,
      routeId: snapshot.routeId,
      selectedBaseline: 'departure' as const,
      baselines: {},
      dismissedFingerprints: {},
      acknowledgedFingerprints: {},
      updatedAt: snapshot.capturedAt,
    };
    const updated = updater(existing);
    state = {
      ...state,
      contexts: trimContexts({
        ...state.contexts,
        [key]: updated,
      }),
    };
    persist();
    notify();
    return updated;
  }

  async function hydrate(): Promise<OperationalDeltaStoreState> {
    if (state.hydrated) return state;
    if (hydratePromise) return hydratePromise;
    hydratePromise = (async () => {
      await storage.waitForHydration?.();
      state = parseState(storage.get(OPERATIONAL_DELTA_STORE_STATE_KEY));
      notify();
      return state;
    })();
    return hydratePromise;
  }

  async function captureBaseline(
    kind: OperationalDeltaBaselineKind,
    snapshot: OperationalSnapshot,
    options: CaptureOperationalDeltaBaselineOptions = {},
  ): Promise<OperationalSnapshot | null> {
    const sanitized = sanitizeOperationalSnapshot(snapshot);
    if (!sanitized) return null;
    await hydrate();
    const baseline = { ...sanitized, baselineKind: kind };
    let accepted: OperationalSnapshot | null = null;
    updateContext(baseline, (context) => {
      const existing = context.baselines[kind];
      if (existing && options.overwrite !== true) {
        accepted = existing;
        return context;
      }
      accepted = baseline;
      return {
        ...context,
        expeditionId: baseline.expeditionId,
        routeId: baseline.routeId,
        selectedBaseline: options.select === true ? kind : context.selectedBaseline,
        baselines: {
          ...context.baselines,
          [kind]: baseline,
        },
        updatedAt: safeNow(baseline.capturedAt),
      };
    });
    return accepted;
  }

  return {
    subscribe(listener: Listener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    getSnapshot(): OperationalDeltaStoreState {
      return state;
    },

    hydrate,

    getContext(input: { expeditionId?: string | null; routeId?: string | null }): OperationalDeltaContextRecord | null {
      return state.contexts[operationalDeltaContextKey(input)] ?? null;
    },

    getBaseline(
      input: { expeditionId?: string | null; routeId?: string | null },
      kind?: OperationalDeltaBaselineKind,
    ): OperationalSnapshot | null {
      const context = state.contexts[operationalDeltaContextKey(input)] ?? null;
      if (!context) return null;
      return context.baselines[kind ?? context.selectedBaseline] ?? null;
    },

    getSuppressedFingerprints(input: {
      expeditionId?: string | null;
      routeId?: string | null;
    }): string[] {
      const context = state.contexts[operationalDeltaContextKey(input)] ?? null;
      if (!context) return [];
      return Array.from(new Set([
        ...Object.keys(context.dismissedFingerprints),
        ...Object.keys(context.acknowledgedFingerprints),
      ])).sort();
    },

    captureBaseline,

    async selectBaseline(
      snapshot: OperationalSnapshot,
      kind: OperationalDeltaBaselineKind,
    ): Promise<boolean> {
      const sanitized = sanitizeOperationalSnapshot(snapshot);
      if (!sanitized) return false;
      await hydrate();
      let selected = false;
      updateContext(sanitized, (context) => {
        if (!context.baselines[kind]) return context;
        selected = true;
        return {
          ...context,
          selectedBaseline: kind,
          updatedAt: safeNow(),
        };
      });
      return selected;
    },

    async markLastStop(snapshot: OperationalSnapshot): Promise<OperationalSnapshot | null> {
      return captureBaseline('last_stop', snapshot, { overwrite: true, select: true });
    },

    async acknowledge(
      result: OperationalDeltaResult,
      snapshot: OperationalSnapshot,
    ): Promise<OperationalSnapshot | null> {
      const sanitized = sanitizeOperationalSnapshot(snapshot);
      if (!sanitized || result.current.id !== snapshot.id) return null;
      await hydrate();
      const baseline = { ...sanitized, baselineKind: 'last_acknowledgment' as const };
      updateContext(baseline, (context) => {
        const acknowledgedAt = safeNow(snapshot.capturedAt);
        const acknowledgedFingerprints = trimFingerprintMap({
          ...context.acknowledgedFingerprints,
          ...result.deltas.reduce<Record<string, string>>((output, delta) => {
            output[delta.fingerprint] = acknowledgedAt;
            return output;
          }, {}),
        });
        return {
          ...context,
          selectedBaseline: 'last_acknowledgment',
          baselines: {
            ...context.baselines,
            last_acknowledgment: baseline,
          },
          acknowledgedFingerprints,
          updatedAt: acknowledgedAt,
        };
      });
      return baseline;
    },

    async dismissDelta(snapshot: OperationalSnapshot, fingerprint: string): Promise<boolean> {
      const sanitized = sanitizeOperationalSnapshot(snapshot);
      if (!sanitized || !/^opdelta:[a-z0-9]+$/i.test(fingerprint)) return false;
      await hydrate();
      updateContext(sanitized, (context) => ({
        ...context,
        dismissedFingerprints: trimFingerprintMap({
          ...context.dismissedFingerprints,
          [fingerprint]: safeNow(),
        }),
        updatedAt: safeNow(),
      }));
      return true;
    },

    async clearContext(input: {
      expeditionId?: string | null;
      routeId?: string | null;
    }): Promise<void> {
      await hydrate();
      const key = operationalDeltaContextKey(input);
      if (!state.contexts[key]) return;
      const contexts = { ...state.contexts };
      delete contexts[key];
      state = { ...state, contexts };
      persist();
      notify();
    },

    async flush(): Promise<void> {
      await storage.flush?.();
    },
  };
}

const persistedStorage = createPersistedKeyValueCache(OPERATIONAL_DELTA_STORE_FILE_KEY);

export const operationalDeltaBriefStore = createOperationalDeltaBriefStore(persistedStorage);
