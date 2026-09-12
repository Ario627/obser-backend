import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TimeoutError, firstValueFrom, timeout } from 'rxjs';
import axios from 'axios';
import { TrackingLog } from '../database/entities/tracking-log.entity';
import { EVENTS } from '../common/constant/events.constant';
import {
  CelestialType,
  type CelestialPosition,
  type CelestialUpdatePayload,
  type CaptureTriggerPayload,
  type ManualServoPayload,
  type ObjectsCatalog,
  type PassInfo,
  type ServoCommandPayload,
  type ServoSpeed,
  type ServoSource,
  type TrackTarget,
} from '../common/types';
import type {
  AstroErrorResponse,
  AstroObjectsResponse,
  AstroPassResponse,
  AstroPositionResponse,
  PassAlertThreshold,
  PassCacheEntry,
  PollingState,
  ServoConversionResult,
} from './celestial.types';

export interface CelestialErrorPayload {
  message: string;
  consecutiveErrors: number;
  target: TrackTarget;
}

const PASS_REFRESH_MS = 60_000;
const CATALOG_REFRESH_MS = 300_000;
const MANUAL_OVERRIDE_MS = 30_000;
const SERVO_MAX_ANGLE = 180;
const MIN_ALTITUDE_DEGREES = -90;
const MAX_ALTITUDE_DEGREES = 90;
const RATE_FAST_THRESHOLD = 0.5;
const RATE_SLOW_THRESHOLD = 0.1;
const MAX_TARGET_ID_LENGTH = 64;
const ISS_NAME_PATTERN = /^iss\b|zarya/i;
const TARGET_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const normalizeAzimuth = (azimuth: number): number =>
  ((azimuth % 360) + 360) % 360;

const toOptionalNumber = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const toFiniteNumber = (
  value: number | null | undefined,
  fallback: number,
): number => toOptionalNumber(value) ?? fallback;

@Injectable()
export class CelestialService {
  private readonly logger = new Logger(CelestialService.name);
  private readonly astroBaseUrl: string;
  private readonly requestTimeoutMs: number;
  private readonly captureMinAltitude: number;
  private readonly state: PollingState;
  private readonly passAlert: PassAlertThreshold;
  private readonly passCache = new Map<string, PassCacheEntry>();
  private readonly passFetches = new Map<string, Promise<PassInfo | null>>();
  private catalog: { value: ObjectsCatalog; fetchedAt: number } | null = null;
  private catalogFetch: Promise<ObjectsCatalog> | null = null;
  private lastUpdate: CelestialUpdatePayload | null = null;
  private manualOverrideUntil = 0;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly eventEmitter: EventEmitter2,
    @InjectRepository(TrackingLog)
    private readonly trackingLogRepo: Repository<TrackingLog>,
  ) {
    this.astroBaseUrl = this.configService.get<string>(
      'astro.serviceUrl',
      'http://localhost:8000',
    );
    this.requestTimeoutMs = this.configService.get<number>(
      'astro.requestTimeoutMs',
      4_000,
    );
    this.captureMinAltitude = this.configService.get<number>(
      'capture.minAltitude',
      10,
    );

    this.state = {
      isPolling: false,
      lastPollTime: null,
      lastSuccessTime: null,
      consecutiveErrors: 0,
      activeTarget: { type: CelestialType.ISS, id: 'iss' },
    };

    this.passAlert = {
      minutesBeforePass: this.configService.get<number>(
        'astro.passAlertMinutes',
        15,
      ),
      hasAlerted: false,
      alertedPassKey: null,
    };
  }

  getActiveTarget(): TrackTarget {
    return { ...this.state.activeTarget };
  }

  setActiveTarget(target: TrackTarget): void {
    const id = this.normalizeTargetId(target.id);

    if (
      this.state.activeTarget.type === target.type &&
      this.state.activeTarget.id === id
    ) {
      return;
    }

    this.state.activeTarget = { type: target.type, id };
    this.passAlert.hasAlerted = false;
    this.passAlert.alertedPassKey = null;
    this.manualOverrideUntil = 0;

    this.eventEmitter.emit(EVENTS.target.CHANGED, {
      type: target.type,
      id,
    });

    this.logger.log(`Active target -> ${target.type}/${id}`);
  }

  getLastUpdate(): CelestialUpdatePayload | null {
    return this.lastUpdate === null ? null : { ...this.lastUpdate };
  }

  isManualOverrideActive(): boolean {
    return Date.now() < this.manualOverrideUntil;
  }

  applyManualServo(payload: ManualServoPayload): ServoCommandPayload {
    const azimuth = Number(payload?.azimuth);
    const altitude = Number(payload?.altitude);

    if (!Number.isFinite(azimuth) || !Number.isFinite(altitude)) {
      throw new BadRequestException(
        'Manual servo command requires numeric azimuth and altitude',
      );
    }

    const servo: ServoConversionResult = {
      azimuth: Math.round(clamp(azimuth, 0, SERVO_MAX_ANGLE)),
      altitude: Math.round(clamp(altitude, 0, SERVO_MAX_ANGLE)),
      speed: 'normal',
    };

    this.manualOverrideUntil = Date.now() + MANUAL_OVERRIDE_MS;
    this.logger.log(
      `Manual servo override -> az=${servo.azimuth} alt=${servo.altitude}`,
    );

    return this.emitServoCommand(servo, 'manual');
  }

  async getPosition(target: TrackTarget): Promise<CelestialPosition> {
    const id = this.normalizeTargetId(target.id);
    const resolved: TrackTarget = { type: target.type, id };
    const path = this.buildPositionPath(resolved);

    const astro = await this.request<AstroPositionResponse>(path);
    const pass = await this.getPass(resolved);

    return this.toPosition(astro, pass, resolved);
  }

  async pollAndProcess(): Promise<void> {
    if (this.state.isPolling) {
      this.logger.debug('Previous poll still in flight, skipping cycle');
      return;
    }

    this.state.isPolling = true;
    this.state.lastPollTime = Date.now();

    const target: TrackTarget = { ...this.state.activeTarget };

    try {
      const astro = await this.request<AstroPositionResponse>(
        this.buildPositionPath(target),
      );
      const pass = await this.getPass(target);
      const position = this.toPosition(astro, pass, target);
      const servo = this.convertToServoAngles(position);
      const update = this.buildUpdatePayload(position, servo);

      this.lastUpdate = update;
      this.state.lastSuccessTime = Date.now();
      this.state.consecutiveErrors = 0;

      this.eventEmitter.emit(EVENTS.celestial.POSITION_UPDATED, update);

      if (this.isManualOverrideActive()) {
        this.logger.debug('Auto servo command suppressed: manual override');
      } else {
        this.emitServoCommand(servo, 'auto');
      }

      void this.saveTrackingLog(position, servo);

      this.checkPassAlert(position);
      this.checkAutoCapture(position);
    } catch (error) {
      this.state.consecutiveErrors += 1;

      const message = this.describeFailure(
        error,
        this.buildPositionPath(target),
      );

      this.logger.error(
        `Poll failed (${this.state.consecutiveErrors}x): ${message}`,
      );

      const payload: CelestialErrorPayload = {
        message,
        consecutiveErrors: this.state.consecutiveErrors,
        target,
      };

      this.eventEmitter.emit(EVENTS.celestial.ERROR, payload);
    } finally {
      this.state.isPolling = false;
    }
  }

  async getCatalog(): Promise<ObjectsCatalog> {
    const cached = this.catalog;

    if (cached && Date.now() - cached.fetchedAt < CATALOG_REFRESH_MS) {
      return cached.value;
    }

    if (this.catalogFetch) {
      return this.catalogFetch;
    }

    const fetch = this.loadCatalog()
      .then((value) => {
        this.catalog = { value, fetchedAt: Date.now() };
        return value;
      })
      .finally(() => {
        this.catalogFetch = null;
      });

    this.catalogFetch = fetch;

    return fetch;
  }

  azimuthToServo(azimuth: number): number {
    return Math.round((normalizeAzimuth(azimuth) / 360) * SERVO_MAX_ANGLE);
  }

  altitudeToServo(altitude: number): number {
    return Math.round(
      clamp(altitude, MIN_ALTITUDE_DEGREES, MAX_ALTITUDE_DEGREES) + 90,
    );
  }

  getServoSpeed(
    azimuthRate: number | null,
    altitudeRate: number | null,
  ): ServoSpeed {
    const magnitude = Math.max(
      Math.abs(azimuthRate ?? 0),
      Math.abs(altitudeRate ?? 0),
    );

    if (magnitude >= RATE_FAST_THRESHOLD) return 'fast';
    if (magnitude <= RATE_SLOW_THRESHOLD) return 'slow';
    return 'normal';
  }

  private convertToServoAngles(
    position: CelestialPosition,
  ): ServoConversionResult {
    return {
      azimuth: this.azimuthToServo(position.azimuth),
      altitude: this.altitudeToServo(position.altitude),
      speed: this.getServoSpeed(position.azimuthRate, position.altitudeRate),
    };
  }

  private emitServoCommand(
    servo: ServoConversionResult,
    source: ServoSource,
  ): ServoCommandPayload {
    const payload: ServoCommandPayload = {
      azimuth: servo.azimuth,
      altitude: servo.altitude,
      speed: servo.speed,
      source,
    };

    this.eventEmitter.emit(EVENTS.servo.COMMAND_READY, payload);

    return payload;
  }

  private buildUpdatePayload(
    position: CelestialPosition,
    servo: ServoConversionResult,
  ): CelestialUpdatePayload {
    return {
      ...position,
      servoAzimuth: servo.azimuth,
      servoAltitude: servo.altitude,
    };
  }

   async getPass(target: TrackTarget): Promise<PassInfo | null> {
    const path = this.buildPassPath(target);

    if (path === null) return null;

    const cached = this.passCache.get(path);

    if (cached && Date.now() - cached.fetchedAt < PASS_REFRESH_MS) {
      return cached.pass;
    }

    const inFlight = this.passFetches.get(path);

    if (inFlight) return inFlight;

    const fetch = this.loadPass(path)
      .then((pass) => {
        this.passCache.set(path, { pass, fetchedAt: Date.now() });
        return pass;
      })
      .finally(() => {
        this.passFetches.delete(path);
      });

    this.passFetches.set(path, fetch);

    return fetch;
  }

  private async loadPass(path: string): Promise<PassInfo | null> {
    try {
      const astro = await this.request<AstroPassResponse>(path);

      if (!astro?.next_aos || !astro.next_los) return null;

      return {
        objectName: astro.name?.trim() || this.state.activeTarget.id,
        nextAos: astro.next_aos,
        nextLos: astro.next_los,
        duration: toOptionalNumber(astro.duration_seconds),
        maxAltitude: toOptionalNumber(astro.max_altitude),
        aosAzimuth: toOptionalNumber(astro.aos_azimuth),
        losAzimuth: toOptionalNumber(astro.los_azimuth),
      };
    } catch (error) {
      this.logger.warn(
        `Pass lookup failed (${path}): ${this.describeFailure(error, path)}`,
      );
      return null;
    }
  }

  private async loadCatalog(): Promise<ObjectsCatalog> {
    try {
      const astro = await this.request<AstroObjectsResponse>('/objects');

      return {
        planets: [...(astro.planets ?? [])].sort(),
        stars: [...(astro.stars ?? [])].sort(),
        satellites: (astro.satellites ?? []).map((entry) => ({
          name: entry.name,
          noradId: entry.norad_id,
          endpoint: entry.endpoint,
        })),
      };
    } catch (error) {
      const message = this.describeFailure(error, '/objects');
      const stale = this.catalog?.value;

      if (stale) {
        this.logger.warn(`Catalog refresh failed, serving cached: ${message}`);
        return stale;
      }

      this.logger.error(`Catalog unavailable: ${message}`);

      throw new ServiceUnavailableException('Astro service is unavailable');
    }
  }

  private toPosition(
    astro: AstroPositionResponse,
    pass: PassInfo | null,
    target: TrackTarget,
  ): CelestialPosition {
    const azimuth = normalizeAzimuth(toFiniteNumber(astro.azimuth, 0));
    const altitude = clamp(
      toFiniteNumber(astro.altitude, 0),
      MIN_ALTITUDE_DEGREES,
      MAX_ALTITUDE_DEGREES,
    );

    return {
      name: astro.name?.trim() || target.id,
      type: this.resolveCelestialType(astro.type, astro.name),
      azimuth,
      altitude,
      distanceKm: toOptionalNumber(astro.distance_km),
      distanceAu: toOptionalNumber(astro.distance_au),
      azimuthRate: toOptionalNumber(astro.azimuth_rate),
      altitudeRate: toOptionalNumber(astro.altitude_rate),
      isVisible: astro.is_visible ?? altitude > 0,
      illuminated: astro.illuminated ?? null,
      nextAos: pass?.nextAos ?? null,
      nextLos: pass?.nextLos ?? null,
      passDuration: pass?.duration ?? null,
      maxAltitude: pass?.maxAltitude ?? null,
      aosAzimuth: pass?.aosAzimuth ?? null,
      losAzimuth: pass?.losAzimuth ?? null,
      timestamp: astro.timestamp?.trim() || new Date().toISOString(),
    };
  }

  private resolveCelestialType(rawType: string, name: string): CelestialType {
    switch ((rawType ?? '').trim().toLowerCase()) {
      case 'iss':
        return CelestialType.ISS;
      case 'satellite':
        return ISS_NAME_PATTERN.test(name ?? '')
          ? CelestialType.ISS
          : CelestialType.SATELLITE;
      case 'planet':
        return CelestialType.PLANET;
      case 'moon':
        return CelestialType.MOON;
      case 'sun':
        return CelestialType.SUN;
      case 'star':
        return CelestialType.STAR;
      default:
        return CelestialType.SATELLITE;
    }
  }

  private buildPositionPath(target: TrackTarget): string {
    const id = encodeURIComponent(target.id);

    switch (target.type) {
      case CelestialType.ISS:
        return '/iss';
      case CelestialType.SATELLITE:
        return `/satellite/${id}`;
      case CelestialType.STAR:
        return `/star/${id}`;
      case CelestialType.PLANET:
      case CelestialType.MOON:
      case CelestialType.SUN:
        return `/solar/${id}`;
      default:
        throw new BadRequestException(
          `Unsupported target type: ${String(target.type)}`,
        );
    }
  }

  private buildPassPath(target: TrackTarget): string | null {
    switch (target.type) {
      case CelestialType.ISS:
        return '/iss/pass';
      case CelestialType.SATELLITE:
        return `/satellite/${encodeURIComponent(target.id)}/pass`;
      default:
        return null;
    }
  }

  private normalizeTargetId(id: string): string {
    const trimmed = typeof id === 'string' ? id.trim() : '';

    if (
      trimmed.length === 0 ||
      trimmed.length > MAX_TARGET_ID_LENGTH ||
      !TARGET_ID_PATTERN.test(trimmed)
    ) {
      throw new BadRequestException(`Invalid target id: ${JSON.stringify(id)}`);
    }

    return trimmed;
  }

  private async request<T>(path: string): Promise<T> {
    const response = await firstValueFrom(
      this.httpService
        .get<T>(`${this.astroBaseUrl}${path}`)
        .pipe(timeout(this.requestTimeoutMs)),
    );

    return response.data;
  }

  private describeFailure(error: unknown, path: string): string {
    if (error instanceof TimeoutError) {
      return `Astro service timed out after ${this.requestTimeoutMs}ms (${path})`;
    }

    if (axios.isAxiosError<AstroErrorResponse>(error)) {
      const status = error.response?.status;
      const detail = error.response?.data?.detail;

      if (status === 404) {
        return detail ?? `Astro service has no data for ${path}`;
      }

      if (status) {
        return detail ?? `Astro service responded ${status} for ${path}`;
      }

      if (error.code === 'ECONNREFUSED') {
        return `Astro service refused connection (${this.astroBaseUrl})`;
      }

      return `Astro service unreachable (${error.code ?? error.message})`;
    }

    return error instanceof Error ? error.message : String(error);
  }

  private async saveTrackingLog(
    position: CelestialPosition,
    servo: ServoConversionResult,
  ): Promise<void> {
    try {
      await this.trackingLogRepo.save(
        this.trackingLogRepo.create({
          objectName: position.name,
          objectType: position.type,
          azimuth: position.azimuth,
          altitude: position.altitude,
          distanceKm: position.distanceKm,
          isVisible: position.isVisible,
          illuminated: position.illuminated,
          servoAzimuth: servo.azimuth,
          servoAltitude: servo.altitude,
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to persist tracking log: ${message}`);
    }
  }

  private checkPassAlert(position: CelestialPosition): void {
    if (!position.nextAos) {
      this.passAlert.hasAlerted = false;
      this.passAlert.alertedPassKey = null;
      return;
    }

    const passKey = `${position.name}|${position.nextAos}`;

    if (this.passAlert.alertedPassKey !== passKey) {
      this.passAlert.hasAlerted = false;
    }

    const minutesUntilPass =
      (Date.parse(position.nextAos) - Date.now()) / 60_000;

    if (!Number.isFinite(minutesUntilPass) || minutesUntilPass <= 0) return;
    if (minutesUntilPass > this.passAlert.minutesBeforePass) return;
    if (this.passAlert.hasAlerted) return;

    const passInfo: PassInfo = {
      objectName: position.name,
      nextAos: position.nextAos,
      nextLos: position.nextLos,
      duration: position.passDuration,
      maxAltitude: position.maxAltitude,
      aosAzimuth: position.aosAzimuth,
      losAzimuth: position.losAzimuth,
    };

    this.eventEmitter.emit(EVENTS.pass.ALERT_TRIGGERED, passInfo);

    this.passAlert.hasAlerted = true;
    this.passAlert.alertedPassKey = passKey;

    this.logger.log(
      `Pass alert: ${position.name} AOS in ${minutesUntilPass.toFixed(1)} min`,
    );
  }

  private checkAutoCapture(position: CelestialPosition): void {
    if (!position.isVisible) return;
    if (position.altitude < this.captureMinAltitude) return;

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
