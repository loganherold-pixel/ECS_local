const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(...parts) {
  return fs.readFileSync(path.join(root, ...parts), 'utf8').replace(/\r\n/g, '\n');
}

const commandDock = read('components', 'CommandDock.tsx');
const ecsGlobalBanner = read('components', 'ECSGlobalBanner.tsx');
const shellBodyBackground = read('components', 'ShellBodyBackground.tsx');
const appLayout = read('app', '_layout.tsx');
const explorePlanningTabs = read('components', 'discover', 'ExplorePlanningTabs.tsx');
const dashboard = read('app', '(tabs)', 'dashboard.tsx');
const navigate = read('app', '(tabs)', 'navigate.tsx');
const schedulerPath = path.join(root, 'lib', 'shellInteractionScheduler.ts');
const scheduler = fs.existsSync(schedulerPath) ? fs.readFileSync(schedulerPath, 'utf8').replace(/\r\n/g, '\n') : '';

assert(
  scheduler.includes('runAfterShellInteractions') &&
    scheduler.includes('requestAnimationFrame') &&
    scheduler.includes('InteractionManager.runAfterInteractions'),
  'Shell interaction scheduler must defer non-urgent work until after the current interaction frame.',
);

assert(
  scheduler.includes('deferShellRouteNavigation') &&
    scheduler.includes('cancelShellInteractionTask') &&
    scheduler.includes('SHELL_ROUTE_NAVIGATION_DELAY_MS') &&
    scheduler.includes('return runAfterShellInteractions(callback, {'),
  'Shell interaction scheduler must expose cancellable route-navigation deferral helpers.',
);

assert(
  commandDock.includes("from '../lib/shellInteractionScheduler';") &&
    commandDock.includes("from '../lib/routeManifest';") &&
    commandDock.includes('deferShellRouteNavigation') &&
    commandDock.includes('pendingRouteRef') &&
    commandDock.includes('setPendingRoute') &&
    commandDock.includes('deferShellRouteNavigation(() => {') &&
    commandDock.includes('navigateSingleFlight(route);'),
  'CommandDock must optimistically acknowledge tab presses and defer route mounting out of the press frame.',
);

assert(
  commandDock.includes('const effectivePathname = pendingRoute ?? pathname') &&
    commandDock.includes('isPrimaryTabActiveForPath(item.tabId, effectivePathname)'),
  'CommandDock active-state styling should use the canonical route manifest and pending route so the dock responds immediately.',
);
assert(
  commandDock.includes('const DockButton = React.memo') &&
    commandDock.includes('const ShieldCenterButton = React.memo') &&
    commandDock.includes('const pathnameRef = useRef(pathname);') &&
    commandDock.includes('const quickActionsVisibleRef = useRef(quickActionsVisible);') &&
    commandDock.includes('onNavigate={handleNavigate}'),
  'CommandDock image-heavy buttons should be memoized and use stable navigation handlers so unrelated dock items do not redraw during tab transitions.',
);

assert(
  ecsGlobalBanner.includes("import { Image } from 'expo-image';") &&
    ecsGlobalBanner.includes('cachePolicy="memory-disk"') &&
    ecsGlobalBanner.includes('transition={0}') &&
    ecsGlobalBanner.includes('recyclingKey={`ecs-global-banner-${placement}-${String(source)}`}') &&
    shellBodyBackground.includes("import { Image } from 'expo-image';") &&
    shellBodyBackground.includes('BODY_BG_MOBILE') &&
    shellBodyBackground.includes('deferImage?: boolean;') &&
    shellBodyBackground.includes('useLightweightImage?: boolean;') &&
    shellBodyBackground.includes('deferImage ? (') &&
    shellBodyBackground.includes('backgroundColor: colors.bgElevated') &&
    shellBodyBackground.includes('cachePolicy="memory-disk"') &&
    shellBodyBackground.includes('transition={0}') &&
    shellBodyBackground.includes("'ecs-shell-body-background-mobile'") &&
    shellBodyBackground.includes("'ecs-shell-body-background'") &&
    commandDock.includes('cachePolicy="memory-disk"') &&
    commandDock.includes('priority="high"'),
  'Shared shell imagery should use cached no-transition expo-image surfaces and cached dock badges to avoid bitmap upload spikes during tab changes.',
);

assert(
  appLayout.includes('EXPLORE_ENTRY_SHELL_BACKGROUND_DELAY_MS') &&
    appLayout.includes('EXPLORE_ENTRY_SHELL_BACKGROUND_MAX_WAIT_MS') &&
    appLayout.includes('const [deferSharedShellBackgroundImage, setDeferSharedShellBackgroundImage] = useState(false);') &&
    appLayout.includes("normalizedPathname === '/discover'") &&
    appLayout.includes("normalizedPathname === '/explore-trip-builder'") &&
    appLayout.includes('setDeferSharedShellBackgroundImage(true);') &&
    appLayout.includes('runAfterShellInteractions(') &&
    appLayout.includes('deferImage={deferSharedShellBackgroundImage}') &&
    appLayout.includes('useLightweightImage={shouldDeferExploreShellBackgroundImage}'),
  'Android Explore entry should defer shared shell body artwork during the first transition budget window.',
);

assert(
  explorePlanningTabs.includes("import { deferShellRouteNavigation, type ShellInteractionTask } from '../../lib/shellInteractionScheduler';") &&
    explorePlanningTabs.includes('const pendingNavigationTaskRef = useRef<ShellInteractionTask | null>(null);') &&
    explorePlanningTabs.includes('const [pendingTab, setPendingTab] = useState<ExplorePlanningTab | null>(null);') &&
    explorePlanningTabs.includes('const displayTab = pendingTab ?? activeTab;') &&
    explorePlanningTabs.includes('pendingNavigationTaskRef.current = deferShellRouteNavigation(() => {') &&
    explorePlanningTabs.includes('value={displayTab}'),
  'Explore planning tabs should optimistically select the pressed tab and defer sibling route mounting out of the tap frame.',
);

assert(
  dashboard.includes("import { runAfterShellInteractions } from '../../lib/shellInteractionScheduler';") &&
    dashboard.includes('runAfterShellInteractions(() => {') &&
    dashboard.includes('void refreshDashboardRouteContext();') &&
    dashboard.includes('refreshActiveVehicleData();') &&
    dashboard.includes('refreshActiveTrip();'),
  'Dashboard focus refreshes must be deferred until after tab transition interactions.',
);

assert(
  navigate.includes("import { runAfterShellInteractions } from '../../lib/shellInteractionScheduler';") &&
    navigate.includes('const restoreTask = runAfterShellInteractions(() => {') &&
    navigate.includes('restoreTask.cancel();') &&
    !navigate.includes('const restoreTimer = setTimeout(() => {\n        void (async () => {'),
  'Navigate handoff restoration must use the cancellable shell interaction scheduler instead of a raw transition-frame timer.',
);

console.log('Shell tab transition performance checks passed.');
