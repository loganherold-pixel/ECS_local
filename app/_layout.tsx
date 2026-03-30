import React, { useEffect, useRef, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, Text, StyleSheet, TouchableOpacity, AppState, type AppStateStatus } from 'react-native';
import { Image } from 'expo-image';
import { SafeIcon as Ionicons } from '../components/SafeIcon';

import { AppProvider, useApp } from '../context/AppContext';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import { WizardStateProvider } from '../context/WizardStateContext';
import { ViewerSettingsProvider } from '../context/ViewerSettingsContext';

import CommandDock from '../components/CommandDock';

import { TACTICAL } from '../lib/theme';
import { MOTION } from '../lib/motion';
import { flushDashboardWrites } from '../lib/dashboardStore';
import { setupStore } from '../lib/setupStore';
import { timelineIntelligenceEngine } from '../lib/timelineIntelligenceEngine';
import { ecsSyncCoordinator } from '../lib/ecsSyncCoordinator';
import { ecsOfflineInterlock } from '../lib/ecsOfflineInterlock';
import { androidAutoBridge } from '../lib/androidAutoBridge';
import {
  powerTelemetryManager,
  MockPowerConnector,
  logDevTokenInstructions,
} from '../src/power';



const APP_LOGO = 'https://d64gsuwffb70l.cloudfront.net/696e98bf1e58953c5b50217c_1771646221167_d7b37c61.png';

if (typeof globalThis.fetch === 'undefined') {
  // @ts-ignore
  globalThis.fetch = fetch;
}

// ── Auth screens that don't require authentication ───────────
const AUTH_SCREENS = ['login', 'initialize', 'create-access-key', 'setup'];

// ── Screens that STRICTLY require authentication (cloud-only features) ──
const PROTECTED_SCREENS = ['expedition-detail', 'expedition-command', 'expedition-checklist', 'expedition-log', 'expedition-route-mgr', 'expedition-livelog', 'expedition-dispatch'];



/**
 * AuthGate — centralized auth guard
 * 
 * CRITICAL RULES:
 * 1. Only route to login if session is null AND not in offline mode
 * 2. NEVER redirect to login due to failed data fetches
 * 3. Show loading screen only during initial session check
 * 4. ALWAYS render the Stack navigator to prevent "navigate before mounting" errors
 */
function AuthGate() {
  const { user, authLoading, loading, operatorInfo, offlineMode, bootstrapError, retryBootstrap } = useApp();
  const { effectiveTheme, palette, isLight } = useTheme();
  const segments = useSegments();
  const router = useRouter();

  // Track whether the Stack navigator has mounted. We set this to true
  // after the first render that includes the Stack, then wait one frame
  // before allowing navigation. This prevents the "Attempted to navigate
  // before mounting the Root Layout component" error in expo-router.
  const navigatorMountedRef = useRef(false);
  const [navigatorReady, setNavigatorReady] = useState(false);

  useEffect(() => {
    // After the Stack renders for the first time, wait one frame
    // to ensure expo-router has fully initialized the navigator.
    if (!navigatorMountedRef.current) {
      navigatorMountedRef.current = true;
      requestAnimationFrame(() => {
        setNavigatorReady(true);
      });
    }
  }, []);

  useEffect(() => {
    // Guard: don't navigate until the navigator is mounted and ready
    if (!navigatorReady) return;
    if (authLoading || loading) return;

    const firstSegment = segments[0] as string | undefined;
    const inAuthScreen = firstSegment
      ? AUTH_SCREENS.includes(firstSegment)
      : false;
    const inProtectedScreen = firstSegment
      ? PROTECTED_SCREENS.includes(firstSegment)
      : false;
    const isIndex = !firstSegment || firstSegment === 'index';
    const inTabs = firstSegment === '(tabs)';
    const inSetup = firstSegment === 'setup';

    // ── Helper: resolve dashboard destination ──────────────
    // If first-time setup is not complete, redirect to /setup instead
    // of dashboard. This ensures vehicle specs are configured before
    // the user sees blank mechanical values on the dashboard.
    // Phase 8: Restored setup redirect — prevents dashboard from loading
    // before the wizard completes.
    const dashboardOrSetup = (): string => {
      if (!setupStore.isComplete()) {
        return '/setup';
      }
      return '/(tabs)/dashboard';
    };


    if (isIndex) {
      if (user) {
        if (operatorInfo?.status === 'suspended') {
          router.replace('/login');
        } else {
          router.replace(dashboardOrSetup() as any);
        }
      } else if (offlineMode) {
        router.replace(dashboardOrSetup() as any);
      } else {
        router.replace('/login');
      }
      return;
    }

    // Don't redirect away from setup screen — user needs to complete it
    if (inSetup) return;

    if (user && inAuthScreen) {
      if (operatorInfo?.status !== 'suspended') {
        router.replace(dashboardOrSetup() as any);
      }
      return;
    }

    if (!user && !offlineMode && inProtectedScreen) {
      router.replace('/login');
      return;
    }

    if (!user && offlineMode && inProtectedScreen) {
      router.replace(dashboardOrSetup() as any);
      return;
    }
  }, [user, authLoading, loading, segments, operatorInfo, offlineMode, navigatorReady]);


  // Determine StatusBar style based on theme
  const statusBarStyle = isLight ? 'dark' : 'light';

  // ── Loading state: shown as overlay on top of the always-rendered Stack ──
  const isLoading = authLoading || loading;

  // ── Auth resolved: render navigation ─────────────────────
  // CRITICAL: The Stack navigator is ALWAYS rendered (never behind a conditional
  // early return) to ensure expo-router's internal navigation state is initialized
  // before any useEffect tries to call router.replace(). The loading screen is
  // rendered as an absolute-positioned overlay on top of the Stack.
  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={statusBarStyle} />

      {/* Bootstrap error banner — non-blocking, dismissible */}
      {!isLoading && bootstrapError && user && (
        <View style={[styles.bootstrapBanner, { backgroundColor: palette.amber + '15', borderBottomColor: palette.amber + '30' }]}>
          <Ionicons name="information-circle-outline" size={16} color={palette.amber} />
          <Text style={[styles.bootstrapText, { color: palette.amber }]}>Signed in. {bootstrapError}</Text>
          <TouchableOpacity onPress={retryBootstrap} style={[styles.retryBtn, { backgroundColor: palette.amber + '25', borderColor: palette.amber + '40' }]} activeOpacity={0.7}>
            <Text style={[styles.retryText, { color: palette.amber }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          animationDuration: MOTION.screenTransition,
          contentStyle: { backgroundColor: palette.bg },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="initialize" />
        <Stack.Screen name="create-access-key" />
        <Stack.Screen
          name="setup"
          options={{
            animation: 'fade',
            animationDuration: MOTION.screenTransition,
          }}
        />
        <Stack.Screen
          name="expedition-detail"
          options={{
            animation: 'fade_from_bottom',
            animationDuration: MOTION.modalSlide,
          }}
        />

        <Stack.Screen
          name="expedition-wizard"
          options={{
            animation: 'fade_from_bottom',
            animationDuration: MOTION.modalSlide,
          }}
        />
        <Stack.Screen
          name="expedition-command"
          options={{
            animation: 'fade',
            animationDuration: MOTION.screenTransition,
          }}
        />
        <Stack.Screen
          name="expedition-checklist"
          options={{
            animation: 'fade_from_bottom',
            animationDuration: MOTION.modalSlide,
          }}
        />
        <Stack.Screen
          name="expedition-log"
          options={{
            animation: 'fade_from_bottom',
            animationDuration: MOTION.modalSlide,
          }}
        />
        <Stack.Screen
          name="expedition-route-mgr"
          options={{
            animation: 'fade_from_bottom',
            animationDuration: MOTION.modalSlide,
          }}
        />
        <Stack.Screen
          name="navigate-run"
          options={{
            animation: 'fade_from_bottom',
            animationDuration: MOTION.modalSlide,
          }}
        />

        <Stack.Screen
          name="navigate-offline"
          options={{
            animation: 'fade_from_bottom',
            animationDuration: MOTION.modalSlide,
          }}
        />
        <Stack.Screen
          name="navigate-bailouts"
          options={{
            animation: 'fade_from_bottom',
            animationDuration: MOTION.modalSlide,
          }}
        />
        <Stack.Screen
          name="weight-dashboard"
          options={{
            animation: 'fade_from_bottom',
            animationDuration: MOTION.modalSlide,
          }}
        />
        <Stack.Screen
          name="expedition-livelog"
          options={{
            animation: 'fade_from_bottom',
            animationDuration: MOTION.modalSlide,
          }}
        />
        <Stack.Screen
          name="expedition-dispatch"
          options={{
            animation: 'fade_from_bottom',
            animationDuration: MOTION.modalSlide,
          }}
        />
        <Stack.Screen
          name="expedition-archive"
          options={{
            animation: 'fade_from_bottom',
            animationDuration: MOTION.modalSlide,
          }}
        />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="power"
          options={{
            animation: 'fade_from_bottom',
            animationDuration: MOTION.modalSlide,
          }}
        />
        <Stack.Screen
          name="vehicle-display"
          options={{
            animation: 'fade',
            animationDuration: MOTION.screenTransition,
          }}
        />


      </Stack>

      {/* Command Dock — persistent bottom navigation bar (hidden during loading) */}
      {!isLoading && <CommandDock />}



      {/* Loading overlay — rendered on top of the Stack so the navigator is always mounted */}
      {isLoading && (
        <View style={[styles.loadingOverlay, { backgroundColor: palette.bg }]} pointerEvents="auto">
          <Image
            source={{ uri: APP_LOGO }}
            style={styles.loadingLogo}
            contentFit="contain"
          />
          <ActivityIndicator size="large" color={palette.amber} />
          <Text style={[styles.loadingText, { color: palette.textMuted }]}>Loading...</Text>
        </View>
      )}
    </View>
  );
}



/**
 * RootLayout — entry point for the entire app
 *
 * Includes an AppState listener that flushes any pending debounced
 * dashboard writes to disk when the app transitions to 'background'
 * or 'inactive' state. This ensures the OS cannot kill the process
 * before widget layout changes are persisted.
 *
 * The listener lives here (outside providers) so it runs regardless
 * of auth state or navigation context.
 */
export default function RootLayout() {
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      const prevState = appStateRef.current;

      // Flush pending dashboard writes when leaving the active state.
      // This covers:
      //   active → background  (user switches apps / presses home)
      //   active → inactive    (iOS: incoming call, notification center, control center)
      //   active → unknown     (rare edge case on some Android OEMs)
      if (
        prevState === 'active' &&
        (nextState === 'background' || nextState === 'inactive')
      ) {
        console.log(`[RootLayout] App state ${prevState} → ${nextState} — flushing dashboard writes`);
        flushDashboardWrites().catch((err) => {
          console.warn('[RootLayout] Dashboard flush on background failed:', err);
        });

        // Integration Pass 1: Suspend sync coordinator on background
        ecsSyncCoordinator.suspend();
      }

      // Integration Pass 1: Resume sync coordinator on foreground
      if (
        (prevState === 'background' || prevState === 'inactive') &&
        nextState === 'active'
      ) {
        ecsSyncCoordinator.resume();
      }

      appStateRef.current = nextState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, []);


  // ── DEV-ONLY: attach MockPowerConnector for live telemetry simulation ──
  // This enables usePowerTelemetry() to return live-updating data without
  // real BLE hardware. The mock streams at 1 Hz with realistic battery +
  // solar values. Safe to leave in — the __DEV__ guard strips it from
  // production builds.
  //
  // ── ALTERNATIVE: CloudConnector + EcoFlowCloudProvider ──
  // To test the cloud architecture instead of the direct mock, replace
  // the MockPowerConnector block below with:
  //
  //   import { CloudConnector } from '../src/power/connectors/CloudConnector';
  //   import { EcoFlowCloudProvider } from '../src/power/cloud/providers/EcoFlowCloudProvider';
  //   import { tokenStore } from '../src/power/cloud/TokenStore';
  //
  //   useEffect(() => {
  //     if (!__DEV__) return;
  //     const provider = new EcoFlowCloudProvider();
  //     const cloud = new CloudConnector(provider, tokenStore, { pollIntervalMs: 5_000 });
  //     powerTelemetryManager.attachConnector(cloud);
  //     // Seed a stub token so CloudConnector.connect() doesn't reject
  //     tokenStore.setToken('ecoflow', 'dev-stub-token').then(() => {
  //       return cloud.connect('delta2-dev');
  //     }).then(() => {
  //       console.log('[RootLayout] CloudConnector + EcoFlowCloudProvider attached — polling');
  //     }).catch((err) => {
  //       console.warn('[RootLayout] CloudConnector failed to connect:', err);
  //     });
  //     return () => {
  //       cloud.disconnect().catch(() => {});
  //       powerTelemetryManager.detachConnector();
  //       cloud.destroy();
  //     };
  //   }, []);
  //
  useEffect(() => {
    if (!__DEV__) return;

    const mock = new MockPowerConnector();
    powerTelemetryManager.attachConnector(mock);

    // Fire-and-forget connect — errors are logged but non-fatal
    mock.connect('mock-dev').then(() => {
      console.log('[RootLayout] MockPowerConnector attached — telemetry streaming');
    }).catch((err) => {
      console.warn('[RootLayout] MockPowerConnector failed to connect:', err);
    });

    // Phase 3C: Log dev token instructions once on startup
    logDevTokenInstructions();

    return () => {
      mock.disconnect().catch(() => {});
      powerTelemetryManager.detachConnector();
      mock.destroy();
    };
  }, []);

  // ── Timeline Intelligence Engine — auto-monitor ────────────────────
  // Initializes the timeline intelligence engine which automatically
  // monitors expedition state changes and logs timeline events
  // (milestones, remote zone entries, power warnings, etc.)
  useEffect(() => {
    const cleanup = timelineIntelligenceEngine.initAutoMonitor();
    console.log('[RootLayout] Timeline Intelligence Engine auto-monitor initialized');
    return cleanup;
  }, []);

  // ── Android Auto Bridge — start/stop with app lifecycle ────────────
  useEffect(() => {
    androidAutoBridge.start();
    console.log('[RootLayout] Android Auto bridge initialized');
    return () => {
      androidAutoBridge.stop();
    };
  }, []);

  // ── Integration Pass 1: ECS Cross-System Sync Coordinator ─────────

  // Starts the central sync coordinator that manages data flow between
  // all major ECS systems (BLU, Vehicle Telemetry, Connectivity Intel,
  // Risk Engine, Assistant). Ensures update ordering, debounce, and
  // circular dependency prevention across the entire ECS stack.
  useEffect(() => {
    // Deferred start to allow individual systems to initialize first
    const timer = setTimeout(() => {
      ecsSyncCoordinator.start();
      console.log('[RootLayout] ECS Sync Coordinator started');
    }, 3000);

    return () => {
      clearTimeout(timer);
      ecsSyncCoordinator.stop();
    };
  }, []);

  // ── Integration Pass 3: ECS Offline Interlock ─────────────────────
  // Coordinates Discovery, Navigation, Offline DB, and Connectivity
  // Intelligence for seamless online/offline transitions. Starts after
  // the sync coordinator to ensure system summaries are available.
  useEffect(() => {
    const timer = setTimeout(() => {
      ecsOfflineInterlock.initialize();
      console.log('[RootLayout] ECS Offline Interlock initialized');
    }, 4000);

    return () => {
      clearTimeout(timer);
      ecsOfflineInterlock.stopMonitoring();
    };
  }, []);





  return (
    <AppProvider>
      <ThemeProvider>
        <ViewerSettingsProvider>
          <WizardStateProvider>
            <AuthGate />
          </WizardStateProvider>
        </ViewerSettingsProvider>
      </ThemeProvider>
    </AppProvider>
  );
}




const styles = StyleSheet.create({
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    zIndex: 999,
  },
  loadingLogo: {
    width: 100,
    height: 100,
    marginBottom: 12,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  bootstrapBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingTop: 50, // account for status bar
    zIndex: 10,
  },
  bootstrapText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
  },
  retryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  retryText: {
    fontSize: 11,
    fontWeight: '700',
  },
});






