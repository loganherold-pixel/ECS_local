/**
 * useBluConnection — React hook for BLU provider connection management.
 *
 * Provides reactive state for:
 *   - Connection lifecycle (disconnected → connecting → connected / error)
 *   - Device discovery and listing
 *   - Primary device selection
 *   - Telemetry polling status
 *   - Session restore on mount
 *   - System status (live/reconnecting/stale/disconnected/updating)
 *   - Connection success confirmation
 *   - Safe disconnect with device cleanup
 *
 * Phase 1B — EcoFlow connection flow.
 * Phase 1D — session persistence, auto-restore, system status, device switching.
 * Phase 1E — production hardening, connection success, safe disconnect.
 * Phase 2A — Multi-provider support (EcoFlow + Bluetti).
 * Phase 3A — Anker SOLIX provider support.
 * Phase 4A — Jackery provider support.
 * Phase 5A — Goal Zero provider support.
 * Phase 6A — Renogy provider support.
 * Production pass — EcoFlow canonical primary-device sync + restore hardening.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { BluDevice, BluConnectionState, BluSystemStatus } from './BluTypes';
import { bluDeviceRegistry } from './BluDeviceRegistry';
import { bluStateStore } from './BluStateStore';
import { bluSessionStore } from './BluSessionStore';
import { getSelectedEcoFlowDevice } from './useEcoFlowLive';
import {
  ecoFlowBluAdapter,
  type EcoFlowAdapterState,
} from './EcoFlowBluAdapter';
import {
  bluettiBluAdapter,
  type BluettiAdapterState,
  type BluettiDiscoveredDevice,
} from './BluettiBluAdapter';
import {
  ankerSolixBluAdapter,
  type AnkerSolixAdapterState,
  type AnkerSolixDiscoveredDevice,
} from './AnkerSolixBluAdapter';
import {
  jackeryBluAdapter,
  type JackeryAdapterState,
  type JackeryDiscoveredDevice,
} from './JackeryBluAdapter';
import {
  goalZeroBluAdapter,
  type GoalZeroAdapterState,
  type GoalZeroDiscoveredDevice,
} from './GoalZeroBluAdapter';
import {
  renogyBluAdapter,
  type RenogyAdapterState,
  type RenogyDiscoveredDevice,
} from './RenogyBluAdapter';
import {
  redarcBluAdapter,
  type RedarcAdapterState,
  type RedarcDiscoveredDevice,
} from './RedarcBluAdapter';
import {
  dakotaLithiumBluAdapter,
  type DakotaLithiumAdapterState,
  type DakotaLithiumDiscoveredDevice,
} from './DakotaLithiumBluAdapter';

// ── Hook Return Type ────────────────────────────────────────────────────

export interface BluConnectionState_Hook {
  connectionState: BluConnectionState;
  isConnecting: boolean;
  discoveredDevices: BluDevice[];
  registeredDevices: BluDevice[];
  primaryDevice: BluDevice | null;
  error: string | null;
  errorCode: string | null;
  pollCount: number;
  isPolling: boolean;

  systemStatus: BluSystemStatus;
  isReconnecting: boolean;
  reconnectAttempts: number;
  sessionRestored: boolean;

  connectionJustSucceeded: boolean;

  bluettiConnectionState: BluConnectionState;
  bluettiIsScanning: boolean;
  bluettiDiscoveredDevices: BluettiDiscoveredDevice[];
  bluettiConnectedDevices: BluDevice[];
  bluettiError: string | null;
  bluettiPollCount: number;
  bluettiIsPolling: boolean;

  ankerSolixConnectionState: BluConnectionState;
  ankerSolixIsScanning: boolean;
  ankerSolixDiscoveredDevices: AnkerSolixDiscoveredDevice[];
  ankerSolixConnectedDevices: BluDevice[];
  ankerSolixError: string | null;
  ankerSolixPollCount: number;
  ankerSolixIsPolling: boolean;

  jackeryConnectionState: BluConnectionState;
  jackeryIsScanning: boolean;
  jackeryDiscoveredDevices: JackeryDiscoveredDevice[];
  jackeryConnectedDevices: BluDevice[];
  jackeryError: string | null;
  jackeryPollCount: number;
  jackeryIsPolling: boolean;

  goalZeroConnectionState: BluConnectionState;
  goalZeroIsScanning: boolean;
  goalZeroDiscoveredDevices: GoalZeroDiscoveredDevice[];
  goalZeroConnectedDevices: BluDevice[];
  goalZeroError: string | null;
  goalZeroPollCount: number;
  goalZeroIsPolling: boolean;

  renogyConnectionState: BluConnectionState;
  renogyIsScanning: boolean;
  renogyDiscoveredDevices: RenogyDiscoveredDevice[];
  renogyConnectedDevices: BluDevice[];
  renogyError: string | null;
  renogyPollCount: number;
  renogyIsPolling: boolean;

  redarcConnectionState: BluConnectionState;
  redarcIsScanning: boolean;
  redarcDiscoveredDevices: RedarcDiscoveredDevice[];
  redarcConnectedDevices: BluDevice[];
  redarcError: string | null;
  redarcPollCount: number;
  redarcIsPolling: boolean;

  dakotaLithiumConnectionState: BluConnectionState;
  dakotaLithiumIsScanning: boolean;
  dakotaLithiumDiscoveredDevices: DakotaLithiumDiscoveredDevice[];
  dakotaLithiumConnectedDevices: BluDevice[];
  dakotaLithiumError: string | null;
  dakotaLithiumPollCount: number;
  dakotaLithiumIsPolling: boolean;

  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refreshDevices: () => Promise<void>;
  setPrimary: (deviceId: string) => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
  clearError: () => void;

  bluettiScan: () => Promise<void>;
  bluettiConnect: (deviceId?: string) => Promise<void>;
  bluettiConnectAll: () => Promise<void>;
  bluettiDisconnect: () => Promise<void>;
  bluettiStartPolling: () => void;
  bluettiStopPolling: () => void;
  bluettiRename: (deviceId: string, newName: string) => Promise<void>;

  ankerSolixScan: () => Promise<void>;
  ankerSolixConnect: (deviceId?: string) => Promise<void>;
  ankerSolixConnectAll: () => Promise<void>;
  ankerSolixDisconnect: () => Promise<void>;
  ankerSolixStartPolling: () => void;
  ankerSolixStopPolling: () => void;
  ankerSolixRename: (deviceId: string, newName: string) => Promise<void>;

  jackeryScan: () => Promise<void>;
  jackeryConnect: (deviceId?: string) => Promise<void>;
  jackeryConnectAll: () => Promise<void>;
  jackeryDisconnect: () => Promise<void>;
  jackeryStartPolling: () => void;
  jackeryStopPolling: () => void;
  jackeryRename: (deviceId: string, newName: string) => Promise<void>;

  goalZeroScan: () => Promise<void>;
  goalZeroConnect: (deviceId?: string) => Promise<void>;
  goalZeroConnectAll: () => Promise<void>;
  goalZeroDisconnect: () => Promise<void>;
  goalZeroStartPolling: () => void;
  goalZeroStopPolling: () => void;
  goalZeroRename: (deviceId: string, newName: string) => Promise<void>;

  renogyScan: () => Promise<void>;
  renogyConnect: (deviceId?: string) => Promise<void>;
  renogyConnectAll: () => Promise<void>;
  renogyDisconnect: () => Promise<void>;
  renogyStartPolling: () => void;
  renogyStopPolling: () => void;
  renogyRename: (deviceId: string, newName: string) => Promise<void>;

  redarcScan: () => Promise<void>;
  redarcConnect: (deviceId?: string) => Promise<void>;
  redarcConnectAll: () => Promise<void>;
  redarcDisconnect: () => Promise<void>;
  redarcStartPolling: () => void;
  redarcStopPolling: () => void;
  redarcRename: (deviceId: string, newName: string) => Promise<void>;

  dakotaLithiumScan: () => Promise<void>;
  dakotaLithiumConnect: (deviceId?: string) => Promise<void>;
  dakotaLithiumConnectAll: () => Promise<void>;
  dakotaLithiumDisconnect: () => Promise<void>;
  dakotaLithiumStartPolling: () => void;
  dakotaLithiumStopPolling: () => void;
  dakotaLithiumRename: (deviceId: string, newName: string) => Promise<void>;
}



type GenericProviderAdapterState = {
  connectionState: BluConnectionState;
  isScanning: boolean;
  discoveredDevices: any[];
  connectedDevices: BluDevice[];
  lastError: string | null;
  lastErrorCode?: string | null;
  pollCount: number;
  isReconnecting: boolean;
  reconnectAttempts: number;
};

const EMPTY_PROVIDER_STATE: GenericProviderAdapterState = {
  connectionState: 'disconnected',
  isScanning: false,
  discoveredDevices: [],
  connectedDevices: [],
  lastError: null,
  lastErrorCode: null,
  pollCount: 0,
  isReconnecting: false,
  reconnectAttempts: 0,
};

type SafeAdapter = {
  getState: () => GenericProviderAdapterState;
  subscribe: (cb: (s: any) => void) => () => void;
  connect: (deviceId?: string) => Promise<any>;
  connectAll: () => Promise<any[]>;
  disconnect: () => Promise<void>;
  refreshDevices: () => Promise<any>;
  restoreSession: () => Promise<boolean>;
  setPrimaryDevice: (deviceId: string) => Promise<void>;
  startPolling: (intervalMs?: number) => void;
  stopPolling: () => void;
  scanForDevices: () => Promise<void>;
  renameDevice: (deviceId: string, newName: string) => Promise<void>;
};

function createSafeAdapter(adapter: any, label: string): SafeAdapter {
  const warn = (method: string) => {
    console.warn(`[useBluConnection] ${label}.${method} unavailable — provider module missing or export mismatch.`);
  };

  return {
    getState: () => {
      try {
        if (adapter && typeof adapter.getState === 'function') {
          return { ...EMPTY_PROVIDER_STATE, ...adapter.getState() };
        }
      } catch (err) {
        console.warn(`[useBluConnection] ${label}.getState failed:`, err);
      }
      return { ...EMPTY_PROVIDER_STATE };
    },
    subscribe: (cb) => {
      try {
        if (adapter && typeof adapter.subscribe === 'function') {
          return adapter.subscribe(cb);
        }
      } catch (err) {
        console.warn(`[useBluConnection] ${label}.subscribe failed:`, err);
      }
      return () => {};
    },
    connect: async (deviceId?: string) => {
      if (adapter && typeof adapter.connect === 'function') return adapter.connect(deviceId);
      warn('connect');
      return { success: false, devices: [] };
    },
    connectAll: async () => {
      if (adapter && typeof adapter.connectAll === 'function') return adapter.connectAll();
      warn('connectAll');
      return [];
    },
    disconnect: async () => {
      if (adapter && typeof adapter.disconnect === 'function') return adapter.disconnect();
      warn('disconnect');
    },
    refreshDevices: async () => {
      if (adapter && typeof adapter.refreshDevices === 'function') return adapter.refreshDevices();
      warn('refreshDevices');
      return { success: false, devices: [] };
    },
    restoreSession: async () => {
      if (adapter && typeof adapter.restoreSession === 'function') return adapter.restoreSession();
      warn('restoreSession');
      return false;
    },
    setPrimaryDevice: async (deviceId: string) => {
      if (adapter && typeof adapter.setPrimaryDevice === 'function') return adapter.setPrimaryDevice(deviceId);
      warn('setPrimaryDevice');
    },
    startPolling: (intervalMs?: number) => {
      if (adapter && typeof adapter.startPolling === 'function') return adapter.startPolling(intervalMs);
      warn('startPolling');
    },
    stopPolling: () => {
      if (adapter && typeof adapter.stopPolling === 'function') return adapter.stopPolling();
      warn('stopPolling');
    },
    scanForDevices: async () => {
      if (adapter && typeof adapter.scanForDevices === 'function') return adapter.scanForDevices();
      warn('scanForDevices');
    },
    renameDevice: async (deviceId: string, newName: string) => {
      if (adapter && typeof adapter.renameDevice === 'function') return adapter.renameDevice(deviceId, newName);
      warn('renameDevice');
    },
  };
}

export function useBluConnection(): BluConnectionState_Hook {
  const ecoFlowAdapter = createSafeAdapter(ecoFlowBluAdapter, 'ecoFlowBluAdapter');
  const bluettiAdapter = createSafeAdapter(bluettiBluAdapter, 'bluettiBluAdapter');
  const ankerSolixAdapter = createSafeAdapter(ankerSolixBluAdapter, 'ankerSolixBluAdapter');
  const jackeryAdapter = createSafeAdapter(jackeryBluAdapter, 'jackeryBluAdapter');
  const goalZeroAdapter = createSafeAdapter(goalZeroBluAdapter, 'goalZeroBluAdapter');
  const renogyAdapter = createSafeAdapter(renogyBluAdapter, 'renogyBluAdapter');
  const redarcAdapter = createSafeAdapter(redarcBluAdapter, 'redarcBluAdapter');
  const dakotaLithiumAdapter = createSafeAdapter(dakotaLithiumBluAdapter, 'dakotaLithiumBluAdapter');
  const [adapterState, setAdapterState] = useState<GenericProviderAdapterState>(
    () => ecoFlowAdapter.getState(),
  );

  const [bluettiState, setBluettiState] = useState<GenericProviderAdapterState>(
    () => bluettiAdapter.getState(),
  );

  const [ankerSolixState, setAnkerSolixState] = useState<GenericProviderAdapterState>(
    () => ankerSolixAdapter.getState(),
  );

  const [jackeryState, setJackeryState] = useState<GenericProviderAdapterState>(
    () => jackeryAdapter.getState(),
  );

  const [goalZeroState, setGoalZeroState] = useState<GenericProviderAdapterState>(
    () => goalZeroAdapter.getState(),
  );

  const [renogyState, setRenogyState] = useState<GenericProviderAdapterState>(
    () => renogyAdapter.getState(),
  );
  const [redarcState, setRedarcState] = useState<GenericProviderAdapterState>(
    () => redarcAdapter.getState(),
  );
  const [dakotaLithiumState, setDakotaLithiumState] = useState<GenericProviderAdapterState>(
    () => dakotaLithiumAdapter.getState(),
  );

  const [registeredDevices, setRegisteredDevices] = useState<BluDevice[]>(
    () => bluDeviceRegistry.getAll(),
  );

  const [isConnecting, setIsConnecting] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [sessionRestored, setSessionRestored] = useState(false);
  const [connectionJustSucceeded, setConnectionJustSucceeded] = useState(false);
  const [bluettiIsPolling, setBluettiIsPolling] = useState(false);
  const [ankerSolixIsPolling, setAnkerSolixIsPolling] = useState(false);
  const [jackeryIsPolling, setJackeryIsPolling] = useState(false);
  const [goalZeroIsPolling, setGoalZeroIsPolling] = useState(false);
  const [renogyIsPolling, setRenogyIsPolling] = useState(false);
  const [redarcIsPolling, setRedarcIsPolling] = useState(false);
  const [dakotaLithiumIsPolling, setDakotaLithiumIsPolling] = useState(false);

  const mountedRef = useRef(true);
  const restoreAttemptedRef = useRef(false);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncedEcoFlowPrimaryRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;

    const unsubEcoFlow = ecoFlowAdapter.subscribe((s) => {
      if (mountedRef.current) setAdapterState(s);
    });
    const unsubBluetti = bluettiAdapter.subscribe((s) => {
      if (mountedRef.current) setBluettiState(s);
    });
    const unsubAnkerSolix = ankerSolixAdapter.subscribe((s) => {
      if (mountedRef.current) setAnkerSolixState(s);
    });
    const unsubJackery = jackeryAdapter.subscribe((s) => {
      if (mountedRef.current) setJackeryState(s);
    });
    const unsubGoalZero = goalZeroAdapter.subscribe((s) => {
      if (mountedRef.current) setGoalZeroState(s);
    });
    const unsubRenogy = renogyAdapter.subscribe((s) => {
      if (mountedRef.current) setRenogyState(s);
    });
    const unsubRedarc = redarcAdapter.subscribe((s) => {
      if (mountedRef.current) setRedarcState(s);
    });
    const unsubDakotaLithium = dakotaLithiumAdapter.subscribe((s) => {
      if (mountedRef.current) setDakotaLithiumState(s);
    });
    const unsubRegistry = bluDeviceRegistry.subscribe(() => {
      if (mountedRef.current) setRegisteredDevices(bluDeviceRegistry.getAll());
    });

    return () => {
      mountedRef.current = false;
      unsubEcoFlow();
      unsubBluetti();
      unsubAnkerSolix();
      unsubJackery();
      unsubGoalZero();
      unsubRenogy();
      unsubRedarc();
      unsubDakotaLithium();
      unsubRegistry();
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  const showConnectionSuccess = useCallback(() => {
    setConnectionJustSucceeded(true);
    bluStateStore.recordConnectionSuccess();
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    successTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setConnectionJustSucceeded(false);
    }, 5000);
  }, []);

  const syncEcoFlowPrimaryPreference = useCallback(async () => {
    const selectedDeviceId = getSelectedEcoFlowDevice();
    const session = bluSessionStore.getSession();

    const preferredDeviceId =
      selectedDeviceId ||
      (session.provider === 'ecoflow' ? session.primaryDeviceId : null) ||
      null;

    if (!preferredDeviceId) return;

    const ecoFlowDevices = bluDeviceRegistry.getByProvider('ecoflow');
    const exists = ecoFlowDevices.some((device) => device.device_id === preferredDeviceId);
    if (!exists) return;

    const currentPrimary = bluDeviceRegistry.getPrimary();
    if (
      currentPrimary?.provider === 'ecoflow' &&
      currentPrimary.device_id === preferredDeviceId
    ) {
      lastSyncedEcoFlowPrimaryRef.current = preferredDeviceId;
      return;
    }

    if (lastSyncedEcoFlowPrimaryRef.current === preferredDeviceId) return;

    lastSyncedEcoFlowPrimaryRef.current = preferredDeviceId;
    await ecoFlowAdapter.setPrimaryDevice(preferredDeviceId);
  }, []);

  useEffect(() => {
    const ecoFlowDevices = registeredDevices.filter((device) => device.provider === 'ecoflow');
    if (ecoFlowDevices.length === 0) return;

    void syncEcoFlowPrimaryPreference();
  }, [registeredDevices, syncEcoFlowPrimaryPreference]);

  useEffect(() => {
    if (restoreAttemptedRef.current) return;
    restoreAttemptedRef.current = true;

    const cE = ecoFlowAdapter.getState();
    const cB = bluettiAdapter.getState();
    const cA = ankerSolixAdapter.getState();
    const cJ = jackeryAdapter.getState();
    const cG = goalZeroAdapter.getState();
    const cR = renogyAdapter.getState();
    const cRedarc = redarcAdapter.getState();
    const cDakotaLithium = dakotaLithiumAdapter.getState();

    if (
      cE.connectionState === 'connected' ||
      cB.connectionState === 'connected' ||
      cA.connectionState === 'connected' ||
      cJ.connectionState === 'connected' ||
      cG.connectionState === 'connected' ||
      cR.connectionState === 'connected' ||
      cRedarc.connectionState === 'connected' ||
      cDakotaLithium.connectionState === 'connected'
    ) {
      return;
    }

    if (!bluSessionStore.hasPreviousSession()) return;

    const session = bluSessionStore.getSession();

    (async () => {
      setIsConnecting(true);
      try {
        let restored = false;

        if (session.provider === 'ecoflow') {
          const selectedEcoFlowCloudDevice = getSelectedEcoFlowDevice();

          // When ECS has an explicit cloud-selected EcoFlow device,
          // skip BLU session auto-restore so the BLE path does not
          // fight the cloud selection flow on mount.
          if (selectedEcoFlowCloudDevice) {
            restored = false;
            if (__DEV__) {
              console.log(
                `[useBluConnection] Skipping EcoFlow BLU session restore because cloud-selected device is active: ${selectedEcoFlowCloudDevice}`,
              );
            }
          } else {
            restored = await ecoFlowAdapter.restoreSession();
            if (restored) {
              await syncEcoFlowPrimaryPreference();
              if (mountedRef.current) setIsPolling(session.wasPolling);
            }
          }
        } else if (session.provider === 'bluetti') {
          restored = await bluettiAdapter.restoreSession();
          if (restored && mountedRef.current) setBluettiIsPolling(true);
        } else if (session.provider === 'anker_solix') {
          restored = await ankerSolixAdapter.restoreSession();
          if (restored && mountedRef.current) setAnkerSolixIsPolling(true);
        } else if (session.provider === 'jackery') {
          restored = await jackeryAdapter.restoreSession();
          if (restored && mountedRef.current) setJackeryIsPolling(true);
        } else if (session.provider === 'goal_zero') {
          restored = await goalZeroAdapter.restoreSession();
          if (restored && mountedRef.current) setGoalZeroIsPolling(true);
        } else if (session.provider === 'renogy') {
          restored = await renogyAdapter.restoreSession();
          if (restored && mountedRef.current) setRenogyIsPolling(true);
        } else if (session.provider === 'redarc') {
          restored = await redarcAdapter.restoreSession();
          if (restored && mountedRef.current) setRedarcIsPolling(true);
        } else if (session.provider === 'dakota_lithium') {
          restored = await dakotaLithiumAdapter.restoreSession();
          if (restored && mountedRef.current) setDakotaLithiumIsPolling(true);
        }

        if (mountedRef.current) setSessionRestored(restored);
      } catch (err) {
        console.error('[useBluConnection] Session restore error:', err);
      } finally {
        if (mountedRef.current) setIsConnecting(false);
      }
    })();
  }, [syncEcoFlowPrimaryPreference]);

  const primaryDevice = registeredDevices.find((d) => d.is_primary) ?? null;
  const systemStatus = bluStateStore?.getSystemStatus?.() ?? 'disconnected';

  const connect = useCallback(async () => {
    if (isConnecting) return;
    setIsConnecting(true);
    try {
      const result = await ecoFlowAdapter.connect();
      if (result.success) {
        await syncEcoFlowPrimaryPreference();
      }

      if (mountedRef.current && result.success && result.devices.length > 0) {
        ecoFlowAdapter.startPolling(15_000);
        setIsPolling(true);
        showConnectionSuccess();
      }
    } finally {
      if (mountedRef.current) setIsConnecting(false);
    }
  }, [isConnecting, showConnectionSuccess, syncEcoFlowPrimaryPreference]);

  const disconnect = useCallback(async () => {
    ecoFlowAdapter.stopPolling();
    setIsPolling(false);
    setSessionRestored(false);
    setConnectionJustSucceeded(false);
    lastSyncedEcoFlowPrimaryRef.current = null;
    await ecoFlowAdapter.disconnect();
  }, []);

  const refreshDevices = useCallback(async () => {
    setIsConnecting(true);
    try {
      const result = await ecoFlowAdapter.refreshDevices();
      if (result.success) {
        await syncEcoFlowPrimaryPreference();
      }
    } finally {
      if (mountedRef.current) setIsConnecting(false);
    }
  }, [syncEcoFlowPrimaryPreference]);

  const setPrimary = useCallback(async (deviceId: string) => {
    const device = bluDeviceRegistry.getAll().find((d) => d.device_id === deviceId);
    if (!device) return;

    if (device.provider === 'ecoflow') {
      lastSyncedEcoFlowPrimaryRef.current = deviceId;
      await ecoFlowAdapter.setPrimaryDevice(deviceId);
    } else if (device.provider === 'bluetti') {
      await bluettiAdapter.setPrimaryDevice(deviceId);
    } else if (device.provider === 'anker_solix') {
      await ankerSolixAdapter.setPrimaryDevice(deviceId);
    } else if (device.provider === 'jackery') {
      await jackeryAdapter.setPrimaryDevice(deviceId);
    } else if (device.provider === 'goal_zero') {
      await goalZeroAdapter.setPrimaryDevice(deviceId);
    } else if (device.provider === 'renogy') {
      await renogyAdapter.setPrimaryDevice(deviceId);
    } else if (device.provider === 'redarc') {
      await redarcAdapter.setPrimaryDevice(deviceId);
    } else if (device.provider === 'dakota_lithium') {
      await dakotaLithiumAdapter.setPrimaryDevice(deviceId);
    } else {
      await bluDeviceRegistry.setPrimary(device.provider, deviceId);
    }
  }, []);

  const startPolling = useCallback(() => {
    ecoFlowAdapter.startPolling(15_000);
    setIsPolling(true);
  }, []);

  const stopPolling = useCallback(() => {
    ecoFlowAdapter.stopPolling();
    setIsPolling(false);
  }, []);

  const clearError = useCallback(() => {
    setAdapterState((prev) => ({
      ...prev,
      lastError: null,
      lastErrorCode: null,
    }));
  }, []);

  const bluettiScan = useCallback(async () => {
    await bluettiAdapter.scanForDevices();
  }, []);

  const bluettiConnect = useCallback(async (deviceId?: string) => {
    const result = await bluettiAdapter.connect(deviceId);
    if (mountedRef.current && result.success) {
      bluettiAdapter.startPolling(15_000);
      setBluettiIsPolling(true);
      showConnectionSuccess();
    }
  }, [showConnectionSuccess]);

  const bluettiConnectAll = useCallback(async () => {
    const results = await bluettiAdapter.connectAll();
    if (mountedRef.current && results.some((r) => r.success)) {
      bluettiAdapter.startPolling(15_000);
      setBluettiIsPolling(true);
      showConnectionSuccess();
    }
  }, [showConnectionSuccess]);

  const bluettiDisconnect = useCallback(async () => {
    bluettiAdapter.stopPolling();
    setBluettiIsPolling(false);
    await bluettiAdapter.disconnect();
  }, []);

  const bluettiStartPolling = useCallback(() => {
    bluettiAdapter.startPolling(15_000);
    setBluettiIsPolling(true);
  }, []);

  const bluettiStopPolling = useCallback(() => {
    bluettiAdapter.stopPolling();
    setBluettiIsPolling(false);
  }, []);

  const bluettiRename = useCallback(async (deviceId: string, newName: string) => {
    await bluettiAdapter.renameDevice(deviceId, newName);
  }, []);

  const ankerSolixScan = useCallback(async () => {
    await ankerSolixAdapter.scanForDevices();
  }, []);

  const ankerSolixConnect = useCallback(async (deviceId?: string) => {
    const result = await ankerSolixAdapter.connect(deviceId);
    if (mountedRef.current && result.success) {
      ankerSolixAdapter.startPolling(15_000);
      setAnkerSolixIsPolling(true);
      showConnectionSuccess();
    }
  }, [showConnectionSuccess]);

  const ankerSolixConnectAll = useCallback(async () => {
    const results = await ankerSolixAdapter.connectAll();
    if (mountedRef.current && results.some((r) => r.success)) {
      ankerSolixAdapter.startPolling(15_000);
      setAnkerSolixIsPolling(true);
      showConnectionSuccess();
    }
  }, [showConnectionSuccess]);

  const ankerSolixDisconnect = useCallback(async () => {
    ankerSolixAdapter.stopPolling();
    setAnkerSolixIsPolling(false);
    await ankerSolixAdapter.disconnect();
  }, []);

  const ankerSolixStartPolling = useCallback(() => {
    ankerSolixAdapter.startPolling(15_000);
    setAnkerSolixIsPolling(true);
  }, []);

  const ankerSolixStopPolling = useCallback(() => {
    ankerSolixAdapter.stopPolling();
    setAnkerSolixIsPolling(false);
  }, []);

  const ankerSolixRename = useCallback(async (deviceId: string, newName: string) => {
    await ankerSolixAdapter.renameDevice(deviceId, newName);
  }, []);

  const jackeryScan = useCallback(async () => {
    await jackeryAdapter.scanForDevices();
  }, []);

  const jackeryConnect = useCallback(async (deviceId?: string) => {
    const result = await jackeryAdapter.connect(deviceId);
    if (mountedRef.current && result.success) {
      jackeryAdapter.startPolling(15_000);
      setJackeryIsPolling(true);
      showConnectionSuccess();
    }
  }, [showConnectionSuccess]);

  const jackeryConnectAll = useCallback(async () => {
    const results = await jackeryAdapter.connectAll();
    if (mountedRef.current && results.some((r) => r.success)) {
      jackeryAdapter.startPolling(15_000);
      setJackeryIsPolling(true);
      showConnectionSuccess();
    }
  }, [showConnectionSuccess]);

  const jackeryDisconnect = useCallback(async () => {
    jackeryAdapter.stopPolling();
    setJackeryIsPolling(false);
    await jackeryAdapter.disconnect();
  }, []);

  const jackeryStartPolling = useCallback(() => {
    jackeryAdapter.startPolling(15_000);
    setJackeryIsPolling(true);
  }, []);

  const jackeryStopPolling = useCallback(() => {
    jackeryAdapter.stopPolling();
    setJackeryIsPolling(false);
  }, []);

  const jackeryRename = useCallback(async (deviceId: string, newName: string) => {
    await jackeryAdapter.renameDevice(deviceId, newName);
  }, []);

  const goalZeroScan = useCallback(async () => {
    await goalZeroAdapter.scanForDevices();
  }, []);

  const goalZeroConnect = useCallback(async (deviceId?: string) => {
    const result = await goalZeroAdapter.connect(deviceId);
    if (mountedRef.current && result.success) {
      goalZeroAdapter.startPolling(15_000);
      setGoalZeroIsPolling(true);
      showConnectionSuccess();
    }
  }, [showConnectionSuccess]);

  const goalZeroConnectAll = useCallback(async () => {
    const results = await goalZeroAdapter.connectAll();
    if (mountedRef.current && results.some((r) => r.success)) {
      goalZeroAdapter.startPolling(15_000);
      setGoalZeroIsPolling(true);
      showConnectionSuccess();
    }
  }, [showConnectionSuccess]);

  const goalZeroDisconnect = useCallback(async () => {
    goalZeroAdapter.stopPolling();
    setGoalZeroIsPolling(false);
    await goalZeroAdapter.disconnect();
  }, []);

  const goalZeroStartPolling = useCallback(() => {
    goalZeroAdapter.startPolling(15_000);
    setGoalZeroIsPolling(true);
  }, []);

  const goalZeroStopPolling = useCallback(() => {
    goalZeroAdapter.stopPolling();
    setGoalZeroIsPolling(false);
  }, []);

  const goalZeroRename = useCallback(async (deviceId: string, newName: string) => {
    await goalZeroAdapter.renameDevice(deviceId, newName);
  }, []);

  const renogyScan = useCallback(async () => {
    await renogyAdapter.scanForDevices();
  }, []);

  const renogyConnect = useCallback(async (deviceId?: string) => {
    const result = await renogyAdapter.connect(deviceId);
    if (mountedRef.current && result.success) {
      renogyAdapter.startPolling(15_000);
      setRenogyIsPolling(true);
      showConnectionSuccess();
    }
  }, [showConnectionSuccess]);

  const renogyConnectAll = useCallback(async () => {
    const results = await renogyAdapter.connectAll();
    if (mountedRef.current && results.some((r) => r.success)) {
      renogyAdapter.startPolling(15_000);
      setRenogyIsPolling(true);
      showConnectionSuccess();
    }
  }, [showConnectionSuccess]);

  const renogyDisconnect = useCallback(async () => {
    renogyAdapter.stopPolling();
    setRenogyIsPolling(false);
    await renogyAdapter.disconnect();
  }, []);

  const renogyStartPolling = useCallback(() => {
    renogyAdapter.startPolling(15_000);
    setRenogyIsPolling(true);
  }, []);

  const renogyStopPolling = useCallback(() => {
    renogyAdapter.stopPolling();
    setRenogyIsPolling(false);
  }, []);

  const renogyRename = useCallback(async (deviceId: string, newName: string) => {
    await renogyAdapter.renameDevice(deviceId, newName);
  }, []);

  const redarcScan = useCallback(async () => {
    await redarcAdapter.scanForDevices();
  }, []);

  const redarcConnect = useCallback(async (deviceId?: string) => {
    const result = await redarcAdapter.connect(deviceId);
    if (mountedRef.current && result.success) {
      redarcAdapter.startPolling(15_000);
      setRedarcIsPolling(true);
      showConnectionSuccess();
    }
  }, [showConnectionSuccess]);

  const redarcConnectAll = useCallback(async () => {
    const results = await redarcAdapter.connectAll();
    if (mountedRef.current && results.some((r) => r.success)) {
      redarcAdapter.startPolling(15_000);
      setRedarcIsPolling(true);
      showConnectionSuccess();
    }
  }, [showConnectionSuccess]);

  const redarcDisconnect = useCallback(async () => {
    redarcAdapter.stopPolling();
    setRedarcIsPolling(false);
    await redarcAdapter.disconnect();
  }, []);

  const redarcStartPolling = useCallback(() => {
    redarcAdapter.startPolling(15_000);
    setRedarcIsPolling(true);
  }, []);

  const redarcStopPolling = useCallback(() => {
    redarcAdapter.stopPolling();
    setRedarcIsPolling(false);
  }, []);

  const redarcRename = useCallback(async (deviceId: string, newName: string) => {
    await redarcAdapter.renameDevice(deviceId, newName);
  }, []);

  const dakotaLithiumScan = useCallback(async () => {
    await dakotaLithiumAdapter.scanForDevices();
  }, []);

  const dakotaLithiumConnect = useCallback(async (deviceId?: string) => {
    const result = await dakotaLithiumAdapter.connect(deviceId);
    if (mountedRef.current && result.success) {
      dakotaLithiumAdapter.startPolling(15_000);
      setDakotaLithiumIsPolling(true);
      showConnectionSuccess();
    }
  }, [showConnectionSuccess]);

  const dakotaLithiumConnectAll = useCallback(async () => {
    const results = await dakotaLithiumAdapter.connectAll();
    if (mountedRef.current && results.some((r) => r.success)) {
      dakotaLithiumAdapter.startPolling(15_000);
      setDakotaLithiumIsPolling(true);
      showConnectionSuccess();
    }
  }, [showConnectionSuccess]);

  const dakotaLithiumDisconnect = useCallback(async () => {
    dakotaLithiumAdapter.stopPolling();
    setDakotaLithiumIsPolling(false);
    await dakotaLithiumAdapter.disconnect();
  }, []);

  const dakotaLithiumStartPolling = useCallback(() => {
    dakotaLithiumAdapter.startPolling(15_000);
    setDakotaLithiumIsPolling(true);
  }, []);

  const dakotaLithiumStopPolling = useCallback(() => {
    dakotaLithiumAdapter.stopPolling();
    setDakotaLithiumIsPolling(false);
  }, []);

  const dakotaLithiumRename = useCallback(async (deviceId: string, newName: string) => {
    await dakotaLithiumAdapter.renameDevice(deviceId, newName);
  }, []);

  return {
    connectionState: adapterState.connectionState,
    isConnecting,
    discoveredDevices: adapterState.discoveredDevices,
    registeredDevices,
    primaryDevice,
    error: adapterState.lastError,
    errorCode: adapterState.lastErrorCode ?? null,
    pollCount: adapterState.pollCount,
    isPolling,
    systemStatus,
    isReconnecting:
      adapterState.isReconnecting ||
      bluettiState.isReconnecting ||
      ankerSolixState.isReconnecting ||
      jackeryState.isReconnecting ||
      goalZeroState.isReconnecting ||
      renogyState.isReconnecting ||
      redarcState.isReconnecting ||
      dakotaLithiumState.isReconnecting,
    reconnectAttempts:
      adapterState.reconnectAttempts +
      bluettiState.reconnectAttempts +
      ankerSolixState.reconnectAttempts +
      jackeryState.reconnectAttempts +
      goalZeroState.reconnectAttempts +
      renogyState.reconnectAttempts +
      redarcState.reconnectAttempts +
      dakotaLithiumState.reconnectAttempts,
    sessionRestored,
    connectionJustSucceeded,

    bluettiConnectionState: bluettiState.connectionState,
    bluettiIsScanning: bluettiState.isScanning,
    bluettiDiscoveredDevices: bluettiState.discoveredDevices,
    bluettiConnectedDevices: bluettiState.connectedDevices,
    bluettiError: bluettiState.lastError,
    bluettiPollCount: bluettiState.pollCount,
    bluettiIsPolling,

    ankerSolixConnectionState: ankerSolixState.connectionState,
    ankerSolixIsScanning: ankerSolixState.isScanning,
    ankerSolixDiscoveredDevices: ankerSolixState.discoveredDevices,
    ankerSolixConnectedDevices: ankerSolixState.connectedDevices,
    ankerSolixError: ankerSolixState.lastError,
    ankerSolixPollCount: ankerSolixState.pollCount,
    ankerSolixIsPolling,

    jackeryConnectionState: jackeryState.connectionState,
    jackeryIsScanning: jackeryState.isScanning,
    jackeryDiscoveredDevices: jackeryState.discoveredDevices,
    jackeryConnectedDevices: jackeryState.connectedDevices,
    jackeryError: jackeryState.lastError,
    jackeryPollCount: jackeryState.pollCount,
    jackeryIsPolling,

    goalZeroConnectionState: goalZeroState.connectionState,
    goalZeroIsScanning: goalZeroState.isScanning,
    goalZeroDiscoveredDevices: goalZeroState.discoveredDevices,
    goalZeroConnectedDevices: goalZeroState.connectedDevices,
    goalZeroError: goalZeroState.lastError,
    goalZeroPollCount: goalZeroState.pollCount,
    goalZeroIsPolling,

    renogyConnectionState: renogyState.connectionState,
    renogyIsScanning: renogyState.isScanning,
    renogyDiscoveredDevices: renogyState.discoveredDevices,
    renogyConnectedDevices: renogyState.connectedDevices,
    renogyError: renogyState.lastError,
    renogyPollCount: renogyState.pollCount,
    renogyIsPolling,

    redarcConnectionState: redarcState.connectionState,
    redarcIsScanning: redarcState.isScanning,
    redarcDiscoveredDevices: redarcState.discoveredDevices,
    redarcConnectedDevices: redarcState.connectedDevices,
    redarcError: redarcState.lastError,
    redarcPollCount: redarcState.pollCount,
    redarcIsPolling,

    dakotaLithiumConnectionState: dakotaLithiumState.connectionState,
    dakotaLithiumIsScanning: dakotaLithiumState.isScanning,
    dakotaLithiumDiscoveredDevices: dakotaLithiumState.discoveredDevices,
    dakotaLithiumConnectedDevices: dakotaLithiumState.connectedDevices,
    dakotaLithiumError: dakotaLithiumState.lastError,
    dakotaLithiumPollCount: dakotaLithiumState.pollCount,
    dakotaLithiumIsPolling,

    connect,
    disconnect,
    refreshDevices,
    setPrimary,
    startPolling,
    stopPolling,
    clearError,

    bluettiScan,
    bluettiConnect,
    bluettiConnectAll,
    bluettiDisconnect,
    bluettiStartPolling,
    bluettiStopPolling,
    bluettiRename,

    ankerSolixScan,
    ankerSolixConnect,
    ankerSolixConnectAll,
    ankerSolixDisconnect,
    ankerSolixStartPolling,
    ankerSolixStopPolling,
    ankerSolixRename,

    jackeryScan,
    jackeryConnect,
    jackeryConnectAll,
    jackeryDisconnect,
    jackeryStartPolling,
    jackeryStopPolling,
    jackeryRename,

    goalZeroScan,
    goalZeroConnect,
    goalZeroConnectAll,
    goalZeroDisconnect,
    goalZeroStartPolling,
    goalZeroStopPolling,
    goalZeroRename,

    renogyScan,
    renogyConnect,
    renogyConnectAll,
    renogyDisconnect,
    renogyStartPolling,
    renogyStopPolling,
    renogyRename,

    redarcScan,
    redarcConnect,
    redarcConnectAll,
    redarcDisconnect,
    redarcStartPolling,
    redarcStopPolling,
    redarcRename,

    dakotaLithiumScan,
    dakotaLithiumConnect,
    dakotaLithiumConnectAll,
    dakotaLithiumDisconnect,
    dakotaLithiumStartPolling,
    dakotaLithiumStopPolling,
    dakotaLithiumRename,
  };
}

export default useBluConnection;
