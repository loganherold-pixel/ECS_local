import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { SafeIcon as Ionicons } from '../SafeIcon';
import {
  campsiteRecommendationService,
  type CampsiteRecommendationService,
  type PublishedCampSiteReviewAction,
  type PublishedCampSiteReviewQueueItem,
} from '../../lib/campsites/campsiteRecommendationService';
import { formatCommunityCampsiteValue } from '../../lib/campsites/communityCampsiteMapLayer';

type Colors = {
  bgCard: string;
  border: string;
  gold: string;
  goldBorder: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  warning: string;
  success: string;
  error?: string;
};

type Props = {
  colors: Colors;
  onToast?: (message: string) => void;
  service?: Pick<CampsiteRecommendationService, 'listFlaggedCampsiteReviewQueue' | 'resolveFlaggedCampsiteReview'>;
};

const ACTIONS: { action: PublishedCampSiteReviewAction; label: string; icon: string; danger?: boolean }[] = [
  { action: 'keep_published', label: 'Keep published', icon: 'checkmark-circle-outline' },
  { action: 'hide', label: 'Hide', icon: 'eye-off-outline', danger: true },
  { action: 'mark_closed', label: 'Mark closed', icon: 'trail-sign-outline', danger: true },
  { action: 'mark_sensitive_removed', label: 'Sensitive/remove', icon: 'lock-closed-outline', danger: true },
];

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Unknown';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

export default function FlaggedCampsiteReviewQueue({
  colors,
  onToast,
  service = campsiteRecommendationService,
}: Props) {
  const [queue, setQueue] = useState<PublishedCampSiteReviewQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busySiteId, setBusySiteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await service.listFlaggedCampsiteReviewQueue(50);
    setLoading(false);
    if (!result.ok) {
      setQueue([]);
      setError(result.error);
      return;
    }
    setQueue(result.data);
  }, [service]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const runAction = useCallback(
    async (siteId: string, action: PublishedCampSiteReviewAction) => {
      setBusySiteId(siteId);
      const result = await service.resolveFlaggedCampsiteReview({ campSiteId: siteId, action });
      setBusySiteId(null);
      if (!result.ok) {
        onToast?.(result.error);
        return;
      }
      onToast?.(`Published campsite review resolved: ${formatCommunityCampsiteValue(action)}.`);
      await loadQueue();
    },
    [loadQueue, onToast, service],
  );

  if (loading) {
    return (
      <View style={[styles.emptyCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <ActivityIndicator size="small" color={colors.gold} />
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Loading flagged campsites...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.emptyCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <Ionicons name="lock-closed-outline" size={22} color={colors.warning} />
        <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Moderator access required</Text>
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{error}</Text>
      </View>
    );
  }

  if (queue.length === 0) {
    return (
      <View style={[styles.emptyCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <Ionicons name="checkmark-circle-outline" size={22} color={colors.success} />
        <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No flagged campsites</Text>
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
          Published campsite lifecycle review is clear.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={[styles.hero, { backgroundColor: colors.bgCard, borderColor: colors.goldBorder }]}>
        <Ionicons name="flag-outline" size={20} color={colors.gold} />
        <View style={styles.heroText}>
          <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>Flagged Campsite Review</Text>
          <Text style={[styles.heroCopy, { color: colors.textSecondary }]}>
            Serious or repeated flags can hide a published campsite until moderator review resolves it.
          </Text>
        </View>
      </View>

      {queue.map((site) => (
        <View key={site.id} style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleWrap}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                {site.canonical_name ?? 'Community campsite'}
              </Text>
              <Text style={[styles.cardMeta, { color: colors.textMuted }]}>
                {formatCommunityCampsiteValue(site.status)} | Flags {site.flag_count} | Trust {Math.round(site.trust_score)}
              </Text>
            </View>
            <View style={[styles.statusPill, { borderColor: colors.goldBorder }]}>
              <Text style={[styles.statusText, { color: colors.gold }]}>RE-REVIEW</Text>
            </View>
          </View>

          <Text style={[styles.reason, { color: colors.textSecondary }]}>{site.reviewReason}</Text>
          <Text style={[styles.metaLine, { color: colors.textMuted }]}>
            Last confirmed: {formatDate(site.last_confirmed_at)}
          </Text>

          <View style={styles.flagList}>
            {site.flags.slice(0, 4).map((flag) => (
              <View key={flag.id} style={[styles.flagRow, { borderColor: colors.border }]}>
                <Text style={[styles.flagReason, { color: colors.textPrimary }]}>
                  {formatCommunityCampsiteValue(flag.reason)}
                </Text>
                <Text style={[styles.flagDetails, { color: colors.textSecondary }]}>
                  {flag.details ?? 'No details provided.'}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.actions}>
            {ACTIONS.map((action) => (
              <ActionButton
                key={action.action}
                label={action.label}
                icon={action.icon}
                colors={colors}
                danger={action.danger}
                busy={busySiteId === site.id}
                onPress={() => runAction(site.id, action.action)}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function ActionButton({
  label,
  icon,
  colors,
  danger = false,
  busy,
  onPress,
}: {
  label: string;
  icon: string;
  colors: Colors;
  danger?: boolean;
  busy: boolean;
  onPress: () => void;
}) {
  const dangerColor = colors.error ?? colors.warning;
  return (
    <TouchableOpacity
      style={[
        styles.actionButton,
        {
          borderColor: danger ? `${dangerColor}55` : colors.goldBorder,
          backgroundColor: danger ? `${dangerColor}12` : `${colors.gold}14`,
          opacity: busy ? 0.55 : 1,
        },
      ]}
      onPress={onPress}
      disabled={busy}
      activeOpacity={0.84}
    >
      <Ionicons name={icon as any} size={14} color={danger ? dangerColor : colors.gold} />
      <Text style={[styles.actionText, { color: danger ? dangerColor : colors.gold }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
  },
  hero: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  heroText: {
    flex: 1,
    gap: 3,
  },
  heroTitle: {
    fontSize: 15,
    fontWeight: '900',
  },
  heroCopy: {
    fontSize: 12,
    lineHeight: 17,
  },
  emptyCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 18,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '900',
  },
  emptyText: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  cardTitleWrap: {
    flex: 1,
    gap: 3,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '900',
  },
  cardMeta: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '900',
  },
  reason: {
    fontSize: 12,
    lineHeight: 17,
  },
  metaLine: {
    fontSize: 11,
    fontWeight: '700',
  },
  flagList: {
    gap: 8,
  },
  flagRow: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 9,
    gap: 3,
  },
  flagReason: {
    fontSize: 12,
    fontWeight: '900',
  },
  flagDetails: {
    fontSize: 11,
    lineHeight: 16,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionButton: {
    minHeight: 34,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionText: {
    fontSize: 11,
    fontWeight: '900',
  },
});
