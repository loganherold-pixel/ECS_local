import { Platform } from 'react-native';

import type { NavigationHandoffPayload } from './navigationHandoffStore';
import type { TrailNavigationStatus } from './trailGuidanceEngine';
import { createPersistedKeyValueCache } from './keyValuePersistence';

const STORAGE_KEY = 'ecs_trail_navigation_session_v1';
const nativeTrailNavigationCache = createPersistedKeyValueCache('ecs_trail_navigation');

export interface TrailNavigationSessionSnapshot {
  sessionId: string;
  payload: NavigationHandoffPayload;
  status: TrailNavigationStatus;
  reachedWaypointIds: string[];
  lastKnownRouteIndex: number;
  updatedAt: string;
}

async function readStorage(): Promise<string | null> {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY);
    }
    await nativeTrailNavigationCache.waitForHydration();
    return nativeTrailNavigationCache.get(STORAGE_KEY);
  } catch {
    return null;
  }
}

async function writeStorage(value: string | null): Promise<void> {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      if (value == null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, value);
      return;
    }
    nativeTrailNavigationCache.set(STORAGE_KEY, value ?? '');
  } catch {}
}

export async function saveTrailNavigationSession(
  snapshot: TrailNavigationSessionSnapshot,
): Promise<void> {
  await writeStorage(JSON.stringify(snapshot));
}

export async function loadTrailNavigationSession(): Promise<TrailNavigationSessionSnapshot | null> {
  const raw = await readStorage();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TrailNavigationSessionSnapshot;
  } catch {
    return null;
  }
}

export async function clearTrailNavigationSession(): Promise<void> {
  await writeStorage(null);
}
