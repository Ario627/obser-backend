export enum CelestialType {
  ISS = 'iss',
  SATELLITE = 'satellite',
  PLANET = 'planet',
  MOON = 'moon',
  SUN = 'sun',
  STAR = 'star',
}

export type ServoSpeed = 'slow' | 'normal' | 'fast';

export type ServoSource = 'auto' | 'manual';

export type CaptureReason = 'auto' | 'manual';

export type LoraDirection = 'inbound' | 'outbound';

export interface TrackTarget {
  type: CelestialType;
  id: string;
}

export interface PassInfo {
  objectName: string;
  nextAos: string | null;
  nextLos: string | null;
  duration: number | null;
  maxAltitude: number | null;
  aosAzimuth: number | null;
  losAzimuth: number | null;
}

export interface CelestialPosition {
  name: string;
  type: CelestialType;
  azimuth: number;
  altitude: number;
  distanceKm: number | null;
  distanceAu: number | null;
  azimuthRate: number | null;
  altitudeRate: number | null;
  isVisible: boolean;
  illuminated: boolean | null;
  nextAos: string | null;
  nextLos: string | null;
  passDuration: number | null;
  maxAltitude: number | null;
  aosAzimuth: number | null;
  losAzimuth: number | null;
  timestamp: string;
}

export interface CelestialUpdatePayload extends CelestialPosition {
  servoAzimuth: number;
  servoAltitude: number;
}

export interface ServoCommandPayload {
  azimuth: number;
  altitude: number;
  speed: ServoSpeed;
  source: ServoSource;
}

export interface ManualServoPayload {
  azimuth: number;
  altitude: number;
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

export interface DeviceConnectionPayload {
  connected: boolean;
}

export interface MqttStatusPayload {
  connected: boolean;
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

export interface LoraMessagePayload {
  id: number;
  direction: LoraDirection;
  message: string;
  rssi: number | null;
  snr: number | null;
  timestamp: string;
}

export interface ParsedLoraMessage {
  type: string;
  content: string;
}

export interface CaptureTriggerPayload {
  reason: CaptureReason;
  objectName?: string;
  azimuth?: number;
  altitude?: number;
  timestamp: string;
}

export interface CaptureResultPayload {
  imageBase64: string;
  timestamp: string;
  triggerReason: CaptureReason;
}

export interface CaptureCompletedPayload {
  id: number;
  filename: string;
  filePath: string;
  triggerReason: CaptureReason;
  objectName: string | null;
  azimuth: number | null;
  altitude: number | null;
  fileSize: number;
  timestamp: string;
}

export interface ObserverLocation {
  latitude: number;
  longitude: number;
  altitude: number;
}

export interface SatelliteCatalogEntry {
  name: string;
  noradId: number;
  endpoint: string;
}

export interface ObjectsCatalog {
  planets: string[];
  stars: string[];
  satellites: SatelliteCatalogEntry[];
}

export interface WsErrorPayload {
  message: string;
  code: string;
  status: number;
  timestamp: string;
}

export interface TransformedResponse<T> {
  data: T;
  timestamp: string;
  success: boolean;
}
