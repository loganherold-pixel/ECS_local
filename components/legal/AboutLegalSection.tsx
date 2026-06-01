import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SafeIcon as Ionicons } from '../SafeIcon';
import {
  ADVISORY_NOTICE,
  APP_LEGAL_NAME,
  APP_VERSION,
  COPYRIGHT_NOTICE,
  THIRD_PARTY_MARKS_NOTICE,
  TRADEMARK_NOTICE,
} from '../../lib/legal';
import { RADIUS, SPACING } from '../../lib/theme';

type LegalLinkId = 'privacy' | 'terms' | 'support';

interface AboutLegalSectionProps {
  colors: {
    bgCard: string;
    bgInput: string;
    border: string;
    gold: string;
    goldBorder: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
  };
  onOpenLink?: (id: LegalLinkId) => void;
}

const LEGAL_LINKS: {
  id: LegalLinkId;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}[] = [
  { id: 'privacy', label: 'Policy', icon: 'lock-closed-outline' },
  { id: 'terms', label: 'Site Use', icon: 'document-text-outline' },
  { id: 'support', label: 'Support', icon: 'help-buoy-outline' },
];

export default function AboutLegalSection({ colors, onOpenLink }: AboutLegalSectionProps) {
  return (
    <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.goldBorder }]}>
      <View style={styles.header}>
        <View style={[styles.iconFrame, { backgroundColor: `${colors.gold}18` }]}>
          <Ionicons name="shield-checkmark-outline" size={18} color={colors.gold} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={[styles.eyebrow, { color: colors.gold }]}>ABOUT & LEGAL</Text>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{APP_LEGAL_NAME}</Text>
          <Text style={[styles.version, { color: colors.textMuted }]}>v{APP_VERSION}</Text>
        </View>
      </View>

      <View style={[styles.noticeBlock, { backgroundColor: colors.bgInput, borderColor: colors.border }]}>
        <Text style={[styles.noticeText, { color: colors.textSecondary }]}>{COPYRIGHT_NOTICE}</Text>
        <Text style={[styles.noticeText, { color: colors.textSecondary }]}>{TRADEMARK_NOTICE}</Text>
        <Text style={[styles.noticeText, { color: colors.textMuted }]}>{THIRD_PARTY_MARKS_NOTICE}</Text>
        <Text style={[styles.noticeText, { color: colors.textMuted }]}>{ADVISORY_NOTICE}</Text>
      </View>

      {onOpenLink ? (
        <View style={styles.linkRow}>
          {LEGAL_LINKS.map((link) => (
            <Pressable
              key={link.id}
              style={({ pressed }) => [
                styles.linkPill,
                { borderColor: colors.border, backgroundColor: colors.bgInput },
                pressed ? styles.pressed : null,
              ]}
              onPress={() => onOpenLink(link.id)}
            >
              <Ionicons name={link.icon} size={13} color={colors.gold} />
              <Text style={[styles.linkText, { color: colors.gold }]}>{link.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconFrame: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
    gap: 3,
  },
  eyebrow: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800',
    letterSpacing: 1.8,
  },
  title: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '800',
  },
  version: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    fontFamily: 'Courier',
  },
  noticeBlock: {
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    padding: SPACING.sm,
    gap: 8,
  },
  noticeText: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
  },
  linkRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  linkPill: {
    minHeight: 34,
    flexGrow: 1,
    flexBasis: 92,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  linkText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
  pressed: {
    opacity: 0.72,
  },
});
