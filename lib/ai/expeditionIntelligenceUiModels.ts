import type {
  ExpeditionAgentResponse,
  ExpeditionIntelligenceConfidence,
  ExpeditionIntelligenceRiskLevel,
} from './expeditionIntelligenceTypes';
import type {
  ExpeditionRouteConfidenceResult,
  ExpeditionRouteRiskLevel,
} from './expeditionRouteConfidenceEngine';

export type ExpeditionIntelligenceCardState =
  | 'ready'
  | 'loading'
  | 'empty'
  | 'error';

export type ExpeditionIntelligenceCardTone =
  | 'ready'
  | 'active'
  | 'warning'
  | 'unavailable'
  | 'info';

export type ExpeditionIntelligenceListItem = {
  id: string;
  label: string;
  detail?: string | null;
  tone: ExpeditionIntelligenceCardTone;
  evidenceIds?: string[];
};

export type ExpeditionIntelligenceCardModel = {
  id: string;
  title: string;
  eyebrow: string;
  state: ExpeditionIntelligenceCardState;
  tone: ExpeditionIntelligenceCardTone;
  summary: string;
  confidenceLabel: string;
  uncertainty: string[];
  risks: ExpeditionIntelligenceListItem[];
  missingData: ExpeditionIntelligenceListItem[];
  nextActions: ExpeditionIntelligenceListItem[];
  suggestions: ExpeditionIntelligenceListItem[];
  evidenceCount: number;
  errorMessage?: string | null;
};

export type ExpeditionIntelligenceUiInput = {
  response?: ExpeditionAgentResponse | null;
  routeConfidence?: ExpeditionRouteConfidenceResult | null;
  title?: string;
  eyebrow?: string;
  loading?: boolean;
  error?: string | null;
  emptySummary?: string;
};

const DEFAULT_EMPTY_SUMMARY =
  'Expedition intelligence is not available yet. Existing route and trip workflows can continue.';

function compactText(value: unknown, fallback = ''): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function uniqueLimited(values: Array<string | null | undefined>, max = 4): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const clean = compactText(value);
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    output.push(clean);
    if (output.length >= max) break;
  }
  return output;
}

export function toneForIntelligenceStatus(
  status?: ExpeditionIntelligenceRiskLevel | ExpeditionRouteRiskLevel | null,
): ExpeditionIntelligenceCardTone {
  switch (status) {
    case 'normal':
    case 'low':
      return 'ready';
    case 'watch':
    case 'moderate':
      return 'active';
    case 'caution':
    case 'elevated':
    case 'high':
      return 'warning';
    case 'critical':
    case 'severe':
      return 'unavailable';
    default:
      return 'info';
  }
}

export function formatIntelligenceConfidence(
  confidence?: ExpeditionIntelligenceConfidence | string | null,
): string {
  const clean = compactText(confidence, 'unknown');
  return `Confidence: ${clean}`;
}

function itemsFromStrings(
  prefix: string,
  values: string[],
  tone: ExpeditionIntelligenceCardTone,
): ExpeditionIntelligenceListItem[] {
  return values.map((label, index) => ({
    id: `${prefix}-${index + 1}`,
    label,
    tone,
  }));
}

export function buildExpeditionIntelligenceCardModel(
  input: ExpeditionIntelligenceUiInput,
): ExpeditionIntelligenceCardModel {
  const title = input.title ?? 'Expedition Brief';
  const eyebrow = input.eyebrow ?? 'ECS Intelligence';

  if (input.loading) {
    return {
      id: 'expedition-intelligence-loading',
      title,
      eyebrow,
      state: 'loading',
      tone: 'info',
      summary: 'Loading expedition intelligence.',
      confidenceLabel: 'Confidence: pending',
      uncertainty: ['Waiting for ECS context.'],
      risks: [],
      missingData: [],
      nextActions: [],
      suggestions: [],
      evidenceCount: 0,
    };
  }

  if (input.error) {
    return {
      id: 'expedition-intelligence-error',
      title,
      eyebrow,
      state: 'error',
      tone: 'warning',
      summary: 'Expedition intelligence is temporarily unavailable.',
      confidenceLabel: 'Confidence: unavailable',
      uncertainty: ['AI output unavailable. Existing trip and route workflows are not blocked.'],
      risks: [],
      missingData: [],
      nextActions: itemsFromStrings('fallback-action', ['Continue with verified ECS route and trip data.'], 'active'),
      suggestions: [],
      evidenceCount: 0,
      errorMessage: input.error,
    };
  }

  const response = input.response ?? null;
  const routeConfidence = input.routeConfidence ?? null;
  if (!response && !routeConfidence) {
    return {
      id: 'expedition-intelligence-empty',
      title,
      eyebrow,
      state: 'empty',
      tone: 'info',
      summary: input.emptySummary ?? DEFAULT_EMPTY_SUMMARY,
      confidenceLabel: 'Confidence: unknown',
      uncertainty: ['No AI expedition output has been generated.'],
      risks: [],
      missingData: [],
      nextActions: [],
      suggestions: [],
      evidenceCount: 0,
    };
  }

  const tone = toneForIntelligenceStatus(response?.status ?? routeConfidence?.riskLevel ?? routeConfidence?.status);
  const uncertainty = uniqueLimited([
    ...(response?.uncertainty ?? []),
    ...(response?.dataLimitations ?? []),
    ...(routeConfidence?.dataLimitations ?? []),
  ]);
  const missing = uniqueLimited([
    ...(response?.dataLimitations ?? []),
    ...(routeConfidence?.missingData ?? []),
  ]);
  const risks = uniqueLimited([
    ...(response?.risks ?? []),
    ...(routeConfidence?.concerns ?? []),
  ]);
  const nextActions = uniqueLimited([
    ...(response?.nextActions ?? []),
    response?.recommendedAction,
    ...(routeConfidence?.recommendedNextActions?.map((action) => action.title) ?? []),
  ]);
  const suggestions = uniqueLimited([
    ...(response?.recommendations ?? []),
    ...(routeConfidence?.recommendedNextActions?.map((action) => action.title) ?? []),
  ]);

  return {
    id: response?.agentId ?? 'route-confidence',
    title,
    eyebrow,
    state: 'ready',
    tone,
    summary: compactText(response?.summary ?? routeConfidence?.summary, DEFAULT_EMPTY_SUMMARY),
    confidenceLabel: formatIntelligenceConfidence(response?.confidence ?? routeConfidence?.confidenceBand ?? routeConfidence?.level),
    uncertainty,
    risks: itemsFromStrings('risk', risks, tone === 'ready' ? 'active' : tone),
    missingData: itemsFromStrings('missing', missing, missing.length ? 'warning' : 'info'),
    nextActions: itemsFromStrings('action', nextActions, 'active'),
    suggestions: itemsFromStrings('suggestion', suggestions, 'active'),
    evidenceCount: response?.evidence?.length ?? routeConfidence?.evidence?.length ?? 0,
  };
}

export function summarizeAiSurfaceOpportunities(): string[] {
  return [
    'Dashboard Mission Brief card and compact widget rows',
    'Discover and Navigate route cards using Route Confidence rows',
    'Assistant guidance cards for compact recommended actions',
    'Expedition detail/debrief surfaces for summary and lessons',
    'Community report cards for QA/conflict/freshness indicators',
  ];
}
