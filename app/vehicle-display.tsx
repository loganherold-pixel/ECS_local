/**
 * Vehicle Display — Main Route
 *
 * The vehicle display surface for Android Auto / Apple CarPlay integration.
 * Presents a reduced, driver-safe interface while the mobile device
 * remains the full ECS command console.
 *
 * Contains:
 *   - VehicleDisplayIndicators (shared status bar)
 *   - Screen navigation tabs (Navigation, Attitude, Resources, Weather, Exit)
 *   - Mode toggle (HighwayDrive / ExpeditionDrive)
 *   - Active screen content
 *
 * Runtime integration:
 *   - Acquires the shared automotive runtime without duplicating bridge ownership
 *   - Displays companion connection status
 *
 * Phase 9 Integration:
 *   - Starts/stops Offline Expedition Intelligence
 *
 * Phase 10 Integration:
 *   - Starts/stops Predictive Expedition Awareness
 * Phase 11 Integration:
 *   - Starts/stops Adaptive Expedition Guidance
 *
 * Phase 12 Integration:
 *   - Starts/stops Collaborative Expedition Intelligence
 *

 * Architecture:
 *   - Reads from vehicleDisplayStore
 *   - Uses the shared automotive runtime coordinator for lifecycle ownership
 *   - Does NOT modify the mobile dashboard
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { vehicleDisplayStore } from '../lib/vehicleDisplayStore';
import { vehicleDisplayModeEngine } from '../lib/vehicleDisplayModeEngine';
import { vehicleSessionState } from '../lib/vehicleSessionState';
import { automotiveRuntimeCoordinator } from '../lib/automotive/automotiveRuntimeCoordinator';
import { offlineExpeditionIntelligence } from '../lib/offlineExpeditionIntelligence';
import { predictiveExpeditionAwareness } from '../lib/predictiveExpeditionAwareness';
import { adaptiveExpeditionGuidance } from '../lib/adaptiveExpeditionGuidance';
import { collaborativeExpeditionIntelligence } from '../lib/collaborativeExpeditionIntelligence';

import type {
  VehicleDisplayMode,
  VehicleDisplayScreen,
  VehicleDisplayState,
} from '../lib/vehicleDisplayTypes';

import {
  VEHICLE_DISPLAY_SCREENS,
  VEHICLE_SCREEN_LABELS,
  VEHICLE_SCREEN_ICONS,
  VEHICLE_DISPLAY_MODE_COLORS,
} from '../lib/vehicleDisplayTypes';

import VehicleDisplayIndicators from '../components/vehicle-display/VehicleDisplayIndicators';
import VehicleNavigationScreen from '../components/vehicle-display/VehicleNavigationScreen';
import VehicleAttitudeScreen from '../components/vehicle-display/VehicleAttitudeScreen';
import VehicleResourceScreen from '../components/vehicle-display/VehicleResourceScreen';
import VehicleWeatherHazardScreen from '../components/vehicle-display/VehicleWeatherHazardScreen';
import VehicleExitPlanScreen from '../components/vehicle-display/VehicleExitPlanScreen';
import AutomotiveSourceRail from '../components/vehicle-display/AutomotiveSourceRail';
import ECSOperationalAnnouncer from '../components/ECSOperationalAnnouncer';
import { selectActiveAutomotiveSafeSurface } from '../lib/automotive/automotiveSafeProjection';

export default function VehicleDisplayPage() {
  const router = useRouter();
  const [state, setState] = useState<VehicleDisplayState>(vehicleDisplayStore.get());
  const [showModeSwitch, setShowModeSwitch] = useState(false);
  const [companionPlatform, setCompanionPlatform] = useState(
    vehicleSessionState.getCompanionPlatform()
  );

  // Subscribe to store updates and start all vehicle display systems

  useEffect(() => {
    const releaseAutomotiveRuntime = automotiveRuntimeCoordinator.acquire('vehicle_display_route');

    // Start Offline Expedition Intelligence (Phase 9)
    offlineExpeditionIntelligence.start();

    // Start Predictive Expedition Awareness (Phase 10)
    predictiveExpeditionAwareness.start();

    // Start Adaptive Expedition Guidance (Phase 11)
    adaptiveExpeditionGuidance.start();

    // Start Collaborative Expedition Intelligence (Phase 12)
    collaborativeExpeditionIntelligence.start();

    // Subscribe to display store changes
    const storeUnsub = vehicleDisplayStore.subscribe(() => {
      setState(vehicleDisplayStore.get());
    });
    setState(vehicleDisplayStore.get());

    // Subscribe to session state for companion connection updates
    const sessionUnsub = vehicleSessionState.subscribe(() => {
      setCompanionPlatform(vehicleSessionState.getCompanionPlatform());
    });

    return () => {
      storeUnsub();
      sessionUnsub();

      // Stop Collaborative Expedition Intelligence (Phase 12)
      collaborativeExpeditionIntelligence.stop();

      // Stop Adaptive Expedition Guidance (Phase 11)
      adaptiveExpeditionGuidance.stop();

      // Stop Predictive Expedition Awareness (Phase 10)
      predictiveExpeditionAwareness.stop();

      // Stop Offline Expedition Intelligence (Phase 9)
      offlineExpeditionIntelligence.stop();


      releaseAutomotiveRuntime();
    };
  }, []);

  const handleScreenChange = useCallback((screen: VehicleDisplayScreen) => {
    vehicleDisplayStore.setActiveScreen(screen);
  }, []);

  const handleAutoModeToggle = useCallback(() => {
    const current = vehicleDisplayModeEngine.isAutoModeEnabled();
    vehicleDisplayModeEngine.setAutoMode(!current);
  }, []);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/fleet');
    }
  }, [router]);

  const modeColor = VEHICLE_DISPLAY_MODE_COLORS[state.mode];
  const autoMode = vehicleDisplayModeEngine.isAutoModeEnabled();
  const activeSourceState = selectActiveAutomotiveSafeSurface(
    state.automotiveProjection,
    state.activeScreen,
  );
  const modeLabel = state.mode === 'highway_drive' ? 'Highway drive' : 'Expedition drive';
  const companionLabel = companionPlatform === 'android_auto'
    ? 'Android Auto connected.'
    : companionPlatform === 'carplay'
      ? 'Apple CarPlay connected.'
      : 'No automotive companion connected.';
  const connectionAnnouncement = {
    id: `vehicle-display-connection:${companionPlatform}`,
    kind: 'connection_changed' as const,
    subject: 'Vehicle display',
    detail: companionLabel,
  };
  const routeAnnouncement = state.routePhase === 'route_active'
    ? {
        id: `vehicle-display-route:${state.navigationData.routeName ?? 'active-route'}`,
        kind: 'route_activated' as const,
        subject: state.navigationData.routeName ?? 'Current route',
        detail: state.navigationData.statusLabel,
      }
    : null;
  let activeScreenContent: React.ReactNode = null;

  switch (state.activeScreen) {
    case 'navigation':
      activeScreenContent = <VehicleNavigationScreen data={state.navigationData} automotive={state.automotiveSurface} />;
      break;
    case 'attitude':
      activeScreenContent = <VehicleAttitudeScreen data={state.attitudeData} />;
      break;
    case 'resources':
      activeScreenContent = <VehicleResourceScreen data={state.resourceData} automotive={state.automotiveSurface} />;
      break;
    case 'weather_hazard':
      activeScreenContent = <VehicleWeatherHazardScreen data={state.weatherHazardData} automotive={state.automotiveSurface} />;
      break;
    case 'exit_plan':
      activeScreenContent = <VehicleExitPlanScreen data={state.exitPlanData} automotive={state.automotiveSurface} />;
      break;
    default:
      vehicleDisplayStore.recordTemplateRenderFailure({
        activeScreen: state.activeScreen,
        reason: 'Unknown vehicle display screen',
      });
      activeScreenContent = <VehicleNavigationScreen data={state.navigationData} />;
      break;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0B0E12" />
      <ECSOperationalAnnouncer event={connectionAnnouncement} />
      <ECSOperationalAnnouncer event={routeAnnouncement} />
      <View style={styles.container}>
        {/* Top bar with back button */}
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={handleBack}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Exit Vehicle Display"
            accessibilityHint="Returns to the ECS Fleet surface"
          >
            <Ionicons name="chevron-back" size={22} color="#8B949E" />
          </TouchableOpacity>

          <Text
            style={styles.topTitle}
            accessibilityRole="header"
            numberOfLines={2}
            adjustsFontSizeToFit
            maxFontSizeMultiplier={1.4}
          >
            VEHICLE DISPLAY
          </Text>

          <TouchableOpacity
            onPress={() => setShowModeSwitch(!showModeSwitch)}
            style={[styles.modeButton, { borderColor: modeColor }]}
            accessibilityRole="button"
            accessibilityLabel={`Display mode. ${modeLabel}`}
            accessibilityHint="Opens the display mode controls"
            accessibilityState={{ expanded: showModeSwitch }}
          >
            <Ionicons
              name={state.mode === 'highway_drive' ? 'car-outline' : 'compass-outline'}
              size={16}
              color={modeColor}
            />
          </TouchableOpacity>
        </View>

        {/* Mode switch panel */}
        {showModeSwitch && (
          <View style={styles.modeSwitchPanel}>
            <Text style={styles.modeSwitchTitle}>DISPLAY MODE</Text>

            <View style={styles.modeSwitchRow}>
              <TouchableOpacity
                style={[
                  styles.modeSwitchOption,
                  state.mode === 'highway_drive' && styles.modeSwitchActive,
                  state.mode === 'highway_drive' && { borderColor: '#5B8DEF' },
                ]}
                onPress={() => {
                  vehicleDisplayModeEngine.setMode('highway_drive');
                  setShowModeSwitch(false);
                }}
                accessibilityRole="radio"
                accessibilityLabel="Highway drive mode"
                accessibilityHint="Uses the highway-focused Vehicle Display layout"
                accessibilityState={{ checked: state.mode === 'highway_drive' }}
              >
                <Ionicons name="car-outline" size={20} color={state.mode === 'highway_drive' ? '#5B8DEF' : '#8B949E'} />
                <Text style={[
                  styles.modeSwitchLabel,
                  state.mode === 'highway_drive' && { color: '#5B8DEF' },
                ]}>
                  HIGHWAY
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modeSwitchOption,
                  state.mode === 'expedition_drive' && styles.modeSwitchActive,
                  state.mode === 'expedition_drive' && { borderColor: '#D4A017' },
                ]}
                onPress={() => {
                  vehicleDisplayModeEngine.setMode('expedition_drive');
                  setShowModeSwitch(false);
                }}
                accessibilityRole="radio"
                accessibilityLabel="Expedition drive mode"
                accessibilityHint="Uses the field-focused Vehicle Display layout"
                accessibilityState={{ checked: state.mode === 'expedition_drive' }}
              >
                <Ionicons name="compass-outline" size={20} color={state.mode === 'expedition_drive' ? '#D4A017' : '#8B949E'} />
                <Text style={[
                  styles.modeSwitchLabel,
                  state.mode === 'expedition_drive' && { color: '#D4A017' },
                ]}>
                  EXPEDITION
                </Text>
              </TouchableOpacity>
            </View>

            {/* Auto mode toggle */}
            <TouchableOpacity
              style={styles.autoModeRow}
              onPress={handleAutoModeToggle}
              accessibilityRole="switch"
              accessibilityLabel="Automatically select display mode"
              accessibilityHint="Lets ECS propose the display mode without changing core app behavior"
              accessibilityState={{ checked: autoMode }}
            >
              <Ionicons
                name={autoMode ? 'toggle' : 'toggle-outline'}
                size={24}
                color={autoMode ? '#4CAF50' : '#555'}
              />
              <Text style={[styles.autoModeText, autoMode && { color: '#4CAF50' }]}>
                Auto-detect mode
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Shared indicators */}
        <VehicleDisplayIndicators
          indicators={state.indicators}
          mode={state.mode}
          routePhase={state.routePhase}
          companionPlatform={companionPlatform}
          statusLabel={state.automotiveSurface.platformStatusLabel}
        />

        <AutomotiveSourceRail state={activeSourceState} />

        {/* Active screen content */}
        <View style={styles.screenContent}>{activeScreenContent}</View>

        {/* Screen navigation tabs */}
        <View style={styles.tabBar}>
          {VEHICLE_DISPLAY_SCREENS.map((screen) => {
            const isActive = state.activeScreen === screen;
            return (
              <TouchableOpacity
                key={screen}
                style={[styles.tab, isActive && styles.tabActive]}
                onPress={() => handleScreenChange(screen)}
                accessibilityRole="tab"
                accessibilityLabel={`${VEHICLE_SCREEN_LABELS[screen]} Vehicle Display`}
                accessibilityHint={`Shows ${VEHICLE_SCREEN_LABELS[screen]} information`}
                accessibilityState={{ selected: isActive }}
              >
                <Ionicons
                  name={VEHICLE_SCREEN_ICONS[screen] as any}
                  size={22}
                  color={isActive ? modeColor : '#555'}
                />
                <Text style={[
                  styles.tabLabel,
                  isActive && { color: modeColor },
                ]} numberOfLines={2} maxFontSizeMultiplier={1.4}>
                  {VEHICLE_SCREEN_LABELS[screen]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0B0E12',
  },
  container: {
    flex: 1,
    backgroundColor: '#0B0E12',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(212,160,23,0.15)',
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 5,
    color: '#8B949E',
    textAlign: 'center',
  },
  modeButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modeSwitchPanel: {
    backgroundColor: '#111418',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(212,160,23,0.15)',
  },
  modeSwitchTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 4,
    color: '#8B949E',
    marginBottom: 10,
    textAlign: 'center',
  },
  modeSwitchRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modeSwitchOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E232B',
    backgroundColor: '#0B0E12',
  },
  modeSwitchActive: {
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  modeSwitchLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 3,
    color: '#8B949E',
  },
  autoModeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    minHeight: 44,
  },
  autoModeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#555',
    letterSpacing: 1,
  },
  screenContent: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#111418',
    borderTopWidth: 1,
    borderTopColor: 'rgba(212,160,23,0.15)',
    paddingBottom: 4,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    minHeight: 58,
    position: 'relative',
  },
  tabActive: {},
  tabLabel: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 3,
    color: '#555',
    marginTop: 4,
  },
});




