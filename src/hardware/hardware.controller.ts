import { Controller, Get, NotFoundException } from "@nestjs/common";
import { HardwareService } from "./hardware.service";
import { HardwareResponseDto } from "./dto/hardware-response.dto";

@Controller("hardware")
export class HardwareController {
    constructor(private readonly hardwareService: HardwareService) {}

    @Get("status")
    getStatus(): HardwareResponseDto {
        const status = this.hardwareService.getStatus();
        if (!status) {
            throw new NotFoundException("Hardware status not available");
        }

        return status;
    }

    @Get("online")
    isOnline() {
        return { isOnline: this.hardwareService.isDeviceOnline() };
    }

}