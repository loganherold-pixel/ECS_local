/**
 * ECSAndroidAutoModule — React Native Native Module Bridge
 *
 * Provides the bridge between React Native and the native Android Auto
 * components. Allows the RN side to:
 *
 *   1. Push vehicle display data to SharedPreferences (read by AA screens)
 *   2. Set the active display mode
 *   3. Check Android Auto connection state
 *   4. Poll for pending actions from Android Auto
 *
 * Data Flow:
 *   RN calls pushMapData(json) → writes to SharedPreferences
 *   → ECSVehicleMapScreen reads on next refresh cycle
 *
 *   ECSVehicleMapScreen writes action → SharedPreferences
 *   → RN calls pollPendingAction() → gets action JSON
 *
 * This module is registered via ECSAndroidAutoPackage.
 */
package com.ecs.androidauto

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DeviceEventManagerModule

class ECSAndroidAutoModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "ECSAndroidAutoModule"
        const val MODULE_NAME = "ECSAndroidAuto"
    }

    override fun getName(): String = MODULE_NAME

    private fun getPrefs(): SharedPreferences {
        return reactApplicationContext.getSharedPreferences(
            ECSAndroidAutoConstants.PREFS_NAME,
            Context.MODE_PRIVATE
        )
    }

    // ── Connection State ────────────────────────────────────

    /**
     * Check if Android Auto is currently connected.
     */
    @ReactMethod
    fun isConnected(promise: Promise) {
        try {
            val connected = getPrefs().getBoolean(ECSAndroidAutoConstants.KEY_AA_CONNECTED, false)
            promise.resolve(connected)
        } catch (e: Exception) {
            Log.e(TAG, "isConnected failed", e)
            promise.resolve(false)
        }
    }

    /**
     * Get the timestamp of the last Android Auto event.
     */
    @ReactMethod
    fun getLastEventTimestamp(promise: Promise) {
        try {
            val ts = getPrefs().getLong(ECSAndroidAutoConstants.KEY_AA_LAST_EVENT, 0)
            promise.resolve(ts.toDouble())
        } catch (e: Exception) {
            Log.e(TAG, "getLastEventTimestamp failed", e)
            promise.resolve(0.0)
        }
    }

    // ── Display Mode ────────────────────────────────────────

    /**
     * Set the active vehicle display mode.
     * Called by the RN side when vehicleDisplayModeEngine switches modes.
     */
    @ReactMethod
    fun setDisplayMode(mode: String, promise: Promise) {
        try {
            getPrefs().edit()
                .putString(ECSAndroidAutoConstants.KEY_DISPLAY_MODE, mode)
                .apply()
            Log.d(TAG, "Display mode set: $mode")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "setDisplayMode failed", e)
            promise.resolve(false)
        }
    }

    /**
     * Get the current display mode.
     */
    @ReactMethod
    fun getDisplayMode(promise: Promise) {
        try {
            val mode = getPrefs().getString(
                ECSAndroidAutoConstants.KEY_DISPLAY_MODE,
                "highway_drive"
            )
            promise.resolve(mode)
        } catch (e: Exception) {
            Log.e(TAG, "getDisplayMode failed", e)
            promise.resolve("highway_drive")
        }
    }

    // ── Map Data ────────────────────────────────────────────

    /**
     * Push map screen data to SharedPreferences.
     * The native ECSVehicleMapScreen reads this on its refresh cycle.
     *
     * @param mapDataJson JSON string containing VehicleMapData fields
     */
    @ReactMethod
    fun pushMapData(mapDataJson: String, promise: Promise) {
        try {
            getPrefs().edit()
                .putString(ECSAndroidAutoConstants.KEY_MAP_DATA, mapDataJson)
                .apply()
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "pushMapData failed", e)
            promise.resolve(false)
        }
    }

    // ── Status Data ─────────────────────────────────────────

    /**
     * Push status screen data to SharedPreferences.
     */
    @ReactMethod
    fun pushStatusData(statusDataJson: String, promise: Promise) {
        try {
            getPrefs().edit()
                .putString(ECSAndroidAutoConstants.KEY_STATUS_DATA, statusDataJson)
                .apply()
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "pushStatusData failed", e)
            promise.resolve(false)
        }
    }
    // ── Mode State ────────────────────────────────────────────

    /**
     * Push complete mode switching state to SharedPreferences.
     * Includes mode override setting, confirmation state, and transition notices.
     *
     * The native screens read this to:
     *   - Display the mode indicator (HIGHWAY MODE / EXPEDITION MODE)
     *   - Show manual override status
     *   - Display transition notices when mode changes
     *
     * @param modeStateJson JSON string containing:
     *   mode, modeOverride, isManualOverride, inConfirmation, transitionNotice
     */
    @ReactMethod
    fun pushModeState(modeStateJson: String, promise: Promise) {
        try {
            getPrefs().edit()
                .putString(ECSAndroidAutoConstants.KEY_MODE_STATE, modeStateJson)
                .apply()
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "pushModeState failed", e)
            promise.resolve(false)
        }
    }

    // ── Breadcrumb Data ─────────────────────────────────────

    /**
     * Push breadcrumb tracker data to SharedPreferences.
     * The native ECSVehicleStatusScreen and ECSVehicleMapScreen
     * read this to display trail info and distance from start.
     */
    @ReactMethod
    fun pushBreadcrumbData(breadcrumbDataJson: String, promise: Promise) {
        try {
            getPrefs().edit()
                .putString(ECSAndroidAutoConstants.KEY_BREADCRUMB_DATA, breadcrumbDataJson)
                .apply()
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "pushBreadcrumbData failed", e)
            promise.resolve(false)
        }
    }

    // ── Weather Data ────────────────────────────────────────

    /**
     * Push weather screen data to SharedPreferences.
     * The native ECSVehicleWeatherScreen reads this on its refresh cycle.
     */
    @ReactMethod
    fun pushWeatherData(weatherDataJson: String, promise: Promise) {
        try {
            getPrefs().edit()
                .putString(ECSAndroidAutoConstants.KEY_WEATHER_DATA, weatherDataJson)
                .apply()
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "pushWeatherData failed", e)
            promise.resolve(false)
        }
    }

    // ── Actions Data ────────────────────────────────────────

    /**
     * Push actions screen data to SharedPreferences.
     * The native ECSVehicleActionsScreen reads this to determine
     * action availability and contextual state.
     *
     * @param actionsDataJson JSON string containing action availability flags,
     *                        breadcrumb state, and mode-specific context
     */
    @ReactMethod
    fun pushActionsData(actionsDataJson: String, promise: Promise) {
        try {
            getPrefs().edit()
                .putString(ECSAndroidAutoConstants.KEY_ACTIONS_DATA, actionsDataJson)
                .apply()
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "pushActionsData failed", e)
            promise.resolve(false)
        }
    }
    // ── Indicators ──────────────────────────────────────────

    /**
     * Push shared vehicle indicators to SharedPreferences.
     */
    @ReactMethod
    fun pushIndicators(indicatorsJson: String, promise: Promise) {
        try {
            getPrefs().edit()
                .putString(ECSAndroidAutoConstants.KEY_INDICATORS, indicatorsJson)
                .apply()
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "pushIndicators failed", e)
            promise.resolve(false)
        }
    }

    // ── System Health ───────────────────────────────────────

    /**
     * Push system health state from the fallback engine to SharedPreferences.
     * All native screens read this to determine fallback display behavior.
     *
     * @param healthJson JSON string containing per-subsystem health status,
     *                   overall status, status line, and last known position
     */
    @ReactMethod
    fun pushSystemHealth(healthJson: String, promise: Promise) {
        try {
            getPrefs().edit()
                .putString(ECSAndroidAutoConstants.KEY_SYSTEM_HEALTH, healthJson)
                .apply()
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "pushSystemHealth failed", e)
            promise.resolve(false)
        }
    }


    // ── Vehicle Location ────────────────────────────────────

    /**
     * Push current vehicle location to SharedPreferences.
     * Called frequently by the RN GPS tracking system.
     */
    @ReactMethod
    fun pushVehicleLocation(lat: Double, lon: Double, heading: Float, speedMph: Float, promise: Promise) {
        try {
            getPrefs().edit()
                .putFloat(ECSAndroidAutoConstants.KEY_VEHICLE_LAT, lat.toFloat())
                .putFloat(ECSAndroidAutoConstants.KEY_VEHICLE_LON, lon.toFloat())
                .putFloat(ECSAndroidAutoConstants.KEY_VEHICLE_HEADING, heading)
                .putFloat(ECSAndroidAutoConstants.KEY_VEHICLE_SPEED, speedMph)
                .apply()
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "pushVehicleLocation failed", e)
            promise.resolve(false)
        }
    }

    // ── Route State ─────────────────────────────────────────

    /**
     * Update route availability flags.
     */
    @ReactMethod
    fun pushRouteState(hasActiveRoute: Boolean, hasExpeditionTrack: Boolean, promise: Promise) {
        try {
            getPrefs().edit()
                .putBoolean(ECSAndroidAutoConstants.KEY_HAS_ACTIVE_ROUTE, hasActiveRoute)
                .putBoolean(ECSAndroidAutoConstants.KEY_HAS_EXPEDITION_TRACK, hasExpeditionTrack)
                .apply()
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "pushRouteState failed", e)
            promise.resolve(false)
        }
    }

    // ── Action Polling ──────────────────────────────────────

    /**
     * Poll for a pending action from Android Auto.
     *
     * Returns the action JSON string if one is pending, or null.
     * Automatically clears the pending action after reading.
     */
    @ReactMethod
    fun pollPendingAction(promise: Promise) {
        try {
            val prefs = getPrefs()
            val actionJson = prefs.getString(ECSAndroidAutoConstants.KEY_PENDING_ACTION, null)
            val lastConsumed = prefs.getString(ECSAndroidAutoConstants.KEY_LAST_CONSUMED_ACTION, null)

            if (actionJson != null && actionJson != lastConsumed) {
                // Mark as consumed
                prefs.edit()
                    .putString(ECSAndroidAutoConstants.KEY_LAST_CONSUMED_ACTION, actionJson)
                    .remove(ECSAndroidAutoConstants.KEY_PENDING_ACTION)
                    .apply()

                Log.d(TAG, "Action polled: $actionJson")
                promise.resolve(actionJson)
            } else {
                promise.resolve(null)
            }
        } catch (e: Exception) {
            Log.e(TAG, "pollPendingAction failed", e)
            promise.resolve(null)
        }
    }

    // ── Full State Push ─────────────────────────────────────

    /**
     * Push all vehicle display state at once.
     * More efficient than individual calls when doing a full refresh.
     */
    @ReactMethod
    fun pushFullState(
        mode: String,
        mapDataJson: String,
        indicatorsJson: String,
        promise: Promise
    ) {
        try {
            getPrefs().edit()
                .putString(ECSAndroidAutoConstants.KEY_DISPLAY_MODE, mode)
                .putString(ECSAndroidAutoConstants.KEY_MAP_DATA, mapDataJson)
                .putString(ECSAndroidAutoConstants.KEY_INDICATORS, indicatorsJson)
                .apply()

            Log.d(TAG, "Full state pushed — mode: $mode")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "pushFullState failed", e)
            promise.resolve(false)
        }
    }

    /**
     * Push all four screen data blobs at once.
     * Used for comprehensive state sync during periodic push.
     */
    @ReactMethod
    fun pushAllScreenData(
        mapDataJson: String,
        statusDataJson: String,
        weatherDataJson: String,
        actionsDataJson: String,
        promise: Promise
    ) {
        try {
            getPrefs().edit()
                .putString(ECSAndroidAutoConstants.KEY_MAP_DATA, mapDataJson)
                .putString(ECSAndroidAutoConstants.KEY_STATUS_DATA, statusDataJson)
                .putString(ECSAndroidAutoConstants.KEY_WEATHER_DATA, weatherDataJson)
                .putString(ECSAndroidAutoConstants.KEY_ACTIONS_DATA, actionsDataJson)
                .apply()

            Log.d(TAG, "All screen data pushed")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "pushAllScreenData failed", e)
            promise.resolve(false)
        }
    }

    // ── Cleanup ─────────────────────────────────────────────

    /**
     * Clear all Android Auto SharedPreferences data.
     * Called when the user logs out or resets the app.
     */
    @ReactMethod
    fun clearAll(promise: Promise) {
        try {
            getPrefs().edit().clear().apply()
            Log.d(TAG, "All Android Auto data cleared")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "clearAll failed", e)
            promise.resolve(false)
        }
    }
}
