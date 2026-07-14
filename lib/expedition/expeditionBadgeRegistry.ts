import type {
  ExpeditionBadgeDefinition,
  ExpeditionBadgeEvaluationConfig,
  ExpeditionBadgeEvaluationType,
} from './expeditionTripRecordTypes';

const BADGE_CREATED_AT = '2026-05-29T00:00:00.000Z';

type BadgeSeed = Omit<ExpeditionBadgeDefinition, 'createdAt'>;

function badge(definition: BadgeSeed): ExpeditionBadgeDefinition {
  return {
    ...definition,
    createdAt: BADGE_CREATED_AT,
  };
}

function makeBadge(
  id: string,
  title: string,
  description: string,
  category: ExpeditionBadgeDefinition['category'],
  rarity: ExpeditionBadgeDefinition['rarity'],
  iconKey: string,
  evaluationType: ExpeditionBadgeEvaluationType,
  evaluationConfig: ExpeditionBadgeEvaluationConfig = {},
  options: {
    hidden?: boolean;
    repeatable?: boolean;
    progressTarget?: number | null;
  } = {},
): ExpeditionBadgeDefinition {
  return badge({
    id,
    title,
    description,
    category,
    rarity: options.hidden ? 'hidden' : rarity,
    iconKey,
    isHidden: options.hidden ?? false,
    isRepeatable: options.repeatable ?? false,
    progressTarget: options.progressTarget ?? evaluationConfig.threshold ?? null,
    evaluationType,
    evaluationConfig,
  });
}

const FIRST_BADGES: ExpeditionBadgeDefinition[] = [
  makeBadge('first-expedition', 'First Expedition', 'Completed your first recorded expedition.', 'firsts', 'common', 'flag', 'trip_count', { threshold: 1 }),
  makeBadge('first-10-miles', 'First 10 Miles', 'Completed your first 10-mile expedition.', 'firsts', 'common', 'route', 'single_trip_distance', { threshold: 10 }),
  makeBadge('first-50-miles', 'First 50 Miles', 'Completed your first 50-mile expedition.', 'firsts', 'uncommon', 'route', 'single_trip_distance', { threshold: 50 }),
  makeBadge('first-100-miles', 'First 100 Miles', 'Completed your first 100-mile expedition.', 'firsts', 'rare', 'route', 'single_trip_distance', { threshold: 100 }),
  makeBadge('first-mountain-route', 'First Mountain Route', 'Completed your first route with mountain context.', 'firsts', 'uncommon', 'mountain', 'context_terms', { terms: ['mountain', 'pass', 'ridge', 'summit', 'alpine'] }),
  makeBadge('first-desert-route', 'First Desert Route', 'Completed your first route with desert context.', 'firsts', 'uncommon', 'sun', 'context_terms', { terms: ['desert', 'arid', 'high heat', 'sand'] }),
  makeBadge('first-forest-route', 'First Forest Route', 'Completed your first route with forest context.', 'firsts', 'uncommon', 'forest', 'context_terms', { terms: ['forest', 'woods', 'timber', 'tree line'] }),
  makeBadge('first-night-finish', 'First Night Finish', 'Completed your first expedition after dark.', 'firsts', 'uncommon', 'moon', 'time_window', { timeField: 'completedAt', hourStart: 21, hourEnd: 4 }),
  makeBadge('first-weather-event', 'First Weather Event', 'Completed your first expedition with recorded weather changes.', 'firsts', 'uncommon', 'weather', 'weather_terms', { terms: ['rain', 'storm', 'snow', 'wind', 'heat', 'cold', 'weather'] }),
  makeBadge('first-route-deviation', 'First Route Deviation', 'Completed your first expedition with a recorded route deviation.', 'firsts', 'common', 'reroute', 'route_event_count', { threshold: 1 }),
];

const IDENTITY_MVP_BADGES: ExpeditionBadgeDefinition[] = [
  makeBadge('profile-ready', 'Profile Ready', 'Completed a saved Fleet profile for ECS planning context.', 'firsts', 'common', 'vehicle', 'safe_signal', { signalId: 'vehicle_profile_completed' }),
  makeBadge('confidence-checked', 'Confidence Checked', 'Generated a deterministic Trip Confidence summary.', 'exploration', 'common', 'checkmark', 'safe_signal', { signalId: 'trip_confidence_summary_generated' }),
  makeBadge('trip-activated', 'Trip Activated', 'Started Active Trip Mode from a local itinerary snapshot.', 'firsts', 'common', 'route', 'safe_signal', { signalId: 'active_trip_activated' }),
  makeBadge('resume-ready', 'Resume Ready', 'Recovered an Active Trip snapshot after restart.', 'consistency', 'common', 'compass', 'safe_signal', { signalId: 'active_trip_resumed_after_restart' }),
  makeBadge('local-packet-ready', 'Local Packet Ready', 'Created a local-only Offline Incident Packet.', 'recovery', 'common', 'document', 'safe_signal', { signalId: 'offline_incident_packet_created' }),
  makeBadge('packet-reviewed', 'Packet Reviewed', 'Opened a local-only Offline Incident Packet for review.', 'recovery', 'common', 'document', 'safe_signal', { signalId: 'local_only_packet_viewed' }),
  makeBadge('terrain-aware', 'Terrain Aware', 'Reviewed deterministic Terrain Risk output.', 'terrain', 'common', 'terrain', 'safe_signal', { signalId: 'terrain_risk_evaluated' }),
  makeBadge('basecamp-reviewed', 'Basecamp Reviewed', 'Reviewed deterministic Camp Viability output without legal or safety claims.', 'exploration', 'common', 'camp', 'safe_signal', { signalId: 'camp_viability_evaluated' }),
  makeBadge('clean-stop', 'Clean Stop', 'Stopped Active Trip Mode without deleting saved trip, Fleet, packet, or catalog data.', 'route_behavior', 'common', 'checkmark', 'safe_signal', { signalId: 'clean_trip_stopped_or_completed' }),
  makeBadge('route-authority-recognized', 'Route Authority Recognized', 'Reviewed visible source-backed route authority metadata.', 'route_behavior', 'common', 'map', 'safe_signal', { signalId: 'route_authority_recognized' }),
  makeBadge('honest-unknown', 'Honest Unknown', 'Handled unavailable or unknown field data without treating it as safe or live.', 'exploration', 'common', 'caution', 'safe_signal', { signalId: 'unavailable_state_handled' }),
];

const DISTANCE_BADGES: ExpeditionBadgeDefinition[] = [
  makeBadge('miles-50', '50 Miles Explored', 'Logged 50 completed expedition miles.', 'distance', 'common', 'route', 'lifetime_distance', { threshold: 50 }),
  makeBadge('miles-100', '100 Miles Explored', 'Logged 100 completed expedition miles.', 'distance', 'uncommon', 'route', 'lifetime_distance', { threshold: 100 }),
  makeBadge('miles-250', '250 Miles Explored', 'Logged 250 completed expedition miles.', 'distance', 'rare', 'route', 'lifetime_distance', { threshold: 250 }),
  makeBadge('miles-500', '500 Miles Explored', 'Logged 500 completed expedition miles.', 'distance', 'epic', 'route', 'lifetime_distance', { threshold: 500 }),
  makeBadge('miles-1000', '1,000 Miles Explored', 'Logged 1,000 completed expedition miles.', 'distance', 'legendary', 'route', 'lifetime_distance', { threshold: 1000 }),
  makeBadge('miles-2500', '2,500 Miles Explored', 'Logged 2,500 completed expedition miles.', 'distance', 'legendary', 'route', 'lifetime_distance', { threshold: 2500 }),
  makeBadge('miles-5000', '5,000 Miles Explored', 'Logged 5,000 completed expedition miles.', 'distance', 'legendary', 'route', 'lifetime_distance', { threshold: 5000 }),
  makeBadge('ten-mile-day', '10-Mile Day', 'Completed a single expedition of at least 10 miles.', 'distance', 'common', 'odometer', 'single_trip_distance', { threshold: 10 }),
  makeBadge('fifty-mile-day', '50-Mile Day', 'Completed a single expedition of at least 50 miles.', 'distance', 'uncommon', 'odometer', 'single_trip_distance', { threshold: 50 }),
  makeBadge('hundred-mile-day', '100-Mile Day', 'Completed a single expedition of at least 100 miles.', 'distance', 'rare', 'odometer', 'single_trip_distance', { threshold: 100 }),
  makeBadge('long-haul', 'Long Haul', 'Completed a single expedition of 100 miles or more.', 'distance', 'uncommon', 'odometer', 'single_trip_distance', { threshold: 100 }),
  makeBadge('endurance-run', 'Endurance Run', 'Completed a single expedition of 250 miles or more.', 'distance', 'epic', 'odometer', 'single_trip_distance', { threshold: 250 }),
];

const ELEVATION_BADGES: ExpeditionBadgeDefinition[] = [
  makeBadge('elevation-1000', '1,000 ft Reached', 'Reached 1,000 ft on a completed expedition.', 'elevation', 'common', 'peak', 'max_elevation', { threshold: 1000 }),
  makeBadge('elevation-2500', '2,500 ft Reached', 'Reached 2,500 ft on a completed expedition.', 'elevation', 'common', 'peak', 'max_elevation', { threshold: 2500 }),
  makeBadge('elevation-5000', '5,000 ft Reached', 'Reached 5,000 ft on a completed expedition.', 'elevation', 'uncommon', 'peak', 'max_elevation', { threshold: 5000 }),
  makeBadge('elevation-7500', '7,500 ft Reached', 'Reached 7,500 ft on a completed expedition.', 'elevation', 'rare', 'peak', 'max_elevation', { threshold: 7500 }),
  makeBadge('elevation-10000', '10,000 ft Reached', 'Reached 10,000 ft on a completed expedition.', 'elevation', 'epic', 'peak', 'max_elevation', { threshold: 10000 }),
  makeBadge('highest-point-yet', 'Highest Point Yet', 'Reached a new personal high point on a completed expedition.', 'personal_records', 'uncommon', 'peak', 'personal_record', { recordMetric: 'elevation' }, { repeatable: true, progressTarget: null }),
  makeBadge('mountain-pass', 'Mountain Pass', 'Completed an expedition above 8,000 ft or with major elevation gain.', 'elevation', 'rare', 'mountain', 'hidden_combo', { metric: 'max_elevation', threshold: 8000, terms: ['mountain', 'pass', 'ridge'], requireAll: false }),
  makeBadge('ridge-runner', 'Ridge Runner', 'Completed an expedition with ridge or ridgeline context.', 'elevation', 'uncommon', 'mountain', 'context_terms', { terms: ['ridge', 'ridgeline'] }),
  makeBadge('elevation-hunter', 'Elevation Hunter', 'Logged at least 2,500 ft of elevation gain on one expedition.', 'elevation', 'rare', 'climb', 'elevation_gain', { threshold: 2500 }),
  makeBadge('big-climb', 'Big Climb', 'Logged at least 1,000 ft of elevation gain on one expedition.', 'elevation', 'uncommon', 'climb', 'elevation_gain', { threshold: 1000 }),
  makeBadge('above-the-clouds', 'Above the Clouds', 'Reached 9,000 ft on a completed expedition.', 'elevation', 'epic', 'cloud', 'max_elevation', { threshold: 9000 }),
  makeBadge('summit-line', 'Summit Line', 'Reached 12,000 ft on a completed expedition.', 'elevation', 'legendary', 'mountain', 'max_elevation', { threshold: 12000 }),
];

const DURATION_BADGES: ExpeditionBadgeDefinition[] = [
  makeBadge('duration-1-hour', '1 Hour Logged', 'Logged one completed expedition hour.', 'duration', 'common', 'time', 'lifetime_duration', { threshold: 1 }),
  makeBadge('duration-5-hours', '5 Hours Logged', 'Logged five completed expedition hours.', 'duration', 'common', 'time', 'lifetime_duration', { threshold: 5 }),
  makeBadge('duration-10-hours', '10 Hours Logged', 'Logged ten completed expedition hours.', 'duration', 'uncommon', 'time', 'lifetime_duration', { threshold: 10 }),
  makeBadge('duration-25-hours', '25 Hours Logged', 'Logged 25 completed expedition hours.', 'duration', 'rare', 'time', 'lifetime_duration', { threshold: 25 }),
  makeBadge('duration-50-hours', '50 Hours Logged', 'Logged 50 completed expedition hours.', 'duration', 'epic', 'time', 'lifetime_duration', { threshold: 50 }),
  makeBadge('duration-100-hours', '100 Hours Logged', 'Logged 100 completed expedition hours.', 'duration', 'legendary', 'time', 'lifetime_duration', { threshold: 100 }),
  makeBadge('early-start', 'Early Start', 'Started an expedition before 6 AM.', 'time_of_day', 'common', 'sunrise', 'time_window', { timeField: 'startedAt', hourStart: 0, hourEnd: 5 }),
  makeBadge('dawn-patrol', 'Dawn Patrol', 'Started an expedition before sunrise.', 'time_of_day', 'common', 'sunrise', 'time_window', { timeField: 'startedAt', hourStart: 4, hourEnd: 6 }),
  makeBadge('sunset-finish', 'Sunset Finish', 'Completed an expedition during evening hours.', 'time_of_day', 'common', 'sunset', 'time_window', { timeField: 'completedAt', hourStart: 17, hourEnd: 20 }),
  makeBadge('night-return', 'Night Return', 'Completed an expedition during night operating hours.', 'time_of_day', 'uncommon', 'moon', 'time_window', { timeField: 'completedAt', hourStart: 21, hourEnd: 4 }),
  makeBadge('full-day-expedition', 'Full Day Expedition', 'Completed a single expedition lasting 12 hours or more.', 'duration', 'rare', 'time', 'single_trip_duration', { threshold: 12 }),
];

const WEATHER_BADGES: ExpeditionBadgeDefinition[] = [
  makeBadge('weathered-it', 'Weathered It', 'Completed an expedition with multiple weather conditions recorded.', 'weather', 'uncommon', 'weather', 'weather_terms', { threshold: 2 }),
  makeBadge('storm-runner', 'Storm Runner', 'Completed an expedition with storm, thunder, or lightning conditions.', 'weather', 'rare', 'storm', 'weather_terms', { terms: ['storm', 'thunder', 'lightning', 'heavy rain'] }),
  makeBadge('rain-route', 'Rain Route', 'Completed an expedition with rain recorded.', 'weather', 'common', 'rain', 'weather_terms', { terms: ['rain', 'showers'] }),
  makeBadge('snow-trace', 'Snow Trace', 'Completed an expedition with snow recorded.', 'weather', 'rare', 'snow', 'weather_terms', { terms: ['snow', 'sleet', 'ice'] }),
  makeBadge('heat-line', 'Heat Line', 'Completed an expedition with high-heat conditions.', 'weather', 'uncommon', 'sun', 'weather_terms', { terms: ['heat', 'hot', 'high heat'], threshold: 95 }),
  makeBadge('cold-start', 'Cold Start', 'Completed an expedition with cold conditions recorded.', 'weather', 'uncommon', 'snow', 'weather_terms', { terms: ['cold', 'freeze', 'freezing', 'ice'], threshold: 32 }),
  makeBadge('wind-tested', 'Wind Tested', 'Completed an expedition with wind conditions recorded.', 'weather', 'common', 'wind', 'weather_terms', { terms: ['wind', 'gust'] }),
  makeBadge('temperature-swing', 'Temperature Swing', 'Completed an expedition with a large recorded temperature change.', 'weather', 'rare', 'temperature', 'weather_terms', { threshold: 25 }),
  makeBadge('changing-skies', 'Changing Skies', 'Completed an expedition with changing sky or cloud conditions.', 'weather', 'common', 'cloud', 'weather_terms', { terms: ['cloud', 'overcast', 'clearing', 'changing'] }),
  makeBadge('weather-shift', 'Weather Shift', 'Recorded a weather-change notable moment.', 'weather', 'uncommon', 'weather', 'notable_moment_type', { momentTypes: ['weather_change'] }),
];

const TERRAIN_BADGES: ExpeditionBadgeDefinition[] = [
  makeBadge('gravel-proven', 'Gravel Proven', 'Completed an expedition with gravel terrain context.', 'terrain', 'common', 'terrain', 'terrain_terms', { terms: ['gravel'] }),
  makeBadge('sand-track', 'Sand Track', 'Completed an expedition with sand terrain context.', 'terrain', 'uncommon', 'terrain', 'terrain_terms', { terms: ['sand', 'dune'] }),
  makeBadge('mud-season', 'Mud Season', 'Completed an expedition with mud terrain context.', 'terrain', 'uncommon', 'terrain', 'terrain_terms', { terms: ['mud', 'muddy'] }),
  makeBadge('rocky-passage', 'Rocky Passage', 'Completed an expedition with rocky terrain context.', 'terrain', 'uncommon', 'terrain', 'terrain_terms', { terms: ['rock', 'rocky', 'boulder'] }),
  makeBadge('steep-grade', 'Steep Grade', 'Recorded steep grade or major elevation gain.', 'terrain', 'rare', 'climb', 'hidden_combo', { terms: ['steep', 'grade'], threshold: 1500 }),
  makeBadge('technical-terrain', 'Technical Terrain', 'Completed an expedition with technical terrain context.', 'terrain', 'rare', 'terrain', 'terrain_terms', { terms: ['technical', 'obstacle', 'crawl'] }),
  makeBadge('desert-crossing', 'Desert Crossing', 'Completed an expedition with desert context or high-temperature conditions.', 'terrain', 'rare', 'sun', 'terrain_terms', { terms: ['desert', 'arid', 'high heat', 'sand'], threshold: 95 }),
  makeBadge('forest-corridor', 'Forest Corridor', 'Completed an expedition with forest context.', 'terrain', 'common', 'forest', 'terrain_terms', { terms: ['forest', 'woods', 'timber'] }),
  makeBadge('canyon-line', 'Canyon Line', 'Completed an expedition with canyon context.', 'terrain', 'uncommon', 'terrain', 'terrain_terms', { terms: ['canyon', 'wash'] }),
  makeBadge('backcountry-grade', 'Backcountry Grade', 'Completed an expedition with backcountry terrain context.', 'terrain', 'rare', 'satellite', 'terrain_terms', { terms: ['backcountry', 'remote grade'] }),
  makeBadge('washboard-veteran', 'Washboard Veteran', 'Completed an expedition with washboard terrain context.', 'terrain', 'uncommon', 'terrain', 'terrain_terms', { terms: ['washboard'] }),
  makeBadge('trail-tested', 'Trail Tested', 'Completed an expedition with trail terrain context.', 'terrain', 'common', 'route', 'terrain_terms', { terms: ['trail', 'track'] }),
  makeBadge('terrain-watch', 'Terrain Watch', 'Completed an expedition with terrain risk events recorded.', 'terrain', 'uncommon', 'terrain', 'terrain_risk_count', { threshold: 1 }),
];

const RECOVERY_BADGES: ExpeditionBadgeDefinition[] = [
  makeBadge('recovery-ready', 'Recovery Ready', 'Used recovery tools during a completed expedition.', 'recovery', 'uncommon', 'recovery', 'recovery_usage', { threshold: 1 }),
  makeBadge('recovery-panel-opened', 'Recovery Panel Opened', 'Opened the recovery panel during a completed expedition.', 'recovery', 'common', 'recovery', 'recovery_usage', { threshold: 1 }),
  makeBadge('recovery-plan-generated', 'Recovery Plan Generated', 'Recorded recovery planning context during a completed expedition.', 'recovery', 'rare', 'recovery', 'context_terms', { terms: ['recovery plan', 'winch plan', 'traction plan'] }),
  makeBadge('assisted-recovery', 'Assisted Recovery', 'Completed an expedition with assisted recovery context.', 'recovery', 'rare', 'recovery', 'context_terms', { terms: ['assisted recovery', 'spotter', 'convoy recovery'] }),
  makeBadge('self-recovery', 'Self Recovery', 'Completed an expedition with self-recovery context.', 'recovery', 'rare', 'recovery', 'context_terms', { terms: ['self recovery', 'self-recovery'] }),
  makeBadge('stuck-but-sorted', 'Stuck But Sorted', 'Completed an expedition with stuck-and-recovered context.', 'recovery', 'epic', 'recovery', 'context_terms', { terms: ['stuck', 'unstuck', 'recovered'] }),
  makeBadge('field-problem-solver', 'Field Problem Solver', 'Completed an expedition with recovery usage and route adjustment.', 'recovery', 'rare', 'recovery', 'hidden_combo', { metric: 'recovery_usage', threshold: 1, terms: ['recovery'] }),
  makeBadge('recovery-veteran', 'Recovery Veteran', 'Logged recovery tool usage across multiple completed expeditions.', 'recovery', 'epic', 'recovery', 'recovery_usage', { threshold: 3 }),
];

const ROUTE_BEHAVIOR_BADGES: ExpeditionBadgeDefinition[] = [
  makeBadge('route-adjusted', 'Route Adjusted', 'Completed an expedition after a recorded route deviation or reroute.', 'route_behavior', 'common', 'reroute', 'route_event_count', { threshold: 1 }),
  makeBadge('detour-logged', 'Detour Logged', 'Recorded detour context during a completed expedition.', 'route_behavior', 'common', 'reroute', 'context_terms', { terms: ['detour'] }),
  makeBadge('reroute-accepted', 'Reroute Accepted', 'Recorded a reroute accepted moment.', 'route_behavior', 'uncommon', 'reroute', 'notable_moment_type', { momentTypes: ['reroute_accepted'] }),
  makeBadge('stayed-the-course', 'Stayed the Course', 'Completed an expedition without recorded route deviations.', 'route_behavior', 'common', 'checkmark', 'clean_completion', { maxRouteEvents: 0 }),
  makeBadge('clean-run', 'Clean Run', 'Completed an expedition without recorded deviations or recovery usage.', 'route_behavior', 'common', 'checkmark', 'clean_completion', { maxRouteEvents: 0, maxRecoveryUsage: 0 }),
  makeBadge('clean-completion', 'Clean Completion', 'Completed an expedition with a clean route record.', 'route_behavior', 'common', 'checkmark', 'clean_completion', { maxRouteEvents: 0, maxRecoveryUsage: 0 }),
  makeBadge('alternate-line', 'Alternate Line', 'Completed an expedition with alternate-line context.', 'route_behavior', 'uncommon', 'reroute', 'context_terms', { terms: ['alternate line', 'alternate route'] }),
  makeBadge('bailout-point-used', 'Bailout Point Used', 'Used a saved bailout point during a completed expedition.', 'route_behavior', 'rare', 'flag', 'viewed_entity', { entity: 'bailout', threshold: 1 }),
  makeBadge('backtrack-logged', 'Backtrack Logged', 'Completed an expedition with backtrack context.', 'route_behavior', 'uncommon', 'reroute', 'context_terms', { terms: ['backtrack', 'backtracked'] }),
  makeBadge('trail-pivot', 'Trail Pivot', 'Completed an expedition with route deviation and terrain context.', 'route_behavior', 'rare', 'reroute', 'hidden_combo', { metric: 'route_events', terms: ['trail', 'pivot'], threshold: 1 }),
  makeBadge('remote-redirect', 'Remote Redirect', 'Completed a remote expedition with route adjustment context.', 'route_behavior', 'epic', 'satellite', 'hidden_combo', { metric: 'route_events', terms: ['remote', 'reroute', 'detour'], threshold: 1 }),
];

const CONSISTENCY_BADGES: ExpeditionBadgeDefinition[] = [
  makeBadge('weekend-explorer', 'Weekend Explorer', 'Completed an expedition that started on a weekend.', 'consistency', 'common', 'calendar', 'context_terms', { terms: ['weekend'] }),
  makeBadge('three-trips-logged', 'Three Trips Logged', 'Completed three recorded expeditions.', 'expedition_history', 'uncommon', 'patch', 'trip_count', { threshold: 3 }),
  makeBadge('five-trips-logged', 'Five Trips Logged', 'Completed five recorded expeditions.', 'expedition_history', 'rare', 'patch', 'trip_count', { threshold: 5 }),
  makeBadge('ten-trips-logged', 'Ten Trips Logged', 'Completed ten recorded expeditions.', 'expedition_history', 'epic', 'patch', 'trip_count', { threshold: 10 }),
  makeBadge('monthly-explorer', 'Monthly Explorer', 'Completed multiple expeditions in one month.', 'consistency', 'rare', 'calendar', 'trip_count', { threshold: 2 }),
  makeBadge('expedition-habit', 'Expedition Habit', 'Completed three or more expeditions.', 'consistency', 'rare', 'patch', 'trip_count', { threshold: 3 }),
  makeBadge('trail-veteran', 'Trail Veteran', 'Completed five recorded expeditions.', 'expedition_history', 'rare', 'patch', 'trip_count', { threshold: 5 }),
  makeBadge('seasoned-operator', 'Seasoned Operator', 'Completed ten recorded expeditions.', 'expedition_history', 'epic', 'patch', 'trip_count', { threshold: 10 }),
  makeBadge('repeat-explorer', 'Repeat Explorer', 'Completed more than one recorded expedition.', 'consistency', 'common', 'compass', 'trip_count', { threshold: 2 }),
  makeBadge('back-again', 'Back Again', 'Returned for another completed expedition.', 'consistency', 'common', 'compass', 'trip_count', { threshold: 2 }),
];

const EXPLORATION_BADGES: ExpeditionBadgeDefinition[] = [
  makeBadge('new-region', 'New Region', 'Completed an expedition with new-region context.', 'exploration', 'uncommon', 'compass', 'context_terms', { terms: ['new region', 'region'] }),
  makeBadge('new-trailhead', 'New Trailhead', 'Completed an expedition with trailhead context.', 'exploration', 'common', 'flag', 'context_terms', { terms: ['trailhead'] }),
  makeBadge('new-state', 'New State', 'Completed an expedition with state-crossing context.', 'exploration', 'rare', 'map', 'context_terms', { terms: ['new state', 'state line', 'border'] }),
  makeBadge('new-terrain-type', 'New Terrain Type', 'Completed an expedition with a distinct terrain context.', 'exploration', 'uncommon', 'terrain', 'terrain_terms', { terms: ['sand', 'mud', 'rock', 'forest', 'canyon', 'gravel'] }),
  makeBadge('camp-scout', 'Camp Candidate Viewed', 'Viewed camp candidates during a completed expedition.', 'exploration', 'common', 'camp', 'viewed_entity', { entity: 'camp', threshold: 1 }),
  makeBadge('resupply-scout', 'Resupply Stop Viewed', 'Viewed resupply stops during a completed expedition.', 'exploration', 'common', 'resupply', 'viewed_entity', { entity: 'resupply', threshold: 1 }),
  makeBadge('trailhead-ready', 'Trailhead Ready', 'Completed an expedition with trailhead-ready context.', 'exploration', 'common', 'flag', 'context_terms', { terms: ['trailhead ready', 'trailhead'] }),
  makeBadge('remote-start', 'Remote Start', 'Started an expedition with remote context.', 'remoteness', 'rare', 'satellite', 'context_terms', { terms: ['remote start', 'remote'] }),
  makeBadge('borderline-wild', 'Borderline Wild', 'Completed an expedition with border or wildland context.', 'exploration', 'rare', 'map', 'context_terms', { terms: ['border', 'wild', 'wilderness'] }),
  makeBadge('uncharted-habit', 'Uncharted Habit', 'Completed a rare pattern ECS recognizes from expedition history.', 'hidden', 'hidden', 'hidden', 'hidden_combo', { metric: 'trip_count', threshold: 3, terms: ['remote', 'backcountry'] }, { hidden: true }),
  makeBadge('remote-route', 'Remote Route', 'Completed an expedition marked as remote or isolated by saved trip context.', 'remoteness', 'rare', 'satellite', 'context_terms', { terms: ['remote', 'isolated', 'backcountry'] }),
  makeBadge('hybrid-run', 'Hybrid Run', 'Completed an expedition recorded from hybrid guidance.', 'exploration', 'uncommon', 'compass', 'context_terms', { terms: ['hybrid'] }),
];

const NOTABLE_MOMENT_BADGES: ExpeditionBadgeDefinition[] = [
  makeBadge('moment-captured', 'Moment Captured', 'Saved at least one notable expedition moment.', 'notable_moments', 'common', 'sparkles', 'notable_moment_count', { threshold: 1 }),
  makeBadge('five-moments-captured', 'Five Moments Captured', 'Saved five notable expedition moments.', 'notable_moments', 'uncommon', 'sparkles', 'notable_moment_count', { threshold: 5 }),
  makeBadge('ten-moments-captured', 'Ten Moments Captured', 'Saved ten notable expedition moments.', 'notable_moments', 'rare', 'sparkles', 'notable_moment_count', { threshold: 10 }),
  makeBadge('weather-moment', 'Weather Moment', 'Recorded a weather notable moment.', 'notable_moments', 'common', 'weather', 'notable_moment_type', { momentTypes: ['weather_change'] }),
  makeBadge('elevation-moment', 'Elevation Moment', 'Recorded a highest-elevation notable moment.', 'notable_moments', 'common', 'peak', 'notable_moment_type', { momentTypes: ['highest_elevation'] }),
  makeBadge('recovery-moment', 'Recovery Moment', 'Recorded a recovery notable moment.', 'notable_moments', 'uncommon', 'recovery', 'notable_moment_type', { momentTypes: ['recovery_tools_opened'] }),
  makeBadge('deviation-moment', 'Deviation Moment', 'Recorded a route deviation notable moment.', 'notable_moments', 'common', 'reroute', 'notable_moment_type', { momentTypes: ['route_deviation'] }),
  makeBadge('terrain-risk-moment', 'Terrain Risk Moment', 'Recorded a terrain risk notable moment.', 'notable_moments', 'uncommon', 'terrain', 'notable_moment_type', { momentTypes: ['terrain_risk_warning'] }),
  makeBadge('memorable-route', 'Memorable Route', 'Completed an expedition with five or more notable moments.', 'notable_moments', 'rare', 'sparkles', 'notable_moment_count', { threshold: 5 }),
  makeBadge('story-worth-saving', 'Story Worth Saving', 'Completed an expedition with ten or more notable moments.', 'notable_moments', 'epic', 'sparkles', 'notable_moment_count', { threshold: 10 }),
];

const PERSONAL_RECORD_BADGES: ExpeditionBadgeDefinition[] = [
  makeBadge('longest-expedition-yet', 'Longest Expedition Yet', 'Set a new personal distance record.', 'personal_records', 'uncommon', 'odometer', 'personal_record', { recordMetric: 'distance' }, { repeatable: true, progressTarget: null }),
  makeBadge('highest-expedition-yet', 'Highest Expedition Yet', 'Set a new personal elevation record.', 'personal_records', 'uncommon', 'peak', 'personal_record', { recordMetric: 'elevation' }, { repeatable: true, progressTarget: null }),
  makeBadge('longest-duration-yet', 'Longest Duration Yet', 'Set a new personal duration record.', 'personal_records', 'uncommon', 'time', 'personal_record', { recordMetric: 'duration' }, { repeatable: true, progressTarget: null }),
  makeBadge('most-elevation-gain-yet', 'Most Elevation Gain Yet', 'Set a new personal elevation gain record.', 'personal_records', 'rare', 'climb', 'personal_record', { recordMetric: 'elevation_gain' }, { repeatable: true, progressTarget: null }),
  makeBadge('most-notable-moments-yet', 'Most Notable Moments Yet', 'Set a new personal notable moment record.', 'personal_records', 'rare', 'sparkles', 'personal_record', { recordMetric: 'notable_moments' }, { repeatable: true, progressTarget: null }),
  makeBadge('most-remote-route-yet', 'Most Remote Route Yet', 'Set a new personal remoteness marker from saved trip context.', 'personal_records', 'rare', 'satellite', 'context_terms', { terms: ['remote', 'isolated'] }),
  makeBadge('toughest-terrain-yet', 'Toughest Terrain Yet', 'Set a new personal terrain risk record.', 'personal_records', 'rare', 'terrain', 'personal_record', { recordMetric: 'terrain_risk' }, { repeatable: true, progressTarget: null }),
  makeBadge('fastest-completion-yet', 'Fastest Completion Yet', 'Set a new personal average speed record.', 'personal_records', 'rare', 'speedometer', 'personal_record', { recordMetric: 'speed' }, { repeatable: true, progressTarget: null }),
  makeBadge('personal-best', 'Personal Best', 'Set at least one new personal expedition record.', 'personal_records', 'rare', 'patch', 'personal_record', { recordMetric: 'distance' }, { repeatable: true, progressTarget: null }),
  makeBadge('record-breaker', 'Record Breaker', 'Set a major personal expedition record.', 'personal_records', 'epic', 'patch', 'personal_record', { recordMetric: 'elevation_gain' }, { repeatable: true, progressTarget: null }),
];

const HIDDEN_BADGES: ExpeditionBadgeDefinition[] = [
  makeBadge('ghost-trail', 'Ghost Trail', 'Completed a hidden route pattern.', 'hidden', 'hidden', 'hidden', 'hidden_combo', { terms: ['ghost', 'abandoned'], requireAll: false }, { hidden: true }),
  makeBadge('golden-hour', 'Golden Hour', 'Completed a hidden golden-hour finish pattern.', 'hidden', 'hidden', 'hidden', 'time_window', { timeField: 'completedAt', hourStart: 18, hourEnd: 19 }, { hidden: true }),
  makeBadge('midnight-oil', 'Midnight Oil', 'Completed a hidden late-night expedition pattern.', 'hidden', 'hidden', 'hidden', 'time_window', { timeField: 'completedAt', hourStart: 0, hourEnd: 2 }, { hidden: true }),
  makeBadge('silent-operator', 'Silent Operator', 'Completed a hidden clean remote pattern.', 'hidden', 'hidden', 'hidden', 'hidden_combo', { terms: ['remote'], maxRouteEvents: 0, maxRecoveryUsage: 0 }, { hidden: true }),
  makeBadge('back-before-dark', 'Back Before Dark', 'Completed a hidden daylight return pattern.', 'hidden', 'hidden', 'hidden', 'time_window', { timeField: 'completedAt', hourStart: 15, hourEnd: 17 }, { hidden: true }),
  makeBadge('the-long-way', 'The Long Way', 'Completed a hidden long-distance route pattern.', 'hidden', 'hidden', 'hidden', 'single_trip_distance', { threshold: 175 }, { hidden: true }),
  makeBadge('no-signal-no-problem', 'No Signal, No Problem', 'Completed a hidden offline-capable route pattern.', 'hidden', 'hidden', 'hidden', 'context_terms', { terms: ['offline', 'no signal'] }, { hidden: true }),
  makeBadge('needle-threader', 'Needle Threader', 'Completed a hidden precise-route pattern.', 'hidden', 'hidden', 'hidden', 'clean_completion', { maxRouteEvents: 0, maxRecoveryUsage: 0 }, { hidden: true }),
  makeBadge('weather-gambler', 'Weather Gambler', 'Completed a hidden severe-weather route pattern.', 'hidden', 'hidden', 'hidden', 'weather_terms', { terms: ['storm', 'snow', 'wind'], requireAll: false }, { hidden: true }),
  makeBadge('ridge-whisperer', 'Ridge Whisperer', 'Completed a hidden ridge route pattern.', 'hidden', 'hidden', 'hidden', 'context_terms', { terms: ['ridge', 'ridgeline'] }, { hidden: true }),
  makeBadge('desert-ghost', 'Desert Ghost', 'Completed a hidden desert route pattern.', 'hidden', 'hidden', 'hidden', 'context_terms', { terms: ['desert', 'remote'] }, { hidden: true }),
  makeBadge('mud-baptism', 'Mud Baptism', 'Completed a hidden mud route pattern.', 'hidden', 'hidden', 'hidden', 'terrain_terms', { terms: ['mud', 'muddy'] }, { hidden: true }),
  makeBadge('the-scenic-mistake', 'The Scenic Mistake', 'Completed a hidden deviation pattern.', 'hidden', 'hidden', 'hidden', 'hidden_combo', { metric: 'route_events', threshold: 1, terms: ['scenic'] }, { hidden: true }),
  makeBadge('perfect-window', 'Perfect Window', 'Completed a hidden clean-weather route pattern.', 'hidden', 'hidden', 'hidden', 'context_terms', { terms: ['clear', 'stable weather', 'perfect window'] }, { hidden: true }),
  makeBadge('old-reliable', 'Old Reliable', 'Completed a hidden consistency pattern.', 'hidden', 'hidden', 'hidden', 'trip_count', { threshold: 5 }, { hidden: true }),
];

const SEASONAL_BADGES: ExpeditionBadgeDefinition[] = [
  makeBadge('spring-route', 'Spring Route', 'Completed an expedition during spring.', 'seasonal', 'common', 'leaf', 'season', { season: 'spring' }),
  makeBadge('summer-route', 'Summer Route', 'Completed an expedition during summer.', 'seasonal', 'common', 'sun', 'season', { season: 'summer' }),
  makeBadge('fall-route', 'Fall Route', 'Completed an expedition during fall.', 'seasonal', 'common', 'leaf', 'season', { season: 'fall' }),
  makeBadge('winter-route', 'Winter Route', 'Completed an expedition during winter.', 'seasonal', 'common', 'snow', 'season', { season: 'winter' }),
  makeBadge('new-year-expedition', 'New Year Expedition', 'Completed an expedition in January.', 'seasonal', 'uncommon', 'calendar', 'season', { month: 0 }),
  makeBadge('holiday-trail', 'Holiday Trail', 'Completed an expedition during a holiday-season month.', 'seasonal', 'uncommon', 'calendar', 'season', { month: 11 }),
  makeBadge('first-trip-of-the-season', 'First Trip of the Season', 'Completed a seasonal opening expedition.', 'seasonal', 'uncommon', 'flag', 'season', {}),
  makeBadge('last-trip-of-the-season', 'Last Trip of the Season', 'Completed a seasonal closing expedition.', 'seasonal', 'uncommon', 'flag', 'season', {}),
];

export const EXPEDITION_BADGE_DEFINITIONS: ExpeditionBadgeDefinition[] = [
  ...FIRST_BADGES,
  ...IDENTITY_MVP_BADGES,
  ...DISTANCE_BADGES,
  ...ELEVATION_BADGES,
  ...DURATION_BADGES,
  ...WEATHER_BADGES,
  ...TERRAIN_BADGES,
  ...RECOVERY_BADGES,
  ...ROUTE_BEHAVIOR_BADGES,
  ...CONSISTENCY_BADGES,
  ...EXPLORATION_BADGES,
  ...NOTABLE_MOMENT_BADGES,
  ...PERSONAL_RECORD_BADGES,
  ...HIDDEN_BADGES,
  ...SEASONAL_BADGES,
];

export function getBadgeDefinition(badgeId: string): ExpeditionBadgeDefinition | null {
  return EXPEDITION_BADGE_DEFINITIONS.find((definition) => definition.id === badgeId) ?? null;
}

export function getVisibleBadgeDefinitions(): ExpeditionBadgeDefinition[] {
  return EXPEDITION_BADGE_DEFINITIONS.filter((definition) => !definition.isHidden);
}

// TODO Expedition Badges: connect iconKey values to a dedicated badge artwork system.
// TODO Expedition Badges: add deeper hidden Easter egg combinations as more source data lands.
// TODO Expedition Badges: support catalog progress rings without exposing hidden locked badges.
// TODO Expedition Badges: stamp earned badges into future expedition reports and map unlock locations.
