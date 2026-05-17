import { Platform } from 'react-native';

import { connectivity, type ConnectivityStatus } from '../connectivity';
import {
  campsiteRecommendationService,
  type CampSiteReportResponse,
  type CampsiteServiceResult,
  type CreateCampSiteReportInput,
} from './campsiteRecommendationService';

const STORAGE_KEY = 'ecs_campsite_recommendation_queue_v1';

export type CampsiteOfflineStatus =
  | 'saved_locally'
  | 'waiting_to_sync'
  | 'syncing'
  | 'sync_failed'
  | 'submitted';

export interface OfflineCampsiteSubmission {
  client_submission_id: string;
  input: CreateCampSiteReportInput;
  status: CampsiteOfflineStatus;
  created_at: string;
  updated_at: string;
  retry_count: number;
  last_error?: string | null;
  submitted_report_id?: string | null;
  photo_count?: number;
  photo_local_refs?: string[];
  server_moderation_status?: string | null;
  server_review_state?: string | null;
}

export type CampsiteReportSyncService = {
  createCampsiteReport(
    input: CreateCampSiteReportInput,
  ): Promise<CampsiteServiceResult<CampSiteReportResponse>>;
};

export type CampsiteOfflineSyncAfterSubmit = (
  report: CampSiteReportResponse,
  submission: OfflineCampsiteSubmission,
) => Promise<void> | void;

export type OfflineSafeCampsiteSubmitResult =
  | {
      ok: true;
      mode: 'submitted';
      report: CampSiteReportResponse;
    }
  | {
      ok: true;
      mode: 'queued';
      submission: OfflineCampsiteSubmission;
    }
  | {
      ok: false;
      error: string;
      details?: string[];
    };

let memoryQueue: OfflineCampsiteSubmission[] = [];
let syncUnsubscribe: (() => void) | null = null;
let syncInFlight = false;
const listeners = new Set<(queue: OfflineCampsiteSubmission[]) => void>();

function canUseLocalStorage(): boolean {
  return Platform.OS === 'web' && typeof localStorage !== 'undefined';
}

function loadQueue(): OfflineCampsiteSubmission[] {
  if (!canUseLocalStorage()) return memoryQueue;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: OfflineCampsiteSubmission[]): void {
  memoryQueue = queue;
  if (canUseLocalStorage()) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    } catch {
      // Local-only draft preservation is best effort on restricted storage targets.
    }
  }
  notifyListeners(queue);
}

function notifyListeners(queue = loadQueue()): void {
  listeners.forEach((listener) => {
    try {
      listener(queue);
    } catch {
      // Keep campsite sync status observers isolated from queue processing.
    }
  });
}

function normalizeInput(
  input: CreateCampSiteReportInput,
  clientSubmissionId: string,
): CreateCampSiteReportInput {
  return {
    ...input,
    client_submission_id: input.client_submission_id?.trim() || clientSubmissionId,
  };
}

function shouldQueueError(code?: string): boolean {
  return code === 'backend_unavailable' || code === 'backend_error';
}

export function createCampsiteClientSubmissionId(): string {
  return `camp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getCampsiteOfflineStatusLabel(status: CampsiteOfflineStatus): string {
  switch (status) {
    case 'saved_locally':
      return 'Saved locally';
    case 'waiting_to_sync':
      return 'Waiting to sync';
    case 'syncing':
      return 'Syncing';
    case 'sync_failed':
      return 'Sync failed';
    case 'submitted':
      return 'Submitted';
    default:
      return 'Waiting to sync';
  }
}

export function getOfflineCampsiteSubmissions(): OfflineCampsiteSubmission[] {
  return loadQueue();
}

export function subscribeOfflineCampsiteSubmissions(
  listener: (queue: OfflineCampsiteSubmission[]) => void,
): () => void {
  listeners.add(listener);
  listener(loadQueue());
  return () => {
    listeners.delete(listener);
  };
}

export function clearOfflineCampsiteSubmissionsForTest(): void {
  memoryQueue = [];
  if (canUseLocalStorage()) {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore restricted storage in tests.
    }
  }
  notifyListeners([]);
}

export function saveOfflineCampsiteSubmission(
  input: CreateCampSiteReportInput,
  options: { status?: CampsiteOfflineStatus; photoCount?: number; photoLocalRefs?: string[] } = {},
): OfflineCampsiteSubmission {
  const clientSubmissionId = input.client_submission_id?.trim() || createCampsiteClientSubmissionId();
  const now = new Date().toISOString();
  const queue = loadQueue();
  const existingIndex = queue.findIndex(
    (item) => item.client_submission_id === clientSubmissionId,
  );
  const existing = existingIndex >= 0 ? queue[existingIndex] : null;
  const submission: OfflineCampsiteSubmission = {
    client_submission_id: clientSubmissionId,
    input: normalizeInput(input, clientSubmissionId),
    status: options.status ?? existing?.status ?? 'waiting_to_sync',
    created_at: existing?.created_at ?? now,
    updated_at: now,
    retry_count: existing?.retry_count ?? 0,
    last_error: existing?.last_error ?? null,
    submitted_report_id: existing?.submitted_report_id ?? null,
    photo_count: options.photoCount ?? existing?.photo_count ?? 0,
    photo_local_refs: options.photoLocalRefs ?? existing?.photo_local_refs ?? [],
    server_moderation_status: existing?.server_moderation_status ?? null,
    server_review_state: existing?.server_review_state ?? null,
  };

  if (existingIndex >= 0) {
    queue[existingIndex] = submission;
  } else {
    queue.push(submission);
  }
  saveQueue(queue);
  return submission;
}

export function updateOfflineCampsiteSubmissionDraft(
  clientSubmissionId: string,
  inputChanges: Partial<CreateCampSiteReportInput>,
): OfflineCampsiteSubmission | null {
  const queue = loadQueue();
  const index = queue.findIndex((item) => item.client_submission_id === clientSubmissionId);
  if (index < 0 || queue[index].status === 'submitted') return null;
  const updated: OfflineCampsiteSubmission = {
    ...queue[index],
    input: normalizeInput(
      { ...queue[index].input, ...inputChanges },
      clientSubmissionId,
    ),
    status: 'saved_locally',
    updated_at: new Date().toISOString(),
    last_error: null,
  };
  queue[index] = updated;
  saveQueue(queue);
  return updated;
}

export function deleteOfflineCampsiteSubmissionDraft(clientSubmissionId: string): boolean {
  const queue = loadQueue();
  const index = queue.findIndex((item) => item.client_submission_id === clientSubmissionId);
  if (index < 0 || queue[index].status === 'submitted') return false;
  queue.splice(index, 1);
  saveQueue(queue);
  return true;
}

export function markOfflineCampsiteSubmissionForRetry(clientSubmissionId: string): OfflineCampsiteSubmission | null {
  const queue = loadQueue();
  const index = queue.findIndex((item) => item.client_submission_id === clientSubmissionId);
  if (index < 0 || queue[index].status === 'submitted') return null;
  const updated: OfflineCampsiteSubmission = {
    ...queue[index],
    status: 'waiting_to_sync',
    updated_at: new Date().toISOString(),
    last_error: null,
  };
  queue[index] = updated;
  saveQueue(queue);
  return updated;
}

export async function syncOfflineCampsiteSubmissions(
  options: { service?: CampsiteReportSyncService; afterSubmit?: CampsiteOfflineSyncAfterSubmit } = {},
): Promise<{ submitted: number; failed: number; remaining: number }> {
  if (syncInFlight) {
    const queue = loadQueue();
    return {
      submitted: 0,
      failed: 0,
      remaining: queue.filter((item) => item.status !== 'submitted').length,
    };
  }
  syncInFlight = true;

  const service = options.service ?? campsiteRecommendationService;
  const queue = loadQueue();
  let submitted = 0;
  let failed = 0;

  try {
    for (let index = 0; index < queue.length; index += 1) {
      const item = queue[index];
      if (item.status === 'submitted') continue;

      queue[index] = {
        ...item,
        status: 'syncing',
        updated_at: new Date().toISOString(),
        last_error: null,
      };
      saveQueue([...queue]);

      const result = await service.createCampsiteReport(item.input);
      const now = new Date().toISOString();
      if (result.ok) {
        try {
          await options.afterSubmit?.(result.data, queue[index]);
        } catch (error) {
          queue[index] = {
            ...queue[index],
            status: 'sync_failed',
            updated_at: now,
            retry_count: item.retry_count + 1,
            last_error: error instanceof Error ? error.message : 'Post-sync processing failed.',
            submitted_report_id: result.data.id,
            server_moderation_status: result.data.moderation_status,
            server_review_state: result.data.review_state ?? null,
          };
          failed += 1;
          continue;
        }
        queue[index] = {
          ...queue[index],
          status: 'submitted',
          updated_at: now,
          last_error: null,
          submitted_report_id: result.data.id,
          server_moderation_status: result.data.moderation_status,
          server_review_state: result.data.review_state ?? null,
        };
        submitted += 1;
      } else {
        queue[index] = {
          ...queue[index],
          status: 'sync_failed',
          updated_at: now,
          retry_count: item.retry_count + 1,
          last_error: result.error,
        };
        failed += 1;
      }
    }
  } finally {
    saveQueue(queue);
    syncInFlight = false;
  }

  return {
    submitted,
    failed,
    remaining: queue.filter((item) => item.status !== 'submitted').length,
  };
}

export async function submitCampsiteReportOfflineSafe(
  input: CreateCampSiteReportInput,
  options: {
    service?: CampsiteReportSyncService;
    online?: boolean;
    photoCount?: number;
    photoLocalRefs?: string[];
  } = {},
): Promise<OfflineSafeCampsiteSubmitResult> {
  const service = options.service ?? campsiteRecommendationService;
  const online = options.online ?? connectivity.isOnline();
  const clientSubmissionId = input.client_submission_id?.trim() || createCampsiteClientSubmissionId();
  const payload = normalizeInput(input, clientSubmissionId);

  if (!online) {
    return {
      ok: true,
      mode: 'queued',
      submission: saveOfflineCampsiteSubmission(payload, {
        status: 'saved_locally',
        photoCount: options.photoCount,
        photoLocalRefs: options.photoLocalRefs,
      }),
    };
  }

  const result = await service.createCampsiteReport(payload);
  if (result.ok) {
    return { ok: true, mode: 'submitted', report: result.data };
  }

  if (shouldQueueError(result.code)) {
    return {
      ok: true,
      mode: 'queued',
      submission: saveOfflineCampsiteSubmission(payload, {
        status: 'saved_locally',
        photoCount: options.photoCount,
        photoLocalRefs: options.photoLocalRefs,
      }),
    };
  }

  return { ok: false, error: result.error, details: result.details };
}

export function initializeCampsiteOfflineSync(
  options: { service?: CampsiteReportSyncService } = {},
): () => void {
  if (syncUnsubscribe) return syncUnsubscribe;

  syncUnsubscribe = connectivity.onStatusChange(
    (status: ConnectivityStatus, wasOffline: boolean) => {
      if (status === 'online' && wasOffline) {
        void syncOfflineCampsiteSubmissions(options);
      }
    },
  );

  if (connectivity.isOnline()) {
    void syncOfflineCampsiteSubmissions(options);
  }

  return () => {
    syncUnsubscribe?.();
    syncUnsubscribe = null;
  };
}
