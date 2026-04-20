// ============================================================
// EXPEDITION ANALYSIS MODAL — Detailed Expedition View
// ============================================================
// Opens when an expedition opportunity card is selected.
// Displays full analysis: distance, terrain, remoteness,
// rig compatibility, factor breakdown, highlights,
// and RIG UPGRADE SUGGESTIONS when compatibility < 85%.
// ============================================================

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, GOLD_RAIL, ECS, TYPO } from '../../lib/theme';
import { hapticMicro } from '../../lib/haptics';
import {
  getTerrainColor,
  getRemotenessLabel,
  getRemotenessColor,
  getMatchScoreColor,
  getMatchScoreLabel,
  type ExpeditionOpportunity,
} from '../../lib/discoverEngine';

import {
  getCompatibilityColor,
  getDifficultyColor,
  type CompatibilityResult,
  type DifficultyRating,
  type VehicleProfile,
} from '../../lib/rigCompatibilityEngine';
import {
  generateUpgradeSuggestions,
  UPGRADE_THRESHOLD,
  type UpgradeSuggestion,
} from '../../lib/rigUpgradeEngine';
import TacticalPopupShell from '../TacticalPopupShell';
import { ECSOverlayFooter } from '../ECSModalShell';

interface ExpeditionAnalysisModalProps {
  visible: boolean;
  opportunity: ExpeditionOpportunity | null;
  compatResult: CompatibilityResult | null;
  vehicleProfile: VehicleProfile | null;
  hasVehicle: boolean;
  onClose: () => void;
  onNavigate?: () => void;
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

// ── Analysis Stat ───────────────────────────────────────────
function AnalysisStat({
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
    <View style={s.analysisStat}>
      <View style={[s.analysisStatIcon, { backgroundColor: color + '14', borderColor: color + '25' }]}>
        <Ionicons name={icon as any} size={14} color={color} />
      </View>
      <Text style={s.analysisStatLabel}>{label}</Text>
      <View style={s.analysisStatValueRow}>
        <Text style={[s.analysisStatValue, { color }]}>{value}</Text>
        {unit && <Text style={s.analysisStatUnit}>{unit}</Text>}
      </View>
    </View>
  );
}

// ── Upgrade Suggestion Card ─────────────────────────────────
function UpgradeSuggestionCard({ suggestion }: { suggestion: UpgradeSuggestion }) {
  const currentColor = getCompatibilityColor(suggestion.currentOverallScore);
  const newColor = getCompatibilityColor(suggestion.estimatedNewOverallScore);
  const improvementColor = suggestion.improvementPoints >= 15 ? '#66BB6A' :
    suggestion.improvementPoints >= 8 ? '#D4A017' : '#5AC8FA';

  return (
    <View style={s.upgradeCard}>
      {/* Left accent */}
      <View style={[s.upgradeAccent, { backgroundColor: improvementColor }]} />

      <View style={s.upgradeBody}>
        {/* Header: icon + label */}
        <View style={s.upgradeHeader}>
          <View style={[s.upgradeIconWrap, { backgroundColor: improvementColor + '14', borderColor: improvementColor + '30' }]}>
            <Ionicons name={suggestion.icon as any} size={14} color={improvementColor} />
          </View>
          <View style={s.upgradeHeaderText}>
            <Text style={[s.upgradeLabel, { color: improvementColor }]}>{suggestion.label}</Text>
            <Text style={s.upgradeChange}>{suggestion.suggestedChange}</Text>
          </View>
        </View>

        {/* Compatibility improvement bar */}
        <View style={s.upgradeImprovementRow}>
          <Text style={s.upgradeImprovementLabel}>COMPATIBILITY IMPROVES</Text>
          <View style={s.upgradeScoreRow}>
            <Text style={[s.upgradeScoreCurrent, { color: currentColor }]}>
              {suggestion.currentOverallScore}%
            </Text>
            <View style={s.upgradeArrowWrap}>
              <Ionicons name="arrow-forward" size={12} color={improvementColor} />
            </View>
            <Text style={[s.upgradeScoreNew, { color: newColor }]}>
              {suggestion.estimatedNewOverallScore}%
            </Text>
            <View style={[s.upgradePointsBadge, { backgroundColor: improvementColor + '14', borderColor: improvementColor + '30' }]}>
              <Text style={[s.upgradePointsText, { color: improvementColor }]}>
                +{suggestion.improvementPoints}
              </Text>
            </View>
          </View>
        </View>

        {/* Factor improvement detail */}
        <View style={s.upgradeFactorRow}>
          <Text style={s.upgradeFactorLabel}>
            {formatFactorName(suggestion.constraintFactor)}
          </Text>
          <View style={s.upgradeFactorBarWrap}>
            {/* Current bar (dimmed) */}
            <View style={s.upgradeFactorBarBg}>
              <View
                style={[
                  s.upgradeFactorBarCurrent,
                  {
                    width: `${suggestion.currentFactorScore}%`,
                    backgroundColor: getCompatibilityColor(suggestion.currentFactorScore) + '40',
                  },
                ]}
              />
              <View
                style={[
                  s.upgradeFactorBarNew,
                  {
                    width: `${suggestion.estimatedNewFactorScore}%`,
                    backgroundColor: getCompatibilityColor(suggestion.estimatedNewFactorScore),
                  },
                ]}
              />
            </View>
          </View>
          <Text style={[s.upgradeFactorValue, { color: getCompatibilityColor(suggestion.estimatedNewFactorScore) }]}>
            {suggestion.currentFactorScore} → {suggestion.estimatedNewFactorScore}
          </Text>
        </View>
      </View>
    </View>
  );
}

function formatFactorName(factor: string): string {
  switch (factor) {
    case 'terrainMatch': return 'TERRAIN';
    case 'fuelRangeCoverage': return 'FUEL';
    case 'vehicleCapability': return 'CAPABILITY';
    case 'tireSizeMatch': return 'TIRE SIZE';
    case 'suspensionLiftMatch': return 'SUSPENSION';
    default: return factor.toUpperCase();
  }
}


// ============================================================
// MAIN MODAL
// ============================================================

export default function ExpeditionAnalysisModal({
  visible,
  opportunity,
  compatResult,
  vehicleProfile,
  hasVehicle,
  onClose,
  onNavigate,
}: ExpeditionAnalysisModalProps) {
  if (!opportunity) return null;

  const terrainColor = getTerrainColor(opportunity.terrainType);
  const remotenessColor = getRemotenessColor(opportunity.remotenessScore);
  const remotenessLabel = getRemotenessLabel(opportunity.remotenessScore);

  const compatScore = opportunity.rigCompatibility ?? null;
  const diffRating = (opportunity.difficultyRating as DifficultyRating) ?? null;
  const compatColor = compatScore != null ? getCompatibilityColor(compatScore) : TACTICAL.textMuted;
  const diffColor = diffRating ? getDifficultyColor(diffRating) : TACTICAL.textMuted;

  const matchScore = opportunity.matchScore ?? null;
  const matchColor = matchScore != null ? getMatchScoreColor(matchScore) : TACTICAL.amber;
  const matchLabel = matchScore != null ? getMatchScoreLabel(matchScore) : null;

  const upgradeSuggestions: UpgradeSuggestion[] =
    !vehicleProfile || !compatResult
      ? []
      : generateUpgradeSuggestions(vehicleProfile, opportunity, compatResult);

  return (
    <TacticalPopupShell
      visible={visible}
      onClose={onClose}
      title="Expedition Analysis"
      subtitle={opportunity.name}
      eyebrow={opportunity.region.toUpperCase()}
      icon="compass-outline"
      overlayClass="workflow"
      maxWidth={980}
      maxHeightFraction={0.86}
      minHeightFraction={0.7}
      footer={(
        <ECSOverlayFooter>
          <TouchableOpacity style={s.footerSecondaryBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={s.footerSecondaryText}>CLOSE</Text>
          </TouchableOpacity>
          {onNavigate ? (
            <TouchableOpacity
              style={s.footerPrimaryBtn}
              activeOpacity={0.84}
              onPress={() => {
                hapticMicro();
                onNavigate();
              }}
            >
              <Ionicons name="navigate-outline" size={14} color={TACTICAL.amber} />
              <Text style={s.footerPrimaryText}>NAVIGATE</Text>
            </TouchableOpacity>
          ) : null}
        </ECSOverlayFooter>
      )}
    >
      <View style={s.scrollContent}>
          {/* Region + Description + Distance */}

          <View style={s.section}>
            <View style={s.regionRow}>
              <Ionicons name="location-outline" size={12} color={TACTICAL.amber} />
              <Text style={s.regionText}>{opportunity.region}</Text>
            </View>
            {opportunity.distanceFromUserMiles != null && (
              <View style={s.distanceFromUserRow}>
                <View style={s.distanceFromUserIcon}>
                  <Ionicons name="navigate-outline" size={12} color={TACTICAL.amber} />
                </View>
                <Text style={s.distanceFromUserLabel}>Distance from you:</Text>
                <Text style={s.distanceFromUserValue}>
                  {opportunity.distanceFromUserMiles} mi
                </Text>
              </View>
            )}
            <Text style={s.description}>{opportunity.description}</Text>
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

                {!compatResult.isFullScore && (
                  <Text style={s.partialNote}>
                    Configure complete vehicle specs for more accurate scoring
                  </Text>
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

          {/* ── RIG UPGRADE SUGGESTIONS ──────────────────────── */}
          {upgradeSuggestions.length > 0 && (
            <View style={s.section}>
              <View style={s.sectionHeader}>
                <Ionicons name="build-outline" size={12} color="#5AC8FA" />
                <Text style={[s.sectionTitle, { color: '#5AC8FA' }]}>RIG UPGRADE SUGGESTIONS</Text>
              </View>

              {/* Intro text */}
              <View style={s.upgradeIntro}>
                <View style={s.upgradeIntroIconWrap}>
                  <Ionicons name="bulb-outline" size={14} color="#5AC8FA" />
                </View>
                <Text style={s.upgradeIntroText}>
                  Your rig scores below {UPGRADE_THRESHOLD}% for this expedition. These upgrades could improve compatibility:
                </Text>
              </View>

              {/* Suggestion cards */}
              <View style={s.upgradeList}>
                {upgradeSuggestions.map((suggestion, index) => (
                  <UpgradeSuggestionCard key={`${suggestion.upgradeType}-${index}`} suggestion={suggestion} />
                ))}
              </View>

              {/* Disclaimer */}
              <View style={s.upgradeDisclaimer}>
                <Ionicons name="information-circle-outline" size={9} color={TACTICAL.textMuted} />
                <Text style={s.upgradeDisclaimerText}>
                  Estimated improvements are approximate. Actual compatibility depends on specific equipment and installation.
                </Text>
              </View>
            </View>
          )}

          {/* Expedition Stats */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="analytics-outline" size={12} color={TACTICAL.amber} />
              <Text style={s.sectionTitle}>EXPEDITION DATA</Text>
            </View>

            <View style={s.statsGrid}>
              <AnalysisStat icon="resize-outline" label="DISTANCE" value={`${opportunity.distanceMiles}`} unit="MI" />
              <AnalysisStat icon="trending-up-outline" label="ELEV GAIN" value={`${opportunity.elevationGainFt.toLocaleString()}`} unit="FT" accentColor="#5AC8FA" />
              <AnalysisStat icon="calendar-outline" label="EST. DAYS" value={`${opportunity.estimatedDays}`} />
              <AnalysisStat icon="flame-outline" label="FUEL EST." value={`${opportunity.estimatedFuelRequired}`} unit="GAL" accentColor="#E67E22" />
              <AnalysisStat icon="bonfire-outline" label="CAMPS" value={`${opportunity.suggestedCamps}`} accentColor="#66BB6A" />
              <AnalysisStat icon="sunny-outline" label="BEST SEASON" value={opportunity.bestSeason} />
            </View>
          </View>

          {/* Terrain & Remoteness */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="map-outline" size={12} color={TACTICAL.amber} />
              <Text style={s.sectionTitle}>TERRAIN & REMOTENESS</Text>
            </View>

            <View style={s.terrainRow}>
              <View style={[s.terrainBlock, { borderColor: terrainColor + '30' }]}>
                <Ionicons name="trail-sign-outline" size={16} color={terrainColor} />
                <Text style={s.terrainLabel}>TERRAIN TYPE</Text>
                <Text style={[s.terrainValue, { color: terrainColor }]}>{opportunity.terrainType}</Text>
              </View>
              <View style={[s.terrainBlock, { borderColor: remotenessColor + '30' }]}>
                <Ionicons name="radio-outline" size={16} color={remotenessColor} />
                <Text style={s.terrainLabel}>REMOTENESS</Text>
                <Text style={[s.terrainValue, { color: remotenessColor }]}>{remotenessLabel}</Text>
                <View style={s.remotenessBar}>
                  {Array.from({ length: 10 }).map((_, i) => (
                    <View
                      key={i}
                      style={[
                        s.remotenessDot,
                        {
                          backgroundColor: i < opportunity.remotenessScore
                            ? remotenessColor
                            : 'rgba(30,35,43,0.6)',
                        },
                      ]}
                    />
                  ))}
                </View>
              </View>
            </View>
          </View>

          {/* Highlights */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="star-outline" size={12} color={TACTICAL.amber} />
              <Text style={s.sectionTitle}>HIGHLIGHTS</Text>
            </View>

            <View style={s.highlightsList}>
              {opportunity.highlights.map((h, i) => (
                <View key={i} style={s.highlightItem}>
                  <View style={s.highlightDot} />
                  <Text style={s.highlightText}>{h}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Permit Notice */}
          {opportunity.permitRequired && (
            <View style={s.permitNotice}>
              <Ionicons name="document-text-outline" size={14} color="#E04030" />
              <View style={s.permitTextBlock}>
                <Text style={s.permitTitle}>PERMIT REQUIRED</Text>
                <Text style={s.permitDesc}>
                  This expedition requires advance permits. Check with local land management agencies for availability and booking.
                </Text>
              </View>
            </View>
          )}

          <View style={{ height: 12 }} />
      </View>
    </TacticalPopupShell>
  );
}

// ============================================================
// STYLES
// ============================================================
const TOP_PAD = Platform.OS === 'web' ? 16 : 54;

const s = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: ECS.bgPrimary,
  },

  // ── Header ────────────────────────────────────────────
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: TOP_PAD,
    paddingBottom: 12,
  },
  modalHeaderLeft: {
    flex: 1,
  },
  modalHeaderLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 2.5,
  },
  modalHeaderName: {
    fontSize: 17,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1,
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: ECS.bgElev,
    borderWidth: 1,
    borderColor: ECS.stroke,
    alignItems: 'center',
    justifyContent: 'center',
  },

  goldRail: {
    height: GOLD_RAIL.sectionWidth,
    backgroundColor: GOLD_RAIL.section,
  },

  // ── Scroll ────────────────────────────────────────────
  scrollArea: { flex: 1 },
  scrollContent: { padding: 16 },
  footerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 24 : 14,
    borderTopWidth: 1,
    borderTopColor: ECS.stroke,
    backgroundColor: ECS.bgPrimary,
  },
  footerSecondaryBtn: {
    minWidth: 92,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
  },
  footerSecondaryText: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.8,
  },
  footerPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minWidth: 128,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '35',
    backgroundColor: TACTICAL.amber + '0D',
  },
  footerPrimaryText: {
    fontSize: 9,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.8,
  },

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
  distanceFromUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: TACTICAL.amber + '08',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '20',
  },
  distanceFromUserIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: TACTICAL.amber + '14',
    borderWidth: 1,
    borderColor: TACTICAL.amber + '25',
    alignItems: 'center',
    justifyContent: 'center',
  },
  distanceFromUserLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    letterSpacing: 0.3,
  },
  distanceFromUserValue: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: 'Courier',
    color: TACTICAL.amber,
    letterSpacing: 0.5,
  },
  description: {
    ...TYPO.B1,
    color: ECS.muted,
    lineHeight: 20,
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
  partialNote: {
    fontSize: 9,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    fontStyle: 'italic',
    letterSpacing: 0.3,
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

  // ============================================================
  // UPGRADE SUGGESTIONS STYLES
  // ============================================================

  upgradeIntro: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(90,200,250,0.05)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(90,200,250,0.15)',
  },
  upgradeIntroIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: 'rgba(90,200,250,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(90,200,250,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  upgradeIntroText: {
    flex: 1,
    fontSize: 10,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    lineHeight: 16,
    letterSpacing: 0.2,
  },

  upgradeList: {
    gap: 10,
  },

  // ── Upgrade Card ──────────────────────────────────────
  upgradeCard: {
    flexDirection: 'row',
    backgroundColor: ECS.bgElev,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ECS.stroke,
    overflow: 'hidden',
  },
  upgradeAccent: {
    width: 3,
  },
  upgradeBody: {
    flex: 1,
    padding: 12,
    gap: 10,
  },

  // ── Upgrade Header ────────────────────────────────────
  upgradeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  upgradeIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upgradeHeaderText: {
    flex: 1,
    gap: 2,
  },
  upgradeLabel: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 2,
  },
  upgradeChange: {
    fontSize: 12,
    fontWeight: '700',
    color: ECS.text,
    letterSpacing: 0.3,
  },

  // ── Upgrade Improvement Row ───────────────────────────
  upgradeImprovementRow: {
    gap: 6,
    paddingTop: 8,
    borderTopWidth: GOLD_RAIL.subsectionWidth,
    borderTopColor: GOLD_RAIL.internal,
  },
  upgradeImprovementLabel: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
  upgradeScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  upgradeScoreCurrent: {
    fontSize: 18,
    fontWeight: '800',
    fontFamily: 'Courier',
    letterSpacing: -0.5,
  },
  upgradeArrowWrap: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: 'rgba(30,35,43,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  upgradeScoreNew: {
    fontSize: 22,
    fontWeight: '900',
    fontFamily: 'Courier',
    letterSpacing: -0.5,
  },
  upgradePointsBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    marginLeft: 4,
  },
  upgradePointsText: {
    fontSize: 10,
    fontWeight: '900',
    fontFamily: 'Courier',
    letterSpacing: 0.5,
  },

  // ── Upgrade Factor Row ────────────────────────────────
  upgradeFactorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  upgradeFactorLabel: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
    width: 68,
  },
  upgradeFactorBarWrap: {
    flex: 1,
    height: 5,
    position: 'relative',
  },
  upgradeFactorBarBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 5,
    backgroundColor: 'rgba(30,35,43,0.8)',
    borderRadius: 2.5,
    overflow: 'hidden',
  },
  upgradeFactorBarCurrent: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: 5,
    borderRadius: 2.5,
  },
  upgradeFactorBarNew: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: 5,
    borderRadius: 2.5,
    opacity: 0.85,
  },
  upgradeFactorValue: {
    fontSize: 9,
    fontWeight: '800',
    fontFamily: 'Courier',
    minWidth: 50,
    textAlign: 'right',
    letterSpacing: 0.3,
  },

  // ── Upgrade Disclaimer ────────────────────────────────
  upgradeDisclaimer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: GOLD_RAIL.subsectionWidth,
    borderTopColor: GOLD_RAIL.internal,
  },
  upgradeDisclaimerText: {
    flex: 1,
    fontSize: 8,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    lineHeight: 13,
    fontStyle: 'italic',
    letterSpacing: 0.2,
  },

  // ── Stats Grid ────────────────────────────────────────
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  analysisStat: {
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
  analysisStatIcon: {
    width: 28,
    height: 28,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  analysisStatLabel: {
    fontSize: 6,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  analysisStatValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  analysisStatValue: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: 'Courier',
    color: TACTICAL.amber,
    textAlign: 'center',
  },
  analysisStatUnit: {
    fontSize: 7,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },

  // ── Terrain & Remoteness ──────────────────────────────
  terrainRow: {
    flexDirection: 'row',
    gap: 8,
  },
  terrainBlock: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    backgroundColor: ECS.bgElev,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ECS.stroke,
    gap: 6,
  },
  terrainLabel: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
  terrainValue: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  remotenessBar: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 4,
  },
  remotenessDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
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

  // ── Permit Notice ─────────────────────────────────────
  permitNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(224,64,48,0.06)',
    borderRadius: ECS.radius,
    borderWidth: 1,
    borderColor: 'rgba(224,64,48,0.20)',
    padding: 14,
    marginBottom: 12,
  },
  permitTextBlock: {
    flex: 1,
    gap: 4,
  },
  permitTitle: {
    fontSize: 9,
    fontWeight: '800',
    color: '#E04030',
    letterSpacing: 2,
  },
  permitDesc: {
    fontSize: 10,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    lineHeight: 16,
  },
});



