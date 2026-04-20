import { Dimensions } from 'react-native';
import { getECSLayoutClass } from './useAdaptiveLayout';

export type EcsIssueWeatherStatus = 'live' | 'stale' | 'unavailable';
export type EcsIssueLayoutClass = 'compact' | 'medium' | 'expanded';

interface EcsIssueRuntimeActor {
  userId: string | null;
  isAdmin: boolean;
}

interface EcsIssueRuntimeState {
  currentPath: string | null;
  activeTab: string | null;
  actor: EcsIssueRuntimeActor;
  isOnline: boolean | null;
  syncStatus: string | null;
  weatherStatus: EcsIssueWeatherStatus | null;
}

const runtimeState: EcsIssueRuntimeState = {
  currentPath: null,
  activeTab: null,
  actor: {
    userId: null,
    isAdmin: false,
  },
  isOnline: null,
  syncStatus: null,
  weatherStatus: null,
};

function normalizePath(path: string | null | undefined): string | null {
  if (!path) return null;
  const withoutGroups = path.replace(/\/\([^/]+\)/g, '');
  const normalized = withoutGroups.replace(/\/index$/, '') || '/';
  return normalized === '' ? '/' : normalized;
}

function deriveActiveTab(path: string | null): string | null {
  if (!path) return null;
  const normalized = path.toLowerCase();
  if (normalized.includes('/fleet')) return 'Fleet';
  if (normalized.includes('/navigate')) return 'Navigate';
  if (normalized.includes('/dashboard')) return 'Dashboard';
  if (normalized.includes('/discover') || normalized.includes('/explore')) return 'Explore';
  if (normalized.includes('/alert')) return 'Alert';
  if (normalized.includes('/more')) return 'More';
  return null;
}

export function setIssueRuntimePath(path: string | null | undefined): void {
  const normalized = normalizePath(path);
  runtimeState.currentPath = normalized;
  runtimeState.activeTab = deriveActiveTab(normalized);
}

export function setIssueRuntimeActor(actor: Partial<EcsIssueRuntimeActor>): void {
  runtimeState.actor = {
    ...runtimeState.actor,
    ...actor,
  };
}

export function setIssueRuntimeConnectivity(params: {
  isOnline?: boolean | null;
  syncStatus?: string | null;
}): void {
  if (typeof params.isOnline !== 'undefined') {
    runtimeState.isOnline = params.isOnline;
  }
  if (typeof params.syncStatus !== 'undefined') {
    runtimeState.syncStatus = params.syncStatus;
  }
}

export function setIssueRuntimeWeatherStatus(status: EcsIssueWeatherStatus | null): void {
  runtimeState.weatherStatus = status;
}

export function getIssueRuntimeLayoutClass(): EcsIssueLayoutClass {
  try {
    const { width, height } = Dimensions.get('window');
    return getECSLayoutClass(width, height);
  } catch {
    return 'compact';
  }
}

export function getIssueRuntimeSnapshot(): Readonly<EcsIssueRuntimeState> {
  return {
    currentPath: runtimeState.currentPath,
    activeTab: runtimeState.activeTab,
    actor: { ...runtimeState.actor },
    isOnline: runtimeState.isOnline,
    syncStatus: runtimeState.syncStatus,
    weatherStatus: runtimeState.weatherStatus,
  };
}
