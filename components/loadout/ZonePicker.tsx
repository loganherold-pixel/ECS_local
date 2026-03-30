// ============================================================
// ZONE PICKER — Vehicle Zone Selector for Loadout Items
// ============================================================
// Reads cached vehicle zones OR container zones from the
// accessory framework and displays them as selectable chips.
//
// PRIORITY ORDER:
//   1. containerZones (from accessory framework) — when available
//   2. zones (legacy CachedZone[]) — fallback
//
// Usage:
//   <ZonePicker
//     zones={cachedZones}
//     containerZones={containerZones}
//     selectedZone={storageLocation}
//     onSelect={(zoneName) => setStorageLocation(zoneName)}
//   />
// ============================================================

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import ECSModal from '../ECSModal';

import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import type { CachedZone } from '../../lib/expeditionCache';
import type { ContainerZone } from '../../lib/accessoryFramework';

// ── Zone type icon mapping (legacy) ──────────────────────────
const ZONE_TYPE_ICONS: Record<string, string> = {
  area: 'resize-outline',
  container: 'cube-outline',
  slot: 'grid-outline',
  drawer: 'file-tray-stacked-outline',
  rack: 'layers-outline',
  hitch: 'link-outline',
};

// ── Zone color fallbacks (legacy) ────────────────────────────
const ZONE_TYPE_COLORS: Record<string, string> = {
  area: '#66BB6A',
  container: '#42A5F5',
  slot: '#AB47BC',
  drawer: '#FF7043',
  rack: '#FFD54F',
  hitch: '#78909C',
};

function getZoneIcon(zoneType: string): string {
  return ZONE_TYPE_ICONS[zoneType] || 'cube-outline';
}

function getZoneColor(zone: CachedZone): string {
  return zone.color || ZONE_TYPE_COLORS[zone.zone_type] || TACTICAL.amber;
}

// ── Normalized zone shape for unified rendering ──────────────
interface NormalizedZone {
  id: string;
  displayName: string;
  icon: string;
  color: string;
  sortOrder: number;
  /** The value passed to onSelect — label for container zones, name for legacy */
  selectValue: string;
  /** Optional subtitle for extra context */
  subtitle: string | null;
  /** Source type for rendering differences */
  source: 'container' | 'legacy';
}

/**
 * Normalize ContainerZone[] into a unified shape.
 * onSelect value = zone.label (matches storage_location persistence)
 */
function normalizeContainerZones(zones: ContainerZone[]): NormalizedZone[] {
  return zones.map(z => ({
    id: z.id,
    displayName: z.label,
    icon: z.icon || 'cube-outline',
    color: z.color || TACTICAL.amber,
    sortOrder: z.sortOrder,
    selectValue: z.label,
    subtitle: z.status === 'planned' ? 'PLANNED' : null,
    source: 'container' as const,
  }));
}

/**
 * Normalize CachedZone[] into a unified shape.
 * onSelect value = zone.name (legacy behavior)
 */
function normalizeLegacyZones(zones: CachedZone[]): NormalizedZone[] {
  return zones.map(z => ({
    id: z.id,
    displayName: z.name,
    icon: z.icon || getZoneIcon(z.zone_type),
    color: z.color || getZoneColor(z),
    sortOrder: z.sort_order,
    selectValue: z.name,
    subtitle: `${z.zone_type.toUpperCase()} — ${z.slot_count} slots`,
    source: 'legacy' as const,
  }));
}

// ── Props ────────────────────────────────────────────────────
interface ZonePickerProps {
  /** Legacy vehicle zones (CachedZone[]) */
  zones: CachedZone[];
  /** Container zones from accessory framework — takes priority when non-empty */
  containerZones?: ContainerZone[];
  selectedZone: string | null;
  onSelect: (zoneName: string | null) => void;
  label?: string;
  compact?: boolean;
}

export default function ZonePicker({
  zones,
  containerZones,
  selectedZone,
  onSelect,
  label = 'CONTAINER / ZONE',
  compact = false,
}: ZonePickerProps) {
  const [showModal, setShowModal] = useState(false);

  // ── Resolve which zones to display ─────────────────────────
  // Priority: containerZones > legacy zones
  const normalizedZones = useMemo<NormalizedZone[]>(() => {
    if (containerZones && containerZones.length > 0) {
      return normalizeContainerZones(containerZones);
    }
    if (zones && zones.length > 0) {
      return normalizeLegacyZones(zones);
    }
    return [];
  }, [containerZones, zones]);

  const isContainerMode = !!(containerZones && containerZones.length > 0);

  // ── Find the currently selected normalized zone ────────────
  const selectedNormalized = useMemo(() => {
    if (!selectedZone) return null;
    const sel = selectedZone.trim().toLowerCase();
    return normalizedZones.find(z =>
      z.selectValue.toLowerCase() === sel ||
      z.displayName.toLowerCase() === sel ||
      z.id.toLowerCase() === sel
    ) || null;
  }, [selectedZone, normalizedZones]);

  if (normalizedZones.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyRow}>
          <Ionicons name="alert-circle-outline" size={14} color={TACTICAL.textMuted} />
          <Text style={styles.emptyText}>
            No container framework configured. Set up accessories in Vehicle Config to enable zone assignment.
          </Text>
        </View>
      </View>
    );
  }

  // ── Compact mode: button that opens a modal ────────────────
  if (compact) {
    return (
      <View>
        <TouchableOpacity
          style={[
            styles.compactButton,
            selectedNormalized && styles.compactButtonSelected,
          ]}
          onPress={() => setShowModal(true)}
          activeOpacity={0.7}
        >
          {selectedNormalized ? (
            <View style={styles.compactSelectedRow}>
              <View style={[styles.compactIconDot, { backgroundColor: `${selectedNormalized.color}20` }]}>
                <Ionicons
                  name={selectedNormalized.icon as any}
                  size={14}
                  color={selectedNormalized.color}
                />
              </View>
              <Text style={styles.compactSelectedText} numberOfLines={1}>
                {selectedNormalized.displayName}
              </Text>
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation?.();
                  onSelect(null);
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={16} color={TACTICAL.textMuted} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.compactPlaceholderRow}>
              <Ionicons name={isContainerMode ? 'cube-outline' : 'location-outline'} size={14} color={TACTICAL.textMuted} />
              <Text style={styles.compactPlaceholderText}>
                {isContainerMode ? 'Assign container...' : 'Assign zone...'}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        <ECSModal visible={showModal} onClose={() => setShowModal(false)} tier="global">
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowModal(false)}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Ionicons
                  name={isContainerMode ? 'cube-outline' : 'location-outline'}
                  size={16}
                  color={TACTICAL.amber}
                />
                <Text style={styles.modalTitle}>{label}</Text>
                <TouchableOpacity onPress={() => setShowModal(false)}>
                  <Ionicons name="close" size={20} color={TACTICAL.textMuted} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                {/* None option */}
                <TouchableOpacity
                  style={[styles.modalZoneRow, !selectedZone && styles.modalZoneRowActive]}
                  onPress={() => {
                    onSelect(null);
                    setShowModal(false);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.modalZoneIcon}>
                    <Ionicons name="remove-circle-outline" size={18} color={TACTICAL.textMuted} />
                  </View>
                  <View style={styles.modalZoneInfo}>
                    <Text style={styles.modalZoneName}>UNASSIGNED</Text>
                    <Text style={styles.modalZoneType}>No storage location</Text>
                  </View>
                  {!selectedZone && (
                    <Ionicons name="checkmark-circle" size={20} color={TACTICAL.amber} />
                  )}
                </TouchableOpacity>

                {normalizedZones
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((zone) => {
                    const isSelected = selectedNormalized?.id === zone.id;
                    return (
                      <TouchableOpacity
                        key={zone.id}
                        style={[styles.modalZoneRow, isSelected && styles.modalZoneRowActive]}
                        onPress={() => {
                          onSelect(zone.selectValue);
                          setShowModal(false);
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.modalZoneIcon, { backgroundColor: `${zone.color}18` }]}>
                          <Ionicons
                            name={zone.icon as any}
                            size={18}
                            color={zone.color}
                          />
                        </View>
                        <View style={styles.modalZoneInfo}>
                          <Text style={[styles.modalZoneName, isSelected && { color: zone.color }]}>
                            {zone.displayName}
                          </Text>
                          {zone.subtitle && (
                            <Text style={styles.modalZoneType}>{zone.subtitle}</Text>
                          )}
                        </View>
                        {isSelected && (
                          <Ionicons name="checkmark-circle" size={20} color={zone.color} />
                        )}
                      </TouchableOpacity>
                    );
                  })}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </ECSModal>
      </View>
    );
  }

  // ── Full mode: inline scrollable chips (for Add Item modal) ─
  return (
    <View style={styles.container}>
      {label && (
        <View style={styles.labelRow}>
          <Text style={styles.label}>{label}</Text>
          {isContainerMode && (
            <View style={styles.frameworkBadge}>
              <Ionicons name="cube" size={9} color={TACTICAL.amber} />
              <Text style={styles.frameworkBadgeText}>FRAMEWORK</Text>
            </View>
          )}
        </View>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipScroll}
      >
        {/* None chip */}
        <TouchableOpacity
          style={[styles.chip, !selectedZone && styles.chipActive]}
          onPress={() => onSelect(null)}
          activeOpacity={0.7}
        >
          <Ionicons
            name="remove-circle-outline"
            size={12}
            color={!selectedZone ? TACTICAL.amber : TACTICAL.textMuted}
          />
          <Text style={[styles.chipText, !selectedZone && styles.chipTextActive]}>
            NONE
          </Text>
        </TouchableOpacity>

        {normalizedZones
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((zone) => {
            const isSelected = selectedNormalized?.id === zone.id;
            return (
              <TouchableOpacity
                key={zone.id}
                style={[
                  styles.chip,
                  isContainerMode && styles.chipContainer,
                  isSelected && { borderColor: zone.color, backgroundColor: `${zone.color}12` },
                ]}
                onPress={() => onSelect(zone.selectValue)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={zone.icon as any}
                  size={12}
                  color={isSelected ? zone.color : TACTICAL.textMuted}
                />
                <Text style={[styles.chipText, isSelected && { color: zone.color }]}>
                  {zone.displayName.toUpperCase()}
                </Text>
                {zone.subtitle && zone.source === 'container' && zone.subtitle === 'PLANNED' && (
                  <View style={styles.plannedDot} />
                )}
              </TouchableOpacity>
            );
          })}
      </ScrollView>

      {selectedNormalized && (
        <View style={styles.selectedIndicator}>
          <View style={[styles.selectedIconDot, { backgroundColor: `${selectedNormalized.color}20` }]}>
            <Ionicons name={selectedNormalized.icon as any} size={11} color={selectedNormalized.color} />
          </View>
          <Text style={styles.selectedText}>
            Stored in: <Text style={[styles.selectedBold, { color: selectedNormalized.color }]}>{selectedNormalized.displayName}</Text>
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    marginBottom: 18,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },
  frameworkBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'rgba(196,138,44,0.1)',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.25)',
  },
  frameworkBadgeText: {
    fontSize: 7,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1,
  },
  chipScroll: {
    gap: 6,
    paddingRight: 12,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: TACTICAL.bg,
  },
  chipContainer: {
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  chipActive: {
    borderColor: TACTICAL.amber,
    backgroundColor: 'rgba(196,138,44,0.1)',
  },
  chipText: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },
  chipTextActive: {
    color: TACTICAL.amber,
  },
  chipSlots: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    overflow: 'hidden',
  },
  plannedDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#FFB74D',
    marginLeft: 2,
  },
  selectedIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 2,
  },
  selectedIconDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedText: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    fontWeight: '600',
  },
  selectedBold: {
    fontWeight: '800',
  },

  // ── Empty state ────────────────────────────────────────────
  emptyContainer: {
    marginBottom: 18,
  },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    backgroundColor: 'rgba(196,138,44,0.06)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.15)',
  },
  emptyText: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    lineHeight: 16,
    flex: 1,
  },

  // ── Compact mode ───────────────────────────────────────────
  compactButton: {
    backgroundColor: TACTICAL.panel,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  compactButtonSelected: {
    borderColor: 'rgba(196,138,44,0.35)',
    backgroundColor: 'rgba(196,138,44,0.06)',
  },
  compactSelectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  compactIconDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactSelectedText: {
    fontSize: 13,
    fontWeight: '700',
    color: TACTICAL.text,
    flex: 1,
  },
  compactPlaceholderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  compactPlaceholderText: {
    fontSize: 13,
    color: TACTICAL.textMuted,
    fontWeight: '600',
  },

  // ── Modal ──────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: TACTICAL.panel,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    width: '100%',
    maxHeight: '70%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: TACTICAL.border,
  },
  modalTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
    flex: 1,
  },
  modalScroll: {
    maxHeight: 400,
  },
  modalZoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62,79,60,0.1)',
  },
  modalZoneRowActive: {
    backgroundColor: 'rgba(196,138,44,0.06)',
  },
  modalZoneIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalZoneInfo: {
    flex: 1,
  },
  modalZoneName: {
    fontSize: 13,
    fontWeight: '700',
    color: TACTICAL.text,
    letterSpacing: 0.3,
  },
  modalZoneType: {
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
    marginTop: 2,
  },
});



