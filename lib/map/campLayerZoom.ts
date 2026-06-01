import type { CampLayerFetchLayer } from './campLayerFetchScheduler';

export const ESTABLISHED_CAMPSITES_MIN_ZOOM = 8;
export const DISPERSED_CAMPING_ELIGIBILITY_MIN_ZOOM = 9;

export function getCampLayerMinZoom(layer: CampLayerFetchLayer): number {
  return layer === 'dispersed_camping'
    ? DISPERSED_CAMPING_ELIGIBILITY_MIN_ZOOM
    : ESTABLISHED_CAMPSITES_MIN_ZOOM;
}

export function isCampLayerZoomEligible(layer: CampLayerFetchLayer, zoom: unknown): boolean {
  return typeof zoom === 'number' && Number.isFinite(zoom) && zoom >= getCampLayerMinZoom(layer);
}

export function getCampLayerZoomPrompt(layer: CampLayerFetchLayer): string {
  return layer === 'dispersed_camping'
    ? `Zoom to ${DISPERSED_CAMPING_ELIGIBILITY_MIN_ZOOM}+ to load dispersed camping eligibility.`
    : `Zoom to ${ESTABLISHED_CAMPSITES_MIN_ZOOM}+ to load established campgrounds.`;
}
