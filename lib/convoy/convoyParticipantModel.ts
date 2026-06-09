import {
  CONVOY_COMMAND_V15_BADGE_IDENTITY_STATUS,
  CONVOY_COMMAND_V15_LIVE_LOCATION_MAX_AGE_MS,
  CONVOY_COMMAND_V15_PRIVACY_SCOPE,
  buildConvoyV15ParticipantContract,
  normalizeConvoyV15Role,
  roleSemanticsForConvoyV15Role,
  type ConvoyV15Coordinate,
  type ConvoyV15Role,
} from './convoyCommandV15Readiness';
import type { ConvoyMapVehicle } from './convoyRealtimeService';
import {
  BADGE_IDENTITY_TITLE_TIERS,
  type BadgeIdentityTitle,
} from '../expedition/badgeExpeditionIdentityReadiness';

export type ConvoyParticipantStatus = 'live' | 'stale' | 'disconnected' | 'unknown' | 'demo';
export type ConvoyParticipantSource = 'live' | 'cached' | 'mock' | 'demo' | 'unknown';
export type ConvoyParticipantBadgeIdentitySource = 'scoped_convoy_snapshot' | 'qa_fixture' | 'unavailable' | 'untrusted';

export interface ConvoyParticipantInput {
  convoyId?: unknown;
  participantId?: unknown;
  activeParticipant?: boolean | null;
  fixtureOnly?: boolean | null;
  displayName?: unknown;
  vehicleSummary?: unknown;
  role?: unknown;
  coordinates?: Partial<ConvoyV15Coordinate> | null;
  headingDegrees?: unknown;
  speedMps?: unknown;
  lastUpdated?: string | number | Date | null;
  movementStatus?: unknown;
  source?: unknown;
  expeditionBadgeTitle?: unknown;
  nowMs?: number;
}

export interface ConvoyParticipant {
  participantId: string;
  displayName: string;
  vehicleSummary: string | null;
  role: ConvoyV15Role;
  roleLabel: string;
  roleCopy: string;
  coordinates: ConvoyV15Coordinate | null;
  headingDegrees: number | null;
  speedMps: number | null;
  lastUpdated: string | null;
  status: ConvoyParticipantStatus;
  statusLabel: string;
  statusCopy: string;
  source: ConvoyParticipantSource;
  sourceLabel: string;
  isFixtureOnly: boolean;
  isProductionLive: boolean;
  privacyScope: typeof CONVOY_COMMAND_V15_PRIVACY_SCOPE.scope;
  convoyId: string | null;
  shouldRenderMarker: boolean;
  needsAssistance: boolean;
  recoveryFlag: boolean;
  badgeIdentity: {
    status: typeof CONVOY_COMMAND_V15_BADGE_IDENTITY_STATUS;
    title: BadgeIdentityTitle | null;
    source: ConvoyParticipantBadgeIdentitySource;
    copy: string;
    isCredential: false;
  };
}

export interface BuildConvoyParticipantsFromMapVehiclesOptions {
  convoyId?: unknown;
  source?: unknown;
  nowMs?: number;
}

export const CONVOY_PARTICIPANT_LIVE_MAX_AGE_MS = CONVOY_COMMAND_V15_LIVE_LOCATION_MAX_AGE_MS;
const BADGE_IDENTITY_TITLES = new Set(BADGE_IDENTITY_TITLE_TIERS.map((tier) => tier.title));

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function compactText(value: unknown): string | null {
  const normalized = text(value).replace(/\s+/g, ' ');
  return normalized || null;
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeCoordinate(value: Partial<ConvoyV15Coordinate> | null | undefined): ConvoyV15Coordinate | null {
  const latitude = finite(value?.latitude);
  const longitude = finite(value?.longitude);
  if (latitude == null || longitude == null) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

function timestampIso(value: string | number | Date | null | undefined): string | null {
  if (value == null || value === '') return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function normalizeSource(value: unknown): ConvoyParticipantSource {
  const source = text(value).toLowerCase();
  if (!source) return 'unknown';
  if (source.includes('demo') || source.includes('fixture')) return 'demo';
  if (source.includes('mock') || source.includes('test_only') || source.includes('test-only')) return 'mock';
  if (source.includes('cache') || source.includes('cached') || source.includes('offline') || source.includes('local_pending')) {
    return 'cached';
  }
  if (source.includes('live') || source.includes('realtime') || source.includes('supabase') || source.includes('cloud')) {
    return 'live';
  }
  return 'unknown';
}

function statusLabel(status: ConvoyParticipantStatus): string {
  switch (status) {
    case 'live':
      return 'Live';
    case 'stale':
      return 'Stale';
    case 'disconnected':
      return 'Disconnected';
    case 'demo':
      return 'Demo';
    case 'unknown':
    default:
      return 'Unknown';
  }
}

function statusCopy(status: ConvoyParticipantStatus, reason: string): string {
  switch (status) {
    case 'live':
      return 'Recent active convoy location update.';
    case 'stale':
      return reason || 'last known location is stale.';
    case 'disconnected':
      return 'Participant is known, but no current signal is available.';
    case 'demo':
      return 'Demo/mock convoy data is not production live.';
    case 'unknown':
    default:
      return 'Participant status is unknown.';
  }
}

function sourceLabel(source: ConvoyParticipantSource): string {
  switch (source) {
    case 'live':
      return 'Live convoy sharing';
    case 'cached':
      return 'Cached/last known convoy data';
    case 'mock':
      return 'Mock convoy data';
    case 'demo':
      return 'Demo convoy data';
    case 'unknown':
    default:
      return 'Source unknown';
  }
}

function fixtureStatusCopy(status: ConvoyParticipantStatus): string | null {
  if (status !== 'live') return null;
  return 'Recent QA fixture update; not production live.';
}

function participantStatusFromContract(
  contractStatus: ReturnType<typeof buildConvoyV15ParticipantContract>['status']['status'],
  source: ConvoyParticipantSource,
): ConvoyParticipantStatus {
  if (contractStatus === 'mock_demo' || source === 'mock' || source === 'demo') return 'demo';
  return contractStatus;
}

function sourceForContract(source: ConvoyParticipantSource): string {
  if (source === 'mock') return 'mock';
  if (source === 'demo') return 'demo';
  return source;
}

function normalizeBadgeIdentityTitle(value: unknown): BadgeIdentityTitle | null {
  const title = compactText(value);
  return title && BADGE_IDENTITY_TITLES.has(title as BadgeIdentityTitle) ? title as BadgeIdentityTitle : null;
}

function badgeIdentityForParticipant(input: {
  convoyId: string | null;
  participantId: string | null;
  activeParticipant?: boolean | null;
  fixtureOnly: boolean;
  source: ConvoyParticipantSource;
  title: unknown;
}): ConvoyParticipant['badgeIdentity'] {
  const requestedTitle = compactText(input.title);
  const title = normalizeBadgeIdentityTitle(input.title);
  if (!requestedTitle) {
    return {
      status: CONVOY_COMMAND_V15_BADGE_IDENTITY_STATUS,
      title: null,
      source: 'unavailable',
      copy: 'No Expedition Identity title snapshot is available for this participant.',
      isCredential: false,
    };
  }

  const scopedIdentityKnown = Boolean(input.convoyId && input.participantId);
  const untrusted =
    !title ||
    !scopedIdentityKnown ||
    input.activeParticipant === false ||
    input.source === 'mock' ||
    input.source === 'demo';

  if (untrusted) {
    return {
      status: CONVOY_COMMAND_V15_BADGE_IDENTITY_STATUS,
      title: null,
      source: 'untrusted',
      copy: 'Expedition Identity title is unavailable or not trusted for this convoy participant.',
      isCredential: false,
    };
  }

  return {
    status: CONVOY_COMMAND_V15_BADGE_IDENTITY_STATUS,
    title,
    source: input.fixtureOnly ? 'qa_fixture' : 'scoped_convoy_snapshot',
    copy: input.fixtureOnly
      ? 'Read-only QA fixture title; not production membership or badge progress.'
      : 'Read-only Expedition Identity title from the scoped convoy participant snapshot.',
    isCredential: false,
  };
}

export function buildConvoyParticipant(input: ConvoyParticipantInput): ConvoyParticipant {
  const source = normalizeSource(input.source);
  const fixtureOnly = input.fixtureOnly === true;
  const coordinates = normalizeCoordinate(input.coordinates);
  const lastUpdated = timestampIso(input.lastUpdated);
  const participantId = compactText(input.participantId);
  const convoyId = compactText(input.convoyId);
  const contract = buildConvoyV15ParticipantContract({
    convoyId: input.convoyId,
    convoySource: sourceForContract(source),
    participantId: input.participantId,
    activeParticipant: input.activeParticipant,
    displayName: input.displayName,
    vehicleLabel: input.vehicleSummary,
    role: input.role,
    location: coordinates,
    headingDegrees: input.headingDegrees,
    speedMps: input.speedMps,
    updatedAt: lastUpdated,
    movementStatus: input.movementStatus,
    sourceKind: sourceForContract(source),
    nowMs: input.nowMs,
  });
  const role = normalizeConvoyV15Role(input.role);
  const roleSemantics = roleSemanticsForConvoyV15Role(role);
  const status = participantStatusFromContract(contract.status.status, source);

  return {
    participantId: participantId ?? 'unknown-participant',
    displayName: compactText(input.displayName) ?? 'Convoy member',
    vehicleSummary: compactText(input.vehicleSummary),
    role,
    roleLabel: roleSemantics.label,
    roleCopy: roleSemantics.copy,
    coordinates,
    headingDegrees: finite(input.headingDegrees),
    speedMps: finite(input.speedMps),
    lastUpdated,
    status,
    statusLabel: statusLabel(status),
    statusCopy: fixtureOnly
      ? fixtureStatusCopy(status) ?? statusCopy(status, contract.status.reason)
      : statusCopy(status, contract.status.reason),
    source,
    sourceLabel: sourceLabel(source),
    isFixtureOnly: fixtureOnly,
    isProductionLive: !fixtureOnly && contract.status.isProductionLive && status === 'live' && source === 'live',
    privacyScope: CONVOY_COMMAND_V15_PRIVACY_SCOPE.scope,
    convoyId,
    shouldRenderMarker: Boolean(coordinates),
    needsAssistance: contract.emergency.needsAssistance,
    recoveryFlag: contract.emergency.recoveryFlag,
    badgeIdentity: badgeIdentityForParticipant({
      convoyId,
      participantId,
      activeParticipant: input.activeParticipant,
      fixtureOnly,
      source,
      title: input.expeditionBadgeTitle,
    }),
  };
}

export function buildConvoyParticipantsFromMapVehicles(
  members: ConvoyMapVehicle[],
  options: BuildConvoyParticipantsFromMapVehiclesOptions = {},
): ConvoyParticipant[] {
  return members.map((member) =>
    buildConvoyParticipant({
      convoyId: options.convoyId,
      participantId: member.participantId === undefined ? member.memberId : member.participantId,
      activeParticipant: member.participantActive === undefined ? member.movementStatus !== 'offline' : member.participantActive,
      fixtureOnly: member.participantFixtureOnly,
      displayName: member.callsign || member.displayName,
      vehicleSummary: (member as ConvoyMapVehicle & { vehicleSummary?: string | null }).vehicleSummary ?? null,
      role: member.participantRole ?? member.role,
      coordinates: {
        latitude: member.latitude,
        longitude: member.longitude,
      },
      headingDegrees: member.headingDegrees,
      speedMps: member.speedMps,
      lastUpdated: member.updatedAt ?? member.capturedAt,
      movementStatus: member.isStale ? 'stale' : member.movementStatus,
      source: member.participantSource ?? options.source ?? (member.isStale ? 'cached' : 'live'),
      expeditionBadgeTitle: member.expeditionBadgeTitle,
      nowMs: options.nowMs,
    }),
  );
}

export function formatConvoyParticipantLastUpdated(participant: Pick<ConvoyParticipant, 'lastUpdated'>, nowMs = Date.now()): string {
  if (!participant.lastUpdated) return 'No update';
  const updatedMs = new Date(participant.lastUpdated).getTime();
  if (!Number.isFinite(updatedMs)) return 'No update';
  const ageMinutes = Math.max(0, Math.floor((nowMs - updatedMs) / 60_000));
  if (ageMinutes < 1) return 'Just now';
  if (ageMinutes < 60) return `${ageMinutes}m ago`;
  return `${Math.floor(ageMinutes / 60)}h ago`;
}
