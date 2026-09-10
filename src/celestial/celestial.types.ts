import type {
  CelestialType,
  PassInfo,
  SatelliteCatalogEntry,
  ServoSpeed,
  TrackTarget,
} from '../common/types';

export interface AstroPositionResponse {
  name: string;
  type: string;
  azimuth: number;
  altitude: number;
  distance_km: number | null;
  distance_au: number | null;
  azimuth_rate: number | null;
  altitude_rate: number | null;
  is_visible: boolean;
  illuminated: boolean | null;
  timestamp: string;
}

export interface AstroPassResponse {
  name: string;
  next_aos: string;
  next_los: string;
  duration_seconds: number;
  max_altitude: number;
  aos_azimuth: number;
  los_azimuth: number;
}

export interface AstroSatelliteEntry {
  name: string;
  norad_id: number;
  endpoint: string;
}

export interface AstroObjectsResponse {
  planets: string[];
  stars: string[];
  satellites: AstroSatelliteEntry[];
}

export interface AstroErrorResponse {
  detail: string;
}

export interface PollingState {
  isPolling: boolean;
  lastPollTime: number | null;
  lastSuccessTime: number | null;
  consecutiveErrors: number;
  activeTarget: TrackTarget;
}

export interface PassCacheEntry {
  pass: PassInfo | null;
  fetchedAt: number;
}

export interface PassAlertThreshold {
  minutesBeforePass: number;
  hasAlerted: boolean;
  alertedPassKey: string | null;
}

export interface ServoConversionResult {
  azimuth: number;
  altitude: number;
  speed: ServoSpeed;
}

export interface TrackingLogEntry {
  objectName: string;
  objectType: CelestialType;
  azimuth: number;
  altitude: number;
  distanceKm: number | null;
  isVisible: boolean;
  illuminated: boolean | null;
  servoAzimuth: number;
  servoAltitude: number;
  azimuthRate: number | null;
  altitudeRate: number | null;
}

export type AstroCatalogEntry = SatelliteCatalogEntry;
