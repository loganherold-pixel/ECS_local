import React from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import TacticalPopupShell from '../TacticalPopupShell';
import { TACTICAL } from '../../lib/theme';

import type { EmergencyProtocol } from './EmergencyData';
import { getTacticalGlyph } from './TacticalGlyphs';

interface Props {
  visible: boolean;
  protocol: EmergencyProtocol | null;
  onClose: () => void;
}

function WarningGlyph({ color, size }: { color: string; size: number }) {
  const stroke = Math.max(1.2, (2 / 14) * size);
  return (
    <View style={{ width: size, height: size, position: 'relative' }}>
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: size * 0.15,
          width: size * 0.38,
          height: stroke,
          backgroundColor: color,
          transform: [{ rotate: '45deg' }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: 0,
          right: size * 0.15,
          width: size * 0.38,
          height: stroke,
          backgroundColor: color,
          transform: [{ rotate: '-45deg' }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: size * 0.1,
          left: size * 0.1,
          width: size * 0.8,
          height: stroke,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: size * 0.45,
          left: size / 2 - stroke * 0.7,
          width: stroke * 1.4,
          height: stroke * 1.4,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

export default function EmergencyProtocolModal({ visible, protocol, onClose }: Props) {
  if (!protocol) return null;

  return (
    <TacticalPopupShell
      visible={visible}
      onClose={onClose}
      tier="safety"
      stackBehavior="replace"
      title={protocol.title}
      icon="medkit-outline"
      eyebrow="FIELD PROTOCOL"
      subtitle={protocol.subtitle}
      maxWidth={620}
      maxHeightFraction={0.82}
      scrollable
      overlayClass="info"
      dismissOnBackdrop
      allowSwipeDismiss={false}
      showHandle={false}
      bodyStyle={styles.shellBody}
    >
      <View style={styles.protocolBody}>
        <View
          style={[
            styles.protocolGlyphWrap,
            {
              borderColor: `${protocol.accentColor}30`,
              backgroundColor: `${protocol.accentColor}10`,
            },
          ]}
        >
          {getTacticalGlyph(protocol.id, protocol.accentColor, 20)}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionDot, { backgroundColor: protocol.accentColor }]} />
            <Text style={[styles.sectionTitle, { color: protocol.accentColor }]}>RECOGNIZE</Text>
          </View>
          {protocol.recognize.map((item, index) => (
            <View key={`recognize-${index}`} style={styles.bulletRow}>
              <View
                style={[
                  styles.bullet,
                  { backgroundColor: protocol.accentColor, opacity: 0.6 },
                ]}
              />
              <Text style={styles.bulletText}>{item}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionDot, { backgroundColor: protocol.accentColor }]} />
            <Text style={[styles.sectionTitle, { color: protocol.accentColor }]}>STABILIZE</Text>
          </View>
          {protocol.stabilize.map((step, index) => (
            <View key={`step-${index}`} style={styles.stepRow}>
              <View style={[styles.stepNumber, { borderColor: `${protocol.accentColor}60` }]}>
                <Text style={[styles.stepNumberText, { color: protocol.accentColor }]}>
                  {index + 1}
                </Text>
              </View>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.section, styles.evacuateSection]}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionDot, { backgroundColor: TACTICAL.danger }]} />
            <Text style={[styles.sectionTitle, { color: TACTICAL.danger }]}>EVACUATE IF</Text>
          </View>
          {protocol.evacuateIf.map((item, index) => (
            <View key={`evacuate-${index}`} style={styles.evacuateRow}>
              <WarningGlyph color={TACTICAL.danger} size={11} />
            <Text style={styles.evacuateText}>{item}</Text>
          </View>
        ))}
        </View>
      </View>
    </TacticalPopupShell>
  );
}

const styles = StyleSheet.create({
  shellBody: {
    gap: 8,
  },
  protocolGlyphWrap: {
    alignSelf: 'flex-start',
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    backgroundColor: 'rgba(196,138,44,0.08)',
  },
  protocolBody: {
    gap: 7,
  },
  section: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  evacuateSection: {
    borderColor: 'rgba(192,57,43,0.24)',
    backgroundColor: 'rgba(192,57,43,0.06)',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 5,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.3,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 3,
  },
  bullet: {
    width: 5,
    height: 5,
    borderRadius: 999,
    marginTop: 7,
  },
  bulletText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 13,
    color: TACTICAL.text,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 3,
  },
  stepNumber: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  stepNumberText: {
    fontSize: 9,
    fontWeight: '800',
  },
  stepText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 13,
    color: TACTICAL.text,
    paddingTop: 1,
  },
  evacuateRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 3,
  },
  evacuateText: {
    flex: 1,
    fontSize: 9.5,
    lineHeight: 12,
    color: TACTICAL.text,
  },
});
