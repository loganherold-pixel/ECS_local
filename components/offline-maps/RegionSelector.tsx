/**
 * Region Selector — Create new offline map cache regions
 *
 * Two modes:
 *   1. Route Corridor: Select a run/route and buffer width
 *   2. Bounding Box: Manually enter coordinates
 *
 * Shows:
 *   - Run/route picker
 *   - Corridor width selector
 *   - Zoom range slider
 *   - Map style picker
 *   - Tile count + size estimate
 *   - Tile breakdown per zoom level
 *   - Create button
 */
import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, StyleSheet } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL, TYPO, DENSITY } from '../../lib/theme';
import { MAP_STYLES, type MapStyleKey } from '../../lib/mapConfig';
import { runStore, type ECSRun } from '../../lib/runStore';
import { routeStore, type ImportedRoute } from '../../lib/routeStore';
import {
  computeRouteCorridor,
  countTilesForRegion,
  estimateSizeMB,
  getTileBreakdown,
  type TileBounds,
} from '../../lib/tileCacheStore';

type SelectionMode = 'route' | 'bbox';

interface Props {
  onCreateFromRoute: (
    name: string,
    points: Array<{ lat: number; lng: number }>,
    corridorMiles: number,
    zoomMin: number,
    zoomMax: number,
    styleKey: string
  ) => void;
  onCreateFromBounds: (
    name: string,
    bounds: TileBounds,
    zoomMin: number,
    zoomMax: number,
    styleKey: string
  ) => void;
  onCancel: () => void;
}

const CORRIDOR_OPTIONS = [
  { label: '0.5 MI', value: 0.5 },
  { label: '1 MI', value: 1 },
  { label: '3 MI', value: 3 },
  { label: '5 MI', value: 5 },
  { label: '10 MI', value: 10 },
];

const ZOOM_PRESETS = [
  { label: 'OVERVIEW', min: 5, max: 10, desc: 'Regional context' },
  { label: 'NAVIGATION', min: 8, max: 14, desc: 'Turn-by-turn driving' },
  { label: 'DETAIL', min: 10, max: 16, desc: 'Trail-level detail' },
  { label: 'FULL', min: 5, max: 16, desc: 'All zoom levels' },
];

const AVAILABLE_STYLES = MAP_STYLES.filter(s => s.key !== 'outdoors');

export default function RegionSelector({ onCreateFromRoute, onCreateFromBounds, onCancel }: Props) {
  const [mode, setMode] = useState<SelectionMode>('route');
  const [selectedRun, setSelectedRun] = useState<ECSRun | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<ImportedRoute | null>(null);
  const [corridorMiles, setCorridorMiles] = useState(3);
  const [zoomMin, setZoomMin] = useState(8);
  const [zoomMax, setZoomMax] = useState(14);
  const [styleKey, setStyleKey] = useState<MapStyleKey>('tactical');
  const [regionName, setRegionName] = useState('');
  const [showBreakdown, setShowBreakdown] = useState(false);

  // Bounding box manual entry
  const [bboxMinLat, setBboxMinLat] = useState('');
  const [bboxMaxLat, setBboxMaxLat] = useState('');
  const [bboxMinLng, setBboxMinLng] = useState('');
  const [bboxMaxLng, setBboxMaxLng] = useState('');

  const runs = useMemo(() => runStore.getAll(), []);
  const routes = useMemo(() => routeStore.getAll(), []);

  // Compute bounds and tile estimates
  const routePoints = useMemo(() => {
    if (selectedRun) {
      return selectedRun.points.map(p => ({ lat: p.lat, lng: p.lng }));
    }
    if (selectedRoute) {
      const pts: Array<{ lat: number; lng: number }> = [];
      for (const seg of selectedRoute.segments) {
        for (const p of seg.points) {
          pts.push({ lat: p.lat, lng: p.lon });
        }
      }
      if (pts.length === 0) {
        for (const wp of selectedRoute.waypoints) {
          pts.push({ lat: wp.lat, lng: wp.lon });
        }
      }
      return pts;
    }
    return [];
  }, [selectedRun, selectedRoute]);

  const computedBounds = useMemo((): TileBounds | null => {
    if (mode === 'route' && routePoints.length > 0) {
      return computeRouteCorridor(routePoints, corridorMiles);
    }
    if (mode === 'bbox') {
      const minLat = parseFloat(bboxMinLat);
      const maxLat = parseFloat(bboxMaxLat);
      const minLng = parseFloat(bboxMinLng);
      const maxLng = parseFloat(bboxMaxLng);
      if (!isNaN(minLat) && !isNaN(maxLat) && !isNaN(minLng) && !isNaN(maxLng)) {
        return { minLat, maxLat, minLng, maxLng };
      }
    }
    return null;
  }, [mode, routePoints, corridorMiles, bboxMinLat, bboxMaxLat, bboxMinLng, bboxMaxLng]);

  const tileCount = useMemo(() => {
    if (!computedBounds) return 0;
    return countTilesForRegion(computedBounds, zoomMin, zoomMax);
  }, [computedBounds, zoomMin, zoomMax]);

  const estimatedSize = useMemo(() => {
    return estimateSizeMB(tileCount, styleKey);
  }, [tileCount, styleKey]);

  const breakdown = useMemo(() => {
    if (!computedBounds) return [];
    return getTileBreakdown(computedBounds, zoomMin, zoomMax);
  }, [computedBounds, zoomMin, zoomMax]);

  const defaultName = useMemo(() => {
    if (selectedRun) return `${selectedRun.title} — ${corridorMiles}mi`;
    if (selectedRoute) return `${selectedRoute.name} — ${corridorMiles}mi`;
    return 'Custom Region';
  }, [selectedRun, selectedRoute, corridorMiles]);

  const canCreate = computedBounds !== null && tileCount > 0 && tileCount < 100000;

  const handleCreate = useCallback(() => {
    if (!computedBounds) return;
    const name = regionName.trim() || defaultName;

    if (mode === 'route') {
      onCreateFromRoute(name, routePoints, corridorMiles, zoomMin, zoomMax, styleKey);
    } else {
      onCreateFromBounds(name, computedBounds, zoomMin, zoomMax, styleKey);
    }
  }, [mode, computedBounds, regionName, defaultName, routePoints, corridorMiles, zoomMin, zoomMax, styleKey, onCreateFromRoute, onCreateFromBounds]);

  const applyZoomPreset = (preset: typeof ZOOM_PRESETS[0]) => {
    setZoomMin(preset.min);
    setZoomMax(preset.max);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>CREATE OFFLINE REGION</Text>
        <TouchableOpacity onPress={onCancel} style={styles.closeBtn}>
          <Ionicons name="close" size={18} color={TACTICAL.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Mode toggle */}
      <View style={styles.modeToggle}>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'route' && styles.modeBtnActive]}
          onPress={() => setMode('route')}
          activeOpacity={0.8}
        >
          <Ionicons name="navigate-outline" size={13} color={mode === 'route' ? TACTICAL.amber : TACTICAL.textMuted} />
          <Text style={[styles.modeBtnText, mode === 'route' && styles.modeBtnTextActive]}>ROUTE CORRIDOR</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'bbox' && styles.modeBtnActive]}
          onPress={() => setMode('bbox')}
          activeOpacity={0.8}
        >
          <Ionicons name="crop-outline" size={13} color={mode === 'bbox' ? TACTICAL.amber : TACTICAL.textMuted} />
          <Text style={[styles.modeBtnText, mode === 'bbox' && styles.modeBtnTextActive]}>BOUNDING BOX</Text>
        </TouchableOpacity>
      </View>

      {/* Route selection */}
      {mode === 'route' && (
        <>
          <Text style={styles.fieldLabel}>SELECT RUN OR ROUTE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.runList}>
            {runs.map(run => (
              <TouchableOpacity
                key={`run-${run.id}`}
                style={[styles.runChip, selectedRun?.id === run.id && styles.runChipActive]}
                onPress={() => { setSelectedRun(run); setSelectedRoute(null); }}
                activeOpacity={0.8}
              >
                <Ionicons name="navigate" size={10} color={selectedRun?.id === run.id ? TACTICAL.amber : TACTICAL.textMuted} />
                <View>
                  <Text style={[styles.runChipTitle, selectedRun?.id === run.id && styles.runChipTitleActive]} numberOfLines={1}>
                    {run.title}
                  </Text>
                  <Text style={styles.runChipMeta}>
                    {run.stats.distance_miles.toFixed(1)} mi — {run.stats.point_count} pts
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
            {routes.map(route => (
              <TouchableOpacity
                key={`route-${route.id}`}
                style={[styles.runChip, selectedRoute?.id === route.id && styles.runChipActive]}
                onPress={() => { setSelectedRoute(route); setSelectedRun(null); }}
                activeOpacity={0.8}
              >
                <Ionicons name="map-outline" size={10} color={selectedRoute?.id === route.id ? TACTICAL.amber : TACTICAL.textMuted} />
                <View>
                  <Text style={[styles.runChipTitle, selectedRoute?.id === route.id && styles.runChipTitleActive]} numberOfLines={1}>
                    {route.name}
                  </Text>
                  <Text style={styles.runChipMeta}>
                    {route.total_distance_miles.toFixed(1)} mi — {route.waypoint_count} wpts
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
            {runs.length === 0 && routes.length === 0 && (
              <Text style={styles.noDataText}>No runs or routes available. Import a GPX first.</Text>
            )}
          </ScrollView>

          {/* Corridor width */}
          <Text style={styles.fieldLabel}>CORRIDOR WIDTH</Text>
          <View style={styles.chipRow}>
            {CORRIDOR_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.optionChip, corridorMiles === opt.value && styles.optionChipActive]}
                onPress={() => setCorridorMiles(opt.value)}
                activeOpacity={0.8}
              >
                <Text style={[styles.optionChipText, corridorMiles === opt.value && styles.optionChipTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {/* Bounding box entry */}
      {mode === 'bbox' && (
        <>
          <Text style={styles.fieldLabel}>BOUNDING BOX COORDINATES</Text>
          <View style={styles.bboxGrid}>
            <View style={styles.bboxRow}>
              <View style={styles.bboxField}>
                <Text style={styles.bboxLabel}>MAX LAT (N)</Text>
                <TextInput
                  style={styles.bboxInput}
                  value={bboxMaxLat}
                  onChangeText={setBboxMaxLat}
                  placeholder="40.0"
                  placeholderTextColor={TACTICAL.textMuted + '60'}
                  keyboardType="numeric"
                />
              </View>
            </View>
            <View style={styles.bboxRow}>
              <View style={styles.bboxField}>
                <Text style={styles.bboxLabel}>MIN LNG (W)</Text>
                <TextInput
                  style={styles.bboxInput}
                  value={bboxMinLng}
                  onChangeText={setBboxMinLng}
                  placeholder="-110.0"
                  placeholderTextColor={TACTICAL.textMuted + '60'}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.bboxField}>
                <Text style={styles.bboxLabel}>MAX LNG (E)</Text>
                <TextInput
                  style={styles.bboxInput}
                  value={bboxMaxLng}
                  onChangeText={setBboxMaxLng}
                  placeholder="-109.0"
                  placeholderTextColor={TACTICAL.textMuted + '60'}
                  keyboardType="numeric"
                />
              </View>
            </View>
            <View style={styles.bboxRow}>
              <View style={styles.bboxField}>
                <Text style={styles.bboxLabel}>MIN LAT (S)</Text>
                <TextInput
                  style={styles.bboxInput}
                  value={bboxMinLat}
                  onChangeText={setBboxMinLat}
                  placeholder="39.0"
                  placeholderTextColor={TACTICAL.textMuted + '60'}
                  keyboardType="numeric"
                />
              </View>
            </View>
          </View>
        </>
      )}

      {/* Zoom range */}
      <Text style={styles.fieldLabel}>ZOOM LEVELS</Text>
      <View style={styles.zoomPresets}>
        {ZOOM_PRESETS.map(preset => {
          const isActive = zoomMin === preset.min && zoomMax === preset.max;
          return (
            <TouchableOpacity
              key={preset.label}
              style={[styles.zoomPreset, isActive && styles.zoomPresetActive]}
              onPress={() => applyZoomPreset(preset)}
              activeOpacity={0.8}
            >
              <Text style={[styles.zoomPresetLabel, isActive && styles.zoomPresetLabelActive]}>
                {preset.label}
              </Text>
              <Text style={styles.zoomPresetRange}>Z{preset.min}–{preset.max}</Text>
              <Text style={styles.zoomPresetDesc}>{preset.desc}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Custom zoom fine-tune */}
      <View style={styles.zoomCustom}>
        <View style={styles.zoomCustomField}>
          <Text style={styles.zoomCustomLabel}>MIN</Text>
          <View style={styles.zoomStepper}>
            <TouchableOpacity
              onPress={() => setZoomMin(Math.max(1, zoomMin - 1))}
              style={styles.zoomStepBtn}
            >
              <Ionicons name="remove" size={12} color={TACTICAL.text} />
            </TouchableOpacity>
            <Text style={styles.zoomStepValue}>{zoomMin}</Text>
            <TouchableOpacity
              onPress={() => setZoomMin(Math.min(zoomMax - 1, zoomMin + 1))}
              style={styles.zoomStepBtn}
            >
              <Ionicons name="add" size={12} color={TACTICAL.text} />
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.zoomCustomField}>
          <Text style={styles.zoomCustomLabel}>MAX</Text>
          <View style={styles.zoomStepper}>
            <TouchableOpacity
              onPress={() => setZoomMax(Math.max(zoomMin + 1, zoomMax - 1))}
              style={styles.zoomStepBtn}
            >
              <Ionicons name="remove" size={12} color={TACTICAL.text} />
            </TouchableOpacity>
            <Text style={styles.zoomStepValue}>{zoomMax}</Text>
            <TouchableOpacity
              onPress={() => setZoomMax(Math.min(18, zoomMax + 1))}
              style={styles.zoomStepBtn}
            >
              <Ionicons name="add" size={12} color={TACTICAL.text} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Map style */}
      <Text style={styles.fieldLabel}>MAP STYLE</Text>
      <View style={styles.chipRow}>
        {AVAILABLE_STYLES.map(style => (
          <TouchableOpacity
            key={style.key}
            style={[styles.styleChip, styleKey === style.key && styles.styleChipActive]}
            onPress={() => setStyleKey(style.key)}
            activeOpacity={0.8}
          >
            <Ionicons
              name={style.icon as any}
              size={12}
              color={styleKey === style.key ? TACTICAL.amber : TACTICAL.textMuted}
            />
            <Text style={[styles.styleChipText, styleKey === style.key && styles.styleChipTextActive]}>
              {style.shortLabel}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Region name */}
      <Text style={styles.fieldLabel}>REGION NAME (OPTIONAL)</Text>
      <TextInput
        style={styles.nameInput}
        value={regionName}
        onChangeText={setRegionName}
        placeholder={defaultName}
        placeholderTextColor={TACTICAL.textMuted + '60'}
      />

      {/* Estimate panel */}
      {computedBounds && (
        <View style={styles.estimatePanel}>
          <View style={styles.estimateRow}>
            <View style={styles.estimateItem}>
              <Text style={styles.estimateValue}>
                {tileCount >= 1000 ? `${(tileCount / 1000).toFixed(1)}K` : tileCount}
              </Text>
              <Text style={styles.estimateLabel}>TILES</Text>
            </View>
            <View style={styles.estimateDivider} />
            <View style={styles.estimateItem}>
              <Text style={styles.estimateValue}>
                {estimatedSize >= 1024 ? `${(estimatedSize / 1024).toFixed(1)} GB` : `${estimatedSize} MB`}
              </Text>
              <Text style={styles.estimateLabel}>EST. SIZE</Text>
            </View>
            <View style={styles.estimateDivider} />
            <View style={styles.estimateItem}>
              <Text style={styles.estimateValue}>
                {zoomMax - zoomMin + 1}
              </Text>
              <Text style={styles.estimateLabel}>ZOOM LVLS</Text>
            </View>
          </View>

          {/* Tile breakdown toggle */}
          <TouchableOpacity
            style={styles.breakdownToggle}
            onPress={() => setShowBreakdown(!showBreakdown)}
            activeOpacity={0.8}
          >
            <Text style={styles.breakdownToggleText}>
              {showBreakdown ? 'HIDE' : 'SHOW'} ZOOM BREAKDOWN
            </Text>
            <Ionicons
              name={showBreakdown ? 'chevron-up' : 'chevron-down'}
              size={12}
              color={TACTICAL.textMuted}
            />
          </TouchableOpacity>

          {showBreakdown && (
            <View style={styles.breakdownList}>
              {breakdown.map(item => (
                <View key={item.zoom} style={styles.breakdownRow}>
                  <Text style={styles.breakdownZoom}>Z{item.zoom}</Text>
                  <View style={styles.breakdownBarBg}>
                    <View
                      style={[
                        styles.breakdownBarFill,
                        {
                          width: `${Math.min(100, (item.tiles / Math.max(1, breakdown[breakdown.length - 1]?.tiles || 1)) * 100)}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.breakdownTiles}>{item.tiles.toLocaleString()}</Text>
                  <Text style={styles.breakdownSize}>{item.sizeMB} MB</Text>
                </View>
              ))}
            </View>
          )}

          {/* Warning for large downloads */}
          {tileCount > 50000 && (
            <View style={styles.warningBanner}>
              <Ionicons name="warning-outline" size={12} color="#FFB300" />
              <Text style={styles.warningText}>
                Large download ({tileCount.toLocaleString()} tiles). Consider reducing zoom range or corridor width.
              </Text>
            </View>
          )}

          {tileCount >= 100000 && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle-outline" size={12} color="#EF5350" />
              <Text style={styles.errorBannerText}>
                Too many tiles ({tileCount.toLocaleString()}). Maximum is 100,000. Reduce zoom range or area.
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Create button */}
      <TouchableOpacity
        style={[styles.createBtn, !canCreate && styles.createBtnDisabled]}
        onPress={handleCreate}
        activeOpacity={0.8}
        disabled={!canCreate}
      >
        <Ionicons name="download-outline" size={16} color="#0B0F12" />
        <Text style={styles.createBtnText}>
          {tileCount > 0 ? `CREATE REGION (${tileCount.toLocaleString()} TILES)` : 'CREATE REGION'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: TACTICAL.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '30',
    padding: DENSITY.cardPad,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    ...TYPO.T2,
    color: TACTICAL.amber,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeToggle: {
    flexDirection: 'row',
    gap: 8,
  },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  modeBtnActive: {
    borderColor: TACTICAL.amber,
    backgroundColor: 'rgba(196,138,44,0.08)',
  },
  modeBtnText: {
    ...TYPO.U2,
    fontSize: 8,
    color: TACTICAL.textMuted,
  },
  modeBtnTextActive: {
    color: TACTICAL.amber,
  },
  fieldLabel: {
    ...TYPO.T4,
    fontSize: 8,
    letterSpacing: 3,
    marginTop: 2,
  },
  runList: {
    maxHeight: 60,
  },
  runChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: 'rgba(62,79,60,0.06)',
  },
  runChipActive: {
    borderColor: TACTICAL.amber,
    backgroundColor: 'rgba(196,138,44,0.1)',
  },
  runChipTitle: {
    ...TYPO.B2,
    fontSize: 11,
    color: TACTICAL.text,
    maxWidth: 140,
  },
  runChipTitleActive: {
    color: TACTICAL.amber,
  },
  runChipMeta: {
    ...TYPO.B2,
    fontSize: 9,
    color: TACTICAL.textMuted,
    marginTop: 1,
  },
  noDataText: {
    ...TYPO.B2,
    color: TACTICAL.textMuted,
    fontStyle: 'italic',
    paddingVertical: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  optionChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  optionChipActive: {
    borderColor: TACTICAL.amber,
    backgroundColor: 'rgba(196,138,44,0.1)',
  },
  optionChipText: {
    ...TYPO.U2,
    fontSize: 9,
    color: TACTICAL.textMuted,
  },
  optionChipTextActive: {
    color: TACTICAL.amber,
  },
  zoomPresets: {
    flexDirection: 'row',
    gap: 6,
  },
  zoomPreset: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    gap: 2,
  },
  zoomPresetActive: {
    borderColor: TACTICAL.amber,
    backgroundColor: 'rgba(196,138,44,0.08)',
  },
  zoomPresetLabel: {
    ...TYPO.U2,
    fontSize: 7,
    letterSpacing: 2,
    color: TACTICAL.textMuted,
  },
  zoomPresetLabelActive: {
    color: TACTICAL.amber,
  },
  zoomPresetRange: {
    ...TYPO.K3,
    fontSize: 10,
    color: TACTICAL.text,
  },
  zoomPresetDesc: {
    ...TYPO.B2,
    fontSize: 7,
    color: TACTICAL.textMuted,
    textAlign: 'center',
  },
  zoomCustom: {
    flexDirection: 'row',
    gap: 12,
  },
  zoomCustomField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  zoomCustomLabel: {
    ...TYPO.U2,
    fontSize: 8,
    color: TACTICAL.textMuted,
    width: 28,
  },
  zoomStepper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    overflow: 'hidden',
  },
  zoomStepBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(62,79,60,0.1)',
  },
  zoomStepValue: {
    ...TYPO.K3,
    flex: 1,
    textAlign: 'center',
    color: TACTICAL.text,
  },
  styleChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  styleChipActive: {
    borderColor: TACTICAL.amber,
    backgroundColor: 'rgba(196,138,44,0.1)',
  },
  styleChipText: {
    ...TYPO.U2,
    fontSize: 8,
    color: TACTICAL.textMuted,
  },
  styleChipTextActive: {
    color: TACTICAL.amber,
  },
  nameInput: {
    ...TYPO.B1,
    color: TACTICAL.text,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 12,
  },
  bboxGrid: {
    gap: 8,
  },
  bboxRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  bboxField: {
    flex: 1,
    maxWidth: 160,
    gap: 3,
  },
  bboxLabel: {
    ...TYPO.U2,
    fontSize: 7,
    letterSpacing: 2,
    color: TACTICAL.textMuted,
    textAlign: 'center',
  },
  bboxInput: {
    ...TYPO.K3,
    color: TACTICAL.text,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    textAlign: 'center',
    fontSize: 12,
  },
  estimatePanel: {
    backgroundColor: 'rgba(62,79,60,0.06)',
    borderRadius: 10,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  estimateRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  estimateItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  estimateValue: {
    ...TYPO.K2,
    color: TACTICAL.amber,
    fontSize: 15,
  },
  estimateLabel: {
    ...TYPO.U2,
    fontSize: 7,
    letterSpacing: 2,
    color: TACTICAL.textMuted,
  },
  estimateDivider: {
    width: 1,
    height: 24,
    backgroundColor: TACTICAL.border,
  },
  breakdownToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  breakdownToggleText: {
    ...TYPO.U2,
    fontSize: 7,
    letterSpacing: 2,
    color: TACTICAL.textMuted,
  },
  breakdownList: {
    gap: 4,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  breakdownZoom: {
    ...TYPO.K3,
    fontSize: 9,
    color: TACTICAL.textMuted,
    width: 24,
  },
  breakdownBarBg: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(62,79,60,0.15)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  breakdownBarFill: {
    height: '100%',
    backgroundColor: TACTICAL.amber + '60',
    borderRadius: 2,
  },
  breakdownTiles: {
    ...TYPO.K3,
    fontSize: 9,
    color: TACTICAL.text,
    width: 44,
    textAlign: 'right',
  },
  breakdownSize: {
    ...TYPO.B2,
    fontSize: 9,
    color: TACTICAL.textMuted,
    width: 40,
    textAlign: 'right',
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,179,0,0.08)',
    borderWidth: 1,
    borderColor: '#FFB300' + '30',
  },
  warningText: {
    ...TYPO.B2,
    fontSize: 10,
    color: '#FFB300',
    flex: 1,
    lineHeight: 14,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(239,83,80,0.08)',
    borderWidth: 1,
    borderColor: '#EF5350' + '30',
  },
  errorBannerText: {
    ...TYPO.B2,
    fontSize: 10,
    color: '#EF5350',
    flex: 1,
    lineHeight: 14,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: TACTICAL.amber,
  },
  createBtnDisabled: {
    opacity: 0.35,
  },
  createBtnText: {
    ...TYPO.U1,
    color: '#0B0F12',
    fontSize: 11,
  },
});



