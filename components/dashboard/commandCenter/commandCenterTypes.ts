import type React from 'react';

export type CommandCenterState =
  | 'live'
  | 'checkIn'
  | 'planned'
  | 'estimated'
  | 'partial'
  | 'offline'
  | 'setupNeeded';

export type CommandCenterMode =
  | 'attitude'
  | 'threeDNavigation'
  | 'recoveryHazardCompass'
  | 'trailDecision'
  | 'campScout'
  | 'expeditionReadiness'
  | 'convoyCommand';

export type CommandCenterWidgetId = CommandCenterMode;

export type CommandCenterAvailabilityState =
  | 'available'
  | 'partial'
  | 'setupNeeded'
  | 'unavailable'
  | 'experimental'
  | 'planned';

export type CommandCenterCapability =
  | 'attitudeSensor'
  | 'navigationRoute'
  | 'location'
  | 'savedPins'
  | 'campCandidates'
  | 'readinessSystems'
  | 'convoy';

export interface CommandCenterDataContext {
  hasActiveRoute?: boolean;
  hasLocation?: boolean;
  hasHeading?: boolean;
  hasSavedPins?: boolean;
  hasCampCandidates?: boolean;
  hasReadinessSystems?: boolean;
  hasConvoy?: boolean;
  hasConvoyMembers?: boolean;
  hasConvoyCheckIns?: boolean;
  isOffline?: boolean;
}

export interface CommandCenterWidgetComponentProps {
  mode: CommandCenterMode;
  availableModes: CommandCenterMode[];
  onModeChange: (mode: CommandCenterMode) => void;
  testID?: string;
}

export interface CommandCenterWidgetDefinition {
  id: CommandCenterWidgetId;
  label: string;
  shortLabel: string;
  description: string;
  component?: React.ComponentType<CommandCenterWidgetComponentProps>;
  iconName: string;
  defaultAvailability: CommandCenterAvailabilityState;
  requiredCapabilities: CommandCenterCapability[];
  getAvailability?: (dataContext: CommandCenterDataContext) => CommandCenterAvailabilityState;
  order: number;
  isExperimental?: boolean;
  fallbackId?: CommandCenterWidgetId;
}

export interface CommandCenterFrameProps {
  title: string;
  subtitle?: string;
  state: CommandCenterState;
  stateLabel?: string;
  showStateBadge?: boolean;
  bodyChrome?: boolean;
  mode?: CommandCenterMode;
  availableModes?: CommandCenterMode[];
  onModeChange?: (mode: CommandCenterMode) => void;
  modeSelector?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  testID?: string;
}
