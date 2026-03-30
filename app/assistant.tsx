/**
 * ═══════════════════════════════════════════════════════════
 * ECS AI EXPEDITION ASSISTANT — Screen (Phase 7A + 7C)
 * ═══════════════════════════════════════════════════════════
 *
 * Dedicated assistant screen accessible from the More tab
 * and other ECS navigation entry points.
 *
 * Feels native to the ECS interface with dark-mode styling
 * and consistent visual language.
 *
 * Phase 7C: Guidance evaluation runs while the assistant
 * screen is active and continues in background via the store.
 */

import React, { useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { ECS } from '../lib/theme';

import Header from '../components/Header';
import AssistantPanel from '../components/assistant/AssistantPanel';
import { assistantStore } from '../lib/assistantStore';

export default function AssistantScreen() {
  // Ensure assistant is initialized when screen mounts
  useEffect(() => {
    if (!assistantStore.isInitialized()) {
      assistantStore.initialize();
    }
  }, []);

  return (
    <View style={styles.container}>
      <Header />
      <AssistantPanel />
      {/* Bottom padding for CommandDock */}
      <View style={styles.dockSpacer} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: ECS.bgPrimary,
  },
  dockSpacer: {
    height: Platform.OS === 'web' ? 68 : 74,
  },
});




