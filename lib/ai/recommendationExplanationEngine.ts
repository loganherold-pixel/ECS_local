import type {
  ECSExplanationContext,
  ECSExplanationResult,
} from './recommendationExplanationTypes';

function trimDriver(value: string): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/[–—]/g, '-')
    .replace(/\s+-\s+/g, ' ')
    .replace(/\.$/, '')
    .trim();
}

function normalizeDriver(value: string): string {
  const raw = trimDriver(value);
  const lower = raw.toLowerCase();
  if (!lower) return '';

  if (lower.includes('high remoteness')) return 'high remoteness';
  if (lower.includes('moderate remoteness')) return 'moderate remoteness';
  if (lower.includes('limited services')) return 'limited services';
  if (lower.includes('challenging terrain')) return 'challenging terrain';
  if (lower.includes('moderate terrain difficulty')) return 'moderate terrain';
  if (lower.includes('fuel stops likely required')) return 'fuel stops likely required';
  if (lower.includes('high fuel requirement')) return 'high fuel demand';
  if (lower.includes('moderate fuel requirement')) return 'moderate fuel demand';
  if (lower.includes('route may exceed vehicle capability')) return 'vehicle capability limits';
  if (lower.includes('vehicle capability may be tested')) return 'vehicle capability margin';
  if (lower.includes('terrain may challenge this vehicle')) return 'terrain fit limits';
  if (lower.includes('tire size may be insufficient')) return 'tire size limits';
  if (lower.includes('suspension lift may be too low')) return 'clearance limits';
  if (lower.includes('partial vehicle data')) return 'partial vehicle data';
  if (lower.includes('fuel specs not configured')) return 'missing fuel specs';
  if (lower.includes('water capacity not configured')) return 'missing resource specs';
  if (lower.includes('tire size not configured')) return 'tire size is estimated';
  if (lower.includes('suspension not configured')) return 'suspension is estimated';
  if (lower.includes('lower-traffic')) return 'lower traffic';
  if (lower.includes('scenic')) return 'strong scenic value';
  if (lower.includes('remote')) return 'remote setting';
  if (lower.includes('terrain variety')) return 'varied terrain';
  if (lower.includes('exploration')) return 'exploration value';
  if (lower.includes('not recently surfaced')) return 'fresh route rotation';
  if (lower.includes('grade')) return 'grade';
  if (lower.includes('wind')) return 'incoming wind';
  if (lower.includes('clearance')) return 'clearance margin';
  if (lower.includes('tire')) return 'tire margin';
  if (lower.includes('fuel')) return 'fuel margin';
  if (lower.includes('range')) return 'range margin';
  if (lower.includes('water')) return 'water margin';
  if (lower.includes('power')) return 'power margin';
  if (lower.includes('bailout')) return 'bailout access';
  if (lower.includes('recovery access')) return 'recovery access';
  if (lower.includes('route commitment')) return 'route commitment';
  if (lower.includes('reserve')) return 'reserve margin';
  if (lower.includes('services')) return 'service distance';
  if (lower.includes('signal')) return 'weak signal';
  if (lower.includes('route isolation')) return 'route isolation';
  if (lower.includes('elevation')) return 'elevation';

  return lower;
}

function dedupeDrivers(drivers: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of drivers) {
    const normalized = normalizeDriver(item);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function formatDriverList(drivers: string[]): string {
  if (drivers.length === 0) return 'current ECS inputs';
  if (drivers.length === 1) return drivers[0];
  if (drivers.length === 2) return `${drivers[0]} and ${drivers[1]}`;
  return `${drivers[0]}, ${drivers[1]}, and ${drivers[2]}`;
}

function degradedClause(value?: string): string {
  const degraded = String(value ?? '').toLowerCase();
  if (!degraded || degraded === 'fully_operational' || degraded === 'operational') return '';
  if (degraded.includes('offline')) return '; offline signal limits live refresh';
  if (degraded.includes('limited')) return '; guidance is operating with reduced signal';
  if (degraded.includes('degraded')) return '; some live inputs are degraded';
  if (degraded.includes('unavailable')) return '; some required inputs are unavailable';
  return '';
}

export function explainRecommendation(
  context: ECSExplanationContext,
): ECSExplanationResult | null {
  const topDrivers = dedupeDrivers(context.drivers).slice(0, 3);
  if (topDrivers.length === 0) return null;

  const driverText = formatDriverList(topDrivers);
  const suffix = degradedClause(context.degradedState);
  const confidence = String(context.confidenceLevel ?? '').toLowerCase();
  const priority = String(context.priorityLevel ?? '').toLowerCase();

  let text: string;
  let shortText: string | undefined;

  switch (context.type) {
    case 'hidden_gem':
      text = `Suggested due to ${driverText}${suffix}.`;
      shortText = `Suggested for ${driverText}.`;
      break;
    case 'route_risk':
      text =
        priority === 'warning' || priority === 'critical'
          ? `Elevated risk due to ${driverText}${suffix}.`
          : `Risk is driven by ${driverText}${suffix}.`;
      shortText = `Risk from ${driverText}.`;
      break;
    case 'vehicle_assessment':
      text =
        confidence === 'high' || confidence === 'moderate'
          ? `Vehicle fit is driven by ${driverText}${suffix}.`
          : `Vehicle score is estimated from ${driverText}${suffix}.`;
      shortText = `Vehicle fit from ${driverText}.`;
      break;
    case 'route_viability':
      text =
        priority === 'warning' || priority === 'critical'
          ? `Exit posture is driven by ${driverText}${suffix}.`
          : priority === 'caution'
            ? `Limited margin is driven by ${driverText}${suffix}.`
            : `Route viability reflects ${driverText}${suffix}.`;
      shortText = `Viability from ${driverText}.`;
      break;
    case 'mission_scenario':
      text =
        priority === 'warning' || priority === 'critical'
          ? `Preparation is constrained by ${driverText}${suffix}.`
          : priority === 'caution'
            ? `Planning margin is softened by ${driverText}${suffix}.`
            : `Planning posture reflects ${driverText}${suffix}.`;
      shortText = `Planning from ${driverText}.`;
      break;
    case 'offline_readiness':
      text =
        priority === 'warning' || priority === 'critical'
          ? `Offline readiness is limited by ${driverText}${suffix}.`
          : priority === 'caution'
            ? `Offline readiness is softened by ${driverText}${suffix}.`
            : `Offline readiness is supported by ${driverText}${suffix}.`;
      shortText = `Offline from ${driverText}.`;
      break;
    case 'remoteness':
      text = `Remoteness is elevated due to ${driverText}${suffix}.`;
      shortText = `Remoteness from ${driverText}.`;
      break;
    case 'weather':
      text = `Weather watch is driven by ${driverText}${suffix}.`;
      shortText = `Weather from ${driverText}.`;
      break;
    case 'bailout':
      text = `Recovery posture favors ${driverText}${suffix}.`;
      shortText = `Recovery from ${driverText}.`;
      break;
    case 'brief':
      text = `Brief posture reflects ${driverText}${suffix}.`;
      shortText = `Brief from ${driverText}.`;
      break;
    default:
      text = `Recommended due to ${driverText}${suffix}.`;
      shortText = `From ${driverText}.`;
      break;
  }

  if (context.trustMode === 'minimal_advisory' && shortText) {
    text = shortText;
  }

  return { text, shortText };
}
