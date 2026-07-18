import {
  fetchRouteGeometryViewportSegments,
} from '../../../../lib/routeGeometryViewportClient';
import { supabase } from '../../../../lib/supabase';
import type {
  RouteGeometryViewportBbox,
  RouteGeometryViewportResult,
} from '../../../../lib/routeGeometryViewport';
import {
  MVUM_SOURCE_PROVIDER_PREFIX,
  normalizeMvumCanonicalSegment,
  type MvumCanonicalSegment,
} from './index';

const MVUM_CANONICAL_REQUEST_TIMEOUT_MS = 12_000;

type MvumCanonicalRequestEntry = {
  controller: AbortController;
  consumers: Set<symbol>;
  settled: boolean;
  promise: Promise<MvumCanonicalSegment[]>;
};

const mvumCanonicalRequests = new Map<string, MvumCanonicalRequestEntry>();

export class NavigateMvumCanonicalRequestError extends Error {
  readonly safeCode: 'MVUM_DETAIL_TIMEOUT' | 'MVUM_DETAIL_CANCELLED' | 'MVUM_DETAIL_PROVIDER_ERROR';

  constructor(
    safeCode: NavigateMvumCanonicalRequestError['safeCode'],
    message: string,
  ) {
    super(message);
    this.name = 'NavigateMvumCanonicalRequestError';
    this.safeCode = safeCode;
  }
}

function canonicalRequestKey(segmentIds: readonly string[]): string {
  return [...segmentIds].sort().join('|');
}

function joinCanonicalRequest(
  entry: MvumCanonicalRequestEntry,
  signal?: AbortSignal,
): Promise<MvumCanonicalSegment[]> {
  if (signal?.aborted) {
    return Promise.reject(new NavigateMvumCanonicalRequestError(
      'MVUM_DETAIL_CANCELLED',
      'MVUM canonical geometry request was cancelled.',
    ));
  }

  const consumerId = Symbol('mvum-canonical-consumer');
  entry.consumers.add(consumerId);

  return new Promise((resolve, reject) => {
    let finished = false;
    const release = () => {
      entry.consumers.delete(consumerId);
      if (!entry.settled && entry.consumers.size === 0) {
        entry.controller.abort('no_active_consumers');
      }
      signal?.removeEventListener('abort', handleAbort);
    };
    const finish = (callback: () => void) => {
      if (finished) return;
      finished = true;
      release();
      callback();
    };
    const handleAbort = () => finish(() => reject(new NavigateMvumCanonicalRequestError(
      'MVUM_DETAIL_CANCELLED',
      'MVUM canonical geometry request was cancelled.',
    )));

    signal?.addEventListener('abort', handleAbort, { once: true });
    entry.promise.then(
      (segments) => finish(() => resolve(segments)),
      (error) => finish(() => reject(error)),
    );
  });
}

export async function fetchNavigateMvumViewportSegments(args: {
  bbox: RouteGeometryViewportBbox;
  zoom: number;
  limit?: number;
  vehicleClass?: string | null;
  signal?: AbortSignal;
}): Promise<RouteGeometryViewportResult> {
  return fetchRouteGeometryViewportSegments({
    bbox: args.bbox,
    zoom: args.zoom,
    limit: args.limit,
    vehicleClass: args.vehicleClass ?? null,
    includeReferenceGeometry: true,
    sourceProviderPrefix: MVUM_SOURCE_PROVIDER_PREFIX,
    signal: args.signal,
  });
}

export async function fetchNavigateMvumCanonicalSegments(args: {
  segmentIds: readonly string[];
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<MvumCanonicalSegment[]> {
  const segmentIds = Array.from(new Set(args.segmentIds.map((id) => String(id ?? '').trim()).filter(Boolean)));
  if (segmentIds.length === 0) return [];

  const requestKey = canonicalRequestKey(segmentIds);
  const existing = mvumCanonicalRequests.get(requestKey);
  if (existing && !existing.settled && !existing.controller.signal.aborted) {
    return joinCanonicalRequest(existing, args.signal);
  }
  if (existing) mvumCanonicalRequests.delete(requestKey);

  const controller = new AbortController();
  const entry: MvumCanonicalRequestEntry = {
    controller,
    consumers: new Set(),
    settled: false,
    promise: Promise.resolve([]),
  };
  const timeoutMs = Math.max(250, Math.min(args.timeoutMs ?? MVUM_CANONICAL_REQUEST_TIMEOUT_MS, 30_000));
  let timedOut = false;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  entry.promise = (async () => {
    try {
      const providerRequest = supabase.functions.invoke('navigate-mvum-segment-geometry', {
        body: { segmentIds },
        signal: controller.signal,
      });
      const timeoutRequest = new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          timedOut = true;
          controller.abort('timeout');
          reject(new NavigateMvumCanonicalRequestError(
            'MVUM_DETAIL_TIMEOUT',
            'MVUM canonical geometry request timed out.',
          ));
        }, timeoutMs);
      });
      const { data, error } = await Promise.race([providerRequest, timeoutRequest]);

      if (error) {
        throw new NavigateMvumCanonicalRequestError(
          'MVUM_DETAIL_PROVIDER_ERROR',
          'MVUM canonical geometry provider is unavailable.',
        );
      }

      const rawSegments = Array.isArray((data as { segments?: unknown[] } | null)?.segments)
        ? (data as { segments: unknown[] }).segments
        : Array.isArray(data)
          ? data
          : [];
      return rawSegments
        .map(normalizeMvumCanonicalSegment)
        .filter((segment): segment is MvumCanonicalSegment => !!segment);
    } catch (error) {
      if (error instanceof NavigateMvumCanonicalRequestError) throw error;
      if (timedOut) {
        throw new NavigateMvumCanonicalRequestError(
          'MVUM_DETAIL_TIMEOUT',
          'MVUM canonical geometry request timed out.',
        );
      }
      if (controller.signal.aborted) {
        throw new NavigateMvumCanonicalRequestError(
          'MVUM_DETAIL_CANCELLED',
          'MVUM canonical geometry request was cancelled.',
        );
      }
      throw new NavigateMvumCanonicalRequestError(
        'MVUM_DETAIL_PROVIDER_ERROR',
        'MVUM canonical geometry provider is unavailable.',
      );
    } finally {
      if (timeout) clearTimeout(timeout);
      entry.settled = true;
      if (mvumCanonicalRequests.get(requestKey) === entry) {
        mvumCanonicalRequests.delete(requestKey);
      }
    }
  })();
  mvumCanonicalRequests.set(requestKey, entry);
  return joinCanonicalRequest(entry, args.signal);
}
