import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ECSInstrumentPanel } from '../WidgetChrome';
import { GOLD_RAIL, TACTICAL, TYPO } from '../../../lib/theme';
import type {
  CommandCenterFrameProps,
  CommandCenterState,
} from './commandCenterTypes';
import CommandCenterModeSelector from './CommandCenterModeSelector';

const STATE_ACCENT: Record<CommandCenterState, string> = {
  live: '#49D17A',
  checkIn: '#5AC8FA',
  planned: TACTICAL.amber,
  estimated: '#5AC8FA',
  partial: TACTICAL.amber,
  offline: TACTICAL.textMuted,
  setupNeeded: TACTICAL.amber,
};

const STATE_LABEL: Record<CommandCenterState, string> = {
  live: 'Live',
  checkIn: 'Check-In',
  planned: 'Planned',
  estimated: 'Estimated',
  partial: 'Partial',
  offline: 'Offline',
  setupNeeded: 'Setup Needed',
};

export function CommandCenterFrame({
  title,
  subtitle,
  state,
  stateLabel,
  mode,
  availableModes,
  onModeChange,
  modeSelector,
  children,
  footer,
  testID,
}: CommandCenterFrameProps) {
  const accentColor = STATE_ACCENT[state];
  const resolvedStateLabel = stateLabel ?? STATE_LABEL[state];
  const canSelectModes = Boolean(mode && availableModes?.length && onModeChange);
  const renderedModeSelector =
    modeSelector ??
    (canSelectModes ? (
      <CommandCenterModeSelector
        mode={mode!}
        availableModes={availableModes!}
        onModeChange={onModeChange!}
        compact
        testID={testID ? `${testID}-mode-selector` : undefined}
      />
    ) : null);

  return (
    <ECSInstrumentPanel
      variant="command"
      sizeVariant="dominant"
      glowIntensity={state === 'live' ? 'high' : state === 'offline' ? 'low' : 'medium'}
      active={state === 'live'}
      showActiveEdge={false}
      innerTexture={false}
      style={styles.frame}
      contentStyle={styles.content}
    >
      <View pointerEvents="none" style={styles.topoLayer}>
        <View style={[styles.topoLine, styles.topoLineA]} />
        <View style={[styles.topoLine, styles.topoLineB]} />
        <View style={[styles.topoLine, styles.topoLineC]} />
      </View>
      <View pointerEvents="none" style={styles.innerStroke} />

      <View style={styles.header} testID={testID ? `${testID}-header` : undefined}>
        <View style={styles.titleCluster}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View
          style={[
            styles.statePill,
            {
              borderColor: `${accentColor}55`,
              backgroundColor: state === 'offline' ? 'rgba(18,22,27,0.74)' : `${accentColor}18`,
            },
          ]}
          testID={testID ? `${testID}-state-pill` : undefined}
        >
          <View style={[styles.stateDot, { backgroundColor: accentColor }]} />
          <Text style={[styles.stateText, { color: accentColor }]} numberOfLines={1}>
            {resolvedStateLabel}
          </Text>
        </View>
      </View>

      {renderedModeSelector ? <View style={styles.selectorSlot}>{renderedModeSelector}</View> : null}

      <View style={styles.body} testID={testID ? `${testID}-body` : undefined}>
        {children}
      </View>

      {footer ? (
        <View style={styles.footer} testID={testID ? `${testID}-footer` : undefined}>
          {footer}
        </View>
      ) : null}
    </ECSInstrumentPanel>
  );
}

export default CommandCenterFrame;

const styles = StyleSheet.create({
  frame: {
    flex: 1,
    minHeight: 0,
    borderRadius: 14,
    borderColor: 'rgba(222, 174, 73, 0.72)',
    backgroundColor: 'rgba(4, 7, 10, 0.94)',
    shadowColor: '#D6A13A',
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  content: {
    flex: 1,
    minHeight: 0,
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  topoLayer: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.5,
  },
  topoLine: {
    position: 'absolute',
    height: 1,
    borderRadius: 999,
    backgroundColor: 'rgba(212, 160, 23, 0.12)',
  },
  topoLineA: {
    top: 30,
    left: -30,
    width: 260,
    transform: [{ rotate: '-7deg' }],
  },
  topoLineB: {
    top: '48%',
    right: -44,
    width: 330,
    transform: [{ rotate: '6deg' }],
  },
  topoLineC: {
    bottom: 38,
    left: 20,
    width: 300,
    transform: [{ rotate: '-4deg' }],
  },
  innerStroke: {
    position: 'absolute',
    top: 4,
    right: 4,
    bottom: 4,
    left: 4,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(241, 199, 103, 0.13)',
  },
  header: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    zIndex: 2,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: GOLD_RAIL.instrumentHeader,
  },
  titleCluster: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  title: {
    color: TACTICAL.amber,
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '900',
    letterSpacing: 1.6,
    includeFontPadding: false,
    textTransform: 'uppercase',
  },
  subtitle: {
    color: 'rgba(230, 237, 243, 0.66)',
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    includeFontPadding: false,
  },
  statePill: {
    minHeight: 24,
    maxWidth: 150,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  stateDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
  },
  stateText: {
    ...TYPO.U2,
    fontSize: 9,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  selectorSlot: {
    zIndex: 2,
  },
  body: {
    flex: 1,
    minHeight: 0,
    zIndex: 2,
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(212, 160, 23, 0.24)',
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  footer: {
    minHeight: 28,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(212, 160, 23, 0.14)',
    backgroundColor: 'rgba(255,255,255,0.035)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
});
