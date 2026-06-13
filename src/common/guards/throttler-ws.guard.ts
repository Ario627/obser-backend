import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { ConfigService } from '@nestjs/config';

interface ThrottleRecord {
  count: number;
  resetTime: number;
}

@Injectable()
export class ThrottlerWsGuard implements CanActivate {
  private readonly logger = new Logger(ThrottlerWsGuard.name);
  private readonly records = new Map<string, ThrottleRecord>();
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(private readonly configService: ConfigService) {
    this.limit = 60;
    this.windowMs = 60000;

    setInterval(() => {
      const now = Date.now();
      for (const [key, record] of this.records.entries()) {
        if (now > record.resetTime) {
          this.records.delete(key);
        }
      }
    }, this.windowMs).unref();
  }

  canActivate(context: ExecutionContext): boolean {
    const client = context.switchToWs().getClient<Socket>();
    const clientId = client.id;
    const now = Date.now();

    const record = this.records.get(clientId);

    if (!record || now > record.resetTime) {
      this.records.set(clientId, {
        count: 1,
        resetTime: now + this.windowMs,
      });
      return true;
    }

    record.count++;

    if (record.count > this.limit) {
      this.logger.warn(
        `WS rate limit exceeded for ${clientId}: ${record.count}/${this.limit}`,
      );
      throw new WsException({
        message: `Rate limit exceeded. Maximum ${this.limit} events per minute.`,
        code: 'RATE_LIMIT_EXCEEDED',
        status: 429,
      });
    }

    return true;
  }
}