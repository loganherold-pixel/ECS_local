/**
 * Fleet Sync Status Indicator
 *
 * Compact badge displayed in the Fleet tab header that shows the
 * current sync state: SYNCED, PENDING SYNC (with count), or CONFLICT.
 *
 * Aggregates data from:
 *   - AppContext (syncStatus, dirtyCount, queueSize, isOnline)
 *   - conflictStore (pending conflict count)
 *   - offlineQueue (queued operations)
 *
 * Tapping the badge opens the FleetSyncModal for full queue management.
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
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import { useApp } from '../../context/AppContext';
import {
  getPendingConflictCount,
  onConflictChange,
} from '../../lib/conflictStore';
import { offlineQueue } from '../../lib/offlineQueue';

export type FleetSyncState = 'synced' | 'pending' | 'conflict' | 'syncing' | 'offline' | 'error';

interface StateConfig {
  icon: string;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

function getStateConfig(state: FleetSyncState, pendingCount: number, conflictCount: number, isOnline: boolean): StateConfig {
  if (conflictCount > 0) {
    return { icon: 'git-compare-outline', label: `${conflictCount} CONFLICT${conflictCount !== 1 ? 'S' : ''}`, color: '#FF9500', bgColor: 'rgba(255,149,0,0.10)', borderColor: 'rgba(255,149,0,0.35)' };
  }
  if (state === 'syncing') {
    return { icon: 'sync-outline', label: 'SYNCING', color: '#5A9BD5', bgColor: 'rgba(90,155,213,0.10)', borderColor: 'rgba(90,155,213,0.35)' };
  }
  if (state === 'error') {
    return { icon: 'alert-circle-outline', label: 'SYNC ERROR', color: '#FF3B30', bgColor: 'rgba(255,59,48,0.10)', borderColor: 'rgba(255,59,48,0.35)' };
  }
  if (pendingCount > 0) {
    return { icon: 'cloud-upload-outline', label: 'PENDING SYNC', color: TACTICAL.amber, bgColor: 'rgba(196,138,44,0.10)', borderColor: 'rgba(196,138,44,0.35)' };
  }
  if (!isOnline) {
    return { icon: 'cloud-offline-outline', label: 'OFFLINE', color: '#8E8E93', bgColor: 'rgba(142,142,147,0.10)', borderColor: 'rgba(142,142,147,0.30)' };
  }
  return { icon: 'checkmark-circle-outline', label: 'SYNCED', color: '#3E6B3E', bgColor: 'rgba(62,107,62,0.10)', borderColor: 'rgba(62,107,62,0.30)' };
}

interface Props { onPress: () => void; }

export default function FleetSyncStatusIndicator({ onPress }: Props) {
  const { syncStatus, dirtyCount, queueSize, isOnline } = useApp();

  const [conflictCount, setConflictCount] = useState(getPendingConflictCount());
  useEffect(() => {
    const unsub = onConflictChange((count: number) => { setConflictCount(count); });
    return unsub;
  }, []);

  const [offlineQueueSize, setOfflineQueueSize] = useState(offlineQueue.size);
  useEffect(() => {
    const unsub = offlineQueue.onChange((queue: any[]) => { setOfflineQueueSize(queue.length); });
    return unsub;
  }, []);

  const totalPending = dirtyCount + offlineQueueSize + (queueSize || 0);

  const derivedState: FleetSyncState = syncStatus === 'syncing' ? 'syncing'
    : syncStatus === 'error' ? 'error'
    : conflictCount > 0 ? 'conflict'
    : totalPending > 0 ? 'pending'
    : !isOnline ? 'offline'
    : 'synced';

  const config = getStateConfig(derivedState, totalPending, conflictCount, isOnline);
  const showCount = totalPending > 0 || conflictCount > 0;
  const displayCount = conflictCount > 0 ? conflictCount : totalPending;

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseRef = useRef<Animated.CompositeAnimation | null>(null);
  const spinAnim = useRef(new Animated.Value(0)).current;
  const spinRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (derivedState === 'pending' || derivedState === 'conflict') {
      const anim = Animated.loop(Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.65, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]));
      pulseRef.current = anim;
      anim.start();
    } else {
      pulseRef.current?.stop(); pulseRef.current = null; pulseAnim.setValue(1);
    }
    return () => { pulseRef.current?.stop(); pulseRef.current = null; };
  }, [derivedState]);

  useEffect(() => {
    if (derivedState === 'syncing') {
      spinAnim.setValue(0);
      const anim = Animated.loop(Animated.timing(spinAnim, { toValue: 1, duration: 1200, easing: Easing.linear, useNativeDriver: true }));
      spinRef.current = anim; anim.start();
    } else {
      spinRef.current?.stop(); spinRef.current = null; spinAnim.setValue(0);
    }
    return () => { spinRef.current?.stop(); spinRef.current = null; };
  }, [derivedState]);

  const spinRotation = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <Animated.View style={{ opacity: derivedState === 'syncing' ? 1 : pulseAnim }}>
      <TouchableOpacity
        style={[s.container, { backgroundColor: config.bgColor, borderColor: config.borderColor }]}
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityLabel={`Sync status: ${config.label}. ${showCount ? `${displayCount} items.` : ''} Tap to manage sync queue.`}
        accessibilityRole="button"
      >
        {derivedState === 'syncing' ? (
          <Animated.View style={{ transform: [{ rotate: spinRotation }] }}>
            <Ionicons name="sync-outline" size={11} color={config.color} />
          </Animated.View>
        ) : (
          <Ionicons name={config.icon as any} size={11} color={config.color} />
        )}
        <Text style={[s.label, { color: config.color }]}>{config.label}</Text>
        {showCount && (
          <View style={[s.countBadge, { backgroundColor: config.color }]}>
            <Text style={s.countText}>{displayCount > 99 ? '99+' : displayCount}</Text>
          </View>
        )}
        <Ionicons name="chevron-forward" size={9} color={config.color + '80'} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  label: { fontSize: 8, fontWeight: '800', letterSpacing: 0.8 },
  countBadge: { minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  countText: { fontSize: 8, fontWeight: '900', color: '#FFFFFF', fontFamily: 'Courier' },
});





