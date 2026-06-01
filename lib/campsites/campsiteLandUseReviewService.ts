import type { SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../supabase';
import type {
  CampSiteJsonObject,
  CampSiteReport,
  LandUseReviewResult,
  LandUseReviewStatus,
} from './campsiteRecommendationTypes';
import type {
  CampsiteServiceErrorCode,
  CampsiteServiceResult,
} from './campsiteRecommendationService';
import {
  DEFAULT_CAMPSITE_LAND_USE_REVIEW_CONFIG,
  type CampsiteLandUseProviderKey,
  type CampsiteLandUseReviewConfig,
  resolveCampsiteLandUseReviewConfig,
} from './campsiteLandUseReviewConfig';

const LAND_USE_REVIEW_RESULTS_TABLE = 'land_use_review_results';
const CAMP_SITE_REPORTS_TABLE = 'camp_site_reports';

export type LandUseLayerSensitivity = 'public' | 'restricted' | 'sensitive';
export type LandUseLayerEffect = 'block' | 'warn';
export type LandUseLayerKind =
  | 'private_land'
  | 'no_camping_closure'
  | 'protected_area'
  | 'sensitive_habitat_cultural'
  | 'water_buffer'
  | 'duplicate_overcrowding';

export interface LandUseLayerMatch {
  layerType: LandUseLayerKind;
  layerId?: string;
  label: string;
  effect: LandUseLayerEffect;
  sensitivity: LandUseLayerSensitivity;
  provider: string;
  distanceMeters?: number | null;
  publicReason: string;
  details?: CampSiteJsonObject;
}

export interface LandUseProviderReviewInput {
  latitude: number;
  longitude: number;
  bufferRadiusMeters: number;
  config: CampsiteLandUseReviewConfig;
  report: CampSiteReport;
}

export interface LandUseProviderReviewResult {
  providerVersion?: string | null;
  unavailable?: boolean;
  warnings?: string[];
  matches?: LandUseLayerMatch[];
}

export interface LandUseReviewProvider {
  key: CampsiteLandUseProviderKey | string;
  reviewPoint(input: LandUseProviderReviewInput): Promise<LandUseProviderReviewResult>;
}

export type LandUseReviewResultInsert = Omit<
  LandUseReviewResult,
  'id' | 'created_at' | 'deleted_at' | 'dirty'
>;

export type SanitizedLandUseReviewResult = Omit<
  LandUseReviewResult,
  'matched_layers' | 'dirty' | 'deleted_at'
> & {
  matched_layers: CampSiteJsonObject;
  public_reason: string;
};

export interface LandUseReviewBackend {
  isAvailable(): boolean;
  insertReviewResult(
    row: LandUseReviewResultInsert,
  ): Promise<CampsiteServiceResult<LandUseReviewResult>>;
  updateReport(
    reportId: string,
    changes: Partial<CampSiteReport>,
  ): Promise<CampsiteServiceResult<CampSiteReport>>;
  getLatestReviewResult?(
    reportId: string,
  ): Promise<CampsiteServiceResult<LandUseReviewResult | null>>;
}

function toServiceError(
  code: CampsiteServiceErrorCode,
  error: string,
  details?: string[],
): CampsiteServiceResult<never> {
  return { ok: false, code, error, details };
}

function mapBackendError(error: { message?: string } | null | undefined): CampsiteServiceResult<never> {
  return toServiceError('backend_error', error?.message ?? 'Land-use review backend request failed.');
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function statusForMatches(
  matches: LandUseLayerMatch[],
  providerUnavailable: boolean,
): LandUseReviewStatus {
  if (matches.some((match) => match.effect === 'block')) return 'blocked';
  if (matches.some((match) => match.effect === 'warn')) return 'warning';
  if (providerUnavailable) return 'unknown';
  return 'passed';
}

function publicReasonForStatus(status: LandUseReviewStatus): string {
  if (status === 'blocked') return 'Potential sensitive or restricted area';
  if (status === 'warning') return 'Land-use review returned a warning';
  if (status === 'unknown') return 'Land-use review unavailable';
  if (status === 'not_checked') return 'Land-use review not checked';
  return 'No land-use issues detected';
}

function applyConfigToMatch(
  match: LandUseLayerMatch,
  config: CampsiteLandUseReviewConfig,
): LandUseLayerMatch {
  if (match.layerType === 'private_land' && !config.blockPrivateLandMatches) {
    return { ...match, effect: 'warn', publicReason: 'Potential private land or access uncertainty' };
  }
  if (match.layerType === 'sensitive_habitat_cultural' && !config.blockSensitiveMatches) {
    return { ...match, effect: 'warn', publicReason: 'Potential sensitive or restricted area' };
  }
  return match;
}

function buildMatchedLayers(matches: LandUseLayerMatch[]): CampSiteJsonObject {
  return {
    matches: matches.map((match) => ({
      layerType: match.layerType,
      layerId: match.layerId ?? null,
      label: match.label,
      effect: match.effect,
      sensitivity: match.sensitivity,
      provider: match.provider,
      distanceMeters: match.distanceMeters ?? null,
      publicReason: match.publicReason,
      details: match.details ?? {},
    })),
  };
}

function summarizeForTriage(result: LandUseReviewResult): CampSiteJsonObject {
  return {
    status: result.status,
    public_reason: publicReasonForStatus(result.status),
    warnings: result.warnings,
    blocking_reasons: result.blocking_reasons,
    provider_version: result.provider_version,
  };
}

function mergeLandUseIntoTriageSummary(
  report: CampSiteReport,
  result: LandUseReviewResult,
): CampSiteJsonObject {
  const previous =
    report.triage_summary && typeof report.triage_summary === 'object'
      ? report.triage_summary
      : {};
  return {
    ...previous,
    land_use_status:
      result.status === 'passed'
        ? 'clear'
        : result.status === 'blocked'
          ? 'blocked'
          : result.status === 'warning'
            ? 'warning'
            : 'unknown',
    land_use_review: summarizeForTriage(result),
  };
}

export function sanitizeLandUseReviewResult(
  result: LandUseReviewResult,
  role: 'reviewer' | 'moderator',
): SanitizedLandUseReviewResult {
  const { dirty: _dirty, deleted_at: _deletedAt, ...safe } = result;
  if (role === 'moderator') {
    return {
      ...safe,
      public_reason: publicReasonForStatus(result.status),
    };
  }
  const matches = Array.isArray((result.matched_layers as { matches?: unknown[] }).matches)
    ? ((result.matched_layers as { matches?: LandUseLayerMatch[] }).matches ?? [])
    : [];
  return {
    ...safe,
    matched_layers: {
      matches: matches.map((match) => ({
        layerType:
          match.sensitivity === 'sensitive'
            ? 'sensitive_or_restricted'
            : match.layerType,
        effect: match.effect,
        publicReason: match.publicReason ?? publicReasonForStatus(result.status),
      })),
    },
    public_reason: publicReasonForStatus(result.status),
  };
}

export function createUnavailableLandUseReviewResult(
  report: CampSiteReport,
  warning = 'Land-use provider unavailable; verify access before publication.',
): LandUseReviewResultInsert {
  return {
    camp_site_report_id: report.id,
    status: 'unknown',
    matched_layers: { matches: [] },
    warnings: [warning],
    blocking_reasons: [],
    provider_version: null,
  };
}

export class CampsiteLandUseReviewService {
  constructor(
    private readonly backend: LandUseReviewBackend,
    private readonly providers: LandUseReviewProvider[] = [],
    private readonly config: Partial<CampsiteLandUseReviewConfig> = {},
  ) {}

  async reviewCampSiteReport(
    report: CampSiteReport,
    options: { bufferRadiusMeters?: number } = {},
  ): Promise<CampsiteServiceResult<LandUseReviewResult>> {
    const config = resolveCampsiteLandUseReviewConfig(this.config);
    if (!this.backend.isAvailable()) {
      return this.persistReviewResult(report, createUnavailableLandUseReviewResult(report));
    }
    if (!config.enabled) {
      return this.persistReviewResult(report, {
        camp_site_report_id: report.id,
        status: 'not_checked',
        matched_layers: { matches: [] },
        warnings: ['Land-use review is disabled for this rollout.'],
        blocking_reasons: [],
        provider_version: null,
      });
    }

    const activeProviders = this.providers.filter((provider) =>
      config.providers.includes(provider.key as CampsiteLandUseProviderKey),
    );
    if (activeProviders.length === 0) {
      return this.persistReviewResult(report, createUnavailableLandUseReviewResult(report));
    }

    const providerWarnings: string[] = [];
    const providerVersions: string[] = [];
    const matches: LandUseLayerMatch[] = [];
    let unavailable = false;

    for (const provider of activeProviders) {
      try {
        const result = await provider.reviewPoint({
          latitude: report.latitude,
          longitude: report.longitude,
          bufferRadiusMeters: options.bufferRadiusMeters ?? config.waterBufferMeters,
          config,
          report,
        });
        if (result.unavailable) unavailable = true;
        if (result.providerVersion) providerVersions.push(result.providerVersion);
        providerWarnings.push(...(result.warnings ?? []));
        matches.push(...(result.matches ?? []).map((match) => applyConfigToMatch(match, config)));
      } catch {
        unavailable = true;
        providerWarnings.push(`${provider.key} provider unavailable.`);
      }
    }

    const status = statusForMatches(matches, unavailable);
    const warningMatches = matches.filter((match) => match.effect === 'warn');
    const blockingMatches = matches.filter((match) => match.effect === 'block');
    const warnings = uniqueStrings([
      ...providerWarnings,
      ...warningMatches.map((match) => match.publicReason),
      ...(status === 'unknown' ? ['Land-use provider unavailable; verify access before publication.'] : []),
    ]);
    const blockingReasons = uniqueStrings(blockingMatches.map((match) => match.publicReason));

    return this.persistReviewResult(report, {
      camp_site_report_id: report.id,
      status,
      matched_layers: buildMatchedLayers(matches),
      warnings,
      blocking_reasons: blockingReasons,
      provider_version: uniqueStrings(providerVersions).join(', ') || null,
    });
  }

  async getLatestReviewResultForReport(
    reportId: string,
    role: 'reviewer' | 'moderator',
  ): Promise<CampsiteServiceResult<SanitizedLandUseReviewResult | null>> {
    if (!this.backend.getLatestReviewResult) {
      return { ok: true, data: null };
    }
    const result = await this.backend.getLatestReviewResult(reportId);
    if (!result.ok || !result.data) return result as CampsiteServiceResult<null>;
    return { ok: true, data: sanitizeLandUseReviewResult(result.data, role) };
  }

  private async persistReviewResult(
    report: CampSiteReport,
    row: LandUseReviewResultInsert,
  ): Promise<CampsiteServiceResult<LandUseReviewResult>> {
    const stored = await this.backend.insertReviewResult(row);
    if (!stored.ok) return stored;
    await this.backend.updateReport(report.id, {
      triage_summary: mergeLandUseIntoTriageSummary(report, stored.data),
    });
    return stored;
  }
}

type SupabaseResponse<T> = {
  data: T | null;
  error: { message?: string } | null;
};

export function createSupabaseCampsiteLandUseReviewBackend(
  client: SupabaseClient = supabase,
): LandUseReviewBackend {
  return {
    isAvailable() {
      return isSupabaseConfigured;
    },

    async insertReviewResult(row) {
      const result = (await client
        .from(LAND_USE_REVIEW_RESULTS_TABLE)
        .insert(row)
        .select('*')
        .single()) as SupabaseResponse<LandUseReviewResult>;
      if (result.error || !result.data) return mapBackendError(result.error);
      return { ok: true, data: result.data };
    },

    async updateReport(reportId, changes) {
      const result = (await client
        .from(CAMP_SITE_REPORTS_TABLE)
        .update(changes)
        .eq('id', reportId)
        .select('*')
        .single()) as SupabaseResponse<CampSiteReport>;
      if (result.error || !result.data) return mapBackendError(result.error);
      return { ok: true, data: result.data };
    },

    async getLatestReviewResult(reportId) {
      const result = (await client
        .from(LAND_USE_REVIEW_RESULTS_TABLE)
        .select('*')
        .eq('camp_site_report_id', reportId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()) as SupabaseResponse<LandUseReviewResult>;
      if (result.error) return mapBackendError(result.error);
      return { ok: true, data: result.data ?? null };
    },
  };
}

export const landUseReviewService = new CampsiteLandUseReviewService(
  createSupabaseCampsiteLandUseReviewBackend(),
  [],
  DEFAULT_CAMPSITE_LAND_USE_REVIEW_CONFIG,
);
