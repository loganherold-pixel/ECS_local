import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const Module = require('node:module');
const ts = require('typescript');

const RESULT_RELATIVE_PATH = path.join('.smoke', 'dispatch-internal-beta-readiness-result.json');

const SENSITIVE_DEFAULT_OFF_FEATURES = [
  'teamPositionSharing',
  'agencyDataIngestion',
  'externalDispatchIntegration',
  'publicHazardPublishing',
  'automatedSosTransmission',
  'liveRadioNetworkIntegrations',
  'demoData',
];

const RECOVERY_CATEGORIES = [
  'Weather',
  'Terrain',
  'Trail Blockage',
  'Water Crossing',
  'Recovery',
  'Visibility',
  'Other',
];

function pathsFor(root) {
  return {
    smokeDir: path.join(root, '.smoke'),
    resultPath: path.join(root, RESULT_RELATIVE_PATH),
    source: {
      tabLayout: path.join(root, 'app', '(tabs)', '_layout.tsx'),
      dispatchTab: path.join(root, 'app', '(tabs)', 'alert.tsx'),
      commandDock: path.join(root, 'components', 'CommandDock.tsx'),
      commandCenter: path.join(root, 'components', 'dispatch', 'DispatchCadCommandCenter.tsx'),
      modalShell: path.join(root, 'components', 'ECSModalShell.tsx'),
      rolloutConfig: path.join(root, 'lib', 'dispatchRolloutConfig.ts'),
      liveEvents: path.join(root, 'lib', 'dispatchLiveEvents.ts'),
      serviceAdapters: path.join(root, 'lib', 'dispatchServiceAdapters.ts'),
      mockData: path.join(root, 'lib', 'dispatchMockData.ts'),
      profileStore: path.join(root, 'lib', 'dispatchProfileStore.ts'),
    },
  };
}

function readIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

function rel(root, filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/');
}

function boolCheck(id, label, passed, evidence = [], remediation = []) {
  return {
    id,
    label,
    passed: Boolean(passed),
    evidence,
    remediation,
  };
}

function gateResult(id, label, checks, blockerId) {
  const failedChecks = checks.filter((check) => !check.passed);
  return {
    id,
    label,
    passed: failedChecks.length === 0,
    blockerId,
    failedChecks: failedChecks.map((check) => check.id),
    checks,
  };
}

function hasAll(text, patterns) {
  return patterns.every((pattern) => pattern.test(text));
}

function collectDispatchSourceFiles(root) {
  const roots = [
    path.join(root, 'app', '(tabs)', 'alert.tsx'),
    path.join(root, 'app', 'expedition-dispatch.tsx'),
    path.join(root, 'components', 'dispatch'),
    path.join(root, 'lib'),
  ];
  const files = [];
  for (const item of roots) {
    if (!fs.existsSync(item)) continue;
    const stat = fs.statSync(item);
    if (stat.isFile()) {
      files.push(item);
      continue;
    }
    for (const entry of fs.readdirSync(item, { withFileTypes: true })) {
      const fullPath = path.join(item, entry.name);
      if (entry.isFile() && /^dispatch.*\.(?:ts|tsx)$/i.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }
  return Array.from(new Set(files)).sort();
}

function resolveRelativeImport(importer, specifier) {
  if (!specifier.startsWith('.')) return true;
  const base = path.resolve(path.dirname(importer), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mjs`,
    `${base}.cjs`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
    path.join(base, 'index.js'),
    path.join(base, 'index.jsx'),
  ];
  return candidates.some((candidate) => fs.existsSync(candidate));
}

function findMissingRelativeImports(files) {
  const missing = [];
  const importPattern = /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  const dynamicImportPattern = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const filePath of files) {
    const source = readIfExists(filePath);
    for (const pattern of [importPattern, dynamicImportPattern]) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(source))) {
        const specifier = match[1];
        if (specifier.startsWith('.') && !resolveRelativeImport(filePath, specifier)) {
          missing.push({
            file: filePath,
            specifier,
          });
        }
      }
    }
  }
  return missing;
}

function loadTypeScriptModule(root, relativePath) {
  const fullPath = path.join(root, relativePath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: fullPath,
  });
  const mod = new Module(fullPath);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  mod._compile(output.outputText, fullPath);
  return mod.exports;
}

function runTypeScriptProjectCheck(root) {
  try {
    const configPath = ts.findConfigFile(root, ts.sys.fileExists, 'tsconfig.json');
    if (!configPath) {
      return {
        passed: false,
        output: 'tsconfig.json was not found.',
      };
    }
    const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
    if (configFile.error) {
      return {
        passed: false,
        output: ts.formatDiagnosticsWithColorAndContext([configFile.error], {
          getCanonicalFileName: (fileName) => fileName,
          getCurrentDirectory: () => root,
          getNewLine: () => '\n',
        }),
      };
    }
    const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root);
    const program = ts.createProgram(parsedConfig.fileNames, parsedConfig.options);
    const diagnostics = ts.getPreEmitDiagnostics(program);
    const errors = diagnostics.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
    if (errors.length === 0) {
      return {
        passed: true,
        output: '',
      };
    }
    return {
      passed: false,
      output: ts.formatDiagnosticsWithColorAndContext(errors.slice(0, 25), {
        getCanonicalFileName: (fileName) => path.relative(root, fileName).replace(/\\/g, '/'),
        getCurrentDirectory: () => root,
        getNewLine: () => '\n',
      }).slice(-5000),
    };
  } catch (error) {
    return {
      passed: false,
      output: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runLintProjectCheck(root) {
  try {
    const { ESLint } = require('eslint');
    const eslint = new ESLint({ cwd: root });
    const results = await eslint.lintFiles([
      'app/**/*.{ts,tsx}',
      'components/**/*.{ts,tsx}',
      'context/**/*.{ts,tsx}',
      'lib/**/*.{ts,tsx}',
    ]);
    const errorCount = results.reduce((count, result) => count + result.errorCount + result.fatalErrorCount, 0);
    if (errorCount === 0) {
      return {
        passed: true,
        output: '',
      };
    }
    const formatter = await eslint.loadFormatter('stylish');
    return {
      passed: false,
      output: (await formatter.format(results)).trim().slice(-5000),
    };
  } catch (error) {
    return {
      passed: false,
      output: error instanceof Error ? error.message : String(error),
    };
  }
}

function commandSkipResult(reason) {
  return {
    passed: true,
    output: reason,
  };
}

function commandPassResult() {
  return {
    passed: true,
    output: '',
  };
}

function commandFailResult(output) {
  return {
    passed: false,
    output,
  };
}

function normalizeCommandResult(result) {
  if (!result) {
    return commandFailResult('Command did not produce a result.');
  }
  if (result.passed) {
    return commandPassResult();
  }
  return commandFailResult(result.output ?? '');
}

function safeEvidenceOutput(output, fallback) {
  return output ? [output] : [fallback];
}

async function runOptionalLintCheck(root, skipLint, lintAvailable) {
  if (skipLint) {
    return commandSkipResult('Skipped by --skip-lint.');
  }
  if (!lintAvailable) {
    return {
      passed: true,
      output: 'No npm lint script found.',
    };
  }
  return normalizeCommandResult(await runLintProjectCheck(root));
}

function packageHasScript(root, scriptName) {
  try {
    const pkg = JSON.parse(readIfExists(path.join(root, 'package.json')));
    return Boolean(pkg.scripts?.[scriptName]);
  } catch {
    return false;
  }
}

function checkRouteGate(root, paths) {
  const tabSource = readIfExists(paths.source.dispatchTab);
  const layoutSource = readIfExists(paths.source.tabLayout);
  const commandDockSource = readIfExists(paths.source.commandDock);
  const commandCenterExists = fs.existsSync(paths.source.commandCenter);
  const nativeTabRegistration =
    /const alertOptions:\s*BottomTabNavigationOptions\s*=\s*\{\s*title:\s*'Dispatch'\s*\}/.test(layoutSource) &&
    /name="alert"/.test(layoutSource);
  const shellDockRegistration =
    /<Slot\s*\/>/.test(layoutSource) &&
    /key:\s*'alert'/.test(commandDockSource) &&
    /label:\s*'DISPATCH'/.test(commandDockSource) &&
    /route:\s*'\/alert'/.test(commandDockSource);
  const checks = [
    boolCheck(
      'dispatch_tab_route_exists',
      'Dispatch tab route exists under the primary tab graph.',
      fs.existsSync(paths.source.dispatchTab),
      [rel(root, paths.source.dispatchTab)],
      ['Restore app/(tabs)/alert.tsx or update this readiness script to the current Dispatch tab route.'],
    ),
    boolCheck(
      'dispatch_tab_imports_command_center',
      'Dispatch tab imports and renders DispatchCadCommandCenter.',
      commandCenterExists &&
        /DispatchCadCommandCenter/.test(tabSource) &&
        /<DispatchCadCommandCenter\s*\/>/.test(tabSource),
      [rel(root, paths.source.dispatchTab), rel(root, paths.source.commandCenter)],
      ['Wire the primary Dispatch tab to DispatchCadCommandCenter before enabling beta users.'],
    ),
    boolCheck(
      'dispatch_tab_registered_as_dispatch',
      'Tab layout registers the alert route as the visible Dispatch tab.',
      nativeTabRegistration || shellDockRegistration,
      [rel(root, paths.source.tabLayout), rel(root, paths.source.commandDock)],
      ['Keep the visible Dispatch tab registered in app/(tabs)/_layout.tsx, or keep the shell CommandDock alert route labeled DISPATCH.'],
    ),
    boolCheck(
      'dispatch_error_boundary_present',
      'Dispatch tab is wrapped in the tab error boundary.',
      /TabErrorBoundary/.test(tabSource) && /tabName="DISPATCH"/.test(tabSource),
      [rel(root, paths.source.dispatchTab)],
      ['Wrap the Dispatch tab with TabErrorBoundary so beta failures do not crash the whole shell.'],
    ),
  ];
  return gateResult('route_screen', 'Dispatch route/screen gate', checks, 'dispatch_route_screen_gate_failed');
}

function checkModuleGate(root) {
  const files = collectDispatchSourceFiles(root);
  const missing = findMissingRelativeImports(files);
  const checks = [
    boolCheck(
      'dispatch_source_files_discovered',
      'Dispatch source files were discovered for import validation.',
      files.length > 0,
      files.map((file) => rel(root, file)),
      ['Confirm Dispatch files live under app/(tabs), components/dispatch, or lib/dispatch*.ts.'],
    ),
    boolCheck(
      'no_missing_relative_dispatch_imports',
      'No missing relative imports were found in Dispatch source files.',
      missing.length === 0,
      missing.map((item) => `${rel(root, item.file)} -> ${item.specifier}`),
      missing.map((item) => `Create or correct ${item.specifier} imported by ${rel(root, item.file)}.`),
    ),
  ];
  return gateResult('module_imports', 'Dispatch module import gate', checks, 'dispatch_module_import_gate_failed');
}

function checkFeatureFlagGate(root, paths) {
  const rolloutSource = readIfExists(paths.source.rolloutConfig);
  let defaults = {};
  let resolveResult = {};
  let disabledCopyOk = false;
  try {
    const moduleExports = loadTypeScriptModule(root, path.join('lib', 'dispatchRolloutConfig.ts'));
    defaults = moduleExports.DEFAULT_DISPATCH_ROLLOUT_CONFIG ?? {};
    resolveResult = moduleExports.resolveDispatchRolloutConfig?.() ?? {};
    disabledCopyOk = SENSITIVE_DEFAULT_OFF_FEATURES.every((feature) =>
      typeof moduleExports.getDispatchRolloutDisabledCopy?.(feature) === 'string' &&
      moduleExports.getDispatchRolloutDisabledCopy(feature).length > 0
    );
  } catch {
    defaults = {};
    resolveResult = {};
  }

  const defaultOff = SENSITIVE_DEFAULT_OFF_FEATURES.every((feature) =>
    defaults[feature] === false && resolveResult[feature] === false && rolloutSource.includes(feature)
  );

  const checks = [
    boolCheck(
      'central_rollout_config_exists',
      'Central Dispatch rollout config exists.',
      fs.existsSync(paths.source.rolloutConfig),
      [rel(root, paths.source.rolloutConfig)],
      ['Create lib/dispatchRolloutConfig.ts with centralized Dispatch rollout features.'],
    ),
    boolCheck(
      'sensitive_future_systems_default_off',
      'Incomplete/sensitive Dispatch systems default off.',
      defaultOff,
      [rel(root, paths.source.rolloutConfig)],
      [`Set ${SENSITIVE_DEFAULT_OFF_FEATURES.join(', ')} to false by default.`],
    ),
    boolCheck(
      'disabled_copy_present',
      'Disabled feature copy exists for sensitive Dispatch rollout gates.',
      disabledCopyOk,
      [rel(root, paths.source.rolloutConfig)],
      ['Add user-facing disabled copy for every sensitive Dispatch rollout feature.'],
    ),
  ];
  return gateResult('feature_flags', 'Dispatch feature flag gate', checks, 'dispatch_feature_flag_gate_failed');
}

function checkRecoveryGate(root, paths) {
  const commandSource = readIfExists(paths.source.commandCenter);
  const categoryOptionsOk = RECOVERY_CATEGORIES.every((label) => commandSource.includes(`'${label}'`));
  const checks = [
    boolCheck(
      'recovery_action_replaces_more',
      'Primary Dispatch action exposes the Convoy emergency coordinate ping and no primary More action remains.',
      /onEmergencyPing=\{handleRecoveryAssist\}/.test(commandSource) && !/>\s*More\s*<\/Text>/.test(commandSource),
      [rel(root, paths.source.commandCenter)],
      ['Wire the Dispatch Convoy panel emergency ping to Recovery Assist and keep the old More action hidden.'],
    ),
    boolCheck(
      'recovery_action_opens_panel',
      'Emergency coordinate ping uses the Recovery Assist GPS flow.',
      hasAll(commandSource, [
        /onEmergencyPing=\{handleRecoveryAssist\}/,
        /createRecoveryAssistEvent/,
        /getCurrentPosition/,
        /getHazardRecoveryForm/,
        /HazardRecoveryCadEventModal/,
        /title="Recovery CAD Event"/,
      ]),
      [rel(root, paths.source.commandCenter)],
      ['Wire the Dispatch Convoy panel emergency ping to the Recovery Assist GPS flow.'],
    ),
    boolCheck(
      'recovery_categories_present',
      'Recovery panel includes all required hazard/recovery categories.',
      categoryOptionsOk,
      [rel(root, paths.source.commandCenter)],
      [`Include categories: ${RECOVERY_CATEGORIES.join(', ')}.`],
    ),
    boolCheck(
      'local_cad_event_append_present',
      'Recovery submit creates a local CAD event through the Dispatch event store.',
      hasAll(commandSource, [
        /appendEvent/,
        /createRecoveryCadEventFromCurrentGps/,
        /function sourceFromCommand\(command: DispatchCommandType\): DispatchEventSource/,
        /if \(command === 'hazard'\)/,
        /return 'user_report'/,
        /status:\s*'active'/,
      ]),
      [rel(root, paths.source.commandCenter)],
      ['Ensure Recovery submit creates a local/internal CAD event without external publication claims.'],
    ),
  ];
  return gateResult('recovery_action', 'Dispatch Recovery action gate', checks, 'dispatch_recovery_action_gate_failed');
}

function checkEventContractGate(root, paths) {
  let normalized = null;
  try {
    const { normalizeDispatchEvent } = loadTypeScriptModule(root, path.join('lib', 'dispatchLiveEvents.ts'));
    normalized = normalizeDispatchEvent({
      id: 'dispatch-readiness-local-recovery',
      type: 'recovery',
      severity: 'warning',
      title: 'Recovery Assist',
      message: 'Readiness validation event.',
      source: 'user_report',
      createdAt: '2026-05-04T12:00:00.000Z',
      category: 'hazard_recovery',
      hazardType: 'recovery',
      note: 'Short field note.',
      locationStatus: 'Location unavailable: permission denied',
      status: 'Active',
      location: {
        latitude: 39.5,
        longitude: -105.2,
        source: 'current_gps',
      },
      createdBy: {
        displayName: 'Field Lead',
        callsign: 'ECS-1',
      },
      rig: {
        vehicleId: 'vehicle-1',
        label: 'Trail Rig',
      },
    });
  } catch {
    normalized = null;
  }

  const event = normalized && normalized.id ? normalized : null;
  const checks = [
    boolCheck(
      'cad_recovery_event_types_include_required_values',
      'CAD/recovery event type unions include recovery/user report/category/hazard values.',
      hasAll(readIfExists(paths.source.liveEvents), [
        /\|\s*'recovery'/,
        /\|\s*'user_report'/,
        /DispatchEventCategory = 'recovery_assist' \| 'hazard_recovery'/,
        /\|\s*'water_crossing'/,
      ]),
      [rel(root, paths.source.liveEvents)],
      ['Add explicit Dispatch CAD/recovery type values to dispatchLiveEvents.ts.'],
    ),
    boolCheck(
      'local_recovery_event_normalizes',
      'A local Recovery CAD event normalizes with required beta fields.',
      Boolean(
        event &&
        event.id &&
        event.createdAt &&
        event.category === 'hazard_recovery' &&
        event.severity === 'warning' &&
        event.note === 'Short field note.' &&
        /^Location unavailable/.test(event.locationStatus ?? '') &&
        event.source === 'user_report' &&
        event.status === 'Active' &&
        event.createdBy?.callsign === 'ECS-1' &&
        event.rig?.vehicleId === 'vehicle-1'
      ),
      [rel(root, paths.source.liveEvents)],
      ['Fix normalizeDispatchEvent so local Recovery CAD events preserve id, createdAt, category, severity, note, locationStatus, source, status, and minimal identity references.'],
    ),
  ];
  return gateResult('cad_event_contract', 'Dispatch CAD/recovery event contract gate', checks, 'dispatch_cad_event_contract_gate_failed');
}

function checkMockLiveGate(root, paths) {
  const commandSource = readIfExists(paths.source.commandCenter);
  const rolloutSource = readIfExists(paths.source.rolloutConfig);
  const serviceSource = readIfExists(paths.source.serviceAdapters);
  const checks = [
    boolCheck(
      'mock_fixtures_not_live_by_default',
      'Mock/demo Dispatch fixtures are blocked outside explicit development/test mode.',
      hasAll(serviceSource, [
        /DISPATCH_DEV_DATA_ENABLED/,
        /if \(!DISPATCH_DEV_DATA_ENABLED\)/,
        /pings:\s*\[\]/,
        /queueItems:\s*\[\]/,
        /assignments:\s*\[\]/,
        /timelineEvents:\s*\[\]/,
      ]),
      [rel(root, paths.source.serviceAdapters), rel(root, paths.source.mockData)],
      ['Keep mock Dispatch fixtures behind dev/test gates and return empty live-facing collections when disabled.'],
    ),
    boolCheck(
      'local_internal_copy_present',
      'Dispatch copy does not imply external emergency/team/agency transmission when integrations are disabled.',
      hasAll(commandSource, [
        /Local ECS Dispatch report only/,
        /does not contact emergency services/,
        /dispatchSensitiveGateNotice/,
      ]) &&
        /Reports stay local\/internal unless explicitly enabled/.test(rolloutSource),
      [rel(root, paths.source.commandCenter), rel(root, paths.source.rolloutConfig)],
      ['Label local reports honestly and keep external/team/agency claims behind rollout gates.'],
    ),
  ];
  return gateResult('mock_live_ambiguity', 'Dispatch mock/live ambiguity gate', checks, 'dispatch_mock_live_gate_failed');
}

function checkProfileGate(root, paths) {
  const commandSource = readIfExists(paths.source.commandCenter);
  const profileSource = readIfExists(paths.source.profileStore);
  const checks = [
    boolCheck(
      'profile_store_exists',
      'Dispatch profile store exists for minimum operator/vehicle identity.',
      fs.existsSync(paths.source.profileStore) &&
        hasAll(profileSource, [/dispatchProfileStore/, /isDispatchProfileComplete/, /saveProfile/]),
      [rel(root, paths.source.profileStore)],
      ['Create or wire the existing Dispatch profile store before internal beta.'],
    ),
    boolCheck(
      'required_profile_setup_gate_present',
      'First-time Dispatch profile setup gate is present.',
      hasAll(commandSource, [
        /forceProfileSetup/,
        /isDispatchProfileComplete/,
        /requiredSetupMode/,
        /Complete Dispatch Profile/,
        /dispatchProfileStore\.saveProfile/,
      ]),
      [rel(root, paths.source.commandCenter)],
      ['Gate Dispatch identity-dependent behavior until callsign/name and vehicle identity requirements are satisfied.'],
    ),
  ];
  return gateResult('profile_setup', 'Dispatch profile setup gate', checks, 'dispatch_profile_setup_gate_failed');
}

function checkLocationGate(root, paths) {
  const commandSource = readIfExists(paths.source.commandCenter);
  const checks = [
    boolCheck(
      'gps_permission_attempted_on_submit',
      'Recovery flow attempts GPS capture on submit.',
      hasAll(commandSource, [
        /requestForegroundPermissionsAsync/,
        /getCurrentPositionAsync/,
        /Create CAD Event is tapped/,
      ]),
      [rel(root, paths.source.commandCenter)],
      ['Use the existing location capture path when Recovery submit is tapped.'],
    ),
    boolCheck(
      'gps_failure_submits_location_unavailable',
      'Location permission/GPS failure path still creates a local event marked Location unavailable.',
      hasAll(commandSource, [
        /locationUnavailableReason/,
        /Location unavailable/,
        /let gpsFix: RecoveryAssistGpsFix \| null = null/,
        /location:\s*recoveryFix\s*\?/,
      ]),
      [rel(root, paths.source.commandCenter)],
      ['Catch GPS/permission failures and submit the local report with locationStatus instead of blocking the user.'],
    ),
  ];
  return gateResult('location_failure', 'Dispatch location failure gate', checks, 'dispatch_location_failure_gate_failed');
}

function checkModalGate(root, paths) {
  const commandSource = readIfExists(paths.source.commandCenter);
  const modalShellSource = readIfExists(paths.source.modalShell);
  const shellUses = (commandSource.match(/<ECSModalShell\b/g) ?? []).length;
  const checks = [
    boolCheck(
      'ecs_modal_shell_available',
      'Global ECS modal shell exists.',
      fs.existsSync(paths.source.modalShell) &&
        hasAll(modalShellSource, [/ECSModalShellProps/, /overlayClass/, /ECSShellTexture/]),
      [rel(root, paths.source.modalShell)],
      ['Restore ECSModalShell or document an approved local Dispatch modal equivalent.'],
    ),
    boolCheck(
      'dispatch_modals_use_ecs_shell',
      'Dispatch active modals use the ECS modal shell.',
      /import ECSModalShell/.test(commandSource) &&
        shellUses >= 4 &&
        /overlayClass="editor"/.test(commandSource),
      [rel(root, paths.source.commandCenter)],
      ['Route Dispatch protocol, reference, Recovery, and profile modals through ECSModalShell.'],
    ),
  ];
  return gateResult('modal_style', 'Dispatch modal style gate', checks, 'dispatch_modal_style_gate_failed');
}

async function checkCommandGate(root, options) {
  const skipTypecheck = options.skipTypecheck === true;
  const skipLint = options.skipLint === true;
  const typecheck = skipTypecheck
    ? commandSkipResult('Skipped by --skip-typecheck.')
    : normalizeCommandResult(runTypeScriptProjectCheck(root));
  const lintAvailable = packageHasScript(root, 'lint');
  const lint = await runOptionalLintCheck(root, skipLint, lintAvailable);

  const checks = [
    boolCheck(
      'typescript_passes',
      'TypeScript passes.',
      typecheck.passed,
      safeEvidenceOutput(typecheck.output, 'npx tsc --noEmit --pretty false'),
      ['Fix TypeScript errors before treating Dispatch as internal beta ready.'],
    ),
    boolCheck(
      'lint_passes_if_available',
      'Lint passes if an npm lint script is available.',
      lint.passed,
      safeEvidenceOutput(lint.output, lintAvailable ? 'npm run lint' : 'No npm lint script found.'),
      ['Fix lint errors before treating Dispatch as internal beta ready, or document why lint is unavailable.'],
    ),
  ];
  return gateResult('static_commands', 'Dispatch TypeScript/lint gate', checks, 'dispatch_static_command_gate_failed');
}

function dispatchStatusFor(gates) {
  const allPassed = gates.every((gate) => gate.passed);
  return allPassed ? 'internal_beta_ready' : 'blocked_pending_dispatch_remediation';
}

function statusLabelFor(status) {
  if (status === 'internal_beta_ready') {
    return 'Internal beta ready; not public or closed-field-test ready';
  }
  return 'Blocked pending Dispatch remediation';
}

export async function buildDispatchInternalBetaReadinessResult(options = {}) {
  const root = options.rootDir ?? process.cwd();
  const now = options.now instanceof Date ? options.now : new Date();
  const paths = pathsFor(root);
  const gates = [
    checkRouteGate(root, paths),
    checkModuleGate(root),
    checkFeatureFlagGate(root, paths),
    checkRecoveryGate(root, paths),
    checkEventContractGate(root, paths),
    checkMockLiveGate(root, paths),
    checkProfileGate(root, paths),
    checkLocationGate(root, paths),
    checkModalGate(root, paths),
    await checkCommandGate(root, options),
  ];
  const failedGates = gates.filter((gate) => !gate.passed);
  const status = dispatchStatusFor(gates);
  const blockers = Array.from(new Set(failedGates.map((gate) => gate.blockerId)));
  const remediation = failedGates.flatMap((gate) =>
    gate.checks
      .filter((check) => !check.passed)
      .flatMap((check) => check.remediation.map((item) => `${gate.id}/${check.id}: ${item}`))
  );

  return {
    passed: failedGates.length === 0,
    status,
    statusLabel: statusLabelFor(status),
    internalBetaReady: failedGates.length === 0,
    closedFieldTestReady: false,
    publicReleaseReady: false,
    checkedAt: now.toISOString(),
    gates,
    blockers,
    remediation,
    notes: [
      'This gate only evaluates Dispatch internal beta readiness.',
      'Closed-field-test readiness still requires Android/device QA evidence, privacy/storage approval, provider/source validation, and explicit product/safety/privacy/engineering risk acceptance.',
      'Public release readiness is intentionally false; sensitive Dispatch integrations remain default-off.',
    ],
  };
}

export function writeDispatchInternalBetaReadinessResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const { smokeDir, resultPath } = pathsFor(root);
  fs.mkdirSync(smokeDir, { recursive: true });
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return resultPath;
}

export function formatDispatchInternalBetaReadinessResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const lines = [
    `Dispatch internal beta readiness: ${result.statusLabel}`,
    `Result file: ${path.relative(root, pathsFor(root).resultPath).replace(/\\/g, '/')}`,
    `Checked at: ${result.checkedAt}`,
    `Internal beta ready: ${result.internalBetaReady ? 'yes' : 'no'}`,
    `Closed field test ready: ${result.closedFieldTestReady ? 'yes' : 'no'}`,
    `Public release ready: ${result.publicReleaseReady ? 'yes' : 'no'}`,
    '',
    'Dispatch gates:',
  ];

  for (const gate of result.gates) {
    lines.push(`- ${gate.label}: ${gate.passed ? 'pass' : 'blocked'}`);
    for (const check of gate.checks.filter((item) => !item.passed)) {
      lines.push(`  - ${check.id}: ${check.label}`);
      for (const item of check.remediation) lines.push(`    remediation: ${item}`);
    }
  }

  if (result.blockers.length > 0) {
    lines.push('', 'Active blockers:');
    for (const blocker of result.blockers) lines.push(`- ${blocker}`);
  }

  if (result.remediation.length > 0) {
    lines.push('', 'Remediation:');
    for (const item of result.remediation) lines.push(`- ${item}`);
  }

  lines.push('', 'Notes:');
  for (const note of result.notes) lines.push(`- ${note}`);
  return `${lines.join('\n')}\n`;
}

export async function runDispatchInternalBetaReadinessCli(options = {}) {
  const root = options.rootDir ?? process.cwd();
  const args = options.args ?? process.argv.slice(2);
  const stdout = options.stdout ?? process.stdout;
  const jsonOnly = args.includes('--json');
  const result = await buildDispatchInternalBetaReadinessResult({
    rootDir: root,
    skipTypecheck: args.includes('--skip-typecheck'),
    skipLint: args.includes('--skip-lint'),
  });
  writeDispatchInternalBetaReadinessResult(result, { rootDir: root });
  if (jsonOnly) stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else stdout.write(formatDispatchInternalBetaReadinessResult(result, { rootDir: root }));
  return result.passed ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runDispatchInternalBetaReadinessCli()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
