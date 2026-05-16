import type {
  DispersedCampingConfidence,
  DispersedCampingLandManager,
  DispersedCampingRegion,
} from './dispersedCampingTypes';

export type DispersedCampingClassificationInput = {
  landManager: DispersedCampingLandManager;
  designation?: string;
  accessType?: string;
  hasMvumAccessNearby?: boolean;
  knownClosure?: boolean;
  permitRequired?: boolean;
  fireRestriction?: boolean;
  privateOrTribal?: boolean;
  militaryOrRestricted?: boolean;
  nationalParkOrMonument?: boolean;
};

function normalizedText(value?: string): string {
  return String(value ?? '').trim().toLowerCase();
}

function hasExplicitBackcountryPermitDesignation(value?: string): boolean {
  const designation = normalizedText(value);
  return designation.includes('backcountry') || designation.includes('permit area');
}

function hasExclusionDesignation(value?: string): boolean {
  const designation = normalizedText(value);
  if (!designation) return false;
  return [
    'closure',
    'closed',
    'restricted',
    'no camping',
    'day use',
    'developed recreation',
    'administrative',
    'research natural area',
    'critical habitat closure',
  ].some((token) => designation.includes(token));
}

function hasAccessConflict(value?: string): boolean {
  const accessType = normalizedText(value);
  if (!accessType) return false;
  return [
    'no public access',
    'private access',
    'closed road',
    'restricted access',
    'administrative access',
  ].some((token) => accessType.includes(token));
}

export function classifyDispersedCampingRegion(
  input: DispersedCampingClassificationInput,
): DispersedCampingConfidence {
  if (
    input.privateOrTribal === true ||
    input.militaryOrRestricted === true ||
    input.knownClosure === true ||
    input.landManager === 'PRIVATE' ||
    input.landManager === 'TRIBAL' ||
    input.landManager === 'MILITARY'
  ) {
    return 'restricted';
  }

  if (input.nationalParkOrMonument === true || input.landManager === 'NPS') {
    return hasExplicitBackcountryPermitDesignation(input.designation) ? 'verify' : 'restricted';
  }

  if (hasAccessConflict(input.accessType)) return 'restricted';
  if (hasExclusionDesignation(input.designation)) return 'verify';
  if (input.permitRequired === true || input.fireRestriction === true) return 'verify';

  if (input.landManager === 'BLM') {
    if (input.knownClosure === false && input.permitRequired === false && input.fireRestriction === false) {
      return 'high';
    }
    return 'verify';
  }

  if (input.landManager === 'USFS') {
    if (
      input.hasMvumAccessNearby === true &&
      input.knownClosure === false &&
      input.permitRequired === false &&
      input.fireRestriction === false
    ) {
      return 'medium';
    }
    return 'verify';
  }

  return 'verify';
}

export function getDispersedCampingEligibilityLabel(
  confidence: DispersedCampingConfidence,
): DispersedCampingRegion['eligibilityLabel'] {
  switch (confidence) {
    case 'high':
    case 'medium':
      return 'Likely eligible';
    case 'restricted':
      return 'Restricted / unavailable';
    case 'verify':
    default:
      return 'Verify locally';
  }
}

export function getDispersedCampingStyleKey(confidence: DispersedCampingConfidence): string {
  switch (confidence) {
    case 'high':
      return 'likely-eligible-high';
    case 'medium':
      return 'likely-eligible-medium';
    case 'restricted':
      return 'restricted-unavailable';
    case 'verify':
    default:
      return 'verify-locally';
  }
}

export function buildDispersedCampingCaveats(region: DispersedCampingRegion): string[] {
  const caveats = new Set<string>();
  caveats.add('Verify locally');
  caveats.add('Check posted closures');
  caveats.add('Check current fire restrictions');

  if (region.permitRequired === true) {
    caveats.add('Permit may be required');
  }
  if (region.fireRestrictionKnown !== true) {
    caveats.add('Fire restriction status needs verification');
  }
  if (region.seasonalAccessKnown !== true) {
    caveats.add('Seasonal access needs verification');
  }
  if (region.closureKnown !== true && region.confidence !== 'restricted') {
    caveats.add('Closure status needs verification');
  }

  for (const restriction of region.restrictions) {
    if (restriction.trim().length > 0) caveats.add(restriction.trim());
  }

  return Array.from(caveats);
}
