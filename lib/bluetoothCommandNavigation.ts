import {
  acquireECSNavigation,
  cancelECSNavigation,
} from './navigation/ecsNavigationCoordinator';
import { normalizeECSReturnRoute } from './routeManifest';

export const UNIFIED_BLUETOOTH_COMMAND_ROUTE = '/power/blu' as const;

export type UnifiedBluetoothCommandTarget =
  | typeof UNIFIED_BLUETOOTH_COMMAND_ROUTE
  | {
      pathname: typeof UNIFIED_BLUETOOTH_COMMAND_ROUTE;
      params: { returnTo: string };
    };

export type BluetoothCommandRouter = {
  push: (href: UnifiedBluetoothCommandTarget) => unknown;
};

export function openUnifiedBluetoothCommand(
  router: BluetoothCommandRouter,
  options: {
    returnTo?: string | null;
    onUnavailable?: () => void;
  } = {},
): boolean {
  const returnTo = options.returnTo
    ? normalizeECSReturnRoute(options.returnTo)
    : null;
  const attempt = acquireECSNavigation({
    targetPath: UNIFIED_BLUETOOTH_COMMAND_ROUTE,
    sourcePath: returnTo,
    method: 'push',
  });
  if (!attempt.accepted) {
    return attempt.status === 'duplicate' || attempt.status === 'same_route';
  }

  try {
    router.push(returnTo
      ? {
          pathname: UNIFIED_BLUETOOTH_COMMAND_ROUTE,
          params: { returnTo },
        }
      : UNIFIED_BLUETOOTH_COMMAND_ROUTE);
    return true;
  } catch {
    cancelECSNavigation(attempt.token);
    options.onUnavailable?.();
    return false;
  }
}
