import { gpsUIState } from './gpsUIState';
import type {
  ECSBriefSeverity,
  RemoteWeatherBriefEvent,
} from './ai/ecsBriefTypes';
import {
  createECSUpdateFingerprint,
  ECS_ALERT_DEDUPE_WINDOW_MS,
  rememberECSUpdateInRegistry,
  shouldSuppressECSUpdateInRegistry,
  type ECSUpdateDedupeEvent,
} from './ecsUpdateDedupe';

export const BRIEF_CAD_LOG_LIMIT = 100;
export const AI_GUIDANCE_DUPLICATE_SUPPRESSION_MINUTES = 15;
const AI_GUIDANCE_DUPLICATE_SUPPRESSION_MS = AI_GUIDANCE_DUPLICATE_SUPPRESSION_MINUTES * 60 * 1000;
const AI_GUIDANCE_HISTORY_LIMIT = 160;

export type BriefCadSourceMessage = {
  id: string;
  text: string;
  mode: 'alert' | 'advisory' | 'standby';
  priority: number;
  queuedAt: number;
  title?: string;
  recommendedAction?: string;
  source?: 'dashboard_advisory' | 'ecs-remote-weather' | string;
  severity?: ECSBriefSeverity;
  eventType?: string;
  routeId?: string;
  segmentId?: string;
  confidence?: number;
  expiresAt?: number;
};

export type BriefCadLogEntry = {
  eventKey: string;
  dedupeFingerprint: string;
  timestamp: number;
  message: string;
  latitude: number | null;
  longitude: number | null;
  title?: string;
  recommendedAction?: string;
  source?: 'dashboard_advisory' | 'ecs-remote-weather' | string;
  severity?: ECSBriefSeverity;
  eventType?: string;
  routeId?: string;
  segmentId?: string;
  confidence?: number;
  expiresAt?: number;
};

type Listener = () => void;
type BriefCadRecordOptions = {
  dedupeAlreadyAccepted?: boolean;
};

type BriefGuidanceHistoryEntry = {
  lastSeenAt: number;
  priority: number;
  mode: BriefCadSourceMessage['mode'];
  severity?: ECSBriefSeverity;
};

function clampText(value: string): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeGuidanceText(value: unknown): string {
  return clampText(String(value ?? ''))
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function severityRank(severity?: ECSBriefSeverity): number {
  switch (severity) {
    case 'critical':
      return 4;
    case 'warning':
      return 3;
    case 'watch':
      return 2;
    case 'info':
      return 1;
    default:
      return 0;
  }
}

function buildGuidanceSemanticFingerprint(message: BriefCadSourceMessage, normalizedText: string): string {
  const category = normalizeGuidanceText(message.eventType ?? message.source ?? message.mode);
  const title = normalizeGuidanceText(message.title);
  const routeContext = normalizeGuidanceText(message.routeId);
  const segmentContext = normalizeGuidanceText(message.segmentId);
  return [
    category || 'brief_guidance',
    normalizeGuidanceText(message.source),
    title,
    routeContext,
    segmentContext,
    normalizedText,
  ].join('|');
}

function isGuidanceEscalation(
  next: BriefCadSourceMessage,
  previous: BriefGuidanceHistoryEntry | null | undefined,
): boolean {
  if (!previous) return false;
  if (next.mode === 'alert' && previous.mode !== 'alert') return true;
  if (Number.isFinite(next.priority) && next.priority < previous.priority) return true;
  return severityRank(next.severity) > severityRank(previous.severity);
}

function isResolvedGuidance(message: BriefCadSourceMessage, normalizedText: string): boolean {
  const statusText = normalizeGuidanceText([
    message.eventType,
    message.title,
    normalizedText,
  ].filter(Boolean).join(' '));
  return /\b(resolved|cleared|recovered|restored|back online|no longer active)\b/.test(statusText);
}

function captureCadCoordinates() {
  try {
    const gps = gpsUIState.get();
    if (gps.hasFix && gps.position) {
      return {
        latitude: gps.position.latitude,
        longitude: gps.position.longitude,
      };
    }
  } catch {
    // GPS UI state may not be initialized yet.
  }

  return {
    latitude: null,
    longitude: null,
  };
}

function severityToCadMode(severity: ECSBriefSeverity): BriefCadSourceMessage['mode'] {
  return severity === 'critical' || severity === 'warning' ? 'alert' : 'advisory';
}

function severityToCadPriority(severity: ECSBriefSeverity): number {
  switch (severity) {
    case 'critical':
      return 1;
    case 'warning':
      return 2;
    case 'watch':
      return 3;
    case 'info':
    default:
      return 4;
  }
}

class BriefCadLogStore {
  private entries: BriefCadLogEntry[] = [];
  private listeners = new Set<Listener>();
  private seenEventKeys = new Set<string>();
  private lastDedupeEventByFingerprint = new Map<string, ECSUpdateDedupeEvent>();
  private recentGuidanceByFingerprint = new Map<string, BriefGuidanceHistoryEntry>();

  getEntries(): BriefCadLogEntry[] {
    return this.entries.slice();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  recordUpdate(message: BriefCadSourceMessage, options?: BriefCadRecordOptions): void {
    if (message.mode === 'standby') return;

    const normalizedText = clampText(message.text);
    if (!normalizedText) return;
    const normalizedGuidanceText = normalizeGuidanceText(normalizedText);
    const guidanceFingerprint = buildGuidanceSemanticFingerprint(message, normalizedGuidanceText);
    const queuedAt = Number.isFinite(message.queuedAt) ? message.queuedAt : Date.now();
    const resolvedGuidance = isResolvedGuidance(message, normalizedGuidanceText);
    if (this.shouldSuppressDuplicateGuidance(message, guidanceFingerprint, queuedAt)) {
      return;
    }

    const eventKey = `${message.id}:${message.queuedAt}`;
    if (this.seenEventKeys.has(eventKey)) return;

    const coords = captureCadCoordinates();
    const dedupeEvent: ECSUpdateDedupeEvent = {
      id: message.id,
      type: message.eventType ?? message.mode,
      category: message.severity,
      severity: message.priority,
      source: message.source ?? 'brief_activity_log',
      title: message.mode,
      message: normalizedText,
      timestamp: queuedAt,
      routeSegmentId: message.segmentId,
      location: coords.latitude != null && coords.longitude != null
        ? { latitude: coords.latitude, longitude: coords.longitude }
        : null,
    };
    const fingerprint = createECSUpdateFingerprint(dedupeEvent);
    if (options?.dedupeAlreadyAccepted || resolvedGuidance) {
      rememberECSUpdateInRegistry(dedupeEvent);
    } else {
      if (
        shouldSuppressECSUpdateInRegistry({
          nextEvent: dedupeEvent,
          windowMs: ECS_ALERT_DEDUPE_WINDOW_MS,
        })
      ) {
        return;
      }
    }

    const entry: BriefCadLogEntry = {
      eventKey,
      dedupeFingerprint: fingerprint,
      timestamp: typeof dedupeEvent.timestamp === 'number' ? dedupeEvent.timestamp : Date.now(),
      message: normalizedText,
      latitude: coords.latitude,
      longitude: coords.longitude,
      title: message.title,
      recommendedAction: message.recommendedAction,
      source: message.source,
      severity: message.severity,
      eventType: message.eventType,
      routeId: message.routeId,
      segmentId: message.segmentId,
      confidence: message.confidence,
      expiresAt: message.expiresAt,
    };

    this.seenEventKeys.add(eventKey);
    this.lastDedupeEventByFingerprint.set(fingerprint, dedupeEvent);
    this.rememberGuidance(guidanceFingerprint, message, queuedAt);
    this.entries = [...this.entries, entry].slice(-BRIEF_CAD_LOG_LIMIT);

    if (this.entries.length >= BRIEF_CAD_LOG_LIMIT) {
      const activeKeys = new Set(this.entries.map((item) => item.eventKey));
      this.seenEventKeys = activeKeys;
      const activeFingerprints = new Set(this.entries.map((item) => item.dedupeFingerprint));
      for (const key of this.lastDedupeEventByFingerprint.keys()) {
        if (!activeFingerprints.has(key)) {
          this.lastDedupeEventByFingerprint.delete(key);
        }
      }
    }

    this.notify();
  }

  clear(): void {
    this.entries = [];
    this.seenEventKeys.clear();
    this.lastDedupeEventByFingerprint.clear();
    this.recentGuidanceByFingerprint.clear();
    this.notify();
  }

  private shouldSuppressDuplicateGuidance(
    message: BriefCadSourceMessage,
    fingerprint: string,
    queuedAt: number,
  ): boolean {
    if (isResolvedGuidance(message, normalizeGuidanceText(message.text))) return false;
    this.pruneGuidanceHistory(queuedAt);
    const previous = this.recentGuidanceByFingerprint.get(fingerprint);
    if (!previous) return false;
    const insideSuppressionWindow = queuedAt - previous.lastSeenAt < AI_GUIDANCE_DUPLICATE_SUPPRESSION_MS;
    if (!insideSuppressionWindow) return false;
    return !isGuidanceEscalation(message, previous);
  }

  private rememberGuidance(
    fingerprint: string,
    message: BriefCadSourceMessage,
    queuedAt: number,
  ): void {
    this.recentGuidanceByFingerprint.set(fingerprint, {
      lastSeenAt: queuedAt,
      priority: Number.isFinite(message.priority) ? message.priority : 4,
      mode: message.mode,
      severity: message.severity,
    });
    this.pruneGuidanceHistory(queuedAt);
  }

  private pruneGuidanceHistory(now: number): void {
    const oldestAllowed = now - AI_GUIDANCE_DUPLICATE_SUPPRESSION_MS;
    for (const [key, entry] of this.recentGuidanceByFingerprint.entries()) {
      if (entry.lastSeenAt < oldestAllowed) {
        this.recentGuidanceByFingerprint.delete(key);
      }
    }
    if (this.recentGuidanceByFingerprint.size <= AI_GUIDANCE_HISTORY_LIMIT) return;
    const ordered = Array.from(this.recentGuidanceByFingerprint.entries())
      .sort((left, right) => left[1].lastSeenAt - right[1].lastSeenAt);
    const excess = ordered.length - AI_GUIDANCE_HISTORY_LIMIT;
    for (let index = 0; index < excess; index += 1) {
      this.recentGuidanceByFingerprint.delete(ordered[index][0]);
    }
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // Ignore listener failures so logging stays resilient.
      }
    }
  }
}

export const briefCadLogStore = new BriefCadLogStore();

export function recordBriefCadEntryFromAdvisory(
  message: BriefCadSourceMessage,
  options?: BriefCadRecordOptions,
): void {
  briefCadLogStore.recordUpdate(message, options);
}

export function recordBriefCadEntry(message: BriefCadSourceMessage): void {
  briefCadLogStore.recordUpdate(message);
}

export function recordRemoteWeatherBriefEvent(event: RemoteWeatherBriefEvent): void {
  briefCadLogStore.recordUpdate({
    id: event.id,
    text: clampText(event.message),
    mode: severityToCadMode(event.severity),
    priority: severityToCadPriority(event.severity),
    queuedAt: Number.isFinite(event.createdAt) ? event.createdAt : Date.now(),
    title: event.title,
    recommendedAction: event.recommendedAction,
    source: event.source,
    severity: event.severity,
    eventType: event.type,
    routeId: event.routeId,
    segmentId: event.segmentId,
    confidence: event.confidence,
    expiresAt: event.expiresAt,
  });
}
