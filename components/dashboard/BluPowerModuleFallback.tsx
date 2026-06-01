import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { TACTICAL } from '../../lib/theme';
import { resolveBluPowerModuleRuntime } from '../../lib/bluPowerModuleRive';

export type PowerModuleRiveWidgetProps = {
  hasEcsData: boolean;
  batteryPercent: number | null | undefined;
  inputWatts: number | null | undefined;
  outputWatts: number | null | undefined;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export type BluPowerModuleRiveProps = Omit<PowerModuleRiveWidgetProps, 'hasEcsData'> & {
  isOnline: boolean;
};

export default function BluPowerModuleFallback({
  hasEcsData,
  batteryPercent,
  inputWatts,
  outputWatts,
  style,
  testID,
}: PowerModuleRiveWidgetProps) {
  const runtime = resolveBluPowerModuleRuntime({ hasEcsData, batteryPercent, inputWatts, outputWatts });
  const onlineColor = hasEcsData ? TACTICAL.success : TACTICAL.textMuted;

  return (
    <View testID={testID} style={[styles.fallback, style]}>
      <View style={[styles.statusDot, { backgroundColor: onlineColor }]} />
      <Text style={[styles.percent, { color: runtime.batteryPercent > 0 ? TACTICAL.amber : TACTICAL.textMuted }]}>
        {runtime.batteryPercent}%
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 72,
    minHeight: 48,
    gap: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  percent: {
    fontSize: 16,
    lineHeight: 18,
    fontWeight: '900',
    letterSpacing: 0,
  },
});
