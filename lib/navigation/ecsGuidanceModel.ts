export type EcsGuidanceRouteSource =
  | 'mapbox_directions'
  | 'ecs_verified_route'
  | 'trail_catalog'
  | 'approach_only'
  | 'trailhead_only'
  | 'imported_trace'
  | 'summary_only';

export type EcsGuidanceMode = 'turn_by_turn' | 'summary_only' | 'unavailable';
export type EcsGuidanceSourceLabel =
  | 'Mapbox turn-by-turn'
  | 'ECS verified route guidance'
  | 'Imported route guidance'
  | 'Summary only';
export type EcsSyntheticGuidanceRouteKind = 'road' | 'trail' | 'path' | 'offroad';

export interface EcsGuidanceCoordinate {
  lat: number;
  lng: number;
  ele?: number | null;
  ele_m?: number | null;
  elevationFeet?: number | null;
}

export type EcsGuidanceLngLat = [longitude: number, latitude: number];

export interface EcsGuidanceBannerInstruction {
  distanceAlongGeometryMeters: number | null;
  primaryText: string | null;
  primaryType: string | null;
  primaryModifier: string | null;
  secondaryText: string | null;
  subText: string | null;
}

export interface EcsGuidanceVoiceInstruction {
  distanceAlongGeometryMeters: number | null;
  announcement: string | null;
  ssmlAnnouncement: string | null;
}

export interface EcsGuidanceStep {
  id: string;
  legIndex: number;
  stepIndex: number;
  globalStepIndex: number;
  instruction: string;
  shortInstruction: string;
  maneuverType: string;
  maneuverModifier?: string;
  roadName?: string;
  displayRoadName: string;
  isUnnamedRoad: boolean;
  distanceMeters: number;
  durationSeconds: number;
  maneuverLocation?: EcsGuidanceLngLat;
  bearingBefore?: number;
  bearingAfter?: number;
  geometry?: EcsGuidanceCoordinate[];
  bannerInstructions?: EcsGuidanceBannerInstruction[];
  voiceInstructions?: EcsGuidanceVoiceInstruction[];
  mode?: string;
}

export interface EcsGuidanceLeg {
  legIndex: number;
  distanceMeters: number;
  durationSeconds: number;
  summary?: string;
  steps: EcsGuidanceStep[];
}

export interface EcsGuidanceRoute {
  id: string;
  source: EcsGuidanceRouteSource;
  routeUuid?: string;
  geometry: EcsGuidanceCoordinate[];
  distanceMeters: number;
  durationSeconds: number;
  etaIso?: string;
  legs: EcsGuidanceLeg[];
  steps: EcsGuidanceStep[];
  createdAt: string;
  rerouteGeneration: number;
  guidanceMode: EcsGuidanceMode;
  guidanceSourceLabel?: EcsGuidanceSourceLabel;
  guidanceLimitationLabel?: string;
}

export interface NormalizeMapboxDirectionsRouteOptions {
  id: string;
  source?: EcsGuidanceRouteSource;
  destinationName?: string | null;
  etaIso?: string | null;
  createdAt?: string | null;
  rerouteGeneration?: number | null;
  unnamedRouteKind?: 'road' | 'trail' | 'path';
}

export type EcsSyntheticSegmentName =
  | string
  | null
  | undefined
  | {
      name?: string | null;
      label?: string | null;
      title?: string | null;
      segmentIndex?: number | null;
      startIndex?: number | null;
    };

export interface BuildSyntheticEcsGuidanceRouteOptions {
  id: string;
  source: EcsGuidanceRouteSource;
  geometry: unknown;
  distanceMeters?: number | null;
  durationSeconds?: number | null;
  etaIso?: string | null;
  createdAt?: string | null;
  rerouteGeneration?: number | null;
  destinationName?: string | null;
  routeKind?: EcsSyntheticGuidanceRouteKind | null;
  segmentNames?: EcsSyntheticSegmentName[] | null;
  limitedTrailGuidance?: boolean;
  guidanceLimitationLabel?: string | null;
}

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower === 'null' || lower === 'undefined') return null;
  return trimmed;
}

function finiteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeLngLat(value: unknown): EcsGuidanceLngLat | undefined {
  if (!Array.isArray(value) || value.length < 2) return undefined;
  const lng = Number(value[0]);
  const lat = Number(value[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return undefined;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined;
  return [lng, lat];
}

function normalizeCoordinate(value: unknown): EcsGuidanceCoordinate | null {
  const input = value as Record<string, unknown> | unknown[] | null | undefined;
  const coordinate = Array.isArray(input)
    ? { lng: input[0], lat: input[1], ele: input[2] }
    : input;
  if (!coordinate || Array.isArray(coordinate)) return null;

  const lat = finiteNumber(coordinate.lat ?? coordinate.latitude);
  const lng = finiteNumber(coordinate.lng ?? coordinate.longitude ?? coordinate.lon);
  if (lat == null || lng == null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  const ele = finiteNumber(coordinate.ele ?? coordinate.ele_m ?? coordinate.elevationM ?? coordinate.elevation_m);
  const elevationFeet = finiteNumber(coordinate.elevationFeet ?? coordinate.elevation_ft);
  return {
    lat,
    lng,
    ...(ele != null ? { ele, ele_m: ele } : null),
    ...(elevationFeet != null ? { elevationFeet } : null),
  };
}

function normalizeCoordinateList(value: unknown): EcsGuidanceCoordinate[] | undefined {
  const rawCoordinates = Array.isArray((value as any)?.coordinates)
    ? (value as any).coordinates
    : Array.isArray(value)
      ? value
      : [];
  const coordinates = rawCoordinates
    .map(normalizeCoordinate)
    .filter((coordinate: EcsGuidanceCoordinate | null): coordinate is EcsGuidanceCoordinate => !!coordinate);
  return coordinates.length > 0 ? coordinates : undefined;
}

function normalizeInstructionList(input: unknown): any[] {
  return Array.isArray(input) ? input : [];
}

function normalizeBannerInstructions(step: any): EcsGuidanceBannerInstruction[] | undefined {
  const instructions = normalizeInstructionList(step?.bannerInstructions ?? step?.banner_instructions)
    .map((item: any): EcsGuidanceBannerInstruction | null => {
      const primary = item?.primary ?? null;
      const secondary = item?.secondary ?? null;
      const sub = item?.sub ?? null;
      const instruction: EcsGuidanceBannerInstruction = {
        distanceAlongGeometryMeters: finiteNumber(item?.distanceAlongGeometry),
        primaryText: cleanString(primary?.text),
        primaryType: cleanString(primary?.type),
        primaryModifier: cleanString(primary?.modifier),
        secondaryText: cleanString(secondary?.text),
        subText: cleanString(sub?.text),
      };
      const hasContent = Object.values(instruction).some((value) => value != null);
      return hasContent ? instruction : null;
    })
    .filter((item): item is EcsGuidanceBannerInstruction => !!item);
  return instructions.length > 0 ? instructions : undefined;
}

function normalizeVoiceInstructions(step: any): EcsGuidanceVoiceInstruction[] | undefined {
  const instructions = normalizeInstructionList(step?.voiceInstructions ?? step?.voice_instructions)
    .map((item: any): EcsGuidanceVoiceInstruction | null => {
      const instruction: EcsGuidanceVoiceInstruction = {
        distanceAlongGeometryMeters: finiteNumber(item?.distanceAlongGeometry),
        announcement: cleanString(item?.announcement),
        ssmlAnnouncement: cleanString(item?.ssmlAnnouncement ?? item?.ssml_announcement),
      };
      const hasContent = Object.values(instruction).some((value) => value != null);
      return hasContent ? instruction : null;
    })
    .filter((item): item is EcsGuidanceVoiceInstruction => !!item);
  return instructions.length > 0 ? instructions : undefined;
}

function unnamedRoadLabel(kind: NormalizeMapboxDirectionsRouteOptions['unnamedRouteKind']): string {
  if (kind === 'trail') return 'Unnamed trail';
  if (kind === 'path') return 'Unnamed path';
  return 'Unnamed road';
}

function isArrivalType(type: string): boolean {
  return type === 'arrive' || type === 'arrival';
}

function isRoadLikeBannerPrimary(value: string | null): boolean {
  if (!value) return false;
  const lower = value.toLowerCase();
  if (
    lower.startsWith('turn ') ||
    lower.startsWith('continue ') ||
    lower.startsWith('head ') ||
    lower.startsWith('make ') ||
    lower.startsWith('at the roundabout') ||
    lower.includes('arrive')
  ) {
    return false;
  }
  return /[a-z0-9]/i.test(value);
}

function getBannerPrimaryRoadName(bannerInstructions: EcsGuidanceBannerInstruction[] | undefined): string | null {
  const primaryText = bannerInstructions
    ?.map((instruction) => instruction.primaryText)
    .find((text) => isRoadLikeBannerPrimary(text));
  return primaryText ?? null;
}

function resolveDisplayRoadName(input: {
  step: any;
  bannerInstructions: EcsGuidanceBannerInstruction[] | undefined;
  destinationName: string | null;
  unnamedLabel: string;
  maneuverType: string;
}): { displayRoadName: string; roadName?: string; isUnnamedRoad: boolean } {
  if (isArrivalType(input.maneuverType)) {
    return {
      displayRoadName: input.destinationName ?? 'Destination',
      roadName: input.destinationName ?? 'Destination',
      isUnnamedRoad: false,
    };
  }

  const stepName = cleanString(input.step?.name);
  if (stepName) {
    return { displayRoadName: stepName, roadName: stepName, isUnnamedRoad: false };
  }

  const bannerRoadName = getBannerPrimaryRoadName(input.bannerInstructions);
  if (bannerRoadName) {
    return { displayRoadName: bannerRoadName, roadName: undefined, isUnnamedRoad: false };
  }

  return { displayRoadName: input.unnamedLabel, roadName: undefined, isUnnamedRoad: true };
}

function formatModifier(modifier: string | null): string {
  if (!modifier) return '';
  if (modifier === 'uturn' || modifier === 'u-turn') return 'U-turn';
  return modifier.replace(/_/g, ' ');
}

function generateInstruction(input: {
  maneuverType: string;
  modifier: string | null;
  displayRoadName: string;
  exit?: number | null;
}): string {
  const modifier = formatModifier(input.modifier);
  const roadName = input.displayRoadName;

  if (input.maneuverType === 'turn') {
    if (modifier === 'U-turn') return `Make a U-turn onto ${roadName}`;
    return modifier ? `Turn ${modifier} onto ${roadName}` : `Turn onto ${roadName}`;
  }

  if (input.maneuverType === 'roundabout' || input.maneuverType === 'rotary') {
    const exitLabel =
      typeof input.exit === 'number' && Number.isFinite(input.exit)
        ? `, take exit ${input.exit}`
        : '';
    return `At the roundabout${exitLabel} onto ${roadName}`;
  }

  if (input.maneuverType === 'depart') return `Head onto ${roadName}`;
  if (input.maneuverType === 'merge') return `Merge onto ${roadName}`;
  if (input.maneuverType === 'fork') return modifier ? `Keep ${modifier} onto ${roadName}` : `Keep onto ${roadName}`;
  if (input.maneuverType === 'continue' || input.maneuverType === 'new name') return `Continue on ${roadName}`;
  return `Continue on ${roadName}`;
}

function resolveInstruction(input: {
  step: any;
  maneuverType: string;
  modifier: string | null;
  displayRoadName: string;
}): string {
  if (isArrivalType(input.maneuverType)) {
    return 'You have arrived at your destination';
  }

  const direct = cleanString(input.step?.maneuver?.instruction);
  if (direct) return direct;

  const generated = generateInstruction({
    maneuverType: input.maneuverType,
    modifier: input.modifier,
    displayRoadName: input.displayRoadName,
    exit: finiteNumber(input.step?.maneuver?.exit),
  });
  return generated || 'Continue on Unnamed road';
}

function resolveShortInstruction(instruction: string, input: {
  maneuverType: string;
  modifier: string | null;
  displayRoadName: string;
}): string {
  if (isArrivalType(input.maneuverType)) return 'Arrived';
  const modifier = formatModifier(input.modifier);
  if (input.maneuverType === 'turn' && modifier === 'U-turn') {
    return `U-turn onto ${input.displayRoadName}`;
  }
  return instruction;
}

function normalizeManeuverType(step: any): string {
  return cleanString(step?.maneuver?.type)?.toLowerCase() ?? 'continue';
}

function normalizeManeuverModifier(step: any): string | null {
  return cleanString(step?.maneuver?.modifier)?.toLowerCase() ?? null;
}

function normalizeBearing(value: unknown): number | undefined {
  const bearing = finiteNumber(value);
  return bearing == null ? undefined : bearing;
}

function normalizeStep(input: {
  step: any;
  legIndex: number;
  stepIndex: number;
  globalStepIndex: number;
  destinationName: string | null;
  unnamedLabel: string;
}): EcsGuidanceStep {
  const bannerInstructions = normalizeBannerInstructions(input.step);
  const voiceInstructions = normalizeVoiceInstructions(input.step);
  const maneuverType = normalizeManeuverType(input.step);
  const maneuverModifier = normalizeManeuverModifier(input.step);
  const display = resolveDisplayRoadName({
    step: input.step,
    bannerInstructions,
    destinationName: input.destinationName,
    unnamedLabel: input.unnamedLabel,
    maneuverType,
  });
  const instruction = resolveInstruction({
    step: input.step,
    maneuverType,
    modifier: maneuverModifier,
    displayRoadName: display.displayRoadName,
  });
  const geometry = normalizeCoordinateList(input.step?.geometry);
  const maneuverLocation = normalizeLngLat(input.step?.maneuver?.location);
  const distanceMeters = finiteNumber(input.step?.distance) ?? 0;
  const durationSeconds = finiteNumber(input.step?.duration) ?? 0;
  const bearingBefore = normalizeBearing(input.step?.maneuver?.bearing_before ?? input.step?.maneuver?.bearingBefore);
  const bearingAfter = normalizeBearing(input.step?.maneuver?.bearing_after ?? input.step?.maneuver?.bearingAfter);
  const mode = cleanString(input.step?.mode) ?? undefined;

  return {
    id: `${input.legIndex}-${input.stepIndex}-${maneuverType}`,
    legIndex: input.legIndex,
    stepIndex: input.stepIndex,
    globalStepIndex: input.globalStepIndex,
    instruction,
    shortInstruction: resolveShortInstruction(instruction, {
      maneuverType,
      modifier: maneuverModifier,
      displayRoadName: display.displayRoadName,
    }),
    maneuverType,
    ...(maneuverModifier ? { maneuverModifier } : null),
    ...(display.roadName ? { roadName: display.roadName } : null),
    displayRoadName: display.displayRoadName,
    isUnnamedRoad: display.isUnnamedRoad,
    distanceMeters,
    durationSeconds,
    ...(maneuverLocation ? { maneuverLocation } : null),
    ...(bearingBefore != null ? { bearingBefore } : null),
    ...(bearingAfter != null ? { bearingAfter } : null),
    ...(geometry ? { geometry } : null),
    ...(bannerInstructions ? { bannerInstructions } : null),
    ...(voiceInstructions ? { voiceInstructions } : null),
    ...(mode ? { mode } : null),
  };
}

function normalizeRouteUuid(route: any): string | undefined {
  return cleanString(route?.uuid ?? route?.route_uuid ?? route?.routeUuid) ?? undefined;
}

function normalizeRouteGeometry(route: any): EcsGuidanceCoordinate[] {
  return normalizeCoordinateList(route?.geometry) ?? [];
}

function toRad(value: number): number {
  return (value * Math.PI) / 180;
}

function toDeg(value: number): number {
  return (value * 180) / Math.PI;
}

function distanceMeters(a: EcsGuidanceCoordinate, b: EcsGuidanceCoordinate): number {
  const earthRadiusM = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * earthRadiusM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function lineDistanceMeters(points: EcsGuidanceCoordinate[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += distanceMeters(points[index - 1], points[index]);
  }
  return total;
}

function bearingDegrees(a: EcsGuidanceCoordinate, b: EcsGuidanceCoordinate): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function normalizeTurnDeltaDegrees(nextBearing: number, previousBearing: number): number {
  return ((((nextBearing - previousBearing) % 360) + 540) % 360) - 180;
}

function syntheticTurnModifier(deltaDegrees: number): string | null {
  const abs = Math.abs(deltaDegrees);
  if (abs < 18) return null;
  if (abs >= 150) return 'uturn';
  if (abs < 45) return deltaDegrees > 0 ? 'slight right' : 'slight left';
  return deltaDegrees > 0 ? 'right' : 'left';
}

function sourceLabelForGuidance(
  source: EcsGuidanceRouteSource | null | undefined,
  guidanceMode: EcsGuidanceMode | null | undefined,
): EcsGuidanceSourceLabel {
  if (guidanceMode !== 'turn_by_turn') return 'Summary only';
  if (source === 'mapbox_directions') return 'Mapbox turn-by-turn';
  if (source === 'imported_trace') return 'Imported route guidance';
  if (source === 'ecs_verified_route' || source === 'trail_catalog') return 'ECS verified route guidance';
  return 'Summary only';
}

export function getEcsGuidanceSourceLabel(route: Pick<EcsGuidanceRoute, 'source' | 'guidanceMode' | 'guidanceSourceLabel'> | null | undefined): EcsGuidanceSourceLabel {
  return route?.guidanceSourceLabel ?? sourceLabelForGuidance(route?.source, route?.guidanceMode);
}

function unnamedSyntheticLabel(kind: EcsSyntheticGuidanceRouteKind | null | undefined): string {
  if (kind === 'trail' || kind === 'offroad') return 'Unnamed trail';
  if (kind === 'path') return 'Unnamed path';
  return 'Unnamed road';
}

function segmentNameFromEntry(entry: EcsSyntheticSegmentName): string | null {
  if (typeof entry === 'string') return cleanString(entry);
  if (!entry || typeof entry !== 'object') return null;
  return cleanString(entry.name ?? entry.label ?? entry.title);
}

function segmentNameForIndex(
  segmentNames: EcsSyntheticSegmentName[] | null | undefined,
  segmentIndex: number,
): string | null {
  if (!Array.isArray(segmentNames) || segmentNames.length === 0) return null;
  for (const entry of segmentNames) {
    if (!entry || typeof entry !== 'object') continue;
    const startIndex = finiteNumber(entry.startIndex);
    const explicitSegmentIndex = finiteNumber(entry.segmentIndex);
    if (startIndex === segmentIndex || explicitSegmentIndex === segmentIndex) {
      return segmentNameFromEntry(entry);
    }
  }
  return segmentNameFromEntry(segmentNames[Math.min(Math.max(0, segmentIndex), segmentNames.length - 1)]);
}

function displayNameForSyntheticStep(input: {
  segmentNames?: EcsSyntheticSegmentName[] | null;
  segmentIndex: number;
  routeKind?: EcsSyntheticGuidanceRouteKind | null;
}): { displayRoadName: string; roadName?: string; isUnnamedRoad: boolean } {
  const segmentName = segmentNameForIndex(input.segmentNames, input.segmentIndex);
  if (segmentName) {
    return { displayRoadName: segmentName, roadName: segmentName, isUnnamedRoad: false };
  }
  return {
    displayRoadName: unnamedSyntheticLabel(input.routeKind),
    isUnnamedRoad: true,
  };
}

function syntheticInstruction(input: {
  maneuverType: string;
  maneuverModifier: string | null;
  displayRoadName: string;
  routeKind?: EcsSyntheticGuidanceRouteKind | null;
  isUnnamedRoad: boolean;
}): string {
  if (input.maneuverType === 'arrive') return 'You have arrived at your destination';
  if (input.maneuverType === 'turn') {
    if (input.maneuverModifier === 'uturn') return 'Make a U-turn when safe';
    if (input.maneuverModifier === 'slight left') return `Bear left on ${input.displayRoadName}`;
    if (input.maneuverModifier === 'slight right') return `Bear right on ${input.displayRoadName}`;
    if (input.maneuverModifier === 'left') return `Turn left on ${input.displayRoadName}`;
    if (input.maneuverModifier === 'right') return `Turn right on ${input.displayRoadName}`;
  }
  if ((input.routeKind === 'trail' || input.routeKind === 'offroad') && input.isUnnamedRoad) {
    return 'Follow the trail';
  }
  if (input.routeKind === 'path' && input.isUnnamedRoad) {
    return 'Follow the path';
  }
  return `Continue on ${input.displayRoadName}`;
}

function syntheticShortInstruction(instruction: string, modifier: string | null): string {
  if (instruction === 'You have arrived at your destination') return 'Arrived';
  if (modifier === 'uturn') return 'U-turn when safe';
  return instruction;
}

type SyntheticManeuver = {
  geometryIndex: number;
  maneuverType: 'continue' | 'turn' | 'arrive';
  maneuverModifier: string | null;
  bearingBefore?: number;
  bearingAfter?: number;
};

function buildSyntheticManeuvers(geometry: EcsGuidanceCoordinate[]): SyntheticManeuver[] {
  if (geometry.length < 2) return [];
  const maneuvers: SyntheticManeuver[] = [
    {
      geometryIndex: 0,
      maneuverType: 'continue',
      maneuverModifier: null,
      bearingAfter: bearingDegrees(geometry[0], geometry[1]),
    },
  ];

  for (let index = 1; index < geometry.length - 1; index += 1) {
    const previousBearing = bearingDegrees(geometry[index - 1], geometry[index]);
    const nextBearing = bearingDegrees(geometry[index], geometry[index + 1]);
    const modifier = syntheticTurnModifier(normalizeTurnDeltaDegrees(nextBearing, previousBearing));
    if (!modifier) continue;
    maneuvers.push({
      geometryIndex: index,
      maneuverType: 'turn',
      maneuverModifier: modifier,
      bearingBefore: previousBearing,
      bearingAfter: nextBearing,
    });
  }

  maneuvers.push({
    geometryIndex: geometry.length - 1,
    maneuverType: 'arrive',
    maneuverModifier: null,
    bearingBefore: bearingDegrees(geometry[geometry.length - 2], geometry[geometry.length - 1]),
  });

  return maneuvers;
}

export function buildSyntheticEcsGuidanceRouteFromGeometry(
  options: BuildSyntheticEcsGuidanceRouteOptions,
): EcsGuidanceRoute {
  const geometry = normalizeCoordinateList(options.geometry) ?? [];
  const createdAt = cleanString(options.createdAt) ?? new Date().toISOString();
  const rerouteGeneration = finiteNumber(options.rerouteGeneration) ?? 0;
  const measuredDistanceMeters = lineDistanceMeters(geometry);
  const distanceMeters =
    finiteNumber(options.distanceMeters) ??
    measuredDistanceMeters;
  const durationSeconds =
    finiteNumber(options.durationSeconds) ??
    (distanceMeters > 0 ? Math.max(60, Math.round(distanceMeters / 6)) : 0);
  const guidanceLimitationLabel =
    cleanString(options.guidanceLimitationLabel) ??
    (options.limitedTrailGuidance
      ? 'Verified trail geometry available, turn-by-turn detail limited'
      : null);

  if (
    geometry.length < 2 ||
    options.source === 'summary_only' ||
    options.limitedTrailGuidance
  ) {
    const guidanceMode: EcsGuidanceMode = geometry.length < 2 ? 'unavailable' : 'summary_only';
    return {
      id: options.id,
      source: options.source,
      geometry,
      distanceMeters,
      durationSeconds,
      ...(cleanString(options.etaIso) ? { etaIso: cleanString(options.etaIso) as string } : null),
      legs: [],
      steps: [],
      createdAt,
      rerouteGeneration,
      guidanceMode,
      guidanceSourceLabel: sourceLabelForGuidance(options.source, guidanceMode),
      ...(guidanceLimitationLabel ? { guidanceLimitationLabel } : null),
    };
  }

  const maneuvers = buildSyntheticManeuvers(geometry);
  const steps: EcsGuidanceStep[] = maneuvers.map((maneuver, stepIndex) => {
    const nextManeuver = maneuvers[stepIndex + 1] ?? maneuver;
    const segmentEndIndex =
      maneuver.maneuverType === 'arrive'
        ? maneuver.geometryIndex
        : Math.max(maneuver.geometryIndex + 1, nextManeuver.geometryIndex);
    const stepGeometry =
      maneuver.maneuverType === 'arrive'
        ? [geometry[maneuver.geometryIndex]]
        : geometry.slice(maneuver.geometryIndex, segmentEndIndex + 1);
    const display =
      maneuver.maneuverType === 'arrive'
        ? {
            displayRoadName: cleanString(options.destinationName) ?? 'Destination',
            roadName: cleanString(options.destinationName) ?? 'Destination',
            isUnnamedRoad: false,
          }
        : displayNameForSyntheticStep({
            segmentNames: options.segmentNames,
            segmentIndex: maneuver.geometryIndex,
            routeKind: options.routeKind,
          });
    const instruction = syntheticInstruction({
      maneuverType: maneuver.maneuverType,
      maneuverModifier: maneuver.maneuverModifier,
      displayRoadName: display.displayRoadName,
      routeKind: options.routeKind,
      isUnnamedRoad: display.isUnnamedRoad,
    });
    const distance = maneuver.maneuverType === 'arrive' ? 0 : lineDistanceMeters(stepGeometry);
    const duration =
      distanceMeters > 0 && durationSeconds > 0
        ? Math.round((distance / distanceMeters) * durationSeconds)
        : 0;

    return {
      id: `${options.id}-synthetic-${stepIndex}-${maneuver.maneuverType}`,
      legIndex: 0,
      stepIndex,
      globalStepIndex: stepIndex,
      instruction,
      shortInstruction: syntheticShortInstruction(instruction, maneuver.maneuverModifier),
      maneuverType: maneuver.maneuverType,
      ...(maneuver.maneuverModifier ? { maneuverModifier: maneuver.maneuverModifier } : null),
      ...(display.roadName ? { roadName: display.roadName } : null),
      displayRoadName: display.displayRoadName,
      isUnnamedRoad: display.isUnnamedRoad,
      distanceMeters: distance,
      durationSeconds: duration,
      maneuverLocation: [geometry[maneuver.geometryIndex].lng, geometry[maneuver.geometryIndex].lat],
      ...(maneuver.bearingBefore != null ? { bearingBefore: maneuver.bearingBefore } : null),
      ...(maneuver.bearingAfter != null ? { bearingAfter: maneuver.bearingAfter } : null),
      ...(stepGeometry.length > 1 ? { geometry: stepGeometry } : null),
      mode: options.routeKind ?? 'road',
    };
  });

  const guidanceMode: EcsGuidanceMode = steps.length > 0 ? 'turn_by_turn' : 'summary_only';
  return {
    id: options.id,
    source: options.source,
    geometry,
    distanceMeters,
    durationSeconds,
    ...(cleanString(options.etaIso) ? { etaIso: cleanString(options.etaIso) as string } : null),
    legs: [
      {
        legIndex: 0,
        distanceMeters,
        durationSeconds,
        summary: 'Synthetic geometry guidance',
        steps,
      },
    ],
    steps,
    createdAt,
    rerouteGeneration,
    guidanceMode,
    guidanceSourceLabel: sourceLabelForGuidance(options.source, guidanceMode),
    ...(guidanceLimitationLabel ? { guidanceLimitationLabel } : null),
  };
}

export function normalizeMapboxDirectionsRouteToEcsGuidanceRoute(
  route: any,
  options: NormalizeMapboxDirectionsRouteOptions,
): EcsGuidanceRoute {
  const destinationName = cleanString(options.destinationName) ?? null;
  const unnamedLabel = unnamedRoadLabel(options.unnamedRouteKind);
  const legs: EcsGuidanceLeg[] = [];
  const flattenedSteps: EcsGuidanceStep[] = [];
  const rawLegs = Array.isArray(route?.legs) ? route.legs : [];

  rawLegs.forEach((leg: any, legIndex: number) => {
    const rawSteps = Array.isArray(leg?.steps) ? leg.steps : [];
    const legSteps = rawSteps.map((step: any, stepIndex: number) => {
      const normalized = normalizeStep({
        step,
        legIndex,
        stepIndex,
        globalStepIndex: flattenedSteps.length,
        destinationName,
        unnamedLabel,
      });
      flattenedSteps.push(normalized);
      return normalized;
    });

    legs.push({
      legIndex,
      distanceMeters: finiteNumber(leg?.distance) ?? 0,
      durationSeconds: finiteNumber(leg?.duration) ?? 0,
      ...(cleanString(leg?.summary) ? { summary: cleanString(leg.summary) as string } : null),
      steps: legSteps,
    });
  });

  const guidanceMode: EcsGuidanceMode =
    flattenedSteps.length > 0
      ? 'turn_by_turn'
      : rawLegs.length > 0 || normalizeRouteGeometry(route).length > 0
        ? 'summary_only'
        : 'unavailable';
  const etaIso = cleanString(options.etaIso);
  const routeUuid = normalizeRouteUuid(route);

  const source = options.source ?? 'mapbox_directions';

  return {
    id: options.id,
    source,
    ...(routeUuid ? { routeUuid } : null),
    geometry: normalizeRouteGeometry(route),
    distanceMeters: finiteNumber(route?.distance) ?? 0,
    durationSeconds: finiteNumber(route?.duration) ?? 0,
    ...(etaIso ? { etaIso } : null),
    legs,
    steps: flattenedSteps,
    createdAt: cleanString(options.createdAt) ?? new Date().toISOString(),
    rerouteGeneration: finiteNumber(options.rerouteGeneration) ?? 0,
    guidanceMode,
    guidanceSourceLabel: sourceLabelForGuidance(source, guidanceMode),
  };
}
