import { createPersistedKeyValueCache } from '../keyValuePersistence';
import {
  createOfflineCredentialRecord,
  hashOfflineCredentialEmail,
  resolveOfflineCredentialRecordStatus,
  verifyOfflineCredentialRecord,
  type OfflineCredentialFailureReason,
  type OfflineCredentialRecord,
  type OfflineCredentialStatusSnapshot,
} from './offlineCredentialVerifier';

export type { OfflineCredentialStatusSnapshot } from './offlineCredentialVerifier';

const cache = createPersistedKeyValueCache('ecs_offline_credentials');
const KEY_PREFIX = 'offline_credential:';

type OfflineLoginResult =
  | {
      ok: true;
      email: string;
      userId: string;
    }
  | {
      ok: false;
      reason: OfflineCredentialFailureReason | 'missing_record';
    };

function keyForEmail(email: string): string | null {
  const emailHash = hashOfflineCredentialEmail(email);
  return emailHash ? `${KEY_PREFIX}${emailHash}` : null;
}

function parseRecord(raw: string | null): OfflineCredentialRecord | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OfflineCredentialRecord;
  } catch {
    return null;
  }
}

export const offlineCredentialStore = {
  waitForHydration: (): Promise<void> => cache.waitForHydration(),

  async saveOnlineLoginVerifier(params: {
    email: string;
    password: string;
    userId: string;
    keepSignedIn: boolean;
  }): Promise<void> {
    await cache.waitForHydration();
    const key = keyForEmail(params.email);
    if (!key) return;

    const record = createOfflineCredentialRecord(params);
    cache.set(key, JSON.stringify(record));
    await cache.flush();
  },

  async verifyOfflineLogin(params: {
    email: string;
    password: string;
  }): Promise<OfflineLoginResult> {
    await cache.waitForHydration();
    const key = keyForEmail(params.email);
    if (!key) return { ok: false, reason: 'invalid_email' };

    const record = parseRecord(cache.get(key));
    if (!record) return { ok: false, reason: 'missing_record' };

    const result = verifyOfflineCredentialRecord(record, params);
    return result.ok ? result : { ok: false, reason: result.reason };
  },

  async getOfflineCredentialStatus(params: {
    email: string;
  }): Promise<OfflineCredentialStatusSnapshot> {
    await cache.waitForHydration();
    const key = keyForEmail(params.email);
    if (!key) {
      return resolveOfflineCredentialRecordStatus(null, params);
    }

    const raw = cache.get(key);
    if (!raw) {
      return resolveOfflineCredentialRecordStatus(null, params);
    }

    const record = parseRecord(raw);
    return resolveOfflineCredentialRecordStatus(record ?? {}, params);
  },

  async clearOfflineLoginVerifier(email: string): Promise<void> {
    await cache.waitForHydration();
    const key = keyForEmail(email);
    if (!key) return;
    cache.delete(key);
    await cache.flush();
  },
};
