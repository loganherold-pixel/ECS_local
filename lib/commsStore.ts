/**
 * Comms Store — Persistence for custom emergency comms entries
 *
 * Stores user-added frequencies, signals, and contacts in localStorage.
 * Default entries (hardcoded) are never stored here — they're immutable.
 * Only user-added custom entries are persisted.
 */
import { Platform } from 'react-native';

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

const STORAGE_KEY = 'ecs_custom_comms';

function generateId(): string {
  return `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function read(): CustomCommsData {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Ensure contacts array exists for backward compatibility
        if (!parsed.contacts) parsed.contacts = [];
        return parsed;
      }
    }
  } catch {}
  return { frequencies: [], signals: [], contacts: [] };
}

function write(data: CustomCommsData): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
  } catch {}
}

// In-memory fallback for non-web
let memoryStore: CustomCommsData = { frequencies: [], signals: [], contacts: [] };

function getStore(): CustomCommsData {
  if (Platform.OS === 'web') {
    return read();
  }
  return memoryStore;
}

function setStore(data: CustomCommsData): void {
  if (Platform.OS === 'web') {
    write(data);
  } else {
    memoryStore = data;
  }
}

export const commsStore = {
  getAll(): CustomCommsData {
    return getStore();
  },

  addFrequency(label: string, detail: string): CommsEntry {
    const data = getStore();
    const entry: CommsEntry = { id: generateId(), label, detail };
    data.frequencies.push(entry);
    setStore(data);
    return entry;
  },

  removeFrequency(id: string): void {
    const data = getStore();
    data.frequencies = data.frequencies.filter(f => f.id !== id);
    setStore(data);
  },

  addSignal(label: string, detail: string): CommsEntry {
    const data = getStore();
    const entry: CommsEntry = { id: generateId(), label, detail };
    data.signals.push(entry);
    setStore(data);
    return entry;
  },

  removeSignal(id: string): void {
    const data = getStore();
    data.signals = data.signals.filter(s => s.id !== id);
    setStore(data);
  },

  addContact(label: string, detail: string): CommsEntry {
    const data = getStore();
    const entry: CommsEntry = { id: generateId(), label, detail };
    data.contacts.push(entry);
    setStore(data);
    return entry;
  },

  removeContact(id: string): void {
    const data = getStore();
    data.contacts = data.contacts.filter(c => c.id !== id);
    setStore(data);
  },
};

