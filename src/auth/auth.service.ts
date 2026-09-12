import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { EVENTS } from '../common/constant/events.constant';
import { AuthResponseDto } from './dto/auth-response.dto';
import { VerifyPinDto } from './dto/verify-pin.dto';

const PIN_CACHE_KEY = 'device:pin:active';
const ATTEMPT_CACHE_KEY = 'auth:pin:attempts';
const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 300_000;

interface JwtPayload {
  role: string;
  deviceId: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @OnEvent(EVENTS.device.PIN_RECEIVED)
  async handlePinReceived(payload: { pin: string }): Promise<void> {
    const ttlSeconds = this.configService.get<number>('jwt.pinTtlSeconds', 300);

    await this.cacheManager.set(PIN_CACHE_KEY, payload.pin, ttlSeconds * 1000);
    await this.cacheManager.del(ATTEMPT_CACHE_KEY);

    this.logger.log(`PIN received from device, cached for ${ttlSeconds}s`);
  }

  async verifyPin(dto: VerifyPinDto): Promise<AuthResponseDto> {
    const attempts = await this.registerAttempt();

    if (attempts > MAX_ATTEMPTS) {
      this.logger.warn('PIN verification blocked: too many attempts');
      throw new UnauthorizedException('Too many attempts, wait for a new PIN');
    }

    const storedPin = await this.cacheManager.get<string>(PIN_CACHE_KEY);

    if (!storedPin) {
      this.logger.warn('PIN verification failed: no PIN in cache (expired)');
      throw new UnauthorizedException('PIN expired or not received yet');
    }

    if (storedPin !== dto.pin) {
      this.logger.warn(
        `PIN verification failed: mismatch (attempt ${attempts}/${MAX_ATTEMPTS})`,
      );
      throw new UnauthorizedException('Invalid PIN');
    }

    await this.cacheManager.del(ATTEMPT_CACHE_KEY);

    const expiresIn = this.configService.get<string>('jwt.expiresIn', '24h');
    const deviceId = this.configService.get<string>(
      'mqtt.clientIdPrefix',
      'observatory',
    );

    const payload: JwtPayload = { role: 'operator', deviceId };

    const token = await this.jwtService.signAsync(payload, {
      expiresIn: expiresIn as never,
    });

    this.logger.log(`PIN verified, JWT issued for device ${deviceId}`);

    return { token, expiresIn, role: 'operator' };
  }

  async validateToken(token: string): Promise<JwtPayload | null> {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);

      return { role: payload.role, deviceId: payload.deviceId };
    } catch {
      return null;
    }
  }

  private async registerAttempt(): Promise<number> {
    const current = await this.cacheManager.get<number>(ATTEMPT_CACHE_KEY);
    const next = (current ?? 0) + 1;

    await this.cacheManager.set(ATTEMPT_CACHE_KEY, next, ATTEMPT_WINDOW_MS);

    return next;
  }
}
