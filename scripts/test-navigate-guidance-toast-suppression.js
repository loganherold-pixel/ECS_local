const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const navigate = fs.readFileSync(path.join(root, 'app/(tabs)/navigate.tsx'), 'utf8');

assert(
  !navigate.includes("showToast('ACTIVE GUIDANCE ALREADY RUNNING')"),
  'Navigate should silently ignore duplicate active guidance handoffs without showing a toast.',
);

assert(
  !navigate.includes("showToast('ROUTE STAGED: READY TO START WHEN YOU ARE')"),
  'Navigate should not show the route staged ready toast.',
);

assert(
  !navigate.includes('const ROUTE_STAGED_TOAST_MIN_INTERVAL_MS') &&
    !navigate.includes('routeStagedToastRef') &&
    !navigate.includes('showRouteStagedToast'),
  'Route staged toast helper state should be removed instead of left as dead code.',
);

assert(
  navigate.includes('if (isNavigationHandoffForActiveGuidance(payload, activeRouteSnapshot)) {\n        return;\n      }'),
  'Duplicate active guidance handoffs should still short-circuit safely.',
);

console.log('[navigate-guidance-toast-suppression] guidance fluff toast checks passed');
