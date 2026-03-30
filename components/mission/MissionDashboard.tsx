// ============================================================
// MISSION DASHBOARD — Active expedition overview
// ============================================================
// Integrates Vehicle Systems Telemetry widget at top when
// expedition is active. All other dashboard sections below.
// ============================================================
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  TextInput, Animated, ScrollView,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import type { MissionExpedition, MissionStats, ExpeditionItem, ExpeditionEvent } from '../../lib/missionTypes';
import {
  missionItemStore,
  missionEventStore,
  missionNoteStore,
  missionCheckpointStore,
  computeMissionStats,
} from '../../lib/missionStore';
import VehicleTelemetry from './VehicleTelemetry';

interface Props {
  expedition: MissionExpedition;
  isOnline: boolean;
  onRefresh: () => void;
  onEndMission: () => void;
}

export default function MissionDashboard({ expedition, isOnline, onRefresh, onEndMission }: Props) {
  const [stats, setStats] = useState<MissionStats | null>(null);
  const [criticalIssues, setCriticalIssues] = useState<ExpeditionItem[]>([]);
  const [recentEvents, setRecentEvents] = useState<ExpeditionEvent[]>([]);
  const [noteText, setNoteText] = useState('');
  const [checkpointLabel, setCheckpointLabel] = useState('');
  const [quickActionMode, setQuickActionMode] = useState<'none' | 'note' | 'checkpoint' | 'water'>('none');
  const [waterQty, setWaterQty] = useState('0.5');
  const pulseAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 1500, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  useEffect(() => {
    refreshData();
  }, [expedition.id]);

  const refreshData = useCallback(() => {
    const s = computeMissionStats(expedition.id);
    setStats(s);
    const items = missionItemStore.getByExpeditionId(expedition.id);
    setCriticalIssues(items.filter(i => i.critical && (i.status === 'missing' || i.status === 'lost')));
    setRecentEvents(missionEventStore.getByExpeditionId(expedition.id).slice(0, 8));
    onRefresh();
  }, [expedition.id, onRefresh]);

  const handleTelemetryUpdate = useCallback(() => {
    // Refresh events and stats after telemetry logging
    const s = computeMissionStats(expedition.id);
    setStats(s);
    setRecentEvents(missionEventStore.getByExpeditionId(expedition.id).slice(0, 8));
  }, [expedition.id]);

  const handleAddNote = () => {
    if (!noteText.trim()) return;
    missionNoteStore.create(expedition.id, noteText.trim());
    missionEventStore.append(expedition.id, 'NOTE_ADDED', { text: noteText.trim() });
    setNoteText('');
    setQuickActionMode('none');
    refreshData();
  };

  const handleAddCheckpoint = () => {
    if (!checkpointLabel.trim()) return;
    missionCheckpointStore.create(expedition.id, checkpointLabel.trim());
    missionEventStore.append(expedition.id, 'CHECKPOINT', { label: checkpointLabel.trim() });
    setCheckpointLabel('');
    setQuickActionMode('none');
    refreshData();
  };

  const handleLogWater = () => {
    const liters = parseFloat(waterQty) || 0;
    if (liters <= 0) return;
    missionEventStore.append(expedition.id, 'WATER_USED', { liters });
    setWaterQty('0.5');
    setQuickActionMode('none');
    refreshData();
  };

  const hasCritical = criticalIssues.length > 0;
  const elapsed = stats?.elapsedHours || 0;
  const elapsedStr = elapsed < 1 ? `${Math.round(elapsed * 60)}m` : elapsed < 24 ? `${elapsed.toFixed(1)}h` : `${(elapsed / 24).toFixed(1)}d`;

  // Event icon/color mapping for richer activity feed
  const getEventMeta = (type: string): { icon: string; color: string } => {
    switch (type) {
      case 'EXPEDITION_LAUNCHED': return { icon: 'rocket-outline', color: '#4CAF50' };
      case 'FUEL_LOGGED': return { icon: 'flame-outline', color: '#FF9500' };
      case 'WATER_USED': return { icon: 'water-outline', color: '#4FC3F7' };
      case 'POWER_UPDATED': return { icon: 'flash-outline', color: '#7C4DFF' };
      case 'POWER_CONFIGURED': return { icon: 'flash-outline', color: '#7C4DFF' };
      case 'NOTE_ADDED': return { icon: 'create-outline', color: TACTICAL.amber };
      case 'CHECKPOINT': return { icon: 'flag-outline', color: '#4FC3F7' };
      case 'ITEM_USED': return { icon: 'cube-outline', color: TACTICAL.amber };
      case 'ITEM_CONSUMED': return { icon: 'checkmark-done-outline', color: '#4CAF50' };
      case 'ITEM_LOST': return { icon: 'alert-circle-outline', color: '#E53935' };
      case 'ITEM_DEPLOYED': return { icon: 'arrow-forward-outline', color: '#4FC3F7' };
      default: return { icon: 'ellipse-outline', color: TACTICAL.textMuted };
    }
  };

  const getEventDescription = (event: ExpeditionEvent): string => {
    const p = event.payload || {};
    switch (event.type) {
      case 'FUEL_LOGGED':
        return `Fuel ${p.mode === 'added' ? 'added' : 'used'}: ${p.gallons}gal (${p.remainingGal?.toFixed(1)}gal remaining)`;
      case 'WATER_USED':
        return `Water used: ${p.liters}L${p.remainingL !== undefined ? ` (${p.remainingL.toFixed(1)}L remaining)` : ''}`;
      case 'POWER_UPDATED':
        return `Power logged${p.percentUsed ? `: ${p.percentUsed}% used` : ''}`;
      case 'POWER_CONFIGURED':
        return `Power configured: ${p.capacityWh}Wh / ${p.avgDrawW}W draw`;
      case 'NOTE_ADDED':
        return p.text ? `"${p.text.substring(0, 40)}${p.text.length > 40 ? '...' : ''}"` : 'Note added';
      case 'CHECKPOINT':
        return p.label || 'Checkpoint logged';
      case 'EXPEDITION_LAUNCHED':
        return `Mission launched with ${p.itemCount || 0} items`;
      default:
        return event.type.replace(/_/g, ' ');
    }
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Mission Header */}
      <View style={styles.missionHeader}>
        <View style={styles.missionHeaderLeft}>
          <Text style={styles.missionName} numberOfLines={1}>{expedition.name}</Text>
          <View style={styles.statusRow}>
            <Animated.View style={[styles.pulseDot, { opacity: pulseAnim }]} />
            <Text style={styles.statusText}>ACTIVE</Text>
            <View style={[styles.onlineBadge, { backgroundColor: isOnline ? 'rgba(76,175,80,0.15)' : 'rgba(229,57,53,0.15)' }]}>
              <View style={[styles.onlineDot, { backgroundColor: isOnline ? '#4CAF50' : '#E53935' }]} />
              <Text style={[styles.onlineText, { color: isOnline ? '#4CAF50' : '#E53935' }]}>
                {isOnline ? 'ONLINE' : 'OFFLINE'}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.elapsedBadge}>
          <Ionicons name="time-outline" size={12} color={TACTICAL.textMuted} />
          <Text style={styles.elapsedText}>{elapsedStr}</Text>
        </View>
      </View>

      {/* ═══════════════════════════════════════════════════════
          VEHICLE SYSTEMS — MISSION TELEMETRY (Primary Widget)
          Positioned immediately under mission header
          ═══════════════════════════════════════════════════════ */}
      {expedition.status === 'active' && (
        <VehicleTelemetry
          expedition={expedition}
          isOnline={isOnline}
          onTelemetryUpdate={handleTelemetryUpdate}
        />
      )}

      {/* Readiness Integrity Card */}
      <View style={[styles.card, hasCritical ? styles.cardDanger : styles.cardGreen]}>
        <View style={styles.cardHeader}>
          <Ionicons
            name={hasCritical ? 'alert-circle' : 'shield-checkmark'}
            size={20}
            color={hasCritical ? '#E53935' : '#4CAF50'}
          />
          <Text style={[styles.cardTitle, { color: hasCritical ? '#E53935' : '#4CAF50' }]}>
            {hasCritical ? 'CRITICAL ISSUES DETECTED' : 'MISSION READY'}
          </Text>
        </View>
        {hasCritical ? (
          <View style={styles.criticalList}>
            {criticalIssues.slice(0, 3).map(item => (
              <View key={item.id} style={styles.criticalRow}>
                <Ionicons name="alert-circle" size={14} color="#E53935" />
                <Text style={styles.criticalText}>{item.name}</Text>
                <Text style={styles.criticalStatus}>{item.status.toUpperCase()}</Text>
              </View>
            ))}
            {criticalIssues.length > 3 && (
              <Text style={styles.criticalMore}>+{criticalIssues.length - 3} more</Text>
            )}
          </View>
        ) : (
          <Text style={styles.readySubtext}>All critical items accounted for. No integrity issues.</Text>
        )}
      </View>

      {/* Stats Grid */}
      {stats && (
        <View style={styles.statsGrid}>
          {[
            { label: 'ITEMS', value: stats.totalItems, icon: 'cube-outline', color: TACTICAL.text },
            { label: 'PACKED', value: stats.packedItems, icon: 'checkmark-circle-outline', color: '#4CAF50' },
            { label: 'USED', value: stats.usedItems + stats.consumedItems, icon: 'swap-horizontal-outline', color: TACTICAL.amber },
            { label: 'CRITICAL', value: stats.criticalMissing, icon: 'alert-circle-outline', color: stats.criticalMissing > 0 ? '#E53935' : '#4CAF50' },
          ].map((s, i) => (
            <View key={i} style={styles.statCard}>
              <Ionicons name={s.icon as any} size={16} color={s.color} />
              <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Consumables Summary */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="water-outline" size={18} color="#4FC3F7" />
          <Text style={styles.cardTitle}>CONSUMABLES</Text>
        </View>
        <View style={styles.consumablesRow}>
          <View style={styles.consumableItem}>
            <Text style={styles.consumableValue}>{stats?.waterUsedLiters.toFixed(1) || '0.0'}L</Text>
            <Text style={styles.consumableLabel}>WATER USED</Text>
          </View>
          <View style={styles.consumableDivider} />
          <View style={styles.consumableItem}>
            <Text style={styles.consumableValue}>{stats?.eventCount || 0}</Text>
            <Text style={styles.consumableLabel}>EVENTS</Text>
          </View>
          <View style={styles.consumableDivider} />
          <View style={styles.consumableItem}>
            <Text style={styles.consumableValue}>{stats?.checkpointCount || 0}</Text>
            <Text style={styles.consumableLabel}>CHECKPOINTS</Text>
          </View>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.quickActionsSection}>
        <Text style={styles.sectionTitle}>QUICK ACTIONS</Text>
        <View style={styles.quickActionsRow}>
          {[
            { key: 'note', icon: 'create-outline', label: 'NOTE', color: TACTICAL.amber },
            { key: 'checkpoint', icon: 'flag-outline', label: 'CHECKPOINT', color: '#4FC3F7' },
            { key: 'water', icon: 'water-outline', label: 'LOG WATER', color: '#4CAF50' },
          ].map(action => (
            <TouchableOpacity
              key={action.key}
              style={[
                styles.quickActionBtn,
                quickActionMode === action.key && { borderColor: action.color, backgroundColor: `${action.color}12` },
              ]}
              onPress={() => setQuickActionMode(quickActionMode === action.key ? 'none' : action.key as any)}
              activeOpacity={0.7}
            >
              <Ionicons name={action.icon as any} size={18} color={action.color} />
              <Text style={[styles.quickActionLabel, { color: action.color }]}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Quick Action Input */}
        {quickActionMode === 'note' && (
          <View style={styles.quickInput}>
            <TextInput
              style={styles.quickInputField}
              value={noteText}
              onChangeText={setNoteText}
              placeholder="Enter field note..."
              placeholderTextColor={TACTICAL.textMuted}
              multiline
            />
            <TouchableOpacity style={styles.quickSubmitBtn} onPress={handleAddNote}>
              <Ionicons name="send" size={16} color="#0B0F12" />
            </TouchableOpacity>
          </View>
        )}
        {quickActionMode === 'checkpoint' && (
          <View style={styles.quickInput}>
            <TextInput
              style={styles.quickInputField}
              value={checkpointLabel}
              onChangeText={setCheckpointLabel}
              placeholder="Checkpoint label..."
              placeholderTextColor={TACTICAL.textMuted}
            />
            <TouchableOpacity style={styles.quickSubmitBtn} onPress={handleAddCheckpoint}>
              <Ionicons name="flag" size={16} color="#0B0F12" />
            </TouchableOpacity>
          </View>
        )}
        {quickActionMode === 'water' && (
          <View style={styles.quickInput}>
            <View style={styles.waterRow}>
              {['0.25', '0.5', '1.0', '2.0'].map(val => (
                <TouchableOpacity
                  key={val}
                  style={[styles.waterChip, waterQty === val && styles.waterChipActive]}
                  onPress={() => setWaterQty(val)}
                >
                  <Text style={[styles.waterChipText, waterQty === val && styles.waterChipTextActive]}>{val}L</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={[styles.quickSubmitBtn, { backgroundColor: '#4CAF50' }]} onPress={handleLogWater}>
              <Ionicons name="checkmark" size={16} color="#0B0F12" />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Recent Activity — Enhanced with event details */}
      {recentEvents.length > 0 && (
        <View style={styles.recentSection}>
          <Text style={styles.sectionTitle}>RECENT ACTIVITY</Text>
          {recentEvents.map(event => {
            const meta = getEventMeta(event.type);
            const desc = getEventDescription(event);
            return (
              <View key={event.id} style={styles.eventRow}>
                <View style={[styles.eventIconWrap, { backgroundColor: `${meta.color}12` }]}>
                  <Ionicons name={meta.icon as any} size={12} color={meta.color} />
                </View>
                <View style={styles.eventContent}>
                  <View style={styles.eventContentTop}>
                    <Text style={[styles.eventType, { color: meta.color }]}>
                      {event.type.replace(/_/g, ' ')}
                    </Text>
                    <Text style={styles.eventTime}>
                      {new Date(event.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  <Text style={styles.eventDesc} numberOfLines={2}>{desc}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* End Mission */}
      <TouchableOpacity style={styles.endMissionBtn} onPress={onEndMission} activeOpacity={0.8}>
        <Ionicons name="stop-circle-outline" size={18} color={TACTICAL.danger} />
        <Text style={styles.endMissionText}>END MISSION</Text>
      </TouchableOpacity>

      <View style={{ height: 120 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  missionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingVertical: 12,
  },
  missionHeaderLeft: { flex: 1, gap: 6 },
  missionName: { fontSize: 18, fontWeight: '900', color: TACTICAL.text, letterSpacing: 0.5 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pulseDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4CAF50' },
  statusText: { fontSize: 10, fontWeight: '900', color: '#4CAF50', letterSpacing: 2 },
  onlineBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  onlineDot: { width: 5, height: 5, borderRadius: 3 },
  onlineText: { fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  elapsedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.3)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
  },
  elapsedText: { fontSize: 12, fontWeight: '800', color: TACTICAL.text, fontFamily: 'Courier' },

  card: {
    backgroundColor: 'rgba(0,0,0,0.18)', borderRadius: 14,
    borderWidth: 1, borderColor: TACTICAL.border, padding: 14, marginBottom: 12,
  },
  cardGreen: { borderColor: 'rgba(76,175,80,0.35)', backgroundColor: 'rgba(76,175,80,0.04)' },
  cardDanger: { borderColor: 'rgba(229,57,53,0.35)', backgroundColor: 'rgba(229,57,53,0.04)' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  cardTitle: { fontSize: 12, fontWeight: '900', color: TACTICAL.text, letterSpacing: 1.5 },

  criticalList: { gap: 6 },
  criticalRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  criticalText: { flex: 1, fontSize: 12, fontWeight: '700', color: TACTICAL.text },
  criticalStatus: { fontSize: 9, fontWeight: '800', color: '#E53935', letterSpacing: 1 },
  criticalMore: { fontSize: 10, color: TACTICAL.textMuted, fontStyle: 'italic', marginTop: 4 },
  readySubtext: { fontSize: 12, color: TACTICAL.textMuted, lineHeight: 18 },

  statsGrid: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statCard: {
    flex: 1, alignItems: 'center', gap: 4, padding: 12,
    backgroundColor: 'rgba(0,0,0,0.18)', borderRadius: 12,
    borderWidth: 1, borderColor: TACTICAL.border,
  },
  statValue: { fontSize: 18, fontWeight: '900', fontFamily: 'Courier' },
  statLabel: { fontSize: 7, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 1.2 },

  consumablesRow: { flexDirection: 'row', alignItems: 'center' },
  consumableItem: { flex: 1, alignItems: 'center', gap: 4 },
  consumableValue: { fontSize: 16, fontWeight: '900', color: TACTICAL.text, fontFamily: 'Courier' },
  consumableLabel: { fontSize: 8, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 1 },
  consumableDivider: { width: 1, height: 30, backgroundColor: TACTICAL.border },

  quickActionsSection: { marginBottom: 12 },
  sectionTitle: { fontSize: 9, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 2, marginBottom: 10 },
  quickActionsRow: { flexDirection: 'row', gap: 8 },
  quickActionBtn: {
    flex: 1, alignItems: 'center', gap: 6, padding: 12,
    borderRadius: 12, borderWidth: 1, borderColor: TACTICAL.border,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  quickActionLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },

  quickInput: {
    flexDirection: 'row', gap: 8, marginTop: 10,
    alignItems: 'flex-end',
  },
  quickInputField: {
    flex: 1, backgroundColor: TACTICAL.bg, borderWidth: 1,
    borderColor: TACTICAL.border, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    color: TACTICAL.text, fontSize: 14, maxHeight: 80,
  },
  quickSubmitBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: TACTICAL.amber, alignItems: 'center', justifyContent: 'center',
  },

  waterRow: { flex: 1, flexDirection: 'row', gap: 6 },
  waterChip: {
    flex: 1, alignItems: 'center', paddingVertical: 10,
    borderRadius: 8, borderWidth: 1, borderColor: TACTICAL.border,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  waterChipActive: { borderColor: '#4CAF50', backgroundColor: 'rgba(76,175,80,0.12)' },
  waterChipText: { fontSize: 12, fontWeight: '800', color: TACTICAL.textMuted },
  waterChipTextActive: { color: '#4CAF50' },

  recentSection: { marginBottom: 16 },
  eventRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(62,79,60,0.15)',
  },
  eventIconWrap: {
    width: 26, height: 26, borderRadius: 7,
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  eventContent: { flex: 1, gap: 2 },
  eventContentTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eventType: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  eventTime: { fontSize: 9, color: TACTICAL.textMuted, fontFamily: 'Courier' },
  eventDesc: { fontSize: 11, color: TACTICAL.textMuted, lineHeight: 15 },

  endMissionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 12, borderWidth: 1,
    borderColor: 'rgba(229,57,53,0.3)', backgroundColor: 'rgba(229,57,53,0.06)',
    marginTop: 8,
  },
  endMissionText: { fontSize: 12, fontWeight: '800', color: TACTICAL.danger, letterSpacing: 1.5 },
});



