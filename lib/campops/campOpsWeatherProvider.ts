import type {
  CampCandidate,
  CampImpactLevel,
  CampOpsConfidence,
  CampOpsDataSource,
  CampOpsForecastTimeWindow,
  CampOpsRiskLevel,
  CampOpsWeatherExposureLevel,
} from './campOpsTypes';
import type {
  CampOpsExternalSourceSignal,
  CampOpsProviderRawStatus,
  CampOpsSourceProvider,
  CampOpsSourceProviderRequest,
  CampOpsSourceProviderResult,
  CampOpsSourceFreshness,
} from './campOpsSourceAdapters';
import { isCampOpsSourceSignalStale } from './campOpsSourceAdapters';

export const CAMP_OPS_WEATHER_PROVIDER_ID = 'campops.fixture_weather';

export type CampOpsWeatherRecord = {
  candidateId?: string | null;
  providerId?: string | null;
  providerDisplayName?: string | null;
  source: CampOpsDataSource;
  forecastTimeWindow?: CampOpsForecastTimeWindow | null;
  windSpeedMph?: number | null;
  windGustMph?: number | null;
  windDirection?: string | null;
  precipitationRisk?: CampOpsRiskLevel | null;
  stormRisk?: CampOpsRiskLevel | null;
  temperatureLowF?: number | null;
  temperatureHighF?: number | null;
  heatRisk?: CampOpsRiskLevel | null;
  coldRisk?: CampOpsRiskLevel | null;
  smokeOrAirQualityRisk?: CampOpsRiskLevel | null;
  sourceConfidence: CampOpsConfidence;
  observedAtIso?: string | null;
  staleAfterMinutes?: number | null;
  sourceSummary?: string | null;
  rawProviderStatus?: CampOpsProviderRawStatus;
  warnings?: string[];
  missingDataReason?: string | null;
};

export type CampOpsWeatherSourceProviderOptions = {
  id?: string;
  displayName?: string;
  sourceConfidence?: CampOpsConfidence;
  staleAfterMinutes?: number | null;
  records?: CampOpsWeatherRecord[];
  recordsByCandidateId?: Record<string, CampOpsWeatherRecord | undefined>;
};

function finiteNumber(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function highestRisk(...risks: Array<CampOpsRiskLevel | null | undefined>): CampOpsRiskLevel {
  const rank: Record<CampOpsRiskLevel, number> = { unknown: 0, low: 1, medium: 2, high: 3 };
  return risks.reduce<CampOpsRiskLevel>((current, risk) => {
    const value = risk ?? 'unknown';
    return rank[value] > rank[current] ? value : current;
  }, 'unknown');
}

function inferredHeatRisk(record: CampOpsWeatherRecord): CampOpsRiskLevel {
  if (record.heatRisk) return record.heatRisk;
  const high = finiteNumber(record.temperatureHighF);
  if (high == null) return 'unknown';
  if (high >= 105) return 'high';
  if (high >= 95) return 'medium';
  return 'low';
}

function inferredColdRisk(record: CampOpsWeatherRecord): CampOpsRiskLevel {
  if (record.coldRisk) return record.coldRisk;
  const low = finiteNumber(record.temperatureLowF);
  if (low == null) return 'unknown';
  if (low <= 20) return 'high';
  if (low <= 35) return 'medium';
  return 'low';
}

function inferredWindRisk(record: CampOpsWeatherRecord): CampOpsRiskLevel {
  const speed = finiteNumber(record.windSpeedMph);
  const gust = finiteNumber(record.windGustMph);
  const wind = Math.max(speed ?? 0, gust ?? 0);
  if (wind <= 0) return 'unknown';
  if (wind >= 40) return 'high';
  if (wind >= 25) return 'medium';
  return 'low';
}

export function normalizeCampOpsWeatherExposure(record: CampOpsWeatherRecord): CampOpsWeatherExposureLevel {
  const exposure = highestRisk(
    inferredWindRisk(record),
    record.precipitationRisk ?? 'unknown',
    record.stormRisk ?? 'unknown',
    inferredHeatRisk(record),
    inferredColdRisk(record),
    record.smokeOrAirQualityRisk ?? 'unknown',
  );
  if (exposure === 'high') return 'high';
  if (exposure === 'medium') return 'medium';
  if (exposure === 'low') return 'low';
  return 'unknown';
}

function exposureImpact(exposure: CampOpsWeatherExposureLevel): CampImpactLevel {
  if (exposure === 'high') return 'critical';
  if (exposure === 'medium') return 'caution';
  if (exposure === 'low') return 'watch';
  return 'unknown';
}

function lateArrivalRisk(record: CampOpsWeatherRecord): CampImpactLevel | null {
  const windRisk = inferredWindRisk(record);
  if (record.stormRisk === 'high' || windRisk === 'high') return 'critical';
  if (record.stormRisk === 'medium' || windRisk === 'medium' || record.precipitationRisk === 'high') return 'caution';
  return null;
}

function sourceFreshness(
  record: CampOpsWeatherRecord,
  currentTimeIso: string,
  fallbackStaleAfterMinutes: number | null | undefined,
): CampOpsSourceFreshness {
  if (!record.observedAtIso) return record.missingDataReason ? 'missing' : 'unknown';
  const staleAfterMinutes = record.staleAfterMinutes ?? fallbackStaleAfterMinutes ?? null;
  return isCampOpsSourceSignalStale(
    { observedAtIso: record.observedAtIso, staleAfterMinutes },
    currentTimeIso,
  ) ? 'stale' : 'fresh';
}

function safeSummary(record: CampOpsWeatherRecord): string {
  return record.sourceSummary || [
    finiteNumber(record.windSpeedMph) != null ? `wind ${record.windSpeedMph} mph` : null,
    finiteNumber(record.windGustMph) != null ? `gust ${record.windGustMph} mph` : null,
    record.stormRisk ? `storm ${record.stormRisk}` : null,
    record.heatRisk ? `heat ${record.heatRisk}` : null,
    record.coldRisk ? `cold ${record.coldRisk}` : null,
    record.smokeOrAirQualityRisk ? `smoke/AQI ${record.smokeOrAirQualityRisk}` : null,
  ].filter(Boolean).join('; ');
}

export function campOpsWeatherRecordToSourceSignal(
  record: CampOpsWeatherRecord,
  options: { stale?: boolean } = {},
): CampOpsExternalSourceSignal {
  const stale = options.stale === true;
  const exposureLevel = stale ? 'unknown' : normalizeCampOpsWeatherExposure(record);
  const heatRisk = stale ? 'unknown' : inferredHeatRisk(record);
  const coldRisk = stale ? 'unknown' : inferredColdRisk(record);
  return {
    source: record.source,
    confidence: stale ? 'low' : record.sourceConfidence,
    observedAtIso: record.observedAtIso ?? null,
    staleAfterMinutes: record.staleAfterMinutes ?? null,
    forecastTimeWindow: stale ? null : record.forecastTimeWindow ?? null,
    windSpeedMph: stale ? null : finiteNumber(record.windSpeedMph),
    windGustMph: stale ? null : finiteNumber(record.windGustMph),
    windDirection: stale ? null : record.windDirection ?? null,
    precipitationRisk: stale ? 'unknown' : record.precipitationRisk ?? 'unknown',
    stormRisk: stale ? 'unknown' : record.stormRisk ?? 'unknown',
    temperatureLowF: stale ? null : finiteNumber(record.temperatureLowF),
    temperatureHighF: stale ? null : finiteNumber(record.temperatureHighF),
    heatRisk,
    coldRisk,
    smokeOrAirQualityRisk: stale ? 'unknown' : record.smokeOrAirQualityRisk ?? 'unknown',
    weatherExposureLevel: exposureLevel,
    weatherExposure: exposureImpact(exposureLevel),
    lateArrivalRisk: stale ? null : lateArrivalRisk(record),
    waterImpact: !stale && heatRisk === 'high'
      ? { value: null, unit: 'unknown', impact: 'caution', confidence: record.sourceConfidence }
      : null,
    dataLimitations: [
      `Weather source: ${safeSummary(record) || 'weather status unknown'}`,
      ...(record.forecastTimeWindow?.label ? [`Forecast window: ${record.forecastTimeWindow.label}`] : []),
      ...(stale ? ['Stale weather source retained as uncertainty, not current conditions.'] : []),
      ...(record.missingDataReason ? [record.missingDataReason] : []),
    ],
  };
}

function recordForCandidate(
  candidate: CampCandidate,
  options: CampOpsWeatherSourceProviderOptions,
): CampOpsWeatherRecord | null {
  return options.recordsByCandidateId?.[candidate.id] ?? options.records?.find((record) => record.candidateId === candidate.id) ?? null;
}

export class CampOpsWeatherSourceProvider implements CampOpsSourceProvider {
  readonly id: string;
  readonly displayName: string;
  readonly sourceCategory = 'weather' as const;
  readonly sourceConfidence: CampOpsConfidence;
  readonly staleAfterMinutes?: number | null;

  constructor(private readonly options: CampOpsWeatherSourceProviderOptions = {}) {
    this.id = options.id ?? CAMP_OPS_WEATHER_PROVIDER_ID;
    this.displayName = options.displayName ?? 'CampOps weather fixture provider';
    this.sourceConfidence = options.sourceConfidence ?? 'medium';
    this.staleAfterMinutes = options.staleAfterMinutes ?? 90;
  }

  collectSignals({ candidates, currentTimeIso }: CampOpsSourceProviderRequest): CampOpsSourceProviderResult[] {
    return candidates.map((candidate) => {
      const record = recordForCandidate(candidate, this.options);
      if (!record) {
        return {
          candidateId: candidate.id,
          providerId: this.id,
          providerDisplayName: this.displayName,
          sourceCategory: 'weather',
          sourceConfidence: this.sourceConfidence,
          sourceFreshness: 'missing',
          sourceTimestampIso: null,
          rawProviderStatus: { status: 'missing' },
          signal: null,
          warnings: [],
          errors: [],
          missingDataReason: 'No weather record matched this camp candidate.',
        };
      }

      const freshness = sourceFreshness(record, currentTimeIso, this.staleAfterMinutes);
      const signal = campOpsWeatherRecordToSourceSignal(
        {
          ...record,
          staleAfterMinutes: record.staleAfterMinutes ?? this.staleAfterMinutes ?? null,
        },
        { stale: freshness === 'stale' },
      );
      return {
        candidateId: candidate.id,
        providerId: record.providerId ?? this.id,
        providerDisplayName: record.providerDisplayName ?? this.displayName,
        sourceCategory: 'weather',
        sourceConfidence: freshness === 'stale' ? 'low' : record.sourceConfidence,
        sourceFreshness: freshness,
        sourceTimestampIso: record.observedAtIso ?? null,
        rawProviderStatus: record.rawProviderStatus ?? {
          windSpeedMph: finiteNumber(record.windSpeedMph),
          windGustMph: finiteNumber(record.windGustMph),
          windDirection: record.windDirection ?? null,
          precipitationRisk: record.precipitationRisk ?? null,
          stormRisk: record.stormRisk ?? null,
          temperatureLowF: finiteNumber(record.temperatureLowF),
          temperatureHighF: finiteNumber(record.temperatureHighF),
          heatRisk: record.heatRisk ?? null,
          coldRisk: record.coldRisk ?? null,
          smokeOrAirQualityRisk: record.smokeOrAirQualityRisk ?? null,
          sourceSummary: safeSummary(record),
        },
        signal,
        warnings: record.warnings ?? [],
        errors: [],
        missingDataReason: record.missingDataReason ?? null,
      };
    });
  }
}
