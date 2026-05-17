function context(overrides = {}) {
  return {
    id: 'ctx-eval',
    currentTimeIso: '2026-04-30T16:00:00.000Z',
    desiredArrivalWindow: {
      startIso: '2026-04-30T17:00:00.000Z',
      endIso: '2026-04-30T19:00:00.000Z',
      latestAcceptableIso: '2026-04-30T19:30:00.000Z',
    },
    daylightInfo: {
      sunsetIso: '2026-04-30T19:45:00.000Z',
      source: 'manual',
      confidence: 'medium',
    },
    riskTolerance: 'balanced',
    offlineMode: 'online',
    ...overrides,
  };
}

function candidate(id, name = id, overrides = {}) {
  return {
    id,
    name,
    location: { latitude: 39.1, longitude: -119.9 },
    source: 'manual',
    sourceConfidence: 'high',
    lastVerifiedDate: '2026-04-10T00:00:00.000Z',
    ...overrides,
  };
}

function enrichment(candidateId, overrides = {}) {
  return {
    candidateId,
    legalStatus: 'allowed',
    legalConfidence: 'high',
    closureStatus: 'open',
    publicAccessStatus: 'public',
    accessDifficulty: 'easy',
    vehicleFit: 'fit',
    trailerSuitability: 'fit',
    turnaroundSuitability: 'fit',
    trailerTurnaroundConfidence: 'high',
    deadEndRisk: 'low',
    backingRequired: false,
    roadWidthConfidence: 'high',
    groupCapacityEstimate: 6,
    groupCapacityConfidence: 'high',
    etaIso: '2026-04-30T18:00:00.000Z',
    etaMinutesFromNow: 120,
    sunsetMarginMinutes: 80,
    fuelImpact: { value: 85, unit: 'miles', impact: 'neutral', confidence: 'high' },
    waterImpact: { value: 10, unit: 'gallons', impact: 'neutral', confidence: 'high' },
    reliableWaterRefillAvailable: false,
    terrainSlopeEstimate: { value: 2, unit: 'degrees', confidence: 'high', source: 'inferred' },
    weatherExposure: 'neutral',
    fireRestrictionStatus: 'none_known',
    privacyLikelihood: 'moderate',
    occupancyLikelihood: 'low',
    lateArrivalRisk: 'neutral',
    dataConfidence: 'high',
    dataLimitations: [],
    ...overrides,
  };
}

const campOpsEvaluationFixtures = [
  {
    id: 'on_time_normal_day',
    title: 'On-time normal day',
    context: context({ id: 'ctx-on-time', plannedCampId: 'planned-camp' }),
    candidates: [
      candidate('planned-camp', 'Planned Camp'),
      candidate('comfort-alt', 'Comfort Alt', { location: { latitude: 39.12, longitude: -119.91 } }),
    ],
    enrichments: {
      'planned-camp': enrichment('planned-camp'),
      'comfort-alt': enrichment('comfort-alt', {
        privacyLikelihood: 'high',
        fuelImpact: { value: 92, unit: 'miles', impact: 'positive', confidence: 'high' },
      }),
    },
    expected: {
      recommendedCampId: 'planned-camp',
      primaryRoleCandidateId: 'planned-camp',
    },
  },
  {
    id: 'two_hour_delay',
    title: 'Two-hour delay',
    context: context({ id: 'ctx-delay', plannedCampId: 'original-scenic', delayEstimateMinutes: 120 }),
    candidates: [
      candidate('original-scenic', 'Original Scenic Camp'),
      candidate('closer-accessible', 'Closer Accessible Camp', { location: { latitude: 39.24, longitude: -119.82 } }),
    ],
    enrichments: {
      'original-scenic': enrichment('original-scenic', {
        etaIso: '2026-04-30T20:45:00.000Z',
        etaMinutesFromNow: 285,
        sunsetMarginMinutes: -60,
        lateArrivalRisk: 'critical',
        accessDifficulty: 'technical',
        vehicleFit: 'limited',
        privacyLikelihood: 'high',
      }),
      'closer-accessible': enrichment('closer-accessible', {
        etaIso: '2026-04-30T18:25:00.000Z',
        etaMinutesFromNow: 145,
        sunsetMarginMinutes: 80,
        accessDifficulty: 'easy',
      }),
    },
    expected: {
      recommendedCampId: 'closer-accessible',
      rejectedCandidateIds: ['original-scenic'],
      plannedDowngradeIncludes: 'Original Scenic Camp',
    },
  },
  {
    id: 'trailer_convoy',
    title: 'Trailer convoy',
    context: context({
      id: 'ctx-trailer',
      convoyProfile: { vehicleCount: 2, peopleCount: 3, trailerPresent: true, trailerCount: 1 },
      vehicleProfile: { trailerAttached: true },
    }),
    candidates: [
      candidate('narrow-dead-end', 'Narrow Dead End'),
      candidate('trailer-loop', 'Trailer Loop'),
    ],
    enrichments: {
      'narrow-dead-end': enrichment('narrow-dead-end', {
        accessDifficulty: 'technical',
        trailerSuitability: 'not_fit',
        turnaroundSuitability: 'not_fit',
        privacyLikelihood: 'high',
      }),
      'trailer-loop': enrichment('trailer-loop', {
        trailerSuitability: 'fit',
        turnaroundSuitability: 'fit',
        accessDifficulty: 'easy',
      }),
    },
    expected: {
      recommendedCampId: 'trailer-loop',
      rejectedCandidateIds: ['narrow-dead-end'],
      trailerSafeCampId: 'trailer-loop',
    },
  },
  {
    id: 'low_fuel_margin',
    title: 'Low fuel margin',
    context: context({ id: 'ctx-fuel', resourceState: { fuelRangeMiles: 55, waterGallons: 8, confidence: 'medium' } }),
    candidates: [
      candidate('remote-scenic', 'Remote Scenic Camp'),
      candidate('fuel-margin-camp', 'Fuel Margin Camp'),
    ],
    enrichments: {
      'remote-scenic': enrichment('remote-scenic', {
        fuelImpact: { value: 26, unit: 'miles', impact: 'watch', confidence: 'medium' },
        privacyLikelihood: 'high',
      }),
      'fuel-margin-camp': enrichment('fuel-margin-camp', {
        fuelImpact: { value: 95, unit: 'miles', impact: 'positive', confidence: 'high' },
        reliableWaterRefillAvailable: true,
      }),
    },
    expected: {
      recommendedCampId: 'fuel-margin-camp',
    },
  },
  {
    id: 'low_water_margin',
    title: 'Low water margin',
    context: context({ id: 'ctx-water', convoyProfile: { peopleCount: 4, petCount: 1 }, resourceState: { waterGallons: 4, confidence: 'medium' } }),
    candidates: [
      candidate('dry-remote', 'Dry Remote Camp'),
      candidate('water-exit-camp', 'Water Exit Camp'),
    ],
    enrichments: {
      'dry-remote': enrichment('dry-remote', {
        waterImpact: { value: 3, unit: 'gallons', impact: 'caution', confidence: 'medium' },
        reliableWaterRefillAvailable: false,
        privacyLikelihood: 'high',
      }),
      'water-exit-camp': enrichment('water-exit-camp', {
        waterImpact: { value: 14, unit: 'gallons', impact: 'positive', confidence: 'high' },
        reliableWaterRefillAvailable: true,
        exitDistanceMiles: 4,
      }),
    },
    expected: {
      recommendedCampId: 'water-exit-camp',
    },
  },
  {
    id: 'high_wind_exposed_ridge',
    title: 'High wind / exposed ridge',
    context: context({ id: 'ctx-wind' }),
    candidates: [
      candidate('exposed-ridge', 'Exposed Ridge'),
      candidate('sheltered-draw', 'Sheltered Draw'),
    ],
    enrichments: {
      'exposed-ridge': enrichment('exposed-ridge', {
        weatherExposure: 'critical',
        privacyLikelihood: 'high',
      }),
      'sheltered-draw': enrichment('sheltered-draw', {
        weatherExposure: 'neutral',
      }),
    },
    expected: {
      recommendedCampId: 'sheltered-draw',
      weatherFallbackCampId: 'sheltered-draw',
      notRecommendedCandidateIds: ['exposed-ridge'],
    },
  },
  {
    id: 'legal_uncertainty',
    title: 'Legal uncertainty',
    context: context({ id: 'ctx-legal' }),
    candidates: [
      candidate('unknown-legal-view', 'Unknown Legal View'),
      candidate('confirmed-legal', 'Confirmed Legal Camp'),
    ],
    enrichments: {
      'unknown-legal-view': enrichment('unknown-legal-view', {
        legalStatus: 'unknown',
        legalConfidence: 'unknown',
        publicAccessStatus: 'unknown',
        privacyLikelihood: 'high',
      }),
      'confirmed-legal': enrichment('confirmed-legal', {
        legalStatus: 'allowed',
        legalConfidence: 'high',
      }),
    },
    expected: {
      recommendedCampId: 'confirmed-legal',
      notConfidentCandidateIds: ['unknown-legal-view'],
      missingDataIncludes: 'legalConfidence',
    },
  },
  {
    id: 'confirmed_closure',
    title: 'Confirmed closure',
    context: context({ id: 'ctx-confirmed-closure' }),
    candidates: [
      candidate('confirmed-closed', 'Confirmed Closed Camp'),
      candidate('confirmed-open', 'Confirmed Open Camp'),
    ],
    enrichments: {
      'confirmed-closed': enrichment('confirmed-closed', {
        legalStatus: 'allowed',
        legalConfidence: 'high',
        closureStatus: 'closed',
        dataLimitations: ['Closure source: active agency closure order.'],
      }),
      'confirmed-open': enrichment('confirmed-open', {
        legalStatus: 'allowed',
        legalConfidence: 'high',
        closureStatus: 'open',
      }),
    },
    expected: {
      recommendedCampId: 'confirmed-open',
      rejectedCandidateIds: ['confirmed-closed'],
    },
  },
  {
    id: 'conflicting_legal_access_source',
    title: 'Conflicting legal/access source',
    context: context({ id: 'ctx-legal-access-conflict' }),
    candidates: [
      candidate('allowed-but-restricted', 'Allowed But Restricted'),
      candidate('resolved-public-access', 'Resolved Public Access'),
    ],
    enrichments: {
      'allowed-but-restricted': enrichment('allowed-but-restricted', {
        legalStatus: 'allowed',
        legalConfidence: 'high',
        publicAccessStatus: 'public',
        closureStatus: 'restricted',
        dataLimitations: [
          'Conflict: legal source says public camping may be allowed, but current access source says vehicle access is restricted.',
        ],
      }),
      'resolved-public-access': enrichment('resolved-public-access', {
        legalStatus: 'allowed',
        legalConfidence: 'high',
        publicAccessStatus: 'public',
        closureStatus: 'open',
      }),
    },
    expected: {
      recommendedCampId: 'resolved-public-access',
      rejectedCandidateIds: ['allowed-but-restricted'],
    },
  },
  {
    id: 'emergency_stop',
    title: 'Emergency stop',
    context: context({ id: 'ctx-emergency', riskTolerance: 'emergency_only' }),
    candidates: [
      candidate('comfortable-far', 'Comfortable Far Camp'),
      candidate('legal-accessible-emergency', 'Legal Accessible Emergency'),
    ],
    enrichments: {
      'comfortable-far': enrichment('comfortable-far', {
        etaIso: '2026-04-30T20:20:00.000Z',
        sunsetMarginMinutes: -35,
        lateArrivalRisk: 'critical',
        privacyLikelihood: 'high',
      }),
      'legal-accessible-emergency': enrichment('legal-accessible-emergency', {
        etaIso: '2026-04-30T17:45:00.000Z',
        sunsetMarginMinutes: 120,
        privacyLikelihood: 'low',
        terrainSlopeEstimate: { value: 6, unit: 'degrees', confidence: 'medium', source: 'inferred' },
      }),
    },
    expected: {
      emergencyCampId: 'legal-accessible-emergency',
    },
  },
  {
    id: 'large_group',
    title: 'Large group',
    context: context({ id: 'ctx-large-group', convoyProfile: { vehicleCount: 4, peopleCount: 9, kidCount: 2 } }),
    candidates: [
      candidate('small-camp', 'Small Camp'),
      candidate('group-basin', 'Group Basin'),
    ],
    enrichments: {
      'small-camp': enrichment('small-camp', {
        groupCapacityEstimate: 5,
        privacyLikelihood: 'high',
      }),
      'group-basin': enrichment('group-basin', {
        groupCapacityEstimate: 12,
        dataConfidence: 'high',
      }),
    },
    expected: {
      recommendedCampId: 'group-basin',
      rejectedCandidateIds: ['small-camp'],
    },
  },
  {
    id: 'offline_stale_data',
    title: 'Offline stale data',
    context: context({ id: 'ctx-offline-stale', offlineMode: 'offline' }),
    candidates: [
      candidate('stale-but-best', 'Stale But Best', {
        sourceConfidence: 'low',
        lastVerifiedDate: null,
      }),
      candidate('also-stale', 'Also Stale', {
        sourceConfidence: 'low',
        lastVerifiedDate: null,
      }),
    ],
    enrichments: {
      'stale-but-best': enrichment('stale-but-best', {
        dataConfidence: 'low',
        legalConfidence: 'medium',
        dataLimitations: ['Data freshness is stale because offline cache is older than the preferred window.'],
      }),
      'also-stale': enrichment('also-stale', {
        dataConfidence: 'low',
        legalConfidence: 'medium',
        accessDifficulty: 'moderate',
        dataLimitations: ['Data freshness is stale because offline cache is older than the preferred window.'],
      }),
    },
    expected: {
      recommendedCampId: 'stale-but-best',
      warningsInclude: 'offline or degraded data',
      confidenceAtMost: 'medium',
    },
  },
];

module.exports = {
  campOpsEvaluationFixtures,
};
