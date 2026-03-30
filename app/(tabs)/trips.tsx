import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Alert, Modal, Platform } from 'react-native';
import { SafeIcon as Ionicons } from '../../components/SafeIcon';
import TabErrorBoundary from '../../components/TabErrorBoundary';


import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, SPACING, RADIUS, SHADOWS, TERRAIN_TYPES, SEASONS, MODES } from '../../lib/theme';
import { useApp } from '../../context/AppContext';
import { tripStore, loadItemStore, riskScoreStore, fuelWaterLogStore, loadMapSlotStore, generateUUID, nowISO } from '../../lib/storage';
import { Trip } from '../../lib/types';
import { calculateKPIs } from '../../lib/calculations';
import Header from '../../components/Header';
import AuthModal from '../../components/AuthModal';
import Toast from '../../components/Toast';
import KPICard from '../../components/KPICard';
import DatePickerField from '../../components/DatePickerField';
import VehicleDropdown from '../../components/VehicleDropdown';

function TripsScreenInner() {
  const router = useRouter();
  const { trips, activeTrip, refreshTrips, setActiveTripId, refreshActiveTrip, showToast } = useApp();
  const [authVisible, setAuthVisible] = useState(false);
  const [profileTrip, setProfileTrip] = useState<Trip | null>(null);
  const [editFields, setEditFields] = useState<Partial<Trip>>({});

  useFocusEffect(useCallback(() => { refreshTrips(); }, []));

  const createTrip = async () => {
    try {
      const trip = await tripStore.create({ name: 'New Trip' });
      // Seed all 173 load map slots for the new trip
      try {
        await loadMapSlotStore.seedForTrip(trip.id);
      } catch (seedErr) {
        console.warn('[TRIPS] Slot seeding failed (non-blocking):', seedErr);
      }
      await refreshTrips();
      await setActiveTripId(trip.id);
      showToast('Trip created');
    } catch (err) {
      console.error('[TRIPS] Create trip failed:', err);
      showToast('Failed to create trip');
    }
  };


  const duplicateTrip = async (trip: Trip) => {
    try {
      const newTrip = await tripStore.create({
        ...trip,
        name: `${trip.name} (Copy)`,
      });
      // Copy load items
      const items = await loadItemStore.getByTripId(trip.id);
      for (const item of items) {
        await loadItemStore.create({ ...item, trip_id: newTrip.id, id: undefined as any });
      }
      // Copy risk scores
      const rs = await riskScoreStore.getByTripId(trip.id);
      if (rs) {
        await riskScoreStore.upsert(newTrip.id, { ...rs, trip_id: newTrip.id });
      }
      // Copy fuel/water logs
      const logs = await fuelWaterLogStore.getByTripId(trip.id);
      for (const log of logs) {
        await fuelWaterLogStore.create({ ...log, trip_id: newTrip.id, id: undefined as any });
      }
      // Seed slots for new trip, then copy assignments from source
      try {
        await loadMapSlotStore.seedForTrip(newTrip.id);
        const sourceSlots = await loadMapSlotStore.getByTripId(trip.id);
        for (const slot of sourceSlots) {
          if (slot.load_item_id) {
            const sourceItem = items.find(i => i.id === slot.load_item_id);
            if (sourceItem) {
              const newItems = await loadItemStore.getByTripId(newTrip.id);
              const matchItem = newItems.find(ni => ni.name === sourceItem.name && ni.zone === sourceItem.zone);
              if (matchItem) {
                await loadMapSlotStore.upsert(newTrip.id, slot.slot_key, slot.zone, matchItem.id);
              }
            }
          }
        }
      } catch (slotErr) {
        console.warn('[TRIPS] Slot duplication failed (non-blocking):', slotErr);
      }
      await refreshTrips();
      showToast('Trip duplicated');
    } catch (err) {
      console.error('[TRIPS] Duplicate trip failed:', err);
      showToast('Failed to duplicate trip');
    }
  };

  const deleteTrip = async (id: string) => {
    const doDelete = async () => {
      try {
        await tripStore.softDelete(id);
        await refreshTrips();
        await refreshActiveTrip();
        showToast('Trip deleted');
      } catch (err) {
        console.error('[TRIPS] Delete trip failed:', err);
        showToast('Failed to delete trip');
      }
    };
    if (Platform.OS === 'web') {
      if (confirm('Delete this trip? This action uses soft delete.')) doDelete();
    } else {
      Alert.alert('Delete Trip', 'Are you sure?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };


  const openProfile = (trip: Trip) => {
    setProfileTrip(trip);
    setEditFields({ ...trip });
  };

  const saveProfile = async () => {
    if (!profileTrip) return;
    await tripStore.update(profileTrip.id, editFields);
    await refreshTrips();
    await refreshActiveTrip();
    setProfileTrip(null);
    showToast('Mission profile saved');
  };

  /**
   * Save current form state before navigating away (e.g., to Vehicle Config).
   * This preserves any information already added to the Mission Profile.
   */
  const saveAndNavigateToVehicleConfig = async () => {
    if (profileTrip) {
      // Save current edits first
      await tripStore.update(profileTrip.id, editFields);
      await refreshTrips();
      showToast('Mission profile saved — configure your vehicle');
    }
    // Close the modal
    setProfileTrip(null);
    // Navigate to vehicle config
    router.push('/(tabs)/vehicle-config');
  };

  const updateField = (key: string, value: any) => {
    setEditFields(prev => ({ ...prev, [key]: value }));
  };

  const kpis = editFields ? calculateKPIs(editFields as Trip) : null;

  const renderDropdown = (label: string, field: string, options: readonly string[]) => (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
        {options.map(opt => (
          <TouchableOpacity
            key={opt}
            style={[styles.chip, (editFields as any)?.[field] === opt && styles.chipActive]}
            onPress={() => updateField(field, opt)}
          >
            <Text style={[styles.chipText, (editFields as any)?.[field] === opt && styles.chipTextActive]}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  const renderNumInput = (label: string, field: string, placeholder?: string) => (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={String((editFields as any)?.[field] ?? '')}
        onChangeText={v => updateField(field, v === '' ? null : parseFloat(v) || v)}
        placeholder={placeholder || '0'}
        placeholderTextColor={COLORS.textMuted}
        keyboardType="decimal-pad"
      />
    </View>
  );

  return (
    <View style={styles.container}>
      <Header onAuthPress={() => setAuthVisible(true)} />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Expeditions</Text>
          <TouchableOpacity style={styles.addBtn} onPress={createTrip}>
            <Ionicons name="add" size={20} color="#000" />
            <Text style={styles.addBtnText}>New Trip</Text>
          </TouchableOpacity>
        </View>

        {trips.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="compass-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>No expeditions yet</Text>
            <Text style={styles.emptySubtext}>Create your first trip to begin mission planning</Text>
          </View>
        ) : (
          trips.map(trip => {
            const isActive = activeTrip?.id === trip.id;
            return (
              <TouchableOpacity
                key={trip.id}
                style={[styles.tripCard, isActive && styles.tripCardActive]}
                onPress={() => setActiveTripId(trip.id)}
                activeOpacity={0.7}
              >
                <View style={styles.tripCardHeader}>
                  <View style={styles.tripInfo}>
                    {isActive && (
                      <View style={styles.activeBadge}>
                        <Ionicons name="navigate" size={10} color={COLORS.gold} />
                        <Text style={styles.activeBadgeText}>ACTIVE</Text>
                      </View>
                    )}
                    <Text style={[styles.tripName, isActive && styles.tripNameActive]}>{trip.name}</Text>
                    <Text style={styles.tripMeta}>
                      {trip.terrain_type || 'No terrain'} {trip.season ? `/ ${trip.season}` : ''} {trip.team_size > 1 ? `/ ${trip.team_size} pax` : ''}
                    </Text>
                    {trip.start_date && (
                      <Text style={styles.tripDates}>{trip.start_date} {trip.end_date ? `to ${trip.end_date}` : ''}</Text>
                    )}
                  </View>
                  <View style={styles.tripActions}>
                    <TouchableOpacity style={styles.iconBtn} onPress={() => openProfile(trip)}>
                      <Ionicons name="settings-outline" size={18} color={COLORS.gold} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.iconBtn} onPress={() => duplicateTrip(trip)}>
                      <Ionicons name="copy-outline" size={18} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.iconBtn} onPress={() => deleteTrip(trip.id)}>
                      <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Mission Profile Modal */}
      <Modal visible={!!profileTrip} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Mission Profile</Text>
              <TouchableOpacity onPress={() => setProfileTrip(null)}>
                <Ionicons name="close" size={24} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {/* Basic Info */}
              <Text style={styles.sectionLabel}>MISSION INFO</Text>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Trip Name</Text>
                <TextInput
                  style={styles.input}
                  value={editFields.name || ''}
                  onChangeText={v => updateField('name', v)}
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>

              {/* Date Pickers with Calendar */}
              <View style={styles.row}>
                <DatePickerField
                  label="Start Date"
                  value={editFields.start_date || null}
                  onChange={v => updateField('start_date', v || null)}
                />
                <DatePickerField
                  label="End Date"
                  value={editFields.end_date || null}
                  onChange={v => updateField('end_date', v || null)}
                />
              </View>

              {renderDropdown('Terrain Type', 'terrain_type', TERRAIN_TYPES)}
              {renderDropdown('Season', 'season', SEASONS)}
              {renderDropdown('Active Loadout Mode', 'active_mode', MODES)}

              {/* Team Size */}
              <View style={styles.row}>
                {renderNumInput('Team Size', 'team_size')}
              </View>

              {/* Primary Vehicle Dropdown */}
              <VehicleDropdown
                value={editFields.primary_vehicle || null}
                onChange={v => updateField('primary_vehicle', v)}
                onNavigateToConfig={saveAndNavigateToVehicleConfig}
              />

              <View style={styles.row}>
                {renderNumInput('Route Distance (mi)', 'route_distance_miles')}
                {renderNumInput('Avg Miles/Day', 'avg_miles_per_day')}
              </View>

              {/* Capacities */}
              <Text style={styles.sectionLabel}>CAPACITIES</Text>
              <View style={styles.row}>
                {renderNumInput('Fuel (gal)', 'capac_fuel_gal')}
                {renderNumInput('Avg MPG', 'capac_mpg')}
              </View>
              <View style={styles.row}>
                {renderNumInput('Water (gal)', 'capac_water_gal')}
                {renderNumInput('Water/Person/Day', 'water_use_per_person_day')}
              </View>
              <View style={styles.row}>
                {renderNumInput('Battery (Wh)', 'battery_usable_wh')}
                {renderNumInput('Solar (W)', 'solar_watts')}
              </View>
              <View style={styles.row}>
                {renderNumInput('Sun Hours/Day', 'sun_hours_per_day')}
                {renderNumInput('Solar Eff (0-1)', 'solar_efficiency')}
              </View>

              {/* Emergency Contact REMOVED per user request */}

              {/* KPI Cards */}
              {kpis && (
                <>
                  <Text style={styles.sectionLabel}>MISSION KPIs</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: SPACING.lg }}>
                    <View style={styles.kpiRow}>
                      <KPICard
                        title="Duration"
                        value={kpis.missionDuration != null ? `${kpis.missionDuration}d` : '--'}
                        icon="time-outline"
                        small
                      />
                      <KPICard
                        title="Fuel Days"
                        value={kpis.fuelDays != null ? kpis.fuelDays.toFixed(1) : '--'}
                        icon="flame-outline"
                        color={kpis.fuelDays != null && kpis.missionDuration != null && kpis.fuelDays < kpis.missionDuration ? COLORS.danger : COLORS.success}
                        small
                      />
                      <KPICard
                        title="Water Days"
                        value={kpis.waterDays != null ? kpis.waterDays.toFixed(1) : '--'}
                        icon="water-outline"
                        color={kpis.waterDays != null && kpis.missionDuration != null && kpis.waterDays < kpis.missionDuration ? COLORS.danger : COLORS.success}
                        small
                      />
                      <KPICard
                        title="Solar Return"
                        value={kpis.solarDailyReturn != null ? `${kpis.solarDailyReturn.toFixed(0)}Wh` : '--'}
                        icon="sunny-outline"
                        color={COLORS.goldLight}
                        small
                      />
                      <KPICard
                        title="Power"
                        value={kpis.powerSustainable ? 'OK' : kpis.powerDays != null ? `${kpis.powerDays.toFixed(1)}d` : '--'}
                        icon="battery-half-outline"
                        color={kpis.powerSustainable ? COLORS.success : COLORS.warning}
                        small
                      />
                    </View>
                  </ScrollView>
                </>
              )}

              <TouchableOpacity style={styles.saveBtn} onPress={saveProfile}>
                <Ionicons name="checkmark-circle" size={20} color="#000" />
                <Text style={styles.saveBtnText}>Save Mission Profile</Text>
              </TouchableOpacity>
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      <AuthModal visible={authVisible} onClose={() => setAuthVisible(false)} />
      <Toast />
    </View>
  );
}


export default function TripsScreen() {
  return (
    <TabErrorBoundary tabName="TRIPS">
      <TripsScreenInner />
    </TabErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1 },
  scrollContent: { padding: SPACING.lg, paddingBottom: 100 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.gold,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.sm,
  },
  addBtnText: { color: '#000', fontWeight: '700', fontSize: 13 },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: { color: COLORS.textSecondary, fontSize: 18, fontWeight: '600' },
  emptySubtext: { color: COLORS.textMuted, fontSize: 13 },
  tripCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  tripCardActive: {
    borderColor: COLORS.goldBorder,
    backgroundColor: 'rgba(212,175,55,0.05)',
  },
  tripCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  tripInfo: { flex: 1 },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.goldMuted,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  activeBadgeText: {
    fontSize: 9,
    color: COLORS.gold,
    fontWeight: '800',
    letterSpacing: 1,
  },
  tripName: { fontSize: 17, fontWeight: '700', color: COLORS.textPrimary },
  tripNameActive: { color: COLORS.gold },
  tripMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4 },
  tripDates: { fontSize: 11, color: COLORS.textMuted, marginTop: 2, fontFamily: 'Courier' },
  tripActions: { flexDirection: 'row', gap: 4 },
  iconBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: COLORS.bgElevated,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.bgModal,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.bgCard,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    maxHeight: '92%',
    borderTopWidth: 1,
    borderColor: COLORS.goldBorder,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: COLORS.gold },
  modalBody: { padding: SPACING.lg },
  sectionLabel: {
    fontSize: 11,
    color: COLORS.gold,
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: SPACING.lg,
    marginBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.goldBorder,
    paddingBottom: 6,
  },
  fieldGroup: { marginBottom: SPACING.md, flex: 1 },
  fieldLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: COLORS.bgInput,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    padding: SPACING.sm,
    color: COLORS.textPrimary,
    fontSize: 15,
  },
  row: { flexDirection: 'row', gap: SPACING.sm },
  chipRow: { flexDirection: 'row', marginBottom: 4 },
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: 6,
    backgroundColor: COLORS.bgInput,
  },
  chipActive: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.goldMuted,
  },
  chipText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: COLORS.gold },
  kpiRow: { flexDirection: 'row', gap: SPACING.sm },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.gold,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
    marginTop: SPACING.lg,
  },
  saveBtnText: { color: '#000', fontSize: 16, fontWeight: '700' },
});




