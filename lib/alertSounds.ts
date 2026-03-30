/**
 * Alert Sounds Engine
 *
 * Synthesizes alert tones using the Web Audio API.
 * Each tone uses different waveforms, frequencies, and envelope patterns
 * to create distinct, recognizable alert sounds.
 *
 * Sound IDs are stored in tiltAlertStore preferences.
 */
import { Platform } from 'react-native';

// ── Sound ID Type ──────────────────────────────────────────────
export type AlertSoundId =
  | 'tactical_beep'
  | 'klaxon'
  | 'chime'
  | 'sonar_ping'
  | 'staccato'
  | 'siren';

// ── Sound Metadata ─────────────────────────────────────────────
export interface AlertSoundDef {
  id: AlertSoundId;
  name: string;
  shortName: string;
  description: string;
  waveformLabel: string;   // human-readable waveform description
  color: string;           // accent color for UI
}

export const ALERT_SOUNDS: AlertSoundDef[] = [
  {
    id: 'tactical_beep',
    name: 'Tactical Beep',
    shortName: 'TACTICAL',
    description: 'Sharp sine pulse — standard military tone',
    waveformLabel: 'Sine · 660 Hz',
    color: '#5B8DEF',
  },
  {
    id: 'klaxon',
    name: 'Klaxon',
    shortName: 'KLAXON',
    description: 'Aggressive square-wave alarm pulse',
    waveformLabel: 'Square · 220 Hz',
    color: '#C0392B',
  },
  {
    id: 'chime',
    name: 'Chime',
    shortName: 'CHIME',
    description: 'Gentle high-pitched bell with soft decay',
    waveformLabel: 'Sine · 1047 Hz',
    color: '#4CAF50',
  },
  {
    id: 'sonar_ping',
    name: 'Sonar Ping',
    shortName: 'SONAR',
    description: 'Short underwater-style ping with reverb tail',
    waveformLabel: 'Sine · 1200 Hz',
    color: '#00BCD4',
  },
  {
    id: 'staccato',
    name: 'Staccato',
    shortName: 'STACCATO',
    description: 'Rapid sawtooth bursts — urgent cadence',
    waveformLabel: 'Sawtooth · 440 Hz',
    color: '#E67E22',
  },
  {
    id: 'siren',
    name: 'Siren',
    shortName: 'SIREN',
    description: 'Rising frequency sweep — emergency tone',
    waveformLabel: 'Sawtooth · 600→1200 Hz',
    color: '#9B59B6',
  },
];

export const DEFAULT_WARNING_SOUND: AlertSoundId = 'tactical_beep';
export const DEFAULT_CRITICAL_SOUND: AlertSoundId = 'klaxon';

// ── Lookup helper ──────────────────────────────────────────────
export function getSoundDef(id: AlertSoundId): AlertSoundDef {
  return ALERT_SOUNDS.find((s) => s.id === id) || ALERT_SOUNDS[0];
}

// ── Audio Context singleton ────────────────────────────────────
let _audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!_audioCtx || _audioCtx.state === 'closed') {
      _audioCtx = new AudioCtx();
    }
    // Resume if suspended (browser autoplay policy)
    if (_audioCtx.state === 'suspended') {
      _audioCtx.resume().catch(() => {});
    }
    return _audioCtx;
  } catch {
    return null;
  }
}

// ── Individual tone synthesizers ───────────────────────────────

function playTacticalBeep(ctx: AudioContext, critical: boolean): void {
  const now = ctx.currentTime;
  const freq = critical ? 880 : 660;
  const vol = critical ? 0.18 : 0.15;
  const dur = critical ? 0.35 : 0.22;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
  osc.start(now);
  osc.stop(now + dur);

  // Critical: second higher beep
  if (critical) {
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.type = 'sine';
    osc2.frequency.value = 1100;
    gain2.gain.setValueAtTime(0.13, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.45);
  }
}

function playKlaxon(ctx: AudioContext, critical: boolean): void {
  const now = ctx.currentTime;
  const freq = critical ? 260 : 220;
  const pulses = critical ? 4 : 2;
  const pulseOn = 0.08;
  const pulseOff = 0.06;
  const vol = critical ? 0.16 : 0.12;

  for (let i = 0; i < pulses; i++) {
    const start = now + i * (pulseOn + pulseOff);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.linearRampToValueAtTime(vol, start + 0.01);
    gain.gain.setValueAtTime(vol, start + pulseOn - 0.01);
    gain.gain.linearRampToValueAtTime(0.001, start + pulseOn);
    osc.start(start);
    osc.stop(start + pulseOn + 0.01);
  }
}

function playChime(ctx: AudioContext, critical: boolean): void {
  const now = ctx.currentTime;
  const baseFreq = critical ? 1318 : 1047; // E6 : C6
  const vol = critical ? 0.14 : 0.11;
  const dur = critical ? 0.8 : 0.6;

  // Fundamental
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.connect(gain1);
  gain1.connect(ctx.destination);
  osc1.type = 'sine';
  osc1.frequency.value = baseFreq;
  gain1.gain.setValueAtTime(vol, now);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + dur);
  osc1.start(now);
  osc1.stop(now + dur);

  // Harmonic (octave above, quieter)
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  osc2.type = 'sine';
  osc2.frequency.value = baseFreq * 2;
  gain2.gain.setValueAtTime(vol * 0.35, now);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + dur * 0.6);
  osc2.start(now);
  osc2.stop(now + dur * 0.6);

  // Critical: second chime a major third up
  if (critical) {
    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.connect(gain3);
    gain3.connect(ctx.destination);
    osc3.type = 'sine';
    osc3.frequency.value = baseFreq * 1.26; // ~major third
    gain3.gain.setValueAtTime(0.001, now + 0.2);
    gain3.gain.linearRampToValueAtTime(vol * 0.9, now + 0.22);
    gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
    osc3.start(now + 0.2);
    osc3.stop(now + 0.9);
  }
}

function playSonarPing(ctx: AudioContext, critical: boolean): void {
  const now = ctx.currentTime;
  const freq = critical ? 1400 : 1200;
  const vol = critical ? 0.16 : 0.13;
  const pingDur = 0.06;
  const tailDur = critical ? 0.7 : 0.5;

  // Sharp ping
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, now);
  gain.gain.setValueAtTime(vol, now + pingDur);
  gain.gain.exponentialRampToValueAtTime(0.001, now + tailDur);
  osc.start(now);
  osc.stop(now + tailDur);

  // Slight frequency drop for "underwater" feel
  osc.frequency.setValueAtTime(freq, now + pingDur);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.85, now + tailDur);

  // Critical: second ping
  if (critical) {
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.type = 'sine';
    osc2.frequency.value = freq * 1.15;
    gain2.gain.setValueAtTime(0.001, now + 0.25);
    gain2.gain.linearRampToValueAtTime(vol * 0.8, now + 0.26);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    osc2.start(now + 0.25);
    osc2.stop(now + 0.8);
    osc2.frequency.setValueAtTime(freq * 1.15, now + 0.26 + pingDur);
    osc2.frequency.exponentialRampToValueAtTime(freq * 0.95, now + 0.8);
  }
}

function playStaccato(ctx: AudioContext, critical: boolean): void {
  const now = ctx.currentTime;
  const freq = critical ? 520 : 440;
  const bursts = critical ? 6 : 3;
  const burstDur = 0.04;
  const gap = 0.05;
  const vol = critical ? 0.12 : 0.09;

  for (let i = 0; i < bursts; i++) {
    const start = now + i * (burstDur + gap);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sawtooth';
    osc.frequency.value = freq + (critical ? i * 30 : 0); // rising pitch for critical
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.linearRampToValueAtTime(vol, start + 0.005);
    gain.gain.linearRampToValueAtTime(vol, start + burstDur - 0.005);
    gain.gain.linearRampToValueAtTime(0.001, start + burstDur);
    osc.start(start);
    osc.stop(start + burstDur + 0.01);
  }
}

function playSiren(ctx: AudioContext, critical: boolean): void {
  const now = ctx.currentTime;
  const startFreq = critical ? 500 : 600;
  const endFreq = critical ? 1400 : 1200;
  const dur = critical ? 0.6 : 0.4;
  const vol = critical ? 0.12 : 0.09;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(startFreq, now);
  osc.frequency.exponentialRampToValueAtTime(endFreq, now + dur * 0.7);
  osc.frequency.exponentialRampToValueAtTime(endFreq * 0.9, now + dur);
  gain.gain.setValueAtTime(vol, now);
  gain.gain.setValueAtTime(vol, now + dur * 0.6);
  gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
  osc.start(now);
  osc.stop(now + dur + 0.01);

  // Critical: second sweep (descending)
  if (critical) {
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(endFreq, now + dur + 0.05);
    osc2.frequency.exponentialRampToValueAtTime(startFreq, now + dur + 0.05 + dur * 0.7);
    gain2.gain.setValueAtTime(vol * 0.85, now + dur + 0.05);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + dur * 2 + 0.05);
    osc2.start(now + dur + 0.05);
    osc2.stop(now + dur * 2 + 0.1);
  }
}

// ── Dispatch map ───────────────────────────────────────────────
const SOUND_PLAYERS: Record<AlertSoundId, (ctx: AudioContext, critical: boolean) => void> = {
  tactical_beep: playTacticalBeep,
  klaxon: playKlaxon,
  chime: playChime,
  sonar_ping: playSonarPing,
  staccato: playStaccato,
  siren: playSiren,
};

// ── Public API ─────────────────────────────────────────────────

/**
 * Play an alert sound by ID.
 * @param soundId  The sound to play
 * @param critical Whether this is a critical (vs warning) alert
 */
export function playAlertSound(soundId: AlertSoundId, critical: boolean): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const player = SOUND_PLAYERS[soundId];
    if (player) {
      player(ctx, critical);
    }
  } catch {
    // Silently fail — audio is non-essential
  }
}

/**
 * Play a test/preview of a sound (always plays the warning variant).
 * @param soundId  The sound to preview
 */
export function previewAlertSound(soundId: AlertSoundId): void {
  playAlertSound(soundId, false);
}

/**
 * Play a test/preview of the critical variant of a sound.
 * @param soundId  The sound to preview
 */
export function previewCriticalSound(soundId: AlertSoundId): void {
  playAlertSound(soundId, true);
}

