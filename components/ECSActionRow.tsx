import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { ECS_INTERACTION } from '../lib/ecsInteractionTokens';

interface ECSActionRowProps {
  children: React.ReactNode;
  compact?: boolean;
  wrap?: boolean;
  style?: StyleProp<ViewStyle>;
}

export default function ECSActionRow({
  children,
  compact = false,
  wrap = false,
  style,
}: ECSActionRowProps) {
  return (
    <View
      style={[
        styles.row,
        compact && styles.rowCompact,
        wrap && styles.wrap,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: ECS_INTERACTION.gap.row,
  },
  rowCompact: {
    gap: ECS_INTERACTION.gap.compactRow,
  },
  wrap: {
    flexWrap: 'wrap',
  },
});
