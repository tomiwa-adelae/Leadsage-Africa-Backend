import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export enum AdminPositionInput {
  ADMIN = 'ADMIN',
  MODERATOR = 'MODERATOR',
}

export class CreateAdminDto {
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsEnum(AdminPositionInput)
  position: AdminPositionInput;

  @IsOptional()
  @IsString({ each: true })
  modules?: string[];
}
