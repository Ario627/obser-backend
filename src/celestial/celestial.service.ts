import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { firstValueFrom, catchError, timeout } from 'rxjs';
import { TrackingLog } from 'src/database/entities/tracking-log.entity';
import { EVENTS } from 'src/common/constant/events.constant';
import {
  CelestialType,
  TrackTarget,
  CelestialPosition,
  CelestialUpdatePayload,
  ServoCommandPayload,
  PassInfo,
  CaptureTriggerPayload,
  SatelliteDiscoveryResult,
} from '../common/types';
import {
  AstroServiceResponse,
  PollingState,
  PassAlertThreshold,
  ServoConversionResult,
  TrackingLogEntry,
} from './celestial.types';

@Injectable()
export class CelestialService {
  private readonly logger = new Logger(CelestialService.name);
  private readonly state: PollingState;
  private readonly passAlert: PassAlertThreshold;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly eventEmitter: EventEmitter2,
    @InjectRepository(TrackingLog)
    private readonly trackingLogRepo: Repository<TrackingLog>,
  ) {
    this.state = {
      isPolling: false,
      lastPollTime: null,
      lastSuccessTime: null,
      consecutiveErrors: 0,
      activeTarget: { type: CelestialType.ISS, id: 'iss' },
    };

    this.passAlert = {
      minutesBeforePass: 15,
      hasAlerted: false,
      alertedPassKey: null,
    };
  }

  getActiveTarget(): TrackTarget {
    return { ...this.state.activeTarget };
  }

  setActiveTarget(target: TrackTarget): void {
    this.state.activeTarget = target;
    this.passAlert.hasAlerted = false;
    this.passAlert.alertedPassKey = null;
    this.logger.log(`Active target changed to: ${target.type}/${target.id}`);
  }

  private async fetchFromPythonService(): Promise<CelestialPosition | null> {

    const baseUrl = this.configService.get<string>('astro.serviceUrl');
    const target = this.state.activeTarget;
    const url = `${baseUrl}/celestial/${target.type}/${target.id}`;

    try {
        const response = await firstValueFrom(
            this.httpService.get<AstroServiceResponse>(url).pipe(
              timeout(4000),
                catchError((err) => {
                    throw err;
                }),  
            ),
        );

        const data = response.data;

        return {
            name: data.name,
            type: this.mapType(data.type),
            azimuth: data.azimuth,
            altitude: data.altitude,
            distanceKm: data.distance_km ?? null,
            isVisible: data.is_visible,
            illuminated: data.illuminated ?? null,
            angularRate: data.angular_rate ?? null,
            nextAos: data.next_aos ?? null,
            nextLos: data.next_los ?? null,
            passDuration: data.pass_duration ?? null,
            maxAltitude: data.max_altitude ?? null,
            timestamp: data.timestamp || new Date().toISOString(),
        };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to fetch from Python service: ${message}`);
      throw error;
    }
  }

  private mapType(type: string): CelestialType {
    const typeMap: Record<string, CelestialType> = {
      iss: CelestialType.ISS,
      satellite: CelestialType.SATELLITE,
      planet: CelestialType.PLANET,
      moon: CelestialType.MOON,
      sun: CelestialType.SUN,
      star: CelestialType.STAR,
    };
    return typeMap[type.toLowerCase()] || CelestialType.SATELLITE;
  }

  
  async pollAndProcess(): Promise<void> {
    if (this.state.isPolling) {
      this.logger.debug('Previous poll still running, skipping this cycle');
      return;
    }

    this.state.isPolling = true;
    this.state.lastPollTime = Date.now();

    try {
      const position = await this.fetchFromPythonService();

      if (!position) return;

      const servo = this.convertToServoAngles(position);
      const updatePayload = this.buildUpdatePayload(position, servo);

      await this.saveTrackingLog(position, servo);

      this.eventEmitter.emit(EVENTS.celestial.POSITION_UPDATED, updatePayload);

      const servoPayload: ServoCommandPayload = {
        azimuth: servo.azimuth,
        altitude: servo.altitude,
        speed: servo.speed,
      };
      this.eventEmitter.emit(EVENTS.servo.COMMAND_READY, servoPayload);

      this.checkPassAlert(position);
      this.checkAutoCapture(position);

      this.state.lastSuccessTime = Date.now();
      this.state.consecutiveErrors = 0;
    } catch (error) {
      this.state.consecutiveErrors++;
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Poll failed (${this.state.consecutiveErrors} consecutive): ${message}`,
      );
      this.eventEmitter.emit(EVENTS.celestial.ERROR, { message });
    } finally {
      this.state.isPolling = false;
    }
  }


  private checkAutoCapture(position: CelestialPosition): void {
    if (position.isVisible && position.altitude > 10) {
      const payload: CaptureTriggerPayload = {
        reason: 'auto',
        objectName: position.name,
        azimuth: position.azimuth,
        altitude: position.altitude,
        timestamp: new Date().toISOString(),
      };

      this.eventEmitter.emit(EVENTS.capture.TRIGGER_REQUESTED, payload);
    }
  }


  async discoverUpcomingPasses(
    hours: number,
  ): Promise<SatelliteDiscoveryResult[]> {
    return [];
  }


  private convertToServoAngles(position: CelestialPosition): ServoConversionResult {
    const azimuth = this.azimuthToServo(position.azimuth);
    const altitude = this.altitudeToServo(position.altitude);
    const speed = this.getServoSpeed(position.angularRate ?? null);

    return { azimuth, altitude, speed };
  }

  azimuthToServo(az: number): number {
    const clamped = Math.max(0, Math.min(360, az));
    return Math.round((clamped / 360) * 180);
  }

  altitudeToServo(alt: number): number {
    const clamped = Math.max(-90, Math.min(90, alt));
    return Math.round(clamped + 90);
  }

  getServoSpeed(rate: number | null): 'slow' | 'normal' | 'fast' {
    if (rate === null || rate === undefined) return 'normal';
    if (Math.abs(rate) > 0.5) return 'fast';
    if (Math.abs(rate) < 0.1) return 'slow';
    return 'normal';
  }

  private async saveTrackingLog(
    position: CelestialPosition,
    servo: ServoConversionResult,
  ): Promise<void> {
    try {
      const entry: TrackingLogEntry = {
        objectName: position.name,
        objectType: position.type,
        azimuth: position.azimuth,
        altitude: position.altitude,
        distanceKm: position.distanceKm,
        isVisible: position.isVisible,
        illuminated: position.illuminated,
        servoAzimuth: servo.azimuth,
        servoAltitude: servo.altitude,
        angularRate: position.angularRate,
      };

      await this.trackingLogRepo.save(entry);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to save tracking log: ${message}`);
    }
  }

   private buildUpdatePayload(
    position: CelestialPosition,
    servo: ServoConversionResult,
  ): CelestialUpdatePayload {
    return {
      name: position.name,
      type: position.type,
      azimuth: position.azimuth,
      altitude: position.altitude,
      distanceKm: position.distanceKm,
      isVisible: position.isVisible,
      illuminated: position.illuminated,
      servoAzimuth: servo.azimuth,
      servoAltitude: servo.altitude,
      angularRate: position.angularRate,
      timestamp: position.timestamp,
    };
  }

  private checkPassAlert(position: CelestialPosition): void {
    if (!position.nextAos) {
      this.passAlert.hasAlerted = false;
      this.passAlert.alertedPassKey = null;
      return;
    }

    const nextAosTime = new Date(position.nextAos).getTime();
    const now = Date.now();
    const minutesUntilPass = (nextAosTime - now) / (1000 * 60);

    const passKey = `${position.name}_${position.nextAos}`;

    if (this.passAlert.alertedPassKey !== passKey) {
      this.passAlert.hasAlerted = false;
    }

    if (
      minutesUntilPass > 0 &&
      minutesUntilPass <= this.passAlert.minutesBeforePass &&
      !this.passAlert.hasAlerted
    ) {
      const passInfo: PassInfo = {
        objectName: position.name,
        nextAos: position.nextAos,
        nextLos: position.nextLos,
        duration: position.passDuration,
        maxAltitude: position.maxAltitude,
      };

      this.eventEmitter.emit(EVENTS.pass.ALERT_TRIGGERED, passInfo);

      this.passAlert.hasAlerted = true;
      this.passAlert.alertedPassKey = passKey;

      this.logger.log(
        `Pass alert triggered for ${position.name} in ${minutesUntilPass.toFixed(1)} min`,
      );
    }
  }
}