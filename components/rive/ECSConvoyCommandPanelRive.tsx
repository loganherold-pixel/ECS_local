'use client';

import React, { useMemo, useState } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Alignment, Fit, Layout, useRive } from '@rive-app/react-webgl2';

import { TACTICAL } from '../../lib/theme';

export type ECSConvoyCommandPanelRiveProps = {
  reducedMotion?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const CONVOY_COMMAND_PANEL_ARTBOARD = 'dashboard_no_exterior_border';
const PUBLIC_RIVE_SRC = '/rive/ConvoyCommand_Panel.riv';
const riveCanvasStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'block',
};

// Keep the panel asset in Metro's graph for web builds.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const CONVOY_COMMAND_PANEL_ASSET = require('../../assets/rive/ConvoyCommand_Panel.riv');

function getBundledRiveSrc(): string {
  const resolved = Image.resolveAssetSource(CONVOY_COMMAND_PANEL_ASSET);
  return typeof resolved?.uri === 'string' && resolved.uri.trim()
    ? resolved.uri
    : PUBLIC_RIVE_SRC;
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

export default function ECSConvoyCommandPanelRive({
  reducedMotion,
  style,
  testID,
}: ECSConvoyCommandPanelRiveProps) {
  const layout = useMemo(
    () => new Layout({
      fit: Fit.Contain,
      alignment: Alignment.Center,
    }),
    [],
  );
  const riveSrc = useMemo(() => getBundledRiveSrc(), []);
  const [loadFailed, setLoadFailed] = useState(false);
  const { RiveComponent } = useRive({
    src: riveSrc,
    artboard: CONVOY_COMMAND_PANEL_ARTBOARD,
    autoplay: reducedMotion !== true,
    layout,
    onLoadError: () => setLoadFailed(true),
  });

  if (loadFailed) {
    return <ConvoyCommandPanelFallback style={style} testID={testID} />;
  }

  return (
    <View testID={testID} pointerEvents="none" style={[styles.riveWrap, style]}>
      <RiveComponent style={riveCanvasStyle} />
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
