type CampLayerFetchDiagnosticsBbox = {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
};

type CampLayerFetchFailureOptions = {
  layer: 'dispersed_camping' | 'established_campgrounds';
  bbox: CampLayerFetchDiagnosticsBbox | null;
  cacheKey: string;
  method: 'POST';
  endpoint: string;
  status?: number | null;
  statusText?: string | null;
  supabaseError?: unknown;
  response?: unknown;
};

export type CampLayerFetchFailureDiagnostic = {
  layer: 'dispersed_camping' | 'established_campgrounds';
  endpoint: string;
  method: 'POST';
  status: number | null;
  statusText: string | null;
  errorName: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

type ResponseShapeSummary = {
  isFeatureCollection: boolean;
  featureCount: number | null;
  topLevelKeys: string[];
};

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeBboxForLog(bbox: CampLayerFetchDiagnosticsBbox | null): CampLayerFetchDiagnosticsBbox | null {
  if (!bbox) return null;
  return {
    minLng: Number(bbox.minLng.toFixed(6)),
    minLat: Number(bbox.minLat.toFixed(6)),
    maxLng: Number(bbox.maxLng.toFixed(6)),
    maxLat: Number(bbox.maxLat.toFixed(6)),
  };
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function summarizeCampLayerFetchResponseShape(response: unknown): ResponseShapeSummary {
  const record = toRecord(response);
  const topLevelKeys = record ? Object.keys(record).sort() : [];
  const geojson = toRecord(record?.geojson) ?? record;
  const features = Array.isArray(geojson?.features) ? geojson.features : null;
  const isFeatureCollection = geojson?.type === 'FeatureCollection' && !!features;

  return {
    isFeatureCollection,
    featureCount: isFeatureCollection ? features.length : null,
    topLevelKeys,
  };
}

function summarizeSupabaseError(error: unknown) {
  const record = toRecord(error);
  if (!record) {
    return {
      name: null,
      message: typeof error === 'string' ? error : null,
      code: null,
      status: null,
    };
  }

  const context = toRecord(record.context);
  return {
    name: typeof record.name === 'string' ? record.name : null,
    message: typeof record.message === 'string' ? record.message : null,
    code:
      typeof record.code === 'string'
        ? record.code
        : typeof context?.code === 'string'
          ? context.code
          : null,
    status: numberOrNull(context?.status),
  };
}

export function buildCampLayerFetchFailureDiagnostic({
  layer,
  method,
  endpoint,
  status,
  statusText,
  supabaseError,
}: Omit<CampLayerFetchFailureOptions, 'bbox' | 'cacheKey' | 'response'>): CampLayerFetchFailureDiagnostic {
  const errorSummary = summarizeSupabaseError(supabaseError);
  return {
    layer,
    endpoint,
    method,
    status: numberOrNull(status) ?? errorSummary.status,
    statusText: typeof statusText === 'string' ? statusText : null,
    errorName: errorSummary.name,
    errorCode: errorSummary.code,
    errorMessage: errorSummary.message,
  };
}

export function logCampLayerFetchFailure({
  layer,
  bbox,
  cacheKey,
  method,
  endpoint,
  status,
  statusText,
  supabaseError,
  response,
}: CampLayerFetchFailureOptions): void {
  const errorSummary = summarizeSupabaseError(supabaseError);

  console.warn('[CAMP_LAYER_FETCH_FAILURE]', {
    layer,
    bbox: normalizeBboxForLog(bbox),
    cacheKey,
    method,
    endpoint,
    status: numberOrNull(status) ?? errorSummary.status,
    statusText: typeof statusText === 'string' ? statusText : null,
    supabaseError: errorSummary,
    responseShape: summarizeCampLayerFetchResponseShape(response),
  });
}
