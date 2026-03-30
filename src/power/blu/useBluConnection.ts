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
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { BluDevice, BluConnectionState, BluSystemStatus } from './BluTypes';
import { bluDeviceRegistry } from './BluDeviceRegistry';
import { bluStateStore } from './BluStateStore';
import { bluSessionStore } from './BluSessionStore';
import {
  ecoFlowBluAdapter,
  type EcoFlowAdapterState,
} from './adapters/EcoFlowBluAdapter';
import {
  bluettiBluAdapter,
  type BluettiAdapterState,
  type BluettiDiscoveredDevice,
} from './adapters/BluettiBluAdapter';
import {
  ankerSolixBluAdapter,
  type AnkerSolixAdapterState,
  type AnkerSolixDiscoveredDevice,
} from './adapters/AnkerSolixBluAdapter';
import {
  jackeryBluAdapter,
  type JackeryAdapterState,
  type JackeryDiscoveredDevice,
} from './adapters/JackeryBluAdapter';
import {
  goalZeroBluAdapter,
  type GoalZeroAdapterState,
  type GoalZeroDiscoveredDevice,
} from './adapters/GoalZeroBluAdapter';
import {
  renogyBluAdapter,
  type RenogyAdapterState,
  type RenogyDiscoveredDevice,
} from './adapters/RenogyBluAdapter';

// ── Hook Return Type ────────────────────────────────────────────────────

export interface BluConnectionState_Hook {
  /** Current connection state for the EcoFlow provider */
  connectionState: BluConnectionState;
  /** Whether a connection attempt is in progress */
  isConnecting: boolean;
  /** Discovered devices from the provider */
  discoveredDevices: BluDevice[];
  /** All registered BLU devices (from registry) */
  registeredDevices: BluDevice[];
  /** The current primary device */
  primaryDevice: BluDevice | null;
  /** Last error message (user-friendly) */
  error: string | null;
  /** Last error code */
  errorCode: string | null;
  /** Number of successful telemetry polls */
  pollCount: number;
  /** Whether telemetry is actively being polled */
  isPolling: boolean;

  // ── Phase 1D additions ────────────────────────────────────────────

  /** High-level BLU system status */
  systemStatus: BluSystemStatus;
  /** Whether a quiet reconnect is in progress */
  isReconnecting: boolean;
  /** Number of reconnect attempts */
  reconnectAttempts: number;
  /** Whether a previous session was restored */
  sessionRestored: boolean;

  // ── Phase 1E additions ────────────────────────────────────────────

  /** Whether a connection success was recently confirmed (within 5s) */
  connectionJustSucceeded: boolean;

  // ── Phase 2A: Bluetti additions ───────────────────────────────────

  /** Bluetti adapter connection state */
  bluettiConnectionState: BluConnectionState;
  /** Whether Bluetti is currently scanning for BLE devices */
  bluettiIsScanning: boolean;
  /** Discovered Bluetti BLE devices */
  bluettiDiscoveredDevices: BluettiDiscoveredDevice[];
  /** Connected Bluetti devices */
  bluettiConnectedDevices: BluDevice[];
  /** Bluetti-specific error */
  bluettiError: string | null;
  /** Bluetti poll count */
  bluettiPollCount: number;
  /** Whether Bluetti is actively polling */
  bluettiIsPolling: boolean;

  // ── Phase 3A: Anker SOLIX additions ───────────────────────────────

  /** Anker SOLIX adapter connection state */
  ankerSolixConnectionState: BluConnectionState;
  /** Whether Anker SOLIX is currently scanning for BLE devices */
  ankerSolixIsScanning: boolean;
  /** Discovered Anker SOLIX BLE devices */
  ankerSolixDiscoveredDevices: AnkerSolixDiscoveredDevice[];
  /** Connected Anker SOLIX devices */
  ankerSolixConnectedDevices: BluDevice[];
  /** Anker SOLIX-specific error */
  ankerSolixError: string | null;
  /** Anker SOLIX poll count */
  ankerSolixPollCount: number;
  /** Whether Anker SOLIX is actively polling */
  ankerSolixIsPolling: boolean;

  // ── Phase 4A: Jackery additions ───────────────────────────────────

  /** Jackery adapter connection state */
  jackeryConnectionState: BluConnectionState;
  /** Whether Jackery is currently scanning for BLE devices */
  jackeryIsScanning: boolean;
  /** Discovered Jackery BLE devices */
  jackeryDiscoveredDevices: JackeryDiscoveredDevice[];
  /** Connected Jackery devices */
  jackeryConnectedDevices: BluDevice[];
  /** Jackery-specific error */
  jackeryError: string | null;
  /** Jackery poll count */
  jackeryPollCount: number;
  /** Whether Jackery is actively polling */
  jackeryIsPolling: boolean;

  // ── Phase 5A: Goal Zero additions ─────────────────────────────────

  /** Goal Zero adapter connection state */
  goalZeroConnectionState: BluConnectionState;
  /** Whether Goal Zero is currently scanning for BLE devices */
  goalZeroIsScanning: boolean;
  /** Discovered Goal Zero BLE devices */
  goalZeroDiscoveredDevices: GoalZeroDiscoveredDevice[];
  /** Connected Goal Zero devices */
  goalZeroConnectedDevices: BluDevice[];
  /** Goal Zero-specific error */
  goalZeroError: string | null;
  /** Goal Zero poll count */
  goalZeroPollCount: number;
  /** Whether Goal Zero is actively polling */
  goalZeroIsPolling: boolean;

  // ── Phase 6A: Renogy additions ────────────────────────────────────

  /** Renogy adapter connection state */
  renogyConnectionState: BluConnectionState;
  /** Whether Renogy is currently scanning for BLE devices */
  renogyIsScanning: boolean;
  /** Discovered Renogy BLE devices */
  renogyDiscoveredDevices: RenogyDiscoveredDevice[];
  /** Connected Renogy devices */
  renogyConnectedDevices: BluDevice[];
  /** Renogy-specific error */
  renogyError: string | null;
  /** Renogy poll count */
  renogyPollCount: number;
  /** Whether Renogy is actively polling */
  renogyIsPolling: boolean;

  // ── Actions ──────────────────────────────────────────────────────


  /** Connect to EcoFlow and discover devices */
  connect: () => Promise<void>;
  /** Disconnect from EcoFlow — clears devices and reverts widgets */
  disconnect: () => Promise<void>;
  /** Refresh the device list */
  refreshDevices: () => Promise<void>;
  /** Set a device as the primary power source */
  setPrimary: (deviceId: string) => Promise<void>;
  /** Start automatic telemetry polling */
  startPolling: () => void;
  /** Stop automatic telemetry polling */
  stopPolling: () => void;
  /** Clear the last error */
  clearError: () => void;

  // ── Phase 2A: Bluetti actions ─────────────────────────────────────

  /** Scan for nearby Bluetti BLE devices */
  bluettiScan: () => Promise<void>;
  /** Connect to a Bluetti device (by ID, or first available) */
  bluettiConnect: (deviceId?: string) => Promise<void>;
  /** Connect to all discovered Bluetti devices */
  bluettiConnectAll: () => Promise<void>;
  /** Disconnect from all Bluetti devices */
  bluettiDisconnect: () => Promise<void>;
  /** Start Bluetti telemetry polling */
  bluettiStartPolling: () => void;
  /** Stop Bluetti telemetry polling */
  bluettiStopPolling: () => void;
  /** Rename a Bluetti device */
  bluettiRename: (deviceId: string, newName: string) => Promise<void>;

  // ── Phase 3A: Anker SOLIX actions ─────────────────────────────────

  /** Scan for nearby Anker SOLIX BLE devices */
  ankerSolixScan: () => Promise<void>;
  /** Connect to an Anker SOLIX device (by ID, or first available) */
  ankerSolixConnect: (deviceId?: string) => Promise<void>;
  /** Connect to all discovered Anker SOLIX devices */
  ankerSolixConnectAll: () => Promise<void>;
  /** Disconnect from all Anker SOLIX devices */
  ankerSolixDisconnect: () => Promise<void>;
  /** Start Anker SOLIX telemetry polling */
  ankerSolixStartPolling: () => void;
  /** Stop Anker SOLIX telemetry polling */
  ankerSolixStopPolling: () => void;
  /** Rename an Anker SOLIX device */
  ankerSolixRename: (deviceId: string, newName: string) => Promise<void>;

  // ── Phase 4A: Jackery actions ─────────────────────────────────────

  /** Scan for nearby Jackery BLE devices */
  jackeryScan: () => Promise<void>;
  /** Connect to a Jackery device (by ID, or first available) */
  jackeryConnect: (deviceId?: string) => Promise<void>;
  /** Connect to all discovered Jackery devices */
  jackeryConnectAll: () => Promise<void>;
  /** Disconnect from all Jackery devices */
  jackeryDisconnect: () => Promise<void>;
  /** Start Jackery telemetry polling */
  jackeryStartPolling: () => void;
  /** Stop Jackery telemetry polling */
  jackeryStopPolling: () => void;
  /** Rename a Jackery device */
  jackeryRename: (deviceId: string, newName: string) => Promise<void>;

  // ── Phase 5A: Goal Zero actions ───────────────────────────────────

  /** Scan for nearby Goal Zero BLE devices */
  goalZeroScan: () => Promise<void>;
  /** Connect to a Goal Zero device (by ID, or first available) */
  goalZeroConnect: (deviceId?: string) => Promise<void>;
  /** Connect to all discovered Goal Zero devices */
  goalZeroConnectAll: () => Promise<void>;
  /** Disconnect from all Goal Zero devices */
  goalZeroDisconnect: () => Promise<void>;
  /** Start Goal Zero telemetry polling */
  goalZeroStartPolling: () => void;
  /** Stop Goal Zero telemetry polling */
  goalZeroStopPolling: () => void;
  /** Rename a Goal Zero device */
  goalZeroRename: (deviceId: string, newName: string) => Promise<void>;

  // ── Phase 6A: Renogy actions ──────────────────────────────────────

  /** Scan for nearby Renogy BLE devices */
  renogyScan: () => Promise<void>;
  /** Connect to a Renogy device (by ID, or first available) */
  renogyConnect: (deviceId?: string) => Promise<void>;
  /** Connect to all discovered Renogy devices */
  renogyConnectAll: () => Promise<void>;
  /** Disconnect from all Renogy devices */
  renogyDisconnect: () => Promise<void>;
  /** Start Renogy telemetry polling */
  renogyStartPolling: () => void;
  /** Stop Renogy telemetry polling */
  renogyStopPolling: () => void;
  /** Rename a Renogy device */
  renogyRename: (deviceId: string, newName: string) => Promise<void>;
}


// ── Hook Implementation ─────────────────────────────────────────────────

export function useBluConnection(): BluConnectionState_Hook {
  // ── EcoFlow adapter state ──────────────────────────────────────────
  const [adapterState, setAdapterState] = useState<EcoFlowAdapterState>(
    () => ecoFlowBluAdapter.getState(),
  );

  // ── Bluetti adapter state ──────────────────────────────────────────
  const [bluettiState, setBluettiState] = useState<BluettiAdapterState>(
    () => bluettiBluAdapter.getState(),
  );

  // ── Anker SOLIX adapter state ──────────────────────────────────────
  const [ankerSolixState, setAnkerSolixState] = useState<AnkerSolixAdapterState>(
    () => ankerSolixBluAdapter.getState(),
  );

  // ── Jackery adapter state ──────────────────────────────────────────
  const [jackeryState, setJackeryState] = useState<JackeryAdapterState>(
    () => jackeryBluAdapter.getState(),
  );

  // ── Goal Zero adapter state ────────────────────────────────────────
  const [goalZeroState, setGoalZeroState] = useState<GoalZeroAdapterState>(
    () => goalZeroBluAdapter.getState(),
  );

  // ── Renogy adapter state ──────────────────────────────────────────
  const [renogyState, setRenogyState] = useState<RenogyAdapterState>(
    () => renogyBluAdapter.getState(),
  );

  // ── Registry state ─────────────────────────────────────────────────
  const [registeredDevices, setRegisteredDevices] = useState<BluDevice[]>(
    () => bluDeviceRegistry.getAll(),
  );

  // ── Local UI state ─────────────────────────────────────────────────
  const [isConnecting, setIsConnecting] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [sessionRestored, setSessionRestored] = useState(false);
  const [connectionJustSucceeded, setConnectionJustSucceeded] = useState(false);
  const [bluettiIsPolling, setBluettiIsPolling] = useState(false);
  const [ankerSolixIsPolling, setAnkerSolixIsPolling] = useState(false);
  const [jackeryIsPolling, setJackeryIsPolling] = useState(false);
  const [goalZeroIsPolling, setGoalZeroIsPolling] = useState(false);
  const [renogyIsPolling, setRenogyIsPolling] = useState(false);
  const mountedRef = useRef(true);
  const restoreAttemptedRef = useRef(false);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Subscribe to adapter and registry changes ──────────────────────
  useEffect(() => {
    mountedRef.current = true;
    const unsubEcoFlow = ecoFlowBluAdapter.subscribe((s) => { if (mountedRef.current) setAdapterState(s); });
    const unsubBluetti = bluettiBluAdapter.subscribe((s) => { if (mountedRef.current) setBluettiState(s); });
    const unsubAnkerSolix = ankerSolixBluAdapter.subscribe((s) => { if (mountedRef.current) setAnkerSolixState(s); });
    const unsubJackery = jackeryBluAdapter.subscribe((s) => { if (mountedRef.current) setJackeryState(s); });
    const unsubGoalZero = goalZeroBluAdapter.subscribe((s) => { if (mountedRef.current) setGoalZeroState(s); });
    const unsubRenogy = renogyBluAdapter.subscribe((s) => { if (mountedRef.current) setRenogyState(s); });
    const unsubRegistry = bluDeviceRegistry.subscribe(() => { if (mountedRef.current) setRegisteredDevices(bluDeviceRegistry.getAll()); });
    return () => {
      mountedRef.current = false;
      unsubEcoFlow(); unsubBluetti(); unsubAnkerSolix(); unsubJackery(); unsubGoalZero(); unsubRenogy(); unsubRegistry();
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  // ── Session restore on mount ───────────────────────────────────────
  useEffect(() => {
    if (restoreAttemptedRef.current) return;
    restoreAttemptedRef.current = true;
    const cE = ecoFlowBluAdapter.getState(); const cB = bluettiBluAdapter.getState();
    const cA = ankerSolixBluAdapter.getState(); const cJ = jackeryBluAdapter.getState();
    const cG = goalZeroBluAdapter.getState(); const cR = renogyBluAdapter.getState();
    if (cE.connectionState === 'connected' || cB.connectionState === 'connected' || cA.connectionState === 'connected' || cJ.connectionState === 'connected' || cG.connectionState === 'connected' || cR.connectionState === 'connected') return;
    if (!bluSessionStore.hasPreviousSession()) return;
    const session = bluSessionStore.getSession();
    (async () => {
      setIsConnecting(true);
      try {
        let restored = false;
        if (session.provider === 'ecoflow') { restored = await ecoFlowBluAdapter.restoreSession(); if (restored && mountedRef.current) setIsPolling(true); }
        else if (session.provider === 'bluetti') { restored = await bluettiBluAdapter.restoreSession(); if (restored && mountedRef.current) setBluettiIsPolling(true); }
        else if (session.provider === 'anker_solix') { restored = await ankerSolixBluAdapter.restoreSession(); if (restored && mountedRef.current) setAnkerSolixIsPolling(true); }
        else if (session.provider === 'jackery') { restored = await jackeryBluAdapter.restoreSession(); if (restored && mountedRef.current) setJackeryIsPolling(true); }
        else if (session.provider === 'goal_zero') { restored = await goalZeroBluAdapter.restoreSession(); if (restored && mountedRef.current) setGoalZeroIsPolling(true); }
        else if (session.provider === 'renogy') { restored = await renogyBluAdapter.restoreSession(); if (restored && mountedRef.current) setRenogyIsPolling(true); }
        if (mountedRef.current) setSessionRestored(restored);
      } catch (err) { console.error('[useBluConnection] Session restore error:', err); }
      finally { if (mountedRef.current) setIsConnecting(false); }
    })();
  }, []);

  const primaryDevice = registeredDevices.find((d) => d.is_primary) ?? null;
  const systemStatus = bluStateStore.getSystemStatus();
  const showConnectionSuccess = useCallback(() => {
    setConnectionJustSucceeded(true); bluStateStore.recordConnectionSuccess();
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    successTimerRef.current = setTimeout(() => { if (mountedRef.current) setConnectionJustSucceeded(false); }, 5000);
  }, []);

  // ── EcoFlow Actions ────────────────────────────────────────────────
  const connect = useCallback(async () => { if (isConnecting) return; setIsConnecting(true); try { const r = await ecoFlowBluAdapter.connect(); if (mountedRef.current && r.success && r.devices.length > 0) { ecoFlowBluAdapter.startPolling(15_000); setIsPolling(true); showConnectionSuccess(); } } finally { if (mountedRef.current) setIsConnecting(false); } }, [isConnecting, showConnectionSuccess]);
  const disconnect = useCallback(async () => { ecoFlowBluAdapter.stopPolling(); setIsPolling(false); setSessionRestored(false); setConnectionJustSucceeded(false); await ecoFlowBluAdapter.disconnect(); }, []);
  const refreshDevices = useCallback(async () => { setIsConnecting(true); try { await ecoFlowBluAdapter.refreshDevices(); } finally { if (mountedRef.current) setIsConnecting(false); } }, []);
  const setPrimary = useCallback(async (deviceId: string) => {
    const device = bluDeviceRegistry.getAll().find((d) => d.device_id === deviceId); if (!device) return;
    if (device.provider === 'ecoflow') await ecoFlowBluAdapter.setPrimaryDevice(deviceId);
    else if (device.provider === 'bluetti') await bluettiBluAdapter.setPrimaryDevice(deviceId);
    else if (device.provider === 'anker_solix') await ankerSolixBluAdapter.setPrimaryDevice(deviceId);
    else if (device.provider === 'jackery') await jackeryBluAdapter.setPrimaryDevice(deviceId);
    else if (device.provider === 'goal_zero') await goalZeroBluAdapter.setPrimaryDevice(deviceId);
    else if (device.provider === 'renogy') await renogyBluAdapter.setPrimaryDevice(deviceId);
    else await bluDeviceRegistry.setPrimary(device.provider, deviceId);
  }, []);
  const startPolling = useCallback(() => { ecoFlowBluAdapter.startPolling(15_000); setIsPolling(true); }, []);
  const stopPolling = useCallback(() => { ecoFlowBluAdapter.stopPolling(); setIsPolling(false); }, []);
  const clearError = useCallback(() => { setAdapterState((prev) => ({ ...prev, lastError: null, lastErrorCode: null })); }, []);

  // ── Bluetti Actions ────────────────────────────────────────────────
  const bluettiScan = useCallback(async () => { await bluettiBluAdapter.scanForDevices(); }, []);
  const bluettiConnect = useCallback(async (deviceId?: string) => { const r = await bluettiBluAdapter.connect(deviceId); if (mountedRef.current && r.success) { bluettiBluAdapter.startPolling(15_000); setBluettiIsPolling(true); showConnectionSuccess(); } }, [showConnectionSuccess]);
  const bluettiConnectAll = useCallback(async () => { const rs = await bluettiBluAdapter.connectAll(); if (mountedRef.current && rs.some((r) => r.success)) { bluettiBluAdapter.startPolling(15_000); setBluettiIsPolling(true); showConnectionSuccess(); } }, [showConnectionSuccess]);
  const bluettiDisconnect = useCallback(async () => { bluettiBluAdapter.stopPolling(); setBluettiIsPolling(false); await bluettiBluAdapter.disconnect(); }, []);
  const bluettiStartPolling = useCallback(() => { bluettiBluAdapter.startPolling(15_000); setBluettiIsPolling(true); }, []);
  const bluettiStopPolling = useCallback(() => { bluettiBluAdapter.stopPolling(); setBluettiIsPolling(false); }, []);
  const bluettiRename = useCallback(async (deviceId: string, newName: string) => { await bluettiBluAdapter.renameDevice(deviceId, newName); }, []);

  // ── Anker SOLIX Actions ────────────────────────────────────────────
  const ankerSolixScan = useCallback(async () => { await ankerSolixBluAdapter.scanForDevices(); }, []);
  const ankerSolixConnect = useCallback(async (deviceId?: string) => { const r = await ankerSolixBluAdapter.connect(deviceId); if (mountedRef.current && r.success) { ankerSolixBluAdapter.startPolling(15_000); setAnkerSolixIsPolling(true); showConnectionSuccess(); } }, [showConnectionSuccess]);
  const ankerSolixConnectAll = useCallback(async () => { const rs = await ankerSolixBluAdapter.connectAll(); if (mountedRef.current && rs.some((r) => r.success)) { ankerSolixBluAdapter.startPolling(15_000); setAnkerSolixIsPolling(true); showConnectionSuccess(); } }, [showConnectionSuccess]);
  const ankerSolixDisconnect = useCallback(async () => { ankerSolixBluAdapter.stopPolling(); setAnkerSolixIsPolling(false); await ankerSolixBluAdapter.disconnect(); }, []);
  const ankerSolixStartPolling = useCallback(() => { ankerSolixBluAdapter.startPolling(15_000); setAnkerSolixIsPolling(true); }, []);
  const ankerSolixStopPolling = useCallback(() => { ankerSolixBluAdapter.stopPolling(); setAnkerSolixIsPolling(false); }, []);
  const ankerSolixRename = useCallback(async (deviceId: string, newName: string) => { await ankerSolixBluAdapter.renameDevice(deviceId, newName); }, []);

  // ── Jackery Actions ────────────────────────────────────────────────
  const jackeryScan = useCallback(async () => { await jackeryBluAdapter.scanForDevices(); }, []);
  const jackeryConnect = useCallback(async (deviceId?: string) => { const r = await jackeryBluAdapter.connect(deviceId); if (mountedRef.current && r.success) { jackeryBluAdapter.startPolling(15_000); setJackeryIsPolling(true); showConnectionSuccess(); } }, [showConnectionSuccess]);
  const jackeryConnectAll = useCallback(async () => { const rs = await jackeryBluAdapter.connectAll(); if (mountedRef.current && rs.some((r) => r.success)) { jackeryBluAdapter.startPolling(15_000); setJackeryIsPolling(true); showConnectionSuccess(); } }, [showConnectionSuccess]);
  const jackeryDisconnect = useCallback(async () => { jackeryBluAdapter.stopPolling(); setJackeryIsPolling(false); await jackeryBluAdapter.disconnect(); }, []);
  const jackeryStartPolling = useCallback(() => { jackeryBluAdapter.startPolling(15_000); setJackeryIsPolling(true); }, []);
  const jackeryStopPolling = useCallback(() => { jackeryBluAdapter.stopPolling(); setJackeryIsPolling(false); }, []);
  const jackeryRename = useCallback(async (deviceId: string, newName: string) => { await jackeryBluAdapter.renameDevice(deviceId, newName); }, []);

  // ── Goal Zero Actions ──────────────────────────────────────────────
  const goalZeroScan = useCallback(async () => { await goalZeroBluAdapter.scanForDevices(); }, []);
  const goalZeroConnect = useCallback(async (deviceId?: string) => { const r = await goalZeroBluAdapter.connect(deviceId); if (mountedRef.current && r.success) { goalZeroBluAdapter.startPolling(15_000); setGoalZeroIsPolling(true); showConnectionSuccess(); } }, [showConnectionSuccess]);
  const goalZeroConnectAll = useCallback(async () => { const rs = await goalZeroBluAdapter.connectAll(); if (mountedRef.current && rs.some((r) => r.success)) { goalZeroBluAdapter.startPolling(15_000); setGoalZeroIsPolling(true); showConnectionSuccess(); } }, [showConnectionSuccess]);
  const goalZeroDisconnect = useCallback(async () => { goalZeroBluAdapter.stopPolling(); setGoalZeroIsPolling(false); await goalZeroBluAdapter.disconnect(); }, []);
  const goalZeroStartPolling = useCallback(() => { goalZeroBluAdapter.startPolling(15_000); setGoalZeroIsPolling(true); }, []);
  const goalZeroStopPolling = useCallback(() => { goalZeroBluAdapter.stopPolling(); setGoalZeroIsPolling(false); }, []);
  const goalZeroRename = useCallback(async (deviceId: string, newName: string) => { await goalZeroBluAdapter.renameDevice(deviceId, newName); }, []);

  // ── Renogy Actions ─────────────────────────────────────────────────
  const renogyScan = useCallback(async () => { await renogyBluAdapter.scanForDevices(); }, []);
  const renogyConnect = useCallback(async (deviceId?: string) => { const r = await renogyBluAdapter.connect(deviceId); if (mountedRef.current && r.success) { renogyBluAdapter.startPolling(15_000); setRenogyIsPolling(true); showConnectionSuccess(); } }, [showConnectionSuccess]);
  const renogyConnectAll = useCallback(async () => { const rs = await renogyBluAdapter.connectAll(); if (mountedRef.current && rs.some((r) => r.success)) { renogyBluAdapter.startPolling(15_000); setRenogyIsPolling(true); showConnectionSuccess(); } }, [showConnectionSuccess]);
  const renogyDisconnect = useCallback(async () => { renogyBluAdapter.stopPolling(); setRenogyIsPolling(false); await renogyBluAdapter.disconnect(); }, []);
  const renogyStartPolling = useCallback(() => { renogyBluAdapter.startPolling(15_000); setRenogyIsPolling(true); }, []);
  const renogyStopPolling = useCallback(() => { renogyBluAdapter.stopPolling(); setRenogyIsPolling(false); }, []);
  const renogyRename = useCallback(async (deviceId: string, newName: string) => { await renogyBluAdapter.renameDevice(deviceId, newName); }, []);

  return {
    connectionState: adapterState.connectionState, isConnecting,
    discoveredDevices: adapterState.discoveredDevices, registeredDevices, primaryDevice,
    error: adapterState.lastError, errorCode: adapterState.lastErrorCode,
    pollCount: adapterState.pollCount, isPolling, systemStatus,
    isReconnecting: adapterState.isReconnecting || bluettiState.isReconnecting || ankerSolixState.isReconnecting || jackeryState.isReconnecting || goalZeroState.isReconnecting || renogyState.isReconnecting,
    reconnectAttempts: adapterState.reconnectAttempts + bluettiState.reconnectAttempts + ankerSolixState.reconnectAttempts + jackeryState.reconnectAttempts + goalZeroState.reconnectAttempts + renogyState.reconnectAttempts,
    sessionRestored, connectionJustSucceeded,
    // Bluetti
    bluettiConnectionState: bluettiState.connectionState, bluettiIsScanning: bluettiState.isScanning,
    bluettiDiscoveredDevices: bluettiState.discoveredDevices, bluettiConnectedDevices: bluettiState.connectedDevices,
    bluettiError: bluettiState.lastError, bluettiPollCount: bluettiState.pollCount, bluettiIsPolling,
    // Anker SOLIX
    ankerSolixConnectionState: ankerSolixState.connectionState, ankerSolixIsScanning: ankerSolixState.isScanning,
    ankerSolixDiscoveredDevices: ankerSolixState.discoveredDevices, ankerSolixConnectedDevices: ankerSolixState.connectedDevices,
    ankerSolixError: ankerSolixState.lastError, ankerSolixPollCount: ankerSolixState.pollCount, ankerSolixIsPolling,
    // Jackery
    jackeryConnectionState: jackeryState.connectionState, jackeryIsScanning: jackeryState.isScanning,
    jackeryDiscoveredDevices: jackeryState.discoveredDevices, jackeryConnectedDevices: jackeryState.connectedDevices,
    jackeryError: jackeryState.lastError, jackeryPollCount: jackeryState.pollCount, jackeryIsPolling,
    // Goal Zero
    goalZeroConnectionState: goalZeroState.connectionState, goalZeroIsScanning: goalZeroState.isScanning,
    goalZeroDiscoveredDevices: goalZeroState.discoveredDevices, goalZeroConnectedDevices: goalZeroState.connectedDevices,
    goalZeroError: goalZeroState.lastError, goalZeroPollCount: goalZeroState.pollCount, goalZeroIsPolling,
    // Renogy
    renogyConnectionState: renogyState.connectionState, renogyIsScanning: renogyState.isScanning,
    renogyDiscoveredDevices: renogyState.discoveredDevices, renogyConnectedDevices: renogyState.connectedDevices,
    renogyError: renogyState.lastError, renogyPollCount: renogyState.pollCount, renogyIsPolling,
    // Actions
    connect, disconnect, refreshDevices, setPrimary, startPolling, stopPolling, clearError,
    bluettiScan, bluettiConnect, bluettiConnectAll, bluettiDisconnect, bluettiStartPolling, bluettiStopPolling, bluettiRename,
    ankerSolixScan, ankerSolixConnect, ankerSolixConnectAll, ankerSolixDisconnect, ankerSolixStartPolling, ankerSolixStopPolling, ankerSolixRename,
    jackeryScan, jackeryConnect, jackeryConnectAll, jackeryDisconnect, jackeryStartPolling, jackeryStopPolling, jackeryRename,
    goalZeroScan, goalZeroConnect, goalZeroConnectAll, goalZeroDisconnect, goalZeroStartPolling, goalZeroStopPolling, goalZeroRename,
    renogyScan, renogyConnect, renogyConnectAll, renogyDisconnect, renogyStartPolling, renogyStopPolling, renogyRename,
  };
}

