/**
 * Sync Status Micro-Indicator
 * 
 * Two-part indicator:
 * 1. Existing 4-state sync badge: LOCAL_ONLY, SYNC_PENDING, SYNCED, SYNC_ERROR
 * 2. Auto-push pipeline indicator: countdown → spinning → green/yellow flash
 *
 * Subscribes to autoPush.onChange() for real-time push status visibility.
 *
 * Flash colors:
 *   - Green flash: clean push (no conflicts)
 *   - Yellow flash: push succeeded but conflicts were auto-resolved via last-write-wins
 *   - Red pill: push failed
 */
import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { SafeIcon as Ionicons } from './SafeIcon';

import { DENSITY } from '../lib/theme';
import { useApp } from '../context/AppContext';

import { autoPush, type AutoPushStatus, type AutoPushStats } from '../lib/autoPush';

// ── Sync badge colors ─────────────────────────────────────────
const SYNC_COLORS = {
  local: '#8A8A85',
  pending: '#C48A2C',
  synced: '#3E6B3E',
  error: '#C0392B',
};

type SyncIndicatorState = 'local' | 'pending' | 'synced' | 'error';

const SYNC_ICONS: Record<SyncIndicatorState, any> = {
  local: 'cloud-outline',
  pending: 'cloud-upload-outline',
  synced: 'cloud-done-outline',
  error: 'cloud-offline-outline',
};

const SYNC_LABELS: Record<SyncIndicatorState, string> = {
  local: 'LOCAL',
  pending: 'PENDING',
  synced: 'SYNCED',
  error: 'RETRY',
};

// ── Auto-push indicator colors ────────────────────────────────
const PUSH_COLORS = {
  pending: '#C48A2C',      // amber — waiting to push
  pushing: '#5A9BD5',      // blue — actively pushing
  success: '#4CAF50',      // green — clean push completed
  conflict: '#E6A817',     // yellow/gold — push completed with auto-resolved conflicts
  error: '#C0392B',        // red — push failed
};

export default function SyncStatusIndicator() {
  const { syncStatus, user, dirtyCount, triggerSync } = useApp();

  // ── Auto-push state ───────────────────────────────────────
  const [pushStatus, setPushStatus] = useState<AutoPushStatus>('idle');
  const [pushScheduledAt, setPushScheduledAt] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<number>(0);
  const [successFlash, setSuccessFlash] = useState(false);
  const [conflictFlash, setConflictFlash] = useState(false);
  const [lastPushRows, setLastPushRows] = useState(0);
  const [lastResolvedRows, setLastResolvedRows] = useState(0);
  const prevStatusRef = useRef<AutoPushStatus>('idle');
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Spin animation for pushing state ──────────────────────
  const spinAnim = useRef(new Animated.Value(0)).current;
  const spinAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  // ── Pulse animation for pending state ─────────────────────
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  // ── Subscribe to autoPush changes ─────────────────────────
  useEffect(() => {
    const unsub = autoPush.onChange((stats: AutoPushStats) => {
      const prev = prevStatusRef.current;
      const next = stats.status;

      setPushStatus(next);
      setPushScheduledAt(stats.pushScheduledAt);

      // Detect successful push completion: pushing → idle
      if (prev === 'pushing' && next === 'idle') {
        // Clear any existing flash timer
        if (flashTimerRef.current) clearTimeout(flashTimerRef.current);

        if (stats.lastPushAutoResolved && stats.lastPushAutoResolvedRows > 0) {
          // ── Yellow flash: conflicts were auto-resolved ──────
          setConflictFlash(true);
          setSuccessFlash(false);
          setLastResolvedRows(stats.lastPushAutoResolvedRows);
          setLastPushRows(stats.lastPushRows);
          flashTimerRef.current = setTimeout(() => {
            setConflictFlash(false);
            setLastResolvedRows(0);
            setLastPushRows(0);
          }, 2500); // slightly longer for conflict flash
        } else {
          // ── Green flash: clean push ─────────────────────────
          setSuccessFlash(true);
          setConflictFlash(false);
          setLastPushRows(stats.lastPushRows);
          setLastResolvedRows(0);
          flashTimerRef.current = setTimeout(() => {
            setSuccessFlash(false);
            setLastPushRows(0);
          }, 2000);
        }
      }

      prevStatusRef.current = next;
    });

    return () => {
      unsub();
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  // ── Countdown timer ───────────────────────────────────────
  useEffect(() => {
    // Clear any existing countdown
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }

    if (pushStatus === 'pending' && pushScheduledAt) {
      // Immediately compute countdown
      const computeCountdown = () => {
        const remaining = Math.max(0, pushScheduledAt - Date.now());
        setCountdown(remaining);
        if (remaining <= 0 && countdownRef.current) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
        }
      };

      computeCountdown();
      countdownRef.current = setInterval(computeCountdown, 200);
    } else {
      setCountdown(0);
    }

    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, [pushStatus, pushScheduledAt]);

  // ── Spin animation lifecycle ──────────────────────────────
  useEffect(() => {
    if (pushStatus === 'pushing') {
      spinAnim.setValue(0);
      const anim = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      spinAnimRef.current = anim;
      anim.start();
    } else {
      if (spinAnimRef.current) {
        spinAnimRef.current.stop();
        spinAnimRef.current = null;
      }
      spinAnim.setValue(0);
    }

    return () => {
      if (spinAnimRef.current) {
        spinAnimRef.current.stop();
        spinAnimRef.current = null;
      }
    };
  }, [pushStatus, spinAnim]);

  // ── Pulse animation for pending ───────────────────────────
  useEffect(() => {
    if (pushStatus === 'pending') {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.5,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      pulseAnimRef.current = anim;
      anim.start();
    } else {
      if (pulseAnimRef.current) {
        pulseAnimRef.current.stop();
        pulseAnimRef.current = null;
      }
      pulseAnim.setValue(1);
    }

    return () => {
      if (pulseAnimRef.current) {
        pulseAnimRef.current.stop();
        pulseAnimRef.current = null;
      }
    };
  }, [pushStatus, pulseAnim]);

  // ── Derive sync indicator state ───────────────────────────
  let state: SyncIndicatorState = 'local';
  if (user) {
    if (syncStatus === 'synced' && dirtyCount === 0) state = 'synced';
    else if (syncStatus === 'error') state = 'error';
    else if (syncStatus === 'syncing' || dirtyCount > 0) state = 'pending';
    else if (syncStatus === 'offline') state = dirtyCount > 0 ? 'pending' : 'local';
    else state = 'synced';
  }

  const color = SYNC_COLORS[state];

  // ── Should show push indicator? ───────────────────────────
  const showPushIndicator =
    pushStatus === 'pending' ||
    pushStatus === 'pushing' ||
    pushStatus === 'error' ||
    successFlash ||
    conflictFlash;

  // ── Spin interpolation ────────────────────────────────────
  const spinRotation = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // ── Countdown display ─────────────────────────────────────
  const countdownSec = Math.ceil(countdown / 1000);

  // ── Render push indicator pill ────────────────────────────
  const renderPushIndicator = () => {
    if (!showPushIndicator) return null;

    // ── Conflict auto-resolved flash (yellow) ─────────────
    if (conflictFlash) {
      return (
        <View
          style={[
            styles.pushPill,
            {
              borderColor: PUSH_COLORS.conflict + '70',
              backgroundColor: PUSH_COLORS.conflict + '18',
            },
          ]}
        >
          <Ionicons name="git-merge-outline" size={10} color={PUSH_COLORS.conflict} />
          <Text style={[styles.pushText, { color: PUSH_COLORS.conflict }]}>
            {lastResolvedRows > 0 ? `${lastResolvedRows} MERGED` : 'MERGED'}
          </Text>
        </View>
      );
    }

    // ── Clean success flash (green) ───────────────────────
    if (successFlash) {
      return (
        <View style={[styles.pushPill, { borderColor: PUSH_COLORS.success + '60', backgroundColor: PUSH_COLORS.success + '15' }]}>
          <Ionicons name="checkmark-circle" size={10} color={PUSH_COLORS.success} />
          <Text style={[styles.pushText, { color: PUSH_COLORS.success }]}>
            {lastPushRows > 0 ? `${lastPushRows}` : 'OK'}
          </Text>
        </View>
      );
    }

    // ── Error state ───────────────────────────────────────
    if (pushStatus === 'error') {
      return (
        <View style={[styles.pushPill, { borderColor: PUSH_COLORS.error + '60', backgroundColor: PUSH_COLORS.error + '10' }]}>
          <Ionicons name="alert-circle" size={10} color={PUSH_COLORS.error} />
          <Text style={[styles.pushText, { color: PUSH_COLORS.error }]}>ERR</Text>
        </View>
      );
    }

    // ── Pushing state — spinning indicator ────────────────
    if (pushStatus === 'pushing') {
      return (
        <View style={[styles.pushPill, { borderColor: PUSH_COLORS.pushing + '60', backgroundColor: PUSH_COLORS.pushing + '10' }]}>
          <Animated.View style={{ transform: [{ rotate: spinRotation }] }}>
            <Ionicons name="sync" size={10} color={PUSH_COLORS.pushing} />
          </Animated.View>
          <Text style={[styles.pushText, { color: PUSH_COLORS.pushing }]}>PUSH</Text>
        </View>
      );
    }

    // ── Pending state — upload arrow with countdown ───────
    if (pushStatus === 'pending') {
      return (
        <Animated.View
          style={[
            styles.pushPill,
            {
              borderColor: PUSH_COLORS.pending + '60',
              backgroundColor: PUSH_COLORS.pending + '10',
              opacity: pulseAnim,
            },
          ]}
        >
          <Ionicons name="arrow-up-circle-outline" size={10} color={PUSH_COLORS.pending} />
          {countdownSec > 0 ? (
            <Text style={[styles.pushCountdown, { color: PUSH_COLORS.pending }]}>
              {countdownSec}s
            </Text>
          ) : (
            <Text style={[styles.pushText, { color: PUSH_COLORS.pending }]}>NOW</Text>
          )}
        </Animated.View>
      );
    }

    return null;
  };

  return (
    <View style={styles.wrapper}>
      {/* Auto-push pipeline indicator */}
      {renderPushIndicator()}

      {/* Main sync status badge */}
      <TouchableOpacity
        style={[styles.container, { borderColor: color + '40' }]}
        onPress={triggerSync}
        activeOpacity={0.7}
      >
        <Ionicons name={SYNC_ICONS[state]} size={14} color={color} />
        <Text style={[styles.label, { color }]}>{SYNC_LABELS[state]}</Text>
        {dirtyCount > 0 && state !== 'synced' && (
          <View style={[styles.countBadge, { backgroundColor: color + '30' }]}>
            <Text style={[styles.countText, { color }]}>
              {dirtyCount > 99 ? '99+' : dirtyCount}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderWidth: DENSITY.borderDefault,
    borderRadius: 4,
    backgroundColor: 'transparent',
  },
  label: {
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  countBadge: {
    minWidth: 14,
    height: 14,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  countText: {
    fontSize: 7,
    fontWeight: '900',
    fontFamily: 'Courier',
  },
  // ── Push indicator pill ─────────────────────────────────────
  pushPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderWidth: 1,
    borderRadius: 4,
  },
  pushText: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  pushCountdown: {
    fontSize: 8,
    fontWeight: '900',
    fontFamily: 'Courier',
    letterSpacing: 0,
    minWidth: 14,
    textAlign: 'center',
  },
});





