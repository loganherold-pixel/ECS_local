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
import { stableLifecycleHash } from '../lifecycle/routeTripExpeditionLifecycle';
import type {
  ExpeditionBadge,
  ExpeditionRecapNotableMoment,
  ExpeditionReport,
  ExpeditionReportExportFormat,
  ExpeditionTripBounds,
} from './expeditionTripRecordTypes';

const STORAGE_KEY = 'ecs_expedition_reports_v1';
const STORAGE_VERSION = 2;
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
  if (value == null || !Number.isFinite(value)) return '0 mi';
  if (value > 0 && value < 10) return `${value.toFixed(1)} mi`;
  return `${Math.round(value).toLocaleString()} mi`;
}

function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return '0 hrs';
  const hours = seconds / 3600;
  if (hours < 1) return `${Math.max(1, Math.round(seconds / 60))} min`;
  if (hours < 10) return `${Math.round(hours * 10) / 10} hrs`;
  return `${Math.round(hours).toLocaleString()} hrs`;
}

function formatElevation(value: number | null): string {
  return value == null || !Number.isFinite(value) ? '0 ft' : `${Math.round(value).toLocaleString()} ft`;
}

function formatElapsed(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null;
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

function getMomentTimestamp(moment: ExpeditionRecapNotableMoment, tripStartedAt: string | null | undefined): number {
  const captured = new Date(moment.capturedAt).getTime();
  if (Number.isFinite(captured)) return captured;
  const elapsed = Number((moment as ExpeditionRecapNotableMoment & { elapsedSeconds?: number }).elapsedSeconds);
  const started = tripStartedAt ? new Date(tripStartedAt).getTime() : Number.NaN;
  if (Number.isFinite(elapsed) && Number.isFinite(started)) return started + elapsed * 1000;
  return Number.MAX_SAFE_INTEGER;
}

function getTopNotableMoments(
  moments: ExpeditionRecapNotableMoment[],
  tripStartedAt: string | null | undefined,
): ExpeditionRecapNotableMoment[] {
  return [...moments]
    .sort((a, b) => getMomentTimestamp(a, tripStartedAt) - getMomentTimestamp(b, tripStartedAt))
    .slice(0, 6);
}

function buildExpeditionReportHtml(report: ExpeditionReport): string {
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

export async function generateExpeditionReport(tripId: string): Promise<ExpeditionReport | null> {
  try {
    const trip = await expeditionTripRecordStore.getById(tripId);
    if (!trip || trip.status !== 'completed') return null;

    const badgesEarned = await getBadgesForTrip(tripId).catch(() => []);
    const sourceFingerprint = stableLifecycleHash(JSON.stringify({
      tripId: trip.id,
      completionKey: trip.completionKey,
      updatedAt: trip.updatedAt,
      badges: badgesEarned
        .map((badge) => ({ id: badge.id, unlockedAt: badge.unlockedAt, updatedAt: badge.updatedAt }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    }));
    const sourceTimestamps = [
      trip.updatedAt,
      trip.completedAt,
      ...badgesEarned.map((badge) => badge.updatedAt),
    ]
      .filter((value): value is string => typeof value === 'string' && Number.isFinite(new Date(value).getTime()))
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    const generatedAt = sourceTimestamps[0] ?? nowISO();
    const recapMoments = trip.recap?.expeditionEvents.notableMoments ?? [];
    const report: ExpeditionReport = {
      id: `expedition-report:${stableLifecycleHash(tripId)}`,
      tripId,
      sourceFingerprint,
      privacyMode: 'redacted',
      generatedAt,
      title: trip.title,
      completedAt: trip.completedAt,
      totalDistanceMiles: trip.totalDistanceMiles ?? trip.recap?.journeySummary.totalDistanceMiles ?? null,
      totalDurationSeconds: trip.totalDurationSeconds,
      maxElevationFt: trip.maxElevationFt ?? trip.recap?.journeySummary.maxElevationFt ?? null,
      elevationGainFt: trip.totalElevationGainFt ?? trip.recap?.journeySummary.elevationGainFt ?? null,
      recapHeadline: trip.recap?.generatedNarrative.headline ?? null,
      recapSummary: trip.recap?.generatedNarrative.summaryParagraph ?? trip.generatedSummary?.text ?? null,
      notableMoments: getTopNotableMoments(recapMoments, trip.startedAt).map((moment) => ({
        ...moment,
        coordinate: null,
      })),
      badgesEarned,
      routeBounds: null,
      routeGeometryReference:
        trip.recap?.routeSummary.routeGeometryReference ??
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

// TODO Expedition Reports: capture export-ready exploded map layout from the recap map view.
// TODO Expedition Reports: support printable high-resolution map tiles when map capture is available offline.
// TODO Expedition Reports: replace iconKey text with badge stamp artwork.
// TODO Expedition Reports: add QR code route reference once route sharing contracts are stable.
// TODO Expedition Reports: queue optional cloud backup of reports without blocking local access.
// TODO Expedition Reports: add user-selected report themes while preserving ECS field-document styling.
// TODO Expedition Reports Library: add report search, regeneration from library, batch export, and print-specific formatting.
