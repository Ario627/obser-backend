import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Capture } from './entities/capture.entity';
import { LoraMessage } from './entities/lora-message.entity';
import { TrackingLog } from './entities/tracking-log.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('database.host', 'localhost'),
        port: configService.get<number>('database.port', 5432),
        username: configService.get<string>('database.username', 'postgres'),
        password: configService.get<string>('database.password', ''),
        database: configService.get<string>('database.name', 'observatory'),
        entities: [TrackingLog, LoraMessage, Capture],
        synchronize: configService.get<boolean>('database.synchronize', true),
        logging: configService.get<boolean>('database.logging', false),
      }),
    }),
    TypeOrmModule.forFeature([TrackingLog, LoraMessage, Capture]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
