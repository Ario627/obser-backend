const parseNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback
}

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

const parseList = (value: string | undefined, fallback: string[]): string[] => {
  const items = value
    ?.split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

    return items && items.length > 0 ? items : fallback;
}

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

const configuration = () => ({
  server: {
    port: parseNumber(process.env.PORT, 3001),
    nodeEnv,
    isProduction,
    logLevel: (
      process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug')
    ).toLowerCase(),
  },
  cors: {
    origins: parseList(process.env.CORS_ORIGINS, [frontendUrl]),
    credentials: parseBoolean(process.env.CORS_CREDENTIALS, true),
  },
  frontend: {
    url: frontendUrl,
  },
  astro: {
    serviceUrl: (
      process.env.ASTRO_SERVICE_URL ?? 'http://localhost:8000'
    ).replace(/\/+$/, ''),
    pollIntervalMs: parseNumber(process.env.ASTRO_POLL_INTERVAL_MS, 5_000),
    requestTimeoutMs: parseNumber(process.env.ASTRO_REQUEST_TIMEOUT_MS, 4_000),
    failureThreshold: parseNumber(process.env.ASTRO_FAILURE_THRESHOLD, 3),
    passAlertMinutes: parseNumber(process.env.ASTRO_PASS_ALERT_MINUTES, 15),
  },
  mqtt: {
    url: process.env.MQTT_URL ?? 'mqtt://localhost:1883',
    username: process.env.MQTT_USERNAME || undefined,
    password: process.env.MQTT_PASSWORD || undefined,
    clientIdPrefix: process.env.MQTT_CLIENT_ID ?? 'nestjs-backend',
    reconnectPeriodMs: parseNumber(process.env.MQTT_RECONNECT_MS, 5_000),
    connectTimeoutMs: parseNumber(process.env.MQTT_CONNECT_TIMEOUT_MS, 10_000),
    keepaliveSeconds: parseNumber(process.env.MQTT_KEEPALIVE_SECONDS, 30),
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? 'default-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '24h',
    pinTtlSeconds: parseNumber(process.env.PIN_TTL_SECONDS, 300),
  },
  cache: {
    ttlMs: parseNumber(process.env.CACHE_TTL_MS, 300_000),
  },
  throttle: {
    ttlMs: parseNumber(process.env.THROTTLE_TTL_MS, 60_000),
    limit: parseNumber(process.env.THROTTLE_LIMIT, 100),
    authLimit: parseNumber(process.env.THROTTLE_AUTH_LIMIT, 10),
  },
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseNumber(process.env.DB_PORT, 5432),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? '',
    name: process.env.DB_DATABASE ?? 'observatory',
    synchronize: parseBoolean(process.env.DB_SYNCHRONIZE, !isProduction),
    logging: parseBoolean(process.env.DB_LOGGING, !isProduction),
  },
  uploads: {
    path: process.env.UPLOADS_PATH ?? './uploads/captures',
    maxImageBytes: parseNumber(
      process.env.UPLOADS_MAX_IMAGE_BYTES,
      2 * 1024 * 1024,
    ),
  },
  observer: {
    latitude: parseNumber(process.env.OBSERVER_LAT, -6.9667),
    longitude: parseNumber(process.env.OBSERVER_LON, 110.4167),
    altitude: parseNumber(process.env.OBSERVER_ALT, 6),
  },
  capture: {
    cooldownMs: parseNumber(process.env.CAPTURE_COOLDOWN_MS, 30_000),
    minAltitude: parseNumber(process.env.CAPTURE_MIN_ALTITUDE, 10),
  },
  retention: {
    trackingLogDays: parseNumber(process.env.TRACKING_LOG_RETENTION_DAYS, 30),
    loraMessageDays: parseNumber(process.env.LORA_MESSAGE_RETENTION_DAYS, 90),
  },
});

export type AppConfig = ReturnType<typeof configuration>;
export default configuration;