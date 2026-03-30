import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { offlineExpeditionModeEngine } from '../../lib/offlineExpeditionModeEngine';

import {
  CONNECTIVITY_STATE_DISPLAY,
  type OfflineConnectivityState,
} from '../../lib/offlineConnectivityState';

interface OfflineStateBannerProps {
  expanded?: boolean;
  onPress?: () => void;
  style?: any;
}

export default function OfflineStateBanner({
  expanded = false,
  onPress,
  style,
}: OfflineStateBannerProps) {
  const [state, setState] = useState<OfflineConnectivityState>('online');
  const [summary, setSummary] = useState('');
  const [visible, setVisible] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const update = () => {
      const nextState = offlineExpeditionModeEngine.getConnectivityState();
      const shouldShow = offlineExpeditionModeEngine.shouldShowBanner();
      const compactSummary = offlineExpeditionModeEngine.getCompactSummary();

      setState(nextState);
      setSummary(compactSummary);

      if (shouldShow) {
        setVisible(true);
        Animated.timing(slideAnim, {
          toValue: 1,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      } else {
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 250,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }).start(() => setVisible(false));
      }
    };

    update();
    const unsubscribe = offlineExpeditionModeEngine.subscribe(update);
    return unsubscribe;
  }, [slideAnim]);

  useEffect(() => {
    if (state === 'reconnecting') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.6,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    }

    pulseAnim.setValue(1);
  }, [state, pulseAnim]);

  if (!visible && state === 'online') {
    return null;
  }

  const display = CONNECTIVITY_STATE_DISPLAY[state];

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-40, 0],
  });

  return (
    <Animated.View
  style={[
    styles.container,
    { backgroundColor: `${display.color}18` },
    {
      transform: [{ translateY }],
      opacity: slideAnim,
    },
    style,
  ]}
>
  <TouchableOpacity
    style={styles.inner}
    onPress={onPress}
    activeOpacity={0.7}
    disabled={!onPress}
  >
        <Animated.View style={{ opacity: state === 'reconnecting' ? pulseAnim : 1 }}>
          <Ionicons
            name={display.icon as any}
            size={16}
            color={display.color}
          />
        </Animated.View>

        <View style={styles.textContainer}>
          <Text style={[styles.label, { color: display.color }]}>
            {display.shortLabel}
          </Text>
          {expanded && (
            <Text style={styles.description} numberOfLines={1}>
              {summary}
            </Text>
          )}
        </View>

        {state === 'reconnecting' && (
          <Animated.View style={{ opacity: pulseAnim }}>
            <Ionicons
              name="sync-outline"
              size={14}
              color={display.color}
            />
          </Animated.View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    marginHorizontal: 12,
    marginVertical: 4,
    overflow: 'hidden',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  textContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  description: {
    fontSize: 12,
    color: '#A0A0A0',
    flex: 1,
  },
});



