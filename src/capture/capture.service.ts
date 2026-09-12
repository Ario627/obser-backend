import {
  Logger,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import type {
  CaptureCompletedPayload,
  CaptureResultPayload,
  CaptureTriggerPayload,
  PassInfo,
} from '../common/types';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createReadStream } from 'node:fs';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { Capture } from '../database/entities/capture.entity';
import { EVENTS } from '../common/constant/events.constant';
import { CaptureHistoryDto } from './dto/capture-history.dto';
import { CaptureResultDto } from './dto/capture-result.dto';

const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const BASE64_PREFIX = /^data:image\/\w+;base64,/;
const CAPTURE_TIMEOUT_MS = 30_000;

@Injectable()
export class CaptureService implements OnModuleInit {
  private readonly logger = new Logger(CaptureService.name);
  private readonly uploadPath: string;
  private readonly resolveUploadPath: string;
  private readonly cooldownMs: number;
  private readonly maxImageBytes: number;

  private lastCaptureTime: number = 0;
  private pending: CaptureTriggerPayload | null = null;

  constructor(
    @InjectRepository(Capture)
    private readonly catureRepo: Repository<Capture>,
    private readonly config: ConfigService,
    private readonly emitter: EventEmitter2,
  ) {
    this.uploadPath = this.config.get<string>(
      'upload.path',
      './uploads/captures',
    );
    this.cooldownMs = this.config.get<number>('capture.cooldownMs', 300_000);
    this.maxImageBytes = this.config.get<number>(
      'upload.maxImageBytes',
      2 * 1024 * 1024,
    );
    this.resolveUploadPath = resolve(this.uploadPath);
  }

  async onModuleInit() {
    await mkdir(this.resolveUploadPath, { recursive: true });
    this.logger.log(`Capture upload path: ${this.resolveUploadPath}`);
  }

  @OnEvent(EVENTS.capture.TRIGGER_REQUESTED)
  async onTriggerRequested(payload: CaptureTriggerPayload): Promise<void> {
    await this.processCapture(payload);
  }

  @OnEvent(EVENTS.pass.ALERT_TRIGGERED)
  async onPassAlert(payload: PassInfo): Promise<void> {
    await this.processCapture({
      reason: 'auto',
      objectName: payload.objectName,
      azimuth: payload.aosAzimuth ?? 0,
      altitude: payload.maxAltitude ?? 0,
      timestamp: new Date().toISOString(),
    });
  }

  @OnEvent(EVENTS.capture.RESULT_RECEIVED)
  async onResultReceived(payload: CaptureResultPayload): Promise<void> {
    const pending = this.pending;

    if (!pending) {
      this.logger.warn('Received capture result but no pending capture');
      return;
    }

    try {
      const image = this.decocedeBase64Image(payload.imageBase64);
      this.validateImage(image);

      const now = new Date();
      const filename = this.buildFilename(now, pending);
      const dateFolder = this.buildDateFolder(now);
      const relativePath = join(dateFolder, filename);
      const folder = this.resolveSavePath(dateFolder);

      await mkdir(folder, { recursive: true });
      await writeFile(join(folder, filename), image);

      const saved = await this.catureRepo.save(
        this.catureRepo.create({
          filename,
          filePath: relativePath,
          triggerReason: pending.reason,
          objectName: pending.objectName ?? null,
          azimuth: pending.azimuth ?? null,
          altitude: pending.altitude ?? null,
          fileSize: image.length,
          timestamp: now,
        }),
      );

      this.lastCaptureTime = Date.now();
      this.logger.log(`Capture saved: ${relativePath} (${image.length} bytes)`);

      const completed: CaptureCompletedPayload = {
        id: saved.id,
        filename: saved.filename,
        filePath: saved.filePath,
        triggerReason: pending.reason,
        objectName: saved.objectName,
        azimuth: saved.azimuth,
        altitude: saved.altitude,
        fileSize: saved.fileSize,
        timestamp: this.toIso(saved.timestamp),
      };

      this.emitter.emit(EVENTS.capture.COMPLETED, completed);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.error(`Capture processing failed: ${message}`);
      this.emitter.emit(EVENTS.capture.ERROR, { reason: message });
    } finally {
      this.pending = null;
    }
  }

  async requestCapture(): Promise<{ message: string }> {
    await this.processCapture({
      reason: 'manual',
      objectName: null,
      azimuth: null,
      altitude: null,
      timestamp: new Date().toISOString(),
    });
    return { message: 'Capture requested' };
  }

  async getHistory(page: number, limit = 20): Promise<CaptureHistoryDto> {
    const safePage = Math.max(page, 1);
    const safeLimit = Math.min(Math.max(limit, 1), 100);

    const [rows, total] = await this.catureRepo.findAndCount({
      order: { timestamp: 'DESC' },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    });

    return {
      items: rows.map((row) => this.toDto(row)),
      total,
      page: safePage,
      limit: safeLimit,
    };
  }

  async getImage(
    id: number,
  ): Promise<{
    stream: NodeJS.ReadableStream;
    mimeType: string;
    filename: string;
  }> {
    const capture = await this.catureRepo.findOne({ where: { id } });

    if (!capture) {
      throw new NotFoundException(`Capture #${id} not found`);
    }

    const absolutePath = this.resolveSavePath(capture.filePath);

    try {
      await access(absolutePath);
    } catch {
      throw new NotFoundException(`Image file missing: ${capture.filePath}`);
    }

    return {
      stream: createReadStream(absolutePath),
      mimeType: 'image/jpeg',
      filename: capture.filename,
    };
  }

  private decocedeBase64Image(raw: string): Buffer {
    if (typeof raw !== 'string' || raw.length === 0) {
      throw new Error('Invalid base64 image: empty string');
    }

    const image = Buffer.from(raw.replace(BASE64_PREFIX, ''), 'base64');

    if (image.length === 0) {
      throw new Error('Invalid base64 image: decoded buffer is empty');
    }

    return image;
  }

  private validateImage(image: Buffer): void {
    if (
      image.length < JPEG_MAGIC.length ||
      !JPEG_MAGIC.every((byte, index) => image[index] === byte)
    ) {
      throw new Error('Invalid image: not a JPEG file');
    }

    if (image.length > this.maxImageBytes)
      throw new Error(
        `Invalid image: exceeds max size of ${this.maxImageBytes} bytes`,
      );
  }

  private async processCapture(payload: CaptureTriggerPayload): Promise<void> {
    if (this.pending) {
      this.logger.warn('Capture already in progress');
      this.emitter.emit(EVENTS.capture.ERROR, {
        reason: 'Capture already in progress',
      });
      return;
    }

    if (payload.reason === 'auto') {
      const elased = Date.now() - this.lastCaptureTime;

      if (elased < this.cooldownMs) {
        this.logger.warn(
          `Capture request ignored due to cooldown (${elased}ms elapsed)`,
        );
        this.emitter.emit(EVENTS.capture.ERROR, {
          reason: 'Capture request ignored due to cooldown',
        });
        return;
      }
    }

    this.pending = payload;

    this.emitter.emit(EVENTS.capture.TRIGGER_ACCEPTED, payload);
    this.logger.log(`Capture triggered: reason=${payload.reason}`);
  }

  private buildDateFolder(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  private buildFilename(date: Date, pending: CaptureTriggerPayload): string {
    const time = [date.getHours(), date.getMinutes(), date.getSeconds()]
      .map((part) => String(part).padStart(2, '0'))
      .join('-');

    const object = (pending.objectName ?? 'unknown').replace(
      /[^a-zA-Z0-9_-]/g,
      '_',
    );

    return `${time}_${pending.reason}_${object}.jpg`;
  }

  private resolveSavePath(relativePath: string): string {
    const absolute = resolve(this.uploadPath, relativePath);
    const rel = relative(this.resolveUploadPath, absolute);

    if (
      rel.startsWith('..') ||
      resolve(this.resolveUploadPath, relativePath) !== absolute
    ) {
      throw new Error('Invalid relative path: outside of upload directory');
    }

    return absolute;
  }

  private toDto(entity: Capture): CaptureResultDto {
    const dto = new CaptureResultDto();

    dto.id = entity.id;
    dto.filename = entity.filename;
    dto.objectName = entity.objectName;
    dto.azimuth = entity.azimuth;
    dto.altitude = entity.altitude;
    dto.triggerReason = entity.triggerReason === 'manual' ? 'manual' : 'auto';
    dto.timestamp = entity.timestamp.toISOString();
    dto.imageUrl = `/captures/${entity.filename}`;
    return dto;
  }

  private toIso(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : String(value);
  }
}