import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';

@Injectable()
export class JwtWsGuard implements CanActivate {
  private readonly logger = new Logger(JwtWsGuard.name);

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient<Socket>();

    const token = 
        client.handshake.auth?.token ||
        client.handshake.query?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

    if (!token || typeof token !== 'string') {
      this.logger.warn(`WS connection missing token from ${client.id}`);
      throw new WsException({
        message: 'Authentication token required',
        code: 'AUTH_TOKEN_MISSING',
        status: 401,
      });
    }

    try {
      const payload = await new JwtService().verifyAsync(token);
      client.data.user = payload;
      return true;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.warn(`WS invalid token from ${client.id}: ${errorMessage}`);

      let message = 'Invalid token';
      if (err instanceof Error && err.name === 'TokenExpiredError') {
      }

      throw new WsException({
        message,
        code: 'AUTH_TOKEN_INVALID',
        status: 401,
      });
    }
  }
}