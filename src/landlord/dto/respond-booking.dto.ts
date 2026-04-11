import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RespondBookingDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
