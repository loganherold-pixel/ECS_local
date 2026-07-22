import React, { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import {
  routeDiscoveryQaVehicleBootstrap,
  type RouteDiscoveryQaVehicleBootstrapSnapshot,
} from '../../lib/explore/routeDiscoveryQaVehicleBootstrap';
import { TACTICAL } from '../../lib/theme';

export default function RouteDiscoveryQaVehicleBootstrapGate({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<RouteDiscoveryQaVehicleBootstrapSnapshot>(() =>
    routeDiscoveryQaVehicleBootstrap.snapshot(),
  );

  const initialize = useCallback(async () => {
    const pending = routeDiscoveryQaVehicleBootstrap.initialize();
    setSnapshot(routeDiscoveryQaVehicleBootstrap.snapshot());
    const next = await pending;
    setSnapshot(next);
  }, []);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  if (snapshot.state === 'ready' || snapshot.state === 'not_applicable') {
    return <>{children}</>;
  }

  if (snapshot.state === 'failed') {
    return (
      <View
        style={styles.shell}
        accessibilityRole="alert"
        accessibilityLabel="Route Discovery QA synthetic vehicle initialization failed. Supabase remains disabled."
        testID="route-discovery-qa-vehicle-bootstrap-failed"
      >
        <Text style={styles.eyebrow}>ROUTE DISCOVERY QA</Text>
        <Text style={styles.title}>QA SYNTHETIC VEHICLE UNAVAILABLE</Text>
        <Text style={styles.detail}>
          Local vehicle context could not be initialized. Production onboarding is not available in this QA profile.
        </Text>
        <TouchableOpacity
          style={styles.retryButton}
          accessibilityRole="button"
          accessibilityLabel="Retry local QA synthetic vehicle initialization"
          onPress={() => void initialize()}
          testID="route-discovery-qa-vehicle-bootstrap-retry"
        >
          <Text style={styles.retryText}>RETRY LOCAL INITIALIZATION</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View
      style={styles.shell}
      accessibilityRole="summary"
      accessibilityLabel="Route Discovery QA synthetic vehicle initializing. Supabase disabled."
      testID="route-discovery-qa-vehicle-bootstrap-initializing"
    >
      <ActivityIndicator color={TACTICAL.amber} size="large" />
      <Text style={styles.eyebrow}>ROUTE DISCOVERY QA</Text>
      <Text style={styles.title}>QA SYNTHETIC VEHICLE</Text>
      <Text style={styles.detail}>Initializing isolated local vehicle context…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 28,
    backgroundColor: TACTICAL.bg,
  },
  eyebrow: {
    color: TACTICAL.amber,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.4,
    textAlign: 'center',
  },
  title: {
    color: TACTICAL.text,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  detail: {
    maxWidth: 420,
    color: TACTICAL.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  retryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: TACTICAL.amber,
    borderRadius: TACTICAL.radius,
    backgroundColor: TACTICAL.panel,
  },
  retryText: {
    color: TACTICAL.amber,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
});
