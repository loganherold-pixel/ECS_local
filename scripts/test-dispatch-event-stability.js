const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function registerTypeScriptLoader() {
  require.extensions['.ts'] = function loadTs(module, filename) {
    const source = fs.readFileSync(filename, 'utf8');
    const output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
      fileName: filename,
    });
    module._compile(output.outputText, filename);
  };
}

function loadTypeScriptModule(relPath) {
  const fullPath = path.join(process.cwd(), relPath);
  delete require.cache[require.resolve(fullPath)];
  return require(fullPath);
}

function captureLogs(fn) {
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => {
    logs.push(args.map(String).join(' '));
  };
  try {
    return { value: fn(), logs };
  } finally {
    console.log = originalLog;
  }
}

registerTypeScriptLoader();

globalThis.ECS_DEBUG_DISPATCH_WIRE = true;

const dispatchCadSource = fs.readFileSync(
  path.join(process.cwd(), 'components', 'dispatch', 'DispatchCadCommandCenter.tsx'),
  'utf8',
).replace(/\r\n/g, '\n');

assert(
  dispatchCadSource.includes('let lastDispatchRenderedLogSignature: string | null = null;'),
  'Dispatch rendered-event logging should be guarded across remounts by semantic signature.',
);
assert(
  dispatchCadSource.includes('let lastDispatchTeamSyncLogSignature: string | null = null;'),
  'Dispatch team sync logging should be guarded across remounts by semantic signature.',
);
assert(
  dispatchCadSource.includes('function createTeamSnapshotSignature(snapshot: TeamStoreSnapshot): string'),
  'Dispatch should compare team snapshots semantically before setting component state.',
);
assert(
  dispatchCadSource.includes('function createDispatchChannelSnapshotSignature(channels: DispatchChannelSnapshot[]): string'),
  'Dispatch channel notifications should be deduped by derived channel state before bumping revisions.',
);
assert(
  dispatchCadSource.includes('dispatchChannelSignatureRef.current === nextSignature'),
  'Dispatch channel subscription should skip identical channel updates.',
);
assert(
  dispatchCadSource.includes('createTeamSnapshotSignature(currentSnapshot) === createTeamSnapshotSignature(nextSnapshot)'),
  'Dispatch team subscription should skip semantically unchanged snapshots.',
);

const {
  buildLiveDispatchEvents,
  createLiveDispatchEventListFingerprint,
} = loadTypeScriptModule('lib/dispatchLiveAggregator.ts');

const baseInput = {
  weatherState: {
    locationName: 'Ridge Camp',
    fetchedAt: '2026-04-29T18:00:00.000Z',
    status: {
      source: 'live',
      stale: false,
      freshness: 'fresh',
    },
    current: {
      windSpeed: 31,
      visibility: 10000,
      condition: 'Clear',
    },
    raw: {
      lat: 38.781,
      lng: -121.208,
      label: 'Ridge Camp',
      current: {
        wind_speed: 31,
        visibility: 10000,
        weather_main: 'Clear',
      },
      forecast: [{ dt: 1 }],
      trail_conditions: {
        overall: 'good',
        factors: [],
      },
    },
  },
  activeRouteState: {
    id: 'route-1',
    routeName: 'Ridge Exit',
    totalDistanceMiles: 12.4,
    segmentCount: 2,
    overallDifficulty: 'challenging',
    analyzedAt: '2026-04-29T18:00:00.000Z',
    segments: [
      {
        segmentIndex: 1,
        difficulty: 'challenging',
        coordinates: [38.781, -121.208],
      },
    ],
  },
  terrainRiskState: null,
  vehicleTelemetryState: null,
  resourceState: null,
  syncState: {
    isOnline: true,
    offlineMode: false,
    syncStatus: 'synced',
    queuedCount: 0,
    dirtyCount: 0,
    connectivity: {
      status: 'online',
      isOnline: true,
      isInternetReachable: true,
      lastOfflineAt: '2026-04-29T18:00:00.000Z',
      initialized: true,
    },
  },
  teamState: null,
  recoveryState: { events: [] },
};

const first = captureLogs(() => buildLiveDispatchEvents(baseInput));
assert(first.value.length >= 2, 'fixture should produce route and weather advisory events');
assert(
  first.logs.some((line) => line.includes('[DISPATCH_WIRE]')),
  'first build should log the changed wire event counts',
);

const timestampOnlyChange = {
  ...baseInput,
  weatherState: {
    ...baseInput.weatherState,
    fetchedAt: '2026-04-29T18:05:00.000Z',
    normalized: {
      current: {
        windMph: 31,
        condition: 'Clear',
      },
      forecast: [{ dt: 1 }],
      updatedAt: '2026-04-29T18:05:00.000Z',
    },
  },
  activeRouteState: {
    ...baseInput.activeRouteState,
    analyzedAt: '2026-04-29T18:05:00.000Z',
  },
  syncState: {
    ...baseInput.syncState,
    connectivity: {
      ...baseInput.syncState.connectivity,
      lastOfflineAt: '2026-04-29T18:05:00.000Z',
    },
  },
};

const repeated = captureLogs(() => buildLiveDispatchEvents(timestampOnlyChange));
assert.strictEqual(
  repeated.value,
  first.value,
  'timestamp-only source churn should reuse the previous live event array',
);
assert.strictEqual(
  repeated.logs.filter((line) => line.includes('[DISPATCH_WIRE]')).length,
  0,
  'timestamp-only source churn should not log another Dispatch wire cycle',
);
assert.strictEqual(
  createLiveDispatchEventListFingerprint(repeated.value),
  createLiveDispatchEventListFingerprint(first.value),
  'event list fingerprint should remain stable for timestamp-only changes',
);

const semanticWeatherChange = {
  ...timestampOnlyChange,
  weatherState: {
    ...timestampOnlyChange.weatherState,
    current: {
      ...timestampOnlyChange.weatherState.current,
      windSpeed: 45,
    },
    raw: {
      ...timestampOnlyChange.weatherState.raw,
      current: {
        ...timestampOnlyChange.weatherState.raw.current,
        wind_speed: 45,
      },
    },
    normalized: {
      ...timestampOnlyChange.weatherState.normalized,
      current: {
        ...timestampOnlyChange.weatherState.normalized.current,
        windMph: 45,
      },
    },
  },
};

const changed = captureLogs(() => buildLiveDispatchEvents(semanticWeatherChange));
assert.notStrictEqual(
  changed.value,
  first.value,
  'semantic source changes should produce a fresh event array',
);
assert(
  changed.value.some((event) => event.id === 'live-weather-wind-45-critical'),
  'semantic weather changes should still generate the updated critical wind event',
);

console.log('dispatch live event stability checks passed');
