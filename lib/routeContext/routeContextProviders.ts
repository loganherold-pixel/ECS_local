import type {
  BailoutCandidate,
  CampCandidate,
  RouteContextCoordinate,
  RouteContextProviderMetadata,
  RouteGeometry,
  SupplyCandidate,
  SupplyMode,
  TrailheadAnchor,
} from './routeContextTypes';
import type { TrailheadResolverInput } from './trailheadResolver';

export type RouteContextTrailInput = TrailheadResolverInput & {
  id: string;
  tripId?: string | null;
  userId?: string | null;
  origin?: RouteContextCoordinate | null;
  routeMetadata?: RouteContextProviderMetadata | null;
};

export type SupplyCandidateRequest = {
  trailId: string;
  trailheadAnchor: TrailheadAnchor;
  mode: SupplyMode;
  origin?: RouteContextCoordinate | null;
  trailheadAnchoredSupplyChain?: boolean | null;
  selectedRefuelCandidateId?: string | null;
  selectedResupplyCandidateId?: string | null;
  selectedSupplyCandidateIds?: string[] | null;
};

export type RouteGeometryRequest = {
  trailId: string;
  origin?: RouteContextCoordinate | null;
  trailheadAnchor: TrailheadAnchor;
  destination?: RouteContextCoordinate | null;
  routeCoordinates?: RouteContextCoordinate[] | null;
};

export type CampCandidateRequest = {
  trailId: string;
  trailheadAnchor: TrailheadAnchor;
  routeGeometry: RouteGeometry | null;
  tripDate?: string | null;
  preferences?: Record<string, unknown> | null;
};

export type BailoutCandidateRequest = {
  trailId: string;
  trailheadAnchor: TrailheadAnchor;
  routeGeometry: RouteGeometry | null;
  trailGeometry?: RouteContextCoordinate[] | null;
  existingPoiData?: unknown[] | null;
};

export interface RouteContextSupplyProvider {
  id: string;
  findSupplyCandidates(request: SupplyCandidateRequest): Promise<SupplyCandidate[]>;
}

export interface RouteContextGeometryProvider {
  id: string;
  buildRouteGeometry(request: RouteGeometryRequest): Promise<RouteGeometry | null>;
}

export interface RouteContextCampProvider {
  id: string;
  findCampCandidates(request: CampCandidateRequest): Promise<CampCandidate[]>;
}

export interface RouteContextBailoutProvider {
  id: string;
  findBailoutCandidates(request: BailoutCandidateRequest): Promise<BailoutCandidate[]>;
}

export type RouteContextProviderBundle = {
  supplyProvider?: RouteContextSupplyProvider | null;
  geometryProvider?: RouteContextGeometryProvider | null;
  campProvider?: RouteContextCampProvider | null;
  bailoutProvider?: RouteContextBailoutProvider | null;
};
