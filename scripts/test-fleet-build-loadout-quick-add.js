const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(repoRoot, 'components/fleet/FleetBuildLoadoutModal.tsx'), 'utf8').replace(/\r\n/g, '\n');
const catalog = fs.readFileSync(path.join(repoRoot, 'lib/fleet/fleetLoadoutQuickAddCatalog.ts'), 'utf8').replace(/\r\n/g, '\n');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const loadoutEditorStart = source.indexOf('title={editingLoadoutItem ? \'Edit Loadout Item\' : \'Add Loadout Item\'}');
assert(loadoutEditorStart >= 0, 'Add Loadout Item editor modal should exist.');

const loadoutEditorSource = source.slice(loadoutEditorStart, source.indexOf('</ECSModalShell>', loadoutEditorStart));

assert(
  loadoutEditorSource.includes('maxHeightFraction={1}') &&
    loadoutEditorSource.includes('minHeightFraction={1}') &&
    loadoutEditorSource.includes('showHandle={false}') &&
    loadoutEditorSource.includes('allowSwipeDismiss={false}'),
  'Add Loadout Item sheet should fill the ECS body and avoid accidental partial-height dismissal.',
);

assert(
  source.includes('FLEET_LOADOUT_QUICK_ADD_CATALOG') &&
    source.includes('FLEET_LOADOUT_QUICK_ADD_CATEGORIES') &&
    source.includes('selectedQuickAddCategoryId') &&
    source.includes('selectedQuickAddIds') &&
    source.includes('toggleQuickAddSelection') &&
    source.includes('bulkAddLoadoutItems'),
  'Build/loadout editor should include categorized quick-add catalog selection state and bulk-add behavior.',
);

assert(
  loadoutEditorSource.indexOf('PLACEMENT / COMPARTMENT') < loadoutEditorSource.indexOf('styles.inlineSaveSection') &&
    loadoutEditorSource.indexOf('styles.inlineSaveSection') < loadoutEditorSource.indexOf('Quick Add Item List'),
  'Manual Save Item action should sit below placement and above the quick-add item list.',
);

assert(
  loadoutEditorSource.includes('accessibilityRole="checkbox"') &&
    loadoutEditorSource.includes('accessibilityState={{ checked: selected }}') &&
    loadoutEditorSource.includes('contentContainerStyle={styles.quickCategoryRail}') &&
    loadoutEditorSource.includes('style={styles.quickAddListScroll}') &&
    loadoutEditorSource.includes('label="Bulk Add"'),
  'Quick-add categories should switch a scrollable selectable item list with a Bulk Add action.',
);

assert(
  source.includes('source: \'ecs_default\'') &&
    source.includes('confidence: 72') &&
    source.includes('upsertFleetCompartmentLoadoutItem(nextState, item)'),
  'Bulk-added starter items should use ECS default estimates and normal loadout upsert behavior.',
);

const quickAddItemCount = (catalog.match(/categoryId: '/g) ?? []).length;
const quickAddCategoryCount = (catalog.match(/\{ id: '[a-z_]+', label: '/g) ?? []).length;

assert(
  quickAddItemCount === 200,
  `Quick-add catalog should contain exactly 200 common expedition items, found ${quickAddItemCount}.`,
);

assert(
  quickAddCategoryCount >= 12 &&
    catalog.includes("{ id: 'kitchen', label: 'Kitchen' }") &&
    catalog.includes("{ id: 'recovery', label: 'Recovery' }") &&
    catalog.includes("{ id: 'power', label: 'Power' }") &&
    catalog.includes("{ id: 'safety_medical', label: 'Safety / Medical' }"),
  'Quick-add catalog should be organized into expedition-relevant categories.',
);

console.log('Fleet build/loadout quick-add checks passed.');
