export type RouteReplacementClaim = {
  key: string;
  currentRoute: string;
  targetRoute: string;
};

export function createRouteReplacementGuard() {
  let pending: RouteReplacementClaim | null = null;

  return {
    claim(currentRoute: string, targetRoute: string): RouteReplacementClaim | null {
      if (!targetRoute || currentRoute === targetRoute) return null;
      const key = `${currentRoute}->${targetRoute}`;
      if (pending?.key === key) return null;
      pending = { key, currentRoute, targetRoute };
      return pending;
    },
    settle(currentRoute: string): void {
      if (pending?.targetRoute === currentRoute) pending = null;
    },
    release(claim: RouteReplacementClaim): void {
      if (pending?.key === claim.key) pending = null;
    },
    snapshot(): RouteReplacementClaim | null {
      return pending ? { ...pending } : null;
    },
  };
}
