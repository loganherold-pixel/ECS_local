import type { ECSPin } from '../components/navigate/PinTypes';
import { pinStore } from './pinStore';
import { routeStore, type ImportedRoute, type RouteSegment, type RouteWaypoint } from './routeStore';
import type {
  DispatchLinkedContext,
  DispatchLinkedContextType,
  DispatchPingType,
  DispatchPriority,
} from './dispatchTypes';

export interface DispatchContextAction {
  id: string;
  label: string;
  pingType?: DispatchPingType;
  priority?: DispatchPriority;
  message?: string;
}

export function getDispatchContextTypeLabel(type: DispatchLinkedContextType): string {
  switch (type) {
    case 'expedition':
      return 'Expedition';
    case 'pin':
      return 'Pin';
    case 'waypoint':
      return 'Waypoint';
    case 'route_segment':
      return 'Route Segment';
    case 'resource':
      return 'Resource';
    case 'vehicle':
      return 'Vehicle';
    case 'power':
      return 'Power';
    case 'manual':
      return 'Manual';
    default:
      return 'Context';
  }
}

export function getDispatchContextActions(context: DispatchLinkedContext): DispatchContextAction[] {
  switch (context.type) {
    case 'pin':
      return [
        {
          id: 'ping_team_to_pin',
          label: 'Ping Team to Pin',
          pingType: 'rally',
          priority: 'normal',
          message: `Proceed to ${context.title} and acknowledge when en route.`,
        },
        {
          id: 'assign_inspect',
          label: 'Assign Member to Inspect',
          pingType: 'route',
          priority: 'normal',
          message: `Inspect ${context.title} and report condition to Dispatch.`,
        },
        {
          id: 'broadcast_hazard',
          label: 'Broadcast Hazard',
          pingType: 'hazard',
          priority: 'critical',
          message: `Hazard update at ${context.title}. Confirm status and keep Dispatch advised.`,
        },
        { id: 'create_rally_point', label: 'Create Rally Point placeholder' },
      ];
    case 'waypoint':
      return [
        {
          id: 'request_eta',
          label: 'Request ETA',
          pingType: 'check_in',
          priority: 'normal',
          message: `Send ETA for ${context.title}.`,
        },
        {
          id: 'assign_scout',
          label: 'Assign Scout',
          pingType: 'route',
          priority: 'normal',
          message: `Scout ${context.title} and report arrival conditions.`,
        },
        {
          id: 'confirm_arrival',
          label: 'Confirm Arrival',
          pingType: 'check_in',
          priority: 'normal',
          message: `Confirm arrival at ${context.title}.`,
        },
      ];
    case 'route_segment':
      return [
        {
          id: 'request_route_check',
          label: 'Request Route Check',
          pingType: 'route',
          priority: 'normal',
          message: `Confirm route condition for ${context.title}.`,
        },
        {
          id: 'broadcast_blockage',
          label: 'Broadcast Blockage',
          pingType: 'hazard',
          priority: 'critical',
          message: `Possible blockage on ${context.title}. Confirm and update Dispatch.`,
        },
        {
          id: 'assign_scout',
          label: 'Assign Scout',
          pingType: 'route',
          priority: 'normal',
          message: `Scout ${context.title} before convoy commit.`,
        },
      ];
    case 'resource':
      return [
        {
          id: 'request_fuel_check',
          label: 'Request Fuel Check',
          pingType: 'resource',
          priority: 'normal',
          message: `Report fuel status for ${context.title}.`,
        },
        {
          id: 'request_water_check',
          label: 'Request Water Check',
          pingType: 'resource',
          priority: 'normal',
          message: `Report water status for ${context.title}.`,
        },
        {
          id: 'request_power_check',
          label: 'Request Power Check',
          pingType: 'resource',
          priority: 'normal',
          message: `Report power status for ${context.title}.`,
        },
      ];
    case 'vehicle':
      return [
        {
          id: 'request_vehicle_status',
          label: 'Request Vehicle Status',
          pingType: 'resource',
          priority: 'normal',
          message: `Report vehicle status for ${context.title}.`,
        },
        {
          id: 'assist_request',
          label: 'Assist Request',
          pingType: 'assist',
          priority: 'high',
          message: `Assist request for ${context.title}. Confirm availability.`,
        },
      ];
    case 'power':
      return [
        {
          id: 'request_power_status',
          label: 'Request Power Status',
          pingType: 'resource',
          priority: 'normal',
          message: `Report power status for ${context.title}.`,
        },
        {
          id: 'low_power_alert',
          label: 'Low Power Alert',
          pingType: 'resource',
          priority: 'high',
          message: `Low power alert for ${context.title}. Confirm reserves and mitigation plan.`,
        },
      ];
    default:
      return [
        {
          id: 'general_context_ping',
          label: 'Context Ping',
          pingType: 'general',
          priority: 'normal',
          message: `Dispatch update for ${context.title}. Please acknowledge.`,
        },
      ];
  }
}

export function getPrimaryContextPingAction(context: DispatchLinkedContext): DispatchContextAction {
  return getDispatchContextActions(context).find((action) => action.pingType) ?? {
    id: 'general_context_ping',
    label: 'Context Ping',
    pingType: 'general',
    priority: 'normal',
    message: `Dispatch update for ${context.title}. Please acknowledge.`,
  };
}

export function collectDispatchLinkedContextsFromStores(): DispatchLinkedContext[] {
  const contexts: DispatchLinkedContext[] = [];

  try {
    contexts.push(...pinStore.getAll().map(dispatchContextFromPin));
  } catch {
    // Safe adapter: ignore store read failures and keep mock contexts available.
  }

  try {
    const activeRoute = routeStore.getActive();
    if (activeRoute) {
      contexts.push(...dispatchContextsFromRoute(activeRoute));
    }
  } catch {
    // Safe adapter: route context is optional for this Dispatch pass.
  }

  return contexts;
}

export function dispatchContextFromPin(pin: ECSPin): DispatchLinkedContext {
  return {
    id: `pin-${pin.id}`,
    type: 'pin',
    title: pin.title,
    subtitle: `${pin.category} / ${pin.type}`,
    coordinates: { latitude: pin.lat, longitude: pin.lng },
    metadata: {
      source: 'pinStore',
      pinId: pin.id,
      pinType: pin.type,
      category: pin.category,
      severity: pin.severity,
      resolved: pin.resolved,
    },
  };
}

export function dispatchContextFromWaypoint(
  waypoint: RouteWaypoint,
  route: ImportedRoute,
  index: number,
): DispatchLinkedContext {
  return {
    id: `route-${route.id}-waypoint-${index}`,
    type: 'waypoint',
    title: waypoint.name || `Waypoint ${index + 1}`,
    subtitle: route.name,
    coordinates: { latitude: waypoint.lat, longitude: waypoint.lon },
    metadata: {
      source: 'routeStore',
      routeId: route.id,
      waypointType: waypoint.waypointType ?? null,
      elevation: waypoint.ele,
      time: waypoint.time,
    },
  };
}

export function dispatchContextFromRouteSegment(
  segment: RouteSegment,
  route: ImportedRoute,
  index: number,
): DispatchLinkedContext {
  const firstPoint = segment.points[0];
  return {
    id: `route-${route.id}-segment-${index}`,
    type: 'route_segment',
    title: `${route.name} Segment ${index + 1}`,
    subtitle: `${segment.points.length} route points`,
    coordinates: firstPoint
      ? { latitude: firstPoint.lat, longitude: firstPoint.lon }
      : undefined,
    routeSegmentId: `${route.id}:${index}`,
    metadata: {
      source: 'routeStore',
      routeId: route.id,
      segmentIndex: index,
      pointCount: segment.points.length,
    },
  };
}

function dispatchContextsFromRoute(route: ImportedRoute): DispatchLinkedContext[] {
  return [
    ...route.waypoints.slice(0, 6).map((waypoint, index) =>
      dispatchContextFromWaypoint(waypoint, route, index),
    ),
    ...route.segments.slice(0, 4).map((segment, index) =>
      dispatchContextFromRouteSegment(segment, route, index),
    ),
  ];
}
