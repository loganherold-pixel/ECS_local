import React from 'react';
import {
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';

import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, TYPO } from '../../lib/theme';

type ToolIconName = React.ComponentProps<typeof Ionicons>['name'];

type NavigateToolHeroProps = {
  eyebrow: string;
  title: string;
  body?: string;
  bodyLines?: string[];
  icon?: ToolIconName;
  badges?: string[];
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

type NavigateToolSectionProps = {
  title: string;
  subtitle?: string | null;
  children: React.ReactNode;
  badge?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

type NavigateToolActionCardProps = {
  title: string;
  subtitle?: string | null;
  icon: ToolIconName;
  onPress?: () => void;
  disabled?: boolean;
  active?: boolean;
  compact?: boolean;
  hideChevron?: boolean;
  badge?: string | null;
  accessibilityLabel?: string;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

type NavigateToolFooterProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function NavigateToolHero({
  eyebrow,
  title,
  body,
  bodyLines = [],
  icon,
  badges = [],
  children,
  style,
}: NavigateToolHeroProps) {
  const lines = body ? [body, ...bodyLines] : bodyLines;

  return (
    <View style={[styles.hero, style]}>
      <View style={styles.heroHeader}>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <Text style={styles.heroTitle}>{title}</Text>
        </View>
        {icon ? (
          <View style={styles.heroIcon}>
            <Ionicons name={icon} size={18} color={TACTICAL.amber} />
          </View>
        ) : null}
      </View>

      {lines.map((line) => (
        <Text key={line} style={styles.bodyText}>
          {line}
        </Text>
      ))}

      {badges.length > 0 ? <NavigateToolBadgeRow badges={badges} /> : null}
      {children}
    </View>
  );
}

export function NavigateToolSection({
  title,
  subtitle,
  children,
  badge,
  style,
}: NavigateToolSectionProps) {
  return (
    <View style={[styles.section, style]}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionCopy}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
        </View>
        {badge ? <View style={styles.sectionBadgeSlot}>{badge}</View> : null}
      </View>
      {children}
    </View>
  );
}

export function NavigateToolActionCard({
  title,
  subtitle,
  icon,
  onPress,
  disabled = false,
  active = false,
  compact = false,
  hideChevron = false,
  badge,
  accessibilityLabel,
  children,
  style,
}: NavigateToolActionCardProps) {
  return (
    <TouchableOpacity
      style={[
        styles.actionCard,
        compact && styles.actionCardCompact,
        active && styles.actionCardActive,
        disabled && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || !onPress}
      activeOpacity={0.86}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled, selected: active }}
    >
      <View style={[styles.actionIcon, compact && styles.actionIconCompact, active && styles.actionIconActive]}>
        <Ionicons name={icon} size={compact ? 14 : 16} color={active ? '#091014' : TACTICAL.amber} />
      </View>
      <View style={styles.actionTextWrap}>
        <View style={styles.actionTitleRow}>
          <Text
            style={[styles.actionTitle, compact && styles.actionTitleCompact, active && styles.actionTitleActive]}
            numberOfLines={compact ? 2 : 1}
          >
            {title}
          </Text>
          {badge ? <Text style={[styles.actionBadge, active && styles.actionBadgeActive]}>{badge}</Text> : null}
        </View>
        {subtitle ? (
          <Text style={[styles.actionSubtitle, active && styles.actionSubtitleActive]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
        {children}
      </View>
      {hideChevron ? null : (
        <Ionicons name="chevron-forward" size={14} color={active ? '#091014' : TACTICAL.textMuted} />
      )}
    </TouchableOpacity>
  );
}

export function NavigateToolFooter({ children, style }: NavigateToolFooterProps) {
  return <View style={[styles.footer, style]}>{children}</View>;
}

export function NavigateToolBadgeRow({ badges }: { badges: string[] }) {
  const visibleBadges = badges.filter((badge) => badge.trim().length > 0);
  if (visibleBadges.length === 0) return null;

  return (
    <View style={styles.badgeRow}>
      {visibleBadges.map((badge) => (
        <Text key={badge} style={styles.badge}>
          {badge}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.20)',
    backgroundColor: 'rgba(196,138,44,0.065)',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 7,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  heroIcon: {
    width: 34,
    height: 34,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.22)',
    backgroundColor: 'rgba(196,138,44,0.09)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    ...TYPO.U2,
    color: TACTICAL.amber,
    fontSize: 9,
    letterSpacing: 1.35,
  },
  heroTitle: {
    ...TYPO.T2,
    color: TACTICAL.text,
    fontSize: 16,
    lineHeight: 20,
  },
  bodyText: {
    ...TYPO.B2,
    color: TACTICAL.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  section: {
    gap: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  sectionTitle: {
    ...TYPO.U2,
    color: TACTICAL.goldMedium,
    fontSize: 8,
    letterSpacing: 1.5,
  },
  sectionSubtitle: {
    ...TYPO.B2,
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 14,
  },
  sectionBadgeSlot: {
    flexShrink: 0,
  },
  actionCard: {
    minHeight: 62,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.15)',
    backgroundColor: 'rgba(12,16,20,0.92)',
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionCardCompact: {
    minHeight: 50,
    borderRadius: 11,
    paddingHorizontal: 9,
    paddingVertical: 8,
    gap: 7,
  },
  actionCardActive: {
    borderColor: 'rgba(255,220,140,0.38)',
    backgroundColor: 'rgba(196,138,44,0.94)',
  },
  disabled: {
    opacity: 0.5,
  },
  actionIcon: {
    width: 30,
    height: 30,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.22)',
    backgroundColor: 'rgba(196,138,44,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconCompact: {
    width: 26,
    height: 26,
    borderRadius: 9,
  },
  actionIconActive: {
    borderColor: 'rgba(9,16,20,0.22)',
    backgroundColor: 'rgba(9,16,20,0.08)',
  },
  actionTextWrap: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  actionTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 7,
    minWidth: 0,
  },
  actionTitle: {
    ...TYPO.T3,
    color: TACTICAL.text,
    fontSize: 12,
    flexShrink: 1,
  },
  actionTitleCompact: {
    fontSize: 9.5,
    lineHeight: 12,
  },
  actionTitleActive: {
    color: '#091014',
  },
  actionSubtitle: {
    ...TYPO.B2,
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 14,
  },
  actionSubtitleActive: {
    color: 'rgba(9,16,20,0.78)',
  },
  actionBadge: {
    ...TYPO.U2,
    color: '#65F0D4',
    fontSize: 7.5,
    letterSpacing: 0.8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(101,240,212,0.22)',
    backgroundColor: 'rgba(101,240,212,0.08)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    overflow: 'hidden',
  },
  actionBadgeActive: {
    color: '#091014',
    borderColor: 'rgba(9,16,20,0.22)',
    backgroundColor: 'rgba(9,16,20,0.08)',
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  badge: {
    ...TYPO.U2,
    color: TACTICAL.amber,
    fontSize: 7.5,
    letterSpacing: 0.85,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.20)',
    backgroundColor: 'rgba(196,138,44,0.08)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: 'hidden',
  },
});
