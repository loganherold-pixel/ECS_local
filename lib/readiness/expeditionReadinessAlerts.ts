import type {
  ExpeditionReadinessAssessment,
  ExpeditionReadinessCategory,
  ExpeditionReadinessCategoryId,
  ExpeditionReadinessStatus,
} from './expeditionReadinessTypes';
import { getReadinessDecisionLabel } from './expeditionReadinessCopy';

export type ExpeditionReadinessAlertSeverity = 'info' | 'caution' | 'hold';

export type ExpeditionReadinessAlert = {
  id: string;
  triggerKey: string;
  title: string;
  message: string;
  severity: ExpeditionReadinessAlertSeverity;
  actionLabel: 'Open Command Brief';
  categoryId?: ExpeditionReadinessCategoryId | null;
  createdAt: string;
  assessmentUpdatedAt: string;
};

export type ExpeditionReadinessAlertContext = {
  isActiveExpedition: boolean;
  previousActiveRouteId?: string | null;
  activeRouteId?: string | null;
  now?: string;
  lastAlertAtByTrigger?: Record<string, string | null | undefined>;
  globalLastAlertAt?: string | null;
  cooldownMs?: number;
  globalCooldownMs?: number;
  categoryDropThreshold?: number;
};

const CATEGORY_DROP_THRESHOLD = 15;
const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;
const DEFAULT_GLOBAL_COOLDOWN_MS = 30 * 1000;

const CATEGORY_ALERT_COPY: Partial<Record<ExpeditionReadinessCategoryId, { title: string; message: string }>> = {
  weather_window: {
    title: 'Weather readiness changed',
    message: 'Weather confidence or risk has changed; review the current window before continuing.',
  },
  daylight_margin: {
    title: 'Daylight margin narrowing',
    message: 'Daylight margin is limited for the active expedition plan.',
  },
  offline_preparedness: {
    title: 'Offline package needs review',
    message: 'Offline preparedness is incomplete for the current route context.',
  },
  camp_legality_confidence: {
    title: 'Camp confidence changed',
    message: 'Camp Legality Confidence dropped; review source confidence before relying on the camp plan.',
  },
  recovery_bailout_access: {
    title: 'Bailout access changed',
    message: 'Recovery or bailout confidence dropped during active guidance.',
  },
  power_runtime: {
    title: 'Power runtime limited',
    message: 'Power runtime or telemetry confidence is limited for the active expedition.',
  },
  communications_signal_confidence: {
    title: 'Signal confidence changed',
    message: 'Communications confidence is limited; review the active check-in plan.',
  },
};

function parsedTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function withinCooldown(
  triggerKey: string,
  context: ExpeditionReadinessAlertContext,
  nowMs: number,
): boolean {
  const cooldownMs = context.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const globalCooldownMs = context.globalCooldownMs ?? DEFAULT_GLOBAL_COOLDOWN_MS;
  const triggerLast = parsedTime(context.lastAlertAtByTrigger?.[triggerKey]);
  const globalLast = parsedTime(context.globalLastAlertAt);
  return Boolean(
    (triggerLast != null && nowMs - triggerLast < cooldownMs)
    || (globalLast != null && nowMs - globalLast < globalCooldownMs),
  );
}

function severityRank(severity: ExpeditionReadinessAlertSeverity): number {
  if (severity === 'hold') return 3;
  if (severity === 'caution') return 2;
  return 1;
}

function categorySeverity(category: ExpeditionReadinessCategory): ExpeditionReadinessAlertSeverity {
  if (category.status === 'hold') return 'hold';
  if (category.status === 'caution' || category.confidence === 'low') return 'caution';
  return 'info';
}

function categoryMap(assessment: ExpeditionReadinessAssessment): Map<ExpeditionReadinessCategoryId, ExpeditionReadinessCategory> {
  return new Map(assessment.categories.map((category) => [category.id, category]));
}

function statusTransitionSeverity(
  previous: ExpeditionReadinessStatus,
  current: ExpeditionReadinessStatus,
): ExpeditionReadinessAlertSeverity | null {
  if (previous === 'ready' && current === 'caution') return 'caution';
  if (previous === 'caution' && current === 'hold') return 'hold';
  if (previous === 'ready' && current === 'hold') return 'hold';
  return null;
}

function buildAlertId(triggerKey: string, nowIso: string): string {
  return `readiness-alert:${triggerKey}:${Date.parse(nowIso) || Date.now()}`;
}

function cleanAlertCopy(value: string): string {
  return value
    .replace(/\blegal campsite\b/gi, 'Camp Legality Confidence')
    .replace(/\bguaranteed safe\b/gi, 'confidence-supported')
    .replace(/\bsafe route\b/gi, 'route confidence')
    .replace(/\bAI\b/g, 'ECS Intelligence')
    .replace(/\s+/g, ' ')
    .trim();
}

function makeAlert(
  triggerKey: string,
  title: string,
  message: string,
  severity: ExpeditionReadinessAlertSeverity,
  assessment: ExpeditionReadinessAssessment,
  nowIso: string,
  categoryId?: ExpeditionReadinessCategoryId | null,
): ExpeditionReadinessAlert {
  return {
    id: buildAlertId(triggerKey, nowIso),
    triggerKey,
    title: cleanAlertCopy(title),
    message: cleanAlertCopy(message),
    severity,
    actionLabel: 'Open Command Brief',
    categoryId: categoryId ?? null,
    createdAt: nowIso,
    assessmentUpdatedAt: assessment.updatedAt,
  };
}

function statusWorsened(previous: ExpeditionReadinessCategory | null, current: ExpeditionReadinessCategory): boolean {
  if (!previous) return false;
  const rank = (status: ExpeditionReadinessStatus) => (status === 'ready' ? 0 : status === 'caution' ? 1 : 2);
  return rank(current.status) > rank(previous.status);
}

function addCategoryAlert(
  alerts: ExpeditionReadinessAlert[],
  previous: ExpeditionReadinessCategory | null,
  current: ExpeditionReadinessCategory | undefined,
  assessment: ExpeditionReadinessAssessment,
  nowIso: string,
  triggerKey: string,
  categoryDropThreshold: number,
  force = false,
): void {
  if (!current) return;
  const scoreDrop = previous ? previous.score - current.score : 0;
  const meaningful = force || scoreDrop >= categoryDropThreshold || statusWorsened(previous, current);
  if (!meaningful) return;
  const copy = CATEGORY_ALERT_COPY[current.id] ?? {
    title: `${current.label} changed`,
    message: `${current.label} dropped ${Math.max(0, Math.round(scoreDrop))} points; review active readiness details.`,
  };
  alerts.push(makeAlert(
    triggerKey,
    copy.title,
    copy.message,
    categorySeverity(current),
    assessment,
    nowIso,
    current.id,
  ));
}

export function buildExpeditionReadinessAlerts(
  previous: ExpeditionReadinessAssessment | null | undefined,
  current: ExpeditionReadinessAssessment,
  context: ExpeditionReadinessAlertContext,
): ExpeditionReadinessAlert[] {
  if (!context.isActiveExpedition || !previous) return [];

  const nowIso = context.now ?? new Date().toISOString();
  const nowMs = Date.parse(nowIso) || Date.now();
  const alerts: ExpeditionReadinessAlert[] = [];
  const previousCategories = categoryMap(previous);
  const currentCategories = categoryMap(current);
  const categoryDropThreshold = context.categoryDropThreshold ?? CATEGORY_DROP_THRESHOLD;

  const statusSeverity = statusTransitionSeverity(previous.status, current.status);
  if (statusSeverity) {
    alerts.push(makeAlert(
      `status:${previous.status}->${current.status}`,
      `Readiness changed to ${getReadinessDecisionLabel(current.status)}`,
      current.blockers[0]?.detail
        ?? current.warnings[0]?.detail
        ?? current.explanation,
      statusSeverity,
      current,
      nowIso,
    ));
  }

  current.categories.forEach((category) => {
    addCategoryAlert(
      alerts,
      previousCategories.get(category.id) ?? null,
      category,
      current,
      nowIso,
      `category-drop:${category.id}`,
      categoryDropThreshold,
    );
  });

  const weather = currentCategories.get('weather_window');
  const previousWeather = previousCategories.get('weather_window') ?? null;
  if (current.sourceFreshness.weather.isStale && !previous.sourceFreshness.weather.isStale) {
    addCategoryAlert(alerts, previousWeather, weather, current, nowIso, 'weather:stale', categoryDropThreshold, true);
  } else {
    addCategoryAlert(alerts, previousWeather, weather, current, nowIso, 'weather:risk', categoryDropThreshold);
  }

  addCategoryAlert(
    alerts,
    previousCategories.get('daylight_margin') ?? null,
    currentCategories.get('daylight_margin'),
    current,
    nowIso,
    'daylight:limited',
    categoryDropThreshold,
    currentCategories.get('daylight_margin')?.status !== 'ready',
  );

  const routeChanged = Boolean(
    context.activeRouteId
    && context.previousActiveRouteId
    && context.activeRouteId !== context.previousActiveRouteId,
  );
  addCategoryAlert(
    alerts,
    previousCategories.get('offline_preparedness') ?? null,
    currentCategories.get('offline_preparedness'),
    current,
    nowIso,
    'offline:route-change',
    categoryDropThreshold,
    routeChanged && currentCategories.get('offline_preparedness')?.status !== 'ready',
  );

  addCategoryAlert(alerts, previousCategories.get('camp_legality_confidence') ?? null, currentCategories.get('camp_legality_confidence'), current, nowIso, 'camp:confidence-drop', categoryDropThreshold);
  addCategoryAlert(alerts, previousCategories.get('recovery_bailout_access') ?? null, currentCategories.get('recovery_bailout_access'), current, nowIso, 'recovery:confidence-drop', categoryDropThreshold);
  addCategoryAlert(
    alerts,
    previousCategories.get('power_runtime') ?? null,
    currentCategories.get('power_runtime'),
    current,
    nowIso,
    'power:runtime-limited',
    categoryDropThreshold,
    currentCategories.get('power_runtime')?.status !== 'ready',
  );

  if (current.sourceFreshness.currentLocation.isStale && !previous.sourceFreshness.currentLocation.isStale) {
    alerts.push(makeAlert(
      'location:stale-active',
      'Location freshness limited',
      'Current location is stale during active guidance; readiness confidence is limited.',
      'caution',
      current,
      nowIso,
    ));
  }

  return alerts
    .filter((alert) => !withinCooldown(alert.triggerKey, context, nowMs))
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

export function selectPrimaryReadinessAlert(
  alerts: ExpeditionReadinessAlert[],
): ExpeditionReadinessAlert | null {
  return alerts[0] ?? null;
}
