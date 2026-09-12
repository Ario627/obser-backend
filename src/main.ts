import { Logger, LogLevel, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestApplication } from '@nestjs/core';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptor/logging.interceptor';
import { TransformInterceptor } from './common/interceptor/transform.interceptor';
import helmet from 'helmet';

const LOG_LEVELS: readonly LogLevel[] = [
  'error',
  'warn',
  'log',
  'debug',
  'verbose',
];

function resolveLogLevels(level: string): LogLevel[] {
  const index = LOG_LEVELS.indexOf(level as LogLevel);
  return index === -1 ? [...LOG_LEVELS] : LOG_LEVELS.slice(0, index + 1);
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestApplication>(AppModule, {
    bufferLogs: true,
  });

  const config = app.get(ConfigService);

  app.useLogger(
    resolveLogLevels(config.get<string>('server.logLevel', 'debug')),
  );

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.enableCors({
    origin: config.get<string[]>('cors.origins', []),
    credentials: config.get<boolean>('cors.credentials', true),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  app.setGlobalPrefix('api', { exclude: ['health'] });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TransformInterceptor(),
  );

  app.enableShutdownHooks();

  const port = config.get<number>('server.port', 3001);
  await app.listen(port, '0.0.0.0');

  Logger.log(`Server is running on port ${port}`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  Logger.error(
    `Application failed to start: ${message}`,
    undefined,
    'Bootstrap',
  );
  process.exitCode = 1;
});
