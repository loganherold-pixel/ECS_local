import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';

import { ECSBadge } from '../ECSStatus';
import type { ExpeditionReadinessStatus } from '../../lib/readiness/expeditionReadinessTypes';
import {
  readinessStatusIcon,
  readinessStatusLabel,
  readinessStatusTone,
} from './readinessUi';

export interface ReadinessDecisionBadgeProps {
  status: ExpeditionReadinessStatus;
  score?: number | null;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function ReadinessDecisionBadge({
  status,
  score,
  compact = false,
  style,
}: ReadinessDecisionBadgeProps) {
  const label = score == null
    ? readinessStatusLabel(status)
    : `${readinessStatusLabel(status)} ${Math.round(score)}`;

  return (
    <ECSBadge
      label={label}
      tone={readinessStatusTone(status)}
      icon={readinessStatusIcon(status)}
      compact={compact}
      style={style}
    />
  );
}

export default ReadinessDecisionBadge;

