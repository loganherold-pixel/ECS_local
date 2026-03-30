/**
 * Zone Detail Modal
 * Shows loadout items assigned to a specific vehicle zone.
 */
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import ECSModal from '../ECSModal';


export interface ZoneInfo {
  id: string;
  name: string;
  zone_type: string;
  slot_count: number;
  color: string | null;
  icon: string | null;
}

export interface ZoneItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  is_packed: boolean;
  is_critical: boolean;
  weight_lbs: number | null;
  storage_location: string | null;
}

interface Props {
  visible: boolean;
  zone: ZoneInfo | null;
  items: ZoneItem[];
  onClose: () => void;
}

export default function ZoneDetailModal({ visible, zone, items, onClose }: Props) {
  if (!zone) return null;

  const packedCount = items.filter(i => i.is_packed).length;
  const criticalCount = items.filter(i => i.is_critical).length;
  const totalWeight = items.reduce((sum, i) => sum + (i.weight_lbs || 0) * i.quantity, 0);
  const zoneColor = zone.color || TACTICAL.amber;

  return (
    <ECSModal visible={visible} onClose={onClose} tier="global">
      <View style={styles.overlay}>

        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={[styles.zoneColorBar, { backgroundColor: zoneColor }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.zoneName}>{zone.name}</Text>
                <Text style={styles.zoneType}>
                  {zone.zone_type.toUpperCase()} — {zone.slot_count} SLOTS
                </Text>
              </View>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={20} color={TACTICAL.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Stats Row */}
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{items.length}</Text>
              <Text style={styles.statLabel}>ITEMS</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: zoneColor + '30' }]} />
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: packedCount === items.length && items.length > 0 ? '#66BB6A' : TACTICAL.amber }]}>
                {packedCount}/{items.length}
              </Text>
              <Text style={styles.statLabel}>PACKED</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: zoneColor + '30' }]} />
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: criticalCount > 0 ? '#EF5350' : TACTICAL.textMuted }]}>
                {criticalCount}
              </Text>
              <Text style={styles.statLabel}>CRITICAL</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: zoneColor + '30' }]} />
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{totalWeight > 0 ? totalWeight.toFixed(1) : '—'}</Text>
              <Text style={styles.statLabel}>LBS</Text>
            </View>
          </View>

          {/* Capacity Bar */}
          <View style={styles.capacitySection}>
            <View style={styles.capacityHeader}>
              <Text style={styles.capacityLabel}>ZONE CAPACITY</Text>
              <Text style={styles.capacityValue}>
                {items.length} / {zone.slot_count} SLOTS USED
              </Text>
            </View>
            <View style={styles.capacityBar}>
              <View
                style={[
                  styles.capacityFill,
                  {
                    width: `${Math.min(100, (items.length / Math.max(1, zone.slot_count)) * 100)}%`,
                    backgroundColor: items.length > zone.slot_count ? '#EF5350' : zoneColor,
                  },
                ]}
              />
            </View>
          </View>

          {/* Items List */}
          <ScrollView style={styles.itemsList} showsVerticalScrollIndicator={false}>
            {items.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="cube-outline" size={36} color={TACTICAL.textMuted} />
                <Text style={styles.emptyTitle}>NO ITEMS ASSIGNED</Text>
                <Text style={styles.emptySubtext}>
                  Assign loadout items to this zone from the Loadout Editor.
                </Text>
              </View>
            ) : (
              items.map((item, idx) => (
                <View
                  key={item.id}
                  style={[
                    styles.itemRow,
                    idx < items.length - 1 && styles.itemRowBorder,
                  ]}
                >
                  <View style={styles.itemLeft}>
                    <View style={[
                      styles.packedIndicator,
                      { backgroundColor: item.is_packed ? '#66BB6A' : 'rgba(255,255,255,0.08)' },
                    ]}>
                      {item.is_packed ? (
                        <Ionicons name="checkmark" size={10} color="#fff" />
                      ) : (
                        <View style={styles.unpackedDot} />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.itemNameRow}>
                        <Text style={styles.itemName}>{item.name}</Text>
                        {item.is_critical && (
                          <View style={styles.criticalBadge}>
                            <Ionicons name="alert-circle" size={10} color="#EF5350" />
                          </View>
                        )}
                      </View>
                      <View style={styles.itemMeta}>
                        <Text style={styles.itemCategory}>{item.category.toUpperCase()}</Text>
                        {item.weight_lbs != null && item.weight_lbs > 0 && (
                          <Text style={styles.itemWeight}>{(item.weight_lbs * item.quantity).toFixed(1)} lbs</Text>
                        )}
                      </View>
                    </View>
                  </View>
                  <View style={styles.itemRight}>
                    <Text style={styles.itemQty}>x{item.quantity}</Text>
                    <Text style={[
                      styles.itemStatus,
                      { color: item.is_packed ? '#66BB6A' : TACTICAL.amber },
                    ]}>
                      {item.is_packed ? 'PACKED' : 'PENDING'}
                    </Text>
                  </View>
                </View>
              ))
            )}
            <View style={{ height: 20 }} />
          </ScrollView>
        </View>
      </View>
    </ECSModal>

  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#1A1F16',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.4)',
    borderBottomWidth: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  zoneColorBar: {
    width: 4,
    height: 36,
    borderRadius: 2,
  },
  zoneName: {
    fontSize: 16,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 0.5,
  },
  zoneType: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1.2,
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(62, 79, 60, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '900',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },
  statLabel: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 24,
  },

  // Capacity
  capacitySection: {
    marginHorizontal: 20,
    marginBottom: 14,
  },
  capacityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  capacityLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.2,
  },
  capacityValue: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.amber,
    letterSpacing: 0.5,
  },
  capacityBar: {
    height: 6,
    backgroundColor: 'rgba(62, 79, 60, 0.2)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  capacityFill: {
    height: '100%',
    borderRadius: 3,
  },

  // Items
  itemsList: {
    paddingHorizontal: 20,
    maxHeight: 400,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  emptySubtext: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  itemRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 79, 60, 0.15)',
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  packedIndicator: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unpackedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  itemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  itemName: {
    fontSize: 13,
    fontWeight: '700',
    color: TACTICAL.text,
  },
  criticalBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(239, 83, 80, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  itemCategory: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  itemWeight: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.textMuted,
  },
  itemRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  itemQty: {
    fontSize: 13,
    fontWeight: '800',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },
  itemStatus: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
  },
});



