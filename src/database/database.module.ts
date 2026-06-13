import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TrackingLog } from './entities/tracking-log.entity';
import { LoraMessage } from './entities/lora-message.entity';
import { Capture } from './entities/capture.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        console.log('=== DB CONFIG ===');
        console.log('HOST:', configService.get('DB_HOST'));
        console.log('PORT:', configService.get('DB_PORT'));
        console.log('USER:', configService.get('DB_USERNAME'));
        console.log('PASS:', configService.get('DB_PASSWORD'));
        console.log('NAME:', configService.get('DB_DATABASE'));
        console.log('=================');

        return {
          type: 'postgres',
          host: configService.get<string>('DB_HOST'),
          port: configService.get<number>('DB_PORT'),
          username: configService.get<string>('DB_USERNAME'),
          password: configService.get<string>('DB_PASSWORD'),
          database: configService.get<string>('DB_DATABASE'),
          entities: [TrackingLog, LoraMessage, Capture],
          synchronize: configService.get<string>('NODE_ENV') !== 'production',
          logging: configService.get<string>('NODE_ENV') === 'development',
        };
      },
    }),
    TypeOrmModule.forFeature([TrackingLog, LoraMessage, Capture]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
