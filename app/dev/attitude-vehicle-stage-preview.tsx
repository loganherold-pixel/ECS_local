import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import VehicleAttitudeStage from '../../src/features/attitude/components/VehicleAttitudeStage';
import { VEHICLE_ATTITUDE_ASSETS } from '../../src/features/attitude/vehicleAttitudeAssets';
import { TACTICAL } from '../../lib/theme';

const SWEEP_VALUES = [-30, -20, -10, 0, 10, 20, 30];

export default function AttitudeVehicleStagePreview() {
  const [index, setIndex] = useState(0);
  const vehicles = useMemo(() => Object.values(VEHICLE_ATTITUDE_ASSETS), []);
  const pitchDeg = SWEEP_VALUES[index % SWEEP_VALUES.length];
  const rollDeg = SWEEP_VALUES[(SWEEP_VALUES.length - 1 - index) % SWEEP_VALUES.length];

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((value) => (value + 1) % SWEEP_VALUES.length);
    }, 900);
    return () => clearInterval(timer);
  }, []);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>ECS ATTITUDE DEV PREVIEW</Text>
        <Text style={styles.title}>Vehicle Attitude Stage</Text>
        <Text style={styles.meta}>Pitch {pitchDeg} deg | Roll {rollDeg} deg</Text>
      </View>

      <View style={styles.modeGrid}>
        <PreviewPanel title="Monitor" widthMode="wide">
          <VehicleAttitudeStage
            vehicleId="toyota_tacoma"
            pitchDeg={pitchDeg}
            rollDeg={rollDeg}
            mode="monitor"
            showZeroButton
            onZero={() => undefined}
          />
        </PreviewPanel>

        <PreviewPanel title="Command" widthMode="wide">
          <VehicleAttitudeStage
            vehicleId="jeep_wrangler"
            pitchDeg={pitchDeg}
            rollDeg={rollDeg}
            mode="command"
            showZeroButton
            onZero={() => undefined}
          />
        </PreviewPanel>

        <PreviewPanel title="Narrow" widthMode="narrow">
          <VehicleAttitudeStage
            vehicleId="ford_bronco"
            pitchDeg={pitchDeg}
            rollDeg={rollDeg}
            mode="monitor"
            showZeroButton
            onZero={() => undefined}
          />
        </PreviewPanel>
      </View>

      <View style={styles.vehicleGrid}>
        {vehicles.map((vehicle) => (
          <View key={vehicle.vehicleId} style={styles.vehicleCell}>
            <Text style={styles.vehicleLabel} numberOfLines={1}>{vehicle.label}</Text>
            <VehicleAttitudeStage
              vehicleId={vehicle.vehicleId}
              pitchDeg={pitchDeg}
              rollDeg={rollDeg}
              mode="monitor"
              showZeroButton={false}
            />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function PreviewPanel({
  title,
  widthMode,
  children,
}: {
  title: string;
  widthMode: 'wide' | 'narrow';
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.previewPanel, widthMode === 'narrow' ? styles.previewPanelNarrow : null]}>
      <Text style={styles.panelTitle}>{title}</Text>
      <View style={styles.stageFrame}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#080B0F',
  },
  content: {
    gap: 16,
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    gap: 4,
  },
  eyebrow: {
    color: TACTICAL.amber,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  title: {
    color: TACTICAL.text,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
  },
  meta: {
    color: TACTICAL.textMuted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  modeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'stretch',
  },
  previewPanel: {
    flexGrow: 1,
    flexBasis: 420,
    gap: 8,
    minWidth: 280,
  },
  previewPanelNarrow: {
    flexGrow: 0,
    flexBasis: 260,
  },
  panelTitle: {
    color: TACTICAL.text,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  stageFrame: {
    height: 250,
    overflow: 'hidden',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(5,8,12,0.72)',
  },
  vehicleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  vehicleCell: {
    width: 280,
    gap: 6,
  },
  vehicleLabel: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
});
