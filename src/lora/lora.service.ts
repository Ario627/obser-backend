import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EVENTS } from '../common/constant/events.constant';
import { LoraMessage } from '../database/entities/lora-message.entity';
import type {
  LoraMessagePayload,
  LoraReceivedPayload,
  LoraSendPayload,
} from '../common/types';

const MAX_MESSAGE_LENGTH = 240;

@Injectable()
export class LoraService {
  private readonly logger = new Logger(LoraService.name);

  constructor(
    private readonly eventEmitter: EventEmitter2,
    @InjectRepository(LoraMessage)
    private readonly loraMessageRepos: Repository<LoraMessage>,
  ) {}

  @OnEvent(EVENTS.lora.MESSAGE_RECEIVED)
  async handleInbound(payload: LoraReceivedPayload): Promise<void> {
    try {
      this.logger.debug(
        `LoRa inbound: "${payload.message}" (RSSI: ${payload.rssi}, SNR: ${payload.snr})`,
      );

      const saved = await this.loraMessageRepos.save(
        this.loraMessageRepos.create({
          direction: 'inbound',
          message: payload.message,
          rssi: payload.rssi,
          snr: payload.snr,
        }),
      );

      this.broadcast(saved);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to handle inbound LoRa message: ${message}`);
    }
  }

  async sendMessage(message: string): Promise<LoraMessagePayload> {
    const trimmed = message.trim();

    if (trimmed.length === 0) {
      throw new BadRequestException('Message must not be empty');
    }

    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      throw new BadRequestException(
        `Message exceeds ${MAX_MESSAGE_LENGTH} characters`,
      );
    }

    const saved = await this.loraMessageRepos.save(
      this.loraMessageRepos.create({
        direction: 'outbound',
        message: trimmed,
        rssi: null,
        snr: null,
      }),
    );

    const sendPayload: LoraSendPayload = {
      message: trimmed,
      timestamp: new Date().toISOString(),
    };

    this.eventEmitter.emit(EVENTS.lora.MESSAGE_QUEUED, sendPayload);

    return this.broadcast(saved);
  }

  async getHistory(
    limit: number,
    offset: number,
  ): Promise<{ items: LoraMessage[]; total: number }> {
    const [items, total] = await this.loraMessageRepos.findAndCount({
      order: { timestamp: 'DESC' },
      take: limit,
      skip: offset,
    });

    return { items, total };
  }

  async getById(id: number): Promise<LoraMessage | null> {
    return this.loraMessageRepos.findOneBy({ id });
  }

  private broadcast(entity: LoraMessage): LoraMessagePayload {
    const payload: LoraMessagePayload = {
      id: entity.id,
      direction: entity.direction === 'outbound' ? 'outbound' : 'inbound',
      message: entity.message,
      rssi: entity.rssi,
      snr: entity.snr,
      timestamp:
        entity.timestamp instanceof Date
          ? entity.timestamp.toISOString()
          : String(entity.timestamp),
    };

    this.eventEmitter.emit(EVENTS.lora.MESSAGE_BROADCAST, payload);

    return payload;
  }
}
