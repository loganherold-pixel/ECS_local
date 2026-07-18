const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function loadTsModule(relativePath) {
  const filename = path.join(root, relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  const mod = { exports: {} };
  const fn = new Function('exports', 'require', 'module', '__filename', '__dirname', output);
  fn(mod.exports, require, mod, filename, path.dirname(filename));
  return mod.exports;
}

function createControlledClock() {
  let nowMs = 0;
  let nextTimerId = 1;
  const timers = new Map();

  return {
    now: () => nowMs,
    scheduleTimeout(callback, delayMs) {
      const id = nextTimerId;
      nextTimerId += 1;
      timers.set(id, { callback, dueAtMs: nowMs + delayMs });
      return id;
    },
    cancelTimeout(id) {
      timers.delete(id);
    },
    advanceBy(deltaMs) {
      const targetMs = nowMs + deltaMs;
      while (true) {
        const next = [...timers.entries()]
          .filter(([, timer]) => timer.dueAtMs <= targetMs)
          .sort((left, right) => left[1].dueAtMs - right[1].dueAtMs)[0];
        if (!next) break;
        const [id, timer] = next;
        timers.delete(id);
        nowMs = timer.dueAtMs;
        timer.callback();
      }
      nowMs = targetMs;
    },
    timerCount: () => timers.size,
  };
}

const {
  TRAIL_NAVIGATION_PROGRESS_PERSIST_INTERVAL_MS,
  createTrailNavigationPersistenceScheduler,
  isTrailNavigationImmediatePersistenceBoundary,
} = loadTsModule(path.join('lib', 'trailNavigationProgressPersistence.ts'));

assert.strictEqual(
  TRAIL_NAVIGATION_PROGRESS_PERSIST_INTERVAL_MS,
  30000,
  'Trail checkpoints should use the established 30-second navigation durability cadence.',
);

const activeBoundary = {
  sessionId: 'trail-session',
  status: 'navigation_active_trail',
  reachedWaypointIds: [],
  nextWaypoint: { id: 'water' },
  nextDecisionPoint: { id: 'fork' },
  error: null,
};

assert.strictEqual(
  isTrailNavigationImmediatePersistenceBoundary(activeBoundary, { ...activeBoundary }),
  false,
  'Routine distance/index progress should remain eligible for coalescing.',
);
assert.strictEqual(
  isTrailNavigationImmediatePersistenceBoundary(activeBoundary, {
    ...activeBoundary,
    status: 'off_trail',
  }),
  true,
  'Off-trail and other lifecycle status changes must persist immediately.',
);
assert.strictEqual(
  isTrailNavigationImmediatePersistenceBoundary(activeBoundary, {
    ...activeBoundary,
    reachedWaypointIds: ['water'],
    nextWaypoint: { id: 'camp' },
  }),
  true,
  'Reached/next waypoint changes must persist immediately.',
);
assert.strictEqual(
  isTrailNavigationImmediatePersistenceBoundary(activeBoundary, {
    ...activeBoundary,
    status: 'arrived_trail_destination',
  }),
  true,
  'Arrival must persist immediately.',
);
assert.strictEqual(
  isTrailNavigationImmediatePersistenceBoundary(activeBoundary, {
    ...activeBoundary,
    status: 'error',
    error: 'Trail route unavailable',
  }),
  true,
  'Errors must persist immediately.',
);

async function run() {
  const clock = createControlledClock();
  const writes = [];
  const scheduler = createTrailNavigationPersistenceScheduler({
    persist: async (value) => {
      writes.push(value);
    },
    now: clock.now,
    scheduleTimeout: clock.scheduleTimeout,
    cancelTimeout: clock.cancelTimeout,
  });

  await scheduler.persistImmediate({ sequence: 0, routePayload: 'immutable-route' });

  for (let sequence = 1; sequence <= 100; sequence += 1) {
    clock.advanceBy(100);
    scheduler.scheduleCheckpoint({ sequence, routePayload: 'immutable-route' });
  }

  await scheduler.waitForIdle();
  assert.deepStrictEqual(
    writes.map((write) => write.sequence),
    [0],
    'One hundred GPS updates inside the checkpoint window must not serialize the route 100 times.',
  );
  assert.strictEqual(clock.timerCount(), 1, 'Routine progress should own one coalescing timer.');

  clock.advanceBy(TRAIL_NAVIGATION_PROGRESS_PERSIST_INTERVAL_MS - 10000);
  await scheduler.waitForIdle();
  assert.deepStrictEqual(
    writes.map((write) => write.sequence),
    [0, 100],
    'The cadence boundary must persist only the latest recoverable checkpoint.',
  );

  clock.advanceBy(1000);
  scheduler.scheduleCheckpoint({ sequence: 101, routePayload: 'immutable-route' });
  assert.strictEqual(clock.timerCount(), 1, 'A new routine checkpoint should schedule one timer.');

  await scheduler.persistImmediate({ sequence: 102, status: 'off_trail' });
  assert.strictEqual(clock.timerCount(), 0, 'An immediate boundary should cancel the stale timer.');
  assert.deepStrictEqual(
    writes.map((write) => write.sequence),
    [0, 100, 102],
    'Immediate lifecycle persistence must supersede pending routine progress.',
  );

  clock.advanceBy(1000);
  scheduler.scheduleCheckpoint({ sequence: 103, routePayload: 'immutable-route' });
  await scheduler.dispose();
  assert.strictEqual(clock.timerCount(), 0, 'Unmount/disposal must clean the checkpoint timer.');
  assert.deepStrictEqual(
    writes.map((write) => write.sequence),
    [0, 100, 102, 103],
    'Unmount/disposal must retain the latest pending recoverable checkpoint.',
  );

  await scheduler.dispose();
  assert.strictEqual(writes.length, 4, 'Disposal must be idempotent.');

  console.log('[trail-navigation-progress-persistence] passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
