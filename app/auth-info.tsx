import React, { useEffect, useMemo } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SafeIcon as Ionicons } from '../components/SafeIcon';
import LoginHeroBackground from '../components/login/LoginHeroBackground';
import LegalFooter from '../components/legal/LegalFooter';
import { AUTH_COPY } from '../lib/auth/authCopy';
import { TACTICAL } from '../lib/theme';

type AuthInfoSheet = 'terms' | 'privacy' | 'support';
const LOGIN_LOGO = require('../assets/images/Expedition Command System Logo.png');

function logAuthInfoDev(...args: unknown[]) {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log(...args);
  }
}

const SHEET_META: Record<AuthInfoSheet, { icon: React.ComponentProps<typeof Ionicons>['name']; eyebrow: string; subtitle: string }> = {
  terms: {
    icon: 'document-text-outline',
    eyebrow: 'LEGAL',
    subtitle: 'Operational use and account access terms for Expedition Command System.',
  },
  privacy: {
    icon: 'lock-closed-outline',
    eyebrow: 'PRIVACY',
    subtitle: 'How ECS handles account, expedition, and route data tied to your session.',
  },
  support: {
    icon: 'help-buoy-outline',
    eyebrow: 'SUPPORT',
    subtitle: 'Help for sign-in, account access, and ECS deployment support channels.',
  },
};

function isAuthInfoSheet(value: string | string[] | undefined): value is AuthInfoSheet {
  return value === 'terms' || value === 'privacy' || value === 'support';
}

export default function AuthInfoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ sheet?: string }>();

  const sheetKey: AuthInfoSheet = isAuthInfoSheet(params.sheet) ? params.sheet : 'terms';
  const sheetContent = AUTH_COPY.utility.sheets[sheetKey];
  const meta = SHEET_META[sheetKey];

  const paragraphs = useMemo(
    () => sheetContent.body.split('\n\n').map((item) => item.trim()).filter(Boolean),
    [sheetContent.body],
  );

  useEffect(() => {
    logAuthInfoDev('[Auth] Legal/support route open', { sheet: sheetKey, source: 'auth-info' });
    return () => {
      logAuthInfoDev('[Auth] Legal/support route close', { sheet: sheetKey, source: 'auth-info' });
    };
  }, [sheetKey]);

  return (
    <View style={styles.heroScreen}>
      <LoginHeroBackground />
      <StatusBar style="light" />
      <View
        style={[
          styles.screen,
          {
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 16,
            paddingHorizontal: 20,
          },
        ]}
      >
        <View style={styles.heroBlock}>
          <Image source={LOGIN_LOGO} resizeMode="contain" style={styles.logo} />
          <Text style={styles.heroTitle}>Expedition Command System</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Pressable
              onPress={() => {
                logAuthInfoDev('[Auth] Legal/support route close', { sheet: sheetKey, source: 'back_button' });
                router.back();
              }}
              accessibilityRole="button"
              accessibilityLabel="Back"
              style={({ pressed }) => [styles.backButton, pressed ? styles.backButtonPressed : null]}
            >
              <Ionicons name="chevron-back" size={16} color={TACTICAL.amber} />
              <Text style={styles.backText}>Back</Text>
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>{meta.eyebrow}</Text>
              <View style={styles.titleRow}>
                <Ionicons name={meta.icon} size={16} color={TACTICAL.amber} />
                <Text style={styles.title}>{sheetContent.title}</Text>
              </View>
              <Text style={styles.subtitle}>{meta.subtitle}</Text>
            </View>
          </View>

          <ScrollView
            style={styles.bodyScroll}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {paragraphs.map((paragraph, index) => (
              <Text key={`${sheetKey}:${index}`} style={styles.bodyText}>
                {paragraph}
              </Text>
            ))}
            <LegalFooter style={styles.legalFooter} />
          </ScrollView>
          </View>
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
    justifyContent: 'flex-start',
  },
  heroBlock: {
    flexShrink: 0,
    alignItems: 'center',
    marginBottom: 12,
  },
  logo: {
    width: 132,
    height: 106,
    marginBottom: 2,
  },
  heroTitle: {
    color: TACTICAL.text,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    flex: 1,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(18,22,27,0.96)',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.32,
    shadowRadius: 28,
    elevation: 8,
  },
  cardHeader: {
    gap: 12,
    marginBottom: 6,
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
  headerCopy: {
    gap: 6,
  },
  eyebrow: {
    color: 'rgba(212,160,23,0.88)',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    color: TACTICAL.text,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '800',
  },
  subtitle: {
    color: TACTICAL.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  bodyScroll: {
    flex: 1,
  },
  bodyContent: {
    paddingTop: 8,
    paddingBottom: 12,
    gap: 14,
  },
  bodyText: {
    color: 'rgba(232,226,211,0.86)',
    fontSize: 14,
    lineHeight: 22,
  },
  legalFooter: {
    marginTop: 4,
    paddingTop: 10,
  },
});
