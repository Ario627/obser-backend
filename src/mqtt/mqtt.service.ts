import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { randomUUID } from 'node:crypto';
import { connect } from 'mqtt';
import type { IClientPublishOptions, MqttClient } from 'mqtt';
import { EVENTS } from '../common/constant/events.constant';
import { MQTT_QOS, MQTT_TOPICS } from '../common/constant/mqtt-topics.constant';
import type {
  CaptureTriggerPayload,
  DeviceConnectionPayload,
  LoraSendPayload,
  MqttStatusPayload,
  ServoCommandPayload,
} from '../common/types';
import { MqttExplorer } from './mqtt.explorer';
import type { MqttQos } from './mqtt.explorer';

interface PublishOptions {
  queueWhenOffline?: boolean;
}

const MQTT_PROTOCOL_VERSION_3_1_1 = 4;
const SUBSCRIBE_LOG_SEPARATOR = '\n  - ';

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttService.name);
  private client: MqttClient | null = null;
  private connected = false;
  private subscribed = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly explorer: MqttExplorer,
  ) {}

  onModuleInit(): void {
    this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }

  isConnected(): boolean {
    return this.connected;
  }

  publish(
    topic: string,
    payload: object,
    qos: MqttQos,
    options: PublishOptions = {},
  ): boolean {
    const client = this.client;

    if (!client) {
      this.logger.warn(`Cannot publish to ${topic}: client not initialised`);
      return false;
    }

    if (!this.connected && !options.queueWhenOffline) {
      this.logger.debug(`Dropped ${topic}: broker offline`);
      return false;
    }

    const publishOptions: IClientPublishOptions = { qos, retain: false };

    client.publish(topic, JSON.stringify(payload), publishOptions, (error) => {
      if (error) {
        this.logger.error(`Failed to publish to ${topic}: ${error.message}`);
      }
    });

    return true;
  }

  @OnEvent(EVENTS.servo.COMMAND_READY)
  handleServoCommand(payload: ServoCommandPayload): void {
    this.publish(
      MQTT_TOPICS.publish.SERVO_COMMAND,
      { ...payload, timestamp: new Date().toISOString() },
      MQTT_QOS.SERVO_COMMAND,
    );
  }

  @OnEvent(EVENTS.lora.MESSAGE_QUEUED)
  handleLoraSend(payload: LoraSendPayload): void {
    this.publish(MQTT_TOPICS.publish.LORA_SEND, payload, MQTT_QOS.LORA_SEND, {
      queueWhenOffline: true,
    });
  }

  @OnEvent(EVENTS.capture.TRIGGER_ACCEPTED)
  handleCaptureTrigger(payload: CaptureTriggerPayload): void {
    this.publish(
      MQTT_TOPICS.publish.CAPTURE_TRIGGER,
      payload,
      MQTT_QOS.CAPTURE_TRIGGER,
    );
  }

  private connect(): void {
    const url = this.configService.get<string>(
      'mqtt.url',
      'mqtt://localhost:1883',
    );
    const prefix = this.configService.get<string>(
      'mqtt.clientIdPrefix',
      'nestjs-backend',
    );

    const client = connect(url, {
      clientId: `${prefix}-${randomUUID().slice(0, 8)}`,
      username: this.configService.get<string>('mqtt.username'),
      password: this.configService.get<string>('mqtt.password'),
      protocolVersion: MQTT_PROTOCOL_VERSION_3_1_1,
      clean: true,
      resubscribe: true,
      queueQoSZero: false,
      reconnectPeriod: this.configService.get<number>(
        'mqtt.reconnectPeriodMs',
        5_000,
      ),
      connectTimeout: this.configService.get<number>(
        'mqtt.connectTimeoutMs',
        10_000,
      ),
      keepalive: this.configService.get<number>('mqtt.keepaliveSeconds', 30),
    });

    this.client = client;

    client.on('connect', () => this.handleConnect());
    client.on('message', (topic, payload) =>
      this.explorer.handleMessage(topic, payload),
    );
    client.on('reconnect', () => this.logger.debug('Reconnecting to broker'));
    client.on('close', () => this.handleDisconnect('connection closed'));
    client.on('offline', () => this.handleDisconnect('client offline'));
    client.on('end', () => this.handleDisconnect('connection ended'));
    client.on('error', (error) =>
      this.logger.error(`MQTT error: ${error.message}`),
    );
  }

  private handleConnect(): void {
    this.connected = true;
    this.logger.log('Connected to MQTT broker');

    if (!this.subscribed) {
      this.subscribeAll();
    }

    const status: MqttStatusPayload = { connected: true };
    this.eventEmitter.emit(EVENTS.mqtt.STATUS_CHANGED, status);
  }

  private subscribeAll(): void {
    const client = this.client;

    if (!client) return;

    const subscriptions = this.explorer.getSubscriptions();
    const topics = Object.keys(subscriptions);

    this.subscribed = true;

    client.subscribe(subscriptions, (error, granted) => {
      if (error) {
        this.subscribed = false;
        this.logger.error(`Failed to subscribe: ${error.message}`);
        return;
      }

      this.logger.log(
        `Subscribed to ${granted?.length ?? 0} topic(s):${SUBSCRIBE_LOG_SEPARATOR}${topics.join(SUBSCRIBE_LOG_SEPARATOR)}`,
      );
    });
  }

  private handleDisconnect(reason: string): void {
    if (!this.connected) return;

    this.connected = false;
    this.logger.warn(`Disconnected from MQTT broker (${reason})`);

    const mqttStatus: MqttStatusPayload = { connected: false };
    this.eventEmitter.emit(EVENTS.mqtt.STATUS_CHANGED, mqttStatus);

    const deviceStatus: DeviceConnectionPayload = { connected: false };
    this.eventEmitter.emit(EVENTS.device.CONNECTED, deviceStatus);
  }

  private async disconnect(): Promise<void> {
    const client = this.client;

    this.client = null;
    this.connected = false;
    this.subscribed = false;

    if (!client) return;

    try {
      await client.endAsync(true);
      this.logger.log('MQTT client closed');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to close MQTT client: ${message}`);
    }
  }
}
