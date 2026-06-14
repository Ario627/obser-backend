import { CelestialType, TrackTarget, PassInfo } from '../common/types';

export interface AstroServiceResponse {
  name: string;
  type: string;
  azimuth: number;
  altitude: number;
  distance_km: number | null;
  is_visible: boolean;
  illuminated: boolean | null;
  angular_rate: number | null;
  next_aos: string | null;
  next_los: string | null;
  pass_duration: number | null;
  max_altitude: number | null;
  timestamp: string;
}

export interface PollingState {
  isPolling: boolean;
  lastPollTime: number | null;
  lastSuccessTime: number | null;
  consecutiveErrors: number;
  activeTarget: TrackTarget;
}

export interface PassAlertThreshold {
  minutesBeforePass: number;
  hasAlerted: boolean;
  alertedPassKey: string | null;
}

export interface ServoConversionResult {
  azimuth: number;
  altitude: number;
  speed: 'slow' | 'normal' | 'fast';
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
  angularRate: number | null;
}
