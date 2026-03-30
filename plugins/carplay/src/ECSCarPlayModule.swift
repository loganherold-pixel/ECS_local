/**
 * ECSCarPlayModule — React Native Native Module Bridge
 *
 * Provides the bridge between React Native and the native CarPlay
 * components. Allows the RN side to:
 *
 *   1. Push vehicle display data to UserDefaults (read by CarPlay screens)
 *   2. Set the active display mode
 *   3. Check CarPlay connection state
 *   4. Poll for pending actions from CarPlay
 *
 * Data Flow:
 *   RN calls pushMapData(json) → writes to UserDefaults
 *   → ECSCarPlayMapScreen reads on next refresh cycle
 *
 *   ECSCarPlayActionsScreen writes action → UserDefaults
 *   → RN calls pollPendingAction() → gets action JSON
 *
 * This module is registered via ECSCarPlayModuleBridge.m
 */

import Foundation

@objc(ECSCarPlay)
class ECSCarPlayModule: NSObject {
    
    private static let TAG = "ECSCarPlayModule"
    
    // MARK: - Module Setup
    
    @objc static func requiresMainQueueSetup() -> Bool {
        return false
    }
    
    @objc static func moduleName() -> String {
        return "ECSCarPlay"
    }
    
    private func defaults() -> UserDefaults {
        return ECSCarPlayConstants.defaults()
    }
    
    // MARK: - Connection State
    
    @objc func isConnected(_ resolve: @escaping RCTPromiseResolveBlock,
                           rejecter reject: @escaping RCTPromiseRejectBlock) {
        let connected = defaults().bool(forKey: ECSCarPlayConstants.keyCarPlayConnected)
        resolve(connected)
    }
    
    @objc func getLastEventTimestamp(_ resolve: @escaping RCTPromiseResolveBlock,
                                     rejecter reject: @escaping RCTPromiseRejectBlock) {
        let ts = defaults().double(forKey: ECSCarPlayConstants.keyLastEvent)
        resolve(ts)
    }
    
    // MARK: - Display Mode
    
    @objc func setDisplayMode(_ mode: String,
                              resolve: @escaping RCTPromiseResolveBlock,
                              rejecter reject: @escaping RCTPromiseRejectBlock) {
        defaults().set(mode, forKey: ECSCarPlayConstants.keyDisplayMode)
        NSLog("[%@] Display mode set: %@", Self.TAG, mode)
        resolve(true)
    }
    
    @objc func getDisplayMode(_ resolve: @escaping RCTPromiseResolveBlock,
                              rejecter reject: @escaping RCTPromiseRejectBlock) {
        let mode = defaults().string(forKey: ECSCarPlayConstants.keyDisplayMode) ?? "highway_drive"
        resolve(mode)
    }
    
    // MARK: - Map Data
    
    @objc func pushMapData(_ mapDataJson: String,
                           resolve: @escaping RCTPromiseResolveBlock,
                           rejecter reject: @escaping RCTPromiseRejectBlock) {
        defaults().set(mapDataJson, forKey: ECSCarPlayConstants.keyMapData)
        resolve(true)
    }
    
    // MARK: - Status Data
    
    @objc func pushStatusData(_ statusDataJson: String,
                              resolve: @escaping RCTPromiseResolveBlock,
                              rejecter reject: @escaping RCTPromiseRejectBlock) {
        defaults().set(statusDataJson, forKey: ECSCarPlayConstants.keyStatusData)
        resolve(true)
    }
    
    // MARK: - Mode State
    
    @objc func pushModeState(_ modeStateJson: String,
                             resolve: @escaping RCTPromiseResolveBlock,
                             rejecter reject: @escaping RCTPromiseRejectBlock) {
        defaults().set(modeStateJson, forKey: ECSCarPlayConstants.keyModeState)
        resolve(true)
    }
    
    // MARK: - Breadcrumb Data
    
    @objc func pushBreadcrumbData(_ breadcrumbDataJson: String,
                                  resolve: @escaping RCTPromiseResolveBlock,
                                  rejecter reject: @escaping RCTPromiseRejectBlock) {
        defaults().set(breadcrumbDataJson, forKey: ECSCarPlayConstants.keyBreadcrumbData)
        resolve(true)
    }
    
    // MARK: - Weather Data
    
    @objc func pushWeatherData(_ weatherDataJson: String,
                               resolve: @escaping RCTPromiseResolveBlock,
                               rejecter reject: @escaping RCTPromiseRejectBlock) {
        defaults().set(weatherDataJson, forKey: ECSCarPlayConstants.keyWeatherData)
        resolve(true)
    }
    
    // MARK: - Actions Data
    
    @objc func pushActionsData(_ actionsDataJson: String,
                               resolve: @escaping RCTPromiseResolveBlock,
                               rejecter reject: @escaping RCTPromiseRejectBlock) {
        defaults().set(actionsDataJson, forKey: ECSCarPlayConstants.keyActionsData)
        resolve(true)
    }
    
    // MARK: - Indicators
    
    @objc func pushIndicators(_ indicatorsJson: String,
                              resolve: @escaping RCTPromiseResolveBlock,
                              rejecter reject: @escaping RCTPromiseRejectBlock) {
        defaults().set(indicatorsJson, forKey: ECSCarPlayConstants.keyIndicators)
        resolve(true)
    }
    
    // MARK: - System Health
    
    @objc func pushSystemHealth(_ healthJson: String,
                                resolve: @escaping RCTPromiseResolveBlock,
                                rejecter reject: @escaping RCTPromiseRejectBlock) {
        defaults().set(healthJson, forKey: ECSCarPlayConstants.keySystemHealth)
        resolve(true)
    }
    
    // MARK: - Vehicle Location
    
    @objc func pushVehicleLocation(_ lat: Double,
                                   lon: Double,
                                   heading: Double,
                                   speedMph: Double,
                                   resolve: @escaping RCTPromiseResolveBlock,
                                   rejecter reject: @escaping RCTPromiseRejectBlock) {
        let d = defaults()
        d.set(lat, forKey: ECSCarPlayConstants.keyVehicleLat)
        d.set(lon, forKey: ECSCarPlayConstants.keyVehicleLon)
        d.set(heading, forKey: ECSCarPlayConstants.keyVehicleHeading)
        d.set(speedMph, forKey: ECSCarPlayConstants.keyVehicleSpeed)
        resolve(true)
    }
    
    // MARK: - Route State
    
    @objc func pushRouteState(_ hasActiveRoute: Bool,
                              hasExpeditionTrack: Bool,
                              resolve: @escaping RCTPromiseResolveBlock,
                              rejecter reject: @escaping RCTPromiseRejectBlock) {
        let d = defaults()
        d.set(hasActiveRoute, forKey: ECSCarPlayConstants.keyHasActiveRoute)
        d.set(hasExpeditionTrack, forKey: ECSCarPlayConstants.keyHasExpeditionTrack)
        resolve(true)
    }
    
    // MARK: - Action Polling
    
    @objc func pollPendingAction(_ resolve: @escaping RCTPromiseResolveBlock,
                                 rejecter reject: @escaping RCTPromiseRejectBlock) {
        let d = defaults()
        let actionJson = d.string(forKey: ECSCarPlayConstants.keyPendingAction)
        let lastConsumed = d.string(forKey: ECSCarPlayConstants.keyLastConsumedAction)
        
        if let action = actionJson, action != lastConsumed {
            d.set(action, forKey: ECSCarPlayConstants.keyLastConsumedAction)
            d.removeObject(forKey: ECSCarPlayConstants.keyPendingAction)
            NSLog("[%@] Action polled: %@", Self.TAG, action)
            resolve(action)
        } else {
            resolve(nil)
        }
    }
    
    // MARK: - Full State Push
    
    @objc func pushFullState(_ mode: String,
                             mapDataJson: String,
                             indicatorsJson: String,
                             resolve: @escaping RCTPromiseResolveBlock,
                             rejecter reject: @escaping RCTPromiseRejectBlock) {
        let d = defaults()
        d.set(mode, forKey: ECSCarPlayConstants.keyDisplayMode)
        d.set(mapDataJson, forKey: ECSCarPlayConstants.keyMapData)
        d.set(indicatorsJson, forKey: ECSCarPlayConstants.keyIndicators)
        NSLog("[%@] Full state pushed — mode: %@", Self.TAG, mode)
        resolve(true)
    }
    
    @objc func pushAllScreenData(_ mapDataJson: String,
                                 statusDataJson: String,
                                 weatherDataJson: String,
                                 actionsDataJson: String,
                                 resolve: @escaping RCTPromiseResolveBlock,
                                 rejecter reject: @escaping RCTPromiseRejectBlock) {
        let d = defaults()
        d.set(mapDataJson, forKey: ECSCarPlayConstants.keyMapData)
        d.set(statusDataJson, forKey: ECSCarPlayConstants.keyStatusData)
        d.set(weatherDataJson, forKey: ECSCarPlayConstants.keyWeatherData)
        d.set(actionsDataJson, forKey: ECSCarPlayConstants.keyActionsData)
        NSLog("[%@] All screen data pushed", Self.TAG)
        resolve(true)
    }
    
    // MARK: - Cleanup
    
    @objc func clearAll(_ resolve: @escaping RCTPromiseResolveBlock,
                        rejecter reject: @escaping RCTPromiseRejectBlock) {
        let d = defaults()
        let domain = ECSCarPlayConstants.suiteName
        d.removePersistentDomain(forName: domain)
        NSLog("[%@] All CarPlay data cleared", Self.TAG)
        resolve(true)
    }
}
