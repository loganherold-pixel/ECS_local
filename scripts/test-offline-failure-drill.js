const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const servicePath = path.join(root, 'lib', 'offlineFailureDrillService.ts');
const panelPath = path.join(root, 'components', 'offline', 'OfflineFailureDrillPanel.tsx');
const dashboardAdapterPath = path.join(root, 'components', 'offline', 'OfflineDashboardAdapter.tsx');

require.extensions['.ts'] = function compileTs(module, filename) {
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

const {
  OFFLINE_DRILL_CAPABILITY_ORDER,
  OfflineDrillService,
  buildOfflineFailureDrill,
  buildOfflineFailureDrillFromSystemProfiles,
  formatOfflineDrillStatus,
} = require(servicePath);

const now = '2026-06-13T17:00:00.000Z';
const staleWeatherAt = '2026-06-12T12:00:00.000Z';
const recentAt = '2026-06-13T16:40:00.000Z';

function probe(overrides = {}) {
  return {
    availableInputs: [],
    missingInputs: [],
    staleInputs: [],
    invalidInputs: [],
    lastCachedAt: recentAt,
    sourceOfTruth: 'local_test_fixture',
    ...overrides,
  };
}

function drill(overrides = {}) {
  return buildOfflineFailureDrill({
    now,
    featureFlags: { offlineFailureDrill: true },
    noNetworkModeVerified: true,
    androidEvidence: {
      noNetworkDeviceEvidence: false,
      screenshotsCaptured: false,
      logsCaptured: false,
      cacheManifestCaptured: false,
      noRemoteSyncConfirmed: false,
    },
    capabilities: {
      offline_navigation: probe({
        availableInputs: ['route_geometry', 'route_cache', 'route_tiles'],
      }),
      offline_honesty: probe({
        availableInputs: ['cache_manifest', 'source_timestamps'],
      }),
      command_brief: probe({
        availableInputs: ['command_brief_snapshot', 'credential_restore_material'],
      }),
      navigate: probe({
        availableInputs: ['saved_route', 'route_geometry', 'route_cache', 'route_tiles'],
      }),
      campops: probe({
        availableInputs: ['camp_packet', 'camp_cache'],
      }),
      dispatch_offline_replay: probe({
        availableInputs: ['dispatch_queue_persistence', 'credential_restore_material'],
        missingInputs: ['fresh_dispatch_state'],
      }),
      incident_recovery: probe({
        availableInputs: ['recovery_docs', 'incident_protocols', 'coordinate_tools'],
      }),
      field_utilities: probe({
        availableInputs: ['field_protocols', 'recovery_docs'],
        manualFallbackRequired: true,
      }),
    },
    ...overrides,
  });
}

function capability(result, id) {
  const item = result.capabilities.find((candidate) => candidate.capabilityId === id);
  assert.ok(item, `Expected capability ${id}`);
  return item;
}

function downloadLabels(item) {
  return item.recommendedDownloads.map((download) => download.label);
}

function downloadActions(item) {
  return item.recommendedDownloads.map((download) => download.actionType);
}

function assertProbeEvidence(result) {
  for (const item of result.capabilities) {
    assert.ok(Array.isArray(item.probeEvidence), `${item.capabilityId} should include probe evidence.`);
    assert.ok(item.probeEvidence.length > 0, `${item.capabilityId} should include at least one probe.`);
    assert.ok(
      item.probeEvidence.every((probeItem) => probeItem.localOnly === true),
      `${item.capabilityId} probe evidence should always be local-only.`,
    );
    for (const inputId of item.requiredInputs) {
      assert.ok(
        item.probeEvidence.some((probeItem) => probeItem.inputId === inputId),
        `${item.capabilityId} should include probe evidence for required input ${inputId}.`,
      );
    }
    if (item.status === 'available_offline') {
      for (const inputId of item.requiredInputs) {
        const probeItem = item.probeEvidence.find((candidate) => candidate.inputId === inputId);
        assert.ok(probeItem, `${item.capabilityId} missing required probe ${inputId}.`);
        assert.ok(
          ['valid', 'present'].includes(probeItem.result),
          `${item.capabilityId}/${inputId} cannot be available without valid local probe evidence.`,
        );
        assert.equal(probeItem.freshness, 'current', `${item.capabilityId}/${inputId} must be current for available_offline.`);
      }
    }
  }
}

assert.deepStrictEqual(OFFLINE_DRILL_CAPABILITY_ORDER, [
  'offline_navigation',
  'offline_honesty',
  'command_brief',
  'navigate',
  'campops',
  'dispatch_offline_replay',
  'incident_recovery',
  'field_utilities',
]);

assert.strictEqual(formatOfflineDrillStatus('available_offline'), 'Available offline');
assert.strictEqual(formatOfflineDrillStatus('partially_available'), 'Partially available');
assert.strictEqual(formatOfflineDrillStatus('cached_but_stale'), 'Cached but stale');
assert.strictEqual(formatOfflineDrillStatus('unavailable'), 'Unavailable');
assert.strictEqual(formatOfflineDrillStatus('manual_fallback_required'), 'Manual fallback required');

const baseline = drill();
assert.strictEqual(baseline.enabled, true);
assert.strictEqual(baseline.readiness, 'current_user_facing_extension');
assert.strictEqual(baseline.localOnly, true, 'Drill must declare local-only evaluation.');
assert.strictEqual(baseline.runtimeNetworkEvidence.runtimeNetworkProbe, 'offline');
assertProbeEvidence(baseline);
assert.strictEqual(capability(baseline, 'offline_navigation').status, 'available_offline');
assert.strictEqual(capability(baseline, 'navigate').status, 'available_offline');
assert.strictEqual(capability(baseline, 'dispatch_offline_replay').status, 'partially_available');
assert.strictEqual(capability(baseline, 'field_utilities').status, 'manual_fallback_required');
assert.ok(
  capability(baseline, 'dispatch_offline_replay').userMessage.includes('queued locally'),
  'Dispatch offline replay should describe local queueing instead of fresh team sync.',
);
assert.strictEqual(baseline.productionReadiness.status, 'blocked_android_no_network_evidence_required');
assert.ok(
  baseline.productionReadiness.blockers.includes('android_evidence_manifest_missing'),
  'Android no-network evidence should block production readiness.',
);

const routeCacheWithoutTiles = drill({
  capabilities: {
    navigate: probe({
      availableInputs: ['saved_route', 'route_geometry', 'route_cache'],
      missingInputs: ['route_tiles'],
    }),
  },
});
assert.strictEqual(capability(routeCacheWithoutTiles, 'navigate').status, 'partially_available');
assert.deepStrictEqual(capability(routeCacheWithoutTiles, 'navigate').missingInputs, ['route_tiles']);
assert.ok(
  downloadLabels(capability(routeCacheWithoutTiles, 'navigate')).includes('Download route tiles'),
  'Missing route tiles should produce a route tile download recommendation.',
);
assert.ok(
  downloadActions(capability(routeCacheWithoutTiles, 'navigate')).includes('download_route_tiles'),
  'Missing route tiles should include structured download_route_tiles metadata.',
);

const staleWeather = drill({
  capabilities: {
    command_brief: probe({
      availableInputs: ['command_brief_snapshot', 'credential_restore_material'],
      staleInputs: ['weather_packet'],
      lastCachedAt: staleWeatherAt,
    }),
  },
});
assert.strictEqual(capability(staleWeather, 'command_brief').status, 'cached_but_stale');
assert.strictEqual(capability(staleWeather, 'command_brief').lastCachedAt, staleWeatherAt);
assert.ok(
  downloadLabels(capability(staleWeather, 'command_brief')).includes('Refresh weather packet'),
  'Stale weather should recommend refreshing the weather packet.',
);
assert.ok(
  downloadActions(capability(staleWeather, 'command_brief')).includes('refresh_weather_packet'),
  'Stale weather should include structured refresh_weather_packet metadata.',
);

const missingRecoveryDocs = drill({
  capabilities: {
    incident_recovery: probe({
      availableInputs: ['incident_protocols', 'coordinate_tools'],
      missingInputs: ['recovery_docs'],
    }),
  },
});
assert.strictEqual(capability(missingRecoveryDocs, 'incident_recovery').status, 'unavailable');
assert.ok(
  capability(missingRecoveryDocs, 'incident_recovery').userMessage.includes('Missing required local inputs'),
  'Missing recovery docs should not be hidden behind a confident incident workflow status.',
);

const invalidCredentials = drill({
  capabilities: {
    dispatch_offline_replay: probe({
      availableInputs: ['dispatch_queue_persistence'],
      invalidInputs: ['credential_restore_material'],
      probeEvidence: [{
        probeId: 'credential-secret-probe',
        capabilityId: 'dispatch_offline_replay',
        inputId: 'credential_restore_material',
        sourceType: 'credential_restore',
        localOnly: true,
        checkedAt: now,
        freshness: 'unavailable',
        result: 'corrupt',
        notes: ['credential_restore token=super-secret-token restore_code=restore-code-123 invalid'],
      }],
    }),
  },
});
assert.strictEqual(capability(invalidCredentials, 'dispatch_offline_replay').status, 'unavailable');
assert.ok(
  downloadLabels(capability(invalidCredentials, 'dispatch_offline_replay')).includes('Refresh credential restore material'),
  'Invalid credential restore state should produce a restore-material recommendation.',
);
assert.ok(
  downloadActions(capability(invalidCredentials, 'dispatch_offline_replay')).includes('prepare_credential_restore'),
  'Invalid credential restore state should include structured prepare_credential_restore metadata.',
);
assert.ok(
  !JSON.stringify(invalidCredentials).includes('super-secret-token') &&
    !JSON.stringify(invalidCredentials).includes('restore-code-123'),
  'Secret-like credential values must be redacted from drill output.',
);

const unavailableDefault = drill({
  capabilities: {
    campops: probe({
      availableInputs: [],
      missingInputs: ['camp_packet', 'camp_cache'],
    }),
  },
});
assert.strictEqual(capability(unavailableDefault, 'campops').status, 'unavailable');
assert.ok(
  downloadLabels(unavailableDefault).includes('Download camp packet'),
  'Aggregate recommendations should include missing camp packet downloads.',
);
assert.ok(
  downloadActions(unavailableDefault).includes('download_camp_packet'),
  'Aggregate recommendations should include structured camp packet metadata.',
);

const disabled = buildOfflineFailureDrill({
  now,
  featureFlags: { offlineFailureDrill: false },
  noNetworkModeVerified: true,
});
assert.strictEqual(disabled.enabled, false);
assert.strictEqual(disabled.capabilities.length, 0);

const service = new OfflineDrillService();
const serviceResult = service.run({
  now,
  featureFlags: { offlineFailureDrill: true },
  noNetworkModeVerified: false,
});
assert.strictEqual(serviceResult.warnings[0], 'No-network mode was not verified inside the app/runtime.');
assert.ok(
  serviceResult.productionReadiness.blockers.includes('runtime_no_network_confirmation_missing'),
  'Runtime no-network confirmation should be a production readiness blocker.',
);

const profileDerived = buildOfflineFailureDrillFromSystemProfiles({
  now,
  connectivityState: 'offline',
  featureFlags: { offlineFailureDrill: true },
  profiles: [
    {
      system_id: 'route_navigation',
      name: 'Route Navigation',
      behavior: 'cached_data',
      uses_local_telemetry: true,
      has_cached_data: true,
      last_updated: recentAt,
      staleness_label: null,
      is_stale: false,
      status_message: 'Cached route available',
    },
    {
      system_id: 'weather',
      name: 'Weather',
      behavior: 'last_known',
      uses_local_telemetry: false,
      has_cached_data: true,
      last_updated: staleWeatherAt,
      staleness_label: 'stale',
      is_stale: true,
      status_message: 'Cached weather stale',
    },
    {
      system_id: 'discovery',
      name: 'Discovery',
      behavior: 'cached_data',
      uses_local_telemetry: false,
      has_cached_data: true,
      last_updated: recentAt,
      staleness_label: null,
      is_stale: false,
      status_message: 'Camp cache available',
    },
  ],
  dispatchQueue: {
    size: 2,
    pendingCount: 2,
    failedCount: 0,
  },
});
assert.strictEqual(profileDerived.localOnly, true);
assert.strictEqual(capability(profileDerived, 'navigate').status, 'available_offline');
assert.strictEqual(capability(profileDerived, 'command_brief').status, 'cached_but_stale');
assert.strictEqual(capability(profileDerived, 'dispatch_offline_replay').status, 'partially_available');

const forbiddenCopy = [
  'offline routing is available',
  'live weather available',
  'live availability',
  'team sync available',
  'fresh dispatch state',
  'provider updates available',
].join('|');
const forbiddenPattern = new RegExp(forbiddenCopy, 'i');
for (const item of baseline.capabilities) {
  assert.ok(!forbiddenPattern.test(item.userMessage), `Unsafe offline promise in ${item.capabilityId}: ${item.userMessage}`);
}

const panelSource = fs.readFileSync(panelPath, 'utf8');
[
  'Offline Failure Drill',
  'current user-facing ECS extension',
  'Available offline',
  'Partially available',
  'Cached but stale',
  'Manual fallback required',
  'recommendedDownloads',
  'lastCachedAt',
].forEach((fragment) => {
  assert.ok(panelSource.includes(fragment), `Offline Failure Drill panel should include fragment: ${fragment}`);
});

[
  'probeEvidence',
  'Available from local cache',
  'Pending Dispatch replay',
  'Not confirmed by source of truth',
  'No-network evidence required before production',
].forEach((fragment) => {
  assert.ok(panelSource.includes(fragment), `Offline Failure Drill panel should include conservative evidence fragment: ${fragment}`);
});

const dashboardAdapterSource = fs.readFileSync(dashboardAdapterPath, 'utf8');
[
  'OfflineFailureDrillPanel',
  'buildOfflineFailureDrillFromSystemProfiles',
  'testID="offline-failure-drill-panel"',
].forEach((fragment) => {
  assert.ok(dashboardAdapterSource.includes(fragment), `Offline dashboard should render drill surface fragment: ${fragment}`);
});

console.log('Offline Failure Drill checks passed.');
