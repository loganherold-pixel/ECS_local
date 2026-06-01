import React from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, TYPO } from '../../lib/theme';
import type { DispersedCampingRegionSelectionPayload } from '../../lib/map/dispersedCampingTypes';

type Props = {
  visible: boolean;
  region: DispersedCampingRegionSelectionPayload | null;
  topOffset: number;
  bottomOffset: number;
  onClose: () => void;
};

const VERIFY_WARNING =
  'ECS shows areas where dispersed camping may be allowed based on available public-land and access data. Always verify current local rules, posted closures, fire restrictions, permits, and agency guidance before camping.';

const WEB_SCROLL_CONTAINMENT_STYLE =
  Platform.OS === 'web'
    ? ({
        overscrollBehavior: 'contain',
        touchAction: 'pan-y',
      } as any)
    : null;

function titleCase(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return 'Verify';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function confidenceColor(confidence?: string): string {
  switch (String(confidence ?? '').toLowerCase()) {
    case 'high':
      return '#A9B85F';
    case 'medium':
      return '#D4A017';
    case 'restricted':
      return '#C66A4A';
    case 'verify':
    default:
      return TACTICAL.amber;
  }
}

function managerLabel(value?: string): string {
  switch (String(value ?? '').toUpperCase()) {
    case 'BLM':
      return 'BLM';
    case 'USFS':
      return 'USFS';
    case 'NPS':
      return 'NPS';
    case 'STATE':
      return 'State';
    case 'PRIVATE':
      return 'Private';
    case 'TRIBAL':
      return 'Tribal';
    case 'MILITARY':
      return 'Military';
    case 'LOCAL':
      return 'Local';
    default:
      return 'Unknown';
  }
}

function uniqueStrings(values: string[] | undefined, fallback: string): string[] {
  const next = (values ?? [])
    .map((value) => String(value ?? '').trim())
    .filter((value) => value.length > 0);
  const unique = next.filter((value, index) => next.indexOf(value) === index);
  return unique.length > 0 ? unique : [fallback];
}

function formatSourceDate(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function BulletList({ items, tone = 'default' }: { items: string[]; tone?: 'default' | 'warning' }) {
  return (
    <View style={styles.bulletList}>
      {items.map((item) => (
        <View key={item} style={styles.bulletRow}>
          <View style={[styles.bulletDot, tone === 'warning' && styles.bulletDotWarning]} />
          <Text style={styles.bulletText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

export default function DispersedCampingRegionSheet({
  visible,
  region,
  topOffset,
  bottomOffset,
  onClose,
}: Props) {
  if (!visible || !region) return null;

  const color = confidenceColor(region.confidence);
  const basis = uniqueStrings(region.basis, 'Source basis unavailable.');
  const restrictions = uniqueStrings(region.restrictions, 'Current local restrictions not confirmed.');
  const sources = uniqueStrings(region.sourceNames, 'Source name unavailable.');
  const sourceDate = formatSourceDate(region.sourceUpdatedAt);
  const restricted = String(region.confidence).toLowerCase() === 'restricted';
  const scrollContentStyle = WEB_SCROLL_CONTAINMENT_STYLE
    ? [styles.bodyContent, WEB_SCROLL_CONTAINMENT_STYLE]
    : styles.bodyContent;

  return (
    <View pointerEvents="box-none" style={styles.layer}>
      <View
        pointerEvents="auto"
        style={[
          styles.shell,
          {
            top: topOffset,
            bottom: bottomOffset + 10,
          },
        ]}
      >
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.eyebrow}>MAP REGION</Text>
              <Text style={styles.title} accessibilityRole="header">
                {region.name || 'Dispersed Camping Eligibility'}
              </Text>
              <Text style={styles.subtitle}>
                {restricted ? 'Not shown as eligible.' : region.eligibilityLabel || 'Verify locally'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={onClose}
              activeOpacity={0.78}
              accessibilityRole="button"
              accessibilityLabel="Close dispersed camping eligibility details"
            >
              <Ionicons name="close" size={17} color={TACTICAL.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={scrollContentStyle}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.summaryRow}>
              <View style={[styles.confidenceBadge, { borderColor: color, backgroundColor: `${color}1F` }]}>
                <Text style={[styles.confidenceText, { color }]}>{titleCase(region.confidence)}</Text>
              </View>
              <View style={styles.managerBadge}>
                <Text style={styles.managerLabel}>LAND MANAGER</Text>
                <Text style={styles.managerText}>{managerLabel(region.landManager)}</Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Why ECS highlighted this</Text>
              <BulletList items={basis} />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Restrictions / caveats</Text>
              <BulletList items={restrictions} tone="warning" />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Sources</Text>
              <View style={styles.sourceWrap}>
                {sources.map((source) => (
                  <View key={source} style={styles.sourceChip}>
                    <Text style={styles.sourceText}>{source}</Text>
                  </View>
                ))}
              </View>
              {sourceDate ? <Text style={styles.sourceDate}>Updated {sourceDate}</Text> : null}
            </View>

            <View style={styles.warningBox}>
              <Ionicons name="warning-outline" size={14} color={TACTICAL.amber} />
              <Text style={styles.warningText}>{VERIFY_WARNING}</Text>
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.secondaryButton} activeOpacity={0.78} disabled>
              <Text style={styles.secondaryButtonText}>Scout nearby pins</Text>
              <Text style={styles.comingSoonText}>Coming later</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryButton} onPress={onClose} activeOpacity={0.84}>
              <Text style={styles.primaryButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 76,
    elevation: 76,
  },
  shell: {
    position: 'absolute',
    left: 12,
    right: 12,
    justifyContent: 'flex-end',
  },
  card: {
    maxWidth: 430,
    width: '100%',
    alignSelf: 'center',
    maxHeight: '100%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(242,194,77,0.32)',
    backgroundColor: 'rgba(8,14,18,0.96)',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 13,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(242,194,77,0.16)',
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  eyebrow: {
    ...TYPO.U2,
    color: TACTICAL.textMuted,
    fontSize: 8,
    letterSpacing: 1.3,
  },
  title: {
    ...TYPO.T2,
    color: TACTICAL.text,
    fontSize: 15,
  },
  subtitle: {
    ...TYPO.B2,
    color: TACTICAL.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(242,194,77,0.18)',
    backgroundColor: 'rgba(12,16,20,0.82)',
  },
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  confidenceBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  confidenceText: {
    ...TYPO.U2,
    fontSize: 9,
    letterSpacing: 1,
  },
  managerBadge: {
    borderWidth: 1,
    borderColor: 'rgba(242,194,77,0.18)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(18,24,29,0.72)',
    gap: 2,
  },
  managerLabel: {
    ...TYPO.U2,
    color: TACTICAL.textMuted,
    fontSize: 7,
    letterSpacing: 1,
  },
  managerText: {
    ...TYPO.T3,
    color: TACTICAL.text,
    fontSize: 11,
  },
  section: {
    gap: 7,
  },
  sectionTitle: {
    ...TYPO.U2,
    color: TACTICAL.amber,
    fontSize: 9,
    letterSpacing: 1,
  },
  bulletList: {
    gap: 6,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    marginTop: 5,
    backgroundColor: '#A9B85F',
  },
  bulletDotWarning: {
    backgroundColor: TACTICAL.amber,
  },
  bulletText: {
    ...TYPO.B2,
    flex: 1,
    color: TACTICAL.text,
    fontSize: 11,
    lineHeight: 15,
  },
  sourceWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  sourceChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(242,194,77,0.16)',
    backgroundColor: 'rgba(18,24,29,0.72)',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  sourceText: {
    ...TYPO.B2,
    color: TACTICAL.textMuted,
    fontSize: 10,
  },
  sourceDate: {
    ...TYPO.B2,
    color: TACTICAL.textMuted,
    fontSize: 10,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(242,194,77,0.22)',
    backgroundColor: 'rgba(242,194,77,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  warningText: {
    ...TYPO.B2,
    flex: 1,
    color: TACTICAL.text,
    fontSize: 10,
    lineHeight: 14,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(242,194,77,0.14)',
  },
  secondaryButton: {
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(242,194,77,0.13)',
    backgroundColor: 'rgba(18,24,29,0.58)',
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  secondaryButtonText: {
    ...TYPO.U2,
    color: TACTICAL.textMuted,
    fontSize: 8,
    letterSpacing: 0.8,
  },
  comingSoonText: {
    ...TYPO.B2,
    color: TACTICAL.textMuted,
    fontSize: 8,
  },
  primaryButton: {
    minHeight: 38,
    borderRadius: 10,
    backgroundColor: TACTICAL.amber,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  primaryButtonText: {
    ...TYPO.U2,
    color: '#091014',
    fontSize: 9,
    letterSpacing: 1,
  },
});
