import {Module} from '@nestjs/common';
import {ConfigModule} from '@nestjs/config';
import {MqttService} from './mqtt.service';
import {MqttExplorer} from './mqtt.explorer';

@Module({
    imports: [ConfigModule],
    providers: [MqttService, MqttExplorer],
    exports: [MqttService],
})
export class MqttModule {}