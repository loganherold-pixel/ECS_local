import { recordExplorePerformanceEvent } from './explorePerformance';

export function dispatchSummaryFirstTripBuilderNavigation<T>(options: {
  route: T;
  stageReadiness: (route: T) => void;
  stageItinerary: (route: T) => void;
  clearTransientUi: () => void;
  navigate: (route: T) => void;
}): void {
  recordExplorePerformanceEvent('explore_route_card_press_received');
  options.stageReadiness(options.route);
  options.stageItinerary(options.route);
  options.clearTransientUi();
  recordExplorePerformanceEvent('explore_trip_builder_navigation_dispatched');
  options.navigate(options.route);
}
