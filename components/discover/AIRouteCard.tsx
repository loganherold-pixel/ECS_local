// ============================================================
// AI ROUTE CARD — Enhanced Discovery Route Card
// ============================================================
// Visually distinct card for AI-generated and enriched routes.
// Features:
//   - Route label badge (AI Suggested, Hidden Gem, Remote Option, etc.)
//   - Confidence indicator
//   - Risk preview indicator
//   - Vehicle match indicator
//   - Terrain, remoteness, difficulty chips
//   - Action buttons: Preview, Save, Build Expedition
// ============================================================

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, GOLD_RAIL, ECS } from '../../lib/theme';
import { hapticMicro } from '../../lib/haptics';
import {
  getTerrainColor,
  getRemotenessLabel,
  getRemotenessColor,
} from '../../lib/discoverEngine';
import {
  type AIGeneratedRoute,
  getConfidenceLabel,
  getConfidenceColor,
  getConfidenceIcon,
} from '../../lib/aiRouteTypes';
import {
  type EnrichedDiscoveryRoute,
  type RouteLabel,
  getRouteLabelConfig,
  toggleSaveRoute,
  isRouteSaved,
} from '../../lib/discoveryIntelligenceEngine';

interface AIRouteCardProps {
  route: AIGeneratedRoute;
  enrichedRoute?: EnrichedDiscoveryRoute | null;
  onPreview: () => void;
  onSave?: () => void;
  onBuildExpedition?: () => void;
}

export default function AIRouteCard({
  route,
  enrichedRoute,
  onPreview,
  onSave,
  onBuildExpedition,
}: AIRouteCardProps) {
  const [isSaved, setIsSaved] = useState(() => isRouteSaved(route.id));

  const terrainColor = getTerrainColor(route.terrainType);
  const remotenessColor = getRemotenessColor(route.remotenessScore);
  const remotenessLabel = getRemotenessLabel(route.remotenessScore);
  const confidenceColor = getConfidenceColor(route.confidence);
  const confidenceLabel = getConfidenceLabel(route.confidence);
  const confidenceIcon = getConfidenceIcon(route.confidence);

  // Use enriched route label or fallback to AI label
  const routeLabel: RouteLabel = enrichedRoute?.routeLabel ?? 'AI Suggested';
  const labelConfig = getRouteLabelConfig(routeLabel);

  // Risk preview from enriched route
  const riskPreview = enrichedRoute?.riskPreview;
  const vehicleMatch = enrichedRoute?.vehicleMatch;
  const isGem = enrichedRoute?.gemScore?.isGem ?? false;

  const getDiffLabel = (d: number): string => {
    if (d <= 2) return 'EASY';
    if (d <= 4) return 'MODERATE';
    if (d <= 6) return 'CHALLENGING';
    if (d <= 8) return 'HARD';
    return 'EXTREME';
  };
  const getDiffColor = (d: number): string => {
    if (d <= 2) return '#66BB6A';
    if (d <= 4) return '#5AC8FA';
    if (d <= 6) return '#D4A017';
    if (d <= 8) return '#E67E22';
    return '#E04030';
  };

  const diffLabel = getDiffLabel(route.terrainDifficulty ?? 5);
  const diffColor = getDiffColor(route.terrainDifficulty ?? 5);

  const handleSave = () => {
    hapticMicro();
    const nowSaved = toggleSaveRoute(route.id);
    setIsSaved(nowSaved);
    onSave?.();
  };

  return (
    <TouchableOpacity
      style={s.card}
      activeOpacity={0.82}
      onPress={() => { hapticMicro(); onPreview(); }}
    >
      {/* Left accent bar */}
      <View style={s.accentBar}>
        <View style={[s.accentTop, { backgroundColor: labelConfig.color }]} />
        <View style={[s.accentBot, { backgroundColor: riskPreview?.color ?? confidenceColor }]} />
      </View>

      <View style={s.cardBody}>
        {/* Badge Row */}
        <View style={s.badgeRow}>
          <View style={[s.routeLabelBadge, { borderColor: labelConfig.color + '50', backgroundColor: labelConfig.color + '14' }]}>
            <Ionicons name={labelConfig.icon as any} size={9} color={labelConfig.color} />
            <Text style={[s.routeLabelText, { color: labelConfig.color }]}>{routeLabel.toUpperCase()}</Text>
          </View>
          <View style={[s.confidenceBadge, { borderColor: confidenceColor + '40', backgroundColor: confidenceColor + '0C' }]}>
            <Ionicons name={confidenceIcon as any} size={8} color={confidenceColor} />
            <Text style={[s.confidenceText, { color: confidenceColor }]}>{confidenceLabel}</Text>
          </View>
          {isGem && (
            <View style={s.gemBadge}>
              <Ionicons name="diamond-outline" size={8} color="#E67E22" />
            </View>
          )}
        </View>

        {/* Name + Region */}
        <View style={s.nameBlock}>
          <Text style={s.cardName} numberOfLines={1}>{route.name}</Text>
          <Text style={s.cardRegion}>{route.region}</Text>
        </View>

        {/* Key Stats Row */}
        <View style={s.statsRow}>
          {route.distanceFromUserMiles != null && (
            <View style={s.statItem}>
              <Ionicons name="navigate-outline" size={11} color={TACTICAL.amber} />
              <Text style={s.statValue}>{route.distanceFromUserMiles}</Text>
              <Text style={s.statUnit}>MI AWAY</Text>
            </View>
          )}
          <View style={s.statItem}>
            <Ionicons name="resize-outline" size={10} color={TACTICAL.textMuted} />
            <Text style={s.statValue}>{route.distanceMiles}</Text>
            <Text style={s.statUnit}>MI</Text>
          </View>
          <View style={s.statItem}>
            <Ionicons name="calendar-outline" size={10} color={TACTICAL.textMuted} />
            <Text style={s.statValue}>{route.estimatedDays}</Text>
            <Text style={s.statUnit}>{route.estimatedDays === 1 ? 'DAY' : 'DAYS'}</Text>
          </View>
          {riskPreview && (
            <View style={s.statItem}>
              <Ionicons name="shield-outline" size={10} color={riskPreview.color} />
              <Text style={[s.statValue, { color: riskPreview.color }]}>{riskPreview.level.toUpperCase().slice(0, 3)}</Text>
              <Text style={s.statUnit}>RISK</Text>
            </View>
          )}
        </View>

        {/* Description */}
        <Text style={s.description} numberOfLines={2}>{route.description}</Text>

        {/* Chip Row */}
        <View style={s.chipRow}>
          <View style={[s.chip, { borderColor: terrainColor + '40', backgroundColor: terrainColor + '0C' }]}>
            <Ionicons name="trail-sign-outline" size={8} color={terrainColor} />
            <Text style={[s.chipText, { color: terrainColor }]}>{route.terrainType.toUpperCase()}</Text>
          </View>
          <View style={[s.chip, { borderColor: remotenessColor + '40', backgroundColor: remotenessColor + '0C' }]}>
            <Ionicons name="radio-outline" size={8} color={remotenessColor} />
            <Text style={[s.chipText, { color: remotenessColor }]}>{remotenessLabel}</Text>
          </View>
          <View style={[s.chip, { borderColor: diffColor + '40', backgroundColor: diffColor + '0C' }]}>
            <Ionicons name="speedometer-outline" size={8} color={diffColor} />
            <Text style={[s.chipText, { color: diffColor }]}>{diffLabel}</Text>
          </View>
          {vehicleMatch && vehicleMatch.score > 0 && (
            <View style={[s.chip, { borderColor: vehicleMatch.color + '40', backgroundColor: vehicleMatch.color + '0C' }]}>
              <Ionicons name="car-outline" size={8} color={vehicleMatch.color} />
              <Text style={[s.chipText, { color: vehicleMatch.color }]}>{vehicleMatch.level.toUpperCase()}</Text>
            </View>
          )}
        </View>

        {/* Action Row */}
        <View style={s.actionRow}>
          <TouchableOpacity style={s.actionBtn} activeOpacity={0.7} onPress={() => { hapticMicro(); onPreview(); }}>
            <Ionicons name="eye-outline" size={11} color={TACTICAL.amber} />
            <Text style={s.actionBtnText}>PREVIEW</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.actionBtn, isSaved && s.actionBtnActive]} activeOpacity={0.7} onPress={handleSave}>
            <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={11} color={isSaved ? TACTICAL.amber : TACTICAL.textMuted} />
            <Text style={[s.actionBtnText, isSaved && { color: TACTICAL.amber }]}>{isSaved ? 'SAVED' : 'SAVE'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.actionBtn} activeOpacity={0.7} onPress={() => { hapticMicro(); onBuildExpedition?.(); }}>
            <Ionicons name="compass-outline" size={11} color={TACTICAL.textMuted} />
            <Text style={s.actionBtnText}>BUILD</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <Ionicons name="chevron-forward" size={12} color={TACTICAL.textMuted} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: ECS.bgPanel,
    borderRadius: ECS.radius,
    borderWidth: 1,
    borderColor: '#5AC8FA18',
    marginBottom: 10,
    overflow: 'hidden',
  },
  accentBar: { width: 4, flexDirection: 'column' },
  accentTop: { flex: 1 },
  accentBot: { flex: 1 },
  cardBody: { flex: 1, padding: 14, gap: 8 },

  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  routeLabelBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1,
  },
  routeLabelText: { fontSize: 7, fontWeight: '900', letterSpacing: 1.5 },
  confidenceBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, borderWidth: 1,
  },
  confidenceText: { fontSize: 6, fontWeight: '800', letterSpacing: 1 },
  gemBadge: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: '#E67E220C', borderWidth: 1, borderColor: '#E67E2240',
    alignItems: 'center', justifyContent: 'center',
  },

  nameBlock: { gap: 2 },
  cardName: { fontSize: 15, fontWeight: '700', color: ECS.text, letterSpacing: 1 },
  cardRegion: { fontSize: 11, fontWeight: '500', color: TACTICAL.textMuted, letterSpacing: 0.5 },

  statsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 4, paddingHorizontal: 2,
    borderTopWidth: GOLD_RAIL.subsectionWidth, borderTopColor: GOLD_RAIL.internal,
  },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statValue: { fontSize: 13, fontWeight: '800', fontFamily: 'Courier', color: TACTICAL.amber, letterSpacing: -0.5 },
  statUnit: { fontSize: 7, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1 },

  description: { fontSize: 11, fontWeight: '500', color: TACTICAL.textMuted, lineHeight: 16, letterSpacing: 0.2 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 3, borderRadius: 5, borderWidth: 1,
    borderColor: ECS.stroke, backgroundColor: ECS.bgElev,
  },
  chipText: { fontSize: 7, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 0.5 },

  actionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingTop: 4, borderTopWidth: GOLD_RAIL.subsectionWidth, borderTopColor: GOLD_RAIL.internal,
  },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, borderWidth: 1,
    borderColor: ECS.stroke, backgroundColor: ECS.bgElev,
  },
  actionBtnActive: { borderColor: TACTICAL.amber + '40', backgroundColor: TACTICAL.amber + '0C' },
  actionBtnText: { fontSize: 7, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 1.5 },
});



