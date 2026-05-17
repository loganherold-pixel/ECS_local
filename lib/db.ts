/**
 * Dexie IndexedDB Database Definition
 * Primary source of truth for all offline data.
 * Falls back gracefully if IndexedDB is unavailable.
 *
 * v2 upgrade:
 * - keeps same schema, but bumps version so existing installs upgrade cleanly
 */
import Dexie, { type Table } from "dexie";
import { Platform } from "react-native";
import type {
  Trip,
  RiskScore,
  LoadItem,
  LoadMapSlot,
  FuelWaterLog,
  Waypoint,
} from "./types";
import type {
  CampSite,
  CampSiteFlag,
  CampSiteGroup,
  CampSiteGroupMembership,
  CampSiteGroupShare,
  CampSitePhoto,
  CampSiteReport,
  CampSiteReviewEvent,
  CampSiteReviewVote,
  CampSiteReviewerProfile,
  GpxImport,
  GpxImportCandidate,
  LandUseReviewResult,
} from "./campsites/campsiteRecommendationTypes";

// Extend types with dirty flag for local tracking
export interface LocalTrip extends Omit<Trip, 'dirty'> {
  dirty: number; // 0 or 1 for indexing
}
export interface LocalRiskScore extends Omit<RiskScore, 'dirty'> {
  dirty: number;
}
export interface LocalLoadItem extends Omit<LoadItem, 'dirty'> {
  dirty: number;
}
export interface LocalLoadMapSlot extends Omit<LoadMapSlot, 'dirty'> {
  dirty: number;
}
export interface LocalFuelWaterLog extends Omit<FuelWaterLog, 'dirty'> {
  dirty: number;
}
export interface LocalWaypoint extends Omit<Waypoint, 'dirty'> {
  dirty: number;
}
export interface LocalCampSite extends Omit<CampSite, 'dirty'> {
  dirty: number;
}
export interface LocalCampSiteReport extends Omit<CampSiteReport, 'dirty'> {
  dirty: number;
}
export interface LocalCampSiteFlag extends Omit<CampSiteFlag, 'dirty'> {
  dirty: number;
}
export interface LocalCampSitePhoto extends Omit<CampSitePhoto, 'dirty'> {
  dirty: number;
}
export interface LocalCampSiteGroup extends Omit<CampSiteGroup, 'dirty'> {
  dirty: number;
}
export interface LocalCampSiteGroupMembership extends Omit<CampSiteGroupMembership, 'dirty'> {
  dirty: number;
}
export interface LocalCampSiteGroupShare extends Omit<CampSiteGroupShare, 'dirty'> {
  dirty: number;
}
export interface LocalCampSiteReviewVote extends Omit<CampSiteReviewVote, 'dirty'> {
  dirty: number;
}
export interface LocalCampSiteReviewEvent extends Omit<CampSiteReviewEvent, 'dirty'> {
  dirty: number;
}
export interface LocalCampSiteReviewerProfile extends Omit<CampSiteReviewerProfile, 'dirty'> {
  dirty: number;
}
export interface LocalGpxImport extends Omit<GpxImport, 'dirty'> {
  dirty: number;
}
export interface LocalGpxImportCandidate extends Omit<GpxImportCandidate, 'dirty'> {
  dirty: number;
}
export interface LocalLandUseReviewResult extends Omit<LandUseReviewResult, 'dirty'> {
  dirty: number;
}

export interface SyncMeta {
  key: string;
  value: string;
}

export interface LocalUserSettings {
  user_id: string;
  roof_load_threshold_lbs: number;
  roof_share_warn: number;
  roof_share_alert: number;
  created_at: string;
  updated_at: string;
}

class ECSDatabase extends Dexie {
  trips!: Table<LocalTrip, string>;
  risk_scores!: Table<LocalRiskScore, string>;
  load_items!: Table<LocalLoadItem, string>;
  load_map_slots!: Table<LocalLoadMapSlot, string>;
  fuel_water_logs!: Table<LocalFuelWaterLog, string>;
  waypoints!: Table<LocalWaypoint, string>;
  camp_sites!: Table<LocalCampSite, string>;
  camp_site_reports!: Table<LocalCampSiteReport, string>;
  camp_site_flags!: Table<LocalCampSiteFlag, string>;
  camp_site_photos!: Table<LocalCampSitePhoto, string>;
  camp_site_groups!: Table<LocalCampSiteGroup, string>;
  camp_site_group_memberships!: Table<LocalCampSiteGroupMembership, string>;
  camp_site_group_shares!: Table<LocalCampSiteGroupShare, string>;
  camp_site_review_votes!: Table<LocalCampSiteReviewVote, string>;
  camp_site_review_events!: Table<LocalCampSiteReviewEvent, string>;
  camp_site_reviewer_profiles!: Table<LocalCampSiteReviewerProfile, string>;
  gpx_imports!: Table<LocalGpxImport, string>;
  gpx_import_candidates!: Table<LocalGpxImportCandidate, string>;
  land_use_review_results!: Table<LocalLandUseReviewResult, string>;
  sync_meta!: Table<SyncMeta, string>;
  user_settings!: Table<LocalUserSettings, string>;

  constructor() {
    super("ExpeditionCommandSystem");

    // v1 (legacy) - keep for existing installs
    this.version(1).stores({
      trips: "&id, user_id, updated_at, deleted_at, dirty",
      risk_scores: "&id, trip_id, user_id, deleted_at, dirty",
      load_items: "&id, trip_id, user_id, deleted_at, dirty, sort_order, zone",
      load_map_slots:
        "&id, trip_id, user_id, slot_key, deleted_at, dirty, [trip_id+slot_key]",
      fuel_water_logs: "&id, trip_id, user_id, deleted_at, dirty, log_date",
      waypoints:
        "&id, trip_id, user_id, session_id, deleted_at, dirty, recorded_at",
      sync_meta: "&key",
      user_settings: "&user_id",
    });

    // v2 (current) - schema stays the same, but bump version to ensure upgrades run
    this.version(2).stores({
      trips: "&id, user_id, updated_at, deleted_at, dirty",
      risk_scores: "&id, trip_id, user_id, deleted_at, dirty",
      load_items: "&id, trip_id, user_id, deleted_at, dirty, sort_order, zone",
      load_map_slots:
        "&id, trip_id, user_id, slot_key, deleted_at, dirty, [trip_id+slot_key]",
      fuel_water_logs: "&id, trip_id, user_id, deleted_at, dirty, log_date",
      waypoints:
        "&id, trip_id, user_id, session_id, deleted_at, dirty, recorded_at",
      sync_meta: "&key",
      user_settings: "&user_id",
    });

    // v3 - campsite recommendation persistence collections
    this.version(3).stores({
      trips: "&id, user_id, updated_at, deleted_at, dirty",
      risk_scores: "&id, trip_id, user_id, deleted_at, dirty",
      load_items: "&id, trip_id, user_id, deleted_at, dirty, sort_order, zone",
      load_map_slots:
        "&id, trip_id, user_id, slot_key, deleted_at, dirty, [trip_id+slot_key]",
      fuel_water_logs: "&id, trip_id, user_id, deleted_at, dirty, log_date",
      waypoints:
        "&id, trip_id, user_id, session_id, deleted_at, dirty, recorded_at",
      camp_sites:
        "&id, status, visibility, [status+visibility], latitude, longitude, updated_at, deleted_at, dirty",
      camp_site_reports:
        "&id, camp_site_id, submitted_by_user_id, moderation_status, updated_at, deleted_at, dirty",
      camp_site_flags: "&id, camp_site_id, user_id, created_at, deleted_at, dirty",
      camp_site_photos:
        "&id, camp_site_report_id, camp_site_id, user_id, moderation_status, created_at, deleted_at, dirty",
      sync_meta: "&key",
      user_settings: "&user_id",
    });

    // v4 - campsite recommendation idempotency for offline replay
    this.version(4).stores({
      trips: "&id, user_id, updated_at, deleted_at, dirty",
      risk_scores: "&id, trip_id, user_id, deleted_at, dirty",
      load_items: "&id, trip_id, user_id, deleted_at, dirty, sort_order, zone",
      load_map_slots:
        "&id, trip_id, user_id, slot_key, deleted_at, dirty, [trip_id+slot_key]",
      fuel_water_logs: "&id, trip_id, user_id, deleted_at, dirty, log_date",
      waypoints:
        "&id, trip_id, user_id, session_id, deleted_at, dirty, recorded_at",
      camp_sites:
        "&id, status, visibility, [status+visibility], latitude, longitude, updated_at, deleted_at, dirty",
      camp_site_reports:
        "&id, camp_site_id, submitted_by_user_id, client_submission_id, moderation_status, updated_at, deleted_at, dirty",
      camp_site_flags: "&id, camp_site_id, user_id, created_at, deleted_at, dirty",
      camp_site_photos:
        "&id, camp_site_report_id, camp_site_id, user_id, moderation_status, created_at, deleted_at, dirty",
      sync_meta: "&key",
      user_settings: "&user_id",
    });

    // v5 - campsite community review wall persistence
    this.version(5).stores({
      trips: "&id, user_id, updated_at, deleted_at, dirty",
      risk_scores: "&id, trip_id, user_id, deleted_at, dirty",
      load_items: "&id, trip_id, user_id, deleted_at, dirty, sort_order, zone",
      load_map_slots:
        "&id, trip_id, user_id, slot_key, deleted_at, dirty, [trip_id+slot_key]",
      fuel_water_logs: "&id, trip_id, user_id, deleted_at, dirty, log_date",
      waypoints:
        "&id, trip_id, user_id, session_id, deleted_at, dirty, recorded_at",
      camp_sites:
        "&id, status, visibility, [status+visibility], latitude, longitude, updated_at, deleted_at, dirty",
      camp_site_reports:
        "&id, camp_site_id, submitted_by_user_id, client_submission_id, moderation_status, review_state, updated_at, deleted_at, dirty",
      camp_site_flags: "&id, camp_site_id, user_id, created_at, deleted_at, dirty",
      camp_site_photos:
        "&id, camp_site_report_id, camp_site_id, user_id, moderation_status, created_at, deleted_at, dirty",
      camp_site_review_votes:
        "&id, camp_site_report_id, reviewer_user_id, &[camp_site_report_id+reviewer_user_id], vote, updated_at, deleted_at, dirty",
      camp_site_review_events:
        "&id, camp_site_report_id, actor_user_id, event_type, created_at, deleted_at, dirty",
      camp_site_reviewer_profiles:
        "&id, &user_id, reviewer_status, reputation_score, updated_at, deleted_at, dirty",
      sync_meta: "&key",
      user_settings: "&user_id",
    });

    // v6 - private GPX campsite import foundation
    this.version(6).stores({
      trips: "&id, user_id, updated_at, deleted_at, dirty",
      risk_scores: "&id, trip_id, user_id, deleted_at, dirty",
      load_items: "&id, trip_id, user_id, deleted_at, dirty, sort_order, zone",
      load_map_slots:
        "&id, trip_id, user_id, slot_key, deleted_at, dirty, [trip_id+slot_key]",
      fuel_water_logs: "&id, trip_id, user_id, deleted_at, dirty, log_date",
      waypoints:
        "&id, trip_id, user_id, session_id, deleted_at, dirty, recorded_at",
      camp_sites:
        "&id, status, visibility, [status+visibility], latitude, longitude, updated_at, deleted_at, dirty",
      camp_site_reports:
        "&id, camp_site_id, submitted_by_user_id, client_submission_id, moderation_status, review_state, updated_at, deleted_at, dirty",
      camp_site_flags: "&id, camp_site_id, user_id, created_at, deleted_at, dirty",
      camp_site_photos:
        "&id, camp_site_report_id, camp_site_id, user_id, moderation_status, created_at, deleted_at, dirty",
      camp_site_review_votes:
        "&id, camp_site_report_id, reviewer_user_id, &[camp_site_report_id+reviewer_user_id], vote, updated_at, deleted_at, dirty",
      camp_site_review_events:
        "&id, camp_site_report_id, actor_user_id, event_type, created_at, deleted_at, dirty",
      camp_site_reviewer_profiles:
        "&id, &user_id, reviewer_status, reputation_score, updated_at, deleted_at, dirty",
      gpx_imports:
        "&id, user_id, client_import_id, status, created_at, updated_at, deleted_at, dirty",
      gpx_import_candidates:
        "&id, gpx_import_id, user_id, candidate_type, selected_for_save, selected_for_community_submission, created_at, updated_at, deleted_at, dirty",
      sync_meta: "&key",
      user_settings: "&user_id",
    });

    // v7 - campsite private group sharing
    this.version(7).stores({
      trips: "&id, user_id, updated_at, deleted_at, dirty",
      risk_scores: "&id, trip_id, user_id, deleted_at, dirty",
      load_items: "&id, trip_id, user_id, deleted_at, dirty, sort_order, zone",
      load_map_slots:
        "&id, trip_id, user_id, slot_key, deleted_at, dirty, [trip_id+slot_key]",
      fuel_water_logs: "&id, trip_id, user_id, deleted_at, dirty, log_date",
      waypoints:
        "&id, trip_id, user_id, session_id, deleted_at, dirty, recorded_at",
      camp_sites:
        "&id, status, visibility, [status+visibility], latitude, longitude, updated_at, deleted_at, dirty",
      camp_site_reports:
        "&id, camp_site_id, submitted_by_user_id, client_submission_id, moderation_status, review_state, updated_at, deleted_at, dirty",
      camp_site_flags: "&id, camp_site_id, user_id, created_at, deleted_at, dirty",
      camp_site_photos:
        "&id, camp_site_report_id, camp_site_id, user_id, moderation_status, created_at, deleted_at, dirty",
      camp_site_groups:
        "&id, owner_user_id, visibility, updated_at, deleted_at, dirty",
      camp_site_group_memberships:
        "&id, group_id, user_id, &[group_id+user_id], role, status, updated_at, deleted_at, dirty",
      camp_site_group_shares:
        "&id, group_id, camp_site_report_id, camp_site_id, shared_by_user_id, created_at, deleted_at, dirty",
      camp_site_review_votes:
        "&id, camp_site_report_id, reviewer_user_id, &[camp_site_report_id+reviewer_user_id], vote, updated_at, deleted_at, dirty",
      camp_site_review_events:
        "&id, camp_site_report_id, actor_user_id, event_type, created_at, deleted_at, dirty",
      camp_site_reviewer_profiles:
        "&id, &user_id, reviewer_status, reputation_score, updated_at, deleted_at, dirty",
      gpx_imports:
        "&id, user_id, client_import_id, status, created_at, updated_at, deleted_at, dirty",
      gpx_import_candidates:
        "&id, gpx_import_id, user_id, candidate_type, selected_for_save, selected_for_community_submission, created_at, updated_at, deleted_at, dirty",
      sync_meta: "&key",
      user_settings: "&user_id",
    });

    // v8 - advisory land-use/sensitive-area review results
    this.version(8).stores({
      trips: "&id, user_id, updated_at, deleted_at, dirty",
      risk_scores: "&id, trip_id, user_id, deleted_at, dirty",
      load_items: "&id, trip_id, user_id, deleted_at, dirty, sort_order, zone",
      load_map_slots:
        "&id, trip_id, user_id, slot_key, deleted_at, dirty, [trip_id+slot_key]",
      fuel_water_logs: "&id, trip_id, user_id, deleted_at, dirty, log_date",
      waypoints:
        "&id, trip_id, user_id, session_id, deleted_at, dirty, recorded_at",
      camp_sites:
        "&id, status, visibility, [status+visibility], latitude, longitude, updated_at, deleted_at, dirty",
      camp_site_reports:
        "&id, camp_site_id, submitted_by_user_id, client_submission_id, moderation_status, review_state, updated_at, deleted_at, dirty",
      camp_site_flags: "&id, camp_site_id, user_id, created_at, deleted_at, dirty",
      camp_site_photos:
        "&id, camp_site_report_id, camp_site_id, user_id, moderation_status, created_at, deleted_at, dirty",
      camp_site_groups:
        "&id, owner_user_id, visibility, updated_at, deleted_at, dirty",
      camp_site_group_memberships:
        "&id, group_id, user_id, &[group_id+user_id], role, status, updated_at, deleted_at, dirty",
      camp_site_group_shares:
        "&id, group_id, camp_site_report_id, camp_site_id, shared_by_user_id, created_at, deleted_at, dirty",
      camp_site_review_votes:
        "&id, camp_site_report_id, reviewer_user_id, &[camp_site_report_id+reviewer_user_id], vote, updated_at, deleted_at, dirty",
      camp_site_review_events:
        "&id, camp_site_report_id, actor_user_id, event_type, created_at, deleted_at, dirty",
      camp_site_reviewer_profiles:
        "&id, &user_id, reviewer_status, reputation_score, updated_at, deleted_at, dirty",
      gpx_imports:
        "&id, user_id, client_import_id, status, created_at, updated_at, deleted_at, dirty",
      gpx_import_candidates:
        "&id, gpx_import_id, user_id, candidate_type, selected_for_save, selected_for_community_submission, created_at, updated_at, deleted_at, dirty",
      land_use_review_results:
        "&id, camp_site_report_id, status, created_at, deleted_at, dirty",
      sync_meta: "&key",
      user_settings: "&user_id",
    });
  }
}

// Singleton instance - only create on web where IndexedDB is available
let _db: ECSDatabase | null = null;
let _dbAvailable: boolean | null = null;

export function getDB(): ECSDatabase | null {
  if (_dbAvailable === false) return null;

  if (_db === null) {
    if (Platform.OS === "web" && typeof indexedDB !== "undefined") {
      try {
        _db = new ECSDatabase();
        _dbAvailable = true;
      } catch (e) {
        console.warn("IndexedDB not available, falling back to localStorage", e);
        _dbAvailable = false;
        return null;
      }
    } else {
      _dbAvailable = false;
      return null;
    }
  }

  return _db;
}

export async function isDBReady(): Promise<boolean> {
  const db = getDB();
  if (!db) return false;

  try {
    await db.open();
    return true;
  } catch {
    _dbAvailable = false;
    return false;
  }
}

export { ECSDatabase };
