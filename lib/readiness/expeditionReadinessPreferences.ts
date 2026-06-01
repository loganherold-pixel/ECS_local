import type {
  ExpeditionReadinessCalibration,
  ExpeditionReadinessCategory,
  ExpeditionReadinessIssue,
  ExpeditionReadinessInput,
} from './expeditionReadinessTypes';

export const READINESS_SENSITIVITY_VALUES = ['standard', 'conservative', 'fieldConservative'] as const;
export type ExpeditionReadinessSensitivity = (typeof READINESS_SENSITIVITY_VALUES)[number];

export const READINESS_ALERT_SENSITIVITY_VALUES = ['low', 'standard', 'high'] as const;
export type ExpeditionReadinessAlertSensitivity = (typeof READINESS_ALERT_SENSITIVITY_VALUES)[number];

export const CAMP_CONFIDENCE_REQUIREMENT_VALUES = ['standard', 'highConfidencePreferred'] as const;
export type ExpeditionCampConfidenceRequirement = (typeof CAMP_CONFIDENCE_REQUIREMENT_VALUES)[number];

export const OFFLINE_REQUIREMENT_VALUES = ['standard', 'strictForRemoteTrips'] as const;
export type ExpeditionOfflineRequirement = (typeof OFFLINE_REQUIREMENT_VALUES)[number];

export const RECOVERY_MARGIN_VALUES = ['standard', 'conservative'] as const;
export type ExpeditionRecoveryMarginPreference = (typeof RECOVERY_MARGIN_VALUES)[number];

export type ExpeditionReadinessPreferences = {
  readinessSensitivity: ExpeditionReadinessSensitivity;
  alertSensitivity: ExpeditionReadinessAlertSensitivity;
  campConfidenceRequirement: ExpeditionCampConfidenceRequirement;
  offlineRequirement: ExpeditionOfflineRequirement;
  recoveryMargin: ExpeditionRecoveryMarginPreference;
  updatedAt: string | null;
};

export type ExpeditionReadinessPreferenceEffect = {
  id: string;
  label: string;
  summary: string;
  severity: 'info' | 'warning' | 'blocker';
};

export const DEFAULT_EXPEDITION_READINESS_PREFERENCES: ExpeditionReadinessPreferences = {
  readinessSensitivity: 'standard',
  alertSensitivity: 'standard',
  campConfidenceRequirement: 'standard',
  offlineRequirement: 'standard',
  recoveryMargin: 'standard',
  updatedAt: null,
};

export const READINESS_SENSITIVITY_LABELS: Record<ExpeditionReadinessSensitivity, string> = {
  standard: 'Standard',
  conservative: 'Conservative',
  fieldConservative: 'Field Conservative',
};

export const READINESS_ALERT_SENSITIVITY_LABELS: Record<ExpeditionReadinessAlertSensitivity, string> = {
  low: 'Low',
  standard: 'Standard',
  high: 'High',
};

export const CAMP_CONFIDENCE_REQUIREMENT_LABELS: Record<ExpeditionCampConfidenceRequirement, string> = {
  standard: 'Standard',
  highConfidencePreferred: 'High confidence preferred',
};

export const OFFLINE_REQUIREMENT_LABELS: Record<ExpeditionOfflineRequirement, string> = {
  standard: 'Standard',
  strictForRemoteTrips: 'Strict for remote trips',
};

export const RECOVERY_MARGIN_LABELS: Record<ExpeditionRecoveryMarginPreference, string> = {
  standard: 'Standard',
  conservative: 'Conservative',
};

type PreferenceListener = (preferences: ExpeditionReadinessPreferences) => void;

const STORAGE_KEY = 'ecs_expedition_readiness_preferences_v1';
const listeners = new Set<PreferenceListener>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function localStorageSafe() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function isOneOf<T extends readonly string[]>(value: unknown, values: T): value is T[number] {
  return typeof value === 'string' && values.includes(value);
}

export function normalizeExpeditionReadinessPreferences(
  value: Partial<ExpeditionReadinessPreferences> | null | undefined,
): ExpeditionReadinessPreferences {
  const source = isRecord(value) ? value : {};
  return {
    readinessSensitivity: isOneOf(source.readinessSensitivity, READINESS_SENSITIVITY_VALUES)
      ? source.readinessSensitivity
      : DEFAULT_EXPEDITION_READINESS_PREFERENCES.readinessSensitivity,
    alertSensitivity: isOneOf(source.alertSensitivity, READINESS_ALERT_SENSITIVITY_VALUES)
      ? source.alertSensitivity
      : DEFAULT_EXPEDITION_READINESS_PREFERENCES.alertSensitivity,
    campConfidenceRequirement: isOneOf(source.campConfidenceRequirement, CAMP_CONFIDENCE_REQUIREMENT_VALUES)
      ? source.campConfidenceRequirement
      : DEFAULT_EXPEDITION_READINESS_PREFERENCES.campConfidenceRequirement,
    offlineRequirement: isOneOf(source.offlineRequirement, OFFLINE_REQUIREMENT_VALUES)
      ? source.offlineRequirement
      : DEFAULT_EXPEDITION_READINESS_PREFERENCES.offlineRequirement,
    recoveryMargin: isOneOf(source.recoveryMargin, RECOVERY_MARGIN_VALUES)
      ? source.recoveryMargin
      : DEFAULT_EXPEDITION_READINESS_PREFERENCES.recoveryMargin,
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : null,
  };
}

function readStoredPreferences(): ExpeditionReadinessPreferences {
  const storage = localStorageSafe();
  if (!storage) return DEFAULT_EXPEDITION_READINESS_PREFERENCES;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_EXPEDITION_READINESS_PREFERENCES;
    return normalizeExpeditionReadinessPreferences(JSON.parse(raw));
  } catch {
    return DEFAULT_EXPEDITION_READINESS_PREFERENCES;
  }
}

function writeStoredPreferences(preferences: ExpeditionReadinessPreferences): void {
  const storage = localStorageSafe();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {}
}

let currentPreferences = readStoredPreferences();

function notify(preferences: ExpeditionReadinessPreferences): void {
  listeners.forEach((listener) => {
    try {
      listener(preferences);
    } catch {}
  });
}

export const expeditionReadinessPreferencesStore = {
  getSnapshot(): ExpeditionReadinessPreferences {
    return currentPreferences;
  },

  subscribe(listener: PreferenceListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  update(patch: Partial<Omit<ExpeditionReadinessPreferences, 'updatedAt'>>): ExpeditionReadinessPreferences {
    currentPreferences = normalizeExpeditionReadinessPreferences({
      ...currentPreferences,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
    writeStoredPreferences(currentPreferences);
    notify(currentPreferences);
    return currentPreferences;
  },

  reset(): ExpeditionReadinessPreferences {
    currentPreferences = {
      ...DEFAULT_EXPEDITION_READINESS_PREFERENCES,
      updatedAt: new Date().toISOString(),
    };
    writeStoredPreferences(currentPreferences);
    notify(currentPreferences);
    return currentPreferences;
  },
};

export function getReadinessPreferenceLabel(preferences: ExpeditionReadinessPreferences): string {
  return [
    READINESS_SENSITIVITY_LABELS[preferences.readinessSensitivity],
    CAMP_CONFIDENCE_REQUIREMENT_LABELS[preferences.campConfidenceRequirement],
    OFFLINE_REQUIREMENT_LABELS[preferences.offlineRequirement],
    RECOVERY_MARGIN_LABELS[preferences.recoveryMargin],
  ].join(' / ');
}

export function applyReadinessPreferenceCalibration(
  calibration: ExpeditionReadinessCalibration,
  preferences: ExpeditionReadinessPreferences,
): { calibration: ExpeditionReadinessCalibration; effects: ExpeditionReadinessPreferenceEffect[] } {
  const effects: ExpeditionReadinessPreferenceEffect[] = [];
  let readyBump = 0;
  let cautionBump = 0;

  if (preferences.readinessSensitivity === 'conservative') {
    readyBump += 4;
    cautionBump += 2;
    effects.push({
      id: 'readiness-sensitivity-conservative',
      label: 'Conservative readiness sensitivity',
      severity: 'info',
      summary: 'Ready and Hold/Caution thresholds are tightened by operator preference.',
    });
  } else if (preferences.readinessSensitivity === 'fieldConservative') {
    readyBump += 7;
    cautionBump += 5;
    effects.push({
      id: 'readiness-sensitivity-field-conservative',
      label: 'Field Conservative readiness sensitivity',
      severity: 'info',
      summary: 'Readiness thresholds are strongly tightened for field use.',
    });
  }

  if (preferences.recoveryMargin === 'conservative') {
    readyBump += 1;
    effects.push({
      id: 'recovery-margin-conservative',
      label: 'Conservative recovery margin',
      severity: 'info',
      summary: 'Recovery and bailout margin must be stronger before ECS returns Ready.',
    });
  }

  if (readyBump === 0 && cautionBump === 0) {
    return { calibration, effects };
  }

  return {
    calibration: {
      ...calibration,
      thresholds: {
        ready: Math.min(96, calibration.thresholds.ready + readyBump),
        caution: Math.min(78, calibration.thresholds.caution + cautionBump),
      },
      notes: [
        ...calibration.notes,
        `Readiness preferences adjusted thresholds to Ready ${Math.min(96, calibration.thresholds.ready + readyBump)} / Caution ${Math.min(78, calibration.thresholds.caution + cautionBump)}.`,
      ],
    },
    effects,
  };
}

function issue(
  severity: ExpeditionReadinessIssue['severity'],
  id: string,
  label: string,
  detail: string,
  categoryId: ExpeditionReadinessIssue['categoryId'],
): ExpeditionReadinessIssue {
  return { id, label, detail, severity, categoryId };
}

function isRemoteContext(input: ExpeditionReadinessInput, calibration: ExpeditionReadinessCalibration): boolean {
  return Boolean(
    calibration.profile === 'remoteExpedition'
    || input.offline?.isRemoteRoute === true
    || input.recovery?.routeRemoteness === 'high'
    || input.communications?.signalConfidence === 'low'
    || (typeof input.route?.distanceMiles === 'number' && input.route.distanceMiles >= 40)
  );
}

function categoryById(categories: ExpeditionReadinessCategory[], id: ExpeditionReadinessIssue['categoryId']) {
  return categories.find((category) => category.id === id);
}

export function buildReadinessPreferenceGuardrails(
  categories: ExpeditionReadinessCategory[],
  input: ExpeditionReadinessInput,
  calibration: ExpeditionReadinessCalibration,
  preferences: ExpeditionReadinessPreferences,
): {
  effects: ExpeditionReadinessPreferenceEffect[];
  warnings: ExpeditionReadinessIssue[];
  blockers: ExpeditionReadinessIssue[];
  recommendations: string[];
} {
  const effects: ExpeditionReadinessPreferenceEffect[] = [];
  const warnings: ExpeditionReadinessIssue[] = [];
  const blockers: ExpeditionReadinessIssue[] = [];
  const recommendations: string[] = [];

  const camp = categoryById(categories, 'camp_legality_confidence');
  if (
    preferences.campConfidenceRequirement === 'highConfidencePreferred'
    && camp
    && (camp.confidence !== 'high' || camp.score < 88)
  ) {
    const detail = 'Camp Legality Confidence preference is set to high confidence preferred; current camp confidence needs recommended review.';
    warnings.push(issue('warning', 'preference-camp-high-confidence', 'Camp confidence preference', detail, 'camp_legality_confidence'));
    recommendations.push('Review campsite access confidence and confirm official agency rules before relying on a camp endpoint.');
    effects.push({
      id: 'camp-confidence-high-preferred',
      label: 'High camp confidence preferred',
      severity: 'warning',
      summary: 'Camp confidence warnings remain visible until confidence is high.',
    });
  }

  const offline = categoryById(categories, 'offline_preparedness');
  if (
    preferences.offlineRequirement === 'strictForRemoteTrips'
    && isRemoteContext(input, calibration)
    && offline
    && offline.status !== 'ready'
  ) {
    const detail = 'Offline requirement is strict for remote trips, and the route package is incomplete or limited-confidence.';
    blockers.push(issue('blocker', 'preference-strict-offline-remote', 'Strict offline preference', detail, 'offline_preparedness'));
    recommendations.push('Download or refresh the offline route package before departure.');
    effects.push({
      id: 'offline-strict-remote',
      label: 'Strict offline requirement',
      severity: 'blocker',
      summary: 'Remote route readiness is held until offline preparedness is ready.',
    });
  }

  const recovery = categoryById(categories, 'recovery_bailout_access');
  if (
    preferences.recoveryMargin === 'conservative'
    && recovery
    && (recovery.score < 85 || recovery.confidence === 'low')
  ) {
    const detail = 'Recovery margin preference is conservative; bailout confidence or distance margin needs review.';
    warnings.push(issue('warning', 'preference-recovery-conservative', 'Recovery margin preference', detail, 'recovery_bailout_access'));
    recommendations.push('Review bailout options and recovery prep before departure.');
    effects.push({
      id: 'recovery-margin-warning',
      label: 'Conservative recovery margin',
      severity: 'warning',
      summary: 'Recovery margin preference keeps bailout concerns elevated.',
    });
  }

  return { effects, warnings, blockers, recommendations };
}

export function getReadinessAlertTuning(preferences: ExpeditionReadinessPreferences): {
  categoryDropThreshold: number;
  cooldownMs: number;
  globalCooldownMs: number;
} {
  if (preferences.alertSensitivity === 'high') {
    return {
      categoryDropThreshold: 10,
      cooldownMs: 2.5 * 60 * 1000,
      globalCooldownMs: 20 * 1000,
    };
  }
  if (preferences.alertSensitivity === 'low') {
    return {
      categoryDropThreshold: 20,
      cooldownMs: 10 * 60 * 1000,
      globalCooldownMs: 45 * 1000,
    };
  }
  return {
    categoryDropThreshold: 15,
    cooldownMs: 5 * 60 * 1000,
    globalCooldownMs: 30 * 1000,
  };
}
