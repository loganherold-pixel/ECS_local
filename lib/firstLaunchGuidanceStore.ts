import { createMigratingNonSecureStorage } from './nonSecureStorage';

const DASHBOARD_LONG_PRESS_HINT_KEY = 'ecs_has_seen_dashboard_long_press_hint';
const guidanceStorage = createMigratingNonSecureStorage('ecs_first_launch_guidance', {
  logTag: 'FirstLaunchGuidanceStore',
});

let memoryFallbackSeen = false;
let cachedHintSeen: boolean | null = null;

async function getPersistedValue(): Promise<string | null> {
  const persisted = await guidanceStorage.read(DASHBOARD_LONG_PRESS_HINT_KEY);
  return persisted ?? (memoryFallbackSeen ? 'true' : null);
}

async function setPersistedValue(value: string): Promise<void> {
  await guidanceStorage.write(DASHBOARD_LONG_PRESS_HINT_KEY, value);
  memoryFallbackSeen = value === 'true';
}

export async function hasSeenDashboardLongPressHint(): Promise<boolean> {
  if (cachedHintSeen != null) {
    return cachedHintSeen;
  }

  const stored = await getPersistedValue();
  cachedHintSeen = stored === 'true';
  return cachedHintSeen;
}

export async function markDashboardLongPressHintSeen(): Promise<void> {
  cachedHintSeen = true;
  await setPersistedValue('true');
}
