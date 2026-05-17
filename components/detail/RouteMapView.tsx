import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import type { ExpeditionWaypoint, WaypointType } from '../../lib/types';

// ============================================================
// MARKER COLORS BY WAYPOINT TYPE
// ============================================================
const TYPE_COLORS: Record<WaypointType, string> = {
  stop: '#5B8DEF',
  camp: '#4CAF50',
  resupply: '#C48A2C',
  water: '#29B6F6',
  fuel: '#FF9800',
  poi: '#9B59B6',
  hazard: '#C0392B',
};

const TYPE_ICONS: Record<WaypointType, string> = {
  stop: 'S',
  camp: 'C',
  resupply: 'R',
  water: 'W',
  fuel: 'F',
  poi: 'P',
  hazard: '!',
};

interface Props {
  waypoints: ExpeditionWaypoint[];
  height?: number;
  currentLat?: number | null;
  currentLon?: number | null;
  startWaypointId?: string | null;
}

export default function RouteMapView({
  waypoints,
  height = 300,
  currentLat,
  currentLon,
  startWaypointId,
}: Props) {
  // Filter waypoints with valid coordinates
  const geoWaypoints = useMemo(
    () => waypoints.filter(wp => wp.latitude != null && wp.longitude != null),
    [waypoints]
  );

  const hasCurrentPos = currentLat != null && currentLon != null;

  // Compute map bounds (include current position if available)
  const bounds = useMemo(() => {
    const allPoints: { lat: number; lng: number }[] = geoWaypoints.map(wp => ({
      lat: wp.latitude!, lng: wp.longitude!,
    }));
    if (hasCurrentPos) {
      allPoints.push({ lat: currentLat!, lng: currentLon! });
    }
    if (allPoints.length === 0) return null;

    let minLat = Infinity, maxLat = -Infinity;
    let minLng = Infinity, maxLng = -Infinity;
    for (const p of allPoints) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
    }
    const latPad = Math.max((maxLat - minLat) * 0.15, 0.01);
    const lngPad = Math.max((maxLng - minLng) * 0.15, 0.01);
    return {
      minLat: minLat - latPad,
      maxLat: maxLat + latPad,
      minLng: minLng - lngPad,
      maxLng: maxLng + lngPad,
      centerLat: (minLat + maxLat) / 2,
      centerLng: (minLng + maxLng) / 2,
    };
  }, [geoWaypoints, hasCurrentPos, currentLat, currentLon]);

  // Build HTML for the Leaflet map
  const mapHtml = useMemo(() => {
    if (!bounds) return '';
    if (geoWaypoints.length === 0 && !hasCurrentPos) return '';

    const markersJs = geoWaypoints.map((wp, idx) => {
      const isStart = startWaypointId && wp.id === startWaypointId;
      const color = TYPE_COLORS[wp.waypoint_type] || '#5B8DEF';
      const icon = TYPE_ICONS[wp.waypoint_type] || (idx + 1).toString();
      const label = wp.name.replace(/'/g, "\\'").replace(/"/g, '\\"');
      const typeLabel = wp.waypoint_type.toUpperCase();
      const startBadge = isStart ? '<br/><b style="color:#4CAF50;font-size:10px;">START POINT</b>' : '';
      const borderStyle = isStart
        ? 'border:3px solid #4CAF50;box-shadow:0 0 10px rgba(76,175,80,0.6);'
        : 'border:2px solid rgba(255,255,255,0.6);box-shadow:0 2px 6px rgba(0,0,0,0.5);';
      return `
        var icon${idx} = L.divIcon({
          className: 'custom-marker',
          html: '<div style="background:${color};width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:11px;${borderStyle}">${icon}</div>',
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        L.marker([${wp.latitude}, ${wp.longitude}], { icon: icon${idx} })
          .addTo(map)
          .bindPopup('<div style="font-family:monospace;"><b style="color:${color};">[${typeLabel}]</b>${startBadge}<br/><b>${label}</b><br/><span style="font-size:11px;color:#666;">${wp.latitude!.toFixed(5)}, ${wp.longitude!.toFixed(5)}</span>${wp.elevation_ft ? '<br/><span style="font-size:11px;color:#888;">Elev: ' + wp.elevation_ft + ' ft</span>' : ''}</div>');
      `;
    }).join('\n');

    // Current position marker
    const currentPosJs = hasCurrentPos ? `
      var posIcon = L.divIcon({
        className: 'custom-marker',
        html: '<div style="position:relative;"><div style="background:#E6E6E1;width:16px;height:16px;border-radius:50%;border:3px solid #C48A2C;box-shadow:0 0 12px rgba(196,138,44,0.7);"></div><div style="position:absolute;top:-2px;left:-2px;width:20px;height:20px;border-radius:50%;border:2px solid rgba(196,138,44,0.4);animation:pulse 2s infinite;"></div></div>',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });
      L.marker([${currentLat}, ${currentLon}], { icon: posIcon })
        .addTo(map)
        .bindPopup('<div style="font-family:monospace;"><b style="color:#C48A2C;">CURRENT POSITION</b><br/><span style="font-size:11px;color:#666;">${currentLat!.toFixed(5)}, ${currentLon!.toFixed(5)}</span></div>');
    ` : '';

    // Polyline coordinates in order
    const polyCoords = geoWaypoints
      .map(wp => `[${wp.latitude}, ${wp.longitude}]`)
      .join(',');

    return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
    #map { width: 100%; height: 100%; background: #0B0F12; }
    .custom-marker { background: transparent !important; border: none !important; }
    .leaflet-popup-content-wrapper {
      background: #1a1f24;
      color: #e6e6e1;
      border-radius: 8px;
      border: 1px solid #3E4F3C;
    }
    .leaflet-popup-tip { background: #1a1f24; }
    .leaflet-popup-content { margin: 10px 12px; font-size: 12px; }
    @keyframes pulse {
      0% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.6); opacity: 0.3; }
      100% { transform: scale(1); opacity: 1; }
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', {
      zoomControl: true,
      attributionControl: false,
    });

    // Dark tile layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
    }).addTo(map);

    // Fit bounds
    map.fitBounds([
      [${bounds.minLat}, ${bounds.minLng}],
      [${bounds.maxLat}, ${bounds.maxLng}]
    ]);

    // Add markers
    ${markersJs}

    // Current position marker
    ${currentPosJs}

    // Add polyline
    ${geoWaypoints.length >= 2 ? `
    L.polyline([${polyCoords}], {
      color: '#C48A2C',
      weight: 3,
      opacity: 0.85,
      dashArray: '8, 6',
      lineCap: 'round',
    }).addTo(map);
    ` : ''}
  </script>
</body>
</html>`;
  }, [geoWaypoints, bounds, hasCurrentPos, currentLat, currentLon, startWaypointId]);

  // No waypoints with coordinates and no current position
  if (geoWaypoints.length === 0 && !hasCurrentPos) {
    return (
      <View style={[s.emptyMap, { height }]}>
        <Ionicons name="map-outline" size={36} color={TACTICAL.textMuted} />
        <Text style={s.emptyTitle}>NO ROUTE GEOMETRY</Text>
        <Text style={s.emptySub}>Add lat/lon to route points to render the route map</Text>
      </View>
    );
  }

  // Web platform: use iframe
  if (Platform.OS === 'web') {
    return (
      <View style={[s.mapContainer, { height }]}>
        <iframe
          srcDoc={mapHtml}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            borderRadius: 10,
          }}
          title="Route Map"
        />
      </View>
    );
  }

  // Native: use WebView
  if (WebView) {
    return (
      <View style={[s.mapContainer, { height }]}>
        <WebView
          source={{ html: mapHtml }}
          style={{ flex: 1, borderRadius: 10, backgroundColor: TACTICAL.bg }}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          scrollEnabled={false}
          bounces={false}
        />
      </View>
    );
  }

  // Fallback if WebView not available
  return (
    <View style={[s.emptyMap, { height }]}>
      <Ionicons name="map-outline" size={36} color={TACTICAL.textMuted} />
      <Text style={s.emptyTitle}>MAP SURFACE UNAVAILABLE</Text>
      <Text style={s.emptySub}>WebView component not loaded</Text>
    </View>
  );
}

const s = StyleSheet.create({
  mapContainer: {
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: TACTICAL.bg,
  },
  emptyMap: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: TACTICAL.panel,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  emptySub: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
});


