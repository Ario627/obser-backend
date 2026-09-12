import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { ExtractJwt } from 'passport-jwt';
import { Socket } from 'socket.io';

interface JwtPayload {
  role: string;
  deviceId: string;
}

@Injectable()
export class JwtWsGuard implements CanActivate {
  private readonly logger = new Logger(JwtWsGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient<Socket>();
    const token = this.extractToken(client);

    if (!token) {
      this.logger.warn(`WS connection missing token from ${client.id}`);
      throw new WsException({
        message: 'Authentication token required',
        code: 'AUTH_TOKEN_MISSING',
        status: 401,
      });
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.get<string>('jwt.secret'),
      });

      client.data.user = payload;

      return true;
    } catch (error: unknown) {
      const reason =
        error instanceof Error && error.name === 'TokenExpiredError'
          ? 'Token expired'
          : 'Invalid token';

      this.logger.warn(`WS rejected ${client.id}: ${reason}`);

      throw new WsException({
        message: reason,
        code: 'AUTH_TOKEN_INVALID',
        status: 401,
      });
    }
  }

  private extractToken(client: Socket): string | null {
    const fromAuth = client.handshake.auth?.token;
    if (typeof fromAuth === 'string' && fromAuth.length > 0) return fromAuth;

    const fromQuery = client.handshake.query?.token;
    if (typeof fromQuery === 'string' && fromQuery.length > 0) return fromQuery;

    const header = client.handshake.headers?.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice('Bearer '.length);
    }

    return null;
  }
}