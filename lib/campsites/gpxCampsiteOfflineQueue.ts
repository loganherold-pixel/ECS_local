import { Platform } from 'react-native';

import { connectivity, type ConnectivityStatus } from '../connectivity';
import {
  buildCampsiteReportInputFromGpxCandidate,
  gpxCampsiteImportService,
  parseGpxCampsiteCandidates,
  type GpxCampsiteCandidate,
  type GpxCampsiteImportResult,
  type GpxImportUploadFile,
  type GpxImportUploadResult,
} from './gpxCampsiteImport';
import {
  saveOfflineCampsiteSubmission,
  type OfflineCampsiteSubmission,
} from './campsiteOfflineQueue';
import type {
  CampSiteVisibility,
} from './campsiteRecommendationTypes';
import type {
  CampsiteServiceResult,
} from './campsiteRecommendationService';

const STORAGE_KEY = 'ecs_gpx_campsite_import_queue_v1';

export type OfflineGpxImportStatus =
  | 'local_selected'
  | 'waiting_to_parse'
  | 'parsed_locally'
  | 'waiting_to_upload'
  | 'uploaded'
  | 'failed';

export interface OfflineGpxImport {
  client_import_id: string;
  file_name: string;
  file_size_bytes: number | null;
  content_type: string | null;
  content?: string | null;
  status: OfflineGpxImportStatus;
  created_at: string;
  updated_at: string;
  retry_count: number;
  last_error?: string | null;
  uploaded_import_id?: string | null;
  parsed_import?: GpxCampsiteImportResult | null;
}

export type GpxImportSyncService = {
  uploadGpxImport(file: GpxImportUploadFile): Promise<CampsiteServiceResult<GpxImportUploadResult>>;
};

let memoryQueue: OfflineGpxImport[] = [];
let syncUnsubscribe: (() => void) | null = null;
let syncInFlight = false;
const listeners = new Set<(imports: OfflineGpxImport[]) => void>();

function canUseLocalStorage(): boolean {
  return Platform.OS === 'web' && typeof localStorage !== 'undefined';
}

function loadQueue(): OfflineGpxImport[] {
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

function saveQueue(queue: OfflineGpxImport[]): void {
  memoryQueue = queue;
  if (canUseLocalStorage()) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    } catch {
      // Local GPX import state is best-effort on restricted storage targets.
    }
  }
  notifyListeners(queue);
}

function notifyListeners(queue = loadQueue()): void {
  listeners.forEach((listener) => {
    try {
      listener(queue);
    } catch {
      // Keep GPX status observers isolated from import processing.
    }
  });
}

function nowIso(): string {
  return new Date().toISOString();
}

export function createGpxClientImportId(): string {
  return `gpx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getOfflineGpxImports(): OfflineGpxImport[] {
  return loadQueue();
}

export function subscribeOfflineGpxImports(
  listener: (imports: OfflineGpxImport[]) => void,
): () => void {
  listeners.add(listener);
  listener(loadQueue());
  return () => listeners.delete(listener);
}

export function clearOfflineGpxImportsForTest(): void {
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

export function saveOfflineGpxImportSelection(
  file: GpxImportUploadFile,
  options: { clientImportId?: string; parseLocally?: boolean } = {},
): OfflineGpxImport {
  const clientImportId = options.clientImportId ?? file.client_import_id?.trim() ?? createGpxClientImportId();
  const queue = loadQueue();
  const existingIndex = queue.findIndex((item) => item.client_import_id === clientImportId);
  const existing = existingIndex >= 0 ? queue[existingIndex] : null;
  const createdAt = existing?.created_at ?? nowIso();

  let parsed: GpxCampsiteImportResult | null = existing?.parsed_import ?? null;
  let status: OfflineGpxImportStatus = existing?.status ?? 'local_selected';
  let lastError: string | null = existing?.last_error ?? null;

  if (options.parseLocally !== false && typeof file.content === 'string') {
    try {
      parsed = parseGpxCampsiteCandidates(file.name, file.content);
      status = 'parsed_locally';
      lastError = null;
    } catch (error) {
      status = 'failed';
      lastError = error instanceof Error ? error.message : 'GPX local parse failed.';
    }
  } else if (!file.content) {
    status = 'waiting_to_parse';
  }

  const item: OfflineGpxImport = {
    client_import_id: clientImportId,
    file_name: file.name,
    file_size_bytes: file.size ?? null,
    content_type: file.type ?? null,
    content: file.content ?? existing?.content ?? null,
    status,
    created_at: createdAt,
    updated_at: nowIso(),
    retry_count: existing?.retry_count ?? 0,
    last_error: lastError,
    uploaded_import_id: existing?.uploaded_import_id ?? null,
    parsed_import: parsed,
  };

  if (existingIndex >= 0) {
    queue[existingIndex] = item;
  } else {
    queue.push(item);
  }
  saveQueue(queue);
  return item;
}

export function markOfflineGpxImportForUpload(clientImportId: string): OfflineGpxImport | null {
  const queue = loadQueue();
  const index = queue.findIndex((item) => item.client_import_id === clientImportId);
  if (index < 0 || queue[index].status === 'uploaded') return null;
  queue[index] = {
    ...queue[index],
    status: 'waiting_to_upload',
    updated_at: nowIso(),
    last_error: null,
  };
  saveQueue(queue);
  return queue[index];
}

export function saveGpxCandidateAsOfflineCampsiteDraft(
  candidate: GpxCampsiteCandidate,
  visibility: Extract<CampSiteVisibility, 'private' | 'community'>,
  acknowledgements: Parameters<typeof buildCampsiteReportInputFromGpxCandidate>[2] = {},
): OfflineCampsiteSubmission {
  const payload = buildCampsiteReportInputFromGpxCandidate(candidate, visibility, acknowledgements);
  return saveOfflineCampsiteSubmission(payload, { status: 'saved_locally' });
}

export async function submitGpxImportOfflineSafe(
  file: GpxImportUploadFile,
  options: {
    service?: GpxImportSyncService;
    online?: boolean;
    parseLocally?: boolean;
  } = {},
): Promise<
  | { ok: true; mode: 'uploaded'; result: GpxImportUploadResult }
  | { ok: true; mode: 'queued'; importItem: OfflineGpxImport }
  | { ok: false; error: string }
> {
  const service = options.service ?? gpxCampsiteImportService;
  const online = options.online ?? connectivity.isOnline();
  const clientImportId = file.client_import_id?.trim() || createGpxClientImportId();
  const uploadFile = { ...file, client_import_id: clientImportId };

  if (!online) {
    return {
      ok: true,
      mode: 'queued',
      importItem: saveOfflineGpxImportSelection(uploadFile, {
        clientImportId,
        parseLocally: options.parseLocally,
      }),
    };
  }

  const result = await service.uploadGpxImport(uploadFile);
  if (result.ok) {
    return { ok: true, mode: 'uploaded', result: result.data };
  }

  if (result.code === 'backend_unavailable' || result.code === 'backend_error') {
    return {
      ok: true,
      mode: 'queued',
      importItem: saveOfflineGpxImportSelection(uploadFile, {
        clientImportId,
        parseLocally: options.parseLocally,
      }),
    };
  }

  return { ok: false, error: result.error };
}

export async function syncOfflineGpxImports(
  options: { service?: GpxImportSyncService } = {},
): Promise<{ uploaded: number; failed: number; remaining: number }> {
  if (syncInFlight) {
    const queue = loadQueue();
    return {
      uploaded: 0,
      failed: 0,
      remaining: queue.filter((item) => item.status !== 'uploaded').length,
    };
  }

  syncInFlight = true;
  const service = options.service ?? gpxCampsiteImportService;
  const queue = loadQueue();
  let uploaded = 0;
  let failed = 0;

  try {
    for (let index = 0; index < queue.length; index += 1) {
      const item = queue[index];
      if (item.status === 'uploaded') continue;
      if (!item.content) {
        queue[index] = {
          ...item,
          status: 'waiting_to_parse',
          updated_at: nowIso(),
          last_error: 'GPX file content is not available locally. Select the file again when online.',
        };
        failed += 1;
        continue;
      }

      queue[index] = {
        ...item,
        status: 'waiting_to_upload',
        updated_at: nowIso(),
        last_error: null,
      };
      saveQueue([...queue]);

      const result = await service.uploadGpxImport({
        name: item.file_name,
        size: item.file_size_bytes,
        type: item.content_type,
        content: item.content,
        client_import_id: item.client_import_id,
      });
      if (result.ok) {
        queue[index] = {
          ...queue[index],
          status: 'uploaded',
          updated_at: nowIso(),
          last_error: null,
          uploaded_import_id: result.data.importRecord.id,
        };
        uploaded += 1;
      } else {
        queue[index] = {
          ...queue[index],
          status: 'failed',
          updated_at: nowIso(),
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
    uploaded,
    failed,
    remaining: queue.filter((item) => item.status !== 'uploaded').length,
  };
}

export function initializeGpxCampsiteOfflineSync(
  options: { service?: GpxImportSyncService } = {},
): () => void {
  if (syncUnsubscribe) return syncUnsubscribe;

  syncUnsubscribe = connectivity.onStatusChange((status: ConnectivityStatus, wasOffline: boolean) => {
    if (status === 'online' && wasOffline) {
      void syncOfflineGpxImports(options);
    }
  });

  if (connectivity.isOnline()) {
    void syncOfflineGpxImports(options);
  }

  return () => {
    syncUnsubscribe?.();
    syncUnsubscribe = null;
  };
}
