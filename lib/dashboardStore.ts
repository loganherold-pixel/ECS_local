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

import { customWidgetStore } from './customWidgetStore';
import { reportDataIntegrityFailure, reportRecoverableFailure } from './ecsIssueIntelligence';
import { ecsLog } from './ecsLogger';
import {
  WIDGET_REGISTRY,
  isDashboardEmpty,
  getDashboardRecommendedSize,
  getDashboardSupportedSizes,
  getDashboardWidgetReplacement,
  getDefaultDashboardLayout,
  isCuratedWidgetForMode,
  isCuratedDashboardWidget,
  isRetiredDashboardWidget,
  normalizeDashboardWidgetSize,
  validateCuratedDashboardConfig,
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
  waitForHydration,
  flushPendingWrites,
} from './dashboardPersistence';


/** Expedition Tactical Preset ID constant */
export const EXPEDITION_TACTICAL_PRESET_ID = 'expedition-tactical';



export type DashboardProfile = 'expedition' | 'vehicle' | 'emergency';

export type GridLayout = '1x1' | '1x2' | '1x3' | '2x1' | '2x2' | '2x3';

/** Widget cell span size: colSpan x rowSpan. Curated Dashboard widgets keep their canonical 1x1, 2x1, or 2x2 footprints. */
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
      colSpan = gridCols >= 2 ? gridCols : 1;
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

export const DASHBOARD_PERSISTENCE_SCHEMA_VERSION = 3;
export const DASHBOARD_LAYOUT_VERSION = 2;
export const DASHBOARD_GRID_COLUMNS = 2;
export const DASHBOARD_MAX_ACTIVE_WIDGETS = 6;



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
  | 'vehicle-systems'
  | 'stability-index'
  | 'attitude-monitor'
  | 'attitude-command'
  | 'mission-sustainment'
  | 'operational-readiness'
  | 'sustainability'
  | 'progress'
  | 'navigate-surface'
  | 'remoteness'
  | 'route-confidence'
  | 'expedition-channel'
  | 'trip-demand-analyzer'
  | 'vehicle-twin'
  | 'ecoflow-power'
  | 'ecs-power'
  | 'vehicle-telemetry'
  | 'expedition-readiness'
  | 'expedition-status-summary'
  | 'expedition-risk'
  | 'terrain-risk'
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
  defaultSize?: WidgetSize;
  supportsModes?: DashboardMode[];
  requiresMotion?: boolean;
}

/**
 * Build WIDGET_CATALOG from the centralized registry.
 * This maintains backward compatibility with existing code that uses WIDGET_CATALOG.
 */
export const WIDGET_CATALOG: WidgetDefinition[] = WIDGET_REGISTRY
  .filter(w => w.render_ready && isCuratedDashboardWidget(w.widget_id))
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
  gridColumn?: number;
  gridRow?: number;
  layoutVersion?: number;
  settings: Record<string, any>;
}

/** Helper to get the effective size of a widget slot */
export function getSlotSize(slot: WidgetSlot): WidgetSize {
  return slot.widgetSize || '2x1';
}



export interface ProfileState {
  profile: DashboardProfile;
  slots: WidgetSlot[];
  gridLayout: GridLayout;
  layoutVersion: number;
  gridColumns: number;
  lastUIState: Record<string, any>;
  /** Last applied layout preset ID for this profile */
  lastUsedPreset?: string;
}


export interface DashboardState {
  schemaVersion: number;
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
  /** Legacy operational tab preference retained for persisted state compatibility */
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

function isPlainObject(value: unknown): value is Record<string, any> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function coerceWidgetType(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const widgetType = value.trim();
  if (isRetiredDashboardWidget(widgetType)) {
    reportDataIntegrityFailure({
      severity: 'medium',
      issueTitle: 'Dashboard widget hydration mismatch',
      ecsArea: 'dashboard',
      message: `Retired widget "${widgetType}" removed during layout hydration`,
      signature: `dashboard_retired_widget:${widgetType}`,
      metadata: { widgetType },
      fallbackUsed: true,
    });
    return null;
  }
  return widgetType;
}

function coerceWidgetSize(value: unknown): WidgetSize | undefined {
  if (value === '1x1' || value === '1x2' || value === '2x1' || value === '2x2') {
    return value;
  }
  return undefined;
}

function coerceRecord(value: unknown): Record<string, any> {
  return isPlainObject(value) ? value : {};
}

function coerceDashboardSlot(raw: unknown, index: number): WidgetSlot {
  if (typeof raw === 'string' || raw == null) {
    return {
      slotIndex: index,
      widgetType: coerceWidgetType(raw),
      settings: {},
    };
  }

  const candidate = isPlainObject(raw) ? raw : {};
  const slotIndex = Number.isInteger(candidate.slotIndex) ? candidate.slotIndex : index;

  return {
    slotIndex,
    widgetType: coerceWidgetType(
      candidate.widgetType ?? candidate.widgetId ?? candidate.type ?? candidate.id ?? null,
    ),
    widgetSize: coerceWidgetSize(candidate.widgetSize),
    gridColumn: Number.isInteger(candidate.gridColumn) ? candidate.gridColumn : undefined,
    gridRow: Number.isInteger(candidate.gridRow) ? candidate.gridRow : undefined,
    layoutVersion: Number.isInteger(candidate.layoutVersion)
      ? candidate.layoutVersion
      : undefined,
    settings: coerceRecord(candidate.settings),
  };
}

function coercePersistedSlots(rawProfile: unknown): WidgetSlot[] {
  if (Array.isArray(rawProfile)) {
    return rawProfile.map((slot, index) => coerceDashboardSlot(slot, index));
  }

  if (!isPlainObject(rawProfile)) {
    return [];
  }

  if (Array.isArray(rawProfile.slots)) {
    return rawProfile.slots.map((slot, index) => coerceDashboardSlot(slot, index));
  }

  if (Array.isArray(rawProfile.widgets)) {
    return rawProfile.widgets.map((slot, index) => coerceDashboardSlot(slot, index));
  }

  return [];
}

function coerceBooleanRecord(value: unknown): Record<string, boolean> {
  if (!isPlainObject(value)) {
    return {};
  }

  return Object.entries(value).reduce<Record<string, boolean>>((acc, [key, raw]) => {
    if (typeof raw === 'boolean') {
      acc[key] = raw;
    }
    return acc;
  }, {});
}

/** Migrate old grid layouts to new ones */
function migrateGridLayout(layout: string): GridLayout {
  if (layout === '2x4' || layout === '4x4') return '2x3';
  if (GRID_LAYOUT_CONFIG[layout as GridLayout]) return layout as GridLayout;
  return '2x2';
}

function dashboardModeForProfile(profile: DashboardProfile): DashboardMode | null {
  if (profile === 'expedition') return 'expedition';
  if (profile === 'vehicle') return 'highway';
  return null;
}

function buildDefaultSlots(mode: DashboardMode): WidgetSlot[] {
  const layout = getDefaultDashboardLayout(mode);
  return normalizeDashboardSlotsForProfile(
    mode === 'expedition' ? 'expedition' : 'vehicle',
    layout.slots.map((slot, index) => ({
      slotIndex: index,
      widgetType: slot.widgetId,
      widgetSize: slot.widgetSize,
      settings: {},
    })),
    mode,
    layout.gridLayout,
  );
}

function getSizeConfig(size: WidgetSize): { colSpan: number; rowSpan: number } {
  return WIDGET_SIZE_CONFIG[size] ?? WIDGET_SIZE_CONFIG['2x1'];
}

function clampDashboardWidgetSize(widgetId: string, size?: WidgetSize | null): WidgetSize {
  return normalizeDashboardWidgetSize(widgetId, size) as WidgetSize;
}

function getDashboardLayoutConfig(layout?: GridLayout | null) {
  return GRID_LAYOUT_CONFIG[layout ?? '2x2'] ?? GRID_LAYOUT_CONFIG['2x2'];
}

function canDashboardLayoutHostWidget(
  widgetId: string,
  layout?: GridLayout | null,
): boolean {
  const config = getDashboardLayoutConfig(layout);
  const supportedSizes = getDashboardSupportedSizes(widgetId);

  return supportedSizes.some((size) => {
    const sizeConfig = WIDGET_SIZE_CONFIG[size];
    return sizeConfig.colSpan <= config.cols && sizeConfig.rowSpan <= config.rows;
  });
}

function getFixedDashboardSlotCount(mode?: DashboardMode | null, layout?: GridLayout | null): number {
  return mode ? getDashboardLayoutConfig(layout).total : MAX_SLOTS;
}

function getDashboardSlotPosition(index: number, layout?: GridLayout | null) {
  const config = getDashboardLayoutConfig(layout);
  const cols = Math.max(config.cols, 1);
  return {
    gridColumn: index % cols,
    gridRow: Math.floor(index / cols),
  };
}

function clampProfileWidgetSize(
  profile: DashboardProfile,
  widgetId: string,
  size?: WidgetSize | null,
  modeOverride?: DashboardMode | null,
): WidgetSize {
  const mode = modeOverride ?? dashboardModeForProfile(profile);
  if (mode) return clampDashboardWidgetSize(widgetId, size);
  return clampDashboardWidgetSize(widgetId, size);
}

function createEmptyDashboardSlot(index: number, layout?: GridLayout | null): WidgetSlot {
  const fixedPosition = getDashboardSlotPosition(index, layout);
  return {
    slotIndex: index,
    widgetType: null,
    widgetSize: '2x1',
    gridColumn: fixedPosition.gridColumn,
    gridRow: fixedPosition.gridRow,
    layoutVersion: DASHBOARD_LAYOUT_VERSION,
    settings: {},
  };
}

function applyFixedDashboardLayoutMetadata(
  profile: DashboardProfile,
  slots: WidgetSlot[],
  layout: GridLayout,
  modeOverride?: DashboardMode | null,
): WidgetSlot[] {
  const mode = modeOverride ?? dashboardModeForProfile(profile);
  const count = getFixedDashboardSlotCount(mode, layout);
  const byIndex = new Map<number, WidgetSlot>();
  const overflowSlots: WidgetSlot[] = [];

  slots.forEach((slot, index) => {
    const key = Number.isInteger(slot.slotIndex) ? slot.slotIndex : index;
    if (key >= 0 && key < count && !byIndex.has(key)) {
      byIndex.set(key, slot);
      return;
    }
    overflowSlots.push(slot);
  });

  const fallbackSlots = [
    ...overflowSlots.filter(slot => !!slot.widgetType),
    ...overflowSlots.filter(slot => !slot.widgetType),
  ];

  return Array.from({ length: count }, (_, index) => {
    const source =
      byIndex.get(index) ??
      fallbackSlots.shift() ??
      createEmptyDashboardSlot(index, layout);
    const replacementWidgetId = getDashboardWidgetReplacement(source.widgetType);
    const widgetId = replacementWidgetId && mode && isCuratedWidgetForMode(replacementWidgetId, mode)
      ? replacementWidgetId
      : replacementWidgetId && !mode
        ? replacementWidgetId
        : null;
    const fixedPosition = getDashboardSlotPosition(index, layout);

    return {
      slotIndex: index,
      widgetType: widgetId,
      widgetSize: widgetId
        ? clampProfileWidgetSize(profile, widgetId, source.widgetSize, mode)
        : '2x1',
      gridColumn: fixedPosition.gridColumn,
      gridRow: fixedPosition.gridRow,
      layoutVersion: DASHBOARD_LAYOUT_VERSION,
      settings: source.settings || {},
    };
  });
}

function packDashboardSlots(slots: WidgetSlot[]): WidgetSlot[] {
  const occupied = new Set<string>();
  const packed: WidgetSlot[] = [];
  const maxRows = Math.max(12, slots.length * 2 + 2);

  for (const slot of slots) {
    const size = slot.widgetType ? getSlotSize(slot) : '1x1';
    const { colSpan, rowSpan } = getSizeConfig(size);
    let placed = false;

    for (let row = 0; row < maxRows && !placed; row += 1) {
      for (let col = 0; col <= DASHBOARD_GRID_COLUMNS - colSpan && !placed; col += 1) {
        let fits = true;
        for (let dr = 0; dr < rowSpan && fits; dr += 1) {
          for (let dc = 0; dc < colSpan && fits; dc += 1) {
            if (occupied.has(`${row + dr}:${col + dc}`)) {
              fits = false;
            }
          }
        }

        if (!fits) continue;

        for (let dr = 0; dr < rowSpan; dr += 1) {
          for (let dc = 0; dc < colSpan; dc += 1) {
            occupied.add(`${row + dr}:${col + dc}`);
          }
        }

        packed.push({
          ...slot,
          slotIndex: packed.length,
          gridColumn: col,
          gridRow: row,
          layoutVersion: DASHBOARD_LAYOUT_VERSION,
        });
        placed = true;
      }
    }

    if (!placed) {
      packed.push({
        ...slot,
        slotIndex: packed.length,
        gridColumn: 0,
        gridRow: packed.length,
        layoutVersion: DASHBOARD_LAYOUT_VERSION,
      });
    }
  }

  return packed;
}

function applyDashboardLayoutMetadata(slots: WidgetSlot[]): WidgetSlot[] {
  return packDashboardSlots(
    slots.map((slot, index) => ({
      ...slot,
      slotIndex: index,
      widgetSize: slot.widgetType
        ? clampDashboardWidgetSize(slot.widgetType, slot.widgetSize)
        : '2x1',
      layoutVersion: DASHBOARD_LAYOUT_VERSION,
    }))
  );
}

function normalizeDashboardSlotsForProfile(
  profile: DashboardProfile,
  slots: WidgetSlot[],
  modeOverride?: DashboardMode | null,
  layoutOverride?: GridLayout | null,
): WidgetSlot[] {
  const mode = modeOverride ?? dashboardModeForProfile(profile);
  if (!mode) {
    return applyDashboardLayoutMetadata(slots);
  }

  const layout = layoutOverride ?? '2x2';
  const used = new Set<string>();
  const fixedSlots = applyFixedDashboardLayoutMetadata(profile, slots, layout, mode).map((slot) => {
    const widgetId = slot.widgetType;
    if (
      !widgetId ||
      !isCuratedWidgetForMode(widgetId, mode) ||
      used.has(widgetId) ||
      !canDashboardLayoutHostWidget(widgetId, layout)
    ) {
      return {
        ...slot,
        widgetType: null,
        widgetSize: '2x1' as WidgetSize,
        settings: slot.settings || {},
      };
    }

    used.add(widgetId);
    return {
      ...slot,
      widgetType: widgetId,
      widgetSize: clampProfileWidgetSize(profile, widgetId, slot.widgetSize, mode),
      settings: slot.settings || {},
    };
  });

  const maxRows = Math.max(getDashboardLayoutConfig(layout).rows, 1);
  let usedRows = 0;
  const activeSlots: WidgetSlot[] = [];

  for (const slot of fixedSlots) {
    if (!slot.widgetType) continue;
    const size = clampProfileWidgetSize(profile, slot.widgetType, slot.widgetSize, mode);
    const rowSpan = size === '2x2' ? 2 : 1;
    if (usedRows + rowSpan > maxRows) {
      continue;
    }

    usedRows += rowSpan;
    activeSlots.push({
      ...slot,
      widgetSize: size,
      settings: slot.settings || {},
    });
  }

  const count = getFixedDashboardSlotCount(mode, layout);
  return Array.from({ length: count }, (_, index) => {
    const active = activeSlots[index];
    const fixedPosition = getDashboardSlotPosition(index, layout);
    if (active?.widgetType) {
      return {
        ...active,
        slotIndex: index,
        gridColumn: fixedPosition.gridColumn,
        gridRow: fixedPosition.gridRow,
        layoutVersion: DASHBOARD_LAYOUT_VERSION,
      };
    }

    return createEmptyDashboardSlot(index, layout);
  });
}

function getDashboardWidgetRowSpan(widgetId: string, requestedSize?: WidgetSize | null): number {
  return clampDashboardWidgetSize(widgetId, requestedSize) === '2x2' ? 2 : 1;
}

function getUsedDashboardRows(slots: WidgetSlot[], excludeSlotIndex?: number): number {
  return slots.reduce((total, slot) => {
    if (!slot.widgetType || slot.slotIndex === excludeSlotIndex) return total;
    return total + getDashboardWidgetRowSpan(slot.widgetType, slot.widgetSize);
  }, 0);
}

function canAssignWidgetToDashboardSlot(
  profile: DashboardProfile,
  slots: WidgetSlot[],
  layout: GridLayout,
  slotIndex: number,
  widgetType: string,
  mode?: DashboardMode | null,
): boolean {
  if (slotIndex < 0 || slotIndex >= slots.length) return false;
  if (mode && !isCuratedWidgetForMode(widgetType, mode)) return false;
  if (!canDashboardLayoutHostWidget(widgetType, layout)) return false;

  const maxRows = Math.max(getDashboardLayoutConfig(layout).rows, 1);
  const usedRows = getUsedDashboardRows(slots, slotIndex);
  const requestedRows = getDashboardWidgetRowSpan(
    widgetType,
    clampProfileWidgetSize(profile, widgetType, getDashboardRecommendedSize(widgetType), mode),
  );

  return usedRows + requestedRows <= maxRows;
}

function repairDashboardSlots(
  profile: DashboardProfile,
  slots: WidgetSlot[],
): WidgetSlot[] {
  const mode = dashboardModeForProfile(profile);
  if (!mode) return applyDashboardLayoutMetadata(slots);
  return normalizeDashboardSlotsForProfile(
    profile,
    slots,
    mode,
    getDefaultDashboardLayout(mode).gridLayout,
  );
}

function createDefaultState(): DashboardState {
  const expeditionLayout = getDefaultDashboardLayout('expedition');
  const highwayLayout = getDefaultDashboardLayout('highway');
  const expeditionSlots = buildDefaultSlots('expedition');
  const highwaySlots = buildDefaultSlots('highway');

  return {
    schemaVersion: DASHBOARD_PERSISTENCE_SCHEMA_VERSION,
    activeProfile: 'expedition',
    dashboardMode: 'expedition',
    autoCollapseEnabled: false,
    advancedModeEnabled: false,
    perWidgetAutoCollapse: {},
    lastSelectedTab: 'expedition',
    profiles: {
      expedition: {
        profile: 'expedition',
        gridLayout: expeditionLayout.gridLayout,
        slots: expeditionSlots,
        layoutVersion: DASHBOARD_LAYOUT_VERSION,
        gridColumns: GRID_LAYOUT_CONFIG[expeditionLayout.gridLayout].cols,
        lastUIState: {},
      },
      vehicle: {
        profile: 'vehicle',
        gridLayout: highwayLayout.gridLayout,
        slots: highwaySlots,
        layoutVersion: DASHBOARD_LAYOUT_VERSION,
        gridColumns: GRID_LAYOUT_CONFIG[highwayLayout.gridLayout].cols,
        lastUIState: {},
      },
      emergency: {
        profile: 'emergency',
        gridLayout: '2x2',
        slots: applyDashboardLayoutMetadata([
          { slotIndex: 0, widgetType: 'emergency-controls', settings: {} },
          { slotIndex: 1, widgetType: 'vehicle-systems', settings: {} },
          { slotIndex: 2, widgetType: 'sustainability', settings: {} },
          { slotIndex: 3, widgetType: 'progress', settings: {} },
        ]),
        layoutVersion: DASHBOARD_LAYOUT_VERSION,
        gridColumns: DASHBOARD_GRID_COLUMNS,
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
  if (!isPlainObject(parsed)) return null;

  const curatedIssues = validateCuratedDashboardConfig();
  if (curatedIssues.length > 0) {
    console.warn('[DashboardStore] Curated dashboard config is invalid. Falling back to defaults.', curatedIssues);
    return createDefaultState();
  }

  const defaults = createDefaultState();
  const rawProfiles = isPlainObject(parsed.profiles) ? parsed.profiles : {};
  const profiles = {} as Record<DashboardProfile, ProfileState>;

  for (const p of ['expedition', 'vehicle', 'emergency'] as DashboardProfile[]) {
    const defaultProfile = defaults.profiles[p];
    const rawProfile = rawProfiles[p];
    const mode = dashboardModeForProfile(p);
    const currentLayout =
      isPlainObject(rawProfile) && typeof rawProfile.gridLayout === 'string'
        ? rawProfile.gridLayout
        : defaultProfile.gridLayout;
    const profileSlots = coercePersistedSlots(rawProfile);

    if (mode) {
      const migratedLayout = migrateGridLayout(currentLayout);
      profiles[p] = {
        ...defaultProfile,
        profile: p,
        gridLayout: migratedLayout,
        slots: normalizeDashboardSlotsForProfile(p, profileSlots, mode, migratedLayout),
        layoutVersion: DASHBOARD_LAYOUT_VERSION,
        gridColumns: GRID_LAYOUT_CONFIG[migratedLayout].cols,
        lastUIState: isPlainObject(rawProfile) ? coerceRecord(rawProfile.lastUIState) : {},
        lastUsedPreset:
          isPlainObject(rawProfile) && typeof rawProfile.lastUsedPreset === 'string'
            ? rawProfile.lastUsedPreset
            : undefined,
      };
      continue;
    }

    profiles[p] = {
      ...defaultProfile,
      profile: p,
      gridLayout: migrateGridLayout(currentLayout),
      slots: applyDashboardLayoutMetadata(profileSlots),
      layoutVersion: DASHBOARD_LAYOUT_VERSION,
      gridColumns: GRID_LAYOUT_CONFIG[migrateGridLayout(currentLayout)].cols,
      lastUIState: isPlainObject(rawProfile) ? coerceRecord(rawProfile.lastUIState) : {},
      lastUsedPreset:
        isPlainObject(rawProfile) && typeof rawProfile.lastUsedPreset === 'string'
          ? rawProfile.lastUsedPreset
          : defaultProfile.lastUsedPreset,
    };
  }

  const activeProfile: DashboardProfile =
    parsed.activeProfile === 'vehicle' || parsed.activeProfile === 'emergency'
      ? parsed.activeProfile
      : 'expedition';
  const dashboardMode: DashboardMode = parsed.dashboardMode === 'highway' ? 'highway' : 'expedition';
  const lastSelectedTab: 'expedition' | 'highway' =
    parsed.lastSelectedTab === 'highway' ? 'highway' : 'expedition';

  return {
    schemaVersion: DASHBOARD_PERSISTENCE_SCHEMA_VERSION,
    activeProfile,
    profiles,
    dashboardMode,
    autoCollapseEnabled: false,
    advancedModeEnabled: parsed.advancedModeEnabled === true,
    perWidgetAutoCollapse: coerceBooleanRecord(parsed.perWidgetAutoCollapse),
    lastSelectedTab,
  };
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

  _cachedState = createDefaultState();
  return _cachedState;
}

/**
 * Write dashboard state to the in-memory cache AND schedule async persistence.
 * On web, also writes to localStorage synchronously for backward compat.
 */
function saveStorage(state: DashboardState): void {
  state.schemaVersion = DASHBOARD_PERSISTENCE_SCHEMA_VERSION;

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
 * If no persisted state is found, the cache is initialized with
 * a stable default state so synchronous reads stay deterministic.
 *
 * @returns The hydrated state, or a default state if no persisted state was found.
 */
export async function hydrateDashboardState(): Promise<DashboardState | null> {
  try {
    const raw = await readDashboardState();
    if (raw) {
      const parsed = JSON.parse(raw);
      const validated = validateAndMigrate(parsed);
      if (validated) {
        _cachedState = validated;
        ecsLog.debug('SHELL', 'Dashboard state hydrated from persistent storage');
        markHydrated();
        return validated;
      }
    }
  } catch (e) {
    console.warn('[DashboardStore] Hydration failed:', e);
    reportRecoverableFailure({
      severity: 'medium',
      issueTitle: 'Dashboard state hydration failed',
      ecsArea: 'dashboard',
      error: e,
      message: e instanceof Error ? e.message : 'Dashboard hydration failed',
      signature: `dashboard_hydration:${e instanceof Error ? e.message : 'unknown'}`,
      fallbackUsed: true,
    });
  }

  // No persisted state found — use defaults
  // (Don't set _cachedState here; let getStorage() return fresh defaults each time
  //  until a mutation occurs, which will then cache and persist)
  ecsLog.debug('SHELL', 'Dashboard state missing persisted storage; using defaults');
  _cachedState = createDefaultState();
  markHydrated();
  return _cachedState;
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
        const storage = parsed as CustomPresetsStorage;
        _cachedCustomPresets = storage;
        // Ensure all profiles exist
        for (const p of ['expedition', 'vehicle', 'emergency'] as DashboardProfile[]) {
          if (!Array.isArray(storage[p])) storage[p] = [];
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
export { waitForHydration as waitForDashboardHydration };



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
    const mode = dashboardModeForProfile(profile);
    const defaultLayout = mode ? getDefaultDashboardLayout(mode).gridLayout : '2x2';
    return state.profiles[profile]?.gridLayout || defaultLayout;
  },

  setGridLayout(profile: DashboardProfile, layout: GridLayout): void {
    const state = getStorage();
    const mode = dashboardModeForProfile(profile);
    if (!state.profiles[profile]) {
      const defaults = createDefaultState();
      state.profiles[profile] = defaults.profiles[profile];
    }
    const nextLayout = layout;
    state.profiles[profile].gridLayout = nextLayout;
    state.profiles[profile].slots = normalizeDashboardSlotsForProfile(
      profile,
      state.profiles[profile].slots || [],
      mode,
      nextLayout,
    );
    state.profiles[profile].layoutVersion = DASHBOARD_LAYOUT_VERSION;
    state.profiles[profile].gridColumns = GRID_LAYOUT_CONFIG[nextLayout].cols;
    saveStorage(state);
    queueDashboardAction('dashboard_layout_change', { profile, layout: nextLayout }, `Grid layout changed to ${nextLayout} on ${profile}`);
  },


  getProfileSlots(profile: DashboardProfile): WidgetSlot[] {
    const state = getStorage();
    const profileState = state.profiles[profile];
    const mode = dashboardModeForProfile(profile);
    if (!profileState) {
      return mode ? buildDefaultSlots(mode) : [];
    }
    return normalizeDashboardSlotsForProfile(
      profile,
      profileState.slots || [],
      mode,
      profileState.gridLayout,
    );
  },

  canAssignWidget(profile: DashboardProfile, slotIndex: number, widgetType: string): boolean {
    const state = getStorage();
    const mode = dashboardModeForProfile(profile);
    const currentLayout = state.profiles[profile]?.gridLayout || (mode ? getDefaultDashboardLayout(mode).gridLayout : '2x2');
    const slots = normalizeDashboardSlotsForProfile(profile, state.profiles[profile]?.slots || [], mode, currentLayout);
    return canAssignWidgetToDashboardSlot(profile, slots, currentLayout, slotIndex, widgetType, mode);
  },


  setProfileSlots(profile: DashboardProfile, slots: WidgetSlot[]): void {
    const state = getStorage();
    const mode = dashboardModeForProfile(profile);
    const defaultLayout = mode ? getDefaultDashboardLayout(mode).gridLayout : '2x2';
    const currentLayout = state.profiles[profile]?.gridLayout || defaultLayout;
    if (!state.profiles[profile]) {
      state.profiles[profile] = {
        profile,
        gridLayout: currentLayout,
        slots: [],
        layoutVersion: DASHBOARD_LAYOUT_VERSION,
        gridColumns: GRID_LAYOUT_CONFIG[currentLayout].cols,
        lastUIState: {},
      };
    }
    state.profiles[profile].slots = normalizeDashboardSlotsForProfile(profile, slots, mode, currentLayout);
    state.profiles[profile].layoutVersion = DASHBOARD_LAYOUT_VERSION;
    state.profiles[profile].gridColumns = GRID_LAYOUT_CONFIG[currentLayout].cols;
    saveStorage(state);
  },

  assignWidget(profile: DashboardProfile, slotIndex: number, widgetType: string): boolean {
    const state = getStorage();
    const mode = dashboardModeForProfile(profile);

    if (mode && !isCuratedWidgetForMode(widgetType, mode)) {
      console.warn(`[DashboardStore] Refusing to assign widget "${widgetType}" to ${profile}; not curated for ${mode}.`);
      return false;
    }

    const currentLayout = state.profiles[profile]?.gridLayout || (mode ? getDefaultDashboardLayout(mode).gridLayout : '2x2');
    if (!canDashboardLayoutHostWidget(widgetType, currentLayout)) {
      console.warn(`[DashboardStore] Refusing to assign widget "${widgetType}" to ${profile}; layout ${currentLayout} cannot host its minimum size.`);
      return false;
    }
    const slots = normalizeDashboardSlotsForProfile(profile, state.profiles[profile]?.slots || [], mode, currentLayout);
    if (slotIndex < 0 || slotIndex >= slots.length) {
      return false;
    }
    if (!canAssignWidgetToDashboardSlot(profile, slots, currentLayout, slotIndex, widgetType, mode)) {
      console.warn(`[DashboardStore] Refusing to assign widget "${widgetType}" to ${profile}; dashboard region is full or incompatible with its canonical size.`);
      return false;
    }

    slots[slotIndex] = {
      ...slots[slotIndex],
      slotIndex,
      widgetType,
      widgetSize: clampProfileWidgetSize(profile, widgetType, getDashboardRecommendedSize(widgetType), mode),
      settings: slots[slotIndex].settings || {},
    };

    state.profiles[profile].slots = normalizeDashboardSlotsForProfile(profile, slots, mode, currentLayout);
    state.profiles[profile].layoutVersion = DASHBOARD_LAYOUT_VERSION;
    state.profiles[profile].gridColumns = GRID_LAYOUT_CONFIG[currentLayout].cols;
    saveStorage(state);
    queueDashboardAction('dashboard_widget_assign', { profile, slotIndex, widgetType }, `Widget "${widgetType}" assigned to slot ${slotIndex}`);
    return true;
  },

  removeWidget(profile: DashboardProfile, slotIndex: number): void {
    const state = getStorage();
    const mode = dashboardModeForProfile(profile);
    const currentLayout = state.profiles[profile]?.gridLayout || (mode ? getDefaultDashboardLayout(mode).gridLayout : '2x2');
    const slots = normalizeDashboardSlotsForProfile(profile, state.profiles[profile]?.slots || [], mode, currentLayout);

    // All widgets are now user-manageable — no removal restrictions
    const targetIndex = slots.findIndex(slot => slot.slotIndex === slotIndex);
    const widgetId = targetIndex >= 0 ? slots[targetIndex]?.widgetType : null;

    if (targetIndex >= 0) {
      slots[targetIndex] = {
        ...slots[targetIndex],
        widgetType: null,
        widgetSize: '2x1',
        settings: {},
      };
    }
    state.profiles[profile].slots = normalizeDashboardSlotsForProfile(profile, slots, mode, currentLayout);
    saveStorage(state);
    queueDashboardAction('dashboard_widget_remove', { profile, slotIndex, widgetId }, `Widget "${widgetId}" removed from slot ${slotIndex}`);
  },

  swapSlots(profile: DashboardProfile, fromIndex: number, toIndex: number): void {
    const state = getStorage();
    const mode = dashboardModeForProfile(profile);
    const currentLayout = state.profiles[profile]?.gridLayout || (mode ? getDefaultDashboardLayout(mode).gridLayout : '2x2');
    const slots = [...normalizeDashboardSlotsForProfile(profile, state.profiles[profile]?.slots || [], mode, currentLayout)];
    const fromArrayIndex = slots.findIndex(slot => slot.slotIndex === fromIndex);
    const toArrayIndex = slots.findIndex(slot => slot.slotIndex === toIndex);
    if (fromArrayIndex >= 0 && toArrayIndex >= 0) {
      const fromSlot = slots[fromArrayIndex];
      const toSlot = slots[toArrayIndex];

      slots[fromArrayIndex] = {
        ...fromSlot,
        widgetType: toSlot.widgetType,
        widgetSize: toSlot.widgetSize,
        settings: toSlot.settings || {},
      };
      slots[toArrayIndex] = {
        ...toSlot,
        widgetType: fromSlot.widgetType,
        widgetSize: fromSlot.widgetSize,
        settings: fromSlot.settings || {},
      };
    }
    state.profiles[profile].slots = normalizeDashboardSlotsForProfile(profile, slots, mode, currentLayout);
    saveStorage(state);
    queueDashboardAction('dashboard_widget_swap', { profile, fromIndex, toIndex }, `Widgets swapped: slot ${fromIndex} and slot ${toIndex}`);
  },


  updateWidgetSettings(profile: DashboardProfile, slotIndex: number, settings: Record<string, any>): void {
    const state = getStorage();
    const mode = dashboardModeForProfile(profile);
    const currentLayout = state.profiles[profile]?.gridLayout || (mode ? getDefaultDashboardLayout(mode).gridLayout : '2x2');
    const slots = normalizeDashboardSlotsForProfile(profile, state.profiles[profile]?.slots || [], mode, currentLayout);
    const targetIndex = slots.findIndex(slot => slot.slotIndex === slotIndex);
    if (targetIndex >= 0) {
      slots[targetIndex].settings = { ...slots[targetIndex].settings, ...settings };
    }
    state.profiles[profile].slots = normalizeDashboardSlotsForProfile(profile, slots, mode, currentLayout);
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
    void getStorage();
    return false;
  },

  setAutoCollapseEnabled(enabled: boolean): void {
    void enabled;
    const state = getStorage();
    if (state.autoCollapseEnabled !== false) {
      state.autoCollapseEnabled = false;
      saveStorage(state);
    }
  },

  // ── Per-Widget Auto-Collapse ────────────────────────────
  getWidgetAutoCollapse(widgetId: string): boolean {
    const state = getStorage();
    // Default to global setting if no per-widget override
    if (state.perWidgetAutoCollapse[widgetId] === undefined) {
      return false;
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
    const state = getStorage();
    const mode = dashboardModeForProfile(profile);
    if (mode) {
      const defaultLayout = getDefaultDashboardLayout(mode);
      state.profiles[profile] = {
        ...state.profiles[profile],
        profile,
        gridLayout: defaultLayout.gridLayout,
        slots: buildDefaultSlots(mode),
        layoutVersion: DASHBOARD_LAYOUT_VERSION,
        gridColumns: GRID_LAYOUT_CONFIG[defaultLayout.gridLayout].cols,
        lastUIState: state.profiles[profile]?.lastUIState || {},
        lastUsedPreset: undefined,
      };
    } else {
      const defaults = createDefaultState();
      state.profiles[profile] = defaults.profiles[profile];
    }
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
    const mode = dashboardModeForProfile(profile);
    const currentLayout = state.profiles[profile]?.gridLayout || (mode ? getDefaultDashboardLayout(mode).gridLayout : '2x2');
    const slots = normalizeDashboardSlotsForProfile(profile, state.profiles[profile]?.slots || [], mode, currentLayout);
    const targetIndex = slots.findIndex(slot => slot.slotIndex === slotIndex);
    if (targetIndex >= 0 && slots[targetIndex].widgetType) {
      const widgetId = slots[targetIndex].widgetType!;
      slots[targetIndex] = {
        ...slots[targetIndex],
        widgetSize: clampProfileWidgetSize(profile, widgetId, size, mode),
      };
    }
    state.profiles[profile].slots = normalizeDashboardSlotsForProfile(profile, slots, mode, currentLayout);
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
    const mode = dashboardModeForProfile(profile);
    const currentLayout = state.profiles[profile]?.gridLayout || (mode ? getDefaultDashboardLayout(mode).gridLayout : '2x2');
    const currentSlots = normalizeDashboardSlotsForProfile(profile, state.profiles[profile]?.slots || [], mode, currentLayout);
    const resizedSlots = currentSlots.map((slot, index) => ({
      ...slot,
      widgetSize: slot.widgetType
        ? clampProfileWidgetSize(profile, slot.widgetType, (preset.slotSizes[index] as WidgetSize | undefined) ?? slot.widgetSize, mode)
        : '2x1',
    }));

    state.profiles[profile].gridLayout = preset.gridLayout;
    state.profiles[profile].slots = normalizeDashboardSlotsForProfile(profile, resizedSlots, mode, preset.gridLayout);
    state.profiles[profile].layoutVersion = DASHBOARD_LAYOUT_VERSION;
    state.profiles[profile].gridColumns = GRID_LAYOUT_CONFIG[preset.gridLayout].cols;
    state.profiles[profile].lastUsedPreset = presetId;
    saveStorage(state);
    queueDashboardAction('dashboard_preset_apply', { profile, presetId, newLayout: state.profiles[profile].gridLayout }, `Preset "${presetId}" applied to ${profile}`);
    return state.profiles[profile].gridLayout;
  },

  /**
   * Apply a custom (user-saved) preset to the current profile.
   * Changes grid layout AND widget sizes to match the custom preset.
   * Preserves existing widgets by placing them in order into the new grid.
   * Returns the new grid layout so the caller can update UI state.
   */
  applyCustomPreset(profile: DashboardProfile, preset: CustomPreset): GridLayout {
    const state = getStorage();
    const mode = dashboardModeForProfile(profile);
    const currentLayout = state.profiles[profile]?.gridLayout || (mode ? getDefaultDashboardLayout(mode).gridLayout : '2x2');
    const currentSlots = normalizeDashboardSlotsForProfile(profile, state.profiles[profile]?.slots || [], mode, currentLayout);
    const resizedSlots = currentSlots.map((slot, index) => ({
      ...slot,
      widgetSize: slot.widgetType
        ? clampProfileWidgetSize(profile, slot.widgetType, (preset.slotSizes[index] as WidgetSize | undefined) ?? slot.widgetSize, mode)
        : '2x1',
    }));

    state.profiles[profile].gridLayout = preset.gridLayout as GridLayout;
    state.profiles[profile].slots = normalizeDashboardSlotsForProfile(profile, resizedSlots, mode, preset.gridLayout as GridLayout);
    state.profiles[profile].layoutVersion = DASHBOARD_LAYOUT_VERSION;
    state.profiles[profile].gridColumns = GRID_LAYOUT_CONFIG[preset.gridLayout as GridLayout].cols;
    state.profiles[profile].lastUsedPreset = preset.id;
    saveStorage(state);
    queueDashboardAction('dashboard_preset_apply', { profile, presetId: preset.id, newLayout: state.profiles[profile].gridLayout }, `Custom preset "${preset.name}" applied to ${profile}`);
    return state.profiles[profile].gridLayout;
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
    id: '2x2-monitor-navigate',
    name: 'Monitor + Navigate',
    description: 'Top monitoring widget with a wide Navigate surface below',
    gridLayout: '2x2',
    slotSizes: ['2x1', '2x1', '1x1', '1x1'],
    icon: 'navigate-outline',
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
