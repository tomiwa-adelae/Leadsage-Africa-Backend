import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RespondApplicationDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
