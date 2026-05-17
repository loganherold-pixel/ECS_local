import RecoveryHazardCompassWidget from './RecoveryHazardCompass';
import TrailDecisionCommandWidget from './TrailDecisionCommand';
import CampScoutCommandWidget from './CampScoutCommand';
import { ExpeditionReadinessCommand } from './ExpeditionReadinessCommand';
import ConvoyCommandWidget from './ConvoyCommand';
import type { ECSCommandModuleId } from '../../../lib/ecsCommandModuleStore';
import type {
  CommandCenterAvailabilityState,
  CommandCenterDataContext,
  CommandCenterMode,
  CommandCenterWidgetDefinition,
  CommandCenterWidgetId,
} from './commandCenterTypes';

export const COMMAND_CENTER_DEFAULT_MODE: CommandCenterMode = 'attitude';

export const COMMAND_CENTER_IMPLEMENTED_MODES: CommandCenterMode[] = [
  'attitude',
  'threeDNavigation',
  'recoveryHazardCompass',
  'trailDecision',
  'campScout',
  'expeditionReadiness',
  'convoyCommand',
];

const COMMAND_CENTER_MODULE_IDS: ECSCommandModuleId[] = [
  'attitude',
  'follow3d',
  'recoveryHazardCompass',
  'trailDecisionCommand',
  'campScoutCommand',
  'expeditionReadinessCommand',
  'convoyCommand',
];

export const COMMAND_CENTER_WIDGET_REGISTRY: Record<CommandCenterWidgetId, CommandCenterWidgetDefinition> = {
  attitude: {
    id: 'attitude',
    label: 'Attitude Command',
    shortLabel: 'Attitude',
    description: 'Vehicle attitude command surface with the active Fleet vehicle profile.',
    iconName: 'speedometer-outline',
    defaultAvailability: 'available',
    requiredCapabilities: [],
    order: 10,
  },
  threeDNavigation: {
    id: 'threeDNavigation',
    label: '3D Navigation Command',
    shortLabel: '3D Nav',
    description: '3D route-follow command surface for active or previewed guidance.',
    iconName: 'navigate-outline',
    defaultAvailability: 'partial',
    requiredCapabilities: ['navigationRoute'],
    getAvailability: (context) => (context.hasActiveRoute ? 'available' : 'partial'),
    order: 20,
    fallbackId: 'attitude',
  },
  recoveryHazardCompass: {
    id: 'recoveryHazardCompass',
    label: 'Recovery / Hazard Compass',
    shortLabel: 'Recovery',
    description: 'Recovery bearing, hazard direction, and route-return awareness.',
    component: RecoveryHazardCompassWidget,
    iconName: 'compass-outline',
    defaultAvailability: 'partial',
    requiredCapabilities: ['location'],
    getAvailability: (context) => {
      if (context.isOffline && !context.hasLocation) return 'setupNeeded';
      if (!context.hasLocation && !context.hasSavedPins && !context.hasActiveRoute) return 'setupNeeded';
      return context.hasHeading && (context.hasActiveRoute || context.hasSavedPins) ? 'available' : 'partial';
    },
    order: 30,
    fallbackId: 'attitude',
  },
  trailDecision: {
    id: 'trailDecision',
    label: 'Trail Decision Command',
    shortLabel: 'Trail',
    description: 'Go / no-go terrain assessment for route, vehicle, daylight, and conditions.',
    component: TrailDecisionCommandWidget,
    iconName: 'analytics-outline',
    defaultAvailability: 'partial',
    requiredCapabilities: ['location', 'navigationRoute'],
    getAvailability: (context) => {
      if (!context.hasLocation) return 'setupNeeded';
      return context.hasActiveRoute ? 'available' : 'partial';
    },
    order: 40,
    fallbackId: 'attitude',
  },
  campScout: {
    id: 'campScout',
    label: 'Camp Scout Command',
    shortLabel: 'Camp',
    description: 'Campsite viability ranking for saved, established, and staged candidates.',
    component: CampScoutCommandWidget,
    iconName: 'bonfire-outline',
    defaultAvailability: 'partial',
    requiredCapabilities: ['location', 'campCandidates'],
    getAvailability: (context) => {
      if (!context.hasLocation && !context.hasCampCandidates) return 'setupNeeded';
      return context.hasCampCandidates ? 'available' : 'partial';
    },
    order: 50,
    fallbackId: 'attitude',
  },
  expeditionReadiness: {
    id: 'expeditionReadiness',
    label: 'Expedition Readiness Command',
    shortLabel: 'Readiness',
    description: 'Continuation readiness synthesis across ECS vehicle, route, power, weather, and incident systems.',
    component: ExpeditionReadinessCommand,
    iconName: 'shield-checkmark-outline',
    defaultAvailability: 'partial',
    requiredCapabilities: ['readinessSystems'],
    getAvailability: (context) => (context.hasReadinessSystems ? 'available' : 'partial'),
    order: 60,
    fallbackId: 'attitude',
  },
  convoyCommand: {
    id: 'convoyCommand',
    label: 'Convoy Command',
    shortLabel: 'Convoy',
    description: 'Group expedition coordination for manual plans and shared check-ins.',
    component: ConvoyCommandWidget,
    iconName: 'people-outline',
    defaultAvailability: 'setupNeeded',
    requiredCapabilities: ['convoy'],
    getAvailability: (context) => {
      if (context.isOffline && (context.hasConvoy || context.hasConvoyMembers || context.hasConvoyCheckIns)) {
        return 'partial';
      }
      if (context.hasConvoyCheckIns || context.hasConvoyMembers) return 'partial';
      return context.hasConvoy ? 'partial' : 'setupNeeded';
    },
    order: 90,
    fallbackId: 'attitude',
  },
};

export function isCommandCenterModuleId(moduleId: ECSCommandModuleId): boolean {
  return COMMAND_CENTER_MODULE_IDS.includes(moduleId);
}

export function commandModuleToCenterMode(moduleId: ECSCommandModuleId): CommandCenterMode {
  switch (moduleId) {
    case 'follow3d':
      return 'threeDNavigation';
    case 'recoveryHazardCompass':
      return 'recoveryHazardCompass';
    case 'trailDecisionCommand':
      return 'trailDecision';
    case 'campScoutCommand':
      return 'campScout';
    case 'expeditionReadinessCommand':
      return 'expeditionReadiness';
    case 'convoyCommand':
      return 'convoyCommand';
    case 'attitude':
    default:
      return 'attitude';
  }
}

export function centerModeToCommandModule(mode: CommandCenterMode): ECSCommandModuleId {
  switch (mode) {
    case 'threeDNavigation':
      return 'follow3d';
    case 'recoveryHazardCompass':
      return 'recoveryHazardCompass';
    case 'trailDecision':
      return 'trailDecisionCommand';
    case 'campScout':
      return 'campScoutCommand';
    case 'expeditionReadiness':
      return 'expeditionReadinessCommand';
    case 'convoyCommand':
      return 'convoyCommand';
    case 'attitude':
    default:
      return 'attitude';
  }
}

export function getCommandCenterWidgetDefinition(
  id: CommandCenterWidgetId,
): CommandCenterWidgetDefinition | null {
  return COMMAND_CENTER_WIDGET_REGISTRY[id] ?? null;
}

export function getCommandCenterAvailability(
  definition: CommandCenterWidgetDefinition,
  dataContext: CommandCenterDataContext = {},
): CommandCenterAvailabilityState {
  return definition.getAvailability?.(dataContext) ?? definition.defaultAvailability;
}

function canRenderAvailability(availability: CommandCenterAvailabilityState): boolean {
  return availability !== 'unavailable' && availability !== 'planned';
}

export function getSelectableCommandCenterModes(
  dataContext: CommandCenterDataContext = {},
): CommandCenterMode[] {
  return COMMAND_CENTER_IMPLEMENTED_MODES
    .filter((mode) => {
      const definition = getCommandCenterWidgetDefinition(mode);
      if (!definition) return false;
      return canRenderAvailability(getCommandCenterAvailability(definition, dataContext));
    })
    .sort((left, right) => {
      const leftOrder = COMMAND_CENTER_WIDGET_REGISTRY[left]?.order ?? 0;
      const rightOrder = COMMAND_CENTER_WIDGET_REGISTRY[right]?.order ?? 0;
      return leftOrder - rightOrder;
    });
}

export function resolveCommandCenterMode(
  requestedMode: CommandCenterWidgetId | null | undefined,
  dataContext: CommandCenterDataContext = {},
  fallbackMode: CommandCenterMode = COMMAND_CENTER_DEFAULT_MODE,
): CommandCenterMode {
  const requestedDefinition = requestedMode ? getCommandCenterWidgetDefinition(requestedMode) : null;
  const requestedAvailability = requestedDefinition
    ? getCommandCenterAvailability(requestedDefinition, dataContext)
    : 'unavailable';

  if (
    requestedMode &&
    COMMAND_CENTER_IMPLEMENTED_MODES.includes(requestedMode as CommandCenterMode) &&
    requestedDefinition &&
    canRenderAvailability(requestedAvailability)
  ) {
    return requestedMode as CommandCenterMode;
  }

  const fallbackDefinition = getCommandCenterWidgetDefinition(fallbackMode);
  if (
    fallbackDefinition &&
    canRenderAvailability(getCommandCenterAvailability(fallbackDefinition, dataContext))
  ) {
    return fallbackMode;
  }

  return COMMAND_CENTER_DEFAULT_MODE;
}
