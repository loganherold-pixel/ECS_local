import { Platform } from 'react-native';

import type { OfflinePrepPackInput } from './offlinePrepPackTypes';

const OFFLINE_PREP_PACK_HANDOFF_KEY = 'ecs_offline_prep_pack_handoff';

type OfflinePrepPackHandoff = {
  input: OfflinePrepPackInput;
  source: 'explore' | 'route_details' | 'trip_builder';
  createdAt: string;
};

let memoryHandoff: OfflinePrepPackHandoff | null = null;

function getStorage(): Storage | null {
  if (Platform.OS !== 'web') return null;
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function saveOfflinePrepPackHandoff(
  input: OfflinePrepPackInput,
  source: OfflinePrepPackHandoff['source'] = 'explore',
): OfflinePrepPackHandoff {
  const handoff: OfflinePrepPackHandoff = {
    input,
    source,
    createdAt: new Date().toISOString(),
  };
  memoryHandoff = handoff;
  try {
    getStorage()?.setItem(OFFLINE_PREP_PACK_HANDOFF_KEY, JSON.stringify(handoff));
  } catch {
    // Memory handoff still supports the current native session.
  }
  return handoff;
}

export function loadOfflinePrepPackHandoff(): OfflinePrepPackHandoff | null {
  if (memoryHandoff) return memoryHandoff;
  try {
    const raw = getStorage()?.getItem(OFFLINE_PREP_PACK_HANDOFF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OfflinePrepPackHandoff;
    return parsed?.input?.route ? parsed : null;
  } catch {
    return null;
  }
}

export function clearOfflinePrepPackHandoff(): void {
  memoryHandoff = null;
  try {
    getStorage()?.removeItem(OFFLINE_PREP_PACK_HANDOFF_KEY);
  } catch {
    // No-op.
  }
}
