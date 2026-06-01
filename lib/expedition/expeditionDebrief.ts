import { buildDocumentPayload, exportDocumentPdf, type ExportResult } from '../documentPdfExport';
import {
  expeditionStateStore,
  formatDistance,
  formatDuration,
  type ExpeditionLogEntry,
  type ExpeditionRecord,
  type TimelineEvent,
} from '../expeditionStateStore';
import { routeStore, type ImportedRoute, type RouteWaypoint } from '../routeStore';
import { computeRunHealth, runStore, type ECSRun } from '../runStore';
import { briefCadLogStore } from '../briefCadLogStore';
import { incidentRecoveryWorkflowStore } from '../incidentRecoveryWorkflowStore';

export type ExpeditionDebriefSection = {
  title: string;
  items: string[];
};

export type ExpeditionDebrief = {
  id: string;
  title: string;
  expeditionName: string;
  routeName: string;
  generatedAt: string;
  overview: string[];
  keyPoints: string[];
  intelligence: {
    whatWorked: string[];
    couldImprove: string[];
    possibleIssues: string[];
    recommendations: string[];
  };
  dataNotes: string[];
  sections: ExpeditionDebriefSection[];
};

type BuildExpeditionDebriefInput = {
  completedRecord?: ExpeditionRecord | null;
  routeLabel?: string | null;
  expeditionId?: string | null;
};

type CompletedExpeditionSource = {
  id: string;
  vehicleName?: string | null;
  expeditionName?: string | null;
  destination?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  duration?: number | null;
  distance?: number | null;
  fuelDelta?: number | null;
  waterDelta?: number | null;
  peakRemoteness?: number | null;
  source: 'current_record' | 'completed_log';
};

function compactText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 0 ? normalized : null;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  values.forEach((value) => {
    const normalized = compactText(value);
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    output.push(normalized);
  });
  return output;
}

function formatDateTime(value?: string | null): string | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return new Date(value).toLocaleString();
}

function formatMeters(value?: number | null): string | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? formatDistance(value)
    : null;
}

function formatSeconds(value?: number | null): string | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? formatDuration(value)
    : null;
}

function sourceFromLog(entry: ExpeditionLogEntry): CompletedExpeditionSource {
  return {
    id: entry.id,
    vehicleName: entry.vehicleName,
    startTime: entry.startTime,
    endTime: entry.endTime,
    duration: entry.duration,
    distance: entry.distance,
    fuelDelta: entry.fuelDelta,
    waterDelta: entry.waterDelta,
    peakRemoteness: entry.peakRemoteness,
    source: 'completed_log',
  };
}

function resolveCompletedSource(input: BuildExpeditionDebriefInput): CompletedExpeditionSource | null {
  if (input.completedRecord?.state === 'complete') {
    return {
      id: input.completedRecord.id,
      vehicleName: input.completedRecord.vehicleName,
      expeditionName: input.completedRecord.expeditionName,
      destination: input.completedRecord.destination,
      startTime: input.completedRecord.startTime,
      endTime: input.completedRecord.endTime,
      duration: input.completedRecord.duration,
      distance: input.completedRecord.distance,
      fuelDelta: input.completedRecord.fuelDelta,
      waterDelta: input.completedRecord.waterDelta,
      peakRemoteness: input.completedRecord.peakRemoteness,
      source: 'current_record',
    };
  }

  const current = expeditionStateStore.getCurrentExpedition();
  if (current?.state === 'complete') {
    return resolveCompletedSource({ completedRecord: current });
  }

  const targetId = compactText(input.expeditionId);
  const log = expeditionStateStore.getLog();
  const matchedLog = targetId ? log.find((entry) => entry.id === targetId) : null;
  const latestLog = matchedLog ?? log[0] ?? null;
  return latestLog ? sourceFromLog(latestLog) : null;
}

function waypointLabel(waypoint: RouteWaypoint, fallbackIndex: number): string {
  const name = compactText(waypoint.name) ?? `Waypoint ${fallbackIndex + 1}`;
  const type = waypoint.waypointType ? ` (${waypoint.waypointType})` : '';
  return `${name}${type}`;
}

function collectWaypointHighlights(route: ImportedRoute | null, run: ECSRun | null): {
  waypoints: string[];
  camps: string[];
  stops: string[];
} {
  const sourceWaypoints = route?.waypoints?.length ? route.waypoints : run?.waypoints ?? [];
  const waypoints = sourceWaypoints.slice(0, 8).map(waypointLabel);
  const camps = sourceWaypoints
    .filter((waypoint) => waypoint.waypointType === 'camp' || compactText(waypoint.name)?.toLowerCase().includes('camp'))
    .slice(0, 5)
    .map(waypointLabel);
  const stops = sourceWaypoints
    .filter((waypoint) => waypoint.waypointType && waypoint.waypointType !== 'camp')
    .slice(0, 6)
    .map(waypointLabel);
  return { waypoints, camps, stops };
}

function collectTimelineHighlights(timeline: TimelineEvent[]): string[] {
  return timeline
    .filter((event) => event.eventType !== 'tracking_update')
    .slice(-8)
    .map((event) => {
      const when = formatDateTime(event.occurredAt);
      const label = event.eventType.replace(/_/g, ' ');
      const detail = compactText(event.eventData?.summary) ?? compactText(event.eventData?.note);
      return [when, label, detail].filter(Boolean).join(' - ');
    });
}

function collectIncidentHighlights(expeditionId: string): string[] {
  return incidentRecoveryWorkflowStore
    .getSnapshot()
    .filter((incident) => compactText((incident as any).expeditionId) === expeditionId)
    .slice(0, 5)
    .map((incident) => {
      const title = compactText((incident as any).summary) ?? compactText((incident as any).type) ?? 'Incident recorded';
      const status = compactText((incident as any).status);
      const severity = compactText((incident as any).severity);
      return [title, status ? `status ${status}` : null, severity ? `severity ${severity}` : null].filter(Boolean).join(' - ');
    });
}

function collectBriefHighlights(): string[] {
  return briefCadLogStore
    .getEntries()
    .slice(-8)
    .map((entry) => compactText(entry.message))
    .filter((entry): entry is string => Boolean(entry));
}

function inferRouteName(source: CompletedExpeditionSource, route: ImportedRoute | null, run: ECSRun | null, routeLabel?: string | null): string {
  return (
    compactText(routeLabel) ??
    compactText(route?.name) ??
    compactText(run?.title) ??
    compactText(source.destination) ??
    'Completed Route'
  );
}

function inferExpeditionName(source: CompletedExpeditionSource, routeName: string): string {
  return compactText(source.expeditionName) ?? `${routeName} Debrief`;
}

function buildIntelligenceNotes(args: {
  source: CompletedExpeditionSource;
  route: ImportedRoute | null;
  run: ECSRun | null;
  waypoints: string[];
  camps: string[];
  incidents: string[];
  briefHighlights: string[];
}): ExpeditionDebrief['intelligence'] {
  const health = args.run ? computeRunHealth(args.run) : null;
  const hasDistance = typeof args.source.distance === 'number' && args.source.distance > 0;
  const hasDuration = typeof args.source.duration === 'number' && args.source.duration > 0;
  const hasWaypointPlan = args.waypoints.length > 0;
  const hasResourceDelta = args.source.fuelDelta != null || args.source.waterDelta != null;

  const whatWorked = uniqueStrings([
    hasDuration ? 'The route has a completed start/end window, so the debrief can anchor timing reliably.' : null,
    hasDistance ? 'Distance was captured for the completed expedition.' : null,
    hasWaypointPlan ? 'Waypoint context was available for the route review.' : null,
    args.camps.length > 0 ? 'Camp or overnight stops were present in the route data.' : null,
    !args.incidents.length ? 'No expedition-linked incident records were found in the local incident workflow.' : null,
  ]);

  const couldImprove = uniqueStrings([
    !hasDistance ? 'Capture completed route distance before export so mileage is not omitted.' : null,
    !hasDuration ? 'Capture reliable start and end times for cleaner duration reporting.' : null,
    !hasWaypointPlan ? 'Add major waypoints, stops, and campsites to make future debriefs more useful.' : null,
    !hasResourceDelta ? 'Add fuel, water, or power readings at start/end for better resource learning.' : null,
    !args.briefHighlights.length ? 'Keep ECS Brief/Dispatch notes active during the route to improve issue recall.' : null,
  ]);

  const possibleIssues = uniqueStrings([
    ...(health?.warnings ?? []),
    args.incidents.length > 0 ? `${args.incidents.length} incident or recovery record(s) were linked to this expedition.` : null,
    args.source.peakRemoteness != null && args.source.peakRemoteness >= 70
      ? 'Peak remoteness was elevated; offline readiness and comms planning deserve review.'
      : null,
    args.source.fuelDelta != null && args.source.fuelDelta > 0
      ? `Fuel decreased by ${args.source.fuelDelta.toFixed(1)} gal during the expedition.`
      : null,
  ]);

  const recommendations = uniqueStrings([
    'Keep this debrief with the route record before editing or replacing the active route.',
    hasWaypointPlan ? 'Mark any missed stops or useful bailout points as waypoints before the next run.' : null,
    args.camps.length > 0 ? 'Review campsite notes while the route is fresh and update any access or resource details.' : null,
    health?.overall === 'red' ? 'Resolve range, roof, or hitch warnings before repeating this route.' : null,
    possibleIssues.length > 0 ? 'Review the issue list and convert real fixes into prep checklist items.' : null,
    'Verify legal access, closures, and weather again before reusing this debrief for a future expedition.',
  ]);

  return {
    whatWorked: whatWorked.length ? whatWorked : ['Completed expedition data was available and preserved for review.'],
    couldImprove: couldImprove.length ? couldImprove : ['No major data gaps were detected in the locally available summary data.'],
    possibleIssues: possibleIssues.length ? possibleIssues : ['No supported incident, range, or resource issues were found in local data.'],
    recommendations,
  };
}

export function buildCompletedExpeditionDebrief(input: BuildExpeditionDebriefInput = {}): ExpeditionDebrief | null {
  const source = resolveCompletedSource(input);
  if (!source) return null;

  const activeRoute = routeStore.getActive();
  const activeRun = runStore.getActive();
  const routeName = inferRouteName(source, activeRoute, activeRun, input.routeLabel);
  const expeditionName = inferExpeditionName(source, routeName);
  const timeline = expeditionStateStore.getTimeline(source.id);
  const waypointHighlights = collectWaypointHighlights(activeRoute, activeRun);
  const incidentHighlights = collectIncidentHighlights(source.id);
  const briefHighlights = collectBriefHighlights();
  const intelligence = buildIntelligenceNotes({
    source,
    route: activeRoute,
    run: activeRun,
    waypoints: waypointHighlights.waypoints,
    camps: waypointHighlights.camps,
    incidents: incidentHighlights,
    briefHighlights,
  });

  const overview = uniqueStrings([
    `Expedition: ${expeditionName}`,
    `Route: ${routeName}`,
    source.vehicleName ? `Vehicle: ${source.vehicleName}` : null,
    source.startTime ? `Started: ${formatDateTime(source.startTime)}` : null,
    source.endTime ? `Completed: ${formatDateTime(source.endTime)}` : null,
    source.duration ? `Duration: ${formatSeconds(source.duration)}` : null,
    source.distance ? `Distance: ${formatMeters(source.distance)}` : null,
    source.peakRemoteness != null ? `Peak remoteness: ${Math.round(source.peakRemoteness)}` : null,
  ]);

  const sections: ExpeditionDebriefSection[] = [
    { title: 'Major Waypoints', items: waypointHighlights.waypoints.length ? waypointHighlights.waypoints : ['No major waypoints were available.'] },
    { title: 'Stops and Campsites', items: uniqueStrings([...waypointHighlights.camps, ...waypointHighlights.stops]).length ? uniqueStrings([...waypointHighlights.camps, ...waypointHighlights.stops]) : ['No stops or campsites were available in route data.'] },
    { title: 'Timeline Highlights', items: collectTimelineHighlights(timeline).length ? collectTimelineHighlights(timeline) : ['No non-tracking timeline highlights were available.'] },
    { title: 'Incidents, Alerts, and Issues', items: uniqueStrings([...incidentHighlights, ...briefHighlights.slice(-5)]).length ? uniqueStrings([...incidentHighlights, ...briefHighlights.slice(-5)]) : ['No supported incident or alert notes were found.'] },
  ];

  const dataNotes = uniqueStrings([
    source.source === 'completed_log'
      ? 'This debrief was built from the preserved completed expedition log. Some rich expedition fields may no longer be available after dismissing the completion sheet.'
      : 'This debrief was built from the completed expedition record and local ECS context.',
    activeRoute ? 'Active route context was included as supporting route data.' : 'No active route detail was available at export time.',
    activeRun ? 'ECS run detail was included as supporting route data.' : null,
  ]);

  return {
    id: source.id,
    title: `${expeditionName} - Expedition Debrief`,
    expeditionName,
    routeName,
    generatedAt: new Date().toISOString(),
    overview,
    keyPoints: uniqueStrings([
      source.distance ? `Completed distance: ${formatMeters(source.distance)}` : null,
      source.duration ? `Completed duration: ${formatSeconds(source.duration)}` : null,
      waypointHighlights.camps.length ? `${waypointHighlights.camps.length} camp-related waypoint(s) found.` : null,
      incidentHighlights.length ? `${incidentHighlights.length} incident/recovery record(s) linked.` : null,
    ]),
    intelligence,
    dataNotes,
    sections,
  };
}

export function renderExpeditionDebriefText(debrief: ExpeditionDebrief): string {
  const lines: string[] = [];
  const pushList = (title: string, items: string[]) => {
    lines.push('');
    lines.push(title.toUpperCase());
    items.forEach((item) => lines.push(`- ${item}`));
  };

  lines.push(debrief.title);
  lines.push(`Generated: ${formatDateTime(debrief.generatedAt) ?? debrief.generatedAt}`);
  pushList('Route Overview', debrief.overview);
  pushList('Key Points', debrief.keyPoints.length ? debrief.keyPoints : ['No additional key points were available.']);
  debrief.sections.forEach((section) => pushList(section.title, section.items));
  pushList('ECS Intelligence - What Worked', debrief.intelligence.whatWorked);
  pushList('ECS Intelligence - Could Improve', debrief.intelligence.couldImprove);
  pushList('Possible Issues / Likely Causes', debrief.intelligence.possibleIssues);
  pushList('Next Expedition Recommendations', debrief.intelligence.recommendations);
  pushList('Data Notes', debrief.dataNotes);
  lines.push('');
  lines.push('This debrief is generated from available ECS route and expedition data. It does not invent unsupported incidents, campsites, closures, or failures.');
  return lines.join('\n');
}

export async function exportExpeditionDebriefPdf(debrief: ExpeditionDebrief): Promise<ExportResult> {
  const payload = buildDocumentPayload(
    `expedition-debrief-${debrief.id}`,
    debrief.title,
    renderExpeditionDebriefText(debrief),
    'operational',
  );
  return exportDocumentPdf(payload);
}
