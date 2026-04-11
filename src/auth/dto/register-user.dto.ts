import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterUserDto {
  @IsString()
  @MinLength(2, { message: 'First name must be at least 2 characters' })
  @MaxLength(100, { message: 'First name must not exceed 100 character' })
  firstName: string;

  @IsString()
  @MinLength(2, { message: 'Last name must be at least 2 characters' })
  @MaxLength(100, { message: 'Last name must not exceed 100 characters' })
  lastName: string;

  @IsString()
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty()
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(50, { message: 'Password must not exceed 50 characters' })
  password: string;

  @IsString()
  confirmPassword: string;

  @IsString()
  @MinLength(2, { message: 'Phone number must be valid' })
  phoneNumber: string;

  @IsBoolean()
  acceptTerms: boolean;

  @IsOptional()
  @IsEnum(['renter', 'landlord'], { message: 'Role must be renter or landlord' })
  role?: 'renter' | 'landlord';

  @IsOptional()
  @IsString()
  turnstileToken?: string;
}
