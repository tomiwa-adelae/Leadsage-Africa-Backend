import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum AccountStatusAction {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  BANNED = 'BANNED',
}

export class UpdateUserStatusDto {
  @IsEnum(AccountStatusAction)
  status: AccountStatusAction;

  @IsString()
  @IsOptional()
  reason?: string;
}
