/**
 * VehicleActionsScreen — Driver-Safe Action Buttons
 *
 * Large, easy-to-tap buttons appropriate for vehicle display surfaces.
 *
 * HighwayDrive actions:
 *   - Add Waypoint, Quick Note, Find Fuel, Report Hazard, Navigate Home
 *
 * ExpeditionDrive actions:
 *   - Drop Waypoint, Incident Marker, Quick Note, Return to Start, Emergency Comms
 */

import React, { useCallback } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type {
  VehicleAction,
  VehicleActionType,
  VehicleDisplayMode,
} from '../../lib/vehicleDisplayTypes';

import {
  HIGHWAY_ACTIONS,
  EXPEDITION_ACTIONS,
} from '../../lib/vehicleDisplayTypes';

interface Props {
  mode: VehicleDisplayMode;
  actions: VehicleAction[];
}

export default function VehicleActionsScreen({ mode, actions }: Props) {
  const isExpedition = mode === 'expedition_drive';
  const accentColor = isExpedition ? '#D4A017' : '#5B8DEF';

  // Use the provided actions, or fall back to defaults
  const displayActions = actions.length > 0
    ? actions
    : (isExpedition ? EXPEDITION_ACTIONS : HIGHWAY_ACTIONS);

  const handleAction = useCallback((action: VehicleAction) => {
    if (!action.enabled) return;

    // Execute the action through the store
    vehicleDisplayStore.executeAction(action.actionType);

    // Show confirmation feedback
    Alert.alert(
      action.label,
      `${action.label} action triggered from vehicle display.`,
      [{ text: 'OK' }]
    );
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.screenTitle}>
        {isExpedition ? 'EXPEDITION ACTIONS' : 'QUICK ACTIONS'}
      </Text>

      <View style={styles.grid}>
        {displayActions.map((action) => (
          <ActionButton
            key={action.id}
            action={action}
            onPress={() => handleAction(action)}
          />
        ))}
      </View>

      <Text style={styles.hint}>
        Tap any action to execute from vehicle display
      </Text>
    </View>
  );
}

function ActionButton({
  action,
  onPress,
}: {
  action: VehicleAction;
  onPress: () => void;
}) {
  const isEmergency = action.actionType === 'emergency_comms';

  return (
    <TouchableOpacity
      style={[
        styles.actionButton,
        { borderColor: action.color },
        isEmergency && styles.emergencyButton,
        !action.enabled && styles.disabledButton,
      ]}
      onPress={onPress}
      disabled={!action.enabled}
      activeOpacity={0.7}
    >
      <View style={[styles.iconCircle, { backgroundColor: `${action.color}20` }]}>
        <Ionicons
          name={action.icon as any}
          size={28}
          color={action.enabled ? action.color : '#555'}
        />
      </View>
      <Text
        style={[
          styles.actionLabel,
          { color: action.enabled ? '#E6EDF3' : '#555' },
        ]}
        numberOfLines={2}
      >
        {action.label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0E12',
    padding: 16,
  },
  screenTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 5,
    color: '#8B949E',
    marginBottom: 20,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
  },
  actionButton: {
    width: '45%',
    aspectRatio: 1.3,
    backgroundColor: '#111418',
    borderRadius: 16,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    gap: 10,
  },
  emergencyButton: {
    borderWidth: 2,
    backgroundColor: 'rgba(192,57,43,0.08)',
  },
  disabledButton: {
    opacity: 0.4,
    borderColor: '#333',
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
    textAlign: 'center',
  },
  hint: {
    fontSize: 11,
    color: '#555',
    textAlign: 'center',
    marginTop: 20,
    letterSpacing: 1,
  },
});




