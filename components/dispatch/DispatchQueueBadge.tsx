// ============================================================
// ECS DISPATCH — OFFLINE QUEUE BADGE
// ============================================================
// Shows a compact badge in the dispatch feed header indicating
// the number of queued (offline) events. Tapping opens the
// queue viewer modal. Pulses when items are actively queued.

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import { dispatchQueue } from '../../lib/dispatchQueueStore';
import type { QueuedDispatchEvent } from '../../lib/dispatchQueueStore';

interface Props {
  /** Filter to a specific expedition (optional) */
  expeditionId?: string;
  /** Called when the badge is tapped */
  onPress: () => void;
}

export default function DispatchQueueBadge({ expeditionId, onPress }: Props) {
  const [count, setCount] = useState(0);
  const [isFlushing, setIsFlushing] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const hasQueuedItems = count > 0;

  // Subscribe to queue changes
  useEffect(() => {
    const updateCount = (queue: QueuedDispatchEvent[]) => {
      const filtered = expeditionId
        ? queue.filter(i => i.expedition_id === expeditionId)
        : queue;
      setCount(filtered.length);
      setIsFlushing(dispatchQueue.isFlushing);
    };

    // Initial count
    const initial = expeditionId
      ? dispatchQueue.getByExpedition(expeditionId)
      : dispatchQueue.queue;
    setCount(initial.length);

    const unsub = dispatchQueue.onChange(updateCount);
    return () => { unsub(); };
  }, [expeditionId]);

  // Pulse animation when count > 0
  useEffect(() => {
    if (hasQueuedItems) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.6,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1200,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [hasQueuedItems, pulseAnim]);

  // Don't render if no queued items
  if (count === 0) return null;

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.7}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Animated.View style={[styles.badge, { opacity: pulseAnim }]}>
        {isFlushing ? (
          <Ionicons name="sync-outline" size={10} color="#FFF" />
        ) : (
          <Ionicons name="cloud-upload-outline" size={10} color="#FFF" />
        )}
        <Text style={styles.badgeText}>{count}</Text>
      </Animated.View>
      <Text style={styles.label}>
        {isFlushing ? 'SENDING' : 'QUEUED'}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(196, 138, 44, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.25)',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    minWidth: 20,
    height: 18,
    borderRadius: 9,
    backgroundColor: TACTICAL.amber,
    paddingHorizontal: 5,
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#0B0F12',
    letterSpacing: 0.5,
  },
  label: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1.2,
  },
});



