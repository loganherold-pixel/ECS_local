import { supabase } from '../supabase';
import {
  DISPERSED_CAMPING_EDGE_FUNCTION,
  buildDispersedCampingCacheKey,
  buildDispersedCampingSearchRequest,
  friendlyDispersedCampingError,
  normalizeDispersedCampingSearchBbox,
  normalizeDispersedCampingSearchResponse,
  type DispersedCampingSearchBbox,
  type DispersedCampingSearchResponse,
} from './dispersedCampingMobile';
import {
  buildCampLayerFetchFailureDiagnostic,
  logCampLayerFetchFailure,
} from './campLayerFetchDiagnostics';

export type FetchDispersedCampingEligibilityOptions = {
  bbox: DispersedCampingSearchBbox;
};

function getInvokeStatus(result: unknown): { status: number | null; statusText: string | null } {
  if (!result || typeof result !== 'object') return { status: null, statusText: null };
  const record = result as { status?: unknown; statusText?: unknown };
  return {
    status: typeof record.status === 'number' ? record.status : null,
    statusText: typeof record.statusText === 'string' ? record.statusText : null,
  };
}

export async function fetchDispersedCampingEligibilityForMap({
  bbox,
}: FetchDispersedCampingEligibilityOptions): Promise<DispersedCampingSearchResponse> {
  const body = buildDispersedCampingSearchRequest(bbox);
  const normalizedBbox = normalizeDispersedCampingSearchBbox(bbox);
  const cacheKey = buildDispersedCampingCacheKey(bbox);
  let result;
  try {
    result = await supabase.functions.invoke(DISPERSED_CAMPING_EDGE_FUNCTION, { body });
  } catch (invokeError) {
    const diagnostic = buildCampLayerFetchFailureDiagnostic({
      layer: 'dispersed_camping',
      method: 'POST',
      endpoint: DISPERSED_CAMPING_EDGE_FUNCTION,
      supabaseError: invokeError,
    });
    logCampLayerFetchFailure({
      layer: 'dispersed_camping',
      bbox: normalizedBbox,
      cacheKey,
      method: 'POST',
      endpoint: DISPERSED_CAMPING_EDGE_FUNCTION,
      supabaseError: invokeError,
    });
    return {
      ok: false,
      error: friendlyDispersedCampingError(invokeError instanceof Error ? invokeError.message : String(invokeError)),
      diagnostic,
      regions: [],
      count: 0,
    };
  }
  const { data, error } = result;
  const invokeStatus = getInvokeStatus(result);

  if (error) {
    const diagnostic = buildCampLayerFetchFailureDiagnostic({
      layer: 'dispersed_camping',
      method: 'POST',
      endpoint: DISPERSED_CAMPING_EDGE_FUNCTION,
      status: invokeStatus.status,
      statusText: invokeStatus.statusText,
      supabaseError: error,
    });
    logCampLayerFetchFailure({
      layer: 'dispersed_camping',
      bbox: normalizedBbox,
      cacheKey,
      method: 'POST',
      endpoint: DISPERSED_CAMPING_EDGE_FUNCTION,
      status: invokeStatus.status,
      statusText: invokeStatus.statusText,
      supabaseError: error,
      response: data,
    });
    return {
      ok: false,
      error: friendlyDispersedCampingError(error.message),
      diagnostic,
      regions: [],
      geojson: undefined,
      count: 0,
    };
  }

  const response = normalizeDispersedCampingSearchResponse(data);
  if (!response.ok) {
    const diagnostic = buildCampLayerFetchFailureDiagnostic({
      layer: 'dispersed_camping',
      method: 'POST',
      endpoint: DISPERSED_CAMPING_EDGE_FUNCTION,
      status: invokeStatus.status,
      statusText: invokeStatus.statusText,
      supabaseError: { message: response.error, name: 'MalformedResponse' },
    });
    logCampLayerFetchFailure({
      layer: 'dispersed_camping',
      bbox: normalizedBbox,
      cacheKey,
      method: 'POST',
      endpoint: DISPERSED_CAMPING_EDGE_FUNCTION,
      status: invokeStatus.status,
      statusText: invokeStatus.statusText,
      response,
    });
    return {
      ok: false,
      error: friendlyDispersedCampingError(response.error),
      diagnostic,
      regions: [],
      geojson: undefined,
      count: 0,
    };
  }

  return response;
}
