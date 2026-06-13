import {
  Injectable,
  UnauthorizedException,
  Logger,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { EVENTS } from 'src/common/constant/events.constant'; 
import { VerifyPinDto } from './dto/verify-pin.dto';
import { AuthResponseDto } from './dto/auth-response.dto';

const PIN_CACHE_KEY = 'device:pin:active'

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
  async handlePinReceived(payload: { pin: string }) {
    const { pin } = payload;
    const ttlSeconds = this.configService.get<number>('jwt.pinTtlSeconds', 300);

    await this.cacheManager.set(PIN_CACHE_KEY, pin, ttlSeconds * 1000);

    this.logger.log(`PIN received from device, cached for ${ttlSeconds}s`);
  }

  async verifyPin(dto: VerifyPinDto): Promise<AuthResponseDto> {
    const storedPin = await this.cacheManager.get<string>(PIN_CACHE_KEY);

    if (!storedPin) {
      this.logger.warn('PIN verification failed: no PIN in cache (expired)');
      throw new UnauthorizedException('PIN expired or not received yet');
    }

    if (storedPin !== dto.pin) {
      this.logger.warn('PIN verification failed: mismatch');
      throw new UnauthorizedException('Invalid PIN');
    }

    const expiresIn = this.configService.get<string>('jwt.expiresIn', '24h');
    const deviceId = 'esp32-001';

    const payload = {
      role: 'operator',
      deviceId,
    };

    const token = await this.jwtService.signAsync(payload, {
      expiresIn: expiresIn as any,
    });

    this.logger.log(`PIN verified, JWT issued for device ${deviceId}`);

    return {
      token,
      expiresIn,
      role: 'operator',
    };
  }

  async validateToken(
    token: string,
  ): Promise<{ role: string; deviceId: string } | null> {
    try {
      const payload = await this.jwtService.verifyAsync(token);
      return {
        role: payload.role,
        deviceId: payload.deviceId,
      };
    } catch {
      return null;
    }
  }
}