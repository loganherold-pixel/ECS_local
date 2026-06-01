import type { ECSOrchestratorTargetView } from '../ai/orchestratorSelectors';
import type { ECSOperationalState } from '../ai/degradedOperationsTypes';
import type { ECSExpeditionPhase } from '../ai/expeditionPhaseTypes';
import type { ECSOrchestratorCandidate } from '../ai/orchestratorTypes';
import type { ECSPriorityLevel } from '../ai/priorityTypes';
import { isLowValueTelemetryDegradedSummary } from '../ai/degradedOperationsEngine';
import type { ECSLiveStatusMap } from '../status/liveStatusTypes';

export type AlertCommandGroup = {
  id: string;
  level: ECSPriorityLevel;
  title: string;
  summary: string;
  confidenceLabel: string | null;
  count: number;
  items: ECSOrchestratorCandidate[];
  representative: ECSOrchestratorCandidate | null;
};

export type AlertCommandState = {
  lead: AlertCommandGroup | null;
  secondary: AlertCommandGroup[];
  sections: Record<ECSPriorityLevel, AlertCommandGroup[]>;
  operationalLabel: string | null;
  operationalSummary: string | null;
  phaseLabel: string | null;
  totalElevatedCount: number;
};

type SelectAlertCommandStateArgs = {
  alertView: ECSOrchestratorTargetView;
  operationalState: ECSOperationalState | null | undefined;
  operationalSummary: string | null | undefined;
  expeditionPhase: ECSExpeditionPhase | null | undefined;
  expeditionPhaseLabel: string | null | undefined;
  liveStatus: ECSLiveStatusMap | null | undefined;
  isOnline: boolean;
  hasActiveExpedition: boolean;
};

const EMPTY_SECTIONS: Record<ECSPriorityLevel, AlertCommandGroup[]> = {
  critical: [],
  warning: [],
  caution: [],
  advisory: [],
  informational: [],
};

function severityWeight(level: ECSPriorityLevel | null | undefined): number {
  switch (level) {
    case 'critical':
      return 5;
    case 'warning':
      return 4;
    case 'caution':
      return 3;
    case 'advisory':
      return 2;
    case 'informational':
    default:
      return 1;
  }
}

function cleanText(value: string | null | undefined): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function candidateLevel(candidate: ECSOrchestratorCandidate): ECSPriorityLevel {
  return candidate.priority?.level ?? 'informational';
}

function candidateGroupKey(candidate: ECSOrchestratorCandidate): string {
  return cleanText(candidate.groupKey) ||
    cleanText(candidate.priority?.domain) ||
    cleanText(candidate.priority?.sourceKey) ||
    candidate.source;
}

function compareCandidates(a: ECSOrchestratorCandidate, b: ECSOrchestratorCandidate): number {
  const severityDelta = severityWeight(candidateLevel(b)) - severityWeight(candidateLevel(a));
  if (severityDelta !== 0) return severityDelta;

  const rankDelta = (b.priority?.rank ?? 0) - (a.priority?.rank ?? 0);
  if (rankDelta !== 0) return rankDelta;

  return (b.timestamp ?? 0) - (a.timestamp ?? 0);
}

function buildOperationalFallback(args: SelectAlertCommandStateArgs): AlertCommandGroup | null {
  if (!args.operationalState || args.operationalState === 'fully_operational') return null;
  if (
    args.operationalState === 'degraded' &&
    isLowValueTelemetryDegradedSummary(args.operationalSummary)
  ) {
    return null;
  }

  let level: ECSPriorityLevel = 'informational';
  switch (args.operationalState) {
    case 'unavailable':
      level = 'warning';
      break;
    case 'limited':
      level = args.hasActiveExpedition ? 'warning' : 'caution';
      break;
    case 'degraded':
      level = args.hasActiveExpedition ? 'caution' : 'advisory';
      break;
    case 'offline_capable':
      level = 'advisory';
      break;
  }

  const title =
    args.operationalState === 'offline_capable'
      ? 'Offline-capable field posture'
      : args.operationalState === 'limited'
        ? 'Limited field guidance'
        : args.operationalState === 'unavailable'
          ? 'Operational capability unavailable'
          : 'Degraded field operations';

  return {
    id: `operations:${args.operationalState}`,
    level,
    title,
    summary:
      cleanText(args.liveStatus?.overall.shortReason) ||
      cleanText(args.operationalSummary) ||
      (args.isOnline
        ? 'Some ECS systems are degraded and safety interpretation is softened.'
        : 'Offline field operation remains available, but live intelligence is reduced.'),
    confidenceLabel: null,
    count: 1,
    items: [],
    representative: null,
  };
}

export function selectAlertCommandState(
  args: SelectAlertCommandStateArgs,
): AlertCommandState {
  const candidates = [
    args.alertView.primary,
    ...args.alertView.secondary,
    ...args.alertView.passive,
  ].filter((candidate): candidate is ECSOrchestratorCandidate => !!candidate);

  const grouped = new Map<string, AlertCommandGroup>();

  for (const candidate of candidates) {
    const level = candidateLevel(candidate);
    const key = `${level}:${candidateGroupKey(candidate)}`;
    const existing = grouped.get(key);

    if (!existing) {
      grouped.set(key, {
        id: key,
        level,
        title: cleanText(candidate.title) || 'Dispatch advisory',
        summary:
          cleanText(candidate.explanation?.text) ||
          cleanText(candidate.summary) ||
          candidate.priority?.shortReason ||
          'Operator attention advised.',
        confidenceLabel: cleanText(candidate.confidence?.label) || null,
        count: 1,
        items: [candidate],
        representative: candidate,
      });
      continue;
    }

    existing.count += 1;
    existing.items.push(candidate);
    existing.items.sort(compareCandidates);
    existing.representative = existing.items[0] ?? existing.representative;
    existing.title = cleanText(existing.representative?.title) || existing.title;
    existing.summary =
      cleanText(existing.representative?.explanation?.text) ||
      cleanText(existing.representative?.summary) ||
      existing.representative?.priority?.shortReason ||
      existing.summary;
    existing.confidenceLabel =
      cleanText(existing.representative?.confidence?.label) || existing.confidenceLabel;
  }

  const groupedList = Array.from(grouped.values()).sort((a, b) => {
    const severityDelta = severityWeight(b.level) - severityWeight(a.level);
    if (severityDelta !== 0) return severityDelta;
    return compareCandidates(a.representative ?? a.items[0], b.representative ?? b.items[0]);
  });

  const sections: Record<ECSPriorityLevel, AlertCommandGroup[]> = {
    critical: groupedList.filter((item) => item.level === 'critical'),
    warning: groupedList.filter((item) => item.level === 'warning'),
    caution: groupedList.filter((item) => item.level === 'caution'),
    advisory: groupedList.filter((item) => item.level === 'advisory'),
    informational: groupedList.filter((item) => item.level === 'informational'),
  };

  let lead: AlertCommandGroup =
    sections.critical[0] ??
    sections.warning[0] ??
    sections.caution[0] ??
    buildOperationalFallback(args);

  const orderedSecondary = groupedList.filter((item) => item.id !== lead?.id);

  return {
    lead,
    secondary: orderedSecondary.slice(0, 4),
    sections: Object.keys(EMPTY_SECTIONS).reduce((acc, key) => {
      acc[key as ECSPriorityLevel] = sections[key as ECSPriorityLevel];
      return acc;
    }, { ...EMPTY_SECTIONS }),
    operationalLabel:
      args.operationalState && args.operationalState !== 'fully_operational'
        ? args.operationalState.replace(/_/g, ' ').toUpperCase()
        : null,
    operationalSummary: cleanText(args.operationalSummary) || null,
    phaseLabel:
      cleanText(args.expeditionPhaseLabel) ||
      (args.expeditionPhase ? args.expeditionPhase.replace(/_/g, ' ').toUpperCase() : null),
    totalElevatedCount:
      sections.critical.length + sections.warning.length + sections.caution.length,
  };
}

export default selectAlertCommandState;
