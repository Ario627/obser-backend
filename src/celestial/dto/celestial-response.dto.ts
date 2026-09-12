import {
  IsString,
  IsEnum,
  IsNumber,
  IsBoolean,
  IsOptional,
  IsISO8601,
  Min,
  Max,
} from 'class-validator';
import { CelestialType } from '../../common/types';

export class CelestialResponseDto {
  @IsString()
  name!: string;

  @IsEnum(CelestialType)
  type!: CelestialType;

  @IsNumber()
  @Min(0)
  @Max(360)
  azimuth!: number;

  @IsNumber()
  @Min(-90)
  @Max(90)
  altitude!: number;

  @IsNumber()
  @IsOptional()
  distanceKm!: number | null;

  @IsNumber()
  @IsOptional()
  distanceAu!: number | null;

  @IsBoolean()
  isVisible!: boolean;

  @IsBoolean()
  @IsOptional()
  illuminated!: boolean | null;

  @IsNumber()
  @Min(0)
  @Max(180)
  servoAzimuth!: number;

  @IsNumber()
  @Min(0)
  @Max(180)
  servoAltitude!: number;

  @IsNumber()
  @IsOptional()
  azimuthRate!: number | null;

  @IsNumber()
  @IsOptional()
  altitudeRate!: number | null;

  @IsNumber()
  @IsOptional()
  angularRate!: number | null;

  @IsISO8601()
  timestamp!: string;
}
