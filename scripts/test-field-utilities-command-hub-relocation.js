const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');

function read(...parts) {
  return fs.readFileSync(path.join(root, ...parts), 'utf8');
}

const quickActions = read('components', 'QuickActionsSheet.tsx');
const incidentRecoveryPanel = read('components', 'dashboard', 'IncidentRecoveryPanel.tsx');
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
    quickActions.includes('const compactUtilityTiles = [incidentRecoveryTile, documentationTile];'),
  'Documentation should render in the shared compact full-width launcher stack.',
);

assert.ok(
  quickActions.includes("import IncidentRecoveryPanel from './dashboard/IncidentRecoveryPanel';") &&
    quickActions.includes("const incidentRecoveryTile: QuickActionTile = {") &&
    quickActions.includes("onPress: () => openFieldUtilityAction('incidentRecovery')") &&
    quickActions.includes('styles.compactUtilityTile') &&
    quickActions.includes('const renderIncidentRecoveryPanel = () => (') &&
    quickActions.includes('<IncidentRecoveryPanel') &&
    quickActions.includes('modalStackBehavior="allow-stack"') &&
    quickActions.includes("case 'incidentRecovery':") &&
    quickActions.includes('return renderIncidentRecoveryPanel();'),
  'Field Utilities should open the complete Incident & Recovery workflow from a compact launcher.',
);

assert.ok(
  incidentRecoveryPanel.includes("modalStackBehavior = 'replace'") &&
    incidentRecoveryPanel.includes('stackBehavior={modalStackBehavior}') &&
    incidentRecoveryPanel.includes('style?: StyleProp<ViewStyle>') &&
    incidentRecoveryPanel.includes('styles.panel,') &&
    incidentRecoveryPanel.includes('style,'),
  'Incident & Recovery modals should support allow-stack nesting so Field Utilities stays open while action modals are used.',
);

assert.ok(
  quickActions.includes('compactUtilityTileStack: {') &&
    quickActions.includes('compactUtilityTile: {') &&
    quickActions.includes('minHeight: 50,') &&
    !quickActions.includes('incidentRecoveryUtilitySlot: {') &&
    !quickActions.includes('height: 260,'),
  'Field Utilities should reclaim the fixed Incident & Recovery slot for larger image action buttons.',
);

assert.ok(
  quickActions.includes("case 'permitsAccess':") &&
    quickActions.includes('return renderPermitsAccessPanel();') &&
    quickActions.includes("case 'tripSummaries':") &&
    quickActions.includes('return renderTripSummariesPanel();') &&
    quickActions.includes("case 'incidentRecovery':") &&
    quickActions.includes('return renderIncidentRecoveryPanel();') &&
    quickActions.includes("case 'documentation':") &&
    quickActions.includes('return renderDocumentationPanel();'),
  'Field Utilities should route the relocated actions to their panels.',
);

assert.ok(
    quickActions.includes("import PermitsAccessPanel from './intel/PermitsAccessPanel';") &&
    quickActions.includes("import TripSummaries from './intel/TripSummaries';") &&
    quickActions.includes("import DocumentationCenter from './intel/DocumentationCenter';") &&
    quickActions.includes("import IncidentRecoveryPanel from './dashboard/IncidentRecoveryPanel';"),
  'Relocated Field Utilities actions should reuse existing Intel panel components.',
);

console.log('Field Utilities command hub relocation checks passed.');
