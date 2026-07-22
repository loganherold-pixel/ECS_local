import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { TACTICAL } from '../lib/theme';
import { ecsLog } from '../lib/ecsLogger';
import { stageNavigationFlow } from '../lib/ecsNavigationFlow';

type SetupRouteParams = {
  mode?: string | string[];
  vehicleId?: string | string[];
};

function firstRouteParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

export default function DeprecatedVehicleSetupRedirect() {
  const router = useRouter();
  const params = useLocalSearchParams<SetupRouteParams>();
  const redirectStartedRef = useRef(false);
  const [redirectState, setRedirectState] = useState<'opening' | 'retryable_failure'>('opening');
  const mode = firstRouteParam(params.mode);
  const vehicleId = firstRouteParam(params.vehicleId);

  const startRedirect = useCallback(async () => {
    if (redirectStartedRef.current) return;
    redirectStartedRef.current = true;
    setRedirectState((current) => current === 'opening' ? current : 'opening');
    const intent = mode === 'fleet-edit' ? 'fleet_edit_vehicle' : 'fleet_add_vehicle';

    try {
      if (mode === 'fleet-add' || mode === 'fleet-edit' || mode === 'guest-entry') {
        await stageNavigationFlow({
          source: 'fleet',
          target: 'fleet',
          intent,
          label: intent === 'fleet_edit_vehicle' ? 'Edit Vehicle' : 'Add Vehicle',
          message: null,
          context: { vehicleId },
        });
      }
    } catch (error) {
      ecsLog.debug('CONFIG', '[FleetMigration] Deprecated /setup redirect staging failed', {
        mode,
        vehicleId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      router.replace('/fleet' as any);
    } catch (error) {
      redirectStartedRef.current = false;
      setRedirectState('retryable_failure');
      ecsLog.warn('CONFIG', '[FleetMigration] Fleet destination navigation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [mode, router, vehicleId]);

  useEffect(() => {
    void startRedirect();
  }, [startRedirect]);

  return (
    <View
      style={styles.container}
      accessible
      accessibilityRole="summary"
      accessibilityLabel="ECS Free Session destination. Opening Fleet setup."
    >
      {redirectState === 'opening' ? <ActivityIndicator size="small" color={TACTICAL.amber} /> : null}
      <Text accessibilityRole="header" style={styles.title}>ECS Free Session</Text>
      <Text style={styles.state}>
        {redirectState === 'opening' ? 'Opening Fleet setup…' : 'Fleet setup could not open.'}
      </Text>
      <Text style={styles.copy}>
        The retired vehicle setup framework has moved to the current Fleet command center.
      </Text>
      {redirectState === 'retryable_failure' ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Retry opening Fleet setup"
          onPress={() => void startRedirect()}
          style={styles.retryButton}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 24,
    backgroundColor: TACTICAL.bg,
  },
  title: {
    color: TACTICAL.text,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  copy: {
    maxWidth: 320,
    color: TACTICAL.textMuted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  state: {
    color: TACTICAL.amber,
    fontSize: 12,
    fontWeight: '700',
  },
  retryButton: {
    minHeight: 44,
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: TACTICAL.amber,
    borderRadius: 10,
    paddingHorizontal: 18,
  },
  retryButtonText: {
    color: TACTICAL.amber,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
});
