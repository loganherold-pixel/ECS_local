const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const widgetGrid = fs.readFileSync(path.join(root, 'components/dashboard/WidgetGrid.tsx'), 'utf8');
const widgetRenderers = fs.readFileSync(path.join(root, 'components/dashboard/WidgetRenderers.tsx'), 'utf8');
const widgetChrome = fs.readFileSync(path.join(root, 'components/dashboard/WidgetChrome.tsx'), 'utf8');
const navigateSurfaceWidget = fs.readFileSync(path.join(root, 'components/dashboard/NavigateSurfaceWidget.tsx'), 'utf8');
const mapRenderer = fs.readFileSync(path.join(root, 'components/navigate/MapRenderer.tsx'), 'utf8');
const navigateRouteSessionStore = fs.readFileSync(path.join(root, 'lib/navigateRouteSessionStore.ts'), 'utf8');
const vehicleAttitudeStage = fs.readFileSync(path.join(root, 'src/features/attitude/components/VehicleAttitudeStage.tsx'), 'utf8');
const widgetRegistry = fs.readFileSync(path.join(root, 'lib/widgetRegistry.ts'), 'utf8');
const dashboardSource = fs.readFileSync(path.join(root, 'app/(tabs)/dashboard.tsx'), 'utf8');
const managePopover = fs.readFileSync(path.join(root, 'components/dashboard/WidgetManagePopover.tsx'), 'utf8');
const commandModuleStore = fs.readFileSync(path.join(root, 'lib/ecsCommandModuleStore.ts'), 'utf8');
const commandCenterRegistry = fs.readFileSync(path.join(root, 'components/dashboard/commandCenter/commandCenterRegistry.ts'), 'utf8');
const commandWidgetStart = widgetRenderers.indexOf('const AttitudeCommandWidget');
const commandWidgetEnd = widgetRenderers.indexOf('}, (prev, next) => (', commandWidgetStart);
const commandWidgetSource =
  commandWidgetStart >= 0 && commandWidgetEnd > commandWidgetStart
    ? widgetRenderers.slice(commandWidgetStart, commandWidgetEnd)
    : '';

function assert(condition, message) {
  if (!condition) {
    console.error(`[dashboard-attitude-command-interactions] ${message}`);
    process.exit(1);
  }
}

for (const fileName of [
  'Remaining_Sunlight_Dawn.png',
  'Remaining_Sunlight_Day.png',
  'Remaining_Sunlight_Dusk.png',
  'Remaining_Sunlight_Night.png',
]) {
  assert(
    fs.existsSync(path.join(root, 'assets', 'sunlight', fileName)),
    `Remaining Sunlight background asset ${fileName} must be bundled under assets/sunlight.`,
  );
  assert(
    widgetRenderers.includes(fileName),
    `Remaining Sunlight background asset ${fileName} must be statically required by WidgetRenderers.`,
  );
}

for (const fileName of [
  'Jeep_Wrangler_Vehicle_Profile.png',
  'Jeep_Gladiator_Vehicle_Profile.png',
  'Toyota_Tacoma_Vehicle_Profile.png',
  'Toyota_4Runner_Vehicle_Profile.png',
  'Toyota_Land_Cruiser_Vehicle_Profile.png',
  'Ford_Bronco_Vehicle_Profile.png',
  'Ford_F150_Vehicle_Profile.png',
  'Chevy_Colorado_Vehicle_Profile.png',
  'Subaru_Outback_Vehicle_Profile.png',
  'Generic_SUV_Vehicle_Profile.png',
  'Generic_Truck_Vehicle_Profile.png',
  'Generic_Van_Vehicle_Profile.png',
  'Ram_1500_Vehicle_Profile.png',
  'Toyota_Sequoia_Vehicle_Profile.png',
  'Lexus_LX_Vehicle_Profile.png',
  'Ram_2500_3500_Vehicle_Profile.png',
  'Ford_Super_Duty_Vehicle_Profile.png',
  'Nissan_Frontier_Vehicle_Profile.png',
  'Nissan_Xterra_Vehicle_Profile.png',
  'Mercedes_Benz_Sprinter_Vehicle_Profile.png',
  'Toyota_Tundra_Vehicle_Profile.png',
]) {
  assert(
    fs.existsSync(path.join(root, 'assets', 'vehicles', 'profile', fileName)),
    `Vehicle Profile background asset ${fileName} must be bundled under assets/vehicles/profile.`,
  );
  assert(
    widgetRenderers.includes(fileName),
    `Vehicle Profile background asset ${fileName} must be statically required by WidgetRenderers.`,
  );
}

assert(
  fs.existsSync(path.join(root, 'assets', 'dashboard', 'route-progress-placeholder.png')),
  'Route Progress topo placeholder asset must be bundled under assets/dashboard.',
);
assert(
  widgetRenderers.includes('route-progress-placeholder.png'),
  'Route Progress topo placeholder asset must be statically required by WidgetRenderers.',
);

assert(
  fs.existsSync(path.join(root, 'assets', 'power', 'Power_Management_Background.png')),
  'Power Management background asset must be bundled under assets/power.',
);
assert(
  widgetRenderers.includes('Power_Management_Background.png'),
  'Power Management background asset must be statically required by WidgetRenderers.',
);

assert(
  widgetRegistry.includes("widgetId: 'attitude-command'") &&
    widgetRegistry.includes("recommendedWidgetSize: '2x2'") &&
    widgetRegistry.includes("supportedWidgetSizes: ['2x2']") &&
    widgetRegistry.includes("minimumWidgetSize: '2x2'"),
  'Attitude Command must remain a 2x2 dashboard container in the widget registry.',
);
assert(
    widgetChrome.includes('export function ECSInstrumentPanel') &&
    widgetChrome.includes('title?: string') &&
    widgetChrome.includes('statusPill?:') &&
    widgetChrome.includes('background?: React.ReactNode') &&
    widgetChrome.includes('styles.instrumentBackground') &&
    widgetChrome.includes("sizeVariant?: 'compact' | 'medium' | 'wide' | 'dominant'") &&
    widgetChrome.includes("glowIntensity?: 'none' | 'low' | 'medium' | 'high'") &&
    widgetChrome.includes('instrumentTopoLayer') &&
    widgetChrome.includes('instrumentInnerStroke') &&
    !widgetChrome.includes('instrumentCorner') &&
    !widgetChrome.includes('instrumentBolt') &&
    widgetChrome.includes('<ECSInstrumentPanel style={styles.cardSurface}'),
  'Dashboard widgets must share the ECS tactical instrument panel frame without noisy corner/bolt chrome.',
);
assert(
  widgetRegistry.includes("widget_id: 'attitude-command'") &&
    widgetRegistry.includes("display_name: 'Attitude Command'") &&
    widgetRegistry.includes("default_size: '2x2'") &&
    widgetRegistry.includes("if (widgetId === 'attitude-command') return '2x2'") &&
    widgetRenderers.includes("case 'attitude-command': return <AttitudeCommandWidget"),
  'Attitude Command must remain registered as a full-size 2x2 widget in both catalog and renderer paths.',
);

assert(
  /slots:\s*\[\s*\{\s*widgetId:\s*'attitude-command',\s*widgetSize:\s*'2x2'\s*\},\s*\]/.test(widgetRegistry) &&
    widgetRegistry.includes("widget_id: 'attitude-command'") &&
    widgetRegistry.includes("default_dashboard: true"),
  'Expedition dashboard must default to the locked Attitude Command widget system.',
);

assert(
  !widgetGrid.includes('onWidgetPress(slot)') &&
    !widgetGrid.includes('widgetPressOpensDetail') &&
    dashboardSource.includes('const handleWidgetLongPress = useCallback((slot: WidgetSlot) => {'),
  'Parent widget normal tap must not open widget detail or management.',
);

assert(
  widgetGrid.includes('onWidgetLongPress: (slot: WidgetSlot) => void;') &&
    widgetGrid.includes("const widgetMenuLongPressEnabled = slot.widgetType !== 'attitude-command';") &&
    widgetGrid.includes('widgetMenuLongPressEnabled') &&
    widgetGrid.includes(': undefined') &&
    dashboardSource.includes('<WidgetManagePopover'),
  'Attitude Command must opt out of the legacy long-press widget manager while preserving the manager for other dashboard widgets.',
);

assert(
  widgetRenderers.includes('onPress?: () => void;') &&
    widgetRenderers.includes('accessibilityRole="button"') &&
    widgetRenderers.includes('onLongPress={() => {}}'),
  'Attitude Command panels must be ownable buttons that do not bubble long-press intent to the parent.',
);

for (const panel of ['sunlight', 'weather', 'vehicle', 'route', 'power']) {
  assert(
    widgetRenderers.includes(`openFocusPanel('${panel}')`),
    `Attitude Command is missing internal popup button for ${panel}.`,
  );
}

assert(
  commandModuleStore.includes("id: 'attitude'") &&
    commandModuleStore.includes("title: 'ATTITUDE COMMAND'") &&
    commandModuleStore.includes("subtitle: 'Fleet Vehicle Profile'") &&
    widgetRenderers.includes('resolveDashboardWidgetViewportClass') &&
    widgetRenderers.includes('resolveAttitudeCommandLayoutMetrics') &&
    widgetRenderers.includes("phone_portrait' | 'tablet_portrait' | 'landscape_wide") &&
    widgetRenderers.includes('attitudeCommandS.topRow') &&
    widgetRenderers.includes('attitudeCommandS.attitudeStage') &&
    widgetRenderers.includes('attitudeCommandS.bottomRow'),
  'Attitude Command must keep the reference order: top support row, dominant attitude stage, bottom support row.',
);

assert(
  commandModuleStore.includes("export type ECSCommandModuleId") &&
    commandModuleStore.includes("'attitude'") &&
    commandModuleStore.includes("'follow3d'") &&
    commandModuleStore.includes("'recoveryHazardCompass'") &&
    commandModuleStore.includes("'trailDecisionCommand'") &&
    commandModuleStore.includes("'campScoutCommand'") &&
    commandModuleStore.includes("'expeditionReadinessCommand'") &&
    commandModuleStore.includes("label: 'Navigation Command'") &&
    commandModuleStore.includes("label: 'Recovery / Hazard Compass'") &&
    commandModuleStore.includes("label: 'Trail Decision Command'") &&
    commandModuleStore.includes("label: 'Camp Scout Command'") &&
    commandModuleStore.includes("label: 'Expedition Readiness Command'") &&
    !commandModuleStore.includes("label: 'Convoy Command'") &&
    /export const ECS_COMMAND_MODULE_ORDER: ECSCommandModuleId\[\] = \[\s*'attitude',\s*'follow3d',\s*'recoveryHazardCompass',\s*'trailDecisionCommand',\s*'campScoutCommand',\s*'expeditionReadinessCommand',\s*\];/.test(commandModuleStore) &&
    commandModuleStore.includes("createPersistedKeyValueCache('ecs_command_preferences')") &&
    commandModuleStore.includes("const DEFAULT_ECS_COMMAND_MODULE: ECSCommandModuleId = 'attitude'") &&
    commandModuleStore.includes("if (value === 'convoyCommand' || value === 'convoy-command') return null;") &&
    commandModuleStore.includes('private _selectedModule: ECSCommandModuleId = DEFAULT_ECS_COMMAND_MODULE') &&
    commandModuleStore.includes('setSelectedModule(moduleId: ECSCommandModuleId)') &&
    commandModuleStore.includes('subscribe(listener: ECSCommandModuleListener)'),
  'ECS Command Module selection must be typed, default to attitude, persist through the command preferences store, and expose Attitude, 3D Navigation, Recovery, Trail Decision, Camp Scout, Expedition Readiness, and Convoy command-center modes.',
);

assert(
    widgetRenderers.includes('const [selectedCommandModule, setSelectedCommandModule] = useState<ECSCommandModuleId>(() => ecsCommandModuleStore.selectedModule)') &&
    widgetRenderers.includes('return ecsCommandModuleStore.subscribe((moduleId) => {') &&
    widgetRenderers.includes('ecsCommandModuleStore.setSelectedModule(moduleId)') &&
    widgetRenderers.includes('CommandCenterHost') &&
    widgetRenderers.includes('COMMAND_CENTER_MODES') &&
    widgetRenderers.includes('COMMAND_CENTER_IMPLEMENTED_MODES') &&
    widgetRenderers.includes('isCommandCenterModuleId') &&
    !widgetRenderers.includes('dashboard-command-center-mode-selector') &&
    commandCenterRegistry.includes("label: 'Recovery / Hazard Compass'") &&
    commandCenterRegistry.includes("label: 'Trail Decision Command'") &&
    commandCenterRegistry.includes("label: 'Camp Scout Command'") &&
    commandCenterRegistry.includes("label: 'Expedition Readiness Command'") &&
    !commandCenterRegistry.includes("label: 'Convoy Command'") &&
    widgetRenderers.includes('<CommandCenterHost') &&
    widgetRenderers.includes('dataContext={commandCenterDataContext}') &&
    widgetRenderers.includes('externalRenderers={{') &&
    widgetRenderers.includes('ECSCommandModulePlaceholder') &&
    widgetRenderers.includes("selectedCommandModule === 'attitude' ? (") &&
    widgetRenderers.includes("selectedCommandCenterMode !== 'threeDNavigation'") &&
    widgetRenderers.includes('<Mini3DFollowMap options={options} selected={mode === \'threeDNavigation\'} />') &&
    widgetRenderers.includes('selectedCommandModuleDefinition.title') &&
    widgetRenderers.includes('selectedCommandModuleDefinition.subtitle') &&
    widgetRenderers.includes('visible={moduleSelectorVisible}') &&
    widgetRenderers.includes('title="Change Center Module"') &&
    widgetRenderers.includes('subtitle="Choose the instrument shown inside the Command Module shell."') &&
    widgetRenderers.includes('minHeightFraction={0.42}') &&
    widgetRenderers.includes('scrollable') &&
    widgetRenderers.includes('bodyStyle={attitudeCommandS.moduleSelectorBody}') &&
    widgetRenderers.includes('contentContainerStyle={attitudeCommandS.moduleSelectorContent}') &&
    widgetRenderers.includes('ECS_COMMAND_MODULE_ORDER.map') &&
    widgetRenderers.includes('stageModulePill') &&
    widgetRenderers.includes('accessibilityState={{ selected }}') &&
    widgetRenderers.includes('moduleTransitionOpacity') &&
    widgetRenderers.includes('attitudeCommandS.moduleTransitionShell') &&
    widgetRenderers.includes('Animated.timing(moduleTransitionOpacity'),
  'Attitude Command must host a persisted swappable center module through the three-dot ECS selector and lightweight transition.',
);

assert(
    widgetRenderers.includes('maxWidth={540}') &&
    widgetRenderers.includes('moduleSelectorOption: {') &&
    widgetRenderers.includes('gap: 12') &&
    widgetRenderers.includes('paddingHorizontal: 12') &&
    widgetRenderers.includes('moduleSelectorState: {') &&
    widgetRenderers.includes('minWidth: 70') &&
    widgetRenderers.includes('flexShrink: 0') &&
    widgetRenderers.includes('paddingHorizontal: 10') &&
    widgetRenderers.includes('moduleSelectorStateText: {') &&
    widgetRenderers.includes('fontSize: 8'),
  'ECS Command Module popup selector must remain wide enough for command labels and the Select action without clipping.',
);

assert(
  navigateSurfaceWidget.includes('export function Mini3DFollowMap') &&
    navigateSurfaceWidget.includes('useNavigateSurfaceState(options)') &&
    navigateSurfaceWidget.includes('mapStyleKey="3d"') &&
    navigateSurfaceWidget.includes("mode: 'follow_user'") &&
    navigateSurfaceWidget.includes('zoom: hasActiveGuidance ? COMMAND_3D_FOLLOW_ZOOM : COMMAND_3D_FREE_DRIVE_ZOOM') &&
    navigateSurfaceWidget.includes('pitch: COMMAND_3D_FOLLOW_PITCH') &&
    navigateSurfaceWidget.includes('bearing: cameraBearing') &&
    navigateSurfaceWidget.includes('offset: COMMAND_3D_FOLLOW_OFFSET') &&
    navigateSurfaceWidget.includes("interactive={guidanceVariant === 'command3d'}") &&
    !navigateSurfaceWidget.includes('Search') &&
    !navigateSurfaceWidget.includes('tools menu'),
  '3D Follow Map module must reuse the dashboard MapRenderer surface with high-pitch follow camera, map gestures in command mode, and no Navigate tool stack.',
);

assert(
  navigateRouteSessionStore.includes('nextInstructionDistanceM: number | null') &&
    navigateRouteSessionStore.includes('isRerouting: boolean') &&
    navigateRouteSessionStore.includes('isOffRoute: boolean') &&
    navigateRouteSessionStore.includes('offRouteDistanceM: number | null') &&
    navigateRouteSessionStore.includes("export type NavigateRouteGuidanceStatus = 'nominal' | 'rerouting' | 'off_route' | 'arrived' | null") &&
    navigateSurfaceWidget.includes('function NextTurnStrip') &&
    navigateSurfaceWidget.includes('function buildNextTurnStrip') &&
    navigateSurfaceWidget.includes("if (snapshot.lifecycle !== 'active') return null") &&
    navigateSurfaceWidget.includes("instruction: 'Rerouting...'") &&
    navigateSurfaceWidget.includes("instruction: 'Off route'") &&
    navigateSurfaceWidget.includes('formatTurnDistance(snapshot.nextInstructionDistanceM)') &&
    navigateSurfaceWidget.includes('isGenericGuidanceInstruction(instruction)') &&
    navigateSurfaceWidget.includes("guidanceVariant === 'command3d' ? (") &&
    navigateSurfaceWidget.includes('<NextTurnStrip snapshot={routeSession} />'),
  '3D Follow Map must use real route guidance snapshot fields for its compact next-turn strip and hide the strip outside active guidance.',
);

assert(
  mapRenderer.includes('pitch?: number | null') &&
    mapRenderer.includes('bearing?: number | null') &&
    mapRenderer.includes('offset?: [number, number] | null') &&
    mapRenderer.includes('normalizeCameraBearing(command.bearing)') &&
    mapRenderer.includes('cameraOptions.pitch = normalized.pitch') &&
    mapRenderer.includes('cameraOptions.bearing = normalized.bearing') &&
    mapRenderer.includes('cameraOptions.offset = normalized.offset'),
  'Shared MapRenderer camera commands must support optional pitch, bearing, and offset for compact 3D follow modules.',
);

assert(
  widgetGrid.includes('widgetWidth: placement?.width ?? null') &&
    widgetGrid.includes('widgetHeight: placement?.height ?? null') &&
    widgetGrid.includes('screenWidth: screenWidth ?? null') &&
    widgetGrid.includes('screenHeight: screenHeight ?? null') &&
    widgetGrid.includes('screenWidth={windowWidth}') &&
    widgetGrid.includes('screenHeight={windowHeight}'),
  'WidgetGrid must pass measured footprint and screen dimensions into dashboard widgets.',
);

assert(
  widgetRenderers.indexOf('eyebrow="REMAINING SUNLIGHT"') <
    widgetRenderers.indexOf('eyebrow="CURRENT WEATHER"') &&
    widgetRenderers.indexOf('eyebrow="CURRENT WEATHER"') <
    widgetRenderers.indexOf('eyebrow="VEHICLE PROFILE"') &&
    widgetRenderers.indexOf('eyebrow="VEHICLE PROFILE"') <
    widgetRenderers.indexOf('attitudeCommandS.attitudeStage') &&
    widgetRenderers.indexOf('attitudeCommandS.attitudeStage') <
    widgetRenderers.indexOf('eyebrow="ROUTE PROGRESS"') &&
    widgetRenderers.indexOf('eyebrow="ROUTE PROGRESS"') <
    widgetRenderers.indexOf('eyebrow="POWER MONITOR"'),
  'Attitude Command support widgets must preserve the design-locked portrait/landscape ordering.',
);

assert(
    widgetRenderers.includes('function AttitudeCommandPanelVisual') &&
    widgetRenderers.includes('<ECSInstrumentPanel') &&
    widgetRenderers.includes("title={isSunlightPanel ? undefined : isVehiclePanel ? 'Vehicle Profile' : eyebrow}") &&
    widgetRenderers.includes('statusPill={statusPill}') &&
    widgetRenderers.includes('sizeVariant={eyebrow === \'ROUTE PROGRESS\' || eyebrow === \'POWER MONITOR\' ? \'wide\' : \'compact\'}') &&
    widgetRenderers.includes('sunGlyphLayer') &&
    widgetRenderers.includes('sunPanelHeaderTitle') &&
    widgetRenderers.includes('sunlightBottomReadout') &&
    widgetRenderers.includes('sunlightRemainingBlock') &&
    widgetRenderers.includes('sunlightRiseSetStack') &&
    widgetRenderers.includes('sunlightRiseSetText') &&
    widgetRenderers.includes('sunlightTimeReadout') &&
    !widgetRenderers.includes('sunRadiance') &&
    !widgetRenderers.includes('sunArcInner') &&
    !widgetRenderers.includes('sunEventLabelLeft') &&
    !widgetRenderers.includes('sunEventLabelRight') &&
    !widgetRenderers.includes('sunlightGlareStatus') &&
    widgetRenderers.includes("type SunlightBackgroundType = 'dawn' | 'day' | 'dusk' | 'night'") &&
    widgetRenderers.includes('function getSunlightBackgroundType(input: unknown): SunlightBackgroundType') &&
    widgetRenderers.includes('AttitudeCommandSunlightBackgroundVisual') &&
    widgetRenderers.includes('sunBackgroundImage') &&
    widgetRenderers.includes('sunBackgroundScrim') &&
    widgetRenderers.includes('SUNLIGHT_BACKGROUND_FADE_MS') &&
    widgetRenderers.includes('resolveCommandSunlightRadiancePhase') &&
    widgetRenderers.includes("phaseText.includes('civil twilight')") &&
    widgetRenderers.includes("return { phase: 'Civil twilight', radiancePhase: 'night' }") &&
    widgetRenderers.includes('formatCommandUvIndex') &&
    widgetRenderers.includes('weatherGlyphLayer') &&
    widgetRenderers.includes('resolveCommandWeatherScene') &&
    widgetRenderers.includes('CommandWeatherSceneKind') &&
    widgetRenderers.includes("isSunlightPanel || isWeatherPanel") &&
    !widgetRenderers.includes('weatherSceneEffectsLayer') &&
    !widgetRenderers.includes('weatherLiveChip') &&
    widgetRenderers.includes('weatherMetricStrip') &&
    widgetRenderers.includes('CommandVehicleVisualData') &&
    widgetRenderers.includes('VehicleProfileImageKey') &&
    widgetRenderers.includes('VehicleAttitudeKey') &&
    widgetRenderers.includes('VEHICLE_PROFILE_IMAGE_KEY_BY_ATTITUDE_KEY') &&
    widgetRenderers.includes('function getVehicleProfileImageKeyFromAttitudeKey(vehicleKey: VehicleAttitudeKey): VehicleProfileImageKey') &&
    widgetRenderers.includes('AttitudeCommandVehicleProfileBackgroundVisual') &&
    widgetRenderers.includes('VEHICLE_PROFILE_IMAGES') &&
    widgetRenderers.includes('VEHICLE_PROFILE_IMAGE_FADE_MS') &&
    widgetRenderers.includes('vehicleProfileBackgroundImage') &&
    widgetRenderers.includes('vehicleProfileBackgroundScrim') &&
    widgetRenderers.includes('vehicleGlyphLayer') &&
    widgetRenderers.includes('vehiclePanelContent') &&
    widgetRenderers.includes('vehicleBaseTelemetryRow') &&
    widgetRenderers.includes('vehicleBaseTelemetryText') &&
    widgetRenderers.includes('vehicleBaseTelemetryTextRight') &&
    widgetRenderers.includes('vehicleBaseNameText') &&
    !widgetRenderers.includes('vehicleBaseIdentityText') &&
    !widgetRenderers.includes('{vehicleVisual.identity}') &&
    !widgetRenderers.includes('vehicleHeroSilhouette') &&
    !widgetRenderers.includes('vehicleReadinessRail') &&
    !widgetRenderers.includes('vehicleMetricStrip') &&
    !widgetRenderers.includes('vehicleBaseName:') &&
    !widgetRenderers.includes('vehicleBaseSubmodel') &&
    !widgetRenderers.includes('vehicleBaseMetricRow') &&
    widgetRenderers.includes('CommandRouteVisualData') &&
    widgetRenderers.includes('routeGlyphLayer') &&
    widgetRenderers.includes("import RouteProgressMiniMap, { buildRouteProgressFeatureFromPoints } from './RouteProgressMiniMap'") &&
    widgetRenderers.includes("const ROUTE_PROGRESS_PLACEHOLDER = require('../../assets/dashboard/route-progress-placeholder.png')") &&
    widgetRenderers.includes('AttitudeCommandRouteProgressMapVisual') &&
    widgetRenderers.includes('<RouteProgressMiniMap') &&
    widgetRenderers.includes('routeGeoJson={route?.routeGeoJson ?? null}') &&
    widgetRenderers.includes('currentLocation={route?.currentLocation ?? null}') &&
    widgetRenderers.includes('progressPercent={route?.progressPercent ?? null}') &&
    widgetRenderers.includes('inactivePlaceholderSource={ROUTE_PROGRESS_PLACEHOLDER}') &&
    widgetRenderers.includes('routeProgressMiniMap') &&
    !widgetRenderers.includes('ROUTE_PROGRESS_MAP_BACKGROUND') &&
    !widgetRenderers.includes('ROUTE_PROGRESS_PATH') &&
    !widgetRenderers.includes('ROUTE_PROGRESS_PATH_LENGTH') &&
    !widgetRenderers.includes('function getRouteProgressPercent') &&
    !widgetRenderers.includes('function getRouteMarkerPoint') &&
    !widgetRenderers.includes('routeMetricStrip') &&
    widgetRenderers.includes('CommandPowerVisualData') &&
    widgetRenderers.includes('background={(') &&
    widgetRenderers.includes('<AttitudeCommandPanelVisual') &&
    widgetRenderers.includes('innerTexture={false}') &&
    widgetRenderers.includes('resolveAttitudeMonitorVehicleId(activeVehicleContext)') &&
    widgetRenderers.includes('imageKey: getVehicleProfileImageKeyFromAttitudeKey(attitudeVehicleId)') &&
    !widgetRenderers.includes('imageKey: getVehicleProfileImageKey(vehicleImageProfileInput)') &&
    widgetRenderers.includes('powerGlyphLayer') &&
    widgetRenderers.includes('POWER_MANAGEMENT_BACKGROUND') &&
    widgetRenderers.includes('powerManagementBackground') &&
    widgetRenderers.includes('powerManagementBackgroundScrim') &&
    widgetRenderers.includes('AttitudeCommandPowerManagementVisual') &&
    widgetRenderers.includes('resolveCommandPowerInputRows') &&
    widgetRenderers.includes('resolveCommandPowerOutputRows') &&
    widgetRenderers.includes('inputRows: powerInputRows') &&
    widgetRenderers.includes('outputRows: powerOutputRows') &&
    widgetRenderers.includes('powerColumnLeft') &&
    widgetRenderers.includes('powerModuleBlock') &&
    widgetRenderers.includes('powerFlowLineInput') &&
    widgetRenderers.includes('powerFlowLineOutput') &&
    widgetRenderers.includes('powerFlowRowLabel') &&
    widgetRenderers.includes('powerFlowRowValue') &&
    widgetRenderers.includes('shouldAnimate && inputActive') &&
    widgetRenderers.includes('shouldAnimate && outputActive') &&
    widgetRenderers.includes('powerBottomStrip') &&
    widgetRenderers.includes('sanitizeCommandPowerLabel') &&
    !widgetRenderers.includes('/fallback'),
  'Attitude Command support panels must render ECS tactical instrument visuals for sunlight, weather, vehicle, route, and power.',
);

assert(
  widgetRenderers.includes('const topHeight = clampCommandLayoutValue(height * 0.19, 82, 108)') &&
    widgetRenderers.includes('const bottomHeight = clampCommandLayoutValue(height * 0.2, 90, 118)') &&
    widgetRenderers.includes('minHeight: clampCommandLayoutValue(height * 0.46, 238, 328)') &&
    widgetRenderers.includes("return '--';") &&
    vehicleAttitudeStage.includes('testID="vehicle-attitude-stage-level-readout"') &&
    vehicleAttitudeStage.includes('const accessibilityLabel = `Vehicle attitude. Pitch ${pitchLabel}. Roll ${rollLabel}.`;') &&
    !vehicleAttitudeStage.includes('vehicle-attitude-command-chrome-overlay') &&
    !vehicleAttitudeStage.includes('vehicle-attitude-command-pitch-panel') &&
    !vehicleAttitudeStage.includes('vehicle-attitude-command-roll-panel'),
  'Attitude Command polish must use taller support rows, image-owned pitch/roll chrome, active vehicle image input, and ASCII-safe fallback copy.',
);

assert(
  commandWidgetSource.includes('<AttitudeCommandWidgetConnected') &&
    commandWidgetSource.includes('pitchDeg={commandStagePitchDeg}') &&
    commandWidgetSource.includes('rollDeg={commandStageRollDeg}') &&
    commandWidgetSource.includes('telemetryEnabled={false}') &&
    commandWidgetSource.includes('activeVehicleName={activeVehicleContext.vehicle?.name ?? undefined}') &&
    commandWidgetSource.includes('pointerEvents="box-none"') &&
    commandWidgetSource.includes('onPress={handleToggleSound}') &&
    !commandWidgetSource.includes('<AttitudeStageHexButtonChrome') &&
    commandWidgetSource.includes("name={soundEnabled ? 'volume-high-outline' : 'volume-off-outline'}") &&
    commandWidgetSource.includes('onPress={handleZeroCommandStage}') &&
    commandWidgetSource.includes('accessibilityLabel="Zero pitch and roll"') &&
    commandWidgetSource.includes('attitudeCommandS.stageModulePillActive') &&
    commandWidgetSource.includes('<Ionicons name="ellipsis-horizontal" size={17} color={TACTICAL.text} />') &&
    !commandWidgetSource.includes('CHANGE') &&
    commandWidgetSource.includes("selectedCommandModule !== 'attitude' ? (") &&
    commandWidgetSource.includes("selectedCommandModule === 'attitude' ? (") &&
    !commandWidgetSource.includes('attitudeCommandS.stageStatusPillCenterSlot') &&
    !commandWidgetSource.includes('attitudeCommandS.stageStatusPillCentered') &&
    commandWidgetSource.includes('showActiveEdge={false}') &&
    !commandWidgetSource.includes('SOUND ON') &&
    !commandWidgetSource.includes('SOUND OFF') &&
    commandWidgetSource.includes('setCommandLocalZeroOffset({ rollDeg: attitudeTelemetry.rollDeg, pitchDeg: attitudeTelemetry.pitchDeg })') &&
    !commandWidgetSource.includes('<AttitudeMonitorSurface'),
  'Attitude Command must render the connected active-vehicle attitude stage while keeping the center image clean and icon-only sound/module controls interactive.',
);

for (const title of ['Remaining Sunlight', 'Current Weather', 'Vehicle Profile', 'Route Progress', 'Power Monitor']) {
  assert(
    widgetRenderers.includes(`title: '${title}'`) || widgetRenderers.includes(`title={activeFocusConfig.title}`),
    `Attitude Command popup title ${title} must be represented.`,
  );
}

assert(
  widgetRenderers.includes('<TacticalPopupShell') &&
    widgetRenderers.includes('activePanel === \'sunlight\'') &&
    widgetRenderers.includes('activePanel === \'weather\'') &&
    widgetRenderers.includes('activePanel === \'vehicle\'') &&
    widgetRenderers.includes('activePanel === \'route\'') &&
    widgetRenderers.includes('activePanel === \'power\''),
  'Attitude Command must render focused ECS popups for every internal panel.',
);

assert(
  widgetRenderers.includes('AttitudeCommandUnavailableNotice') &&
    widgetRenderers.includes('Location required') &&
    widgetRenderers.includes('Waiting for current position') &&
    widgetRenderers.includes('Sunlight data unavailable') &&
    widgetRenderers.includes('Permission required') &&
    widgetRenderers.includes('Location unavailable') &&
    widgetRenderers.includes('Weather provider unavailable') &&
    widgetRenderers.includes('Weather data stale') &&
    widgetRenderers.includes('No active route') &&
    widgetRenderers.includes('Start or select a route to view progress') &&
    widgetRenderers.includes('No live power source connected') &&
    widgetRenderers.includes('Waiting for telemetry') &&
    widgetRenderers.includes('Power monitor unavailable'),
  'Attitude Command popups must expose unavailable/missing data states.',
);

assert(
  widgetRenderers.includes('daylight.daylightLabel') &&
    widgetRenderers.includes('getSunlightCountdownLabel(environment.sunlight)') &&
    widgetRenderers.includes('formatSunlightCountdownValue(environment.sunlight)'),
  'Remaining Sunlight popup must use the live daylight/sunrise countdown label.',
);

for (const sunlightField of [
  'Estimated sunrise',
  'Estimated sunset',
  'Glare status',
  'Sun elevation',
  'Sun azimuth',
  'Last updated',
]) {
  assert(
    widgetRenderers.includes(`label="${sunlightField}"`),
    `Remaining Sunlight popup must include ${sunlightField}.`,
  );
}

for (const weatherField of [
  'Condition',
  'Temperature',
  'Feels like',
  'Wind',
  'Precipitation',
  'Visibility',
  'Alerts',
  'Forecast',
  'Location',
  'Source',
  'Freshness',
  'Last updated',
]) {
  assert(
    widgetRenderers.includes(`label="${weatherField}`),
    `Current Weather popup must include ${weatherField}.`,
  );
}

assert(
  widgetRenderers.includes('useCanonicalWidgetWeatherSnapshot(data, options)') &&
    widgetRenderers.includes('getAttitudeWeatherForecastRows(snapshot)') &&
    widgetRenderers.includes('formatAttitudeWeatherLastUpdated(snapshot)'),
  'Current Weather popup must use the shared canonical weather snapshot and existing forecast data.',
);

for (const vehicleField of [
  'Vehicle',
  'Year/make/model',
  'Drivetrain',
  'Engine',
  'Suspension',
  'Tires',
  'Build summary',
  'Loadout',
  'Operating weight',
  'Base weight',
  'GVWR',
  'Payload margin',
  'Readiness',
  'Confidence',
  'Telemetry',
  'Fuel',
  'Voltage',
  'Source',
]) {
  assert(
    widgetRenderers.includes(`label="${vehicleField}"`),
    `Vehicle Profile popup must include ${vehicleField}.`,
  );
}

assert(
  widgetRenderers.includes('resolveAttitudeVehicleProfile(activeVehicleContext)') &&
    widgetRenderers.includes('resolveVehicleProfileFuelReadout(activeVehicleContext, vehicleTelemetry.snapshot)') &&
    widgetRenderers.includes('resolveVehicleProfileVoltageReadout(activeVehicleContext, vehicleTelemetry.snapshot)') &&
    widgetRenderers.includes('(manually set)') &&
    widgetRenderers.includes('snapshot.isLive && snapshot.sourceType !== \'simulated\'') &&
    widgetRenderers.includes('Fleet selected vehicle/build') &&
    widgetRenderers.includes('No active vehicle profile or live telemetry is available'),
  'Vehicle Profile popup must use live telemetry first, manual active Fleet values second, and expose an empty state.',
);

for (const routeField of [
  'Route',
  'Destination',
  'Distance remaining',
  'Time remaining',
  'ETA',
  'Progress',
  'Current leg',
  'Navigation status',
  'Next',
  'Route warning',
  'Confidence',
  'Route geometry',
  'Total route',
  'Completed',
  'Calculation',
  'Source',
  'Last updated',
]) {
  assert(
    widgetRenderers.includes(`label="${routeField}"`),
    `Route Progress popup must include ${routeField}.`,
  );
}

assert(
  widgetRenderers.includes('useActiveRouteProgressSnapshot(options)') &&
    widgetRenderers.includes('useRouteProgressCommandSnapshot(options)') &&
    widgetRenderers.includes('Route Progress uses the shared active route progress contract'),
  'Route Progress popup must use the shared active route progress contract.',
);

assert(
  widgetRenderers.includes('routeProgress.calculationState.toLowerCase().includes(\'loading\')') &&
    widgetRenderers.includes('routeProgress.calculationState.toLowerCase().includes(\'unavailable\')') &&
    widgetRenderers.includes('<AttitudeCommandUnavailableNotice message={routeProgress.calculationState} />'),
  'Route Progress popup must expose loading and route-progress calculation failure states.',
);

for (const powerField of [
  'Charge state',
  'Battery',
  'Input watts',
  'Input amps',
  'Input volts',
  'Output watts',
  'Output amps',
  'Output volts',
  'Battery voltage',
  'Battery current',
  'Solar',
  'Connected sources',
  'Connected loads',
  'Telemetry source',
  'Freshness',
  'Last updated',
]) {
  assert(
    widgetRenderers.includes(`label="${powerField}"`),
    `Power Monitor popup must include ${powerField}.`,
  );
}

assert(
  widgetRenderers.includes('useUnifiedPowerDevices()') &&
    widgetRenderers.includes('normalizePowerTelemetrySummary(power)') &&
    widgetRenderers.includes('resolveAttitudePowerFlowState(powerSummary)') &&
    widgetRenderers.includes('AttitudePowerLiquidFlowIndicator') &&
    widgetRenderers.includes('useReducedMotion()') &&
    widgetRenderers.includes('Connected sources') &&
    widgetRenderers.includes('Connected loads'),
  'Power Monitor popup must use the existing live power telemetry source and show a reduced-motion-aware flow indicator.',
);

assert(
  widgetRenderers.includes('function PowerCommandModule') &&
    widgetRenderers.includes('<PowerCommandModule') &&
    widgetRenderers.includes('summary.sourceState.isManual || summary.truth.isManual') &&
    widgetRenderers.includes('Manual entry') &&
    widgetRenderers.includes('AttitudeCommandPowerManagementVisual power={power}') &&
    widgetRenderers.includes('power.canDisplayTelemetryValues') &&
    widgetRenderers.includes('power.unavailableMessage ?? \'Power telemetry unavailable\''),
  'Power Command center module must use the existing power telemetry contract with truthful live/manual/unavailable states.',
);

assert(
  widgetRenderers.includes('function EnvironmentalCommandModule') &&
    widgetRenderers.includes('<EnvironmentalCommandModule') &&
    widgetRenderers.includes("selectedCommandModule === 'environmentalCommand' ? (") &&
    widgetRenderers.includes('resolveElevationTerrainSnapshot({') &&
    widgetRenderers.includes('buildRemotenessDestinations(remotenessIndex)') &&
    widgetRenderers.includes('remotenessStore.getIndex()') &&
    widgetRenderers.includes('formatCommandEnvironmentNearest') &&
    widgetRenderers.includes('environmentalVisual.daylight') &&
    widgetRenderers.includes('environmentalVisual.weatherValue') &&
    widgetRenderers.includes('environmentalVisual.remoteness') &&
    widgetRenderers.includes("remotenessScore != null ? `${Math.round(remotenessScore)}` : 'Unknown'") &&
    widgetRenderers.includes("'Remoteness source unavailable'"),
  'Environmental Command center module must use existing sunlight/weather/elevation/remoteness sources and truthfully label unknown states.',
);

console.log('[dashboard-attitude-command-interactions] interaction contract passed');
