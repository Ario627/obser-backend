import { Controller, Get } from "@nestjs/common";
import { HardwareService } from "./hardware.service";
import { HardwareResponseDto } from "./dto/hardware-response.dto";

@Controller('hardware')
export class HardwareController {
  constructor(private readonly hardwareService: HardwareService) {}

  @Get('status')
  getStatus(): HardwareResponseDto {
    return this.hardwareService.getStatus()!;
  }

  @Get('online')
  isOnline(): { isOnline: boolean } {
    return { isOnline: this.hardwareService.isDeviceOnline() };
  }
}