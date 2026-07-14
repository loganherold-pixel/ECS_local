import { hapticCommand } from '../haptics';

export async function safelyFireBadgeUnlockHaptic(
  trigger: () => Promise<void> = hapticCommand,
): Promise<boolean> {
  try {
    await trigger();
    return true;
  } catch {
    return false;
  }
}
