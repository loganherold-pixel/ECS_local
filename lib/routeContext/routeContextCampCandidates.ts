import {
  ROUTE_CONTEXT_CAMP_CANDIDATE_CORRIDOR_METERS,
  ROUTE_CONTEXT_CAMP_CANDIDATE_LIMIT,
} from './routeContextConfig';
import {
  estimateDistanceFromRouteMeters,
  haversineDistanceMeters,
  normalizeRouteGeometryCoordinate,
} from './routeContextGeometry';
import type {
  CampCandidateRequest,
  RouteContextCampProvider,
} from './routeContextProviders';
import type {
  CampCandidate,
  Confidence,
  RouteContextCoordinate,
  RouteContextProviderMetadata,
  RouteContextWarning,
  RouteGeometry,
  TrailheadAnchor,
} from './routeContextTypes';
import { clampConfidence } from './routeContextTypes';

export type CampCandidateAccessStatus = NonNullable<CampCandidate['accessStatus']>;
export type CampCandidateLegalStatus = NonNullable<CampCandidate['legalStatus']>;

export type CampCandidateSearchInput = {
  routeGeometry: RouteGeometry | null;
  trailheadAnchor: TrailheadAnchor;
  corridor?: RouteGeometry['corridor'] | null;
  tripDate?: string | null;
  preferences?: Record<string, unknown> | null;
  limit?: number | null;
  providerMetadata?: RouteContextProviderMetadata | null;
};

export type CampCandidateProviderResult = {
  id?: string | null;
  providerCampId?: string | null;
  name?: string | null;
  coordinate?: unknown;
  location?: unknown;
  lat?: number | null;
  lng?: number | null;
  source?: string | null;
  accessStatus?: string | null;
  legalStatus?: string | null;
  restrictionStatus?: string | null;
  confidence?: number | Confidence | null;
  score?: number | null;
  providerMetadata?: RouteContextProviderMetadata | null;
};

export interface CampCandidateProviderAdapter {
  id: string;
  searchCampCandidates(input: CampCandidateSearchInput): Promise<CampCandidateProviderResult[]>;
  isAvailable(): boolean;
}

export type CampCandidateServiceInput = CampCandidateSearchInput & {
  provider?: CampCandidateProviderAdapter | null;
  candidates?: CampCandidateProviderResult[] | null;
};

export type CampCandidateServiceResult = {
  candidates: CampCandidate[];
  warnings: RouteContextWarning[];
};

function warning(
  code: RouteContextWarning['code'],
  message: string,
  severity: RouteContextWarning['severity'] = 'watch',
  source?: string | null,
): RouteContextWarning {
  return { code, message, severity, source };
}

function confidence(value: number, reasons: string[]): Confidence {
  return { value: clampConfidence(value), reasons };
}

function finitePositiveNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function candidateCoordinate(candidate: CampCandidateProviderResult): RouteContextCoordinate | null {
  return normalizeRouteGeometryCoordinate(
    candidate.coordinate ??
      candidate.location ??
      (
        candidate.lat != null && candidate.lng != null
          ? { lat: candidate.lat, lng: candidate.lng }
          : null
      ),
  );
}

function normalizeAccessStatus(value: unknown): CampCandidateAccessStatus {
  if (value == null || value === '') return 'unknown';
  const text = String(value).toLowerCase();
  if (text.includes('closed')) return 'closed';
  if (text.includes('restricted') || text.includes('limited')) return 'restricted';
  if (text === 'open' || text.includes('open')) return 'open';
  return 'unknown';
}

function normalizeLegalStatus(value: unknown): CampCandidateLegalStatus {
  if (value == null || value === '') return 'unknown';
  const text = String(value).toLowerCase();
  if (text.includes('not_allowed') || text.includes('not allowed') || text.includes('prohibited') || text.includes('illegal')) {
    return 'not_allowed';
  }
  if (text.includes('permit')) return 'permit_required';
  if (text.includes('restricted') || text.includes('limited')) return 'restricted';
  if (text.includes('allowed') || text.includes('legal') || text.includes('designated')) return 'explicitly_allowed';
  return 'unknown';
}

function providerConfidence(input: CampCandidateProviderResult): Confidence {
  if (typeof input.confidence === 'object' && input.confidence && Number.isFinite(input.confidence.value)) {
    return {
      value: clampConfidence(input.confidence.value),
      reasons: [...input.confidence.reasons],
    };
  }
  const value = finitePositiveNumber(input.confidence);
  if (value != null) return confidence(value, ['Provider supplied normalized camp confidence.']);
  return confidence(0.52, ['ECS normalized camp candidate provider output.']);
}

function distanceScore(distanceMeters?: number | null): number {
  if (distanceMeters == null) return 0.45;
  if (distanceMeters <= 800) return 1;
  if (distanceMeters <= 2_500) return 0.86;
  if (distanceMeters <= 8_000) return 0.64;
  if (distanceMeters <= 20_000) return 0.38;
  return 0.16;
}

function trailheadDistanceScore(distanceMeters?: number | null): number {
  if (distanceMeters == null) return 0.52;
  if (distanceMeters <= 5_000) return 0.68;
  if (distanceMeters <= 25_000) return 1;
  if (distanceMeters <= 75_000) return 0.76;
  return 0.34;
}

function accessScore(status: CampCandidateAccessStatus): number {
  if (status === 'open') return 0.9;
  if (status === 'restricted') return 0.48;
  if (status === 'closed') return 0.05;
  return 0.44;
}

function legalScore(status: CampCandidateLegalStatus): number {
  if (status === 'explicitly_allowed') return 0.95;
  if (status === 'permit_required') return 0.68;
  if (status === 'restricted') return 0.42;
  if (status === 'not_allowed') return 0.02;
  return 0.36;
}

function scoreCampCandidate(args: {
  distanceFromRouteMeters: number | null;
  distanceFromTrailheadMeters: number | null;
  accessStatus: CampCandidateAccessStatus;
  legalStatus: CampCandidateLegalStatus;
  confidence: Confidence;
  providerScore?: number | null;
}): number {
  const providerScore = finitePositiveNumber(args.providerScore);
  return clampConfidence(
    distanceScore(args.distanceFromRouteMeters) * 0.28 +
      trailheadDistanceScore(args.distanceFromTrailheadMeters) * 0.14 +
      args.confidence.value * 0.18 +
      accessScore(args.accessStatus) * 0.16 +
      legalScore(args.legalStatus) * 0.2 +
      (providerScore ?? 0.55) * 0.04,
  );
}

function candidateWarnings(args: {
  accessStatus: CampCandidateAccessStatus;
  legalStatus: CampCandidateLegalStatus;
  restrictionStatus?: string | null;
  source?: string | null;
}): RouteContextWarning[] {
  const warnings: RouteContextWarning[] = [];
  if (args.accessStatus === 'unknown') {
    warnings.push(warning('unknown_camp_access', 'Camp candidate access status is unknown and must be verified before use.', 'watch', args.source));
  }
  if (args.legalStatus === 'unknown') {
    warnings.push(warning('unknown_camp_legal_status', 'Camp candidate legal status is unknown and must be verified before use.', 'caution', args.source));
  }
  if (!args.restrictionStatus) {
    warnings.push(warning('unknown_camp_restrictions', 'Camp restrictions or seasonal closures are unknown.', 'watch', args.source));
  }
  return warnings;
}

function normalizeCampCandidate(args: {
  input: CampCandidateProviderResult;
  routeGeometry: RouteGeometry | null;
  trailheadAnchor: TrailheadAnchor;
  providerId?: string | null;
}): CampCandidate | null {
  const coordinate = candidateCoordinate(args.input);
  if (!coordinate) return null;
  const routeCoordinates = args.routeGeometry?.coordinates ?? [];
  const distanceFromRouteMeters = routeCoordinates.length >= 2
    ? estimateDistanceFromRouteMeters(coordinate, routeCoordinates)
    : null;
  const distanceFromTrailheadMeters = haversineDistanceMeters(args.trailheadAnchor, coordinate);
  const accessStatus = normalizeAccessStatus(args.input.accessStatus);
  const legalStatus = normalizeLegalStatus(args.input.legalStatus);
  const candidateConfidence = providerConfidence(args.input);
  const source = args.input.source ?? args.providerId ?? 'route_context_camp_provider';
  const score = scoreCampCandidate({
    distanceFromRouteMeters,
    distanceFromTrailheadMeters,
    accessStatus,
    legalStatus,
    confidence: candidateConfidence,
    providerScore: args.input.score,
  });
  const providerCampId = args.input.providerCampId ?? args.input.id ?? null;
  return {
    id: String(args.input.id ?? providerCampId ?? `${source}:${coordinate.lat.toFixed(5)},${coordinate.lng.toFixed(5)}`),
    name: args.input.name ?? null,
    lat: coordinate.lat,
    lng: coordinate.lng,
    source,
    distanceFromRouteMeters: distanceFromRouteMeters == null ? null : Math.round(distanceFromRouteMeters),
    distanceFromTrailheadMeters: distanceFromTrailheadMeters == null ? null : Math.round(distanceFromTrailheadMeters),
    accessStatus,
    legalStatus,
    restrictionStatus: args.input.restrictionStatus ?? null,
    score,
    confidence: candidateConfidence,
    warnings: candidateWarnings({
      accessStatus,
      legalStatus,
      restrictionStatus: args.input.restrictionStatus ?? null,
      source,
    }),
    providerMetadata: {
      providerId: args.providerId ?? null,
      providerCampId: providerCampId == null ? null : String(providerCampId),
      providerMetadata: args.input.providerMetadata ?? null,
    },
  };
}

function dedupeCampCandidates(candidates: CampCandidate[]): CampCandidate[] {
  const seen = new Set<string>();
  const unique: CampCandidate[] = [];
  candidates.forEach((candidate) => {
    const key = candidate.providerMetadata?.providerCampId
      ? `provider:${candidate.providerMetadata.providerCampId}`
      : `${candidate.name ?? 'camp'}:${candidate.lat.toFixed(5)},${candidate.lng.toFixed(5)}`;
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(candidate);
  });
  return unique;
}

export async function findCampCandidates(input: CampCandidateServiceInput): Promise<CampCandidateServiceResult> {
  const warnings: RouteContextWarning[] = [];
  if (!input.routeGeometry?.coordinates || input.routeGeometry.coordinates.length < 2) {
    warnings.push(warning('missing_route_geometry', 'Route geometry is unavailable; camp candidate search was skipped.', 'info'));
    return { candidates: [], warnings };
  }

  let rawCandidates = input.candidates ?? [];
  if (input.provider) {
    if (!input.provider.isAvailable()) {
      warnings.push(warning('provider_unavailable', 'Camp candidate provider is unavailable.', 'info', input.provider.id));
      return { candidates: [], warnings };
    }
    try {
      rawCandidates = await input.provider.searchCampCandidates({
        routeGeometry: input.routeGeometry,
        trailheadAnchor: input.trailheadAnchor,
        corridor: input.corridor ?? input.routeGeometry.corridor ?? null,
        tripDate: input.tripDate ?? null,
        preferences: input.preferences ?? null,
        limit: input.limit ?? ROUTE_CONTEXT_CAMP_CANDIDATE_LIMIT,
        providerMetadata: input.providerMetadata ?? null,
      });
    } catch {
      warnings.push(warning('provider_unavailable', 'Camp candidate provider was unavailable.', 'watch', input.provider.id));
      return { candidates: [], warnings };
    }
  }

  const limit = input.limit ?? ROUTE_CONTEXT_CAMP_CANDIDATE_LIMIT;
  const corridorMeters = input.corridor?.widthMeters ?? input.routeGeometry.corridor?.widthMeters ?? ROUTE_CONTEXT_CAMP_CANDIDATE_CORRIDOR_METERS;
  const normalized = dedupeCampCandidates(
    rawCandidates
      .map((candidate) => normalizeCampCandidate({
        input: candidate,
        routeGeometry: input.routeGeometry,
        trailheadAnchor: input.trailheadAnchor,
        providerId: input.provider?.id ?? null,
      }))
      .filter((candidate): candidate is CampCandidate => candidate != null)
      .filter((candidate) => (
        candidate.distanceFromRouteMeters == null ||
        candidate.distanceFromRouteMeters <= Math.max(corridorMeters * 3, corridorMeters + 10_000)
      )),
  )
    .sort((left, right) => (right.score ?? 0) - (left.score ?? 0) || right.confidence.value - left.confidence.value)
    .slice(0, limit);

  return { candidates: normalized, warnings };
}

export function createCampProviderFromAdapter(
  adapter: CampCandidateProviderAdapter,
): RouteContextCampProvider | null {
  if (!adapter.isAvailable()) return null;
  return {
    id: adapter.id,
    async findCampCandidates(request: CampCandidateRequest): Promise<CampCandidate[]> {
      const result = await findCampCandidates({
        provider: adapter,
        routeGeometry: request.routeGeometry,
        trailheadAnchor: request.trailheadAnchor,
        corridor: request.routeGeometry?.corridor ?? null,
        tripDate: request.tripDate ?? null,
        preferences: request.preferences ?? null,
      });
      return result.candidates;
    },
  };
}

export function createNoopCampCandidateProviderAdapter(id = 'noop-camp-candidate-provider'): CampCandidateProviderAdapter {
  return {
    id,
    isAvailable: () => false,
    async searchCampCandidates(): Promise<CampCandidateProviderResult[]> {
      return [];
    },
  };
}
