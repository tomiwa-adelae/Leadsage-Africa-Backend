import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SetNewPasswordDto {
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(50, { message: 'Password must not exceed 50 characters' })
  newPassword: string;

  @IsString()
  confirmPassword: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6, { message: 'Invalid OTP' })
  @MaxLength(6, { message: 'Invalid OTP' })
  otp: string;

  @IsString()
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty()
  email: string;
}
