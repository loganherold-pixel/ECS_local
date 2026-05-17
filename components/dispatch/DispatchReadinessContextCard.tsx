import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import ECSShellTexture from '../ECSShellTexture';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { ReadinessDecisionBadge } from '../readiness';
import { useDispatchReadinessContext } from '../../lib/readiness';
import { ECS_POPUP_SURFACE_DARK, GOLD_RAIL, TACTICAL } from '../../lib/theme';

function formatCoordinate(value: number): string {
  return value.toFixed(5);
}

export default function DispatchReadinessContextCard() {
  const context = useDispatchReadinessContext();
  const coordinateText = context.currentCoordinates
    ? `${formatCoordinate(context.currentCoordinates.latitude)}, ${formatCoordinate(context.currentCoordinates.longitude)}`
    : 'Coordinates unavailable';
  const primaryRisk = context.topRiskFactors[0];

  return (
    <View style={styles.card}>
      <ECSShellTexture />
      <View style={styles.header}>
        <View style={styles.titleBlock}>
          <Text style={styles.eyebrow}>Expedition Readiness Context</Text>
          <Text style={styles.title} numberOfLines={1}>
            {context.activeRouteLabel ?? context.activeRouteId ?? 'No active route attached'}
          </Text>
        </View>
        <ReadinessDecisionBadge status={context.status} score={context.hasActiveAssessment ? context.score : null} compact />
      </View>

      <View style={styles.factGrid}>
        <View style={styles.fact}>
          <Text style={styles.factLabel}>Coordinates</Text>
          <Text style={[styles.factValue, context.currentCoordinates ? styles.coordinateValue : null]} numberOfLines={1}>
            {coordinateText}
          </Text>
        </View>
        <View style={styles.fact}>
          <Text style={styles.factLabel}>Packet</Text>
          <Text style={styles.factValue} numberOfLines={1}>
            {context.emergencyPacketStatus}
          </Text>
        </View>
        <View style={styles.factWide}>
          <Text style={styles.factLabel}>Recovery</Text>
          <Text style={styles.factValue} numberOfLines={2}>
            {context.recoverySummary}
          </Text>
        </View>
        <View style={styles.factWide}>
          <Text style={styles.factLabel}>Comms</Text>
          <Text style={styles.factValue} numberOfLines={2}>
            {context.communicationsSummary}
          </Text>
        </View>
      </View>

      <View style={styles.riskLine}>
        <Ionicons name="alert-circle-outline" size={14} color={TACTICAL.amber} />
        <Text style={styles.riskText} numberOfLines={2}>
          {primaryRisk
            ? `${primaryRisk.label}: ${primaryRisk.summary}`
            : 'No readiness assessment attached yet. Dispatch remains local/team coordination and does not contact emergency services.'}
        </Text>
      </View>
      {context.isUsingDemoData ? (
        <Text style={styles.demoNotice} numberOfLines={1}>
          Demo/mock readiness context; do not present as live truth.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: GOLD_RAIL.section,
    borderRadius: 9,
    backgroundColor: ECS_POPUP_SURFACE_DARK.shellBg,
    overflow: 'hidden',
    padding: 9,
    gap: 8,
  },
  header: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    color: TACTICAL.amber,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: {
    color: TACTICAL.text,
    fontSize: 12,
    fontWeight: '900',
    marginTop: 2,
  },
  factGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  fact: {
    flexGrow: 1,
    flexBasis: '46%',
    minHeight: 42,
    borderWidth: 1,
    borderColor: ECS_POPUP_SURFACE_DARK.controlBorder,
    borderRadius: 8,
    backgroundColor: ECS_POPUP_SURFACE_DARK.controlBg,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  factWide: {
    flexGrow: 1,
    flexBasis: '100%',
    minHeight: 44,
    borderWidth: 1,
    borderColor: ECS_POPUP_SURFACE_DARK.controlBorder,
    borderRadius: 8,
    backgroundColor: ECS_POPUP_SURFACE_DARK.controlBg,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  factLabel: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  factValue: {
    color: TACTICAL.text,
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 15,
    marginTop: 3,
  },
  coordinateValue: {
    fontWeight: '900',
  },
  riskLine: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    borderTopWidth: 1,
    borderTopColor: ECS_POPUP_SURFACE_DARK.divider,
    paddingTop: 8,
  },
  riskText: {
    flex: 1,
    color: TACTICAL.textMuted,
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 14,
  },
  demoNotice: {
    color: TACTICAL.amber,
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
});
