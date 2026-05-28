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
    if (activeSubscription) {
      activeSubscription.unsubscribe();
      activeSubscription = null;
    }
  }

  async function subscribeToConvoyLocations(convoyId: string): Promise<ConvoyTrackingStoreState> {
    const normalizedConvoyId = String(convoyId ?? '').trim();
    cleanupSubscription();
    currentMembers = [];
    currentLocations = new Map();

    if (!normalizedConvoyId) {
      setState({ ...initialState, connectionStatus: 'error', error: 'convoyId is required.' });
      return state;
    }

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

    const initial = await service.fetchInitialConvoyLocations(normalizedConvoyId);
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
      onChange: applyChange,
      onStatusChange: (connectionStatus) => {
        setState({
          ...state,
          connectionStatus,
          loading: false,
          error:
            connectionStatus === 'degraded'
              ? getConvoyBackendReadinessGuidance('realtime_unavailable').userMessage
              : state.error,
        });
      },
    });

    return state;
  }

  function stopConvoyLocationSubscription() {
    cleanupSubscription();
    currentMembers = [];
    currentLocations = new Map();
    setState({ ...initialState, connectionStatus: 'disconnected' });
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

export function subscribeToConvoyLocations(convoyId: string) {
  return convoyTrackingStore.subscribeToConvoyLocations(convoyId);
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

export function stopConvoyLocationSubscription() {
  return convoyTrackingStore.stopConvoyLocationSubscription();
}

export function useConvoyTrackingStore(): ConvoyTrackingStoreState {
  return useSyncExternalStore(
    convoyTrackingStore.subscribe,
    convoyTrackingStore.getSnapshot,
    convoyTrackingStore.getSnapshot,
  );
}
