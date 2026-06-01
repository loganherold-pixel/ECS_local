export const CAMP_STRUCTURE_PRIVACY_BUFFER_MILES = 1;

export type CampStructurePrivacyBufferStatus = 'blocked' | 'clear' | 'unknown';

export type CampStructurePrivacyBufferAssessment = {
  status: CampStructurePrivacyBufferStatus;
  bufferMiles: number;
  nearestDistanceMiles: number | null;
  sourceKey: string | null;
  reason: string | null;
};

export type CampStructurePrivacyBufferFields = {
  nearBuildings?: boolean | null;
  nearBuilding?: boolean | null;
  buildingProximity?: boolean | null;
  nearStructure?: boolean | null;
  nearStructures?: boolean | null;
  structureProximity?: boolean | null;
  nearResidential?: boolean | null;
  nearResidence?: boolean | null;
  nearResidentialStructure?: boolean | null;
  nearestBuildingMiles?: number | null;
  nearestBuildingDistanceMiles?: number | null;
  buildingDistanceMiles?: number | null;
  distanceToBuildingMiles?: number | null;
  distanceFromBuildingMiles?: number | null;
  nearestStructureMiles?: number | null;
  nearestStructureDistanceMiles?: number | null;
  structureDistanceMiles?: number | null;
  distanceToStructureMiles?: number | null;
  distanceFromStructureMiles?: number | null;
  nearestResidentialStructureMiles?: number | null;
  nearestResidentialStructureDistanceMiles?: number | null;
  residentialStructureDistanceMiles?: number | null;
  distanceToResidentialStructureMiles?: number | null;
  distanceFromResidentialStructureMiles?: number | null;
  nearestResidenceMiles?: number | null;
  nearestDevelopedLotMiles?: number | null;
  developedLotDistanceMiles?: number | null;
};

const BOOLEAN_CONFLICT_KEYS = [
  'nearBuildings',
  'nearBuilding',
  'buildingProximity',
  'nearStructure',
  'nearStructures',
  'structureProximity',
  'nearResidential',
  'nearResidence',
  'nearResidentialStructure',
  'nearDevelopedLot',
  'developedLotProximity',
] as const;

const MILE_DISTANCE_KEYS = [
  'nearestBuildingMiles',
  'nearestBuildingDistanceMiles',
  'buildingDistanceMiles',
  'distanceToBuildingMiles',
  'distanceFromBuildingMiles',
  'distanceToNearestBuildingMiles',
  'nearestStructureMiles',
  'nearestStructureDistanceMiles',
  'structureDistanceMiles',
  'distanceToStructureMiles',
  'distanceFromStructureMiles',
  'distanceToNearestStructureMiles',
  'nearestResidentialStructureMiles',
  'nearestResidentialStructureDistanceMiles',
  'residentialStructureDistanceMiles',
  'distanceToResidentialStructureMiles',
  'distanceFromResidentialStructureMiles',
  'nearestResidenceMiles',
  'nearestResidentialMiles',
  'nearestDevelopedLotMiles',
  'developedLotDistanceMiles',
] as const;

const METER_DISTANCE_KEYS = [
  'nearestBuildingMeters',
  'buildingDistanceMeters',
  'distanceToBuildingMeters',
  'nearestStructureMeters',
  'structureDistanceMeters',
  'distanceToStructureMeters',
  'nearestResidentialStructureMeters',
  'residentialStructureDistanceMeters',
] as const;

const FOOT_DISTANCE_KEYS = [
  'nearestBuildingFeet',
  'buildingDistanceFeet',
  'distanceToBuildingFeet',
  'nearestStructureFeet',
  'structureDistanceFeet',
  'distanceToStructureFeet',
  'nearestResidentialStructureFeet',
  'residentialStructureDistanceFeet',
] as const;

const NESTED_RECORD_KEYS = [
  'conditions',
  'metadata',
  'sourceMetadata',
  'mapMetadata',
  'proximity',
  'privacy',
  'safety',
  'campScout',
  'campOps',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readFiniteNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function collectCandidateRecords(input: unknown): Record<string, unknown>[] {
  if (!isRecord(input)) return [];
  const records: Record<string, unknown>[] = [input];

  for (const key of NESTED_RECORD_KEYS) {
    const value = input[key];
    if (isRecord(value)) records.push(value);
  }

  return records;
}

function readBooleanConflict(records: Record<string, unknown>[]): string | null {
  for (const record of records) {
    for (const key of BOOLEAN_CONFLICT_KEYS) {
      if (record[key] === true) return key;
    }
  }
  return null;
}

function readNearestDistanceMiles(
  records: Record<string, unknown>[],
): { distanceMiles: number; sourceKey: string } | null {
  let nearest: { distanceMiles: number; sourceKey: string } | null = null;

  const setNearest = (distanceMiles: number, sourceKey: string) => {
    if (distanceMiles < 0) return;
    if (!nearest || distanceMiles < nearest.distanceMiles) {
      nearest = { distanceMiles, sourceKey };
    }
  };

  for (const record of records) {
    for (const key of MILE_DISTANCE_KEYS) {
      const distance = readFiniteNumber(record, key);
      if (distance != null) setNearest(distance, key);
    }
    for (const key of METER_DISTANCE_KEYS) {
      const distance = readFiniteNumber(record, key);
      if (distance != null) setNearest(distance / 1609.344, key);
    }
    for (const key of FOOT_DISTANCE_KEYS) {
      const distance = readFiniteNumber(record, key);
      if (distance != null) setNearest(distance / 5280, key);
    }
  }

  return nearest;
}

export function assessCampStructurePrivacyBuffer(
  input: unknown,
  bufferMiles = CAMP_STRUCTURE_PRIVACY_BUFFER_MILES,
): CampStructurePrivacyBufferAssessment {
  const normalizedBufferMiles =
    typeof bufferMiles === 'number' && Number.isFinite(bufferMiles) && bufferMiles > 0
      ? bufferMiles
      : CAMP_STRUCTURE_PRIVACY_BUFFER_MILES;
  const records = collectCandidateRecords(input);
  const booleanConflictKey = readBooleanConflict(records);

  if (booleanConflictKey) {
    return {
      status: 'blocked',
      bufferMiles: normalizedBufferMiles,
      nearestDistanceMiles: null,
      sourceKey: booleanConflictKey,
      reason: `Known structure/residential proximity is inside the ${normalizedBufferMiles} mi camp privacy buffer.`,
    };
  }

  const nearest = readNearestDistanceMiles(records);
  if (!nearest) {
    return {
      status: 'unknown',
      bufferMiles: normalizedBufferMiles,
      nearestDistanceMiles: null,
      sourceKey: null,
      reason: null,
    };
  }

  if (nearest.distanceMiles <= normalizedBufferMiles) {
    return {
      status: 'blocked',
      bufferMiles: normalizedBufferMiles,
      nearestDistanceMiles: nearest.distanceMiles,
      sourceKey: nearest.sourceKey,
      reason: `Nearest known structure is ${nearest.distanceMiles.toFixed(2)} mi away, inside the ${normalizedBufferMiles} mi camp privacy buffer.`,
    };
  }

  return {
    status: 'clear',
    bufferMiles: normalizedBufferMiles,
    nearestDistanceMiles: nearest.distanceMiles,
    sourceKey: nearest.sourceKey,
    reason: null,
  };
}

export function hasCampStructurePrivacyBufferConflict(
  input: unknown,
  bufferMiles = CAMP_STRUCTURE_PRIVACY_BUFFER_MILES,
): boolean {
  return assessCampStructurePrivacyBuffer(input, bufferMiles).status === 'blocked';
}
