import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { getEcsBuildFingerprint } from '../../lib/buildFingerprint';
import { TACTICAL } from '../../lib/theme';

export default function RouteDiscoveryQaIdentity() {
  const fingerprint = useMemo(() => getEcsBuildFingerprint(), []);
  return (
    <View
      style={styles.banner}
      accessibilityRole="summary"
      accessibilityLabel={`Internal QA build. Local synthetic fixtures. Network-disabled Supabase mode. Profile ${fingerprint.profile}. Commit ${fingerprint.commitShortSha}.`}
      testID="route-discovery-qa-identity"
    >
      <Text style={styles.title}>ROUTE DISCOVERY QA</Text>
      <View style={styles.row}>
        <Text style={styles.badge}>LOCAL FIXTURES</Text>
        <Text style={styles.badge}>SUPABASE DISABLED</Text>
      </View>
      <Text style={styles.meta}>PROFILE {fingerprint.profile} · COMMIT {fingerprint.commitShortSha}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 2,
    borderColor: TACTICAL.danger,
    borderRadius: TACTICAL.radius,
    backgroundColor: TACTICAL.panel,
    gap: 7,
  },
  title: { color: TACTICAL.text, fontSize: 16, fontWeight: '900', letterSpacing: 1.5, textAlign: 'center' },
  row: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 8 },
  badge: { color: TACTICAL.bg, backgroundColor: TACTICAL.amber, fontSize: 11, fontWeight: '900', paddingHorizontal: 8, paddingVertical: 4, borderRadius: TACTICAL.radius },
  meta: { color: TACTICAL.text, fontSize: 10, fontWeight: '800', letterSpacing: 0.6, textAlign: 'center' },
});
