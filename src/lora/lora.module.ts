import { Module } from "@nestjs/common";
import { LoraService } from "./lora.service";
import { LoraController } from "./lora.controller";
import { TypeOrmModule } from "@nestjs/typeorm";
import { LoraMessage } from "src/database/entities/lora-message.entity";

@Module({
    imports: [TypeOrmModule.forFeature([LoraMessage])],
    controllers: [LoraController],
    providers: [LoraService],
    exports: [LoraService],
})
export class LoraModule {}