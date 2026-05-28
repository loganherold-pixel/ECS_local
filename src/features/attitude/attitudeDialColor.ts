export const ATTITUDE_DIAL_SAFE_COLOR = '#45d37f';
export const ATTITUDE_DIAL_WARNING_COLOR = '#f2c94c';
export const ATTITUDE_DIAL_CRITICAL_COLOR = '#ff5f4f';

const DEFAULT_WARNING_RATIO = 0.5;
const DEFAULT_CRITICAL_RATIO = 0.82;

function toFiniteNumber(value: number | undefined, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function channelFromHex(hex: string, offset: number): number {
  const parsed = Number.parseInt(hex.slice(offset, offset + 2), 16);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mixHexColor(fromHex: string, toHex: string, amount: number): string {
  const ratio = clamp01(amount);
  const from = {
    r: channelFromHex(fromHex, 1),
    g: channelFromHex(fromHex, 3),
    b: channelFromHex(fromHex, 5),
  };
  const to = {
    r: channelFromHex(toHex, 1),
    g: channelFromHex(toHex, 3),
    b: channelFromHex(toHex, 5),
  };

  const channel = (start: number, end: number) =>
    Math.round(start + (end - start) * ratio).toString(16).padStart(2, '0');

  return `#${channel(from.r, to.r)}${channel(from.g, to.g)}${channel(from.b, to.b)}`;
}

export function getAttitudeDialMagnitudeColor({
  valueDeg,
  minDeg,
  maxDeg,
  warningThresholdDeg,
  criticalThresholdDeg,
}: {
  valueDeg: number;
  minDeg: number;
  maxDeg: number;
  warningThresholdDeg?: number;
  criticalThresholdDeg?: number;
}): string {
  const magnitude = Math.abs(toFiniteNumber(valueDeg));
  const visualRange = Math.max(Math.abs(toFiniteNumber(minDeg)), Math.abs(toFiniteNumber(maxDeg)), 1);
  const warningThreshold = Math.max(
    0.1,
    Math.abs(toFiniteNumber(warningThresholdDeg, visualRange * DEFAULT_WARNING_RATIO)),
  );
  const criticalThreshold = Math.max(
    warningThreshold + 0.1,
    Math.abs(toFiniteNumber(criticalThresholdDeg, visualRange * DEFAULT_CRITICAL_RATIO)),
  );

  if (magnitude <= warningThreshold) {
    return mixHexColor(ATTITUDE_DIAL_SAFE_COLOR, ATTITUDE_DIAL_WARNING_COLOR, magnitude / warningThreshold);
  }

  if (magnitude < criticalThreshold) {
    return mixHexColor(
      ATTITUDE_DIAL_WARNING_COLOR,
      ATTITUDE_DIAL_CRITICAL_COLOR,
      (magnitude - warningThreshold) / (criticalThreshold - warningThreshold),
    );
  }

  return ATTITUDE_DIAL_CRITICAL_COLOR;
}
