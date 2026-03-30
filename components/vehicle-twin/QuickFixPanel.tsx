/**
 * QuickFixPanel — Quick Fix Recommendations for Vehicle Twin
 *
 * Displays up to 3 actionable load-balancing suggestions when
 * imbalance conditions are detected. Each suggestion shows:
 *   - Item name and weight
 *   - Current location → Suggested new location
 *   - "Preview Impact" button for simulation
 *
 * Preview mode:
 *   - "SIMULATION MODE" badge
 *   - Highlighted zone movement in blueprint
 *   - "Reset Preview" button to restore current state
 *
 * When no imbalance exists:
 *   "Load distribution optimal — no corrections required."
 *
 * ECS styling: dark tactical UI, gold accents, blueprint grid background.
 * Display-only — no data mutations.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { ECS, GOLD_RAIL } from '../../lib/theme';
import type { QuickFixSuggestion, SimulatedImpact } from '../../lib/quickFixEngine';

const { width: SCREEN_W } = Dimensions.get('window');
const IS_SMALL = SCREEN_W < 380;

/* ── Constants ──────────────────────────────────────────── */
const AMBER_ACCENT = '#D4A017';
const AMBER_WARN = '#D4901A';
const SIM_BADGE_BG = 'rgba(212,144,26,0.12)';
const SIM_BADGE_BORDER = 'rgba(212,144,26,0.35)';

const SEVERITY_COLORS = {
  warn: '#FFB74D',
  critical: '#EF5350',
};

const TYPE_ICONS: Record<string, string> = {
  roof_overload: 'arrow-down-outline',
  rear_heavy: 'arrow-forward-outline',
  lateral_imbalance: 'swap-horizontal-outline',
};

const TYPE_LABELS: Record<string, string> = {
  roof_overload: 'ROOF OVERLOAD',
  rear_heavy: 'REAR HEAVY',
  lateral_imbalance: 'LATERAL IMBALANCE',
};

/* ── Props ──────────────────────────────────────────────── */
interface Props {
  suggestions: QuickFixSuggestion[];
  isOptimal: boolean;
  /** Currently active preview suggestion ID (null = no preview) */
  activePreviewId: string | null;
  /** Simulated impact data for the active preview */
  previewImpact: SimulatedImpact | null;
  /** Callback when "Preview Impact" is pressed */
  onPreview: (suggestion: QuickFixSuggestion) => void;
  /** Callback when "Reset Preview" is pressed */
  onResetPreview: () => void;
}

/* ── Suggestion Card ────────────────────────────────────── */
function SuggestionCard({
  suggestion,
  isActive,
  impact,
  onPreview,
}: {
  suggestion: QuickFixSuggestion;
  isActive: boolean;
  impact: SimulatedImpact | null;
  onPreview: () => void;
}) {
  const sevColor = SEVERITY_COLORS[suggestion.severity];
  const typeIcon = TYPE_ICONS[suggestion.type] || 'build-outline';
  const typeLabel = TYPE_LABELS[suggestion.type] || 'IMBALANCE';

  return (
    <View style={[
      s.card,
      isActive && s.cardActive,
    ]}>
      {/* Card header: type badge */}
      <View style={s.cardHeader}>
        <View style={[s.typeBadge, { borderColor: sevColor }]}>
          <Ionicons name={typeIcon as any} size={9} color={sevColor} />
          <Text style={[s.typeLabel, { color: sevColor }]} numberOfLines={1}>
            {typeLabel}
          </Text>
        </View>
        <Text style={s.weightBadge} numberOfLines={1}>
          {suggestion.itemWeight} lb
        </Text>
      </View>

      {/* Item name */}
      <Text style={s.itemName} numberOfLines={1}>
        {suggestion.itemName}
      </Text>

      {/* Move arrow: from → to */}
      <View style={s.moveRow}>
        <View style={s.locationBox}>
          <Text style={s.locationLabel}>FROM</Text>
          <Text style={s.locationValue} numberOfLines={1}>
            {suggestion.fromLocation}
          </Text>
        </View>

        <View style={s.arrowBox}>
          <Ionicons name="arrow-forward" size={14} color={AMBER_ACCENT} />
        </View>

        <View style={[s.locationBox, s.locationBoxTo]}>
          <Text style={[s.locationLabel, { color: '#66BB6A' }]}>TO</Text>
          <Text style={[s.locationValue, { color: '#66BB6A' }]} numberOfLines={1}>
            {suggestion.toLocation}
          </Text>
        </View>
      </View>

      {/* Impact preview results (shown when active) */}
      {isActive && impact && (
        <View style={s.impactBox}>
          <View style={s.impactRow}>
            <Ionicons name="analytics-outline" size={10} color={AMBER_ACCENT} />
            <Text style={s.impactText} numberOfLines={2}>
              {impact.stabilityNote}
            </Text>
          </View>
          {impact.frontAxleDelta !== 0 && (
            <View style={s.impactRow}>
              <Ionicons name="speedometer-outline" size={10} color={AMBER_ACCENT} />
              <Text style={s.impactText} numberOfLines={1}>
                Front axle: {impact.frontAxleDelta > 0 ? '+' : ''}{impact.frontAxleDelta.toFixed(1)}% shift
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Preview button */}
      {!isActive && (
        <TouchableOpacity
          style={s.previewBtn}
          activeOpacity={0.7}
          onPress={onPreview}
        >
          <Ionicons name="eye-outline" size={11} color={AMBER_ACCENT} />
          <Text style={s.previewBtnText}>Preview Impact</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/* ── Main Panel ─────────────────────────────────────────── */
export function QuickFixPanel({
  suggestions,
  isOptimal,
  activePreviewId,
  previewImpact,
  onPreview,
  onResetPreview,
}: Props) {
  const isSimulating = activePreviewId != null;

  return (
    <View style={s.container}>
      {/* ── Header ────────────────────────────────────── */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Ionicons name="build-outline" size={IS_SMALL ? 11 : 13} color={ECS.accent} />
          <Text style={s.headerTitle} numberOfLines={1}>QUICK FIX RECOMMENDATIONS</Text>
        </View>
        {isSimulating && (
          <View style={s.simBadge}>
            <View style={s.simDot} />
            <Text style={s.simText}>SIMULATION MODE</Text>
          </View>
        )}
      </View>

      {/* ── Gold rule ─────────────────────────────────── */}
      <View style={s.goldRule} />

      {/* ── Content ───────────────────────────────────── */}
      {isOptimal && !isSimulating ? (
        /* No imbalance — optimal message */
        <View style={s.optimalBox}>
          <View style={s.optimalIconWrap}>
            <Ionicons name="checkmark-circle-outline" size={18} color="#66BB6A" />
          </View>
          <Text style={s.optimalText}>
            Load distribution optimal — no corrections required.
          </Text>
        </View>
      ) : (
        /* Suggestions list */
        <View style={s.suggestList}>
          {suggestions.map((sug) => (
            <SuggestionCard
              key={sug.id}
              suggestion={sug}
              isActive={activePreviewId === sug.id}
              impact={activePreviewId === sug.id ? previewImpact : null}
              onPreview={() => onPreview(sug)}
            />
          ))}

          {suggestions.length === 0 && !isOptimal && (
            <View style={s.emptyRow}>
              <Ionicons name="information-circle-outline" size={12} color={ECS.muted} />
              <Text style={s.emptyText}>
                No loadout items found for analysis.
              </Text>
            </View>
          )}
        </View>
      )}

      {/* ── Reset Preview button ──────────────────────── */}
      {isSimulating && (
        <View style={s.resetWrap}>
          <TouchableOpacity
            style={s.resetBtn}
            activeOpacity={0.7}
            onPress={onResetPreview}
          >
            <Ionicons name="refresh-outline" size={12} color={ECS.text} />
            <Text style={s.resetBtnText}>Reset Preview</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Footer accent ─────────────────────────────── */}
      <View style={s.footerAccent} />
    </View>
  );
}

/* ── Styles ──────────────────────────────────────────────── */
const s = StyleSheet.create({
  container: {
    backgroundColor: ECS.bgPanel,
    borderWidth: 1,
    borderColor: ECS.stroke,
    borderRadius: ECS.radius,
    overflow: 'hidden',
  },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: IS_SMALL ? 10 : 14,
    paddingTop: IS_SMALL ? 10 : 12,
    paddingBottom: IS_SMALL ? 6 : 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  headerTitle: {
    fontSize: IS_SMALL ? 8 : 9,
    fontWeight: '700',
    letterSpacing: IS_SMALL ? 2 : 3,
    color: ECS.accent,
  },

  /* Simulation mode badge */
  simBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: SIM_BADGE_BORDER,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: SIM_BADGE_BG,
  },
  simDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: AMBER_WARN,
  },
  simText: {
    fontSize: 6,
    fontWeight: '800',
    letterSpacing: 2,
    color: AMBER_WARN,
  },

  /* Gold rule */
  goldRule: {
    height: GOLD_RAIL.sectionWidth,
    backgroundColor: GOLD_RAIL.section,
    marginHorizontal: IS_SMALL ? 10 : 14,
  },

  /* Suggestion list */
  suggestList: {
    paddingHorizontal: IS_SMALL ? 10 : 14,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 8,
  },

  /* Suggestion card */
  card: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1,
    borderColor: ECS.stroke,
    borderRadius: 10,
    padding: IS_SMALL ? 10 : 12,
    gap: 6,
  },
  cardActive: {
    borderColor: SIM_BADGE_BORDER,
    backgroundColor: 'rgba(212,144,26,0.04)',
    shadowColor: AMBER_WARN,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 2,
  },

  /* Card header */
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  typeLabel: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 2,
  },
  weightBadge: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: 'Courier',
    letterSpacing: 1,
    color: ECS.text,
  },

  /* Item name */
  itemName: {
    fontSize: IS_SMALL ? 12 : 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: ECS.text,
  },

  /* Move row: FROM → TO */
  moveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  locationBox: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  locationBoxTo: {
    borderColor: 'rgba(102,187,106,0.2)',
    backgroundColor: 'rgba(102,187,106,0.03)',
  },
  locationLabel: {
    fontSize: 6,
    fontWeight: '700',
    letterSpacing: 2,
    color: ECS.muted,
    marginBottom: 2,
  },
  locationValue: {
    fontSize: IS_SMALL ? 9 : 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    color: ECS.text,
  },
  arrowBox: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Impact preview box */
  impactBox: {
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: 0.5,
    borderTopColor: GOLD_RAIL.subsection,
    gap: 4,
  },
  impactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  impactText: {
    flex: 1,
    fontSize: IS_SMALL ? 9 : 10,
    fontWeight: '500',
    letterSpacing: 0.3,
    color: ECS.muted,
    lineHeight: IS_SMALL ? 13 : 14,
  },

  /* Preview button */
  previewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 4,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.25)',
    borderRadius: 8,
    backgroundColor: 'rgba(212,160,23,0.04)',
  },
  previewBtnText: {
    fontSize: IS_SMALL ? 9 : 10,
    fontWeight: '700',
    letterSpacing: 2,
    color: AMBER_ACCENT,
  },

  /* Optimal message */
  optimalBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: IS_SMALL ? 10 : 14,
    paddingVertical: 14,
  },
  optimalIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(102,187,106,0.3)',
    backgroundColor: 'rgba(102,187,106,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optimalText: {
    flex: 1,
    fontSize: IS_SMALL ? 10 : 11,
    fontWeight: '500',
    letterSpacing: 0.3,
    lineHeight: IS_SMALL ? 15 : 17,
    color: ECS.text,
  },

  /* Empty state */
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  emptyText: {
    flex: 1,
    fontSize: IS_SMALL ? 10 : 11,
    fontWeight: '500',
    letterSpacing: 0.3,
    color: ECS.muted,
  },

  /* Reset button */
  resetWrap: {
    paddingHorizontal: IS_SMALL ? 10 : 14,
    paddingBottom: 10,
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: ECS.stroke,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  resetBtnText: {
    fontSize: IS_SMALL ? 9 : 10,
    fontWeight: '700',
    letterSpacing: 2,
    color: ECS.text,
  },

  /* Footer accent */
  footerAccent: {
    height: 2,
    backgroundColor: GOLD_RAIL.internal,
  },
});



