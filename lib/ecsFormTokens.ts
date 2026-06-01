import { ECS, TACTICAL } from './theme';

export const ECS_FORM = {
  height: {
    input: 48,
    compactInput: 42,
    settingRow: 54,
    compactSettingRow: 46,
    segmented: 42,
    toggle: 30,
  },
  radius: {
    field: 12,
    compactField: 10,
    row: 12,
    segmented: 12,
  },
  padding: {
    fieldX: 14,
    fieldY: 12,
    compactFieldX: 12,
    compactFieldY: 10,
    sectionX: 14,
    sectionY: 14,
    inlineGap: 8,
    controlGap: 10,
  },
  border: {
    default: ECS.stroke,
    strong: 'rgba(196,138,44,0.18)',
    focus: 'rgba(196,138,44,0.36)',
    disabled: 'rgba(255,255,255,0.08)',
    error: 'rgba(192,57,43,0.32)',
    telemetry: 'rgba(90,200,250,0.28)',
  },
  background: {
    field: ECS.bgElev,
    fieldMuted: 'rgba(255,255,255,0.025)',
    section: ECS.bgPanel,
    sectionMuted: 'rgba(11,15,18,0.72)',
    telemetry: 'rgba(90,200,250,0.05)',
    disabled: 'rgba(255,255,255,0.02)',
    error: 'rgba(192,57,43,0.06)',
  },
  text: {
    label: TACTICAL.textMuted,
    value: TACTICAL.text,
    helper: TACTICAL.textMuted,
    placeholder: 'rgba(183,191,199,0.46)',
    unit: TACTICAL.textMuted,
    disabled: 'rgba(183,191,199,0.42)',
    error: TACTICAL.danger,
    telemetry: '#5AC8FA',
  },
} as const;

export function parseNumericInput(value: string): string {
  const cleaned = value.replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  if (parts.length <= 1) return cleaned;
  return `${parts[0]}.${parts.slice(1).join('')}`;
}

export function formatUnitValue(
  value: string | number | null | undefined,
  unit: string,
  fallback = 'Not Set',
): string {
  if (value == null || value === '') return fallback;
  return `${value} ${unit}`;
}

export function formatEmptySettingValue(value: string | null | undefined, fallback = 'Not Set') {
  if (value == null) return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}
