export type RouteTerrainConfidenceLevel = 'low' | 'moderate' | 'high' | 'critical' | 'unknown';

export type RouteTerrainConfidenceImpact = {
  modifier: number;
  reasons: string[];
  warnings: string[];
  elevationGainFt: number | null;
  elevationLossFt: number | null;
  elevationChangeFt: number | null;
  terrainRiskScore: number | null;
  terrainRiskLevel: RouteTerrainConfidenceLevel;
  terrainRiskEventCount: number;
  terrainDifficulty: number | null;
  remotenessScore: number | null;
  sourceState: 'provided' | 'estimated' | 'missing';
};

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value.replace(/,/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeScore(value: unknown): number | null {
  const numeric = finiteNumber(value);
  if (numeric == null) return null;
  return Math.max(0, Math.min(100, numeric <= 1 ? numeric * 100 : numeric));
}

function readNumber(records: UnknownRecord[], keys: string[], normalize = false): number | null {
  for (const source of records) {
    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
      const value = normalize ? normalizeScore(source[key]) : finiteNumber(source[key]);
      if (value != null) return value;
    }
  }
  return null;
}

function readString(records: UnknownRecord[], keys: string[]): string | null {
  for (const source of records) {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'string' && value.trim().length > 0) return value.trim();
    }
  }
  return null;
}

function countArray(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  return value.filter((entry) => {
    if (typeof entry === 'string') return entry.trim().length > 0;
    return entry != null;
  }).length;
}

function readEventCount(records: UnknownRecord[]): number {
  const numeric = readNumber(records, [
    'terrainRiskEventCount',
    'terrain_risk_event_count',
    'riskEventCount',
    'risk_event_count',
    'highRiskEventCount',
    'high_risk_event_count',
    'hazardCount',
    'hazard_count',
    'terrainHazardCount',
    'terrain_hazard_count',
  ]);
  const arrayCount = records.reduce((max, source) => {
    const count = Math.max(
      countArray(source.terrainRiskEvents),
      countArray(source.terrain_risk_events),
      countArray(source.riskEvents),
      countArray(source.risk_events),
      countArray(source.terrainEvents),
      countArray(source.terrain_events),
      countArray(source.hazardEvents),
      countArray(source.hazard_events),
      countArray(source.riskWarnings),
      countArray(source.risk_warnings),
    );
    return Math.max(max, count);
  }, 0);
  return Math.max(0, Math.round(Math.max(numeric ?? 0, arrayCount)));
}

function confidenceLevel(value: string | null, riskScore: number | null): RouteTerrainConfidenceLevel {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (/critical|severe|extreme|red/.test(normalized)) return 'critical';
  if (/high|elevated|orange/.test(normalized)) return 'high';
  if (/moderate|medium|watch|caution|yellow/.test(normalized)) return 'moderate';
  if (/low|clear|normal|green/.test(normalized)) return 'low';
  if (riskScore != null) {
    if (riskScore >= 76) return 'critical';
    if (riskScore >= 56) return 'high';
    if (riskScore >= 36) return 'moderate';
    return 'low';
  }
  return 'unknown';
}

function difficultyScore(value: unknown): number | null {
  const numeric = normalizeScore(value);
  if (numeric != null) return numeric > 10 ? numeric / 10 : numeric;
  const label = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!label) return null;
  if (/extreme/.test(label)) return 9;
  if (/technical|difficult|hard|advanced/.test(label)) return 7;
  if (/moderate|intermediate/.test(label)) return 4;
  if (/easy|stock|green|low/.test(label)) return 2;
  return null;
}

function readDifficulty(records: UnknownRecord[]): number | null {
  const numeric = readNumber(records, [
    'terrainDifficulty',
    'terrain_difficulty',
    'difficultyScore',
    'difficulty_score',
    'technicalDifficulty',
    'technical_difficulty',
  ]);
  if (numeric != null) return numeric > 10 ? Math.max(0, Math.min(10, numeric / 10)) : numeric;

  for (const source of records) {
    const value = difficultyScore(source.difficulty ?? source.difficultyRating ?? source.difficulty_rating);
    if (value != null) return value;
  }
  return null;
}

function nestedRecords(route: unknown, metadataOverride?: UnknownRecord): UnknownRecord[] {
  const routeRecord = record(route);
  const routeMetadata = record(routeRecord.routeMetadata);
  const metadata = metadataOverride ?? routeMetadata;
  const catalogVerification = record(metadata.catalogVerification);
  const operationalCriteria = record(metadata.routeCatalogOperationalCriteria ?? catalogVerification.operationalCriteria);

  return [
    routeRecord,
    metadata,
    record(routeRecord.routeTerrainConfidence),
    record(metadata.routeTerrainConfidence),
    record(routeRecord.terrainRisk),
    record(metadata.terrainRisk),
    record(routeRecord.riskPreview),
    record(metadata.riskPreview),
    record(routeRecord.terrainProfile),
    record(metadata.terrainProfile),
    record(routeRecord.routeIntelligence),
    record(metadata.routeIntelligence),
    record(operationalCriteria.routeIntelligence),
    operationalCriteria,
  ].filter((source) => Object.keys(source).length > 0);
}

function unique(values: string[], limit = 5): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const clean = value.trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    output.push(clean);
    if (output.length >= limit) break;
  }
  return output;
}

export function deriveRouteTerrainConfidenceImpact(
  route: unknown,
  metadata?: UnknownRecord,
): RouteTerrainConfidenceImpact {
  const records = nestedRecords(route, metadata);
  const reasons: string[] = [];
  const warnings: string[] = [];
  let modifier = 0;

  const elevationGainFt = readNumber(records, [
    'elevationGainFt',
    'elevation_gain_ft',
    'elevationGainFeet',
    'elevation_gain_feet',
    'totalElevationGainFt',
    'total_elevation_gain_ft',
    'ascentFt',
    'ascent_ft',
    'positiveElevationFt',
    'positive_elevation_ft',
  ]);
  const elevationLossFt = readNumber(records, [
    'elevationLossFt',
    'elevation_loss_ft',
    'elevationLossFeet',
    'elevation_loss_feet',
    'totalElevationLossFt',
    'total_elevation_loss_ft',
    'descentFt',
    'descent_ft',
  ]);
  const elevationChangeFt = readNumber(records, [
    'elevationChangeFt',
    'elevation_change_ft',
    'elevationDeltaFt',
    'elevation_delta_ft',
    'maxElevationDeltaFt',
    'max_elevation_delta_ft',
    'verticalReliefFt',
    'vertical_relief_ft',
  ]);
  const terrainRiskScore = readNumber(records, [
    'terrainRiskScore',
    'terrain_risk_score',
    'routeTerrainRiskScore',
    'route_terrain_risk_score',
    'riskScore',
    'risk_score',
    'score',
  ], true);
  const terrainRiskLevel = confidenceLevel(
    readString(records, [
      'terrainRiskLevel',
      'terrain_risk_level',
      'routeTerrainRiskLevel',
      'route_terrain_risk_level',
      'riskLevel',
      'risk_level',
      'level',
      'status',
    ]),
    terrainRiskScore,
  );
  const terrainRiskEventCount = readEventCount(records);
  const terrainDifficulty = readDifficulty(records);
  const remotenessScore = readNumber(records, ['remotenessScore', 'remoteness_score']);

  if (elevationGainFt != null) {
    if (elevationGainFt <= 300) {
      modifier += 2;
      reasons.push('Low elevation gain keeps route confidence higher.');
    } else if (elevationGainFt >= 5000) {
      modifier -= 6;
      warnings.push('Major elevation gain increases route confidence uncertainty.');
    } else if (elevationGainFt >= 3000) {
      modifier -= 4;
      warnings.push('High elevation gain increases route confidence uncertainty.');
    } else if (elevationGainFt >= 1500) {
      modifier -= 2;
      warnings.push('Meaningful elevation gain requires route-profile review.');
    } else if (elevationGainFt >= 800) {
      modifier -= 1;
    }
  }

  if (elevationLossFt != null && elevationLossFt >= 3000) {
    modifier -= elevationLossFt >= 5000 ? 3 : 2;
    warnings.push('Large descent profile adds braking and exposure uncertainty.');
  }

  if (elevationChangeFt != null && elevationChangeFt >= 3000) {
    modifier -= elevationChangeFt >= 5000 ? 3 : 2;
    warnings.push('Large vertical relief increases route-profile uncertainty.');
  }

  const riskPenalty =
    terrainRiskScore == null
      ? 0
      : terrainRiskScore >= 75
        ? -8
        : terrainRiskScore >= 55
          ? -5
          : terrainRiskScore >= 35
            ? -2
            : terrainRiskScore <= 15
              ? 2
              : 0;
  const levelPenalty =
    terrainRiskLevel === 'critical' ? -8 :
    terrainRiskLevel === 'high' ? -5 :
    terrainRiskLevel === 'moderate' ? -2 :
    terrainRiskLevel === 'low' ? 1 :
    0;
  const selectedRiskModifier = riskPenalty < 0 || levelPenalty < 0
    ? Math.min(riskPenalty, levelPenalty)
    : Math.max(riskPenalty, levelPenalty);
  modifier += selectedRiskModifier;
  if (selectedRiskModifier > 0) reasons.push('Low terrain-risk signal supports route confidence.');
  if (selectedRiskModifier <= -5) warnings.push('Elevated terrain-risk signal reduces route confidence.');
  else if (selectedRiskModifier < 0) warnings.push('Terrain-risk signal requires review.');

  if (terrainRiskEventCount > 0) {
    modifier -= Math.min(6, terrainRiskEventCount * 2);
    warnings.push(`${terrainRiskEventCount} terrain-risk event${terrainRiskEventCount === 1 ? '' : 's'} on route profile.`);
  }

  if (terrainDifficulty != null) {
    if (terrainDifficulty >= 9) {
      modifier -= 5;
      warnings.push('Extreme terrain rating reduces route confidence margin.');
    } else if (terrainDifficulty >= 7) {
      modifier -= 3;
      warnings.push('Technical terrain rating reduces route confidence margin.');
    } else if (terrainDifficulty >= 6) {
      modifier -= 1;
    } else if (terrainDifficulty <= 3) {
      modifier += 1;
      reasons.push('Lower technical difficulty supports route confidence.');
    }
  }

  if (remotenessScore != null) {
    if (remotenessScore >= 9) modifier -= 2;
    else if (remotenessScore >= 7) modifier -= 1;
  }

  const hasProvidedTerrain =
    elevationGainFt != null ||
    elevationLossFt != null ||
    elevationChangeFt != null ||
    terrainRiskScore != null ||
    terrainRiskLevel !== 'unknown' ||
    terrainRiskEventCount > 0;
  const hasEstimatedTerrain = terrainDifficulty != null || remotenessScore != null;
  if (!hasProvidedTerrain && !hasEstimatedTerrain) {
    modifier -= 2;
    warnings.push('Terrain and elevation confidence inputs are unavailable.');
  }

  return {
    modifier: Math.max(-24, Math.min(6, Math.round(modifier))),
    reasons: unique(reasons),
    warnings: unique(warnings),
    elevationGainFt,
    elevationLossFt,
    elevationChangeFt,
    terrainRiskScore,
    terrainRiskLevel,
    terrainRiskEventCount,
    terrainDifficulty: terrainDifficulty != null ? Math.max(0, Math.min(10, terrainDifficulty)) : null,
    remotenessScore,
    sourceState: hasProvidedTerrain ? 'provided' : hasEstimatedTerrain ? 'estimated' : 'missing',
  };
}
