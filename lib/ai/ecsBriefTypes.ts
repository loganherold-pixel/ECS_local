export type ECSBriefSeverity = 'info' | 'watch' | 'warning' | 'critical';

export type RemoteWeatherHazardType =
  | 'remote_weather_exposure'
  | 'remote_signal_loss'
  | 'remote_fire_smoke'
  | 'remote_flood_risk'
  | 'remote_wind_exposure'
  | 'remote_snow_ice'
  | 'remote_heat_risk'
  | 'remote_bailout_gap'
  | 'offline_readiness_gap';

export type RemoteWeatherBriefEvent = {
  id: string;
  type: RemoteWeatherHazardType;
  severity: ECSBriefSeverity;
  title: string;
  message: string;
  routeId?: string;
  segmentId?: string;
  confidence: number;
  remotenessScore?: number;
  routeConfidence?: number;
  weatherRisk?: number;
  distanceAheadMi?: number;
  etaMinutes?: number;
  recommendedAction?: string;
  createdAt: number;
  expiresAt?: number;
  source: 'ecs-remote-weather';
};

export type ECSBriefEvent = RemoteWeatherBriefEvent;
