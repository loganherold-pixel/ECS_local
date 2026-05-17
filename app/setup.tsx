import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
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

  useEffect(() => {
    if (redirectStartedRef.current) return;
    redirectStartedRef.current = true;

    const mode = firstRouteParam(params.mode);
    const vehicleId = firstRouteParam(params.vehicleId);
    const intent = mode === 'fleet-edit' ? 'fleet_edit_vehicle' : 'fleet_add_vehicle';

    const redirect = async () => {
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
      } finally {
        router.replace('/fleet' as any);
      }
    };

    void redirect();
  }, [params.mode, params.vehicleId, router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="small" color={TACTICAL.amber} />
      <Text style={styles.title}>Opening Fleet</Text>
      <Text style={styles.copy}>
        The retired vehicle setup framework has moved to the current Fleet command center.
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
