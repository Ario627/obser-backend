import { Module } from '@nestjs/common';
import { MqttExplorer } from './mqtt.explorer';
import { MqttService } from './mqtt.service';

@Module({
  providers: [MqttExplorer, MqttService],
  exports: [MqttService],
})
export class MqttModule {}
