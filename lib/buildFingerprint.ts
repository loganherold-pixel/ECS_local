import Constants from 'expo-constants';

export type EcsBuildFingerprint = {
  commitSha: string;
  commitShortSha: string;
  buildTime: string;
  dirtyState: 'clean' | 'dirty' | string;
  isDirty: boolean;
  profile: string;
  channel: string;
  source: string;
};

const UNKNOWN_BUILD_FINGERPRINT: EcsBuildFingerprint = {
  commitSha: 'unknown',
  commitShortSha: 'unknown',
  buildTime: 'unknown',
  dirtyState: 'unknown',
  isDirty: false,
  profile: 'unknown',
  channel: 'unknown',
  source: 'unknown',
};

function readExpoExtra(): Record<string, unknown> {
  const constants = Constants as unknown as {
    expoConfig?: { extra?: Record<string, unknown> };
    manifest?: { extra?: Record<string, unknown> };
  };
  return constants.expoConfig?.extra ?? constants.manifest?.extra ?? {};
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

export function getEcsBuildFingerprint(): EcsBuildFingerprint {
  const extra = readExpoExtra();
  const rawFingerprint =
    extra.buildFingerprint && typeof extra.buildFingerprint === 'object'
      ? (extra.buildFingerprint as Record<string, unknown>)
      : {};
  const commitSha = readString(rawFingerprint.commitSha, UNKNOWN_BUILD_FINGERPRINT.commitSha);
  const commitShortSha = readString(
    rawFingerprint.commitShortSha,
    commitSha === 'unknown' ? 'unknown' : commitSha.slice(0, 12),
  );
  const dirtyState = readString(rawFingerprint.dirtyState, UNKNOWN_BUILD_FINGERPRINT.dirtyState);

  return {
    commitSha,
    commitShortSha,
    buildTime: readString(rawFingerprint.buildTime, UNKNOWN_BUILD_FINGERPRINT.buildTime),
    dirtyState,
    isDirty: typeof rawFingerprint.isDirty === 'boolean' ? rawFingerprint.isDirty : dirtyState === 'dirty',
    profile: readString(rawFingerprint.profile, UNKNOWN_BUILD_FINGERPRINT.profile),
    channel: readString(rawFingerprint.channel, UNKNOWN_BUILD_FINGERPRINT.channel),
    source: readString(rawFingerprint.source, UNKNOWN_BUILD_FINGERPRINT.source),
  };
}

export function formatBuildFingerprintTime(value: string): string {
  if (value === 'unknown') return value;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Date(timestamp).toISOString();
}
