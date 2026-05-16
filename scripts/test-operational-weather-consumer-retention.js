const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs
  .readFileSync(path.join(process.cwd(), 'lib', 'useOperationalWeather.ts'), 'utf8')
  .replace(/\r\n/g, '\n');

function assertIncludes(fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function assertNotIncludes(fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

assertIncludes(
  'const SHARED_NO_CONSUMER_GRACE_MS = 2500;',
  'Operational weather should give route transitions a short no-consumer grace period.',
);
assertIncludes(
  'let sharedWeatherNoConsumerCleanupTimer: ReturnType<typeof setTimeout> | null = null;',
  'Operational weather should track pending no-consumer cleanup separately from current weather state.',
);
assertIncludes(
  'scheduleNoConsumerCleanup();\n    return;',
  'Removing the last consumer should schedule cleanup instead of clearing immediately.',
);
assertIncludes(
  'if (nextActiveConsumerCount > 0) {\n    cancelNoConsumerCleanup();',
  'Registering/remounting an active consumer should cancel pending no-consumer cleanup.',
);
assertIncludes(
  'sharedWeatherRefreshHandler = null;\n    handleNoActiveWeatherConsumers();',
  'Shared refresh cleanup should run only after the grace window still has no consumers.',
);
assertIncludes(
  "reason: 'consumer_returned_before_grace_elapsed'",
  'Logs should clearly show when route remounts retain weather through the no-consumer grace window.',
);
assertIncludes(
  'const activeConsumerCount = getActiveSharedConsumerCount();\n  if (activeConsumerCount <= 0) return;',
  'Returning-consumer logs must only fire when activeConsumers is greater than zero.',
);
assertIncludes(
  'const removed = sharedWeatherConsumers.delete(id);\n  if (!removed) return;',
  'Removing an unknown consumer should be idempotent and must not decrement active consumer accounting.',
);
assertIncludes(
  "? 'no_active_consumers_current_retained'",
  'No-consumer cleanup should explicitly retain current/last-good weather when it exists.',
);
assertIncludes(
  "if (sharedWeatherState.result) {\n    logWeatherRetention('last_good_weather_retained'",
  'No-consumer cleanup should log retained last-good weather instead of implying a clear.',
);
assertIncludes(
  "logWeatherRetention('no_active_weather_consumer_idle'",
  'No-consumer cleanup with no current value should log a debug idle lifecycle event instead of a warning clear.',
);
assertNotIncludes(
  "logWeatherRetention('current_weather_value_cleared', {\n    scope: 'shared_operational_weather',\n    reason,\n  });",
  'No-consumer cleanup should not warn that current weather was cleared when no current value existed.',
);
assertNotIncludes(
  '_sharedWeatherLastFetchLocation = null;\n    sharedWeatherLastFetchAt = 0;\n    sharedWeatherRequestId += 1;\n    handleNoActiveWeatherConsumers();',
  'Route transitions must not reset fetch scope/request identity and clear weather immediately when the last screen unmounts.',
);
assertNotIncludes(
  "weather_cleared_explicitly', {\n      scope: 'shared_operational_weather'",
  'Normal shared operational weather consumer cleanup must not log as an explicit clear.',
);

console.log('Operational weather consumer retention checks passed.');
