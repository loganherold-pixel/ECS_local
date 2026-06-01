import { Platform, Vibration } from 'react-native';

import { playAlertSound } from './alertSounds';

let nativePingPlayerPromise: Promise<any | null> | null = null;

async function getNativePingPlayer(): Promise<any | null> {
  if (Platform.OS === 'web') return null;

  if (!nativePingPlayerPromise) {
    nativePingPlayerPromise = (async () => {
      const { createVideoPlayer } = await import('expo-video');
      const player = createVideoPlayer(require('../assets/audio/attitude-approaching-tone.wav'));
      player.loop = false;
      player.muted = false;
      player.volume = 0.48;
      player.audioMixingMode = 'duckOthers';
      player.showNowPlayingNotification = false;
      player.staysActiveInBackground = false;
      player.pause();
      player.currentTime = 0;
      return player;
    })().catch(() => null);
  }

  return nativePingPlayerPromise;
}

async function playNativeRecoveryPingAlert(): Promise<void> {
  try {
    Vibration.vibrate(90);
    const player = await getNativePingPlayer();
    if (!player) return;
    player.pause();
    player.currentTime = 0;
    player.play();
  } catch {
    // Alert feedback is useful, but dispatch visibility remains the source of truth.
  }
}

export function playDispatchRecoveryPingAlert(): void {
  if (Platform.OS === 'web') {
    playAlertSound('sonar_ping', false);
    return;
  }

  void playNativeRecoveryPingAlert();
}
