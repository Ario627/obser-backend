import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { IClientPublishOptions, ISubscriptionMap } from 'mqtt';
import { EVENTS } from '../common/constant/events.constant';
import { MQTT_QOS, MQTT_TOPICS } from '../common/constant/mqtt-topics.constant';
import type {
  CaptureResultPayload,
  DeviceConnectionPayload,
  HardwareStatus,
  LoraReceivedPayload,
} from '../common/types';

export type MqttQos = NonNullable<IClientPublishOptions['qos']>;

interface Handler {
  topic: string;
  qos: MqttQos;
  event: string;
  parse: (raw: string) => object | null;
}

const SERVO_MIN = 0;
const SERVO_MAX = 180;
const BATTERY_MAX = 100;
const MAX_PIN_LENGTH = 32;
const MIN_IMAGE_BASE64_LENGTH = 64;
const PAYLOAD_PREVIEW_LENGTH = 120;
const EPOCH_MILLISECONDS = 1e12;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const toNumber = (value: unknown): number | null => {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
};

const toBoolean = (value: unknown): boolean =>
  value === true || value === 1 || value === '1' || value === 'true';

const toIso = (value: unknown): string => {
  const timestamp = toNumber(value);

  if (timestamp !== null) {
    const date = new Date(
      timestamp < EPOCH_MILLISECONDS ? timestamp * 1000 : timestamp,
    );
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }

  return new Date().toISOString();
};

const readJson = (raw: string): Record<string, unknown> | null => {
  try {
    const parsed: unknown = JSON.parse(raw);

    return typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

@Injectable()
export class MqttExplorer {
  private readonly logger = new Logger(MqttExplorer.name);
  private readonly handlers: Map<string, Handler>;

  constructor(private readonly events: EventEmitter2) {
    this.handlers = new Map(
      this.buildHandlers().map((handler): [string, Handler] => [
        handler.topic,
        handler,
      ]),
    );
  }

  getSubscriptions(): ISubscriptionMap {
    const subscriptions: ISubscriptionMap = {};

    for (const { topic, qos } of this.handlers.values()) {
      subscriptions[topic] = { qos };
    }

    return subscriptions;
  }

  handleMessage(topic: string, payload: Buffer): void {
    const handler = this.handlers.get(topic);

    if (!handler) {
      this.logger.debug(`No handler registered for ${topic}`);
      return;
    }

    const raw = payload.toString();
    let event: object | null;

    try {
      event = handler.parse(raw);
    } catch (error) {
      this.logger.error(`Parser threw on ${topic}: ${String(error)}`);
      return;
    }

    if (event === null) {
      this.logger.warn(
        `Discarded malformed payload on ${topic}: ${raw.slice(0, PAYLOAD_PREVIEW_LENGTH)}`,
      );
      return;
    }

    this.events.emit(handler.event, event);
  }

  private buildHandlers(): Handler[] {
    return [
      {
        topic: MQTT_TOPICS.subscribe.HARDWARE_STATUS,
        qos: MQTT_QOS.HARDWARE_STATUS,
        event: EVENTS.hardware.STATUS_UPDATED,
        parse: (raw) => this.hardware(raw),
      },
      {
        topic: MQTT_TOPICS.subscribe.AUTH_PIN,
        qos: MQTT_QOS.AUTH_PIN,
        event: EVENTS.device.PIN_RECEIVED,
        parse: (raw) => this.pin(raw),
      },
      {
        topic: MQTT_TOPICS.subscribe.LORA_RECEIVED,
        qos: MQTT_QOS.LORA_RECEIVED,
        event: EVENTS.lora.MESSAGE_RECEIVED,
        parse: (raw) => this.lora(raw),
      },
      {
        topic: MQTT_TOPICS.subscribe.CAPTURE_RESULT,
        qos: MQTT_QOS.CAPTURE_RESULT,
        event: EVENTS.capture.RESULT_RECEIVED,
        parse: (raw) => this.capture(raw),
      },
      {
        topic: MQTT_TOPICS.subscribe.DEVICE_STATUS,
        qos: MQTT_QOS.DEVICE_STATUS,
        event: EVENTS.device.CONNECTED,
        parse: (raw) => this.device(raw),
      },
    ];
  }

  private hardware(raw: string): HardwareStatus | null {
    const body = readJson(raw);

    if (!body) return null;

    const batteryPercent = toNumber(body.batteryPercent);
    const voltage = toNumber(body.voltage);

    if (batteryPercent === null || voltage === null) return null;

    return {
      batteryPercent: clamp(batteryPercent, 0, BATTERY_MAX),
      voltage,
      solarVoltage: toNumber(body.solarVoltage),
      temperature: toNumber(body.temperature),
      humidity: toNumber(body.humidity),
      servoAzAngle: clamp(
        toNumber(body.servoAzAngle) ?? 0,
        SERVO_MIN,
        SERVO_MAX,
      ),
      servoAltAngle: clamp(
        toNumber(body.servoAltAngle) ?? 0,
        SERVO_MIN,
        SERVO_MAX,
      ),
      wifiRssi: toNumber(body.wifiRssi),
      uptimeSeconds: toNumber(body.uptimeSeconds) ?? 0,
      loraEnabled: toBoolean(body.loraEnabled),
      cameraReady: toBoolean(body.cameraReady),
      timestamp: toIso(body.timestamp),
    };
  }

  private pin(raw: string): { pin: string } | null {
    const body = readJson(raw);

    if (!body) return null;

    const pin = typeof body.pin === 'string' ? body.pin.trim() : '';

    return pin.length > 0 && pin.length <= MAX_PIN_LENGTH ? { pin } : null;
  }

  private lora(raw: string): LoraReceivedPayload | null {
    const body = readJson(raw);

    if (!body) return null;

    const message = typeof body.message === 'string' ? body.message.trim() : '';

    if (message.length === 0) return null;

    return {
      message,
      rssi: toNumber(body.rssi) ?? 0,
      snr: toNumber(body.snr) ?? 0,
      timestamp: toIso(body.timestamp),
    };
  }

  private capture(raw: string): CaptureResultPayload | null {
    const body = readJson(raw);

    if (!body) return null;

    const imageBase64 =
      typeof body.imageBase64 === 'string' ? body.imageBase64 : '';

    if (imageBase64.length < MIN_IMAGE_BASE64_LENGTH) return null;

    return {
      imageBase64,
      triggerReason: body.triggerReason === 'manual' ? 'manual' : 'auto',
      timestamp: toIso(body.timestamp),
    };
  }

  private device(raw: string): DeviceConnectionPayload | null {
    const status = raw
      .trim()
      .replace(/^["']|["']$/g, '')
      .toLowerCase();

    if (status === 'online') return { connected: true };
    if (status === 'offline') return { connected: false };

    return null;
  }
}
