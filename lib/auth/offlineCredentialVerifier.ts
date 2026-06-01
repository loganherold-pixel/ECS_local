import * as CryptoJS from 'crypto-js';

export const OFFLINE_CREDENTIAL_VERSION = 1;
export const OFFLINE_CREDENTIAL_ITERATIONS = 12000;
export const OFFLINE_CREDENTIAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const OFFLINE_TRANSIENT_CREDENTIAL_TTL_MS = 10 * 60 * 1000;

export type OfflineCredentialFailureReason =
  | 'invalid_record'
  | 'invalid_email'
  | 'email_mismatch'
  | 'invalid_password'
  | 'expired';

export type OfflineCredentialVerificationResult =
  | {
      ok: true;
      email: string;
      userId: string;
    }
  | {
      ok: false;
      reason: OfflineCredentialFailureReason;
    };

export type OfflineCredentialStatusState = 'prepared' | 'stale' | 'unprepared';

export type OfflineCredentialStatusReason =
  | 'ready'
  | 'missing_record'
  | OfflineCredentialFailureReason;

export interface OfflineCredentialStatusSnapshot {
  state: OfflineCredentialStatusState;
  reason: OfflineCredentialStatusReason;
  email: string | null;
  userId: string | null;
  expiresAtMs: number | null;
  lastVerifiedOnlineAt: string | null;
}

export interface OfflineCredentialRecord {
  version: typeof OFFLINE_CREDENTIAL_VERSION;
  email: string;
  emailHash: string;
  userId: string;
  salt: string;
  passwordVerifier: string;
  iterations: number;
  createdAt: string;
  updatedAt: string;
  lastVerifiedOnlineAt: string;
  expiresAtMs: number | null;
}

export function normalizeOfflineCredentialEmail(email: string | null | undefined): string | null {
  if (typeof email !== 'string') return null;
  const normalized = email.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function hashOfflineCredentialEmail(email: string | null | undefined): string | null {
  const normalized = normalizeOfflineCredentialEmail(email);
  if (!normalized) return null;
  return CryptoJS.SHA256(normalized).toString(CryptoJS.enc.Hex);
}

function derivePasswordVerifier(params: {
  email: string;
  password: string;
  salt: string;
  iterations: number;
}): string {
  return CryptoJS.PBKDF2(params.password, `${params.email}:${params.salt}`, {
    keySize: 256 / 32,
    iterations: params.iterations,
  }).toString(CryptoJS.enc.Hex);
}

function generateSalt(): string {
  const cryptoRef = globalThis.crypto as
    | { getRandomValues?: (array: Uint8Array) => Uint8Array }
    | undefined;

  if (cryptoRef?.getRandomValues) {
    const bytes = cryptoRef.getRandomValues(new Uint8Array(16));
    return Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 18)}`;
}

function getRecordExpiresAtMs(record: Partial<OfflineCredentialRecord> | null | undefined): number | null {
  return typeof record?.expiresAtMs === 'number' ? record.expiresAtMs : null;
}

function getRecordLastVerifiedOnlineAt(record: Partial<OfflineCredentialRecord> | null | undefined): string | null {
  return typeof record?.lastVerifiedOnlineAt === 'string' ? record.lastVerifiedOnlineAt : null;
}

function getRecordUserId(record: Partial<OfflineCredentialRecord> | null | undefined): string | null {
  return typeof record?.userId === 'string' && record.userId.trim().length > 0 ? record.userId : null;
}

function buildOfflineCredentialStatus(params: {
  state: OfflineCredentialStatusState;
  reason: OfflineCredentialStatusReason;
  email: string | null;
  record?: Partial<OfflineCredentialRecord> | null;
}): OfflineCredentialStatusSnapshot {
  return {
    state: params.state,
    reason: params.reason,
    email: params.email,
    userId: getRecordUserId(params.record),
    expiresAtMs: getRecordExpiresAtMs(params.record),
    lastVerifiedOnlineAt: getRecordLastVerifiedOnlineAt(params.record),
  };
}

export function createOfflineCredentialRecord(params: {
  email: string;
  password: string;
  userId: string;
  keepSignedIn: boolean;
  nowMs?: number;
  salt?: string;
}): OfflineCredentialRecord {
  const nowMs = params.nowMs ?? Date.now();
  const normalizedEmail = normalizeOfflineCredentialEmail(params.email);
  if (!normalizedEmail) {
    throw new Error('Offline credential email is required.');
  }

  const salt = params.salt ?? generateSalt();
  const iterations = OFFLINE_CREDENTIAL_ITERATIONS;
  const timestamp = new Date(nowMs).toISOString();
  const expiresAtMs =
    nowMs + (params.keepSignedIn ? OFFLINE_CREDENTIAL_TTL_MS : OFFLINE_TRANSIENT_CREDENTIAL_TTL_MS);

  return {
    version: OFFLINE_CREDENTIAL_VERSION,
    email: normalizedEmail,
    emailHash: hashOfflineCredentialEmail(normalizedEmail)!,
    userId: params.userId,
    salt,
    passwordVerifier: derivePasswordVerifier({
      email: normalizedEmail,
      password: params.password,
      salt,
      iterations,
    }),
    iterations,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastVerifiedOnlineAt: timestamp,
    expiresAtMs,
  };
}

export function resolveOfflineCredentialRecordStatus(
  record: Partial<OfflineCredentialRecord> | null | undefined,
  params: {
    email: string;
    nowMs?: number;
  },
): OfflineCredentialStatusSnapshot {
  const normalizedEmail = normalizeOfflineCredentialEmail(params.email);
  if (!normalizedEmail) {
    return buildOfflineCredentialStatus({
      state: 'unprepared',
      reason: 'invalid_email',
      email: null,
      record,
    });
  }

  if (!record) {
    return buildOfflineCredentialStatus({
      state: 'unprepared',
      reason: 'missing_record',
      email: normalizedEmail,
      record,
    });
  }

  if (
    record.version !== OFFLINE_CREDENTIAL_VERSION ||
    !record.email ||
    !record.emailHash ||
    !record.userId ||
    !record.salt ||
    !record.passwordVerifier ||
    typeof record.iterations !== 'number' ||
    typeof record.lastVerifiedOnlineAt !== 'string'
  ) {
    return buildOfflineCredentialStatus({
      state: 'unprepared',
      reason: 'invalid_record',
      email: normalizedEmail,
      record,
    });
  }

  const expectedEmailHash = hashOfflineCredentialEmail(normalizedEmail);
  if (!expectedEmailHash || expectedEmailHash !== record.emailHash || normalizedEmail !== record.email) {
    return buildOfflineCredentialStatus({
      state: 'unprepared',
      reason: 'email_mismatch',
      email: normalizedEmail,
      record,
    });
  }

  const nowMs = params.nowMs ?? Date.now();
  if (typeof record.expiresAtMs === 'number' && nowMs > record.expiresAtMs) {
    return buildOfflineCredentialStatus({
      state: 'stale',
      reason: 'expired',
      email: record.email,
      record,
    });
  }

  return buildOfflineCredentialStatus({
    state: 'prepared',
    reason: 'ready',
    email: record.email,
    record,
  });
}

export function verifyOfflineCredentialRecord(
  record: Partial<OfflineCredentialRecord> | null | undefined,
  params: {
    email: string;
    password: string;
    nowMs?: number;
  },
): OfflineCredentialVerificationResult {
  const normalizedEmail = normalizeOfflineCredentialEmail(params.email);
  if (!normalizedEmail) return { ok: false, reason: 'invalid_email' };

  if (
    !record ||
    record.version !== OFFLINE_CREDENTIAL_VERSION ||
    !record.email ||
    !record.emailHash ||
    !record.userId ||
    !record.salt ||
    !record.passwordVerifier ||
    typeof record.iterations !== 'number'
  ) {
    return { ok: false, reason: 'invalid_record' };
  }

  const expectedEmailHash = hashOfflineCredentialEmail(normalizedEmail);
  if (!expectedEmailHash || expectedEmailHash !== record.emailHash || normalizedEmail !== record.email) {
    return { ok: false, reason: 'email_mismatch' };
  }

  const nowMs = params.nowMs ?? Date.now();
  if (typeof record.expiresAtMs === 'number' && nowMs > record.expiresAtMs) {
    return { ok: false, reason: 'expired' };
  }

  const candidate = derivePasswordVerifier({
    email: normalizedEmail,
    password: params.password,
    salt: record.salt,
    iterations: record.iterations,
  });

  if (candidate !== record.passwordVerifier) {
    return { ok: false, reason: 'invalid_password' };
  }

  return {
    ok: true,
    email: record.email,
    userId: record.userId,
  };
}
