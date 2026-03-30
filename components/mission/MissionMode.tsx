// ============================================================
// MISSION MODE — Container with segmented control
// ============================================================
// Renders when an active expedition exists.
// 4 screens: Dashboard | Loadout Ops | Navigate | Mission Log
//
// Phase 1 Narrative Integration:
//   - Starts narrativeEngine on mount (expedition IN_PROGRESS)
//   - Stops narrativeEngine on unmount or mission end
// ============================================================

import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Platform, Alert,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import TopoBackground from '../TopoBackground';
import type { MissionExpedition } from '../../lib/missionTypes';
import { missionExpeditionStore, missionEventStore } from '../../lib/missionStore';
import { narrativeEngine } from '../../lib/narrativeEngine';
import MissionDashboard from './MissionDashboard';
import MissionLoadoutOps from './MissionLoadoutOps';
import MissionLog from './MissionLog';

type MissionTab = 'dashboard' | 'loadout' | 'navigate' | 'log';

interface Props {
  expedition: MissionExpedition;
  isOnline: boolean;
  onMissionEnded: () => void;
  showToast: (msg: string) => void;
}

export default function MissionMode({ expedition, isOnline, onMissionEnded, showToast }: Props) {
  const [activeTab, setActiveTab] = useState<MissionTab>('dashboard');
  const [refreshKey, setRefreshKey] = useState(0);

  // ── Narrative Engine lifecycle ──────────────────────────
  useEffect(() => {
    narrativeEngine.start(expedition.id);
    return () => {
      narrativeEngine.stop();
    };
  }, [expedition.id]);

  const handleRefresh = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  const handleEndMission = useCallback(() => {
    const doEnd = () => {
      narrativeEngine.stop();
      missionExpeditionStore.updateStatus(expedition.id, 'completed');
      missionEventStore.append(expedition.id, 'MISSION_COMPLETED', {
        endedAt: new Date().toISOString(),
      });
      showToast('MISSION COMPLETED');
      onMissionEnded();
    };

    if (Platform.OS === 'web') {
      if (confirm('End this mission? This will mark it as completed and exit Mission Mode.')) {
        doEnd();
      }
    } else {
      Alert.alert(
        'End Mission',
        'This will mark the mission as completed and exit Mission Mode.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'End Mission', style: 'destructive', onPress: doEnd },
        ]
      );
    }
  }, [expedition.id, onMissionEnded, showToast]);

  const TABS: { key: MissionTab; label: string; icon: string }[] = [
    { key: 'dashboard', label: 'DASHBOARD', icon: 'speedometer-outline' },
    { key: 'loadout', label: 'LOADOUT OPS', icon: 'cube-outline' },
    { key: 'navigate', label: 'NAVIGATE', icon: 'navigate-outline' },
    { key: 'log', label: 'LOG', icon: 'journal-outline' },
  ];

  return (
    <TopoBackground>
      <View style={styles.container}>
        {/* Mission Mode Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.missionBadge}>
              <View style={styles.missionPulse} />
              <Text style={styles.missionBadgeText}>MISSION MODE</Text>
            </View>
            <Text style={styles.headerTitle}>{expedition.name}</Text>
          </View>
          <View style={styles.headerRight}>
            <View style={[styles.onlineDot, { backgroundColor: isOnline ? '#4CAF50' : '#E53935' }]} />
          </View>
        </View>

        {/* Segmented Control */}
        <View style={styles.segmentedControl}>
          {TABS.map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.segment, isActive && styles.segmentActive]}
                onPress={() => setActiveTab(tab.key)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={tab.icon as any}
                  size={14}
                  color={isActive ? '#4CAF50' : TACTICAL.textMuted}
                />
                <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Tab Content */}
        <View style={styles.content}>
          {activeTab === 'dashboard' && (
            <MissionDashboard
              key={`dash-${refreshKey}`}
              expedition={expedition}
              isOnline={isOnline}
              onRefresh={handleRefresh}
              onEndMission={handleEndMission}
            />
          )}
          {activeTab === 'loadout' && (
            <MissionLoadoutOps
              key={`ops-${refreshKey}`}
              expeditionId={expedition.id}
              onRefresh={handleRefresh}
            />
          )}
          {activeTab === 'navigate' && (
            <View style={styles.navigatePlaceholder}>
              <Ionicons name="navigate-outline" size={48} color={TACTICAL.textMuted} />
              <Text style={styles.placeholderTitle}>NAVIGATION</Text>
              <Text style={styles.placeholderSub}>
                Route tracking and waypoint navigation will be available when GPS integration is configured.
              </Text>
              <View style={styles.placeholderFeatures}>
                {[
                  { icon: 'location-outline', label: 'Current Position' },
                  { icon: 'map-outline', label: 'Route Overlay' },
                  { icon: 'flag-outline', label: 'Waypoint Tracking' },
                  { icon: 'compass-outline', label: 'Heading Display' },
                ].map((f, i) => (
                  <View key={i} style={styles.placeholderFeatureRow}>
                    <Ionicons name={f.icon as any} size={14} color={TACTICAL.textMuted} />
                    <Text style={styles.placeholderFeatureText}>{f.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
          {activeTab === 'log' && (
            <MissionLog
              key={`log-${refreshKey}`}
              expeditionId={expedition.id}
            />
          )}
        </View>
      </View>
    </TopoBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: Platform.OS === 'web' ? 16 : 54, paddingBottom: 8,
  },
  headerLeft: { flex: 1, gap: 4 },
  missionBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
    backgroundColor: 'rgba(76, 175, 80, 0.12)',
    borderWidth: 1, borderColor: 'rgba(76, 175, 80, 0.35)',
  },
  missionPulse: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: '#4CAF50',
  },
  missionBadgeText: {
    fontSize: 8, fontWeight: '900', color: '#4CAF50', letterSpacing: 2,
  },
  headerTitle: {
    fontSize: 16, fontWeight: '900', color: TACTICAL.text, letterSpacing: 0.5,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  onlineDot: { width: 8, height: 8, borderRadius: 4 },

  segmentedControl: {
    flexDirection: 'row', gap: 4,
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 10,
    padding: 3,
  },
  segment: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 8, borderRadius: 8,
  },
  segmentActive: {
    backgroundColor: 'rgba(76, 175, 80, 0.12)',
    borderWidth: 1, borderColor: 'rgba(76, 175, 80, 0.3)',
  },
  segmentText: {
    fontSize: 7, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 0.8,
  },
  segmentTextActive: { color: '#4CAF50' },

  content: { flex: 1 },

  navigatePlaceholder: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: 12, padding: 24,
  },
  placeholderTitle: {
    fontSize: 14, fontWeight: '900', color: TACTICAL.text, letterSpacing: 2,
  },
  placeholderSub: {
    fontSize: 12, color: TACTICAL.textMuted, textAlign: 'center', lineHeight: 18,
    maxWidth: 280,
  },
  placeholderFeatures: { gap: 8, marginTop: 12 },
  placeholderFeatureRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  placeholderFeatureText: { fontSize: 12, color: TACTICAL.textMuted },
});



