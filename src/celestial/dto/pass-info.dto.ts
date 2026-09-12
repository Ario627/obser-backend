import { IsString, IsNumber, IsOptional, IsISO8601 } from 'class-validator';

export class PassInfoDto {
  @IsString()
  name!: string;

  @IsISO8601()
  @IsOptional()
  nextAos!: string | null;

  @IsISO8601()
  @IsOptional()
  nextLos!: string | null;

  @IsNumber()
  @IsOptional()
  durationSeconds!: number | null;

  @IsNumber()
  @IsOptional()
  maxAltitude!: number | null;

  @IsNumber()
  @IsOptional()
  aosAzimuth!: number | null;

  @IsNumber()
  @IsOptional()
  losAzimuth!: number | null;
}
