import type { ECSBriefSeverity } from '../ai/ecsBriefTypes';
import { briefCadLogStore, type BriefCadLogEntry } from '../briefCadLogStore';

export type HighestActiveRemoteWeatherRisk = {
  severity: ECSBriefSeverity;
  title: string;
  message: string;
  recommendedAction?: string;
};

const SEVERITY_RANK: Record<ECSBriefSeverity, number> = {
  info: 0,
  watch: 1,
  warning: 2,
  critical: 3,
};

function isActiveRemoteWeatherEntry(entry: BriefCadLogEntry, now: number): boolean {
  return (
    entry.source === 'ecs-remote-weather' &&
    !!entry.severity &&
    (!Number.isFinite(entry.expiresAt) || Number(entry.expiresAt) > now)
  );
}

function toRemoteWeatherRisk(entry: BriefCadLogEntry): HighestActiveRemoteWeatherRisk {
  return {
    severity: entry.severity ?? 'info',
    title: entry.title ?? 'Predictive hazard',
    message: entry.message,
    recommendedAction: entry.recommendedAction,
  };
}

export function getHighestActiveRemoteWeatherRisk(
  now = Date.now(),
  entries: BriefCadLogEntry[] = briefCadLogStore.getEntries(),
): HighestActiveRemoteWeatherRisk | null {
  const activeEntries = entries.filter((entry) => isActiveRemoteWeatherEntry(entry, now));
  if (activeEntries.length === 0) return null;

  const highest = activeEntries
    .slice()
    .sort((left, right) => {
      const severityDelta =
        SEVERITY_RANK[right.severity ?? 'info'] - SEVERITY_RANK[left.severity ?? 'info'];
      if (severityDelta !== 0) return severityDelta;
      return right.timestamp - left.timestamp;
    })[0];

  return toRemoteWeatherRisk(highest);
}

function formatTitleForStatus(title: string): string {
  const normalized = title.replace(/\s+/g, ' ').trim().toLowerCase();
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : 'Predictive hazard';
}

function formatSeverityForStatus(severity: ECSBriefSeverity): string {
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

export function formatRemoteWeatherRiskStatusLine(
  risk: HighestActiveRemoteWeatherRisk,
): string {
  return `${formatSeverityForStatus(risk.severity)}: ${formatTitleForStatus(risk.title)}`;
}

export function subscribeRemoteWeatherRiskUpdates(listener: () => void): () => void {
  return briefCadLogStore.subscribe(listener);
}
