// ============================================================
// REMOTE ZONE DETAIL MODAL — Zone Analysis & Map View
// ============================================================
// Opens when a remote zone card is selected.
// Displays zone analysis: isolation score, terrain, access type,
// cell coverage, rig compatibility, highlights, and a map view
// centered on the zone coordinates.
// ============================================================

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import TacticalPopupShell from '../TacticalPopupShell';
import { TACTICAL, GOLD_RAIL, ECS, TYPO } from '../../lib/theme';
import { hapticMicro } from '../../lib/haptics';
import {
  getIsolationColor,
  getIsolationLabel,
  getAccessTypeLabel,
  getAccessTypeColor,
  getCellCoverageLabel,
  getCellCoverageColor,
  type RemoteZone,
} from '../../lib/remoteExplorerEngine';
import {
  getCompatibilityColor,
  getDifficultyColor,
  type CompatibilityResult,
  type DifficultyRating,
} from '../../lib/rigCompatibilityEngine';

interface RemoteZoneDetailModalProps {
  visible: boolean;
  zone: RemoteZone | null;
  compatResult: CompatibilityResult | null;
  hasVehicle: boolean;
  onClose: () => void;
}

// ── Factor Bar ──────────────────────────────────────────────
function FactorBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={s.factorRow}>
      <Text style={s.factorLabel}>{label}</Text>
      <View style={s.factorBarBg}>
        <View style={[s.factorBarFill, { width: `${Math.min(value, 100)}%`, backgroundColor: color }]} />
      </View>
      <Text style={[s.factorValue, { color }]}>{value}</Text>
    </View>
  );
}

// ── Zone Stat ───────────────────────────────────────────────
function ZoneStat({
  icon,
  label,
  value,
  unit,
  accentColor,
}: {
  icon: string;
  label: string;
  value: string;
  unit?: string;
  accentColor?: string;
}) {
  const color = accentColor || TACTICAL.amber;
  return (
    <View style={s.zoneStat}>
      <View style={[s.zoneStatIcon, { backgroundColor: color + '14', borderColor: color + '25' }]}>
        <Ionicons name={icon as any} size={14} color={color} />
      </View>
      <Text style={s.zoneStatLabel}>{label}</Text>
      <View style={s.zoneStatValueRow}>
        <Text style={[s.zoneStatValue, { color }]}>{value}</Text>
        {unit && <Text style={s.zoneStatUnit}>{unit}</Text>}
      </View>
    </View>
  );
}

export default function RemoteZoneDetailModal({
  visible,
  zone,
  compatResult,
  hasVehicle,
  onClose,
}: RemoteZoneDetailModalProps) {
  if (!zone) return null;

  const isolationColor = getIsolationColor(zone.isolationScore);
  const isolationLabel = getIsolationLabel(zone.isolationScore);
  const accessColor = getAccessTypeColor(zone.accessType);
  const accessLabel = getAccessTypeLabel(zone.accessType);
  const cellColor = getCellCoverageColor(zone.cellCoverage);
  const cellLabel = getCellCoverageLabel(zone.cellCoverage);

  const compatScore = zone.rigCompatibility ?? null;
  const diffRating = (zone.difficultyRating as DifficultyRating) ?? null;
  const compatColor = compatScore != null ? getCompatibilityColor(compatScore) : TACTICAL.textMuted;
  const diffColor = diffRating ? getDifficultyColor(diffRating) : TACTICAL.textMuted;

  return (
    <TacticalPopupShell
      visible={visible}
      onClose={onClose}
      icon="location-outline"
      eyebrow="REMOTE ZONE ANALYSIS"
      title={zone.name}
      subtitle={zone.region}
      overlayClass="info"
      maxWidth={940}
      maxHeightFraction={0.88}
      minHeightFraction={0.72}
      scrollable={false}
    >
        <ScrollView
          style={s.scrollArea}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Map Preview Panel */}
          <View style={s.section}>
            <View style={s.mapPreview}>
              <View style={s.mapGrid}>
                {/* Coordinate grid lines */}
                {Array.from({ length: 5 }).map((_, i) => (
                  <View key={`h${i}`} style={[s.mapGridLineH, { top: `${(i + 1) * 16.6}%` }]} />
                ))}
                {Array.from({ length: 5 }).map((_, i) => (
                  <View key={`v${i}`} style={[s.mapGridLineV, { left: `${(i + 1) * 16.6}%` }]} />
                ))}

                {/* Zone center marker */}
                <View style={s.mapMarkerContainer}>
                  <View style={[s.mapMarkerOuter, { borderColor: isolationColor }]}>
                    <View style={[s.mapMarkerInner, { backgroundColor: isolationColor }]} />
                  </View>
                  <View style={[s.mapMarkerPulse, { borderColor: isolationColor + '30' }]} />
                </View>

                {/* Zone name overlay */}
                <View style={s.mapOverlay}>
                  <Text style={s.mapOverlayName}>{zone.name}</Text>
                  <Text style={s.mapOverlayCoords}>
                    {zone.latitude.toFixed(2)}°N  {Math.abs(zone.longitude).toFixed(2)}°W
                  </Text>
                </View>

                {/* Scale indicator */}
                <View style={s.mapScale}>
                  <View style={s.mapScaleBar} />
                  <Text style={s.mapScaleText}>~{Math.round(zone.estimatedAcres / 640)} sq mi</Text>
                </View>
              </View>

              {/* Map info strip */}
              <View style={s.mapInfoStrip}>
                <View style={s.mapInfoItem}>
                  <Ionicons name="location-outline" size={10} color={TACTICAL.amber} />
                  <Text style={s.mapInfoText}>{zone.region}</Text>
                </View>
                <View style={s.mapInfoItem}>
                  <Ionicons name="expand-outline" size={10} color={TACTICAL.textMuted} />
                  <Text style={s.mapInfoText}>{zone.estimatedAcres.toLocaleString()} acres</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Region + Description */}
          <View style={s.section}>
            <View style={s.regionRow}>
              <Ionicons name="location-outline" size={12} color={TACTICAL.amber} />
              <Text style={s.regionText}>{zone.region}</Text>
            </View>
            <Text style={s.description}>{zone.description}</Text>
          </View>

          {/* Isolation & Access Panel */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="radio-outline" size={12} color={isolationColor} />
              <Text style={[s.sectionTitle, { color: isolationColor }]}>ISOLATION & ACCESS</Text>
            </View>

            <View style={s.isolationPanel}>
              {/* Isolation Score */}
              <View style={s.isolationTopRow}>
                <View style={s.isolationScoreBlock}>
                  <Text style={[s.isolationScoreLarge, { color: isolationColor }]}>
                    {zone.isolationScore.toFixed(1)}
                  </Text>
                  <Text style={[s.isolationScoreUnit, { color: isolationColor }]}>/10</Text>
                </View>
                <View style={s.isolationLabelBlock}>
                  <Text style={s.isolationRatingLabel}>ISOLATION RATING</Text>
                  <View style={[s.isolationBadge, { backgroundColor: isolationColor + '18', borderColor: isolationColor + '35' }]}>
                    <Text style={[s.isolationBadgeText, { color: isolationColor }]}>{isolationLabel}</Text>
                  </View>
                </View>
              </View>

              {/* Isolation bar */}
              <View style={s.isolationBarRow}>
                <View style={s.isolationBarBg}>
                  <View style={[s.isolationBarFill, { width: `${zone.isolationScore * 10}%`, backgroundColor: isolationColor }]} />
                </View>
              </View>

              {/* Access details grid */}
              <View style={s.accessGrid}>
                <View style={[s.accessItem, { borderColor: accessColor + '25' }]}>
                  <Ionicons name="shield-outline" size={14} color={accessColor} />
                  <Text style={s.accessItemLabel}>ACCESS</Text>
                  <Text style={[s.accessItemValue, { color: accessColor }]}>{accessLabel}</Text>
                </View>
                <View style={[s.accessItem, { borderColor: cellColor + '25' }]}>
                  <Ionicons name="cellular-outline" size={14} color={cellColor} />
                  <Text style={s.accessItemLabel}>CELL</Text>
                  <Text style={[s.accessItemValue, { color: cellColor }]}>{cellLabel}</Text>
                </View>
                <View style={[s.accessItem, { borderColor: TACTICAL.textMuted + '25' }]}>
                  <Ionicons name="navigate-outline" size={14} color={TACTICAL.textMuted} />
                  <Text style={s.accessItemLabel}>NEAREST TOWN</Text>
                  <Text style={[s.accessItemValue, { color: ECS.text }]}>{zone.nearestTownMiles} mi</Text>
                </View>
                <View style={[s.accessItem, { borderColor: '#5AC8FA25' }]}>
                  <Ionicons name="water-outline" size={14} color="#5AC8FA" />
                  <Text style={s.accessItemLabel}>WATER SOURCES</Text>
                  <Text style={[s.accessItemValue, { color: '#5AC8FA' }]}>{zone.waterSources}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Rig Compatibility Panel */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="construct-outline" size={12} color={compatColor} />
              <Text style={[s.sectionTitle, { color: compatColor }]}>RIG COMPATIBILITY</Text>
            </View>

            {compatResult ? (
              <View style={s.compatPanel}>
                {/* Score + Difficulty */}
                <View style={s.compatTopRow}>
                  <View style={s.compatScoreBlock}>
                    <Text style={[s.compatScoreLarge, { color: compatColor }]}>{compatResult.score}</Text>
                    <Text style={[s.compatScorePercent, { color: compatColor }]}>%</Text>
                  </View>
                  <View style={s.compatDiffBlock}>
                    <Text style={s.compatDiffLabel}>DIFFICULTY FOR YOUR RIG</Text>
                    <View style={[s.diffBadge, { backgroundColor: diffColor + '18', borderColor: diffColor + '35' }]}>
                      <Text style={[s.diffBadgeText, { color: diffColor }]}>{compatResult.difficultyRating}</Text>
                    </View>
                  </View>
                </View>

                {/* Score bar */}
                <View style={s.scoreBarRow}>
                  <View style={s.scoreBarBg}>
                    <View style={[s.scoreBarFill, { width: `${compatResult.score}%`, backgroundColor: compatColor }]} />
                  </View>
                </View>

                {/* Factor Breakdown */}
                <View style={s.factorsBlock}>
                  <Text style={s.factorsTitle}>FACTOR BREAKDOWN</Text>
                  <FactorBar
                    label="TERRAIN MATCH"
                    value={compatResult.factors.terrainMatch}
                    color={getCompatibilityColor(compatResult.factors.terrainMatch)}
                  />
                  <FactorBar
                    label="FUEL COVERAGE"
                    value={compatResult.factors.fuelRangeCoverage}
                    color={getCompatibilityColor(compatResult.factors.fuelRangeCoverage)}
                  />
                  <FactorBar
                    label="VEHICLE CAP."
                    value={compatResult.factors.vehicleCapability}
                    color={getCompatibilityColor(compatResult.factors.vehicleCapability)}
                  />
                  <FactorBar
                    label="TIRE SIZE"
                    value={compatResult.factors.tireSizeMatch}
                    color={getCompatibilityColor(compatResult.factors.tireSizeMatch)}
                  />
                  <FactorBar
                    label="SUSPENSION"
                    value={compatResult.factors.suspensionLiftMatch}
                    color={getCompatibilityColor(compatResult.factors.suspensionLiftMatch)}
                  />
                </View>


                {/* Notes */}
                {compatResult.notes.length > 0 && (
                  <View style={s.notesBlock}>
                    {compatResult.notes.map((note, i) => (
                      <View key={i} style={s.noteRow}>
                        <Ionicons name="information-circle-outline" size={10} color={TACTICAL.textMuted} />
                        <Text style={s.noteText}>{note}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ) : (
              <View style={s.compatPlaceholder}>
                <Ionicons name="construct-outline" size={20} color={TACTICAL.textMuted} />
                <Text style={s.compatPlaceholderText}>
                  {hasVehicle
                    ? 'Configure vehicle specs to enable compatibility scoring'
                    : 'Add a vehicle to see compatibility scoring'}
                </Text>
              </View>
            )}
          </View>

          {/* Zone Stats */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="analytics-outline" size={12} color={TACTICAL.amber} />
              <Text style={s.sectionTitle}>ZONE DATA</Text>
            </View>

            <View style={s.statsGrid}>
              <ZoneStat icon="resize-outline" label="EST. TRAVERSE" value={`${zone.estimatedDistanceMiles}`} unit="MI" />
              <ZoneStat icon="trending-up-outline" label="ELEV RANGE" value={`${zone.elevationRangeFt[0].toLocaleString()}–${zone.elevationRangeFt[1].toLocaleString()}`} unit="FT" accentColor="#5AC8FA" />
              <ZoneStat icon="bonfire-outline" label="CAMPS" value={`${zone.suggestedCamps}`} accentColor="#66BB6A" />
              <ZoneStat icon="flame-outline" label="FUEL EST." value={`${zone.estimatedFuelRequired}`} unit="GAL" accentColor="#E67E22" />
              <ZoneStat icon="sunny-outline" label="BEST SEASON" value={zone.bestSeason} />
              <ZoneStat icon="expand-outline" label="AREA" value={`${Math.round(zone.estimatedAcres / 1000)}K`} unit="ACRES" accentColor="#8B949E" />
            </View>
          </View>

          {/* Highlights */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="star-outline" size={12} color={TACTICAL.amber} />
              <Text style={s.sectionTitle}>HIGHLIGHTS</Text>
            </View>

            <View style={s.highlightsList}>
              {zone.highlights.map((h, i) => (
                <View key={i} style={s.highlightItem}>
                  <View style={s.highlightDot} />
                  <Text style={s.highlightText}>{h}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Future Route Generation Note */}
          <View style={s.futureNote}>
            <Ionicons name="git-branch-outline" size={14} color={TACTICAL.textMuted} />
            <View style={s.futureNoteTextBlock}>
              <Text style={s.futureNoteTitle}>ROUTE GENERATION</Text>
              <Text style={s.futureNoteDesc}>
                Future versions will support automatic route generation within remote zones. Explore the zone data above to plan your approach.
              </Text>
            </View>
          </View>

          <View style={{ height: 30 }} />
        </ScrollView>
    </TacticalPopupShell>
  );
}

// ============================================================
// STYLES
// ============================================================
const s = StyleSheet.create({
  // ── Header ────────────────────────────────────────────
  // ── Scroll ────────────────────────────────────────────
  scrollArea: { flex: 1 },
  scrollContent: { padding: 16 },

  // ── Section ───────────────────────────────────────────
  section: {
    backgroundColor: ECS.bgPanel,
    borderRadius: ECS.radius,
    borderWidth: 1,
    borderColor: ECS.stroke,
    padding: 14,
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: GOLD_RAIL.subsectionWidth,
    borderBottomColor: GOLD_RAIL.subsection,
  },
  sectionTitle: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 2.5,
  },

  // ── Map Preview ───────────────────────────────────────
  mapPreview: {
    overflow: 'hidden',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ECS.stroke,
  },
  mapGrid: {
    height: 180,
    backgroundColor: '#0A0D10',
    position: 'relative',
    overflow: 'hidden',
  },
  mapGridLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(212,160,23,0.04)',
  },
  mapGridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(212,160,23,0.04)',
  },
  mapMarkerContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -12,
    marginLeft: -12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapMarkerOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  mapMarkerInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  mapMarkerPulse: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
  },
  mapOverlay: {
    position: 'absolute',
    bottom: 10,
    left: 10,
  },
  mapOverlayName: {
    fontSize: 11,
    fontWeight: '800',
    color: ECS.text,
    letterSpacing: 2,
  },
  mapOverlayCoords: {
    fontSize: 9,
    fontWeight: '600',
    fontFamily: 'Courier',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
    marginTop: 2,
  },
  mapScale: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    alignItems: 'flex-end',
  },
  mapScaleBar: {
    width: 40,
    height: 2,
    backgroundColor: TACTICAL.textMuted,
    marginBottom: 3,
  },
  mapScaleText: {
    fontSize: 7,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  mapInfoStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: ECS.bgElev,
    borderTopWidth: GOLD_RAIL.subsectionWidth,
    borderTopColor: GOLD_RAIL.internal,
  },
  mapInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  mapInfoText: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },

  // ── Region + Description ──────────────────────────────
  regionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  regionText: {
    fontSize: 12,
    fontWeight: '600',
    color: TACTICAL.amber,
    letterSpacing: 0.5,
  },
  description: {
    ...TYPO.B1,
    color: ECS.muted,
    lineHeight: 20,
  },

  // ── Isolation Panel ───────────────────────────────────
  isolationPanel: {
    gap: 12,
  },
  isolationTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  isolationScoreBlock: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  isolationScoreLarge: {
    fontSize: 36,
    fontWeight: '900',
    fontFamily: 'Courier',
    letterSpacing: -1,
  },
  isolationScoreUnit: {
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 2,
  },
  isolationLabelBlock: {
    flex: 1,
    gap: 6,
  },
  isolationRatingLabel: {
    fontSize: 7,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
  isolationBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  isolationBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
  },
  isolationBarRow: {
    paddingTop: 4,
  },
  isolationBarBg: {
    height: 6,
    backgroundColor: 'rgba(30,35,43,0.8)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  isolationBarFill: {
    height: '100%',
    borderRadius: 3,
  },

  // ── Access Grid ───────────────────────────────────────
  accessGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: GOLD_RAIL.subsectionWidth,
    borderTopColor: GOLD_RAIL.internal,
  },
  accessItem: {
    width: '47%',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: ECS.bgElev,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ECS.stroke,
    gap: 4,
  },
  accessItemLabel: {
    fontSize: 6,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
    textAlign: 'center',
  },
  accessItemValue: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textAlign: 'center',
  },

  // ── Compat Panel ──────────────────────────────────────
  compatPanel: {
    gap: 12,
  },
  compatTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  compatScoreBlock: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  compatScoreLarge: {
    fontSize: 36,
    fontWeight: '900',
    fontFamily: 'Courier',
    letterSpacing: -1,
  },
  compatScorePercent: {
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 1,
  },
  compatDiffBlock: {
    flex: 1,
    gap: 6,
  },
  compatDiffLabel: {
    fontSize: 7,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
  diffBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  diffBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
  },

  // ── Score Bar ─────────────────────────────────────────
  scoreBarRow: {
    paddingTop: 4,
  },
  scoreBarBg: {
    height: 6,
    backgroundColor: 'rgba(30,35,43,0.8)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  scoreBarFill: {
    height: '100%',
    borderRadius: 3,
  },

  // ── Factors ───────────────────────────────────────────
  factorsBlock: {
    gap: 6,
    paddingTop: 8,
    borderTopWidth: GOLD_RAIL.subsectionWidth,
    borderTopColor: GOLD_RAIL.internal,
  },
  factorsTitle: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
    marginBottom: 4,
  },
  factorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  factorLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
    width: 80,
  },
  factorBarBg: {
    flex: 1,
    height: 5,
    backgroundColor: 'rgba(30,35,43,0.8)',
    borderRadius: 2.5,
    overflow: 'hidden',
  },
  factorBarFill: {
    height: '100%',
    borderRadius: 2.5,
  },
  factorValue: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: 'Courier',
    minWidth: 26,
    textAlign: 'right',
  },

  // ── Notes ─────────────────────────────────────────────
  notesBlock: {
    gap: 4,
    paddingTop: 6,
    borderTopWidth: GOLD_RAIL.subsectionWidth,
    borderTopColor: GOLD_RAIL.internal,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  noteText: {
    fontSize: 9,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    flex: 1,
  },

  // ── Compat Placeholder ────────────────────────────────
  compatPlaceholder: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  compatPlaceholderText: {
    fontSize: 10,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },

  // ── Stats Grid ────────────────────────────────────────
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  zoneStat: {
    width: '30%',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    backgroundColor: ECS.bgElev,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ECS.stroke,
    gap: 4,
  },
  zoneStatIcon: {
    width: 28,
    height: 28,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoneStatLabel: {
    fontSize: 6,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  zoneStatValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  zoneStatValue: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: 'Courier',
    color: TACTICAL.amber,
    textAlign: 'center',
  },
  zoneStatUnit: {
    fontSize: 7,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },

  // ── Highlights ────────────────────────────────────────
  highlightsList: {
    gap: 8,
  },
  highlightItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  highlightDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: TACTICAL.amber,
    opacity: 0.6,
  },
  highlightText: {
    ...TYPO.B1,
    color: ECS.muted,
    flex: 1,
  },

  // ── Future Note ───────────────────────────────────────
  futureNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: ECS.bgPanel,
    borderRadius: ECS.radius,
    borderWidth: 1,
    borderColor: ECS.stroke,
    padding: 14,
    marginBottom: 12,
  },
  futureNoteTextBlock: {
    flex: 1,
    gap: 4,
  },
  futureNoteTitle: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
  futureNoteDesc: {
    fontSize: 10,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    lineHeight: 16,
  },
});



