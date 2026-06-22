import { supabase } from './supabase';
import {
  queryRouteCatalogViewportRecords,
  type RouteCatalogViewportQuery,
  type RouteCatalogViewportResult,
} from './routeCatalogViewport';
import {
  buildNavigateRouteCatalogQueryDiagnostic,
  logRouteCatalogVisibilityDiagnostic,
} from './routeCatalogVisibilityDiagnostics';

type RouteCatalogViewportClient = {
  functions: {
    invoke: (
      name: string,
      options: { body: RouteCatalogViewportSearchBody },
    ) => Promise<{ data: unknown; error?: { message?: string } | null }>;
  };
};

export type RouteCatalogViewportSearchBody = {
  latitude: number;
  longitude: number;
  radiusMiles: number;
  limit: number;
  includeGeometry: true;
  includePreviewGeometry: true;
  includeAssessment: true;
  recommendationOnly: false;
  locationSource: 'navigate_ecs_route_geometry_viewport';
};

function readRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readRecords(value: unknown): unknown[] {
  const record = readRecord(value);
  if (Array.isArray(record?.records)) return record.records;
  if (Array.isArray(record?.routes)) return record.routes;
  if (Array.isArray(value)) return value;
  return [];
}

export function buildRouteCatalogViewportSearchBody(
  query: RouteCatalogViewportQuery,
): RouteCatalogViewportSearchBody {
  return {
    latitude: query.center.latitude,
    longitude: query.center.longitude,
    radiusMiles: query.radiusMiles,
    limit: query.limit,
    includeGeometry: true,
    includePreviewGeometry: true,
    includeAssessment: true,
    recommendationOnly: false,
    locationSource: 'navigate_ecs_route_geometry_viewport',
  };
}

export async function fetchRouteCatalogViewportFeatures(
  query: RouteCatalogViewportQuery,
  options: { client?: RouteCatalogViewportClient } = {},
): Promise<RouteCatalogViewportResult> {
  const client = options.client ?? (supabase as unknown as RouteCatalogViewportClient);
  const body = buildRouteCatalogViewportSearchBody(query);
  const { data, error } = await client.functions.invoke('route-catalog-search', { body });
  if (error) {
    throw new Error(error.message || 'ECS route catalog is unavailable.');
  }
  const records = readRecords(data);
  const result = queryRouteCatalogViewportRecords(records, query);
  logRouteCatalogVisibilityDiagnostic(
    'navigate_viewport',
    buildNavigateRouteCatalogQueryDiagnostic(records, query) as unknown as Record<string, unknown>,
    {
      fingerprint: query.cacheKey,
    },
  );
  return result;
}
