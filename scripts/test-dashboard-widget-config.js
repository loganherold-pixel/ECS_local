const fs = require('fs');
const path = require('path');
const assert = require('assert');

const registryPath = path.join(__dirname, '..', 'lib', 'widgetRegistry.ts');
const source = fs.readFileSync(registryPath, 'utf8');
const navigateSurfaceSource = fs.readFileSync(
  path.join(__dirname, '..', 'components', 'dashboard', 'NavigateSurfaceWidget.tsx'),
  'utf8',
);
const widgetGridSource = fs.readFileSync(
  path.join(__dirname, '..', 'components', 'dashboard', 'WidgetGrid.tsx'),
  'utf8',
);
const dashboardStoreSource = fs.readFileSync(
  path.join(__dirname, '..', 'lib', 'dashboardStore.ts'),
  'utf8',
);
const widgetLibrarySource = fs.readFileSync(
  path.join(__dirname, '..', 'components', 'dashboard', 'WidgetLibrary.tsx'),
  'utf8',
);
const widgetRenderersSource = fs.readFileSync(
  path.join(__dirname, '..', 'components', 'dashboard', 'WidgetRenderers.tsx'),
  'utf8',
);
const dashboardSource = fs.readFileSync(
  path.join(__dirname, '..', 'app', '(tabs)', 'dashboard.tsx'),
  'utf8',
);
const dockIconsSource = fs.readFileSync(
  path.join(__dirname, '..', 'components', 'DockIcons.tsx'),
  'utf8',
);
const missionBriefCadLogSource = fs.readFileSync(
  path.join(__dirname, '..', 'components', 'dashboard', 'MissionBriefCadLog.tsx'),
  'utf8',
);
const widgetLibraryManagerSource = fs.readFileSync(
  path.join(__dirname, '..', 'components', 'dashboard', 'WidgetLibraryManager.tsx'),
  'utf8',
);
const expeditionTabSource = fs.readFileSync(
  path.join(__dirname, '..', 'components', 'dashboard', 'ExpeditionTab.tsx'),
  'utf8',
);
const incidentRecoveryPanelSource = fs.readFileSync(
  path.join(__dirname, '..', 'components', 'dashboard', 'IncidentRecoveryPanel.tsx'),
  'utf8',
);
const expeditionSummaryCardSource = fs.readFileSync(
  path.join(__dirname, '..', 'components', 'dashboard', 'ExpeditionSummaryCard.tsx'),
  'utf8',
);
const expeditionPlaceholderModalSource = fs.readFileSync(
  path.join(__dirname, '..', 'components', 'dashboard', 'ExpeditionPlaceholderModal.tsx'),
  'utf8',
);
const expeditionAvailabilitySource = fs.readFileSync(
  path.join(__dirname, '..', 'lib', 'expedition', 'availability.ts'),
  'utf8',
);
const expeditionSelectorsSource = fs.readFileSync(
  path.join(__dirname, '..', 'lib', 'expedition', 'selectors.ts'),
  'utf8',
);
const expeditionTypesSource = fs.readFileSync(
  path.join(__dirname, '..', 'lib', 'types', 'expedition.ts'),
  'utf8',
);
const expeditionFrameworkStoreSource = fs.readFileSync(
  path.join(__dirname, '..', 'stores', 'expeditionFrameworkStore.ts'),
  'utf8',
);
const incidentRecoveryContainerStateSource = fs.readFileSync(
  path.join(__dirname, '..', 'lib', 'incidentRecoveryContainerState.ts'),
  'utf8',
);
const incidentRecoveryWorkflowStoreSource = fs.readFileSync(
  path.join(__dirname, '..', 'lib', 'incidentRecoveryWorkflowStore.ts'),
  'utf8',
);
const incidentRecoveryContextAdapterSource = fs.readFileSync(
  path.join(__dirname, '..', 'lib', 'incidentRecoveryContextAdapter.ts'),
  'utf8',
);
const reportIncidentModalSource = fs.readFileSync(
  path.join(__dirname, '..', 'components', 'dashboard', 'ReportIncidentModal.tsx'),
  'utf8',
);
const containerSafetySuiteSource = fs.readFileSync(
  path.join(__dirname, 'test-incident-recovery-container-safety-suite.js'),
  'utf8',
);
const safetyChecklistModalSource = fs.readFileSync(
  path.join(__dirname, '..', 'components', 'dashboard', 'SafetyChecklistModal.tsx'),
  'utf8',
);
const ecsAssessmentModalSource = fs.readFileSync(
  path.join(__dirname, '..', 'components', 'dashboard', 'ECSAssessmentModal.tsx'),
  'utf8',
);
const communicationPacketModalSource = fs.readFileSync(
  path.join(__dirname, '..', 'components', 'dashboard', 'CommunicationPacketModal.tsx'),
  'utf8',
);
const incidentTimelineModalSource = fs.readFileSync(
  path.join(__dirname, '..', 'components', 'dashboard', 'IncidentTimelineModal.tsx'),
  'utf8',
);
const resolveDebriefModalSource = fs.readFileSync(
  path.join(__dirname, '..', 'components', 'dashboard', 'ResolveDebriefModal.tsx'),
  'utf8',
);
const incidentCommunicationPacketSource = fs.readFileSync(
  path.join(__dirname, '..', 'lib', 'incidentCommunicationPacket.ts'),
  'utf8',
);
const recoveryIncidentAgentSource = fs.readFileSync(
  path.join(__dirname, '..', 'lib', 'ai', 'recoveryIncidentAgent.ts'),
  'utf8',
);

function extractCatalogWidgetIds() {
  const match = source.match(/export const DASHBOARD_WIDGET_CATALOG:[\s\S]*?= \[(.*?)\] as const;/ms);
  if (!match) {
    throw new Error('Unable to locate DASHBOARD_WIDGET_CATALOG in widgetRegistry.ts');
  }
  return extractPickerEnabledCatalogBlocks().map((block) => {
    const idMatch = block.match(/widgetId:\s*'([^']+)'/);
    if (!idMatch) {
      throw new Error(`Unable to locate widgetId in picker-enabled catalog block:\n${block}`);
    }
    return idMatch[1];
  });
}

function extractDefaultSlotIds(mode) {
  const match = source.match(
    new RegExp(`export const DEFAULT_DASHBOARD_LAYOUTS[\\s\\S]*?${mode}: \\{[\\s\\S]*?slots: \\[(.*?)\\][\\s\\S]*?\\}`, 'ms'),
  );
  if (!match) {
    throw new Error(`Unable to locate default layout block for "${mode}"`);
  }
  return Array.from(match[1].matchAll(/widgetId: '([^']+)'/g)).map((result) => result[1]);
}

function extractDefaultSlots(mode) {
  const match = source.match(
    new RegExp(`export const DEFAULT_DASHBOARD_LAYOUTS[\\s\\S]*?${mode}: \\{[\\s\\S]*?slots: \\[(.*?)\\][\\s\\S]*?\\}`, 'ms'),
  );
  if (!match) {
    throw new Error(`Unable to locate default layout block for "${mode}"`);
  }
  return Array.from(match[1].matchAll(/widgetId: '([^']+)', widgetSize: '([^']+)'/g)).map((result) => ({
    widgetId: result[1],
    widgetSize: result[2],
  }));
}

function extractCatalogPriorities() {
  return extractPickerEnabledCatalogBlocks().map((block) => {
    const priorityMatch = block.match(/priority:\s*(\d+)/);
    if (!priorityMatch) {
      throw new Error(`Unable to locate priority in picker-enabled catalog block:\n${block}`);
    }
    return Number(priorityMatch[1]);
  });
}

function extractPickerEnabledCatalogBlocks() {
  const match = source.match(/export const DASHBOARD_WIDGET_CATALOG:[\s\S]*?= \[(.*?)\] as const;/ms);
  if (!match) {
    throw new Error('Unable to locate DASHBOARD_WIDGET_CATALOG in widgetRegistry.ts');
  }
  return match[1]
    .split(/\n\s*\},\s*\n\s*\{/)
    .map((block, index, blocks) => {
      const prefix = index === 0 ? '' : '{';
      const suffix = index === blocks.length - 1 ? '' : '}';
      return `${prefix}${block}${suffix}`;
    })
    .filter((block) => /pickerEnabled:\s*true/.test(block));
}

function extractDashboardBodyTabs() {
  const match = dashboardSource.match(/const tabs:[\s\S]*?=\s*\[([\s\S]*?)\];/m);
  if (!match) {
    throw new Error('Unable to locate dashboard body tab configuration.');
  }
  return Array.from(match[1].matchAll(/\{\s*key:\s*'([^']+)',\s*label:\s*'([^']+)'/g)).map((result) => ({
    key: result[1],
    label: result[2],
  }));
}

function extractRegistryWidgetBlock(widgetId) {
  const match = source.match(new RegExp(`\\{\\s*widget_id: '${widgetId}',[\\s\\S]*?\\n\\s*\\},`, 'm'));
  if (!match) {
    throw new Error(`Unable to locate widget registry block for "${widgetId}".`);
  }
  return match[0];
}

const curatedIds = extractCatalogWidgetIds();
const expeditionDefaults = extractDefaultSlotIds('expedition');
const legacyHighwayDefaults = extractDefaultSlotIds('highway');
const legacyHighwayDefaultSlots = extractDefaultSlots('highway');
const priorities = extractCatalogPriorities().sort((a, b) => a - b);
const dashboardBodyTabs = extractDashboardBodyTabs();
const removedStandaloneWidgets = [
  'progress',
  'route-progress',
  'hwy-forward-weather',
  'hwy-daylight-remaining',
  'hwy-sun-glare',
  'hwy-wind-monitor',
  'hwy-road-hazards',
  'hwy-power-monitor',
  'remoteness',
  'route-confidence',
  'vehicle-telemetry',
  'sustainability',
];

assert.strictEqual(curatedIds.length, 8, 'Dashboard library must expose exactly 8 consolidated curated widgets.');
assert.strictEqual(new Set(curatedIds).size, curatedIds.length, 'Curated widget IDs must remain unique.');
assert.deepStrictEqual(priorities, [1, 2, 3, 4, 5, 6, 7, 8], 'Dashboard widget priorities must remain a complete 1-8 ranking.');
assert.strictEqual(expeditionDefaults.length, 1, 'Expedition defaults must stay focused on one command surface.');
assert.ok(
  expeditionDefaults.includes('attitude-command'),
  'Expedition defaults must include Attitude Command.',
);
assert.deepStrictEqual(
  expeditionDefaults,
  ['attitude-command'],
  'Expedition defaults must use the locked Attitude Command widget system.',
);
assert.strictEqual(legacyHighwayDefaults.length, 2, 'Legacy Highway widget defaults must stay at exactly two consolidated widgets.');
assert.deepStrictEqual(
  legacyHighwayDefaults,
  ['vehicle-systems', 'navigate-surface'],
  'Legacy Highway widget defaults must collapse to Vehicle Systems and Navigate Surface.',
);
assert.deepStrictEqual(
  legacyHighwayDefaultSlots,
  [
    { widgetId: 'vehicle-systems', widgetSize: '1x1' },
    { widgetId: 'navigate-surface', widgetSize: '2x1' },
  ],
  'Legacy Highway defaults must keep Vehicle Systems compact and Navigate Surface wide.',
);
for (const removedWidgetId of removedStandaloneWidgets) {
  assert.ok(
    !curatedIds.includes(removedWidgetId),
    `Removed standalone widget "${removedWidgetId}" must not be offered in the Dashboard widget picker.`,
  );
}
for (const [oldId, replacementId] of [
  ['progress', 'navigate-surface'],
  ['route-progress', 'navigate-surface'],
  ['hwy-forward-weather', 'attitude-command'],
  ['hwy-daylight-remaining', 'hwy-elevation-profile'],
  ['hwy-sun-glare', 'hwy-elevation-profile'],
  ['hwy-wind-monitor', 'hwy-elevation-profile'],
  ['hwy-road-hazards', 'hwy-elevation-profile'],
  ['hwy-power-monitor', 'ecs-power'],
  ['remoteness', 'vehicle-systems'],
  ['route-confidence', 'vehicle-systems'],
  ['vehicle-telemetry', 'vehicle-systems'],
  ['sustainability', 'vehicle-systems'],
]) {
  assert.ok(
    source.includes(`'${oldId}': '${replacementId}'`) || source.includes(`${oldId}: '${replacementId}'`),
    `Removed widget "${oldId}" must migrate to "${replacementId}".`,
  );
}

assert.deepStrictEqual(
  dashboardBodyTabs,
  [
    { key: 'widgets', label: 'WIDGETS' },
    { key: 'brief', label: 'ECS BRIEF' },
    { key: 'expedition', label: 'EXPEDITION' },
  ],
  'Dashboard body tabs must appear in order: Widgets, ECS Brief, Expedition.',
);
assert.ok(
  dashboardSource.includes("<DiscoverIcon color={isActive ? tab.accent : palette.textMuted} size={13} />") &&
    dockIconsSource.includes('// DISCOVER — Three Mountain Peaks') &&
    dockIconsSource.includes("'peak-left'") &&
    dockIconsSource.includes("'peak-main'") &&
    dockIconsSource.includes("'peak-right'") &&
    !dockIconsSource.includes("transform: [{ rotate: '180deg' }]"),
  'Dashboard Expedition tab must use the clean three-mountain icon without skewed rotated triangle rendering.',
);
assert.ok(
  !dashboardSource.includes('add-circle-outline') &&
    !dashboardSource.includes('libraryManagerBtn') &&
    !dashboardSource.includes('libraryManagerPlaceholder') &&
    !dashboardSource.includes('onOpenLibraryManager') &&
    dashboardSource.includes('tabControlsSection') &&
    dashboardSource.includes('dashboardExpandBtn') &&
    dashboardSource.includes('width: 34'),
  'Dashboard tab controls must not render the tiny add/plus button or reserve its old spacing.',
);
assert.ok(
  dashboardSource.includes("type DashboardTab = 'widgets' | 'brief' | 'expedition'"),
  'DashboardTab union must include Widgets, ECS Brief, and Expedition only.',
);
assert.ok(
    !dashboardBodyTabs.some((tab) => tab.key === 'highway' || tab.label === 'HIGHWAY') &&
    !dashboardSource.includes("label: 'HIGHWAY'") &&
    !dashboardSource.includes("activeTab === 'highway'") &&
    !dashboardSource.includes("dashboardTab: 'highway'") &&
    !dashboardSource.includes('dashboard-tab-highway'),
  'Highway must not remain a standalone dashboard body tab or active dashboard panel state.',
);
assert.ok(
  dashboardSource.includes("dashboardTab: 'widgets'") &&
    dashboardSource.includes("const activeProfile: DashboardProfile = dashboardProfileForTab(activeTab)") &&
    dashboardSource.includes("return 'expedition';") &&
    dashboardSource.includes("dashboardStore.setLastSelectedTab('expedition')"),
  'Widgets must hydrate through the old Expedition profile key without creating a new settings namespace.',
);
assert.ok(
  dashboardSource.includes("uiState.dashboardTab === 'expedition'") &&
    !dashboardSource.includes("uiState.dashboardTab === 'highway'"),
  'Legacy persisted dashboard tab state must route to Widgets without preserving Highway as a selectable tab.',
);
assert.ok(
  dashboardSource.includes('const DASHBOARD_WIDGET_FRAME_EDGE_MARGIN = 2') &&
    dashboardSource.includes('const dashboardFrameInsetLeft = Math.max(') &&
    dashboardSource.includes('insets.left + DASHBOARD_WIDGET_FRAME_EDGE_MARGIN') &&
    dashboardSource.includes('const dashboardFrameInsetRight = Math.max(') &&
    dashboardSource.includes('insets.right + DASHBOARD_WIDGET_FRAME_EDGE_MARGIN') &&
    dashboardSource.includes('paddingLeft: dashboardFrameInsetLeft') &&
    dashboardSource.includes('paddingRight: dashboardFrameInsetRight') &&
    !dashboardSource.includes('paddingHorizontal: dashboardFrameEdgePadding'),
  'Dashboard widget frame should sit 2px from the screen edge while preserving side safe-area insets.',
);
assert.ok(
  source.includes('if (!isCuratedDashboardWidget(w.widget_id)) return false;') &&
    !source.includes('isWidgetsModeHighwayWidget'),
  'Widget Manager must only admit curated Dashboard widgets.',
);
assert.ok(
  curatedIds.includes('expedition-status-summary'),
  'Dashboard widget catalog must expose the Expedition Status Summary widget.',
);
assert.ok(
  curatedIds.includes('expedition-readiness'),
  'Dashboard widget catalog must expose the Expedition Readiness widget.',
);
assert.ok(
  curatedIds.includes('attitude-command'),
  'Dashboard widget catalog must expose the full-size Attitude Command widget.',
);
const attitudeCommandCatalogBlock = source.match(/widgetId: 'attitude-command'[\s\S]*?pickerEnabled: true,/m)?.[0] ?? '';
assert.ok(
  attitudeCommandCatalogBlock.includes("recommendedWidgetSize: '2x2'") &&
    attitudeCommandCatalogBlock.includes("supportedWidgetSizes: ['2x2']") &&
    attitudeCommandCatalogBlock.includes('userResizable: false'),
  'Attitude Command must be a fixed largest-size 2x2 dashboard widget.',
);
const attitudeCommandRegistryBlock = source.match(/widget_id: 'attitude-command'[\s\S]*?widget_status: 'active',/m)?.[0] ?? '';
assert.ok(
  attitudeCommandRegistryBlock.includes('core_instrument: true'),
  'Attitude Command must remain a core instrument registry entry.',
);
{
  const replacementAllowlist = source.match(/export const ATTITUDE_COMMAND_REPLACEMENT_WIDGET_IDS:[\s\S]*?\] as const;/m)?.[0] ?? '';
  assert.ok(
    replacementAllowlist.includes("'attitude-command'") &&
      replacementAllowlist.includes("'navigate-surface'") &&
      !replacementAllowlist.includes("'expedition-readiness'") &&
      !replacementAllowlist.includes("'ecs-power'") &&
      !replacementAllowlist.includes("'hwy-elevation-profile'"),
    'Attitude Command 2x2 replacement picker must only allow Attitude Command and Navigation Command.',
  );
  assert.ok(
    source.includes("const ATTITUDE_COMMAND_REPLACEMENT_LABELS") &&
      source.includes("'navigate-surface': 'Navigation Command'"),
    'Attitude Command replacement picker must label Navigate Surface as Navigation Command.',
  );
  assert.ok(
    source.includes('filterDashboardWidgetPickerEntriesForReplacement') &&
      source.includes("currentWidgetType === 'attitude-command'") &&
      widgetLibrarySource.includes('filterDashboardWidgetPickerEntriesForReplacement(') &&
      widgetLibrarySource.includes('getDashboardWidgetPickerDisplayName(entry.widget_id, intent, currentWidgetType)'),
    'WidgetLibrary must use the Attitude Command replacement allowlist without changing the global widget manager catalog.',
  );
  assert.ok(
    !widgetRenderersSource.includes('onOpenWidgetReplacementPicker?: () => void') &&
      !widgetRenderersSource.includes('const openReplacementPicker = useCallback') &&
      !widgetRenderersSource.includes('onLongPress={openReplacementPicker}') &&
      !widgetRenderersSource.includes('Open Attitude Command replacement picker') &&
      widgetRenderersSource.includes('style={attitudeCommandS.moduleTouchTarget}'),
    'Attitude Command center display must not expose the deprecated long-press replacement picker.',
  );
  assert.ok(
    widgetGridSource.includes("const widgetMenuLongPressEnabled = slot.widgetType !== 'attitude-command'") &&
      !widgetGridSource.includes('onOpenWidgetReplacementPicker?.(slot)') &&
      widgetRenderersSource.includes('accessibilityLabel="Change center module"') &&
      widgetRenderersSource.includes('title="Change Center Module"'),
    'Dashboard must suppress the old Attitude Command long-press widget menu while preserving the Change Center menu.',
  );
  assert.ok(
    widgetRenderersSource.includes('const openModuleSelector = useCallback') &&
      widgetRenderersSource.includes('setModuleSelectorVisible(true)') &&
      widgetRenderersSource.includes('onPress={openModuleSelector}') &&
      widgetRenderersSource.includes('Ionicons name="ellipsis-horizontal"') &&
      widgetRenderersSource.includes('ECS_COMMAND_MODULE_ORDER.map((moduleId)') &&
      widgetRenderersSource.includes('onPress={() => handleSelectCommandModule(moduleId)}') &&
      widgetRenderersSource.includes('ecsCommandModuleStore.setSelectedModule(moduleId)') &&
      widgetRenderersSource.includes("selected ? 'ACTIVE' : 'SELECT'"),
    'Attitude Command ellipsis menu must remain the official Change Center flow and update the center module store.',
  );
  assert.ok(
    fs.readFileSync(path.join(__dirname, '..', 'lib', 'ecsCommandModuleStore.ts'), 'utf8').includes("label: 'Navigation Command'") &&
      fs.readFileSync(path.join(__dirname, '..', 'lib', 'ecsCommandModuleStore.ts'), 'utf8').includes("subtitle: '3D Follow Map'") &&
      fs.readFileSync(path.join(__dirname, '..', 'lib', 'ecsCommandModuleStore.ts'), 'utf8').includes("subtitle: 'Fleet Vehicle Profile'"),
    'Center module registry must expose only the stable Attitude Command and Navigation Command modes.',
  );
  assert.ok(
    !widgetRenderersSource.includes('Replace widget') &&
      !widgetRenderersSource.includes('Change surround') &&
      !widgetRenderersSource.includes('Remove widget'),
    'Change Center menu context must not include deprecated widget-management options.',
  );
  assert.ok(
    widgetRenderersSource.includes("selectedCommandModule === 'attitude' ? (") &&
      widgetRenderersSource.includes('<AttitudeCommandWidgetConnected') &&
      widgetRenderersSource.includes('attitudeStageVehicleImageMode') &&
      widgetRenderersSource.includes('pitchDeg={commandStagePitchDeg}') &&
      widgetRenderersSource.includes('rollDeg={commandStageRollDeg}') &&
      widgetRenderersSource.includes('telemetryEnabled={false}') &&
      widgetRenderersSource.includes("threeDNavigation: ({ mode }) => (") &&
      widgetRenderersSource.includes('<Mini3DFollowMap'),
    'Stable shell center window must render the active Fleet vehicle attitude backdrop, live gauge readouts for Attitude Command, and the 3D follow map for Navigation Command.',
  );
}
assert.ok(
    widgetRenderersSource.includes('const AttitudeCommandWidget') &&
    widgetRenderersSource.includes("case 'attitude-command': return <AttitudeCommandWidget") &&
    widgetRenderersSource.includes('eyebrow="CURRENT WEATHER"') &&
    widgetRenderersSource.includes('eyebrow="REMAINING SUNLIGHT"') &&
    widgetRenderersSource.includes('eyebrow="ROUTE PROGRESS"') &&
    widgetRenderersSource.includes('eyebrow="POWER MONITOR"') &&
    widgetRenderersSource.includes('eyebrow="VEHICLE PROFILE"') &&
    widgetRenderersSource.includes('<TacticalPopupShell'),
  'Attitude Command renderer must compose the attitude surface with weather, daylight, route, power, and vehicle panels.',
);
assert.ok(
  widgetGridSource.includes("slot.widgetType === 'attitude-monitor' || slot.widgetType === 'attitude-command'"),
  'Attitude Command must use the same full-bleed dashboard stage treatment as Attitude Monitor.',
);
assert.ok(
  /case 'attitude-monitor':\s*case 'attitude-command':/.test(widgetGridSource),
  'Attitude Command compact render key must refresh from the same attitude inputs as Attitude Monitor.',
);
assert.ok(
  source.includes('normalizeFixedDashboardWidgetSize') &&
    source.includes("if (widgetId === 'attitude-command') return '2x2';") &&
    source.includes("if (widgetId === 'attitude-monitor' || widgetId === 'navigate-surface') return '2x1';") &&
    source.includes("if (requested === '2x1') return '2x1';") &&
    source.includes("return '1x1';"),
  'Dashboard widget sizing must preserve canonical 1x1, 2x1, and Attitude Command 2x2 footprints.',
);
assert.ok(
  dashboardStoreSource.includes('export function getAvailableSizes(gridLayout: GridLayout): WidgetSize[]') &&
    dashboardStoreSource.includes("const sizes: WidgetSize[] = ['1x1'];") &&
    dashboardStoreSource.includes("if (config.cols >= 2) sizes.push('2x1');") &&
    dashboardStoreSource.includes("if (config.cols >= 2 && config.rows >= 2) sizes.push('2x2');"),
  'Dashboard size picker must offer canonical 1x1, 2x1, and 2x2 widget sizes when the layout can host them.',
);
assert.ok(
  dashboardStoreSource.includes('function canAssignWidgetToDashboardSlot') &&
    dashboardStoreSource.includes('usedRows + requestedRows <= maxRows') &&
    dashboardStoreSource.includes('canAssignWidget(profile: DashboardProfile, slotIndex: number, widgetType: string): boolean'),
  'Dashboard store must reject a third 2x1 or any widget added beside a 2x2 region.',
);
assert.ok(
  widgetLibraryManagerSource.includes('dashboardStore.canAssignWidget') &&
    widgetLibrarySource.includes('dashboardStore.canAssignWidget') &&
    widgetLibraryManagerSource.includes('canonical size') &&
    widgetLibrarySource.includes('cannot host that widget size'),
  'Widget library and manager must filter or explain invalid canonical-size placements.',
);
{
  const vehicleSystemsCatalogBlock = source.match(/widgetId: 'vehicle-systems'[\s\S]*?pickerEnabled: true,/m)?.[0] ?? '';
  assert.ok(
    vehicleSystemsCatalogBlock.includes("recommendedWidgetSize: '1x1'") &&
      vehicleSystemsCatalogBlock.includes("supportedWidgetSizes: ['1x1']") &&
      vehicleSystemsCatalogBlock.includes('userResizable: false') &&
      vehicleSystemsCatalogBlock.includes('remoteness context'),
    'Vehicle Systems must remain a fixed 1x1 systems, telemetry, and remoteness widget.',
  );
  const vehicleSystemsRegistryBlock = extractRegistryWidgetBlock('vehicle-systems');
  assert.ok(
    vehicleSystemsRegistryBlock.includes("default_size: '1x1'"),
    'Vehicle Systems registry entry must never exceed the 1x1 canonical footprint.',
  );
}
{
  const readinessCatalogBlock = source.match(/widgetId: 'expedition-readiness'[\s\S]*?pickerEnabled: true,/m)?.[0] ?? '';
  assert.ok(
    readinessCatalogBlock.includes("recommendedWidgetSize: '1x1'") &&
      readinessCatalogBlock.includes("supportedWidgetSizes: ['1x1', '2x1']") &&
      readinessCatalogBlock.includes('userResizable: true') &&
      readinessCatalogBlock.includes('Expedition Readiness store') &&
      readinessCatalogBlock.includes('without recalculating readiness in the widget'),
    'Expedition Readiness must be a compact picker widget backed by the canonical readiness store.',
  );
  const readinessRegistryBlock = extractRegistryWidgetBlock('expedition-readiness');
  assert.ok(
    readinessRegistryBlock.includes("default_size: '1x1'") &&
      readinessRegistryBlock.includes("supports_modes: ['expedition']") &&
      readinessRegistryBlock.includes("data_provides: ['readiness_score', 'readiness_status', 'readiness_concern', 'source_freshness']") &&
      readinessRegistryBlock.includes('core_instrument: true') &&
      readinessRegistryBlock.includes("widget_status: 'active'"),
    'Expedition Readiness must be a render-ready Expedition mission widget.',
  );
  assert.ok(
    widgetRenderersSource.includes("case 'expedition-readiness'") &&
      widgetRenderersSource.includes('ExpeditionReadinessWidget') &&
      widgetRenderersSource.includes('onOpenBrief={options?.onOpenCommandBrief}'),
    'Expedition Readiness must render through the shared widget renderer with Command Brief handoff.',
  );
  assert.ok(
    widgetGridSource.includes("slot.widgetType === 'expedition-readiness'") &&
      widgetGridSource.includes('onOpenCommandBrief?.()'),
    'Expedition Readiness widget taps must open the Command Brief without duplicating readiness logic.',
  );
}
{
  const powerCatalogBlock = source.match(/widgetId: 'ecs-power'[\s\S]*?pickerEnabled: true,/m)?.[0] ?? '';
  assert.ok(
    powerCatalogBlock.includes("recommendedWidgetSize: '2x1'") &&
      powerCatalogBlock.includes("supportedWidgetSizes: ['2x1', '1x1']") &&
      powerCatalogBlock.includes('userResizable: true'),
    'Power Systems must default to 2x1 while retaining the 1x1 fallback.',
  );
}
{
  const elevationCatalogBlock = source.match(/widgetId: 'hwy-elevation-profile'[\s\S]*?pickerEnabled: true,/m)?.[0] ?? '';
  assert.ok(
      elevationCatalogBlock.includes("recommendedWidgetSize: '2x1'") &&
      elevationCatalogBlock.includes("supportedWidgetSizes: ['2x1']") &&
      elevationCatalogBlock.includes('userResizable: false') &&
      elevationCatalogBlock.includes('wind, daylight, and sun-glare'),
    'Elevation and Terrain must be a fixed 2x1 merged terrain, wind, daylight, and sun-glare widget.',
  );
}
{
  const block = extractRegistryWidgetBlock('expedition-status-summary');
  assert.ok(
    block.includes("category: 'mission'") &&
      block.includes("supports_modes: ['expedition']") &&
      block.includes('render_ready: true') &&
      block.includes("widget_status: 'active'"),
    'Expedition Status Summary must remain a render-ready Expedition mission widget.',
  );
}
assert.ok(
  widgetLibraryManagerSource.includes("getDashboardLibraryWidgets(advancedModeEnabled, 'expedition')") &&
    widgetLibraryManagerSource.includes("const profile: DashboardProfile = 'expedition'") &&
    !widgetLibraryManagerSource.includes('highwayWidgets'),
  'Widget Manager must use the Expedition-backed Widgets library and must not keep a separate Highway widget group.',
);
const expeditionPlaceholderIndex = dashboardSource.indexOf('showExpeditionPlaceholderTab && !layoutMode');
const expeditionTabIndex = dashboardSource.indexOf('<ExpeditionTab');
const widgetGridIndex = dashboardSource.indexOf('<WidgetGrid');
assert.ok(
  expeditionPlaceholderIndex !== -1 &&
    expeditionTabIndex !== -1 &&
    widgetGridIndex !== -1 &&
    expeditionPlaceholderIndex < widgetGridIndex &&
    expeditionTabIndex < widgetGridIndex,
  'New Expedition tab must render its scaffold before the widget grid branch.',
);
for (const label of [
  'Overview',
  'Route',
  'Convoy',
  'Camp',
  'Logistics',
  'Vehicles',
]) {
  assert.ok(expeditionTabSource.includes(label), `Expedition scaffold must include "${label}".`);
}
assert.ok(
  expeditionSummaryCardSource.includes('Expedition Summary'),
  'Expedition Summary card must include its visible label.',
);
for (const label of [
  'Incident & Recovery',
]) {
  assert.ok(incidentRecoveryPanelSource.includes(label), `Incident & Recovery panel must include "${label}".`);
}
for (const label of [
  'Report Incident',
  'Safety Checklist',
  'ECS Assessment',
  'Communication Packet',
  'Timeline',
  'Resolve / Debrief',
]) {
  assert.ok(incidentRecoveryPanelSource.includes(label), `Incident & Recovery panel must include "${label}".`);
  assert.ok(expeditionPlaceholderModalSource.includes(label), `Expedition placeholder modal must support "${label}".`);
}
assert.ok(
  !incidentRecoveryPanelSource.includes('AI Assessment') &&
    incidentRecoveryPanelSource.includes('buildIncidentRecoveryContainerState') &&
    incidentRecoveryContainerStateSource.includes("headline: 'No active incident'") &&
    expeditionTabSource.includes('isLogisticsEnabled(frameworkState)') &&
    expeditionTabSource.includes('isVehiclesEnabled(frameworkState)') &&
    expeditionSummaryCardSource.includes('disabled={!enabled}'),
  'Expedition scaffold must use ECS Assessment, render live incident container state, keep constant tools active, and disable Summary until completion.',
);
assert.ok(
  expeditionTypesSource.includes("export type RouteLifecycleState = 'idle' | 'active' | 'ended' | 'completed'") &&
    expeditionTypesSource.includes('export type ExpeditionAvailabilityState') &&
    expeditionTypesSource.includes('hasActiveExpedition: boolean') &&
    expeditionTypesSource.includes('teamMemberCount: number') &&
    expeditionTypesSource.includes('hasRouteCamps: boolean') &&
    expeditionTypesSource.includes('export type ExpeditionTopCardKey') &&
    expeditionTypesSource.includes('export type ExpeditionUnreadState') &&
    expeditionTypesSource.includes('lastViewedAtByCard') &&
    expeditionTypesSource.includes('export type ExpeditionFrameworkState') &&
    expeditionTypesSource.includes('topCardUnreadCounts') &&
    expeditionTypesSource.includes('topCardLastViewedAt') &&
    expeditionTypesSource.includes('expeditionSummaryAvailable') &&
    expeditionTypesSource.includes('incidentDraftData') &&
    expeditionTypesSource.includes("export type IncidentPanelState") &&
    expeditionTypesSource.includes("'noActiveExpedition'") &&
    expeditionTypesSource.includes("'activeIncident'") &&
    expeditionTypesSource.includes('export type ExpeditionIncidentState') &&
    expeditionTypesSource.includes("incidentStatusLabel?: 'In Progress' | 'Ended'"),
  'Expedition types must expose route lifecycle, top-card state inputs, unread state, and incident panel state.',
);
assert.ok(
  expeditionAvailabilitySource.includes('overviewEnabled: hasActiveExpedition') &&
    expeditionAvailabilitySource.includes('routeEnabled: hasActiveExpedition') &&
    expeditionAvailabilitySource.includes('convoyEnabled: state.teamMemberCount >= 2') &&
    expeditionAvailabilitySource.includes('campEnabled: hasActiveExpedition && state.hasRouteCamps === true') &&
    expeditionAvailabilitySource.includes('logisticsEnabled: true') &&
    expeditionAvailabilitySource.includes('vehiclesEnabled: true') &&
    expeditionAvailabilitySource.includes('resolveExpeditionIncidentPanelState') &&
    expeditionAvailabilitySource.includes("panelState: 'noActiveExpedition'") &&
    expeditionAvailabilitySource.includes("panelState: 'clear'") &&
    expeditionAvailabilitySource.includes("panelState: 'activeIncident'") &&
    expeditionAvailabilitySource.includes("panelState: 'incidentEnded'") &&
    expeditionAvailabilitySource.includes('isExpeditionSummaryEnabled') &&
    expeditionAvailabilitySource.includes("routeLifecycleState === 'ended' || routeLifecycleState === 'completed'"),
  'Expedition availability helpers must derive top-card and incident panel rules.',
);
for (const snippet of [
  'export function isOverviewEnabled',
  'export function isRouteEnabled',
  'export function isConvoyEnabled',
  'export function isCampEnabled',
  'export function isLogisticsEnabled',
  'export function isVehiclesEnabled',
  'export function isExpeditionSummaryEnabled',
  'export function getIncidentPanelState',
  'export function getVisibleUnreadCount',
  'return isTopCardEnabled(state, cardKey) && unreadCount > 0 ? unreadCount : 0',
]) {
  assert.ok(expeditionSelectorsSource.includes(snippet), `Expedition selectors must include snippet: ${snippet}`);
}
for (const snippet of [
  "disabled={!card.enabled}",
  'card.enabled && badgeCount > 0',
  "Start navigation to enable",
  "Team required",
  "No camps on active route",
  "markTopCardViewed(card.id)",
  "useSyncExternalStore",
  "cardUnreadBadge",
  'accessibilityState={{ disabled: !card.enabled',
]) {
  assert.ok(expeditionTabSource.includes(snippet), `Expedition cards must include disabled/active behavior snippet: ${snippet}`);
}
for (const snippet of [
  'export function createDefaultExpeditionFrameworkState',
  'export function getExpeditionFrameworkState',
  'export function subscribeExpeditionFrameworkState',
  'export function setRouteLifecycleState',
  'export function setTeamMemberCount',
  'export function setHasRouteCamps',
  'export function markTopCardViewed',
  'export function publishExpeditionCardUpdate',
  'export function setUnreadCount',
  'export function clearUnreadCount',
  'export function resetExpeditionFrameworkState',
  'topCardLastViewedAt',
  'publishedAt <= lastViewedAt',
  '[cardKey]: 0',
]) {
  assert.ok(expeditionFrameworkStoreSource.includes(snippet), `Expedition unread store must include helper snippet: ${snippet}`);
}
for (const snippet of [
  'getExpeditionIncidentSignalState',
  'subscribeExpeditionIncidentSignalState',
  'setExpeditionIncidentSignalState',
  'publishLocalIncident',
  'endLocalIncident',
  'clearLocalIncident',
]) {
  assert.ok(expeditionFrameworkStoreSource.includes(snippet), `Expedition framework store must include incident helper snippet: ${snippet}`);
}
for (const snippet of [
  "dispatchEventStore.subscribe",
  "incidentRecoveryWorkflowStore.subscribe",
  "subscribeIncidentRecoveryContext",
  "getIncidentRecoveryContextSnapshot",
  "incidents: workflowIncidents",
  "contextSnapshot: incidentContextSnapshot",
  "buildIncidentRecoveryContainerState",
  "setReportModalVisible(true)",
  "setSafetyModalVisible(true)",
  "setAssessmentModalVisible(true)",
  "setPacketModalVisible(true)",
  "setTimelineModalVisible(true)",
  "setResolveDebriefModalVisible(true)",
  "generateECSAssessment",
  "generateCommunicationPacket",
  "convoySummary: incidentContextSnapshot.summary?.convoySummary",
  "vehicleSummary: incidentContextSnapshot.summary?.vehicleSummary",
  "logisticsSummary: incidentContextSnapshot.summary?.logisticsSummary",
  "logCommunicationPacketCopied",
  "addTimelineNote",
  "addLocationUpdate",
  "resolveIncident",
  "saveIncidentDebrief",
  "copy.tone === 'clear'",
  "copy.tone === 'activeIncident'",
  "showIncidentDetails",
  "width: '31%'",
  'accessibilityRole="button"',
]) {
  assert.ok(incidentRecoveryPanelSource.includes(snippet), `Incident & Recovery panel must include state behavior snippet: ${snippet}`);
}
for (const snippet of [
  'getIncidentRecoveryContextSnapshot',
  'subscribeIncidentRecoveryContext',
  'deriveIncidentCommunicationStatusFromContext',
  'getIncidentRecoveryContextDefaultResources',
  'routeStore.getActive',
  'navigateRouteSessionStore.getSnapshot',
  'teamStore.getSnapshot',
  'getActiveVehicleContext',
  'connectivity.getDetailedState',
  'communityHazardReportRequiresUserAction: true',
]) {
  assert.ok(incidentRecoveryContextAdapterSource.includes(snippet), `Incident Recovery context adapter must include snippet: ${snippet}`);
}
for (const snippet of [
  "No active incident",
  "Route monitoring active",
  "getActiveIncidentContext",
  "getRecommendedActionForIncidentStatus",
  "Prepare Communication Packet and keep Timeline current",
  "Log conservative status updates only",
  "Confirm location, communication, and Timeline",
  "activeIncident.recoveryAssessment?.recommendedAction ??",
]) {
  assert.ok(incidentRecoveryContainerStateSource.includes(snippet), `Incident & Recovery state adapter must include snippet: ${snippet}`);
}
assert.ok(
  incidentRecoveryContainerStateSource.includes('function buildNoActiveIncidentState') &&
    incidentRecoveryContainerStateSource.includes("displayMode: 'no_incident'") &&
    incidentRecoveryContainerStateSource.includes("activeIncident: null"),
  'Incident container state must provide a no-active-incident fallback without active incident data.',
);
for (const snippet of [
  'reportIncident(input: ReportIncidentInput)',
  'saveSafetyChecklist(input: SafetyChecklistInput)',
  'generateECSAssessment(input: ECSAssessmentInput)',
  'generateCommunicationPacket(input: CommunicationPacketInput)',
  'logCommunicationPacketCopied(input: CommunicationPacketCopyInput)',
  'addTimelineNote(input: IncidentTimelineNoteInput)',
  'addLocationUpdate(input: IncidentLocationUpdateInput)',
  'logTimelineEvent(input: IncidentTimelineLogInput)',
  'resolveIncident(input: ResolveIncidentInput)',
  'saveIncidentDebrief(input: IncidentDebriefInput)',
  'transitionIncidentStatus(input: IncidentStatusTransitionInput)',
  'canTransitionIncidentStatus',
  'INCIDENT_STATUS_TRANSITIONS',
  "active: ['stabilizing', 'cancelled']",
  "resolved: ['closed']",
  "return safetyConcern ? 'stabilizing' : 'active'",
  "severity: 'unknown'",
  "title: 'Incident created'",
  "title: complete ? 'Safety check completed' : 'Safety check updated'",
  "recommendedAction: 'Complete safety checklist'",
  "recommendedAction: 'Run ECS assessment'",
  "recommendedAction: 'Prepare Communication Packet'",
  "title: 'ECS assessment generated'",
  "'communication packet generated'",
  "'communication packet copied'",
  "title: 'incident resolved'",
  "title: 'debrief created'",
  "recommendedAction: 'Complete debrief'",
  "communityHazardReportRequested",
  "routeConfidenceAdjustmentRequested",
  "incidentRecoveryContext: input.contextSnapshot",
  "routeId: input.routeId ?? input.contextSnapshot?.route?.routeId",
  "source: 'expedition_incident_container'",
]) {
  assert.ok(incidentRecoveryWorkflowStoreSource.includes(snippet), `Report Incident workflow store must include snippet: ${snippet}`);
}
for (const label of [
  'Vehicle stuck',
  'Vehicle breakdown',
  'Medical / safety concern',
  'Route blocked',
  'Lost / off-route',
  'Separated party',
  'Weather hazard',
  'Environmental hazard',
  'Fuel / water / supply issue',
  'Communication failure',
  'Camp safety',
  'Wildlife',
  'Security',
  'Other',
  'Immediate safety',
  'Location',
  'Communications',
  'Vehicle / environment / logistics',
  'Submit Incident',
]) {
  assert.ok(reportIncidentModalSource.includes(label), `Report Incident modal must include "${label}".`);
}
for (const snippet of [
  'Use current GPS',
  'Last known location',
  'manualLocationDescription',
  "communicationStatus",
  "vehicleDisabled",
  "missingCriticalData",
  "contextSnapshot",
  "deriveIncidentCommunicationStatusFromContext",
  "getIncidentRecoveryContextDefaultResources",
]) {
  assert.ok(
    reportIncidentModalSource.includes(snippet) || incidentRecoveryWorkflowStoreSource.includes(snippet),
    `Report Incident pipeline must include snippet: ${snippet}`,
  );
}
assert.ok(
  incidentRecoveryPanelSource.includes('ReportIncidentModal') &&
    incidentRecoveryPanelSource.includes('SafetyChecklistModal') &&
    incidentRecoveryPanelSource.includes('ECSAssessmentModal') &&
    incidentRecoveryPanelSource.includes('CommunicationPacketModal') &&
    incidentRecoveryPanelSource.includes('IncidentTimelineModal') &&
    incidentRecoveryPanelSource.includes('ResolveDebriefModal') &&
    incidentRecoveryPanelSource.includes('onPress={() => handleActionPress(action)}') &&
    incidentRecoveryPanelSource.includes('gpsLocation={gpsLocation}'),
  'Report Incident, Safety Checklist, ECS Assessment, Communication Packet, Timeline, and Resolve / Debrief must launch workflow modals from the Incident & Recovery container buttons.',
);
for (const label of [
  'Everyone accounted for',
  'Injuries assessed',
  'Active hazards identified',
  'Location captured',
  'Vehicle stability assessed',
  'Communications checked',
  'Weather and daylight reviewed',
  'Emergency escalation threshold reviewed',
  'Create incident if risk found',
  'Escalation triggers',
  'Save Checklist',
]) {
  assert.ok(safetyChecklistModalSource.includes(label), `Safety Checklist modal must include "${label}".`);
}
for (const snippet of [
  "activeIncident?.id",
  "createIncidentIfRiskFound",
  "Stabilize people, location, communication, and hazards before assessment or recovery planning.",
]) {
  assert.ok(safetyChecklistModalSource.includes(snippet), `Safety Checklist modal must include snippet: ${snippet}`);
}
for (const snippet of [
  "RECOVERY_INCIDENT_AGENT_ID",
  "RECOVERY_INCIDENT_AGENT_PROMPT",
  "runRecoveryIncidentAgent",
  "Prioritize human safety",
  "Avoid overconfident",
  "Do not replace emergency services",
  "structured output",
  "Do not enter floodwater or unstable terrain.",
]) {
  assert.ok(recoveryIncidentAgentSource.includes(snippet), `Recovery & Incident Agent must include snippet: ${snippet}`);
}
for (const label of [
  'ECS Assessment',
  'RECOVERY & INCIDENT AGENT',
  'Immediate safety assessment',
  'Next actions',
  'Recommendations',
  'Risks',
  'Missing data',
  'Do not do',
  'Verification steps',
  'Debrief hooks',
]) {
  assert.ok(ecsAssessmentModalSource.includes(label), `ECS Assessment modal must include "${label}".`);
}
for (const snippet of [
  'buildIncidentCommunicationPacket',
  'Emergency services',
  'Professional recovery provider',
  'Convoy members',
  'Trusted contact',
  'unknown',
  'This packet does not replace contacting emergency services',
  'Recommendation: contact emergency services or activate SOS where possible',
]) {
  assert.ok(
    incidentCommunicationPacketSource.includes(snippet),
    `Communication Packet generator must include snippet: ${snippet}`,
  );
}
for (const label of [
  'Communication Packet',
  'Copy Packet',
  'No active incident',
  'Report an incident first',
  'All',
]) {
  assert.ok(communicationPacketModalSource.includes(label), `Communication Packet modal must include "${label}".`);
}
for (const label of [
  'Timeline',
  'Add note',
  'Add Note',
  'Log Location',
  'No active incident',
  'No timeline events',
  'Chronological incident updates',
]) {
  assert.ok(incidentTimelineModalSource.includes(label), `Incident Timeline modal must include "${label}".`);
}
for (const label of [
  'Resolve / Debrief',
  'Resolve incident',
  'How was it resolved?',
  'Was anyone injured?',
  'Was the vehicle damaged?',
  'Was outside assistance used?',
  'Were emergency services contacted?',
  'Incident debrief',
  'What worked',
  'What failed',
  'Planning gaps',
  'Route hazards',
  'Communication issues',
  'Weather or terrain mismatch',
  'Recommendations for future trips',
  'Community hazard report',
  'Route confidence review',
  'Save Debrief',
]) {
  assert.ok(resolveDebriefModalSource.includes(label), `Resolve / Debrief modal must include "${label}".`);
}
for (const snippet of [
  'onResolveIncident',
  'onSaveDebrief',
  'communityHazardReportRequested',
  'routeConfidenceAdjustmentRequested',
  'Nothing is published automatically.',
  'Route scoring is not changed here.',
]) {
  assert.ok(resolveDebriefModalSource.includes(snippet), `Resolve / Debrief modal must include snippet: ${snippet}`);
}
for (const snippet of [
  "case 'reported'",
  "case 'checklist_updated'",
  "case 'assessment_updated'",
  "case 'location_updated'",
  "case 'communication_packet_generated'",
  "case 'communication_packet_copied'",
  "case 'communication_sent'",
  "case 'severity_changed'",
  "case 'status_changed'",
  "case 'assistance_requested'",
  "case 'recovery_attempt_logged'",
  "case 'resolved'",
  "case 'debrief_added'",
  "case 'note'",
  "sort((left, right) => getEventTime(left) - getEventTime(right))",
]) {
  assert.ok(incidentTimelineModalSource.includes(snippet), `Incident Timeline modal must include snippet: ${snippet}`);
}
for (const snippet of [
  'Container no-active-incident state',
  'Flooded crossing and considering driving through.',
  'Convoy member overdue and not responding.',
  'Nothing is published automatically.',
  'setResolveDebriefModalVisible(true)',
]) {
  assert.ok(containerSafetySuiteSource.includes(snippet), `Container safety suite must include snippet: ${snippet}`);
}
for (const snippet of [
  "incidentStatusLabel: 'In Progress'",
  "incidentStatusLabel: 'Ended'",
]) {
  assert.ok(
    expeditionAvailabilitySource.includes(snippet) ||
      expeditionFrameworkStoreSource.includes(snippet) ||
      expeditionTypesSource.includes(snippet),
    `Incident source state must include status snippet: ${snippet}`,
  );
}
assert.ok(
  !expeditionAvailabilitySource.includes('Highway 65 / Mile 214') &&
    !expeditionFrameworkStoreSource.includes('Highway 65 / Mile 214') &&
    !expeditionAvailabilitySource.includes('Minor Collision') &&
    !expeditionFrameworkStoreSource.includes('Minor Collision'),
  'Incident framework must not inject fake incident location or summary defaults.',
);
for (const snippet of [
  'routeLifecycleState: RouteLifecycleState',
  'const enabled = isExpeditionSummaryEnabled({',
  'disabled={!enabled}',
  'Available after route completion',
  'Ready to generate PDF',
  'Summary ready',
  'setSummaryOpened(true)',
  'onOpenSummary();',
  'accessibilityState={{ disabled: !enabled',
]) {
  assert.ok(expeditionSummaryCardSource.includes(snippet), `Expedition Summary card must include gated summary snippet: ${snippet}`);
}
assert.ok(
  expeditionTabSource.includes('<ExpeditionSummaryCard') &&
    expeditionTabSource.includes('routeLifecycleState={frameworkState.routeLifecycleState}') &&
    expeditionTabSource.includes('onOpenSummary={() => setSummaryVisible(true)}') &&
    expeditionTabSource.includes('<ExpeditionDebriefModal') &&
    expeditionTabSource.includes('visible={summaryVisible}'),
  'Expedition Summary card must receive the resolved route lifecycle state and open the summary modal from the Expedition tab.',
);
for (const label of [
  'Overview',
  'Route',
  'Convoy',
  'Camp',
  'Logistics',
  'Vehicles',
  'Expedition Summary',
]) {
  assert.ok(expeditionPlaceholderModalSource.includes(label), `Expedition placeholder modal must support "${label}".`);
}
for (const snippet of [
  'Framework placeholder.',
  'Live ECS data pipeline pending.',
  'Close',
  'PURPOSE_COPY',
  'onClose',
]) {
  assert.ok(expeditionPlaceholderModalSource.includes(snippet), `Expedition placeholder modal must include placeholder behavior snippet: ${snippet}`);
}
for (const snippet of [
  'const [placeholderTitle, setPlaceholderTitle]',
  'setSelectedAssessmentCategory(card.id)',
  'markTopCardViewed(card.id)',
  'onOpenPlaceholder={setPlaceholderTitle}',
  'ExpeditionPlaceholderModal',
]) {
  assert.ok(expeditionTabSource.includes(snippet), `Expedition tab must route active actions and placeholders with snippet: ${snippet}`);
}
assert.ok(
  incidentRecoveryPanelSource.includes('handleActionPress(action)') &&
    incidentRecoveryPanelSource.includes('onOpenPlaceholder(action.label)'),
  'Incident & Recovery action buttons must route through Report Incident modal handling and keep placeholders for the other actions.',
);

assert.ok(
  navigateSurfaceSource.includes('style={[styles.mapRenderer, mapStyle]}'),
  'Navigate Surface must render the live MapRenderer inside the widget.',
);
assert.ok(
  navigateSurfaceSource.includes('...StyleSheet.absoluteFillObject') &&
    navigateSurfaceSource.includes('guidanceContainer'),
  'Navigate Surface map must absolute-fill under a dedicated guidance container.',
);
assert.ok(
  navigateSurfaceSource.includes('bottom: 8') &&
    navigateSurfaceSource.includes("backgroundColor: 'rgba(4,6,8,0.82)'"),
  'Navigate Surface guidance must be anchored as a compact readable bottom rail.',
);
assert.ok(
  navigateSurfaceSource.includes('formatRemainingDistance') &&
    navigateSurfaceSource.includes('formatRemainingDuration') &&
    navigateSurfaceSource.includes('formatEta'),
  'Navigate Surface guidance must include live distance, duration, and ETA fields when available.',
);
assert.ok(
  !navigateSurfaceSource.includes('WidgetCompactRow') &&
    !navigateSurfaceSource.includes('routeMirrorPill') &&
    !navigateSurfaceSource.includes('detailBodyText'),
  'Navigate Surface must not fall back to compact rows or loose/floating guidance text.',
);
assert.ok(
  widgetGridSource.includes('const isNavigateSurfaceFullBleed =\n    isNavigateSurface && !layoutMode;'),
  'Navigate Surface must stay full-bleed in both contracted and expanded widget modes.',
);
assert.ok(
  !widgetGridSource.includes('isNavigateSurface && !layoutMode && !isCompact'),
  'Navigate Surface contracted mode must not be excluded from full-bleed map rendering.',
);
assert.ok(
  navigateSurfaceSource.includes('function CompassRoseButton') &&
    navigateSurfaceSource.includes('accessibilityLabel="Reset map to current location"') &&
    navigateSurfaceSource.includes('setRecenterRequestId((value) => value + 1)') &&
    navigateSurfaceSource.includes('cameraCommandTrigger={recenterRequestId}') &&
    navigateSurfaceSource.includes("interactive={guidanceVariant === 'command3d'}") &&
    navigateSurfaceSource.includes('styles.compassButton'),
  'Navigation Command 3D map must include a bottom-right compass rose button that triggers recenter/follow camera reset while preserving 3D map gestures.',
);
assert.ok(
  navigateSurfaceSource.includes('right: 58') &&
    navigateSurfaceSource.includes('bottom: 10') &&
    navigateSurfaceSource.includes("backgroundColor: 'rgba(2,4,6,0.94)'") &&
    navigateSurfaceSource.includes('<NextTurnStrip snapshot={routeSession} />') &&
    navigateSurfaceSource.includes('<CompassRoseButton headingDeg={headingDeg} onPress={onRecenter} />'),
  'Navigation Command turn-by-turn guidance must sit at the darkened bottom/base of the map and reserve space for the compass.',
);
assert.ok(
  widgetRenderersSource.includes("selectedCommandModule !== 'follow3d' && !commandCenterFrameSelected ? (") &&
    !widgetRenderersSource.includes("selectedCommandModuleStatus.label === 'ROUTE READY'"),
  'Navigation Command must suppress the parent Route Ready status pill without removing other center module controls.',
);

assert.ok(
  dashboardSource.includes('<CommandBriefScreen embedded />'),
  'ECS Brief tab must promote Command Brief as the full-height content surface.',
);
assert.ok(
  !dashboardSource.includes('<MissionBriefCard') &&
    !dashboardSource.includes('briefTabEmptyState') &&
    !dashboardSource.includes('styles.briefTabScroll'),
  'ECS Brief tab must not render the Mission Brief guidance card, standby guidance, or page-level scroll surface.',
);
assert.ok(
  dashboardSource.includes('briefTabSurface') &&
    dashboardSource.includes('briefTabCommandWrap') &&
    dashboardSource.includes('minHeight: 0'),
  'ECS Brief tab must use a fixed flex surface with an internally scrollable Command Brief.',
);
assert.ok(
  missionBriefCadLogSource.includes('fullHeight?: boolean') &&
    missionBriefCadLogSource.includes('fullHeight && styles.fullHeightContainer') &&
    missionBriefCadLogSource.includes('nestedScrollEnabled'),
  'Brief Activity Log must support full-height mode with internal scrolling.',
);

console.log('Dashboard widget configuration checks passed.');
