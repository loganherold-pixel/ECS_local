import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeIcon as Ionicons } from './SafeIcon';
import ECSShellTexture from './ECSShellTexture';
import type { AppearanceMode } from '../lib/appearanceStore';
import {
  ECS_OPERATOR_TRUST_DESCRIPTORS,
  describeOperatorTrustMode,
} from '../lib/ai/operatorTrustResolvers';
import type { ECSOperatorTrustMode } from '../lib/ai/operatorTrustTypes';
import { AUTH_COPY } from '../lib/auth/authCopy';
import type { ECSTopBannerTone } from '../lib/ui/topBannerTypes';
import { useAdaptiveLayout } from '../lib/useAdaptiveLayout';
import CommandHubIntelInserts from './intel/CommandHubIntelInserts';

type ThemeChoice = 'dark' | 'light' | 'dynamic';

interface ProfileSettingsPanelProps {
  visible: boolean;
  onClose: () => void;
  anchorTop: number;
  userEmail?: string | null;
  accessLabel?: string;
  accessStatusLabel?: string;
  accessDetail?: string;
  accountBadgeLabel?: string;
  accountFacts?: { label: string; value: string }[];
  accountFootnote?: string;
  accountActions?: {
    id: string;
    label: string;
    detail: string;
    icon: React.ComponentProps<typeof Ionicons>['name'];
    tone?: 'default' | 'primary' | 'danger';
  }[];
  accountActionBusyId?: string | null;
  onAccountAction?: (actionId: string) => void;
  statusLabel: string;
  statusDetail: string;
  statusTone?: ECSTopBannerTone;
  processingActive?: boolean;
  syncActionLabel?: string;
  syncLabel: string;
  syncDisabled?: boolean;
  onManualSync: () => void | Promise<void>;
  geofenceRadius: number;
  onSelectGeofence: (meters: number) => void;
  appearanceMode: AppearanceMode;
  onSelectTheme: (mode: AppearanceMode) => void;
  operatorTrustMode: ECSOperatorTrustMode;
  onSelectOperatorTrustMode: (mode: ECSOperatorTrustMode) => void;
  onProfilePress?: () => void;
  endActionLabel?: string;
  endActionDetail?: string;
  endActionIcon?: React.ComponentProps<typeof Ionicons>['name'];
  onEndAction?: () => void;
}

const GEOFENCE_PRESETS = [200, 400, 800, 1500] as const;

const PANEL = {
  bg: '#161B20',
  surface: '#1C2229',
  border: 'rgba(212,160,23,0.18)',
  borderMuted: 'rgba(255,255,255,0.08)',
  text: '#E8E2D3',
  textMuted: '#8B949E',
  textDim: '#66707B',
  gold: '#D4A017',
  goldSoft: 'rgba(212,160,23,0.12)',
  green: '#4CAF50',
  danger: '#D96C50',
};

function getThemeChoice(mode: AppearanceMode): ThemeChoice {
  if (mode === 'dark') return 'dark';
  if (mode === 'light') return 'light';
  return 'dynamic';
}

function getToneColor(tone: ECSTopBannerTone | undefined): string {
  switch (tone) {
    case 'online':
      return PANEL.green;
    case 'syncing':
    case 'offline_capable':
      return PANEL.gold;
    case 'degraded':
      return '#D6A04B';
    case 'offline':
    case 'neutral':
    default:
      return PANEL.textMuted;
  }
}

export default function ProfileSettingsPanel({
  visible,
  onClose,
  anchorTop,
  userEmail,
  accessLabel,
  accessStatusLabel,
  accessDetail,
  accountBadgeLabel,
  accountFacts = [],
  accountFootnote,
  accountActions = [],
  accountActionBusyId = null,
  onAccountAction,
  statusLabel,
  statusDetail,
  statusTone = 'neutral',
  processingActive = false,
  syncActionLabel = 'SYNC NOW',
  syncLabel,
  syncDisabled = false,
  onManualSync,
  geofenceRadius,
  onSelectGeofence,
  appearanceMode,
  onSelectTheme,
  operatorTrustMode,
  onSelectOperatorTrustMode,
  onProfilePress,
  endActionLabel,
  endActionDetail,
  endActionIcon = 'flag-outline',
  onEndAction,
}: ProfileSettingsPanelProps) {
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const adaptive = useAdaptiveLayout();

  const selectedTheme = getThemeChoice(appearanceMode);
  const toneColor = getToneColor(statusTone);
  const activeTrustMode = describeOperatorTrustMode(operatorTrustMode);
  const compactProfileActions = [
    {
      id: '__sync__',
      label: syncActionLabel,
      icon: 'sync-outline' as const,
      tone: 'primary' as const,
      busy: processingActive,
      disabled: syncDisabled,
      onPress: () => {
        if (syncDisabled) return;
        void onManualSync();
      },
    },
    ...[...accountActions]
      .sort((left, right) => {
        const priority: Record<string, number> = {
          reset_password: 0,
          sign_out: 1,
          sign_in: 2,
          refresh_access: 3,
          restore_purchases: 4,
          manage_subscription: 5,
          start_subscription: 6,
        };
        return (priority[left.id] ?? 20) - (priority[right.id] ?? 20);
      })
      .map((action) => ({
        ...action,
        busy: accountActionBusyId === action.id,
        disabled: Boolean(accountActionBusyId),
        onPress: () => onAccountAction?.(action.id),
      })),
  ];

  const handleThemePress = (choice: ThemeChoice) => {
    if (choice === 'dynamic') {
      onSelectTheme('dynamic');
      return;
    }
    onSelectTheme(choice);
  };

  const topInset = Math.max(0, anchorTop - 26);
  const sideInset = adaptive.isTablet ? 24 : 14;
  const bottomInset = adaptive.isTablet ? 12 : 6;
  const panelWidth = Math.min(adaptive.isTablet ? 620 : 560, Math.max(320, windowWidth - sideInset * 2));
  const maxHeight = Math.max(420, windowHeight - topInset - bottomInset);

  if (!visible) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <View
          pointerEvents="box-none"
          style={[
            styles.viewport,
            {
              paddingTop: topInset,
              paddingBottom: bottomInset,
              paddingHorizontal: sideInset,
            },
          ]}
        >
          <Pressable
            style={[
              styles.panel,
              {
                width: panelWidth,
                maxHeight,
                backgroundColor: PANEL.bg,
                borderColor: PANEL.border,
              },
            ]}
            onPress={(event) => event.stopPropagation()}
          >
            <ECSShellTexture />
            <View style={styles.panelCap} />
            <View
              style={[
                styles.header,
                {
                  borderBottomColor: PANEL.borderMuted,
                  backgroundColor: PANEL.bg,
                },
              ]}
            >
              <View style={styles.headerCopy}>
                <Text style={[styles.headerEyebrow, { color: PANEL.textDim }]}>COMMAND HUB</Text>
                <Text style={[styles.headerTitle, { color: PANEL.text }]}>{AUTH_COPY.account.header}</Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                activeOpacity={0.72}
                style={[
                  styles.closeButton,
                  {
                    backgroundColor: PANEL.surface,
                    borderColor: PANEL.borderMuted,
                  },
                ]}
              >
                <Ionicons name="close" size={16} color={PANEL.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              bounces={false}
              keyboardShouldPersistTaps="handled"
            >
            <View
              style={[
                styles.identityCard,
                {
                  backgroundColor: PANEL.surface,
                  borderColor: PANEL.borderMuted,
                },
              ]}
            >
              <TouchableOpacity
                activeOpacity={onProfilePress ? 0.72 : 1}
                onPress={() => {
                  if (!onProfilePress) return;
                  onClose();
                  onProfilePress();
                }}
                style={styles.identitySummaryRow}
              >
                <View style={[styles.identityAvatar, { backgroundColor: PANEL.goldSoft, borderColor: PANEL.border }]}>
                  <Ionicons name="person-circle-outline" size={20} color={PANEL.gold} />
                </View>
                <View style={styles.identityCopy}>
                  <Text style={[styles.identityEyebrow, { color: PANEL.textDim }]}>PROFILE</Text>
                  <Text style={[styles.identityEmail, { color: PANEL.text }]} numberOfLines={2}>
                    {userEmail || 'Not signed in'}
                  </Text>
                  <View style={styles.identityStatusRow}>
                    <View
                      style={[
                        styles.identityStatusPill,
                        {
                          borderColor: toneColor + '35',
                          backgroundColor: toneColor + '12',
                        },
                      ]}
                    >
                      {processingActive ? (
                        <Ionicons name="sync-outline" size={10} color={toneColor} />
                      ) : (
                        <View style={[styles.identityStatusDot, { backgroundColor: toneColor }]} />
                      )}
                      <Text style={[styles.identityStatusText, { color: toneColor }]}>{statusLabel}</Text>
                    </View>
                    {accessLabel ? (
                      <View style={[styles.accountBadge, { borderColor: PANEL.border, backgroundColor: PANEL.goldSoft }]}>
                        <Text style={[styles.accountBadgeText, { color: PANEL.gold }]}>
                          {accountBadgeLabel || accessLabel}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={[styles.identityStatusDetail, { color: PANEL.textMuted }]} numberOfLines={2}>
                    {accessDetail || statusDetail}
                  </Text>
                </View>
                {onProfilePress ? (
                  <Ionicons name="chevron-forward" size={14} color={PANEL.textDim} />
                ) : null}
              </TouchableOpacity>

              {compactProfileActions.length ? (
                <View style={styles.identityActionCluster}>
                  {compactProfileActions.map((action) => {
                    const tint =
                      action.tone === 'danger'
                        ? PANEL.danger
                        : action.tone === 'primary'
                          ? PANEL.gold
                          : PANEL.text;
                    return (
                      <TouchableOpacity
                        key={action.id}
                        style={[
                          styles.identityActionPill,
                          {
                            borderColor:
                              action.tone === 'danger'
                                ? PANEL.danger + '28'
                                : action.tone === 'primary'
                                  ? PANEL.border
                                  : PANEL.borderMuted,
                            backgroundColor:
                              action.tone === 'danger'
                                ? PANEL.danger + '10'
                                : action.tone === 'primary'
                                  ? PANEL.goldSoft
                                  : PANEL.bg,
                            opacity: action.disabled ? 0.56 : 1,
                          },
                        ]}
                        onPress={action.onPress}
                        activeOpacity={action.disabled ? 1 : 0.72}
                        disabled={action.disabled}
                      >
                        <Ionicons
                          name={action.busy ? 'sync-outline' : action.icon}
                          size={11}
                          color={tint}
                        />
                        <Text style={[styles.identityActionText, { color: tint }]} numberOfLines={1}>
                          {action.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: PANEL.textDim }]}>COMMAND POSTURE</Text>
              <Text style={[styles.sectionDescription, { color: PANEL.textMuted }]}>
                {activeTrustMode.shortDescription}
              </Text>
              <View style={styles.trustModeColumn}>
                {ECS_OPERATOR_TRUST_DESCRIPTORS.map((option) => {
                  const active = operatorTrustMode === option.mode;
                  return (
                    <TouchableOpacity
                      key={option.mode}
                      style={[
                        styles.trustModeCard,
                        {
                          backgroundColor: active ? PANEL.goldSoft : PANEL.surface,
                          borderColor: active ? PANEL.border : PANEL.borderMuted,
                        },
                      ]}
                      onPress={() => onSelectOperatorTrustMode(option.mode)}
                      activeOpacity={0.72}
                    >
                      <View style={styles.trustModeCopy}>
                        <View style={styles.trustModeHeader}>
                          <Text style={[styles.trustModeTitle, { color: active ? PANEL.gold : PANEL.text }]}>
                            {option.label}
                          </Text>
                          {active ? (
                            <View style={[styles.trustModeBadge, { backgroundColor: PANEL.goldSoft, borderColor: PANEL.border }]}>
                              <Text style={[styles.trustModeBadgeText, { color: PANEL.gold }]}>ACTIVE</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={[styles.trustModeSummary, { color: PANEL.textMuted }]}>
                          {option.shortDescription}
                        </Text>
                      </View>
                      <Ionicons
                        name={active ? 'radio-button-on-outline' : 'radio-button-off-outline'}
                        size={16}
                        color={active ? PANEL.gold : PANEL.textDim}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: PANEL.textDim }]}>THEME</Text>
              <View style={styles.optionRow}>
                {([
                  { key: 'dark', label: 'DARK', icon: 'moon-outline' },
                  { key: 'light', label: 'LIGHT', icon: 'sunny-outline' },
                  { key: 'dynamic', label: 'DYNAMIC', icon: 'contrast-outline' },
                ] as const).map((option) => {
                  const active = selectedTheme === option.key;
                  return (
                    <TouchableOpacity
                      key={option.key}
                      style={[
                        styles.optionPill,
                        {
                          backgroundColor: active ? PANEL.goldSoft : PANEL.surface,
                          borderColor: active ? PANEL.border : PANEL.borderMuted,
                        },
                      ]}
                      onPress={() => handleThemePress(option.key)}
                      activeOpacity={0.72}
                    >
                      <Ionicons
                        name={option.icon as any}
                        size={12}
                        color={active ? PANEL.gold : PANEL.textMuted}
                      />
                      <Text style={[styles.optionPillText, { color: active ? PANEL.gold : PANEL.textMuted }]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: PANEL.textDim }]}>GEOFENCE</Text>
              <View style={styles.optionRow}>
                {GEOFENCE_PRESETS.map((value) => {
                  const active = geofenceRadius === value;
                  return (
                    <TouchableOpacity
                      key={value}
                      style={[
                        styles.radiusPill,
                        {
                          backgroundColor: active ? PANEL.goldSoft : PANEL.surface,
                          borderColor: active ? PANEL.border : PANEL.borderMuted,
                        },
                      ]}
                      onPress={() => onSelectGeofence(value)}
                      activeOpacity={0.72}
                    >
                      <Text style={[styles.radiusValue, { color: active ? PANEL.gold : PANEL.text }]}>
                        {value}
                      </Text>
                      <Text style={[styles.radiusUnit, { color: active ? PANEL.gold : PANEL.textMuted }]}>m</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: PANEL.textDim }]}>INTEL</Text>
              <CommandHubIntelInserts />
            </View>

            {endActionLabel && onEndAction ? (
              <View style={styles.section}>
                <TouchableOpacity
                  style={[
                    styles.actionRow,
                    {
                      backgroundColor: PANEL.surface,
                      borderColor: PANEL.borderMuted,
                    },
                  ]}
                  onPress={() => {
                    onClose();
                    onEndAction();
                  }}
                  activeOpacity={0.72}
                >
                  <View style={styles.actionLeft}>
                    <View style={[styles.actionIcon, { backgroundColor: PANEL.danger + '12', borderColor: PANEL.danger + '25' }]}>
                      <Ionicons name={endActionIcon} size={14} color={PANEL.danger} />
                    </View>
                    <View style={styles.actionCopy}>
                      <Text style={[styles.actionTitle, { color: PANEL.danger }]}>{endActionLabel}</Text>
                      <Text style={[styles.actionSubtitle, { color: PANEL.textMuted }]}>
                        {endActionDetail || 'Close the active expedition session.'}
                      </Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={PANEL.textDim} />
                </TouchableOpacity>
              </View>
            ) : null}
            </ScrollView>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.34)',
  },
  viewport: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panel: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 24,
    elevation: 18,
  },
  panelCap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: PANEL.gold,
  },
  header: {
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  headerEyebrow: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    padding: 12,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 7,
  },
  identityCard: {
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  identitySummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  identityAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  identityCopy: {
    flex: 1,
    gap: 1,
  },
  identityStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  identityEyebrow: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  identityEmail: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  identityStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  identityStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  identityStatusText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  identityStatusDetail: {
    fontSize: 10,
    lineHeight: 14,
    marginTop: 1,
  },
  identityActionCluster: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingTop: 2,
  },
  identityActionPill: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  identityActionText: {
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  section: {
    gap: 4,
  },
  sectionLabel: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.8,
    paddingHorizontal: 2,
  },
  sectionDescription: {
    fontSize: 10,
    lineHeight: 14,
    paddingHorizontal: 2,
  },
  accountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  accountBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  actionIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  actionCopy: {
    flex: 1,
    gap: 1,
  },
  actionTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  actionSubtitle: {
    fontSize: 10,
    fontWeight: '500',
    lineHeight: 14,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  trustModeColumn: {
    gap: 6,
  },
  trustModeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
  },
  trustModeCopy: {
    flex: 1,
    gap: 3,
  },
  trustModeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  trustModeTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  trustModeSummary: {
    fontSize: 10,
    lineHeight: 14,
  },
  trustModeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  trustModeBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
  },
  optionPill: {
    minWidth: 82,
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  optionPillText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.3,
  },
  radiusPill: {
    minWidth: 60,
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  radiusValue: {
    fontSize: 12,
    fontWeight: '800',
  },
  radiusUnit: {
    fontSize: 9,
    fontWeight: '700',
  },
});
