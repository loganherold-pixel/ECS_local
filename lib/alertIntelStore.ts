import { createPersistedKeyValueCache } from './keyValuePersistence';

export interface AlertPermitEntry {
  id: string;
  permitName: string;
  issuingAuthority: string;
  requiredFor: string;
  effectiveDates: string;
  notes: string;
}

export interface AlertRestrictionEntry {
  id: string;
  restrictionType: string;
  areaZone: string;
  effectiveDates: string;
  notes: string;
}

export interface AlertClosureEntry {
  id: string;
  closureReason: string;
  areaRoute: string;
  startEnd: string;
  notes: string;
}

export interface AlertPermitsAccessState {
  permits: AlertPermitEntry[];
  restrictions: AlertRestrictionEntry[];
  closures: AlertClosureEntry[];
}

const STORAGE_KEY = 'ecs_alert_permits_access';
const persistence = createPersistedKeyValueCache('ecs_alert_permits_access');

const EMPTY_STATE: AlertPermitsAccessState = {
  permits: [],
  restrictions: [],
  closures: [],
};

let memoryState: AlertPermitsAccessState = EMPTY_STATE;
let hydrated = false;

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizePermit(entry: unknown): AlertPermitEntry | null {
  if (!entry || typeof entry !== 'object') return null;
  const candidate = entry as Partial<AlertPermitEntry>;
  const id = normalizeString(candidate.id).trim();
  if (!id) return null;

  return {
    id,
    permitName: normalizeString(candidate.permitName),
    issuingAuthority: normalizeString(candidate.issuingAuthority),
    requiredFor: normalizeString(candidate.requiredFor),
    effectiveDates: normalizeString(candidate.effectiveDates),
    notes: normalizeString(candidate.notes),
  };
}

function normalizeRestriction(entry: unknown): AlertRestrictionEntry | null {
  if (!entry || typeof entry !== 'object') return null;
  const candidate = entry as Partial<AlertRestrictionEntry>;
  const id = normalizeString(candidate.id).trim();
  if (!id) return null;

  return {
    id,
    restrictionType: normalizeString(candidate.restrictionType),
    areaZone: normalizeString(candidate.areaZone),
    effectiveDates: normalizeString(candidate.effectiveDates),
    notes: normalizeString(candidate.notes),
  };
}

function normalizeClosure(entry: unknown): AlertClosureEntry | null {
  if (!entry || typeof entry !== 'object') return null;
  const candidate = entry as Partial<AlertClosureEntry>;
  const id = normalizeString(candidate.id).trim();
  if (!id) return null;

  return {
    id,
    closureReason: normalizeString(candidate.closureReason),
    areaRoute: normalizeString(candidate.areaRoute),
    startEnd: normalizeString(candidate.startEnd),
    notes: normalizeString(candidate.notes),
  };
}

function normalize(data: unknown): AlertPermitsAccessState {
  if (!data || typeof data !== 'object') return EMPTY_STATE;
  const candidate = data as Partial<AlertPermitsAccessState>;

  return {
    permits: Array.isArray(candidate.permits)
      ? candidate.permits
          .map((entry) => normalizePermit(entry))
          .filter((entry): entry is AlertPermitEntry => !!entry)
      : [],
    restrictions: Array.isArray(candidate.restrictions)
      ? candidate.restrictions
          .map((entry) => normalizeRestriction(entry))
          .filter((entry): entry is AlertRestrictionEntry => !!entry)
      : [],
    closures: Array.isArray(candidate.closures)
      ? candidate.closures
          .map((entry) => normalizeClosure(entry))
          .filter((entry): entry is AlertClosureEntry => !!entry)
      : [],
  };
}

function hydrateFromPersistence(): void {
  if (hydrated) return;

  try {
    const raw = persistence.get(STORAGE_KEY);
    if (raw) {
      memoryState = normalize(JSON.parse(raw));
    }
  } catch {
    memoryState = EMPTY_STATE;
  }

  hydrated = true;
}

function persist(nextState: AlertPermitsAccessState): void {
  memoryState = normalize(nextState);
  persistence.set(STORAGE_KEY, JSON.stringify(memoryState));
}

void persistence.waitForHydration().then(() => {
  hydrated = false;
  hydrateFromPersistence();
});

export const alertIntelStore = {
  getPermitsAccess(): AlertPermitsAccessState {
    hydrateFromPersistence();
    return {
      permits: [...memoryState.permits],
      restrictions: [...memoryState.restrictions],
      closures: [...memoryState.closures],
    };
  },

  async waitForHydration(): Promise<void> {
    await persistence.waitForHydration();
    hydrated = false;
    hydrateFromPersistence();
  },

  async savePermitsAccess(nextState: AlertPermitsAccessState): Promise<void> {
    hydrateFromPersistence();
    persist(nextState);
    await persistence.flush();
  },
};
