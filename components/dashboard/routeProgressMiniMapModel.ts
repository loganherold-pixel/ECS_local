import {
  pointsToLineStringFeature,
  type MiniMapCoordinate,
} from './routeGeometryUtils';

export type RouteProgressFeature = ReturnType<typeof pointsToLineStringFeature>;

export function buildRouteProgressFeatureFromPoints(points: MiniMapCoordinate[]): RouteProgressFeature {
  return pointsToLineStringFeature(points);
}
