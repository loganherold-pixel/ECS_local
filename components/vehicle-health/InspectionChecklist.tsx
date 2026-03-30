/**
 * Pre-Trip Inspection Checklist
 *
 * Comprehensive vehicle inspection with:
 * - Grouped items by category (Brakes, Lights, Fluids, Tires, etc.)
 * - Pass/Fail/Warning status toggles per item
 * - Critical item highlighting
 * - Overall status computation
 * - Notes per item
 * - Save to database
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput, Alert,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import {
  type InspectionItem,
  type InspectionItemStatus,
  type InspectionOverallStatus,
  computeOverallStatus,
  generateInspectionItems,
} from './MaintenanceTypes';

interface Props {
  items: InspectionItem[];
  onItemsChange: (items: InspectionItem[]) => void;
  onSave: (items: InspectionItem[], overallStatus: InspectionOverallStatus) => void;
  mileage: string;
  onMileageChange: (val: string) => void;
  saving: boolean;
  lastInspectionDate: string | null;
}

const STATUS_CONFIG: Record<InspectionItemStatus, { icon: string; color: string; label: string }> = {
  pending: { icon: 'ellipse-outline', color: TACTICAL.textMuted, label: 'PENDING' },
  pass:    { icon: 'checkmark-circle', color: '#66BB6A', label: 'PASS' },
  fail:    { icon: 'close-circle', color: '#EF5350', label: 'FAIL' },
  warning: { icon: 'warning', color: '#FFB74D', label: 'WARN' },
};

const OVERALL_CONFIG: Record<InspectionOverallStatus, { icon: string; color: string; label: string; bg: string }> = {
  pending: { icon: 'time-outline', color: TACTICAL.textMuted, label: 'IN PROGRESS', bg: 'rgba(0,0,0,0.15)' },
  pass:    { icon: 'shield-checkmark', color: '#66BB6A', label: 'CLEARED', bg: 'rgba(76, 175, 80, 0.08)' },
  fail:    { icon: 'shield-outline', color: '#EF5350', label: 'FAILED — CRITICAL', bg: 'rgba(192, 57, 43, 0.08)' },
  warning: { icon: 'warning-outline', color: '#FFB74D', label: 'WARNINGS FOUND', bg: 'rgba(255, 152, 0, 0.08)' },
};

const CATEGORY_ICONS: Record<string, string> = {
  Brakes: 'hand-left-outline',
  Lights: 'flashlight-outline',
  Fluids: 'water-outline',
  Tires: 'ellipse-outline',
  Drivetrain: 'cog-outline',
  Electrical: 'flash-outline',
  Safety: 'shield-outline',
  Body: 'car-outline',
};

function InspectionItemRow({
  item,
  onStatusChange,
  onNotesChange,
}: {
  item: InspectionItem;
  onStatusChange: (status: InspectionItemStatus) => void;
  onNotesChange: (notes: string) => void;
}) {
  const [showNotes, setShowNotes] = useState(false);
  const statusCfg = STATUS_CONFIG[item.status];

  const cycleStatus = useCallback(() => {
    const order: InspectionItemStatus[] = ['pending', 'pass', 'warning', 'fail'];
    const idx = order.indexOf(item.status);
    const next = order[(idx + 1) % order.length];
    onStatusChange(next);
  }, [item.status, onStatusChange]);

  return (
    <View style={s.itemRow}>
      <View style={s.itemMain}>
        <TouchableOpacity onPress={cycleStatus} style={s.statusBtn} activeOpacity={0.7}>
          <Ionicons name={statusCfg.icon as any} size={20} color={statusCfg.color} />
        </TouchableOpacity>
        <View style={s.itemContent}>
          <View style={s.itemLabelRow}>
            <Text style={[s.itemLabel, item.status === 'fail' && { color: '#EF5350' }]}>
              {item.label}
            </Text>
            {item.isCritical && (
              <View style={s.criticalBadge}>
                <Text style={s.criticalText}>CRIT</Text>
              </View>
            )}
          </View>
          <View style={s.statusPills}>
            {(['pass', 'warning', 'fail'] as InspectionItemStatus[]).map(st => {
              const cfg = STATUS_CONFIG[st];
              const isActive = item.status === st;
              return (
                <TouchableOpacity
                  key={st}
                  style={[s.statusPill, isActive && { backgroundColor: cfg.color + '22', borderColor: cfg.color + '55' }]}
                  onPress={() => onStatusChange(st)}
                  activeOpacity={0.7}
                >
                  <Text style={[s.statusPillText, isActive && { color: cfg.color }]}>{cfg.label}</Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={s.notesToggle}
              onPress={() => setShowNotes(!showNotes)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={item.notes ? 'chatbubble' : 'chatbubble-outline'}
                size={12}
                color={item.notes ? TACTICAL.amber : TACTICAL.textMuted}
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>
      {showNotes && (
        <TextInput
          style={s.notesInput}
          value={item.notes}
          onChangeText={onNotesChange}
          placeholder="Add notes..."
          placeholderTextColor={TACTICAL.textMuted + '55'}
          multiline
        />
      )}
    </View>
  );
}

export default function InspectionChecklist({
  items,
  onItemsChange,
  onSave,
  mileage,
  onMileageChange,
  saving,
  lastInspectionDate,
}: Props) {
  // Group items by category
  const groups = useMemo(() => {
    const map = new Map<string, InspectionItem[]>();
    for (const item of items) {
      const group = map.get(item.category) || [];
      group.push(item);
      map.set(item.category, group);
    }
    return Array.from(map.entries());
  }, [items]);

  const overallStatus = useMemo(() => computeOverallStatus(items), [items]);
  const overallCfg = OVERALL_CONFIG[overallStatus];

  const completedCount = items.filter(i => i.status !== 'pending').length;
  const totalCount = items.length;
  const progressPct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const handleStatusChange = useCallback((itemId: string, status: InspectionItemStatus) => {
    const updated = items.map(i => i.id === itemId ? { ...i, status } : i);
    onItemsChange(updated);
  }, [items, onItemsChange]);

  const handleNotesChange = useCallback((itemId: string, notes: string) => {
    const updated = items.map(i => i.id === itemId ? { ...i, notes } : i);
    onItemsChange(updated);
  }, [items, onItemsChange]);

  const handleReset = useCallback(() => {
    Alert.alert('Reset Inspection', 'Clear all inspection items and start fresh?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: () => onItemsChange(generateInspectionItems()) },
    ]);
  }, [onItemsChange]);

  const handleSetAllPass = useCallback(() => {
    const updated = items.map(i => ({ ...i, status: 'pass' as InspectionItemStatus }));
    onItemsChange(updated);
  }, [items, onItemsChange]);

  const handleSave = useCallback(() => {
    onSave(items, overallStatus);
  }, [items, overallStatus, onSave]);

  return (
    <View style={s.container}>
      {/* Overall status banner */}
      <View style={[s.overallBanner, { backgroundColor: overallCfg.bg, borderColor: overallCfg.color + '33' }]}>
        <Ionicons name={overallCfg.icon as any} size={20} color={overallCfg.color} />
        <View style={s.overallContent}>
          <Text style={[s.overallLabel, { color: overallCfg.color }]}>{overallCfg.label}</Text>
          <Text style={s.overallProgress}>{completedCount}/{totalCount} items checked</Text>
        </View>
        <View style={s.progressBarOuter}>
          <View style={[s.progressBarInner, { width: `${progressPct}%`, backgroundColor: overallCfg.color }]} />
        </View>
      </View>

      {/* Last inspection info */}
      {lastInspectionDate && (
        <View style={s.lastInspRow}>
          <Ionicons name="time-outline" size={11} color={TACTICAL.textMuted} />
          <Text style={s.lastInspText}>
            Last inspection: {new Date(lastInspectionDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </Text>
        </View>
      )}

      {/* Mileage input */}
      <View style={s.mileageRow}>
        <Ionicons name="speedometer-outline" size={14} color={TACTICAL.textMuted} />
        <Text style={s.mileageLabel}>ODOMETER</Text>
        <TextInput
          style={s.mileageInput}
          value={mileage}
          onChangeText={onMileageChange}
          placeholder="miles"
          placeholderTextColor={TACTICAL.textMuted + '55'}
          keyboardType="numeric"
        />
      </View>

      {/* Quick actions */}
      <View style={s.quickActions}>
        <TouchableOpacity style={s.quickBtn} onPress={handleSetAllPass} activeOpacity={0.85}>
          <Ionicons name="checkmark-done" size={12} color="#66BB6A" />
          <Text style={[s.quickBtnText, { color: '#66BB6A' }]}>ALL PASS</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.quickBtn} onPress={handleReset} activeOpacity={0.85}>
          <Ionicons name="refresh" size={12} color={TACTICAL.textMuted} />
          <Text style={s.quickBtnText}>RESET</Text>
        </TouchableOpacity>
      </View>

      {/* Category groups */}
      {groups.map(([category, categoryItems]) => (
        <View key={category} style={s.categoryGroup}>
          <View style={s.categoryHeader}>
            <Ionicons name={(CATEGORY_ICONS[category] || 'cube-outline') as any} size={13} color={TACTICAL.amber} />
            <Text style={s.categoryTitle}>{category.toUpperCase()}</Text>
            <Text style={s.categoryCount}>
              {categoryItems.filter(i => i.status !== 'pending').length}/{categoryItems.length}
            </Text>
          </View>
          {categoryItems.map(item => (
            <InspectionItemRow
              key={item.id}
              item={item}
              onStatusChange={(status) => handleStatusChange(item.id, status)}
              onNotesChange={(notes) => handleNotesChange(item.id, notes)}
            />
          ))}
        </View>
      ))}

      {/* Save button */}
      <TouchableOpacity
        style={[s.saveBtn, saving && { opacity: 0.5 }]}
        onPress={handleSave}
        disabled={saving}
        activeOpacity={0.85}
      >
        <Ionicons name="save-outline" size={16} color="#0B0F12" />
        <Text style={s.saveBtnText}>
          {saving ? 'SAVING...' : 'SAVE INSPECTION'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  container: { marginTop: 4 },
  overallBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  overallContent: { flex: 1 },
  overallLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  overallProgress: { fontSize: 9, color: TACTICAL.textMuted, marginTop: 2, fontFamily: 'Courier' },
  progressBarOuter: {
    width: 50,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.25)',
    overflow: 'hidden',
  },
  progressBarInner: { height: '100%', borderRadius: 2 },
  lastInspRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  lastInspText: { fontSize: 9, color: TACTICAL.textMuted, fontFamily: 'Courier' },
  mileageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.25)',
    marginBottom: 8,
  },
  mileageLabel: { fontSize: 9, fontWeight: '900', color: TACTICAL.textMuted, letterSpacing: 1.5 },
  mileageInput: {
    flex: 1,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '700',
    color: TACTICAL.text,
    fontFamily: 'Courier',
    paddingVertical: 0,
  },
  quickActions: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  quickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.25)',
  },
  quickBtnText: { fontSize: 9, fontWeight: '900', color: TACTICAL.textMuted, letterSpacing: 1 },
  categoryGroup: { marginBottom: 12 },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 79, 60, 0.15)',
  },
  categoryTitle: { fontSize: 10, fontWeight: '900', color: TACTICAL.amber, letterSpacing: 1.5, flex: 1 },
  categoryCount: { fontSize: 9, fontWeight: '700', color: TACTICAL.textMuted, fontFamily: 'Courier' },
  itemRow: {
    marginBottom: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.15)',
    overflow: 'hidden',
  },
  itemMain: { flexDirection: 'row', alignItems: 'center', padding: 8, gap: 8 },
  statusBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  itemContent: { flex: 1 },
  itemLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemLabel: { fontSize: 11, fontWeight: '700', color: TACTICAL.text, flex: 1 },
  criticalBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: 'rgba(192, 57, 43, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(192, 57, 43, 0.3)',
  },
  criticalText: { fontSize: 7, fontWeight: '900', color: '#EF5350', letterSpacing: 1 },
  statusPills: { flexDirection: 'row', gap: 4, marginTop: 4, alignItems: 'center' },
  statusPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.2)',
  },
  statusPillText: { fontSize: 8, fontWeight: '900', color: TACTICAL.textMuted, letterSpacing: 0.8 },
  notesToggle: { marginLeft: 'auto', padding: 4 },
  notesInput: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(62, 79, 60, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 10,
    color: TACTICAL.text,
    minHeight: 32,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: TACTICAL.amber,
    marginTop: 8,
  },
  saveBtnText: { fontSize: 12, fontWeight: '900', color: '#0B0F12', letterSpacing: 1.2 },
});



