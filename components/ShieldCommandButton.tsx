/**
 * ShieldCommandButton
 *
 * Brand identity element — singular, immutable.
 * ─────────────────────────────────────────────
 * DESIGN DISCIPLINE:
 *   • Never resize it.
 *   • Never hide it.
 *   • Never change its shape.
 *   • Never duplicate it elsewhere.
 *   • It must be singular.
 * ─────────────────────────────────────────────
 * Single tap  → return to Dashboard
 * Long press  → open Profile Switcher
 */
import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  TouchableWithoutFeedback,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import ProfileSwitcher from './ProfileSwitcher';

// ── Fixed dimensions (brand identity — never change) ────────
const SHIELD_W = 56;
const SHIELD_BODY_H = 42;
const SHIELD_POINT_H = 22;
const SHIELD_TOTAL_H = SHIELD_BODY_H + SHIELD_POINT_H;

// ── Metal palette (matte, no gloss, no neon) ────────────────
const METAL = {
  outer: '#1E2328',       // dark rim
  outerHighlight: '#3A3F45', // top-edge highlight
  body: '#2A2F35',        // main body
  bodyLight: '#353A40',   // upper body lighter
  innerBevel: '#3E444A',  // inner edge highlight
  innerShadow: '#1A1E22', // inner edge shadow
  emboss: '#4A5058',      // embossed detail highlight
  mountain: '#3E444A',    // mountain silhouette
  mountainSnow: '#5A6068', // mountain snow caps
  monogram: '#5A6068',    // ECS text
};

export default function ShieldCommandButton() {
  const router = useRouter();
  const pathname = usePathname();
  const [switcherVisible, setSwitcherVisible] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  // ── ALL hooks MUST be called before any conditional return ──
  const animatePress = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.92,
      friction: 8,
      tension: 200,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  const animateRelease = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 5,
      tension: 150,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  const handlePressIn = useCallback(() => {
    longPressTriggered.current = false;
    animatePress();
    pressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      animateRelease();
      setSwitcherVisible(true);
    }, 500);
  }, [animatePress, animateRelease]);

  const handlePressOut = useCallback(() => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    animateRelease();

    if (!longPressTriggered.current) {
      // Single tap → navigate to Dashboard
      router.push('/dashboard');
    }
  }, [router, animateRelease]);

  // Don't render on login/auth screens — but hooks are already called above
  const isAuthScreen = pathname === '/login' || pathname === '/create-access-key' || pathname === '/' || pathname === '/initialize';
  if (isAuthScreen) return null;

  return (
    <>
      {/* Profile Switcher Overlay */}
      <ProfileSwitcher
        visible={switcherVisible}
        onClose={() => setSwitcherVisible(false)}
      />

      {/* Shield Button — always visible, always centered bottom */}
      <View style={styles.container} pointerEvents="box-none">
        <TouchableWithoutFeedback
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
        >
          <Animated.View
            style={[
              styles.shieldWrapper,
              { transform: [{ scale: scaleAnim }] },
            ]}
          >
            {/* ── Outer Shadow Layer ─────────────────────── */}
            <View style={styles.outerShadow}>
              {/* ── Shield Body (top rounded rect) ───────── */}
              <View style={styles.shieldBody}>
                {/* Top highlight edge */}
                <View style={styles.topHighlight} />

                {/* Inner bevel effect */}
                <View style={styles.innerBevel}>
                  {/* Mountain Silhouette */}
                  <View style={styles.mountainContainer}>
                    {/* Left peak */}
                    <View style={styles.mountainGroup}>
                      <View style={[styles.mountainPeak, styles.peakLeft]} />
                      <View style={[styles.mountainSnow, styles.snowLeft]} />
                    </View>
                    {/* Center peak (tallest) */}
                    <View style={styles.mountainGroup}>
                      <View style={[styles.mountainPeak, styles.peakCenter]} />
                      <View style={[styles.mountainSnow, styles.snowCenter]} />
                    </View>
                    {/* Right peak */}
                    <View style={styles.mountainGroup}>
                      <View style={[styles.mountainPeak, styles.peakRight]} />
                      <View style={[styles.mountainSnow, styles.snowRight]} />
                    </View>
                  </View>

                  {/* ECS Monogram — subtle */}
                  <View style={styles.monogramContainer}>
                    <View style={styles.monogramLine} />
                  </View>
                </View>
              </View>

              {/* ── Shield Point (bottom triangle) ───────── */}
              <View style={styles.shieldPointContainer}>
                <View style={styles.shieldPoint} />
                {/* Inner point (slightly lighter for bevel) */}
                <View style={styles.shieldPointInner} />
              </View>
            </View>
          </Animated.View>
        </TouchableWithoutFeedback>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: Platform.OS === 'web' ? 12 : 24,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
    elevation: 9999,
  },
  shieldWrapper: {
    width: SHIELD_W,
    height: SHIELD_TOTAL_H,
    alignItems: 'center',
  },

  // ── Outer shadow for dimensional depth ────────────────────
  outerShadow: {
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 12,
  },

  // ── Shield Body (top section) ─────────────────────────────
  shieldBody: {
    width: SHIELD_W,
    height: SHIELD_BODY_H,
    backgroundColor: METAL.body,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderWidth: 1.5,
    borderBottomWidth: 0,
    borderColor: METAL.outerHighlight,
    overflow: 'hidden',
  },

  // ── Top highlight (embossed rim) ──────────────────────────
  topHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: METAL.emboss,
    opacity: 0.4,
  },

  // ── Inner bevel ───────────────────────────────────────────
  innerBevel: {
    flex: 1,
    margin: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderTopColor: METAL.innerBevel,
    borderLeftColor: METAL.innerBevel,
    borderBottomColor: METAL.innerShadow,
    borderRightColor: METAL.innerShadow,
    backgroundColor: METAL.body,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  // ── Mountain Silhouette ───────────────────────────────────
  mountainContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    height: 22,
    gap: 0,
    marginTop: 2,
  },
  mountainGroup: {
    alignItems: 'center',
    position: 'relative',
  },

  // Mountain peaks (triangles via border trick)
  mountainPeak: {
    width: 0,
    height: 0,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: METAL.mountain,
  },
  peakLeft: {
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderBottomWidth: 12,
    marginRight: -2,
  },
  peakCenter: {
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderBottomWidth: 18,
  },
  peakRight: {
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 10,
    marginLeft: -2,
  },

  // Snow caps (smaller triangles)
  mountainSnow: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: METAL.mountainSnow,
  },
  snowLeft: {
    top: 0,
    borderLeftWidth: 3,
    borderRightWidth: 3,
    borderBottomWidth: 5,
  },
  snowCenter: {
    top: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderBottomWidth: 7,
  },
  snowRight: {
    top: 0,
    borderLeftWidth: 2.5,
    borderRightWidth: 2.5,
    borderBottomWidth: 4,
  },

  // ── ECS Monogram line ─────────────────────────────────────
  monogramContainer: {
    marginTop: 2,
    alignItems: 'center',
  },
  monogramLine: {
    width: 20,
    height: 1,
    backgroundColor: METAL.monogram,
    opacity: 0.5,
  },

  // ── Shield Point (bottom triangle) ────────────────────────
  shieldPointContainer: {
    alignItems: 'center',
    marginTop: -1, // overlap to prevent gap
  },
  shieldPoint: {
    width: 0,
    height: 0,
    borderLeftWidth: SHIELD_W / 2,
    borderRightWidth: SHIELD_W / 2,
    borderTopWidth: SHIELD_POINT_H,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: METAL.body,
    // Side borders for the rim effect
  },
  shieldPointInner: {
    position: 'absolute',
    top: 1,
    width: 0,
    height: 0,
    borderLeftWidth: (SHIELD_W / 2) - 2,
    borderRightWidth: (SHIELD_W / 2) - 2,
    borderTopWidth: SHIELD_POINT_H - 3,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: METAL.body,
  },
});



