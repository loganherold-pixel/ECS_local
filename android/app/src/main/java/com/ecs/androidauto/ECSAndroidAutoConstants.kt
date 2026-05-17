/**
 * ECSAndroidAutoConstants — Shared Constants for Android Auto Bridge
 *
 * Defines SharedPreferences keys and constant values used by both
 * the native Android Auto components and the React Native bridge module.
 *
 * Data Flow:
 *   React Native → SharedPreferences → Native Android Auto screens
 *   Native Android Auto → SharedPreferences → React Native (action events)
 */
package com.ecs.androidauto

object ECSAndroidAutoConstants {
    /** SharedPreferences file name */
    const val PREFS_NAME = "ecs_android_auto"

    // ── Connection State ────────────────────────────────────
    /** Boolean: whether Android Auto is currently connected */
    const val KEY_AA_CONNECTED = "aa_connected"
    /** Long: timestamp of last Android Auto event */
    const val KEY_AA_LAST_EVENT = "aa_last_event"

    // ── Display Mode ────────────────────────────────────────
    /** String: current VehicleDisplayMode ("highway_drive" | "expedition_drive") */
    const val KEY_DISPLAY_MODE = "display_mode"

    // ── Mode State ──────────────────────────────────────────
    /**
     * String (JSON): complete mode switching state including:
     *   - mode: current display mode
     *   - modeOverride: "auto" | "highway" | "expedition"
     *   - isManualOverride: boolean
     *   - inConfirmation: boolean
     *   - transitionNotice: { message, newMode, timestamp } | null
     */
    const val KEY_MODE_STATE = "mode_state"

    // ── Map Screen Data ─────────────────────────────────────
    /** String (JSON): complete map screen data blob */
    const val KEY_MAP_DATA = "map_data"

    // ── Status Screen Data ──────────────────────────────────
    /** String (JSON): complete status screen data blob */
    const val KEY_STATUS_DATA = "status_data"

    // ── Weather Screen Data ─────────────────────────────────
    /** String (JSON): complete weather screen data blob */
    const val KEY_WEATHER_DATA = "weather_data"

    // ── Actions Screen Data ─────────────────────────────────
    /** String (JSON): actions screen state and availability flags */
    const val KEY_ACTIONS_DATA = "actions_data"

    // ── Indicators ──────────────────────────────────────────
    /** String (JSON): shared vehicle indicators */
    const val KEY_INDICATORS = "indicators"

    // ── Actions ─────────────────────────────────────────────
    /** String (JSON): pending action from Android Auto to React Native */
    const val KEY_PENDING_ACTION = "pending_action"
    /** String (JSON): last consumed action (for dedup) */
    const val KEY_LAST_CONSUMED_ACTION = "last_consumed_action"

    // ── Vehicle Location ────────────────────────────────────
    /** Double: current vehicle latitude */
    const val KEY_VEHICLE_LAT = "vehicle_lat"
    /** Double: current vehicle longitude */
    const val KEY_VEHICLE_LON = "vehicle_lon"
    /** Float: current vehicle heading in degrees */
    const val KEY_VEHICLE_HEADING = "vehicle_heading"
    /** Float: current vehicle speed in mph */
    const val KEY_VEHICLE_SPEED = "vehicle_speed"

    // ── Route Data ──────────────────────────────────────────
    /** Boolean: whether an active route exists */
    const val KEY_HAS_ACTIVE_ROUTE = "has_active_route"
    /** Boolean: whether an active expedition track exists */
    const val KEY_HAS_EXPEDITION_TRACK = "has_expedition_track"

    // ── Breadcrumb Data ─────────────────────────────────────
    /** String (JSON): breadcrumb tracker state and trail data */
    const val KEY_BREADCRUMB_DATA = "breadcrumb_data"

    // ── Active Screen ───────────────────────────────────────
    /** String: which screen the vehicle display is showing */
    const val KEY_ACTIVE_SCREEN = "active_screen"

    // ── System Health (Fallback Layer) ──────────────────────
    /**
     * String (JSON): system health state from the fallback engine.
     * Contains per-subsystem availability, labels, severity, and stale info.
     * Used by all screens to show graceful fallback states.
     */
    const val KEY_SYSTEM_HEALTH = "system_health"
}
