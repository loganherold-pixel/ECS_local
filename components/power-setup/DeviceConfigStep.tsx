/**
 * DeviceConfigStep — Step 3: Configure the connected device.
 *
 * Allows the user to:
 *   - Rename the device (custom name)
 *   - Assign a role (Primary House Battery, Portable, etc.)
 *   - Assign to a vehicle (if multiple vehicles exist)
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
} from 'react-native';
import { SafeIcon as Ionicons } from '../../components/SafeIcon';
import { SPACING, RADIUS, GOLD_RAIL } from '../../lib/theme';
import {
  PROVIDER_DISPLAY,
  DEVICE_ROLE_LABELS,
  type PowerProviderId,
  type DeviceRole,
} from '../../lib/powerSetupStore';
import { resolvePowerReadiness } from '../../lib/powerReadiness';
import { vehicleStore } from '../../lib/vehicleStore';
import type { Vehicle } from '../../lib/types';

interface Props {
  palette: any;
  provider: PowerProviderId;
  deviceName: string;
  deviceModel: string;
  onComplete: (config: {
    customName: string;
    role: DeviceRole;
    vehicleId: string | null;
    isPrimary: boolean;
  }) => void;
  onBack: () => void;
}

const ROLES: DeviceRole[] = [
  'primary_house',
  'portable',
  'auxiliary',
  'solar_source',
  'unassigned',
];

const ROLE_ICONS: Record<DeviceRole, string> = {
  primary_house: 'home-outline',
  portable: 'briefcase-outline',
  auxiliary: 'git-branch-outline',
  solar_source: 'sunny-outline',
  unassigned: 'help-circle-outline',
};

export default function DeviceConfigStep({
  palette,
  provider,
  deviceName,
  deviceModel,
  onComplete,
  onBack,
}: Props) {
  const display = PROVIDER_DISPLAY[provider];
  const readiness = resolvePowerReadiness({
    providerId: provider,
    connectionState: 'connected',
    hasTelemetry: display.supportLevel === 'verified',
    hasStoredSnapshot: true,
  });

  const [customName, setCustomName] = useState(deviceName);
  const [selectedRole, setSelectedRole] = useState<DeviceRole>('primary_house');
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isPrimary, setIsPrimary] = useState(true);

  // Load vehicles
  useEffect(() => {
    (async () => {
      try {
        const { vehicles: v } = await vehicleStore.getAll();
        setVehicles(v);
      } catch {}
    })();
  }, []);

  const handleComplete = () => {
    onComplete({
      customName: customName.trim() || deviceName,
      role: selectedRole,
      vehicleId: selectedVehicle,
      isPrimary,
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.stepBadge, { backgroundColor: display.color + '15', borderColor: display.color + '30' }]}>
          <Text style={[styles.stepNumber, { color: display.color }]}>3</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.stepLabel, { color: palette.textMuted }]}>STEP 3</Text>
          <Text style={[styles.title, { color: palette.text }]}>Configure Device</Text>
        </View>
      </View>

      {/* Device info card */}
      <View style={[styles.deviceCard, { backgroundColor: palette.panel, borderColor: palette.border }]}>
        <View style={[styles.deviceIcon, { backgroundColor: display.color + '12' }]}>
          <Ionicons name={display.icon} size={22} color={display.color} />
        </View>
        <View style={styles.deviceInfo}>
          <Text style={[styles.deviceName, { color: palette.text }]}>{deviceName}</Text>
          <Text style={[styles.deviceModelText, { color: palette.textMuted }]}>{deviceModel}</Text>
        </View>
        <View style={[styles.connectedBadge, { backgroundColor: readiness.color + '12', borderColor: readiness.color + '25' }]}>
          <View style={[styles.connectedDot, { backgroundColor: readiness.color }]} />
          <Text style={[styles.connectedText, { color: readiness.color }]}>{readiness.label}</Text>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: GOLD_RAIL.section }]} />

      {/* Device Name */}
      <Text style={[styles.sectionLabel, { color: palette.amber }]}>DEVICE NAME</Text>
      <Text style={[styles.sectionHint, { color: palette.textMuted }]}>
        Give this device a custom name for easy identification.
      </Text>
      <View style={[styles.inputContainer, { backgroundColor: palette.panel, borderColor: palette.border }]}>
        <Ionicons name="pencil-outline" size={16} color={palette.textMuted} />
        <TextInput
          style={[styles.input, { color: palette.text }]}
          value={customName}
          onChangeText={setCustomName}
          placeholder="e.g. Truck Power Station"
          placeholderTextColor={palette.textMuted + '60'}
          autoCapitalize="words"
          returnKeyType="done"
        />
        {customName !== deviceName && (
          <TouchableOpacity onPress={() => setCustomName(deviceName)}>
            <Ionicons name="close-circle-outline" size={16} color={palette.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <View style={[styles.divider, { backgroundColor: GOLD_RAIL.section }]} />

      {/* Role Assignment */}
      <Text style={[styles.sectionLabel, { color: palette.amber }]}>DEVICE ROLE</Text>
      <Text style={[styles.sectionHint, { color: palette.textMuted }]}>
        Assign a role to help ECS organize your power systems.
      </Text>
      <View style={styles.roleGrid}>
        {ROLES.map((role) => {
          const isSelected = selectedRole === role;
          return (
            <TouchableOpacity
              key={role}
              style={[
                styles.roleCard,
                {
                  backgroundColor: isSelected ? palette.amber + '0C' : palette.panel,
                  borderColor: isSelected ? palette.amber + '50' : palette.border,
                  borderWidth: isSelected ? 1.5 : 1,
                },
              ]}
              onPress={() => setSelectedRole(role)}
              activeOpacity={0.7}
            >
              <View style={[
                styles.roleIcon,
                { backgroundColor: isSelected ? palette.amber + '15' : palette.border + '40' },
              ]}>
                <Ionicons
                  name={ROLE_ICONS[role]}
                  size={18}
                  color={isSelected ? palette.amber : palette.textMuted}
                />
              </View>
              <Text style={[
                styles.roleLabel,
                { color: isSelected ? palette.text : palette.textMuted },
              ]}>
                {DEVICE_ROLE_LABELS[role]}
              </Text>
              {isSelected && (
                <Ionicons name="checkmark-circle" size={16} color={palette.amber} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Primary toggle */}
      <TouchableOpacity
        style={[
          styles.primaryToggle,
          {
            backgroundColor: isPrimary ? palette.amber + '0C' : palette.panel,
            borderColor: isPrimary ? palette.amber + '40' : palette.border,
          },
        ]}
        onPress={() => setIsPrimary(!isPrimary)}
        activeOpacity={0.7}
      >
        <Ionicons
          name={isPrimary ? 'star' : 'star-outline'}
          size={18}
          color={isPrimary ? palette.amber : palette.textMuted}
        />
        <View style={styles.primaryInfo}>
          <Text style={[styles.primaryLabel, { color: isPrimary ? palette.text : palette.textMuted }]}>
            Set as Primary Power System
          </Text>
          <Text style={[styles.primaryHint, { color: palette.textMuted }]}>
            Primary system is shown in the compact dashboard widget
          </Text>
        </View>
        <View style={[
          styles.toggleTrack,
          { backgroundColor: isPrimary ? palette.amber : palette.border },
        ]}>
          <View style={[
            styles.toggleThumb,
            { transform: [{ translateX: isPrimary ? 16 : 0 }] },
          ]} />
        </View>
      </TouchableOpacity>

      <View style={[styles.divider, { backgroundColor: GOLD_RAIL.section }]} />

      {/* Vehicle Assignment */}
      {vehicles.length > 0 && (
        <>
          <Text style={[styles.sectionLabel, { color: palette.amber }]}>VEHICLE ASSIGNMENT</Text>
          <Text style={[styles.sectionHint, { color: palette.textMuted }]}>
            Assign this device to a specific vehicle, or leave unassigned for global access.
          </Text>

          {/* No vehicle option */}
          <TouchableOpacity
            style={[
              styles.vehicleCard,
              {
                backgroundColor: selectedVehicle === null ? palette.amber + '0C' : palette.panel,
                borderColor: selectedVehicle === null ? palette.amber + '40' : palette.border,
              },
            ]}
            onPress={() => setSelectedVehicle(null)}
            activeOpacity={0.7}
          >
            <Ionicons
              name="globe-outline"
              size={18}
              color={selectedVehicle === null ? palette.amber : palette.textMuted}
            />
            <Text style={[
              styles.vehicleName,
              { color: selectedVehicle === null ? palette.text : palette.textMuted },
            ]}>
              Global (No Vehicle)
            </Text>
            {selectedVehicle === null && (
              <Ionicons name="checkmark-circle" size={16} color={palette.amber} />
            )}
          </TouchableOpacity>

          {vehicles.map((v) => {
            const isSelected = selectedVehicle === v.id;
            return (
              <TouchableOpacity
                key={v.id}
                style={[
                  styles.vehicleCard,
                  {
                    backgroundColor: isSelected ? palette.amber + '0C' : palette.panel,
                    borderColor: isSelected ? palette.amber + '40' : palette.border,
                  },
                ]}
                onPress={() => setSelectedVehicle(v.id)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="car-outline"
                  size={18}
                  color={isSelected ? palette.amber : palette.textMuted}
                />
                <View style={styles.vehicleInfo}>
                  <Text style={[
                    styles.vehicleName,
                    { color: isSelected ? palette.text : palette.textMuted },
                  ]}>
                    {v.name}
                  </Text>
                  {(v.make || v.model) && (
                    <Text style={[styles.vehicleDetail, { color: palette.textMuted }]}>
                      {[v.year, v.make, v.model].filter(Boolean).join(' ')}
                    </Text>
                  )}
                </View>
                {isSelected && (
                  <Ionicons name="checkmark-circle" size={16} color={palette.amber} />
                )}
              </TouchableOpacity>
            );
          })}

          <View style={[styles.divider, { backgroundColor: GOLD_RAIL.section }]} />
        </>
      )}

      {/* Continue button */}
      <TouchableOpacity
        style={[styles.continueBtn, { backgroundColor: palette.amber }]}
        onPress={handleComplete}
        activeOpacity={0.7}
      >
        <Text style={styles.continueBtnText}>COMPLETE SETUP</Text>
        <Ionicons name="checkmark" size={16} color="#000" />
      </TouchableOpacity>

      {/* Back */}
      <TouchableOpacity
        style={[styles.backBtn, { borderColor: palette.border }]}
        onPress={onBack}
        activeOpacity={0.7}
      >
        <Ionicons name="chevron-back" size={14} color={palette.textMuted} />
        <Text style={[styles.backText, { color: palette.textMuted }]}>BACK</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  stepBadge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  stepNumber: { fontSize: 16, fontWeight: '800' },
  headerText: { flex: 1, gap: 2 },
  stepLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 3, textTransform: 'uppercase' },
  title: { fontSize: 18, fontWeight: '800', letterSpacing: 1 },
  deviceCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: SPACING.md, borderRadius: RADIUS.lg, borderWidth: 1, marginBottom: SPACING.md },
  deviceIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  deviceInfo: { flex: 1, gap: 2 },
  deviceName: { fontSize: 14, fontWeight: '700' },
  deviceModelText: { fontSize: 11, fontWeight: '500' },
  connectedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, borderWidth: 1 },
  connectedDot: { width: 5, height: 5, borderRadius: 3 },
  connectedText: { fontSize: 7, fontWeight: '800', letterSpacing: 2 },
  divider: { height: 1, marginVertical: SPACING.md },
  sectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 4, textTransform: 'uppercase', marginBottom: 4 },
  sectionHint: { fontSize: 12, lineHeight: 18, marginBottom: SPACING.md },
  inputContainer: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: SPACING.md, paddingVertical: 12, borderRadius: RADIUS.md, borderWidth: 1, marginBottom: 4 },
  input: { flex: 1, fontSize: 15, fontWeight: '600' },
  roleGrid: { gap: SPACING.xs },
  roleCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1 },
  roleIcon: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  roleLabel: { flex: 1, fontSize: 13, fontWeight: '600' },
  primaryToggle: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, marginTop: SPACING.md },
  primaryInfo: { flex: 1, gap: 2 },
  primaryLabel: { fontSize: 13, fontWeight: '700' },
  primaryHint: { fontSize: 11, lineHeight: 16 },
  toggleTrack: { width: 36, height: 20, borderRadius: 10, justifyContent: 'center', paddingHorizontal: 2 },
  toggleThumb: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#FFF' },
  vehicleCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, marginBottom: SPACING.xs },
  vehicleInfo: { flex: 1, gap: 2 },
  vehicleName: { fontSize: 13, fontWeight: '700' },
  vehicleDetail: { fontSize: 11 },
  continueBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: RADIUS.md },
  continueBtnText: { color: '#000', fontSize: 14, fontWeight: '800', letterSpacing: 3 },
  backBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: RADIUS.md, borderWidth: 1, marginTop: SPACING.sm },
  backText: { fontSize: 11, fontWeight: '700', letterSpacing: 2 },
});



