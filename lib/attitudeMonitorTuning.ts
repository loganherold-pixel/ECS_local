import type { AttitudeMonitorBackgroundUsage } from './attitudeMonitorAssets';

// Centralized field-tuning entry point for the production Attitude Monitor.
// Future post-trail adjustments should start here before changing any surface code.
export const ATTITUDE_MONITOR_TUNING = {
  motion: {
    // Safe tuning range:
    // deadZoneDeg: 0.1 - 0.35
    // filterAlpha: 0.22 - 0.5
    deadZoneDeg: 0.2,
    rollingAverageWindow: 4,
    filterAlpha: 0.35,
    animation: {
      minDurationMs: 200,
      maxDurationMs: 350,
      fullScaleDeltaDeg: 15,
      settleDurationMs: 220,
      demoMinDurationMs: 900,
      demoMaxDurationMs: 1400,
      demoFullScaleDeltaDeg: 25,
    },
    visible: {
      rollOutputClampDeg: 30,
      pitchOutputClampDeg: 24,
      rollRotationClampDeg: {
        standard: 20,
        automotive: 16,
      },
      pitchTravel: {
        minPx: {
          standard: 6,
          automotive: 8,
        },
        maxPx: {
          standard: 26,
          automotive: 22,
        },
        ratio: {
          standard: 0.13,
          wide: 0.11,
          automotive: 0.085,
        },
      },
    },
  },
  telemetry: {
    staleAfterMs: 2200,
    holdLastGoodMs: 6500,
    boundaryWakeThresholdMs: 32,
    boundaryWakeMinDelayMs: 80,
    boundaryWakeLeadMs: 24,
  },
  severity: {
    thresholds: {
      standard: {
        rollDanger: 29,
        rollWarning: 20,
        pitchDanger: 23,
        pitchWarning: 15,
      },
      advanced: {
        rollDanger: 27,
        rollWarning: 18,
        pitchDanger: 21,
        pitchWarning: 13,
      },
    },
    exitBufferDeg: {
      warning: 2,
      caution: 1.4,
    },
    upgradeDwellMs: {
      warning: 520,
      caution: 320,
    },
    downgradeDwellMs: {
      warning: 1600,
      caution: 1200,
    },
  },
  labels: {
    balancedAxisDeltaDeg: 2,
    normal: {
      moderateRollMinDeg: 7,
      moderateRollThresholdRatio: 0.52,
      moderatePitchMinDeg: 6,
      moderatePitchThresholdRatio: 0.58,
    },
  },
  visual: {
    topoOverlayEnabled: true,
    backgroundByUsage: {
      compact: {
        opacity: 0.18,
        scale: 1.08,
        offsetX: 0,
        offsetY: 0.014,
      },
      standard: {
        opacity: 0.28,
        scale: 1.06,
        offsetX: 0,
        offsetY: 0.01,
      },
      detail: {
        opacity: 0.3,
        scale: 1.05,
        offsetX: 0.005,
        offsetY: 0.008,
      },
      automotive: {
        opacity: 0.2,
        scale: 1.04,
        offsetX: 0.01,
        offsetY: 0.012,
      },
    } satisfies Record<
      AttitudeMonitorBackgroundUsage,
      { opacity: number; scale: number; offsetX: number; offsetY: number }
    >,
    overlayByUsage: {
      compact: {
        opacity: 0,
        enabled: false,
        scale: 1.01,
        offsetY: 0,
      },
      standard: {
        opacity: 0.035,
        enabled: true,
        scale: 1.01,
        offsetY: 0,
      },
      detail: {
        opacity: 0.045,
        enabled: true,
        scale: 1.03,
        offsetY: 0,
      },
      automotive: {
        opacity: 0.02,
        enabled: true,
        scale: 1.02,
        offsetY: 0.006,
      },
    } satisfies Record<
      AttitudeMonitorBackgroundUsage,
      { opacity: number; enabled: boolean; scale: number; offsetY: number }
    >,
  },
} as const;

export function getAttitudeMonitorThresholdPreset(advanced?: boolean) {
  return advanced
    ? ATTITUDE_MONITOR_TUNING.severity.thresholds.advanced
    : ATTITUDE_MONITOR_TUNING.severity.thresholds.standard;
}

export function getAttitudeMonitorVisualUsageTuning(usage: AttitudeMonitorBackgroundUsage) {
  return {
    background: ATTITUDE_MONITOR_TUNING.visual.backgroundByUsage[usage],
    overlay: ATTITUDE_MONITOR_TUNING.visual.overlayByUsage[usage],
  };
}
