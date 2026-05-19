import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DispatchCadCommandCenter from '../../components/dispatch/DispatchCadCommandCenter';
import Header from '../../components/Header';
import TabErrorBoundary from '../../components/TabErrorBoundary';
import TopoBackground from '../../components/TopoBackground';
import { getShellBottomClearance } from '../../lib/shellLayout';

function DispatchScreenShell() {
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const dockClearance = useMemo(() => getShellBottomClearance(insets.bottom, 8), [insets.bottom]);
  const useScrollableDispatch = height < 820 || width > height;
  const scrollInnerStyle = useMemo(
    () => ({ minHeight: Math.max(height - 118, 680) }),
    [height],
  );

  return (
    <View style={styles.root}>
      <TopoBackground>
        <View style={[styles.container, { paddingBottom: useScrollableDispatch ? 0 : dockClearance }]}>
          <Header title="Dispatch" />
          {useScrollableDispatch ? (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={[styles.scrollContent, { paddingBottom: dockClearance }]}
              showsVerticalScrollIndicator={false}
            >
              <View style={[styles.scrollInner, scrollInnerStyle]}>
                <DispatchCadCommandCenter />
              </View>
            </ScrollView>
          ) : (
            <DispatchCadCommandCenter />
          )}
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  scrollInner: {
    flex: 1,
  },
});
