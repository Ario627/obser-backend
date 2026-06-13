import { IsString, IsIn } from 'class-validator';

export class AuthResponseDto {
  @IsString()
  token!: string;

  @IsString()
  expiresIn!: string;

  @IsString()
  @IsIn(['operator'])
  role!: string;
}
