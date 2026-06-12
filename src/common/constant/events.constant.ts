export const EVENTS = {
  celestial: {
    POSITION_UPDATED: 'celestial.position.updated',
    ERROR: 'celestial.error',
  },
  servo: {
    COMMAND_READY: 'servo.command.ready',
  },
  pass: {
    ALERT_TRIGGERED: 'pass.alert.triggered',
  },
  device: {
    PIN_RECEIVED: 'device.pin.received',
    CONNECTED: 'device.connected',
  },
  hardware: {
    STATUS_UPDATED: 'hardware.status.updated',
  },
  lora: {
    MESSAGE_RECEIVED: 'lora.message.received',
    SEND_REQUESTED: 'lora.send.requested',
    MESSAGE_QUEUED: 'lora.message.queued',
  },
  capture: {
    TRIGGER_REQUESTED: 'capture.trigger.requested',
    RESULT_RECEIVED: 'capture.result.received',
    COMPLETED: 'capture.completed',
    ERROR: 'capture.error',
  },
  mqtt: {
    STATUS_CHANGED: 'mqtt.status.changed',
  },
  target: {
    CHANGED: 'target.changed',
  },
} as const;
