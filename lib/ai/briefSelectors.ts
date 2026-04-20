import type { MissionBrief } from '../missionBriefEngine';
import { formatConfidenceCompactLine } from './confidenceEngine';
import type { ECSOperationalState, ECSDegradedOperationsResult } from './degradedOperationsTypes';
import type { ECSExpeditionPhase } from './expeditionPhaseTypes';
import type { ECSOrchestratorTargetView } from './orchestratorSelectors';
import type { ECSOrchestratorCandidate } from './orchestratorTypes';
import type { ECSLiveStatusMap } from '../status/liveStatusTypes';
import { formatTrustCompactLine } from './trustContract';
import { selectLiveStatusForSource } from '../status/liveStatusResolver';

export type BriefCommandTone = 'green' | 'yellow' | 'red';

export type BriefCommandState = {
  primary: ECSOrchestratorCandidate | null;
  secondary: ECSOrchestratorCandidate[];
  phaseLabel: string | null;
  operationalLabel: string | null;
  postureLine: string | null;
  headline: string;
  summary: string;
  confidenceLine: string | null;
  commandIntent: string;
  nextAction: string;
  supportLine: string | null;
  limitationLine: string | null;
  topSignal: string | null;
  statusLabel: string;
  statusTone: BriefCommandTone;
};

type SelectBriefCommandStateArgs = {
  briefView: ECSOrchestratorTargetView;
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

function uniqueText(values: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const results: string[] = [];

  for (const value of values) {
    const normalized = cleanText(value);
    if (!normalized) continue;

    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    results.push(normalized);
  }

  return results;
}

function firstText(values: (string | null | undefined)[], fallback: string): string {
  return uniqueText(values)[0] ?? fallback;
}

function firstDifferent(
  values: (string | null | undefined)[],
  excluded: (string | null | undefined)[],
): string | null {
  const excludedKeys = new Set(uniqueText(excluded).map((item) => item.toLowerCase()));
  return uniqueText(values).find((item) => !excludedKeys.has(item.toLowerCase())) ?? null;
}

function priorityBadge(level: string | null | undefined): string | null {
  switch (level) {
    case 'critical':
      return 'CRITICAL';
    case 'warning':
      return 'WARNING';
    case 'caution':
      return 'CAUTION';
    case 'advisory':
      return 'ADVISORY';
    case 'informational':
      return 'INFO';
    default:
      return null;
  }
}

function resolveStatusTone(args: {
  primary: ECSOrchestratorCandidate | null;
  operations: ECSDegradedOperationsResult | null | undefined;
  missionBrief: MissionBrief | null;
}): BriefCommandTone {
  if (
    args.primary?.priority?.level === 'critical' ||
    args.primary?.priority?.level === 'warning' ||
    args.operations?.state === 'unavailable' ||
    args.missionBrief?.status === 'red'
  ) {
    return 'red';
  }

  if (
    args.primary?.priority?.level === 'caution' ||
    args.primary?.priority?.level === 'advisory' ||
    args.operations?.state === 'degraded' ||
    args.operations?.state === 'limited' ||
    args.operations?.state === 'offline_capable' ||
    args.missionBrief?.status === 'yellow'
  ) {
    return 'yellow';
  }

  return 'green';
}

function resolveStatusLabel(args: {
  primary: ECSOrchestratorCandidate | null;
  missionBrief: MissionBrief | null;
  operations: ECSDegradedOperationsResult | null | undefined;
  phaseLabel: string | null;
}): string {
  const compactLabel = cleanText(args.missionBrief?.compactLabel);
  return (
    priorityBadge(args.primary?.priority?.level) ||
    (compactLabel && compactLabel.length <= 20 ? compactLabel.toUpperCase() : null) ||
    cleanText(args.operations?.shortLabel).toUpperCase() ||
    (args.phaseLabel ? args.phaseLabel.toUpperCase() : null) ||
    'ECS READY'
  );
}

export function selectBriefCommandState(
  args: SelectBriefCommandStateArgs,
): BriefCommandState | null {
  const {
    briefView,
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
  } = args;

  const primary = briefView.primary ?? null;
  const secondary = briefView.secondary ?? [];
  const primaryStatus = selectLiveStatusForSource(liveStatus, primary?.source);

  const phaseLabel =
    cleanText(expeditionPhaseLabel) ||
    cleanText(missionBrief?.phase?.label) ||
    (expeditionPhase && expeditionPhase !== 'unknown' ? capitalizeWords(expeditionPhase) : null);
  const operationalLabel =
    cleanText(operations?.shortLabel) ||
    cleanText(missionBrief?.operations?.shortLabel) ||
    (operationalState && operationalState !== 'fully_operational'
      ? capitalizeWords(operationalState)
      : null);

  const postureLine = phaseLabel && operationalLabel
    ? `${phaseLabel.toUpperCase()} • ${operationalLabel.toUpperCase()}`
    : phaseLabel
      ? phaseLabel.toUpperCase()
      : operationalLabel
        ? operationalLabel.toUpperCase()
        : null;

  const headline = firstText(
    [
      primary?.title,
      missionBrief?.headline,
      topSignalTitle,
      summaryLine,
      phaseLabel ? `${phaseLabel} command posture` : null,
    ],
    'ECS brief standing by',
  );

  const summary = firstDifferent(
    [
      primary?.summary,
      missionBrief?.summary,
      primaryStatus?.shortReason,
      operationalSummary,
      primary?.explanation?.text,
      missionBrief?.explanation?.text,
      compactLine,
    ],
    [headline],
  ) ?? 'ECS command summary is standing by for stronger live context.';

  const confidenceLine =
    formatTrustCompactLine(primary?.trust ?? missionBrief?.trust ?? null) ||
    formatConfidenceCompactLine(primary?.confidence ?? missionBrief?.confidence ?? null);

  const lowConfidenceLine =
    primary?.confidence?.level === 'limited' ||
    primary?.confidence?.level === 'low' ||
    primary?.confidence?.level === 'unknown' ||
    missionBrief?.confidence?.level === 'limited' ||
    missionBrief?.confidence?.level === 'low' ||
    missionBrief?.confidence?.level === 'unknown'
      ? firstDifferent(
          [
            primaryStatus?.shortReason,
            primary?.confidence?.shortReason,
            missionBrief?.confidence?.shortReason,
          ],
          [headline, summary],
        )
      : null;

  const limitationLine =
    (operations?.state && operations.state !== 'fully_operational'
      ? firstDifferent(
          [
            operations.summary,
            operations.operatorActions?.[0] ?? null,
            operationalSummary,
            primaryStatus?.status === 'degraded' || primaryStatus?.status === 'unavailable'
              ? primaryStatus?.shortReason
              : null,
          ],
          [headline, summary],
        )
      : null) ||
    (
      primaryStatus?.status === 'degraded' ||
      primaryStatus?.status === 'offline_capable' ||
      primaryStatus?.status === 'waiting' ||
      primaryStatus?.status === 'unavailable'
        ? firstDifferent(
            [
              primaryStatus.shortReason,
              primaryStatus.label,
            ],
            [headline, summary],
          )
        : null
    ) ||
    lowConfidenceLine;

  const supportLine = firstDifferent(
    [
      primary?.explanation?.text,
      primaryStatus?.status === 'estimated' ? primaryStatus?.shortReason : null,
      secondary[0]?.summary,
      secondary[0]?.explanation?.text,
      missionBrief?.explanation?.text,
      missionBrief?.operatorNote,
    ],
    [headline, summary, limitationLine],
  );

  const commandIntent = firstDifferent(
    [
      missionBrief?.commandIntent,
      missionBrief?.recommendations?.[0] ?? null,
      primary?.summary,
      primary?.explanation?.text,
      secondary[0]?.title,
      operations?.operatorActions?.[0] ?? null,
      primaryStatus?.status === 'waiting' ? primaryStatus?.shortReason : null,
    ],
    [headline, summary, supportLine, limitationLine],
  ) ?? 'Maintain readiness and monitor current ECS command conditions.';

  const nextAction = firstDifferent(
    [
      missionBrief?.primaryTask?.title,
      primary?.priority?.shortReason,
      secondary[0]?.title,
      missionBrief?.priorityMessage,
      missionBrief?.recommendations?.[0] ?? null,
      missionBrief?.operatorNote,
      operations?.operatorActions?.[0] ?? null,
    ],
    [headline, summary, commandIntent, supportLine, limitationLine],
  ) ?? commandIntent;

  const topSignal = firstDifferent(
    [
      limitationLine,
      supportLine,
      primary?.title,
      secondary[0]?.title,
      missionBrief?.priorityMessage,
      topSignalTitle,
    ],
    [headline, summary, commandIntent, nextAction],
  );

  return {
    primary,
    secondary,
    phaseLabel,
    operationalLabel,
    postureLine,
    headline,
    summary,
    confidenceLine,
    commandIntent,
    nextAction,
    supportLine,
    limitationLine,
    topSignal,
    statusLabel: resolveStatusLabel({ primary, missionBrief, operations, phaseLabel }),
    statusTone: resolveStatusTone({ primary, operations, missionBrief }),
  };
}
