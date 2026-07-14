import { supabase } from './supabase';
import {
  ROUTE_GEOMETRY_VIEWPORT_DEFAULT_LIMIT,
  ROUTE_GEOMETRY_VIEWPORT_UNAVAILABLE_MESSAGE,
  normalizeRouteGeometryViewportResponse,
  type RouteGeometryViewportBbox,
  type RouteGeometryViewportResult,
} from './routeGeometryViewport';

function createAbortError(): Error {
  const error = new Error('Request canceled');
  error.name = 'AbortError';
  return error;
}

export function isRouteGeometryViewportOverlayFeatureEnabled(): boolean {
  const value =
    typeof process !== 'undefined'
      ? process.env.EXPO_PUBLIC_ECS_ROUTE_GEOMETRY_VIEWPORT_OVERLAY
      : undefined;
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized !== '0' && normalized !== 'false' && normalized !== 'off';
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  return text || null;
}

function routeGeometryViewportErrorText(value: unknown): string | null {
  const record = readRecord(value);
  return cleanText(record?.userMessage ?? record?.message ?? record?.error) ?? cleanText(value);
}

export function friendlyRouteGeometryViewportError(message?: string | null): string {
  const text = String(message ?? '').trim();
  if (!text) return ROUTE_GEOMETRY_VIEWPORT_UNAVAILABLE_MESSAGE;
  const lower = text.toLowerCase();
  if (
    lower.includes('non-2xx') ||
    lower.includes('edge function') ||
    lower.includes('functionsfetcherror') ||
    lower.includes('failed to fetch') ||
    lower.includes('supabase not configured')
  ) {
    return ROUTE_GEOMETRY_VIEWPORT_UNAVAILABLE_MESSAGE;
  }
  return text;
}

async function readRouteGeometryViewportErrorBody(error: unknown, response?: unknown): Promise<unknown> {
  const explicitResponse = response as Response | undefined;
  const errorContext = (error as { context?: Response } | null)?.context;
  const source = explicitResponse ?? errorContext;
  if (!source || typeof source !== 'object' || typeof (source as Response).clone !== 'function') {
    return null;
  }

  try {
    return await (source as Response).clone().json();
  } catch {
    try {
      const text = await (source as Response).clone().text();
      return text ? JSON.parse(text) : null;
    } catch {
      return null;
    }
  }
}

export async function fetchRouteGeometryViewportSegments(args: {
  bbox: RouteGeometryViewportBbox;
  zoom: number;
  limit?: number;
  vehicleClass?: string | null;
  includeReferenceGeometry?: boolean;
  signal?: AbortSignal;
}): Promise<RouteGeometryViewportResult> {
  if (args.signal?.aborted) throw createAbortError();
  let result;
  try {
    result = await supabase.functions.invoke('route-geometry-segments', {
      body: {
        bbox: args.bbox,
        zoom: args.zoom,
        limit: args.limit ?? ROUTE_GEOMETRY_VIEWPORT_DEFAULT_LIMIT,
        vehicleClass: args.vehicleClass ?? null,
        includeReferenceGeometry: args.includeReferenceGeometry !== false,
      },
    });
    if (args.signal?.aborted) throw createAbortError();
  } catch (invokeError) {
    throw new Error(
      friendlyRouteGeometryViewportError(
        invokeError instanceof Error ? invokeError.message : String(invokeError),
      ),
    );
  }

  const { data, error, response } = result as {
    data: unknown;
    error: { message?: string } | null;
    response?: Response;
  };

  if (error) {
    const errorBody = data ?? await readRouteGeometryViewportErrorBody(error, response);
    const normalized = normalizeRouteGeometryViewportResponse(errorBody);
    if (normalized.degraded || normalized.userMessage || normalized.unavailableReason) {
      return normalized;
    }
    throw new Error(friendlyRouteGeometryViewportError(routeGeometryViewportErrorText(errorBody) ?? error.message));
  }

  return normalizeRouteGeometryViewportResponse(data);
}
