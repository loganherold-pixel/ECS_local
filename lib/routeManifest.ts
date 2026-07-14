import type { ECSFeatureId } from './features/featureVisibilityRegistry';

export type ECSPrimaryTabId = 'fleet' | 'navigate' | 'dashboard' | 'explore' | 'dispatch';
export type ECSDockKey = 'fleet' | 'navigate' | 'dashboard' | 'discover' | 'alert';
export type ECSRouteAuthRequirement = 'public' | 'shell' | 'authenticated';
export type ECSRouteSetupRequirement = 'none' | 'complete' | 'configured_vehicle';
export type ECSRouteOfflineSupport = 'full' | 'degraded' | 'none';
export type ECSRouteRestorationPolicy = 'direct' | 'parent' | 'never';
export type ECSRouteDeepLinkPolicy = 'public' | 'shell' | 'authenticated' | 'disabled';
export type ECSRoutePresentation = 'root' | 'primary' | 'detail' | 'modal';
export type ECSRouteLoadStrategy = 'eager' | 'lazy';

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
  featureRequirement: ECSFeatureId;
}

export interface ECSRouteMetadata {
  route: string;
  title: string;
  accessibilityLabel: string;
  parentSurface: ECSPrimaryTabId | null;
  dockSelection: ECSPrimaryTabId | null;
  authRequirement: ECSRouteAuthRequirement;
  setupRequirement: ECSRouteSetupRequirement;
  featureRequirement: ECSFeatureId | null;
  offlineSupport: ECSRouteOfflineSupport;
  restoration: ECSRouteRestorationPolicy;
  safeReturnRoute: string;
  deepLinkPolicy: ECSRouteDeepLinkPolicy;
  presentation: ECSRoutePresentation;
  loadStrategy: ECSRouteLoadStrategy;
  sharedShellBackground: boolean;
  forceSharedShellBackgroundWithoutDock?: boolean;
  protectedScreenName?: string;
  note?: string;
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
  featureRequirement?: ECSFeatureId;
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
    note: 'Visible bottom-tab Dispatch landing. The legacy path name remains /alert for route compatibility.',
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
    activePathAliases: ['/fleet', '/vehicle-config', '/loadmap', '/loaditems', '/vehicle-display', '/vehicle-twin', '/weight-dashboard', '/vehicle-telemetry-settings', '/obd-setup'],
    featureRequirement: 'fleet_tab',
  },
  {
    id: 'navigate',
    label: 'Navigate',
    dockLabel: 'NAVIGATE',
    dockKey: 'navigate',
    route: '/navigate',
    activePathAliases: ['/navigate', '/route', '/navigate-run', '/navigate-offline', '/navigate-bailouts'],
    featureRequirement: 'navigate_tab',
  },
  {
    id: 'dashboard',
    label: 'Dashboard',
    dockLabel: '',
    dockKey: 'dashboard',
    route: '/dashboard',
    activePathAliases: ['/dashboard', '/expeditions', '/trips', '/intelligence', '/expedition-detail', '/expedition-wizard', '/expedition-command', '/expedition-checklist', '/expedition-log', '/expedition-route-mgr', '/expedition-livelog', '/expedition-archive', '/power', '/assistant'],
    featureRequirement: 'dashboard_tab',
  },
  {
    id: 'explore',
    label: 'Explore',
    dockLabel: 'EXPLORE',
    dockKey: 'discover',
    route: '/discover',
    activePathAliases: ['/discover', '/explore', '/explore-trip-builder', '/explore-offline-prep-pack', '/active-trip', '/offline-incident-packet'],
    featureRequirement: 'explore_tab',
  },
  {
    id: 'dispatch',
    label: 'Dispatch',
    dockLabel: 'DISPATCH',
    dockKey: 'alert',
    route: ECS_CANONICAL_DISPATCH_ROUTE,
    activePathAliases: ['/alert', '/safety', '/intel', '/more', '/convoy-command', '/expedition-dispatch'],
    featureRequirement: 'dispatch_tab',
  },
] as const satisfies readonly ECSPrimaryTabManifestEntry[];

const PRIMARY_SAFE_RETURNS: Record<ECSPrimaryTabId, string> = {
  fleet: '/dashboard',
  navigate: '/dashboard',
  dashboard: '/fleet',
  explore: '/dashboard',
  dispatch: '/dashboard',
};

function primaryRouteMetadata(tab: ECSPrimaryTabManifestEntry): ECSRouteMetadata {
  return {
    route: tab.route,
    title: tab.label,
    accessibilityLabel: `${tab.label} command surface`,
    parentSurface: tab.id,
    dockSelection: tab.id,
    authRequirement: 'shell',
    setupRequirement: tab.id === 'dashboard' ? 'configured_vehicle' : 'none',
    featureRequirement: tab.featureRequirement,
    offlineSupport: 'full',
    restoration: 'direct',
    safeReturnRoute: PRIMARY_SAFE_RETURNS[tab.id],
    deepLinkPolicy: 'shell',
    presentation: 'primary',
    loadStrategy: 'eager',
    sharedShellBackground: true,
  };
}

function nestedRoute(input: Partial<ECSRouteMetadata> & Pick<ECSRouteMetadata, 'route' | 'title' | 'parentSurface'>): ECSRouteMetadata {
  const parent = input.parentSurface;
  const parentRoute = parent ? ECS_PRIMARY_TAB_MANIFEST.find((tab) => tab.id === parent)?.route ?? '/dashboard' : '/dashboard';
  const authRequirement = input.authRequirement ?? 'shell';
  return {
    accessibilityLabel: input.title,
    dockSelection: parent,
    authRequirement,
    setupRequirement: 'none',
    featureRequirement: null,
    offlineSupport: 'full',
    restoration: parent ? 'parent' : 'never',
    safeReturnRoute: parentRoute,
    deepLinkPolicy: input.deepLinkPolicy ?? (authRequirement === 'authenticated' ? 'authenticated' : 'shell'),
    presentation: 'detail',
    loadStrategy: 'lazy',
    sharedShellBackground: false,
    ...input,
  };
}

function publicRoute(input: Partial<ECSRouteMetadata> & Pick<ECSRouteMetadata, 'route' | 'title'>): ECSRouteMetadata {
  return {
    accessibilityLabel: input.title,
    parentSurface: null,
    dockSelection: null,
    authRequirement: 'public',
    setupRequirement: 'none',
    featureRequirement: null,
    offlineSupport: 'full',
    restoration: 'never',
    safeReturnRoute: '/login',
    deepLinkPolicy: 'public',
    presentation: 'root',
    loadStrategy: 'eager',
    sharedShellBackground: false,
    ...input,
  };
}

const PUBLIC_ROUTES: ECSRouteMetadata[] = [
  publicRoute({ route: '/', title: 'ECS', deepLinkPolicy: 'disabled' }),
  publicRoute({ route: '/login', title: 'Sign In' }),
  publicRoute({ route: '/initialize', title: 'Initialize ECS' }),
  publicRoute({ route: '/create-access-key', title: 'Create Access Key' }),
  publicRoute({ route: '/auth-info', title: 'Account Information', presentation: 'modal', loadStrategy: 'lazy' }),
  publicRoute({ route: '/pro', title: 'ECS Access' }),
  publicRoute({ route: '/join-expedition', title: 'Join Expedition' }),
  publicRoute({ route: '/expedition-channel/join/[code]', title: 'Join Expedition Channel' }),
  publicRoute({ route: '/setup', title: 'Vehicle Setup', safeReturnRoute: '/login' }),
  publicRoute({ route: '/feature-unavailable', title: 'Feature Unavailable', deepLinkPolicy: 'disabled', presentation: 'modal', loadStrategy: 'lazy' }),
  publicRoute({ route: '/+not-found', title: 'Route Not Found', deepLinkPolicy: 'disabled', loadStrategy: 'lazy' }),
];

const SHELL_CHILD_ROUTES: ECSRouteMetadata[] = [
  nestedRoute({ route: '/explore', title: 'Explore', parentSurface: 'explore', sharedShellBackground: true }),
  nestedRoute({
    route: '/explore-trip-builder',
    title: 'Trip Builder',
    parentSurface: 'explore',
    featureRequirement: 'explore_trip_builder',
    safeReturnRoute: '/discover',
    presentation: 'modal',
    sharedShellBackground: true,
    forceSharedShellBackgroundWithoutDock: true,
  }),
  nestedRoute({
    route: '/explore-offline-prep-pack',
    title: 'Offline Prep Pack',
    parentSurface: 'explore',
    featureRequirement: 'explore_offline_prep',
    safeReturnRoute: '/explore-trip-builder',
    presentation: 'modal',
    sharedShellBackground: true,
    forceSharedShellBackgroundWithoutDock: true,
  }),
  nestedRoute({ route: '/active-trip', title: 'Active Trip', parentSurface: 'explore', sharedShellBackground: true, forceSharedShellBackgroundWithoutDock: true }),
  nestedRoute({ route: '/offline-incident-packet', title: 'Offline Incident Packet', parentSurface: 'explore', sharedShellBackground: true, forceSharedShellBackgroundWithoutDock: true }),
  nestedRoute({ route: '/vehicle-config', title: 'Vehicle Configuration', parentSurface: 'fleet', sharedShellBackground: true }),
  nestedRoute({ route: '/loadmap', title: 'Load Map', parentSurface: 'fleet', setupRequirement: 'configured_vehicle', sharedShellBackground: true }),
  nestedRoute({ route: '/loaditems', title: 'Loadout Items', parentSurface: 'fleet', setupRequirement: 'configured_vehicle', sharedShellBackground: true }),
  nestedRoute({
    route: '/vehicle-display',
    title: 'Vehicle Display',
    parentSurface: 'fleet',
    setupRequirement: 'configured_vehicle',
    featureRequirement: 'automotive_vehicle_display',
    offlineSupport: 'full',
  }),
  nestedRoute({ route: '/vehicle-twin', title: 'Vehicle Twin', parentSurface: 'fleet', setupRequirement: 'configured_vehicle' }),
  nestedRoute({ route: '/weight-dashboard', title: 'Weight Dashboard', parentSurface: 'fleet', setupRequirement: 'configured_vehicle', presentation: 'modal' }),
  nestedRoute({ route: '/vehicle-telemetry-settings', title: 'Vehicle Telemetry Settings', parentSurface: 'fleet', setupRequirement: 'configured_vehicle', offlineSupport: 'degraded', presentation: 'modal' }),
  nestedRoute({ route: '/obd-setup', title: 'OBD2 Setup', parentSurface: 'fleet', setupRequirement: 'configured_vehicle', offlineSupport: 'degraded', presentation: 'modal' }),
  nestedRoute({ route: '/route', title: 'Route', parentSurface: 'navigate', sharedShellBackground: true }),
  nestedRoute({ route: '/navigate-run', title: 'Run Detail', parentSurface: 'navigate', presentation: 'modal' }),
  nestedRoute({ route: '/navigate-offline', title: 'Offline Navigation', parentSurface: 'navigate', presentation: 'modal' }),
  nestedRoute({ route: '/navigate-bailouts', title: 'Bailout Planning', parentSurface: 'navigate', presentation: 'modal' }),
  nestedRoute({ route: '/safety', title: 'Safety', parentSurface: 'dispatch', sharedShellBackground: true }),
  nestedRoute({ route: '/intel', title: 'Intel', parentSurface: 'dispatch', sharedShellBackground: true }),
  nestedRoute({ route: '/more', title: 'More', parentSurface: 'dispatch', sharedShellBackground: true }),
  nestedRoute({
    route: '/convoy-command',
    title: 'Convoy Command',
    parentSurface: 'dispatch',
    authRequirement: 'authenticated',
    featureRequirement: 'convoy_command',
    offlineSupport: 'degraded',
    presentation: 'modal',
    sharedShellBackground: true,
    forceSharedShellBackgroundWithoutDock: true,
  }),
  nestedRoute({ route: '/trips', title: 'Trips', parentSurface: 'dashboard', sharedShellBackground: true }),
  nestedRoute({ route: '/expeditions', title: 'Expeditions', parentSurface: 'dashboard', sharedShellBackground: true }),
  nestedRoute({ route: '/intelligence', title: 'Intelligence', parentSurface: 'dashboard', sharedShellBackground: true }),
];

const EXPEDITION_ROUTES: ECSRouteMetadata[] = [
  nestedRoute({ route: '/expedition-detail', title: 'Expedition Detail', parentSurface: 'dashboard', authRequirement: 'authenticated', setupRequirement: 'configured_vehicle', presentation: 'modal', protectedScreenName: 'expedition-detail' }),
  nestedRoute({ route: '/expedition-wizard', title: 'Create Expedition', parentSurface: 'dashboard', authRequirement: 'authenticated', setupRequirement: 'configured_vehicle', presentation: 'modal', protectedScreenName: 'expedition-wizard' }),
  nestedRoute({ route: '/expedition-command', title: 'Expedition Command', parentSurface: 'dashboard', authRequirement: 'authenticated', setupRequirement: 'configured_vehicle', protectedScreenName: 'expedition-command' }),
  nestedRoute({ route: '/expedition-checklist', title: 'Expedition Checklist', parentSurface: 'dashboard', authRequirement: 'authenticated', setupRequirement: 'configured_vehicle', presentation: 'modal', protectedScreenName: 'expedition-checklist' }),
  nestedRoute({ route: '/expedition-log', title: 'Expedition Log', parentSurface: 'dashboard', authRequirement: 'authenticated', setupRequirement: 'configured_vehicle', presentation: 'modal', protectedScreenName: 'expedition-log' }),
  nestedRoute({ route: '/expedition-route-mgr', title: 'Expedition Route Manager', parentSurface: 'dashboard', authRequirement: 'authenticated', setupRequirement: 'configured_vehicle', presentation: 'modal', protectedScreenName: 'expedition-route-mgr' }),
  nestedRoute({ route: '/expedition-livelog', title: 'Live Expedition Log', parentSurface: 'dashboard', authRequirement: 'authenticated', setupRequirement: 'configured_vehicle', presentation: 'modal', protectedScreenName: 'expedition-livelog' }),
  nestedRoute({ route: '/expedition-archive', title: 'Expedition Archive', parentSurface: 'dashboard', authRequirement: 'shell', setupRequirement: 'complete', presentation: 'modal' }),
  nestedRoute({ route: '/expedition-badges', title: 'Expedition Badge Catalog', parentSurface: 'dashboard', authRequirement: 'shell', setupRequirement: 'complete', offlineSupport: 'full', presentation: 'modal' }),
  nestedRoute({
    route: '/expedition-dispatch',
    title: 'Expedition Dispatch',
    parentSurface: 'dispatch',
    authRequirement: 'authenticated',
    setupRequirement: 'complete',
    offlineSupport: 'degraded',
    presentation: 'modal',
    protectedScreenName: 'expedition-dispatch',
  }),
];

const HARDWARE_AND_SUPPORT_ROUTES: ECSRouteMetadata[] = [
  nestedRoute({ route: '/power', title: 'Power', parentSurface: 'dashboard', setupRequirement: 'configured_vehicle', offlineSupport: 'degraded', presentation: 'modal' }),
  nestedRoute({ route: '/power/blu', title: 'Device Connections', parentSurface: 'dashboard', setupRequirement: 'configured_vehicle', featureRequirement: 'bluetooth_obd_connections', offlineSupport: 'degraded', presentation: 'modal' }),
  nestedRoute({ route: '/power/devices', title: 'Power Devices', parentSurface: 'dashboard', setupRequirement: 'configured_vehicle', featureRequirement: 'bluetooth_obd_connections', offlineSupport: 'degraded', presentation: 'modal' }),
  nestedRoute({ route: '/power/manage', title: 'Manage Power', parentSurface: 'dashboard', setupRequirement: 'configured_vehicle', featureRequirement: 'bluetooth_obd_connections', offlineSupport: 'degraded', presentation: 'modal' }),
  nestedRoute({ route: '/power/setup', title: 'Power Setup', parentSurface: 'dashboard', setupRequirement: 'configured_vehicle', featureRequirement: 'bluetooth_obd_connections', offlineSupport: 'degraded', presentation: 'modal' }),
  nestedRoute({ route: '/assistant', title: 'ECS Assistant', parentSurface: 'dashboard', authRequirement: 'authenticated', featureRequirement: 'ai_assist', offlineSupport: 'none', presentation: 'modal' }),
];

const DEVELOPMENT_ROUTES = [
  '/dev/attitude-command-widget-preview',
  '/dev/attitude-vehicle-stage-preview',
  '/dev/campops-visual-qa',
  '/dev/convoy-identity-qa',
  '/dev/convoy-participant-qa',
  '/dev/hardware-telemetry-qa',
  '/dev/provider-outage-qa',
  '/dev/route-overlay-qa',
  '/dev/trip-confidence-qa',
].map((route) => publicRoute({
  route,
  title: 'ECS Development QA',
  accessibilityLabel: 'ECS development quality assurance surface',
  featureRequirement: 'developer_qa_surfaces',
  deepLinkPolicy: 'public',
  presentation: 'detail',
  loadStrategy: 'lazy',
}));

export const ECS_ROUTE_REGISTRY: readonly ECSRouteMetadata[] = [
  ...PUBLIC_ROUTES,
  ...ECS_PRIMARY_TAB_MANIFEST.map(primaryRouteMetadata),
  ...SHELL_CHILD_ROUTES,
  ...EXPEDITION_ROUTES,
  ...HARDWARE_AND_SUPPORT_ROUTES,
  ...DEVELOPMENT_ROUTES,
];

const TAB_BY_ID = new Map<ECSPrimaryTabId, ECSPrimaryTabManifestEntry>(
  ECS_PRIMARY_TAB_MANIFEST.map((tab) => [tab.id, tab]),
);

export const ECS_PROTECTED_ROUTE_SCREENS = ECS_ROUTE_REGISTRY
  .map((route) => route.protectedScreenName)
  .filter((screen): screen is string => Boolean(screen));

export const ECS_RESTORABLE_SHELL_ROUTES = ECS_PRIMARY_TAB_MANIFEST.map((tab) => tab.route);

function ownershipKind(metadata: ECSRouteMetadata): ECSRouteOwnershipKind {
  if (metadata.presentation === 'primary') return 'primary_tab';
  if (metadata.route === '/expedition-dispatch') return 'protected_dispatch_route';
  if (metadata.parentSurface) return 'nested_tab_route';
  return 'legacy_shell_route';
}

function restorableRouteForMetadata(metadata: ECSRouteMetadata): string | null {
  if (metadata.restoration === 'never') return null;
  if (metadata.restoration === 'direct') return metadata.route;
  return metadata.parentSurface ? getPrimaryTabById(metadata.parentSurface).route : null;
}

export const ECS_ROUTE_OWNERSHIP_MANIFEST: readonly ECSRouteOwnershipEntry[] = ECS_ROUTE_REGISTRY.map((metadata) => ({
  path: metadata.route,
  ownerTabId: metadata.parentSurface,
  kind: ownershipKind(metadata),
  restorableShellRoute: restorableRouteForMetadata(metadata),
  sharedShellBackground: metadata.sharedShellBackground,
  forceSharedShellBackgroundWithoutDock: metadata.forceSharedShellBackgroundWithoutDock,
  protectedScreenName: metadata.protectedScreenName,
  note: metadata.note,
  featureRequirement: metadata.featureRequirement ?? undefined,
}));

function stripRouteGroups(path: string): string {
  return path.replace(/\/\([^/]+\)/g, '');
}

export function normalizeECSRoutePath(path: string | null | undefined): string {
  if (!path || path === '/') return '/';
  const withoutQueryAndHash = stripRouteGroups(path).split(/[?#]/, 1)[0];
  const withLeadingSlash = withoutQueryAndHash.startsWith('/') ? withoutQueryAndHash : `/${withoutQueryAndHash}`;
  const withoutTrailingSlash = withLeadingSlash.length > 1 ? withLeadingSlash.replace(/\/+$/, '') : withLeadingSlash;
  return withoutTrailingSlash.replace(/\/index$/, '') || '/';
}

function routePatternMatches(path: string, pattern: string): boolean {
  const pathSegments = normalizeECSRoutePath(path).split('/').filter(Boolean);
  const patternSegments = normalizeECSRoutePath(pattern).split('/').filter(Boolean);
  if (pathSegments.length !== patternSegments.length) return false;
  return patternSegments.every((segment, index) => (
    /^\[[^\]]+\]$/.test(segment) || segment === pathSegments[index]
  ));
}

export function getRouteMetadata(path: string | null | undefined): ECSRouteMetadata | null {
  const normalized = normalizeECSRoutePath(path);
  return ECS_ROUTE_REGISTRY.find((entry) => routePatternMatches(normalized, entry.route)) ?? null;
}

export function getRouteOwnership(path: string | null | undefined): ECSRouteOwnershipEntry | null {
  const metadata = getRouteMetadata(path);
  if (!metadata) return null;
  return ECS_ROUTE_OWNERSHIP_MANIFEST.find((entry) => entry.path === metadata.route) ?? null;
}

export function getRouteFeatureRequirement(path: string | null | undefined): ECSFeatureId | null {
  return getRouteMetadata(path)?.featureRequirement ?? getPrimaryTabForPath(path)?.featureRequirement ?? null;
}

export function getDispatchRouteRelationship(path: string | null | undefined): ECSDispatchRouteRelationship | null {
  const normalized = normalizeECSRoutePath(path);
  return ECS_DISPATCH_ROUTE_RELATIONSHIPS.find((entry) => normalized === entry.path) ?? null;
}

export function getPrimaryTabById(id: ECSPrimaryTabId): ECSPrimaryTabManifestEntry {
  const tab = TAB_BY_ID.get(id);
  if (!tab) throw new Error(`Unknown ECS primary tab id: ${id}`);
  return tab;
}

export function getPrimaryTabForPath(path: string | null | undefined): ECSPrimaryTabManifestEntry | null {
  const metadata = getRouteMetadata(path);
  if (metadata?.dockSelection) return getPrimaryTabById(metadata.dockSelection);
  const normalized = normalizeECSRoutePath(path);
  return ECS_PRIMARY_TAB_MANIFEST.find((entry) => (
    entry.activePathAliases.some((alias) => normalized === alias || normalized.startsWith(`${alias}/`))
  )) ?? null;
}

export function isPrimaryTabActiveForPath(tabId: ECSPrimaryTabId, path: string | null | undefined): boolean {
  return getPrimaryTabForPath(path)?.id === tabId;
}

export function getRestorableShellRouteForPath(path: string | null | undefined): string | null {
  const metadata = getRouteMetadata(path);
  return metadata ? restorableRouteForMetadata(metadata) : null;
}

export function getSafeReturnRoute(path: string | null | undefined, requestedReturn?: string | null): string {
  const current = getRouteMetadata(path);
  const fallback = current?.safeReturnRoute ?? '/dashboard';
  return normalizeECSReturnRoute(requestedReturn, fallback);
}

export function normalizeECSReturnRoute(value: unknown, fallback = '/dashboard'): string {
  const raw = String(value ?? '').trim().slice(0, 500);
  const normalizedFallback = getRouteMetadata(fallback) ? fallback : '/dashboard';
  if (!raw) return normalizedFallback;
  const path = normalizeECSRoutePath(raw);
  const metadata = getRouteMetadata(path);
  if (!metadata || metadata.deepLinkPolicy === 'disabled' || path === '/') return normalizedFallback;
  return raw.startsWith('/') ? raw : `/${raw}`;
}

export function isECSRegisteredRoute(path: string | null | undefined): boolean {
  return Boolean(getRouteMetadata(path));
}

export function isECSDeepLinkPathAllowed(path: string | null | undefined): boolean {
  const metadata = getRouteMetadata(path);
  return Boolean(metadata && metadata.deepLinkPolicy !== 'disabled');
}

export function toExpoRouterShellTarget(path: string): string {
  const restorable = getRestorableShellRouteForPath(path);
  return restorable ?? normalizeECSRoutePath(path);
}

export function isProtectedRoutePath(path: string | null | undefined): boolean {
  return getRouteMetadata(path)?.authRequirement === 'authenticated';
}

export function isSharedShellBackgroundRoute(path: string | null | undefined): boolean {
  return Boolean(getRouteMetadata(path)?.sharedShellBackground);
}

export function shouldForceSharedShellBackgroundWithoutDock(path: string | null | undefined): boolean {
  return Boolean(getRouteMetadata(path)?.forceSharedShellBackgroundWithoutDock);
}

export function validateECSRouteRegistry(registry: readonly ECSRouteMetadata[] = ECS_ROUTE_REGISTRY): string[] {
  const errors: string[] = [];
  const routes = new Set<string>();
  registry.forEach((entry) => {
    const route = normalizeECSRoutePath(entry.route);
    if (routes.has(route)) errors.push(`duplicate_route:${route}`);
    routes.add(route);
    if (!entry.title.trim()) errors.push(`missing_title:${route}`);
    if (!entry.accessibilityLabel.trim()) errors.push(`missing_accessibility_label:${route}`);
    if (entry.parentSurface && !TAB_BY_ID.has(entry.parentSurface)) errors.push(`unknown_parent:${route}`);
    if (entry.dockSelection && !TAB_BY_ID.has(entry.dockSelection)) errors.push(`unknown_dock:${route}`);
    if (!getRouteMetadata(entry.safeReturnRoute)) errors.push(`invalid_safe_return:${route}`);
  });
  return Array.from(new Set(errors));
}
