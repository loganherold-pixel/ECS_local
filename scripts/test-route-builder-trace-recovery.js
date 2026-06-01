const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const mapRenderer = fs
  .readFileSync(path.join(root, 'components', 'navigate', 'MapRenderer.tsx'), 'utf8')
  .replace(/\r\n/g, '\n');

function assertIncludes(fragment, message) {
  assert.ok(mapRenderer.includes(fragment), message);
}

function assertNotIncludes(fragment, message) {
  assert.ok(!mapRenderer.includes(fragment), message);
}

assertIncludes(
  'function getLastGoodTracePoint()',
  'Build Route should expose a helper to read the last accepted trace point.',
);
assertIncludes(
  'function updateLastGoodTracePoint(tracePoint)',
  'Build Route should centralize last-good point updates for snapped and accepted free points.',
);
assertIncludes(
  'function getTraceDirectionDot(lastGood, tracePoint)',
  'Build Route recovery should compare direction so normal curves and switchbacks are not treated as slips.',
);
assertIncludes(
  'function hasExtremeTraceEvidence(tracePoint, jumpPx, directionDot)',
  'Build Route recovery should require strong evidence before rolling back a trace point.',
);
assertIncludes(
  'function isExtremeTraceError(tracePoint)',
  'Build Route should conservatively reject obvious slip/jump geometry before staging it.',
);
assertIncludes(
  'function shouldContinueFreeModeAfterGrace(tracePoint)',
  'Build Route should wait through an initial drag grace window before continuing free-mode behavior.',
);
assertIncludes(
  'function rollbackTraceToLastGoodPoint()',
  'Build Route cancel/error recovery should restore the staged trace to the last good point.',
);
assertIncludes(
  'function enterFreeDrawMode()',
  'Build Route should have an explicit session-local free draw mode.',
);
assertIncludes(
  'var ROUTE_BUILDER_EXTREME_JUMP_PX = 180;',
  'Extreme jump detection should use a configurable threshold.',
);
assertIncludes(
  'var ROUTE_BUILDER_EXTREME_MIN_POINTS = 5;',
  'Extreme recovery should not evaluate during the first few trace points.',
);
assertIncludes(
  'var ROUTE_BUILDER_EXTREME_DIRECTION_DOT = -0.2;',
  'Extreme recovery should require a strong direction break instead of distance alone.',
);
assertIncludes(
  'var ROUTE_BUILDER_FREE_MODE_MIN_POINTS = 6;',
  'Build Route should require several trace points before off-network continuation can evaluate.',
);
assertIncludes(
  'var ROUTE_BUILDER_FREE_MODE_GRACE_MS = 1200;',
  'Build Route should use a startup grace period so the first drag does not get interrupted.',
);
assertIncludes(
  'var ROUTE_BUILDER_FREE_MODE_MIN_DRAG_PX = 72;',
  'Build Route should require meaningful drag distance before continuing in free mode.',
);
assertNotIncludes(
  'window.confirm',
  'Build Route tracing must not use a blocking JavaScript confirm while the user is dragging.',
);
assertNotIncludes(
  'Build route mode is going off the beaten path',
  'Build Route should remove the immediate off-the-beaten-path popup copy from active tracing.',
);
assertIncludes(
  'routeBuilderFreeDrawMode = true;',
  'Continuing should switch the current Build Route session into free draw mode.',
);
assertIncludes(
  'routeBuilderGesturePointCount += 1;',
  'Build Route should count active trace points before free-mode continuation can evaluate.',
);
assertIncludes(
  'if (routeBuilderGesturePointCount < ROUTE_BUILDER_EXTREME_MIN_POINTS) return false;',
  'Extreme recovery should be disabled during the beginning of a drag gesture.',
);
assertIncludes(
  'if (builderPointCount() < ROUTE_BUILDER_EXTREME_MIN_POINTS) return false;',
  'Extreme recovery should wait until enough accepted route geometry exists.',
);
assertNotIncludes(
  'if (jumpPx > ROUTE_BUILDER_EXTREME_JUMP_PX) return true;',
  'Extreme recovery must not reject normal trail curves based on distance alone.',
);
assertIncludes(
  '(jumpPx > ROUTE_BUILDER_EXTREME_JUMP_PX && strongDirectionBreak)',
  'Extreme recovery should require both a large jump and direction evidence for normal snapped/free tracing.',
);
assertIncludes(
  '(jumpPx > ROUTE_BUILDER_FEATURE_SWITCH_JUMP_PX && strongDirectionBreak && (lowConfidenceSnap || unrelatedFeatureSwitch))',
  'Trail and road transitions should only rollback when the switch is both low-confidence and directionally unlikely.',
);
assertIncludes(
  'resetRouteBuilderTraceRecovery();',
  'Starting or clearing a route should reset free-mode/recovery state.',
);
assertIncludes(
  'syncRouteBuilderTraceAnchorFromDraft();',
  'Build Route undo should let the WebView restore tracing from the previous remaining endpoint.',
);
assertIncludes(
  "sourceLabel: routeBuilderLastSnapSource || null",
  'Build Route should keep a non-intrusive snap/free source label when restoring the retrace anchor.',
);
assertIncludes(
  'if (isExtremeTraceError(tracePoint)) {\n          rollbackTraceToLastGoodPoint();',
  'Extreme trace errors should rollback before the point is appended.',
);
assertIncludes(
  'if (shouldContinueFreeModeAfterGrace(tracePoint))',
  'Free-mode continuation should only happen after the initial grace checks pass.',
);
assertIncludes(
  'markLastGoodTracePoint(tracePoint);',
  'Accepted snapped/free points should update the last-good trace point.',
);

console.log('Route builder trace recovery checks passed.');
