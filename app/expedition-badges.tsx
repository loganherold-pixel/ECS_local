import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ExpeditionBadgeCatalogView } from '../components/dashboard/ExpeditionBadgeCatalogView';
import { ECSStateMessage } from '../components/ECSStateMessage';
import {
  getBadgeProgress,
  getUnlockedBadges,
  type ExpeditionBadge,
} from '../lib/expedition';
import { ECS, TACTICAL } from '../lib/theme';

export default function ExpeditionBadgeCatalogScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [badges, setBadges] = useState<ExpeditionBadge[]>([]);
  const [badgeProgress, setBadgeProgress] = useState<ExpeditionBadge[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let mounted = true;
    void Promise.all([getUnlockedBadges(), getBadgeProgress()])
      .then(([unlocked, progress]) => {
        if (!mounted) return;
        setBadges(unlocked);
        setBadgeProgress(progress);
      })
      .catch(() => {
        if (mounted) setFailed(true);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {loading ? (
        <View style={styles.stateWrap} accessibilityRole="progressbar" accessibilityLabel="Loading Badge Catalog">
          <ActivityIndicator size="small" color={TACTICAL.amber} />
        </View>
      ) : failed ? (
        <View style={styles.stateWrap}>
          <ECSStateMessage
            title="Badge Catalog Unavailable"
            message="Earned badge records remain stored locally. Close and reopen the catalog to try again."
            icon="alert-circle-outline"
          />
        </View>
      ) : (
        <ExpeditionBadgeCatalogView
          badges={badges}
          badgeProgress={badgeProgress}
          onBack={() => router.back()}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: ECS.bgPrimary,
  },
  stateWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: ECS.spacing.xl,
  },
});
