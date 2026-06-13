import { IsString, Length, Matches } from 'class-validator';

export class VerifyPinDto {
  @IsString()
  @Length(4, 6)
  @Matches(/^\d+$/, { message: 'PIN must contain only digits' })
  pin!: string;
}