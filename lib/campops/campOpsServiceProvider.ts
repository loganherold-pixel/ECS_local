import type {
  CampCandidate,
  CampOpsConfidence,
  CampOpsDataSource,
  CampOpsGeoPoint,
  CampOpsServiceAvailability,
  CampOpsServiceFreshness,
  CampOpsServiceOperatingHours,
  CampOpsServiceStatus,
  CampOpsServiceType,
  CampSearchContext,
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

export const CAMP_OPS_SERVICE_PROVIDER_ID = 'campops.fixture_service_resupply';

export type CampOpsServiceRecord = {
  candidateId?: string | null;
  providerId?: string | null;
  providerDisplayName?: string | null;
  serviceType: CampOpsServiceType;
  name: string;
  location?: CampOpsGeoPoint | null;
  distanceFromCampMiles?: number | null;
  distanceFromRouteMiles?: number | null;
  routeAwareDistanceMiles?: number | null;
  confidence: CampOpsConfidence;
  source: CampOpsDataSource;
  observedAtIso?: string | null;
  staleAfterMinutes?: number | null;
  operatingHours?: CampOpsServiceOperatingHours | null;
  status?: CampOpsServiceStatus | null;
  sourceSummary?: string | null;
  rawProviderStatus?: CampOpsProviderRawStatus;
  warnings?: string[];
  missingDataReason?: string | null;
};

export type CampOpsServiceSourceProviderOptions = {
  id?: string;
  displayName?: string;
  sourceConfidence?: CampOpsConfidence;
  staleAfterMinutes?: number | null;
  records?: CampOpsServiceRecord[];
  recordsByCandidateId?: Record<string, CampOpsServiceRecord[] | undefined>;
};

function finiteNumber(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function distanceFor(record: Pick<CampOpsServiceRecord, 'routeAwareDistanceMiles' | 'distanceFromCampMiles' | 'distanceFromRouteMiles'>): number | null {
  return (
    finiteNumber(record.routeAwareDistanceMiles) ??
    finiteNumber(record.distanceFromCampMiles) ??
    finiteNumber(record.distanceFromRouteMiles)
  );
}

function latestTimestamp(records: CampOpsServiceRecord[]): string | null {
  const timestamps = records
    .map((record) => record.observedAtIso)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => Date.parse(right) - Date.parse(left));
  return timestamps[0] ?? null;
}

function freshnessForRecords(
  records: CampOpsServiceRecord[],
  currentTimeIso: string,
  fallbackStaleAfterMinutes: number | null | undefined,
): CampOpsSourceFreshness {
  if (records.length === 0) return 'missing';
  let sawTimestamp = false;
  for (const record of records) {
    if (!record.observedAtIso) continue;
    sawTimestamp = true;
    const staleAfterMinutes = record.staleAfterMinutes ?? fallbackStaleAfterMinutes ?? null;
    if (isCampOpsSourceSignalStale({ observedAtIso: record.observedAtIso, staleAfterMinutes }, currentTimeIso)) {
      return 'stale';
    }
  }
  return sawTimestamp ? 'fresh' : 'unknown';
}

function serviceFreshnessForRecord(
  record: CampOpsServiceRecord,
  currentTimeIso: string,
  fallbackStaleAfterMinutes: number | null | undefined,
): CampOpsServiceFreshness {
  if (!record.observedAtIso) return 'unknown';
  const staleAfterMinutes = record.staleAfterMinutes ?? fallbackStaleAfterMinutes ?? null;
  return isCampOpsSourceSignalStale({ observedAtIso: record.observedAtIso, staleAfterMinutes }, currentTimeIso)
    ? 'stale'
    : 'fresh';
}

function toAvailability(
  record: CampOpsServiceRecord,
  currentTimeIso: string,
  fallbackStaleAfterMinutes: number | null | undefined,
): CampOpsServiceAvailability {
  return {
    serviceType: record.serviceType,
    name: record.name,
    location: record.location ?? null,
    distanceFromCampMiles: finiteNumber(record.distanceFromCampMiles),
    distanceFromRouteMiles: finiteNumber(record.distanceFromRouteMiles),
    routeAwareDistanceMiles: finiteNumber(record.routeAwareDistanceMiles),
    confidence: record.confidence,
    freshness: serviceFreshnessForRecord(record, currentTimeIso, fallbackStaleAfterMinutes),
    observedAtIso: record.observedAtIso ?? null,
    operatingHours: record.operatingHours ?? null,
    status: record.status ?? 'unknown',
    sourceSummary: record.sourceSummary ?? serviceSummary(record),
  };
}

function serviceSummary(record: Pick<CampOpsServiceRecord, 'serviceType' | 'name' | 'status' | 'routeAwareDistanceMiles' | 'distanceFromCampMiles' | 'distanceFromRouteMiles'>): string {
  const distance = distanceFor(record);
  const distanceText = distance == null ? 'distance unknown' : `${Math.round(distance * 10) / 10} mi`;
  return `${record.name} (${record.serviceType.replace(/_/g, ' ')}, ${record.status ?? 'unknown'} status, ${distanceText})`;
}

function serviceSort(left: CampOpsServiceAvailability, right: CampOpsServiceAvailability): number {
  const leftDistance = distanceFor(left) ?? Number.POSITIVE_INFINITY;
  const rightDistance = distanceFor(right) ?? Number.POSITIVE_INFINITY;
  const statusScore = (service: CampOpsServiceAvailability) =>
    service.status === 'open' ? 0 : service.status === 'unknown' ? 1 : 2;
  const statusDelta = statusScore(left) - statusScore(right);
  return statusDelta !== 0 ? statusDelta : leftDistance - rightDistance;
}

function nearestService(
  services: CampOpsServiceAvailability[],
  types: CampOpsServiceType[],
): CampOpsServiceAvailability | null {
  return services
    .filter((service) => types.includes(service.serviceType))
    .sort(serviceSort)[0] ?? null;
}

function isUsableService(service: CampOpsServiceAvailability | null): service is CampOpsServiceAvailability {
  return Boolean(service) && service?.status !== 'closed';
}

function bestDistance(...services: Array<CampOpsServiceAvailability | null>): number | null {
  const distances = services
    .filter(isUsableService)
    .map(distanceFor)
    .filter((distance): distance is number => distance != null);
  return distances.length > 0 ? Math.min(...distances) : null;
}

function statusLimitations(services: CampOpsServiceAvailability[]): string[] {
  return services.flatMap((service) => {
    const limitations: string[] = [];
    if (service.status === 'unknown') limitations.push(`${service.name}: service open status unknown.`);
    if (!service.operatingHours?.summary) limitations.push(`${service.name}: operating hours unknown.`);
    if (service.freshness === 'stale') limitations.push(`${service.name}: service source is stale.`);
    return limitations;
  });
}

function confidenceForServices(services: CampOpsServiceAvailability[]): CampOpsConfidence {
  if (services.length === 0) return 'unknown';
  const rank: Record<CampOpsConfidence, number> = { unknown: 0, low: 1, medium: 2, high: 3 };
  return services.reduce<CampOpsConfidence>((lowest, service) => (
    rank[service.confidence] < rank[lowest] ? service.confidence : lowest
  ), services[0].confidence);
}

export function campOpsServiceRecordsToSourceSignal({
  records,
  currentTimeIso,
  context,
  staleAfterMinutes,
  stale = false,
}: {
  records: CampOpsServiceRecord[];
  currentTimeIso: string;
  context?: CampSearchContext;
  staleAfterMinutes?: number | null;
  stale?: boolean;
}): CampOpsExternalSourceSignal {
  const services = stale
    ? []
    : records.map((record) => toAvailability(record, currentTimeIso, staleAfterMinutes));
  const nearestFuel = nearestService(services, ['fuel']);
  const nearestWater = nearestService(services, ['potable_water', 'developed_campground', 'town_exit']);
  const nearestPropane = nearestService(services, ['propane']);
  const nearestDump = nearestService(services, ['dump_station', 'developed_campground']);
  const nearestRepair = nearestService(services, ['mechanic_repair', 'tire_service']);
  const nearestTownOrExit = nearestService(services, ['town_exit']);
  const reliableWaterRefillAvailable =
    nearestWater?.status === 'open'
      ? true
      : nearestWater?.status === 'closed'
        ? false
        : nearestWater
          ? null
          : undefined;

  const source = records[0]?.source ?? 'unknown';
  const confidence = stale ? 'low' : confidenceForServices(services);
  const nearestFuelOrExitDistance = bestDistance(nearestFuel, nearestTownOrExit);
  const fuelReserveMiles = finiteNumber(context?.resourceState?.fuelReserveMiles ?? context?.resourceState?.fuelRangeMiles);
  const fuelExitMarginMiles =
    !stale && fuelReserveMiles != null && nearestFuelOrExitDistance != null
      ? Math.max(0, fuelReserveMiles - nearestFuelOrExitDistance)
      : null;
  const dataLimitations = [
    ...(services.length > 0
      ? [`Service source: ${services.map((service) => service.sourceSummary ?? serviceSummary(service)).join('; ')}`]
      : ['Service source did not provide usable current services.']),
    ...(stale ? ['Stale service source retained as uncertainty, not current service availability.'] : []),
    ...statusLimitations(services),
    ...records.flatMap((record) => record.missingDataReason ? [record.missingDataReason] : []),
  ];

  return {
    source,
    confidence,
    observedAtIso: latestTimestamp(records),
    staleAfterMinutes: staleAfterMinutes ?? records[0]?.staleAfterMinutes ?? null,
    nearestFuel,
    nearestWater,
    nearestPropane,
    nearestDump,
    nearestRepair,
    nearestTownOrExit,
    fuelImpact: fuelExitMarginMiles == null
      ? null
      : {
          value: fuelExitMarginMiles,
          unit: 'miles',
          impact: fuelExitMarginMiles >= 50 ? 'positive' : fuelExitMarginMiles >= 25 ? 'watch' : 'critical',
          confidence,
        },
    reliableWaterRefillAvailable,
    serviceDistanceMiles: bestDistance(nearestFuel, nearestWater, nearestPropane, nearestDump, nearestRepair, nearestTownOrExit),
    exitDistanceMiles: bestDistance(nearestTownOrExit),
    recoveryFriendly:
      nearestRepair?.status === 'open' && (distanceFor(nearestRepair) ?? Number.POSITIVE_INFINITY) <= 30
        ? true
        : undefined,
    dataLimitations,
  };
}

function recordsForCandidate(
  candidate: CampCandidate,
  options: CampOpsServiceSourceProviderOptions,
): CampOpsServiceRecord[] {
  return options.recordsByCandidateId?.[candidate.id] ?? options.records?.filter((record) => record.candidateId === candidate.id) ?? [];
}

export class CampOpsServiceSourceProvider implements CampOpsSourceProvider {
  readonly id: string;
  readonly displayName: string;
  readonly sourceCategory = 'service' as const;
  readonly sourceConfidence: CampOpsConfidence;
  readonly staleAfterMinutes?: number | null;

  constructor(private readonly options: CampOpsServiceSourceProviderOptions = {}) {
    this.id = options.id ?? CAMP_OPS_SERVICE_PROVIDER_ID;
    this.displayName = options.displayName ?? 'CampOps service/resupply fixture provider';
    this.sourceConfidence = options.sourceConfidence ?? 'medium';
    this.staleAfterMinutes = options.staleAfterMinutes ?? 24 * 60;
  }

  collectSignals({ context, candidates, currentTimeIso }: CampOpsSourceProviderRequest): CampOpsSourceProviderResult[] {
    return candidates.map((candidate) => {
      const records = recordsForCandidate(candidate, this.options);
      if (records.length === 0) {
        return {
          candidateId: candidate.id,
          providerId: this.id,
          providerDisplayName: this.displayName,
          sourceCategory: 'service',
          sourceConfidence: this.sourceConfidence,
          sourceFreshness: 'missing',
          sourceTimestampIso: null,
          rawProviderStatus: { status: 'missing', serviceCount: 0, serviceTypes: '' },
          signal: null,
          warnings: [],
          errors: [],
          missingDataReason: 'No service/resupply record matched this camp candidate.',
        };
      }

      const freshness = freshnessForRecords(records, currentTimeIso, this.staleAfterMinutes);
      const signal = campOpsServiceRecordsToSourceSignal({
        records: records.map((record) => ({
          ...record,
          staleAfterMinutes: record.staleAfterMinutes ?? this.staleAfterMinutes ?? null,
        })),
        currentTimeIso,
        context,
        staleAfterMinutes: this.staleAfterMinutes,
        stale: freshness === 'stale',
      });
      return {
        candidateId: candidate.id,
        providerId: records[0]?.providerId ?? this.id,
        providerDisplayName: records[0]?.providerDisplayName ?? this.displayName,
        sourceCategory: 'service',
        sourceConfidence: freshness === 'stale' ? 'low' : signal.confidence,
        sourceFreshness: freshness,
        sourceTimestampIso: latestTimestamp(records),
        rawProviderStatus: {
          status: 'ok',
          serviceCount: records.length,
          serviceTypes: Array.from(new Set(records.map((record) => record.serviceType))).join(','),
        },
        signal,
        warnings: records.flatMap((record) => record.warnings ?? []),
        errors: [],
        missingDataReason: records.every((record) => record.missingDataReason)
          ? records.map((record) => record.missingDataReason).filter(Boolean).join('; ')
          : null,
      };
    });
  }
}
