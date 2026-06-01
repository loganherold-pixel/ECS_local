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

console.log('Navigate import dedupe regression checks passed.');
