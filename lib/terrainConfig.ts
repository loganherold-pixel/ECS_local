/**
 * terrainConfig.ts — ECS Terrain Visualization Configuration
 *
 * Manages terrain rendering settings for the Mapbox GL JS WebView map:
 *   - Terrain DEM source (mapbox-terrain-dem-v1) for 3D elevation
 *   - Hillshade layer for relief shading
 *   - Contour lines from mapbox-terrain-v2 vector tileset
 *   - Dark-mode optimized styling
 *   - Performance-safe exaggeration values
 *   - Android Auto / CarPlay simplified rendering flags
 *
 * Terrain layers are inserted BENEATH navigation overlays (routes, pins,
 * markers) to ensure they provide visual context without obscuring
 * operational data.
 *
 * Layer ordering (bottom to top):
 *   1. Base map style (dark-v11 / satellite / outdoors)
 *   2. Hillshade layer (subtle relief shading)
 *   3. Contour lines (elevation contours from terrain-v2)
 *   4. Route polylines / segments
 *   5. Trail breadcrumbs
 *   6. Bailout markers
 *   7. Pin markers / clusters
 *   8. Tilt alert zones
 *   9. Campsite markers
 *  10. User location / vehicle arrow
 */

// ── Terrain DEM Source ──────────────────────────────────────
export const TERRAIN_DEM_SOURCE_ID = 'ecs-terrain-dem';
export const TERRAIN_DEM_SOURCE_URL = 'mapbox://mapbox.mapbox-terrain-dem-v1';
export const TERRAIN_DEM_TILESIZE = 512;

// ── Terrain Exaggeration ────────────────────────────────────
// Values between 1.0 and 2.0 are typical for off-road navigation.
// 1.3 provides visible elevation without distorting the map.
export const TERRAIN_EXAGGERATION = 1.3;
export const TERRAIN_EXAGGERATION_MIN = 1.0;
export const TERRAIN_EXAGGERATION_MAX = 2.0;

// ── Hillshade Configuration ─────────────────────────────────
export const HILLSHADE_LAYER_ID = 'ecs-hillshade';
export const HILLSHADE_SOURCE_ID = TERRAIN_DEM_SOURCE_ID; // reuse DEM source

export interface HillshadeConfig {
  layerId: string;
  sourceId: string;
  /** Shadow color — dark for dark-mode, subtle */
  shadowColor: string;
  /** Highlight color — subtle warm tone for dark-mode */
  highlightColor: string;
  /** Accent color — midtone shading */
  accentColor: string;
  /** Illumination direction (0-359, 0=north, 315=NW default) */
  illuminationDirection: number;
  /** Illumination anchor: map or viewport */
  illuminationAnchor: 'map' | 'viewport';
  /** Hillshade intensity (0-1) */
  intensity: number;
  /** Hillshade exaggeration (0-1) */
  exaggeration: number;
}

export const HILLSHADE_DARK_MODE: HillshadeConfig = {
  layerId: HILLSHADE_LAYER_ID,
  sourceId: HILLSHADE_SOURCE_ID,
  shadowColor: 'rgba(0, 0, 0, 0.45)',
  highlightColor: 'rgba(196, 138, 44, 0.08)',
  accentColor: 'rgba(62, 79, 60, 0.15)',
  illuminationDirection: 315,
  illuminationAnchor: 'map',
  intensity: 0.35,
  exaggeration: 0.4,
};

export const HILLSHADE_SATELLITE: HillshadeConfig = {
  layerId: HILLSHADE_LAYER_ID,
  sourceId: HILLSHADE_SOURCE_ID,
  shadowColor: 'rgba(0, 0, 0, 0.3)',
  highlightColor: 'rgba(255, 255, 255, 0.08)',
  accentColor: 'rgba(0, 0, 0, 0.1)',
  illuminationDirection: 315,
  illuminationAnchor: 'map',
  intensity: 0.25,
  exaggeration: 0.35,
};

// ── Contour Configuration ───────────────────────────────────
export const CONTOUR_SOURCE_ID = 'ecs-contour-source';
export const CONTOUR_SOURCE_URL = 'mapbox://mapbox.mapbox-terrain-v2';
export const CONTOUR_SOURCE_LAYER = 'contour'; // source-layer in terrain-v2

export const CONTOUR_LINE_LAYER_ID = 'ecs-contour-lines';
export const CONTOUR_LABEL_LAYER_ID = 'ecs-contour-labels';

export interface ContourConfig {
  lineLayerId: string;
  labelLayerId: string;
  sourceId: string;
  sourceLayer: string;
  /** Line color — subtle for dark mode */
  lineColor: string;
  /** Line width at different zoom levels */
  lineWidthBase: number;
  lineWidthMajor: number;
  /** Major contour interval (every Nth line is bolder) */
  majorInterval: number;
  /** Line opacity */
  lineOpacity: number;
  /** Major line opacity */
  majorLineOpacity: number;
  /** Label color */
  labelColor: string;
  /** Label font size */
  labelSize: number;
  /** Label halo color */
  labelHaloColor: string;
  /** Label halo width */
  labelHaloWidth: number;
  /** Min zoom for contour visibility */
  minZoom: number;
  /** Min zoom for labels */
  labelMinZoom: number;
}

export const CONTOUR_DARK_MODE: ContourConfig = {
  lineLayerId: CONTOUR_LINE_LAYER_ID,
  labelLayerId: CONTOUR_LABEL_LAYER_ID,
  sourceId: CONTOUR_SOURCE_ID,
  sourceLayer: CONTOUR_SOURCE_LAYER,
  lineColor: 'rgba(196, 138, 44, 0.18)',
  lineWidthBase: 0.5,
  lineWidthMajor: 1.0,
  majorInterval: 5,  // every 5th contour line is major (typically 200ft/50m intervals)
  lineOpacity: 0.4,
  majorLineOpacity: 0.55,
  labelColor: 'rgba(196, 138, 44, 0.45)',
  labelSize: 9,
  labelHaloColor: 'rgba(11, 15, 18, 0.8)',
  labelHaloWidth: 1.5,
  minZoom: 11,
  labelMinZoom: 13,
};

export const CONTOUR_SATELLITE: ContourConfig = {
  lineLayerId: CONTOUR_LINE_LAYER_ID,
  labelLayerId: CONTOUR_LABEL_LAYER_ID,
  sourceId: CONTOUR_SOURCE_ID,
  sourceLayer: CONTOUR_SOURCE_LAYER,
  lineColor: 'rgba(255, 255, 255, 0.15)',
  lineWidthBase: 0.5,
  lineWidthMajor: 1.0,
  majorInterval: 5,
  lineOpacity: 0.35,
  majorLineOpacity: 0.5,
  labelColor: 'rgba(255, 255, 255, 0.5)',
  labelSize: 9,
  labelHaloColor: 'rgba(0, 0, 0, 0.7)',
  labelHaloWidth: 1.5,
  minZoom: 11,
  labelMinZoom: 13,
};

// ── Style-aware config resolver ─────────────────────────────
export type MapStyleCategory = 'dark' | 'satellite' | 'terrain' | 'outdoors';

export function getHillshadeConfig(styleCategory: MapStyleCategory): HillshadeConfig {
  switch (styleCategory) {
    case 'satellite':
      return HILLSHADE_SATELLITE;
    case 'dark':
    case 'terrain':
    case 'outdoors':
    default:
      return HILLSHADE_DARK_MODE;
  }
}

export function getContourConfig(styleCategory: MapStyleCategory): ContourConfig {
  switch (styleCategory) {
    case 'satellite':
      return CONTOUR_SATELLITE;
    case 'dark':
    case 'terrain':
    case 'outdoors':
    default:
      return CONTOUR_DARK_MODE;
  }
}

// ── Mapbox GL JS Code Generation ────────────────────────────
// These functions generate JavaScript strings that are injected
// into the WebView HTML to configure terrain layers.

/**
 * Generate JS code to add terrain DEM source and enable 3D terrain.
 * Must be called after map.on('load').
 */
export function generateTerrainInitJS(exaggeration: number = TERRAIN_EXAGGERATION): string {
  return `
    // ══════════ ECS TERRAIN: DEM Source + 3D Terrain ══════════
    (function() {
      try {
        // Add DEM raster-dem source
        if (!map.getSource('${TERRAIN_DEM_SOURCE_ID}')) {
          map.addSource('${TERRAIN_DEM_SOURCE_ID}', {
            type: 'raster-dem',
            url: '${TERRAIN_DEM_SOURCE_URL}',
            tileSize: ${TERRAIN_DEM_TILESIZE},
            maxzoom: 14
          });
          console.log('[ECS Terrain] DEM source added: ${TERRAIN_DEM_SOURCE_ID}');
        }

        // Enable 3D terrain rendering
        map.setTerrain({
          source: '${TERRAIN_DEM_SOURCE_ID}',
          exaggeration: ${exaggeration}
        });
        console.log('[ECS Terrain] 3D terrain enabled (exaggeration: ${exaggeration})');
      } catch(e) {
        console.warn('[ECS Terrain] Failed to initialize terrain DEM:', e);
      }
    })();
  `;
}

/**
 * Generate JS code to add hillshade layer.
 * Inserted BEFORE route/overlay layers for correct z-ordering.
 */
export function generateHillshadeJS(config: HillshadeConfig = HILLSHADE_DARK_MODE): string {
  return `
    // ══════════ ECS TERRAIN: Hillshade Layer ══════════
    (function() {
      try {
        if (map.getLayer('${config.layerId}')) {
          map.removeLayer('${config.layerId}');
        }
        map.addLayer({
          id: '${config.layerId}',
          type: 'hillshade',
          source: '${config.sourceId}',
          layout: { visibility: 'visible' },
          paint: {
            'hillshade-shadow-color': '${config.shadowColor}',
            'hillshade-highlight-color': '${config.highlightColor}',
            'hillshade-accent-color': '${config.accentColor}',
            'hillshade-illumination-direction': ${config.illuminationDirection},
            'hillshade-illumination-anchor': '${config.illuminationAnchor}',
            'hillshade-exaggeration': ${config.exaggeration}
          }
        }, map.getStyle().layers.find(function(l) {
          return l.type === 'line' || l.type === 'symbol' || l.id.indexOf('route') !== -1 || l.id.indexOf('seg-') !== -1;
        })?.id || undefined);
        console.log('[ECS Terrain] Hillshade layer added: ${config.layerId}');
      } catch(e) {
        console.warn('[ECS Terrain] Failed to add hillshade layer:', e);
      }
    })();
  `;
}

/**
 * Generate JS code to add contour line and label layers.
 * Inserted BEFORE route layers but AFTER hillshade.
 */
export function generateContourJS(config: ContourConfig = CONTOUR_DARK_MODE): string {
  return `
    // ══════════ ECS TERRAIN: Contour Lines + Labels ══════════
    (function() {
      try {
        // Add contour vector source
        if (!map.getSource('${config.sourceId}')) {
          map.addSource('${config.sourceId}', {
            type: 'vector',
            url: '${CONTOUR_SOURCE_URL}'
          });
          console.log('[ECS Terrain] Contour source added: ${config.sourceId}');
        }

        // Find insertion point — before any route/overlay layers
        var insertBefore = undefined;
        var layers = map.getStyle().layers;
        for (var i = 0; i < layers.length; i++) {
          var lid = layers[i].id;
          if (lid.indexOf('route') !== -1 || lid.indexOf('seg-') !== -1 ||
              lid.indexOf('trail-') !== -1 || lid.indexOf('speed-') !== -1 ||
              lid.indexOf('pin-') !== -1) {
            insertBefore = lid;
            break;
          }
        }

        // Remove existing contour layers if present
        if (map.getLayer('${config.lineLayerId}')) map.removeLayer('${config.lineLayerId}');
        if (map.getLayer('${config.lineLayerId}-major')) map.removeLayer('${config.lineLayerId}-major');
        if (map.getLayer('${config.labelLayerId}')) map.removeLayer('${config.labelLayerId}');

        // Minor contour lines
        map.addLayer({
          id: '${config.lineLayerId}',
          type: 'line',
          source: '${config.sourceId}',
          'source-layer': '${config.sourceLayer}',
          minzoom: ${config.minZoom},
          filter: ['!=', ['%', ['get', 'index'], ${config.majorInterval}], 0],
          layout: {
            visibility: 'visible',
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': '${config.lineColor}',
            'line-width': ${config.lineWidthBase},
            'line-opacity': ${config.lineOpacity}
          }
        }, insertBefore);

        // Major contour lines (every Nth interval — bolder)
        map.addLayer({
          id: '${config.lineLayerId}-major',
          type: 'line',
          source: '${config.sourceId}',
          'source-layer': '${config.sourceLayer}',
          minzoom: ${config.minZoom},
          filter: ['==', ['%', ['get', 'index'], ${config.majorInterval}], 0],
          layout: {
            visibility: 'visible',
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': '${config.lineColor}',
            'line-width': ${config.lineWidthMajor},
            'line-opacity': ${config.majorLineOpacity}
          }
        }, insertBefore);

        // Contour elevation labels (major contours only)
        map.addLayer({
          id: '${config.labelLayerId}',
          type: 'symbol',
          source: '${config.sourceId}',
          'source-layer': '${config.sourceLayer}',
          minzoom: ${config.labelMinZoom},
          filter: ['==', ['%', ['get', 'index'], ${config.majorInterval}], 0],
          layout: {
            visibility: 'visible',
            'symbol-placement': 'line',
            'text-field': ['concat', ['to-string', ['get', 'ele']], 'm'],
            'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Regular'],
            'text-size': ${config.labelSize},
            'text-max-angle': 25,
            'text-padding': 5
          },
          paint: {
            'text-color': '${config.labelColor}',
            'text-halo-color': '${config.labelHaloColor}',
            'text-halo-width': ${config.labelHaloWidth}
          }
        }, insertBefore);

        console.log('[ECS Terrain] Contour layers added (minor + major + labels)');
      } catch(e) {
        console.warn('[ECS Terrain] Failed to add contour layers:', e);
      }
    })();
  `;
}

/**
 * Generate JS code to remove all terrain layers and disable 3D terrain.
 */
export function generateTerrainRemoveJS(): string {
  return `
    // ══════════ ECS TERRAIN: Remove All Terrain Layers ══════════
    (function() {
      try {
        // Disable 3D terrain
        map.setTerrain(null);

        // Remove hillshade
        if (map.getLayer('${HILLSHADE_LAYER_ID}')) map.removeLayer('${HILLSHADE_LAYER_ID}');

        // Remove contour layers
        if (map.getLayer('${CONTOUR_LINE_LAYER_ID}')) map.removeLayer('${CONTOUR_LINE_LAYER_ID}');
        if (map.getLayer('${CONTOUR_LINE_LAYER_ID}-major')) map.removeLayer('${CONTOUR_LINE_LAYER_ID}-major');
        if (map.getLayer('${CONTOUR_LABEL_LAYER_ID}')) map.removeLayer('${CONTOUR_LABEL_LAYER_ID}');

        // Remove sources
        if (map.getSource('${TERRAIN_DEM_SOURCE_ID}')) map.removeSource('${TERRAIN_DEM_SOURCE_ID}');
        if (map.getSource('${CONTOUR_SOURCE_ID}')) map.removeSource('${CONTOUR_SOURCE_ID}');

        console.log('[ECS Terrain] All terrain layers removed');
      } catch(e) {
        console.warn('[ECS Terrain] Failed to remove terrain layers:', e);
      }
    })();
  `;
}

/**
 * Generate JS code to toggle terrain visibility without removing sources.
 * More efficient than full add/remove for frequent toggling.
 */
export function generateTerrainToggleJS(enabled: boolean, exaggeration: number = TERRAIN_EXAGGERATION): string {
  if (enabled) {
    return `
      (function() {
        try {
          // Re-enable 3D terrain
          if (map.getSource('${TERRAIN_DEM_SOURCE_ID}')) {
            map.setTerrain({ source: '${TERRAIN_DEM_SOURCE_ID}', exaggeration: ${exaggeration} });
          }
          // Show hillshade
          if (map.getLayer('${HILLSHADE_LAYER_ID}')) {
            map.setLayoutProperty('${HILLSHADE_LAYER_ID}', 'visibility', 'visible');
          }
          // Show contour lines
          if (map.getLayer('${CONTOUR_LINE_LAYER_ID}')) {
            map.setLayoutProperty('${CONTOUR_LINE_LAYER_ID}', 'visibility', 'visible');
          }
          if (map.getLayer('${CONTOUR_LINE_LAYER_ID}-major')) {
            map.setLayoutProperty('${CONTOUR_LINE_LAYER_ID}-major', 'visibility', 'visible');
          }
          if (map.getLayer('${CONTOUR_LABEL_LAYER_ID}')) {
            map.setLayoutProperty('${CONTOUR_LABEL_LAYER_ID}', 'visibility', 'visible');
          }
          console.log('[ECS Terrain] Terrain layers shown');
        } catch(e) {
          console.warn('[ECS Terrain] Toggle show failed:', e);
        }
      })();
    `;
  } else {
    return `
      (function() {
        try {
          // Disable 3D terrain
          map.setTerrain(null);
          // Hide hillshade
          if (map.getLayer('${HILLSHADE_LAYER_ID}')) {
            map.setLayoutProperty('${HILLSHADE_LAYER_ID}', 'visibility', 'none');
          }
          // Hide contour lines
          if (map.getLayer('${CONTOUR_LINE_LAYER_ID}')) {
            map.setLayoutProperty('${CONTOUR_LINE_LAYER_ID}', 'visibility', 'none');
          }
          if (map.getLayer('${CONTOUR_LINE_LAYER_ID}-major')) {
            map.setLayoutProperty('${CONTOUR_LINE_LAYER_ID}-major', 'visibility', 'none');
          }
          if (map.getLayer('${CONTOUR_LABEL_LAYER_ID}')) {
            map.setLayoutProperty('${CONTOUR_LABEL_LAYER_ID}', 'visibility', 'none');
          }
          console.log('[ECS Terrain] Terrain layers hidden');
        } catch(e) {
          console.warn('[ECS Terrain] Toggle hide failed:', e);
        }
      })();
    `;
  }
}

/**
 * Generate the full terrain initialization JS (DEM + hillshade + contours).
 * Called once after map.on('load') when terrain is enabled.
 */
export function generateFullTerrainInitJS(
  styleCategory: MapStyleCategory = 'dark',
  exaggeration: number = TERRAIN_EXAGGERATION,
): string {
  const hillshade = getHillshadeConfig(styleCategory);
  const contour = getContourConfig(styleCategory);
  return [
    generateTerrainInitJS(exaggeration),
    generateHillshadeJS(hillshade),
    generateContourJS(contour),
  ].join('\n');
}

// ── Persistence ─────────────────────────────────────────────
const TERRAIN_ENABLED_KEY = 'ecs_terrain_enabled';

export function getTerrainEnabledFromStorage(): boolean {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(TERRAIN_ENABLED_KEY) === 'true';
    }
  } catch {}
  return false;
}

export function setTerrainEnabledToStorage(enabled: boolean): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(TERRAIN_ENABLED_KEY, String(enabled));
    }
  } catch {}
}

// ── Android Auto / CarPlay Compatibility ────────────────────
// Terrain rendering is disabled for simplified vehicle display feeds.
// These platforms receive flat 2D map data only.
export function isTerrainSupportedForDisplay(displayMode: 'full' | 'android-auto' | 'carplay'): boolean {
  return displayMode === 'full';
}

