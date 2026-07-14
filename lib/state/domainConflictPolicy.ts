import type { ECSStateConflictPolicy } from './stateOwnershipRegistry';

export type ECSConflictRecord = {
  id?: string | null;
  updated_at?: string | null;
  updatedAt?: string | null;
  version?: number | null;
  state_version?: number | null;
  dirty?: boolean | number | null;
};

export type ECSIncomingUpdateDecision = {
  accept: boolean;
  conflict: boolean;
  reason:
    | 'no_local_record'
    | 'incoming_newer'
    | 'incoming_stale'
    | 'same_record'
    | 'same_version_conflict'
    | 'local_dirty'
    | 'local_authoritative'
    | 'server_authoritative'
    | 'higher_priority_source'
    | 'lower_priority_source';
};

function finiteRevision(record: ECSConflictRecord | null | undefined): number | null {
  const value = record?.state_version ?? record?.version;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function finiteTimestamp(record: ECSConflictRecord | null | undefined): number | null {
  const value = record?.updated_at ?? record?.updatedAt;
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stableValue(value: unknown): unknown {
  if (value == null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map(stableValue);
  if (typeof value !== 'object') return String(value);
  const record = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(record).sort().map((key) => [key, stableValue(record[key])]));
}

function sameRecord(local: ECSConflictRecord, incoming: ECSConflictRecord): boolean {
  const ignored = new Set(['dirty']);
  const normalize = (record: ECSConflictRecord) => Object.fromEntries(
    Object.entries(record as Record<string, unknown>)
      .filter(([key]) => !ignored.has(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, stableValue(value)]),
  );
  return JSON.stringify(normalize(local)) === JSON.stringify(normalize(incoming));
}

function compareVersion(local: ECSConflictRecord, incoming: ECSConflictRecord): -1 | 0 | 1 {
  const localRevision = finiteRevision(local);
  const incomingRevision = finiteRevision(incoming);
  if (localRevision != null && incomingRevision != null && localRevision !== incomingRevision) {
    return incomingRevision > localRevision ? 1 : -1;
  }
  const localTimestamp = finiteTimestamp(local);
  const incomingTimestamp = finiteTimestamp(incoming);
  if (localTimestamp != null && incomingTimestamp != null && localTimestamp !== incomingTimestamp) {
    return incomingTimestamp > localTimestamp ? 1 : -1;
  }
  if (localTimestamp != null && incomingTimestamp == null) return -1;
  if (localRevision != null && incomingRevision == null) return -1;
  return 0;
}

export function isIncomingRecordStale(
  local: ECSConflictRecord | null | undefined,
  incoming: ECSConflictRecord | null | undefined,
): boolean {
  if (!local || !incoming) return false;
  return compareVersion(local, incoming) < 0;
}

export function decideECSIncomingUpdate(input: {
  policy: ECSStateConflictPolicy;
  local: ECSConflictRecord | null | undefined;
  incoming: ECSConflictRecord;
  localDirty?: boolean;
  localSourcePriority?: number | null;
  incomingSourcePriority?: number | null;
}): ECSIncomingUpdateDecision {
  if (!input.local) return { accept: true, conflict: false, reason: 'no_local_record' };

  const comparison = compareVersion(input.local, input.incoming);
  if (comparison < 0) return { accept: false, conflict: false, reason: 'incoming_stale' };
  if (sameRecord(input.local, input.incoming)) {
    return { accept: false, conflict: false, reason: 'same_record' };
  }

  if (input.policy === 'local_authoritative') {
    return { accept: false, conflict: comparison === 0, reason: 'local_authoritative' };
  }

  if (input.policy === 'source_priority') {
    const localPriority = input.localSourcePriority ?? 0;
    const incomingPriority = input.incomingSourcePriority ?? 0;
    if (incomingPriority < localPriority) {
      return { accept: false, conflict: comparison === 0, reason: 'lower_priority_source' };
    }
    if (incomingPriority > localPriority) {
      return { accept: true, conflict: false, reason: 'higher_priority_source' };
    }
  }

  if (input.localDirty && (input.policy === 'preserve_local_dirty' || input.policy === 'manual_resolution')) {
    return { accept: false, conflict: true, reason: 'local_dirty' };
  }

  if (comparison > 0) {
    return {
      accept: true,
      conflict: false,
      reason: input.policy === 'server_authoritative' ? 'server_authoritative' : 'incoming_newer',
    };
  }

  if (input.policy === 'server_authoritative' || input.policy === 'ephemeral_latest') {
    return { accept: true, conflict: false, reason: 'server_authoritative' };
  }

  return { accept: false, conflict: true, reason: 'same_version_conflict' };
}
