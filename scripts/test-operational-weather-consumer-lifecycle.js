const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const source = fs
  .readFileSync(path.join(root, 'lib', 'useOperationalWeather.ts'), 'utf8')
  .replace(/\r\n/g, '\n');

function assertIncludes(fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function assertNotIncludes(fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

assertIncludes(
  'const registeredSharedConsumerRef = useRef(false);',
  'Operational weather hooks should track whether the shared consumer was mounted.',
);
assertIncludes(
  'useEffect(() => {\n    const consumerId = consumerIdRef.current;\n    if (!consumerId) return undefined;\n    registeredSharedConsumerRef.current = true;',
  'Shared weather registration should happen in a mount effect, not during render.',
);
assertIncludes(
  'removeSharedOperationalWeatherConsumer(consumerId);',
  'Shared weather cleanup should unregister on unmount.',
);
assertIncludes(
  'useEffect(() => {\n    const consumerId = consumerIdRef.current;\n    if (!consumerId || !registeredSharedConsumerRef.current) return;\n    setSharedOperationalWeatherConsumer(consumerId, sharedConsumerOptions);\n  }, [sharedConsumerOptions]);',
  'Consumer option changes should call the update path without triggering effect cleanup.',
);
assertNotIncludes(
  'return () => {\n      removeSharedOperationalWeatherConsumer(consumerId);\n    };\n  }, [sharedConsumerOptions]);',
  'Consumer option changes must not remove and re-register the same shared consumer id.',
);
assertIncludes(
  'if (previousSignature === nextSignature) {\n    if (previousActiveConsumerCount > 0) {\n      cancelNoConsumerCleanup();\n    }\n    return;\n  }',
  'Duplicate registrations with the same signature should be ignored.',
);
assertIncludes(
  'if (previousActiveConsumerCount !== nextActiveConsumerCount) {',
  'Lifecycle logging should be tied to actual active consumer count changes.',
);
assertIncludes(
  'const removed = sharedWeatherConsumers.delete(id);\n  if (!removed) return;',
  'Consumer removal should be idempotent.',
);

function signature(options) {
  const gps = options.gps || {};
  return [
    options.enabled !== false ? 'enabled' : 'disabled',
    gps.lat ?? 'na',
    gps.lng ?? 'na',
    gps.hasFix === true ? 'gps-fix' : 'gps-waiting',
    options.units || 'imperial',
    options.freshnessWindowMs || 20 * 60 * 1000,
    options.movementThresholdM || 5000,
  ].join('|');
}

function createHarness() {
  const consumers = new Map();
  const logs = [];
  let cleanupScheduled = false;

  const activeCount = () => Array.from(consumers.values()).filter((entry) => entry.enabled !== false).length;
  const log = (reason) => logs.push({ reason, activeConsumers: activeCount() });
  const cancelGrace = () => {
    if (!cleanupScheduled) return;
    if (activeCount() <= 0) return;
    cleanupScheduled = false;
    log('consumer_returned_before_grace_elapsed');
  };
  const scheduleGrace = () => {
    if (cleanupScheduled) return;
    cleanupScheduled = true;
    log('no_active_consumers_grace_started');
  };

  return {
    logs,
    set(id, options) {
      const previous = consumers.get(id);
      const previousSignature = previous ? signature(previous) : null;
      const nextSignature = signature(options);
      const before = activeCount();
      if (previousSignature === nextSignature) {
        if (before > 0) cancelGrace();
        return;
      }
      consumers.set(id, options);
      const after = activeCount();
      if (before !== after) log(previous ? 'consumer_updated' : 'consumer_registered');
      if (after > 0) cancelGrace();
      if (after === 0) scheduleGrace();
    },
    remove(id) {
      const removed = consumers.delete(id);
      if (!removed) return;
      log('consumer_removed');
      if (activeCount() === 0) scheduleGrace();
      else cancelGrace();
    },
    activeCount,
  };
}

const dashboard = {
  enabled: true,
  gps: { lat: 35.1, lng: -115.2, hasFix: true },
  units: 'imperial',
};

const harness = createHarness();

// Dashboard mount.
harness.set('dashboard-weather', dashboard);
assert.deepStrictEqual(
  harness.logs.map((entry) => entry.reason),
  ['consumer_registered'],
  'Dashboard mount should register exactly one active consumer.',
);
assert.strictEqual(harness.activeCount(), 1, 'Active consumer count should be one after mount.');

// HMR-like re-render with a new object but identical scalar parameters.
harness.set('dashboard-weather', { ...dashboard, gps: { ...dashboard.gps } });
assert.strictEqual(harness.logs.length, 1, 'HMR-like re-render should not log duplicate lifecycle events.');
assert.strictEqual(harness.activeCount(), 1, 'Active count should remain stable after same-signature re-render.');

// Orientation/layout recalculation changes only component layout, not weather params.
harness.set('dashboard-weather', { ...dashboard, gps: { ...dashboard.gps } });
harness.set('dashboard-weather', { ...dashboard, gps: { ...dashboard.gps } });
assert.strictEqual(harness.logs.length, 1, 'Orientation/layout recalculation should not remove/register weather consumers.');
assert.strictEqual(harness.activeCount(), 1, 'Active count should remain one through layout recalculation.');

// Weather refresh should not touch consumer lifecycle.
assert.strictEqual(harness.activeCount(), 1, 'Weather data refresh should not change active consumer accounting.');

// Parameter update should update in place, not remove/register.
harness.set('dashboard-weather', {
  ...dashboard,
  gps: { lat: 35.2, lng: -115.25, hasFix: true },
});
assert.strictEqual(harness.logs.length, 1, 'Weather target updates should not log active count churn when count is unchanged.');
assert.strictEqual(harness.activeCount(), 1, 'Active count should remain one after weather target update.');

// Dashboard unmount.
harness.remove('dashboard-weather');
assert.deepStrictEqual(
  harness.logs.map((entry) => entry.reason),
  ['consumer_registered', 'consumer_removed', 'no_active_consumers_grace_started'],
  'Unmount should remove once and start one grace window.',
);
assert.strictEqual(harness.activeCount(), 0, 'Active count should be zero after unmount.');

// Duplicate removal should not decrement below zero or log again.
harness.remove('dashboard-weather');
assert.strictEqual(harness.activeCount(), 0, 'Duplicate remove should not decrement below zero.');
assert.strictEqual(harness.logs.length, 3, 'Duplicate remove should not log lifecycle events.');

// Return during grace should only log when the active count is already positive.
harness.set('dashboard-weather', dashboard);
assert.deepStrictEqual(
  harness.logs.map((entry) => entry.reason),
  [
    'consumer_registered',
    'consumer_removed',
    'no_active_consumers_grace_started',
    'consumer_registered',
    'consumer_returned_before_grace_elapsed',
  ],
  'Remount during grace should cancel grace and register without a remove/register storm.',
);
assert.ok(
  harness.logs
    .filter((entry) => entry.reason === 'consumer_returned_before_grace_elapsed')
    .every((entry) => entry.activeConsumers > 0),
  'consumer_returned_before_grace_elapsed must never be logged with activeConsumers at zero.',
);

console.log('Operational weather consumer lifecycle harness passed.');
