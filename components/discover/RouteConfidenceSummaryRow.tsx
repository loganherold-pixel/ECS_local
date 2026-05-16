import React from 'react';
import { StyleSheet, View } from 'react-native';

import { ECS } from '../../lib/theme';
import type { RouteConfidenceResult } from '../../lib/routeConfidencePresentation';
import {
  getRouteConfidenceColor,
  getRouteConfidenceIcon,
  getRouteConfidenceLabel,
  getRouteConfidenceReasonChips,
} from '../../lib/routeConfidencePresentation';
import { ECS_TEXT } from '../../lib/ecsTypographyTokens';
import { ECSChip } from '../ECSChip';
import { ECSBadge } from '../ECSStatus';

interface RouteConfidenceSummaryRowProps {
  result: RouteConfidenceResult;
}

export default function RouteConfidenceSummaryRow({ result }: RouteConfidenceSummaryRowProps) {
  const label = getRouteConfidenceLabel(result.level);
  const color = getRouteConfidenceColor(result.level);
  const chips = getRouteConfidenceReasonChips(result, 2);

  return (
    <View
      style={s.row}
      accessible
      accessibilityLabel={`Route Confidence: ${label}${chips.length ? `. ${chips.join(', ')}` : ''}`}
    >
      <ECSBadge
        label={`Route Confidence: ${label}`}
        icon={getRouteConfidenceIcon(result.level) as any}
        tone="info"
        compact
        colorOverride={color}
        style={s.badge}
        textStyle={s.badgeText}
      />
      {chips.map((chip) => (
        <ECSChip
          key={chip}
          label={chip}
          compact
          style={s.chip}
          textStyle={s.chipText}
        />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 5,
  },
  badge: {
    minHeight: 0,
  },
  badgeText: {
    ...ECS_TEXT.chip,
    fontSize: 7,
  },
  chip: {
    minHeight: 0,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
  },
  chipText: {
    ...ECS_TEXT.chip,
    fontSize: 7,
  },
});
