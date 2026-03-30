/**
 * ChecklistData — Pre-departure Checklist Template Items
 *
 * Grouped by category with common overland items.
 * Each item has a suggested container key for "Assign Container" flow.
 *
 * Categories:
 *   1. Recovery
 *   2. Medical
 *   3. Power
 *   4. Water
 *   5. Shelter / Sleep
 *   6. Tools / Spares
 */

export interface ChecklistItem {
  id: string;
  name: string;
  /** Suggested container key (for quick-assign) */
  suggestedContainer: string | null;
  /** Whether this is a critical item */
  isCritical: boolean;
  /** Approximate weight in lbs (optional, for quick-add) */
  approxWeightLbs?: number;
}

export interface ChecklistGroup {
  id: string;
  label: string;
  iconName: string;
  color: string;
  items: ChecklistItem[];
}

export const CHECKLIST_GROUPS: ChecklistGroup[] = [
  {
    id: 'recovery',
    label: 'Recovery',
    iconName: 'construct-outline',
    color: '#AB47BC',
    items: [
      { id: 'rec_01', name: 'Recovery Straps (2x)', suggestedContainer: 'recovery_mount', isCritical: true, approxWeightLbs: 8 },
      { id: 'rec_02', name: 'Soft Shackles (4x)', suggestedContainer: 'recovery_mount', isCritical: true, approxWeightLbs: 1.5 },
      { id: 'rec_03', name: 'Traction Boards (pair)', suggestedContainer: 'recovery_mount', isCritical: false, approxWeightLbs: 25 },
      { id: 'rec_04', name: 'Hi-Lift Jack', suggestedContainer: 'bed_drawer', isCritical: false, approxWeightLbs: 28 },
      { id: 'rec_05', name: 'Snatch Block / Pulley', suggestedContainer: 'recovery_mount', isCritical: false, approxWeightLbs: 5 },
      { id: 'rec_06', name: 'Winch Extension Rope', suggestedContainer: 'recovery_mount', isCritical: false, approxWeightLbs: 4 },
      { id: 'rec_07', name: 'Tire Deflator / Inflator', suggestedContainer: 'interior_storage', isCritical: true, approxWeightLbs: 2 },
      { id: 'rec_08', name: 'Tire Plug Kit', suggestedContainer: 'interior_storage', isCritical: true, approxWeightLbs: 0.5 },
    ],
  },
  {
    id: 'medical',
    label: 'Medical',
    iconName: 'medkit-outline',
    color: '#EF5350',
    items: [
      { id: 'med_01', name: 'IFAK (Individual First Aid Kit)', suggestedContainer: 'interior_storage', isCritical: true, approxWeightLbs: 2 },
      { id: 'med_02', name: 'Tourniquet (CAT)', suggestedContainer: 'interior_storage', isCritical: true, approxWeightLbs: 0.2 },
      { id: 'med_03', name: 'Trauma Shears', suggestedContainer: 'interior_storage', isCritical: false, approxWeightLbs: 0.2 },
      { id: 'med_04', name: 'Chest Seal (2x)', suggestedContainer: 'interior_storage', isCritical: false, approxWeightLbs: 0.1 },
      { id: 'med_05', name: 'Burn Gel / Dressing', suggestedContainer: 'interior_storage', isCritical: false, approxWeightLbs: 0.3 },
      { id: 'med_06', name: 'Prescription Medications', suggestedContainer: 'interior_storage', isCritical: true, approxWeightLbs: 0.5 },
      { id: 'med_07', name: 'Allergy / EpiPen', suggestedContainer: 'interior_storage', isCritical: true, approxWeightLbs: 0.1 },
    ],
  },
  {
    id: 'power',
    label: 'Power',
    iconName: 'flash-outline',
    color: '#FFB74D',
    items: [
      { id: 'pwr_01', name: 'Jumper Cables / Jump Pack', suggestedContainer: 'power_system', isCritical: true, approxWeightLbs: 5 },
      { id: 'pwr_02', name: 'USB Charging Cables', suggestedContainer: 'interior_storage', isCritical: false, approxWeightLbs: 0.3 },
      { id: 'pwr_03', name: '12V Adapter / Inverter', suggestedContainer: 'power_system', isCritical: false, approxWeightLbs: 2 },
      { id: 'pwr_04', name: 'Headlamp (w/ spare batteries)', suggestedContainer: 'interior_storage', isCritical: true, approxWeightLbs: 0.5 },
      { id: 'pwr_05', name: 'Flashlight / Lantern', suggestedContainer: 'interior_storage', isCritical: false, approxWeightLbs: 1 },
      { id: 'pwr_06', name: 'Portable Power Station', suggestedContainer: 'power_system', isCritical: false, approxWeightLbs: 12 },
    ],
  },
  {
    id: 'water',
    label: 'Water',
    iconName: 'water-outline',
    color: '#26A69A',
    items: [
      { id: 'wtr_01', name: 'Water Filter / Purifier', suggestedContainer: 'water_storage', isCritical: true, approxWeightLbs: 1.5 },
      { id: 'wtr_02', name: 'Jerry Can (5 gal)', suggestedContainer: 'water_storage', isCritical: false, approxWeightLbs: 3 },
      { id: 'wtr_03', name: 'Collapsible Water Container', suggestedContainer: 'water_storage', isCritical: false, approxWeightLbs: 0.5 },
      { id: 'wtr_04', name: 'Water Purification Tablets', suggestedContainer: 'interior_storage', isCritical: false, approxWeightLbs: 0.1 },
      { id: 'wtr_05', name: 'Hydration Bladder (3L)', suggestedContainer: 'interior_storage', isCritical: false, approxWeightLbs: 0.5 },
    ],
  },
  {
    id: 'shelter',
    label: 'Shelter / Sleep',
    iconName: 'trail-sign-outline',
    color: '#C77DFF',
    items: [
      { id: 'shl_01', name: 'Sleeping Bag', suggestedContainer: 'rtt', isCritical: false, approxWeightLbs: 4 },
      { id: 'shl_02', name: 'Sleeping Pad / Mattress', suggestedContainer: 'rtt', isCritical: false, approxWeightLbs: 3 },
      { id: 'shl_03', name: 'Pillow', suggestedContainer: 'rtt', isCritical: false, approxWeightLbs: 1 },
      { id: 'shl_04', name: 'Blanket / Liner', suggestedContainer: 'rtt', isCritical: false, approxWeightLbs: 2 },
      { id: 'shl_05', name: 'Ground Tarp', suggestedContainer: 'bed_drawer', isCritical: false, approxWeightLbs: 2 },
      { id: 'shl_06', name: 'Camp Chair (2x)', suggestedContainer: 'bed_drawer', isCritical: false, approxWeightLbs: 8 },
      { id: 'shl_07', name: 'Camp Table', suggestedContainer: 'bed_drawer', isCritical: false, approxWeightLbs: 6 },
    ],
  },
  {
    id: 'tools',
    label: 'Tools / Spares',
    iconName: 'hammer-outline',
    color: '#78909C',
    items: [
      { id: 'tls_01', name: 'Multi-Tool / Leatherman', suggestedContainer: 'interior_storage', isCritical: true, approxWeightLbs: 0.5 },
      { id: 'tls_02', name: 'Duct Tape', suggestedContainer: 'bed_drawer', isCritical: false, approxWeightLbs: 0.5 },
      { id: 'tls_03', name: 'Zip Ties (assorted)', suggestedContainer: 'bed_drawer', isCritical: false, approxWeightLbs: 0.2 },
      { id: 'tls_04', name: 'Spare Fuses', suggestedContainer: 'interior_storage', isCritical: true, approxWeightLbs: 0.1 },
      { id: 'tls_05', name: 'Socket Set / Wrenches', suggestedContainer: 'bed_drawer', isCritical: false, approxWeightLbs: 8 },
      { id: 'tls_06', name: 'Shovel (folding)', suggestedContainer: 'bed_drawer', isCritical: false, approxWeightLbs: 5 },
      { id: 'tls_07', name: 'Axe / Hatchet', suggestedContainer: 'bed_drawer', isCritical: false, approxWeightLbs: 3 },
      { id: 'tls_08', name: 'Fire Extinguisher', suggestedContainer: 'interior_storage', isCritical: true, approxWeightLbs: 5 },
      { id: 'tls_09', name: 'Tow Hitch Pin', suggestedContainer: 'recovery_mount', isCritical: false, approxWeightLbs: 0.5 },
      { id: 'tls_10', name: 'Spare Belts / Hoses', suggestedContainer: 'bed_drawer', isCritical: false, approxWeightLbs: 1 },
    ],
  },
];

/**
 * Get all checklist items as a flat array.
 */
export function getAllChecklistItems(): ChecklistItem[] {
  return CHECKLIST_GROUPS.flatMap(g => g.items);
}

/**
 * Get total item count across all groups.
 */
export function getTotalChecklistItemCount(): number {
  return CHECKLIST_GROUPS.reduce((sum, g) => sum + g.items.length, 0);
}



