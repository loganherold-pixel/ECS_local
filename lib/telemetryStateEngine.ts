/**
 * ═══════════════════════════════════════════════════════════
 * ECS TELEMETRY STATE ENGINE — Phase 7
 * ═══════════════════════════════════════════════════════════
 *
 * Centralized telemetry availability evaluation for all ECS
 * widgets, panels, and companion surfaces (CarPlay, Android Auto).
 *
 * Replaces broken, empty, or confusing telemetry states with
 * clear, standardized placeholder states.
 *
 * Telemetry Availability States:
 *   - connected:           Live telemetry data flowing
 *   - awaiting_connection: No device/source connected yet
 *   - unavailable:         Source unsupported or permanently missing
 *   - error:               Unexpected failure (temporary)
 *
 * Placeholder Messages:
 *   - awaiting_connection: "Awaiting Device Connection"
 *                          "Connect a compatible power or telemetry source to activate live data."
 *   - unavailable:         "Telemetry Source Unavailable"
 *   - error:               "Live Data Temporarily Unavailable"
 *
 * Design Principles:
 *   - Placeholder widgets occupy the same grid space as active widgets
 *   - No layout reflow when telemetry becomes active
 *   - Widgets remain movable/resizable in edit mode while in placeholder state
 *   - Smooth transition from placeholder to live state (no app restart required)
 *   - Console logging for telemetry state changes (debug only)
 *   - Works offline and when Bluetooth/device permissions are not granted
 *   - Prevents telemetry polling failures from crashing the dashboard
 */

// ── Telemetry Availability States ────────────────────────────
export type TelemetryAvailability =
  | 'connected'
  | 'awaiting_connection'
  | 'unavailable'
  | 'error';

// ── Placeholder Content ──────────────────────────────────────
export interface TelemetryPlaceholderContent {
  state: TelemetryAvailability;
  /** Primary message line */
  primaryMessage: string;
  /** Secondary message line (smaller, optional) */
  secondaryMessage: string | null;
  /** Icon name (Ionicons) for the placeholder */
  iconName: string;
  /** Whether to show a "Connect Device" action */
  showConnectAction: boolean;
  /** Route to navigate to when "Connect Device" is tapped */
  connectRoute: string | null;
}

// ── Placeholder Message Map ──────────────────────────────────
const PLACEHOLDER_MESSAGES: Record<TelemetryAvailability, {
  primary: string;
  secondary: string | null;
  icon: string;
}> = {
  connected: {
    primary: 'Connected',
    secondary: null,
    icon: 'checkmark-circle-outline',
  },
  awaiting_connection: {
    primary: 'Awaiting Device Connection',
    secondary: 'Connect a compatible power or telemetry source to activate live data.',
    icon: 'bluetooth-outline',
  },
  unavailable: {
    primary: 'Telemetry Source Unavailable',
    secondary: 'This telemetry source is not supported or not available for this device.',
    icon: 'close-circle-outline',
  },
  error: {
    primary: 'Live Data Temporarily Unavailable',
    secondary: 'Telemetry will resume automatically when the connection is restored.',
    icon: 'alert-circle-outline',
  },
};

// ── State Change Logger ──────────────────────────────────────
const TAG = '[TelemetryState]';
const _lastLoggedState: Record<string, TelemetryAvailability> = {};

function logStateChange(widgetId: string, newState: TelemetryAvailability): void {
  const prev = _lastLoggedState[widgetId];
  if (prev !== newState) {
    console.log(TAG, `${widgetId}: ${prev || 'initial'} → ${newState}`);
    _lastLoggedState[widgetId] = newState;
  }
}

export type TelemetrySourceType =
  | 'ecoflow'        // EcoFlow cloud/BLE telemetry
  | 'power_device'   // Generic power device (BLE/cloud)
  | 'motion_sensor'  // Device accelerometer
  | 'gps'            // GPS location
  | 'vehicle_obd'    // Vehicle OBD-II (Phase 2A: architecture ready)
  | 'mission_config' // Mission/expedition configuration data
  | 'none';          // No telemetry dependency

const WIDGET_TELEMETRY_MAP: Record<string, TelemetrySourceType> = {
  'ecoflow-power':        'ecoflow',
  'hwy-power-monitor':    'vehicle_obd',
  'attitude-monitor':     'motion_sensor',
  'stability-index':      'motion_sensor',
  'hwy-elevation-profile': 'gps',
  'hwy-sun-glare':        'gps',
  'remoteness':           'gps',
  'progress':             'gps',
  'vehicle-systems':      'mission_config',
  'sustainability':       'mission_config',
  'vehicle-twin':         'none',
  'hwy-forward-weather':  'none',
  'hwy-daylight-remaining': 'none',
  'hwy-cell-coverage':    'none',
  'hwy-wind-monitor':     'none',
  'hwy-road-hazards':     'none',
};

// ── Telemetry Context ────────────────────────────────────────
// Runtime context passed to the evaluation function.
export interface TelemetryContext {
  /** Whether the motion sensor (accelerometer) is available */
  hasMotionSensor?: boolean;
  /** Whether GPS has a fix */
  hasGpsFix?: boolean;
  /** Whether an EcoFlow device is connected and live */
  ecoflowStatus?: 'live' | 'degraded' | 'standby' | 'offline' | 'connecting';
  /** Whether any power device is connected */
  hasPowerDevice?: boolean;
  /** Whether the power device connection has errored */
  powerDeviceError?: boolean;
  /** Whether vehicle OBD is connected (Phase 2A: architecture ready) */
  hasVehicleObd?: boolean;
  /** Vehicle telemetry connection state from VT store */
  vehicleTelemetryConnectionState?: 'disconnected' | 'connecting' | 'connected' | 'error' | 'unsupported';
  /** Whether mission/expedition config exists */
  hasMissionConfig?: boolean;
  /** Whether Bluetooth permission is granted */
  hasBluetoothPermission?: boolean;
  /** Whether the app is online */
  isOnline?: boolean;
}


// ── Connect Device Route Map ─────────────────────────────────
// Maps telemetry source types to the screen where the user can
// connect the relevant device. Returns null if no screen exists.
const CONNECT_ROUTES: Record<TelemetrySourceType, string | null> = {
  ecoflow:        '/power',
  power_device:   '/power',
  motion_sensor:  null,       // System permission — no dedicated screen
  gps:            null,       // System permission — no dedicated screen
  vehicle_obd:    '/vehicle-telemetry-settings',  // Phase 2A: Vehicle Telemetry settings
  mission_config: null,       // Handled by setup/expedition wizard
  none:           null,
};


// ═══════════════════════════════════════════════════════════
// EVALUATE TELEMETRY AVAILABILITY
// ═══════════════════════════════════════════════════════════

/**
 * Evaluate the telemetry availability state for a given widget.
 *
 * @param widgetId  - The widget identifier
 * @param context   - Runtime telemetry context
 * @returns TelemetryAvailability state
 */
export function evaluateTelemetryState(
  widgetId: string,
  context: TelemetryContext,
): TelemetryAvailability {
  const sourceType = WIDGET_TELEMETRY_MAP[widgetId] || 'none';

  let state: TelemetryAvailability = 'connected';

  try {
    switch (sourceType) {
      case 'ecoflow': {
        const status = context.ecoflowStatus;
        if (status === 'live' || status === 'degraded') {
          state = 'connected';
        } else if (status === 'connecting') {
          state = 'awaiting_connection';
        } else if (status === 'standby') {
          state = 'awaiting_connection';
        } else if (status === 'offline') {
          // Check if it's a permission issue or a connection issue
          if (context.hasBluetoothPermission === false) {
            state = 'unavailable';
          } else {
            state = 'awaiting_connection';
          }
        } else {
          state = 'awaiting_connection';
        }
        break;
      }

      case 'power_device': {
        if (context.hasPowerDevice) {
          if (context.powerDeviceError) {
            state = 'error';
          } else {
            state = 'connected';
          }
        } else {
          state = 'awaiting_connection';
        }
        break;
      }

      case 'motion_sensor': {
        if (context.hasMotionSensor === true) {
          state = 'connected';
        } else if (context.hasMotionSensor === false) {
          state = 'unavailable';
        } else {
          // Unknown — assume awaiting
          state = 'awaiting_connection';
        }
        break;
      }

      case 'gps': {
        if (context.hasGpsFix === true) {
          state = 'connected';
        } else if (context.hasGpsFix === false) {
          state = 'awaiting_connection';
        } else {
          // Unknown — assume awaiting
          state = 'awaiting_connection';
        }
        break;
      }

      case 'vehicle_obd': {
        // Phase 2A: Use VT connection state if available, fall back to boolean
        const vtState = context.vehicleTelemetryConnectionState;
        if (vtState === 'connected') {
          state = 'connected';
        } else if (vtState === 'connecting') {
          state = 'awaiting_connection';
        } else if (vtState === 'error') {
          state = 'error';
        } else if (context.hasVehicleObd) {
          state = 'connected';
        } else {
          state = 'awaiting_connection';
        }
        break;
      }

      case 'mission_config': {

        if (context.hasMissionConfig !== false) {
          state = 'connected';
        } else {
          state = 'awaiting_connection';
        }
        break;
      }

      case 'none':
      default:
        state = 'connected';
        break;
    }
  } catch (err) {
    console.warn(TAG, `Error evaluating state for ${widgetId}:`, err);
    state = 'error';
  }

  // Log state changes quietly
  logStateChange(widgetId, state);

  return state;
}

// ═══════════════════════════════════════════════════════════
// GET PLACEHOLDER CONTENT
// ═══════════════════════════════════════════════════════════

/**
 * Get the full placeholder content for a widget in a given state.
 *
 * @param widgetId  - The widget identifier
 * @param state     - The telemetry availability state
 * @returns TelemetryPlaceholderContent with messages, icon, and action
 */
export function getPlaceholderContent(
  widgetId: string,
  state: TelemetryAvailability,
): TelemetryPlaceholderContent {
  const messages = PLACEHOLDER_MESSAGES[state];
  const sourceType = WIDGET_TELEMETRY_MAP[widgetId] || 'none';
  const connectRoute = CONNECT_ROUTES[sourceType];

  // Only show "Connect Device" if there's a valid route
  const showConnectAction = state === 'awaiting_connection' && connectRoute !== null;

  return {
    state,
    primaryMessage: messages.primary,
    secondaryMessage: messages.secondary,
    iconName: messages.icon,
    showConnectAction,
    connectRoute,
  };
}

// ═══════════════════════════════════════════════════════════
// CONVENIENCE: CHECK IF WIDGET NEEDS PLACEHOLDER
// ═══════════════════════════════════════════════════════════

/**
 * Quick check: does this widget need a placeholder instead of live content?
 */
export function needsPlaceholder(
  widgetId: string,
  context: TelemetryContext,
): boolean {
  const state = evaluateTelemetryState(widgetId, context);
  return state !== 'connected';
}

/**
 * Get the telemetry source type for a widget.
 */
export function getWidgetTelemetrySource(widgetId: string): TelemetrySourceType {
  return WIDGET_TELEMETRY_MAP[widgetId] || 'none';
}

/**
 * Check if a widget has any telemetry dependency.
 */
export function hasTelemetryDependency(widgetId: string): boolean {
  const source = WIDGET_TELEMETRY_MAP[widgetId];
  return source !== undefined && source !== 'none';
}

// ═══════════════════════════════════════════════════════════
// COMPANION SURFACE SUPPORT (CarPlay / Android Auto)
// ═══════════════════════════════════════════════════════════

/**
 * Get a simplified placeholder message for companion surfaces
 * (CarPlay, Android Auto) which have limited display space.
 */
export function getCompanionPlaceholderMessage(
  state: TelemetryAvailability,
): string {
  switch (state) {
    case 'connected':
      return 'Connected';
    case 'awaiting_connection':
      return 'Awaiting Connection';
    case 'unavailable':
      return 'Unavailable';
    case 'error':
      return 'Temporarily Unavailable';
    default:
      return 'Unknown';
  }
}

