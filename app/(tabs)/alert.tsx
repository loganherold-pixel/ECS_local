import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DispatchCadCommandCenter from '../../components/dispatch/DispatchCadCommandCenter';
import Header from '../../components/Header';
import TabErrorBoundary from '../../components/TabErrorBoundary';
import TopoBackground from '../../components/TopoBackground';
import { getShellBottomClearance } from '../../lib/shellLayout';

function DispatchScreenShell() {
  const insets = useSafeAreaInsets();
  const dockClearance = useMemo(() => getShellBottomClearance(insets.bottom, 8), [insets.bottom]);

  return (
    <View style={styles.root}>
      <TopoBackground>
        <View style={[styles.container, { paddingBottom: dockClearance }]}>
          <Header title="Dispatch" />
          <DispatchCadCommandCenter />
        </View>
      </TopoBackground>
    </View>
  );
}

export default function AlertScreen() {
  return (
    <TabErrorBoundary tabName="DISPATCH">
      <DispatchScreenShell />
    </TabErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  container: {
    flex: 1,
  },
});
