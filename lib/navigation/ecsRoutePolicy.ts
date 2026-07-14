import {
  ECS_PRIMARY_TAB_MANIFEST,
  getPrimaryTabById,
  getRouteMetadata,
  normalizeECSRoutePath,
  type ECSRouteMetadata,
} from '../routeManifest';
import {
  resolveECSFeatureRouteAccess,
  resolveECSFeatureVisibility,
  type ECSFeatureRouteAccess,
  type ECSFeatureVisibilityContext,
} from '../features/featureVisibilityRegistry';

export type ECSRouteEntryIntent = 'navigate' | 'deep_link' | 'restore';

export type ECSRoutePolicyReason =
  | 'allowed'
  | 'unknown_route'
  | 'deep_link_blocked'
  | 'authentication_required'
  | 'shell_access_required'
  | 'setup_required'
  | 'vehicle_required'
  | 'offline_unavailable'
  | 'restoration_ineligible'
  | 'feature_unavailable';

export interface ECSRoutePolicyContext {
  authenticated: boolean;
  shellAccessReady: boolean;
  setupComplete: boolean;
  hasConfiguredVehicle: boolean;
  offline: boolean;
  featureContext: ECSFeatureVisibilityContext;
}

export interface ECSRoutePolicyDecision {
  requestedPath: string;
  targetPath: string;
  metadata: ECSRouteMetadata | null;
  allowed: boolean;
  readOnly: boolean;
  reason: ECSRoutePolicyReason;
  safeReturnRoute: string;
  preserveIntent: boolean;
  featureAccess: ECSFeatureRouteAccess | null;
}

export interface ECSRestorationDecision {
  requestedPath: string | null;
  targetPath: string;
  restored: boolean;
  fallbackUsed: boolean;
  reason: ECSRoutePolicyReason;
}

function fallbackForContext(context: ECSRoutePolicyContext): string {
  if (!context.shellAccessReady) return '/login';
  if (!context.setupComplete) return context.hasConfiguredVehicle ? '/setup' : '/fleet';
  if (!context.hasConfiguredVehicle) return '/fleet';
  return '/dashboard';
}

function denied(
  path: string,
  metadata: ECSRouteMetadata | null,
  context: ECSRoutePolicyContext,
  reason: ECSRoutePolicyReason,
  options: {
    safeReturnRoute?: string;
    preserveIntent?: boolean;
    featureAccess?: ECSFeatureRouteAccess | null;
  } = {},
): ECSRoutePolicyDecision {
  return {
    requestedPath: path,
    targetPath: options.safeReturnRoute ?? metadata?.safeReturnRoute ?? fallbackForContext(context),
    metadata,
    allowed: false,
    readOnly: false,
    reason,
    safeReturnRoute: options.safeReturnRoute ?? metadata?.safeReturnRoute ?? fallbackForContext(context),
    preserveIntent: options.preserveIntent === true,
    featureAccess: options.featureAccess ?? null,
  };
}

export function resolveECSRoutePolicy(input: {
  path: string | null | undefined;
  intent: ECSRouteEntryIntent;
  context: ECSRoutePolicyContext;
}): ECSRoutePolicyDecision {
  const rawTarget = String(input.path ?? '').trim().slice(0, 1_000);
  const requestedPath = normalizeECSRoutePath(input.path);
  const metadata = getRouteMetadata(requestedPath);
  if (!metadata) return denied(requestedPath, null, input.context, 'unknown_route');

  if (input.intent === 'deep_link' && metadata.deepLinkPolicy === 'disabled') {
    return denied(requestedPath, metadata, input.context, 'deep_link_blocked');
  }
  if (input.intent === 'deep_link' && metadata.deepLinkPolicy === 'authenticated' && !input.context.authenticated) {
    return denied(requestedPath, metadata, input.context, 'authentication_required', {
      safeReturnRoute: '/login',
      preserveIntent: true,
    });
  }
  if (input.intent === 'deep_link' && metadata.deepLinkPolicy === 'shell' && !input.context.shellAccessReady) {
    return denied(requestedPath, metadata, input.context, 'shell_access_required', {
      safeReturnRoute: '/login',
      preserveIntent: true,
    });
  }

  if (metadata.authRequirement === 'authenticated' && !input.context.authenticated) {
    return denied(requestedPath, metadata, input.context, 'authentication_required', {
      safeReturnRoute: '/login',
      preserveIntent: input.intent === 'deep_link',
    });
  }
  if (metadata.authRequirement === 'shell' && !input.context.shellAccessReady) {
    return denied(requestedPath, metadata, input.context, 'shell_access_required', {
      safeReturnRoute: '/login',
      preserveIntent: input.intent === 'deep_link',
    });
  }
  if (metadata.setupRequirement === 'complete' && !input.context.setupComplete) {
    return denied(requestedPath, metadata, input.context, 'setup_required', {
      safeReturnRoute: '/setup',
      preserveIntent: input.intent === 'deep_link',
    });
  }
  if (metadata.setupRequirement === 'configured_vehicle' && !input.context.hasConfiguredVehicle) {
    return denied(requestedPath, metadata, input.context, 'vehicle_required', {
      safeReturnRoute: '/fleet',
      preserveIntent: input.intent === 'deep_link',
    });
  }
  if (input.context.offline && metadata.offlineSupport === 'none') {
    return denied(requestedPath, metadata, input.context, 'offline_unavailable');
  }
  if (input.intent === 'restore' && metadata.restoration === 'never') {
    return denied(requestedPath, metadata, input.context, 'restoration_ineligible');
  }

  let featureAccess: ECSFeatureRouteAccess | null = null;
  if (metadata.featureRequirement) {
    featureAccess = resolveECSFeatureRouteAccess(
      requestedPath,
      input.context.featureContext,
      metadata.featureRequirement,
    );
    if (!featureAccess.matched) {
      const decision = resolveECSFeatureVisibility(metadata.featureRequirement, input.context.featureContext);
      featureAccess = {
        matched: true,
        featureId: metadata.featureRequirement,
        allowed: decision.availability !== 'unavailable',
        readOnly: decision.availability === 'degraded',
        safeReturnRoute: metadata.safeReturnRoute,
        decision,
      };
    }
  }
  if (featureAccess && !featureAccess.allowed) {
    return denied(requestedPath, metadata, input.context, 'feature_unavailable', {
      safeReturnRoute: featureAccess.safeReturnRoute ?? metadata.safeReturnRoute,
      featureAccess,
    });
  }

  const targetPath = input.intent === 'restore' && metadata.restoration === 'parent' && metadata.parentSurface
    ? getPrimaryTabById(metadata.parentSurface).route
    : rawTarget.startsWith('/') ? rawTarget : requestedPath;
  return {
    requestedPath,
    targetPath,
    metadata,
    allowed: true,
    readOnly: featureAccess?.readOnly === true || (input.context.offline && metadata.offlineSupport === 'degraded'),
    reason: 'allowed',
    safeReturnRoute: metadata.safeReturnRoute,
    preserveIntent: false,
    featureAccess,
  };
}

export function resolveECSRestorationTarget(input: {
  storedPath: string | null | undefined;
  context: ECSRoutePolicyContext;
}): ECSRestorationDecision {
  const requestedPath = input.storedPath ? normalizeECSRoutePath(input.storedPath) : null;
  const candidates = [
    requestedPath,
    '/dashboard',
    '/fleet',
    '/navigate',
    '/discover',
    '/alert',
  ].filter((path, index, values): path is string => Boolean(path) && values.indexOf(path) === index);

  for (const candidate of candidates) {
    const decision = resolveECSRoutePolicy({ path: candidate, intent: 'restore', context: input.context });
    if (decision.allowed) {
      return {
        requestedPath,
        targetPath: decision.targetPath,
        restored: requestedPath === candidate && decision.targetPath === requestedPath,
        fallbackUsed: requestedPath !== candidate || decision.targetPath !== requestedPath,
        reason: requestedPath === candidate ? decision.reason : resolveECSRoutePolicy({
          path: requestedPath,
          intent: 'restore',
          context: input.context,
        }).reason,
      };
    }
  }

  return {
    requestedPath,
    targetPath: fallbackForContext(input.context),
    restored: false,
    fallbackUsed: true,
    reason: requestedPath
      ? resolveECSRoutePolicy({ path: requestedPath, intent: 'restore', context: input.context }).reason
      : 'restoration_ineligible',
  };
}

export function selectVisibleECSPrimaryTabs(context: ECSFeatureVisibilityContext) {
  return ECS_PRIMARY_TAB_MANIFEST.filter((tab) => (
    resolveECSFeatureVisibility(tab.featureRequirement, context).visible
  ));
}
