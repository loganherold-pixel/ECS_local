import { supabase } from '../supabase';
import {
  ESTABLISHED_CAMPGROUNDS_EDGE_FUNCTION,
  buildEstablishedCampgroundsCacheKey,
  buildEstablishedCampgroundsSearchRequest,
  friendlyEstablishedCampgroundError,
  normalizeEstablishedCampgroundsSearchResponse,
  type EstablishedCampgroundSearchBbox,
  type EstablishedCampgroundsSearchResponse,
} from './establishedCampgroundMobile';
import {
  buildCampLayerFetchFailureDiagnostic,
  logCampLayerFetchFailure,
} from './campLayerFetchDiagnostics';

export type FetchEstablishedCampgroundsOptions = {
  bbox: EstablishedCampgroundSearchBbox;
  routeId?: string | null;
};

function getInvokeStatus(result: unknown): { status: number | null; statusText: string | null } {
  if (!result || typeof result !== 'object') return { status: null, statusText: null };
  const record = result as { status?: unknown; statusText?: unknown };
  return {
    status: typeof record.status === 'number' ? record.status : null,
    statusText: typeof record.statusText === 'string' ? record.statusText : null,
  };
}

export async function fetchEstablishedCampgroundsForMap({
  bbox,
  routeId,
}: FetchEstablishedCampgroundsOptions): Promise<EstablishedCampgroundsSearchResponse> {
  const body = buildEstablishedCampgroundsSearchRequest(bbox, routeId);
  const cacheKey = buildEstablishedCampgroundsCacheKey(bbox, routeId);
  let result;
  try {
    result = await supabase.functions.invoke(ESTABLISHED_CAMPGROUNDS_EDGE_FUNCTION, { body });
  } catch (invokeError) {
    const diagnostic = buildCampLayerFetchFailureDiagnostic({
      layer: 'established_campgrounds',
      method: 'POST',
      endpoint: ESTABLISHED_CAMPGROUNDS_EDGE_FUNCTION,
      supabaseError: invokeError,
    });
    logCampLayerFetchFailure({
      layer: 'established_campgrounds',
      bbox,
      cacheKey,
      method: 'POST',
      endpoint: ESTABLISHED_CAMPGROUNDS_EDGE_FUNCTION,
      supabaseError: invokeError,
    });
    return {
      ok: false,
      error: friendlyEstablishedCampgroundError(invokeError instanceof Error ? invokeError.message : String(invokeError)),
      diagnostic,
      records: [],
      count: 0,
    };
  }
  const { data, error } = result;
  const invokeStatus = getInvokeStatus(result);

  if (error) {
    const diagnostic = buildCampLayerFetchFailureDiagnostic({
      layer: 'established_campgrounds',
      method: 'POST',
      endpoint: ESTABLISHED_CAMPGROUNDS_EDGE_FUNCTION,
      status: invokeStatus.status,
      statusText: invokeStatus.statusText,
      supabaseError: error,
    });
    logCampLayerFetchFailure({
      layer: 'established_campgrounds',
      bbox,
      cacheKey,
      method: 'POST',
      endpoint: ESTABLISHED_CAMPGROUNDS_EDGE_FUNCTION,
      status: invokeStatus.status,
      statusText: invokeStatus.statusText,
      supabaseError: error,
      response: data,
    });
    return {
      ok: false,
      error: friendlyEstablishedCampgroundError(error.message),
      diagnostic,
      records: [],
      count: 0,
    };
  }

  const response = normalizeEstablishedCampgroundsSearchResponse(data);
  if (!response.ok) {
    const diagnostic = buildCampLayerFetchFailureDiagnostic({
      layer: 'established_campgrounds',
      method: 'POST',
      endpoint: ESTABLISHED_CAMPGROUNDS_EDGE_FUNCTION,
      status: invokeStatus.status,
      statusText: invokeStatus.statusText,
      supabaseError: { message: response.error, name: 'MalformedResponse' },
    });
    logCampLayerFetchFailure({
      layer: 'established_campgrounds',
      bbox,
      cacheKey,
      method: 'POST',
      endpoint: ESTABLISHED_CAMPGROUNDS_EDGE_FUNCTION,
      status: invokeStatus.status,
      statusText: invokeStatus.statusText,
      response,
    });
    return {
      ok: false,
      error: friendlyEstablishedCampgroundError(response.error),
      diagnostic,
      records: [],
      count: 0,
    };
  }

  return response;
}
