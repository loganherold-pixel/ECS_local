const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const componentPath = path.join(root, 'components', 'campsites', 'MyCampsiteSubmissions.tsx');
const moreTabPath = path.join(root, 'app', '(tabs)', 'more.tsx');
const servicePath = path.join(root, 'lib', 'campsites', 'campsiteSubmissionService.ts');
const typesPath = path.join(root, 'lib', 'campsites', 'campsiteRecommendationTypes.ts');
const migrationPath = path.join(root, 'supabase', 'migrations', '014_campsite_submitter_review_loop.sql');

const component = fs.readFileSync(componentPath, 'utf8');
const moreTab = fs.readFileSync(moreTabPath, 'utf8');
const service = fs.readFileSync(servicePath, 'utf8');
const types = fs.readFileSync(typesPath, 'utf8');
const migration = fs.readFileSync(migrationPath, 'utf8');

assert.ok(component.includes('My Campsite Submissions'), 'Submitter screen should use the requested title.');
assert.ok(component.includes('Private saves'), 'Screen should bucket private saves.');
assert.ok(component.includes('Group shares'), 'Screen should bucket group shares.');
assert.ok(component.includes('Pending community review'), 'Screen should bucket pending community submissions.');
assert.ok(component.includes('Needs info'), 'Screen should bucket needs-info submissions.');
assert.ok(component.includes('Approved'), 'Screen should bucket approved submissions.');
assert.ok(component.includes('Rejected'), 'Screen should bucket rejected submissions.');
assert.ok(component.includes('Withdrawn'), 'Screen should bucket withdrawn submissions.');
assert.ok(
  component.includes('Pending review — not visible to the community.') ||
    service.includes('Pending review — not visible to the community.'),
  'Screen should show pending review copy.',
);
assert.ok(
  component.includes('Needs more information before reviewers can continue.') ||
    service.includes('Needs more information before reviewers can continue.'),
  'Screen should show needs-info copy.',
);
assert.ok(component.includes('Withdraw submission'), 'Screen should expose withdraw copy.');
assert.ok(
  component.includes('Approved and published') || service.includes('Approved and published'),
  'Screen should show approved copy.',
);
assert.ok(component.includes('Status timeline'), 'Detail should render a status timeline.');
assert.ok(component.includes('submitPrivateSaveToCommunity'), 'Private saves should expose community submission action.');
assert.ok(component.includes('respondToNeedsInfo'), 'Needs-info action should call the submitter service.');
assert.ok(component.includes('withdrawMyCampsiteSubmission'), 'Withdraw action should call the submitter service.');

assert.ok(
  moreTab.includes("import MyCampsiteSubmissions from '../../components/campsites/MyCampsiteSubmissions'"),
  'More tab should import My Campsite Submissions.',
);
assert.ok(moreTab.includes("'my-campsites'"), 'More tab should include a my-campsites subtab.');
assert.ok(moreTab.includes('<MyCampsiteSubmissions'), 'More tab should render the submitter screen.');

assert.ok(service.includes('listMyCampsiteSubmissions'), 'Service should list current user submissions.');
assert.ok(service.includes('getMyCampsiteSubmission'), 'Service should get current user submission detail.');
assert.ok(service.includes('updateMyCampsiteSubmission'), 'Service should update allowed submitter fields.');
assert.ok(service.includes('withdrawMyCampsiteSubmission'), 'Service should withdraw pre-publication submissions.');
assert.ok(service.includes('respondToNeedsInfo'), 'Service should support correction responses.');
assert.ok(service.includes('ALLOWED_SUBMITTER_UPDATE_FIELDS'), 'Service should isolate allowed submitter fields.');
assert.ok(service.includes('permission_denied'), 'Service should reject cross-user access.');

assert.ok(types.includes("'withdrawn'"), 'Types should include withdrawn review state and event type.');
assert.ok(types.includes("'submitter_updated'"), 'Types should include submitter update events.');
assert.ok(types.includes("'needs_info_responded'"), 'Types should include needs-info response events.');

assert.ok(
  migrationPath.endsWith('014_campsite_submitter_review_loop.sql'),
  'Migration should be named for submitter review loop.',
);
assert.ok(migration.includes("'withdrawn'"), 'Migration should allow withdrawn review state.');
assert.ok(migration.includes("'submitter_updated'"), 'Migration should allow submitter update events.');
assert.ok(migration.includes("'needs_info_responded'"), 'Migration should allow needs-info response events.');

console.log('campsite submissions UI tests passed');
