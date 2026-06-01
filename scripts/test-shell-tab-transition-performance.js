const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(...parts) {
  return fs.readFileSync(path.join(root, ...parts), 'utf8').replace(/\r\n/g, '\n');
}

const commandDock = read('components', 'CommandDock.tsx');
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
    scheduler.includes('cancelShellInteractionTask'),
  'Shell interaction scheduler must expose cancellable route-navigation deferral helpers.',
);

assert(
  commandDock.includes("from '../lib/shellInteractionScheduler';") &&
    commandDock.includes('deferShellRouteNavigation') &&
    commandDock.includes('pendingRouteRef') &&
    commandDock.includes('setPendingRoute') &&
    commandDock.includes('deferShellRouteNavigation(() => {') &&
    commandDock.includes('router.navigate(route as any);'),
  'CommandDock must optimistically acknowledge tab presses and defer route mounting out of the press frame.',
);

assert(
  commandDock.includes('const effectivePathname = pendingRoute ?? pathname') &&
    commandDock.includes('effectivePathname.includes(p)'),
  'CommandDock active-state styling should use the pending route so the dock responds immediately.',
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
