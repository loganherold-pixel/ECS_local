import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SafeIcon as Ionicons } from '../components/SafeIcon';
import LoginHeroBackground from '../components/login/LoginHeroBackground';
import ProPaywallView from '../components/premium/ProPaywallView';
import { AUTH_COPY } from '../lib/auth/authCopy';
import { TACTICAL } from '../lib/theme';

export default function ProScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.heroScreen}>
      <LoginHeroBackground />
      <StatusBar style="light" />

      <View
        style={[
          styles.screen,
          {
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 20,
            paddingHorizontal: 20,
          },
        ]}
      >
        <Pressable
          onPress={() => router.replace('/login')}
          accessibilityRole="button"
          accessibilityLabel="Back to login"
          style={({ pressed }) => [styles.backButton, pressed ? styles.backButtonPressed : null]}
        >
          <Ionicons name="chevron-back" size={16} color={TACTICAL.amber} />
          <Text style={styles.backText}>Back to Login</Text>
        </Pressable>

        <View style={styles.headerBlock}>
          <Text style={styles.eyebrow}>ECS PRO</Text>
          <Text style={styles.title}>Premium expedition command, locked until sign-in.</Text>
          <Text style={styles.subtitle}>
            Hidden Gems route discovery, vehicle-aware expedition support, live and offline workflows,
            power integrations, and ECS premium operational surfaces are verified after authentication.
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <ProPaywallView
            continueLabel="Back to Login"
            onContinueFree={() => router.replace('/login')}
          />

          <Text style={styles.footnote}>
            {AUTH_COPY.accessGate.detail}
          </Text>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heroScreen: {
    flex: 1,
    backgroundColor: '#040608',
  },
  screen: {
    ...StyleSheet.absoluteFillObject,
    flex: 1,
  },
  backButton: {
    alignSelf: 'flex-start',
    minHeight: 38,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backButtonPressed: {
    opacity: 0.76,
  },
  backText: {
    color: TACTICAL.amber,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  headerBlock: {
    marginTop: 16,
    marginBottom: 14,
    gap: 6,
  },
  eyebrow: {
    color: 'rgba(212,160,23,0.88)',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: 2,
  },
  title: {
    color: TACTICAL.text,
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '800',
  },
  subtitle: {
    color: TACTICAL.textMuted,
    fontSize: 13,
    lineHeight: 19,
    maxWidth: 640,
  },
  content: {
    paddingBottom: 12,
    gap: 14,
  },
  footnote: {
    color: 'rgba(230,237,243,0.56)',
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
});
