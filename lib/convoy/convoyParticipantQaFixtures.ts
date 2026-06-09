import type { ConvoyMapVehicle } from './convoyRealtimeService';
import {
  buildConvoyParticipantsFromMapVehicles,
  type ConvoyParticipant,
  type ConvoyParticipantStatus,
} from './convoyParticipantModel';

export interface ConvoyParticipantQaHarnessEnvironment {
  dev?: boolean;
  nodeEnv?: string;
}

export interface ConvoyParticipantQaValidationRow {
  label: string;
  value: string;
  state: 'ok' | 'watch' | 'caution' | 'unknown' | 'non_live';
}

export interface ConvoyParticipantQaFixture {
  id: ConvoyParticipantQaScenarioId;
  title: string;
  description: string;
  disclosure: string;
  expectedStatus: ConvoyParticipantStatus;
  expectedRoleLabel: string;
  markerEligible: boolean;
  member: ConvoyMapVehicle;
  validationRows: ConvoyParticipantQaValidationRow[];
}

export const CONVOY_PARTICIPANT_QA_CONVOY_ID = 'convoy-participant-qa-dev-only';

export const CONVOY_PARTICIPANT_QA_FIXTURE_SCENARIO_IDS = [
  'live_leader',
  'stale_tail',
  'disconnected_member',
  'unknown_scout',
  'missing_coordinates_recovery',
  'demo_medic',
  'mock_member',
] as const;

export type ConvoyParticipantQaScenarioId = typeof CONVOY_PARTICIPANT_QA_FIXTURE_SCENARIO_IDS[number];

const POINTS = {
  lead: { latitude: 38.78068, longitude: -121.20761 },
  tail: { latitude: 38.77895, longitude: -121.21412 },
  medic: { latitude: 38.78212, longitude: -121.2037 },
  mock: { latitude: 38.77662, longitude: -121.21092 },
} as const;

function runtimeNodeEnv(): string | undefined {
  return typeof process !== 'undefined' && process?.env ? process.env.NODE_ENV : undefined;
}

export function isConvoyParticipantQaHarnessEnabled(
  environment: ConvoyParticipantQaHarnessEnvironment = {},
): boolean {
  const dev =
    typeof environment.dev === 'boolean'
      ? environment.dev
      : typeof __DEV__ !== 'undefined' && __DEV__ === true;
  const nodeEnv = environment.nodeEnv ?? runtimeNodeEnv();
  return dev || nodeEnv === 'test';
}

function isoMinutesAgo(nowMs: number, minutesAgo: number): string {
  return new Date(nowMs - minutesAgo * 60_000).toISOString();
}

function qaMember(
  id: string,
  overrides: Partial<ConvoyMapVehicle> & Pick<ConvoyMapVehicle, 'callsign' | 'role' | 'movementStatus'>,
): ConvoyMapVehicle {
  return {
    memberId: id,
    participantId: id,
    displayName: overrides.callsign,
    expeditionBadgeTitle: null,
    participantFixtureOnly: true,
    participantActive: overrides.movementStatus !== 'offline',
    participantSource: 'live',
    latitude: Number.NaN,
    longitude: Number.NaN,
    accuracyMeters: null,
    headingDegrees: null,
    speedMps: null,
    capturedAt: new Date().toISOString(),
    updatedAt: null,
    isStale: false,
    staleness: 'fresh',
    staleReason: null,
    vehicleSummary: null,
    ...overrides,
  };
}

function validationRows(fixture: {
  status: string;
  role: string;
  markerEligible: boolean;
  source: string;
  productionLive?: boolean;
}): ConvoyParticipantQaValidationRow[] {
  return [
    { label: 'Status', value: fixture.status, state: fixture.status === 'live' ? 'ok' : 'watch' },
    { label: 'Role', value: fixture.role, state: 'ok' },
    { label: 'Marker eligible', value: fixture.markerEligible ? 'Yes' : 'No', state: fixture.markerEligible ? 'ok' : 'unknown' },
    { label: 'Source', value: fixture.source, state: fixture.source === 'live' ? 'non_live' : 'watch' },
    { label: 'Production live', value: fixture.productionLive ? 'Yes' : 'No', state: 'non_live' },
  ];
}

function buildFixtures(nowMs: number): ConvoyParticipantQaFixture[] {
  return [
    {
      id: 'live_leader',
      title: 'Live Leader',
      description: 'Recent leader-style sample for verifying the visible Live status row.',
      disclosure: 'NON-LIVE CONVOY FIXTURE. Recent sample only; no production tracking or membership is created.',
      expectedStatus: 'live',
      expectedRoleLabel: 'Leader',
      markerEligible: true,
      member: qaMember('qa-live-leader', {
        callsign: 'QA LEAD',
        role: 'lead',
        participantRole: 'leader',
        vehicleSummary: 'Bronco / lead vehicle',
        latitude: POINTS.lead.latitude,
        longitude: POINTS.lead.longitude,
        headingDegrees: 42,
        speedMps: 5.4,
        movementStatus: 'moving',
        capturedAt: isoMinutesAgo(nowMs, 2),
        updatedAt: isoMinutesAgo(nowMs, 2),
      }),
      validationRows: validationRows({
        status: 'Live fixture',
        role: 'Leader',
        markerEligible: true,
        source: 'Live-like fixture',
      }),
    },
    {
      id: 'stale_tail',
      title: 'Stale Tail',
      description: 'Aged tail/sweep update for verifying stale copy and last-updated visibility.',
      disclosure: 'NON-LIVE CONVOY FIXTURE. Stale location is local QA data only.',
      expectedStatus: 'stale',
      expectedRoleLabel: 'Tail',
      markerEligible: true,
      member: qaMember('qa-stale-tail', {
        callsign: 'QA TAIL',
        role: 'sweep',
        participantRole: 'tail',
        vehicleSummary: 'Tacoma / tail vehicle',
        latitude: POINTS.tail.latitude,
        longitude: POINTS.tail.longitude,
        headingDegrees: 188,
        speedMps: 1.2,
        movementStatus: 'moving',
        capturedAt: isoMinutesAgo(nowMs, 28),
        updatedAt: isoMinutesAgo(nowMs, 28),
        isStale: true,
        staleness: 'stale',
        staleReason: 'QA fixture update is older than the live threshold.',
      }),
      validationRows: validationRows({
        status: 'Stale',
        role: 'Tail',
        markerEligible: true,
        source: 'Live source, aged timestamp',
      }),
    },
    {
      id: 'disconnected_member',
      title: 'Disconnected Member',
      description: 'Known member without a usable current signal.',
      disclosure: 'NON-LIVE CONVOY FIXTURE. Disconnected state does not publish or persist location.',
      expectedStatus: 'disconnected',
      expectedRoleLabel: 'Member',
      markerEligible: false,
      member: qaMember('qa-disconnected-member', {
        callsign: 'QA V2',
        role: 'member',
        participantRole: 'member',
        vehicleSummary: '4Runner / member vehicle',
        movementStatus: 'offline',
        participantActive: false,
        capturedAt: isoMinutesAgo(nowMs, 90),
        updatedAt: null,
        isStale: true,
        staleness: 'stale',
        staleReason: 'QA fixture member is disconnected.',
      }),
      validationRows: validationRows({
        status: 'Disconnected',
        role: 'Member',
        markerEligible: false,
        source: 'No usable signal',
      }),
    },
    {
      id: 'unknown_scout',
      title: 'Unknown Scout',
      description: 'Unknown participant status with a functional scout role label.',
      disclosure: 'NON-LIVE CONVOY FIXTURE. Unknown state keeps identity and location unavailable.',
      expectedStatus: 'unknown',
      expectedRoleLabel: 'Scout',
      markerEligible: false,
      member: qaMember('qa-unknown-scout-row', {
        participantId: null,
        callsign: 'Unknown scout',
        role: 'support',
        participantRole: 'scout',
        participantActive: null,
        participantSource: 'unknown',
        movementStatus: 'unknown',
        capturedAt: '',
        updatedAt: null,
      }),
      validationRows: validationRows({
        status: 'Unknown',
        role: 'Scout',
        markerEligible: false,
        source: 'Unknown',
      }),
    },
    {
      id: 'missing_coordinates_recovery',
      title: 'Missing Coordinates Recovery',
      description: 'Recovery role with no valid coordinates, used to verify marker suppression.',
      disclosure: 'NON-LIVE CONVOY FIXTURE. Recovery is a functional label, not a certification claim.',
      expectedStatus: 'disconnected',
      expectedRoleLabel: 'Recovery',
      markerEligible: false,
      member: qaMember('qa-missing-coordinates-recovery', {
        callsign: 'QA RECOVERY',
        role: 'support',
        participantRole: 'recovery',
        vehicleSummary: 'Winch rig / recovery role',
        movementStatus: 'unknown',
        capturedAt: isoMinutesAgo(nowMs, 4),
        updatedAt: isoMinutesAgo(nowMs, 4),
      }),
      validationRows: validationRows({
        status: 'Disconnected',
        role: 'Recovery',
        markerEligible: false,
        source: 'Missing coordinates',
      }),
    },
    {
      id: 'demo_medic',
      title: 'Demo Medic',
      description: 'Demo participant with medic role label for verifying demo status and role copy.',
      disclosure: 'NON-LIVE CONVOY FIXTURE. Demo data is not production membership and cannot be live.',
      expectedStatus: 'demo',
      expectedRoleLabel: 'Medic',
      markerEligible: true,
      member: qaMember('qa-demo-medic', {
        callsign: 'QA MEDIC',
        role: 'support',
        participantRole: 'medic',
        participantSource: 'demo',
        vehicleSummary: 'Wagon / medic role',
        latitude: POINTS.medic.latitude,
        longitude: POINTS.medic.longitude,
        movementStatus: 'moving',
        capturedAt: isoMinutesAgo(nowMs, 1),
        updatedAt: isoMinutesAgo(nowMs, 1),
      }),
      validationRows: validationRows({
        status: 'Demo',
        role: 'Medic',
        markerEligible: true,
        source: 'Demo',
      }),
    },
    {
      id: 'mock_member',
      title: 'Mock Member',
      description: 'Mock participant row for verifying that mock data never appears production live.',
      disclosure: 'NON-LIVE CONVOY FIXTURE. Mock data is local QA display data only.',
      expectedStatus: 'demo',
      expectedRoleLabel: 'Member',
      markerEligible: true,
      member: qaMember('qa-mock-member', {
        callsign: 'QA MOCK',
        role: 'member',
        participantRole: 'member',
        participantSource: 'mock',
        vehicleSummary: 'Test rig / mock member',
        latitude: POINTS.mock.latitude,
        longitude: POINTS.mock.longitude,
        movementStatus: 'moving',
        capturedAt: isoMinutesAgo(nowMs, 1),
        updatedAt: isoMinutesAgo(nowMs, 1),
      }),
      validationRows: validationRows({
        status: 'Demo/mock',
        role: 'Member',
        markerEligible: true,
        source: 'Mock',
      }),
    },
  ];
}

export function getConvoyParticipantQaFixtures(
  environment: ConvoyParticipantQaHarnessEnvironment = {},
  nowMs = Date.now(),
): ConvoyParticipantQaFixture[] {
  if (!isConvoyParticipantQaHarnessEnabled(environment)) return [];
  return buildFixtures(nowMs);
}

export function getConvoyParticipantQaMapVehicles(
  environment: ConvoyParticipantQaHarnessEnvironment = {},
  nowMs = Date.now(),
): ConvoyMapVehicle[] {
  return getConvoyParticipantQaFixtures(environment, nowMs).map((fixture) => fixture.member);
}

export function getConvoyParticipantQaParticipants(
  environment: ConvoyParticipantQaHarnessEnvironment = {},
  nowMs = Date.now(),
): ConvoyParticipant[] {
  return buildConvoyParticipantsFromMapVehicles(getConvoyParticipantQaMapVehicles(environment, nowMs), {
    convoyId: CONVOY_PARTICIPANT_QA_CONVOY_ID,
    source: 'live',
    nowMs,
  });
}
