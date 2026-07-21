export type LocationPermissionResponse = {
  status?: string;
  canAskAgain?: boolean;
  android?: { accuracy?: 'fine' | 'coarse' | 'none' };
  ios?: { scope?: 'whenInUse' | 'always' | 'none' };
};

export type ApplicationLocationPermissionState =
  | 'unknown'
  | 'requesting'
  | 'precise_granted'
  | 'approximate_granted'
  | 'denied_requestable'
  | 'denied_permanent_or_settings_required'
  | 'services_disabled'
  | 'request_error';

export type LocationPrecision = 'precise' | 'approximate' | 'unknown';

export type ForegroundLocationPermissionModule = {
  getForegroundPermissionsAsync?: () => Promise<LocationPermissionResponse>;
  requestForegroundPermissionsAsync: () => Promise<LocationPermissionResponse>;
};

export type ForegroundLocationPermissionState =
  | 'unknown'
  | 'requestable'
  | 'granted'
  | 'denied_requestable'
  | 'blocked'
  | 'restricted'
  | 'unavailable';

export type ForegroundLocationPermissionSnapshot = {
  state: ForegroundLocationPermissionState;
  canAskAgain: boolean | null;
  response: LocationPermissionResponse;
  precision?: LocationPrecision;
};

export function resolveApplicationLocationPermissionState(input: {
  permission: ForegroundLocationPermissionSnapshot;
  servicesEnabled?: boolean | null;
  requesting?: boolean;
  requestError?: boolean;
}): ApplicationLocationPermissionState {
  if (input.requesting) return 'requesting';
  if (input.requestError) return 'request_error';
  if (input.servicesEnabled === false) return 'services_disabled';
  if (input.permission.state === 'granted') {
    return input.permission.precision === 'approximate'
      ? 'approximate_granted'
      : 'precise_granted';
  }
  if (input.permission.state === 'denied_requestable' || input.permission.state === 'requestable') {
    return 'denied_requestable';
  }
  if (input.permission.state === 'blocked' || input.permission.state === 'restricted') {
    return 'denied_permanent_or_settings_required';
  }
  if (input.permission.state === 'unavailable') return 'request_error';
  return 'unknown';
}

export type ForegroundLocationPermissionRecoveryAction =
  | 'none'
  | 'request_in_app'
  | 'open_native_settings';

export function resolveForegroundLocationPermissionRecoveryAction(
  state: ForegroundLocationPermissionState,
  platform: 'web' | 'native',
): ForegroundLocationPermissionRecoveryAction {
  if (state === 'requestable' || state === 'denied_requestable') {
    return 'request_in_app';
  }
  if (state === 'blocked' || state === 'restricted') {
    return platform === 'web' ? 'request_in_app' : 'open_native_settings';
  }
  return 'none';
}

const foregroundPermissionRequests = new WeakMap<
  object,
  Promise<LocationPermissionResponse>
>();

export function normalizeForegroundLocationPermission(
  response: LocationPermissionResponse | null | undefined,
): ForegroundLocationPermissionSnapshot {
  const status = String(response?.status ?? 'unknown').trim().toLowerCase();
  const canAskAgain = typeof response?.canAskAgain === 'boolean'
    ? response.canAskAgain
    : null;

  let state: ForegroundLocationPermissionState;
  if (status === 'granted') {
    state = 'granted';
  } else if (status === 'restricted') {
    state = 'restricted';
  } else if (status === 'unavailable') {
    state = 'unavailable';
  } else if (status === 'undetermined' || status === 'prompt') {
    state = 'requestable';
  } else if (status === 'denied') {
    state = canAskAgain === false ? 'blocked' : 'denied_requestable';
  } else {
    state = 'unknown';
  }

  return {
    state,
    canAskAgain,
    response: response ?? { status: 'unknown' },
    precision: response?.android?.accuracy === 'coarse'
      ? 'approximate'
      : response?.android?.accuracy === 'fine'
        ? 'precise'
        : status === 'granted' && response?.ios?.scope !== 'none'
          ? 'precise'
          : 'unknown',
  };
}

export async function inspectForegroundLocationPermission(
  Location: ForegroundLocationPermissionModule,
): Promise<ForegroundLocationPermissionSnapshot> {
  if (typeof Location.getForegroundPermissionsAsync !== 'function') {
    return normalizeForegroundLocationPermission({
      status: 'undetermined',
      canAskAgain: true,
    });
  }

  return normalizeForegroundLocationPermission(
    await Location.getForegroundPermissionsAsync(),
  );
}

/**
 * Issues one provider request for equivalent concurrent callers. This keeps a
 * single user action from fan-out requesting through GPS and heading consumers.
 */
export async function requestForegroundLocationPermission(
  Location: ForegroundLocationPermissionModule,
): Promise<ForegroundLocationPermissionSnapshot> {
  const key = Location as object;
  const existing = foregroundPermissionRequests.get(key);
  if (existing) {
    return normalizeForegroundLocationPermission(await existing);
  }

  const request = Location.requestForegroundPermissionsAsync();
  foregroundPermissionRequests.set(key, request);
  try {
    return normalizeForegroundLocationPermission(await request);
  } finally {
    if (foregroundPermissionRequests.get(key) === request) {
      foregroundPermissionRequests.delete(key);
    }
  }
}

/**
 * Backward-compatible preflight for explicit workflows outside Navigate.
 * Navigate itself inspects on focus and calls the explicit request helper only
 * from a user action.
 */
export async function ensureForegroundLocationPermission(
  Location: ForegroundLocationPermissionModule,
): Promise<LocationPermissionResponse> {
  const current = await inspectForegroundLocationPermission(Location);
  if (
    current.state === 'granted' ||
    current.state === 'blocked' ||
    current.state === 'restricted' ||
    current.state === 'unavailable'
  ) {
    return current.response;
  }

  const requested = await requestForegroundLocationPermission(Location);
  return requested.response;
}
