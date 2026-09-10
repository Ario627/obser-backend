import {
  IsNumber,
  IsString,
  IsOptional,
  IsISO8601,
  IsIn,
} from 'class-validator';

export class LoraMessageDto {
  @IsNumber()
  id!: number;

  @IsString()
  @IsIn(['inbound', 'outbound'])
  direction!: string;

  @IsString()
  message!: string;

  @IsNumber()
  @IsOptional()
  rssi!: number | null;
    
  @IsNumber()
  @IsOptional()
  snr!: number | null;

  @IsISO8601()
  timestamp!: string;
}
