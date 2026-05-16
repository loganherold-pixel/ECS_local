import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { TACTICAL } from '../../../lib/theme';
import { formatSignedDegrees } from './attitudeReadoutUtils';

export type AttitudeReadoutProps = {
  label: 'PITCH' | 'ROLL' | string;
  valueDeg: number;
  precision?: number;
  className?: string;
  outOfRange?: boolean;
  style?: StyleProp<ViewStyle>;
  valueStyle?: StyleProp<TextStyle>;
};

function getReadoutTestIdBase(label: string): string {
  const normalizedLabel = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `vehicle-attitude-${normalizedLabel || 'axis'}-degree-readout`;
}

function formatReadoutAccessibilityLabel(label: string, formattedValue: string): string {
  return `${label} ${formattedValue.replace('°', ' degrees')}`;
}

function AttitudeReadout({
  label,
  valueDeg,
  precision = 1,
  className,
  outOfRange = false,
  style,
  valueStyle,
}: AttitudeReadoutProps) {
  void className;

  const formattedValue = formatSignedDegrees(valueDeg, precision);
  const testIdBase = getReadoutTestIdBase(label);

  return (
    <View
      testID={`${testIdBase}-box`}
      pointerEvents="none"
      style={[
        styles.shell,
        style,
      ]}
    >
      <Text
        testID={`${testIdBase}-label`}
        style={styles.label}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text
        testID={testIdBase}
        accessibilityLabel={formatReadoutAccessibilityLabel(label, formattedValue)}
        style={[styles.value, outOfRange ? styles.valueWarning : null, valueStyle]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.58}
      >
        {formattedValue}
      </Text>
    </View>
  );
}

export default React.memo(AttitudeReadout);

const styles = StyleSheet.create({
  shell: {
    position: 'relative',
    minWidth: 84,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 0,
    paddingVertical: 0,
    overflow: 'visible',
    backgroundColor: 'transparent',
  },
  label: {
    color: 'rgba(249, 194, 84, 0.86)',
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
    letterSpacing: 1.5,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.72)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  value: {
    color: TACTICAL.text,
    fontSize: 28,
    lineHeight: 33,
    fontWeight: '900',
    letterSpacing: 0,
    textAlign: 'center',
    includeFontPadding: false,
    textShadowColor: 'rgba(249, 194, 84, 0.2)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 9,
  },
  valueWarning: {
    color: TACTICAL.danger,
  },
});
