const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');

function read(...parts) {
  return fs.readFileSync(path.join(root, ...parts), 'utf8');
}

const quickActions = read('components', 'QuickActionsSheet.tsx');
const profilePanel = read('components', 'ProfileSettingsPanel.tsx');

assert.ok(
  !profilePanel.includes('CommandHubIntelInserts') &&
    !profilePanel.includes('>INTEL<'),
  'Command hub should no longer render the Intel insert section.',
);

assert.ok(
  quickActions.includes("key: 'permits-access'") &&
    quickActions.includes("label: 'Permits & Access'") &&
    quickActions.includes("onPress: () => openFieldUtilityAction('permitsAccess')"),
  'Field Utilities should expose Permits & Access as a normal action tile.',
);

assert.ok(
  quickActions.includes("key: 'trip-summaries'") &&
    quickActions.includes("label: 'Trip Summaries'") &&
    quickActions.includes("onPress: () => openFieldUtilityAction('tripSummaries')"),
  'Field Utilities should expose Trip Summaries as a normal action tile.',
);

assert.ok(
  quickActions.includes("const documentationTile: QuickActionTile") &&
    quickActions.includes("key: 'documentation'") &&
    quickActions.includes('styles.documentationTile'),
  'Documentation should render as a dedicated full-width bottom tile.',
);

assert.ok(
  quickActions.includes("case 'permitsAccess':") &&
    quickActions.includes('return renderPermitsAccessPanel();') &&
    quickActions.includes("case 'tripSummaries':") &&
    quickActions.includes('return renderTripSummariesPanel();') &&
    quickActions.includes("case 'documentation':") &&
    quickActions.includes('return renderDocumentationPanel();'),
  'Field Utilities should route the relocated actions to their panels.',
);

assert.ok(
  quickActions.includes("import PermitsAccessPanel from './intel/PermitsAccessPanel';") &&
    quickActions.includes("import TripSummaries from './intel/TripSummaries';") &&
    quickActions.includes("import DocumentationCenter from './intel/DocumentationCenter';"),
  'Relocated Field Utilities actions should reuse existing Intel panel components.',
);

console.log('Field Utilities command hub relocation checks passed.');
