import {
  sanitizeECSDiagnosticText,
  sanitizeECSDiagnosticValue,
} from './observability/ecsDiagnosticRedaction';

export type ClosedBetaDiagnosticsBuildInfo = {
  appName: string;
  packageId: string;
  versionName: string;
  versionCode: number | string;
  runtimeVersion?: string | null;
  buildProfile?: string | null;
  channel?: string | null;
  environment?: string | null;
};

export type ClosedBetaDiagnosticsBackendInfo = {
  supabaseProjectRef?: string | null;
  supabaseConfigured: boolean;
  mapboxConfigured: boolean;
};

export type ClosedBetaDiagnosticsDeviceInfo = {
  platform: string;
  osVersion?: string | null;
  model?: string | null;
};

export type ClosedBetaDiagnosticsReport = {
  generatedAt: string;
  featureArea: string;
  issueSummary: string | null;
  build: ClosedBetaDiagnosticsBuildInfo;
  backend: ClosedBetaDiagnosticsBackendInfo;
  device: ClosedBetaDiagnosticsDeviceInfo;
  state: Record<string, unknown>;
  recentEvents: Array<Record<string, unknown>>;
};

type ClosedBetaDiagnosticsInput = {
  generatedAt?: string;
  featureArea?: string | null;
  issueSummary?: string | null;
  build: ClosedBetaDiagnosticsBuildInfo;
  backend: ClosedBetaDiagnosticsBackendInfo;
  device?: Record<string, unknown> | null;
  state?: Record<string, unknown> | null;
  recentEvents?: Array<Record<string, unknown>> | null;
};

function sanitizeString(value: string): string {
  return sanitizeECSDiagnosticText(value, 600);
}

export function sanitizeClosedBetaDiagnosticsPayload<T = unknown>(payload: T, _depth = 0): T {
  return sanitizeECSDiagnosticValue(payload, {
    maxDepth: 8,
    maxArrayLength: 40,
    maxObjectKeys: 48,
    maxStringLength: 600,
  });
}

function cleanString(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? sanitizeString(trimmed) : fallback;
}

function cleanOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? sanitizeString(trimmed) : null;
}

function cleanBoolean(value: unknown): boolean {
  return value === true;
}

export function buildClosedBetaDiagnosticsReport(input: ClosedBetaDiagnosticsInput): ClosedBetaDiagnosticsReport {
  const deviceInput = input.device ?? {};
  return {
    generatedAt: cleanString(input.generatedAt, new Date().toISOString()),
    featureArea: cleanString(input.featureArea, 'Unknown'),
    issueSummary: cleanOptionalString(input.issueSummary),
    build: {
      appName: cleanString(input.build.appName, 'Expedition Command System'),
      packageId: cleanString(input.build.packageId, 'unknown'),
      versionName: cleanString(input.build.versionName, 'unknown'),
      versionCode: input.build.versionCode,
      runtimeVersion: cleanOptionalString(input.build.runtimeVersion),
      buildProfile: cleanOptionalString(input.build.buildProfile),
      channel: cleanOptionalString(input.build.channel),
      environment: cleanOptionalString(input.build.environment),
    },
    backend: {
      supabaseProjectRef: cleanOptionalString(input.backend.supabaseProjectRef),
      supabaseConfigured: cleanBoolean(input.backend.supabaseConfigured),
      mapboxConfigured: cleanBoolean(input.backend.mapboxConfigured),
    },
    device: {
      platform: cleanString(deviceInput.platform, 'unknown'),
      osVersion: cleanOptionalString(deviceInput.osVersion),
      model: cleanOptionalString(deviceInput.model),
    },
    state: sanitizeClosedBetaDiagnosticsPayload(input.state ?? {}),
    recentEvents: (input.recentEvents ?? [])
      .slice(-20)
      .map((event) => sanitizeClosedBetaDiagnosticsPayload(event)),
  };
}

function yesNo(value: boolean): string {
  return value ? 'yes' : 'no';
}

function valueOrUnknown(value: unknown): string {
  if (value == null || value === '') return 'unknown';
  return String(value);
}

export function formatClosedBetaDiagnosticsReport(report: ClosedBetaDiagnosticsReport): string {
  const lines = [
    'ECS Closed Beta Diagnostics',
    `generatedAt: ${report.generatedAt}`,
    `featureArea: ${report.featureArea}`,
    `issueSummary: ${valueOrUnknown(report.issueSummary)}`,
    '',
    'Build',
    `appName: ${report.build.appName}`,
    `packageId: ${report.build.packageId}`,
    `versionName: ${report.build.versionName}`,
    `versionCode: ${report.build.versionCode}`,
    `runtimeVersion: ${valueOrUnknown(report.build.runtimeVersion)}`,
    `buildProfile: ${valueOrUnknown(report.build.buildProfile)}`,
    `channel: ${valueOrUnknown(report.build.channel)}`,
    `environment: ${valueOrUnknown(report.build.environment)}`,
    '',
    'Backend',
    `backendProject: ${valueOrUnknown(report.backend.supabaseProjectRef)}`,
    `supabaseConfigured: ${yesNo(report.backend.supabaseConfigured)}`,
    `mapboxConfigured: ${yesNo(report.backend.mapboxConfigured)}`,
    '',
    'Device',
    `platform: ${report.device.platform}`,
    `osVersion: ${valueOrUnknown(report.device.osVersion)}`,
    `model: ${valueOrUnknown(report.device.model)}`,
    '',
    'State',
    ...Object.entries(report.state).map(([key, value]) => `${key}: ${valueOrUnknown(value)}`),
    '',
    'Recent Events',
    ...(report.recentEvents.length
      ? report.recentEvents.map((event, index) => `${index + 1}. ${JSON.stringify(event)}`)
      : ['none']),
  ];

  return lines.join('\n');
}
