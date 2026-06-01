/**
 * ECSCarSession — Android Auto Session Manager
 *
 * Manages the vehicle display session lifecycle for Android Auto.
 * Each session represents one connection to a vehicle head unit.
 *
 * Responsibilities:
 *   - Creates the initial screen (ECSVehicleMapScreen) on session start
 *   - Manages the screen stack for the vehicle display
 *   - Handles session lifecycle events (create, start, stop, destroy)
 *   - Notifies the React Native bridge when the session connects/disconnects
 *   - Supports navigation between all four vehicle screens:
 *       Map, Status, Weather, Actions
 *
 * The Map screen is always the default/initial screen per the
 * VehicleDisplayMode specification.
 *
 * Architecture:
 *   - Extends Session (Android for Cars App Library)
 *   - Opens ECSVehicleMapScreen as the first screen
 *   - Supports pushing any screen onto the screen stack via deep-link
 *   - Reads VehicleDisplayMode from SharedPreferences (set by RN bridge)
 *   - Does NOT modify the mobile ECS dashboard
 */
package com.ecs.androidauto

import android.content.Intent
import android.util.Log
import androidx.car.app.Screen
import androidx.car.app.Session
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner

class ECSCarSession : Session() {

    companion object {
        private const val TAG = "ECSCarSession"
    }

    /**
     * Create the initial screen when Android Auto starts the app.
     *
     * Per VehicleDisplayMode specification, the Map screen is always
     * the default vehicle screen.
     */
    override fun onCreateScreen(intent: Intent): Screen {
        Log.i(TAG, "onCreateScreen — launching ECSVehicleMapScreen as default")

        // Notify the React Native bridge that Android Auto is connected
        notifyConnectionState(true)

        return ECSVehicleMapScreen(carContext)
    }

    /**
     * Handle new intents while the session is active.
     * Supports deep-linking to specific screens.
     *
     * Supported target_screen values:
     *   - "map" → pop to root (Map is always root)
     *   - "status" → push ECSVehicleStatusScreen
     *   - "weather" → push ECSVehicleWeatherScreen
     *   - "actions" → push ECSVehicleActionsScreen
     */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        Log.d(TAG, "onNewIntent received")

        val targetScreen = intent.getStringExtra("target_screen")
        if (targetScreen != null) {
            Log.i(TAG, "Deep-link to screen: $targetScreen")

            val screenManager = carContext.getCarService(
                androidx.car.app.ScreenManager::class.java
            )

            when (targetScreen) {
                "map" -> {
                    // Pop back to root (Map screen)
                    screenManager.popToRoot()
                }
                "status" -> {
                    screenManager.push(ECSVehicleStatusScreen(carContext))
                }
                "weather" -> {
                    screenManager.push(ECSVehicleWeatherScreen(carContext))
                }
                "actions" -> {
                    screenManager.push(ECSVehicleActionsScreen(carContext))
                }
                else -> {
                    Log.w(TAG, "Unknown target screen: $targetScreen")
                }
            }
        }
    }

    init {
        lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onCreate(owner: LifecycleOwner) {
                Log.d(TAG, "Session lifecycle: onCreate")
            }

            override fun onStart(owner: LifecycleOwner) {
                Log.d(TAG, "Session lifecycle: onStart — vehicle display active")
                notifyConnectionState(true)
            }

            override fun onResume(owner: LifecycleOwner) {
                Log.d(TAG, "Session lifecycle: onResume — vehicle display visible")
            }

            override fun onPause(owner: LifecycleOwner) {
                Log.d(TAG, "Session lifecycle: onPause — vehicle display backgrounded")
            }

            override fun onStop(owner: LifecycleOwner) {
                Log.d(TAG, "Session lifecycle: onStop — vehicle display inactive")
                notifyConnectionState(false)
            }

            override fun onDestroy(owner: LifecycleOwner) {
                Log.d(TAG, "Session lifecycle: onDestroy — session ended")
                notifyConnectionState(false)
            }
        })
    }

    /**
     * Notify the React Native side about Android Auto connection state.
     *
     * Writes to SharedPreferences so the RN bridge can detect
     * connection changes and update vehicleDisplayStore.
     */
    private fun notifyConnectionState(connected: Boolean) {
        try {
            val prefs = carContext.getSharedPreferences(
                ECSAndroidAutoConstants.PREFS_NAME,
                android.content.Context.MODE_PRIVATE
            )
            prefs.edit()
                .putBoolean(ECSAndroidAutoConstants.KEY_AA_CONNECTED, connected)
                .putLong(ECSAndroidAutoConstants.KEY_AA_LAST_EVENT, System.currentTimeMillis())
                .apply()

            Log.d(TAG, "Android Auto connection state: $connected")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to write connection state", e)
        }
    }
}
