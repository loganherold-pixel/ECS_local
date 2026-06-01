import React, { useMemo } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ImageSourcePropType,
} from 'react-native';

import { SafeIcon as Ionicons } from '../SafeIcon';
import { ECS, TACTICAL } from '../../lib/theme';

export type FieldUseGuideStep = {
  title: string;
  instruction: string;
};

export type FieldUseGuideProtocol = {
  id: string;
  title: string;
  subtitle: string;
  accentColor: string;
  image?: ImageSourcePropType | null;
  beforeLabel?: string;
  beforeItems: string[];
  stepCards: FieldUseGuideStep[];
  warningLabel?: string;
  warningItems: string[];
  completionLabel?: string;
  completionItems: string[];
};

type Props = {
  protocol: FieldUseGuideProtocol;
};

export default function FieldUseProtocolDetail({ protocol }: Props) {
  const { height } = useWindowDimensions();
  const compact = height < 760;
  const warningItems = useMemo(() => protocol.warningItems.slice(0, 4), [protocol.warningItems]);
  const beforeLabel = protocol.beforeLabel ?? 'BEFORE YOU PULL';
  const warningLabel = protocol.warningLabel ?? 'DO NOT';
  const completionLabel = protocol.completionLabel ?? 'COMPLETION CHECK';

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        {protocol.image ? (
          <Image source={protocol.image} style={[styles.thumb, compact && styles.thumbCompact]} resizeMode="cover" />
        ) : (
          <View style={[styles.thumb, compact && styles.thumbCompact, styles.thumbFallback]}>
            <Ionicons name="medkit-outline" size={compact ? 20 : 24} color={protocol.accentColor} />
          </View>
        )}
        <View style={styles.headerCopy}>
          <View style={[styles.badge, { borderColor: `${protocol.accentColor}44`, backgroundColor: `${protocol.accentColor}14` }]}>
            <Ionicons name="warning-outline" size={11} color={protocol.accentColor} />
            <Text style={[styles.badgeText, { color: protocol.accentColor }]}>FIELD USE</Text>
          </View>
          <Text
            style={[styles.title, { color: protocol.accentColor }]}
            numberOfLines={compact ? 1 : 2}
            accessibilityRole="header"
            accessibilityLabel={`${protocol.title}. ${protocol.subtitle}`}
          >
            {protocol.title}
          </Text>
          <Text style={styles.subtitle} numberOfLines={2}>{protocol.subtitle}</Text>
        </View>
      </View>

      <View style={styles.beforeStrip}>
        <Text style={styles.stripLabel}>{beforeLabel}</Text>
        <View style={styles.chipRow}>
          {protocol.beforeItems.slice(0, 5).map((item) => (
            <View key={item} style={[styles.checkChip, { borderColor: `${protocol.accentColor}30` }]}>
              <Text style={[styles.checkChipText, { color: protocol.accentColor }]} numberOfLines={1}>{item}</Text>
            </View>
          ))}
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, compact && styles.scrollContentCompact]}
        showsVerticalScrollIndicator={false}
        bounces={false}
        nestedScrollEnabled
      >
        <View style={styles.stepList}>
          {protocol.stepCards.slice(0, 6).map((step, index) => (
            <View key={`${protocol.id}-step-${index}`} style={styles.stepRow}>
              <View style={[styles.stepNumber, { borderColor: `${protocol.accentColor}55` }]}>
                <Text style={[styles.stepNumberText, { color: protocol.accentColor }]}>{index + 1}</Text>
              </View>
              <View style={styles.stepCopy}>
                <Text style={styles.stepTitle} numberOfLines={1}>{step.title}</Text>
                <Text style={styles.stepInstruction} numberOfLines={2}>{step.instruction}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={[styles.warningBlock, { borderColor: 'rgba(239,83,80,0.35)' }]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="alert-circle-outline" size={14} color={TACTICAL.danger} />
            <Text style={[styles.sectionTitle, { color: TACTICAL.danger }]}>{warningLabel}</Text>
          </View>
          <View style={styles.warningGrid}>
            {warningItems.map((item) => (
              <View key={item} style={styles.warningItem}>
                <Text style={styles.warningText} numberOfLines={2}>{item.replace(/^Stop if /, '')}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={[styles.completeBlock, { borderColor: `${protocol.accentColor}30` }]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="checkmark-circle-outline" size={14} color={protocol.accentColor} />
            <Text style={[styles.sectionTitle, { color: protocol.accentColor }]}>{completionLabel}</Text>
          </View>
          <View style={styles.completeRow}>
            {protocol.completionItems.slice(0, 3).map((item) => (
              <View key={item} style={styles.completeChip}>
                <Text style={styles.completeText} numberOfLines={2}>{item}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    gap: 7,
  },
  header: {
    minHeight: 76,
    flexShrink: 0,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.22)',
    backgroundColor: 'rgba(6,9,12,0.9)',
    padding: 7,
    flexDirection: 'row',
    gap: 9,
    overflow: 'hidden',
  },
  thumb: {
    width: 96,
    height: 62,
    borderRadius: 10,
    backgroundColor: ECS.bgPrimary,
  },
  thumbCompact: {
    width: 82,
    height: 56,
  },
  thumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.18)',
    backgroundColor: 'rgba(0,0,0,0.26)',
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 4,
  },
  badge: {
    alignSelf: 'flex-start',
    minHeight: 20,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  badgeText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
  },
  title: {
    fontSize: 14,
    lineHeight: 17,
    fontWeight: '900',
    letterSpacing: 0.35,
  },
  subtitle: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
    color: TACTICAL.textMuted,
  },
  beforeStrip: {
    flexShrink: 0,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.025)',
    paddingHorizontal: 8,
    paddingVertical: 7,
    gap: 6,
  },
  stripLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 1.3,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  checkChip: {
    minHeight: 23,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(196,138,44,0.08)',
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkChipText: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900',
    letterSpacing: 0.25,
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    gap: 7,
    paddingBottom: 2,
  },
  scrollContentCompact: {
    gap: 6,
  },
  stepList: {
    gap: 6,
  },
  stepRow: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.032)',
    paddingHorizontal: 8,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  stepNumberText: {
    fontSize: 13,
    fontWeight: '900',
  },
  stepCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  stepTitle: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  stepInstruction: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
    color: TACTICAL.textMuted,
  },
  warningBlock: {
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: 'rgba(239,83,80,0.08)',
    paddingHorizontal: 8,
    paddingVertical: 7,
    gap: 6,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  sectionTitle: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  warningGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  warningItem: {
    flexGrow: 1,
    flexBasis: '48%',
    minHeight: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.18)',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  warningText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '800',
    color: 'rgba(255,235,235,0.9)',
  },
  completeBlock: {
    flexShrink: 0,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: 'rgba(196,138,44,0.07)',
    paddingHorizontal: 8,
    paddingVertical: 7,
    gap: 6,
  },
  completeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  completeChip: {
    flexGrow: 1,
    flexBasis: '31%',
    minHeight: 32,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.18)',
    paddingHorizontal: 7,
    paddingVertical: 6,
    justifyContent: 'center',
  },
  completeText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '800',
    color: TACTICAL.text,
  },
});
