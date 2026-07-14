const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const scenario = read('lib/dispatchLostCommunicationsPlaybook.ts');
const frameworkTypes = read('lib/dispatchOperationalPlaybookTypes.ts');
const frameworkDomain = read('lib/dispatchOperationalPlaybookDomain.ts');
const commandCenter = read('components/dispatch/DispatchCadCommandCenter.tsx');

assert.match(scenario, /LOST_COMMUNICATIONS_PLAYBOOK_DEFINITION/);
assert.match(scenario, /ecs_team_coordination_only/);
assert.match(scenario, /no_response_review/);
assert.match(scenario, /member_responded/);
assert.match(scenario, /escalate_for_operator_review/);
assert.match(scenario, /explicitOperatorChoice/);
assert.match(scenario, /createConvoyRegroupDispatchContext/);
assert.match(scenario, /ReportIncidentInput/);
assert.match(scenario, /import type \{[\s\S]*ReportIncidentInput[\s\S]*\} from '\.\/incidentRecoveryWorkflowStore'/);

assert.match(frameworkTypes, /command_created/);
assert.match(frameworkDomain, /linkOperationalPlaybookCommand/);

assert.doesNotMatch(
  scenario,
  /\.reportIncident\(|contactEmergencyServices|sendSms|placePhoneCall/,
  'Lost Communications may prepare an incident handoff but must not create or transmit one.',
);
assert.doesNotMatch(
  scenario,
  /setInterval|setTimeout/,
  'Lost Communications uses the shared absolute-time Mission Clock instead of scenario timers.',
);
assert.doesNotMatch(
  commandCenter,
  /executeOperationalPlaybookStep|transitionOperationalPlaybookState|createOperationalPlaybookInstance/,
  'Operational Playbook business logic must remain outside the Dispatch mega-screen.',
);

console.log('Dispatch Lost Communications characterization checks passed.');
