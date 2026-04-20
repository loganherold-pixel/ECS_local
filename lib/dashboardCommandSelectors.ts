import type { MissionBrief } from './missionBriefEngine';
import type { ECSOrchestratorCandidate } from './ai/orchestratorTypes';
import type { ECSOrchestratorTargetView } from './ai/orchestratorSelectors';
import type { ECSOperationalState, ECSDegradedOperationsResult } from './ai/degradedOperationsTypes';
import type { ECSExpeditionPhase } from './ai/expeditionPhaseTypes';
import type { ECSLiveStatusMap } from './status/liveStatusTypes';
import { selectLiveStatusForSource } from './status/liveStatusResolver';

export type DashboardCommandTone =
  | 'ready'
  | 'info'
  | 'active'
  | 'warning'
  | 'unavailable';

export type DashboardCommandBadgeTone = 'primary' | 'warning' | 'muted';

export type DashboardCommandBadge = {
  id: string;
  label: string;
  tone: DashboardCommandBadgeTone;
};

export type DashboardCommandState = {
  primary: ECSOrchestratorCandidate | null;
  secondary: ECSOrchestratorCandidate[];
  passive: ECSOrchestratorCandidate[];
  phaseLabel: string | null;
  operationalLabel: string | null;
  compactSummary: string;
  metaLabel: string | null;
  metaSignal: string | null;
  banner: {
    title: string;
    detail: string | null;
    badge: string;
    icon: string;
    tone: DashboardCommandTone;
    live: boolean;
  } | null;
  surface: {
    visible: boolean;
    eyebrow: string | null;
    title: string;
    detail: string | null;
    badges: DashboardCommandBadge[];
    secondary: string[];
  };
};

type SelectDashboardCommandStateArgs = {
  dashboardView: ECSOrchestratorTargetView;
  missionBrief: MissionBrief | null;
  summaryLine: string;
  compactLine: string;
  topSignalTitle: string | null;
  expeditionPhase: ECSExpeditionPhase | null | undefined;
  expeditionPhaseLabel: string | null | undefined;
  operationalState: ECSOperationalState | null | undefined;
  operationalSummary: string | null | undefined;
  operations: ECSDegradedOperationsResult | null | undefined;
  liveStatus: ECSLiveStatusMap | null | undefined;
  isCompact: boolean;
  hasLiveGps: boolean;
  isOnline: boolean;
};

function cleanText(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(/\s+/g, ' ')
    .replace(/\bECS\s+AI\b/g, 'ECS')
    .replace(/\bAI\b/g, 'ECS')
    .trim();
}

function capitalizeWords(value: string): string {
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function priorityTone(level: string | null | undefined): DashboardCommandTone {
  switch (level) {
    case 'critical':
    case 'warning':
      return 'warning';
    case 'caution':
    case 'advisory':
      return 'active';
    case 'informational':
      return 'info';
    default:
      return 'ready';
  }
}

function priorityBadge(level: string | null | undefined): string {
  switch (level) {
    case 'critical':
      return 'CRITICAL';
    case 'warning':
      return 'WARNING';
    case 'caution':
      return 'CAUTION';
    case 'advisory':
      return 'ADVISORY';
    default:
      return 'ECS';
  }
}

function priorityIcon(level: string | null | undefined): string {
  switch (level) {
    case 'critical':
    case 'warning':
      return 'warning-outline';
    case 'caution':
      return 'alert-circle-outline';
    case 'advisory':
      return 'compass-outline';
    default:
      return 'sparkles-outline';
  }
}

function operationalTone(state: ECSOperationalState | null | undefined): DashboardCommandTone {
  switch (state) {
    case 'unavailable':
      return 'unavailable';
    case 'limited':
    case 'degraded':
      return 'warning';
    case 'offline_capable':
      return 'active';
    default:
      return 'ready';
  }
}

function operationalBadge(operations: ECSDegradedOperationsResult | null | undefined): string {
  const label = cleanText(operations?.shortLabel);
  return label ? label.toUpperCase() : 'ECS READY';
}

function confidenceBadge(
  candidate: ECSOrchestratorCandidate | null,
  trustConfidence: string | null | undefined,
): DashboardCommandBadge | null {
  const label = cleanText(trustConfidence) || cleanText(candidate?.confidence?.label);
  if (!label) return null;

  return {
    id: 'confidence',
    label,
    tone:
      trustConfidence
        ? trustConfidence.startsWith('Low')
          ? 'warning'
          : trustConfidence.startsWith('High')
            ? 'primary'
            : 'muted'
        : candidate?.confidence?.level === 'limited' || candidate?.confidence?.level === 'low'
        ? 'warning'
        : candidate?.confidence?.level === 'high'
          ? 'primary'
          : 'muted',
  };
}

function secondaryTitles(candidates: ECSOrchestratorCandidate[], limit: number): string[] {
  return candidates
    .slice(0, limit)
    .map((candidate) => cleanText(candidate.title || candidate.summary))
    .filter(Boolean);
}

function buildEyebrow(args: {
  phaseLabel: string | null;
  operationalLabel: string | null;
  primary: ECSOrchestratorCandidate | null;
}): string | null {
  if (args.phaseLabel && args.operationalLabel) {
    return `${args.phaseLabel.toUpperCase()} • ${args.operationalLabel.toUpperCase()}`;
  }
  if (args.phaseLabel) return args.phaseLabel.toUpperCase();
  if (args.operationalLabel) return args.operationalLabel.toUpperCase();
  if (args.primary?.priority?.level) return priorityBadge(args.primary.priority.level);
  return null;
}

export function selectDashboardCommandState(
  args: SelectDashboardCommandStateArgs,
): DashboardCommandState {
  const {
    dashboardView,
    missionBrief,
    summaryLine,
    compactLine,
    topSignalTitle,
    expeditionPhase,
    expeditionPhaseLabel,
    operationalState,
    operationalSummary,
    operations,
    liveStatus,
    isCompact,
    hasLiveGps,
    isOnline,
  } = args;

  const primary = dashboardView.primary ?? null;
  const secondary = dashboardView.secondary ?? [];
  const passive = dashboardView.passive ?? [];
  const phaseLabel =
    cleanText(expeditionPhaseLabel) ||
    (expeditionPhase && expeditionPhase !== 'unknown' ? capitalizeWords(expeditionPhase) : null);
  const operationalLabel =
    cleanText(operations?.shortLabel) ||
    (operationalState && operationalState !== 'fully_operational'
      ? capitalizeWords(operationalState)
      : null);

  const primaryTitle =
    cleanText(primary?.title) ||
    cleanText(topSignalTitle) ||
    cleanText(missionBrief?.headline) ||
    cleanText(summaryLine) ||
    'Dashboard ready';

  const primaryStatus = selectLiveStatusForSource(liveStatus, primary?.source);
  const primaryTrust = primary?.trust ?? missionBrief?.trust ?? null;

  const primaryDetail =
    cleanText(primaryTrust?.explanationSummary) ||
    cleanText(primary?.explanation?.text) ||
    cleanText(primary?.summary) ||
    cleanText(primaryStatus?.shortReason) ||
    cleanText(missionBrief?.operatorNote) ||
    cleanText(operationalSummary) ||
    cleanText(missionBrief?.summary) ||
    cleanText(compactLine) ||
    null;

  const tone = primary
    ? priorityTone(primary.priority?.level)
    : operationalTone(operations?.state ?? operationalState);

  const banner = primary || operations || missionBrief
    ? {
        title: primaryTitle,
        detail:
          cleanText(primaryTrust?.explanationSummary) ||
          cleanText(primary?.summary) ||
          cleanText(primary?.explanation?.text) ||
          cleanText(primaryStatus?.shortReason) ||
          cleanText(operations?.summary) ||
          cleanText(compactLine) ||
          null,
        badge: primary ? priorityBadge(primary.priority?.level) : operationalBadge(operations),
        icon: primary ? priorityIcon(primary.priority?.level) : priorityIcon(null),
        tone,
        live: primaryTrust?.mode === 'ECS Live' || (hasLiveGps && isOnline),
      }
    : null;

  const badges: DashboardCommandBadge[] = [];
  if (primaryTrust?.mode) {
    badges.push({
      id: 'trust_mode',
      label: primaryTrust.mode,
      tone:
        primaryTrust.mode === 'ECS Live'
          ? 'primary'
          : primaryTrust.mode === 'ECS Limited' || primaryTrust.mode === 'ECS Syncing Context'
            ? 'warning'
            : 'muted',
    });
  } else if (primaryStatus?.label) {
    badges.push({
      id: 'live_status',
      label: primaryStatus.label,
      tone:
        primaryStatus.status === 'live'
          ? 'primary'
          : primaryStatus.status === 'degraded' || primaryStatus.status === 'unavailable'
            ? 'warning'
            : 'muted',
    });
  }
  if (primaryTrust?.sourceBasis) {
    badges.push({
      id: 'trust_source',
      label: primaryTrust.sourceBasis,
      tone:
        primaryTrust.sourceBasis === 'Live'
          ? 'primary'
          : primaryTrust.sourceBasis === 'Inferred'
            ? 'warning'
            : 'muted',
    });
  }
  const confidence = confidenceBadge(primary, primaryTrust?.confidence);
  if (confidence) {
    badges.push(confidence);
  }
  if (operationalLabel) {
    badges.push({
      id: 'operations',
      label: operationalLabel,
      tone:
        operations?.state === 'degraded' ||
        operations?.state === 'limited' ||
        operations?.state === 'unavailable'
          ? 'warning'
          : 'muted',
    });
  }
  if (primary?.priority?.title) {
    badges.push({
      id: 'priority',
      label: cleanText(primary.priority.title),
      tone:
        primary.priority.level === 'warning' || primary.priority.level === 'critical'
          ? 'warning'
          : 'primary',
    });
  }

  const secondaryLabels = secondaryTitles(secondary, isCompact ? 1 : 2);

  return {
    primary,
    secondary,
    passive,
    phaseLabel,
    operationalLabel,
    compactSummary:
      cleanText(primary?.summary) ||
      cleanText(compactLine) ||
      cleanText(summaryLine) ||
      cleanText(missionBrief?.compactLabel) ||
      primaryTitle,
    metaLabel: cleanText(missionBrief?.compactLabel) || phaseLabel || operationalLabel,
    metaSignal: cleanText(primary?.title) || cleanText(topSignalTitle) || null,
    banner,
    surface: {
      visible: Boolean(primary || secondaryLabels.length || operationalLabel),
      eyebrow: buildEyebrow({
        phaseLabel,
        operationalLabel,
        primary,
      }),
      title: primaryTitle,
      detail: isCompact
        ? cleanText(primary?.summary) || cleanText(compactLine) || null
        : primaryDetail,
      badges,
      secondary: secondaryLabels,
    },
  };
}
