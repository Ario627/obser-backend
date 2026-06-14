import { IsString, IsNumber, IsOptional, IsISO8601 } from 'class-validator';

export class PassInfoDto {
  @IsString()
  objectName!: string;

  @IsISO8601()
  @IsOptional()
  nextAos!: string | null;

  @IsISO8601()
  @IsOptional()
  nextLos!: string | null;

  @IsNumber()
  @IsOptional()
  duration!: number | null;

  @IsNumber()
  @IsOptional()
  maxAltitude!: number | null;
}
