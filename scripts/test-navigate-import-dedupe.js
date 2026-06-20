const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const navigatePath = path.join(root, 'app', '(tabs)', 'navigate.tsx');
const source = fs.readFileSync(navigatePath, 'utf8');

function assertContains(needle, message) {
  if (!source.includes(needle)) {
    throw new Error(message);
  }
}

assertContains('const NAVIGATE_IMPORT_RECENT_FILE_WINDOW_MS = 10_000;', 'Route import recent-file dedupe window must remain easy to tune.');
assertContains('function createNavigateImportFileKey(fileName: string, content: string): string', 'Route import should fingerprint selected file content.');
assertContains('const isImportPendingRef = useRef(false);', 'Route import needs a ref-backed pending guard for same-frame double taps.');
assertContains('const [isImportPending, setIsImportPending] = useState(false);', 'Route import needs state for disabled button UI.');
assertContains("logNavigateDev('[NAVIGATE_IMPORT] import_button_ignored_pending'", 'Duplicate import taps should log ignored pending.');
assertContains("logNavigateDev('[NAVIGATE_IMPORT] picker_opened')", 'Picker open should be logged.');
assertContains("logNavigateDev('[NAVIGATE_IMPORT] import_cancelled')", 'Picker cancellation should be logged.');
assertContains("logNavigateDev('[NAVIGATE_IMPORT] import_success'", 'Successful import should be logged.');
assertContains("logNavigateDev('[NAVIGATE_IMPORT] import_failure'", 'Failed import should be logged.');
assertContains('disabled={isImportPending}', 'Import controls should disable while pending.');
assertContains('styles.quickActionButtonDisabled', 'Toolbar import button should have disabled styling.');
assertContains('styles.preflightActionDisabled', 'Modal import button should have disabled styling.');
assertContains('wasRouteFileRecentlyImported(fileKey)', 'Duplicate selected files should be suppressed at import layer.');
assertContains('releaseRouteImportPending();', 'Pending state should be released on cancel, success, and failure paths.');
assertContains('(input as any).oncancel', 'Web picker cancellation should release pending state when supported.');
assertContains('function importedRouteHasNavigableGeometry(route: ImportedRoute | null | undefined): boolean', 'Navigate should explicitly verify imported route geometry before staging guidance.');
assertContains('const stagedActiveImportedRoutePreviewRef = useRef<string | null>(null);', 'Navigate should dedupe active imported route preview staging.');
assertContains('const stageImportedRunPreview = useCallback(async (run: ECSRun) => {', 'Direct Navigate imports should stage imported runs into the preview guidance flow.');
assertContains('const stageActiveImportedRoutePreview = useCallback(async (route: ImportedRoute) => {', 'Navigate should stage active imported routes into the preview guidance flow.');
assertContains('if (!importedRouteHasNavigableGeometry(route)) {', 'Waypoint-only imports must not show Start Guidance.');
assertContains('const linkedRun = route.linked_run_id ? runStore.getById(route.linked_run_id) : null;', 'Active imported route staging should reuse linked runs.');
assertContains('const run = linkedRun ?? runStore.createFromRoute(route, activeRun?.build_snapshot);', 'Active imported route staging should create a run from route geometry when needed.');
assertContains('routeStore.attachRun(route.id, run.id);', 'Created imported-route runs should be linked back to the route.');
assertContains('const previewPayload = buildNavigationPayloadFromRun(run);', 'Active imported route staging should use the existing route preview payload adapter.');
assertContains('await applyExploreNavigationPayload(previewPayload);', 'Active imported route staging should enter the normal pre-guidance preview flow.');
assertContains('await stageImportedRunPreview(run);', 'Fresh GPX/KML/GeoJSON imports should show the normal pre-guidance preview after import.');
assertContains('void stageActiveImportedRoutePreview(activeImportedRoute);', 'Navigate should stage the active imported route when it becomes available.');

console.log('Navigate import dedupe regression checks passed.');
