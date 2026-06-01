/**
 * LatestMomentBanner — Non-intrusive narrative moment preview
 *
 * Shows the most recent narrative event as a single quiet line:
 *   "Latest: Entered DEEP REMOTE"
 *
 * Rules:
 *   - Do NOT add a scrolling log panel
 *   - Single line, small text, subtle styling
 *   - Subscribes to narrativeEngine for live updates
 *   - Fades in on change
 *   - Returns null if no events exist
 */

import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { TACTICAL } from '../../lib/theme';
import {
  narrativeEngine,
  NARRATIVE_EVENT_META,
  type NarrativeEvent,
} from '../../lib/narrativeEngine';

interface Props {
  expeditionId: string;
}

export default function LatestMomentBanner({ expeditionId }: Props) {
  const [latest, setLatest] = useState<NarrativeEvent | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const prevMessageRef = useRef<string | null>(null);

  // Get latest event
  useEffect(() => {
    if (!expeditionId) return;

    const update = () => {
      const events = narrativeEngine.getEvents(expeditionId);
      const newest = events.length > 0 ? events[0] : null;
      setLatest(newest);

      // Animate on new message
      if (newest && newest.message !== prevMessageRef.current) {
        prevMessageRef.current = newest.message;
        fadeAnim.setValue(0);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }).start();
      }
    };

    // Initial load
    update();

    // Subscribe to changes
    const unsub = narrativeEngine.subscribe(update);
    return unsub;
  }, [expeditionId, fadeAnim]);

  if (!latest) return null;

  const meta = NARRATIVE_EVENT_META[latest.eventType];
  const accentColor = meta?.color || TACTICAL.textMuted;

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <View style={[styles.dot, { backgroundColor: accentColor }]} />
      <Text style={styles.label}>Latest</Text>
      <Text style={styles.message} numberOfLines={1}>
        {latest.message}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.18)',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  label: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  message: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(230, 230, 225, 0.75)',
    letterSpacing: 0.2,
  },
});



