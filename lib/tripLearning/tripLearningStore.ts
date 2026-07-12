import { createMigratingNonSecureStorage } from '../nonSecureStorage';
import {
  buildCalibrationAnalyses,
  buildPostTripInspectionPrompts,
  qualifyForecastActualRecords,
} from './tripLearningEngine';
import {
  DEFAULT_TRIP_LEARNING_PREFERENCES,
  normalizeTripLearningPreferences,
} from './tripLearningConfig';
import {
  isTripLearningPayloadPrivacySafe,
  sanitizeCalibrationApplication,
  sanitizeCalibrationOverlay,
  sanitizeCalibrationProposal,
  sanitizeForecastActualRecord,
  sanitizePostTripInspectionPrompt,
  sanitizeQualifiedTripSample,
  sanitizeTripLearningForecastBaseline,
} from './tripLearningPrivacy';
import type {
  CalibrationApplication,
  CalibrationProposal,
  ForecastActualRecord,
  PostTripInspectionPrompt,
  QualifiedTripSample,
  TripCalibrationOverlay,
  TripExposureObservation,
  TripLearningForecastBaseline,
  TripLearningPreferences,
  TripLearningSummary,
  TripSampleQualificationResult,
} from './tripLearningTypes';

export const TRIP_LEARNING_STORAGE_KEY = 'ecs_trip_learning_local_v1';
export const TRIP_LEARNING_STORAGE_VERSION = 1;
const MAX_QUALIFIED_SAMPLES = 240;
const MAX_INSPECTION_PROMPTS = 180;
const MAX_APPLICATION_HISTORY = 80;
const MAX_PROCESSED_TRIPS = 240;

export type TripLearningState = {
  version: number;
  hydrated: boolean;
  preferences: TripLearningPreferences;
  baselines: TripLearningForecastBaseline[];
  samples: QualifiedTripSample[];
  proposals: CalibrationProposal[];
  calibrationOverlays: TripCalibrationOverlay[];
  applications: CalibrationApplication[];
  inspectionPrompts: PostTripInspectionPrompt[];
  processedTripIds: string[];
  updatedAt: string;
};

export type TripLearningProcessResult = {
  acceptedSamples: QualifiedTripSample[];
  rejectedSamples: TripSampleQualificationResult['rejected'];
  proposals: CalibrationProposal[];
  inspectionPrompts: PostTripInspectionPrompt[];
};

export interface TripLearningStorageBackend {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  remove(): Promise<void>;
}

export class MemoryTripLearningStorage implements TripLearningStorageBackend {
  value: string | null;

  constructor(initialValue: string | null = null) {
    this.value = initialValue;
  }

  async read(): Promise<string | null> {
    return this.value;
  }

  async write(value: string): Promise<void> {
    this.value = value;
  }

  async remove(): Promise<void> {
    this.value = null;
  }
}

const localStorageAdapter = createMigratingNonSecureStorage('ecs_trip_learning_local', {
  logTag: 'TripLearningStore',
});

class LocalTripLearningStorage implements TripLearningStorageBackend {
  read(): Promise<string | null> {
    return localStorageAdapter.read(TRIP_LEARNING_STORAGE_KEY);
  }

  write(value: string): Promise<void> {
    return localStorageAdapter.write(TRIP_LEARNING_STORAGE_KEY, value);
  }

  remove(): Promise<void> {
    return localStorageAdapter.remove(TRIP_LEARNING_STORAGE_KEY);
  }
}

function nowISO(): string {
  return new Date().toISOString();
}

function defaultState(): TripLearningState {
  return {
    version: TRIP_LEARNING_STORAGE_VERSION,
    hydrated: false,
    preferences: { ...DEFAULT_TRIP_LEARNING_PREFERENCES },
    baselines: [],
    samples: [],
    proposals: [],
    calibrationOverlays: [],
    applications: [],
    inspectionPrompts: [],
    processedTripIds: [],
    updatedAt: DEFAULT_TRIP_LEARNING_PREFERENCES.updatedAt,
  };
}

function validDate(value: unknown, fallback: string): string {
  const text = String(value ?? '').trim();
  return text && Number.isFinite(Date.parse(text)) ? text : fallback;
}

function safeIds(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .map((item) => String(item ?? '').trim())
    .filter((item) => item.length > 0 && item.length <= 96)))
    .slice(-max);
}

function normalizedArray<T>(
  value: unknown,
  normalize: (item: T) => T | null,
  max: number,
): T[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalize(item as T))
    .filter((item): item is T => item != null)
    .slice(-max);
}

/** Drops unknown fields while migrating so old payloads cannot smuggle traces. */
export function normalizeTripLearningState(raw: unknown): TripLearningState {
  const input = raw && typeof raw === 'object' ? raw as Partial<TripLearningState> : {};
  const timestamp = validDate(input.updatedAt, nowISO());
  return {
    version: TRIP_LEARNING_STORAGE_VERSION,
    hydrated: true,
    preferences: normalizeTripLearningPreferences(input.preferences, timestamp),
    baselines: normalizedArray(input.baselines, sanitizeTripLearningForecastBaseline, 24),
    samples: normalizedArray(input.samples, sanitizeQualifiedTripSample, MAX_QUALIFIED_SAMPLES),
    proposals: normalizedArray(input.proposals, sanitizeCalibrationProposal, 40),
    calibrationOverlays: normalizedArray(input.calibrationOverlays, sanitizeCalibrationOverlay, 20),
    applications: normalizedArray(input.applications, sanitizeCalibrationApplication, MAX_APPLICATION_HISTORY),
    inspectionPrompts: normalizedArray(input.inspectionPrompts, sanitizePostTripInspectionPrompt, MAX_INSPECTION_PROMPTS),
    processedTripIds: safeIds(input.processedTripIds, MAX_PROCESSED_TRIPS),
    updatedAt: timestamp,
  };
}

function persistencePayload(state: TripLearningState): Omit<TripLearningState, 'hydrated'> {
  const { hydrated: _hydrated, ...payload } = state;
  return payload;
}

function mergeProposalState(
  generated: CalibrationProposal[],
  existing: CalibrationProposal[],
): CalibrationProposal[] {
  const existingById = new Map(existing.map((proposal) => [proposal.id, proposal]));
  const current = generated.map((proposal) => {
    const previous = existingById.get(proposal.id);
    if (!previous || previous.status === 'pending') return proposal;
    return {
      ...proposal,
      status: previous.status,
      createdAt: previous.createdAt,
      updatedAt: previous.updatedAt,
      appliedAt: previous.appliedAt,
      dismissedAt: previous.dismissedAt,
      revertedAt: previous.revertedAt,
    };
  });
  const retained = existing.filter((proposal) =>
    proposal.status !== 'pending' && !current.some((item) => item.id === proposal.id));
  return [...current, ...retained].slice(-40);
}

function mergePromptState(
  generated: PostTripInspectionPrompt[],
  existing: PostTripInspectionPrompt[],
): PostTripInspectionPrompt[] {
  const existingById = new Map(existing.map((prompt) => [prompt.id, prompt]));
  const next = generated.map((prompt) => {
    const previous = existingById.get(prompt.id);
    return previous
      ? { ...prompt, status: previous.status, createdAt: previous.createdAt, updatedAt: previous.updatedAt }
      : prompt;
  });
  const generatedIds = new Set(next.map((prompt) => prompt.id));
  return [
    ...existing.filter((prompt) => !generatedIds.has(prompt.id)),
    ...next,
  ].slice(-MAX_INSPECTION_PROMPTS);
}

function activeDefault(proposal: CalibrationProposal): number {
  return proposal.adjustmentKind === 'camp_arrival_offset_minutes' ? 0 : 1;
}

export function selectTripLearningSummary(
  state: TripLearningState,
  tripId: string,
  expeditionId?: string | null,
): TripLearningSummary {
  const matchingSamples = state.samples.filter((sample) =>
    sample.tripId === tripId ||
    (!!expeditionId && sample.expeditionId === expeditionId));
  const matchingSampleTripIds = new Set(matchingSamples.map((sample) => sample.tripId));
  const proposals = state.proposals.filter((proposal) =>
    proposal.sourceTripIds.some((sourceTripId) => matchingSampleTripIds.has(sourceTripId)));
  const proposalIds = new Set(proposals.map((proposal) => proposal.id));
  return {
    tripId,
    sampleCount: matchingSamples.length,
    proposals,
    inspectionPrompts: state.inspectionPrompts.filter((prompt) =>
      prompt.tripId === tripId ||
      (!!expeditionId && prompt.expeditionId === expeditionId)),
    activeOverlays: state.calibrationOverlays.filter((overlay) => proposalIds.has(overlay.proposalId)),
  };
}

export function createTripLearningStore(
  backend: TripLearningStorageBackend,
) {
  let state = defaultState();
  let hydrationPromise: Promise<TripLearningState> | null = null;
  let mutationQueue: Promise<unknown> = Promise.resolve();
  const listeners = new Set<() => void>();

  const notify = () => listeners.forEach((listener) => {
    try {
      listener();
    } catch {}
  });

  const persist = async (next: TripLearningState): Promise<void> => {
    const payload = persistencePayload(next);
    if (!isTripLearningPayloadPrivacySafe(payload)) {
      throw new Error('Trip Learning persistence rejected a sensitive or trace-level field.');
    }
    state = next;
    await backend.write(JSON.stringify(payload));
    notify();
  };

  const hydrate = async (): Promise<TripLearningState> => {
    if (state.hydrated) return state;
    if (hydrationPromise) return hydrationPromise;
    hydrationPromise = (async () => {
      const raw = await backend.read();
      if (!raw) {
        state = { ...defaultState(), hydrated: true };
        notify();
        return state;
      }
      try {
        const normalized = normalizeTripLearningState(JSON.parse(raw));
        state = normalized;
        await backend.write(JSON.stringify(persistencePayload(normalized)));
      } catch {
        state = { ...defaultState(), hydrated: true };
      }
      notify();
      return state;
    })().finally(() => {
      hydrationPromise = null;
    });
    return hydrationPromise;
  };

  const mutate = <T>(operation: (current: TripLearningState) => Promise<{ state: TripLearningState; result: T }> | { state: TripLearningState; result: T }): Promise<T> => {
    const next = mutationQueue
      .catch(() => undefined)
      .then(async () => {
        await hydrate();
        const outcome = await operation(state);
        await persist(outcome.state);
        return outcome.result;
      });
    mutationQueue = next.then(() => undefined, () => undefined);
    return next;
  };

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    getSnapshot(): TripLearningState {
      return state;
    },

    hydrate,

    async updatePreferences(
      patch: Partial<Omit<TripLearningPreferences, 'schemaVersion' | 'localOnly' | 'cloudSyncEnabled' | 'updatedAt'>>,
    ): Promise<TripLearningPreferences> {
      return mutate((current) => {
        const timestamp = nowISO();
        const preferences = normalizeTripLearningPreferences({
          ...current.preferences,
          ...patch,
          localOnly: true,
          cloudSyncEnabled: false,
          updatedAt: timestamp,
        }, timestamp);
        return {
          state: { ...current, preferences, updatedAt: timestamp },
          result: preferences,
        };
      });
    },

    async captureBaseline(input: TripLearningForecastBaseline): Promise<TripLearningForecastBaseline | null> {
      const baseline = sanitizeTripLearningForecastBaseline(input);
      if (!baseline) return null;
      return mutate((current) => {
        const baselines = [
          ...current.baselines.filter((item) => item.tripId !== baseline.tripId),
          baseline,
        ].slice(-24);
        return {
          state: { ...current, baselines, updatedAt: nowISO() },
          result: baseline,
        };
      });
    },

    async getBaseline(tripId: string): Promise<TripLearningForecastBaseline | null> {
      await hydrate();
      return state.baselines.find((baseline) => baseline.tripId === tripId) ?? null;
    },

    async processOutcome(input: {
      records?: readonly ForecastActualRecord[] | null;
      observations?: readonly TripExposureObservation[] | null;
      processedTripId?: string | null;
      consumeBaselineTripId?: string | null;
      now?: string | null;
    }): Promise<TripLearningProcessResult> {
      return mutate((current) => {
        const sanitizedRecords = (input.records ?? [])
          .map((record) => sanitizeForecastActualRecord(record))
          .filter((record): record is ForecastActualRecord => record != null);
        const qualification = qualifyForecastActualRecords(sanitizedRecords, {
          existingFingerprints: current.samples.map((sample) => sample.fingerprint),
        });
        const samples = [...current.samples, ...qualification.accepted].slice(-MAX_QUALIFIED_SAMPLES);
        const generatedProposals = current.preferences.calibrationProposalsEnabled
          ? buildCalibrationAnalyses(samples, { now: input.now })
              .map((analysis) => analysis.proposal)
              .filter((proposal): proposal is CalibrationProposal => proposal != null)
          : [];
        const proposals = mergeProposalState(generatedProposals, current.proposals);
        const generatedPrompts = current.preferences.inspectionPromptsEnabled
          ? buildPostTripInspectionPrompts(input.observations ?? [], input.now)
              .map(sanitizePostTripInspectionPrompt)
              .filter((prompt): prompt is PostTripInspectionPrompt => prompt != null)
          : [];
        const inspectionPrompts = mergePromptState(generatedPrompts, current.inspectionPrompts);
        const processedTripIds = input.processedTripId
          ? Array.from(new Set([...current.processedTripIds, input.processedTripId])).slice(-MAX_PROCESSED_TRIPS)
          : current.processedTripIds;
        const baselines = input.consumeBaselineTripId
          ? current.baselines.filter((baseline) => baseline.tripId !== input.consumeBaselineTripId)
          : current.baselines;
        const timestamp = validDate(input.now, nowISO());
        return {
          state: {
            ...current,
            baselines,
            samples,
            proposals,
            inspectionPrompts,
            processedTripIds,
            updatedAt: timestamp,
          },
          result: {
            acceptedSamples: qualification.accepted,
            rejectedSamples: qualification.rejected,
            proposals,
            inspectionPrompts: generatedPrompts,
          },
        };
      });
    },

    async applyProposal(proposalId: string, confirmed: boolean): Promise<TripCalibrationOverlay | null> {
      if (confirmed !== true) return null;
      return mutate((current) => {
        const proposal = current.proposals.find((item) => item.id === proposalId);
        if (!proposal || !proposal.canApply || (proposal.status !== 'pending' && proposal.status !== 'reverted')) {
          return { state: current, result: null };
        }
        const timestamp = nowISO();
        const overlayKey = `trip-calibration:${proposal.scopeKey}`;
        const previousOverlay = current.calibrationOverlays.find((overlay) => overlay.key === overlayKey);
        const previousValue = previousOverlay?.value ?? activeDefault(proposal);
        const overlay: TripCalibrationOverlay = {
          key: overlayKey,
          proposalId: proposal.id,
          metric: proposal.metric,
          scopeKey: proposal.scopeKey,
          adjustmentKind: proposal.adjustmentKind,
          value: proposal.proposedValue,
          previousValue,
          appliedAt: timestamp,
        };
        const application: CalibrationApplication = {
          id: `application:${proposal.id}:${Date.parse(timestamp)}`,
          proposalId: proposal.id,
          overlayKey,
          previousValue,
          appliedValue: proposal.proposedValue,
          appliedAt: timestamp,
          revertedAt: null,
          status: 'active',
        };
        const proposals = current.proposals.map((item) => item.id === proposal.id
          ? { ...item, status: 'applied' as const, appliedAt: timestamp, revertedAt: null, updatedAt: timestamp }
          : item);
        return {
          state: {
            ...current,
            proposals,
            calibrationOverlays: [
              ...current.calibrationOverlays.filter((item) => item.key !== overlayKey),
              overlay,
            ],
            applications: [...current.applications, application].slice(-MAX_APPLICATION_HISTORY),
            updatedAt: timestamp,
          },
          result: overlay,
        };
      });
    },

    async dismissProposal(proposalId: string): Promise<CalibrationProposal | null> {
      return mutate((current) => {
        const proposal = current.proposals.find((item) => item.id === proposalId);
        if (!proposal || proposal.status === 'applied') return { state: current, result: null };
        const timestamp = nowISO();
        const updated: CalibrationProposal = {
          ...proposal,
          status: 'dismissed',
          dismissedAt: timestamp,
          updatedAt: timestamp,
        };
        return {
          state: {
            ...current,
            proposals: current.proposals.map((item) => item.id === proposalId ? updated : item),
            updatedAt: timestamp,
          },
          result: updated,
        };
      });
    },

    async revertProposal(proposalId: string): Promise<CalibrationProposal | null> {
      return mutate((current) => {
        const proposal = current.proposals.find((item) => item.id === proposalId);
        const application = [...current.applications]
          .reverse()
          .find((item) => item.proposalId === proposalId && item.status === 'active');
        if (!proposal || !application) return { state: current, result: null };
        const timestamp = nowISO();
        const defaultValue = activeDefault(proposal);
        const calibrationOverlays = application.previousValue === defaultValue
          ? current.calibrationOverlays.filter((overlay) => overlay.key !== application.overlayKey)
          : current.calibrationOverlays.map((overlay) => overlay.key === application.overlayKey
            ? { ...overlay, value: application.previousValue, appliedAt: timestamp }
            : overlay);
        const updated: CalibrationProposal = {
          ...proposal,
          status: 'reverted',
          revertedAt: timestamp,
          updatedAt: timestamp,
        };
        return {
          state: {
            ...current,
            proposals: current.proposals.map((item) => item.id === proposalId ? updated : item),
            calibrationOverlays,
            applications: current.applications.map((item) => item.id === application.id
              ? { ...item, status: 'reverted' as const, revertedAt: timestamp }
              : item),
            updatedAt: timestamp,
          },
          result: updated,
        };
      });
    },

    async setInspectionPromptStatus(
      promptId: string,
      status: PostTripInspectionPrompt['status'],
    ): Promise<PostTripInspectionPrompt | null> {
      return mutate((current) => {
        const prompt = current.inspectionPrompts.find((item) => item.id === promptId);
        if (!prompt) return { state: current, result: null };
        const timestamp = nowISO();
        const updated = { ...prompt, status, updatedAt: timestamp };
        return {
          state: {
            ...current,
            inspectionPrompts: current.inspectionPrompts.map((item) => item.id === promptId ? updated : item),
            updatedAt: timestamp,
          },
          result: updated,
        };
      });
    },

    getSummaryForTrip(tripId: string, expeditionId?: string | null): TripLearningSummary {
      return selectTripLearningSummary(state, tripId, expeditionId);
    },

    async clearLearningData(): Promise<void> {
      return mutate((current) => {
        const timestamp = nowISO();
        return {
          state: {
            ...defaultState(),
            hydrated: true,
            preferences: current.preferences,
            updatedAt: timestamp,
          },
          result: undefined,
        };
      });
    },

    async resetForTests(): Promise<void> {
      await backend.remove();
      state = { ...defaultState(), hydrated: true };
      notify();
    },
  };
}

export const tripLearningStore = createTripLearningStore(new LocalTripLearningStorage());

