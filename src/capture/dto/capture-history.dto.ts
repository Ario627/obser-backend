import { CaptureResultDto } from "./capture-result.dto";
import { IsArray, IsNumber, ValidateNested, Min } from 'class-validator';
import { Type } from "class-transformer";

export class CaptureHistoryDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CaptureResultDto)
  items!: CaptureResultDto[];

  @IsNumber()
  @Min(1)
  total!: number;

  @IsNumber()
  @Min(1)
  page!: number;

  @IsNumber()
  @Min(1)
  limit!: number;
}
