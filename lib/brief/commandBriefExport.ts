import { Platform } from 'react-native';
import { fsEnsureDir, fsGetInfo, fsWriteString, getDocumentDirectory } from '../fsCompat';
import { EXPEDITION_TRIP_INTENT_LABELS } from '../readiness/expeditionReadinessCalibration';
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
} from './commandBriefTypes';

const COMMAND_BRIEF_PACKET_DIR = 'command-brief-packets/';
const COMMAND_BRIEF_DISCLAIMER =
  'This Command Brief packet is confidence-based and grounded in available ECS readiness inputs. Verify official closures, land-use rules, campsite access requirements, weather, and emergency guidance before departure.';

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

function packetFilename(title: string, generatedAt: string, extension: 'md' | 'txt') {
  const dateStamp = generatedAt.replace(/[:.]/g, '-');
  const cleanTitle = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 46) || 'command-brief';
  return `${cleanTitle}-${dateStamp}.${extension}`;
}

export function buildCommandBriefPacket(
  context: CommandBriefExportContext,
  options: CommandBriefPacketOptions = {},
): CommandBriefPacket {
  const assessment = context.assessment;
  const generatedAt = options.generatedAt ?? context.generatedAt ?? new Date().toISOString();
  const format = options.format ?? 'markdown';
  const categories = categoryMap(assessment);
  const routeTitle = context.routeName ?? context.tripName ?? assessment?.recoveryBrief.activeRouteLabel ?? 'Command Brief';
  const title = `ECS Command Brief Packet - ${cleanPacketCopy(routeTitle)}`;

  const readinessLine = formatReadinessDecision(assessment);

  const intentLine = assessment
    ? `${EXPEDITION_TRIP_INTENT_LABELS[assessment.tripIntent]} (${assessment.tripIntentSource === 'ecs_inferred' ? 'ECS-inferred' : assessment.tripIntentSource}). Profile: ${assessment.calibration.label}.`
    : 'Unknown. Readiness profile unavailable.';

  const blockerLines = assessment?.blockers.map((issue) => `${issue.label}: ${issue.detail}`) ?? [];
  const warningLines = assessment?.warnings.map((issue) => `${issue.label}: ${issue.detail}`) ?? [];
  const recommendedActions = assessment?.recommendations ?? [];
  const staleInputs = assessment
    ? Object.entries(assessment.sourceFreshness)
      .filter(([, record]) => record.isMissing || record.isStale || record.isInferred || record.isDemo || record.isMock)
      .map(([key, record]) => `${key}: ${formatFreshness(record)}`)
    : [];

  const recovery = assessment?.recoveryBrief;
  const recoveryLines = recovery
    ? [
      `Nearest bailout: ${recovery.nearestBailoutSummary}`,
      `Recovery difficulty: ${titleCaseStatus(recovery.recoveryDifficulty)}.`,
      `Emergency coordinate packet: ${titleCaseStatus(recovery.emergencyCoordinatePacketStatus)} - ${recovery.emergencyCoordinatePacketSummary}`,
      `Official contact data: ${recovery.officialContactSummary}`,
      recovery.isECSInferred ? 'Recovery summary is ECS-inferred from available route/location inputs.' : '',
    ].filter(Boolean)
    : ['Recovery summary unavailable / limited confidence.'];

  const power = assessment?.powerBrief;
  const fuelPowerExtra = power
    ? [
      `Power: ${power.statusLabel}. ${power.runtimeSummary}`,
      `Power freshness: ${power.freshnessSummary}`,
      `Power recommendation: ${power.recommendation}`,
    ]
    : ['Power summary unavailable / limited confidence.'];

  const body = [
    `# ${title}`,
    '',
    `Generated: ${generatedAt}`,
    '',
    '## Readiness Decision',
    readinessLine,
    '',
    '## Trip Intent',
    intentLine,
    '',
    '## Active Vehicle',
    formatVehicle(context.activeVehicle),
    '',
    '## Route Summary',
    formatRouteSummary(context),
    '',
    '## What Breaks First?',
    formatWeakPointAssessment(context),
    '',
    '## Top Blockers',
    markdownList(blockerLines, 'No hard blockers are present in the current assessment.', 5),
    '',
    '## Top Warnings',
    markdownList(warningLines, 'No caution-level warnings are present in the current assessment.', 5),
    '',
    '## Readiness Sections',
    formatCategory(categories.get('vehicle_fit'), 'Vehicle Capacity / Clearance Status'),
    '',
    formatCategory(categories.get('camp_legality_confidence'), 'Camp Confidence Summary'),
    '',
    formatWeatherDaylightSummary(categories),
    '',
    formatCategory(categories.get('offline_preparedness'), 'Offline Preparedness'),
    '',
    formatCombinedCategories(categories, ['fuel_range_margin', 'power_runtime'], 'Fuel / Power / Range Summary', fuelPowerExtra),
    '',
    formatCombinedCategories(categories, ['recovery_bailout_access'], 'Recovery / Bailout Summary', recoveryLines),
    '',
    formatCommunicationsSummary(categories.get('communications_signal_confidence')),
    '',
    '## Emergency Coordinate Packet',
    recovery
      ? `${titleCaseStatus(recovery.emergencyCoordinatePacketStatus)} - ${cleanPacketCopy(recovery.emergencyCoordinatePacketSummary)}`
      : 'Unavailable / limited confidence.',
    recovery?.currentCoordinates
      ? `Current coordinates: ${recovery.currentCoordinates.latitude.toFixed(5)}, ${recovery.currentCoordinates.longitude.toFixed(5)}${typeof recovery.currentCoordinates.accuracyMeters === 'number' ? ` (accuracy ${Math.round(recovery.currentCoordinates.accuracyMeters)} m)` : ''}`
      : 'Current coordinates unavailable / limited confidence.',
    '',
    '## Recommended Actions',
    markdownList(recommendedActions, 'No additional recommendations are present in the current assessment.', 8),
    '',
    '## Source Freshness Notes',
    markdownList(staleInputs, 'No stale, missing, demo, mock, or ECS-inferred readiness sources are flagged.', 10),
    '',
    '## Confidence Disclaimer',
    COMMAND_BRIEF_DISCLAIMER,
  ].map((line) => cleanPacketCopy(line)).join('\n');

  const extension = format === 'markdown' ? 'md' : 'txt';
  return {
    title,
    filename: packetFilename(title, generatedAt, extension),
    mimeType: format === 'markdown' ? 'text/markdown' : 'text/plain',
    format,
    generatedAt,
    body,
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

function webDownloadPacket(packet: CommandBriefPacket): CommandBriefExportResult {
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

    const blob = new BlobCtor([packet.body], { type: `${packet.mimeType};charset=utf-8` });
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
      savedLocation: `Browser downloads folder / ${packet.filename}`,
      message: `Command Brief packet downloaded as ${packet.filename}. Check your browser downloads folder.`,
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
    await fsWriteString(uri, packet.body, 'utf8');
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
      message: `Command Brief packet saved to ${savedLocation}. URI: ${uri}`,
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
    const saved = await saveCommandBriefPacket(packet);
    if (!saved.ok || !saved.uri) {
      return {
        ...saved,
        action: 'share',
        message: 'Command Brief packet could not be prepared for sharing.',
      };
    }
    await sharing.shareAsync(saved.uri, {
      mimeType: packet.mimeType,
      dialogTitle: packet.title,
      UTI: packet.format === 'markdown' ? 'net.daringfireball.markdown' : 'public.plain-text',
    });
    return {
      ok: true,
      action: 'share',
      packet,
      uri: saved.uri,
      message: 'Command Brief packet ready to share.',
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
    await clipboard.setStringAsync(packet.body);
    return {
      ok: true,
      action: 'copy',
      packet,
      message: 'Command Brief packet copied.',
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
