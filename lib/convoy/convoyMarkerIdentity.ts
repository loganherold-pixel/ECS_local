import type { ConvoyMapVehicle, ConvoyMovementStatus } from './convoyRealtimeService';

export type ConvoyMarkerRole =
  | 'lead'
  | 'sweep'
  | 'member'
  | 'support'
  | 'scout'
  | 'medic'
  | 'recovery'
  | 'unknown';

export type ConvoyMarkerStatus =
  | 'moving'
  | 'stopped'
  | 'delayed'
  | 'stale'
  | 'offline'
  | 'needs_assistance'
  | 'unknown';

export interface ConvoyMarkerIdentity {
  memberId: string;
  callsign: string;
  role: ConvoyMarkerRole;
  status: ConvoyMarkerStatus;
  vehicleBadge?: string;
  isCurrentUser?: boolean;
  headingDegrees?: number;
  speedMph?: number;
  lastUpdatedAt: string;
  iconKey: string;
  label: string;
  shapeGlyph: string;
  statusLabel: string;
  ageLabel: string | null;
  shouldShowHeading: boolean;
  distanceBehindLeadMiles?: number | null;
  statusExplanation: string | null;
}

const NEAR_ZERO_SPEED_MPH = 1;
const DEFAULT_MEMBER_PREFIX = 'V';
const PERSON_NAME_PATTERN = /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}$/;
const PHONE_OR_EMAIL_PATTERN = /@|\+?\d[\d\s().-]{6,}/;

function sanitizeShortToken(value: string): string {
  return value
    .replace(/[^A-Za-z0-9-]/g, '')
    .toUpperCase()
    .slice(0, 8);
}

function isUnsafePersonalLabel(value: string): boolean {
  const trimmed = value.trim();
  return PERSON_NAME_PATTERN.test(trimmed) || PHONE_OR_EMAIL_PATTERN.test(trimmed);
}

function roleFromVehicle(member: ConvoyMapVehicle): ConvoyMarkerRole {
  const source = `${member.role} ${member.callsign}`.toLowerCase();
  if (source.includes('scout')) return 'scout';
  if (source.includes('med') || source.includes('aid')) return 'medic';
  if (source.includes('rcv') || source.includes('recov') || source.includes('wrench')) return 'recovery';
  if (member.role === 'lead' || member.role === 'sweep' || member.role === 'support' || member.role === 'member') {
    return member.role;
  }
  return 'unknown';
}

function statusFromVehicle(member: ConvoyMapVehicle): ConvoyMarkerStatus {
  if (member.movementStatus === 'needs_assistance') return 'needs_assistance';
  if (member.movementStatus === 'offline') return 'offline';
  if (member.isStale) return 'stale';
  if (member.movementStatus === 'moving' || member.movementStatus === 'stopped' || member.movementStatus === 'delayed') {
    return member.movementStatus;
  }
  return 'unknown';
}

function defaultCallsignForRole(role: ConvoyMarkerRole, index: number): string {
  switch (role) {
    case 'lead':
      return 'LEAD';
    case 'sweep':
      return 'SWEEP';
    case 'scout':
      return 'SCOUT';
    case 'medic':
      return 'MED';
    case 'recovery':
      return 'RCV';
    case 'support':
      return 'SUP';
    default:
      return `${DEFAULT_MEMBER_PREFIX}${Math.max(2, index + 1)}`;
  }
}

function callsignForVehicle(member: ConvoyMapVehicle, role: ConvoyMarkerRole, index: number): string {
  const raw = String(member.callsign ?? '').trim();
  const sanitized = sanitizeShortToken(raw);
  if (!raw || !sanitized || isUnsafePersonalLabel(raw)) return defaultCallsignForRole(role, index);
  if (role === 'lead' && sanitized === 'L') return 'LEAD';
  if (role === 'sweep' && sanitized === 'S') return 'SWEEP';
  return sanitized;
}

function vehicleBadgeFromCallsign(callsign: string): string | undefined {
  const normalized = callsign.toUpperCase();
  for (const badge of ['TRK', 'SUV', 'ATV', 'MOTO', 'TRL', 'CAMP', 'EV', 'DIESEL', 'REC']) {
    if (normalized.includes(badge)) return badge;
  }
  return undefined;
}

function iconKeyFor(role: ConvoyMarkerRole, status: ConvoyMarkerStatus): string {
  if (status === 'needs_assistance') return 'convoy-assist';
  if (status === 'offline') return 'convoy-offline';
  switch (role) {
    case 'lead':
      return 'convoy-lead-diamond';
    case 'sweep':
      return 'convoy-sweep-square';
    case 'scout':
      return 'convoy-scout-triangle';
    case 'medic':
      return 'convoy-medic-plus';
    case 'recovery':
      return 'convoy-recovery-wrench';
    case 'support':
      return 'convoy-support-hex';
    default:
      return 'convoy-member-circle';
  }
}

function shapeGlyphFor(role: ConvoyMarkerRole, status: ConvoyMarkerStatus): string {
  if (status === 'needs_assistance') return '!';
  if (status === 'offline') return '○';
  switch (role) {
    case 'lead':
      return '◆';
    case 'sweep':
      return '■';
    case 'scout':
      return '▲';
    case 'medic':
      return '+';
    case 'recovery':
      return 'W';
    case 'support':
      return '⬢';
    default:
      return '●';
  }
}

function ageLabel(updatedAt: string): string | null {
  const updatedMs = Date.parse(updatedAt);
  if (!Number.isFinite(updatedMs)) return null;
  const ageMinutes = Math.max(0, Math.floor((Date.now() - updatedMs) / 60_000));
  if (ageMinutes < 1) return 'now';
  if (ageMinutes < 60) return `${ageMinutes}m`;
  return `${Math.floor(ageMinutes / 60)}h`;
}

function statusLabelFor(status: ConvoyMarkerStatus, age: string | null): string {
  switch (status) {
    case 'needs_assistance':
      return 'ASSIST';
    case 'offline':
      return 'OFF';
    case 'stale':
      return age ?? 'STALE';
    case 'delayed':
      return 'DLY';
    case 'moving':
      return 'MOV';
    case 'stopped':
      return 'STOP';
    default:
      return 'UNK';
  }
}

function statusExplanationFor(status: ConvoyMarkerStatus, age: string | null): string | null {
  switch (status) {
    case 'needs_assistance':
      return 'Needs assistance. Member is marked for recovery or support.';
    case 'offline':
      return 'Member offline. Showing last known location when available.';
    case 'stale':
      return `Location stale. Last known location${age ? ` was updated ${age} ago` : ' is the latest available fix'}.`;
    case 'delayed':
      return 'Member is delayed or behind expected movement.';
    default:
      return null;
  }
}

function speedMphFromMps(speedMps: number | null): number | undefined {
  if (typeof speedMps !== 'number' || !Number.isFinite(speedMps)) return undefined;
  return Math.max(0, speedMps * 2.2369362921);
}

function headingDegreesFrom(value: number | null): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return ((value % 360) + 360) % 360;
}

export function buildConvoyMarkerIdentity(
  member: ConvoyMapVehicle,
  index: number,
  currentUserMemberId?: string | null,
): ConvoyMarkerIdentity {
  const role = roleFromVehicle(member);
  const status = statusFromVehicle(member);
  const callsign = callsignForVehicle(member, role, index);
  const isCurrentUser = member.memberId === currentUserMemberId;
  const headingDegrees = headingDegreesFrom(member.headingDegrees);
  const speedMph = speedMphFromMps(member.speedMps);
  const lastUpdatedAt = member.updatedAt ?? member.capturedAt;
  const age = ageLabel(lastUpdatedAt);
  const labelBase = status === 'needs_assistance' ? `ASSIST · ${callsign}` : callsign;
  const label = isCurrentUser ? 'YOU' : labelBase;

  return {
    memberId: member.memberId,
    callsign,
    role,
    status,
    vehicleBadge: vehicleBadgeFromCallsign(member.callsign),
    isCurrentUser,
    headingDegrees,
    speedMph,
    lastUpdatedAt,
    iconKey: iconKeyFor(role, status),
    label,
    shapeGlyph: shapeGlyphFor(role, status),
    statusLabel: statusLabelFor(status, age),
    ageLabel: age,
    shouldShowHeading: status === 'moving' && Boolean(headingDegrees != null && speedMph != null && speedMph > NEAR_ZERO_SPEED_MPH),
    distanceBehindLeadMiles: null,
    statusExplanation: statusExplanationFor(status, age),
  };
}

export function buildConvoyMarkerIdentities(
  members: ConvoyMapVehicle[],
  currentUserMemberId?: string | null,
): ConvoyMarkerIdentity[] {
  return members.map((member, index) => buildConvoyMarkerIdentity(member, index, currentUserMemberId));
}
