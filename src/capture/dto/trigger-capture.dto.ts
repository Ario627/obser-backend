import { IsOptional, IsIn } from "class-validator";

export class TriggerCaptureDto {
    @IsOptional()
    @IsIn(["manual", {message: "Invalid trigger type. Allowed values are 'manual' or 'automatic'."}])
    reason?: "manual";
}