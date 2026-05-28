import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import TacticalPopupShell from '../TacticalPopupShell';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { GOLD_RAIL, TACTICAL } from '../../lib/theme';
import { useExpeditionFullBodyPopupProps } from './expeditionPopupLayout';
import type { IncidentContext, RecoveryIncidentAgentOutput } from '../../lib/types/incidentRecovery';

type ECSAssessmentModalProps = {
  visible: boolean;
  onClose: () => void;
  incident?: IncidentContext | null;
};

function getOutput(incident?: IncidentContext | null): RecoveryIncidentAgentOutput | null {
  return incident?.recoveryAssessment?.structuredOutput ?? null;
}

function ListBlock({
  title,
  items,
  icon,
}: {
  title: string;
  items: string[];
  icon: React.ComponentProps<typeof Ionicons>['name'];
}) {
  if (!items.length) return null;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon} size={14} color={TACTICAL.amber} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {items.map((item) => (
        <Text key={item} style={styles.listItem}>- {item}</Text>
      ))}
    </View>
  );
}

export default function ECSAssessmentModal({
  visible,
  onClose,
  incident,
}: ECSAssessmentModalProps) {
  const output = getOutput(incident);
  const fullBodyPopupProps = useExpeditionFullBodyPopupProps();
  const footer = (
    <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.78}>
      <Text style={styles.closeButtonText}>Close</Text>
    </TouchableOpacity>
  );

  return (
    <TacticalPopupShell
      visible={visible}
      onClose={onClose}
      title="ECS Assessment"
      icon="scan-outline"
      eyebrow="RECOVERY & INCIDENT AGENT"
      subtitle="Structured stabilization assessment. Not a replacement for emergency services or recovery professionals."
      overlayClass="workflow"
      {...fullBodyPopupProps}
      footer={footer}
    >
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!incident ? (
          <View style={styles.section}>
            <Text style={styles.emptyTitle}>No active incident</Text>
            <Text style={styles.emptyText}>
              Report an incident or run a safety checklist first so ECS can assess real incident context.
            </Text>
          </View>
        ) : output ? (
          <>
            <View style={styles.hero}>
              <View style={styles.heroCopy}>
                <Text style={styles.riskLabel}>Risk {output.riskLevel.toUpperCase()}</Text>
                <Text style={styles.summary}>{output.summary}</Text>
                <Text style={styles.explanation}>{output.userFacingExplanation}</Text>
              </View>
              <View style={styles.confidenceBadge}>
                <Text style={styles.confidenceLabel}>Confidence</Text>
                <Text style={styles.confidenceValue}>{output.confidence.toUpperCase()}</Text>
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="shield-checkmark-outline" size={14} color={TACTICAL.amber} />
                <Text style={styles.sectionTitle}>Immediate safety assessment</Text>
              </View>
              <Text style={styles.bodyText}>{output.immediateSafetyAssessment}</Text>
            </View>

            <ListBlock title="Next actions" icon="arrow-forward-circle-outline" items={output.nextActions} />
            <ListBlock title="Recommendations" icon="checkmark-circle-outline" items={output.recommendations} />
            <ListBlock title="Risks" icon="alert-circle-outline" items={output.risks} />
            <ListBlock title="Missing data" icon="help-circle-outline" items={output.missingData.map((item) => item.replace(/_/g, ' '))} />
            <ListBlock title="Do not do" icon="close-circle-outline" items={output.doNotDo} />
            <ListBlock title="Verification steps" icon="list-outline" items={output.verificationSteps} />
            <ListBlock title="Debrief hooks" icon="document-text-outline" items={output.debriefHooks} />
          </>
        ) : (
          <View style={styles.section}>
            <Text style={styles.emptyTitle}>Assessment pending</Text>
            <Text style={styles.emptyText}>
              Tap ECS Assessment from the Incident & Recovery container again to generate the latest structured assessment.
            </Text>
          </View>
        )}
      </ScrollView>
    </TacticalPopupShell>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 12,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  hero: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GOLD_RAIL.section,
    backgroundColor: 'rgba(17,20,24,0.78)',
    padding: 12,
    flexDirection: 'row',
    gap: 10,
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  riskLabel: {
    color: TACTICAL.amber,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  summary: {
    color: TACTICAL.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900',
  },
  explanation: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
  confidenceBadge: {
    width: 92,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(212,160,23,0.09)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  confidenceLabel: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  confidenceValue: {
    color: TACTICAL.amber,
    fontSize: 11,
    fontWeight: '900',
  },
  section: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(11,14,18,0.62)',
    padding: 12,
    gap: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  sectionTitle: {
    color: TACTICAL.amber,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  bodyText: {
    color: TACTICAL.text,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
  },
  listItem: {
    color: TACTICAL.text,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
  emptyTitle: {
    color: TACTICAL.text,
    fontSize: 13,
    fontWeight: '900',
  },
  emptyText: {
    color: TACTICAL.textMuted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  closeButton: {
    minHeight: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(17,20,24,0.72)',
  },
  closeButtonText: {
    color: TACTICAL.text,
    fontSize: 11,
    fontWeight: '900',
  },
});
