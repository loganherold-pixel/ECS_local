import type {
  RoadNavDestination,
  RoadNavSourceType,
  RoadNavStatus,
} from './mapboxRoadNavigation';
import { createMigratingNonSecureStorage } from './nonSecureStorage';

const ROAD_NAVIGATION_SESSION_KEY = 'ecs_road_navigation_session_v1';
const ROAD_NAVIGATION_SESSION_VERSION = 1;
const roadNavigationStorage = createMigratingNonSecureStorage('ecs_road_navigation', {
  logTag: 'RoadNavigationStore',
});

export interface PersistedRoadNavigationSession {
  version: number;
  sessionId: string;
  destination: RoadNavDestination;
  status: Extract<
    RoadNavStatus,
    'destination_selected' | 'route_preview' | 'navigation_active' | 'rerouting' | 'arrived'
  >;
  createdFrom: RoadNavSourceType;
  updatedAt: string;
}

async function readStoredSession(): Promise<string | null> {
  return roadNavigationStorage.read(ROAD_NAVIGATION_SESSION_KEY);
}

async function writeStoredSession(value: string | null): Promise<void> {
  await roadNavigationStorage.write(ROAD_NAVIGATION_SESSION_KEY, value);
}

async function clearStoredSession(): Promise<void> {
  await roadNavigationStorage.remove(ROAD_NAVIGATION_SESSION_KEY);
}

function sanitizeDestinationForPersistence(destination: RoadNavDestination): RoadNavDestination {
  return {
    ...destination,
    raw: null,
  };
}

export async function loadRoadNavigationSession(): Promise<PersistedRoadNavigationSession | null> {
  const raw = await readStoredSession();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as PersistedRoadNavigationSession;
    if (
      parsed?.version !== ROAD_NAVIGATION_SESSION_VERSION ||
      !parsed?.destination?.coordinate ||
      !parsed?.sessionId
    ) {
      return null;
    }

    if (parsed.destination?.raw != null) {
      const sanitized = {
        ...parsed,
        destination: sanitizeDestinationForPersistence(parsed.destination),
      };
      void writeStoredSession(JSON.stringify(sanitized));
      return sanitized;
    }

    return parsed;
  } catch {
    return null;
  }
}

export async function saveRoadNavigationSession(
  session: Omit<PersistedRoadNavigationSession, 'version'>,
): Promise<void> {
  await writeStoredSession(
    JSON.stringify({
      ...session,
      destination: sanitizeDestinationForPersistence(session.destination),
      version: ROAD_NAVIGATION_SESSION_VERSION,
    } satisfies PersistedRoadNavigationSession),
  );
}

export async function clearRoadNavigationSession(): Promise<void> {
  await clearStoredSession();
}
