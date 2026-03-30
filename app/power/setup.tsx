/**
 * Power Setup Wizard — Guided flow for connecting expedition battery systems.
 *
 * Steps:
 *   1. Provider Selection — Choose brand (EcoFlow, Bluetti, etc.)
 *   2. Device Discovery — BLE scan / Cloud connection
 *   3. Device Configuration — Name, role, vehicle assignment
 *   4. Setup Complete — Success confirmation
 *
 * Entry points:
 *   - Power System widget → "Add Power System"
 *   - Power Center → "Add Power System" button
 *   - Vehicle Config → Power section
 *   - Empty state → "Add Power System" CTA
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
} from 'react-native';

import { useRouter } from 'expo-router';

import { SafeIcon as Ionicons } from '../../components/SafeIcon';
import { useTheme } from '../../context/ThemeContext';
import { SPACING, RADIUS, GOLD_RAIL } from '../../lib/theme';

import {
  powerSetupStore,
  PROVIDER_DISPLAY,
  type PowerProviderId,
  type DeviceRole,
  type ManagedPowerDevice,
} from '../../lib/powerSetupStore';

import ProviderSelectionStep from '../../components/power-setup/ProviderSelectionStep';
import ConnectionStep, { type DiscoveredDevice } from '../../components/power-setup/ConnectionStep';
import DeviceConfigStep from '../../components/power-setup/DeviceConfigStep';
import SetupCompleteStep from '../../components/power-setup/SetupCompleteStep';

type WizardStep = 'provider' | 'connection' | 'config' | 'complete';

// ── Progress bar ────────────────────────────────────────────────────────
function ProgressBar({ step, palette }: { step: WizardStep; palette: any }) {
  const steps: WizardStep[] = ['provider', 'connection', 'config', 'complete'];
  const currentIdx = steps.indexOf(step);

  return (
    <View style={progressStyles.container}>
      {steps.map((s, idx) => {
        const isActive = idx <= currentIdx;
        const isCurrent = idx === currentIdx;
        return (
          <View key={s} style={progressStyles.stepWrapper}>
            {idx > 0 && (
              <View
                style={[
                  progressStyles.connector,
                  { backgroundColor: isActive ? palette.amber : palette.border },
                ]}
              />
            )}
            <View
              style={[
                progressStyles.dot,
                {
                  backgroundColor: isActive ? palette.amber : palette.border,
                  borderColor: isCurrent ? palette.amber : 'transparent',
                  borderWidth: isCurrent ? 2 : 0,
                  width: isCurrent ? 12 : 8,
                  height: isCurrent ? 12 : 8,
                  borderRadius: isCurrent ? 6 : 4,
                },
              ]}
            />
          </View>
        );
      })}
    </View>
  );
}

const progressStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 0,
  },
  stepWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  connector: {
    width: 40,
    height: 2,
    borderRadius: 1,
  },
  dot: {
    borderRadius: 4,
  },
});

// ── Main Wizard Screen ──────────────────────────────────────────────────
export default function PowerSetupScreen() {
  const router = useRouter();
  const { palette, colors } = useTheme();

  const [step, setStep] = useState<WizardStep>('provider');
  const [selectedProvider, setSelectedProvider] = useState<PowerProviderId | null>(null);
  const [discoveredDevice, setDiscoveredDevice] = useState<DiscoveredDevice | null>(null);
  const [completedDevice, setCompletedDevice] = useState<ManagedPowerDevice | null>(null);

  // Step 1: Provider selected
  const handleProviderSelect = useCallback((provider: PowerProviderId) => {
    setSelectedProvider(provider);
    setStep('connection');
  }, []);

  // Step 2: Device discovered and connected
  const handleDeviceSelected = useCallback((device: DiscoveredDevice) => {
    setDiscoveredDevice(device);
    setStep('config');
  }, []);

  // Step 3: Configuration complete — save device
  const handleConfigComplete = useCallback(
    async (config: {
      customName: string;
      role: DeviceRole;
      vehicleId: string | null;
      isPrimary: boolean;
    }) => {
      if (!selectedProvider || !discoveredDevice) return;

      const device = await powerSetupStore.add({
        provider: selectedProvider,
        connectionMethod: selectedProvider === 'EcoFlow' ? 'cloud' : 'ble',
        originalName: discoveredDevice.name,
        customName: config.customName,
        model: discoveredDevice.model,
        role: config.role,
        vehicleId: config.vehicleId,
        isPrimary: config.isPrimary,
        connectionState: 'connected',
        lastSocPct: Math.floor(Math.random() * 40 + 60),
        lastWattsIn: null,
        lastWattsOut: null,
        signalStrength: discoveredDevice.signal,
      });

      setCompletedDevice(device);
      setStep('complete');
    },
    [selectedProvider, discoveredDevice]
  );

  // Navigation handlers
  const handleCancel = useCallback(() => {
    router.back();
  }, [router]);

  const handleGoToDashboard = useCallback(() => {
    router.replace('/(tabs)/dashboard');
  }, [router]);

  const handleGoToPowerSystems = useCallback(() => {
    router.replace('/power/manage');
  }, [router]);

  const handleAddAnother = useCallback(() => {
    setStep('provider');
    setSelectedProvider(null);
    setDiscoveredDevice(null);
    setCompletedDevice(null);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: palette.panel }]}>
        <View style={styles.headerContent}>
          <View style={[styles.headerIcon, { backgroundColor: palette.amber + '12' }]}>
            <Ionicons name="flash" size={18} color={palette.amber} />
          </View>
          <View style={styles.headerCenter}>
            <Text style={[styles.headerLabel, { color: palette.textMuted }]}>
              ECS POWER
            </Text>
            <Text style={[styles.headerTitle, { color: palette.text }]}>
              SETUP WIZARD
            </Text>
          </View>
          {step !== 'complete' && (
            <View style={[styles.headerBadge, { backgroundColor: palette.amber + '12', borderColor: palette.amber + '25' }]}>
              <Text style={[styles.headerBadgeText, { color: palette.amber }]}>
                {step === 'provider' ? '1/4' : step === 'connection' ? '2/4' : '3/4'}
              </Text>
            </View>
          )}
        </View>

        {/* Progress bar */}
        <ProgressBar step={step} palette={palette} />

        {/* Gold rail */}
        <View style={[styles.goldRail, { backgroundColor: GOLD_RAIL.major }]} />
      </View>

      {/* Content */}
      <View style={styles.content}>
        {step === 'provider' && (
          <ProviderSelectionStep
            palette={palette}
            onSelect={handleProviderSelect}
            onCancel={handleCancel}
          />
        )}

        {step === 'connection' && selectedProvider && (
          <ConnectionStep
            palette={palette}
            provider={selectedProvider}
            onDeviceSelected={handleDeviceSelected}
            onBack={() => setStep('provider')}
          />
        )}

        {step === 'config' && selectedProvider && discoveredDevice && (
          <DeviceConfigStep
            palette={palette}
            provider={selectedProvider}
            deviceName={discoveredDevice.name}
            deviceModel={discoveredDevice.model}
            onComplete={handleConfigComplete}
            onBack={() => setStep('connection')}
          />
        )}

        {step === 'complete' && completedDevice && (
          <SetupCompleteStep
            palette={palette}
            device={completedDevice}
            onGoToDashboard={handleGoToDashboard}
            onGoToPowerSystems={handleGoToPowerSystems}
            onAddAnother={handleAddAnother}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: Platform.OS === 'web' ? 16 : 54,
    paddingHorizontal: SPACING.lg,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerLabel: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 3,
    marginTop: 2,
  },
  headerBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  headerBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: 'Courier',
  },
  goldRail: {
    height: 1.5,
    marginTop: 4,
  },
  content: {
    flex: 1,
    padding: SPACING.lg,
  },
});




