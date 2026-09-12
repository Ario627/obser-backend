import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

interface JwtPayload {
  role: string;
  deviceId: string;
  iat: number;
  exp: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    const secret = configService.get<string>('jwt.secret');

    if (!secret) {
      throw new Error('JWT secret is not configured');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload): Promise<Omit<JwtPayload, 'iat' | 'exp'>> {
    if (payload.role !== 'operator') {
      throw new UnauthorizedException('Invalid token payload: bad role');
    }

    if (typeof payload.deviceId !== 'string' || payload.deviceId.length === 0) {
      throw new UnauthorizedException(
        'Invalid token payload: missing deviceId',
      );
    }

    return { role: payload.role, deviceId: payload.deviceId };
  }
}
