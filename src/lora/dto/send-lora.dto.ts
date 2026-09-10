import { IsString, IsNotEmpty, MaxLength } from "class-validator";

export class SendLoraDto {
  @IsString()
  @IsNotEmpty({ message: 'Message must not be empty' })
  @MaxLength(255, { message: 'LoRa message max length is 255 characters' })
  message!: string;
}