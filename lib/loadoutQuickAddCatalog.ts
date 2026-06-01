import type { LoadoutItemCategory, WeightSource } from './types';

export type QuickAddWeightSourceType = 'manufacturer_spec' | 'retailer_spec' | 'category_average';

type QuickAddBucketId =
  | 'shelter'
  | 'sleep'
  | 'cooking'
  | 'water'
  | 'food_storage'
  | 'refrigeration'
  | 'lighting'
  | 'recovery'
  | 'repair_tools'
  | 'navigation'
  | 'comms'
  | 'hygiene'
  | 'first_aid'
  | 'power_charging'
  | 'camp_furniture'
  | 'fire_warmth'
  | 'trail_spares'
  | 'waste_sanitation';

export type QuickAddGroupId =
  | 'shelter'
  | 'recovery'
  | 'repair_tools'
  | 'camp_furniture'
  | 'food_storage'
  | 'power_charging'
  | 'miscellaneous';

export interface QuickAddGroup {
  id: QuickAddGroupId;
  label: string;
  icon: string;
  color: string;
}

interface QuickAddBucket {
  id: QuickAddBucketId;
  groupId: QuickAddGroupId;
  label: string;
  icon: string;
  color: string;
  category: LoadoutItemCategory;
}

export interface QuickAddCatalogSeed {
  id: string;
  displayName: string;
  groupId: QuickAddBucketId;
  defaultQuantity: number;
  defaultWeightLbs: number;
  weightUnit: 'lb';
  weightSourceType: QuickAddWeightSourceType;
  sourceNote?: string;
  aliases?: string[];
  keywords?: string[];
  isCritical?: boolean;
}

export interface QuickAddCatalogItem extends QuickAddCatalogSeed {
  persistedCategory: LoadoutItemCategory;
  persistedWeightSource: WeightSource;
  filterGroupId: QuickAddGroupId;
  tags: string[];
}

const group = (
  id: QuickAddGroupId,
  label: string,
  icon: string,
  color: string,
): QuickAddGroup => ({ id, label, icon, color });

const bucket = (
  id: QuickAddBucketId,
  groupId: QuickAddGroupId,
  label: string,
  icon: string,
  color: string,
  category: LoadoutItemCategory,
): QuickAddBucket => ({ id, groupId, label, icon, color, category });

const seed = (
  id: string,
  displayName: string,
  groupId: QuickAddBucketId,
  defaultWeightLbs: number,
  options: Partial<Omit<QuickAddCatalogSeed, 'id' | 'displayName' | 'groupId' | 'defaultWeightLbs' | 'weightUnit'>> = {},
): QuickAddCatalogSeed => ({
  id,
  displayName,
  groupId,
  defaultQuantity: options.defaultQuantity ?? 1,
  defaultWeightLbs,
  weightUnit: 'lb',
  weightSourceType: options.weightSourceType ?? 'category_average',
  sourceNote: options.sourceNote,
  aliases: options.aliases ?? [],
  keywords: options.keywords ?? [],
  isCritical: options.isCritical ?? false,
});

export const QUICK_ADD_GROUPS: QuickAddGroup[] = [
  group('shelter', 'Shelter', 'home-outline', '#9C7BEA'),
  group('recovery', 'Recovery', 'construct-outline', '#E07C4F'),
  group('repair_tools', 'Repair and Tools', 'hammer-outline', '#8B949E'),
  group('camp_furniture', 'Camp Furniture', 'grid-outline', '#C7B299'),
  group('food_storage', 'Food Storage', 'archive-outline', '#F4A261'),
  group('power_charging', 'Power and Charging', 'battery-charging-outline', '#50C878'),
  group('miscellaneous', 'Miscellaneous', 'albums-outline', '#6E7B87'),
];

const QUICK_ADD_BUCKETS: QuickAddBucket[] = [
  bucket('shelter', 'shelter', 'Shelter', 'home-outline', '#9C7BEA', 'shelter'),
  bucket('sleep', 'shelter', 'Sleep', 'bed-outline', '#7C9EFF', 'shelter'),
  bucket('cooking', 'food_storage', 'Cooking', 'flame-outline', '#D4A017', 'food'),
  bucket('water', 'food_storage', 'Water', 'water-outline', '#4FC3F7', 'water'),
  bucket('food_storage', 'food_storage', 'Food Storage', 'archive-outline', '#F4A261', 'food'),
  bucket('refrigeration', 'food_storage', 'Refrigeration', 'snow-outline', '#64DFDF', 'food'),
  bucket('lighting', 'miscellaneous', 'Lighting', 'bulb-outline', '#F9D65C', 'power'),
  bucket('recovery', 'recovery', 'Recovery', 'construct-outline', '#E07C4F', 'recovery'),
  bucket('repair_tools', 'repair_tools', 'Repair and Tools', 'hammer-outline', '#8B949E', 'tools'),
  bucket('navigation', 'miscellaneous', 'Navigation', 'compass-outline', '#26A69A', 'navigation'),
  bucket('comms', 'miscellaneous', 'Comms', 'radio-outline', '#5AC8FA', 'comms'),
  bucket('hygiene', 'miscellaneous', 'Hygiene', 'water-outline', '#81C784', 'general'),
  bucket('first_aid', 'recovery', 'First Aid', 'medkit-outline', '#E05050', 'medical'),
  bucket('power_charging', 'power_charging', 'Power and Charging', 'battery-charging-outline', '#50C878', 'power'),
  bucket('camp_furniture', 'camp_furniture', 'Camp Furniture', 'grid-outline', '#C7B299', 'general'),
  bucket('fire_warmth', 'miscellaneous', 'Fire and Warmth', 'bonfire-outline', '#FF8A5B', 'general'),
  bucket('trail_spares', 'repair_tools', 'Trail Spares', 'cog-outline', '#B0BEC5', 'tools'),
  bucket('waste_sanitation', 'miscellaneous', 'Waste and Sanitation', 'trash-outline', '#9E9E9E', 'general'),
];

const CATALOG_SEEDS: QuickAddCatalogSeed[] = [
  seed('shelter_rtt_compact', 'Rooftop Tent (Compact Hard Shell)', 'shelter', 125, { weightSourceType: 'manufacturer_spec', sourceNote: 'Representative compact hard-shell rooftop tent', aliases: ['roof top tent', 'rtt', 'hard shell tent'] }),
  seed('shelter_ground_tent_2p', 'Ground Tent (2 Person)', 'shelter', 5.5, { aliases: ['2p tent', 'backpacking tent'] }),
  seed('shelter_ground_tent_4p', 'Ground Tent (4 Person)', 'shelter', 11.8, { aliases: ['family tent', '4p tent'] }),
  seed('shelter_awning_2500', 'Vehicle Awning (2.5m Class)', 'shelter', 31.5, { weightSourceType: 'manufacturer_spec', aliases: ['touring awning', 'side awning'] }),
  seed('shelter_tarp', 'Tarp (10 x 10)', 'shelter', 3.1, { aliases: ['rain tarp', 'utility tarp'] }),
  seed('shelter_stakes', 'Stake & Guyline Kit', 'shelter', 1.4, { aliases: ['tent stakes', 'guy line kit'] }),
  seed('sleep_bag_cold', 'Sleeping Bag (Cold Weather)', 'sleep', 4.2, { aliases: ['0 degree bag', 'cold bag'] }),
  seed('sleep_bag_three', 'Sleeping Bag (3 Season)', 'sleep', 3.1, { aliases: ['three season bag'] }),
  seed('sleep_pad_inflatable', 'Sleeping Pad (Inflatable)', 'sleep', 1.8, { aliases: ['air pad', 'camp pad'] }),
  seed('sleep_blanket', 'Camp Blanket', 'sleep', 2.6, { aliases: ['puffy blanket'] }),
  seed('sleep_pillow', 'Camp Pillow', 'sleep', 0.6, { aliases: ['travel pillow'] }),
  seed('sleep_bivy', 'Emergency Bivy', 'sleep', 0.4, { isCritical: true, aliases: ['bivy sack', 'emergency bivvy'] }),
  seed('cooking_stove_system', 'Stove System (Integrated)', 'cooking', 0.82, { weightSourceType: 'manufacturer_spec', sourceNote: 'Representative integrated canister stove system', aliases: ['jetboil style stove', 'integrated stove'] }),
  seed('cooking_stove_dual', 'Camp Stove (Dual Burner)', 'cooking', 12.0, { aliases: ['two burner stove', 'camp chef stove'] }),
  seed('cooking_cookset', 'Cook Set', 'cooking', 4.5, { aliases: ['pots and pans', 'camp cookware'] }),
  seed('cooking_utensils', 'Utensil Set', 'cooking', 0.8, { aliases: ['cutlery set'] }),
  seed('cooking_board', 'Cutting Board', 'cooking', 1.0),
  seed('cooking_kettle', 'Camp Kettle', 'cooking', 1.4, { aliases: ['tea kettle'] }),
  seed('cooking_coffee', 'Coffee Press / Percolator', 'cooking', 1.6, { aliases: ['coffee maker', 'percolator'] }),
  seed('cooking_propane', 'Propane Canister (1 lb)', 'cooking', 1.8, { aliases: ['propane bottle'] }),
  seed('water_jug_7', 'Water Jug (7 Gallon)', 'water', 3.5, { aliases: ['7 gallon jug', 'rigid water jug'] }),
  seed('water_jug_5', 'Water Jug (5 Gallon)', 'water', 2.4, { aliases: ['5 gallon jug', 'collapsible jug'] }),
  seed('water_bladder', 'Hydration Bladder (3L)', 'water', 0.5, { aliases: ['camelbak bladder'] }),
  seed('water_bottle', 'Water Bottle (32 oz)', 'water', 0.4),
  seed('water_filter_pump', 'Water Filter (Pump)', 'water', 1.2, { isCritical: true, aliases: ['pump filter'] }),
  seed('water_filter_gravity', 'Water Filter (Gravity)', 'water', 1.0, { aliases: ['gravity filter'] }),
  seed('water_tabs', 'Purification Tablets', 'water', 0.1, { isCritical: true }),
  seed('water_extra_jug', 'Extra Water Jug', 'water', 2.8, { aliases: ['reserve water jug'] }),
  seed('food_bin', 'Dry Food Bin', 'food_storage', 3.0, { aliases: ['food tote', 'pantry bin'] }),
  seed('food_bear', 'Bear Canister', 'food_storage', 2.8),
  seed('food_bag', 'Food Dry Bag', 'food_storage', 0.8, { aliases: ['dry bag'] }),
  seed('food_spice', 'Spice Kit', 'food_storage', 1.0),
  seed('food_kitchen_roll', 'Kitchen Roll / Tool Roll', 'food_storage', 2.0, { aliases: ['kitchen organizer'] }),
  seed('fridge_45l', '12V Fridge (45L Class)', 'refrigeration', 41.2, { weightSourceType: 'manufacturer_spec', sourceNote: 'Representative 45L powered fridge', aliases: ['powered fridge', '12v cooler', 'dometic cfx3 45'] }),
  seed('fridge_cooler_hard', 'Hard Cooler (45 qt)', 'refrigeration', 23.0),
  seed('fridge_cooler_soft', 'Soft Cooler', 'refrigeration', 4.5),
  seed('fridge_ice_pack', 'Ice Pack Kit', 'refrigeration', 2.4),
  seed('light_headlamp', 'Headlamp', 'lighting', 0.3, { isCritical: true }),
  seed('light_lantern', 'Lantern', 'lighting', 1.2),
  seed('light_flashlight', 'Flashlight', 'lighting', 0.5, { aliases: ['tactical flashlight'] }),
  seed('light_string', 'Camp String Lights', 'lighting', 0.9),
  seed('light_work', 'Rechargeable Work Light', 'lighting', 1.6, { aliases: ['area light'] }),
  seed('recovery_boards', 'Traction Boards (Pair)', 'recovery', 15.0, { isCritical: true, weightSourceType: 'manufacturer_spec', sourceNote: 'Representative composite recovery board pair', aliases: ['maxtrax', 'traction mats', 'recovery boards'] }),
  seed('recovery_strap', 'Recovery Strap (30 ft)', 'recovery', 9.5, { isCritical: true }),
  seed('recovery_rope', 'Kinetic Recovery Rope', 'recovery', 12.0, { aliases: ['snatch rope'] }),
  seed('recovery_soft_shackle', 'Soft Shackles (Pair)', 'recovery', 0.5, { isCritical: true }),
  seed('recovery_block', 'Snatch Block', 'recovery', 7.0),
  seed('recovery_tree_saver', 'Tree Saver Strap', 'recovery', 3.5),
  seed('recovery_ext', 'Winch Extension Line', 'recovery', 8.0),
  seed('recovery_shackle', 'Bow Shackle (3/4 in)', 'recovery', 2.2),
  seed('recovery_gloves', 'Recovery Gloves', 'recovery', 0.6, { aliases: ['work gloves'] }),
  seed('tools_compressor', 'Portable Air Compressor', 'repair_tools', 8.0, { isCritical: true, aliases: ['12v compressor', 'air compressor'] }),
  seed('tools_tire_repair', 'Tire Repair Kit', 'repair_tools', 2.0, { isCritical: true }),
  seed('tools_shovel', 'Shovel', 'repair_tools', 5.5, { aliases: ['folding shovel'] }),
  seed('tools_tool_roll', 'Tool Roll', 'repair_tools', 6.5),
  seed('tools_socket', 'Socket Set (Compact)', 'repair_tools', 6.0),
  seed('tools_multi', 'Multi-Tool', 'repair_tools', 0.5),
  seed('tools_ratchet', 'Ratchet Strap Set', 'repair_tools', 4.0),
  seed('tools_zip', 'Zip Tie Assortment', 'repair_tools', 0.3),
  seed('tools_tape', 'Duct Tape Roll', 'repair_tools', 0.7),
  seed('tools_gauge', 'Tire Pressure Gauge', 'repair_tools', 0.2),
  seed('nav_maps', 'Paper Maps', 'navigation', 0.5),
  seed('nav_compass', 'Compass', 'navigation', 0.2),
  seed('nav_gps', 'Handheld GPS', 'navigation', 0.6),
  seed('nav_notebook', 'Route Notebook', 'navigation', 0.4, { aliases: ['trail notebook'] }),
  seed('nav_binoculars', 'Binoculars (Compact)', 'navigation', 1.2),
  seed('comms_sat', 'Satellite Communicator', 'comms', 0.4, { isCritical: true, aliases: ['inreach', 'sat communicator'] }),
  seed('comms_gmrs', 'GMRS Radio', 'comms', 0.8),
  seed('comms_ham', 'Mobile HAM Radio', 'comms', 3.2, { aliases: ['ham radio'] }),
  seed('comms_cb', 'CB Radio', 'comms', 2.5),
  seed('comms_battery', 'Radio Battery Pack', 'comms', 0.7),
  seed('hygiene_toilet', 'Toilet Kit', 'hygiene', 3.0),
  seed('hygiene_shower', 'Portable Shower', 'hygiene', 4.0),
  seed('hygiene_towel', 'Towel Kit', 'hygiene', 1.2),
  seed('hygiene_wipes', 'Hygiene Wipes Pack', 'hygiene', 0.8),
  seed('hygiene_wash', 'Wash Kit', 'hygiene', 1.0, { aliases: ['toiletry bag'] }),
  seed('firstaid_med', 'First Aid Kit', 'first_aid', 3.5, { isCritical: true }),
  seed('firstaid_ifak', 'Trauma Kit / IFAK', 'first_aid', 1.8, { isCritical: true, aliases: ['trauma kit', 'ifak'] }),
  seed('firstaid_ext', 'Fire Extinguisher', 'first_aid', 5.0, { isCritical: true }),
  seed('firstaid_blanket', 'Emergency Blanket (2 Pack)', 'first_aid', 0.3, { isCritical: true }),
  seed('firstaid_spray', 'Bear Spray', 'first_aid', 1.2),
  seed('firstaid_sunscreen', 'Sunscreen', 'first_aid', 0.4),
  seed('power_station', 'Portable Power Station (500Wh Class)', 'power_charging', 12.9, { weightSourceType: 'manufacturer_spec', sourceNote: 'Representative 500Wh portable power station', aliases: ['power station', 'yeti 500x'] }),
  seed('power_panel', 'Solar Panel (100W)', 'power_charging', 12.0, { weightSourceType: 'retailer_spec', aliases: ['folding solar panel'] }),
  seed('power_bank', 'USB Power Bank (20,000mAh)', 'power_charging', 1.0),
  seed('power_jump', 'Jumper Pack', 'power_charging', 4.0, { isCritical: true, aliases: ['jump starter'] }),
  seed('power_inverter', 'Inverter (400W)', 'power_charging', 2.5),
  seed('power_cable', 'Charging Cable Kit', 'power_charging', 0.8),
  seed('power_cord', 'Extension Cord (25 ft)', 'power_charging', 3.0),
  seed('furniture_chair', 'Camp Chair', 'camp_furniture', 5.0),
  seed('furniture_table', 'Folding Camp Table', 'camp_furniture', 11.0),
  seed('furniture_stool', 'Camp Stool', 'camp_furniture', 2.2),
  seed('furniture_tote', 'Kitchen Bin / Drawer Tote', 'camp_furniture', 3.0),
  seed('warmth_bag', 'Firewood Bag', 'fire_warmth', 1.5),
  seed('warmth_starter', 'Fire Starter Kit', 'fire_warmth', 0.6),
  seed('warmth_heater', 'Portable Heater', 'fire_warmth', 10.5),
  seed('warmth_wool', 'Wool Blanket', 'fire_warmth', 4.2),
  seed('warmth_match', 'Lighter / Match Kit', 'fire_warmth', 0.2),
  seed('spares_belt', 'Spare Serpentine Belt', 'trail_spares', 1.0, { isCritical: true }),
  seed('spares_oil', 'Spare Engine Oil', 'trail_spares', 2.0, { aliases: ['engine oil'] }),
  seed('spares_coolant', 'Spare Coolant', 'trail_spares', 2.3),
  seed('spares_brake', 'Brake Fluid', 'trail_spares', 1.0),
  seed('spares_fuses', 'Fuse Assortment', 'trail_spares', 0.2, { isCritical: true }),
  seed('spares_hose', 'Hose Repair Kit', 'trail_spares', 0.8),
  seed('spares_chocks', 'Wheel Chocks', 'trail_spares', 3.2),
  seed('spares_blocks', 'Leveling Blocks', 'trail_spares', 8.0),
  seed('waste_trash', 'Trash Bag Kit', 'waste_sanitation', 0.8),
  seed('waste_bag', 'Waste Bag Pack', 'waste_sanitation', 0.5),
  seed('waste_tote', 'Sanitation Tote', 'waste_sanitation', 2.0),
  seed('waste_tp', 'Toilet Paper Kit', 'waste_sanitation', 0.7),
  seed('waste_soap', 'Biodegradable Soap', 'waste_sanitation', 0.4),
];

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function toPersistedWeightSource(source: QuickAddWeightSourceType): WeightSource {
  switch (source) {
    case 'manufacturer_spec':
    case 'retailer_spec':
      return 'manufacturer';
    case 'category_average':
    default:
      return 'estimate';
  }
}

function dedupeCatalog(seeds: QuickAddCatalogSeed[]): QuickAddCatalogItem[] {
  const byKey = new Map<string, QuickAddCatalogItem>();
  for (const seedItem of seeds) {
    const bucketMeta = QUICK_ADD_BUCKETS.find((bucketItem) => bucketItem.id === seedItem.groupId);
    if (!bucketMeta) continue;
    const keys = [seedItem.displayName, ...(seedItem.aliases ?? [])].map(normalizeToken).filter(Boolean);
    const existing = keys.map((key) => byKey.get(key)).find(Boolean);
    if (existing) {
      existing.aliases = Array.from(new Set([...(existing.aliases ?? []), ...(seedItem.aliases ?? [])]));
      existing.keywords = Array.from(new Set([...(existing.keywords ?? []), ...(seedItem.keywords ?? [])]));
      existing.tags = Array.from(new Set([
        ...existing.tags,
        seedItem.groupId,
        bucketMeta.label,
        bucketMeta.groupId,
        ...(seedItem.keywords ?? []),
        ...(seedItem.aliases ?? []),
      ].map(normalizeToken).filter(Boolean)));
      continue;
    }
    const item: QuickAddCatalogItem = {
      ...seedItem,
      persistedCategory: bucketMeta.category,
      persistedWeightSource: toPersistedWeightSource(seedItem.weightSourceType),
      filterGroupId: bucketMeta.groupId,
      tags: Array.from(new Set([
        seedItem.groupId,
        bucketMeta.label,
        bucketMeta.groupId,
        ...(seedItem.keywords ?? []),
        ...(seedItem.aliases ?? []),
        seedItem.displayName,
      ].map(normalizeToken).filter(Boolean))),
    };
    keys.forEach((key) => byKey.set(key, item));
  }
  return Array.from(new Set(byKey.values())).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export const QUICK_ADD_CATALOG = dedupeCatalog(CATALOG_SEEDS);

export function getQuickAddGroup(groupId: QuickAddGroupId): QuickAddGroup | undefined {
  return QUICK_ADD_GROUPS.find((group) => group.id === groupId);
}

export function getQuickAddItemById(itemId: string): QuickAddCatalogItem | undefined {
  return QUICK_ADD_CATALOG.find((item) => item.id === itemId);
}

export function getQuickAddItemsForGroup(groupId: QuickAddGroupId): QuickAddCatalogItem[] {
  return QUICK_ADD_CATALOG.filter((item) => item.filterGroupId === groupId);
}

export function searchQuickAddCatalog(searchText: string, activeGroupId?: QuickAddGroupId | null): QuickAddCatalogItem[] {
  const query = normalizeToken(searchText);
  return QUICK_ADD_CATALOG.filter((item) => {
    if (activeGroupId && item.filterGroupId !== activeGroupId) return false;
    if (!query) return true;
    return item.tags.some((tag) => tag.includes(query));
  });
}
