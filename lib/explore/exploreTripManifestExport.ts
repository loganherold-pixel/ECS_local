import { Platform } from 'react-native';
import type { OfflinePrepPackManifest } from '../offlinePrepPack/offlinePrepPackTypes';
import type { OfflinePrepPackPresentation } from '../offlinePrepPack/offlinePrepPackPresentation';

export type ExploreTripManifestCoordinate = {
  latitude: number;
  longitude: number;
};

export type ExploreTripManifestExportInput = {
  title: string;
  manifest: OfflinePrepPackManifest;
  itinerary?: unknown | null;
  route?: unknown | null;
  routeCoordinates?: readonly ExploreTripManifestCoordinate[] | null;
  tripPlan?: unknown | null;
  readiness?: unknown | null;
  vehicleProfile?: unknown | null;
  emergencyPoints?: unknown | null;
  emergencyNotes?: unknown | null;
  offlinePresentation?: OfflinePrepPackPresentation | null;
  generatedAt?: string | null;
};

export type ExploreTripManifestExportResult = {
  success: boolean;
  output?: 'shared_pdf' | 'print_dialog' | 'downloaded_html';
  error?: string;
};

export type ExploreFamilyManifestStop = {
  sequence: number;
  label: string;
  role: string;
  coordinate: ExploreTripManifestCoordinate | null;
  timing: string | null;
  source: string;
  sourceState: string;
  confidence: string | null;
  notes: string[];
};

export type ExploreFamilyEmergencyManifestPresentation = {
  documentTitle: string;
  routeName: string;
  generatedAt: string;
  route: {
    distanceMiles: number | null;
    region: string | null;
    terrain: string | null;
    source: string;
    warnings: string[];
    coordinates: ExploreTripManifestCoordinate[];
  };
  trip: {
    departurePlan: string | null;
    estimatedDuration: string | null;
    groupType: string | null;
    expectedReturn: null;
    checkInPlan: null;
    trustedContact: null;
  };
  readiness: {
    score: number | null;
    status: string;
    source: string;
    updatedAt: string | null;
    summary: string | null;
    concern: string | null;
  };
  vehicle: {
    description: string | null;
    source: string | null;
    confidence: string | null;
    updatedAt: string | null;
  };
  itinerary: ExploreFamilyManifestStop[];
  supportPoints: ExploreFamilyManifestStop[];
  emergencyNotes: string[];
  offline: {
    status: string;
    summary: string;
    requiredReadyCount: number;
    requiredCount: number;
    mapStatus: string;
    turnGuidanceStatus: string;
    attention: string[];
  };
};

const C = {
  ink: '#17211C',
  muted: '#5F6B64',
  border: '#B9C3BC',
  soft: '#F2F5F3',
  amber: '#9A6519',
  amberSoft: '#FFF4DF',
  green: '#28693D',
  greenSoft: '#EAF4ED',
  red: '#A33A31',
  redSoft: '#FBEDEA',
};

const NOT_PROVIDED = 'Not provided for this trip';
const NOT_AVAILABLE = 'Unavailable from the saved trip plan';

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean || null;
}

function finiteNumber(value: unknown): number | null {
  const candidate = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(candidate) ? candidate : null;
}

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function humanize(value: unknown): string {
  return String(value ?? 'unknown')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return NOT_AVAILABLE;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Date(timestamp).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function coordinate(value: unknown): ExploreTripManifestCoordinate | null {
  if (Array.isArray(value) && value.length >= 2) {
    const longitude = finiteNumber(value[0]);
    const latitude = finiteNumber(value[1]);
    if (latitude == null || longitude == null) return null;
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
    return { latitude, longitude };
  }
  const record = objectRecord(value);
  const latitude = finiteNumber(record.latitude ?? record.lat);
  const longitude = finiteNumber(record.longitude ?? record.lng ?? record.lon);
  if (latitude == null || longitude == null) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

function coordinateLine(value: ExploreTripManifestCoordinate | null): string {
  return value
    ? `${value.latitude.toFixed(5)}, ${value.longitude.toFixed(5)}`
    : NOT_AVAILABLE;
}

function uniqueStrings(values: unknown[], limit = 16): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  values.forEach((value) => {
    const record = objectRecord(value);
    const text = cleanText(
      typeof value === 'string'
        ? value
        : record.message ?? record.note ?? record.summary ?? record.title ?? record.label,
    );
    if (!text || seen.has(text) || output.length >= limit) return;
    seen.add(text);
    output.push(text);
  });
  return output;
}

function routeSource(route: Record<string, unknown>, tripPlan: Record<string, unknown>): string {
  const planRoute = objectRecord(tripPlan.route);
  const metadata = objectRecord(route.routeMetadata ?? route.route_metadata);
  const provenance = objectRecord(planRoute.provenance ?? metadata.provenance);
  return cleanText(
    planRoute.source ??
    route.source ??
    metadata.source ??
    provenance.sourceName ??
    provenance.source,
  ) ?? 'Source not recorded';
}

function routeWarnings(route: Record<string, unknown>, tripPlan: Record<string, unknown>, itinerary: Record<string, unknown>): string[] {
  const metadata = objectRecord(route.routeMetadata ?? route.route_metadata);
  return uniqueStrings([
    ...arrayValue(metadata.warnings),
    ...arrayValue(tripPlan.warnings),
    ...arrayValue(itinerary.warnings),
  ]);
}

function stopRole(record: Record<string, unknown>): string {
  return humanize(
    record.waypointType ??
    record.stopRole ??
    record.role ??
    record.type ??
    record.category ??
    record.phase ??
    'planned stop',
  );
}

function stopTiming(record: Record<string, unknown>): string | null {
  const etaHours = finiteNumber(record.etaOffsetHours ?? record.eta_hours);
  if (etaHours != null) return `Estimated ${etaHours.toFixed(1)} hr after departure`;
  const day = finiteNumber(record.plannedDay ?? record.day);
  return day != null ? `Planned day ${Math.max(1, Math.round(day))}` : null;
}

function stopSourceState(record: Record<string, unknown>): string {
  const sourceRecord = objectRecord(record.source);
  return cleanText(
    record.sourceState ??
    record.source_state ??
    sourceRecord.state ??
    objectRecord(record.metadata).sourceState,
  ) ?? 'state not recorded';
}

function stopSource(record: Record<string, unknown>): string {
  const sourceRecord = objectRecord(record.source);
  return cleanText(sourceRecord.provider ?? sourceRecord.name ?? record.source) ?? 'source not recorded';
}

function stopConfidence(record: Record<string, unknown>): string | null {
  const score = finiteNumber(record.confidenceScore ?? record.confidence_score);
  if (score != null) return `${Math.max(0, Math.min(100, Math.round(score)))}%`;
  const raw = cleanText(record.confidence);
  return raw ? humanize(raw) : null;
}

function stopFromRecord(value: unknown, index: number): ExploreFamilyManifestStop | null {
  const record = objectRecord(value);
  const label = cleanText(record.title ?? record.label ?? record.name);
  const point = coordinate(
    record.coordinate ??
    record.location ??
    (record.latitude != null || record.longitude != null ? record : null),
  );
  if (!label && !point) return null;
  return {
    sequence: finiteNumber(record.sequence) ?? index + 1,
    label: label ?? 'Planned itinerary point',
    role: stopRole(record),
    coordinate: point,
    timing: stopTiming(record),
    source: stopSource(record),
    sourceState: stopSourceState(record),
    confidence: stopConfidence(record),
    notes: uniqueStrings(arrayValue(record.notes), 4),
  };
}

function isReferenceOnlyStop(value: unknown): boolean {
  const record = objectRecord(value);
  return record.guidanceRole === 'reference_only' || record.guidance_role === 'reference_only';
}

function dedupeStops(stops: ExploreFamilyManifestStop[]): ExploreFamilyManifestStop[] {
  const seen = new Set<string>();
  return stops
    .sort((left, right) => left.sequence - right.sequence)
    .filter((stop) => {
      const point = stop.coordinate
        ? `${stop.coordinate.latitude.toFixed(5)}:${stop.coordinate.longitude.toFixed(5)}`
        : '';
      const key = `${stop.role.toLowerCase()}:${stop.label.toLowerCase()}:${point}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((stop, index) => ({ ...stop, sequence: index + 1 }));
}

function endpointStop(
  label: string,
  role: string,
  point: ExploreTripManifestCoordinate | null,
  sequence: number,
  source: string,
): ExploreFamilyManifestStop | null {
  if (!point) return null;
  return {
    sequence,
    label,
    role,
    coordinate: point,
    timing: null,
    source,
    sourceState: 'saved plan',
    confidence: null,
    notes: [],
  };
}

function buildItineraryStops(
  route: Record<string, unknown>,
  tripPlan: Record<string, unknown>,
  itinerary: Record<string, unknown>,
  routeCoordinates: ExploreTripManifestCoordinate[],
): ExploreFamilyManifestStop[] {
  const routeWaypoints = arrayValue(route.waypoints);
  const canonicalStops = arrayValue(itinerary.stops);
  const planStops = arrayValue(tripPlan.suggestedStops);
  const selected = routeWaypoints.length > 0
    ? routeWaypoints
    : canonicalStops.length > 0
      ? canonicalStops
      : planStops.filter((stop) => !isReferenceOnlyStop(stop));
  const stops = selected
    .map(stopFromRecord)
    .filter((stop): stop is ExploreFamilyManifestStop => Boolean(stop));

  const userStart = coordinate(itinerary.userStart) ?? routeCoordinates[0] ?? null;
  const trailhead = coordinate(
    objectRecord(itinerary.trailheadStart).coordinate ??
    objectRecord(itinerary.trailheadStartCandidate).coordinate,
  );
  const trailEnd = coordinate(objectRecord(itinerary.trailEnd).coordinate) ??
    routeCoordinates[routeCoordinates.length - 1] ?? null;
  const hasRole = (pattern: RegExp) => stops.some((stop) => pattern.test(stop.role));
  const hasCoordinate = (point: ExploreTripManifestCoordinate | null) => Boolean(point && stops.some((stop) => (
    stop.coordinate &&
    Math.abs(stop.coordinate.latitude - point.latitude) <= 0.00001 &&
    Math.abs(stop.coordinate.longitude - point.longitude) <= 0.00001
  )));

  if (!hasRole(/origin|start/i) && !hasCoordinate(userStart)) {
    const origin = endpointStop('Trip origin', 'Starting point', userStart, 0, 'saved canonical route');
    if (origin) stops.unshift(origin);
  }
  if (trailhead && !hasRole(/trailhead|trail entry/i) && !hasCoordinate(trailhead)) {
    const index = Math.max(1, stops.findIndex((stop) => /destination|finish|route end/i.test(stop.role)));
    const entry = endpointStop('Trailhead', 'Trail entry', trailhead, index < 1 ? stops.length : index, 'saved itinerary');
    if (entry) stops.splice(index < 1 ? stops.length : index, 0, entry);
  }
  if (!hasRole(/destination|finish|route end/i) && !hasCoordinate(trailEnd)) {
    const destination = endpointStop('Route end', 'Trip destination', trailEnd, stops.length + 1, 'saved canonical route');
    if (destination) stops.push(destination);
  }
  return dedupeStops(stops);
}

function buildSupportPoints(input: ExploreTripManifestExportInput): ExploreFamilyManifestStop[] {
  const tripPlan = objectRecord(input.tripPlan);
  const referenceStops = arrayValue(tripPlan.suggestedStops).filter(isReferenceOnlyStop);
  const candidates = [
    ...referenceStops,
    ...arrayValue(input.emergencyPoints),
  ];
  return dedupeStops(
    candidates
      .map(stopFromRecord)
      .filter((stop): stop is ExploreFamilyManifestStop => Boolean(stop)),
  ).slice(0, 12);
}

function readinessSummary(readiness: Record<string, unknown>): { summary: string | null; concern: string | null } {
  const summary = readiness.summary;
  if (typeof summary === 'string') return { summary: cleanText(summary), concern: cleanText(readiness.topConcern) };
  const record = objectRecord(summary);
  return {
    summary: cleanText(record.decisionLabel ?? record.summary ?? record.headline),
    concern: cleanText(readiness.topConcern ?? record.concern),
  };
}

function buildReadiness(input: ExploreTripManifestExportInput) {
  const tripPlan = objectRecord(input.tripPlan);
  const readiness = objectRecord(input.readiness ?? tripPlan.readinessReference);
  const rawScore = finiteNumber(readiness.score);
  const summary = readinessSummary(readiness);
  return {
    score: rawScore == null ? null : Math.max(0, Math.min(100, Math.round(rawScore))),
    status: cleanText(readiness.status) ? humanize(readiness.status) : 'Unavailable',
    source: cleanText(readiness.source) ?? 'Source not recorded',
    updatedAt: cleanText(readiness.updatedAt),
    summary: summary.summary,
    concern: summary.concern,
  };
}

function buildVehicle(value: unknown) {
  const vehicle = objectRecord(value);
  const label = cleanText(vehicle.label ?? vehicle.name);
  const type = cleanText(vehicle.vehicleType ?? vehicle.type);
  const description = [label, type && type !== label ? humanize(type) : null].filter(Boolean).join(' - ') || null;
  return {
    description,
    source: cleanText(vehicle.source),
    confidence: cleanText(vehicle.confidence) ? humanize(vehicle.confidence) : null,
    updatedAt: cleanText(vehicle.updatedAt),
  };
}

function durationSummary(tripPlan: Record<string, unknown>): string | null {
  const estimate = objectRecord(tripPlan.estimate);
  const days = finiteNumber(estimate.tripDays);
  const hours = finiteNumber(estimate.driveTimeHours);
  const values: string[] = [];
  if (days != null) values.push(`${days.toFixed(days % 1 === 0 ? 0 : 1)} day estimate`);
  if (hours != null) values.push(`${hours.toFixed(1)} driving hr estimate`);
  return values.length > 0 ? values.join(' | ') : null;
}

function offlinePresentation(input: ExploreTripManifestExportInput) {
  const presentation = input.offlinePresentation;
  if (presentation) {
    return {
      status: humanize(presentation.kind),
      summary: presentation.summary,
      requiredReadyCount: presentation.requiredReadyCount,
      requiredCount: presentation.requiredCount,
      mapStatus: humanize(presentation.mapStatus),
      turnGuidanceStatus: humanize(presentation.turnGuidanceState),
      attention: presentation.attentionItems.map((item) => `${item.title}: ${item.message}`).slice(0, 8),
    };
  }
  const required = input.manifest.items.filter((item) => item.required);
  const ready = required.filter((item) => item.status === 'ready' || item.availability === 'already_cached');
  const map = input.manifest.items.find((item) => item.type === 'offline_map');
  const turns = input.manifest.items.find((item) => item.type === 'road_turn_guidance');
  return {
    status: humanize(input.manifest.progress.status),
    summary: `${ready.length}/${required.length} required offline assets are ready.`,
    requiredReadyCount: ready.length,
    requiredCount: required.length,
    mapStatus: humanize(map?.status ?? 'missing'),
    turnGuidanceStatus: humanize(turns?.status ?? 'not included'),
    attention: input.manifest.errors.map((error) => error.message).slice(0, 8),
  };
}

export function buildExploreFamilyEmergencyManifestPresentation(
  input: ExploreTripManifestExportInput,
): ExploreFamilyEmergencyManifestPresentation {
  const route = objectRecord(input.route);
  const tripPlan = objectRecord(input.tripPlan);
  const planRoute = objectRecord(tripPlan.route);
  const itinerary = objectRecord(input.itinerary);
  const routeCoordinates = (input.routeCoordinates ?? [])
    .map(coordinate)
    .filter((point): point is ExploreTripManifestCoordinate => Boolean(point));
  const distanceMiles = finiteNumber(
    planRoute.distanceMiles ?? route.distanceMiles ?? route.total_distance_miles ?? route.distance_mi,
  );
  const generatedAt = cleanText(input.generatedAt ?? input.manifest.generatedAt) ?? new Date(0).toISOString();
  return {
    documentTitle: cleanText(input.title) ?? `${input.manifest.routeName} Emergency Trip Manifest`,
    routeName: input.manifest.routeName,
    generatedAt,
    route: {
      distanceMiles,
      region: cleanText(planRoute.region ?? route.region),
      terrain: cleanText(planRoute.terrainType ?? route.terrainType),
      source: routeSource(route, tripPlan),
      warnings: routeWarnings(route, tripPlan, itinerary),
      coordinates: routeCoordinates,
    },
    trip: {
      departurePlan: cleanText(tripPlan.recommendedDeparture),
      estimatedDuration: durationSummary(tripPlan),
      groupType: cleanText(tripPlan.groupType) ? humanize(tripPlan.groupType) : null,
      expectedReturn: null,
      checkInPlan: null,
      trustedContact: null,
    },
    readiness: buildReadiness(input),
    vehicle: buildVehicle(input.vehicleProfile),
    itinerary: buildItineraryStops(route, tripPlan, itinerary, routeCoordinates),
    supportPoints: buildSupportPoints(input),
    emergencyNotes: uniqueStrings(arrayValue(input.emergencyNotes).length > 0
      ? arrayValue(input.emergencyNotes)
      : [input.emergencyNotes]),
    offline: offlinePresentation(input),
  };
}

function row(label: string, value: string | number | null | undefined, fallback = NOT_AVAILABLE): string {
  const display = value == null || value === '' ? fallback : String(value);
  const missing = display === NOT_PROVIDED || display === NOT_AVAILABLE;
  return `
    <div class="fact-row${missing ? ' missing' : ''}">
      <dt>${esc(label)}</dt>
      <dd>${esc(display)}</dd>
    </div>
  `;
}

function list(items: string[], empty: string): string {
  if (items.length === 0) return `<p class="missing-copy">${esc(empty)}</p>`;
  return `<ul>${items.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`;
}

function itineraryHtml(stops: ExploreFamilyManifestStop[]): string {
  if (stops.length === 0) {
    return `<p class="missing-copy">${esc('No ordered itinerary stops were saved. Use the route summary and verify the plan before sharing.')}</p>`;
  }
  return `<ol class="timeline">${stops.map((stop) => `
    <li>
      <div class="timeline-marker">${stop.sequence}</div>
      <div class="timeline-body">
        <div class="timeline-heading">
          <strong>${esc(stop.label)}</strong>
          <span>${esc(stop.role)}</span>
        </div>
        <div class="coordinate">${esc(coordinateLine(stop.coordinate))}</div>
        ${stop.timing ? `<div>${esc(stop.timing)}</div>` : ''}
        <div class="provenance">${esc(humanize(stop.source))} | ${esc(humanize(stop.sourceState))}${stop.confidence ? ` | Confidence ${esc(stop.confidence)}` : ''}</div>
        ${stop.notes.length > 0 ? `<div class="notes">${esc(stop.notes.join(' | '))}</div>` : ''}
      </div>
    </li>
  `).join('')}</ol>`;
}

function sampleRoute(points: ExploreTripManifestCoordinate[], maxPoints = 140): ExploreTripManifestCoordinate[] {
  if (points.length <= maxPoints) return points;
  const output: ExploreTripManifestCoordinate[] = [points[0]];
  const step = (points.length - 1) / (maxPoints - 1);
  for (let index = 1; index < maxPoints - 1; index += 1) {
    output.push(points[Math.round(index * step)]);
  }
  output.push(points[points.length - 1]);
  return output;
}

function routeOverviewHtml(
  points: ExploreTripManifestCoordinate[],
  stops: ExploreFamilyManifestStop[],
): string {
  if (points.length < 2) {
    return `<div class="map-unavailable">Planned route shape unavailable. The itinerary coordinates remain the authoritative search reference in this packet.</div>`;
  }
  const sampled = sampleRoute(points);
  const latitudes = sampled.map((point) => point.latitude);
  const longitudes = sampled.map((point) => point.longitude);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  if (maxLng - minLng > 180) {
    return `<div class="map-unavailable">Route crosses a longitude boundary that this print overview does not support. Use the itinerary coordinates and saved route file.</div>`;
  }
  const width = 720;
  const height = 155;
  const pad = 24;
  const latRange = Math.max(maxLat - minLat, 0.00001);
  const lngRange = Math.max(maxLng - minLng, 0.00001);
  const project = (point: ExploreTripManifestCoordinate) => ({
    x: pad + ((point.longitude - minLng) / lngRange) * (width - pad * 2),
    y: height - pad - ((point.latitude - minLat) / latRange) * (height - pad * 2),
  });
  const line = sampled.map((point) => {
    const projected = project(point);
    return `${projected.x.toFixed(1)},${projected.y.toFixed(1)}`;
  }).join(' ');
  const markerStops = stops.filter((stop) => stop.coordinate).slice(0, 10);
  return `
    <div class="route-overview">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Planned route shape with itinerary markers">
        <rect x="0" y="0" width="${width}" height="${height}" rx="12" fill="${C.soft}" />
        <polyline points="${line}" fill="none" stroke="${C.amber}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
        ${markerStops.map((stop) => {
          const projected = project(stop.coordinate as ExploreTripManifestCoordinate);
          return `<g><circle cx="${projected.x.toFixed(1)}" cy="${projected.y.toFixed(1)}" r="10" fill="#FFFFFF" stroke="${C.ink}" stroke-width="3" /><text x="${projected.x.toFixed(1)}" y="${(projected.y + 3.7).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="800" fill="${C.ink}">${stop.sequence}</text></g>`;
        }).join('')}
      </svg>
      <p>Planned route shape only - not a navigational map or live location. Numbered markers match the saved itinerary.</p>
    </div>
  `;
}

function supportPointsHtml(points: ExploreFamilyManifestStop[]): string {
  if (points.length === 0) return `<p class="missing-copy">No separate bailout, medical, repair, or reference points were saved with this pack.</p>`;
  return `<div class="support-grid">${points.map((point) => `
    <article class="support-card">
      <strong>${esc(point.label)}</strong>
      <span>${esc(point.role)}</span>
      <div class="coordinate">${esc(coordinateLine(point.coordinate))}</div>
      <small>${esc(humanize(point.source))}${point.confidence ? ` | ${esc(point.confidence)}` : ''}</small>
    </article>
  `).join('')}</div>`;
}

function buildCss(): string {
  return `
    * { box-sizing: border-box; }
    @page { size: Letter; margin: 0.52in 0.55in 0.62in; }
    html { color-scheme: light; }
    body {
      margin: 0;
      background: #FFFFFF;
      color: ${C.ink};
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10.5pt;
      line-height: 1.42;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    h1, h2, h3, p { margin-top: 0; }
    h1 { margin-bottom: 4px; font-size: 22pt; line-height: 1.08; }
    h2 {
      margin: 0 0 9px;
      color: ${C.ink};
      font-size: 13pt;
      line-height: 1.2;
      border-bottom: 2px solid ${C.border};
      padding-bottom: 5px;
    }
    .header { margin-bottom: 12px; border-bottom: 4px solid ${C.amber}; padding-bottom: 10px; }
    .eyebrow { color: ${C.amber}; font-size: 8.5pt; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; }
    .generated { color: ${C.muted}; font-size: 9pt; }
    .urgent {
      margin-bottom: 13px;
      border: 2px solid ${C.amber};
      border-radius: 8px;
      background: ${C.amberSoft};
      padding: 10px 12px;
      page-break-inside: avoid;
    }
    .urgent strong { display: block; margin-bottom: 3px; font-size: 11pt; }
    .section { margin: 0 0 15px; }
    .page-break-before { break-before: page; page-break-before: always; padding-top: 1px; }
    h2, h3 { break-after: avoid; page-break-after: avoid; }
    .fact-card, .readiness-card, .support-card, .timeline li, .route-overview, .offline-state, .completion-box, .limitations { break-inside: avoid; page-break-inside: avoid; }
    .overview-grid { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 10px; margin-bottom: 13px; }
    .fact-card, .readiness-card {
      border: 1px solid ${C.border};
      border-radius: 8px;
      padding: 10px 12px;
      background: #FFFFFF;
    }
    .readiness-card { background: ${C.greenSoft}; border-color: #93B99E; }
    .readiness-score { display: flex; align-items: baseline; gap: 7px; margin-bottom: 3px; }
    .readiness-score strong { color: ${C.green}; font-size: 27pt; line-height: 1; }
    .readiness-score span { font-weight: 800; font-size: 11pt; }
    .readiness-label { color: ${C.muted}; font-size: 8pt; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; }
    .readiness-note { margin: 7px 0 0; color: ${C.muted}; font-size: 9pt; }
    dl { margin: 0; }
    .fact-row { display: grid; grid-template-columns: 42% 58%; gap: 8px; border-bottom: 1px solid #E1E6E2; padding: 5px 0; }
    .fact-row:last-child { border-bottom: 0; }
    dt { color: ${C.muted}; font-weight: 700; }
    dd { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
    .missing dd, .missing-copy { color: ${C.red}; font-style: italic; }
    .route-overview { margin-bottom: 9px; }
    .route-overview svg { display: block; width: 100%; height: auto; border: 1px solid ${C.border}; border-radius: 8px; }
    .route-overview p, .map-unavailable { margin: 5px 0 0; color: ${C.muted}; font-size: 8.5pt; }
    .map-unavailable { border: 1px dashed ${C.border}; border-radius: 8px; padding: 12px; }
    .timeline { margin: 0; padding: 0; list-style: none; }
    .timeline li { display: grid; grid-template-columns: 28px 1fr; gap: 8px; margin-bottom: 8px; }
    .timeline-marker { width: 26px; height: 26px; border-radius: 50%; background: ${C.ink}; color: #FFFFFF; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 9pt; }
    .timeline-body { border: 1px solid ${C.border}; border-radius: 7px; padding: 8px 9px; }
    .timeline-heading { display: flex; justify-content: space-between; gap: 10px; }
    .timeline-heading span { color: ${C.amber}; font-size: 8.5pt; font-weight: 800; text-transform: uppercase; }
    .coordinate { margin-top: 3px; font-family: Consolas, 'Courier New', monospace; font-size: 9pt; }
    .provenance, .notes, small { margin-top: 3px; color: ${C.muted}; font-size: 8.5pt; overflow-wrap: anywhere; }
    .support-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
    .support-card { border: 1px solid ${C.border}; border-radius: 7px; padding: 8px; }
    .support-card > span { display: block; color: ${C.amber}; font-size: 8.5pt; font-weight: 800; text-transform: uppercase; }
    ul { margin: 5px 0 0; padding-left: 19px; }
    li { margin-bottom: 4px; }
    .offline-state { border-left: 5px solid ${C.amber}; background: ${C.soft}; padding: 9px 11px; margin-bottom: 8px; }
    .offline-state strong { display: block; }
    .warning-list { color: ${C.red}; }
    .completion-box { border: 2px dashed ${C.border}; border-radius: 8px; padding: 10px 12px; }
    .completion-box p { margin-bottom: 7px; }
    .write-line { height: 25px; border-bottom: 1px solid ${C.ink}; margin-bottom: 8px; color: ${C.muted}; font-size: 8.5pt; }
    .limitations { background: ${C.soft}; border: 1px solid ${C.border}; border-radius: 8px; padding: 10px 12px; font-size: 9pt; }
    footer { margin-top: 12px; border-top: 1px solid ${C.border}; padding-top: 6px; color: ${C.muted}; font-size: 8pt; display: flex; justify-content: space-between; gap: 12px; }
    @media print { a { color: inherit; text-decoration: none; } }
  `;
}

export function buildExploreTripManifestHtml(input: ExploreTripManifestExportInput): string {
  const packet = buildExploreFamilyEmergencyManifestPresentation(input);
  const readinessScore = packet.readiness.score == null ? 'N/A' : `${packet.readiness.score}`;
  const routeDistance = packet.route.distanceMiles == null ? null : `${packet.route.distanceMiles.toFixed(1)} mi`;
  return `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${esc(packet.documentTitle)} - ECS Family Emergency Trip Manifest</title>
        <style>${buildCss()}</style>
      </head>
      <body>
        <header class="header">
          <div class="eyebrow">ECS Family Emergency Trip Manifest</div>
          <h1>${esc(packet.routeName)}</h1>
          <div class="generated">Point-in-time plan generated ${esc(formatDateTime(packet.generatedAt))}</div>
        </header>

        <section class="urgent" aria-label="Emergency use notice">
          <strong>For family, trusted contacts, and responding authorities</strong>
          This packet records the traveler's saved plan. It is not live tracking, not a distress signal, and is not automatically sent to emergency services. If the traveler is overdue or unreachable, record the last confirmed contact and location, then provide this packet to emergency services or local authorities. Do not delay contacting emergency services when immediate danger is suspected.
        </section>

        <section class="overview-grid" aria-label="Trip and readiness summary">
          <div class="fact-card">
            <h2>Trip at a glance</h2>
            <dl>
              ${row('Planned route', packet.routeName)}
              ${row('Route distance', routeDistance)}
              ${row('Region', packet.route.region)}
              ${row('Departure plan / recommendation', packet.trip.departurePlan ? formatDateTime(packet.trip.departurePlan) : null, NOT_PROVIDED)}
              ${row('Estimated duration', packet.trip.estimatedDuration, NOT_PROVIDED)}
              ${row('Expected return / overdue time', packet.trip.expectedReturn, NOT_PROVIDED)}
              ${row('Party type', packet.trip.groupType, NOT_PROVIDED)}
            </dl>
          </div>
          <div class="readiness-card">
            <div class="readiness-label">Saved route-readiness snapshot</div>
            <div class="readiness-score"><strong>${esc(readinessScore)}</strong><span>${esc(packet.readiness.status)}</span></div>
            ${packet.readiness.summary ? `<p>${esc(packet.readiness.summary)}</p>` : ''}
            ${packet.readiness.concern ? `<p><strong>Primary concern:</strong> ${esc(packet.readiness.concern)}</p>` : ''}
            <dl>
              ${row('Source', humanize(packet.readiness.source))}
              ${row('Assessed', packet.readiness.updatedAt ? formatDateTime(packet.readiness.updatedAt) : null)}
            </dl>
            <p class="readiness-note">This is route readiness from saved ECS inputs, not a guarantee of safe departure and not the offline download percentage.</p>
          </div>
        </section>

        <section class="section">
          <h2>Planned route overview</h2>
          ${routeOverviewHtml(packet.route.coordinates, packet.itinerary)}
          <dl>
            ${row('Route source', humanize(packet.route.source))}
            ${row('Terrain', packet.route.terrain)}
            ${row('Vehicle description', packet.vehicle.description, NOT_PROVIDED)}
            ${row('Vehicle source / confidence', [packet.vehicle.source ? humanize(packet.vehicle.source) : null, packet.vehicle.confidence].filter(Boolean).join(' | ') || null, NOT_PROVIDED)}
          </dl>
        </section>

        <section class="section">
          <h2>Saved itinerary and search reference</h2>
          <p>Coordinates below are planned locations from the saved route. They are not a live GPS position. Provide the ordered list and saved route file to responders.</p>
          ${itineraryHtml(packet.itinerary)}
        </section>

        <section class="section">
          <h2>Emergency contacts and overdue plan</h2>
          <dl>
            ${row('Trusted contact for this trip', packet.trip.trustedContact, NOT_PROVIDED)}
            ${row('Expected check-in plan', packet.trip.checkInPlan, NOT_PROVIDED)}
            ${row('Expected return / overdue threshold', packet.trip.expectedReturn, NOT_PROVIDED)}
          </dl>
          <div class="completion-box">
            <p><strong>Complete before sharing if these details are not saved in ECS.</strong> Printed copies can be completed by hand.</p>
            <div class="write-line">Traveler name and mobile / satellite contact</div>
            <div class="write-line">Trusted contact and phone</div>
            <div class="write-line">Expected return and overdue threshold</div>
            <div class="write-line">Check-in cadence and escalation instructions</div>
          </div>
          <h3>Saved emergency notes</h3>
          ${list(packet.emergencyNotes, 'No trip-linked emergency notes were provided.')}
        </section>

        <section class="section page-break-before">
          <h2>Saved support and reference points</h2>
          <p>These points are references only unless the ordered itinerary says otherwise. Availability, legal access, and current conditions are not inferred.</p>
          ${supportPointsHtml(packet.supportPoints)}
        </section>

        <section class="section">
          <h2>Offline navigation status</h2>
          <div class="offline-state">
            <strong>${esc(packet.offline.status)} - ${esc(packet.offline.requiredReadyCount)}/${esc(packet.offline.requiredCount)} required assets ready</strong>
            ${esc(packet.offline.summary)}
          </div>
          <dl>
            ${row('Offline map', packet.offline.mapStatus)}
            ${row('Turn guidance', packet.offline.turnGuidanceStatus)}
            ${row('Offline package generated', formatDateTime(input.manifest.generatedAt))}
          </dl>
          ${packet.offline.attention.length > 0 ? `<div class="warning-list"><strong>Items needing review</strong>${list(packet.offline.attention, '')}</div>` : ''}
        </section>

        <section class="section">
          <h2>Known route warnings</h2>
          ${list(packet.route.warnings, 'No route warnings were attached to the saved plan. This does not prove that no hazards, closures, access restrictions, or weather risks exist.')}
        </section>

        <section class="limitations">
          <h2>Privacy and limitations</h2>
          <ul>
            <li>This document contains sensitive planned locations. Share it only with trusted recipients and responding authorities.</li>
            <li>It is a point-in-time plan and may become stale after export.</li>
            <li>It is not live tracking, not a distress signal, and is not automatically transmitted.</li>
            <li>Missing contacts, return times, check-ins, and conditions remain missing; ECS has not invented them.</li>
            <li>Verify official closures, weather, land-use rules, access, route conditions, and emergency guidance independently when safety-critical.</li>
          </ul>
        </section>

        <footer>
          <span>ECS Family Emergency Trip Manifest | Private emergency-planning document</span>
          <span>Generated ${esc(formatDateTime(packet.generatedAt))}</span>
        </footer>
      </body>
    </html>`;
}

function safeFileName(title: string, generatedAt: string | null | undefined): string {
  const cleaned = title.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);
  const timestamp = generatedAt && Number.isFinite(Date.parse(generatedAt))
    ? new Date(generatedAt)
    : new Date();
  return `ECS_Family_Emergency_Trip_Manifest_${cleaned || 'Trip'}_${timestamp.toISOString().slice(0, 10)}`;
}

export async function exportExploreTripManifestPdf(
  input: ExploreTripManifestExportInput,
): Promise<ExploreTripManifestExportResult> {
  try {
    const html = buildExploreTripManifestHtml(input);
    const fileName = safeFileName(input.title || input.manifest.routeName, input.generatedAt ?? input.manifest.generatedAt);
    if (Platform.OS === 'web') return await exportWeb(html, fileName);
    return await exportNative(html, fileName);
  } catch (error: any) {
    return { success: false, error: error?.message ?? 'Family emergency manifest export failed.' };
  }
}

async function exportNative(html: string, fileName: string): Promise<ExploreTripManifestExportResult> {
  try {
    const Print = await import('expo-print');
    const Sharing = await import('expo-sharing');
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    const sharingAvailable = await Sharing.isAvailableAsync();
    if (!sharingAvailable) {
      await Print.printAsync({ html });
      return { success: true, output: 'print_dialog' };
    }
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `${fileName}.pdf`,
      UTI: 'com.adobe.pdf',
    });
    return { success: true, output: 'shared_pdf' };
  } catch (error: any) {
    try {
      const Print = await import('expo-print');
      await Print.printAsync({ html });
      return { success: true, output: 'print_dialog' };
    } catch {
      return { success: false, error: error?.message ?? 'Native family manifest export failed.' };
    }
  }
}

async function exportWeb(html: string, fileName: string): Promise<ExploreTripManifestExportResult> {
  try {
    try {
      const Print = await import('expo-print');
      await Print.printAsync({ html });
      return { success: true, output: 'print_dialog' };
    } catch {
      // Browser fallback below.
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) return downloadHtmlAsFile(html, fileName);
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => {
      setTimeout(() => {
        try { printWindow.print(); } catch {}
      }, 300);
    };
    setTimeout(() => {
      try { printWindow.print(); } catch {}
    }, 600);
    return { success: true, output: 'print_dialog' };
  } catch (error: any) {
    return { success: false, error: error?.message ?? 'Web family manifest export failed.' };
  }
}

function downloadHtmlAsFile(html: string, fileName: string): ExploreTripManifestExportResult {
  try {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${fileName}.html`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    return { success: true, output: 'downloaded_html' };
  } catch {
    return { success: false, error: 'Could not download the family emergency manifest.' };
  }
}
