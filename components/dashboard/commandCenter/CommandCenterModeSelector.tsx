import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { SafeIcon as Ionicons } from '../../SafeIcon';
import { TACTICAL, TYPO } from '../../../lib/theme';
import type { CommandCenterMode } from './commandCenterTypes';

type Props = {
  mode: CommandCenterMode;
  availableModes: CommandCenterMode[];
  onModeChange: (mode: CommandCenterMode) => void;
  testID?: string;
  compact?: boolean;
};

const MODE_LABEL: Record<CommandCenterMode, string> = {
  attitude: 'ATTITUDE',
  threeDNavigation: 'NAV 3D',
  recoveryHazardCompass: 'RECOVERY',
  trailDecision: 'TRAIL',
  campScout: 'CAMP',
  expeditionReadiness: 'READY',
};

function getModeIcon(mode: CommandCenterMode) {
  switch (mode) {
    case 'threeDNavigation':
      return 'navigate-outline';
    case 'recoveryHazardCompass':
      return 'compass-outline';
    case 'trailDecision':
      return 'analytics-outline';
    case 'campScout':
      return 'bonfire-outline';
    case 'expeditionReadiness':
      return 'shield-checkmark-outline';
    case 'attitude':
    default:
      return 'speedometer-outline';
  }
}

export default function CommandCenterModeSelector({
  mode,
  availableModes,
  onModeChange,
  testID,
  compact = false,
}: Props) {
  const dense = compact && availableModes.length >= 7;

  return (
    <View
      style={[styles.selector, compact && styles.selectorCompact, dense && styles.selectorDense]}
      testID={testID}
      accessibilityRole="tablist"
    >
      {availableModes.map((availableMode) => {
        const selected = availableMode === mode;
        return (
          <TouchableOpacity
            key={availableMode}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={`Switch command center to ${MODE_LABEL[availableMode]}`}
            activeOpacity={0.82}
            onPress={() => onModeChange(availableMode)}
            style={[
              styles.modeButton,
              compact && styles.modeButtonCompact,
              dense && styles.modeButtonDense,
              selected && styles.modeButtonSelected,
            ]}
          >
            <Ionicons
              name={getModeIcon(availableMode)}
              size={dense ? 9 : compact ? 10 : 12}
              color={selected ? TACTICAL.amber : TACTICAL.textMuted}
            />
            <Text
              style={[
                styles.modeButtonText,
                compact && styles.modeButtonTextCompact,
                dense && styles.modeButtonTextDense,
                selected && styles.modeButtonTextSelected,
              ]}
              numberOfLines={1}
            >
              {MODE_LABEL[availableMode]}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  selector: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  selectorCompact: {
    minHeight: 26,
    gap: 5,
  },
  selectorDense: {
    gap: 3,
  },
  modeButton: {
    minHeight: 28,
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(212, 160, 23, 0.18)',
    backgroundColor: 'rgba(19, 24, 30, 0.62)',
    paddingHorizontal: 7,
  },
  modeButtonCompact: {
    minHeight: 24,
    paddingHorizontal: 6,
  },
  modeButtonDense: {
    minHeight: 24,
    gap: 3,
    paddingHorizontal: 3,
  },
  modeButtonSelected: {
    borderColor: 'rgba(245, 199, 73, 0.54)',
    backgroundColor: 'rgba(42, 32, 11, 0.84)',
  },
  modeButtonText: {
    ...TYPO.U2,
    color: TACTICAL.textMuted,
    fontSize: 8,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  modeButtonTextCompact: {
    fontSize: 7,
    letterSpacing: 0.45,
  },
  modeButtonTextDense: {
    fontSize: 6,
    letterSpacing: 0.2,
  },
  modeButtonTextSelected: {
    color: TACTICAL.amber,
  },
});
