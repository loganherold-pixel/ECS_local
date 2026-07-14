import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  dispatchMissionCommandRuntime,
  type MissionCommandIncomingResult,
  type MissionCommandRuntimeDiagnostics,
} from './dispatchMissionCommandRuntime';
import type {
  DispatchRealtimeEnvelope,
  DispatchRealtimeEventDraft,
  DispatchRealtimeStatus,
} from './dispatchRealtimeAdapter';
import type { DispatchReplayPublishResult } from './dispatchOfflineReplayAdapter';
import type { DispatchCanonicalEntity } from './dispatchCanonicalRepository';
import type { DispatchQueuedOfflineAction } from './dispatchTypes';
import {
  dispatchPersistenceAdapter,
  type DispatchPersistenceDefaults,
} from './dispatchPersistenceAdapter';

export interface UseDispatchMissionCommandRuntimeInput {
  enabled: boolean;
  accountId: string | null;
  expeditionId: string;
  defaults: DispatchPersistenceDefaults;
  clientId?: string;
  authorizedActorIds?: string[];
  online: boolean;
  realtimeStatus: DispatchRealtimeStatus;
  publish?: (event: DispatchRealtimeEventDraft) => Promise<DispatchReplayPublishResult>;
  persistCanonicalEntity?: (
    entity: DispatchCanonicalEntity,
    action: DispatchQueuedOfflineAction,
  ) => Promise<boolean>;
}

export function bindDispatchMissionCommandAppLifecycle(input: {
  appState: Pick<typeof AppState, 'addEventListener'>;
  onForeground: () => void | Promise<void>;
  onBackground: () => void | Promise<void>;
}): () => void {
  let released = false;
  const subscription = input.appState.addEventListener('change', (nextState) => {
    if (released) return;
    if (nextState === 'active') void input.onForeground();
    else void input.onBackground();
  });
  return () => {
    released = true;
    subscription.remove();
  };
}

export function useDispatchMissionCommandRuntime(input: UseDispatchMissionCommandRuntimeInput): {
  hydrated: boolean;
  diagnostics: MissionCommandRuntimeDiagnostics;
  applyIncoming: (event: DispatchRealtimeEnvelope) => MissionCommandIncomingResult;
  replay: () => Promise<void>;
} {
  const [diagnostics, setDiagnostics] = useState(dispatchMissionCommandRuntime.getDiagnostics());
  const authorizedActorIdsKey = JSON.stringify([...(input.authorizedActorIds ?? [])].sort());

  const replay = useCallback(async () => {
    if (!input.enabled || !input.online || input.realtimeStatus !== 'connected' || !input.publish) return;
    await dispatchMissionCommandRuntime.replay(input.publish, input.persistCanonicalEntity);
  }, [
    input.enabled,
    input.online,
    input.persistCanonicalEntity,
    input.publish,
    input.realtimeStatus,
  ]);
  const replayRef = useRef(replay);
  replayRef.current = replay;

  const applyIncoming = useCallback((event: DispatchRealtimeEnvelope) => (
    dispatchMissionCommandRuntime.applyIncoming(event)
  ), []);

  useEffect(() => {
    if (!input.enabled) {
      dispatchMissionCommandRuntime.deactivate();
      setDiagnostics(dispatchMissionCommandRuntime.getDiagnostics());
      return undefined;
    }

    dispatchMissionCommandRuntime.activate({
      accountId: input.accountId,
      expeditionId: input.expeditionId,
      defaults: input.defaults,
      clientId: input.clientId,
      authorizedActorIds: JSON.parse(authorizedActorIdsKey) as string[],
    });
    const releaseRuntime = dispatchMissionCommandRuntime.subscribe(() => {
      setDiagnostics(dispatchMissionCommandRuntime.getDiagnostics());
    });
    let replayTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleReplay = () => {
      if (replayTimer) clearTimeout(replayTimer);
      replayTimer = setTimeout(() => void replayRef.current(), 100);
    };
    const releasePersistence = dispatchPersistenceAdapter.subscribe((changedExpeditionId) => {
      if (changedExpeditionId !== input.expeditionId) return;
      dispatchMissionCommandRuntime.refreshDiagnostics();
      scheduleReplay();
    });
    void dispatchMissionCommandRuntime.hydrate().then(scheduleReplay);
    const releaseAppState = bindDispatchMissionCommandAppLifecycle({
      appState: AppState,
      onForeground: () => dispatchMissionCommandRuntime.hydrate().then(() => scheduleReplay()),
      onBackground: () => dispatchMissionCommandRuntime.flush(),
    });

    return () => {
      if (replayTimer) clearTimeout(replayTimer);
      releaseAppState();
      releaseRuntime();
      releasePersistence();
      void dispatchMissionCommandRuntime.flush();
      dispatchMissionCommandRuntime.deactivate();
    };
  }, [
    input.accountId,
    authorizedActorIdsKey,
    input.clientId,
    input.defaults,
    input.enabled,
    input.expeditionId,
  ]);

  useEffect(() => {
    if (!input.enabled) return;
    dispatchMissionCommandRuntime.setRealtimeStatus(
      input.realtimeStatus,
      input.realtimeStatus === 'connecting' || input.realtimeStatus === 'connected' ? 1 : 0,
    );
    if (input.online && input.realtimeStatus === 'connected' && input.publish) {
      void replay();
    }
  }, [input.enabled, input.online, input.publish, input.realtimeStatus, replay]);

  return {
    hydrated: diagnostics.hydrationStatus === 'ready' || diagnostics.hydrationStatus === 'recovered',
    diagnostics,
    applyIncoming,
    replay,
  };
}
