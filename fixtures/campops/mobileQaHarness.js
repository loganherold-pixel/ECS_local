const {
  CAMP_OPS_MOBILE_QA_DEV_ENTRY_POINT,
  CAMP_OPS_MOBILE_QA_VIEWPORTS,
  CAMP_OPS_MOBILE_QA_VISUAL_STATE_MATRIX,
} = require('./mobileQaVisualStates');

const CAMP_OPS_ANDROID_QA_COMMANDS = {
  installOrRun: 'npm run android',
  startMetro: 'npm run start',
  listDevices: 'adb devices -l',
  openNavigate: 'adb shell am start -a android.intent.action.VIEW -d exp://127.0.0.1:8081/--/navigate',
};

const CAMP_OPS_MOBILE_QA_TEST_DATA = {
  noApiKeysRequired: true,
  featureFlagName: 'campopsRecommendationsEnabled',
  deterministicFixtures: [
    'fixtures/campops/evaluationFixtures.js',
    'fixtures/campops/providerFixtures.js',
  ],
  nodeChecks: [
    'node ./scripts/test-campops-search-integration.js',
    'node ./scripts/test-campops-ui-cards.js',
    'node ./scripts/test-campops-safe-endpoint.js',
    'node ./scripts/test-campops-ai-assist.js',
    'node ./scripts/test-campops-debrief.js',
    'node ./scripts/test-campops-provider-fixtures.js',
  ],
  visualStateMatrix: 'fixtures/campops/mobileQaVisualStates.js',
  devEntryPoint: CAMP_OPS_MOBILE_QA_DEV_ENTRY_POINT,
  viewports: CAMP_OPS_MOBILE_QA_VIEWPORTS,
};

const campOpsMobileQaScenarios = [
  {
    id: 'feature_flag_off_legacy_results',
    title: 'Feature flag off: legacy campsite results remain unchanged',
    setup: [
      'Set campopsRecommendationsEnabled=false through the existing rollout/config path.',
      'Open Navigate and run an existing campsite search or route/polygon camp analysis.',
    ],
    expected: [
      'Existing campsite candidate list is visible.',
      'Recommended Camp, Backup Camp, and Emergency Camp cards are not rendered.',
      'No CampOps source transparency section is visible.',
    ],
    fixtureRefs: ['scripts/test-campops-search-integration.js'],
  },
  {
    id: 'feature_flag_on_cards',
    title: 'Feature flag on: CampOps cards display above legacy results',
    setup: [
      'Set campopsRecommendationsEnabled=true.',
      'Use a fixture-backed route or existing local camp search that returns CampOps data.',
    ],
    expected: [
      'Recommended Camp card is visible.',
      'Backup Camp card is visible when a viable backup exists.',
      'Emergency Camp card is visible when an emergency endpoint exists.',
      'Legacy campsite result list remains visible below or alongside cards.',
    ],
    fixtureRefs: ['scripts/test-campops-ui-cards.js', 'fixtures/campops/evaluationFixtures.js:on_time_normal_day'],
  },
  {
    id: 'recommended_backup_emergency_cards',
    title: 'Recommended, backup, and emergency endpoint card content',
    setup: [
      'Enable CampOps recommendations.',
      'Use a scenario with at least three viable candidates.',
    ],
    expected: [
      'Cards use conservative labels: Recommended, Backup, Emergency stop, Fallback only, Not recommended, or Unknown confidence.',
      'Cards show available score, legal confidence, ETA, sunset margin, fuel/water margin, late-arrival risk, trailer suitability, group fit, and data confidence.',
      'Why this recommendation? expands to top reasons, warnings, source data, and resource debt.',
    ],
    fixtureRefs: ['scripts/test-campops-recommendations.js', 'scripts/test-campops-ui-cards.js'],
  },
  {
    id: 'stale_source_warning',
    title: 'Stale source warning display',
    setup: [
      'Enable CampOps recommendations.',
      'Use the offline stale fixture scenario or stale provider fixture.',
    ],
    expected: [
      'Card or expandable source section says Source data is stale.',
      'Confidence is reduced and not presented as high certainty.',
      'AI explanation keeps stale-data warning visible.',
    ],
    fixtureRefs: [
      'fixtures/campops/evaluationFixtures.js:offline_stale_data',
      'fixtures/campops/providerFixtures.js:provider_stale_offline_source',
    ],
  },
  {
    id: 'two_hour_delay_endpoint',
    title: 'Two-hour delay endpoint recommendation',
    setup: [
      'Enable CampOps recommendations.',
      'Run Find Safe End Point with a two-hour delay.',
    ],
    expected: [
      'Original planned camp is downgraded when ETA moves after sunset with high late-arrival risk.',
      'A closer accessible endpoint is recommended where fixture data supports it.',
      'Decision summary includes downgrade reason, key risks, and next action.',
    ],
    fixtureRefs: ['scripts/test-campops-safe-endpoint.js', 'fixtures/campops/evaluationFixtures.js:two_hour_delay'],
  },
  {
    id: 'trailer_convoy',
    title: 'Trailer convoy recommendation',
    setup: [
      'Enable CampOps recommendations.',
      'Use a convoy profile with trailer present.',
    ],
    expected: [
      'Known no-turnaround or trailer-incompatible camp is rejected or downgraded.',
      'Trailer-suitable camp is recommended when available.',
      'AI and UI explain trailer/turnaround limits without inventing road width data.',
    ],
    fixtureRefs: ['fixtures/campops/evaluationFixtures.js:trailer_convoy', 'scripts/test-campops-convoy-awareness.js'],
  },
  {
    id: 'low_fuel',
    title: 'Low fuel recommendation',
    setup: [
      'Enable CampOps recommendations.',
      'Use low fuel/resource fixture data.',
    ],
    expected: [
      'Remote scenic camp is downgraded when fuel exit margin is tight or critical.',
      'Resupply-friendly camp is recommended or assigned resupply role.',
      'Fuel margin wording uses comfortable/tight/critical/unknown style language.',
    ],
    fixtureRefs: ['fixtures/campops/evaluationFixtures.js:low_fuel_margin', 'fixtures/campops/providerFixtures.js:provider_low_fuel'],
  },
  {
    id: 'ai_stale_data',
    title: 'AI explanation with stale data',
    setup: [
      'Enable CampOps recommendations and AI assist.',
      'Use stale legal/weather/source fixture data.',
    ],
    expected: [
      'AI mentions stale source data clearly.',
      'AI does not call stale closure, fire, or weather current.',
      'AI does not override hard-gate rejected camps.',
    ],
    fixtureRefs: ['scripts/test-campops-ai-assist.js', 'fixtures/campops/providerFixtures.js:staleOfflineCases'],
  },
  {
    id: 'debrief_privacy_defaults',
    title: 'Debrief privacy defaults',
    setup: [
      'Open or trigger CampOps debrief capture after marking a camp visited.',
      'Do not opt into community publishing.',
    ],
    expected: [
      'Visibility defaults to private.',
      'Community publishing requires explicit consent.',
      'User id, vehicle id, raw photo refs, and precise location are not present in public-safe output.',
    ],
    fixtureRefs: ['scripts/test-campops-debrief.js'],
  },
  {
    id: 'offline_cached_warning',
    title: 'Offline/cached source warning',
    setup: [
      'Enable CampOps recommendations.',
      'Switch the app/device to offline mode after cached source data exists, or use the stale/offline fixture path.',
    ],
    expected: [
      'CampOps remains usable with cached/unknown source data.',
      'UI shows stale, cached, missing, or unavailable source warnings.',
      'AI summary preserves stale/missing warning language.',
    ],
    fixtureRefs: [
      'scripts/test-campops-offline-stale-sources.js',
      'fixtures/campops/evaluationFixtures.js:offline_stale_data',
    ],
  },
];

module.exports = {
  CAMP_OPS_ANDROID_QA_COMMANDS,
  CAMP_OPS_MOBILE_QA_TEST_DATA,
  CAMP_OPS_MOBILE_QA_DEV_ENTRY_POINT,
  CAMP_OPS_MOBILE_QA_VIEWPORTS,
  CAMP_OPS_MOBILE_QA_VISUAL_STATE_MATRIX,
  campOpsMobileQaScenarios,
};
