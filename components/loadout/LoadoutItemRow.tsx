import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import type { LoadoutItem, LoadoutItemCategory, WeightSource } from '../../lib/types';
import { CATEGORY_COLORS, CATEGORY_ICONS } from '../../lib/types';
import { supabase } from '../../lib/supabase';
import ZoneBadge from './ZoneBadge';
import type { ContainerZone } from '../../lib/accessoryFramework';

const WEIGHT_SOURCE_LABELS: Record<WeightSource, { label: string; short: string; color: string; icon: string }> = {
  manufacturer: { label: 'Manufacturer', short: 'MFR', color: '#66BB6A', icon: 'business-outline' },
  measured:     { label: 'Measured',     short: 'MEAS', color: '#42A5F5', icon: 'scale-outline' },
  estimate:     { label: 'Estimate',     short: 'EST', color: TACTICAL.amber, icon: 'help-circle-outline' },
};

interface Props {
  item: LoadoutItem;
  emphasizeCritical: boolean;
  onUpdated: () => void;
  onDelete: () => void;
  /** Container zone matched to this item's storage_location (Phase 3) */
  containerZone?: ContainerZone | null;
}

export default function LoadoutItemRow({ item, emphasizeCritical, onUpdated, onDelete, containerZone }: Props) {

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(item.quantity);
  const [isCritical, setIsCritical] = useState(item.is_critical);
  const [isPacked, setIsPacked] = useState(item.is_packed);
  const [storageLocation, setStorageLocation] = useState(item.storage_location || '');
  const [notes, setNotes] = useState(item.notes || '');
  const [weightLbs, setWeightLbs] = useState(item.weight_lbs != null ? String(item.weight_lbs) : '');
  const [weightSource, setWeightSource] = useState<WeightSource>(item.weight_source || 'estimate');
  const [showNotes, setShowNotes] = useState(false);
  const [saving, setSaving] = useState(false);


  const catColor = CATEGORY_COLORS[item.category as LoadoutItemCategory] || TACTICAL.textMuted;
  const catIcon = CATEGORY_ICONS[item.category as LoadoutItemCategory] || 'cube-outline';

  const updateField = async (updates: Partial<LoadoutItem>) => {
    setSaving(true);
    await supabase.from('loadout_items').update(updates).eq('id', item.id);
    setSaving(false);
    onUpdated();
  };

  const handleTogglePacked = () => {
    const newVal = !isPacked;
    setIsPacked(newVal);
    updateField({ is_packed: newVal });
  };

  const handleToggleCritical = () => {
    const newVal = !isCritical;
    setIsCritical(newVal);
    updateField({ is_critical: newVal });
  };

  const handleQtyChange = (delta: number) => {
    const newQty = Math.max(1, quantity + delta);
    setQuantity(newQty);
    updateField({ quantity: newQty });
  };

  const handleSaveName = () => {
    if (name.trim() && name.trim() !== item.name) {
      updateField({ name: name.trim() });
    }
    setEditing(false);
  };

  const handleSaveNotes = () => {
    const parsedWeight = parseFloat(weightLbs);
    const newWeight = !isNaN(parsedWeight) && parsedWeight >= 0 ? parsedWeight : null;
    updateField({
      notes: notes.trim() || null,
      storage_location: storageLocation.trim() || null,
      weight_lbs: newWeight,
      weight_source: weightSource,
    });
    setShowNotes(false);
  };

  const handleWeightSourceChange = (src: WeightSource) => {
    setWeightSource(src);
    updateField({ weight_source: src });
  };


  const isCriticalHighlight = isCritical && emphasizeCritical;
  const itemTotalWeight = (item.weight_lbs || 0) * quantity;

  return (
    <View style={[
      styles.container,
      isCriticalHighlight && styles.criticalHighlight,
    ]}>
      {/* Main Row */}
      <View style={styles.mainRow}>
        {/* Packed Toggle */}
        <TouchableOpacity style={styles.packedToggle} onPress={handleTogglePacked}>
          <Ionicons
            name={isPacked ? 'checkbox' : 'square-outline'}
            size={22}
            color={isPacked ? '#4CAF50' : TACTICAL.textMuted}
          />
        </TouchableOpacity>

        {/* Category Icon */}
        <View style={[styles.catIcon, { backgroundColor: `${catColor}18` }]}>
          <Ionicons name={catIcon as any} size={14} color={catColor} />
        </View>

        {/* Name + Meta */}
        <View style={styles.infoCol}>
          {editing ? (
            <TextInput
              style={styles.nameInput}
              value={name}
              onChangeText={setName}
              onBlur={handleSaveName}
              onSubmitEditing={handleSaveName}
              autoFocus
              selectTextOnFocus
            />
          ) : (
            <TouchableOpacity onPress={() => setEditing(true)}>
              <Text style={[
                styles.itemName,
                isPacked && styles.itemNamePacked,
              ]} numberOfLines={1}>
                {item.name}
              </Text>
            </TouchableOpacity>
          )}

          <View style={styles.metaRow}>
            <Text style={[styles.catBadge, { color: catColor }]}>
              {(item.category || 'general').toUpperCase()}
            </Text>
            {/* Phase 3: Zone Badge — replaces raw storage location text */}
            {containerZone ? (
              <ZoneBadge zone={containerZone} compact />
            ) : storageLocation ? (
              <ZoneBadge zone={null} fallbackText={storageLocation} compact />
            ) : null}
            {item.weight_lbs != null && item.weight_lbs > 0 && (
              <Text style={styles.weightBadge}>
                {itemTotalWeight.toFixed(1)} lbs
              </Text>
            )}
          </View>

        </View>

        {/* Critical Toggle */}
        <TouchableOpacity style={styles.criticalBtn} onPress={handleToggleCritical}>
          <Ionicons
            name={isCritical ? 'alert-circle' : 'alert-circle-outline'}
            size={18}
            color={isCritical ? TACTICAL.danger : TACTICAL.textMuted}
          />
        </TouchableOpacity>

        {/* Qty Stepper */}
        <View style={styles.qtyStepper}>
          <TouchableOpacity style={styles.qtyBtn} onPress={() => handleQtyChange(-1)}>
            <Ionicons name="remove" size={14} color={TACTICAL.textMuted} />
          </TouchableOpacity>
          <Text style={styles.qtyValue}>{quantity}</Text>
          <TouchableOpacity style={styles.qtyBtn} onPress={() => handleQtyChange(1)}>
            <Ionicons name="add" size={14} color={TACTICAL.amber} />
          </TouchableOpacity>
        </View>

        {/* Expand / Delete */}
        <TouchableOpacity style={styles.expandBtn} onPress={() => setShowNotes(!showNotes)}>
          <Ionicons
            name={showNotes ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={TACTICAL.textMuted}
          />
        </TouchableOpacity>

        {saving && <ActivityIndicator size="small" color={TACTICAL.amber} style={{ marginLeft: 4 }} />}
      </View>

      {/* Critical Badge */}
      {isCritical && (
        <View style={styles.criticalBadgeRow}>
          <View style={styles.criticalBadge}>
            <Ionicons name="alert-circle" size={10} color={TACTICAL.danger} />
            <Text style={styles.criticalBadgeText}>CRITICAL</Text>
          </View>
          {isPacked && (
            <View style={styles.packedBadge}>
              <Ionicons name="checkmark-circle" size={10} color="#4CAF50" />
              <Text style={styles.packedBadgeText}>PACKED</Text>
            </View>
          )}
        </View>
      )}

      {showNotes && (
        <View style={styles.expandedSection}>
          {/* Weight Field */}
          <View style={styles.expandedField}>
            <Text style={styles.expandedLabel}>WEIGHT (PER UNIT)</Text>
            <View style={styles.weightInputRow}>
              <TextInput
                style={[styles.expandedInput, styles.weightInput]}
                value={weightLbs}
                onChangeText={(v) => setWeightLbs(v.replace(/[^0-9.]/g, ''))}
                placeholder="0.0"
                placeholderTextColor={TACTICAL.textMuted}
                keyboardType="decimal-pad"
                onBlur={handleSaveNotes}
              />
              <Text style={styles.weightUnit}>lbs</Text>
              {item.weight_lbs != null && item.weight_lbs > 0 && quantity > 1 && (
                <View style={styles.weightTotalBadge}>
                  <Text style={styles.weightTotalText}>
                    Total: {(item.weight_lbs * quantity).toFixed(1)} lbs
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Weight Source Selector */}
          <View style={styles.expandedField}>
            <Text style={styles.expandedLabel}>WEIGHT SOURCE</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {(['manufacturer', 'measured', 'estimate'] as WeightSource[]).map((src) => {
                const info = WEIGHT_SOURCE_LABELS[src];
                const active = weightSource === src;
                return (
                  <TouchableOpacity
                    key={src}
                    onPress={() => handleWeightSourceChange(src)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 4,
                      paddingHorizontal: 10, paddingVertical: 6,
                      borderRadius: 6, borderWidth: 1,
                      backgroundColor: active ? `${info.color}18` : TACTICAL.panel,
                      borderColor: active ? `${info.color}50` : TACTICAL.border,
                    }}
                  >
                    <Ionicons name={info.icon as any} size={12} color={active ? info.color : TACTICAL.textMuted} />
                    <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 0.5, color: active ? info.color : TACTICAL.textMuted }}>
                      {info.short}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Quantity */}
          <View style={styles.expandedField}>
            <Text style={styles.expandedLabel}>QUANTITY</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={[styles.qtyStepper, { borderColor: TACTICAL.border }]}>  
                <TouchableOpacity style={styles.qtyBtn} onPress={() => handleQtyChange(-1)}>
                  <Ionicons name="remove" size={14} color={TACTICAL.textMuted} />
                </TouchableOpacity>
                <Text style={styles.qtyValue}>{quantity}</Text>
                <TouchableOpacity style={styles.qtyBtn} onPress={() => handleQtyChange(1)}>
                  <Ionicons name="add" size={14} color={TACTICAL.amber} />
                </TouchableOpacity>
              </View>
              <Text style={{ fontSize: 10, color: TACTICAL.textMuted }}>Min: 1</Text>
            </View>
          </View>

          <View style={styles.expandedField}>
            <Text style={styles.expandedLabel}>STORAGE LOCATION</Text>
            <TextInput
              style={styles.expandedInput}
              value={storageLocation}
              onChangeText={setStorageLocation}
              placeholder="e.g. Left Drawer, Rear Bin"
              placeholderTextColor={TACTICAL.textMuted}
              onBlur={handleSaveNotes}
            />
          </View>
          <View style={styles.expandedField}>
            <Text style={styles.expandedLabel}>NOTES</Text>
            <TextInput
              style={[styles.expandedInput, { minHeight: 50 }]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Additional notes..."
              placeholderTextColor={TACTICAL.textMuted}
              multiline
              onBlur={handleSaveNotes}
            />
          </View>
          <TouchableOpacity style={styles.deleteRow} onPress={onDelete}>
            <Ionicons name="trash-outline" size={14} color={TACTICAL.danger} />
            <Text style={styles.deleteText}>DELETE ITEM</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}



const styles = StyleSheet.create({
  container: {
    backgroundColor: TACTICAL.panel,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    marginBottom: 6,
    overflow: 'hidden',
  },
  criticalHighlight: {
    borderColor: `${TACTICAL.danger}50`,
    borderLeftWidth: 3,
    borderLeftColor: TACTICAL.danger,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 6,
  },
  packedToggle: {
    padding: 2,
  },
  catIcon: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCol: {
    flex: 1,
    marginHorizontal: 4,
  },
  nameInput: {
    fontSize: 14,
    fontWeight: '700',
    color: TACTICAL.text,
    borderBottomWidth: 1,
    borderBottomColor: TACTICAL.amber,
    paddingVertical: 2,
    paddingHorizontal: 0,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '700',
    color: TACTICAL.text,
  },
  itemNamePacked: {
    textDecorationLine: 'line-through',
    color: TACTICAL.textMuted,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
    flexWrap: 'wrap',
  },
  catBadge: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  storageLoc: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    fontStyle: 'italic',
    maxWidth: 80,
  },
  weightBadge: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.amber,
    fontFamily: 'Courier',
  },
  criticalBtn: {
    padding: 4,
  },
  qtyStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TACTICAL.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  qtyBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  qtyValue: {
    fontSize: 14,
    fontWeight: '900',
    color: TACTICAL.text,
    fontFamily: 'Courier',
    minWidth: 22,
    textAlign: 'center',
  },
  expandBtn: {
    padding: 4,
  },
  criticalBadgeRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  criticalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: `${TACTICAL.danger}15`,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: `${TACTICAL.danger}30`,
  },
  criticalBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: TACTICAL.danger,
    letterSpacing: 1,
  },
  packedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'rgba(76,175,80,0.1)',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.3)',
  },
  packedBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#4CAF50',
    letterSpacing: 1,
  },
  expandedSection: {
    borderTopWidth: 1,
    borderTopColor: TACTICAL.border,
    padding: 12,
    backgroundColor: TACTICAL.bg,
    gap: 10,
  },
  expandedField: {},
  expandedLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  expandedInput: {
    backgroundColor: TACTICAL.panel,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: TACTICAL.text,
    fontSize: 13,
  },
  // Weight field styles
  weightInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  weightInput: {
    flex: 0,
    width: 100,
    fontFamily: 'Courier',
    fontWeight: '700',
  },
  weightUnit: {
    fontSize: 11,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  weightTotalBadge: {
    backgroundColor: 'rgba(196, 138, 44, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.25)',
  },
  weightTotalText: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.amber,
    fontFamily: 'Courier',
  },
  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  deleteText: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.danger,
    letterSpacing: 0.8,
  },
});



