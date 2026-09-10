import {
  Controller,
  Get,
  Post,
  Param,
  ParseIntPipe,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CaptureService } from './capture.service';
import type { Response } from 'express';
import { CaptureHistoryDto } from './dto/capture-history.dto';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

@Controller('capture')
export class CaptureController {
  constructor(private readonly captureService: CaptureService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'))
  trigger(): Promise<{ message: string }> {
    return this.captureService.requestCapture();
  }

  @Get('history')
  history(
    @Query('page', new ParseIntPipe({ optional: true }))
    page: number = DEFAULT_PAGE,
    @Query('limit', new ParseIntPipe({ optional: true }))
    limit: number = DEFAULT_LIMIT,
  ): Promise<CaptureHistoryDto> {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), MAX_LIMIT);
    return this.captureService.getHistory(safePage, safeLimit);
  }

  @Get(':id/image')
  async image(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ): Promise<void> {
    const { stream, mimeType, filename } =
      await this.captureService.getImage(id);

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, max-age=604800, immutable');

    stream.pipe(res);
  }
}