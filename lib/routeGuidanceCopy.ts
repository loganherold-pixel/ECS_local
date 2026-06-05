const GENERIC_ROUTE_TARGET_LABELS = new Set([
  'active route',
  'cached route',
  'downloaded route',
  'highlighted route',
  'imported route',
  'offline route',
  'route',
  'route destination',
  'route preview',
  'saved route',
  'selected route',
]);

function normalizeRouteGuidanceTargetLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

export function isGenericRouteGuidanceTargetLabel(value: string | null | undefined): boolean {
  if (typeof value !== 'string') return false;
  const normalized = normalizeRouteGuidanceTargetLabel(value);
  if (!normalized) return false;
  if (GENERIC_ROUTE_TARGET_LABELS.has(normalized)) return true;
  return /^cached route \d+$/.test(normalized) || /^offline route \d+$/.test(normalized);
}

export function cleanRouteGuidanceTargetLabel(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || isGenericRouteGuidanceTargetLabel(trimmed)) return null;
  return trimmed;
}

export function buildHighlightedRouteInstruction(targetLabel: string | null | undefined): string {
  const target = cleanRouteGuidanceTargetLabel(targetLabel);
  return target ? `Follow highlighted route toward ${target}` : 'Follow highlighted route';
}

export function buildProceedRouteInstruction(targetLabel: string | null | undefined): string {
  const target = cleanRouteGuidanceTargetLabel(targetLabel);
  return target ? `Proceed to ${target}` : 'Follow highlighted route';
}

export function buildContinueRouteInstruction(targetLabel: string | null | undefined): string {
  const target = cleanRouteGuidanceTargetLabel(targetLabel);
  return target ? `Continue to ${target}` : 'Continue on highlighted route';
}

export function buildReadyRouteInstruction(targetLabel: string | null | undefined): string {
  const target = cleanRouteGuidanceTargetLabel(targetLabel);
  return target ? `Ready to ${target}` : 'Route ready';
}
