import { IsString, IsNumber, IsISO8601 } from 'class-validator';

export class LoraReceivedDto {
  @IsString()
  message!: string;

  @IsNumber()
  rssi!: number;

  @IsNumber()
  snr!: number;

  @IsISO8601()
  timestamp!: string;
}