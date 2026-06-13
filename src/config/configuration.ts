export default () => ({
  server: {
    port: parseInt(process.env.PORT || '3001', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info',
  },
  frontend: {
    url: process.env.FRONTEND_URL || 'http://localhost:3000',
  },
  astro: {
    serviceUrl: process.env.ASTRO_SERVICE_URL || 'http://localhost:8000',
    pollIntervalMs: parseInt(process.env.ASTRO_POLL_INTERVAL_MS || '5000', 10),
  },
  mqtt: {
    url: process.env.MQTT_URL || 'mqtt://localhost:1883',
    username: process.env.MQTT_USERNAME || '',
    password: process.env.MQTT_PASSWORD || '',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'default-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    pinTtlSeconds: parseInt(process.env.PIN_TTL_SECONDS || '300', 10),
  },
  database: {
    path: process.env.DATABASE_PATH || './observatory.sqlite',
  },
  uploads: {
    path: process.env.UPLOADS_PATH || './uploads/captures',
  },
  observer: {
    latitude: parseFloat(process.env.OBSERVER_LAT || '-7.4039'),
    longitude: parseFloat(process.env.OBSERVER_LON || '109.2401'),
    altitude: parseFloat(process.env.OBSERVER_ALT || '75'),
  },
  capture: {
    cooldownMs: parseInt(process.env.CAPTURE_COOLDOWN_MS || '30000', 10),
  },
  retention: {
    trackingLogDays: parseInt(
      process.env.TRACKING_LOG_RETENTION_DAYS || '30',
      10,
    ),
    loraMessageDays: parseInt(
      process.env.LORA_MESSAGE_RETENTION_DAYS || '90',
      10,
    ),
  },
});