import { IsEnum, IsNumberString, IsOptional, IsString } from 'class-validator';
import { Role } from '@prisma/client';
import { AccountStatusAction } from './update-user-status.dto';

export class GetUsersQueryDto {
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsEnum(AccountStatusAction)
  accountStatus?: AccountStatusAction;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsNumberString()
  page?: string;

  @IsOptional()
  @IsNumberString()
  limit?: string;
}
