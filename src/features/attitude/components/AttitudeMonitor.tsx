import React from 'react';
import {
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import AttitudeDial from './AttitudeDial';

export type AttitudeMonitorProps = {
  rollDeg: number;
  pitchDeg: number;
  size: number;
  ecsGold: string;
  rollMinDeg?: number;
  rollMaxDeg?: number;
  pitchMinDeg?: number;
  pitchMaxDeg?: number;
  warningThresholdDeg?: number;
  criticalThresholdDeg?: number;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

export default function AttitudeMonitor({
  criticalThresholdDeg,
  ecsGold,
  pitchDeg,
  pitchMaxDeg,
  pitchMinDeg,
  rollDeg,
  rollMaxDeg,
  rollMinDeg,
  size,
  style,
  testID = 'vehicle-attitude-monitor',
  warningThresholdDeg,
}: AttitudeMonitorProps) {
  return (
    <View
      testID={testID}
      pointerEvents="none"
      style={[styles.shell, style]}
    >
      <AttitudeDial
        label="PITCH"
        valueDeg={pitchDeg}
        minDeg={pitchMinDeg}
        maxDeg={pitchMaxDeg}
        size={size}
        ecsGold={ecsGold}
        warningThresholdDeg={warningThresholdDeg}
        criticalThresholdDeg={criticalThresholdDeg}
        testID="vehicle-attitude-pitch-dial-meter"
      />
      <AttitudeDial
        label="ROLL"
        valueDeg={rollDeg}
        minDeg={rollMinDeg}
        maxDeg={rollMaxDeg}
        size={size}
        ecsGold={ecsGold}
        warningThresholdDeg={warningThresholdDeg}
        criticalThresholdDeg={criticalThresholdDeg}
        testID="vehicle-attitude-roll-dial-meter"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'visible',
  },
});
