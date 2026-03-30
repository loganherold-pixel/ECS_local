/**
 * EmergencyProtocolModal — Full-screen slide-up detail panel
 *
 * Displays protocol content in airplane safety card format:
 * - Realistic illustration image (top) — protocol-specific
 * - RECOGNIZE section (bullets)
 * - STABILIZE section (numbered steps)
 * - EVACUATE IF section (bullets)
 *
 * Features:
 * - Full-screen slide-up animation
 * - ScrollView ensures all content is visible
 * - Swipe-down to close via PanResponder
 * - Faint topo watermark background (3% opacity)
 * - Clean flat aesthetic
 * - All icons use TacticalGlyphs (no Ionicons / no medical symbols)
 *
 * V3: Replaced tactical schematic illustrations with realistic
 *     generated images via protocol.modalImage field.
 */
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  PanResponder,
  ScrollView,
  Platform,
} from 'react-native';
import ECSModal from '../ECSModal';
import { TACTICAL } from '../../lib/theme';

import type { EmergencyProtocol } from './EmergencyData';
import { getTacticalGlyph } from './TacticalGlyphs';
import { getProtocolIllustration } from './EmergencyIllustrations';

interface Props {
  visible: boolean;
  protocol: EmergencyProtocol | null;
  onClose: () => void;
}

const SCREEN_H = Dimensions.get('window').height;

// ── Tactical Warning Glyph (replaces Ionicons warning-outline) ──
function WarningGlyph({ color, size }: { color: string; size: number }) {
  const stroke = Math.max(1.2, (2 / 14) * size);
  return (
    <View style={{ width: size, height: size, position: 'relative' }}>
      {/* Top-left arm (45°) */}
      <View style={{
        position: 'absolute',
        top: 0,
        left: size * 0.15,
        width: size * 0.38,
        height: stroke,
        backgroundColor: color,
        transform: [{ rotate: '45deg' }],
        transformOrigin: 'left center',
      }} />
      {/* Top-right arm (45°) */}
      <View style={{
        position: 'absolute',
        top: 0,
        right: size * 0.15,
        width: size * 0.38,
        height: stroke,
        backgroundColor: color,
        transform: [{ rotate: '-45deg' }],
        transformOrigin: 'right center',
      }} />
      {/* Bottom bar */}
      <View style={{
        position: 'absolute',
        bottom: size * 0.1,
        left: size * 0.1,
        width: size * 0.8,
        height: stroke,
        backgroundColor: color,
      }} />
      {/* Center dot */}
      <View style={{
        position: 'absolute',
        top: size * 0.45,
        left: size / 2 - stroke * 0.7,
        width: stroke * 1.4,
        height: stroke * 1.4,
        backgroundColor: color,
      }} />
    </View>
  );
}

// ── Close Glyph (X made of 45° lines) ──
function CloseGlyph({ color, size }: { color: string; size: number }) {
  const stroke = Math.max(1.5, (2.5 / 20) * size);
  return (
    <View style={{ width: size, height: size, position: 'relative' }}>
      <View style={{
        position: 'absolute',
        top: size / 2 - stroke / 2,
        left: size * 0.15,
        width: size * 0.7,
        height: stroke,
        backgroundColor: color,
        transform: [{ rotate: '45deg' }],
      }} />
      <View style={{
        position: 'absolute',
        top: size / 2 - stroke / 2,
        left: size * 0.15,
        width: size * 0.7,
        height: stroke,
        backgroundColor: color,
        transform: [{ rotate: '-45deg' }],
      }} />
    </View>
  );
}

export default function EmergencyProtocolModal({ visible, protocol, onClose }: Props) {
  const slideAnim = useRef(new Animated.Value(SCREEN_H)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 10 && Math.abs(gs.dy) > Math.abs(gs.dx),
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) {
          slideAnim.setValue(gs.dy);
        }
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 80 || gs.vy > 0.5) {
          handleClose();
        } else {
          Animated.spring(slideAnim, {
            toValue: 0,
            friction: 10,
            tension: 80,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    if (visible && protocol) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, friction: 10, tension: 60, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, protocol]);

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: SCREEN_H, duration: 250, useNativeDriver: true }),
    ]).start(() => {
      onClose();
    });
  };

  if (!protocol) return null;

  const hasModalImage = !!protocol.modalImage;

  return (
    <ECSModal visible={visible} onClose={handleClose} tier="safety">

      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={handleClose} activeOpacity={1} />
      </Animated.View>

      {/* Panel — now nearly full-screen */}
      <Animated.View
        style={[styles.panel, { transform: [{ translateY: slideAnim }] }]}
        {...panResponder.panHandlers}
      >
        {/* Topo watermark background */}
        <View style={styles.topoWatermark}>
          {Array.from({ length: 8 }, (_, i) => (
            <View
              key={i}
              style={[
                styles.topoLine,
                {
                  width: 160 + i * 40,
                  height: 160 + i * 40,
                  borderRadius: 80 + i * 20,
                  top: -30 + i * 8,
                  right: -60 + i * 10,
                },
              ]}
            />
          ))}
        </View>

        {/* Drag Handle */}
        <View style={styles.dragHandle}>
          <View style={styles.dragBar} />
        </View>

        {/* Header — fixed at top */}
        <View style={styles.header}>
          <View style={[styles.headerIcon, { backgroundColor: `${protocol.accentColor}15` }]}>
            {getTacticalGlyph(protocol.id, protocol.accentColor, 22)}
          </View>
          <View style={styles.headerText}>
            <Text style={[styles.headerTitle, { color: protocol.accentColor }]}>{protocol.title}</Text>
            <Text style={styles.headerSubtitle}>{protocol.subtitle}</Text>
          </View>
          <TouchableOpacity style={styles.closeBtn} onPress={handleClose} activeOpacity={0.7}>
            <CloseGlyph color={TACTICAL.textMuted} size={16} />
          </TouchableOpacity>
        </View>

        {/* Scrollable Content — ensures all sections are visible */}
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={true}
          indicatorStyle="white"
          bounces={true}
        >
          {/* Illustration — realistic image or fallback to tactical schematic */}
          {hasModalImage ? (
            <View style={styles.modalImageContainer}>
              <Image
                source={{ uri: protocol.modalImage }}
                style={styles.modalImage}
                resizeMode="cover"
              />
              {/* Accent-tinted gradient overlay at bottom for smooth blend */}
              <View style={[styles.modalImageOverlayBottom, { backgroundColor: TACTICAL.bg }]} />
              {/* Subtle accent color tint overlay */}
              <View style={[styles.modalImageTint, { backgroundColor: protocol.accentColor }]} />
              {/* Vignette edges */}
              <View style={styles.modalImageVignetteLeft} />
              <View style={styles.modalImageVignetteRight} />
            </View>
          ) : (
            <View style={styles.illustrationContainer}>
              {getProtocolIllustration(protocol.id, protocol.accentColor, 90)}
            </View>
          )}

          {/* RECOGNIZE */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionDot, { backgroundColor: protocol.accentColor }]} />
              <Text style={[styles.sectionTitle, { color: protocol.accentColor }]}>RECOGNIZE</Text>
            </View>
            {protocol.recognize.map((item, i) => (
              <View key={i} style={styles.bulletRow}>
                <View style={[styles.bullet, { backgroundColor: protocol.accentColor, opacity: 0.6 }]} />
                <Text style={styles.bulletText}>{item}</Text>
              </View>
            ))}
          </View>

          {/* STABILIZE */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionDot, { backgroundColor: protocol.accentColor }]} />
              <Text style={[styles.sectionTitle, { color: protocol.accentColor }]}>STABILIZE</Text>
            </View>
            {protocol.stabilize.map((step, i) => (
              <View key={i} style={styles.stepRow}>
                <View style={[styles.stepNumber, { borderColor: `${protocol.accentColor}60` }]}>
                  <Text style={[styles.stepNumberText, { color: protocol.accentColor }]}>{i + 1}</Text>
                </View>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </View>

          {/* EVACUATE IF */}
          <View style={[styles.section, styles.evacuateSection]}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionDot, { backgroundColor: TACTICAL.danger }]} />
              <Text style={[styles.sectionTitle, { color: TACTICAL.danger }]}>EVACUATE IF</Text>
            </View>
            {protocol.evacuateIf.map((item, i) => (
              <View key={i} style={styles.evacuateRow}>
                <WarningGlyph color={TACTICAL.danger} size={11} />
                <Text style={styles.evacuateText}>{item}</Text>
              </View>
            ))}
          </View>

          {/* Bottom spacing to ensure content clears safe area */}
          <View style={{ height: 30 }} />
        </ScrollView>
      </Animated.View>
    </ECSModal>
  );
}


const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  panel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: TACTICAL.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    // Full-screen height minus a small top margin for the status bar area
    maxHeight: SCREEN_H * 0.95,
    // Use flex to allow ScrollView to expand
    height: SCREEN_H * 0.92,
    overflow: 'hidden',
  },

  // Topo watermark
  topoWatermark: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  topoLine: {
    position: 'absolute',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.03)',
  },

  // Drag handle
  dragHandle: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  dragBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },

  // Header — stays fixed at top of panel
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  headerIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1,
  },
  headerSubtitle: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    marginTop: 1,
    letterSpacing: 0.3,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Scrollable content area
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Platform.OS === 'web' ? 40 : 60,
  },

  // ── Realistic Modal Image ─────────────────────────────────
  modalImageContainer: {
    width: '100%',
    height: 200,
    marginBottom: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  modalImage: {
    width: '100%',
    height: '100%',
  },
  // Bottom fade overlay — blends image into dark background
  modalImageOverlayBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
    opacity: 0.85,
  },
  // Subtle accent color tint — adds protocol-specific color wash
  modalImageTint: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.08,
  },
  // Left vignette edge
  modalImageVignetteLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: 30,
    backgroundColor: 'rgba(11, 15, 18, 0.5)',
  },
  // Right vignette edge
  modalImageVignetteRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 30,
    backgroundColor: 'rgba(11, 15, 18, 0.5)',
  },

  // ── Fallback Tactical Illustration ────────────────────────
  illustrationContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    marginBottom: 6,
  },

  // Sections
  section: {
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  sectionDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
  },

  // Bullets (RECOGNIZE)
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
    paddingLeft: 11,
  },
  bullet: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  bulletText: {
    fontSize: 13,
    color: TACTICAL.text,
    fontWeight: '500',
    letterSpacing: 0.2,
    flex: 1,
  },

  // Steps (STABILIZE)
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 5,
    paddingLeft: 6,
  },
  stepNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    fontSize: 10,
    fontWeight: '900',
  },
  stepText: {
    fontSize: 13,
    color: TACTICAL.text,
    fontWeight: '500',
    flex: 1,
    letterSpacing: 0.2,
  },

  // Evacuate
  evacuateSection: {
    marginBottom: 0,
    backgroundColor: 'rgba(192,57,43,0.05)',
    borderRadius: 10,
    padding: 12,
    marginHorizontal: 20,
    borderWidth: 1,
    borderColor: 'rgba(192,57,43,0.12)',
  },
  evacuateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
    paddingLeft: 6,
  },
  evacuateText: {
    fontSize: 13,
    color: TACTICAL.text,
    fontWeight: '600',
    letterSpacing: 0.2,
    flex: 1,
  },
});



