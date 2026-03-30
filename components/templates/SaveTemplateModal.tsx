// ============================================================
// SAVE TEMPLATE MODAL — Capture builder state as reusable template
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet,
  ScrollView, ActivityIndicator, Animated,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import ECSModal from '../ECSModal';

import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import {
  getBuilderState,
  getCachedVehicleZones,
  type BuilderStepState,
  type CachedZone,
} from '../../lib/expeditionCache';
import { loadoutItemStore } from '../../lib/loadoutStore';
import { templateStore, type TemplateCreatePayload, type TemplateItem } from '../../lib/templateStore';

interface Props {
  visible: boolean;
  onClose: () => void;
  userId: string | null;
  onSaved: (templateId: string) => void;
}

export default function SaveTemplateModal({ visible, onClose, userId, onSaved }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [builderState, setBuilderStateLocal] = useState<BuilderStepState | null>(null);
  const [zones, setZones] = useState<CachedZone[]>([]);
  const [itemCount, setItemCount] = useState(0);
  const successAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setError(null);
      setSaving(false);
      const bs = getBuilderState();
      setBuilderStateLocal(bs);

      // Get cached zones
      if (bs.vehicleId) {
        const z = getCachedVehicleZones(bs.vehicleId);
        setZones(z);
      }

      // Generate default name
      const parts: string[] = [];
      if (bs.vehicleName) parts.push(bs.vehicleName);
      if (bs.frameworkType) parts.push(bs.frameworkType);
      const defaultName = parts.length > 0
        ? `${parts.join(' — ')} Template`
        : `Expedition Template ${new Date().toLocaleDateString()}`;
      setName(defaultName);
      setDescription('');

      // Count loadout items
      if (bs.loadoutId) {
        loadoutItemStore.getByLoadoutId(bs.loadoutId, userId).then(items => {
          setItemCount(items.length);
        }).catch(() => setItemCount(0));
      }
    }
  }, [visible, userId]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('TEMPLATE NAME IS REQUIRED');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const bs = getBuilderState();

      // Gather loadout items snapshot
      let itemsSnapshot: TemplateItem[] = [];
      if (bs.loadoutId) {
        try {
          const items = await loadoutItemStore.getByLoadoutId(bs.loadoutId, userId);
          itemsSnapshot = items.map(item => ({
            name: item.name,
            category: item.category,
            quantity: item.quantity,
            is_critical: item.is_critical,
            storage_location: item.storage_location,
            notes: item.notes,
            weight_lbs: item.weight_lbs,
            sort_order: item.sort_order,
          }));
        } catch (e) {
          console.warn('[SaveTemplate] Failed to snapshot items:', e);
        }
      }

      // Get zones snapshot
      const zonesSnapshot = bs.vehicleId ? getCachedVehicleZones(bs.vehicleId) : [];

      const payload: TemplateCreatePayload = {
        name: name.trim(),
        description: description.trim() || null,
        vehicle_id: bs.vehicleId,
        vehicle_name: bs.vehicleName,
        framework_type: bs.frameworkType,
        zone_count: bs.zoneCount || zonesSnapshot.length,
        loadout_id: bs.loadoutId,
        loadout_name: null, // Could be enhanced to include loadout name
        loadout_mode: 'trip',
        operating_profile: null,
        people_count: 1,
        trip_length_days: null,
        builder_state: bs,
        zones_snapshot: zonesSnapshot,
        items_snapshot: itemsSnapshot,
      };

      const template = await templateStore.create(payload, userId);

      if (template) {
        // Success animation
        Animated.sequence([
          Animated.timing(successAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.delay(800),
        ]).start(() => {
          onSaved(template.id);
          onClose();
          successAnim.setValue(0);
        });
      } else {
        setError('FAILED TO SAVE TEMPLATE. RETRY.');
      }
    } catch (e: any) {
      console.error('[SaveTemplate] Error:', e);
      setError(e?.message || 'UNEXPECTED ERROR');
    }

    setSaving(false);
  };

  const isValid = name.trim().length > 0;

  return (
    <ECSModal visible={visible} onClose={onClose} tier="global">

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIcon}>
                <Ionicons name="bookmark" size={18} color="#4CAF50" />
              </View>
              <View>
                <Text style={styles.headerTitle}>SAVE AS TEMPLATE</Text>
                <Text style={styles.headerSub}>Capture builder state for reuse</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={TACTICAL.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Error */}
            {error && (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={16} color={TACTICAL.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Snapshot Summary */}
            <View style={styles.snapshotCard}>
              <Text style={styles.snapshotTitle}>TEMPLATE SNAPSHOT</Text>
              <View style={styles.snapshotGrid}>
                <SnapshotRow
                  icon="car-sport"
                  label="Vehicle"
                  value={builderState?.vehicleName || 'Not set'}
                  done={!!builderState?.vehicleSelected}
                />
                <SnapshotRow
                  icon="construct"
                  label="Framework"
                  value={builderState?.frameworkType || 'Not set'}
                  done={!!builderState?.frameworkConfigured}
                />
                <SnapshotRow
                  icon="grid"
                  label="Zones"
                  value={zones.length > 0 ? `${zones.length} zones` : 'Not configured'}
                  done={!!builderState?.zonesConfigured}
                />
                <SnapshotRow
                  icon="cube"
                  label="Loadout"
                  value={itemCount > 0 ? `${itemCount} items` : 'No items'}
                  done={!!builderState?.loadoutReady}
                />
              </View>
            </View>

            {/* Template Name */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>TEMPLATE NAME *</Text>
              <TextInput
                style={[styles.input, !name.trim() && error ? styles.inputError : null]}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Weekend Overland Rig"
                placeholderTextColor={TACTICAL.textMuted}
                autoCapitalize="words"
              />
            </View>

            {/* Description */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>DESCRIPTION (OPTIONAL)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={description}
                onChangeText={setDescription}
                placeholder="Notes about this template configuration..."
                placeholderTextColor={TACTICAL.textMuted}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>

            {/* Save Button */}
            <TouchableOpacity
              style={[styles.saveBtn, !isValid && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={!isValid || saving}
              activeOpacity={0.7}
            >
              {saving ? (
                <>
                  <ActivityIndicator size="small" color="#0B0F12" />
                  <Text style={styles.saveBtnText}>SAVING...</Text>
                </>
              ) : (
                <>
                  <Ionicons name="bookmark-outline" size={18} color="#0B0F12" />
                  <Text style={styles.saveBtnText}>SAVE TEMPLATE</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Success overlay */}
            <Animated.View
              style={[
                styles.successOverlay,
                {
                  opacity: successAnim,
                  transform: [{ scale: successAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }],
                },
              ]}
              pointerEvents="none"
            >
              <Ionicons name="checkmark-circle" size={48} color="#4CAF50" />
              <Text style={styles.successText}>TEMPLATE SAVED</Text>
            </Animated.View>

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </ECSModal>
  );
}

// ── Snapshot Row ──────────────────────────────────────────────

function SnapshotRow({ icon, label, value, done }: {
  icon: string; label: string; value: string; done: boolean;
}) {
  return (
    <View style={styles.snapshotRow}>
      <View style={[styles.snapshotIcon, done && styles.snapshotIconDone]}>
        <Ionicons name={icon as any} size={14} color={done ? '#4CAF50' : TACTICAL.textMuted} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.snapshotLabel}>{label}</Text>
        <Text style={[styles.snapshotValue, done && styles.snapshotValueDone]}>{value}</Text>
      </View>
      {done && <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────

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
    maxHeight: '90%',
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(76, 175, 80, 0.3)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 18,
    paddingBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(76, 175, 80, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#4CAF50',
    letterSpacing: 1.5,
  },
  headerSub: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    marginTop: 2,
  },
  closeBtn: { padding: 4 },
  divider: {
    height: 1,
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
    marginHorizontal: 18,
  },
  body: { flex: 1 },
  bodyContent: { padding: 18, paddingTop: 14 },

  // Error
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(192, 57, 43, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(192, 57, 43, 0.3)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '700',
    color: TACTICAL.danger,
    letterSpacing: 0.5,
  },

  // Snapshot Card
  snapshotCard: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.35)',
    padding: 14,
    marginBottom: 18,
  },
  snapshotTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
    marginBottom: 12,
  },
  snapshotGrid: { gap: 10 },
  snapshotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  snapshotIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(138,138,133,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  snapshotIconDone: {
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    borderColor: 'rgba(76, 175, 80, 0.3)',
  },
  snapshotLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  snapshotValue: {
    fontSize: 12,
    fontWeight: '600',
    color: TACTICAL.text,
    marginTop: 1,
  },
  snapshotValueDone: {
    color: '#4CAF50',
  },

  // Fields
  fieldGroup: { marginBottom: 16 },
  label: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  input: {
    backgroundColor: TACTICAL.bg,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 10,
    padding: 12,
    color: TACTICAL.text,
    fontSize: 15,
  },
  inputError: { borderColor: TACTICAL.danger },
  textArea: { minHeight: 70, paddingTop: 12 },

  // Save Button
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#4CAF50',
    borderRadius: TACTICAL.radius,
    padding: 16,
    marginTop: 8,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0B0F12',
    letterSpacing: 1.5,
  },

  // Success
  successOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11, 15, 18, 0.9)',
    borderRadius: 12,
    gap: 12,
  },
  successText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#4CAF50',
    letterSpacing: 2,
  },
});



