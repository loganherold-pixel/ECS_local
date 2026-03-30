/**
 * ECSCarPlayModuleBridge — Objective-C Bridge for ECSCarPlayModule
 *
 * Registers the ECSCarPlay NativeModule methods with React Native.
 * Required because React Native NativeModules need Obj-C registration.
 *
 * All actual implementation is in ECSCarPlayModule.swift.
 */

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(ECSCarPlay, NSObject)

// Connection State
RCT_EXTERN_METHOD(isConnected:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getLastEventTimestamp:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

// Display Mode
RCT_EXTERN_METHOD(setDisplayMode:(NSString *)mode
                  resolve:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getDisplayMode:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

// Map Data
RCT_EXTERN_METHOD(pushMapData:(NSString *)mapDataJson
                  resolve:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

// Status Data
RCT_EXTERN_METHOD(pushStatusData:(NSString *)statusDataJson
                  resolve:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

// Mode State
RCT_EXTERN_METHOD(pushModeState:(NSString *)modeStateJson
                  resolve:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

// Breadcrumb Data
RCT_EXTERN_METHOD(pushBreadcrumbData:(NSString *)breadcrumbDataJson
                  resolve:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

// Weather Data
RCT_EXTERN_METHOD(pushWeatherData:(NSString *)weatherDataJson
                  resolve:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

// Actions Data
RCT_EXTERN_METHOD(pushActionsData:(NSString *)actionsDataJson
                  resolve:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

// Indicators
RCT_EXTERN_METHOD(pushIndicators:(NSString *)indicatorsJson
                  resolve:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

// System Health
RCT_EXTERN_METHOD(pushSystemHealth:(NSString *)healthJson
                  resolve:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

// Vehicle Location
RCT_EXTERN_METHOD(pushVehicleLocation:(double)lat
                  lon:(double)lon
                  heading:(double)heading
                  speedMph:(double)speedMph
                  resolve:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

// Route State
RCT_EXTERN_METHOD(pushRouteState:(BOOL)hasActiveRoute
                  hasExpeditionTrack:(BOOL)hasExpeditionTrack
                  resolve:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

// Action Polling
RCT_EXTERN_METHOD(pollPendingAction:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

// Full State Push
RCT_EXTERN_METHOD(pushFullState:(NSString *)mode
                  mapDataJson:(NSString *)mapDataJson
                  indicatorsJson:(NSString *)indicatorsJson
                  resolve:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(pushAllScreenData:(NSString *)mapDataJson
                  statusDataJson:(NSString *)statusDataJson
                  weatherDataJson:(NSString *)weatherDataJson
                  actionsDataJson:(NSString *)actionsDataJson
                  resolve:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

// Cleanup
RCT_EXTERN_METHOD(clearAll:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
