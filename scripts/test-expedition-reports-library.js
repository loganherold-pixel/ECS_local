const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const hubSource = read('components/dashboard/ExpeditionTab.tsx');
const reportStoreSource = read('lib/expedition/expeditionReportStore.ts');
const indexSource = read('lib/expedition/index.ts');

[
  'getAllExpeditionReports',
  'getReportsForTrip',
  'getMostRecentReports',
  'deleteExpeditionReport',
  'downloadExpeditionReport',
  'shareExpeditionReport',
].forEach((helper) => {
  assert(reportStoreSource.includes(`export async function ${helper}`), `Report store should export ${helper}.`);
  assert(indexSource.includes(helper), `Expedition barrel should export ${helper}.`);
});

[
  'ExpeditionReportsView',
  'ReportLibraryItem',
  'Expedition Reports',
  'getMostRecentReports',
  'expeditionReports',
  'hasReports',
  'setShowReportsView(true)',
  'formatReportFileStatus',
  'formatFileSize',
  'fsGetInfo(report.localUri)',
  'downloadExpeditionReport(report.id)',
].forEach((snippet) => {
  assert(hubSource.includes(snippet), `Reports library UI should include ${snippet}.`);
});

[
  'Report file unavailable.',
  'You can regenerate this report from the expedition detail screen.',
  'Format',
  'Status',
  'Size',
].forEach((copy) => {
  assert(hubSource.includes(copy), `Reports library should render requested copy: ${copy}.`);
});

[
  'cloud backup',
  'report search',
  'regeneration from library',
  'batch export',
  'print-specific formatting',
].forEach((todo) => {
  assert(
    hubSource.includes(todo) || reportStoreSource.includes(todo),
    `Reports library future hook should mention ${todo}.`,
  );
});

assert(
  hubSource.includes('{hasReports ? (') &&
    hubSource.includes('label="Expedition Reports"'),
  'Expedition Reports action should be conditional on real report metadata.',
);

for (const forbidden of [
  'fake report',
  'placeholder report',
  'SafetyChecklist',
  'EXPEDITION_BADGE_DEFINITIONS.map',
  'Locked Badge',
]) {
  assert(!hubSource.includes(forbidden), `Reports library UI should avoid forbidden behavior: ${forbidden}.`);
  assert(!reportStoreSource.includes(forbidden), `Report store should avoid forbidden behavior: ${forbidden}.`);
}

console.log('Expedition reports library checks passed.');
