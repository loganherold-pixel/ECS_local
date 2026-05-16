const CAMP_OPS_MOBILE_QA_DEV_ENTRY_POINT = {
  kind: 'dev_only_route',
  route: '/dev/campops-visual-qa',
  file: 'app/dev/campops-visual-qa.tsx',
  component: 'components/campops/CampOpsVisualQaScreen.tsx',
  requiresLiveProviders: false,
  requiresAiOutput: false,
  notes: [
    'Use the dev-only route to stage manual visual QA states without real users, real routes, live providers, telemetry, community publishing, or AI output.',
    'The route redirects away outside development builds and must remain hidden from production navigation.',
  ],
};

const CAMP_OPS_MOBILE_QA_VIEWPORTS = [
  {
    id: 'android_small_portrait',
    label: 'Small Android portrait',
    size: '360x640',
    checks: ['No field labels overlap.', 'Action buttons stay tappable.', 'Long warnings wrap inside cards.'],
  },
  {
    id: 'android_large_portrait',
    label: 'Large Android portrait',
    size: '412x915',
    checks: ['Three role cards remain scannable.', 'Expanded reasoning does not hide action buttons.'],
  },
  {
    id: 'android_landscape',
    label: 'Android landscape',
    size: '640x360 or device equivalent',
    checks: ['Panel remains reachable.', 'Card content scrolls instead of clipping.', 'No modal/header overlap.'],
  },
];

const CAMP_OPS_MOBILE_QA_VISUAL_STATE_MATRIX = [
  {
    id: 'feature_flag_off',
    title: 'Feature flag off',
    fixtureRefs: ['scripts/test-campops-search-integration.js'],
    setup: ['campopsRecommendationsEnabled=false', 'Run legacy camp search result fixture.'],
    expected: ['Legacy camp result list only.', 'No CampOps cards.', 'No source transparency section.'],
  },
  {
    id: 'feature_flag_on',
    title: 'Feature flag on',
    fixtureRefs: ['fixtures/campops/evaluationFixtures.js:on_time_normal_day', 'scripts/test-campops-ui-cards.js'],
    setup: ['campopsRecommendationsEnabled=true', 'Use on-time normal day fixture.'],
    expected: ['CampOps role cards render above legacy results.', 'Cards do not require AI output.'],
  },
  {
    id: 'recommended_endpoint',
    title: 'Recommended endpoint',
    fixtureRefs: ['fixtures/campops/evaluationFixtures.js:on_time_normal_day'],
    setup: ['Use planned camp retained as recommended.'],
    expected: ['Recommended Camp card has endpoint name, score, ETA, and top reasons.'],
  },
  {
    id: 'backup_endpoint',
    title: 'Backup endpoint',
    fixtureRefs: ['scripts/test-campops-recommendations.js'],
    setup: ['Use multi-candidate recommendation fixture.'],
    expected: ['Backup Camp card is present when a distinct viable alternate exists.'],
  },
  {
    id: 'emergency_fallback',
    title: 'Emergency fallback',
    fixtureRefs: ['fixtures/campops/evaluationFixtures.js:emergency_stop'],
    setup: ['Use emergency stop fixture.'],
    expected: ['Emergency Camp card uses Emergency stop/Fallback only language.', 'Comfort limitations do not hide access/legal fields.'],
  },
  {
    id: 'planned_camp_downgraded',
    title: 'Planned camp downgraded',
    fixtureRefs: ['fixtures/campops/evaluationFixtures.js:two_hour_delay', 'scripts/test-campops-two-hour-delay-acceptance.js'],
    setup: ['Apply two-hour delay fixture.'],
    expected: ['Downgrade reason is visible in reasons or expanded Why section.', 'Avoid unqualified safe copy.'],
  },
  {
    id: 'stale_source_warning',
    title: 'Stale source warning',
    fixtureRefs: ['fixtures/campops/evaluationFixtures.js:offline_stale_data', 'fixtures/campops/providerFixtures.js:provider_stale_offline_source'],
    setup: ['Use stale/offline source fixture.'],
    expected: ['Source data is stale warning is visible without expanding AI summary.'],
  },
  {
    id: 'source_conflict_warning',
    title: 'Source conflict warning',
    fixtureRefs: ['fixtures/campops/evaluationFixtures.js:conflicting_legal_access_source', 'scripts/test-campops-source-conflict-resolution.js'],
    setup: ['Use conflicting legal/access fixture.'],
    expected: ['Source conflict warning appears in top warnings or Why details.', 'Resolved confidence remains conservative.'],
  },
  {
    id: 'legal_confidence_unknown',
    title: 'Legal confidence unknown',
    fixtureRefs: ['fixtures/campops/evaluationFixtures.js:legal_uncertainty'],
    setup: ['Use legal uncertainty fixture.'],
    expected: ['Legal field says Unknown confidence.', 'Card does not imply legal access is confirmed.'],
  },
  {
    id: 'closure_status_unknown',
    title: 'Closure status unknown',
    fixtureRefs: ['scripts/test-campops-closure-provider.js', 'fixtures/campops/providerFixtures.js:provider_legal_uncertainty'],
    setup: ['Use candidate with missing closure source.'],
    expected: ['Closure status unknown is visible in source transparency.'],
  },
  {
    id: 'fire_restriction_unknown',
    title: 'Fire restriction unknown',
    fixtureRefs: ['scripts/test-campops-fire-restriction-provider.js'],
    setup: ['Use candidate without fire source signal.'],
    expected: ['Fire restrictions unknown is visible.', 'Campfire permission is not invented.'],
  },
  {
    id: 'weather_stale',
    title: 'Weather stale',
    fixtureRefs: ['fixtures/campops/providerFixtures.js:provider_stale_offline_source', 'scripts/test-campops-weather-provider.js'],
    setup: ['Use stale weather provider fixture.'],
    expected: ['Weather freshness shows stale/unknown, not current.'],
  },
  {
    id: 'low_fuel',
    title: 'Low fuel',
    fixtureRefs: ['fixtures/campops/evaluationFixtures.js:low_fuel_margin', 'fixtures/campops/providerFixtures.js:provider_low_fuel'],
    setup: ['Use low fuel margin fixture.'],
    expected: ['Fuel field uses comfortable/tight/critical/unknown style wording.', 'Resource warning remains visible on small screens.'],
  },
  {
    id: 'low_water',
    title: 'Low water',
    fixtureRefs: ['fixtures/campops/evaluationFixtures.js:low_water_margin'],
    setup: ['Use low water fixture with people/pet context.'],
    expected: ['Water field and warnings show water concern without promising refill availability.'],
  },
  {
    id: 'trailer_caution',
    title: 'Trailer caution',
    fixtureRefs: ['fixtures/campops/evaluationFixtures.js:trailer_convoy'],
    setup: ['Use trailer convoy fixture.'],
    expected: ['Trailer field and warnings are visible.', 'Known no-turnaround camp is downgraded or rejected.'],
  },
  {
    id: 'large_group_caution',
    title: 'Large group caution',
    fixtureRefs: ['fixtures/campops/evaluationFixtures.js:large_group'],
    setup: ['Use large group fixture.'],
    expected: ['Group fit field shows downgrade/caution when capacity is too small.'],
  },
  {
    id: 'offline_cached_data',
    title: 'Offline cached data',
    fixtureRefs: ['scripts/test-campops-offline-stale-sources.js', 'fixtures/campops/evaluationFixtures.js:offline_stale_data'],
    setup: ['Set offline/degraded context with cached source data.'],
    expected: ['Cached/stale warning is visible in field mode.', 'Recommendation confidence is reduced.'],
  },
  {
    id: 'offline_no_cached_data',
    title: 'Offline no cached data',
    fixtureRefs: ['scripts/test-campops-offline-stale-sources.js'],
    setup: ['Set offline/degraded context without cached provider signals.'],
    expected: ['Missing/unavailable source warnings are visible.', 'Unknown fields remain Unknown.'],
  },
  {
    id: 'ai_summary_expanded_collapsed',
    title: 'AI summary expanded/collapsed',
    fixtureRefs: ['scripts/test-campops-ai-assist.js'],
    setup: ['Use AI assist fixture output after deterministic recommendation exists.'],
    expected: ['Collapsed state does not hide deterministic card facts.', 'Expanded AI summary preserves stale/missing warnings.'],
  },
  {
    id: 'why_expanded_collapsed',
    title: 'Why this recommendation expanded/collapsed',
    fixtureRefs: ['scripts/test-campops-ui-cards.js'],
    setup: ['Toggle Why this recommendation on each card role.'],
    expected: ['Collapsed card shows top three reasons/warnings.', 'Expanded section shows source summaries, resource debt, and decision point when available.'],
  },
  {
    id: 'long_camp_names',
    title: 'Long camp names',
    fixtureRefs: ['fixtures/campops/mobileQaVisualStates.js', 'scripts/test-campops-ui-cards.js'],
    setup: ['Use a recommendation set with a long endpoint name on the recommended, backup, and emergency cards.'],
    expected: ['Endpoint names wrap without covering role labels, confidence chips, field rows, or action buttons.'],
  },
  {
    id: 'long_warning_lists',
    title: 'Long warning lists',
    fixtureRefs: ['fixtures/campops/mobileQaVisualStates.js', 'scripts/test-campops-ui-cards.js'],
    setup: ['Use a recommendation set with more than three warnings plus stale, conflict, resource, and missing-data warnings.'],
    expected: ['Cards show top warnings concisely.', 'Expanded details scroll or wrap without overlapping action buttons.'],
  },
  {
    id: 'cramped_small_screen',
    title: 'Cramped small screen',
    fixtureRefs: ['fixtures/campops/mobileQaVisualStates.js'],
    setup: ['Run the visual matrix on the android_small_portrait viewport or a physical device with equivalent cramped width.'],
    expected: ['Cards remain readable at 360x640-equivalent size.', 'Why and AI expanders remain reachable.', 'Fields do not overlap or force horizontal scrolling.'],
  },
  {
    id: 'long_text_stress',
    title: 'Long camp names and warning lists',
    fixtureRefs: ['fixtures/campops/mobileQaVisualStates.js'],
    setup: ['Use a long camp name and multiple warning strings from this visual matrix.'],
    expected: ['Names and warnings wrap without overlapping badges or action buttons.'],
  },
];

function getCampOpsMobileQaVisualStateMatrix() {
  return CAMP_OPS_MOBILE_QA_VISUAL_STATE_MATRIX.map((state) => ({ ...state }));
}

module.exports = {
  CAMP_OPS_MOBILE_QA_DEV_ENTRY_POINT,
  CAMP_OPS_MOBILE_QA_VIEWPORTS,
  CAMP_OPS_MOBILE_QA_VISUAL_STATE_MATRIX,
  getCampOpsMobileQaVisualStateMatrix,
};
