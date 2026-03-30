/**
 * RateLimitBanner — Shows rate limit warnings and errors
 *
 * Subscribes to rateLimitStore and displays a banner when:
 * - A function is approaching its rate limit (< 20% remaining) — yellow warning
 * - A function has been rate limited (429 received) — red error with countdown
 *
 * Place this component in any screen that calls rate-limited edge functions.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as rateLimitStore from '../app/lib/rateLimitStore';
import type { RateLimitInfo } from '../app/lib/rateLimitStore';

export default function RateLimitBanner() {
  const [activeItems, setActiveItems] = useState<RateLimitInfo[]>([]);
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const unsub = rateLimitStore.subscribe((states) => {
      const items = Object.values(states).filter(s => s.isLimited || s.isWarning);
      setActiveItems(items);
    });
    return unsub;
  }, []);

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: activeItems.length > 0 ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [activeItems.length]);

  if (activeItems.length === 0) return null;

  return (
    <Animated.View style={[styles.container, { opacity }]}>
      {activeItems.map((item) => (
        <View
          key={item.functionName}
          style={[styles.banner, item.isLimited ? styles.bannerError : styles.bannerWarning]}
        >
          <Ionicons
            name={item.isLimited ? 'hand-left-outline' : 'speedometer-outline'}
            size={16}
            color={item.isLimited ? '#FF3B30' : '#FF9500'}
            style={styles.icon}
          />
          <View style={styles.textWrap}>
            <Text style={[styles.label, item.isLimited ? styles.labelError : styles.labelWarning]}>
              {item.label}
            </Text>
            <Text style={styles.detail}>
              {item.isLimited
                ? `Rate limited — retry in ${rateLimitStore.formatRetryAfter(item.retryAfter)}`
                : `${item.remaining}/${item.limit} requests remaining this hour`}
            </Text>
          </View>
        </View>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 12, paddingTop: 4, gap: 4 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
  },
  bannerWarning: {
    backgroundColor: 'rgba(255,149,0,0.08)',
    borderColor: 'rgba(255,149,0,0.25)',
  },
  bannerError: {
    backgroundColor: 'rgba(255,59,48,0.08)',
    borderColor: 'rgba(255,59,48,0.25)',
  },
  icon: { marginRight: 8 },
  textWrap: { flex: 1 },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  labelWarning: { color: '#FF9500' },
  labelError: { color: '#FF3B30' },
  detail: { fontSize: 11, color: '#8E8E93', marginTop: 1 },
});




