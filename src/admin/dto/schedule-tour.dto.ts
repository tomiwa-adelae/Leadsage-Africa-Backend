import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class ScheduleTourDto {
  @IsDateString()
  scheduledAt: string;

  @IsOptional()
  @IsUUID()
  agentId?: string;

  @IsOptional()
  @IsString()
  adminNotes?: string;
}
