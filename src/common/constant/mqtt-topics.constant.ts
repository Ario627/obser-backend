export const MQTT_TOPICS = {
  publish: {
    SERVO_COMMAND: 'observatory/servo/command',
    LORA_SEND: 'observatory/lora/send',
    CAPTURE_TRIGGER: 'observatory/capture/trigger',
  },
  subscribe: {
    HARDWARE_STATUS: 'observatory/hardware/status',
    AUTH_PIN: 'observatory/auth/pin',
    LORA_RECEIVED: 'observatory/lora/received',
    CAPTURE_RESULT: 'observatory/capture/result',
    DEVICE_STATUS: 'observatory/device/status',
  },
} as const;

export const MQTT_QOS = {
  SERVO_COMMAND: 1,
  LORA_SEND: 1,
  CAPTURE_TRIGGER: 1,
  HARDWARE_STATUS: 0,
  AUTH_PIN: 1,
  LORA_RECEIVED: 1,
  CAPTURE_RESULT: 1,
  DEVICE_STATUS: 1,
} as const;

export const MQTT_LWT = {
  TOPIC: 'observatory/device/status',
  PAYLOAD_ONLINE: 'online',
  PAYLOAD_OFFLINE: 'offline',
  QOS: 1,
  RETAIN: true,
} as const;
