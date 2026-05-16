import type { ViewStyle } from 'react-native';

import type {
  ExpeditionReadinessCategory,
  ExpeditionReadinessIssue,
  ExpeditionReadinessStatus,
} from '../../lib/readiness/expeditionReadinessTypes';
import { ECS_STATUS, type ECSStatusTone } from '../../lib/ecsStatusTokens';
import { ECS as ECS_THEME, GOLD_RAIL } from '../../lib/theme';

export function readinessStatusTone(status: ExpeditionReadinessStatus): ECSStatusTone {
  if (status === 'ready') return 'ready';
  if (status === 'caution') return 'warning';
  return 'unavailable';
}

export function readinessStatusLabel(status: ExpeditionReadinessStatus): string {
  if (status === 'ready') return 'Ready';
  if (status === 'caution') return 'Caution';
  return 'Hold';
}

export function readinessStatusIcon(status: ExpeditionReadinessStatus) {
  if (status === 'ready') return 'shield-checkmark-outline' as const;
  if (status === 'caution') return 'alert-circle-outline' as const;
  return 'hand-left-outline' as const;
}

export function readinessToneColor(status: ExpeditionReadinessStatus): string {
  return ECS_STATUS.tone[readinessStatusTone(status)].text;
}

export function issueTone(issue: ExpeditionReadinessIssue): ECSStatusTone {
  return issue.severity === 'blocker' ? 'unavailable' : 'warning';
}

export function categoryConcernRank(category: ExpeditionReadinessCategory): number {
  if (category.status === 'hold') return 0;
  if (category.missingInputs.length > 0) return 1;
  if (category.status === 'caution') return 2;
  return 3;
}

export const readinessSurfaceStyle: ViewStyle = {
  backgroundColor: ECS_THEME.bgPanel,
  borderColor: GOLD_RAIL.section,
  borderWidth: 1,
  borderRadius: 8,
};

export const readinessInnerSurfaceStyle: ViewStyle = {
  backgroundColor: ECS_THEME.bgElev,
  borderColor: ECS_THEME.stroke,
  borderWidth: 1,
  borderRadius: 8,
};

export const readinessMutedBorder = ECS_THEME.strokeSoft;
export const readinessDivider = GOLD_RAIL.internal;
