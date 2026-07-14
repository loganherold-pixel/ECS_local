import { useSyncExternalStore } from 'react';

import { getConvoyBackendReadinessGuidance } from '../lib/convoy/convoyBackendReadiness';
import {
  ConvoyRealtimeService,
  convoyRealtimeService,
  normalizeConvoyLocationSnapshot,
  type ConvoyLocationChange,
  type ConvoyLocationSnapshot,
  type ConvoyMemberLocationRow,
  type ConvoyMemberRow,
  type ConvoyRealtimeConnectionStatus,
  type ConvoyRealtimeSubscription,
} from '../lib/convoy/convoyRealtimeService';

export interface ConvoyTrackingStoreState extends ConvoyLocationSnapshot {
  convoyId: string | null;
  rawMembers: ConvoyMemberRow[];
  rawLocations: ConvoyMemberLocationRow[];
  connectionStatus: ConvoyRealtimeConnectionStatus;
  loading: boolean;
  error: string | null;
}

type Listener = () => void;

const emptySnapshot: ConvoyLocationSnapshot = {
  members: [],
  activeCount: 0,
  staleCount: 0,
  assistanceCount: 0,
  lead: null,
  sweep: null,
  lastUpdated: null,
};

const initialState: ConvoyTrackingStoreState = {
  ...emptySnapshot,
  convoyId: null,
  rawMembers: [],
  rawLocations: [],
  connectionStatus: 'idle',
  loading: false,
  error: null,
};

export function createConvoyTrackingStore(service: ConvoyRealtimeService = convoyRealtimeService) {
  let state: ConvoyTrackingStoreState = { ...initialState };
  let activeSubscription: ConvoyRealtimeSubscription | null = null;
  let activeLoadPromise: Promise<ConvoyTrackingStoreState> | null = null;
  let subscriptionGeneration = 0;
  let ownerOrder = 0;
  const ownerRequests = new Map<string, { convoyId: string; order: number }>();
  let currentMembers: ConvoyMemberRow[] = [];
  let currentLocations = new Map<string, ConvoyMemberLocationRow>();
  const listeners = new Set<Listener>();

  function emit() {
    listeners.forEach((listener) => listener());
  }

  function setState(next: ConvoyTrackingStoreState) {
    state = next;
    emit();
  }

  function recomputeSnapshot(connectionStatus = state.connectionStatus) {
    const snapshot = normalizeConvoyLocationSnapshot(currentMembers, Array.from(currentLocations.values()));
    setState({
      ...state,
      ...snapshot,
      rawMembers: [...currentMembers],
      rawLocations: Array.from(currentLocations.values()),
      connectionStatus,
      loading: false,
    });
  }

  function applyChange(change: ConvoyLocationChange) {
    if (change.type === 'delete') {
      currentLocations.delete(change.memberId);
    } else {
      currentLocations.set(change.row.member_id, change.row);
    }
    recomputeSnapshot(state.connectionStatus);
  }

  function cleanupSubscription() {
    subscriptionGeneration += 1;
    const subscription = activeSubscription;
    activeSubscription = null;
    activeLoadPromise = null;
    subscription?.unsubscribe();
  }

  function getPreferredOwnerRequest(): { convoyId: string; order: number } | null {
    let preferred: { convoyId: string; order: number } | null = null;
    ownerRequests.forEach((request) => {
      if (!preferred || request.order > preferred.order) preferred = request;
    });
    return preferred;
  }

  async function ensureConvoyLocationSubscription(convoyId: string): Promise<ConvoyTrackingStoreState> {
    const normalizedConvoyId = String(convoyId ?? '').trim();
    if (
      normalizedConvoyId &&
      state.convoyId === normalizedConvoyId &&
      (activeSubscription || activeLoadPromise)
    ) {
      return activeLoadPromise ?? state;
    }

    cleanupSubscription();
    currentMembers = [];
    currentLocations = new Map();

    if (!normalizedConvoyId) {
      setState({ ...initialState, connectionStatus: 'error', error: 'convoyId is required.' });
      return state;
    }

    const generation = subscriptionGeneration;

    setState({
      ...state,
      ...emptySnapshot,
      convoyId: normalizedConvoyId,
      rawMembers: [],
      rawLocations: [],
      connectionStatus: 'loading',
      loading: true,
      error: null,
    });

    const loadPromise = (async () => {
      const initial = await service.fetchInitialConvoyLocations(normalizedConvoyId);
      if (generation !== subscriptionGeneration || state.convoyId !== normalizedConvoyId) {
        return state;
      }
      if (!initial.ok) {
        setState({
          ...state,
          connectionStatus: initial.code === 'backend_unavailable' ? 'disconnected' : 'error',
          loading: false,
          error: initial.error,
        });
        return state;
      }

      currentMembers = initial.data.members;
      currentLocations = new Map(initial.data.locations.map((row) => [row.member_id, row]));
      setState({
        ...state,
        ...initial.data.snapshot,
        rawMembers: [...currentMembers],
        rawLocations: Array.from(currentLocations.values()),
        connectionStatus: 'connecting',
        loading: false,
        error: null,
      });

      activeSubscription = service.subscribeToConvoyLocations(normalizedConvoyId, {
        onChange: (change) => {
          if (generation !== subscriptionGeneration || state.convoyId !== normalizedConvoyId) return;
          applyChange(change);
        },
        onStatusChange: (connectionStatus, statusError) => {
          if (generation !== subscriptionGeneration || state.convoyId !== normalizedConvoyId) return;
          setState({
            ...state,
            connectionStatus,
            loading: false,
            error:
              connectionStatus === 'degraded'
                ? statusError ?? getConvoyBackendReadinessGuidance('realtime_degraded').userMessage
                : state.error,
          });
        },
      });
      return state;
    })().catch((error) => {
      if (generation !== subscriptionGeneration || state.convoyId !== normalizedConvoyId) {
        return state;
      }
      const message = error instanceof Error && error.message.trim()
        ? error.message
        : 'Convoy location tracking could not be started.';
      setState({
        ...state,
        connectionStatus: 'error',
        loading: false,
        error: message,
      });
      return state;
    });
    activeLoadPromise = loadPromise;
    return loadPromise.finally(() => {
      if (activeLoadPromise === loadPromise) activeLoadPromise = null;
    });
  }

  async function subscribeToConvoyLocations(
    convoyId: string,
    ownerId = 'legacy',
  ): Promise<ConvoyTrackingStoreState> {
    const normalizedConvoyId = String(convoyId ?? '').trim();
    ownerOrder += 1;
    ownerRequests.set(ownerId, { convoyId: normalizedConvoyId, order: ownerOrder });
    return ensureConvoyLocationSubscription(normalizedConvoyId);
  }

  function stopConvoyLocationSubscription(ownerId?: string) {
    if (ownerId) ownerRequests.delete(ownerId);
    else ownerRequests.clear();

    const preferred = getPreferredOwnerRequest();
    if (preferred) {
      if (preferred.convoyId !== state.convoyId) {
        void ensureConvoyLocationSubscription(preferred.convoyId);
      }
      return;
    }

    cleanupSubscription();
    currentMembers = [];
    currentLocations = new Map();
    setState({ ...initialState, connectionStatus: 'disconnected' });
  }

  function refreshStalenessForCurrentTime() {
    if (!state.convoyId) return state;
    recomputeSnapshot(state.connectionStatus);
    return state;
  }

  return {
    subscribe(listener: Listener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    getSnapshot(): ConvoyTrackingStoreState {
      return state;
    },

    subscribeToConvoyLocations,
    stopConvoyLocationSubscription,
    refreshStalenessForCurrentTime,

    applyRealtimeChangeForTest(change: ConvoyLocationChange) {
      applyChange(change);
    },

    setRawTrackingDataForTest(input: {
      convoyId: string | null;
      members: ConvoyMemberRow[];
      locations: ConvoyMemberLocationRow[];
      connectionStatus?: ConvoyRealtimeConnectionStatus;
    }) {
      cleanupSubscription();
      ownerRequests.clear();
      currentMembers = input.members;
      currentLocations = new Map(input.locations.map((row) => [row.member_id, row]));
      state = {
        ...state,
        convoyId: input.convoyId,
        rawMembers: [...currentMembers],
        rawLocations: Array.from(currentLocations.values()),
        connectionStatus: input.connectionStatus ?? 'connected',
      };
      recomputeSnapshot(input.connectionStatus ?? 'connected');
    },
  };
}

export const convoyTrackingStore = createConvoyTrackingStore();

export function subscribeToConvoyLocations(convoyId: string, ownerId?: string) {
  return convoyTrackingStore.subscribeToConvoyLocations(convoyId, ownerId);
}

export function fetchConvoyTrackingSnapshot() {
  return convoyTrackingStore.getSnapshot();
}

export function setConvoyTrackingDataForTest(input: {
  convoyId: string | null;
  members: ConvoyMemberRow[];
  locations: ConvoyMemberLocationRow[];
  connectionStatus?: ConvoyRealtimeConnectionStatus;
}) {
  return convoyTrackingStore.setRawTrackingDataForTest(input);
}

export function stopConvoyLocationSubscription(ownerId?: string) {
  return convoyTrackingStore.stopConvoyLocationSubscription(ownerId);
}

export function refreshConvoyTrackingStaleness() {
  return convoyTrackingStore.refreshStalenessForCurrentTime();
}

export function useConvoyTrackingStore(): ConvoyTrackingStoreState {
  return useSyncExternalStore(
    convoyTrackingStore.subscribe,
    convoyTrackingStore.getSnapshot,
    convoyTrackingStore.getSnapshot,
  );
}
