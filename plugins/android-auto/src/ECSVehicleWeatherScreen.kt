/**
 * ECSVehicleWeatherScreen — Android Auto Weather Display
 *
 * Presents simplified weather intelligence relevant to the vehicle's
 * current location and route on the Android Auto head unit.
 *
 * Reads from VehicleDisplayMode (via SharedPreferences) to determine
 * which content to display:
 *
 * Common (both modes):
 *   - Current conditions (temperature, weather description)
 *   - Wind speed and direction
 *   - Storm movement
 *   - Weather alerts
 *
 * ExpeditionDrive extras:
 *   - Lightning risk
 *   - Wind exposure
 *   - Temperature drop forecast
 *   - Storm arrival estimate
 *
 * Architecture:
 *   - Extends Screen (Android for Cars App Library)
 *   - Uses PaneTemplate for driver-safe info display
 *   - Reads data from SharedPreferences (written by RN bridge)
 *   - Refreshes on a 3-second timer
 *   - Accessible from all other vehicle screens
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
import androidx.car.app.model.Pane
import androidx.car.app.model.PaneTemplate
import androidx.car.app.model.Row
import androidx.car.app.model.Template
import org.json.JSONObject

class ECSVehicleWeatherScreen(carContext: CarContext) : Screen(carContext) {

    companion object {
        private const val TAG = "ECSVehicleWeatherScreen"
        private const val REFRESH_INTERVAL_MS = 3000L
    }

    private val handler = Handler(Looper.getMainLooper())
    private var isActive = true

    // Display mode
    private var displayMode: String = "highway_drive"

    // Common weather data
    private var temperatureF: Double? = null
    private var feelsLikeF: Double? = null
    private var weatherMain: String? = null
    private var weatherDescription: String? = null
    private var windSpeedMph: Double? = null
    private var windDirection: String? = null
    private var humidity: Int? = null
    private var temperatureTrend: String = "unknown"
    private var stormMovement: String? = null
    private var radarOverlay: Boolean = false
    private var alertCount: Int = 0
    private var topAlertTitle: String? = null
    private var topAlertSeverity: String? = null

    // ExpeditionDrive extras
    private var lightningRisk: String = "unknown"
    private var windExposure: String = "unknown"
    private var temperatureDropForecastF: Double? = null
    private var stormArrivalEstimate: String? = null

    /**
     * Periodic refresh runnable.
     */
    private val refreshRunnable = object : Runnable {
        override fun run() {
            if (!isActive) return
            readWeatherData()
            invalidate()
            handler.postDelayed(this, REFRESH_INTERVAL_MS)
        }
    }

    init {
        handler.postDelayed(refreshRunnable, REFRESH_INTERVAL_MS)
        readWeatherData()
        Log.i(TAG, "ECSVehicleWeatherScreen initialized")
    }

    /**
     * Read the latest weather data from SharedPreferences.
     */
    private fun readWeatherData() {
        try {
            val prefs = carContext.getSharedPreferences(
                ECSAndroidAutoConstants.PREFS_NAME,
                android.content.Context.MODE_PRIVATE
            )

            // Read display mode
            displayMode = prefs.getString(
                ECSAndroidAutoConstants.KEY_DISPLAY_MODE,
                "highway_drive"
            ) ?: "highway_drive"

            // Read weather data JSON
            val weatherJson = prefs.getString(ECSAndroidAutoConstants.KEY_WEATHER_DATA, null)
            if (weatherJson != null) {
                val json = JSONObject(weatherJson)

                // Common fields
                temperatureF = if (json.has("temperatureF") && !json.isNull("temperatureF"))
                    json.optDouble("temperatureF") else null
                feelsLikeF = if (json.has("feelsLikeF") && !json.isNull("feelsLikeF"))
                    json.optDouble("feelsLikeF") else null
                weatherMain = if (json.has("weatherMain") && !json.isNull("weatherMain"))
                    json.optString("weatherMain") else null
                weatherDescription = if (json.has("weatherDescription") && !json.isNull("weatherDescription"))
                    json.optString("weatherDescription") else null
                windSpeedMph = if (json.has("windSpeedMph") && !json.isNull("windSpeedMph"))
                    json.optDouble("windSpeedMph") else null
                windDirection = if (json.has("windDirection") && !json.isNull("windDirection"))
                    json.optString("windDirection") else null
                humidity = if (json.has("humidity") && !json.isNull("humidity"))
                    json.optInt("humidity") else null
                temperatureTrend = json.optString("temperatureTrend", "unknown")
                stormMovement = if (json.has("stormMovement") && !json.isNull("stormMovement"))
                    json.optString("stormMovement") else null
                radarOverlay = json.optBoolean("radarOverlay", false)

                // Parse alerts array
                val alertsArr = json.optJSONArray("weatherAlerts")
                if (alertsArr != null && alertsArr.length() > 0) {
                    alertCount = alertsArr.length()
                    val firstAlert = alertsArr.optJSONObject(0)
                    if (firstAlert != null) {
                        topAlertTitle = firstAlert.optString("title", null)
                        topAlertSeverity = firstAlert.optString("severity", null)
                    }
                } else {
                    alertCount = 0
                    topAlertTitle = null
                    topAlertSeverity = null
                }

                // ExpeditionDrive extras
                lightningRisk = json.optString("lightningRisk", "unknown")
                windExposure = json.optString("windExposure", "unknown")
                temperatureDropForecastF = if (json.has("temperatureDropForecastF") && !json.isNull("temperatureDropForecastF"))
                    json.optDouble("temperatureDropForecastF") else null
                stormArrivalEstimate = if (json.has("stormArrivalEstimate") && !json.isNull("stormArrivalEstimate"))
                    json.optString("stormArrivalEstimate") else null
            }

            Log.d(TAG, "Weather data refreshed — mode: $displayMode, temp: ${temperatureF}F")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to read weather data", e)
        }
    }

    /**
     * Build the PaneTemplate for Android Auto.
     */
    override fun onGetTemplate(): Template {
        return try {
            if (displayMode == "expedition_drive") {
                buildExpeditionWeatherTemplate()
            } else {
                buildHighwayWeatherTemplate()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to build weather template", e)
            buildFallbackTemplate()
        }
    }

    // ── HighwayDrive Weather Template ───────────────────────

    private fun buildHighwayWeatherTemplate(): Template {
        val paneBuilder = Pane.Builder()

        // Current Conditions — temperature + description
        val tempText = if (temperatureF != null) {
            "${Math.round(temperatureF!!)}°F"
        } else "--"
        val condText = buildConditionSubtext()
        paneBuilder.addRow(
            Row.Builder()
                .setTitle("Current: $tempText")
                .addText(condText)
                .build()
        )

        // Wind
        val windText = if (windSpeedMph != null) {
            "${Math.round(windSpeedMph!!)} mph"
        } else "--"
        val windSub = if (windDirection != null) {
            "Direction: $windDirection"
        } else "Direction unknown"
        paneBuilder.addRow(
            Row.Builder()
                .setTitle("Wind: $windText")
                .addText(windSub)
                .build()
        )

        // Storm Movement
        val stormText = stormMovement ?: "None detected"
        paneBuilder.addRow(
            Row.Builder()
                .setTitle("Storm Movement")
                .addText(stormText)
                .build()
        )

        // Weather Alerts
        val alertText = if (alertCount > 0) {
            val severity = topAlertSeverity?.uppercase() ?: "ALERT"
            "$alertCount active — $severity: ${topAlertTitle ?: "Weather alert"}"
        } else {
            "No active alerts"
        }
        paneBuilder.addRow(
            Row.Builder()
                .setTitle("Alerts")
                .addText(alertText)
                .build()
        )

        // Actions
        paneBuilder.addAction(
            Action.Builder()
                .setTitle("Map")
                .setOnClickListener { navigateToMap() }
                .build()
        )

        paneBuilder.addAction(
            Action.Builder()
                .setTitle("Actions")
                .setOnClickListener { navigateToActions() }
                .build()
        )

        return PaneTemplate.Builder(paneBuilder.build())
            .setTitle("WEATHER")
            .setHeaderAction(Action.BACK)
            .setActionStrip(buildActionStrip())
            .build()
    }

    // ── ExpeditionDrive Weather Template ────────────────────

    private fun buildExpeditionWeatherTemplate(): Template {
        val paneBuilder = Pane.Builder()

        // Current Conditions — temperature + description
        val tempText = if (temperatureF != null) {
            "${Math.round(temperatureF!!)}°F"
        } else "--"
        val condText = buildConditionSubtext()
        paneBuilder.addRow(
            Row.Builder()
                .setTitle("Current: $tempText")
                .addText(condText)
                .build()
        )

        // Wind + Exposure
        val windText = if (windSpeedMph != null) {
            "${Math.round(windSpeedMph!!)} mph ${windDirection ?: ""}"
        } else "--"
        val exposureText = "Exposure: ${windExposure.uppercase()}"
        paneBuilder.addRow(
            Row.Builder()
                .setTitle("Wind: $windText")
                .addText(exposureText)
                .build()
        )

        // Lightning Risk + Storm
        val lightningText = "Lightning: ${lightningRisk.uppercase()}"
        val stormText = if (stormArrivalEstimate != null) {
            "Storm arrival: $stormArrivalEstimate"
        } else if (stormMovement != null) {
            "Storm: $stormMovement"
        } else {
            "No storms detected"
        }
        paneBuilder.addRow(
            Row.Builder()
                .setTitle(lightningText)
                .addText(stormText)
                .build()
        )

        // Temperature Drop Forecast
        val tempDropText = if (temperatureDropForecastF != null) {
            "-${Math.abs(Math.round(temperatureDropForecastF!!))}°F expected drop"
        } else {
            "No significant change expected"
        }
        val trendText = "Trend: ${temperatureTrend.uppercase()}"
        paneBuilder.addRow(
            Row.Builder()
                .setTitle("Temp Forecast")
                .addText("$tempDropText  •  $trendText")
                .build()
        )

        // Weather Alerts (if any)
        if (alertCount > 0) {
            val severity = topAlertSeverity?.uppercase() ?: "ALERT"
            paneBuilder.addRow(
                Row.Builder()
                    .setTitle("$alertCount Active Alert${if (alertCount > 1) "s" else ""}")
                    .addText("$severity: ${topAlertTitle ?: "Weather alert"}")
                    .build()
            )
        }

        // Actions
        paneBuilder.addAction(
            Action.Builder()
                .setTitle("Map")
                .setOnClickListener { navigateToMap() }
                .build()
        )

        paneBuilder.addAction(
            Action.Builder()
                .setTitle("Actions")
                .setOnClickListener { navigateToActions() }
                .build()
        )

        return PaneTemplate.Builder(paneBuilder.build())
            .setTitle("EXPEDITION WEATHER")
            .setHeaderAction(Action.BACK)
            .setActionStrip(buildActionStrip())
            .build()
    }

    // ── Shared Helpers ──────────────────────────────────────

    /**
     * Build the condition subtext line showing description, feels-like, humidity.
     */
    private fun buildConditionSubtext(): String {
        val parts = mutableListOf<String>()

        if (weatherDescription != null) {
            parts.add(weatherDescription!!)
        } else if (weatherMain != null) {
            parts.add(weatherMain!!)
        }

        if (feelsLikeF != null) {
            parts.add("Feels ${Math.round(feelsLikeF!!)}°F")
        }

        if (humidity != null) {
            parts.add("Humidity ${humidity}%")
        }

        return if (parts.isNotEmpty()) parts.joinToString("  •  ") else "No data available"
    }

    private fun buildActionStrip(): ActionStrip {
        val builder = ActionStrip.Builder()

        builder.addAction(
            Action.Builder()
                .setTitle("Status")
                .setOnClickListener { navigateToStatus() }
                .build()
        )

        builder.addAction(
            Action.Builder()
                .setTitle("Map")
                .setOnClickListener { navigateToMap() }
                .build()
        )

        return builder.build()
    }

    private fun buildFallbackTemplate(): Template {
        val pane = Pane.Builder()
            .addRow(
                Row.Builder()
                    .setTitle("Weather data loading...")
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
            .setTitle("ECS WEATHER")
            .setHeaderAction(Action.BACK)
            .build()
    }

    // ── Navigation ──────────────────────────────────────────

    private fun navigateToMap() {
        screenManager.popToRoot()
    }

    private fun navigateToStatus() {
        screenManager.push(ECSVehicleStatusScreen(carContext))
    }

    private fun navigateToActions() {
        screenManager.push(ECSVehicleActionsScreen(carContext))
    }

    // ── Action Handling ─────────────────────────────────────

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

    // ── Lifecycle ───────────────────────────────────────────

    override fun onStop() {
        super.onStop()
        isActive = false
        handler.removeCallbacks(refreshRunnable)
        Log.d(TAG, "ECSVehicleWeatherScreen stopped")
    }
}
