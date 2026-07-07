const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(relativePath) {
  const fullPath = path.join(root, relativePath);
  assert.ok(fs.existsSync(fullPath), `${relativePath} must exist`);
  return fs.readFileSync(fullPath, 'utf8').replace(/\r\n/g, '\n');
}

const scheduler = read('lib/shellInteractionScheduler.ts');
const mapRenderer = read('components/navigate/MapRenderer.tsx');
const roadNavigationOverlay = read('components/navigate/RoadNavigationOverlay.tsx');

assert.ok(
  scheduler.includes('DEFAULT_SHELL_INTERACTION_MAX_WAIT_MS'),
  'Shell scheduler must define a bounded max-wait budget for delayed interaction work.',
);
assert.ok(
  scheduler.includes('maxWaitMs?: number'),
  'Shell scheduler options must allow callers to tune the max-wait budget.',
);
assert.ok(
  scheduler.includes('let fallbackTimer: ReturnType<typeof setTimeout> | null = null') &&
    scheduler.includes('const runOnce = () => {') &&
    scheduler.includes('fallbackTimer = setTimeout(runAfterDelay, maxWaitMs);'),
  'Shell scheduler must race InteractionManager with a cancellable max-wait fallback.',
);
assert.ok(
  scheduler.includes('delayTimer = setTimeout(runOnce, delayMs);'),
  'Shell scheduler delay handling must still execute through the single-run guard.',
);
assert.ok(
  scheduler.includes('if (delayTimer) return;'),
  'Shell scheduler fallback must not schedule duplicate delayed callbacks after interactions settle.',
);
assert.ok(
  scheduler.includes('clearTimeout(fallbackTimer);') &&
    scheduler.includes('fallbackTimer = null;'),
  'Shell scheduler cancellation must clear the max-wait fallback.',
);

assert.ok(
  mapRenderer.includes('FRAME_COALESCED_MAP_MESSAGE_TYPES') &&
    mapRenderer.includes("'dynamicState'") &&
    mapRenderer.includes("'cameraCommand'"),
  'MapRenderer must coalesce hot dynamic and camera bridge messages by frame.',
);
assert.ok(
  mapRenderer.includes('function scheduleMapBridgeFrame(callback: () => void): () => void') &&
    mapRenderer.includes('requestAnimationFrame(callback)') &&
    mapRenderer.includes('cancelAnimationFrame(frame)'),
  'MapRenderer must schedule coalesced bridge flushes on animation frames.',
);
assert.ok(
  mapRenderer.includes('const pendingMapMessagesRef = useRef<Map<string, unknown>>(new Map());') &&
    mapRenderer.includes('const pendingMapMessageFrameCancelRef = useRef<(() => void) | null>(null);'),
  'MapRenderer must hold pending bridge messages outside React state.',
);
assert.ok(
  mapRenderer.includes('FRAME_COALESCED_MAP_MESSAGE_TYPES.has(messageType)') &&
    mapRenderer.includes('const existingMessage = pendingMapMessagesRef.current.get(messageType);') &&
    mapRenderer.includes('mergeMapOverlayPatchMessages(existingMessage, message)'),
  'MapRenderer must replace same-frame hot bridge messages by type and merge overlay patches without dropping families.',
);
assert.ok(
  mapRenderer.includes('buildMapBridgeBatchMessage(messages') &&
    mapRenderer.includes("type: 'bridgeBatch'") &&
    mapRenderer.includes("if (msg.type === 'bridgeBatch')") &&
    mapRenderer.includes('buildMapBridgeBatchMessage(messages)'),
  'MapRenderer must inject same-frame hot bridge messages as one ordered batch to reduce WebView bridge churn.',
);
assert.ok(
  mapRenderer.includes('pendingMapMessagesRef.current.clear();') &&
    mapRenderer.includes('pendingMapMessageFrameCancelRef.current?.();'),
  'MapRenderer must clear pending bridge messages when the map resets or unmounts.',
);

assert.ok(
  roadNavigationOverlay.includes('function buildActiveGuidanceProgressRenderKey') &&
    roadNavigationOverlay.includes('const activeGuidanceProgressRef = React.useRef(session.activeGuidanceProgress);') &&
    roadNavigationOverlay.includes('activeGuidanceProgressRef.current') &&
    roadNavigationOverlay.includes('activeGuidanceProgressRenderKey'),
  'RoadNavigationOverlay must memoize active guidance directions from a compact progress key instead of full progress-object identity.',
);

console.log('ECS responsive interaction budget checks passed.');
