/**
 * ContainerFrameworkStep — Step 4 of the Vehicle Configuration Wizard
 *
 * CONTAINER FRAMEWORK (Accessory-Driven)
 *   Dynamically generates container groups from Step 3 accessory selections.
 *   Only shows container groups for enabled accessories.
 *   Each group has smart default containers that work out of the box.
 *   Users can adjust slot counts but defaults allow immediate "Finish Setup".
 *
 * BACK/FORWARD DATA INTEGRITY:
 *   - When going back to Step 3 and returning, preserves user-modified slot counts
 *     for containers whose parent accessory is still enabled.
 *   - Removes orphaned containers when an accessory is disabled.
 *   - Regenerates containers for newly enabled accessories.
 *
 * FOOTER: BACK + FINISH SETUP
 */
import React, { useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';

import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import { hapticMicro } from '../../lib/haptics';
import FooterNav from '../FooterNav';
import type { AccessorySelections } from './AccessoryConfigStep';
import {
  generateContainerAllocations,
  getTotalSlots,
  getGroupCount,
  type ContainerAllocation,
} from '../../lib/accessoryContainerMapping';

// ── ECS Gold Constants ──────────────────────────────────────
const ECS_GOLD = '#C48A2C';

// ── Props ───────────────────────────────────────────────────
interface Props {
  /** Current accessory selections from Step 3 */
  accessorySelections: AccessorySelections;
  /** Current container allocations (may have user modifications) */
  containerAllocations: ContainerAllocation[];
  /** Called when allocations change (slot count adjustments) */
  onContainerAllocationsChange: (allocations: ContainerAllocation[]) => void;
  /** Navigate back to Step 3 */
  onBack: () => void;
  /** Finish Setup — completes the wizard (or advances to next step) */
  onFinish: () => void;
  /** Whether the save is in progress */
  saving: boolean;
  /** Vehicle name for display */
  vehicleName?: string | null;
  /** Override the footer NEXT button label (default: "FINISH SETUP") */
  nextLabel?: string;
  /** Override the footer NEXT button icon (default: "shield-checkmark-outline") */
  nextIcon?: string;
  /** Override the footer primary mode (default: "deploy") */
  nextMode?: 'deploy' | 'next';
}


// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function ContainerFrameworkStep({
  accessorySelections,
  containerAllocations,
  onContainerAllocationsChange,
  onBack,
  onFinish,
  saving,
  vehicleName,
  nextLabel = 'FINISH SETUP',
  nextIcon = 'shield-checkmark-outline',
  nextMode = 'deploy',
}: Props) {

  // ── Regenerate allocations when accessory selections change ──
  // This handles the case where user goes back to Step 3, changes
  // accessories, and returns to Step 4. Preserves user-modified
  // slot counts for containers that still exist.
  const prevAccessoriesRef = useRef<string>('');

  useEffect(() => {
    const accessoryKey = JSON.stringify(accessorySelections);
    if (accessoryKey === prevAccessoriesRef.current) return;
    prevAccessoriesRef.current = accessoryKey;

    // Regenerate allocations, preserving existing user modifications
    const newAllocations = generateContainerAllocations(
      accessorySelections,
      containerAllocations,
    );
    onContainerAllocationsChange(newAllocations);
  }, [accessorySelections]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Computed totals ───────────────────────────────────────
  const totalSlots = useMemo(() => getTotalSlots(containerAllocations), [containerAllocations]);
  const totalGroups = useMemo(() => getGroupCount(containerAllocations), [containerAllocations]);
  const totalContainers = containerAllocations.length;

  // ── Group allocations by groupId for display ──────────────
  const groupedAllocations = useMemo(() => {
    const groups: Map<string, { label: string; allocations: ContainerAllocation[] }> = new Map();
    for (const alloc of containerAllocations) {
      if (!groups.has(alloc.groupId)) {
        groups.set(alloc.groupId, { label: alloc.groupLabel, allocations: [] });
      }
      groups.get(alloc.groupId)!.allocations.push(alloc);
    }
    return Array.from(groups.entries());
  }, [containerAllocations]);

  // ── Slot count handlers ───────────────────────────────────
  const handleIncrement = (containerId: string) => {
    hapticMicro();
    const updated = containerAllocations.map(a =>
      a.containerId === containerId ? { ...a, slotCount: a.slotCount + 1 } : a
    );
    onContainerAllocationsChange(updated);
  };

  const handleDecrement = (containerId: string) => {
    hapticMicro();
    const updated = containerAllocations.map(a =>
      a.containerId === containerId && a.slotCount > 0
        ? { ...a, slotCount: a.slotCount - 1 }
        : a
    );
    onContainerAllocationsChange(updated);
  };

  const handleResetToDefaults = (containerId: string) => {
    hapticMicro();
    const updated = containerAllocations.map(a =>
      a.containerId === containerId ? { ...a, slotCount: a.defaultSlots } : a
    );
    onContainerAllocationsChange(updated);
  };

  return (
    <View style={styles.container}>
      {/* ── Sub-Header ──────────────────────────────────────── */}
      <View style={styles.subHeader}>
        <View style={styles.subHeaderLeft}>
          <View style={styles.subHeaderIconWrap}>
            <Ionicons name="grid-outline" size={12} color={ECS_GOLD} />
          </View>
          <View>
            <Text style={styles.subHeaderTitle}>CONTAINER FRAMEWORK</Text>
            <Text style={styles.subHeaderSubtitle}>
              {totalContainers > 0
                ? 'Containers generated from your accessories'
                : 'Enable accessories in Step 3 to generate containers'}
            </Text>
          </View>
        </View>
        {totalGroups > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{totalGroups}</Text>
          </View>
        )}
      </View>

      {/* ── Stats Strip ─────────────────────────────────────── */}
      <View style={styles.statsStrip}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{totalGroups}</Text>
          <Text style={styles.statLabel}>GROUPS</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{totalContainers}</Text>
          <Text style={styles.statLabel}>CONTAINERS</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: TACTICAL.amber }]}>{totalSlots}</Text>
          <Text style={styles.statLabel}>TOTAL SLOTS</Text>
        </View>
        {vehicleName && (
          <View style={[styles.statCard, { flex: 1.5 }]}>
            <Text style={[styles.statValue, { fontSize: 11 }]} numberOfLines={1}>{vehicleName}</Text>
            <Text style={styles.statLabel}>VEHICLE</Text>
          </View>
        )}
      </View>

      {/* ── Container List ──────────────────────────────────── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Empty State */}
        {containerAllocations.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="cube-outline" size={40} color={TACTICAL.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>NO CONTAINERS</Text>
            <Text style={styles.emptySubtext}>
              Go back to Step 3 and enable at least one accessory to generate container groups.
            </Text>
            <TouchableOpacity
              style={styles.emptyBackBtn}
              onPress={onBack}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-back" size={14} color={TACTICAL.amber} />
              <Text style={styles.emptyBackText}>BACK TO ACCESSORIES</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Hint */}
            <View style={styles.hintRow}>
              <Ionicons name="information-circle-outline" size={12} color={TACTICAL.textMuted} />
              <Text style={styles.hintText}>
                Adjust slot counts per container. Defaults are ready to go.
              </Text>
            </View>

            {/* Grouped Container Cards */}
            {groupedAllocations.map(([groupId, group]) => (
              <View key={groupId} style={styles.groupCard}>
                {/* Group Header */}
                <View style={styles.groupHeader}>
                  <View style={[
                    styles.groupAccentDot,
                    { backgroundColor: group.allocations[0]?.color || TACTICAL.amber },
                  ]} />
                  <Text style={styles.groupLabel}>{group.label.toUpperCase()}</Text>
                  <View style={styles.groupSlotsBadge}>
                    <Text style={styles.groupSlotsText}>
                      {group.allocations.reduce((s, a) => s + a.slotCount, 0)} slots
                    </Text>
                  </View>
                </View>

                {/* Container Rows */}
                {group.allocations.map((alloc, idx) => (
                  <View
                    key={alloc.containerId}
                    style={[
                      styles.containerRow,
                      idx < group.allocations.length - 1 && styles.containerRowBorder,
                    ]}
                  >
                    {/* Accent bar */}
                    <View style={[styles.containerAccentBar, { backgroundColor: alloc.color }]} />

                    {/* Icon */}
                    <View style={[styles.containerIconWrap, { borderColor: alloc.color + '40' }]}>
                      <Ionicons name={alloc.icon as any} size={16} color={alloc.color} />
                    </View>

                    {/* Info */}
                    <View style={styles.containerInfo}>
                      <Text style={styles.containerName}>{alloc.name}</Text>
                      <Text style={styles.containerType}>{alloc.zoneType}</Text>
                    </View>

                    {/* Slot Controls */}
                    <View style={styles.slotControls}>
                      <TouchableOpacity
                        style={styles.slotBtn}
                        onPress={() => handleDecrement(alloc.containerId)}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name="remove"
                          size={16}
                          color={alloc.slotCount > 0 ? TACTICAL.text : TACTICAL.textMuted}
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.slotBadge}
                        onPress={() => handleResetToDefaults(alloc.containerId)}
                        activeOpacity={0.8}
                      >
                        <Text style={[
                          styles.slotCount,
                          alloc.slotCount !== alloc.defaultSlots && styles.slotCountModified,
                        ]}>
                          {alloc.slotCount}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.slotBtn}
                        onPress={() => handleIncrement(alloc.containerId)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="add" size={16} color={TACTICAL.amber} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            ))}

            {/* Slot Distribution Bar */}
            {totalSlots > 0 && (
              <View style={styles.slotBarContainer}>
                <Text style={styles.slotBarLabel}>SLOT DISTRIBUTION</Text>
                <View style={styles.slotBar}>
                  {containerAllocations.map((alloc, idx) => (
                    <View
                      key={alloc.containerId}
                      style={[
                        styles.slotBarSegment,
                        {
                          backgroundColor: alloc.color,
                          flex: alloc.slotCount || 0.01,
                        },
                        idx === 0 && { borderTopLeftRadius: 4, borderBottomLeftRadius: 4 },
                        idx === containerAllocations.length - 1 && { borderTopRightRadius: 4, borderBottomRightRadius: 4 },
                      ]}
                    />
                  ))}
                </View>
                <View style={styles.slotBarLegend}>
                  {containerAllocations.map((alloc) => (
                    <View key={alloc.containerId} style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: alloc.color }]} />
                      <Text style={styles.legendText}>{alloc.name}: {alloc.slotCount}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Info Box */}
            <View style={styles.infoBox}>
              <Ionicons name="checkmark-circle-outline" size={16} color="#66BB6A" />
              <Text style={styles.infoText}>
                {totalSlots > 0
                  ? `Ready to deploy: ${totalSlots} loadout slots across ${totalContainers} containers in ${totalGroups} groups. Tap FINISH SETUP to complete.`
                  : 'Use the + buttons above to add loadout slots to each container.'}
              </Text>
            </View>
          </>
        )}

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* ── Footer: BACK + NEXT/FINISH ───────────────────────── */}
      <FooterNav
        canGoBack={true}
        canGoNext={!saving && containerAllocations.length > 0}
        backLabel="BACK"
        nextLabel={nextLabel}
        onBack={onBack}
        onNext={onFinish}
        primaryMode={nextMode}
        loading={saving}
        nextIcon={nextIcon}
      />

    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // ── Sub-Header ────────────────────────────────────────────
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 79, 60, 0.2)',
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  subHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  subHeaderIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: 'rgba(196, 138, 44, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subHeaderTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 1,
  },
  subHeaderSubtitle: {
    fontSize: 8,
    color: TACTICAL.textMuted,
    letterSpacing: 0.3,
    marginTop: 1,
  },
  countBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(102, 187, 106, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(102, 187, 106, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#66BB6A',
  },

  // ── Stats Strip ───────────────────────────────────────────
  statsStrip: {
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 79, 60, 0.12)',
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TACTICAL.panel,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.2)',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '900',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },
  statLabel: {
    fontSize: 6,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
    marginTop: 1,
  },

  // ── Scroll ────────────────────────────────────────────────
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 12,
  },

  // ── Hint ──────────────────────────────────────────────────
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  hintText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#8A8A85',
    letterSpacing: 0.5,
    fontStyle: 'italic',
  },

  // ── Empty State ───────────────────────────────────────────
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(62, 79, 60, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  emptySubtext: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 24,
  },
  emptyBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.4)',
    backgroundColor: 'rgba(196, 138, 44, 0.08)',
    marginTop: 8,
  },
  emptyBackText: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1,
  },

  // ── Group Card ────────────────────────────────────────────
  groupCard: {
    backgroundColor: TACTICAL.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.3)',
    marginBottom: 10,
    overflow: 'hidden',
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 79, 60, 0.15)',
  },
  groupAccentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  groupLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 1.2,
    flex: 1,
  },
  groupSlotsBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(196, 138, 44, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.25)',
  },
  groupSlotsText: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 0.5,
  },

  // ── Container Row ─────────────────────────────────────────
  containerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    gap: 8,
  },
  containerRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 79, 60, 0.08)',
  },
  containerAccentBar: {
    width: 3,
    height: 36,
    borderRadius: 2,
  },
  containerIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(62, 79, 60, 0.12)',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  containerInfo: {
    flex: 1,
  },
  containerName: {
    fontSize: 12,
    fontWeight: '700',
    color: TACTICAL.text,
  },
  containerType: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 0.8,
    marginTop: 1,
  },

  // ── Slot Controls ─────────────────────────────────────────
  slotControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  slotBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(62, 79, 60, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotBadge: {
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 6,
    minWidth: 36,
  },
  slotCount: {
    fontSize: 16,
    fontWeight: '900',
    color: TACTICAL.amber,
    textAlign: 'center',
  },
  slotCountModified: {
    color: '#64DFDF',
  },

  // ── Slot Bar ──────────────────────────────────────────────
  slotBarContainer: {
    marginBottom: 12,
    marginTop: 4,
  },
  slotBarLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  slotBar: {
    flexDirection: 'row',
    height: 12,
    borderRadius: 4,
    overflow: 'hidden',
    gap: 2,
  },
  slotBarSegment: {
    height: '100%',
  },
  slotBarLegend: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendText: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
  },

  // ── Info Box ──────────────────────────────────────────────
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    backgroundColor: 'rgba(102, 187, 106, 0.06)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(102, 187, 106, 0.2)',
  },
  infoText: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    lineHeight: 16,
    flex: 1,
  },
});



