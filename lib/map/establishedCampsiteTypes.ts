import type { CampLayerFetchFailureDiagnostic } from './campLayerFetchDiagnostics';

export type EstablishedCampsiteSource =
  | 'RECREATION_GOV'
  | 'NPS'
  | 'OSM'
  | 'STATE'
  | 'COUNTY'
  | 'PRIVATE'
  | 'UNKNOWN';

export type EstablishedCampsiteType =
  | 'campground'
  | 'rv_park'
  | 'tent_site'
  | 'group_site'
  | 'cabin'
  | 'primitive_developed'
  | 'unknown';

export type EstablishedCampsiteFeeStatus = 'paid' | 'free' | 'unknown';

export type EstablishedCampsiteReservationStatus =
  | 'reservable'
  | 'first_come'
  | 'mixed'
  | 'required'
  | 'unknown';

export type EstablishedCampsiteAmenity =
  | 'water'
  | 'toilets'
  | 'showers'
  | 'hookups'
  | 'dump_station'
  | 'picnic_table'
  | 'fire_ring'
  | 'trash'
  | 'camp_host'
  | 'store'
  | 'cell_service'
  | 'unknown';

export type EstablishedCampsite = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  type?: 'established_campground';
  category?: 'campground';
  campsiteType: EstablishedCampsiteType;
  source: EstablishedCampsiteSource;
  feeStatus: EstablishedCampsiteFeeStatus;
  reservationStatus: EstablishedCampsiteReservationStatus;
  amenities: EstablishedCampsiteAmenity[];
  managingAgency?: string | null;
  managingOrg?: string | null;
  reservationUrl?: string | null;
  detailUrl?: string | null;
  status?: string | null;
  availabilityStatus?: string | null;
  siteCount?: number | null;
  siteTypes?: string[] | null;
  sourceConfidence?: number | null;
  primaryProvider?: string | null;
  attribution?: string | null;
  lastSyncedAt?: string | null;
  lastAvailabilityCheckedAt?: string | null;
  lastVerifiedAt?: string | null;
  operatorName?: string;
  bookingUrl?: string;
  phone?: string;
  seasonDescription?: string;
  openingHours?: string;
  maxVehicleLengthFt?: number;
  tentAllowed?: boolean;
  rvAllowed?: boolean;
  trailersAllowed?: boolean;
  sourceUpdatedAt?: string;
  nearbyCampgroundCount?: number;
  nearbyCampgroundIds?: string[];
  nearbyCampgroundNames?: string[];
  liveDetailFetchedAt?: string;
  sourceRecordCount?: number;
  availabilityRecordCount?: number;
  requiresVerification: true;
};

export type EstablishedCampsiteProperties = Omit<EstablishedCampsite, 'latitude' | 'longitude'>;

export type EstablishedCampsiteFeature = {
  type: 'Feature';
  id: string;
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: EstablishedCampsiteProperties;
};

export type EstablishedCampsiteFeatureCollection = {
  type: 'FeatureCollection';
  features: EstablishedCampsiteFeature[];
};

export type CampLayerUiStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'zoom';

export type EstablishedCampsiteLayerState = {
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
  geojson?: EstablishedCampsiteFeatureCollection;
};

export type EstablishedCampsiteSelectionPayload = EstablishedCampsite;

export function isEstablishedCampsitesLayerAvailable(): boolean {
  const envValue =
    typeof process !== 'undefined'
      ? process.env.EXPO_PUBLIC_ECS_ESTABLISHED_CAMPSITES_LAYER
      : undefined;
  return (
    envValue === 'true' ||
    envValue === '1' ||
    (typeof __DEV__ !== 'undefined' && __DEV__ === true)
  );
}
