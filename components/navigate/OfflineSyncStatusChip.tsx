import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useApp } from '../../context/AppContext';
import { createPersistedKeyValueCache } from '../../lib/keyValuePersistence';
import { TACTICAL, TYPO } from '../../lib/theme';
import {
  offlineTileSyncCoordinator,
  type OfflineTileSyncJob,
  type OfflineTileSyncSnapshot,
} from '../../lib/offlineTileSyncCoordinator';
import { SafeIcon as Ionicons } from '../SafeIcon';

type Props = {
  bottomOffset?: number;
  horizontalInset?: number;
};

const DISMISSED_SYNC_STATUS_KEY = 'dismissed_terminal_sync_jobs_v1';
const dismissedSyncStatusPersistence = createPersistedKeyValueCache('ecs_offline_sync_status_ui');

function getJobPercent(job: OfflineTileSyncJob): number {
  if (job.progress) return Math.max(0, Math.min(100, Math.round(job.progress.percent)));
  return job.status === 'complete' ? 100 : 0;
}

function getStatusLabel(job: OfflineTileSyncJob): string {
  if (job.status === 'complete') return 'Offline sync complete';
  if (job.status === 'error') return 'Offline sync failed';
  if (job.status === 'cancelled') return 'Offline sync cancelled';
  return `Offline sync ${getJobPercent(job)}%`;
}

function buildToastForJob(job: OfflineTileSyncJob): string | null {
  if (job.status === 'complete') return 'OFFLINE SYNC COMPLETE';
  if (job.status === 'error') return job.errorMessage || 'OFFLINE SYNC FAILED';
  if (job.status === 'cancelled') return 'OFFLINE SYNC CANCELLED';
  return null;
}

function isTerminalJob(job: OfflineTileSyncJob): boolean {
  return job.status === 'complete' || job.status === 'error' || job.status === 'cancelled';
}

function terminalJobNeedsRuntimeCompletion(job: OfflineTileSyncJob): boolean {
  return job.status === 'complete' || job.status === 'cancelled';
}

function buildDismissalKey(job: OfflineTileSyncJob): string {
  return [
    job.jobId,
    job.regionId,
    job.source,
    job.createdAt,
  ].join('|');
}

function readDismissedKeys(): Set<string> {
  try {
    const raw = dismissedSyncStatusPersistence.get(DISMISSED_SYNC_STATUS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((value) => typeof value === 'string') : []);
  } catch {
    return new Set();
  }
}

function persistDismissedKeys(keys: Set<string>): void {
  try {
    dismissedSyncStatusPersistence.set(
      DISMISSED_SYNC_STATUS_KEY,
      JSON.stringify(Array.from(keys).slice(-100)),
    );
  } catch {}
}

function jobCreatedDuringRuntime(job: OfflineTileSyncJob, runtimeStartedAt: number): boolean {
  const createdAtMs = new Date(job.createdAt).getTime();
  return Number.isFinite(createdAtMs) && createdAtMs >= runtimeStartedAt - 1000;
}

export default function OfflineSyncStatusChip({
  bottomOffset = 96,
  horizontalInset = 16,
}: Props) {
  const { showToast } = useApp();
  const [snapshot, setSnapshot] = useState<OfflineTileSyncSnapshot>(
    () => offlineTileSyncCoordinator.getSnapshot(),
  );
  const [dismissedSyncKeys, setDismissedSyncKeys] = useState<Set<string>>(() =>
    dismissedSyncStatusPersistence.isHydrated() ? readDismissedKeys() : new Set(),
  );
  const [dismissalsHydrated, setDismissalsHydrated] = useState(() =>
    dismissedSyncStatusPersistence.isHydrated(),
  );
  const announcedTerminalRef = useRef<Set<string>>(new Set());
  const observedActiveJobKeysRef = useRef<Set<string>>(new Set());
  const runtimeStartedAtRef = useRef(Date.now());
  const [runtimeTerminalKeys, setRuntimeTerminalKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    const unsubscribe = offlineTileSyncCoordinator.subscribe(() => {
      setSnapshot(offlineTileSyncCoordinator.getSnapshot());
    });
    setSnapshot(offlineTileSyncCoordinator.getSnapshot());
    return unsubscribe;
  }, []);

  useEffect(() => {
    let cancelled = false;
    dismissedSyncStatusPersistence.waitForHydration().then(() => {
      if (cancelled) return;
      setDismissedSyncKeys(readDismissedKeys());
      setDismissalsHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    snapshot.activeJobs.forEach((job) => {
      observedActiveJobKeysRef.current.add(buildDismissalKey(job));
    });

    const currentRuntimeTerminalKeys = snapshot.jobs
      .filter(isTerminalJob)
      .map((job) => ({ job, key: buildDismissalKey(job) }))
      .filter(({ job, key }) => {
        return (
          observedActiveJobKeysRef.current.has(key) ||
          jobCreatedDuringRuntime(job, runtimeStartedAtRef.current)
        );
      })
      .map(({ key }) => key);

    if (currentRuntimeTerminalKeys.length === 0) return;

    setRuntimeTerminalKeys((current) => {
      let changed = false;
      const next = new Set(current);
      currentRuntimeTerminalKeys.forEach((key) => {
        if (!next.has(key)) {
          next.add(key);
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [snapshot.activeJobs, snapshot.jobs]);

  const displayJob = useMemo(() => {
    const active = snapshot.activeJobs[0];
    if (active) return active;
    const latest = snapshot.latestJob;
    if (!latest || !isTerminalJob(latest) || !dismissalsHydrated) return null;
    const dismissalKey = buildDismissalKey(latest);
    if (dismissedSyncKeys.has(dismissalKey)) return null;
    if (terminalJobNeedsRuntimeCompletion(latest) && !runtimeTerminalKeys.has(dismissalKey)) {
      return null;
    }
    return latest;
  }, [
    dismissalsHydrated,
    dismissedSyncKeys,
    runtimeTerminalKeys,
    snapshot.activeJobs,
    snapshot.latestJob,
  ]);

  const dismissDisplayJob = () => {
    if (!displayJob || !isTerminalJob(displayJob)) return;
    const key = buildDismissalKey(displayJob);
    setDismissedSyncKeys((current) => {
      const next = new Set(current);
      next.add(key);
      persistDismissedKeys(next);
      return next;
    });
  };

  useEffect(() => {
    const latest = snapshot.latestJob;
    if (!latest) return;
    if (!isTerminalJob(latest) || !dismissalsHydrated) return;
    const dismissalKey = buildDismissalKey(latest);
    if (dismissedSyncKeys.has(dismissalKey)) return;
    if (!runtimeTerminalKeys.has(dismissalKey)) return;
    if (announcedTerminalRef.current.has(dismissalKey)) return;
    announcedTerminalRef.current.add(dismissalKey);
    const toast = buildToastForJob(latest);
    if (toast) showToast(toast);
  }, [dismissalsHydrated, dismissedSyncKeys, runtimeTerminalKeys, showToast, snapshot.latestJob]);

  if (!displayJob) return null;

  const percent = getJobPercent(displayJob);
  const isActive = displayJob.status === 'pending' || displayJob.status === 'running';
  const isError = displayJob.status === 'error';
  const isComplete = displayJob.status === 'complete';

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          left: horizontalInset,
          right: horizontalInset,
          bottom: bottomOffset,
        },
      ]}
    >
      <View
        style={[
          styles.chip,
          isComplete && styles.chipComplete,
          isError && styles.chipError,
        ]}
      >
        <Ionicons
          name={
            isComplete
              ? 'checkmark-circle-outline'
              : isError
                ? 'warning-outline'
                : 'cloud-download-outline'
          }
          size={14}
          color={isError ? '#EF5350' : isComplete ? '#66BB6A' : TACTICAL.amber}
        />
        <View style={styles.copy}>
          <Text style={styles.title} numberOfLines={1}>
            {getStatusLabel(displayJob)}
          </Text>
          <Text style={styles.detail} numberOfLines={1}>
            {displayJob.regionName} - app-process sync
          </Text>
          {isActive ? (
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${percent}%` }]} />
            </View>
          ) : null}
        </View>
        {isActive ? (
          <TouchableOpacity
            style={styles.action}
            onPress={() => offlineTileSyncCoordinator.cancelJob(displayJob.jobId)}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel="Cancel offline sync"
          >
            <Text style={styles.actionText}>CANCEL</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.dismiss}
            onPress={dismissDisplayJob}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Dismiss offline sync status"
          >
            <Ionicons name="close" size={13} color={TACTICAL.textMuted} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    zIndex: 900,
    alignItems: 'center',
  },
  chip: {
    width: '100%',
    maxWidth: 460,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.24)',
    backgroundColor: 'rgba(8,12,15,0.94)',
    paddingHorizontal: 12,
    paddingVertical: 9,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 18,
  },
  chipComplete: {
    borderColor: 'rgba(102,187,106,0.28)',
  },
  chipError: {
    borderColor: 'rgba(239,83,80,0.30)',
  },
  copy: {
    flex: 1,
    gap: 3,
  },
  title: {
    ...TYPO.T3,
    color: TACTICAL.text,
    fontSize: 11,
  },
  detail: {
    ...TYPO.B2,
    color: TACTICAL.textMuted,
    fontSize: 9,
  },
  progressTrack: {
    height: 3,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: TACTICAL.amber,
  },
  action: {
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,179,0,0.26)',
    backgroundColor: 'rgba(255,179,0,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    ...TYPO.U2,
    color: '#FFB300',
    fontSize: 8,
    letterSpacing: 1.1,
  },
  dismiss: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
