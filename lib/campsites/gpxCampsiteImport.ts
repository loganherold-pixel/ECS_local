import { parseGeoFile, type GpxParseResult } from '../gpxParser';
import { isSupabaseConfigured, supabase } from '../supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CampSiteVisibility,
  CampSiteReportSourceType,
  GpxImportCandidateType,
  GpxImport,
  GpxImportCandidate,
} from './campsiteRecommendationTypes';
import type {
  AuthenticatedCampsiteUser,
  CampsiteServiceErrorCode,
  CampsiteServiceResult,
  CreateCampSiteReportInput,
} from './campsiteRecommendationService';

export const MAX_CAMPSITE_GPX_IMPORT_BYTES = 5 * 1024 * 1024;
export const CAMPSITE_GPX_IMPORT_PARSER_VERSION = 'ecs-gpx-campsite-import-v1';
export const DEFAULT_GPX_RAW_FILE_RETENTION = 'delete_after_parse' as const;

const GPX_IMPORTS_TABLE = 'gpx_imports';
const GPX_IMPORT_CANDIDATES_TABLE = 'gpx_import_candidates';
const MAX_GPXML_TEXT_FIELD_LENGTH = 500;
const MAX_GEOMETRY_PREVIEW_POINTS = 240;

export type GpxCampsiteGeometryPoint = {
  latitude: number;
  longitude: number;
};

export type GpxCampsiteRouteGeometry = {
  name: string | null;
  description: string | null;
  points: GpxCampsiteGeometryPoint[];
};

export type GpxCampsiteTrackGeometry = {
  name: string | null;
  description: string | null;
  segments: Array<{
    segmentIndex: number;
    points: GpxCampsiteGeometryPoint[];
  }>;
};

export type GpxCampsiteCandidate = {
  id: string;
  candidate_type: GpxImportCandidateType;
  name: string | null;
  latitude: number;
  longitude: number;
  description: string | null;
  elevation_m: number | null;
  recorded_at: string | null;
  source_type: Extract<CampSiteReportSourceType, 'gpx_waypoint' | 'gpx_route' | 'gpx_track_selected_point'>;
  source_route_name?: string | null;
  source_track_name?: string | null;
  source_segment_index?: number | null;
};

export type GpxCampsiteImportResult = {
  importId?: string;
  fileName: string;
  parsedName: string;
  candidates: GpxCampsiteCandidate[];
  waypointCount: number;
  routeCount: number;
  trackCount: number;
  routePointCount: number;
  trackPointCount: number;
  metadataDescription: string | null;
  routes: GpxCampsiteRouteGeometry[];
  tracks: GpxCampsiteTrackGeometry[];
};

export type GpxCampsiteImportValidationResult =
  | { ok: true }
  | { ok: false; error: string };

export type GpxImportUploadFile = {
  name: string;
  size?: number | null;
  type?: string | null;
  content?: string;
  text?: () => Promise<string>;
  client_import_id?: string | null;
};

export type GpxImportInsert = Omit<
  GpxImport,
  'id' | 'created_at' | 'updated_at' | 'deleted_at' | 'dirty'
>;

export type GpxImportCandidateInsert = Omit<
  GpxImportCandidate,
  'id' | 'created_at' | 'updated_at' | 'deleted_at' | 'dirty'
>;

export type GpxImportResponse = Omit<GpxImport, 'user_id' | 'dirty' | 'deleted_at'>;
export type GpxImportCandidateResponse = Omit<GpxImportCandidate, 'user_id' | 'dirty' | 'deleted_at'>;

export type GpxImportUploadResult = {
  importRecord: GpxImportResponse;
  candidates: GpxImportCandidateResponse[];
};

export type CreateGpxCandidateFromMapSelectionInput = {
  latitude: number;
  longitude: number;
  candidate_type: Extract<GpxImportCandidateType, 'route_selected_point' | 'track_selected_point'>;
  name?: string | null;
  description?: string | null;
  source_route_name?: string | null;
  source_track_name?: string | null;
  source_segment_index?: number | null;
};

export type GpxCampsiteImportServiceConfig = {
  maxFileSizeBytes?: number;
};

export interface GpxCampsiteImportBackend {
  isAvailable(): boolean;
  getCurrentUser(): Promise<AuthenticatedCampsiteUser | null>;
  insertImport(row: GpxImportInsert): Promise<CampsiteServiceResult<GpxImport>>;
  getImportByClientImportId?(
    clientImportId: string,
    userId: string,
  ): Promise<CampsiteServiceResult<GpxImport | null>>;
  insertCandidates(rows: GpxImportCandidateInsert[]): Promise<CampsiteServiceResult<GpxImportCandidate[]>>;
  listImportsByUser(userId: string): Promise<CampsiteServiceResult<GpxImport[]>>;
  getImportById(importId: string, userId: string): Promise<CampsiteServiceResult<GpxImport>>;
  listCandidatesByImport(importId: string, userId: string): Promise<CampsiteServiceResult<GpxImportCandidate[]>>;
  markImportDeleted(importId: string, userId: string): Promise<CampsiteServiceResult<GpxImport>>;
}

type SupabaseResponse<T> = {
  data: T | null;
  error: { message?: string } | null;
};

function isFiniteLatitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -90 && value <= 90;
}

function isFiniteLongitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -180 && value <= 180;
}

export function validateGpxCampsiteImportFile(
  fileName: string,
  sizeBytes?: number | null,
  contentType?: string | null,
  maxSizeBytes = MAX_CAMPSITE_GPX_IMPORT_BYTES,
): GpxCampsiteImportValidationResult {
  const normalizedName = fileName.trim().toLowerCase();
  if (!normalizedName.endsWith('.gpx')) {
    return { ok: false, error: 'Only .gpx files can be imported for campsite candidates.' };
  }

  if (typeof sizeBytes === 'number' && sizeBytes > maxSizeBytes) {
    return {
      ok: false,
      error: `GPX file is too large. Maximum size is ${Math.round(maxSizeBytes / 1024 / 1024)} MB.`,
    };
  }

  if (typeof contentType === 'string' && contentType.trim()) {
    const normalizedType = contentType.toLowerCase();
    const allowedTypes = [
      'application/gpx+xml',
      'application/xml',
      'text/xml',
      'text/plain',
      'application/octet-stream',
    ];
    if (!allowedTypes.some((type) => normalizedType.includes(type))) {
      return { ok: false, error: 'File content type is not supported for GPX import.' };
    }
  }

  return { ok: true };
}

function sanitizeImportedText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const sanitized = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return sanitized ? sanitized.slice(0, MAX_GPXML_TEXT_FIELD_LENGTH) : null;
}

function sanitizeFilename(fileName: string): string | null {
  const base = fileName
    .split(/[\\/]/)
    .pop()
    ?.replace(/[^\w.\- ()]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return base ? base.slice(0, 180) : null;
}

function estimateUtf8Bytes(content: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(content).length;
  }
  return unescape(encodeURIComponent(content)).length;
}

function validateSafeXmlWellFormed(content: string): void {
  const xml = content
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');
  const tagRegex = /<[^>]+>/g;
  const stack: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(xml)) !== null) {
    const rawTag = match[0];
    if (
      rawTag.startsWith('<?') ||
      rawTag.startsWith('<!') ||
      rawTag.startsWith('</?')
    ) {
      continue;
    }

    if (rawTag.startsWith('</')) {
      const closingName = rawTag
        .slice(2, -1)
        .trim()
        .split(/\s+/)[0]
        .toLowerCase();
      const expected = stack.pop();
      if (!expected || expected !== closingName) {
        throw new Error('Invalid GPX file. XML is malformed.');
      }
      continue;
    }

    if (rawTag.endsWith('/>')) continue;
    const openName = rawTag
      .slice(1, -1)
      .trim()
      .split(/\s+/)[0]
      .toLowerCase();
    if (openName) stack.push(openName);
  }

  if (stack.length > 0) {
    throw new Error('Invalid GPX file. XML is malformed.');
  }
}

function validateSafeGpxXml(content: string): void {
  const trimmed = content.trim();
  if (!trimmed || !/<(?:[\w-]+:)?gpx[\s>]/i.test(trimmed)) {
    throw new Error('Invalid GPX file. No GPX document was found.');
  }
  if (/<!doctype\b/i.test(trimmed) || /<!entity\b/i.test(trimmed)) {
    throw new Error('Invalid GPX file. External entities and DOCTYPE declarations are not allowed.');
  }
  if (/(?:SYSTEM|PUBLIC)\s+["']/i.test(trimmed)) {
    throw new Error('Invalid GPX file. External XML references are not allowed.');
  }
  validateSafeXmlWellFormed(trimmed);
}

function countTrackPoints(parsed: GpxParseResult): number {
  return parsed.tracks.reduce(
    (total, track) =>
      total + track.segments.reduce((segmentTotal, segment) => segmentTotal + segment.points.length, 0),
    0,
  );
}

function sampleGeometryPoints(
  points: Array<{ lat: number; lon: number }>,
): GpxCampsiteGeometryPoint[] {
  const validPoints = points.filter((point) => isFiniteLatitude(point.lat) && isFiniteLongitude(point.lon));
  if (validPoints.length <= MAX_GEOMETRY_PREVIEW_POINTS) {
    return validPoints.map((point) => ({ latitude: point.lat, longitude: point.lon }));
  }

  const stride = Math.ceil(validPoints.length / MAX_GEOMETRY_PREVIEW_POINTS);
  return validPoints
    .filter((_, index) => index % stride === 0 || index === validPoints.length - 1)
    .slice(0, MAX_GEOMETRY_PREVIEW_POINTS)
    .map((point) => ({ latitude: point.lat, longitude: point.lon }));
}

function sourceTypeForCandidate(
  candidateType: GpxImportCandidateType,
): GpxCampsiteCandidate['source_type'] {
  if (candidateType === 'route_selected_point') return 'gpx_route';
  if (candidateType === 'track_selected_point') return 'gpx_track_selected_point';
  return 'gpx_waypoint';
}

export function parseGpxCampsiteCandidates(
  fileName: string,
  content: string,
): GpxCampsiteImportResult {
  validateSafeGpxXml(content);

  const parsed = parseGeoFile(fileName, content);
  const candidates = parsed.waypoints
    .filter((waypoint) => isFiniteLatitude(waypoint.lat) && isFiniteLongitude(waypoint.lon))
    .map((waypoint, index) => ({
      id: `gpx-waypoint-${index}-${waypoint.lat.toFixed(6)}-${waypoint.lon.toFixed(6)}`,
      candidate_type: 'waypoint' as const,
      name: waypoint.name,
      latitude: waypoint.lat,
      longitude: waypoint.lon,
      description: waypoint.description,
      elevation_m: waypoint.ele,
      recorded_at: waypoint.time,
      source_type: 'gpx_waypoint' as const,
    }));

  return {
    fileName,
    parsedName: parsed.name,
    candidates,
    waypointCount: parsed.waypoints.length,
    routeCount: parsed.routes.length,
    trackCount: parsed.tracks.length,
    routePointCount: parsed.routes.reduce((total, route) => total + route.points.length, 0),
    trackPointCount: countTrackPoints(parsed),
    metadataDescription: parsed.description,
    routes: parsed.routes.map((route) => ({
      name: sanitizeImportedText(route.name),
      description: sanitizeImportedText(route.description),
      points: sampleGeometryPoints(route.points),
    })),
    tracks: parsed.tracks.map((track) => ({
      name: sanitizeImportedText(track.name),
      description: sanitizeImportedText(track.description),
      segments: track.segments.map((segment, segmentIndex) => ({
        segmentIndex,
        points: sampleGeometryPoints(segment.points),
      })),
    })),
  };
}

function publicImport(record: GpxImport): GpxImportResponse {
  const { user_id: _userId, dirty: _dirty, deleted_at: _deleted, ...rest } = record;
  return rest;
}

function publicCandidate(candidate: GpxImportCandidate): GpxImportCandidateResponse {
  const { user_id: _userId, dirty: _dirty, deleted_at: _deleted, ...rest } = candidate;
  return rest;
}

function serviceError(
  code: CampsiteServiceErrorCode,
  error: string,
  details?: string[],
): CampsiteServiceResult<never> {
  return { ok: false, code, error, details };
}

function mapBackendError(error: { message?: string } | null | undefined): CampsiteServiceResult<never> {
  return serviceError('backend_error', error?.message ?? 'GPX import backend request failed.');
}

async function readUploadText(file: GpxImportUploadFile): Promise<string> {
  if (typeof file.content === 'string') return file.content;
  if (typeof file.text === 'function') return file.text();
  return Promise.reject(new Error('GPX upload content is unavailable.'));
}

function buildImportMetadata(parsed: GpxCampsiteImportResult): Record<string, unknown> {
  return {
    metadata_name: sanitizeImportedText(parsed.parsedName),
    metadata_description: sanitizeImportedText(parsed.metadataDescription),
    route_point_count: parsed.routePointCount,
    track_point_count: parsed.trackPointCount,
    route_geometry: parsed.routes,
    track_geometry: parsed.tracks,
    raw_file_retention_note: 'Raw GPX content is deleted after parse and is not stored by ECS.',
  };
}

function readGeometryArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function gpxImportCandidateToCampsiteCandidate(
  candidate: GpxImportCandidateResponse,
): GpxCampsiteCandidate {
  return {
    id: candidate.id,
    name: candidate.name,
    candidate_type: candidate.candidate_type,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    description: candidate.description,
    elevation_m: candidate.elevation_m,
    recorded_at: candidate.recorded_at,
    source_type: sourceTypeForCandidate(candidate.candidate_type),
    source_route_name: candidate.source_route_name,
    source_track_name: candidate.source_track_name,
    source_segment_index: candidate.source_segment_index,
  };
}

export function gpxUploadResultToCampsiteImportResult(
  result: GpxImportUploadResult,
): GpxCampsiteImportResult {
  const routePointCount = result.importRecord.metadata.route_point_count;
  const trackPointCount = result.importRecord.metadata.track_point_count;
  const metadataName = result.importRecord.metadata.metadata_name;
  const metadataDescription = result.importRecord.metadata.metadata_description;
  return {
    importId: result.importRecord.id,
    fileName: result.importRecord.original_filename ?? 'imported.gpx',
    parsedName: typeof metadataName === 'string' ? metadataName : 'Imported GPX Route',
    metadataDescription: typeof metadataDescription === 'string' ? metadataDescription : null,
    candidates: result.candidates.map(gpxImportCandidateToCampsiteCandidate),
    waypointCount: result.importRecord.waypoint_count,
    routeCount: result.importRecord.route_count,
    trackCount: result.importRecord.track_count,
    routePointCount: typeof routePointCount === 'number' ? routePointCount : 0,
    trackPointCount: typeof trackPointCount === 'number' ? trackPointCount : 0,
    routes: readGeometryArray<GpxCampsiteRouteGeometry>(result.importRecord.metadata.route_geometry),
    tracks: readGeometryArray<GpxCampsiteTrackGeometry>(result.importRecord.metadata.track_geometry),
  };
}

export class GpxCampsiteImportService {
  constructor(
    private readonly backend: GpxCampsiteImportBackend,
    private readonly config: GpxCampsiteImportServiceConfig = {},
  ) {}

  private unavailable(): CampsiteServiceResult<never> | null {
    return this.backend.isAvailable()
      ? null
      : serviceError('backend_unavailable', 'GPX import backend is not configured.');
  }

  private async currentUser(): Promise<CampsiteServiceResult<AuthenticatedCampsiteUser>> {
    const unavailable = this.unavailable();
    if (unavailable) return unavailable;
    const user = await this.backend.getCurrentUser();
    if (!user) return serviceError('auth_required', 'Sign in to import GPX campsite candidates.');
    return { ok: true, data: user };
  }

  async uploadGpxImport(file: GpxImportUploadFile): Promise<CampsiteServiceResult<GpxImportUploadResult>> {
    const user = await this.currentUser();
    if (!user.ok) return user;

    const maxSizeBytes = this.config.maxFileSizeBytes ?? MAX_CAMPSITE_GPX_IMPORT_BYTES;
    const metadataValidation = validateGpxCampsiteImportFile(
      file.name,
      file.size,
      file.type,
      maxSizeBytes,
    );
    if (!metadataValidation.ok) {
      return serviceError('validation_error', metadataValidation.error);
    }

    let content: string;
    try {
      content = await readUploadText(file);
    } catch {
      return serviceError('validation_error', 'GPX upload content is unavailable.');
    }

    const fileSizeBytes = typeof file.size === 'number' ? file.size : estimateUtf8Bytes(content);
    if (fileSizeBytes > maxSizeBytes) {
      return serviceError(
        'validation_error',
        `GPX file is too large. Maximum size is ${Math.round(maxSizeBytes / 1024 / 1024)} MB.`,
      );
    }

    let parsed: GpxCampsiteImportResult;
    try {
      parsed = parseGpxCampsiteCandidates(file.name, content);
    } catch (error) {
      return serviceError(
        'validation_error',
        error instanceof Error ? error.message : 'Invalid GPX file.',
      );
    }

    const clientImportId = file.client_import_id?.trim() || null;
    if (clientImportId && this.backend.getImportByClientImportId) {
      const existing = await this.backend.getImportByClientImportId(clientImportId, user.data.id);
      if (existing.ok && existing.data) {
        const candidates = await this.backend.listCandidatesByImport(existing.data.id, user.data.id);
        if (!candidates.ok) return candidates;
        return {
          ok: true,
          data: {
            importRecord: publicImport(existing.data),
            candidates: candidates.data.map(publicCandidate),
          },
        };
      }
      if (!existing.ok) return existing;
    }

    const importRecord = await this.backend.insertImport({
      user_id: user.data.id,
      client_import_id: clientImportId,
      original_filename: sanitizeFilename(file.name),
      file_size_bytes: fileSizeBytes,
      parser_version: CAMPSITE_GPX_IMPORT_PARSER_VERSION,
      waypoint_count: parsed.waypointCount,
      route_count: parsed.routeCount,
      track_count: parsed.trackCount,
      status: 'parsed',
      raw_file_retention: DEFAULT_GPX_RAW_FILE_RETENTION,
      metadata: buildImportMetadata(parsed),
    });
    if (!importRecord.ok) {
      if (file.client_import_id?.trim() && this.backend.getImportByClientImportId) {
        const existing = await this.backend.getImportByClientImportId(
          file.client_import_id.trim(),
          user.data.id,
        );
        if (existing.ok && existing.data) {
          const candidates = await this.backend.listCandidatesByImport(existing.data.id, user.data.id);
          if (!candidates.ok) return candidates;
          return {
            ok: true,
            data: {
              importRecord: publicImport(existing.data),
              candidates: candidates.data.map(publicCandidate),
            },
          };
        }
      }
      return importRecord;
    }

    const candidateRows: GpxImportCandidateInsert[] = parsed.candidates.map((candidate) => ({
      gpx_import_id: importRecord.data.id,
      user_id: user.data.id,
      candidate_type: 'waypoint',
      name: sanitizeImportedText(candidate.name),
      description: sanitizeImportedText(candidate.description),
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      elevation_m: candidate.elevation_m,
      recorded_at: candidate.recorded_at,
      source_route_name: null,
      source_track_name: null,
      source_segment_index: null,
      selected_for_save: false,
      selected_for_community_submission: false,
    }));

    const candidates = candidateRows.length > 0
      ? await this.backend.insertCandidates(candidateRows)
      : { ok: true as const, data: [] };
    if (!candidates.ok) return candidates;

    return {
      ok: true,
      data: {
        importRecord: publicImport(importRecord.data),
        candidates: candidates.data.map(publicCandidate),
      },
    };
  }

  async listMyGpxImports(): Promise<CampsiteServiceResult<GpxImportResponse[]>> {
    const user = await this.currentUser();
    if (!user.ok) return user;
    const result = await this.backend.listImportsByUser(user.data.id);
    if (!result.ok) return result;
    return { ok: true, data: result.data.map(publicImport) };
  }

  async getMyGpxImport(importId: string): Promise<CampsiteServiceResult<GpxImportResponse>> {
    const user = await this.currentUser();
    if (!user.ok) return user;
    const result = await this.backend.getImportById(importId, user.data.id);
    if (!result.ok) return result;
    return { ok: true, data: publicImport(result.data) };
  }

  async listGpxImportCandidates(
    importId: string,
  ): Promise<CampsiteServiceResult<GpxImportCandidateResponse[]>> {
    const user = await this.currentUser();
    if (!user.ok) return user;
    const importRecord = await this.backend.getImportById(importId, user.data.id);
    if (!importRecord.ok) return importRecord;
    const result = await this.backend.listCandidatesByImport(importId, user.data.id);
    if (!result.ok) return result;
    return { ok: true, data: result.data.map(publicCandidate) };
  }

  async createGpxCandidateFromMapSelection(
    importId: string,
    input: CreateGpxCandidateFromMapSelectionInput,
  ): Promise<CampsiteServiceResult<GpxImportCandidateResponse>> {
    const user = await this.currentUser();
    if (!user.ok) return user;

    if (!isFiniteLatitude(input.latitude) || !isFiniteLongitude(input.longitude)) {
      return serviceError('validation_error', 'GPX campsite candidate coordinates are invalid.');
    }
    if (
      input.candidate_type !== 'route_selected_point' &&
      input.candidate_type !== 'track_selected_point'
    ) {
      return serviceError(
        'validation_error',
        'GPX route/track candidates must be created from an explicit route or track selection.',
      );
    }

    const importRecord = await this.backend.getImportById(importId, user.data.id);
    if (!importRecord.ok) return importRecord;

    const inserted = await this.backend.insertCandidates([{
      gpx_import_id: importRecord.data.id,
      user_id: user.data.id,
      candidate_type: input.candidate_type,
      name: sanitizeImportedText(input.name) ?? (
        input.candidate_type === 'track_selected_point'
          ? 'Selected track campsite candidate'
          : 'Selected route campsite candidate'
      ),
      description: sanitizeImportedText(input.description),
      latitude: input.latitude,
      longitude: input.longitude,
      elevation_m: null,
      recorded_at: null,
      source_route_name: sanitizeImportedText(input.source_route_name),
      source_track_name: sanitizeImportedText(input.source_track_name),
      source_segment_index: input.source_segment_index ?? null,
      selected_for_save: false,
      selected_for_community_submission: false,
    }]);
    if (!inserted.ok) return inserted;
    const candidate = inserted.data[0];
    if (!candidate) return serviceError('backend_error', 'GPX candidate was not created.');
    return { ok: true, data: publicCandidate(candidate) };
  }

  async deleteGpxImport(importId: string): Promise<CampsiteServiceResult<GpxImportResponse>> {
    const user = await this.currentUser();
    if (!user.ok) return user;
    const result = await this.backend.markImportDeleted(importId, user.data.id);
    if (!result.ok) return result;
    return { ok: true, data: publicImport(result.data) };
  }
}

export function createSupabaseGpxCampsiteImportBackend(
  client: SupabaseClient = supabase,
): GpxCampsiteImportBackend {
  return {
    isAvailable() {
      return isSupabaseConfigured;
    },

    async getCurrentUser() {
      const { data } = await client.auth.getSession();
      const userId = data.session?.user?.id;
      return userId ? { id: userId } : null;
    },

    async insertImport(row) {
      const result = (await client
        .from(GPX_IMPORTS_TABLE)
        .insert(row)
        .select('*')
        .single()) as SupabaseResponse<GpxImport>;
      if (result.error || !result.data) return mapBackendError(result.error);
      return { ok: true, data: result.data };
    },

    async getImportByClientImportId(clientImportId, userId) {
      const result = (await client
        .from(GPX_IMPORTS_TABLE)
        .select('*')
        .eq('client_import_id', clientImportId)
        .eq('user_id', userId)
        .neq('status', 'deleted')
        .maybeSingle()) as SupabaseResponse<GpxImport>;
      if (result.error) return mapBackendError(result.error);
      return { ok: true, data: result.data ?? null };
    },

    async insertCandidates(rows) {
      if (rows.length === 0) return { ok: true, data: [] };
      const result = (await client
        .from(GPX_IMPORT_CANDIDATES_TABLE)
        .insert(rows)
        .select('*')) as SupabaseResponse<GpxImportCandidate[]>;
      if (result.error || !Array.isArray(result.data)) return mapBackendError(result.error);
      return { ok: true, data: result.data };
    },

    async listImportsByUser(userId) {
      const result = (await client
        .from(GPX_IMPORTS_TABLE)
        .select('*')
        .eq('user_id', userId)
        .neq('status', 'deleted')
        .order('created_at', { ascending: false })) as SupabaseResponse<GpxImport[]>;
      if (result.error || !Array.isArray(result.data)) return mapBackendError(result.error);
      return { ok: true, data: result.data };
    },

    async getImportById(importId, userId) {
      const result = (await client
        .from(GPX_IMPORTS_TABLE)
        .select('*')
        .eq('id', importId)
        .eq('user_id', userId)
        .neq('status', 'deleted')
        .single()) as SupabaseResponse<GpxImport>;
      if (result.error || !result.data) return serviceError('not_found', 'GPX import was not found.');
      return { ok: true, data: result.data };
    },

    async listCandidatesByImport(importId, userId) {
      const result = (await client
        .from(GPX_IMPORT_CANDIDATES_TABLE)
        .select('*')
        .eq('gpx_import_id', importId)
        .eq('user_id', userId)
        .order('created_at', { ascending: true })) as SupabaseResponse<GpxImportCandidate[]>;
      if (result.error || !Array.isArray(result.data)) return mapBackendError(result.error);
      return { ok: true, data: result.data };
    },

    async markImportDeleted(importId, userId) {
      const result = (await client
        .from(GPX_IMPORTS_TABLE)
        .update({ status: 'deleted' })
        .eq('id', importId)
        .eq('user_id', userId)
        .select('*')
        .single()) as SupabaseResponse<GpxImport>;
      if (result.error || !result.data) return serviceError('not_found', 'GPX import was not found.');
      return { ok: true, data: result.data };
    },
  };
}

export const gpxCampsiteImportService = new GpxCampsiteImportService(
  createSupabaseGpxCampsiteImportBackend(),
);

export function buildCampsiteReportInputFromGpxCandidate(
  candidate: GpxCampsiteCandidate,
  visibility: Extract<CampSiteVisibility, 'private' | 'community'>,
  acknowledgements: {
    stewardship_acknowledged?: boolean;
    sensitive_area_acknowledged?: boolean;
    user_stayed_here?: boolean;
    verified_in_person?: boolean;
    visited_at?: string | null;
    site_type?: CreateCampSiteReportInput['site_type'];
    access_difficulty?: CreateCampSiteReportInput['access_difficulty'];
    vehicle_fit?: string[];
  } = {},
): CreateCampSiteReportInput {
  const sourceLabel =
    candidate.candidate_type === 'track_selected_point'
      ? 'GPX track selected point'
      : candidate.candidate_type === 'route_selected_point'
        ? 'GPX route selected point'
        : 'GPX waypoint';
  const importedNotes = [
    candidate.name ? `${sourceLabel}: ${candidate.name}` : `${sourceLabel} import.`,
    candidate.description,
    'Details require user verification before public approval.',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    source_type: candidate.source_type,
    location_accuracy_m: null,
    user_stayed_here: acknowledgements.user_stayed_here ?? false,
    verified_in_person: acknowledgements.verified_in_person ?? false,
    visited_at: acknowledgements.visited_at ?? null,
    site_type: acknowledgements.site_type ?? 'unknown',
    access_difficulty: acknowledgements.access_difficulty ?? 'high_clearance',
    vehicle_fit: acknowledgements.vehicle_fit ?? [],
    amenities: {},
    conditions: {
      imported_from_gpx: true,
      access_difficulty_unverified: true,
      gpx_candidate_source: candidate.candidate_type,
      source_route_name: candidate.source_route_name ?? null,
      source_track_name: candidate.source_track_name ?? null,
      source_segment_index: candidate.source_segment_index ?? null,
    },
    notes: importedNotes,
    visibility_requested: visibility,
    stewardship_acknowledged: acknowledgements.stewardship_acknowledged ?? false,
    sensitive_area_acknowledged: acknowledgements.sensitive_area_acknowledged ?? false,
  };
}
