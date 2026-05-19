import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const RESULT_RELATIVE_PATH = path.join('.smoke', 'incident-recovery-production-readiness-result.json');
const EVIDENCE_RELATIVE_PATH = path.join('.smoke', 'incident-recovery-production-evidence.json');

function relPath(root, filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/');
}

function readIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

function normalize(source) {
  return source.replace(/\r\n/g, '\n');
}

function readJsonIfExists(filePath) {
  try {
    return JSON.parse(readIfExists(filePath));
  } catch {
    return null;
  }
}

function check(id, label, passed, evidence = [], remediation = []) {
  return { id, label, passed: Boolean(passed), evidence, remediation };
}

function evidenceTrue(evidence, key) {
  return evidence?.[key] === true;
}

function accepted(value) {
  return String(value ?? '').trim().toLowerCase() === 'accepted';
}

export function buildIncidentRecoveryProductionReadinessResult(options = {}) {
  const root = options.rootDir ?? process.cwd();
  const paths = {
    result: path.join(root, RESULT_RELATIVE_PATH),
    evidence: path.join(root, EVIDENCE_RELATIVE_PATH),
    workflowStore: path.join(root, 'lib', 'incidentRecoveryWorkflowStore.ts'),
    containerState: path.join(root, 'lib', 'incidentRecoveryContainerState.ts'),
    panel: path.join(root, 'components', 'dashboard', 'IncidentRecoveryPanel.tsx'),
    reportModal: path.join(root, 'components', 'dashboard', 'ReportIncidentModal.tsx'),
    resolveDebriefModal: path.join(root, 'components', 'dashboard', 'ResolveDebriefModal.tsx'),
    recoveryAgent: path.join(root, 'lib', 'ai', 'recoveryIncidentAgent.ts'),
    dispatchCad: path.join(root, 'components', 'dispatch', 'DispatchCadCommandCenter.tsx'),
    dispatchLiveEvents: path.join(root, 'lib', 'dispatchLiveEvents.ts'),
    compassData: path.join(root, 'lib', 'navigation', 'recoveryHazardCompassData.ts'),
    compassWidget: path.join(root, 'components', 'dashboard', 'commandCenter', 'RecoveryHazardCompass.tsx'),
    compassHook: path.join(root, 'components', 'dashboard', 'commandCenter', 'useRecoveryHazardCompassData.ts'),
  };

  const evidence = readJsonIfExists(paths.evidence);
  const workflowStore = readIfExists(paths.workflowStore);
  const containerState = readIfExists(paths.containerState);
  const panel = readIfExists(paths.panel);
  const reportModal = readIfExists(paths.reportModal);
  const resolveDebriefModal = readIfExists(paths.resolveDebriefModal);
  const recoveryAgent = readIfExists(paths.recoveryAgent);
  const dispatchCad = readIfExists(paths.dispatchCad);
  const dispatchLiveEvents = readIfExists(paths.dispatchLiveEvents);
  const compassData = readIfExists(paths.compassData);
  const compassWidget = readIfExists(paths.compassWidget);
  const compassHook = readIfExists(paths.compassHook);
  const normalizedWorkflowStore = normalize(workflowStore);

  const checks = [
    check(
      'incident_workflow_tracks_missing_data_and_timeline',
      'Incident workflow tracks missing critical data, recommended next action, communication packet, and timeline state.',
      workflowStore.includes('buildMissingCriticalData') &&
        workflowStore.includes('buildChecklistMissingCriticalData') &&
        workflowStore.includes("title: 'Incident created'") &&
        workflowStore.includes("recommendedAction: 'Complete safety checklist'") &&
        workflowStore.includes("recommendedAction: 'Run ECS assessment'") &&
        workflowStore.includes('generateCommunicationPacket') &&
        workflowStore.includes('logCommunicationPacketCopied') &&
        workflowStore.includes('transitionIncidentStatus') &&
        workflowStore.includes('resolveIncident') &&
        workflowStore.includes('saveIncidentDebrief') &&
        containerState.includes('getRecommendedActionForIncidentStatus') &&
        containerState.includes('communicationPacketGenerated') &&
        panel.includes('setReportModalVisible(true)') &&
        panel.includes('setSafetyModalVisible(true)') &&
        panel.includes('setAssessmentModalVisible(true)') &&
        panel.includes('setPacketModalVisible(true)') &&
        panel.includes('setTimelineModalVisible(true)') &&
        panel.includes('setResolveDebriefModalVisible(true)'),
      [relPath(root, paths.workflowStore), relPath(root, paths.containerState), relPath(root, paths.panel)],
      ['Keep Incident & Recovery workflow state explicit, chronological, and centered on missing critical data before recovery action.'],
    ),
    check(
      'safety_agent_blocks_unsafe_tactical_recovery',
      'Recovery assessment blocks unsafe tactical recovery detail and prioritizes safety, location, communication, and escalation.',
      recoveryAgent.includes('Refuse unsafe tactical detail') &&
        recoveryAgent.includes('floodwater') &&
        recoveryAgent.includes('dangerous rigging') &&
        recoveryAgent.includes('Do not enter floodwater or unstable terrain.') &&
        recoveryAgent.includes('Do not provide or follow detailed rigging instructions') &&
        recoveryAgent.includes('communicationPacket') &&
        recoveryAgent.includes('doNotDo') &&
        recoveryAgent.includes('missingData') &&
        workflowStore.includes('doNotDo') &&
        workflowStore.includes('structuredOutput'),
      [relPath(root, paths.recoveryAgent), relPath(root, paths.workflowStore)],
      ['Do not let AI or deterministic assessment provide hazardous rigging, floodwater, fire, unstable-terrain, or trapped-person tactical instructions.'],
    ),
    check(
      'incident_reporting_and_debrief_do_not_publish_automatically',
      'Incident report/debrief captures community hazard intent without automatically publishing or implying external transmission.',
      reportModal.includes('Last known location') &&
        resolveDebriefModal.includes('Incident debrief') &&
        resolveDebriefModal.includes('Community hazard report') &&
        resolveDebriefModal.includes('Nothing is published automatically.') &&
        resolveDebriefModal.includes('communityHazardReportRequested') &&
        workflowStore.includes('const communityHazardRequested = input.communityHazardReportRequested === true') &&
        workflowStore.includes('const routeConfidenceRequested = input.routeConfidenceAdjustmentRequested === true') &&
        workflowStore.includes('communityHazardPublicationStatus') &&
        workflowStore.includes('communityHazardRequiresManualReview') &&
        workflowStore.includes('communityHazardPublished: false') &&
        workflowStore.includes('routeConfidenceReviewStatus') &&
        workflowStore.includes('routeConfidenceChanged: false') &&
        normalizedWorkflowStore.includes("metadata: {\n      ...(incident.metadata ?? {})"),
      [relPath(root, paths.reportModal), relPath(root, paths.resolveDebriefModal), relPath(root, paths.workflowStore)],
      ['Keep report/debrief local unless a separately reviewed publishing workflow explicitly submits the data.'],
    ),
    check(
      'dispatch_recovery_cad_is_local_and_gps_tolerant',
      'Dispatch recovery CAD reports are local/user-reported, tolerate missing GPS, and only map-drilldown with valid coordinates.',
      dispatchCad.includes('Recovery CAD Event') &&
        dispatchCad.includes('createRecoveryCadEventFromCurrentGps') &&
        dispatchCad.includes('Location status: ${locationStatus}') &&
        dispatchCad.includes('Source: User Report') &&
        dispatchCad.includes('Local ECS Dispatch report only') &&
        dispatchCad.includes('requiresMapDrilldown: !!recoveryFix') &&
        dispatchCad.includes("event.source === 'user_report'") &&
        !dispatchCad.includes('GPS fix required before Recovery CAD event can be created.') &&
        dispatchLiveEvents.includes("'user_report'") &&
        dispatchLiveEvents.includes("return 'User Report'"),
      [relPath(root, paths.dispatchCad), relPath(root, paths.dispatchLiveEvents)],
      ['Keep recovery CAD submissions from implying emergency-service contact or external sync; location unavailable must remain an honest local report state.'],
    ),
    check(
      'recovery_compass_labels_live_cached_offline_and_hazard_state',
      'Recovery/Hazard Compass labels live, cached, offline, route drift, recovery target, and nearest hazard state.',
      compassData.includes('normalizeRecoveryHazardCompassData') &&
        compassData.includes('explicitRecoveryTarget') &&
        compassData.includes('offlineCachedHazards') &&
        compassData.includes('routeDriftLevel') &&
        compassData.includes('nearestHazard') &&
        compassData.includes('isUsingCachedData') &&
        compassData.includes("if (params.isOffline) return 'offline'") &&
        compassData.includes("if (params.isUsingCachedData) return 'partial'") &&
        compassWidget.includes('Field Recovery Intelligence') &&
        compassWidget.includes('Recovery intelligence limited') &&
        compassWidget.includes('Offline cached') &&
        compassWidget.includes('Cached data') &&
        compassWidget.includes('Live data') &&
        compassHook.includes('connectivity.isOffline()') &&
        compassHook.includes('offlineCachedHazards'),
      [relPath(root, paths.compassData), relPath(root, paths.compassWidget), relPath(root, paths.compassHook)],
      ['Keep recovery compass degraded/offline/cached states visible and never imply live GPS/hazard certainty when data is stale or unavailable.'],
    ),
    check(
      'android_incident_recovery_visual_evidence_present',
      'Android Incident & Recovery workflow visual evidence is recorded.',
      evidenceTrue(evidence, 'androidIncidentRecoveryVisualQaPassed'),
      [relPath(root, paths.evidence)],
      ['Capture Android report incident, safety checklist, ECS assessment, packet, timeline, resolve/debrief, and compact-screen evidence.'],
    ),
    check(
      'real_coordinate_packet_evidence_present',
      'Real coordinate packet generation/copy/share evidence is recorded.',
      evidenceTrue(evidence, 'realCoordinatePacketEvidencePassed'),
      [relPath(root, paths.evidence)],
      ['Exercise GPS available, GPS unavailable, cached/last-known, and manual location coordinate packet paths on device.'],
    ),
    check(
      'dispatch_recovery_cad_device_evidence_present',
      'Dispatch recovery CAD local report and emergency coordinate ping device evidence is recorded.',
      evidenceTrue(evidence, 'dispatchRecoveryCadDeviceEvidencePassed'),
      [relPath(root, paths.evidence)],
      ['Validate Dispatch recovery CAD submit, missing-GPS fallback, map drilldown only with coordinates, and convoy emergency coordinate ping behavior.'],
    ),
    check(
      'offline_cached_recovery_compass_evidence_present',
      'Offline/cached Recovery/Hazard Compass evidence is recorded.',
      evidenceTrue(evidence, 'offlineCachedRecoveryCompassEvidencePassed'),
      [relPath(root, paths.evidence)],
      ['Capture live, estimated, cached, offline, route drift, nearest hazard, and no-location compass states on Android.'],
    ),
    check(
      'production_owner_decision_accepted',
      'Production owner decision is accepted for Incident & Recovery.',
      accepted(evidence?.productionDecision),
      [relPath(root, paths.evidence)],
      ['Record product, engineering, field-ops, safety, privacy/security, QA, and support acceptance after field/device evidence is complete.'],
    ),
  ];

  const failed = checks.filter((item) => !item.passed);
  return {
    passed: failed.length === 0,
    status: failed.length === 0 ? 'production_ready' : 'blocked',
    statusLabel: failed.length === 0 ? 'Production ready' : 'Blocked for production',
    checkedAt: new Date().toISOString(),
    system: 'incident_recovery_emergency_workflows',
    checks,
    blockers: failed.map((item) => item.id),
    remediation: failed.flatMap((item) => item.remediation),
    notes: [
      'This gate separates Incident & Recovery code readiness from Android/device and real coordinate workflow evidence.',
      'Recovery intelligence must prioritize safety, location, communication, and escalation before vehicle extraction planning.',
      'Local recovery CAD reports and community-hazard debrief intent must not imply emergency-service contact or automatic publishing.',
    ],
  };
}

export function writeIncidentRecoveryProductionReadinessResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const resultPath = path.join(root, RESULT_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(resultPath), { recursive: true });
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return resultPath;
}

export function formatIncidentRecoveryProductionReadinessResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const lines = [
    `Incident & Recovery production readiness: ${result.statusLabel}`,
    `Result file: ${relPath(root, path.join(root, RESULT_RELATIVE_PATH))}`,
    `Checked at: ${result.checkedAt}`,
    `Production ready: ${result.passed ? 'yes' : 'no'}`,
    '',
    'Checks:',
  ];
  for (const item of result.checks) lines.push(`- ${item.label}: ${item.passed ? 'pass' : 'blocked'}`);
  if (result.blockers.length > 0) {
    lines.push('', 'Active blockers:');
    for (const blocker of result.blockers) lines.push(`- ${blocker}`);
  }
  if (result.remediation.length > 0) {
    lines.push('', 'Next actions:');
    for (const item of Array.from(new Set(result.remediation))) lines.push(`- ${item}`);
  }
  lines.push('', 'Notes:');
  for (const note of result.notes) lines.push(`- ${note}`);
  return `${lines.join('\n')}\n`;
}

async function main() {
  const jsonOnly = process.argv.includes('--json');
  const result = buildIncidentRecoveryProductionReadinessResult();
  writeIncidentRecoveryProductionReadinessResult(result);
  if (jsonOnly) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else process.stdout.write(formatIncidentRecoveryProductionReadinessResult(result));
  return result.passed ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code)).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
