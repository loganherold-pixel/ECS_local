import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
} from 'react-native';

import TacticalPopupShell from '../TacticalPopupShell';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { GOLD_RAIL, TACTICAL } from '../../lib/theme';
import { useExpeditionFullBodyPopupProps } from './expeditionPopupLayout';
import type {
  AssessmentCategory,
  ExpeditionAssessment,
} from '../../lib/expedition/operationalAssessmentTypes';
import type { ExpeditionAssessmentNarrative } from '../../lib/ai/expeditionAssessmentNarrative';
import ExpeditionAssessmentDetailView, {
  EXPEDITION_ASSESSMENT_CATEGORY_LABELS,
  type ExpeditionAssessmentDetailAction,
} from './ExpeditionAssessmentDetailView';

type ExpeditionAssessmentDetailModalProps = {
  visible: boolean;
  category: AssessmentCategory | null;
  assessment?: ExpeditionAssessment;
  narrative?: ExpeditionAssessmentNarrative;
  loading?: boolean;
  usingMockData?: boolean;
  offline?: boolean;
  stale?: boolean;
  onRefresh?: () => void;
  onOpenIncidentRecovery?: () => void;
  onRelatedAction?: (action: ExpeditionAssessmentDetailAction) => void;
  onClose: () => void;
};

export default function ExpeditionAssessmentDetailModal({
  visible,
  category,
  assessment,
  narrative,
  loading,
  usingMockData,
  offline,
  stale,
  onRefresh,
  onOpenIncidentRecovery,
  onRelatedAction,
  onClose,
}: ExpeditionAssessmentDetailModalProps) {
  const resolvedTitle = category ? EXPEDITION_ASSESSMENT_CATEGORY_LABELS[category] : 'Assessment';
  const fullBodyPopupProps = useExpeditionFullBodyPopupProps();

  return (
    <TacticalPopupShell
      visible={visible}
      onClose={onClose}
      title={resolvedTitle}
      icon="analytics-outline"
      eyebrow="EXPEDITION ASSESSMENT"
      subtitle={narrative?.plainLanguageSummary ?? assessment?.summary ?? 'Operational assessment loading.'}
      overlayClass="workflow"
      {...fullBodyPopupProps}
      contentContainerStyle={styles.content}
      footer={
        <TouchableOpacity style={styles.closeButton} activeOpacity={0.78} onPress={onClose}>
          <Ionicons name="close-outline" size={15} color={TACTICAL.text} />
          <Text style={styles.closeButtonText}>Close</Text>
        </TouchableOpacity>
      }
    >
      <ExpeditionAssessmentDetailView
        category={category}
        assessment={assessment}
        narrative={narrative}
        loading={loading}
        usingMockData={usingMockData}
        offline={offline}
        stale={stale}
        onRefresh={onRefresh}
        onOpenIncidentRecovery={onOpenIncidentRecovery}
        onRelatedAction={onRelatedAction}
      />
    </TacticalPopupShell>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 14,
    paddingBottom: 12,
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
