import type {
  RouteConfidenceDriverCategory,
  RouteConfidenceLevel,
  RouteConfidenceOverlayAdapterResult,
  RouteConfidenceOverlaySource,
  RouteConfidenceOverlaySourceType,
  RouteConfidenceOverlaySpan,
  RouteConfidenceSourceFreshness,
  RouteConfidenceTimelineOverlay,
  RouteConfidenceValidationState,
  RouteConditionState,
} from './routeContextTypes';

export type RouteConfidenceOverlayAdapterInputBase = {
  routeId: string;
  routeGeometryVersion: string;
  totalMeasure: number;
  generatedAt?: string | null;
};

export type RouteConfidenceOverlayRecordBase = {
  id?: string | null;
  startMeasure?: number | null;
  endMeasure?: number | null;
  label?: string | null;
  detail?: string | null;
  sourceId?: string | null;
  sourceName?: string | null;
  observedAt?: string | null;
  generatedAt?: string | null;
  expiresAt?: string | null;
  freshness?: RouteConfidenceSourceFreshness | 'missing' | 'unknown' | null;
  validation?: RouteConfidenceValidationState | null;
  schemaVersion?: string | null;
  confidenceLevel?: RouteConfidenceLevel | null;
  conditionState?: RouteConditionState | null;
  impactRank?: number | null;
};

export type LegalAccessConfidenceOverlayRecord = RouteConfidenceOverlayRecordBase & {
  accessState?: 'open' | 'restricted' | 'closed' | 'unknown' | null;
};

export type ClosureConditionOverlayRecord = RouteConfidenceOverlayRecordBase & {
  active?: boolean | null;
};

export type OfflineCoverageOverlayRecord = RouteConfidenceOverlayRecordBase & {
  coverageState?: 'complete' | 'partial' | 'missing' | 'unknown' | null;
};

export type WeatherConfidenceOverlayRecord = RouteConfidenceOverlayRecordBase & {
  hazardous?: boolean | null;
};

export type TerrainExposureOverlayRecord = RouteConfidenceOverlayRecordBase & {
  exposureLevel?: 'low' | 'moderate' | 'high' | 'severe' | 'unknown' | null;
  knownRisk?: boolean | null;
};

export type BailoutDensityOverlayRecord = RouteConfidenceOverlayRecordBase & {
  density?: 'dense' | 'adequate' | 'sparse' | 'unknown' | null;
};

export type CampDeadlineOverlayRecord = RouteConfidenceOverlayRecordBase & {
  deadlineAt?: string | null;
  deadlineState?: 'comfortable' | 'tight' | 'expired' | 'unknown' | null;
};

export type IncidentRecoveryOverlayRecord = RouteConfidenceOverlayRecordBase & {
  active?: boolean | null;
};

export type LegalAccessConfidenceOverlayAdapterInput = RouteConfidenceOverlayAdapterInputBase & {
  accessOverlays?: LegalAccessConfidenceOverlayRecord[] | null;
};

export type ClosureConditionOverlayAdapterInput = RouteConfidenceOverlayAdapterInputBase & {
  closureOverlays?: ClosureConditionOverlayRecord[] | null;
};

export type OfflineCoverageOverlayAdapterInput = RouteConfidenceOverlayAdapterInputBase & {
  coverageOverlays?: OfflineCoverageOverlayRecord[] | null;
};

export type WeatherConfidenceOverlayAdapterInput = RouteConfidenceOverlayAdapterInputBase & {
  weatherOverlays?: WeatherConfidenceOverlayRecord[] | null;
};

export type TerrainExposureOverlayAdapterInput = RouteConfidenceOverlayAdapterInputBase & {
  exposureOverlays?: TerrainExposureOverlayRecord[] | null;
};

export type BailoutDensityOverlayAdapterInput = RouteConfidenceOverlayAdapterInputBase & {
  bailoutOverlays?: BailoutDensityOverlayRecord[] | null;
};

export type CampDeadlineOverlayAdapterInput = RouteConfidenceOverlayAdapterInputBase & {
  deadlineOverlays?: CampDeadlineOverlayRecord[] | null;
};

export type IncidentRecoveryOverlayAdapterInput = RouteConfidenceOverlayAdapterInputBase & {
  incidentOverlays?: IncidentRecoveryOverlayRecord[] | null;
};

export type RouteConfidenceTimelineOverlayAdapterBuildResult = {
  overlays: RouteConfidenceTimelineOverlay[];
  warnings: string[];
  unavailableSources: string[];
  staleSources: string[];
};

type SpanDefaults = {
  sourceType: RouteConfidenceOverlaySourceType;
  driverCategory: RouteConfidenceDriverCategory;
  defaultLabel: string;
  defaultSourceName: string;
};

type BuildResultInput<TRecord extends RouteConfidenceOverlayRecordBase> = RouteConfidenceOverlayAdapterInputBase & {
  records?: TRecord[] | null;
  defaults: SpanDefaults;
  unavailableReason: string;
  classify: (record: TRecord) => {
    label?: string | null;
    detail?: string | null;
    confidenceLevel: RouteConfidenceLevel;
    conditionState: RouteConditionState;
    impactRank?: number | null;
  };
};

function generatedAtFor(input: RouteConfidenceOverlayAdapterInputBase): string {
  return input.generatedAt ?? new Date().toISOString();
}

function isCurrentValidated(record: RouteConfidenceOverlayRecordBase): boolean {
  return record.validation === 'validated' && record.freshness === 'fresh';
}

function normalizeFreshness(
  freshness: RouteConfidenceOverlayRecordBase['freshness'],
): RouteConfidenceSourceFreshness {
  if (freshness === 'fresh' || freshness === 'stale' || freshness === 'expired' || freshness === 'unavailable') {
    return freshness;
  }
  return 'unavailable';
}

function normalizeValidation(
  validation: RouteConfidenceOverlayRecordBase['validation'],
): RouteConfidenceValidationState {
  if (
    validation === 'validated' ||
    validation === 'inferred' ||
    validation === 'unvalidated' ||
    validation === 'unknown'
  ) {
    return validation;
  }
  return 'unknown';
}

function safeId(record: RouteConfidenceOverlayRecordBase, defaults: SpanDefaults, index: number): string {
  if (record.id?.trim()) return record.id.trim();
  return `${defaults.sourceType}:${defaults.driverCategory}:${index + 1}`;
}

function clampMeasure(value: unknown, totalMeasure: number): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(totalMeasure, parsed));
}

function buildSource(
  record: RouteConfidenceOverlayRecordBase,
  defaults: SpanDefaults,
  input: RouteConfidenceOverlayAdapterInputBase,
  index: number,
): RouteConfidenceOverlaySource {
  const sourceId = record.sourceId?.trim() || `${defaults.sourceType}:${safeId(record, defaults, index)}`;
  return {
    sourceType: defaults.sourceType,
    sourceId,
    sourceName: record.sourceName?.trim() || defaults.defaultSourceName,
    observedAt: record.observedAt ?? generatedAtFor(input),
    generatedAt: record.generatedAt ?? generatedAtFor(input),
    expiresAt: record.expiresAt ?? undefined,
    freshness: normalizeFreshness(record.freshness),
    validation: normalizeValidation(record.validation),
    schemaVersion: record.schemaVersion ?? undefined,
  };
}

function buildSpan<TRecord extends RouteConfidenceOverlayRecordBase>(
  input: RouteConfidenceOverlayAdapterInputBase,
  record: TRecord,
  defaults: SpanDefaults,
  index: number,
  classify: BuildResultInput<TRecord>['classify'],
  warnings: string[],
): RouteConfidenceOverlaySpan | null {
  const totalMeasure = Number(input.totalMeasure);
  if (!Number.isFinite(totalMeasure) || totalMeasure <= 0) {
    warnings.push(`${defaults.defaultSourceName} unavailable: route measure is missing for ${input.routeId}.`);
    return null;
  }

  const start = clampMeasure(record.startMeasure, totalMeasure);
  const end = clampMeasure(record.endMeasure, totalMeasure);
  if (start == null || end == null || end <= start) {
    warnings.push(`${defaults.defaultSourceName} skipped an invalid span for ${input.routeId}.`);
    return null;
  }

  const classified = classify(record);
  const label = classified.label?.trim() || record.label?.trim() || defaults.defaultLabel;
  return {
    routeId: input.routeId,
    routeGeometryVersion: input.routeGeometryVersion,
    startMeasure: start,
    endMeasure: end,
    driverCategory: defaults.driverCategory,
    confidenceLevel: classified.confidenceLevel,
    conditionState: classified.conditionState,
    label,
    detail: classified.detail ?? record.detail ?? undefined,
    source: buildSource(record, defaults, input, index),
    impactRank: classified.impactRank ?? record.impactRank ?? undefined,
  };
}

function buildAdapterResult<TRecord extends RouteConfidenceOverlayRecordBase>(
  input: BuildResultInput<TRecord>,
): RouteConfidenceOverlayAdapterResult {
  const generatedAt = generatedAtFor(input);
  const warnings: string[] = [];
  if (!input.records || input.records.length === 0) {
    return {
      routeId: input.routeId,
      routeGeometryVersion: input.routeGeometryVersion,
      sourceType: input.defaults.sourceType,
      spans: [],
      warnings: [`${input.defaults.defaultSourceName} unavailable: ${input.unavailableReason}`],
      unavailableReason: input.unavailableReason,
      generatedAt,
    };
  }

  const spans = input.records
    .map((record, index) => buildSpan(input, record, input.defaults, index, input.classify, warnings))
    .filter((span): span is RouteConfidenceOverlaySpan => Boolean(span));

  return {
    routeId: input.routeId,
    routeGeometryVersion: input.routeGeometryVersion,
    sourceType: input.defaults.sourceType,
    spans,
    warnings: Array.from(new Set(warnings)),
    unavailableReason: spans.length > 0 ? undefined : 'No valid source-truth overlay spans were available.',
    generatedAt,
  };
}

function uncertaintyConfidence(record: RouteConfidenceOverlayRecordBase, fallback: RouteConfidenceLevel): RouteConfidenceLevel {
  return record.confidenceLevel ?? fallback;
}

function conditionFromOverride(
  record: RouteConfidenceOverlayRecordBase,
  fallback: RouteConditionState,
): RouteConditionState {
  if (record.conditionState === 'known_risky') return 'unknown';
  return record.conditionState ?? fallback;
}

export function buildLegalAccessConfidenceOverlays(
  input: LegalAccessConfidenceOverlayAdapterInput,
): RouteConfidenceOverlayAdapterResult {
  return buildAdapterResult({
    ...input,
    records: input.accessOverlays,
    unavailableReason: 'legal/access overlay source is not wired or returned no comparable spans.',
    defaults: {
      sourceType: 'route_catalog',
      driverCategory: 'legal_access',
      defaultLabel: 'Legal/access confidence',
      defaultSourceName: 'Route Catalog legal/access overlay',
    },
    classify(record) {
      if (isCurrentValidated(record) && record.accessState === 'open') {
        return {
          label: record.label,
          detail: record.detail,
          confidenceLevel: record.confidenceLevel ?? 'high',
          conditionState: conditionFromOverride(record, 'normal'),
        };
      }
      return {
        label: record.label,
        detail: record.detail,
        confidenceLevel: uncertaintyConfidence(record, record.accessState === 'restricted' ? 'low' : 'unknown'),
        conditionState: conditionFromOverride(record, 'unknown'),
      };
    },
  });
}

export function buildClosureConditionOverlays(
  input: ClosureConditionOverlayAdapterInput,
): RouteConfidenceOverlayAdapterResult {
  return buildAdapterResult({
    ...input,
    records: input.closureOverlays,
    unavailableReason: 'closure/current-condition overlay source is not wired or returned no comparable spans.',
    defaults: {
      sourceType: 'closure_condition',
      driverCategory: 'closure_current_condition',
      defaultLabel: 'Closure/current condition',
      defaultSourceName: 'Closure/current-condition overlay',
    },
    classify(record) {
      if (record.active === true && isCurrentValidated(record)) {
        return {
          label: record.label ?? 'Confirmed closure/current-condition risk',
          detail: record.detail,
          confidenceLevel: record.confidenceLevel ?? 'high',
          conditionState: 'known_risky',
        };
      }
      if (record.active === false && isCurrentValidated(record)) {
        return {
          label: record.label,
          detail: record.detail,
          confidenceLevel: record.confidenceLevel ?? 'high',
          conditionState: conditionFromOverride(record, 'normal'),
        };
      }
      return {
        label: record.label,
        detail: record.detail,
        confidenceLevel: uncertaintyConfidence(record, 'unknown'),
        conditionState: conditionFromOverride(record, 'unknown'),
      };
    },
  });
}

export function buildOfflineCoverageOverlays(
  input: OfflineCoverageOverlayAdapterInput,
): RouteConfidenceOverlayAdapterResult {
  return buildAdapterResult({
    ...input,
    records: input.coverageOverlays,
    unavailableReason: 'offline navigation coverage source is not wired or returned no comparable spans.',
    defaults: {
      sourceType: 'offline_navigation',
      driverCategory: 'offline_coverage',
      defaultLabel: 'Offline coverage',
      defaultSourceName: 'Offline Navigation coverage overlay',
    },
    classify(record) {
      if (record.coverageState === 'complete' && record.freshness === 'fresh') {
        return {
          label: record.label ?? 'Offline coverage verified',
          detail: record.detail,
          confidenceLevel: record.confidenceLevel ?? 'high',
          conditionState: conditionFromOverride(record, 'normal'),
        };
      }
      if (record.coverageState === 'partial') {
        return {
          label: record.label ?? 'Partial offline map coverage',
          detail: record.detail,
          confidenceLevel: uncertaintyConfidence(record, 'medium'),
          conditionState: conditionFromOverride(record, 'unknown'),
        };
      }
      return {
        label: record.label ?? 'Offline map gap',
        detail: record.detail,
        confidenceLevel: uncertaintyConfidence(record, record.coverageState === 'missing' ? 'low' : 'unknown'),
        conditionState: conditionFromOverride(record, 'unknown'),
      };
    },
  });
}

export function buildWeatherConfidenceOverlays(
  input: WeatherConfidenceOverlayAdapterInput,
): RouteConfidenceOverlayAdapterResult {
  return buildAdapterResult({
    ...input,
    records: input.weatherOverlays,
    unavailableReason: 'weather intelligence overlay source is not wired or returned no comparable spans.',
    defaults: {
      sourceType: 'weather_intelligence',
      driverCategory: 'terrain_weather',
      defaultLabel: 'Weather confidence',
      defaultSourceName: 'Weather Intelligence overlay',
    },
    classify(record) {
      if (record.hazardous === true && isCurrentValidated(record)) {
        return {
          label: record.label ?? 'Verified hazardous weather corridor',
          detail: record.detail,
          confidenceLevel: record.confidenceLevel ?? 'high',
          conditionState: 'known_risky',
        };
      }
      if (record.hazardous === false && isCurrentValidated(record)) {
        return {
          label: record.label ?? 'Weather source verified',
          detail: record.detail,
          confidenceLevel: record.confidenceLevel ?? 'high',
          conditionState: conditionFromOverride(record, 'normal'),
        };
      }
      return {
        label: record.label ?? 'Weather confidence uncertain',
        detail: record.detail,
        confidenceLevel: uncertaintyConfidence(record, 'unknown'),
        conditionState: conditionFromOverride(record, 'unknown'),
      };
    },
  });
}

export function buildTerrainExposureOverlays(
  input: TerrainExposureOverlayAdapterInput,
): RouteConfidenceOverlayAdapterResult {
  return buildAdapterResult({
    ...input,
    records: input.exposureOverlays,
    unavailableReason: 'terrain exposure overlay source is not wired or returned no comparable spans.',
    defaults: {
      sourceType: 'terrain_exposure',
      driverCategory: 'terrain_weather',
      defaultLabel: 'Terrain/weather exposure',
      defaultSourceName: 'Terrain exposure overlay',
    },
    classify(record) {
      if ((record.exposureLevel === 'low' || record.exposureLevel === 'moderate') && isCurrentValidated(record)) {
        return {
          label: record.label,
          detail: record.detail,
          confidenceLevel: record.confidenceLevel ?? 'medium',
          conditionState: conditionFromOverride(record, 'normal'),
        };
      }
      return {
        label: record.label ?? 'Terrain exposure uncertain',
        detail: record.detail,
        confidenceLevel: uncertaintyConfidence(record, record.exposureLevel === 'high' || record.exposureLevel === 'severe' ? 'low' : 'unknown'),
        conditionState: conditionFromOverride(record, 'unknown'),
      };
    },
  });
}

export function buildBailoutDensityOverlays(
  input: BailoutDensityOverlayAdapterInput,
): RouteConfidenceOverlayAdapterResult {
  return buildAdapterResult({
    ...input,
    records: input.bailoutOverlays,
    unavailableReason: 'bailout-density overlay source is not wired or returned no comparable spans.',
    defaults: {
      sourceType: 'bailout_density',
      driverCategory: 'bailout_density',
      defaultLabel: 'Bailout density',
      defaultSourceName: 'Bailout density overlay',
    },
    classify(record) {
      if ((record.density === 'dense' || record.density === 'adequate') && isCurrentValidated(record)) {
        return {
          label: record.label,
          detail: record.detail,
          confidenceLevel: record.confidenceLevel ?? 'high',
          conditionState: conditionFromOverride(record, 'normal'),
        };
      }
      return {
        label: record.label ?? 'Sparse bailout density',
        detail: record.detail,
        confidenceLevel: uncertaintyConfidence(record, record.density === 'sparse' ? 'low' : 'unknown'),
        conditionState: conditionFromOverride(record, 'unknown'),
      };
    },
  });
}

export function buildCampDeadlineOverlays(
  input: CampDeadlineOverlayAdapterInput,
): RouteConfidenceOverlayAdapterResult {
  return buildAdapterResult({
    ...input,
    records: input.deadlineOverlays,
    unavailableReason: 'CampOps deadline overlay source is not wired or returned no comparable spans.',
    defaults: {
      sourceType: 'campops',
      driverCategory: 'camp_deadline',
      defaultLabel: 'Camp decision deadline',
      defaultSourceName: 'CampOps deadline overlay',
    },
    classify(record) {
      return {
        label: record.label ?? 'Camp decision deadline',
        detail: record.detail ?? (record.deadlineAt ? `Camp deadline at ${record.deadlineAt}.` : null),
        confidenceLevel: uncertaintyConfidence(record, isCurrentValidated(record) ? 'medium' : 'unknown'),
        conditionState: conditionFromOverride(record, record.deadlineState === 'comfortable' ? 'normal' : 'unknown'),
      };
    },
  });
}

export function buildIncidentRecoveryOverlays(
  input: IncidentRecoveryOverlayAdapterInput,
): RouteConfidenceOverlayAdapterResult {
  return buildAdapterResult({
    ...input,
    records: input.incidentOverlays,
    unavailableReason: 'incident/recovery overlay source is not wired or returned no comparable spans.',
    defaults: {
      sourceType: 'incident_recovery',
      driverCategory: 'recovery_exposure',
      defaultLabel: 'Incident/recovery exposure',
      defaultSourceName: 'Incident & Recovery overlay',
    },
    classify(record) {
      if (record.active === true && isCurrentValidated(record)) {
        return {
          label: record.label ?? 'Active validated incident/recovery zone',
          detail: record.detail,
          confidenceLevel: record.confidenceLevel ?? 'high',
          conditionState: 'known_risky',
        };
      }
      if (record.active === false && isCurrentValidated(record)) {
        return {
          label: record.label,
          detail: record.detail,
          confidenceLevel: record.confidenceLevel ?? 'high',
          conditionState: conditionFromOverride(record, 'normal'),
        };
      }
      return {
        label: record.label,
        detail: record.detail,
        confidenceLevel: uncertaintyConfidence(record, 'unknown'),
        conditionState: conditionFromOverride(record, 'unknown'),
      };
    },
  });
}

function sourceLabel(sourceType: RouteConfidenceOverlaySourceType): string {
  return sourceType.replace(/_/g, ' ');
}

export function buildRouteConfidenceTimelineOverlaysFromAdapterResults(
  results: RouteConfidenceOverlayAdapterResult[] | null | undefined,
): RouteConfidenceTimelineOverlayAdapterBuildResult {
  const warnings: string[] = [];
  const unavailableSources: string[] = [];
  const staleSources: string[] = [];
  const overlays: RouteConfidenceTimelineOverlay[] = [];

  (results ?? []).forEach((result) => {
    result.warnings.forEach((warning) => warnings.push(warning));
    if (result.unavailableReason) {
      warnings.push(`${sourceLabel(result.sourceType)} unavailable: ${result.unavailableReason}`);
      unavailableSources.push(result.sourceType);
    }
    result.spans.forEach((span, index) => {
      const sourceId = span.source.sourceId ?? `${span.source.sourceType}:${index + 1}`;
      if (span.source.freshness === 'unavailable') unavailableSources.push(span.source.sourceType);
      if (span.source.freshness === 'stale' || span.source.freshness === 'expired') {
        staleSources.push(span.source.sourceName ?? sourceLabel(span.source.sourceType));
      }
      overlays.push({
        id: `${span.source.sourceType}:${span.driverCategory}:${sourceId}:${Math.round(span.startMeasure)}-${Math.round(span.endMeasure)}`,
        routeId: span.routeId,
        routeGeometryVersion: span.routeGeometryVersion,
        startMeasure: span.startMeasure,
        endMeasure: span.endMeasure,
        label: span.label,
        confidenceLevel: span.confidenceLevel,
        conditionState: span.conditionState,
        driverCategory: span.driverCategory,
        detail: span.detail ?? null,
        impactRank: span.impactRank ?? null,
        source: {
          id: sourceId,
          label: span.source.sourceName ?? sourceLabel(span.source.sourceType),
          sourceType: span.source.sourceType,
          observedAt: span.source.observedAt ?? result.generatedAt,
          generatedAt: span.source.generatedAt ?? result.generatedAt,
          expiresAt: span.source.expiresAt ?? null,
          freshness: span.source.freshness,
          validation: span.source.validation,
          schemaVersion: span.source.schemaVersion ?? null,
          detail: span.detail ?? null,
        },
      });
    });
  });

  return {
    overlays,
    warnings: Array.from(new Set(warnings)),
    unavailableSources: Array.from(new Set(unavailableSources)),
    staleSources: Array.from(new Set(staleSources)),
  };
}
