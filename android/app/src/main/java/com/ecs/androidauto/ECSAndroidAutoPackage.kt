/**
 * ECSAndroidAutoPackage — React Native Package Registration
 *
 * Registers the ECSAndroidAutoModule native module with React Native
 * so it can be accessed from JavaScript via NativeModules.ECSAndroidAuto.
 *
 * This package is registered in MainApplication.java/kt during the
 * Expo prebuild process via the withAndroidAuto config plugin.
 */
package com.ecs.androidauto

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class ECSAndroidAutoPackage : ReactPackage {

    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(ECSAndroidAutoModule(reactContext))
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
