const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'components', 'dashboard', 'WidgetRenderers.tsx'), 'utf8');

function includes(fragment, message) {
  assert.ok(source.includes(fragment), message);
}

includes('eyebrow="ECS COMMAND MODULE"', 'Attitude Command should render the ECS Command Module selector popup.');
includes('title="Change Center Module"', 'Command selector title should remain unchanged.');
includes('maxWidth={540}', 'Command selector popup should be slightly wider to prevent row clipping.');
includes('moduleSelectorState: {', 'Command selector should define an action state pill style.');
includes('minWidth: 70', 'Command selector action pill should reserve enough width for SELECT.');
includes('flexShrink: 0', 'Command selector action pill should not shrink and clip SELECT.');
includes('paddingHorizontal: 10', 'Command selector action pill should keep readable horizontal padding.');
includes("{selected ? 'ACTIVE' : 'SELECT'}", 'Command selector should preserve SELECT/ACTIVE action copy.');

console.log('Command module selector layout checks passed.');
