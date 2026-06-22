import { Platform } from 'react-native';
import { fsEnsureDir, fsGetInfo, fsReadString, fsWriteString, getDocumentDirectory } from '../fsCompat';
import { getReadinessDecisionLabel } from '../readiness/expeditionReadinessCopy';
import type {
  ExpeditionReadinessAssessment,
  ExpeditionReadinessCategory,
  ExpeditionReadinessCategoryId,
  ExpeditionReadinessFreshnessRecord,
  ExpeditionReadinessVehicleInput,
} from '../readiness/expeditionReadinessTypes';
import type {
  CommandBriefExportAction,
  CommandBriefExportContext,
  CommandBriefExportResult,
  CommandBriefPacket,
  CommandBriefPacketOptions,
  CommandBriefPdfArtifact,
  ECSCommandBriefCoordinate,
  ECSCommandBriefPacket,
  ECSCommandBriefPacketSource,
  ECSCommandBriefPacketStatus,
} from './commandBriefTypes';

const COMMAND_BRIEF_PACKET_DIR = 'ECS/CommandBriefPackets/';
const COMMAND_BRIEF_DISCLAIMER =
  'This Command Brief packet is confidence-based and generated from available ECS data. It may be stale after export. It is not a distress signal, is not automatically sent to emergency services, and does not replace contacting emergency services, recovery professionals, local authorities, or trusted contacts. Verify official closures, route, weather, land-use rules, campsite access requirements, and emergency guidance independently when safety-critical.';
const NOT_AVAILABLE = 'Not available';
const NOT_PROVIDED = 'Not provided';

const CATEGORY_LABELS: Record<ExpeditionReadinessCategoryId, string> = {
  vehicle_fit: 'Vehicle Fit',
  route_risk: 'Route Intelligence',
  camp_legality_confidence: 'Camp Legality Confidence',
  weather_window: 'Weather Window',
  daylight_margin: 'Daylight Margin',
  offline_preparedness: 'Offline Preparedness',
  fuel_range_margin: 'Fuel / Range Margin',
  power_runtime: 'Power Runtime',
  recovery_bailout_access: 'Recovery / Bailout',
  communications_signal_confidence: 'Communications / Signal',
};

function categoryMap(assessment: ExpeditionReadinessAssessment | null) {
  const map = new Map<ExpeditionReadinessCategoryId, ExpeditionReadinessCategory>();
  assessment?.categories.forEach((category) => map.set(category.id, category));
  return map;
}

function titleCaseStatus(value: string | null | undefined) {
  if (!value) return 'Unknown';
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function cleanPacketCopy(value: string) {
  return value
    .replace(/\blegal campsite\b/gi, 'camp access confidence')
    .replace(/\bguaranteed safe\b/gi, 'confidence-based')
    .replace(/\bsafe route\b/gi, 'readiness-reviewed route')
    .replace(/\bAI says\b/gi, 'ECS Intelligence indicates')
    .trim();
}

function markdownList(items: string[], fallback: string, maxItems = 6) {
  const visible = items.map(cleanPacketCopy).filter(Boolean).slice(0, maxItems);
  if (visible.length === 0) return `- ${fallback}`;
  return visible.map((item) => `- ${item}`).join('\n');
}

function formatFreshness(record: ExpeditionReadinessFreshnessRecord | undefined) {
  if (!record) return 'Unavailable / limited confidence.';
  const tags = [
    titleCaseStatus(record.state),
    record.isStale ? 'stale' : null,
    record.isMissing ? 'missing' : null,
    record.isInferred ? 'ECS-inferred' : null,
    record.isDemo ? 'demo' : null,
    record.isMock ? 'mock' : null,
  ].filter(Boolean);
  const updated = record.updatedAt ? ` Updated ${record.updatedAt}.` : '';
  const detail = record.detail ? ` ${cleanPacketCopy(record.detail)}` : '';
  return `${tags.join(', ')}.${updated}${detail}`;
}

function uniqueClean(values: readonly (string | null | undefined)[]) {
  const output: string[] = [];
  values.forEach((value) => {
    const cleaned = value ? cleanPacketCopy(value) : '';
    if (cleaned && !output.includes(cleaned)) output.push(cleaned);
  });
  return output;
}

function sentenceList(values: readonly (string | null | undefined)[], maxItems = 3) {
  const items = uniqueClean(values);
  if (items.length === 0) return '';
  if (items.length <= maxItems) return items.join(', ');
  return `${items.slice(0, maxItems).join(', ')}, and ${items.length - maxItems} more`;
}

function confidenceLabel(confidence: ExpeditionReadinessAssessment['confidence']) {
  if (confidence === 'high') return 'strong';
  if (confidence === 'medium') return 'moderate';
  return 'limited';
}

function confidenceReason(assessment: ExpeditionReadinessAssessment) {
  const freshnessGaps = Object.values(assessment.sourceFreshness)
    .filter((record) => record.isMissing || record.isStale || record.isInferred || record.isDemo || record.isMock)
    .map((record) => record.label);
  const missingInputs = assessment.categories.flatMap((category) => category.missingInputs);
  const drivers = [
    freshnessGaps.length
      ? `${sentenceList(freshnessGaps)} ${freshnessGaps.length === 1 ? 'is' : 'are'} missing, stale, inferred, demo, or mock`
      : null,
    missingInputs.length ? `missing inputs include ${sentenceList(missingInputs)}` : null,
  ].filter(Boolean);

  if (drivers.length === 0) {
    if (assessment.confidence === 'low') {
      return 'Confidence is limited because the underlying readiness categories are still low-confidence, even though no single stale or missing source is called out in this packet.';
    }
    return `Confidence is ${confidenceLabel(assessment.confidence)} because the available route, vehicle, weather, offline, recovery, and communications inputs are current enough for this packet.`;
  }
  return `Confidence is ${confidenceLabel(assessment.confidence)} because ${drivers.join('; ')}.`;
}

function readinessMeaning(assessment: ExpeditionReadinessAssessment) {
  if (assessment.status === 'ready') {
    return 'Field read: this route looks departure-ready from current ECS inputs; keep weather, route, and offline sources fresh before leaving.';
  }
  if (assessment.status === 'caution') {
    const concern = assessment.warnings[0] ?? assessment.blockers[0] ?? null;
    return `Field read: this route is still workable, but ECS sees prep items to review${concern ? `, led by ${cleanPacketCopy(concern.detail)}` : ''}.`;
  }
  const blocker = assessment.blockers[0] ?? null;
  return `Field read: hold departure until the blocking item is resolved${blocker ? `: ${cleanPacketCopy(blocker.detail)}` : '.'}`;
}

function formatReadinessDecision(assessment: ExpeditionReadinessAssessment | null) {
  if (!assessment) return 'Unavailable / limited confidence. No readiness assessment is currently active.';
  return [
    `${getReadinessDecisionLabel(assessment.status)} - ${assessment.overallScore}/100.`,
    'The score is a readiness posture, not a confidence grade.',
    confidenceReason(assessment),
    readinessMeaning(assessment),
  ].join(' ');
}

function isGenericCategorySummary(value: string) {
  return /does not show a major blocker|confidence is workable|is workable|usable, not guaranteed|appears prepared/i.test(value);
}

function usefulFactorDetails(category: ExpeditionReadinessCategory, maxItems = 2) {
  return uniqueClean(
    category.factors
      .map((factor) => factor.detail)
      .filter((detail) => detail && !isGenericCategorySummary(detail) && !/^(low|medium|moderate|high|critical|unknown|ready|caution|hold)$/i.test(detail.trim())),
  ).slice(0, maxItems);
}

function categoryDataNote(category: ExpeditionReadinessCategory) {
  const parts = [
    category.confidence !== 'high' ? `confidence is ${confidenceLabel(category.confidence)}` : null,
    category.missingInputs.length ? `missing ${sentenceList(category.missingInputs)}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join('; ') : null;
}

function categoryNarrative(category: ExpeditionReadinessCategory) {
  const summary = cleanPacketCopy(category.summary);
  const factorDetails = usefulFactorDetails(category);
  if (!isGenericCategorySummary(summary)) {
    return [summary, ...factorDetails].join(' ');
  }

  if (category.status === 'hold') {
    return `${CATEGORY_LABELS[category.id]} needs a stop-and-review before departure.${factorDetails.length ? ` ${factorDetails.join(' ')}` : ''}`;
  }
  if (category.status === 'caution') {
    return `${CATEGORY_LABELS[category.id]} needs attention before departure.${factorDetails.length ? ` ${factorDetails.join(' ')}` : ''}`;
  }
  return `${CATEGORY_LABELS[category.id]} looks workable from current ECS inputs.${factorDetails.length ? ` ${factorDetails.join(' ')}` : ''}`;
}

function formatCategory(category: ExpeditionReadinessCategory | undefined, label: string) {
  if (!category) {
    return [
      `### ${label}`,
      'Field read: Unavailable / limited confidence.',
      'What it means: ECS does not have enough grounded data for this section.',
    ].join('\n');
  }

  const dataNote = categoryDataNote(category);
  return [
    `### ${label}`,
    `Field read: ${getReadinessDecisionLabel(category.status)}.`,
    `What it means: ${categoryNarrative(category)}`,
    dataNote ? `Data note: ${dataNote}.` : null,
  ].filter(Boolean).join('\n');
}

function combinedCategoryLine(category: ExpeditionReadinessCategory | undefined, id: ExpeditionReadinessCategoryId) {
  if (!category) return `${CATEGORY_LABELS[id]}: unavailable / limited confidence.`;
  const dataNote = categoryDataNote(category);
  return [
    `${CATEGORY_LABELS[id]}: ${categoryNarrative(category)}`,
    dataNote ? `Data note: ${dataNote}.` : null,
  ].filter(Boolean).join(' ');
}

function formatCombinedCategories(
  categories: Map<ExpeditionReadinessCategoryId, ExpeditionReadinessCategory>,
  ids: ExpeditionReadinessCategoryId[],
  label: string,
  extraLines: string[] = [],
) {
  const lines = [`### ${label}`];
  ids.forEach((id) => {
    lines.push(`- ${combinedCategoryLine(categories.get(id), id)}`);
  });
  extraLines.map(cleanPacketCopy).filter(Boolean).forEach((line) => lines.push(`- ${line}`));
  return lines.join('\n');
}

function weatherNarrative(category: ExpeditionReadinessCategory | undefined) {
  if (!category) return 'Weather data is unavailable in this packet; refresh the forecast before departure.';
  const details = usefulFactorDetails(category).join(' ');
  const note = categoryDataNote(category);
  const base = category.status === 'ready'
    ? 'Weather looks workable for this plan. No severe weather blocker is attached to the available forecast.'
    : category.status === 'caution'
      ? `Weather needs attention before departure. ${isGenericCategorySummary(category.summary) ? 'Review the forecast window before committing.' : cleanPacketCopy(category.summary)}`
      : `Weather needs a stop-and-review before departure. ${cleanPacketCopy(category.summary)}`;
  return [base, details, note ? `Data note: ${note}.` : null].filter(Boolean).join(' ');
}

function daylightNarrative(category: ExpeditionReadinessCategory | undefined) {
  if (!category) return 'Daylight data is unavailable; confirm arrival and setup light manually.';
  const details = usefulFactorDetails(category).join(' ');
  const note = categoryDataNote(category);
  const base = category.status === 'ready'
    ? 'Daylight looks workable for the arrival window.'
    : category.status === 'caution'
      ? `Daylight needs attention. ${isGenericCategorySummary(category.summary) ? 'Arrival light is narrowing; confirm timing before departure.' : cleanPacketCopy(category.summary)}`
      : `Daylight needs a stop-and-review. ${cleanPacketCopy(category.summary)}`;
  return [base, details, note ? `Data note: ${note}.` : null].filter(Boolean).join(' ');
}

function formatWeatherDaylightSummary(categories: Map<ExpeditionReadinessCategoryId, ExpeditionReadinessCategory>) {
  return [
    '### Weather / Daylight Summary',
    `- Weather: ${weatherNarrative(categories.get('weather_window'))}`,
    `- Daylight: ${daylightNarrative(categories.get('daylight_margin'))}`,
  ].join('\n');
}

function communicationsNarrative(category: ExpeditionReadinessCategory | undefined) {
  if (!category) {
    return 'Communications data is unavailable; set a check-in plan and carry offline route details before departure.';
  }
  const details = usefulFactorDetails(category).join(' ');
  const note = categoryDataNote(category);
  const base = category.status === 'ready'
    ? 'Signal and communications look covered from available inputs. Keep offline maps ready for weaker service or dead-zone miles.'
    : category.status === 'caution'
      ? `Signal and communications need attention. ${isGenericCategorySummary(category.summary) ? 'Confirm satellite, radio, or team check-in coverage before departure.' : cleanPacketCopy(category.summary)}`
      : `Communications need a stop-and-review before departure. ${cleanPacketCopy(category.summary)}`;
  return [base, details, note ? `Data note: ${note}.` : null].filter(Boolean).join(' ');
}

function formatCommunicationsSummary(category: ExpeditionReadinessCategory | undefined) {
  return [
    '### Communications / Signal Confidence',
    `Field read: ${category ? getReadinessDecisionLabel(category.status) : 'Unavailable / limited confidence'}.`,
    `What it means: ${communicationsNarrative(category)}`,
  ].join('\n');
}

function formatVehicle(vehicle: ExpeditionReadinessVehicleInput | null | undefined) {
  if (!vehicle) return 'Unavailable / limited confidence. Select an active Fleet vehicle before departure.';
  const name = vehicle.label
    ?? [vehicle.make, vehicle.model, vehicle.submodel].filter(Boolean).join(' ')
    ?? 'Active vehicle';
  const specs = [
    vehicle.vehicleType ?? vehicle.classificationLabel ?? null,
    vehicle.drivetrain ? `drivetrain ${vehicle.drivetrain}` : null,
    typeof vehicle.groundClearanceInches === 'number' ? `${vehicle.groundClearanceInches}" clearance` : null,
    typeof vehicle.gvwrUsagePct === 'number' ? `${Math.round(vehicle.gvwrUsagePct)}% GVWR usage` : null,
    typeof vehicle.payloadRemainingLbs === 'number' ? `${Math.round(vehicle.payloadRemainingLbs)} lb payload margin` : null,
    typeof vehicle.fuelRangeMiles === 'number' ? `${vehicle.fuelRangeMiles} mi estimated range` : null,
    typeof vehicle.fuelCapacityGal === 'number' ? `${vehicle.fuelCapacityGal} gal fuel capacity` : null,
  ].filter(Boolean);
  const confidence = vehicle.vehicleFitConfidence ? ` Confidence ${vehicle.vehicleFitConfidence}.` : '';
  const missing = vehicle.missingSpecs?.length
    ? ` Missing specs: ${vehicle.missingSpecs.map(cleanPacketCopy).join(', ')}.`
    : '';
  return `${cleanPacketCopy(name)}${specs.length ? ` - ${specs.join(', ')}` : ''}.${confidence}${missing}`;
}

function formatRouteSummary(context: CommandBriefExportContext) {
  const title = context.routeName ?? context.tripName ?? context.assessment?.recoveryBrief.activeRouteLabel ?? null;
  const summary = context.routeSummary ? cleanPacketCopy(context.routeSummary) : null;
  if (!title && !summary) {
    return 'Unavailable / limited confidence. No route summary is present in readiness context.';
  }
  return [title ? cleanPacketCopy(title) : null, summary].filter(Boolean).join('\n');
}

function formatWeakPointAssessment(context: CommandBriefExportContext) {
  const assessment = context.weakPointAssessment;
  if (!assessment) {
    return 'Unavailable / limited confidence. ECS could not build a Weak Point Analyzer snapshot for this packet. Refresh Command Brief after route, vehicle, and readiness inputs finish syncing.';
  }
  const ranked = assessment.rankedWeakPoints.slice(0, 3);
  const rankLines = ranked.map((point) => [
    `- ${point.rank}. ${point.label} (${point.riskScore.toFixed(2)}/5): ${point.consequenceStatement}`,
    `Pre-trip move: ${point.easiestPreDepartureFix}`,
    `Watch underway: ${point.travelMonitorSignal}`,
  ].join(' '));
  const missing = assessment.missingData.length
    ? `Data caveat: ${sentenceList(assessment.missingData, 4)}.`
    : null;
  const lines = [
    'Advisory only. Deterministic ECS ranking from current route, vehicle, resource, weather, offline, camp, recovery, and communications inputs.',
    'Top likely failure points (max 3):',
    ...(rankLines.length ? rankLines : ['- No likely failure point could be ranked from the current snapshot.']),
    missing,
    `Assessment completeness: ${assessment.assessmentCompleteness.replace(/_/g, ' ')}.`,
  ].filter(Boolean);
  return lines.map((line) => cleanPacketCopy(String(line))).join('\n');
}

function compactStrings(values: readonly (string | null | undefined)[], maxItems = 8) {
  return uniqueClean(values).slice(0, maxItems);
}

function displayValue(value: string | number | boolean | null | undefined, fallback = NOT_AVAILABLE) {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : fallback;
  const text = value ? cleanPacketCopy(String(value)) : '';
  return text || fallback;
}

function packetId(generatedAt: string, context: CommandBriefExportContext) {
  const seed = [
    context.activeTripId,
    context.activeRouteId,
    context.routeName,
    context.tripName,
    generatedAt,
  ].filter(Boolean).join('-') || generatedAt;
  return `ecs-command-brief-${seed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72)}`;
}

function readinessDecisionForPacket(assessment: ExpeditionReadinessAssessment | null): ECSCommandBriefPacket['readinessSummary']['decision'] {
  if (!assessment) return 'UNKNOWN';
  if (assessment.status === 'ready') return 'GO';
  if (assessment.status === 'caution') return 'CAUTION';
  if (assessment.status === 'hold') return 'HOLD';
  return 'UNKNOWN';
}

function sourceForPacket(context: CommandBriefExportContext): ECSCommandBriefPacketSource {
  if (context.packetSource) return context.packetSource;
  if (context.convoyName || typeof context.convoyMemberCount === 'number') return 'convoy';
  if (context.activeRouteId || context.assessment?.recoveryBrief.activeRouteLabel) return 'active_guidance';
  if (context.activeTripId || context.tripName || context.routeName) return 'planned_trip';
  return 'manual';
}

function packetLabelForSource(source: ECSCommandBriefPacketSource): ECSCommandBriefPacket['packetMetadata']['packetLabel'] {
  if (source === 'active_guidance') return 'Active Guidance Packet';
  if (source === 'planned_trip') return 'Planned Trip Packet';
  if (source === 'convoy') return 'Convoy Packet';
  return 'Manual Packet';
}

function statusForPacket(context: CommandBriefExportContext): ECSCommandBriefPacketStatus {
  if (context.packetStatus) return context.packetStatus;
  const assessment = context.assessment;
  if (!assessment) return 'draft';
  const hasStaleSource = Object.values(assessment.sourceFreshness)
    .some((record) => record.isStale || record.isMissing || record.isDemo || record.isMock);
  return hasStaleSource ? 'stale' : 'active';
}

function coordinateLine(coordinate: ECSCommandBriefCoordinate | null | undefined) {
  if (!coordinate) return NOT_AVAILABLE;
  const accuracy = typeof coordinate.accuracyMeters === 'number'
    ? `, accuracy ${Math.round(coordinate.accuracyMeters)} m`
    : '';
  return `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}${accuracy}`;
}

function recoveryCoordinate(context: CommandBriefExportContext): ECSCommandBriefCoordinate | null {
  if (context.currentGps) return context.currentGps;
  const coordinate = context.assessment?.recoveryBrief.currentCoordinates;
  if (!coordinate) return null;
  return {
    label: 'Current GPS at packet generation',
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    accuracyMeters: coordinate.accuracyMeters ?? null,
    source: 'readiness_recovery_brief',
  };
}

function vehicleProfileName(vehicle: ExpeditionReadinessVehicleInput | null | undefined) {
  if (!vehicle) return null;
  return vehicle.label
    ?? [vehicle.make, vehicle.model, vehicle.submodel].filter(Boolean).join(' ')
    ?? null;
}

function vehicleYearMakeModel(vehicle: ExpeditionReadinessVehicleInput | null | undefined) {
  if (!vehicle) return null;
  const year = (vehicle as any).year ?? (vehicle as any).modelYear ?? null;
  const value = [year, vehicle.make, vehicle.model, vehicle.submodel].filter(Boolean).join(' ');
  return value || null;
}

function explicitVehicleString(vehicle: ExpeditionReadinessVehicleInput | null | undefined, keys: string[]) {
  if (!vehicle) return null;
  for (const key of keys) {
    const value = (vehicle as any)[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function vehicleTireSize(vehicle: ExpeditionReadinessVehicleInput | null | undefined) {
  if (!vehicle) return null;
  const explicit = explicitVehicleString(vehicle, ['tireSize', 'tireLabel']);
  if (explicit) return explicit;
  return typeof vehicle.tireSizeInches === 'number' ? `${vehicle.tireSizeInches} in tires` : null;
}

function vehicleFuelRange(vehicle: ExpeditionReadinessVehicleInput | null | undefined) {
  if (!vehicle) return null;
  const values = [
    typeof vehicle.fuelRangeMiles === 'number' ? `${vehicle.fuelRangeMiles} mi estimated range` : null,
    typeof vehicle.fuelCapacityGal === 'number' ? `${vehicle.fuelCapacityGal} gal capacity` : null,
  ].filter(Boolean);
  return values.length ? values.join(' / ') : null;
}

function vehiclePowerEstimate(
  vehicle: ExpeditionReadinessVehicleInput | null | undefined,
  assessment: ExpeditionReadinessAssessment | null,
) {
  const values = [
    typeof vehicle?.powerSystemWh === 'number' ? `${vehicle.powerSystemWh} Wh system` : null,
    assessment?.powerBrief.runtimeSummary ?? null,
    assessment?.powerBrief.stateOfChargeSummary ?? null,
  ].filter(Boolean);
  return values.length ? values.join(' / ') : null;
}

function vehiclePayloadWarnings(vehicle: ExpeditionReadinessVehicleInput | null | undefined) {
  if (!vehicle) return [];
  const warnings = [
    ...(vehicle.keyConcerns ?? []),
    typeof vehicle.gvwrUsagePct === 'number' && vehicle.gvwrUsagePct >= 85
      ? `${Math.round(vehicle.gvwrUsagePct)}% GVWR usage`
      : null,
    typeof vehicle.payloadRemainingLbs === 'number' && vehicle.payloadRemainingLbs < 300
      ? `${Math.round(vehicle.payloadRemainingLbs)} lb payload margin`
      : null,
    typeof vehicle.accessoryLoadoutWeightLbs === 'number'
      ? `${Math.round(vehicle.accessoryLoadoutWeightLbs)} lb accessory/loadout weight`
      : null,
  ];
  return compactStrings(warnings, 6);
}

function sourceFreshnessLines(assessment: ExpeditionReadinessAssessment | null) {
  if (!assessment) return ['Readiness sources unavailable / limited confidence.'];
  const flagged = Object.entries(assessment.sourceFreshness)
    .filter(([, record]) => record.isMissing || record.isStale || record.isInferred || record.isDemo || record.isMock)
    .map(([key, record]) => `${key}: ${formatFreshness(record)}`);
  return flagged.length ? flagged : ['No stale, missing, demo, mock, or ECS-inferred readiness sources are flagged.'];
}

function routeBailoutPoints(context: CommandBriefExportContext) {
  const recovery = context.assessment?.recoveryBrief;
  return compactStrings([
    ...(context.bailoutPoints ?? []),
    recovery?.nearestBailoutSummary ?? null,
  ], 6);
}

function campBackupEndpoints(context: CommandBriefExportContext) {
  const campCategory = categoryMap(context.assessment).get('camp_legality_confidence');
  return compactStrings([
    ...(context.campBackupEndpoints ?? []),
    campCategory ? categoryNarrative(campCategory) : null,
  ], 4);
}

function weatherFreshnessLabel(assessment: ExpeditionReadinessAssessment | null) {
  const source = assessment?.sourceFreshness.weather ?? (assessment?.sourceFreshness as any)?.weather_window;
  return source ? formatFreshness(source) : null;
}

function weatherSnapshotNarrative(
  assessment: ExpeditionReadinessAssessment | null,
  category: ExpeditionReadinessCategory | undefined,
) {
  const source = assessment?.sourceFreshness.weather ?? (assessment?.sourceFreshness as any)?.weather_window;
  if (source?.isMissing) {
    return 'Weather data is unavailable in this packet; refresh the forecast before departure.';
  }
  return weatherNarrative(category);
}

function sourceUpdatedAt(
  assessment: ExpeditionReadinessAssessment | null,
  keys: string[],
): string | null {
  if (!assessment) return null;
  for (const key of keys) {
    const record = (assessment.sourceFreshness as any)?.[key];
    if (record?.updatedAt) return record.updatedAt;
  }
  return null;
}

function readinessRouteDistance(context: CommandBriefExportContext) {
  if (context.totalPlannedDistance) return context.totalPlannedDistance;
  const match = context.routeSummary?.match(/(?:^|\/)\s*([^/]*?\bmi\b[^/]*)/i);
  return match?.[1]?.trim() ?? null;
}

export function buildECSCommandBriefPacketData(
  context: CommandBriefExportContext,
  generatedAt: string,
): ECSCommandBriefPacket {
  const assessment = context.assessment;
  const categories = categoryMap(assessment);
  const recovery = assessment?.recoveryBrief;
  const currentGps = recoveryCoordinate(context);
  const routeName = context.routeName ?? context.tripName ?? recovery?.activeRouteLabel ?? null;
  const packetSource = sourceForPacket(context);
  const weatherFetchedAt =
    context.weatherSnapshotFetchedAt ??
    categories.get('weather_window')?.lastUpdatedAt ??
    sourceUpdatedAt(assessment, ['weather', 'weather_window']);
  const offlineRefreshedAt =
    context.offlinePacketRefreshedAt ??
    categories.get('offline_preparedness')?.lastUpdatedAt ??
    sourceUpdatedAt(assessment, ['offline', 'offline_preparedness']);
  const vehicleTelemetryRefreshedAt =
    context.vehicleTelemetryRefreshedAt ??
    context.activeVehicle?.updatedAt ??
    categories.get('vehicle_fit')?.lastUpdatedAt ??
    sourceUpdatedAt(assessment, ['vehicle', 'telemetry', 'activeVehicle']);
  const topRisks = compactStrings([
    ...((categories.get('route_risk') ? usefulFactorDetails(categories.get('route_risk') as ExpeditionReadinessCategory, 4) : [])),
    ...(context.weakPointAssessment?.rankedWeakPoints.slice(0, 3).map((point) => point.label) ?? []),
  ], 6);

  return {
    packetMetadata: {
      packetId: packetId(generatedAt, context),
      generatedAt,
      generatedByDevice: context.generatedByDevice ?? Platform.OS,
      appVersionBuild: context.appVersionBuild ?? null,
      packetStatus: statusForPacket(context),
      source: packetSource,
      packetLabel: packetLabelForSource(packetSource),
    },
    readinessSummary: {
      decision: readinessDecisionForPacket(assessment),
      score: assessment?.overallScore ?? null,
      confidence: assessment?.confidence ?? 'unknown',
      topBlockers: compactStrings(assessment?.blockers.map((issue) => `${issue.label}: ${issue.detail}`) ?? [], 5),
      topWarnings: compactStrings(assessment?.warnings.map((issue) => `${issue.label}: ${issue.detail}`) ?? [], 5),
      recommendedOperatorActions: compactStrings(assessment?.recommendations ?? [], 8),
      freshnessSummary: sourceFreshnessLines(assessment),
    },
    routeGuidanceSummary: {
      routeName,
      routeId: context.activeRouteId ?? null,
      tripId: context.activeTripId ?? null,
      catalogSource: context.routeCatalogSource ?? null,
      geometryStatus: context.routeGeometryStatus ?? null,
      guidanceReady: typeof context.guidanceReady === 'boolean' ? context.guidanceReady : null,
      startPoint: context.startPoint ?? null,
      destinationPoint: context.destinationPoint ?? null,
      plannedDepartureTime: context.plannedDepartureTime ?? null,
      estimatedTrailEntryTime: context.estimatedTrailEntryTime ?? null,
      estimatedReturnTime: context.estimatedReturnTime ?? null,
      totalPlannedDistance: readinessRouteDistance(context),
      pavedApproachDistance: context.pavedApproachDistance ?? null,
      trailDistance: context.trailDistance ?? null,
      currentProgressPercent: typeof context.currentProgressPercent === 'number' ? context.currentProgressPercent : null,
      remainingDistance: context.remainingDistance ?? null,
      remainingDuration: context.remainingDuration ?? null,
      etaIso: context.etaIso ?? null,
      routeDataRefreshedAt:
        context.routeDataRefreshedAt ??
        context.assessment?.updatedAt ??
        sourceUpdatedAt(assessment, ['route', 'route_risk']),
      bailoutPoints: routeBailoutPoints(context),
      campBackupEndpoints: campBackupEndpoints(context),
      summary: context.routeSummary ? cleanPacketCopy(context.routeSummary) : null,
    },
    mapSection: {
      overviewImageUri: context.routeOverviewImageUri ?? null,
      polylineSnapshot: context.routePolylineSnapshot ?? null,
      trailheadMarker: context.startPoint ?? null,
      endpointMarker: context.destinationPoint ?? null,
      bailoutCampMarkers: [],
      fallbackText: 'Map snapshot not available. Use the route summary, coordinates, and emergency coordinate line in this packet.',
    },
    coordinatesSection: {
      currentGps,
      trailhead: context.startPoint ?? null,
      endpoint: context.destinationPoint ?? null,
      majorWaypoints: context.majorWaypoints ?? [],
      emergencyCoordinateLine: recovery
        ? `${titleCaseStatus(recovery.emergencyCoordinatePacketStatus)} - ${cleanPacketCopy(recovery.emergencyCoordinatePacketSummary)}`
        : null,
    },
    vehicleSection: {
      profileName: vehicleProfileName(context.activeVehicle),
      yearMakeModel: vehicleYearMakeModel(context.activeVehicle),
      licensePlate: explicitVehicleString(context.activeVehicle, ['licensePlate', 'plateNumber']),
      tireSize: vehicleTireSize(context.activeVehicle),
      spareStatus: explicitVehicleString(context.activeVehicle, ['spareStatus', 'spareTireStatus']),
      fuelRange: vehicleFuelRange(context.activeVehicle),
      batteryPower: vehiclePowerEstimate(context.activeVehicle, assessment),
      payloadLoadoutWarnings: vehiclePayloadWarnings(context.activeVehicle),
      summary: context.activeVehicle ? formatVehicle(context.activeVehicle) : null,
    },
    recoverySafetySection: {
      recoveryGearSummary: context.activeVehicle?.recoveryGearSummary ?? null,
      spareTireStatus: explicitVehicleString(context.activeVehicle, ['spareStatus', 'spareTireStatus']),
      commsDevices: recovery?.communicationsSummary ?? null,
      firstAidEmergencyGear: null,
      knownRisks: topRisks,
      difficulty: recovery ? titleCaseStatus(recovery.recoveryDifficulty) : null,
    },
    weatherEnvironmentSection: {
      weatherSnapshot: weatherSnapshotNarrative(assessment, categories.get('weather_window')),
      fetchedAt: weatherFetchedAt ?? null,
      freshnessLabel: weatherFreshnessLabel(assessment),
      alerts: compactStrings(assessment?.warnings
        .filter((issue) => issue.categoryId === 'weather_window')
        .map((issue) => `${issue.label}: ${issue.detail}`) ?? [], 4),
      daylightSunset: daylightNarrative(categories.get('daylight_margin')),
      fireSmokeAqi: null,
    },
    convoySection: {
      convoyName: context.convoyName ?? null,
      memberCount: typeof context.convoyMemberCount === 'number' ? context.convoyMemberCount : null,
      plannedRegroupPoints: compactStrings(context.plannedRegroupPoints ?? [], 6),
      checkInSchedule: context.checkInSchedule ?? null,
      checkInStatus: context.checkInStatus ?? null,
    },
    emergencyContactSection: {
      selectedContacts: context.emergencyContacts ?? [],
      optionalNotes: context.familyNotes ?? null,
      checkInExpectations: context.checkInExpectations ?? null,
      overdueInstructions: context.overdueInstructions ?? null,
    },
    freshnessProvenance: {
      packetGeneratedAt: generatedAt,
      routeDataRefreshedAt:
        context.routeDataRefreshedAt ??
        context.assessment?.updatedAt ??
        sourceUpdatedAt(assessment, ['route', 'route_risk']),
      weatherSnapshotFetchedAt: weatherFetchedAt ?? null,
      offlinePacketRefreshedAt: offlineRefreshedAt ?? null,
      vehicleTelemetryRefreshedAt,
    },
    limitations: [
      'Generated from available ECS data at export time.',
      'May be stale after export.',
      'Not a distress signal.',
      'Not automatically sent to emergency services.',
      'Route and weather data should be independently verified when safety-critical.',
    ],
  };
}

function packetFilename(routeTitle: string, generatedAt: string) {
  const date = new Date(generatedAt);
  const dateStamp = Number.isNaN(date.getTime())
    ? generatedAt.replace(/[^0-9A-Za-z]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 17)
    : `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}_${String(date.getUTCHours()).padStart(2, '0')}${String(date.getUTCMinutes()).padStart(2, '0')}`;
  const cleanTitle = routeTitle
    .replace(/^ECS Command Brief Packet\s*-\s*/i, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 54) || 'Command_Brief';
  return `ECS_Command_Brief_${cleanTitle}_${dateStamp}.pdf`;
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function rowHtml(label: string, value: string | number | boolean | null | undefined, fallback = NOT_AVAILABLE) {
  return `<div class="row"><div class="row-label">${escapeHtml(label)}</div><div class="row-value">${escapeHtml(displayValue(value, fallback))}</div></div>`;
}

function listHtml(items: readonly string[], fallback = NOT_AVAILABLE) {
  if (!items.length) return `<p class="muted">${escapeHtml(fallback)}</p>`;
  return `<ul>${items.map((item) => `<li>${escapeHtml(cleanPacketCopy(item))}</li>`).join('')}</ul>`;
}

function contactListHtml(contacts: ECSCommandBriefPacket['emergencyContactSection']['selectedContacts']) {
  if (!contacts.length) return `<p class="muted">${escapeHtml(NOT_PROVIDED)}</p>`;
  return `<ul>${contacts.map((contact) => {
    const meta = [contact.role, contact.notes].filter(Boolean).join(' - ');
    return `<li><strong>${escapeHtml(contact.name)}</strong>${meta ? ` - ${escapeHtml(meta)}` : ''}</li>`;
  }).join('')}</ul>`;
}

function coordinateRowsHtml(packet: ECSCommandBriefPacket) {
  const waypoints = packet.coordinatesSection.majorWaypoints;
  const waypointText = waypoints.length
    ? waypoints.map((point) => `${point.label}: ${coordinateLine(point)}`).join('\n')
    : NOT_AVAILABLE;
  return [
    rowHtml('Current GPS', coordinateLine(packet.coordinatesSection.currentGps)),
    rowHtml('Trailhead', coordinateLine(packet.coordinatesSection.trailhead)),
    rowHtml('Endpoint', coordinateLine(packet.coordinatesSection.endpoint)),
    rowHtml('Major waypoints', waypointText),
    rowHtml('Emergency coordinate line', packet.coordinatesSection.emergencyCoordinateLine),
  ].join('');
}

function readinessBadgeClass(decision: ECSCommandBriefPacket['readinessSummary']['decision']) {
  if (decision === 'GO') return 'badge-go';
  if (decision === 'CAUTION') return 'badge-caution';
  if (decision === 'HOLD') return 'badge-hold';
  return 'badge-unknown';
}

export function renderCommandBriefPacketHtml(packet: ECSCommandBriefPacket): string {
  const routeTitle = packet.routeGuidanceSummary.routeName ?? 'Command Brief';
  const readinessScore = packet.readinessSummary.score === null
    ? NOT_AVAILABLE
    : `${packet.readinessSummary.score}/100`;
  const mapContent = packet.mapSection.overviewImageUri
    ? `<img class="map-image" src="${escapeHtml(packet.mapSection.overviewImageUri)}" alt="Route overview" />`
    : `<div class="map-fallback">${escapeHtml(packet.mapSection.fallbackText)}</div>`;
  const holdReason = packet.readinessSummary.topBlockers[0] ?? packet.readinessSummary.recommendedOperatorActions[0] ?? null;
  const cautionFactors = packet.readinessSummary.topWarnings.length
    ? packet.readinessSummary.topWarnings
    : packet.readinessSummary.topBlockers;
  const priorityHtml = packet.readinessSummary.decision === 'HOLD'
    ? `<section class="priority priority-hold"><h2>Hold reason</h2>${rowHtml('Primary hold reason', holdReason)}${listHtml(packet.readinessSummary.topBlockers, 'No specific hold reason is available.')}</section>`
    : packet.readinessSummary.decision === 'CAUTION'
      ? `<section class="priority priority-caution"><h2>Caution factors</h2>${listHtml(cautionFactors, 'No caution factors are present in the current assessment.')}</section>`
      : `<section class="priority"><h2>GO Data Freshness</h2><p>GO does not mean guaranteed safe. Review freshness, limitations, and route/weather changes before departure.</p></section>`;
  const emergencyRiskNotes = [
    ...packet.recoverySafetySection.knownRisks,
    ...packet.readinessSummary.topBlockers,
    ...packet.readinessSummary.topWarnings,
  ];

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>ECS Command Brief Packet</title>
  <style>
    @page {
      size: Letter;
      margin: 0.55in;
      @bottom-center {
        content: "Page " counter(page) " of " counter(pages);
        font-family: Arial, Helvetica, sans-serif;
        font-size: 9px;
        color: #5b5b5b;
      }
    }
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      background: #ffffff;
      color: #151515;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11px;
      line-height: 1.38;
    }
    .page {
      position: relative;
      min-height: 10in;
    }
    .ecs-watermark {
      position: fixed;
      inset: 38% auto auto 14%;
      transform: rotate(-18deg);
      font-size: 92px;
      font-weight: 900;
      letter-spacing: 14px;
      color: rgba(0, 0, 0, 0.045);
      z-index: 0;
      pointer-events: none;
    }
    .content {
      position: relative;
      z-index: 1;
    }
    header {
      border: 2px solid #111111;
      padding: 16px 18px;
      margin-bottom: 14px;
    }
    .eyebrow {
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 1.8px;
      text-transform: uppercase;
      color: #424242;
    }
    h1 {
      margin: 4px 0 6px;
      font-size: 25px;
      line-height: 1.05;
      letter-spacing: 0;
    }
    .route-title {
      margin: 0;
      font-size: 15px;
      font-weight: 800;
    }
    .header-grid {
      display: grid;
      grid-template-columns: 1.3fr 0.7fr;
      gap: 12px;
      align-items: start;
      margin-top: 12px;
    }
    .badge {
      display: inline-block;
      border: 2px solid #111111;
      padding: 7px 10px;
      min-width: 102px;
      text-align: center;
      font-size: 16px;
      font-weight: 900;
      letter-spacing: 1px;
    }
    .badge-go {
      background: #e9f2e9;
    }
    .badge-caution {
      background: #f4eedb;
    }
    .badge-hold {
      background: #f1dddd;
    }
    .badge-unknown {
      background: #eeeeee;
    }
    .meta {
      margin-top: 7px;
      color: #3e3e3e;
      font-size: 10px;
    }
    section {
      break-inside: avoid;
      border-top: 1.5px solid #1d1d1d;
      padding-top: 8px;
      margin-top: 13px;
    }
    h2 {
      margin: 0 0 7px;
      font-size: 14px;
      line-height: 1.15;
      text-transform: uppercase;
      letter-spacing: 0.6px;
    }
    .two-col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 11px;
    }
    .row {
      display: grid;
      grid-template-columns: 34% 66%;
      border-bottom: 1px solid #d3d3d3;
      min-height: 24px;
    }
    .row-label {
      padding: 5px 7px 5px 0;
      font-weight: 800;
      color: #2b2b2b;
    }
    .row-value {
      padding: 5px 0;
      white-space: pre-wrap;
    }
    ul {
      margin: 4px 0 0 17px;
      padding: 0;
    }
    li {
      margin-bottom: 3px;
    }
    .muted {
      color: #606060;
      font-style: italic;
      margin: 4px 0;
    }
    .map-fallback {
      border: 1.5px dashed #6b6b6b;
      min-height: 94px;
      padding: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      color: #4f4f4f;
      background: #f8f8f8;
    }
    .map-image {
      width: 100%;
      max-height: 240px;
      object-fit: contain;
      border: 1px solid #333333;
    }
    .disclaimer {
      font-size: 9.5px;
      color: #343434;
    }
    .priority {
      border: 2px solid #222222;
      padding: 10px 12px;
      background: #f7f7f7;
    }
    .priority-hold {
      background: #f1dddd;
    }
    .priority-caution {
      background: #f4eedb;
    }
  </style>
</head>
<body>
  <main class="page">
    <div class="ecs-watermark">ECS</div>
    <div class="content">
      <header>
        <div class="eyebrow">Expedition Command System</div>
        <h1>ECS Command Brief Packet</h1>
        <p class="route-title">${escapeHtml(routeTitle)}</p>
        <p class="meta">${escapeHtml(packet.packetMetadata.packetLabel)}</p>
        <div class="header-grid">
          <div>
            ${rowHtml('Generated', packet.packetMetadata.generatedAt)}
            ${rowHtml('Packet ID', packet.packetMetadata.packetId)}
            ${rowHtml('Source', packet.packetMetadata.source.replace(/_/g, ' '))}
            ${rowHtml('Packet type', packet.packetMetadata.packetLabel)}
            ${rowHtml('Status', packet.packetMetadata.packetStatus)}
          </div>
          <div>
            <div class="badge ${readinessBadgeClass(packet.readinessSummary.decision)}">${escapeHtml(packet.readinessSummary.decision)}</div>
            <div class="meta">Readiness: ${escapeHtml(readinessScore)}</div>
            <div class="meta">Confidence: ${escapeHtml(displayValue(packet.readinessSummary.confidence))}</div>
          </div>
        </div>
      </header>

      ${priorityHtml}

      <section>
        <h2>Readiness Summary</h2>
        <div class="two-col">
          <div>
            ${rowHtml('Decision', packet.readinessSummary.decision)}
            ${rowHtml('Score', readinessScore)}
            ${rowHtml('Confidence', packet.readinessSummary.confidence)}
          </div>
          <div>
            <strong>Top blockers</strong>
            ${listHtml(packet.readinessSummary.topBlockers, 'No top blockers are present in the current assessment.')}
            <strong>Top warnings</strong>
            ${listHtml(packet.readinessSummary.topWarnings, 'No top warnings are present in the current assessment.')}
          </div>
        </div>
        <strong>Recommended operator actions</strong>
        ${listHtml(packet.readinessSummary.recommendedOperatorActions, 'No additional actions are present in the current assessment.')}
      </section>

      <section>
        <h2>Route / Guidance</h2>
        <div class="two-col">
          <div>
            ${rowHtml('Route name', packet.routeGuidanceSummary.routeName)}
            ${rowHtml('Route ID', packet.routeGuidanceSummary.routeId)}
            ${rowHtml('Trip ID', packet.routeGuidanceSummary.tripId)}
            ${rowHtml('Catalog source', packet.routeGuidanceSummary.catalogSource)}
            ${rowHtml('Geometry status', packet.routeGuidanceSummary.geometryStatus)}
            ${rowHtml('Guidance ready', packet.routeGuidanceSummary.guidanceReady)}
            ${rowHtml('Progress', packet.routeGuidanceSummary.currentProgressPercent == null ? null : `${Math.round(packet.routeGuidanceSummary.currentProgressPercent)}%`)}
            ${rowHtml('Remaining distance', packet.routeGuidanceSummary.remainingDistance)}
          </div>
          <div>
            ${rowHtml('Planned departure', packet.routeGuidanceSummary.plannedDepartureTime)}
            ${rowHtml('Trail entry', packet.routeGuidanceSummary.estimatedTrailEntryTime)}
            ${rowHtml('Return/completion', packet.routeGuidanceSummary.estimatedReturnTime)}
            ${rowHtml('Total distance', packet.routeGuidanceSummary.totalPlannedDistance)}
            ${rowHtml('Paved approach', packet.routeGuidanceSummary.pavedApproachDistance)}
            ${rowHtml('Trail distance', packet.routeGuidanceSummary.trailDistance)}
            ${rowHtml('ETA', packet.routeGuidanceSummary.etaIso)}
            ${rowHtml('Remaining time', packet.routeGuidanceSummary.remainingDuration)}
            ${rowHtml('Route data refreshed', packet.routeGuidanceSummary.routeDataRefreshedAt)}
          </div>
        </div>
        ${rowHtml('Summary', packet.routeGuidanceSummary.summary)}
        <strong>Bailout points</strong>
        ${listHtml(packet.routeGuidanceSummary.bailoutPoints)}
        <strong>Camp / backup endpoints</strong>
        ${listHtml(packet.routeGuidanceSummary.campBackupEndpoints)}
      </section>

      <section>
        <h2>Map Snapshot</h2>
        ${mapContent}
        ${rowHtml('Polyline snapshot', packet.mapSection.polylineSnapshot)}
      </section>

      <section>
        <h2>Coordinates</h2>
        ${coordinateRowsHtml(packet)}
      </section>

      <section>
        <h2>Vehicle</h2>
        <div class="two-col">
          <div>
            ${rowHtml('Profile', packet.vehicleSection.profileName)}
            ${rowHtml('Year / make / model', packet.vehicleSection.yearMakeModel)}
            ${rowHtml('License plate', packet.vehicleSection.licensePlate, NOT_PROVIDED)}
            ${rowHtml('Tires', packet.vehicleSection.tireSize)}
            ${rowHtml('Spare status', packet.vehicleSection.spareStatus)}
          </div>
          <div>
            ${rowHtml('Fuel / range', packet.vehicleSection.fuelRange)}
            ${rowHtml('Battery / power', packet.vehicleSection.batteryPower)}
            ${rowHtml('Summary', packet.vehicleSection.summary)}
          </div>
        </div>
        <strong>Payload / loadout warnings</strong>
        ${listHtml(packet.vehicleSection.payloadLoadoutWarnings)}
      </section>

      <section>
        <h2>Recovery / Safety</h2>
        <div class="two-col">
          <div>
            ${rowHtml('Recovery gear', packet.recoverySafetySection.recoveryGearSummary)}
            ${rowHtml('Spare tire', packet.recoverySafetySection.spareTireStatus)}
            ${rowHtml('Comms devices', packet.recoverySafetySection.commsDevices)}
            ${rowHtml('First aid / emergency gear', packet.recoverySafetySection.firstAidEmergencyGear, NOT_PROVIDED)}
            ${rowHtml('Difficulty', packet.recoverySafetySection.difficulty)}
          </div>
          <div>
            <strong>Known risks</strong>
            ${listHtml(packet.recoverySafetySection.knownRisks)}
          </div>
        </div>
      </section>

      <section>
        <h2>Weather / Environment</h2>
        ${rowHtml('Weather snapshot', packet.weatherEnvironmentSection.weatherSnapshot)}
        ${rowHtml('Fetched at', packet.weatherEnvironmentSection.fetchedAt)}
        ${rowHtml('Freshness', packet.weatherEnvironmentSection.freshnessLabel)}
        ${rowHtml('Daylight / sunset', packet.weatherEnvironmentSection.daylightSunset)}
        ${rowHtml('Fire / smoke / AQI', packet.weatherEnvironmentSection.fireSmokeAqi)}
        <strong>Alerts</strong>
        ${listHtml(packet.weatherEnvironmentSection.alerts, 'No weather alerts are attached to the current ECS snapshot.')}
      </section>

      <section>
        <h2>Convoy</h2>
        ${rowHtml('Convoy name', packet.convoySection.convoyName, NOT_PROVIDED)}
        ${rowHtml('Members', packet.convoySection.memberCount, NOT_PROVIDED)}
        ${rowHtml('Check-in schedule', packet.convoySection.checkInSchedule, NOT_PROVIDED)}
        ${rowHtml('Check-in status', packet.convoySection.checkInStatus, NOT_PROVIDED)}
        <strong>Regroup points</strong>
        ${listHtml(packet.convoySection.plannedRegroupPoints, NOT_PROVIDED)}
      </section>

      <section>
        <h2>For Emergency Contacts</h2>
        <p>This section is written for family, coworkers, convoy members, or trusted contacts who may not use ECS.</p>
        ${rowHtml('Planned route', packet.routeGuidanceSummary.routeName)}
        ${rowHtml('Expected check-ins', packet.emergencyContactSection.checkInExpectations, NOT_PROVIDED)}
        ${rowHtml('What to do if overdue', packet.emergencyContactSection.overdueInstructions, NOT_PROVIDED)}
        ${rowHtml('Last known / planned coordinates', [
          `Current: ${coordinateLine(packet.coordinatesSection.currentGps)}`,
          `Trailhead: ${coordinateLine(packet.coordinatesSection.trailhead)}`,
          `Endpoint: ${coordinateLine(packet.coordinatesSection.endpoint)}`,
        ].join('\n'))}
        ${rowHtml('Vehicle description', packet.vehicleSection.summary)}
        <strong>Route risk notes</strong>
        ${listHtml(emergencyRiskNotes, 'No route risk notes are present in the current ECS snapshot.')}
      </section>

      <section>
        <h2>Emergency Contacts / Check-ins</h2>
        <strong>Selected contacts</strong>
        ${contactListHtml(packet.emergencyContactSection.selectedContacts)}
        ${rowHtml('Family / coworker notes', packet.emergencyContactSection.optionalNotes, NOT_PROVIDED)}
        ${rowHtml('Check-in expectations', packet.emergencyContactSection.checkInExpectations, NOT_PROVIDED)}
        ${rowHtml('If overdue', packet.emergencyContactSection.overdueInstructions, NOT_PROVIDED)}
      </section>

      <section>
        <h2>Data Freshness</h2>
        ${rowHtml('Packet generated at', packet.freshnessProvenance.packetGeneratedAt)}
        ${rowHtml('Route data refreshed', packet.freshnessProvenance.routeDataRefreshedAt)}
        ${rowHtml('Weather snapshot fetched', packet.freshnessProvenance.weatherSnapshotFetchedAt)}
        ${rowHtml('Offline packet/cache refreshed', packet.freshnessProvenance.offlinePacketRefreshedAt)}
        ${rowHtml('Vehicle telemetry refreshed', packet.freshnessProvenance.vehicleTelemetryRefreshedAt)}
        ${listHtml(packet.readinessSummary.freshnessSummary)}
      </section>

      <section class="disclaimer">
        <h2>Limitations</h2>
        ${listHtml(packet.limitations)}
        <p>${escapeHtml(COMMAND_BRIEF_DISCLAIMER)}</p>
      </section>
    </div>
  </main>
</body>
</html>`;
}

function renderCommandBriefCopySummary(
  packet: ECSCommandBriefPacket,
  params: {
    title: string;
    filename: string;
    generatedAt: string;
    readinessLine: string;
  },
) {
  const blockersAndWarnings = [
    ...packet.readinessSummary.topBlockers.map((item) => `Blocker: ${item}`),
    ...packet.readinessSummary.topWarnings.map((item) => `Warning: ${item}`),
  ];
  const plannedTimes = [
    `Planned departure: ${displayValue(packet.routeGuidanceSummary.plannedDepartureTime)}`,
    `Trail entry: ${displayValue(packet.routeGuidanceSummary.estimatedTrailEntryTime)}`,
    `Return/completion: ${displayValue(packet.routeGuidanceSummary.estimatedReturnTime)}`,
  ];
  const coordinateLines = [
    `Current GPS: ${coordinateLine(packet.coordinatesSection.currentGps)}`,
    `Trailhead: ${coordinateLine(packet.coordinatesSection.trailhead)}`,
    `Endpoint: ${coordinateLine(packet.coordinatesSection.endpoint)}`,
    packet.coordinatesSection.majorWaypoints.length
      ? `Waypoints: ${packet.coordinatesSection.majorWaypoints.map((point) => `${point.label} ${coordinateLine(point)}`).join('; ')}`
      : 'Waypoints: Not available',
  ];

  return [
    `# ${params.title}`,
    '',
    `Generated: ${params.generatedAt}`,
    `PDF file: ${params.filename}`,
    `Packet ID: ${packet.packetMetadata.packetId}`,
    '',
    '## Trip / Route',
    `Route/trip: ${displayValue(packet.routeGuidanceSummary.routeName)}`,
    `Route ID: ${displayValue(packet.routeGuidanceSummary.routeId)}`,
    `Start/trailhead: ${coordinateLine(packet.routeGuidanceSummary.startPoint)}`,
    `Endpoint: ${coordinateLine(packet.routeGuidanceSummary.destinationPoint)}`,
    `Route distance: ${displayValue(packet.routeGuidanceSummary.totalPlannedDistance)}`,
    '',
    '## Readiness',
    `${packet.readinessSummary.decision} - ${displayValue(packet.readinessSummary.score === null ? null : `${packet.readinessSummary.score}/100`)}.`,
    params.readinessLine,
    '',
    '## Planned Times',
    plannedTimes.join('\n'),
    '',
    '## Coordinates',
    coordinateLines.join('\n'),
    `Emergency coordinate packet: ${displayValue(packet.coordinatesSection.emergencyCoordinateLine)}`,
    '',
    '## Vehicle',
    `Vehicle: ${displayValue(packet.vehicleSection.summary)}`,
    `Fuel/range: ${displayValue(packet.vehicleSection.fuelRange)}`,
    `Power: ${displayValue(packet.vehicleSection.batteryPower)}`,
    '',
    '## Check-ins',
    `Expectations: ${displayValue(packet.emergencyContactSection.checkInExpectations, NOT_PROVIDED)}`,
    `If overdue: ${displayValue(packet.emergencyContactSection.overdueInstructions, NOT_PROVIDED)}`,
    `Convoy/check-in status: ${displayValue(packet.convoySection.checkInStatus, NOT_PROVIDED)}`,
    '',
    '## Top Blockers / Warnings',
    markdownList(blockersAndWarnings, 'No top blockers or warnings are present in the current assessment.', 8),
    '',
    '## Emergency Note',
    COMMAND_BRIEF_DISCLAIMER,
  ].map((line) => cleanPacketCopy(line)).join('\n');
}

export function buildCommandBriefPacket(
  context: CommandBriefExportContext,
  options: CommandBriefPacketOptions = {},
): CommandBriefPacket {
  const assessment = context.assessment;
  const generatedAt = options.generatedAt ?? context.generatedAt ?? new Date().toISOString();
  const format: CommandBriefPacket['format'] = 'pdf';
  const routeTitle = context.routeName ?? context.tripName ?? assessment?.recoveryBrief.activeRouteLabel ?? 'Command Brief';
  const title = `ECS Command Brief Packet - ${cleanPacketCopy(routeTitle)}`;
  const data = buildECSCommandBriefPacketData(context, generatedAt);
  const filename = packetFilename(routeTitle, generatedAt);

  const readinessLine = formatReadinessDecision(assessment);
  const body = renderCommandBriefCopySummary(data, {
    title,
    filename,
    generatedAt,
    readinessLine,
  });

  return {
    title,
    filename,
    mimeType: 'application/pdf',
    format,
    generatedAt,
    body,
    copyBody: body,
    html: renderCommandBriefPacketHtml(data),
    data,
  };
}

async function getClipboardModule(): Promise<{ setStringAsync?: (value: string) => Promise<void> } | null> {
  try {
    const mod = await import('expo-clipboard' as any);
    return ((mod as any)?.default ?? mod) as { setStringAsync?: (value: string) => Promise<void> };
  } catch {}

  const webClipboard = (globalThis as any)?.navigator?.clipboard;
  if (typeof webClipboard?.writeText === 'function') {
    return {
      setStringAsync: (value: string) => webClipboard.writeText(value),
    };
  }
  return null;
}

async function getSharingModule(): Promise<{
  isAvailableAsync?: () => Promise<boolean>;
  shareAsync?: (uri: string, options?: Record<string, unknown>) => Promise<void>;
} | null> {
  try {
    const mod = await import('expo-sharing');
    return ((mod as any)?.default ?? mod) as {
      isAvailableAsync?: () => Promise<boolean>;
      shareAsync?: (uri: string, options?: Record<string, unknown>) => Promise<void>;
    };
  } catch {
    return null;
  }
}

async function getPrintModule(): Promise<{
  printToFileAsync?: (options: { html: string; base64?: boolean }) => Promise<{ uri?: string; base64?: string }>;
} | null> {
  try {
    const mod = await import('expo-print');
    return ((mod as any)?.default ?? mod) as {
      printToFileAsync?: (options: { html: string; base64?: boolean }) => Promise<{ uri?: string; base64?: string }>;
    };
  } catch {
    return null;
  }
}

function byteSizeFromBase64(base64: string | null | undefined) {
  if (!base64) return null;
  const normalized = base64.replace(/\s/g, '');
  if (!normalized) return null;
  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
}

export async function generateCommandBriefPdf(packet: CommandBriefPacket): Promise<CommandBriefPdfArtifact> {
  const print = await getPrintModule();
  if (!print?.printToFileAsync) {
    throw new Error('expo-print is unavailable.');
  }
  const result = await print.printToFileAsync({
    html: packet.html,
    base64: true,
  });
  if (!result?.uri) {
    throw new Error('PDF renderer did not return a real file URI.');
  }
  const byteSize = byteSizeFromBase64(result.base64);
  return {
    fileUri: result.uri,
    filename: packet.filename,
    createdAt: packet.generatedAt,
    byteSize: byteSize ?? null,
    packetId: packet.data.packetMetadata.packetId,
    mimeType: 'application/pdf',
    base64: result.base64 ?? null,
  };
}

export async function generateCommandBriefPacketPdf(packet: CommandBriefPacket): Promise<{
  ok: boolean;
  uri?: string;
  base64?: string | null;
  byteSize?: number | null;
  unavailableReason?: string;
}> {
  try {
    const artifact = await generateCommandBriefPdf(packet);
    return {
      ok: true,
      uri: artifact.fileUri,
      base64: artifact.base64,
      byteSize: artifact.byteSize,
    };
  } catch (error) {
    return {
      ok: false,
      unavailableReason: error instanceof Error ? error.message : 'Unknown PDF render error.',
    };
  }
}

function base64ToBlobPart(base64: string) {
  const buffer = (globalThis as any)?.Buffer;
  if (typeof buffer?.from === 'function') {
    return buffer.from(base64, 'base64');
  }
  const atobFn = (globalThis as any)?.atob;
  if (typeof atobFn !== 'function') {
    return base64;
  }
  const binary = atobFn(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function webDownloadPacket(packet: CommandBriefPacket): Promise<CommandBriefExportResult> {
  try {
    const doc = (globalThis as any)?.document;
    const urlApi = (globalThis as any)?.URL;
    const BlobCtor = (globalThis as any)?.Blob;
    if (!doc?.createElement || !urlApi?.createObjectURL || !BlobCtor) {
      return {
        ok: false,
        action: 'save',
        packet,
        message: 'Command Brief packet could not be downloaded.',
        unavailableReason: 'Browser download APIs are unavailable.',
      };
    }

    const pdf = await generateCommandBriefPdf(packet);
    if (!pdf.base64) {
      return {
        ok: false,
        action: 'save',
        packet,
        message: 'Command Brief PDF could not be generated.',
        unavailableReason: 'PDF bytes unavailable.',
      };
    }

    const blob = new BlobCtor([base64ToBlobPart(pdf.base64)], { type: packet.mimeType });
    const url = urlApi.createObjectURL(blob);
    const link = doc.createElement('a');
    link.href = url;
    link.download = packet.filename;
    link.style.display = 'none';
    doc.body?.appendChild?.(link);
    link.click();
    link.remove?.();
    setTimeout(() => {
      try {
        urlApi.revokeObjectURL(url);
      } catch {}
    }, 1000);

    return {
      ok: true,
      action: 'save',
      packet,
      uri: packet.filename,
      savedLocation: packet.filename,
      message: `Command Brief PDF downloaded as ${packet.filename}.`,
    };
  } catch (error) {
    return {
      ok: false,
      action: 'save',
      packet,
      message: 'Command Brief packet could not be downloaded.',
      unavailableReason: error instanceof Error ? error.message : 'Unknown browser download error.',
    };
  }
}

export async function saveCommandBriefPacket(packet: CommandBriefPacket): Promise<CommandBriefExportResult> {
  if (Platform.OS === 'web') {
    return webDownloadPacket(packet);
  }

  try {
    const documentDir = await getDocumentDirectory();
    if (!documentDir) {
      return {
        ok: false,
        action: 'save',
        packet,
        message: 'Command Brief packet could not be saved on this device.',
        unavailableReason: 'File storage is unavailable.',
      };
    }

    const directoryUri = `${documentDir}${COMMAND_BRIEF_PACKET_DIR}`;
    const directoryReady = await fsEnsureDir(directoryUri);
    if (!directoryReady) {
      return {
        ok: false,
        action: 'save',
        packet,
        message: 'Command Brief packet could not be saved.',
        unavailableReason: `Could not create ECS packet folder: ${directoryUri}`,
      };
    }
    const uri = `${directoryUri}${packet.filename}`;
    const pdf = await generateCommandBriefPdf(packet);
    const pdfBase64 = pdf.base64 ?? (pdf.fileUri ? await fsReadString(pdf.fileUri, 'base64') : null);
    if (!pdfBase64) {
      return {
        ok: false,
        action: 'save',
        packet,
        message: 'Command Brief PDF could not be saved.',
        unavailableReason: 'PDF bytes were unavailable after rendering.',
      };
    }
    await fsWriteString(uri, pdfBase64, 'base64');
    const info = await fsGetInfo(uri);
    if (!info.exists || info.isDirectory || info.size <= 0) {
      return {
        ok: false,
        action: 'save',
        packet,
        message: 'Command Brief packet could not be saved.',
        unavailableReason: `File write did not produce a readable packet at ${uri}.`,
      };
    }
    const savedLocation = `App Documents / ${COMMAND_BRIEF_PACKET_DIR}${packet.filename}`;
    return {
      ok: true,
      action: 'save',
      packet,
      uri,
      savedLocation,
      message: `Command Brief PDF saved to ${savedLocation}. URI: ${uri}`,
    };
  } catch (error) {
    return {
      ok: false,
      action: 'save',
      packet,
      message: 'Command Brief packet could not be saved.',
      unavailableReason: error instanceof Error ? error.message : 'Unknown file storage error.',
    };
  }
}

export async function shareCommandBriefPacket(packet: CommandBriefPacket): Promise<CommandBriefExportResult> {
  const sharing = await getSharingModule();
  if (!sharing?.shareAsync) {
    return {
      ok: false,
      action: 'share',
      packet,
      message: 'Sharing is not available on this device.',
      unavailableReason: 'expo-sharing is unavailable.',
    };
  }

  try {
    const available = typeof sharing.isAvailableAsync === 'function'
      ? await sharing.isAvailableAsync()
      : true;
    if (!available) {
      return {
        ok: false,
        action: 'share',
        packet,
        message: 'Sharing is not available on this device.',
        unavailableReason: 'Native share sheet unavailable.',
      };
    }
    const pdf = await generateCommandBriefPdf(packet);
    await sharing.shareAsync(pdf.fileUri, {
      mimeType: packet.mimeType,
      dialogTitle: packet.title,
      UTI: 'com.adobe.pdf',
    });
    return {
      ok: true,
      action: 'share',
      packet,
      uri: pdf.fileUri,
      message: 'Command Brief PDF ready to share.',
    };
  } catch (error) {
    return {
      ok: false,
      action: 'share',
      packet,
      message: 'Command Brief packet could not be shared.',
      unavailableReason: error instanceof Error ? error.message : 'Unknown sharing error.',
    };
  }
}

export async function copyCommandBriefPacketToClipboard(packet: CommandBriefPacket): Promise<CommandBriefExportResult> {
  const clipboard = await getClipboardModule();
  if (!clipboard?.setStringAsync) {
    return {
      ok: false,
      action: 'copy',
      packet,
      message: 'Clipboard is not available on this device.',
      unavailableReason: 'Clipboard API unavailable.',
    };
  }

  try {
    await clipboard.setStringAsync(packet.copyBody);
    return {
      ok: true,
      action: 'copy',
      packet,
      message: 'Command Brief packet summary copied.',
    };
  } catch (error) {
    return {
      ok: false,
      action: 'copy',
      packet,
      message: 'Command Brief packet could not be copied.',
      unavailableReason: error instanceof Error ? error.message : 'Unknown clipboard error.',
    };
  }
}

export async function exportCommandBriefPacket(
  context: CommandBriefExportContext,
  action: CommandBriefExportAction,
  options: CommandBriefPacketOptions = {},
): Promise<CommandBriefExportResult> {
  const packet = buildCommandBriefPacket(context, options);
  if (action === 'copy') return copyCommandBriefPacketToClipboard(packet);
  if (action === 'share') return shareCommandBriefPacket(packet);
  return saveCommandBriefPacket(packet);
}

export { COMMAND_BRIEF_DISCLAIMER };
