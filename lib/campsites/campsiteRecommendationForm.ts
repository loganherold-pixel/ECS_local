import type {
  CampSiteAccessDifficulty,
  CampSiteReportSourceType,
  CampSiteType,
  CampSiteVisibility,
} from './campsiteRecommendationTypes';
import type { CreateCampSiteReportInput } from './campsiteRecommendationService';

export const CAMPSITE_VERIFICATION_CHOICES = ['stayed', 'verified', 'planning'] as const;
export type CampsiteVerificationChoice = (typeof CAMPSITE_VERIFICATION_CHOICES)[number];

export const CAMPSITE_VEHICLE_FIT_OPTIONS = [
  'tent_only',
  'small_vehicle',
  'full_size_truck',
  'van',
  'trailer',
  'multiple_rigs',
] as const;
export type CampsiteVehicleFitOption = (typeof CAMPSITE_VEHICLE_FIT_OPTIONS)[number];

export const CAMPSITE_CELL_SIGNAL_OPTIONS = ['unknown', 'none', 'weak', 'usable', 'good'] as const;
export type CampsiteCellSignalOption = (typeof CAMPSITE_CELL_SIGNAL_OPTIONS)[number];

export const CAMPSITE_FLATNESS_OPTIONS = ['poor', 'okay', 'good'] as const;
export type CampsiteFlatnessOption = (typeof CAMPSITE_FLATNESS_OPTIONS)[number];

export const CAMPSITE_PRIVACY_OPTIONS = ['low', 'medium', 'high'] as const;
export type CampsitePrivacyOption = (typeof CAMPSITE_PRIVACY_OPTIONS)[number];

export const CAMPSITE_TURNAROUND_OPTIONS = ['none', 'tight', 'easy'] as const;
export type CampsiteTurnaroundOption = (typeof CAMPSITE_TURNAROUND_OPTIONS)[number];

export type CampsiteOptionalQualityValue = '' | string;

export interface CampsiteRecommendationLocationInput {
  latitude: number;
  longitude: number;
  source_type: Extract<
    CampSiteReportSourceType,
    'current_location' | 'pin_drop' | 'gpx_route' | 'gpx_waypoint' | 'gpx_track_selected_point'
  >;
  location_accuracy_m?: number | null;
}

export interface CampsiteRecommendationFormState {
  verification: CampsiteVerificationChoice;
  visited_at: string;
  site_type: CampSiteType;
  access_difficulty: CampSiteAccessDifficulty;
  vehicle_fit: CampsiteVehicleFitOption[];
  visibility_requested: CampSiteVisibility;
  stewardship_acknowledged: boolean;
  sensitive_area_acknowledged: boolean;
  trailer_friendly: boolean | null;
  max_rig_length_ft: string;
  max_group_size: string;
  cell_signal: CampsiteCellSignalOption;
  fire_ring: boolean;
  toilet: boolean;
  water_nearby: boolean;
  trash: boolean;
  shade: boolean;
  flatness: '' | CampsiteFlatnessOption;
  privacy: '' | CampsitePrivacyOption;
  turnaround: '' | CampsiteTurnaroundOption;
  seasonal_notes: string;
  notes: string;
}

export interface CampsiteRecommendationFormValidation {
  ok: boolean;
  errors: string[];
}

export function createDefaultCampsiteRecommendationFormState(): CampsiteRecommendationFormState {
  return {
    verification: 'planning',
    visited_at: '',
    site_type: 'unknown',
    access_difficulty: 'easy_2wd',
    vehicle_fit: [],
    visibility_requested: 'private',
    stewardship_acknowledged: false,
    sensitive_area_acknowledged: false,
    trailer_friendly: null,
    max_rig_length_ft: '',
    max_group_size: '',
    cell_signal: 'unknown',
    fire_ring: false,
    toilet: false,
    water_nearby: false,
    trash: false,
    shade: false,
    flatness: '',
    privacy: '',
    turnaround: '',
    seasonal_notes: '',
    notes: '',
  };
}

function parseOptionalPositiveNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Number.NaN;
}

function normalizeDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) return trimmed;
  return new Date(parsed).toISOString();
}

export function validateCampsiteRecommendationForm(
  form: CampsiteRecommendationFormState,
): CampsiteRecommendationFormValidation {
  const errors: string[] = [];

  if (!CAMPSITE_VERIFICATION_CHOICES.includes(form.verification)) {
    errors.push('Choose how you verified this campsite.');
  }
  if (form.vehicle_fit.length === 0) {
    errors.push('Select at least one vehicle fit.');
  }
  if (form.visibility_requested === 'community') {
    if (!form.stewardship_acknowledged) {
      errors.push('Community submissions require stewardship acknowledgement.');
    }
    if (!form.sensitive_area_acknowledged) {
      errors.push('Community submissions require sensitive-area acknowledgement.');
    }
  }
  const maxRigLength = parseOptionalPositiveNumber(form.max_rig_length_ft);
  if (Number.isNaN(maxRigLength)) errors.push('Max rig length must be a positive number.');

  const maxGroupSize = parseOptionalPositiveNumber(form.max_group_size);
  if (Number.isNaN(maxGroupSize)) errors.push('Max group size must be a positive number.');

  return { ok: errors.length === 0, errors };
}

export function buildCampsiteReportInputFromForm(
  location: CampsiteRecommendationLocationInput,
  form: CampsiteRecommendationFormState,
): CreateCampSiteReportInput {
  const maxRigLength = parseOptionalPositiveNumber(form.max_rig_length_ft);
  const maxGroupSize = parseOptionalPositiveNumber(form.max_group_size);
  const conditions: Record<string, unknown> = {
    cell_signal: form.cell_signal,
  };
  if (form.trailer_friendly !== null) conditions.trailer_friendly = form.trailer_friendly;
  if (maxRigLength !== null && !Number.isNaN(maxRigLength)) {
    conditions.max_rig_length_ft = maxRigLength;
  }
  if (maxGroupSize !== null && !Number.isNaN(maxGroupSize)) {
    conditions.max_group_size = maxGroupSize;
  }
  if (form.flatness) conditions.flatness = form.flatness;
  if (form.privacy) conditions.privacy = form.privacy;
  if (form.turnaround) conditions.turnaround = form.turnaround;
  if (form.seasonal_notes.trim()) conditions.seasonal_notes = form.seasonal_notes.trim();

  return {
    latitude: location.latitude,
    longitude: location.longitude,
    source_type: location.source_type,
    location_accuracy_m: location.location_accuracy_m ?? null,
    user_stayed_here: form.verification === 'stayed',
    verified_in_person: form.verification === 'stayed' || form.verification === 'verified',
    visited_at: normalizeDate(form.visited_at),
    site_type: form.site_type,
    access_difficulty: form.access_difficulty,
    vehicle_fit: [...form.vehicle_fit],
    amenities: {
      fire_ring: form.fire_ring,
      toilet: form.toilet,
      water_nearby: form.water_nearby,
      trash: form.trash,
      shade: form.shade,
    },
    conditions,
    notes: form.notes.trim() || null,
    visibility_requested: form.visibility_requested,
    stewardship_acknowledged: form.stewardship_acknowledged,
    sensitive_area_acknowledged: form.sensitive_area_acknowledged,
  };
}
