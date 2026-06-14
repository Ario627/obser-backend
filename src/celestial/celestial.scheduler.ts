import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SchedulerRegistry } from '@nestjs/schedule';
import { OnEvent } from "@nestjs/event-emitter";
import {CelestialService} from "./celestial.service";
import {EVENTS} from "src/common/constant/events.constant";
import * as types from "src/common/types";

const POLL_INTERVAL_NAME = 'celestial_poll';

@Injectable()
export class CelestialScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CelestialScheduler.name);

  constructor(
    private readonly celestialService: CelestialService,
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  onModuleInit() {
    const intervalMs = this.configService.get<number>(
      'astro.pollIntervalMs',
      5000,
    );
    this.startPolling(intervalMs);
  }

  onModuleDestroy() {
    this.stopPolling();
  }

  private startPolling(intervalMs: number): void {
    const callback = () => this.celestialService.pollAndProcess();
    const interval = setInterval(callback, intervalMs);
    this.schedulerRegistry.addInterval(POLL_INTERVAL_NAME, interval);
    this.logger.log(`Celestial polling started (interval: ${intervalMs}ms)`);
  }

  private stopPolling(): void {
    if (this.schedulerRegistry.doesExist('interval', POLL_INTERVAL_NAME)) {
      this.schedulerRegistry.deleteInterval(POLL_INTERVAL_NAME);
      this.logger.log('Celestial polling stopped');
    }
  }

  @OnEvent(EVENTS.target.CHANGED)
  handleTargetChanged(payload: types.TrackTarget) {
    this.logger.log(`Target changed to: ${payload.type}/${payload.id}`);
    this.celestialService.setActiveTarget(payload);
  }
}