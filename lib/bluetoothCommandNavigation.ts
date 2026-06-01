export const UNIFIED_BLUETOOTH_COMMAND_ROUTE = '/power/blu' as const;

export type BluetoothCommandRouter = {
  push: (href: typeof UNIFIED_BLUETOOTH_COMMAND_ROUTE) => unknown;
};

export function openUnifiedBluetoothCommand(
  router: BluetoothCommandRouter,
  options: { onUnavailable?: () => void } = {},
): boolean {
  try {
    router.push(UNIFIED_BLUETOOTH_COMMAND_ROUTE);
    return true;
  } catch {
    options.onUnavailable?.();
    return false;
  }
}
