/**
 * powerEventsStore — in-memory store for detected PowerEvents.
 *
 * Holds the most recent 50 events, de-duplicates by type + time bucket,
 * and exposes a simple pub/sub interface for UI consumers.
 *
 * Phase 3I-2 — no UI changes.
 */

import type { PowerEvent } from "./loadDetection";

// ── Tunables ────────────────────────────────────────────────────────────

const MAX_EVENTS = 50;

/**
 * De-duplication bucket size in ms.
 * Events with the same type whose timestamps fall within the same bucket
 * are considered duplicates and the newer one is discarded.
 */
const DEDUP_BUCKET_MS = 5_000;

// ── Subscriber type ─────────────────────────────────────────────────────

export type PowerEventsSubscriber = (events: readonly PowerEvent[]) => void;

// ── Store ───────────────────────────────────────────────────────────────

class PowerEventsStore {
  private events: PowerEvent[] = [];
  private subscribers = new Set<PowerEventsSubscriber>();

  // ── Accessors ───────────────────────────────────────────────────────

  /** Return a shallow copy of all stored events (newest first). */
  getAll(): PowerEvent[] {
    return [...this.events];
  }

  /** Number of stored events. */
  get length(): number {
    return this.events.length;
  }

  // ── Mutation ────────────────────────────────────────────────────────

  /**
   * Add one or more events to the store.
   *
   * Each event is de-duplicated against existing entries by comparing
   * `type` and a time bucket derived from `event.t`. If a duplicate
   * is found the incoming event is silently dropped.
   *
   * After insertion the store is trimmed to `MAX_EVENTS` (oldest dropped).
   */
  add(incoming: PowerEvent | PowerEvent[]): void {
    const batch = Array.isArray(incoming) ? incoming : [incoming];
    let changed = false;

    for (const evt of batch) {
      if (this.isDuplicate(evt)) continue;
      this.events.push(evt);
      changed = true;
    }

    if (!changed) return;

    // Sort newest-first
    this.events.sort((a, b) => b.t - a.t);

    // Trim to cap
    if (this.events.length > MAX_EVENTS) {
      this.events.length = MAX_EVENTS;
    }

    this.notify();
  }

  /** Remove all stored events. */
  clear(): void {
    if (this.events.length === 0) return;
    this.events = [];
    this.notify();
  }

  // ── Subscription ────────────────────────────────────────────────────

  /**
   * Subscribe to event list changes.
   * The callback receives the full event list (newest-first) on every change.
   *
   * @returns An unsubscribe function.
   */
  subscribe(cb: PowerEventsSubscriber): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  // ── Internal ────────────────────────────────────────────────────────

  private isDuplicate(evt: PowerEvent): boolean {
    const bucket = Math.floor(evt.t / DEDUP_BUCKET_MS);
    return this.events.some(
      (existing) =>
        existing.type === evt.type &&
        Math.floor(existing.t / DEDUP_BUCKET_MS) === bucket,
    );
  }

  private notify(): void {
    const snapshot: readonly PowerEvent[] = this.events;
    for (const cb of this.subscribers) {
      try {
        cb(snapshot);
      } catch {
        // Subscriber errors must never crash the store
      }
    }
  }
}

// ── Singleton ───────────────────────────────────────────────────────────

export const powerEventsStore = new PowerEventsStore();

