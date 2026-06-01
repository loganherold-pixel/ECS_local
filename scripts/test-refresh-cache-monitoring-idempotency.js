const fs = require('fs');
const path = require('path');

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const fleet = read('app/(tabs)/fleet.tsx');
const expeditionCache = read('lib/expeditionCache.ts');
const timelineIntel = read('lib/timelineIntelligenceEngine.ts');

assert(
  fleet.includes('fetchInFlightRef') &&
    fleet.includes('if (fetchInFlightRef.current) return fetchInFlightRef.current'),
  'Fleet fetchVehicles should guard overlapping focus/subscription refreshes.',
);

assert(
  fleet.includes('lastFocusRefreshRevisionRef') &&
    fleet.includes('if (lastFocusRefreshRevisionRef.current === currentRev) return'),
  'Fleet focus refresh should process each vehicleStore revision once.',
);

assert(
  !fleet.includes('} else {\n      fetchVehicles();\n    }\n  }, [fetchVehicles]));'),
  'Fleet focus refresh should not re-fetch when vehicleStore revision is unchanged.',
);

assert(
  expeditionCache.includes('function getZoneCacheSignature') &&
    expeditionCache.includes('getZoneCacheSignature(existingZones) === getZoneCacheSignature(zones)') &&
    expeditionCache.includes('return;\n        }\n      } catch {}'),
  'Expedition cache should skip identical vehicle zone writes/logs.',
);

assert(
  timelineIntel.includes('if (_isMonitoring && _currentExpeditionId === expeditionId)') &&
    timelineIntel.includes('if (!_isMonitoring && !_monitorTimer) return'),
  'Timeline monitoring start/stop should be idempotent.',
);

assert(
  timelineIntel.includes('if (_expeditionUnsubscribe)') &&
    timelineIntel.includes('const resumeMonitoring = (expeditionId: string)'),
  'Timeline auto-monitor initialization should avoid duplicate subscriptions and duplicate intervals.',
);

console.log('refresh/cache/monitoring idempotency checks passed');
