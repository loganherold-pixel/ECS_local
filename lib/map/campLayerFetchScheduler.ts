export type CampLayerFetchLayer = 'dispersed_camping' | 'established_campgrounds';

export type CampLayerFetchBbox = {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
};

export type CampLayerFetchPlan =
  | {
      type: 'schedule';
      layer: CampLayerFetchLayer;
      bbox: CampLayerFetchBbox;
      cacheKey: string;
      dueAt: number;
    }
  | {
      type: 'skip';
      layer: CampLayerFetchLayer;
      reason:
        | 'layer_disabled'
        | 'offline'
        | 'missing_bbox'
        | 'invalid_bbox'
        | 'bbox_too_small'
        | 'duplicate_pending'
        | 'duplicate_in_flight';
      cacheKey?: string;
    };

export type CampLayerFetchStart = {
  layer: CampLayerFetchLayer;
  bbox: CampLayerFetchBbox;
  cacheKey: string;
  requestId: number;
};

const DEFAULT_DEBOUNCE_MS = 450;
const DEFAULT_BUCKET_DEGREES = 0.01;
const MIN_BBOX_SPAN_DEGREES = 0.001;

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function bucketDown(value: number, bucketDegrees: number): number {
  return Math.floor(value / bucketDegrees) * bucketDegrees;
}

function bucketUp(value: number, bucketDegrees: number): number {
  return Math.ceil(value / bucketDegrees) * bucketDegrees;
}

function roundBucket(value: number): number {
  return Number(value.toFixed(6));
}

export function normalizeCampLayerFetchBbox(
  bbox: CampLayerFetchBbox | null | undefined,
  bucketDegrees = DEFAULT_BUCKET_DEGREES,
): CampLayerFetchBbox | null {
  if (!bbox) return null;
  const { minLng, minLat, maxLng, maxLat } = bbox;
  if (![minLng, minLat, maxLng, maxLat].every(finiteNumber)) return null;

  const west = Math.max(-180, Math.min(minLng, maxLng));
  const east = Math.min(180, Math.max(minLng, maxLng));
  const south = Math.max(-90, Math.min(minLat, maxLat));
  const north = Math.min(90, Math.max(minLat, maxLat));
  if (east <= west || north <= south) return null;
  if (east - west < MIN_BBOX_SPAN_DEGREES || north - south < MIN_BBOX_SPAN_DEGREES) return null;

  const normalized = {
    minLng: Math.max(-180, bucketDown(west, bucketDegrees)),
    minLat: Math.max(-90, bucketDown(south, bucketDegrees)),
    maxLng: Math.min(180, bucketUp(east, bucketDegrees)),
    maxLat: Math.min(90, bucketUp(north, bucketDegrees)),
  };

  if (
    normalized.maxLng <= normalized.minLng ||
    normalized.maxLat <= normalized.minLat ||
    normalized.maxLng - normalized.minLng < MIN_BBOX_SPAN_DEGREES ||
    normalized.maxLat - normalized.minLat < MIN_BBOX_SPAN_DEGREES
  ) {
    return null;
  }

  return {
    minLng: roundBucket(normalized.minLng),
    minLat: roundBucket(normalized.minLat),
    maxLng: roundBucket(normalized.maxLng),
    maxLat: roundBucket(normalized.maxLat),
  };
}

export function buildCampLayerFetchCacheKey(layer: CampLayerFetchLayer, bbox: CampLayerFetchBbox): string {
  return [
    layer,
    bbox.minLng.toFixed(2),
    bbox.minLat.toFixed(2),
    bbox.maxLng.toFixed(2),
    bbox.maxLat.toFixed(2),
  ].join(':');
}

export class CampLayerFetchCoordinator {
  private debounceMs: number;
  private pending: { bbox: CampLayerFetchBbox; cacheKey: string; dueAt: number } | null = null;
  private inFlight: { cacheKey: string; requestId: number } | null = null;
  private sequence = 0;

  constructor(options: { debounceMs?: number } = {}) {
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  }

  plan(args: {
    layer: CampLayerFetchLayer;
    bbox: CampLayerFetchBbox | null | undefined;
    enabled: boolean;
    online: boolean;
    now: number;
  }): CampLayerFetchPlan {
    if (!args.enabled) {
      this.cancel();
      return { type: 'skip', layer: args.layer, reason: 'layer_disabled' };
    }
    if (!args.online) {
      this.cancel();
      return { type: 'skip', layer: args.layer, reason: 'offline' };
    }
    if (!args.bbox) {
      return { type: 'skip', layer: args.layer, reason: 'missing_bbox' };
    }

    const normalized = normalizeCampLayerFetchBbox(args.bbox);
    if (!normalized) {
      const invalidReason =
        [args.bbox.minLng, args.bbox.minLat, args.bbox.maxLng, args.bbox.maxLat].every(finiteNumber)
          ? 'bbox_too_small'
          : 'invalid_bbox';
      return { type: 'skip', layer: args.layer, reason: invalidReason };
    }

    const cacheKey = buildCampLayerFetchCacheKey(args.layer, normalized);
    if (this.pending?.cacheKey === cacheKey) {
      return { type: 'skip', layer: args.layer, reason: 'duplicate_pending', cacheKey };
    }
    if (this.inFlight?.cacheKey === cacheKey) {
      return { type: 'skip', layer: args.layer, reason: 'duplicate_in_flight', cacheKey };
    }
    if (this.inFlight) {
      this.inFlight = null;
      this.sequence += 1;
    }

    this.pending = {
      bbox: normalized,
      cacheKey,
      dueAt: args.now + this.debounceMs,
    };

    return {
      type: 'schedule',
      layer: args.layer,
      bbox: normalized,
      cacheKey,
      dueAt: this.pending.dueAt,
    };
  }

  consumeDue(layer: CampLayerFetchLayer, now: number): CampLayerFetchStart | null {
    if (!this.pending || this.pending.dueAt > now) return null;
    const next = this.pending;
    this.pending = null;
    this.sequence += 1;
    this.inFlight = {
      cacheKey: next.cacheKey,
      requestId: this.sequence,
    };
    return {
      layer,
      bbox: next.bbox,
      cacheKey: next.cacheKey,
      requestId: this.sequence,
    };
  }

  isCurrent(request: Pick<CampLayerFetchStart, 'cacheKey' | 'requestId'>): boolean {
    return this.inFlight?.cacheKey === request.cacheKey && this.inFlight.requestId === request.requestId;
  }

  complete(request: Pick<CampLayerFetchStart, 'cacheKey' | 'requestId'>): boolean {
    if (!this.isCurrent(request)) return false;
    this.inFlight = null;
    return true;
  }

  cancel(): void {
    this.pending = null;
    this.inFlight = null;
    this.sequence += 1;
  }
}
