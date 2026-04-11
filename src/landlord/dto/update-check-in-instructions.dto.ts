import { IsOptional, IsString, IsUrl } from 'class-validator';

export class UpdateCheckInInstructionsDto {
  @IsOptional() @IsString() keyHandover?: string;
  @IsOptional() @IsString() accessCode?: string;
  @IsOptional() @IsString() checkInWindow?: string;
  @IsOptional() @IsString() checkOutTime?: string;
  @IsOptional() @IsString() directions?: string;
  @IsOptional() @IsString() mapLink?: string;
  @IsOptional() @IsString() wifiName?: string;
  @IsOptional() @IsString() wifiPassword?: string;
  @IsOptional() @IsString() houseRules?: string;
  @IsOptional() @IsString() emergencyContact?: string;
  @IsOptional() @IsString() generatorInfo?: string;
  @IsOptional() @IsString() waterInfo?: string;
  @IsOptional() @IsString() securityInfo?: string;
}
