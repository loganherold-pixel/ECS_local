import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import ECSShellTexture from '../ECSShellTexture';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import type { ECSCommandModuleDefinition } from '../../lib/ecsCommandModuleStore';
import {
  buildTerrainRiskCommandRoute,
  formatDistance,
  formatTerrainRiskLabel,
  type DistanceUnit,
  type TerrainHazard,
  type TerrainRiskFactor,
  type TerrainRiskLevel,
  type TerrainRiskRouteContext,
} from '../../lib/terrainRiskCommandProfile';
import TerrainRiskSideProfile, { getTerrainCommandRiskColor } from './TerrainRiskSideProfile';

type Props = {
  definition: ECSCommandModuleDefinition;
  routeContext?: TerrainRiskRouteContext | null;
  onViewHazardOnMap?: (hazard: TerrainHazard) => void;
};

const RISK_LEGEND: { level: TerrainRiskLevel; range: string }[] = [
  { level: 'low', range: '0-33' },
  { level: 'moderate', range: '34-66' },
  { level: 'high', range: '67-100' },
];

function UnitToggle({
  unit,
  onChange,
}: {
  unit: DistanceUnit;
  onChange: (unit: DistanceUnit) => void;
}) {
  return (
    <View
      style={styles.unitToggle}
      accessibilityLabel="Terrain Risk distance unit"
      accessibilityRole="tablist"
    >
      {(['mi', 'km'] as DistanceUnit[]).map((candidate) => {
        const selected = unit === candidate;
        return (
          <TouchableOpacity
            key={candidate}
            accessibilityRole="tab"
            accessibilityLabel={`Show Terrain Risk distances in ${candidate === 'mi' ? 'miles' : 'kilometers'}`}
            accessibilityState={{ selected }}
            activeOpacity={0.76}
            hitSlop={{ top: 8, right: 4, bottom: 8, left: 4 }}
            onPress={() => onChange(candidate)}
            style={[styles.unitToggleButton, selected ? styles.unitToggleButtonSelected : null]}
          >
            <Text style={[styles.unitToggleText, selected ? styles.unitToggleTextSelected : null]}>
              {candidate.toUpperCase()}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function RiskFactorCard({ factor }: { factor: TerrainRiskFactor }) {
  const color = getTerrainCommandRiskColor(factor.status);
  return (
    <View style={[styles.factorCard, { borderColor: `${color}35` }]}>
      <Text style={styles.factorLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.64}>
        {factor.label}
      </Text>
      <Text style={[styles.factorValue, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.58}>
        {factor.value}
      </Text>
      {factor.detail ? (
        <Text style={styles.factorDetail} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.62}>
          {factor.detail}
        </Text>
      ) : null}
    </View>
  );
}

function RiskLegendItem({ level, range }: { level: TerrainRiskLevel; range: string }) {
  const color = getTerrainCommandRiskColor(level);
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText} numberOfLines={1}>
        {formatTerrainRiskLabel(level)} {range}
      </Text>
    </View>
  );
}

export default function TerrainRiskCommandModule({
  definition,
  routeContext,
  onViewHazardOnMap,
}: Props) {
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>('mi');
  const routeContextActive = routeContext?.active ?? null;
  const routeContextId = routeContext?.routeId ?? null;
  const routeContextName = routeContext?.routeName ?? null;
  const routeContextTotalDistanceMiles = routeContext?.totalDistanceMiles ?? null;
  const routeContextCompletedDistanceMiles = routeContext?.completedDistanceMiles ?? null;
  const routeContextSourceLabel = routeContext?.sourceLabel ?? null;
  const routeContextSegments = routeContext?.routeSegments ?? null;
  const routeContextPoints = routeContext?.routePoints ?? null;
  const routeContextCurrentElevationFeet = routeContext?.currentElevationFeet ?? null;
  const route = useMemo(
    () => buildTerrainRiskCommandRoute({
      active: routeContextActive,
      routeId: routeContextId,
      routeName: routeContextName,
      totalDistanceMiles: routeContextTotalDistanceMiles,
      completedDistanceMiles: routeContextCompletedDistanceMiles,
      sourceLabel: routeContextSourceLabel,
      routeSegments: routeContextSegments,
      routePoints: routeContextPoints,
      currentElevationFeet: routeContextCurrentElevationFeet,
    }),
    [
      routeContextActive,
      routeContextId,
      routeContextName,
      routeContextTotalDistanceMiles,
      routeContextCompletedDistanceMiles,
      routeContextSourceLabel,
      routeContextSegments,
      routeContextPoints,
      routeContextCurrentElevationFeet,
    ],
  );

  if (!route) {
    const emptyTitle = routeContextActive ? 'Terrain profile unavailable' : 'No active guidance';
    const emptyMessage = routeContextActive
      ? 'Active guidance is running, but this route does not include elevation points for the terrain side profile yet.'
      : 'Start live route guidance with an elevation-backed route to load the terrain side profile.';

    return (
      <View style={styles.container} testID="terrain-risk-command-module">
        <View pointerEvents="none" style={styles.topoLayer}>
          <View style={[styles.topoLine, styles.topoLineA]} />
          <View style={[styles.topoLine, styles.topoLineB]} />
          <View style={[styles.topoLine, styles.topoLineC]} />
        </View>

        <View style={styles.headerRow}>
          <ECSShellTexture />
          <View style={[styles.iconChip, { borderColor: 'rgba(212,160,23,0.28)' }]}>
            <Ionicons name={definition.icon as any} size={15} color={TACTICAL.textMuted} />
          </View>
          <View style={styles.headerCopy}>
            <Text style={[styles.title, { color: TACTICAL.textMuted }]} numberOfLines={1}>
              {definition.label}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {routeContextActive ? 'Elevation profile pending' : 'Live route terrain required'}
            </Text>
          </View>
          <UnitToggle unit={distanceUnit} onChange={setDistanceUnit} />
        </View>

        <View style={styles.emptyGuidancePanel}>
          <Text style={styles.emptyGuidanceTitle} numberOfLines={1}>
            {emptyTitle}
          </Text>
          <Text style={styles.emptyGuidanceText} numberOfLines={2}>
            {emptyMessage}
          </Text>
        </View>
      </View>
    );
  }

  const overallRiskColor = getTerrainCommandRiskColor(route.overallRiskLabel);
  const hazardColor = getTerrainCommandRiskColor(route.nextHazard.riskLevel);
  const routeDistance = formatDistance(route.totalDistanceMiles, distanceUnit);
  const hazardDistance = formatDistance(route.nextHazard.distanceMiles, distanceUnit);

  return (
    <View style={styles.container} testID="terrain-risk-command-module">
      <View pointerEvents="none" style={styles.topoLayer}>
        <View style={[styles.topoLine, styles.topoLineA]} />
        <View style={[styles.topoLine, styles.topoLineB]} />
        <View style={[styles.topoLine, styles.topoLineC]} />
      </View>

      <View style={styles.headerRow}>
        <ECSShellTexture />
        <View style={[styles.iconChip, { borderColor: `${overallRiskColor}42` }]}>
          <Ionicons name={definition.icon as any} size={15} color={overallRiskColor} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: overallRiskColor }]} numberOfLines={1}>
            {definition.label}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {route.dataState === 'estimated-route' ? 'GPS altitude estimate' : 'Side-profile route analysis'}
          </Text>
        </View>
        <UnitToggle unit={distanceUnit} onChange={setDistanceUnit} />
      </View>

      <View style={styles.summaryRow}>
        <View
          accessible
          accessibilityLabel={`Overall terrain risk score ${route.overallRiskScore} out of 100. ${formatTerrainRiskLabel(route.overallRiskLabel)}.`}
          accessibilityRole="text"
          style={[styles.scoreBlock, { borderColor: `${overallRiskColor}42` }]}
        >
          <Text style={[styles.scoreValue, { color: overallRiskColor }]} numberOfLines={1}>
            {route.overallRiskScore} / 100
          </Text>
          <Text style={styles.scoreLabel} numberOfLines={1}>
            {formatTerrainRiskLabel(route.overallRiskLabel)}
          </Text>
        </View>
        <View style={styles.routeBlock}>
          <Text style={styles.routeName} numberOfLines={1}>
            {route.name}
          </Text>
          <Text style={styles.routeMeta} numberOfLines={1}>
            {routeDistance} total | {route.sourceLabel}
          </Text>
        </View>
      </View>

      <View style={styles.chartBlock}>
        <TerrainRiskSideProfile
          profile={route.profile}
          totalDistanceMiles={route.totalDistanceMiles}
          unit={distanceUnit}
        />
      </View>

      <View style={styles.factorRow}>
        {route.factors.map((factor) => (
          <RiskFactorCard key={factor.key} factor={factor} />
        ))}
      </View>

      <View style={styles.footerRow}>
        <View style={[styles.hazardCallout, { borderColor: `${hazardColor}4d` }]}>
          <View style={styles.hazardHeader}>
            <View style={[styles.hazardIcon, { backgroundColor: `${hazardColor}22` }]}>
              <Ionicons name="warning-outline" size={12} color={hazardColor} />
            </View>
            <Text style={[styles.hazardLabel, { color: hazardColor }]} numberOfLines={1}>
              Next Hazard
            </Text>
          </View>
          <Text style={styles.hazardText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>
            {route.nextHazard.label} in {hazardDistance}
          </Text>
          {route.nextHazard.actionLabel ? (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={route.nextHazard.actionLabel}
              accessibilityHint="Opens the next terrain hazard on the map when a map target is available"
              accessibilityState={{ disabled: !onViewHazardOnMap }}
              activeOpacity={0.76}
              disabled={!onViewHazardOnMap}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              onPress={() => onViewHazardOnMap?.(route.nextHazard)}
              style={[styles.hazardAction, !onViewHazardOnMap ? styles.hazardActionDisabled : null]}
            >
              <Text style={[styles.hazardActionText, !onViewHazardOnMap ? styles.hazardActionTextDisabled : null]} numberOfLines={1}>
                {route.nextHazard.actionLabel}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.legendPanel}>
          <Text style={styles.legendTitle} numberOfLines={1}>
            Risk Legend
          </Text>
          {RISK_LEGEND.map((item) => (
            <RiskLegendItem key={item.level} level={item.level} range={item.range} />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignSelf: 'stretch',
    minHeight: 0,
    paddingTop: 34,
    paddingHorizontal: 10,
    paddingBottom: 8,
    gap: 6,
    overflow: 'hidden',
    borderRadius: 13,
    backgroundColor: 'rgba(4,7,10,0.74)',
  },
  topoLayer: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.54,
  },
  topoLine: {
    position: 'absolute',
    height: 1,
    width: '74%',
    borderRadius: 1,
    backgroundColor: 'rgba(212,160,23,0.12)',
    transform: [{ rotate: '-9deg' }],
  },
  topoLineA: {
    left: -28,
    top: 58,
  },
  topoLineB: {
    right: -30,
    top: 118,
    opacity: 0.72,
  },
  topoLineC: {
    left: 36,
    bottom: 36,
    opacity: 0.48,
  },
  headerRow: {
    position: 'relative',
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 34,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.18)',
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 4,
    backgroundColor: 'rgba(8,12,15,0.84)',
  },
  iconChip: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 13,
    lineHeight: 15,
    fontWeight: '900',
    letterSpacing: 0,
  },
  subtitle: {
    marginTop: 1,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  unitToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.26)',
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  unitToggleButton: {
    minWidth: 38,
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unitToggleButtonSelected: {
    backgroundColor: 'rgba(212,160,23,0.18)',
  },
  unitToggleText: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 0,
  },
  unitToggleTextSelected: {
    color: TACTICAL.amber,
  },
  summaryRow: {
    position: 'relative',
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 7,
    minHeight: 34,
  },
  scoreBlock: {
    width: 88,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  scoreValue: {
    fontSize: 14,
    lineHeight: 16,
    fontWeight: '900',
    fontFamily: 'Courier',
    letterSpacing: 0,
  },
  scoreLabel: {
    marginTop: 1,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  routeBlock: {
    flex: 1,
    minWidth: 0,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    justifyContent: 'center',
    backgroundColor: 'rgba(2,5,7,0.28)',
  },
  routeName: {
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 0,
  },
  routeMeta: {
    marginTop: 2,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 0,
  },
  chartBlock: {
    position: 'relative',
    zIndex: 2,
    flex: 1.7,
    minHeight: 92,
  },
  emptyGuidancePanel: {
    position: 'relative',
    zIndex: 2,
    flex: 1,
    minHeight: 170,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    backgroundColor: 'rgba(2,5,7,0.62)',
  },
  emptyGuidanceTitle: {
    fontSize: 16,
    lineHeight: 19,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 0,
  },
  emptyGuidanceText: {
    marginTop: 8,
    maxWidth: 260,
    textAlign: 'center',
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  factorRow: {
    position: 'relative',
    zIndex: 2,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    minHeight: 42,
  },
  factorCard: {
    flex: 1,
    flexBasis: '18%',
    minWidth: 52,
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 5,
    paddingVertical: 5,
    justifyContent: 'center',
    backgroundColor: 'rgba(3,6,8,0.46)',
  },
  factorLabel: {
    fontSize: 7,
    lineHeight: 9,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  factorValue: {
    marginTop: 2,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '900',
    letterSpacing: 0,
  },
  factorDetail: {
    marginTop: 1,
    fontSize: 7,
    lineHeight: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 0,
  },
  footerRow: {
    position: 'relative',
    zIndex: 2,
    flexDirection: 'row',
    gap: 6,
    minHeight: 44,
  },
  hazardCallout: {
    flex: 1.5,
    minWidth: 0,
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: 'rgba(70,9,8,0.34)',
  },
  hazardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  hazardIcon: {
    width: 19,
    height: 19,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hazardLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  hazardText: {
    marginTop: 3,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 0,
  },
  hazardAction: {
    position: 'absolute',
    right: 6,
    top: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.26)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: 'rgba(0,0,0,0.24)',
  },
  hazardActionDisabled: {
    opacity: 0.62,
  },
  hazardActionText: {
    fontSize: 7,
    lineHeight: 9,
    fontWeight: '900',
    color: TACTICAL.amber,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  hazardActionTextDisabled: {
    color: TACTICAL.textMuted,
  },
  legendPanel: {
    flex: 0.92,
    minWidth: 92,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.13)',
    paddingHorizontal: 7,
    paddingVertical: 5,
    justifyContent: 'center',
    backgroundColor: 'rgba(2,5,7,0.32)',
  },
  legendTitle: {
    marginBottom: 2,
    fontSize: 7,
    lineHeight: 9,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 10,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendText: {
    flex: 1,
    minWidth: 0,
    fontSize: 7,
    lineHeight: 9,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 0,
  },
});
