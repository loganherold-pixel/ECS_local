/**
 * AAR PDF Export Engine
 *
 * Generates a professionally formatted PDF from After Action Review data
 * using expo-print (native) or browser print (web).
 *
 * Sections:
 *   1. Cover / Header — expedition title, dates, outcome badge
 *   2. Performance Summary — fuel/water/power deltas, system checks
 *   3. Risk & Incidents — severity breakdown, critical highlights
 *   4. Recommendations — rule-based items
 *   5. AI Analysis (if available) — patterns, trends, optimizations, grade
 *
 * Share/download via expo-sharing (native) or blob download (web).
 */

import { Platform } from 'react-native';
import type {
  AARReport,
  AARPerformanceSummary,
  AARRiskSummary,
  AIAnalysis,
} from './debriefStore';

// ── Types ────────────────────────────────────────────────────

interface ExportInput {
  expedition: {
    id: string;
    title?: string;
    start_at?: string;
    end_at?: string;
    status?: string;
  };
  aar: AARReport;
  aiAnalysis?: AIAnalysis | null;
}

// ── Color Constants (matching ECS tactical theme) ────────────

const C = {
  bg: '#0B0F12',
  panel: '#12181D',
  panelBorder: '#2A3830',
  amber: '#C48A2C',
  amberLight: '#E0A030',
  text: '#E6E6E1',
  textMuted: '#8A8A85',
  success: '#66BB6A',
  warning: '#FF9500',
  warningLight: '#FFB74D',
  danger: '#EF5350',
  info: '#42A5F5',
  purple: '#B388FF',
  purpleBg: 'rgba(179,136,255,0.08)',
  white: '#FFFFFF',
  darkCard: '#161E1A',
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

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '--';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch { return '--'; }
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '--';
  try {
    return new Date(iso).toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return '--'; }
}

function deltaColor(val: number): string {
  if (val < 0) return C.danger;
  if (val > 0) return C.success;
  return C.textMuted;
}

function deltaSign(val: number): string {
  return val > 0 ? `+${val}` : `${val}`;
}

function outcomeColor(outcome: string): string {
  if (outcome === 'SUCCESS') return C.success;
  if (outcome === 'MODIFIED') return C.warningLight;
  return C.danger;
}

function severityColor(sev: string): string {
  switch (sev) {
    case 'CRITICAL': return C.danger;
    case 'HIGH': return C.warning;
    case 'MED': return C.warningLight;
    case 'LOW': return C.success;
    default: return C.textMuted;
  }
}

function gradeColor(grade: string): string {
  switch (grade) {
    case 'A': return C.success;
    case 'B': return '#81C784';
    case 'C': return C.warningLight;
    case 'D': return C.warning;
    default: return C.danger;
  }
}

function riskScoreColor(score: number): string {
  if (score <= 3) return C.success;
  if (score <= 5) return C.warningLight;
  if (score <= 7) return C.warning;
  return C.danger;
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
      line-height: 1.5;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* ── Header ─────────────────────────────── */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 14px;
      border-bottom: 2px solid ${C.amber};
      margin-bottom: 16px;
    }
    .header-left { flex: 1; }
    .header-brand {
      font-size: 7px;
      font-weight: 800;
      letter-spacing: 6px;
      color: ${C.amber};
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .header-title {
      font-size: 18px;
      font-weight: 800;
      color: ${C.text};
      letter-spacing: 1px;
      margin-bottom: 2px;
    }
    .header-dates {
      font-size: 9px;
      color: ${C.textMuted};
      font-family: 'Courier New', Courier, monospace;
    }
    .header-right { text-align: right; }
    .outcome-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 6px;
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 2px;
    }
    .generated-at {
      font-size: 7px;
      color: ${C.textMuted};
      margin-top: 4px;
      font-family: 'Courier New', Courier, monospace;
    }

    /* ── Section ────────────────────────────── */
    .section {
      margin-bottom: 14px;
      page-break-inside: avoid;
    }
    .section-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }
    .section-icon {
      width: 22px;
      height: 22px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
    }
    .section-title {
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 3px;
      text-transform: uppercase;
    }
    .section-count {
      font-size: 8px;
      color: ${C.textMuted};
      font-family: 'Courier New', Courier, monospace;
      margin-left: auto;
    }

    /* ── Card ───────────────────────────────── */
    .card {
      background: ${C.darkCard};
      border: 1px solid ${C.panelBorder};
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 8px;
    }

    /* ── Stat Grid ──────────────────────────── */
    .stat-grid {
      display: flex;
      gap: 8px;
      margin-bottom: 8px;
    }
    .stat-box {
      flex: 1;
      background: rgba(0,0,0,0.25);
      border-radius: 6px;
      padding: 8px;
      text-align: center;
    }
    .stat-label {
      font-size: 7px;
      font-weight: 700;
      letter-spacing: 2px;
      text-transform: uppercase;
      margin-bottom: 2px;
    }
    .stat-value {
      font-size: 16px;
      font-weight: 800;
      font-family: 'Courier New', Courier, monospace;
    }

    /* ── Check Row ──────────────────────────── */
    .check-row {
      display: flex;
      gap: 6px;
    }
    .check-badge {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 5px 0;
      border-radius: 5px;
      font-size: 8px;
      font-weight: 700;
    }
    .check-icon {
      font-size: 10px;
      font-weight: 900;
    }

    /* ── Risk Grid ──────────────────────────── */
    .risk-grid {
      display: flex;
      gap: 6px;
      margin-bottom: 8px;
    }
    .risk-stat {
      flex: 1;
      background: rgba(0,0,0,0.25);
      border-radius: 6px;
      padding: 8px;
      text-align: center;
    }
    .risk-num {
      font-size: 18px;
      font-weight: 800;
      font-family: 'Courier New', Courier, monospace;
    }
    .risk-label {
      font-size: 7px;
      font-weight: 700;
      letter-spacing: 1px;
      color: ${C.textMuted};
    }

    /* ── Incident Row ───────────────────────── */
    .incident-row {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 6px 0;
      border-bottom: 1px solid rgba(62,79,60,0.1);
    }
    .incident-row:last-child { border-bottom: none; }
    .incident-badge {
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 7px;
      font-weight: 800;
      letter-spacing: 0.5px;
      white-space: nowrap;
    }
    .incident-type {
      font-size: 7px;
      font-weight: 700;
      letter-spacing: 1px;
      padding: 2px 5px;
      border-radius: 3px;
      background: rgba(0,0,0,0.3);
      color: ${C.textMuted};
      white-space: nowrap;
    }
    .incident-text {
      font-size: 9px;
      color: ${C.text};
      flex: 1;
      line-height: 1.4;
    }
    .incident-time {
      font-size: 7px;
      color: ${C.textMuted};
      font-family: 'Courier New', Courier, monospace;
      white-space: nowrap;
    }

    /* ── Recommendation Row ─────────────────── */
    .rec-row {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      margin-bottom: 8px;
    }
    .rec-num {
      width: 20px;
      height: 20px;
      border-radius: 5px;
      background: rgba(196,138,44,0.1);
      border: 1px solid rgba(196,138,44,0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      font-weight: 800;
      color: ${C.amber};
      flex-shrink: 0;
    }
    .rec-text {
      font-size: 10px;
      color: ${C.text};
      line-height: 1.5;
      flex: 1;
    }

    /* ── AI Section ─────────────────────────── */
    .ai-header-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
    }
    .ai-grade-card {
      width: 56px;
      text-align: center;
      background: ${C.purpleBg};
      border: 1px solid rgba(179,136,255,0.15);
      border-radius: 8px;
      padding: 8px;
    }
    .ai-grade-label {
      font-size: 6px;
      font-weight: 700;
      color: ${C.textMuted};
      letter-spacing: 2px;
    }
    .ai-grade-value {
      font-size: 24px;
      font-weight: 900;
    }
    .ai-risk-card {
      flex: 1;
      background: rgba(0,0,0,0.2);
      border: 1px solid ${C.panelBorder};
      border-radius: 8px;
      padding: 8px;
    }
    .ai-risk-label {
      font-size: 6px;
      font-weight: 700;
      color: ${C.textMuted};
      letter-spacing: 2px;
      margin-bottom: 4px;
    }
    .ai-risk-bar {
      height: 6px;
      border-radius: 3px;
      background: rgba(0,0,0,0.3);
      overflow: hidden;
      margin-bottom: 4px;
    }
    .ai-risk-fill {
      height: 100%;
      border-radius: 3px;
    }
    .ai-risk-value {
      font-size: 12px;
      font-weight: 800;
      font-family: 'Courier New', Courier, monospace;
      color: ${C.text};
    }
    .ai-summary-box {
      background: ${C.purpleBg};
      border: 1px solid rgba(179,136,255,0.1);
      border-radius: 6px;
      padding: 10px;
      margin-bottom: 10px;
    }
    .ai-summary-text {
      font-size: 10px;
      color: ${C.text};
      line-height: 1.5;
      margin-bottom: 4px;
    }
    .ai-meta {
      font-size: 7px;
      color: ${C.textMuted};
      font-family: 'Courier New', Courier, monospace;
      opacity: 0.7;
    }
    .ai-subsection {
      font-size: 8px;
      font-weight: 800;
      letter-spacing: 2px;
      margin-top: 10px;
      margin-bottom: 6px;
    }
    .ai-item-card {
      background: rgba(179,136,255,0.03);
      border: 1px solid rgba(179,136,255,0.1);
      border-radius: 6px;
      padding: 8px;
      margin-bottom: 5px;
    }
    .ai-item-header {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 3px;
    }
    .ai-badge {
      padding: 1px 4px;
      border-radius: 3px;
      background: rgba(179,136,255,0.15);
      border: 1px solid rgba(179,136,255,0.3);
      font-size: 6px;
      font-weight: 900;
      color: ${C.purple};
      letter-spacing: 1px;
    }
    .ai-item-title {
      font-size: 10px;
      font-weight: 700;
      color: ${C.text};
      flex: 1;
    }
    .ai-item-detail {
      font-size: 9px;
      color: ${C.textMuted};
      line-height: 1.4;
      padding-left: 2px;
    }
    .severity-pill {
      padding: 1px 5px;
      border-radius: 3px;
      font-size: 7px;
      font-weight: 800;
      letter-spacing: 0.5px;
    }
    .trend-pill {
      padding: 1px 5px;
      border-radius: 3px;
      font-size: 7px;
      font-weight: 800;
      letter-spacing: 0.5px;
    }

    /* ── Footer ─────────────────────────────── */
    .footer {
      margin-top: 20px;
      padding-top: 10px;
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

    /* ── Type Breakdown Table ───────────────── */
    .type-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 8px;
    }
    .type-table td {
      padding: 4px 8px;
      font-size: 9px;
      border-bottom: 1px solid rgba(62,79,60,0.1);
    }
    .type-table td:first-child {
      font-weight: 700;
      letter-spacing: 1px;
      width: 100px;
    }
    .type-table td:last-child {
      text-align: right;
      font-family: 'Courier New', Courier, monospace;
      font-weight: 700;
    }

    /* ── Divider ────────────────────────────── */
    .divider {
      height: 1px;
      background: rgba(62,79,60,0.15);
      margin: 8px 0;
    }

    /* ── Debrief Notes ──────────────────────── */
    .notes-grid {
      display: flex;
      gap: 8px;
    }
    .notes-card {
      flex: 1;
      background: rgba(0,0,0,0.2);
      border-radius: 6px;
      padding: 8px;
    }
    .notes-label {
      font-size: 7px;
      font-weight: 700;
      letter-spacing: 2px;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .notes-text {
      font-size: 9px;
      color: ${C.text};
      line-height: 1.4;
    }
  `;
}

// ── HTML Builders ────────────────────────────────────────────

function buildHeader(input: ExportInput): string {
  const { expedition, aar } = input;
  const perf = aar.performance_summary as AARPerformanceSummary;
  const oc = outcomeColor(perf.outcome);

  return `
    <div class="header">
      <div class="header-left">
        <div class="header-brand">Expedition Command System</div>
        <div class="header-title">${esc(expedition.title) || 'Expedition'} — After Action Review</div>
        <div class="header-dates">
          ${fmtDate(expedition.start_at)}${expedition.end_at ? ` — ${fmtDate(expedition.end_at)}` : ''}
        </div>
      </div>
      <div class="header-right">
        <span class="outcome-badge" style="background: ${oc}18; color: ${oc};">${esc(perf.outcome)}</span>
        <div class="generated-at">Generated ${fmtDateTime(new Date().toISOString())}</div>
      </div>
    </div>
  `;
}

function buildPerformanceSection(perf: AARPerformanceSummary): string {
  const checkHtml = (label: string, ok: boolean) => {
    const color = ok ? C.success : C.danger;
    const icon = ok ? '&#10003;' : '&#10007;';
    const bg = ok ? 'rgba(102,187,106,0.08)' : 'rgba(239,83,80,0.08)';
    return `
      <div class="check-badge" style="background: ${bg}; color: ${color};">
        <span class="check-icon">${icon}</span>
        ${esc(label)}
      </div>
    `;
  };

  return `
    <div class="section">
      <div class="section-header">
        <div class="section-icon" style="background: rgba(196,138,44,0.08);">
          <span style="color: ${C.amber};">&#9670;</span>
        </div>
        <span class="section-title" style="color: ${C.amber};">Performance Summary</span>
      </div>
      <div class="card">
        ${perf.outcome_reason ? `<div style="font-size: 9px; color: ${C.textMuted}; margin-bottom: 8px;"><strong>Reason:</strong> ${esc(perf.outcome_reason)}</div>` : ''}
        <div class="stat-grid">
          <div class="stat-box">
            <div class="stat-label" style="color: ${C.warning};">FUEL</div>
            <div class="stat-value" style="color: ${deltaColor(perf.fuel_delta_pct)};">${deltaSign(perf.fuel_delta_pct)}%</div>
          </div>
          <div class="stat-box">
            <div class="stat-label" style="color: ${C.info};">WATER</div>
            <div class="stat-value" style="color: ${deltaColor(perf.water_delta_pct)};">${deltaSign(perf.water_delta_pct)}%</div>
          </div>
          <div class="stat-box">
            <div class="stat-label" style="color: ${C.success};">POWER</div>
            <div class="stat-value" style="color: ${deltaColor(perf.power_delta_pct)};">${deltaSign(perf.power_delta_pct)}%</div>
          </div>
        </div>
        <div class="check-row">
          ${checkHtml('Consumables', perf.consumables_matched_plan)}
          ${checkHtml('Vehicle', perf.vehicle_performed_expected)}
          ${checkHtml('Route', perf.route_matched_expected)}
        </div>
      </div>
    </div>
  `;
}

function buildRiskSection(risk: AARRiskSummary): string {
  const highlightsHtml = (risk.critical_highlights || []).map(h => {
    const sc = severityColor(h.severity);
    return `
      <div class="incident-row">
        <span class="incident-badge" style="background: ${sc}18; color: ${sc};">${esc(h.severity)}</span>
        ${h.type ? `<span class="incident-type">${esc(h.type)}</span>` : ''}
        <span class="incident-text">${esc(h.details)}</span>
        ${h.time ? `<span class="incident-time">${fmtDateTime(h.time)}</span>` : ''}
      </div>
    `;
  }).join('');

  const typeRows = Object.entries(risk.type_counts || {}).map(([type, count]) => `
    <tr>
      <td style="color: ${C.textMuted};">${esc(type)}</td>
      <td style="color: ${C.text};">${count}</td>
    </tr>
  `).join('');

  return `
    <div class="section">
      <div class="section-header">
        <div class="section-icon" style="background: rgba(239,83,80,0.08);">
          <span style="color: ${C.danger};">&#9888;</span>
        </div>
        <span class="section-title" style="color: ${C.danger};">Risk &amp; Incidents</span>
        <span class="section-count">${risk.total_events} events</span>
      </div>
      <div class="card">
        <div class="risk-grid">
          <div class="risk-stat">
            <div class="risk-num" style="color: ${C.danger};">${risk.critical_count}</div>
            <div class="risk-label">CRITICAL</div>
          </div>
          <div class="risk-stat">
            <div class="risk-num" style="color: ${C.warning};">${risk.high_count}</div>
            <div class="risk-label">HIGH</div>
          </div>
          <div class="risk-stat">
            <div class="risk-num" style="color: ${C.warningLight};">${risk.severity_counts?.MED || 0}</div>
            <div class="risk-label">MED</div>
          </div>
          <div class="risk-stat">
            <div class="risk-num" style="color: ${C.success};">${risk.severity_counts?.LOW || 0}</div>
            <div class="risk-label">LOW</div>
          </div>
        </div>
        ${typeRows ? `
          <div class="divider"></div>
          <div style="font-size: 7px; font-weight: 700; letter-spacing: 2px; color: ${C.textMuted}; margin-bottom: 4px;">EVENT TYPE BREAKDOWN</div>
          <table class="type-table">${typeRows}</table>
        ` : ''}
        ${highlightsHtml ? `
          <div class="divider"></div>
          <div style="font-size: 7px; font-weight: 700; letter-spacing: 2px; color: ${C.textMuted}; margin-bottom: 4px;">CRITICAL / HIGH INCIDENTS</div>
          ${highlightsHtml}
        ` : ''}
      </div>
    </div>
  `;
}

function buildRecommendationsSection(recs: string[]): string {
  if (!recs || recs.length === 0) return '';

  const recsHtml = recs.map((rec, idx) => `
    <div class="rec-row">
      <div class="rec-num">${idx + 1}</div>
      <div class="rec-text">${esc(rec)}</div>
    </div>
  `).join('');

  return `
    <div class="section">
      <div class="section-header">
        <div class="section-icon" style="background: rgba(102,187,106,0.08);">
          <span style="color: ${C.success};">&#9733;</span>
        </div>
        <span class="section-title" style="color: ${C.success};">Recommendations</span>
        <span class="section-count">${recs.length} items</span>
      </div>
      <div class="card">
        ${recsHtml}
      </div>
    </div>
  `;
}

function buildAISection(ai: AIAnalysis): string {
  const gc = gradeColor(ai.expedition_grade);
  const rsc = riskScoreColor(ai.overall_risk_score);

  // Pattern Analysis
  const patternsHtml = (ai.pattern_analysis || []).map(p => {
    const sc = severityColor(p.severity);
    return `
      <div class="ai-item-card">
        <div class="ai-item-header">
          <span class="ai-badge">AI</span>
          <span class="ai-item-title">${esc(p.title)}</span>
          <span class="severity-pill" style="background: ${sc}18; color: ${sc};">${esc(p.severity)}</span>
        </div>
        <div class="ai-item-detail">${esc(p.detail)}</div>
      </div>
    `;
  }).join('');

  // Risk Trends
  const trendsHtml = (ai.risk_trends || []).map(t => {
    const tc = t.trend === 'IMPROVING' ? C.success : t.trend === 'WORSENING' ? C.danger : C.warningLight;
    const arrow = t.trend === 'IMPROVING' ? '&#8600;' : t.trend === 'WORSENING' ? '&#8599;' : '&#8594;';
    return `
      <div class="ai-item-card">
        <div class="ai-item-header">
          <span style="color: ${tc}; font-size: 12px;">${arrow}</span>
          <span class="ai-item-title">${esc(t.title)}</span>
          <span class="trend-pill" style="background: ${tc}15; color: ${tc};">${esc(t.trend)}</span>
        </div>
        <div class="ai-item-detail">${esc(t.detail)}</div>
      </div>
    `;
  }).join('');

  // Resource Optimization
  const resourceHtml = (ai.resource_optimization || []).map(r => `
    <div class="ai-item-card">
      <div class="ai-item-header">
        <span class="ai-badge">AI</span>
        <span class="ai-item-title">${esc(r.title)}</span>
      </div>
      <div class="ai-item-detail">${esc(r.detail)}</div>
    </div>
  `).join('');

  // Route Improvements
  const routeHtml = (ai.route_improvements || []).map(r => `
    <div class="ai-item-card">
      <div class="ai-item-header">
        <span class="ai-badge">AI</span>
        <span class="ai-item-title">${esc(r.title)}</span>
      </div>
      <div class="ai-item-detail">${esc(r.detail)}</div>
    </div>
  `).join('');

  // Critical Insights
  const insightsHtml = (ai.critical_insights || []).map(insight => `
    <div style="display: flex; align-items: flex-start; gap: 8px; margin-bottom: 6px; background: rgba(239,83,80,0.04); border-radius: 5px; padding: 6px 8px; border: 1px solid rgba(239,83,80,0.1);">
      <span class="ai-badge">AI</span>
      <span style="font-size: 9px; color: ${C.danger}; flex: 1; line-height: 1.4;">${esc(insight)}</span>
    </div>
  `).join('');

  return `
    <div class="section" style="page-break-before: auto;">
      <div class="section-header">
        <div class="section-icon" style="background: ${C.purpleBg};">
          <span style="color: ${C.purple};">&#10024;</span>
        </div>
        <span class="section-title" style="color: ${C.purple};">AI Expedition Analysis</span>
      </div>
      <div class="card" style="border-color: rgba(179,136,255,0.18);">
        <div class="ai-header-row">
          <div class="ai-grade-card">
            <div class="ai-grade-label">GRADE</div>
            <div class="ai-grade-value" style="color: ${gc};">${esc(ai.expedition_grade)}</div>
          </div>
          <div class="ai-risk-card">
            <div class="ai-risk-label">OVERALL RISK SCORE</div>
            <div class="ai-risk-bar">
              <div class="ai-risk-fill" style="width: ${ai.overall_risk_score * 10}%; background: ${rsc};"></div>
            </div>
            <div class="ai-risk-value" style="color: ${rsc};">${ai.overall_risk_score}/10</div>
          </div>
        </div>

        <div class="ai-summary-box">
          <div class="ai-summary-text">${esc(ai.summary)}</div>
          <div class="ai-meta">Model: ${esc(ai.model)} &middot; ${ai.event_count} events analyzed &middot; ${fmtDateTime(ai.generated_at)}</div>
        </div>

        ${insightsHtml ? `
          <div class="ai-subsection" style="color: ${C.danger};">CRITICAL INSIGHTS</div>
          ${insightsHtml}
        ` : ''}

        ${patternsHtml ? `
          <div class="ai-subsection" style="color: ${C.purple};">PATTERN ANALYSIS</div>
          ${patternsHtml}
        ` : ''}

        ${trendsHtml ? `
          <div class="ai-subsection" style="color: ${C.warning};">RISK TRENDS</div>
          ${trendsHtml}
        ` : ''}

        ${resourceHtml ? `
          <div class="ai-subsection" style="color: ${C.info};">RESOURCE OPTIMIZATION</div>
          ${resourceHtml}
        ` : ''}

        ${routeHtml ? `
          <div class="ai-subsection" style="color: ${C.success};">ROUTE IMPROVEMENTS</div>
          ${routeHtml}
        ` : ''}
      </div>
    </div>
  `;
}

function buildFooter(expedition: ExportInput['expedition']): string {
  return `
    <div class="footer">
      <div class="footer-left">Expedition Command System &mdash; After Action Review</div>
      <div class="footer-right">ID: ${esc(expedition.id?.substring(0, 8))}... &middot; ${fmtDateTime(new Date().toISOString())}</div>
    </div>
  `;
}

// ── Main HTML Builder ────────────────────────────────────────

function buildAARHtml(input: ExportInput): string {
  const { aar, aiAnalysis } = input;
  const perf = aar.performance_summary as AARPerformanceSummary;
  const risk = aar.risk_summary as AARRiskSummary;
  const recs = aar.recommendations || [];

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>AAR — ${esc(input.expedition.title) || 'Expedition'}</title>
      <style>${buildCSS()}</style>
    </head>
    <body>
      ${buildHeader(input)}
      ${buildPerformanceSection(perf)}
      ${buildRiskSection(risk)}
      ${buildRecommendationsSection(recs)}
      ${aiAnalysis ? buildAISection(aiAnalysis) : ''}
      ${buildFooter(input.expedition)}
    </body>
    </html>
  `;
}

// ── Export Functions ──────────────────────────────────────────

/**
 * Generate a PDF from AAR data and trigger share/download.
 *
 * Native (iOS/Android): Uses expo-print to generate PDF file, then expo-sharing to open share sheet.
 * Web: Opens a new window with the HTML and triggers browser print dialog.
 */
export async function exportAARToPdf(input: ExportInput): Promise<{ success: boolean; error?: string }> {
  try {
    const html = buildAARHtml(input);
    const fileName = `AAR_${(input.expedition.title || 'Expedition').replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}`;

    if (Platform.OS === 'web') {
      return await exportWeb(html, fileName);
    } else {
      return await exportNative(html, fileName);
    }
  } catch (err: any) {
    console.error('[AARPdfExport] Export failed:', err);
    return { success: false, error: err.message || 'PDF export failed' };
  }
}

async function exportNative(html: string, fileName: string): Promise<{ success: boolean; error?: string }> {
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

async function exportWeb(html: string, fileName: string): Promise<{ success: boolean; error?: string }> {
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

function downloadHtmlAsFile(html: string, fileName: string): { success: boolean; error?: string } {
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
export function getAARHtmlPreview(input: ExportInput): string {
  return buildAARHtml(input);
}

