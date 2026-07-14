const assert = require('assert/strict');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function assertIncludes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function readTrackedQaEvidence() {
  try {
    return execFileSync('git', ['ls-files', '.qa', 'qa-evidence'], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
  } catch (error) {
    if (error?.code !== 'EPERM') throw error;
    const index = fs.readFileSync(path.join(root, '.git', 'index'));
    assert.equal(index.toString('ascii', 0, 4), 'DIRC', 'Git index fallback should read a standard index.');
    const version = index.readUInt32BE(4);
    assert.ok(version === 2 || version === 3, `Unsupported Git index version ${version} in test fallback.`);
    const count = index.readUInt32BE(8);
    const matches = [];
    let offset = 12;
    for (let entryIndex = 0; entryIndex < count; entryIndex += 1) {
      const entryStart = offset;
      const flags = index.readUInt16BE(entryStart + 60);
      const extendedBytes = version === 3 && (flags & 0x4000) !== 0 ? 2 : 0;
      const pathStart = entryStart + 62 + extendedBytes;
      const pathEnd = index.indexOf(0, pathStart);
      assert.ok(pathEnd >= pathStart, 'Git index entry should contain a null-terminated path.');
      const trackedPath = index.toString('utf8', pathStart, pathEnd).replace(/\\/g, '/');
      if (trackedPath === '.qa' || trackedPath.startsWith('.qa/') || trackedPath === 'qa-evidence' || trackedPath.startsWith('qa-evidence/')) {
        matches.push(trackedPath);
      }
      const entryLength = pathEnd + 1 - entryStart;
      offset = entryStart + Math.ceil(entryLength / 8) * 8;
    }
    return matches.join('\n');
  }
}

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
  buildClosedBetaDiagnosticsReport,
  formatClosedBetaDiagnosticsReport,
  sanitizeClosedBetaDiagnosticsPayload,
} = require(path.join(root, 'lib', 'closedBetaDiagnostics.ts'));

const packageJson = readJson('package.json');
const appJson = readJson('app.json');
const gitIgnore = read('.gitignore');
const moreScreen = read('app/(tabs)/more.tsx');
const fieldIssueModal = read('components/feedback/FieldIssueReportModal.tsx');
const issueIntelligence = read('lib/ecsIssueIntelligence.ts');
const tabBoundary = read('components/TabErrorBoundary.tsx');
const widgetBoundary = read('components/WidgetErrorBoundary.tsx');
const rootLayout = read('app/_layout.tsx');
const distributionResolver = read('lib/auth/distributionEntryResolver.ts');
const featureVisibilityRegistry = read('lib/features/featureVisibilityRegistry.ts');
const routeManifest = read('lib/routeManifest.ts');
const convoyIdentityRoute = read('app/dev/convoy-identity-qa.tsx');
const convoyFixtureRoute = read('app/dev/convoy-participant-qa.tsx');
const convoyFixtureSource = read('lib/convoy/convoyParticipantQaFixtures.ts');
const supportDoc = read('docs/qa/closed-beta-monitoring.md');

assert.equal(
  packageJson.scripts['test:release-log-monitoring-beta'],
  'node ./scripts/test-release-log-monitoring-beta.js',
  'Package scripts should expose the closed beta monitoring guard.',
);

const rawPayload = {
  email: 'loganherold@gmail.com',
  userId: '123e4567-e89b-12d3-a456-426614174000',
  accessToken: 'supabase-access-token-secret',
  refresh_token: 'supabase-refresh-token-secret',
  authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secret',
  mapboxSecretToken: 'sk.mapbox-super-secret',
  providerCredentials: {
    serviceRoleKey: 'sb_secret_service_role',
    apiKey: 'provider-api-key',
  },
  location: {
    latitude: 38.123456,
    longitude: -121.654321,
    accuracy: 5,
  },
  convoyLocationHistory: [
    { lat: 38.123456, lon: -121.654321, timestamp: '2026-06-12T12:00:00.000Z' },
  ],
  rawBlePayload: 'aabbccddeeff00112233445566778899',
  safeLabel: 'provider unavailable',
};

const sanitized = sanitizeClosedBetaDiagnosticsPayload(rawPayload);
const sanitizedText = JSON.stringify(sanitized);
for (const forbidden of [
  'loganherold@gmail.com',
  '123e4567-e89b-12d3-a456-426614174000',
  'supabase-access-token-secret',
  'supabase-refresh-token-secret',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secret',
  'sk.mapbox-super-secret',
  'sb_secret_service_role',
  'provider-api-key',
  '38.123456',
  '-121.654321',
  'aabbccddeeff00112233445566778899',
]) {
  assert.equal(sanitizedText.includes(forbidden), false, `Sanitized diagnostics must not include ${forbidden}`);
}
assert.equal(sanitized.safeLabel, 'provider unavailable', 'Non-sensitive status labels should be preserved.');
assert.equal(sanitized.location, '[redacted_location]', 'Coordinate objects should be collapsed to a location redaction marker.');
assert.equal(
  sanitized.convoyLocationHistory,
  '[redacted_convoy_location_history]',
  'Raw convoy location history should not be exported.',
);
assert.equal(sanitized.rawBlePayload, '[redacted_telemetry_payload]', 'Raw BLE payloads should not be exported.');

const report = buildClosedBetaDiagnosticsReport({
  generatedAt: '2026-06-12T19:00:00.000Z',
  featureArea: 'Convoy Command',
  issueSummary: 'Device B join failed near 38.123456, -121.654321 for loganherold@gmail.com',
  build: {
    appName: appJson.expo.name,
    packageId: appJson.expo.android.package,
    versionName: appJson.expo.version,
    versionCode: appJson.expo.android.versionCode,
    runtimeVersion: appJson.expo.runtimeVersion,
    buildProfile: 'fieldtest',
    channel: 'fieldtest',
    environment: 'preview',
  },
  backend: {
    supabaseProjectRef: 'ppullxxprgyeoakzqnxi',
    supabaseConfigured: true,
    mapboxConfigured: true,
  },
  device: {
    platform: 'android',
    osVersion: '16',
    model: 'Samsung SM-X230',
    deviceId: 'sensitive-device-id',
    serialNumber: 'sensitive-serial',
  },
  state: {
    activeTrip: 'inactive',
    offlinePacket: 'not_active',
    convoy: 'provider_unavailable',
    telemetry: 'stale',
    weather: 'unavailable',
  },
  recentEvents: [
    {
      level: 'WARN',
      category: 'MAP',
      message: 'Provider failed with token sk.mapbox-super-secret',
      details: rawPayload,
    },
  ],
});

assert.equal(report.build.packageId, 'com.expeditioncommand.planningofflinesync');
assert.equal(report.build.versionName, '1.0.0');
assert.equal(report.build.versionCode, 4);
assert.equal(report.backend.supabaseConfigured, true);
assert.equal(report.backend.mapboxConfigured, true);
assert.equal(report.device.deviceId, undefined, 'Device identifiers should not be part of the report contract.');
assert.equal(report.device.serialNumber, undefined, 'Serial numbers should not be part of the report contract.');

const formatted = formatClosedBetaDiagnosticsReport(report);
for (const expected of [
  'Expedition Command System',
  'com.expeditioncommand.planningofflinesync',
  'versionName: 1.0.0',
  'versionCode: 4',
  'buildProfile: fieldtest',
  'backendProject: ppullxxprgyeoakzqnxi',
  'supabaseConfigured: yes',
  'mapboxConfigured: yes',
  'convoy: provider_unavailable',
  'telemetry: stale',
]) {
  assertIncludes(formatted, expected, `Formatted report should include safe support field: ${expected}`);
}
for (const forbidden of [
  'loganherold@gmail.com',
  '38.123456',
  '-121.654321',
  'sk.mapbox-super-secret',
  'sensitive-device-id',
  'sensitive-serial',
]) {
  assert.equal(formatted.includes(forbidden), false, `Formatted report must not include ${forbidden}`);
}

assertIncludes(moreScreen, 'Build Fingerprint', 'More > Settings should expose build fingerprint for testers.');
assertIncludes(moreScreen, 'Report Field Issue', 'More > Settings should expose field issue reporting.');
assertIncludes(fieldIssueModal, 'without sending raw device identity', 'Field issue modal should warn that reports avoid raw device identity.');
assertIncludes(issueIntelligence, 'sanitizeMessage', 'Issue intelligence should sanitize free-form messages.');
assertIncludes(issueIntelligence, 'hashedUserId', 'Issue intelligence should use hashed user ids.');
assertIncludes(issueIntelligence, 'hashedSessionId', 'Issue intelligence should use hashed session ids.');
assertIncludes(tabBoundary, 'reportFatalIssue', 'Tab error boundary should report fatal tab render failures.');
assertIncludes(widgetBoundary, 'reportLayoutFailure', 'Widget error boundary should report widget fallback failures.');
assertIncludes(rootLayout, 'setGlobalHandler', 'Root layout should install a global runtime error handler.');
assertIncludes(rootLayout, 'unhandledrejection', 'Root layout should report unhandled promise rejections.');

assertIncludes(distributionResolver, 'resolveECSFeatureRouteAccess', 'Distribution entry should defer dev route gating to the feature registry.');
assertIncludes(featureVisibilityRegistry, '/dev/convoy-identity-qa', 'Dev identity route should be registered behind a feature policy.');
assertIncludes(routeManifest, '/dev/convoy-identity-qa', 'Dev identity route should be represented in the canonical route manifest.');
assertIncludes(convoyIdentityRoute, 'isConvoyQaIdentityDiagnosticAllowed', 'Convoy identity QA route should use its production guard.');
assertIncludes(convoyFixtureRoute, 'Redirect', 'Convoy participant fixture route should redirect when unavailable.');
assertIncludes(convoyFixtureSource, "nodeEnv === 'test'", 'Convoy participant fixture guard should be test aware.');
assertIncludes(convoyFixtureSource, 'typeof __DEV__', 'Convoy participant fixture guard should be dev aware.');

assertIncludes(gitIgnore, '.qa/', 'Raw QA evidence folder should remain ignored.');
assertIncludes(gitIgnore, 'qa-evidence/', 'Raw QA evidence fallback folder should remain ignored.');
const trackedQaEvidence = readTrackedQaEvidence();
assert.equal(trackedQaEvidence, '', 'Raw QA evidence folders should not have tracked files.');

for (const requiredDocFragment of [
  'Closed Beta Monitoring',
  'Do not share',
  'precise coordinates',
  'Convoy/location issues',
  'Hardware telemetry issues',
  'Route/provider issues',
]) {
  assertIncludes(supportDoc, requiredDocFragment, `Support docs should include ${requiredDocFragment}.`);
}

console.log('Closed beta release log monitoring guard passed.');
