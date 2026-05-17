import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { SafeIcon as Ionicons } from '../SafeIcon';
import { ECS, GOLD_RAIL, TACTICAL } from '../../lib/theme';
import { isExpeditionSummaryEnabled } from '../../lib/expedition/selectors';
import { getExpeditionFrameworkState } from '../../stores/expeditionFrameworkStore';
import type { RouteLifecycleState } from '../../lib/types/expedition';

type ExpeditionSummaryCardProps = {
  routeLifecycleState: RouteLifecycleState;
  onOpenSummary: () => void;
};

export default function ExpeditionSummaryCard({
  routeLifecycleState,
  onOpenSummary,
}: ExpeditionSummaryCardProps) {
  const [summaryOpened, setSummaryOpened] = useState(false);
  const enabled = isExpeditionSummaryEnabled({
    ...getExpeditionFrameworkState(),
    routeLifecycleState,
  });

  useEffect(() => {
    if (!enabled) setSummaryOpened(false);
  }, [enabled]);

  const handlePress = () => {
    if (!enabled) return;
    setSummaryOpened(true);
    onOpenSummary();
  };

  return (
    <TouchableOpacity
      style={[
        styles.card,
        enabled ? styles.active : styles.disabled,
        summaryOpened && enabled && styles.opened,
      ]}
      disabled={!enabled}
      activeOpacity={0.78}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityState={{ disabled: !enabled, selected: summaryOpened && enabled }}
      accessibilityLabel="Expedition Summary"
    >
      <View style={[styles.iconWrap, !enabled && styles.iconWrapDisabled]}>
        <Ionicons
          name="document-text-outline"
          size={16}
          color={enabled ? TACTICAL.amber : TACTICAL.textMuted}
        />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.title, !enabled && styles.disabledText]}>
          Expedition Summary
        </Text>
        <Text style={[styles.status, !enabled && styles.disabledText]} numberOfLines={1}>
          {enabled
            ? summaryOpened
              ? 'Summary ready'
              : 'Ready to generate PDF'
            : 'Available after route completion'}
        </Text>
      </View>
      <Ionicons
        name="chevron-forward-outline"
        size={15}
        color={enabled ? TACTICAL.amber : TACTICAL.textMuted}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 64,
    borderRadius: ECS.radius,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  active: {
    borderColor: GOLD_RAIL.section,
    backgroundColor: 'rgba(17,20,24,0.94)',
  },
  opened: {
    borderColor: GOLD_RAIL.major,
    backgroundColor: 'rgba(212,160,23,0.10)',
  },
  disabled: {
    borderColor: 'rgba(139,148,158,0.16)',
    backgroundColor: 'rgba(17,20,24,0.48)',
    opacity: 0.66,
  },
  iconWrap: {
    width: 31,
    height: 31,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: 'rgba(212,160,23,0.10)',
  },
  iconWrapDisabled: {
    borderColor: 'rgba(139,148,158,0.18)',
    backgroundColor: 'rgba(139,148,158,0.08)',
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: TACTICAL.text,
    fontSize: 13,
    fontWeight: '900',
  },
  status: {
    marginTop: 2,
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '700',
  },
  disabledText: {
    color: TACTICAL.textMuted,
  },
});
