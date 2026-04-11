import { Exclude, Expose } from 'class-transformer';

export class UserResponseDto {
  @Expose()
  id: string;

  @Expose()
  email: string;

  @Expose()
  firstName: string;

  @Expose()
  lastName: string;

  @Expose()
  username: string;

  @Expose()
  image: string | null;

  @Expose()
  phoneNumber: string | null;

  @Expose()
  bio: string | null;

  @Expose()
  role: string;

  @Expose()
  onboardingCompleted: boolean;

  @Expose()
  emailVerified: boolean;

  @Expose()
  city: string | null;

  @Expose()
  address: string | null;

  @Expose()
  state: string | null;

  @Expose()
  country: string | null;

  @Expose()
  gender: string | null;

  @Expose()
  dob: string | null;

  @Expose()
  ninVerified: boolean;

  @Expose()
  createdAt: string;

  @Expose()
  updatedAt: string;

  @Expose()
  adminPosition: string | null;

  @Expose()
  accountStatus: string;

  @Exclude()
  password: string;

  @Exclude()
  refreshToken: string;

  @Exclude()
  resetOTP: string;

  @Exclude()
  resetOTPExpiry: Date;

  @Exclude()
  provider: string;
}
