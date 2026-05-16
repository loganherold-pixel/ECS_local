import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import TacticalPopupShell from '../TacticalPopupShell';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { GOLD_RAIL, TACTICAL } from '../../lib/theme';
import { EXPEDITION_FULL_BODY_POPUP_PROPS } from './expeditionPopupLayout';

export type ExpeditionPlaceholderTitle =
  | 'Overview'
  | 'Route'
  | 'Convoy'
  | 'Camp'
  | 'Logistics'
  | 'Vehicles'
  | 'Report Incident'
  | 'Safety Checklist'
  | 'ECS Assessment'
  | 'Communication Packet'
  | 'Timeline'
  | 'Resolve / Debrief'
  | 'Expedition Summary';

type ExpeditionPlaceholderModalProps = {
  visible: boolean;
  title: ExpeditionPlaceholderTitle | null;
  onClose: () => void;
};

const PURPOSE_COPY: Record<ExpeditionPlaceholderTitle, string> = {
  Overview: 'Expedition status, readiness, and route-at-a-glance details will appear here.',
  Route: 'Route guidance, progress, and waypoint context will appear here.',
  Convoy: 'Team member status, spacing, and convoy coordination will appear here.',
  Camp: 'Route camp details, staging notes, and camp readiness will appear here.',
  Logistics: 'Supply, fuel, water, and field logistics details will appear here.',
  Vehicles: 'Vehicle readiness, health, and expedition support details will appear here.',
  'Report Incident': 'Incident intake workflow opens here.',
  'Safety Checklist': 'Stabilization checklist workflow opens here.',
  'ECS Assessment': 'Recovery and incident assessment workflow opens here.',
  'Communication Packet': 'Emergency, convoy, and recovery communication packet workflow opens here.',
  Timeline: 'Incident timeline and log workflow opens here.',
  'Resolve / Debrief': 'Resolution and debrief workflow opens here.',
  'Expedition Summary': 'Printable expedition summary preparation will appear here after route completion.',
};

export default function ExpeditionPlaceholderModal({
  visible,
  title,
  onClose,
}: ExpeditionPlaceholderModalProps) {
  const resolvedTitle = title ?? 'Overview';

  return (
    <TacticalPopupShell
      visible={visible}
      onClose={onClose}
      title={resolvedTitle}
      icon="compass-outline"
      eyebrow="EXPEDITION FRAMEWORK"
      subtitle={PURPOSE_COPY[resolvedTitle]}
      overlayClass="workflow"
      {...EXPEDITION_FULL_BODY_POPUP_PROPS}
      contentContainerStyle={styles.content}
      footer={
        <TouchableOpacity style={styles.closeButton} activeOpacity={0.78} onPress={onClose}>
          <Ionicons name="close-outline" size={15} color={TACTICAL.text} />
          <Text style={styles.closeButtonText}>Close</Text>
        </TouchableOpacity>
      }
    >
      <View style={styles.placeholderCard}>
        <View style={styles.iconWrap}>
          <Ionicons name="construct-outline" size={18} color={TACTICAL.amber} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>{resolvedTitle}</Text>
          <Text style={styles.body}>Framework placeholder.</Text>
          <Text style={styles.note}>Live ECS data pipeline pending.</Text>
        </View>
      </View>
    </TacticalPopupShell>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  placeholderCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GOLD_RAIL.section,
    backgroundColor: 'rgba(17,20,24,0.94)',
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    gap: 11,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: 'rgba(212,160,23,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  title: {
    color: TACTICAL.text,
    fontSize: 14,
    fontWeight: '900',
  },
  body: {
    color: TACTICAL.text,
    fontSize: 11,
    fontWeight: '700',
  },
  note: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  closeButton: {
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: 'rgba(212,160,23,0.10)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  closeButtonText: {
    color: TACTICAL.text,
    fontSize: 11,
    fontWeight: '900',
  },
});
