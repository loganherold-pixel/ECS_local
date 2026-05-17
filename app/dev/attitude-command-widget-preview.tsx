import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AttitudeCommandWidget } from '../../src/components/attitudeCommand';
import { VEHICLE_ATTITUDE_ASSETS } from '../../src/features/attitude/vehicleAttitudeAssets';
import { TACTICAL } from '../../lib/theme';

const RAM_PREVIEW = VEHICLE_ATTITUDE_ASSETS.ram_2500_3500;
const JEEP_PREVIEW = VEHICLE_ATTITUDE_ASSETS.jeep_wrangler;
const SWITCHABLE_VEHICLES = [JEEP_PREVIEW, RAM_PREVIEW];

export default function AttitudeCommandWidgetPreview() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [tick, setTick] = useState(0);
  const activeVehicle = SWITCHABLE_VEHICLES[activeIndex % SWITCHABLE_VEHICLES.length];
  const simulatedTelemetry = useMemo(() => {
    const phase = tick / 18;
    return {
      pitchDeg: Math.sin(phase) * 15,
      rollDeg: Math.cos(phase * 0.82) * 15,
    };
  }, [tick]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTick((value) => value + 1);
    }, 120);

    return () => clearInterval(timer);
  }, []);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>ECS ATTITUDE DEV PREVIEW</Text>
        <Text style={styles.title}>Attitude Command Widget</Text>
        <Text style={styles.meta}>
          Static vehicles • active vehicle switching • simulated telemetry • clamp check • responsive frames
        </Text>
      </View>

      <View style={styles.previewGrid}>
        <PreviewPanel title="Static Ram-like Backdrop" subtitle="Pitch +6.4 / Roll -3.2" frameStyle={styles.largeFrame}>
          <AttitudeCommandWidget
            backdropSrc={RAM_PREVIEW.attitudeImageSrc}
            backdropSource={RAM_PREVIEW.attitudeImageSource}
            pitchDeg={6.4}
            rollDeg={-3.2}
            activeVehicleName={RAM_PREVIEW.label}
          />
        </PreviewPanel>

        <PreviewPanel title="Static Jeep-like Backdrop" subtitle="Pitch -4.7 / Roll +8.1" frameStyle={styles.largeFrame}>
          <AttitudeCommandWidget
            backdropSrc={JEEP_PREVIEW.attitudeImageSrc}
            backdropSource={JEEP_PREVIEW.attitudeImageSource}
            pitchDeg={-4.7}
            rollDeg={8.1}
            activeVehicleName={JEEP_PREVIEW.label}
          />
        </PreviewPanel>

        <PreviewPanel
          title="Active Vehicle Switching"
          subtitle="Only the backdrop changes; gauges/readouts stay aligned"
          frameStyle={styles.largeFrame}
          accessory={(
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Switch active preview vehicle"
              style={styles.switchButton}
              onPress={() => setActiveIndex((value) => (value + 1) % SWITCHABLE_VEHICLES.length)}
            >
              <Text style={styles.switchButtonText}>Switch Vehicle</Text>
            </Pressable>
          )}
        >
          <AttitudeCommandWidget
            backdropSrc={activeVehicle.attitudeImageSrc}
            backdropSource={activeVehicle.attitudeImageSource}
            pitchDeg={6.4}
            rollDeg={-3.2}
            activeVehicleName={activeVehicle.label}
          />
        </PreviewPanel>

        <PreviewPanel
          title="Live Simulated Telemetry"
          subtitle="Simulated values only; production widget is not smoothed or delayed"
          frameStyle={styles.largeFrame}
        >
          <AttitudeCommandWidget
            backdropSrc={JEEP_PREVIEW.attitudeImageSrc}
            backdropSource={JEEP_PREVIEW.attitudeImageSource}
            pitchDeg={simulatedTelemetry.pitchDeg}
            rollDeg={simulatedTelemetry.rollDeg}
            activeVehicleName={JEEP_PREVIEW.label}
          />
        </PreviewPanel>

        <PreviewPanel title="Clamp Check" subtitle="Values exceed +/-15; needles clamp while readouts show values" frameStyle={styles.largeFrame}>
          <AttitudeCommandWidget
            backdropSrc={RAM_PREVIEW.attitudeImageSrc}
            backdropSource={RAM_PREVIEW.attitudeImageSource}
            pitchDeg={22}
            rollDeg={-22}
            activeVehicleName={RAM_PREVIEW.label}
          />
        </PreviewPanel>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Responsive Orientation Frames</Text>
        <Text style={styles.sectionMeta}>Use these to verify no distortion, skewing, or portrait overflow.</Text>
      </View>

      <View style={styles.previewGrid}>
        <ResponsiveFrame title="Desktop Landscape" style={styles.desktopLandscape} />
        <ResponsiveFrame title="Tablet Landscape" style={styles.tabletLandscape} />
        <ResponsiveFrame title="Phone Portrait" style={styles.phonePortrait} />
        <ResponsiveFrame title="Phone Landscape" style={styles.phoneLandscape} />
      </View>
    </ScrollView>
  );
}

function PreviewPanel({
  title,
  subtitle,
  frameStyle,
  accessory,
  children,
}: {
  title: string;
  subtitle: string;
  frameStyle: object;
  accessory?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.previewPanel}>
      <View style={styles.panelHeader}>
        <View style={styles.panelTextBlock}>
          <Text style={styles.panelTitle}>{title}</Text>
          <Text style={styles.panelSubtitle}>{subtitle}</Text>
        </View>
        {accessory}
      </View>
      <View style={[styles.frame, frameStyle]}>
        {children}
      </View>
    </View>
  );
}

function ResponsiveFrame({
  title,
  style,
}: {
  title: string;
  style: object;
}) {
  return (
    <PreviewPanel title={title} subtitle="Responsive fit test" frameStyle={style}>
      <AttitudeCommandWidget
        backdropSrc={JEEP_PREVIEW.attitudeImageSrc}
        backdropSource={JEEP_PREVIEW.attitudeImageSource}
        pitchDeg={6.4}
        rollDeg={-3.2}
        activeVehicleName={JEEP_PREVIEW.label}
      />
    </PreviewPanel>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#080B0F',
  },
  content: {
    gap: 18,
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
  sectionHeader: {
    gap: 3,
    paddingTop: 4,
  },
  sectionTitle: {
    color: TACTICAL.text,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  sectionMeta: {
    color: TACTICAL.textMuted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  previewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    alignItems: 'flex-start',
  },
  previewPanel: {
    gap: 8,
  },
  panelHeader: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  panelTextBlock: {
    flexShrink: 1,
    gap: 2,
  },
  panelTitle: {
    color: TACTICAL.text,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  panelSubtitle: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
  },
  switchButton: {
    minHeight: 30,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(249, 194, 84, 0.42)',
    backgroundColor: 'rgba(249, 194, 84, 0.08)',
  },
  switchButtonText: {
    color: TACTICAL.amber,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  frame: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(249, 194, 84, 0.2)',
    backgroundColor: 'rgba(5,8,12,0.72)',
  },
  largeFrame: {
    width: 480,
    height: 360,
  },
  desktopLandscape: {
    width: 960,
    height: 720,
  },
  tabletLandscape: {
    width: 760,
    height: 570,
  },
  phonePortrait: {
    width: 360,
    height: 640,
  },
  phoneLandscape: {
    width: 640,
    height: 360,
  },
});
