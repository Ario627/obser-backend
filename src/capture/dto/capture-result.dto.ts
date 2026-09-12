import {
  IsNumber,
  IsString,
  IsOptional,
  IsISO8601,
  IsIn,
} from 'class-validator';

export class CaptureResultDto {
  @IsNumber()
  id!: number;

  @IsString()
  filename!: string;

  @IsString()
  @IsOptional()
  objectName!: string | null;

  @IsNumber()
  @IsOptional()
  azimuth!: number | null;

  @IsNumber()
  @IsOptional()
  altitude!: number | null;

  @IsString()
  @IsIn(['auto', 'manual'])
  triggerReason!: 'auto' | 'manual';

  @IsISO8601()
  timestamp!: string;

  @IsString()
  imageUrl!: string;
}
