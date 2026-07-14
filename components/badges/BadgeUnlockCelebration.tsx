import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { getExpeditionBadgeArtwork } from '../../assets/expedition-badges';
import { EASING } from '../../lib/motion';
import { ECS, TACTICAL } from '../../lib/theme';
import { safelyFireBadgeUnlockHaptic } from '../../lib/expedition/badgeUnlockEffects';
import {
  getBadgeUnlockPresentationModel,
  type BadgeUnlockPresentationItem,
} from '../../lib/expedition/badgeUnlockPresentation';
import { SafeIcon as Ionicons } from '../SafeIcon';

type BadgeUnlockCelebrationProps = {
  item: BadgeUnlockPresentationItem;
  reduceMotion: boolean;
  onReveal: () => void;
  onDismiss: () => void;
  onViewCatalog: () => void;
};

const PARTICLE_LAYOUT = [
  { x: -88, y: -54, distance: 12, size: 4 },
  { x: 86, y: -48, distance: 14, size: 3 },
  { x: -104, y: 12, distance: 10, size: 3 },
  { x: 102, y: 20, distance: 13, size: 4 },
  { x: -70, y: 78, distance: 12, size: 3 },
  { x: 72, y: 82, distance: 15, size: 3 },
  { x: -16, y: -104, distance: 11, size: 4 },
  { x: 24, y: 106, distance: 14, size: 3 },
] as const;

function formatRecordValue(value: number | null): string {
  if (value == null) return '--';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

async function recommendedTimeout(durationMs: number): Promise<number> {
  const timeoutResolver = (AccessibilityInfo as typeof AccessibilityInfo & {
    getRecommendedTimeoutMillis?: (originalTimeout: number) => Promise<number>;
  }).getRecommendedTimeoutMillis;
  if (typeof timeoutResolver !== 'function') return durationMs;
  try {
    const resolved = await timeoutResolver(durationMs);
    return Number.isFinite(resolved) ? Math.max(durationMs, resolved) : durationMs;
  } catch {
    return durationMs;
  }
}

export default function BadgeUnlockCelebration({
  item,
  reduceMotion,
  onReveal,
  onDismiss,
  onViewCatalog,
}: BadgeUnlockCelebrationProps) {
  const model = useMemo(
    () => getBadgeUnlockPresentationModel(item, reduceMotion),
    [item, reduceMotion],
  );
  const artwork = model?.badgeId ? getExpeditionBadgeArtwork(model.badgeId) : null;
  const [canDismiss, setCanDismiss] = useState(false);
  const revealHandledRef = useRef(false);
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const badgeScale = useRef(new Animated.Value(0.72)).current;
  const badgeTranslateY = useRef(new Animated.Value(20)).current;
  const badgeRotation = useRef(new Animated.Value(-1)).current;
  const ringProgress = useRef(new Animated.Value(0)).current;
  const sweepProgress = useRef(new Animated.Value(0)).current;
  const copyOpacity = useRef(new Animated.Value(0)).current;
  const particleProgress = useRef(new Animated.Value(0)).current;
  const hiddenReveal = useRef(new Animated.Value(model?.isHidden ? 0 : 1)).current;

  useEffect(() => {
    if (!model) return;
    let disposed = false;
    let revealTimer: ReturnType<typeof setTimeout> | null = null;
    let dismissTimer: ReturnType<typeof setTimeout> | null = null;
    revealHandledRef.current = false;
    setCanDismiss(false);

    const animatedValues = [
      backdropOpacity,
      contentOpacity,
      badgeScale,
      badgeTranslateY,
      badgeRotation,
      ringProgress,
      sweepProgress,
      copyOpacity,
      particleProgress,
      hiddenReveal,
    ];
    animatedValues.forEach((value) => value.stopAnimation());
    backdropOpacity.setValue(0);
    contentOpacity.setValue(0);
    badgeScale.setValue(reduceMotion ? 1 : 0.72);
    badgeTranslateY.setValue(reduceMotion ? 0 : 20);
    badgeRotation.setValue(reduceMotion ? 0 : -1);
    ringProgress.setValue(reduceMotion ? 1 : 0);
    sweepProgress.setValue(0);
    copyOpacity.setValue(0);
    particleProgress.setValue(0);
    hiddenReveal.setValue(model.isHidden ? 0 : 1);

    const fadeIn = Animated.timing(backdropOpacity, {
      toValue: 1,
      duration: reduceMotion ? 140 : 220,
      easing: EASING.decelerate,
      useNativeDriver: true,
    });
    const showContent = Animated.timing(contentOpacity, {
      toValue: 1,
      duration: reduceMotion ? 160 : 260,
      easing: EASING.decelerate,
      useNativeDriver: true,
    });
    const showCopy = Animated.sequence([
      Animated.delay(reduceMotion ? 80 : Math.max(120, model.animation.revealAtMs - 180)),
      Animated.timing(copyOpacity, {
        toValue: 1,
        duration: 180,
        easing: EASING.decelerate,
        useNativeDriver: true,
      }),
    ]);

    const animations: Animated.CompositeAnimation[] = [fadeIn, showContent, showCopy];
    if (!reduceMotion && item.kind === 'badge') {
      const settleDuration = item.mode === 'record' ? 220 : item.mode === 'short' ? 280 : 420;
      animations.push(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(badgeScale, {
              toValue: model.animation.scaleOvershoot ? 1.07 : 1,
              duration: settleDuration,
              easing: EASING.decelerate,
              useNativeDriver: true,
            }),
            Animated.timing(badgeTranslateY, {
              toValue: 0,
              duration: settleDuration,
              easing: EASING.decelerate,
              useNativeDriver: true,
            }),
            Animated.timing(badgeRotation, {
              toValue: 0,
              duration: settleDuration,
              easing: EASING.decelerate,
              useNativeDriver: true,
            }),
          ]),
          Animated.timing(badgeScale, {
            toValue: 1,
            duration: model.animation.scaleOvershoot ? 140 : 1,
            easing: EASING.standard,
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(ringProgress, {
          toValue: 1,
          duration: Math.min(560, model.animation.revealAtMs),
          easing: EASING.decelerate,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(Math.max(80, model.animation.revealAtMs - 260)),
          Animated.timing(sweepProgress, {
            toValue: 1,
            duration: 420,
            easing: EASING.standard,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.delay(100),
          Animated.timing(particleProgress, {
            toValue: 1,
            duration: 320,
            easing: EASING.decelerate,
            useNativeDriver: true,
          }),
          Animated.timing(particleProgress, {
            toValue: 0,
            duration: 420,
            easing: EASING.accelerate,
            useNativeDriver: true,
          }),
        ]),
      );
      if (model.isHidden) {
        animations.push(Animated.sequence([
          Animated.delay(Math.max(160, model.animation.revealAtMs - 260)),
          Animated.timing(hiddenReveal, {
            toValue: 1,
            duration: 260,
            easing: EASING.decelerate,
            useNativeDriver: true,
          }),
        ]));
      }
    } else if (model.isHidden) {
      animations.push(Animated.sequence([
        Animated.delay(100),
        Animated.timing(hiddenReveal, {
          toValue: 1,
          duration: 160,
          easing: EASING.standard,
          useNativeDriver: true,
        }),
      ]));
    }
    Animated.parallel(animations).start();

    revealTimer = setTimeout(() => {
      if (disposed || revealHandledRef.current) return;
      revealHandledRef.current = true;
      setCanDismiss(true);
      onReveal();
      if (model.kind === 'badge') {
        AccessibilityInfo.announceForAccessibility(`Badge achieved: ${model.title}`);
        void safelyFireBadgeUnlockHaptic();
      }
    }, model.animation.revealAtMs);

    void recommendedTimeout(model.animation.durationMs).then((timeoutMs) => {
      if (disposed) return;
      dismissTimer = setTimeout(() => {
        if (!disposed) onDismiss();
      }, timeoutMs);
    });

    return () => {
      disposed = true;
      if (revealTimer) clearTimeout(revealTimer);
      if (dismissTimer) clearTimeout(dismissTimer);
      animatedValues.forEach((value) => value.stopAnimation());
    };
  }, [
    backdropOpacity,
    badgeRotation,
    badgeScale,
    badgeTranslateY,
    contentOpacity,
    copyOpacity,
    hiddenReveal,
    item,
    model,
    onDismiss,
    onReveal,
    particleProgress,
    reduceMotion,
    ringProgress,
    sweepProgress,
  ]);

  if (!model) return null;

  const rotation = badgeRotation.interpolate({
    inputRange: [-1, 0],
    outputRange: ['-4deg', '0deg'],
  });
  const ringScale = ringProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.7, 1],
  });
  const sweepTranslate = sweepProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-190, 190],
  });

  return (
    <Pressable
      style={styles.backdrop}
      onPress={canDismiss ? onDismiss : undefined}
      accessibilityRole={canDismiss ? 'button' : undefined}
      accessibilityLabel={canDismiss ? 'Dismiss badge celebration' : undefined}
    >
      <Animated.View style={[StyleSheet.absoluteFillObject, styles.backdropShade, { opacity: backdropOpacity }]} />
      <Animated.View
        style={[styles.content, { opacity: contentOpacity }]}
        accessibilityViewIsModal
        importantForAccessibility="yes"
      >
        {model.kind === 'summary' ? (
          <View style={styles.summarySeal}>
            <Ionicons name="ribbon-outline" size={50} color={TACTICAL.amber} />
          </View>
        ) : (
          <View style={styles.badgeStage} pointerEvents="none">
            {model.theme?.radialRays ? (
              <View style={styles.rayField}>
                {[0, 45, 90, 135].map((rotationDeg) => (
                  <View key={rotationDeg} style={[styles.ray, { transform: [{ rotate: `${rotationDeg}deg` }] }]} />
                ))}
              </View>
            ) : null}
            <Animated.View
              style={[
                styles.rarityAura,
                {
                  backgroundColor: model.theme?.aura,
                  opacity: ringProgress,
                  transform: [{ scale: ringScale }],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.rarityRing,
                {
                  borderColor: model.theme?.ring,
                  opacity: ringProgress,
                  transform: [{ scale: ringScale }],
                },
              ]}
            />
            {model.theme?.doubleRing ? (
              <Animated.View
                style={[
                  styles.rarityRing,
                  styles.rarityRingOuter,
                  {
                    borderColor: model.theme.ring,
                    opacity: ringProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 0.55] }),
                    transform: [{ scale: ringScale }],
                  },
                ]}
              />
            ) : null}
            {model.animation.animateParticleMotion
              ? PARTICLE_LAYOUT.slice(0, model.theme?.particleCount ?? 0).map((particle, index) => {
                  const direction = index % 2 === 0 ? -1 : 1;
                  return (
                    <Animated.View
                      key={`${particle.x}:${particle.y}`}
                      style={[
                        styles.particle,
                        {
                          width: particle.size,
                          height: particle.size,
                          left: 116 + particle.x,
                          top: 116 + particle.y,
                          backgroundColor: model.theme?.highlight,
                          opacity: particleProgress,
                          transform: [
                            { translateX: particleProgress.interpolate({ inputRange: [0, 1], outputRange: [0, direction * particle.distance] }) },
                            { translateY: particleProgress.interpolate({ inputRange: [0, 1], outputRange: [0, -particle.distance] }) },
                          ],
                        },
                      ]}
                    />
                  );
                })
              : null}
            <Animated.View
              style={[
                styles.badgeArtworkWrap,
                {
                  opacity: model.isHidden ? hiddenReveal : 1,
                  transform: [
                    { scale: badgeScale },
                    { translateY: badgeTranslateY },
                    { rotate: rotation },
                  ],
                },
              ]}
            >
              {artwork ? (
                <Image
                  source={artwork}
                  resizeMode="contain"
                  style={styles.badgeArtwork}
                  accessibilityRole="image"
                  accessibilityLabel={`${model.title}, achieved badge`}
                />
              ) : null}
              {model.animation.animateSweep ? (
                <Animated.View
                  style={[
                    styles.metallicSweep,
                    {
                      opacity: sweepProgress.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0, 0.65, 0.65, 0] }),
                      transform: [{ translateX: sweepTranslate }, { rotate: '16deg' }],
                    },
                  ]}
                />
              ) : null}
            </Animated.View>
            {model.isHidden ? (
              <Animated.View style={[styles.mysterySeal, { opacity: hiddenReveal.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}>
                <Ionicons name="lock-closed" size={42} color={TACTICAL.textMuted} />
              </Animated.View>
            ) : null}
          </View>
        )}

        <Animated.View style={[styles.copy, { opacity: copyOpacity }]}>
          <Text style={[styles.headline, { color: model.theme?.highlight ?? TACTICAL.amber }]}>
            {model.headline}
          </Text>
          <Text style={styles.title} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.72}>
            {model.title}
          </Text>
          {model.rarityLabel ? (
            <Text style={[styles.rarity, { color: model.theme?.highlight }]}>{model.rarityLabel}</Text>
          ) : null}
          {model.previousValue != null || model.currentValue != null ? (
            <View style={styles.recordRow}>
              <View style={styles.recordValueBlock}>
                <Text style={styles.recordLabel}>PREVIOUS</Text>
                <Text style={styles.recordValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {formatRecordValue(model.previousValue)}
                </Text>
              </View>
              <Ionicons name="arrow-forward" size={18} color={TACTICAL.amber} />
              <View style={styles.recordValueBlock}>
                <Text style={styles.recordLabel}>CURRENT</Text>
                <Text
                  style={[styles.recordValue, styles.recordValueCurrent]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {formatRecordValue(model.currentValue)}
                </Text>
              </View>
            </View>
          ) : null}
          {canDismiss ? (
            <TouchableOpacity
              style={styles.catalogButton}
              onPress={(event) => {
                event.stopPropagation();
                onViewCatalog();
              }}
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityLabel="View newly earned badges in Badge Catalog"
            >
              <Ionicons name="albums-outline" size={16} color={TACTICAL.amber} />
              <Text style={styles.catalogButtonText}>View Badge Catalog</Text>
            </TouchableOpacity>
          ) : null}
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: ECS.spacing.lg,
  },
  backdropShade: {
    backgroundColor: 'rgba(4,6,8,0.88)',
  },
  content: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeStage: {
    width: 232,
    height: 232,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rarityAura: {
    position: 'absolute',
    width: 206,
    height: 206,
    borderRadius: 103,
  },
  rarityRing: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    borderWidth: 2,
  },
  rarityRingOuter: {
    width: 214,
    height: 214,
    borderRadius: 107,
    borderWidth: 1,
  },
  rayField: {
    position: 'absolute',
    width: 224,
    height: 224,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.34,
  },
  ray: {
    position: 'absolute',
    width: 220,
    height: 1,
    backgroundColor: 'rgba(255,217,120,0.46)',
  },
  particle: {
    position: 'absolute',
    borderRadius: 2,
  },
  badgeArtworkWrap: {
    width: 164,
    height: 164,
    borderRadius: 82,
    overflow: 'hidden',
  },
  badgeArtwork: {
    width: 164,
    height: 164,
  },
  metallicSweep: {
    position: 'absolute',
    top: -24,
    bottom: -24,
    width: 30,
    backgroundColor: 'rgba(255,255,255,0.54)',
  },
  mysterySeal: {
    position: 'absolute',
    width: 164,
    height: 164,
    borderRadius: 82,
    backgroundColor: ECS.bgElev,
    borderWidth: 1,
    borderColor: ECS.strokeSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summarySeal: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: ECS.accentSoft,
    borderWidth: 1,
    borderColor: ECS.goldMedium,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: ECS.spacing.xl,
  },
  copy: {
    width: '100%',
    minHeight: 138,
    alignItems: 'center',
  },
  headline: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    letterSpacing: 0,
    textAlign: 'center',
  },
  title: {
    marginTop: ECS.spacing.sm,
    maxWidth: 360,
    color: TACTICAL.text,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '800',
    letterSpacing: 0,
    textAlign: 'center',
  },
  rarity: {
    marginTop: ECS.spacing.sm,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
    letterSpacing: 0,
  },
  recordRow: {
    marginTop: ECS.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: ECS.spacing.lg,
  },
  recordValueBlock: {
    minWidth: 78,
    alignItems: 'center',
  },
  recordLabel: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
    letterSpacing: 0,
  },
  recordValue: {
    marginTop: 2,
    color: TACTICAL.text,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '800',
  },
  recordValueCurrent: {
    color: TACTICAL.amber,
  },
  catalogButton: {
    minHeight: 44,
    marginTop: ECS.spacing.xl,
    paddingHorizontal: ECS.spacing.lg,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: ECS.goldMedium,
    backgroundColor: ECS.accentSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: ECS.spacing.sm,
  },
  catalogButtonText: {
    color: TACTICAL.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    letterSpacing: 0,
  },
});
