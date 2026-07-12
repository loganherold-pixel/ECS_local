import type { DispatchEvent } from './dispatchLiveEvents';
import type { NavigationHandoffPayload } from './navigationHandoffStore';

export type DispatchMapCoordinate = {
  latitude: number;
  longitude: number;
};

export type DispatchPingMapMarker = {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  subtitle: string;
  severity: DispatchEvent['severity'];
  sourceLabel: string;
  timestampLabel: string;
  accuracyLabel: string | null;
  eventId: string;
  syncState?: DispatchEvent['syncState'];
  selected?: boolean;
};

export function isValidDispatchMapCoordinate(value: unknown): value is DispatchMapCoordinate {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as DispatchMapCoordinate;
  return (
    Number.isFinite(candidate.latitude) &&
    Number.isFinite(candidate.longitude) &&
    candidate.latitude >= -90 &&
    candidate.latitude <= 90 &&
    candidate.longitude >= -180 &&
    candidate.longitude <= 180
  );
}

export function isRecoveryCriticalDispatchEvent(event: DispatchEvent): boolean {
  if (event.source === 'user_report') {
    return false;
  }

  return (
    event.status === 'recovery_critical' ||
    event.priority === 'Recovery Critical' ||
    event.category === 'recovery_assist' ||
    event.category === 'hazard_recovery'
  ) && event.severity === 'critical';
}

export function isRecoveryAssistanceCadEvent(event: DispatchEvent): boolean {
  const normalizedTitle = event.title.trim().toLowerCase();
  const normalizedPriority = String(event.priority ?? '').trim().toLowerCase();
  const normalizedStatus = String(event.status ?? '').trim().toLowerCase();

  return (
    event.type === 'recovery' ||
    event.category === 'recovery_assist' ||
    event.hazardType === 'recovery' ||
    normalizedStatus === 'recovery_critical' ||
    normalizedPriority === 'recovery critical' ||
    normalizedTitle.includes('recovery assist') ||
    normalizedTitle.includes('recovery request') ||
    normalizedTitle.includes('recovery info')
  );
}

export function getRecoveryHazardTypeLabel(event: DispatchEvent): string | null {
  switch (event.hazardType) {
    case 'weather':
      return 'Weather';
    case 'terrain':
      return 'Terrain';
    case 'trail_blockage':
      return 'Trail Blockage';
    case 'water_crossing':
      return 'Water Crossing';
    case 'recovery':
      return 'Recovery';
    case 'visibility':
      return 'Visibility';
    case 'other':
      return 'Other';
    default:
      return null;
  }
}

export function getRecoveryCriticalDisplayCopy(event: DispatchEvent): string {
  if (isRecoveryCriticalDispatchEvent(event)) {
    return 'Recovery Assist Requested from Current GPS Position';
  }

  return event.message;
}

export function getRecoveryCriticalLocationLabel(event: DispatchEvent): string | null {
  if (!isRecoveryCriticalDispatchEvent(event) || !event.location) {
    return null;
  }

  const accuracy = event.location.accuracyMeters;
  const accuracyLabel = typeof accuracy === 'number' && Number.isFinite(accuracy)
    ? ` +/- ${Math.round(accuracy)}m`
    : '';
  return `${event.location.latitude.toFixed(5)}, ${event.location.longitude.toFixed(5)}${accuracyLabel}`;
}

export function formatRecoveryLocationTimestamp(timestamp: string | null | undefined): string | null {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

export function formatRecoveryAccuracyLabel(accuracy: number | null | undefined): string | null {
  if (typeof accuracy !== 'number' || !Number.isFinite(accuracy)) return null;
  return `+/- ${Math.round(accuracy)}m`;
}

export function getRecoveryLocationSourceLabel(event: DispatchEvent): string {
  switch (event.location?.source) {
    case 'current_gps':
      return 'Current GPS';
    case 'last_known_gps':
      return 'Last-known GPS';
    default:
      return 'GPS source unavailable';
  }
}

export function getRecoveryCoordinateText(event: DispatchEvent): string | null {
  if (!isValidDispatchMapCoordinate(event.location)) {
    return null;
  }

  return `${event.location.latitude.toFixed(5)}, ${event.location.longitude.toFixed(5)}`;
}

export function buildDispatchPingMapMarkers(input: {
  events: DispatchEvent[];
  selectedEventId?: string | null;
}): DispatchPingMapMarker[] {
  return input.events.flatMap((event) => {
    if (!isRecoveryCriticalDispatchEvent(event) || !isValidDispatchMapCoordinate(event.location)) {
      return [];
    }
    const timestampLabel = formatRecoveryLocationTimestamp(event.location.timestamp) ?? 'Time unavailable';
    const accuracyLabel = formatRecoveryAccuracyLabel(event.location.accuracyMeters);
    return [{
      id: event.id,
      eventId: event.id,
      latitude: event.location.latitude,
      longitude: event.location.longitude,
      title: event.title?.trim() || 'Active GPS Ping',
      subtitle: getRecoveryCriticalDisplayCopy(event),
      severity: event.severity,
      sourceLabel: getRecoveryLocationSourceLabel(event),
      timestampLabel,
      accuracyLabel,
      syncState: event.syncState,
      selected: event.id === input.selectedEventId,
    } satisfies DispatchPingMapMarker];
  });
}

export function buildRecoveryAssistNavigationPayload(event: DispatchEvent): NavigationHandoffPayload {
  if (!isRecoveryAssistanceCadEvent(event)) {
    throw new Error('Recovery request location unavailable.');
  }

  if (!isValidDispatchMapCoordinate(event.location)) {
    throw new Error('Recovery request location unavailable.');
  }

  const coordinate = {
    lat: event.location.latitude,
    lng: event.location.longitude,
  };
  const hazardType = getRecoveryHazardTypeLabel(event);
  const displayCopy = getRecoveryCriticalDisplayCopy(event);
  const title = event.title?.trim() || 'Active GPS Ping';

  return {
    id: `dispatch-recovery-${event.id}-${Date.now()}`,
    source: 'dispatch',
    type: 'place',
    title,
    subtitle: displayCopy,
    coordinate,
    trailheadCoordinate: null,
    roadDestinationCoordinate: coordinate,
    trailGeometry: [],
    trailLengthMiles: null,
    trailCategory: hazardType,
    tripMode: 'road',
    routeSource: 'dispatch_recovery',
    requiresOnlineRouting: true,
    trailWaypoints: [],
    trailDecisionPoints: [],
    routeMetadata: {
      navigationMode: 'recovery_assist',
      recoveryAssist: true,
      activePing: true,
      recoveryAssistEventId: event.id,
      dispatchEventId: event.id,
      cadReferenceId: event.cadReferenceId ?? null,
      hazardType: event.hazardType ?? null,
      severity: 'recovery_critical',
      locationAccuracyMeters: event.location.accuracyMeters ?? null,
      locationTimestamp: event.location.timestamp ?? null,
      overrideActiveNavigation: true,
      autoStartNavigation: true,
    },
    landmarkMetadata: null,
    raw: {
      source: 'dispatch_cad',
      eventId: event.id,
      title: event.title,
      hazardType: event.hazardType ?? null,
      severity: event.severity,
      status: event.status ?? null,
      category: event.category ?? null,
      coordinate,
      accuracyMeters: event.location.accuracyMeters ?? null,
      locationTimestamp: event.location.timestamp ?? null,
    },
    createdAt: new Date().toISOString(),
  };
}

export function buildDispatchAdvisoryCoordinateNavigationPayload(
  coordinate: DispatchMapCoordinate,
  event: DispatchEvent | null,
): NavigationHandoffPayload {
  const roadCoordinate = {
    lat: coordinate.latitude,
    lng: coordinate.longitude,
  };
  const title = event?.title?.trim() || 'Dispatch Advisory GPS';
  const subtitle = event?.message?.split('\n').map((line) => line.trim()).find(Boolean) ?? 'ECS advisory coordinate';

  return {
    id: `dispatch-advisory-coordinate-${event?.id ?? 'gps'}-${Date.now()}`,
    source: 'dispatch',
    type: 'place',
    title,
    subtitle,
    coordinate: roadCoordinate,
    trailheadCoordinate: null,
    roadDestinationCoordinate: roadCoordinate,
    trailGeometry: [],
    trailLengthMiles: null,
    trailCategory: 'Dispatch Advisory',
    tripMode: 'road',
    routeSource: 'dispatch_advisory',
    requiresOnlineRouting: true,
    trailWaypoints: [],
    trailDecisionPoints: [],
    routeMetadata: {
      navigationMode: 'dispatch_advisory',
      dispatchAdvisoryCoordinate: true,
      dispatchEventId: event?.id ?? null,
      sourceLabel: 'Dispatch advisory GPS',
    },
    landmarkMetadata: {
      kind: 'dispatch_advisory_coordinate',
      source: 'dispatch_advisory',
    },
    raw: {
      source: 'dispatch_advisory',
      eventId: event?.id ?? null,
      title: event?.title ?? null,
      severity: event?.severity ?? null,
      coordinate: roadCoordinate,
    },
    createdAt: new Date().toISOString(),
  };
}
