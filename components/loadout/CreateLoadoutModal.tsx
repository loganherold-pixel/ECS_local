import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import ECSModal from '../ECSModal';

import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import type {
  LoadoutMode,
  OperatingProfile,
  LoadoutViewMode,
} from '../../lib/types';
import {
  OPERATING_PROFILE_LABELS,
  OPERATING_PROFILE_COLORS,
  OPERATING_PROFILE_DESCRIPTIONS,
} from '../../lib/types';
import { loadoutStore } from '../../lib/loadoutStore';

interface Props {
  visible: boolean;
  userId: string | null;
  defaultViewMode?: LoadoutViewMode;
  onClose: () => void;
  onCreated: (loadoutId: string) => void;
}

export default function CreateLoadoutModal({ visible, userId, defaultViewMode, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [mode, setMode] = useState<LoadoutMode>('trip');
  const [profile, setProfile] = useState<OperatingProfile | null>(null);
  const [peopleCount, setPeopleCount] = useState('1');
  const [tripLength, setTripLength] = useState('3');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName('');
    setMode('trip');
    setProfile(null);
    setPeopleCount('1');
    setTripLength('3');
    setError(null);
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      setError('LOADOUT NAME IS REQUIRED');
      return;
    }
    if (!profile) {
      setError('SELECT AN OPERATING PROFILE');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Always create in Full Loadout (advanced) mode — Quick Start removed
      const viewMode = 'advanced' as const;


      // Use offline-first loadout store
      const { loadout } = await loadoutStore.create({
        name: name.trim(),
        mode,
        operating_profile: profile,
        people_count: parseInt(peopleCount) || 1,
        trip_length_days: mode === 'trip' ? (parseInt(tripLength) || 3) : undefined,
        loadout_view_mode: viewMode,
      }, userId);

      if (!loadout) {
        setError('FAILED TO CREATE LOADOUT');
        setSaving(false);
        return;
      }

      reset();
      onCreated(loadout.id);
    } catch {
      setError('UNEXPECTED ERROR');
    }
    setSaving(false);
  };


  const profiles: OperatingProfile[] = ['weekend', 'solo', 'family', 'sar'];

  return (
    <ECSModal visible={visible} onClose={() => { reset(); onClose(); }} tier="global">
      <View style={styles.overlay}>

        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Ionicons name="add-circle-outline" size={20} color={TACTICAL.amber} />
              <Text style={styles.headerTitle}>NEW LOADOUT</Text>
            </View>
            <TouchableOpacity onPress={() => { reset(); onClose(); }} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={TACTICAL.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Name */}
            <View style={styles.field}>
              <Text style={styles.label}>LOADOUT NAME</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Mojave 5-Day Kit"
                placeholderTextColor={TACTICAL.textMuted}
                autoFocus
              />
            </View>

            {/* Mode Toggle */}
            <View style={styles.field}>
              <Text style={styles.label}>MODE</Text>
              <View style={styles.toggleRow}>
                {(['trip', 'daily'] as LoadoutMode[]).map(m => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.toggleBtn, mode === m && styles.toggleBtnActive]}
                    onPress={() => setMode(m)}
                  >
                    <Ionicons
                      name={m === 'trip' ? 'trail-sign-outline' : 'today-outline'}
                      size={16}
                      color={mode === m ? TACTICAL.amber : TACTICAL.textMuted}
                    />
                    <Text style={[styles.toggleText, mode === m && styles.toggleTextActive]}>
                      {m === 'trip' ? 'TRIP' : 'DAILY'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Operating Profile */}
            <View style={styles.field}>
              <Text style={styles.label}>OPERATING PROFILE</Text>
              <View style={styles.profileGrid}>
                {profiles.map(p => {
                  const isSelected = profile === p;
                  const color = OPERATING_PROFILE_COLORS[p];
                  return (
                    <TouchableOpacity
                      key={p}
                      style={[
                        styles.profileCard,
                        isSelected && { borderColor: color, backgroundColor: `${color}15` },
                      ]}
                      onPress={() => setProfile(p)}
                    >
                      <View style={styles.profileCardHeader}>
                        <View style={[styles.profileDot, { backgroundColor: color }]} />
                        <Text style={[styles.profileName, isSelected && { color }]}>
                          {OPERATING_PROFILE_LABELS[p]}
                        </Text>
                      </View>
                      <Text style={styles.profileDesc} numberOfLines={2}>
                        {OPERATING_PROFILE_DESCRIPTIONS[p]}
                      </Text>
                      {isSelected && (
                        <View style={[styles.selectedBadge, { backgroundColor: `${color}25`, borderColor: color }]}>
                          <Ionicons name="checkmark" size={12} color={color} />
                          <Text style={[styles.selectedText, { color }]}>SELECTED</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Trip-specific fields */}
            {profile && mode === 'trip' && (
              <View style={styles.tripFields}>
                <View style={styles.tripFieldRow}>
                  <View style={styles.tripField}>
                    <Text style={styles.label}>PEOPLE COUNT</Text>
                    <TextInput
                      style={styles.input}
                      value={peopleCount}
                      onChangeText={setPeopleCount}
                      keyboardType="number-pad"
                      placeholder="1"
                      placeholderTextColor={TACTICAL.textMuted}
                    />
                  </View>
                  <View style={styles.tripField}>
                    <Text style={styles.label}>TRIP LENGTH (DAYS)</Text>
                    <TextInput
                      style={styles.input}
                      value={tripLength}
                      onChangeText={setTripLength}
                      keyboardType="number-pad"
                      placeholder="3"
                      placeholderTextColor={TACTICAL.textMuted}
                    />
                  </View>
                </View>
              </View>
            )}

            {/* Error */}
            {error && (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle" size={14} color={TACTICAL.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Create Button */}
            <TouchableOpacity
              style={[styles.createBtn, saving && { opacity: 0.6 }]}
              onPress={handleCreate}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color={TACTICAL.text} />
              ) : (
                <>
                  <Ionicons name="shield-checkmark-outline" size={18} color={TACTICAL.text} />
                  <Text style={styles.createBtnText}>CREATE LOADOUT</Text>
                </>
              )}
            </TouchableOpacity>

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </View>
    </ECSModal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },

  container: {
    backgroundColor: TACTICAL.panel,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '92%',
    borderTopWidth: 2,
    borderColor: TACTICAL.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: TACTICAL.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 2,
  },
  closeBtn: {
    padding: 4,
  },
  body: {
    padding: 20,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  input: {
    backgroundColor: TACTICAL.bg,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: TACTICAL.radius,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: TACTICAL.text,
    fontSize: 15,
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: TACTICAL.bg,
    borderRadius: TACTICAL.radius,
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  toggleBtnActive: {
    borderColor: TACTICAL.amber,
    backgroundColor: 'rgba(196,138,44,0.08)',
  },
  toggleText: {
    fontSize: 13,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  toggleTextActive: {
    color: TACTICAL.amber,
  },
  profileGrid: {
    gap: 10,
  },
  profileCard: {
    backgroundColor: TACTICAL.bg,
    borderRadius: TACTICAL.radius,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    padding: 14,
  },
  profileCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  profileDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  profileName: {
    fontSize: 13,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 0.5,
  },
  profileDesc: {
    fontSize: 12,
    color: TACTICAL.textMuted,
    lineHeight: 17,
  },
  selectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  selectedText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
  tripFields: {
    marginBottom: 20,
  },
  tripFieldRow: {
    flexDirection: 'row',
    gap: 12,
  },
  tripField: {
    flex: 1,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    padding: 12,
    backgroundColor: 'rgba(192,57,43,0.1)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(192,57,43,0.3)',
  },
  errorText: {
    fontSize: 12,
    fontWeight: '700',
    color: TACTICAL.danger,
    letterSpacing: 0.5,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: TACTICAL.accent,
    borderRadius: TACTICAL.radius,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: TACTICAL.borderFocus,
  },
  createBtnText: {
    fontSize: 14,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 2,
  },
});



