import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useApp } from '../../context/AppContext';
import { hasPremiumEntitlement } from '../../lib/subscriptionAccess';
import ProPaywallView from './ProPaywallView';

export default function PremiumAccessGate({
  children,
  featureLabel,
}: {
  children: React.ReactNode;
  featureLabel?: string;
}) {
  const { operatorInfo } = useApp();

  if (hasPremiumEntitlement(operatorInfo)) {
    return <>{children}</>;
  }

  return (
    <View style={styles.container}>
      <ProPaywallView compact featureLabel={featureLabel} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
  },
});
