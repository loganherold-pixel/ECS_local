import React, { useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ImageSourcePropType,
} from 'react-native';

import { TACTICAL } from '../../../lib/theme';
import {
  DEFAULT_TIRE_PRESSURE_THRESHOLDS,
  TIRE_PRESSURE_POSITIONS,
  loadTirePressureThresholds,
  saveTirePressureThreshold,
  type TirePressurePosition,
  type TirePressureThresholds,
} from '../../../lib/tirePressureThresholdStore';
import type { VehicleTelemetrySnapshot } from '../../types/telemetry';

const TIRE_PRESSURE_DRIVELINE_IMAGE = require('../../../assets/attitude/overlays/vehicle_psi_driveline_suspension_transparent.png');
const TIRE_PRESSURE_DRIVELINE_ASPECT_RATIO = 1448 / 1086;

export type TirePressureValues = Record<TirePressurePosition, number | null>;

export type TirePressureDisplayState = {
  pressures: TirePressureValues;
  updatedAt: string | null;
  isPreview?: boolean;
};

type StageSize = {
  width: number;
  height: number;
};

type TirePressureDrivelineOverlayProps = {
  pressureState: TirePressureDisplayState;
  stageSize?: StageSize | null;
  diagramSource?: ImageSourcePropType | null;
};

const TIRE_LABELS: Record<TirePressurePosition, string> = {
  frontLeft: 'Front driver',
  frontRight: 'Front passenger',
  rearLeft: 'Rear driver',
  rearRight: 'Rear passenger',
};

function finitePressure(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function formatPsi(value: number | null): string {
  return value == null ? '--' : `${Math.round(value)}`;
}

function getPsiPositionStyle(position: TirePressurePosition) {
  switch (position) {
    case 'frontLeft':
      return styles.frontLeftPsi;
    case 'frontRight':
      return styles.frontRightPsi;
    case 'rearLeft':
      return styles.rearLeftPsi;
    case 'rearRight':
      return styles.rearRightPsi;
    default:
      return styles.frontLeftPsi;
  }
}

function pressureTone(
  value: number | null,
  position: TirePressurePosition,
  thresholds: TirePressureThresholds,
): string {
  if (value == null) return TACTICAL.textMuted;
  return value < thresholds[position] ? '#EF5350' : TACTICAL.amber;
}

function pressureArrayToValues(
  pressures: VehicleTelemetrySnapshot['tirePressuresPsi'],
): TirePressureValues | null {
  if (!Array.isArray(pressures)) return null;
  const values: TirePressureValues = {
    frontLeft: finitePressure(pressures[0]),
    frontRight: finitePressure(pressures[1]),
    rearLeft: finitePressure(pressures[2]),
    rearRight: finitePressure(pressures[3]),
  };
  return TIRE_PRESSURE_POSITIONS.some((position) => values[position] != null) ? values : null;
}

export function resolveLiveTirePressureDisplayState(
  snapshot: VehicleTelemetrySnapshot,
): TirePressureDisplayState | null {
  if (!snapshot.isLive || snapshot.freshness !== 'live') return null;
  const pressures = pressureArrayToValues(snapshot.tirePressuresPsi ?? null);
  if (!pressures) return null;
  return {
    pressures,
    updatedAt: snapshot.updatedAt ?? null,
  };
}

function TirePressureDrivelineFallback() {
  return (
    <View style={styles.fallbackDiagram} pointerEvents="none">
      <View style={[styles.fallbackTire, styles.fallbackFrontLeft]} />
      <View style={[styles.fallbackTire, styles.fallbackFrontRight]} />
      <View style={[styles.fallbackTire, styles.fallbackRearLeft]} />
      <View style={[styles.fallbackTire, styles.fallbackRearRight]} />
      <View style={styles.fallbackCenterLine} />
      <View style={styles.fallbackFrontAxle} />
      <View style={styles.fallbackRearAxle} />
      <View style={styles.fallbackTransferCase} />
    </View>
  );
}

function TirePressureDrivelineOverlay({
  pressureState,
  stageSize,
  diagramSource,
}: TirePressureDrivelineOverlayProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [thresholds, setThresholds] = useState<TirePressureThresholds>(() => loadTirePressureThresholds());
  const [thresholdInputs, setThresholdInputs] = useState<Record<TirePressurePosition, string>>(() => ({
    frontLeft: String(loadTirePressureThresholds().frontLeft),
    frontRight: String(loadTirePressureThresholds().frontRight),
    rearLeft: String(loadTirePressureThresholds().rearLeft),
    rearRight: String(loadTirePressureThresholds().rearRight),
  }));

  const measuredStage = stageSize && stageSize.width > 0 && stageSize.height > 0 ? stageSize : null;
  const diagramWidth = measuredStage ? Math.max(54, Math.min(measuredStage.width * 0.18, 96)) : 0;
  const diagramHeight = diagramWidth * TIRE_PRESSURE_DRIVELINE_ASPECT_RATIO;
  const diagramLeft = measuredStage ? (measuredStage.width - diagramWidth) / 2 : 0;
  const diagramTop = measuredStage
    ? Math.max(44, Math.min(measuredStage.height * 0.26, measuredStage.height - diagramHeight - 18))
    : 0;
  const panelHorizontal = measuredStage ? Math.max(8, measuredStage.width * 0.07) : 0;
  const panelTop = measuredStage ? Math.max(8, Math.min(measuredStage.height - 142, diagramTop + diagramHeight + 8)) : 0;

  const accessibleSummary = useMemo(
    () =>
      TIRE_PRESSURE_POSITIONS
        .map((position) => `${TIRE_LABELS[position]} ${formatPsi(pressureState.pressures[position])} PSI`)
        .join(', '),
    [pressureState.pressures],
  );
  const resolvedDiagramSource = diagramSource === null ? null : diagramSource ?? TIRE_PRESSURE_DRIVELINE_IMAGE;

  const updateThreshold = (position: TirePressurePosition, value: string) => {
    setThresholdInputs((current) => ({ ...current, [position]: value }));
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    const next = saveTirePressureThreshold(position, numeric);
    setThresholds(next);
  };

  return (
    <View pointerEvents="box-none" style={styles.overlay} testID="attitude-command-tire-pressure-overlay">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open tire pressure monitor. ${accessibleSummary}.`}
        onPress={() => setPanelOpen((current) => !current)}
        style={({ pressed }) => [
          styles.diagramButton,
          measuredStage
            ? {
              left: diagramLeft,
              top: diagramTop,
              width: diagramWidth,
              height: diagramHeight,
            }
            : styles.diagramButtonResponsive,
          pressed ? styles.diagramButtonPressed : null,
        ]}
        testID="attitude-command-tire-pressure-button"
      >
        {resolvedDiagramSource ? (
          <Image
            source={resolvedDiagramSource}
            resizeMode="contain"
            fadeDuration={0}
            style={styles.diagramImage}
            accessible={false}
          />
        ) : (
          <TirePressureDrivelineFallback />
        )}
        {pressureState.isPreview ? (
          <View style={styles.previewBadge}>
            <Text style={styles.previewBadgeText}>TEST</Text>
          </View>
        ) : null}
        {TIRE_PRESSURE_POSITIONS.map((position) => (
          <Text
            key={position}
            style={[
              styles.psiValue,
              getPsiPositionStyle(position),
              { color: pressureTone(pressureState.pressures[position], position, thresholds) },
            ]}
            numberOfLines={1}
            testID={`attitude-command-tire-pressure-${position}`}
          >
            {formatPsi(pressureState.pressures[position])}
          </Text>
        ))}
      </Pressable>

      {panelOpen ? (
        <View
          style={[
            styles.detailPanel,
            measuredStage
              ? {
                left: panelHorizontal,
                right: panelHorizontal,
                top: panelTop,
              }
              : styles.detailPanelResponsive,
          ]}
          testID="attitude-command-tire-pressure-panel"
        >
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>{pressureState.isPreview ? 'TPMS Preview' : 'TPMS Pressure'}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close tire pressure monitor"
              onPress={() => setPanelOpen(false)}
              style={styles.panelCloseButton}
              testID="attitude-command-tire-pressure-close"
            >
              <Text style={styles.panelCloseText}>Close</Text>
            </Pressable>
          </View>
          <View style={styles.tireRows}>
            {TIRE_PRESSURE_POSITIONS.map((position) => (
              <View key={position} style={styles.tireRow}>
                <Text style={styles.tireRowLabel}>{TIRE_LABELS[position]}</Text>
                <Text
                  style={[
                    styles.tireRowValue,
                    { color: pressureTone(pressureState.pressures[position], position, thresholds) },
                  ]}
                >
                  {formatPsi(pressureState.pressures[position])} PSI
                </Text>
                <TextInput
                  value={thresholdInputs[position]}
                  onChangeText={(value) => updateThreshold(position, value)}
                  keyboardType="numeric"
                  selectTextOnFocus
                  accessibilityLabel={`${TIRE_LABELS[position]} low PSI threshold`}
                  style={styles.thresholdInput}
                  testID={`attitude-command-tire-pressure-threshold-${position}`}
                />
              </View>
            ))}
          </View>
          <Text style={styles.panelFootnote} numberOfLines={2}>
            Low threshold is per tire, so aired-down trail pressure can be marked nominal when intentional.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export default React.memo(TirePressureDrivelineOverlay);

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 8,
  },
  diagramButton: {
    position: 'absolute',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diagramButtonResponsive: {
    left: '41%',
    top: '24%',
    width: '18%',
    aspectRatio: 1086 / 1448,
  },
  diagramButtonPressed: {
    opacity: 0.82,
  },
  diagramImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  fallbackDiagram: {
    ...StyleSheet.absoluteFillObject,
  },
  fallbackTire: {
    position: 'absolute',
    width: '27%',
    height: '20%',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(249, 194, 84, 0.45)',
    backgroundColor: 'rgba(3, 8, 10, 0.72)',
  },
  fallbackFrontLeft: { top: '7%', left: '3%' },
  fallbackFrontRight: { top: '7%', right: '3%' },
  fallbackRearLeft: { bottom: '7%', left: '3%' },
  fallbackRearRight: { bottom: '7%', right: '3%' },
  fallbackCenterLine: {
    position: 'absolute',
    left: '49%',
    top: '18%',
    width: 1,
    height: '64%',
    backgroundColor: 'rgba(249, 194, 84, 0.36)',
  },
  fallbackFrontAxle: {
    position: 'absolute',
    left: '15%',
    right: '15%',
    top: '17%',
    height: 1,
    backgroundColor: 'rgba(249, 194, 84, 0.32)',
  },
  fallbackRearAxle: {
    position: 'absolute',
    left: '15%',
    right: '15%',
    bottom: '17%',
    height: 1,
    backgroundColor: 'rgba(249, 194, 84, 0.32)',
  },
  fallbackTransferCase: {
    position: 'absolute',
    left: '42%',
    top: '42%',
    width: '16%',
    height: '16%',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(249, 194, 84, 0.38)',
    backgroundColor: 'rgba(249, 194, 84, 0.09)',
  },
  psiValue: {
    position: 'absolute',
    minWidth: 18,
    textAlign: 'center',
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '900',
    textShadowColor: 'rgba(0, 0, 0, 0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  frontLeftPsi: { top: '20%', left: '7%' },
  frontRightPsi: { top: '20%', right: '7%' },
  rearLeftPsi: { top: '80%', left: '7%' },
  rearRightPsi: { top: '80%', right: '7%' },
  previewBadge: {
    position: 'absolute',
    left: '32%',
    right: '32%',
    top: '42%',
    minHeight: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '38',
    backgroundColor: 'rgba(3, 8, 10, 0.78)',
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewBadgeText: {
    color: TACTICAL.textMuted,
    fontSize: 6,
    lineHeight: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  detailPanel: {
    position: 'absolute',
    minHeight: 126,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '42',
    backgroundColor: 'rgba(3, 8, 10, 0.94)',
    padding: 8,
    gap: 6,
  },
  detailPanelResponsive: {
    left: '7%',
    right: '7%',
    bottom: '5%',
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  panelTitle: {
    color: TACTICAL.amber,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  panelCloseButton: {
    minHeight: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '32',
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelCloseText: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  tireRows: {
    gap: 4,
  },
  tireRow: {
    minHeight: 26,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tireRowLabel: {
    flex: 1,
    minWidth: 0,
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  tireRowValue: {
    width: 50,
    color: TACTICAL.amber,
    fontSize: 9,
    fontWeight: '900',
    textAlign: 'right',
  },
  thresholdInput: {
    width: 42,
    minHeight: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '24',
    backgroundColor: 'rgba(255,255,255,0.05)',
    color: TACTICAL.text,
    fontSize: 9,
    fontWeight: '900',
    textAlign: 'center',
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  panelFootnote: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '700',
  },
});
