import { Platform } from 'react-native';
import type { OfflinePrepPackManifest } from '../offlinePrepPack/offlinePrepPackTypes';

export type ExploreTripManifestExportInput = {
  title: string;
  manifest: OfflinePrepPackManifest;
  itinerary?: unknown | null;
  route?: unknown | null;
  generatedAt?: string | null;
};

export type ExploreTripManifestExportResult = {
  success: boolean;
  error?: string;
};

const C = {
  bg: '#0B0F12',
  panel: '#151B1E',
  panelAlt: '#101518',
  border: '#314039',
  amber: '#C48A2C',
  text: '#E6E6E1',
  muted: '#8A8A85',
  success: '#66BB6A',
  warning: '#FFB74D',
  danger: '#EF5350',
  info: '#42A5F5',
};

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'Unavailable';
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Date(timestamp).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusColor(status: unknown): string {
  const normalized = String(status ?? '').toLowerCase();
  if (normalized.includes('ready') || normalized.includes('available') || normalized.includes('cached')) {
    return C.success;
  }
  if (normalized.includes('failed') || normalized.includes('critical')) return C.danger;
  if (normalized.includes('unavailable') || normalized.includes('missing')) return C.warning;
  return C.info;
}

function itemStatusLabel(status: unknown): string {
  return String(status ?? 'unknown').replace(/\s+/g, '_').toUpperCase();
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readRouteMeta(route: unknown): Array<{ label: string; value: string }> {
  const record = objectRecord(route);
  const metadata = objectRecord(record.routeMetadata ?? record.route_metadata);
  const rows: Array<{ label: string; value: string }> = [];
  if (record.distanceMiles != null) rows.push({ label: 'Route distance', value: `${record.distanceMiles} mi` });
  if (record.region) rows.push({ label: 'Region', value: String(record.region) });
  if (record.terrainType) rows.push({ label: 'Terrain', value: String(record.terrainType) });
  if (metadata.source) rows.push({ label: 'Source', value: String(metadata.source) });
  const warnings = arrayValue(metadata.warnings)
    .map((entry) => String(entry ?? '').trim())
    .filter(Boolean);
  if (warnings.length > 0) rows.push({ label: 'Route warnings', value: warnings.join(' | ') });
  return rows;
}

function renderProgress(manifest: OfflinePrepPackManifest): string {
  const progress = manifest.progress;
  return `
    <section class="grid">
      <div class="stat"><span>${esc(itemStatusLabel(progress.status))}</span><label>Pack Status</label></div>
      <div class="stat"><span>${esc(progress.percent)}%</span><label>Prepared</label></div>
      <div class="stat"><span>${esc(progress.readyItems)} / ${esc(progress.totalItems)}</span><label>Ready Items</label></div>
      <div class="stat"><span>${esc(progress.unavailableItems + progress.failedItems)}</span><label>Needs Review</label></div>
    </section>
  `;
}

function renderManifestItems(manifest: OfflinePrepPackManifest): string {
  return `
    <section class="section">
      <div class="section-title">Offline Prep Items</div>
      ${manifest.items.map((item) => `
        <article class="row">
          <div>
            <div class="row-title">${esc(item.label)}</div>
            <div class="row-summary">${esc(item.summary)}</div>
            <div class="meta">${esc(item.source)}${item.count != null ? ` | ${esc(item.count)} item${item.count === 1 ? '' : 's'}` : ''}</div>
          </div>
          <div class="status" style="border-color:${statusColor(item.status)}; color:${statusColor(item.status)}">
            ${esc(itemStatusLabel(item.status))}
          </div>
        </article>
      `).join('')}
    </section>
  `;
}

function renderErrors(manifest: OfflinePrepPackManifest): string {
  if (manifest.errors.length === 0) return '';
  return `
    <section class="section">
      <div class="section-title">Missing / Unavailable Data</div>
      ${manifest.errors.map((error) => `
        <article class="warning">
          <strong>${esc(error.itemType ?? error.id)}</strong>
          <span>${esc(error.message)}</span>
        </article>
      `).join('')}
    </section>
  `;
}

function renderItinerary(itinerary: unknown): string {
  const record = objectRecord(itinerary);
  const phases = arrayValue(record.phases);
  if (phases.length === 0) return '';
  return `
    <section class="section">
      <div class="section-title">Confidence-Built Itinerary</div>
      ${phases.map((phase) => {
        const phaseRecord = objectRecord(phase);
        const items = arrayValue(phaseRecord.items);
        return `
          <div class="phase">
            <div class="phase-title">${esc(phaseRecord.title ?? phaseRecord.key ?? 'Itinerary Phase')}</div>
            ${items.length === 0 ? '<div class="empty">No saved items in this phase.</div>' : items.map((entry) => {
              const item = objectRecord(entry);
              const warnings = arrayValue(item.warnings)
                .map((warning) => String(warning ?? '').trim())
                .filter(Boolean);
              return `
                <article class="row compact">
                  <div>
                    <div class="row-title">${esc(item.label ?? item.title ?? item.name ?? item.id ?? 'Itinerary item')}</div>
                    <div class="row-summary">${esc(item.summary ?? item.note ?? '')}</div>
                    <div class="meta">${esc(item.source ?? 'source unknown')} | ${esc(item.sourceState ?? item.source_state ?? 'state unknown')}</div>
                    ${warnings.map((warning) => `<div class="warning-line">${esc(warning)}</div>`).join('')}
                  </div>
                  ${item.confidence != null ? `<div class="status">${esc(item.confidence)}%</div>` : ''}
                </article>
              `;
            }).join('')}
          </div>
        `;
      }).join('')}
    </section>
  `;
}

function renderRouteMeta(route: unknown): string {
  const rows = readRouteMeta(route);
  if (rows.length === 0) return '';
  return `
    <section class="section">
      <div class="section-title">Route Context</div>
      <div class="meta-grid">
        ${rows.map((row) => `
          <div class="meta-card">
            <label>${esc(row.label)}</label>
            <span>${esc(row.value)}</span>
          </div>
        `).join('')}
      </div>
    </section>
  `;
}

function buildCss(): string {
  return `
    * { box-sizing: border-box; }
    @page { size: A4; margin: 0.55in; }
    body {
      margin: 0;
      background: ${C.bg};
      color: ${C.text};
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      font-size: 11px;
      line-height: 1.45;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .header {
      border-bottom: 2px solid ${C.amber};
      padding-bottom: 14px;
      margin-bottom: 14px;
      display: flex;
      justify-content: space-between;
      gap: 20px;
    }
    .brand {
      color: ${C.amber};
      font-size: 8px;
      font-weight: 900;
      letter-spacing: 4px;
      text-transform: uppercase;
    }
    h1 {
      margin: 3px 0 0;
      font-size: 20px;
      line-height: 1.15;
    }
    .generated {
      color: ${C.muted};
      text-align: right;
      font-family: 'Courier New', monospace;
      font-size: 8px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-bottom: 14px;
    }
    .stat, .meta-card {
      background: ${C.panel};
      border: 1px solid ${C.border};
      border-radius: 8px;
      padding: 9px;
    }
    .stat span {
      display: block;
      color: ${C.amber};
      font-weight: 900;
      font-size: 13px;
    }
    .stat label, .meta-card label {
      display: block;
      margin-top: 3px;
      color: ${C.muted};
      font-size: 7px;
      font-weight: 800;
      letter-spacing: 1.5px;
      text-transform: uppercase;
    }
    .section {
      margin-bottom: 14px;
      page-break-inside: avoid;
    }
    .section-title {
      color: ${C.amber};
      font-size: 9px;
      font-weight: 900;
      letter-spacing: 2px;
      text-transform: uppercase;
      margin: 0 0 7px;
    }
    .row {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      background: ${C.panelAlt};
      border: 1px solid ${C.border};
      border-radius: 8px;
      padding: 9px;
      margin-bottom: 7px;
      page-break-inside: avoid;
    }
    .row.compact { padding: 8px; }
    .row-title {
      font-weight: 900;
      font-size: 11px;
    }
    .row-summary {
      color: ${C.text};
      margin-top: 2px;
    }
    .meta {
      color: ${C.muted};
      margin-top: 3px;
      font-size: 8px;
      font-family: 'Courier New', monospace;
    }
    .status {
      min-width: 76px;
      align-self: flex-start;
      text-align: center;
      border: 1px solid ${C.border};
      border-radius: 999px;
      padding: 4px 7px;
      font-size: 7px;
      font-weight: 900;
      letter-spacing: 1px;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .warning, .warning-line {
      color: ${C.warning};
    }
    .warning {
      display: grid;
      gap: 3px;
      background: rgba(255,183,77,0.08);
      border: 1px solid rgba(255,183,77,0.24);
      border-radius: 8px;
      padding: 8px;
      margin-bottom: 6px;
    }
    .phase {
      margin-bottom: 10px;
    }
    .phase-title {
      color: ${C.text};
      font-weight: 900;
      margin: 0 0 5px;
    }
    .empty {
      color: ${C.muted};
      background: ${C.panelAlt};
      border: 1px solid ${C.border};
      border-radius: 8px;
      padding: 8px;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    }
    .meta-card span {
      display: block;
      margin-top: 4px;
      font-weight: 700;
    }
  `;
}

export function buildExploreTripManifestHtml(input: ExploreTripManifestExportInput): string {
  const generatedAt = input.generatedAt ?? input.manifest.generatedAt;
  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${esc(input.title)} - Explore Trip Manifest</title>
        <style>${buildCss()}</style>
      </head>
      <body>
        <header class="header">
          <div>
            <div class="brand">EXPLORE TRIP MANIFEST</div>
            <h1>${esc(input.title || input.manifest.routeName)}</h1>
          </div>
          <div class="generated">
            GENERATED<br />${esc(formatDateTime(generatedAt))}
          </div>
        </header>
        ${renderProgress(input.manifest)}
        ${renderRouteMeta(input.route)}
        ${renderItinerary(input.itinerary)}
        ${renderManifestItems(input.manifest)}
        ${renderErrors(input.manifest)}
      </body>
    </html>
  `;
}

function safeFileName(title: string): string {
  const cleaned = title.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `ECS_Explore_Trip_Manifest_${cleaned || 'Trip'}_${new Date().toISOString().slice(0, 10)}`;
}

export async function exportExploreTripManifestPdf(
  input: ExploreTripManifestExportInput,
): Promise<ExploreTripManifestExportResult> {
  try {
    const html = buildExploreTripManifestHtml(input);
    const fileName = safeFileName(input.title || input.manifest.routeName);
    if (Platform.OS === 'web') {
      return await exportWeb(html, fileName);
    }
    return await exportNative(html, fileName);
  } catch (error: any) {
    return { success: false, error: error?.message ?? 'Explore Trip manifest export failed.' };
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
      return { success: true };
    }
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `${fileName}.pdf`,
      UTI: 'com.adobe.pdf',
    });
    return { success: true };
  } catch (error: any) {
    try {
      const Print = await import('expo-print');
      await Print.printAsync({ html });
      return { success: true };
    } catch {
      return { success: false, error: error?.message ?? 'Native manifest export failed.' };
    }
  }
}

async function exportWeb(html: string, fileName: string): Promise<ExploreTripManifestExportResult> {
  try {
    try {
      const Print = await import('expo-print');
      await Print.printAsync({ html });
      return { success: true };
    } catch {
      // Browser fallback below.
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) return downloadHtmlAsFile(html, fileName);
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => {
      setTimeout(() => {
        try {
          printWindow.print();
        } catch {}
      }, 300);
    };
    setTimeout(() => {
      try {
        printWindow.print();
      } catch {}
    }, 600);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message ?? 'Web manifest export failed.' };
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
    return { success: true };
  } catch {
    return { success: false, error: 'Could not download manifest file.' };
  }
}
