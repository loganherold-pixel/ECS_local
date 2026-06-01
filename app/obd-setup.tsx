import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeIcon as Ionicons } from '../components/SafeIcon';
import { TACTICAL } from '../lib/theme';

export default function OBDSetupRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/power/blu');
  }, [router]);

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons name="bluetooth-outline" size={26} color={TACTICAL.amber} />
      </View>
      <Text style={styles.title}>Opening Device Connections</Text>
      <Text style={styles.body}>
        ECS now uses one production scanner for nearby power devices and OBD2 telemetry adapters.
      </Text>
      <ActivityIndicator color={TACTICAL.amber} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
    backgroundColor: TACTICAL.bg,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: `${TACTICAL.amber}44`,
    backgroundColor: `${TACTICAL.amber}12`,
  },
  title: {
    color: TACTICAL.text,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  body: {
    maxWidth: 320,
    color: TACTICAL.textMuted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
});
