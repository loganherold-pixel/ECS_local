/**
 * ═══════════════════════════════════════════════════════════
 * ECS OFFLINE DASHBOARD ADAPTER
 * ═══════════════════════════════════════════════════════════
 *
 * Shows the offline behavior profile for each dashboard system.
 * Helps users understand which systems remain available offline,
 * which show cached data, and which require connectivity.
 *
 * Design: Professional, calm, stable presentation.
 * No layout breaks or repeated connectivity popups.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { offlineExpeditionModeEngine } from '../../lib/offlineExpeditionModeEngine';
import type {
  SystemOfflineProfile,
  SystemOfflineBehavior,
} from '../../lib/offlineExpeditionModeTypes';

const BEHAVIOR_DISPLAY: Record<SystemOfflineBehavior, {
  label: string;
  color: string;
  icon: string;
}> = {
  fully_available: {
    label: 'Available',
    color: '#4CAF50',
    icon: 'checkmark-circle-outline',
  },
  last_known: {
    label: 'Last Known',
    color: '#FFB300',
    icon: 'time-outline',
  },
  cached_data: {
    label: 'Cached',
    color: '#42A5F5',
    icon: 'folder-outline',
  },
  local_only: {
    label: 'Local',
    color: '#4CAF50',
    icon: 'phone-portrait-outline',
  },
  degraded: {
    label: 'Limited',
    color: '#E67E22',
    icon: 'alert-circle-outline',
  },
  unavailable: {
    label: 'Unavailable',
    color: '#78909C',
    icon: 'close-circle-outline',
  },
};

interface OfflineDashboardAdapterProps {
  /** Show compact version (fewer details) */
  compact?: boolean;
}

export default function OfflineDashboardAdapter({
  compact = false,
}: OfflineDashboardAdapterProps) {
  const [profiles, setProfiles] = useState<SystemOfflineProfile[]>([]);
  const [connState, setConnState] = useState('online');

  const refresh = useCallback(() => {
    setProfiles(offlineExpeditionModeEngine.getSystemProfiles());
    setConnState(offlineExpeditionModeEngine.getConnectivityState());
  }, []);

  useEffect(() => {
    refresh();
    const unsub = offlineExpeditionModeEngine.subscribe(refresh);
    return unsub;
  }, [refresh]);

  // Don't show when online
  if (connState === 'online') return null;

  // Group profiles by behavior
  const available = profiles.filter(p =>
    p.behavior === 'fully_available' || p.behavior === 'local_only',
  );
  const cached = profiles.filter(p =>
    p.behavior === 'cached_data' || p.behavior === 'last_known',
  );
  const limited = profiles.filter(p =>
    p.behavior === 'degraded' || p.behavior === 'unavailable',
  );

  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <View style={styles.compactRow}>
          <View style={styles.compactGroup}>
            <Ionicons name="checkmark-circle" size={12} color="#4CAF50" />
            <Text style={styles.compactText}>
              {available.length} available
            </Text>
          </View>
          <View style={styles.compactGroup}>
            <Ionicons name="folder-outline" size={12} color="#42A5F5" />
            <Text style={styles.compactText}>
              {cached.length} cached
            </Text>
          </View>
          <View style={styles.compactGroup}>
            <Ionicons name="alert-circle-outline" size={12} color="#78909C" />
            <Text style={styles.compactText}>
              {limited.length} limited
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="apps-outline" size={16} color="#C48A2C" />
        <Text style={styles.headerTitle}>System Status</Text>
        <Text style={styles.headerSubtitle}>Offline Availability</Text>
      </View>

      <ScrollView
        style={styles.list}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {/* Available Systems */}
        {available.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: '#4CAF50' }]}>
              AVAILABLE OFFLINE
            </Text>
            {available.map(renderProfile)}
          </View>
        )}

        {/* Cached Systems */}
        {cached.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: '#42A5F5' }]}>
              USING CACHED DATA
            </Text>
            {cached.map(renderProfile)}
          </View>
        )}

        {/* Limited Systems */}
        {limited.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: '#78909C' }]}>
              LIMITED OR UNAVAILABLE
            </Text>
            {limited.map(renderProfile)}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function renderProfile(profile: SystemOfflineProfile) {
  const display = BEHAVIOR_DISPLAY[profile.behavior];

  return (
    <View key={profile.system_id} style={styles.profileRow}>
      <Ionicons
        name={display.icon as any}
        size={14}
        color={display.color}
      />
      <View style={styles.profileInfo}>
        <Text style={styles.profileName}>{profile.name}</Text>
        <Text style={styles.profileStatus}>{profile.status_message}</Text>
      </View>
      <View style={styles.profileBadge}>
        <Text style={[styles.profileBadgeText, { color: display.color }]}>
          {display.label}
        </Text>
      </View>
      {profile.is_stale && (
        <Ionicons
          name="time-outline"
          size={12}
          color="#FFB300"
          style={{ marginLeft: 4 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1E1E1E',
    borderRadius: 10,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E0E0E0',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#888',
    marginLeft: 'auto',
  },
  list: {
    maxHeight: 300,
  },
  section: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  sectionLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: '#2A2A2A',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#D0D0D0',
  },
  profileStatus: {
    fontSize: 10,
    color: '#888',
    marginTop: 1,
  },
  profileBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#2A2A2A',
  },
  profileBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  // Compact styles
  compactContainer: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  compactRow: {
    flexDirection: 'row',
    gap: 16,
  },
  compactGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  compactText: {
    fontSize: 11,
    color: '#888',
  },
});




