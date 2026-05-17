import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import ECSConvoyCommandRive from '../../../rive/ECSConvoyCommandRive';
import { TACTICAL, TYPO } from '../../../../lib/theme';
import { useReducedMotion } from '../../../../lib/ecsAnimations';
import {
  formatConvoyDistanceMiles,
  selectConvoyCommandWidgetViewModel,
} from '../../../../lib/convoy/convoyCommandSelectors';
import type {
  ConvoyCommandVisualState,
  ConvoyCommandWidgetViewModel,
} from '../../../../lib/convoy/convoyCommandTypes';
import { CommandCenterFrame } from '../../commandCenter/CommandCenterFrame';
import type {
  CommandCenterMode,
  CommandCenterState,
  CommandCenterWidgetComponentProps,
} from '../../commandCenter/commandCenterTypes';
import { useConvoyCommandData } from '../../commandCenter/useConvoyCommandData';

type ConvoyCommandWidgetProps = CommandCenterWidgetComponentProps & {
  onOpenDetail?: () => void;
  onOpenAlertDetail?: () => void;
  onOpenRegroupDetail?: () => void;
};

const FRAME_STATE_BY_VISUAL_STATE: Record<ConvoyCommandVisualState, CommandCenterState> = {
  live: 'live',
  estimated: 'estimated',
  partial: 'partial',
  offline: 'offline',
  alert: 'partial',
};

const STATUS_TONE: Record<ConvoyCommandVisualState, string> = {
  live: TACTICAL.text,
  estimated: TACTICAL.textMuted,
  partial: TACTICAL.amber,
  offline: TACTICAL.textMuted,
  alert: TACTICAL.danger,
};

const DEV_VISUAL_STATES: ConvoyCommandVisualState[] = ['offline', 'estimated', 'partial', 'live', 'alert'];
const DEV_VISUAL_STATE_LABEL: Record<ConvoyCommandVisualState, string> = {
  offline: 'OFF',
  estimated: 'EST',
  partial: 'PART',
  live: 'LIVE',
  alert: 'ALERT',
};
const CONVOY_RIVE_VISUAL_QA_ENABLED =
  typeof __DEV__ !== 'undefined' &&
  __DEV__ &&
  typeof process !== 'undefined' &&
  process.env.EXPO_PUBLIC_ECS_CONVOY_RIVE_QA === '1';

function formatVehicleCount(vehicleCount: number): string {
  const count = safeCount(vehicleCount);
  if (count <= 0) return '0 VEHICLES';
  if (count === 1) return '1 VEHICLE';
  return `${count} VEHICLES`;
}

function noop() {}

function safeCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function safeLostUnitIndex(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(-1, Math.trunc(value)) : -1;
}

function safeCautionLevel(value: unknown): 0 | 1 | 2 {
  if (value === 2) return 2;
  if (value === 1) return 1;
  return 0;
}

function safeText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function safeVisualState(value: unknown): ConvoyCommandVisualState {
  return value === 'live' ||
    value === 'estimated' ||
    value === 'partial' ||
    value === 'offline' ||
    value === 'alert'
    ? value
    : 'offline';
}

function buildDevVisualQaViewModel(visualState: ConvoyCommandVisualState): ConvoyCommandWidgetViewModel {
  const isAlert = visualState === 'alert';
  const isPartial = visualState === 'partial';
  return {
    visualState,
    statusLabel: visualState.toUpperCase() as ConvoyCommandWidgetViewModel['statusLabel'],
    groupName: 'Dev Visual QA',
    vehicleCount: 0,
    reportingCount: 0,
    widestGapMiles: null,
    regroupSuggested: isAlert || isPartial,
    lostUnitIndex: isAlert ? 0 : -1,
    cautionLevel: isAlert ? 2 : isPartial || visualState === 'estimated' ? 1 : 0,
    alertText: isAlert ? 'QA ALERT - no live data' : null,
    members: [],
    isUsingLiveData: false,
    updatedAt: null,
  };
}

type ConvoyRiveErrorBoundaryProps = {
  children: React.ReactNode;
  testID?: string;
};

type ConvoyRiveErrorBoundaryState = {
  hasError: boolean;
};

class ConvoyRiveErrorBoundary extends React.Component<
  ConvoyRiveErrorBoundaryProps,
  ConvoyRiveErrorBoundaryState
> {
  state: ConvoyRiveErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ConvoyRiveErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[ConvoyCommandWidget] Rive layer failed; dashboard fallback remains mounted.', error);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <View
          testID={this.props.testID}
          accessibilityRole="image"
          accessibilityLabel="Convoy Command visual fallback"
          style={styles.riveErrorFallback}
        >
          <View style={styles.riveErrorFallbackRail} />
        </View>
      );
    }

    return this.props.children;
  }
}

export default function ConvoyCommandWidget({
  testID = 'convoy-command-widget',
  onOpenDetail,
  onOpenAlertDetail,
}: ConvoyCommandWidgetProps) {
  const commandData = useConvoyCommandData();
  const reducedMotion = useReducedMotion();
  const [devVisualState, setDevVisualState] = useState<ConvoyCommandVisualState>('offline');
  const selectedViewModel = useMemo(
    () => selectConvoyCommandWidgetViewModel({ commandData }),
    [commandData],
  );
  const isDevVisualQa = CONVOY_RIVE_VISUAL_QA_ENABLED;
  const viewModel = useMemo(
    () => (isDevVisualQa ? buildDevVisualQaViewModel(devVisualState) : selectedViewModel),
    [devVisualState, isDevVisualQa, selectedViewModel],
  );
  const visualState = safeVisualState(viewModel?.visualState);
  const statusLabel = safeText(viewModel?.statusLabel, 'OFFLINE');
  const groupName = safeText(viewModel?.groupName, 'Convoy Status Unavailable');
  const vehicleCount = safeCount(viewModel?.vehicleCount);
  const alertText = safeText(viewModel?.alertText, '');
  const lostUnitIndex = safeLostUnitIndex(viewModel?.lostUnitIndex);
  const cautionLevel = safeCautionLevel(viewModel?.cautionLevel);
  const isUsingLiveData = viewModel?.isUsingLiveData === true;
  const hasRouteTarget = Boolean(commandData?.activeRouteId);
  const widestGapLabel = formatConvoyDistanceMiles(viewModel?.widestGapMiles) ?? '--';
  const statusColor = STATUS_TONE[visualState] ?? TACTICAL.textMuted;
  const frameState = FRAME_STATE_BY_VISUAL_STATE[visualState] ?? 'offline';
  const setupText =
    isDevVisualQa
      ? 'DEV VISUAL QA ONLY - no live convoy data.'
      : vehicleCount > 0
      ? 'Convoy plan available. Live telemetry is not active.'
      : 'Create or join a convoy to enable group position awareness.';
  const openDetail = useCallback(() => {
    if (!hasRouteTarget) return;
    (onOpenDetail ?? noop)();
  }, [hasRouteTarget, onOpenDetail]);

  const openAlertDetail = useCallback(() => {
    if (!hasRouteTarget || !alertText) return;
    (onOpenAlertDetail ?? noop)();
  }, [alertText, hasRouteTarget, onOpenAlertDetail]);

  return (
    <CommandCenterFrame
      title="Convoy Command"
      subtitle={isDevVisualQa ? 'Dev visual QA - no live data' : isUsingLiveData ? 'Live group telemetry' : 'Truthful convoy readiness'}
      state={frameState}
      stateLabel={statusLabel}
      showStateBadge={false}
      bodyChrome={false}
      testID={testID}
    >
      <View style={styles.surface}>
        <ConvoyRiveErrorBoundary testID={`${testID}-rive-fallback`}>
          <ECSConvoyCommandRive
            visualState={visualState}
            lostUnitIndex={lostUnitIndex}
            cautionLevel={cautionLevel}
            convoyActive={vehicleCount > 0}
            reducedMotion={reducedMotion}
            style={styles.riveLayer}
            testID={`${testID}-rive`}
          />
        </ConvoyRiveErrorBoundary>
        <View pointerEvents="none" style={styles.readabilityScrim} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open Convoy Command detail"
          disabled={!hasRouteTarget}
          onPress={openDetail}
          style={({ pressed }) => [styles.mainPressZone, pressed && styles.pressFeedback]}
        />

        <View pointerEvents="box-none" style={styles.overlay}>
          <View pointerEvents="none" style={styles.topRow}>
            <View style={styles.identityStack}>
              <Text style={styles.groupName} numberOfLines={1}>
                {groupName}
              </Text>
              <Text style={styles.sourceLine} numberOfLines={isDevVisualQa ? 2 : 1}>
                {isUsingLiveData ? 'Live ECS convoy signal' : setupText}
              </Text>
            </View>
            <View style={[styles.statusPill, { borderColor: `${statusColor}66` }]}>
              <Text style={[styles.statusPillText, { color: statusColor }]} numberOfLines={1}>
                {statusLabel}
              </Text>
            </View>
          </View>

          <View pointerEvents="none" style={[styles.metricBlock, styles.vehicleMetricBlock]}>
            <Text style={styles.metricLabel}>VEHICLES</Text>
            <Text
              style={styles.metricValue}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.72}
            >
              {formatVehicleCount(vehicleCount)}
            </Text>
          </View>
          <View pointerEvents="none" style={[styles.metricBlock, styles.gapMetricBlock]}>
            <Text style={styles.metricLabel}>WIDEST GAP</Text>
            <Text
              style={styles.metricValue}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.72}
            >
              {widestGapLabel}
            </Text>
          </View>

          {isDevVisualQa ? (
            <View style={styles.devQaStrip}>
              {DEV_VISUAL_STATES.map((state) => {
                const active = state === visualState;
                return (
                  <Pressable
                    key={state}
                    accessibilityRole="button"
                    accessibilityLabel={`Force Convoy Command ${state} visual state for development QA`}
                    onPress={() => setDevVisualState(state)}
                    style={({ pressed }) => [
                      styles.devQaButton,
                      active && styles.devQaButtonActive,
                      pressed && styles.pressFeedback,
                    ]}
                  >
                    <Text
                      style={[styles.devQaButtonText, active && styles.devQaButtonTextActive]}
                      numberOfLines={1}
                    >
                      {DEV_VISUAL_STATE_LABEL[state]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {alertText ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open convoy signal alert detail"
              disabled={!hasRouteTarget}
              onPress={openAlertDetail}
              style={({ pressed }) => [styles.alertStrip, pressed && styles.pressFeedback]}
            >
              <Text
                style={styles.alertText}
                numberOfLines={2}
                ellipsizeMode="tail"
                adjustsFontSizeToFit
                minimumFontScale={0.78}
              >
                {alertText}
              </Text>
            </Pressable>
          ) : (
            <View pointerEvents="none" style={styles.quietStrip}>
              <Text style={styles.quietStripText} numberOfLines={1}>
                {vehicleCount > 0 ? 'No signal alert' : 'Setup needed'}
              </Text>
            </View>
          )}
        </View>
      </View>
    </CommandCenterFrame>
  );
}

const styles = StyleSheet.create({
  surface: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
    minHeight: 178,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: 'rgba(3, 6, 8, 0.34)',
  },
  riveLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  riveErrorFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5, 8, 10, 0.72)',
  },
  riveErrorFallbackRail: {
    width: '62%',
    height: 2,
    borderRadius: 2,
    backgroundColor: TACTICAL.amber,
    opacity: 0.34,
  },
  readabilityScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
  },
  mainPressZone: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  pressFeedback: {
    opacity: 0.82,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3,
  },
  topRow: {
    position: 'absolute',
    top: '10.6%',
    left: '11.5%',
    right: '3.85%',
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  identityStack: {
    minWidth: 0,
    width: '39%',
    gap: 3,
  },
  groupName: {
    ...TYPO.T3,
    color: TACTICAL.text,
    marginTop: 6,
    fontSize: 14,
    lineHeight: 17,
    letterSpacing: 0.5,
  },
  sourceLine: {
    ...TYPO.B2,
    color: TACTICAL.textMuted,
    marginTop: 5,
    fontSize: 6.1,
    lineHeight: 7.2,
  },
  statusPill: {
    marginTop: 9,
    minHeight: 36,
    minWidth: 126,
    maxWidth: 170,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: 'rgba(7, 10, 13, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  statusPillText: {
    ...TYPO.U2,
    fontSize: 8.5,
    letterSpacing: 1,
  },
  metricBlock: {
    position: 'absolute',
    minHeight: 42,
    justifyContent: 'flex-start',
    gap: 5,
    paddingHorizontal: 0,
  },
  vehicleMetricBlock: {
    left: '4.3%',
    bottom: '11.86%',
    width: '18.2%',
  },
  gapMetricBlock: {
    left: '40.5%',
    bottom: '10.55%',
    width: '18.5%',
    alignItems: 'center',
  },
  metricLabel: {
    ...TYPO.U2,
    color: TACTICAL.textMuted,
    fontSize: 7.5,
    letterSpacing: 1.1,
  },
  metricValue: {
    color: TACTICAL.text,
    fontSize: 11.4,
    lineHeight: 13,
    fontWeight: '900',
    letterSpacing: 0.45,
  },
  alertStrip: {
    position: 'absolute',
    left: '74.08%',
    right: '2.77%',
    bottom: '10.8%',
    minHeight: 62,
    maxHeight: 76,
    justifyContent: 'center',
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(239, 83, 80, 0.42)',
    backgroundColor: 'rgba(88, 18, 14, 0.70)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  alertText: {
    color: '#FFD7CF',
    flexShrink: 1,
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  quietStrip: {
    position: 'absolute',
    left: '72.55%',
    right: '3.55%',
    bottom: '10.8%',
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.12)',
    backgroundColor: 'rgba(0,0,0,0.18)',
    paddingHorizontal: 10,
  },
  quietStripText: {
    ...TYPO.U2,
    color: TACTICAL.textMuted,
    fontSize: 8,
    letterSpacing: 0.85,
  },
  devQaStrip: {
    position: 'absolute',
    left: '3.1%',
    right: '3.1%',
    top: '21.22%',
    minHeight: 23,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  devQaButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.18)',
    backgroundColor: 'rgba(0,0,0,0.18)',
    paddingHorizontal: 4,
  },
  devQaButtonActive: {
    borderColor: 'rgba(212,160,23,0.62)',
    backgroundColor: 'rgba(212,160,23,0.18)',
  },
  devQaButtonText: {
    ...TYPO.U2,
    color: TACTICAL.textMuted,
    fontSize: 6.8,
    letterSpacing: 0.55,
  },
  devQaButtonTextActive: {
    color: TACTICAL.amber,
  },
  footerText: {
    ...TYPO.U2,
    color: TACTICAL.textMuted,
    fontSize: 8,
    letterSpacing: 0.9,
    flexShrink: 1,
  },
  footerRegroup: {
    minHeight: 22,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.14)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  footerRegroupActive: {
    borderColor: 'rgba(212,160,23,0.42)',
    backgroundColor: 'rgba(212,160,23,0.12)',
  },
  footerRegroupText: {
    ...TYPO.U2,
    color: TACTICAL.textMuted,
    fontSize: 7.5,
    letterSpacing: 0.8,
  },
  footerRegroupTextActive: {
    color: TACTICAL.amber,
  },
});
