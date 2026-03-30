/**
 * ECSCarPlayConstants — Shared Constants for CarPlay Bridge
 *
 * Defines UserDefaults keys and constant values used by both
 * the native CarPlay components and the React Native bridge module.
 *
 * Data Flow:
 *   React Native → UserDefaults → Native CarPlay screens
 *   Native CarPlay → UserDefaults → React Native (action events)
 *
 * Mirrors the Android Auto constants for consistent cross-platform behavior.
 */

import Foundation

struct ECSCarPlayConstants {
    /// UserDefaults suite name (shared between RN and CarPlay)
    static let suiteName = "group.ecs.carplay"
    
    // MARK: - Connection State
    /// Bool: whether CarPlay is currently connected
    static let keyCarPlayConnected = "cp_connected"
    /// Double: timestamp of last CarPlay event
    static let keyLastEvent = "cp_last_event"
    
    // MARK: - Display Mode
    /// String: current VehicleDisplayMode ("highway_drive" | "expedition_drive")
    static let keyDisplayMode = "display_mode"
    
    // MARK: - Mode State
    /**
     * String (JSON): complete mode switching state including:
     *   - mode: current display mode
     *   - modeOverride: "auto" | "highway" | "expedition"
     *   - isManualOverride: boolean
     *   - inConfirmation: boolean
     *   - transitionNotice: { message, newMode, timestamp } | null
     */
    static let keyModeState = "mode_state"
    
    // MARK: - Screen Data
    /// String (JSON): complete map screen data blob
    static let keyMapData = "map_data"
    /// String (JSON): complete status screen data blob
    static let keyStatusData = "status_data"
    /// String (JSON): complete weather screen data blob
    static let keyWeatherData = "weather_data"
    /// String (JSON): actions screen state and availability flags
    static let keyActionsData = "actions_data"
    
    // MARK: - Indicators
    /// String (JSON): shared vehicle indicators
    static let keyIndicators = "indicators"
    
    // MARK: - Actions
    /// String (JSON): pending action from CarPlay to React Native
    static let keyPendingAction = "pending_action"
    /// String (JSON): last consumed action (for dedup)
    static let keyLastConsumedAction = "last_consumed_action"
    
    // MARK: - Vehicle Location
    /// Double: current vehicle latitude
    static let keyVehicleLat = "vehicle_lat"
    /// Double: current vehicle longitude
    static let keyVehicleLon = "vehicle_lon"
    /// Double: current vehicle heading in degrees
    static let keyVehicleHeading = "vehicle_heading"
    /// Double: current vehicle speed in mph
    static let keyVehicleSpeed = "vehicle_speed"
    
    // MARK: - Route Data
    /// Bool: whether an active route exists
    static let keyHasActiveRoute = "has_active_route"
    /// Bool: whether an active expedition track exists
    static let keyHasExpeditionTrack = "has_expedition_track"
    
    // MARK: - Breadcrumb Data
    /// String (JSON): breadcrumb tracker state and trail data
    static let keyBreadcrumbData = "breadcrumb_data"
    
    // MARK: - Active Screen
    /// String: which screen the vehicle display is showing
    static let keyActiveScreen = "active_screen"
    
    // MARK: - System Health (Fallback Layer)
    /**
     * String (JSON): system health state from the fallback engine.
     * Contains per-subsystem availability, labels, severity, and stale info.
     * Used by all screens to show graceful fallback states.
     */
    static let keySystemHealth = "system_health"
    
    // MARK: - Helpers
    
    /// Get the shared UserDefaults instance
    static func defaults() -> UserDefaults {
        return UserDefaults(suiteName: suiteName) ?? UserDefaults.standard
    }
    
    /// Read a JSON string from UserDefaults and parse it
    static func readJSON(_ key: String) -> [String: Any]? {
        guard let jsonString = defaults().string(forKey: key),
              let data = jsonString.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return nil }
        return json
    }
    
    /// Write a dictionary as JSON string to UserDefaults
    static func writeJSON(_ key: String, value: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: value),
              let jsonString = String(data: data, encoding: .utf8)
        else { return }
        defaults().set(jsonString, forKey: key)
    }
}
