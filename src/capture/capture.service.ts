import { Injectable, Logger, OnModuleInit, NotFoundException } from "@nestjs/common";
import { EventEmitter2, OnEvent } from "@nestjs/event-emitter";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ConfigService } from "@nestjs/config";
import { Capture } from "src/database/entities/capture.entity";
import { createReadStream } from "fs";
import { mkdir, writeFile, access, unlink } from "fs/promises";
import {join, relative, resolve} from "path";
import type {
  CaptureTriggerPayload,
  CaptureResultPayload,
  CaptureCompletedPayload,
  PassInfo,
} from '../common/types';
import { CaptureResultDto } from "./dto/capture-result.dto";
import { CaptureHistoryDto } from "./dto/capture-history.dto";
import { buffer } from "stream/consumers";

const JPEG = [0xff, 0xd8, 0xff];
const MAX_FILE_IMAGE = 2 * 1024 * 1024; // 2MB
const BASE64_PADDING = /^data:image\/\w+;base64,/;

@Injectable()
export class CaptureService implements OnModuleInit {
  private readonly logger = new Logger(CaptureService.name);
  private readonly uploadPath: string;
  private readonly cooldownMs: number;
  private readonly resolvedUploadPath: string;

  private lastCaptureTime = 0;
  private captureInProgress = false;

  private pendingReason: 'auto' | 'manual' = 'auto';
  private pendingObjectName: string | null = null;
  private pendingAzimuth: number | null = null;
  private pendingAltitude: number | null = null;

  constructor(
    @InjectRepository(Capture)
    private readonly captureRepo: Repository<Capture>,
    private readonly emitter: EventEmitter2,
    private readonly config: ConfigService,
  ) {
    this.uploadPath = this.config.get<string>(
      'upload.path',
      './uploads/captures',
    );
    this.cooldownMs = this.config.get<number>('capture.cooldownMs', 30000);
    this.resolvedUploadPath = resolve(this.uploadPath);
  }

  async onModuleInit(): Promise<void> {
    await mkdir(this.uploadPath, { recursive: true });
    this.logger.log(`Capture upload path: ${this.resolvedUploadPath}`);
  }

  @OnEvent('capture.trigger.requested')
  async onTriggerRequested(payload: CaptureTriggerPayload): Promise<void> {
    await this.processCapture(
      payload.reason,
      payload.objectName ?? null,
      payload.azimuth ?? null,
      payload.altitude ?? null,
    );
  }

  @OnEvent('capture.result.received')
  async onResultReceived(payload: CaptureResultPayload): Promise<void> {
    if (!this.captureInProgress) {
      this.logger.warn(
        'Capture result received but no capture in progress — ignored',
      );
      return;
    }

    try {
      const buffer = this.decodeBase64Image(payload.imageBase64);
      this.validateImage(buffer);

      const now = new Date();
      const filename = this.buildFilename(
        now,
        payload.triggerReason,
        this.pendingObjectName,
      );
      const dateFolder = this.buildDateFolder(now);
      const relativePath = join(dateFolder, filename);

      const absoluteFolder = this.resolveSafePath(dateFolder);
      await mkdir(absoluteFolder, { recursive: true });
      await writeFile(join(absoluteFolder, filename), buffer);

      const entity = this.captureRepo.create({
        filename,
        filePath: relativePath,
        triggerReason: payload.triggerReason,
        objectName: this.pendingObjectName,
        azimuth: this.pendingAzimuth,
        altitude: this.pendingAltitude,
        fileSize: buffer.length,
        timestamp: now,
      });

      const saved = await this.captureRepo.save(entity);

      this.lastCaptureTime = Date.now();
      this.logger.log(
        `Capture saved: ${relativePath} (${(buffer.length / 1024).toFixed(1)}KB)`,
      );

      const complited: CaptureCompletedPayload = {
        id: saved.id,
        filename: saved.filename,
        filePath: saved.filePath,
        triggerReason: saved.triggerReason as 'auto' | 'manual',
        objectName: saved.objectName,
        azimuth: saved.azimuth,
        altitude: saved.altitude,
        fileSize: saved.fileSize,
        timestamp:
          saved.timestamp instanceof Date
            ? saved.timestamp.toISOString()
            : saved.timestamp,
      };

      this.emitter.emit('capture.completed', complited);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Capture processing failed: ${message}`);
      this.emitter.emit('capture.error', { reason: message });
    } finally {
      this.resetState();
    }
  }

  @OnEvent('pass.alert.triggered')
  async onPassAlert(payload: PassInfo): Promise<void> {
    await this.processCapture(
      'auto',
      payload.objectName,
      null,
      payload.maxAltitude ?? null,
    );
  }


  //Public API
  async requestCapture(): Promise<{message: string}> {
    await this.processCapture('manual', null, null, null);
    return { message: 'Capture request sent' };
  }

  async getHistory(page = 1, limit = 20): Promise<CaptureHistoryDto> {
    const [rows, total] = await this.captureRepo.findAndCount({
      order: { timestamp: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items: rows.map((r) => this.toDto(r)),
      total,
      page,
      limit,
    }
  }


  async getImage(id: number): Promise<{stream: NodeJS.ReadableStream, mimeType: string, filename: string}> {
    const capture = await this.captureRepo.findOne({ where: { id } });
    if (!capture) {
      throw new NotFoundException(`Capture #${id} not found`);
    }

    const absolutePath = this.resolveSafePath(capture.filePath);

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

  //Internal
  private async processCapture(
    reason: 'auto' | 'manual',
    objectName: string | null,
    azimuth: number | null,
    altitude: number | null,
  ): Promise<void> {
    if (this.captureInProgress) {
      this.logger.warn('Capture already in progess');
      this.emitter.emit('capture.error', { reason: 'Capture in progress' });
    }

    if (reason === 'auto') {
      const elapsed = Date.now() - this.lastCaptureTime;
      if (elapsed < this.cooldownMs) {
        this.logger.debug(
          `Auto cacpture cooldown: ${Math.ceil((this.cooldownMs - elapsed) / 1000)}s remaining`,
        );
        return;
      }
    }

    this.captureInProgress = true;
    this.pendingReason = reason;
    this.pendingObjectName = objectName;
    this.pendingAzimuth = azimuth;
    this.pendingAltitude = altitude;

    this.emitter.emit('mqtt.publish.requested', {
      topic: 'observatory/capture/trigger',
      payload: { reason, timestamp: new Date().toISOString() },
    });

    this.logger.log(`Capture triggered: reason=${reason}`);
  }

  private decodeBase64Image(raw: string): Buffer {
    if (!raw || typeof raw !== 'string')
      throw new Error('Invalid image data: empty or non-string');

    const cleaned = raw.replace(BASE64_PADDING, '');
    const buffer = Buffer.from(cleaned, 'base64');

    if (buffer.length === 0)
      throw new Error('Image corrupted: base64 decode produced empty buffer');

    return buffer;
  }

  private validateImage(buffer: Buffer): void {
    if (buffer.length < 3 || !JPEG.every((b, i) => buffer[i] === b))
      throw new Error('Image corrupted: not a valid JPEG');

    if (buffer.length > MAX_FILE_IMAGE)
      throw new Error(
        `Image too large: ${buffer.length} bytes (max ${MAX_FILE_IMAGE})`,
      );
  }

  private buildDateFolder(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private buildFilename(
    d: Date,
    reason: string,
    objectName: string | null,
  ): string {
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    const safe = objectName
      ? objectName.replace(/[^a-zA-Z0-9_-]/g, '_')
      : 'unknown';
    return `${hh}-${mm}-${ss}_${reason}_${safe}.jpg`;
  }

  private resolveSafePath(subPath: string): string {
    const absolute = resolve(this.uploadPath, subPath);
    const rel = relative(this.resolvedUploadPath, absolute);

    if (
      rel.startsWith('..') ||
      resolve(this.resolvedUploadPath, subPath) !== absolute
    ) {
      throw new Error(`Path traversal blocked: ${subPath}`);
    }
    return absolute;
  }

  private resetState(): void {
    this.captureInProgress = false;
    this.pendingObjectName = null;
    this.pendingAzimuth = null;
    this.pendingAltitude = null;
  }

  private toDto(entity: Capture): CaptureResultDto {
    const dto = new CaptureResultDto();
    dto.id = entity.id;
    dto.filename = entity.filename;
    dto.objectName = entity.objectName;
    dto.azimuth = entity.azimuth;
    dto.altitude = entity.altitude;
    dto.triggerReason = entity.triggerReason;
    dto.timestamp =
      entity.timestamp instanceof Date
        ? entity.timestamp.toISOString()
        : String(entity.timestamp);
    dto.imageUrl = `/capture/${entity.id}/image`;
    return dto;
  }
}