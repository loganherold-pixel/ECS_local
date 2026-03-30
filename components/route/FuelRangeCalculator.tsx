/**
 * FuelRangeCalculator — Route Fuel Analysis Panel
 *
 * Integrates with active route data and vehicle profile to show:
 *   - Fuel consumption with terrain adjustments
 *   - Per-segment fuel breakdown
 *   - Fuel stops needed
 *   - Range sufficiency warnings
 *   - Visual fuel gauge overlay
 *
 * Inputs can come from Vehicle Systems Planning or manual entry.
 */
import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL, TYPO } from '../../lib/theme';
import {
  calculateFuelRange,
  getFuelColor,
  getFuelSeverity,
  TERRAIN_PRESETS,
  type FuelProfile,
  type FuelRangeResult,
} from '../../lib/fuelRangeEngine';
import type { ImportedRoute } from '../../lib/routeStore';
import FuelGaugeOverlay from './FuelGaugeOverlay';

interface Props {
  route: ImportedRoute;
  /** Pre-filled from Vehicle Systems Planning or vehicle profile */
  initialFuelCapacity?: number;
  initialMpg?: number;
  initialCurrentFuel?: number;
}

export default function FuelRangeCalculator({
  route,
  initialFuelCapacity,
  initialMpg,
  initialCurrentFuel,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showSegments, setShowSegments] = useState(false);

  // Fuel profile inputs
  const [fuelCapacity, setFuelCapacity] = useState(
    initialFuelCapacity ? String(initialFuelCapacity) : ''
  );
  const [mpg, setMpg] = useState(
    initialMpg ? String(initialMpg) : ''
  );
  const [currentFuel, setCurrentFuel] = useState(
    initialCurrentFuel ? String(initialCurrentFuel) : ''
  );
  const [manualTerrainIdx, setManualTerrainIdx] = useState<number | null>(null);

  // Parse inputs
  const fuelCapGal = parseFloat(fuelCapacity) || 0;
  const mpgVal = parseFloat(mpg) || 0;
  const currentFuelGal = parseFloat(currentFuel) || fuelCapGal;
  const hasValidInputs = fuelCapGal > 0 && mpgVal > 0;

  // Calculate fuel range
  const result: FuelRangeResult | null = useMemo(() => {
    if (!hasValidInputs) return null;

    const profile: FuelProfile = {
      fuelCapacityGal: fuelCapGal,
      mpg: mpgVal,
      currentFuelGal: currentFuelGal > 0 ? currentFuelGal : fuelCapGal,
    };

    const terrainFactor = manualTerrainIdx !== null
      ? TERRAIN_PRESETS[manualTerrainIdx].factor
      : undefined;

    return calculateFuelRange(route, profile, terrainFactor);
  }, [route, fuelCapGal, mpgVal, currentFuelGal, manualTerrainIdx, hasValidInputs]);

  const cleanNumeric = (v: string) => v.replace(/[^0-9.]/g, '');

  // Summary for collapsed state
  const collapsedSummary = useMemo(() => {
    if (!result) return null;
    return {
      range: `${result.maxRangeMiles} mi`,
      needed: `${result.totalFuelNeededGal.toFixed(1)} gal`,
      sufficient: result.isRouteSufficient,
      effMpg: result.effectiveMpg,
    };
  }, [result]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <Ionicons name="flame-outline" size={16} color="#E57373" />
          <Text style={styles.headerTitle}>FUEL RANGE ANALYSIS</Text>
        </View>
        <View style={styles.headerRight}>
          {result && !expanded && (
            <View style={[
              styles.statusBadge,
              { backgroundColor: result.isRouteSufficient ? 'rgba(102,187,106,0.15)' : 'rgba(239,83,80,0.15)' },
            ]}>
              <View style={[
                styles.statusDot,
                { backgroundColor: result.isRouteSufficient ? '#66BB6A' : '#EF5350' },
              ]} />
              <Text style={[
                styles.statusText,
                { color: result.isRouteSufficient ? '#66BB6A' : '#EF5350' },
              ]}>
                {result.isRouteSufficient ? 'SUFFICIENT' : 'INSUFFICIENT'}
              </Text>
            </View>
          )}
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={TACTICAL.textMuted}
          />
        </View>
      </TouchableOpacity>

      {/* Collapsed summary */}
      {!expanded && collapsedSummary && (
        <View style={styles.collapsedRow}>
          <Text style={styles.collapsedText}>
            Range: <Text style={styles.collapsedVal}>{collapsedSummary.range}</Text>
            {'  '}Fuel: <Text style={styles.collapsedVal}>{collapsedSummary.needed}</Text>
            {'  '}MPG: <Text style={styles.collapsedVal}>{collapsedSummary.effMpg}</Text>
          </Text>
        </View>
      )}

      {/* Expanded content */}
      {expanded && (
        <View style={styles.body}>
          {/* Input Fields */}
          <View style={styles.inputSection}>
            <Text style={styles.inputSectionTitle}>VEHICLE FUEL PROFILE</Text>
            <View style={styles.inputGrid}>
              <View style={styles.inputField}>
                <Text style={styles.inputLabel}>TANK CAPACITY</Text>
                <View style={styles.inputWrap}>
                  <TextInput
                    style={styles.input}
                    value={fuelCapacity}
                    onChangeText={v => setFuelCapacity(cleanNumeric(v))}
                    placeholder="24"
                    placeholderTextColor={TACTICAL.textMuted}
                    keyboardType="decimal-pad"
                  />
                  <Text style={styles.inputUnit}>gal</Text>
                </View>
              </View>
              <View style={styles.inputField}>
                <Text style={styles.inputLabel}>EST. MPG</Text>
                <View style={styles.inputWrap}>
                  <TextInput
                    style={styles.input}
                    value={mpg}
                    onChangeText={v => setMpg(cleanNumeric(v))}
                    placeholder="18"
                    placeholderTextColor={TACTICAL.textMuted}
                    keyboardType="decimal-pad"
                  />
                  <Text style={styles.inputUnit}>mpg</Text>
                </View>
              </View>
              <View style={styles.inputField}>
                <Text style={styles.inputLabel}>CURRENT FUEL</Text>
                <View style={styles.inputWrap}>
                  <TextInput
                    style={styles.input}
                    value={currentFuel}
                    onChangeText={v => setCurrentFuel(cleanNumeric(v))}
                    placeholder={fuelCapacity || 'Full'}
                    placeholderTextColor={TACTICAL.textMuted}
                    keyboardType="decimal-pad"
                  />
                  <Text style={styles.inputUnit}>gal</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Terrain Override */}
          <View style={styles.terrainSection}>
            <Text style={styles.inputSectionTitle}>TERRAIN ADJUSTMENT</Text>
            <View style={styles.terrainGrid}>
              <TouchableOpacity
                style={[
                  styles.terrainChip,
                  manualTerrainIdx === null && styles.terrainChipActive,
                ]}
                onPress={() => setManualTerrainIdx(null)}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.terrainChipText,
                  manualTerrainIdx === null && styles.terrainChipTextActive,
                ]}>AUTO</Text>
              </TouchableOpacity>
              {TERRAIN_PRESETS.map((preset, i) => (
                <TouchableOpacity
                  key={preset.label}
                  style={[
                    styles.terrainChip,
                    manualTerrainIdx === i && styles.terrainChipActive,
                  ]}
                  onPress={() => setManualTerrainIdx(i)}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.terrainChipText,
                    manualTerrainIdx === i && styles.terrainChipTextActive,
                  ]}>
                    {preset.label}
                  </Text>
                  <Text style={styles.terrainChipFactor}>
                    {preset.factor > 1 ? `+${Math.round((preset.factor - 1) * 100)}%` : '0%'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Results */}
          {result && (
            <>
              {/* Fuel Gauge Overlay */}
              <FuelGaugeOverlay result={result} />

              {/* KPI Grid */}
              <View style={styles.kpiGrid}>
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>TOTAL DISTANCE</Text>
                  <Text style={styles.kpiValue}>{result.totalDistanceMiles.toFixed(1)}</Text>
                  <Text style={styles.kpiUnit}>miles</Text>
                </View>
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>FUEL NEEDED</Text>
                  <Text style={[styles.kpiValue, {
                    color: result.isRouteSufficient ? TACTICAL.text : '#EF5350',
                  }]}>{result.totalFuelNeededGal.toFixed(1)}</Text>
                  <Text style={styles.kpiUnit}>gallons</Text>
                </View>
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>MAX RANGE</Text>
                  <Text style={styles.kpiValue}>{result.maxRangeMiles}</Text>
                  <Text style={styles.kpiUnit}>miles</Text>
                </View>
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>EFF. MPG</Text>
                  <Text style={styles.kpiValue}>{result.effectiveMpg}</Text>
                  <Text style={styles.kpiUnit}>
                    {result.terrainPenaltyPercent > 0
                      ? `(${result.baseMpg} base)`
                      : 'terrain adj.'}
                  </Text>
                </View>
              </View>

              {/* Route Sufficiency */}
              <View style={[
                styles.sufficiencyCard,
                {
                  borderColor: result.isRouteSufficient
                    ? 'rgba(102,187,106,0.3)'
                    : 'rgba(239,83,80,0.3)',
                  backgroundColor: result.isRouteSufficient
                    ? 'rgba(102,187,106,0.06)'
                    : 'rgba(239,83,80,0.06)',
                },
              ]}>
                <Ionicons
                  name={result.isRouteSufficient ? 'checkmark-circle' : 'alert-circle'}
                  size={20}
                  color={result.isRouteSufficient ? '#66BB6A' : '#EF5350'}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sufficiencyTitle, {
                    color: result.isRouteSufficient ? '#66BB6A' : '#EF5350',
                  }]}>
                    {result.isRouteSufficient ? 'ROUTE WITHIN RANGE' : 'INSUFFICIENT FUEL RANGE'}
                  </Text>
                  <Text style={styles.sufficiencyText}>
                    {result.isRouteSufficient
                      ? `${result.fuelReserveGal.toFixed(1)} gal reserve (${result.fuelReservePercent}%) at destination`
                      : `Route exceeds range by ${Math.abs(result.rangeDeficitMiles).toFixed(1)} mi. ${result.fuelStopsNeeded} fuel stop${result.fuelStopsNeeded > 1 ? 's' : ''} needed.`}
                  </Text>
                </View>
              </View>

              {/* Elevation Impact */}
              {result.totalElevationGainFt > 0 && (
                <View style={styles.elevationCard}>
                  <View style={styles.elevationHeader}>
                    <Ionicons name="trending-up" size={14} color={TACTICAL.amber} />
                    <Text style={styles.elevationTitle}>ELEVATION IMPACT</Text>
                  </View>
                  <View style={styles.elevationStats}>
                    <View style={styles.elevStat}>
                      <Ionicons name="arrow-up" size={12} color="#66BB6A" />
                      <Text style={styles.elevStatValue}>
                        {result.totalElevationGainFt.toLocaleString()} ft
                      </Text>
                      <Text style={styles.elevStatLabel}>GAIN</Text>
                    </View>
                    <View style={styles.elevStatDivider} />
                    <View style={styles.elevStat}>
                      <Ionicons name="arrow-down" size={12} color="#EF5350" />
                      <Text style={styles.elevStatValue}>
                        {result.totalElevationLossFt.toLocaleString()} ft
                      </Text>
                      <Text style={styles.elevStatLabel}>LOSS</Text>
                    </View>
                    <View style={styles.elevStatDivider} />
                    <View style={styles.elevStat}>
                      <Ionicons name="speedometer-outline" size={12} color="#FF9800" />
                      <Text style={styles.elevStatValue}>
                        {result.overallTerrainFactor.toFixed(2)}x
                      </Text>
                      <Text style={styles.elevStatLabel}>FACTOR</Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Fuel Stops */}
              {result.fuelStops.length > 0 && (
                <View style={styles.fuelStopsCard}>
                  <View style={styles.fuelStopsHeader}>
                    <Ionicons name="flag-outline" size={14} color="#FF9800" />
                    <Text style={styles.fuelStopsTitle}>
                      FUEL STOPS ({result.fuelStops.length})
                    </Text>
                  </View>
                  {result.fuelStops.map((stop, i) => {
                    const color = stop.urgency === 'critical' ? '#EF5350'
                      : stop.urgency === 'recommended' ? '#FF9800'
                      : TACTICAL.amber;
                    return (
                      <View key={i} style={styles.fuelStopItem}>
                        <View style={[styles.fuelStopDot, { backgroundColor: color }]} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.fuelStopText}>
                            At {stop.atDistanceMiles.toFixed(1)} mi — {stop.fuelPercent}% remaining
                          </Text>
                          <Text style={[styles.fuelStopUrgency, { color }]}>
                            {stop.urgency.toUpperCase()}
                          </Text>
                        </View>
                        <Text style={[styles.fuelStopGal, { color }]}>
                          {stop.fuelRemainingGal.toFixed(1)} gal
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Segment Breakdown */}
              {result.segments.length > 1 && (
                <TouchableOpacity
                  style={styles.segmentToggle}
                  onPress={() => setShowSegments(!showSegments)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="layers-outline" size={14} color={TACTICAL.textMuted} />
                  <Text style={styles.segmentToggleText}>
                    {showSegments ? 'HIDE' : 'SHOW'} SEGMENT BREAKDOWN ({result.segments.length})
                  </Text>
                  <Ionicons
                    name={showSegments ? 'chevron-up' : 'chevron-down'}
                    size={14}
                    color={TACTICAL.textMuted}
                  />
                </TouchableOpacity>
              )}

              {showSegments && result.segments.length > 1 && (
                <View style={styles.segmentList}>
                  {result.segments.map((seg, i) => {
                    const fuelColor = getFuelColor(seg.fuelPercent);
                    return (
                      <View key={i} style={styles.segmentRow}>
                        <View style={[styles.segmentIndicator, { backgroundColor: fuelColor }]} />
                        <View style={{ flex: 1 }}>
                          <View style={styles.segmentMeta}>
                            <Text style={styles.segmentLabel}>SEG {i + 1}</Text>
                            <Text style={styles.segmentDist}>
                              {seg.distanceMiles.toFixed(1)} mi
                            </Text>
                            {seg.elevationGainFt > 0 && (
                              <Text style={styles.segmentElev}>
                                +{seg.elevationGainFt} ft
                              </Text>
                            )}
                          </View>
                          <View style={styles.segmentFuelRow}>
                            <View style={styles.segmentFuelBar}>
                              <View style={[
                                styles.segmentFuelFill,
                                {
                                  width: `${Math.max(seg.fuelPercent, 2)}%`,
                                  backgroundColor: fuelColor,
                                },
                              ]} />
                            </View>
                            <Text style={[styles.segmentFuelPct, { color: fuelColor }]}>
                              {seg.fuelPercent}%
                            </Text>
                          </View>
                        </View>
                        <View style={styles.segmentRight}>
                          <Text style={styles.segmentUsed}>
                            -{seg.fuelUsedGal.toFixed(2)}
                          </Text>
                          <Text style={styles.segmentUsedUnit}>gal</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Warnings */}
              {result.warnings.length > 0 && (
                <View style={styles.warningsSection}>
                  {result.warnings.map((warning, i) => {
                    const wColor = warning.severity === 'critical' ? '#EF5350'
                      : warning.severity === 'warning' ? '#FF9800'
                      : TACTICAL.textMuted;
                    const wIcon = warning.severity === 'critical' ? 'alert-circle'
                      : warning.severity === 'warning' ? 'warning-outline'
                      : 'information-circle-outline';

                    return (
                      <View key={i} style={[styles.warningItem, {
                        borderLeftColor: wColor,
                        backgroundColor: `${wColor}08`,
                      }]}>
                        <Ionicons name={wIcon as any} size={14} color={wColor} />
                        <Text style={[styles.warningText, { color: wColor }]}>
                          {warning.message}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </>
          )}

          {/* No inputs prompt */}
          {!hasValidInputs && (
            <View style={styles.noInputs}>
              <Ionicons name="information-circle-outline" size={20} color={TACTICAL.textMuted} />
              <Text style={styles.noInputsText}>
                Enter fuel tank capacity and MPG to calculate route fuel analysis.
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: TACTICAL.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    overflow: 'hidden',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#E57373',
    letterSpacing: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  collapsedRow: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    paddingTop: 0,
  },
  collapsedText: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },
  collapsedVal: {
    color: TACTICAL.text,
    fontWeight: '700',
    fontFamily: 'Courier',
  },
  body: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 12,
  },

  // Input section
  inputSection: {
    gap: 8,
  },
  inputSectionTitle: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
  inputGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  inputField: {
    flex: 1,
    gap: 4,
  },
  inputLabel: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.25)',
    paddingHorizontal: 8,
    height: 34,
  },
  input: {
    flex: 1,
    color: TACTICAL.text,
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Courier',
    padding: 0,
  },
  inputUnit: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
    marginLeft: 4,
  },

  // Terrain
  terrainSection: {
    gap: 6,
  },
  terrainGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  terrainChip: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: 'rgba(0,0,0,0.15)',
    alignItems: 'center',
  },
  terrainChipActive: {
    borderColor: TACTICAL.amber,
    backgroundColor: 'rgba(196,138,44,0.1)',
  },
  terrainChipText: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  terrainChipTextActive: {
    color: TACTICAL.amber,
  },
  terrainChipFactor: {
    fontSize: 7,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
    marginTop: 1,
  },

  // KPI Grid
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  kpiCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    gap: 2,
  },
  kpiLabel: {
    fontSize: 7,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '800',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },
  kpiUnit: {
    fontSize: 8,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },

  // Sufficiency
  sufficiencyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  sufficiencyTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  sufficiencyText: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    marginTop: 2,
    lineHeight: 16,
  },

  // Elevation
  elevationCard: {
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 10,
    padding: 10,
    gap: 8,
  },
  elevationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  elevationTitle: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 2,
  },
  elevationStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  elevStat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  elevStatValue: {
    fontSize: 12,
    fontWeight: '800',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },
  elevStatLabel: {
    fontSize: 7,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  elevStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: TACTICAL.border,
  },

  // Fuel Stops
  fuelStopsCard: {
    backgroundColor: 'rgba(255,152,0,0.06)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,152,0,0.2)',
    padding: 10,
    gap: 8,
  },
  fuelStopsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fuelStopsTitle: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FF9800',
    letterSpacing: 2,
  },
  fuelStopItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62,79,60,0.1)',
  },
  fuelStopDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  fuelStopText: {
    fontSize: 11,
    color: TACTICAL.text,
  },
  fuelStopUrgency: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginTop: 1,
  },
  fuelStopGal: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: 'Courier',
  },

  // Segment breakdown
  segmentToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 8,
  },
  segmentToggleText: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  segmentList: {
    gap: 4,
  },
  segmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderRadius: 8,
  },
  segmentIndicator: {
    width: 3,
    height: 28,
    borderRadius: 1.5,
  },
  segmentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  segmentLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  segmentDist: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },
  segmentElev: {
    fontSize: 9,
    color: '#66BB6A',
    fontFamily: 'Courier',
  },
  segmentFuelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  segmentFuelBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(62,79,60,0.2)',
    overflow: 'hidden',
  },
  segmentFuelFill: {
    height: '100%',
    borderRadius: 2,
  },
  segmentFuelPct: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: 'Courier',
    width: 32,
    textAlign: 'right',
  },
  segmentRight: {
    alignItems: 'flex-end',
    minWidth: 44,
  },
  segmentUsed: {
    fontSize: 11,
    fontWeight: '700',
    color: '#EF5350',
    fontFamily: 'Courier',
  },
  segmentUsedUnit: {
    fontSize: 7,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },

  // Warnings
  warningsSection: {
    gap: 6,
  },
  warningItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderLeftWidth: 3,
  },
  warningText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
  },

  // No inputs
  noInputs: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 20,
  },
  noInputsText: {
    fontSize: 12,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
});



