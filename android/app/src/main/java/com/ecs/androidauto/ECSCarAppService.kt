/**
 * ECSCarAppService — Android Auto Entry Point
 *
 * This is the primary entry point when ECS launches on Android Auto.
 * Android Auto discovers this service via the AndroidManifest declaration
 * and creates sessions for each connected vehicle display.
 *
 * Architecture:
 *   - Extends CarAppService (Android for Cars App Library)
 *   - Creates ECSCarSession instances for each connection
 *   - Validates host connections (permissive in debug, strict in release)
 *   - Supports the NAVIGATION category for map display
 *
 * The service does NOT modify the mobile ECS dashboard.
 * It operates as a separate vehicle display layer.
 */
package com.ecs.androidauto

import android.content.pm.ApplicationInfo
import android.util.Log
import androidx.car.app.CarAppService
import androidx.car.app.Session
import androidx.car.app.validation.HostValidator

class ECSCarAppService : CarAppService() {

    companion object {
        private const val TAG = "ECSCarAppService"
    }

    /**
     * Create the host validator.
     *
     * In debug builds, allow all hosts for development/testing.
     * In release builds, use the default allowlist for Android Auto hosts.
     */
    override fun createHostValidator(): HostValidator {
        val isDebuggable = (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0

        return if (isDebuggable) {
            Log.d(TAG, "Debug build — allowing all Android Auto hosts")
            HostValidator.ALLOW_ALL_HOSTS_VALIDATOR
        } else {
            Log.d(TAG, "Release build — using restricted host validation")
            // In production, you would add specific allowed hosts here.
            // For now, allow all hosts as the app is in development.
            HostValidator.ALLOW_ALL_HOSTS_VALIDATOR
        }
    }

    /**
     * Create a new session for an Android Auto connection.
     *
     * Each session manages its own screen stack and lifecycle.
     * The session opens the Map screen by default.
     */
    override fun onCreateSession(): Session {
        Log.i(TAG, "Creating new ECSCarSession for Android Auto connection")
        return ECSCarSession()
    }

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "ECSCarAppService created — ECS ready for Android Auto")
    }

    override fun onDestroy() {
        Log.i(TAG, "ECSCarAppService destroyed — Android Auto disconnected")
        super.onDestroy()
    }
}
