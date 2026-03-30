/**
 * ECS CAMPSITE CANDIDATE PANEL — Predictive Campsite Intelligence
 * ================================================================
 *
 * Displays scored and ranked campsite candidates on the Navigate tab.
 * Shows suitability level, confidence, estimated arrival time, and
 * candidate reasoning for each suggested campsite.
 *
 * DISPLAY:
 *   - Collapsed: compact badge with suggested count + best level + confidence
 *   - Expanded: ranked suggested campsites with detail
 */


import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, TYPO, GOLD_RAIL } from '../../lib/theme';
import type {
  CampsiteCandidateResult,
  CampsiteCandidate,
  SuitabilityLevel,
  ConfidenceLevel,
} from '../../lib/campsiteCandidateEngine';
import { campsiteCandidateEngine } from '../../lib/campsiteCandidateEngine';

// ── Props ────────────────────────────────────────────────────

interface CampsiteCandidatePanelProps {
  /** Campsite candidate analysis result */
  result: CampsiteCandidateResult | null;
  /** Whether the panel is visible */
  visible: boolean;
  /** Close/dismiss handler */
  onClose: () => void;
  /** When true, shows a loading indicator instead of empty state */
  loading?: boolean;
}


// ── Suitability Colors ───────────────────────────────────────

function getSuitabilityColor(level: SuitabilityLevel): string {
  switch (level) {
    case 'HIGH': return '#66BB6A';
    case 'MEDIUM': return '#FFB74D';
    case 'LOW': return '#8A8A85';
    default: return '#8A8A85';
  }
}

function getSuitabilityIcon(level: SuitabilityLevel): string {
  switch (level) {
    case 'HIGH': return 'star';
    case 'MEDIUM': return 'star-half';
    case 'LOW': return 'star-outline';
    default: return 'star-outline';
  }
}

// ── Confidence Colors (Phase 3) ──────────────────────────────

function getConfidenceColor(level: ConfidenceLevel): string {
  switch (level) {
    case 'HIGH': return '#66BB6A';
    case 'MEDIUM': return '#FFB74D';
    case 'LOW': return '#8A8A85';
    default: return '#8A8A85';
  }
}

function getConfidenceIcon(level: ConfidenceLevel): string {
  switch (level) {
    case 'HIGH': return 'shield-checkmark';
    case 'MEDIUM': return 'shield-half';
    case 'LOW': return 'shield-outline';
    default: return 'shield-outline';
  }
}

// ── Difficulty Colors ────────────────────────────────────────

function getDifficultyColor(difficulty: string): string {
  switch (difficulty) {
    case 'easy': return '#66BB6A';
    case 'moderate': return '#FFB74D';
    case 'challenging': return '#FF9800';
    case 'difficult': return '#EF5350';
    default: return '#8A8A85';
  }
}

// ── Component ────────────────────────────────────────────────

export default function CampsiteCandidatePanel({
  result,
  visible,
  onClose,
  loading,
}: CampsiteCandidatePanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [showAllCandidates, setShowAllCandidates] = useState(false);

  const toggleExpanded = useCallback(() => {
    setExpanded(prev => !prev);
  }, []);

  if (!visible) return null;

  // ── Loading state ──
  if (loading && !result) {
    return (
      <View style={styles.expandedPanel}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons name="bonfire-outline" size={14} color={TACTICAL.textMuted} />
            <Text style={styles.headerTitle}>SUGGESTED CAMPSITES</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={14} color={TACTICAL.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
        <View style={{ paddingHorizontal: 16, paddingVertical: 24, alignItems: 'center' }}>
          <Ionicons name="hourglass-outline" size={24} color={TACTICAL.textMuted} />
          <Text style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: '600', color: TACTICAL.textMuted, marginTop: 8, textAlign: 'center', letterSpacing: 0.5 }}>
            Analyzing campsite candidates...
          </Text>
        </View>
      </View>
    );
  }

  // ── Empty state ──
  if (!result) {
    return (
      <View style={styles.expandedPanel}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons name="bonfire-outline" size={14} color={TACTICAL.textMuted} />
            <Text style={styles.headerTitle}>SUGGESTED CAMPSITES</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={14} color={TACTICAL.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
        <View style={{ paddingHorizontal: 16, paddingVertical: 24, alignItems: 'center' }}>
          <Ionicons name="bonfire-outline" size={24} color={TACTICAL.textMuted} />
          <Text style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: '600', color: TACTICAL.textMuted, marginTop: 8, textAlign: 'center', letterSpacing: 0.5 }}>
            No campsite suggestions available for this route.
          </Text>
        </View>
      </View>
    );
  }



  const {
    candidates,
    suggestedCampsites,
    candidateCount,
    totalSegments,
    excludedSegments,
    routeName,
    totalDistanceMiles,
    estimatedDriveTimeHours,
    scoringApplied,
    isShortRoute,
    overnightUnlikely,
    hasHighConfidence,
    bestConfidence,
  } = result;

  const hasSuggested = suggestedCampsites.length > 0;
  const bestLevel = hasSuggested ? suggestedCampsites[0].suitabilityLevel : null;


  // ── Collapsed Badge ────────────────────────────────────────

  if (!expanded) {
    return (
      <TouchableOpacity
        style={styles.collapsedBadge}
        onPress={toggleExpanded}
        activeOpacity={0.85}
      >
        <Ionicons name="bonfire-outline" size={12} color="#8BC34A" />
        <Text style={styles.collapsedLabel}>CAMPSITE</Text>
        {hasSuggested && bestLevel && (
          <View style={[styles.collapsedLevelBadge, { borderColor: getSuitabilityColor(bestLevel) + '50' }]}>
            <Ionicons name={getSuitabilityIcon(bestLevel) as any} size={8} color={getSuitabilityColor(bestLevel)} />
            <Text style={[styles.collapsedLevelText, { color: getSuitabilityColor(bestLevel) }]}>
              {bestLevel}
            </Text>
          </View>
        )}
        {/* Phase 3: Confidence badge in collapsed view */}
        {hasSuggested && bestConfidence && (
          <View style={[styles.collapsedConfBadge, { borderColor: getConfidenceColor(bestConfidence) + '40' }]}>
            <Ionicons name={getConfidenceIcon(bestConfidence) as any} size={7} color={getConfidenceColor(bestConfidence)} />
            <Text style={[styles.collapsedConfText, { color: getConfidenceColor(bestConfidence) }]}>
              {bestConfidence}
            </Text>
          </View>
        )}
        <View style={styles.collapsedCountBadge}>
          <Text style={styles.collapsedCountText}>{suggestedCampsites.length}</Text>
        </View>
        {hasSuggested && (
          <Text style={styles.collapsedDetail}>
            Mile {suggestedCampsites[0].distanceMiles.toFixed(0)}
          </Text>
        )}
        <Ionicons name="chevron-down-outline" size={10} color={TACTICAL.textMuted} />
      </TouchableOpacity>
    );
  }

  // ── Expanded Panel ─────────────────────────────────────────

  // Candidates to show beyond suggested
  const additionalCandidates = showAllCandidates
    ? candidates.filter(c => !suggestedCampsites.some(s => s.segmentIndex === c.segmentIndex))
    : [];

  return (
    <View style={styles.expandedPanel}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="bonfire-outline" size={14} color="#8BC34A" />
          <Text style={styles.headerTitle}>SUGGESTED CAMPSITES</Text>

        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={toggleExpanded} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-up-outline" size={14} color={TACTICAL.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={14} color={TACTICAL.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Route context */}
      {routeName && (
        <View style={styles.routeContext}>
          <Ionicons name="navigate-outline" size={10} color={TACTICAL.textMuted} />
          <Text style={styles.routeContextText} numberOfLines={1}>
            {routeName} — {totalDistanceMiles.toFixed(0)} mi — ~{campsiteCandidateEngine.formatArrivalTime(estimatedDriveTimeHours)} drive
          </Text>
        </View>
      )}

      {/* Phase 3: Route context warnings */}
      {(isShortRoute || overnightUnlikely) && (
        <View style={styles.contextWarning}>
          {isShortRoute && (
            <View style={styles.contextWarningRow}>
              <Ionicons name="information-circle" size={10} color="#FFB74D" />
              <Text style={styles.contextWarningText}>
                Short route ({totalDistanceMiles.toFixed(0)} mi) — camp suggestions may not apply
              </Text>
            </View>
          )}
          {overnightUnlikely && (
            <View style={styles.contextWarningRow}>
              <Ionicons name="time-outline" size={10} color="#FFB74D" />
              <Text style={styles.contextWarningText}>
                Quick trip (~{campsiteCandidateEngine.formatArrivalTime(estimatedDriveTimeHours)}) — overnight stop unlikely
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Summary stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statChip}>
          <Text style={styles.statValue}>{suggestedCampsites.length}</Text>
          <Text style={styles.statLabel}>SUGGESTED</Text>
        </View>
        <View style={styles.statChip}>
          <Text style={styles.statValue}>{candidateCount}</Text>
          <Text style={styles.statLabel}>CANDIDATES</Text>
        </View>
        <View style={styles.statChip}>
          <Text style={[styles.statValue, bestLevel ? { color: getSuitabilityColor(bestLevel) } : {}]}>
            {bestLevel || '—'}
          </Text>
          <Text style={styles.statLabel}>BEST</Text>
        </View>
        <View style={styles.statChip}>
          <Text style={[styles.statValue, bestConfidence ? { color: getConfidenceColor(bestConfidence) } : {}]}>
            {bestConfidence || '—'}
          </Text>
          <Text style={styles.statLabel}>CONFIDENCE</Text>
        </View>
      </View>

      {/* Candidate list */}
      <ScrollView
        style={styles.candidateList}
        contentContainerStyle={styles.candidateListContent}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
      >
        {candidateCount === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="alert-circle-outline" size={16} color={TACTICAL.textMuted} />
            <Text style={styles.emptyText}>No campsite candidates detected for this route.</Text>
            <Text style={styles.emptySubText}>
              Route may be too short, too steep, or lack suitable flat segments.
            </Text>
          </View>
        ) : (
          <>
            {/* Suggested Campsites (Top 3) */}
            {suggestedCampsites.map((candidate, idx) => (
              <SuggestedCampsiteCard
                key={`suggested-${candidate.segmentIndex}`}
                candidate={candidate}
                rank={idx + 1}
                isTop={idx === 0}
              />
            ))}

            {/* Toggle for additional candidates */}
            {candidates.length > suggestedCampsites.length && (
              <TouchableOpacity
                style={styles.showMoreBtn}
                onPress={() => setShowAllCandidates(prev => !prev)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={showAllCandidates ? 'chevron-up-outline' : 'chevron-down-outline'}
                  size={10}
                  color={TACTICAL.textMuted}
                />
                <Text style={styles.showMoreText}>
                  {showAllCandidates
                    ? 'HIDE ADDITIONAL CANDIDATES'
                    : `SHOW ${candidates.length - suggestedCampsites.length} MORE CANDIDATES`}
                </Text>
              </TouchableOpacity>
            )}

            {/* Additional Candidates (below top 3) */}
            {additionalCandidates.map((candidate, idx) => (
              <AdditionalCandidateCard
                key={`additional-${candidate.segmentIndex}`}
                candidate={candidate}
                rank={suggestedCampsites.length + idx + 1}
              />
            ))}
          </>
        )}
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <Ionicons name="information-circle-outline" size={9} color={TACTICAL.textMuted} />
        <Text style={styles.footerText}>
          ECS CAMPSITE INTELLIGENCE
        </Text>

      </View>
    </View>
  );
}

// ── Suggested Campsite Card (Phase 2+3 — Top 3) ─────────────

function SuggestedCampsiteCard({
  candidate,
  rank,
  isTop,
}: {
  candidate: CampsiteCandidate;
  rank: number;
  isTop: boolean;
}) {
  const suitColor = getSuitabilityColor(candidate.suitabilityLevel);
  const suitIcon = getSuitabilityIcon(candidate.suitabilityLevel);
  const confColor = getConfidenceColor(candidate.confidence);
  const confIcon = getConfidenceIcon(candidate.confidence);
  const difficultyColor = getDifficultyColor(candidate.difficulty);
  const arrivalStr = campsiteCandidateEngine.formatArrivalTime(candidate.estimatedArrivalHour);

  return (
    <View style={[styles.suggestedCard, isTop && styles.suggestedCardTop]}>
      {/* Rank + Mile header */}
      <View style={styles.suggestedHeader}>
        <View style={styles.suggestedRankRow}>
          <View style={[styles.rankBadge, { backgroundColor: suitColor + '18', borderColor: suitColor + '40' }]}>
            <Text style={[styles.rankText, { color: suitColor }]}>#{rank}</Text>
          </View>
          <View style={styles.suggestedMileInfo}>
            <Text style={styles.suggestedMile}>Mile {candidate.distanceMiles.toFixed(0)}</Text>
            <Text style={styles.suggestedRange}>{candidate.segmentRange}</Text>
          </View>
        </View>

        {/* Suitability + Confidence badges */}
        <View style={styles.badgeStack}>
          <View style={[styles.suitabilityBadge, { borderColor: suitColor + '50', backgroundColor: suitColor + '10' }]}>
            <Ionicons name={suitIcon as any} size={10} color={suitColor} />
            <Text style={[styles.suitabilityLabel, { color: suitColor }]}>{candidate.suitabilityLevel}</Text>
          </View>
          <View style={[styles.confidenceBadge, { borderColor: confColor + '40', backgroundColor: confColor + '08' }]}>
            <Ionicons name={confIcon as any} size={8} color={confColor} />
            <Text style={[styles.confidenceLabel, { color: confColor }]}>{candidate.confidence}</Text>
          </View>
        </View>
      </View>

      {/* Metrics row */}
      <View style={styles.metricsRow}>
        <View style={styles.metric}>
          <Ionicons name="time-outline" size={9} color={TACTICAL.textMuted} />
          <Text style={styles.metricText}>
            ~{arrivalStr} from start
          </Text>
        </View>
        <View style={styles.metric}>
          <Ionicons name="trending-up-outline" size={9} color={TACTICAL.textMuted} />
          <Text style={styles.metricText}>
            {candidate.elevationGain.toLocaleString()} ft gain
          </Text>
        </View>
        <View style={styles.metric}>
          <Ionicons name="arrow-up-circle-outline" size={9} color={TACTICAL.textMuted} />
          <Text style={styles.metricText}>
            {candidate.avgElevation.toLocaleString()} ft
          </Text>
        </View>
      </View>



      {/* Phase 3: Confidence reasons */}
      {candidate.confidenceReasons.length > 0 && (
        <View style={styles.confidenceReasonsContainer}>
          {candidate.confidenceReasons.map((reason, rIdx) => (
            <View key={rIdx} style={styles.confidenceReasonRow}>
              <Ionicons name="information-circle" size={8} color={confColor} />
              <Text style={[styles.confidenceReasonText, { color: confColor }]}>{reason}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Candidate reasons */}
      <View style={styles.reasonsContainer}>
        {candidate.candidateReason.slice(0, 3).map((reason, rIdx) => (
          <View key={rIdx} style={styles.reasonRow}>
            <Ionicons name="checkmark-circle" size={9} color="#8BC34A" />
            <Text style={styles.reasonText}>{reason}</Text>
          </View>
        ))}
      </View>

      {/* Difficulty + coordinates */}
      <View style={styles.suggestedFooter}>
        <View style={[styles.difficultyBadge, { borderColor: difficultyColor + '40' }]}>
          <Text style={[styles.difficultyText, { color: difficultyColor }]}>
            {candidate.difficulty.toUpperCase()}
          </Text>
        </View>
        <Text style={styles.coordsText}>
          {candidate.coordinates[0].toFixed(4)}, {candidate.coordinates[1].toFixed(4)}
        </Text>
      </View>
    </View>
  );
}

// ── Additional Candidate Card (compact) ──────────────────────

function AdditionalCandidateCard({
  candidate,
  rank,
}: {
  candidate: CampsiteCandidate;
  rank: number;
}) {
  const suitColor = getSuitabilityColor(candidate.suitabilityLevel);
  const confColor = getConfidenceColor(candidate.confidence);
  const arrivalStr = campsiteCandidateEngine.formatArrivalTime(candidate.estimatedArrivalHour);

  return (
    <View style={styles.additionalCard}>
      <View style={styles.additionalHeader}>
        <Text style={styles.additionalRank}>#{rank}</Text>
        <Text style={styles.additionalMile}>Mile {candidate.distanceMiles.toFixed(0)}</Text>
        <Text style={styles.additionalRange}>{candidate.segmentRange}</Text>
        <View style={{ flex: 1 }} />
        <Text style={[styles.additionalScore, { color: suitColor }]}>
          {candidate.suitabilityScore}
        </Text>
        <Text style={[styles.additionalLevel, { color: suitColor }]}>
          {candidate.suitabilityLevel}
        </Text>
        {/* Phase 3: Confidence in compact view */}
        <View style={[styles.additionalConfBadge, { borderColor: confColor + '30' }]}>
          <Text style={[styles.additionalConfText, { color: confColor }]}>{candidate.confidence}</Text>
        </View>
      </View>
      <View style={styles.additionalMeta}>
        <Text style={styles.additionalMetaText}>
          ~{arrivalStr} from start
        </Text>
        <Text style={styles.additionalMetaText}>
          {candidate.elevationGain.toLocaleString()} ft gain
        </Text>
        <Text style={styles.additionalMetaText}>
          {candidate.avgElevation.toLocaleString()} ft avg
        </Text>
      </View>
      {/* Phase 3: Show confidence reasons if any */}
      {candidate.confidenceReasons.length > 0 && (
        <View style={styles.additionalConfReasons}>
          {candidate.confidenceReasons.slice(0, 1).map((reason, rIdx) => (
            <Text key={rIdx} style={[styles.additionalConfReasonText, { color: confColor }]}>
              {reason}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Collapsed Badge ──
  collapsedBadge: {
    position: 'absolute',
    bottom: 140,
    left: 10,
    zIndex: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(11,15,18,0.92)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(139,195,74,0.25)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 6,
  },
  collapsedLabel: {
    fontFamily: 'monospace',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#8BC34A',
  },
  collapsedLevelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  collapsedLevelText: {
    fontFamily: 'monospace',
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 1,
  },
  collapsedConfBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  collapsedConfText: {
    fontFamily: 'monospace',
    fontSize: 6,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  collapsedCountBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: 'rgba(139,195,74,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(139,195,74,0.3)',
  },
  collapsedCountText: {
    fontFamily: 'Courier',
    fontSize: 9,
    fontWeight: '800',
    color: '#8BC34A',
  },
  collapsedDetail: {
    fontFamily: 'Courier',
    fontSize: 9,
    color: TACTICAL.textMuted,
    marginLeft: 2,
  },

  // ── Expanded Panel ──
  expandedPanel: {
    position: 'absolute',
    bottom: 56,
    left: 8,
    right: 8,
    zIndex: 28,
    backgroundColor: '#111418',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E232B',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 10,
    maxHeight: 440,
    overflow: 'hidden',
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1E232B',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontFamily: 'monospace',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#8BC34A',
  },
  phaseBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    backgroundColor: 'rgba(139,195,74,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(139,195,74,0.25)',
  },
  phaseBadgeText: {
    fontFamily: 'monospace',
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: '#8BC34A',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  // ── Route Context ──
  routeContext: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: 'rgba(30,35,43,0.4)',
  },
  routeContextText: {
    fontFamily: 'monospace',
    fontSize: 9,
    color: TACTICAL.textMuted,
    flex: 1,
  },

  // ── Phase 3: Context Warnings ──
  contextWarning: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    gap: 3,
    backgroundColor: 'rgba(255,183,77,0.06)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,183,77,0.12)',
  },
  contextWarningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  contextWarningText: {
    fontFamily: 'monospace',
    fontSize: 8,
    color: '#FFB74D',
    flex: 1,
  },

  // ── Stats Row ──
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#1E232B',
  },
  statChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(30,35,43,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(30,35,43,0.8)',
  },
  statValue: {
    fontFamily: 'Courier',
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.text,
  },
  statLabel: {
    fontFamily: 'monospace',
    fontSize: 6,
    fontWeight: '600',
    letterSpacing: 1.2,
    color: TACTICAL.textMuted,
    marginTop: 1,
  },

  // ── Candidate List ──
  candidateList: {
    maxHeight: 280,
  },
  candidateListContent: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
  },

  // ── Empty State ──
  emptyState: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 6,
  },
  emptyText: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: TACTICAL.textMuted,
    textAlign: 'center',
  },
  emptySubText: {
    fontFamily: 'monospace',
    fontSize: 9,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    opacity: 0.7,
    paddingHorizontal: 20,
  },

  // ── Suggested Campsite Card ──
  suggestedCard: {
    backgroundColor: 'rgba(30,35,43,0.4)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(30,35,43,0.8)',
    padding: 8,
    gap: 5,
  },
  suggestedCardTop: {
    borderColor: 'rgba(139,195,74,0.3)',
    backgroundColor: 'rgba(139,195,74,0.04)',
  },

  // ── Suggested Header ──
  suggestedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  suggestedRankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rankBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontFamily: 'Courier',
    fontSize: 9,
    fontWeight: '800',
  },
  suggestedMileInfo: {
    gap: 1,
  },
  suggestedMile: {
    fontFamily: 'Courier',
    fontSize: 12,
    fontWeight: '800',
    color: TACTICAL.text,
  },
  suggestedRange: {
    fontFamily: 'monospace',
    fontSize: 8,
    color: TACTICAL.textMuted,
  },

  // ── Badge Stack (Suitability + Confidence) ──
  badgeStack: {
    alignItems: 'flex-end',
    gap: 3,
  },

  // ── Suitability Badge ──
  suitabilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  suitabilityScore: {
    fontFamily: 'Courier',
    fontSize: 13,
    fontWeight: '900',
  },
  suitabilityLabel: {
    fontFamily: 'monospace',
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 1,
  },

  // ── Confidence Badge (Phase 3) ──
  confidenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  confidenceLabel: {
    fontFamily: 'monospace',
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 0.8,
  },

  // ── Metrics Row ──
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  metric: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metricText: {
    fontFamily: 'Courier',
    fontSize: 9,
    color: TACTICAL.textMuted,
  },

  // ── Scoring Breakdown ──
  scoringContainer: {
    gap: 2,
    paddingVertical: 2,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(139,195,74,0.2)',
    marginLeft: 2,
    paddingLeft: 8,
  },
  scoringRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  scoringDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  scoringText: {
    fontFamily: 'monospace',
    fontSize: 8,
    color: 'rgba(230,230,225,0.65)',
  },

  // ── Phase 3: Confidence Reasons ──
  confidenceReasonsContainer: {
    gap: 2,
    paddingVertical: 2,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(255,183,77,0.2)',
    marginLeft: 2,
    paddingLeft: 8,
  },
  confidenceReasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  confidenceReasonText: {
    fontFamily: 'monospace',
    fontSize: 8,
  },

  // ── Reasons ──
  reasonsContainer: {
    gap: 2,
    paddingLeft: 2,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  reasonText: {
    fontFamily: 'monospace',
    fontSize: 9,
    color: 'rgba(230,230,225,0.7)',
  },

  // ── Suggested Footer ──
  suggestedFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  difficultyBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 1,
  },
  difficultyText: {
    fontFamily: 'monospace',
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 1,
  },
  coordsText: {
    fontFamily: 'Courier',
    fontSize: 8,
    color: 'rgba(138,138,133,0.4)',
    textAlign: 'right',
  },

  // ── Show More Button ──
  showMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(30,35,43,0.8)',
    backgroundColor: 'rgba(30,35,43,0.3)',
  },
  showMoreText: {
    fontFamily: 'monospace',
    fontSize: 8,
    fontWeight: '600',
    letterSpacing: 1.5,
    color: TACTICAL.textMuted,
  },

  // ── Additional Candidate Card (compact) ──
  additionalCard: {
    backgroundColor: 'rgba(30,35,43,0.25)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(30,35,43,0.6)',
    padding: 6,
    gap: 3,
  },
  additionalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  additionalRank: {
    fontFamily: 'Courier',
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    width: 20,
  },
  additionalMile: {
    fontFamily: 'Courier',
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.text,
  },
  additionalRange: {
    fontFamily: 'monospace',
    fontSize: 8,
    color: TACTICAL.textMuted,
  },
  additionalScore: {
    fontFamily: 'Courier',
    fontSize: 10,
    fontWeight: '800',
  },
  additionalLevel: {
    fontFamily: 'monospace',
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 1,
  },
  additionalConfBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 1,
    marginLeft: 3,
  },
  additionalConfText: {
    fontFamily: 'monospace',
    fontSize: 6,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  additionalMeta: {
    flexDirection: 'row',
    gap: 8,
    paddingLeft: 20,
  },
  additionalMetaText: {
    fontFamily: 'Courier',
    fontSize: 8,
    color: 'rgba(138,138,133,0.6)',
  },
  additionalConfReasons: {
    paddingLeft: 20,
    gap: 1,
  },
  additionalConfReasonText: {
    fontFamily: 'monospace',
    fontSize: 7,
    opacity: 0.8,
  },

  // ── Footer ──
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 5,
    borderTopWidth: 1,
    borderTopColor: '#1E232B',
    backgroundColor: 'rgba(30,35,43,0.3)',
  },
  footerText: {
    fontFamily: 'monospace',
    fontSize: 7,
    fontWeight: '600',
    letterSpacing: 1.5,
    color: TACTICAL.textMuted,
    opacity: 0.6,
  },
});



