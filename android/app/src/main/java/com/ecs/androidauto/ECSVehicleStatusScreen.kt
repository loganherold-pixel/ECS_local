/**
 * ECSVehicleStatusScreen — Android Auto Status Display
 *
 * Presents a simplified trip or expedition summary on the vehicle
 * head unit depending on the active VehicleDisplayMode.
 *
 * HighwayDrive:
 *   - Trip distance
 *   - Trip duration
 *   - Daylight remaining
 *   - Connectivity forecast
 *
 * ExpeditionDrive:
 *   - Remoteness index
 *   - Distance from start (from breadcrumb tracker)
 *   - Elevation gain
 *   - Vehicle systems summary
 *   - Weather risk
 *
 * Mode Indicator:
 *   - Shows mode label in the screen title
 *   - Displays transition notices when mode changes
 *
 * Architecture:
 *   - Extends Screen (Android for Cars App Library)
 *   - Uses PaneTemplate for driver-safe info display
 *   - Reads data from SharedPreferences (written by RN bridge)
 *   - Refreshes on a 3-second timer
 *   - Does NOT modify the mobile ECS dashboard
 */
package com.ecs.androidauto

import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.car.app.CarContext
import androidx.car.app.Screen
import androidx.car.app.model.Action
import androidx.car.app.model.ActionStrip
import androidx.car.app.model.CarColor
import androidx.car.app.model.Pane
import androidx.car.app.model.PaneTemplate
import androidx.car.app.model.Row
import androidx.car.app.model.Template
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import org.json.JSONObject

class ECSVehicleStatusScreen(carContext: CarContext) : Screen(carContext) {

    companion object {
        private const val TAG = "ECSVehicleStatusScreen"
        private const val REFRESH_INTERVAL_MS = 3000L
    }

    private val handler = Handler(Looper.getMainLooper())
    private var isActive = true

    // Cached display data
    private var displayMode: String = "highway_drive"

    // HighwayDrive data
    private var tripDistanceMi: Double? = null
    private var tripDurationHrs: Double? = null
    private var daylightRemainingHrs: Double? = null
    private var connectivityForecast: String = "unknown"

    // ExpeditionDrive data
    private var remotenessIndex: Int? = null
    private var remotenessTier: String? = null
    private var distanceFromStartMi: Double? = null
    private var elevationGainFt: Int? = null
    private var weatherRisk: String = "unknown"
    private var vehicleSystemsCount: Int = 0
    private var vehicleSystemsNominal: Int = 0

    // Breadcrumb data
    private var breadcrumbPointCount: Int = 0
    private var breadcrumbTrailDistanceMi: Double? = null
    private var breadcrumbIsRecording: Boolean = false
    private var breadcrumbCanReturnToStart: Boolean = false
    private var breadcrumbBearingToStart: Int? = null

    // Mode state
    private var modeOverride: String = "auto"
    private var isManualOverride: Boolean = false
    private var transitionNoticeMessage: String? = null
    private var transitionNoticeTimestamp: Long = 0

    /**
     * Periodic refresh runnable.
     */
    private val refreshRunnable = object : Runnable {
        override fun run() {
            if (!isActive) return
            readStatusData()
            readModeState()
            writeActiveScreen("status")
            invalidate()
            handler.postDelayed(this, REFRESH_INTERVAL_MS)
        }
    }

    init {
        lifecycle.addObserver(
            LifecycleEventObserver { _, event ->
                when (event) {
                    Lifecycle.Event.ON_START -> {
                        if (!isActive) {
                            isActive = true
                            handler.removeCallbacks(refreshRunnable)
                            handler.post(refreshRunnable)
                        }
                    }
                    Lifecycle.Event.ON_STOP,
                    Lifecycle.Event.ON_DESTROY -> {
                        isActive = false
                        handler.removeCallbacks(refreshRunnable)
                        Log.d(TAG, "ECSVehicleStatusScreen lifecycle cleanup: $event")
                    }
                    else -> Unit
                }
            }
        )
        handler.postDelayed(refreshRunnable, REFRESH_INTERVAL_MS)
        readStatusData()
        readModeState()
        writeActiveScreen("status")
        Log.i(TAG, "ECSVehicleStatusScreen initialized")
    }

    /**
     * Read the latest status data from SharedPreferences.
     */
    private fun readStatusData() {
        try {
            val prefs = carContext.getSharedPreferences(
                ECSAndroidAutoConstants.PREFS_NAME,
                android.content.Context.MODE_PRIVATE
            )

            displayMode = prefs.getString(
                ECSAndroidAutoConstants.KEY_DISPLAY_MODE,
                "highway_drive"
            ) ?: "highway_drive"

            val statusJson = prefs.getString(ECSAndroidAutoConstants.KEY_STATUS_DATA, null)
            if (statusJson != null) {
                val json = JSONObject(statusJson)

                tripDistanceMi = if (json.has("tripDistanceMiles") && !json.isNull("tripDistanceMiles"))
                    json.optDouble("tripDistanceMiles") else null
                tripDurationHrs = if (json.has("tripDurationHours") && !json.isNull("tripDurationHours"))
                    json.optDouble("tripDurationHours") else null
                daylightRemainingHrs = if (json.has("daylightRemainingHours") && !json.isNull("daylightRemainingHours"))
                    json.optDouble("daylightRemainingHours") else null
                connectivityForecast = json.optString("connectivityForecast", "unknown")

                remotenessIndex = if (json.has("remotenessIndex") && !json.isNull("remotenessIndex"))
                    json.optInt("remotenessIndex") else null
                remotenessTier = if (json.has("remotenessTier") && !json.isNull("remotenessTier"))
                    json.optString("remotenessTier") else null
                distanceFromStartMi = if (json.has("distanceFromStartMiles") && !json.isNull("distanceFromStartMiles"))
                    json.optDouble("distanceFromStartMiles") else null
                elevationGainFt = if (json.has("elevationGainFt") && !json.isNull("elevationGainFt"))
                    json.optInt("elevationGainFt") else null
                weatherRisk = json.optString("weatherRisk", "unknown")

                val systemsArr = json.optJSONArray("vehicleSystemsSummary")
                if (systemsArr != null) {
                    vehicleSystemsCount = systemsArr.length()
                    var nominal = 0
                    for (i in 0 until systemsArr.length()) {
                        val sys = systemsArr.optJSONObject(i)
                        if (sys?.optString("status") == "nominal") nominal++
                    }
                    vehicleSystemsNominal = nominal
                }
            }

            // Read breadcrumb data
            val breadcrumbJson = prefs.getString(ECSAndroidAutoConstants.KEY_BREADCRUMB_DATA, null)
            if (breadcrumbJson != null) {
                val json = JSONObject(breadcrumbJson)
                breadcrumbPointCount = json.optInt("pointCount", 0)
                breadcrumbTrailDistanceMi = if (json.has("totalTrailDistanceMi") && !json.isNull("totalTrailDistanceMi"))
                    json.optDouble("totalTrailDistanceMi") else null
                breadcrumbIsRecording = json.optBoolean("isRecording", false)
                breadcrumbCanReturnToStart = json.optBoolean("canReturnToStart", false)
                breadcrumbBearingToStart = if (json.has("bearingToStartDeg") && !json.isNull("bearingToStartDeg"))
                    json.optInt("bearingToStartDeg") else null

                val bcDistFromStart = if (json.has("distanceFromStartMi") && !json.isNull("distanceFromStartMi"))
                    json.optDouble("distanceFromStartMi") else null
                if (bcDistFromStart != null) {
                    distanceFromStartMi = bcDistFromStart
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to read status data", e)
        }
    }

    /**
     * Read mode switching state from SharedPreferences.
     */
    private fun readModeState() {
        try {
            val prefs = carContext.getSharedPreferences(
                ECSAndroidAutoConstants.PREFS_NAME,
                android.content.Context.MODE_PRIVATE
            )

            val modeStateJson = prefs.getString(ECSAndroidAutoConstants.KEY_MODE_STATE, null)
            if (modeStateJson != null) {
                val json = JSONObject(modeStateJson)
                modeOverride = json.optString("modeOverride", "auto")
                isManualOverride = json.optBoolean("isManualOverride", false)

                val noticeObj = json.optJSONObject("transitionNotice")
                if (noticeObj != null) {
                    transitionNoticeMessage = noticeObj.optString("message", null)
                    transitionNoticeTimestamp = noticeObj.optLong("timestamp", 0)
                } else {
                    transitionNoticeMessage = null
                    transitionNoticeTimestamp = 0
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to read mode state", e)
        }
    }

    private fun writeActiveScreen(screen: String) {
        try {
            val prefs = carContext.getSharedPreferences(
                ECSAndroidAutoConstants.PREFS_NAME,
                android.content.Context.MODE_PRIVATE
            )
            prefs.edit()
                .putString(ECSAndroidAutoConstants.KEY_ACTIVE_SCREEN, screen)
                .apply()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to write active screen", e)
        }
    }

    /**
     * Build the screen title with mode indicator.
     */
    private fun buildTitle(): String {
        val modeTag = if (displayMode == "expedition_drive") "EXP" else "HWY"
        val overrideTag = if (isManualOverride) " (Manual)" else ""
        val baseTitle = if (displayMode == "expedition_drive") "EXPEDITION STATUS" else "TRIP STATUS"
        return "$baseTitle \u2022 $modeTag$overrideTag"
    }

    /**
     * Check if a transition notice should be shown.
     */
    private fun hasActiveTransitionNotice(): Boolean {
        if (transitionNoticeMessage == null) return false
        return System.currentTimeMillis() - transitionNoticeTimestamp < 5000
    }

    override fun onGetTemplate(): Template {
        return try {
            if (displayMode == "expedition_drive") {
                buildExpeditionStatusTemplate()
            } else {
                buildHighwayStatusTemplate()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to build status template", e)
            buildFallbackTemplate()
        }
    }

    // ── HighwayDrive Status Template ────────────────────────

    private fun buildHighwayStatusTemplate(): Template {
        val paneBuilder = Pane.Builder()

        // Show transition notice if active
        if (hasActiveTransitionNotice()) {
            paneBuilder.addRow(
                Row.Builder()
                    .setTitle(transitionNoticeMessage ?: "Mode changed")
                    .build()
            )
        }

        val distText = if (tripDistanceMi != null) {
            String.format("%.1f mi", tripDistanceMi)
        } else "--"
        paneBuilder.addRow(
            Row.Builder()
                .setTitle("Trip Distance")
                .addText(distText)
                .build()
        )

        val durText = if (tripDurationHrs != null) {
            if (tripDurationHrs!! < 1.0) {
                "${(tripDurationHrs!! * 60).toInt()} min"
            } else {
                String.format("%.1f hrs", tripDurationHrs)
            }
        } else "--"
        paneBuilder.addRow(
            Row.Builder()
                .setTitle("Trip Duration")
                .addText(durText)
                .build()
        )

        val dayText = if (daylightRemainingHrs != null) {
            String.format("%.1f hrs", daylightRemainingHrs)
        } else "--"
        paneBuilder.addRow(
            Row.Builder()
                .setTitle("Daylight Remaining")
                .addText(dayText)
                .build()
        )

        paneBuilder.addRow(
            Row.Builder()
                .setTitle("Connectivity")
                .addText(connectivityForecast.uppercase())
                .build()
        )

        paneBuilder.addAction(
            Action.Builder()
                .setTitle("Map")
                .setOnClickListener { navigateToMap() }
                .build()
        )

        paneBuilder.addAction(
            Action.Builder()
                .setTitle("Weather")
                .setOnClickListener { navigateToWeather() }
                .build()
        )

        return PaneTemplate.Builder(paneBuilder.build())
            .setTitle(buildTitle())
            .setHeaderAction(Action.BACK)
            .setActionStrip(buildActionStrip())
            .build()
    }

    // ── ExpeditionDrive Status Template ─────────────────────

    private fun buildExpeditionStatusTemplate(): Template {
        val paneBuilder = Pane.Builder()

        // Show transition notice if active
        if (hasActiveTransitionNotice()) {
            paneBuilder.addRow(
                Row.Builder()
                    .setTitle(transitionNoticeMessage ?: "Mode changed")
                    .build()
            )
        }

        val remoteText = if (remotenessIndex != null) {
            val tier = remotenessTier ?: ""
            "$remotenessIndex $tier"
        } else "--"
        paneBuilder.addRow(
            Row.Builder()
                .setTitle("Remoteness")
                .addText(remoteText)
                .build()
        )

        val distStartText = if (distanceFromStartMi != null) {
            String.format("%.1f mi", distanceFromStartMi)
        } else "--"
        val distStartSubtext = if (breadcrumbIsRecording) {
            "$breadcrumbPointCount pts recorded"
        } else if (breadcrumbPointCount > 0) {
            "Recording paused"
        } else {
            "No breadcrumbs"
        }
        paneBuilder.addRow(
            Row.Builder()
                .setTitle("Distance from Start")
                .addText("$distStartText  \u2022  $distStartSubtext")
                .build()
        )

        val elevText = if (elevationGainFt != null) {
            "${elevationGainFt!!.toInt()} ft"
        } else "--"
        paneBuilder.addRow(
            Row.Builder()
                .setTitle("Elevation Gain")
                .addText(elevText)
                .build()
        )

        val sysText = if (vehicleSystemsCount > 0) {
            "$vehicleSystemsNominal / $vehicleSystemsCount nominal"
        } else "All systems nominal"
        paneBuilder.addRow(
            Row.Builder()
                .setTitle("Vehicle Systems")
                .addText(sysText)
                .build()
        )

        paneBuilder.addAction(
            Action.Builder()
                .setTitle("Map")
                .setOnClickListener { navigateToMap() }
                .build()
        )

        if (breadcrumbCanReturnToStart) {
            paneBuilder.addAction(
                Action.Builder()
                    .setTitle("Return to Start")
                    .setOnClickListener { handleAction("return_to_start") }
                    .build()
            )
        } else {
            paneBuilder.addAction(
                Action.Builder()
                    .setTitle("Actions")
                    .setOnClickListener { navigateToActions() }
                    .build()
            )
        }

        return PaneTemplate.Builder(paneBuilder.build())
            .setTitle(buildTitle())
            .setHeaderAction(Action.BACK)
            .setActionStrip(buildActionStrip())
            .build()
    }

    // ── Shared Components ───────────────────────────────────

    private fun buildActionStrip(): ActionStrip {
        val builder = ActionStrip.Builder()

        builder.addAction(
            Action.Builder()
                .setTitle("Weather")
                .setOnClickListener { navigateToWeather() }
                .build()
        )

        builder.addAction(
            Action.Builder()
                .setTitle("Actions")
                .setOnClickListener { navigateToActions() }
                .build()
        )

        return builder.build()
    }

    private fun buildFallbackTemplate(): Template {
        val pane = Pane.Builder()
            .addRow(
                Row.Builder()
                    .setTitle("Status data loading...")
                    .build()
            )
            .addAction(
                Action.Builder()
                    .setTitle("Retry")
                    .setOnClickListener { invalidate() }
                    .build()
            )
            .build()

        return PaneTemplate.Builder(pane)
            .setTitle("ECS STATUS")
            .setHeaderAction(Action.BACK)
            .build()
    }

    // ── Navigation ──────────────────────────────────────────

    private fun navigateToMap() {
        screenManager.popToRoot()
    }

    private fun navigateToWeather() {
        screenManager.push(ECSVehicleWeatherScreen(carContext))
    }

    private fun navigateToActions() {
        screenManager.push(ECSVehicleActionsScreen(carContext))
    }

    // ── Action Handling ─────────────────────────────────────

    private fun handleAction(actionType: String) {
        Log.i(TAG, "Action triggered: $actionType")
        try {
            val prefs = carContext.getSharedPreferences(
                ECSAndroidAutoConstants.PREFS_NAME,
                android.content.Context.MODE_PRIVATE
            )

            val actionJson = JSONObject().apply {
                put("actionType", actionType)
                put("timestamp", System.currentTimeMillis())
                put("mode", displayMode)
                put("source", "android_auto_status")
            }

            prefs.edit()
                .putString(ECSAndroidAutoConstants.KEY_PENDING_ACTION, actionJson.toString())
                .putLong(ECSAndroidAutoConstants.KEY_AA_LAST_EVENT, System.currentTimeMillis())
                .apply()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to write action", e)
        }
    }

    // ── Lifecycle ───────────────────────────────────────────

}
