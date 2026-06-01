// ============================================================
// REMOTE EXPLORER PANEL — Remote Zone Discovery Section
// ============================================================
// Phase 4: Remote Explorer Integration
//
// Bottom section of the Discover tab displaying remote
// exploration zones. Each zone shows isolation score, nearest
// town, terrain type, suggested camps, and optional rig
// compatibility. Selecting a zone opens the detail modal.
//
// Zones function independently — no route or expedition required.
// ============================================================

import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, GOLD_RAIL, ECS } from '../../lib/theme';
import { hapticMicro } from '../../lib/haptics';
import type { RemoteZone } from '../../lib/remoteExplorerEngine';
import type { CompatibilityResult } from '../../lib/rigCompatibilityEngine';
import RemoteZoneCard from './RemoteZoneCard';
import RemoteZoneDetailModal from './RemoteZoneDetailModal';

interface RemoteExplorerPanelProps {
  zones: RemoteZone[];
  zoneCompatResults: Map<string, CompatibilityResult>;
  hasVehicle: boolean;
}

// ── Terrain Filter Categories ───────────────────────────────
const TERRAIN_FILTERS = [
  { key: 'all',     label: 'ALL',     icon: 'globe-outline',      color: TACTICAL.amber },
  { key: 'desert',  label: 'DESERT',  icon: 'sunny-outline',      color: 'rgba(200, 150, 60, 0.85)' },
  { key: 'canyon',  label: 'CANYON',   icon: 'layers-outline',     color: 'rgba(200, 120, 80, 0.85)' },
  { key: 'forest',  label: 'FOREST',  icon: 'leaf-outline',       color: 'rgba(80, 170, 120, 0.85)' },
  { key: 'alpine',  label: 'ALPINE',  icon: 'snow-outline',       color: 'rgba(100, 160, 220, 0.85)' },
  { key: 'mountain',label: 'MOUNTAIN',icon: 'trending-up-outline',color: 'rgba(140, 140, 100, 0.85)' },
];

// ── Quick Stats ─────────────────────────────────────────────
function QuickStat({ label, value, icon, color }: { label: string; value: string; icon: string; color: string }) {
  return (
    <View style={s.quickStat}>
      <Ionicons name={icon as any} size={12} color={color} />
      <Text style={[s.quickStatValue, { color }]}>{value}</Text>
      <Text style={s.quickStatLabel}>{label}</Text>
    </View>
  );
}

export default function RemoteExplorerPanel({
  zones,
  zoneCompatResults,
  hasVehicle,
}: RemoteExplorerPanelProps) {
  const [activeTerrain, setActiveTerrain] = useState<string>('all');
  const [selectedZone, setSelectedZone] = useState<RemoteZone | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);

  // Filter zones by terrain
  const filteredZones = useMemo(() => {
    if (activeTerrain === 'all') return zones;
    return zones.filter(z =>
      z.terrainType.toLowerCase().includes(activeTerrain)
    );
  }, [zones, activeTerrain]);

  // Compute aggregate stats
  const stats = useMemo(() => {
    let totalCamps = 0;
    let maxIsolation = 0;
    let totalAcres = 0;
    let avgIsolation = 0;

    zones.forEach(z => {
      totalCamps += z.suggestedCamps;
      if (z.isolationScore > maxIsolation) maxIsolation = z.isolationScore;
      totalAcres += z.estimatedAcres;
      avgIsolation += z.isolationScore;
    });

    if (zones.length > 0) avgIsolation = avgIsolation / zones.length;

    return {
      totalZones: zones.length,
      totalCamps,
      maxIsolation,
      totalAcres,
      avgIsolation: avgIsolation.toFixed(1),
    };
  }, [zones]);

  const handleSelectZone = (zone: RemoteZone) => {
    hapticMicro();
    setSelectedZone(zone);
    setDetailVisible(true);
  };

  const handleCloseDetail = () => {
    setDetailVisible(false);
    setTimeout(() => setSelectedZone(null), 300);
  };

  const handleFilterTerrain = (key: string) => {
    hapticMicro();
    setActiveTerrain(key);
  };

  return (
    <View style={s.panel}>
      {/* Panel Header */}
      <View style={s.panelHeader}>
        <View style={s.panelHeaderLeft}>
          <View style={s.panelIconWrap}>
            <Ionicons name="compass-outline" size={16} color={TACTICAL.amber} />
          </View>
          <View>
            <Text style={s.panelLabel}>REMOTE EXPLORE</Text>
            <Text style={s.panelDesc}>Explore remote zones without a planned expedition</Text>
          </View>
        </View>
      </View>

      {/* Gold divider */}
      <View style={s.goldDivider} />

      {/* Quick Stats Summary */}
      <View style={s.quickStatsRow}>
        <QuickStat label="ZONES" value={`${stats.totalZones}`} icon="map-outline" color={TACTICAL.amber} />
        <View style={s.quickStatDivider} />
        <QuickStat label="TOTAL CAMPS" value={`${stats.totalCamps}`} icon="bonfire-outline" color="#66BB6A" />
        <View style={s.quickStatDivider} />
        <QuickStat label="AVG ISOLATION" value={stats.avgIsolation} icon="radio-outline" color="#E67E22" />
        <View style={s.quickStatDivider} />
        <QuickStat label="TOTAL AREA" value={`${Math.round(stats.totalAcres / 1000000)}M`} icon="expand-outline" color="#5AC8FA" />
      </View>

      {/* Terrain Filter Bar */}
      <View style={s.filterSection}>
        <Text style={s.filterSectionLabel}>FILTER BY TERRAIN</Text>
        <View style={s.filterRow}>
          {TERRAIN_FILTERS.map(f => {
            const isActive = activeTerrain === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                style={[
                  s.filterChip,
                  isActive && { borderColor: f.color, backgroundColor: f.color + '14' },
                ]}
                activeOpacity={0.8}
                onPress={() => handleFilterTerrain(f.key)}
              >
                <Ionicons name={f.icon as any} size={10} color={isActive ? f.color : TACTICAL.textMuted} />
                <Text style={[s.filterChipText, isActive && { color: f.color }]}>{f.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Gold divider */}
      <View style={s.goldDividerSub} />

      {/* Zone Count */}
      <View style={s.zoneCountRow}>
        <Text style={s.zoneCountText}>
          {filteredZones.length} REMOTE ZONE{filteredZones.length !== 1 ? 'S' : ''}
          {activeTerrain !== 'all' ? ` · ${activeTerrain.toUpperCase()} TERRAIN` : ''}
        </Text>
        {activeTerrain !== 'all' && (
          <TouchableOpacity
            style={s.clearBtn}
            onPress={() => {
              hapticMicro();
              setActiveTerrain('all');
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="close-circle-outline" size={11} color={TACTICAL.textMuted} />
            <Text style={s.clearBtnText}>CLEAR</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Zone Cards */}
      <View style={s.zoneCards}>
        {filteredZones.map(zone => (
          <RemoteZoneCard
            key={zone.id}
            zone={zone}
            compatResult={zoneCompatResults.get(zone.id) || null}
            hasVehicle={hasVehicle}
            onSelect={() => handleSelectZone(zone)}
          />
        ))}

        {/* Empty filter state */}
        {filteredZones.length === 0 && (
          <View style={s.emptyFilter}>
            <Ionicons name="search-outline" size={24} color={TACTICAL.textMuted} />
            <Text style={s.emptyFilterTitle}>NO MATCHING ZONES</Text>
            <Text style={s.emptyFilterDesc}>
              No remote zones match the "{activeTerrain}" terrain filter.
            </Text>
            <TouchableOpacity
              style={s.clearFilterBtn}
              onPress={() => setActiveTerrain('all')}
              activeOpacity={0.8}
            >
              <Text style={s.clearFilterBtnText}>SHOW ALL ZONES</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Footer */}
      <View style={s.panelFooter}>
        <Ionicons name="information-circle-outline" size={10} color={TACTICAL.textMuted} />
        <Text style={s.panelFooterText}>
          Remote zones represent areas with high remoteness and public land access. No planned expedition or route is required. Tap a zone to explore details and map coordinates.
        </Text>
      </View>

      {/* Zone Detail Modal */}
      <RemoteZoneDetailModal
        visible={detailVisible}
        zone={selectedZone}
        compatResult={selectedZone ? (zoneCompatResults.get(selectedZone.id) || null) : null}
        hasVehicle={hasVehicle}
        onClose={handleCloseDetail}
      />
    </View>
  );
}

// ============================================================
// STYLES
// ============================================================
const s = StyleSheet.create({
  panel: {
    backgroundColor: ECS.bgPanel,
    borderRadius: ECS.radius,
    borderWidth: 1,
    borderColor: ECS.stroke,
    marginBottom: 16,
    overflow: 'hidden',
  },

  // ── Header ────────────────────────────────────────────
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
  },
  panelHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  panelIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: ECS.accentSoft,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 2.5,
  },
  panelDesc: {
    fontSize: 10,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    letterSpacing: 0.3,
    marginTop: 1,
  },

  // ── Gold Dividers ─────────────────────────────────────
  goldDivider: {
    height: GOLD_RAIL.subsectionWidth,
    backgroundColor: GOLD_RAIL.subsection,
    marginHorizontal: 14,
  },
  goldDividerSub: {
    height: GOLD_RAIL.subsectionWidth,
    backgroundColor: GOLD_RAIL.internal,
    marginHorizontal: 14,
  },

  // ── Quick Stats ───────────────────────────────────────
  quickStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  quickStat: {
    alignItems: 'center',
    flex: 1,
    gap: 3,
  },
  quickStatValue: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: 'Courier',
  },
  quickStatLabel: {
    fontSize: 6,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  quickStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: GOLD_RAIL.internal,
  },

  // ── Filter Section ────────────────────────────────────
  filterSection: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  filterSectionLabel: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
    marginBottom: 8,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
  },
  filterChipText: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },

  // ── Zone Count ────────────────────────────────────────
  zoneCountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
  },
  zoneCountText: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },

  // ── Clear Button ──────────────────────────────────────
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
  },
  clearBtnText: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },

  // ── Zone Cards ────────────────────────────────────────
  zoneCards: {
    paddingHorizontal: 10,
    paddingBottom: 4,
  },

  // ── Empty Filter State ────────────────────────────────
  emptyFilter: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 20,
    backgroundColor: ECS.bgElev,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ECS.stroke,
    marginBottom: 10,
    gap: 8,
  },
  emptyFilterTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 3,
  },
  emptyFilterDesc: {
    fontSize: 10,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },
  clearFilterBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '40',
    backgroundColor: TACTICAL.amber + '10',
    marginTop: 4,
  },
  clearFilterBtnText: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 2,
  },

  // ── Footer ────────────────────────────────────────────
  panelFooter: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: GOLD_RAIL.subsectionWidth,
    borderTopColor: GOLD_RAIL.internal,
    marginTop: 4,
  },
  panelFooterText: {
    fontSize: 9,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    lineHeight: 14,
    flex: 1,
  },
});



