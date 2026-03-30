/**
 * Vehicle Health Panel
 *
 * Main container for the Vehicle Health & Maintenance feature.
 * Contains sub-tabs:
 *   - TIMELINE: Chronological maintenance log
 *   - REMINDERS: Upcoming service reminders
 *   - INSPECTION: Pre-trip inspection checklist
 */
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import {
  fetchMaintenanceLogs,
  createMaintenanceLog,
  deleteMaintenanceLog,
  fetchInspections,
  saveInspection,
  computeServiceReminders,
} from '../../lib/maintenanceStore';
import type {
  MaintenanceLog,
  MaintenanceLogInsert,
  InspectionChecklist as InspectionChecklistType,
  InspectionItem,
  InspectionOverallStatus,
  ServiceReminder,
} from './MaintenanceTypes';
import { generateInspectionItems } from './MaintenanceTypes';
import MaintenanceTimeline from './MaintenanceTimeline';
import ServiceReminders from './ServiceReminders';
import InspectionChecklist from './InspectionChecklist';
import AddMaintenanceModal from './AddMaintenanceModal';

type SubTab = 'timeline' | 'reminders' | 'inspection';

interface Props {
  vehicleId: string;
  expeditionId?: string;
}

export default function VehicleHealthPanel({ vehicleId, expeditionId }: Props) {
  const { user, showToast } = useApp();
  const [subTab, setSubTab] = useState<SubTab>('timeline');
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<MaintenanceLog[]>([]);
  const [inspections, setInspections] = useState<InspectionChecklistType[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);

  // Inspection state
  const [inspectionItems, setInspectionItems] = useState<InspectionItem[]>(generateInspectionItems);
  const [inspectionMileage, setInspectionMileage] = useState('');
  const [savingInspection, setSavingInspection] = useState(false);

  // Derive current mileage from most recent log
  const currentMileage = useMemo(() => {
    const withMileage = logs.filter(l => l.mileage != null);
    if (withMileage.length === 0) return null;
    return withMileage.reduce((max, l) => (l.mileage! > max ? l.mileage! : max), 0);
  }, [logs]);

  // Compute service reminders
  const reminders = useMemo<ServiceReminder[]>(
    () => computeServiceReminders(logs, currentMileage),
    [logs, currentMileage]
  );

  // Last inspection date
  const lastInspectionDate = useMemo(() => {
    if (inspections.length === 0) return null;
    return inspections[0].inspection_date;
  }, [inspections]);

  // Stats for header
  const overdueCount = reminders.filter(r => r.urgency === 'overdue').length;
  const totalCost = useMemo(() => logs.reduce((sum, l) => sum + (l.cost_cents || 0), 0), [logs]);

  // ── Data fetching ─────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!user?.id || !vehicleId) return;
    setLoading(true);
    try {
      const [fetchedLogs, fetchedInspections] = await Promise.all([
        fetchMaintenanceLogs(vehicleId, user.id),
        fetchInspections(vehicleId, user.id),
      ]);
      setLogs(fetchedLogs);
      setInspections(fetchedInspections);
    } catch (err) {
      console.error('[VehicleHealth] load error:', err);
    }
    setLoading(false);
  }, [user?.id, vehicleId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Handlers ──────────────────────────────────────────────
  const handleAddLog = useCallback(async (insert: MaintenanceLogInsert) => {
    const result = await createMaintenanceLog(insert);
    if (result) {
      setLogs(prev => [result, ...prev]);
      showToast('Maintenance logged');
      setShowAddModal(false);
    } else {
      Alert.alert('Error', 'Failed to save maintenance log');
    }
  }, [showToast]);

  const handleDeleteLog = useCallback(async (logId: string) => {
    const success = await deleteMaintenanceLog(logId, vehicleId);
    if (success) {
      setLogs(prev => prev.filter(l => l.id !== logId));
      showToast('Log deleted');
    }
  }, [vehicleId, showToast]);

  const handleSaveInspection = useCallback(async (items: InspectionItem[], overallStatus: InspectionOverallStatus) => {
    if (!user?.id) return;
    setSavingInspection(true);
    const result = await saveInspection({
      vehicle_id: vehicleId,
      owner_user_id: user.id,
      expedition_id: expeditionId || null,
      inspection_date: new Date().toISOString(),
      overall_status: overallStatus,
      mileage: inspectionMileage ? parseInt(inspectionMileage, 10) : null,
      items,
      completed_at: overallStatus !== 'pending' ? new Date().toISOString() : null,
    });
    setSavingInspection(false);
    if (result) {
      setInspections(prev => [result, ...prev.filter(i => i.id !== result.id)]);
      showToast('Inspection saved');
    } else {
      Alert.alert('Error', 'Failed to save inspection');
    }
  }, [user?.id, vehicleId, expeditionId, inspectionMileage, showToast]);

  if (!user?.id) return null;

  return (
    <View style={s.container}>
      {/* Section header */}
      <View style={s.sectionHeader}>
        <View style={s.sectionHeaderIcon}>
          <Ionicons name="medical-outline" size={14} color={TACTICAL.amber} />
        </View>
        <View style={s.sectionHeaderContent}>
          <Text style={s.sectionTitle}>VEHICLE HEALTH</Text>
          <View style={s.sectionStats}>
            <Text style={s.sectionStat}>{logs.length} records</Text>
            {overdueCount > 0 && (
              <View style={s.overdueBadge}>
                <Ionicons name="alert-circle" size={9} color="#EF5350" />
                <Text style={s.overdueBadgeText}>{overdueCount} OVERDUE</Text>
              </View>
            )}
            {totalCost > 0 && (
              <Text style={s.sectionStat}>${(totalCost / 100).toFixed(0)} total</Text>
            )}
          </View>
        </View>
        <TouchableOpacity
          style={s.addBtn}
          onPress={() => setShowAddModal(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={18} color={TACTICAL.amber} />
        </TouchableOpacity>
      </View>

      {/* Sub-tabs */}
      <View style={s.subTabsRow}>
        {([
          { key: 'timeline', label: 'TIMELINE', icon: 'time-outline' },
          { key: 'reminders', label: 'REMINDERS', icon: 'notifications-outline' },
          { key: 'inspection', label: 'INSPECTION', icon: 'clipboard-outline' },
        ] as { key: SubTab; label: string; icon: string }[]).map(tab => {
          const isActive = subTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[s.subTab, isActive && s.subTabActive]}
              onPress={() => setSubTab(tab.key)}
              activeOpacity={0.85}
            >
              <Ionicons
                name={tab.icon as any}
                size={12}
                color={isActive ? TACTICAL.amber : TACTICAL.textMuted}
              />
              <Text style={[s.subTabText, isActive && s.subTabTextActive]}>
                {tab.label}
              </Text>
              {tab.key === 'reminders' && overdueCount > 0 && (
                <View style={s.subTabBadge}>
                  <Text style={s.subTabBadgeText}>{overdueCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Content */}
      {loading ? (
        <View style={s.loadingContainer}>
          <ActivityIndicator size="small" color={TACTICAL.amber} />
          <Text style={s.loadingText}>Loading maintenance data...</Text>
        </View>
      ) : (
        <View style={s.content}>
          {subTab === 'timeline' && (
            <MaintenanceTimeline
              logs={logs}
              onDelete={handleDeleteLog}
              onAddNew={() => setShowAddModal(true)}
            />
          )}
          {subTab === 'reminders' && (
            <ServiceReminders
              reminders={reminders}
              currentMileage={currentMileage}
            />
          )}
          {subTab === 'inspection' && (
            <InspectionChecklist
              items={inspectionItems}
              onItemsChange={setInspectionItems}
              onSave={handleSaveInspection}
              mileage={inspectionMileage}
              onMileageChange={setInspectionMileage}
              saving={savingInspection}
              lastInspectionDate={lastInspectionDate}
            />
          )}
        </View>
      )}

      {/* Add Maintenance Modal */}
      <AddMaintenanceModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={handleAddLog}
        vehicleId={vehicleId}
        userId={user.id}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    marginTop: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.35)',
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 79, 60, 0.18)',
  },
  sectionHeaderIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(196, 138, 44, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.25)',
  },
  sectionHeaderContent: { flex: 1 },
  sectionTitle: { fontSize: 12, fontWeight: '900', color: TACTICAL.amber, letterSpacing: 1.5 },
  sectionStats: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  sectionStat: { fontSize: 9, color: TACTICAL.textMuted, fontFamily: 'Courier' },
  overdueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: 'rgba(192, 57, 43, 0.12)',
  },
  overdueBadgeText: { fontSize: 8, fontWeight: '900', color: '#EF5350', letterSpacing: 0.8 },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(196, 138, 44, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.3)',
  },
  subTabsRow: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 79, 60, 0.12)',
  },
  subTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  subTabActive: {
    backgroundColor: 'rgba(196, 138, 44, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.25)',
  },
  subTabText: { fontSize: 8, fontWeight: '900', color: TACTICAL.textMuted, letterSpacing: 1.2 },
  subTabTextActive: { color: TACTICAL.amber },
  subTabBadge: {
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF5350',
  },
  subTabBadgeText: { fontSize: 7, fontWeight: '900', color: '#fff' },
  content: { padding: 12 },
  loadingContainer: {
    padding: 30,
    alignItems: 'center',
    gap: 8,
  },
  loadingText: { fontSize: 10, color: TACTICAL.textMuted },
});






