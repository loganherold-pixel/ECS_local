export const CAMP_OPS_INTERNAL_BETA_FEEDBACK_STORAGE_KEY = 'ecs_campops_internal_beta_feedback_v1';
export const CAMP_OPS_INTERNAL_BETA_FEEDBACK_RETENTION_DAYS = 180;

export const CAMP_OPS_INTERNAL_BETA_FEEDBACK_ANSWERS = [
  'yes',
  'no',
  'mixed',
  'not_tested',
] as const;
export type CampOpsInternalBetaFeedbackAnswer =
  (typeof CAMP_OPS_INTERNAL_BETA_FEEDBACK_ANSWERS)[number];

export const CAMP_OPS_INTERNAL_BETA_FEEDBACK_VISIBILITIES = ['private', 'internal_review'] as const;
export type CampOpsInternalBetaFeedbackVisibility =
  (typeof CAMP_OPS_INTERNAL_BETA_FEEDBACK_VISIBILITIES)[number];

export type CampOpsInternalBetaFeedbackStructured = {
  recommendationUseful: CampOpsInternalBetaFeedbackAnswer;
  recommendationConfusing: CampOpsInternalBetaFeedbackAnswer;
  endpointFeltWrong: CampOpsInternalBetaFeedbackAnswer;
  staleMissingWarningUnclear: CampOpsInternalBetaFeedbackAnswer;
  sourceConfidenceUnclear: CampOpsInternalBetaFeedbackAnswer;
  aiWordingConcern: CampOpsInternalBetaFeedbackAnswer;
  legacyResultConflict: CampOpsInternalBetaFeedbackAnswer;
  mobileUiOverflowOrCramped: CampOpsInternalBetaFeedbackAnswer;
  actionButtonIssue: CampOpsInternalBetaFeedbackAnswer;
  privacyConcern: CampOpsInternalBetaFeedbackAnswer;
  providerDataAppearedWrong: CampOpsInternalBetaFeedbackAnswer;
  twoHourDelayFlowUseful: CampOpsInternalBetaFeedbackAnswer;
  decisionPointUseful: CampOpsInternalBetaFeedbackAnswer;
};

export type CampOpsInternalBetaFeedbackScenario = {
  mode?: 'planning' | 'delayed_day' | 'endpoint_selection' | 'offline_cached' | 'offline_no_cache' | 'debrief' | 'unknown';
  delayScenario?: 'none' | '30m' | '1h' | '2h' | 'custom' | 'not_applicable' | 'unknown';
  vehicleContext?: 'solo' | 'trailer' | 'full_size' | 'convoy' | 'unknown';
  resourceContext?: 'normal' | 'low_fuel' | 'low_water' | 'low_fuel_and_water' | 'unknown';
  offlineContext?: 'online' | 'degraded' | 'offline_cached' | 'offline_no_cache' | 'unknown';
};

export type CampOpsInternalBetaFeedbackInput = {
  submittedAtIso?: string | null;
  testerRole?: string | null;
  buildLabel?: string | null;
  regionLabel?: string | null;
  routeLabel?: string | null;
  scenario?: CampOpsInternalBetaFeedbackScenario | null;
  structured?: Partial<CampOpsInternalBetaFeedbackStructured> | null;
  notes?: string | null;
  visibility?: CampOpsInternalBetaFeedbackVisibility | null;
  userId?: string | null;
  vehicleId?: string | null;
  vehicleProfileId?: string | null;
  location?: { latitude?: number | null; longitude?: number | null; lat?: number | null; lng?: number | null } | null;
  rawAiPrompt?: string | null;
  privateDebriefNotes?: string | null;
};

export type CampOpsInternalBetaFeedbackPrivacyMetadata = {
  preciseLocationStored: false;
  privateUserIdStored: false;
  vehicleIdentifierStored: false;
  rawAiPromptStored: false;
  privateDebriefNotesStored: false;
  communityPublishingPath: false;
  telemetryEmitted: false;
  retentionExpiresAtIso: string | null;
};

export type CampOpsInternalBetaFeedbackRecord = {
  id: string;
  source: 'campops_internal_beta_feedback';
  visibility: CampOpsInternalBetaFeedbackVisibility;
  testerRole: string | null;
  buildLabel: string | null;
  regionLabel: string | null;
  routeLabel: string | null;
  scenario: Required<CampOpsInternalBetaFeedbackScenario>;
  structured: CampOpsInternalBetaFeedbackStructured;
  notes: string | null;
  privacy: CampOpsInternalBetaFeedbackPrivacyMetadata;
  submittedAtIso: string;
  createdAtIso: string;
};

export type CampOpsInternalBetaFeedbackExportItem = {
  id: string;
  testerRole: string | null;
  buildLabel: string | null;
  regionLabel: string | null;
  routeLabel: string | null;
  scenario: Required<CampOpsInternalBetaFeedbackScenario>;
  structured: CampOpsInternalBetaFeedbackStructured;
  notes: string | null;
  submittedAtIso: string;
};

export type CampOpsInternalBetaFeedbackExport = {
  generatedAtIso: string;
  feedbackCount: number;
  issueCounts: Partial<Record<keyof CampOpsInternalBetaFeedbackStructured, number>>;
  items: CampOpsInternalBetaFeedbackExportItem[];
};

export type CampOpsInternalBetaFeedbackServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: 'validation_error' | 'backend_error'; error: string; details?: string[] };

export interface CampOpsInternalBetaFeedbackBackend {
  insertFeedback(
    record: CampOpsInternalBetaFeedbackRecord,
  ): Promise<CampOpsInternalBetaFeedbackServiceResult<CampOpsInternalBetaFeedbackRecord>>;
}

export const DEFAULT_CAMP_OPS_INTERNAL_BETA_FEEDBACK_STRUCTURED: CampOpsInternalBetaFeedbackStructured = {
  recommendationUseful: 'not_tested',
  recommendationConfusing: 'not_tested',
  endpointFeltWrong: 'not_tested',
  staleMissingWarningUnclear: 'not_tested',
  sourceConfidenceUnclear: 'not_tested',
  aiWordingConcern: 'not_tested',
  legacyResultConflict: 'not_tested',
  mobileUiOverflowOrCramped: 'not_tested',
  actionButtonIssue: 'not_tested',
  privacyConcern: 'not_tested',
  providerDataAppearedWrong: 'not_tested',
  twoHourDelayFlowUseful: 'not_tested',
  decisionPointUseful: 'not_tested',
};

const DEFAULT_SCENARIO: Required<CampOpsInternalBetaFeedbackScenario> = {
  mode: 'unknown',
  delayScenario: 'unknown',
  vehicleContext: 'unknown',
  resourceContext: 'unknown',
  offlineContext: 'unknown',
};

const MAX_TEXT_LENGTH = 2000;
const COORDINATE_PAIR_PATTERN = /-?\d{1,2}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}/g;
const LABELED_COORDINATE_PATTERN = /\b(lat|latitude|lng|lon|longitude)\s*[:=]\s*-?\d{1,3}\.\d{4,}/gi;
let memoryFeedbackRecords: CampOpsInternalBetaFeedbackRecord[] = [];

function isKnownAnswer(value: unknown): value is CampOpsInternalBetaFeedbackAnswer {
  return CAMP_OPS_INTERNAL_BETA_FEEDBACK_ANSWERS.includes(value as CampOpsInternalBetaFeedbackAnswer);
}

function normalizeAnswer(value: unknown): CampOpsInternalBetaFeedbackAnswer {
  return isKnownAnswer(value) ? value : 'not_tested';
}

function sanitizeText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed
    .slice(0, MAX_TEXT_LENGTH)
    .replace(COORDINATE_PAIR_PATTERN, '[redacted coordinates]')
    .replace(LABELED_COORDINATE_PATTERN, '$1=[redacted]');
}

function normalizeDateIso(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : fallback;
}

function retentionExpiresAtIso(nowIso: string): string | null {
  const time = Date.parse(nowIso);
  if (!Number.isFinite(time)) return null;
  return new Date(time + CAMP_OPS_INTERNAL_BETA_FEEDBACK_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

function createFeedbackId(nowIso: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `campops-feedback-${nowIso.replace(/[^0-9]/g, '').slice(0, 14)}-${random}`;
}

function normalizeStructured(
  structured: Partial<CampOpsInternalBetaFeedbackStructured> | null | undefined,
): CampOpsInternalBetaFeedbackStructured {
  return {
    recommendationUseful: normalizeAnswer(structured?.recommendationUseful),
    recommendationConfusing: normalizeAnswer(structured?.recommendationConfusing),
    endpointFeltWrong: normalizeAnswer(structured?.endpointFeltWrong),
    staleMissingWarningUnclear: normalizeAnswer(structured?.staleMissingWarningUnclear),
    sourceConfidenceUnclear: normalizeAnswer(structured?.sourceConfidenceUnclear),
    aiWordingConcern: normalizeAnswer(structured?.aiWordingConcern),
    legacyResultConflict: normalizeAnswer(structured?.legacyResultConflict),
    mobileUiOverflowOrCramped: normalizeAnswer(structured?.mobileUiOverflowOrCramped),
    actionButtonIssue: normalizeAnswer(structured?.actionButtonIssue),
    privacyConcern: normalizeAnswer(structured?.privacyConcern),
    providerDataAppearedWrong: normalizeAnswer(structured?.providerDataAppearedWrong),
    twoHourDelayFlowUseful: normalizeAnswer(structured?.twoHourDelayFlowUseful),
    decisionPointUseful: normalizeAnswer(structured?.decisionPointUseful),
  };
}

function normalizeScenario(
  scenario: CampOpsInternalBetaFeedbackScenario | null | undefined,
): Required<CampOpsInternalBetaFeedbackScenario> {
  return {
    mode: scenario?.mode ?? DEFAULT_SCENARIO.mode,
    delayScenario: scenario?.delayScenario ?? DEFAULT_SCENARIO.delayScenario,
    vehicleContext: scenario?.vehicleContext ?? DEFAULT_SCENARIO.vehicleContext,
    resourceContext: scenario?.resourceContext ?? DEFAULT_SCENARIO.resourceContext,
    offlineContext: scenario?.offlineContext ?? DEFAULT_SCENARIO.offlineContext,
  };
}

function normalizeVisibility(
  visibility: CampOpsInternalBetaFeedbackVisibility | null | undefined,
): CampOpsInternalBetaFeedbackVisibility {
  return visibility === 'internal_review' ? 'internal_review' : 'private';
}

export function createCampOpsInternalBetaFeedbackRecord(
  input: CampOpsInternalBetaFeedbackInput,
  nowIso = new Date().toISOString(),
): CampOpsInternalBetaFeedbackRecord {
  const createdAtIso = normalizeDateIso(nowIso, new Date().toISOString());
  return {
    id: createFeedbackId(createdAtIso),
    source: 'campops_internal_beta_feedback',
    visibility: normalizeVisibility(input.visibility),
    testerRole: sanitizeText(input.testerRole),
    buildLabel: sanitizeText(input.buildLabel),
    regionLabel: sanitizeText(input.regionLabel),
    routeLabel: sanitizeText(input.routeLabel),
    scenario: normalizeScenario(input.scenario),
    structured: normalizeStructured(input.structured),
    notes: sanitizeText(input.notes),
    privacy: {
      preciseLocationStored: false,
      privateUserIdStored: false,
      vehicleIdentifierStored: false,
      rawAiPromptStored: false,
      privateDebriefNotesStored: false,
      communityPublishingPath: false,
      telemetryEmitted: false,
      retentionExpiresAtIso: retentionExpiresAtIso(createdAtIso),
    },
    submittedAtIso: normalizeDateIso(input.submittedAtIso, createdAtIso),
    createdAtIso,
  };
}

export function exportCampOpsInternalBetaFeedbackForReview(
  records: CampOpsInternalBetaFeedbackRecord[],
  nowIso = new Date().toISOString(),
): CampOpsInternalBetaFeedbackExport {
  const issueCounts: Partial<Record<keyof CampOpsInternalBetaFeedbackStructured, number>> = {};
  for (const record of records) {
    for (const [key, value] of Object.entries(record.structured) as Array<
      [keyof CampOpsInternalBetaFeedbackStructured, CampOpsInternalBetaFeedbackAnswer]
    >) {
      if (value === 'yes' || value === 'mixed') issueCounts[key] = (issueCounts[key] ?? 0) + 1;
    }
  }
  return {
    generatedAtIso: normalizeDateIso(nowIso, new Date().toISOString()),
    feedbackCount: records.length,
    issueCounts,
    items: records.map((record) => ({
      id: record.id,
      testerRole: record.testerRole,
      buildLabel: record.buildLabel,
      regionLabel: record.regionLabel,
      routeLabel: record.routeLabel,
      scenario: record.scenario,
      structured: record.structured,
      notes: record.notes,
      submittedAtIso: record.submittedAtIso,
    })),
  };
}

function canUseFeedbackLocalStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

function loadStoredFeedback(): CampOpsInternalBetaFeedbackRecord[] {
  if (!canUseFeedbackLocalStorage()) return memoryFeedbackRecords;
  try {
    const raw = localStorage.getItem(CAMP_OPS_INTERNAL_BETA_FEEDBACK_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveStoredFeedback(records: CampOpsInternalBetaFeedbackRecord[]): void {
  memoryFeedbackRecords = records;
  if (!canUseFeedbackLocalStorage()) return;
  try {
    localStorage.setItem(CAMP_OPS_INTERNAL_BETA_FEEDBACK_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Feedback persistence is best effort when storage is restricted.
  }
}

export class MemoryCampOpsInternalBetaFeedbackBackend implements CampOpsInternalBetaFeedbackBackend {
  readonly records: CampOpsInternalBetaFeedbackRecord[] = [];

  async insertFeedback(
    record: CampOpsInternalBetaFeedbackRecord,
  ): Promise<CampOpsInternalBetaFeedbackServiceResult<CampOpsInternalBetaFeedbackRecord>> {
    this.records.push(record);
    return { ok: true, data: record };
  }
}

export class LocalCampOpsInternalBetaFeedbackBackend implements CampOpsInternalBetaFeedbackBackend {
  async insertFeedback(
    record: CampOpsInternalBetaFeedbackRecord,
  ): Promise<CampOpsInternalBetaFeedbackServiceResult<CampOpsInternalBetaFeedbackRecord>> {
    const records = loadStoredFeedback();
    records.push(record);
    saveStoredFeedback(records);
    return { ok: true, data: record };
  }
}

export function getStoredCampOpsInternalBetaFeedback(): CampOpsInternalBetaFeedbackRecord[] {
  return loadStoredFeedback();
}

export function clearStoredCampOpsInternalBetaFeedback(): void {
  memoryFeedbackRecords = [];
  if (!canUseFeedbackLocalStorage()) return;
  try {
    localStorage.removeItem(CAMP_OPS_INTERNAL_BETA_FEEDBACK_STORAGE_KEY);
  } catch {
    // Ignore restricted storage.
  }
}

export class CampOpsInternalBetaFeedbackService {
  constructor(private readonly backend: CampOpsInternalBetaFeedbackBackend = new LocalCampOpsInternalBetaFeedbackBackend()) {}

  async captureFeedback(
    input: CampOpsInternalBetaFeedbackInput,
  ): Promise<CampOpsInternalBetaFeedbackServiceResult<CampOpsInternalBetaFeedbackRecord>> {
    try {
      return await this.backend.insertFeedback(createCampOpsInternalBetaFeedbackRecord(input));
    } catch (error) {
      return {
        ok: false,
        code: 'backend_error',
        error: error instanceof Error ? error.message : 'CampOps internal beta feedback storage failed.',
      };
    }
  }
}

export const campOpsInternalBetaFeedbackService = new CampOpsInternalBetaFeedbackService();
