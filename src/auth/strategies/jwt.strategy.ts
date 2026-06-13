import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {PassportStrategy} from '@nestjs/passport';
import {ExtractJwt, Strategy} from "passport-jwt"

interface JwtPayload {
  role: string;
  deviceId: string;
  iat: number;
  exp: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret')!,
    });
  }

  async validate(payload: JwtPayload) {
    if (payload.role !== 'operator')
      throw new UnauthorizedException('invalid token payload ');

    return {
      role: payload.role,
      deviceId: payload.deviceId,
    };
  }
}