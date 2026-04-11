import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateTourRequestDto {
  @IsUUID()
  listingId: string;

  @IsOptional()
  @IsDateString()
  preferredDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
