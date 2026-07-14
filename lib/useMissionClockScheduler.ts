import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import {
  buildMissionClockSnapshot,
  type MissionClockDeadlineInput,
  type MissionClockSnapshot,
} from './dispatchMissionClock';
import { createMissionClockScheduler } from './dispatchMissionClockScheduler';

export interface UseMissionClockSchedulerInput {
  expeditionId: string;
  deadlines: MissionClockDeadlineInput[];
  enabled?: boolean;
}

/** Owns the single Mission Clock timer and replaces it when expedition scope changes. */
export function useMissionClockScheduler({
  expeditionId,
  deadlines,
  enabled = true,
}: UseMissionClockSchedulerInput): MissionClockSnapshot {
  const [snapshot, setSnapshot] = useState(() => buildMissionClockSnapshot(deadlines));
  const scheduler = useMemo(() => createMissionClockScheduler({
    onTick: setSnapshot,
  }), []);

  useEffect(() => {
    scheduler.setForeground(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', (state) => {
      scheduler.setForeground(state === 'active');
    });
    return () => subscription.remove();
  }, [scheduler]);

  useEffect(() => {
    if (!enabled || !expeditionId) {
      scheduler.stop();
      setSnapshot(buildMissionClockSnapshot(deadlines));
      return undefined;
    }
    scheduler.start(deadlines);
    return () => scheduler.stop();
  }, [deadlines, enabled, expeditionId, scheduler]);

  return snapshot;
}
