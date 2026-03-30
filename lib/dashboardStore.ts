/**
 * Dashboard Persistence Store
 *
 * Manages 3 dashboard profiles (expedition, vehicle, emergency)
 * with per-profile widget layouts, widget settings, and UI state.
 *
 * Supports grid layouts: 1x1, 1x2, 1x3, 2x1, 2x2, 2x3
 * Supports custom widgets (IDs starting with 'custom-')
 * Supports dashboard modes: expedition / highway
 * Supports auto-collapse when stationary
 * Supports advanced modeling mode
 *
 * Integrates with centralized Widget Registry for governance.
 *
 * Persistence Architecture:
 * - In-memory cache for synchronous reads (all store methods are sync)
 * - Async persistence via dashboardPersistence.ts (expo-file-system on native, localStorage on web)
 * - Debounced writes coalesce rapid mutations into single disk writes
 * - hydrateDashboardState() must be called once at app startup to load from disk
 * - On web, localStorage is also written synchronously for backward compat
 *
 * Hydration Flow:
 * 1. App launches → _cachedState is null → getStorage() returns createDefaultState()
 * 2. AppContext calls hydrateDashboardState() during initialization
 * 3. Persistence layer reads from disk/localStorage → populates _cachedState
 * 4. All subsequent getStorage() calls return the hydrated state
 * 5. Every saveStorage() updates _cachedState AND schedules async disk write
 */

import { customWidgetStore, type CustomWidgetDefinition } from './customWidgetStore';
import {
  WIDGET_REGISTRY,
  getWidgetEntry,
  getDefaultDashboardWidgets,
  getDashboardLibraryWidgets,
  isDuplicate,
  isDashboardEmpty,
  canRemoveWidget,
  isCoreInstrument,
  CORE_INSTRUMENT_IDS,
  type WidgetRegistryEntry,
} from './widgetRegistry';

import { queueDashboardAction } from './syncActionQueue';
import {
  readDashboardState,
  writeDashboardState,
  readCustomPresets,
  writeCustomPresets,
  markHydrated,
  isHydrated,
  flushPendingWrites,
} from './dashboardPersistence';


/** Expedition Tactical Preset ID constant */
export const EXPEDITION_TACTICAL_PRESET_ID = 'expedition-tactical';



export type DashboardProfile = 'expedition' | 'vehicle' | 'emergency';

export type GridLayout = '1x1' | '1x2' | '1x3' | '2x1' | '2x2' | '2x3';

/** Widget cell span size: colSpan x rowSpan */
export type WidgetSize = '1x1' | '1x2' | '2x1' | '2x2';

export const WIDGET_SIZE_CONFIG: Record<WidgetSize, { colSpan: number; rowSpan: number; label: string }> = {
  '1x1': { colSpan: 1, rowSpan: 1, label: '1\u00D71' },
  '1x2': { colSpan: 1, rowSpan: 2, label: '1\u00D72' },
  '2x1': { colSpan: 2, rowSpan: 1, label: '2\u00D71' },
  '2x2': { colSpan: 2, rowSpan: 2, label: '2\u00D72' },
};

/** Get available widget sizes for a given grid layout */
export function getAvailableSizes(gridLayout: GridLayout): WidgetSize[] {
  const config = GRID_LAYOUT_CONFIG[gridLayout];
  const sizes: WidgetSize[] = ['1x1'];
  if (config.rows >= 2) sizes.push('1x2');
  if (config.cols >= 2) sizes.push('2x1');
  if (config.cols >= 2 && config.rows >= 2) sizes.push('2x2');
  return sizes;
}

/** Cycle to the next available widget size */
export function cycleWidgetSize(current: WidgetSize, gridLayout: GridLayout): WidgetSize {
  const available = getAvailableSizes(gridLayout);
  const idx = available.indexOf(current);
  if (idx === -1) return available[0];
  return available[(idx + 1) % available.length];
}

// ── Collision Detection for Widget Resizing ───────────────

export interface ResizeCollisionInfo {
  /** Whether any collision was detected */
  hasCollision: boolean;
  /** Whether the new size would exceed grid bounds at the widget's current position */
  outOfBounds: boolean;
  /** List of widgets that would be overlapped by the resize */
  conflictingSlots: {
    slotIndex: number;
    widgetType: string;
    widgetName: string;
  }[];
}

/**
 * Simplified placement algorithm that returns grid cell positions only.
 * Mirrors the WidgetGrid computePlacements logic but without pixel math.
 */
interface CellPlacement {
  slotIndex: number;
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
}

function computeCellPlacements(
  slots: WidgetSlot[],
  gridLayout: GridLayout,
): CellPlacement[] {
  const config = GRID_LAYOUT_CONFIG[gridLayout];
  const gridCols = config.cols;
  const gridRows = config.rows;
  const maxRows = gridRows * 2; // allow overflow

  const occupied: boolean[][] = Array.from({ length: maxRows }, () =>
    Array(gridCols).fill(false)
  );

  const placements: CellPlacement[] = [];

  for (const slot of slots) {
    const sizeKey = slot.widgetType ? getSlotSize(slot) : '1x1';
    const sizeConfig = WIDGET_SIZE_CONFIG[sizeKey];

    let colSpan = Math.min(sizeConfig.colSpan, gridCols);
    let rowSpan = Math.min(sizeConfig.rowSpan, gridRows);

    if (!slot.widgetType) {
      colSpan = 1;
      rowSpan = 1;
    }

    let placed = false;
    for (let r = 0; r < maxRows - rowSpan + 1 && !placed; r++) {
      for (let c = 0; c <= gridCols - colSpan && !placed; c++) {
        let fits = true;
        for (let dr = 0; dr < rowSpan && fits; dr++) {
          for (let dc = 0; dc < colSpan && fits; dc++) {
            if (occupied[r + dr][c + dc]) fits = false;
          }
        }
        if (fits) {
          for (let dr = 0; dr < rowSpan; dr++) {
            for (let dc = 0; dc < colSpan; dc++) {
              occupied[r + dr][c + dc] = true;
            }
          }
          placements.push({
            slotIndex: slot.slotIndex,
            col: c,
            row: r,
            colSpan,
            rowSpan,
          });
          placed = true;
        }
      }
    }

    // Fallback: place as 1x1
    if (!placed) {
      for (let r = 0; r < maxRows && !placed; r++) {
        for (let c = 0; c < gridCols && !placed; c++) {
          if (!occupied[r][c]) {
            occupied[r][c] = true;
            placements.push({
              slotIndex: slot.slotIndex,
              col: c,
              row: r,
              colSpan: 1,
              rowSpan: 1,
            });
            placed = true;
          }
        }
      }
    }
  }

  return placements;
}

/**
 * Detect if resizing a widget would collide with adjacent widgets.
 *
 * Algorithm:
 * 1. Compute current cell placements for all widgets
 * 2. Find the target widget's current grid position (col, row)
 * 3. Calculate the cells the target would occupy with the new size
 * 4. Check if any of those cells overlap with other widgets' cells
 * 5. Also check if the new size exceeds grid bounds at the current position
 *
 * @returns CollisionInfo with details about any conflicts
 */
export function detectResizeCollision(
  slots: WidgetSlot[],
  gridLayout: GridLayout,
  targetSlotIndex: number,
  newSize: WidgetSize,
): ResizeCollisionInfo {
  const config = GRID_LAYOUT_CONFIG[gridLayout];
  const gridCols = config.cols;
  const gridRows = config.rows;

  // Step 1: Compute current placements
  const placements = computeCellPlacements(slots, gridLayout);

  // Step 2: Find the target widget's current placement
  const targetPlacement = placements.find(p => p.slotIndex === targetSlotIndex);
  if (!targetPlacement) {
    return { hasCollision: false, outOfBounds: false, conflictingSlots: [] };
  }

  // Step 3: Calculate new cells needed
  const newSizeConfig = WIDGET_SIZE_CONFIG[newSize];
  const newColSpan = Math.min(newSizeConfig.colSpan, gridCols);
  const newRowSpan = Math.min(newSizeConfig.rowSpan, gridRows);

  // Check bounds: would the new size fit at the current position?
  const outOfBounds =
    (targetPlacement.col + newColSpan > gridCols) ||
    (targetPlacement.row + newRowSpan > gridRows);

  // Step 4: Build a set of cells the target currently occupies
  const targetCells = new Set<string>();
  for (let dr = 0; dr < targetPlacement.rowSpan; dr++) {
    for (let dc = 0; dc < targetPlacement.colSpan; dc++) {
      targetCells.add(`${targetPlacement.row + dr},${targetPlacement.col + dc}`);
    }
  }

  // Step 5: Calculate new cells the target would need
  const newCells: string[] = [];
  for (let dr = 0; dr < newRowSpan; dr++) {
    for (let dc = 0; dc < newColSpan; dc++) {
      const cellKey = `${targetPlacement.row + dr},${targetPlacement.col + dc}`;
      // Only check cells that are NEW (not already occupied by the target)
      if (!targetCells.has(cellKey)) {
        newCells.push(cellKey);
      }
    }
  }

  // Step 6: Build a map of all cells occupied by OTHER widgets
  const cellOwnerMap = new Map<string, number>(); // cell key → slotIndex
  for (const p of placements) {
    if (p.slotIndex === targetSlotIndex) continue;
    for (let dr = 0; dr < p.rowSpan; dr++) {
      for (let dc = 0; dc < p.colSpan; dc++) {
        cellOwnerMap.set(`${p.row + dr},${p.col + dc}`, p.slotIndex);
      }
    }
  }

  // Step 7: Check for collisions
  const conflictingSlotIndices = new Set<number>();
  for (const cell of newCells) {
    const owner = cellOwnerMap.get(cell);
    if (owner !== undefined) {
      conflictingSlotIndices.add(owner);
    }
  }

  // Step 8: Build collision info with widget names
  const catalog = getFullWidgetCatalog();
  const conflictingSlots = Array.from(conflictingSlotIndices).map(si => {
    const slot = slots.find(s => s.slotIndex === si);
    const widgetType = slot?.widgetType || '';
    const widgetDef = catalog.find(w => w.type === widgetType);
    return {
      slotIndex: si,
      widgetType,
      widgetName: widgetDef?.name || widgetType || 'Unknown Widget',
    };
  });

  return {
    hasCollision: conflictingSlots.length > 0 || outOfBounds,
    outOfBounds,
    conflictingSlots,
  };
}



export type DashboardMode = 'expedition' | 'highway';



export const GRID_LAYOUT_CONFIG: Record<GridLayout, { cols: number; rows: number; total: number; label: string }> = {
  '1x1': { cols: 1, rows: 1, total: 1, label: '1 x 1' },
  '1x2': { cols: 1, rows: 2, total: 2, label: '1 x 2' },
  '1x3': { cols: 1, rows: 3, total: 3, label: '1 x 3' },
  '2x1': { cols: 2, rows: 1, total: 2, label: '2 x 1' },
  '2x2': { cols: 2, rows: 2, total: 4, label: '2 x 2' },
  '2x3': { cols: 2, rows: 3, total: 6, label: '2 x 3' },
};

export const GRID_LAYOUTS_ORDERED: GridLayout[] = ['1x1', '1x2', '1x3', '2x1', '2x2', '2x3'];

export type WidgetType =
  | 'status-overview'
  | 'route-progress'
  | 'loadout-readiness'
  | 'water-projection'
  | 'fuel-range'
  | 'vehicle-health'
  | 'emergency-controls'
  | 'power-systems'
  | 'vehicle-systems'
  | 'stability-index'
  | 'attitude-monitor'
  | 'mission-sustainment'
  | 'operational-readiness'
  | 'sustainability'
  | 'progress'
  | 'remoteness'
  | 'expedition-channel'
  | 'trip-demand-analyzer'
  | 'vehicle-twin'
  | 'ecoflow-power'
  // Highway widgets
  | 'hwy-forward-weather'
  | 'hwy-daylight-remaining'
  | 'hwy-cell-coverage'
  | 'hwy-wind-monitor'
  | 'hwy-elevation-profile'
  | 'hwy-road-hazards'
  | 'hwy-power-monitor'
  | 'hwy-sun-glare';




export interface WidgetDefinition {
  type: string; // WidgetType for built-in, 'custom-*' for custom
  name: string;
  description: string;
  icon: string;
  category: 'mission' | 'vehicle' | 'safety' | 'sustainment' | 'loadout' | 'system' | 'dashboard' | 'custom';
  isCustom?: boolean;
  defaultSize?: '1x1' | '1x2';
  supportsModes?: DashboardMode[];
  requiresMotion?: boolean;
}

/**
 * Build WIDGET_CATALOG from the centralized registry.
 * This maintains backward compatibility with existing code that uses WIDGET_CATALOG.
 */
export const WIDGET_CATALOG: WidgetDefinition[] = WIDGET_REGISTRY
  .filter(w => w.render_ready)
  .map(entry => ({
    type: entry.widget_id,
    name: entry.display_name,
    description: entry.description,
    icon: entry.icon,
    category: entry.category as any,
    defaultSize: entry.default_size,
    supportsModes: entry.supports_modes,
    requiresMotion: entry.requires_sensor === 'motion',
  }));

/**
 * Get the full widget catalog including custom widgets.
 * Custom widgets are loaded from customWidgetStore and merged.
 */
export function getFullWidgetCatalog(): WidgetDefinition[] {
  const customWidgets = customWidgetStore.getAll();
  const customDefs: WidgetDefinition[] = customWidgets.map(cw => ({
    type: cw.id,
    name: cw.name,
    description: cw.description,
    icon: cw.icon,
    category: 'custom' as const,
    isCustom: true,
  }));
  return [...WIDGET_CATALOG, ...customDefs];
}

/** Check if a widget type is a custom widget */
export function isCustomWidget(type: string | null): boolean {
  return type != null && type.startsWith('custom-');
}

export interface WidgetSlot {
  slotIndex: number;
  widgetType: string | null; // WidgetType for built-in, 'custom-*' for custom
  widgetSize?: WidgetSize;   // Cell span size (default '1x1')
  settings: Record<string, any>;
}

/** Helper to get the effective size of a widget slot */
export function getSlotSize(slot: WidgetSlot): WidgetSize {
  return slot.widgetSize || '1x1';
}



export interface ProfileState {
  profile: DashboardProfile;
  slots: WidgetSlot[];
  gridLayout: GridLayout;
  lastUIState: Record<string, any>;
  /** Last applied layout preset ID for this profile */
  lastUsedPreset?: string;
}


export interface DashboardState {
  activeProfile: DashboardProfile;
  profiles: Record<DashboardProfile, ProfileState>;
  /** Dashboard operating mode (expedition vs highway) */
  dashboardMode: DashboardMode;
  /** Whether auto-collapse when stationary is enabled */
  autoCollapseEnabled: boolean;
  /** Whether Advanced Modeling mode is enabled */
  advancedModeEnabled: boolean;
  /** Per-widget auto-collapse overrides (widget_id → enabled) */
  perWidgetAutoCollapse: Record<string, boolean>;
  /** Last selected dashboard tab ('expedition' | 'highway') */
  lastSelectedTab: 'expedition' | 'highway';
}


const STORAGE_KEY = 'ecs_dashboard_state';
const MAX_SLOTS = 6; // 2x3 max

function createSlots(count: number): WidgetSlot[] {
  return Array.from({ length: count }, (_, i) => ({
    slotIndex: i,
    widgetType: null,
    settings: {},
  }));
}

function createEmptySlots(): WidgetSlot[] {
  return createSlots(4);
}

function ensureSlotCount(slots: WidgetSlot[], count: number): WidgetSlot[] {
  if (slots.length >= count) return slots.slice(0, count);
  // Expand: add empty slots
  const expanded = [...slots];
  for (let i = slots.length; i < count; i++) {
    expanded.push({ slotIndex: i, widgetType: null, settings: {} });
  }
  return expanded;
}

/** Migrate old grid layouts to new ones */
function migrateGridLayout(layout: string): GridLayout {
  if (layout === '2x4' || layout === '4x4') return '2x3';
  if (GRID_LAYOUT_CONFIG[layout as GridLayout]) return layout as GridLayout;
  return '2x2';
}

function createDefaultState(): DashboardState {
  // ── Expedition Profile ──
  // 2x2 grid (2 cols × 2 rows = 4 cells)
  //   Row 0: Attitude Monitor (2x1 featured, full width)
  //   Row 1: Vehicle Systems (1x1) + Remoteness (1x1)
  //
  // 3 widgets fill all 4 cells (Attitude Monitor spans 2 cells).

  const expeditionSlots: WidgetSlot[] = [
    // Row 0: Attitude Monitor — full width (featured instrument)
    { slotIndex: 0, widgetType: 'attitude-monitor', widgetSize: '2x1', settings: {} },
    // Row 1: Vehicle Systems | Remoteness
    { slotIndex: 1, widgetType: 'vehicle-systems', widgetSize: '1x1', settings: {} },
    { slotIndex: 2, widgetType: 'remoteness', widgetSize: '1x1', settings: {} },
  ];

  // ── Highway Profile ──
  // 2x2 grid (2 cols × 2 rows = 4 cells)
  //   Row 0: Forward Weather (1x1) + Daylight Remaining (1x1)
  //   Row 1: Cell Coverage (1x1) + Wind Monitor (1x1)
  //
  // 4 equal-sized widgets in a clean 2x2 grid.

  const highwaySlots: WidgetSlot[] = [
    { slotIndex: 0, widgetType: 'hwy-forward-weather', widgetSize: '1x1', settings: {} },
    { slotIndex: 1, widgetType: 'hwy-daylight-remaining', widgetSize: '1x1', settings: {} },
    { slotIndex: 2, widgetType: 'hwy-cell-coverage', widgetSize: '1x1', settings: {} },
    { slotIndex: 3, widgetType: 'hwy-wind-monitor', widgetSize: '1x1', settings: {} },
  ];

  return {
    activeProfile: 'expedition',
    dashboardMode: 'expedition',
    autoCollapseEnabled: true,
    advancedModeEnabled: false,
    perWidgetAutoCollapse: {},
    lastSelectedTab: 'expedition',
    profiles: {
      expedition: {
        profile: 'expedition',
        gridLayout: '2x2',
        slots: expeditionSlots,
        lastUIState: {},
      },
      vehicle: {
        profile: 'vehicle',
        gridLayout: '2x2',
        slots: highwaySlots,
        lastUIState: {},
      },
      emergency: {
        profile: 'emergency',
        gridLayout: '2x2',
        slots: [
          { slotIndex: 0, widgetType: 'emergency-controls', settings: {} },
          { slotIndex: 1, widgetType: 'vehicle-systems', settings: {} },
          { slotIndex: 2, widgetType: 'sustainability', settings: {} },
          { slotIndex: 3, widgetType: 'progress', settings: {} },
        ],
        lastUIState: {},
      },
    },
  };
}










// ══════════════════════════════════════════════════════════════
// In-Memory Cache + Async Persistence
// ══════════════════════════════════════════════════════════════

/**
 * In-memory cache of the dashboard state.
 * - null = not yet hydrated (getStorage returns defaults)
 * - DashboardState = hydrated from disk or set by a mutation
 *
 * All synchronous reads go through this cache.
 * All writes update this cache AND schedule an async disk write.
 */
let _cachedState: DashboardState | null = null;

/**
 * Validate and migrate a parsed state object.
 * Ensures all profiles exist, migrates old grid layouts, and fills missing fields.
 */
function validateAndMigrate(parsed: any): DashboardState | null {
  if (!parsed || !parsed.profiles || !parsed.activeProfile) return null;

  for (const p of ['expedition', 'vehicle', 'emergency'] as DashboardProfile[]) {
    if (!parsed.profiles[p]) {
      const defaults = createDefaultState();
      parsed.profiles[p] = defaults.profiles[p];
    }
    const currentLayout = parsed.profiles[p].gridLayout || '2x2';
    parsed.profiles[p].gridLayout = migrateGridLayout(currentLayout);

    // Phase 10: Migrate retired widgets to core instrument cluster
    // If any slot contains a retired widget, replace the entire profile
    // with the default instrument cluster layout.
    // Highway widgets (hwy-*) are allowed on the vehicle profile.
    const profileSlots: WidgetSlot[] = parsed.profiles[p].slots || [];
    const isHighwayWidget = (id: string) => id.startsWith('hwy-');
    const hasRetiredWidget = profileSlots.some((s: WidgetSlot) => {
      if (!s.widgetType) return false;
      if (isHighwayWidget(s.widgetType)) return false; // Highway widgets are valid
      // Check if this widget is NOT a core instrument and NOT a known addable widget
      return !isCoreInstrument(s.widgetType)
        && s.widgetType !== 'emergency-controls'
        && s.widgetType !== 'ecoflow-power';
    });

    if (hasRetiredWidget && p !== 'emergency' && p !== 'vehicle') {
      // Replace with default instrument cluster (only for expedition profile)
      const defaults = createDefaultState();
      parsed.profiles[p] = defaults.profiles[p];
    }

  }

  if (!parsed.dashboardMode) parsed.dashboardMode = 'expedition';
  if (parsed.autoCollapseEnabled === undefined) parsed.autoCollapseEnabled = true;
  if (parsed.advancedModeEnabled === undefined) parsed.advancedModeEnabled = false;
  if (!parsed.perWidgetAutoCollapse) parsed.perWidgetAutoCollapse = {};
  if (!parsed.lastSelectedTab) parsed.lastSelectedTab = 'expedition';

  return parsed as DashboardState;
}


/**
 * Read dashboard state from the in-memory cache.
 * Returns defaults if not yet hydrated.
 */
function getStorage(): DashboardState {
  if (_cachedState) return _cachedState;

  // Fallback: try localStorage synchronously (web only, for backward compat)
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const validated = validateAndMigrate(parsed);
        if (validated) {
          _cachedState = validated;
          return validated;
        }
      }
    }
  } catch (e) {
    console.warn('[DashboardStore] localStorage fallback read failed:', e);
  }

  return createDefaultState();
}

/**
 * Write dashboard state to the in-memory cache AND schedule async persistence.
 * On web, also writes to localStorage synchronously for backward compat.
 */
function saveStorage(state: DashboardState): void {
  // Update in-memory cache
  _cachedState = state;

  // Schedule debounced async write to disk (native: expo-file-system, web: localStorage)
  try {
    const serialized = JSON.stringify(state);
    writeDashboardState(serialized);
  } catch (e) {
    console.warn('[DashboardStore] Failed to serialize state:', e);
  }
}

/**
 * Hydrate dashboard state from persistent storage.
 *
 * MUST be called once during app initialization (e.g., in AppContext).
 * Reads from expo-file-system (native) or localStorage (web),
 * validates the structure, and populates the in-memory cache.
 *
 * If no persisted state is found, the cache remains null and
 * getStorage() will return createDefaultState().
 *
 * @returns The hydrated state, or null if no persisted state was found.
 */
export async function hydrateDashboardState(): Promise<DashboardState | null> {
  try {
    const raw = await readDashboardState();
    if (raw) {
      const parsed = JSON.parse(raw);
      const validated = validateAndMigrate(parsed);
      if (validated) {
        _cachedState = validated;
        console.log('[DashboardStore] Hydrated from persistent storage');
        markHydrated();
        return validated;
      }
    }
  } catch (e) {
    console.warn('[DashboardStore] Hydration failed:', e);
  }

  // No persisted state found — use defaults
  // (Don't set _cachedState here; let getStorage() return fresh defaults each time
  //  until a mutation occurs, which will then cache and persist)
  console.log('[DashboardStore] No persisted state found — using defaults');
  markHydrated();
  return null;
}

/**
 * Hydrate custom presets from persistent storage.
 * Called alongside hydrateDashboardState() during app init.
 */
export async function hydrateCustomPresets(): Promise<void> {
  try {
    const raw = await readCustomPresets();
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        _cachedCustomPresets = parsed;
        // Ensure all profiles exist
        for (const p of ['expedition', 'vehicle', 'emergency'] as DashboardProfile[]) {
          if (!Array.isArray(_cachedCustomPresets[p])) _cachedCustomPresets[p] = [];
        }
        console.log('[DashboardStore] Custom presets hydrated from persistent storage');
      }
    }
  } catch (e) {
    console.warn('[DashboardStore] Custom presets hydration failed:', e);
  }
}

/**
 * Flush all pending writes to disk immediately.
 * Call before app backgrounding or shutdown.
 */
export { flushPendingWrites as flushDashboardWrites };

/**
 * Check if the dashboard store has been hydrated from persistent storage.
 */
export { isHydrated as isDashboardHydrated };



export const dashboardStore = {
  getState(): DashboardState {
    return getStorage();
  },

  getActiveProfile(): DashboardProfile {
    return getStorage().activeProfile;
  },

  setActiveProfile(profile: DashboardProfile): void {
    const state = getStorage();
    state.activeProfile = profile;
    saveStorage(state);
  },

  getGridLayout(profile: DashboardProfile): GridLayout {
    const state = getStorage();
    return state.profiles[profile]?.gridLayout || '1x3';
  },

  setGridLayout(profile: DashboardProfile, layout: GridLayout): void {
    const state = getStorage();
    if (!state.profiles[profile]) {
      const defaults = createDefaultState();
      state.profiles[profile] = defaults.profiles[profile];
    }
    const newSlotCount = GRID_LAYOUT_CONFIG[layout].total;
    state.profiles[profile].gridLayout = layout;
    state.profiles[profile].slots = ensureSlotCount(
      state.profiles[profile].slots,
      newSlotCount
    );
    saveStorage(state);
    queueDashboardAction('dashboard_layout_change', { profile, layout }, `Grid layout changed to ${layout} on ${profile}`);
  },


  getProfileSlots(profile: DashboardProfile): WidgetSlot[] {
    const state = getStorage();
    const profileState = state.profiles[profile];
    if (!profileState) return createEmptySlots();
    const layout = profileState.gridLayout || '1x3';
    const expectedCount = GRID_LAYOUT_CONFIG[layout]?.total || 3;
    const padded = ensureSlotCount(profileState.slots || createEmptySlots(), expectedCount);

    // Instrument Cluster Lock:
    // When a multi-cell widget (2x1 or 2x2) is present, fewer widgets
    // can fill all grid cells. The padded empty slot is structurally
    // unnecessary — filter it out to prevent an empty grid space.
    const assignedCount = padded.filter(s => s.widgetType !== null).length;
    const has2x1 = padded.some(s => s.widgetType && (s.widgetSize === '2x1' || s.widgetSize === '2x2'));
    if (has2x1) {
      // Calculate total cells occupied by assigned widgets
      const totalCellsOccupied = padded
        .filter(s => s.widgetType)
        .reduce((sum, s) => {
          const sz = s.widgetSize || '1x1';
          const cfg = { '1x1': 1, '1x2': 2, '2x1': 2, '2x2': 4 }[sz] || 1;
          return sum + cfg;
        }, 0);
      const totalGridCells = (GRID_LAYOUT_CONFIG[layout]?.cols || 2) * (GRID_LAYOUT_CONFIG[layout]?.rows || 2);
      if (totalCellsOccupied >= totalGridCells) {
        // All cells are occupied — return only assigned slots
        return padded.filter(s => s.widgetType !== null);
      }
    }

    return padded;
  },


  setProfileSlots(profile: DashboardProfile, slots: WidgetSlot[]): void {
    const state = getStorage();
    if (!state.profiles[profile]) {
      state.profiles[profile] = {
        profile,
        gridLayout: '1x3',
        slots: createSlots(3),
        lastUIState: {},
      };
    }
    state.profiles[profile].slots = slots;
    saveStorage(state);
  },

  assignWidget(profile: DashboardProfile, slotIndex: number, widgetType: string): void {
    const state = getStorage();
    const layout = state.profiles[profile]?.gridLayout || '1x3';
    const maxSlots = GRID_LAYOUT_CONFIG[layout]?.total || 3;
    const slots = ensureSlotCount(
      state.profiles[profile]?.slots || createSlots(maxSlots),
      maxSlots
    );
    if (slotIndex >= 0 && slotIndex < maxSlots) {
      slots[slotIndex] = { slotIndex, widgetType, settings: {} };
    }
    state.profiles[profile].slots = slots;
    saveStorage(state);
    queueDashboardAction('dashboard_widget_assign', { profile, slotIndex, widgetType }, `Widget "${widgetType}" assigned to slot ${slotIndex}`);
  },

  removeWidget(profile: DashboardProfile, slotIndex: number): void {
    const state = getStorage();
    const layout = state.profiles[profile]?.gridLayout || '1x3';
    const maxSlots = GRID_LAYOUT_CONFIG[layout]?.total || 3;
    const slots = ensureSlotCount(
      state.profiles[profile]?.slots || createSlots(maxSlots),
      maxSlots
    );

    // All widgets are now user-manageable — no removal restrictions
    const widgetId = slots[slotIndex]?.widgetType;



    if (slotIndex >= 0 && slotIndex < maxSlots) {
      slots[slotIndex] = { slotIndex, widgetType: null, settings: {} };
    }
    state.profiles[profile].slots = slots;
    saveStorage(state);
    queueDashboardAction('dashboard_widget_remove', { profile, slotIndex, widgetId }, `Widget "${widgetId}" removed from slot ${slotIndex}`);
  },

  swapSlots(profile: DashboardProfile, fromIndex: number, toIndex: number): void {
    const state = getStorage();
    const layout = state.profiles[profile]?.gridLayout || '1x3';
    const maxSlots = GRID_LAYOUT_CONFIG[layout]?.total || 3;
    const slots = [...ensureSlotCount(
      state.profiles[profile]?.slots || createSlots(maxSlots),
      maxSlots
    )];
    if (fromIndex >= 0 && fromIndex < maxSlots && toIndex >= 0 && toIndex < maxSlots) {
      const temp = slots[fromIndex];
      slots[fromIndex] = { ...slots[toIndex], slotIndex: fromIndex };
      slots[toIndex] = { ...temp, slotIndex: toIndex };
    }
    state.profiles[profile].slots = slots;
    saveStorage(state);
    queueDashboardAction('dashboard_widget_swap', { profile, fromIndex, toIndex }, `Widgets swapped: slot ${fromIndex} and slot ${toIndex}`);
  },


  updateWidgetSettings(profile: DashboardProfile, slotIndex: number, settings: Record<string, any>): void {
    const state = getStorage();
    const layout = state.profiles[profile]?.gridLayout || '1x3';
    const maxSlots = GRID_LAYOUT_CONFIG[layout]?.total || 3;
    const slots = ensureSlotCount(
      state.profiles[profile]?.slots || createSlots(maxSlots),
      maxSlots
    );
    if (slotIndex >= 0 && slotIndex < maxSlots) {
      slots[slotIndex].settings = { ...slots[slotIndex].settings, ...settings };
    }
    state.profiles[profile].slots = slots;
    saveStorage(state);
  },

  saveUIState(profile: DashboardProfile, uiState: Record<string, any>): void {
    const state = getStorage();
    if (state.profiles[profile]) {
      state.profiles[profile].lastUIState = uiState;
      saveStorage(state);
    }
  },

  getUIState(profile: DashboardProfile): Record<string, any> {
    const state = getStorage();
    return state.profiles[profile]?.lastUIState || {};
  },

  // ── Dashboard Mode ──────────────────────────────────────
  getDashboardMode(): DashboardMode {
    return getStorage().dashboardMode || 'expedition';
  },

  setDashboardMode(mode: DashboardMode): void {
    const state = getStorage();
    state.dashboardMode = mode;
    saveStorage(state);
  },

  // ── Auto-Collapse ───────────────────────────────────────
  getAutoCollapseEnabled(): boolean {
    const state = getStorage();
    return state.autoCollapseEnabled !== false; // default true
  },

  setAutoCollapseEnabled(enabled: boolean): void {
    const state = getStorage();
    state.autoCollapseEnabled = enabled;
    saveStorage(state);
  },

  // ── Per-Widget Auto-Collapse ────────────────────────────
  getWidgetAutoCollapse(widgetId: string): boolean {
    const state = getStorage();
    // Default to global setting if no per-widget override
    if (state.perWidgetAutoCollapse[widgetId] === undefined) {
      return state.autoCollapseEnabled !== false;
    }
    return state.perWidgetAutoCollapse[widgetId];
  },

  setWidgetAutoCollapse(widgetId: string, enabled: boolean): void {
    const state = getStorage();
    state.perWidgetAutoCollapse[widgetId] = enabled;
    saveStorage(state);
  },

  // ── Advanced Mode ───────────────────────────────────────
  getAdvancedModeEnabled(): boolean {
    const state = getStorage();
    return state.advancedModeEnabled === true;
  },

  setAdvancedModeEnabled(enabled: boolean): void {
    const state = getStorage();
    state.advancedModeEnabled = enabled;
    saveStorage(state);
  },

  // ── Restore Defaults ────────────────────────────────────
  /**
   * Check if a profile's dashboard is empty (all slots null).
   * Used to trigger "Restore default layout?" prompt.
   */
  isProfileEmpty(profile: DashboardProfile): boolean {
    const slots = this.getProfileSlots(profile);
    return isDashboardEmpty(slots.map(s => s.widgetType));
  },

  /**
   * Restore a profile to its default widget configuration.
   */
  restoreDefaults(profile: DashboardProfile): void {
    const defaults = createDefaultState();
    const state = getStorage();
    state.profiles[profile] = defaults.profiles[profile];
    saveStorage(state);
  },

  resetProfile(profile: DashboardProfile): void {
    const defaults = createDefaultState();
    const state = getStorage();
    state.profiles[profile] = defaults.profiles[profile];
    saveStorage(state);
  },

  resetAll(): void {
    saveStorage(createDefaultState());
  },

  // ── Last Selected Tab ───────────────────────────────────
  getLastSelectedTab(): 'expedition' | 'highway' {
    const state = getStorage();
    return state.lastSelectedTab || 'expedition';
  },

  setLastSelectedTab(tab: 'expedition' | 'highway'): void {
    const state = getStorage();
    state.lastSelectedTab = tab;
    saveStorage(state);
  },

  setWidgetSize(profile: DashboardProfile, slotIndex: number, size: WidgetSize): void {
    const state = getStorage();
    const layout = state.profiles[profile]?.gridLayout || '1x3';
    const maxSlots = GRID_LAYOUT_CONFIG[layout]?.total || 3;
    const slots = ensureSlotCount(
      state.profiles[profile]?.slots || createSlots(maxSlots),
      maxSlots
    );
    if (slotIndex >= 0 && slotIndex < maxSlots && slots[slotIndex].widgetType) {
      slots[slotIndex] = { ...slots[slotIndex], widgetSize: size };
    }
    state.profiles[profile].slots = slots;
    saveStorage(state);
    queueDashboardAction('dashboard_widget_resize', { profile, slotIndex, size }, `Widget in slot ${slotIndex} resized to ${size}`);
  },


  // ── Layout Presets ──────────────────────────────────────

  /**
   * Apply a layout preset to the current profile.
   * ALWAYS changes grid layout to match the preset (even if same).
   * Preserves existing widgets by placing them in order into the new grid.
   * Overflow widgets (more than new slot count) are dropped gracefully.
   * Returns the new grid layout so the caller can update UI state.
   */
  applyPreset(profile: DashboardProfile, presetId: string): GridLayout | null {
    // Search ALL presets (not just current layout) so cross-layout presets work
    const preset = LAYOUT_PRESETS.find(p => p.id === presetId);
    if (!preset) return null;

    const state = getStorage();
    const newLayout = preset.gridLayout;
    const newSlotCount = GRID_LAYOUT_CONFIG[newLayout]?.total || 4;

    // ── Special: Expedition Tactical Preset ────────────────
    // Phase 10: Updated to use core instruments only
    if (presetId === EXPEDITION_TACTICAL_PRESET_ID) {
      const tacticalSlots: WidgetSlot[] = [
        { slotIndex: 0, widgetType: 'attitude-monitor', widgetSize: '2x1', settings: {} },
        { slotIndex: 1, widgetType: 'vehicle-systems', widgetSize: '1x1', settings: {} },
        { slotIndex: 2, widgetType: 'remoteness', widgetSize: '1x1', settings: {} },
        { slotIndex: 3, widgetType: 'sustainability', widgetSize: '1x1', settings: {} },
        { slotIndex: 4, widgetType: 'progress', widgetSize: '1x1', settings: {} },
      ];
      state.profiles[profile].gridLayout = '2x3';
      state.profiles[profile].slots = tacticalSlots;
      state.profiles[profile].lastUsedPreset = presetId;
      saveStorage(state);
      queueDashboardAction('dashboard_preset_apply', { profile, presetId, newLayout: '2x3' }, `Expedition Tactical preset applied to ${profile}`);
      return '2x3' as GridLayout;
    }

    // ALWAYS set the grid layout to the preset's layout
    // (even if same — ensures consistency after any prior partial updates)
    state.profiles[profile].gridLayout = newLayout;

    // Get current slots, preserving existing widgets
    const currentSlots = state.profiles[profile]?.slots || [];
    // Collect assigned widgets in order
    const assignedWidgets = currentSlots
      .filter(s => s.widgetType)
      .map(s => ({ widgetType: s.widgetType, settings: s.settings }));

    // Build new slot array with correct count
    const newSlots: WidgetSlot[] = [];
    for (let i = 0; i < newSlotCount; i++) {
      const newSize: WidgetSize = i < preset.slotSizes.length ? preset.slotSizes[i] : '1x1';
      if (i < assignedWidgets.length) {
        // Place existing widget into this slot with the preset's size
        newSlots.push({
          slotIndex: i,
          widgetType: assignedWidgets[i].widgetType,
          widgetSize: newSize,
          settings: assignedWidgets[i].settings,
        });
      } else {
        // Empty slot
        newSlots.push({
          slotIndex: i,
          widgetType: null,
          widgetSize: newSize,
          settings: {},
        });
      }
    }

    state.profiles[profile].slots = newSlots;
    state.profiles[profile].lastUsedPreset = presetId;
    saveStorage(state);
    queueDashboardAction('dashboard_preset_apply', { profile, presetId, newLayout }, `Preset "${presetId}" applied to ${profile}`);
    return newLayout;
  },

  /**
   * Apply a custom (user-saved) preset to the current profile.
   * Changes grid layout AND widget sizes to match the custom preset.
   * Preserves existing widgets by placing them in order into the new grid.
   * Returns the new grid layout so the caller can update UI state.
   */
  applyCustomPreset(profile: DashboardProfile, preset: CustomPreset): GridLayout {
    const state = getStorage();
    const newLayout = preset.gridLayout;
    const newSlotCount = GRID_LAYOUT_CONFIG[newLayout]?.total || 4;

    // ALWAYS set the grid layout to the custom preset's layout
    state.profiles[profile].gridLayout = newLayout;

    // Get current slots, preserving existing widgets
    const currentSlots = state.profiles[profile]?.slots || [];
    const assignedWidgets = currentSlots
      .filter(s => s.widgetType)
      .map(s => ({ widgetType: s.widgetType, settings: s.settings }));

    // Build new slot array with correct count and custom preset sizes
    const newSlots: WidgetSlot[] = [];
    for (let i = 0; i < newSlotCount; i++) {
      const newSize: WidgetSize = i < preset.slotSizes.length ? preset.slotSizes[i] : '1x1';
      if (i < assignedWidgets.length) {
        newSlots.push({
          slotIndex: i,
          widgetType: assignedWidgets[i].widgetType,
          widgetSize: newSize,
          settings: assignedWidgets[i].settings,
        });
      } else {
        newSlots.push({
          slotIndex: i,
          widgetType: null,
          widgetSize: newSize,
          settings: {},
        });
      }
    }

    state.profiles[profile].slots = newSlots;
    state.profiles[profile].lastUsedPreset = preset.id;
    saveStorage(state);
    queueDashboardAction('dashboard_preset_apply', { profile, presetId: preset.id, newLayout }, `Custom preset "${preset.name}" applied to ${profile}`);
    return newLayout;
  },


  getLastUsedPreset(profile: DashboardProfile): string | undefined {
    const state = getStorage();
    return state.profiles[profile]?.lastUsedPreset;
  },

  setLastUsedPreset(profile: DashboardProfile, presetId: string): void {
    const state = getStorage();
    if (state.profiles[profile]) {
      state.profiles[profile].lastUsedPreset = presetId;
      saveStorage(state);
    }
  },
};

// ══════════════════════════════════════════════════════════════


// Custom Presets — Per-Profile User-Saved Layouts
// ══════════════════════════════════════════════════════════════

const CUSTOM_PRESETS_STORAGE_KEY = 'ecs_custom_presets';
const MAX_CUSTOM_PRESETS = 5;

/**
 * In-memory cache for custom presets.
 * Hydrated by hydrateCustomPresets() at app startup.
 */
let _cachedCustomPresets: CustomPresetsStorage | null = null;

export interface CustomPreset {
  /** Unique preset ID (uuid-like) */
  id: string;
  /** User-defined name */
  name: string;
  /** Ionicon name chosen by user */
  icon: string;
  /** Which grid layout this was saved from */
  gridLayout: GridLayout;
  /** Size for each slot index */
  slotSizes: WidgetSize[];
  /** Timestamp of creation */
  createdAt: number;
}

/** Storage shape: per-profile arrays of custom presets */
type CustomPresetsStorage = Record<DashboardProfile, CustomPreset[]>;

const _defaultCustomPresets = (): CustomPresetsStorage => ({
  expedition: [], vehicle: [], emergency: [],
});

function getCustomPresetsStorage(): CustomPresetsStorage {
  // Return cached if available
  if (_cachedCustomPresets) return _cachedCustomPresets;

  // Fallback: try localStorage synchronously (web only)
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(CUSTOM_PRESETS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          for (const p of ['expedition', 'vehicle', 'emergency'] as DashboardProfile[]) {
            if (!Array.isArray(parsed[p])) parsed[p] = [];
          }
          _cachedCustomPresets = parsed;
          return parsed;
        }
      }
    }
  } catch (e) {
    console.warn('[CustomPresets] localStorage fallback read failed:', e);
  }
  return _defaultCustomPresets();
}

function saveCustomPresetsStorage(data: CustomPresetsStorage): void {
  // Update in-memory cache
  _cachedCustomPresets = data;

  // Schedule debounced async write
  try {
    const serialized = JSON.stringify(data);
    writeCustomPresets(serialized);
  } catch (e) {
    console.warn('[CustomPresets] Failed to serialize:', e);
  }
}



function generatePresetId(): string {
  return 'custom-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

export const customPresetStore = {
  /**
   * Get all custom presets for a profile.
   */
  getPresets(profile: DashboardProfile): CustomPreset[] {
    const storage = getCustomPresetsStorage();
    return storage[profile] || [];
  },

  /**
   * Save the current layout as a custom preset.
   * Returns the new preset, or null if limit reached.
   */
  savePreset(
    profile: DashboardProfile,
    name: string,
    icon: string,
    gridLayout: GridLayout,
    slots: WidgetSlot[],
  ): CustomPreset | null {
    const storage = getCustomPresetsStorage();
    const profilePresets = storage[profile] || [];

    if (profilePresets.length >= MAX_CUSTOM_PRESETS) {
      return null; // Limit reached
    }

    // Extract sizes from current slots
    const slotSizes: WidgetSize[] = slots.map(s => getSlotSize(s));

    const preset: CustomPreset = {
      id: generatePresetId(),
      name: name.trim() || 'My Preset',
      icon: icon || 'bookmark-outline',
      gridLayout,
      slotSizes,
      createdAt: Date.now(),
    };

    profilePresets.push(preset);
    storage[profile] = profilePresets;
    saveCustomPresetsStorage(storage);
    return preset;
  },

  /**
   * Delete a custom preset by ID.
   */
  deletePreset(profile: DashboardProfile, presetId: string): boolean {
    const storage = getCustomPresetsStorage();
    const profilePresets = storage[profile] || [];
    const idx = profilePresets.findIndex(p => p.id === presetId);
    if (idx === -1) return false;
    profilePresets.splice(idx, 1);
    storage[profile] = profilePresets;
    saveCustomPresetsStorage(storage);
    return true;
  },

  /**
   * Get count of custom presets for a profile.
   */
  getCount(profile: DashboardProfile): number {
    const storage = getCustomPresetsStorage();
    return (storage[profile] || []).length;
  },

  /**
   * Check if a profile can save more presets.
   */
  canSaveMore(profile: DashboardProfile): boolean {
    return this.getCount(profile) < MAX_CUSTOM_PRESETS;
  },

  /**
   * Max allowed custom presets per profile.
   */
  MAX_PRESETS: MAX_CUSTOM_PRESETS,
};

// ══════════════════════════════════════════════════════════════
// Layout Preset Templates
// ══════════════════════════════════════════════════════════════

export interface LayoutPreset {
  /** Unique preset ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** Short description */
  description: string;
  /** Which grid layout this preset applies to */
  gridLayout: GridLayout;
  /** Size for each slot index (in order). Slots beyond this array default to '1x1'. */
  slotSizes: WidgetSize[];
  /** Icon name for the preset (Ionicons) */
  icon: string;
}

/**
 * Predefined layout presets organized by grid layout.
 * Each grid layout has 4-6 presets showing different size arrangements.
 */
export const LAYOUT_PRESETS: LayoutPreset[] = [
  // ── EXPEDITION TACTICAL PRESET (Special) ────────────
  {
    id: 'expedition-tactical',
    name: 'Expedition Tactical',
    description: 'Trailhead-ready command view: Attitude, Distance, Fuel, Loadout',
    gridLayout: '2x2',
    slotSizes: ['1x1', '1x1', '1x1', '1x1'],
    icon: 'flag-outline',
  },


  // ── 1x1 (1 col, 1 row, 1 slot) ─────────────────────

  {
    id: '1x1-single',
    name: 'Single Widget',
    description: 'One full-size widget',
    gridLayout: '1x1',
    slotSizes: ['1x1'],
    icon: 'square-outline',
  },

  // ── 1x2 (1 col, 2 rows, 2 slots) ───────────────────
  {
    id: '1x2-equal',
    name: 'Equal Stack',
    description: 'Two equal-height widgets stacked vertically',
    gridLayout: '1x2',
    slotSizes: ['1x1', '1x1'],
    icon: 'reorder-two-outline',
  },
  {
    id: '1x2-full-focus',
    name: 'Full Focus',
    description: 'First widget takes full height (1\u00D72)',
    gridLayout: '1x2',
    slotSizes: ['1x2', '1x1'],
    icon: 'tablet-portrait-outline',
  },

  // ── 1x3 (1 col, 3 rows, 3 slots) ───────────────────
  {
    id: '1x3-equal',
    name: 'Triple Stack',
    description: 'Three equal-height widgets stacked',
    gridLayout: '1x3',
    slotSizes: ['1x1', '1x1', '1x1'],
    icon: 'reorder-three-outline',
  },
  {
    id: '1x3-top-focus',
    name: 'Top Focus',
    description: 'Top widget spans two rows, one below',
    gridLayout: '1x3',
    slotSizes: ['1x2', '1x1', '1x1'],
    icon: 'arrow-up-outline',
  },
  {
    id: '1x3-bottom-focus',
    name: 'Bottom Focus',
    description: 'First widget small, second spans two rows',
    gridLayout: '1x3',
    slotSizes: ['1x1', '1x2', '1x1'],
    icon: 'arrow-down-outline',
  },

  // ── 2x1 (2 cols, 1 row, 2 slots) ───────────────────
  {
    id: '2x1-equal',
    name: 'Side by Side',
    description: 'Two equal-width widgets side by side',
    gridLayout: '2x1',
    slotSizes: ['1x1', '1x1'],
    icon: 'reorder-two-outline',
  },
  {
    id: '2x1-full-width',
    name: 'Full Width',
    description: 'First widget spans full width (2\u00D71)',
    gridLayout: '2x1',
    slotSizes: ['2x1', '1x1'],
    icon: 'remove-outline',
  },

  // ── 2x2 (2 cols, 2 rows, 4 slots) ──────────────────
  {
    id: '2x2-featured-attitude',
    name: 'Featured Attitude',
    description: 'Attitude Monitor full-width top, two compact middle, Progress bottom',
    gridLayout: '2x2',
    slotSizes: ['2x1', '1x1', '1x1', '2x1'],
    icon: 'compass-outline',
  },
  {
    id: '2x2-all-equal',
    name: 'All Equal',
    description: 'Classic 2\u00D72 grid, all widgets same size',
    gridLayout: '2x2',
    slotSizes: ['1x1', '1x1', '1x1', '1x1'],
    icon: 'grid-outline',
  },
  {
    id: '2x2-hero-top',
    name: 'Hero Top',
    description: 'Wide widget on top, two below',
    gridLayout: '2x2',
    slotSizes: ['2x1', '1x1', '1x1', '1x1'],
    icon: 'layers-outline',
  },
  {
    id: '2x2-feature-left',
    name: 'Feature Left',
    description: 'Tall widget on left, two small on right',
    gridLayout: '2x2',
    slotSizes: ['1x2', '1x1', '1x1', '1x1'],
    icon: 'albums-outline',
  },
  {
    id: '2x2-two-wide',
    name: 'Two Wide Rows',
    description: 'Two full-width widgets stacked',
    gridLayout: '2x2',
    slotSizes: ['2x1', '2x1', '1x1', '1x1'],
    icon: 'reorder-two-outline',
  },
  {
    id: '2x2-full-focus',
    name: 'Full Focus',
    description: 'One large 2\u00D72 widget fills the grid',
    gridLayout: '2x2',
    slotSizes: ['2x2', '1x1', '1x1', '1x1'],
    icon: 'expand-outline',
  },


  // ── 2x3 (2 cols, 3 rows, 6 slots) ──────────────────
  {
    id: '2x3-all-equal',
    name: 'All Equal',
    description: 'Classic 2\u00D73 grid, all widgets same size',
    gridLayout: '2x3',
    slotSizes: ['1x1', '1x1', '1x1', '1x1', '1x1', '1x1'],
    icon: 'grid-outline',
  },
  {
    id: '2x3-hero-top',
    name: 'Hero Top',
    description: 'Wide widget on top, four small below',
    gridLayout: '2x3',
    slotSizes: ['2x1', '1x1', '1x1', '1x1', '1x1', '1x1'],
    icon: 'layers-outline',
  },
  {
    id: '2x3-feature-left',
    name: 'Feature Left',
    description: 'Tall widget on left, small widgets on right',
    gridLayout: '2x3',
    slotSizes: ['1x2', '1x1', '1x1', '1x1', '1x1', '1x1'],
    icon: 'albums-outline',
  },
  {
    id: '2x3-two-wide-four-small',
    name: 'Two Wide + Four',
    description: 'Two wide rows on top, four small below',
    gridLayout: '2x3',
    slotSizes: ['2x1', '2x1', '1x1', '1x1', '1x1', '1x1'],
    icon: 'list-outline',
  },
  {
    id: '2x3-quad-focus',
    name: 'Quad Focus',
    description: 'Large 2\u00D72 widget with two small below',
    gridLayout: '2x3',
    slotSizes: ['2x2', '1x1', '1x1', '1x1', '1x1', '1x1'],
    icon: 'expand-outline',
  },
  {
    id: '2x3-mixed',
    name: 'Mixed Layout',
    description: 'Wide top, tall left, small fills',
    gridLayout: '2x3',
    slotSizes: ['2x1', '1x2', '1x1', '1x1', '1x1', '1x1'],
    icon: 'apps-outline',
  },
];

/**
 * Get all presets available for a given grid layout.
 * Includes both built-in and custom presets (custom presets returned separately).
 */
export function getPresetsForLayout(gridLayout: GridLayout): LayoutPreset[] {
  return LAYOUT_PRESETS.filter(p => p.gridLayout === gridLayout);
}

/**
 * Check if the Expedition Tactical preset is currently active on a given profile.
 */
export function isExpeditionTacticalActive(profile: DashboardProfile): boolean {
  return dashboardStore.getLastUsedPreset(profile) === EXPEDITION_TACTICAL_PRESET_ID;
}

