export type LocationPermissionResponse = {
  status?: string;
  canAskAgain?: boolean;
};

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
};

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
