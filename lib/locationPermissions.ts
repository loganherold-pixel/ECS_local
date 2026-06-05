type LocationPermissionResponse = {
  status?: string;
  canAskAgain?: boolean;
};

type ForegroundLocationPermissionModule = {
  getForegroundPermissionsAsync?: () => Promise<LocationPermissionResponse>;
  requestForegroundPermissionsAsync: () => Promise<LocationPermissionResponse>;
};

/**
 * Avoid relaunching Android's permission controller when foreground location is
 * already granted. First-run and recoverable denied states still request.
 */
export async function ensureForegroundLocationPermission(
  Location: ForegroundLocationPermissionModule,
): Promise<LocationPermissionResponse> {
  if (typeof Location.getForegroundPermissionsAsync === 'function') {
    const current = await Location.getForegroundPermissionsAsync();
    if (current?.status === 'granted') {
      return current;
    }
    if (current?.status === 'denied' && current?.canAskAgain === false) {
      return current;
    }
  }

  return Location.requestForegroundPermissionsAsync();
}
