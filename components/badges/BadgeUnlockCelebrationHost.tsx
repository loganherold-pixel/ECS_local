import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import {
  AccessibilityInfo,
  AppState,
  Modal,
  StyleSheet,
  Text,
  View,
  type AppStateStatus,
} from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { activeTripModeStore, subscribeActiveTripMode } from '../../lib/activeTripMode';
import { expeditionStateStore } from '../../lib/expeditionStateStore';
import { getBadgeDefinition } from '../../lib/expedition/expeditionBadgeRegistry';
import { badgeUnlockQueueStore } from '../../lib/expedition/badgeUnlockQueueStore';
import {
  badgeUnlockCriticalInteractionStore,
  resolveBadgeUnlockSafety,
} from '../../lib/expedition/badgeUnlockSafety';
import { incidentRecoveryWorkflowStore } from '../../lib/incidentRecoveryWorkflowStore';
import { navigateRouteSessionStore } from '../../lib/navigateRouteSessionStore';
import { ECS, TACTICAL } from '../../lib/theme';
import {
  getExpeditionIncidentSignalState,
  subscribeExpeditionIncidentSignalState,
} from '../../stores/expeditionFrameworkStore';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { useBadgeUnlockQueue } from './useBadgeUnlockQueue';

const BadgeUnlockCelebration = React.lazy(() => import('./BadgeUnlockCelebration'));

type ErrorBoundaryProps = {
  children: React.ReactNode;
  onError: () => void;
};

class BadgeCelebrationErrorBoundary extends React.Component<ErrorBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function subscribeOperationalState(listener: () => void): () => void {
  const unsubscribers = [
    navigateRouteSessionStore.subscribe(listener),
    subscribeActiveTripMode(listener),
    expeditionStateStore.subscribe(listener),
    incidentRecoveryWorkflowStore.subscribe(listener),
    subscribeExpeditionIncidentSignalState(listener),
    badgeUnlockCriticalInteractionStore.subscribe(listener),
  ];
  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}

function getOperationalStateKey(): string {
  const navigationLifecycle = navigateRouteSessionStore.getSnapshot().lifecycle;
  const expeditionState = expeditionStateStore.getState();
  const activeTripStatus = activeTripModeStore.get()?.status ?? 'none';
  const workflowStatuses = incidentRecoveryWorkflowStore
    .getSnapshot()
    .filter((incident) => !['resolved', 'closed', 'cancelled'].includes(incident.status))
    .map((incident) => `${incident.id}:${incident.status}`)
    .sort()
    .join(',');
  const incidentSignal = getExpeditionIncidentSignalState().hasActiveIncident ? 'active' : 'none';
  return [
    navigationLifecycle,
    expeditionState,
    activeTripStatus,
    workflowStatuses,
    incidentSignal,
    badgeUnlockCriticalInteractionStore.getSnapshot(),
  ].join('|');
}

function useReducedMotionPreference(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduceMotion(enabled);
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  return reduceMotion;
}

export default function BadgeUnlockCelebrationHost() {
  const snapshot = useBadgeUnlockQueue();
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotionPreference();
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  useSyncExternalStore(subscribeOperationalState, getOperationalStateKey, getOperationalStateKey);

  useEffect(() => {
    void badgeUnlockQueueStore.initialize();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);

  const navigationIsActive = navigateRouteSessionStore.getSnapshot().lifecycle === 'active';
  const expeditionState = expeditionStateStore.getState();
  const incidentOrRecoveryIsActive =
    getExpeditionIncidentSignalState().hasActiveIncident ||
    incidentRecoveryWorkflowStore
      .getSnapshot()
      .some((incident) => !['resolved', 'closed', 'cancelled'].includes(incident.status));
  const activeTripIsActive = activeTripModeStore.get()?.status === 'active';
  const safety = resolveBadgeUnlockSafety({
    appIsActive: appState === 'active',
    navigationIsActive,
    expeditionIsActive: activeTripIsActive || expeditionState === 'active' || expeditionState === 'paused',
    incidentOrRecoveryIsActive,
    criticalInteractionIsActive: badgeUnlockCriticalInteractionStore.getSnapshot().length > 0,
    pathname,
  });

  useEffect(() => {
    if (!snapshot.hydrated) return;
    if (!safety.blockingPresentationAllowed) {
      if (snapshot.active) badgeUnlockQueueStore.deferActive();
      if (safety.reason !== 'app_inactive' && safety.reason !== 'unavailable_surface') {
        badgeUnlockQueueStore.claimDeferredBanner();
      } else if (snapshot.deferredBanner) {
        badgeUnlockQueueStore.dismissDeferredBanner();
      }
      return;
    }
    if (!snapshot.active && snapshot.queue.length > 0) {
      badgeUnlockQueueStore.beginNext();
    }
  }, [
    safety.blockingPresentationAllowed,
    safety.reason,
    snapshot.active,
    snapshot.deferredBanner,
    snapshot.hydrated,
    snapshot.queue.length,
  ]);

  useEffect(() => {
    if (!snapshot.deferredBanner) return;
    const timer = setTimeout(() => badgeUnlockQueueStore.dismissDeferredBanner(), 3200);
    return () => clearTimeout(timer);
  }, [snapshot.deferredBanner]);

  const activeItem = snapshot.active?.item ?? null;
  const handleReveal = useCallback(() => {
    if (activeItem) badgeUnlockQueueStore.markActivePresented(activeItem.id);
  }, [activeItem]);
  const handleDismiss = useCallback(() => {
    if (activeItem) badgeUnlockQueueStore.completeActive(activeItem.id);
  }, [activeItem]);
  const handleViewCatalog = useCallback(() => {
    if (activeItem) badgeUnlockQueueStore.completeActive(activeItem.id);
    router.push('/expedition-badges' as never);
  }, [activeItem, router]);
  const handlePresentationError = useCallback(() => {
    if (activeItem) badgeUnlockQueueStore.failActivePresentation(activeItem.id);
  }, [activeItem]);

  const banner = snapshot.deferredBanner;
  const bannerDefinition = banner?.badgeId ? getBadgeDefinition(banner.badgeId) : null;
  const bannerTitle = banner
    ? banner.achievementCount > 1
      ? `${banner.achievementCount} expedition badges earned`
      : bannerDefinition?.isHidden
        ? 'Secret expedition badge earned'
        : `${bannerDefinition?.title ?? 'Expedition badge'} earned`
    : null;

  return (
    <>
      {banner && bannerTitle ? (
        <View
          pointerEvents="none"
          style={[styles.deferredBanner, { top: Math.max(insets.top + 8, 16) }]}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          <Ionicons name="ribbon-outline" size={20} color={TACTICAL.amber} />
          <View style={styles.deferredBannerCopy}>
            <Text style={styles.deferredBannerTitle} numberOfLines={2}>{bannerTitle}</Text>
            <Text style={styles.deferredBannerDetail} numberOfLines={2}>
              Saved. Full reveal will wait until field operations are clear.
            </Text>
          </View>
        </View>
      ) : null}

      <Modal
        visible={!!activeItem && safety.blockingPresentationAllowed}
        transparent
        statusBarTranslucent
        navigationBarTranslucent
        animationType="none"
        presentationStyle="overFullScreen"
        onRequestClose={snapshot.active?.presented ? handleDismiss : () => undefined}
      >
        {activeItem ? (
          <BadgeCelebrationErrorBoundary key={activeItem.id} onError={handlePresentationError}>
            <React.Suspense fallback={null}>
              <BadgeUnlockCelebration
                item={activeItem}
                reduceMotion={reduceMotion}
                onReveal={handleReveal}
                onDismiss={handleDismiss}
                onViewCatalog={handleViewCatalog}
              />
            </React.Suspense>
          </BadgeCelebrationErrorBoundary>
        ) : null}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  deferredBanner: {
    position: 'absolute',
    left: ECS.spacing.md,
    right: ECS.spacing.md,
    zIndex: 10000,
    minHeight: 60,
    paddingHorizontal: ECS.spacing.md,
    paddingVertical: ECS.spacing.sm,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: ECS.goldMedium,
    backgroundColor: ECS.bgElev,
    flexDirection: 'row',
    alignItems: 'center',
    gap: ECS.spacing.md,
    ...ECS.shadow,
    elevation: 30,
  },
  deferredBannerCopy: {
    flex: 1,
    minWidth: 0,
  },
  deferredBannerTitle: {
    color: TACTICAL.text,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '800',
    letterSpacing: 0,
  },
  deferredBannerDetail: {
    marginTop: 2,
    color: TACTICAL.textMuted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
    letterSpacing: 0,
  },
});
