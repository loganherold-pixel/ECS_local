/**
 * EmergencyGrid — 2×3 stabilization widget grid (No-Scroll)
 *
 * Height-adaptive: fills available vertical space using flex.
 * Cards scale to fit without scrolling.
 *
 * Updated: Shield badge illustrations replace TacticalGlyphs.
 * Title text removed (embedded in badge images).
 * Subtle contrast/saturation reduction for tactical UI integration.
 * Icon fills ~60-65% of card height, centered.
 *
 * V2: Fixed mixed Animated driver conflict — split scaleAnim (native)
 *     and pulseAnim (JS) into separate Animated.View layers.
 */
import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';

import { TACTICAL } from '../../lib/theme';
import { EMERGENCY_PROTOCOLS, type EmergencyProtocol } from './EmergencyData';
import { getTacticalGlyph } from './TacticalGlyphs';
import EmergencyProtocolModal from './EmergencyProtocolModal';

const GRID_PAD = 12;
const GRID_GAP = 10;


// ── Emergency Card ───────────────────────────────────────
function EmergencyCard({
  protocol,
  onPress,
}: {
  protocol: EmergencyProtocol;
  onPress: (p: EmergencyProtocol) => void;
}) {
  // SPLIT: scaleAnim for native-driven transform (scale)
  //        pulseAnim for JS-driven color/shadow interpolation
  // These MUST NOT be on the same Animated.View — mixing native and
  // JS drivers on a single view causes a React Native render crash.
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Track active pulse animation for clean interruption
  const pulseAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  const handlePress = useCallback(() => {
    // Stop any in-flight pulse animation before starting new one
    if (pulseAnimRef.current) {
      pulseAnimRef.current.stop();
      pulseAnimRef.current = null;
    }

    // JS-driven pulse animation (borderColor, shadowOpacity) — separate view
    const pulseSequence = Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1, duration: 150, useNativeDriver: false }),
      Animated.timing(pulseAnim, { toValue: 0, duration: 350, useNativeDriver: false }),
    ]);
    pulseAnimRef.current = pulseSequence;
    pulseSequence.start(() => { pulseAnimRef.current = null; });

    // Native-driven scale animation (transform) — separate view, runs independently
    Animated.sequence([
      Animated.spring(scaleAnim, { toValue: 0.97, friction: 8, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 6, useNativeDriver: true }),
    ]).start();

    setTimeout(() => onPress(protocol), 120);
  }, [protocol, onPress, pulseAnim, scaleAnim]);

  const borderColor = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [`${protocol.accentColor}30`, `${protocol.accentColor}AA`],
  });

  const glowShadowOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.08, 0.35],
  });

  const [imageFailed, setImageFailed] = useState(false);
  const hasBadge = Boolean(protocol.badgeImage && !imageFailed);

  return (
    // OUTER: Native-driven Animated.View — only transform (scale)
    <Animated.View
      style={[
        styles.cardScaleWrap,
        { transform: [{ scale: scaleAnim }] },
      ]}
    >
      {/* INNER: JS-driven Animated.View — borderColor + shadowOpacity */}
      <Animated.View
        style={[
          styles.cardOuter,
          {
            borderColor: borderColor,
            shadowColor: protocol.accentColor,
            shadowOpacity: glowShadowOpacity,
          },
        ]}
      >
        <TouchableOpacity
          style={styles.cardInner}
          onPress={handlePress}
          activeOpacity={0.8}
        >
          {hasBadge ? (
            <Image
              source={{ uri: protocol.badgeImage }}
              style={styles.cardBackgroundImage}
              resizeMode="cover"
              onError={() => setImageFailed(true)}
            />
          ) : null}
          {hasBadge ? <View style={styles.cardImageScrim} /> : null}

          {/* Subtle accent glow line at top */}
          <View style={[styles.accentLine, { backgroundColor: protocol.accentColor }]} />

          {hasBadge ? (
            <View style={styles.cardImageSpacer} />
          ) : (
            <View style={[styles.iconContainerFallback, { backgroundColor: `${protocol.accentColor}12` }]}>
              {getTacticalGlyph(protocol.id, protocol.accentColor, 28)}
            </View>
          )}

          {/* Subtitle descriptor — NO title (title is in the badge image) */}
          <Text style={styles.cardSubtitle} numberOfLines={2}>
            {protocol.subtitle}
          </Text>

          {/* Bottom indicator */}
          <View style={styles.cardFooter}>
            <View style={[styles.readyDot, { backgroundColor: protocol.accentColor, opacity: 0.6 }]} />
            <Text style={styles.readyText}>TAP FOR PROTOCOL</Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
}

// ── Main Grid ────────────────────────────────────────────
interface EmergencyGridProps {
  onProtocolSelect?: (protocol: EmergencyProtocol) => void;
}

export default function EmergencyGrid({ onProtocolSelect }: EmergencyGridProps = {}) {
  const [selectedProtocol, setSelectedProtocol] = useState<EmergencyProtocol | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const handleCardPress = useCallback((protocol: EmergencyProtocol) => {
    if (onProtocolSelect) {
      onProtocolSelect(protocol);
      return;
    }

    setSelectedProtocol(protocol);
    setModalVisible(true);
  }, [onProtocolSelect]);

  const handleModalClose = useCallback(() => {
    setModalVisible(false);
    setTimeout(() => setSelectedProtocol(null), 300);
  }, []);

  // Split protocols into rows of 2
  const rows: EmergencyProtocol[][] = [];
  for (let i = 0; i < EMERGENCY_PROTOCOLS.length; i += 2) {
    rows.push(EMERGENCY_PROTOCOLS.slice(i, i + 2));
  }

  return (
    <View style={styles.container}>
      {rows.map((row, ri) => (
        <View key={ri} style={styles.row}>
          {row.map((protocol) => (
            <EmergencyCard
              key={protocol.id}
              protocol={protocol}
              onPress={handleCardPress}
            />
          ))}
        </View>
      ))}

      {onProtocolSelect ? null : (
        <EmergencyProtocolModal
          visible={modalVisible}
          protocol={selectedProtocol}
          onClose={handleModalClose}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: GRID_PAD,
    gap: GRID_GAP,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    gap: GRID_GAP,
  },

  // ── Card — Split into scale wrapper + styled card ─────
  // cardScaleWrap: native-driven (transform only, no border/shadow)
  cardScaleWrap: {
    flex: 1,
  },
  // cardOuter: JS-driven (borderColor, shadowOpacity animated by pulseAnim)
  cardOuter: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: TACTICAL.panel,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 4,
  },
  cardInner: {
    flex: 1,
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 8,
    justifyContent: 'flex-end',
    alignItems: 'center',
    position: 'relative',
  },
  accentLine: {
    position: 'absolute',
    top: 0,
    left: 16,
    right: 16,
    height: 2,
    borderRadius: 1,
    opacity: 0.4,
  },

  // ── Protocol Image Background ──────────────────────────
  cardBackgroundImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    opacity: 0.94,
  },
  cardImageScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8, 11, 14, 0.32)',
  },
  cardImageSpacer: {
    flex: 1,
    minHeight: 52,
  },

  // ── Fallback icon (when no badge image) ───────────────
  iconContainerFallback: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },

  // ── Text ──────────────────────────────────────────────
  cardSubtitle: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.78)',
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 14,
    letterSpacing: 0.2,
    paddingHorizontal: 2,
    marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
  },
  readyDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  readyText: {
    fontSize: 8,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1.5,
  },
});



