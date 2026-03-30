// ============================================================
// AI ROUTE PREVIEW MODAL — Enhanced Route Detail View
// ============================================================
// Full-screen modal with:
//   - Route overview and expedition summary
//   - Risk preview section with factors
//   - Vehicle capability match
//   - Route intelligence advisories
//   - Hidden gem indicator
//   - Terrain, remoteness, difficulty details
//   - Action buttons: Save, Build Expedition, Compare, View on Map
// ============================================================

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
  Platform,
} from 'react-native';
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
  getRouteLabelConfig,
  generateRouteIntelligence,
  toggleSaveRoute,
  isRouteSaved,
} from '../../lib/discoveryIntelligenceEngine';

interface AIRoutePreviewModalProps {
  visible: boolean;
  route: AIGeneratedRoute | null;
  enrichedRoute?: EnrichedDiscoveryRoute | null;
  onClose: () => void;
  onBuildExpedition?: () => void;
}

export default function AIRoutePreviewModal({
  visible,
  route,
  enrichedRoute,
  onClose,
  onBuildExpedition,
}: AIRoutePreviewModalProps) {
  if (!route) return null;

  const terrainColor = getTerrainColor(route.terrainType);
  const remotenessColor = getRemotenessColor(route.remotenessScore);
  const remotenessLabel = getRemotenessLabel(route.remotenessScore);
  const confidenceColor = getConfidenceColor(route.confidence);
  const confidenceLabel = getConfidenceLabel(route.confidence);
  const confidenceIcon = getConfidenceIcon(route.confidence);

  const routeLabel = enrichedRoute?.routeLabel ?? 'AI Suggested';
  const labelConfig = getRouteLabelConfig(routeLabel);
  const riskPreview = enrichedRoute?.riskPreview;
  const vehicleMatch = enrichedRoute?.vehicleMatch;
  const gemScore = enrichedRoute?.gemScore;
  const intelligence = enrichedRoute ? generateRouteIntelligence(enrichedRoute) : [];

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
  const saved = isRouteSaved(route.id);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={s.container}>
        {/* Header */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <View style={[s.labelBadge, { borderColor: labelConfig.color + '50', backgroundColor: labelConfig.color + '14' }]}>
              <Ionicons name={labelConfig.icon as any} size={10} color={labelConfig.color} />
              <Text style={[s.labelBadgeText, { color: labelConfig.color }]}>{routeLabel.toUpperCase()}</Text>
            </View>
            <Text style={s.headerTitle}>ROUTE PREVIEW</Text>
          </View>
          <TouchableOpacity style={s.closeBtn} onPress={onClose} activeOpacity={0.7}>
            <Ionicons name="close" size={20} color={TACTICAL.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={s.goldRail} />

        <ScrollView style={s.scrollArea} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Route Name */}
          <Text style={s.routeName}>{route.name}</Text>
          <Text style={s.routeRegion}>{route.region}</Text>

          {/* Risk Preview Banner */}
          {riskPreview && (
            <View style={[s.riskBanner, { borderColor: riskPreview.color + '30', backgroundColor: riskPreview.color + '08' }]}>
              <View style={[s.riskIconWrap, { backgroundColor: riskPreview.color + '18' }]}>
                <Ionicons name="shield-outline" size={16} color={riskPreview.color} />
              </View>
              <View style={s.riskContent}>
                <View style={s.riskHeaderRow}>
                  <Text style={[s.riskLevel, { color: riskPreview.color }]}>{riskPreview.level.toUpperCase()} RISK</Text>
                  <Text style={[s.riskScore, { color: riskPreview.color }]}>{riskPreview.score}/100</Text>
                </View>
                <Text style={s.riskDescriptor}>{riskPreview.descriptor}</Text>
                {riskPreview.factors.map((f, i) => (
                  <View key={i} style={s.riskFactorRow}>
                    <View style={[s.riskFactorDot, { backgroundColor: riskPreview.color }]} />
                    <Text style={s.riskFactorText}>{f}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Vehicle Match Banner */}
          {vehicleMatch && vehicleMatch.score > 0 && (
            <View style={[s.vehicleBanner, { borderColor: vehicleMatch.color + '30', backgroundColor: vehicleMatch.color + '08' }]}>
              <Ionicons name="car-outline" size={14} color={vehicleMatch.color} />
              <View style={s.vehicleContent}>
                <Text style={[s.vehicleLevel, { color: vehicleMatch.color }]}>VEHICLE MATCH: {vehicleMatch.level.toUpperCase()}</Text>
                <Text style={s.vehicleNote}>{vehicleMatch.note}</Text>
                {vehicleMatch.concerns.map((c, i) => (
                  <Text key={i} style={s.vehicleConcern}>{c}</Text>
                ))}
              </View>
            </View>
          )}

          {/* Confidence Banner */}
          <View style={[s.confidenceBanner, { borderColor: confidenceColor + '30', backgroundColor: confidenceColor + '08' }]}>
            <Ionicons name={confidenceIcon as any} size={14} color={confidenceColor} />
            <View style={s.confidenceContent}>
              <Text style={[s.confidenceTitle, { color: confidenceColor }]}>{confidenceLabel}</Text>
              <Text style={s.confidenceDesc}>
                {route.confidence === 'high'
                  ? 'This route follows well-documented forest service roads or BLM routes.'
                  : route.confidence === 'good'
                  ? 'This route concept is based on known public land access with likely trail networks.'
                  : 'This is a preliminary route idea worth scouting. Verify conditions before departure.'
                }
              </Text>
            </View>
          </View>

          {/* Key Metrics Grid */}
          <View style={s.metricsGrid}>
            <View style={s.metricCard}>
              <Ionicons name="resize-outline" size={16} color={TACTICAL.amber} />
              <Text style={s.metricValue}>{route.distanceMiles}</Text>
              <Text style={s.metricLabel}>MILES</Text>
            </View>
            <View style={s.metricCard}>
              <Ionicons name="calendar-outline" size={16} color={TACTICAL.amber} />
              <Text style={s.metricValue}>{route.estimatedDays}</Text>
              <Text style={s.metricLabel}>{route.estimatedDays === 1 ? 'DAY' : 'DAYS'}</Text>
            </View>
            <View style={s.metricCard}>
              <Ionicons name="trending-up-outline" size={16} color={TACTICAL.amber} />
              <Text style={s.metricValue}>{(route.elevationGainFt / 1000).toFixed(1)}k</Text>
              <Text style={s.metricLabel}>FT GAIN</Text>
            </View>
            <View style={s.metricCard}>
              <Ionicons name="flame-outline" size={16} color={TACTICAL.amber} />
              <Text style={s.metricValue}>{route.estimatedFuelRequired}</Text>
              <Text style={s.metricLabel}>GALLONS</Text>
            </View>
          </View>

          {/* Attribute Chips */}
          <View style={s.chipSection}>
            <View style={[s.chip, { borderColor: terrainColor + '40', backgroundColor: terrainColor + '0C' }]}>
              <Ionicons name="trail-sign-outline" size={10} color={terrainColor} />
              <Text style={[s.chipText, { color: terrainColor }]}>{route.terrainType.toUpperCase()}</Text>
            </View>
            <View style={[s.chip, { borderColor: remotenessColor + '40', backgroundColor: remotenessColor + '0C' }]}>
              <Ionicons name="radio-outline" size={10} color={remotenessColor} />
              <Text style={[s.chipText, { color: remotenessColor }]}>REMOTENESS: {remotenessLabel}</Text>
            </View>
            <View style={[s.chip, { borderColor: diffColor + '40', backgroundColor: diffColor + '0C' }]}>
              <Ionicons name="speedometer-outline" size={10} color={diffColor} />
              <Text style={[s.chipText, { color: diffColor }]}>DIFFICULTY: {diffLabel}</Text>
            </View>
            {route.permitRequired && (
              <View style={[s.chip, { borderColor: '#E67E2240', backgroundColor: '#E67E220C' }]}>
                <Ionicons name="document-text-outline" size={10} color="#E67E22" />
                <Text style={[s.chipText, { color: '#E67E22' }]}>PERMIT REQUIRED</Text>
              </View>
            )}
            <View style={[s.chip, { borderColor: ECS.stroke }]}>
              <Ionicons name="sunny-outline" size={10} color={TACTICAL.textMuted} />
              <Text style={[s.chipText, { color: TACTICAL.textMuted }]}>BEST: {route.bestSeason.toUpperCase()}</Text>
            </View>
            {gemScore?.isGem && (
              <View style={[s.chip, { borderColor: '#E67E2240', backgroundColor: '#E67E220C' }]}>
                <Ionicons name="diamond-outline" size={10} color="#E67E22" />
                <Text style={[s.chipText, { color: '#E67E22' }]}>HIDDEN GEM</Text>
              </View>
            )}
          </View>

          {/* Route Intelligence Advisories */}
          {intelligence.length > 0 && (
            <View style={s.section}>
              <View style={s.sectionHeader}>
                <Ionicons name="analytics-outline" size={12} color={TACTICAL.amber} />
                <Text style={s.sectionTitle}>ROUTE INTELLIGENCE</Text>
              </View>
              {intelligence.map((msg, i) => (
                <View key={i} style={s.intelRow}>
                  <Ionicons name="information-circle-outline" size={12} color={TACTICAL.textMuted} />
                  <Text style={s.intelText}>{msg}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Expedition Summary */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="compass-outline" size={12} color={TACTICAL.amber} />
              <Text style={s.sectionTitle}>EXPEDITION OVERVIEW</Text>
            </View>
            <Text style={s.sectionBody}>{route.expeditionSummary || route.description}</Text>
          </View>

          {/* Highlights */}
          {route.highlights && route.highlights.length > 0 && (
            <View style={s.section}>
              <View style={s.sectionHeader}>
                <Ionicons name="star-outline" size={12} color={TACTICAL.amber} />
                <Text style={s.sectionTitle}>ROUTE HIGHLIGHTS</Text>
              </View>
              {route.highlights.map((h, i) => (
                <View key={i} style={s.highlightRow}>
                  <View style={s.highlightBullet} />
                  <Text style={s.highlightText}>{h}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Camp Suitability */}
          {route.campSuitability ? (
            <View style={s.section}>
              <View style={s.sectionHeader}>
                <Ionicons name="bonfire-outline" size={12} color="#66BB6A" />
                <Text style={[s.sectionTitle, { color: '#66BB6A' }]}>CAMP SUITABILITY</Text>
              </View>
              <Text style={s.sectionBody}>{route.campSuitability}</Text>
              <View style={s.campStats}>
                <View style={s.campStat}>
                  <Text style={s.campStatValue}>{route.suggestedCamps}</Text>
                  <Text style={s.campStatLabel}>SUGGESTED CAMPS</Text>
                </View>
              </View>
            </View>
          ) : null}

          {/* Caution Notes */}
          {route.cautionNotes ? (
            <View style={[s.section, s.cautionSection]}>
              <View style={s.sectionHeader}>
                <Ionicons name="warning-outline" size={12} color="#E67E22" />
                <Text style={[s.sectionTitle, { color: '#E67E22' }]}>CAUTION NOTES</Text>
              </View>
              <Text style={[s.sectionBody, { color: '#E67E22CC' }]}>{route.cautionNotes}</Text>
            </View>
          ) : null}

          {/* Distance Info */}
          {route.distanceFromUserMiles != null && (
            <View style={s.distanceInfo}>
              <Ionicons name="navigate-outline" size={12} color={TACTICAL.amber} />
              <Text style={s.distanceText}>
                {route.distanceFromUserMiles} miles from your location
                {route.estimatedTravelHours ? ` · ~${route.estimatedTravelHours.toFixed(1)} hours drive` : ''}
              </Text>
            </View>
          )}

          {/* Action Buttons */}
          <View style={s.actionSection}>
            <TouchableOpacity style={s.primaryAction} activeOpacity={0.8} onPress={() => { hapticMicro(); onBuildExpedition?.(); }}>
              <Ionicons name="compass-outline" size={16} color={ECS.bgPrimary} />
              <Text style={s.primaryActionText}>BUILD EXPEDITION</Text>
            </TouchableOpacity>
            <View style={s.secondaryActions}>
              <TouchableOpacity style={s.secondaryAction} activeOpacity={0.7} onPress={() => { hapticMicro(); toggleSaveRoute(route.id); }}>
                <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={14} color={saved ? TACTICAL.amber : TACTICAL.textMuted} />
                <Text style={[s.secondaryActionText, saved && { color: TACTICAL.amber }]}>{saved ? 'SAVED' : 'SAVE ROUTE'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.secondaryAction} activeOpacity={0.7} onPress={() => hapticMicro()}>
                <Ionicons name="map-outline" size={14} color={TACTICAL.textMuted} />
                <Text style={s.secondaryActionText}>VIEW ON MAP</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* AI Disclaimer */}
          <View style={s.disclaimer}>
            <Ionicons name="information-circle-outline" size={11} color={TACTICAL.textMuted} />
            <Text style={s.disclaimerText}>
              This route was generated by AI based on geographic data and terrain analysis. 
              Verify road conditions, access permissions, and seasonal closures before departure. 
              AI-suggested routes are expedition concepts, not verified navigable trails.
            </Text>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const TOP_PAD = Platform.OS === 'web' ? 16 : 54;

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: ECS.bgPrimary },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: TOP_PAD, paddingBottom: 12,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { fontSize: 11, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 3 },
  closeBtn: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: ECS.bgElev,
    borderWidth: 1, borderColor: ECS.stroke, alignItems: 'center', justifyContent: 'center',
  },
  labelBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1,
  },
  labelBadgeText: { fontSize: 7, fontWeight: '900', letterSpacing: 1.5 },

  goldRail: { height: GOLD_RAIL.sectionWidth, backgroundColor: GOLD_RAIL.section },

  scrollArea: { flex: 1 },
  scrollContent: { padding: 16, gap: 16 },

  routeName: { fontSize: 22, fontWeight: '800', color: ECS.text, letterSpacing: 1 },
  routeRegion: { fontSize: 13, fontWeight: '500', color: TACTICAL.textMuted, letterSpacing: 0.5, marginTop: -8 },

  // Risk Preview Banner
  riskBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    padding: 12, borderRadius: ECS.radius, borderWidth: 1,
  },
  riskIconWrap: {
    width: 32, height: 32, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  riskContent: { flex: 1, gap: 4 },
  riskHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  riskLevel: { fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  riskScore: { fontSize: 10, fontWeight: '800', fontFamily: 'Courier' },
  riskDescriptor: { fontSize: 11, fontWeight: '500', color: TACTICAL.textMuted, lineHeight: 16 },
  riskFactorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 2 },
  riskFactorDot: { width: 4, height: 4, borderRadius: 2, opacity: 0.6 },
  riskFactorText: { fontSize: 10, fontWeight: '500', color: TACTICAL.textMuted, lineHeight: 15 },

  // Vehicle Match Banner
  vehicleBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    padding: 12, borderRadius: ECS.radius, borderWidth: 1,
  },
  vehicleContent: { flex: 1, gap: 3 },
  vehicleLevel: { fontSize: 9, fontWeight: '900', letterSpacing: 2 },
  vehicleNote: { fontSize: 11, fontWeight: '500', color: TACTICAL.textMuted, lineHeight: 16 },
  vehicleConcern: { fontSize: 10, fontWeight: '500', color: '#E67E22CC', lineHeight: 15, paddingLeft: 2 },

  // Confidence Banner
  confidenceBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    padding: 12, borderRadius: ECS.radius, borderWidth: 1,
  },
  confidenceContent: { flex: 1, gap: 3 },
  confidenceTitle: { fontSize: 9, fontWeight: '900', letterSpacing: 2 },
  confidenceDesc: { fontSize: 11, fontWeight: '500', color: TACTICAL.textMuted, lineHeight: 16 },

  // Metrics Grid
  metricsGrid: { flexDirection: 'row', gap: 8 },
  metricCard: {
    flex: 1, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 6,
    backgroundColor: ECS.bgPanel, borderRadius: 10, borderWidth: 1, borderColor: ECS.stroke, gap: 4,
  },
  metricValue: { fontSize: 18, fontWeight: '800', fontFamily: 'Courier', color: TACTICAL.amber },
  metricLabel: { fontSize: 7, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 1.5 },

  // Chips
  chipSection: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1,
    borderColor: ECS.stroke, backgroundColor: ECS.bgElev,
  },
  chipText: { fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },

  // Sections
  section: {
    backgroundColor: ECS.bgPanel, borderRadius: ECS.radius, borderWidth: 1,
    borderColor: ECS.stroke, padding: 14, gap: 8,
  },
  cautionSection: { borderColor: '#E67E2225', backgroundColor: '#E67E2206' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitle: { fontSize: 9, fontWeight: '900', color: TACTICAL.amber, letterSpacing: 2.5 },
  sectionBody: { fontSize: 13, fontWeight: '500', color: ECS.text, lineHeight: 20, letterSpacing: 0.2, opacity: 0.85 },

  // Intelligence
  intelRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingLeft: 2 },
  intelText: { fontSize: 11, fontWeight: '500', color: TACTICAL.textMuted, lineHeight: 16, flex: 1 },

  // Highlights
  highlightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingLeft: 4 },
  highlightBullet: { width: 4, height: 4, borderRadius: 2, backgroundColor: TACTICAL.amber, marginTop: 6, opacity: 0.6 },
  highlightText: { fontSize: 12, fontWeight: '500', color: ECS.text, lineHeight: 18, flex: 1, opacity: 0.8 },

  // Camp Stats
  campStats: {
    flexDirection: 'row', gap: 12, paddingTop: 4,
    borderTopWidth: GOLD_RAIL.subsectionWidth, borderTopColor: GOLD_RAIL.internal,
  },
  campStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  campStatValue: { fontSize: 14, fontWeight: '800', fontFamily: 'Courier', color: '#66BB6A' },
  campStatLabel: { fontSize: 7, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1 },

  // Distance Info
  distanceInfo: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  distanceText: { fontSize: 12, fontWeight: '500', color: TACTICAL.textMuted, letterSpacing: 0.3 },

  // Actions
  actionSection: { gap: 10 },
  primaryAction: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, backgroundColor: TACTICAL.amber, borderRadius: 12,
  },
  primaryActionText: { fontSize: 13, fontWeight: '800', color: ECS.bgPrimary, letterSpacing: 3 },
  secondaryActions: { flexDirection: 'row', gap: 8 },
  secondaryAction: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: ECS.stroke, backgroundColor: ECS.bgPanel,
  },
  secondaryActionText: { fontSize: 9, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 2 },

  // Disclaimer
  disclaimer: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingHorizontal: 4, paddingVertical: 8 },
  disclaimerText: { fontSize: 10, fontWeight: '500', color: TACTICAL.textMuted, lineHeight: 15, flex: 1, opacity: 0.7 },
});



