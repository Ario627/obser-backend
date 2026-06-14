import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  ParseEnumPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CelestialService } from './celestial.service';
import { TrackTargetDto } from './dto/track-target.dto';
import { CelestialResponseDto } from './dto/celestial-response.dto';
import { CelestialType } from '../common/types';

@Controller('celestial')
export class CelestialController {
  constructor(private readonly celestialService: CelestialService) {}

  @Get('target')
  getActiveTarget() {
    const target = this.celestialService.getActiveTarget();
    return {
      type: target.type,
      id: target.id,
    };
  }

  @Post('track')
  @UseGuards(AuthGuard('jwt'))
  changeTarget(@Body() dto: TrackTargetDto) {
    this.celestialService.setActiveTarget(dto);
    return {
      message: 'Target changed successfully',
      target: {
        type: dto.type,
        id: dto.id,
      },
    };
  }

  @Get(':type/:id')
  async getCelestialPosition(
    @Param('type', new ParseEnumPipe(CelestialType)) type: CelestialType,
    @Param('id') id: string,
  ): Promise<CelestialResponseDto> {
    const target = this.celestialService.getActiveTarget();

    if (target.type !== type || target.id !== id) {
      this.celestialService.setActiveTarget({ type, id });
    }

    return {
      name: id,
      type,
      azimuth: 0,
      altitude: 0,
      distanceKm: null,
      isVisible: false,
      illuminated: null,
      servoAzimuth: 0,
      servoAltitude: 0,
      angularRate: null,
      timestamp: new Date().toISOString(),
    };
  }
}