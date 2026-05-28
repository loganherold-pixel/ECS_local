import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import TacticalPopupShell from '../TacticalPopupShell';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { GOLD_RAIL, TACTICAL } from '../../lib/theme';
import type { ExpeditionRecord } from '../../lib/expeditionStateStore';
import {
  buildCompletedExpeditionDebrief,
  exportExpeditionDebriefPdf,
  type ExpeditionDebrief,
} from '../../lib/expedition/expeditionDebrief';
import { useExpeditionFullBodyPopupProps } from './expeditionPopupLayout';

type ExpeditionDebriefModalProps = {
  visible: boolean;
  completedRecord?: ExpeditionRecord | null;
  routeLabel?: string | null;
  expeditionId?: string | null;
  onClose: () => void;
};

export default function ExpeditionDebriefModal({
  visible,
  completedRecord,
  routeLabel,
  expeditionId,
  onClose,
}: ExpeditionDebriefModalProps) {
  const [debrief, setDebrief] = useState<ExpeditionDebrief | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fullBodyPopupProps = useExpeditionFullBodyPopupProps();

  useEffect(() => {
    if (!visible) return;
    setError(null);
    setDebrief(buildCompletedExpeditionDebrief({ completedRecord, routeLabel, expeditionId }));
  }, [completedRecord, expeditionId, routeLabel, visible]);

  const footer = useMemo(() => (
    <View style={styles.footer}>
      <TouchableOpacity style={[styles.footerButton, styles.secondaryButton]} onPress={onClose} activeOpacity={0.78}>
        <Text style={styles.secondaryButtonText}>Close</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.footerButton, styles.primaryButton, (!debrief || exporting) && styles.disabledButton]}
        disabled={!debrief || exporting}
        activeOpacity={0.78}
        onPress={async () => {
          if (!debrief || exporting) return;
          setExporting(true);
          setError(null);
          const result = await exportExpeditionDebriefPdf(debrief);
          setExporting(false);
          if (!result.success) {
            const message = result.error || 'PDF export failed.';
            setError(message);
            Alert.alert('Expedition Summary', message);
          }
        }}
      >
        <Ionicons name="download-outline" size={14} color={TACTICAL.bg} />
        <Text style={styles.primaryButtonText}>{exporting ? 'Exporting...' : 'Export PDF'}</Text>
      </TouchableOpacity>
    </View>
  ), [debrief, exporting, onClose]);

  return (
    <TacticalPopupShell
      visible={visible}
      onClose={onClose}
      title="Expedition Summary"
      icon="document-text-outline"
      eyebrow="COMPLETED ROUTE DEBRIEF"
      subtitle={debrief?.routeName ?? 'Generate a completed-route debrief from saved ECS data.'}
      overlayClass="workflow"
      {...fullBodyPopupProps}
      footer={footer}
    >
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!debrief ? (
          <View style={styles.emptyState}>
            <Ionicons name="alert-circle-outline" size={18} color={TACTICAL.textMuted} />
            <Text style={styles.emptyTitle}>No completed route found</Text>
            <Text style={styles.emptyText}>
              Complete an expedition or route before exporting an Expedition Summary.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.headerCard}>
              <Text style={styles.kicker}>ECS DEBRIEF</Text>
              <Text style={styles.title}>{debrief.expeditionName}</Text>
              <Text style={styles.subtitle}>{debrief.routeName}</Text>
            </View>

            <Section title="Route Overview" items={debrief.overview} />
            <Section title="Key Points" items={debrief.keyPoints.length ? debrief.keyPoints : ['No key points available.']} />
            {debrief.sections.map((section) => (
              <Section key={section.title} title={section.title} items={section.items} />
            ))}
            <Section title="What Worked" items={debrief.intelligence.whatWorked} />
            <Section title="Could Improve" items={debrief.intelligence.couldImprove} />
            <Section title="Possible Issues / Likely Causes" items={debrief.intelligence.possibleIssues} />
            <Section title="Next Expedition Recommendations" items={debrief.intelligence.recommendations} />
            <Section title="Data Notes" items={debrief.dataNotes} muted />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </>
        )}
      </ScrollView>
    </TacticalPopupShell>
  );
}

function Section({ title, items, muted = false }: { title: string; items: string[]; muted?: boolean }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.itemList}>
        {items.map((item, index) => (
          <View key={`${title}-${index}`} style={styles.itemRow}>
            <View style={[styles.bullet, muted && styles.bulletMuted]} />
            <Text style={[styles.itemText, muted && styles.itemTextMuted]}>{item}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  headerCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: GOLD_RAIL.section,
    backgroundColor: 'rgba(212,160,23,0.08)',
    padding: 14,
    gap: 4,
  },
  kicker: {
    color: TACTICAL.amber,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.8,
  },
  title: {
    color: TACTICAL.text,
    fontSize: 18,
    fontWeight: '900',
  },
  subtitle: {
    color: TACTICAL.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  section: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: 'rgba(17,20,24,0.78)',
    padding: 12,
    gap: 9,
  },
  sectionTitle: {
    color: TACTICAL.amber,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  itemList: {
    gap: 8,
  },
  itemRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  bullet: {
    width: 5,
    height: 5,
    borderRadius: 999,
    marginTop: 6,
    backgroundColor: TACTICAL.amber,
  },
  bulletMuted: {
    backgroundColor: TACTICAL.textMuted,
  },
  itemText: {
    flex: 1,
    color: TACTICAL.text,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  itemTextMuted: {
    color: TACTICAL.textMuted,
  },
  emptyState: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyTitle: {
    color: TACTICAL.text,
    fontSize: 14,
    fontWeight: '900',
  },
  emptyText: {
    color: TACTICAL.textMuted,
    fontSize: 12,
    textAlign: 'center',
    maxWidth: 420,
    lineHeight: 18,
  },
  errorText: {
    color: TACTICAL.danger,
    fontSize: 12,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
  },
  footerButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  secondaryButtonText: {
    color: TACTICAL.text,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  primaryButton: {
    backgroundColor: TACTICAL.amber,
  },
  disabledButton: {
    opacity: 0.52,
  },
  primaryButtonText: {
    color: TACTICAL.bg,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
