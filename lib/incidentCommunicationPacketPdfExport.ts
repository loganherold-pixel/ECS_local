import type { IncidentContext } from './types/incidentRecovery';
import type { IncidentCommunicationPacketAudience } from './incidentCommunicationPacket';

export type IncidentPacketPdfAudience = IncidentCommunicationPacketAudience | 'all';

export type IncidentPacketPdfExportResult = {
  success: boolean;
  uri?: string;
  error?: string;
};

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cleanFilePart(value: unknown): string {
  const cleaned = String(value ?? '')
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return cleaned || 'incident-packet';
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function getPacketText(incident: IncidentContext, audience: IncidentPacketPdfAudience): string {
  const packet = incident.communicationPacket;
  if (!packet) return '';
  if (audience === 'all') return packet.packetText ?? '';
  return packet.audiencePackets?.find((item) => item.audience === audience)?.text ?? '';
}

function getAudienceLabel(incident: IncidentContext, audience: IncidentPacketPdfAudience): string {
  if (audience === 'all') return 'All recipients';
  return incident.communicationPacket?.audiencePackets?.find((item) => item.audience === audience)?.label ?? audience;
}

export function buildIncidentPacketPdfHtml(
  incident: IncidentContext,
  audience: IncidentPacketPdfAudience = 'all',
): string {
  const packetText = getPacketText(incident, audience);
  const lines = packetText.split('\n');
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body {
      margin: 0;
      padding: 28px;
      background: #f6f3ea;
      color: #121417;
      font-family: Arial, Helvetica, sans-serif;
    }
    .shell {
      border: 2px solid #9b7220;
      padding: 22px;
      background: #fffdf7;
    }
    .eyebrow {
      color: #7b5817;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 1.8px;
      text-transform: uppercase;
    }
    h1 {
      margin: 5px 0 12px;
      font-size: 22px;
      letter-spacing: 0.4px;
    }
    .meta {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-bottom: 18px;
      font-size: 11px;
    }
    .meta div {
      border: 1px solid #dac27a;
      background: #fbf5e3;
      padding: 8px;
    }
    .packet {
      border-top: 1px solid #caa441;
      padding-top: 14px;
      font-size: 12px;
      line-height: 1.45;
      white-space: pre-wrap;
    }
    .line {
      margin: 0 0 7px;
    }
    .disclaimer {
      margin-top: 18px;
      padding-top: 12px;
      border-top: 1px solid #dac27a;
      color: #5d5646;
      font-size: 10px;
      line-height: 1.35;
    }
  </style>
</head>
<body>
  <main class="shell">
    <div class="eyebrow">ECS Incident & Recovery</div>
    <h1>Communication Packet</h1>
    <section class="meta">
      <div><strong>Incident:</strong> ${escapeHtml(incident.title)}</div>
      <div><strong>Status:</strong> ${escapeHtml(incident.status)}</div>
      <div><strong>Severity:</strong> ${escapeHtml(incident.communicationPacket?.severity ?? incident.severity)}</div>
      <div><strong>Audience:</strong> ${escapeHtml(getAudienceLabel(incident, audience))}</div>
      <div><strong>Location:</strong> ${escapeHtml(incident.locationLabel ?? incident.routeLabel ?? 'Unknown')}</div>
      <div><strong>Updated:</strong> ${escapeHtml(formatDateTime(incident.updatedAt ?? incident.reportedAt))}</div>
    </section>
    <section class="packet">
      ${lines.map((line) => `<p class="line">${escapeHtml(line || ' ')}</p>`).join('')}
    </section>
    <p class="disclaimer">
      This packet is generated from ECS incident data and user-entered information. It does not replace contacting emergency services, recovery professionals, or local authorities.
    </p>
  </main>
</body>
</html>`;
}

export async function exportIncidentCommunicationPacketPdf(
  incident: IncidentContext,
  audience: IncidentPacketPdfAudience = 'all',
): Promise<IncidentPacketPdfExportResult> {
  try {
    const packetText = getPacketText(incident, audience);
    if (!packetText.trim()) {
      return { success: false, error: 'Communication packet is empty.' };
    }

    const Print = await import('expo-print');
    const Sharing = await import('expo-sharing');
    const { uri } = await Print.printToFileAsync({
      html: buildIncidentPacketPdfHtml(incident, audience),
      base64: false,
    });
    const shareAvailable = await Sharing.isAvailableAsync();
    if (shareAvailable) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'ECS Incident Communication Packet',
        UTI: 'com.adobe.pdf',
      });
    }
    return { success: true, uri };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'PDF export failed.',
    };
  }
}

export function buildIncidentPacketPdfFileName(incident: IncidentContext): string {
  return `ecs-${cleanFilePart(incident.title)}-${cleanFilePart(incident.id)}.pdf`;
}
