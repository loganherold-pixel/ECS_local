import type { ActiveTripModeSnapshot } from './activeTripMode';
import type { OfflineIncidentPacket } from './offlineIncidentPacket';

export type ActiveTripResumeCardModel = {
  visible: boolean;
  title: string;
  routeName: string;
  vehicleLabel: string | null;
  confidenceLabel: string | null;
  confidenceScore: number | null;
  routeAuthorityLabel: string | null;
  routeAuthorityStatus: string | null;
  routeGeometryStatus: string | null;
  freshnessLabel: string;
  startedAt: string | null;
  updatedAt: string | null;
  timeLabel: string | null;
  packetBadgeLabel: string | null;
  packetActionVisible: boolean;
  resumeRoute: '/active-trip';
  packetRoute: '/offline-incident-packet' | null;
  warningLabels: string[];
};

const HIDDEN_MODEL: ActiveTripResumeCardModel = {
  visible: false,
  title: 'Active Trip in Progress',
  routeName: '',
  vehicleLabel: null,
  confidenceLabel: null,
  confidenceScore: null,
  routeAuthorityLabel: null,
  routeAuthorityStatus: null,
  routeGeometryStatus: null,
  freshnessLabel: '',
  startedAt: null,
  updatedAt: null,
  timeLabel: null,
  packetBadgeLabel: null,
  packetActionVisible: false,
  resumeRoute: '/active-trip',
  packetRoute: null,
  warningLabels: [],
};

function cleanText(value: unknown): string | null {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function compactIsoLabel(label: string, iso: string | null): string | null {
  if (!iso) return null;
  const compact = iso.replace('T', ' ').replace(/\.\d{3}Z$/, 'Z').slice(0, 17);
  return `${label} ${compact}`;
}

function packetIsLocalOnly(packet: OfflineIncidentPacket | null | undefined): boolean {
  return packet?.localOnly === true && packet.externalSharing === 'disabled';
}

function freshnessCopy(snapshot: ActiveTripModeSnapshot): string {
  const label = cleanText(snapshot.freshness?.label)
    ?? (snapshot.freshness?.state === 'stale'
      ? 'Recovered local snapshot; live context unavailable until refreshed.'
      : 'Active Trip snapshot current.');
  if (snapshot.freshness?.state === 'stale' && !label.toLowerCase().includes('stale')) {
    return `Recovered/stale: ${label}`;
  }
  return label;
}

export function buildActiveTripResumeCardModel(
  snapshot: ActiveTripModeSnapshot | null | undefined,
  packet: OfflineIncidentPacket | null | undefined,
): ActiveTripResumeCardModel {
  if (!snapshot || snapshot.status !== 'active') {
    return HIDDEN_MODEL;
  }

  const updatedAt = cleanText(snapshot.freshness?.updatedAt) ?? cleanText(snapshot.updatedAt);
  const startedAt = cleanText(snapshot.startedAt);
  const freshnessLabel = freshnessCopy(snapshot);
  const confidenceScore = finiteNumber(snapshot.routeConfidence?.score ?? null);
  const warningLabels = Array.from(new Set([
    ...(snapshot.warnings ?? []),
    ...(snapshot.routeConfidence?.keyWarnings ?? []),
  ].map(cleanText).filter(Boolean) as string[]));
  const hasLocalPacket = packetIsLocalOnly(packet);

  return {
    visible: true,
    title: 'Active Trip in Progress',
    routeName: cleanText(snapshot.route?.name) ?? 'Active route',
    vehicleLabel: cleanText(snapshot.vehicle?.label),
    confidenceLabel: cleanText(snapshot.routeConfidence?.label ?? snapshot.routeConfidence?.category),
    confidenceScore,
    routeAuthorityLabel: cleanText(snapshot.route?.authorityLabel),
    routeAuthorityStatus: cleanText(snapshot.route?.authorityStatus),
    routeGeometryStatus: cleanText(snapshot.route?.geometryStatus),
    freshnessLabel,
    startedAt,
    updatedAt,
    timeLabel: compactIsoLabel(updatedAt ? 'Updated' : 'Started', updatedAt ?? startedAt),
    packetBadgeLabel: hasLocalPacket ? 'Local-only packet ready' : null,
    packetActionVisible: hasLocalPacket,
    resumeRoute: '/active-trip',
    packetRoute: hasLocalPacket ? '/offline-incident-packet' : null,
    warningLabels,
  };
}
