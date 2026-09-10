import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { IClientPublishOptions, ISubscriptionMap } from 'mqtt';
import { EVENTS } from '../common/constant/events.constant';
import { MQTT_QOS, MQTT_TOPICS } from '../common/constant/mqtt-topics.constant';
import type { HardwareStatus } from '../common/types';

export type MqttQos = NonNullable<IClientPublishOptions['qos']>;

export interface MqttHandler {
  topic: string;
  qos: MqttQos;
  event: string;
  parse: (payload: string) => object | null;
}

const BATTERY_PERCENT_KEYS = [
  'batteryPercent',
  'battery_percent',
  'battery',
  'batteryLevel',
  'battery_level',
] as const;
const VOLTAGE_KEYS = [
  'voltage',
  'batteryVoltage',
  'battery_voltage',
  'vbat',
] as const;

const SOLAR_VOLTAGE_KEYS = ['solarVoltage', 'solar_voltage', 'solar'] as const;
const TEMPERATURE_KEYS = ['temperature', 'temp'] as const;
const HUMIDITY_KEYS = ['humidity', 'hum'] as const;
const SERVO_AZIMUTH_KEYS = [
  'servoAzAngle',
  'servo_az_angle',
  'azimuth',
  'az',
] as const;
const SERVO_ALTITUDE_KEYS = [
  'servoAltAngle',
  'servo_alt_angle',
  'altitude',
  'alt',
] as const;
const WIFI_RSSI_KEYS = ['wifiRssi', 'wifi_rssi', 'rssi'] as const;
const UPTIME_KEYS = ['uptimeSeconds', 'uptime_seconds', 'uptime'] as const;
const LORA_KEYS = ['loraEnabled', 'lora_enabled', 'lora'] as const;
const CAMERA_KEYS = ['cameraReady', 'camera_ready', 'camera'] as const;
const TIMESTAMP_KEYS = ['timestamp', 'ts', 'time'] as const;
const PIN_KEYS = ['pin', 'code'] as const;
const LORA_TEXT_KEYS = [
  'message',
  'msg',
  'text',
  'content',
  'payload',
] as const;
const RSSI_KEYS = ['rssi'] as const;
const SNR_KEYS = ['snr'] as const;
const IMAGE_KEYS = ['imageBase64', 'image_base64', 'image', 'data'] as const;
const REASON_KEYS = ['triggerReason', 'trigger_reason', 'reason'] as const;

const TRUE_VALUES = new Set([
  '1',
  'true',
  'yes',
  'on',
  'online',
  'up',
  'connected',
  'ready',
]);
const FALSE_VALUES = new Set([
  '0',
  'false',
  'no',
  'off',
  'offline',
  'down',
  'disconnected',
]);

const MAX_PIN_LENGTH = 32;
const MIN_RAW_IMAGE_LENGTH = 64;
const MAX_SERVO_ANGLE = 180;
const MAX_BATTERY_PERCENT = 100;
const MILLISECOND_THRESHOLD = 1e12;

const parseJson = (payload: string): unknown => {
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    return undefined;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readField = (
  source: Record<string, unknown>,
  keys: readonly string[],
): unknown => {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toNumberOr = (value: unknown, fallback: number): number =>
  toNumber(value) ?? fallback;

const toBoolean = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (TRUE_VALUES.has(normalized)) return true;
    if (FALSE_VALUES.has(normalized)) return false;
  }
  return null;
};

const toText = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
};

const toIsoTimestamp = (value: unknown): string => {
  const numeric = toNumber(value);
  if (numeric !== null) {
    const milliseconds =
      numeric < MILLISECOND_THRESHOLD ? numeric * 1000 : numeric;
    const date = new Date(milliseconds);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  }
  return new Date().toISOString();
};

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

@Injectable()
export class MqttExplorer {
  private readonly logger = new Logger(MqttExplorer.name);
  private readonly handlers: Map<string, MqttHandler>;

  constructor(private readonly eventEmitter: EventEmitter2) {
    this.handlers = new Map(this.buildHandlers().map((handler) => [handler.topic, handler]));
  }

  getSubscriptions(): ISubscriptionMap {
    const subscriptions: ISubscriptionMap = {};

    for(const handler of this.handlers.values()) {
      subscriptions[handler.topic] = {qos: handler.qos}
    }
    return subscriptions;
  }

  handleMessage(topic: string, payload: string): void {
    const handler = this.handlers.get(topic);
    if (!handler) {
      this.logger.warn(`No handler found for topic: ${topic}`);
      return;
    }

    try {
      const parsed = handler.parse(payload);
      if(parsed === null) {
        this.logger.warn(`Discarded malformed payload on ${topic}`);
        return;
      }

      this.logger.debug(`Routing ${topic} -> ${handler.event}`);
      this.eventEmitter.emit(handler.event, parsed);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to handle message on ${topic}: ${message}`);
    }
  }

  private buildHandlers(): MqttHandler[] {
    return [
      {
        topic: MQTT_TOPICS.subscribe.HARDWARE_STATUS,
        qos: MQTT_QOS.HARDWARE_STATUS,
        event: EVENTS.hardware.STATUS_UPDATED,
        parse: (payload) => this.parseHardwareStatus(payload),
      },
      {
        topic: MQTT_TOPICS.subscribe.AUTH_PIN,
        qos: MQTT_QOS.AUTH_PIN,
        event: EVENTS.device.PIN_RECEIVED,
        parse: (payload) => this.parseAuthPin(payload),
      },
      {
        topic: MQTT_TOPICS.subscribe.LORA_RECEIVED,
        qos: MQTT_QOS.LORA_RECEIVED,
        event: EVENTS.lora.MESSAGE_RECEIVED,
        parse: (payload) => this.parseLoraMessage(payload),
      },
      {
        topic: MQTT_TOPICS.subscribe.CAPTURE_RESULT,
        qos: MQTT_QOS.CAPTURE_RESULT,
        event: EVENTS.capture.RESULT_RECEIVED,
        parse: (payload) => this.parseCaptureResult(payload),
      },
      {
        topic: MQTT_TOPICS.subscribe.DEVICE_STATUS,
        qos: MQTT_QOS.DEVICE_STATUS,
        event: EVENTS.device.CONNECTED,
        parse: (payload) => this.parseDeviceStatus(payload),
      },
    ];
  }

  private parseDeviceStatus(payload: string): object | null {
    const decoded = parseJson(payload);

    if(isRecord(decoded)) {
      const connected = toBoolean(readField(decoded, ['connected', 'online', 'status']),);
      return connected === null ? null : { connected };
    }

    const normalized = payload.trim().toLowerCase();
    const connected = toBoolean(normalized);

    return connected === null ? null : { connected };
  }

  private parseAuthPin(payload: string): object | null {
    const decoded = parseJson(payload);
    const cantidate = isRecord(decoded)
      ? readField(decoded, PIN_KEYS)
      : (decoded ?? payload);

    const pin = toText(cantidate);

    if (pin === null || pin.length > MAX_PIN_LENGTH) return null;
    
    return { pin };
  }

  private parseHardwareStatus(payload: string): object | null {
    const decoded = parseJson(payload);

    if (!isRecord(decoded)) return null;

    const batteryPercent = toNumber(readField(decoded, BATTERY_PERCENT_KEYS));

    if (batteryPercent === null) return null;

    const status: HardwareStatus = {
      batteryPercent: clamp(batteryPercent, 0, MAX_BATTERY_PERCENT),
      voltage: toNumberOr(readField(decoded, VOLTAGE_KEYS), 0),
      solarVoltage: toNumber(readField(decoded, SOLAR_VOLTAGE_KEYS)),
      temperature: toNumber(readField(decoded, TEMPERATURE_KEYS)),
      humidity: toNumber(readField(decoded, HUMIDITY_KEYS)),
      servoAzAngle: clamp(
        toNumberOr(readField(decoded, SERVO_AZIMUTH_KEYS), 0),
        0,
        MAX_SERVO_ANGLE,
      ),
      servoAltAngle: clamp(
        toNumberOr(readField(decoded, SERVO_ALTITUDE_KEYS), 0),
        0,
        MAX_SERVO_ANGLE,
      ),
      wifiRssi: toNumber(readField(decoded, WIFI_RSSI_KEYS)),
      uptimeSeconds: toNumberOr(readField(decoded, UPTIME_KEYS), 0),
      loraEnabled: toBoolean(readField(decoded, LORA_KEYS)) ?? false,
      cameraReady: toBoolean(readField(decoded, CAMERA_KEYS)) ?? false,
      timestamp: toIsoTimestamp(readField(decoded, TIMESTAMP_KEYS)),
    };

    return { ...status };
  }


  private parseLoraMessage(payload: string): object | null {
    const decoded = parseJson(payload);
    const source = isRecord(decoded) ? decoded : null;
    const text = source
      ? toText(readField(source, LORA_TEXT_KEYS))
      : toText(decoded ?? payload);

    if (text === null) return null;

    return {
      message: text,
      rssi: toNumberOr(source ? readField(source, RSSI_KEYS) : undefined, 0),
      snr: toNumberOr(source ? readField(source, SNR_KEYS) : undefined, 0),
      timestamp: toIsoTimestamp(
        source ? readField(source, TIMESTAMP_KEYS) : undefined,
      ),
    };
  }

  private parseCaptureResult(payload: string): object | null {
    const decoded = parseJson(payload);
    const source = isRecord(decoded) ? decoded : null;
    const imageBase64 = source
      ? toText(readField(source, IMAGE_KEYS))
      : decoded === undefined &&  payload.length >= MIN_RAW_IMAGE_LENGTH
        ? payload
        : null;

    if(imageBase64 === null) return null;

    const reason = source ? toText(readField(source, REASON_KEYS)) : null;

    return {
      imageBase64,
      triggerReason: reason === 'manual' ? 'manual' : 'auto',
      timestamp: toIsoTimestamp(
        source ? readField(source, TIMESTAMP_KEYS) : undefined,
      ),
    };
  }


}