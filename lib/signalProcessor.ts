// lib/signalProcessor.ts

export type SignalKind =
  | 'blu_power'
  | 'telemetry'
  | 'weather'
  | 'gps'
  | 'mission'
  | 'system'
  | 'remoteness';

export type SignalConfidence = 'low' | 'medium' | 'high' | 'critical';

export type RawSignal<T = any> = {
  id?: string;
  kind: SignalKind;
  source?: string;
  timestamp?: number;
  priority?: number;
  value: T;
  meta?: Record<string, any>;
};

export type ProcessedSignal<T = any> = {
  id: string;
  kind: SignalKind;
  source: string;
  timestamp: number;
  priority: number;
  value: T;
  meta: Record<string, any>;
  confidence: SignalConfidence;
  stale: boolean;
  ageMs: number;
  score: number;
};

export type SignalSnapshot = {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  stale: number;
  byKind: Partial<Record<SignalKind, number>>;
  topScore?: number;
  lastUpdatedAt?: number;
};

const DEFAULT_STALE_MS = 1000 * 60 * 5;

function clamp(num: number, min: number, max: number) {
  return Math.max(min, Math.min(max, num));
}

function safeNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function buildSignalId(signal: RawSignal, fallbackIndex = 0) {
  if (signal.id) return signal.id;
  const ts = signal.timestamp ?? Date.now();
  return `${signal.kind}_${signal.source ?? 'unknown'}_${ts}_${fallbackIndex}`;
}

function getAgeMs(timestamp?: number) {
  const ts = timestamp ?? Date.now();
  return Math.max(0, Date.now() - ts);
}

function scoreSignal(signal: RawSignal, ageMs: number, staleMs: number) {
  const basePriority = clamp(safeNumber(signal.priority, 50), 0, 100);

  let freshnessBonus = 20;
  if (ageMs > staleMs) freshnessBonus = -10;
  else if (ageMs > staleMs * 0.5) freshnessBonus = 5;

  let sourceBonus = 0;
  const source = String(signal.source ?? '').toLowerCase();

  if (source.includes('blu') || source.includes('ble')) sourceBonus += 8;
  if (source.includes('gps')) sourceBonus += 6;
  if (source.includes('weather')) sourceBonus += 5;
  if (source.includes('manual')) sourceBonus -= 5;

  return clamp(basePriority + freshnessBonus + sourceBonus, 0, 100);
}

function confidenceFromScore(score: number): SignalConfidence {
  if (score >= 85) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 45) return 'medium';
  return 'low';
}

export function processSignal<T = any>(
  signal: RawSignal<T>,
  options?: { staleMs?: number; fallbackIndex?: number }
): ProcessedSignal<T> {
  const staleMs = options?.staleMs ?? DEFAULT_STALE_MS;
  const timestamp = signal.timestamp ?? Date.now();
  const ageMs = getAgeMs(timestamp);
  const score = scoreSignal(signal, ageMs, staleMs);

  return {
    id: buildSignalId(signal, options?.fallbackIndex ?? 0),
    kind: signal.kind,
    source: signal.source ?? 'unknown',
    timestamp,
    priority: clamp(safeNumber(signal.priority, 50), 0, 100),
    value: signal.value,
    meta: signal.meta ?? {},
    confidence: confidenceFromScore(score),
    stale: ageMs > staleMs,
    ageMs,
    score,
  };
}

export function processSignals<T = any>(
  signals: RawSignal<T>[],
  options?: { staleMs?: number }
): ProcessedSignal<T>[] {
  return (signals ?? [])
    .map((signal, index) =>
      processSignal(signal, {
        staleMs: options?.staleMs,
        fallbackIndex: index,
      })
    )
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.timestamp - a.timestamp;
    });
}

export function dedupeSignals<T = any>(
  signals: ProcessedSignal<T>[]
): ProcessedSignal<T>[] {
  const map = new Map<string, ProcessedSignal<T>>();

  for (const signal of signals ?? []) {
    const existing = map.get(signal.id);
    if (!existing) {
      map.set(signal.id, signal);
      continue;
    }

    if (signal.timestamp > existing.timestamp || signal.score > existing.score) {
      map.set(signal.id, signal);
    }
  }

  return Array.from(map.values()).sort((a, b) => b.score - a.score);
}

export function summarizeSignals<T = any>(
  signals: ProcessedSignal<T>[]
): SignalSnapshot {
  const snapshot: SignalSnapshot = {
    total: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    stale: 0,
    byKind: {},
    topScore: undefined,
    lastUpdatedAt: undefined,
  };

  for (const signal of signals ?? []) {
    snapshot.total += 1;
    snapshot.byKind[signal.kind] = (snapshot.byKind[signal.kind] ?? 0) + 1;

    if (signal.confidence === 'critical') snapshot.critical += 1;
    else if (signal.confidence === 'high') snapshot.high += 1;
    else if (signal.confidence === 'medium') snapshot.medium += 1;
    else snapshot.low += 1;

    if (signal.stale) snapshot.stale += 1;

    if (
      snapshot.topScore == null ||
      signal.score > snapshot.topScore
    ) {
      snapshot.topScore = signal.score;
    }

    if (
      snapshot.lastUpdatedAt == null ||
      signal.timestamp > snapshot.lastUpdatedAt
    ) {
      snapshot.lastUpdatedAt = signal.timestamp;
    }
  }

  return snapshot;
}

export function getHighestPrioritySignal<T = any>(
  signals: ProcessedSignal<T>[]
): ProcessedSignal<T> | null {
  if (!signals?.length) return null;
  return [...signals].sort((a, b) => b.score - a.score)[0] ?? null;
}

export function filterActiveSignals<T = any>(
  signals: ProcessedSignal<T>[],
  options?: {
    includeStale?: boolean;
    minScore?: number;
    kinds?: SignalKind[];
  }
): ProcessedSignal<T>[] {
  const includeStale = options?.includeStale ?? false;
  const minScore = options?.minScore ?? 0;
  const allowedKinds = options?.kinds;

  return (signals ?? []).filter((signal) => {
    if (!includeStale && signal.stale) return false;
    if (signal.score < minScore) return false;
    if (allowedKinds?.length && !allowedKinds.includes(signal.kind)) return false;
    return true;
  });
}

export const signalProcessor = {
  processSignal,
  processSignals,
  dedupeSignals,
  summarizeSignals,
  getHighestPrioritySignal,
  filterActiveSignals,
};

export default signalProcessor;