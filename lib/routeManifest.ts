export type ECSPrimaryTabId = 'fleet' | 'navigate' | 'dashboard' | 'explore' | 'dispatch';
export type ECSDockKey = 'fleet' | 'navigate' | 'dashboard' | 'discover' | 'alert';
export type ECSDispatchRoutePurpose =
  | 'primary_dispatch_landing'
  | 'convoy_command_surface'
  | 'expedition_dispatch_command_surface'
  | 'dispatch_secondary_route';

export type ECSRouteOwnershipKind =
  | 'primary_tab'
  | 'nested_tab_route'
  | 'legacy_shell_route'
  | 'protected_dispatch_route';

export interface ECSPrimaryTabManifestEntry {
  id: ECSPrimaryTabId;
  label: string;
  dockLabel: string;
  dockKey: ECSDockKey;
  route: string;
  activePathAliases: readonly string[];
}

export interface ECSRouteOwnershipEntry {
  path: string;
  ownerTabId: ECSPrimaryTabId | null;
  kind: ECSRouteOwnershipKind;
  restorableShellRoute: string | null;
  sharedShellBackground: boolean;
  forceSharedShellBackgroundWithoutDock?: boolean;
  protectedScreenName?: string;
  note?: string;
}

export interface ECSDispatchRouteRelationship {
  path: string;
  purpose: ECSDispatchRoutePurpose;
  ownerTabId: 'dispatch';
  label: string;
  note: string;
}

export const ECS_CANONICAL_DISPATCH_ROUTE = '/alert';

export const ECS_DISPATCH_ROUTE_RELATIONSHIPS = [
  {
    path: '/alert',
    purpose: 'primary_dispatch_landing',
    ownerTabId: 'dispatch',
    label: 'Dispatch',
    note: 'Visible bottom-tab Dispatch landing. The legacy path name remains /alert for route compatibility, but the screen hosts DispatchCadCommandCenter.',
  },
  {
    path: '/convoy-command',
    purpose: 'convoy_command_surface',
    ownerTabId: 'dispatch',
    label: 'Convoy Command',
    note: 'Dispatch-owned credentials, roster, invite, and convoy setup surface.',
  },
  {
    path: '/expedition-dispatch',
    purpose: 'expedition_dispatch_command_surface',
    ownerTabId: 'dispatch',
    label: 'Expedition Dispatch',
    note: 'Expedition-specific dispatch event feed. Requires an expedition id.',
  },
  {
    path: '/safety',
    purpose: 'dispatch_secondary_route',
    ownerTabId: 'dispatch',
    label: 'Safety',
    note: 'Legacy Dispatch-adjacent shell route retained for compatibility.',
  },
  {
    path: '/intel',
    purpose: 'dispatch_secondary_route',
    ownerTabId: 'dispatch',
    label: 'Intel',
    note: 'Legacy Dispatch-adjacent shell route retained for compatibility.',
  },
  {
    path: '/more',
    purpose: 'dispatch_secondary_route',
    ownerTabId: 'dispatch',
    label: 'More',
    note: 'Legacy Dispatch-adjacent shell route retained for compatibility.',
  },
] as const satisfies readonly ECSDispatchRouteRelationship[];

export const ECS_PRIMARY_TAB_MANIFEST = [
  {
    id: 'fleet',
    label: 'Fleet',
    dockLabel: 'FLEET',
    dockKey: 'fleet',
    route: '/fleet',
    activePathAliases: ['/fleet', '/vehicle-config'],
  },
  {
    id: 'navigate',
    label: 'Navigate',
    dockLabel: 'NAVIGATE',
    dockKey: 'navigate',
    route: '/navigate',
    activePathAliases: ['/navigate', '/route', '/navigate-run', '/navigate-offline', '/navigate-bailouts'],
  },
  {
    id: 'dashboard',
    label: 'Dashboard',
    dockLabel: '',
    dockKey: 'dashboard',
    route: '/dashboard',
    activePathAliases: ['/dashboard'],
  },
  {
    id: 'explore',
    label: 'Explore',
    dockLabel: 'EXPLORE',
    dockKey: 'discover',
    route: '/discover',
    activePathAliases: ['/discover', '/explore', '/explore-trip-builder', '/explore-offline-prep-pack'],
  },
  {
    id: 'dispatch',
    label: 'Dispatch',
    dockLabel: 'DISPATCH',
    dockKey: 'alert',
    route: ECS_CANONICAL_DISPATCH_ROUTE,
    activePathAliases: ['/alert', '/safety', '/intel', '/more', '/convoy-command', '/expedition-dispatch'],
  },
] as const satisfies readonly ECSPrimaryTabManifestEntry[];

export const ECS_PROTECTED_ROUTE_SCREENS = [
  'expedition-detail',
  'expedition-command',
  'expedition-checklist',
  'expedition-log',
  'expedition-route-mgr',
  'expedition-livelog',
  'expedition-dispatch',
] as const;

const PRIMARY_ROUTE_OWNERSHIP = ECS_PRIMARY_TAB_MANIFEST.map((tab) => ({
  path: tab.route,
  ownerTabId: tab.id,
  kind: 'primary_tab' as const,
  restorableShellRoute: tab.route,
  sharedShellBackground: true,
}));

export const ECS_ROUTE_OWNERSHIP_MANIFEST = [
  ...PRIMARY_ROUTE_OWNERSHIP,
  {
    path: '/explore',
    ownerTabId: 'explore',
    kind: 'nested_tab_route',
    restorableShellRoute: '/discover',
    sharedShellBackground: true,
  },
  {
    path: '/explore-trip-builder',
    ownerTabId: 'explore',
    kind: 'nested_tab_route',
    restorableShellRoute: '/discover',
    sharedShellBackground: true,
    forceSharedShellBackgroundWithoutDock: true,
  },
  {
    path: '/explore-offline-prep-pack',
    ownerTabId: 'explore',
    kind: 'nested_tab_route',
    restorableShellRoute: '/discover',
    sharedShellBackground: true,
    forceSharedShellBackgroundWithoutDock: true,
  },
  {
    path: '/vehicle-config',
    ownerTabId: 'fleet',
    kind: 'nested_tab_route',
    restorableShellRoute: '/fleet',
    sharedShellBackground: true,
  },
  {
    path: '/route',
    ownerTabId: 'navigate',
    kind: 'nested_tab_route',
    restorableShellRoute: '/navigate',
    sharedShellBackground: true,
  },
  {
    path: '/navigate-run',
    ownerTabId: 'navigate',
    kind: 'nested_tab_route',
    restorableShellRoute: '/navigate',
    sharedShellBackground: false,
  },
  {
    path: '/navigate-offline',
    ownerTabId: 'navigate',
    kind: 'nested_tab_route',
    restorableShellRoute: '/navigate',
    sharedShellBackground: false,
  },
  {
    path: '/navigate-bailouts',
    ownerTabId: 'navigate',
    kind: 'nested_tab_route',
    restorableShellRoute: '/navigate',
    sharedShellBackground: false,
  },
  {
    path: '/safety',
    ownerTabId: 'dispatch',
    kind: 'nested_tab_route',
    restorableShellRoute: '/alert',
    sharedShellBackground: true,
  },
  {
    path: '/intel',
    ownerTabId: 'dispatch',
    kind: 'nested_tab_route',
    restorableShellRoute: '/alert',
    sharedShellBackground: true,
  },
  {
    path: '/more',
    ownerTabId: 'dispatch',
    kind: 'nested_tab_route',
    restorableShellRoute: '/alert',
    sharedShellBackground: true,
  },
  {
    path: '/convoy-command',
    ownerTabId: 'dispatch',
    kind: 'nested_tab_route',
    restorableShellRoute: '/alert',
    sharedShellBackground: true,
    forceSharedShellBackgroundWithoutDock: true,
  },
  {
    path: '/expedition-dispatch',
    ownerTabId: 'dispatch',
    kind: 'protected_dispatch_route',
    restorableShellRoute: '/alert',
    sharedShellBackground: false,
    protectedScreenName: 'expedition-dispatch',
    note: 'Protected Dispatch detail surface keeps its own TopoBackground instead of root shared shell background chrome.',
  },
  {
    path: '/trips',
    ownerTabId: null,
    kind: 'legacy_shell_route',
    restorableShellRoute: null,
    sharedShellBackground: true,
  },
  {
    path: '/expeditions',
    ownerTabId: null,
    kind: 'legacy_shell_route',
    restorableShellRoute: null,
    sharedShellBackground: true,
  },
  {
    path: '/intelligence',
    ownerTabId: null,
    kind: 'legacy_shell_route',
    restorableShellRoute: null,
    sharedShellBackground: true,
  },
  {
    path: '/loadmap',
    ownerTabId: null,
    kind: 'legacy_shell_route',
    restorableShellRoute: null,
    sharedShellBackground: true,
  },
  {
    path: '/loaditems',
    ownerTabId: null,
    kind: 'legacy_shell_route',
    restorableShellRoute: null,
    sharedShellBackground: true,
  },
] as const satisfies readonly ECSRouteOwnershipEntry[];

export const ECS_RESTORABLE_SHELL_ROUTES = ECS_PRIMARY_TAB_MANIFEST.map((tab) => tab.route);

const TAB_BY_ID = new Map<ECSPrimaryTabId, ECSPrimaryTabManifestEntry>(
  ECS_PRIMARY_TAB_MANIFEST.map((tab) => [tab.id, tab]),
);

function stripRouteGroups(path: string): string {
  return path.replace(/\/\([^/]+\)/g, '');
}

export function normalizeECSRoutePath(path: string | null | undefined): string {
  if (!path || path === '/') {
    return '/';
  }

  const withoutQueryAndHash = stripRouteGroups(path).split(/[?#]/, 1)[0];
  const withoutTrailingSlash = withoutQueryAndHash.length > 1
    ? withoutQueryAndHash.replace(/\/+$/, '')
    : withoutQueryAndHash;
  const normalized = withoutTrailingSlash.replace(/\/index$/, '') || '/';
  return normalized === '' ? '/' : normalized;
}

function routeAliasMatches(path: string, alias: string): boolean {
  const normalizedPath = normalizeECSRoutePath(path);
  const normalizedAlias = normalizeECSRoutePath(alias);
  return normalizedPath === normalizedAlias || normalizedPath.startsWith(`${normalizedAlias}/`);
}

export function getRouteOwnership(path: string | null | undefined): ECSRouteOwnershipEntry | null {
  const normalized = normalizeECSRoutePath(path);
  return ECS_ROUTE_OWNERSHIP_MANIFEST.find((entry) => routeAliasMatches(normalized, entry.path)) ?? null;
}

export function getDispatchRouteRelationship(path: string | null | undefined): ECSDispatchRouteRelationship | null {
  const normalized = normalizeECSRoutePath(path);
  return ECS_DISPATCH_ROUTE_RELATIONSHIPS.find((entry) => routeAliasMatches(normalized, entry.path)) ?? null;
}

export function getPrimaryTabById(id: ECSPrimaryTabId): ECSPrimaryTabManifestEntry {
  const tab = TAB_BY_ID.get(id);
  if (!tab) {
    throw new Error(`Unknown ECS primary tab id: ${id}`);
  }
  return tab;
}

export function getPrimaryTabForPath(path: string | null | undefined): ECSPrimaryTabManifestEntry | null {
  const normalized = normalizeECSRoutePath(path);
  const tab = ECS_PRIMARY_TAB_MANIFEST.find((entry) =>
    entry.activePathAliases.some((alias) => routeAliasMatches(normalized, alias)),
  );
  return tab ?? null;
}

export function isPrimaryTabActiveForPath(tabId: ECSPrimaryTabId, path: string | null | undefined): boolean {
  return getPrimaryTabForPath(path)?.id === tabId;
}

export function getRestorableShellRouteForPath(path: string | null | undefined): string | null {
  const normalized = normalizeECSRoutePath(path);
  const tab = getPrimaryTabForPath(normalized);
  if (tab) return tab.route;

  const ownership = getRouteOwnership(normalized);
  return ownership?.restorableShellRoute ?? null;
}

export function toExpoRouterShellTarget(path: string): string {
  const restorable = getRestorableShellRouteForPath(path);
  return restorable ?? normalizeECSRoutePath(path);
}

export function isProtectedRoutePath(path: string | null | undefined): boolean {
  const normalized = normalizeECSRoutePath(path);
  return ECS_PROTECTED_ROUTE_SCREENS.some((screen) => normalized === `/${screen}`);
}

export function isSharedShellBackgroundRoute(path: string | null | undefined): boolean {
  return Boolean(getRouteOwnership(path)?.sharedShellBackground);
}

export function shouldForceSharedShellBackgroundWithoutDock(path: string | null | undefined): boolean {
  return Boolean(getRouteOwnership(path)?.forceSharedShellBackgroundWithoutDock);
}
