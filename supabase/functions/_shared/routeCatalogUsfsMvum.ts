export type UsfsMvumForest = {
  slug: string;
  forestName: string;
  sourceProviderId: string;
  sourceName: string;
  sourceUri: string;
  currentConditionProviderId: string;
  currentConditionSourceName: string;
  currentConditionSourceUri: string;
  currentConditionReferenceUri: string;
};

export type UsfsMvumLayer = {
  kind: 'road' | 'trail';
  sourceLayer: string;
  url: string;
  statusField: 'ROUTESTATU' | 'TRAILSTATU';
  namePrefix: 'FR' | 'Trail';
};

export type UsfsMvumArcGisFeature = {
  attributes?: Record<string, unknown>;
  geometry?: {
    paths?: unknown;
  };
};

export type UsfsMvumRouteContext = {
  forest: UsfsMvumForest;
  layer: UsfsMvumLayer;
  sourceId: string;
  sourceLastVerifiedAt: string;
  ingestRunId?: string | null;
  minMiles?: number;
  publicRecommendation?: boolean;
};

export type UsfsMvumClosureStatus = 'active' | 'scheduled' | 'expired' | 'unknown';
export type UsfsMvumClosureType =
  | 'seasonal'
  | 'emergency'
  | 'fire'
  | 'flood'
  | 'maintenance'
  | 'land_manager'
  | 'permanent'
  | 'unknown';

export type UsfsMvumCurrentConditionClosure = {
  id?: string;
  title: string;
  summary?: string;
  sourceUrl?: string;
  forestOrder?: string;
  status: UsfsMvumClosureStatus;
  closureType: UsfsMvumClosureType;
  startsAt?: string | null;
  endsAt?: string | null;
  lastVerifiedAt?: string;
  confidenceScore?: number;
  routePublicIds: string[];
  segmentPublicIds: string[];
  providerFeatureIds: string[];
  routeIds: string[];
  routeIdentityPatterns: string[];
};

export type UsfsMvumCurrentConditionSource = {
  forestSlug: string;
  forestName: string;
  providerId: string;
  label: string;
  sourceUrl: string;
  referenceUrl: string;
  checkedAt: string;
  staleAt: string;
  closures: UsfsMvumCurrentConditionClosure[];
};

export type UsfsMvumRouteUpsert = NonNullable<ReturnType<typeof arcGisFeatureToVerifiedRouteUpsert>>;

export type UsfsMvumAggregateRouteUpsert = {
  verifiedRoute: Record<string, unknown>;
  verifiedRouteSource: Record<string, unknown>;
  segmentPublicIds: string[];
  segmentProviderFeatureIds: string[];
};

export type UsfsMvumActiveGuidanceStatus = 'ready' | 'preview_only' | 'unavailable';

export type UsfsMvumTopologyAssessment = {
  status: UsfsMvumActiveGuidanceStatus;
  topologyResolved: boolean;
  sourceSegmentCount: number;
  componentCount: number;
  branchDetected: boolean;
  joinedSegmentGapCount: number;
  disjointSegmentGapCount: number;
  maxJoinGapMeters: number | null;
  maxSegmentGapMeters: number | null;
  unavailableReason: string | null;
};

export const USFS_MVUM_PILOT_FORESTS: UsfsMvumForest[] = [
  {
    slug: 'tahoe-national-forest',
    forestName: 'Tahoe National Forest',
    sourceProviderId: 'usfs_mvum_tahoe_nf',
    sourceName: 'USFS MVUM - Tahoe National Forest',
    sourceUri: 'https://www.fs.usda.gov/detail/tahoe/maps-pubs/?cid=fseprd638275',
    currentConditionProviderId: 'usfs_current_conditions_tahoe_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Tahoe National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r05/tahoe/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r05/tahoe/conditions',
  },
  {
    slug: 'mendocino-national-forest',
    forestName: 'Mendocino National Forest',
    sourceProviderId: 'usfs_mvum_mendocino_nf',
    sourceName: 'USFS MVUM - Mendocino National Forest',
    sourceUri: 'https://www.fs.usda.gov/detail/mendocino/maps-pubs/?cid=stelprdb5142646',
    currentConditionProviderId: 'usfs_current_conditions_mendocino_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Mendocino National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r05/mendocino/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r05/mendocino/conditions',
  },
  {
    slug: 'san-juan-national-forest',
    forestName: 'San Juan National Forest',
    sourceProviderId: 'usfs_mvum_san_juan_nf',
    sourceName: 'USFS MVUM - San Juan National Forest',
    sourceUri: 'https://www.fs.usda.gov/r02/sanjuan/maps-guides/motor-vehicle-use-maps',
    currentConditionProviderId: 'usfs_current_conditions_san_juan_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - San Juan National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r02/sanjuan/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r02/sanjuan/conditions',
  },
  {
    slug: 'coconino-national-forest',
    forestName: 'Coconino National Forest',
    sourceProviderId: 'usfs_mvum_coconino_nf',
    sourceName: 'USFS MVUM - Coconino National Forest',
    sourceUri: 'https://www.fs.usda.gov/r03/coconino/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_coconino_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Coconino National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r03/coconino/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r03/coconino/conditions',
  },
  {
    slug: 'manti-la-sal-national-forest',
    forestName: 'Manti-La Sal National Forest',
    sourceProviderId: 'usfs_mvum_manti_la_sal_nf',
    sourceName: 'USFS MVUM - Manti-La Sal National Forest',
    sourceUri: 'https://www.fs.usda.gov/r04/manti-lasal/data-tools/interactive-maps/motorized-vehicle-use-maps-mvum',
    currentConditionProviderId: 'usfs_current_conditions_manti_la_sal_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Manti-La Sal National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r04/manti-lasal/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r04/manti-lasal/conditions',
  },
  {
    slug: 'sawtooth-national-forest',
    forestName: 'Sawtooth National Forest',
    sourceProviderId: 'usfs_mvum_sawtooth_nf',
    sourceName: 'USFS MVUM - Sawtooth National Forest',
    sourceUri: 'https://www.fs.usda.gov/r04/sawtooth/data-tools/interactive-maps',
    currentConditionProviderId: 'usfs_current_conditions_sawtooth_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Sawtooth National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r04/sawtooth/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r04/sawtooth/conditions',
  },
  {
    slug: 'deschutes-national-forest',
    forestName: 'Deschutes National Forest',
    sourceProviderId: 'usfs_mvum_deschutes_nf',
    sourceName: 'USFS MVUM - Deschutes National Forest',
    sourceUri: 'https://www.fs.usda.gov/r06/deschutes/maps-guides/motor-vehicle-use-maps-mvum',
    currentConditionProviderId: 'usfs_current_conditions_deschutes_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Deschutes National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r06/deschutes/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r06/deschutes/conditions',
  },
  {
    slug: 'kaibab-national-forest',
    forestName: 'Kaibab National Forest',
    sourceProviderId: 'usfs_mvum_kaibab_nf',
    sourceName: 'USFS MVUM - Kaibab National Forest',
    sourceUri: 'https://www.fs.usda.gov/r03/kaibab/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_kaibab_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Kaibab National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r03/kaibab/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r03/kaibab/conditions',
  },
  {
    slug: 'prescott-national-forest',
    forestName: 'Prescott National Forest',
    sourceProviderId: 'usfs_mvum_prescott_nf',
    sourceName: 'USFS MVUM - Prescott National Forest',
    sourceUri: 'https://www.fs.usda.gov/r03/prescott/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_prescott_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Prescott National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r03/prescott/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r03/prescott/alerts',
  },
  {
    slug: 'gila-national-forest',
    forestName: 'Gila National Forest',
    sourceProviderId: 'usfs_mvum_gila_nf',
    sourceName: 'USFS MVUM - Gila National Forest',
    sourceUri: 'https://www.fs.usda.gov/r03/gila/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_gila_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Gila National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r03/gila/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r03/gila/conditions',
  },
  {
    slug: 'santa-fe-national-forest',
    forestName: 'Santa Fe National Forest',
    sourceProviderId: 'usfs_mvum_santa_fe_nf',
    sourceName: 'USFS MVUM - Santa Fe National Forest',
    sourceUri: 'https://www.fs.usda.gov/r03/santafe/maps-guides/santa-fe-national-forest-motor-vehicle-use-maps',
    currentConditionProviderId: 'usfs_current_conditions_santa_fe_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Santa Fe National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r03/santafe/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r03/santafe/conditions',
  },
  {
    slug: 'carson-national-forest',
    forestName: 'Carson National Forest',
    sourceProviderId: 'usfs_mvum_carson_nf',
    sourceName: 'USFS MVUM - Carson National Forest',
    sourceUri: 'https://www.fs.usda.gov/r03/carson/maps-guides/motor-vehicle-use-maps',
    currentConditionProviderId: 'usfs_current_conditions_carson_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Carson National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r03/carson/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r03/carson/conditions',
  },
  {
    slug: 'rio-grande-national-forest',
    forestName: 'Rio Grande National Forest',
    sourceProviderId: 'usfs_mvum_rio_grande_nf',
    sourceName: 'USFS MVUM - Rio Grande National Forest',
    sourceUri: 'https://www.fs.usda.gov/r02/riogrande/maps-guides/motor-vehicle-use-maps',
    currentConditionProviderId: 'usfs_current_conditions_rio_grande_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Rio Grande National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r02/riogrande/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r02/riogrande/conditions',
  },
  {
    slug: 'grand-mesa-uncompahgre-gunnison-national-forests',
    forestName: 'Grand Mesa, Uncompahgre and Gunnison National Forests',
    sourceProviderId: 'usfs_mvum_gmug_nf',
    sourceName: 'USFS MVUM - Grand Mesa, Uncompahgre and Gunnison National Forests',
    sourceUri: 'https://www.fs.usda.gov/r02/gmug/maps-guides/motor-vehicle-use-maps',
    currentConditionProviderId: 'usfs_current_conditions_gmug_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Grand Mesa, Uncompahgre and Gunnison National Forests',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r02/gmug/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r02/gmug/conditions',
  },
  {
    slug: 'humboldt-toiyabe-national-forest',
    forestName: 'Humboldt-Toiyabe National Forest',
    sourceProviderId: 'usfs_mvum_humboldt_toiyabe_nf',
    sourceName: 'USFS MVUM - Humboldt-Toiyabe National Forest',
    sourceUri: 'https://www.fs.usda.gov/r04/humboldt-toiyabe/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_humboldt_toiyabe_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Humboldt-Toiyabe National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r04/humboldt-toiyabe/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r04/humboldt-toiyabe/conditions',
  },
  {
    slug: 'pike-san-isabel-national-forests',
    forestName: 'Pike and San Isabel National Forests',
    sourceProviderId: 'usfs_mvum_pike_san_isabel_nf',
    sourceName: 'USFS MVUM - Pike and San Isabel National Forests',
    sourceUri: 'https://www.fs.usda.gov/r02/psicc/maps-guides/motor-vehicle-use-maps',
    currentConditionProviderId: 'usfs_current_conditions_pike_san_isabel_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Pike and San Isabel National Forests',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r02/psicc/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r02/psicc/conditions',
  },
  {
    slug: 'inyo-national-forest',
    forestName: 'Inyo National Forest',
    sourceProviderId: 'usfs_mvum_inyo_nf',
    sourceName: 'USFS MVUM - Inyo National Forest',
    sourceUri: 'https://www.fs.usda.gov/r05/inyo/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_inyo_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Inyo National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r05/inyo/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r05/inyo/conditions',
  },
  {
    slug: 'plumas-national-forest',
    forestName: 'Plumas National Forest',
    sourceProviderId: 'usfs_mvum_plumas_nf',
    sourceName: 'USFS MVUM - Plumas National Forest',
    sourceUri: 'https://www.fs.usda.gov/r05/plumas/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_plumas_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Plumas National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r05/plumas/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r05/plumas/conditions',
  },
  {
    slug: 'lassen-national-forest',
    forestName: 'Lassen National Forest',
    sourceProviderId: 'usfs_mvum_lassen_nf',
    sourceName: 'USFS MVUM - Lassen National Forest',
    sourceUri: 'https://www.fs.usda.gov/r05/lassen/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_lassen_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Lassen National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r05/lassen/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r05/lassen/conditions',
  },
  {
    slug: 'shasta-trinity-national-forest',
    forestName: 'Shasta-Trinity National Forest',
    sourceProviderId: 'usfs_mvum_shasta_trinity_nf',
    sourceName: 'USFS MVUM - Shasta-Trinity National Forest',
    sourceUri: 'https://www.fs.usda.gov/r05/shasta-trinity/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_shasta_trinity_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Shasta-Trinity National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r05/shasta-trinity/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r05/shasta-trinity/conditions',
  },
  {
    slug: 'umpqua-national-forest',
    forestName: 'Umpqua National Forest',
    sourceProviderId: 'usfs_mvum_umpqua_nf',
    sourceName: 'USFS MVUM - Umpqua National Forest',
    sourceUri: 'https://www.fs.usda.gov/r06/umpqua/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_umpqua_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Umpqua National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r06/umpqua/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r06/umpqua/conditions',
  },
  {
    slug: 'fremont-winema-national-forest',
    forestName: 'Fremont-Winema National Forest',
    sourceProviderId: 'usfs_mvum_fremont_winema_nf',
    sourceName: 'USFS MVUM - Fremont-Winema National Forest',
    sourceUri: 'https://www.fs.usda.gov/r06/fremont-winema/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_fremont_winema_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Fremont-Winema National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r06/fremont-winema/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r06/fremont-winema/conditions',
  },
  {
    slug: 'idaho-panhandle-national-forests',
    forestName: 'Idaho Panhandle National Forests',
    sourceProviderId: 'usfs_mvum_idaho_panhandle_nf',
    sourceName: 'USFS MVUM - Idaho Panhandle National Forests',
    sourceUri: 'https://www.fs.usda.gov/r01/idahopanhandle/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_idaho_panhandle_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Idaho Panhandle National Forests',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r01/idahopanhandle/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r01/idahopanhandle/conditions',
  },
  {
    slug: 'helena-lewis-and-clark-national-forest',
    forestName: 'Helena-Lewis and Clark National Forest',
    sourceProviderId: 'usfs_mvum_helena_lewis_clark_nf',
    sourceName: 'USFS MVUM - Helena-Lewis and Clark National Forest',
    sourceUri: 'https://www.fs.usda.gov/r01/helena-lewisclark/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_helena_lewis_clark_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Helena-Lewis and Clark National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r01/helena-lewisclark/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r01/helena-lewisclark/alerts',
  },
  {
    slug: 'fishlake-national-forest',
    forestName: 'Fishlake National Forest',
    sourceProviderId: 'usfs_mvum_fishlake_nf',
    sourceName: 'USFS MVUM - Fishlake National Forest',
    sourceUri: 'https://www.fs.usda.gov/r04/fishlake/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_fishlake_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Fishlake National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r04/fishlake/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r04/fishlake/conditions',
  },
  {
    slug: 'black-hills-national-forest',
    forestName: 'Black Hills National Forest',
    sourceProviderId: 'usfs_mvum_black_hills_nf',
    sourceName: 'USFS MVUM - Black Hills National Forest',
    sourceUri: 'https://www.fs.usda.gov/r02/blackhills/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_black_hills_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Black Hills National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r02/blackhills/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r02/blackhills/conditions',
  },
  {
    slug: 'uinta-wasatch-cache-national-forest',
    forestName: 'Uinta-Wasatch-Cache National Forest',
    sourceProviderId: 'usfs_mvum_uinta_wasatch_cache_nf',
    sourceName: 'USFS MVUM - Uinta-Wasatch-Cache National Forest',
    sourceUri: 'https://www.fs.usda.gov/r04/uinta-wasatch-cache/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_uinta_wasatch_cache_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Uinta-Wasatch-Cache National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r04/uinta-wasatch-cache/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r04/uinta-wasatch-cache/conditions',
  },
  {
    slug: 'caribou-targhee-national-forest',
    forestName: 'Caribou-Targhee National Forest',
    sourceProviderId: 'usfs_mvum_caribou_targhee_nf',
    sourceName: 'USFS MVUM - Caribou-Targhee National Forest',
    sourceUri: 'https://www.fs.usda.gov/r04/caribou-targhee/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_caribou_targhee_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Caribou-Targhee National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r04/caribou-targhee/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r04/caribou-targhee/conditions',
  },
  {
    slug: 'klamath-national-forest',
    forestName: 'Klamath National Forest',
    sourceProviderId: 'usfs_mvum_klamath_nf',
    sourceName: 'USFS MVUM - Klamath National Forest',
    sourceUri: 'https://www.fs.usda.gov/r05/klamath/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_klamath_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Klamath National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r05/klamath/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r05/klamath/alerts',
  },
  {
    slug: 'willamette-national-forest',
    forestName: 'Willamette National Forest',
    sourceProviderId: 'usfs_mvum_willamette_nf',
    sourceName: 'USFS MVUM - Willamette National Forest',
    sourceUri: 'https://www.fs.usda.gov/r06/willamette/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_willamette_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Willamette National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r06/willamette/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r06/willamette/conditions',
  },
  {
    slug: 'boise-national-forest',
    forestName: 'Boise National Forest',
    sourceProviderId: 'usfs_mvum_boise_nf',
    sourceName: 'USFS MVUM - Boise National Forest',
    sourceUri: 'https://www.fs.usda.gov/r04/boise/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_boise_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Boise National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r04/boise/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r04/boise/conditions',
  },
  {
    slug: 'lolo-national-forest',
    forestName: 'Lolo National Forest',
    sourceProviderId: 'usfs_mvum_lolo_nf',
    sourceName: 'USFS MVUM - Lolo National Forest',
    sourceUri: 'https://www.fs.usda.gov/r01/lolo/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_lolo_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Lolo National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r01/lolo/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r01/lolo/alerts',
  },
  {
    slug: 'salmon-challis-national-forest',
    forestName: 'Salmon-Challis National Forest',
    sourceProviderId: 'usfs_mvum_salmon_challis_nf',
    sourceName: 'USFS MVUM - Salmon-Challis National Forest',
    sourceUri: 'https://www.fs.usda.gov/r04/salmon-challis/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_salmon_challis_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Salmon-Challis National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r04/salmon-challis/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r04/salmon-challis/conditions',
  },
  {
    slug: 'stanislaus-national-forest',
    forestName: 'Stanislaus National Forest',
    sourceProviderId: 'usfs_mvum_stanislaus_nf',
    sourceName: 'USFS MVUM - Stanislaus National Forest',
    sourceUri: 'https://www.fs.usda.gov/r05/stanislaus/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_stanislaus_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Stanislaus National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r05/stanislaus/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r05/stanislaus/conditions',
  },
  {
    slug: 'dixie-national-forest',
    forestName: 'Dixie National Forest',
    sourceProviderId: 'usfs_mvum_dixie_nf',
    sourceName: 'USFS MVUM - Dixie National Forest',
    sourceUri: 'https://www.fs.usda.gov/r04/dixie/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_dixie_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Dixie National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r04/dixie/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r04/dixie/conditions',
  },
  {
    slug: 'bitterroot-national-forest',
    forestName: 'Bitterroot National Forest',
    sourceProviderId: 'usfs_mvum_bitterroot_nf',
    sourceName: 'USFS MVUM - Bitterroot National Forest',
    sourceUri: 'https://www.fs.usda.gov/r01/bitterroot/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_bitterroot_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Bitterroot National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r01/bitterroot/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r01/bitterroot/alerts',
  },
  {
    slug: 'mt-hood-national-forest',
    forestName: 'Mt. Hood National Forest',
    sourceProviderId: 'usfs_mvum_mt_hood_nf',
    sourceName: 'USFS MVUM - Mt. Hood National Forest',
    sourceUri: 'https://www.fs.usda.gov/r06/mthood/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_mt_hood_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Mt. Hood National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r06/mthood/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r06/mthood/conditions',
  },
  {
    slug: 'coronado-national-forest',
    forestName: 'Coronado National Forest',
    sourceProviderId: 'usfs_mvum_coronado_nf',
    sourceName: 'USFS MVUM - Coronado National Forest',
    sourceUri: 'https://www.fs.usda.gov/r03/coronado/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_coronado_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Coronado National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r03/coronado/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r03/coronado/alerts',
  },
  {
    slug: 'sierra-national-forest',
    forestName: 'Sierra National Forest',
    sourceProviderId: 'usfs_mvum_sierra_nf',
    sourceName: 'USFS MVUM - Sierra National Forest',
    sourceUri: 'https://www.fs.usda.gov/r05/sierra/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_sierra_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Sierra National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r05/sierra/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r05/sierra/conditions',
  },
  {
    slug: 'huron-manistee-national-forest',
    forestName: 'Huron-Manistee National Forest',
    sourceProviderId: 'usfs_mvum_huron_manistee_nf',
    sourceName: 'USFS MVUM - Huron-Manistee National Forest',
    sourceUri: 'https://www.fs.usda.gov/r09/huron-manistee/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_huron_manistee_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Huron-Manistee National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r09/huron-manistee/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r09/huron-manistee/conditions',
  },
  {
    slug: 'ozark-st-francis-national-forest',
    forestName: 'Ozark-St. Francis National Forest',
    sourceProviderId: 'usfs_mvum_ozark_st_francis_nf',
    sourceName: 'USFS MVUM - Ozark-St. Francis National Forest',
    sourceUri: 'https://www.fs.usda.gov/r08/ozark-stfrancis/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_ozark_st_francis_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Ozark-St. Francis National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r08/ozark-stfrancis/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r08/ozark-stfrancis/conditions',
  },
  {
    slug: 'ottawa-national-forest',
    forestName: 'Ottawa National Forest',
    sourceProviderId: 'usfs_mvum_ottawa_nf',
    sourceName: 'USFS MVUM - Ottawa National Forest',
    sourceUri: 'https://www.fs.usda.gov/r09/ottawa/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_ottawa_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Ottawa National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r09/ottawa/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r09/ottawa/conditions',
  },
  {
    slug: 'hiawatha-national-forest',
    forestName: 'Hiawatha National Forest',
    sourceProviderId: 'usfs_mvum_hiawatha_nf',
    sourceName: 'USFS MVUM - Hiawatha National Forest',
    sourceUri: 'https://www.fs.usda.gov/r09/hiawatha/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_hiawatha_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Hiawatha National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r09/hiawatha/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r09/hiawatha/conditions',
  },
  {
    slug: 'chequamegon-nicolet-national-forest',
    forestName: 'Chequamegon-Nicolet National Forest',
    sourceProviderId: 'usfs_mvum_chequamegon_nicolet_nf',
    sourceName: 'USFS MVUM - Chequamegon-Nicolet National Forest',
    sourceUri: 'https://www.fs.usda.gov/r09/chequamegon-nicolet/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_chequamegon_nicolet_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Chequamegon-Nicolet National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r09/chequamegon-nicolet/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r09/chequamegon-nicolet/conditions',
  },
  {
    slug: 'national-forests-in-florida',
    forestName: 'National Forests in Florida',
    sourceProviderId: 'usfs_mvum_florida_nfs',
    sourceName: 'USFS MVUM - National Forests in Florida',
    sourceUri: 'https://www.fs.usda.gov/r08/florida/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_florida_nfs',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - National Forests in Florida',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r08/florida/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r08/florida/conditions',
  },
  {
    slug: 'ouachita-national-forest',
    forestName: 'Ouachita National Forest',
    sourceProviderId: 'usfs_mvum_ouachita_nf',
    sourceName: 'USFS MVUM - Ouachita National Forest',
    sourceUri: 'https://www.fs.usda.gov/r08/ouachita/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_ouachita_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Ouachita National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r08/ouachita/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r08/ouachita/conditions',
  },
  {
    slug: 'mark-twain-national-forest',
    forestName: 'Mark Twain National Forest',
    sourceProviderId: 'usfs_mvum_mark_twain_nf',
    sourceName: 'USFS MVUM - Mark Twain National Forest',
    sourceUri: 'https://www.fs.usda.gov/r09/marktwain/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_mark_twain_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Mark Twain National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r09/marktwain/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r09/marktwain/conditions',
  },
  {
    slug: 'national-forests-in-mississippi',
    forestName: 'National Forests in Mississippi',
    sourceProviderId: 'usfs_mvum_mississippi_nfs',
    sourceName: 'USFS MVUM - National Forests in Mississippi',
    sourceUri: 'https://www.fs.usda.gov/r08/mississippi/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_mississippi_nfs',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - National Forests in Mississippi',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r08/mississippi/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r08/mississippi/conditions',
  },
  {
    slug: 'kisatchie-national-forest',
    forestName: 'Kisatchie National Forest',
    sourceProviderId: 'usfs_mvum_kisatchie_nf',
    sourceName: 'USFS MVUM - Kisatchie National Forest',
    sourceUri: 'https://www.fs.usda.gov/r08/kisatchie/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_kisatchie_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Kisatchie National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r08/kisatchie/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r08/kisatchie/conditions',
  },
  {
    slug: 'george-washington-jefferson-national-forest',
    forestName: 'George Washington and Jefferson National Forest',
    sourceProviderId: 'usfs_mvum_gwj_nf',
    sourceName: 'USFS MVUM - George Washington and Jefferson National Forest',
    sourceUri: 'https://www.fs.usda.gov/r08/gwj/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_gwj_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - George Washington and Jefferson National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r08/gwj/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r08/gwj/conditions',
  },
  {
    slug: 'francis-marion-sumter-national-forests',
    forestName: 'Francis Marion and Sumter National Forests',
    sourceProviderId: 'usfs_mvum_francis_marion_sumter_nfs',
    sourceName: 'USFS MVUM - Francis Marion and Sumter National Forests',
    sourceUri: 'https://www.fs.usda.gov/r08/francismarionsumter/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_francis_marion_sumter_nfs',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Francis Marion and Sumter National Forests',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r08/francismarionsumter/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r08/francismarionsumter/conditions',
  },
  {
    slug: 'national-forests-in-texas',
    forestName: 'National Forests in Texas',
    sourceProviderId: 'usfs_mvum_texas_nfs',
    sourceName: 'USFS MVUM - National Forests in Texas',
    sourceUri: 'https://www.fs.usda.gov/r08/texas/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_texas_nfs',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - National Forests in Texas',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r08/texas/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r08/texas/alerts',
  },
  {
    slug: 'national-forests-in-north-carolina',
    forestName: 'National Forests in North Carolina',
    sourceProviderId: 'usfs_mvum_north_carolina_nfs',
    sourceName: 'USFS MVUM - National Forests in North Carolina',
    sourceUri: 'https://www.fs.usda.gov/r08/northcarolina/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_north_carolina_nfs',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - National Forests in North Carolina',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r08/northcarolina/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r08/northcarolina/conditions',
  },
  {
    slug: 'allegheny-national-forest',
    forestName: 'Allegheny National Forest',
    sourceProviderId: 'usfs_mvum_allegheny_nf',
    sourceName: 'USFS MVUM - Allegheny National Forest',
    sourceUri: 'https://www.fs.usda.gov/r09/allegheny/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_allegheny_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Allegheny National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r09/allegheny/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r09/allegheny/conditions',
  },
  {
    slug: 'cherokee-national-forest',
    forestName: 'Cherokee National Forest',
    sourceProviderId: 'usfs_mvum_cherokee_nf',
    sourceName: 'USFS MVUM - Cherokee National Forest',
    sourceUri: 'https://www.fs.usda.gov/r08/cherokee/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_cherokee_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Cherokee National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r08/cherokee/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r08/cherokee/conditions',
  },
  {
    slug: 'daniel-boone-national-forest',
    forestName: 'Daniel Boone National Forest',
    sourceProviderId: 'usfs_mvum_daniel_boone_nf',
    sourceName: 'USFS MVUM - Daniel Boone National Forest',
    sourceUri: 'https://www.fs.usda.gov/r08/danielboone/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_daniel_boone_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Daniel Boone National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r08/danielboone/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r08/danielboone/conditions',
  },
  {
    slug: 'rogue-river-siskiyou-national-forests',
    forestName: 'Rogue River-Siskiyou National Forests',
    sourceProviderId: 'usfs_mvum_rogue_siskiyou_nfs',
    sourceName: 'USFS MVUM - Rogue River-Siskiyou National Forests',
    sourceUri: 'https://www.fs.usda.gov/r06/rogue-siskiyou/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_rogue_siskiyou_nfs',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Rogue River-Siskiyou National Forests',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r06/rogue-siskiyou/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r06/rogue-siskiyou/conditions',
  },
  {
    slug: 'medicine-bow-routt-national-forest',
    forestName: 'Medicine Bow-Routt National Forest',
    sourceProviderId: 'usfs_mvum_medicine_bow_routt_nf',
    sourceName: 'USFS MVUM - Medicine Bow-Routt National Forest',
    sourceUri: 'https://www.fs.usda.gov/r02/mbrtb/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_medicine_bow_routt_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Medicine Bow-Routt National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r02/mbrtb/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r02/mbrtb/conditions',
  },
  {
    slug: 'kootenai-national-forest',
    forestName: 'Kootenai National Forest',
    sourceProviderId: 'usfs_mvum_kootenai_nf',
    sourceName: 'USFS MVUM - Kootenai National Forest',
    sourceUri: 'https://www.fs.usda.gov/r01/kootenai/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_kootenai_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Kootenai National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r01/kootenai/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r01/kootenai/conditions',
  },
  {
    slug: 'gifford-pinchot-national-forest',
    forestName: 'Gifford Pinchot National Forest',
    sourceProviderId: 'usfs_mvum_gifford_pinchot_nf',
    sourceName: 'USFS MVUM - Gifford Pinchot National Forest',
    sourceUri: 'https://www.fs.usda.gov/r06/giffordpinchot/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_gifford_pinchot_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Gifford Pinchot National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r06/giffordpinchot/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r06/giffordpinchot/conditions',
  },
  {
    slug: 'arapaho-roosevelt-national-forests',
    forestName: 'Arapaho and Roosevelt National Forests',
    sourceProviderId: 'usfs_mvum_arapaho_roosevelt_nfs',
    sourceName: 'USFS MVUM - Arapaho and Roosevelt National Forests',
    sourceUri: 'https://www.fs.usda.gov/r02/arp/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_arapaho_roosevelt_nfs',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Arapaho and Roosevelt National Forests',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r02/arp/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r02/arp/conditions',
  },
  {
    slug: 'umatilla-national-forest',
    forestName: 'Umatilla National Forest',
    sourceProviderId: 'usfs_mvum_umatilla_nf',
    sourceName: 'USFS MVUM - Umatilla National Forest',
    sourceUri: 'https://www.fs.usda.gov/r06/umatilla/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_umatilla_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Umatilla National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r06/umatilla/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r06/umatilla/conditions',
  },
  {
    slug: 'ochoco-national-forest',
    forestName: 'Ochoco National Forest',
    sourceProviderId: 'usfs_mvum_ochoco_nf',
    sourceName: 'USFS MVUM - Ochoco National Forest',
    sourceUri: 'https://www.fs.usda.gov/r06/ochoco/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_ochoco_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Ochoco National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r06/ochoco/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r06/ochoco/alerts',
  },
  {
    slug: 'cibola-national-forest',
    forestName: 'Cibola National Forest',
    sourceProviderId: 'usfs_mvum_cibola_nf',
    sourceName: 'USFS MVUM - Cibola National Forest',
    sourceUri: 'https://www.fs.usda.gov/r03/cibola/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_cibola_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Cibola National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r03/cibola/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r03/cibola/alerts',
  },
  {
    slug: 'eldorado-national-forest',
    forestName: 'Eldorado National Forest',
    sourceProviderId: 'usfs_mvum_eldorado_nf',
    sourceName: 'USFS MVUM - Eldorado National Forest',
    sourceUri: 'https://www.fs.usda.gov/r05/eldorado/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_eldorado_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Eldorado National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r05/eldorado/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r05/eldorado/conditions',
  },
  {
    slug: 'nez-perce-clearwater-national-forest',
    forestName: 'Nez Perce-Clearwater National Forest',
    sourceProviderId: 'usfs_mvum_nez_perce_clearwater_nf',
    sourceName: 'USFS MVUM - Nez Perce-Clearwater National Forest',
    sourceUri: 'https://www.fs.usda.gov/r01/nezperce-clearwater/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_nez_perce_clearwater_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Nez Perce-Clearwater National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r01/nezperce-clearwater/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r01/nezperce-clearwater/conditions',
  },
  {
    slug: 'payette-national-forest',
    forestName: 'Payette National Forest',
    sourceProviderId: 'usfs_mvum_payette_nf',
    sourceName: 'USFS MVUM - Payette National Forest',
    sourceUri: 'https://www.fs.usda.gov/r04/payette/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_payette_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Payette National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r04/payette/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r04/payette/conditions',
  },
  {
    slug: 'superior-national-forest',
    forestName: 'Superior National Forest',
    sourceProviderId: 'usfs_mvum_superior_nf',
    sourceName: 'USFS MVUM - Superior National Forest',
    sourceUri: 'https://www.fs.usda.gov/r09/superior/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_superior_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Superior National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r09/superior/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r09/superior/conditions',
  },
  {
    slug: 'chippewa-national-forest',
    forestName: 'Chippewa National Forest',
    sourceProviderId: 'usfs_mvum_chippewa_nf',
    sourceName: 'USFS MVUM - Chippewa National Forest',
    sourceUri: 'https://www.fs.usda.gov/r09/chippewa/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_chippewa_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Chippewa National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r09/chippewa/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r09/chippewa/conditions',
  },
  {
    slug: 'sequoia-national-forest',
    forestName: 'Sequoia National Forest',
    sourceProviderId: 'usfs_mvum_sequoia_nf',
    sourceName: 'USFS MVUM - Sequoia National Forest',
    sourceUri: 'https://www.fs.usda.gov/r05/sequoia/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_sequoia_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Sequoia National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r05/sequoia/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r05/sequoia/conditions',
  },
  {
    slug: 'ashley-national-forest',
    forestName: 'Ashley National Forest',
    sourceProviderId: 'usfs_mvum_ashley_nf',
    sourceName: 'USFS MVUM - Ashley National Forest',
    sourceUri: 'https://www.fs.usda.gov/r04/ashley/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_ashley_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Ashley National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r04/ashley/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r04/ashley/alerts',
  },
  {
    slug: 'bridger-teton-national-forest',
    forestName: 'Bridger-Teton National Forest',
    sourceProviderId: 'usfs_mvum_bridger_teton_nf',
    sourceName: 'USFS MVUM - Bridger-Teton National Forest',
    sourceUri: 'https://www.fs.usda.gov/r04/bridger-teton/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_bridger_teton_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Bridger-Teton National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r04/bridger-teton/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r04/bridger-teton/conditions',
  },
  {
    slug: 'siuslaw-national-forest',
    forestName: 'Siuslaw National Forest',
    sourceProviderId: 'usfs_mvum_siuslaw_nf',
    sourceName: 'USFS MVUM - Siuslaw National Forest',
    sourceUri: 'https://www.fs.usda.gov/r06/siuslaw/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_siuslaw_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Siuslaw National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r06/siuslaw/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r06/siuslaw/conditions',
  },
  {
    slug: 'lincoln-national-forest',
    forestName: 'Lincoln National Forest',
    sourceProviderId: 'usfs_mvum_lincoln_nf',
    sourceName: 'USFS MVUM - Lincoln National Forest',
    sourceUri: 'https://www.fs.usda.gov/r03/lincoln/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_lincoln_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Lincoln National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r03/lincoln/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r03/lincoln/alerts',
  },
  {
    slug: 'white-river-national-forest',
    forestName: 'White River National Forest',
    sourceProviderId: 'usfs_mvum_white_river_nf',
    sourceName: 'USFS MVUM - White River National Forest',
    sourceUri: 'https://www.fs.usda.gov/r02/whiteriver/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_white_river_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - White River National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r02/whiteriver/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r02/whiteriver/conditions',
  },
  {
    slug: 'mt-baker-snoqualmie-national-forest',
    forestName: 'Mt. Baker-Snoqualmie National Forest',
    sourceProviderId: 'usfs_mvum_mt_baker_snoqualmie_nf',
    sourceName: 'USFS MVUM - Mt. Baker-Snoqualmie National Forest',
    sourceUri: 'https://www.fs.usda.gov/r06/mbs/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_mt_baker_snoqualmie_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Mt. Baker-Snoqualmie National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r06/mbs/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r06/mbs/conditions',
  },
  {
    slug: 'flathead-national-forest',
    forestName: 'Flathead National Forest',
    sourceProviderId: 'usfs_mvum_flathead_nf',
    sourceName: 'USFS MVUM - Flathead National Forest',
    sourceUri: 'https://www.fs.usda.gov/r01/flathead/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_flathead_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Flathead National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r01/flathead/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r01/flathead/conditions',
  },
  {
    slug: 'olympic-national-forest',
    forestName: 'Olympic National Forest',
    sourceProviderId: 'usfs_mvum_olympic_nf',
    sourceName: 'USFS MVUM - Olympic National Forest',
    sourceUri: 'https://www.fs.usda.gov/r06/olympic/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_olympic_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Olympic National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r06/olympic/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r06/olympic/conditions',
  },
  {
    slug: 'custer-national-forest',
    forestName: 'Custer National Forest',
    sourceProviderId: 'usfs_mvum_custer_nf',
    sourceName: 'USFS MVUM - Custer National Forest',
    sourceUri: 'https://www.fs.usda.gov/r01/custergallatin/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_custer_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Custer National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r01/custergallatin/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r01/custergallatin/conditions',
  },
  {
    slug: 'bighorn-national-forest',
    forestName: 'Bighorn National Forest',
    sourceProviderId: 'usfs_mvum_bighorn_nf',
    sourceName: 'USFS MVUM - Bighorn National Forest',
    sourceUri: 'https://www.fs.usda.gov/r02/bighorn/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_bighorn_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Bighorn National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r02/bighorn/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r02/bighorn/conditions',
  },
  {
    slug: 'colville-national-forest',
    forestName: 'Colville National Forest',
    sourceProviderId: 'usfs_mvum_colville_nf',
    sourceName: 'USFS MVUM - Colville National Forest',
    sourceUri: 'https://www.fs.usda.gov/r06/colville/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_colville_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Colville National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r06/colville/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r06/colville/alerts',
  },
  {
    slug: 'chattahoochee-oconee-national-forests',
    forestName: 'Chattahoochee-Oconee National Forests',
    sourceProviderId: 'usfs_mvum_chattahoochee_oconee_nfs',
    sourceName: 'USFS MVUM - Chattahoochee-Oconee National Forests',
    sourceUri: 'https://www.fs.usda.gov/r08/chattahoochee-oconee/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_chattahoochee_oconee_nfs',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Chattahoochee-Oconee National Forests',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r08/chattahoochee-oconee/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r08/chattahoochee-oconee/conditions',
  },
  {
    slug: 'nebraska-national-forest',
    forestName: 'Nebraska National Forest',
    sourceProviderId: 'usfs_mvum_nebraska_nf',
    sourceName: 'USFS MVUM - Nebraska National Forest',
    sourceUri: 'https://www.fs.usda.gov/r02/nebraska/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_nebraska_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Nebraska National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r02/nebraska/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r02/nebraska/conditions',
  },
  {
    slug: 'shoshone-national-forest',
    forestName: 'Shoshone National Forest',
    sourceProviderId: 'usfs_mvum_shoshone_nf',
    sourceName: 'USFS MVUM - Shoshone National Forest',
    sourceUri: 'https://www.fs.usda.gov/r02/shoshone/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_shoshone_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Shoshone National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r02/shoshone/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r02/shoshone/conditions',
  },
  {
    slug: 'san-bernardino-national-forest',
    forestName: 'San Bernardino National Forest',
    sourceProviderId: 'usfs_mvum_san_bernardino_nf',
    sourceName: 'USFS MVUM - San Bernardino National Forest',
    sourceUri: 'https://www.fs.usda.gov/r05/sanbernardino/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_san_bernardino_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - San Bernardino National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r05/sanbernardino/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r05/sanbernardino/conditions',
  },
  {
    slug: 'los-padres-national-forest',
    forestName: 'Los Padres National Forest',
    sourceProviderId: 'usfs_mvum_los_padres_nf',
    sourceName: 'USFS MVUM - Los Padres National Forest',
    sourceUri: 'https://www.fs.usda.gov/r05/lospadres/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_los_padres_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Los Padres National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r05/lospadres/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r05/lospadres/conditions',
  },
  {
    slug: 'dakota-prairie-grasslands',
    forestName: 'Dakota Prairie Grasslands',
    sourceProviderId: 'usfs_mvum_dakota_prairie_grasslands',
    sourceName: 'USFS MVUM - Dakota Prairie Grasslands',
    sourceUri: 'https://www.fs.usda.gov/r01/dpg/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_dakota_prairie_grasslands',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Dakota Prairie Grasslands',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r01/dpg/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r01/dpg/alerts',
  },
  {
    slug: 'monongahela-national-forest',
    forestName: 'Monongahela National Forest',
    sourceProviderId: 'usfs_mvum_monongahela_nf',
    sourceName: 'USFS MVUM - Monongahela National Forest',
    sourceUri: 'https://www.fs.usda.gov/r09/monongahela/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_monongahela_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Monongahela National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r09/monongahela/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r09/monongahela/conditions',
  },
  {
    slug: 'land-between-the-lakes-national-recreation-area',
    forestName: 'Land Between the Lakes National Recreation Area',
    sourceProviderId: 'usfs_mvum_land_between_lakes_nra',
    sourceName: 'USFS MVUM - Land Between the Lakes National Recreation Area',
    sourceUri: 'https://www.landbetweenthelakes.us/maps/',
    currentConditionProviderId: 'usfs_current_conditions_land_between_lakes_nra',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Land Between the Lakes National Recreation Area',
    currentConditionSourceUri: 'https://www.landbetweenthelakes.us/alerts/',
    currentConditionReferenceUri: 'https://www.landbetweenthelakes.us/alerts/',
  },
  {
    slug: 'shawnee-national-forest',
    forestName: 'Shawnee National Forest',
    sourceProviderId: 'usfs_mvum_shawnee_nf',
    sourceName: 'USFS MVUM - Shawnee National Forest',
    sourceUri: 'https://www.fs.usda.gov/r09/shawnee/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_shawnee_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Shawnee National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r09/shawnee/conditions',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r09/shawnee/conditions',
  },
  {
    slug: 'cleveland-national-forest',
    forestName: 'Cleveland National Forest',
    sourceProviderId: 'usfs_mvum_cleveland_nf',
    sourceName: 'USFS MVUM - Cleveland National Forest',
    sourceUri: 'https://www.fs.usda.gov/r05/cleveland/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_cleveland_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Cleveland National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r05/cleveland/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r05/cleveland/conditions',
  },
  {
    slug: 'green-mountain-finger-lakes-national-forests',
    forestName: 'Green Mountain and Finger Lakes National Forests',
    sourceProviderId: 'usfs_mvum_green_mountain_finger_lakes_nfs',
    sourceName: 'USFS MVUM - Green Mountain and Finger Lakes National Forests',
    sourceUri: 'https://www.fs.usda.gov/r09/gmfl/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_green_mountain_finger_lakes_nfs',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Green Mountain and Finger Lakes National Forests',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r09/gmfl/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r09/gmfl/conditions',
  },
  {
    slug: 'lake-tahoe-basin-management-unit',
    forestName: 'Lake Tahoe Basin Management Unit',
    sourceProviderId: 'usfs_mvum_lake_tahoe_basin_mgmt_unit',
    sourceName: 'USFS MVUM - Lake Tahoe Basin Management Unit',
    sourceUri: 'https://www.fs.usda.gov/r05/laketahoebasin/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_lake_tahoe_basin_mgmt_unit',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Lake Tahoe Basin Management Unit',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r05/laketahoebasin/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r05/laketahoebasin/conditions',
  },
  {
    slug: 'wayne-national-forest',
    forestName: 'Wayne National Forest',
    sourceProviderId: 'usfs_mvum_wayne_nf',
    sourceName: 'USFS MVUM - Wayne National Forest',
    sourceUri: 'https://www.fs.usda.gov/r09/wayne/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_wayne_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Wayne National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r09/wayne/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r09/wayne/alerts',
  },
  {
    slug: 'white-mountain-national-forest',
    forestName: 'White Mountain National Forest',
    sourceProviderId: 'usfs_mvum_white_mountain_nf',
    sourceName: 'USFS MVUM - White Mountain National Forest',
    sourceUri: 'https://www.fs.usda.gov/r09/whitemountain/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_white_mountain_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - White Mountain National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r09/whitemountain/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r09/whitemountain/conditions',
  },
  {
    slug: 'wallowa-whitman-national-forest',
    forestName: 'Wallowa-Whitman National Forest',
    sourceProviderId: 'usfs_mvum_wallowa_whitman_nf',
    sourceName: 'USFS MVUM - Wallowa-Whitman National Forest',
    sourceUri: 'https://www.fs.usda.gov/r06/wallowa-whitman/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_wallowa_whitman_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Wallowa-Whitman National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r06/wallowa-whitman/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r06/wallowa-whitman/conditions',
  },
  {
    slug: 'hoosier-national-forest',
    forestName: 'Hoosier National Forest',
    sourceProviderId: 'usfs_mvum_hoosier_nf',
    sourceName: 'USFS MVUM - Hoosier National Forest',
    sourceUri: 'https://www.fs.usda.gov/r09/hoosier/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_hoosier_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Hoosier National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r09/hoosier/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r09/hoosier/conditions',
  },
  {
    slug: 'columbia-river-gorge-national-scenic-area',
    forestName: 'Columbia River Gorge National Scenic Area',
    sourceProviderId: 'usfs_mvum_columbia_river_gorge_nsa',
    sourceName: 'USFS MVUM - Columbia River Gorge National Scenic Area',
    sourceUri: 'https://www.fs.usda.gov/r06/columbiarivergorge/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_columbia_river_gorge_nsa',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Columbia River Gorge National Scenic Area',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r06/columbiarivergorge/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r06/columbiarivergorge/conditions',
  },
  {
    slug: 'okanogan-wenatchee-national-forest',
    forestName: 'Okanogan-Wenatchee National Forest',
    sourceProviderId: 'usfs_mvum_okanogan_wenatchee_nf',
    sourceName: 'USFS MVUM - Okanogan-Wenatchee National Forest',
    sourceUri: 'https://www.fs.usda.gov/r06/okanogan-wenatchee/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_okanogan_wenatchee_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Okanogan-Wenatchee National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r06/okanogan-wenatchee/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r06/okanogan-wenatchee/conditions',
  },
  {
    slug: 'six-rivers-national-forest',
    forestName: 'Six Rivers National Forest',
    sourceProviderId: 'usfs_mvum_six_rivers_nf',
    sourceName: 'USFS MVUM - Six Rivers National Forest',
    sourceUri: 'https://www.fs.usda.gov/r05/sixrivers/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_six_rivers_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Six Rivers National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r05/sixrivers/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r05/sixrivers/conditions',
  },
  {
    slug: 'tonto-national-forest',
    forestName: 'Tonto National Forest',
    sourceProviderId: 'usfs_mvum_tonto_nf',
    sourceName: 'USFS MVUM - Tonto National Forest',
    sourceUri: 'https://www.fs.usda.gov/r03/tonto/maps-guides',
    currentConditionProviderId: 'usfs_current_conditions_tonto_nf',
    currentConditionSourceName: 'USFS Alerts and Current Conditions - Tonto National Forest',
    currentConditionSourceUri: 'https://www.fs.usda.gov/r03/tonto/alerts',
    currentConditionReferenceUri: 'https://www.fs.usda.gov/r03/tonto/alerts',
  },
];

export const USFS_MVUM_LAYERS: UsfsMvumLayer[] = [
  {
    kind: 'road',
    sourceLayer: 'Motor Vehicle Use Map: Roads',
    url: 'https://services.arcgis.com/xOi1kZaI0eWDREZv/ArcGIS/rest/services/Motor_Vehicle_Use_Map_Roads/FeatureServer/0',
    statusField: 'ROUTESTATU',
    namePrefix: 'FR',
  },
  {
    kind: 'trail',
    sourceLayer: 'Motor Vehicle Use Map: Trails',
    url: 'https://services.arcgis.com/xOi1kZaI0eWDREZv/ArcGIS/rest/services/Motor_Vehicle_Use_Maps_Trails/FeatureServer/0',
    statusField: 'TRAILSTATU',
    namePrefix: 'Trail',
  },
];

const ROUTE_CATALOG_MVUM_WARNING =
  'USFS MVUM is a legal baseline only; current closures, fire restrictions, weather, gates, and passability still require current checks.';
const ROUTE_CATALOG_CURRENT_CONDITION_CAVEAT =
  'Official current-condition overlays can block recommendation but do not establish open access, passability, or safety.';
const ACTIVE_GUIDANCE_JOIN_GAP_MAX_METERS = 120;

function cleanString(value: unknown): string {
  return String(value ?? '').trim();
}

function cleanNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140);
}

function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function normalizeOpenFlag(value: unknown): boolean {
  return /^open$/i.test(cleanString(value));
}

function addDaysIso(isoDate: string, days: number): string {
  const date = new Date(isoDate);
  if (!Number.isFinite(date.getTime())) return isoDate;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function estimateMvumRemotenessScore(distanceMiles: number, sourceFeatureCount = 1): number {
  const distanceComponent = Math.min(2.5, distanceMiles / 12);
  const aggregateComponent = Math.min(1.5, Math.max(0, sourceFeatureCount - 1) * 0.25);
  return Number(clampNumber(5 + distanceComponent + aggregateComponent, 1, 10).toFixed(1));
}

function estimateMinimumFuelRangeMiles(distanceMiles: number): number {
  return Math.max(10, Math.ceil(distanceMiles * 1.5));
}

function estimateMinimumWaterCapacityGallons(estimatedDurationMinutes: number): number {
  const routeDays = Math.max(1, Math.ceil(estimatedDurationMinutes / 480));
  return routeDays;
}

function mvumRouteIntelligence(args: {
  distanceMiles: number;
  estimatedDurationMinutes: number;
  sourceFeatureCount: number;
  activeGuidance?: UsfsMvumTopologyAssessment;
}) {
  return {
    remotenessBasis: 'estimated_from_mvum_distance_and_forest_context',
    remotenessDataState: 'estimated',
    campabilityDataState: 'unknown',
    resourceMarginBasis: 'estimated_from_mvum_distance_and_duration',
    fuelMarginDataState: 'estimated',
    waterMarginDataState: 'estimated',
    sourceFeatureCount: args.sourceFeatureCount,
    activeGuidance: args.activeGuidance,
    caveat: 'Fuel and water margins are planning estimates from route distance/duration only; they are not live resource availability or safety conclusions.',
  };
}

function stablePayloadHash(value: unknown): string {
  const json = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < json.length; index += 1) {
    hash ^= json.charCodeAt(index);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function normalizePath(value: unknown): number[][] {
  if (!Array.isArray(value)) return [];
  return value
    .map((point) => {
      if (!Array.isArray(point) || point.length < 2) return null;
      const longitude = Number(point[0]);
      const latitude = Number(point[1]);
      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        Math.abs(latitude) > 90 ||
        Math.abs(longitude) > 180
      ) {
        return null;
      }
      return [Number(longitude.toFixed(6)), Number(latitude.toFixed(6))];
    })
    .filter((point): point is number[] => !!point);
}

function normalizePaths(feature: UsfsMvumArcGisFeature): number[][][] {
  const rawPaths = feature.geometry?.paths;
  if (!Array.isArray(rawPaths)) return [];
  return rawPaths.map(normalizePath).filter((path) => path.length >= 2);
}

function centerFromPaths(paths: number[][][]): { latitude: number; longitude: number } | null {
  const points = paths.flat();
  if (points.length === 0) return null;
  const totals = points.reduce(
    (acc, point) => ({
      longitude: acc.longitude + point[0],
      latitude: acc.latitude + point[1],
    }),
    { latitude: 0, longitude: 0 },
  );
  return {
    latitude: Number((totals.latitude / points.length).toFixed(6)),
    longitude: Number((totals.longitude / points.length).toFixed(6)),
  };
}

function routeGeometryFromPaths(paths: number[][][]): { type: 'LineString' | 'MultiLineString'; coordinates: number[][] | number[][][] } | null {
  if (paths.length === 0) return null;
  if (paths.length === 1) return { type: 'LineString', coordinates: paths[0] };
  return { type: 'MultiLineString', coordinates: paths };
}

function vehicleFitFromAttributes(attributes: Record<string, unknown>): string[] {
  const fit = new Set<string>();
  if (normalizeOpenFlag(attributes.PASSENGERV)) fit.add('highway_legal_4x4');
  if (normalizeOpenFlag(attributes.HIGHCLEARA) || normalizeOpenFlag(attributes.FOURWD_GT5)) {
    fit.add('full_size_4x4');
  }
  if (normalizeOpenFlag(attributes.ATV)) fit.add('atv');
  if (normalizeOpenFlag(attributes.OTHER_OHV_) || normalizeOpenFlag(attributes.OTHER_OHV1)) fit.add('utv');
  if (normalizeOpenFlag(attributes.MOTORCYCLE)) fit.add('motorcycle');
  return Array.from(fit);
}

function orderedVehicleFit(values: string[]): string[] {
  const order = ['highway_legal_4x4', 'full_size_4x4', 'atv', 'utv', 'motorcycle'];
  const unique = new Set(values);
  return order.filter((value) => unique.has(value));
}

function routeName(layer: UsfsMvumLayer, attributes: Record<string, unknown>): string {
  const id = cleanString(attributes.ID || attributes.FIELD_ID || attributes.RTE_CN);
  const rawName = cleanString(attributes.NAME);
  const titleName = rawName ? toTitleCase(rawName) : '';
  if (id && titleName) return `${layer.namePrefix} ${id} ${titleName}`;
  if (id) return `${layer.namePrefix} ${id}`;
  if (titleName) return `${layer.namePrefix} ${titleName}`;
  return `${layer.namePrefix} MVUM Route`;
}

function providerFeatureId(layer: UsfsMvumLayer, attributes: Record<string, unknown>): string {
  const id = cleanString(attributes.ID || attributes.FIELD_ID || attributes.RTE_CN || attributes.GLOBALID || 'unknown');
  const fid = cleanString(attributes.FID || attributes.OBJECTID || attributes.GLOBALID || '0');
  return `${layer.kind}:${id || 'unknown'}:${fid || '0'}`;
}

function sourceFeatureKey(attributes: Record<string, unknown>): string {
  return cleanString(attributes.FID || attributes.OBJECTID || attributes.GLOBALID || '0') || '0';
}

function aggregationIdentity(layer: UsfsMvumLayer, attributes: Record<string, unknown>) {
  const id = cleanString(attributes.ID || attributes.FIELD_ID || attributes.RTE_CN);
  const rawName = cleanString(attributes.NAME);
  const name = rawName ? toTitleCase(rawName) : '';
  const keyParts = [layer.kind, id, name].filter(Boolean);
  if (keyParts.length === 1) return null;
  return {
    key: slugify(keyParts.join(' ')),
    publicIdParts: ['usfs-mvum', layer.kind, id, name].filter(Boolean),
    id,
    name,
  };
}

function lineStringsFromRouteGeometry(routeGeometry: Record<string, unknown>): number[][][] {
  if (routeGeometry.type === 'LineString' && Array.isArray(routeGeometry.coordinates)) {
    const path = normalizePath(routeGeometry.coordinates);
    return path.length >= 2 ? [path] : [];
  }
  if (routeGeometry.type === 'MultiLineString' && Array.isArray(routeGeometry.coordinates)) {
    return routeGeometry.coordinates
      .map(normalizePath)
      .filter((path) => path.length >= 2);
  }
  return [];
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function distanceMeters(left: number[], right: number[]): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const [leftLng, leftLat] = left;
  const [rightLng, rightLat] = right;
  const dLat = toRadians(rightLat - leftLat);
  const dLng = toRadians(rightLng - leftLng);
  const lat1 = toRadians(leftLat);
  const lat2 = toRadians(rightLat);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6_371_008.8 * c;
}

function roundedMeters(value: number): number {
  return Number(value.toFixed(1));
}

class TopologyDisjointSet {
  private parents: number[];

  constructor(size: number) {
    this.parents = Array.from({ length: size }, (_, index) => index);
  }

  find(index: number): number {
    const parent = this.parents[index];
    if (parent === index) return index;
    const root = this.find(parent);
    this.parents[index] = root;
    return root;
  }

  union(left: number, right: number) {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot !== rightRoot) this.parents[rightRoot] = leftRoot;
  }
}

function componentGapMeters(
  endpoints: Array<{ point: number[]; component: number }>,
  components: number[],
): number | null {
  if (components.length <= 1) return 0;

  let maxNearestComponentGap = 0;
  for (const component of components) {
    const componentEndpoints = endpoints.filter((endpoint) => endpoint.component === component);
    const otherEndpoints = endpoints.filter((endpoint) => endpoint.component !== component);
    let nearestGap = Number.POSITIVE_INFINITY;
    for (const left of componentEndpoints) {
      for (const right of otherEndpoints) {
        nearestGap = Math.min(nearestGap, distanceMeters(left.point, right.point));
      }
    }
    if (Number.isFinite(nearestGap)) {
      maxNearestComponentGap = Math.max(maxNearestComponentGap, nearestGap);
    }
  }

  return roundedMeters(maxNearestComponentGap);
}

export function assessUsfsMvumAggregateTopology(lines: number[][][]): UsfsMvumTopologyAssessment {
  const sourceSegmentCount = lines.length;
  if (sourceSegmentCount === 0) {
    return {
      status: 'unavailable',
      topologyResolved: false,
      sourceSegmentCount,
      componentCount: 0,
      branchDetected: false,
      joinedSegmentGapCount: 0,
      disjointSegmentGapCount: 0,
      maxJoinGapMeters: null,
      maxSegmentGapMeters: null,
      unavailableReason: 'Active guidance is unavailable because this aggregate has no usable route geometry.',
    };
  }

  const endpoints = lines.flatMap((line, segmentIndex) => [
    { segmentIndex, point: line[0] },
    { segmentIndex, point: line[line.length - 1] },
  ]);
  const endpointSets = new TopologyDisjointSet(endpoints.length);

  for (let leftIndex = 0; leftIndex < endpoints.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < endpoints.length; rightIndex += 1) {
      if (distanceMeters(endpoints[leftIndex].point, endpoints[rightIndex].point) <= ACTIVE_GUIDANCE_JOIN_GAP_MAX_METERS) {
        endpointSets.union(leftIndex, rightIndex);
      }
    }
  }

  const endpointClusterByIndex = endpoints.map((_, index) => endpointSets.find(index));
  const clusterMembers = new Map<number, number[]>();
  endpointClusterByIndex.forEach((clusterId, endpointIndex) => {
    const existing = clusterMembers.get(clusterId) ?? [];
    existing.push(endpointIndex);
    clusterMembers.set(clusterId, existing);
  });

  const clusterIds = Array.from(clusterMembers.keys());
  const clusterIndexById = new Map(clusterIds.map((clusterId, index) => [clusterId, index]));
  const nodeSets = new TopologyDisjointSet(clusterIds.length);
  const clusterDegree = new Map<number, number>();

  for (let segmentIndex = 0; segmentIndex < sourceSegmentCount; segmentIndex += 1) {
    const startCluster = endpointClusterByIndex[segmentIndex * 2];
    const endCluster = endpointClusterByIndex[segmentIndex * 2 + 1];
    clusterDegree.set(startCluster, (clusterDegree.get(startCluster) ?? 0) + 1);
    clusterDegree.set(endCluster, (clusterDegree.get(endCluster) ?? 0) + 1);
    const startNode = clusterIndexById.get(startCluster);
    const endNode = clusterIndexById.get(endCluster);
    if (startNode != null && endNode != null && startNode !== endNode) {
      nodeSets.union(startNode, endNode);
    }
  }

  const componentIds = Array.from(new Set(clusterIds.map((clusterId) => {
    const nodeIndex = clusterIndexById.get(clusterId) ?? 0;
    return nodeSets.find(nodeIndex);
  })));
  const componentByClusterId = new Map(clusterIds.map((clusterId) => {
    const nodeIndex = clusterIndexById.get(clusterId) ?? 0;
    return [clusterId, nodeSets.find(nodeIndex)];
  }));

  let maxJoinGapMeters = 0;
  let joinedSegmentGapCount = 0;
  clusterMembers.forEach((memberIndexes) => {
    if (memberIndexes.length < 2) return;
    joinedSegmentGapCount += memberIndexes.length - 1;
    for (let left = 0; left < memberIndexes.length; left += 1) {
      for (let right = left + 1; right < memberIndexes.length; right += 1) {
        maxJoinGapMeters = Math.max(
          maxJoinGapMeters,
          distanceMeters(endpoints[memberIndexes[left]].point, endpoints[memberIndexes[right]].point),
        );
      }
    }
  });

  const componentCount = componentIds.length;
  const branchDetected = Array.from(clusterDegree.values()).some((degree) => degree > 2);
  const disjointSegmentGapCount = Math.max(0, componentCount - 1);
  const maxSegmentGapMeters = componentGapMeters(
    endpoints.map((endpoint, index) => ({
      point: endpoint.point,
      component: componentByClusterId.get(endpointClusterByIndex[index]) ?? 0,
    })),
    componentIds,
  );

  if (branchDetected) {
    return {
      status: 'preview_only',
      topologyResolved: false,
      sourceSegmentCount,
      componentCount,
      branchDetected,
      joinedSegmentGapCount,
      disjointSegmentGapCount,
      maxJoinGapMeters: roundedMeters(maxJoinGapMeters),
      maxSegmentGapMeters,
      unavailableReason: 'Active guidance is preview-only because this aggregate contains a branching source network. Select or curate one route path before active guidance.',
    };
  }

  if (componentCount > 1) {
    return {
      status: 'preview_only',
      topologyResolved: false,
      sourceSegmentCount,
      componentCount,
      branchDetected,
      joinedSegmentGapCount,
      disjointSegmentGapCount,
      maxJoinGapMeters: joinedSegmentGapCount > 0 ? roundedMeters(maxJoinGapMeters) : null,
      maxSegmentGapMeters,
      unavailableReason: 'Active guidance is preview-only because this aggregate contains disconnected source segments. ECS will show source geometry without inventing connectors.',
    };
  }

  return {
    status: 'ready',
    topologyResolved: true,
    sourceSegmentCount,
    componentCount,
    branchDetected,
    joinedSegmentGapCount,
    disjointSegmentGapCount,
    maxJoinGapMeters: roundedMeters(maxJoinGapMeters),
    maxSegmentGapMeters,
    unavailableReason: null,
  };
}

export function buildUsfsMvumWhereClause(
  forests: UsfsMvumForest[],
  options: { minMiles?: number } = {},
): string {
  const minMiles = Math.max(0, Number(options.minMiles ?? 1));
  const forestNames = forests.map((forest) => sqlString(forest.forestName)).join(',');
  return [
    `FORESTNAME in (${forestNames})`,
    `GIS_MILES >= ${Number(minMiles.toFixed(3))}`,
    "(HIGHCLEARA = 'open' OR FOURWD_GT5 = 'open' OR PASSENGERV = 'open' OR ATV = 'open' OR MOTORCYCLE = 'open')",
  ].join(' AND ');
}

export function normalizeUsfsMvumFeatureCollection(payload: unknown): UsfsMvumArcGisFeature[] {
  if (!payload || typeof payload !== 'object') return [];
  const features = (payload as { features?: unknown }).features;
  if (!Array.isArray(features)) return [];
  return features
    .filter((feature): feature is UsfsMvumArcGisFeature => !!feature && typeof feature === 'object')
    .map((feature) => ({
      attributes: feature.attributes && typeof feature.attributes === 'object'
        ? feature.attributes as Record<string, unknown>
        : {},
      geometry: feature.geometry && typeof feature.geometry === 'object'
        ? feature.geometry as UsfsMvumArcGisFeature['geometry']
        : undefined,
    }));
}

export function routeSourceUpsertForForest(forest: UsfsMvumForest) {
  return {
    provider_id: forest.sourceProviderId,
    name: forest.sourceName,
    source_type: 'federal_agency',
    authority: 'official_access',
    source_uri: forest.sourceUri,
    attribution: 'USDA Forest Service Motor Vehicle Use Maps',
    license: 'agency published terms',
    refresh_frequency: 'agency published schedule',
    status: 'active',
    last_checked_at: new Date().toISOString(),
  };
}

export function routeCurrentConditionSourceUpsertForForest(
  forest: UsfsMvumForest,
  source?: UsfsMvumCurrentConditionSource,
) {
  return {
    provider_id: source?.providerId ?? forest.currentConditionProviderId,
    name: source?.label ?? forest.currentConditionSourceName,
    source_type: 'federal_agency',
    authority: 'official_closure',
    source_uri: source?.sourceUrl ?? forest.currentConditionSourceUri,
    attribution: 'USDA Forest Service alerts, notices, and current conditions',
    license: 'agency published terms',
    refresh_frequency: 'current condition review before recommendation sync',
    status: 'active',
    last_checked_at: source?.checkedAt ?? new Date().toISOString(),
  };
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function readStringList(record: Record<string, unknown>, keys: string[]): string[] {
  return uniqueStrings(keys.flatMap((key) => {
    const value = record[key];
    if (Array.isArray(value)) return value.map((item) => cleanString(item));
    return [cleanString(value)];
  }));
}

function normalizeIsoString(value: unknown): string | null {
  const text = cleanString(value);
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function normalizeClosureStatus(value: unknown): UsfsMvumClosureStatus {
  const text = cleanString(value).toLowerCase();
  if (text === 'active' || text === 'open_closure' || text === 'closed') return 'active';
  if (text === 'scheduled' || text === 'planned') return 'scheduled';
  if (text === 'expired' || text === 'ended' || text === 'inactive') return 'expired';
  return 'unknown';
}

function normalizeClosureType(value: unknown): UsfsMvumClosureType {
  const text = cleanString(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (
    text === 'seasonal' ||
    text === 'emergency' ||
    text === 'fire' ||
    text === 'flood' ||
    text === 'maintenance' ||
    text === 'land_manager' ||
    text === 'permanent' ||
    text === 'unknown'
  ) {
    return text as UsfsMvumClosureType;
  }
  if (text === 'forest_order' || text === 'official_order' || text === 'administrative') return 'land_manager';
  return 'unknown';
}

function currentConditionInputs(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.map(readRecord).filter((record): record is Record<string, unknown> => !!record);
  }
  const record = readRecord(value);
  if (!record) return [];
  if (
    Array.isArray(record.closures) ||
    cleanString(record.forestSlug) ||
    cleanString(record.forest_slug) ||
    cleanString(record.forestName) ||
    cleanString(record.forest_name)
  ) {
    return [record];
  }
  return Object.entries(record)
    .map(([forestSlug, forestValue]) => {
      const sourceRecord = readRecord(forestValue);
      return sourceRecord ? { forestSlug, ...sourceRecord } : null;
    })
    .filter((sourceRecord): sourceRecord is Record<string, unknown> => !!sourceRecord);
}

function sourceForest(record: Record<string, unknown>, forests: UsfsMvumForest[]): UsfsMvumForest | null {
  const requested = [
    cleanString(record.forestSlug),
    cleanString(record.forest_slug),
    cleanString(record.forestName),
    cleanString(record.forest_name),
    cleanString(record.providerId),
    cleanString(record.provider_id),
  ].map((value) => value.toLowerCase()).filter(Boolean);
  if (requested.length === 0 && forests.length === 1) return forests[0];
  return forests.find((forest) =>
    requested.includes(forest.slug) ||
    requested.includes(forest.forestName.toLowerCase()) ||
    requested.includes(forest.currentConditionProviderId.toLowerCase()) ||
    requested.includes(forest.sourceProviderId.toLowerCase()),
  ) ?? null;
}

function normalizeCurrentConditionClosure(
  value: unknown,
  source: Pick<UsfsMvumCurrentConditionSource, 'sourceUrl' | 'checkedAt'>,
): UsfsMvumCurrentConditionClosure | null {
  const record = readRecord(value);
  if (!record) return null;
  const title = cleanString(record.title ?? record.name ?? record.forestOrder ?? record.forest_order);
  if (!title) return null;

  return {
    id: cleanString(record.id ?? record.providerClosureId ?? record.provider_closure_id) || undefined,
    title,
    summary: cleanString(record.summary ?? record.description ?? record.notice) || undefined,
    sourceUrl: cleanString(record.sourceUrl ?? record.source_url) || source.sourceUrl,
    forestOrder: cleanString(record.forestOrder ?? record.forest_order ?? record.orderNumber ?? record.order_number) || undefined,
    status: normalizeClosureStatus(record.status),
    closureType: normalizeClosureType(record.closureType ?? record.closure_type ?? record.type),
    startsAt: normalizeIsoString(record.startsAt ?? record.starts_at ?? record.startDate ?? record.start_date),
    endsAt: normalizeIsoString(record.endsAt ?? record.ends_at ?? record.endDate ?? record.end_date),
    lastVerifiedAt: normalizeIsoString(record.lastVerifiedAt ?? record.last_verified_at) ?? source.checkedAt,
    confidenceScore: clampNumber(Number(record.confidenceScore ?? record.confidence_score ?? 90), 0, 100),
    routePublicIds: readStringList(record, ['routePublicId', 'route_public_id', 'routePublicIds', 'route_public_ids']),
    segmentPublicIds: readStringList(record, ['segmentPublicId', 'segment_public_id', 'segmentPublicIds', 'segment_public_ids']),
    providerFeatureIds: readStringList(record, ['providerFeatureId', 'provider_feature_id', 'providerFeatureIds', 'provider_feature_ids']),
    routeIds: readStringList(record, ['routeId', 'route_id', 'routeIds', 'route_ids', 'routeNumber', 'route_number']),
    routeIdentityPatterns: readStringList(record, [
      'routeIdentity',
      'route_identity',
      'routeName',
      'route_name',
      'routeNamePattern',
      'route_name_pattern',
      'routeNameIncludes',
      'route_name_includes',
      'routeIdentityPatterns',
      'route_identity_patterns',
    ]),
  };
}

export function normalizeUsfsMvumCurrentConditionSources(
  value: unknown,
  forests = USFS_MVUM_PILOT_FORESTS,
  nowIso = new Date().toISOString(),
): UsfsMvumCurrentConditionSource[] {
  return currentConditionInputs(value)
    .map((record) => {
      const forest = sourceForest(record, forests);
      if (!forest) return null;
      const checkedAt = normalizeIsoString(record.checkedAt ?? record.checked_at ?? record.lastCheckedAt ?? record.last_checked_at) ?? nowIso;
      const source: UsfsMvumCurrentConditionSource = {
        forestSlug: forest.slug,
        forestName: forest.forestName,
        providerId: cleanString(record.providerId ?? record.provider_id) || forest.currentConditionProviderId,
        label: cleanString(record.label ?? record.name) || forest.currentConditionSourceName,
        sourceUrl: cleanString(record.sourceUrl ?? record.source_url) || forest.currentConditionSourceUri,
        referenceUrl: cleanString(record.referenceUrl ?? record.reference_url) || forest.currentConditionReferenceUri,
        checkedAt,
        staleAt: normalizeIsoString(record.staleAt ?? record.stale_at) ?? addDaysIso(checkedAt, 7),
        closures: [],
      };
      const closures = Array.isArray(record.closures) ? record.closures : [];
      source.closures = closures
        .map((closure) => normalizeCurrentConditionClosure(closure, source))
        .filter((closure): closure is UsfsMvumCurrentConditionClosure => !!closure);
      return source;
    })
    .filter((source): source is UsfsMvumCurrentConditionSource => !!source);
}

function normalizedText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function routeIdAliases(routeId: string): string[] {
  const cleanRouteId = cleanString(routeId);
  const aliases = [cleanRouteId];
  if (/^\d{1,2}$/.test(cleanRouteId)) aliases.push(`853${cleanRouteId.padStart(2, '0')}`);
  return uniqueStrings(aliases);
}

function metadataValues(value: unknown, keys: string[]): string[] {
  const record = readRecord(value);
  if (!record) return [];
  return readStringList(record, keys);
}

function routeMatchValues(target: UsfsMvumRouteUpsert | UsfsMvumAggregateRouteUpsert): string[] {
  const route = target.verifiedRoute;
  const sourceMetadata = readRecord(target.verifiedRouteSource.metadata);
  const communitySignal = readRecord(route.community_signal);
  return uniqueStrings([
    cleanString(route.public_id),
    cleanString(route.name),
    ...(Array.isArray(route.tags) ? route.tags.map((tag) => cleanString(tag)) : []),
    ...(Array.isArray(target.segmentPublicIds) ? target.segmentPublicIds.map((id) => cleanString(id)) : []),
    ...(Array.isArray(target.segmentProviderFeatureIds) ? target.segmentProviderFeatureIds.map((id) => cleanString(id)) : []),
    ...metadataValues(sourceMetadata, ['providerFeatureId', 'providerFeatureIds', 'segmentPublicIds']),
    ...metadataValues(communitySignal, ['segmentPublicIds', 'providerFeatureIds']),
  ]);
}

function anyExactMatch(candidates: string[], needles: string[]): boolean {
  const candidateSet = new Set(candidates.map((candidate) => candidate.toLowerCase()));
  return needles.some((needle) => candidateSet.has(needle.toLowerCase()));
}

function anyTextMatch(candidates: string[], needles: string[]): boolean {
  const normalizedCandidates = candidates.map(normalizedText).filter(Boolean);
  return needles.some((needle) => {
    const normalizedNeedle = normalizedText(needle);
    if (normalizedNeedle.length < 2) return false;
    const slugNeedle = slugify(needle).replace(/-/g, ' ');
    return normalizedCandidates.some((candidate) =>
      candidate === normalizedNeedle ||
      candidate.includes(normalizedNeedle) ||
      (slugNeedle.length >= 2 && candidate.includes(slugNeedle)),
    );
  });
}

function closureMatchesRoute(
  closure: UsfsMvumCurrentConditionClosure,
  target: UsfsMvumRouteUpsert | UsfsMvumAggregateRouteUpsert,
): boolean {
  const candidates = routeMatchValues(target);
  if (anyExactMatch(candidates, closure.routePublicIds)) return true;
  if (anyExactMatch(candidates, closure.segmentPublicIds)) return true;
  if (anyExactMatch(candidates, closure.providerFeatureIds)) return true;
  if (anyTextMatch(candidates, closure.routeIdentityPatterns)) return true;
  return closure.routeIds.some((routeId) => anyTextMatch(candidates, routeIdAliases(routeId)));
}

function closureIsActive(closure: UsfsMvumCurrentConditionClosure, checkedAt: string): boolean {
  if (closure.status !== 'active') return false;
  const checkedTime = Date.parse(checkedAt);
  const endTime = closure.endsAt ? Date.parse(closure.endsAt) : Number.NaN;
  return !(Number.isFinite(checkedTime) && Number.isFinite(endTime) && endTime < checkedTime);
}

function closureSummary(source: UsfsMvumCurrentConditionSource, closure: UsfsMvumCurrentConditionClosure): string {
  return [
    closure.title,
    closure.summary,
    closure.forestOrder ? `Forest Order ${closure.forestOrder}` : '',
    source.label,
    closure.sourceUrl,
  ].filter(Boolean).join(' | ');
}

export function applyUsfsMvumCurrentConditionSources<T extends UsfsMvumRouteUpsert | UsfsMvumAggregateRouteUpsert>(
  target: T,
  sources: UsfsMvumCurrentConditionSource[] = [],
): T {
  const routeTags = Array.isArray(target.verifiedRoute.tags) ? target.verifiedRoute.tags.map((tag) => cleanString(tag)) : [];
  const primaryRouteTag = routeTags[0] ?? '';
  const matchValues = routeMatchValues(target);
  const relevantSources = sources.filter((source) =>
    cleanString(source.forestSlug).toLowerCase() === primaryRouteTag.toLowerCase() ||
    cleanString(source.forestName).toLowerCase() === primaryRouteTag.toLowerCase() ||
    matchValues.some((value) => normalizedText(value).includes(normalizedText(source.forestName))),
  );
  if (relevantSources.length === 0) return target;

  const matched = relevantSources.flatMap((source) =>
    source.closures
      .filter((closure) => closureMatchesRoute(closure, target))
      .map((closure) => ({ source, closure })),
  );
  if (matched.length === 0) return target;

  const activeMatches = matched.filter(({ source, closure }) => closureIsActive(closure, source.checkedAt));
  const watchMatches = matched.filter(({ source, closure }) => !closureIsActive(closure, source.checkedAt));
  const existingActiveClosureCount = Number(target.verifiedRoute.active_closure_count ?? 0);
  const conditionSummary = {
    sourceCount: relevantSources.length,
    matchedClosureCount: matched.length,
    activeClosureCount: activeMatches.length,
    watchClosureCount: watchMatches.length,
    checkedAt: uniqueStrings(relevantSources.map((source) => source.checkedAt)),
    staleAt: uniqueStrings(relevantSources.map((source) => source.staleAt)),
    caveat: ROUTE_CATALOG_CURRENT_CONDITION_CAVEAT,
  };
  const existingCommunitySignal = readRecord(target.verifiedRoute.community_signal) ?? {};
  const existingMetadata = readRecord(target.verifiedRouteSource.metadata) ?? {};
  const baseWarnings = Array.isArray(target.verifiedRoute.warning_reasons)
    ? target.verifiedRoute.warning_reasons.map((warning) => cleanString(warning))
    : [];
  const baseBlockers = Array.isArray(target.verifiedRoute.blocker_reasons)
    ? target.verifiedRoute.blocker_reasons.map((blocker) => cleanString(blocker))
    : [];
  const baseClosures = Array.isArray(target.verifiedRoute.closure_summaries)
    ? target.verifiedRoute.closure_summaries.map((summary) => cleanString(summary))
    : [];

  const verifiedRoute = {
    ...target.verifiedRoute,
    active_closure_count: existingActiveClosureCount + activeMatches.length,
    warning_reasons: uniqueStrings([
      ...baseWarnings,
      ...matched.map(({ source }) => `Official current-condition source checked: ${source.label} at ${source.checkedAt}.`),
      ...watchMatches.map(({ closure }) => `Official current-condition notice requires review: ${closure.title}.`),
    ]),
    blocker_reasons: uniqueStrings([
      ...baseBlockers,
      ...activeMatches.map(({ closure }) => `Active official closure: ${closure.title}.`),
    ]),
    closure_summaries: uniqueStrings([
      ...baseClosures,
      ...matched.map(({ source, closure }) => closureSummary(source, closure)),
    ]),
    community_signal: {
      ...existingCommunitySignal,
      currentConditions: conditionSummary,
    },
  };

  if (activeMatches.length > 0) {
    verifiedRoute.recommendation_status = 'not_recommended';
    verifiedRoute.verification_status = 'not_recommended';
    verifiedRoute.confidence_score = Math.min(Number(verifiedRoute.confidence_score ?? 0), 74);
  }

  return {
    ...target,
    verifiedRoute,
    verifiedRouteSource: {
      ...target.verifiedRouteSource,
      metadata: {
        ...existingMetadata,
        currentConditions: conditionSummary,
      },
    },
  };
}

export function arcGisFeatureToVerifiedRouteUpsert(
  feature: UsfsMvumArcGisFeature,
  context: UsfsMvumRouteContext,
) {
  const attributes = feature.attributes ?? {};
  const distanceMiles = cleanNumber(attributes.GIS_MILES ?? attributes.SEG_LENGTH);
  const minMiles = Math.max(0, Number(context.minMiles ?? 1));
  if (distanceMiles == null || distanceMiles < minMiles) return null;

  const paths = normalizePaths(feature);
  const routeGeometry = routeGeometryFromPaths(paths);
  const center = centerFromPaths(paths);
  if (!routeGeometry || !center) return null;

  const vehicleFit = orderedVehicleFit(vehicleFitFromAttributes(attributes));
  if (vehicleFit.length === 0) return null;

  const id = cleanString(attributes.ID || attributes.FIELD_ID || attributes.RTE_CN);
  const providerId = providerFeatureId(context.layer, attributes);
  const featureKey = sourceFeatureKey(attributes);
  const name = routeName(context.layer, attributes);
  const publicRecommendation = context.publicRecommendation !== false;
  const publicId = slugify([
    'usfs-mvum',
    context.forest.slug,
    context.layer.kind,
    id,
    cleanString(attributes.NAME),
    `feature ${featureKey}`,
  ].filter(Boolean).join(' '));
  const forestTag = context.forest.forestName;
  const district = cleanString(attributes.DISTRICTNA);
  const estimatedDurationMinutes = Math.max(20, Math.round(distanceMiles * 18));

  const verifiedRoute = {
    public_id: publicId,
    name,
    description: `${context.forest.forestName} ${context.layer.sourceLayer} record from USFS MVUM. ECS treats this as official motorized-access geometry, not current passability.`,
    route_type: 'point_to_point',
    center_latitude: center.latitude,
    center_longitude: center.longitude,
    route_geometry: routeGeometry,
    distance_miles: Number(distanceMiles.toFixed(3)),
    estimated_duration_minutes: estimatedDurationMinutes,
    difficulty: 'unknown',
    vehicle_fit: vehicleFit,
    remoteness_score: estimateMvumRemotenessScore(distanceMiles),
    campability_score: null,
    minimum_fuel_range_miles: estimateMinimumFuelRangeMiles(distanceMiles),
    minimum_water_capacity_gallons: estimateMinimumWaterCapacityGallons(estimatedDurationMinutes),
    route_intelligence: mvumRouteIntelligence({
      distanceMiles,
      estimatedDurationMinutes,
      sourceFeatureCount: 1,
    }),
    official_access_coverage_pct: 100,
    unknown_access_coverage_pct: 0,
    restricted_access_coverage_pct: 0,
    active_closure_count: 0,
    seasonal_restriction_count: cleanString(attributes.SEASONAL) ? 1 : 0,
    vehicle_mismatch: false,
    geometry_quality: 'good',
    verification_status: 'official_verified',
    recommendation_status: publicRecommendation ? 'recommendable' : 'not_recommended',
    review_status: 'approved',
    confidence_score: 92,
    confidence_reasons: [
      `USFS MVUM designates this ${context.layer.kind} for listed motorized vehicle classes.`,
      `Official MVUM source: ${context.forest.forestName}.`,
    ],
    warning_reasons: [
      ROUTE_CATALOG_MVUM_WARNING,
      ...(!publicRecommendation ? ['Source segment retained for traceability; ECS recommends the named aggregate route record when available.'] : []),
      ...(cleanString(attributes.SEASONAL) ? ['Seasonal designation requires trip-date review against the current MVUM.'] : []),
    ],
    blocker_reasons: [],
    closure_summaries: [],
    community_signal: {},
    tags: [forestTag, 'USFS MVUM', context.layer.kind, district, ...(!publicRecommendation ? ['source segment'] : [])].filter(Boolean),
    last_verified_at: context.sourceLastVerifiedAt,
    stale_at: addDaysIso(context.sourceLastVerifiedAt, 180),
  };

  const rawSourceFeature = {
    route_source_id: context.sourceId,
    ingest_run_id: context.ingestRunId ?? null,
    provider_feature_id: providerId,
    source_layer: context.layer.sourceLayer,
    source_uri: context.layer.url,
    payload_hash: stablePayloadHash(feature),
    geometry: null,
    properties: {
      attributes,
      geometry: routeGeometry,
      forest: context.forest.forestName,
      routeCatalogPublicId: publicId,
    },
    last_seen_at: context.sourceLastVerifiedAt,
  };

  const verifiedRouteSource = {
    route_source_id: context.sourceId,
    source_role: 'primary',
    coverage_pct: 100,
    last_verified_at: context.sourceLastVerifiedAt,
    metadata: {
      providerFeatureId: providerId,
      sourceLayer: context.layer.sourceLayer,
      forest: context.forest.forestName,
      mvumStatus: cleanString(attributes[context.layer.statusField]),
      caveat: ROUTE_CATALOG_MVUM_WARNING,
    },
  };

  return {
    verifiedRoute,
    verifiedRouteSource,
    rawSourceFeature,
  };
}

export function aggregateUsfsMvumRouteFeatures(
  features: UsfsMvumArcGisFeature[],
  context: UsfsMvumRouteContext,
): UsfsMvumAggregateRouteUpsert[] {
  const groups = new Map<string, {
    identity: NonNullable<ReturnType<typeof aggregationIdentity>>;
    segments: UsfsMvumRouteUpsert[];
  }>();

  for (const feature of features) {
    const attributes = feature.attributes ?? {};
    const identity = aggregationIdentity(context.layer, attributes);
    if (!identity) continue;

    const segment = arcGisFeatureToVerifiedRouteUpsert(feature, {
      ...context,
      publicRecommendation: false,
    });
    if (!segment) continue;

    const key = `${context.forest.slug}:${identity.key}`;
    const existing = groups.get(key);
    if (existing) {
      existing.segments.push(segment);
    } else {
      groups.set(key, { identity, segments: [segment] });
    }
  }

  return Array.from(groups.values()).map(({ identity, segments }) => {
    const segmentPublicIds = segments.map((segment) => String(segment.verifiedRoute.public_id));
    const segmentProviderFeatureIds = segments.map((segment) => String(segment.rawSourceFeature.provider_feature_id));
    const lines = segments.flatMap((segment) =>
      lineStringsFromRouteGeometry(segment.verifiedRoute.route_geometry as Record<string, unknown>),
    );
    const activeGuidance = assessUsfsMvumAggregateTopology(lines);
    const center = centerFromPaths(lines);
    const distanceMiles = Number(segments.reduce((total, segment) => total + Number(segment.verifiedRoute.distance_miles ?? 0), 0).toFixed(3));
    const estimatedDurationMinutes = Math.max(20, Math.round(distanceMiles * 18));
    const districtTags = uniqueStrings(segments.flatMap((segment) =>
      Array.isArray(segment.verifiedRoute.tags) ? segment.verifiedRoute.tags.map(String) : [],
    ).filter((tag) => tag !== context.forest.forestName && tag !== 'USFS MVUM' && tag !== context.layer.kind && tag !== 'source segment'));
    const seasonalRestrictionCount = segments.reduce(
      (count, segment) => count + Number(segment.verifiedRoute.seasonal_restriction_count ?? 0),
      0,
    );
    const vehicleFit = orderedVehicleFit(segments.flatMap((segment) =>
      Array.isArray(segment.verifiedRoute.vehicle_fit) ? segment.verifiedRoute.vehicle_fit.map(String) : [],
    ));
    const warningReasons = [
      ROUTE_CATALOG_MVUM_WARNING,
      'Source-segment aggregate: ECS combines MVUM features with the same route identity without inventing connector geometry.',
      ...(activeGuidance.unavailableReason ? [activeGuidance.unavailableReason] : []),
      ...(seasonalRestrictionCount > 0 ? ['One or more source segments has a seasonal designation that requires trip-date review against the current MVUM.'] : []),
    ];
    const publicId = slugify([
      'usfs-mvum',
      context.forest.slug,
      ...identity.publicIdParts.slice(1),
    ].filter(Boolean).join(' '));
    const sourceFeatureCount = segments.length;

    return {
      verifiedRoute: {
        public_id: publicId,
        name: routeName(context.layer, segments[0].rawSourceFeature.properties.attributes as Record<string, unknown>),
        description: `${context.forest.forestName} ${context.layer.sourceLayer} aggregate built from ${sourceFeatureCount} USFS MVUM source segment${sourceFeatureCount === 1 ? '' : 's'}. ECS treats this as official motorized-access geometry, not current passability.`,
        route_type: 'point_to_point',
        center_latitude: center?.latitude ?? Number(segments[0].verifiedRoute.center_latitude),
        center_longitude: center?.longitude ?? Number(segments[0].verifiedRoute.center_longitude),
        route_geometry: lines.length === 1
          ? { type: 'LineString', coordinates: lines[0] }
          : { type: 'MultiLineString', coordinates: lines },
        distance_miles: distanceMiles,
        estimated_duration_minutes: estimatedDurationMinutes,
        difficulty: 'unknown',
        vehicle_fit: vehicleFit,
        remoteness_score: estimateMvumRemotenessScore(distanceMiles, sourceFeatureCount),
        campability_score: null,
        minimum_fuel_range_miles: estimateMinimumFuelRangeMiles(distanceMiles),
        minimum_water_capacity_gallons: estimateMinimumWaterCapacityGallons(estimatedDurationMinutes),
        route_intelligence: mvumRouteIntelligence({
          distanceMiles,
          estimatedDurationMinutes,
          sourceFeatureCount,
          activeGuidance,
        }),
        official_access_coverage_pct: 100,
        unknown_access_coverage_pct: 0,
        restricted_access_coverage_pct: 0,
        active_closure_count: 0,
        seasonal_restriction_count: seasonalRestrictionCount,
        vehicle_mismatch: false,
        geometry_quality: sourceFeatureCount > 1 ? 'partial' : 'good',
        verification_status: 'official_verified',
        recommendation_status: 'recommendable',
        review_status: 'approved',
        confidence_score: sourceFeatureCount > 1 ? 90 : 92,
        confidence_reasons: [
          `USFS MVUM designates this ${context.layer.kind} identity for listed motorized vehicle classes.`,
          `Combined ${sourceFeatureCount} MVUM source segment${sourceFeatureCount === 1 ? '' : 's'} with matching route identity.`,
          ...(activeGuidance.status === 'ready' ? ['Active guidance topology resolved from official source segment endpoints.'] : []),
          `Official MVUM source: ${context.forest.forestName}.`,
        ],
        warning_reasons: warningReasons,
        blocker_reasons: [],
        closure_summaries: [],
        community_signal: {
          aggregation: 'usfs_mvum_route_identity',
          activeGuidance,
          sourceFeatureCount,
          segmentPublicIds,
          providerFeatureIds: segmentProviderFeatureIds,
        },
        tags: uniqueStrings([
          context.forest.forestName,
          'USFS MVUM',
          context.layer.kind,
          'source-segment aggregate',
          ...districtTags,
        ]),
        last_verified_at: context.sourceLastVerifiedAt,
        stale_at: addDaysIso(context.sourceLastVerifiedAt, 180),
      },
      verifiedRouteSource: {
        route_source_id: context.sourceId,
        source_role: 'primary',
        coverage_pct: 100,
        last_verified_at: context.sourceLastVerifiedAt,
        metadata: {
          providerFeatureIds: segmentProviderFeatureIds,
          segmentPublicIds,
          sourceFeatureCount,
          sourceLayer: context.layer.sourceLayer,
          forest: context.forest.forestName,
          aggregation: 'usfs_mvum_route_identity',
          activeGuidance,
          caveat: ROUTE_CATALOG_MVUM_WARNING,
        },
      },
      segmentPublicIds,
      segmentProviderFeatureIds,
    };
  });
}
