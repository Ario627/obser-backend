import {
  Controller,
  Get,
  Param,
  Query,
  ParseIntPipe,
  NotFoundException,
} from '@nestjs/common';
import { LoraService } from './lora.service';


@Controller('lora')
export class LoraController {
  constructor(private readonly loraService: LoraService) {}

  @Get('messages')
  async listMessages(
    @Query('page', new ParseIntPipe({ optional: true })) page: number = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 10,
  ) {
    const clampedLimit = Math.min(Math.max(limit, 1), 100);
    const clampedPage = Math.max(page, 1);
    const offset = (clampedPage - 1) * clampedLimit;

    const { items, total } = await this.loraService.getHistory(
      clampedLimit,
      offset,
    );

    return {
      items,
      total,
      page: clampedPage,
      limit: clampedLimit,
    };
  }

  @Get('history')
  async getHistory(
    @Query('page', new ParseIntPipe({ optional: true })) page: number = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 20,
  ) {
    const clampedLimit = Math.min(Math.max(limit, 1), 100);
    const clampedPage = Math.max(page, 1);
    const offset = (clampedPage - 1) * clampedLimit;

    const { items, total } = await this.loraService.getHistory(
      clampedLimit,
      offset,
    );

    return {
      items,
      total,
      page: clampedPage,
      limit: clampedLimit,
    };
  }
  @Get(':id')
  async getMessage(@Param('id', ParseIntPipe) id: number) {
    const message = await this.loraService.getById(id);
    if (!message)
      throw new NotFoundException(`LoRa message with ID ${id} not found`);
    return message;
  }
}