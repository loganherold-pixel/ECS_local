/**
 * ECSVehicleActionsScreen — Android Auto Driver-Safe Actions
 *
 * Presents large, driver-safe action buttons on the Android Auto
 * head unit. The available actions depend on the current VehicleDisplayMode.
 *
 * Includes Manual Override Control for switching between:
 *   - Auto (automatic context-based switching)
 *   - Highway (force HighwayDrive)
 *   - Expedition (force ExpeditionDrive)
 *
 * Architecture:
 *   - Extends Screen (Android for Cars App Library)
 *   - Uses PaneTemplate with large action rows
 *   - Reads display mode and mode state from SharedPreferences
 *   - Writes actions and mode override to SharedPreferences for RN bridge
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
import org.json.JSONObject

class ECSVehicleActionsScreen(carContext: CarContext) : Screen(carContext) {

    companion object {
        private const val TAG = "ECSVehicleActionsScreen"
        private const val REFRESH_INTERVAL_MS = 5000L
    }

    private val handler = Handler(Looper.getMainLooper())
    private var isActive = true

    // Display mode
    private var displayMode: String = "highway_drive"

    // Mode state
    private var modeOverride: String = "auto"
    private var isManualOverride: Boolean = false
    private var transitionNoticeMessage: String? = null
    private var transitionNoticeTimestamp: Long = 0

    // Breadcrumb state
    private var breadcrumbCanReturnToStart: Boolean = false
    private var breadcrumbDistanceFromStartMi: Double? = null

    // Last action feedback
    private var lastActionLabel: String? = null
    private var lastActionTimestamp: Long = 0

    private val refreshRunnable = object : Runnable {
        override fun run() {
            if (!isActive) return
            readData()
            invalidate()
            handler.postDelayed(this, REFRESH_INTERVAL_MS)
        }
    }

    init {
        handler.postDelayed(refreshRunnable, REFRESH_INTERVAL_MS)
        readData()
        Log.i(TAG, "ECSVehicleActionsScreen initialized")
    }

    private fun readData() {
        try {
            val prefs = carContext.getSharedPreferences(
                ECSAndroidAutoConstants.PREFS_NAME,
                android.content.Context.MODE_PRIVATE
            )

            displayMode = prefs.getString(
                ECSAndroidAutoConstants.KEY_DISPLAY_MODE,
                "highway_drive"
            ) ?: "highway_drive"

            // Read breadcrumb data
            val breadcrumbJson = prefs.getString(ECSAndroidAutoConstants.KEY_BREADCRUMB_DATA, null)
            if (breadcrumbJson != null) {
                val json = JSONObject(breadcrumbJson)
                breadcrumbCanReturnToStart = json.optBoolean("canReturnToStart", false)
                breadcrumbDistanceFromStartMi = if (json.has("distanceFromStartMi") && !json.isNull("distanceFromStartMi"))
                    json.optDouble("distanceFromStartMi") else null
            }

            // Read mode state
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
            Log.e(TAG, "Failed to read actions data", e)
        }
    }

    private fun buildTitle(): String {
        val modeTag = if (displayMode == "expedition_drive") "EXP" else "HWY"
        val overrideTag = if (isManualOverride) " (Manual)" else ""
        val baseTitle = if (displayMode == "expedition_drive") "EXPEDITION ACTIONS" else "QUICK ACTIONS"
        return "$baseTitle \u2022 $modeTag$overrideTag"
    }

    private fun hasActiveTransitionNotice(): Boolean {
        if (transitionNoticeMessage == null) return false
        return System.currentTimeMillis() - transitionNoticeTimestamp < 5000
    }

    override fun onGetTemplate(): Template {
        return try {
            if (displayMode == "expedition_drive") {
                buildExpeditionActionsTemplate()
            } else {
                buildHighwayActionsTemplate()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to build actions template", e)
            buildFallbackTemplate()
        }
    }

    // ── HighwayDrive Actions Template ───────────────────────

    private fun buildHighwayActionsTemplate(): Template {
        val paneBuilder = Pane.Builder()

        // Transition notice
        if (hasActiveTransitionNotice()) {
            paneBuilder.addRow(
                Row.Builder()
                    .setTitle(transitionNoticeMessage ?: "Mode changed")
                    .build()
            )
        }

        // Last action feedback
        if (lastActionLabel != null && System.currentTimeMillis() - lastActionTimestamp < 10000) {
            paneBuilder.addRow(
                Row.Builder()
                    .setTitle("$lastActionLabel triggered")
                    .addText("Action sent to ECS")
                    .build()
            )
        }

        // Mode Override Control
        val overrideLabel = when (modeOverride) {
            "highway" -> "Mode: HIGHWAY (Manual)"
            "expedition" -> "Mode: EXPEDITION (Manual)"
            else -> "Mode: AUTO"
        }
        val nextOverride = getNextOverrideSetting()
        paneBuilder.addRow(
            Row.Builder()
                .setTitle(overrideLabel)
                .addText("Tap to switch to ${nextOverride.uppercase()}")
                .setOnClickListener { cycleModeOverride() }
                .build()
        )

        // Add Waypoint
        paneBuilder.addRow(
            Row.Builder()
                .setTitle("Add Waypoint")
                .addText("Mark current location")
                .setOnClickListener { triggerAction("add_waypoint", "Add Waypoint") }
                .build()
        )

        // Find Fuel
        paneBuilder.addRow(
            Row.Builder()
                .setTitle("Find Fuel")
                .addText("Search nearby fuel stations")
                .setOnClickListener { triggerAction("find_fuel", "Find Fuel") }
                .build()
        )

        // Report Hazard
        paneBuilder.addRow(
            Row.Builder()
                .setTitle("Report Hazard")
                .addText("Flag road hazard at current location")
                .setOnClickListener { triggerAction("report_hazard", "Report Hazard") }
                .build()
        )

        paneBuilder.addAction(
            Action.Builder()
                .setTitle("Navigate Home")
                .setOnClickListener { triggerAction("navigate_home", "Navigate Home") }
                .build()
        )

        paneBuilder.addAction(
            Action.Builder()
                .setTitle("Map")
                .setOnClickListener { navigateToMap() }
                .build()
        )

        return PaneTemplate.Builder(paneBuilder.build())
            .setTitle(buildTitle())
            .setHeaderAction(Action.BACK)
            .setActionStrip(buildActionStrip())
            .build()
    }

    // ── ExpeditionDrive Actions Template ────────────────────

    private fun buildExpeditionActionsTemplate(): Template {
        val paneBuilder = Pane.Builder()

        // Transition notice
        if (hasActiveTransitionNotice()) {
            paneBuilder.addRow(
                Row.Builder()
                    .setTitle(transitionNoticeMessage ?: "Mode changed")
                    .build()
            )
        }

        // Last action feedback
        if (lastActionLabel != null && System.currentTimeMillis() - lastActionTimestamp < 10000) {
            paneBuilder.addRow(
                Row.Builder()
                    .setTitle("$lastActionLabel triggered")
                    .addText("Action sent to ECS")
                    .build()
            )
        }

        // Mode Override Control
        val overrideLabel = when (modeOverride) {
            "highway" -> "Mode: HIGHWAY (Manual)"
            "expedition" -> "Mode: EXPEDITION (Manual)"
            else -> "Mode: AUTO"
        }
        val nextOverride = getNextOverrideSetting()
        paneBuilder.addRow(
            Row.Builder()
                .setTitle(overrideLabel)
                .addText("Tap to switch to ${nextOverride.uppercase()}")
                .setOnClickListener { cycleModeOverride() }
                .build()
        )

        // Drop Waypoint
        paneBuilder.addRow(
            Row.Builder()
                .setTitle("Drop Waypoint")
                .addText("Pin current position on trail")
                .setOnClickListener { triggerAction("drop_waypoint", "Drop Waypoint") }
                .build()
        )

        // Incident Marker
        paneBuilder.addRow(
            Row.Builder()
                .setTitle("Incident Marker")
                .addText("Mark incident at current location")
                .setOnClickListener { triggerAction("incident_marker", "Incident Marker") }
                .build()
        )

        // Return to Start
        val returnSubtext = if (breadcrumbCanReturnToStart && breadcrumbDistanceFromStartMi != null) {
            "Navigate back — ${String.format("%.1f", breadcrumbDistanceFromStartMi)} mi to start"
        } else if (breadcrumbCanReturnToStart) {
            "Navigate back to expedition start"
        } else {
            "No breadcrumb trail available"
        }
        paneBuilder.addRow(
            Row.Builder()
                .setTitle("Return to Start")
                .addText(returnSubtext)
                .setOnClickListener {
                    if (breadcrumbCanReturnToStart) {
                        triggerAction("return_to_start", "Return to Start")
                    }
                }
                .build()
        )

        paneBuilder.addAction(
            Action.Builder()
                .setTitle("Emergency Comms")
                .setBackgroundColor(CarColor.createCustom(0xFFC0392B.toInt(), 0xFFC0392B.toInt()))
                .setOnClickListener { triggerAction("emergency_comms", "Emergency Comms") }
                .build()
        )

        paneBuilder.addAction(
            Action.Builder()
                .setTitle("Map")
                .setOnClickListener { navigateToMap() }
                .build()
        )

        return PaneTemplate.Builder(paneBuilder.build())
            .setTitle(buildTitle())
            .setHeaderAction(Action.BACK)
            .setActionStrip(buildActionStrip())
            .build()
    }

    // ── Mode Override Control ────────────────────────────────

    /**
     * Get the next override setting in the cycle: auto → highway → expedition → auto
     */
    private fun getNextOverrideSetting(): String {
        return when (modeOverride) {
            "auto" -> "highway"
            "highway" -> "expedition"
            "expedition" -> "auto"
            else -> "auto"
        }
    }

    /**
     * Cycle through mode override settings and dispatch to RN bridge.
     */
    private fun cycleModeOverride() {
        val nextSetting = getNextOverrideSetting()
        Log.i(TAG, "Mode override cycling: $modeOverride → $nextSetting")

        modeOverride = nextSetting
        isManualOverride = nextSetting != "auto"

        // Map override setting to action type for RN bridge
        val actionType = when (nextSetting) {
            "auto" -> "set_mode_auto"
            "highway" -> "set_mode_highway"
            "expedition" -> "set_mode_expedition"
            else -> "set_mode_auto"
        }

        triggerAction(actionType, "Mode: ${nextSetting.uppercase()}")
    }

    // ── Action Dispatch ─────────────────────────────────────

    private fun triggerAction(actionType: String, label: String) {
        Log.i(TAG, "Action triggered: $actionType ($label)")

        lastActionLabel = label
        lastActionTimestamp = System.currentTimeMillis()

        try {
            val prefs = carContext.getSharedPreferences(
                ECSAndroidAutoConstants.PREFS_NAME,
                android.content.Context.MODE_PRIVATE
            )

            val actionJson = JSONObject().apply {
                put("actionType", actionType)
                put("label", label)
                put("timestamp", System.currentTimeMillis())
                put("mode", displayMode)
                put("source", "android_auto_actions")
            }

            prefs.edit()
                .putString(ECSAndroidAutoConstants.KEY_PENDING_ACTION, actionJson.toString())
                .putLong(ECSAndroidAutoConstants.KEY_AA_LAST_EVENT, System.currentTimeMillis())
                .apply()

            invalidate()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to write action", e)
        }
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
                .setTitle("Status")
                .setOnClickListener { navigateToStatus() }
                .build()
        )

        return builder.build()
    }

    private fun buildFallbackTemplate(): Template {
        val pane = Pane.Builder()
            .addRow(Row.Builder().setTitle("Actions loading...").build())
            .addAction(Action.Builder().setTitle("Retry").setOnClickListener { invalidate() }.build())
            .build()

        return PaneTemplate.Builder(pane)
            .setTitle("ECS ACTIONS")
            .setHeaderAction(Action.BACK)
            .build()
    }

    private fun navigateToMap() { screenManager.popToRoot() }
    private fun navigateToStatus() { screenManager.push(ECSVehicleStatusScreen(carContext)) }
    private fun navigateToWeather() { screenManager.push(ECSVehicleWeatherScreen(carContext)) }

    override fun onStop() {
        super.onStop()
        isActive = false
        handler.removeCallbacks(refreshRunnable)
        Log.d(TAG, "ECSVehicleActionsScreen stopped")
    }
}
