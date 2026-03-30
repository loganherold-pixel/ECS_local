import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import type { LoadoutItem, LoadoutItemCategory } from '../../lib/types';
import { CATEGORY_COLORS, CATEGORY_ICONS } from '../../lib/types';
import { supabase } from '../../lib/supabase';

interface Props {
  item: LoadoutItem;
  onUpdated: () => void;
}

export default function BasicItemRow({ item, onUpdated }: Props) {
  const [isPacked, setIsPacked] = useState(item.is_packed);
  const [quantity, setQuantity] = useState(item.quantity);
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

  const handleQtyChange = (delta: number) => {
    const newQty = Math.max(1, quantity + delta);
    setQuantity(newQty);
    updateField({ quantity: newQty });
  };

  return (
    <View style={[styles.container, item.is_critical && styles.criticalContainer]}>
      {/* Packed Checkbox */}
      <TouchableOpacity
        style={styles.packedBtn}
        onPress={handleTogglePacked}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons
          name={isPacked ? 'checkbox' : 'square-outline'}
          size={26}
          color={isPacked ? '#4CAF50' : TACTICAL.textMuted}
        />
      </TouchableOpacity>

      {/* Category Dot */}
      <View style={[styles.catDot, { backgroundColor: catColor }]} />

      {/* Name */}
      <View style={styles.nameCol}>
        <Text
          style={[styles.name, isPacked && styles.namePacked]}
          numberOfLines={1}
        >
          {item.name}
        </Text>
        <Text style={[styles.catLabel, { color: catColor }]}>
          {(item.category || 'general').toUpperCase()}
        </Text>
      </View>

      {/* Critical Icon */}
      {item.is_critical && (
        <View style={styles.criticalIcon}>
          <Ionicons name="alert-circle" size={18} color={TACTICAL.danger} />
        </View>
      )}

      {/* Qty Stepper */}
      <View style={styles.qtyStepper}>
        <TouchableOpacity
          style={styles.qtyBtn}
          onPress={() => handleQtyChange(-1)}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Ionicons name="remove" size={16} color={TACTICAL.textMuted} />
        </TouchableOpacity>
        <Text style={styles.qtyValue}>{quantity}</Text>
        <TouchableOpacity
          style={styles.qtyBtn}
          onPress={() => handleQtyChange(1)}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Ionicons name="add" size={16} color={TACTICAL.amber} />
        </TouchableOpacity>
      </View>

      {saving && (
        <ActivityIndicator size="small" color={TACTICAL.amber} style={styles.spinner} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TACTICAL.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    paddingHorizontal: 12,
    paddingVertical: 14,
    marginBottom: 6,
    gap: 10,
    minHeight: 58,
  },
  criticalContainer: {
    borderLeftWidth: 3,
    borderLeftColor: TACTICAL.danger,
  },
  packedBtn: {
    padding: 2,
  },
  catDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  nameCol: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    color: TACTICAL.text,
  },
  namePacked: {
    textDecorationLine: 'line-through',
    color: TACTICAL.textMuted,
  },
  catLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginTop: 2,
  },
  criticalIcon: {
    padding: 2,
  },
  qtyStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TACTICAL.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  qtyBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  qtyValue: {
    fontSize: 16,
    fontWeight: '900',
    color: TACTICAL.text,
    fontFamily: 'Courier',
    minWidth: 24,
    textAlign: 'center',
  },
  spinner: {
    marginLeft: 4,
  },
});



