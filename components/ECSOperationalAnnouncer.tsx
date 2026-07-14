import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, Text } from 'react-native';

import {
  buildECSOperationalAnnouncement,
  type ECSOperationalAnnouncementEvent,
} from '../lib/accessibility/ecsOperationalAccessibility';

type ECSOperationalAnnouncerProps = {
  event: ECSOperationalAnnouncementEvent | null | undefined;
  enabled?: boolean;
  announceInitial?: boolean;
};

/** Announces deterministic operational state transitions without logging payloads. */
export default function ECSOperationalAnnouncer({
  event,
  enabled = true,
  announceInitial = false,
}: ECSOperationalAnnouncerProps) {
  const announcement = useMemo(
    () => (event ? buildECSOperationalAnnouncement(event) : null),
    [event],
  );
  const lastFingerprintRef = useRef<string | null>(null);
  const hasObservedEventRef = useRef(false);
  const [liveMessage, setLiveMessage] = useState('');

  useEffect(() => {
    if (!enabled || !announcement) {
      if (!announcement) lastFingerprintRef.current = null;
      return undefined;
    }
    if (announcement.fingerprint === lastFingerprintRef.current) return undefined;

    lastFingerprintRef.current = announcement.fingerprint;
    const isInitialEvent = !hasObservedEventRef.current;
    hasObservedEventRef.current = true;
    if (isInitialEvent && !announceInitial) return undefined;

    const timer = setTimeout(() => {
      if (Platform.OS === 'web' || Platform.OS === 'android') {
        setLiveMessage(announcement.message);
        return;
      }
      AccessibilityInfo.announceForAccessibility(announcement.message);
    }, 0);

    return () => clearTimeout(timer);
  }, [announceInitial, announcement, enabled]);

  if ((Platform.OS !== 'web' && Platform.OS !== 'android') || !announcement) return null;

  return (
    <Text
      accessible
      accessibilityLiveRegion={announcement.liveRegion}
      importantForAccessibility="yes"
      style={styles.visuallyHidden}
    >
      {liveMessage}
    </Text>
  );
}

const styles = StyleSheet.create({
  visuallyHidden: {
    position: 'absolute',
    width: 1,
    height: 1,
    overflow: 'hidden',
    opacity: 0.01,
  },
});
