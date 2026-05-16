import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { playAlertSound } from './alertSounds';
import type {
  AttitudeSeverityState,
  AttitudeTelemetryHealth,
} from './attitudeMonitorModel';

const STORAGE_KEY = 'ecs_attitude_monitor_sound_enabled';

let soundEnabledState = true;
let hydrationStarted = false;
const listeners = new Set<() => void>();
let thresholdArmed = true;
let nativeTonePlayerPromise: Promise<any | null> | null = null;

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

async function readStoredSoundEnabled(): Promise<boolean | null> {
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw == null ? null : raw === '1';
    }

    const secureStore = await import('expo-secure-store');
    const raw = await secureStore.getItemAsync(STORAGE_KEY);
    return raw == null ? null : raw === '1';
  } catch {
    return null;
  }
}

async function persistSoundEnabled(nextValue: boolean): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, nextValue ? '1' : '0');
      }
      return;
    }

    const secureStore = await import('expo-secure-store');
    await secureStore.setItemAsync(STORAGE_KEY, nextValue ? '1' : '0');
  } catch {
    // Preference persistence is non-essential.
  }
}

function ensureHydrated(): void {
  if (hydrationStarted) return;
  hydrationStarted = true;

  void readStoredSoundEnabled().then((storedValue) => {
    if (storedValue == null || storedValue === soundEnabledState) return;
    soundEnabledState = storedValue;
    notify();
  });
}

export function getAttitudeMonitorSoundEnabled(): boolean {
  ensureHydrated();
  return soundEnabledState;
}

export function setAttitudeMonitorSoundEnabled(nextValue: boolean): void {
  ensureHydrated();
  if (soundEnabledState === nextValue) return;
  soundEnabledState = nextValue;
  notify();
  void persistSoundEnabled(nextValue);
}

export function subscribeAttitudeMonitorSoundEnabled(
  listener: () => void,
): () => void {
  ensureHydrated();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAttitudeMonitorSoundPreference() {
  const [enabled, setEnabled] = useState(() => getAttitudeMonitorSoundEnabled());

  useEffect(
    () =>
      subscribeAttitudeMonitorSoundEnabled(() => {
        setEnabled(getAttitudeMonitorSoundEnabled());
      }),
    [],
  );

  const toggle = useCallback(() => {
    setAttitudeMonitorSoundEnabled(!getAttitudeMonitorSoundEnabled());
  }, []);

  return {
    enabled,
    toggle,
    setEnabled: setAttitudeMonitorSoundEnabled,
  };
}

async function getNativeTonePlayer(): Promise<any | null> {
  if (Platform.OS === 'web') {
    return null;
  }

  if (!nativeTonePlayerPromise) {
    nativeTonePlayerPromise = (async () => {
      const { createVideoPlayer } = await import('expo-video');
      const player = createVideoPlayer(
        require('../assets/audio/attitude-approaching-tone.wav'),
      );
      player.loop = false;
      player.muted = false;
      player.volume = 0.52;
      player.audioMixingMode = 'duckOthers';
      player.showNowPlayingNotification = false;
      player.staysActiveInBackground = false;
      player.pause();
      player.currentTime = 0;
      return player;
    })().catch(() => null);
  }

  return nativeTonePlayerPromise;
}

export async function playGentleAttitudeTone(): Promise<void> {
  if (Platform.OS === 'web') {
    playAlertSound('chime', false);
    return;
  }

  try {
    const player = await getNativeTonePlayer();
    if (!player) return;
    player.pause();
    player.currentTime = 0;
    player.play();
  } catch {
    // Sound playback is non-essential.
  }
}

export function syncAttitudeApproachingLimitTone(params: {
  severity: AttitudeSeverityState;
  telemetryHealth: AttitudeTelemetryHealth;
  soundEnabled: boolean;
}): void {
  const { severity, telemetryHealth, soundEnabled } = params;
  const thresholdActive =
    telemetryHealth === 'live' &&
    (severity === 'caution' || severity === 'warning');

  if (!thresholdActive) {
    thresholdArmed = true;
    return;
  }

  if (!thresholdArmed) {
    return;
  }

  thresholdArmed = false;

  if (!soundEnabled) {
    return;
  }

  void playGentleAttitudeTone();
}
