const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const quickActionsSource = fs
  .readFileSync(path.join(root, 'components', 'QuickActionsSheet.tsx'), 'utf8')
  .replace(/\r\n/g, '\n');
const tripSummariesSource = fs
  .readFileSync(path.join(root, 'components', 'intel', 'TripSummaries.tsx'), 'utf8')
  .replace(/\r\n/g, '\n');

function assertIncludes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function assertNotIncludes(source, fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

function styleBlock(source, styleName) {
  const start = source.indexOf(`${styleName}: {`);
  assert.notStrictEqual(start, -1, `Expected style block ${styleName} to exist.`);
  const closeMatch = source.slice(start).match(/\n\s*},/);
  assert.ok(closeMatch, `Expected style block ${styleName} to close.`);
  return source.slice(start, start + closeMatch.index);
}

assertIncludes(
  tripSummariesSource,
  "summaryCard: {\n    backgroundColor: 'rgba(0,0,0,0.22)',",
  'Trip Summaries should keep the reference translucent summary card surface.',
);
assertIncludes(
  tripSummariesSource,
  "borderColor: 'rgba(196, 138, 44, 0.2)'",
  'Trip Summaries should keep the reference amber border.',
);
assertIncludes(
  tripSummariesSource,
  "backgroundColor: 'rgba(62, 79, 60, 0.08)'",
  'Trip Summaries should keep the reference low-opacity inner tile surface.',
);

assertNotIncludes(
  quickActionsSource,
  'ACTION STACK',
  'Field Utilities main panel should not render the redundant ActionStack title.',
);
assertNotIncludes(
  quickActionsSource,
  'Operational shortcuts',
  'Field Utilities main panel should not render the redundant Operational Shortcuts copy.',
);
assertNotIncludes(
  quickActionsSource,
  'styles.fieldUtilitiesCommandHeader',
  'Field Utilities main panel should not render the removed ActionStack command header container.',
);

[
  'noteInput',
  'savedNoteCard',
  'infoCard',
  'commsSectionCard',
  'commsEntryRow',
  'commsCoordinatesCard',
].forEach((styleName) => {
  const block = styleBlock(quickActionsSource, styleName);
  assertIncludes(
    block,
    "backgroundColor: 'rgba(0,0,0,0.22)'",
    `${styleName} should match the Trip Summaries translucent card background.`,
  );
  assertIncludes(
    block,
    "borderColor: 'rgba(196, 138, 44, 0.2)'",
    `${styleName} should match the Trip Summaries amber border transparency.`,
  );
});

[
  'commsEditInput',
  'savedNoteCardSelected',
].forEach((styleName) => {
  const block = styleBlock(quickActionsSource, styleName);
  assertIncludes(
    block,
    "backgroundColor: 'rgba(62, 79, 60, 0.08)'",
    `${styleName} should use the Trip Summaries low-opacity inner tile background.`,
  );
  assertIncludes(
    block,
    "borderColor: 'rgba(62, 79, 60, 0.12)'",
    `${styleName} should use the Trip Summaries low-opacity inner tile border.`,
  );
});

console.log('Field Utilities Trip Summary surface contract passed.');
