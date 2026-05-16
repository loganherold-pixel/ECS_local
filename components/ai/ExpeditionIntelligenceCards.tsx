import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ECS } from '../../lib/theme';
import { ECSBadge } from '../ECSStatus';
import { ECSChip } from '../ECSChip';
import { SafeIcon as Ionicons } from '../SafeIcon';
import type { ExpeditionAgentResponse } from '../../lib/ai/expeditionIntelligenceTypes';
import type { ExpeditionRouteConfidenceResult } from '../../lib/ai/expeditionRouteConfidenceEngine';
import {
  buildExpeditionIntelligenceCardModel,
  type ExpeditionIntelligenceCardModel,
  type ExpeditionIntelligenceCardTone,
  type ExpeditionIntelligenceListItem,
} from '../../lib/ai/expeditionIntelligenceUiModels';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export type ExpeditionIntelligenceCardProps = {
  response?: ExpeditionAgentResponse | null;
  routeConfidence?: ExpeditionRouteConfidenceResult | null;
  title?: string;
  eyebrow?: string;
  loading?: boolean;
  error?: string | null;
  emptySummary?: string;
  maxItems?: number;
};

function badgeTone(tone: ExpeditionIntelligenceCardTone): React.ComponentProps<typeof ECSBadge>['tone'] {
  switch (tone) {
    case 'ready':
      return 'ready';
    case 'active':
      return 'active';
    case 'warning':
      return 'warning';
    case 'unavailable':
      return 'unavailable';
    default:
      return 'info';
  }
}

function iconForTone(tone: ExpeditionIntelligenceCardTone): IconName {
  switch (tone) {
    case 'ready':
      return 'checkmark-circle-outline' as IconName;
    case 'active':
      return 'radio-outline' as IconName;
    case 'warning':
      return 'warning-outline' as IconName;
    case 'unavailable':
      return 'alert-circle-outline' as IconName;
    default:
      return 'information-circle-outline' as IconName;
  }
}

function CardShell({
  model,
  children,
}: {
  model: ExpeditionIntelligenceCardModel;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleBlock}>
          <Text style={styles.eyebrow}>{model.eyebrow}</Text>
          <Text style={styles.title}>{model.title}</Text>
        </View>
        <ECSBadge
          label={model.state === 'ready' ? model.confidenceLabel : model.state.toUpperCase()}
          tone={badgeTone(model.tone)}
          icon={iconForTone(model.tone)}
          compact
        />
      </View>
      {children}
    </View>
  );
}

function IntelligenceEmptyState({ model }: { model: ExpeditionIntelligenceCardModel }) {
  return (
    <CardShell model={model}>
      <Text style={styles.summary}>{model.summary}</Text>
      {model.errorMessage ? <Text style={styles.errorText}>{model.errorMessage}</Text> : null}
      {model.uncertainty.length ? (
        <View style={styles.inlineNotice}>
          <Ionicons name="information-circle-outline" size={14} color={ECS.muted} />
          <Text style={styles.noticeText}>{model.uncertainty[0]}</Text>
        </View>
      ) : null}
    </CardShell>
  );
}

function ListSection({
  title,
  icon,
  items,
  emptyLabel,
  maxItems = 4,
}: {
  title: string;
  icon: IconName;
  items: ExpeditionIntelligenceListItem[];
  emptyLabel: string;
  maxItems?: number;
}) {
  const visible = items.slice(0, maxItems);
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon} size={14} color={ECS.accent} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {visible.length ? (
        <View style={styles.itemStack}>
          {visible.map((item) => (
            <View key={item.id} style={styles.itemRow}>
              <View style={[styles.itemDot, item.tone === 'warning' && styles.itemDotWarning, item.tone === 'unavailable' && styles.itemDotCritical]} />
              <Text style={styles.itemText}>{item.label}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.emptyText}>{emptyLabel}</Text>
      )}
    </View>
  );
}

function IntelligenceSummary({
  model,
  maxItems = 4,
}: {
  model: ExpeditionIntelligenceCardModel;
  maxItems?: number;
}) {
  return (
    <CardShell model={model}>
      <Text style={styles.summary}>{model.summary}</Text>
      <View style={styles.metaRow}>
        <ECSChip label={`${model.evidenceCount} evidence`} compact disabled />
        <ECSChip label={model.uncertainty.length ? `${model.uncertainty.length} uncertain` : 'uncertainty clear'} compact disabled />
      </View>
      {model.uncertainty.length ? (
        <View style={styles.inlineNotice}>
          <Ionicons name="help-circle-outline" size={14} color={ECS.muted} />
          <Text style={styles.noticeText}>{model.uncertainty[0]}</Text>
        </View>
      ) : null}
      <ListSection
        title="Recommended Next Actions"
        icon={'arrow-forward-circle-outline' as IconName}
        items={model.nextActions}
        emptyLabel="No ECS action is available yet."
        maxItems={maxItems}
      />
    </CardShell>
  );
}

function modelFromProps(props: ExpeditionIntelligenceCardProps, fallbackTitle: string, fallbackEyebrow: string) {
  return buildExpeditionIntelligenceCardModel({
    response: props.response,
    routeConfidence: props.routeConfidence,
    title: props.title ?? fallbackTitle,
    eyebrow: props.eyebrow ?? fallbackEyebrow,
    loading: props.loading,
    error: props.error,
    emptySummary: props.emptySummary,
  });
}

export function ExpeditionBriefCard(props: ExpeditionIntelligenceCardProps) {
  const model = modelFromProps(props, 'Expedition Brief', 'ECS Intelligence');
  if (model.state !== 'ready') return <IntelligenceEmptyState model={model} />;
  return <IntelligenceSummary model={model} maxItems={props.maxItems} />;
}

export function RouteConfidenceCard(props: ExpeditionIntelligenceCardProps) {
  const model = modelFromProps(props, 'Route Confidence', 'ECS Route Risk');
  if (model.state !== 'ready') return <IntelligenceEmptyState model={model} />;
  return (
    <CardShell model={model}>
      <Text style={styles.summary}>{model.summary}</Text>
      <ListSection
        title="Risk Factors"
        icon={'trail-sign-outline' as IconName}
        items={model.risks}
        emptyLabel="No route risk factors reported by ECS output."
        maxItems={props.maxItems}
      />
      <ListSection
        title="Missing Data"
        icon={'search-outline' as IconName}
        items={model.missingData}
        emptyLabel="No missing route data flagged."
        maxItems={props.maxItems}
      />
    </CardShell>
  );
}

export function RiskFactorsList({ model, maxItems = 4 }: { model: ExpeditionIntelligenceCardModel; maxItems?: number }) {
  return (
    <ListSection
      title="Risk Factors"
      icon={'warning-outline' as IconName}
      items={model.risks}
      emptyLabel="Risk factors not flagged from available data."
      maxItems={maxItems}
    />
  );
}

export function MissingDataList({ model, maxItems = 4 }: { model: ExpeditionIntelligenceCardModel; maxItems?: number }) {
  return (
    <ListSection
      title="Missing Data"
      icon={'help-circle-outline' as IconName}
      items={model.missingData}
      emptyLabel="No missing data is flagged."
      maxItems={maxItems}
    />
  );
}

export function RecommendedNextActions({ model, maxItems = 4 }: { model: ExpeditionIntelligenceCardModel; maxItems?: number }) {
  return (
    <ListSection
      title="Recommended Next Actions"
      icon={'arrow-forward-circle-outline' as IconName}
      items={model.nextActions}
      emptyLabel="No recommended actions are available."
      maxItems={maxItems}
    />
  );
}

export function CampLogisticsSuggestionsCard(props: ExpeditionIntelligenceCardProps) {
  const model = modelFromProps(props, 'Camp / Logistics Suggestions', 'ECS Margin');
  if (model.state !== 'ready') return <IntelligenceEmptyState model={model} />;
  return (
    <CardShell model={model}>
      <Text style={styles.summary}>{model.summary}</Text>
      <ListSection
        title="Suggestions"
        icon={'bonfire-outline' as IconName}
        items={model.suggestions}
        emptyLabel="No camp or logistics suggestions are available."
        maxItems={props.maxItems}
      />
      <MissingDataList model={model} maxItems={props.maxItems} />
    </CardShell>
  );
}

export function DebriefSummaryCard(props: ExpeditionIntelligenceCardProps) {
  const model = modelFromProps(props, 'Debrief Summary', 'ECS Debrief');
  if (model.state !== 'ready') return <IntelligenceEmptyState model={model} />;
  return (
    <CardShell model={model}>
      <Text style={styles.summary}>{model.summary}</Text>
      <ListSection
        title="Lessons / Follow Up"
        icon={'document-text-outline' as IconName}
        items={model.suggestions.length ? model.suggestions : model.nextActions}
        emptyLabel="No debrief follow-up is available."
        maxItems={props.maxItems}
      />
    </CardShell>
  );
}

export function CommunityReportQAIndicators(props: ExpeditionIntelligenceCardProps) {
  const model = modelFromProps(props, 'Community Report QA', 'ECS Learn');
  if (model.state !== 'ready') return <IntelligenceEmptyState model={model} />;
  return (
    <CardShell model={model}>
      <Text style={styles.summary}>{model.summary}</Text>
      <RiskFactorsList model={model} maxItems={props.maxItems} />
      <RecommendedNextActions model={model} maxItems={props.maxItems} />
    </CardShell>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgPanel,
    borderRadius: ECS.radius,
    padding: 14,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  eyebrow: {
    color: ECS.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  title: {
    color: ECS.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },
  summary: {
    color: ECS.text,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  errorText: {
    color: ECS.warning,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  inlineNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 1,
    borderColor: ECS.strokeSoft,
    backgroundColor: ECS.bgElev,
    borderRadius: ECS.radius,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  noticeText: {
    flex: 1,
    color: ECS.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  section: {
    gap: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  sectionTitle: {
    color: ECS.accent,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  itemStack: {
    gap: 7,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  itemDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
    backgroundColor: ECS.accent,
  },
  itemDotWarning: {
    backgroundColor: ECS.warning,
  },
  itemDotCritical: {
    backgroundColor: ECS.danger,
  },
  itemText: {
    flex: 1,
    color: ECS.text,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  emptyText: {
    color: ECS.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
});
