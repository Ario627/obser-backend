import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TrackingLog } from '../database/entities/tracking-log.entity';
import { CelestialService } from './celestial.service';
import { CelestialScheduler } from './celestial.scheduler';
import { CelestialController } from './celestial.controller';

@Module({
    imports: [
        ConfigModule,
        HttpModule.register({
            timeout: 4000,
            maxRedirects: 3,
        }),
        TypeOrmModule.forFeature([TrackingLog]),
    ],
    providers: [CelestialService, CelestialScheduler],
    controllers: [CelestialController],
    exports: [CelestialService],
})
export class CelestialModule {}