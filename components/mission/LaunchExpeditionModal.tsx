// ============================================================
// LAUNCH EXPEDITION MODAL — Confirmation before entering Mission Mode
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, ScrollView, Platform,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import ECSModal from '../ECSModal';
import { TACTICAL } from '../../lib/theme';


interface Props {
  visible: boolean;
  onClose: () => void;
  onLaunch: (name: string) => void;
  vehicleName: string | null;
  loadoutName: string | null;
  itemCount: number;
  criticalCount: number;
  zoneCount: number;
  launching: boolean;
}

export default function LaunchExpeditionModal({
  visible, onClose, onLaunch,
  vehicleName, loadoutName, itemCount, criticalCount, zoneCount,
  launching,
}: Props) {
  const [name, setName] = useState('');

  const defaultName = `Mission ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  const expeditionName = name.trim() || defaultName;

  const handleLaunch = () => {
    onLaunch(expeditionName);
  };

  return (
    <ECSModal visible={visible} onClose={onClose} tier="global">
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons name="rocket-outline" size={24} color="#4CAF50" />
            </View>
            <Text style={styles.headerTitle}>LAUNCH EXPEDITION?</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} disabled={launching}>
              <Ionicons name="close" size={22} color={TACTICAL.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            <View style={styles.warningBox}>
              <Ionicons name="information-circle-outline" size={18} color={TACTICAL.amber} />
              <Text style={styles.warningText}>
                This will snapshot your current loadout and enter Mission Mode. Planning configuration will be locked during the mission.
              </Text>
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>MISSION NAME</Text>
              <TextInput
                style={styles.fieldInput}
                value={name}
                onChangeText={setName}
                placeholder={defaultName}
                placeholderTextColor={TACTICAL.textMuted}
              />
            </View>

            <View style={styles.snapshotPreview}>
              <Text style={styles.snapshotTitle}>SNAPSHOT CONTENTS</Text>
              <View style={styles.snapshotGrid}>
                <View style={styles.snapshotItem}>
                  <Ionicons name="car-sport" size={16} color={TACTICAL.amber} />
                  <Text style={styles.snapshotLabel}>VEHICLE</Text>
                  <Text style={styles.snapshotValue} numberOfLines={1}>{vehicleName || 'N/A'}</Text>
                </View>
                <View style={styles.snapshotItem}>
                  <Ionicons name="cube" size={16} color="#4CAF50" />
                  <Text style={styles.snapshotLabel}>ITEMS</Text>
                  <Text style={styles.snapshotValue}>{itemCount}</Text>
                </View>
                <View style={styles.snapshotItem}>
                  <Ionicons name="alert-circle" size={16} color={TACTICAL.danger} />
                  <Text style={styles.snapshotLabel}>CRITICAL</Text>
                  <Text style={styles.snapshotValue}>{criticalCount}</Text>
                </View>
                <View style={styles.snapshotItem}>
                  <Ionicons name="grid" size={16} color="#4FC3F7" />
                  <Text style={styles.snapshotLabel}>ZONES</Text>
                  <Text style={styles.snapshotValue}>{zoneCount}</Text>
                </View>
              </View>
            </View>

            <View style={styles.infoSection}>
              <Text style={styles.infoTitle}>WHAT HAPPENS ON LAUNCH</Text>
              {[
                { icon: 'camera-outline', text: 'Loadout snapshot is frozen' },
                { icon: 'shield-checkmark-outline', text: 'Mission Mode activates' },
                { icon: 'lock-closed-outline', text: 'Planning config is locked' },
                { icon: 'journal-outline', text: 'Mission log begins recording' },
              ].map((item, i) => (
                <View key={i} style={styles.infoRow}>
                  <Ionicons name={item.icon as any} size={14} color={TACTICAL.textMuted} />
                  <Text style={styles.infoText}>{item.text}</Text>
                </View>
              ))}
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={launching} activeOpacity={0.7}>
              <Text style={styles.cancelBtnText}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.launchBtn, launching && { opacity: 0.6 }]} onPress={handleLaunch} disabled={launching} activeOpacity={0.85}>
              {launching ? (
                <ActivityIndicator size="small" color="#0B0F12" />
              ) : (
                <>
                  <Ionicons name="rocket" size={16} color="#0B0F12" />
                  <Text style={styles.launchBtnText}>LAUNCH</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </ECSModal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',

    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '85%',
    backgroundColor: TACTICAL.panel,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(76, 175, 80, 0.4)',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: TACTICAL.border,
  },
  headerIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(76, 175, 80, 0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 15, fontWeight: '900',
    color: '#4CAF50', letterSpacing: 1.5,
  },
  closeBtn: { padding: 4 },
  body: { padding: 16, maxHeight: 400 },
  warningBox: {
    flexDirection: 'row', gap: 10, padding: 12,
    backgroundColor: 'rgba(196, 138, 44, 0.08)',
    borderRadius: 10, borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.25)',
    marginBottom: 16,
  },
  warningText: {
    flex: 1, fontSize: 12, color: TACTICAL.textMuted,
    lineHeight: 18,
  },
  field: { marginBottom: 16 },
  fieldLabel: {
    fontSize: 10, fontWeight: '800', color: TACTICAL.amber,
    letterSpacing: 1.5, marginBottom: 8,
  },
  fieldInput: {
    backgroundColor: TACTICAL.bg, borderWidth: 1,
    borderColor: TACTICAL.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    color: TACTICAL.text, fontSize: 15, fontWeight: '600',
  },
  snapshotPreview: {
    backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 12,
    padding: 14, marginBottom: 16,
    borderWidth: 1, borderColor: TACTICAL.border,
  },
  snapshotTitle: {
    fontSize: 9, fontWeight: '800', color: TACTICAL.textMuted,
    letterSpacing: 2, marginBottom: 10,
  },
  snapshotGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
  },
  snapshotItem: {
    flex: 1, minWidth: '40%', alignItems: 'center',
    gap: 4, padding: 10, borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderWidth: 1, borderColor: 'rgba(62,79,60,0.2)',
  },
  snapshotLabel: {
    fontSize: 8, fontWeight: '800', color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  snapshotValue: {
    fontSize: 14, fontWeight: '900', color: TACTICAL.text,
    fontFamily: 'Courier',
  },
  infoSection: {
    gap: 8, marginBottom: 8,
  },
  infoTitle: {
    fontSize: 9, fontWeight: '800', color: TACTICAL.textMuted,
    letterSpacing: 2, marginBottom: 4,
  },
  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 4,
  },
  infoText: {
    fontSize: 12, color: TACTICAL.textMuted,
  },
  actions: {
    flexDirection: 'row', gap: 10, padding: 16,
    borderTopWidth: 1, borderTopColor: TACTICAL.border,
  },
  cancelBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: 12,
    borderWidth: 1, borderColor: TACTICAL.border,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  cancelBtnText: {
    fontSize: 12, fontWeight: '800', color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  launchBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 12,
    backgroundColor: '#4CAF50',
  },
  launchBtnText: {
    fontSize: 13, fontWeight: '900', color: '#0B0F12',
    letterSpacing: 1.5,
  },
});



