import type { CampLayerFetchFailureDiagnostic } from './campLayerFetchDiagnostics';

export namespace GeoJSON {
  export type Position = [number, number] | [number, number, number];
  export type Polygon = {
    type: 'Polygon';
    coordinates: Position[][];
  };
  export type MultiPolygon = {
    type: 'MultiPolygon';
    coordinates: Position[][][];
  };
  export type Feature<TGeometry = Polygon | MultiPolygon, TProperties = Record<string, unknown>> = {
    type: 'Feature';
    id?: string | number;
    geometry: TGeometry;
    properties: TProperties;
  };
  export type FeatureCollection<
    TGeometry = Polygon | MultiPolygon,
    TProperties = Record<string, unknown>,
  > = {
    type: 'FeatureCollection';
    features: Feature<TGeometry, TProperties>[];
  };
}

export type CampLayerUiStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

export type DispersedCampingConfidence = 'high' | 'medium' | 'verify' | 'restricted';

export type DispersedCampingLandManager =
  | 'BLM'
  | 'USFS'
  | 'NPS'
  | 'STATE'
  | 'PRIVATE'
  | 'TRIBAL'
  | 'MILITARY'
  | 'LOCAL'
  | 'UNKNOWN';

export type DispersedCampingRegion = {
  id: string;
  name?: string;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  landManager: DispersedCampingLandManager;
  confidence: DispersedCampingConfidence;
  eligibilityLabel: string;
  basis: string[];
  restrictions: string[];
  sourceNames: string[];
  source?: string;
  sourceProvider?: string;
  sourceUpdatedAt?: string;
  requiresVerification: boolean;
  permitRequired?: boolean;
  fireRestrictionKnown?: boolean;
  seasonalAccessKnown?: boolean;
  closureKnown?: boolean;
};

export type DispersedCampingEligibilityConfidence = DispersedCampingConfidence;

export type DispersedCampingEligibilityLandManager = DispersedCampingLandManager;

export type DispersedCampingEligibilityProperties = {
  id: string;
  name?: string;
  confidence: DispersedCampingConfidence;
  landManager: DispersedCampingLandManager;
  eligibilityLabel: 'Likely eligible' | 'Verify locally' | 'Restricted / unavailable';
  basis: string[];
  restrictions: string[];
  sourceNames: string[];
  source?: string;
  sourceProvider?: string;
  sourceUpdatedAt?: string;
  requiresVerification: boolean;
  permitRequired?: boolean;
  fireRestrictionKnown?: boolean;
  seasonalAccessKnown?: boolean;
  closureKnown?: boolean;
  routeNearby?: boolean;
  distanceFromRouteMiles?: number;
  routeCorridorMiles?: number;
};

export type DispersedCampingEligibilityFeature = GeoJSON.Feature<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  DispersedCampingEligibilityProperties
> & { id: string };

export type DispersedCampingEligibilityFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  DispersedCampingEligibilityProperties
>;

export type DispersedCampingRegionSelectionPayload = {
  regionId: string;
  name?: string;
  landManager: string;
  confidence: string;
  eligibilityLabel: string;
  basis: string[];
  restrictions: string[];
  sourceNames: string[];
  source?: string;
  sourceProvider?: string;
  sourceUpdatedAt?: string;
  requiresVerification: boolean;
};

export type DispersedCampingEligibilityLayerState = {
  enabled: boolean;
  status?: CampLayerUiStatus;
  errorMessage?: string;
  diagnostic?: CampLayerFetchFailureDiagnostic;
  featureCount?: number;
  lastAttemptedBbox?: {
    minLng: number;
    minLat: number;
    maxLng: number;
    maxLat: number;
  };
  lastAttemptedCacheKey?: string;
  lastSuccessfulBbox?: {
    minLng: number;
    minLat: number;
    maxLng: number;
    maxLat: number;
  };
  lastSuccessfulCacheKey?: string;
  geojson?: DispersedCampingEligibilityFeatureCollection;
};

export function isDispersedCampingEligibilityLayerAvailable(): boolean {
  const envValue =
    typeof process !== 'undefined'
      ? process.env.EXPO_PUBLIC_ECS_DISPERSED_CAMPING_LAYER
      : undefined;
  return (
    envValue === 'true' ||
    envValue === '1' ||
    (typeof __DEV__ !== 'undefined' && __DEV__ === true)
  );
}
