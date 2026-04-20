/**
 * ECSVehicleMapScreen — Android Auto Map Display
 *
 * The primary vehicle display screen for Android Auto.
 * Renders a driver-safe navigation interface using the
 * Android for Cars NavigationTemplate.
 *
 * Reads from VehicleDisplayMode (via SharedPreferences) to determine
 * which content to display:
 *
 * HighwayDrive:
 *   - Route line indicator
 *   - Next maneuver
 *   - Distance remaining
 *   - ETA
 *
 * ExpeditionDrive:
 *   - Breadcrumb trail indicator
 *   - Imported GPX route status
 *   - Off-route alert
 *   - Elevation shading indicator
 *
 * Mode Indicator:
 *   - Shows "HIGHWAY MODE" or "EXPEDITION MODE" in the background info
 *   - Displays transition notices when mode changes automatically
 *   - Shows manual override status when active
 *
 * Navigation to other vehicle screens:
 *   - Status (trip/expedition summary)
 *   - Weather (conditions and forecasts)
 *   - Actions (driver-safe action buttons)
 *
 * Architecture:
 *   - Extends Screen (Android for Cars App Library)
 *   - Uses NavigationTemplate for map display
 *   - Reads data from SharedPreferences (written by RN bridge)
 *   - Refreshes on a timer to pick up data changes
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
import androidx.car.app.model.CarIcon
import androidx.car.app.model.Distance
import androidx.car.app.model.Template
import androidx.car.app.model.MessageTemplate
import androidx.car.app.navigation.model.NavigationTemplate
import androidx.car.app.navigation.model.RoutingInfo
import androidx.car.app.navigation.model.Step
import androidx.car.app.navigation.model.Maneuver
import androidx.car.app.navigation.model.TravelEstimate
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import org.json.JSONObject

class ECSVehicleMapScreen(carContext: CarContext) : Screen(carContext) {

    companion object {
        private const val TAG = "ECSVehicleMapScreen"
        private const val REFRESH_INTERVAL_MS = 3000L
    }

    private val handler = Handler(Looper.getMainLooper())
    private var isActive = true

    // Cached display data
    private var displayMode: String = "highway_drive"
    private var speedMph: Double = 0.0
    private var headingDeg: Double = 0.0
    private var nextManeuver: String? = null
    private var distanceRemainingMiles: Double? = null
    private var etaMinutes: Int? = null
    private var hasRoute: Boolean = false
    private var breadcrumbTrail: Boolean = false
    private var importedGpxRoute: Boolean = false
    private var offRouteAlert: Boolean = false
    private var offRouteDistanceFt: Double? = null
    private var elevationShading: Boolean = false
    private var offlineMapIndicator: Boolean = false
    private var currentLat: Double? = null
    private var currentLon: Double? = null

    // Breadcrumb tracker data
    private var breadcrumbPointCount: Int = 0
    private var breadcrumbDistanceFromStartMi: Double? = null
    private var breadcrumbTrailDistanceMi: Double? = null
    private var breadcrumbIsRecording: Boolean = false
    private var breadcrumbCanReturnToStart: Boolean = false
    private var breadcrumbIsReturningToStart: Boolean = false
    private var breadcrumbBearingToStartDeg: Int? = null

    // Mode state data
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
            readDisplayData()
            readBreadcrumbData()
            readModeState()
            writeActiveScreen("map")
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
                        Log.d(TAG, "ECSVehicleMapScreen lifecycle cleanup: $event")
                    }
                    else -> Unit
                }
            }
        )
        handler.postDelayed(refreshRunnable, REFRESH_INTERVAL_MS)
        readDisplayData()
        readBreadcrumbData()
        readModeState()
        writeActiveScreen("map")
        Log.i(TAG, "ECSVehicleMapScreen initialized — default vehicle screen")
    }

    /**
     * Read the latest vehicle display data from SharedPreferences.
     */
    private fun readDisplayData() {
        try {
            val prefs = carContext.getSharedPreferences(
                ECSAndroidAutoConstants.PREFS_NAME,
                android.content.Context.MODE_PRIVATE
            )

            val mapDataJson = prefs.getString(ECSAndroidAutoConstants.KEY_MAP_DATA, null)
            if (mapDataJson != null) {
                val json = JSONObject(mapDataJson)
                displayMode = json.optString("mode", "highway_drive")
                speedMph = json.optDouble("speedMph", 0.0)
                headingDeg = json.optDouble("headingDeg", 0.0)
                nextManeuver = json.optString("nextManeuver", null)
                distanceRemainingMiles = if (json.has("distanceRemainingMiles")) json.optDouble("distanceRemainingMiles") else null
                etaMinutes = if (json.has("etaMinutes")) json.optInt("etaMinutes") else null
                hasRoute = json.optBoolean("routeLine", false)
                breadcrumbTrail = json.optBoolean("breadcrumbTrail", false)
                importedGpxRoute = json.optBoolean("importedGpxRoute", false)
                offRouteAlert = json.optBoolean("offRouteAlert", false)
                offRouteDistanceFt = if (json.has("offRouteDistanceFt")) json.optDouble("offRouteDistanceFt") else null
                elevationShading = json.optBoolean("elevationShading", false)
                offlineMapIndicator = json.optBoolean("offlineMapIndicator", false)
                currentLat = if (json.has("currentLat") && !json.isNull("currentLat")) json.optDouble("currentLat") else null
                currentLon = if (json.has("currentLon") && !json.isNull("currentLon")) json.optDouble("currentLon") else null
            } else {
                displayMode = prefs.getString(ECSAndroidAutoConstants.KEY_DISPLAY_MODE, "highway_drive") ?: "highway_drive"
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to read display data", e)
        }
    }

    /**
     * Read breadcrumb tracker data from SharedPreferences.
     */
    private fun readBreadcrumbData() {
        try {
            val prefs = carContext.getSharedPreferences(
                ECSAndroidAutoConstants.PREFS_NAME,
                android.content.Context.MODE_PRIVATE
            )

            val breadcrumbJson = prefs.getString(ECSAndroidAutoConstants.KEY_BREADCRUMB_DATA, null)
            if (breadcrumbJson != null) {
                val json = JSONObject(breadcrumbJson)
                breadcrumbPointCount = json.optInt("pointCount", 0)
                breadcrumbDistanceFromStartMi = if (json.has("distanceFromStartMi") && !json.isNull("distanceFromStartMi"))
                    json.optDouble("distanceFromStartMi") else null
                breadcrumbTrailDistanceMi = if (json.has("totalTrailDistanceMi") && !json.isNull("totalTrailDistanceMi"))
                    json.optDouble("totalTrailDistanceMi") else null
                breadcrumbIsRecording = json.optBoolean("isRecording", false)
                breadcrumbCanReturnToStart = json.optBoolean("canReturnToStart", false)
                breadcrumbIsReturningToStart = json.optBoolean("isReturningToStart", false)
                breadcrumbBearingToStartDeg = if (json.has("bearingToStartDeg") && !json.isNull("bearingToStartDeg"))
                    json.optInt("bearingToStartDeg") else null
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to read breadcrumb data", e)
        }
    }

    /**
     * Read mode switching state from SharedPreferences.
     * Includes override setting and transition notices.
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

                // Read transition notice
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

    /**
     * Write the active screen identifier to SharedPreferences.
     */
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
     * Build the mode indicator label for the screen.
     */
    private fun getModeIndicator(): String {
        return if (displayMode == "expedition_drive") "EXP" else "HWY"
    }

    /**
     * Check if a transition notice should be shown (within last 5 seconds).
     */
    private fun hasActiveTransitionNotice(): Boolean {
        if (transitionNoticeMessage == null) return false
        return System.currentTimeMillis() - transitionNoticeTimestamp < 5000
    }

    /**
     * Build the NavigationTemplate for Android Auto.
     */
    override fun onGetTemplate(): Template {
        return try {
            if (displayMode == "expedition_drive") {
                buildExpeditionTemplate()
            } else {
                buildHighwayTemplate()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to build template", e)
            buildFallbackTemplate()
        }
    }

    // ── HighwayDrive Template ───────────────────────────────

    private fun buildHighwayTemplate(): Template {
        val builder = NavigationTemplate.Builder()

        // Action strip with mode indicator and screen navigation
        val actionStripBuilder = ActionStrip.Builder()

        // Mode indicator as first action (subtle, always visible)
        val modeLabel = if (isManualOverride) "HWY (Manual)" else "HWY"
        actionStripBuilder.addAction(
            Action.Builder()
                .setTitle(modeLabel)
                .setOnClickListener { /* Mode indicator — no action on map */ }
                .build()
        )

        actionStripBuilder.addAction(
            Action.Builder()
                .setTitle("Status")
                .setOnClickListener { navigateToStatus() }
                .build()
        )

        actionStripBuilder.addAction(
            Action.Builder()
                .setTitle("Actions")
                .setOnClickListener { navigateToActions() }
                .build()
        )

        builder.setActionStrip(actionStripBuilder.build())

        // Map action strip
        val mapActionStripBuilder = ActionStrip.Builder()
        mapActionStripBuilder.addAction(Action.PAN)

        mapActionStripBuilder.addAction(
            Action.Builder()
                .setTitle("Waypoint")
                .setOnClickListener { handleAction("add_waypoint") }
                .build()
        )

        builder.setMapActionStrip(mapActionStripBuilder.build())

        // Navigation info
        if (hasRoute && distanceRemainingMiles != null) {
            val stepBuilder = Step.Builder()

            if (nextManeuver != null) {
                val maneuver = Maneuver.Builder(Maneuver.TYPE_STRAIGHT).build()
                stepBuilder.setManeuver(maneuver)
                stepBuilder.setCue(nextManeuver!!)
            } else {
                val maneuver = Maneuver.Builder(Maneuver.TYPE_STRAIGHT).build()
                stepBuilder.setManeuver(maneuver)
                stepBuilder.setCue("Continue straight")
            }

            val distanceMeters = (distanceRemainingMiles ?: 0.0) * 1609.34

            // Show transition notice in road info if active
            val roadInfo = if (hasActiveTransitionNotice()) {
                transitionNoticeMessage ?: "Route Active"
            } else {
                "Route Active"
            }
            stepBuilder.setRoad(roadInfo)

            val routingInfo = RoutingInfo.Builder()
                .setCurrentStep(
                    stepBuilder.build(),
                    Distance.create(distanceMeters, Distance.UNIT_METERS)
                )
                .build()

            builder.setNavigationInfo(routingInfo)
            if (etaMinutes != null) {
                builder.setDestinationTravelEstimate(
                    TravelEstimate.Builder(
                        Distance.create(distanceMeters, Distance.UNIT_METERS),
                        androidx.car.app.model.DateTimeWithZone.create(
                            System.currentTimeMillis() + (etaMinutes!! * 60000L),
                            java.util.TimeZone.getDefault()
                        )
                    ).build()
                )
            }
        } else if (hasActiveTransitionNotice()) {
            // Show transition notice even without active route
            val stepBuilder = Step.Builder()
            val maneuver = Maneuver.Builder(Maneuver.TYPE_STRAIGHT).build()
            stepBuilder.setManeuver(maneuver)
            stepBuilder.setCue(transitionNoticeMessage ?: "Mode changed")
            stepBuilder.setRoad("HIGHWAY MODE")

            val routingInfo = RoutingInfo.Builder()
                .setCurrentStep(
                    stepBuilder.build(),
                    Distance.create(0.0, Distance.UNIT_METERS)
                )
                .build()
            builder.setNavigationInfo(routingInfo)
        }

        builder.setBackgroundColor(CarColor.createCustom(0xFF0D1117.toInt(), 0xFF0D1117.toInt()))
        return builder.build()
    }

    // ── ExpeditionDrive Template ────────────────────────────

    private fun buildExpeditionTemplate(): Template {
        val builder = NavigationTemplate.Builder()

        // Action strip with mode indicator and screen navigation
        val actionStripBuilder = ActionStrip.Builder()

        // Mode indicator
        val modeLabel = if (isManualOverride) "EXP (Manual)" else "EXP"
        actionStripBuilder.addAction(
            Action.Builder()
                .setTitle(modeLabel)
                .setOnClickListener { /* Mode indicator */ }
                .build()
        )

        actionStripBuilder.addAction(
            Action.Builder()
                .setTitle("Status")
                .setOnClickListener { navigateToStatus() }
                .build()
        )

        actionStripBuilder.addAction(
            Action.Builder()
                .setTitle("Actions")
                .setOnClickListener { navigateToActions() }
                .build()
        )

        builder.setActionStrip(actionStripBuilder.build())

        // Map action strip
        val mapActionStripBuilder = ActionStrip.Builder()
        mapActionStripBuilder.addAction(Action.PAN)

        mapActionStripBuilder.addAction(
            Action.Builder()
                .setTitle("Drop Pin")
                .setOnClickListener { handleAction("drop_waypoint") }
                .build()
        )

        builder.setMapActionStrip(mapActionStripBuilder.build())

        // Navigation info for expedition mode
        val stepBuilder = Step.Builder()

        if (hasActiveTransitionNotice()) {
            // Show transition notice prominently
            val maneuver = Maneuver.Builder(Maneuver.TYPE_STRAIGHT).build()
            stepBuilder.setManeuver(maneuver)
            stepBuilder.setCue(transitionNoticeMessage ?: "Mode changed")
            stepBuilder.setRoad("EXPEDITION MODE")
        } else if (breadcrumbIsReturningToStart && breadcrumbDistanceFromStartMi != null) {
            val maneuver = Maneuver.Builder(Maneuver.TYPE_STRAIGHT).build()
            stepBuilder.setManeuver(maneuver)
            val bearingText = if (breadcrumbBearingToStartDeg != null) {
                formatBearing(breadcrumbBearingToStartDeg!!)
            } else ""
            stepBuilder.setCue("Return to Start — $bearingText")
            stepBuilder.setRoad(String.format("%.1f mi to start", breadcrumbDistanceFromStartMi))
        } else if (offRouteAlert) {
            val maneuver = Maneuver.Builder(Maneuver.TYPE_U_TURN_LEFT).build()
            stepBuilder.setManeuver(maneuver)
            val distText = if (offRouteDistanceFt != null) {
                "${offRouteDistanceFt!!.toInt()} ft off route"
            } else {
                "Off planned route"
            }
            stepBuilder.setCue("OFF ROUTE — $distText")
            stepBuilder.setRoad("Return to route")
        } else if (importedGpxRoute) {
            val maneuver = Maneuver.Builder(Maneuver.TYPE_STRAIGHT).build()
            stepBuilder.setManeuver(maneuver)
            stepBuilder.setCue("Following GPX route")
            stepBuilder.setRoad(buildBreadcrumbRoadInfo())
        } else {
            val maneuver = Maneuver.Builder(Maneuver.TYPE_STRAIGHT).build()
            stepBuilder.setManeuver(maneuver)
            stepBuilder.setCue("Expedition active")
            stepBuilder.setRoad(buildBreadcrumbRoadInfo())
        }

        val distFromStartMeters = if (breadcrumbDistanceFromStartMi != null) {
            breadcrumbDistanceFromStartMi!! * 1609.34
        } else 0.0

        val routingInfo = RoutingInfo.Builder()
            .setCurrentStep(
                stepBuilder.build(),
                Distance.create(distFromStartMeters, Distance.UNIT_METERS)
            )
            .build()

        builder.setNavigationInfo(routingInfo)
        builder.setBackgroundColor(CarColor.createCustom(0xFF0D1117.toInt(), 0xFF0D1117.toInt()))
        return builder.build()
    }

    /**
     * Build the road info string showing breadcrumb trail status.
     */
    private fun buildBreadcrumbRoadInfo(): String {
        val parts = mutableListOf<String>()

        if (breadcrumbIsRecording) {
            parts.add("Trail recording")
            if (breadcrumbPointCount > 0) {
                parts.add("${breadcrumbPointCount} pts")
            }
        } else if (breadcrumbPointCount > 0) {
            parts.add("Trail paused")
        } else {
            parts.add("Free roam")
        }

        if (breadcrumbTrailDistanceMi != null && breadcrumbTrailDistanceMi!! > 0.01) {
            parts.add(String.format("%.1f mi", breadcrumbTrailDistanceMi))
        }

        return parts.joinToString(" \u2022 ")
    }

    /**
     * Format a bearing in degrees to a compass direction string.
     */
    private fun formatBearing(degrees: Int): String {
        val dirs = arrayOf("N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
                           "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW")
        val idx = ((degrees + 11) / 22) % 16
        return dirs[idx]
    }

    // ── Screen Navigation ───────────────────────────────────

    private fun navigateToStatus() {
        screenManager.push(ECSVehicleStatusScreen(carContext))
    }

    private fun navigateToWeather() {
        screenManager.push(ECSVehicleWeatherScreen(carContext))
    }

    private fun navigateToActions() {
        screenManager.push(ECSVehicleActionsScreen(carContext))
    }

    // ── Fallback Template ───────────────────────────────────

    private fun buildFallbackTemplate(): Template {
        return MessageTemplate.Builder("ECS Navigation")
            .setTitle("ECS Vehicle Display")
            .addAction(
                Action.Builder()
                    .setTitle("Retry")
                    .setOnClickListener { invalidate() }
                    .build()
            )
            .build()
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
                put("source", "android_auto_map")
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
