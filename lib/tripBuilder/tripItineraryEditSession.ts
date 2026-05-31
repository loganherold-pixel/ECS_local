import type {
  GeoPoint,
  ItineraryPhase,
  ItineraryPreTrailStopBucket,
  ItineraryPreTrailStops,
  ItineraryStop,
  ItineraryWaypoint,
  TripItinerary,
  WaypointType,
} from './tripBuilderTypes';
import { ITINERARY_PRE_TRAIL_STOP_BUCKETS } from './tripBuilderTypes';

export type TripItineraryEditItemKind = 'pre_trail_stop' | 'trail_waypoint';
export type TripItineraryEditItemStatus = 'accepted' | 'dismissed';

export type TripItineraryEditItem = {
  id: string;
  sourceItemId: string;
  itemKind: TripItineraryEditItemKind;
  phase: ItineraryPhase;
  waypointType: WaypointType;
  title: string;
  status: TripItineraryEditItemStatus;
  order: number;
  isUserAdded: boolean;
  isEcsSuggested: boolean;
  protected: boolean;
  sourceLabel: string | null;
};

export type TripItineraryDismissedSuggestion = {
  id: string;
  sourceItemId: string;
  itemKind: TripItineraryEditItemKind;
  phase: ItineraryPhase;
  waypointType: WaypointType;
  title: string;
  isEcsSuggested: boolean;
  sourceLabel: string | null;
  dismissedAt: string;
};

export type TripItineraryEditSession = {
  id: string;
  itineraryId: string;
  sourceRouteId?: string | null;
  createdAt: string;
  updatedAt: string;
  items: TripItineraryEditItem[];
  dismissedSuggestions: TripItineraryDismissedSuggestion[];
  userAddedStops: ItineraryStop[];
  userAddedWaypoints: ItineraryWaypoint[];
};

export type AddUserItineraryStopInput = {
  id?: string | null;
  title?: string | null;
  coordinate?: GeoPoint | null;
  bucket?: ItineraryPreTrailStopBucket | null;
  waypointType?: WaypointType | null;
  notes?: string[] | null;
};

export type AddUserTrailWaypointInput = {
  id?: string | null;
  title?: string | null;
  coordinate?: GeoPoint | null;
  waypointType?: WaypointType | null;
  notes?: string[] | null;
};

const PRE_TRAIL_BUCKETS: ItineraryPreTrailStopBucket[] = [...ITINERARY_PRE_TRAIL_STOP_BUCKETS];

function sourceLabel(item: ItineraryStop | ItineraryWaypoint): string | null {
  const source = item.source;
  const label = source?.label ?? source?.source ?? source?.provider ?? null;
  const text = String(label ?? '').trim();
  return text || null;
}

function sourceLooksEcsSuggested(item: ItineraryStop | ItineraryWaypoint): boolean {
  if (item.isEcsSuggested === true) return true;
  if (item.isUserAdded === true) return false;
  const metadata = item.metadata ?? {};
  const sourceText = [
    item.source?.label,
    item.source?.source,
    item.source?.provider,
    metadata.waypointSourceKind,
    metadata.sourceKind,
  ].map((value) => String(value ?? '').toLowerCase().replace(/[_-]+/g, ' ')).join(' ');
  return /\b(ecs|suggested|route context|trail waypoint intelligence|ranked pre trail)\b/.test(sourceText) ||
    item.source?.state !== 'manual';
}

function preTrailStops(itinerary: TripItinerary): ItineraryStop[] {
  const stops = itinerary.preTrailStops;
  if (!stops) return [];
  return PRE_TRAIL_BUCKETS.flatMap((bucket) => stops[bucket] ?? []);
}

function stopBucket(stop: ItineraryStop): ItineraryPreTrailStopBucket {
  const metadataBucket = String(stop.metadata?.preTrailStopBucket ?? '').trim();
  if (PRE_TRAIL_BUCKETS.includes(metadataBucket as ItineraryPreTrailStopBucket)) {
    return metadataBucket as ItineraryPreTrailStopBucket;
  }
  if (stop.type === 'fuel') return 'fuel';
  if (stop.type === 'grocery') return 'grocery';
  if (stop.type === 'water') return 'water';
  return 'generalSupply';
}

function editableItemFromPoint(args: {
  point: ItineraryStop | ItineraryWaypoint;
  itemKind: TripItineraryEditItemKind;
  order: number;
}): TripItineraryEditItem {
  const isUserAdded = args.point.isUserAdded === true;
  return {
    id: args.point.id,
    sourceItemId: args.point.id,
    itemKind: args.itemKind,
    phase: args.point.phase,
    waypointType: args.point.type,
    title: args.point.title,
    status: 'accepted',
    order: args.order,
    isUserAdded,
    isEcsSuggested: !isUserAdded && sourceLooksEcsSuggested(args.point),
    protected: false,
    sourceLabel: sourceLabel(args.point),
  };
}

function normalizeSessionOrder(session: TripItineraryEditSession): TripItineraryEditSession {
  const orderedStops = session.items
    .filter((item) => item.itemKind === 'pre_trail_stop')
    .sort((left, right) => left.order - right.order)
    .map((item, index) => ({ ...item, order: index + 1 }));
  const otherItems = session.items.filter((item) => item.itemKind !== 'pre_trail_stop');
  const orderById = new Map(orderedStops.map((item) => [item.id, item]));
  return {
    ...session,
    items: session.items.map((item) => orderById.get(item.id) ?? item),
  };
}

function editItemForUserStop(stop: ItineraryStop): TripItineraryEditItem {
  return editableItemFromPoint({
    point: stop,
    itemKind: 'pre_trail_stop',
    order: stop.sequence,
  });
}

function editItemForUserWaypoint(waypoint: ItineraryWaypoint): TripItineraryEditItem {
  return editableItemFromPoint({
    point: waypoint,
    itemKind: 'trail_waypoint',
    order: waypoint.sequence ?? 1,
  });
}

function sessionId(itinerary: TripItinerary): string {
  return `trip-itinerary-edit-${itinerary.id}`;
}

function cloneStop(stop: ItineraryStop, item?: TripItineraryEditItem): ItineraryStop {
  const isUserAdded = stop.isUserAdded === true || item?.isUserAdded === true;
  return {
    ...stop,
    isUserAdded,
    isEcsSuggested: !isUserAdded && (stop.isEcsSuggested === true || item?.isEcsSuggested === true),
    metadata: {
      ...(stop.metadata ?? {}),
      tripItineraryEditStatus: item?.status ?? 'accepted',
    },
  };
}

function cloneWaypoint(waypoint: ItineraryWaypoint, item?: TripItineraryEditItem): ItineraryWaypoint {
  const isUserAdded = waypoint.isUserAdded === true || item?.isUserAdded === true;
  return {
    ...waypoint,
    isUserAdded,
    isEcsSuggested: !isUserAdded && (waypoint.isEcsSuggested === true || item?.isEcsSuggested === true),
    metadata: {
      ...(waypoint.metadata ?? {}),
      tripItineraryEditStatus: item?.status ?? 'accepted',
    },
  };
}

function renumberStops(stops: ItineraryStop[]): ItineraryStop[] {
  return stops.map((stop, index) => ({
    ...stop,
    sequence: index + 1,
  }));
}

function userEditSource(label: string) {
  return {
    label,
    state: 'manual' as const,
    source: 'trip_builder_user_edit',
    notes: ['Created by the operator in Trip Builder edit mode.'],
  };
}

function nextUserPointId(session: TripItineraryEditSession, prefix: string, explicit?: string | null): string {
  const value = String(explicit ?? '').trim();
  if (value) return value;
  const count = session.userAddedStops.length + session.userAddedWaypoints.length + 1;
  return `${session.id}-${prefix}-${count}`;
}

export function createTripItineraryEditSession(
  itinerary: TripItinerary,
  generatedAt = new Date().toISOString(),
): TripItineraryEditSession {
  const stops = preTrailStops(itinerary);
  const waypointItems = (itinerary.trailWaypoints ?? []).map((waypoint, index) => editableItemFromPoint({
    point: waypoint,
    itemKind: 'trail_waypoint',
    order: index + 1,
  }));
  return {
    id: sessionId(itinerary),
    itineraryId: itinerary.id,
    sourceRouteId: itinerary.sourceRouteId ?? itinerary.routeId ?? null,
    createdAt: generatedAt,
    updatedAt: generatedAt,
    items: [
      ...stops.map((stop, index) => editableItemFromPoint({
        point: stop,
        itemKind: 'pre_trail_stop',
        order: index + 1,
      })),
      ...waypointItems,
    ],
    dismissedSuggestions: [],
    userAddedStops: [],
    userAddedWaypoints: [],
  };
}

export function acceptTripItineraryEditItem(
  session: TripItineraryEditSession,
  itemId: string,
  updatedAt = new Date().toISOString(),
): TripItineraryEditSession {
  return {
    ...session,
    updatedAt,
    items: session.items.map((item) => item.id === itemId ? { ...item, status: 'accepted' } : item),
    dismissedSuggestions: session.dismissedSuggestions.filter((item) => item.id !== itemId && item.sourceItemId !== itemId),
  };
}

export function dismissTripItineraryEditItem(
  session: TripItineraryEditSession,
  itemId: string,
  updatedAt = new Date().toISOString(),
): TripItineraryEditSession {
  const item = session.items.find((candidate) => candidate.id === itemId);
  if (!item || item.protected) return session;
  const dismissed: TripItineraryDismissedSuggestion = {
    id: item.id,
    sourceItemId: item.sourceItemId,
    itemKind: item.itemKind,
    phase: item.phase,
    waypointType: item.waypointType,
    title: item.title,
    isEcsSuggested: item.isEcsSuggested,
    sourceLabel: item.sourceLabel,
    dismissedAt: updatedAt,
  };
  const dismissedById = new Map(session.dismissedSuggestions.map((candidate) => [candidate.id, candidate]));
  dismissedById.set(dismissed.id, dismissed);
  return {
    ...session,
    updatedAt,
    items: session.items.map((candidate) => candidate.id === itemId ? { ...candidate, status: 'dismissed' } : candidate),
    dismissedSuggestions: Array.from(dismissedById.values()),
  };
}

export function reorderTripItineraryStop(
  session: TripItineraryEditSession,
  itemId: string,
  direction: -1 | 1,
  updatedAt = new Date().toISOString(),
): TripItineraryEditSession {
  const stops = session.items
    .filter((item) => item.itemKind === 'pre_trail_stop' && item.status === 'accepted')
    .sort((left, right) => left.order - right.order);
  const index = stops.findIndex((item) => item.id === itemId);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= stops.length) return session;
  const nextStops = [...stops];
  const [item] = nextStops.splice(index, 1);
  nextStops.splice(nextIndex, 0, item);
  const orderById = new Map(nextStops.map((candidate, orderIndex) => [candidate.id, orderIndex + 1]));
  return normalizeSessionOrder({
    ...session,
    updatedAt,
    items: session.items.map((candidate) => (
      candidate.itemKind === 'pre_trail_stop' && orderById.has(candidate.id)
        ? { ...candidate, order: orderById.get(candidate.id) as number }
        : candidate
    )),
  });
}

export function addUserItineraryStop(
  session: TripItineraryEditSession,
  input: AddUserItineraryStopInput = {},
  updatedAt = new Date().toISOString(),
): TripItineraryEditSession {
  const bucket = input.bucket ?? 'generalSupply';
  const id = nextUserPointId(session, 'stop', input.id);
  const sequence = session.items.filter((item) => item.itemKind === 'pre_trail_stop').length + 1;
  const stop: ItineraryStop = {
    id,
    type: input.waypointType ?? 'user_added',
    phase: 'pre_trail_resupply',
    title: String(input.title ?? 'User-added itinerary stop'),
    description: 'Manual pre-trail stop added by the operator.',
    coordinate: input.coordinate ?? null,
    sequence,
    plannedDay: 1,
    stopRole: 'operator_added',
    source: userEditSource('user_added_itinerary_stop'),
    confidence: input.coordinate ? 'medium' : 'low',
    confidenceScore: input.coordinate ? 0.62 : 0.32,
    isUserAdded: true,
    isEcsSuggested: false,
    notes: input.notes ?? ['Manual stop is operator supplied and should be verified before departure.'],
    metadata: {
      preTrailStopBucket: bucket,
      userEditAction: 'manual_add_stop',
      sourceRecordMutated: false,
    },
  };
  return normalizeSessionOrder({
    ...session,
    updatedAt,
    items: [...session.items, editItemForUserStop(stop)],
    userAddedStops: [...session.userAddedStops, stop],
  });
}

export function addUserTrailWaypoint(
  session: TripItineraryEditSession,
  input: AddUserTrailWaypointInput = {},
  updatedAt = new Date().toISOString(),
): TripItineraryEditSession {
  const id = nextUserPointId(session, 'waypoint', input.id);
  const sequence = session.items.filter((item) => item.itemKind === 'trail_waypoint').length + 1;
  const waypoint: ItineraryWaypoint = {
    id,
    type: input.waypointType ?? 'user_added',
    phase: 'trail_navigation',
    title: String(input.title ?? 'User-added trail waypoint'),
    description: 'Manual trail waypoint added by the operator.',
    coordinate: input.coordinate ?? null,
    sequence,
    source: userEditSource('user_added_trail_waypoint'),
    confidence: input.coordinate ? 'medium' : 'low',
    confidenceScore: input.coordinate ? 0.62 : 0.32,
    isUserAdded: true,
    isEcsSuggested: false,
    notes: input.notes ?? ['Manual waypoint is user supplied and not ECS-confirmed.'],
    metadata: {
      userEditAction: 'manual_add_waypoint',
      sourceRecordMutated: false,
    },
  };
  return {
    ...session,
    updatedAt,
    items: [...session.items, editItemForUserWaypoint(waypoint)],
    userAddedWaypoints: [...session.userAddedWaypoints, waypoint],
  };
}

export function applyTripItineraryEditSession(
  itinerary: TripItinerary | null | undefined,
  session: TripItineraryEditSession | null | undefined,
): TripItinerary | null {
  if (!itinerary) return null;
  if (!session || session.itineraryId !== itinerary.id) return itinerary;

  const itemById = new Map(session.items.map((item) => [item.sourceItemId, item]));
  const dismissedIds = new Set(
    session.items
      .filter((item) => item.status === 'dismissed')
      .map((item) => item.sourceItemId),
  );
  const preTrailStopsByBucket = PRE_TRAIL_BUCKETS.reduce((buckets, bucket) => {
    buckets[bucket] = [];
    return buckets;
  }, {} as ItineraryPreTrailStops);
  const stopOrder = new Map(session.items
    .filter((item) => item.itemKind === 'pre_trail_stop')
    .map((item) => [item.sourceItemId, item.order]));

  preTrailStops(itinerary)
    .filter((stop) => !dismissedIds.has(stop.id))
    .map((stop) => cloneStop(stop, itemById.get(stop.id)))
    .forEach((stop) => {
      preTrailStopsByBucket[stopBucket(stop)].push(stop);
    });
  session.userAddedStops
    .filter((stop) => !dismissedIds.has(stop.id))
    .map((stop) => cloneStop(stop, itemById.get(stop.id)))
    .forEach((stop) => {
      preTrailStopsByBucket[stopBucket(stop)].push(stop);
    });
  PRE_TRAIL_BUCKETS.forEach((bucket) => {
    preTrailStopsByBucket[bucket] = renumberStops(
      preTrailStopsByBucket[bucket].sort((left, right) => (
        (stopOrder.get(left.id) ?? left.sequence ?? Number.POSITIVE_INFINITY) -
        (stopOrder.get(right.id) ?? right.sequence ?? Number.POSITIVE_INFINITY)
      )),
    );
  });

  const trailWaypoints = [
    ...(itinerary.trailWaypoints ?? [])
      .filter((waypoint) => !dismissedIds.has(waypoint.id))
      .map((waypoint) => cloneWaypoint(waypoint, itemById.get(waypoint.id))),
    ...session.userAddedWaypoints
      .filter((waypoint) => !dismissedIds.has(waypoint.id))
      .map((waypoint) => cloneWaypoint(waypoint, itemById.get(waypoint.id))),
  ].map((waypoint, index) => ({
    ...waypoint,
    sequence: index + 1,
  }));

  const protectedWaypointIds = new Set([
    itinerary.trailheadStart?.id,
    itinerary.trailEnd?.id,
  ].filter((value): value is string => !!value));
  const waypoints = [
    ...(itinerary.waypoints ?? [])
      .filter((waypoint) => protectedWaypointIds.has(waypoint.id) || !dismissedIds.has(waypoint.id))
      .map((waypoint) => protectedWaypointIds.has(waypoint.id) ? waypoint : cloneWaypoint(waypoint, itemById.get(waypoint.id))),
    ...session.userAddedWaypoints.filter((waypoint) => !dismissedIds.has(waypoint.id)),
  ];
  const waypointSeen = new Set<string>();
  const uniqueWaypoints = waypoints.filter((waypoint) => {
    if (waypointSeen.has(waypoint.id)) return false;
    waypointSeen.add(waypoint.id);
    return true;
  });

  const existingProtectedStops = itinerary.stops.filter((stop) => (
    stop.type === 'trailhead_start' ||
    stop.type === 'trail_end' ||
    protectedWaypointIds.has(stop.id)
  ));
  const stops = renumberStops([
    ...PRE_TRAIL_BUCKETS.flatMap((bucket) => preTrailStopsByBucket[bucket]),
    ...existingProtectedStops,
  ]);

  return {
    ...itinerary,
    updatedAt: session.updatedAt,
    preTrailStops: preTrailStopsByBucket,
    trailWaypoints,
    waypoints: uniqueWaypoints,
    stops,
    metadata: {
      ...(itinerary.metadata ?? {}),
      itineraryUserEdits: {
        sessionId: session.id,
        updatedAt: session.updatedAt,
        acceptedItemIds: session.items
          .filter((item) => item.status === 'accepted')
          .map((item) => item.sourceItemId),
        dismissedSuggestions: session.dismissedSuggestions,
        userAddedStopIds: session.userAddedStops.map((stop) => stop.id),
        userAddedWaypointIds: session.userAddedWaypoints.map((waypoint) => waypoint.id),
        sourceRecordsMutated: false,
      },
    },
  };
}
