const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const typesSource = fs.readFileSync(path.join(root, 'lib', 'campIntel', 'campIntelTypes.ts'), 'utf8');
const selectorSource = fs.readFileSync(path.join(root, 'lib', 'campIntel', 'campIntelSelectors.ts'), 'utf8');
const detailSource = fs.readFileSync(path.join(root, 'components', 'navigate', 'CampIntelDetailCard.tsx'), 'utf8');

function assertIncludes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function assertNotIncludes(source, fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

function assertOrdered(source, first, second, message) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  assert.ok(firstIndex !== -1 && secondIndex !== -1 && firstIndex < secondIndex, message);
}

// Source labels for dispersed ECS camp candidates.
for (const label of ['ECS-Inferred', 'User-Supported', 'Field-Confirmed', 'Disputed', 'Avoid / Restricted']) {
  assertIncludes(typesSource, label, `Camp Intel evidence source label should include ${label}.`);
  assertIncludes(selectorSource + detailSource, label, `Camp Intel presentation should render or derive ${label}.`);
}

// Required evidence rows and terminology.
for (const label of ['Camp Intel', 'Evidence quality', 'Intel Confidence', 'Latest Evidence', 'Access', 'Restriction Signal', 'Land-Use Confidence', 'Use Pressure']) {
  assertIncludes(detailSource, label, `Camp Intel popup should expose ${label}.`);
}

assertIncludes(
  selectorSource,
  "evidenceTypes.length === 0\n      ? 'None'",
  'ECS-Inferred candidates with no field evidence should show Latest Evidence: None.',
);
assertIncludes(
  selectorSource,
  "? 'Last Field Report'",
  'Field-confirmed candidates should use Last Field Report instead of Last Verified.',
);
assertIncludes(
  selectorSource,
  "? 'Conflicting reports'",
  'Disputed candidates should expose conflicting evidence without pretending the spot is official.',
);
assertIncludes(
  selectorSource,
  "? 'Restriction report'",
  'Avoid / Restricted candidates should expose restriction reports.',
);
assertIncludes(
  selectorSource,
  "photoEvidenceCount: null",
  'Photo counts should not be invented when candidate photo metadata is unavailable.',
);
assertIncludes(
  detailSource,
  "evidence.photoEvidenceCount != null && evidence.photoEvidenceCount > 0",
  'Photo evidence rows should render only when actual photo metadata exists.',
);
assertOrdered(
  detailSource,
  '<Text style={styles.sectionTitle}>Evidence quality</Text>',
  '<Text style={styles.sectionTitle}>Location / Latest Evidence</Text>',
  'Evidence quality should appear before location/source context in the popup.',
);

// Avoid campground/listing terminology on ECS-inferred dispersed candidates.
assertNotIncludes(detailSource, 'AI-Inferred', 'Camp Intel must use ECS-Inferred, not AI-Inferred.');
assertNotIncludes(detailSource, 'Crowding', 'Camp Intel must use Use Pressure, not Crowding.');
assertNotIncludes(detailSource, 'Last Verified', 'Dispersed camp candidates must not use Last Verified.');
assertNotIncludes(detailSource, 'Open / Closed', 'Dispersed camp candidates must not render campground-style Open / Closed state.');
assertNotIncludes(detailSource, "label: 'Vehicle fit'", 'Camp Intel should not duplicate the existing Vehicle Fit label for campsite access evidence.');
assertIncludes(detailSource, "label: 'Final approach fit'", 'Camp Intel should label camp-specific vehicle access as final approach fit.');
assertNotIncludes(detailSource, 'accessConfidence.label} (${site.confidenceBreakdown.accessConfidence.score})', 'Camp Intel should not show raw access-confidence numbers.');
assertNotIncludes(typesSource + selectorSource + detailSource, 'reservation', 'Camp Intel evidence presentation must not add booking/reservation fields.');

console.log('Camp Intel evidence presentation checks passed.');
