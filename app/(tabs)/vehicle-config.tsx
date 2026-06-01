import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { TACTICAL } from '../../lib/theme';
import { ecsLog } from '../../lib/ecsLogger';
import { stageNavigationFlow } from '../../lib/ecsNavigationFlow';

type VehicleConfigRouteParams = {
  vehicleId?: string | string[];
};

function firstRouteParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

export default function DeprecatedVehicleConfigRedirect() {
  const router = useRouter();
  const params = useLocalSearchParams<VehicleConfigRouteParams>();
  const redirectStartedRef = useRef(false);

  useEffect(() => {
    if (redirectStartedRef.current) return;
    redirectStartedRef.current = true;

    const vehicleId = firstRouteParam(params.vehicleId);

    const redirect = async () => {
      try {
        await stageNavigationFlow({
          source: 'fleet',
          target: 'fleet',
          intent: vehicleId ? 'fleet_edit_vehicle' : 'fleet_add_vehicle',
          label: vehicleId ? 'Edit Vehicle' : 'Add Vehicle',
          message: null,
          context: vehicleId ? { vehicleId } : null,
        });
      } catch (error) {
        ecsLog.debug('CONFIG', '[FleetMigration] Deprecated vehicle-config redirect staging failed', {
          vehicleId,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        router.replace('/fleet' as any);
      }
    };

    void redirect();
  }, [params.vehicleId, router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="small" color={TACTICAL.amber} />
      <Text style={styles.title}>Opening Fleet</Text>
      <Text style={styles.copy}>
        Vehicle configuration now lives in the current Fleet command center.
      </Text>
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
});
