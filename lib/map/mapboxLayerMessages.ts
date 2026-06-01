import type {
  DispersedCampingEligibilityFeatureCollection,
  DispersedCampingRegionSelectionPayload,
} from './dispersedCampingTypes';
import type {
  EstablishedCampsiteFeatureCollection,
  EstablishedCampsiteSelectionPayload,
} from './establishedCampsiteTypes';
import type { DispersedRouteLegSelectionPayload } from './dispersedCampingSegmentBuild';

export const SET_DISPERSED_CAMPING_LAYER_ENABLED = 'SET_DISPERSED_CAMPING_LAYER_ENABLED' as const;
export const DISPERSED_CAMPING_REGION_SELECTED = 'DISPERSED_CAMPING_REGION_SELECTED' as const;
export const SET_DISPERSED_ROUTE_BUILD_ENABLED = 'SET_DISPERSED_ROUTE_BUILD_ENABLED' as const;
export const DISPERSED_ROUTE_LEG_SELECTED = 'DISPERSED_ROUTE_LEG_SELECTED' as const;
export const SET_ESTABLISHED_CAMPSITES_LAYER_ENABLED = 'SET_ESTABLISHED_CAMPSITES_LAYER_ENABLED' as const;
export const ESTABLISHED_CAMPSITE_SELECTED = 'ESTABLISHED_CAMPSITE_SELECTED' as const;

export type SetDispersedCampingLayerEnabledMessage = {
  type: typeof SET_DISPERSED_CAMPING_LAYER_ENABLED;
  payload: {
    enabled: boolean;
    geojson?: DispersedCampingEligibilityFeatureCollection;
  };
};

export type DispersedCampingRegionSelectedMessage = {
  type: typeof DISPERSED_CAMPING_REGION_SELECTED;
  payload: DispersedCampingRegionSelectionPayload;
};

export type SetDispersedRouteBuildEnabledMessage = {
  type: typeof SET_DISPERSED_ROUTE_BUILD_ENABLED;
  payload: {
    enabled: boolean;
    selectedSegmentIds?: string[];
    renderKey?: string | number;
  };
};

export type DispersedRouteLegSelectedMessage = {
  type: typeof DISPERSED_ROUTE_LEG_SELECTED;
  payload: DispersedRouteLegSelectionPayload;
};

export type SetEstablishedCampsitesLayerEnabledMessage = {
  type: typeof SET_ESTABLISHED_CAMPSITES_LAYER_ENABLED;
  payload: {
    enabled: boolean;
    geojson?: EstablishedCampsiteFeatureCollection;
  };
};

export type EstablishedCampsiteSelectedMessage = {
  type: typeof ESTABLISHED_CAMPSITE_SELECTED;
  payload: EstablishedCampsiteSelectionPayload;
};
