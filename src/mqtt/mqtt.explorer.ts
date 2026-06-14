import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EVENTS } from 'src/common/constant/events.constant';
import {MQTT_TOPICS} from '../common/constant/mqtt-topics.constant'

export interface MqttHandler {
  topic: string;
  eventName: string;
  parser: (payload: string) => Record<string, unknown> | null;
}

@Injectable()
export class MqttExplorer {
  private readonly logger = new Logger(MqttExplorer.name);

  constructor(private readonly eventEmitter: EventEmitter2) {}

  getHandlers(): MqttHandler[] {
    return [
      {
        topic: MQTT_TOPICS.subscribe.HARDWARE_STATUS,
        eventName: EVENTS.hardware.STATUS_UPDATED,
        parser: (payload: string) => this.safeParse(payload, 'hardware/status'),
      },
      {
        topic: MQTT_TOPICS.subscribe.AUTH_PIN,
        eventName: EVENTS.device.PIN_RECEIVED,
        parser: (payload: string) => {
          const parsed = this.safeParse(payload, 'auth/pin');
          if (!parsed) return null;
          if (typeof parsed.pin === 'string') return { pin: parsed.pin };
          if (typeof parsed === 'string') return { pin: parsed };
          this.logger.warn('Invalid PIN payload format');
          return null;
        },
      },
      {
        topic: MQTT_TOPICS.subscribe.LORA_RECEIVED,
        eventName: EVENTS.lora.MESSAGE_RECEIVED,
        parser: (payload: string) => this.safeParse(payload, 'lora/received'),
      },
      {
        topic: MQTT_TOPICS.subscribe.CAPTURE_RESULT,
        eventName: EVENTS.capture.RESULT_RECEIVED,
        parser: (payload: string) => this.safeParse(payload, 'capture/result'),
      },
      {
        topic: MQTT_TOPICS.subscribe.DEVICE_STATUS,
        eventName: EVENTS.device.CONNECTED,
        parser: (payload: string) => {
          const trimmed = payload.trim().replace(/['"]/g, '');
          const connected = trimmed === 'online';
          return { connected };
        },
      },
    ];
  }

  handleMessage(topic: string, payload: Buffer): void {
    const rawPayload = payload.toString();
    const handlers = this.getHandlers();
    const handler = handlers.find((h) => h.topic === topic);

    if (!handler) {
      this.logger.warn(`No handler registered for topic: ${topic}`);
      return;
    }

    const parsed = handler.parser(rawPayload);

    if (parsed === null) {
      this.logger.warn(`Failed to parse payload for topic: ${topic}`);
      return;
    }

    this.logger.debug(`Routing MQTT message: ${topic} → ${handler.eventName}`);
    this.eventEmitter.emit(handler.eventName, parsed);
  }

  private safeParse(
    payload: string,
    topicLabel: string,
  ): Record<string, unknown> | null {
    try {
      return JSON.parse(payload);
    } catch {
      this.logger.warn(
        `Invalid JSON from MQTT topic ${topicLabel}: ${payload.substring(0, 100)}`,
      );
      return null;
    }
  }
}
