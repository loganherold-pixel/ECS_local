import { createMigratingNonSecureStorage } from './nonSecureStorage';

const STORAGE_KEY = 'ecs_pending_navigation_flow_v1';
const navigationFlowStorage = createMigratingNonSecureStorage('ecs_navigation_flow', {
  logTag: 'ECSNavigationFlow',
});

export type ECSNavigationSurface =
  | 'fleet'
  | 'dashboard'
  | 'navigate'
  | 'explore'
  | 'alert';

export type ECSNavigationFlowIntent =
  | 'fleet_add_vehicle'
  | 'fleet_edit_vehicle'
  | 'vehicle_context_updated'
  | 'vehicle_ready_confirmed'
  | 'route_preview'
  | 'quick_action'
  | 'navigation_ended'
  | 'editor_saved'
  | 'editor_cancelled';

export interface ECSNavigationFlow {
  id: string;
  source: ECSNavigationSurface;
  target: ECSNavigationSurface;
  intent: ECSNavigationFlowIntent;
  label: string;
  message?: string | null;
  context?: Record<string, unknown> | null;
  createdAt: string;
}

async function readStorage(): Promise<string | null> {
  return navigationFlowStorage.read(STORAGE_KEY);
}

async function writeStorage(value: string | null): Promise<void> {
  await navigationFlowStorage.write(STORAGE_KEY, value);
}

export async function stageNavigationFlow(
  flow: Omit<ECSNavigationFlow, 'id' | 'createdAt'>,
): Promise<ECSNavigationFlow> {
  const next: ECSNavigationFlow = {
    ...flow,
    id: `${flow.source}:${flow.target}:${Date.now()}`,
    createdAt: new Date().toISOString(),
  };
  await writeStorage(JSON.stringify(next));
  return next;
}

export async function loadNavigationFlow(): Promise<ECSNavigationFlow | null> {
  const raw = await readStorage();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as ECSNavigationFlow;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.source || !parsed.target || !parsed.intent || !parsed.label) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function clearNavigationFlow(): Promise<void> {
  await writeStorage(null);
}

export async function consumeNavigationFlow(
  target: ECSNavigationSurface,
): Promise<ECSNavigationFlow | null> {
  const flow = await loadNavigationFlow();
  if (!flow || flow.target !== target) return null;
  await clearNavigationFlow();
  return flow;
}
