import { useCallback, useEffect } from 'react';
import { useGlobalSearchParams, usePathname, useRouter } from 'expo-router';

import { getSafeReturnRoute, normalizeECSRoutePath } from '../routeManifest';
import {
  acquireECSNavigation,
  cancelECSNavigation,
  settleECSNavigation,
  type ECSNavigationAttempt,
  type ECSNavigationMethod,
} from './ecsNavigationCoordinator';

type ECSRouterTarget = string | { pathname: string; params?: Record<string, unknown> };

function firstParam(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function targetPath(target: ECSRouterTarget): string {
  return normalizeECSRoutePath(typeof target === 'string' ? target : target.pathname);
}

export function useECSNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ returnTo?: string | string[] }>();

  useEffect(() => {
    settleECSNavigation(pathname);
  }, [pathname]);

  const run = useCallback((method: Exclude<ECSNavigationMethod, 'back'>, target: ECSRouterTarget): ECSNavigationAttempt => {
    const attempt = acquireECSNavigation({
      targetPath: targetPath(target),
      sourcePath: pathname,
      method,
    });
    if (!attempt.accepted) return attempt;
    try {
      if (method === 'push') router.push(target as never);
      else if (method === 'replace') router.replace(target as never);
      else router.navigate(target as never);
    } catch (error) {
      cancelECSNavigation(attempt.token);
      throw error;
    }
    return attempt;
  }, [pathname, router]);

  const push = useCallback((target: ECSRouterTarget) => run('push', target), [run]);
  const replace = useCallback((target: ECSRouterTarget) => run('replace', target), [run]);
  const navigate = useCallback((target: ECSRouterTarget) => run('navigate', target), [run]);

  const back = useCallback((fallback?: string | null): ECSNavigationAttempt => {
    const requestedReturn = fallback ?? firstParam(params.returnTo);
    const safeReturnRoute = getSafeReturnRoute(pathname, requestedReturn);
    const canGoBack = router.canGoBack();
    const attempt = acquireECSNavigation({
      targetPath: safeReturnRoute,
      sourcePath: pathname,
      method: 'back',
      settleOnAnyPath: canGoBack,
    });
    if (!attempt.accepted) return attempt;
    try {
      if (canGoBack) router.back();
      else router.replace(safeReturnRoute as never);
    } catch (error) {
      cancelECSNavigation(attempt.token);
      throw error;
    }
    return attempt;
  }, [params.returnTo, pathname, router]);

  const returnTo = useCallback((requestedReturn?: string | null): ECSNavigationAttempt => {
    const safeReturnRoute = getSafeReturnRoute(pathname, requestedReturn ?? firstParam(params.returnTo));
    return replace(safeReturnRoute);
  }, [params.returnTo, pathname, replace]);

  return { push, replace, navigate, back, returnTo };
}
