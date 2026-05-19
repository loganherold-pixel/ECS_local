import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Constants from 'expo-constants';

import { TACTICAL } from '../../lib/theme';

export type ECSConvoyCommandPanelRiveProps = {
  reducedMotion?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const CONVOY_COMMAND_PANEL_ARTBOARD = 'dashboard_no_exterior_border';

// Metro needs a static reference so native builds bundle the Rive binary.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const CONVOY_COMMAND_PANEL_ASSET = require('../../assets/rive/ConvoyCommand_Panel.riv');

type OptionalRiveRuntime = {
  Alignment: { Center: unknown };
  Fit: { Contain: unknown };
  RiveView: React.ComponentType<Record<string, unknown>>;
  useRive: () => {
    riveViewRef: { playIfNeeded?: () => void; pause?: () => Promise<void> } | null;
    setHybridRef: unknown;
  };
  useRiveFile: (input: unknown) => {
    riveFile: unknown;
    error: Error | null;
  };
};

let cachedRiveRuntime: OptionalRiveRuntime | null | undefined;

function getOptionalRiveRuntime(): OptionalRiveRuntime | null {
  if (Constants.appOwnership === 'expo') {
    return null;
  }
  if (cachedRiveRuntime !== undefined) {
    return cachedRiveRuntime;
  }

  try {
    // Keep the native Rive import lazy so Expo Go falls back instead of crashing.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedRiveRuntime = require('@rive-app/react-native') as OptionalRiveRuntime;
  } catch {
    cachedRiveRuntime = null;
  }

  return cachedRiveRuntime;
}

function ConvoyCommandPanelFallback({ style, testID }: ECSConvoyCommandPanelRiveProps) {
  return (
    <View
      testID={testID}
      accessibilityRole="image"
      accessibilityLabel="Convoy Command panel visual unavailable"
      style={[styles.fallback, style]}
    >
      <View style={styles.fallbackGrid} />
      <View style={styles.fallbackRail} />
    </View>
  );
}

export default function ECSConvoyCommandPanelRive(props: ECSConvoyCommandPanelRiveProps) {
  const riveRuntime = useMemo(() => getOptionalRiveRuntime(), []);

  if (!riveRuntime) {
    return <ConvoyCommandPanelFallback {...props} />;
  }

  return <ECSConvoyCommandPanelNativeRuntime {...props} riveRuntime={riveRuntime} />;
}

function ECSConvoyCommandPanelNativeRuntime({
  riveRuntime,
  reducedMotion,
  style,
  testID,
}: ECSConvoyCommandPanelRiveProps & { riveRuntime: OptionalRiveRuntime }) {
  const { Alignment, Fit, RiveView, useRive, useRiveFile } = riveRuntime;
  const [hasRuntimeError, setHasRuntimeError] = useState(false);
  const { riveViewRef, setHybridRef } = useRive();
  const { riveFile, error: riveFileError } = useRiveFile(CONVOY_COMMAND_PANEL_ASSET);
  const shouldAutoplay = reducedMotion !== true;

  useEffect(() => {
    if (riveFileError) {
      setHasRuntimeError(true);
    }
  }, [riveFileError]);

  useEffect(() => {
    if (!riveFile || hasRuntimeError) return;
    if (shouldAutoplay) {
      riveViewRef?.playIfNeeded?.();
    }
  }, [hasRuntimeError, riveFile, riveViewRef, shouldAutoplay]);

  useEffect(() => () => {
    void riveViewRef?.pause?.();
  }, [riveViewRef]);

  if (!riveFile || hasRuntimeError) {
    return <ConvoyCommandPanelFallback style={style} testID={testID} />;
  }

  return (
    <View testID={testID} pointerEvents="none" style={[styles.riveWrap, style]}>
      <RiveView
        file={riveFile}
        hybridRef={setHybridRef}
        artboardName={CONVOY_COMMAND_PANEL_ARTBOARD}
        autoPlay={shouldAutoplay}
        fit={Fit.Contain}
        alignment={Alignment.Center}
        style={styles.riveCanvas}
        onError={() => setHasRuntimeError(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  riveWrap: {
    width: '100%',
    height: '100%',
    minWidth: 260,
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  riveCanvas: {
    width: '100%',
    height: '100%',
    minWidth: 260,
    minHeight: 220,
  },
  fallback: {
    width: '100%',
    height: '100%',
    minWidth: 260,
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.34)',
    backgroundColor: 'rgba(5,8,10,0.72)',
  },
  fallbackGrid: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.12)',
  },
  fallbackRail: {
    width: '66%',
    height: 2,
    borderRadius: 2,
    backgroundColor: TACTICAL.amber,
    opacity: 0.4,
  },
});
