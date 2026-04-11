import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class VerifyCodeDto {
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
