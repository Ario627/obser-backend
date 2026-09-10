import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CaptureModule } from './capture/capture.module';
import { CelestialModule } from './celestial/celestial.module';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { HardwareModule } from './hardware/hardware.module';
import { LoraModule } from './lora/lora.module';
import { MqttModule } from './mqtt/mqtt.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      cache: true,
      expandVariables: true,
      envFilePath: ['.env', '.env.local'],
    }), 
    EventEmitterModule.forRoot({
      delimiter: '.',
      maxListeners: 25,
      verboseMemoryLeak: true,
    }),
    ScheduleModule.forRoot(),
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigModule],
      useFactory: (configuration: ConfigService) => ({
        ttl: configuration.get<number>('cache.ttlMs', 300_000),
      }),
    }),

    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => [
        {
          ttl: configService.get<number>('throttle.ttlMs', 60_000),
          limit: configService.get<number>('throttle.limit', 100),
        },
      ],
    }),
    DatabaseModule,
    MqttModule,
    AuthModule,
    CelestialModule,
    HardwareModule,
    LoraModule,
    CaptureModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}