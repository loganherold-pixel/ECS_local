const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const {
  APPROVED_PRODUCTION_SIGNING_CERT_SHA256,
  INVARIANTS,
  PRODUCTION_APPLICATION_ID,
  formatInvariantIssues,
  parseAndroidManifestPolicy,
  validateNativeBuildPolicy,
  validateSourceBuildPolicy,
} = require('./build-profile-policy.cjs');

const root = path.resolve(__dirname, '..');

const productionProfile = {
  credentialsSource: 'remote',
};

function productionEnv(overrides = {}) {
  return {
    ECS_PROVIDER_MODE: 'live',
    ECS_QA_FIXTURES_ENABLED: 'false',
    ECS_DETERMINISTIC_PROVIDER_TRANSPORT: 'false',
    EXPO_PUBLIC_ECS_ROUTE_DISCOVERY_QA_TRANSPORT: 'false',
    ECS_SCOPE_B_QA_ACCEPTANCE_BUILD: '0',
    ECS_QA_ACCEPTANCE_OVERLAY_ENABLED: 'false',
    ECS_SUPPORT_DIAGNOSTICS_ENABLED: '0',
    ECS_SUPPORT_DIAGNOSTICS_APPROVED: '0',
    ECS_INTERNAL_DIAGNOSTICS_ENABLED: '0',
    ECS_UPDATES_POLICY: 'disabled',
    ECS_PRODUCTION_SIGNING_POLICY: 'approved-remote',
    ECS_PRODUCTION_SIGNING_CERT_SHA256: APPROVED_PRODUCTION_SIGNING_CERT_SHA256,
    ...overrides,
  };
}

function sourceIssues({ applicationId, profileName, env }) {
  return validateSourceBuildPolicy({
    applicationId,
    profileName,
    env,
    sourceProfile: productionProfile,
    updates: { enabled: false, checkAutomatically: 'NEVER' },
  });
}

{
  const issues = sourceIssues({
    applicationId: PRODUCTION_APPLICATION_ID,
    profileName: 'route-discovery-qa',
    env: productionEnv({
      EXPO_PUBLIC_ECS_ROUTE_DISCOVERY_QA_TRANSPORT: 'true',
      ECS_PROVIDER_MODE: 'deterministic',
    }),
  });
  assert.ok(
    issues.some(({ invariant }) => invariant === INVARIANTS.QA_REQUIRES_NON_PRODUCTION_ID),
    'route-discovery QA plus the production application ID must fail',
  );
  assert.ok(
    issues.some(({ invariant }) => invariant === INVARIANTS.PRODUCTION_REQUIRES_ROUTE_DISCOVERY_OFF),
    'route-discovery QA failure must name the route-discovery transport invariant',
  );
}

{
  const issues = sourceIssues({
    applicationId: PRODUCTION_APPLICATION_ID,
    profileName: 'scope-b-qa',
    env: productionEnv({
      ECS_SCOPE_B_QA_ACCEPTANCE_BUILD: '1',
      ECS_QA_ACCEPTANCE_OVERLAY_ENABLED: 'true',
      EXPO_PUBLIC_ECS_QA_SMART_RESUPPLY_PROVIDER_FIXTURE: 'qualified_empty',
      ECS_SUPPORT_DIAGNOSTICS_ENABLED: '1',
      ECS_SUPPORT_DIAGNOSTICS_APPROVED: '1',
    }),
  });
  assert.ok(
    issues.some(({ invariant }) => invariant === INVARIANTS.QA_REQUIRES_NON_PRODUCTION_ID),
    'Scope B QA plus the production application ID must fail',
  );
  assert.ok(
    issues.some(({ invariant }) => invariant === INVARIANTS.PRODUCTION_REQUIRES_QA_OVERLAY_OFF),
    'Scope B QA failure must name the acceptance-overlay invariant',
  );
  assert.ok(
    issues.some(({ invariant }) => invariant === INVARIANTS.PRODUCTION_REQUIRES_DIAGNOSTICS_OFF),
    'Scope B QA failure must name the diagnostics invariant',
  );
}

{
  const issues = sourceIssues({
    applicationId: `${PRODUCTION_APPLICATION_ID}.scopebqa`,
    profileName: 'scope-b-qa',
    env: productionEnv({
      ECS_PROVIDER_MODE: 'deterministic',
      ECS_SCOPE_B_QA_ACCEPTANCE_BUILD: '1',
      ECS_QA_ACCEPTANCE_OVERLAY_ENABLED: 'true',
      EXPO_PUBLIC_ECS_QA_SMART_RESUPPLY_PROVIDER_FIXTURE: 'qualified_empty',
      ECS_SUPPORT_DIAGNOSTICS_ENABLED: '1',
      ECS_SUPPORT_DIAGNOSTICS_APPROVED: '1',
    }),
  });
  assert.deepStrictEqual(issues, [], 'QA fixtures plus a distinct non-production application ID must pass');
}

{
  const issues = sourceIssues({
    applicationId: PRODUCTION_APPLICATION_ID,
    profileName: 'production',
    env: productionEnv(),
  });
  assert.deepStrictEqual(issues, [], 'production ID plus live provider and all QA paths off must pass');
}

{
  const manifest = parseAndroidManifestPolicy(`
    <manifest package="${PRODUCTION_APPLICATION_ID}">
      <application>
        <meta-data android:name="expo.modules.updates.ENABLED" android:value="true" />
        <meta-data android:name="expo.modules.updates.EXPO_UPDATES_CHECK_ON_LAUNCH" android:value="ALWAYS" />
      </application>
    </manifest>
  `);
  const issues = validateNativeBuildPolicy({
    sourceApplicationId: PRODUCTION_APPLICATION_ID,
    sourceUpdatesPolicy: 'disabled',
    nativeApplicationId: manifest.applicationId,
    nativeUpdatesEnabled: manifest.updatesEnabled,
    nativeCheckAutomatically: manifest.checkAutomatically,
    expectedSigningCertificateSha256: APPROVED_PRODUCTION_SIGNING_CERT_SHA256,
    nativeSigningCertificateSha256: APPROVED_PRODUCTION_SIGNING_CERT_SHA256,
  });
  assert.ok(
    issues.some(({ invariant }) => invariant === INVARIANTS.POSTBUILD_UPDATES_ENABLED_MISMATCH),
    'native updates enabled must fail when the source profile says disabled',
  );
  assert.ok(
    issues.some(({ invariant }) => invariant === INVARIANTS.POSTBUILD_UPDATES_CHECK_MISMATCH),
    'native check-on-launch must fail when the source profile says NEVER',
  );
}

{
  const secretSentinel = 'do-not-print-this-secret';
  const issues = sourceIssues({
    applicationId: PRODUCTION_APPLICATION_ID,
    profileName: 'production',
    env: productionEnv({
      ECS_PROVIDER_MODE: 'deterministic',
      MAPBOX_DOWNLOADS_TOKEN: secretSentinel,
    }),
  });
  const output = formatInvariantIssues(issues).join('\n');
  assert.match(output, /ECS_BUILD_PROFILE_INVARIANT/);
  assert.doesNotMatch(output, new RegExp(secretSentinel));
}

{
  const appConfigSource = fs.readFileSync(path.join(root, 'app.config.js'), 'utf8');
  const buildScriptSource = fs.readFileSync(
    path.join(root, 'scripts', 'eas-cloud-build-android-apk.mjs'),
    'utf8',
  );
  const androidBuildGradle = fs.readFileSync(path.join(root, 'android', 'app', 'build.gradle'), 'utf8');
  const easConfig = JSON.parse(fs.readFileSync(path.join(root, 'eas.json'), 'utf8'));
  assert.ok(
    appConfigSource.includes('assertSourceBuildPolicy'),
    'Expo config evaluation must enforce the source profile before EAS upload',
  );
  assert.ok(
    buildScriptSource.indexOf('runBuildProfilePolicyGuard(buildProfile)') <
      buildScriptSource.indexOf('const child = spawn(command, args'),
    'the build helper must run the policy guard before spawning EAS upload/build',
  );
  assert.ok(
    androidBuildGradle.includes('applicationId ecsAndroidApplicationId') &&
      androidBuildGradle.includes('System.getenv("ECS_ANDROID_APPLICATION_ID")'),
    'native Android output must use the same isolated application ID selected by the build profile',
  );
  for (const profileName of ['fieldtest', 'production']) {
    const profile = easConfig.build[profileName];
    assert.strictEqual(profile.credentialsSource, 'remote');
    assert.strictEqual(profile.env.ECS_PROVIDER_MODE, 'live');
    assert.strictEqual(profile.env.ECS_QA_FIXTURES_ENABLED, 'false');
    assert.strictEqual(profile.env.EXPO_PUBLIC_ECS_ROUTE_DISCOVERY_QA_TRANSPORT, 'false');
    assert.strictEqual(profile.env.ECS_SUPPORT_DIAGNOSTICS_ENABLED, '0');
    assert.strictEqual(profile.env.ECS_UPDATES_POLICY, 'disabled');
    assert.strictEqual(
      profile.env.ECS_PRODUCTION_SIGNING_CERT_SHA256,
      APPROVED_PRODUCTION_SIGNING_CERT_SHA256,
    );
  }
  for (const profileName of ['development', 'preview', 'campops-preview']) {
    assert.notStrictEqual(
      easConfig.build[profileName].env.ECS_ANDROID_APPLICATION_ID,
      PRODUCTION_APPLICATION_ID,
      `${profileName} must use a distinct non-production application ID`,
    );
  }
}

console.log('Build-profile production-ID hardening checks passed (5 required scenarios plus wiring/privacy).');
