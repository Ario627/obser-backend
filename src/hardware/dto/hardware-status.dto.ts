import {
  IsNumber,
  IsBoolean,
  IsOptional,
  IsISO8601,
  Min,
  Max,
} from 'class-validator';

export class HardwareStatusDto {
  @IsNumber()
  @Min(0)
  @Max(100)
  batteryPercent!: number;

  @IsNumber()
  voltage!: number;

  @IsNumber()
  @IsOptional()
  solarVoltage!: number | null;

  @IsNumber()
  @IsOptional()
  temperature!: number | null;

  @IsNumber()
  @IsOptional()
  humidity!: number | null;

  @IsNumber()
  @Min(0)
  @Max(180)
  servoAzAngle!: number;

  @IsNumber()
  @Min(0)
  @Max(180)
  servoAltAngle!: number;

  @IsNumber()
  @IsOptional()
  wifiRssi!: number | null;

  @IsNumber()
  uptimeSeconds!: number;

  @IsBoolean()
  loraEnabled!: boolean;

  @IsBoolean()
  cameraReady!: boolean;

  @IsISO8601()
  timestamp!: string;
}