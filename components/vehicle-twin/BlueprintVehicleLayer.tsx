/**
 * BlueprintVehicleLayer — ECS Vehicle Twin Base Image Layer (V12 — 25% Enlargement)
 * ──────────────────────────────────────────────────────────────
 * Renders the ECS vehicle as the primary visual anchor behind all
 * container selection overlays.
 *
 * V12 ENLARGEMENT CHANGES (25% larger than V11):
 *   - tiltLayer uses negative insets (-28.125%) instead of transform: scale
 *   - This makes the tiltLayer 156.25% of the container (1.25 × 1.25)
 *   - Image fills 100% of the enlarged tiltLayer at native resolution
 *   - No transform: scale on the image — avoids conflicts with tilt rotations
 *   - The gold wireframe's transparent margins absorb overflow; the visible
 *     truck body stays within or very near the canvas panel border
 *   - BlueprintCanvas V12 sets overflow: 'visible' as a safety net
 *
 * V10 TRUCK ANCHOR (preserved):
 *   - Image opacity at 0.50 for strong presence
 *   - No dark background behind the truck — fully transparent
 *   - Truck is the true visual anchor; containers sit ON the truck
 *   - Weight-based tilt animation, offline caching, imbalance overlays
 *
 * Layer 0 in the Vehicle Twin rendering stack:
 *   Layer 0  →  vehicle silhouette (this component) — TILT LAYER
 *   Layer 1  →  blueprint grid overlay (subtle)
 *   Layer 5  →  smart container zones (clickable overlays, NO tilt)
 *   Layer 10 →  center of gravity indicators
 */


import React, { useRef, useEffect, useState } from 'react';
import { View, Image, StyleSheet, Text, Animated, Dimensions } from 'react-native';
import { useCachedBlueprintImage } from '../../lib/blueprintImageCache';

/* ═══════════════════════════════════════════════════════════════
   Vehicle Blueprint Map — ECS gold wireframe top-down truck
   ═══════════════════════════════════════════════════════════════ */
export type VehicleType = 'truck' | 'suv' | 'van';

export const vehicleBlueprintMap: Record<VehicleType, string> = {
  truck: 'https://d64gsuwffb70l.cloudfront.net/696e98bf1e58953c5b50217c_1772728419742_a4ef6f30.png',
  suv:   'https://d64gsuwffb70l.cloudfront.net/696e98bf1e58953c5b50217c_1772728419742_a4ef6f30.png',
  van:   'https://d64gsuwffb70l.cloudfront.net/696e98bf1e58953c5b50217c_1772728419742_a4ef6f30.png',
};

/* ═══════════════════════════════════════════════════════════════
   Imbalance Flags (shared interface)
   ═══════════════════════════════════════════════════════════════ */
export interface ImbalanceFlags {
  leftHeavy: boolean;
  rightHeavy: boolean;
  roofOverloaded: boolean;
  rearHeavy: boolean;
}

/* ── Tilt animation constants ──────────────────────────── */
const TILT_ANIM_MS = 420;

/* ── Responsive ────────────────────────────────────────── */
const { width: SCREEN_W } = Dimensions.get('window');
const IS_SMALL = SCREEN_W < 380;

/* ═══════════════════════════════════════════════════════════════
   Fallback SVG Silhouette (inline, no external dependency)
   ═══════════════════════════════════════════════════════════════
   Renders a minimal clean top-down truck outline when the CDN
   image fails to load. Uses simple View-based shapes.
   ═══════════════════════════════════════════════════════════════ */
function FallbackSilhouette() {
  const GOLD_FAINT = 'rgba(212,160,23,0.12)';
  const GOLD_STROKE = 'rgba(212,160,23,0.20)';
  const BG = 'transparent';

  return (
    <View style={fb.container}>
      {/* Front bumper */}
      <View style={[fb.bumper, { borderColor: GOLD_STROKE, backgroundColor: BG }]} />

      {/* Hood + Cab (narrower) */}
      <View style={[fb.cab, { borderColor: GOLD_STROKE, backgroundColor: BG }]}>
        {/* Windshield line */}
        <View style={[fb.windshield, { backgroundColor: GOLD_FAINT }]} />
      </View>

      {/* Fender flare transition */}
      <View style={[fb.fenderTransition, { backgroundColor: GOLD_FAINT }]} />

      {/* Bed (wider) */}
      <View style={[fb.bed, { borderColor: GOLD_STROKE, backgroundColor: BG }]}>
        {/* Bed floor lines */}
        <View style={[fb.bedLine, { backgroundColor: GOLD_FAINT, top: '33%' }]} />
        <View style={[fb.bedLine, { backgroundColor: GOLD_FAINT, top: '66%' }]} />
      </View>

      {/* Rear bumper */}
      <View style={[fb.bumper, { borderColor: GOLD_STROKE, backgroundColor: BG }]} />

      {/* Wheels */}
      <View style={[fb.wheel, fb.wheelFL, { borderColor: GOLD_STROKE, backgroundColor: BG }]} />
      <View style={[fb.wheel, fb.wheelFR, { borderColor: GOLD_STROKE, backgroundColor: BG }]} />
      <View style={[fb.wheel, fb.wheelRL, { borderColor: GOLD_STROKE, backgroundColor: BG }]} />
      <View style={[fb.wheel, fb.wheelRR, { borderColor: GOLD_STROKE, backgroundColor: BG }]} />

      {/* Fallback label */}
      <View style={fb.labelWrap}>
        <Text style={fb.label}>VEHICLE SILHOUETTE</Text>
      </View>
    </View>
  );
}

const fb = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: '8%',
    paddingHorizontal: '15%',
  },
  bumper: {
    width: '55%',
    height: '2%',
    borderWidth: 0.5,
    borderRadius: 2,
  },
  cab: {
    width: '55%',
    height: '35%',
    borderWidth: 0.5,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderBottomWidth: 0,
    justifyContent: 'flex-start',
    paddingTop: '8%',
  },
  windshield: {
    width: '80%',
    height: 2,
    alignSelf: 'center',
    borderRadius: 1,
  },
  fenderTransition: {
    width: '60%',
    height: 2,
    borderRadius: 1,
  },
  bed: {
    width: '70%',
    height: '40%',
    borderWidth: 0.5,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    borderTopWidth: 0,
    position: 'relative',
  },
  bedLine: {
    position: 'absolute',
    left: '10%',
    right: '10%',
    height: 0.5,
  },
  wheel: {
    position: 'absolute',
    width: '5%',
    height: '8%',
    borderWidth: 0.5,
    borderRadius: 3,
  },
  wheelFL: { top: '22%', left: '8%' },
  wheelFR: { top: '22%', right: '8%' },
  wheelRL: { top: '62%', left: '5%' },
  wheelRR: { top: '62%', right: '5%' },
  labelWrap: {
    position: 'absolute',
    bottom: '4%',
    alignSelf: 'center',
  },
  label: {
    fontSize: 6,
    fontWeight: '700',
    letterSpacing: 2,
    color: 'rgba(212,160,23,0.15)',
    textAlign: 'center',
  },
});

/* ═══════════════════════════════════════════════════════════════
   Props
   ═══════════════════════════════════════════════════════════════ */
interface Props {
  vehicleType?: VehicleType;
  imbalance?: ImbalanceFlags;
  /** Weight-based roll tilt in degrees (max ±3°). Negative = left. */
  weightRollDeg?: number;
  /** Weight-based pitch tilt in degrees (max ±2°). Negative = front. */
  weightPitchDeg?: number;
  /** @deprecated — no longer needed, image auto-centers */
  containerWidth?: number;
  /** @deprecated — no longer needed, image auto-centers */
  containerHeight?: number;
}

/* ═══════════════════════════════════════════════════════════════
   BlueprintVehicleLayer (main export)
   ═══════════════════════════════════════════════════════════════ */
export default function BlueprintVehicleLayer({
  vehicleType = 'truck',
  imbalance,
  weightRollDeg = 0,
  weightPitchDeg = 0,
}: Props) {
  const ib = imbalance ?? {
    leftHeavy: false,
    rightHeavy: false,
    roofOverloaded: false,
    rearHeavy: false,
  };

  const networkUrl = vehicleBlueprintMap[vehicleType] ?? vehicleBlueprintMap.truck;

  /* ── Use cached image (offline-first, lazy loading) ────── */
  const { uri: imageUri, status } = useCachedBlueprintImage(networkUrl);

  /* ── Image load failure tracking ─────────────────────────── */
  const [imageLoadFailed, setImageLoadFailed] = useState(false);

  /* ── Animated tilt values ────────────────────────────────── */
  const animRoll = useRef(new Animated.Value(weightRollDeg)).current;
  const animPitch = useRef(new Animated.Value(weightPitchDeg)).current;

  useEffect(() => {
    // Native-driven: roll + pitch (transform properties)
    Animated.parallel([
      Animated.timing(animRoll, {
        toValue: weightRollDeg,
        duration: TILT_ANIM_MS,
        useNativeDriver: true,
      }),
      Animated.timing(animPitch, {
        toValue: weightPitchDeg,
        duration: TILT_ANIM_MS,
        useNativeDriver: true,
      }),
    ]).start();
  }, [weightRollDeg, weightPitchDeg, animPitch, animRoll]);

  /* ── Build animated transform for the tilt layer ─────────── */
  const tiltTransform = {
    transform: [
      { perspective: 800 },
      {
        rotateX: animPitch.interpolate({
          inputRange: [-2, 2],
          outputRange: ['-2deg', '2deg'],
          extrapolate: 'clamp',
        }),
      },
      {
        rotateZ: animRoll.interpolate({
          inputRange: [-3, 3],
          outputRange: ['-3deg', '3deg'],
          extrapolate: 'clamp',
        }),
      },
    ],
  };

  /* ── Determine if we should show fallback ────────────────── */
  const showFallback = imageLoadFailed || status === 'error';

  return (
    <View style={st.container} pointerEvents="none">
      {/* ── Layer 0: Vehicle Silhouette — TILT LAYER ─────── */}
      {/* V10: Image fills the full container for proper zone alignment */}
      <Animated.View style={[st.tiltLayer, tiltTransform]}>
        {showFallback ? (
          <FallbackSilhouette />
        ) : (
          <Image
            source={{ uri: imageUri }}
            style={st.vehicleImage}
            resizeMode="contain"
            onError={() => setImageLoadFailed(true)}
          />
        )}
      </Animated.View>

      {/* ── Download indicator (subtle, only during initial cache) ── */}
      {status === 'downloading' && !showFallback && (
        <View style={st.downloadIndicator}>
          <Text style={st.downloadText}>CACHING...</Text>
        </View>
      )}

      {/* ── Imbalance overlays (V10: subtle edge accents only) ──── */}
      {ib.leftHeavy && <View style={st.leftHeavyLine} />}
      {ib.rightHeavy && <View style={st.rightHeavyLine} />}
      {ib.rearHeavy && <View style={st.rearHeavyLine} />}
      {ib.roofOverloaded && <View style={st.roofOverloadLine} />}
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Styles — V12 Truck Anchor: 25% Enlargement over V11
   ═══════════════════════════════════════════════════════════════ */
const TRUCK_SCALE = 1.5625; // 1.25 * 1.25 = 25% larger than V11's 1.25

const st = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 0,
    /* V11+: overflow visible so the enlarged truck is not clipped */
    overflow: 'visible',
  },
  /* V12: tiltLayer uses negative insets to give the image room to
     render at 156.25% of the container without transform: scale.
     The layer is 25% larger than the V11 size (which was already
     125% of the container), so total = 1.25 × 1.25 = 1.5625.
     Centered via symmetric negative offsets of 28.125%. */
  tiltLayer: {
    position: 'absolute',
    top: '-28.125%',
    left: '-28.125%',
    right: '-28.125%',
    bottom: '-28.125%',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* V12: Image fills the enlarged tiltLayer at 100%. The effective
     rendered size is 125% of the container (tiltLayer is 125% of
     container). No transform: scale needed — the enlargement comes
     from the tiltLayer sizing, which avoids interaction with the
     tilt rotation transforms and keeps the image crisp. */
  vehicleImage: {
    width: '100%',
    height: '100%',
    opacity: 0.50,
  },


  downloadIndicator: {
    position: 'absolute',
    bottom: 8, right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(11,14,18,0.75)',
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: 'rgba(212,160,23,0.15)',
    zIndex: 10,
  },
  downloadText: {
    fontSize: 7, fontWeight: '700',
    letterSpacing: 1.5,
    color: 'rgba(212,160,23,0.4)',
  },
  leftHeavyLine: {
    position: 'absolute', top: '30%', left: '8%',
    width: 2, height: '40%',
    backgroundColor: 'rgba(212,144,26,0.18)', borderRadius: 1, zIndex: 2,
  },
  rightHeavyLine: {
    position: 'absolute', top: '30%', right: '8%',
    width: 2, height: '40%',
    backgroundColor: 'rgba(212,144,26,0.18)', borderRadius: 1, zIndex: 2,
  },
  rearHeavyLine: {
    position: 'absolute', bottom: '5%', left: '15%', right: '15%',
    height: 2,
    backgroundColor: 'rgba(212,144,26,0.18)', borderRadius: 1, zIndex: 2,
  },
  roofOverloadLine: {
    position: 'absolute', top: '12%', left: '20%', right: '20%',
    height: 2,
    backgroundColor: 'rgba(212,144,26,0.18)', borderRadius: 1, zIndex: 2,
  },
});



