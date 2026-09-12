import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  ParseEnumPipe,
  NotFoundException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CelestialType, type ObjectsCatalog, type TrackTarget } from 'src/common/types';
import { TrackTargetDto } from './dto/track-target.dto';
import { CelestialResponseDto } from './dto/celestial-response.dto';
import { PassInfoDto } from './dto/pass-info.dto';
import { CelestialService } from './celestial.service';

@Controller('celestial')
export class CelestialController {
  constructor(private readonly celestialService: CelestialService) {}

  @Get('objects')
  getObjects(): Promise<ObjectsCatalog> {
    return this.celestialService.getCatalog();
  }

  @Get('target')
  getActive(): TrackTarget {
    return this.celestialService.getActiveTarget();
  }

  @Post('track')
  @UseGuards(AuthGuard('jwt'))
  changeTarget(@Body() dto: TrackTargetDto): TrackTarget {
    this.celestialService.setActiveTarget(dto);
    return this.celestialService.getActiveTarget();
  }

  @Get(':type/:id/pass')
  async getPass(
    @Param('type', new ParseEnumPipe(CelestialType)) type: CelestialType,
    @Param('id') id: string,
  ): Promise<PassInfoDto> {
    const pass = await this.celestialService.getPass({ type, id });

    if (!pass) throw new NotFoundException(`No upcoming pass for ${type}/${id}`);

    return {
      name: pass.objectName,
      nextAos: pass.nextAos,
      nextLos: pass.nextLos,
      durationSeconds: pass.duration,
      maxAltitude: pass.maxAltitude,
      aosAzimuth: pass.aosAzimuth,
      losAzimuth: pass.losAzimuth,
    };
  }

  @Get(':type/:id')
  async getCelestialPosition(
    @Param('type', new ParseEnumPipe(CelestialType)) type: CelestialType,
    @Param('id') id: string,
  ): Promise<CelestialResponseDto> {
    const position = await this.celestialService.getPosition({ type, id });

    return {
      name: position.name,
      type: position.type,
      azimuth: position.azimuth,
      altitude: position.altitude,
      distanceKm: position.distanceKm,
      distanceAu: position.distanceAu,
      isVisible: position.isVisible,
      illuminated: position.illuminated,
      servoAzimuth: this.celestialService.azimuthToServo(position.azimuth),
      servoAltitude: this.celestialService.altitudeToServo(position.altitude),
      azimuthRate: position.azimuthRate,
      altitudeRate: position.altitudeRate,
      angularRate: this.magnitude(position.azimuthRate, position.altitudeRate),
      timestamp: position.timestamp,
    };
  }

  private magnitude(
    azRate: number | null,
    altRate: number | null,
  ): number | null {
    if (azRate === null || altRate === null) return null;

    return Math.hypot(azRate ?? 0, altRate ?? 0);
  }
}