/**
 * ItemRow — Loadout 2.0 Container Detail Item Row
 *
 * Displays a single item within a container detail view:
 *   - Packed checkbox toggle
 *   - Item name (tap to edit inline)
 *   - Quantity stepper
 *   - Total item weight
 *   - Critical badge
 *   - Liquid badge (if liquid item)
 *   - Expand for edit/delete
 */
import React, { useState, useCallback } from 'react';
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
import type { LoadoutItem } from '../../lib/types';

interface ItemRowProps {
  item: LoadoutItem;
  containerColor: string;
  onTogglePacked: (itemId: string, packed: boolean) => void;
  onUpdateQty: (itemId: string, qty: number) => void;
  onEdit: (item: LoadoutItem) => void;
  onDelete: (itemId: string) => void;
}

export default function ItemRow({
  item,
  containerColor,
  onTogglePacked,
  onUpdateQty,
  onEdit,
  onDelete,
}: ItemRowProps) {
  const [expanded, setExpanded] = useState(false);
  const isPacked = item.is_packed;
  const isCritical = item.is_critical;
  const totalWeight = (item.weight_lbs || 0) * (item.quantity || 1);

  // Check if this is a liquid item (notes contain liquid metadata)
  const isLiquid = item.notes?.includes('[LIQUID:');
  const liquidInfo = isLiquid ? parseLiquidNotes(item.notes || '') : null;

  const handleQtyChange = useCallback((delta: number) => {
    const newQty = Math.max(1, (item.quantity || 1) + delta);
    onUpdateQty(item.id, newQty);
  }, [item.id, item.quantity, onUpdateQty]);

  return (
    <View style={[styles.container, isCritical && styles.criticalBorder]}>
      {/* ── Main Row ──────────────────────────────────────── */}
      <View style={styles.mainRow}>
        {/* Packed Toggle */}
        <TouchableOpacity
          style={styles.packedBtn}
          onPress={() => onTogglePacked(item.id, !isPacked)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name={isPacked ? 'checkbox' : 'square-outline'}
            size={20}
            color={isPacked ? '#4CAF50' : 'rgba(138,138,133,0.35)'}
          />
        </TouchableOpacity>

        {/* Item Info */}
        <TouchableOpacity style={styles.infoCol} onPress={() => onEdit(item)} activeOpacity={0.7}>
          <Text
            style={[styles.itemName, isPacked && styles.itemNamePacked]}
            numberOfLines={1}
          >
            {item.name}
          </Text>
          <View style={styles.metaRow}>
            {isCritical && (
              <View style={styles.criticalBadge}>
                <Ionicons name="alert-circle" size={8} color={TACTICAL.danger} />
                <Text style={styles.criticalText}>CRITICAL</Text>
              </View>
            )}
            {isLiquid && liquidInfo && (
              <View style={styles.liquidBadge}>
                <Ionicons name="water" size={8} color="#4FC3F7" />
                <Text style={styles.liquidText}>
                  {liquidInfo.amount} {liquidInfo.unit === 'gallons' ? 'gal' : 'L'}
                  {liquidInfo.type !== 'water' ? ` (${liquidInfo.type})` : ''}
                </Text>
              </View>
            )}
            {totalWeight > 0 && (
              <Text style={styles.weightText}>
                {totalWeight >= 100 ? Math.round(totalWeight) : totalWeight.toFixed(1)} lb
              </Text>
            )}
          </View>
        </TouchableOpacity>

        {/* Qty Stepper */}
        <View style={styles.qtyStepper}>
          <TouchableOpacity style={styles.qtyBtn} onPress={() => handleQtyChange(-1)}>
            <Ionicons name="remove" size={12} color={TACTICAL.textMuted} />
          </TouchableOpacity>
          <Text style={styles.qtyValue}>{item.quantity || 1}</Text>
          <TouchableOpacity style={styles.qtyBtn} onPress={() => handleQtyChange(1)}>
            <Ionicons name="add" size={12} color={containerColor} />
          </TouchableOpacity>
        </View>

        {/* Expand Toggle */}
        <TouchableOpacity
          style={styles.expandBtn}
          onPress={() => setExpanded(!expanded)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name={expanded ? 'chevron-up' : 'ellipsis-vertical'}
            size={14}
            color={TACTICAL.textMuted}
          />
        </TouchableOpacity>
      </View>

      {/* ── Expanded Actions ──────────────────────────────── */}
      {expanded && (
        <View style={styles.expandedRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => onEdit(item)}>
            <Ionicons name="create-outline" size={14} color={TACTICAL.amber} />
            <Text style={[styles.actionText, { color: TACTICAL.amber }]}>EDIT</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => onDelete(item.id)}>
            <Ionicons name="trash-outline" size={14} color={TACTICAL.danger} />
            <Text style={[styles.actionText, { color: TACTICAL.danger }]}>DELETE</Text>
          </TouchableOpacity>
          {item.notes && !isLiquid && (
            <View style={styles.notesWrap}>
              <Text style={styles.notesText} numberOfLines={2}>{item.notes}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

/**
 * Parse liquid metadata from notes field.
 * Format: [LIQUID:type:amount:unit]
 */
function parseLiquidNotes(notes: string): { type: string; amount: number; unit: string } | null {
  const match = notes.match(/\[LIQUID:(\w+):([\d.]+):(\w+)\]/);
  if (!match) return null;
  return {
    type: match[1],
    amount: parseFloat(match[2]),
    unit: match[3],
  };
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: TACTICAL.panel,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    marginBottom: 4,
    overflow: 'hidden',
  },
  criticalBorder: {
    borderLeftWidth: 3,
    borderLeftColor: TACTICAL.danger,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 6,
  },
  packedBtn: {
    padding: 2,
  },
  infoCol: {
    flex: 1,
    marginHorizontal: 2,
  },
  itemName: {
    fontSize: 13,
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
  criticalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    backgroundColor: `${TACTICAL.danger}15`,
    borderRadius: 3,
  },
  criticalText: {
    fontSize: 7,
    fontWeight: '900',
    color: TACTICAL.danger,
    letterSpacing: 0.5,
  },
  liquidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    backgroundColor: 'rgba(79, 195, 247, 0.12)',
    borderRadius: 3,
  },
  liquidText: {
    fontSize: 7,
    fontWeight: '800',
    color: '#4FC3F7',
    letterSpacing: 0.3,
  },
  weightText: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.amber,
    fontFamily: 'Courier',
  },
  qtyStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TACTICAL.bg,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  qtyBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  qtyValue: {
    fontSize: 12,
    fontWeight: '900',
    color: TACTICAL.text,
    fontFamily: 'Courier',
    minWidth: 18,
    textAlign: 'center',
  },
  expandBtn: {
    padding: 4,
  },
  expandedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: TACTICAL.border,
    backgroundColor: TACTICAL.bg,
    flexWrap: 'wrap',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  actionText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  notesWrap: {
    flex: 1,
    minWidth: 100,
  },
  notesText: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    fontStyle: 'italic',
  },
});



