import { buildReadinessExplanationPayload } from '../ai/readinessExplanationGuardrails';
import type {
  ExpeditionReadinessAssessment,
  ExpeditionReadinessFreshnessRecord,
  ExpeditionReadinessStatus,
} from '../readiness/expeditionReadinessTypes';

export type CommandBriefDecisionPresentation = {
  status: ExpeditionReadinessStatus;
  label: 'GO' | 'CAUTION' | 'HOLD';
  meaning: string;
};

export type CommandBriefDepartureAuditPresentation = {
  paragraphs: [string] | [string, string];
  sourceState: 'current' | 'limited' | 'unavailable';
};

export type CommandBriefPresentation = {
  decision: CommandBriefDecisionPresentation;
  departureAudit: CommandBriefDepartureAuditPresentation;
};

const DECISION_PRESENTATION: Record<ExpeditionReadinessStatus, CommandBriefDecisionPresentation> = {
  ready: {
    status: 'ready',
    label: 'GO',
    meaning: 'GO means the current deterministic readiness assessment has no departure blockers. It is not a guarantee of safety, and the source snapshot should remain current before departure.',
  },
  caution: {
    status: 'caution',
    label: 'CAUTION',
    meaning: 'CAUTION means departure is not blocked, but visible warnings, missing inputs, or limited-confidence conditions need review before proceeding.',
  },
  hold: {
    status: 'hold',
    label: 'HOLD',
    meaning: 'HOLD means one or more deterministic blockers require resolution or explicit review before departure.',
  },
};

function uniqueText(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach((value) => {
    const normalized = String(value ?? '').trim().replace(/\s+/g, ' ');
    if (!normalized) return;
    const key = normalized.toLocaleLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(normalized);
  });
  return result;
}

function joinNatural(values: string[]): string {
  if (values.length <= 1) return values[0] ?? '';
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(', ')}, and ${values[values.length - 1]}`;
}

function asClause(value: string): string {
  return value.trim().replace(/[.!?]+$/g, '');
}

function recordIsLimited(record: ExpeditionReadinessFreshnessRecord): boolean {
  return record.isMissing
    || record.isStale
    || record.isInferred
    || record.source === 'cached'
    || record.source === 'manual'
    || record.source === 'mock'
    || record.source === 'demo'
    || record.source === 'unknown';
}

function buildSourceQualification(assessment: ExpeditionReadinessAssessment): {
  copy: string;
  sourceState: CommandBriefDepartureAuditPresentation['sourceState'];
} {
  const records = Object.values(assessment.sourceFreshness);
  const missing = records.filter((record) => record.isMissing).map((record) => record.label);
  const stale = records.filter((record) => record.isStale).map((record) => record.label);
  const inferred = records.filter((record) => record.isInferred).map((record) => record.label);
  const nonLive = records
    .filter((record) => recordIsLimited(record) && !record.isMissing && !record.isStale && !record.isInferred)
    .map((record) => `${record.label} (${record.source})`);
  const limitations = [
    missing.length > 0 ? `missing: ${joinNatural(uniqueText(missing).slice(0, 4))}` : null,
    stale.length > 0 ? `stale: ${joinNatural(uniqueText(stale).slice(0, 4))}` : null,
    inferred.length > 0 ? `ECS-inferred: ${joinNatural(uniqueText(inferred).slice(0, 4))}` : null,
    nonLive.length > 0 ? `non-live: ${joinNatural(uniqueText(nonLive).slice(0, 4))}` : null,
  ].filter((value): value is string => Boolean(value));

  if (limitations.length === 0) {
    return {
      copy: 'Available readiness sources are current for this assessment snapshot; refresh them if conditions change.',
      sourceState: 'current',
    };
  }

  return {
    copy: `Confidence is limited by ${limitations.join('; ')}. Unknown data remains unknown until a validated source is available.`,
    sourceState: 'limited',
  };
}

function buildReasonParagraph(assessment: ExpeditionReadinessAssessment): string {
  const explanation = buildReadinessExplanationPayload(assessment);
  const statusLead = explanation.status === 'ready'
    ? 'GO'
    : explanation.status === 'caution'
      ? 'CAUTION'
      : 'HOLD';
  const issues = uniqueText([
    ...explanation.blockers.map((issue) => issue.detail),
    ...explanation.warnings.map((issue) => issue.detail),
    ...explanation.topFactors
      .filter((factor) => factor.impact !== 'positive' && factor.impact !== 'neutral')
      .map((factor) => factor.detail),
  ]);
  const reasonCopy = issues.length > 0
    ? joinNatural(issues.slice(0, 4).map(asClause))
    : 'no deterministic departure blockers were found in the available readiness inputs';
  const additionalCount = Math.max(0, issues.length - 4);
  const additionalCopy = additionalCount > 0
    ? ` ${additionalCount} additional contributing item${additionalCount === 1 ? '' : 's'} remain in the shared packet.`
    : '';
  return `${statusLead} is the current deterministic decision because ${reasonCopy}.${additionalCopy}`;
}

function buildImprovementParagraph(assessment: ExpeditionReadinessAssessment): {
  copy: string;
  sourceState: CommandBriefDepartureAuditPresentation['sourceState'];
} {
  const explanation = buildReadinessExplanationPayload(assessment);
  const incompleteAudit = assessment.departureAudit
    .filter((item) => item.status !== 'complete')
    .flatMap((item) => [item.summary, item.actionLabel]);
  const improvements = uniqueText([
    ...explanation.recommendedActions,
    ...incompleteAudit,
  ]).slice(0, 4);
  const source = buildSourceQualification(assessment);
  const actionCopy = improvements.length > 0
    ? `To improve this decision, review these priorities: ${joinNatural(improvements.map(asClause))}.`
    : 'To preserve this decision, keep the trip inputs and source timestamps current as conditions change.';
  return {
    copy: `${actionCopy} ${source.copy}`,
    sourceState: source.sourceState,
  };
}

export function buildCommandBriefPresentation(
  assessment: ExpeditionReadinessAssessment | null,
): CommandBriefPresentation {
  if (!assessment) {
    return {
      decision: DECISION_PRESENTATION.hold,
      departureAudit: {
        paragraphs: [
          'ECS Intelligence cannot explain a departure decision until the deterministic readiness assessment has enough route and trip context. Add or select the missing trip inputs, then reassess before departure.',
        ],
        sourceState: 'unavailable',
      },
    };
  }

  const improvement = buildImprovementParagraph(assessment);
  return {
    decision: DECISION_PRESENTATION[assessment.status],
    departureAudit: {
      paragraphs: [buildReasonParagraph(assessment), improvement.copy],
      sourceState: improvement.sourceState,
    },
  };
}
