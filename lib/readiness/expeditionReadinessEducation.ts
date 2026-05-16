export const EXPEDITION_READINESS_EDUCATION_SURFACES = [
  'commandBriefEmpty',
  'exploreFirstReadiness',
  'navigateRoutePreview',
  'dashboardReadinessWidget',
] as const;

export type ExpeditionReadinessEducationSurface = (typeof EXPEDITION_READINESS_EDUCATION_SURFACES)[number];

export type ExpeditionReadinessEducationState = {
  dismissed: Partial<Record<ExpeditionReadinessEducationSurface, string>>;
  updatedAt: string | null;
};

type EducationListener = (state: ExpeditionReadinessEducationState) => void;

const STORAGE_KEY = 'ecs_expedition_readiness_education_v1';

export const EXPEDITION_READINESS_EDUCATION_COPY = {
  title: 'ECS is not just a map.',
  body: 'ECS Expedition Readiness combines your vehicle, route, weather, camp confidence, offline package, power, recovery options, and communications into one command-grade readiness decision.',
  statuses: [
    { label: 'Ready', summary: 'Current inputs support the plan.' },
    { label: 'Caution', summary: 'Review recommended before departure.' },
    { label: 'Hold', summary: 'One or more blockers need attention.' },
  ],
  limitedConfidence:
    'When inputs are missing, stale, or ECS-inferred, readiness stays confidence-based and shows what needs review.',
} as const;

export const DEFAULT_EXPEDITION_READINESS_EDUCATION_STATE: ExpeditionReadinessEducationState = {
  dismissed: {},
  updatedAt: null,
};

const listeners = new Set<EducationListener>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function localStorageSafe() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function isEducationSurface(value: string): value is ExpeditionReadinessEducationSurface {
  return (EXPEDITION_READINESS_EDUCATION_SURFACES as readonly string[]).includes(value);
}

function normalizeEducationState(value: unknown): ExpeditionReadinessEducationState {
  if (!isRecord(value)) return DEFAULT_EXPEDITION_READINESS_EDUCATION_STATE;

  const dismissed: ExpeditionReadinessEducationState['dismissed'] = {};
  if (isRecord(value.dismissed)) {
    Object.entries(value.dismissed).forEach(([surface, timestamp]) => {
      if (isEducationSurface(surface) && typeof timestamp === 'string') {
        dismissed[surface] = timestamp;
      }
    });
  }

  return {
    dismissed,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : null,
  };
}

function readStoredEducationState(): ExpeditionReadinessEducationState {
  const storage = localStorageSafe();
  if (!storage) return DEFAULT_EXPEDITION_READINESS_EDUCATION_STATE;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return raw ? normalizeEducationState(JSON.parse(raw)) : DEFAULT_EXPEDITION_READINESS_EDUCATION_STATE;
  } catch {
    return DEFAULT_EXPEDITION_READINESS_EDUCATION_STATE;
  }
}

function writeStoredEducationState(state: ExpeditionReadinessEducationState): void {
  const storage = localStorageSafe();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

let currentState = readStoredEducationState();

function notify(state: ExpeditionReadinessEducationState): void {
  listeners.forEach((listener) => {
    try {
      listener(state);
    } catch {}
  });
}

export const expeditionReadinessEducationStore = {
  getSnapshot(): ExpeditionReadinessEducationState {
    return currentState;
  },

  subscribe(listener: EducationListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  isDismissed(surface: ExpeditionReadinessEducationSurface): boolean {
    return Boolean(currentState.dismissed[surface]);
  },

  dismiss(surface: ExpeditionReadinessEducationSurface): ExpeditionReadinessEducationState {
    const now = new Date().toISOString();
    currentState = {
      dismissed: {
        ...currentState.dismissed,
        [surface]: now,
      },
      updatedAt: now,
    };
    writeStoredEducationState(currentState);
    notify(currentState);
    return currentState;
  },

  reset(): ExpeditionReadinessEducationState {
    currentState = {
      ...DEFAULT_EXPEDITION_READINESS_EDUCATION_STATE,
      updatedAt: new Date().toISOString(),
    };
    writeStoredEducationState(currentState);
    notify(currentState);
    return currentState;
  },
};

