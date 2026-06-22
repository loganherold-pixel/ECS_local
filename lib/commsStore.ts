/**
 * Comms Store — Persistence for custom emergency comms entries
 *
 * Stores user-added frequencies, signals, and contacts across web and native.
 * Default entries are never stored here — only user-created custom entries.
 */
import { createPersistedKeyValueCache } from './keyValuePersistence';

export interface CommsEntry {
  id: string;
  label: string;
  detail: string;
}

export interface CustomCommsData {
  frequencies: CommsEntry[];
  signals: CommsEntry[];
  contacts: CommsEntry[];
}

export interface CommsPlanConfirmation {
  confirmedAt: string | null;
}

export type CommsColumnKey = keyof CustomCommsData;

const STORAGE_KEY = 'ecs_custom_comms';
const CONFIRMATION_STORAGE_KEY = 'ecs_custom_comms_confirmation';
const persistence = createPersistedKeyValueCache('ecs_custom_comms');
let memoryStore: CustomCommsData = { frequencies: [], signals: [], contacts: [] };
let confirmationStore: CommsPlanConfirmation = { confirmedAt: null };
let hydrated = false;
const listeners = new Set<() => void>();

function generateId(): string {
  return `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeEntry(entry: Partial<CommsEntry>): CommsEntry | null {
  const label = String(entry.label ?? '').trim();
  const detail = String(entry.detail ?? '').trim();

  if (!label) return null;

  return {
    id: String(entry.id ?? generateId()),
    label,
    detail: detail || '—',
  };
}

function normalize(data: Partial<CustomCommsData> | null | undefined): CustomCommsData {
  const mapColumn = (entries: unknown): CommsEntry[] => {
    if (!Array.isArray(entries)) return [];
    return entries
      .map((entry) => normalizeEntry((entry ?? {}) as Partial<CommsEntry>))
      .filter((entry): entry is CommsEntry => !!entry);
  };

  return {
    frequencies: mapColumn(data?.frequencies),
    signals: mapColumn(data?.signals),
    contacts: mapColumn(data?.contacts),
  };
}

function hydrateFromPersistence(): void {
  if (hydrated) return;

  try {
    const raw = persistence.get(STORAGE_KEY);
    if (raw) {
      memoryStore = normalize(JSON.parse(raw));
    }
  } catch {}

  try {
    const rawConfirmation = persistence.get(CONFIRMATION_STORAGE_KEY);
    const parsed = rawConfirmation ? JSON.parse(rawConfirmation) : null;
    confirmationStore = {
      confirmedAt: typeof parsed?.confirmedAt === 'string' ? parsed.confirmedAt : null,
    };
  } catch {}

  hydrated = true;
}

function notify(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {}
  });
}

function persist(data: CustomCommsData): void {
  memoryStore = normalize(data);
  try {
    persistence.set(STORAGE_KEY, JSON.stringify(memoryStore));
  } catch {}
  notify();
}

function persistConfirmation(confirmation: CommsPlanConfirmation): void {
  confirmationStore = {
    confirmedAt: confirmation.confirmedAt ?? null,
  };
  try {
    persistence.set(CONFIRMATION_STORAGE_KEY, JSON.stringify(confirmationStore));
  } catch {}
  notify();
}

function getStore(): CustomCommsData {
  hydrateFromPersistence();
  return {
    frequencies: [...memoryStore.frequencies],
    signals: [...memoryStore.signals],
    contacts: [...memoryStore.contacts],
  };
}

function updateColumn(column: CommsColumnKey, updater: (entries: CommsEntry[]) => CommsEntry[]): CustomCommsData {
  const data = getStore();
  const nextColumn = normalize({
    [column]: updater([...data[column]]),
  } as Partial<CustomCommsData>)[column];
  const nextData: CustomCommsData = {
    ...data,
    [column]: nextColumn,
  };
  persist(nextData);
  return getStore();
}

void persistence.waitForHydration().then(() => {
  hydrated = false;
  hydrateFromPersistence();
});

export const commsStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  getAll(): CustomCommsData {
    return getStore();
  },

  getConfirmation(): CommsPlanConfirmation {
    hydrateFromPersistence();
    return { ...confirmationStore };
  },

  waitForHydration(): Promise<void> {
    return persistence.waitForHydration().then(() => {
      hydrated = false;
      hydrateFromPersistence();
    });
  },

  confirmPlan(confirmedAt = new Date().toISOString()): CommsPlanConfirmation {
    persistConfirmation({ confirmedAt });
    return this.getConfirmation();
  },

  replaceColumn(column: CommsColumnKey, entries: CommsEntry[]): CustomCommsData {
    const data = getStore();
    const nextData = normalize({
      ...data,
      [column]: entries,
    });
    persist(nextData);
    return getStore();
  },

  addFrequency(label: string, detail: string): CommsEntry {
    const entry = normalizeEntry({ label, detail });
    if (!entry) {
      throw new Error('Frequency label is required');
    }
    updateColumn('frequencies', (entries) => [...entries, entry]);
    return entry;
  },

  updateFrequency(id: string, label: string, detail: string): void {
    updateColumn('frequencies', (entries) =>
      entries.map((entry) => (entry.id === id ? { ...entry, label, detail } : entry)),
    );
  },

  removeFrequency(id: string): void {
    updateColumn('frequencies', (entries) => entries.filter((entry) => entry.id !== id));
  },

  addSignal(label: string, detail: string): CommsEntry {
    const entry = normalizeEntry({ label, detail });
    if (!entry) {
      throw new Error('Signal label is required');
    }
    updateColumn('signals', (entries) => [...entries, entry]);
    return entry;
  },

  updateSignal(id: string, label: string, detail: string): void {
    updateColumn('signals', (entries) =>
      entries.map((entry) => (entry.id === id ? { ...entry, label, detail } : entry)),
    );
  },

  removeSignal(id: string): void {
    updateColumn('signals', (entries) => entries.filter((entry) => entry.id !== id));
  },

  addContact(label: string, detail: string): CommsEntry {
    const entry = normalizeEntry({ label, detail });
    if (!entry) {
      throw new Error('Contact name is required');
    }
    updateColumn('contacts', (entries) => [...entries, entry]);
    return entry;
  },

  updateContact(id: string, label: string, detail: string): void {
    updateColumn('contacts', (entries) =>
      entries.map((entry) => (entry.id === id ? { ...entry, label, detail } : entry)),
    );
  },

  removeContact(id: string): void {
    updateColumn('contacts', (entries) => entries.filter((entry) => entry.id !== id));
  },
};
