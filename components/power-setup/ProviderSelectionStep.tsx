/**
 * ProviderSelectionStep — Step 1: Choose a power system provider.
 *
 * Displays the supported providers as selectable tactical cards.
 * Each card shows: brand name, icon, subtitle, connection method badge.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeIcon as Ionicons } from '../../components/SafeIcon';
import { SPACING, RADIUS, GOLD_RAIL } from '../../lib/theme';
import {
  PROVIDER_DISPLAY,
  type PowerProviderId,
} from '../../lib/powerSetupStore';
import { resolveProviderReadiness } from '../../lib/powerReadiness';

interface Props {
  palette: any;
  onSelect: (provider: PowerProviderId) => void;
  onCancel: () => void;
}

const PROVIDERS: {
  id: PowerProviderId;
  connectionIcon: string;
}[] = [
  { id: 'EcoFlow', connectionIcon: 'cloud-outline' },
  { id: 'Redarc', connectionIcon: 'bluetooth-outline' },
  { id: 'DakotaLithium', connectionIcon: 'bluetooth-outline' },
  { id: 'Bluetti', connectionIcon: 'bluetooth-outline' },
  { id: 'AnkerSolix', connectionIcon: 'bluetooth-outline' },
  { id: 'Jackery', connectionIcon: 'bluetooth-outline' },
  { id: 'GoalZero', connectionIcon: 'bluetooth-outline' },
  { id: 'Renogy', connectionIcon: 'bluetooth-outline' },
];

export default function ProviderSelectionStep({ palette, onSelect, onCancel }: Props) {
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.stepBadge, { backgroundColor: palette.amber + '15', borderColor: palette.amber + '30' }]}>
          <Text style={[styles.stepNumber, { color: palette.amber }]}>1</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.stepLabel, { color: palette.textMuted }]}>STEP 1</Text>
          <Text style={[styles.title, { color: palette.text }]}>Select Power System</Text>
        </View>
      </View>

      <Text style={[styles.subtitle, { color: palette.textMuted }]}>
        Choose your expedition battery system brand to begin setup.
      </Text>

      <View style={[styles.divider, { backgroundColor: GOLD_RAIL.section }]} />

      {/* Provider Cards */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {PROVIDERS.map((provider) => {
          const display = PROVIDER_DISPLAY[provider.id];
          const isUiOnly = display.supportLevel === 'ui_only';
          const readiness = resolveProviderReadiness(provider.id);
          const trailingIconColor = isUiOnly ? readiness.color : palette.textMuted;
          return (
            <TouchableOpacity
              key={provider.id}
              style={[
                styles.providerCard,
                {
                  backgroundColor: palette.panel,
                  borderColor: palette.border,
                  opacity: isUiOnly ? 0.68 : 1,
                },
              ]}
              onPress={() => onSelect(provider.id)}
              disabled={isUiOnly}
              activeOpacity={0.7}
            >
              {/* Icon */}
              <View
                style={[
                  styles.providerIcon,
                  { backgroundColor: display.color + '12' },
                ]}
              >
                <Ionicons name={display.icon} size={24} color={display.color} />
              </View>

              {/* Info */}
              <View style={styles.providerInfo}>
                <Text style={[styles.providerName, { color: palette.text }]}>
                  {display.label}
                </Text>
                <Text style={[styles.providerSubtitle, { color: palette.textMuted }]}>
                  {display.subtitle}
                </Text>
                <Text style={[styles.providerSupportNote, { color: palette.textMuted }]}>
                  {readiness.detail}
                </Text>
              </View>

              {/* Connection method badge */}
              <View style={styles.providerRight}>
                <View
                  style={[
                    styles.methodBadge,
                    { backgroundColor: display.color + '10', borderColor: display.color + '25' },
                  ]}
                >
                  <Ionicons name={provider.connectionIcon} size={10} color={display.color} />
                  <Text style={[styles.methodText, { color: display.color }]}>
                    {display.connectionMethod}
                  </Text>
                </View>
                <View
                  style={[
                    styles.supportBadge,
                    {
                      backgroundColor: readiness.color + '12',
                      borderColor: readiness.color + '33',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.supportText,
                      { color: readiness.color },
                    ]}
                  >
                    {readiness.label}
                  </Text>
                </View>
                <Ionicons
                  name={isUiOnly ? 'lock-closed-outline' : 'chevron-forward'}
                  size={16}
                  color={trailingIconColor}
                />
              </View>
            </TouchableOpacity>
          );
        })}

        {/* Future providers note */}
        <View style={[styles.futureNote, { borderColor: palette.border }]}>
          <Ionicons name="add-circle-outline" size={16} color={palette.textMuted} />
          <View style={styles.futureNoteText}>
            <Text style={[styles.futureTitle, { color: palette.textMuted }]}>
              More providers coming soon
            </Text>
            <Text style={[styles.futureDesc, { color: palette.textMuted }]}>
              Zendure, Lion Energy, Pecron, BougeRV, Victron Energy
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Cancel */}
      <TouchableOpacity
        style={[styles.cancelBtn, { borderColor: palette.border }]}
        onPress={onCancel}
        activeOpacity={0.7}
      >
        <Text style={[styles.cancelText, { color: palette.textMuted }]}>CANCEL</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  stepBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  stepNumber: {
    fontSize: 16,
    fontWeight: '800',
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  stepLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: SPACING.md,
  },
  divider: {
    height: 1,
    marginBottom: SPACING.md,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    gap: SPACING.sm,
    paddingBottom: SPACING.md,
  },
  providerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: SPACING.lg,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
  },
  providerIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerInfo: {
    flex: 1,
    gap: 2,
  },
  providerName: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  providerSubtitle: {
    fontSize: 12,
    fontWeight: '500',
  },
  providerSupportNote: {
    fontSize: 11,
    lineHeight: 15,
    marginTop: 4,
  },
  providerRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  methodBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
  },
  methodText: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1,
  },
  supportBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
  },
  supportText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
  },
  futureNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginTop: SPACING.sm,
  },
  futureNoteText: {
    flex: 1,
    gap: 2,
  },
  futureTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  futureDesc: {
    fontSize: 11,
    lineHeight: 16,
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginTop: SPACING.sm,
  },
  cancelText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 3,
  },
});



