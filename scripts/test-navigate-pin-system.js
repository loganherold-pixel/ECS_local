const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const navigateSource = read('app/(tabs)/navigate.tsx');
const drawerSource = read('components/navigate/PinDrawer.tsx');
const sheetSource = read('components/navigate/DroppedPinDetailSheet.tsx');
const storeSource = read('lib/pinStore.ts');

assert(
  navigateSource.includes("import DroppedPinDetailSheet from '../../components/navigate/DroppedPinDetailSheet'"),
  'Navigate should import DroppedPinDetailSheet',
);
assert(navigateSource.includes('selectedDroppedPinId'), 'Navigate should track selected dropped pin state');
assert(navigateSource.includes('<DroppedPinDetailSheet'), 'Navigate should render dropped pin detail sheet');
assert(navigateSource.includes('onEdit={handleDroppedPinEdit}'), 'Dropped pin sheet should wire edit action');
assert(navigateSource.includes('onClear={handleDroppedPinClear}'), 'Dropped pin sheet should wire clear action');
assert(navigateSource.includes('onNavigateHere={handleDroppedPinNavigateHere}'), 'Dropped pin sheet should wire navigate action');
assert(navigateSource.includes('onClose={handleDroppedPinClose}'), 'Dropped pin sheet should wire close action');
assert(navigateSource.includes('setSelectedDroppedPinId(pin.id)'), 'Map pin tap should select the dropped pin');
assert(
  navigateSource.includes('setPendingPinRoadLabel(longPressContext.routeableFeature?.name ?? longPressContext.routeableFeature?.sourceLabel ?? null)'),
  'Long-press Add Waypoint should preserve road/source label for the dropped pin detail sheet',
);
assert(
  navigateSource.includes("sourceType: 'saved_pin'"),
  'Dropped pin Navigate Here should create a saved-pin road navigation destination',
);
assert(navigateSource.includes('onClearAllPins={handleClearAllPins}'), 'Pin drawer should receive clear all handler');

assert(sheetSource.includes('Latitude') || sheetSource.includes('LATITUDE'), 'Dropped pin sheet should show latitude');
assert(sheetSource.includes('Longitude') || sheetSource.includes('LONGITUDE'), 'Dropped pin sheet should show longitude');
assert(sheetSource.includes('Nearest road'), 'Dropped pin sheet should show nearest road field');
assert(sheetSource.includes('Notes'), 'Dropped pin sheet should show notes');
assert(sheetSource.includes('Edit'), 'Dropped pin sheet should show edit action');
assert(sheetSource.includes('Navigate'), 'Dropped pin sheet should show navigate action');
assert(sheetSource.includes('Clear Pin'), 'Dropped pin sheet should show clear action');
assert(sheetSource.includes('Close'), 'Dropped pin sheet should show close action');
assert(
  sheetSource.includes('Not resolved for this dropped pin.'),
  'Dropped pin sheet should avoid faking nearest road when no resolver is available',
);

assert(drawerSource.includes('CLEAR ALL PINS'), 'Pin drawer should include clear all pins button');
assert(
  drawerSource.includes('Are you sure you would like to remove all pins?'),
  'Pin drawer should confirm before clearing all pins',
);
assert(drawerSource.includes("text: 'No'"), 'Clear all confirmation should provide No');
assert(drawerSource.includes("text: 'Yes'"), 'Clear all confirmation should provide Yes');

assert(storeSource.includes('deleteAll: ()'), 'Pin store should expose deleteAll');
assert(storeSource.includes('deleteMany: (ids: string[])'), 'Pin store should expose scoped deleteMany');
assert(storeSource.includes('road_label?: string | null'), 'Pin store create payload should accept optional road/source labels');
assert(storeSource.includes('road_label: data.road_label ?? null'), 'Pin store should persist the optional road/source label');

console.log('Navigate pin system static checks passed');
