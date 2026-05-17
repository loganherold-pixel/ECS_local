import type {
  AssessmentCategory,
  AssessmentConfidence,
  AssessmentStatus,
  ExpeditionAssessment,
} from '../expedition/operationalAssessmentTypes';

export type ExpeditionAssessmentNarrative = {
  category: AssessmentCategory;
  status: AssessmentStatus;
  statusLine: string;
  plainLanguageSummary: string;
  whyEcsThinksThis: string[];
  whatToWatch: string[];
  recommendedAction: string;
  toImproveStatus: string[];
  confidence: AssessmentConfidence;
  confidenceExplanation: string;
  dataLimitations: string[];
  source: 'template' | 'ai';
};

export type ExpeditionAssessmentNarrativeProviderInput = {
  assessment: ExpeditionAssessment;
  prompt: string;
  groundingJson: string;
};

type RuntimeNarrativeOutput = Omit<Partial<ExpeditionAssessmentNarrative>, 'toImproveStatus' | 'whatToWatch'> & {
  summary?: unknown;
  toImproveStatus?: unknown;
  whatToWatch?: unknown;
  confidenceExplanation?: unknown;
};

export type ExpeditionAssessmentNarrativeProvider = {
  generateNarrative(
    input: ExpeditionAssessmentNarrativeProviderInput,
  ): Promise<RuntimeNarrativeOutput | string>;
};

export const ECS_ASSESSMENT_NARRATIVE_PROMPT = `You are ECS, an Expedition Command System assistant.

Your job is to explain the operational meaning of an active overland expedition assessment.

You must use only the provided assessment data. Do not invent facts, locations, people, hazards, weather, vehicle issues, fuel levels, water levels, ETAs, or sensor readings.

You are not deciding the safety status. The deterministic ECS assessment engine has already assigned the status. Your job is to explain it clearly.

Tone:
- calm
- concise
- operational
- confidence-building
- practical
- not fear-based
- not overly casual

Required output:
Return valid JSON with these fields:
{
  "statusLine": string,
  "summary": string,
  "whyEcsThinksThis": string[],
  "whatToWatch": string,
  "recommendedAction": string,
  "toImproveStatus": string,
  "confidenceExplanation": string,
  "dataLimitations": string[]
}

Rules:
1. Do not claim something is safe unless the data supports it.
2. Do not say "all systems normal" if any category is watch, caution, critical, unknown, stale, or missing.
3. If data is stale, explicitly mention that confidence is reduced.
4. If data is missing, explicitly mention that the assessment is limited.
5. If the status is unknown, focus on what data is needed to improve confidence.
6. If escalationRecommended is true, include the escalation reason.
7. Keep recommendedAction to one primary action.
8. Keep whatToWatch focused on the most likely near-term issue.
9. Avoid medical, legal, or emergency-service claims.
10. Do not replace human judgment.

Assessment input:
{{ASSESSMENT_JSON}}`;

const STATUS_LABELS: Record<AssessmentStatus, string> = {
  normal: 'Normal',
  watch: 'Watch',
  caution: 'Caution',
  critical: 'Critical',
  unknown: 'Unknown',
};

const SENSITIVE_FACT_TERMS = [
  'fuel',
  'water',
  'food',
  'eta',
  'arrival',
  'campsite',
  'camp',
  'vehicle',
  'tire',
  'battery',
  'hazard',
  'weather',
  'convoy',
  'member',
  'person',
  'people',
  'location',
  'route',
  'safe',
  'clear',
  'injury',
  'injured',
  'gps',
  'coordinate',
  'mile',
  'gallon',
  'liter',
  'liters',
  'hours',
  'minutes',
];

function compact(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function asList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function firstSentence(value: string, fallback: string): string {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const match = trimmed.match(/^(.+?[.!?])(\s|$)/);
  return (match?.[1] ?? trimmed).trim();
}

function buildStatusLine(assessment: ExpeditionAssessment): string {
  return `${assessment.title}: ${STATUS_LABELS[assessment.status]}. Confidence ${assessment.confidence}.`;
}

function buildDataLimitations(assessment: ExpeditionAssessment): string[] {
  const limitations = [
    ...assessment.missingDataWarnings,
    ...assessment.staleDataWarnings,
  ];

  if (assessment.confidence === 'low' && limitations.length === 0) {
    limitations.push('Assessment confidence is low based on available inputs.');
  }

  return limitations.length > 0 ? limitations : ['No current data limitations flagged by ECS.'];
}

function buildConfidenceExplanation(assessment: ExpeditionAssessment): string {
  if (assessment.staleDataWarnings.length > 0) {
    return `Confidence is ${assessment.confidence} because one or more assessment inputs are stale.`;
  }
  if (assessment.missingDataWarnings.length > 0) {
    return `Confidence is ${assessment.confidence} because required assessment inputs are missing.`;
  }
  return `Confidence is ${assessment.confidence} based on the available assessment inputs.`;
}

export function buildTemplateExpeditionAssessmentNarrative(
  assessment: ExpeditionAssessment,
): ExpeditionAssessmentNarrative {
  return {
    category: assessment.category,
    status: assessment.status,
    statusLine: buildStatusLine(assessment),
    plainLanguageSummary: firstSentence(assessment.summary, `${assessment.title} is ${assessment.status}.`),
    whyEcsThinksThis: assessment.why.length ? assessment.why : ['ECS used the available operational assessment inputs.'],
    whatToWatch: assessment.whatToWatch.length ? assessment.whatToWatch : ['Watch for changes in the underlying data.'],
    recommendedAction: assessment.recommendedAction,
    toImproveStatus: assessment.toImproveStatus.length
      ? assessment.toImproveStatus
      : ['Refresh missing or stale operational data.'],
    confidence: assessment.confidence,
    confidenceExplanation: buildConfidenceExplanation(assessment),
    dataLimitations: buildDataLimitations(assessment),
    source: 'template',
  };
}

function safeJsonParse(value: string): RuntimeNarrativeOutput | null {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function serializeGrounding(assessment: ExpeditionAssessment): string {
  return JSON.stringify({
    category: assessment.category,
    status: assessment.status,
    title: assessment.title,
    summary: assessment.summary,
    why: assessment.why,
    whatToWatch: assessment.whatToWatch,
    recommendedAction: assessment.recommendedAction,
    toImproveStatus: assessment.toImproveStatus,
    confidence: assessment.confidence,
    dataUsed: assessment.dataUsed,
    staleDataWarnings: assessment.staleDataWarnings,
    missingDataWarnings: assessment.missingDataWarnings,
    escalationRecommended: assessment.escalationRecommended,
    escalationReason: assessment.escalationReason,
  });
}

export function buildExpeditionAssessmentNarrativePrompt(assessment: ExpeditionAssessment): string {
  return ECS_ASSESSMENT_NARRATIVE_PROMPT.replace('{{ASSESSMENT_JSON}}', serializeGrounding(assessment));
}

function groundingCorpus(assessment: ExpeditionAssessment): string {
  return compact([
    assessment.category,
    assessment.status,
    assessment.title,
    assessment.summary,
    assessment.recommendedAction,
    assessment.confidence,
    assessment.escalationReason ?? '',
    ...assessment.why,
    ...assessment.whatToWatch,
    ...assessment.toImproveStatus,
    ...assessment.staleDataWarnings,
    ...assessment.missingDataWarnings,
    ...assessment.dataUsed.flatMap((item) => [
      item.label,
      item.value == null ? 'unknown' : String(item.value),
      item.source,
      item.updatedAt ?? '',
      item.notes ?? '',
    ]),
  ].join(' '));
}

function unsupportedSensitiveSentences(
  narrative: Partial<ExpeditionAssessmentNarrative>,
  assessment: ExpeditionAssessment,
): string[] {
  const corpus = groundingCorpus(assessment);
  const text = compact([
    narrative.statusLine,
    narrative.plainLanguageSummary,
    narrative.recommendedAction,
    narrative.confidenceExplanation,
    ...(narrative.whyEcsThinksThis ?? []),
    ...(narrative.whatToWatch ?? []),
    ...(narrative.toImproveStatus ?? []),
    ...(narrative.dataLimitations ?? []),
  ].filter(Boolean).join(' '));

  if (!text) return ['Narrative is empty.'];

  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);

  return sentences.filter((sentence) => {
    const hasSensitiveTerm = SENSITIVE_FACT_TERMS.some((term) =>
      sentence.includes(term),
    );
    const hasUnsupportedNumber = /\b\d+(\.\d+)?\s?(%|mi|mile|miles|gal|gallon|gallons|l|liter|liters|hour|hours|minute|minutes|v|volts)\b/.test(sentence)
      && !corpus.includes(sentence.match(/\b\d+(\.\d+)?\b/)?.[0] ?? '');
    const claimsSafety = /\b(safe|clear|no hazard|all accounted|all vehicles ready|fuel is sufficient|water is sufficient)\b/.test(sentence)
      && !corpus.includes(sentence);

    return (hasSensitiveTerm && hasUnsupportedNumber) || claimsSafety;
  });
}

function normalizeProviderNarrative(
  value: RuntimeNarrativeOutput | string,
): Partial<ExpeditionAssessmentNarrative> | null {
  const parsed = typeof value === 'string' ? safeJsonParse(value) : value;
  if (!parsed || typeof parsed !== 'object') return null;
  const runtimeParsed = parsed as RuntimeNarrativeOutput;
  const summary =
    typeof runtimeParsed.summary === 'string'
      ? runtimeParsed.summary.trim()
      : typeof runtimeParsed.plainLanguageSummary === 'string'
        ? runtimeParsed.plainLanguageSummary.trim()
        : undefined;

  return {
    statusLine: typeof runtimeParsed.statusLine === 'string' ? runtimeParsed.statusLine.trim() : undefined,
    plainLanguageSummary: summary,
    whyEcsThinksThis: asList(runtimeParsed.whyEcsThinksThis),
    whatToWatch: asList(runtimeParsed.whatToWatch),
    recommendedAction:
      typeof runtimeParsed.recommendedAction === 'string' ? runtimeParsed.recommendedAction.trim() : undefined,
    toImproveStatus: asList(runtimeParsed.toImproveStatus),
    confidenceExplanation:
      typeof runtimeParsed.confidenceExplanation === 'string'
        ? runtimeParsed.confidenceExplanation.trim()
        : undefined,
    dataLimitations: asList(runtimeParsed.dataLimitations),
  };
}

function mergeProviderWithTemplate(
  assessment: ExpeditionAssessment,
  providerNarrative: Partial<ExpeditionAssessmentNarrative>,
): ExpeditionAssessmentNarrative {
  const template = buildTemplateExpeditionAssessmentNarrative(assessment);
  return {
    ...template,
    statusLine: providerNarrative.statusLine || template.statusLine,
    plainLanguageSummary: providerNarrative.plainLanguageSummary || template.plainLanguageSummary,
    whyEcsThinksThis: providerNarrative.whyEcsThinksThis?.length
      ? providerNarrative.whyEcsThinksThis
      : template.whyEcsThinksThis,
    whatToWatch: providerNarrative.whatToWatch?.length
      ? providerNarrative.whatToWatch
      : template.whatToWatch,
    recommendedAction: providerNarrative.recommendedAction || template.recommendedAction,
    toImproveStatus: providerNarrative.toImproveStatus?.length
      ? providerNarrative.toImproveStatus
      : template.toImproveStatus,
    confidence: assessment.confidence,
    confidenceExplanation: providerNarrative.confidenceExplanation || template.confidenceExplanation,
    dataLimitations: providerNarrative.dataLimitations?.length
      ? providerNarrative.dataLimitations
      : template.dataLimitations,
    source: 'ai',
  };
}

export async function generateExpeditionAssessmentNarrative(
  assessment: ExpeditionAssessment,
  provider?: ExpeditionAssessmentNarrativeProvider | null,
): Promise<ExpeditionAssessmentNarrative> {
  const fallback = buildTemplateExpeditionAssessmentNarrative(assessment);
  if (!provider) return fallback;

  try {
    const groundingJson = serializeGrounding(assessment);
    const providerResult = await provider.generateNarrative({
      assessment,
      prompt: ECS_ASSESSMENT_NARRATIVE_PROMPT.replace('{{ASSESSMENT_JSON}}', groundingJson),
      groundingJson,
    });
    const normalized = normalizeProviderNarrative(providerResult);
    if (!normalized) return fallback;
    const unsupported = unsupportedSensitiveSentences(normalized, assessment);
    if (unsupported.length > 0) return fallback;
    return mergeProviderWithTemplate(assessment, normalized);
  } catch {
    return fallback;
  }
}

export async function generateExpeditionAssessmentNarratives(
  assessments: ExpeditionAssessment[],
  provider?: ExpeditionAssessmentNarrativeProvider | null,
): Promise<ExpeditionAssessmentNarrative[]> {
  return Promise.all(
    assessments.map((assessment) =>
      generateExpeditionAssessmentNarrative(assessment, provider),
    ),
  );
}
