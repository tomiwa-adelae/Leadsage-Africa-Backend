import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AdminPositionInput } from './create-admin.dto';

export class UpdateAdminDto {
  @IsOptional()
  @IsEnum(AdminPositionInput)
  position?: AdminPositionInput;

  @IsOptional()
  @IsString({ each: true })
  modules?: string[];
}
