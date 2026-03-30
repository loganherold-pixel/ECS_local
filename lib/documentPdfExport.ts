/**
 * Document PDF Export Engine
 *
 * Generates professionally branded ECS PDF documents from the
 * Documentation Center. Supports both System and Operational documents.
 *
 * Pipeline:
 *   1. buildDocumentPayload(docId, title, content, category)
 *   2. renderDocumentHtml(payload)
 *   3. exportDocumentPdf(payload) → generate PDF → share/save
 *
 * Uses expo-print (native) or browser print (web).
 * Share via expo-sharing (native) or blob download (web).
 */

import { Platform } from 'react-native';

// ── Types ────────────────────────────────────────────────────

export interface DocumentPayload {
  docId: string;
  title: string;
  content: string;
  category: 'system' | 'operational';
  filename: string;
}

export interface ExportResult {
  success: boolean;
  error?: string;
}

// ── ECS Branding Constants ───────────────────────────────────

const ECS_VERSION = 'v1.4.2';
const ECS_BUILD = '2026.02.22';
const ECS_PRODUCT = 'Expedition Command System';
const ECS_ORG = 'Expedition Command System';

const ECS_WATERMARK_URI = 'https://d64gsuwffb70l.cloudfront.net/696e98bf1e58953c5b50217c_1773071270019_96f5f11f.png';

// ── Color Constants (matching ECS tactical theme) ────────────

const C = {
  bg: '#0B0F12',
  panel: '#12181D',
  panelBorder: '#2A3830',
  amber: '#D4A017',
  amberLight: '#E0A030',
  amberDark: '#B8890F',
  text: '#E6E6E1',
  textMuted: '#8A8A85',
  textFaint: 'rgba(138, 138, 133, 0.5)',
  white: '#FFFFFF',
  darkCard: '#161E1A',
  goldBorder: 'rgba(212,160,23,0.25)',
  goldBg: 'rgba(212,160,23,0.04)',
};

// ── Helpers ──────────────────────────────────────────────────

function esc(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return '--'; }
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
  } catch { return '--'; }
}

// ── CSS ──────────────────────────────────────────────────────

function buildCSS(): string {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page {
      size: A4;
      margin: 0.6in 0.5in;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      background: ${C.bg};
      color: ${C.text};
      font-size: 10px;
      line-height: 1.6;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      position: relative;
      min-height: 100vh;
    }

    /* ── Watermark ─────────────────────────── */
    .watermark {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 320px;
      height: 320px;
      opacity: 0.04;
      pointer-events: none;
      z-index: 0;
    }

    /* ── Container ─────────────────────────── */
    .container {
      position: relative;
      z-index: 1;
      padding: 0;
    }

    /* ── Header ─────────────────────────────── */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 16px;
      border-bottom: 2px solid ${C.amber};
      margin-bottom: 20px;
    }
    .header-left { flex: 1; }
    .header-brand {
      font-size: 7px;
      font-weight: 800;
      letter-spacing: 6px;
      color: ${C.amber};
      text-transform: uppercase;
      margin-bottom: 6px;
    }
    .header-title {
      font-size: 18px;
      font-weight: 800;
      color: ${C.text};
      letter-spacing: 1px;
      margin-bottom: 4px;
    }
    .header-category {
      font-size: 8px;
      font-weight: 700;
      letter-spacing: 3px;
      text-transform: uppercase;
      color: ${C.amber};
      margin-bottom: 2px;
    }
    .header-right {
      text-align: right;
    }
    .header-version {
      font-size: 8px;
      font-weight: 700;
      color: ${C.textMuted};
      font-family: 'Courier New', Courier, monospace;
      letter-spacing: 1px;
    }
    .header-build {
      font-size: 7px;
      color: ${C.textFaint};
      font-family: 'Courier New', Courier, monospace;
      margin-top: 2px;
    }
    .generated-at {
      font-size: 7px;
      color: ${C.textMuted};
      margin-top: 6px;
      font-family: 'Courier New', Courier, monospace;
    }

    /* ── Version Bar ────────────────────────── */
    .version-bar {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 6px 0;
      background: ${C.goldBg};
      border: 1px solid ${C.goldBorder};
      border-radius: 6px;
      margin-bottom: 20px;
    }
    .version-dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: ${C.amber};
      opacity: 0.6;
    }
    .version-text {
      font-size: 8px;
      font-weight: 700;
      color: ${C.textMuted};
      letter-spacing: 1px;
    }

    /* ── Document Content ───────────────────── */
    .document-content {
      background: ${C.darkCard};
      border: 1px solid ${C.panelBorder};
      border-radius: 8px;
      padding: 24px;
      margin-bottom: 20px;
    }
    .document-text {
      font-size: 10px;
      font-weight: 400;
      color: rgba(230, 230, 225, 0.9);
      line-height: 1.8;
      font-family: 'Courier New', Courier, monospace;
      letter-spacing: 0.3px;
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    /* ── Disclaimer Bar ─────────────────────── */
    .disclaimer-bar {
      background: rgba(239,83,80,0.04);
      border: 1px solid rgba(239,83,80,0.12);
      border-radius: 6px;
      padding: 10px 14px;
      margin-bottom: 16px;
    }
    .disclaimer-text {
      font-size: 8px;
      color: ${C.textMuted};
      line-height: 1.5;
      font-style: italic;
    }

    /* ── Footer ─────────────────────────────── */
    .footer {
      margin-top: 24px;
      padding-top: 12px;
      border-top: 1px solid ${C.panelBorder};
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .footer-left {
      font-size: 7px;
      color: ${C.textMuted};
      letter-spacing: 3px;
      text-transform: uppercase;
    }
    .footer-right {
      font-size: 7px;
      color: ${C.textMuted};
      font-family: 'Courier New', Courier, monospace;
    }
    .footer-center {
      font-size: 7px;
      color: ${C.textFaint};
      text-align: center;
    }
  `;
}

// ── HTML Builder ─────────────────────────────────────────────

function buildDocumentHtml(payload: DocumentPayload): string {
  const now = new Date();
  const categoryLabel = payload.category === 'system' ? 'SYSTEM DOCUMENT' : 'OPERATIONAL DOCUMENT';

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${esc(payload.title)} — ${ECS_PRODUCT}</title>
      <style>${buildCSS()}</style>
    </head>
    <body>
      <img class="watermark" src="${ECS_WATERMARK_URI}" alt="" />

      <div class="container">
        <!-- Header -->
        <div class="header">
          <div class="header-left">
            <div class="header-brand">${esc(ECS_ORG)}</div>
            <div class="header-category">${esc(categoryLabel)}</div>
            <div class="header-title">${esc(payload.title)}</div>
          </div>
          <div class="header-right">
            <div class="header-version">${esc(ECS_PRODUCT)} ${esc(ECS_VERSION)}</div>
            <div class="header-build">Build ${esc(ECS_BUILD)}</div>
            <div class="generated-at">Generated ${fmtDate(now.toISOString())} at ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        </div>

        <!-- Version Bar -->
        <div class="version-bar">
          <div class="version-dot"></div>
          <span class="version-text">${esc(ECS_PRODUCT)} ${esc(ECS_VERSION)}</span>
        </div>

        <!-- Document Content -->
        <div class="document-content">
          <div class="document-text">${esc(payload.content)}</div>
        </div>

        <!-- Disclaimer -->
        <div class="disclaimer-bar">
          <div class="disclaimer-text">
            ACCURACY DISCLAIMER: This document is generated by ${esc(ECS_PRODUCT)} for planning purposes only.
            All data should be independently verified before use in field operations. See full disclaimer for details.
          </div>
        </div>

        <!-- Footer -->
        <div class="footer">
          <div class="footer-left">${esc(ECS_ORG)}</div>
          <div class="footer-center">Document ID: ecs-${esc(payload.docId)}</div>
          <div class="footer-right">${fmtDateTime(now.toISOString())}</div>
        </div>
      </div>
    </body>
    </html>
  `;
}

// ── Payload Builder ──────────────────────────────────────────

export function buildDocumentPayload(
  docId: string,
  title: string,
  content: string,
  category: 'system' | 'operational',
): DocumentPayload {
  const sanitizedTitle = title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
  const dateSuffix = new Date().toISOString().split('T')[0];
  return {
    docId,
    title,
    content,
    category,
    filename: `ECS_${sanitizedTitle}_${dateSuffix}`,
  };
}

// ── Export Functions ──────────────────────────────────────────

/**
 * Generate a PDF from document data and trigger share/download.
 *
 * Native (iOS/Android): Uses expo-print to generate PDF file, then expo-sharing to open share sheet.
 * Web: Opens a new window with the HTML and triggers browser print dialog.
 */
export async function exportDocumentPdf(payload: DocumentPayload): Promise<ExportResult> {
  try {
    const html = buildDocumentHtml(payload);

    if (Platform.OS === 'web') {
      return await exportWeb(html, payload.filename);
    } else {
      return await exportNative(html, payload.filename);
    }
  } catch (err: any) {
    console.error('[DocumentPdfExport] Export failed:', err);
    return { success: false, error: err.message || 'PDF export failed' };
  }
}

async function exportNative(html: string, fileName: string): Promise<ExportResult> {
  try {
    // Dynamic imports to avoid bundling issues on web
    const Print = await import('expo-print');
    const Sharing = await import('expo-sharing');

    // Generate PDF file
    const { uri } = await Print.printToFileAsync({
      html,
      base64: false,
    });

    // Check if sharing is available
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      // Fallback: just print
      await Print.printAsync({ html });
      return { success: true };
    }

    // Share the PDF
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `${fileName}.pdf`,
      UTI: 'com.adobe.pdf',
    });

    return { success: true };
  } catch (err: any) {
    // If expo-print/sharing aren't available, try print fallback
    try {
      const Print = await import('expo-print');
      await Print.printAsync({ html });
      return { success: true };
    } catch {
      return { success: false, error: err.message || 'Native PDF export failed' };
    }
  }
}

async function exportWeb(html: string, fileName: string): Promise<ExportResult> {
  try {
    // Try expo-print first (works on web too in some configurations)
    try {
      const Print = await import('expo-print');
      await Print.printAsync({ html });
      return { success: true };
    } catch {
      // Fallback to window.print approach
    }

    // Fallback: open in new window and trigger print
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      // Popup blocked — fallback to blob download
      return downloadHtmlAsFile(html, fileName);
    }

    printWindow.document.write(html);
    printWindow.document.close();

    // Wait for content to load, then trigger print
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
      }, 300);
    };

    // Also trigger after a short delay in case onload already fired
    setTimeout(() => {
      try { printWindow.print(); } catch {}
    }, 600);

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Web PDF export failed' };
  }
}

function downloadHtmlAsFile(html: string, fileName: string): ExportResult {
  try {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: 'Could not download file' };
  }
}

/**
 * Get the raw HTML string for preview or debugging.
 */
export function getDocumentHtmlPreview(payload: DocumentPayload): string {
  return buildDocumentHtml(payload);
}

