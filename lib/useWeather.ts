export {
  getSharedOperationalWeatherState,
  removeSharedOperationalWeatherConsumer,
  setSharedOperationalWeatherConsumer,
  subscribeSharedOperationalWeather,
  useOperationalWeather,
  useOperationalWeather as useWeather,
} from './useOperationalWeather';

export type {
  UseOperationalWeatherOptions as UseWeatherOptions,
} from './useOperationalWeather';

export {
  fetchSharedWeatherForCoordinates,
  fetchSharedWeatherForTarget,
  getAnyCachedSharedWeather,
  getCachedSharedWeatherResult,
  resolveECSWeatherTarget,
} from './weatherService';

export {
  formatWeatherCoordinateLabel,
  resolveWeatherLocation,
  resolveWeatherLocationWithReverseGeocode,
  WEATHER_LOCATION_FORCE_REFRESH_DISTANCE_MILES,
  WEATHER_LOCATION_STALE_DISTANCE_MILES,
  WEATHER_LOCATION_UNAVAILABLE,
} from './weatherLocationResolver';

export type {
  ECSWeatherCoordinateSource,
  ECSWeatherTargetInput,
  ResolvedECSWeatherTarget,
  SharedWeatherFetchResult,
} from './weatherService';

export type {
  ResolvedWeatherLocation,
  WeatherLocationLabelConfidence,
  WeatherLocationResolverInput,
  WeatherLocationSource,
} from './weatherLocationResolver';
