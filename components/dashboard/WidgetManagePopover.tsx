import React from 'react';
import {
  StyleSheet,
  Text,
  View,
} from 'react-native';

import ECSActionRow from '../ECSActionRow';
import { ECSButton } from '../ECSButton';
import TacticalPopupShell from '../TacticalPopupShell';
import { TACTICAL } from '../../lib/theme';
import { getFullWidgetCatalog, type WidgetSlot } from '../../lib/dashboardStore';
import { getDashboardRecommendedSize, getWidgetEntry } from '../../lib/widgetRegistry';

interface WidgetManagePopoverProps {
  visible: boolean;
  slot: WidgetSlot | null;
  onClose: () => void;
  onReplace: () => void;
  onChangeSurface: () => void;
  onRemove: () => void;
}

export default function WidgetManagePopover({
  visible,
  slot,
  onClose,
  onReplace,
  onChangeSurface,
  onRemove,
}: WidgetManagePopoverProps) {
  const widgetType = slot?.widgetType ?? null;
  const widgetDef = widgetType
    ? getFullWidgetCatalog().find((widget) => widget.type === widgetType) ?? null
    : null;
  const registryEntry = widgetType ? getWidgetEntry(widgetType) ?? null : null;
  const footprint = widgetType
    ? getDashboardRecommendedSize(widgetType).toUpperCase()
    : (slot?.widgetSize ?? '2x1').toUpperCase();

  if (!visible || !slot || !widgetType || !widgetDef) return null;

  return (
    <TacticalPopupShell
      visible={visible}
      onClose={onClose}
      tier="global"
      icon={widgetDef.icon as any}
      eyebrow="LONG-PRESS WIDGET CONTROLS"
      title="Widget Manager"
      subtitle={widgetDef.name}
      overlayClass="editor"
      maxWidth={520}
      maxHeightFraction={0.72}
      minHeightFraction={0.42}
      showHandle
      footer={
        <ECSActionRow wrap>
          <ECSButton
            label="Replace Widget"
            icon="swap-horizontal-outline"
            variant="secondary"
            size="medium"
            onPress={onReplace}
            grow
          />
          <ECSButton
            label="Change Surface"
            icon="layers-outline"
            variant="secondary"
            size="medium"
            onPress={onChangeSurface}
            grow
          />
          <ECSButton
            label="Remove Widget"
            icon="trash-outline"
            variant="destructive"
            size="medium"
            onPress={onRemove}
            grow
          />
        </ECSActionRow>
      }
    >
      <View style={styles.body}>
        <View style={styles.metaRow}>
          <View style={styles.metaPill}>
            <Text style={styles.metaPillText}>SLOT {slot.slotIndex + 1}</Text>
          </View>
          <View style={styles.metaPill}>
            <Text style={styles.metaPillText}>{footprint}</Text>
          </View>
          {registryEntry?.category ? (
            <View style={styles.metaPill}>
              <Text style={styles.metaPillText}>{registryEntry.category.toUpperCase()}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.ruleCard}>
          <Text style={styles.ruleTitle}>Fixed dashboard region</Text>
          <Text style={styles.ruleText}>
            Widget choices are limited to surfaces that fit this selected 2x2 region:
            one 2x2 surface, or up to two stacked 2x1 surfaces.
          </Text>
        </View>

        <View style={styles.ruleCard}>
          <Text style={styles.ruleTitle}>Normal tap behavior</Text>
          <Text style={styles.ruleText}>
            Background taps stay with the widget. Use the internal controls for widget actions,
            or long-press the widget again to return here.
          </Text>
        </View>
      </View>
    </TacticalPopupShell>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: 12,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaPill: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  metaPillText: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    letterSpacing: 0.8,
    fontWeight: '800',
  },
  ruleCard: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    backgroundColor: 'rgba(8,12,16,0.72)',
    borderRadius: 8,
    padding: 12,
    gap: 5,
  },
  ruleTitle: {
    color: TACTICAL.text,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  ruleText: {
    color: TACTICAL.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
});
