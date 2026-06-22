import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { EVENTS } from 'src/common/constant/events.constant';
import * as types from 'src/common/types';

interface StoredStatus extends types.HardwareStatus {
  lastSeen: string;
  isOnline: boolean;
}

const HEARTBEAT_TIMEOUT_MS = 30000;
const HEARTBEAT_CHECK_INTERVAL_MS = 10000;

@Injectable()
export class HardwareService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HardwareService.name);
  private latestStatus: StoredStatus | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly eventEmitter: EventEmitter2) {}

  onModuleInit() {
    this.heartbeatTimer = setInterval(() => this.checkHeartbeat(), HEARTBEAT_CHECK_INTERVAL_MS);
    this.heartbeatTimer.unref();
  }

  onModuleDestroy() {
      if(this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }
  }

  @OnEvent(EVENTS.hardware.STATUS_UPDATED)
  handleStatusUpdate(payload: types.HardwareStatus) {
    const now = new Date().toISOString();   

    const updated: StoredStatus = {
        ...payload,
        lastSeen: now,
        isOnline: true,
    }

    const wasOffline = this.latestStatus !== null && !this.latestStatus.isOnline;

    this.latestStatus = updated;

    if(wasOffline) {
        this.logger.log('Device came back online');
    }

    this.logger.debug(
      `Hardware status updated: battery=${payload.batteryPercent}%, ` +
        `voltage=${payload.voltage}V, uptime=${payload.uptimeSeconds}s`,
    );

    this.eventEmitter.emit(
      EVENTS.hardware.STATUS_UPDATED + ':broadcast',
      updated,
    );
  }

  @OnEvent(EVENTS.device.CONNECTED)
  handleDeviceConnection(payload: {connected: boolean}) {
    if(!payload.connected) {
        if (this.latestStatus) {
            this.latestStatus.isOnline = false;
            this.logger.warn('Device disconnected (via LWT/status topic)');
            this.eventEmitter.emit(EVENTS.hardware.STATUS_UPDATED + ":broadcast", this.latestStatus);
        }
    } else {
        this.logger.log('Device connected (via LWT/status topic)');
    }
  }

  private checkHeartbeat() {
    if (!this.latestStatus) return;
    if (!this.latestStatus.isOnline) return;

    const lastSeenTime = new Date(this.latestStatus.lastSeen).getTime();
    const elapsed = Date.now() - lastSeenTime;

    if(elapsed > HEARTBEAT_TIMEOUT_MS) {
        this.latestStatus.isOnline = false;
        this.logger.warn(
          `Device heartbeat timeout: no update for ${(elapsed / 1000).toFixed(0)}s`,
        );

        this.eventEmitter.emit(EVENTS.hardware.STATUS_UPDATED + ":broadcast", this.latestStatus);

        this.eventEmitter.emit(EVENTS.device.CONNECTED, {connected: false});
    }
  }

  getStatus(): StoredStatus | null {
    return this.latestStatus ? {...this.latestStatus} : null;
  }

  isDeviceOnline(): boolean {
    return this.latestStatus?.isOnline ?? false;
  }
}
