import { Injectable, Logger } from "@nestjs/common";
import { EventEmitter2, OnEvent } from "@nestjs/event-emitter";
import { EVENTS } from "src/common/constant/events.constant";
import { Repository } from "typeorm";
import { InjectRepository } from "@nestjs/typeorm";
import { LoraMessage } from "src/database/entities/lora-message.entity";
import type {
  LoraReceivedPayload,
  LoraSendPayload,
  ParsedLoraMessage,
} from '../common/types';

@Injectable()
export class LoraService {
  private readonly logger = new Logger(LoraService.name);

  constructor(
    private readonly eventEmitter: EventEmitter2,
    @InjectRepository(LoraMessage)
    private readonly loraMessageRepos: Repository<LoraMessage>,
  ) {}

  parseLoraMessage(
    raw: string,
  ): ParsedLoraMessage {
    return {
      type: 'text',
      content: raw,
    };
  }

  @OnEvent(EVENTS.lora.MESSAGE_RECEIVED)
  async handleInboundMessage(payload: LoraReceivedPayload) {
    try {
      const parsed = this.parseLoraMessage(payload.message);
      this.logger.debug(
        `LoRa inbound: "${parsed.content}" (RSSI: ${payload.rssi}, SNR: ${payload.snr})`,
      );

      const entity = this.loraMessageRepos.create({
        direction: 'inbound',
        message: payload.message,
        rssi: payload.rssi,
        snr: payload.snr,
      });

      const saved = await this.loraMessageRepos.save(entity);

      this.eventEmitter.emit(EVENTS.lora.MESSAGE_RECEIVED + ':broadcast', {
        id: saved.id,
        direction: 'inbound',
        message: saved.message,
        rssi: saved.rssi,
        snr: saved.snr,
        timestamp: saved.timestamp,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to handle inbound LoRa message: ${message}`);
    }
  }

  @OnEvent(EVENTS.lora.SEND_REQUESTED)
  async handleSendRequest(payload: { message: string }) {
    try {
      this.logger.debug(`LoRa outbound: "${payload.message}"`);

      const entity = this.loraMessageRepos.create({
        direction: 'outbound',
        message: payload.message,
        rssi: null,
        snr: null,
      });

      const saved = await this.loraMessageRepos.save(entity);

      const sendPayload: LoraSendPayload = {
        message: payload.message,
        timestamp: new Date().toISOString(),
      };

      this.eventEmitter.emit(EVENTS.lora.MESSAGE_QUEUED, sendPayload);

      this.eventEmitter.emit(EVENTS.lora.MESSAGE_RECEIVED + ':broadcast', {
        id: saved.id,
        direction: 'outbound',
        message: saved.message,
        rssi: null,
        snr: null,
        timestamp: saved.timestamp,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to process outbound LoRa message: ${message}`);
    }
  }

  async getHistory(
    limit: number,
    offset: number,
  ): Promise<{
    items: LoraMessage[];
    total: number;
  }> {
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
}