import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { SafeIcon as Ionicons } from '../SafeIcon';
import Header from '../Header';
import TopoBackground from '../TopoBackground';
import { ECS, TACTICAL } from '../../lib/theme';
import { getShellBottomClearance } from '../../lib/shellLayout';

export type ExploreFeaturePlaceholderScreenProps = {
  title: 'Trip Builder' | 'Offline Prep Pack';
  eyebrow: string;
  description: string;
  icon: string;
};

export default function ExploreFeaturePlaceholderScreen({
  description,
  eyebrow,
  icon,
  title,
}: ExploreFeaturePlaceholderScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dockClearance = getShellBottomClearance(insets.bottom, 8);

  return (
    <TopoBackground>
      <View style={[styles.safeContainer, { paddingBottom: dockClearance }]}>
        <Header title="Explore" />
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <View style={styles.iconWrap}>
              <Ionicons name={icon as any} size={22} color={TACTICAL.amber} />
            </View>
            <Text style={styles.eyebrow}>{eyebrow}</Text>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.description}>{description}</Text>
            <View style={styles.notice}>
              <Ionicons name="construct-outline" size={13} color={TACTICAL.textMuted} />
              <Text style={styles.noticeText}>
                This Explore feature is registered as a placeholder. Route suggestions and filters remain available in Explore.
              </Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Back to Explore"
              activeOpacity={0.82}
              onPress={() => router.push('/discover')}
              style={styles.action}
            >
              <Ionicons name="arrow-back-outline" size={14} color="#091014" />
              <Text style={styles.actionText}>Back to Explore</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </TopoBackground>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '32',
    backgroundColor: ECS.bgPanel,
    padding: 18,
    gap: 10,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '36',
    backgroundColor: TACTICAL.amber + '10',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  title: {
    color: TACTICAL.text,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  description: {
    color: TACTICAL.textMuted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: 'rgba(0,0,0,0.18)',
    padding: 10,
  },
  noticeText: {
    flex: 1,
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
  action: {
    alignSelf: 'flex-start',
    minHeight: 34,
    borderRadius: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: TACTICAL.amber,
    borderWidth: 1,
    borderColor: 'rgba(255,220,140,0.5)',
  },
  actionText: {
    color: '#091014',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
});
