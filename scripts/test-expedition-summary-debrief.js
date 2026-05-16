const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const summaryCardPath = path.join(root, 'components', 'dashboard', 'ExpeditionSummaryCard.tsx');
const expeditionTabPath = path.join(root, 'components', 'dashboard', 'ExpeditionTab.tsx');
const debriefModalPath = path.join(root, 'components', 'dashboard', 'ExpeditionDebriefModal.tsx');
const debriefPath = path.join(root, 'lib', 'expedition', 'expeditionDebrief.ts');
const dashboardPath = path.join(root, 'app', '(tabs)', 'dashboard.tsx');

const summaryCard = fs.readFileSync(summaryCardPath, 'utf8');
const expeditionTab = fs.readFileSync(expeditionTabPath, 'utf8');
const debriefModal = fs.readFileSync(debriefModalPath, 'utf8');
const debrief = fs.readFileSync(debriefPath, 'utf8');
const dashboard = fs.readFileSync(dashboardPath, 'utf8');

assert.ok(summaryCard.includes('onOpenSummary'));
assert.ok(summaryCard.includes('Ready to generate PDF'));
assert.ok(!summaryCard.includes("onOpenPlaceholder('Expedition Summary')"));

assert.ok(expeditionTab.includes("import ExpeditionDebriefModal from './ExpeditionDebriefModal'"));
assert.ok(expeditionTab.includes('const [summaryVisible, setSummaryVisible] = useState(false)'));
assert.ok(expeditionTab.includes('completedRecord={completedExpeditionRecord}'));

assert.ok(debriefModal.includes('exportExpeditionDebriefPdf'));
assert.ok(debriefModal.includes('Export PDF'));
assert.ok(debriefModal.includes('No completed route found'));

assert.ok(debrief.includes('buildCompletedExpeditionDebrief'));
assert.ok(debrief.includes('exportExpeditionDebriefPdf'));
assert.ok(debrief.includes('buildDocumentPayload'));
assert.ok(debrief.includes('does not invent unsupported incidents'));
assert.ok(debrief.includes("source: 'completed_log'"));

assert.ok(dashboard.includes('latestCompletedExpeditionLog'));
assert.ok(dashboard.includes('completedExpeditionSummaryRecord'));
assert.ok(dashboard.includes('completedExpeditionRecord={completedExpeditionSummaryRecord}'));

console.log('Expedition summary debrief wiring checks passed.');
