import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  classifyEvidenceCheckOutcome,
  writeEvidenceCheckResultForLane,
} from './verification/evidence-result.mjs';

const EVIDENCE_PATH = path.join('.smoke', 'automotive-production-evidence.json');
const EXTERNAL_AUTOMOTIVE_BLOCKER_IDS = [
  'android_head_unit_evidence',
  'carplay_head_unit_evidence',
  'driver_distraction_and_owner_acceptance',
];

function read(root, relativePath) {
  const filePath = path.join(root, relativePath);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

function readJson(root, relativePath) {
  try {
    return JSON.parse(read(root, relativePath));
  } catch {
    return null;
  }
}

function check(id, label, passed, evidence, remediation) {
  return { id, label, passed: Boolean(passed), evidence, remediation };
}

function filesMatch(root, left, right) {
  const normalize = (value) => value.replace(/\r\n/g, '\n').trimEnd();
  return read(root, left) !== '' && normalize(read(root, left)) === normalize(read(root, right));
}

export function buildAutomotiveProductionReadinessResult(options = {}) {
  const root = options.rootDir ?? process.cwd();
  const registry = read(root, 'lib/features/featureVisibilityRegistry.ts');
  const safeTypes = read(root, 'lib/automotive/automotiveSafeTypes.ts');
  const safeProjection = read(root, 'lib/automotive/automotiveSafeProjection.ts');
  const updatePolicy = read(root, 'lib/automotive/automotiveUpdatePolicy.ts');
  const coordinator = read(root, 'lib/automotive/automotiveRuntimeCoordinator.ts');
  const vehicleStore = read(root, 'lib/vehicleDisplayStore.ts');
  const androidBridge = read(root, 'lib/androidAutoBridge.ts');
  const carPlayBridge = read(root, 'lib/carPlayBridge.ts');
  const androidActions = read(root, 'plugins/android-auto/src/ECSVehicleActionsScreen.kt');
  const carPlayActions = read(root, 'plugins/carplay/src/ECSCarPlayActionsScreen.swift');
  const carPlayController = read(root, 'plugins/carplay/src/ECSCarPlayInterfaceController.swift');
  const releaseDoc = read(root, 'docs/automotive-driver-safe-release.md');
  const evidence = options.evidence ?? readJson(root, EVIDENCE_PATH);

  const checks = [
    check(
      'canonical_automotive_safe_projection',
      'Automotive surfaces consume a typed source/freshness/confidence/availability projection.',
      safeTypes.includes("schemaVersion: 'ecs.automotive-safe.v1'") &&
        safeTypes.includes('actionableStatus: ECSAutomotiveActionableStatus') &&
        safeProjection.includes('buildVehicleAutomotiveSafeProjection') &&
        safeProjection.includes("origin === 'live' || evaluation.freshness !== 'live'"),
      ['lib/automotive/automotiveSafeTypes.ts', 'lib/automotive/automotiveSafeProjection.ts'],
      ['Keep native and reduced-display values sourced from the canonical automotive projection.'],
    ),
    check(
      'resource_safe_runtime_lifecycle',
      'Heavy Vehicle Display state runs only for an open reduced display or connected head unit.',
      coordinator.includes("owners.has('vehicle_display_route')") &&
        coordinator.includes('androidAutoBridge.getStatus().isConnected') &&
        coordinator.includes('carPlayBridge.getStatus().isConnected') &&
        androidBridge.includes('AppState.addEventListener') &&
        carPlayBridge.includes('AppState.addEventListener'),
      ['lib/automotive/automotiveRuntimeCoordinator.ts', 'lib/androidAutoBridge.ts', 'lib/carPlayBridge.ts'],
      ['Retain deterministic foreground/background, connect/disconnect, and owner cleanup.'],
    ),
    check(
      'bounded_semantic_updates',
      'Bridge and native template updates are throttled and semantic-deduplicated.',
      updatePolicy.includes('shouldPublishAutomotiveState') &&
        updatePolicy.includes('shouldPublishAutomotiveLocation') &&
        androidBridge.includes('BACKGROUND_DATA_PUSH_INTERVAL_MS = 30_000') &&
        androidBridge.includes('MINIMUM_DATA_PUSH_INTERVAL_MS = 5_000') &&
        androidBridge.includes('_schedulePendingDataPush') &&
        carPlayBridge.includes('BACKGROUND_DATA_PUSH_INTERVAL_MS = 30_000') &&
        carPlayBridge.includes('MINIMUM_DATA_PUSH_INTERVAL_MS = 5_000') &&
        carPlayBridge.includes('_schedulePendingDataPush') &&
        vehicleStore.includes('VEHICLE_DISPLAY_UI_HEARTBEAT_MS = 60_000') &&
        vehicleStore.includes('payload === _lastPersistedPayload') &&
        carPlayController.includes('guard nextSignature != lastPayloadSignature'),
      ['lib/automotive/automotiveUpdatePolicy.ts', 'lib/vehicleDisplayStore.ts', 'plugins/carplay/src/ECSCarPlayInterfaceController.swift'],
      ['Keep recording cadence independent from the lower-frequency automotive presentation cadence.'],
    ),
    check(
      'automotive_rollout_fails_closed',
      'Reduced display and both bridges default off and require native capability plus evidence.',
      registry.includes("id: 'automotive_vehicle_display'") &&
        registry.includes("id: 'android_auto_bridge'") &&
        registry.includes("id: 'carplay_bridge'") &&
        (registry.match(/defaultEnabled: false/g) ?? []).length >= 3 &&
        registry.includes("relatedReadinessGate: 'gate:automotive-production'"),
      ['lib/features/featureVisibilityRegistry.ts'],
      ['Do not promote automotive features without the matching native and field evidence.'],
    ),
    check(
      'conservative_emergency_contract',
      'Head-unit emergency content is informational and never promises transmission.',
      androidActions.includes('ECS does not contact emergency services') &&
        !androidActions.includes('triggerAction("emergency_comms"') &&
        carPlayActions.includes('emergencyItem.isEnabled = false') &&
        !carPlayActions.includes('handleAction(actionType: "emergency_comms"'),
      ['plugins/android-auto/src/ECSVehicleActionsScreen.kt', 'plugins/carplay/src/ECSCarPlayActionsScreen.swift'],
      ['Keep emergency and exit wording conservative and non-transmitting.'],
    ),
    check(
      'checked_android_sources_match_plugin',
      'Checked Android Auto native sources match the config-plugin source of truth.',
      [
        'ECSAndroidAutoConstants.kt',
        'ECSVehicleMapScreen.kt',
        'ECSVehicleStatusScreen.kt',
        'ECSVehicleWeatherScreen.kt',
        'ECSVehicleActionsScreen.kt',
      ].every((file) => filesMatch(
        root,
        path.join('plugins', 'android-auto', 'src', file),
        path.join('android', 'app', 'src', 'main', 'java', 'com', 'ecs', 'androidauto', file),
      )),
      ['plugins/android-auto/src', 'android/app/src/main/java/com/ecs/androidauto'],
      ['Regenerate or synchronize checked Android native sources before building.'],
    ),
    check(
      'release_contract_documented',
      'Release contract separates simulated checks from real-device evidence.',
      releaseDoc.includes('no frame-rate, memory, CPU, or battery-life improvement is claimed') &&
        releaseDoc.includes('Production promotion still requires') &&
        releaseDoc.includes('default off'),
      ['docs/automotive-driver-safe-release.md'],
      ['Keep evidence and rollout defaults explicit.'],
    ),
    check(
      'android_head_unit_evidence',
      'Android Auto real head-unit lifecycle and stale-source evidence is approved.',
      evidence?.androidHeadUnitPassed === true && evidence?.androidBackgroundLifecyclePassed === true,
      [EVIDENCE_PATH],
      ['Capture Android Auto DHU and physical head-unit connect, route, stale, background, and disconnect evidence.'],
    ),
    check(
      'carplay_head_unit_evidence',
      'CarPlay real head-unit lifecycle and stale-source evidence is approved.',
      evidence?.carPlayHeadUnitPassed === true && evidence?.carPlayBackgroundLifecyclePassed === true,
      [EVIDENCE_PATH],
      ['Capture CarPlay simulator and physical head-unit connect, route, stale, background, and disconnect evidence.'],
    ),
    check(
      'driver_distraction_and_owner_acceptance',
      'Driver-distraction, safety/privacy, and owner acceptance are recorded.',
      evidence?.driverDistractionReviewAccepted === true &&
        evidence?.sourceLabelParityPassed === true &&
        evidence?.batteryProfilePassed === true &&
        evidence?.ownerAccepted === true,
      [EVIDENCE_PATH],
      ['Record driver-distraction review, source-label parity, real-device battery profiling, and owner acceptance.'],
    ),
  ];

  const failed = checks.filter((item) => !item.passed);
  return {
    system: 'ecs_automotive_surfaces',
    checkedAt: new Date().toISOString(),
    passed: failed.length === 0,
    status: failed.length === 0 ? 'production_ready' : 'blocked',
    checks,
    blockers: failed.map((item) => item.id),
    remediation: Array.from(new Set(failed.flatMap((item) => item.remediation))),
    evidencePath: EVIDENCE_PATH.replace(/\\/g, '/'),
    simulatedVerificationOnly: true,
  };
}

export function formatAutomotiveProductionReadinessResult(result) {
  const lines = [
    `ECS automotive production readiness: ${result.passed ? 'Production ready' : 'Blocked for production'}`,
    `Simulated verification only: ${result.simulatedVerificationOnly ? 'yes' : 'no'}`,
    '',
    'Checks:',
    ...result.checks.map((item) => `- ${item.label}: ${item.passed ? 'pass' : 'blocked'}`),
  ];
  if (result.remediation.length > 0) {
    lines.push('', 'Next evidence/actions:', ...result.remediation.map((item) => `- ${item}`));
  }
  return `${lines.join('\n')}\n`;
}

async function main() {
  const result = buildAutomotiveProductionReadinessResult();
  process.stdout.write(process.argv.includes('--json')
    ? `${JSON.stringify(result, null, 2)}\n`
    : formatAutomotiveProductionReadinessResult(result));
  const outcome = classifyEvidenceCheckOutcome({
    passed: result.passed,
    blockerIds: result.blockers,
    externalBlockerIds: EXTERNAL_AUTOMOTIVE_BLOCKER_IDS,
  });
  const laneExitCode = writeEvidenceCheckResultForLane({
    checkId: 'automotive-release-evidence',
    status: outcome.status,
    safeCode: outcome.safeCode,
    blockerIds: outcome.blockerIds,
    summary: outcome.status === 'passed'
      ? 'Automotive release evidence is complete.'
      : outcome.status === 'blocked_external'
        ? 'Automotive release evidence remains incomplete.'
        : 'Automotive release verification failed an internal safety or runtime contract check.',
    evidence: result,
    diagnostics: {
      artifactId: 'automotive-production-evidence',
      domainStatus: result.status,
      resultCount: result.checks.length,
      failedCount: result.blockers.length,
    },
  });
  if (laneExitCode !== null) return laneExitCode;
  return result.passed ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code)).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
