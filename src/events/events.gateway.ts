import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type {
  CaptureCompletedPayload,
  CelestialUpdatePayload,
  HardwareStatus,
  LoraMessagePayload,
  ManualServoPayload,
  MqttStatusPayload,
  PassInfo,
  ServoCommandPayload,
  TrackTarget,
} from '../common/types';
import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { Namespace, Socket } from 'socket.io';
import { EVENTS } from '../common/constant/events.constant';

export const WS_EVENTS = {
  celestial: 'celestial:update',
  hardware: 'hardware:update',
  pass: 'pass:alert',
  capture: 'capture:completed',
  lora: 'lora:message',
  mqtt: 'mqtt:status',
  target: 'target:changed',
  servo: 'servo:command',
  error: 'error',
  snapshot: 'snapshot',
} as const;

interface Snapshot {
  celestial: CelestialUpdatePayload | null;
  hardware: HardwareStatus | null;
  target: TrackTarget | null;
  mqttConnected: boolean;
  serverTime: string;
}

@WebSocketGateway({
  namespace: 'events',
  cors: { origin: '*', credentials: true },
  transports: ['websocket', 'polling'],
})
export class EventsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  private namespace!: Namespace;

  private celestial: CelestialUpdatePayload | null = null;
  private hardware: HardwareStatus | null = null;
  private target: TrackTarget | null = null;
  private mqttConnected = false;

  afterInit(): void {
    this.logger.log('WebSocket gateway ready on namespace /events');
  }

  handleConnection(client: Socket): void {
    this.logger.debug(`Client connected: ${client.id}`);

    client.emit(WS_EVENTS.snapshot, this.buildSnapshot());
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('ping')
  handlePing(): { serverTime: string } {
    return { serverTime: new Date().toISOString() };
  }

  @SubscribeMessage('servo:manual')
  handleManualServo(
    @MessageBody() payload: ManualServoPayload,
    @ConnectedSocket() client: Socket,
  ): void {
    client.emit(WS_EVENTS.error, {
      message: 'Manual servo requires authentication',
      code: 'AUTH_REQUIRED',
      status: 401,
      timestamp: new Date().toISOString(),
    });
  }

  @OnEvent(EVENTS.celestial.POSITION_UPDATED)
  onCelestial(payload: CelestialUpdatePayload): void {
    this.celestial = payload;
    this.namespace.emit(WS_EVENTS.celestial, payload);
  }

  @OnEvent(EVENTS.hardware.STATUS_BROADCAST)
  onHardware(payload: HardwareStatus & { isOnline: boolean }): void {
    this.hardware = payload;
    this.namespace.emit(WS_EVENTS.hardware, payload);
  }

  @OnEvent(EVENTS.pass.ALERT_TRIGGERED)
  onPass(payload: PassInfo): void {
    this.namespace.emit(WS_EVENTS.pass, payload);
  }

  @OnEvent(EVENTS.capture.COMPLETED)
  onCapture(payload: CaptureCompletedPayload): void {
    this.namespace.emit(WS_EVENTS.capture, payload);
  }

  @OnEvent(EVENTS.lora.MESSAGE_BROADCAST)
  onLora(payload: LoraMessagePayload): void {
    this.namespace.emit(WS_EVENTS.lora, payload);
  }

  @OnEvent(EVENTS.mqtt.STATUS_CHANGED)
  onMqtt(payload: MqttStatusPayload): void {
    this.mqttConnected = payload.connected;
    this.namespace.emit(WS_EVENTS.mqtt, payload);
  }

  @OnEvent(EVENTS.target.CHANGED)
  onTarget(payload: TrackTarget): void {
    this.target = payload;
    this.namespace.emit(WS_EVENTS.target, payload);
  }

  @OnEvent(EVENTS.servo.COMMAND_READY)
  onServo(payload: ServoCommandPayload): void {
    this.namespace.emit(WS_EVENTS.servo, payload);
  }

  @OnEvent(EVENTS.celestial.ERROR)
  onCelestialError(payload: { message: string }): void {
    this.namespace.emit(WS_EVENTS.error, {
      ...payload,
      code: 'CELESTIAL_ERROR',
      status: 502,
      timestamp: new Date().toISOString(),
    });

}

  private buildSnapshot(): Snapshot {
    return {
      celestial: this.celestial,
      hardware: this.hardware,
      target: this.target,
      mqttConnected: this.mqttConnected,
      serverTime: new Date().toISOString(),
    };
  }
}