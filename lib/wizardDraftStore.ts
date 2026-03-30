/**
 * Wizard Draft Store — Persistent Vehicle Config Wizard State
 *
 * Saves wizard progress (step index, selections, vehicle ID) to localStorage
 * so users can exit and resume the vehicle configuration wizard.
 *
 * PERSISTENCE:
 *   - Web: localStorage
 *   - Native: in-memory fallback (no AsyncStorage dependency)
 *
 * DEBOUNCE:
 *   - Auto-save is debounced by 500ms to avoid excessive writes
 *
 * LIFECYCLE:
 *   - Save: on every selection change (debounced)
 *   - Load: on wizard mount
 *   - Clear: on wizard completion or explicit reset
 */
import { Platform } from 'react-native';

// ── Storage key ─────────────────────────────────────────────
const STORAGE_KEY = 'ecs_wizard_draft';

// ── Draft shape ─────────────────────────────────────────────
export interface WizardDraft {
  vehicleId: string;
  vehicleName: string | null;
  stepIndex: number;
  selections: Record<string, string>;
  savedAt: string; // ISO timestamp
}

// ── Persistence helpers (same pattern as appearanceStore) ────
const memoryStore: Record<string, string> = {};

function getStored(key: string): string | null {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch {}
  return memoryStore[key] || null;
}

function setStored(key: string, value: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  } catch {}
  memoryStore[key] = value;
}

function removeStored(key: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
  } catch {}
  delete memoryStore[key];
}

// ── Debounce timer ──────────────────────────────────────────
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 500;

// ── Public API ──────────────────────────────────────────────
export const wizardDraftStore = {
  /**
   * Load saved draft. Returns null if no draft exists.
   */
  load(): WizardDraft | null {
    const raw = getStored(STORAGE_KEY);
    if (!raw) return null;
    try {
      const draft = JSON.parse(raw) as WizardDraft;
      // Validate shape
      if (
        typeof draft.vehicleId === 'string' &&
        typeof draft.stepIndex === 'number' &&
        typeof draft.selections === 'object' &&
        draft.selections !== null
      ) {
        return draft;
      }
    } catch {}
    return null;
  },

  /**
   * Save draft immediately (no debounce).
   */
  saveNow(draft: WizardDraft): void {
    // Cancel any pending debounced save
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    const payload: WizardDraft = {
      ...draft,
      savedAt: new Date().toISOString(),
    };
    setStored(STORAGE_KEY, JSON.stringify(payload));
  },

  /**
   * Save draft with 500ms debounce.
   * Returns a promise that resolves when the save actually fires.
   * Calls `onSaved` callback when the debounced save executes.
   */
  saveDebounced(draft: Omit<WizardDraft, 'savedAt'>, onSaved?: () => void): void {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      const payload: WizardDraft = {
        ...draft,
        savedAt: new Date().toISOString(),
      };
      setStored(STORAGE_KEY, JSON.stringify(payload));
      onSaved?.();
    }, DEBOUNCE_MS);
  },

  /**
   * Clear saved draft (on wizard completion or explicit reset).
   */
  clear(): void {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    removeStored(STORAGE_KEY);
  },

  /**
   * Check if a draft exists without fully parsing it.
   */
  hasDraft(): boolean {
    return getStored(STORAGE_KEY) !== null;
  },
};

