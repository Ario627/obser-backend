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
    STATUS_BROADCAST: 'hardware.status.broadcast',
  },
  lora: {
    MESSAGE_RECEIVED: 'lora.message.received',
    MESSAGE_BROADCAST: 'lora.message.broadcast',
    SEND_REQUESTED: 'lora.send.requested',
    MESSAGE_QUEUED: 'lora.message.queued',
  },
  capture: {
    TRIGGER_REQUESTED: 'capture.trigger.requested',
    TRIGGER_ACCEPTED: 'capture.trigger.accepted',
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
