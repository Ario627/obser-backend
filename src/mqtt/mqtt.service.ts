import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import {ConfigService} from "@nestjs/config";
import {EventEmitter2, OnEvent} from "@nestjs/event-emitter";
import * as mqtt from 'mqtt';
import {MQTT_TOPICS, MQTT_QOS} from "../common/constant/mqtt-topics.constant";
import {EVENTS} from "src/common/constant/events.constant";
import {MqttExplorer} from "./mqtt.explorer";
import {ServoCommandPayload, LoraSendPayload, CaptureTriggerPayload} from "src/common/types";

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttService.name);
  private client: mqtt.MqttClient | null = null;
  private isConnected = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly mqttExplorer: MqttExplorer,
  ) {}

  onModuleInit() {
    this.connect();
  }

  onModuleDestroy() {
    this.disconnect();
  }

  private connect(): void {
    const url = this.configService.get<string>('mqtt.url');
    const username = this.configService.get<string>('mqtt.username');
    const password = this.configService.get<string>('mqtt.password');

    this.client = mqtt.connect(url as string, {
      username,
      password,
      clientId: `nestjs-backend-${Math.random().toString(16).slice(2, 10)}`,
      reconnectPeriod: 5000,
      connectTimeout: 10000,
      clean: true,
      keepalive: 30,
    });
    this.client.on('connect', () => {
      this.isConnected = true;
      this.logger.log(`Connected to MQTT broker at ${url}`);
      this.subscribeAll();
      this.eventEmitter.emit(EVENTS.mqtt.STATUS_CHANGED, {
        connected: true,
      });
    });

    this.client.on('message', (topic: string, payload: Buffer) => {
      this.mqttExplorer.handleMessage(topic, payload);
    });

    this.client.on('reconnect', () => {
      this.logger.debug('Attempting MQTT reconnection...');
    });

    this.client.on('disconnect', () => {
      this.handleDisconnect();
    });

    this.client.on('close', () => {
      if (this.isConnected) {
        this.handleDisconnect();
      }
    });

    this.client.on('offline', () => {
      if (this.isConnected) {
        this.handleDisconnect();
      }
    });

    this.client.on('error', (error: Error) => {
      this.logger.error(`MQTT error: ${error.message}`);
    });
  }

  private disconnect(): void {
    if (this.client) {
      this.client.end(true);
      this.client = null;
      this.isConnected = false;
      this.logger.log('MQTT client disconnected');
    }
  }

  private handleDisconnect(): void {
    if (!this.isConnected) return;
    this.isConnected = false;
    this.logger.warn('Disconnected from MQTT broker');
    this.eventEmitter.emit(EVENTS.mqtt.STATUS_CHANGED, { connected: false });
    this.eventEmitter.emit(EVENTS.device.CONNECTED, { connected: false });
  }

  private subscribeAll(): void {
    if (!this.client) return;

    const topics: mqtt.ISubscriptionMap = {
      [MQTT_TOPICS.subscribe.HARDWARE_STATUS]: {
        qos: MQTT_QOS.HARDWARE_STATUS,
      },
      [MQTT_TOPICS.subscribe.AUTH_PIN]: { qos: MQTT_QOS.AUTH_PIN },
      [MQTT_TOPICS.subscribe.LORA_RECEIVED]: { qos: MQTT_QOS.LORA_RECEIVED },
      [MQTT_TOPICS.subscribe.CAPTURE_RESULT]: { qos: MQTT_QOS.CAPTURE_RESULT },
      [MQTT_TOPICS.subscribe.DEVICE_STATUS]: { qos: MQTT_QOS.DEVICE_STATUS },
    };

    this.client.subscribe(topics, (err) => {
      if (err) {
        this.logger.error(`Failed to subscribe to topics: ${err.message}`);
        return;
      }
      this.logger.log(
        `Subscribed to ${Object.keys(topics).length} MQTT topics`,
      );
    });
  }

  private publish(
    topic: string,
    payload: Record<string, unknown>,
    qos: 0 | 1 | 2,
  ): boolean {
    if (!this.client || !this.isConnected) {
      this.logger.warn(`Cannot publish to ${topic}: not connected`);
      return false;
    }

    const message = JSON.stringify(payload);

    this.client.publish(topic, message, { qos }, (err) => {
      if (err) {
        this.logger.error(`Failed to publish to ${topic}: ${err.message}`);
      }
    });

    return true;
  }
}
