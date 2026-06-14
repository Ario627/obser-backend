import { IsEnum, IsString, IsNotEmpty } from 'class-validator';
import { CelestialType } from '../../common/types';

export class TrackTargetDto {
  @IsEnum(CelestialType, {
    message: 'type must be one of: iss, satellite, planet, moon, sun, star',
  })
  type!: CelestialType;

  @IsString()
  @IsNotEmpty({ message: 'id must not be empty' })
  id!: string;
}
