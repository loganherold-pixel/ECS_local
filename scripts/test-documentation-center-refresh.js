const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');

function read(...parts) {
  return fs.readFileSync(path.join(root, ...parts), 'utf8');
}

const modal = read('components', 'intel', 'DocumentPreviewModal.tsx');
const center = read('components', 'intel', 'DocumentationCenter.tsx');

assert.ok(
  modal.includes("export const ECS_VERSION = 'v5.0';") &&
    modal.includes("export const ECS_BUILD = '2026.05.23';"),
  'Documentation metadata should reflect the ECS 5.0 field-test documentation refresh.',
);

assert.ok(
  modal.includes('Trip Builder, and Offline Prep') &&
    modal.includes('Field Utilities contains Weather, Quick Note, Comms, Team Ping') &&
    modal.includes('Convoy live sharing is opt-in'),
  'Use Instructions should mention current Explore, Field Utilities, and convoy behavior.',
);

assert.ok(
  modal.includes('Provider secrets and service-role credentials are kept server-side') &&
    modal.includes('Invite codes should be stored as hashes, not raw codes') &&
    modal.includes('Sign-in navigation should not clear saved local fleet, route, or field setup'),
  'Data Handling and Privacy documents should match current server-side, convoy, and local-data behavior.',
);

assert.ok(
  center.includes("{ id: 'offline-prep', title: 'Offline Prep Packet'") &&
    center.includes("{ id: 'field-utilities', title: 'Field Utilities Reference'"),
  'Operational documents should include Offline Prep and Field Utilities references.',
);

assert.ok(
  center.includes("case 'offline-prep':") &&
    center.includes('ECS needs geometry before it can know which tiles') &&
    center.includes('GPX export when route geometry exists in this build'),
  'Offline Prep generated document should explain the route geometry requirement.',
);

assert.ok(
  center.includes("case 'field-utilities':") &&
    center.includes('Long press the Dashboard button') &&
    center.includes('Documentation: system references and operational document exports'),
  'Field Utilities generated document should describe the relocated Documentation action.',
);

console.log('Documentation Center refresh checks passed.');
