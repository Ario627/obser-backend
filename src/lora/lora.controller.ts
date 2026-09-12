import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { LoraService } from './lora.service';

const MAX_LIMIT = 100;

export class SendLoraDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(240)
  message!: string;
}

@Controller('lora')
export class LoraController {
  constructor(private readonly loraService: LoraService) {}

  @Post('send')
  @UseGuards(AuthGuard('jwt'))
  send(@Body() dto: SendLoraDto) {
    return this.loraService.sendMessage(dto.message);
  }

  @Get('messages')
  listMessages(
    @Query('page', new ParseIntPipe({ optional: true })) page: number = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 10,
  ) {
    return this.paginate(page, limit);
  }

  @Get('history')
  getHistory(
    @Query('page', new ParseIntPipe({ optional: true })) page: number = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 20,
  ) {
    return this.paginate(page, limit);
  }

  @Get(':id')
  async getMessage(@Param('id', ParseIntPipe) id: number) {
    const message = await this.loraService.getById(id);

    if (!message) {
      throw new NotFoundException(`LoRa message with ID ${id} not found`);
    }

    return message;
  }

  private async paginate(page: number, limit: number) {
    const safePage = Math.max(page, 1);
    const safeLimit = Math.min(Math.max(limit, 1), MAX_LIMIT);
    const offset = (safePage - 1) * safeLimit;

    const { items, total } = await this.loraService.getHistory(
      safeLimit,
      offset,
    );

    return { items, total, page: safePage, limit: safeLimit };
  }
}
