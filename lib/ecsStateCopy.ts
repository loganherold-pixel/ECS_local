export type ECSStateConfig = {
  title: string;
  message: string;
  ctaLabel?: string;
  helper?: string;
};

export const ECS_CTA_LABELS = {
  configureVehicle: 'Set Up Vehicle',
  addVehicle: 'Add Vehicle',
  makeActive: 'Set Active',
  vehicleReady: 'Vehicle Ready',
  openLoadout: 'Open Loadout',
  selectDestination: 'Select Destination',
  previewRoute: 'Preview Route',
  importRoute: 'Import Route',
  openExplore: 'Open Explore',
  openFleet: 'Open Fleet',
  openNavigate: 'Open Navigate',
  replaceWidget: 'Replace Widget',
  configureWidget: 'Set Up Widget',
  adjustFilters: 'Adjust Filters',
  resetFilters: 'Reset Filters',
  expandRadius: 'Expand Radius',
  clearSearch: 'Clear Search',
  openInNavigate: 'Open in Navigate',
  reviewAlertSetup: 'Open Alert Setup',
  editFrequencies: 'Edit Frequencies',
  editSignals: 'Edit Signals',
  openComms: 'Open Comms',
} as const;

export const ECS_READINESS_COPY = {
  labels: {
    online: 'ONLINE',
    syncing: 'SYNCING',
    limited: 'LIMITED',
    limitedLive: 'LIMITED LIVE',
    offline: 'OFFLINE',
    offlineSupport: 'OFFLINE SUPPORT',
    cachedVehicles: 'CACHED VEHICLES',
    cachedMaps: 'CACHED MAPS',
    cachedWeather: 'CACHED WEATHER',
    cachedGuidance: 'CACHED GUIDANCE',
    manualFallback: 'MANUAL FALLBACK',
  },
  shell: {
    syncing: {
      statusLabel: 'Syncing',
      statusDetail: 'Saving updates and refreshing shared context in the background.',
    },
    reconnecting: {
      statusLabel: 'Syncing',
      statusDetail: 'Signal is weak. ECS is holding saved context while it reconnects.',
    },
    offlineSupport: {
      statusLabel: 'Offline Support',
      statusDetail: 'Using saved maps and local support until signal returns.',
    },
    offline: {
      statusLabel: 'Offline',
      statusDetail: 'Live services are unavailable. ECS is waiting for signal.',
    },
    limited: {
      statusLabel: 'Limited',
      statusDetail: 'Some live inputs are reduced, so ECS is leaning on saved context.',
    },
    online: {
      statusLabel: 'Online',
      statusDetail: 'Connected with current live support.',
    },
  },
  fleet: {
    localModeTitle: 'OFFLINE READY',
    localModeMessage:
      'Vehicle setup stays available locally. Sign in when you want ECS to sync rigs to cloud.',
    cachedVehiclesTitle: 'CACHED VEHICLES',
    cachedVehiclesMessage:
      'Showing saved vehicle profiles. ECS will sync changes when live signal returns.',
  },
  explore: {
    hiddenGemsLimitedTitle: 'Hidden Gems Limited',
    hiddenGemsLimitedMessage:
      'Hidden gem recommendations could not refresh right now. Popular Trails and saved routes remain available.',
    hiddenGemsLimitedDetail:
      'Hidden Gems are holding to saved route context while live discovery support recovers.',
    popularTrailsLimitedTitle: 'Popular Trails Limited',
    popularTrailsLimitedMessage:
      'Popular trail discovery could not refresh right now. Hidden Gems and saved routes remain available.',
    popularTrailsLimitedDetail:
      'Popular Trails are holding to saved route context while live discovery support recovers.',
  },
} as const;

export const ECS_STATE_COPY = {
  recovery: {
    fleetLoadFailure: {
      title: 'Fleet needs a fresh pass',
      message: 'Fleet hit a temporary problem while restoring vehicle context. Saved setup remains intact.',
      helper: 'Refresh this tab to bring vehicle status and active-rig context back in line.',
      ctaLabel: 'Refresh Fleet',
    },
    exploreLoadFailure: {
      title: 'Explore needs a fresh pass',
      message: 'Explore hit a temporary problem while restoring nearby routes and saved discovery context.',
      helper: 'Refresh this tab to rebuild the current route set.',
      ctaLabel: 'Refresh Explore',
    },
    expeditionsLoadFailure: {
      title: 'Expeditions need a fresh pass',
      message: 'Mission context hit a temporary problem while ECS was restoring expedition status.',
      helper: 'Refresh this tab to restore the current expedition view.',
      ctaLabel: 'Refresh Expeditions',
    },
    exploreIdeasLimited: {
      title: 'ECS route ideas limited',
      message: 'Fresh suggestions are temporarily unavailable. Hidden Gems and Popular Trails remain ready.',
      helper: 'Refresh ideas when you want another pass on the current Explore filters.',
      ctaLabel: 'Refresh Ideas',
    },
    routeLibraryEmpty: {
      title: 'No route staged',
      message: 'Import a route or reopen a saved file to bring expedition tracking and route tools online.',
      helper: 'Saved routes remain available from the route library whenever they have already been imported.',
      ctaLabel: 'Upload Route',
    },
    vehicleLibraryEmpty: {
      title: 'No vehicles staged yet',
      message: 'Add your first rig to begin configuring the vehicle ECS should use for setup and staging.',
      ctaLabel: 'Add Vehicle',
    },
  },
  fleet: {
    noVehiclesConfigured: {
      title: 'No vehicles configured',
      message: 'Build your primary rig to unlock telemetry, loadout, and route-ready vehicle setup.',
      ctaLabel: ECS_CTA_LABELS.configureVehicle,
      helper: 'You can add more rigs later.',
    },
    noActiveVehicle: {
      title: 'No active vehicle',
      message: 'Select the rig ECS should use for telemetry, widgets, and route-aware planning.',
      ctaLabel: ECS_CTA_LABELS.makeActive,
    },
    noLoadoutAssigned: {
      title: 'No loadout assigned yet',
      message: 'Add a loadout to complete payload and readiness context for this rig.',
      ctaLabel: ECS_CTA_LABELS.openLoadout,
    },
    noAccessoriesConfigured: {
      title: 'No accessories configured yet',
      message: 'Accessory zones and mounted systems will appear here after setup.',
      ctaLabel: ECS_CTA_LABELS.configureVehicle,
    },
    selectActiveHelper: 'Select an active vehicle to continue.',
    routeStartHelper: 'Route start happens in Navigate after you choose a trail or destination.',
  },
  navigate: {
    noRouteSelected: {
      title: 'No route staged',
      message: 'Stage a destination or import a route to build guidance and forecast context.',
      ctaLabel: ECS_CTA_LABELS.selectDestination,
      helper: 'Route preview and start live here in Navigate.',
    },
    noDestinationSelected: {
      title: 'No destination selected',
      message: 'Choose a destination to stage route preview and guidance.',
      ctaLabel: ECS_CTA_LABELS.selectDestination,
    },
    routePreviewUnavailable: {
      title: 'Route preview unavailable',
      message: 'The current destination could not build a usable preview yet.',
      ctaLabel: ECS_CTA_LABELS.importRoute,
    },
    offlineMapsNotReady: {
      title: 'Offline maps not ready',
      message: 'Cache map regions and route data before relying on offline guidance.',
      ctaLabel: ECS_CTA_LABELS.importRoute,
    },
    activeGuidanceUnavailable: {
      title: 'Active guidance unavailable',
      message: 'Stage a route first to unlock maneuver guidance and live route status.',
      ctaLabel: ECS_CTA_LABELS.previewRoute,
    },
  },
  dashboard: {
    noWidgetsAssigned: {
      title: 'No widgets assigned',
      message: 'Customize the dashboard to bring live status, vehicle profile, and route context forward.',
      ctaLabel: ECS_CTA_LABELS.configureWidget,
    },
    noActiveVehicle: {
      title: 'No active vehicle',
      message: 'Select a rig in Fleet to populate vehicle-aware widgets and profile summaries.',
      ctaLabel: ECS_CTA_LABELS.openFleet,
    },
    liveTelemetryUnavailable: {
      title: 'Live telemetry unavailable',
      message: 'Showing configured vehicle values only.',
    },
    noRouteActive: {
      title: 'No route active',
      message: 'Start navigation to populate route progress and route-aware widgets.',
      ctaLabel: ECS_CTA_LABELS.openNavigate,
    },
    configuredCapacityOnly: {
      title: 'Configured capacity only',
      message: 'Baseline vehicle capacity is loaded, but no live system feed is connected.',
    },
  },
  explore: {
    noRoutesInRadius: {
      title: 'No routes found in this radius',
      message: 'Widen the scan or change trip filters to see more routes nearby.',
      ctaLabel: ECS_CTA_LABELS.expandRadius,
    },
    noHiddenGems: {
      title: 'No hidden gems found',
      message: 'Try a wider radius or a different trip filter to reveal more local options.',
      ctaLabel: ECS_CTA_LABELS.adjustFilters,
    },
    noFavoritesSaved: {
      title: 'No favorites saved',
      message: 'Save routes from Popular Trails or Hidden Gems to keep them close at hand.',
    },
    noResultsForFilter: {
      title: 'No results for this filter',
      message: 'Change trip style or expand the radius to reopen the route set.',
      ctaLabel: ECS_CTA_LABELS.adjustFilters,
    },
  },
  alert: {
    noOfflineReadinessData: {
      title: 'No offline readiness data yet',
      message: 'Review safety setup to stage the core references you need in the field.',
      ctaLabel: ECS_CTA_LABELS.reviewAlertSetup,
    },
    noEmergencyContactsConfigured: {
      title: 'No emergency contacts configured',
      message: 'Add local contacts so Alert is ready before you lose signal.',
      ctaLabel: ECS_CTA_LABELS.openComms,
    },
    noFrequenciesConfigured: {
      title: 'No frequencies configured',
      message: 'Save working channels so the comms panel is ready when you need it.',
      ctaLabel: ECS_CTA_LABELS.editFrequencies,
    },
    noSignalPlanConfigured: {
      title: 'No signal plan configured',
      message: 'Add visual or radio signal references for field-readiness coverage.',
      ctaLabel: ECS_CTA_LABELS.editSignals,
    },
  },
} as const;

export const ECS_TOAST_COPY = {
  vehicleSetActive: 'Vehicle set active',
  vehicleProfileSaved: 'Vehicle profile saved',
  vehicleDeleted: 'Vehicle deleted',
  vehicleCopied: 'Vehicle copied',
  vehicleReady: 'Vehicle ready',
  routeImported: 'Route imported',
  favoriteSaved: 'Favorite saved',
  favoriteRemoved: 'Favorite removed',
  frequenciesUpdated: 'Frequencies updated',
  signalsUpdated: 'Signals updated',
  emergencyNumbersUpdated: 'Emergency numbers updated',
  quickNoteSaved: 'Quick note saved',
  coordinatesCopied: 'Coordinates copied',
  teamPingSent: 'Team ping sent',
} as const;

export const ECS_CONFIRM_COPY = {
  deleteVehicle(name: string, isActive: boolean) {
    return {
      title: 'Delete Vehicle?',
      message: isActive
        ? `Remove "${name}" from Fleet? The active vehicle selection will be cleared.`
        : `Remove "${name}" from Fleet?`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
    };
  },
  removeWidget() {
    return {
      title: 'Remove Widget?',
      message: 'This widget will be removed from the current dashboard layout.',
      confirmLabel: 'Remove',
      cancelLabel: 'Cancel',
    };
  },
  endNavigation() {
    return {
      title: 'End Navigation?',
      message: 'Active guidance will stop and Navigate will return to browse mode.',
      confirmLabel: 'End Navigation',
      cancelLabel: 'Cancel',
    };
  },
} as const;
