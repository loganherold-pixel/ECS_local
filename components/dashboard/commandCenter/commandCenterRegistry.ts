import type { ECSCommandModuleId } from '../../../lib/ecsCommandModuleStore';
import type {
  CommandCenterAvailabilityState,
  CommandCenterDataContext,
  CommandCenterMode,
  CommandCenterWidgetDefinition,
  CommandCenterWidgetId,
} from './commandCenterTypes';

export const COMMAND_CENTER_DEFAULT_MODE: CommandCenterMode = 'threeDNavigation';

export const COMMAND_CENTER_IMPLEMENTED_MODES: CommandCenterMode[] = [
  'threeDNavigation',
];

const COMMAND_CENTER_MODULE_IDS: ECSCommandModuleId[] = [
  'follow3d',
];

export const COMMAND_CENTER_WIDGET_REGISTRY: Partial<Record<CommandCenterWidgetId, CommandCenterWidgetDefinition>> = {
  threeDNavigation: {
    id: 'threeDNavigation',
    label: '3D Navigation Command',
    shortLabel: '3D Nav',
    description: '3D route-follow command surface for active or previewed guidance.',
    iconName: 'navigate-outline',
    defaultAvailability: 'partial',
    requiredCapabilities: ['navigationRoute'],
    getAvailability: (context) => (context.hasActiveRoute ? 'available' : 'partial'),
    order: 10,
  },
};

export function isCommandCenterModuleId(moduleId: ECSCommandModuleId): boolean {
  return COMMAND_CENTER_MODULE_IDS.includes(moduleId);
}

export function commandModuleToCenterMode(moduleId: ECSCommandModuleId): CommandCenterMode {
  switch (moduleId) {
    case 'follow3d':
    case 'attitude':
    case 'terrainRisk':
    case 'routeCommand':
    case 'powerCommand':
    case 'environmentalCommand':
    default:
      return 'threeDNavigation';
  }
}

export function centerModeToCommandModule(mode: CommandCenterMode): ECSCommandModuleId {
  switch (mode) {
    case 'threeDNavigation':
    case 'attitude':
    default:
      return 'follow3d';
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
