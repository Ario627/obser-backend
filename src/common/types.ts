export enum CelestialType {
  ISS = 'iss',
  SATELLITE = 'satellite',
  PLANET = 'planet',
  MOON = 'moon',
  SUN = 'sun',
  STAR = 'star',
}

export type ServoSpeed = 'slow' | 'normal' | 'fast';

export interface TrackTarget {
  type: CelestialType;
  id: string;
}

export interface CelestialPosition {
  name: string;
  type: CelestialType;
  azimuth: number;
  altitude: number;
  distanceKm: number | null;
  isVisible: boolean;
  illuminated: boolean | null;
  angularRate: number | null;
  nextAos: string | null;
  nextLos: string | null;
  passDuration: number | null;
  maxAltitude: number | null;
  timestamp: string;
}

export interface CelestialUpdatePayload {
  name: string;
  type: CelestialType;
  azimuth: number;
  altitude: number;
  distanceKm: number | null;
  isVisible: boolean;
  illuminated: boolean | null;
  servoAzimuth: number;
  servoAltitude: number;
  angularRate: number | null;
  timestamp: string;
}

export interface ServoCommandPayload {
  azimuth: number;
  altitude: number;
  speed: ServoSpeed;
}

export interface HardwareStatus {
  batteryPercent: number;
  voltage: number;
  solarVoltage: number | null;
  temperature: number | null;
  humidity: number | null;
  servoAzAngle: number;
  servoAltAngle: number;
  wifiRssi: number | null;
  uptimeSeconds: number;
  loraEnabled: boolean;
  cameraReady: boolean;
  timestamp: string;
}

export interface PassInfo {
  objectName: string;
  nextAos: string | null;
  nextLos: string | null;
  duration: number | null;
  maxAltitude: number | null;
}

export interface LoraReceivedPayload {
  message: string;
  rssi: number;
  snr: number;
  timestamp: string;
}

export interface LoraSendPayload {
  message: string;
  timestamp: string;
}

export interface CaptureTriggerPayload {
  reason: 'auto' | 'manual';
  objectName?: string;
  azimuth?: number;
  altitude?: number;
  timestamp: string;
}

export interface CaptureResultPayload {
  imageBase64: string;
  timestamp: string;
  triggerReason: 'auto' | 'manual';
}

export interface CaptureCompletedPayload {
  id: number;
  filename: string;
  filePath: string;
  triggerReason: 'auto' | 'manual';
  objectName: string | null;
  azimuth: number | null;
  altitude: number | null;
  fileSize: number;
  timestamp: string;
}

export interface ParsedLoraMessage {
  type: string;
  content: string;
}

export interface SatelliteDiscoveryResult {
  noradId: number;
  name: string;
  nextPass: PassInfo;
  maxAltitude: number;
}

export interface ObserverLocation {
  latitude: number;
  longitude: number;
  altitude: number;
}

export interface TransformedResponse<T> {
  data: T;
  timestamp: string;
  success: boolean;
}