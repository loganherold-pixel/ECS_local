import type { ECSAIState } from '../ai/aiOrchestrator';
import type { ECSExpeditionPhase } from '../ai/expeditionPhaseTypes';
import type { ECSOrchestratorCandidate, ECSOrchestratorSource } from '../ai/orchestratorTypes';
import type { ECSOrchestratorTargetView } from '../ai/orchestratorSelectors';
import type { ResourceForecast } from '../resourceForecastEngine';
import type { ECSNormalizedProviderResult } from '../blu/providerNormalizationTypes';
import type {
  PowerWidgetPresentation,
  ResourceCandidateBundle,
  ResourceFooterPresentation,
  ResourcePresentationTone,
  ResourceRationalePresentation,
  ResourceStatusBadgePresentation,
  ResourceWidgetPresentation,
} from './resourcePresentationTypes';

type ResolvePowerWidgetArgs = {
  batteryPercent?: number | null;
  runtimeMinutes?: number | null;
  inputWatts?: number | null;
  outputWatts?: number | null;
  solarWatts?: number | null;
  connectedDeviceCount?: number | null;
  providerTelemetry?: ECSNormalizedProviderResult | null;
  aiState?: ECSAIState | null;
  dashboardView?: ECSOrchestratorTargetView | null;
};

type ResolveResourceWidgetArgs = {
  fuelPercent?: number | null;
  fuelRangeMiles?: number | null;
  fuelSourceLabel?: string | null;
  fuelSourceTone?: ResourcePresentationTone;
  waterGallons?: number | null;
  waterSourceLabel?: string | null;
  alternateFluidValue?: string | null;
  alternateFluidLabel?: string | null;
  alternateFluidSourceLabel?: string | null;
  powerPercent?: number | null;
  powerRuntimeMinutes?: number | null;
  powerInputWatts?: number | null;
  powerOutputWatts?: number | null;
  providerTelemetry?: ECSNormalizedProviderResult | null;
  forecast?: ResourceForecast | null;
  aiState?: ECSAIState | null;
  dashboardView?: ECSOrchestratorTargetView | null;
};

function safeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function cleanText(value: string | null | undefined): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function toneFromPercent(value: number | null | undefined): ResourcePresentationTone {
  const pct = safeNumber(value);
  if (pct == null) return 'neutral';
  if (pct <= 15) return 'critical';
  if (pct <= 35) return 'attention';
  return 'good';
}

function toneFromPriority(candidate: ECSOrchestratorCandidate | null): ResourcePresentationTone {
  switch (candidate?.priority?.level) {
    case 'critical':
    case 'warning':
      return 'critical';
    case 'caution':
      return 'attention';
    case 'advisory':
      return 'warning';
    default:
      return 'neutral';
  }
}

function phaseLabel(phase: ECSExpeditionPhase | null | undefined): string {
  switch (phase) {
    case 'vehicle_setup':
      return 'SETUP';
    case 'staging':
      return 'STAGING';
    case 'transit':
      return 'TRANSIT';
    case 'trail_entry':
      return 'TRAIL ENTRY';
    case 'active_expedition':
      return 'EXPEDITION';
    case 'camp_stationary':
      return 'CAMP';
    case 'recovery_exit':
      return 'EXIT';
    default:
      return 'SUSTAINMENT';
  }
}

function formatRuntimeMinutes(value: number | null | undefined): string {
  const minutes = safeNumber(value);
  if (minutes == null || minutes <= 0) return '—';
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded}m`;
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatFlowValue(value: number | null | undefined, kind: 'input' | 'output'): string {
  const watts = safeNumber(value);
  if (watts == null || watts <= 0) return '—';
  return kind === 'input' ? `+${Math.round(watts)}W` : `-${Math.round(watts)}W`;
}

function providerBadge(providerTelemetry: ECSNormalizedProviderResult | null | undefined): ResourceStatusBadgePresentation {
  switch (providerTelemetry?.state) {
    case 'live_provider_connected':
      return { label: 'LIVE PROVIDER', tone: 'live' };
    case 'cloud_backed':
      return { label: 'CLOUD BACKED', tone: 'degraded' };
    case 'stale_but_usable':
      return { label: 'LAST KNOWN', tone: 'stale' };
    case 'waiting_for_provider':
      return { label: 'WAITING', tone: 'attention' };
    case 'temporarily_disconnected':
      return { label: 'DEGRADED', tone: 'degraded' };
    case 'manual_baseline':
      return { label: 'MANUAL BASELINE', tone: 'attention' };
    case 'unsupported':
      return { label: 'UNSUPPORTED', tone: 'misconfigured' };
    default:
      return { label: 'UNAVAILABLE', tone: 'unavailable' };
  }
}

function providerSourceLine(providerTelemetry: ECSNormalizedProviderResult | null | undefined): string | null {
  if (!providerTelemetry) return null;

  const provider = cleanText(providerTelemetry.providerLabel);
  const device = cleanText(providerTelemetry.deviceLabel);
  const source = cleanText(providerTelemetry.sourceLabel);

  const parts = [provider, device, source].filter(Boolean);
  return parts.length ? parts.join(' • ') : cleanText(providerTelemetry.label) || null;
}

function candidateText(candidate: ECSOrchestratorCandidate | null): string | null {
  return (
    cleanText(candidate?.targetPresentation?.dashboard?.explanation?.shortText) ||
    cleanText(candidate?.targetPresentation?.dashboard?.explanation?.text) ||
    cleanText(candidate?.explanation?.shortText) ||
    cleanText(candidate?.explanation?.text) ||
    cleanText(candidate?.summary) ||
    cleanText(candidate?.title) ||
    null
  );
}

function firstCandidate(
  view: ECSOrchestratorTargetView | null | undefined,
  sources: ECSOrchestratorSource[],
): ECSOrchestratorCandidate | null {
  if (!view) return null;
  const all = [view.primary, ...view.secondary, ...view.passive].filter(
    (candidate): candidate is ECSOrchestratorCandidate => !!candidate,
  );
  return all.find((candidate) => sources.includes(candidate.source)) ?? null;
}

export function resolveResourceCandidates(
  view: ECSOrchestratorTargetView | null | undefined,
): ResourceCandidateBundle {
  return {
    routeViability: firstCandidate(view, ['route_viability']),
    resource: firstCandidate(view, ['resource_status']),
    telemetry: firstCandidate(view, ['telemetry']),
    offlineReadiness: firstCandidate(view, ['offline_readiness']),
  };
}

function buildFooter(text: string | null, tone: ResourcePresentationTone): ResourceFooterPresentation {
  const normalized = cleanText(text);
  return normalized ? { text: normalized, tone } : null;
}

function buildRationale(
  text: string | null,
  tone: ResourcePresentationTone,
): ResourceRationalePresentation {
  const normalized = cleanText(text);
  return normalized ? { text: normalized, tone } : null;
}

function powerSupportTone(providerTelemetry: ECSNormalizedProviderResult | null | undefined): ResourcePresentationTone {
  switch (providerTelemetry?.state) {
    case 'live_provider_connected':
      return 'live';
    case 'manual_baseline':
      return 'attention';
    case 'cloud_backed':
    case 'temporarily_disconnected':
      return 'degraded';
    case 'stale_but_usable':
      return 'stale';
    case 'waiting_for_provider':
      return 'attention';
    default:
      return 'neutral';
  }
}

function operationalPhaseNeedsPowerFocus(phase: ECSExpeditionPhase | null | undefined): boolean {
  return phase === 'camp_stationary' || phase === 'recovery_exit' || phase === 'active_expedition';
}

export function resolvePowerWidgetPresentation(args: ResolvePowerWidgetArgs): PowerWidgetPresentation {
  const batteryTone = toneFromPercent(args.batteryPercent);
  const providerTone = powerSupportTone(args.providerTelemetry);
  const phase = args.aiState?.expeditionPhase ?? null;
  const candidates = resolveResourceCandidates(args.dashboardView);
  const routeCandidate = candidates.routeViability;
  const telemetryCandidate = candidates.telemetry;
  const lowPower = batteryTone === 'critical' || batteryTone === 'attention';
  const runtimeText = formatRuntimeMinutes(args.runtimeMinutes);
  const sourceLine = providerSourceLine(args.providerTelemetry);
  const flowSummary =
    formatFlowValue(args.inputWatts, 'input') !== '—'
      ? `${formatFlowValue(args.inputWatts, 'input')} in`
      : formatFlowValue(args.outputWatts, 'output') !== '—'
        ? `${formatFlowValue(args.outputWatts, 'output')} out`
        : runtimeText !== '—'
          ? `${runtimeText} runtime`
          : cleanText(args.providerTelemetry?.label) || 'Power source idle';

  const commandRationale =
    lowPower && operationalPhaseNeedsPowerFocus(phase)
      ? candidateText(routeCandidate) || candidateText(telemetryCandidate)
      : candidateText(telemetryCandidate) || args.providerTelemetry?.explanation || null;

  const compactSummary =
    lowPower
      ? operationalPhaseNeedsPowerFocus(phase)
        ? 'Power margin tightening'
        : 'Power reserve deserves watch'
      : args.providerTelemetry?.state === 'live_provider_connected'
        ? `Live power ${args.batteryPercent != null ? `${Math.round(args.batteryPercent)}% reserve` : 'telemetry active'}`
        : args.providerTelemetry?.summary || 'Stored power posture available';

  const compactStatus =
    args.batteryPercent != null
      ? `${Math.round(args.batteryPercent)}% • ${flowSummary}`
      : flowSummary;

  const badge =
    lowPower && operationalPhaseNeedsPowerFocus(phase)
      ? {
          label: routeCandidate?.title?.toUpperCase() || 'POWER WATCH',
          tone: toneFromPriority(routeCandidate) === 'neutral' ? batteryTone : toneFromPriority(routeCandidate),
        }
      : providerBadge(args.providerTelemetry);

  const footer = buildFooter(
    sourceLine || args.providerTelemetry?.summary || null,
    lowPower ? batteryTone : providerTone,
  );

  return {
    compact: {
      summary: compactSummary,
      tone: lowPower ? batteryTone : providerTone,
      status: compactStatus,
      statusTone: lowPower ? batteryTone : providerTone,
    },
    badge,
    footer,
    rationale: buildRationale(commandRationale, lowPower ? batteryTone : providerTone),
    microMetrics: [
      {
        label: 'Runtime',
        value: runtimeText,
        tone: args.runtimeMinutes != null && args.runtimeMinutes <= 120 ? 'attention' : 'neutral',
      },
      {
        label: 'Input',
        value: formatFlowValue(args.inputWatts, 'input'),
        tone: safeNumber(args.inputWatts) != null && safeNumber(args.inputWatts)! > 0 ? 'good' : 'neutral',
      },
      {
        label: 'Output',
        value: formatFlowValue(args.outputWatts, 'output'),
        tone: safeNumber(args.outputWatts) != null && safeNumber(args.outputWatts)! > 0 ? 'attention' : 'neutral',
      },
    ],
    detail: {
      eyebrow: phaseLabel(phase),
      title:
        lowPower && operationalPhaseNeedsPowerFocus(phase)
          ? routeCandidate?.title || 'Power posture needs attention'
          : args.providerTelemetry?.label || 'Power posture',
      summary: compactSummary,
      sourceLine: sourceLine || null,
      rationaleLine: cleanText(commandRationale) || null,
      tone: lowPower ? batteryTone : providerTone,
    },
  };
}

export function resolveResourceWidgetPresentation(
  args: ResolveResourceWidgetArgs,
): ResourceWidgetPresentation {
  const phase = args.aiState?.expeditionPhase ?? null;
  const candidates = resolveResourceCandidates(args.dashboardView);
  const routeCandidate = candidates.routeViability;
  const resourceCandidate = candidates.resource;
  const offlineCandidate = candidates.offlineReadiness;
  const forecast = args.forecast ?? args.aiState?.richContext?.resources?.forecast ?? null;

  const fuelTone = toneFromPercent(args.fuelPercent);
  const powerTone = toneFromPercent(args.powerPercent);
  const waterTone =
    args.waterGallons == null
      ? 'neutral'
      : args.waterGallons <= 0
        ? 'critical'
        : args.waterGallons < 5
          ? 'attention'
          : 'good';

  const dominantTone =
    fuelTone === 'critical' || powerTone === 'critical' || waterTone === 'critical'
      ? 'critical'
      : fuelTone === 'attention' || powerTone === 'attention' || waterTone === 'attention'
        ? 'attention'
        : 'good';

  const commandCandidate = routeCandidate ?? resourceCandidate ?? offlineCandidate;
  const compactSummary =
    cleanText(commandCandidate?.title) ||
    (dominantTone === 'critical'
      ? 'Resource margin tightening'
      : dominantTone === 'attention'
        ? 'Resource posture deserves watch'
        : phase === 'camp_stationary'
          ? 'Sustainment ready for camp posture'
          : 'Sustainment posture stable');

  const compactStatus =
    args.fuelRangeMiles != null
      ? `Fuel ${args.fuelPercent != null ? `${Math.round(args.fuelPercent)}%` : '--'} • ${Math.round(args.fuelRangeMiles)} mi`
      : args.powerPercent != null
        ? `Power ${Math.round(args.powerPercent)}%`
        : args.waterGallons != null
          ? `Water ${args.waterGallons.toFixed(1)} gal`
          : 'Baseline only';

  const badge: ResourceStatusBadgePresentation =
    commandCandidate
      ? {
          label:
            cleanText(commandCandidate.title).toUpperCase() ||
            (dominantTone === 'critical' ? 'LIMITED MARGIN' : 'RESOURCE WATCH'),
          tone: toneFromPriority(commandCandidate) === 'neutral' ? dominantTone : toneFromPriority(commandCandidate),
        }
      : args.providerTelemetry
        ? providerBadge(args.providerTelemetry)
        : {
            label: dominantTone === 'good' ? 'RESOURCE READY' : 'RESOURCE SNAPSHOT',
            tone: dominantTone === 'good' ? 'live' : dominantTone,
          };

  const primaryTitle =
    dominantTone === 'critical'
      ? 'Limited margin'
      : dominantTone === 'attention'
        ? 'Watch consumption'
        : forecast?.sufficiencyLevel === 'Stable'
          ? 'Ready'
          : 'Sustainment stable';

  const heroSupport =
    args.fuelRangeMiles != null
      ? `${Math.round(args.fuelRangeMiles)} mi range`
      : args.fuelSourceLabel
        ? args.fuelSourceLabel
        : 'Range unavailable';

  const sourceParts = [
    args.fuelSourceLabel ? `Fuel ${args.fuelSourceLabel}` : null,
    args.waterSourceLabel ? `Water ${args.waterSourceLabel}` : null,
    args.providerTelemetry?.sourceLabel ? `Power ${args.providerTelemetry.sourceLabel}` : null,
    args.alternateFluidValue && args.alternateFluidLabel && args.alternateFluidSourceLabel
      ? `${args.alternateFluidLabel} ${args.alternateFluidSourceLabel}`
      : null,
  ].filter((value): value is string => !!value);

  const rationaleLine =
    candidateText(commandCandidate)
    || forecast?.drivers?.[0]
    || args.providerTelemetry?.explanation
    || null;

  return {
    compact: {
      summary: compactSummary,
      tone: commandCandidate ? (toneFromPriority(commandCandidate) === 'neutral' ? dominantTone : toneFromPriority(commandCandidate)) : dominantTone,
      status: compactStatus,
      statusTone: args.fuelPercent != null ? fuelTone : args.powerPercent != null ? powerTone : waterTone,
    },
    badge,
    footer: buildFooter(sourceParts.join(' • '), args.providerTelemetry ? powerSupportTone(args.providerTelemetry) : (args.fuelSourceTone ?? 'neutral')),
    rationale: buildRationale(rationaleLine, commandCandidate ? toneFromPriority(commandCandidate) : dominantTone),
    heroLabel: 'POSTURE',
    heroValue: primaryTitle.toUpperCase(),
    heroTone: commandCandidate ? (toneFromPriority(commandCandidate) === 'neutral' ? dominantTone : toneFromPriority(commandCandidate)) : dominantTone,
    heroSupport,
    resourceTiles: [
      {
        label: 'WATER',
        value: args.waterGallons != null ? `${args.waterGallons.toFixed(1)} gal` : '--',
        tone: waterTone,
      },
      {
        label: 'POWER',
        value:
          args.powerPercent != null
            ? `${Math.round(args.powerPercent)}%`
            : formatRuntimeMinutes(args.powerRuntimeMinutes),
        tone: powerTone,
      },
    ],
    microMetrics: [
      {
        label: 'Fuel',
        value: args.fuelPercent != null ? `${Math.round(args.fuelPercent)}%` : '--',
        tone: fuelTone,
      },
      {
        label: 'Range',
        value: args.fuelRangeMiles != null ? `${Math.round(args.fuelRangeMiles)} mi` : '--',
        tone: args.fuelRangeMiles != null && dominantTone !== 'good' ? dominantTone : 'neutral',
      },
      {
        label: 'Power',
        value:
          safeNumber(args.powerInputWatts) != null && safeNumber(args.powerInputWatts)! > 0
            ? `${formatFlowValue(args.powerInputWatts, 'input')} in`
            : safeNumber(args.powerOutputWatts) != null && safeNumber(args.powerOutputWatts)! > 0
              ? `${formatFlowValue(args.powerOutputWatts, 'output')} out`
              : formatRuntimeMinutes(args.powerRuntimeMinutes),
        tone:
          safeNumber(args.powerInputWatts) != null && safeNumber(args.powerInputWatts)! > 0
            ? 'good'
            : powerTone,
      },
    ],
    detail: {
      eyebrow: phaseLabel(phase),
      title: cleanText(commandCandidate?.title) || 'Resource posture',
      summary: compactSummary,
      sourceLine: sourceParts.join(' • ') || null,
      rationaleLine: cleanText(rationaleLine) || null,
      tone: commandCandidate ? (toneFromPriority(commandCandidate) === 'neutral' ? dominantTone : toneFromPriority(commandCandidate)) : dominantTone,
    },
  };
}
