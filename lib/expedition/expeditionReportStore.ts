import { createMigratingNonSecureStorage } from '../nonSecureStorage';
import {
  fsDelete,
  fsEnsureDir,
  fsGetInfo,
  fsReadString,
  fsWriteString,
  getDocumentDirectory,
} from '../fsCompat';
import { getBadgesForTrip } from './expeditionBadgeStore';
import { expeditionTripRecordStore } from './expeditionTripRecordStore';
import { generateExpeditionRecap } from './expeditionRecapEngine';
import {
  buildExpeditionReportStory,
  normalizeExpeditionReportStory,
  type ExpeditionReportStory,
  type ExpeditionReportStoryTimelineEvent,
} from './expeditionReportStory';
import { collectExpeditionReportTrackedEvents } from './expeditionReportTrackedEvents';
import { stableLifecycleHash } from '../lifecycle/routeTripExpeditionLifecycle';
import type {
  ExpeditionBadge,
  ExpeditionRecapNotableMoment,
  ExpeditionReport,
  ExpeditionReportExportFormat,
  ExpeditionTripBounds,
} from './expeditionTripRecordTypes';

const STORAGE_KEY = 'ecs_expedition_reports_v1';
const STORAGE_VERSION = 3;
const REPORT_DIRECTORY = 'expedition-reports/';
const reportStorage = createMigratingNonSecureStorage('ecs_expedition_reports', {
  logTag: 'ExpeditionReportStore',
});

type PersistedExpeditionReports = {
  version: number;
  reports: ExpeditionReport[];
};

type BrowserDownloadAnchor = {
  href: string;
  download: string;
  rel: string;
  click?: () => void;
  remove?: () => void;
};

type BrowserDownloadDocument = {
  body?: {
    appendChild?: (element: BrowserDownloadAnchor) => void;
  };
  createElement?: (tagName: 'a') => BrowserDownloadAnchor;
};

export type ExpeditionReportShareResult = {
  ok: boolean;
  report: ExpeditionReport | null;
  message: string;
  unavailableReason?: string;
};

let hydratedSnapshot: PersistedExpeditionReports | null = null;
let hydrationPromise: Promise<PersistedExpeditionReports> | null = null;
const reportGenerationFlights = new Map<string, Promise<ExpeditionReport | null>>();

function nowISO(): string {
  return new Date().toISOString();
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function finiteNumberOrNull(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeBounds(value: unknown): ExpeditionTripBounds | null {
  const input = value as Partial<ExpeditionTripBounds> | null | undefined;
  const north = Number(input?.north);
  const south = Number(input?.south);
  const east = Number(input?.east);
  const west = Number(input?.west);
  if (
    Number.isFinite(north) &&
    Number.isFinite(south) &&
    Number.isFinite(east) &&
    Number.isFinite(west)
  ) {
    return { north, south, east, west };
  }
  return null;
}

function normalizeReportExportFormat(value: unknown): ExpeditionReportExportFormat {
  return value === 'pdf' || value === 'html' || value === 'text' ? value : 'html';
}

function normalizeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function normalizeReport(raw: unknown): ExpeditionReport | null {
  const input = raw as Partial<ExpeditionReport> | null | undefined;
  const id = nullableString(input?.id);
  const tripId = nullableString(input?.tripId);
  if (!id || !tripId) return null;
  const generatedAt = nullableString(input?.generatedAt) ?? nowISO();

  return {
    id,
    tripId,
    sourceFingerprint: nullableString(input?.sourceFingerprint) ?? `legacy:${tripId}`,
    privacyMode: 'redacted',
    generatedAt,
    title: nullableString(input?.title) ?? 'Expedition Report',
    completedAt: nullableString(input?.completedAt),
    totalDistanceMiles: finiteNumberOrNull(input?.totalDistanceMiles),
    totalDurationSeconds: finiteNumberOrNull(input?.totalDurationSeconds),
    maxElevationFt: finiteNumberOrNull(input?.maxElevationFt),
    elevationGainFt: finiteNumberOrNull(input?.elevationGainFt),
    recapHeadline: nullableString(input?.recapHeadline),
    recapSummary: nullableString(input?.recapSummary),
    story: normalizeExpeditionReportStory(input?.story),
    notableMoments: normalizeArray<ExpeditionRecapNotableMoment>(input?.notableMoments),
    badgesEarned: normalizeArray<ExpeditionBadge>(input?.badgesEarned).filter((badge) => !!badge.unlockedAt),
    routeBounds: normalizeBounds(input?.routeBounds),
    routeGeometryReference: nullableString(input?.routeGeometryReference),
    mapSnapshotUri: nullableString(input?.mapSnapshotUri),
    exportFormat: normalizeReportExportFormat(input?.exportFormat),
    localUri: nullableString(input?.localUri),
    createdAt: nullableString(input?.createdAt) ?? generatedAt,
  };
}

async function loadSnapshot(): Promise<PersistedExpeditionReports> {
  if (hydratedSnapshot) return hydratedSnapshot;
  if (hydrationPromise) return hydrationPromise;

  hydrationPromise = (async () => {
    const raw = await reportStorage.read(STORAGE_KEY);
    if (!raw) {
      hydratedSnapshot = { version: STORAGE_VERSION, reports: [] };
      return hydratedSnapshot;
    }

    try {
      const parsed = JSON.parse(raw) as PersistedExpeditionReports;
      const reports = Array.isArray(parsed.reports)
        ? parsed.reports
            .map(normalizeReport)
            .filter((report): report is ExpeditionReport => !!report)
        : [];
      hydratedSnapshot = { version: STORAGE_VERSION, reports };
      return hydratedSnapshot;
    } catch {
      hydratedSnapshot = { version: STORAGE_VERSION, reports: [] };
      return hydratedSnapshot;
    }
  })().finally(() => {
    hydrationPromise = null;
  });

  return hydrationPromise;
}

async function saveSnapshot(snapshot: PersistedExpeditionReports): Promise<void> {
  hydratedSnapshot = snapshot;
  await reportStorage.write(STORAGE_KEY, JSON.stringify(snapshot));
}

function upsertReport(snapshot: PersistedExpeditionReports, report: ExpeditionReport): PersistedExpeditionReports {
  const normalized = normalizeReport(report) ?? report;
  return {
    version: STORAGE_VERSION,
    reports: [
      normalized,
      ...snapshot.reports.filter((item) => item.id !== normalized.id && item.tripId !== normalized.tripId),
    ].sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime()),
  };
}

function safeFilePart(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
    .toLowerCase() || 'expedition-report';
}

function getReportFileExtension(format: ExpeditionReportExportFormat): string {
  if (format === 'pdf') return 'pdf';
  if (format === 'text') return 'txt';
  return 'html';
}

function getReportMimeType(format: ExpeditionReportExportFormat): string {
  if (format === 'pdf') return 'application/pdf';
  if (format === 'text') return 'text/plain';
  return 'text/html';
}

function getReportDownloadFileName(report: ExpeditionReport): string {
  const generatedDate = nullableString(report.generatedAt)?.slice(0, 10) ?? nowISO().slice(0, 10);
  return `${safeFilePart(report.title)}-${generatedDate}.${getReportFileExtension(report.exportFormat)}`;
}

function getBrowserDownloadDocument(): BrowserDownloadDocument | null {
  const documentRef = (globalThis as { document?: BrowserDownloadDocument }).document;
  return typeof documentRef?.createElement === 'function' ? documentRef : null;
}

function buildReportDownloadHref(report: ExpeditionReport, fileBody: string): string {
  const mimeType = getReportMimeType(report.exportFormat);
  if (report.exportFormat === 'pdf') {
    return `data:${mimeType};base64,${fileBody}`;
  }
  return `data:${mimeType};charset=utf-8,${encodeURIComponent(fileBody)}`;
}

async function triggerBrowserReportDownload(report: ExpeditionReport): Promise<boolean> {
  if (!report.localUri) return false;
  const documentRef = getBrowserDownloadDocument();
  if (!documentRef?.createElement) return false;

  const fileBody = await fsReadString(report.localUri, report.exportFormat === 'pdf' ? 'base64' : 'utf8');
  if (!fileBody) return false;

  const anchor = documentRef.createElement('a');
  anchor.href = buildReportDownloadHref(report, fileBody);
  anchor.download = getReportDownloadFileName(report);
  anchor.rel = 'noopener';
  documentRef.body?.appendChild?.(anchor);
  if (typeof anchor.click !== 'function') return false;
  anchor.click();
  anchor.remove?.();
  return true;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value: string | null): string {
  if (!value) return 'Date unavailable';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Date unavailable';
  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDistance(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return 'Unavailable';
  if (value > 0 && value < 10) return `${value.toFixed(1)} mi`;
  return `${Math.round(value).toLocaleString()} mi`;
}

function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return 'Unavailable';
  const hours = seconds / 3600;
  if (hours < 1) return `${Math.max(1, Math.round(seconds / 60))} min`;
  if (hours < 10) return `${Math.round(hours * 10) / 10} hrs`;
  return `${Math.round(hours).toLocaleString()} hrs`;
}

function formatElevation(value: number | null): string {
  return value == null || !Number.isFinite(value) ? 'Unavailable' : `${Math.round(value).toLocaleString()} ft`;
}

function formatElapsed(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null;
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

function buildLegacyExpeditionReportHtml(report: ExpeditionReport): string {
  const notableMoments = report.notableMoments.slice(0, 6);
  const badgesEarned = report.badgesEarned.filter((badge) => !!badge.unlockedAt);
  const mapMarkup = report.mapSnapshotUri
    ? `<img class="map-snapshot" src="${escapeHtml(report.mapSnapshotUri)}" alt="Expedition recap map" />`
    : '<p class="map-fallback">Map snapshot unavailable for this report.</p>';

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(report.title)} - ECS Expedition Report</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0b0e12;
      --panel: #111418;
      --line: rgba(209, 171, 91, 0.34);
      --line-soft: rgba(209, 171, 91, 0.18);
      --gold: #d1ab5b;
      --text: #f2eadc;
      --muted: #a8a090;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.45;
    }
    .page {
      max-width: 820px;
      margin: 0 auto;
      padding: 34px;
    }
    .header {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #0f1216;
      padding: 22px;
    }
    .eyebrow {
      color: var(--gold);
      font-size: 11px;
      font-weight: 900;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    h1 {
      margin: 8px 0 4px;
      font-size: 29px;
      line-height: 1.12;
      letter-spacing: 0;
    }
    .date {
      color: var(--muted);
      font-size: 13px;
      font-weight: 700;
    }
    .metrics {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      margin: 14px 0;
    }
    .metric, .section {
      border: 1px solid var(--line-soft);
      border-radius: 8px;
      background: var(--panel);
    }
    .metric {
      padding: 12px;
      min-height: 76px;
    }
    .metric-value {
      color: var(--gold);
      font-size: 18px;
      font-weight: 900;
    }
    .metric-label {
      margin-top: 5px;
      color: var(--muted);
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
    }
    .section {
      margin-top: 14px;
      padding: 16px;
    }
    h2 {
      margin: 0 0 9px;
      font-size: 15px;
      letter-spacing: 0;
    }
    .headline {
      color: var(--gold);
      font-weight: 900;
      margin: 0 0 6px;
    }
    p {
      margin: 0;
      color: var(--muted);
      font-size: 13px;
      font-weight: 650;
    }
    .map-snapshot {
      width: 100%;
      max-height: 360px;
      object-fit: contain;
      border-radius: 6px;
      border: 1px solid var(--line-soft);
      background: #090b0d;
    }
    .map-fallback {
      min-height: 64px;
      display: flex;
      align-items: center;
      color: var(--muted);
      border-top: 1px solid var(--line-soft);
      padding-top: 12px;
    }
    .item {
      padding: 10px 0;
      border-top: 1px solid var(--line-soft);
    }
    .item:first-of-type { border-top: 0; padding-top: 0; }
    .item-title {
      color: var(--text);
      font-size: 13px;
      font-weight: 900;
    }
    .item-meta {
      margin-top: 2px;
      color: var(--gold);
      font-size: 10px;
      font-weight: 900;
      text-transform: uppercase;
    }
    .badge-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .badge {
      border: 1px solid var(--line-soft);
      border-radius: 8px;
      padding: 10px;
    }
    .badge-title {
      color: var(--text);
      font-size: 12px;
      font-weight: 900;
    }
    .badge-copy {
      margin-top: 3px;
      font-size: 11px;
    }
    @media print {
      body { background: #0b0e12; }
      .page { padding: 20px; }
      .section, .header, .metric { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <main class="page">
    <section class="header">
      <div class="eyebrow">ECS Expedition Report</div>
      <h1>${escapeHtml(report.title)}</h1>
      <div class="date">${escapeHtml(formatDate(report.completedAt))}</div>
    </section>

    <section class="metrics" aria-label="Trip metrics">
      <div class="metric"><div class="metric-value">${escapeHtml(formatDistance(report.totalDistanceMiles))}</div><div class="metric-label">Distance</div></div>
      <div class="metric"><div class="metric-value">${escapeHtml(formatDuration(report.totalDurationSeconds))}</div><div class="metric-label">Duration</div></div>
      <div class="metric"><div class="metric-value">${escapeHtml(formatElevation(report.maxElevationFt))}</div><div class="metric-label">Max Elevation</div></div>
      <div class="metric"><div class="metric-value">${escapeHtml(formatElevation(report.elevationGainFt))}</div><div class="metric-label">Elevation Gain</div></div>
    </section>

    <section class="section">
      <h2>Recap Summary</h2>
      ${report.recapHeadline ? `<p class="headline">${escapeHtml(report.recapHeadline)}</p>` : ''}
      <p>${escapeHtml(report.recapSummary ?? 'Expedition completed.')}</p>
    </section>

    <section class="section">
      <h2>Recap Map</h2>
      ${mapMarkup}
    </section>

    ${notableMoments.length > 0 ? `<section class="section">
      <h2>Top Notable Moments</h2>
      ${notableMoments.map((moment) => {
        const elapsed = formatElapsed((moment as ExpeditionRecapNotableMoment & { elapsedSeconds?: number }).elapsedSeconds);
        const timestamp = formatDate(moment.capturedAt);
        return `<div class="item">
          <div class="item-title">${escapeHtml(moment.title)}</div>
          <div class="item-meta">${escapeHtml(elapsed ?? timestamp)} / ${escapeHtml(moment.type.replace(/_/g, ' '))}</div>
          ${moment.detail ? `<p>${escapeHtml(moment.detail)}</p>` : ''}
        </div>`;
      }).join('')}
    </section>` : ''}

    ${badgesEarned.length > 0 ? `<section class="section">
      <h2>Badges Earned</h2>
      <div class="badge-grid">
        ${badgesEarned.map((badge) => `<div class="badge">
          <div class="badge-title">${escapeHtml(badge.title)}</div>
          <p class="badge-copy">${escapeHtml(badge.description)}</p>
          <div class="item-meta">${escapeHtml(badge.rarity)} / ${escapeHtml(badge.category)}</div>
        </div>`).join('')}
      </div>
    </section>` : ''}
  </main>
</body>
</html>`;
}

function reportStatusLabel(status: string): string {
  if (status === 'recorded') return 'Recorded';
  if (status === 'partial') return 'Partial / source-limited';
  return 'Unavailable';
}

function reportSourceStateLabel(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDateTime(value: string | null): string {
  if (!value) return 'Time unavailable';
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return 'Time unavailable';
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function pointAtRouteProgress(
  points: ExpeditionReportStory['route']['points'],
  progressPercent: number,
): { x: number; y: number } | null {
  if (points.length < 2) return null;
  const progress = Math.max(0, Math.min(100, progressPercent));
  const rightIndex = points.findIndex((point) => point.progressPercent >= progress);
  if (rightIndex <= 0) return { x: points[0].x, y: points[0].y };
  if (rightIndex < 0) {
    const last = points[points.length - 1];
    return { x: last.x, y: last.y };
  }
  const left = points[rightIndex - 1];
  const right = points[rightIndex];
  const span = Math.max(0.0001, right.progressPercent - left.progressPercent);
  const fraction = Math.max(0, Math.min(1, (progress - left.progressPercent) / span));
  return {
    x: left.x + (right.x - left.x) * fraction,
    y: left.y + (right.y - left.y) * fraction,
  };
}

function routeGraphicMarkerColor(event: ExpeditionReportStoryTimelineEvent): string {
  if (event.significance === 'critical') return '#b42318';
  if (event.significance === 'caution') return '#d97706';
  if (event.significance === 'watch') return '#2563eb';
  return '#475467';
}

function reportTimelineEvents(story: ExpeditionReportStory): ExpeditionReportStoryTimelineEvent[] {
  // Badge evaluations are presented in the dedicated achievement section.
  // They are intentionally excluded from the route-time narrative because an
  // unlock timestamp is not evidence that the badge occurred at a route point.
  return story.timeline.filter((event) => event.category !== 'achievement');
}

function buildRouteStoryMarkup(story: ExpeditionReportStory): string {
  const route = story.route;
  if (route.status !== 'ready' || route.points.length < 2) {
    return `<div class="route-unavailable">
      <strong>${escapeHtml(route.sourceLabel)}</strong>
      <p>${escapeHtml(route.sourceDetail)}</p>
    </div>`;
  }

  const width = 720;
  const routeHeight = 190;
  const elevationTop = 224;
  const elevationHeight = 72;
  const padX = 34;
  const padY = 26;
  const project = (point: { x: number; y: number }) => ({
    x: padX + (point.x / 100) * (width - padX * 2),
    y: padY + (point.y / 100) * (routeHeight - padY * 2),
  });
  const routeLine = route.points.map((point) => {
    const projected = project(point);
    return `${projected.x.toFixed(1)},${projected.y.toFixed(1)}`;
  }).join(' ');
  const timelineEvents = reportTimelineEvents(story);
  const located = timelineEvents
    .map((event, timelineIndex) => ({ event, timelineIndex }))
    .filter((entry) => entry.event.routeProgressPercent != null)
    .slice(0, 18);
  const elevationLine = route.elevationProfile.map((point) => {
    const x = padX + (point.progressPercent / 100) * (width - padX * 2);
    const y = elevationTop + (1 - point.elevationPercent / 100) * elevationHeight;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const elevations = route.elevationProfile.map((point) => point.elevationFt);
  const minElevation = elevations.length > 0 ? Math.min(...elevations) : null;
  const maxElevation = elevations.length > 0 ? Math.max(...elevations) : null;

  return `<div class="route-story-graphic">
    <svg viewBox="0 0 ${width} 324" role="img" aria-label="Location-redacted route progression and elevation profile with numbered notable-event markers">
      <rect x="0" y="0" width="${width}" height="324" rx="10" fill="#f8f5ee" />
      <polyline points="${routeLine}" fill="none" stroke="#101828" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" />
      <polyline points="${routeLine}" fill="none" stroke="#d4a72c" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
      ${located.map(({ event, timelineIndex }) => {
        const normalized = pointAtRouteProgress(route.points, event.routeProgressPercent as number);
        if (!normalized) return '';
        const point = project(normalized);
        const color = routeGraphicMarkerColor(event);
        const label = String(timelineIndex + 1);
        const title = `${event.title} - ${reportSourceStateLabel(event.significance)}`;
        if (event.category === 'terrain') {
          return `<g><title>${escapeHtml(title)}</title><rect x="${(point.x - 10).toFixed(1)}" y="${(point.y - 10).toFixed(1)}" width="20" height="20" rx="3" fill="${color}" stroke="#ffffff" stroke-width="2" /><text x="${point.x.toFixed(1)}" y="${(point.y + 3.5).toFixed(1)}" text-anchor="middle" font-size="9" font-weight="800" fill="#ffffff">${label}</text></g>`;
        }
        return `<g><title>${escapeHtml(title)}</title><circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="10" fill="${color}" stroke="#ffffff" stroke-width="2" /><text x="${point.x.toFixed(1)}" y="${(point.y + 3.5).toFixed(1)}" text-anchor="middle" font-size="9" font-weight="800" fill="#ffffff">${label}</text></g>`;
      }).join('')}
      <circle cx="${project(route.points[0]).x.toFixed(1)}" cy="${project(route.points[0]).y.toFixed(1)}" r="7" fill="#12b76a" stroke="#ffffff" stroke-width="2" />
      <circle cx="${project(route.points[route.points.length - 1]).x.toFixed(1)}" cy="${project(route.points[route.points.length - 1]).y.toFixed(1)}" r="7" fill="#101828" stroke="#ffffff" stroke-width="2" />
      <line x1="${padX}" y1="${elevationTop + elevationHeight}" x2="${width - padX}" y2="${elevationTop + elevationHeight}" stroke="#d0d5dd" stroke-width="1" />
      ${elevationLine ? `<polyline points="${elevationLine}" fill="none" stroke="#667085" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />` : ''}
      <text x="${padX}" y="214" font-size="11" font-weight="800" fill="#344054">SAVED ELEVATION PROFILE</text>
      ${minElevation == null || maxElevation == null ? `<text x="${padX}" y="252" font-size="12" fill="#667085">Elevation samples unavailable</text>` : `
        <text x="${width - padX}" y="238" text-anchor="end" font-size="10" fill="#667085">${escapeHtml(formatElevation(maxElevation))} high</text>
        <text x="${width - padX}" y="${elevationTop + elevationHeight - 4}" text-anchor="end" font-size="10" fill="#667085">${escapeHtml(formatElevation(minElevation))} low</text>`}
    </svg>
    <div class="route-legend">
      <span><i class="legend-start"></i> Start</span>
      <span><i class="legend-finish"></i> Finish</span>
      <span><i class="legend-terrain"></i> Terrain / risk marker</span>
      <span>Numbers match the full timeline below</span>
    </div>
    <p>${escapeHtml(route.sourceDetail)}</p>
    ${route.locatedEventCount > located.length ? `<p>${route.locatedEventCount - located.length} additional route-linked event(s) remain in the full timeline.</p>` : ''}
  </div>`;
}

function buildStorySectionsMarkup(story: ExpeditionReportStory): string {
  return story.sections
    .filter((section) => section.id !== 'journey')
    .map((section) => `<article class="story-section">
      <div class="section-heading">
        <h3>${escapeHtml(section.title)}</h3>
        <span class="state-pill state-${escapeHtml(section.status)}">${escapeHtml(reportStatusLabel(section.status))}</span>
      </div>
      ${section.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}
    </article>`)
    .join('');
}

function buildCoverageMarkup(story: ExpeditionReportStory): string {
  return story.coverage.map((coverage) => `<div class="coverage-row">
    <div>
      <strong>${escapeHtml(coverage.label)}</strong>
      <p>${escapeHtml(coverage.detail)}</p>
    </div>
    <span class="state-pill state-${escapeHtml(coverage.status)}">${escapeHtml(reportStatusLabel(coverage.status))}</span>
  </div>`).join('');
}

function buildTimelineMarkup(story: ExpeditionReportStory): string {
  const timelineEvents = reportTimelineEvents(story);
  if (timelineEvents.length === 0) {
    return '<p>No detailed timeline events were saved with this expedition.</p>';
  }
  return timelineEvents.map((event, index) => {
    const elapsed = formatElapsed(event.elapsedSeconds);
    const progress = event.routeProgressPercent == null ? null : `${Math.round(event.routeProgressPercent)}% along saved route`;
    return `<article class="timeline-item">
      <div class="timeline-index significance-${escapeHtml(event.significance)}">${index + 1}</div>
      <div class="timeline-copy">
        <div class="timeline-title-row">
          <strong>${escapeHtml(event.title)}</strong>
          <span class="significance-label">${escapeHtml(reportSourceStateLabel(event.significance))}</span>
        </div>
        <div class="timeline-meta">${escapeHtml(elapsed ?? formatDateTime(event.capturedAt))} / ${escapeHtml(reportSourceStateLabel(event.category))}${progress ? ` / ${escapeHtml(progress)}` : ''}</div>
        ${event.detail ? `<p>${escapeHtml(event.detail)}</p>` : ''}
        <div class="source-line">Source: ${escapeHtml(event.sourceLabel)} / ${escapeHtml(reportSourceStateLabel(event.sourceQuality))}${event.syncState ? ` / ${escapeHtml(reportSourceStateLabel(event.syncState))}` : ''}</div>
      </div>
    </article>`;
  }).join('') + (story.omittedEventCount > 0
    ? `<p class="source-limit">${story.omittedEventCount} additional event(s) exceeded the bounded report timeline. Source coverage is partial; the saved trip data remains authoritative.</p>`
    : '');
}

export function buildExpeditionReportHtml(report: ExpeditionReport): string {
  if (!report.story) return buildLegacyExpeditionReportHtml(report);
  const story = report.story;
  const badgesEarned = report.badgesEarned.filter((badge) => !!badge.unlockedAt);

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'" />
  <title>${escapeHtml(report.title)} - ECS Expedition Report</title>
  <style>
    :root { --ink:#101828; --muted:#667085; --soft:#f8f5ee; --line:#ded7c9; --gold:#a87913; --paper:#fffdf8; --green:#067647; --blue:#175cd3; --amber:#b54708; --red:#b42318; }
    * { box-sizing: border-box; }
    @page { size: letter; margin: 12mm; }
    body { margin:0; background:#e9e5dc; color:var(--ink); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; line-height:1.45; }
    .page { max-width:850px; margin:0 auto; padding:30px; background:var(--paper); }
    .header { border:1px solid #1d2939; border-radius:10px; background:#101828; color:#fff; padding:24px; }
    .eyebrow { color:#e9c96c; font-size:10px; font-weight:900; letter-spacing:.16em; text-transform:uppercase; }
    h1 { margin:7px 0 3px; font-size:30px; line-height:1.12; }
    .date { color:#d0d5dd; font-size:12px; font-weight:700; }
    h2 { margin:0 0 10px; font-size:17px; break-after:avoid; }
    h3 { margin:0; font-size:13px; }
    p { margin:0 0 8px; color:var(--muted); font-size:12px; }
    p:last-child { margin-bottom:0; }
    .metrics { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; margin:12px 0; }
    .metric { min-height:72px; border:1px solid var(--line); border-radius:8px; background:var(--soft); padding:11px; }
    .metric-value { color:var(--ink); font-size:17px; font-weight:900; }
    .metric-label { margin-top:4px; color:var(--muted); font-size:9px; font-weight:900; text-transform:uppercase; }
    .section { margin-top:12px; border:1px solid var(--line); border-radius:9px; background:#fff; padding:15px; }
    .story-lead { color:#344054; font-size:13px; }
    .route-story-graphic { border:1px solid var(--line); border-radius:8px; overflow:hidden; background:var(--soft); padding:8px; }
    .route-story-graphic svg { display:block; width:100%; height:auto; }
    .route-story-graphic p { padding:0 8px 7px; font-size:10px; }
    .route-unavailable { min-height:90px; border:1px dashed var(--line); border-radius:8px; padding:16px; background:var(--soft); }
    .route-legend { display:flex; flex-wrap:wrap; gap:8px 14px; padding:5px 8px 6px; color:#475467; font-size:9px; font-weight:800; }
    .route-legend span { display:inline-flex; align-items:center; gap:4px; }
    .route-legend i { width:9px; height:9px; display:inline-block; border-radius:50%; background:#475467; }
    .route-legend .legend-start { background:#12b76a; }
    .route-legend .legend-finish { background:#101828; }
    .route-legend .legend-terrain { border-radius:2px; background:#d97706; }
    .section-heading,.timeline-title-row,.coverage-row { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
    .story-section { padding:11px 0; border-top:1px solid #eaecf0; break-inside:avoid; }
    .story-section:first-of-type { border-top:0; padding-top:0; }
    .story-section p { margin-top:5px; }
    .state-pill { display:inline-block; white-space:nowrap; border-radius:999px; padding:3px 7px; font-size:8px; font-weight:900; text-transform:uppercase; }
    .state-recorded { color:var(--green); background:#ecfdf3; }
    .state-partial { color:var(--amber); background:#fff7ed; }
    .state-unavailable { color:#475467; background:#f2f4f7; }
    .coverage-row { padding:9px 0; border-top:1px solid #eaecf0; break-inside:avoid; }
    .coverage-row:first-of-type { border-top:0; padding-top:0; }
    .coverage-row strong { font-size:11px; }
    .coverage-row p { margin-top:2px; font-size:10px; }
    .timeline-item { display:grid; grid-template-columns:28px 1fr; gap:10px; padding:10px 0; border-top:1px solid #eaecf0; break-inside:avoid; }
    .timeline-item:first-of-type { border-top:0; padding-top:0; }
    .timeline-index { width:24px; height:24px; border-radius:50%; color:#fff; background:#475467; display:flex; align-items:center; justify-content:center; font-size:9px; font-weight:900; }
    .significance-info { background:#475467; }
    .significance-watch { background:var(--blue); }
    .significance-caution { background:var(--amber); }
    .significance-critical { background:var(--red); }
    .timeline-title-row strong { font-size:12px; }
    .significance-label { color:#475467; font-size:8px; font-weight:900; text-transform:uppercase; }
    .timeline-meta,.source-line { margin-top:2px; color:var(--gold); font-size:8px; font-weight:900; text-transform:uppercase; }
    .source-line { color:#667085; }
    .timeline-copy p { margin-top:4px; }
    .badge-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
    .badge { border:1px solid var(--line); border-radius:8px; padding:10px; break-inside:avoid; }
    .badge-title { font-size:11px; font-weight:900; }
    .badge-copy { margin-top:3px; font-size:10px; }
    .privacy { border-left:4px solid var(--gold); background:var(--soft); padding:10px 12px; }
    .privacy p { color:#475467; font-size:10px; }
    .source-limit { margin-top:8px; border:1px solid #fedf89; background:#fffaeb; border-radius:6px; padding:8px; color:#93370d; }
    @media print {
      body { background:#fff; }
      .page { max-width:none; margin:0; padding:0; }
      .header,.metric,.route-story-graphic,.badge,.privacy { break-inside:avoid; }
    }
  </style>
</head>
<body>
  <main class="page">
    <header class="header">
      <div class="eyebrow">ECS Expedition Story Report</div>
      <h1>${escapeHtml(report.title)}</h1>
      <div class="date">Completed ${escapeHtml(formatDate(report.completedAt))} / Generated ${escapeHtml(formatDate(report.generatedAt))}</div>
    </header>

    <section class="metrics" aria-label="Trip metrics">
      <div class="metric"><div class="metric-value">${escapeHtml(formatDistance(report.totalDistanceMiles))}</div><div class="metric-label">Distance</div></div>
      <div class="metric"><div class="metric-value">${escapeHtml(formatDuration(report.totalDurationSeconds))}</div><div class="metric-label">Duration</div></div>
      <div class="metric"><div class="metric-value">${escapeHtml(formatElevation(report.maxElevationFt))}</div><div class="metric-label">Max elevation</div></div>
      <div class="metric"><div class="metric-value">${escapeHtml(formatElevation(report.elevationGainFt))}</div><div class="metric-label">Elevation gain</div></div>
    </section>

    <section class="section">
      <h2>Journey Story</h2>
      ${story.narrativeParagraphs.map((paragraph) => `<p class="story-lead">${escapeHtml(paragraph)}</p>`).join('')}
    </section>

    <section class="section">
      <h2>Route Story</h2>
      ${buildRouteStoryMarkup(story)}
    </section>

    <section class="section">
      <h2>Experience Chapters</h2>
      ${buildStorySectionsMarkup(story)}
    </section>

    <section class="section">
      <h2>Source Coverage</h2>
      ${buildCoverageMarkup(story)}
    </section>

    <section class="section">
      <h2>Expedition Timeline</h2>
      ${buildTimelineMarkup(story)}
    </section>

    ${badgesEarned.length > 0 ? `<section class="section">
      <h2>Badges Earned</h2>
      <div class="badge-grid">${badgesEarned.map((badge) => `<article class="badge">
        <div class="badge-title">${escapeHtml(badge.title)}</div>
        <p class="badge-copy">${escapeHtml(badge.description)}</p>
        <div class="timeline-meta">${escapeHtml(badge.rarity)} / ${escapeHtml(badge.category)}</div>
      </article>`).join('')}</div>
    </section>` : ''}

    <section class="section privacy">
      <h2>Sharing and Privacy</h2>
      <p>${escapeHtml(story.privacyNotice)}</p>
      <p>This report is a historical aid, not a live tracking feed or a substitute for official incident response records.</p>
    </section>
  </main>
</body>
</html>`;
}

async function writeHtmlReport(html: string, fileName: string): Promise<string | null> {
  try {
    const documentDir = await getDocumentDirectory();
    if (!documentDir) return null;
    const directoryUri = `${documentDir}${REPORT_DIRECTORY}`;
    const directoryReady = await fsEnsureDir(directoryUri);
    if (!directoryReady) return null;
    const localUri = `${directoryUri}${fileName}.html`;
    await fsWriteString(localUri, html, 'utf8');
    const info = await fsGetInfo(localUri);
    return info.exists && !info.isDirectory ? localUri : null;
  } catch {
    return null;
  }
}

async function copyPrintedPdfToDocuments(sourceUri: string, fileName: string): Promise<string | null> {
  try {
    const documentDir = await getDocumentDirectory();
    if (!documentDir) return null;
    const directoryUri = `${documentDir}${REPORT_DIRECTORY}`;
    const directoryReady = await fsEnsureDir(directoryUri);
    if (!directoryReady) return null;
    const destinationUri = `${directoryUri}${fileName}.pdf`;
    const base64 = await fsReadString(sourceUri, 'base64');
    if (!base64) return null;
    await fsWriteString(destinationUri, base64, 'base64');
    const info = await fsGetInfo(destinationUri);
    return info.exists && !info.isDirectory ? destinationUri : null;
  } catch {
    return null;
  }
}

async function generatePdfReport(html: string, fileName: string): Promise<string | null> {
  try {
    const Print = await import('expo-print');
    const result = await Print.printToFileAsync({
      html,
      base64: false,
    });
    const uri = nullableString(result?.uri);
    if (!uri) return null;
    return await copyPrintedPdfToDocuments(uri, fileName) ?? uri;
  } catch {
    return null;
  }
}

async function getSharingModule(): Promise<{
  isAvailableAsync?: () => Promise<boolean>;
  shareAsync?: (uri: string, options?: Record<string, unknown>) => Promise<void>;
} | null> {
  try {
    const mod = await import('expo-sharing');
    return ((mod as any)?.default ?? mod) as {
      isAvailableAsync?: () => Promise<boolean>;
      shareAsync?: (uri: string, options?: Record<string, unknown>) => Promise<void>;
    };
  } catch {
    return null;
  }
}

async function generateExpeditionReportNow(tripId: string): Promise<ExpeditionReport | null> {
  try {
    const trip = await expeditionTripRecordStore.getById(tripId);
    if (!trip || trip.status !== 'completed') return null;

    const badgesEarned = await getBadgesForTrip(tripId).catch(() => []);
    const regeneratedRecap = generateExpeditionRecap(trip, trip.updatedAt);
    const persistedRecapMoments = trip.recap?.expeditionEvents.notableMoments ?? [];
    const mergedRecapMoments = [...persistedRecapMoments, ...regeneratedRecap.expeditionEvents.notableMoments]
      .filter((moment, index, values) => values.findIndex((candidate) => candidate.id === moment.id) === index)
      .sort((left, right) => {
        const leftTime = new Date(left.capturedAt).getTime();
        const rightTime = new Date(right.capturedAt).getTime();
        if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) return leftTime - rightTime;
        if (Number.isFinite(leftTime) && !Number.isFinite(rightTime)) return -1;
        if (!Number.isFinite(leftTime) && Number.isFinite(rightTime)) return 1;
        return left.id.localeCompare(right.id);
      });
    const currentRecap = {
      ...regeneratedRecap,
      expeditionEvents: {
        ...regeneratedRecap.expeditionEvents,
        notableMoments: mergedRecapMoments,
      },
    };
    const storyTrip = { ...trip, recap: currentRecap };
    const trackedEvents = await collectExpeditionReportTrackedEvents(storyTrip).catch(() => []);
    const story = buildExpeditionReportStory({
      trip: storyTrip,
      badgesEarned,
      trackedEvents,
    });
    const sourceFingerprint = stableLifecycleHash(JSON.stringify({
      tripId: trip.id,
      completionKey: trip.completionKey,
      updatedAt: trip.updatedAt,
      badges: badgesEarned
        .map((badge) => ({ id: badge.id, unlockedAt: badge.unlockedAt, updatedAt: badge.updatedAt }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      story,
    }));
    const sourceTimestamps = [
      trip.updatedAt,
      trip.completedAt,
      ...badgesEarned.map((badge) => badge.updatedAt),
      ...trackedEvents.map((event) => event.capturedAt),
    ]
      .filter((value): value is string => typeof value === 'string' && Number.isFinite(new Date(value).getTime()))
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    const generatedAt = sourceTimestamps[0] ?? nowISO();
    const recapMoments = persistedRecapMoments.length > 0
      ? [...persistedRecapMoments].sort((left, right) => new Date(left.capturedAt).getTime() - new Date(right.capturedAt).getTime())
      : currentRecap.expeditionEvents.notableMoments;
    const report: ExpeditionReport = {
      id: `expedition-report:${stableLifecycleHash(tripId)}`,
      tripId,
      sourceFingerprint,
      privacyMode: 'redacted',
      generatedAt,
      title: trip.title,
      completedAt: trip.completedAt,
      totalDistanceMiles: trip.totalDistanceMiles ?? currentRecap.journeySummary.totalDistanceMiles ?? null,
      totalDurationSeconds: trip.totalDurationSeconds,
      maxElevationFt: trip.maxElevationFt ?? currentRecap.journeySummary.maxElevationFt ?? null,
      elevationGainFt: trip.totalElevationGainFt ?? currentRecap.journeySummary.elevationGainFt ?? null,
      recapHeadline: currentRecap.generatedNarrative.headline ?? null,
      recapSummary: currentRecap.generatedNarrative.summaryParagraph ?? trip.generatedSummary?.text ?? null,
      story,
      notableMoments: recapMoments.map((moment) => ({
        ...moment,
        coordinate: null,
      })),
      badgesEarned,
      routeBounds: null,
      routeGeometryReference:
        currentRecap.routeSummary.routeGeometryReference ??
        (trip.routeGeometry.length > 0 ? `trip:${trip.id}:routeGeometry` : null),
      mapSnapshotUri: null,
      exportFormat: 'html',
      localUri: null,
      createdAt: generatedAt,
    };

    const fileName = `${safeFilePart(report.title)}-${generatedAt.slice(0, 10)}`;
    const html = buildExpeditionReportHtml(report);
    const htmlUri = await writeHtmlReport(html, fileName);
    const pdfUri = await generatePdfReport(html, fileName);
    const finalizedReport: ExpeditionReport = {
      ...report,
      exportFormat: pdfUri ? 'pdf' : htmlUri ? 'html' : 'text',
      localUri: pdfUri ?? htmlUri,
    };

    const snapshot = await loadSnapshot();
    await saveSnapshot(upsertReport(snapshot, finalizedReport));
    return finalizedReport;
  } catch {
    return null;
  }
}

export async function generateExpeditionReport(tripId: string): Promise<ExpeditionReport | null> {
  const normalizedTripId = nullableString(tripId);
  if (!normalizedTripId) return null;
  const existing = reportGenerationFlights.get(normalizedTripId);
  if (existing) return existing;
  const flight = generateExpeditionReportNow(normalizedTripId).finally(() => {
    if (reportGenerationFlights.get(normalizedTripId) === flight) {
      reportGenerationFlights.delete(normalizedTripId);
    }
  });
  reportGenerationFlights.set(normalizedTripId, flight);
  return flight;
}

export async function getReportForTrip(tripId: string): Promise<ExpeditionReport | null> {
  const snapshot = await loadSnapshot();
  return snapshot.reports
    .filter((report) => report.tripId === tripId)
    .sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime())[0] ?? null;
}

export async function getAllExpeditionReports(): Promise<ExpeditionReport[]> {
  const snapshot = await loadSnapshot();
  return [...snapshot.reports].sort(
    (a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime(),
  );
}

export async function getReportsForTrip(tripId: string): Promise<ExpeditionReport[]> {
  const reports = await getAllExpeditionReports();
  return reports.filter((report) => report.tripId === tripId);
}

export async function getMostRecentReports(limit = 5): Promise<ExpeditionReport[]> {
  const reports = await getAllExpeditionReports();
  return reports.slice(0, Math.max(0, limit));
}

export async function regenerateExpeditionReport(tripId: string): Promise<ExpeditionReport | null> {
  return generateExpeditionReport(tripId);
}

export async function deleteExpeditionReport(reportId: string): Promise<boolean> {
  const snapshot = await loadSnapshot();
  const existing = snapshot.reports.find((report) => report.id === reportId);
  if (!existing) return false;
  const reports = snapshot.reports.filter((report) => report.id !== reportId);
  await saveSnapshot({ version: STORAGE_VERSION, reports });
  if (existing.localUri) {
    await fsDelete(existing.localUri, { idempotent: true }).catch(() => null);
  }
  return true;
}

export async function downloadExpeditionReport(reportId: string): Promise<ExpeditionReportShareResult> {
  const snapshot = await loadSnapshot();
  const report = snapshot.reports.find((item) => item.id === reportId) ?? null;
  if (!report) {
    return {
      ok: false,
      report: null,
      message: 'Expedition report could not be found.',
    };
  }

  if (!report.localUri) {
    return {
      ok: false,
      report,
      message: 'Expedition report generated locally, but no downloadable file is available on this platform.',
      unavailableReason: 'Local report URI unavailable.',
    };
  }

  const info = await fsGetInfo(report.localUri).catch(() => ({ exists: false, isDirectory: false }));
  if (!info.exists || info.isDirectory) {
    return {
      ok: false,
      report,
      message: 'Report file unavailable.',
      unavailableReason: 'Local report file missing.',
    };
  }

  try {
    if (await triggerBrowserReportDownload(report)) {
      return {
        ok: true,
        report,
        message: 'Expedition report download started.',
      };
    }
  } catch (error) {
    return {
      ok: false,
      report,
      message: 'Expedition report generated locally, but download failed.',
      unavailableReason: error instanceof Error ? error.message : 'Unknown download error.',
    };
  }

  const shareResult = await shareExpeditionReport(reportId);
  if (shareResult.ok) return shareResult;
  return {
    ok: false,
    report,
    message: 'Expedition report generated locally. Download is unavailable on this device.',
    unavailableReason: shareResult.unavailableReason ?? 'Browser download unavailable.',
  };
}

export async function shareExpeditionReport(reportId: string): Promise<ExpeditionReportShareResult> {
  const snapshot = await loadSnapshot();
  const report = snapshot.reports.find((item) => item.id === reportId) ?? null;
  if (!report) {
    return {
      ok: false,
      report: null,
      message: 'Expedition report could not be found.',
    };
  }

  if (!report.localUri) {
    return {
      ok: false,
      report,
      message: 'Expedition report generated locally, but no shareable file is available on this platform.',
      unavailableReason: 'Local report URI unavailable.',
    };
  }

  const sharing = await getSharingModule();
  if (!sharing?.shareAsync) {
    return {
      ok: false,
      report,
      message: 'Expedition report generated locally. Sharing is unavailable on this device.',
      unavailableReason: 'expo-sharing is unavailable.',
    };
  }

  try {
    const available = typeof sharing.isAvailableAsync === 'function'
      ? await sharing.isAvailableAsync()
      : true;
    if (!available) {
      return {
        ok: false,
        report,
        message: 'Expedition report generated locally. Sharing is unavailable on this device.',
        unavailableReason: 'Native share sheet unavailable.',
      };
    }
    await sharing.shareAsync(report.localUri, {
      mimeType: report.exportFormat === 'pdf' ? 'application/pdf' : 'text/html',
      dialogTitle: 'Export Expedition Report',
      UTI: report.exportFormat === 'pdf' ? 'com.adobe.pdf' : 'public.html',
    });
    return {
      ok: true,
      report,
      message: 'Expedition report ready to save or share.',
    };
  } catch (error) {
    return {
      ok: false,
      report,
      message: 'Expedition report generated locally, but sharing failed.',
      unavailableReason: error instanceof Error ? error.message : 'Unknown sharing error.',
    };
  }
}

export async function clearAllExpeditionReportsForTests(): Promise<void> {
  const snapshot = await loadSnapshot();
  await Promise.all(
    snapshot.reports
      .map((report) => report.localUri)
      .filter((uri): uri is string => !!uri)
      .map((uri) => fsDelete(uri, { idempotent: true }).catch(() => null)),
  );
  await saveSnapshot({ version: STORAGE_VERSION, reports: [] });
}

// TODO Expedition Reports: add an explicit-consent exact-map export mode only after route-sharing privacy approval.
// TODO Expedition Reports: support printable high-resolution map tiles when map capture is available offline.
// TODO Expedition Reports: replace iconKey text with badge stamp artwork.
// TODO Expedition Reports: add QR code route reference once route sharing contracts are stable.
// TODO Expedition Reports: queue optional cloud backup of reports without blocking local access.
// TODO Expedition Reports: add user-selected report themes while preserving ECS field-document styling.
// TODO Expedition Reports Library: add report search, regeneration from library, batch export, and print-specific formatting.
