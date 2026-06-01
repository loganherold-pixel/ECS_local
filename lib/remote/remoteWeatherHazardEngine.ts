import type {
  ECSBriefSeverity,
  RemoteWeatherHazardType,
} from '../ai/ecsBriefTypes';

export type RemoteWeatherHazardInput = {
  routeId?: string;
  segmentId?: string;
  remotenessScore: number;
  routeConfidence: number;
  weatherRisk: number;
  windMph?: number | null;
  precipProb?: number | null;
  tempF?: number | null;
  smokeRisk?: number | null;
  fireRisk?: number | null;
  signalLossMiles?: number | null;
  cacheReady: boolean;
  powerHours?: number | null;
  distanceAheadMi?: number;
  etaMinutes?: number;
};

export type RemoteWeatherHazardOutput = {
  shouldEmit: boolean;
  severity: ECSBriefSeverity;
  type: RemoteWeatherHazardType;
  title: string;
  message: string;
  recommendedAction: string;
  confidence: number;
};

type HazardCandidate = RemoteWeatherHazardOutput & {
  priority: number;
  evidenceCount: number;
};

const NO_HAZARD_OUTPUT: RemoteWeatherHazardOutput = {
  shouldEmit: false,
  severity: 'info',
  type: 'remote_weather_exposure',
  title: 'Remote hazard watch clear',
  message: 'No predictive remote weather hazard crossed the advisory threshold.',
  recommendedAction: 'Continue monitoring remoteness, weather, signal, cache, and power readiness.',
  confidence: 0.6,
};

const SEVERITY_PRIORITY: Record<ECSBriefSeverity, number> = {
  info: 0,
  watch: 1,
  warning: 2,
  critical: 3,
};

function clamp(value: number, min = 0, max = 1): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function optionalNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function formatDistance(distanceAheadMi?: number): string {
  if (!Number.isFinite(distanceAheadMi)) return '';
  const distance = Math.max(0, Number(distanceAheadMi));
  if (distance < 1) return ' less than 1 mile ahead';
  if (distance < 10) return ` ${distance.toFixed(1)} miles ahead`;
  return ` ${Math.round(distance)} miles ahead`;
}

function formatEta(etaMinutes?: number): string {
  if (!Number.isFinite(etaMinutes)) return '';
  const minutes = Math.max(0, Math.round(Number(etaMinutes)));
  if (minutes < 60) return ` in about ${minutes} min`;
  const hours = minutes / 60;
  return ` in about ${hours.toFixed(hours < 10 ? 1 : 0)} hr`;
}

function confidenceForCandidate(
  severity: ECSBriefSeverity,
  evidenceCount: number,
  input: RemoteWeatherHazardInput,
): number {
  const routeConfidence = clampScore(input.routeConfidence) / 100;
  const severityBoost = SEVERITY_PRIORITY[severity] * 0.04;
  const evidenceBoost = Math.min(0.18, evidenceCount * 0.04);
  const cacheBoost = input.cacheReady ? 0.03 : 0;
  return Number(clamp(0.48 + routeConfidence * 0.18 + severityBoost + evidenceBoost + cacheBoost, 0.45, 0.95).toFixed(2));
}

function createCandidate(args: {
  input: RemoteWeatherHazardInput;
  severity: ECSBriefSeverity;
  type: RemoteWeatherHazardType;
  title: string;
  message: string;
  recommendedAction: string;
  evidenceCount: number;
}): HazardCandidate {
  return {
    shouldEmit: true,
    severity: args.severity,
    type: args.type,
    title: args.title,
    message: args.message,
    recommendedAction: args.recommendedAction,
    confidence: confidenceForCandidate(args.severity, args.evidenceCount, args.input),
    priority: SEVERITY_PRIORITY[args.severity],
    evidenceCount: args.evidenceCount,
  };
}

function selectHighestSeverity(candidates: HazardCandidate[]): RemoteWeatherHazardOutput {
  if (candidates.length === 0) return NO_HAZARD_OUTPUT;

  const best = candidates
    .slice()
    .sort((left, right) => {
      if (right.priority !== left.priority) return right.priority - left.priority;
      if (right.confidence !== left.confidence) return right.confidence - left.confidence;
      return right.evidenceCount - left.evidenceCount;
    })[0];

  return {
    shouldEmit: best.shouldEmit,
    severity: best.severity,
    type: best.type,
    title: best.title,
    message: best.message,
    recommendedAction: best.recommendedAction,
    confidence: best.confidence,
  };
}

export function assessRemoteWeatherHazard(
  input: RemoteWeatherHazardInput,
): RemoteWeatherHazardOutput {
  const remotenessScore = clampScore(input.remotenessScore);
  const routeConfidence = clampScore(input.routeConfidence);
  const weatherRisk = clamp(input.weatherRisk);
  const windMph = optionalNumber(input.windMph);
  const tempF = optionalNumber(input.tempF);
  const smokeRisk = optionalNumber(input.smokeRisk);
  const fireRisk = optionalNumber(input.fireRisk);
  const signalLossMiles = optionalNumber(input.signalLossMiles);
  const distanceText = formatDistance(input.distanceAheadMi);
  const etaText = formatEta(input.etaMinutes);
  const candidates: HazardCandidate[] = [];

  if (remotenessScore >= 85 && weatherRisk >= 0.75) {
    candidates.push(createCandidate({
      input,
      severity: 'critical',
      type: 'remote_weather_exposure',
      title: 'Critical remote weather exposure',
      message: `Remote route exposure is high${distanceText}${etaText}; remoteness is ${Math.round(remotenessScore)} and weather risk is elevated.`,
      recommendedAction: 'Pause before entering the segment, verify bailout options, cache coverage, power, and current weather.',
      evidenceCount: 2,
    }));
  } else if (remotenessScore >= 70 && weatherRisk >= 0.6) {
    candidates.push(createCandidate({
      input,
      severity: 'warning',
      type: 'remote_weather_exposure',
      title: 'Remote weather exposure',
      message: `Remote route exposure is increasing${distanceText}${etaText}; remoteness is ${Math.round(remotenessScore)} with weather risk above the warning threshold.`,
      recommendedAction: 'Review forecast timing, bailout distance, offline maps, and turnaround options before continuing.',
      evidenceCount: 2,
    }));
  }

  if (signalLossMiles != null && signalLossMiles >= 25 && weatherRisk >= 0.5) {
    candidates.push(createCandidate({
      input,
      severity: 'warning',
      type: 'remote_signal_loss',
      title: 'Signal loss ahead',
      message: `No-signal exposure may extend about ${Math.round(signalLossMiles)} miles while weather risk is elevated.`,
      recommendedAction: 'Send a check-in, verify offline route data, and confirm communication fallback before entering the dead zone.',
      evidenceCount: 2,
    }));
  } else if (signalLossMiles != null && signalLossMiles >= 10 && remotenessScore >= 65) {
    candidates.push(createCandidate({
      input,
      severity: 'watch',
      type: 'remote_signal_loss',
      title: 'Signal watch ahead',
      message: `Signal loss may extend about ${Math.round(signalLossMiles)} miles in remote terrain.`,
      recommendedAction: 'Confirm offline maps, route notes, and a check-in plan before signal drops.',
      evidenceCount: 2,
    }));
  }

  if (!input.cacheReady && remotenessScore >= 60) {
    candidates.push(createCandidate({
      input,
      severity: 'warning',
      type: 'offline_readiness_gap',
      title: 'Offline readiness gap',
      message: `Offline cache is not ready while remoteness is ${Math.round(remotenessScore)}.`,
      recommendedAction: 'Cache route, remoteness, weather, and connectivity data before continuing into remote terrain.',
      evidenceCount: 2,
    }));
  }

  if (windMph != null && windMph >= 35 && remotenessScore >= 65) {
    candidates.push(createCandidate({
      input,
      severity: 'warning',
      type: 'remote_wind_exposure',
      title: 'Remote wind exposure',
      message: `Wind is near ${Math.round(windMph)} mph in remote terrain.`,
      recommendedAction: 'Avoid exposed ridges and open camp setup until wind exposure is verified against current conditions.',
      evidenceCount: 2,
    }));
  }

  if (tempF != null && tempF >= 100 && remotenessScore >= 60) {
    candidates.push(createCandidate({
      input,
      severity: 'warning',
      type: 'remote_heat_risk',
      title: 'Remote heat risk',
      message: `Temperature is near ${Math.round(tempF)}F with limited nearby support.`,
      recommendedAction: 'Verify water margin, shade options, vehicle cooling, and turnaround timing before continuing.',
      evidenceCount: 2,
    }));
  } else if (tempF != null && tempF <= 20 && remotenessScore >= 60) {
    candidates.push(createCandidate({
      input,
      severity: 'warning',
      type: 'remote_snow_ice',
      title: 'Remote cold exposure',
      message: `Temperature is near ${Math.round(tempF)}F with limited nearby support.`,
      recommendedAction: 'Verify warmth, shelter, traction, battery reserve, and bailout timing before continuing.',
      evidenceCount: 2,
    }));
  }

  if (smokeRisk != null && smokeRisk >= 0.6 && remotenessScore >= 60) {
    candidates.push(createCandidate({
      input,
      severity: 'warning',
      type: 'remote_fire_smoke',
      title: 'Remote smoke exposure',
      message: 'Smoke risk is elevated in remote terrain.',
      recommendedAction: 'Check current smoke and fire information, visibility, escape routes, and air quality before continuing.',
      evidenceCount: 2,
    }));
  }

  if (fireRisk != null && fireRisk >= 0.7 && remotenessScore >= 60) {
    candidates.push(createCandidate({
      input,
      severity: 'critical',
      type: 'remote_fire_smoke',
      title: 'Critical remote fire risk',
      message: 'Fire risk is critical in remote terrain with limited bailout margin.',
      recommendedAction: 'Do not enter the exposed segment until fire conditions, access, evacuation routes, and official guidance are verified.',
      evidenceCount: 2,
    }));
  }

  if (routeConfidence < 45 && remotenessScore >= 65) {
    candidates.push(createCandidate({
      input,
      severity: 'warning',
      type: 'remote_bailout_gap',
      title: 'Low route confidence',
      message: `Route confidence is ${Math.round(routeConfidence)}% while remoteness is ${Math.round(remotenessScore)}.`,
      recommendedAction: 'Improve confidence by verifying route data, bailout options, cache readiness, and current conditions.',
      evidenceCount: 2,
    }));
  }

  return selectHighestSeverity(candidates);
}
